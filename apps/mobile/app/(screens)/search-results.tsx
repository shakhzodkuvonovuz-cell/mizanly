import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput,
  FlatList, RefreshControl, Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Avatar } from '@/components/ui/Avatar';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { TabSelector } from '@/components/ui/TabSelector';
import { PostCard } from '@/components/saf/PostCard';
import { ThreadCard } from '@/components/majlis/ThreadCard';
import { GradientButton } from '@/components/ui/GradientButton';
import { useHaptic } from '@/hooks/useHaptic';
import { colors, spacing, fontSize, radius } from '@/theme';
import { searchApi, hashtagsApi, usersApi } from '@/services/api';
import type { User, Post, Thread, Reel } from '@/types';

type Hashtag = { id: string; name: string; postsCount: number };

const SEARCH_TABS = [
  { key: 'people', label: 'People' },
  { key: 'posts', label: 'Posts' },
  { key: 'threads', label: 'Threads' },
  { key: 'reels', label: 'Reels' },
  { key: 'hashtags', label: 'Hashtags' },
] as const;

type SearchTab = typeof SEARCH_TABS[number]['key'];


function HashtagRow({ hashtag, onPress }: { hashtag: Hashtag; onPress: () => void }) {
  return (
    <Pressable style={styles.hashtagRow} onPress={onPress}>
      <View style={styles.hashtagIconWrap}>
        <Icon name="hash" size="sm" color={colors.emerald} />
      </View>
      <View>
        <Text style={styles.hashtagName}>#{hashtag.name}</Text>
        <Text style={styles.hashtagCount}>{hashtag.postsCount} posts</Text>
      </View>
    </Pressable>
  );
}

function ReelGridItem({ reel, onPress }: { reel: Reel; onPress: () => void }) {
  return (
    <Pressable style={styles.reelGridItem} onPress={onPress}>
      <Image
        source={{ uri: reel.thumbnailUrl || reel.videoUrl }}
        style={styles.reelGridThumbnail}
        resizeMode="cover"
      />
      <View style={styles.reelGridOverlay}>
        <Icon name="play" size={16} color={colors.text.primary} />
        <Text style={styles.reelGridViews}>{reel.viewsCount.toLocaleString()}</Text>
      </View>
    </Pressable>
  );
}

export default function SearchResultsScreen() {
  const router = useRouter();
  const haptic = useHaptic();
  const params = useLocalSearchParams<{ query: string }>();
  const initialQuery = params.query || '';
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [isFocused, setIsFocused] = useState(false);
  const [activeTab, setActiveTab] = useState<SearchTab>('people');
  const mountedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (debouncedQuery !== initialQuery) {
      // Optionally update URL? Keep as internal state for now.
    }
  }, [debouncedQuery, initialQuery]);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(text), 400);
  };

  // Search for people and hashtags (combined endpoint)
  const combinedSearchQuery = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: () => searchApi.search(debouncedQuery),
    enabled: debouncedQuery.trim().length >= 2 && activeTab === 'people',
  });

  // Separate endpoints for each content type (added by Agent 10)
  const postsQuery = useInfiniteQuery({
    queryKey: ['search-posts', debouncedQuery],
    queryFn: ({ pageParam }) => searchApi.searchPosts(debouncedQuery, pageParam),
    enabled: debouncedQuery.trim().length >= 2 && activeTab === 'posts',
    getNextPageParam: (last) => last.meta?.cursor,
    initialPageParam: undefined,
  });

  const threadsQuery = useInfiniteQuery({
    queryKey: ['search-threads', debouncedQuery],
    queryFn: ({ pageParam }) => searchApi.searchThreads(debouncedQuery, pageParam),
    enabled: debouncedQuery.trim().length >= 2 && activeTab === 'threads',
    getNextPageParam: (last) => last.meta?.cursor,
    initialPageParam: undefined,
  });

  const reelsQuery = useInfiniteQuery({
    queryKey: ['search-reels', debouncedQuery],
    queryFn: ({ pageParam }) => searchApi.searchReels(debouncedQuery, pageParam),
    enabled: debouncedQuery.trim().length >= 2 && activeTab === 'reels',
    getNextPageParam: (last) => last.meta?.cursor,
    initialPageParam: undefined,
  });

  // Hashtags search (using hashtagsApi.search from Agent 2)
  const hashtagsQuery = useInfiniteQuery({
    queryKey: ['search-hashtags', debouncedQuery],
    queryFn: ({ pageParam }) => hashtagsApi.search(debouncedQuery, pageParam),
    enabled: debouncedQuery.trim().length >= 2 && activeTab === 'hashtags',
    getNextPageParam: (last) => last.meta?.cursor,
    initialPageParam: undefined,
  });

  const people: User[] = combinedSearchQuery.data?.people ?? [];
  const hashtagsFromCombined = combinedSearchQuery.data?.hashtags ?? [];
  const posts = postsQuery.data?.pages.flatMap(p => p.data) ?? [];
  const threads = threadsQuery.data?.pages.flatMap(p => p.data) ?? [];
  const reels = reelsQuery.data?.pages.flatMap(p => p.data) ?? [];
  const hashtags = hashtagsQuery.data?.pages.flatMap(p => p.data) ?? hashtagsFromCombined;

  const isLoading = {
    people: combinedSearchQuery.isLoading,
    posts: postsQuery.isLoading,
    threads: threadsQuery.isLoading,
    reels: reelsQuery.isLoading,
    hashtags: hashtagsQuery.isLoading || combinedSearchQuery.isLoading,
  };

  const isFetchingNextPage = {
    posts: postsQuery.isFetchingNextPage,
    threads: threadsQuery.isFetchingNextPage,
    reels: reelsQuery.isFetchingNextPage,
    hashtags: hashtagsQuery.isFetchingNextPage,
  };

  const hasNextPage = {
    posts: postsQuery.hasNextPage,
    threads: threadsQuery.hasNextPage,
    reels: reelsQuery.hasNextPage,
    hashtags: hashtagsQuery.hasNextPage,
  };

  const handleFetchNextPage = () => {
    switch (activeTab) {
      case 'posts':
        if (postsQuery.hasNextPage && !postsQuery.isFetchingNextPage) postsQuery.fetchNextPage();
        break;
      case 'threads':
        if (threadsQuery.hasNextPage && !threadsQuery.isFetchingNextPage) threadsQuery.fetchNextPage();
        break;
      case 'reels':
        if (reelsQuery.hasNextPage && !reelsQuery.isFetchingNextPage) reelsQuery.fetchNextPage();
        break;
      case 'hashtags':
        if (hashtagsQuery.hasNextPage && !hashtagsQuery.isFetchingNextPage) hashtagsQuery.fetchNextPage();
        break;
    }
  };

  const handleRefresh = () => {
    switch (activeTab) {
      case 'people':
      case 'hashtags':
        combinedSearchQuery.refetch();
        break;
      case 'posts':
        postsQuery.refetch();
        break;
      case 'threads':
        threadsQuery.refetch();
        break;
      case 'reels':
        reelsQuery.refetch();
        break;
    }
  };

  const isRefreshing = {
    people: combinedSearchQuery.isRefetching,
    posts: postsQuery.isRefetching,
    threads: threadsQuery.isRefetching,
    reels: reelsQuery.isRefetching,
    hashtags: hashtagsQuery.isRefetching || combinedSearchQuery.isRefetching,
  };

  const queryClient = useQueryClient();
  const followMutation = useMutation({
    mutationFn: ({ userId, follow }: { userId: string; follow: boolean }) =>
      follow ? usersApi.follow(userId) : usersApi.unfollow(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['search', debouncedQuery] });
    },
  });

  const UserRow = ({ user, onPress }: { user: User; onPress: () => void }) => {
    const handleFollow = () => {
      followMutation.mutate({ userId: user.id, follow: !user.isFollowing });
    };
    return (
      <View style={styles.userRow}>
        <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Avatar uri={user.avatarUrl} name={user.displayName} size="md" showOnline />
          <View style={styles.userInfo}>
            <View style={styles.userNameRow}>
              <Text style={styles.userName}>{user.displayName}</Text>
              {user.isVerified && <VerifiedBadge size={13} />}
            </View>
            <Text style={styles.userHandle}>@{user.username}</Text>
            {user._count && (
              <Text style={styles.userFollowers}>{user._count.followers} followers</Text>
            )}
          </View>
        </Pressable>
        {user.isFollowing ? (
          <GradientButton
            label="Following"
            size="sm"
            variant="secondary"
            onPress={handleFollow}
          />
        ) : (
          <GradientButton
            label="Follow"
            size="sm"
            onPress={handleFollow}
          />
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <GlassHeader
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Back' }}
        titleComponent={
          <View style={[styles.searchBox, isFocused && styles.searchBoxFocused]}>
            <Icon name="search" size="xs" color={colors.text.tertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search…"
              placeholderTextColor={colors.text.tertiary}
              value={query}
              onChangeText={handleQueryChange}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <Pressable onPress={() => { setQuery(''); setDebouncedQuery(''); }} hitSlop={8}>
                <Icon name="x" size="xs" color={colors.text.secondary} />
              </Pressable>
            )}
          </View>
        }
      />
      <View style={styles.headerSpacer} />

      <TabSelector
        tabs={SEARCH_TABS.map((t) => ({ key: t.key, label: t.label }))}
        activeKey={activeTab}
        onTabChange={(key) => setActiveTab(key as SearchTab)}
        variant="underline"
        style={styles.tabSelector}
      />

      {debouncedQuery.trim().length < 2 ? (
        <EmptyState
          icon="search"
          title="Enter a search term"
          subtitle="Type at least 2 characters to see results"
        />
      ) : (
        <>
          {/* People Tab */}
          {activeTab === 'people' && (
            <>
              {isLoading.people ? (
                <View style={styles.skeletonList}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <View key={i} style={styles.skeletonRow}>
                      <Skeleton.Circle size={40} />
                      <View style={{ flex: 1, gap: 6 }}>
                        <Skeleton.Rect width={120} height={14} />
                        <Skeleton.Rect width={80} height={11} />
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <FlatList
                  data={people}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <UserRow
                      user={item}
                      onPress={() => router.push(`/(screens)/profile/${item.username}`)}
                    />
                  )}
                  ListEmptyComponent={() => (
                    <EmptyState
                      icon="users"
                      title={`No people for "${debouncedQuery}"`}
                      subtitle="Try a different search term"
                    />
                  )}
                  contentContainerStyle={{ paddingBottom: 40 }}
                  refreshControl={
                    <RefreshControl
                      refreshing={isRefreshing.people}
                      onRefresh={handleRefresh}
                      tintColor={colors.emerald}
                    />
                  }
                />
              )}
            </>
          )}

          {/* Posts Tab */}
          {activeTab === 'posts' && (
            <>
              {isLoading.posts ? (
                <View style={styles.skeletonList}>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton.PostCard key={i} />
                  ))}
                </View>
              ) : (
                <FlatList
                  data={posts}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => <PostCard post={item} />}
                  ListEmptyComponent={() => (
                    <EmptyState
                      icon="image"
                      title={`No posts for "${debouncedQuery}"`}
                      subtitle="Try a different search term"
                    />
                  )}
                  onEndReached={handleFetchNextPage}
                  onEndReachedThreshold={0.5}
                  contentContainerStyle={{ paddingBottom: 40 }}
                  refreshControl={
                    <RefreshControl
                      refreshing={isRefreshing.posts}
                      onRefresh={handleRefresh}
                      tintColor={colors.emerald}
                    />
                  }
                />
              )}
            </>
          )}

          {/* Threads Tab */}
          {activeTab === 'threads' && (
            <>
              {isLoading.threads ? (
                <View style={styles.skeletonList}>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton.ThreadCard key={i} />
                  ))}
                </View>
              ) : (
                <FlatList
                  data={threads}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => <ThreadCard thread={item} />}
                  ListEmptyComponent={() => (
                    <EmptyState
                      icon="message-circle"
                      title={`No threads for "${debouncedQuery}"`}
                      subtitle="Try a different search term"
                    />
                  )}
                  onEndReached={handleFetchNextPage}
                  onEndReachedThreshold={0.5}
                  contentContainerStyle={{ paddingBottom: 40 }}
                  refreshControl={
                    <RefreshControl
                      refreshing={isRefreshing.threads}
                      onRefresh={handleRefresh}
                      tintColor={colors.emerald}
                    />
                  }
                />
              )}
            </>
          )}

          {/* Reels Tab */}
          {activeTab === 'reels' && (
            <>
              {isLoading.reels ? (
                <FlatList
                  data={Array.from({ length: 9 })}
                  keyExtractor={(_, i) => `skeleton-${i}`}
                  renderItem={() => (
                    <Skeleton.Rect width={120} height={160} />
                  )}
                  numColumns={3}
                  columnWrapperStyle={styles.reelGridRow}
                  scrollEnabled={false}
                  contentContainerStyle={{ paddingBottom: 40 }}
                />
              ) : (
                <FlatList
                  data={reels}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <ReelGridItem
                      reel={item}
                      onPress={() => router.push(`/(screens)/reel/${item.id}`)}
                    />
                  )}
                  numColumns={3}
                  columnWrapperStyle={styles.reelGridRow}
                  ListEmptyComponent={() => (
                    <EmptyState
                      icon="video"
                      title={`No reels for "${debouncedQuery}"`}
                      subtitle="Try a different search term"
                    />
                  )}
                  onEndReached={handleFetchNextPage}
                  onEndReachedThreshold={0.5}
                  contentContainerStyle={{ paddingBottom: 40 }}
                  refreshControl={
                    <RefreshControl
                      refreshing={isRefreshing.reels}
                      onRefresh={handleRefresh}
                      tintColor={colors.emerald}
                    />
                  }
                />
              )}
            </>
          )}

          {/* Hashtags Tab */}
          {activeTab === 'hashtags' && (
            <>
              {isLoading.hashtags ? (
                <View style={styles.skeletonList}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <View key={i} style={styles.skeletonRow}>
                      <Skeleton.Circle size={40} />
                      <View style={{ flex: 1, gap: 6 }}>
                        <Skeleton.Rect width={120} height={14} />
                        <Skeleton.Rect width={80} height={11} />
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <FlatList
                  data={hashtags}
                  keyExtractor={(item) => item.id || `ht-${item.name}`}
                  renderItem={({ item }) => (
                    <HashtagRow
                      hashtag={item}
                      onPress={() => router.push(`/(screens)/hashtag/${item.name}`)}
                    />
                  )}
                  ListEmptyComponent={() => (
                    <EmptyState
                      icon="hash"
                      title={`No hashtags for "${debouncedQuery}"`}
                      subtitle="Try a different search term"
                    />
                  )}
                  onEndReached={handleFetchNextPage}
                  onEndReachedThreshold={0.5}
                  contentContainerStyle={{ paddingBottom: 40 }}
                  refreshControl={
                    <RefreshControl
                      refreshing={isRefreshing.hashtags}
                      onRefresh={handleRefresh}
                      tintColor={colors.emerald}
                    />
                  }
                />
              )}
            </>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  headerSpacer: { height: 44 + spacing.sm + 44 },
  searchBox: {
    width: '100%', flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.dark.bgElevated, borderRadius: radius.md,
    paddingHorizontal: spacing.sm, gap: spacing.xs,
    borderWidth: 1, borderColor: 'transparent',
  },
  searchBoxFocused: {
    borderColor: colors.emerald,
    backgroundColor: colors.active.emerald10,
  },
  searchInput: {
    flex: 1, color: colors.text.primary, fontSize: fontSize.base,
    paddingVertical: spacing.sm,
  },
  tabSelector: {
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  skeletonList: { padding: spacing.base, gap: spacing.md },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  skeletonGrid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
    padding: spacing.base,
  },
  userRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  userInfo: { flex: 1 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  userName: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  userHandle: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 1 },
  userFollowers: { color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: 2 },
  hashtagRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  hashtagIconWrap: {
    width: 40, height: 40, borderRadius: radius.full,
    backgroundColor: colors.active.emerald10,
    alignItems: 'center', justifyContent: 'center',
  },
  hashtagName: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  hashtagCount: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 2 },
  reelGridItem: {
    flex: 1,
    aspectRatio: 0.75,
    margin: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.dark.bgElevated,
  },
  reelGridThumbnail: {
    width: '100%',
    height: '100%',
  },
  reelGridOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  reelGridViews: {
    color: colors.text.primary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  reelGridRow: {
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    marginBottom: 2,
  },
});