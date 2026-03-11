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
  withSequence,
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

  const profileQuery = useQuery({
    queryKey: ['profile', username],
    queryFn: () => usersApi.getProfile(username),
  });
  const profile = profileQuery.data;
  const isFollowing = profile?.isFollowing ?? false;

  const { data: mutualFollowers } = useQuery({
    queryKey: ['mutual-followers', username],
    queryFn: () => usersApi.getMutualFollowers(username),
    enabled: !!username && !isOwnProfile,
  });

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
    queryFn: ({ pageParam }) => postsApi.getLiked({ cursor: pageParam }),
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
          <Pressable onPress={() => router.back()} hitSlop={8}>
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
          <Pressable onPress={() => router.back()} hitSlop={8}>
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
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Icon name="arrow-left" size="md" color={colors.text.primary} />
          </Pressable>
        </View>
        <EmptyState icon="user" title="User not found" />
      </SafeAreaView>
    );
  }

  const ListHeader = (
    <View>
      {/* Cover image */}
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
        <View style={styles.coverPlaceholder} />
      )}

      {/* Avatar row */}
      <View style={styles.avatarRow}>
        <Avatar uri={profile.avatarUrl} name={profile.displayName} size="2xl" />
        {isOwnProfile ? (
          <View style={{ flexDirection: 'row' }}>
            <Pressable
              style={styles.editBtn}
              onPress={() => router.push('/(screens)/edit-profile')}
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
          >
            <Icon name="link" size={13} color={colors.emerald} />
            <Text style={styles.websiteLink}>{profile.website}</Text>
          </TouchableOpacity>
        ) : null}
        {profile.channel && (
          <TouchableOpacity
            style={styles.channelRow}
            onPress={() => router.push(`/(screens)/channel/${profile.channel.handle}`)}
          >
            <Icon name="video" size={13} color={colors.emerald} />
            <Text style={styles.channelText}>View Channel</Text>
          </TouchableOpacity>
        )}
        {profile.profileLinks && profile.profileLinks.length > 0 && (
          <View style={styles.profileLinksSection}>
            {profile.profileLinks.map((link) => (
              <Pressable
                key={link.id}
                style={styles.profileLinkRow}
                onPress={() => {
                  const url = link.url.startsWith('http') ? link.url : `https://${link.url}`;
                  Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open link'));
                }}
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
        {!isOwnProfile && profile.channel && (
          <>
            <TouchableOpacity
              style={styles.channelRow}
              onPress={() => router.push(`/(screens)/channel/${profile.channel.handle}`)}
            >
              <Icon name="video" size={13} color={colors.emerald} />
              <Text style={styles.channelText}>Videos</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.channelRow}
              onPress={() => router.push(`/(screens)/playlists/${profile.channel.id}`)}
            >
              <Icon name="layers" size={13} color={colors.emerald} />
              <Text style={styles.channelText}>Playlists</Text>
            </TouchableOpacity>
          </>
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
            >
              <View style={[styles.highlightCircle, loadingHighlightId === album.id && { opacity: 0.5 }]}>
                {album.coverUrl ? (
                  <Image source={{ uri: album.coverUrl }} style={styles.highlightImg} contentFit="cover" />
                ) : (
                  <Icon name="image" size="md" color={colors.text.tertiary} />
                )}
              </View>
              <Text style={styles.highlightLabel} numberOfLines={1}>{album.title}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Stats */}
      <View style={styles.stats}>
        <StatItem
          num={profile._count?.followers ?? 0}
          label="Followers"
          onPress={() => router.push(`/(screens)/followers/${profile.id}`)}
        />
        <View style={styles.statDivider} />
        <StatItem
          num={profile._count?.following ?? 0}
          label="Following"
          onPress={() => router.push(`/(screens)/following/${profile.id}`)}
        />
        <View style={styles.statDivider} />
        <StatItem num={profile._count?.posts ?? 0} label="Posts" />
      </View>

      {/* Mutual followers */}
      {!isOwnProfile && mutualFollowers && mutualFollowers.length > 0 && (
        <Pressable
          onPress={() => router.push(`/(screens)/mutual-followers?username=${username}`)}
          style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: spacing.base, marginTop: spacing.sm,
          }}
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
                onPress={() => router.push(`/(screens)/thread/${thread.id}`)}
              >
                <View style={styles.pinnedContent}>
                  {thread.mediaUrls.length > 0 ? (
                    <Image
                      source={{ uri: thread.thumbnailUrl ?? thread.mediaUrls[0] }}
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

      {/* Minbar section (own profile only) */}
      {isOwnProfile && (
        <View style={styles.minbarSection}>
          <Text style={styles.sectionTitle}>Minbar</Text>
          <View style={styles.linkRow}>
            <Pressable style={styles.linkItem} onPress={() => router.push('/(screens)/watch-history')}>
              <Icon name="clock" size="md" color={colors.text.primary} />
              <Text style={styles.linkText}>Watch History</Text>
              <Icon name="chevron-right" size="sm" color={colors.text.tertiary} />
            </Pressable>
            <Pressable style={styles.linkItem} onPress={() => router.push('/(screens)/watch-history')}>
              <Icon name="bookmark" size="md" color={colors.text.primary} />
              <Text style={styles.linkText}>Watch History</Text>
              <Icon name="chevron-right" size="sm" color={colors.text.tertiary} />
            </Pressable>
            {profile.channel && (
              <Pressable
                style={styles.linkItem}
                onPress={() => router.push(`/(screens)/playlists/${profile.channel.id}`)}
              >
                <Icon name="layers" size="md" color={colors.text.primary} />
                <Text style={styles.linkText}>My Playlists</Text>
                <Icon name="chevron-right" size="sm" color={colors.text.tertiary} />
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* Tabs */}
      <TabSelector
        tabs={isOwnProfile ? [
          { key: 'posts', label: 'Posts' },
          { key: 'threads', label: 'Threads' },
          { key: 'reels', label: 'Reels' },
          { key: 'liked', label: 'Liked' },
        ] : [
          { key: 'posts', label: 'Posts' },
          { key: 'threads', label: 'Threads' },
          { key: 'reels', label: 'Reels' },
        ]}
        activeKey={activeTab}
        onTabChange={(key) => setActiveTab(key as Tab)}
      />
    </View>
  );

  const renderHeaderActions = () => (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
        <Icon name="arrow-left" size="md" color={colors.text.primary} />
      </Pressable>
      <Text style={styles.headerUsername}>@{username}</Text>
      <View style={styles.headerActions}>
        <Pressable hitSlop={8} onPress={() => setShowShareSheet(true)}>
          <Icon name="share" size="sm" color={colors.text.primary} />
        </Pressable>
        {isOwnProfile ? (
          <>
            <Pressable hitSlop={8} onPress={() => router.push('/(screens)/saved')}>
              <Icon name="bookmark" size="sm" color={colors.text.primary} />
            </Pressable>
            <Pressable hitSlop={8} onPress={() => router.push('/(screens)/archive')}>
              <Icon name="clock" size="sm" color={colors.text.primary} />
            </Pressable>

            <Pressable hitSlop={8} onPress={() => router.push('/(screens)/settings')}>
              <Icon name="settings" size="sm" color={colors.text.primary} />
            </Pressable>
          </>
        ) : (
          <Pressable hitSlop={8} onPress={() => { haptic.light(); setShowMenu(true); }}>
            <Icon name="more-horizontal" size="sm" color={colors.text.secondary} />
          </Pressable>
        )}
      </View>
    </View>
  );

  if (activeTab === 'posts') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {renderHeaderActions()}
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          numColumns={3}
          columnWrapperStyle={styles.gridRow}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={() => ListHeader}
          renderItem={({ item }) => (
            <GridItem
              post={item}
              onPress={() => router.push(`/(screens)/post/${item.id}`)}
            />
          )}
          ListEmptyComponent={() =>
            postsQuery.isLoading ? (
              <View style={styles.skeletonGrid}>
                {Array.from({ length: 9 }).map((_, i) => (
                  <Skeleton.Rect key={i} width={GRID_ITEM} height={GRID_ITEM} borderRadius={0} />
                ))}
              </View>
            ) : (
              <EmptyState icon="image" title="No posts yet" />
            )
          }
          ListFooterComponent={() =>
            postsQuery.isFetchingNextPage ? <Skeleton.Rect width="100%" height={GRID_ITEM} /> : null
          }
          refreshControl={
            <RefreshControl
              refreshing={postsQuery.isRefetching}
              onRefresh={() => {
                profileQuery.refetch();
                postsQuery.refetch();
              }}
              tintColor={colors.emerald}
            />
          }
          contentContainerStyle={styles.gridContainer}
        />
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
              router.push(`/(screens)/qr-code?username=${username}`);
            }}
          />
        </BottomSheet>
      </SafeAreaView>
    );
  }

  if (activeTab === 'threads') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
      {renderHeaderActions()}
      <FlatList
        data={threads}
        keyExtractor={(item) => item.id}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={() => ListHeader}
        renderItem={({ item }) => (
          <Pressable
            style={styles.threadRow}
            onPress={() => router.push(`/(screens)/thread/${item.id}`)}
          >
            <Text style={styles.threadContent} numberOfLines={3}>{item.content}</Text>
            <View style={styles.threadMeta}>
              <View style={styles.threadMetaItem}>
                <Icon name="heart" size={12} color={colors.text.tertiary} />
                <Text style={styles.threadMetaText}>{item.likesCount}</Text>
              </View>
              <View style={styles.threadMetaItem}>
                <Icon name="message-circle" size={12} color={colors.text.tertiary} />
                <Text style={styles.threadMetaText}>{item.repliesCount}</Text>
              </View>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={() =>
          threadsQuery.isLoading ? (
            <View>
              <Skeleton.ThreadCard />
              <Skeleton.ThreadCard />
            </View>
          ) : (
            <EmptyState icon="message-circle" title="No threads yet" />
          )
        }
        ListFooterComponent={() =>
          threadsQuery.isFetchingNextPage ? <Skeleton.ThreadCard /> : null
        }
        refreshControl={
          <RefreshControl
            refreshing={threadsQuery.isRefetching}
            onRefresh={() => {
              profileQuery.refetch();
              threadsQuery.refetch();
            }}
            tintColor={colors.emerald}
          />
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      />
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
    </SafeAreaView>
  );
  }

  // Reels tab
  const renderReelItem = ({ item }: { item: Reel }) => (
    <Pressable
      style={styles.gridItem}
      onPress={() => router.push(`/(screens)/reel/${item.id}`)}
    >
      {item.thumbnailUrl ? (
        <Image
          source={{ uri: item.thumbnailUrl }}
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
          {Math.floor(item.duration / 60)}:{String(Math.floor(item.duration % 60)).padStart(2, '0')}
        </Text>
      </View>
      <View style={styles.reelStats}>
        <Icon name="heart" size={12} color="#fff" />
        <Text style={styles.reelStatText}>{item.likesCount}</Text>
      </View>
    </Pressable>
  );

  if (activeTab === 'reels') {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {renderHeaderActions()}
      <FlatList
        data={reels}
        keyExtractor={(item) => item.id}
        numColumns={3}
        columnWrapperStyle={styles.gridRow}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={() => ListHeader}
        renderItem={renderReelItem}
        ListEmptyComponent={() =>
          reelsQuery.isLoading ? (
            <View style={styles.skeletonGrid}>
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton.Rect key={i} width={GRID_ITEM} height={GRID_ITEM} borderRadius={0} />
              ))}
            </View>
          ) : (
            <EmptyState icon="video" title="No reels yet" />
          )
        }
        ListFooterComponent={() =>
          reelsQuery.isFetchingNextPage ? <Skeleton.Rect width="100%" height={GRID_ITEM} /> : null
        }
        refreshControl={
          <RefreshControl
            refreshing={reelsQuery.isRefetching}
            onRefresh={() => {
              profileQuery.refetch();
              reelsQuery.refetch();
            }}
            tintColor={colors.emerald}
          />
        }
        contentContainerStyle={styles.gridContainer}
      />
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
    </SafeAreaView>
  );
  }

  if (activeTab === 'liked') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {renderHeaderActions()}
        <FlatList
          data={likedPosts}
          keyExtractor={(item) => item.id}
          numColumns={3}
          columnWrapperStyle={styles.gridRow}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={() => ListHeader}
          renderItem={({ item }) => (
            <GridItem
              post={item}
              onPress={() => router.push(`/(screens)/post/${item.id}`)}
            />
          )}
          ListEmptyComponent={() =>
            likedPostsQuery.isLoading ? (
              <View style={styles.skeletonGrid}>
                {Array.from({ length: 9 }).map((_, i) => (
                  <Skeleton.Rect key={i} width={GRID_ITEM} height={GRID_ITEM} borderRadius={0} />
                ))}
              </View>
            ) : (
              <EmptyState icon='heart' title='No liked posts yet' subtitle='Posts you like will appear here' />
            )
          }
          ListFooterComponent={() =>
            likedPostsQuery.isFetchingNextPage ? <Skeleton.Rect width='100%' height={GRID_ITEM} /> : null
          }
          refreshControl={
            <RefreshControl
              refreshing={likedPostsQuery.isRefetching}
              onRefresh={() => {
                profileQuery.refetch();
                likedPostsQuery.refetch();
              }}
              tintColor={colors.emerald}
            />
          }
          contentContainerStyle={styles.gridContainer}
        />
        <BottomSheet visible={showMenu} onClose={() => setShowMenu(false)}>
          <BottomSheetItem
            label={`Mute @${username}`}
            icon={<Icon name='volume-x' size='sm' color={colors.text.primary} />}
            onPress={() => muteMutation.mutate()}
          />
          <BottomSheetItem
            label={`Block @${username}`}
            icon={<Icon name='lock' size='sm' color={colors.error} />}
            onPress={handleBlock}
            destructive
          />
          <BottomSheetItem
            label='Report'
            icon={<Icon name='flag' size='sm' color={colors.error} />}
            onPress={handleReport}
            destructive
          />
        </BottomSheet>
        <BottomSheet visible={showShareSheet} onClose={() => setShowShareSheet(false)}>
          <BottomSheetItem
            label='Share Profile'
            icon={<Icon name='share' size='sm' color={colors.text.primary} />}
            onPress={() => {
              setShowShareSheet(false);
              handleShareProfile();
            }}
          />
          <BottomSheetItem
            label='QR Code'
            icon={<Icon name='hash' size='sm' color={colors.text.primary} />}
            onPress={() => {
              setShowShareSheet(false);
              router.push(`/(screens)/qr-code?username=${username}`);
            }}
          />
        </BottomSheet>
      </SafeAreaView>
    );
  }
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
  coverPlaceholder: { height: 100, backgroundColor: colors.dark.bgElevated },

  avatarRow: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, marginTop: -36, marginBottom: spacing.md,
  },
  editBtn: {
    borderWidth: 1.5, borderColor: colors.dark.border, borderRadius: radius.md,
    paddingHorizontal: spacing.base, paddingVertical: spacing.xs + 2,
  },
  editBtnText: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '600' },
  actionBtns: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' },
  followBtn: {
    backgroundColor: colors.emerald, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.xs + 2,
    minWidth: 90, alignItems: 'center',
  },
  followingBtn: {
    backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.dark.border,
  },
  followBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700' },
  followingBtnText: { color: colors.text.primary },
  msgBtn: {
    borderWidth: 1.5, borderColor: colors.dark.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
    alignItems: 'center', justifyContent: 'center',
  },

  nameSection: { paddingHorizontal: spacing.base, marginBottom: spacing.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 2 },
  displayName: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '700' },
  handle: { color: colors.text.secondary, fontSize: fontSize.sm, marginBottom: spacing.sm },
  bio: { color: colors.text.primary, fontSize: fontSize.base, lineHeight: 22 },
  websiteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  websiteLink: { color: colors.emerald, fontSize: fontSize.sm },
  channelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  channelText: { color: colors.emerald, fontSize: fontSize.sm },
  profileLinksSection: { marginTop: spacing.xs },
  profileLinkRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.xs },
  profileLinkTitle: { color: colors.emerald, fontSize: fontSize.sm, fontWeight: "600" },
  profileLinkUrl: { color: colors.text.secondary, fontSize: fontSize.sm, flex: 1 },

  highlightsRow: { marginBottom: spacing.md },
  highlightItem: { alignItems: 'center', width: 68 },
  highlightCircle: {
    width: 62, height: 62, borderRadius: radius.full,
    borderWidth: 2, borderColor: colors.dark.borderLight,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.dark.bgElevated, marginBottom: spacing.xs,
  },
  highlightImg: { width: '100%', height: '100%' },
  highlightLabel: { color: colors.text.secondary, fontSize: fontSize.xs, textAlign: 'center' },

  stats: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.md, gap: spacing.xl,
    borderTopWidth: 0.5, borderTopColor: colors.dark.border,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  stat: { alignItems: 'center', gap: 2 },
  statNum: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '700' },
  statLabel: { color: colors.text.secondary, fontSize: fontSize.xs },
  statDivider: { width: 0.5, height: 30, backgroundColor: colors.dark.border },

  pinnedSection: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.dark.border,
  },
  pinnedScroll: {
    marginHorizontal: -spacing.base,
    paddingHorizontal: spacing.base,
  },
  pinnedItem: {
    width: 120,
    marginRight: spacing.md,
  },
  pinnedContent: {
    width: 120,
    height: 120,
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  pinnedImage: {
    width: '100%',
    height: '100%',
  },
  pinnedText: {
    flex: 1,
    padding: spacing.xs,
    justifyContent: 'center',
  },
  pinnedTextContent: {
    color: colors.text.primary,
    fontSize: fontSize.xs,
  },
  pinBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: radius.sm,
    padding: 3,
  },

  gridContainer: { paddingBottom: 100 },
  gridRow: { gap: 2 },
  gridItem: {
    width: GRID_ITEM, height: GRID_ITEM,
    backgroundColor: colors.dark.bgElevated,
    marginBottom: 2,
  },
  gridImage: { width: '100%', height: '100%' },
  gridTextPost: {
    flex: 1, padding: spacing.xs,
    backgroundColor: colors.dark.bgCard, justifyContent: 'center',
  },
  gridTextContent: { color: colors.text.primary, fontSize: fontSize.xs },
  carouselBadge: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.sm, padding: 3,
  },
  reelOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reelDuration: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  reelStats: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  reelStatText: {
    color: '#fff',
    fontSize: fontSize.xs,
    marginLeft: 2,
  },
  skeletonGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 2,
  },

  threadRow: {
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  threadContent: { color: colors.text.primary, fontSize: fontSize.base, lineHeight: 22, marginBottom: spacing.xs },
  threadMeta: { flexDirection: 'row', gap: spacing.lg },
  threadMetaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  threadMetaText: { color: colors.text.tertiary, fontSize: fontSize.xs },
  minbarSection: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.dark.border,
  },
  sectionTitle: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  linkRow: {
    gap: spacing.xs,
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  linkText: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.base,
  },
});
