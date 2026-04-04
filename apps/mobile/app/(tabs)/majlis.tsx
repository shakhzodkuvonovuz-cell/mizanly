import { useCallback, useEffect, useRef, useState, useMemo, memo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useScrollToTop, useFocusEffect } from '@react-navigation/native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  runOnJS,
  withSpring,
  withSequence,
  withTiming,
  FadeInUp,
  FadeInDown,
  FadeOutUp,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, animation, radius, tabBar, fonts } from '@/theme';
import { useStore } from '@/store';
import { threadsApi, hashtagsApi } from '@/services/api';
import { ThreadCard } from '@/components/majlis/ThreadCard';
import { Icon } from '@/components/ui/Icon';
import { TabSelector } from '@/components/ui/TabSelector';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useThemeColors } from '@/hooks/useThemeColors';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useScrollLinkedHeader } from '@/hooks/useScrollLinkedHeader';
import { rtlFlexRow, rtlTextAlign, rtlAbsoluteEnd, rtlBorderStart } from '@/utils/rtl';
import type { Thread } from '@/types';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);


// Animated thread card with entrance animation and engagement glow
interface AnimatedThreadCardProps {
  thread: Thread;
  viewerId?: string;
  isOwn?: boolean;
  index: number;
  isRTL?: boolean;
  isRead?: boolean;
}

const AnimatedThreadCard = memo(function AnimatedThreadCard({ thread, viewerId, isOwn, index, isRTL: isRTLProp, isRead }: AnimatedThreadCardProps) {
  // Entrance animation
  const translateY = useSharedValue(4);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const delay = Math.min(index * 50, 300); // Stagger animation, max 300ms delay
    const timer = setTimeout(() => {
      translateY.value = withSpring(0, animation.spring.gentle);
      opacity.value = withTiming(1, { duration: 250 });
    }, delay);
    return () => clearTimeout(timer);
  }, [index, translateY, opacity]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  // Engagement glow: high engagement gets gold start border
  const hasHighEngagement = thread.likesCount > 50 || thread.repliesCount > 20;

  return (
    <Animated.View style={[animStyle, hasHighEngagement && rtlBorderStart(!!isRTLProp, 2, colors.gold)]}>
      <ThreadCard thread={thread} viewerId={viewerId} isOwn={isOwn} isRead={isRead} />
    </Animated.View>
  );
});

export default function MajlisScreen() {
  const { t, isRTL } = useTranslation();
  const { user } = useUser();
  const router = useRouter();
  const haptic = useContextualHaptic();
  const tc = useThemeColors();
  const feedType = useStore((s) => s.majlisFeedType);
  const setFeedType = useStore((s) => s.setMajlisFeedType);
  const [refreshing, setRefreshing] = useState(false);
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);

  // Load last read timestamp on mount, update when tab gains focus
  useEffect(() => {
    AsyncStorage.getItem('majlis_last_read').then(setLastReadAt).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => {
    // Mark all current threads as read when user views the tab
    const now = new Date().toISOString();
    AsyncStorage.setItem('majlis_last_read', now).catch(() => {});
    setLastReadAt(now);
  }, []));

  const { onScroll: headerOnScroll, headerAnimatedStyle, titleAnimatedStyle, scrollY } = useScrollLinkedHeader(56);

  // ── Scroll position persistence across tab switches ──
  const lastSavedOffset = useRef(0);

  // Throttled scroll offset save — only writes to store when delta > 50px
  const handleScrollOffsetSave = useCallback((y: number) => {
    if (Math.abs(y - lastSavedOffset.current) > 50) {
      lastSavedOffset.current = y;
      useStore.getState().setMajlisScrollOffset(y);
    }
  }, []);

  // Combined scroll handler: header animation + scroll position persistence
  const onScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number } } }) => {
    headerOnScroll(event);
    handleScrollOffsetSave(event.nativeEvent.contentOffset.y);
  }, [headerOnScroll, handleScrollOffsetSave]);

  // ── "New posts" banner state ──
  const [hasScrolledDown, setHasScrolledDown] = useState(false);
  const [newPostsAvailable, setNewPostsAvailable] = useState(false);

  // Watch scroll position from UI thread -> update React state via runOnJS
  useAnimatedReaction(
    () => scrollY.value,
    (currentY) => {
      if (currentY > 200) {
        runOnJS(setHasScrolledDown)(true);
      } else if (currentY < 50) {
        runOnJS(setHasScrolledDown)(false);
      }
    },
    [scrollY],
  );

  const TABS = useMemo(() => [
    { key: 'foryou', label: t('majlis.forYou') },
    { key: 'following', label: t('majlis.following') },
    { key: 'trending', label: t('majlis.trending') },
    { key: 'video', label: t('majlis.video') },
  ], [t]);

  // Feed transition animation
  const feedOpacity = useSharedValue(1);
  const feedAnimStyle = useAnimatedStyle(() => ({
    opacity: feedOpacity.value,
  }));

  const feedRef = useRef<FlashListRef<Thread>>(null);
  useScrollToTop(feedRef as React.RefObject<FlashListRef<Thread>>);

  // Restore scroll position when tab regains focus
  useFocusEffect(
    useCallback(() => {
      const offset = useStore.getState().majlisScrollOffset;
      if (offset > 0) {
        const timer = setTimeout(() => {
          feedRef.current?.scrollToOffset({ offset, animated: false });
        }, 100);
        return () => clearTimeout(timer);
      }
    }, [])
  );

  // Floating compose button
  const fabScale = useSharedValue(1);
  const fabStyle = useAnimatedStyle(() => ({
    transform: [{ scale: fabScale.value }],
  }));

  // Animate feed transition when feedType changes
  useEffect(() => {
    feedOpacity.value = withTiming(0, { duration: 75 });
    const timer = setTimeout(() => {
      feedOpacity.value = withTiming(1, { duration: 75 });
    }, 75);
    return () => clearTimeout(timer);
  }, [feedType, feedOpacity]);

  const feedQuery = useInfiniteQuery({
    queryKey: ['majlis-feed', feedType],
    queryFn: ({ pageParam }) => {
      return threadsApi.getFeed(feedType as 'foryou' | 'following' | 'trending' | 'video', pageParam as string | undefined);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last?.meta?.hasMore ? last.meta.cursor ?? undefined : undefined,
  });

  const trendingHashtagsQuery = useQuery({
    queryKey: ['trending-hashtags'],
    queryFn: () => hashtagsApi.getTrending(),
  });

  // Poll for new posts every 30s when user has scrolled down
  const newPostsCheck = useQuery({
    queryKey: ['majlis-new-posts-check', feedType],
    queryFn: async () => {
      const res = await threadsApi.getFeed(feedType as 'foryou' | 'following' | 'trending' | 'video', undefined);
      return res?.data?.[0]?.id ?? null;
    },
    refetchInterval: hasScrolledDown ? 30_000 : false,
    enabled: hasScrolledDown && !newPostsAvailable,
  });

  const allThreads: Thread[] = feedQuery.data?.pages.flatMap((p) => p?.data ?? []) ?? [];
  // Video tab: client-side safety filter (API should already return video-only when type='video')
  const threads = feedType === 'video'
    ? allThreads.filter((t) => t.mediaTypes?.some((mt: string) => mt.startsWith('video')))
    : allThreads;

  // Compare latest server post with current top of feed
  useEffect(() => {
    if (newPostsCheck.data && allThreads.length > 0) {
      const latestServerId = newPostsCheck.data;
      const currentTopId = allThreads[0]?.id;
      if (latestServerId && latestServerId !== currentTopId) {
        setNewPostsAvailable(true);
      }
    }
  }, [newPostsCheck.data, allThreads]);

  // Clear banner when user scrolls back to top
  useEffect(() => {
    if (!hasScrolledDown) {
      setNewPostsAvailable(false);
    }
  }, [hasScrolledDown]);

  const handleNewPostsBanner = useCallback(() => {
    feedRef.current?.scrollToOffset({ offset: 0, animated: true });
    feedQuery.refetch();
    setNewPostsAvailable(false);
    setHasScrolledDown(false);
    haptic.navigate();
  }, [feedQuery, haptic]);

  const listEmpty = useMemo(() => (
    feedQuery.isError ? (
      <EmptyState icon="globe" title={t('common.somethingWentWrong')} subtitle={t('common.pullToRetry')} actionLabel={t('common.retry')} onAction={() => feedQuery.refetch()} />
    ) : feedQuery.isLoading ? (
      <View>
        <Animated.View entering={FadeInUp.delay(0).duration(300)}>
          <Skeleton.ThreadCard />
        </Animated.View>
        <Animated.View entering={FadeInUp.delay(80).duration(300)}>
          <Skeleton.ThreadCard />
        </Animated.View>
        <Animated.View entering={FadeInUp.delay(160).duration(300)}>
          <Skeleton.ThreadCard />
        </Animated.View>
        <Animated.View entering={FadeInUp.delay(240).duration(300)}>
          <Skeleton.ThreadCard />
        </Animated.View>
      </View>
    ) : (
      <EmptyState
        icon="message-circle"
        title={t('majlis.emptyFeed.title')}
        subtitle={t('majlis.emptyFeed.subtitle')}
        actionLabel={t('majlis.emptyFeed.actionLabel')}
        onAction={() => router.push('/(screens)/create-thread')}
      />
    )
  ), [feedQuery.isLoading, feedQuery.isError, router, t]);

  const listFooter = useMemo(() => {
    if (feedQuery.isFetchingNextPage) {
      return (
        <View style={styles.footer}>
          <Skeleton.ThreadCard />
        </View>
      );
    }
    if (!feedQuery.hasNextPage && threads.length > 0) {
      return (
        <View style={styles.endOfFeed}>
          <Icon name="check-circle" size="sm" color={colors.emerald} />
          <Text style={[styles.endOfFeedText, { color: tc.text.secondary }]}>{t('majlis.caughtUp')}</Text>
        </View>
      );
    }
    return null;
  }, [feedQuery.isFetchingNextPage, feedQuery.hasNextPage, threads.length, t]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await feedQuery.refetch();
    setRefreshing(false);
  }, [feedQuery]);

  const keyExtractor = useCallback((item: Thread) => item.id, []);
  const renderItem = useCallback(({ item, index }: { item: Thread; index: number }) => (
    <AnimatedThreadCard
      thread={item}
      viewerId={user?.id}
      isOwn={user?.username === item.user.username}
      index={index}
      isRTL={isRTL}
      isRead={!lastReadAt || new Date(item.createdAt) <= new Date(lastReadAt)}
    />
  ), [user?.id, user?.username, isRTL]);
  const onEndReached = useCallback(() => {
    if (feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) feedQuery.fetchNextPage();
  }, [feedQuery.hasNextPage, feedQuery.isFetchingNextPage, feedQuery.fetchNextPage]);

  return (
    <ScreenErrorBoundary>
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
      {/* Header — collapses proportionally on scroll */}
      <Animated.View style={[styles.header, { flexDirection: rtlFlexRow(isRTL) }, headerAnimatedStyle]}>
        <Animated.Text style={[styles.logo, { textAlign: rtlTextAlign(isRTL) }, titleAnimatedStyle]}>{t('tabs.majlis')}</Animated.Text>
        <View style={[styles.headerRight, { flexDirection: rtlFlexRow(isRTL) }]}>
          <Pressable
            hitSlop={8}
            onPress={() => { haptic.navigate(); router.push('/(screens)/audio-room'); }}
            accessibilityLabel={t('tabs.audioRooms')}
            accessibilityRole="button"
          >
            <Icon name="mic" size="sm" color={tc.text.primary} />
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={() => { haptic.navigate(); router.push('/(screens)/majlis-lists'); }}
            accessibilityLabel={t('screens.majlis-lists.title')}
            accessibilityRole="button"
          >
            <Icon name="layers" size="sm" color={tc.text.primary} />
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={() => { haptic.navigate(); router.push('/(screens)/search'); }}
            accessibilityLabel={t('common.search')}
            accessibilityRole="button"
            accessibilityHint={t('accessibility.searchHint')}
          >
            <Icon name="search" size="sm" color={tc.text.primary} />
          </Pressable>
        </View>
      </Animated.View>

      {/* Feed tabs */}
      <TabSelector
        tabs={TABS}
        activeKey={feedType}
        onTabChange={(key) => setFeedType(key as 'foryou' | 'following' | 'trending' | 'video')}
      />

      {/* Trending hashtags */}
      {trendingHashtagsQuery.isLoading || (trendingHashtagsQuery.data && trendingHashtagsQuery.data.length > 0) ? (
        <View style={[styles.trendingHeader, { flexDirection: rtlFlexRow(isRTL) }]}>
          <Icon name="trending-up" size="sm" color={colors.gold} />
          <Text style={[styles.trendingHeaderText, { color: tc.text.primary }]}>{t('tabs.trending')}</Text>
        </View>
      ) : null}
      {trendingHashtagsQuery.isLoading ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hashtagContainer}>
          {[...Array(5)].map((_, i) => (
            <Skeleton.Rect key={i} width={80} height={32} borderRadius={radius.full} />
          ))}
        </ScrollView>
      ) : trendingHashtagsQuery.data && trendingHashtagsQuery.data.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hashtagContainer}>
          {trendingHashtagsQuery.data.map((hashtag) => (
            <Pressable
              key={hashtag.name}
              style={[styles.hashtagChip, { backgroundColor: tc.surface, borderColor: tc.border }]}
              onPress={() => {
                haptic.navigate();
                router.push(`/(screens)/hashtag/${hashtag.name}`);
              }}
              accessibilityLabel={t('accessibility.hashtag', { name: hashtag.name })}
              accessibilityRole="button"
              accessibilityHint={t('accessibility.hashtagHint', { name: hashtag.name })}
            >
              <Text style={styles.hashtagText}>#{hashtag.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {/* "New posts" banner — slides in when new content arrives while scrolled down */}
      {newPostsAvailable && hasScrolledDown && (
        <Animated.View
          entering={FadeInDown.duration(300).springify()}
          exiting={FadeOutUp.duration(200)}
          style={styles.newPostsBanner}
        >
          <Pressable
            onPress={handleNewPostsBanner}
            style={styles.newPostsBannerButton}
            accessibilityLabel={t('saf.newPosts')}
            accessibilityRole="button"
          >
            <Icon name="arrow-left" size="xs" color="#fff" style={{ transform: [{ rotate: '90deg' }] }} />
            <Text style={styles.newPostsBannerText}>{t('saf.newPosts')}</Text>
          </Pressable>
        </Animated.View>
      )}

      <Animated.View style={[{ flex: 1 }, feedAnimStyle]}>
        <FlashList
          ref={feedRef}
          data={threads}
          keyExtractor={keyExtractor}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          renderItem={renderItem}
          ListEmptyComponent={listEmpty}
          ListFooterComponent={listFooter}
          estimatedItemSize={200}
          windowSize={7}
          maxToRenderPerBatch={5}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingBottom: tabBar.height + spacing.base }}
          refreshControl={<BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      </Animated.View>

      {/* Floating compose button */}
      <AnimatedPressable
        style={[styles.fab, fabStyle]}
        onPress={() => {
          haptic.send();
          fabScale.value = withSequence(
            withSpring(0.85, animation.spring.bouncy),
            withSpring(1, animation.spring.bouncy),
          );
          router.push('/(screens)/create-thread');
        }}
        accessibilityLabel={t('accessibility.composeThread')}
        accessibilityRole="button"
        accessibilityHint={t('accessibility.composeThreadHint')}
      >
        <LinearGradient
          colors={[colors.emeraldLight, colors.emerald]}
          style={styles.fabGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Icon name="pencil" size="md" color="#FFF" strokeWidth={2} />
        </LinearGradient>
      </AnimatedPressable>
    </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  logo: { color: colors.emerald, fontSize: fontSize.xl, fontFamily: fonts.headingBold },
  headerRight: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.lg },
  footer: { paddingVertical: spacing.sm },
  fab: {
    position: 'absolute',
    bottom: tabBar.height + 16,
    end: spacing.lg,
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
  trendingHeaderText: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  hashtagContainer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  hashtagChip: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
  },
  hashtagText: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  endOfFeed: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  endOfFeedText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  newPostsBanner: {
    position: 'absolute',
    top: 100,
    start: 0,
    end: 0,
    zIndex: 50,
    alignItems: 'center',
  },
  newPostsBannerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.emerald,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  newPostsBannerText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontFamily: fonts.bodyBold,
  },
});
