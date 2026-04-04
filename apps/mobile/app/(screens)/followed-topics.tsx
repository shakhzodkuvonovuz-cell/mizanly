import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { formatCount } from '@/utils/formatCount';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { hashtagsApi } from '@/services/api';
import type { HashtagInfo } from '@/types';

interface FollowedHashtag extends HashtagInfo {
  isFollowing: boolean;
}

function FollowedTopicsContent() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const haptic = useContextualHaptic();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<HashtagInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [followedTopics, setFollowedTopics] = useState<FollowedHashtag[]>([]);
  const [suggestedTopics, setSuggestedTopics] = useState<HashtagInfo[]>([]);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tc = useThemeColors();

  const loadData = useCallback(async () => {
    try {
      setLoadError(false);
      const [trendingRes, followedRes] = await Promise.all([
        hashtagsApi.getTrending(),
        hashtagsApi.getFollowed().catch(() => []),
      ]);
      const trending = (trendingRes as HashtagInfo[]) ?? [];
      const followed = (followedRes as HashtagInfo[]) ?? [];
      setSuggestedTopics(trending.slice(0, 10));
      setFollowedTopics(
        followed.map((h) => ({ ...h, isFollowing: true })),
      );
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      if (!query.trim()) {
        setSearchResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      searchTimeout.current = setTimeout(async () => {
        try {
          const results = (await hashtagsApi.search(query.trim())) as HashtagInfo[];
          setSearchResults(results ?? []);
        } catch {
          setSearchResults([]);
        } finally {
          setSearching(false);
        }
      }, 400);
    },
    [],
  );

  const toggleFollow = useCallback(
    async (hashtag: HashtagInfo) => {
      haptic.tick();
      const isCurrentlyFollowing = followedTopics.some((h) => h.id === hashtag.id);
      setTogglingIds((prev) => new Set(prev).add(hashtag.id));

      // Optimistic update
      if (isCurrentlyFollowing) {
        setFollowedTopics((prev) => prev.filter((h) => h.id !== hashtag.id));
      } else {
        setFollowedTopics((prev) => [...prev, { ...hashtag, isFollowing: true }]);
      }

      try {
        if (isCurrentlyFollowing) {
          await hashtagsApi.unfollow(hashtag.id);
        } else {
          await hashtagsApi.follow(hashtag.id);
        }
      } catch {
        // Revert optimistic update on failure
        if (isCurrentlyFollowing) {
          setFollowedTopics((prev) => [...prev, { ...hashtag, isFollowing: true }]);
        } else {
          setFollowedTopics((prev) => prev.filter((h) => h.id !== hashtag.id));
        }
      } finally {
        setTogglingIds((prev) => {
          const next = new Set(prev);
          next.delete(hashtag.id);
          return next;
        });
      }
    },
    [followedTopics, haptic],
  );

  const renderHashtagItem = useCallback(
    ({ item, index }: { item: HashtagInfo; index: number }) => {
      const isFollowing = followedTopics.some((h) => h.id === item.id);
      const isToggling = togglingIds.has(item.id);
      const totalPosts = item.postsCount + item.reelsCount + item.threadsCount;

      return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300)}>
          <Pressable
            style={styles.hashtagItem}
            onPress={() => { haptic.tick(); router.push(`/(screens)/hashtag/${item.name}`); }}
            accessibilityRole="button"
            accessibilityLabel={`#${item.name}`}
          >
            <View style={styles.hashIcon}>
              <Icon name="hash" size="md" color={colors.emerald} />
            </View>
            <View style={styles.hashtagInfo}>
              <Text style={[styles.hashtagName, { color: tc.text.primary }]} numberOfLines={1}>
                #{item.name}
              </Text>
              <Text style={[styles.hashtagCount, { color: tc.text.secondary }]}>
                {formatCount(totalPosts)} {t('followedTopics.posts', 'posts')}
              </Text>
            </View>
            <Pressable
              style={[
                styles.followButton,
                isFollowing && [styles.followButtonActive, { borderColor: tc.border }],
              ]}
              onPress={() => toggleFollow(item)}
              disabled={isToggling}
              accessibilityRole="button"
              accessibilityLabel={
                isFollowing
                  ? t('followedTopics.unfollow', 'Unfollow')
                  : t('followedTopics.follow', 'Follow')
              }
            >
              {isToggling ? (
                <Skeleton.Rect width={60} height={16} borderRadius={radius.sm} />
              ) : (
                <Text
                  style={[
                    styles.followButtonText,
                    isFollowing && { color: tc.text.secondary },
                  ]}
                >
                  {isFollowing
                    ? t('followedTopics.following', 'Following')
                    : t('followedTopics.follow', 'Follow')}
                </Text>
              )}
            </Pressable>
          </Pressable>
        </Animated.View>
      );
    },
    [followedTopics, togglingIds, toggleFollow, router, t, haptic],
  );

  const renderSuggestedHeader = useCallback(
    () =>
      suggestedTopics.length > 0 && !searchQuery ? (
        <View style={styles.sectionHeader}>
          <Icon name="trending-up" size="sm" color={colors.gold} />
          <Text style={[styles.sectionTitle, { color: tc.text.primary }]}>
            {t('followedTopics.suggested', 'Suggested Topics')}
          </Text>
        </View>
      ) : null,
    [suggestedTopics.length, searchQuery, t],
  );

  const renderFollowedHeader = useCallback(
    () =>
      followedTopics.length > 0 && !searchQuery ? (
        <View style={styles.sectionHeader}>
          <Icon name="check-circle" size="sm" color={colors.emerald} />
          <Text style={[styles.sectionTitle, { color: tc.text.primary }]}>
            {t('followedTopics.yourTopics', 'Your Topics')}
          </Text>
        </View>
      ) : null,
    [followedTopics.length, searchQuery, t],
  );

  const displayData = searchQuery.trim()
    ? searchResults
    : [...followedTopics, ...suggestedTopics.filter(
        (s) => !followedTopics.some((f) => f.id === s.id),
      )];

  const renderListHeader = useCallback(
    () => (
      <View>
        {/* Search bar */}
        <View style={[styles.searchContainer, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
          <Icon name="search" size="sm" color={tc.text.tertiary} />
          <TextInput
            style={[styles.searchInput, { color: tc.text.primary }]}
            placeholder={t('followedTopics.searchPlaceholder', 'Search topics...')}
            placeholderTextColor={tc.text.tertiary}
            value={searchQuery}
            onChangeText={handleSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery ? (
                        <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('accessibility.close')}
              onPress={() => handleSearch('')}
              hitSlop={8}
            >
              <Icon name="x" size="xs" color={tc.text.tertiary} />
            </Pressable>
          ) : null}
        </View>

        {searching ? (
          <View style={styles.searchingRow}>
            <Skeleton.Rect width={20} height={20} borderRadius={radius.full} />
            <Text style={[styles.searchingText, { color: tc.text.secondary }]}>
              {t('followedTopics.searching', 'Searching...')}
            </Text>
          </View>
        ) : null}

        {!searchQuery ? (
          <>
            {renderFollowedHeader()}
            {followedTopics.length > 0 ? (
              followedTopics.map((item, index) => (
                <View key={`followed-${item.id}`}>
                  {renderHashtagItem({ item, index })}
                </View>
              ))
            ) : null}
            {renderSuggestedHeader()}
          </>
        ) : null}
      </View>
    ),
    [
      searchQuery,
      handleSearch,
      searching,
      followedTopics,
      renderFollowedHeader,
      renderSuggestedHeader,
      renderHashtagItem,
      t,
    ],
  );

  if (!loading && loadError) {
    return (
      <View style={[styles.screen, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('followedTopics.title', 'Followed Topics')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <EmptyState
          icon="alert-circle"
          title={t('common.error', 'Something went wrong')}
          subtitle={t('common.networkError', 'Check your connection and try again')}
          actionLabel={t('common.retry', 'Retry')}
          onAction={loadData}
        />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: tc.bg }, { paddingTop: insets.top + 60 }]}>
        <GlassHeader
          title={t('followedTopics.title', 'Followed Topics')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <View style={styles.skeletonContainer}>
          {Array.from({ length: 8 }).map((_, i) => (
            <View key={`skel-${i}`} style={styles.skeletonRow}>
              <Skeleton.Circle size={40} />
              <View style={styles.skeletonText}>
                <Skeleton.Rect width={120} height={14} borderRadius={radius.sm} />
                <Skeleton.Rect width={80} height={12} borderRadius={radius.sm} />
              </View>
              <Skeleton.Rect width={80} height={32} borderRadius={radius.full} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: tc.bg }]}>
      <GlassHeader
        title={t('followedTopics.title', 'Followed Topics')}
        leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
      />
      <FlatList
        data={searchQuery.trim() ? displayData : suggestedTopics.filter(
          (s) => !followedTopics.some((f) => f.id === s.id),
        )}
        keyExtractor={(item) => item.id}
        renderItem={renderHashtagItem}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={
          searchQuery.trim() && !searching ? (
            <EmptyState
              icon="hash"
              title={t('followedTopics.noResults', 'No topics found')}
              subtitle={t('followedTopics.noResultsSub', 'Try a different search term')}
            />
          ) : !searchQuery && followedTopics.length === 0 ? (
            <EmptyState
              icon="hash"
              title={t('followedTopics.empty', 'No followed topics')}
              subtitle={t('followedTopics.emptySub', 'Search and follow topics you care about')}
            />
          ) : null
        }
        contentContainerStyle={{
          paddingTop: insets.top + 60,
          paddingBottom: insets.bottom + spacing['2xl'],
        }}
        refreshControl={
          <BrandedRefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

export default function FollowedTopicsScreen() {
  return (
    <ScreenErrorBoundary>
      <FollowedTopicsContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 0.5,
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    marginBottom: spacing.base,
    paddingHorizontal: spacing.md,
    height: 44,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    paddingVertical: 0,
  },
  searchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  searchingText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
  },
  hashtagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  hashIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.active.emerald10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hashtagInfo: {
    flex: 1,
    gap: 2,
  },
  hashtagName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
  },
  hashtagCount: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
  },
  followButton: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
    minWidth: 90,
    alignItems: 'center',
  },
  followButtonActive: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  followButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.onColor,
  },
  followButtonTextActive: {},
  skeletonContainer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    gap: spacing.md,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  skeletonText: {
    flex: 1,
    gap: spacing.xs,
  },
});
