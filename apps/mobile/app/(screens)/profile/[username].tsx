import { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, RefreshControl, ScrollView, Dimensions, Pressable, Alert, Linking, Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
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
import { useHaptic } from '@/hooks/useHaptic';
import { useAnimatedPress } from '@/hooks/useAnimatedPress';
import { colors, spacing, fontSize, radius, animation } from '@/theme';
import { usersApi, followsApi, postsApi, threadsApi, storiesApi, blocksApi, mutesApi, reelsApi } from '@/services/api';
import type { Post, Thread, StoryHighlightAlbum, Reel, User } from '@/types';

const SCREEN_W = Dimensions.get('window').width;
const GRID_ITEM = (SCREEN_W - 4) / 3;
const COVER_HEIGHT = 160;

type Tab = 'posts' | 'threads' | 'reels' | 'liked';

const PROFILE_TABS = [
  { key: 'posts', label: 'Posts' },
  { key: 'threads', label: 'Threads' },
  { key: 'reels', label: 'Reels' },
];

function GridItem({ post, onPress }: { post: Post; onPress: () => void }) {
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
          <Image
            source={{ uri: post.thumbnailUrl ?? post.mediaUrls[0] }}
            style={styles.gridImage}
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
}

function StatItem({ num, label, onPress }: { num: number; label: string; onPress?: () => void }) {
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
        <Text style={styles.statNum}>{num}</Text>
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
  if (isFollowing) {
    return (
      <GradientButton
        label="Following"
        onPress={onPress}
        variant="secondary"
        size="sm"
        icon="check"
        disabled={isPending}
        loading={isPending}
        accessibilityLabel="Unfollow user"
      />
    );
  }
  return (
    <GradientButton
      label="Follow"
      onPress={onPress}
      size="sm"
      disabled={isPending}
      loading={isPending}
      accessibilityLabel="Follow user"
    />
  );
}

export default function ProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const { user: clerkUser } = useUser();
  const queryClient = useQueryClient();
  const haptic = useHaptic();
  const [activeTab, setActiveTab] = useState<Tab>('posts');
  const isOwnProfile = clerkUser?.username === username;
  const [showMenu, setShowMenu] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [loadingHighlightId, setLoadingHighlightId] = useState<string | null>(null);

  // Parallax scroll tracking
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => { scrollY.value = e.contentOffset.y; },
  });

  const coverAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(scrollY.value, [-100, 0, 200], [50, 0, -100], Extrapolation.CLAMP) },
      { scale: interpolate(scrollY.value, [-100, 0], [1.15, 1], Extrapolation.CLAMP) },
    ],
  }));

  const profileQuery = useQuery({
    queryKey: ['profile', username],
    queryFn: () => usersApi.getProfile(username),
  });
  const profile = profileQuery.data;
  const isFollowing = profile?.isFollowing ?? false;

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
    queryFn: ({ pageParam }) => postsApi.getLiked({ cursor: pageParam as string | undefined }),
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
    queryFn: () => storiesApi.getHighlights(profile!.id),
    enabled: !!profile,
  });
  const highlights: StoryHighlightAlbum[] = (highlightsQuery.data as StoryHighlightAlbum[]) ?? [];

  const followMutation = useMutation({
    mutationFn: () => isFollowing ? followsApi.unfollow(profile!.id) : followsApi.follow(profile!.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile', username] }),
  });

  const blockMutation = useMutation({
    mutationFn: () => blocksApi.block(profile!.id),
    onSuccess: () => {
      setShowMenu(false);
      Alert.alert('Blocked', `@${username} has been blocked.`);
      router.back();
    },
  });

  const muteMutation = useMutation({
    mutationFn: () => mutesApi.mute(profile!.id),
    onSuccess: () => {
      setShowMenu(false);
      Alert.alert('Muted', `@${username} has been muted.`);
    },
  });

  const handleBlock = () => {
    setShowMenu(false);
    Alert.alert('Block user?', `Posts from @${username} will not appear in your feed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => blockMutation.mutate() },
    ]);
  };

  const handleReport = () => {
    setShowMenu(false);
    const sendReport = (reason: string) => {
      usersApi.report(profile!.id, reason).catch(() => {});
      Alert.alert('Report sent', 'Thank you for your report.');
    };
    Alert.alert('Report account', 'Why are you reporting this account?', [
      { text: 'Spam', onPress: () => sendReport('spam') },
      { text: 'Impersonation', onPress: () => sendReport('impersonation') },
      { text: 'Inappropriate', onPress: () => sendReport('inappropriate') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleHighlightPress = useCallback(async (albumId: string) => {
    if (loadingHighlightId || !profile) return;
    setLoadingHighlightId(albumId);
    try {
      const album = await storiesApi.getHighlightById(albumId);
      if (!album.stories || album.stories.length === 0) return;
      const group = { user: profile, stories: album.stories, hasUnread: false };
      router.push({
        pathname: '/(screens)/story-viewer',
        params: { groupJson: JSON.stringify(group), startIndex: '0' },
      });
    } catch {
      // silently ignore — album might be empty
    } finally {
      setLoadingHighlightId(null);
    }
  }, [loadingHighlightId, profile, router]);

  const handleShareProfile = () => {
    const profileUrl = `https://mizanly.app/@${username}`;
    Share.share({
      message: `Check out @${username} on Mizanly!`,
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
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Go back" accessibilityRole="button">
            <Icon name="arrow-left" size="md" color={colors.text.primary} />
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
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Go back" accessibilityRole="button">
            <Icon name="arrow-left" size="md" color={colors.text.primary} />
          </Pressable>
        </View>
        <EmptyState
          icon="slash"
          title="Something went wrong"
          subtitle="Could not load this content. Please try again."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Go back" accessibilityRole="button">
            <Icon name="arrow-left" size="md" color={colors.text.primary} />
          </Pressable>
        </View>
        <EmptyState icon="user" title="User not found" />
      </SafeAreaView>
    );
  }

  const ListHeader = (
    <View>
      {/* Cover image with parallax */}
      <Animated.View style={[{ overflow: 'hidden' }, coverAnimStyle]}>
        {profile.coverUrl ? (
          <View>
            <Image source={{ uri: profile.coverUrl }} style={styles.cover} contentFit="cover" />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.6)']}
              locations={[0.4, 1]}
              style={StyleSheet.absoluteFill}
            />
          </View>
        ) : (
          <LinearGradient
            colors={[colors.emeraldDark, colors.dark.bgCard, colors.dark.bg]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cover}
          />
        )}
      </Animated.View>

      {/* Avatar row with emerald ring */}
      <View style={styles.avatarRow}>
        <View style={styles.avatarRing}>
          <Avatar uri={profile.avatarUrl} name={profile.displayName} size="2xl" />
        {isOwnProfile ? (
          <View style={{ flexDirection: 'row' }}>
            <Pressable
              style={styles.editBtn}
              onPress={() => router.push('/(screens)/edit-profile')}
              accessibilityLabel="Edit Profile"
              accessibilityRole="button"
            >
              <Text style={styles.editBtnText}>Edit Profile</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/(screens)/archive')}
              style={{
                backgroundColor: colors.dark.bgElevated, borderRadius: radius.md,
                paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
                marginLeft: spacing.sm,
              }}
              accessibilityLabel="Archive"
              accessibilityRole="button"
            >
              <Icon name="clock" size="sm" color={colors.text.primary} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.actionBtns}>
            <FollowButton
              isFollowing={isFollowing}
              isPending={followMutation.isPending}
              onPress={() => { haptic.medium(); followMutation.mutate(); }}
            />
            <Pressable
              style={styles.msgBtn}
              onPress={async () => {
                haptic.light();
                try {
                  const { messagesApi } = await import('@/services/api');
                  const convo = await messagesApi.createDM(profile.id);
                  router.push(`/(screens)/conversation/${convo.id}`);
                } catch {
                  router.push('/(screens)/new-conversation');
                }
              }}
              accessibilityLabel="Send message"
              accessibilityRole="button"
            >
              <Icon name="mail" size="xs" color={colors.text.primary} />
            </Pressable>
          </View>
        )}
      </View>

      {/* Name + handle */}
      <View style={styles.nameSection}>
        <View style={styles.nameRow}>
          <Text style={styles.displayName}>{profile.displayName}</Text>
          {profile.isVerified && <VerifiedBadge size={18} />}
        </View>
        <Text style={styles.handle}>@{profile.username}</Text>
        {profile.bio ? <RichText text={profile.bio} style={styles.bio} /> : null}
        {profile.website ? (
          <TouchableOpacity
            style={styles.websiteRow}
            onPress={() => {
              const url = profile.website!.startsWith('http') ? profile.website! : `https://${profile.website}`;
              Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open link'));
            }}
            accessibilityLabel={`Visit website: ${profile.website}`}
            accessibilityRole="link"
          >
            <Icon name="link" size={13} color={colors.emerald} />
            <Text style={styles.websiteLink}>{profile.website}</Text>
          </TouchableOpacity>
        ) : null}
        {profile.channel && (
          <TouchableOpacity
            style={styles.channelRow}
            onPress={() => router.push(`/(screens)/channel/${profile.channel!.handle}`)}
            accessibilityLabel="View channel"
            accessibilityRole="link"
          >
            <Icon name="video" size={13} color={colors.emerald} />
            <Text style={styles.channelText}>View Channel</Text>
          </TouchableOpacity>
        )}
        {profile.profileLinks && profile.profileLinks.length > 0 && (
          <View style={styles.profileLinksSection}>
            {profile.profileLinks.map((link: any) => (
              <Pressable
                key={link.id}
                style={styles.profileLinkRow}
                onPress={() => {
                  const url = link.url.startsWith('http') ? link.url : `https://${link.url}`;
                  Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open link'));
                }}
                accessibilityLabel={`Open ${link.title}`}
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
            <TouchableOpacity
              key={album.id}
              style={styles.highlightItem}
              activeOpacity={0.75}
              onPress={() => handleHighlightPress(album.id)}
              disabled={loadingHighlightId !== null}
              accessibilityLabel={`View highlight: ${album.title}`}
              accessibilityRole="button"
            >
              <View style={styles.highlightRing}>
                <View style={[styles.highlightCircle, loadingHighlightId === album.id && { opacity: 0.5 }]}>
                  {album.coverUrl ? (
                    <Image source={{ uri: album.coverUrl }} style={styles.highlightImg} contentFit="cover" />
                  ) : (
                    <Icon name="image" size="md" color={colors.text.tertiary} />
                  )}
                </View>
              </View>
              <Text style={styles.highlightLabel} numberOfLines={1}>{album.title}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Stats card */}
      <View style={styles.statsCard}>
        <StatItem
          num={profile._count?.followers ?? 0}
          label="Followers"
          onPress={() => router.push(`/(screens)/followers/${profile.id}` as never)}
        />
        <View style={styles.statDivider} />
        <StatItem
          num={profile._count?.following ?? 0}
          label="Following"
          onPress={() => router.push(`/(screens)/following/${profile.id}` as never)}
        />
        <View style={styles.statDivider} />
        <StatItem num={profile._count?.posts ?? 0} label="Posts" />
      </View>

      {/* Mutual followers */}
      {!isOwnProfile && mutualFollowers && mutualFollowers.length > 0 && (
        <Pressable
          onPress={() => router.push(`/(screens)/mutual-followers?username=${username}` as never)}
          style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: spacing.base, marginTop: spacing.sm,
          }}
          accessibilityLabel="View mutual followers"
          accessibilityRole="link"
        >
          {/* Stacked avatars (up to 3) */}
          <View style={{ flexDirection: 'row' }}>
            {mutualFollowers.slice(0, 3).map((u: User, i: number) => (
              <View key={u.id} style={{ marginLeft: i > 0 ? -10 : 0, zIndex: 3 - i }}>
                <Avatar uri={u.avatarUrl} name={u.displayName} size="xs" />
              </View>
            ))}
          </View>
          <Text style={{ color: colors.text.secondary, fontSize: fontSize.xs, marginLeft: spacing.sm, flex: 1 }}>
            Followed by {mutualFollowers[0]?.displayName}
            {mutualFollowers.length > 1 && ` and ${mutualFollowers.length - 1} others you follow`}
          </Text>
        </Pressable>
      )}

      {/* Pinned threads */}
      {pinnedThreads.length > 0 && (
        <View style={styles.pinnedSection}>
          <Text style={styles.sectionTitle}>Pinned</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pinnedScroll}>
            {pinnedThreads.slice(0, 3).map((thread) => (
              <Pressable
                key={thread.id}
                style={styles.pinnedItem}
                onPress={() => router.push(`/(screens)/thread/${thread.id}` as never)}
                accessibilityLabel="View pinned thread"
                accessibilityRole="button"
              >
                <View style={styles.pinnedContent}>
                  {thread.mediaUrls.length > 0 ? (
                    <Image
                      source={{ uri: thread.mediaUrls[0] }}
                      style={styles.pinnedImage}
                      contentFit="cover"
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
      <TabSelector
        tabs={isOwnProfile ? [
          ...PROFILE_TABS,
          { key: 'liked', label: 'Liked' },
        ] : PROFILE_TABS}
        activeKey={activeTab}
        onTabChange={(key) => setActiveTab(key as Tab)}
      />
    </View>
  );

  const renderHeaderActions = () => (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn} accessibilityLabel="Go back" accessibilityRole="button">
        <Icon name="arrow-left" size="md" color={colors.text.primary} />
      </Pressable>
      <Text style={styles.headerUsername}>@{username}</Text>
      <View style={styles.headerActions}>
        <Pressable hitSlop={8} onPress={() => setShowShareSheet(true)} accessibilityLabel="Share profile" accessibilityRole="button">
          <Icon name="share" size="sm" color={colors.text.primary} />
        </Pressable>
        {isOwnProfile ? (
          <>
            <Pressable hitSlop={8} onPress={() => router.push('/(screens)/saved' as never)} accessibilityLabel="Saved posts" accessibilityRole="link">
              <Icon name="bookmark" size="sm" color={colors.text.primary} />
            </Pressable>
            <Pressable hitSlop={8} onPress={() => router.push('/(screens)/archive' as never)} accessibilityLabel="Archive" accessibilityRole="link">
              <Icon name="clock" size="sm" color={colors.text.primary} />
            </Pressable>

            <Pressable hitSlop={8} onPress={() => router.push('/(screens)/settings' as never)} accessibilityLabel="Settings" accessibilityRole="link">
              <Icon name="settings" size="sm" color={colors.text.primary} />
            </Pressable>
          </>
        ) : (
          <Pressable hitSlop={8} onPress={() => { haptic.light(); setShowMenu(true); }} accessibilityLabel="Profile options" accessibilityRole="button">
            <Icon name="more-horizontal" size="sm" color={colors.text.secondary} />
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
          onPress={() => router.push(`/(screens)/thread/${thread.id}` as never)}
          accessibilityLabel={`View thread by ${thread.user?.username}`}
          accessibilityRole="button"
        >
          <Text style={styles.threadContent} numberOfLines={3}>{thread.content}</Text>
          <View style={styles.threadMeta}>
            <View style={styles.threadMetaItem}>
              <Icon name="heart" size={12} color={colors.text.tertiary} />
              <Text style={styles.threadMetaText}>{thread.likesCount}</Text>
            </View>
            <View style={styles.threadMetaItem}>
              <Icon name="message-circle" size={12} color={colors.text.tertiary} />
              <Text style={styles.threadMetaText}>{thread.repliesCount}</Text>
            </View>
          </View>
        </Pressable>
      );
    }

    if (activeTab === 'reels') {
      const reel = item as Reel;
      return (
        <Pressable
          style={styles.gridItem}
          onPress={() => router.push(`/(screens)/reel/${reel.id}` as never)}
          accessibilityLabel={`View reel ${reel.id}`}
          accessibilityRole="button"
        >
          {reel.thumbnailUrl ? (
            <Image
              source={{ uri: reel.thumbnailUrl }}
              style={styles.gridImage}
              contentFit="cover"
            />
          ) : (
            <View style={styles.gridTextPost}>
              <Icon name="video" size={24} color={colors.text.secondary} />
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
      );
    }

    return (
      <GridItem
        post={item as Post}
        onPress={() => router.push(`/(screens)/post/${item.id}` as never)}
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
    <SafeAreaView style={styles.container} edges={['top']}>
      {renderHeaderActions()}
      <Animated.FlatList
        removeClippedSubviews={true}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        data={currentData}
        keyExtractor={(item) => item.id}
        numColumns={activeTab === 'threads' ? 1 : 3}
        columnWrapperStyle={activeTab === 'threads' ? undefined : styles.gridRow}
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
              title={activeTab === 'liked' ? "No liked posts yet" : "No content yet"}
            />
          )
        }
        ListFooterComponent={() =>
          currentQuery.isFetchingNextPage ? (
            activeTab === 'threads' ? <Skeleton.ThreadCard /> : <Skeleton.Rect width="100%" height={GRID_ITEM} />
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={currentQuery.isRefetching}
            onRefresh={() => {
              profileQuery.refetch();
              currentQuery.refetch();
            }}
            tintColor={colors.emerald}
          />
        }
        contentContainerStyle={activeTab === 'threads' ? { paddingBottom: 100 } : styles.gridContainer}
      />

      {/* Bottom Sheets */}
      <BottomSheet visible={showMenu} onClose={() => setShowMenu(false)}>
        <BottomSheetItem
          label={`Mute @${username}`}
          icon={<Icon name="volume-x" size="sm" color={colors.text.primary} />}
          onPress={() => muteMutation.mutate()}
        />
        <BottomSheetItem
          label={`Block @${username}`}
          icon={<Icon name="lock" size="sm" color={colors.error} />}
          onPress={handleBlock}
          destructive
        />
        <BottomSheetItem
          label="Report"
          icon={<Icon name="flag" size="sm" color={colors.error} />}
          onPress={handleReport}
          destructive
        />
      </BottomSheet>

      <BottomSheet visible={showShareSheet} onClose={() => setShowShareSheet(false)}>
        <BottomSheetItem
          label="Share Profile"
          icon={<Icon name="share" size="sm" color={colors.text.primary} />}
          onPress={() => {
            setShowShareSheet(false);
            handleShareProfile();
          }}
        />
        <BottomSheetItem
          label="QR Code"
          icon={<Icon name="hash" size="sm" color={colors.text.primary} />}
          onPress={() => {
            setShowShareSheet(false);
            router.push(`/(screens)/qr-code?username=${username}` as never);
          }}
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
  },
  backBtn: { width: 40 },
  headerUsername: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  headerActions: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  cover: { width: '100%', height: COVER_HEIGHT },
  coverPlaceholder: { width: '100%', height: COVER_HEIGHT, backgroundColor: colors.dark.bgElevated },
  avatarRing: {
    borderWidth: 2.5,
    borderColor: colors.emerald,
    borderRadius: radius.full,
    padding: 2,
    shadowColor: colors.dark.bg,
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  avatarRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingHorizontal: spacing.base, marginTop: -40,
  },
  editBtn: {
    backgroundColor: colors.dark.bgElevated, borderRadius: radius.md,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
  },
  editBtnText: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '600' },
  actionBtns: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  msgBtn: {
    width: 36, height: 36, borderRadius: radius.md,
    backgroundColor: colors.dark.bgElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  nameSection: { paddingHorizontal: spacing.base, marginTop: spacing.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  displayName: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '700' },
  handle: { color: colors.text.tertiary, fontSize: fontSize.sm, marginTop: 2 },
  bio: { marginTop: spacing.sm },
  websiteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  websiteLink: { color: colors.emerald, fontSize: fontSize.sm, fontWeight: '500' },
  channelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  channelText: { color: colors.emerald, fontSize: fontSize.sm, fontWeight: '500' },
  profileLinksSection: { marginTop: spacing.sm, gap: spacing.xs },
  profileLinkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  profileLinkTitle: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '500' },
  profileLinkUrl: { color: colors.text.tertiary, fontSize: fontSize.xs },
  highlightsRow: { marginTop: spacing.lg },
  highlightItem: { alignItems: 'center', width: 72 },
  highlightCircle: {
    width: 64, height: 64, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.dark.border,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.dark.bgElevated,
    overflow: 'hidden',
  },
  highlightImg: { width: '100%', height: '100%' },
  highlightLabel: { color: colors.text.primary, fontSize: fontSize.xs, marginTop: 4, width: '100%', textAlign: 'center' },
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
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    marginHorizontal: spacing.base,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    gap: spacing.xl,
    borderWidth: 0.5,
    borderColor: colors.dark.border,
    justifyContent: 'center',
  },
  stat: { gap: 2 },
  statNum: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '800' },
  statLabel: { color: colors.text.tertiary, fontSize: fontSize.xs },
  statDivider: { width: 1, height: 24, backgroundColor: colors.dark.border, alignSelf: 'center' },
  pinnedSection: { marginTop: spacing.xl },
  sectionTitle: {
    color: colors.text.primary, fontSize: fontSize.sm,
    fontWeight: '700', paddingHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  pinnedScroll: { paddingLeft: spacing.base },
  pinnedItem: {
    width: 140, height: 180, borderRadius: radius.md,
    backgroundColor: colors.dark.bgElevated, marginRight: spacing.sm,
    overflow: 'hidden',
  },
  pinnedContent: { flex: 1 },
  pinnedImage: { width: '100%', height: '100%' },
  pinnedText: { flex: 1, padding: spacing.sm },
  pinnedTextContent: { color: colors.text.primary, fontSize: fontSize.xs },
  pinBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: radius.full,
    padding: 4,
  },
  gridContainer: { paddingBottom: 100 },
  gridRow: { gap: 2 },
  gridItem: { width: GRID_ITEM, height: GRID_ITEM, marginBottom: 2 },
  gridImage: { width: '100%', height: '100%' },
  gridTextPost: {
    flex: 1, backgroundColor: colors.dark.bgElevated,
    padding: spacing.sm, alignItems: 'center', justifyContent: 'center',
  },
  gridTextContent: { color: colors.text.primary, fontSize: 10, textAlign: 'center' },
  carouselBadge: { position: 'absolute', top: 8, right: 8 },
  reelOverlay: {
    position: 'absolute', bottom: 8, left: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  reelDuration: { color: '#fff', fontSize: 10, fontWeight: '600' },
  reelStats: {
    position: 'absolute', bottom: 8, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  reelStatText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  threadRow: {
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  threadContent: { color: colors.text.primary, fontSize: fontSize.sm, lineHeight: 20 },
  threadMeta: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  threadMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  threadMetaText: { color: colors.text.tertiary, fontSize: fontSize.xs },
  skeletonGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 2,
    paddingHorizontal: 0,
  },
});
