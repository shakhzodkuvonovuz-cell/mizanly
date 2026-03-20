import { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Share,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, radius, fontSize } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { islamicApi } from '@/services/islamicApi';
import type { CharityCampaign } from '@/types/islamic';

function CampaignScreenContent() {
  const { t } = useTranslation();
  const router = useRouter();
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
    router.push({
      pathname: '/(screens)/donate' as never,
      params: { campaignId: id },
    });
  };

  const handleShare = async () => {
    const campaign = campaignQuery.data as CharityCampaign | undefined;
    if (!campaign) return;
    try {
      await Share.share({
        message: `${campaign.title} - Support this campaign on Mizanly!\nhttps://mizanly.app/charity/${campaign.id}`,
      });
    } catch {
      // User cancelled share
    }
  };

  const campaign = campaignQuery.data as CharityCampaign | undefined;
  const progressPercent = campaign
    ? Math.min((campaign.raisedAmount / campaign.goalAmount) * 100, 100)
    : 0;

  const formatAmount = (cents: number): string => {
    return `$${(cents / 100).toFixed(0)}`;
  };

  if (campaignQuery.isLoading) {
    return (
      <View style={styles.container}>
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

  if (!campaign) {
    return (
      <View style={styles.container}>
        <GlassHeader title={t('charity.campaign')} showBack />
        <View style={styles.emptyContainer}>
          <EmptyState icon="slash" title={t('common.error')} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GlassHeader
        title={t('charity.campaign')}
        showBack
        rightAction={{ icon: 'share', onPress: handleShare }}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={campaignQuery.isFetching && !campaignQuery.isLoading}
            onRefresh={handleRefresh}
            tintColor={colors.emerald}
          />
        }
      >
        {/* Campaign image */}
        {campaign.imageUrl ? (
          <Image source={{ uri: campaign.imageUrl }} style={styles.campaignImage} />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Icon name="heart" size="xl" color={colors.emerald} />
          </View>
        )}

        {/* Title & description */}
        <Text style={styles.title}>{campaign.title}</Text>
        {campaign.description && (
          <Text style={styles.description}>{campaign.description}</Text>
        )}

        {/* Progress section */}
        <View style={styles.progressSection}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
          </View>
          <View style={styles.progressStats}>
            <Text style={styles.raisedText}>
              {t('charity.raised', {
                amount: formatAmount(campaign.raisedAmount),
                goal: formatAmount(campaign.goalAmount),
              })}
            </Text>
            <Text style={styles.percentText}>{Math.round(progressPercent)}%</Text>
          </View>
        </View>

        {/* Donor count */}
        <View style={styles.donorBadge}>
          <Icon name="users" size="sm" color={colors.gold} />
          <Text style={styles.donorText}>
            {t('charity.donors', { count: campaign.donorCount })}
          </Text>
        </View>

        {/* CTA */}
        <View style={styles.ctaContainer}>
          <GradientButton
            label={t('charity.donateNow')}
            onPress={handleDonate}
            fullWidth
            accessibilityLabel={t('charity.donateNow')}
            accessibilityRole="button"
          />
        </View>
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
    backgroundColor: colors.dark.bg,
  },
  scrollContent: {
    padding: spacing.base,
    paddingBottom: spacing['2xl'],
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
    color: colors.text.secondary,
    fontSize: fontSize.base,
  },
  // Image
  campaignImage: {
    width: '100%',
    height: 200,
    borderRadius: radius.lg,
    marginBottom: spacing.base,
  },
  imagePlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: radius.lg,
    backgroundColor: colors.dark.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.base,
  },
  // Title & description
  title: {
    color: colors.text.primary,
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  description: {
    color: colors.text.secondary,
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
    backgroundColor: colors.dark.surface,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.emerald,
    borderRadius: radius.full,
  },
  progressStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  raisedText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  percentText: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  // Donor badge
  donorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.dark.bgCard,
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
