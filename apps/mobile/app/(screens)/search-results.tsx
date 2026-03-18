import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput,
  FlatList, RefreshControl, Image,
  Pressable,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
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
import { searchApi, hashtagsApi, followsApi } from '@/services/api';
import type { User, Post, Thread, Reel } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

type Hashtag = { id: string; name: string; postsCount: number };

const SEARCH_TABS = [
  { key: 'people', label: 'People' },
  { key: 'posts', label: 'Posts' },
  { key: 'threads', label: 'Threads' },
  { key: 'reels', label: 'Reels' },
  { key: 'hashtags', label: 'Hashtags' },
] as const;

type SearchTab = typeof SEARCH_TABS[number]['key'];


function HashtagRow({ hashtag, onPress, index }: { hashtag: Hashtag; onPress: () => void; index: number }) {
  return (
    <Animated.View entering={FadeInUp.delay(index * 50).duration(400)}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`View hashtag ${hashtag.name}`}
      >
        <LinearGradient
          colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
          style={styles.hashtagRow}
        >
          <LinearGradient
            colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
            style={styles.hashtagIconWrap}
          >
            <Icon name="hash" size="sm" color={colors.emerald} />
          </LinearGradient>
          <View>
            <Text style={styles.hashtagName}>#{hashtag.name}</Text>
            <Text style={styles.hashtagCount}>{hashtag.postsCount}</Text>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

function ReelGridItem({ reel, onPress, index }: { reel: Reel; onPress: () => void; index: number }) {
  return (
    <Animated.View entering={FadeInUp.delay(index * 30).duration(400)} style={styles.reelGridItem}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t('accessibility.viewReel')}
      >
        <Image
          source={{ uri: reel.thumbnailUrl || reel.videoUrl }}
          style={styles.reelGridThumbnail}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.7)']}
          style={styles.reelGridOverlay}
        >
          <LinearGradient
            colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
            style={styles.playIconBg}
          >
            <Icon name="play" size={12} color="#FFF" />
          </LinearGradient>
          <Text style={styles.reelGridViews}>{reel.viewsCount.toLocaleString()}</Text>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

export default function SearchResultsScreen() {
  const { t, isRTL } = useTranslation();
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
    queryFn: ({ pageParam }) => searchApi.searchPosts(debouncedQuery, pageParam as string | undefined),
    enabled: debouncedQuery.trim().length >= 2 && activeTab === 'posts',
    getNextPageParam: (last) => last.meta?.cursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });

  const threadsQuery = useInfiniteQuery({
    queryKey: ['search-threads', debouncedQuery],
    queryFn: ({ pageParam }) => searchApi.searchThreads(debouncedQuery, pageParam as string | undefined),
    enabled: debouncedQuery.trim().length >= 2 && activeTab === 'threads',
    getNextPageParam: (last) => last.meta?.cursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });

  const reelsQuery = useInfiniteQuery({
    queryKey: ['search-reels', debouncedQuery],
    queryFn: ({ pageParam }) => searchApi.searchReels(debouncedQuery, pageParam as string | undefined),
    enabled: debouncedQuery.trim().length >= 2 && activeTab === 'reels',
    getNextPageParam: (last) => last.meta?.cursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });

  // Hashtags search — hashtagsApi.search returns HashtagInfo[] (not paginated)
  // Use a regular query since this endpoint doesn't support pagination
  const hashtagsQuery = useQuery({
    queryKey: ['search-hashtags', debouncedQuery],
    queryFn: () => hashtagsApi.search(debouncedQuery),
    enabled: debouncedQuery.trim().length >= 2 && activeTab === 'hashtags',
  });

  const people: User[] = combinedSearchQuery.data?.people ?? [];
  const hashtagsFromCombined = combinedSearchQuery.data?.hashtags ?? [];
  const posts = postsQuery.data?.pages.flatMap((p) => p.data) ?? [];
  const threads = threadsQuery.data?.pages.flatMap((p) => p.data) ?? [];
  const reels = reelsQuery.data?.pages.flatMap((p) => p.data) ?? [];
  const hashtags: Hashtag[] = (hashtagsQuery.data ?? hashtagsFromCombined) as Hashtag[];

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
    hashtags: false,
  };

  const hasNextPage = {
    posts: postsQuery.hasNextPage,
    threads: threadsQuery.hasNextPage,
    reels: reelsQuery.hasNextPage,
    hashtags: false,
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
    }
  };

  const handleRefresh = () => {
    switch (activeTab) {
      case 'people':
        combinedSearchQuery.refetch();
        break;
      case 'hashtags':
        hashtagsQuery.refetch();
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

  const isError = {
    people: combinedSearchQuery.isError,
    posts: postsQuery.isError,
    threads: threadsQuery.isError,
    reels: reelsQuery.isError,
    hashtags: hashtagsQuery.isError || combinedSearchQuery.isError,
  };

  const hasError = isError[activeTab];

  const queryClient = useQueryClient();
  const followMutation = useMutation({
    mutationFn: ({ userId, follow }: { userId: string; follow: boolean }) =>
      follow ? followsApi.follow(userId) : followsApi.unfollow(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['search', debouncedQuery] });
    },
  });

  const UserRow = ({ user, onPress, index }: { user: User; onPress: () => void; index: number }) => {
    const handleFollow = () => {
      followMutation.mutate({ userId: user.id, follow: !user.isFollowing });
    };
    return (
      <Animated.View entering={FadeInUp.delay(index * 50).duration(400)}>
        <LinearGradient
          colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
          style={styles.userRow}
        >
          <Pressable
            onPress={onPress}
            style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
            accessibilityRole="button"
            accessibilityLabel={`View profile of ${user.displayName}`}
          >
            <Avatar uri={user.avatarUrl} name={user.displayName} size="md" showOnline />
            <View style={styles.userInfo}>
              <View style={styles.userNameRow}>
                <Text style={styles.userName}>{user.displayName}</Text>
                {user.isVerified && <VerifiedBadge size={13} />}
              </View>
              <Text style={styles.userHandle}>@{user.username}</Text>
              {user._count && (
                <Text style={styles.userFollowers}>{user._count.followers} {t('screens.search-results.followers')}</Text>
              )}
            </View>
          </Pressable>
          {user.isFollowing ? (
            <GradientButton
              label={t('common.following')}
              size="sm"
              variant="secondary"
              onPress={handleFollow}
            />
          ) : (
            <GradientButton
              label={t('common.follow')}
              size="sm"
              onPress={handleFollow}
            />
          )}
        </LinearGradient>
      </Animated.View>
    );
  };

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('screens.search-results.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
        />
        <View style={styles.headerSpacer} />

        {/* Search Box - Glassmorphism */}
        <Animated.View entering={FadeInUp.delay(0).duration(400)} style={styles.searchBoxWrap}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.searchBoxOuter}
          >
            <View style={[styles.searchBox, isFocused && styles.searchBoxFocused]}>
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                style={styles.searchIconBg}
              >
                <Icon name="search" size="xs" color={colors.emerald} />
              </LinearGradient>
              <TextInput
                style={styles.searchInput}
                placeholder={t('screens.search-results.placeholder')}
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
          </LinearGradient>
        </Animated.View>

        <TabSelector
          tabs={[
            { key: 'people', label: t('screens.search-results.tabPeople') },
            { key: 'posts', label: t('screens.search-results.tabPosts') },
            { key: 'threads', label: t('screens.search-results.tabThreads') },
            { key: 'reels', label: t('screens.search-results.tabReels') },
            { key: 'hashtags', label: t('screens.search-results.tabHashtags') },
          ]}
          activeKey={activeTab}
          onTabChange={(key) => setActiveTab(key as SearchTab)}
          variant="underline"
          style={styles.tabSelector}
        />

        {debouncedQuery.trim().length < 2 ? (
          <EmptyState
            icon="search"
            title={t('screens.search-results.enterTerm')}
            subtitle={t('screens.search-results.minChars')}
          />
        ) : hasError ? (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <EmptyState
              icon="flag"
              title={t('screens.search-results.errorTitle')}
              subtitle={t('screens.search-results.errorSubtitle')}
              actionLabel={t('common.retry')}
              onAction={handleRefresh}
            />
          </View>
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
            removeClippedSubviews={true}
                    data={people}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item, index }) => (
                      <UserRow
                        user={item}
                        onPress={() => router.push(`/(screens)/profile/${item.username}`)}
                        index={index}
                      />
                    )}
                    ListEmptyComponent={() => (
                      <EmptyState
                        icon="users"
                        title={t('screens.search-results.noPeople')}
                        subtitle={t('screens.search-results.noPeopleSubtitle')}
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
            removeClippedSubviews={true}
                    data={posts}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => <PostCard post={item} />}
                    ListEmptyComponent={() => (
                      <EmptyState
                        icon="image"
                        title={t('screens.search-results.noPosts')}
                        subtitle={t('screens.search-results.noPostsSubtitle')}
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
            removeClippedSubviews={true}
                    data={threads}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => <ThreadCard thread={item} />}
                    ListEmptyComponent={() => (
                      <EmptyState
                        icon="message-circle"
                        title={t('screens.search-results.noThreads')}
                        subtitle={t('screens.search-results.noThreadsSubtitle')}
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
            removeClippedSubviews={true}
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
            removeClippedSubviews={true}
                    data={reels}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item, index }) => (
                      <ReelGridItem
                        reel={item}
                        onPress={() => router.push(`/(screens)/reel/${item.id}`)}
                        index={index}
                      />
                    )}
                    numColumns={3}
                    columnWrapperStyle={styles.reelGridRow}
                    ListEmptyComponent={() => (
                      <EmptyState
                        icon="video"
                        title={t('screens.search-results.noReels')}
                        subtitle={t('screens.search-results.noReelsSubtitle')}
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
            removeClippedSubviews={true}
                    data={hashtags}
                    keyExtractor={(item) => item.id || `ht-${item.name}`}
                    renderItem={({ item, index }) => (
                      <HashtagRow
                        hashtag={item}
                        onPress={() => router.push(`/(screens)/hashtag/${item.name}`)}
                        index={index}
                      />
                    )}
                    ListEmptyComponent={() => (
                      <EmptyState
                        icon="hash"
                        title={t('screens.search-results.noHashtags')}
                        subtitle={t('screens.search-results.noHashtagsSubtitle')}
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
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  headerSpacer: { height: 100 },
  searchBoxWrap: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
  },
  searchBoxOuter: {
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  searchBox: {
    width: '100%', flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.dark.bgElevated, borderRadius: radius.md,
    paddingHorizontal: spacing.sm, gap: spacing.sm,
    borderWidth: 1, borderColor: 'transparent',
  },
  searchBoxFocused: {
    borderColor: colors.emerald,
    backgroundColor: colors.active.emerald10,
  },
  searchIconBg: {
    width: 32, height: 32, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
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
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: spacing.base,
    marginVertical: spacing.xs,
  },
  userInfo: { flex: 1 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  userName: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  userHandle: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 1 },
  userFollowers: { color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: 2 },
  hashtagRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: spacing.base,
    marginVertical: spacing.xs,
  },
  hashtagIconWrap: {
    width: 40, height: 40, borderRadius: radius.md,
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
  },
  playIconBg: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
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