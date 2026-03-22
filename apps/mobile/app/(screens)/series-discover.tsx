import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ScrollView,
  Dimensions,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { navigate } from '@/utils/navigation';
import { useTranslation } from '@/hooks/useTranslation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { gamificationApi } from '@/services/api';

const { width: screenWidth } = Dimensions.get('window');

const CATEGORY_KEYS = ['all', 'drama', 'documentary', 'tutorial', 'comedy', 'islamic'] as const;

type CategoryKey = typeof CATEGORY_KEYS[number];

interface SeriesItem {
  id: string;
  title: string;
  description?: string;
  category: string;
  coverUrl?: string;
  episodeCount: number;
  followersCount: number;
  isFollowing: boolean;
  creator: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
  createdAt: string;
}

interface SeriesResponse {
  data: SeriesItem[];
  meta: { cursor: string | null; hasMore: boolean };
}

function SeriesDiscoverContent() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { t } = useTranslation();
  const router = useRouter();
  const haptic = useContextualHaptic();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const CATEGORIES: { key: CategoryKey; label: string }[] = [
    { key: 'all', label: t('series.categories.all', 'All') },
    { key: 'drama', label: t('series.categories.drama', 'Drama') },
    { key: 'documentary', label: t('series.categories.documentary', 'Documentary') },
    { key: 'tutorial', label: t('series.categories.tutorial', 'Tutorial') },
    { key: 'comedy', label: t('series.categories.comedy', 'Comedy') },
    { key: 'islamic', label: t('series.categories.islamic', 'Islamic') },
  ];

  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>('all');

  const seriesQuery = useInfiniteQuery<SeriesResponse>({
    queryKey: ['series-discover', selectedCategory],
    queryFn: ({ pageParam }) =>
      gamificationApi.discoverSeries({
        cursor: pageParam as string | undefined,
        category: selectedCategory === 'all' ? undefined : selectedCategory,
      }) as Promise<SeriesResponse>,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore ? lastPage.meta.cursor ?? undefined : undefined,
    initialPageParam: undefined as string | undefined,
  });

  const followMutation = useMutation({
    mutationFn: (id: string) => gamificationApi.followSeries(id),
    onSuccess: () => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ['series-discover'] });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: (id: string) => gamificationApi.unfollowSeries(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['series-discover'] });
    },
  });

  const allSeries = seriesQuery.data?.pages.flatMap((p) => p.data) ?? [];

  const handleRefresh = useCallback(() => {
    seriesQuery.refetch();
  }, [seriesQuery]);

  const handleLoadMore = () => {
    if (seriesQuery.hasNextPage && !seriesQuery.isFetchingNextPage) {
      seriesQuery.fetchNextPage();
    }
  };

  const handleCategoryPress = (key: CategoryKey) => {
    haptic.tick();
    setSelectedCategory(key);
  };

  const handleSeriesPress = (series: SeriesItem) => {
    haptic.navigate();
    navigate('/(screens)/series-detail', { id: series.id });
  };

  const handleFollowToggle = (series: SeriesItem) => {
    haptic.follow();
    if (series.isFollowing) {
      unfollowMutation.mutate(series.id);
    } else {
      followMutation.mutate(series.id);
    }
  };

  const renderCategoryChips = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      {CATEGORIES.map((cat) => (
        <Pressable
          key={cat.key}
          style={[
            styles.chip,
            selectedCategory === cat.key && styles.chipActive,
          ]}
          onPress={() => handleCategoryPress(cat.key)}
          accessibilityRole="button"
          accessibilityLabel={cat.label}
        >
          <Text
            style={[
              styles.chipText,
              selectedCategory === cat.key && styles.chipTextActive,
            ]}
          >
            {cat.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );

  const renderSeriesCard = ({ item, index }: { item: SeriesItem; index: number }) => (
    <Animated.View entering={FadeInUp.delay(index * 60).duration(300)}>
      <Pressable
        style={styles.seriesCard}
        onPress={() => handleSeriesPress(item)}
        accessibilityRole="button"
        accessibilityLabel={item.title}
      >
        {/* Cover Image */}
        <View style={styles.coverWrap}>
          {item.coverUrl ? (
            <Image
              source={{ uri: item.coverUrl }}
              style={styles.coverImage}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.coverImage, styles.coverPlaceholder]}>
              <Icon name="layers" size="xl" color={colors.text.tertiary} />
            </View>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.8)']}
            style={styles.coverGradient}
          />
          {/* Badges on cover */}
          <View style={styles.coverBadgeRow}>
            <View style={styles.episodeBadge}>
              <Icon name="layers" size="xs" color={colors.text.primary} />
              <Text style={styles.episodeBadgeText}>
                {item.episodeCount} {t('series.episodes', 'episodes')}
              </Text>
            </View>
          </View>
          {/* Title on cover */}
          <View style={styles.coverBottom}>
            <Text style={styles.seriesTitle} numberOfLines={2}>
              {item.title}
            </Text>
          </View>
        </View>

        {/* Bottom info */}
        <View style={styles.seriesInfo}>
          <View style={styles.creatorRow}>
            <Avatar
              uri={item.creator.avatarUrl}
              name={item.creator.displayName}
              size="sm"
            />
            <View style={styles.creatorInfo}>
              <Text style={styles.creatorName} numberOfLines={1}>
                {item.creator.displayName}
              </Text>
              <Text style={styles.followersCount}>
                {item.followersCount.toLocaleString()} {t('series.followers', 'followers')}
              </Text>
            </View>
            <Pressable
              style={[
                styles.followBtn,
                item.isFollowing && styles.followBtnActive,
              ]}
              onPress={() => handleFollowToggle(item)}
              accessibilityRole="button"
              accessibilityLabel={item.isFollowing ? t('series.following', 'Following') : t('series.follow', 'Follow')}
            >
              <Text
                style={[
                  styles.followBtnText,
                  item.isFollowing && styles.followBtnTextActive,
                ]}
              >
                {item.isFollowing
                  ? t('series.following', 'Following')
                  : t('series.follow', 'Follow')}
              </Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );

  const renderSkeleton = () => (
    <View style={styles.skeletonWrap}>
      {Array.from({ length: 3 }).map((_, i) => (
        <View key={`skel-${i}`} style={styles.seriesCard}>
          <Skeleton.Rect width="100%" height={180} borderRadius={radius.lg} />
          <View style={{ padding: spacing.md, gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Skeleton.Circle size={32} />
              <View style={{ flex: 1 }}>
                <Skeleton.Text width="50%" />
                <Skeleton.Text width="30%" />
              </View>
            </View>
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      <GlassHeader
        title={t('series.discoverTitle', 'Series')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back', 'Back'),
        }}
      />

      <View style={[styles.content, { paddingTop: insets.top + 52 }]}>
        {seriesQuery.isLoading ? (
          <View style={styles.listPadding}>
            {renderCategoryChips()}
            {renderSkeleton()}
          </View>
        ) : (
          <FlatList
            data={allSeries}
            renderItem={renderSeriesCard}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={renderCategoryChips}
            ListEmptyComponent={
              <EmptyState
                icon="layers"
                title={t('series.empty', 'No series found')}
                subtitle={t('series.emptySub', 'Check back later for new content')}
              />
            }
            ListFooterComponent={
              seriesQuery.isFetchingNextPage ? (
                <View style={styles.footerLoader}>
                  <Skeleton.Rect width={120} height={20} borderRadius={radius.sm} />
                </View>
              ) : null
            }
            contentContainerStyle={styles.listPadding}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            refreshControl={
              <RefreshControl
                refreshing={seriesQuery.isFetching && !seriesQuery.isLoading}
                onRefresh={handleRefresh}
                tintColor={colors.emerald}
              />
            }
          />
        )}
      </View>
    </View>
  );
}

export default function SeriesDiscoverScreen() {
  return (
    <ScreenErrorBoundary>
      <SeriesDiscoverContent />
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  content: {
    flex: 1,
  },
  listPadding: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['2xl'],
  },
  // Category chips
  chipRow: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: tc.bgCard,
    borderWidth: 1,
    borderColor: tc.border,
  },
  chipActive: {
    backgroundColor: colors.active.emerald10,
    borderColor: colors.emerald,
  },
  chipText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontFamily: fonts.bodySemiBold,
  },
  chipTextActive: {
    color: colors.emerald,
  },
  // Series card
  seriesCard: {
    backgroundColor: tc.bgCard,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: tc.border,
    marginBottom: spacing.md,
  },
  coverWrap: {
    width: '100%',
    height: 180,
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    backgroundColor: tc.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  coverBadgeRow: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  episodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  episodeBadgeText: {
    color: colors.text.primary,
    fontSize: fontSize.xs,
    fontFamily: fonts.bodySemiBold,
  },
  coverBottom: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
  },
  seriesTitle: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontFamily: fonts.bodySemiBold,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  // Series info
  seriesInfo: {
    padding: spacing.md,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  creatorInfo: {
    flex: 1,
  },
  creatorName: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontFamily: fonts.bodySemiBold,
  },
  followersCount: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    marginTop: 2,
  },
  followBtn: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
  },
  followBtnActive: {
    backgroundColor: tc.surface,
    borderWidth: 1,
    borderColor: tc.border,
  },
  followBtnText: {
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontFamily: fonts.bodySemiBold,
  },
  followBtnTextActive: {
    color: colors.text.secondary,
  },
  // Skeleton
  skeletonWrap: {
    gap: spacing.md,
  },
  footerLoader: {
    paddingVertical: spacing.base,
    alignItems: 'center',
  },
});
