import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, Pressable, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RefreshControl } from 'react-native-gesture-handler';
import { colors, spacing, radius } from '@/theme';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { BottomSheetItem } from '@/components/ui/BottomSheetItem';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { storiesApi } from '@/services/api';
import type { Story } from '@/types';
import { useStore } from '@/store';

const GRID_COLUMNS = 3;
const GRID_GAP = spacing.xs;
const ITEM_SIZE = (100 / GRID_COLUMNS) + '%';

export default function ArchiveScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useStore((s) => s.user);
  const userId = user?.id;

  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [bottomSheetVisible, setBottomSheetVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { data: stories = [], isLoading, refetch } = useQuery({
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
        style={styles.gridItem}
        onPress={() => handleStoryPress(item)}
        onLongPress={() => handleStoryLongPress(item)}
        delayLongPress={500}
      >
        <Image
          source={{ uri: item.thumbnailUrl || item.mediaUrl }}
          style={styles.thumbnail}
          contentFit="cover"
          transition={200}
        />
        {item.mediaType === 'VIDEO' && (
          <View style={styles.videoBadge}>
            <Icon name="play" size="xs" color="#FFF" />
          </View>
        )}
      </Pressable>
    );
  }, [handleStoryPress, handleStoryLongPress]);

  const renderSkeleton = useCallback(() => {
    return (
      <View style={styles.skeletonGrid}>
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton.Rect key={i} width="100%" height={100} borderRadius={radius.sm} />
        ))}
      </View>
    );
  }, []);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Icon name="arrow-left" size="md" color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.title}>Archive</Text>
          <View style={styles.headerRight} />
        </View>
        {renderSkeleton()}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Icon name="arrow-left" size="md" color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>Archive</Text>
        <View style={styles.headerRight} />
      </View>

      <FlatList
        data={stories}
        renderItem={renderGridItem}
        keyExtractor={(item) => item.id}
        numColumns={GRID_COLUMNS}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.gridContainer}
        ListEmptyComponent={
          <EmptyState
            icon="clock"
            title="No archived stories"
            subtitle="Stories you archive will appear here"
            style={styles.emptyState}
          />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.dark.border,
  },
  backButton: {
    padding: spacing.xs,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text.primary,
  },
  headerRight: {
    width: 40,
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