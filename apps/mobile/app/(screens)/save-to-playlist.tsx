import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList, Alert, RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient, useQueries } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, fontSize, radius } from '@/theme';
import { channelsApi, playlistsApi } from '@/services/api';
import type { Playlist } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

export default function SaveToPlaylistScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { t, isRTL } = useTranslation();
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
      Alert.alert(t('common.error'), `${t('screens.save-to-playlist.updateError')}: ${message}`);
    } finally {
      setLoadingPlaylistIds(prev => {
        const next = new Set(prev);
        next.delete(playlist.id);
        return next;
      });
    }
  }, [videoId, inPlaylistMap, addMutation, removeMutation, queryClient]);

  const handleCreateNew = () => {
    router.push('/(screens)/create-playlist');
  };

  const renderPlaylistItem = ({ item, index }: { item: Playlist; index: number }) => {
    const isLoading = loadingPlaylistIds.has(item.id);
    const isInPlaylist = inPlaylistMap[item.id] || false;
    const inclusionLoading = inclusionQueries[index]?.isLoading;

    return (
      <Animated.View entering={FadeInUp.delay(index * 30).duration(300)}>
        <Pressable
          accessibilityRole="button"
          style={styles.row}
          onPress={() => togglePlaylist(item)}
          disabled={isLoading || inclusionLoading}
        >
          <LinearGradient
            colors={isInPlaylist ? ['rgba(10,123,79,0.15)', 'rgba(10,123,79,0.05)'] : ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.rowGradient}
          >
            <View style={styles.rowLeft}>
              <LinearGradient
                colors={isInPlaylist ? ['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)'] : ['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.1)']}
                style={styles.iconBg}
              >
                <Icon name="layers" size="md" color={isInPlaylist ? colors.emerald : colors.text.secondary} />
              </LinearGradient>
              <View style={styles.playlistInfo}>
                <Text style={[styles.playlistName, isInPlaylist && styles.playlistNameActive]} numberOfLines={1}>{item.title}</Text>
                <View style={styles.metaRow}>
                  <Icon name="video" size={10} color={colors.text.tertiary} />
                  <Text style={styles.playlistMeta}>{item.videosCount} {t('screens.save-to-playlist.videos')}</Text>
                </View>
              </View>
            </View>
            {isLoading || inclusionLoading ? (
              <Skeleton.Circle size={36} />
            ) : (
              <LinearGradient
                colors={isInPlaylist ? [colors.emerald, colors.gold] : ['transparent', 'transparent']}
                style={styles.checkBg}
              >
                <Icon
                  name={isInPlaylist ? 'check' : 'circle-plus'}
                  size="md"
                  color={isInPlaylist ? '#fff' : colors.text.tertiary}
                />
              </LinearGradient>
            )}
          </LinearGradient>
        </Pressable>
      </Animated.View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title={t('screens.save-to-playlist.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
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
          title={t('screens.save-to-playlist.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
        />
        <View style={{ paddingTop: insets.top + 60 }}>
          <EmptyState
            icon="slash"
            title={t('screens.save-to-playlist.errorTitle')}
            subtitle={t('screens.save-to-playlist.errorSubtitle')}
            actionLabel={t('accessibility.goBack')}
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
          title={t('screens.save-to-playlist.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
          rightActions={[{
            icon: <Text style={styles.createText}>{t('screens.save-to-playlist.newPlaylist')}</Text>,
            onPress: handleCreateNew,
            accessibilityLabel: t('screens.save-to-playlist.newPlaylist'),
          }]}
        />

        <FlatList
              removeClippedSubviews={true}
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
              title={t('screens.save-to-playlist.emptyTitle')}
              subtitle={t('screens.save-to-playlist.emptySubtitle')}
              actionLabel={t('common.create')}
              onAction={handleCreateNew}
              style={styles.emptyState}
            />
          }
          contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 52 }]}
          showsVerticalScrollIndicator={false}
        />
      </View>
  
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc.bg },
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
    gap: spacing.sm,
  },
  row: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  rowGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  iconBg: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playlistInfo: {
    flex: 1,
  },
  playlistName: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  playlistNameActive: {
    color: colors.emerald,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  playlistMeta: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
  },
  checkBg: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    marginTop: spacing.xl,
  },
});