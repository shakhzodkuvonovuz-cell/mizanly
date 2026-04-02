import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  FlatList,
  Share,
} from 'react-native';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { showToast } from '@/components/ui/Toast';
import { useTranslation } from '@/hooks/useTranslation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import { colors, spacing, fontSize, radius, fonts, shadow } from '@/theme';
import { commerceApi } from '@/services/api';
import { navigate } from '@/utils/navigation';
import { formatCount } from '@/utils/formatCount';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';

const { width: screenWidth } = Dimensions.get('window');

interface ProductReview {
  id: string;
  rating: number;
  comment?: string;
  createdAt: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
}

interface ProductDetail {
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
    isVerified: boolean;
  };
  reviews?: ProductReview[];
  relatedProducts?: Array<{
    id: string;
    title: string;
    price: number;
    imageUrls: string[];
    rating: number;
  }>;
  createdAt: string;
}

function renderStars(rating: number, size: 'xs' | 'sm' = 'xs', inactiveColor: string = colors.gold + '40') {
  const stars: React.ReactNode[] = [];
  const full = Math.floor(rating);
  for (let i = 0; i < 5; i++) {
    stars.push(
      <Icon
        key={`star-${i}`}
        name={i < full ? 'heart-filled' : 'heart'}
        size={size}
        color={i < full ? colors.gold : inactiveColor}
      />
    );
  }
  return stars;
}

function ProductDetailContent() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { t } = useTranslation();
  const router = useRouter();
  const haptic = useContextualHaptic();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const isNavigatingRef = useRef(false);

  const productQuery = useQuery({
    queryKey: ['product', params.id],
    queryFn: () => commerceApi.getProduct(params.id!) as Promise<ProductDetail>,
    enabled: !!params.id,
    staleTime: 30_000,
  });

  const orderMutation = useMutation({
    mutationFn: () => commerceApi.createOrder({ productId: params.id! }),
    onSuccess: () => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
      navigate('/(screens)/orders');
    },
    onError: (err: Error) => {
      haptic.error();
      showToast({ message: err.message || t('common.somethingWentWrong', 'Something went wrong'), variant: 'error' });
    },
  });

  const handleRefresh = useCallback(() => {
    productQuery.refetch();
  }, [productQuery]);

  const product = productQuery.data;
  const shareUrl = `https://mizanly.app/product/${params.id}`;

  const handleBuyNow = () => {
    haptic.navigate();
    orderMutation.mutate();
  };

  const handleRelatedPress = (productId: string) => {
    haptic.navigate();
    navigate('/(screens)/product-detail', { id: productId });
  };

  const handleImageScroll = (event: { nativeEvent: { contentOffset: { x: number } } }) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / screenWidth);
    setCurrentImageIndex(index);
  };

  if (productQuery.isLoading) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title={t('product.title', 'Product')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.back', 'Back'),
          }}
        />
        <View style={[styles.skeletonWrap, { paddingTop: insets.top + 52 }]}>
          <Skeleton.Rect width="100%" height={screenWidth * 0.8} borderRadius={0} />
          <View style={styles.skeletonContent}>
            <Skeleton.Text width="70%" />
            <Skeleton.Rect width={100} height={28} borderRadius={radius.sm} />
            <Skeleton.Text width="90%" />
            <Skeleton.Text width="60%" />
            <Skeleton.Rect width="100%" height={56} borderRadius={radius.md} />
          </View>
        </View>
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title={t('product.title', 'Product')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.back', 'Back'),
          }}
        />
        <EmptyState
          icon="layers"
          title={t('product.notFound', 'Product not found')}
        />
      </View>
    );
  }

  const reviews = product.reviews ?? [];
  const visibleReviews = reviews.slice(0, 3);
  const relatedProducts = product.relatedProducts ?? [];

  return (
    <View style={styles.container}>
      <GlassHeader
        title={product.title}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back', 'Back'),
        }}
        rightActions={[
          {
            icon: 'share',
            onPress: async () => {
              haptic.tick();
              try {
                await Share.share({ message: `${product.title} - ${shareUrl}` });
              } catch { /* User cancelled */ }
            },
            accessibilityLabel: t('common.share', 'Share'),
          },
        ]}
      />

      <ScrollView
        style={{ paddingTop: insets.top + 52 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <BrandedRefreshControl
            refreshing={productQuery.isFetching && !productQuery.isLoading}
            onRefresh={handleRefresh}
          />
        }
      >
        {/* Image Carousel */}
        <View style={styles.carouselContainer}>
          <FlatList
            ref={flatListRef}
            data={product.imageUrls.length > 0 ? product.imageUrls : [null]}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleImageScroll}
            keyExtractor={(_, idx) => `img-${idx}`}
            renderItem={({ item }) =>
              item ? (
                <ProgressiveImage
                  uri={item}
                  width={screenWidth}
                  height={screenWidth * 0.8}
                />
              ) : (
                <View style={[styles.carouselImage, styles.imagePlaceholder]}>
                  <Icon name="image" size="xl" color={tc.text.tertiary} />
                </View>
              )
            }
          />
          {product.imageUrls.length > 1 && (
            <View style={styles.dotRow}>
              {product.imageUrls.map((_, idx) => (
                <View
                  key={`dot-${idx}`}
                  style={[
                    styles.dot,
                    currentImageIndex === idx && styles.dotActive,
                  ]}
                />
              ))}
            </View>
          )}
        </View>

        {/* Title + Price */}
        <Animated.View entering={FadeInUp.delay(100).duration(300)} style={styles.infoSection}>
          <Text style={styles.productTitle}>{product.title}</Text>
          <Text style={styles.productPrice}>
            ${(product.price / 100).toFixed(2)}
          </Text>
          <View style={styles.ratingRow}>
            {renderStars(product.rating, 'sm', tc.text.tertiary)}
            <Text style={styles.ratingText}>
              {product.rating.toFixed(1)} ({formatCount(product.reviewCount)} {t('product.reviews', 'reviews')})
            </Text>
          </View>
        </Animated.View>

        {/* Badges */}
        <Animated.View entering={FadeInUp.delay(150).duration(300)} style={styles.badgesSection}>
          {product.isHalal && (
            <View style={styles.certBadge}>
              <Icon name="check-circle" size="sm" color={colors.emerald} />
              <Text style={styles.certBadgeText}>
                {t('product.halalCertified', 'Halal Certified')}
              </Text>
            </View>
          )}
          {product.isMuslimOwned && (
            <View style={[styles.certBadge, styles.muslimOwnedCertBadge]}>
              <Icon name="check-circle" size="sm" color={colors.gold} />
              <Text style={[styles.certBadgeText, { color: colors.gold }]}>
                {t('product.muslimOwned', 'Muslim-Owned Business')}
              </Text>
            </View>
          )}
        </Animated.View>

        {/* Seller Card */}
        <Animated.View entering={FadeInUp.delay(200).duration(300)} style={styles.sellerCard}>
          <Pressable
            style={styles.sellerInner}
            onPress={() => {
              if (isNavigatingRef.current) return;
              isNavigatingRef.current = true;
              navigate(`/(screens)/profile/${product.seller.username}`);
              setTimeout(() => { isNavigatingRef.current = false; }, 500);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('accessibility.viewProfile', { name: product.seller.displayName })}
          >
            <Avatar
              uri={product.seller.avatarUrl}
              name={product.seller.displayName}
              size="md"
            />
            <View style={styles.sellerInfo}>
              <View style={styles.sellerNameRow}>
                <Text style={styles.sellerName}>{product.seller.displayName}</Text>
                {product.seller.isVerified && <VerifiedBadge size={13} />}
              </View>
              <Text style={styles.sellerUsername}>@{product.seller.username}</Text>
            </View>
            <Icon name="chevron-right" size="sm" color={tc.text.tertiary} />
          </Pressable>
        </Animated.View>

        {/* Description */}
        {product.description ? (
          <Animated.View entering={FadeInUp.delay(250).duration(300)} style={styles.descriptionSection}>
            <Text style={styles.sectionTitle}>
              {t('product.description', 'Description')}
            </Text>
            <Text style={styles.descriptionText}>{product.description}</Text>
          </Animated.View>
        ) : null}

        {/* Buy Now */}
        <Animated.View entering={FadeInUp.delay(300).duration(300)} style={styles.buySection}>
          <GradientButton
            label={t('product.buyNow', 'Buy Now')}
            onPress={handleBuyNow}
            loading={orderMutation.isPending}
            disabled={orderMutation.isPending}
            fullWidth
          />
          <View style={styles.installmentRow}>
            <Icon name="clock" size="sm" color={tc.text.secondary} />
            <Text style={styles.installmentText}>
              {t('product.installment', 'Pay in 2-4 installments (interest-free)')}
            </Text>
          </View>
        </Animated.View>

        {/* Reviews */}
        <Animated.View entering={FadeInUp.delay(350).duration(300)} style={styles.reviewsSection}>
          <Text style={styles.sectionTitle}>
            {t('product.reviewsTitle', 'Reviews')}
          </Text>
          {visibleReviews.length > 0 ? (
            visibleReviews.map((review) => (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <Avatar
                    uri={review.user.avatarUrl}
                    name={review.user.displayName}
                    size="sm"
                  />
                  <View style={styles.reviewHeaderInfo}>
                    <Text style={styles.reviewAuthor}>{review.user.displayName}</Text>
                    <View style={styles.reviewStars}>
                      {renderStars(review.rating, 'xs', tc.text.tertiary)}
                    </View>
                  </View>
                  <Text style={styles.reviewDate}>
                    {new Date(review.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                {review.comment && (
                  <Text style={styles.reviewComment}>{review.comment}</Text>
                )}
              </View>
            ))
          ) : (
            <Text style={styles.noReviews}>
              {t('product.noReviews', 'No reviews yet')}
            </Text>
          )}
          {reviews.length > 3 && (
            <Pressable
              style={styles.viewAllBtn}
              accessibilityRole="button"
              accessibilityLabel={t('product.viewAllReviews', 'View All Reviews')}
              onPress={() => {
                haptic.navigate();
                navigate('/(screens)/product-reviews', { productId: params.id! });
              }}
            >
              <Text style={styles.viewAllText}>
                {t('product.viewAllReviews', 'View All Reviews')}
              </Text>
              <Icon name="chevron-right" size="sm" color={colors.emerald} />
            </Pressable>
          )}
        </Animated.View>

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <Animated.View entering={FadeInUp.delay(400).duration(300)} style={styles.relatedSection}>
            <Text style={styles.sectionTitle}>
              {t('product.related', 'Related Products')}
            </Text>
            <FlatList
              data={relatedProducts}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.relatedRow}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.relatedCard}
                  onPress={() => handleRelatedPress(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}, $${(item.price / 100).toFixed(2)}`}
                >
                  {item.imageUrls?.[0] ? (
                    <ProgressiveImage
                      uri={item.imageUrls[0]}
                      width={140}
                      height={100}
                    />
                  ) : (
                    <View style={[styles.relatedImage, styles.imagePlaceholder]}>
                      <Icon name="image" size="md" color={tc.text.tertiary} />
                    </View>
                  )}
                  <Text style={styles.relatedTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.relatedPrice}>
                    ${(item.price / 100).toFixed(2)}
                  </Text>
                </Pressable>
              )}
            />
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

export default function ProductDetailScreen() {
  return (
    <ScreenErrorBoundary>
      <ProductDetailContent />
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  scrollContent: {
    paddingBottom: spacing['3xl'],
  },
  skeletonWrap: {
    flex: 1,
  },
  skeletonContent: {
    padding: spacing.base,
    gap: spacing.md,
  },
  // Carousel
  carouselContainer: {
    position: 'relative',
  },
  carouselImage: {
    width: screenWidth,
    height: screenWidth * 0.8,
  },
  imagePlaceholder: {
    backgroundColor: tc.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotRow: {
    position: 'absolute',
    bottom: spacing.md,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 20,
  },
  // Info
  infoSection: {
    padding: spacing.base,
    gap: spacing.sm,
  },
  productTitle: {
    color: tc.text.primary,
    fontSize: fontSize.xl,
    fontFamily: fonts.bodySemiBold,
  },
  productPrice: {
    color: colors.gold,
    fontSize: fontSize['2xl'],
    fontFamily: fonts.bodyBold,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  ratingText: {
    color: tc.text.secondary,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    marginStart: spacing.sm,
  },
  // Badges
  badgesSection: {
    paddingHorizontal: spacing.base,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  certBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.active.emerald10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  muslimOwnedCertBadge: {
    backgroundColor: colors.active.gold10,
  },
  certBadgeText: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontFamily: fonts.bodySemiBold,
  },
  // Seller
  sellerCard: {
    marginHorizontal: spacing.base,
    backgroundColor: tc.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: tc.border,
    marginBottom: spacing.md,
  },
  sellerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  sellerInfo: {
    flex: 1,
  },
  sellerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sellerName: {
    color: tc.text.primary,
    fontSize: fontSize.base,
    fontFamily: fonts.bodySemiBold,
  },
  sellerUsername: {
    color: tc.text.tertiary,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    marginTop: 2,
  },
  // Description
  descriptionSection: {
    paddingHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: tc.text.primary,
    fontSize: fontSize.md,
    fontFamily: fonts.bodySemiBold,
    marginBottom: spacing.sm,
  },
  descriptionText: {
    color: tc.text.secondary,
    fontSize: fontSize.base,
    fontFamily: fonts.body,
    lineHeight: 22,
  },
  // Buy
  buySection: {
    paddingHorizontal: spacing.base,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  installmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: tc.bgCard,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: tc.border,
  },
  installmentText: {
    color: tc.text.secondary,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    flex: 1,
  },
  // Reviews
  reviewsSection: {
    paddingHorizontal: spacing.base,
    marginBottom: spacing.lg,
  },
  reviewCard: {
    backgroundColor: tc.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: tc.border,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  reviewHeaderInfo: {
    flex: 1,
    gap: 2,
  },
  reviewAuthor: {
    color: tc.text.primary,
    fontSize: fontSize.sm,
    fontFamily: fonts.bodySemiBold,
  },
  reviewStars: {
    flexDirection: 'row',
    gap: 1,
  },
  reviewDate: {
    color: tc.text.tertiary,
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
  },
  reviewComment: {
    color: tc.text.secondary,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: 20,
  },
  noReviews: {
    color: tc.text.tertiary,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  viewAllText: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontFamily: fonts.bodySemiBold,
  },
  // Related products
  relatedSection: {
    paddingStart: spacing.base,
    marginBottom: spacing.lg,
  },
  relatedRow: {
    gap: spacing.md,
    paddingEnd: spacing.base,
  },
  relatedCard: {
    width: 140,
    backgroundColor: tc.bgCard,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: tc.border,
  },
  relatedImage: {
    width: 140,
    height: 100,
  },
  relatedTitle: {
    color: tc.text.primary,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  relatedPrice: {
    color: colors.gold,
    fontSize: fontSize.sm,
    fontFamily: fonts.bodySemiBold,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    paddingTop: spacing.xs,
  },
});
