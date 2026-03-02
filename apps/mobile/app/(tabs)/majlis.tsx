import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { colors, spacing, fontSize } from '@/theme';
import { useStore } from '@/store';
import { threadsApi } from '@/services/api';
import { ThreadCard } from '@/components/majlis/ThreadCard';
import type { Thread } from '@/types';

const TABS = [
  { key: 'foryou', label: 'For You' },
  { key: 'following', label: 'Following' },
  { key: 'trending', label: 'Trending' },
] as const;

export default function MajlisScreen() {
  const { user } = useUser();
  const feedType = useStore((s) => s.majlisFeedType);
  const setFeedType = useStore((s) => s.setMajlisFeedType);
  const [refreshing, setRefreshing] = useState(false);

  const feedQuery = useInfiniteQuery({
    queryKey: ['majlis-feed', feedType],
    queryFn: ({ pageParam }) => threadsApi.getFeed(feedType, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
  });

  const threads: Thread[] = feedQuery.data?.pages.flatMap((p) => p.data) ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await feedQuery.refetch();
    setRefreshing(false);
  }, [feedQuery]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>Majlis</Text>
        <TouchableOpacity hitSlop={8}>
          <Text style={styles.headerIcon}>🔍</Text>
        </TouchableOpacity>
      </View>

      {/* Feed tabs */}
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={styles.tabBtn}
            onPress={() => setFeedType(t.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tab, feedType === t.key && styles.tabActive]}>{t.label}</Text>
            {feedType === t.key && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      <FlashList
        data={threads}
        keyExtractor={(item) => item.id}
        estimatedItemSize={120}
        onEndReached={() => {
          if (feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) feedQuery.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        onRefresh={onRefresh}
        refreshing={refreshing}
        renderItem={({ item }) => <ThreadCard thread={item} viewerId={user?.id} />}
        ListEmptyComponent={() =>
          !feedQuery.isLoading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No threads yet</Text>
              <Text style={styles.emptyText}>Start a conversation</Text>
            </View>
          ) : (
            <ActivityIndicator color={colors.emerald} style={styles.loader} />
          )
        }
        ListFooterComponent={() =>
          feedQuery.isFetchingNextPage ? (
            <ActivityIndicator color={colors.emerald} style={styles.footer} />
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
  logo: { color: colors.text.primary, fontSize: fontSize.xl, fontWeight: '700' },
  headerIcon: { fontSize: 22 },
  tabs: { flexDirection: 'row', justifyContent: 'center', borderBottomWidth: 0.5, borderBottomColor: colors.dark.border },
  tabBtn: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  tab: { color: colors.text.secondary, fontSize: fontSize.base, fontWeight: '600', paddingBottom: spacing.md },
  tabActive: { color: colors.text.primary },
  tabIndicator: { height: 2, width: '80%', backgroundColor: colors.emerald, borderRadius: 1, marginBottom: -0.5 },
  empty: { alignItems: 'center', paddingTop: 80, gap: spacing.sm },
  emptyTitle: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '600' },
  emptyText: { color: colors.text.secondary, fontSize: fontSize.base },
  loader: { marginTop: 60 },
  footer: { paddingVertical: spacing.xl },
});
