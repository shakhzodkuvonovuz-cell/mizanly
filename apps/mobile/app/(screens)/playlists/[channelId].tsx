import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  RefreshControl, FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, fontSize, radius } from '@/theme';
import { playlistsApi } from '@/services/api';
import type { Playlist } from '@/types';

export default function ChannelPlaylistsScreen() {
  const params = useLocalSearchParams<{ channelId: string }>();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const insets = useSafeAreaInsets();
  const channelId = Array.isArray(params.channelId) ? params.channelId[0] : params.channelId;

  // If channelId is missing, show error
  if (!channelId) {
    return (
      <View style={styles.container}>
        <GlassHeader title="Playlists" leftAction={{ icon: 'arrow-left', onPress: () => router.back() }} />
        <View style={{ flex: 1, paddingTop: insets.top + 56 }}>
          <EmptyState
            icon="slash"
            title="Invalid channel"
            subtitle="Channel ID is missing"
            actionLabel="Go back"
            onAction={() => router.back()}
          />
        </View>
      </View>
    );
  }

  // Fetch playlists
  const playlistsQuery = useInfiniteQuery({
    queryKey: ['channel-playlists', channelId],
    queryFn: ({ pageParam }) => playlistsApi.getByChannel(channelId, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: !!channelId,
  });

  const playlists: Playlist[] = playlistsQuery.data?.pages.flatMap((p) => p.data) ?? [];

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

  const renderPlaylistItem = ({ item }: { item: Playlist }) => (
    <TouchableOpacity
      style={styles.playlistCard}
      activeOpacity={0.8}
      onPress={() => router.push(`/(screens)/playlist/${item.id}`)}
    >
      {/* Thumbnail */}
      {item.thumbnailUrl ? (
        <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbnail} />
      ) : (
        <View style={[styles.thumbnail, styles.placeholderThumb]}>
          <Icon name="layers" size="lg" color={colors.text.tertiary} />
        </View>
      )}
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.cardMeta}>{item.videosCount} videos</Text>
      </View>
    </TouchableOpacity>
  );

  // Loading skeleton
  if (playlistsQuery.isLoading) {
    return (
      <View style={styles.container}>
        <GlassHeader title="Playlists" leftAction={{ icon: 'arrow-left', onPress: () => router.back() }} />
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
      <View style={styles.container}>
        <GlassHeader title="Playlists" leftAction={{ icon: 'arrow-left', onPress: () => router.back() }} />
        <View style={{ flex: 1, paddingTop: insets.top + 56 }}>
          <EmptyState
            icon="slash"
            title="Something went wrong"
            subtitle="Could not load playlists. Please try again."
            actionLabel="Go back"
            onAction={() => router.back()}
          />
        </View>
      </View>
    );
  }

  // Empty state
  if (!playlistsQuery.isFetching && playlists.length === 0) {
    return (
      <View style={styles.container}>
        <GlassHeader title="Playlists" leftAction={{ icon: 'arrow-left', onPress: () => router.back() }} />
        <View style={{ flex: 1, paddingTop: insets.top + 56 }}>
          <EmptyState
            icon="layers"
            title="No playlists yet"
            subtitle="This channel hasn't created any playlists"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GlassHeader title="Playlists" leftAction={{ icon: 'arrow-left', onPress: () => router.back() }} />

      <FlatList
            removeClippedSubviews={true}
        data={playlists}
        keyExtractor={(item) => item.id}
        renderItem={renderPlaylistItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 56 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  backBtn: {
    padding: spacing.xs,
  },
  headerTitle: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  headerRight: {
    width: 40, // balance spacing
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  playlistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  thumbnail: {
    width: 120,
    height: 68,
    borderRadius: radius.sm,
    backgroundColor: colors.dark.bgCard,
  },
  placeholderThumb: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dark.surface,
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
  cardMeta: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
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