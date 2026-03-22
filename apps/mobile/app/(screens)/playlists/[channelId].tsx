import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  FlatList,
} from 'react-native';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, fontSize, radius } from '@/theme';
import { playlistsApi } from '@/services/api';
import type { Playlist, PaginatedResponse } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

export default function ChannelPlaylistsScreen() {
  const { t, isRTL } = useTranslation();
  const params = useLocalSearchParams<{ channelId: string }>();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const insets = useSafeAreaInsets();
  const channelId = Array.isArray(params.channelId) ? params.channelId[0] : params.channelId;

  // Fetch playlists (moved before early return to comply with React rules of hooks — Finding 34)
  const playlistsQuery = useInfiniteQuery({
    queryKey: ['channel-playlists', channelId],
    queryFn: ({ pageParam }) => playlistsApi.getByChannel(channelId!, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: PaginatedResponse<Playlist>) => last.meta?.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: !!channelId,
  });

  const playlists: Playlist[] = playlistsQuery.data?.pages.flatMap((p: PaginatedResponse<Playlist>) => p.data) ?? [];

  // If channelId is missing, show error
  if (!channelId) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader title={t('screens.playlists.title')} leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }} />
        <View style={{ flex: 1, paddingTop: insets.top + 56 }}>
          <EmptyState
            icon="slash"
            title={t('screens.playlists.errorTitle')}
            subtitle={t('screens.playlists.errorSubtitle')}
            actionLabel={t('accessibility.goBack')}
            onAction={() => router.back()}
          />
        </View>
      </View>
    );
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await playlistsQuery.refetch();
    setRefreshing(false);
  }, [playlistsQuery]);

  const onEndReached = () => {
    if (playlistsQuery.hasNextPage && !playlistsQuery.isFetchingNextPage) {
      playlistsQuery.fetchNextPage();
    }
  };

  const renderPlaylistItem = ({ item, index }: { item: Playlist; index: number }) => (
    <Animated.View entering={FadeInUp.delay(index * 50).duration(400)}>
      <Pressable
        style={styles.playlistCard}
        onPress={() => router.push(`/(screens)/playlist/${item.id}`)}
        accessibilityLabel={`Playlist: ${item.title}, ${item.videosCount} videos`}
        accessibilityRole="button"
      >
        <LinearGradient
          colors={colors.gradient.cardDark}
          style={styles.cardGradient}
        >
          {/* Thumbnail */}
          {item.thumbnailUrl ? (
            <ProgressiveImage uri={item.thumbnailUrl} width={120} height={68} borderRadius={radius.sm} />
          ) : (
            <LinearGradient
              colors={['rgba(200,150,62,0.15)', 'rgba(200,150,62,0.05)']}
              style={[styles.thumbnail, styles.placeholderThumb]}
            >
              <Icon name="layers" size="lg" color={colors.gold} />
            </LinearGradient>
          )}
          <View style={styles.cardInfo}>
            <Text style={[styles.cardTitle, { color: tc.text.primary }]} numberOfLines={2}>{item.title}</Text>
            <LinearGradient
              colors={['rgba(10,123,79,0.15)', 'rgba(200,150,62,0.1)']}
              style={styles.videosBadge}
            >
              <Icon name="video" size="xs" color={colors.emerald} />
              <Text style={styles.cardMeta}>{item.videosCount} {t('screens.playlists.videos')}</Text>
            </LinearGradient>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );

  // Loading skeleton
  if (playlistsQuery.isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader title={t('screens.playlists.title')} leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }} />
        <View style={[styles.skeletonContainer, { paddingTop: insets.top + 56 }]}>
          {[...Array(4)].map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton.Rect width={120} height={68} borderRadius={radius.md} />
              <View style={styles.skeletonText}>
                <Skeleton.Rect width="60%" height={16} borderRadius={radius.sm} />
                <Skeleton.Rect width="30%" height={14} borderRadius={radius.sm} style={{ marginTop: spacing.xs }} />
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  // Error state
  if (playlistsQuery.isError) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader title={t('screens.playlists.title')} leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }} />
        <View style={{ flex: 1, paddingTop: insets.top + 56 }}>
          <EmptyState
            icon="slash"
            title={t('screens.playlists.errorTitle')}
            subtitle={t('screens.playlists.errorSubtitle')}
            actionLabel={t('accessibility.goBack')}
            onAction={() => router.back()}
          />
        </View>
      </View>
    );
  }

  // Empty state
  if (!playlistsQuery.isFetching && playlists.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader title={t('screens.playlists.title')} leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }} />
        <View style={{ flex: 1, paddingTop: insets.top + 56 }}>
          <EmptyState
            icon="layers"
            title={t('screens.playlists.emptyTitle')}
            subtitle={t('screens.playlists.emptySubtitle')}
          />
        </View>
      </View>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader title={t('screens.playlists.title')} leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }} />

        <FlatList
          removeClippedSubviews={true}
          data={playlists}
          keyExtractor={(item) => item.id}
          renderItem={renderPlaylistItem}
          refreshControl={
            <BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 56 }]}
        />
      </View>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  playlistCard: {
    marginBottom: spacing.sm,
  },
  cardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    gap: spacing.md,
  },
  thumbnail: {
    width: 120,
    height: 68,
    borderRadius: radius.sm,
  },
  placeholderThumb: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  videosBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  cardMeta: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  skeletonContainer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  skeletonText: {
    flex: 1,
  },
});