import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius } from '@/theme';
import { audioTracksApi } from '@/services/api';
import type { AudioTrack } from '@/types';
import { useHaptic } from '@/hooks/useHaptic';

export default function TrendingAudioScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const [refreshing, setRefreshing] = useState(false);

  const { data: tracks, isLoading, isError, refetch } = useQuery({
    queryKey: ['trending-audio'],
    queryFn: () => audioTracksApi.getTrending(),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    haptic.light();
    await refetch();
    setRefreshing(false);
  }, [refetch, haptic]);

  const formatDuration = (seconds: number) => {
    const Math = global.Math; // To avoid linter issues if Math isn't globally typed
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatUsage = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M reels`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K reels`;
    return `${count} reels`;
  };

  const renderItem = ({ item, index }: { item: AudioTrack; index: number }) => (
    <View style={styles.row}>
      <Text style={styles.rank}>{index + 1}</Text>
      
      <View style={styles.coverWrap}>
        {item.coverUrl ? (
          <Image source={{ uri: item.coverUrl }} style={styles.cover} contentFit="cover" />
        ) : (
          <View style={[styles.cover, styles.placeholderCover]}>
            <Icon name="music" size={20} color={colors.text.tertiary} />
          </View>
        )}
      </View>

      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.artist} numberOfLines={1}>{item.artist}</Text>
        <Text style={styles.stats}>
          {formatDuration(item.duration)} • {formatUsage(item.usageCount)}
        </Text>
      </View>

      <Pressable 
        style={styles.useButton}
        onPress={() => {
          haptic.light();
          router.push(`/(screens)/create-reel?audioId=${item.id}` as never);
        }}
      >
        <Text style={styles.useButtonText}>Use</Text>
      </Pressable>
    </View>
  );

  if (isError) {
    return (
      <View style={styles.container}>
        <GlassHeader 
          title="Trending Audio" 
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }} 
        />
        <View style={{ height: insets.top + 52 }} />
        <EmptyState 
          icon="music" 
          title="Couldn't load audio" 
          subtitle="Check your connection and try again" 
          actionLabel="Retry" 
          onAction={() => refetch()} 
        />
      </View>
    );
  }

  if (isLoading && !tracks) {
    return (
      <View style={styles.container}>
        <GlassHeader 
          title="Trending Audio" 
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }} 
        />
        <View style={{ height: insets.top + 52 }} />
        <View style={{ padding: spacing.base, gap: spacing.md }}>
          <Skeleton.Rect width="100%" height={70} borderRadius={radius.md} />
          <Skeleton.Rect width="100%" height={70} borderRadius={radius.md} />
          <Skeleton.Rect width="100%" height={70} borderRadius={radius.md} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GlassHeader 
        title="Trending Audio" 
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }} 
      />
      
      <FlatList
        data={tracks || []}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 52 + spacing.md }]}
        removeClippedSubviews={true}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <EmptyState 
              icon="music" 
              title="No trending audio" 
              subtitle="Check back later for popular tracks" 
            />
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: colors.dark.bg 
  },
  listContent: {
    paddingBottom: spacing['2xl'],
  },
  emptyWrap: {
    marginTop: spacing['2xl'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rank: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text.tertiary,
    width: 24,
    textAlign: 'center',
  },
  coverWrap: {
    width: 50,
    height: 50,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  cover: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.dark.surface,
  },
  placeholderCover: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  title: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text.primary,
  },
  artist: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  stats: {
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  useButton: {
    backgroundColor: colors.active.emerald10,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  useButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.emerald,
  },
});
