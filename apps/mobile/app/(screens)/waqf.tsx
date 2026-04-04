import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { GradientButton } from '@/components/ui/GradientButton';
import { useTranslation } from '@/hooks/useTranslation';
import { rtlFlexRow } from '@/utils/rtl';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import { showToast } from '@/components/ui/Toast';
import { api } from '@/services/api';
import { paymentsApi } from '@/services/paymentsApi';
import { useStore } from '@/store';

const WAQF_PRESET_AMOUNTS = [10, 25, 50, 100, 250, 500];

export default function WaqfScreen() {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const router = useRouter();
  const { t, isRTL } = useTranslation();
  const haptic = useContextualHaptic();

  const [contributeSheet, setContributeSheet] = useState(false);
  const [selectedFund, setSelectedFund] = useState<Record<string, unknown> | null>(null);
  const [selectedAmount, setSelectedAmount] = useState(50);
  const [customAmount, setCustomAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const isOffline = useStore((s) => s.isOffline);

  const contributionAmount = customAmount ? parseFloat(customAmount) || 0 : selectedAmount;

  const handleOpenContribute = useCallback((fund: Record<string, unknown>) => {
    haptic.navigate();
    setSelectedFund(fund);
    setSelectedAmount(50);
    setCustomAmount('');
    setContributeSheet(true);
  }, [haptic]);

  const handleContribute = useCallback(async () => {
    if (!selectedFund || contributionAmount <= 0) return;
    if (isOffline) {
      showToast({ message: t('common.checkConnection', 'Please check your connection'), variant: 'error' });
      return;
    }
    haptic.send();
    setIsProcessing(true);
    showToast({ message: t('community.waqfProcessing', 'Processing contribution...'), variant: 'info' });

    try {
      // Step 1: Create Stripe PaymentIntent and get clientSecret
      const creatorId = (selectedFund.creator as Record<string, unknown> | undefined)?.id as string | undefined;
      const paymentResult = await paymentsApi.createPaymentIntent({
        amount: contributionAmount,
        currency: 'USD',
        receiverId: creatorId ?? 'platform',
      });

      // Guard: only record contribution AFTER payment confirmation
      if (!paymentResult) {
        throw new Error(t('community.waqfPaymentFailed', 'Payment could not be processed'));
      }

      // Step 2: Record the waqf contribution on backend AFTER payment succeeds
      await api.post(`/waqf/funds/${selectedFund.id}/contribute`, { amount: contributionAmount });

      haptic.success();
      setContributeSheet(false);
      showToast({ message: t('community.waqfContributeSuccess', 'Contribution successful! JazakAllahu Khairan.'), variant: 'success' });
    } catch (err: unknown) {
      haptic.error();
      const message = err instanceof Error ? err.message : t('community.waqfContributeFailed', 'Contribution failed');
      showToast({ message, variant: 'error' });
    } finally {
      setIsProcessing(false);
    }
  }, [selectedFund, contributionAmount, haptic, t]);

  const fundsQuery = useInfiniteQuery({
    queryKey: ['waqf-funds'],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam) params.set('cursor', pageParam);
      return api.get<{ data: Array<Record<string, unknown>>; meta?: { cursor: string | null; hasMore: boolean } }>(`/waqf/funds?${params}`);
    },
    getNextPageParam: (lastPage: { meta?: { cursor: string | null; hasMore: boolean } }) =>
      lastPage?.meta?.hasMore ? lastPage.meta.cursor : undefined,
    initialPageParam: undefined as string | undefined,
  });

  const funds = fundsQuery.data?.pages.flatMap((p) => ((p as Record<string, unknown>).data as Array<Record<string, unknown>>) || []) || [];

  const renderFund = ({ item, index }: { item: Record<string, unknown>; index: number }) => {
    const goal = item.goalAmount as number;
    const raised = item.raisedAmount as number;
    const progress = goal > 0 ? Math.min(raised / goal, 1) : 0;
    const creator = item.creator as Record<string, unknown> | undefined;

    return (
      <Animated.View entering={FadeInUp.delay(index * 60).duration(300)}>
        <View style={styles.fundCard}>
          <View style={[styles.fundHeader, { flexDirection: rtlFlexRow(isRTL) }]}>
            <View style={styles.fundIconWrap}>
              <Icon name="heart" size="md" color={colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fundTitle}>{item.title as string}</Text>
              {creator && (
                <View style={[styles.creatorRow, { flexDirection: rtlFlexRow(isRTL) }]}>
                  <Avatar uri={creator.avatarUrl as string | null} name={creator.displayName as string || ''} size="xs" />
                  <Text style={styles.creatorName}>{creator.displayName as string}</Text>
                </View>
              )}
            </View>
          </View>

          <Text style={styles.fundDesc} numberOfLines={2}>{item.description as string}</Text>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <LinearGradient
              colors={[colors.gold, '#D4A94F']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[styles.progressFill, { width: `${progress * 100}%` }]}
            />
          </View>
          <View style={[styles.amountRow, { flexDirection: rtlFlexRow(isRTL) }]}>
            <Text style={styles.raisedAmount}>${raised.toLocaleString()}</Text>
            <Text style={styles.goalAmount}>{t('community.waqfGoalOf', { amount: goal.toLocaleString() })}</Text>
            <Text style={styles.percentText}>{Math.round(progress * 100)}%</Text>
          </View>

          <Pressable accessibilityRole="button" style={styles.contributeBtn} onPress={() => handleOpenContribute(item)}>
            <LinearGradient colors={[colors.gold, '#D4A94F']} style={styles.contributeBtnGradient}>
              <Icon name="heart" size="sm" color="#FFF" />
              <Text style={styles.contributeBtnText}>{t('community.contribute')}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </Animated.View>
    );
  };

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('community.waqfEndowments')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />

        {/* Info card */}
        <Animated.View entering={FadeInUp.duration(300)} style={styles.infoCard}>
          <LinearGradient colors={[colors.gold + '15', 'transparent']} style={[styles.infoGradient, { flexDirection: rtlFlexRow(isRTL) }]}>
            <Icon name="heart" size="md" color={colors.gold} />
            <Text style={styles.infoText}>
              {t('community.waqfDescription')}
            </Text>
          </LinearGradient>
        </Animated.View>

        <FlatList
          data={funds}
          renderItem={renderFund}
          keyExtractor={(item) => item.id as string}
          contentContainerStyle={styles.list}
          refreshControl={
            <BrandedRefreshControl refreshing={fundsQuery.isRefetching} onRefresh={() => fundsQuery.refetch()} />
          }
          onEndReached={() => fundsQuery.hasNextPage && fundsQuery.fetchNextPage()}
          ListEmptyComponent={
            fundsQuery.isLoading ? (
              <View style={styles.skeletons}>
                {[1, 2, 3].map(i => <Skeleton.Rect key={i} width="100%" height={180} borderRadius={radius.lg} />)}
              </View>
            ) : fundsQuery.isError ? (
              <EmptyState icon="alert-circle" title={t('common.error')} subtitle={t('common.tryAgain')} actionLabel={t('common.retry')} onAction={() => fundsQuery.refetch()} />
            ) : (
              <EmptyState icon="heart" title={t('community.noWaqfFunds')} subtitle={t('community.waqfHint')} />
            )
          }
        />

        {/* Contribution Amount Sheet */}
        <BottomSheet
          visible={contributeSheet}
          onClose={() => setContributeSheet(false)}
        >
          <Text style={styles.sheetTitle}>
            {t('community.contribute')}
          </Text>
          {selectedFund && (
            <Text style={styles.sheetFundName}>
              {selectedFund.title as string}
            </Text>
          )}

          {/* Preset amounts */}
          <View style={styles.sheetAmountGrid}>
            {WAQF_PRESET_AMOUNTS.map((amt) => {
              const isActive = !customAmount && selectedAmount === amt;
              return (
                <Pressable
                  key={amt}
                  accessibilityRole="button"
                  style={[
                    styles.sheetAmountChip,
                    isActive && styles.sheetAmountChipActive,
                  ]}
                  onPress={() => {
                    haptic.tick();
                    setSelectedAmount(amt);
                    setCustomAmount('');
                  }}
                >
                  <Text style={[styles.sheetAmountText, isActive && styles.sheetAmountTextActive]}>
                    ${amt}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Custom amount */}
          <View style={styles.sheetCustomRow}>
            <Text style={styles.sheetCurrencyPrefix}>$</Text>
            <TextInput
              style={styles.sheetCustomInput}
              placeholder={t('charity.custom', 'Custom')}
              placeholderTextColor={colors.text.tertiary}
              keyboardType="decimal-pad"
              value={customAmount}
              onChangeText={(text) => {
                const cleaned = text.replace(/[^0-9.]/g, '');
                if (cleaned.split('.').length <= 2) {
                  setCustomAmount(cleaned);
                }
              }}
            />
          </View>

          <View style={styles.sheetActions}>
            <GradientButton
              label={t('community.contribute')}
              onPress={handleContribute}
              loading={isProcessing}
              disabled={contributionAmount <= 0 || isProcessing}
              fullWidth
            />
          </View>
        </BottomSheet>
      </View>
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc.bg },
  infoCard: { marginHorizontal: spacing.base, marginBottom: spacing.md, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.gold + '20' },
  infoGradient: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.base, borderRadius: radius.lg },
  infoText: { color: tc.text.secondary, fontSize: fontSize.sm, flex: 1, lineHeight: 20 },
  list: { paddingHorizontal: spacing.base, paddingBottom: spacing['2xl'] },
  skeletons: { gap: spacing.md },
  fundCard: { backgroundColor: tc.bgCard, borderRadius: radius.lg, padding: spacing.base, borderWidth: 1, borderColor: tc.border, marginBottom: spacing.md },
  fundHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  fundIconWrap: { width: 44, height: 44, borderRadius: radius.full, backgroundColor: colors.gold + '15', justifyContent: 'center', alignItems: 'center' },
  fundTitle: { color: tc.text.primary, fontSize: fontSize.md, fontFamily: fonts.bodySemiBold },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  creatorName: { color: tc.text.secondary, fontSize: fontSize.xs },
  fundDesc: { color: tc.text.secondary, fontSize: fontSize.sm, marginBottom: spacing.md, lineHeight: 20 },
  progressTrack: { height: 6, backgroundColor: tc.surface, borderRadius: radius.sm, marginBottom: spacing.sm, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: radius.sm },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, marginBottom: spacing.md },
  raisedAmount: { color: colors.gold, fontSize: fontSize.md, fontFamily: fonts.bodyBold },
  goalAmount: { color: tc.text.tertiary, fontSize: fontSize.sm },
  percentText: { color: tc.text.secondary, fontSize: fontSize.xs, marginStart: 'auto' },
  contributeBtn: { borderRadius: radius.md, overflow: 'hidden' },
  contributeBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md, borderRadius: radius.md },
  contributeBtnText: { color: '#FFF', fontSize: fontSize.base, fontWeight: '700' },
  // Contribution sheet styles
  sheetTitle: { fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg, color: tc.text.primary, textAlign: 'center', marginBottom: spacing.sm },
  sheetFundName: { fontFamily: fonts.body, fontSize: fontSize.base, color: tc.text.secondary, textAlign: 'center', marginBottom: spacing.lg },
  sheetAmountGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  sheetAmountChip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: tc.bgCard, borderWidth: 1, borderColor: tc.border },
  sheetAmountChipActive: { borderColor: colors.gold, backgroundColor: colors.gold + '15' },
  sheetAmountText: { fontFamily: fonts.bodySemiBold, fontSize: fontSize.base, color: tc.text.secondary },
  sheetAmountTextActive: { color: colors.gold },
  sheetCustomRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: tc.bgCard, borderRadius: radius.md, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: tc.border, marginBottom: spacing.lg },
  sheetCurrencyPrefix: { fontFamily: fonts.bodySemiBold, fontSize: fontSize.md, color: tc.text.tertiary, marginEnd: spacing.xs },
  sheetCustomInput: { flex: 1, fontFamily: fonts.body, fontSize: fontSize.base, color: tc.text.primary, paddingVertical: spacing.md },
  sheetActions: { paddingVertical: spacing.md },
});
