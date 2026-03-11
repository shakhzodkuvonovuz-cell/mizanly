import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable,
  FlatList, Alert, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, fontSize, radius } from '@/theme';
import { usersApi } from '@/services/api';

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

function VideoCard({ item, onPress }: { item: WatchHistoryItem; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.videoCard}
      activeOpacity={0.8}
      onPress={onPress}
    >
      {/* Thumbnail with progress bar */}
      <View style={styles.thumbnailContainer}>
        {item.thumbnailUrl ? (
          <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbnail} />
        ) : (
          <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
            <Icon name="video" size="lg" color={colors.text.secondary} />
          </View>
        )}
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
        </View>
        {/* Progress bar */}
        {item.progress > 0 && !item.completed && (
          <View style={[styles.progressBar, { width: `${item.progress * 100}%` }]} />
        )}
      </View>

      {/* Info row */}
      <View style={styles.infoRow}>
        <View style={styles.videoDetails}>
          <Text style={styles.videoTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.channelName} numberOfLines={1}>
            {item.channel.name}
          </Text>
          <Text style={styles.videoStats} numberOfLines={1}>
            {formatViews(item.viewsCount)} views • {formatDuration(item.duration)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function WatchHistoryScreen() {
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
      'Clear watch history?',
      'This will remove all videos from your watch history and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
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

  return (
    <View style={styles.container}>
      <GlassHeader
        title="Watch History"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }}
        rightActions={[{
          icon: <Text style={styles.clearText}>Clear</Text>,
          onPress: handleClear,
          accessibilityLabel: 'Clear watch history',
        }]}
      />
      <View style={styles.headerSpacer} />

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
        }
        renderItem={({ item }) => (
          <VideoCard item={item} onPress={() => handleVideoPress(item)} />
        )}
        ListEmptyComponent={() =>
          !watchHistoryQuery.isLoading ? (
            <EmptyState
              icon="clock"
              title="Your watch history is empty"
              subtitle="Videos you watch will show up here so you can easily find them again"
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
  listContainer: { paddingBottom: 100 },
  videoCard: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.lg,
  },
  thumbnailContainer: {
    position: 'relative',
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.dark.surface,
    aspectRatio: 16 / 9,
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
    backgroundColor: 'rgba(0,0,0,0.8)',
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