import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable, FlatList,
  Dimensions, Alert,
} from 'react-native';
import { showToast } from '@/components/ui/Toast';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { bookmarksApi } from '@/services/api';
import type { BookmarkCollection } from '@/types';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';

const SCREEN_W = Dimensions.get('window').width;
const FOLDER_CARD_WIDTH = (SCREEN_W - spacing.base * 2 - spacing.sm) / 2;

type Folder = {
  id: string;
  name: string;
  count: number;
};

type FolderCardProps = {
  folder: Folder;
  onPress: () => void;
  onLongPress: () => void;
};

function FolderCard({ folder, onPress, onLongPress }: FolderCardProps) {
  const itemCount = folder.count;
  const { t } = useTranslation();
  const tc = useThemeColors();
  // For now, no cover thumbnail; we could later fetch first item's image
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.folderCard, { backgroundColor: tc.bgCard }, pressed && { opacity: 0.7 }]}
      android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
    >
      <View style={[styles.folderIcon, { backgroundColor: tc.bgElevated }]}>
        <Icon name="bookmark" size="xl" color={colors.gold} />
      </View>
      <Text style={[styles.folderName, { color: tc.text.primary }]} numberOfLines={1}>{folder.name}</Text>
      <Text style={[styles.folderCount, { color: tc.text.tertiary }]}>
        {t('screens.bookmarkFolders.itemsCount', { count: itemCount })}
      </Text>
    </Pressable>
  );
}

export default function BookmarkFoldersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const tc = useThemeColors();
  const haptic = useContextualHaptic();
  // Collections are now fetched from API via collectionsQuery
  const [refreshing, setRefreshing] = useState(false);
  const [createSheetVisible, setCreateSheetVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const collectionsQuery = useQuery({
    queryKey: ['bookmark-collections'],
    queryFn: () => bookmarksApi.getCollections(),
    staleTime: 30_000,
  });

  const collections: BookmarkCollection[] = (collectionsQuery.data ?? []) as BookmarkCollection[];
  const loading = collectionsQuery.isLoading;

  const foldersArray: Folder[] = collections.map((c) => ({
    id: c.name,
    name: c.name,
    count: c.count,
  }));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    collectionsQuery.refetch().finally(() => setRefreshing(false));
  }, [collectionsQuery]);

  const handleCreateFolder = useCallback(async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) {
      haptic.error();
      showToast({ message: t('screens.bookmarkFolders.emptyNameError'), variant: 'error' });
      return;
    }
    haptic.success();
    // Collections are implicit in the backend (created when first bookmark is saved to them).
    // Inform the user the folder name is ready — it will appear when they save a bookmark to it.
    showToast({ message: t('screens.bookmarkFolders.collectionCreatedHint'), variant: 'success' });
    setNewFolderName('');
    setCreateSheetVisible(false);
    collectionsQuery.refetch();
  }, [newFolderName, collectionsQuery, t, haptic]);

  const handleDeleteFolder = useCallback(async (folderName: string) => {
    haptic.delete();
    Alert.alert(
      t('screens.bookmarkFolders.deleteAlertTitle'),
      t('screens.bookmarkFolders.deleteAlertMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('screens.bookmarkFolders.deleteButton'),
          style: 'destructive',
          onPress: async () => {
            try {
              // Fetch all saved posts in this collection and move them to 'default'
              const postsRes = await bookmarksApi.getSavedPosts(folderName);
              const posts = postsRes?.data ?? [];
              await Promise.all(
                posts.map((post: { id: string }) =>
                  bookmarksApi.moveToCollection(post.id, 'default').catch(() => {})
                )
              );
              collectionsQuery.refetch();
            } catch {
              showToast({ message: t('screens.bookmarkFolders.deleteFailed'), variant: 'error' });
              collectionsQuery.refetch();
            }
          },
        },
      ]
    );
  }, [collectionsQuery, t, haptic]);

  const handleFolderPress = useCallback((collectionName: string) => {
    haptic.navigate();
    router.push(`/(screens)/saved?collection=${encodeURIComponent(collectionName)}`);
  }, [router, haptic]);

  if (collectionsQuery.isError) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader title={t('screens.bookmarkFolders.title')} leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }} />
        <View style={{ paddingTop: insets.top + 52 }}>
          <EmptyState
            icon="bookmark"
            title={t('screens.bookmarkFolders.errorTitle')}
            subtitle={t('screens.bookmarkFolders.errorSubtitle')}
            actionLabel={t('common.retry')}
            onAction={() => collectionsQuery.refetch()}
          />
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader title={t('screens.bookmarkFolders.title')} leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }} />
        <View style={[styles.skeletonGrid, { paddingTop: insets.top + 52 }]}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton.Rect key={i} width={FOLDER_CARD_WIDTH} height={FOLDER_CARD_WIDTH} borderRadius={radius.md} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader title={t('screens.bookmarkFolders.title')} leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }} />

        <FlatList
            removeClippedSubviews={true}
          data={foldersArray}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          refreshControl={
            <BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInUp.delay(Math.min(index, 15) * 40).duration(350).springify()}>
              <FolderCard
                folder={item}
                onPress={() => handleFolderPress(item.id)}
                onLongPress={() => handleDeleteFolder(item.name)}
              />
            </Animated.View>
          )}
          ListEmptyComponent={() => (
            <EmptyState
              icon="bookmark"
              title={t('screens.bookmarkFolders.emptyTitle')}
              subtitle={t('screens.bookmarkFolders.emptySubtitle')}
              actionLabel={t('screens.bookmarkFolders.createFolderButton')}
              onAction={() => setCreateSheetVisible(true)}
            />
          )}
          contentContainerStyle={[styles.gridContainer, { paddingTop: insets.top + 52 }]}
        />

        {/* FAB */}
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.fab, pressed && { opacity: 0.8 }]}
          onPress={() => { haptic.tick(); setCreateSheetVisible(true); }}
          hitSlop={8}
          accessibilityLabel={t('screens.bookmarkFolders.createFolderLabel')}
        >
          <Icon name="plus" size="lg" color={tc.text.primary} />
        </Pressable>

        {/* Create Folder BottomSheet */}
        <BottomSheet visible={createSheetVisible} onClose={() => setCreateSheetVisible(false)}>
          <View style={styles.sheetContent}>
            <Text style={[styles.sheetTitle, { color: tc.text.primary }]}>{t('screens.bookmarkFolders.createSheetTitle')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: tc.bgElevated, borderColor: tc.border }]}
              placeholder={t('screens.bookmarkFolders.folderNamePlaceholder')}
              placeholderTextColor={tc.text.tertiary}
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
            />
            <View style={styles.sheetButtons}>
              <Pressable style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]} onPress={() => setCreateSheetVisible(false)}>
                <Text style={[styles.cancelText, { color: tc.text.secondary }]}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.createBtn, pressed && { opacity: 0.8 }, !newFolderName.trim() && { opacity: 0.4 }]}
                onPress={handleCreateFolder}
                disabled={!newFolderName.trim()}
              >
                <Text style={[styles.createText, { color: tc.text.primary }]}>{t('screens.bookmarkFolders.createButton')}</Text>
              </Pressable>
            </View>
          </View>
        </BottomSheet>
      </View>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  gridContainer: { paddingBottom: 100 },
  gridRow: { paddingHorizontal: spacing.base, gap: spacing.sm, marginBottom: spacing.sm },
  folderCard: {
    width: FOLDER_CARD_WIDTH,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  folderIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderName: {
    fontSize: fontSize.base,
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
  },
  folderCount: {
    fontSize: fontSize.sm,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
    marginTop: spacing.base,
  },

  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    end: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },

  sheetContent: { padding: spacing.xl },
  sheetTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  input: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.base,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  sheetButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
  },
  cancelBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  cancelText: {
    fontSize: fontSize.base,
    fontWeight: '500',
  },
  createBtn: {
    backgroundColor: colors.emerald,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  createText: {
    fontSize: fontSize.base,
    fontWeight: '600',
  },
});