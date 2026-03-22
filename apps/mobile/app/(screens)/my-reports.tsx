import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDistanceToNowStrict, format } from 'date-fns';
import { getDateFnsLocale } from '@/utils/localeFormat';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/components/ui/Icon';

import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, fontSize, radius } from '@/theme';
import { reportsApi } from '@/services/api';
import type { Report, ReportStatus } from '@/types';
import { useHaptic } from '@/hooks/useHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

export default function MyReportsScreen() {
  const { t, isRTL } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const [refreshing, setRefreshing] = useState(false);
  const tc = useThemeColors();

  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    queryKey: ['my-reports'],
    queryFn: ({ pageParam }) => reportsApi.getMine(pageParam as string | undefined),
    getNextPageParam: (lastPage: { meta: { hasMore: boolean; cursor: string | null } }) => lastPage.meta.hasMore ? lastPage.meta.cursor : undefined,
    initialPageParam: undefined as string | undefined,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    haptic.light();
    await refetch();
    setRefreshing(false);
  }, [refetch, haptic]);

  const reports = data?.pages.flatMap((page: { data: Report[] }) => page.data) ?? [];

  const getStatusColor = (status: ReportStatus) => {
    switch (status) {
      case 'PENDING': return colors.gold;
      case 'REVIEWING': return colors.emerald;
      case 'RESOLVED': return colors.emerald;
      case 'DISMISSED': return colors.text.tertiary;
      default: return colors.text.tertiary;
    }
  };

  const getTargetText = (item: Report) => {
    if (item.reportedUserId && item.reportedUser) return `User: @${item.reportedUser.username}`;
    if (item.reportedPostId) return 'Post';
    if (item.reportedCommentId) return 'Comment';
    if (item.reportedMessageId) return 'Message';
    return 'Content';
  };

  const renderItem = ({ item, index }: { item: Report; index: number }) => {
    const statusColor = getStatusColor(item.status);
    const statusIcon: IconName = item.status === 'RESOLVED' ? 'check' : item.status === 'PENDING' ? 'clock' : 'flag';

    return (
      <Animated.View entering={FadeInUp.delay(index * 50).duration(400)}>
        <LinearGradient
          colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
          style={styles.card}
        >
          <View style={styles.headerRow}>
            <LinearGradient
              colors={[statusColor + '33', statusColor + '1A']}
              style={styles.statusIconBg}
            >
              <Icon name={statusIcon} size="xs" color={statusColor} />
            </LinearGradient>
            <Text style={styles.reason} numberOfLines={1}>
              {item.reason.replace(/_/g, ' ')}
            </Text>
            <LinearGradient
              colors={[statusColor + '33', statusColor + '1A']}
              style={styles.badge}
            >
              <Text style={[styles.badgeText, { color: statusColor }]}>{item.status}</Text>
            </LinearGradient>
          </View>
          <Text style={styles.target} numberOfLines={1}>{getTargetText(item)}</Text>
          <Text style={styles.date}>
            {format(new Date(item.createdAt), 'MMM d, yyyy')} • {formatDistanceToNowStrict(new Date(item.createdAt), { locale: getDateFnsLocale() })} ago
          </Text>
        </LinearGradient>
      </Animated.View>
    );
  };

  if (isError) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader 
          title={t('screens.my-reports.title')} 
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }} 
        />
        <View style={{ height: insets.top + 52 }} />
        <EmptyState 
          icon="flag" 
          title={t('screens.my-reports.errorTitle')}
          subtitle={t('screens.my-reports.errorSubtitle')}
          actionLabel={t('common.retry')} 
          onAction={() => refetch()} 
        />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader 
          title={t('screens.my-reports.title')} 
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }} 
        />
        <View style={{ height: insets.top + 52 }} />
        <View style={{ padding: spacing.base, gap: spacing.md }}>
          <Skeleton.Rect width="100%" height={90} borderRadius={radius.md} />
          <Skeleton.Rect width="100%" height={90} borderRadius={radius.md} />
          <Skeleton.Rect width="100%" height={90} borderRadius={radius.md} />
        </View>
      </View>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader 
          title={t('screens.my-reports.title')} 
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }} 
        />
      
        <FlatList
          data={reports}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 52 + spacing.md }]}
          removeClippedSubviews={true}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
          }
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) {
              fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <EmptyState 
                icon="flag" 
                title={t('screens.my-reports.emptyTitle')}
                subtitle={t('screens.my-reports.emptySubtitle')} 
              />
            </View>
          }
        />
      </View>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: colors.dark.bg 
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['2xl'],
    gap: spacing.md,
  },
  emptyWrap: {
    marginTop: spacing['2xl'],
  },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: spacing.sm,
  },
  statusIconBg: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reason: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text.primary,
    textTransform: 'capitalize',
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  target: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginLeft: 32,
  },
  date: {
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    marginTop: 4,
    marginLeft: 32,
  },
});
