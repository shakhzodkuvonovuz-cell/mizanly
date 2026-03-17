import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable, FlatList, RefreshControl,
  TouchableOpacity, Dimensions, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassHeader } from '@/components/ui/GlassHeader';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
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
    <TouchableOpacity onPress={onPress} onLongPress={onLongPress} activeOpacity={0.85} style={styles.folderCard}>
      <View style={styles.folderIcon}>
        <Icon name="bookmark" size="xl" color={colors.gold} />
      </View>
      <Text style={styles.folderName} numberOfLines={1}>{folder.name}</Text>
      <Text style={styles.folderCount}>
        {t('screens.bookmarkFolders.itemsCount', { count: itemCount })}
      </Text>
    </TouchableOpacity>
  );
}

export default function BookmarkFoldersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [foldersMap, setFoldersMap] = useState<Record<string, { name: string, itemIds: string[] }>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createSheetVisible, setCreateSheetVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const foldersArray: Folder[] = Object.entries(foldersMap).map(([id, val]) => ({
    id,
    name: val.name,
    itemIds: val.itemIds,
  }));

  const loadFolders = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem('bookmark-folders');
      if (stored) {
        const data = JSON.parse(stored);
        setFoldersMap(data);
      } else {
        setFoldersMap({});
      }
    } catch (error) {
      console.error('Failed to load bookmark folders:', error);
      Alert.alert(t('common.error'), t('screens.bookmarkFolders.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadFolders();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadFolders();
  }, [loadFolders]);

  const handleCreateFolder = useCallback(async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) {
      Alert.alert(t('common.error'), t('screens.bookmarkFolders.emptyNameError'));
      return;
    }
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2);
    const newMap = { ...foldersMap, [id]: { name: trimmed, itemIds: [] } };
    try {
      await AsyncStorage.setItem('bookmark-folders', JSON.stringify(newMap));
      setFoldersMap(newMap);
      setNewFolderName('');
      setCreateSheetVisible(false);
    } catch (error) {
      console.error('Failed to create folder:', error);
      Alert.alert(t('common.error'), t('screens.bookmarkFolders.createError'));
    }
  }, [foldersMap, newFolderName]);

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
            const updated = { ...foldersMap };
            delete updated[folderId];
            await AsyncStorage.setItem('bookmark-folders', JSON.stringify(updated));
            setFoldersMap(updated);
          },
        },
      ]
    );
  }, [foldersMap]);

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