import { useState, useCallback } from 'react';
import {
  View, StyleSheet, FlatList, Alert, Pressable, useWindowDimensions, type ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, radius } from '@/theme';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { showToast } from '@/components/ui/Toast';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { storiesApi } from '@/services/api';
import type { Story } from '@/types';
import { useStore } from '@/store';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

const GRID_COLUMNS = 3;
const GRID_GAP = spacing.xs;
const HEADER_OFFSET = spacing['2xl'] * 3;

export default function ArchiveScreen() {
  const router = useRouter();
  const tc = useThemeColors();
  const haptic = useContextualHaptic();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const ITEM_SIZE = (screenWidth - GRID_GAP * (GRID_COLUMNS + 1)) / GRID_COLUMNS;
  const queryClient = useQueryClient();
  const user = useStore((s) => s.user);
  const userId = user?.id;
  const { t } = useTranslation();

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
      haptic.success();
      showToast({ message: t('screens.archive.unarchived'), variant: 'success' });
    },
    onError: () => {
      showToast({ message: t('common.somethingWentWrong'), variant: 'error' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (storyId: string) => storiesApi.delete(storyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stories', 'archive', userId] });
      setBottomSheetVisible(false);
      haptic.success();
      showToast({ message: t('screens.archive.deleted'), variant: 'success' });
    },
    onError: () => {
      showToast({ message: t('common.somethingWentWrong'), variant: 'error' });
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
    haptic.tick();
    setSelectedStory(story);
    setBottomSheetVisible(true);
  }, [haptic]);

  const handleUnarchive = useCallback(() => {
    if (!selectedStory) return;
    haptic.error();
    Alert.alert(
      t('screens.archive.unarchiveAlertTitle'),
      t('screens.archive.unarchiveAlertMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('screens.archive.unarchiveButton'), style: 'default', onPress: () => unarchiveMutation.mutate(selectedStory.id) },
      ]
    );
  }, [selectedStory, unarchiveMutation, haptic, t]);

  const handleDelete = useCallback(() => {
    if (!selectedStory) return;
    haptic.error();
    Alert.alert(
      t('screens.archive.deleteAlertTitle'),
      t('screens.archive.deleteAlertMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: () => deleteMutation.mutate(selectedStory.id) },
      ]
    );
  }, [selectedStory, deleteMutation, haptic, t]);

  const renderGridItem = useCallback(({ item, index }: { item: Story; index: number }) => {
    return (
      <Animated.View entering={FadeInUp.delay(Math.min(index, 15) * 40).duration(350).springify()}>
      <Pressable
        accessibilityLabel={t('accessibility.playAudio')}
        accessibilityRole="button"
        style={({ pressed }) => [styles.gridItem as ViewStyle, { width: ITEM_SIZE, backgroundColor: tc.bgCard }, pressed && { opacity: 0.7 }]}
        onPress={() => handleStoryPress(item)}
        onLongPress={() => handleStoryLongPress(item)}
        delayLongPress={500}
      >
        <ProgressiveImage
          uri={item.thumbnailUrl || item.mediaUrl}
          width="100%"
          height={Math.round(ITEM_SIZE / 0.75)}
        />
        {item.mediaType === 'VIDEO' && (
          <View style={styles.videoBadge as ViewStyle}>
            <Icon name="play" size="xs" color="#FFF" />
          </View>
        )}
      </Pressable>
      </Animated.View>
    );
  }, [handleStoryPress, handleStoryLongPress]);

  const renderSkeleton = useCallback(() => {
    return (
      <View style={styles.skeletonContainer as ViewStyle}>
        <View style={styles.skeletonGrid as ViewStyle}>
          {Array.from({ length: 12 }).map((_, i) => (
            <View key={i} style={styles.skeletonItem as ViewStyle}>
              <Skeleton.Rect width="100%" height={120} borderRadius={radius.sm} />
              <View style={styles.skeletonPlayOverlay as ViewStyle}>
                <Icon name="play" size="xs" color="rgba(255,255,255,0.3)" />
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }, []);

  if (isError) {
    return (
      <View style={[styles.container as ViewStyle, { backgroundColor: tc.bg }]}>
        <GlassHeader title={t('screens.archive.title')} leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }} />
        <EmptyState
          icon="flag"
          title={t('screens.archive.errorTitle')}
          subtitle={t('screens.archive.errorSubtitle')}
          actionLabel={t('common.retry')}
          onAction={() => refetch()}
        />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container as ViewStyle, { backgroundColor: tc.bg }]}>
        <GlassHeader title={t('screens.archive.title')} leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }} />
        {renderSkeleton()}
      </View>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container as ViewStyle, { backgroundColor: tc.bg }]}>
        <GlassHeader title={t('screens.archive.title')} leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }} />

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
                title={t('screens.archive.emptyTitle')}
                subtitle={t('screens.archive.emptySubtitle')}
              />
            </View>
          }
          refreshControl={
            <BrandedRefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
            />
          }
        />

        <BottomSheet
          visible={bottomSheetVisible}
          onClose={() => { setBottomSheetVisible(false); setSelectedStory(null); }}
        >
          <BottomSheetItem
            label={t('screens.archive.unarchiveLabel')}
            icon={<Icon name="repeat" size="md" color={tc.text.primary} />}
            onPress={handleUnarchive}
          />
          <BottomSheetItem
            label={t('common.delete')}
            icon={<Icon name="trash" size="md" color={colors.error} />}
            onPress={handleDelete}
            destructive
          />
        </BottomSheet>
      </View>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gridContainer: {
    padding: GRID_GAP,
  },
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: GRID_GAP,
  },
  gridItem: {
    aspectRatio: 0.75,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  videoBadge: {
    position: 'absolute',
    bottom: spacing.xs,
    end: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: radius.full,
    padding: spacing.xs,
  },
  skeletonContainer: {
    paddingTop: HEADER_OFFSET,
    flex: 1,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: GRID_GAP,
    gap: GRID_GAP,
  },
  skeletonItem: {
    width: `${(100 - (GRID_COLUMNS - 1) * 2) / GRID_COLUMNS}%`,
    aspectRatio: 0.75,
    borderRadius: radius.sm,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  skeletonPlayOverlay: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    marginTop: spacing['2xl'],
  },
});