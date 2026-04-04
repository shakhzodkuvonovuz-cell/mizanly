import { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
} from 'react-native';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useRouter } from 'expo-router';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDistanceToNowStrict } from 'date-fns';
import type { Locale } from 'date-fns';
import { getDateFnsLocale } from '@/utils/localeFormat';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { gamificationApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { rtlFlexRow, rtlTextAlign } from '@/utils/rtl';
import type { IconName } from '@/components/ui/Icon';
import { formatCount } from '@/utils/formatCount';

interface XPData {
  level: number;
  currentXP: number;
  nextLevelXP: number;
  totalXP: number;
}

interface XPEvent {
  id: string;
  reason: string;
  amount: number;
  icon?: string;
  createdAt: string;
}

const REASON_ICONS: Record<string, IconName> = {
  post: 'edit',
  comment: 'message-circle',
  like: 'heart',
  share: 'share',
  follow: 'users',
  streak: 'trending-up',
  challenge: 'flag',
  achievement: 'check-circle',
  quran: 'book-open',
  dhikr: 'star',
  default: 'gift',
};

function getReasonIcon(reason: string): IconName {
  const key = reason.toLowerCase().split('_')[0];
  return REASON_ICONS[key] ?? REASON_ICONS.default;
}

function timeAgo(dateStr: string, locale?: Locale): string {
  return formatDistanceToNowStrict(new Date(dateStr), { addSuffix: true, locale });
}

function LevelBadge({ xpData, isRTL }: { xpData: XPData; isRTL: boolean }) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { t } = useTranslation();
  const progress = xpData.nextLevelXP > 0
    ? xpData.currentXP / xpData.nextLevelXP
    : 1;
  const xpRemaining = Math.max(0, xpData.nextLevelXP - xpData.currentXP);

  return (
    <Animated.View entering={FadeIn.duration(500)}>
      <LinearGradient
        colors={['rgba(10,123,79,0.15)', 'rgba(200,150,62,0.08)']}
        style={[styles.levelCard, { flexDirection: rtlFlexRow(isRTL) }]}
      >
        {/* Level Circle */}
        <View style={styles.levelCircleWrap}>
          <LinearGradient
            colors={[colors.emeraldLight, colors.emerald]}
            style={styles.levelCircle}
          >
            <Text style={styles.levelNumber}>{xpData.level}</Text>
          </LinearGradient>
          {/* Progress ring visual: use a bar below instead */}
        </View>

        <View style={styles.levelInfo}>
          <Text style={[styles.levelTitle, { textAlign: rtlTextAlign(isRTL) }]}>
            {t('gamification.xp.level', { level: xpData.level })}
          </Text>
          <Text style={[styles.totalXP, { textAlign: rtlTextAlign(isRTL) }]}>
            {t('gamification.xp.totalXP', { xp: formatCount(xpData.totalXP) })}
          </Text>
        </View>

        {/* Progress bar to next level */}
        <View style={styles.levelProgressWrap}>
          <View style={styles.progressBarBg}>
            <LinearGradient
              colors={[colors.gold, colors.emerald]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.progressBarFill, { width: `${Math.min(progress * 100, 100)}%` }]}
            />
          </View>
          <Text style={styles.progressLabel}>
            {t('gamification.xp.nextLevel', { xp: xpRemaining.toLocaleString() })}
          </Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

function XPEventRow({ event, index, isRTL }: { event: XPEvent; index: number; isRTL: boolean }) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { t } = useTranslation();
  const iconName = getReasonIcon(event.reason);

  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index * 60, 600)).duration(400)}>
      <View style={[styles.eventRow, { flexDirection: rtlFlexRow(isRTL) }]}>
        <LinearGradient
          colors={['rgba(10,123,79,0.15)', 'rgba(10,123,79,0.05)']}
          style={styles.eventIconBg}
        >
          <Icon name={iconName} size="sm" color={colors.emerald} />
        </LinearGradient>

        <View style={styles.eventContent}>
          <Text style={[styles.eventReason, { textAlign: rtlTextAlign(isRTL) }]} numberOfLines={1}>
            {event.reason}
          </Text>
          <Text style={[styles.eventTime, { textAlign: rtlTextAlign(isRTL) }]}>
            {timeAgo(event.createdAt, getDateFnsLocale())}
          </Text>
        </View>

        <View style={styles.xpBadge}>
          <Text style={styles.xpBadgeText}>
            {t('gamification.xp.earned', { amount: event.amount })}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

function LoadingSkeleton() {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  return (
    <View style={styles.skeletonWrap}>
      <Skeleton.Rect width="100%" height={120} borderRadius={radius.lg} />
      {Array.from({ length: 8 }).map((_, i) => (
        <View key={i} style={styles.skeletonRow}>
          <Skeleton.Circle size={36} />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Skeleton.Text width="70%" />
            <Skeleton.Text width="30%" />
          </View>
          <Skeleton.Rect width={60} height={24} borderRadius={radius.full} />
        </View>
      ))}
    </View>
  );
}

function XPHistoryScreen() {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { t, isRTL } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptic = useContextualHaptic();
  const isGoingBackRef = useRef(false);

  const xpQuery = useQuery({
    queryKey: ['xp'],
    queryFn: async () => {
      const res = await gamificationApi.getXP() as XPData;
      return res;
    },
  });

  const historyQuery = useInfiniteQuery({
    queryKey: ['xp-history'],
    queryFn: async ({ pageParam }) => {
      const res = await gamificationApi.getXPHistory(pageParam as string | undefined) as { data: XPEvent[]; meta: { cursor?: string; hasMore: boolean } };
      return res;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta.hasMore ? lastPage.meta.cursor : undefined,
  });

  const xpData = xpQuery.data;
  const events = historyQuery.data?.pages.flatMap((p) => p.data) ?? [];
  const isLoading = xpQuery.isLoading || historyQuery.isLoading;

  const handleLoadMore = useCallback(() => {
    if (historyQuery.hasNextPage && !historyQuery.isFetchingNextPage) {
      historyQuery.fetchNextPage();
    }
  }, [historyQuery]);

  const handleRefresh = useCallback(async () => {
    await Promise.all([xpQuery.refetch(), historyQuery.refetch()]);
  }, [xpQuery, historyQuery]);

  const renderItem = useCallback(
    ({ item, index }: { item: XPEvent; index: number }) => (
      <XPEventRow event={item} index={index} isRTL={isRTL} />
    ),
    [isRTL],
  );

  const keyExtractor = useCallback((item: XPEvent) => item.id, []);

  const ListHeader = xpData ? <LevelBadge xpData={xpData} isRTL={isRTL} /> : null;

  const ListFooter = historyQuery.isFetchingNextPage ? (
    <View style={styles.footerLoader}>
      <Skeleton.Rect width={200} height={40} borderRadius={radius.md} />
    </View>
  ) : historyQuery.hasNextPage ? (
    <View style={styles.footerLoader}>
      <Text style={{ color: tc.text.tertiary, fontSize: fontSize.xs }}>{t('common.scrollForMore', 'Scroll for more')}</Text>
    </View>
  ) : null;

  return (
    <View style={styles.container}>
      <GlassHeader
        title={t('gamification.xp.history')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => {
            if (isGoingBackRef.current) return;
            isGoingBackRef.current = true;
            router.back();
            setTimeout(() => { isGoingBackRef.current = false; }, 500);
          },
          accessibilityLabel: t('common.back'),
        }}
      />

      <View style={styles.content}>
        {isLoading ? (
          <LoadingSkeleton />
        ) : (xpQuery.isError || historyQuery.isError) ? (
          <EmptyState
            icon="alert-circle"
            title={t('common.error')}
            subtitle={t('common.tryAgain')}
            actionLabel={t('common.retry')}
            onAction={() => { xpQuery.refetch(); historyQuery.refetch(); }}
          />
        ) : events.length === 0 ? (
          <EmptyState
            icon="trending-up"
            title={t('gamification.xp.history')}
            subtitle={t('gamification.xp.startEarning')}
          />
        ) : (
          <FlatList
            data={events}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            ListHeaderComponent={ListHeader}
            ListFooterComponent={ListFooter}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            refreshControl={
              <BrandedRefreshControl
                refreshing={xpQuery.isRefetching || historyQuery.isRefetching}
                onRefresh={handleRefresh}
              />
            }
          />
        )}
      </View>
    </View>
  );
}

export default function XPHistoryScreenWrapper() {
  return (
    <ScreenErrorBoundary>
      <XPHistoryScreen />
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  content: {
    flex: 1,
    paddingTop: 96,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['2xl'],
    gap: spacing.sm,
  },
  // Level badge
  levelCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.emerald,
    gap: spacing.md,
    marginBottom: spacing.base,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  levelCircleWrap: {
    marginEnd: spacing.base,
  },
  levelCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  levelNumber: {
    fontFamily: fonts.headingBold,
    fontSize: fontSize['2xl'],
    color: '#FFFFFF',
  },
  levelInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  levelTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.lg,
    color: tc.text.primary,
  },
  totalXP: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
    color: colors.gold,
  },
  levelProgressWrap: {
    width: '100%',
    gap: spacing.xs,
  },
  progressBarBg: {
    width: '100%',
    height: 6,
    borderRadius: radius.sm,
    backgroundColor: tc.surface,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: radius.sm,
  },
  progressLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: tc.text.secondary,
  },
  // Event rows
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tc.border,
  },
  eventIconBg: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventContent: {
    flex: 1,
    gap: 2,
  },
  eventReason: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.base,
    color: tc.text.primary,
  },
  eventTime: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: tc.text.tertiary,
  },
  xpBadge: {
    backgroundColor: colors.active.emerald10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  xpBadgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.emerald,
  },
  // Footer
  footerLoader: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  // Skeleton
  skeletonWrap: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
});
