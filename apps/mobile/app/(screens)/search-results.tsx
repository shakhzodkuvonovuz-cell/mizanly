import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput,
  FlatList,
} from 'react-native';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { formatCount } from '@/utils/formatCount';
import { colors, spacing, fontSize, radius } from '@/theme';
import { searchApi, hashtagsApi, followsApi } from '@/services/api';
import type { User, Post, Thread, Reel } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

type Hashtag = { id: string; name: string; postsCount: number };

type SearchTab = 'people' | 'posts' | 'threads' | 'reels' | 'hashtags';


function HashtagRow({ hashtag, onPress, index }: { hashtag: Hashtag; onPress: () => void; index: number }) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { t } = useTranslation();
  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index * 50, 500)).duration(400)}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t('accessibility.viewHashtag', { name: hashtag.name })}
      >
        <LinearGradient
          colors={colors.gradient.cardDark}
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
            <Text style={styles.hashtagCount}>{formatCount(hashtag.postsCount)} {t('common.posts')}</Text>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

function ReelGridItem({ reel, onPress, index }: { reel: Reel; onPress: () => void; index: number }) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { t } = useTranslation();
  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index * 30, 500)).duration(400)} style={styles.reelGridItem}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t('accessibility.viewReel')}
      >
        <ProgressiveImage
          uri={reel.thumbnailUrl || reel.videoUrl}
          width="100%"
          height={200}
          contentFit="cover"
          style={{ width: '100%', height: '100%' }}
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
          <Text style={styles.reelGridViews}>{formatCount(reel.viewsCount)}</Text>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

function UserRow({ user, onPress, index, onFollow }: { user: User; onPress: () => void; index: number; onFollow: (userId: string, follow: boolean) => void }) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { t } = useTranslation();
  const handleFollow = () => {
    onFollow(user.id, !user.isFollowing);
  };
  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index * 50, 500)).duration(400)}>
      <LinearGradient
        colors={colors.gradient.cardDark}
        style={styles.userRow}
      >
        <Pressable
          onPress={onPress}
          style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
          accessibilityRole="button"
          accessibilityLabel={t('accessibility.viewProfile', { name: user.displayName })}
        >
          <Avatar uri={user.avatarUrl} name={user.displayName} size="md" showOnline />
          <View style={styles.userInfo}>
            <View style={styles.userNameRow}>
              <Text style={styles.userName}>{user.displayName}</Text>
              {user.isVerified && <VerifiedBadge size={13} />}
            </View>
            <Text style={styles.userHandle}>@{user.username}</Text>
            {user._count && (
              <Text style={styles.userFollowers}>{formatCount(user._count.followers)} {t('screens.search-results.followers')}</Text>
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
}

export default function SearchResultsScreen() {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { t, isRTL } = useTranslation();
  const router = useRouter();
  const haptic = useContextualHaptic();
  const insets = useSafeAreaInsets();
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
  const followLockRef = useRef(false);
  const followMutation = useMutation({
    mutationFn: ({ userId, follow }: { userId: string; follow: boolean }) =>
      follow ? followsApi.follow(userId) : followsApi.unfollow(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['search', debouncedQuery] });
    },
    onSettled: () => { followLockRef.current = false; },
  });

  const peopleListEmpty = useMemo(() => (
    <EmptyState
      icon="users"
      title={t('screens.search-results.noPeople')}
      subtitle={t('screens.search-results.noPeopleSubtitle')}
    />
  ), [t]);

  const postsListEmpty = useMemo(() => (
    <EmptyState
      icon="image"
      title={t('screens.search-results.noPosts')}
      subtitle={t('screens.search-results.noPostsSubtitle')}
    />
  ), [t]);

  const threadsListEmpty = useMemo(() => (
    <EmptyState
      icon="message-circle"
      title={t('screens.search-results.noThreads')}
      subtitle={t('screens.search-results.noThreadsSubtitle')}
    />
  ), [t]);

  const reelsListEmpty = useMemo(() => (
    <EmptyState
      icon="video"
      title={t('screens.search-results.noReels')}
      subtitle={t('screens.search-results.noReelsSubtitle')}
    />
  ), [t]);

  const hashtagsListEmpty = useMemo(() => (
    <EmptyState
      icon="hash"
      title={t('screens.search-results.noHashtags')}
      subtitle={t('screens.search-results.noHashtagsSubtitle')}
    />
  ), [t]);

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('screens.search-results.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
        />
        <View style={{ height: insets.top + 52 }} />

        {/* Search Box - Glassmorphism */}
        <Animated.View entering={FadeInUp.delay(0).duration(400)} style={styles.searchBoxWrap}>
          <LinearGradient
            colors={colors.gradient.cardDark}
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
                placeholderTextColor={tc.text.tertiary}
                value={query}
                onChangeText={handleQueryChange}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {query.length > 0 && (
                <Pressable onPress={() => { haptic.tick(); setQuery(''); setDebouncedQuery(''); }} hitSlop={8}>
                  <Icon name="x" size="xs" color={tc.text.secondary} />
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
                    renderItem={useCallback(({ item, index }) => (
                      <UserRow
                        user={item}
                        onPress={() => router.push(`/(screens)/profile/${item.username}`)}
                        index={index}
                        onFollow={(userId, follow) => followMutation.mutate({ userId, follow })}
                      />
                    ), [])}
                    ListEmptyComponent={peopleListEmpty}
                    contentContainerStyle={{ paddingBottom: 40 }}
                    refreshControl={
                      <BrandedRefreshControl
                        refreshing={isRefreshing.people}
                        onRefresh={handleRefresh}
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
                    renderItem={useCallback(({ item }) => <PostCard post={item} />, [])}
                    ListEmptyComponent={postsListEmpty}
                    onEndReached={handleFetchNextPage}
                    onEndReachedThreshold={0.5}
                    contentContainerStyle={{ paddingBottom: 40 }}
                    refreshControl={
                      <BrandedRefreshControl
                        refreshing={isRefreshing.posts}
                        onRefresh={handleRefresh}
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
                    renderItem={useCallback(({ item }) => <ThreadCard thread={item} />, [])}
                    ListEmptyComponent={threadsListEmpty}
                    onEndReached={handleFetchNextPage}
                    onEndReachedThreshold={0.5}
                    contentContainerStyle={{ paddingBottom: 40 }}
                    refreshControl={
                      <BrandedRefreshControl
                        refreshing={isRefreshing.threads}
                        onRefresh={handleRefresh}
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
                    renderItem={useCallback(() => (
                      <Skeleton.Rect width={120} height={160} />
                    ), [])}
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
                    renderItem={useCallback(({ item, index }) => (
                      <ReelGridItem
                        reel={item}
                        onPress={() => router.push(`/(screens)/reel/${item.id}`)}
                        index={index}
                      />
                    ), [])}
                    numColumns={3}
                    columnWrapperStyle={styles.reelGridRow}
                    ListEmptyComponent={reelsListEmpty}
                    onEndReached={handleFetchNextPage}
                    onEndReachedThreshold={0.5}
                    contentContainerStyle={{ paddingBottom: 40 }}
                    refreshControl={
                      <BrandedRefreshControl
                        refreshing={isRefreshing.reels}
                        onRefresh={handleRefresh}
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
                    renderItem={useCallback(({ item, index }) => (
                      <HashtagRow
                        hashtag={item}
                        onPress={() => router.push(`/(screens)/hashtag/${item.name}`)}
                        index={index}
                      />
                    ), [])}
                    ListEmptyComponent={hashtagsListEmpty}
                    onEndReached={handleFetchNextPage}
                    onEndReachedThreshold={0.5}
                    contentContainerStyle={{ paddingBottom: 40 }}
                    refreshControl={
                      <BrandedRefreshControl
                        refreshing={isRefreshing.hashtags}
                        onRefresh={handleRefresh}
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

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc.bg },
  searchBoxWrap: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
  },
  searchBoxOuter: {
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  searchBox: {
    width: '100%', flexDirection: 'row', alignItems: 'center',
    backgroundColor: tc.bgElevated, borderRadius: radius.md,
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
    flex: 1, color: tc.text.primary, fontSize: fontSize.base,
    paddingVertical: spacing.sm,
  },
  tabSelector: {
    borderBottomWidth: 0.5, borderBottomColor: tc.border,
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
    borderWidth: 1, borderColor: colors.active.white6,
    marginHorizontal: spacing.base,
    marginVertical: spacing.xs,
  },
  userInfo: { flex: 1 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  userName: { color: tc.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  userHandle: { color: tc.text.secondary, fontSize: fontSize.sm, marginTop: 1 },
  userFollowers: { color: tc.text.tertiary, fontSize: fontSize.xs, marginTop: 2 },
  hashtagRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.active.white6,
    marginHorizontal: spacing.base,
    marginVertical: spacing.xs,
  },
  hashtagIconWrap: {
    width: 40, height: 40, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  hashtagName: { color: tc.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  hashtagCount: { color: tc.text.secondary, fontSize: fontSize.sm, marginTop: 2 },
  reelGridItem: {
    flex: 1,
    aspectRatio: 0.75,
    margin: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: tc.bgElevated,
  },
  reelGridThumbnail: {
    width: '100%',
    height: '100%',
  },
  reelGridOverlay: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
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
    color: tc.text.primary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  reelGridRow: {
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    marginBottom: 2,
  },
});