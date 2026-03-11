import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { usersApi } from '@/services/api';

// Local type for CreatorStat (will be added to types/index.ts in Step 12)
interface CreatorStat {
  id: string;
  date: string;
  space: 'SAF' | 'BAKRA' | 'MAJLIS' | 'MINBAR';
  views: number;
  likes: number;
  comments: number;
  shares: number;
  followers: number;
}

interface AnalyticsResponse {
  stats: CreatorStat[];
}

const { width: screenWidth } = Dimensions.get('window');

function SummaryCard({ title, value, change }: { title: string; value: string; change?: string }) {
  const isPositive = change?.startsWith('+');
  const isNegative = change?.startsWith('-');
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardValue}>{value}</Text>
      {change && (
        <Text style={[
          styles.cardChange,
          isPositive && styles.positive,
          isNegative && styles.negative
        ]}>
          {change}
        </Text>
      )}
    </View>
  );
}

function BarChart({ stats }: { stats: CreatorStat[] }) {
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
    <View style={styles.chartContainer}>
      <Text style={styles.sectionTitle}>Engagement over time</Text>
      <View style={styles.chart}>
        {dates.map((date, i) => (
          <View key={date} style={styles.barWrapper}>
            <View
              style={[
                styles.bar,
                { height: Math.max(4, (values[i] / maxViews) * 120) }
              ]}
            />
            <Text style={styles.barLabel}>
              {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function TopContentSection() {
  // Placeholder for top performing content
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Top Performing Content</Text>
      <EmptyState
        icon="bar-chart-2"
        title="No content data yet"
        subtitle="Your top posts, reels, and threads will appear here"
      />
    </View>
  );
}

export default function AnalyticsScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

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

  // Format numbers
  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader
          title="Creator Analytics"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <View style={{ paddingTop: 100 }}>
          <EmptyState
            icon="flag"
            title="Failed to load analytics"
            subtitle="Please try again later"
            actionLabel="Retry"
            onAction={() => refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlassHeader
        title="Creator Analytics"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
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
            title="No analytics data yet"
            subtitle="Your engagement statistics will appear here as you post content"
            actionLabel="Start creating"
            onAction={() => router.push('/(tabs)/create')}
          />
        ) : (
          <>
            <View style={styles.cards}>
              <SummaryCard
                title="Views"
                value={formatNumber(totalViews)}
                change={totalViews > 0 ? '+' + formatNumber(totalViews) : undefined}
              />
              <SummaryCard
                title="Likes"
                value={formatNumber(totalLikes)}
                change={totalLikes > 0 ? '+' + formatNumber(totalLikes) : undefined}
              />
              <SummaryCard
                title="Followers"
                value={formatNumber(totalFollowers)}
                change={totalFollowers > 0 ? '+' + formatNumber(totalFollowers) : undefined}
              />
            </View>

            <BarChart stats={stats} />

            <TopContentSection />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  headerTitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.bodySemiBold,
    color: colors.text.primary,
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
  },
  card: {
    flex: 1,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.xs,
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    fontFamily: fonts.bodyMedium,
    marginBottom: spacing.xs,
  },
  cardValue: {
    fontSize: fontSize.lg,
    color: colors.text.primary,
    fontFamily: fonts.bodyBold,
    marginBottom: spacing.xs,
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
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.base,
    color: colors.text.primary,
    fontFamily: fonts.bodySemiBold,
    marginBottom: spacing.md,
  },
  chartContainer: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 150,
  },
  barWrapper: {
    alignItems: 'center',
    flex: 1,
  },
  bar: {
    width: 8,
    backgroundColor: colors.emerald,
    borderRadius: radius.sm,
    marginBottom: spacing.xs,
  },
  barLabel: {
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    transform: [{ rotate: '-45deg' }],
    marginTop: spacing.xs,
  },
});