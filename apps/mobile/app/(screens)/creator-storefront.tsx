import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Image,
  RefreshControl,
  Dimensions,
  Pressable,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts, shadow, fontSizeExt } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useHaptic } from '@/hooks/useHaptic';
import { api } from '@/services/api';
import { navigate } from '@/utils/navigation';

interface StorefrontProduct {
  id: string;
  name: string;
  price: number;
  currency: string;
  imageUrl: string | null;
  isHalalCertified: boolean;
  description: string;
  inStock: boolean;
}

interface CreatorProfile {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  followersCount: number;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLUMN_GAP = spacing.md;
const CARD_WIDTH = (SCREEN_WIDTH - spacing.base * 2 - COLUMN_GAP) / 2;

function CreatorStorefrontContent() {
  const router = useRouter();
  const tc = useThemeColors();
  const { t } = useTranslation();
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();
  const { userId, username } = useLocalSearchParams<{ userId: string; username: string }>();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [products, setProducts] = useState<StorefrontProduct[]>([]);
  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(false);

  const fetchStorefront = useCallback(async (isRefresh = false) => {
    if (!userId) return;
    if (isRefresh) setRefreshing(true);
    try {
      const [productsRes, profileRes] = await Promise.all([
        api.get(`/storefront/${userId}/products`),
        api.get(`/users/${userId}`),
      ]);
      // API client already unwraps the response envelope
      const products = Array.isArray(productsRes) ? productsRes as StorefrontProduct[] : [];
      const profile = profileRes as CreatorProfile & { isMe?: boolean };
      setProducts(products);
      if (profile) {
        setCreator(profile);
        setIsOwnProfile(!!profile.isMe);
      }
    } catch {
      // Keep existing data on error
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchStorefront();
  }, [fetchStorefront]);

  const handleRefresh = useCallback(() => {
    fetchStorefront(true);
  }, [fetchStorefront]);

  const handleProductPress = useCallback((productId: string) => {
    haptic.light();
    navigate('/(screens)/product-detail', { productId });
  }, [haptic, router]);

  const handleAddProduct = useCallback(() => {
    haptic.medium();
    router.push('/(screens)/marketplace');
  }, [haptic, router]);

  const formatFollowers = (count: number): string => {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return count.toString();
  };

  const renderProduct = useCallback(({ item, index }: { item: StorefrontProduct; index: number }) => (
    <Animated.View entering={FadeInUp.delay(100 + index * 50).duration(400)}>
      <Pressable
        onPress={() => handleProductPress(item.id)}
        style={[styles.productCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${item.currency}${item.price}`}
      >
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={[styles.productImage, { backgroundColor: tc.surface }]} />
        ) : (
          <View style={[styles.productImage, styles.productImagePlaceholder]}>
            <Icon name="image" size="lg" color={colors.text.tertiary} />
          </View>
        )}

        {item.isHalalCertified && (
          <View style={styles.halalBadge}>
            <Icon name="check-circle" size="xs" color={colors.emerald} />
            <Text style={styles.halalText}>{t('storefront.halal')}</Text>
          </View>
        )}

        {!item.inStock && (
          <View style={styles.outOfStockOverlay}>
            <Text style={styles.outOfStockText}>{t('storefront.outOfStock')}</Text>
          </View>
        )}

        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.productPrice}>
              {item.currency}{item.price.toFixed(2)}
            </Text>
            <View style={styles.buyBadge}>
              <Text style={styles.buyBadgeText}>{t('storefront.buy')}</Text>
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  ), [handleProductPress, t]);

  const renderHeader = useCallback(() => {
    if (loading) {
      return (
        <View style={styles.headerSection}>
          <View style={styles.creatorHeader}>
            <Skeleton.Circle size={64} />
            <View style={styles.creatorInfo}>
              <Skeleton.Rect width={140} height={18} borderRadius={radius.sm} />
              <Skeleton.Rect width={100} height={14} borderRadius={radius.sm} />
            </View>
          </View>
          <View style={styles.skeletonGrid}>
            <Skeleton.Rect width={CARD_WIDTH} height={200} borderRadius={radius.lg} />
            <Skeleton.Rect width={CARD_WIDTH} height={200} borderRadius={radius.lg} />
          </View>
        </View>
      );
    }

    return (
      <Animated.View entering={FadeIn.duration(400)} style={styles.headerSection}>
        {creator && (
          <View style={styles.creatorHeader}>
            <Avatar
              uri={creator.avatarUrl}
              name={creator.displayName}
              size="xl"
            />
            <View style={styles.creatorInfo}>
              <Text style={styles.creatorName}>{creator.displayName}</Text>
              <Text style={styles.creatorUsername}>@{creator.username}</Text>
              <Text style={styles.creatorFollowers}>
                {formatFollowers(creator.followersCount)} {t('storefront.followers')}
              </Text>
            </View>
          </View>
        )}

        <View style={[styles.shopStats, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
          <View style={styles.statItem}>
            <Icon name="layers" size="sm" color={colors.emerald} />
            <Text style={styles.statValue}>{products.length}</Text>
            <Text style={styles.statLabel}>{t('storefront.products')}</Text>
          </View>
        </View>
      </Animated.View>
    );
  }, [loading, creator, products.length, t]);

  const shopTitle = username
    ? t('storefront.userShop', { username })
    : t('storefront.shop');

  return (
    <View style={[styles.container, { backgroundColor: tc.bg }]}>
      <GlassHeader
        title={shopTitle}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back'),
        }}
      />

      <FlatList
        data={loading ? [] : products}
        renderItem={renderProduct}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="layers"
              title={t('storefront.emptyTitle')}
              subtitle={isOwnProfile ? t('storefront.emptyOwnerSub') : t('storefront.emptySub')}
              actionLabel={isOwnProfile ? t('storefront.addProduct') : undefined}
              onAction={isOwnProfile ? handleAddProduct : undefined}
            />
          ) : null
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + spacing['3xl'] },
          products.length === 0 && !loading && styles.emptyList,
        ]}
        style={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.emerald}
          />
        }
      />

      {/* Add Product FAB for own profile */}
      {isOwnProfile && !loading && (
        <Animated.View
          entering={FadeIn.delay(500).duration(400)}
          style={[styles.fab, { bottom: insets.bottom + spacing.xl }]}
        >
          <Pressable
            onPress={handleAddProduct}
            style={styles.fabButton}
            accessibilityRole="button"
            accessibilityLabel={t('storefront.addProduct')}
          >
            <LinearGradient
              colors={[colors.emeraldLight, colors.emerald]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.fabGradient}
            >
              <Icon name="plus" size="lg" color="#FFFFFF" />
            </LinearGradient>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

export default function CreatorStorefrontScreen() {
  return (
    <ScreenErrorBoundary>
      <CreatorStorefrontContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  list: {
    flex: 1,
    marginTop: 100,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
  },
  emptyList: {
    flexGrow: 1,
  },
  headerSection: {
    marginBottom: spacing.lg,
    gap: spacing.lg,
  },
  creatorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
  },
  creatorInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  creatorName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.lg,
    color: colors.text.primary,
  },
  creatorUsername: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  creatorFollowers: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  shopStats: {
    flexDirection: 'row',
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dark.border,
    padding: spacing.base,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  statLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  skeletonGrid: {
    flexDirection: 'row',
    gap: COLUMN_GAP,
  },
  columnWrapper: {
    gap: COLUMN_GAP,
    marginBottom: COLUMN_GAP,
  },
  productCard: {
    width: CARD_WIDTH,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dark.border,
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: CARD_WIDTH,
    backgroundColor: colors.dark.surface,
  },
  productImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  halalBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.active.emerald20,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  halalText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizeExt.tiny,
    color: colors.emerald,
  },
  outOfStockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outOfStockText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.primary,
  },
  productInfo: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  productName: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
    color: colors.text.primary,
    lineHeight: 18,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  productPrice: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.emerald,
  },
  buyBadge: {
    backgroundColor: colors.active.emerald10,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  buyBadgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizeExt.tiny,
    color: colors.emerald,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    ...shadow.lg,
  },
  fabButton: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
