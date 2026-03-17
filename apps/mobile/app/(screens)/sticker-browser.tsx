import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TextInput, Pressable, ScrollView, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { Icon } from '@/components/ui/Icon';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { stickersApi } from '@/services/api';
import type { StickerPack } from '@/types';
import { useHaptic } from '@/hooks/useHaptic';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function PackCard({ pack, onPress, onAdd, onRemove, index }: { pack: StickerPack; onPress: () => void; onAdd: () => void; onRemove: () => void; index: number }) {
  const [isAdded, setIsAdded] = useState(false);
  const haptic = useHaptic();

  const handleToggle = () => {
    haptic.medium();
    if (isAdded) {
      setIsAdded(false);
      onRemove();
    } else {
      setIsAdded(true);
      onAdd();
    }
  };

  const coverImage = pack.coverUrl || (pack.stickers && pack.stickers.length > 0 ? pack.stickers[0].imageUrl : null);

  return (
    <Animated.View entering={FadeInUp.delay(index * 80).duration(400)}>
      <LinearGradient
        colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
        style={styles.card}
      >
        <Pressable onPress={onPress}>
          <View style={styles.coverWrap}>
            {coverImage ? (
              <Image source={{ uri: coverImage }} style={styles.cover} contentFit="cover" />
            ) : (
              <LinearGradient
                colors={['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.1)']}
                style={[styles.cover, styles.placeholderCover]}
              >
                <Icon name="smile" size="md" color={colors.gold} />
              </LinearGradient>
            )}
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle} numberOfLines={1}>{pack.name}</Text>
            <Text style={styles.cardSubtitle}>
              {pack.stickers?.length || 0} stickers • {pack.downloadCount || 0} downloads
            </Text>
          </View>
          <Pressable onPress={handleToggle}>
            <LinearGradient
              colors={isAdded ? ['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)'] : ['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
              style={[styles.addButton, isAdded && styles.addedButton]}
            >
              <Text style={[styles.addButtonText, isAdded && styles.addedButtonText]}>
                {isAdded ? "Added" : "Add"}
              </Text>
            </LinearGradient>
          </Pressable>
        </Pressable>
      </LinearGradient>
    </Animated.View>
  );
}

export default function StickerBrowserScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedPack, setSelectedPack] = useState<StickerPack | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: searchData, isLoading: isSearchLoading } = useQuery({
    queryKey: ['sticker-search', debouncedQuery],
    queryFn: () => stickersApi.searchPacks(debouncedQuery),
    enabled: debouncedQuery.length > 0,
  });

  const { data: featuredData, isLoading: isFeaturedLoading } = useQuery({
    queryKey: ['sticker-featured'],
    queryFn: () => stickersApi.getFeaturedPacks(),
    enabled: debouncedQuery.length === 0,
  });

  const {
    data: browseData,
    isLoading: isBrowseLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['sticker-browse'],
    queryFn: ({ pageParam }) => stickersApi.browsePacks(pageParam as string | undefined),
    getNextPageParam: (lastPage) => lastPage.meta.hasMore ? lastPage.meta.cursor : undefined,
    initialPageParam: undefined,
    enabled: debouncedQuery.length === 0,
  });

  const addMutation = useMutation({
    mutationFn: (id: string) => stickersApi.addToCollection(id),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => stickersApi.removeFromCollection(id),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    haptic.light();
    await refetch();
    setRefreshing(false);
  }, [refetch, haptic]);

  const handleAdd = (id: string) => addMutation.mutateDisabled ? null : addMutation.mutate(id);
  const handleRemove = (id: string) => removeMutation.mutateDisabled ? null : removeMutation.mutate(id);

  const packs = debouncedQuery.length > 0 
    ? (searchData || [])
    : (browseData?.pages.flatMap((page) => page.data) ?? []);

  const renderFeatured = () => {
    if (debouncedQuery.length > 0) return null;
    if (isFeaturedLoading) return null;
    if (!featuredData || featuredData.length === 0) return null;

    return (
      <View style={styles.featuredSection}>
        <Text style={styles.sectionTitle}>Featured Packs</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredScroll}>
          {featuredData.map((pack) => (
            <Pressable key={pack.id} style={styles.featuredCard} onPress={() => setSelectedPack(pack)}>
              {pack.coverUrl ? (
                <Image source={{ uri: pack.coverUrl }} style={styles.featuredCover} contentFit="cover" />
              ) : (
                <View style={[styles.featuredCover, styles.placeholderCover]}>
                  <Icon name="smile" size={32} color={colors.text.tertiary} />
                </View>
              )}
              <Text style={styles.featuredTitle} numberOfLines={1}>{pack.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  };

  if (isError) {
    return (
      <View style={styles.container}>
        <GlassHeader title="Stickers" leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }} />
        <View style={{ height: insets.top + 52 }} />
        <EmptyState icon="smile" title="Couldn't load stickers" subtitle="Check your connection and try again" actionLabel="Retry" onAction={() => refetch()} />
      </View>
    );
  }

  if (isBrowseLoading && !browseData) {
    return (
      <View style={styles.container}>
        <GlassHeader title="Stickers" leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }} />
        <View style={{ height: insets.top + 52 }} />
        <View style={{ padding: spacing.base, gap: spacing.md }}>
          <Skeleton.Rect width="100%" height={80} borderRadius={radius.md} />
          <Skeleton.Rect width="100%" height={80} borderRadius={radius.md} />
          <Skeleton.Rect width="100%" height={80} borderRadius={radius.md} />
        </View>
      </View>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader title="Stickers" leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }} />
      
        <Animated.View entering={FadeInUp.delay(0).duration(400)} style={[styles.searchWrap, { marginTop: insets.top + 52 }]}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.searchInputWrap}
          >
            <LinearGradient
              colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
              style={styles.searchIconBg}
            >
              <Icon name="search" size="xs" color={colors.emerald} />
            </LinearGradient>
            <TextInput
              style={styles.searchInput}
              placeholder="Search sticker packs..."
              placeholderTextColor={colors.text.tertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <Pressable hitSlop={8} onPress={() => setSearchQuery('')}>
                <Icon name="x" size="xs" color={colors.text.secondary} />
              </Pressable>
            )}
          </LinearGradient>
        </Animated.View>

        <FlatList
          data={packs}
          ListHeaderComponent={renderFeatured}
          renderItem={({ item, index }) => (
            <PackCard
              pack={item}
              onPress={() => setSelectedPack(item)}
              onAdd={() => handleAdd(item.id)}
              onRemove={() => handleRemove(item.id)}
              index={index}
            />
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          removeClippedSubviews={true}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
          }
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage && debouncedQuery.length === 0) {
              fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            !isSearchLoading && !isBrowseLoading ? (
              <View style={styles.emptyWrap}>
                <EmptyState 
                  icon="smile" 
                  title={debouncedQuery.length > 0 ? "No results found" : "No sticker packs"} 
                  subtitle={debouncedQuery.length > 0 ? "Try a different search term" : "Sticker packs will appear here"} 
                />
              </View>
            ) : null
          }
        />

        {/* Pack Details BottomSheet */}
        <BottomSheet visible={!!selectedPack} onClose={() => setSelectedPack(null)}>
          {selectedPack && (
            <View style={styles.sheetContent}>
              <Text style={styles.sheetTitle}>{selectedPack.name}</Text>
              {selectedPack.description && (
                <Text style={styles.sheetSubtitle}>{selectedPack.description}</Text>
              )}
            
              <View style={styles.grid}>
                {selectedPack.stickers?.map((sticker) => (
                  <View key={sticker.id} style={styles.gridItem}>
                    <Image source={{ uri: sticker.imageUrl }} style={styles.gridImage} contentFit="contain" />
                  </View>
                ))}
              </View>

              <View style={{ marginTop: spacing.xl }}>
                <GradientButton 
                  title="Add to Collection"
                  onPress={() => {
                    handleAdd(selectedPack.id);
                    setSelectedPack(null);
                    haptic.success();
                  }}
                />
              </View>
            </View>
          )}
        </BottomSheet>
      </View>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg
  },
  searchWrap: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
    zIndex: 1,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  searchIconBg: {
    width: 32, height: 32, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.base,
    height: 40,
  },
  listContent: {
    paddingBottom: spacing['2xl'],
    paddingHorizontal: spacing.base,
  },
  featuredSection: {
    marginBottom: spacing.base,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text.primary,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
  featuredScroll: {
    paddingHorizontal: spacing.base,
    gap: spacing.md,
  },
  featuredCard: {
    width: 120,
    gap: spacing.xs,
  },
  featuredCover: {
    width: 120,
    height: 120,
    borderRadius: radius.md,
    backgroundColor: colors.dark.surface,
  },
  placeholderCover: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  featuredTitle: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.text.primary,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  coverWrap: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  cover: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.dark.surface,
  },
  cardInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  cardTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text.primary,
  },
  cardSubtitle: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  addButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
  },
  addedButton: {
    backgroundColor: colors.active.emerald10,
  },
  addButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text.primary,
  },
  addedButtonText: {
    color: colors.emerald,
  },
  emptyWrap: {
    marginTop: spacing['2xl'],
  },
  sheetContent: {
    padding: spacing.base,
    paddingBottom: spacing['2xl'],
  },
  sheetTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  sheetSubtitle: {
    fontSize: fontSize.base,
    color: colors.text.secondary,
    marginBottom: spacing.xl,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  gridItem: {
    width: (SCREEN_WIDTH - spacing.base * 2 - spacing.sm * 2) / 3,
    aspectRatio: 1,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
});
