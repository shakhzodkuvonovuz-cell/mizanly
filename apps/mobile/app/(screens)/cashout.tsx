import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
, Pressable } from 'react-native';
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
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, spacing, fontSize, radius, fonts, shadow } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useHaptic } from '@/hooks/useHaptic';
import { api } from '@/services/api';

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

// ── API helpers ──

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
};

// ── Constants ──

const DIAMOND_TO_USD = 0.007; // 100 diamonds = $0.70
const INSTANT_FEE_PERCENT = 2;

function CashoutContent() {
  const router = useRouter();
  const { t } = useTranslation();
  const haptic = useHaptic();

  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
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
        // Use defaults on error
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const handleMax = useCallback(() => {
    if (!balance) return;
    haptic.light();
    setAmountText(String(balance.diamonds));
  }, [balance, haptic]);

  const handleConfirm = useCallback(async () => {
    if (!selectedMethodId || amount <= 0 || !balance) return;
    if (amount > balance.diamonds) {
      Alert.alert(
        t('cashout.errorTitle', 'Error'),
        t('cashout.insufficientBalance', 'Amount exceeds available balance'),
      );
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
    } catch {
      Alert.alert(
        t('cashout.errorTitle', 'Error'),
        t('cashout.errorSubmit', 'Failed to submit cashout request'),
      );
    } finally {
      setSubmitting(false);
    }
  }, [amount, balance, selectedMethodId, payoutSpeed, haptic, t]);

  if (success) {
    return (
      <View style={styles.container}>
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
              <Icon name="check" size="xl" color="#FFFFFF" />
            </LinearGradient>
          </Animated.View>
          <Animated.Text entering={FadeInUp.delay(300).duration(400)} style={styles.successTitle}>
            {t('cashout.successTitle', 'Cashout Requested')}
          </Animated.Text>
          <Animated.Text entering={FadeInUp.delay(400).duration(400)} style={styles.successSubtitle}>
            {payoutSpeed === 'instant'
              ? t('cashout.successInstant', 'Your funds will arrive shortly')
              : t('cashout.successStandard', 'Your funds will arrive in 3-5 business days')}
          </Animated.Text>
          <Animated.View entering={FadeInUp.delay(500).duration(400)} style={styles.successAmountCard}>
            <Text style={styles.successAmountLabel}>
              {t('cashout.amountSent', 'Amount')}
            </Text>
            <Text style={styles.successAmount}>
              ${netAmount.toFixed(2)}
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
      <View style={styles.container}>
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
    <View style={styles.container}>
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
            colors={[colors.dark.bgCard, colors.dark.bgElevated]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.balanceCard}
          >
            <Text style={styles.balanceLabel}>
              {t('cashout.availableBalance', 'Available Balance')}
            </Text>
            <View style={styles.balanceRow}>
              <Icon name="layers" size="md" color={colors.gold} />
              <Text style={styles.balanceDiamonds}>
                {balance?.diamonds ?? 0}
              </Text>
            </View>
            <Text style={styles.balanceUsd}>
              = ${(balance?.usdEquivalent ?? 0).toFixed(2)} USD
            </Text>
            <Text style={styles.rateText}>
              {t('cashout.exchangeRate', '100 diamonds = $0.70')}
            </Text>
          </LinearGradient>
        </Animated.View>

        {/* Amount Input */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.inputCard}>
          <Text style={styles.inputLabel}>
            {t('cashout.amountLabel', 'Diamonds to cash out')}
          </Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.amountInput}
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.text.tertiary}
              maxLength={10}
              accessibilityLabel={t('cashout.amountInput', 'Enter diamond amount')}
            />
            <Pressable
              accessibilityRole="button"
              onPress={handleMax}
              style={({ pressed }) => [
                styles.maxButton,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.maxText}>
                {t('cashout.max', 'Max')}
              </Text>
            </Pressable>
          </View>
          {amount > 0 && (
            <Text style={styles.usdEquivalent}>
              = ${usdValue.toFixed(2)} USD
              {fee > 0 && ` (${t('cashout.fee', 'fee')}: -$${fee.toFixed(2)})`}
            </Text>
          )}
        </Animated.View>

        {/* Payout Speed Selector */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)} style={styles.speedCard}>
          <Text style={styles.sectionLabel}>
            {t('cashout.payoutMethod', 'Payout Method')}
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() => setPayoutSpeed('instant')}
            style={({ pressed }) => [
              styles.speedOption,
              payoutSpeed === 'instant' && styles.speedOptionSelected,
              pressed && { opacity: 0.8 },
            ]}
          >
            <View style={styles.speedContent}>
              <View style={styles.speedHeader}>
                <Text style={styles.speedTitle}>
                  {t('cashout.instantPayout', 'Instant Payout')}
                </Text>
                <View style={styles.feeBadge}>
                  <Text style={styles.feeText}>{INSTANT_FEE_PERCENT}%</Text>
                </View>
              </View>
              <Text style={styles.speedDesc}>
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
              payoutSpeed === 'standard' && styles.speedOptionSelected,
              pressed && { opacity: 0.8 },
            ]}
          >
            <View style={styles.speedContent}>
              <View style={styles.speedHeader}>
                <Text style={styles.speedTitle}>
                  {t('cashout.standardPayout', 'Standard Payout')}
                </Text>
                <View style={[styles.feeBadge, styles.freeBadge]}>
                  <Text style={[styles.feeText, { color: colors.emerald }]}>
                    {t('cashout.free', 'Free')}
                  </Text>
                </View>
              </View>
              <Text style={styles.speedDesc}>
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
            <Text style={styles.sectionLabel}>
              {t('cashout.paymentMethod', 'Payment Method')}
            </Text>
            {paymentMethods.map((method) => (
              <Pressable
                accessibilityRole="button"
                key={method.id}
                onPress={() => setSelectedMethodId(method.id)}
                style={({ pressed }) => [
                  styles.methodRow,
                  selectedMethodId === method.id && styles.methodRowSelected,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <View style={styles.methodIconWrap}>
                  <Icon
                    name={method.type === 'bank' ? 'layers' : 'globe'}
                    size="sm"
                    color={colors.text.secondary}
                  />
                </View>
                <View style={styles.methodContent}>
                  <Text style={styles.methodLabel}>{method.label}</Text>
                  <Text style={styles.methodLast4}>
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
      </ScrollView>

      {/* Confirm Button */}
      <View style={styles.bottomBar}>
        <GradientButton
          label={
            netAmount > 0
              ? `${t('cashout.confirm', 'Confirm Cash Out')} — $${netAmount.toFixed(2)}`
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
    backgroundColor: colors.dark.bg,
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
    color: colors.text.primary,
    textAlign: 'center',
  },
  successSubtitle: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  successAmountCard: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dark.border,
    padding: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.xl,
    width: '100%',
  },
  successAmountLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
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
    borderColor: colors.dark.border,
    padding: spacing.xl,
    alignItems: 'center',
    marginTop: spacing.base,
  },
  balanceLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
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
    color: colors.text.primary,
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
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dark.border,
    padding: spacing.base,
    marginTop: spacing.base,
  },
  inputLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
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
    color: colors.text.primary,
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

  // Payout speed
  speedCard: {
    marginTop: spacing.base,
  },
  sectionLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  speedOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dark.border,
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
    color: colors.text.primary,
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
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dark.border,
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
    backgroundColor: colors.dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  methodContent: {
    flex: 1,
  },
  methodLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  methodLast4: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginTop: 2,
  },

  // Radio
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.dark.borderLight,
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

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['2xl'],
    paddingTop: spacing.base,
    backgroundColor: colors.dark.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.dark.border,
  },
});
