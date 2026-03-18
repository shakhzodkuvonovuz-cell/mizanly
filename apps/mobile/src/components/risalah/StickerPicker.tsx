import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  Pressable,
  Dimensions,
  TextInput,
  RefreshControl,
} from 'react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Icon } from '@/components/ui/Icon';
import { TabSelector } from '@/components/ui/TabSelector';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { stickersApi } from '@/services/api';
import type { StickerItem, StickerPack } from '@/types';

interface StickerPickerProps {
  visible: boolean;
  onClose: () => void;
  onStickerSelect: (url: string) => void;
}

const GRID_SPACING = spacing.sm;
const GRID_COLUMNS = 4;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_SIZE = (SCREEN_WIDTH - spacing.xl * 2 - GRID_SPACING * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

export function StickerPicker({ visible, onClose, onStickerSelect }: StickerPickerProps) {
  const [activeTab, setActiveTab] = useState<'recent' | 'myPacks'>('recent');
  const [searchQuery, setSearchQuery] = useState('');
  const [ownedPacks, setOwnedPacks] = useState<StickerPack[]>([]);
  const [activePackId, setActivePackId] = useState<string | null>(null);
  const [recentStickers, setRecentStickers] = useState<StickerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Load data when sheet becomes visible
  useEffect(() => {
    if (visible) {
      setLoading(true);
      Promise.all([
        stickersApi.getMyPacks(),
        stickersApi.getRecentStickers(),
      ]).then(([packs, recent]) => {
        setOwnedPacks(packs);
        setActivePackId(packs[0]?.id ?? null);
        setRecentStickers(recent);
        setLoading(false);
      }).catch(() => {
        setLoading(false);
      });
    }
  }, [visible]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([
      stickersApi.getMyPacks(),
      stickersApi.getRecentStickers(),
    ]).then(([packs, recent]) => {
      setOwnedPacks(packs);
      setActivePackId(packs[0]?.id ?? null);
      setRecentStickers(recent);
    }).finally(() => {
      setRefreshing(false);
    });
  }, []);

  const handleStickerPress = useCallback((stickerUrl: string) => {
    onStickerSelect(stickerUrl);
    // Optionally update recent stickers locally (frontend only)
    // Could call API to record usage, but for now just update UI
    setRecentStickers(prev => {
      const existing = prev.find(s => s.imageUrl === stickerUrl);
      if (existing) {
        // Move to front
        const filtered = prev.filter(s => s.imageUrl !== stickerUrl);
        return [existing, ...filtered];
      }
      // If not in recent list, add placeholder (actual sticker data might be missing)
      // We'll just keep as is
      return prev;
    });
  }, [onStickerSelect]);

  const handlePackPress = useCallback((packId: string) => {
    setActivePackId(packId);
  }, []);

  const handleAddMore = useCallback(() => {
    onClose();
    // Navigation to StickerPackBrowser would happen via navigation prop (not implemented here)
    // For now, just close; the parent can handle navigation.
  }, [onClose]);

  const filteredPacks = ownedPacks.filter(pack =>
    pack.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activePack = ownedPacks.find(p => p.id === activePackId);
  const stickers = activePack?.stickers ?? [];

  const renderStickerItem = ({ item }: { item: StickerItem }) => (
    <Pressable
      style={styles.stickerItem}
      onPress={() => handleStickerPress(item.imageUrl)}
      accessibilityLabel={`Sticker ${item.id}`}
      accessibilityRole="button"
    >
      <Image
        source={{ uri: item.imageUrl }}
        style={styles.stickerImage}
        resizeMode="contain"
      />
    </Pressable>
  );

  const renderPackTab = ({ item }: { item: StickerPack }) => (
    <TouchableOpacity
      key={item.id}
      style={[
        styles.packTab,
        activePackId === item.id && styles.packTabActive,
      ]}
      onPress={() => handlePackPress(item.id)}
      accessibilityLabel={`${item.name} sticker pack`}
      accessibilityRole="button"
    >
      <View style={styles.packIconWrapper}>
        <Image
          source={{ uri: item.coverUrl || 'https://placehold.co/28x28/1C2333/8B949E?text=' + item.name.charAt(0) }}
          style={styles.packIcon}
          resizeMode="contain"
        />
      </View>
      <Text
        style={[
          styles.packName,
          activePackId === item.id && styles.packNameActive,
        ]}
        numberOfLines={1}
      >
        {item.name}
      </Text>
    </TouchableOpacity>
  );

  const renderRecentSticker = (sticker: StickerItem, index: number) => (
    <Pressable
      key={sticker.id}
      style={styles.recentSticker}
      onPress={() => handleStickerPress(sticker.imageUrl)}
      accessibilityLabel={`Recent sticker ${index + 1}`}
      accessibilityRole="button"
    >
      <Image
        source={{ uri: sticker.imageUrl }}
        style={styles.recentStickerImage}
        resizeMode="contain"
      />
    </Pressable>
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} snapPoint={0.7}>
      <View style={styles.container}>
        <Text style={styles.title}>Stickers</Text>

        {/* Search bar */}
        <View style={styles.searchContainer}>
          <Icon name="search" size="sm" color={colors.text.secondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search stickers..."
            placeholderTextColor={colors.text.tertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Icon name="x" size="sm" color={colors.text.secondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Tab selector */}
        <TabSelector
          tabs={[
            { key: 'recent', label: 'Recent' },
            { key: 'myPacks', label: 'My Packs' },
          ]}
          activeKey={activeTab}
          onTabChange={(key) => setActiveTab(key as 'recent' | 'myPacks')}
          style={styles.tabSelector}
        />

        {activeTab === 'recent' ? (
          /* Recent stickers grid */
          <View style={styles.stickerGridSection}>
            <Text style={styles.sectionTitle}>Recently Used</Text>
            {loading ? (
              <View style={styles.skeletonGrid}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton.Rect
                    key={i}
                    width={ITEM_SIZE}
                    height={ITEM_SIZE}
                    borderRadius={radius.md}
                  />
                ))}
              </View>
            ) : recentStickers.length === 0 ? (
              <EmptyState
                icon="clock"
                title="No recent stickers"
                subtitle="Use some stickers and they'll appear here"
              />
            ) : (
              <FlatList
            removeClippedSubviews={true}
                data={recentStickers}
                renderItem={renderStickerItem}
                numColumns={GRID_COLUMNS}
                columnWrapperStyle={styles.gridRow}
                contentContainerStyle={styles.gridContent}
                keyExtractor={item => item.id}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={handleRefresh}
                    tintColor={colors.emerald}
                  />
                }
              />
            )}
          </View>
        ) : (
          /* My Packs */
          <>
            {/* Pack tabs */}
            <View style={styles.packTabsContainer}>
              <FlatList
            removeClippedSubviews={true}
                data={filteredPacks}
                renderItem={renderPackTab}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.packTabsList}
                keyExtractor={item => item.id}
              />
              <TouchableOpacity
                style={styles.addMoreButton}
                onPress={handleAddMore}
                accessibilityLabel="Browse more sticker packs"
                accessibilityRole="button"
              >
                <Icon name="plus" size="sm" color={colors.text.secondary} />
                <Text style={styles.addMoreText}>Add more</Text>
              </TouchableOpacity>
            </View>

            {/* Sticker grid */}
            <View style={styles.stickerGridSection}>
              <Text style={styles.sectionTitle}>
                {activePack?.name || 'Select a pack'}
              </Text>

              {loading ? (
                <View style={styles.skeletonGrid}>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton.Rect
                      key={i}
                      width={ITEM_SIZE}
                      height={ITEM_SIZE}
                      borderRadius={radius.md}
                    />
                  ))}
                </View>
              ) : stickers.length === 0 ? (
                <EmptyState
                  icon="smile"
                  title="No stickers in this pack"
                  subtitle="Add more sticker packs to get started"
                />
              ) : (
                <FlatList
            removeClippedSubviews={true}
                  data={stickers}
                  renderItem={renderStickerItem}
                  numColumns={GRID_COLUMNS}
                  columnWrapperStyle={styles.gridRow}
                  contentContainerStyle={styles.gridContent}
                  keyExtractor={item => item.id}
                  showsVerticalScrollIndicator={false}
                  refreshControl={
                    <RefreshControl
                      refreshing={refreshing}
                      onRefresh={handleRefresh}
                      tintColor={colors.emerald}
                    />
                  }
                />
              )}
            </View>
          </>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  title: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  recentSection: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  recentList: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  recentSticker: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.dark.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  recentStickerImage: {
    width: 48,
    height: 48,
  },
  packTabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  packTabsList: {
    flexGrow: 1,
    gap: spacing.sm,
  },
  packTab: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.dark.bgElevated,
    minWidth: 80,
    maxWidth: 120,
  },
  packTabActive: {
    backgroundColor: colors.active.emerald10,
    borderWidth: 1,
    borderColor: colors.emerald,
  },
  packIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.dark.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    overflow: 'hidden',
  },
  packIcon: {
    width: 28,
    height: 28,
  },
  packName: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    fontWeight: '500',
    textAlign: 'center',
  },
  packNameActive: {
    color: colors.emerald,
  },
  addMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.dark.bgElevated,
    minWidth: 80,
  },
  addMoreText: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  stickerGridSection: {
    flex: 1,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_SPACING,
    justifyContent: 'space-between',
  },
  gridRow: {
    gap: GRID_SPACING,
    marginBottom: GRID_SPACING,
  },
  gridContent: {
    paddingBottom: spacing.lg,
  },
  stickerItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: radius.md,
    backgroundColor: colors.dark.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  stickerImage: {
    width: ITEM_SIZE - 12,
    height: ITEM_SIZE - 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    marginLeft: spacing.xs,
    color: colors.text.primary,
    fontSize: fontSize.base,
  },
  tabSelector: {
    marginBottom: spacing.lg,
  },
});