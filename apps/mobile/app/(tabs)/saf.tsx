import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { colors, spacing, fontSize } from '@/theme';
import { useStore } from '@/store';
import { postsApi, storiesApi, notificationsApi } from '@/services/api';
import { PostCard } from '@/components/saf/PostCard';
import { StoryRow } from '@/components/saf/StoryRow';
import type { Post, StoryGroup } from '@/types';

export default function SafScreen() {
  const { user } = useUser();
  const router = useRouter();
  const feedType = useStore((s) => s.safFeedType);
  const setFeedType = useStore((s) => s.setSafFeedType);
  const [refreshing, setRefreshing] = useState(false);
  const setUnreadNotifications = useStore((s) => s.setUnreadNotifications);
  const unreadNotifications = useStore((s) => s.unreadNotifications);

  useQuery({
    queryKey: ['notifications-count'],
    queryFn: async () => {
      const data = await notificationsApi.getUnreadCount();
      setUnreadNotifications((data as any).count ?? 0);
      return data;
    },
    refetchInterval: 60_000,
    enabled: !!user,
  });

  const storiesQuery = useQuery({
    queryKey: ['stories-feed'],
    queryFn: () => storiesApi.getFeed(),
  });

  const feedQuery = useInfiniteQuery({
    queryKey: ['saf-feed', feedType],
    queryFn: ({ pageParam }) => postsApi.getFeed(feedType, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
  });

  const posts: Post[] = feedQuery.data?.pages.flatMap((p) => p.data) ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([storiesQuery.refetch(), feedQuery.refetch()]);
    setRefreshing(false);
  }, [storiesQuery, feedQuery]);

  const onEndReached = () => {
    if (feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) {
      feedQuery.fetchNextPage();
    }
  };

  const storyGroups: StoryGroup[] = (storiesQuery.data as StoryGroup[]) ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>Mizanly</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity hitSlop={8} onPress={() => router.push('/(screens)/search')}>
            <Text style={styles.headerIcon}>🔍</Text>
          </TouchableOpacity>
          <TouchableOpacity hitSlop={8} onPress={() => { router.push('/(screens)/notifications'); setUnreadNotifications(0); }}>
            <View>
              <Text style={styles.headerIcon}>🔔</Text>
              {unreadNotifications > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{unreadNotifications > 99 ? '99+' : unreadNotifications}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <FlashList
        data={posts}
        keyExtractor={(item) => item.id}
        estimatedItemSize={450}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        onRefresh={onRefresh}
        refreshing={refreshing}
        renderItem={({ item }) => (
          <PostCard post={item} viewerId={user?.id} isOwn={user?.username === item.user.username} />
        )}
        ListHeaderComponent={() => (
          <View>
            {/* Stories */}
            <StoryRow
              groups={storyGroups}
              onPressGroup={(group) =>
                router.push({
                  pathname: '/(screens)/story-viewer',
                  params: { groupJson: JSON.stringify(group), startIndex: '0' },
                })
              }
              onPressOwn={() => router.push('/(screens)/create-story')}
            />
            {/* Feed type tabs */}
            <View style={styles.tabs}>
              {(['following', 'foryou'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={styles.tabBtn}
                  onPress={() => setFeedType(t)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tab, feedType === t && styles.tabActive]}>
                    {t === 'following' ? 'Following' : 'For You'}
                  </Text>
                  {feedType === t && <View style={styles.tabIndicator} />}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        ListEmptyComponent={() => (
          !feedQuery.isLoading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No posts yet</Text>
              <Text style={styles.emptyText}>Follow people to fill your feed</Text>
            </View>
          ) : (
            <ActivityIndicator color={colors.emerald} style={styles.loader} />
          )
        )}
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
  logo: { color: colors.emerald, fontSize: fontSize.xl, fontWeight: '700', letterSpacing: -0.5 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerIcon: { fontSize: 22 },
  notifBadge: {
    position: 'absolute', top: -4, right: -6,
    backgroundColor: colors.error, borderRadius: 8,
    minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notifBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  tabs: { flexDirection: 'row', justifyContent: 'center', borderBottomWidth: 0.5, borderBottomColor: colors.dark.border },
  tabBtn: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: 0 },
  tab: { color: colors.text.secondary, fontSize: fontSize.base, fontWeight: '600', paddingBottom: spacing.md },
  tabActive: { color: colors.text.primary },
  tabIndicator: { height: 2, width: '80%', backgroundColor: colors.emerald, borderRadius: 1, marginBottom: -0.5 },
  empty: { alignItems: 'center', paddingTop: 80, gap: spacing.sm },
  emptyTitle: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '600' },
  emptyText: { color: colors.text.secondary, fontSize: fontSize.base },
  loader: { marginTop: 60 },
  footer: { paddingVertical: spacing.xl },
});
