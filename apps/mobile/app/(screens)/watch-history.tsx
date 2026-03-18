import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  FlatList, Alert, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, fontSize, radius } from '@/theme';
import { usersApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

// Local type for watch history items (matches Step 4's WatchHistoryItem)
interface WatchHistoryItem {
  id: string;
  title: string;
  thumbnailUrl?: string;
  duration: number;
  viewsCount: number;
  createdAt: string;
  channel: { id: string; handle: string; name: string; avatarUrl?: string };
  progress: number;
  completed: boolean;
  watchedAt: string;
}

const formatDuration = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const formatViews = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

function VideoCard({ item, onPress, index }: { item: WatchHistoryItem; onPress: () => void; index: number }) {
  const { t } = useTranslation();
  return (
    <Animated.View entering={FadeInUp.delay(index * 50).duration(400)}>
      <Pressable
        style={styles.videoCard}
       
        onPress={onPress}
      >
        {/* Thumbnail with progress bar */}
        <LinearGradient
          colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
          style={styles.thumbnailContainer}
        >
          {item.thumbnailUrl ? (
            <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbnail} />
          ) : (
            <LinearGradient
              colors={['rgba(10,123,79,0.1)', 'rgba(200,150,62,0.05)']}
              style={[styles.thumbnail, styles.thumbnailPlaceholder]}
            >
              <Icon name="video" size="lg" color={colors.emerald} />
            </LinearGradient>
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.8)', 'rgba(0,0,0,0.6)']}
            style={styles.durationBadge}
          >
            <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
          </LinearGradient>
          {/* Progress bar */}
          {item.progress > 0 && !item.completed && (
            <View style={[styles.progressBar, { width: `${item.progress * 100}%` }]} />
          )}
        </LinearGradient>

        {/* Info row */}
        <View style={styles.infoRow}>
          <LinearGradient
            colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
            style={styles.channelIconBg}
          >
            <Icon name="user" size="sm" color={colors.emerald} />
          </LinearGradient>
          <View style={styles.videoDetails}>
            <Text style={styles.videoTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.channelName} numberOfLines={1}>
              {item.channel.name}
            </Text>
            <Text style={styles.videoStats} numberOfLines={1}>
              {formatViews(item.viewsCount)} {t('screens.watch-history.views')} • {formatDuration(item.duration)}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function WatchHistoryScreen() {
  const { t, isRTL } = useTranslation();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const watchHistoryQuery = useInfiniteQuery({
    queryKey: ['watch-history'],
    queryFn: ({ pageParam }) => usersApi.getWatchHistory(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.hasMore ? last.meta.cursor ?? undefined : undefined,
  });

  const items: WatchHistoryItem[] = watchHistoryQuery.data?.pages.flatMap((p) => p.data) ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await watchHistoryQuery.refetch();
    setRefreshing(false);
  }, [watchHistoryQuery]);

  const onEndReached = useCallback(() => {
    if (watchHistoryQuery.hasNextPage && !watchHistoryQuery.isFetchingNextPage) {
      watchHistoryQuery.fetchNextPage();
    }
  }, [watchHistoryQuery.hasNextPage, watchHistoryQuery.isFetchingNextPage, watchHistoryQuery.fetchNextPage]);

  const handleClear = useCallback(() => {
    Alert.alert(
      t('screens.watch-history.clearConfirmTitle'),
      t('screens.watch-history.clearConfirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('screens.watch-history.clear'),
          style: 'destructive',
          onPress: async () => {
            await usersApi.clearWatchHistory();
            watchHistoryQuery.refetch();
          },
        },
      ]
    );
  }, [watchHistoryQuery]);

  const handleVideoPress = (item: WatchHistoryItem) => {
    router.push(`/(screens)/video/${item.id}`);
  };

  if (watchHistoryQuery.isError) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title={t('screens.watch-history.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
        />
        <View style={styles.headerSpacer} />
        <EmptyState
          icon="flag"
          title={t('screens.watch-history.errorTitle')}
          subtitle={t('screens.watch-history.errorSubtitle')}
          actionLabel={t('common.retry')}
          onAction={() => watchHistoryQuery.refetch()}
        />
      </View>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('screens.watch-history.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
          rightActions={[{
            icon: <Text style={styles.clearText}>{t('screens.watch-history.clear')}</Text>,
            onPress: handleClear,
            accessibilityLabel: t('screens.watch-history.clearConfirmTitle'),
          }]}
        />
        <View style={styles.headerSpacer} />

        <FlatList
            removeClippedSubviews={true}
          data={items}
          keyExtractor={(item) => item.id}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
          }
          renderItem={({ item, index }) => (
            <VideoCard item={item} onPress={() => handleVideoPress(item)} index={index} />
          )}
          ListEmptyComponent={() =>
            !watchHistoryQuery.isLoading ? (
              <EmptyState
                icon="clock"
                title={t('screens.watch-history.emptyTitle')}
                subtitle={t('screens.watch-history.emptySubtitle')}
              />
            ) : (
              <View style={styles.skeletonContainer}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <View key={i} style={styles.skeletonItem}>
                    <Skeleton.Rect width="100%" height={180} borderRadius={radius.md} />
                    <Skeleton.Rect width="60%" height={14} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
                    <Skeleton.Rect width="40%" height={12} borderRadius={radius.sm} style={{ marginTop: spacing.xs }} />
                  </View>
                ))}
              </View>
            )
          }
          ListFooterComponent={() =>
            watchHistoryQuery.isFetchingNextPage ? (
              <View style={styles.footer}>
                <Skeleton.Rect width="100%" height={180} borderRadius={radius.md} />
              </View>
            ) : null
          }
          contentContainerStyle={styles.listContainer}
        />
      </View>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  headerSpacer: { height: 100 },
  clearText: {
    color: colors.error,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  listContainer: { paddingBottom: 100, gap: spacing.lg, paddingTop: spacing.sm },
  videoCard: {
    marginHorizontal: spacing.base,
  },
  thumbnailContainer: {
    position: 'relative',
    borderRadius: radius.md,
    overflow: 'hidden',
    aspectRatio: 16 / 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  durationText: {
    color: colors.text.primary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 3,
    backgroundColor: colors.emerald,
    borderRadius: 1.5,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  channelIconBg: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoDetails: {
    flex: 1,
  },
  videoTitle: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
    marginBottom: 2,
  },
  channelName: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginBottom: 2,
  },
  videoStats: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
  },
  skeletonContainer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    gap: spacing.lg,
  },
  skeletonItem: {
    gap: spacing.sm,
  },
  footer: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.lg,
  },
});