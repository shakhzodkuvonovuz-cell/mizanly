import { useCallback, useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useScrollToTop } from '@react-navigation/native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { colors, spacing, fontSize } from '@/theme';
import { useStore } from '@/store';
import { postsApi, storiesApi, notificationsApi } from '@/services/api';
import { PostCard } from '@/components/saf/PostCard';
import { StoryRow } from '@/components/saf/StoryRow';
import { Icon } from '@/components/ui/Icon';
import { Badge } from '@/components/ui/Badge';
import { TabSelector } from '@/components/ui/TabSelector';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useHaptic } from '@/hooks/useHaptic';
import { useAnimatedPress } from '@/hooks/useAnimatedPress';
import Animated from 'react-native-reanimated';
import { Pressable } from 'react-native';
import type { Post, StoryGroup } from '@/types';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const FEED_TABS = [
  { key: 'following', label: 'Following' },
  { key: 'foryou', label: 'For You' },
];

export default function SafScreen() {
  const { user } = useUser();
  const router = useRouter();
  const haptic = useHaptic();
  const feedType = useStore((s) => s.safFeedType);
  const setFeedType = useStore((s) => s.setSafFeedType);
  const [refreshing, setRefreshing] = useState(false);
  const setUnreadNotifications = useStore((s) => s.setUnreadNotifications);
  const unreadNotifications = useStore((s) => s.unreadNotifications);

  const feedRef = useRef<FlashList<Post>>(null);
  useScrollToTop(feedRef);

  const searchPress = useAnimatedPress();
  const bellPress = useAnimatedPress();

  useQuery({
    queryKey: ['notifications-count'],
    queryFn: async () => {
      const data = await notificationsApi.getUnreadCount();
      setUnreadNotifications(data.unread ?? 0);
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

  const storyGroups: StoryGroup[] = (storiesQuery.data) ?? [];

  const listHeader = useMemo(() => (
    <View>
      <StoryRow
        groups={storyGroups}
        onPressGroup={(group) =>
          router.push({
            pathname: '/(screens)/story-viewer',
            params: { groupJson: JSON.stringify(group), startIndex: '0' },
          })
        }
        onPressOwn={() => {
          const ownGroup = storyGroups.find((g) => g.user.id === user?.id);
          if (ownGroup && ownGroup.stories.length > 0) {
            router.push({
              pathname: '/(screens)/story-viewer',
              params: { groupJson: JSON.stringify(ownGroup), startIndex: '0', isOwn: 'true' },
            });
          } else {
            router.push('/(screens)/create-story');
          }
        }}
      />
      <TabSelector
        tabs={FEED_TABS}
        activeKey={feedType}
        onTabChange={(key) => setFeedType(key as 'following' | 'foryou')}
        variant="pill"
      />
    </View>
  ), [storyGroups, feedType, setFeedType, user?.id, router]);

  const listEmpty = useMemo(() => (
    feedQuery.isLoading ? (
      <View>
        <Skeleton.PostCard />
        <Skeleton.PostCard />
        <Skeleton.PostCard />
      </View>
    ) : (
      <EmptyState
        icon="users"
        title="No posts yet"
        subtitle="Follow people to fill your feed"
      />
    )
  ), [feedQuery.isLoading]);

  const listFooter = useMemo(() => (
    feedQuery.isFetchingNextPage ? (
      <View style={styles.footer}>
        <Skeleton.PostCard />
      </View>
    ) : null
  ), [feedQuery.isFetchingNextPage]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>Mizanly</Text>
        <View style={styles.headerRight}>
          <AnimatedPressable
            hitSlop={8}
            onPress={() => { haptic.light(); router.push('/(screens)/search'); }}
            onPressIn={searchPress.onPressIn}
            onPressOut={searchPress.onPressOut}
            style={searchPress.animatedStyle}
          >
            <Icon name="search" size="sm" color={colors.text.primary} />
          </AnimatedPressable>
          <AnimatedPressable
            hitSlop={8}
            onPress={() => {
              haptic.light();
              router.push('/(screens)/notifications');
              setUnreadNotifications(0);
            }}
            onPressIn={bellPress.onPressIn}
            onPressOut={bellPress.onPressOut}
            style={bellPress.animatedStyle}
          >
            <View>
              <Icon name="bell" size="sm" color={colors.text.primary} />
              {unreadNotifications > 0 && (
                <Badge
                  count={unreadNotifications}
                  size="sm"
                  style={styles.notifBadge}
                />
              )}
            </View>
          </AnimatedPressable>
        </View>
      </View>

      <FlashList
        ref={feedRef}
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
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  logo: {
    color: colors.emerald,
    fontSize: fontSize.xl,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  notifBadge: {
    position: 'absolute',
    top: -6,
    right: -8,
  },
  footer: { paddingVertical: spacing.sm },
});
