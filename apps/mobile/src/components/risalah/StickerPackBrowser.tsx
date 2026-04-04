import { useState, useCallback, useEffect, memo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TextInput,
  SafeAreaView,
  Pressable,
} from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { stickersApi } from '@/services/api';
import type { StickerPack as ApiStickerPack, StickerItem } from '@/types';

interface LocalStickerPack {
  id: string;
  name: string;
  description?: string;
  iconUrl: string;
  previewUrls: string[]; // first 3 stickers for preview
  stickerCount: number;
  isFeatured: boolean;
  isOwned: boolean;
}

// Map API pack to local representation
function mapApiPackToLocal(pack: ApiStickerPack, isFeatured: boolean, isOwned: boolean): LocalStickerPack {
  return {
    id: pack.id,
    name: pack.name,
    description: pack.description,
    iconUrl: pack.coverUrl || '',
    previewUrls: pack.stickers.slice(0, 3).map(s => s.imageUrl),
    stickerCount: pack.stickers.length,
    isFeatured,
    isOwned,
  };
}

interface StickerPackBrowserProps {
  onClose?: () => void;
}


export const StickerPackBrowser = memo(function StickerPackBrowser({ onClose }: StickerPackBrowserProps) {
  const tc = useThemeColors();
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [packs, setPacks] = useState<LocalStickerPack[]>([]);
  const [featuredPacks, setFeaturedPacks] = useState<LocalStickerPack[]>([]);
  const [ownedPackIds, setOwnedPackIds] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPack, setSelectedPack] = useState<ApiStickerPack | null>(null);
  const [showDetailSheet, setShowDetailSheet] = useState(false);

  // Load data on mount
  // Load featured packs and owned IDs
  const loadFeaturedPacks = useCallback(async () => {
    try {
      const featured = await stickersApi.getFeaturedPacks();
      const myPacks = await stickersApi.getMyPacks();
      const ownedIds = new Set(myPacks.map(p => p.id));
      setOwnedPackIds(ownedIds);
      const localFeatured = featured.map(pack =>
        mapApiPackToLocal(pack, true, ownedIds.has(pack.id))
      );
      setFeaturedPacks(localFeatured);
    } catch (error) {
      if (__DEV__) console.error('Failed to load featured packs', error);
    }
  }, []);

  // Load packs with cursor pagination
  const loadPacks = useCallback(async (nextCursor?: string | null) => {
    const isFirstLoad = nextCursor === undefined;
    try {
      const result = await stickersApi.browsePacks(nextCursor || undefined);
      const myPacks = await stickersApi.getMyPacks();
      const ownedIds = new Set(myPacks.map(p => p.id));
      setOwnedPackIds(ownedIds);
      const localPacks = result.data.map(pack =>
        mapApiPackToLocal(pack, false, ownedIds.has(pack.id))
      );
      if (isFirstLoad) {
        setPacks(localPacks);
      } else {
        setPacks(prev => [...prev, ...localPacks]);
      }
      setCursor(result.meta.cursor);
      setHasMore(result.meta.hasMore);
    } catch (error) {
      if (__DEV__) console.error('Failed to load packs', error);
    }
  }, []);

  // Search packs
  const searchPacks = useCallback(async (query: string) => {
    if (!query.trim()) {
      // If empty search, revert to browsing
      setLoading(true);
      await loadPacks();
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const results = await stickersApi.searchPacks(query);
      const myPacks = await stickersApi.getMyPacks();
      const ownedIds = new Set(myPacks.map(p => p.id));
      const localPacks = results.map(pack =>
        mapApiPackToLocal(pack, false, ownedIds.has(pack.id))
      );
      setPacks(localPacks);
      setFeaturedPacks([]);
      setCursor(null);
      setHasMore(false);
    } catch (error) {
      if (__DEV__) console.error('Search failed', error);
    } finally {
      setLoading(false);
    }
  }, [loadPacks]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadFeaturedPacks(), loadPacks()]);
      setLoading(false);
    };
    init();
  }, [loadFeaturedPacks, loadPacks]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadFeaturedPacks(), loadPacks()]);
    setRefreshing(false);
  }, [loadFeaturedPacks, loadPacks]);

  const handleLoadMore = useCallback(() => {
    if (!loading && hasMore && cursor) {
      loadPacks(cursor);
    }
  }, [loading, hasMore, cursor, loadPacks]);

  const handleToggleOwned = useCallback(async (packId: string, currentlyOwned: boolean) => {
    try {
      if (currentlyOwned) {
        await stickersApi.removeFromCollection(packId);
        setOwnedPackIds(prev => {
          const next = new Set(prev);
          next.delete(packId);
          return next;
        });
      } else {
        await stickersApi.addToCollection(packId);
        setOwnedPackIds(prev => new Set(prev).add(packId));
      }
      // Update local state
      setPacks(prev => prev.map(pack =>
        pack.id === packId ? { ...pack, isOwned: !currentlyOwned } : pack
      ));
      setFeaturedPacks(prev => prev.map(pack =>
        pack.id === packId ? { ...pack, isOwned: !currentlyOwned } : pack
      ));
    } catch (error) {
      if (__DEV__) console.error('Failed to toggle pack ownership', error);
    }
  }, []);

  const openPackDetail = useCallback(async (packId: string) => {
    try {
      const pack = await stickersApi.getPack(packId);
      setSelectedPack(pack);
      setShowDetailSheet(true);
    } catch (error) {
      if (__DEV__) console.error('Failed to fetch pack details', error);
    }
  }, []);

  const closeDetail = useCallback(() => {
    setShowDetailSheet(false);
    setSelectedPack(null);
  }, []);

  // Filter packs based on search (client-side filtering only when not searching via API)
  const filteredPacks = searchQuery.trim()
    ? packs.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : packs;

  const renderFeaturedPack = ({ item }: { item: LocalStickerPack }) => (
    <View style={styles.featuredCard}>
      <View style={styles.featuredHeader}>
        <Image source={{ uri: item.iconUrl }} style={styles.featuredIcon} />
        <View style={styles.featuredInfo}>
          <Text style={styles.featuredName}>{item.name}</Text>
          <Text style={styles.featuredDescription}>{item.description}</Text>
          <Text style={styles.featuredCount}>{item.stickerCount} stickers</Text>
        </View>
        <Pressable
          style={[
            styles.featuredAction,
            item.isOwned && styles.featuredActionAdded,
          ]}
          onPress={() => handleToggleOwned(item.id, item.isOwned)}
          accessibilityLabel={item.isOwned ? 'Remove pack' : 'Add pack'}
          accessibilityRole="button"
        >
          <Icon
            name={item.isOwned ? 'check' : 'plus'}
            size="sm"
            color={item.isOwned ? colors.emerald : colors.text.primary}
          />
        </Pressable>
      </View>
      <Pressable style={styles.featuredPreview} onPress={() => openPackDetail(item.id)}>
        {item.previewUrls.map((url, idx) => (
          <Image
            key={idx}
            source={{ uri: url }}
            style={styles.featuredPreviewImage}
            resizeMode="contain"
          />
        ))}
      </Pressable>
    </View>
  );

  const renderPackCard = ({ item }: { item: LocalStickerPack }) => (
    <View style={styles.packCard}>
      <View style={styles.packCardHeader}>
        <Image source={{ uri: item.iconUrl }} style={styles.packIcon} />
        <View style={styles.packInfo}>
          <Text style={styles.packName}>{item.name}</Text>
          <Text style={styles.packDescription}>{item.description}</Text>
          <Text style={styles.packCount}>{item.stickerCount} stickers</Text>
        </View>
        <Pressable
          style={[
            styles.packAction,
            item.isOwned && styles.packActionAdded,
          ]}
          onPress={() => handleToggleOwned(item.id, item.isOwned)}
          accessibilityLabel={item.isOwned ? 'Remove pack' : 'Add pack'}
          accessibilityRole="button"
        >
          <Icon
            name={item.isOwned ? 'check' : 'plus'}
            size="sm"
            color={item.isOwned ? colors.emerald : colors.text.primary}
          />
          <Text style={styles.packActionText}>
            {item.isOwned ? t('stickers.added') : t('stickers.add')}
          </Text>
        </Pressable>
      </View>
      <Pressable style={styles.packPreview} onPress={() => openPackDetail(item.id)}>
        {item.previewUrls.map((url, idx) => (
          <Image
            key={idx}
            source={{ uri: url }}
            style={styles.packPreviewImage}
            resizeMode="contain"
          />
        ))}
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: tc.bg }]}>
      <View style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: tc.border }]}>
          <Pressable
            onPress={onClose}
            accessibilityLabel={t('common.close')}
            accessibilityRole="button"
            style={styles.backButton}
          >
            <Icon name="arrow-left" size="md" color={colors.text.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>Sticker Packs</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <View style={[styles.searchInput, { backgroundColor: tc.bgElevated, borderColor: tc.border }]}>
            <Icon name="search" size="sm" color={colors.text.tertiary} />
            <TextInput
              style={styles.searchTextInput}
              placeholder={t('risalah.searchStickers')}
              placeholderTextColor={colors.text.tertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={() => searchPacks(searchQuery)}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')}>
                <Icon name="x" size="sm" color={colors.text.tertiary} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Content */}
        {loading && !refreshing ? (
          <View style={styles.skeletonContainer}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton.Rect
                key={i}
                width="100%"
                height={120}
                borderRadius={radius.md}
                style={{ marginBottom: spacing.md }}
              />
            ))}
          </View>
        ) : (
          <FlatList
            removeClippedSubviews={true}
            data={filteredPacks}
            renderItem={renderPackCard}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <BrandedRefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
              />
            }
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListHeaderComponent={
              <>
                {/* Featured section */}
                {!searchQuery && featuredPacks.length > 0 && (
                  <View style={styles.featuredSection}>
                    <Text style={styles.sectionTitle}>Featured</Text>
                    <FlatList
            removeClippedSubviews={true}
                      data={featuredPacks}
                      renderItem={renderFeaturedPack}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.featuredList}
                      keyExtractor={item => item.id}
                    />
                  </View>
                )}
                {/* All packs title */}
                <Text style={styles.sectionTitle}>
                  {searchQuery ? t('stickers.searchResults') : t('stickers.allStickerPacks')}
                </Text>
              </>
            }
            ListEmptyComponent={
              <EmptyState
                icon="search"
                title={t('risalah.noStickerPacks')}
                subtitle={t('risalah.stickerSearchHint')}
              />
            }
          />
        )}

        {/* Pack Detail BottomSheet */}
        <BottomSheet
          visible={showDetailSheet}
          onClose={closeDetail}
          snapPoint={0.7}
        >
          {selectedPack && (
            <View style={styles.sheetContent}>
              <View style={styles.sheetHeader}>
                <Image source={{ uri: selectedPack.coverUrl || '' }} style={styles.sheetIcon} />
                <View style={styles.sheetInfo}>
                  <Text style={styles.sheetName}>{selectedPack.name}</Text>
                  <Text style={styles.sheetDescription}>{selectedPack.description}</Text>
                  <Text style={styles.sheetCount}>{selectedPack.stickers.length} stickers</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  style={[
                    styles.sheetAction,
                    ownedPackIds.has(selectedPack.id) && styles.sheetActionAdded,
                  ]}
                  onPress={() => handleToggleOwned(selectedPack.id, ownedPackIds.has(selectedPack.id))}
                >
                  <Icon
                    name={ownedPackIds.has(selectedPack.id) ? 'check' : 'plus'}
                    size="sm"
                    color={ownedPackIds.has(selectedPack.id) ? colors.emerald : colors.text.primary}
                  />
                  <Text style={styles.sheetActionText}>
                    {ownedPackIds.has(selectedPack.id) ? t('stickers.added') : t('stickers.add')}
                  </Text>
                </Pressable>
              </View>
              <FlatList
            removeClippedSubviews={true}
                data={selectedPack.stickers}
                numColumns={4}
                renderItem={useCallback(({ item }) => (
                  <Image source={{ uri: item.imageUrl }} style={styles.stickerImage} resizeMode="contain" />
                ), [])}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.stickerGrid}
              />
            </View>
          )}
        </BottomSheet>
      </View>
    </SafeAreaView>
  );
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.dark.border,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 40,
  },
  searchContainer: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  searchTextInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.base,
    paddingVertical: spacing.xs,
  },
  featuredSection: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  featuredList: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  featuredCard: {
    width: 280,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  featuredHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  featuredIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
  },
  featuredInfo: {
    flex: 1,
    gap: 2,
  },
  featuredName: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  featuredDescription: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  featuredCount: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  featuredAction: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.dark.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredActionAdded: {
    backgroundColor: colors.active.emerald10,
  },
  featuredPreview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  featuredPreviewImage: {
    width: 70,
    height: 70,
    borderRadius: radius.sm,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  packCard: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  packCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  packIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
  },
  packInfo: {
    flex: 1,
    gap: 2,
  },
  packName: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  packDescription: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  packCount: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  packAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.dark.bgElevated,
  },
  packActionAdded: {
    backgroundColor: colors.active.emerald10,
  },
  packActionText: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  packPreview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  packPreviewImage: {
    width: 70,
    height: 70,
    borderRadius: radius.sm,
  },
  skeletonContainer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  sheetContent: {
    padding: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  sheetIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
  },
  sheetInfo: {
    flex: 1,
    gap: 4,
  },
  sheetName: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  sheetDescription: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  sheetCount: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  sheetAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.dark.bgElevated,
  },
  sheetActionAdded: {
    backgroundColor: colors.active.emerald10,
  },
  sheetActionText: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  stickerGrid: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  stickerImage: {
    width: 70,
    height: 70,
    margin: spacing.xs,
    borderRadius: radius.sm,
  },
});
