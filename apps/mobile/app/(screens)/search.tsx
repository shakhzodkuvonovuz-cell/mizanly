import { useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, StyleSheet, Pressable, TextInput,
  FlatList, RefreshControl, Image,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { TabSelector } from '@/components/ui/TabSelector';
import { useHaptic } from '@/hooks/useHaptic';
import { colors, spacing, fontSize, radius } from '@/theme';
import { searchApi, postsApi } from '@/services/api';
import { PostCard } from '@/components/saf/PostCard';
import { ThreadCard } from '@/components/majlis/ThreadCard';
import type { User, TrendingHashtag, Reel, Video, Channel } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { rtlFlexRow, rtlTextAlign, rtlArrow } from '@/utils/rtl';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

const SEARCH_TAB_KEYS = ['people', 'hashtags', 'posts', 'threads', 'reels', 'videos', 'channels'] as const;

type SearchTab = typeof SEARCH_TAB_KEYS[number];

type SearchListItem =
  | { type: 'user'; data: User }
  | { type: 'hashtag'; data: { id: string; name: string; postsCount: number } };

function UserRow({ user, onPress }: { user: User; onPress: () => void }) {
  const { t, isRTL } = useTranslation();
  return (
    <Pressable
      style={[styles.userRow, { flexDirection: rtlFlexRow(isRTL) }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View profile of ${user.displayName}`}
    >
      <Avatar uri={user.avatarUrl} name={user.displayName} size="md" showOnline />
      <View style={styles.userInfo}>
        <View style={[styles.userNameRow, { flexDirection: rtlFlexRow(isRTL) }]}>
          <Text style={[styles.userName, { textAlign: rtlTextAlign(isRTL) }]}>{user.displayName}</Text>
          {user.isVerified && <VerifiedBadge size={13} />}
        </View>
        <Text style={[styles.userHandle, { textAlign: rtlTextAlign(isRTL) }]}>@{user.username}</Text>
        {user._count && (
          <Text style={[styles.userFollowers, { textAlign: rtlTextAlign(isRTL) }]}>{user._count.followers} {t('search.followers')}</Text>
        )}
      </View>
      {user.isFollowing ? (
        <Text style={styles.followingLabel}>{t('search.following')}</Text>
      ) : null}
    </Pressable>
  );
}

function VideoRow({ video, onPress }: { video: Video; onPress: () => void }) {
  const { t, isRTL } = useTranslation();
  const durationMinutes = Math.floor(video.duration / 60);
  const durationSeconds = Math.floor(video.duration % 60);
  const durationText = `${durationMinutes}:${durationSeconds.toString().padStart(2, '0')}`;

  return (
    <Pressable
      style={[styles.videoRow, { flexDirection: rtlFlexRow(isRTL) }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View video: ${video.title}`}
    >
      <Image
        source={{ uri: video.thumbnailUrl || video.videoUrl }}
        style={styles.videoThumbnail}
        resizeMode="cover"
      />
      <View style={styles.videoInfo}>
        <Text style={[styles.videoTitle, { textAlign: rtlTextAlign(isRTL) }]} numberOfLines={2}>{video.title}</Text>
        <Text style={[styles.videoChannel, { textAlign: rtlTextAlign(isRTL) }]}>{video.channel?.name || t('common.unknown')}</Text>
        <View style={[styles.videoStats, { flexDirection: rtlFlexRow(isRTL) }]}>
          <Icon name="eye" size={14} color={colors.text.secondary} />
          <Text style={styles.videoStat}>{video.viewsCount.toLocaleString()} {t('search.views')}</Text>
          <Icon name="clock" size={14} color={colors.text.secondary} />
          <Text style={styles.videoStat}>{durationText}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function ChannelRow({ channel, onPress }: { channel: Channel; onPress: () => void }) {
  const { t, isRTL } = useTranslation();
  return (
    <Pressable
      style={[styles.channelRow, { flexDirection: rtlFlexRow(isRTL) }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View channel: ${channel.name}`}
    >
      <Avatar uri={channel.avatarUrl} name={channel.name} size="lg" />
      <View style={styles.channelInfo}>
        <View style={[styles.channelNameRow, { flexDirection: rtlFlexRow(isRTL) }]}>
          <Text style={[styles.channelName, { textAlign: rtlTextAlign(isRTL) }]}>{channel.name}</Text>
          {channel.isVerified && <VerifiedBadge size={13} />}
        </View>
        <Text style={[styles.channelHandle, { textAlign: rtlTextAlign(isRTL) }]}>@{channel.handle}</Text>
        <View style={[styles.channelStats, { flexDirection: rtlFlexRow(isRTL) }]}>
          <Text style={styles.channelStat}>{channel.subscribersCount.toLocaleString()} {t('search.subscribers')}</Text>
          <Text style={styles.channelStat}>•</Text>
          <Text style={styles.channelStat}>{channel.videosCount.toLocaleString()} {t('search.videosCount')}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function SearchScreen() {
  const router = useRouter();
  const haptic = useHaptic();
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
  const mountedRef = useRef(false);
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
    const history = stored ? JSON.parse(stored) : [];
    const updated = [term, ...history.filter((h: string) => h !== term)].slice(0, 20);
    await AsyncStorage.setItem('search-history', JSON.stringify(updated));
    setSearchHistory(updated);
  }, []);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (debouncedQuery.trim().length >= 2) {
      addSearchToHistory(debouncedQuery);
    }
  }, [debouncedQuery, addSearchToHistory]);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(text), 400);
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
    queryKey: ['explore'],
    queryFn: ({ pageParam }) => postsApi.getFeed('foryou', pageParam as string | undefined),
    enabled: showExplore,
    getNextPageParam: (last) => last.meta?.cursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });

  const explorePosts = exploreQuery.data?.pages.flatMap((p) => p.data) ?? [];
  const posts = postsQuery.data?.pages.flatMap((p) => p.posts ?? []) ?? [];
  const threads = threadsQuery.data?.pages.flatMap((p) => p.threads ?? []) ?? [];
  const reels: Reel[] = reelsQuery.data?.pages.flatMap((p) => p.reels ?? []) ?? [];
  const videos: Video[] = videosQuery.data?.pages.flatMap((p) => p.videos ?? []) ?? [];
  const channels: Channel[] = channelsQuery.data?.pages.flatMap((p) => p.channels ?? []) ?? [];
  const people: User[] = searchQuery.data?.people ?? [];
  const hashtags = searchQuery.data?.hashtags ?? [];
  const trending: TrendingHashtag[] = trendingQuery.data ?? [];
  const isSearching = debouncedQuery.trim().length >= 2;
  const showHistory = query.length === 0 && isFocused;

  return (
    <ScreenErrorBoundary>
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { flexDirection: rtlFlexRow(isRTL) }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Icon name={rtlArrow(isRTL, 'back')} size="md" color={colors.text.primary} />
        </Pressable>
        <View style={[styles.searchBox, isFocused && styles.searchBoxFocused, { flexDirection: rtlFlexRow(isRTL) }]}>
          <Icon name="search" size="xs" color={colors.text.tertiary} />
          <TextInput
            style={[styles.searchInput, { textAlign: rtlTextAlign(isRTL) }]}
            placeholder={t('search.placeholder')}
            placeholderTextColor={colors.text.tertiary}
            value={query}
            onChangeText={handleQueryChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            autoFocus
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
      </View>

      {isSearching && (
        <TabSelector
          tabs={SEARCH_TABS.map((tab) => ({ key: tab.key, label: tab.label }))}
          activeKey={activeTab}
          onTabChange={(k) => setActiveTab(k as SearchTab)}
        />
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
                      data={posts}
                      keyExtractor={(item) => item.id}
                      renderItem={({ item }) => (
                        <PostCard post={item} />
                      )}
                      ListEmptyComponent={() => (
                        <EmptyState
                          icon="search"
                          title={t('search.noResultsFor', { type: t('search.posts'), query: debouncedQuery })}
                          subtitle={t('search.tryDifferent')}
                        />
                      )}
                      onEndReached={() => {
                        if (postsQuery.hasNextPage && !postsQuery.isFetchingNextPage) {
                          postsQuery.fetchNextPage();
                        }
                      }}
                      onEndReachedThreshold={0.5}
                      contentContainerStyle={{ paddingBottom: 40 }}
                      refreshControl={
                        <RefreshControl
                          refreshing={postsQuery.isRefetching}
                          onRefresh={() => postsQuery.refetch()}
                          tintColor={colors.emerald}
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
                      data={threads}
                      keyExtractor={(item) => item.id}
                      renderItem={({ item }) => (
                        <ThreadCard thread={item} />
                      )}
                      ListEmptyComponent={() => (
                        <EmptyState
                          icon="search"
                          title={t('search.noResultsFor', { type: t('search.threads'), query: debouncedQuery })}
                          subtitle={t('search.tryDifferent')}
                        />
                      )}
                      onEndReached={() => {
                        if (threadsQuery.hasNextPage && !threadsQuery.isFetchingNextPage) {
                          threadsQuery.fetchNextPage();
                        }
                      }}
                      onEndReachedThreshold={0.5}
                      contentContainerStyle={{ paddingBottom: 40 }}
                      refreshControl={
                        <RefreshControl
                          refreshing={threadsQuery.isRefetching}
                          onRefresh={() => threadsQuery.refetch()}
                          tintColor={colors.emerald}
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
                      data={reels}
                      keyExtractor={(item) => item.id}
                      renderItem={({ item }) => (
                        <Pressable
                          style={styles.reelRow}
                          onPress={() => {
                          haptic.light();
                          router.push(`/(screens)/reel/${item.id}`);
                        }}
                        >
                          <Image
                            source={{ uri: item.thumbnailUrl || item.videoUrl }}
                            style={styles.reelThumbnail}
                            resizeMode="cover"
                          />
                          <View style={styles.reelInfo}>
                            <Text style={styles.reelCaption} numberOfLines={2}>
                              {item.caption || t('search.noCaption')}
                            </Text>
                            <View style={styles.reelStats}>
                              <Icon name="heart" size={14} color={colors.text.secondary} />
                              <Text style={styles.reelStat}>{item.likesCount}</Text>
                              <Icon name="message-circle" size={14} color={colors.text.secondary} />
                              <Text style={styles.reelStat}>{item.commentsCount}</Text>
                              <Icon name="eye" size={14} color={colors.text.secondary} />
                              <Text style={styles.reelStat}>{item.viewsCount}</Text>
                            </View>
                            <View style={styles.reelUser}>
                              <Avatar
                                uri={item.user.avatarUrl}
                                name={item.user.username}
                                size="xs"
                                showRing={false}
                              />
                              <Text style={styles.reelUsername}>@{item.user.username}</Text>
                            </View>
                          </View>
                        </Pressable>
                      )}
                      ListEmptyComponent={() => (
                        <EmptyState
                          icon="video"
                          title={t('search.noResultsFor', { type: t('search.reels'), query: debouncedQuery })}
                          subtitle={t('search.tryDifferent')}
                        />
                      )}
                      onEndReached={() => {
                        if (reelsQuery.hasNextPage && !reelsQuery.isFetchingNextPage) {
                          reelsQuery.fetchNextPage();
                        }
                      }}
                      onEndReachedThreshold={0.5}
                      contentContainerStyle={{ paddingBottom: 40 }}
                      refreshControl={
                        <RefreshControl
                          refreshing={reelsQuery.isRefetching}
                          onRefresh={() => reelsQuery.refetch()}
                          tintColor={colors.emerald}
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
                      data={videos}
                      keyExtractor={(item) => item.id}
                      renderItem={({ item }) => (
                        <VideoRow
                          video={item}
                          onPress={() => router.push(`/(screens)/video/${item.id}`)}
                        />
                      )}
                      ListEmptyComponent={() => (
                        <EmptyState
                          icon="video"
                          title={t('search.noResultsFor', { type: t('search.videos'), query: debouncedQuery })}
                          subtitle={t('search.tryDifferent')}
                        />
                      )}
                      onEndReached={() => {
                        if (videosQuery.hasNextPage && !videosQuery.isFetchingNextPage) {
                          videosQuery.fetchNextPage();
                        }
                      }}
                      onEndReachedThreshold={0.5}
                      contentContainerStyle={{ paddingBottom: 40 }}
                      refreshControl={
                        <RefreshControl
                          refreshing={videosQuery.isRefetching}
                          onRefresh={() => videosQuery.refetch()}
                          tintColor={colors.emerald}
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
                      data={channels}
                      keyExtractor={(item) => item.id}
                      renderItem={({ item }) => (
                        <ChannelRow
                          channel={item}
                          onPress={() => router.push(`/(screens)/channel/${item.handle}`)}
                        />
                      )}
                      ListEmptyComponent={() => (
                        <EmptyState
                          icon="users"
                          title={t('search.noResultsFor', { type: t('search.channels'), query: debouncedQuery })}
                          subtitle={t('search.tryDifferent')}
                        />
                      )}
                      onEndReached={() => {
                        if (channelsQuery.hasNextPage && !channelsQuery.isFetchingNextPage) {
                          channelsQuery.fetchNextPage();
                        }
                      }}
                      onEndReachedThreshold={0.5}
                      contentContainerStyle={{ paddingBottom: 40 }}
                      refreshControl={
                        <RefreshControl
                          refreshing={channelsQuery.isRefetching}
                          onRefresh={() => channelsQuery.refetch()}
                          tintColor={colors.emerald}
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
              data={
                activeTab === 'people'
                  ? people.map((p): SearchListItem => ({ type: 'user', data: p }))
                  : hashtags.map((h): SearchListItem => ({ type: 'hashtag', data: h }))
              }
              keyExtractor={(item, i) => item.type === 'user' ? item.data.id : `ht-${i}`}
              renderItem={({ item }) => {
                if (item.type === 'user') {
                  return (
                    <UserRow
                      user={item.data}
                      onPress={() => {
                        haptic.light();
                        router.push(`/(screens)/profile/${item.data.username}`);
                      }}
                    />
                  );
                }
                return (
                    <Pressable
                      style={[styles.hashtagRow, { flexDirection: rtlFlexRow(isRTL) }]}
                      onPress={() => {
                        haptic.light();
                        router.push(`/(screens)/hashtag/${item.data.name}`);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`View hashtag ${item.data.name}`}
                    >
                      <View style={styles.hashtagIconWrap}>
                        <Icon name="hash" size="sm" color={colors.emerald} />
                      </View>
                      <View>
                        <Text style={[styles.hashtagName, { textAlign: rtlTextAlign(isRTL) }]}>#{item.data.name}</Text>
                        <Text style={[styles.hashtagCount, { textAlign: rtlTextAlign(isRTL) }]}>{item.data.postsCount} {t('search.posts')}</Text>
                      </View>
                    </Pressable>
                
                );
              }}
              ListEmptyComponent={() => (
                <EmptyState
                  icon="search"
                  title={t('search.noResultsFor', { type: activeTab === 'people' ? t('search.people') : t('search.hashtags'), query: debouncedQuery })}
                  subtitle={t('search.tryDifferent')}
                />
              )}
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
                data={searchHistory}
                keyExtractor={(item, i) => `history-${i}`}
                renderItem={({ item }) => (
                  <View style={[styles.historyItem, { flexDirection: rtlFlexRow(isRTL) }]}>
                    <Pressable
                      style={[styles.historyText, { flexDirection: rtlFlexRow(isRTL) }]}
                      onPress={() => {
                        setQuery(item);
                        setDebouncedQuery(item);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Search for ${item}`}
                    >
                      <Icon name="clock" size={16} color={colors.text.secondary} />
                      <Text style={styles.historyTerm}>{item}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        const updated = searchHistory.filter(h => h !== item);
                        setSearchHistory(updated);
                        AsyncStorage.setItem('search-history', JSON.stringify(updated));
                      }}
                      hitSlop={8}
                    >
                      <Icon name="x" size={16} color={colors.text.tertiary} />
                    </Pressable>
                  </View>
                )}
                contentContainerStyle={{ paddingBottom: spacing.lg }}
              />
              <Pressable
                onPress={() => {
                  setSearchHistory([]);
                  AsyncStorage.setItem('search-history', JSON.stringify([]));
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
              data={explorePosts}
              numColumns={3}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.exploreItem}
                  onPress={() => router.push(`/post/${item.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={t('accessibility.viewPost')}
                >
                  {item.mediaUrls[0] ? (
                    <Image
                      source={{ uri: item.mediaUrls[0] }}
                      style={styles.exploreImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.exploreImage, { backgroundColor: colors.dark.bgElevated }]}>
                      <Icon name="image" size={24} color={colors.text.tertiary} />
                    </View>
                  )}
                  {item.postType === 'VIDEO' && (
                    <View style={styles.videoOverlay}>
                      <Icon name="play" size={14} color={colors.text.primary} />
                    </View>
                  )}
                </Pressable>
              )}
              onEndReached={() => {
                if (exploreQuery.hasNextPage && !exploreQuery.isFetchingNextPage) {
                  exploreQuery.fetchNextPage();
                }
              }}
              onEndReachedThreshold={0.5}
              contentContainerStyle={styles.exploreGrid}
              refreshControl={
                <RefreshControl
                  refreshing={exploreQuery.isRefetching}
                  onRefresh={() => exploreQuery.refetch()}
                  tintColor={colors.emerald}
                />
              }
            />
          </View>
        ) : (
          <View style={styles.discoverSection}>
            <Text style={[styles.discoverTitle, { textAlign: rtlTextAlign(isRTL) }]}>{t('search.trending')}</Text>
            {trending.length > 0 ? (
              <View style={styles.trendingChips}>
                {trending.map((item, i) => (
                  <Pressable
                    accessibilityRole="button"
                    key={i}
                    style={styles.trendingChip}
                    onPress={() => {
                      haptic.light();
                      if (item.name) router.push(`/(screens)/hashtag/${item.name}`);
                    }}
                  >
                    <Icon name="trending-up" size={14} color={colors.emerald} />
                    <Text style={styles.trendingChipText}>#{item.name}</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm, gap: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  backBtn: { width: 36 },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
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

  skeletonList: { padding: spacing.base, gap: spacing.md },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },

  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  userInfo: { flex: 1 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  userName: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  userHandle: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 1 },
  userFollowers: { color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: 2 },
  followingLabel: { color: colors.text.secondary, fontSize: fontSize.xs, fontWeight: '600' },

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

  discoverSection: { paddingHorizontal: spacing.base, paddingTop: spacing['2xl'] },
  discoverTitle: {
    color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '700',
    marginBottom: spacing.md,
  },
  discoverSub: { color: colors.text.secondary, fontSize: fontSize.base },
  trendingChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  trendingChip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 0.5,
    borderColor: colors.dark.border,
  },
  trendingChipText: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '500' },
  historySection: { paddingHorizontal: spacing.base, paddingTop: spacing['2xl'] },
  historyTitle: {
    color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '700',
    marginBottom: spacing.md,
  },
  historyItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  historyText: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    flex: 1,
  },
  historyTerm: { color: colors.text.primary, fontSize: fontSize.base },
  historyEmpty: { color: colors.text.secondary, fontSize: fontSize.base, textAlign: 'center', paddingVertical: spacing['2xl'] },
  clearButton: {
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.base,
  },
  clearButtonText: { color: colors.text.secondary, fontSize: fontSize.base, fontWeight: '600' },
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
    backgroundColor: colors.dark.bgElevated,
    margin: 1,
  },
  exploreImage: {
    width: '100%',
    height: '100%',
  },
  videoOverlay: {
    position: 'absolute' as const,
    bottom: spacing.xs,
    right: spacing.xs,
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
    borderBottomColor: colors.dark.border,
  },
  reelThumbnail: {
    width: 80,
    height: 80,
    borderRadius: radius.md,
    backgroundColor: colors.dark.bgElevated,
  },
  reelInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  reelCaption: {
    color: colors.text.primary,
    fontSize: fontSize.base,
  },
  reelStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  reelStat: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginRight: spacing.sm,
  },
  reelUser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  reelUsername: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  videoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.dark.border,
  },
  videoThumbnail: {
    width: 80,
    height: 80,
    borderRadius: radius.md,
    backgroundColor: colors.dark.bgElevated,
  },
  videoInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  videoTitle: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  videoChannel: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  videoStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  videoStat: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginRight: spacing.sm,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.dark.border,
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
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '700',
  },
  channelHandle: {
    color: colors.text.secondary,
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
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
});
