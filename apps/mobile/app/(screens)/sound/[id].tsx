import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet,
  FlatList, Pressable, Dimensions,
  type ViewStyle, type ImageStyle,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { colors, spacing, fontSize, radius } from '@/theme';
import { formatCount } from '@/utils/formatCount';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { audioTracksApi } from '@/services/api';
import type { AudioTrack, Reel } from '@/types';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { showToast } from '@/components/ui/Toast';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';

const GRID_COLUMNS = 3;
const GRID_GAP = spacing.xs;
const ITEM_SIZE = `${100 / GRID_COLUMNS}%` as const;
const COVER_SIZE = Dimensions.get('window').width * 0.6;
const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_ITEM_WIDTH = Math.floor((SCREEN_WIDTH - GRID_GAP * 2) / GRID_COLUMNS);

export default function SoundScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { t, isRTL } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const haptic = useContextualHaptic();
  const [refreshing, setRefreshing] = useState(false);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  const formatNumber = formatCount;

  // Fetch audio track details
  const trackQuery = useQuery({
    queryKey: ['audio-track', id],
    queryFn: () => audioTracksApi.getById(id),
  });

  const track = trackQuery.data;

  const playPreview = useCallback(async () => {
    if (!track?.audioUrl) return;

    // If already playing, stop
    if (soundRef.current) {
      try { await soundRef.current.stopAsync(); await soundRef.current.unloadAsync(); } catch { /* ignore */ }
      soundRef.current = null;
      setIsPlayingPreview(false);
      return;
    }

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: track.audioUrl },
        { shouldPlay: true },
      );
      soundRef.current = sound;
      setIsPlayingPreview(true);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlayingPreview(false);
          sound.unloadAsync().catch(() => {});
          soundRef.current = null;
        }
      });
    } catch (err) {
      if (__DEV__) console.warn('Audio playback failed:', err);
      setIsPlayingPreview(false);
    }
  }, [track?.audioUrl]);

  useEffect(() => {
    return () => { soundRef.current?.unloadAsync().catch(() => {}); };
  }, []);

  // Fetch reels using this audio (paginated)
  const reelsQuery = useInfiniteQuery({
    queryKey: ['audio-track-reels', id],
    queryFn: ({ pageParam }) => audioTracksApi.getReelsUsing(id, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: !!track,
  });

  const reels: Reel[] = reelsQuery.data?.pages.flatMap((p) => p.data) ?? [];

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([trackQuery.refetch(), reelsQuery.refetch()]);
    setRefreshing(false);
  }, [trackQuery, reelsQuery]);

  const handleUseSound = useCallback(() => {
    haptic.navigate();
    router.push({
      pathname: '/(screens)/create-reel',
      params: { audioTrackId: id },
    });
  }, [router, id, haptic]);

  const handleReelPress = useCallback((reel: Reel) => {
    haptic.navigate();
    router.push(`/(screens)/reel/${reel.id}`);
  }, [router, haptic]);

  const handleEndReached = useCallback(() => {
    if (reelsQuery.hasNextPage && !reelsQuery.isFetchingNextPage) {
      reelsQuery.fetchNextPage();
    }
  }, [reelsQuery]);

  const renderGridItem = useCallback(({ item, index }: { item: Reel; index: number }) => {
    return (
      <Animated.View entering={FadeInUp.delay(index * 50).duration(400)} style={styles.gridItem as ViewStyle}>
        <Pressable accessibilityRole="button" onPress={() => handleReelPress(item)}>
          <ExpoImage
            source={{ uri: item.thumbnailUrl || item.videoUrl }}
            style={styles.thumbnail as ImageStyle}
            contentFit="cover"
            transition={200}
          />
          {item.viewsCount > 0 && (
            <View style={styles.viewCountOverlay}>
              <Icon name="play" size="xs" color="#FFF" />
              <Text style={styles.viewCountText}>{formatNumber(item.viewsCount)}</Text>
            </View>
          )}
        </Pressable>
      </Animated.View>
    );
  }, [handleReelPress]);

  const renderSkeleton = useCallback(() => {
    return (
      <View style={styles.skeletonContainer}>
        {/* Header skeleton */}
        <View style={styles.skeletonHeader}>
          <Skeleton.Rect width={COVER_SIZE} height={COVER_SIZE} borderRadius={radius.md} />
          <View style={styles.skeletonInfo}>
            <Skeleton.Rect width="80%" height={24} borderRadius={radius.sm} />
            <Skeleton.Rect width="60%" height={16} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
            <Skeleton.Rect width="40%" height={16} borderRadius={radius.sm} style={{ marginTop: spacing.xs }} />
            <Skeleton.Rect width="100%" height={44} borderRadius={radius.full} style={{ marginTop: spacing.lg }} />
          </View>
        </View>
        {/* Grid skeleton */}
        <View style={styles.skeletonGrid}>
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton.Rect key={i} width="100%" height={100} borderRadius={radius.sm} />
          ))}
        </View>
      </View>
    );
  }, []);

  if (trackQuery.isLoading) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title={t('screens.sound.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
        />
        <View style={{ paddingTop: insets.top + 52 }}>
          {renderSkeleton()}
        </View>
      </View>
    );
  }

  if (trackQuery.isError || !track) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title={t('screens.sound.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
        />
        <View style={{ paddingTop: insets.top + 52, flex: 1 }}>
          <EmptyState
            icon="volume-x"
            title={t('screens.sound.errorTitle')}
            subtitle={t('screens.sound.notFoundSubtitle')}
            actionLabel={t('screens.sound.errorAction')}
            onAction={() => router.back()}
          />
        </View>
      </View>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('screens.sound.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
        />
        <FlatList
              removeClippedSubviews={true}
          data={reels}
          renderItem={renderGridItem}
          keyExtractor={(item) => item.id}
          numColumns={GRID_COLUMNS}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={[styles.gridContainer, { paddingTop: insets.top + 52 }]}
          ListHeaderComponent={
            <Animated.View entering={FadeInUp.delay(0).duration(400)}>
              <LinearGradient
                colors={colors.gradient.cardDark}
                style={styles.headerSection}
              >
                {/* Cover art */}
                <View style={styles.coverContainer}>
                  {track.coverUrl ? (
                    <ExpoImage
                      source={{ uri: track.coverUrl }}
                      style={styles.cover as ImageStyle}
                      contentFit="cover"
                      transition={200}
                    />
                  ) : (
                    <LinearGradient
                      colors={['rgba(200,150,62,0.3)', 'rgba(200,150,62,0.1)']}
                      style={[styles.cover, styles.coverPlaceholder]}
                    >
                      <Icon name="music" size="xl" color={colors.gold} />
                    </LinearGradient>
                  )}
                  {/* Play preview overlay */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={isPlayingPreview ? t('common.pause') : t('common.play')}
                    onPress={playPreview}
                    style={styles.coverPlayOverlay}
                  >
                    <LinearGradient
                      colors={['rgba(10,123,79,0.9)', 'rgba(6,107,66,0.95)']}
                      style={styles.coverPlayButton}
                    >
                      <Icon name={isPlayingPreview ? 'loader' : 'play'} size="lg" color="#FFF" />
                    </LinearGradient>
                  </Pressable>
                  {track.isTrending && (
                    <LinearGradient
                      colors={[colors.emerald, colors.gold]}
                      style={styles.trendingBadge}
                    >
                      <Text style={styles.trendingBadgeText}>{t('screens.sound.trending')}</Text>
                    </LinearGradient>
                  )}
                </View>

                {/* Title + artist */}
                <Text style={styles.trackTitle}>{track.title}</Text>
                <Text style={styles.trackArtist}>{track.artist}</Text>

                {/* Stats row with icon backgrounds */}
                <View style={styles.statsRow}>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                    style={styles.statBadge}
                  >
                    <Icon name="repeat" size="xs" color={colors.emerald} />
                    <Text style={styles.statBadgeText}>{formatNumber(track.usageCount)} {t('screens.sound.reels')}</Text>
                  </LinearGradient>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                    style={styles.statBadge}
                  >
                    <Icon name="play" size="xs" color={colors.emerald} />
                    <Text style={styles.statBadgeText}>{formatNumber(track.playsCount || 0)} {t('screens.sound.plays')}</Text>
                  </LinearGradient>
                </View>

                {/* Use this sound button */}
                <GradientButton
                  label={t('screens.sound.useSound')}
                  onPress={handleUseSound}
                  style={styles.useButton as ViewStyle}
                />
              </LinearGradient>
            </Animated.View>
          }
          ListEmptyComponent={
            reelsQuery.isLoading ? (
              <View style={styles.skeletonGrid}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton.Rect key={i} width="100%" height={100} borderRadius={radius.sm} />
                ))}
              </View>
            ) : (
              <EmptyState
                icon="video"
                title={t('screens.sound.noReels')}
                subtitle={t('screens.sound.noReelsSubtitle')}
                style={styles.emptyState as ViewStyle}
              />
            )
          }
          refreshControl={
            <BrandedRefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
            />
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
        />
      </View>
  
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  headerSection: {
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing['2xl'],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    marginHorizontal: spacing.base,
    marginBottom: spacing.lg,
    marginTop: spacing.md,
  },
  coverContainer: {
    position: 'relative',
    marginBottom: spacing.lg,
  },
  cover: {
    width: COVER_SIZE,
    height: COVER_SIZE,
    borderRadius: radius.md,
    backgroundColor: tc.bgCard,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  coverPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverPlayOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverPlayButton: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendingBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  trendingBadgeText: {
    fontSize: fontSize.xs,
    color: '#FFF',
    fontWeight: '700',
  },
  trackTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  trackArtist: {
    fontSize: fontSize.base,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  statBadgeText: {
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  useButton: {
    alignSelf: 'stretch',
    marginTop: spacing.xs,
  },
  gridContainer: {
    padding: GRID_GAP,
  },
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: GRID_GAP,
  },
  gridItem: {
    flex: 1,
    aspectRatio: 0.75,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: tc.bgCard,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  viewCountOverlay: {
    position: 'absolute',
    bottom: spacing.xs,
    left: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  viewCountText: {
    fontSize: fontSize.xs,
    color: '#FFF',
    fontWeight: '600',
  },
  skeletonContainer: {
    paddingHorizontal: spacing.base,
  },
  skeletonHeader: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
  },
  skeletonInfo: {
    width: '100%',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    padding: spacing.xs,
  },
  emptyState: {
    marginTop: spacing['2xl'],
  },
});