import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, FlatList, Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { Image } from 'expo-image';
import { Avatar } from '@/components/ui/Avatar';
import { colors, spacing, fontSize } from '@/theme';
import { usersApi, followsApi, postsApi, threadsApi } from '@/services/api';
import type { Post, Thread } from '@/types';

const SCREEN_W = Dimensions.get('window').width;
const GRID_ITEM = (SCREEN_W - 2) / 3; // 3-column grid with 1pt gaps

type Tab = 'posts' | 'threads';

function GridItem({ post, onPress }: { post: Post; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.gridItem}>
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
          <Text style={styles.carouselBadgeText}>⊞</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const { user: clerkUser } = useUser();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('posts');

  const isOwnProfile = clerkUser?.username === username;

  // ── Profile data ──
  const profileQuery = useQuery({
    queryKey: ['profile', username],
    queryFn: () => usersApi.getProfile(username),
  });

  const profile = profileQuery.data;
  const isFollowing = profile?.isFollowing ?? false;

  // ── Posts grid ──
  const postsQuery = useInfiniteQuery({
    queryKey: ['user-posts', username],
    queryFn: ({ pageParam }) =>
      usersApi.getUserPosts(username, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: activeTab === 'posts',
  });
  const posts: Post[] = postsQuery.data?.pages.flatMap((p) => p.data) ?? [];

  // ── Threads list ──
  const threadsQuery = useInfiniteQuery({
    queryKey: ['user-threads', username],
    queryFn: ({ pageParam }) =>
      usersApi.getUserThreads(username, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: activeTab === 'threads',
  });
  const threads: Thread[] = threadsQuery.data?.pages.flatMap((p) => p.data) ?? [];

  // ── Follow mutation ──
  const followMutation = useMutation({
    mutationFn: () =>
      isFollowing ? followsApi.unfollow(profile!.id) : followsApi.follow(profile!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', username] });
    },
  });

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
        <ActivityIndicator color={colors.emerald} style={styles.fullLoader} />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>User not found</Text>
        </View>
      </SafeAreaView>
    );
  }

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
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => router.push('/(screens)/edit-profile')}
          >
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.actionBtns}>
            <TouchableOpacity
              style={[styles.followBtn, isFollowing && styles.followingBtn]}
              onPress={() => followMutation.mutate()}
              disabled={followMutation.isPending}
            >
              {followMutation.isPending ? (
                <ActivityIndicator color={isFollowing ? colors.text.primary : '#fff'} size="small" />
              ) : (
                <Text style={[styles.followBtnText, isFollowing && styles.followingBtnText]}>
                  {isFollowing ? 'Following' : 'Follow'}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.msgBtn}
              onPress={async () => {
                try {
                  const { messagesApi } = await import('@/services/api');
                  const convo = await messagesApi.createDM(profile.id);
                  router.push(`/(screens)/conversation/${convo.id}`);
                } catch {
                  router.push('/(screens)/new-conversation');
                }
              }}
            >
              <Text style={styles.msgBtnText}>Message</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Name + handle */}
      <View style={styles.nameSection}>
        <View style={styles.nameRow}>
          <Text style={styles.displayName}>{profile.displayName}</Text>
          {profile.isVerified && <Text style={styles.verified}>✓</Text>}
        </View>
        <Text style={styles.handle}>@{profile.username}</Text>
        {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
      </View>

      {/* Stats */}
      <View style={styles.stats}>
        <TouchableOpacity
          style={styles.stat}
          onPress={() => router.push(`/(screens)/followers/${profile.id}`)}
        >
          <Text style={styles.statNum}>{profile._count?.followers ?? 0}</Text>
          <Text style={styles.statLabel}>Followers</Text>
        </TouchableOpacity>
        <View style={styles.statDivider} />
        <TouchableOpacity
          style={styles.stat}
          onPress={() => router.push(`/(screens)/following/${profile.id}`)}
        >
          <Text style={styles.statNum}>{profile._count?.following ?? 0}</Text>
          <Text style={styles.statLabel}>Following</Text>
        </TouchableOpacity>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statNum}>{profile._count?.posts ?? 0}</Text>
          <Text style={styles.statLabel}>Posts</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'posts' && styles.tabActive]}
          onPress={() => setActiveTab('posts')}
        >
          <Text style={[styles.tabText, activeTab === 'posts' && styles.tabTextActive]}>
            Posts
          </Text>
          {activeTab === 'posts' && <View style={styles.tabIndicator} />}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'threads' && styles.tabActive]}
          onPress={() => setActiveTab('threads')}
        >
          <Text style={[styles.tabText, activeTab === 'threads' && styles.tabTextActive]}>
            Threads
          </Text>
          {activeTab === 'threads' && <View style={styles.tabIndicator} />}
        </TouchableOpacity>
      </View>
    </View>
  );

  if (activeTab === 'posts') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerUsername}>@{username}</Text>
          {isOwnProfile ? (
            <TouchableOpacity onPress={() => router.push('/(screens)/settings')} hitSlop={8} style={{ width: 40, alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 20 }}>⚙️</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>
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
            !postsQuery.isLoading ? (
              <View style={styles.emptyTab}>
                <Text style={styles.emptyTabText}>No posts yet</Text>
              </View>
            ) : (
              <ActivityIndicator color={colors.emerald} style={styles.tabLoader} />
            )
          }
          ListFooterComponent={() =>
            postsQuery.isFetchingNextPage ? (
              <ActivityIndicator color={colors.emerald} style={{ paddingVertical: spacing.lg }} />
            ) : null
          }
          contentContainerStyle={styles.gridContainer}
        />
      </SafeAreaView>
    );
  }

  // Threads tab — single-column list
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerUsername}>@{username}</Text>
        <View style={{ width: 40 }} />
      </View>
      <FlatList
        data={threads}
        keyExtractor={(item) => item.id}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={() => ListHeader}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.threadRow}
            activeOpacity={0.8}
            onPress={() => router.push(`/(screens)/thread/${item.id}`)}
          >
            <Text style={styles.threadContent} numberOfLines={3}>{item.content}</Text>
            <View style={styles.threadMeta}>
              <Text style={styles.threadMetaText}>{item.likesCount} likes</Text>
              <Text style={styles.threadMetaText}>{item.repliesCount} replies</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={() =>
          !threadsQuery.isLoading ? (
            <View style={styles.emptyTab}>
              <Text style={styles.emptyTabText}>No threads yet</Text>
            </View>
          ) : (
            <ActivityIndicator color={colors.emerald} style={styles.tabLoader} />
          )
        }
        ListFooterComponent={() =>
          threadsQuery.isFetchingNextPage ? (
            <ActivityIndicator color={colors.emerald} style={{ paddingVertical: spacing.lg }} />
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  fullLoader: { flex: 1, marginTop: 80 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
  },
  backBtn: { width: 40 },
  backIcon: { color: colors.text.primary, fontSize: 22 },
  headerUsername: {
    color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700',
  },

  // Cover
  cover: { width: '100%', height: 140 },
  coverPlaceholder: { height: 100, backgroundColor: colors.dark.bgElevated },

  // Avatar + action row
  avatarRow: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, marginTop: -36, marginBottom: spacing.md,
  },
  editBtn: {
    borderWidth: 1.5, borderColor: colors.dark.border, borderRadius: 10,
    paddingHorizontal: spacing.base, paddingVertical: spacing.xs + 2,
  },
  editBtnText: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '600' },
  actionBtns: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' },
  followBtn: {
    backgroundColor: colors.emerald, borderRadius: 10,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.xs + 2,
    minWidth: 90, alignItems: 'center',
  },
  followingBtn: {
    backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.dark.border,
  },
  followBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700' },
  followingBtnText: { color: colors.text.primary },
  msgBtn: {
    borderWidth: 1.5, borderColor: colors.dark.border, borderRadius: 10,
    paddingHorizontal: spacing.base, paddingVertical: spacing.xs + 2,
  },
  msgBtnText: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '600' },

  // Bio section
  nameSection: { paddingHorizontal: spacing.base, marginBottom: spacing.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 2 },
  displayName: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '700' },
  verified: { color: colors.emerald, fontSize: fontSize.sm },
  handle: { color: colors.text.secondary, fontSize: fontSize.sm, marginBottom: spacing.sm },
  bio: { color: colors.text.primary, fontSize: fontSize.base, lineHeight: 22 },

  // Stats
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

  // Tabs
  tabs: {
    flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  tab: { flex: 1, alignItems: 'center', paddingTop: spacing.md },
  tabActive: {},
  tabText: { color: colors.text.secondary, fontSize: fontSize.sm, fontWeight: '600', paddingBottom: spacing.md },
  tabTextActive: { color: colors.text.primary },
  tabIndicator: { height: 2, width: '60%', backgroundColor: colors.emerald, borderRadius: 1, marginBottom: -0.5 },

  // Posts grid
  gridContainer: { paddingBottom: 100 },
  gridRow: { gap: 1 },
  gridItem: {
    width: GRID_ITEM, height: GRID_ITEM,
    backgroundColor: colors.dark.bgElevated,
    marginBottom: 1,
  },
  gridImage: { width: '100%', height: '100%' },
  gridTextPost: {
    flex: 1, padding: spacing.xs,
    backgroundColor: colors.dark.bgCard, justifyContent: 'center',
  },
  gridTextContent: { color: colors.text.primary, fontSize: fontSize.xs },
  carouselBadge: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 4, padding: 2,
  },
  carouselBadgeText: { color: '#fff', fontSize: 12 },

  // Threads list
  threadRow: {
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  threadContent: { color: colors.text.primary, fontSize: fontSize.base, lineHeight: 22, marginBottom: spacing.xs },
  threadMeta: { flexDirection: 'row', gap: spacing.lg },
  threadMetaText: { color: colors.text.secondary, fontSize: fontSize.xs },

  // Misc
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundText: { color: colors.text.secondary, fontSize: fontSize.base },
  emptyTab: { alignItems: 'center', paddingTop: 40 },
  emptyTabText: { color: colors.text.secondary, fontSize: fontSize.base },
  tabLoader: { marginTop: 40 },
});
