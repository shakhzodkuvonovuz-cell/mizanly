import { useState, useCallback } from 'react';
import { formatCompactNumber } from '@/utils/localeFormat';
import { View, Text, StyleSheet, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp, FadeIn, useSharedValue, useAnimatedStyle, withSpring, withSequence, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, fontSize, fontSizeExt, radius, fonts } from '@/theme';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { usersApi } from '@/services/api';
import { creatorApi } from '@/services/creatorApi';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import type { CreatorStat } from '@/types';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { navigate } from '@/utils/navigation';

interface AnalyticsResponse {
  stats: CreatorStat[];
}

function SummaryCard({ title, value, change, icon, index }: { title: string; value: string; change?: string; icon: IconName; index: number }) {
  const tc = useThemeColors();
  const isPositive = change?.startsWith('+');
  const isNegative = change?.startsWith('-');
  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 15) * 100).duration(500)} style={styles.cardContainer}>
      <LinearGradient
        colors={['rgba(45,53,72,0.5)', 'rgba(28,35,51,0.3)']}
        style={styles.cardGradient}
      >
        <View style={styles.cardHeader}>
          <LinearGradient
            colors={['rgba(10,123,79,0.3)', 'rgba(200,150,62,0.2)']}
            style={styles.cardIconBg}
          >
            <Icon name={icon} size="xs" color={colors.emerald} />
          </LinearGradient>
          <Text style={[styles.cardTitle, { color: tc.text.secondary }]}>{title}</Text>
        </View>
        <Text style={[styles.cardValue, { color: tc.text.primary }]}>{value}</Text>
        {change && (
          <View style={styles.changeRow}>
            <Icon
              name={isPositive ? 'trending-up' : isNegative ? 'trending-down' : 'minus'}
              size="xs"
              color={isPositive ? colors.success : isNegative ? colors.error : tc.text.tertiary}
            />
            <Text style={[
              styles.cardChange,
              { color: tc.text.tertiary },
              isPositive && styles.positive,
              isNegative && styles.negative
            ]}>
              {change}
            </Text>
          </View>
        )}
      </LinearGradient>
    </Animated.View>
  );
}

function BarChart({ stats }: { stats: CreatorStat[] }) {
  const { t } = useTranslation();
  const tc = useThemeColors();
  const [focusedBar, setFocusedBar] = useState<string | null>(null);
  if (!stats.length) return null;

  // Aggregate views per day (sum across spaces)
  const dailyViews: Record<string, number> = {};
  stats.forEach(stat => {
    const date = stat.date.split('T')[0];
    dailyViews[date] = (dailyViews[date] || 0) + stat.views;
  });

  const dates = Object.keys(dailyViews).sort(); // ascending
  const values = dates.map(d => dailyViews[d]);
  const maxViews = Math.max(...values, 1);

  return (
    <Animated.View entering={FadeInUp.delay(300).duration(500)} style={styles.chartContainer}>
      <View style={styles.sectionHeader}>
        <LinearGradient
          colors={['rgba(200,150,62,0.3)', 'rgba(200,150,62,0.1)']}
          style={styles.sectionIconBg}
        >
          <Icon name="bar-chart-2" size="xs" color={colors.gold} />
        </LinearGradient>
        <Text style={[styles.sectionTitle, { color: tc.text.primary }]}>{t('analytics.engagementOverTime')}</Text>
      </View>
      <LinearGradient
        colors={['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.15)']}
        style={styles.chartBg}
      >
        <View style={styles.chart}>
          {dates.map((date, i) => (
            <Pressable
              key={date}
              style={styles.barWrapper}
              onLongPress={() => setFocusedBar(focusedBar === date ? null : date)}
              accessibilityRole="button"
              accessibilityLabel={`${new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${formatCompactNumber(values[i])} ${t('analytics.views', 'views')}`}
            >
              {focusedBar === date && (
                <View style={styles.barTooltip}>
                  <Text style={styles.barTooltipText}>{formatCompactNumber(values[i])}</Text>
                </View>
              )}
              <LinearGradient
                colors={[colors.emerald, colors.gold]}
                style={[
                  styles.bar,
                  { height: Math.max(4, (values[i] / maxViews) * 100) }
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
              />
              <Text style={[styles.barLabel, { color: tc.text.tertiary }]}>
                {new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </Text>
            </Pressable>
          ))}
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

function TopContentSection() {
  const { t } = useTranslation();
  const tc = useThemeColors();
  // Top content analytics require backend data pipeline unification.
  // Show honest empty state explaining what's needed, not a fake "Coming Soon".
  return (
    <Animated.View entering={FadeInUp.delay(400).duration(500)} style={styles.section}>
      <View style={styles.sectionHeader}>
        <LinearGradient
          colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
          style={styles.sectionIconBg}
        >
          <Icon name="trending-up" size="xs" color={colors.emerald} />
        </LinearGradient>
        <Text style={[styles.sectionTitle, { color: tc.text.primary }]}>{t('analytics.topPerformingContent')}</Text>
      </View>
      <LinearGradient
        colors={['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.15)']}
        style={styles.topContentCard}
      >
        <EmptyState
          icon="bar-chart-2"
          title={t('analytics.notEnoughData', 'Not enough data')}
          subtitle={t('analytics.topContentHint', 'Post more content to see which posts perform best')}
        />
      </LinearGradient>
    </Animated.View>
  );
}

type GrowthPeriod = '7d' | '30d';

function FollowerGrowthChart() {
  const { t } = useTranslation();
  const tc = useThemeColors();
  const haptic = useContextualHaptic();
  const [period, setPeriod] = useState<GrowthPeriod>('7d');
  // #251: Spring animation on period toggle
  const toggleScale = useSharedValue(1);
  const toggleAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: toggleScale.value }],
  }));

  const { data: growthData, isLoading: growthLoading } = useQuery({
    queryKey: ['creator-growth'],
    queryFn: () => creatorApi.getGrowth(),
  });

  const daily = (growthData as { daily?: Record<string, number> })?.daily ?? {};
  const allDates = Object.keys(daily).sort();

  // Filter to last 7 or 30 days
  const now = new Date();
  const daysToShow = period === '7d' ? 7 : 30;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - daysToShow);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const filteredDates = allDates.filter((d) => d >= cutoffStr);
  const values = filteredDates.map((d) => daily[d] ?? 0);
  const maxValue = Math.max(...values, 1);
  const totalNew = values.reduce((sum, v) => sum + v, 0);

  return (
    <Animated.View entering={FadeInUp.delay(350).duration(500)} style={styles.growthContainer}>
      <View style={styles.sectionHeader}>
        <LinearGradient
          colors={['rgba(10,123,79,0.3)', 'rgba(200,150,62,0.2)']}
          style={styles.sectionIconBg}
        >
          <Icon name="users" size="xs" color={colors.emerald} />
        </LinearGradient>
        <Text style={[styles.sectionTitle, { color: tc.text.primary }]}>
          {t('analytics.followerGrowth', 'Follower Growth')}
        </Text>
      </View>

      {/* Period Toggle — #251: spring animation on switch */}
      <Animated.View style={[styles.periodToggle, toggleAnimStyle]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setPeriod('7d');
            haptic.tick();
            toggleScale.value = withSequence(
              withTiming(0.95, { duration: 80 }),
              withSpring(1, { damping: 12, stiffness: 200 }),
            );
          }}
          style={({ pressed }) => [
            styles.periodTab,
            period === '7d' && styles.periodTabActive,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={[
            styles.periodTabText,
            { color: period === '7d' ? colors.emerald : tc.text.tertiary },
          ]}>
            {t('analytics.last7Days', '7 Days')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setPeriod('30d');
            haptic.tick();
            toggleScale.value = withSequence(
              withTiming(0.95, { duration: 80 }),
              withSpring(1, { damping: 12, stiffness: 200 }),
            );
          }}
          style={({ pressed }) => [
            styles.periodTab,
            period === '30d' && styles.periodTabActive,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={[
            styles.periodTabText,
            { color: period === '30d' ? colors.emerald : tc.text.tertiary },
          ]}>
            {t('analytics.last30Days', '30 Days')}
          </Text>
        </Pressable>
      </Animated.View>

      <LinearGradient
        colors={['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.15)']}
        style={styles.growthChartBg}
      >
        {growthLoading ? (
          <View style={{ padding: spacing.md }}>
            <Skeleton.Rect width="100%" height={120} borderRadius={radius.sm} />
          </View>
        ) : filteredDates.length === 0 ? (
          <EmptyState
            icon="users"
            title={t('analytics.noGrowthData', 'No growth data yet')}
            subtitle={t('analytics.noGrowthDataSubtitle', 'Follower growth data will appear as your audience grows')}
          />
        ) : (
          <>
            <View style={styles.growthSummary}>
              <Text style={[styles.growthNewCount, { color: tc.text.primary }]}>
                +{formatCompactNumber(totalNew)}
              </Text>
              <Text style={[styles.growthNewLabel, { color: tc.text.secondary }]}>
                {t('analytics.newFollowers', 'new followers')}
              </Text>
            </View>
            <View style={styles.growthChart}>
              {filteredDates.map((date, i) => (
                <View key={date} style={styles.growthBarWrapper}>
                  <View
                    style={[
                      styles.growthBar,
                      {
                        height: Math.max(4, (values[i] / maxValue) * 120),
                        backgroundColor: colors.emerald,
                      },
                    ]}
                  />
                  <Text style={[styles.growthBarLabel, { color: tc.text.tertiary }]}>
                    {period === '7d'
                      ? new Date(date).toLocaleDateString(undefined, { weekday: 'short' })
                      : new Date(date).toLocaleDateString(undefined, { day: 'numeric' })}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </LinearGradient>
    </Animated.View>
  );
}

// TODO [cross-scope]: This screen uses usersApi.getAnalytics() (GET /users/me/analytics)
// while creator-dashboard uses creatorApi.getOverview() (GET /creator/analytics/overview).
// These are two separate data sources that may show inconsistent numbers.
// Should be unified into a single analytics data pipeline.
const HEADER_OFFSET = spacing['2xl'] * 3;

function AnalyticsContent() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { t } = useTranslation();
  const tc = useThemeColors();
  const { width: screenWidth } = useWindowDimensions();

  const { data, isLoading, error, refetch } = useQuery<AnalyticsResponse>({
    queryKey: ['analytics'],
    queryFn: () => usersApi.getAnalytics(),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const stats = data?.stats || [];

  // Calculate totals across all stats
  const totalViews = stats.reduce((sum, stat) => sum + stat.views, 0);
  const totalLikes = stats.reduce((sum, stat) => sum + stat.likes, 0);
  const totalFollowers = stats.reduce((sum, stat) => sum + stat.followers, 0);

  // Format numbers (locale-aware)
  const formatNumber = formatCompactNumber;

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader
          title={t('analytics.creatorAnalytics')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />
        <View style={{ paddingTop: HEADER_OFFSET }}>
          <EmptyState
            icon="flag"
            title={t('analytics.failedToLoad')}
            subtitle={t('analytics.tryAgainLater')}
            actionLabel={t('common.retry')}
            onAction={() => refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
      <GlassHeader
        title={t('analytics.creatorAnalytics')}
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <BrandedRefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <>
            <View style={styles.cards}>
              <Skeleton.Rect width={(screenWidth - spacing.base * 3) / 3} height={100} borderRadius={radius.md} />
              <Skeleton.Rect width={(screenWidth - spacing.base * 3) / 3} height={100} borderRadius={radius.md} />
              <Skeleton.Rect width={(screenWidth - spacing.base * 3) / 3} height={100} borderRadius={radius.md} />
            </View>
            <View style={styles.section}>
              <Skeleton.Rect width="60%" height={20} borderRadius={radius.sm} />
              <Skeleton.Rect width="100%" height={150} borderRadius={radius.md} style={{ marginTop: spacing.md }} />
            </View>
            <View style={styles.section}>
              <Skeleton.Rect width="60%" height={20} borderRadius={radius.sm} />
              <Skeleton.Rect width="100%" height={120} borderRadius={radius.md} style={{ marginTop: spacing.md }} />
            </View>
          </>
        ) : stats.length === 0 ? (
          <EmptyState
            icon="bar-chart-2"
            title={t('analytics.noDataYet')}
            subtitle={t('analytics.noDataSubtitle')}
            actionLabel={t('analytics.startCreating')}
            onAction={() => navigate('/(screens)/create-post')}
          />
        ) : (
          <>
            <View style={styles.cards}>
              <SummaryCard
                title={t('analytics.views')}
                value={formatNumber(totalViews)}
                icon="eye"
                index={0}
              />
              <SummaryCard
                title={t('analytics.likes')}
                value={formatNumber(totalLikes)}
                icon="heart"
                index={1}
              />
              <SummaryCard
                title={t('analytics.followers')}
                value={formatNumber(totalFollowers)}
                icon="users"
                index={2}
              />
            </View>

            <BarChart stats={stats} />

            <FollowerGrowthChart />

            <TopContentSection />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function AnalyticsScreen() {
  return (
    <ScreenErrorBoundary>
      <AnalyticsContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
    paddingTop: HEADER_OFFSET,
  },
  cards: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  // Premium glassmorphism cards
  cardContainer: {
    flex: 1,
  },
  cardGradient: {
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  cardIconBg: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: fontSize.xs,
    fontFamily: fonts.bodyMedium,
  },
  cardValue: {
    fontSize: fontSize.xl,
    fontFamily: fonts.bodyBold,
    marginBottom: spacing.xs,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardChange: {
    fontSize: fontSize.xs,
    fontFamily: fonts.bodyMedium,
  },
  positive: {
    color: colors.success,
  },
  negative: {
    color: colors.error,
  },
  // Section headers with icons
  section: {
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionIconBg: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: fontSize.base,
    fontFamily: fonts.bodySemiBold,
  },
  // Chart with glassmorphism
  chartContainer: {
    marginBottom: spacing.xl,
  },
  chartBg: {
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 130,
    paddingTop: spacing.md,
  },
  barWrapper: {
    alignItems: 'center',
    flex: 1,
  },
  bar: {
    width: 6,
    borderRadius: radius.full,
    marginBottom: spacing.xs,
  },
  barLabel: {
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  barTooltip: {
    backgroundColor: colors.emerald,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginBottom: spacing.xs,
  },
  barTooltipText: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  // Follower growth
  growthContainer: {
    marginBottom: spacing.xl,
  },
  periodToggle: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  periodTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  periodTabActive: {
    borderColor: colors.emerald,
    backgroundColor: colors.active.emerald10,
  },
  periodTabText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
  },
  growthChartBg: {
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  growthSummary: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  growthNewCount: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSize.xl,
  },
  growthNewLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
  },
  growthChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 150,
    paddingTop: spacing.md,
  },
  growthBarWrapper: {
    alignItems: 'center',
    flex: 1,
  },
  growthBar: {
    width: 8,
    borderRadius: radius.sm,
    marginBottom: spacing.xs,
  },
  growthBarLabel: {
    fontSize: fontSizeExt.micro,
    fontFamily: fonts.body,
    marginTop: spacing.xs,
  },

  // Top content section
  topContentCard: {
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
});