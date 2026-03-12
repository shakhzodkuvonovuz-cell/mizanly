import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius } from '@/theme';
import { bookmarksApi } from '@/services/api';
import type { BookmarkCollection } from '@/types';
import { useHaptic } from '@/hooks/useHaptic';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function BookmarkCollectionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const [refreshing, setRefreshing] = useState(false);

  const { data: collections, isLoading, isError, refetch } = useQuery({
    queryKey: ['bookmark-collections'],
    queryFn: () => bookmarksApi.getCollections(),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    haptic.light();
    await refetch();
    setRefreshing(false);
  }, [refetch, haptic]);

  const renderItem = ({ item }: { item: BookmarkCollection }) => (
    <Pressable 
      style={styles.card}
      onPress={() => {
        haptic.light();
        router.push(`/(screens)/saved?collection=${encodeURIComponent(item.name)}` as never);
      }}
    >
      <View style={styles.coverWrap}>
        {item.thumbnailUrl ? (
          <Image source={{ uri: item.thumbnailUrl }} style={styles.cover} contentFit="cover" />
        ) : (
          <View style={[styles.cover, styles.placeholderCover]}>
            <Icon name="bookmark" size={32} color={colors.text.tertiary} />
          </View>
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.count}>{item.count} saved</Text>
      </View>
    </Pressable>
  );

  if (isError) {
    return (
      <View style={styles.container}>
        <GlassHeader 
          title="Saved Collections" 
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }} 
        />
        <View style={{ height: insets.top + 52 }} />
        <EmptyState 
          icon="bookmark" 
          title="Couldn't load collections" 
          subtitle="Check your connection and try again" 
          actionLabel="Retry" 
          onAction={() => refetch()} 
        />
      </View>
    );
  }

  if (isLoading && !collections) {
    const itemWidth = (SCREEN_WIDTH - spacing.base * 2 - spacing.md) / 2;
    return (
      <View style={styles.container}>
        <GlassHeader 
          title="Saved Collections" 
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }} 
        />
        <View style={{ height: insets.top + 52 }} />
        <View style={{ padding: spacing.base, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <Skeleton.Rect width={itemWidth} height={itemWidth + 60} borderRadius={radius.md} />
          <Skeleton.Rect width={itemWidth} height={itemWidth + 60} borderRadius={radius.md} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GlassHeader 
        title="Saved Collections" 
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }} 
      />
      
      <FlatList
        data={collections || []}
        renderItem={renderItem}
        keyExtractor={(item) => item.name}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 52 + spacing.md }]}
        removeClippedSubviews={true}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <EmptyState 
              icon="bookmark" 
              title="No collections" 
              subtitle="Save posts, videos, and threads directly to collections" 
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
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['2xl'],
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  emptyWrap: {
    marginTop: spacing['2xl'],
  },
  card: {
    flex: 1,
    maxWidth: (SCREEN_WIDTH - spacing.base * 2 - spacing.md) / 2,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  coverWrap: {
    width: '100%',
    aspectRatio: 1,
  },
  cover: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.dark.bgElevated,
  },
  placeholderCover: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    padding: spacing.sm,
    gap: 2,
  },
  name: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text.primary,
  },
  count: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
});
