import { useState, useCallback } from 'react';
import { formatCompactNumber } from '@/utils/localeFormat';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { usersApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import type { CreatorStat } from '@/types';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { navigate } from '@/utils/navigation';

interface AnalyticsResponse {
  stats: CreatorStat[];
}

const { width: screenWidth } = Dimensions.get('window');

function SummaryCard({ title, value, change, icon, index }: { title: string; value: string; change?: string; icon: IconName; index: number }) {
  const isPositive = change?.startsWith('+');
  const isNegative = change?.startsWith('-');
  return (
    <Animated.View entering={FadeInUp.delay(index * 100).duration(500)} style={styles.cardContainer}>
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
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        <Text style={styles.cardValue}>{value}</Text>
        {change && (
          <View style={styles.changeRow}>
            <Icon
              name={isPositive ? 'trending-up' : isNegative ? 'trending-down' : 'minus'}
              size="xs"
              color={isPositive ? colors.success : isNegative ? colors.error : colors.text.tertiary}
            />
            <Text style={[
              styles.cardChange,
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
        <Text style={styles.sectionTitle}>{t('analytics.engagementOverTime')}</Text>
      </View>
      <LinearGradient
        colors={['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.15)']}
        style={styles.chartBg}
      >
        <View style={styles.chart}>
          {dates.map((date, i) => (
            <View key={date} style={styles.barWrapper}>
              <LinearGradient
                colors={[colors.emerald, colors.gold]}
                style={[
                  styles.bar,
                  { height: Math.max(4, (values[i] / maxViews) * 100) }
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
              />
              <Text style={styles.barLabel}>
                {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
            </View>
          ))}
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

function TopContentSection() {
  const { t } = useTranslation();
  // Placeholder for top performing content
  return (
    <Animated.View entering={FadeInUp.delay(400).duration(500)} style={styles.section}>
      <View style={styles.sectionHeader}>
        <LinearGradient
          colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
          style={styles.sectionIconBg}
        >
          <Icon name="trending-up" size="xs" color={colors.emerald} />
        </LinearGradient>
        <Text style={styles.sectionTitle}>{t('analytics.topPerformingContent')}</Text>
      </View>
      <LinearGradient
        colors={['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.15)']}
        style={styles.topContentCard}
      >
        <EmptyState
          icon="bar-chart-2"
          title={t('analytics.noContentData')}
          subtitle={t('analytics.noContentDataSubtitle')}
        />
      </LinearGradient>
    </Animated.View>
  );
}

export default function AnalyticsScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { t } = useTranslation();

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
        <View style={{ paddingTop: 100 }}>
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
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader
          title={t('analytics.creatorAnalytics')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.emerald}
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
                  change={totalViews > 0 ? '+' + formatNumber(totalViews) : undefined}
                  icon="eye"
                  index={0}
                />
                <SummaryCard
                  title={t('analytics.likes')}
                  value={formatNumber(totalLikes)}
                  change={totalLikes > 0 ? '+' + formatNumber(totalLikes) : undefined}
                  icon="heart"
                  index={1}
                />
                <SummaryCard
                  title={t('analytics.followers')}
                  value={formatNumber(totalFollowers)}
                  change={totalFollowers > 0 ? '+' + formatNumber(totalFollowers) : undefined}
                  icon="users"
                  index={2}
                />
              </View>

              <BarChart stats={stats} />

              <TopContentSection />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
    paddingTop: 100,
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
    color: colors.text.secondary,
    fontFamily: fonts.bodyMedium,
  },
  cardValue: {
    fontSize: fontSize.xl,
    color: colors.text.primary,
    fontFamily: fonts.bodyBold,
    marginBottom: spacing.xs,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardChange: {
    fontSize: fontSize.xs,
    fontFamily: fonts.bodyMedium,
    color: colors.text.tertiary,
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
    color: colors.text.primary,
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
    color: colors.text.tertiary,
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