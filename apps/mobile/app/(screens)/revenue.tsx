import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, fontSize, radius, fonts, shadow } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { api } from '@/services/api';
import { navigate } from '@/utils/navigation';

// ── Local types ──

interface RevenueOverview {
  totalEarnings: number;
  trendPercent: number;
  trendUp: boolean;
  tips: { amount: number; count: number };
  memberships: { monthlyAmount: number };
  gifts: { diamondValue: number };
  revenueSplitPercent: number;
}

type TransactionType = 'tip_received' | 'membership_payment' | 'gift_received' | 'cashout';

interface Transaction {
  id: string;
  type: TransactionType;
  description: string;
  amount: number;
  createdAt: string;
}

// ── API helpers ──

const revenueApi = {
  getOverview: () =>
    api.get<RevenueOverview>('/monetization/revenue'),
  getTransactions: (cursor?: string) =>
    api.get<{ data: Transaction[]; meta: { cursor?: string; hasMore: boolean } }>(
      `/monetization/revenue/transactions${cursor ? `?cursor=${cursor}` : ''}`,
    ),
};

// ── Helpers ──

const TRANSACTION_META: Record<TransactionType, { icon: IconName; color: string }> = {
  tip_received: { icon: 'heart', color: colors.like },
  membership_payment: { icon: 'users', color: colors.emerald },
  gift_received: { icon: 'layers', color: colors.gold },
  cashout: { icon: 'send', color: colors.info },
};

function formatCurrency(amount: number): string {
  return `$${Math.abs(amount).toFixed(2)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function RevenueContent() {
  const router = useRouter();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [overview, setOverview] = useState<RevenueOverview | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    try {
      const [overviewRes, txRes] = await Promise.all([
        revenueApi.getOverview(),
        revenueApi.getTransactions(),
      ]);
      // API client already unwraps envelope
      setOverview(overviewRes as RevenueOverview);
      const txPage = txRes as { data: Transaction[]; meta: { cursor?: string; hasMore: boolean } };
      setTransactions(txPage.data);
      setCursor(txPage.meta.cursor);
      setHasMore(txPage.meta.hasMore);
    } catch {
      // Keep existing data on error
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData(true);
  }, [fetchData]);

  const loadMore = useCallback(async () => {
    if (!hasMore || !cursor) return;
    try {
      const res = await revenueApi.getTransactions(cursor);
      const txPage = res as { data: Transaction[]; meta: { cursor?: string; hasMore: boolean } };
      setTransactions((prev) => [...prev, ...txPage.data]);
      setCursor(txPage.meta.cursor);
      setHasMore(txPage.meta.hasMore);
    } catch {
      // Ignore load more errors
    }
  }, [hasMore, cursor]);

  const renderHeader = useCallback(() => {
    if (!overview) return null;
    return (
      <View style={styles.headerContent}>
        {/* Total Earnings Hero */}
        <Animated.View entering={FadeIn.duration(400)}>
          <LinearGradient
            colors={[colors.emeraldLight, colors.emerald, colors.emeraldDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <Text style={styles.heroLabel}>
              {t('revenue.totalEarnings', 'Total Earnings')}
            </Text>
            <Text style={styles.heroAmount}>
              {formatCurrency(overview.totalEarnings)}
            </Text>
            <View style={styles.trendRow}>
              <Icon
                name={overview.trendUp ? 'trending-up' : 'trending-up'}
                size="sm"
                color={overview.trendUp ? '#FFFFFF' : colors.error}
              />
              <Text
                style={[
                  styles.trendText,
                  !overview.trendUp && { color: colors.error },
                ]}
              >
                {overview.trendUp ? '+' : '-'}
                {overview.trendPercent}%{' '}
                {t('revenue.thisMonth', 'this month')}
              </Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Breakdown Cards */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.breakdownRow}>
          <View style={styles.breakdownCard}>
            <View style={[styles.breakdownIconWrap, { backgroundColor: 'rgba(248, 81, 73, 0.15)' }]}>
              <Icon name="heart" size="sm" color={colors.like} />
            </View>
            <Text style={styles.breakdownAmount}>
              {formatCurrency(overview.tips.amount)}
            </Text>
            <Text style={styles.breakdownLabel}>
              {t('revenue.tips', 'Tips')} ({overview.tips.count})
            </Text>
          </View>

          <View style={styles.breakdownCard}>
            <View style={[styles.breakdownIconWrap, { backgroundColor: colors.active.emerald10 }]}>
              <Icon name="users" size="sm" color={colors.emerald} />
            </View>
            <Text style={styles.breakdownAmount}>
              {formatCurrency(overview.memberships.monthlyAmount)}
            </Text>
            <Text style={styles.breakdownLabel}>
              {t('revenue.memberships', 'Memberships')}
            </Text>
          </View>

          <View style={styles.breakdownCard}>
            <View style={[styles.breakdownIconWrap, { backgroundColor: colors.active.gold10 }]}>
              <Icon name="layers" size="sm" color={colors.gold} />
            </View>
            <Text style={styles.breakdownAmount}>
              {overview.gifts.diamondValue}
            </Text>
            <Text style={styles.breakdownLabel}>
              {t('revenue.gifts', 'Gifts')}
            </Text>
          </View>
        </Animated.View>

        {/* Revenue Split Info */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)} style={styles.splitCard}>
          <View style={styles.splitRow}>
            <View style={styles.splitIconWrap}>
              <Icon name="bar-chart-2" size={18} color={colors.emerald} />
            </View>
            <View style={styles.splitTextWrap}>
              <Text style={styles.splitTitle}>
                {t('revenue.revenueSplit', 'Revenue Split')}
              </Text>
              <Text style={styles.splitDesc}>
                {t(
                  'revenue.splitDescription',
                  `You earn ${overview.revenueSplitPercent}% of all revenue`,
                )}
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Section Title */}
        <Animated.View entering={FadeInUp.delay(300).duration(400)}>
          <Text style={styles.sectionTitle}>
            {t('revenue.transactionHistory', 'Transaction History')}
          </Text>
        </Animated.View>
      </View>
    );
  }, [overview, t]);

  const renderTransaction = useCallback(
    ({ item }: { item: Transaction }) => {
      const meta = TRANSACTION_META[item.type];
      const isPositive = item.type !== 'cashout';

      return (
        <View style={styles.txRow}>
          <View style={[styles.txIconWrap, { backgroundColor: `${meta.color}20` }]}>
            <Icon name={meta.icon} size="sm" color={meta.color} />
          </View>
          <View style={styles.txContent}>
            <Text style={styles.txDescription} numberOfLines={1}>
              {item.description}
            </Text>
            <Text style={styles.txDate}>{formatDate(item.createdAt)}</Text>
          </View>
          <Text
            style={[
              styles.txAmount,
              isPositive ? styles.txPositive : styles.txNegative,
            ]}
          >
            {isPositive ? '+' : '-'}{formatCurrency(item.amount)}
          </Text>
        </View>
      );
    },
    [],
  );

  const keyExtractor = useCallback((item: Transaction) => item.id, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title={t('revenue.title', 'Revenue')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.back', 'Go back'),
          }}
        />
        <View style={styles.loadingContainer}>
          <Skeleton.Rect width="100%" height={160} borderRadius={radius.lg} />
          <View style={{ height: spacing.base }} />
          <View style={styles.breakdownRow}>
            <Skeleton.Rect width="31%" height={100} borderRadius={radius.lg} />
            <Skeleton.Rect width="31%" height={100} borderRadius={radius.lg} />
            <Skeleton.Rect width="31%" height={100} borderRadius={radius.lg} />
          </View>
          <View style={{ height: spacing.base }} />
          <Skeleton.Rect width="100%" height={64} borderRadius={radius.lg} />
          <View style={{ height: spacing.xl }} />
          <Skeleton.Rect width="40%" height={18} borderRadius={radius.sm} />
          <View style={{ height: spacing.md }} />
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={`skel-${i}`} style={{ marginBottom: spacing.md }}>
              <Skeleton.Rect width="100%" height={56} borderRadius={radius.md} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GlassHeader
        title={t('revenue.title', 'Revenue')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back', 'Go back'),
        }}
      />

      <FlatList
        data={transactions}
        keyExtractor={keyExtractor}
        renderItem={renderTransaction}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <EmptyState
            icon="bar-chart-2"
            title={t('revenue.emptyTitle', 'No transactions yet')}
            subtitle={t('revenue.emptySubtitle', 'Your earnings will appear here')}
          />
        }
        contentContainerStyle={styles.listContent}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.emerald}
          />
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Cash Out Button */}
      <View style={styles.bottomBar}>
        <GradientButton
          label={t('revenue.cashOut', 'Cash Out')}
          icon="send"
          onPress={() => navigate('/(screens)/cashout')}
          fullWidth
          size="lg"
        />
      </View>
    </View>
  );
}

export default function RevenueScreen() {
  return (
    <ScreenErrorBoundary>
      <RevenueContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  loadingContainer: {
    paddingTop: 100,
    paddingHorizontal: spacing.base,
  },
  listContent: {
    paddingTop: 100,
    paddingBottom: 100,
  },
  headerContent: {
    paddingHorizontal: spacing.base,
  },

  // Hero
  heroCard: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginTop: spacing.base,
    ...shadow.md,
  },
  heroLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: 'rgba(255, 255, 255, 0.75)',
    marginBottom: spacing.xs,
  },
  heroAmount: {
    fontFamily: fonts.headingBold,
    fontSize: fontSize['4xl'],
    color: colors.text.primary,
    letterSpacing: -1,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  trendText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: '#FFFFFF',
  },

  // Breakdown
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.base,
    gap: spacing.sm,
  },
  breakdownCard: {
    flex: 1,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dark.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  breakdownIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  breakdownAmount: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: colors.text.primary,
  },
  breakdownLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
    marginTop: 2,
    textAlign: 'center',
  },

  // Split
  splitCard: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dark.border,
    padding: spacing.base,
    marginTop: spacing.base,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  splitIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.active.emerald10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitTextWrap: {
    flex: 1,
  },
  splitTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  splitDesc: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginTop: 2,
  },

  // Section title
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: colors.text.primary,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },

  // Transactions
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    gap: spacing.md,
  },
  txIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txContent: {
    flex: 1,
  },
  txDescription: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  txDate: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  txAmount: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
  },
  txPositive: {
    color: colors.emerald,
  },
  txNegative: {
    color: colors.error,
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
