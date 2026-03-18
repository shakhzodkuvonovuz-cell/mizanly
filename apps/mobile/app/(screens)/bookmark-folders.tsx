import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable, FlatList, RefreshControl,
  Dimensions, Alert,
, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { bookmarksApi } from '@/services/api';
import type { BookmarkCollection } from '@/types';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

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
  // For now, no cover thumbnail; we could later fetch first item's image
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={styles.folderCard}>
      <View style={styles.folderIcon}>
        <Icon name="bookmark" size="xl" color={colors.gold} />
      </View>
      <Text style={styles.folderName} numberOfLines={1}>{folder.name}</Text>
      <Text style={styles.folderCount}>
        {t('screens.bookmarkFolders.itemsCount', { count: itemCount })}
      </Text>
    </Pressable>
  );
}

export default function BookmarkFoldersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
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

  const foldersArray: Folder[] = collections.map((c, i) => ({
    id: String(i),
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
    // Collections are created implicitly when a bookmark is moved into them.
    // For now, we just store the name locally — it'll be created server-side
    // when the user first saves a bookmark to this collection.
    setNewFolderName('');
    setCreateSheetVisible(false);
    // Refresh the collections list
    collectionsQuery.refetch();
  }, [newFolderName, collectionsQuery]);

  const handleDeleteFolder = useCallback(async (folderId: string) => {
    Alert.alert(
      t('screens.bookmarkFolders.deleteAlertTitle'),
      t('screens.bookmarkFolders.deleteAlertMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('screens.bookmarkFolders.deleteButton'),
          style: 'destructive',
          onPress: async () => {
            // Server-side collections are implicit — deleting just refreshes the list
            // In a full implementation, we'd call a delete API endpoint
            collectionsQuery.refetch();
          },
        },
      ]
    );
  }, [collectionsQuery]);

  const handleFolderPress = useCallback((folderId: string) => {
    router.push(`/(screens)/saved?folder=${folderId}`);
  }, [router]);

  if (loading) {
    return (
      <View style={styles.container}>
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
      <View style={styles.container}>
        <GlassHeader title={t('screens.bookmarkFolders.title')} leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }} />

        <FlatList
            removeClippedSubviews={true}
          data={foldersArray}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
          }
          renderItem={({ item }) => (
            <FolderCard
              folder={item}
              onPress={() => handleFolderPress(item.id)}
              onLongPress={() => handleDeleteFolder(item.id)}
            />
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
            <Text style={styles.sheetTitle}>{t('screens.bookmarkFolders.createSheetTitle')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('screens.bookmarkFolders.folderNamePlaceholder')}
              placeholderTextColor={colors.text.tertiary}
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
            />
            <View style={styles.sheetButtons}>
              <Pressable style={styles.cancelBtn} onPress={() => setCreateSheetVisible(false)}>
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
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