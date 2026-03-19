import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useScrollToTop } from '@react-navigation/native';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { useRouter, useNavigation } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeIn,
  FadeOut,
  SlideOutRight,
} from 'react-native-reanimated';
import { colors, spacing, fontSize, radius, animation } from '@/theme';
import { CaughtUpCard } from '@/components/ui/CaughtUpCard';
import { useStore } from '@/store';
import { postsApi, storiesApi, notificationsApi, feedApi, followsApi } from '@/services/api';
import { PostCard } from '@/components/saf/PostCard';
import { StoryRow } from '@/components/saf/StoryRow';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { TabSelector } from '@/components/ui/TabSelector';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GradientButton } from '@/components/ui/GradientButton';
import { useHaptic } from '@/hooks/useHaptic';
import { useAnimatedPress } from '@/hooks/useAnimatedPress';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { rtlFlexRow, rtlTextAlign, rtlAbsoluteEnd } from '@/utils/rtl';
import { formatHijriDate } from '@/utils/hijri';
import type { Post, StoryGroup, SuggestedUser } from '@/types';

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
  const haptic = useHaptic();

  if (users.length === 0) return null;

  return (
    <View style={suggestedStyles.container}>
      <Text style={[suggestedStyles.title, { textAlign: rtlTextAlign(isRTL) }]}>
        {t('feed.suggestedForYou')}
      </Text>
      {users.map((user) => (
        <SuggestedUserRow
          key={user.id}
          user={user}
          isRTL={isRTL}
          onFollow={() => {
            haptic.light();
            onFollow(user.id);
          }}
          onDismiss={() => onDismiss(user.id)}
          t={t}
        />
      ))}
    </View>
  );
}

function SuggestedUserRow({
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
  const router = useRouter();
  const haptic = useHaptic();

  if (followed) return null;

  return (
    <Animated.View
      exiting={SlideOutRight.duration(300).springify()}
      style={[suggestedStyles.row, { flexDirection: rtlFlexRow(isRTL) }]}
    >
      <Pressable
        style={[suggestedStyles.userInfo, { flexDirection: rtlFlexRow(isRTL) }]}
        onPress={() => {
          haptic.light();
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
            {user.bio || `${user.followersCount ?? 0} ${t('common.followers').toLowerCase()}`}
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
        <Icon name="x" size="xs" color={colors.text.tertiary} />
      </Pressable>
    </Animated.View>
  );
}

// ── Explore First Banner ──
function ExploreFirstBanner({ onDismiss }: { onDismiss: () => void }) {
  const { t, isRTL } = useTranslation();

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
          <Icon name="x" size="sm" color={colors.text.secondary} />
        </Pressable>
      </View>
    </Animated.View>
  );
}


export default function SafScreen() {
  const { t, isRTL } = useTranslation();
  const { user } = useUser();
  const router = useRouter();
  const navigation = useNavigation();
  const haptic = useHaptic();
  const queryClient = useQueryClient();
  const feedType = useStore((s) => s.safFeedType);
  const setFeedType = useStore((s) => s.setSafFeedType);
  const [refreshing, setRefreshing] = useState(false);
  const setUnreadNotifications = useStore((s) => s.setUnreadNotifications);
  const unreadNotifications = useStore((s) => s.unreadNotifications);
  const [bannerDismissed, setBannerDismissed] = useState(true);
  const [dismissedUserIds, setDismissedUserIds] = useState<Set<string>>(new Set());

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

  const FEED_TABS = [
    { key: 'following', label: t('saf.following') },
    { key: 'foryou', label: t('saf.forYou') },
  ];

  const feedRef = useRef<FlashListRef<Post | { _type: 'suggested' }>>(null);
  useScrollToTop(feedRef as React.RefObject<FlashListRef<Post | { _type: 'suggested' }>>);

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

  const feedQuery = useInfiniteQuery({
    queryKey: ['saf-feed', feedType],
    queryFn: async ({ pageParam }) => {
      const res = await postsApi.getFeed(feedType, pageParam as string | undefined);
      return res;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last?.meta?.hasMore ? last.meta.cursor ?? undefined : undefined,
  });

  const rawPosts: Post[] = feedQuery.data?.pages.flatMap((p) => p?.data ?? []) ?? [];

  // Interleave suggested user cards into the feed every N posts
  const suggestedUsers = (suggestedQuery.data ?? []).filter((u) => !dismissedUserIds.has(u.id));
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
      feedQuery.fetchNextPage();
    }
  }, [feedQuery.hasNextPage, feedQuery.isFetchingNextPage, feedQuery.fetchNextPage]);

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
    return <PostCard post={item} viewerId={user?.id} isOwn={user?.username === item.user.username} />;
  }, [user?.id, user?.username, followMutation]);

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
      <View style={styles.storySeparator} />
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
  ), [storyGroups, feedType, setFeedType, user?.id, router, feedTypeAnimStyle, bannerDismissed, dismissBanner]);

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
  ), [feedQuery.isLoading, router, t]);

  const listFooter = useMemo(() => {
    if (feedQuery.isFetchingNextPage) {
      return (
        <View style={styles.footer}>
          <Skeleton.PostCard />
        </View>
      );
    }
    if (!feedQuery.hasNextPage && rawPosts.length > 0) {
      return <CaughtUpCard />;
    }
    return null;
  }, [feedQuery.isFetchingNextPage, feedQuery.hasNextPage, rawPosts.length]);

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
      </View>

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />}
        getItemType={(item) => (item._type === 'suggested' ? 'suggested' : 'post')}
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

// ── Suggested User Card Styles ──
const suggestedStyles = StyleSheet.create({
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
    fontFamily: 'DMSans_700Bold',
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
    fontFamily: 'DMSans_500Medium',
  },
  bio: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
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
    fontFamily: 'DMSans_700Bold',
  },
});

// ── Explore-First Banner Styles ──
const bannerStyles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.base,
    marginVertical: spacing.sm,
    backgroundColor: 'rgba(10,123,79,0.10)',
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
    fontFamily: 'DMSans_700Bold',
  },
  subtitle: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
});
