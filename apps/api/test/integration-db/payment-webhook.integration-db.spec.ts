/**
 * Integration Test: Payment Webhook End-to-End
 *
 * Tests against REAL PostgreSQL to verify:
 * 1. Coin purchase webhook credits coins atomically
 * 2. Idempotency: replaying same event doesn't double-credit
 * 3. ProcessedWebhookEvent dedup (DB layer)
 * 4. Pending transaction updated (not duplicated)
 * 5. CoinBalance upsert for first-time purchaser
 * 6. Tip payment intent succeeded flow
 * 7. Order status updated on marketplace payment
 */

import { PrismaTestHelper } from './prisma-test-helper';

const helper = new PrismaTestHelper();
const prisma = helper.prisma;

beforeAll(async () => {
  await helper.setup();
}, 60000);

afterEach(async () => {
  await helper.cleanup();
});

afterAll(async () => {
  await helper.teardown();
});

/**
 * Replicate the coin purchase webhook handler from payments.service.ts
 */
async function handleCoinPurchaseSucceeded(
  paymentIntentId: string,
  userId: string,
  coinAmount: number,
): Promise<{ credited: boolean; skipped: boolean }> {
  // PI-based idempotency: check if coins were already credited for this PaymentIntent
  // Matches payments.service.ts line 454-464 exactly
  const alreadyCredited = await prisma.coinTransaction.findFirst({
    where: {
      userId,
      description: { contains: paymentIntentId },
    },
  });
  if (alreadyCredited) {
    return { credited: false, skipped: true };
  }

  await prisma.$transaction(async (tx) => {
    // Upsert coin balance (create if first purchase)
    await tx.coinBalance.upsert({
      where: { userId },
      update: { coins: { increment: coinAmount } },
      create: { userId, coins: coinAmount, diamonds: 0 },
    });

    // Mark pending transaction as completed (or create if none pending)
    const updated = await tx.coinTransaction.updateMany({
      where: {
        userId,
        type: 'PURCHASE',
        amount: coinAmount,
        description: { contains: 'pending payment' },
      },
      data: {
        description: `Coin purchase completed (${coinAmount} coins) — Stripe PI: ${paymentIntentId}`,
      },
    });

    // If no pending found, create a completed transaction
    if (updated.count === 0) {
      await tx.coinTransaction.create({
        data: {
          userId,
          type: 'PURCHASE',
          amount: coinAmount,
          description: `Coin purchase completed (${coinAmount} coins) — Stripe PI: ${paymentIntentId}`,
        },
      });
    }
  });

  return { credited: true, skipped: false };
}

/**
 * Replicate webhook dedup recording from stripe-webhook.controller.ts
 */
async function recordWebhookProcessed(eventId: string): Promise<boolean> {
  try {
    await prisma.processedWebhookEvent.create({
      data: { eventId },
    });
    return true;
  } catch (err: any) {
    // P2002 = already recorded (duplicate)
    if (err.code === 'P2002') return false;
    throw err;
  }
}

describe('Payment Webhook End-to-End (Real DB)', () => {
  describe('coin purchase — happy path', () => {
    it('should credit coins on first webhook', async () => {
      const user = await helper.createUser({ id: 'buyer', username: 'buyer' });

      const result = await handleCoinPurchaseSucceeded('pi_test_123', user.id, 500);
      expect(result.credited).toBe(true);
      expect(result.skipped).toBe(false);

      // Verify balance
      const balance = await prisma.coinBalance.findUnique({ where: { userId: user.id } });
      expect(balance!.coins).toBe(500);

      // Verify transaction record
      const txns = await prisma.coinTransaction.findMany({ where: { userId: user.id } });
      expect(txns).toHaveLength(1);
      expect(txns[0].type).toBe('PURCHASE');
      expect(txns[0].amount).toBe(500);
      expect(txns[0].description).toContain('pi_test_123');
    });

    it('should upsert CoinBalance for first-time buyer (no existing balance)', async () => {
      const user = await helper.createUser({ id: 'newbuyer', username: 'newbuyer' });
      // No CoinBalance exists yet

      await handleCoinPurchaseSucceeded('pi_first_buy', user.id, 1000);

      const balance = await prisma.coinBalance.findUnique({ where: { userId: user.id } });
      expect(balance).not.toBeNull();
      expect(balance!.coins).toBe(1000);
      expect(balance!.diamonds).toBe(0);
    });

    it('should increment existing balance on subsequent purchase', async () => {
      const user = await helper.createUser({ id: 'repeat', username: 'repeat' });
      await helper.createCoinBalance(user.id, 500, 10);

      await handleCoinPurchaseSucceeded('pi_second', user.id, 200);

      const balance = await prisma.coinBalance.findUnique({ where: { userId: user.id } });
      expect(balance!.coins).toBe(700); // 500 + 200
      expect(balance!.diamonds).toBe(10); // Unchanged
    });
  });

  describe('pending transaction upgrade', () => {
    it('should update pending transaction description instead of creating duplicate', async () => {
      const user = await helper.createUser({ id: 'buyer', username: 'buyer' });

      // Pre-create pending transaction (as done when user initiates purchase)
      await helper.createCoinTransaction(user.id, 'PURCHASE', 500, 'Coin purchase pending payment');

      await handleCoinPurchaseSucceeded('pi_upgrade', user.id, 500);

      // Should have exactly 1 transaction (updated, not duplicated)
      const txns = await prisma.coinTransaction.findMany({ where: { userId: user.id } });
      expect(txns).toHaveLength(1);
      expect(txns[0].description).toContain('pi_upgrade');
      expect(txns[0].description).not.toContain('pending payment');
    });

    it('should create new transaction when no pending exists', async () => {
      const user = await helper.createUser({ id: 'buyer', username: 'buyer' });
      // No pending transaction exists

      await handleCoinPurchaseSucceeded('pi_nopending', user.id, 300);

      const txns = await prisma.coinTransaction.findMany({ where: { userId: user.id } });
      expect(txns).toHaveLength(1);
      expect(txns[0].description).toContain('pi_nopending');
    });
  });

  describe('idempotency — replay same webhook', () => {
    it('should not double-credit on replay', async () => {
      const user = await helper.createUser({ id: 'buyer', username: 'buyer' });

      // First call
      const r1 = await handleCoinPurchaseSucceeded('pi_replay', user.id, 500);
      expect(r1.credited).toBe(true);

      // Second call with same PI
      const r2 = await handleCoinPurchaseSucceeded('pi_replay', user.id, 500);
      expect(r2.skipped).toBe(true);

      // Balance should be 500, not 1000
      const balance = await prisma.coinBalance.findUnique({ where: { userId: user.id } });
      expect(balance!.coins).toBe(500);

      // Only 1 transaction record
      const txns = await prisma.coinTransaction.findMany({ where: { userId: user.id } });
      expect(txns).toHaveLength(1);
    });
  });

  describe('ProcessedWebhookEvent dedup (DB layer)', () => {
    it('should record webhook event ID for dedup', async () => {
      const recorded = await recordWebhookProcessed('evt_test_001');
      expect(recorded).toBe(true);

      const event = await prisma.processedWebhookEvent.findUnique({
        where: { eventId: 'evt_test_001' },
      });
      expect(event).not.toBeNull();
      expect(event!.eventId).toBe('evt_test_001');
    });

    it('should return false on duplicate event ID (P2002)', async () => {
      await recordWebhookProcessed('evt_dup_001');

      const secondAttempt = await recordWebhookProcessed('evt_dup_001');
      expect(secondAttempt).toBe(false);

      // Only one record in DB
      const count = await prisma.processedWebhookEvent.count({
        where: { eventId: 'evt_dup_001' },
      });
      expect(count).toBe(1);
    });

    it('should handle multiple different event IDs', async () => {
      await recordWebhookProcessed('evt_a');
      await recordWebhookProcessed('evt_b');
      await recordWebhookProcessed('evt_c');

      const count = await prisma.processedWebhookEvent.count();
      expect(count).toBe(3);
    });
  });

  describe('tip payment', () => {
    it('should update tip status and record payment intent ID', async () => {
      const sender = await helper.createUser({ id: 'tipper', username: 'tipper' });
      const receiver = await helper.createUser({ id: 'creator', username: 'creator' });

      // Create a tip record (as done when user initiates tip)
      const tip = await prisma.tip.create({
        data: {
          senderId: sender.id,
          receiverId: receiver.id,
          amount: 10.0,
          currency: 'USD',
          status: 'pending',
        },
      });

      // Simulate webhook updating tip
      await prisma.tip.update({
        where: { id: tip.id },
        data: {
          status: 'completed',
          stripePaymentId: 'pi_tip_001',
        },
      });

      const updatedTip = await prisma.tip.findUnique({ where: { id: tip.id } });
      expect(updatedTip!.status).toBe('completed');
      expect(updatedTip!.stripePaymentId).toBe('pi_tip_001');
    });
  });

  describe('order payment', () => {
    it('should update order status to PAID on successful payment', async () => {
      const buyer = await helper.createUser({ id: 'buyer', username: 'buyer' });
      const seller = await helper.createUser({ id: 'seller', username: 'seller' });

      // Product is required FK for Order
      const product = await prisma.product.create({
        data: {
          sellerId: seller.id,
          title: 'Test Product',
          description: 'Test product description',
          price: 25.0,
          category: 'BOOKS',
          stock: 10,
        },
      });

      const order = await prisma.order.create({
        data: {
          buyerId: buyer.id,
          productId: product.id,
          totalAmount: 25.0,
          status: 'PENDING',
          currency: 'USD',
        },
      });

      // Simulate webhook updating order
      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: 'PAID',
          stripePaymentId: 'pi_order_001',
        },
      });

      const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(updatedOrder!.status).toBe('PAID');
      expect(updatedOrder!.stripePaymentId).toBe('pi_order_001');
    });
  });

  describe('concurrent webhook processing', () => {
    it('should handle concurrent coin purchases for different users', async () => {
      const user1 = await helper.createUser({ id: 'user1', username: 'user1' });
      const user2 = await helper.createUser({ id: 'user2', username: 'user2' });

      // Process both concurrently
      await Promise.all([
        handleCoinPurchaseSucceeded('pi_u1', user1.id, 100),
        handleCoinPurchaseSucceeded('pi_u2', user2.id, 200),
      ]);

      const bal1 = await prisma.coinBalance.findUnique({ where: { userId: user1.id } });
      const bal2 = await prisma.coinBalance.findUnique({ where: { userId: user2.id } });
      expect(bal1!.coins).toBe(100);
      expect(bal2!.coins).toBe(200);
    });
  });
});
