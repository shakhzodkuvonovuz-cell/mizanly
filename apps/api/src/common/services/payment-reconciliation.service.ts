import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import Stripe from 'stripe';
import Redis from 'ioredis';
import { PrismaService } from '../../config/prisma.service';

/**
 * Payment Reconciliation Service
 *
 * Cron-driven safety net that detects stuck payments by comparing local DB state
 * against Stripe API. Covers all 5 payment flows:
 *   1. Tips (PaymentIntent-based)
 *   2. Orders (PaymentIntent-based)
 *   3. Premium Subscriptions (PaymentIntent-based, stored as stripeSubId)
 *   4. Membership Subscriptions (Stripe Subscription-based)
 *   5. Coin balance integrity audit
 *
 * Design principles:
 * - Each method is independent: one failure does not block others
 * - Batched processing (50 items) to respect Stripe rate limits
 * - 100ms delay between Stripe API calls
 * - Every state correction logged to Sentry as captureMessage (expected corrections)
 * - All Stripe calls wrapped in try/catch: if Stripe is down, skip and continue
 */
@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);
  private stripe: Stripe;
  private readonly stripeAvailable: boolean;

  constructor(
    private prisma: PrismaService,
    @Inject('REDIS') private redis: Redis,
    private configService: ConfigService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.stripeAvailable = !!secretKey;
    if (!secretKey) {
      this.logger.warn('STRIPE_SECRET_KEY not set — payment reconciliation will skip Stripe queries');
    }
    this.stripe = new Stripe(secretKey || '', {
      apiVersion: '2025-02-24.acacia' as Stripe.LatestApiVersion,
    });
  }

  /**
   * Sleep helper for rate-limiting Stripe API calls.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Runs daily at 6 AM UTC — reconciles all payment flows.
   * Each sub-method is independent; failures in one do not block others.
   */
  @Cron('0 6 * * *')
  async reconcileAll(): Promise<{
    tips: number;
    orders: number;
    premiumSubscriptions: number;
    membershipSubscriptions: number;
    coinBalanceDiscrepancies: number;
  }> {
    this.logger.log('Payment reconciliation cron started');

    const tips = await this.reconcileTips();
    const orders = await this.reconcileOrders();
    const premiumSubscriptions = await this.reconcilePremiumSubscriptions();
    const membershipSubscriptions = await this.reconcileMembershipSubscriptions();
    const coinBalanceDiscrepancies = await this.auditCoinBalances();

    const summary = { tips, orders, premiumSubscriptions, membershipSubscriptions, coinBalanceDiscrepancies };
    this.logger.log(`Payment reconciliation completed: ${JSON.stringify(summary)}`);

    return summary;
  }

  /**
   * Reconcile tips stuck in 'pending' for more than 24 hours.
   *
   * For each stuck tip with a stripePaymentId:
   * - PI succeeded  -> complete the tip (credit diamonds to receiver)
   * - PI failed/cancelled -> mark tip as failed
   * - PI still processing -> skip (still in flight)
   * - No stripePaymentId -> mark as failed (orphaned)
   */
  async reconcileTips(): Promise<number> {
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const stuckTips = await this.prisma.tip.findMany({
        where: {
          status: 'pending',
          createdAt: { lt: cutoff },
        },
        take: 50,
        select: {
          id: true,
          stripePaymentId: true,
          receiverId: true,
          amount: true,
          platformFee: true,
          createdAt: true,
        },
      });

      if (stuckTips.length === 0) return 0;

      this.logger.log(`Found ${stuckTips.length} stuck pending tip(s) older than 24h`);
      let reconciled = 0;

      for (const tip of stuckTips) {
        // No Stripe PI ID -> orphaned, mark as failed
        if (!tip.stripePaymentId) {
          await this.prisma.tip.update({
            where: { id: tip.id },
            data: { status: 'failed' },
          });
          Sentry.captureMessage(
            `Payment reconciliation: tip ${tip.id} marked as failed (no stripePaymentId, stuck since ${tip.createdAt.toISOString()})`,
            'info',
          );
          reconciled++;
          continue;
        }

        if (!this.stripeAvailable) continue;

        try {
          const pi = await this.stripe.paymentIntents.retrieve(tip.stripePaymentId);
          await this.sleep(100);

          if (pi.status === 'succeeded') {
            // Complete the tip: credit receiver's diamond balance
            await this.prisma.$transaction(async (tx) => {
              await tx.tip.update({
                where: { id: tip.id },
                data: { status: 'completed' },
              });

              if (tip.receiverId) {
                const netAmount = Number(tip.amount) - Number(tip.platformFee);
                const diamondsEarned = Math.floor(netAmount / 0.007);

                if (diamondsEarned > 0) {
                  await tx.coinBalance.upsert({
                    where: { userId: tip.receiverId },
                    update: { diamonds: { increment: diamondsEarned } },
                    create: { userId: tip.receiverId, coins: 0, diamonds: diamondsEarned },
                  });
                }
              }
            });

            Sentry.captureMessage(
              `Payment reconciliation: tip ${tip.id} completed (PI ${tip.stripePaymentId} succeeded, was stuck since ${tip.createdAt.toISOString()})`,
              'info',
            );
            reconciled++;
          } else if (
            pi.status === 'canceled' ||
            pi.status === 'requires_payment_method'
          ) {
            await this.prisma.tip.update({
              where: { id: tip.id },
              data: { status: 'failed' },
            });

            Sentry.captureMessage(
              `Payment reconciliation: tip ${tip.id} marked as failed (PI ${tip.stripePaymentId} status=${pi.status})`,
              'info',
            );
            reconciled++;
          }
          // else: still 'processing' or 'requires_action' -> skip, not truly stuck yet
        } catch (stripeError) {
          this.logger.warn(
            `Stripe API error for tip ${tip.id} (PI: ${tip.stripePaymentId}): ${stripeError instanceof Error ? stripeError.message : String(stripeError)}`,
          );
          // Skip this item, continue with next
        }
      }

      return reconciled;
    } catch (error) {
      this.logger.error('reconcileTips failed', error instanceof Error ? error.message : error);
      Sentry.captureException(error);
      return 0;
    }
  }

  /**
   * Reconcile orders stuck in PENDING for more than 24 hours.
   *
   * For each stuck order with a stripePaymentId:
   * - PI succeeded  -> mark order as PAID
   * - PI failed/cancelled -> cancel order, restore product stock
   * - PI still processing -> skip
   * - No stripePaymentId -> cancel order, restore stock
   */
  async reconcileOrders(): Promise<number> {
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const stuckOrders = await this.prisma.order.findMany({
        where: {
          status: 'PENDING',
          createdAt: { lt: cutoff },
        },
        take: 50,
        select: {
          id: true,
          stripePaymentId: true,
          productId: true,
          quantity: true,
          createdAt: true,
        },
      });

      if (stuckOrders.length === 0) return 0;

      this.logger.log(`Found ${stuckOrders.length} stuck PENDING order(s) older than 24h`);
      let reconciled = 0;

      for (const order of stuckOrders) {
        // No Stripe PI ID -> orphaned, cancel + restore stock
        if (!order.stripePaymentId) {
          await this.cancelOrderAndRestoreStock(order.id, order.productId, order.quantity);
          Sentry.captureMessage(
            `Payment reconciliation: order ${order.id} cancelled (no stripePaymentId, stuck since ${order.createdAt.toISOString()})`,
            'info',
          );
          reconciled++;
          continue;
        }

        if (!this.stripeAvailable) continue;

        try {
          const pi = await this.stripe.paymentIntents.retrieve(order.stripePaymentId);
          await this.sleep(100);

          if (pi.status === 'succeeded') {
            await this.prisma.order.update({
              where: { id: order.id },
              data: { status: 'PAID' },
            });

            Sentry.captureMessage(
              `Payment reconciliation: order ${order.id} marked as PAID (PI ${order.stripePaymentId} succeeded, was stuck since ${order.createdAt.toISOString()})`,
              'info',
            );
            reconciled++;
          } else if (
            pi.status === 'canceled' ||
            pi.status === 'requires_payment_method'
          ) {
            await this.cancelOrderAndRestoreStock(order.id, order.productId, order.quantity);

            Sentry.captureMessage(
              `Payment reconciliation: order ${order.id} cancelled + stock restored (PI ${order.stripePaymentId} status=${pi.status})`,
              'info',
            );
            reconciled++;
          }
          // else: still processing -> skip
        } catch (stripeError) {
          this.logger.warn(
            `Stripe API error for order ${order.id} (PI: ${order.stripePaymentId}): ${stripeError instanceof Error ? stripeError.message : String(stripeError)}`,
          );
        }
      }

      return reconciled;
    } catch (error) {
      this.logger.error('reconcileOrders failed', error instanceof Error ? error.message : error);
      Sentry.captureException(error);
      return 0;
    }
  }

  /**
   * Helper: cancel an order and restore product stock atomically.
   */
  private async cancelOrderAndRestoreStock(orderId: string, productId: string, quantity: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED' },
      });

      await tx.product.update({
        where: { id: productId },
        data: { stock: { increment: quantity } },
      });
    });
  }

  /**
   * Reconcile PremiumSubscriptions stuck in PENDING for more than 24 hours.
   *
   * Note: stripeSubId is actually a PaymentIntent ID (pi_xxx), not a Subscription ID.
   * For each stuck subscription:
   * - PI succeeded  -> activate subscription, set endDate
   * - PI failed/cancelled -> cancel subscription
   * - PI still processing -> skip
   * - No stripeSubId -> cancel (orphaned)
   */
  async reconcilePremiumSubscriptions(): Promise<number> {
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const stuckSubs = await this.prisma.premiumSubscription.findMany({
        where: {
          status: 'PENDING',
          createdAt: { lt: cutoff },
        },
        take: 50,
        select: {
          id: true,
          userId: true,
          stripeSubId: true,
          plan: true,
          createdAt: true,
        },
      });

      if (stuckSubs.length === 0) return 0;

      this.logger.log(`Found ${stuckSubs.length} stuck PENDING premium subscription(s) older than 24h`);
      let reconciled = 0;

      for (const sub of stuckSubs) {
        // No stripeSubId -> orphaned, cancel
        if (!sub.stripeSubId) {
          await this.prisma.premiumSubscription.update({
            where: { id: sub.id },
            data: { status: 'CANCELLED' },
          });
          Sentry.captureMessage(
            `Payment reconciliation: premium subscription ${sub.id} (user ${sub.userId}) cancelled (no stripeSubId, stuck since ${sub.createdAt.toISOString()})`,
            'info',
          );
          reconciled++;
          continue;
        }

        if (!this.stripeAvailable) continue;

        try {
          // stripeSubId is actually a PaymentIntent ID
          const pi = await this.stripe.paymentIntents.retrieve(sub.stripeSubId);
          await this.sleep(100);

          if (pi.status === 'succeeded') {
            const endDate = new Date();
            endDate.setMonth(endDate.getMonth() + (sub.plan === 'YEARLY' ? 12 : 1));

            await this.prisma.premiumSubscription.update({
              where: { id: sub.id },
              data: { status: 'ACTIVE', endDate },
            });

            Sentry.captureMessage(
              `Payment reconciliation: premium subscription ${sub.id} (user ${sub.userId}) activated (PI ${sub.stripeSubId} succeeded, was stuck since ${sub.createdAt.toISOString()})`,
              'info',
            );
            reconciled++;
          } else if (
            pi.status === 'canceled' ||
            pi.status === 'requires_payment_method'
          ) {
            await this.prisma.premiumSubscription.update({
              where: { id: sub.id },
              data: { status: 'CANCELLED' },
            });

            Sentry.captureMessage(
              `Payment reconciliation: premium subscription ${sub.id} (user ${sub.userId}) cancelled (PI ${sub.stripeSubId} status=${pi.status})`,
              'info',
            );
            reconciled++;
          }
          // else: still processing -> skip
        } catch (stripeError) {
          this.logger.warn(
            `Stripe API error for premium subscription ${sub.id} (PI: ${sub.stripeSubId}): ${stripeError instanceof Error ? stripeError.message : String(stripeError)}`,
          );
        }
      }

      return reconciled;
    } catch (error) {
      this.logger.error('reconcilePremiumSubscriptions failed', error instanceof Error ? error.message : error);
      Sentry.captureException(error);
      return 0;
    }
  }

  /**
   * Reconcile MembershipSubscriptions with expired endDate but still 'active' status.
   *
   * For each such subscription:
   * - Look up Stripe subscription via Redis mapping (subscription:internal:{id})
   * - If Stripe says cancelled -> mark as cancelled locally
   * - If Stripe says active with later period_end -> update our endDate
   * - If can't find in Stripe (or no mapping) -> mark as expired
   */
  async reconcileMembershipSubscriptions(): Promise<number> {
    try {
      const now = new Date();

      const expiredActive = await this.prisma.membershipSubscription.findMany({
        where: {
          status: 'active',
          endDate: { lt: now },
        },
        take: 50,
        select: {
          id: true,
          userId: true,
          tierId: true,
          endDate: true,
        },
      });

      if (expiredActive.length === 0) return 0;

      this.logger.log(`Found ${expiredActive.length} membership subscription(s) with expired endDate but active status`);
      let reconciled = 0;

      for (const sub of expiredActive) {
        // Try to find Stripe subscription ID via Redis mapping
        const stripeSubId = await this.redis.get(`subscription:internal:${sub.id}`);

        if (!stripeSubId || !this.stripeAvailable) {
          // No Stripe mapping or Stripe unavailable -> mark as expired
          await this.prisma.membershipSubscription.update({
            where: { id: sub.id },
            data: { status: 'expired' },
          });

          Sentry.captureMessage(
            `Payment reconciliation: membership subscription ${sub.id} (user ${sub.userId}) marked as expired (${stripeSubId ? 'Stripe unavailable' : 'no Stripe mapping'}, endDate was ${sub.endDate?.toISOString()})`,
            'info',
          );
          reconciled++;
          continue;
        }

        try {
          const stripeSub = await this.stripe.subscriptions.retrieve(stripeSubId);
          await this.sleep(100);

          if (stripeSub.status === 'canceled' || stripeSub.status === 'unpaid') {
            await this.prisma.membershipSubscription.update({
              where: { id: sub.id },
              data: { status: 'cancelled' },
            });

            Sentry.captureMessage(
              `Payment reconciliation: membership subscription ${sub.id} (user ${sub.userId}) marked as cancelled (Stripe sub ${stripeSubId} status=${stripeSub.status})`,
              'info',
            );
            reconciled++;
          } else if (stripeSub.status === 'active' || stripeSub.status === 'past_due') {
            // Stripe says it's still active with a later period_end — update our endDate
            const periodEnd = 'current_period_end' in stripeSub
              ? (stripeSub.current_period_end as number) : undefined;

            if (periodEnd) {
              const newEndDate = new Date(periodEnd * 1000);
              const mappedStatus = stripeSub.status === 'past_due' ? 'past_due' : 'active';

              await this.prisma.membershipSubscription.update({
                where: { id: sub.id },
                data: { endDate: newEndDate, status: mappedStatus },
              });

              Sentry.captureMessage(
                `Payment reconciliation: membership subscription ${sub.id} (user ${sub.userId}) endDate extended to ${newEndDate.toISOString()} (Stripe sub ${stripeSubId} still ${stripeSub.status})`,
                'info',
              );
              reconciled++;
            }
          } else {
            // Paused, trialing, incomplete, etc. -> mark as expired for safety
            await this.prisma.membershipSubscription.update({
              where: { id: sub.id },
              data: { status: 'expired' },
            });

            Sentry.captureMessage(
              `Payment reconciliation: membership subscription ${sub.id} (user ${sub.userId}) marked as expired (Stripe sub ${stripeSubId} status=${stripeSub.status})`,
              'info',
            );
            reconciled++;
          }
        } catch (stripeError) {
          // Stripe error (404 = subscription deleted, or network error)
          // Mark as expired since we can't verify
          await this.prisma.membershipSubscription.update({
            where: { id: sub.id },
            data: { status: 'expired' },
          });

          Sentry.captureMessage(
            `Payment reconciliation: membership subscription ${sub.id} (user ${sub.userId}) marked as expired (Stripe lookup failed: ${stripeError instanceof Error ? stripeError.message : String(stripeError)})`,
            'warning',
          );
          reconciled++;
        }
      }

      return reconciled;
    } catch (error) {
      this.logger.error('reconcileMembershipSubscriptions failed', error instanceof Error ? error.message : error);
      Sentry.captureException(error);
      return 0;
    }
  }

  /**
   * Audit coin balances for integrity.
   *
   * Compares CoinBalance.coins against the sum of all CoinTransaction amounts
   * for each user. Flags discrepancies via Sentry but does NOT auto-fix
   * (financial data requires manual review).
   *
   * Returns the number of discrepancies found.
   */
  async auditCoinBalances(): Promise<number> {
    try {
      // Check ALL balances — not just coins > 0.
      // Users whose balance was incorrectly zeroed by a bug need detection too.
      // Also audit diamonds (tips/gifts produce diamond income, cashout deducts).
      const balances = await this.prisma.coinBalance.findMany({
        take: 100,
        select: {
          userId: true,
          coins: true,
          diamonds: true,
        },
      });

      if (balances.length === 0) return 0;

      let discrepancies = 0;

      for (const balance of balances) {
        // ── Coin audit ──
        // Incoming: PURCHASE, REWARD, REFUND (positive amounts)
        const coinIncoming = await this.prisma.coinTransaction.aggregate({
          where: {
            userId: balance.userId,
            type: { in: ['PURCHASE', 'REWARD', 'REFUND'] },
          },
          _sum: { amount: true },
        });

        // Outgoing: GIFT_SENT, TIP_SENT (stored as negative amounts in some flows, positive in others)
        const coinOutgoing = await this.prisma.coinTransaction.aggregate({
          where: {
            userId: balance.userId,
            type: { in: ['GIFT_SENT', 'TIP_SENT'] },
          },
          _sum: { amount: true },
        });

        const expectedCoins = (coinIncoming._sum.amount ?? 0) + (coinOutgoing._sum.amount ?? 0);

        if (expectedCoins !== balance.coins) {
          discrepancies++;
          Sentry.captureMessage(
            `Coin balance discrepancy: userId=${balance.userId}, stored=${balance.coins}, expected=${expectedCoins} (diff=${balance.coins - expectedCoins})`,
            'warning',
          );
          this.logger.warn(
            `Coin balance discrepancy for user ${balance.userId}: stored=${balance.coins}, computed=${expectedCoins}`,
          );
        }

        // ── Diamond audit ──
        // Incoming: GIFT_RECEIVED, TIP_RECEIVED (diamond credits from tips/gifts)
        const diamondIncoming = await this.prisma.coinTransaction.aggregate({
          where: {
            userId: balance.userId,
            type: { in: ['GIFT_RECEIVED', 'TIP_RECEIVED'] },
          },
          _sum: { amount: true },
        });

        // Outgoing: CASHOUT (diamond deductions)
        const diamondOutgoing = await this.prisma.coinTransaction.aggregate({
          where: {
            userId: balance.userId,
            type: 'CASHOUT',
          },
          _sum: { amount: true },
        });

        const expectedDiamonds = (diamondIncoming._sum.amount ?? 0) + (diamondOutgoing._sum.amount ?? 0);

        if (expectedDiamonds !== balance.diamonds) {
          discrepancies++;
          Sentry.captureMessage(
            `Diamond balance discrepancy: userId=${balance.userId}, stored=${balance.diamonds}, expected=${expectedDiamonds} (diff=${balance.diamonds - expectedDiamonds})`,
            'warning',
          );
          this.logger.warn(
            `Diamond balance discrepancy for user ${balance.userId}: stored=${balance.diamonds}, computed=${expectedDiamonds}`,
          );
        }
      }

      if (discrepancies > 0) {
        this.logger.warn(`Coin/diamond balance audit found ${discrepancies} discrepancy(ies) — logged to Sentry for manual review`);
      } else {
        this.logger.log(`Coin/diamond balance audit: ${balances.length} balance(s) checked, all consistent`);
      }

      return discrepancies;
    } catch (error) {
      this.logger.error('auditCoinBalances failed', error instanceof Error ? error.message : error);
      Sentry.captureException(error);
      return 0;
    }
  }
}
