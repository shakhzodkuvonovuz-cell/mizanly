import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, fontSize, radius } from '@/theme';
import { playlistsApi } from '@/services/api';
import type { PlaylistItem } from '@/types';

const formatDuration = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function PlaylistDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const insets = useSafeAreaInsets();
  const playlistId = Array.isArray(params.id) ? params.id[0] : params.id;

  const playlistQuery = useQuery({
    queryKey: ['playlist', playlistId],
    queryFn: () => playlistsApi.getById(playlistId!),
    enabled: !!playlistId,
  });

  const itemsQuery = useInfiniteQuery({
    queryKey: ['playlist-items', playlistId],
    queryFn: ({ pageParam }) => playlistsApi.getItems(playlistId!, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: { meta?: { hasMore?: boolean; cursor?: string } }) => last.meta?.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: !!playlistId,
  });

  const items: PlaylistItem[] = itemsQuery.data?.pages.flatMap((p) => p.data) ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([playlistQuery.refetch(), itemsQuery.refetch()]);
    setRefreshing(false);
  }, [playlistQuery, itemsQuery]);

  const onEndReached = useCallback(() => {
    if (itemsQuery.hasNextPage && !itemsQuery.isFetchingNextPage) {
      itemsQuery.fetchNextPage();
    }
  }, [itemsQuery.hasNextPage, itemsQuery.isFetchingNextPage, itemsQuery.fetchNextPage]);

  const playlist = playlistQuery.data;

  const renderItem = ({ item }: { item: PlaylistItem }) => (
    <TouchableOpacity
      style={styles.videoRow}
      activeOpacity={0.7}
      onPress={() => router.push(`/(screens)/video/${item.video.id}`)}
      accessibilityLabel={`Watch video: ${item.video.title}`}
      accessibilityRole="button"
    >
      <View style={styles.thumbWrap}>
        {item.video.thumbnailUrl && (
          <Image
            source={{ uri: item.video.thumbnailUrl }}
            style={styles.thumb}
            contentFit="cover"
          />
        )}
        {item.video.duration > 0 && (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>
              {formatDuration(item.video.duration)}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.videoInfo}>
        <Text style={styles.videoTitle} numberOfLines={2}>
          {item.video.title}
        </Text>
        <Text style={styles.channelName} numberOfLines={1}>
          {item.video.channel.name}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const ListHeader = () => (
    <View style={styles.playlistHeader}>
      {playlist?.thumbnailUrl && (
        <Image source={{ uri: playlist.thumbnailUrl }} style={styles.playlistThumb} contentFit="cover" />
      )}
      <Text style={styles.playlistTitle}>{playlist?.title ?? ''}</Text>
      {playlist?.description ? (
        <Text style={styles.playlistDesc}>{playlist.description}</Text>
      ) : null}
      <Text style={styles.videoCount}>
        {playlist?.videosCount ?? items.length} video{(playlist?.videosCount ?? items.length) !== 1 ? 's' : ''}
      </Text>
    </View>
  );

  if (!playlistId) {
    return (
      <View style={styles.container}>
        <GlassHeader 
          title="Playlist" 
          leftAction={{ 
            icon: 'arrow-left', 
            onPress: () => router.back(),
            accessibilityLabel: 'Go back'
          }} 
        />
        <View style={{ flex: 1, paddingTop: insets.top + 56 }}>
          <EmptyState icon="layers" title="Playlist not found" />
        </View>
      </View>
    );
  }

  // Error state
  if (playlistQuery.isError) {
    return (
      <View style={styles.container}>
        <GlassHeader 
          title="Playlist" 
          leftAction={{ 
            icon: 'arrow-left', 
            onPress: () => router.back(),
            accessibilityLabel: 'Go back'
          }} 
        />
        <View style={{ flex: 1, paddingTop: insets.top + 56 }}>
          <EmptyState
            icon="slash"
            title="Something went wrong"
            subtitle="Could not load playlist. Please try again."
            actionLabel="Go back"
            onAction={() => router.back()}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GlassHeader
        title={playlist?.title ?? 'Playlist'}
        leftAction={{ 
          icon: 'arrow-left', 
          onPress: () => router.back(),
          accessibilityLabel: 'Go back'
        }}
      />

      {playlistQuery.isLoading ? (
        <View style={[styles.skeletonWrap, { paddingTop: insets.top + 56 }]}>
          <Skeleton.Rect width="100%" height={200} borderRadius={radius.md} />
          <Skeleton.Text width="60%" />
          <Skeleton.Text width="40%" />
        </View>
      ) : (
        <FlatList
          removeClippedSubviews={true}
          data={items}
          keyExtractor={(item, i) => item.id ?? String(i)}
          renderItem={renderItem}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            itemsQuery.isLoading ? (
              <View style={styles.skeletonWrap}>
                {[1, 2, 3].map((i) => (
                  <Skeleton.Rect key={i} width="100%" height={80} borderRadius={radius.sm} />
                ))}
              </View>
            ) : itemsQuery.isError ? (
              <EmptyState
                icon="slash"
                title="Could not load videos"
                subtitle="Please pull to refresh"
                actionLabel="Retry"
                onAction={() => itemsQuery.refetch()}
              />
            ) : (
              <EmptyState icon="video" title="No videos yet" subtitle="Videos added to this playlist will appear here" />
            )
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
          }
          contentContainerStyle={[styles.list, { paddingTop: insets.top + 56 }]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  list: { paddingBottom: spacing.xl },
  playlistHeader: { padding: spacing.base, gap: spacing.sm },
  playlistThumb: { width: '100%', height: 200, borderRadius: radius.md },
  playlistTitle: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '700' },
  playlistDesc: { color: colors.text.secondary, fontSize: fontSize.sm },
  videoCount: { color: colors.text.tertiary, fontSize: fontSize.xs },
  videoRow: { flexDirection: 'row', padding: spacing.base, gap: spacing.md },
  thumbWrap: { width: 160, height: 90, borderRadius: radius.md, overflow: 'hidden' },
  thumb: { width: '100%', height: '100%' },
  durationBadge: {
    position: 'absolute', bottom: 4, right: 4,
    backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 4, paddingVertical: 2, borderRadius: radius.sm,
  },
  durationText: { color: '#fff', fontSize: fontSize.xs },
  videoInfo: { flex: 1, justifyContent: 'center', gap: 4 },
  videoTitle: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '500' },
  channelName: { color: colors.text.secondary, fontSize: fontSize.xs },
  skeletonWrap: { padding: spacing.base, gap: spacing.md },
});