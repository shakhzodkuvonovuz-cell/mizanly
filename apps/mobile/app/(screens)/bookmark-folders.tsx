import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable, FlatList,
  Dimensions, Alert,
} from 'react-native';
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

const SCREEN_W = Dimensions.get('window').width;
const FOLDER_CARD_WIDTH = (SCREEN_W - spacing.base * 2 - spacing.sm) / 2;

type Folder = {
  id: string;
  name: string;
  itemIds: string[];
};

type FolderCardProps = {
  folder: Folder;
  onPress: () => void;
  onLongPress: () => void;
};

function FolderCard({ folder, onPress, onLongPress }: FolderCardProps) {
  const itemCount = folder.itemIds.length;
  const { t } = useTranslation();
  const tc = useThemeColors();
  // For now, no cover thumbnail; we could later fetch first item's image
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={[styles.folderCard, { backgroundColor: tc.bgCard }]}>
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
  // Collections are now fetched from API via collectionsQuery
  const [refreshing, setRefreshing] = useState(false);
  const [createSheetVisible, setCreateSheetVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const collectionsQuery = useQuery({
    queryKey: ['bookmark-collections'],
    queryFn: () => bookmarksApi.getCollections(),
  });

  const collections: BookmarkCollection[] = (collectionsQuery.data ?? []) as BookmarkCollection[];
  const loading = collectionsQuery.isLoading;

  const foldersArray: Folder[] = collections.map((c) => ({
    id: c.name,
    name: c.name,
    itemIds: Array.from({ length: c.count }, (_, j) => String(j)),
  }));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    collectionsQuery.refetch().finally(() => setRefreshing(false));
  }, [collectionsQuery]);

  const handleCreateFolder = useCallback(async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) {
      Alert.alert(t('common.error'), t('screens.bookmarkFolders.emptyNameError'));
      return;
    }
    // Collections are implicit in the backend (created when first bookmark is saved to them).
    // Inform the user the folder name is ready — it will appear when they save a bookmark to it.
    Alert.alert(
      t('screens.bookmarkFolders.createSheetTitle'),
      t('screens.bookmarkFolders.collectionCreatedHint'),
    );
    setNewFolderName('');
    setCreateSheetVisible(false);
    collectionsQuery.refetch();
  }, [newFolderName, collectionsQuery, t]);

  const handleDeleteFolder = useCallback(async (folderName: string) => {
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
              Alert.alert(t('common.error'), t('screens.bookmarkFolders.deleteFailed'));
              collectionsQuery.refetch();
            }
          },
        },
      ]
    );
  }, [collectionsQuery, t]);

  const handleFolderPress = useCallback((collectionName: string) => {
    router.push(`/(screens)/saved?collection=${encodeURIComponent(collectionName)}`);
  }, [router]);

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
          style={styles.fab}
          onPress={() => setCreateSheetVisible(true)}
          hitSlop={8}
          accessibilityLabel={t('screens.bookmarkFolders.createFolderLabel')}
        >
          <Icon name="plus" size="lg" color="#fff" />
        </Pressable>

        {/* Create Folder BottomSheet */}
        <BottomSheet visible={createSheetVisible} onClose={() => setCreateSheetVisible(false)}>
          <View style={styles.sheetContent}>
            <Text style={[styles.sheetTitle, { color: tc.text.primary }]}>{t('screens.bookmarkFolders.createSheetTitle')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: tc.bgElevated, borderColor: tc.border }]}
              placeholder={t('screens.bookmarkFolders.folderNamePlaceholder')}
              placeholderTextColor={colors.text.tertiary}
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
            />
            <View style={styles.sheetButtons}>
              <Pressable style={styles.cancelBtn} onPress={() => setCreateSheetVisible(false)}>
                <Text style={[styles.cancelText, { color: tc.text.secondary }]}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable style={styles.createBtn} onPress={handleCreateFolder}>
                <Text style={styles.createText}>{t('screens.bookmarkFolders.createButton')}</Text>
              </Pressable>
            </View>
          </View>
        </BottomSheet>
      </View>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },

  gridContainer: { paddingBottom: 100 },
  gridRow: { paddingHorizontal: spacing.base, gap: spacing.sm, marginBottom: spacing.sm },
  folderCard: {
    width: FOLDER_CARD_WIDTH,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  folderIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.dark.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderName: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
  },
  folderCount: {
    color: colors.text.tertiary,
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
    right: spacing.xl,
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
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text.primary,
    fontSize: fontSize.base,
    borderWidth: 1,
    borderColor: colors.dark.border,
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
    color: colors.text.secondary,
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
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: '600',
  },
});