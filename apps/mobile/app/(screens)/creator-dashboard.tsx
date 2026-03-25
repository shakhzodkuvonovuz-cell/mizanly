import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Dimensions,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown, FadeInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { TabSelector } from '@/components/ui/TabSelector';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts, shadow } from '@/theme';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { creatorApi } from '@/services/creatorApi';
import { commerceApi } from '@/services/api';
import { navigate } from '@/utils/navigation';
import { formatCount } from '@/utils/formatCount';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.4;

const formatNumber = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

const formatChange = (n: number): string => {
  if (n > 0) return `+${n.toFixed(1)}%`;
  if (n < 0) return `${n.toFixed(1)}%`;
  return '0%';
};

interface OverviewStat {
  label: string;
  value: string;
  change: string;
  icon: IconName;
  color: string;
}

interface TopPost {
  id: string;
  thumbnailUrl: string;
  views: number;
  likes: number;
  postType: string;
}

interface AudienceData {
  ageGroups: { range: string; percentage: number }[];
  topCountries: { name: string; percentage: number }[];
  genderSplit: { male: number; female: number; other: number };
}

interface RevenueData {
  total: string;
  tips: string;
  memberships: string;
  history: { month: string; amount: number }[];
}

interface BestTimeSlot {
  day: string;
  hour: string;
  engagement: number;
}

interface SalesData {
  totalSalesRevenue: number;
  totalOrders: number;
  topProducts: { id: string; title: string; unitsSold: number; revenue: number }[];
}

const TABS = [
  { key: 'content', label: 'Content' },
  { key: 'audience', label: 'Audience' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'sales', label: 'Sales' },
] as const;

function CreatorDashboardContent() {
  const router = useRouter();
  const tc = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('content');
  const [overviewStats, setOverviewStats] = useState<OverviewStat[]>([]);
  const [topPosts, setTopPosts] = useState<TopPost[]>([]);
  const [audienceData, setAudienceData] = useState<AudienceData | null>(null);
  const [revenueData, setRevenueData] = useState<RevenueData | null>(null);
  const [bestTimes, setBestTimes] = useState<BestTimeSlot[]>([]);
  const [salesData, setSalesData] = useState<SalesData | null>(null);

  const translatedTabs = useMemo(
    () =>
      TABS.map((tab) => ({
        key: tab.key,
        label:
          tab.key === 'content'
            ? t('creatorDashboard.tabContent', 'Content')
            : tab.key === 'audience'
              ? t('creatorDashboard.tabAudience', 'Audience')
              : tab.key === 'sales'
                ? t('creatorDashboard.tabSales', 'Sales')
                : t('creatorDashboard.tabRevenue', 'Revenue'),
      })),
    [t],
  );

  const loadData = useCallback(async () => {
    try {
      const [overviewRes, contentRes, audienceRes, revenueRes] = await Promise.all([
        creatorApi.getOverview(),
        creatorApi.getContent(),
        creatorApi.getAudience(),
        creatorApi.getRevenue(),
      ]);

      const overview = overviewRes as Record<string, unknown>;
      setOverviewStats([
        {
          label: t('creatorDashboard.followers', 'Followers'),
          value: formatNumber(Number(overview.followers ?? 0)),
          change: formatChange(Number(overview.followersChange ?? 0)),
          icon: 'users',
          color: colors.emerald,
        },
        {
          label: t('creatorDashboard.engagement', 'Engagement'),
          value: `${Number(overview.engagementRate ?? 0).toFixed(1)}%`,
          change: formatChange(Number(overview.engagementChange ?? 0)),
          icon: 'heart',
          color: colors.like,
        },
        {
          label: t('creatorDashboard.views', 'Views'),
          value: formatNumber(Number(overview.totalViews ?? 0)),
          change: formatChange(Number(overview.viewsChange ?? 0)),
          icon: 'eye',
          color: colors.info,
        },
        {
          label: t('creatorDashboard.revenue', 'Revenue'),
          value: `$${Number(overview.revenue ?? 0).toFixed(2)}`,
          change: formatChange(Number(overview.revenueChange ?? 0)),
          icon: 'bar-chart-2',
          color: colors.gold,
        },
      ]);

      const content = contentRes as { topPosts?: TopPost[]; bestTimes?: BestTimeSlot[] };
      setTopPosts(content.topPosts ?? []);
      setBestTimes(content.bestTimes ?? []);

      setAudienceData(audienceRes as AudienceData);
      setRevenueData(revenueRes as RevenueData);

      // Load seller order data for Sales tab
      try {
        const ordersRes = await commerceApi.getMyOrders();
        const orders = (ordersRes as { data?: Array<{ id: string; status: string; totalAmount?: number; product?: { id: string; title: string; price: number } }> })?.data ?? [];
        const completedOrders = orders.filter((o) => o.status === 'completed' || o.status === 'delivered');
        const totalSalesRevenue = completedOrders.reduce((sum, o) => sum + (o.totalAmount ?? o.product?.price ?? 0), 0);
        // Aggregate top products
        const productMap = new Map<string, { id: string; title: string; unitsSold: number; revenue: number }>();
        for (const order of completedOrders) {
          if (order.product) {
            const existing = productMap.get(order.product.id);
            if (existing) {
              existing.unitsSold += 1;
              existing.revenue += order.totalAmount ?? order.product.price ?? 0;
            } else {
              productMap.set(order.product.id, {
                id: order.product.id,
                title: order.product.title,
                unitsSold: 1,
                revenue: order.totalAmount ?? order.product.price ?? 0,
              });
            }
          }
        }
        const topProducts = Array.from(productMap.values())
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5);
        setSalesData({ totalSalesRevenue, totalOrders: completedOrders.length, topProducts });
      } catch {
        // Sales data not available — keep null (shows empty state)
      }
    } catch {
      // Show empty state on failure
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const renderOverviewCard = useCallback(
    ({ item, index }: { item: OverviewStat; index: number }) => (
      <Animated.View
        entering={FadeInRight.delay(index * 80).duration(300)}
        style={[styles.overviewCard, { backgroundColor: tc.bgCard }]}
      >
        <View style={[styles.overviewIconBg, { backgroundColor: `${item.color}15` }]}>
          <Icon name={item.icon} size="sm" color={item.color} />
        </View>
        <Text style={[styles.overviewValue, { color: tc.text.primary }]}>{item.value}</Text>
        <Text style={[styles.overviewLabel, { color: tc.text.secondary }]}>{item.label}</Text>
        <Text
          style={[
            styles.overviewChange,
            { color: item.change.startsWith('+') ? colors.emerald : item.change.startsWith('-') ? colors.error : tc.text.tertiary},
          ]}
        >
          {item.change}
        </Text>
      </Animated.View>
    ),
    [tc.bgCard],
  );

  const renderContentTab = useCallback(() => {
    if (topPosts.length === 0 && bestTimes.length === 0) {
      return (
        <EmptyState
          icon="bar-chart-2"
          title={t('creatorDashboard.noContent', 'No content analytics yet')}
          subtitle={t('creatorDashboard.noContentSub', 'Start posting to see your analytics')}
        />
      );
    }

    return (
      <View style={styles.tabContent}>
        {/* Scheduled Content Section */}
        <Pressable
          style={[styles.scheduledBanner, { backgroundColor: `${colors.emerald}10`, borderColor: `${colors.emerald}30` }]}
          onPress={() => router.push('/(screens)/scheduled-content' as never)}
          accessibilityLabel={t('creatorDashboard.viewScheduled', 'View scheduled content')}
        >
          <Icon name="clock" size="sm" color={colors.emerald} />
          <Text style={[styles.scheduledBannerText, { color: tc.text.primary }]}>
            {t('creatorDashboard.scheduledContent', 'Scheduled Content')}
          </Text>
          <Icon name="chevron-right" size="xs" color={tc.text.secondary} />
        </Pressable>

        {/* Top Posts Grid */}
        {topPosts.length > 0 ? (
          <>
            <Text style={[styles.subsectionTitle, { color: tc.text.primary }]}>
              {t('creatorDashboard.topPosts', 'Top Performing Posts')}
            </Text>
            <View style={styles.postsGrid}>
              {topPosts.map((post, index) => (
                <Animated.View
                  key={post.id}
                  entering={FadeInDown.delay(index * 60).duration(300)}
                >
                  <Pressable
                    style={styles.postGridItem}
                    onPress={() =>
                      navigate('/(screens)/post-insights', { postId: post.id, postType: post.postType })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`${t('creatorDashboard.postInsights', 'Post insights')}: ${formatNumber(post.views)} ${t('creatorDashboard.views', 'views')}`}
                  >
                    {post.thumbnailUrl ? (
                      <Image
                        source={{ uri: post.thumbnailUrl }}
                        style={styles.postThumbnail}
                      />
                    ) : (
                      <View style={[styles.postThumbnail, styles.postPlaceholder]}>
                        <Icon name="image" size="lg" color={tc.text.tertiary} />
                      </View>
                    )}
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.7)']}
                      style={styles.postOverlay}
                    >
                      <View style={styles.postStats}>
                        <View style={styles.postStatRow}>
                          <Icon name="eye" size="xs" color={tc.text.primary} />
                          <Text style={styles.postStatText}>{formatNumber(post.views)}</Text>
                        </View>
                        <View style={styles.postStatRow}>
                          <Icon name="heart" size="xs" color={tc.text.primary} />
                          <Text style={styles.postStatText}>{formatNumber(post.likes)}</Text>
                        </View>
                      </View>
                    </LinearGradient>
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          </>
        ) : null}

        {/* Best Time to Post */}
        {bestTimes.length > 0 ? (
          <>
            <Text style={[styles.subsectionTitle, { color: tc.text.primary }]}>
              {t('creatorDashboard.bestTime', 'Best Time to Post')}
            </Text>
            <View style={styles.bestTimesContainer}>
              {bestTimes.map((slot, index) => (
                <Animated.View
                  key={`time-${index}`}
                  entering={FadeInDown.delay(index * 50).duration(250)}
                  style={styles.bestTimeItem}
                >
                  <View style={styles.bestTimeDot} />
                  <View style={styles.bestTimeInfo}>
                    <Text style={styles.bestTimeDay}>{slot.day}</Text>
                    <Text style={styles.bestTimeHour}>{slot.hour}</Text>
                  </View>
                  <View style={[styles.bestTimeBar, { backgroundColor: tc.surface }]}>
                    <View
                      style={[
                        styles.bestTimeBarFill,
                        { width: `${Math.min(slot.engagement, 100)}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.bestTimePercent}>
                    {slot.engagement.toFixed(0)}%
                  </Text>
                </Animated.View>
              ))}
            </View>
          </>
        ) : null}
      </View>
    );
  }, [topPosts, bestTimes, router, t]);

  const renderAudienceTab = useCallback(() => {
    if (!audienceData) {
      return (
        <EmptyState
          icon="users"
          title={t('creatorDashboard.noAudience', 'No audience data yet')}
          subtitle={t('creatorDashboard.noAudienceSub', 'Grow your followers to see demographics')}
        />
      );
    }

    return (
      <View style={styles.tabContent}>
        {/* Gender Split */}
        <Text style={[styles.subsectionTitle, { color: tc.text.primary }]}>
          {t('creatorDashboard.genderSplit', 'Gender Distribution')}
        </Text>
        <View style={styles.genderContainer}>
          {[
            { label: t('creatorDashboard.male', 'Male'), value: audienceData.genderSplit.male, color: colors.info },
            { label: t('creatorDashboard.female', 'Female'), value: audienceData.genderSplit.female, color: colors.emerald },
            { label: t('creatorDashboard.other', 'Other'), value: audienceData.genderSplit.other, color: colors.gold },
          ].map((g) => (
            <View key={g.label} style={styles.genderItem}>
              <View style={[styles.genderBarTrack, { backgroundColor: tc.surface }]}>
                <View style={[styles.genderBarFill, { height: `${g.value}%`, backgroundColor: g.color }]} />
              </View>
              <Text style={styles.genderPercent}>{g.value}%</Text>
              <Text style={styles.genderLabel}>{g.label}</Text>
            </View>
          ))}
        </View>

        {/* Age Groups */}
        <Text style={[styles.subsectionTitle, { color: tc.text.primary }]}>
          {t('creatorDashboard.ageGroups', 'Age Distribution')}
        </Text>
        {audienceData.ageGroups.map((group, index) => (
          <Animated.View
            key={group.range}
            entering={FadeInDown.delay(index * 50).duration(250)}
            style={styles.ageRow}
          >
            <Text style={styles.ageLabel}>{group.range}</Text>
            <View style={[styles.ageBarTrack, { backgroundColor: tc.surface }]}>
              <View
                style={[styles.ageBarFill, { width: `${group.percentage}%` }]}
              />
            </View>
            <Text style={styles.agePercent}>{group.percentage}%</Text>
          </Animated.View>
        ))}

        {/* Top Countries */}
        <Text style={[styles.subsectionTitle, { color: tc.text.primary }]}>
          {t('creatorDashboard.topCountries', 'Top Countries')}
        </Text>
        {audienceData.topCountries.map((country, index) => (
          <Animated.View
            key={country.name}
            entering={FadeInDown.delay(index * 50).duration(250)}
            style={[styles.countryRow, { borderBottomColor: tc.border }]}
          >
            <Icon name="map-pin" size="sm" color={tc.text.tertiary} />
            <Text style={styles.countryName}>{country.name}</Text>
            <Text style={styles.countryPercent}>{country.percentage}%</Text>
          </Animated.View>
        ))}
      </View>
    );
  }, [audienceData, t]);

  const renderRevenueTab = useCallback(() => {
    if (!revenueData) {
      return (
        <EmptyState
          icon="bar-chart-2"
          title={t('creatorDashboard.noRevenue', 'No revenue data yet')}
          subtitle={t('creatorDashboard.noRevenueSub', 'Enable monetization to start earning')}
        />
      );
    }

    return (
      <View style={styles.tabContent}>
        {/* Revenue Summary */}
        <View style={[styles.revenueSummary, { backgroundColor: tc.bgCard }]}>
          <Text style={styles.revenueTotalLabel}>
            {t('creatorDashboard.totalRevenue', 'Total Revenue')}
          </Text>
          <Text style={styles.revenueTotalValue}>{revenueData.total}</Text>
        </View>

        {/* Breakdown */}
        <Text style={[styles.subsectionTitle, { color: tc.text.primary }]}>
          {t('creatorDashboard.breakdown', 'Revenue Breakdown')}
        </Text>
        <View style={styles.revenueBreakdown}>
          {[
            { label: t('creatorDashboard.tips', 'Tips'), value: revenueData.tips, icon: 'heart' as IconName, color: colors.like },
            { label: t('creatorDashboard.memberships', 'Memberships'), value: revenueData.memberships, icon: 'users' as IconName, color: colors.emerald },
          ].map((item) => (
            <View key={item.label} style={[styles.revenueItem, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
              <View style={[styles.revenueItemIcon, { backgroundColor: `${item.color}15` }]}>
                <Icon name={item.icon} size="sm" color={item.color} />
              </View>
              <View style={styles.revenueItemInfo}>
                <Text style={styles.revenueItemLabel}>{item.label}</Text>
                <Text style={styles.revenueItemValue}>{item.value}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Monthly History */}
        {revenueData.history.length > 0 ? (
          <>
            <Text style={[styles.subsectionTitle, { color: tc.text.primary }]}>
              {t('creatorDashboard.monthlyHistory', 'Monthly History')}
            </Text>
            {revenueData.history.map((entry, index) => (
              <Animated.View
                key={entry.month}
                entering={FadeInDown.delay(index * 50).duration(250)}
                style={styles.historyRow}
              >
                <Text style={styles.historyMonth}>{entry.month}</Text>
                <View style={[styles.historyBarTrack, { backgroundColor: tc.surface }]}>
                  <View
                    style={[
                      styles.historyBarFill,
                      {
                        width: `${Math.min(
                          (entry.amount / Math.max(...revenueData.history.map((h) => h.amount), 1)) * 100,
                          100,
                        )}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.historyAmount}>${entry.amount.toFixed(0)}</Text>
              </Animated.View>
            ))}
          </>
        ) : null}
      </View>
    );
  }, [revenueData, t]);

  const renderSalesTab = useCallback(() => {
    if (!salesData || (salesData.totalOrders === 0 && salesData.topProducts.length === 0)) {
      return (
        <EmptyState
          icon="layers"
          title={t('creatorDashboard.noSales', 'No sales data yet')}
          subtitle={t('creatorDashboard.noSalesSub', 'Start selling products to see your sales analytics')}
        />
      );
    }

    return (
      <View style={styles.tabContent}>
        {/* Sales Summary Cards */}
        <View style={styles.salesSummaryRow}>
          <Animated.View
            entering={FadeInDown.delay(0).duration(300)}
            style={[styles.salesSummaryCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}
          >
            <View style={[styles.overviewIconBg, { backgroundColor: `${colors.gold}15` }]}>
              <Icon name="bar-chart-2" size="sm" color={colors.gold} />
            </View>
            <Text style={[styles.salesSummaryValue, { color: tc.text.primary }]}>
              ${salesData.totalSalesRevenue.toFixed(2)}
            </Text>
            <Text style={[styles.salesSummaryLabel, { color: tc.text.secondary }]}>
              {t('creatorDashboard.totalSalesRevenue', 'Total Sales Revenue')}
            </Text>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(80).duration(300)}
            style={[styles.salesSummaryCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}
          >
            <View style={[styles.overviewIconBg, { backgroundColor: `${colors.emerald}15` }]}>
              <Icon name="check-circle" size="sm" color={colors.emerald} />
            </View>
            <Text style={[styles.salesSummaryValue, { color: tc.text.primary }]}>
              {formatCount(salesData.totalOrders)}
            </Text>
            <Text style={[styles.salesSummaryLabel, { color: tc.text.secondary }]}>
              {t('creatorDashboard.completedOrders', 'Completed Orders')}
            </Text>
          </Animated.View>
        </View>

        {/* Top Selling Products */}
        {salesData.topProducts.length > 0 && (
          <>
            <Text style={[styles.subsectionTitle, { color: tc.text.primary }]}>
              {t('creatorDashboard.topProducts', 'Top Selling Products')}
            </Text>
            {salesData.topProducts.map((product, index) => (
              <Animated.View
                key={product.id}
                entering={FadeInDown.delay(index * 60).duration(300)}
                style={[styles.topProductRow, { backgroundColor: tc.bgCard, borderColor: tc.border }]}
              >
                <View style={[styles.topProductRank, { backgroundColor: `${colors.gold}15` }]}>
                  <Text style={[styles.topProductRankText, { color: colors.gold }]}>{index + 1}</Text>
                </View>
                <View style={styles.topProductInfo}>
                  <Text style={[styles.topProductTitle, { color: tc.text.primary }]} numberOfLines={1}>
                    {product.title}
                  </Text>
                  <Text style={[styles.topProductMeta, { color: tc.text.secondary }]}>
                    {formatCount(product.unitsSold)} {t('creatorDashboard.unitsSold', 'sold')}
                  </Text>
                </View>
                <Text style={[styles.topProductRevenue, { color: colors.emerald }]}>
                  ${product.revenue.toFixed(2)}
                </Text>
              </Animated.View>
            ))}
          </>
        )}
      </View>
    );
  }, [salesData, t, tc]);

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 60 }]}>
        <GlassHeader
          title={t('creatorDashboard.title', 'Creator Studio')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <View style={styles.skeletonContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.overviewScroll}>
            {Array.from({ length: 4 }).map((_, i) => (
              <View key={`skel-card-${i}`} style={[styles.skeletonCard, { backgroundColor: tc.bgCard }]}>
                <Skeleton.Circle size={32} />
                <Skeleton.Rect width={60} height={20} borderRadius={radius.sm} />
                <Skeleton.Rect width={80} height={14} borderRadius={radius.sm} />
              </View>
            ))}
          </ScrollView>
          <View style={{ gap: spacing.md, paddingHorizontal: spacing.base }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton.Rect key={`skel-row-${i}`} width="100%" height={44} borderRadius={radius.md} />
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: tc.bg }]}>
      <GlassHeader
        title={t('creatorDashboard.title', 'Creator Studio')}
        leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
      />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 60,
          paddingBottom: insets.bottom + spacing['2xl'],
        }}
        refreshControl={
          <BrandedRefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Overview Cards */}
        <FlatList
          data={overviewStats}
          keyExtractor={(item) => item.label}
          renderItem={renderOverviewCard}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.overviewContainer}
          style={styles.overviewScroll}
          scrollEnabled
        />

        {/* Tab Selector */}
        <View style={styles.tabSelectorContainer}>
          <TabSelector
            tabs={translatedTabs}
            activeKey={activeTab}
            onTabChange={setActiveTab}
            variant="pill"
          />
        </View>

        {/* Tab Content */}
        {activeTab === 'content' ? renderContentTab() : null}
        {activeTab === 'audience' ? renderAudienceTab() : null}
        {activeTab === 'revenue' ? renderRevenueTab() : null}
        {activeTab === 'sales' ? renderSalesTab() : null}
      </ScrollView>
    </View>
  );
}

export default function CreatorDashboardScreen() {
  return (
    <ScreenErrorBoundary>
      <CreatorDashboardContent />
    </ScreenErrorBoundary>
  );
}

const GRID_GAP = spacing.sm;
const GRID_ITEM_WIDTH = (SCREEN_WIDTH - spacing.base * 2 - GRID_GAP * 2) / 3;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  skeletonContainer: {
    gap: spacing.lg,
    paddingTop: spacing.base,
  },
  skeletonCard: {
    width: CARD_WIDTH,
    height: 120,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    padding: spacing.base,
    marginEnd: spacing.md,
    gap: spacing.sm,
  },
  overviewScroll: {
    marginBottom: spacing.base,
  },
  overviewContainer: {
    paddingHorizontal: spacing.base,
    gap: spacing.md,
  },
  overviewCard: {
    width: CARD_WIDTH,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.glass.border,
    padding: spacing.base,
    gap: spacing.xs,
  },
  overviewIconBg: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  overviewValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.lg,
    color: colors.text.primary,
  },
  overviewLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  overviewChange: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.xs,
  },
  scheduledBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.base,
    marginBottom: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  scheduledBannerText: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
  },
  tabSelectorContainer: {
    paddingHorizontal: spacing.base,
    marginBottom: spacing.base,
  },
  tabContent: {
    paddingHorizontal: spacing.base,
  },
  subsectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  postsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  postGridItem: {
    width: GRID_ITEM_WIDTH,
    height: GRID_ITEM_WIDTH * 1.3,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  postThumbnail: {
    width: '100%',
    height: '100%',
  },
  postPlaceholder: {
    backgroundColor: colors.dark.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postOverlay: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  postStats: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  postStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  postStatText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.xs,
    color: colors.text.primary,
  },
  bestTimesContainer: {
    gap: spacing.sm,
  },
  bestTimeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  bestTimeDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
  },
  bestTimeInfo: {
    width: 80,
  },
  bestTimeDay: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.primary,
  },
  bestTimeHour: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  bestTimeBar: {
    flex: 1,
    height: 6,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  bestTimeBarFill: {
    height: '100%',
    backgroundColor: colors.emerald,
    borderRadius: radius.full,
  },
  bestTimePercent: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
    width: 36,
    textAlign: 'right',
  },
  genderContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 140,
    paddingBottom: spacing.sm,
  },
  genderItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  genderBarTrack: {
    width: 32,
    height: 80,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.sm,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  genderBarFill: {
    width: '100%',
    borderRadius: radius.sm,
  },
  genderPercent: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.primary,
  },
  genderLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  ageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  ageLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    width: 48,
  },
  ageBarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  ageBarFill: {
    height: '100%',
    backgroundColor: colors.emerald,
    borderRadius: radius.full,
  },
  agePercent: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
    width: 36,
    textAlign: 'right',
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.dark.border,
  },
  countryName: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.primary,
    flex: 1,
  },
  countryPercent: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.secondary,
  },
  revenueSummary: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.glass.border,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  revenueTotalLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  revenueTotalValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize['2xl'],
    color: colors.gold,
  },
  revenueBreakdown: {
    gap: spacing.md,
  },
  revenueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.dark.border,
    padding: spacing.base,
  },
  revenueItemIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revenueItemInfo: {
    flex: 1,
    gap: 2,
  },
  revenueItemLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  revenueItemValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: colors.text.primary,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  historyMonth: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    width: 48,
  },
  historyBarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  historyBarFill: {
    height: '100%',
    backgroundColor: colors.gold,
    borderRadius: radius.full,
  },
  historyAmount: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.primary,
    width: 50,
    textAlign: 'right',
  },
  salesSummaryRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.base,
  },
  salesSummaryCard: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 0.5,
    padding: spacing.base,
    gap: spacing.xs,
  },
  salesSummaryValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.lg,
    color: colors.text.primary,
  },
  salesSummaryLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  topProductRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 0.5,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  topProductRank: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topProductRankText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
  },
  topProductInfo: {
    flex: 1,
    gap: 2,
  },
  topProductTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  topProductMeta: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  topProductRevenue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
  },
});
