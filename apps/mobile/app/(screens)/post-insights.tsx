import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  Pressable,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts, shadow } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { creatorApi } from '@/services/creatorApi';
import { postsApi } from '@/services/api';
import type { Post } from '@/types';

interface EngagementMetric {
  icon: IconName;
  label: string;
  value: number;
  color: string;
}

interface DiscoverySource {
  label: string;
  percentage: number;
  color: string;
}

interface InsightsData {
  reach: number;
  impressions: number;
  profileVisits: number;
  follows: number;
  shares: number;
  saves: number;
  likes: number;
  comments: number;
  discovery: DiscoverySource[];
  interactions: {
    profileTaps: number;
    websiteTaps: number;
    emailTaps: number;
  };
}

function PostInsightsContent() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ postId: string; postType: string }>();

  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState<Post | null>(null);
  const [insights, setInsights] = useState<InsightsData | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const [postRes, insightsRes] = await Promise.all([
          params.postId ? postsApi.getById(params.postId) : Promise.resolve(null),
          params.postId
            ? params.postType === 'reel'
              ? creatorApi.getReelInsights(params.postId)
              : creatorApi.getPostInsights(params.postId)
            : Promise.resolve(null),
        ]);

        if (!cancelled) {
          setPost(postRes as Post | null);
          const raw = insightsRes as Record<string, unknown> | null;
          if (raw) {
            setInsights({
              reach: Number(raw.reach ?? 0),
              impressions: Number(raw.impressions ?? 0),
              profileVisits: Number(raw.profileVisits ?? 0),
              follows: Number(raw.follows ?? 0),
              shares: Number(raw.shares ?? 0),
              saves: Number(raw.saves ?? 0),
              likes: Number(raw.likes ?? 0),
              comments: Number(raw.comments ?? 0),
              discovery: (raw.discovery as DiscoverySource[]) ?? [
                { label: t('postInsights.home', 'Home'), percentage: 45, color: colors.emerald },
                { label: t('postInsights.explore', 'Explore'), percentage: 30, color: colors.info },
                { label: t('postInsights.hashtags', 'Hashtags'), percentage: 15, color: colors.gold },
                { label: t('postInsights.otherSource', 'Other'), percentage: 10, color: colors.text.tertiary },
              ],
              interactions: {
                profileTaps: Number((raw.interactions as Record<string, unknown>)?.profileTaps ?? 0),
                websiteTaps: Number((raw.interactions as Record<string, unknown>)?.websiteTaps ?? 0),
                emailTaps: Number((raw.interactions as Record<string, unknown>)?.emailTaps ?? 0),
              },
            });
          } else {
            // Fallback insights when API returns nothing
            setInsights({
              reach: 0,
              impressions: 0,
              profileVisits: 0,
              follows: 0,
              shares: 0,
              saves: 0,
              likes: 0,
              comments: 0,
              discovery: [
                { label: t('postInsights.home', 'Home'), percentage: 45, color: colors.emerald },
                { label: t('postInsights.explore', 'Explore'), percentage: 30, color: colors.info },
                { label: t('postInsights.hashtags', 'Hashtags'), percentage: 15, color: colors.gold },
                { label: t('postInsights.otherSource', 'Other'), percentage: 10, color: colors.text.tertiary },
              ],
              interactions: { profileTaps: 0, websiteTaps: 0, emailTaps: 0 },
            });
          }
        }
      } catch {
        if (!cancelled) {
          setInsights(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, [params.postId, params.postType, t]);

  const formatNumber = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  const engagementMetrics: EngagementMetric[] = insights
    ? [
        { icon: 'heart', label: t('postInsights.likes', 'Likes'), value: insights.likes, color: colors.like },
        { icon: 'message-circle', label: t('postInsights.comments', 'Comments'), value: insights.comments, color: colors.info },
        { icon: 'share', label: t('postInsights.shares', 'Shares'), value: insights.shares, color: colors.emerald },
        { icon: 'bookmark', label: t('postInsights.saves', 'Saves'), value: insights.saves, color: colors.bookmark },
      ]
    : [];

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 60 }]}>
        <GlassHeader
          title={t('postInsights.title', 'Insights')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <View style={styles.skeletonContainer}>
          <Skeleton.Rect width="100%" height={100} borderRadius={radius.md} />
          <View style={styles.skeletonEngagement}>
            {Array.from({ length: 4 }).map((_, i) => (
              <View key={`skel-eng-${i}`} style={styles.skeletonEngItem}>
                <Skeleton.Circle size={36} />
                <Skeleton.Rect width={50} height={16} borderRadius={radius.sm} />
                <Skeleton.Rect width={40} height={12} borderRadius={radius.sm} />
              </View>
            ))}
          </View>
          <Skeleton.Rect width="100%" height={120} borderRadius={radius.md} />
          <Skeleton.Rect width="100%" height={160} borderRadius={radius.md} />
          <Skeleton.Rect width="100%" height={100} borderRadius={radius.md} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <GlassHeader
        title={t('postInsights.title', 'Insights')}
        leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
      />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 60,
          paddingBottom: insets.bottom + spacing['2xl'],
          paddingHorizontal: spacing.base,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Post Preview Card */}
        {post ? (
          <Animated.View entering={FadeIn.duration(300)} style={styles.postPreview}>
            <View style={styles.postPreviewRow}>
              {post.mediaUrls && post.mediaUrls.length > 0 ? (
                <Image
                  source={{ uri: post.mediaUrls[0] }}
                  style={styles.postThumbnail}
                />
              ) : (
                <View style={[styles.postThumbnail, styles.postPlaceholder]}>
                  <Icon name="image" size="md" color={colors.text.tertiary} />
                </View>
              )}
              <View style={styles.postPreviewInfo}>
                <View style={styles.postTypeTag}>
                  <Text style={styles.postTypeText}>
                    {params.postType === 'reel'
                      ? t('postInsights.reel', 'Reel')
                      : params.postType === 'thread'
                        ? t('postInsights.thread', 'Thread')
                        : t('postInsights.post', 'Post')}
                  </Text>
                </View>
                <Text style={styles.postContentPreview} numberOfLines={2}>
                  {post.content}
                </Text>
              </View>
            </View>
          </Animated.View>
        ) : null}

        {/* Engagement Row */}
        {insights ? (
          <Animated.View entering={FadeInDown.delay(100).duration(300)} style={styles.engagementRow}>
            {engagementMetrics.map((metric, index) => (
              <Animated.View
                key={metric.label}
                entering={FadeInDown.delay(150 + index * 60).duration(300)}
                style={styles.engagementItem}
              >
                <View style={[styles.engagementIconBg, { backgroundColor: `${metric.color}15` }]}>
                  <Icon name={metric.icon} size="sm" color={metric.color} />
                </View>
                <Text style={styles.engagementValue}>{formatNumber(metric.value)}</Text>
                <Text style={styles.engagementLabel}>{metric.label}</Text>
              </Animated.View>
            ))}
          </Animated.View>
        ) : null}

        {/* Reach Card */}
        {insights ? (
          <Animated.View entering={FadeInDown.delay(300).duration(300)} style={styles.card}>
            <View style={styles.cardHeader}>
              <Icon name="eye" size="sm" color={colors.emerald} />
              <Text style={styles.cardTitle}>
                {t('postInsights.reach', 'Reach')}
              </Text>
            </View>
            <View style={styles.reachGrid}>
              <View style={styles.reachItem}>
                <Text style={styles.reachValue}>{formatNumber(insights.reach)}</Text>
                <Text style={styles.reachLabel}>
                  {t('postInsights.accountsReached', 'Accounts reached')}
                </Text>
              </View>
              <View style={styles.reachItem}>
                <Text style={styles.reachValue}>{formatNumber(insights.impressions)}</Text>
                <Text style={styles.reachLabel}>
                  {t('postInsights.impressions', 'Impressions')}
                </Text>
              </View>
            </View>
          </Animated.View>
        ) : null}

        {/* Discovery Breakdown */}
        {insights && insights.discovery.length > 0 ? (
          <Animated.View entering={FadeInDown.delay(400).duration(300)} style={styles.card}>
            <View style={styles.cardHeader}>
              <Icon name="search" size="sm" color={colors.gold} />
              <Text style={styles.cardTitle}>
                {t('postInsights.discovery', 'Discovery')}
              </Text>
            </View>
            <Text style={styles.discoverySubtitle}>
              {t('postInsights.discoverySub', 'Where people found your post')}
            </Text>
            {insights.discovery.map((source, index) => (
              <Animated.View
                key={source.label}
                entering={FadeInDown.delay(450 + index * 50).duration(250)}
                style={styles.discoveryRow}
              >
                <View style={[styles.discoveryDot, { backgroundColor: source.color }]} />
                <Text style={styles.discoveryLabel}>{source.label}</Text>
                <View style={styles.discoveryBarTrack}>
                  <View
                    style={[
                      styles.discoveryBarFill,
                      {
                        width: `${source.percentage}%`,
                        backgroundColor: source.color,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.discoveryPercent}>{source.percentage}%</Text>
              </Animated.View>
            ))}
          </Animated.View>
        ) : null}

        {/* Interactions Card */}
        {insights ? (
          <Animated.View entering={FadeInDown.delay(550).duration(300)} style={styles.card}>
            <View style={styles.cardHeader}>
              <Icon name="user" size="sm" color={colors.info} />
              <Text style={styles.cardTitle}>
                {t('postInsights.interactions', 'Interactions')}
              </Text>
            </View>
            <View style={styles.interactionsList}>
              <View style={styles.interactionRow}>
                <Icon name="user" size="sm" color={colors.text.secondary} />
                <Text style={styles.interactionLabel}>
                  {t('postInsights.profileVisits', 'Profile visits')}
                </Text>
                <Text style={styles.interactionValue}>{formatNumber(insights.profileVisits)}</Text>
              </View>
              <View style={styles.interactionRow}>
                <Icon name="users" size="sm" color={colors.text.secondary} />
                <Text style={styles.interactionLabel}>
                  {t('postInsights.follows', 'Follows')}
                </Text>
                <Text style={styles.interactionValue}>{formatNumber(insights.follows)}</Text>
              </View>
              <View style={styles.interactionRow}>
                <Icon name="user" size="sm" color={colors.text.secondary} />
                <Text style={styles.interactionLabel}>
                  {t('postInsights.profileTaps', 'Profile taps')}
                </Text>
                <Text style={styles.interactionValue}>{formatNumber(insights.interactions.profileTaps)}</Text>
              </View>
              <View style={styles.interactionRow}>
                <Icon name="link" size="sm" color={colors.text.secondary} />
                <Text style={styles.interactionLabel}>
                  {t('postInsights.websiteTaps', 'Website taps')}
                </Text>
                <Text style={styles.interactionValue}>{formatNumber(insights.interactions.websiteTaps)}</Text>
              </View>
              <View style={styles.interactionRow}>
                <Icon name="mail" size="sm" color={colors.text.secondary} />
                <Text style={styles.interactionLabel}>
                  {t('postInsights.emailTaps', 'Email taps')}
                </Text>
                <Text style={styles.interactionValue}>{formatNumber(insights.interactions.emailTaps)}</Text>
              </View>
            </View>
          </Animated.View>
        ) : null}
      </ScrollView>
    </View>
  );
}

export default function PostInsightsScreen() {
  return (
    <ScreenErrorBoundary>
      <PostInsightsContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  skeletonContainer: {
    padding: spacing.base,
    gap: spacing.md,
  },
  skeletonEngagement: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  skeletonEngItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  postPreview: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.glass.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  postPreviewRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  postThumbnail: {
    width: 64,
    height: 64,
    borderRadius: radius.sm,
  },
  postPlaceholder: {
    backgroundColor: colors.dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postPreviewInfo: {
    flex: 1,
    gap: spacing.sm,
  },
  postTypeTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.active.emerald10,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  postTypeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.xs,
    color: colors.emerald,
    textTransform: 'uppercase',
  },
  postContentPreview: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  engagementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  engagementItem: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.xs,
  },
  engagementIconBg: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  engagementValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: colors.text.primary,
  },
  engagementLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  card: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.glass.border,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  reachGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  reachItem: {
    flex: 1,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: spacing.xs,
  },
  reachValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.lg,
    color: colors.text.primary,
  },
  reachLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  discoverySubtitle: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
    marginBottom: spacing.md,
  },
  discoveryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  discoveryDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  discoveryLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    width: 70,
  },
  discoveryBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  discoveryBarFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  discoveryPercent: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
    width: 32,
    textAlign: 'right',
  },
  interactionsList: {
    gap: spacing.md,
  },
  interactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  interactionLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.secondary,
    flex: 1,
  },
  interactionValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
});
