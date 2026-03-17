import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { gamificationApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useHaptic } from '@/hooks/useHaptic';
import { rtlFlexRow, rtlTextAlign } from '@/utils/rtl';

interface Series {
  id: string;
  title: string;
  description?: string;
  category: string;
  coverImageUrl?: string;
  episodeCount: number;
  followerCount: number;
  isFollowing: boolean;
  isComplete: boolean;
  creator: {
    id: string;
    displayName: string;
    username: string;
    avatarUrl: string | null;
    isVerified: boolean;
  };
}

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'drama', label: 'Drama' },
  { key: 'documentary', label: 'Documentary' },
  { key: 'tutorial', label: 'Tutorial' },
  { key: 'comedy', label: 'Comedy' },
  { key: 'islamic', label: 'Islamic' },
];

function SeriesCard({
  series,
  index,
  isRTL,
}: {
  series: Series;
  index: number;
  isRTL: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index * 80, 600)).duration(400)}>
      <Pressable
        onPress={() => router.push(`/(screens)/series/${series.id}` as `/${string}`)}
        accessibilityLabel={`${series.title} by ${series.creator.displayName}`}
        accessibilityRole="button"
      >
        <LinearGradient
          colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.15)']}
          style={styles.seriesCard}
        >
          {/* Cover */}
          <View style={styles.coverWrap}>
            {series.coverImageUrl ? (
              <Image
                source={{ uri: series.coverImageUrl }}
                style={styles.coverImage}
                contentFit="cover"
              />
            ) : (
              <LinearGradient
                colors={[colors.emerald + '40', colors.gold + '20']}
                style={styles.coverPlaceholder}
              >
                <Icon name="video" size="xl" color={colors.text.tertiary} />
              </LinearGradient>
            )}
            {series.isComplete && (
              <View style={styles.completeBadge}>
                <Icon name="check-circle" size="xs" color={colors.gold} />
                <Text style={styles.completeBadgeText}>Complete</Text>
              </View>
            )}
          </View>

          {/* Info */}
          <View style={styles.cardInfo}>
            <Text
              style={[styles.seriesTitle, { textAlign: rtlTextAlign(isRTL) }]}
              numberOfLines={2}
            >
              {series.title}
            </Text>

            {/* Creator row */}
            <View style={[styles.creatorRow, { flexDirection: rtlFlexRow(isRTL) }]}>
              <Avatar uri={series.creator.avatarUrl} name={series.creator.displayName} size="xs" />
              <Text style={styles.creatorName} numberOfLines={1}>
                {series.creator.displayName}
              </Text>
            </View>

            {/* Meta */}
            <View style={[styles.metaRow, { flexDirection: rtlFlexRow(isRTL) }]}>
              <View style={[styles.metaItem, { flexDirection: rtlFlexRow(isRTL) }]}>
                <Icon name="video" size="xs" color={colors.text.tertiary} />
                <Text style={styles.metaText}>
                  {t('gamification.series.episodes', { count: series.episodeCount })}
                </Text>
              </View>
              <View style={[styles.metaItem, { flexDirection: rtlFlexRow(isRTL) }]}>
                <Icon name="users" size="xs" color={colors.text.tertiary} />
                <Text style={styles.metaText}>
                  {t('gamification.series.followers', { count: series.followerCount })}
                </Text>
              </View>
            </View>

            {/* Follow button */}
            <View style={styles.followBtnWrap}>
              {series.isFollowing ? (
                <View style={styles.followingBadge}>
                  <Icon name="check" size="xs" color={colors.emerald} />
                  <Text style={styles.followingText}>{t('gamification.series.following')}</Text>
                </View>
              ) : (
                <GradientButton
                  label={t('common.follow')}
                  onPress={() => {}}
                  size="sm"
                  variant="secondary"
                />
              )}
            </View>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

function LoadingSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <View style={styles.chipRow}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton.Rect key={i} width={80} height={32} borderRadius={radius.full} />
        ))}
      </View>
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={i} style={styles.skeletonCard}>
          <Skeleton.Rect width={120} height={120} borderRadius={radius.lg} />
          <View style={{ flex: 1, gap: spacing.sm, padding: spacing.sm }}>
            <Skeleton.Text width="80%" />
            <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
              <Skeleton.Circle size={24} />
              <Skeleton.Text width="40%" />
            </View>
            <Skeleton.Text width="60%" />
          </View>
        </View>
      ))}
    </View>
  );
}

function SeriesDiscoverScreen() {
  const { t, isRTL } = useTranslation();
  const router = useRouter();
  const haptic = useHaptic();
  const [selectedCategory, setSelectedCategory] = useState('all');

  const { data, isLoading, isRefetching, refetch, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ['series-discover', selectedCategory],
    queryFn: async ({ pageParam }) => {
      const params: { cursor?: string; category?: string } = {};
      if (pageParam) params.cursor = pageParam as string;
      if (selectedCategory !== 'all') params.category = selectedCategory;
      const res = await gamificationApi.discoverSeries(params);
      return res.data as { data: Series[]; meta: { cursor?: string; hasMore: boolean } };
    },
    getNextPageParam: (lastPage) => lastPage.meta.cursor,
    initialPageParam: undefined as string | undefined,
  });

  const seriesList = data?.pages.flatMap((p) => p.data) ?? [];

  const renderItem = useCallback(
    ({ item, index }: { item: Series; index: number }) => (
      <SeriesCard series={item} index={index} isRTL={isRTL} />
    ),
    [isRTL],
  );

  const keyExtractor = useCallback((item: Series) => item.id, []);

  const ListHeader = (
    <FlatList
      data={CATEGORIES}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyExtractor={(c) => c.key}
      inverted={isRTL}
      contentContainerStyle={styles.chipRow}
      renderItem={({ item: cat }) => (
        <Pressable
          onPress={() => {
            haptic.light();
            setSelectedCategory(cat.key);
          }}
          accessibilityRole="tab"
          accessibilityState={{ selected: selectedCategory === cat.key }}
        >
          <LinearGradient
            colors={
              selectedCategory === cat.key
                ? [colors.emeraldLight, colors.emerald]
                : ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']
            }
            style={styles.chip}
          >
            <Text
              style={[
                styles.chipText,
                selectedCategory === cat.key && styles.chipTextActive,
              ]}
            >
              {cat.label}
            </Text>
          </LinearGradient>
        </Pressable>
      )}
    />
  );

  return (
    <View style={styles.container}>
      <GlassHeader
        title={t('gamification.series.title')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back'),
        }}
      />

      <View style={styles.content}>
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <LoadingSkeleton />
          </View>
        ) : (
          <FlatList
            data={seriesList}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            ListHeaderComponent={ListHeader}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            onEndReached={() => {
              if (hasNextPage) fetchNextPage();
            }}
            onEndReachedThreshold={0.5}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                tintColor={colors.emerald}
              />
            }
            ListEmptyComponent={
              <EmptyState
                icon="video"
                title={t('gamification.series.empty')}
                subtitle={t('gamification.series.emptySubtitle')}
              />
            }
          />
        )}
      </View>
    </View>
  );
}

export default function SeriesDiscoverScreenWrapper() {
  return (
    <ScreenErrorBoundary>
      <SeriesDiscoverScreen />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  content: {
    flex: 1,
    paddingTop: 100,
  },
  loadingWrap: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['2xl'],
  },
  // Chips
  chipRow: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  chipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontFamily: fonts.bodySemiBold,
  },
  // Card
  seriesCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: colors.dark.borderLight,
    marginBottom: spacing.md,
    flexDirection: 'row',
  },
  coverWrap: {
    width: 120,
    height: 140,
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: 'rgba(13,17,23,0.8)',
  },
  completeBadgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 9,
    color: colors.gold,
  },
  cardInfo: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.sm,
    justifyContent: 'center',
  },
  seriesTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  creatorName: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  followBtnWrap: {
    alignItems: 'flex-start',
  },
  followingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.active.emerald10,
  },
  followingText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.xs,
    color: colors.emerald,
  },
  // Skeleton
  skeletonWrap: {
    gap: spacing.md,
  },
  skeletonCard: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    backgroundColor: colors.dark.bgCard,
    overflow: 'hidden',
  },
});
