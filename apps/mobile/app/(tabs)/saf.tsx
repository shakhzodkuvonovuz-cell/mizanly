import { useCallback, useEffect, useRef, useState, useMemo, memo } from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useScrollToTop } from '@react-navigation/native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { useRouter, useNavigation } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Pressable } from 'react-native';
import { colors, spacing, fontSize, animation } from '@/theme';
import { CaughtUpCard } from '@/components/ui/CaughtUpCard';
import { useStore } from '@/store';
import { postsApi, storiesApi, notificationsApi } from '@/services/api';
import { PostCard } from '@/components/saf/PostCard';
import { StoryRow } from '@/components/saf/StoryRow';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { TabSelector } from '@/components/ui/TabSelector';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useHaptic } from '@/hooks/useHaptic';
import { useAnimatedPress } from '@/hooks/useAnimatedPress';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { rtlFlexRow, rtlTextAlign, rtlAbsoluteEnd } from '@/utils/rtl';
import { formatHijriDate } from '@/utils/hijri';
import type { Post, StoryGroup } from '@/types';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);


export default function SafScreen() {
  const { t, isRTL } = useTranslation();
  const { user } = useUser();
  const router = useRouter();
  const navigation = useNavigation();
  const haptic = useHaptic();
  const feedType = useStore((s) => s.safFeedType);
  const setFeedType = useStore((s) => s.setSafFeedType);
  const [refreshing, setRefreshing] = useState(false);
  const setUnreadNotifications = useStore((s) => s.setUnreadNotifications);
  const unreadNotifications = useStore((s) => s.unreadNotifications);

  const FEED_TABS = [
    { key: 'following', label: t('saf.following') },
    { key: 'foryou', label: t('saf.forYou') },
  ];

  const feedRef = useRef<FlashListRef<Post>>(null);
  useScrollToTop(feedRef as React.RefObject<FlashListRef<Post>>);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus' as never, () => {
      feedRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    return unsubscribe;
  }, [navigation]);

  const searchPress = useAnimatedPress();
  const bellPress = useAnimatedPress();
  const cameraPress = useAnimatedPress();
  const profilePress = useAnimatedPress();

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
    queryFn: async ({ pageParam }) => {
      const res = await postsApi.getFeed(feedType, pageParam as string | undefined);
      return res;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last?.meta?.hasMore ? last.meta.cursor ?? undefined : undefined,
  });

  const posts: Post[] = feedQuery.data?.pages.flatMap((p) => p?.data ?? []) ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([storiesQuery.refetch(), feedQuery.refetch()]);
    setRefreshing(false);
  }, [storiesQuery, feedQuery]);

  const onEndReached = useCallback(() => {
    if (feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) {
      feedQuery.fetchNextPage();
    }
  }, [feedQuery.hasNextPage, feedQuery.isFetchingNextPage, feedQuery.fetchNextPage]);

  const keyExtractor = useCallback((item: Post) => item.id, []);
  const renderItem = useCallback(({ item }: { item: Post }) => (
    <PostCard post={item} viewerId={user?.id} isOwn={user?.username === item.user.username} />
  ), [user?.id, user?.username]);

  const storyGroups: StoryGroup[] = (storiesQuery.data) ?? [];

  // Feed type animation
  const feedTypeProgress = useSharedValue(0);
  const feedTypeAnimStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.abs(feedTypeProgress.value) * 0.3,
    transform: [{ translateX: feedTypeProgress.value * 10 }],
  }));

  useEffect(() => {
    feedTypeProgress.value = withSpring(feedType === 'foryou' ? 1 : 0, animation.spring.snappy);
  }, [feedType, feedTypeProgress]);

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
      {/* Story row separator */}
      <View style={styles.storySeparator} />
      <Animated.View style={feedTypeAnimStyle}>
        <TabSelector
          tabs={FEED_TABS}
          activeKey={feedType}
          onTabChange={(key) => setFeedType(key as 'following' | 'foryou')}
          variant="pill"
          style={{ marginHorizontal: spacing.base }}
        />
      </Animated.View>
    </View>
  ), [storyGroups, feedType, setFeedType, user?.id, router, feedTypeAnimStyle]);

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
        title={t('saf.emptyFeed.title')}
        subtitle={t('saf.emptyFeed.subtitle')}
        actionLabel={t('common.explore')}
        onAction={() => router.push('/(screens)/discover')}
      />
    )
  ), [feedQuery.isLoading, router]);

  const listFooter = useMemo(() => {
    if (feedQuery.isFetchingNextPage) {
      return (
        <View style={styles.footer}>
          <Skeleton.PostCard />
        </View>
      );
    }
    if (!feedQuery.hasNextPage && posts.length > 0) {
      return <CaughtUpCard />;
    }
    return null;
  }, [feedQuery.isFetchingNextPage, feedQuery.hasNextPage, posts.length]);

  return (
    <ScreenErrorBoundary>
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { flexDirection: rtlFlexRow(isRTL) }]}>
        <View>
          <Text style={[styles.logo, { textAlign: rtlTextAlign(isRTL) }]}>Mizanly</Text>
          <Text style={styles.hijriDate}>{formatHijriDate(new Date(), isRTL ? 'ar' : 'en')}</Text>
        </View>
        <View style={[styles.headerRight, { flexDirection: rtlFlexRow(isRTL) }]}>
          <AnimatedPressable
            hitSlop={8}
            onPress={() => { haptic.light(); router.push('/(screens)/create-story'); }}
            onPressIn={cameraPress.onPressIn}
            onPressOut={cameraPress.onPressOut}
            style={cameraPress.animatedStyle}
            accessibilityLabel={t('accessibility.createStory')}
            accessibilityRole="button"
            accessibilityHint={t('accessibility.createStoryHint')}
          >
            <Icon name="camera" size="sm" color={colors.text.primary} />
          </AnimatedPressable>
          <AnimatedPressable
            hitSlop={8}
            onPress={() => { haptic.light(); router.push('/(screens)/search'); }}
            onPressIn={searchPress.onPressIn}
            onPressOut={searchPress.onPressOut}
            style={searchPress.animatedStyle}
            accessibilityLabel={t('accessibility.search')}
            accessibilityRole="button"
            accessibilityHint={t('accessibility.searchHint')}
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
            accessibilityLabel={t('accessibility.notifications')}
            accessibilityRole="button"
            accessibilityHint={t('accessibility.notificationsHint')}
          >
            <View>
              <Icon name="bell" size="sm" color={colors.text.primary} />
              {unreadNotifications > 0 && (
                <Badge
                  count={unreadNotifications}
                  size="sm"
                  style={[styles.notifBadge, rtlAbsoluteEnd(isRTL, -8)]}
                />
              )}
            </View>
          </AnimatedPressable>
          <AnimatedPressable
            hitSlop={8}
            onPress={() => {
              haptic.light();
              router.push('/(screens)/settings');
            }}
            onPressIn={profilePress.onPressIn}
            onPressOut={profilePress.onPressOut}
            style={profilePress.animatedStyle}
            accessibilityLabel={t('accessibility.yourProfile')}
            accessibilityRole="button"
          >
            <Icon name="user" size="sm" color={colors.text.primary} />
          </AnimatedPressable>
        </View>
      </View>

      <FlashList
        ref={feedRef}
        data={posts}
        keyExtractor={keyExtractor}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
        estimatedItemSize={400}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />}
      />
    </SafeAreaView>
    </ScreenErrorBoundary>
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
    fontFamily: 'PlayfairDisplay_700Bold',
    letterSpacing: -1,
  },
  hijriDate: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  notifBadge: {
    position: 'absolute',
    top: -6,
  },
  footer: { paddingVertical: spacing.sm },
  storySeparator: {
    height: 0.5,
    backgroundColor: colors.dark.border,
    marginHorizontal: spacing.base,
  },
});
