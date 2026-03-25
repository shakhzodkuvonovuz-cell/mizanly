import { useCallback, useEffect, useRef, useState, useMemo, memo } from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useScrollToTop, useFocusEffect } from '@react-navigation/native';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  runOnJS,
  withSpring,
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  FadeOutUp,
  SlideOutRight,
} from 'react-native-reanimated';
import { colors, spacing, fontSize, radius, animation, fonts, tabBar, lineHeight, letterSpacing } from '@/theme';
import { CaughtUpCard } from '@/components/ui/CaughtUpCard';
import { useStore } from '@/store';
import { postsApi, storiesApi, notificationsApi, feedApi, followsApi } from '@/services/api';
import { PostCard } from '@/components/saf/PostCard';
import { StoryRow } from '@/components/saf/StoryRow';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { CreateHeaderButton } from '@/components/ui/CreateSheet';
import { Badge } from '@/components/ui/Badge';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { TabSelector } from '@/components/ui/TabSelector';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GradientButton } from '@/components/ui/GradientButton';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useAnimatedPress } from '@/hooks/useAnimatedPress';
import { useAnimatedIcon } from '@/hooks/useAnimatedIcon';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { rtlFlexRow, rtlTextAlign, rtlAbsoluteEnd } from '@/utils/rtl';
import { formatHijriDate } from '@/utils/hijri';
import { feedCache, CACHE_KEYS } from '@/utils/feedCache';
import { useScrollLinkedHeader } from '@/hooks/useScrollLinkedHeader';
import { formatCount } from '@/utils/formatCount';
import { useThemeColors } from '@/hooks/useThemeColors';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import type { Post, StoryGroup, SuggestedUser, PaginatedResponse } from '@/types';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const EXPLORE_BANNER_KEY = 'mizanly:explore_banner_dismissed';
const SUGGESTED_USERS_INTERVAL = 8; // Insert suggestion card every N posts

// ── Suggested User Card Component ──
function SuggestedUserCard({
  users,
  onFollow,
  onDismiss,
}: {
  users: SuggestedUser[];
  onFollow: (userId: string) => void;
  onDismiss: (userId: string) => void;
}) {
  const { t, isRTL } = useTranslation();
  const haptic = useContextualHaptic();
  const tc = useThemeColors();

  if (users.length === 0) return null;

  return (
    <View style={[suggestedStyles.container, { backgroundColor: tc.bgCard }]}>
      <Text style={[suggestedStyles.title, { textAlign: rtlTextAlign(isRTL) }]}>
        {t('feed.suggestedForYou')}
      </Text>
      {users.map((user) => (
        <SuggestedUserRow
          key={user.id}
          user={user}
          isRTL={isRTL}
          onFollow={() => {
            haptic.follow();
            onFollow(user.id);
          }}
          onDismiss={() => onDismiss(user.id)}
          t={t}
        />
      ))}
    </View>
  );
}

const SuggestedUserRow = memo(function SuggestedUserRow({
  user,
  isRTL,
  onFollow,
  onDismiss,
  t,
}: {
  user: SuggestedUser;
  isRTL: boolean;
  onFollow: () => void;
  onDismiss: () => void;
  t: (key: string) => string;
}) {
  const [followed, setFollowed] = useState(false);
  const tc = useThemeColors();
  const router = useRouter();
  const haptic = useContextualHaptic();

  if (followed) return null;

  return (
    <Animated.View
      exiting={SlideOutRight.duration(300).springify()}
      style={[suggestedStyles.row, { flexDirection: rtlFlexRow(isRTL) }]}
    >
      <Pressable
        style={[suggestedStyles.userInfo, { flexDirection: rtlFlexRow(isRTL) }]}
        onPress={() => {
          haptic.navigate();
          router.push(`/(screens)/profile/${user.username}`);
        }}
        accessibilityLabel={`${user.displayName ?? user.username} profile`}
        accessibilityRole="button"
      >
        <Avatar uri={user.avatarUrl ?? null} name={user.displayName ?? user.username} size="md" />
        <View style={suggestedStyles.userText}>
          <View style={[suggestedStyles.nameRow, { flexDirection: rtlFlexRow(isRTL) }]}>
            <Text style={suggestedStyles.displayName} numberOfLines={1}>
              {user.displayName ?? user.username}
            </Text>
            {user.isVerified && <VerifiedBadge size={13} />}
          </View>
          <Text style={suggestedStyles.bio} numberOfLines={1}>
            {user.bio || `${formatCount(user.followersCount)} ${t('common.followers').toLowerCase()}`}
          </Text>
        </View>
      </Pressable>
      <Pressable
        onPress={() => {
          setFollowed(true);
          onFollow();
        }}
        style={suggestedStyles.followBtn}
        accessibilityLabel={`Follow ${user.displayName ?? user.username}`}
        accessibilityRole="button"
        hitSlop={8}
      >
        <Text style={suggestedStyles.followBtnText}>{t('common.follow')}</Text>
      </Pressable>
      <Pressable
        onPress={onDismiss}
        hitSlop={12}
        accessibilityLabel={t('common.close')}
        accessibilityRole="button"
      >
        <Icon name="x" size="xs" color={tc.text.tertiary} />
      </Pressable>
    </Animated.View>
  );
});

// ── Explore First Banner ──
function ExploreFirstBanner({ onDismiss }: { onDismiss: () => void }) {
  const { t, isRTL } = useTranslation();
  const tc = useThemeColors();

  return (
    <Animated.View
      entering={FadeIn.duration(400)}
      exiting={FadeOut.duration(300)}
      style={bannerStyles.container}
    >
      <View style={[bannerStyles.content, { flexDirection: rtlFlexRow(isRTL) }]}>
        <Icon name="trending-up" size="md" color={colors.emerald} />
        <View style={bannerStyles.textWrap}>
          <Text style={[bannerStyles.title, { textAlign: rtlTextAlign(isRTL) }]}>
            {t('feed.exploreFirstTitle')}
          </Text>
          <Text style={[bannerStyles.subtitle, { textAlign: rtlTextAlign(isRTL) }]}>
            {t('feed.exploreFirstSubtitle')}
          </Text>
        </View>
        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          accessibilityLabel={t('common.close')}
          accessibilityRole="button"
        >
          <Icon name="x" size="sm" color={tc.text.secondary} />
        </Pressable>
      </View>
    </Animated.View>
  );
}


export default function SafScreen() {
  const { t, isRTL } = useTranslation();
  const { user } = useUser();
  const router = useRouter();
  const haptic = useContextualHaptic();
  const tc = useThemeColors();
  const queryClient = useQueryClient();
  const feedType = useStore((s) => s.safFeedType);
  const setFeedType = useStore((s) => s.setSafFeedType);
  const [refreshing, setRefreshing] = useState(false);
  const setUnreadNotifications = useStore((s) => s.setUnreadNotifications);
  const unreadNotifications = useStore((s) => s.unreadNotifications);
  const unreadMessages = useStore((s) => s.unreadMessages);
  const [bannerDismissed, setBannerDismissed] = useState(true);
  const [dismissedUserIds, setDismissedUserIds] = useState<Set<string>>(new Set());

  // First-visit coach mark
  const [showCoachMark, setShowCoachMark] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem('saf_coach_seen').then(val => {
      if (!val) {
        setShowCoachMark(true);
        AsyncStorage.setItem('saf_coach_seen', '1');
      }
    });
  }, []);

  // Check if explore banner was previously dismissed
  useEffect(() => {
    AsyncStorage.getItem(EXPLORE_BANNER_KEY).then((val) => {
      if (val !== 'true') setBannerDismissed(false);
    });
  }, []);

  const dismissBanner = useCallback(() => {
    setBannerDismissed(true);
    AsyncStorage.setItem(EXPLORE_BANNER_KEY, 'true');
  }, []);

  const FEED_TABS = useMemo(() => [
    { key: 'following', label: t('saf.following') },
    { key: 'foryou', label: t('saf.forYou') },
  ], [t]);

  const feedRef = useRef<FlashListRef<Post | { _type: 'suggested' }>>(null);
  useScrollToTop(feedRef as React.RefObject<FlashListRef<Post | { _type: 'suggested' }>>);

  // ── Scroll position persistence across tab switches ──
  const lastSavedOffset = useRef(0);

  // Throttled scroll offset save — only writes to store when delta > 50px
  const handleScrollOffsetSave = useCallback((y: number) => {
    if (Math.abs(y - lastSavedOffset.current) > 50) {
      lastSavedOffset.current = y;
      useStore.getState().setSafScrollOffset(y);
    }
  }, []);

  // Restore scroll position when tab regains focus
  useFocusEffect(
    useCallback(() => {
      const offset = useStore.getState().safScrollOffset;
      if (offset > 0) {
        // Small delay to let FlashList finish layout
        const timer = setTimeout(() => {
          feedRef.current?.scrollToOffset({ offset, animated: false });
        }, 100);
        return () => clearTimeout(timer);
      }
    }, [])
  );

  const searchPress = useAnimatedPress();
  const dmPress = useAnimatedPress();
  const bellPress = useAnimatedPress();
  const cameraPress = useAnimatedPress();
  const profilePress = useAnimatedPress();
  const bellShake = useAnimatedIcon('shake');
  const { onScroll: headerOnScroll, headerAnimatedStyle, titleAnimatedStyle, scrollY } = useScrollLinkedHeader(56);

  // Combined scroll handler: header animation + scroll position persistence
  const onScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number } } }) => {
    headerOnScroll(event);
    handleScrollOffsetSave(event.nativeEvent.contentOffset.y);
  }, [headerOnScroll, handleScrollOffsetSave]);

  // Shake bell icon when unread notifications go from 0 to positive
  const prevUnreadRef = useRef(0);
  useEffect(() => {
    if (unreadNotifications > 0 && prevUnreadRef.current === 0) {
      bellShake.trigger();
    }
    prevUnreadRef.current = unreadNotifications;
  }, [unreadNotifications, bellShake]);

  // ── "New posts" banner state ──
  const [hasScrolledDown, setHasScrolledDown] = useState(false);
  const [newPostsAvailable, setNewPostsAvailable] = useState(false);

  // Watch scroll position from UI thread → update React state via runOnJS
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

  // Poll for new posts every 30s when user has scrolled down
  const newPostsCheck = useQuery({
    queryKey: ['saf-new-posts-check', feedType],
    queryFn: async () => {
      const res = await postsApi.getFeed(feedType, undefined);
      return res?.data?.[0]?.id ?? null;
    },
    refetchInterval: hasScrolledDown ? 30_000 : false,
    enabled: hasScrolledDown && !newPostsAvailable,
  });

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

  // Suggested users query
  const suggestedQuery = useQuery({
    queryKey: ['feed-suggested-users'],
    queryFn: () => feedApi.getSuggestedUsers(5),
    staleTime: 5 * 60 * 1000,
  });

  const followMutation = useMutation({
    mutationFn: (userId: string) => followsApi.follow(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed-suggested-users'] });
      queryClient.invalidateQueries({ queryKey: ['saf-feed'] });
    },
  });

  // Load cached feed data for stale-while-revalidate
  const [cachedFeedData, setCachedFeedData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    feedCache.get(CACHE_KEYS.SAF_FEED + ':' + feedType).then((cached) => {
      if (cached) setCachedFeedData(cached as Record<string, unknown>);
      else setCachedFeedData(null);
    });
  }, [feedType]);

  const feedQuery = useInfiniteQuery({
    queryKey: ['saf-feed', feedType],
    queryFn: async ({ pageParam }) => {
      const res = await postsApi.getFeed(feedType, pageParam as string | undefined);
      // Cache first page for offline / stale-while-revalidate
      if (!pageParam) {
        feedCache.set(CACHE_KEYS.SAF_FEED + ':' + feedType, res);
      }
      return res;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last?.meta?.hasMore ? last.meta.cursor ?? undefined : undefined,
    placeholderData: cachedFeedData ? {
      pages: [cachedFeedData as unknown as PaginatedResponse<Post>],
      pageParams: [undefined],
    } : undefined,
  });

  const rawPosts: Post[] = feedQuery.data?.pages.flatMap((p) => p?.data ?? []) ?? [];

  // Compare latest server post with current top of feed
  useEffect(() => {
    if (newPostsCheck.data && rawPosts.length > 0) {
      const latestServerId = newPostsCheck.data;
      const currentTopId = rawPosts[0]?.id;
      if (latestServerId && latestServerId !== currentTopId) {
        setNewPostsAvailable(true);
      }
    }
  }, [newPostsCheck.data, rawPosts]);

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

  // Interleave suggested user cards into the feed every N posts
  const suggestedUsers = useMemo(
    () => (suggestedQuery.data ?? []).filter((u) => !dismissedUserIds.has(u.id)),
    [suggestedQuery.data, dismissedUserIds],
  );
  type FeedItem = (Post & { _type?: undefined }) | { _type: 'suggested'; id: string; users: SuggestedUser[] };
  const feedItems: FeedItem[] = useMemo(() => {
    if (suggestedUsers.length === 0) return rawPosts;
    const items: FeedItem[] = [];
    let suggestedInserted = false;
    for (let i = 0; i < rawPosts.length; i++) {
      items.push(rawPosts[i]);
      // Insert suggested users card after every SUGGESTED_USERS_INTERVAL posts
      if (!suggestedInserted && i === SUGGESTED_USERS_INTERVAL - 1 && suggestedUsers.length > 0) {
        items.push({ _type: 'suggested', id: 'suggested-card', users: suggestedUsers });
        suggestedInserted = true;
      }
    }
    return items;
  }, [rawPosts, suggestedUsers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([storiesQuery.refetch(), feedQuery.refetch(), suggestedQuery.refetch()]);
    setRefreshing(false);
  }, [storiesQuery, feedQuery, suggestedQuery]);

  const onEndReached = useCallback(() => {
    if (feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) {
      feedQuery.fetchNextPage().then(() => {
        // Prefetch next page thumbnails for instant image display
        const pages = feedQuery.data?.pages;
        const lastPage = pages?.[pages.length - 1];
        if (lastPage?.data) {
          const urls = lastPage.data
            .flatMap((p: FeedItem) => (p as Record<string, unknown>).thumbnailUrl ? [(p as Record<string, unknown>).thumbnailUrl as string] : ((p as Record<string, unknown>).mediaUrls as string[] || []).slice(0, 1))
            .filter(Boolean)
            .slice(0, 10);
          urls.forEach((url: string) => { try { Image.prefetch(url); } catch {} });
        }
      }).catch(() => {});
    }
  }, [feedQuery.hasNextPage, feedQuery.isFetchingNextPage, feedQuery.fetchNextPage, feedQuery.data?.pages]);

  const keyExtractor = useCallback((item: FeedItem) => {
    if (item._type === 'suggested') return item.id;
    return item.id;
  }, []);

  const renderItem = useCallback(({ item }: { item: FeedItem }) => {
    if (item._type === 'suggested') {
      return (
        <SuggestedUserCard
          users={item.users}
          onFollow={(userId) => followMutation.mutate(userId)}
          onDismiss={(userId) => setDismissedUserIds((prev) => new Set([...prev, userId]))}
        />
      );
    }
    return (
      <Animated.View entering={FadeIn.duration(300)}>
        <PostCard post={item} viewerId={user?.id} isOwn={user?.username === item.user.username} />
        {item.commentsCount > 0 && (
          <Pressable
            onPress={() => router.push(`/(screens)/post/${item.id}`)}
            style={styles.commentPreview}
          >
            <Text style={[styles.commentPreviewText, { color: tc.text.secondary }]}>
              {t('saf.viewAllComments', { count: item.commentsCount })}
            </Text>
          </Pressable>
        )}
      </Animated.View>
    );
  }, [user?.id, user?.username, followMutation, router, tc.text.secondary, t]);

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
        onPressGroup={(group) => {
          useStore.getState().setStoryViewerData({ groups: storyGroups, startIndex: storyGroups.indexOf(group) });
          router.push('/(screens)/story-viewer');
        }}
        onPressOwn={() => {
          const ownGroup = storyGroups.find((g) => g.user.id === user?.id);
          if (ownGroup && ownGroup.stories.length > 0) {
            useStore.getState().setStoryViewerData({ groups: storyGroups, startIndex: storyGroups.indexOf(ownGroup), isOwn: true });
            router.push('/(screens)/story-viewer');
          } else {
            router.push('/(screens)/create-story');
          }
        }}
      />
      {/* Story row separator */}
      <View style={[styles.storySeparator, { backgroundColor: tc.border }]} />
      {/* Explore-first banner for new users */}
      {!bannerDismissed && (
        <ExploreFirstBanner onDismiss={dismissBanner} />
      )}
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
  ), [storyGroups, feedType, setFeedType, user?.id, router, feedTypeAnimStyle, bannerDismissed, dismissBanner, FEED_TABS, tc.border]);

  const listEmpty = useMemo(() => (
    feedQuery.isError ? (
      <EmptyState
        icon="globe"
        title={t('common.somethingWentWrong')}
        subtitle={t('common.pullToRetry')}
        actionLabel={t('common.retry')}
        onAction={() => feedQuery.refetch()}
      />
    ) : feedQuery.isLoading ? (
      <View>
        <Animated.View entering={FadeInUp.delay(0).duration(300)}>
          <Skeleton.PostCard />
        </Animated.View>
        <Animated.View entering={FadeInUp.delay(80).duration(300)}>
          <Skeleton.PostCard />
        </Animated.View>
        <Animated.View entering={FadeInUp.delay(160).duration(300)}>
          <Skeleton.PostCard />
        </Animated.View>
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
  ), [feedQuery.isLoading, feedQuery.isError, router, t]);

  const listFooter = useMemo(() => {
    if (feedQuery.isFetchingNextPage) {
      return (
        <View style={styles.footer}>
          <Skeleton.PostCard />
        </View>
      );
    }
    if (!feedQuery.hasNextPage && rawPosts.length > 0) {
      return (
        <Animated.View entering={FadeInUp.duration(400).springify()}>
          <CaughtUpCard />
        </Animated.View>
      );
    }
    return null;
  }, [feedQuery.isFetchingNextPage, feedQuery.hasNextPage, rawPosts.length]);

  return (
    <ScreenErrorBoundary>
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
      {/* First-visit coach mark */}
      {showCoachMark && (
        <Animated.View entering={FadeInDown.duration(400)} style={{ backgroundColor: colors.emerald, padding: spacing.base, borderRadius: radius.md, margin: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Icon name="trending-up" size="sm" color="#FFF" />
          <Text style={{ color: '#FFF', fontSize: fontSize.sm, flex: 1, fontFamily: 'DMSans_500Medium' }}>
            {t('onboarding.safTip', 'Welcome to Saf! Swipe between Following and For You feeds. Double-tap to like!')}
          </Text>
          <Pressable onPress={() => setShowCoachMark(false)} hitSlop={8}>
            <Icon name="x" size="xs" color="#FFF" />
          </Pressable>
        </Animated.View>
      )}
      {/* Header — hides on scroll down, reveals on scroll up */}
      <Animated.View style={[styles.header, { flexDirection: rtlFlexRow(isRTL) }, headerAnimatedStyle]}>
        <Animated.View style={titleAnimatedStyle}>
          <Text style={[styles.logo, { textAlign: rtlTextAlign(isRTL) }]}>Mizanly</Text>
          <Text style={styles.hijriDate}>{formatHijriDate(new Date(), isRTL ? 'ar' : 'en')}</Text>
        </Animated.View>
        <View style={[styles.headerRight, { flexDirection: rtlFlexRow(isRTL) }]}>
          <CreateHeaderButton />
          <AnimatedPressable
            hitSlop={8}
            onPress={() => { haptic.navigate(); router.push('/(screens)/search'); }}
            onPressIn={searchPress.onPressIn}
            onPressOut={searchPress.onPressOut}
            style={searchPress.animatedStyle}
            accessibilityLabel={t('accessibility.search')}
            accessibilityRole="button"
            accessibilityHint={t('accessibility.searchHint')}
          >
            <Icon name="search" size="sm" color={tc.text.primary} />
          </AnimatedPressable>
          {/* DMs removed from header — Risalah tab is the DM entry point */}
          <AnimatedPressable
            hitSlop={8}
            onPress={() => {
              haptic.navigate();
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
            <Animated.View style={bellShake.animatedStyle}>
              <View>
                <Icon name="bell" size="sm" color={tc.text.primary} />
                {unreadNotifications > 0 && (
                  <Badge
                    count={unreadNotifications}
                    size="sm"
                    style={[styles.notifBadge, rtlAbsoluteEnd(isRTL, -8)]}
                  />
                )}
              </View>
            </Animated.View>
          </AnimatedPressable>
          <AnimatedPressable
            hitSlop={8}
            onPress={() => {
              haptic.navigate();
              if (user?.username) {
                router.push(`/(screens)/profile/${user.username}`);
              } else {
                router.push('/(screens)/settings');
              }
            }}
            onPressIn={profilePress.onPressIn}
            onPressOut={profilePress.onPressOut}
            style={profilePress.animatedStyle}
            accessibilityLabel={t('accessibility.yourProfile')}
            accessibilityRole="button"
          >
            <Avatar uri={user?.imageUrl ?? null} name={user?.username ?? ''} size="xs" />
          </AnimatedPressable>
        </View>
      </Animated.View>

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

      <FlashList
        ref={feedRef}
        data={feedItems}
        keyExtractor={keyExtractor}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
        estimatedItemSize={400}
        windowSize={7}
        maxToRenderPerBatch={5}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: tabBar.height + spacing.base }}
        refreshControl={<BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        getItemType={(item: { _type?: string }) => (item._type === 'suggested' ? 'suggested' : 'post')}
      />
    </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  // TODO: colors.dark.bg overridden by inline style with tc.bg from useThemeColors()
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
    fontFamily: fonts.headingBold,
    letterSpacing: -1,
  },
  hijriDate: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    marginTop: 2,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  notifBadge: {
    position: 'absolute',
    top: -6,
  },
  footer: { paddingVertical: spacing.sm },
  commentPreview: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  commentPreviewText: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontFamily: fonts.body,
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
  // TODO: colors.dark.border overridden by inline style with tc.border from useThemeColors()
  storySeparator: {
    height: 0.5,
    backgroundColor: colors.dark.border,
    marginHorizontal: spacing.base,
  },
});

// ── Suggested User Card Styles ──
const suggestedStyles = StyleSheet.create({
  // TODO: colors.dark.bgCard overridden by inline style with tc.bgCard from useThemeColors()
  container: {
    backgroundColor: colors.dark.bgCard,
    marginHorizontal: spacing.base,
    marginVertical: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.base,
  },
  title: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    lineHeight: lineHeight.base,
    fontFamily: fonts.bodyBold,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  userInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  userText: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  displayName: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontFamily: fonts.bodyMedium,
  },
  bio: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    marginTop: 2,
  },
  followBtn: {
    backgroundColor: colors.emerald,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
  },
  followBtnText: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontFamily: fonts.bodyBold,
  },
});

// ── Explore-First Banner Styles ──
const bannerStyles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.base,
    marginVertical: spacing.sm,
    backgroundColor: colors.active.emerald10,
    borderRadius: radius.md,
    padding: spacing.base,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    color: colors.emerald,
    fontSize: fontSize.base,
    lineHeight: lineHeight.base,
    fontFamily: fonts.bodyBold,
  },
  subtitle: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    marginTop: 2,
  },
});
