import { useState, useCallback, memo } from 'react';
import {
  View, Text, StyleSheet,
  FlatList, ScrollView, Dimensions, Pressable, Alert, Linking, Share,
} from 'react-native';
import { formatDistanceToNowStrict } from 'date-fns';
import { getDateFnsLocale } from '@/utils/localeFormat';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { navigate } from '@/utils/navigation';
import { showToast } from '@/components/ui/Toast';
import { useTranslation } from '@/hooks/useTranslation';
import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { LinearGradient } from 'expo-linear-gradient';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
  withSpring,
} from 'react-native-reanimated';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { RichText } from '@/components/ui/RichText';
import { TabSelector } from '@/components/ui/TabSelector';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { GradientButton } from '@/components/ui/GradientButton';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useAnimatedPress } from '@/hooks/useAnimatedPress';
import { useAnimatedIcon } from '@/hooks/useAnimatedIcon';
import { useThemeColors } from '@/hooks/useThemeColors';
import { colors, spacing, fontSize, radius, animation, fontSizeExt, lineHeight, letterSpacing, fonts } from '@/theme';
import { formatCount } from '@/utils/formatCount';
import { usersApi, followsApi, postsApi, threadsApi, storiesApi, blocksApi, mutesApi, reelsApi } from '@/services/api';
import { PostCard } from '@/components/saf/PostCard';
import type { Post, Thread, StoryHighlightAlbum, Reel, User } from '@/types';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useStore } from '@/store';
import { rtlFlexRow, rtlTextAlign, rtlArrow, rtlMargin, rtlAbsoluteEnd } from '@/utils/rtl';

const SCREEN_W = Dimensions.get('window').width;
const GRID_ITEM = (SCREEN_W - 4) / 3;
const COVER_HEIGHT = 160;

type Tab = 'posts' | 'threads' | 'reels' | 'liked';


const GridItem = memo(function GridItem({ post, onPress }: { post: Post; onPress: () => void }) {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.96, animation.spring.snappy); }}
        onPressOut={() => { scale.value = withSpring(1, animation.spring.snappy); }}
        style={styles.gridItem}
        accessibilityLabel={`View post ${post.id}`}
        accessibilityRole="button"
      >
        {post.mediaUrls.length > 0 ? (
          <ProgressiveImage
            uri={post.thumbnailUrl ?? post.mediaUrls[0]}
            width="100%"
            height={GRID_ITEM}
            contentFit="cover"
          />
        ) : (
          <View style={styles.gridTextPost}>
            <Text style={styles.gridTextContent} numberOfLines={4}>
              {post.content}
            </Text>
          </View>
        )}
        {post.mediaUrls.length > 1 && (
          <View style={styles.carouselBadge}>
            <Icon name="layers" size={12} color="#fff" />
          </View>
        )}
        {post.collaborators && post.collaborators.length > 0 && (
          <View style={{
            position: 'absolute', top: 4, right: 4,
            backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.full,
            padding: 3,
          }}>
            <Icon name="users" size={10} color="#fff" />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
});

const ReelGridItem = memo(function ReelGridItem({ reel, onPress }: { reel: Reel; onPress: () => void }) {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.96, animation.spring.snappy); }}
        onPressOut={() => { scale.value = withSpring(1, animation.spring.snappy); }}
        style={styles.gridItem}
        accessibilityLabel={`View reel ${reel.id}`}
        accessibilityRole="button"
      >
        {reel.thumbnailUrl ? (
          <ProgressiveImage
            uri={reel.thumbnailUrl}
            width="100%"
            height={GRID_ITEM}
            contentFit="cover"
          />
        ) : (
          <View style={styles.gridTextPost}>
            <Icon name="video" size={24} color={tc.text.secondary} />
          </View>
        )}
        <View style={styles.reelOverlay}>
          <Icon name="play" size={16} color="#fff" />
          <Text style={styles.reelDuration}>
            {Math.floor(reel.duration / 60)}:{String(Math.floor(reel.duration % 60)).padStart(2, '0')}
          </Text>
        </View>
        <View style={styles.reelStats}>
          <Icon name="heart" size={12} color="#fff" />
          <Text style={styles.reelStatText}>{reel.likesCount}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
});

function StatItem({ num, label, onPress }: { num: number; label: string; onPress?: () => void }) {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { onPressIn, onPressOut, animatedStyle } = useAnimatedPress({ scaleTo: 0.92 });
  return (
    <Animated.View style={onPress ? animatedStyle : undefined}>
      <Pressable
        style={styles.stat}
        onPress={onPress}
        onPressIn={onPress ? onPressIn : undefined}
        onPressOut={onPress ? onPressOut : undefined}
        disabled={!onPress}
        accessibilityLabel={`${num} ${label}`}
        accessibilityRole={onPress ? "button" : "text"}
      >
        <Text style={styles.statNum}>{formatCount(num)}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

interface FollowButtonProps {
  isFollowing: boolean;
  isPending: boolean;
  onPress: () => void;
}

function FollowButton({ isFollowing, isPending, onPress }: FollowButtonProps) {
  const { t } = useTranslation();
  if (isFollowing) {
    return (
      <GradientButton
        label={t('profile.following')}
        onPress={onPress}
        variant="secondary"
        size="sm"
        icon="check"
        disabled={isPending}
        loading={isPending}
        accessibilityLabel={t('profile.unfollowUser')}
      />
    );
  }
  return (
    <GradientButton
      label={t('profile.follow')}
      onPress={onPress}
      size="sm"
      disabled={isPending}
      loading={isPending}
      accessibilityLabel={t('profile.followUser')}
    />
  );
}

export default function ProfileScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const { user: clerkUser } = useUser();
  const queryClient = useQueryClient();
  const haptic = useContextualHaptic();
  const { t, isRTL } = useTranslation();
  const PROFILE_TABS = [
    { key: 'posts', label: t('profile.posts') },
    { key: 'threads', label: t('profile.threads') },
    { key: 'reels', label: t('profile.reels') },
  ];
  const [activeTab, setActiveTab] = useState<Tab>('posts');
  const [postViewMode, setPostViewMode] = useState<'grid' | 'list'>('grid');
  const isOwnProfile = clerkUser?.username === username;
  const [showMenu, setShowMenu] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [loadingHighlightId, setLoadingHighlightId] = useState<string | null>(null);

  // Follow button pulse animation
  const followPulse = useAnimatedIcon('pulse');

  // Sticky tab bar: track the Y offset of the original tab bar
  const tabBarY = useSharedValue(0);
  const showStickyTabs = useSharedValue(0);
  const stickyTabsStyle = useAnimatedStyle(() => ({
    opacity: showStickyTabs.value,
    transform: [{ translateY: showStickyTabs.value === 1 ? 0 : -50 }],
  }));

  // Parallax scroll tracking
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
      // Show sticky tabs when scrolled past the original tab bar
      showStickyTabs.value = e.contentOffset.y >= tabBarY.value && tabBarY.value > 0 ? 1 : 0;
    },
  });

  const coverAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(scrollY.value, [-200, 0, 200], [-100, 0, -100], Extrapolation.CLAMP) },
      { scale: interpolate(scrollY.value, [-200, 0], [1.5, 1], Extrapolation.CLAMP) },
    ],
  }));

  const profileQuery = useQuery({
    queryKey: ['profile', username],
    queryFn: () => usersApi.getProfile(username),
  });
  const profile = profileQuery.data;
  const isFollowing = profile?.isFollowing ?? false;
  const isFollowedBy = (profile as Record<string, unknown> | undefined)?.isFollowedBy === true;

  const { data: mutualFollowersResponse } = useQuery({
    queryKey: ['mutual-followers', username],
    queryFn: () => usersApi.getMutualFollowers(username),
    enabled: !!username && !isOwnProfile,
  });
  const mutualFollowers = mutualFollowersResponse?.data ?? [];

  const postsQuery = useInfiniteQuery({
    queryKey: ['user-posts', username],
    queryFn: ({ pageParam }) => usersApi.getUserPosts(username, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: activeTab === 'posts',
  });
  const posts: Post[] = postsQuery.data?.pages.flatMap((p) => p.data) ?? [];

  const threadsQuery = useInfiniteQuery({
    queryKey: ['user-threads', username],
    queryFn: ({ pageParam }) => usersApi.getUserThreads(username, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: activeTab === 'threads',
  });
  const threads: Thread[] = threadsQuery.data?.pages.flatMap((p) => p.data) ?? [];

  const reelsQuery = useInfiniteQuery({
    queryKey: ['user-reels', username],
    queryFn: ({ pageParam }) => reelsApi.getUserReels(username, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: activeTab === 'reels',
  });
  const reels: Reel[] = reelsQuery.data?.pages.flatMap((p) => p.data) ?? [];

  const likedPostsQuery = useInfiniteQuery({
    queryKey: ['liked-posts', username],
    queryFn: ({ pageParam }) => usersApi.getLikedPosts(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta?.hasMore ? lastPage.meta.cursor : undefined,
    enabled: isOwnProfile && activeTab === 'liked',
  });
  const likedPosts: Post[] = likedPostsQuery.data?.pages.flatMap((p) => p.data) ?? [];

  const pinnedThreadsQuery = useQuery({
    queryKey: ['pinned-threads', username],
    queryFn: async () => {
      const response = await usersApi.getUserThreads(username);
      return response.data.filter((thread) => thread.isPinned);
    },
    enabled: !!username && !!profile,
  });
  const pinnedThreads: Thread[] = pinnedThreadsQuery.data ?? [];

  const highlightsQuery = useQuery({
    queryKey: ['highlights', profile?.id],
    queryFn: () => storiesApi.getHighlights(profile?.id ?? ''),
    enabled: !!profile,
  });
  const highlights: StoryHighlightAlbum[] = (highlightsQuery.data as StoryHighlightAlbum[]) ?? [];

  const followMutation = useMutation({
    mutationFn: () => {
      if (!profile) return Promise.reject(new Error('Profile not loaded'));
      return isFollowing ? followsApi.unfollow(profile.id) : followsApi.follow(profile.id);
    },
    onMutate: async () => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['profile', username] });
      const previousProfile = queryClient.getQueryData(['profile', username]);
      // Optimistically update follower count and follow state
      queryClient.setQueryData(['profile', username], (old: typeof profile) => {
        if (!old) return old;
        return {
          ...old,
          isFollowing: !isFollowing,
          followersCount: (old.followersCount ?? 0) + (isFollowing ? -1 : 1),
        };
      });
      return { previousProfile };
    },
    onSuccess: () => {
      if (!isFollowing) followPulse.trigger();
    },
    onError: (_err, _vars, context) => {
      // Roll back to previous profile data on error
      if (context?.previousProfile) {
        queryClient.setQueryData(['profile', username], context.previousProfile);
      }
    },
    onSettled: () => {
      // Always refetch to ensure server state is in sync
      queryClient.invalidateQueries({ queryKey: ['profile', username] });
    },
  });

  const handleFollowPress = useCallback(() => {
    if (isFollowing) {
      Alert.alert(
        t('profile.unfollowTitle'),
        t('profile.unfollowMessage', { username: profile?.username ?? username }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('profile.unfollow'), style: 'destructive', onPress: () => followMutation.mutate() },
        ]
      );
    } else {
      followMutation.mutate();
    }
  }, [isFollowing, profile?.username, username, t, followMutation]);

  const blockMutation = useMutation({
    mutationFn: () => {
      if (!profile) return Promise.reject(new Error('Profile not loaded'));
      return blocksApi.block(profile.id);
    },
    onSuccess: () => {
      setShowMenu(false);
      showToast({ message: t('profile.blockedMessage', { username }), variant: 'success' });
      router.back();
    },
  });

  const muteMutation = useMutation({
    mutationFn: () => {
      if (!profile) return Promise.reject(new Error('Profile not loaded'));
      return mutesApi.mute(profile.id);
    },
    onSuccess: () => {
      setShowMenu(false);
      showToast({ message: t('profile.mutedMessage', { username }), variant: 'success' });
    },
  });

  const handleBlock = () => {
    haptic.delete();
    setShowMenu(false);
    Alert.alert(t('profile.blockConfirmTitle'), t('profile.blockConfirmMessage', { username }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.block'), style: 'destructive', onPress: () => blockMutation.mutate() },
    ]);
  };

  const handleReport = () => {
    haptic.delete();
    setShowMenu(false);
    const sendReport = (reason: string) => {
      if (!profile) return;
      usersApi.report(profile.id, reason)
        .then(() => showToast({ message: t('profile.reportSentMessage'), variant: 'success' }))
        .catch(() => showToast({ message: t('common.somethingWentWrong'), variant: 'error' }));
    };
    Alert.alert(t('profile.reportAccountTitle'), t('profile.reportAccountMessage'), [
      { text: t('profile.reportSpam'), onPress: () => sendReport('spam') },
      { text: t('profile.reportImpersonation'), onPress: () => sendReport('impersonation') },
      { text: t('profile.reportInappropriate'), onPress: () => sendReport('inappropriate') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const handleHighlightPress = useCallback(async (albumId: string) => {
    if (loadingHighlightId || !profile) return;
    setLoadingHighlightId(albumId);
    try {
      const album = await storiesApi.getHighlightById(albumId);
      if (!album.stories || album.stories.length === 0) return;
      const group = {
        userId: profile.id,
        username: profile.username,
        avatarUrl: profile.avatarUrl ?? null,
        stories: album.stories?.map((s) => ({
          id: s.id,
          mediaUrl: s.mediaUrl,
          mediaType: s.mediaType,
          createdAt: '',
        })) ?? [],
      };
      useStore.getState().setStoryViewerData({ groups: [group], startIndex: 0 });
      router.push('/(screens)/story-viewer');
    } catch {
      // silently ignore — album might be empty
    } finally {
      setLoadingHighlightId(null);
    }
  }, [loadingHighlightId, profile, router]);

  const handleShareProfile = () => {
    haptic.send();
    const profileUrl = `https://mizanly.app/@${username}`;
    Share.share({
      message: t('profile.shareMessage', { username }),
      url: profileUrl,
    });
  };

  const handleEndReached = useCallback(() => {
    if (activeTab === 'posts' && postsQuery.hasNextPage && !postsQuery.isFetchingNextPage) {
      postsQuery.fetchNextPage();
    }
    if (activeTab === 'threads' && threadsQuery.hasNextPage && !threadsQuery.isFetchingNextPage) {
      threadsQuery.fetchNextPage();
    }
    if (activeTab === 'reels' && reelsQuery.hasNextPage && !reelsQuery.isFetchingNextPage) {
      reelsQuery.fetchNextPage();
    }
    if (activeTab === 'liked' && likedPostsQuery.hasNextPage && !likedPostsQuery.isFetchingNextPage) {
      likedPostsQuery.fetchNextPage();
    }
  }, [activeTab, postsQuery, threadsQuery, reelsQuery, likedPostsQuery]);

  if (profileQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel={t('common.back')} accessibilityRole="button">
            <Icon name={rtlArrow(isRTL, 'back')} size="md" color={tc.text.primary} />
          </Pressable>
        </View>
        <Skeleton.ProfileHeader />
      </SafeAreaView>
    );
  }

  if (profileQuery.isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel={t('common.back')} accessibilityRole="button">
            <Icon name={rtlArrow(isRTL, 'back')} size="md" color={tc.text.primary} />
          </Pressable>
        </View>
        <EmptyState
          icon="slash"
          title={t('common.error')}
          subtitle={t('common.errorSubtitle')}
          actionLabel={t('common.back')}
          onAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  // TODO: Handle old username redirects when UsernameHistory model is added.
  // When a username is not found, check if there's a previous username that matches
  // and redirect to the user's current profile.
  if (!profile) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel={t('common.back')} accessibilityRole="button">
            <Icon name={rtlArrow(isRTL, 'back')} size="md" color={tc.text.primary} />
          </Pressable>
        </View>
        <EmptyState icon="user" title={t('profile.userNotFound')} />
      </SafeAreaView>
    );
  }

  const ListHeader = (
    <View>
      {/* Cover image with parallax */}
      <Animated.View style={[{ overflow: 'hidden' }, coverAnimStyle]}>
        {profile.coverUrl ? (
          <View>
            <ProgressiveImage uri={profile.coverUrl} width="100%" height={COVER_HEIGHT} contentFit="cover" accessibilityLabel="Cover image" />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.6)']}
              locations={[0.4, 1]}
              style={StyleSheet.absoluteFill}
            />
          </View>
        ) : (
          <LinearGradient
            colors={[colors.emeraldDark, tc.bgCard, tc.bg]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cover}
          />
        )}
      </Animated.View>

      {/* Avatar row with emerald ring */}
      <View style={[styles.avatarRow, { flexDirection: rtlFlexRow(isRTL) }]}>
        <View style={styles.avatarRing}>
          <Avatar uri={profile.avatarUrl} name={profile.displayName} size="2xl" />
        </View>
        {isOwnProfile ? (
          <View style={{ flexDirection: rtlFlexRow(isRTL) }}>
            <Pressable
              style={styles.editBtn}
              onPress={() => { haptic.navigate(); router.push('/(screens)/edit-profile'); }}
              accessibilityLabel={t('profile.editProfile')}
              accessibilityRole="button"
            >
              <Text style={styles.editBtnText}>{t('profile.editProfile')}</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/(screens)/archive')}
              style={{
                backgroundColor: tc.bgElevated, borderRadius: radius.md,
                paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
                ...rtlMargin(isRTL, spacing.sm, 0),
              }}
              accessibilityLabel={t('profile.archive')}
              accessibilityRole="button"
            >
              <Icon name="clock" size="sm" color={tc.text.primary} />
            </Pressable>
            <Pressable
              onPress={() => { haptic.navigate(); router.push('/(screens)/flipside' as never); }}
              style={{
                backgroundColor: tc.bgElevated, borderRadius: radius.md,
                paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
                ...rtlMargin(isRTL, spacing.sm, 0),
              }}
              accessibilityLabel={t('flipside.title')}
              accessibilityRole="button"
            >
              <Icon name="user" size="sm" color={colors.gold} />
            </Pressable>
          </View>
        ) : (
          <View style={[styles.actionBtns, { flexDirection: rtlFlexRow(isRTL) }]}>
            <View style={{ alignItems: 'center', gap: 4 }}>
              <Animated.View style={followPulse.animatedStyle}>
                <FollowButton
                  isFollowing={isFollowing}
                  isPending={followMutation.isPending}
                  onPress={() => { haptic.follow(); handleFollowPress(); }}
                />
              </Animated.View>
              {isFollowedBy && (
                <Text style={{ color: tc.text.secondary, fontSize: fontSize.xs, fontFamily: fonts.bodyMedium }}>
                  {t('profile.followsYou', 'Follows you')}
                </Text>
              )}
            </View>
            <Pressable
              style={styles.msgBtn}
              onPress={async () => {
                haptic.navigate();
                try {
                  const { messagesApi } = await import('@/services/api');
                  const convo = await messagesApi.createDM(profile.id);
                  router.push(`/(screens)/conversation/${convo.id}`);
                } catch {
                  router.push('/(screens)/new-conversation');
                }
              }}
              accessibilityLabel={t('profile.sendMessage')}
              accessibilityRole="button"
            >
              <Icon name="mail" size="xs" color={tc.text.primary} />
            </Pressable>
          </View>
        )}
      </View>

      {/* Name + handle */}
      <View style={styles.nameSection}>
        <View style={[styles.nameRow, { flexDirection: rtlFlexRow(isRTL) }]}>
          <Text style={[styles.displayName, { textAlign: rtlTextAlign(isRTL) }]}>{profile.displayName}</Text>
          {profile.isVerified && <VerifiedBadge size={18} />}
        </View>
        <Text style={[styles.handle, { textAlign: rtlTextAlign(isRTL) }]}>@{profile.username}</Text>
        {!isOwnProfile && (profile as unknown as Record<string, unknown>).lastActiveAt ? (
          <Text style={{ color: tc.text.tertiary, fontSize: fontSize.xs, marginTop: 2 }}>
            {(t as (k: string, d?: string) => string)('profile.lastSeen', 'Last seen')} {formatDistanceToNowStrict(new Date((profile as unknown as Record<string, unknown>).lastActiveAt as string), { addSuffix: true, locale: getDateFnsLocale() })}
          </Text>
        ) : null}
        {profile.bio ? <RichText text={profile.bio} style={styles.bio} /> : null}
        {profile.website ? (
          <Pressable
            style={[styles.websiteRow, { flexDirection: rtlFlexRow(isRTL) }]}
            onPress={() => {
              const url = (profile.website ?? '').startsWith('http') ? profile.website ?? '' : `https://${profile.website ?? ''}`;
              Linking.openURL(url).catch(() => showToast({ message: t('common.couldNotOpenLink'), variant: 'error' }));
            }}
            accessibilityLabel={`Visit website: ${profile.website}`}
            accessibilityRole="link"
          >
            <Icon name="link" size={13} color={colors.emerald} />
            <Text style={styles.websiteLink}>{profile.website}</Text>
          </Pressable>
        ) : null}
        {/* Finding #288: Member since year */}
        {(profile as unknown as Record<string, unknown>).createdAt ? (
          <Text style={{ color: tc.text.tertiary, fontSize: fontSize.xs, marginTop: 4 }}>
            <Icon name="clock" size={11} color={tc.text.tertiary} /> {(t as (k: string, d?: string) => string)('profile.memberSince', 'Member since')} {new Date((profile as unknown as Record<string, unknown>).createdAt as string).getFullYear()}
          </Text>
        ) : null}
        {profile.channel && (
          <Pressable
            style={[styles.channelRow, { flexDirection: rtlFlexRow(isRTL) }]}
            onPress={() => profile.channel && router.push(`/(screens)/channel/${profile.channel.handle}`)}
            accessibilityLabel={t('profile.viewChannelAccessibility')}
            accessibilityRole="link"
          >
            <Icon name="video" size={13} color={colors.emerald} />
            <Text style={styles.channelText}>{t('profile.viewChannel')}</Text>
          </Pressable>
        )}
        {profile.profileLinks && profile.profileLinks.length > 0 && (
          <View style={styles.profileLinksSection}>
            {profile.profileLinks.map((link: { id: string; title: string; url: string }) => (
              <Pressable
                key={link.id}
                style={[styles.profileLinkRow, { flexDirection: rtlFlexRow(isRTL) }]}
                onPress={() => {
                  const url = link.url.startsWith('http') ? link.url : `https://${link.url}`;
                  Linking.openURL(url).catch(() => showToast({ message: t('common.couldNotOpenLink'), variant: 'error' }));
                }}
                accessibilityLabel={t('profile.openLink', { title: link.title })}
                accessibilityRole="link"
              >
                <Icon name="link" size={13} color={colors.emerald} />
                <Text style={styles.profileLinkTitle}>{link.title}</Text>
                <Text style={styles.profileLinkUrl} numberOfLines={1}>
                  {link.url.replace(/^https?:\/\//, '').replace(/^www\./, '')}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Story highlights */}
      {highlights.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.highlightsRow}
          contentContainerStyle={{ paddingHorizontal: spacing.base, gap: spacing.md }}
        >
          {highlights.map((album) => (
            <Pressable
              key={album.id}
              style={styles.highlightItem}
              onPress={() => handleHighlightPress(album.id)}
              disabled={loadingHighlightId !== null}
              accessibilityLabel={t('profile.viewHighlight', { title: album.title })}
              accessibilityRole="button"
            >
              <View style={styles.highlightRing}>
                <View style={[styles.highlightCircle, loadingHighlightId === album.id && { opacity: 0.5 }]}>
                  {album.coverUrl ? (
                    <ProgressiveImage uri={album.coverUrl} width={64} height={64} borderRadius={9999} contentFit="cover" accessibilityLabel="Highlight cover" />
                  ) : (
                    <Icon name="image" size="md" color={tc.text.tertiary} />
                  )}
                </View>
              </View>
              <Text style={styles.highlightLabel} numberOfLines={1}>{album.title}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Stats card */}
      <View style={[styles.statsCard, { flexDirection: rtlFlexRow(isRTL) }]}>
        <StatItem
          num={profile.followersCount ?? 0}
          label={t('profile.followers')}
          onPress={() => navigate(`/(screens)/followers/${profile.id}`)}
        />
        <View style={styles.statDivider} />
        <StatItem
          num={profile.followingCount ?? 0}
          label={t('profile.following')}
          onPress={() => navigate(`/(screens)/following/${profile.id}`)}
        />
        <View style={styles.statDivider} />
        <StatItem num={profile.postsCount ?? 0} label={t('profile.posts')} />
      </View>

      {/* Mutual followers */}
      {!isOwnProfile && mutualFollowers && mutualFollowers.length > 0 && (
        <Pressable
          onPress={() => navigate(`/(screens)/mutual-followers?username=${username}`)}
          style={{
            flexDirection: rtlFlexRow(isRTL), alignItems: 'center',
            paddingHorizontal: spacing.base, marginTop: spacing.sm,
          }}
          accessibilityLabel={t('profile.viewMutualFollowersAccessibility')}
          accessibilityRole="link"
        >
          {/* Stacked avatars (up to 3) */}
          <View style={{ flexDirection: rtlFlexRow(isRTL) }}>
            {mutualFollowers.slice(0, 3).map((u: User, i: number) => (
              <View key={u.id} style={{ ...rtlMargin(isRTL, i > 0 ? -10 : 0, 0), zIndex: 3 - i }}>
                <Avatar uri={u.avatarUrl} name={u.displayName} size="xs" />
              </View>
            ))}
          </View>
          <Text style={{ color: tc.text.secondary, fontSize: fontSize.xs, ...rtlMargin(isRTL, spacing.sm, 0), flex: 1, textAlign: rtlTextAlign(isRTL) }}>
            {mutualFollowers.length === 1
              ? t('profile.followedByOne', { displayName: mutualFollowers[0]?.displayName })
              : t('profile.followedByMany', {
                  displayName: mutualFollowers[0]?.displayName,
                  otherCount: mutualFollowers.length - 1,
                })}
          </Text>
        </Pressable>
      )}

      {/* Pinned threads */}
      {pinnedThreads.length > 0 && (
        <View style={styles.pinnedSection}>
          <Text style={styles.sectionTitle}>{t('profile.pinned')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pinnedScroll}>
            {pinnedThreads.slice(0, 3).map((thread) => (
              <Pressable
                key={thread.id}
                style={styles.pinnedItem}
                onPress={() => navigate(`/(screens)/thread/${thread.id}`)}
                accessibilityLabel={t('profile.viewPinnedThread')}
                accessibilityRole="button"
              >
                <View style={styles.pinnedContent}>
                  {thread.mediaUrls.length > 0 ? (
                    <ProgressiveImage
                      uri={thread.mediaUrls[0]}
                      width={140}
                      height={180}
                    />
                  ) : (
                    <View style={styles.pinnedText}>
                      <Text style={styles.pinnedTextContent} numberOfLines={3}>
                        {thread.content}
                      </Text>
                    </View>
                  )}
                  <View style={styles.pinBadge}>
                    <Icon name="bookmark" size={12} color="#fff" />
                  </View>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Tabs */}
      <View
        onLayout={(e) => { tabBarY.value = e.nativeEvent.layout.y; }}
        style={[styles.tabBarBg, { backgroundColor: tc.bg }]}
      >
        <View style={styles.tabBarRow}>
          <View style={{ flex: 1 }}>
            <TabSelector
              tabs={isOwnProfile ? [
                ...PROFILE_TABS,
                { key: 'liked', label: t('profile.liked') },
              ] : PROFILE_TABS}
              activeKey={activeTab}
              onTabChange={(key) => { haptic.tick(); setActiveTab(key as Tab); }}
            />
          </View>
          {(activeTab === 'posts' || activeTab === 'liked') && (
            <Pressable
              onPress={() => {
                haptic.tick();
                setPostViewMode((prev) => prev === 'grid' ? 'list' : 'grid');
              }}
              style={styles.viewToggleBtn}
              accessibilityLabel={postViewMode === 'grid' ? t('profile.listView') : t('profile.gridView')}
              accessibilityRole="button"
            >
              <Icon
                name={postViewMode === 'grid' ? 'layout' : 'layers'}
                size="sm"
                color={tc.text.secondary}
              />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );

  const renderHeaderActions = () => (
    <View style={[styles.header, { flexDirection: rtlFlexRow(isRTL) }]}>
      <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn} accessibilityLabel={t('common.back')} accessibilityRole="button">
        <Icon name={rtlArrow(isRTL, 'back')} size="md" color={tc.text.primary} />
      </Pressable>
      <Text style={styles.headerUsername}>@{username}</Text>
      <View style={[styles.headerActions, { flexDirection: rtlFlexRow(isRTL) }]}>
        <Pressable hitSlop={8} onPress={() => setShowShareSheet(true)} accessibilityLabel={t('profile.shareProfile')} accessibilityRole="button">
          <Icon name="share" size="sm" color={tc.text.primary} />
        </Pressable>
        {isOwnProfile ? (
          <>
            <Pressable hitSlop={8} onPress={() => navigate('/(screens)/saved')} accessibilityLabel={t('profile.savedPosts')} accessibilityRole="link">
              <Icon name="bookmark" size="sm" color={tc.text.primary} />
            </Pressable>
            <Pressable hitSlop={8} onPress={() => navigate('/(screens)/archive')} accessibilityLabel={t('profile.archive')} accessibilityRole="link">
              <Icon name="clock" size="sm" color={tc.text.primary} />
            </Pressable>

            <Pressable hitSlop={8} onPress={() => navigate('/(screens)/settings')} accessibilityLabel={t('common.settings')} accessibilityRole="link">
              <Icon name="settings" size="sm" color={tc.text.primary} />
            </Pressable>
          </>
        ) : (
          <Pressable hitSlop={8} onPress={() => { haptic.longPress(); setShowMenu(true); }} accessibilityLabel={t('profile.options')} accessibilityRole="button">
            <Icon name="more-horizontal" size="sm" color={tc.text.secondary} />
          </Pressable>
        )}
      </View>
    </View>
  );

  const renderItem = ({ item }: { item: Post | Thread | Reel }) => {
    if (activeTab === 'threads') {
      const thread = item as Thread;
      return (
        <Pressable
          style={styles.threadRow}
          onPress={() => navigate(`/(screens)/thread/${thread.id}`)}
          accessibilityLabel={`View thread by ${thread.user?.username}`}
          accessibilityRole="button"
        >
          <Text style={[styles.threadContent, { textAlign: rtlTextAlign(isRTL) }]} numberOfLines={3}>{thread.content}</Text>
          <View style={[styles.threadMeta, { flexDirection: rtlFlexRow(isRTL) }]}>
            <View style={[styles.threadMetaItem, { flexDirection: rtlFlexRow(isRTL) }]}>
              <Icon name="heart" size={12} color={tc.text.tertiary} />
              <Text style={styles.threadMetaText}>{thread.likesCount}</Text>
            </View>
            <View style={[styles.threadMetaItem, { flexDirection: rtlFlexRow(isRTL) }]}>
              <Icon name="message-circle" size={12} color={tc.text.tertiary} />
              <Text style={styles.threadMetaText}>{thread.repliesCount}</Text>
            </View>
          </View>
        </Pressable>
      );
    }

    if (activeTab === 'reels') {
      const reel = item as Reel;
      return (
        <ReelGridItem
          reel={reel}
          onPress={() => navigate(`/(screens)/reel/${reel.id}`)}
        />
      );
    }

    // Posts/liked: list view shows full PostCard, grid view shows GridItem
    if (postViewMode === 'list') {
      return (
        <PostCard
          post={item as Post}
          viewerId={clerkUser?.id}
          isOwn={isOwnProfile}
        />
      );
    }

    return (
      <GridItem
        post={item as Post}
        onPress={() => navigate(`/(screens)/post/${item.id}`)}
      />
    );
  };

  const currentData = activeTab === 'posts' ? posts
    : activeTab === 'threads' ? threads
    : activeTab === 'reels' ? reels
    : likedPosts;

  const currentQuery = activeTab === 'posts' ? postsQuery
    : activeTab === 'threads' ? threadsQuery
    : activeTab === 'reels' ? reelsQuery
    : likedPostsQuery;

  return (
    <ScreenErrorBoundary>
    <SafeAreaView style={styles.container} edges={['top']}>
      {renderHeaderActions()}

      {/* Sticky tab bar — appears when original tabs scroll out of view */}
      <Animated.View pointerEvents="box-none" style={[styles.stickyTabBar, { backgroundColor: tc.bg, borderBottomColor: tc.border }, stickyTabsStyle]}>
        <TabSelector
          tabs={isOwnProfile ? [
            ...PROFILE_TABS,
            { key: 'liked', label: t('profile.liked') },
          ] : PROFILE_TABS}
          activeKey={activeTab}
          onTabChange={(key) => { haptic.tick(); setActiveTab(key as Tab); }}
        />
      </Animated.View>

      <Animated.FlatList
        key={activeTab === 'threads' ? 'list' : (activeTab === 'posts' || activeTab === 'liked') && postViewMode === 'list' ? `${activeTab}-list` : 'grid'}
        removeClippedSubviews={true}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        data={currentData}
        keyExtractor={(item: { id: string }) => item.id}
        numColumns={activeTab === 'threads' || ((activeTab === 'posts' || activeTab === 'liked') && postViewMode === 'list') ? 1 : 3}
        columnWrapperStyle={activeTab === 'threads' || ((activeTab === 'posts' || activeTab === 'liked') && postViewMode === 'list') ? undefined : styles.gridRow}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={ListHeader}
        renderItem={renderItem}
        ListEmptyComponent={() =>
          currentQuery.isLoading ? (
            activeTab === 'threads' ? (
              <View>
                <Skeleton.ThreadCard />
                <Skeleton.ThreadCard />
              </View>
            ) : (
              <View style={styles.skeletonGrid}>
                {Array.from({ length: 9 }).map((_, i) => (
                  <Skeleton.Rect key={i} width={GRID_ITEM} height={GRID_ITEM} borderRadius={0} />
                ))}
              </View>
            )
          ) : (
            <EmptyState
              icon={activeTab === 'posts' ? "image" : activeTab === 'threads' ? "message-circle" : activeTab === 'reels' ? "video" : "heart"}
              title={activeTab === 'liked' ? t('profile.noLikedPosts') : t('profile.noContent')}
            />
          )
        }
        ListFooterComponent={() =>
          currentQuery.isFetchingNextPage ? (
            activeTab === 'threads' ? <Skeleton.ThreadCard /> : <Skeleton.Rect width="100%" height={GRID_ITEM} />
          ) : null
        }
        refreshControl={
          <BrandedRefreshControl
            refreshing={currentQuery.isRefetching}
            onRefresh={() => {
              profileQuery.refetch();
              currentQuery.refetch();
            }}
          />
        }
        contentContainerStyle={activeTab === 'threads' ? { paddingBottom: 100 } : styles.gridContainer}
      />

      {/* Bottom Sheets */}
      <BottomSheet visible={showMenu} onClose={() => setShowMenu(false)}>
        <BottomSheetItem
          label={t('monetization.sendTip')}
          icon={<Icon name="heart" size="sm" color={colors.gold} />}
          onPress={() => { setShowMenu(false); navigate(`/(screens)/send-tip?userId=${profile?.id}`); }}
        />
        <BottomSheetItem
          label={t('profile.muteUser', { username })}
          icon={<Icon name="volume-x" size="sm" color={tc.text.primary} />}
          onPress={() => muteMutation.mutate()}
        />
        <BottomSheetItem
          label={t('profile.blockUser', { username })}
          icon={<Icon name="lock" size="sm" color={colors.error} />}
          onPress={handleBlock}
          destructive
        />
        <BottomSheetItem
          label={t('common.report')}
          icon={<Icon name="flag" size="sm" color={colors.error} />}
          onPress={handleReport}
          destructive
        />
      </BottomSheet>

      <BottomSheet visible={showShareSheet} onClose={() => setShowShareSheet(false)}>
        <BottomSheetItem
          label={t('profile.shareProfile')}
          icon={<Icon name="share" size="sm" color={tc.text.primary} />}
          onPress={() => {
            setShowShareSheet(false);
            handleShareProfile();
          }}
        />
        <BottomSheetItem
          label={t('profile.qrCode')}
          icon={<Icon name="hash" size="sm" color={tc.text.primary} />}
          onPress={() => {
            setShowShareSheet(false);
            navigate(`/(screens)/qr-code?username=${username}`);
          }}
        />
      </BottomSheet>
    </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
  },
  backBtn: { width: 40 },
  headerUsername: { color: tc.text.primary, fontSize: fontSize.base, fontFamily: fonts.bodyBold },
  headerActions: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  cover: { width: '100%', height: COVER_HEIGHT },
  coverPlaceholder: { width: '100%', height: COVER_HEIGHT, backgroundColor: tc.bgElevated },
  avatarRing: {
    borderWidth: 2.5,
    borderColor: colors.emerald,
    borderRadius: radius.full,
    padding: 2,
    shadowColor: tc.bg,
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  avatarRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingHorizontal: spacing.base, marginTop: -40,
  },
  editBtn: {
    backgroundColor: tc.bgElevated, borderRadius: radius.md,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
  },
  editBtnText: { color: tc.text.primary, fontSize: fontSize.sm, fontFamily: fonts.bodySemiBold },
  actionBtns: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  msgBtn: {
    width: 36, height: 36, borderRadius: radius.md,
    backgroundColor: tc.bgElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  nameSection: { paddingHorizontal: spacing.base, marginTop: spacing.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  displayName: { color: tc.text.primary, fontSize: fontSize.lg, lineHeight: lineHeight.lg, letterSpacing: letterSpacing.snug, fontFamily: fonts.bodyBold },
  handle: { color: tc.text.tertiary, fontSize: fontSize.sm, lineHeight: lineHeight.sm, marginTop: 2 },
  bio: { marginTop: spacing.sm, color: tc.text.primary, fontSize: fontSize.base, lineHeight: lineHeight.base },
  websiteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  websiteLink: { color: colors.emerald, fontSize: fontSize.sm, fontFamily: fonts.bodyMedium },
  channelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  channelText: { color: colors.emerald, fontSize: fontSize.sm, fontFamily: fonts.bodyMedium },
  profileLinksSection: { marginTop: spacing.sm, gap: spacing.xs },
  profileLinkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  profileLinkTitle: { color: tc.text.primary, fontSize: fontSize.sm, fontFamily: fonts.bodyMedium },
  profileLinkUrl: { color: tc.text.tertiary, fontSize: fontSize.xs },
  highlightsRow: { marginTop: spacing.lg },
  highlightItem: { alignItems: 'center', width: 72 },
  highlightCircle: {
    width: 64, height: 64, borderRadius: radius.full,
    borderWidth: 1, borderColor: tc.border,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: tc.bgElevated,
    overflow: 'hidden',
  },
  highlightImg: { width: '100%', height: '100%' },
  highlightLabel: { color: tc.text.primary, fontSize: fontSize.xs, marginTop: 4, width: '100%', textAlign: 'center' },
  highlightRing: {
    borderWidth: 2,
    borderColor: colors.emerald,
    borderRadius: radius.full,
    padding: 2,
  },
  stats: {
    flexDirection: 'row', paddingHorizontal: spacing.base,
    marginTop: spacing.xl, gap: spacing.xl,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: tc.bgCard,
    borderRadius: radius.lg,
    marginHorizontal: spacing.base,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    gap: spacing.xl,
    borderWidth: 0.5,
    borderColor: tc.border,
    justifyContent: 'center',
  },
  stat: { gap: 2 },
  statNum: { color: tc.text.primary, fontSize: fontSize.base, lineHeight: lineHeight.base, fontFamily: fonts.bodyBold },
  statLabel: { color: tc.text.tertiary, fontSize: fontSize.xs, lineHeight: lineHeight.xs },
  statDivider: { width: 1, height: 24, backgroundColor: tc.border, alignSelf: 'center' },
  pinnedSection: { marginTop: spacing.xl },
  sectionTitle: {
    color: tc.text.primary, fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontFamily: fonts.bodyBold, paddingHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  pinnedScroll: { paddingLeft: spacing.base },
  pinnedItem: {
    width: 140, height: 180, borderRadius: radius.md,
    backgroundColor: tc.bgElevated, marginRight: spacing.sm,
    overflow: 'hidden',
  },
  pinnedContent: { flex: 1 },
  pinnedImage: { width: '100%', height: '100%' },
  pinnedText: { flex: 1, padding: spacing.sm },
  pinnedTextContent: { color: tc.text.primary, fontSize: fontSize.xs },
  pinBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: radius.full,
    padding: 4,
  },
  tabBarBg: { },
  tabBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewToggleBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  stickyTabBar: {
    position: 'absolute',
    top: 44,
    left: 0,
    right: 0,
    zIndex: 10,
    borderBottomWidth: 0.5,
  },
  gridContainer: { paddingBottom: 100 },
  gridRow: { gap: 2 },
  gridItem: { width: GRID_ITEM, height: GRID_ITEM, marginBottom: 2 },
  gridImage: { width: '100%', height: '100%' },
  gridTextPost: {
    flex: 1, backgroundColor: tc.bgElevated,
    padding: spacing.sm, alignItems: 'center', justifyContent: 'center',
  },
  gridTextContent: { color: tc.text.primary, fontSize: fontSizeExt.tiny, textAlign: 'center' },
  carouselBadge: { position: 'absolute', top: 8, right: 8 },
  reelOverlay: {
    position: 'absolute', bottom: 8, left: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  reelDuration: { color: '#fff', fontSize: fontSizeExt.tiny, fontFamily: fonts.bodySemiBold },
  reelStats: {
    position: 'absolute', bottom: 8, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  reelStatText: { color: '#fff', fontSize: fontSizeExt.tiny, fontFamily: fonts.bodySemiBold },
  threadRow: {
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: tc.border,
  },
  threadContent: { color: tc.text.primary, fontSize: fontSize.sm, lineHeight: 20 },
  threadMeta: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  threadMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  threadMetaText: { color: tc.text.tertiary, fontSize: fontSize.xs },
  skeletonGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 2,
    paddingHorizontal: 0,
  },
});
