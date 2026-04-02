import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  Pressable,
  Dimensions,
  ScrollView,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Avatar } from '@/components/ui/Avatar';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useTranslation } from '@/hooks/useTranslation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import { rtlFlexRow, rtlTextAlign } from '@/utils/rtl';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { commerceApi } from '@/services/api';
import { navigate } from '@/utils/navigation';
import { formatCount } from '@/utils/formatCount';
import { formatCurrency } from '@/utils/localeFormat';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';

const { width: screenWidth } = Dimensions.get('window');
const GRID_GAP = spacing.sm;
const COLUMN_WIDTH = (screenWidth - spacing.base * 2 - GRID_GAP) / 2;

const CATEGORY_KEYS = ['all', 'food', 'clothing', 'books', 'art', 'electronics', 'services'] as const;

type CategoryKey = typeof CATEGORY_KEYS[number];

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

function RatingStars({ rating, tc }: { rating: number; tc: ReturnType<typeof useThemeColors> }) {
  const stars: React.ReactNode[] = [];
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  for (let i = 0; i < 5; i++) {
    if (i < full || (i === full && half)) {
      stars.push(
        <Icon key={`star-${i}`} name="star" size="xs" color={colors.gold} />
      );
    } else {
      stars.push(
        <Icon key={`star-${i}`} name="star" size="xs" color={tc.text.tertiary} />
      );
    }
  }
  return <>{stars}</>;
}

function MarketplaceContent() {
  const { t, isRTL } = useTranslation();
  const router = useRouter();
  const haptic = useContextualHaptic();
  const insets = useSafeAreaInsets();

  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const tc = useThemeColors();

  // Debounce search to avoid API spam on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const CATEGORIES = CATEGORY_KEYS.map((key) => ({
    key,
    label: t(`marketplace.category${key.charAt(0).toUpperCase() + key.slice(1)}`),
  }));

  const productsQuery = useInfiniteQuery<ProductsResponse>({
    queryKey: ['marketplace-products', selectedCategory, debouncedSearchQuery],
    queryFn: ({ pageParam }) =>
      commerceApi.getProducts({
        cursor: pageParam as string | undefined,
        category: selectedCategory === 'all' ? undefined : selectedCategory,
        search: debouncedSearchQuery || undefined,
      }) as Promise<ProductsResponse>,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore ? lastPage.meta.cursor ?? undefined : undefined,
    initialPageParam: undefined as string | undefined,
    staleTime: 30_000,
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
    haptic.tick();
    setSelectedCategory(key);
  };

  const handleProductPress = (product: Product) => {
    haptic.navigate();
    navigate('/(screens)/product-detail', { id: product.id });
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
            styles.chip, { backgroundColor: tc.bgCard, borderColor: tc.border },
            selectedCategory === cat.key && styles.chipActive,
          ]}
          onPress={() => handleCategoryPress(cat.key)}
          accessibilityRole="button"
          accessibilityLabel={cat.label}
        >
          <Text
            style={[
              styles.chipText,
              { color: selectedCategory === cat.key ? colors.emerald : tc.text.secondary },
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
      entering={FadeInUp.delay(Math.min(index, 10) * 50).duration(300)}
      style={[styles.productCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}
    >
      <Pressable
        style={styles.productPressable}
        onPress={() => handleProductPress(item)}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${formatCurrency(item.price / 100, item.currency || 'USD')}`}
      >
        <View style={styles.productImageWrap}>
          {item.imageUrls?.[0] ? (
            <ProgressiveImage
              uri={item.imageUrls[0]}
              width="100%"
              height={COLUMN_WIDTH * 0.9}
            />
          ) : (
            <View style={[styles.productImagePlaceholder, { backgroundColor: tc.surface }]}>
              <Icon name="image" size="lg" color={tc.text.tertiary} />
            </View>
          )}
          <View style={styles.badgeRow}>
            {item.isHalal && (
              <View style={styles.halalBadge}>
                <Text style={styles.badgeText}>{t('marketplace.halal', 'Halal')}</Text>
              </View>
            )}
            {item.isMuslimOwned && (
              <View style={styles.muslimOwnedBadge}>
                <Text style={styles.badgeText}>{t('marketplace.muslimOwned', 'Muslim-Owned')}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.productInfo}>
          <Text style={[styles.productTitle, { color: tc.text.primary }]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.productPrice}>
            {formatCurrency(item.price / 100, item.currency || 'USD')}
          </Text>
          <View style={[styles.ratingRow, { flexDirection: rtlFlexRow(isRTL) }]}>
            <RatingStars rating={item.rating} tc={tc} />
            <Text style={[styles.reviewCount, { color: tc.text.tertiary }]}>({formatCount(item.reviewCount)})</Text>
          </View>
          <View style={[styles.sellerRow, { flexDirection: rtlFlexRow(isRTL) }]}>
            <Avatar
              uri={item.seller.avatarUrl}
              name={item.seller.displayName}
              size="xs"
            />
            <Text style={[styles.sellerName, { color: tc.text.secondary }]} numberOfLines={1}>
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
        <View key={`skel-${i}`} style={[styles.productCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
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
        <View style={[styles.searchInput, { backgroundColor: tc.bgCard, borderColor: tc.border, flexDirection: rtlFlexRow(isRTL) }, searchActive && styles.searchInputActive]}>
          <Icon name="search" size="sm" color={tc.text.tertiary} />
          <TextInput
            style={[styles.searchText, { color: tc.text.primary }]}
            placeholder={t('marketplace.searchPlaceholder', 'Search products...')}
            placeholderTextColor={tc.text.tertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setSearchActive(true)}
            onBlur={() => setSearchActive(false)}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')}>
              <Icon name="x" size="sm" color={tc.text.tertiary} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Category chips */}
      {renderCategoryChips()}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: tc.bg }]}>
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
            contentContainerStyle={[styles.listPadding, { paddingBottom: insets.bottom + spacing['2xl'] }]}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            refreshControl={
              <BrandedRefreshControl
                refreshing={productsQuery.isFetching && !productsQuery.isLoading}
                onRefresh={handleRefresh}
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
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
    gap: spacing.sm,
    borderWidth: 1,
  },
  searchInputActive: {
    borderColor: colors.emerald,
  },
  searchText: {
    flex: 1,
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
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: colors.active.emerald10,
    borderColor: colors.emerald,
  },
  chipText: {
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
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRow: {
    position: 'absolute',
    top: spacing.xs,
    start: spacing.xs,
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
    color: colors.text.onColor,
    fontSize: fontSize.xs,
    fontFamily: fonts.bodySemiBold,
  },
  productInfo: {
    padding: spacing.sm,
    gap: spacing.xs,
  },
  productTitle: {
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
    marginStart: spacing.xs,
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
