import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  Dimensions,
  ScrollView,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Avatar } from '@/components/ui/Avatar';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useTranslation } from '@/hooks/useTranslation';
import { useHaptic } from '@/hooks/useHaptic';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { commerceApi } from '@/services/api';

const { width: screenWidth } = Dimensions.get('window');
const GRID_GAP = spacing.sm;
const COLUMN_WIDTH = (screenWidth - spacing.base * 2 - GRID_GAP) / 2;

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'food', label: 'Food' },
  { key: 'clothing', label: 'Clothing' },
  { key: 'books', label: 'Books' },
  { key: 'art', label: 'Art' },
  { key: 'electronics', label: 'Electronics' },
  { key: 'services', label: 'Services' },
] as const;

type CategoryKey = typeof CATEGORIES[number]['key'];

interface Product {
  id: string;
  title: string;
  description?: string;
  price: number;
  currency: string;
  category: string;
  imageUrls: string[];
  isHalal: boolean;
  isMuslimOwned: boolean;
  rating: number;
  reviewCount: number;
  seller: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
  createdAt: string;
}

interface ProductsResponse {
  data: Product[];
  meta: { cursor: string | null; hasMore: boolean };
}

function renderStars(rating: number) {
  const stars: React.ReactNode[] = [];
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  for (let i = 0; i < 5; i++) {
    if (i < full) {
      stars.push(
        <Icon key={`star-${i}`} name="heart-filled" size="xs" color={colors.gold} />
      );
    } else if (i === full && half) {
      stars.push(
        <Icon key={`star-${i}`} name="heart-filled" size="xs" color={colors.gold} />
      );
    } else {
      stars.push(
        <Icon key={`star-${i}`} name="heart" size="xs" color={colors.text.tertiary} />
      );
    }
  }
  return stars;
}

function MarketplaceContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();

  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);

  const productsQuery = useInfiniteQuery<ProductsResponse>({
    queryKey: ['marketplace-products', selectedCategory, searchQuery],
    queryFn: ({ pageParam }) =>
      commerceApi.getProducts({
        cursor: pageParam as string | undefined,
        category: selectedCategory === 'all' ? undefined : selectedCategory,
        search: searchQuery || undefined,
      }) as Promise<ProductsResponse>,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore ? lastPage.meta.cursor ?? undefined : undefined,
    initialPageParam: undefined as string | undefined,
  });

  const allProducts = productsQuery.data?.pages.flatMap((p) => p.data) ?? [];

  const handleRefresh = useCallback(() => {
    productsQuery.refetch();
  }, [productsQuery]);

  const handleLoadMore = () => {
    if (productsQuery.hasNextPage && !productsQuery.isFetchingNextPage) {
      productsQuery.fetchNextPage();
    }
  };

  const handleCategoryPress = (key: CategoryKey) => {
    haptic.light();
    setSelectedCategory(key);
  };

  const handleProductPress = (product: Product) => {
    haptic.light();
    router.push(`/(screens)/product-detail?id=${product.id}` as never);
  };

  const renderCategoryChips = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      {CATEGORIES.map((cat) => (
        <Pressable
          key={cat.key}
          style={[
            styles.chip,
            selectedCategory === cat.key && styles.chipActive,
          ]}
          onPress={() => handleCategoryPress(cat.key)}
          accessibilityRole="button"
          accessibilityLabel={cat.label}
        >
          <Text
            style={[
              styles.chipText,
              selectedCategory === cat.key && styles.chipTextActive,
            ]}
          >
            {cat.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );

  const renderProduct = ({ item, index }: { item: Product; index: number }) => (
    <Animated.View
      entering={FadeInUp.delay(index * 50).duration(300)}
      style={styles.productCard}
    >
      <Pressable
        style={styles.productPressable}
        onPress={() => handleProductPress(item)}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${item.price}`}
      >
        <View style={styles.productImageWrap}>
          {item.imageUrls?.[0] ? (
            <Image
              source={{ uri: item.imageUrls[0] }}
              style={styles.productImage}
              contentFit="cover"
            />
          ) : (
            <View style={styles.productImagePlaceholder}>
              <Icon name="image" size="lg" color={colors.text.tertiary} />
            </View>
          )}
          <View style={styles.badgeRow}>
            {item.isHalal && (
              <View style={styles.halalBadge}>
                <Text style={styles.badgeText}>Halal</Text>
              </View>
            )}
            {item.isMuslimOwned && (
              <View style={styles.muslimOwnedBadge}>
                <Text style={styles.badgeText}>Muslim-Owned</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.productInfo}>
          <Text style={styles.productTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.productPrice}>
            ${(item.price / 100).toFixed(2)}
          </Text>
          <View style={styles.ratingRow}>
            {renderStars(item.rating)}
            <Text style={styles.reviewCount}>({item.reviewCount})</Text>
          </View>
          <View style={styles.sellerRow}>
            <Avatar
              uri={item.seller.avatarUrl}
              name={item.seller.displayName}
              size="xs"
            />
            <Text style={styles.sellerName} numberOfLines={1}>
              {item.seller.displayName}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );

  const renderSkeleton = () => (
    <View style={styles.skeletonGrid}>
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={`skel-${i}`} style={styles.productCard}>
          <Skeleton.Rect width="100%" height={COLUMN_WIDTH * 0.9} borderRadius={radius.md} />
          <View style={{ padding: spacing.sm, gap: spacing.xs }}>
            <Skeleton.Text width="80%" />
            <Skeleton.Text width="40%" />
            <Skeleton.Text width="60%" />
          </View>
        </View>
      ))}
    </View>
  );

  const ListHeader = () => (
    <View>
      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={[styles.searchInput, searchActive && styles.searchInputActive]}>
          <Icon name="search" size="sm" color={colors.text.tertiary} />
          <TextInput
            style={styles.searchText}
            placeholder={t('marketplace.searchPlaceholder', 'Search products...')}
            placeholderTextColor={colors.text.tertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setSearchActive(true)}
            onBlur={() => setSearchActive(false)}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')}>
              <Icon name="x" size="sm" color={colors.text.tertiary} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Category chips */}
      {renderCategoryChips()}
    </View>
  );

  return (
    <View style={styles.container}>
      <GlassHeader
        title={t('marketplace.title', 'Marketplace')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back', 'Back'),
        }}
        rightActions={[
          {
            icon: 'search',
            onPress: () => setSearchActive(true),
            accessibilityLabel: t('common.search', 'Search'),
          },
        ]}
      />

      <View style={[styles.content, { paddingTop: insets.top + 52 }]}>
        {productsQuery.isLoading ? (
          <View style={styles.listPadding}>
            <ListHeader />
            {renderSkeleton()}
          </View>
        ) : (
          <FlatList
            data={allProducts}
            renderItem={renderProduct}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={styles.gridRow}
            ListHeaderComponent={ListHeader}
            ListEmptyComponent={
              <EmptyState
                icon="layers"
                title={t('marketplace.empty', 'No products found')}
                subtitle={t('marketplace.emptySub', 'Try a different search or category')}
              />
            }
            ListFooterComponent={
              productsQuery.isFetchingNextPage ? (
                <View style={styles.footerLoader}>
                  <Skeleton.Rect width={120} height={20} borderRadius={radius.sm} />
                </View>
              ) : null
            }
            contentContainerStyle={styles.listPadding}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            refreshControl={
              <RefreshControl
                refreshing={productsQuery.isFetching && !productsQuery.isLoading}
                onRefresh={handleRefresh}
                tintColor={colors.emerald}
              />
            }
          />
        )}
      </View>
    </View>
  );
}

export default function MarketplaceScreen() {
  return (
    <ScreenErrorBoundary>
      <MarketplaceContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  content: {
    flex: 1,
  },
  listPadding: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['2xl'],
  },
  // Search
  searchRow: {
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  searchInputActive: {
    borderColor: colors.emerald,
  },
  searchText: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontFamily: fonts.body,
  },
  // Category chips
  chipRow: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.dark.bgCard,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  chipActive: {
    backgroundColor: colors.active.emerald10,
    borderColor: colors.emerald,
  },
  chipText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontFamily: fonts.bodySemiBold,
  },
  chipTextActive: {
    color: colors.emerald,
  },
  // Grid
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: GRID_GAP,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: GRID_GAP,
  },
  // Product card
  productCard: {
    width: COLUMN_WIDTH,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  productPressable: {
    flex: 1,
  },
  productImageWrap: {
    width: '100%',
    height: COLUMN_WIDTH * 0.9,
    position: 'relative',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  productImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRow: {
    position: 'absolute',
    top: spacing.xs,
    left: spacing.xs,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  halalBadge: {
    backgroundColor: colors.emerald,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  muslimOwnedBadge: {
    backgroundColor: colors.gold,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: fontSize.xs,
    fontFamily: fonts.bodySemiBold,
  },
  productInfo: {
    padding: spacing.sm,
    gap: spacing.xs,
  },
  productTitle: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontFamily: fonts.bodySemiBold,
    lineHeight: 18,
  },
  productPrice: {
    color: colors.gold,
    fontSize: fontSize.base,
    fontFamily: fonts.bodyBold,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  reviewCount: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    marginLeft: spacing.xs,
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  sellerName: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    flex: 1,
  },
  footerLoader: {
    paddingVertical: spacing.base,
    alignItems: 'center',
  },
});
