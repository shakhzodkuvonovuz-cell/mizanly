import { useCallback, useState, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { useUser } from '@clerk/clerk-expo';

import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ThreadCard } from '@/components/majlis/ThreadCard';
import { colors, spacing, fontSize, fonts } from '@/theme';
import { majlisListsApi } from '@/services/api';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import type { Thread, MajlisList } from '@/types';

export default function MajlisListDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { user } = useUser();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const tc = useThemeColors();
  const haptic = useContextualHaptic();
  const insets = useSafeAreaInsets();

  const listQuery = useQuery({
    queryKey: ['majlis-list', id],
    queryFn: () => majlisListsApi.getById(id!),
    enabled: !!id,
  });

  const timelineQuery = useInfiniteQuery({
    queryKey: ['majlis-list-timeline', id],
    queryFn: ({ pageParam }) => majlisListsApi.getTimeline(id!, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last?.meta?.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: !!id,
  });

  const threads: Thread[] = timelineQuery.data?.pages.flatMap((p) => p?.data ?? []) ?? [];
  const listData = listQuery.data as MajlisList | undefined;

  const onRefresh = useCallback(async () => {
    haptic.tick();
    setRefreshing(true);
    await Promise.all([listQuery.refetch(), timelineQuery.refetch()]);
    setRefreshing(false);
  }, [listQuery, timelineQuery, haptic]);

  const onEndReached = useCallback(() => {
    if (timelineQuery.hasNextPage && !timelineQuery.isFetchingNextPage) {
      timelineQuery.fetchNextPage();
    }
  }, [timelineQuery.hasNextPage, timelineQuery.isFetchingNextPage, timelineQuery.fetchNextPage]);

  const keyExtractor = useCallback((item: Thread) => item.id, []);
  const renderItem = useCallback(({ item, index }: { item: Thread; index: number }) => (
    <Animated.View entering={FadeInUp.delay(Math.min(index * 50, 300)).duration(300)}>
      <ThreadCard thread={item} viewerId={user?.id} isOwn={user?.username === item.user.username} />
    </Animated.View>
  ), [user?.id, user?.username]);

  const listEmpty = useMemo(() => (
    timelineQuery.isLoading ? (
      <View>
        <Skeleton.ThreadCard />
        <Skeleton.ThreadCard />
        <Skeleton.ThreadCard />
      </View>
    ) : (
      <EmptyState
        icon="message-circle"
        title={t('screens.majlis-lists.emptyTitle')}
        subtitle={t('screens.majlis-lists.emptySubtitle')}
      />
    )
  ), [timelineQuery.isLoading, t]);

  const listFooter = useMemo(() => (
    timelineQuery.isFetchingNextPage ? (
      <View style={styles.footer}><Skeleton.ThreadCard /></View>
    ) : null
  ), [timelineQuery.isFetchingNextPage]);

  const listHeader = useMemo(() => {
    if (!listData) return null;
    return (
      <View style={[styles.listInfo, { borderBottomColor: tc.border }]}>
        <Text style={[styles.listName, { color: tc.text.primary }]}>{listData.name}</Text>
        {listData.description ? (
          <Text style={[styles.listDesc, { color: tc.text.secondary }]}>{listData.description}</Text>
        ) : null}
        <Text style={[styles.memberCount, { color: tc.text.tertiary }]}>
          {listData.membersCount ?? 0} {t('screens.majlis-lists.members')}
        </Text>
      </View>
    );
  }, [listData, t, tc]);

  // Error state (#25)
  if (listQuery.isError || timelineQuery.isError) {
    return (
      <ScreenErrorBoundary>
        <View style={[styles.container, { backgroundColor: tc.bg }]}>
          <GlassHeader
            title={t('screens.majlis-lists.title')}
            leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.goBack') }}
          />
          <View style={{ paddingTop: insets.top + 52 }}>
            <EmptyState
              icon="alert-circle"
              title={t('common.error')}
              subtitle={t('common.errorSubtitle')}
              actionLabel={t('common.retry')}
              onAction={() => { listQuery.refetch(); timelineQuery.refetch(); }}
            />
          </View>
        </View>
      </ScreenErrorBoundary>
    );
  }

  return (
    <ScreenErrorBoundary>
      <GlassHeader
        title={listData?.name ?? t('screens.majlis-lists.title')}
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.goBack') }}
      />
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <FlashList
          data={threads}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmpty}
          ListFooterComponent={listFooter}
          estimatedItemSize={200}
          contentContainerStyle={{ paddingTop: insets.top + 52 + spacing.md }}
          refreshControl={<BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      </View>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listInfo: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
  },
  listName: {
    fontSize: fontSize.lg,
    fontFamily: fonts.bold,
  },
  listDesc: {
    fontSize: fontSize.sm,
    fontFamily: fonts.regular,
    marginTop: spacing.xs,
  },
  memberCount: {
    fontSize: fontSize.xs,
    fontFamily: fonts.regular,
    marginTop: spacing.sm,
  },
  footer: { paddingVertical: spacing.sm },
});
