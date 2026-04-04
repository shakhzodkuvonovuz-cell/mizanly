import { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { showToast } from '@/components/ui/Toast';
import { rtlFlexRow } from '@/utils/rtl';
import { islamicApi } from '@/services/islamicApi';
import type { CharityCampaign } from '@/types/islamic';

function CampaignScreenContent() {
  const { t, isRTL } = useTranslation();
  const tc = useThemeColors();
  const router = useRouter();
  const haptic = useContextualHaptic();
  const { id } = useLocalSearchParams<{ id: string }>();

  const campaignQuery = useQuery({
    queryKey: ['charity-campaign', id],
    queryFn: () => islamicApi.getCampaign(id!),
    enabled: !!id,
  });

  const handleRefresh = useCallback(() => {
    campaignQuery.refetch();
  }, [campaignQuery]);

  const handleDonate = () => {
    haptic.navigate();
    router.push({
      pathname: '/(screens)/donate' as never,
      params: { campaignId: id },
    });
  };

  const handleShare = async () => {
    const campaign = campaignQuery.data as CharityCampaign | undefined;
    if (!campaign) return;
    haptic.navigate();
    try {
      await Share.share({
        message: `${campaign.title} - Support this campaign on Mizanly!\nhttps://mizanly.app/charity/${campaign.id}`,
      });
    } catch {
      // User cancelled share
    }
  };

  const campaign = campaignQuery.data as CharityCampaign | undefined;
  const progressPercent = campaign && campaign.goalAmount > 0
    ? Math.min((campaign.raisedAmount / campaign.goalAmount) * 100, 100)
    : 0;

  const formatAmount = (cents: number): string => {
    return t('charity.currencyAmount', { amount: (cents / 100).toFixed(0) });
  };

  if (campaignQuery.isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('charity.campaign')}
          showBack
          rightAction={{ icon: 'share', onPress: () => {} }}
        />
        <View style={styles.skeletonContainer}>
          <Skeleton.Rect width="100%" height={200} borderRadius={radius.lg} />
          <Skeleton.Rect width="80%" height={24} borderRadius={radius.sm} />
          <Skeleton.Rect width="60%" height={16} borderRadius={radius.sm} />
          <Skeleton.Rect width="100%" height={8} borderRadius={radius.full} />
          <Skeleton.Rect width="40%" height={14} borderRadius={radius.sm} />
        </View>
      </View>
    );
  }

  if (campaignQuery.isError || !campaign) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader title={t('charity.campaign')} showBack />
        <View style={styles.emptyContainer}>
          <EmptyState
            icon="slash"
            title={t('common.error')}
            subtitle={campaignQuery.isError
              ? t('errors.loadContentFailed', 'Could not load campaign. Check your connection and try again.')
              : t('charity.campaignNotFound', 'Campaign not found')}
            actionLabel={t('common.retry', 'Retry')}
            onAction={() => campaignQuery.refetch()}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: tc.bg }]}>
      <GlassHeader
        title={t('charity.campaign')}
        showBack
        rightAction={{ icon: 'share', onPress: handleShare }}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <BrandedRefreshControl
            refreshing={campaignQuery.isFetching && !campaignQuery.isLoading}
            onRefresh={handleRefresh}
          />
        }
      >
        {/* Campaign image */}
        <Animated.View entering={FadeInUp.delay(50).duration(400)}>
          {campaign.imageUrl ? (
            <ProgressiveImage uri={campaign.imageUrl} width="100%" height={200} borderRadius={radius.lg} style={styles.campaignImageMargin} />
          ) : (
            <View style={[styles.imagePlaceholder, { backgroundColor: tc.bgCard }]}>
              <Icon name="heart" size="xl" color={colors.emerald} />
            </View>
          )}
        </Animated.View>

        {/* Title & description */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)}>
          <Text style={[styles.title, { color: tc.text.primary }]}>{campaign.title}</Text>
          {campaign.description && (
            <Text style={[styles.description, { color: tc.text.secondary }]}>{campaign.description}</Text>
          )}
        </Animated.View>

        {/* Progress section */}
        <Animated.View entering={FadeInUp.delay(150).duration(400)}>
          <View style={styles.progressSection}>
            <View style={[styles.progressBarBg, { backgroundColor: tc.surface }]}>
              <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
            </View>
            <View style={[styles.progressStats, { flexDirection: rtlFlexRow(isRTL) }]}>
              <Text style={[styles.raisedText, { color: tc.text.secondary }]}>
                {t('charity.raised', {
                  amount: formatAmount(campaign.raisedAmount),
                  goal: formatAmount(campaign.goalAmount),
                })}
              </Text>
              <Text style={styles.percentText}>{Math.round(progressPercent)}%</Text>
            </View>
          </View>
        </Animated.View>

        {/* Donor count */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)}>
          <View style={[styles.donorBadge, { backgroundColor: tc.bgCard, flexDirection: rtlFlexRow(isRTL) }]}>
            <Icon name="users" size="sm" color={colors.gold} />
            <Text style={styles.donorText}>
              {t('charity.donors', { count: campaign.donorCount })}
            </Text>
          </View>
        </Animated.View>

        {/* CTA */}
        <Animated.View entering={FadeInUp.delay(250).duration(400)}>
          <View style={styles.ctaContainer}>
            <GradientButton
              label={t('charity.donateNow')}
              onPress={handleDonate}
              fullWidth
              accessibilityLabel={t('charity.donateNow')}
              accessibilityRole="button"
            />
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

export default function CharityCampaignScreen() {
  return (
    <ScreenErrorBoundary>
      <CampaignScreenContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
  },
  skeletonContainer: {
    padding: spacing.base,
    gap: spacing.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: fontSize.base,
  },
  // Image
  campaignImageMargin: {
    marginBottom: spacing.base,
  },
  imagePlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.base,
  },
  // Title & description
  title: {
    fontSize: fontSize.xl,
    fontFamily: fonts.headingBold,
  },
  description: {
    fontSize: fontSize.base,
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  // Progress
  progressSection: {
    marginTop: spacing.lg,
  },
  progressBarBg: {
    height: 8,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.emerald,
    borderRadius: radius.full,
  },
  progressStats: {
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  raisedText: {
    fontSize: fontSize.sm,
  },
  percentText: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  // Donor badge
  donorBadge: {
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    marginTop: spacing.lg,
  },
  donorText: {
    color: colors.gold,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  // CTA
  ctaContainer: {
    marginTop: spacing.xl,
  },
});
