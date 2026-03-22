import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Dimensions,
} from 'react-native';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { showToast } from '@/components/ui/Toast';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { monetizationApi } from '@/services/monetizationApi';
import { formatCount } from '@/utils/formatCount';
import { paymentsApi } from '@/services/paymentsApi';
import { usersApi } from '@/services/api';
import type { User } from '@/types';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';

const { width } = Dimensions.get('window');

const PRESET_AMOUNTS = [1, 2, 5, 10, 25, 50];
const PLATFORM_FEE_PERCENT = 0.1;
const MAX_MESSAGE_LENGTH = 100;


function AmountButton({
  amount,
  isSelected,
  isPopular,
  onPress,
}: {
  amount: number;
  isSelected: boolean;
  isPopular?: boolean;
  onPress: () => void;
}) {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  return (
    <Pressable onPress={onPress} style={styles.amountButton}>
      <LinearGradient
        colors={
          isSelected
            ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
            : ['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']
        }
        style={[
          styles.amountGradient,
          isSelected && styles.amountGradientSelected,
        ]}
      >
        {isPopular && (
          <LinearGradient
            colors={[colors.gold, colors.goldLight]}
            style={styles.popularBadge}
          >
            <Icon name="star" size="xs" color={tc.bg} />
          </LinearGradient>
        )}
        <Text style={[styles.amountText, isSelected && styles.amountTextSelected]}>
          ${amount}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

export default function SendTipScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const router = useRouter();
  const haptic = useContextualHaptic();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ username?: string }>();
  const [creator, setCreator] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(5);
  const [customAmount, setCustomAmount] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const formattedFollowers = useMemo(
    () => formatCount(creator?._count?.followers),
    [creator?._count?.followers],
  );

  const fetchCreator = useCallback(async () => {
    const username = params.username;
    if (!username) {
      setError(t('monetization.errors.noUserSpecified'));
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const response = await usersApi.getProfile(username);
      setCreator(response);
    } catch (err) {
      setError(t('monetization.errors.failedToLoadCreatorInfo'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [params.username, t]);

  useEffect(() => {
    fetchCreator();
  }, [fetchCreator]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchCreator();
  }, [fetchCreator]);

  const tipAmount = customAmount ? parseFloat(customAmount) || 0 : selectedAmount;
  const platformFee = tipAmount * PLATFORM_FEE_PERCENT;
  const total = tipAmount + platformFee;

  const handleAmountSelect = useCallback((amount: number) => {
    haptic.tick();
    setSelectedAmount(amount);
    setCustomAmount('');
  }, [haptic]);

  const handleSendTip = useCallback(async () => {
    if (!creator) {
      showToast({ message: t('monetization.errors.creatorInfoNotLoaded'), variant: 'error' });
      return;
    }
    if (tipAmount <= 0) {
      showToast({ message: t('monetization.errors.selectTipAmount'), variant: 'error' });
      return;
    }
    haptic.send();
    setIsSending(true);
    try {
      // Create PaymentIntent for the tip via Stripe
      const paymentResult = await paymentsApi.createPaymentIntent({
        receiverId: creator.id,
        amount: tipAmount,
        currency: 'USD',
      });
      // Payment intent created — tip record is pending on backend
      // In production, client-side Stripe SDK would confirm the payment here
      // using paymentResult.clientSecret
      setIsSuccess(true);
      haptic.success();
    } catch (err) {
      showToast({ message: t('monetization.errors.failedToSendTip'), variant: 'error' });
    } finally {
      setIsSending(false);
    }
  }, [creator, tipAmount, message, haptic]);

  const handleDone = useCallback(() => {
    router.back();
  }, [router]);

  // Success State
  if (isSuccess) {
    return (
      <SafeAreaView style={styles.container}>
        <GlassHeader
          title={t('monetization.sendTip')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />

        <View style={styles.successContainer}>
          <Animated.View entering={FadeInUp.duration(500)}>
            <LinearGradient
              colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
              style={styles.successIconBg}
            >
              <Icon name="check-circle" size="xl" color={colors.emerald} />
            </LinearGradient>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(100).duration(400)}>
            <Text style={styles.successTitle}>{t('monetization.tipSent')}</Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(200).duration(400)}>
            <Text style={styles.successSubtitle}>
              {t('monetization.tipSentConfirmation', { amount: tipAmount.toFixed(2), username: creator?.username })}
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(300).duration(400)} style={styles.doneButtonContainer}>
            <Pressable onPress={handleDone}>
              <LinearGradient
                colors={[colors.emerald, colors.emeraldDark]}
                style={styles.doneButton}
              >
                <Text style={styles.doneButtonText}>{t('common.done')}</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <GlassHeader
          title={t('monetization.sendTip')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <View style={[styles.scrollContent, { paddingTop: 100 }]}>
          <Skeleton.Rect width="100%" height={100} borderRadius={radius.lg} />
          <Skeleton.Rect width="100%" height={200} borderRadius={radius.lg} style={{ marginTop: spacing.lg }} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <GlassHeader
          title={t('monetization.sendTip')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <EmptyState
          icon="slash"
          title={t('common.failedToLoad')}
          subtitle={error}
          actionLabel={t('common.retry')}
          onAction={fetchCreator}
        />
      </SafeAreaView>
    );
  }

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={styles.container}>
        <GlassHeader
          title={t('monetization.sendTip')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />

        <ScrollView
          refreshControl={<BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Creator Info Card */}
          <Animated.View entering={FadeInUp.duration(400)}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.creatorCard}
            >
              {/* Avatar */}
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                style={styles.avatarContainer}
              >
                <Icon name="user" size="lg" color={tc.text.secondary} />
              </LinearGradient>

              {/* Creator Details */}
              <View style={styles.creatorInfo}>
                <View style={styles.creatorNameRow}>
                  <Text style={styles.creatorName}>{creator?.displayName}</Text>
                  {creator?.isVerified && <VerifiedBadge size={13} />}
                </View>
                <Text style={styles.creatorUsername}>{creator?.username}</Text>
                <Text style={styles.followerCount}>{formattedFollowers} {t('profile.followers')}</Text>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Amount Selector */}
          <Animated.View entering={FadeInUp.delay(100).duration(400)}>
            <Text style={styles.sectionLabel}>{t('monetization.chooseAmount')}</Text>

            {/* Preset Grid */}
            <View style={styles.amountGrid}>
              {PRESET_AMOUNTS.map((amount, index) => (
                <AmountButton
                  key={amount}
                  amount={amount}
                  isSelected={selectedAmount === amount && !customAmount}
                  isPopular={amount === 5}
                  onPress={() => handleAmountSelect(amount)}
                />
              ))}
            </View>

            {/* Custom Amount Input */}
            <LinearGradient
              colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
              style={styles.customAmountContainer}
            >
              <Icon name="circle" size="sm" color={tc.text.tertiary} />
              <Text style={styles.currencyPrefixLarge}>$</Text>
              <TextInput
                style={styles.customAmountInput}
                value={customAmount}
                onChangeText={(text) => {
                  const cleaned = text.replace(/[^0-9.]/g, '');
                  if (cleaned.split('.').length <= 2) {
                    setCustomAmount(cleaned);
                  }
                }}
                placeholder={t('monetization.enterCustomAmount')}
                placeholderTextColor={tc.text.tertiary}
                keyboardType="decimal-pad"
              />
            </LinearGradient>
          </Animated.View>

          {/* Message Section */}
          <Animated.View entering={FadeInUp.delay(200).duration(400)}>
            <Text style={styles.sectionLabel}>{t('monetization.addMessageOptional')}</Text>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.messageCard}
            >
              <View style={styles.messageHeader}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.05)']}
                  style={styles.messageIconBg}
                >
                  <Icon name="mail" size="sm" color={colors.emerald} />
                </LinearGradient>
              </View>

              <View style={styles.messageInputContainer}>
                <TextInput
                  style={styles.messageInput}
                  value={message}
                  onChangeText={setMessage}
                  placeholder={t('monetization.addMessageOptional')}
                  placeholderTextColor={tc.text.tertiary}
                  multiline
                  numberOfLines={2}
                  maxLength={MAX_MESSAGE_LENGTH}
                  textAlignVertical="top"
                />
                <View style={styles.charCountWrapper}>
                  <CharCountRing current={message.length} max={MAX_MESSAGE_LENGTH} size={28} />
                </View>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Payment Summary Card */}
          <Animated.View entering={FadeInUp.delay(300).duration(400)}>
            <LinearGradient
              colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
              style={[styles.summaryCard, { borderLeftWidth: 3, borderLeftColor: colors.gold }]}
            >
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{t('monetization.tipAmount')}</Text>
                <Text style={styles.summaryValue}>${tipAmount.toFixed(2)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{t('monetization.platformFee')}</Text>
                <Text style={[styles.summaryValue, styles.feeValue]}>${platformFee.toFixed(2)}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, styles.totalLabel]}>{t('monetization.total')}</Text>
                <Text style={[styles.summaryValue, styles.totalValue]}>${total.toFixed(2)}</Text>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Send Tip Button */}
          <Animated.View entering={FadeInUp.delay(400).duration(400)}>
            <Pressable
              accessibilityRole="button"
              onPress={handleSendTip}
              disabled={tipAmount <= 0 || isSending}
             
            >
              <LinearGradient
                colors={[colors.emerald, colors.goldLight]}
                style={[
                  styles.sendButton,
                  (tipAmount <= 0 || isSending) && styles.sendButtonDisabled,
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {isSending ? (
                  <Skeleton.Rect width={24} height={24} borderRadius={radius.full} />
                ) : (
                  <>
                    <Text style={styles.sendButtonText}>{t('monetization.sendAmount', { amount: total.toFixed(2) })}</Text>
                    <Icon name="send" size="sm" color={tc.text.primary} />
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </Animated.View>

          {/* Bottom spacing */}
          <View style={{ height: spacing.xxl }} />
        </ScrollView>
      </SafeAreaView>
  
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  scrollContent: {
    padding: spacing.base,
    paddingTop: 100,
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    paddingTop: 100,
  },
  successIconBg: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  successTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSize.xl,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  successSubtitle: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  doneButtonContainer: {
    width: '100%',
  },
  doneButton: {
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  doneButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  creatorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  creatorInfo: {
    flex: 1,
  },
  creatorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  creatorName: {
    fontFamily: fonts.heading,
    fontSize: fontSize.md,
    color: colors.text.primary,
  },
  verifiedBadge: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  verifiedGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatorUsername: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  followerCount: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
  },
  sectionLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  amountGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  amountButton: {
    width: (width - 32 - 20) / 3,
  },
  amountGradient: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.active.white6,
    paddingVertical: spacing.md,
    alignItems: 'center',
    position: 'relative',
  },
  amountGradientSelected: {
    borderColor: colors.emerald,
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  popularBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountText: {
    fontFamily: fonts.heading,
    fontSize: fontSize.lg,
    color: colors.text.secondary,
  },
  amountTextSelected: {
    color: colors.text.primary,
  },
  customAmountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  currencyPrefixLarge: {
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    color: colors.text.tertiary,
    marginHorizontal: spacing.sm,
  },
  customAmountInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.primary,
    padding: 0,
  },
  messageCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  messageHeader: {
    marginBottom: spacing.sm,
  },
  messageIconBg: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageInputContainer: {
    position: 'relative',
  },
  messageInput: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.primary,
    lineHeight: 22,
    minHeight: 60,
    paddingRight: 40,
  },
  charCountWrapper: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  summaryCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  summaryLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.secondary,
  },
  summaryValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  feeValue: {
    color: colors.text.tertiary,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: tc.border,
    marginVertical: spacing.md,
  },
  totalLabel: {
    fontFamily: fonts.heading,
    fontSize: fontSize.md,
    color: colors.text.primary,
  },
  totalValue: {
    fontFamily: fonts.heading,
    fontSize: fontSize.lg,
    color: colors.emerald,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
});
