import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
} from 'react-native';
import { showToast } from '@/components/ui/Toast';
import { useRouter } from 'expo-router';
import Animated, {
  FadeIn,
  FadeInUp,
  ZoomIn,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, spacing, fontSize, radius, fonts, shadow } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { formatCount } from '@/utils/formatCount';
import { rtlFlexRow } from '@/utils/rtl';
import { api } from '@/services/api';
import { formatCurrency } from '@/utils/localeFormat';

// Feature gate: wallet/cashout backend is NOT implemented yet
const CASHOUT_ENABLED = false;

// ── Local types ──

interface WalletBalance {
  diamonds: number;
  usdEquivalent: number;
  diamondToUsdRate: number;
}

interface PaymentMethod {
  id: string;
  type: 'bank' | 'paypal' | 'stripe';
  label: string;
  lastFour: string;
  isDefault: boolean;
}

type PayoutSpeed = 'instant' | 'standard';

interface PayoutHistoryEntry {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
}

// ── API helpers ──

// TODO: Backend wallet endpoints not yet implemented
// These endpoints (/monetization/wallet/*) need to be built before cash out is functional
// For now, the screen shows a "coming soon" state
const walletApi = {
  getBalance: () =>
    api.get<WalletBalance>('/monetization/wallet/balance'),
  getPaymentMethods: () =>
    api.get<PaymentMethod[]>('/monetization/wallet/payment-methods'),
  requestCashout: (payload: {
    amount: number;
    payoutSpeed: PayoutSpeed;
    paymentMethodId: string;
  }) => api.post<{ success: boolean }>('/monetization/wallet/cashout', payload),
  // TODO: Backend payout history endpoint not yet implemented
  getPayoutHistory: () =>
    api.get<{ data: PayoutHistoryEntry[]; meta: { cursor: string | null; hasMore: boolean } }>('/monetization/wallet/payouts'),
};

// ── Constants ──

const DIAMOND_TO_USD = 0.007; // 100 diamonds = $0.70
const INSTANT_FEE_PERCENT = 2;

function CashoutContent() {
  const router = useRouter();
  const tc = useThemeColors();
  const { t, isRTL } = useTranslation();
  const haptic = useContextualHaptic();

  // CS-5/CS-15: Feature gate — backend not implemented yet
  if (!CASHOUT_ENABLED) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('cashout.title', 'Cash Out')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.back', 'Go back'),
          }}
        />
        <View style={styles.successContainer}>
          <EmptyState
            icon="clock"
            title={t('cashout.comingSoon', 'Cash Out Coming Soon')}
            subtitle={t('cashout.comingSoonDesc', 'The monetization system is under development. You\'ll be able to cash out your diamonds here once it\'s ready.')}
            actionLabel={t('common.back', 'Go Back')}
            onAction={() => router.back()}
          />
        </View>
      </View>
    );
  }

  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [payoutHistory, setPayoutHistory] = useState<PayoutHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [amountText, setAmountText] = useState('');
  const [payoutSpeed, setPayoutSpeed] = useState<PayoutSpeed>('standard');
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const amount = parseFloat(amountText) || 0;
  const usdValue = amount * DIAMOND_TO_USD;
  const fee = payoutSpeed === 'instant' ? usdValue * (INSTANT_FEE_PERCENT / 100) : 0;
  const netAmount = usdValue - fee;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [balRes, methodsRes] = await Promise.all([
          walletApi.getBalance(),
          walletApi.getPaymentMethods(),
        ]);
        if (!cancelled) {
          setBalance(balRes as WalletBalance);
          const methods = methodsRes as PaymentMethod[];
          setPaymentMethods(methods);
          const defaultMethod = methods.find((m) => m.isDefault);
          if (defaultMethod) setSelectedMethodId(defaultMethod.id);
        }
      } catch {
        showToast({ message: t('cashout.loadError', 'Could not load wallet data'), variant: 'error' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    async function loadHistory() {
      try {
        const res = await walletApi.getPayoutHistory();
        if (!cancelled) {
          const history = (res as { data: PayoutHistoryEntry[] })?.data ?? [];
          setPayoutHistory(history);
        }
      } catch {
        showToast({ message: t('cashout.historyError', 'Could not load payout history'), variant: 'error' });
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }
    load();
    loadHistory();
    return () => { cancelled = true; };
  }, []);

  const handleMax = useCallback(() => {
    if (!balance) return;
    haptic.tick();
    setAmountText(String(balance.diamonds));
  }, [balance, haptic]);

  const MIN_WITHDRAWAL_DIAMONDS = Math.ceil(10 / DIAMOND_TO_USD); // $10 minimum

  const handleConfirm = useCallback(async () => {
    if (!selectedMethodId || amount <= 0 || !balance) return;
    if (amount > balance.diamonds) {
      showToast({ message: t('cashout.insufficientBalance', 'Amount exceeds available balance'), variant: 'error' });
      return;
    }
    if (amount < MIN_WITHDRAWAL_DIAMONDS) {
      showToast({
        message: t('cashout.minimumNotMet', 'Minimum withdrawal is $10.00 ({{diamonds}} diamonds)', { diamonds: String(MIN_WITHDRAWAL_DIAMONDS) }),
        variant: 'error',
      });
      return;
    }
    setSubmitting(true);
    try {
      await walletApi.requestCashout({
        amount,
        payoutSpeed,
        paymentMethodId: selectedMethodId,
      });
      haptic.success();
      setSuccess(true);
      showToast({ message: t('cashout.requestSubmitted', 'Cashout request submitted successfully'), variant: 'success' });
    } catch {
      haptic.error();
      showToast({ message: t('cashout.requestFailed', 'Failed to process cashout. Please try again.'), variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  }, [amount, balance, selectedMethodId, haptic, t, payoutSpeed, MIN_WITHDRAWAL_DIAMONDS]);

  if (success) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('cashout.title', 'Cash Out')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.back', 'Go back'),
          }}
        />
        <View style={styles.successContainer}>
          <Animated.View entering={ZoomIn.duration(500)} style={styles.successCircle}>
            <LinearGradient
              colors={[colors.emeraldLight, colors.emerald]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.successGradient}
            >
              <Icon name="check" size="xl" color={tc.text.primary} />
            </LinearGradient>
          </Animated.View>
          <Animated.Text entering={FadeInUp.delay(300).duration(400)} style={[styles.successTitle, { color: tc.text.primary }]}>
            {t('cashout.successTitle', 'Cashout Requested')}
          </Animated.Text>
          <Animated.Text entering={FadeInUp.delay(400).duration(400)} style={[styles.successSubtitle, { color: tc.text.secondary }]}>
            {payoutSpeed === 'instant'
              ? t('cashout.successInstant', 'Your funds will arrive shortly')
              : t('cashout.successStandard', 'Your funds will arrive in 3-5 business days')}
          </Animated.Text>
          <Animated.View entering={FadeInUp.delay(500).duration(400)} style={[styles.successAmountCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
            <Text style={[styles.successAmountLabel, { color: tc.text.secondary }]}>
              {t('cashout.amountSent', 'Amount')}
            </Text>
            <Text style={styles.successAmount}>
              {formatCurrency(netAmount)}
            </Text>
          </Animated.View>
          <Animated.View entering={FadeInUp.delay(600).duration(400)} style={{ marginTop: spacing.xl }}>
            <GradientButton
              label={t('cashout.done', 'Done')}
              onPress={() => router.back()}
              size="lg"
            />
          </Animated.View>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('cashout.title', 'Cash Out')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.back', 'Go back'),
          }}
        />
        <View style={styles.loadingContainer}>
          <Skeleton.Rect width="100%" height={120} borderRadius={radius.lg} />
          <View style={{ height: spacing.xl }} />
          <Skeleton.Rect width="100%" height={80} borderRadius={radius.lg} />
          <View style={{ height: spacing.base }} />
          <Skeleton.Rect width="100%" height={64} borderRadius={radius.lg} />
          <View style={{ height: spacing.sm }} />
          <Skeleton.Rect width="100%" height={64} borderRadius={radius.lg} />
          <View style={{ height: spacing.xl }} />
          <Skeleton.Rect width="100%" height={56} borderRadius={radius.lg} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: tc.bg }]}>
      <GlassHeader
        title={t('cashout.title', 'Cash Out')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back', 'Go back'),
        }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Balance Card */}
        <Animated.View entering={FadeIn.duration(400)}>
          <LinearGradient
            colors={[tc.bgCard, tc.bgElevated]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.balanceCard, { borderColor: tc.border }]}
          >
            <Text style={[styles.balanceLabel, { color: tc.text.secondary }]}>
              {t('cashout.availableBalance', 'Available Balance')}
            </Text>
            <View style={styles.balanceRow}>
              <Icon name="layers" size="md" color={colors.gold} />
              <Text style={[styles.balanceDiamonds, { color: tc.text.primary }]}>
                {formatCount(balance?.diamonds ?? 0)}
              </Text>
            </View>
            <Text style={styles.balanceUsd}>
              = {formatCurrency(balance?.usdEquivalent ?? 0)}
            </Text>
            <Text style={[styles.rateText, { color: tc.text.tertiary }]}>
              {t('cashout.exchangeRate', '100 diamonds = $0.70')}
            </Text>
          </LinearGradient>
        </Animated.View>

        {/* Amount Input */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)} style={[styles.inputCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
          <Text style={[styles.inputLabel, { color: tc.text.secondary }]}>
            {t('cashout.amountLabel', 'Diamonds to cash out')}
          </Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.amountInput, { color: tc.text.primary }]}
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={tc.text.tertiary}
              maxLength={10}
              accessibilityLabel={t('cashout.amountInput', 'Enter diamond amount')}
            />
            <Pressable
              accessibilityRole="button"
              onPress={handleMax}
              disabled={!balance}
              style={({ pressed }) => [
                styles.maxButton,
                pressed && { opacity: 0.7 },
                !balance && { opacity: 0.4 },
              ]}
            >
              <Text style={styles.maxText}>
                {t('cashout.max', 'Max')}
              </Text>
            </Pressable>
          </View>
          {amount > 0 && (
            <Text style={[styles.usdEquivalent, { color: tc.text.secondary }]}>
              = {formatCurrency(usdValue)}
              {fee > 0 && ` (${t('cashout.fee', 'fee')}: -${formatCurrency(fee)})`}
            </Text>
          )}
          <Text style={[styles.minimumText, { color: tc.text.tertiary }]}>
            {t('cashout.minimumWithdrawal', 'Minimum withdrawal: $10.00')}
          </Text>
        </Animated.View>

        {/* Payout Speed Selector */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)} style={styles.speedCard}>
          <Text style={[styles.sectionLabel, { color: tc.text.primary }]}>
            {t('cashout.payoutMethod', 'Payout Method')}
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() => setPayoutSpeed('instant')}
            style={({ pressed }) => [
              styles.speedOption,
              { backgroundColor: tc.bgCard, borderColor: tc.border },
              payoutSpeed === 'instant' && styles.speedOptionSelected,
              pressed && { opacity: 0.8 },
            ]}
          >
            <View style={styles.speedContent}>
              <View style={styles.speedHeader}>
                <Text style={[styles.speedTitle, { color: tc.text.primary }]}>
                  {t('cashout.instantPayout', 'Instant Payout')}
                </Text>
                <View style={styles.feeBadge}>
                  <Text style={styles.feeText}>{INSTANT_FEE_PERCENT}%</Text>
                </View>
              </View>
              <Text style={[styles.speedDesc, { color: tc.text.secondary }]}>
                {t('cashout.instantDesc', 'Arrives immediately')}
              </Text>
            </View>
            <View style={[styles.radioOuter, payoutSpeed === 'instant' && styles.radioSelected]}>
              {payoutSpeed === 'instant' && <View style={styles.radioInner} />}
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => setPayoutSpeed('standard')}
            style={({ pressed }) => [
              styles.speedOption,
              { backgroundColor: tc.bgCard, borderColor: tc.border },
              payoutSpeed === 'standard' && styles.speedOptionSelected,
              pressed && { opacity: 0.8 },
            ]}
          >
            <View style={styles.speedContent}>
              <View style={styles.speedHeader}>
                <Text style={[styles.speedTitle, { color: tc.text.primary }]}>
                  {t('cashout.standardPayout', 'Standard Payout')}
                </Text>
                <View style={[styles.feeBadge, styles.freeBadge]}>
                  <Text style={[styles.feeText, { color: colors.emerald }]}>
                    {t('cashout.free', 'Free')}
                  </Text>
                </View>
              </View>
              <Text style={[styles.speedDesc, { color: tc.text.secondary }]}>
                {t('cashout.standardDesc', '3-5 business days')}
              </Text>
            </View>
            <View style={[styles.radioOuter, payoutSpeed === 'standard' && styles.radioSelected]}>
              {payoutSpeed === 'standard' && <View style={styles.radioInner} />}
            </View>
          </Pressable>
        </Animated.View>

        {/* Saved Payment Methods */}
        {paymentMethods.length > 0 && (
          <Animated.View entering={FadeInUp.delay(300).duration(400)} style={styles.methodsCard}>
            <Text style={[styles.sectionLabel, { color: tc.text.primary }]}>
              {t('cashout.paymentMethod', 'Payment Method')}
            </Text>
            {paymentMethods.map((method) => (
              <Pressable
                accessibilityRole="button"
                key={method.id}
                onPress={() => setSelectedMethodId(method.id)}
                style={({ pressed }) => [
                  styles.methodRow,
                  { backgroundColor: tc.bgCard, borderColor: tc.border },
                  selectedMethodId === method.id && styles.methodRowSelected,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <View style={[styles.methodIconWrap, { backgroundColor: tc.surface }]}>
                  <Icon
                    name={method.type === 'bank' ? 'layers' : 'globe'}
                    size="sm"
                    color={tc.text.secondary}
                  />
                </View>
                <View style={styles.methodContent}>
                  <Text style={[styles.methodLabel, { color: tc.text.primary }]}>{method.label}</Text>
                  <Text style={[styles.methodLast4, { color: tc.text.secondary }]}>
                    {t('cashout.endingIn', 'Ending in')} {method.lastFour}
                  </Text>
                </View>
                <View style={[styles.radioOuter, selectedMethodId === method.id && styles.radioSelected]}>
                  {selectedMethodId === method.id && <View style={styles.radioInner} />}
                </View>
              </Pressable>
            ))}
          </Animated.View>
        )}

        {/* Payout History */}
        <Animated.View entering={FadeInUp.delay(400).duration(400)} style={styles.historySection}>
          <Text style={[styles.sectionLabel, { color: tc.text.primary }]}>
            {t('cashout.payoutHistory', 'Payout History')}
          </Text>
          {historyLoading ? (
            <View style={{ gap: spacing.sm }}>
              <Skeleton.Rect width="100%" height={56} borderRadius={radius.lg} />
              <Skeleton.Rect width="100%" height={56} borderRadius={radius.lg} />
            </View>
          ) : payoutHistory.length === 0 ? (
            <View style={[styles.historyEmptyCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
              <EmptyState
                icon="clock"
                title={t('cashout.noPayouts', 'No payouts yet')}
                subtitle={t('cashout.noPayoutsSubtitle', 'Your payout history will appear here once you make your first cash out')}
              />
            </View>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {payoutHistory.map((entry) => {
                const statusColor =
                  entry.status === 'completed' ? colors.emerald
                    : entry.status === 'pending' ? colors.gold
                      : colors.error;
                const statusBgColor =
                  entry.status === 'completed' ? colors.active.emerald10
                    : entry.status === 'pending' ? colors.active.gold10
                      : colors.active.error10;
                const statusLabel =
                  entry.status === 'completed' ? t('cashout.completed', 'Completed')
                    : entry.status === 'pending' ? t('cashout.pending', 'Pending')
                      : t('cashout.failed', 'Failed');

                return (
                  <View
                    key={entry.id}
                    style={[styles.historyRow, { backgroundColor: tc.bgCard, borderColor: tc.border }]}
                  >
                    <View style={styles.historyLeft}>
                      <Text style={[styles.historyDate, { color: tc.text.secondary }]}>
                        {new Date(entry.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </Text>
                      <View style={[styles.statusBadge, { backgroundColor: statusBgColor }]}>
                        <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                      </View>
                    </View>
                    <Text style={[styles.historyAmount, { color: tc.text.primary }]}>
                      {formatCurrency(entry.amount)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {/* Confirm Button */}
      <View style={[styles.bottomBar, { backgroundColor: tc.bg, borderTopColor: tc.border }]}>
        {(amount > 0 && !selectedMethodId) && (
          <Text style={[styles.disabledHint, { color: tc.text.tertiary }]}>
            {t('cashout.selectMethodHint', 'Select a payment method to continue')}
          </Text>
        )}
        <GradientButton
          label={
            netAmount > 0
              ? `${t('cashout.confirm', 'Confirm Cash Out')} — ${formatCurrency(netAmount)}`
              : t('cashout.confirm', 'Confirm Cash Out')
          }
          icon="check-circle"
          onPress={handleConfirm}
          fullWidth
          size="lg"
          disabled={amount <= 0 || !selectedMethodId}
          loading={submitting}
        />
      </View>
    </View>
  );
}

export default function CashoutScreen() {
  return (
    <ScreenErrorBoundary>
      <CashoutContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 100,
    paddingHorizontal: spacing.base,
    paddingBottom: 120,
  },
  loadingContainer: {
    paddingTop: 100,
    paddingHorizontal: spacing.base,
  },

  // Success
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  successCircle: {
    marginBottom: spacing.xl,
  },
  successGradient: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.glow,
  },
  successTitle: {
    fontFamily: fonts.headingBold,
    fontSize: fontSize.xl,
    textAlign: 'center',
  },
  successSubtitle: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  successAmountCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.xl,
    width: '100%',
  },
  successAmountLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
  },
  successAmount: {
    fontFamily: fonts.headingBold,
    fontSize: fontSize['3xl'],
    color: colors.emerald,
    marginTop: spacing.xs,
  },

  // Balance card
  balanceCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
    marginTop: spacing.base,
  },
  balanceLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  balanceDiamonds: {
    fontFamily: fonts.headingBold,
    fontSize: fontSize['3xl'],
  },
  balanceUsd: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: colors.emerald,
    marginTop: spacing.xs,
  },
  rateText: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    marginTop: spacing.xs,
  },

  // Amount input
  inputCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.base,
    marginTop: spacing.base,
  },
  inputLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  amountInput: {
    flex: 1,
    fontFamily: fonts.headingBold,
    fontSize: fontSize['2xl'],
    paddingVertical: spacing.sm,
  },
  maxButton: {
    backgroundColor: colors.active.emerald10,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.emerald,
  },
  maxText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.emerald,
  },
  usdEquivalent: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginTop: spacing.sm,
  },
  minimumText: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    marginTop: spacing.xs,
  },

  // Payout speed
  speedCard: {
    marginTop: spacing.base,
  },
  sectionLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    marginBottom: spacing.md,
  },
  speedOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  speedOptionSelected: {
    borderColor: colors.emerald,
    backgroundColor: colors.active.emerald10,
  },
  speedContent: {
    flex: 1,
  },
  speedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  speedTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
  },
  feeBadge: {
    backgroundColor: colors.active.gold10,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  freeBadge: {
    backgroundColor: colors.active.emerald10,
  },
  feeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.xs,
    color: colors.gold,
  },
  speedDesc: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginTop: 2,
  },

  // Payment methods
  methodsCard: {
    marginTop: spacing.base,
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  methodRowSelected: {
    borderColor: colors.emerald,
  },
  methodIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: spacing.md,
  },
  methodContent: {
    flex: 1,
  },
  methodLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
  },
  methodLast4: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    marginTop: 2,
  },

  // Radio
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.active.white6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.emerald,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
  },

  // Payout history
  historySection: {
    marginTop: spacing.xl,
  },
  historyEmptyCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.base,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.base,
  },
  historyLeft: {
    gap: spacing.xs,
  },
  historyDate: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  statusText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.xs,
  },
  historyAmount: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSize.md,
  },

  disabledHint: {
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['2xl'],
    paddingTop: spacing.base,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
