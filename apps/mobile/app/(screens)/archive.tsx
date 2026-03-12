import { useState, useCallback } from 'react';
import {
  View, StyleSheet, FlatList, Alert, Pressable, type ViewStyle, type ImageStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { RefreshControl } from 'react-native-gesture-handler';
import { colors, spacing, radius } from '@/theme';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { storiesApi } from '@/services/api';
import type { Story } from '@/types';
import { useStore } from '@/store';

const GRID_COLUMNS = 3;
const GRID_GAP = spacing.xs;
const ITEM_SIZE = `${100 / GRID_COLUMNS}%` as const;

export default function ArchiveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const user = useStore((s) => s.user);
  const userId = user?.id;

  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [bottomSheetVisible, setBottomSheetVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { data: stories = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['stories', 'archive', userId],
    queryFn: () => storiesApi.getArchived(),
    enabled: !!userId,
  });

  const unarchiveMutation = useMutation({
    mutationFn: (storyId: string) => storiesApi.unarchive(storyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stories', 'archive', userId] });
      setBottomSheetVisible(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (storyId: string) => {
      return storiesApi.delete(storyId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stories', 'archive', userId] });
      setBottomSheetVisible(false);
    },
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleStoryPress = useCallback((story: Story) => {
    // Navigate to story viewer with archive flag
    router.push({
      pathname: '/(screens)/story-viewer',
      params: { storyId: story.id, archive: 'true' },
    });
  }, [router]);

  const handleStoryLongPress = useCallback((story: Story) => {
    setSelectedStory(story);
    setBottomSheetVisible(true);
  }, []);

  const handleUnarchive = useCallback(() => {
    if (!selectedStory) return;
    Alert.alert(
      'Unarchive Story',
      'This story will be restored to your profile. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unarchive', style: 'default', onPress: () => unarchiveMutation.mutate(selectedStory.id) },
      ]
    );
  }, [selectedStory, unarchiveMutation]);

  const handleDelete = useCallback(() => {
    if (!selectedStory) return;
    Alert.alert(
      'Delete Story',
      'This story will be permanently deleted. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(selectedStory.id) },
      ]
    );
  }, [selectedStory, deleteMutation]);

  const renderGridItem = useCallback(({ item }: { item: Story }) => {
    return (
      <Pressable
        style={styles.gridItem as ViewStyle}
        onPress={() => handleStoryPress(item)}
        onLongPress={() => handleStoryLongPress(item)}
        delayLongPress={500}
      >
        <Image
          source={{ uri: item.thumbnailUrl || item.mediaUrl }}
          style={styles.thumbnail as ImageStyle}
          contentFit="cover"
          transition={200}
        />
        {item.mediaType === 'VIDEO' && (
          <View style={styles.videoBadge as ViewStyle}>
            <Icon name="play" size="xs" color="#FFF" />
          </View>
        )}
      </Pressable>
    );
  }, [handleStoryPress, handleStoryLongPress]);

  const renderSkeleton = useCallback(() => {
    return (
      <View style={styles.skeletonGrid as ViewStyle}>
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton.Rect key={i} width="100%" height={100} borderRadius={radius.sm} />
        ))}
      </View>
    );
  }, []);

  if (isError) {
    return (
      <View style={styles.container as ViewStyle}>
        <GlassHeader title="Archive" leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Back' }} />
        <EmptyState
          icon="flag"
          title="Couldn't load content"
          subtitle="Check your connection and try again"
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.container as ViewStyle}>
        <GlassHeader title="Archive" leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Back' }} />
        {renderSkeleton()}
      </View>
    );
  }

  return (
    <View style={styles.container as ViewStyle}>
      <GlassHeader title="Archive" leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Back' }} />

      <FlatList
          removeClippedSubviews={true}
        data={stories}
        renderItem={renderGridItem}
        keyExtractor={(item) => item.id}
        numColumns={GRID_COLUMNS}
        columnWrapperStyle={styles.gridRow as ViewStyle}
        contentContainerStyle={[styles.gridContainer as ViewStyle, { paddingTop: insets.top + 52 }]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <EmptyState
              icon="clock"
              title="No archived stories"
              subtitle="Stories you archive will appear here"
            />
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.emerald}
          />
        }
      />

      <BottomSheet
        visible={bottomSheetVisible}
        onClose={() => setBottomSheetVisible(false)}
      >
        <BottomSheetItem
          label="Unarchive"
          icon={<Icon name="repeat" size="md" color={colors.text.primary} />}
          onPress={handleUnarchive}
        />
        <BottomSheetItem
          label="Delete"
          icon={<Icon name="trash" size="md" color={colors.error} />}
          onPress={handleDelete}
          destructive
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  gridContainer: {
    padding: GRID_GAP,
  },
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: GRID_GAP,
  },
  gridItem: {
    width: ITEM_SIZE,
    aspectRatio: 0.75,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.dark.bgCard,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  videoBadge: {
    position: 'absolute',
    bottom: spacing.xs,
    right: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: radius.full,
    padding: spacing.xs,
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