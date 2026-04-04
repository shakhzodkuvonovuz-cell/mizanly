import { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import {
  View, Text, StyleSheet, Pressable, TextInput,
  FlatList,
} from 'react-native';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useRouter } from 'expo-router';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import { getDateFnsLocale } from '@/utils/localeFormat';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { TabSelector } from '@/components/ui/TabSelector';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { formatCount } from '@/utils/formatCount';
import { colors, spacing, fontSize, radius } from '@/theme';
import { searchApi, postsApi, feedApi } from '@/services/api';
import { PostCard } from '@/components/saf/PostCard';
import { ThreadCard } from '@/components/majlis/ThreadCard';
import type { User, TrendingHashtag, Reel, Video, Channel, Post, Thread, SearchResults } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { rtlFlexRow, rtlTextAlign, rtlArrow } from '@/utils/rtl';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { navigate } from '@/utils/navigation';

const SEARCH_TAB_KEYS = ['people', 'hashtags', 'posts', 'threads', 'reels', 'videos', 'channels'] as const;

type SearchTab = typeof SEARCH_TAB_KEYS[number];

type SearchListItem =
  | { type: 'user'; data: User }
  | { type: 'hashtag'; data: { id: string; name: string; postsCount: number } };

// #region Memoized Row Components
const UserRow = memo(function UserRow({ user, onPress }: { user: User; onPress: () => void }) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { t, isRTL } = useTranslation();
  return (
    <Pressable
      style={[styles.userRow, { flexDirection: rtlFlexRow(isRTL) }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('search.viewProfile', { name: user.displayName })}
    >
      <Avatar uri={user.avatarUrl} name={user.displayName} size="md" showOnline />
      <View style={styles.userInfo}>
        <View style={[styles.userNameRow, { flexDirection: rtlFlexRow(isRTL) }]}>
          <Text style={[styles.userName, { textAlign: rtlTextAlign(isRTL) }]}>{user.displayName}</Text>
          {user.isVerified && <VerifiedBadge size={13} />}
        </View>
        <Text style={[styles.userHandle, { textAlign: rtlTextAlign(isRTL) }]}>@{user.username}</Text>
        {user._count && (
          <Text style={[styles.userFollowers, { textAlign: rtlTextAlign(isRTL) }]}>{formatCount(user._count.followers)} {t('search.followers')}</Text>
        )}
      </View>
      {user.isFollowing ? (
        <Text style={styles.followingLabel}>{t('search.following')}</Text>
      ) : null}
    </Pressable>
  );
});

const VideoRow = memo(function VideoRow({ video, onPress }: { video: Video; onPress: () => void }) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { t, isRTL } = useTranslation();
  const durationMinutes = Math.floor(video.duration / 60);
  const durationSeconds = Math.floor(video.duration % 60);
  const durationText = `${durationMinutes}:${durationSeconds.toString().padStart(2, '0')}`;

  return (
    <Pressable
      style={[styles.videoRow, { flexDirection: rtlFlexRow(isRTL) }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('search.viewVideo', { title: video.title })}
    >
      <ProgressiveImage
        uri={video.thumbnailUrl || video.videoUrl}
        width={120}
        height={80}
        borderRadius={radius.sm}
        contentFit="cover"
      />
      <View style={styles.videoInfo}>
        <Text style={[styles.videoTitle, { textAlign: rtlTextAlign(isRTL) }]} numberOfLines={2}>{video.title}</Text>
        <Text style={[styles.videoChannel, { textAlign: rtlTextAlign(isRTL) }]}>{video.channel?.name || t('common.unknown')}</Text>
        <View style={[styles.videoStats, { flexDirection: rtlFlexRow(isRTL) }]}>
          <Icon name="eye" size={14} color={tc.text.secondary} />
          <Text style={styles.videoStat}>{formatCount(video.viewsCount)} {t('search.views')}</Text>
          <Icon name="clock" size={14} color={tc.text.secondary} />
          <Text style={styles.videoStat}>{durationText}</Text>
        </View>
      </View>
    </Pressable>
  );
});

const ChannelRow = memo(function ChannelRow({ channel, onPress }: { channel: Channel; onPress: () => void }) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { t, isRTL } = useTranslation();
  return (
    <Pressable
      style={[styles.channelRow, { flexDirection: rtlFlexRow(isRTL) }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('search.viewChannel', { name: channel.name })}
    >
      <Avatar uri={channel.avatarUrl} name={channel.name} size="lg" />
      <View style={styles.channelInfo}>
        <View style={[styles.channelNameRow, { flexDirection: rtlFlexRow(isRTL) }]}>
          <Text style={[styles.channelName, { textAlign: rtlTextAlign(isRTL) }]}>{channel.name}</Text>
          {channel.isVerified && <VerifiedBadge size={13} />}
        </View>
        <Text style={[styles.channelHandle, { textAlign: rtlTextAlign(isRTL) }]}>@{channel.handle}</Text>
        <View style={[styles.channelStats, { flexDirection: rtlFlexRow(isRTL) }]}>
          <Text style={styles.channelStat}>{formatCount(channel.subscribersCount)} {t('search.subscribers')}</Text>
          <Text style={styles.channelStat}>•</Text>
          <Text style={styles.channelStat}>{formatCount(channel.videosCount)} {t('search.videosCount')}</Text>
        </View>
      </View>
    </Pressable>
  );
});

// #endregion

// #region SearchScreen — Main Screen Component
export default function SearchScreen() {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const router = useRouter();
  const haptic = useContextualHaptic();
  const { t, isRTL } = useTranslation();

  const SEARCH_TABS = [
    { key: 'people' as const, label: t('search.people') },
    { key: 'hashtags' as const, label: t('search.hashtags') },
    { key: 'posts' as const, label: t('search.posts') },
    { key: 'threads' as const, label: t('search.threads') },
    { key: 'reels' as const, label: t('search.reels') },
    { key: 'videos' as const, label: t('search.videos') },
    { key: 'channels' as const, label: t('search.channels') },
  ];
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [activeTab, setActiveTab] = useState<SearchTab>('people');
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  useEffect(() => {
    const loadHistory = async () => {
      const stored = await AsyncStorage.getItem('search-history');
      if (stored) {
        try {
          setSearchHistory(JSON.parse(stored));
        } catch (e) {
          // ignore
        }
      }
    };
    loadHistory();
  }, []);

  const addSearchToHistory = useCallback(async (term: string) => {
    if (term.trim().length < 2) return;
    const stored = await AsyncStorage.getItem('search-history');
    let history: string[] = [];
    try { history = stored ? JSON.parse(stored) : []; } catch { /* corrupted */ }
    const updated = [term, ...history.filter((h: string) => h !== term)].slice(0, 20);
    await AsyncStorage.setItem('search-history', JSON.stringify(updated)).catch(() => {});
    setSearchHistory(updated);
  }, []);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(text), 400);
  };

  const handleSearchSubmit = () => {
    if (query.trim().length >= 2) {
      addSearchToHistory(query.trim());
    }
  };

  const searchQuery = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: () => searchApi.search(debouncedQuery),
    enabled: debouncedQuery.trim().length >= 2,
  });

  const trendingQuery = useQuery({
    queryKey: ['trending'],
    queryFn: () => searchApi.trending(),
    enabled: debouncedQuery.trim().length < 2,
  });

  const postsQuery = useInfiniteQuery({
    queryKey: ['search-posts', debouncedQuery],
    queryFn: ({ pageParam }) => searchApi.search(debouncedQuery, 'posts', pageParam as string | undefined),
    enabled: !!debouncedQuery && activeTab === 'posts',
    getNextPageParam: (last) => last.meta?.cursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });

  const threadsQuery = useInfiniteQuery({
    queryKey: ['search-threads', debouncedQuery],
    queryFn: ({ pageParam }) => searchApi.search(debouncedQuery, 'threads', pageParam as string | undefined),
    enabled: !!debouncedQuery && activeTab === 'threads',
    getNextPageParam: (last) => last.meta?.cursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });

  const reelsQuery = useInfiniteQuery({
    queryKey: ['search-reels', debouncedQuery],
    queryFn: ({ pageParam }) => searchApi.search(debouncedQuery, 'reels', pageParam as string | undefined),
    enabled: !!debouncedQuery && activeTab === 'reels',
    getNextPageParam: (last) => last.meta?.cursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });

  const videosQuery = useInfiniteQuery({
    queryKey: ['search-videos', debouncedQuery],
    queryFn: ({ pageParam }) => searchApi.search(debouncedQuery, 'videos', pageParam as string | undefined),
    enabled: !!debouncedQuery && activeTab === 'videos',
    getNextPageParam: (last) => last.meta?.cursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });

  const channelsQuery = useInfiniteQuery({
    queryKey: ['search-channels', debouncedQuery],
    queryFn: ({ pageParam }) => searchApi.search(debouncedQuery, 'channels', pageParam as string | undefined),
    enabled: !!debouncedQuery && activeTab === 'channels',
    getNextPageParam: (last) => last.meta?.cursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });

  const showExplore = query.length === 0 && !isFocused;
  const exploreQuery = useInfiniteQuery({
    queryKey: ['explore-trending'],
    queryFn: ({ pageParam }) => feedApi.getTrending(pageParam as string | undefined),
    enabled: showExplore,
    staleTime: 30_000,
    getNextPageParam: (last) => last.meta?.cursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });

  const explorePosts = exploreQuery.data?.pages.flatMap((p) => p.data) ?? [];
  const posts: Post[] = postsQuery.data?.pages.flatMap((p) => (p.data as Post[] | undefined) ?? (p as unknown as { posts?: Post[] }).posts ?? []) ?? [];
  const threads: Thread[] = threadsQuery.data?.pages.flatMap((p) => (p.data as Thread[] | undefined) ?? (p as unknown as { threads?: Thread[] }).threads ?? []) ?? [];
  const reels: Reel[] = reelsQuery.data?.pages.flatMap((p) => (p.data as Reel[] | undefined) ?? (p as unknown as { reels?: Reel[] }).reels ?? []) ?? [];
  const videos: Video[] = videosQuery.data?.pages.flatMap((p) => (p.data as Video[] | undefined) ?? (p as unknown as { videos?: Video[] }).videos ?? []) ?? [];
  const channels: Channel[] = channelsQuery.data?.pages.flatMap((p) => (p.data as Channel[] | undefined) ?? (p as unknown as { channels?: Channel[] }).channels ?? []) ?? [];
  const people: User[] = searchQuery.data?.people ?? [];
  const hashtags = searchQuery.data?.hashtags ?? [];
  const trending: TrendingHashtag[] = trendingQuery.data ?? [];
  const isSearching = debouncedQuery.trim().length >= 2;
  const showHistory = query.length === 0 && isFocused;

  const postsSearchEmpty = useMemo(() => (
    <EmptyState
      icon="search"
      title={t('search.noResultsFor', { type: t('search.posts'), query: debouncedQuery })}
      subtitle={t('search.tryDifferent')}
    />
  ), [t, debouncedQuery]);

  const threadsSearchEmpty = useMemo(() => (
    <EmptyState
      icon="search"
      title={t('search.noResultsFor', { type: t('search.threads'), query: debouncedQuery })}
      subtitle={t('search.tryDifferent')}
    />
  ), [t, debouncedQuery]);

  const reelsSearchEmpty = useMemo(() => (
    <EmptyState
      icon="video"
      title={t('search.noResultsFor', { type: t('search.reels'), query: debouncedQuery })}
      subtitle={t('search.tryDifferent')}
    />
  ), [t, debouncedQuery]);

  const videosSearchEmpty = useMemo(() => (
    <EmptyState
      icon="video"
      title={t('search.noResultsFor', { type: t('search.videos'), query: debouncedQuery })}
      subtitle={t('search.tryDifferent')}
    />
  ), [t, debouncedQuery]);

  const channelsSearchEmpty = useMemo(() => (
    <EmptyState
      icon="users"
      title={t('search.noResultsFor', { type: t('search.channels'), query: debouncedQuery })}
      subtitle={t('search.tryDifferent')}
    />
  ), [t, debouncedQuery]);

  const generalSearchEmpty = useMemo(() => (
    <EmptyState
      icon="search"
      title={t('search.noResultsFor', { type: activeTab === 'people' ? t('search.people') : t('search.hashtags'), query: debouncedQuery })}
      subtitle={t('search.tryDifferent')}
    />
  ), [t, activeTab, debouncedQuery]);

  const renderPostItem = useCallback(({ item }: { item: Post }) => <PostCard post={item} />, []);
  const renderThreadItem = useCallback(({ item }: { item: Thread }) => <ThreadCard thread={item} />, []);
  const renderReelItem = useCallback(({ item }: { item: Reel }) => (
        <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('accessibility.viewReel')}
      style={styles.reelRow}
      onPress={() => { haptic.navigate(); router.push(`/(screens)/reel/${item.id}`); }}
    >
      <ProgressiveImage uri={item.thumbnailUrl || item.videoUrl} width={110} height={190} borderRadius={radius.sm} contentFit="cover" />
      <View style={styles.reelInfo}>
        <Text style={styles.reelCaption} numberOfLines={2}>{item.caption || t('search.noCaption')}</Text>
        <View style={styles.reelStats}>
          <Icon name="heart" size={14} color={tc.text.secondary} /><Text style={styles.reelStat}>{formatCount(item.likesCount)}</Text>
          <Icon name="message-circle" size={14} color={tc.text.secondary} /><Text style={styles.reelStat}>{formatCount(item.commentsCount)}</Text>
          <Icon name="eye" size={14} color={tc.text.secondary} /><Text style={styles.reelStat}>{formatCount(item.viewsCount)}</Text>
        </View>
        <View style={styles.reelUser}>
          <Avatar uri={item.user.avatarUrl} name={item.user.username} size="xs" showRing={false} />
          <Text style={styles.reelUsername}>@{item.user.username}</Text>
        </View>
      </View>
    </Pressable>
  ), [haptic, router, tc.text.secondary, t]);
  const renderVideoItem = useCallback(({ item }: { item: Video }) => <VideoRow video={item} onPress={() => router.push(`/(screens)/video/${item.id}`)} />, [router]);
  const renderChannelItem = useCallback(({ item }: { item: Channel }) => <ChannelRow channel={item} onPress={() => router.push(`/(screens)/channel/${item.handle}`)} />, [router]);
  const renderSearchListItem = useCallback(({ item }: { item: SearchListItem }) => {
    if (item.type === 'user') return <UserRow user={item.data} onPress={() => { haptic.navigate(); router.push(`/(screens)/profile/${item.data.username}`); }} />;
    return (
      <Pressable style={[styles.hashtagRow, { flexDirection: rtlFlexRow(isRTL) }]} onPress={() => { haptic.navigate(); router.push(`/(screens)/hashtag/${item.data.name}`); }} accessibilityRole="button" accessibilityLabel={t('search.viewHashtag', { name: item.data.name })}>
        <View style={styles.hashtagIconWrap}><Icon name="hash" size="sm" color={colors.emerald} /></View>
        <View><Text style={[styles.hashtagName, { textAlign: rtlTextAlign(isRTL) }]}>#{item.data.name}</Text><Text style={[styles.hashtagCount, { textAlign: rtlTextAlign(isRTL) }]}>{item.data.postsCount} {t('search.posts')}</Text></View>
      </Pressable>
    );
  }, [haptic, router, isRTL, t]);
  const renderHistoryItem = useCallback(({ item }: { item: string }) => (
    <View style={[styles.historyItem, { flexDirection: rtlFlexRow(isRTL) }]}>
      <Pressable style={[styles.historyText, { flexDirection: rtlFlexRow(isRTL) }]} onPress={() => { setQuery(item); setDebouncedQuery(item); }} accessibilityRole="button" accessibilityLabel={t('search.searchFor', { term: item })}>
        <Icon name="clock" size={16} color={tc.text.secondary} /><Text style={styles.historyTerm}>{item}</Text>
      </Pressable>
            <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('accessibility.clearSearchInput')}
        onPress={() => { haptic.delete(); const updated = searchHistory.filter(h => h !== item); setSearchHistory(updated); AsyncStorage.setItem('search-history', JSON.stringify(updated)).catch(() => {}); }}
        hitSlop={8}
      >
        <Icon name="x" size={16} color={tc.text.tertiary} />
      </Pressable>
    </View>
  ), [isRTL, haptic, searchHistory, tc.text.secondary, tc.text.tertiary, t]);
  const renderExploreItem = useCallback(({ item }: { item: Post }) => (
    <Pressable style={styles.exploreItem} onPress={() => navigate(`/(screens)/post/${item.id}`)} accessibilityRole="button" accessibilityLabel={t('accessibility.viewPost')}>
      {item.mediaUrls[0] ? <ProgressiveImage uri={item.mediaUrls[0]} width={120} height={120} borderRadius={radius.md} contentFit="cover" /> : <View style={[styles.exploreImage, { backgroundColor: tc.bgElevated }]}><Icon name="image" size={24} color={tc.text.tertiary} /></View>}
      {item.postType === 'VIDEO' && <View style={styles.videoOverlay}><Icon name="play" size={14} color={tc.text.primary} /></View>}
    </Pressable>
  ), [tc.bgElevated, tc.text.tertiary, tc.text.primary, t]);

  return (
    <ScreenErrorBoundary>
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { flexDirection: rtlFlexRow(isRTL) }]}>
                <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('accessibility.navigateBack')}
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.backBtn}
        >
          <Icon name={rtlArrow(isRTL, 'back')} size="md" color={tc.text.primary} />
        </Pressable>
        <View style={[styles.searchBox, isFocused && styles.searchBoxFocused, { flexDirection: rtlFlexRow(isRTL) }]}>
          <Icon name="search" size="xs" color={tc.text.tertiary} />
          <TextInput
            style={[styles.searchInput, { textAlign: rtlTextAlign(isRTL) }]}
            placeholder={t('search.placeholder')}
            placeholderTextColor={tc.text.tertiary}
            value={query}
            onChangeText={handleQueryChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={handleSearchSubmit}
          />
          {query.length > 0 && (
                        <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('accessibility.clearSearchInput')}
              onPress={() => { setQuery(''); setDebouncedQuery(''); }}
              hitSlop={8}
            >
              <Icon name="x" size="xs" color={tc.text.secondary} />
            </Pressable>
          )}
        </View>
      </View>

      {isSearching && (
        <Animated.View entering={FadeInUp.duration(200)}>
          <TabSelector
            tabs={SEARCH_TABS.map((tab) => ({ key: tab.key, label: tab.label }))}
            activeKey={activeTab}
            onTabChange={(k) => setActiveTab(k as SearchTab)}
          />
        </Animated.View>
      )}

      {searchQuery.isLoading ? (
        <View style={styles.skeletonList}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={[styles.skeletonRow, { flexDirection: rtlFlexRow(isRTL) }]}>
              <Skeleton.Circle size={40} />
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton.Rect width={120} height={14} />
                <Skeleton.Rect width={80} height={11} />
              </View>
            </View>
          ))}
        </View>
      ) : searchQuery.isError ? (
        <EmptyState
          icon="flag"
          title={t('search.searchFailed')}
          subtitle={t('search.checkConnection')}
          actionLabel={t('common.retry')}
          onAction={() => searchQuery.refetch()}
        />
      ) : isSearching ? (
        <>
          {(activeTab === 'posts' || activeTab === 'threads' || activeTab === 'reels' || activeTab === 'videos' || activeTab === 'channels') ? (
            <>
              {activeTab === 'posts' ? (
                <>
                  {postsQuery.isLoading ? (
                    <View style={styles.skeletonList}>
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton.PostCard key={i} />
                      ))}
                    </View>
                  ) : (
                    <FlatList
          removeClippedSubviews={true}
          windowSize={7}
          maxToRenderPerBatch={8}
                      data={posts}
                      keyExtractor={(item) => item.id}
                      renderItem={renderPostItem}
                      ListEmptyComponent={postsSearchEmpty}
                      onEndReached={() => {
                        if (postsQuery.hasNextPage && !postsQuery.isFetchingNextPage) {
                          postsQuery.fetchNextPage();
                        }
                      }}
                      onEndReachedThreshold={0.5}
                      contentContainerStyle={{ paddingBottom: 40 }}
                      refreshControl={
                        <BrandedRefreshControl
                          refreshing={postsQuery.isRefetching}
                          onRefresh={() => postsQuery.refetch()}
                        />
                      }
                    />
                  )}
                </>
              ) : activeTab === 'threads' ? (
                <>
                  {threadsQuery.isLoading ? (
                    <View style={styles.skeletonList}>
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton.ThreadCard key={i} />
                      ))}
                    </View>
                  ) : (
                    <FlatList
          removeClippedSubviews={true}
          windowSize={7}
          maxToRenderPerBatch={8}
                      data={threads}
                      keyExtractor={(item) => item.id}
                      renderItem={renderThreadItem}
                      ListEmptyComponent={threadsSearchEmpty}
                      onEndReached={() => {
                        if (threadsQuery.hasNextPage && !threadsQuery.isFetchingNextPage) {
                          threadsQuery.fetchNextPage();
                        }
                      }}
                      onEndReachedThreshold={0.5}
                      contentContainerStyle={{ paddingBottom: 40 }}
                      refreshControl={
                        <BrandedRefreshControl
                          refreshing={threadsQuery.isRefetching}
                          onRefresh={() => threadsQuery.refetch()}
                        />
                      }
                    />
                  )}
                </>
              ) : activeTab === 'reels' ? (
                <>
                  {reelsQuery.isLoading ? (
                    <View style={styles.skeletonList}>
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton.Rect key={i} width={120} height={160} />
                      ))}
                    </View>
                  ) : (
                    <FlatList
          removeClippedSubviews={true}
          windowSize={7}
          maxToRenderPerBatch={8}
                      data={reels}
                      keyExtractor={(item) => item.id}
                      renderItem={renderReelItem}
                      ListEmptyComponent={reelsSearchEmpty}
                      onEndReached={() => {
                        if (reelsQuery.hasNextPage && !reelsQuery.isFetchingNextPage) {
                          reelsQuery.fetchNextPage();
                        }
                      }}
                      onEndReachedThreshold={0.5}
                      contentContainerStyle={{ paddingBottom: 40 }}
                      refreshControl={
                        <BrandedRefreshControl
                          refreshing={reelsQuery.isRefetching}
                          onRefresh={() => reelsQuery.refetch()}
                        />
                      }
                    />
                  )}
                </>
              ) : activeTab === 'videos' ? (
                <>
                  {videosQuery.isLoading ? (
                    <View style={styles.skeletonList}>
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton.Rect key={i} width={120} height={90} />
                      ))}
                    </View>
                  ) : (
                    <FlatList
          removeClippedSubviews={true}
          windowSize={7}
          maxToRenderPerBatch={8}
                      data={videos}
                      keyExtractor={(item) => item.id}
                      renderItem={renderVideoItem}
                      ListEmptyComponent={videosSearchEmpty}
                      onEndReached={() => {
                        if (videosQuery.hasNextPage && !videosQuery.isFetchingNextPage) {
                          videosQuery.fetchNextPage();
                        }
                      }}
                      onEndReachedThreshold={0.5}
                      contentContainerStyle={{ paddingBottom: 40 }}
                      refreshControl={
                        <BrandedRefreshControl
                          refreshing={videosQuery.isRefetching}
                          onRefresh={() => videosQuery.refetch()}
                        />
                      }
                    />
                  )}
                </>
              ) : activeTab === 'channels' ? (
                <>
                  {channelsQuery.isLoading ? (
                    <View style={styles.skeletonList}>
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton.Rect key={i} width={120} height={60} />
                      ))}
                    </View>
                  ) : (
                    <FlatList
          removeClippedSubviews={true}
          windowSize={7}
          maxToRenderPerBatch={8}
                      data={channels}
                      keyExtractor={(item) => item.id}
                      renderItem={renderChannelItem}
                      ListEmptyComponent={channelsSearchEmpty}
                      onEndReached={() => {
                        if (channelsQuery.hasNextPage && !channelsQuery.isFetchingNextPage) {
                          channelsQuery.fetchNextPage();
                        }
                      }}
                      onEndReachedThreshold={0.5}
                      contentContainerStyle={{ paddingBottom: 40 }}
                      refreshControl={
                        <BrandedRefreshControl
                          refreshing={channelsQuery.isRefetching}
                          onRefresh={() => channelsQuery.refetch()}
                        />
                      }
                    />
                  )}
                </>
              ) : null
            }
            </>
          ) : (
            <FlatList<SearchListItem>
          removeClippedSubviews={true}
          windowSize={7}
          maxToRenderPerBatch={8}
              data={
                activeTab === 'people'
                  ? people.map((p): SearchListItem => ({ type: 'user', data: p }))
                  : hashtags.map((h): SearchListItem => ({ type: 'hashtag', data: h }))
              }
              keyExtractor={(item, i) => item.type === 'user' ? item.data.id : `ht-${i}`}
              renderItem={renderSearchListItem}
              ListEmptyComponent={generalSearchEmpty}
              contentContainerStyle={{ paddingBottom: 40 }}
            />
          )}
        </>
      ) : showHistory ? (
        <View style={styles.historySection}>
          <Text style={[styles.historyTitle, { textAlign: rtlTextAlign(isRTL) }]}>{t('search.recentSearches')}</Text>
          {searchHistory.length > 0 ? (
            <>
              <FlatList
          removeClippedSubviews={true}
          windowSize={7}
          maxToRenderPerBatch={8}
                data={searchHistory}
                keyExtractor={(item, i) => `history-${i}`}
                renderItem={renderHistoryItem}
                contentContainerStyle={{ paddingBottom: spacing.lg }}
              />
              <Pressable
                onPress={() => {
                  haptic.delete();
                  setSearchHistory([]);
                  AsyncStorage.setItem('search-history', JSON.stringify([])).catch(() => {});
                }}
                style={styles.clearButton}
                accessibilityRole="button"
                accessibilityLabel={t('search.clearAll')}
              >
                <Text style={styles.clearButtonText}>{t('search.clearAll')}</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.historyEmpty}>{t('search.noRecentSearches')}</Text>
          )}
        </View>
      ) : (
        showExplore ? (
          <View style={styles.exploreSection}>
            <FlatList
          removeClippedSubviews={true}
          windowSize={7}
          maxToRenderPerBatch={8}
              data={explorePosts}
              numColumns={3}
              keyExtractor={(item) => item.id}
              renderItem={renderExploreItem}
              onEndReached={() => {
                if (exploreQuery.hasNextPage && !exploreQuery.isFetchingNextPage) {
                  exploreQuery.fetchNextPage();
                }
              }}
              onEndReachedThreshold={0.5}
              contentContainerStyle={styles.exploreGrid}
              refreshControl={
                <BrandedRefreshControl
                  refreshing={exploreQuery.isRefetching}
                  onRefresh={() => exploreQuery.refetch()}
                />
              }
            />
          </View>
        ) : (
          <View style={styles.discoverSection}>
            <Text style={[styles.discoverTitle, { textAlign: rtlTextAlign(isRTL) }]}>{t('search.trending')}</Text>
            {trending.length > 0 ? (
              <View style={styles.trendingList}>
                {trending.map((item, i) => (
                  <Pressable
                    accessibilityLabel={t('accessibility.viewHashtag')}
                    accessibilityRole="button"
                    key={i}
                    style={[styles.trendingItem, { flexDirection: rtlFlexRow(isRTL) }]}
                    onPress={() => {
                      haptic.navigate();
                      if (item.name) router.push(`/(screens)/hashtag/${item.name}`);
                    }}
                  >
                    <Text style={styles.trendRank}>{i + 1}</Text>
                    <View style={styles.trendingItemContent}>
                      <Text style={[styles.trendName, { textAlign: rtlTextAlign(isRTL) }]}>#{item.name}</Text>
                      <Text style={[styles.trendCount, { textAlign: rtlTextAlign(isRTL) }]}>{formatCount(item.postsCount)} {t('search.posts')}</Text>
                    </View>
                    <Icon name="trending-up" size={16} color={colors.emerald} />
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={styles.discoverSub}>{t('search.searchForPeopleAndTopics')}</Text>
            )}
          </View>
        )
      )}
    </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm, gap: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: tc.border,
  },
  backBtn: { width: 36 },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: tc.bgElevated, borderRadius: radius.md,
    paddingHorizontal: spacing.sm, gap: spacing.xs,
    borderWidth: 1, borderColor: 'transparent',
  },
  searchBoxFocused: {
    borderColor: colors.emerald,
    backgroundColor: colors.active.emerald10,
  },
  searchInput: {
    flex: 1, color: tc.text.primary, fontSize: fontSize.base,
    paddingVertical: spacing.sm,
  },

  skeletonList: { padding: spacing.base, gap: spacing.md },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },

  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: tc.border,
  },
  userInfo: { flex: 1 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  userName: { color: tc.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  userHandle: { color: tc.text.secondary, fontSize: fontSize.sm, marginTop: 1 },
  userFollowers: { color: tc.text.tertiary, fontSize: fontSize.xs, marginTop: 2 },
  followingLabel: { color: tc.text.secondary, fontSize: fontSize.xs, fontWeight: '600' },

  hashtagRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: tc.border,
  },
  hashtagIconWrap: {
    width: 40, height: 40, borderRadius: radius.full,
    backgroundColor: colors.active.emerald10,
    alignItems: 'center', justifyContent: 'center',
  },
  hashtagName: { color: tc.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  hashtagCount: { color: tc.text.secondary, fontSize: fontSize.sm, marginTop: 2 },

  discoverSection: { paddingHorizontal: spacing.base, paddingTop: spacing['2xl'] },
  discoverTitle: {
    color: tc.text.primary, fontSize: fontSize.lg, fontWeight: '700',
    marginBottom: spacing.md,
  },
  discoverSub: { color: tc.text.secondary, fontSize: fontSize.base },
  trendingList: { gap: spacing.xs },
  trendingItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: tc.border,
  },
  trendingItemContent: { flex: 1 },
  trendRank: {
    color: tc.text.tertiary, fontSize: fontSize.lg, fontWeight: '700',
    width: 28, textAlign: 'center',
  },
  trendName: { color: tc.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  trendCount: { color: tc.text.secondary, fontSize: fontSize.sm, marginTop: 2 },
  historySection: { paddingHorizontal: spacing.base, paddingTop: spacing['2xl'] },
  historyTitle: {
    color: tc.text.primary, fontSize: fontSize.lg, fontWeight: '700',
    marginBottom: spacing.md,
  },
  historyItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: tc.border,
  },
  historyText: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    flex: 1,
  },
  historyTerm: { color: tc.text.primary, fontSize: fontSize.base },
  historyEmpty: { color: tc.text.secondary, fontSize: fontSize.base, textAlign: 'center', paddingVertical: spacing['2xl'] },
  clearButton: {
    backgroundColor: tc.bgElevated,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.base,
  },
  clearButtonText: { color: tc.text.secondary, fontSize: fontSize.base, fontWeight: '600' },
  exploreSection: {
    flex: 1,
    paddingTop: spacing.md,
  },
  exploreGrid: {
    gap: 2,
    paddingBottom: 40,
  },
  exploreItem: {
    flex: 1,
    aspectRatio: 1,
    overflow: 'hidden' as const,
    backgroundColor: tc.bgElevated,
    margin: 1,
  },
  exploreImage: {
    width: '100%',
    height: '100%',
  },
  videoOverlay: {
    position: 'absolute' as const,
    bottom: spacing.xs,
    end: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: radius.sm,
    padding: spacing.xs,
  },
  reelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: tc.border,
  },
  reelThumbnail: {
    width: 80,
    height: 80,
    borderRadius: radius.md,
    backgroundColor: tc.bgElevated,
  },
  reelInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  reelCaption: {
    color: tc.text.primary,
    fontSize: fontSize.base,
  },
  reelStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  reelStat: {
    color: tc.text.secondary,
    fontSize: fontSize.sm,
    marginEnd: spacing.sm,
  },
  reelUser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  reelUsername: {
    color: tc.text.secondary,
    fontSize: fontSize.sm,
  },
  videoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: tc.border,
  },
  videoThumbnail: {
    width: 80,
    height: 80,
    borderRadius: radius.md,
    backgroundColor: tc.bgElevated,
  },
  videoInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  videoTitle: {
    color: tc.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  videoChannel: {
    color: tc.text.secondary,
    fontSize: fontSize.sm,
  },
  videoStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  videoStat: {
    color: tc.text.secondary,
    fontSize: fontSize.sm,
    marginEnd: spacing.sm,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: tc.border,
  },
  channelInfo: {
    flex: 1,
  },
  channelNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  channelName: {
    color: tc.text.primary,
    fontSize: fontSize.base,
    fontWeight: '700',
  },
  channelHandle: {
    color: tc.text.secondary,
    fontSize: fontSize.sm,
    marginTop: 1,
  },
  channelStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  channelStat: {
    color: tc.text.secondary,
    fontSize: fontSize.sm,
  },
});
