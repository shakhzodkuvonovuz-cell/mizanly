import { useCallback, useState, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { useUser } from '@clerk/clerk-expo';

import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ThreadCard } from '@/components/majlis/ThreadCard';
import { colors, spacing, fontSize } from '@/theme';
import { majlisListsApi } from '@/services/api';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useTranslation } from '@/hooks/useTranslation';
import type { Thread, MajlisList } from '@/types';

export default function MajlisListDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { user } = useUser();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

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
    setRefreshing(true);
    await Promise.all([listQuery.refetch(), timelineQuery.refetch()]);
    setRefreshing(false);
  }, [listQuery, timelineQuery]);

  const onEndReached = useCallback(() => {
    if (timelineQuery.hasNextPage && !timelineQuery.isFetchingNextPage) {
      timelineQuery.fetchNextPage();
    }
  }, [timelineQuery.hasNextPage, timelineQuery.isFetchingNextPage, timelineQuery.fetchNextPage]);

  const keyExtractor = useCallback((item: Thread) => item.id, []);
  const renderItem = useCallback(({ item }: { item: Thread }) => (
    <ThreadCard thread={item} viewerId={user?.id} isOwn={user?.username === item.user.username} />
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
  }, [listData, t]);

  return (
    <ScreenErrorBoundary>
      <GlassHeader
        title={listData?.name ?? t('screens.majlis-lists.title')}
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.goBack') }}
      />
      <View style={styles.container}>
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
          refreshControl={<BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      </View>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  listInfo: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.dark.border,
  },
  listName: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  listDesc: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  memberCount: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    marginTop: spacing.sm,
  },
  footer: { paddingVertical: spacing.sm },
});
