import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient, useQueries } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, fontSize, radius } from '@/theme';
import { channelsApi, playlistsApi } from '@/services/api';
import type { Playlist } from '@/types';

export default function SaveToPlaylistScreen() {
  const { videoId } = useLocalSearchParams<{ videoId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [loadingPlaylistIds, setLoadingPlaylistIds] = useState<Set<string>>(new Set());
  const [inPlaylistMap, setInPlaylistMap] = useState<Record<string, boolean>>({});
  const insets = useSafeAreaInsets();

  // Fetch user's channels
  const channelsQuery = useQuery({
    queryKey: ['my-channels'],
    queryFn: () => channelsApi.getMyChannels(),
  });

  const channels = channelsQuery.data || [];

  // Fetch playlists for each channel, flattened
  const playlistsQuery = useQuery({
    queryKey: ['channel-playlists', channels.map(c => c.id)],
    queryFn: async () => {
      const allPlaylists: Playlist[] = [];
      for (const channel of channels) {
        try {
          const resp = await playlistsApi.getByChannel(channel.id);
          allPlaylists.push(...resp.data);
        } catch (err) {
          // ignore individual channel errors
        }
      }
      return allPlaylists;
    },
    enabled: channels.length > 0,
  });

  const playlists = playlistsQuery.data || [];
  const isLoading = channelsQuery.isLoading || playlistsQuery.isLoading;
  const isError = channelsQuery.isError || playlistsQuery.isError;

  // For each playlist, check if video is already in it
  const inclusionQueries = useQueries({
    queries: playlists.map(playlist => ({
      queryKey: ['playlist-inclusion', playlist.id, videoId],
      queryFn: async () => {
        const items = await playlistsApi.getItems(playlist.id);
        return items.data.some(item => item.video.id === videoId);
      },
      enabled: !!videoId && playlists.length > 0,
    })),
  });

  // Update inclusion map when queries resolve
  useMemo(() => {
    const newMap: Record<string, boolean> = {};
    playlists.forEach((playlist, idx) => {
      if (inclusionQueries[idx]?.data !== undefined) {
        newMap[playlist.id] = inclusionQueries[idx].data!;
      }
    });
    setInPlaylistMap(newMap);
  }, [playlists, inclusionQueries]);

  const addMutation = useMutation({
    mutationFn: ({ playlistId }: { playlistId: string }) =>
      playlistsApi.addItem(playlistId, videoId!),
  });

  const removeMutation = useMutation({
    mutationFn: ({ playlistId }: { playlistId: string }) =>
      playlistsApi.removeItem(playlistId, videoId!),
  });

  const togglePlaylist = useCallback(async (playlist: Playlist) => {
    const currentlyIn = inPlaylistMap[playlist.id] || false;
    setLoadingPlaylistIds(prev => new Set(prev).add(playlist.id));
    try {
      if (currentlyIn) {
        await removeMutation.mutateAsync({ playlistId: playlist.id });
        setInPlaylistMap(prev => ({ ...prev, [playlist.id]: false }));
      } else {
        await addMutation.mutateAsync({ playlistId: playlist.id });
        setInPlaylistMap(prev => ({ ...prev, [playlist.id]: true }));
      }
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['playlist-inclusion', playlist.id, videoId] });
      queryClient.invalidateQueries({ queryKey: ['playlist-items', playlist.id] });
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      const message = err?.response?.data?.message || err.message || 'Unknown error';
      Alert.alert('Error', `Could not update playlist: ${message}`);
    } finally {
      setLoadingPlaylistIds(prev => {
        const next = new Set(prev);
        next.delete(playlist.id);
        return next;
      });
    }
  }, [videoId, inPlaylistMap, addMutation, removeMutation, queryClient]);

  const handleCreateNew = () => {
    // TODO: navigate to create playlist screen
    Alert.alert('Coming soon', 'Create playlist feature will be added later');
  };

  const renderPlaylistItem = ({ item }: { item: Playlist }) => {
    const isLoading = loadingPlaylistIds.has(item.id);
    const isInPlaylist = inPlaylistMap[item.id] || false;
    const inclusionLoading = inclusionQueries.find(q => q.data !== undefined && q.queryKey[1] === item.id)?.isLoading;

    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => togglePlaylist(item)}
        disabled={isLoading || inclusionLoading}
      >
        <View style={styles.rowLeft}>
          <Icon name="layers" size="md" color={colors.text.secondary} />
          <View style={styles.playlistInfo}>
            <Text style={styles.playlistName} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.playlistMeta}>{item.videosCount} videos</Text>
          </View>
        </View>
        {isLoading || inclusionLoading ? (
          <ActivityIndicator size="small" color={colors.emerald} />
        ) : (
          <Icon
            name={isInPlaylist ? 'check-circle' : 'circle-plus'}
            size="md"
            color={isInPlaylist ? colors.emerald : colors.text.tertiary}
          />
        )}
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title="Save to playlist"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Back' }}
        />
        <View style={[styles.content, { paddingTop: insets.top + 60 }]}>
          <Skeleton.Rect width="100%" height={56} borderRadius={radius.sm} style={{ marginBottom: spacing.sm }} />
          <Skeleton.Rect width="100%" height={56} borderRadius={radius.sm} style={{ marginBottom: spacing.sm }} />
          <Skeleton.Rect width="100%" height={56} borderRadius={radius.sm} />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title="Save to playlist"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Back' }}
        />
        <View style={{ paddingTop: insets.top + 60 }}>
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

  return (
    <View style={styles.container}>
      <GlassHeader
        title="Save to playlist"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Back' }}
        rightActions={[{
          icon: <Text style={styles.createText}>New</Text>,
          onPress: handleCreateNew,
          accessibilityLabel: 'Create new playlist',
        }]}
      />

      <FlatList
        data={playlists}
        keyExtractor={(item) => item.id}
        renderItem={renderPlaylistItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await Promise.all([channelsQuery.refetch(), playlistsQuery.refetch()]);
              setRefreshing(false);
            }}
            tintColor={colors.emerald}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="layers"
            title="No playlists yet"
            subtitle="Create a playlist to save videos for later"
            actionLabel="Create playlist"
            onAction={handleCreateNew}
            style={styles.emptyState}
          />
        }
        contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 52 }]}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  createText: {
    color: colors.emerald,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.dark.border,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  playlistInfo: {
    flex: 1,
  },
  playlistName: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '500',
  },
  playlistMeta: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  emptyState: {
    marginTop: spacing.xl,
  },
});