import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, ScrollView, Dimensions, Pressable, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { Image } from 'expo-image';
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
import { TabSelector } from '@/components/ui/TabSelector';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { useHaptic } from '@/hooks/useHaptic';
import { colors, spacing, fontSize, radius, animation } from '@/theme';
import { usersApi, followsApi, postsApi, threadsApi, storiesApi, blocksApi, mutesApi } from '@/services/api';
import type { Post, Thread, StoryHighlightAlbum } from '@/types';

const SCREEN_W = Dimensions.get('window').width;
const GRID_ITEM = (SCREEN_W - 4) / 3;
const COVER_HEIGHT = 160;

type Tab = 'posts' | 'threads';

const PROFILE_TABS = [
  { key: 'posts', label: 'Posts' },
  { key: 'threads', label: 'Threads' },
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
      </Pressable>
    </Animated.View>
  );
}

function StatItem({ num, label, onPress }: { num: number; label: string; onPress?: () => void }) {
  return (
    <Pressable style={styles.stat} onPress={onPress} disabled={!onPress}>
      <Text style={styles.statNum}>{num}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
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

  const profileQuery = useQuery({
    queryKey: ['profile', username],
    queryFn: () => usersApi.getProfile(username),
  });
  const profile = profileQuery.data;
  const isFollowing = profile?.isFollowing ?? false;

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
    Alert.alert('Report account', 'Why are you reporting this account?', [
      { text: 'Spam', onPress: () => {} },
      { text: 'Impersonation', onPress: () => {} },
      { text: 'Inappropriate', onPress: () => {} },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleEndReached = useCallback(() => {
    if (activeTab === 'posts' && postsQuery.hasNextPage && !postsQuery.isFetchingNextPage) {
      postsQuery.fetchNextPage();
    }
    if (activeTab === 'threads' && threadsQuery.hasNextPage && !threadsQuery.isFetchingNextPage) {
      threadsQuery.fetchNextPage();
    }
  }, [activeTab, postsQuery, threadsQuery]);

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

  // Follow button with spring animation
  const FollowButton = () => {
    const btnScale = useSharedValue(1);
    const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: btnScale.value }] }));

    return (
      <Animated.View style={btnStyle}>
        <Pressable
          style={[styles.followBtn, isFollowing && styles.followingBtn]}
          onPress={() => {
            haptic.medium();
            btnScale.value = withSequence(
              withSpring(0.9, animation.spring.bouncy),
              withSpring(1, animation.spring.bouncy),
            );
            followMutation.mutate();
          }}
          disabled={followMutation.isPending}
        >
          <Text style={[styles.followBtnText, isFollowing && styles.followingBtnText]}>
            {isFollowing ? 'Following' : 'Follow'}
          </Text>
        </Pressable>
      </Animated.View>
    );
  };

  const ListHeader = (
    <View>
      {/* Cover image */}
      {profile.coverUrl ? (
        <Image source={{ uri: profile.coverUrl }} style={styles.cover} contentFit="cover" />
      ) : (
        <View style={styles.coverPlaceholder} />
      )}

      {/* Avatar row */}
      <View style={styles.avatarRow}>
        <Avatar uri={profile.avatarUrl} name={profile.displayName} size="2xl" />
        {isOwnProfile ? (
          <Pressable
            style={styles.editBtn}
            onPress={() => router.push('/(screens)/edit-profile')}
          >
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </Pressable>
        ) : (
          <View style={styles.actionBtns}>
            <FollowButton />
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
        {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
        {profile.website ? (
          <View style={styles.websiteRow}>
            <Icon name="link" size={13} color={colors.emerald} />
            <Text style={styles.websiteLink}>{profile.website}</Text>
          </View>
        ) : null}
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
            <TouchableOpacity key={album.id} style={styles.highlightItem} activeOpacity={0.8}>
              <View style={styles.highlightCircle}>
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

      {/* Tabs */}
      <TabSelector
        tabs={PROFILE_TABS}
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
      {isOwnProfile ? (
        <View style={styles.headerActions}>
          <Pressable hitSlop={8} onPress={() => router.push('/(screens)/saved')}>
            <Icon name="bookmark" size="sm" color={colors.text.primary} />
          </Pressable>
          <Pressable hitSlop={8} onPress={() => router.push('/(screens)/settings')}>
            <Icon name="settings" size="sm" color={colors.text.primary} />
          </Pressable>
        </View>
      ) : (
        <Pressable hitSlop={8} onPress={() => { haptic.light(); setShowMenu(true); }}>
          <Icon name="more-horizontal" size="sm" color={colors.text.secondary} />
        </Pressable>
      )}
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

  highlightsRow: { marginBottom: spacing.md },
  highlightItem: { alignItems: 'center', width: 68 },
  highlightCircle: {
    width: 62, height: 62, borderRadius: 31,
    borderWidth: 2, borderColor: colors.dark.borderLight,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.dark.bgElevated, marginBottom: 4,
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
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 4, padding: 3,
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
  threadMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  threadMetaText: { color: colors.text.tertiary, fontSize: fontSize.xs },
});
