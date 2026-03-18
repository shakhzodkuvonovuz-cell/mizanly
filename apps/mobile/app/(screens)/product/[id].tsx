import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Dimensions,
  FlatList,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts, shadow } from '@/theme';
import { commerceApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useHaptic } from '@/hooks/useHaptic';
import { rtlFlexRow, rtlTextAlign } from '@/utils/rtl';

const { width: screenWidth } = Dimensions.get('window');
const IMAGE_HEIGHT = 300;

interface Review {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  rating: number;
  comment?: string;
  createdAt: string;
}

interface ProductDetail {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  imageUrls: string[];
  rating: number;
  reviewCount: number;
  isMuslimOwned: boolean;
  isHalalCertified: boolean;
  seller: {
    id: string;
    displayName: string;
    username: string;
    avatarUrl: string | null;
    isVerified: boolean;
  };
  reviews: Review[];
}

const INSTALLMENT_OPTIONS = [1, 2, 3, 4];

function ImageCarousel({ images }: { images: string[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList<string>>(null);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems[0]?.index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
    [],
  );

  const viewabilityConfig = { viewAreaCoveragePercentThreshold: 50 };

  if (images.length === 0) {
    return (
      <View style={styles.imagePlaceholder}>
        <Icon name="image" size="xl" color={colors.text.tertiary} />
      </View>
    );
  }

  return (
    <View style={styles.carouselWrap}>
      <FlatList
        ref={flatListRef}
        data={images}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <Image
            source={{ uri: item }}
            style={{ width: screenWidth, height: IMAGE_HEIGHT }}
            contentFit="cover"
          />
        )}
      />
      {images.length > 1 && (
        <View style={styles.dotRow}>
          {images.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                activeIndex === i && styles.dotActive,
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function ReviewCard({
  review,
  index,
  isRTL,
}: {
  review: Review;
  index: number;
  isRTL: boolean;
}) {
  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index * 60, 400)).duration(400)}>
      <View style={styles.reviewCard}>
        <View style={[styles.reviewHeader, { flexDirection: rtlFlexRow(isRTL) }]}>
          <Avatar uri={review.avatarUrl} name={review.displayName} size="sm" />
          <View style={styles.reviewInfo}>
            <Text style={[styles.reviewName, { textAlign: rtlTextAlign(isRTL) }]}>
              {review.displayName}
            </Text>
            <View style={styles.reviewStars}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Icon
                  key={star}
                  name={star <= review.rating ? 'heart-filled' : 'heart'}
                  size={12}
                  color={star <= review.rating ? colors.gold : colors.text.tertiary}
                />
              ))}
            </View>
          </View>
          <Text style={styles.reviewDate}>
            {new Date(review.createdAt).toLocaleDateString()}
          </Text>
        </View>
        {review.comment && (
          <Text style={[styles.reviewComment, { textAlign: rtlTextAlign(isRTL) }]}>
            {review.comment}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

function LoadingSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <Skeleton.Rect width="100%" height={IMAGE_HEIGHT} borderRadius={0} />
      <View style={{ padding: spacing.base, gap: spacing.md }}>
        <Skeleton.Text width="80%" />
        <Skeleton.Text width="40%" />
        <Skeleton.Rect width="100%" height={60} borderRadius={radius.md} />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Skeleton.Rect width={100} height={28} borderRadius={radius.full} />
          <Skeleton.Rect width={80} height={28} borderRadius={radius.full} />
        </View>
        <Skeleton.Rect width="100%" height={80} borderRadius={radius.md} />
        <Skeleton.Rect width="100%" height={48} borderRadius={radius.full} />
      </View>
    </View>
  );
}

function ProductDetailScreen() {
  const { t, isRTL } = useTranslation();
  const router = useRouter();
  const haptic = useHaptic();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [selectedInstallment, setSelectedInstallment] = useState(1);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      const res = await commerceApi.getProduct(id) as { data?: ProductDetail } & ProductDetail;
      return (res.data ?? res) as ProductDetail;
    },
    enabled: !!id,
  });

  const orderMutation = useMutation({
    mutationFn: () =>
      commerceApi.createOrder({
        productId: id,
        quantity: 1,
        installments: selectedInstallment,
      }),
    onSuccess: () => {
      haptic.success();
      router.push('/(screens)/orders' as `/${string}`);
    },
  });

  if (isLoading) {
    return (
      <View style={styles.container}>
        <GlassHeader
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.back'),
          }}
          borderless
        />
        <LoadingSkeleton />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.container}>
        <GlassHeader
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.back'),
          }}
        />
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="search"
            title="Product not found"
            actionLabel={t('common.retry')}
            onAction={() => refetch()}
          />
        </View>
      </View>
    );
  }

  const installmentPrice = data.price / selectedInstallment;

  return (
    <View style={styles.container}>
      <GlassHeader
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back'),
        }}
        rightActions={[
          {
            icon: 'share',
            onPress: () => haptic.light(),
            accessibilityLabel: t('common.share'),
          },
        ]}
        borderless
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.emerald}
          />
        }
      >
        {/* Image carousel */}
        <ImageCarousel images={data.imageUrls} />

        <View style={styles.detailContent}>
          {/* Title & Price */}
          <Animated.View entering={FadeIn.duration(400)}>
            <Text style={[styles.productTitle, { textAlign: rtlTextAlign(isRTL) }]}>
              {data.title}
            </Text>
            <Text style={[styles.productPrice, { textAlign: rtlTextAlign(isRTL) }]}>
              {data.currency} {data.price.toFixed(2)}
            </Text>
          </Animated.View>

          {/* Badges */}
          <Animated.View
            entering={FadeInUp.delay(100).duration(400)}
            style={[styles.badgeRow, { flexDirection: rtlFlexRow(isRTL) }]}
          >
            {data.isHalalCertified && (
              <View style={[styles.certBadge, { backgroundColor: colors.active.gold10 }]}>
                <Icon name="check-circle" size="xs" color={colors.gold} />
                <Text style={[styles.certBadgeText, { color: colors.gold }]}>Halal Certified</Text>
              </View>
            )}
            {data.isMuslimOwned && (
              <View style={[styles.certBadge, { backgroundColor: colors.active.emerald10 }]}>
                <Icon name="check-circle" size="xs" color={colors.emerald} />
                <Text style={[styles.certBadgeText, { color: colors.emerald }]}>Muslim-owned</Text>
              </View>
            )}
          </Animated.View>

          {/* Rating */}
          <Animated.View
            entering={FadeInUp.delay(150).duration(400)}
            style={[styles.ratingRow, { flexDirection: rtlFlexRow(isRTL) }]}
          >
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Icon
                  key={star}
                  name={star <= Math.round(data.rating) ? 'heart-filled' : 'heart'}
                  size={16}
                  color={star <= Math.round(data.rating) ? colors.gold : colors.text.tertiary}
                />
              ))}
            </View>
            <Text style={styles.ratingText}>
              {data.rating.toFixed(1)} ({data.reviewCount} reviews)
            </Text>
          </Animated.View>

          {/* Description */}
          <Animated.View entering={FadeInUp.delay(200).duration(400)}>
            <Text style={[styles.sectionTitle, { textAlign: rtlTextAlign(isRTL) }]}>
              Description
            </Text>
            <Text style={[styles.descriptionText, { textAlign: rtlTextAlign(isRTL) }]}>
              {data.description}
            </Text>
          </Animated.View>

          {/* Seller info */}
          <Animated.View entering={FadeInUp.delay(250).duration(400)}>
            <Text style={[styles.sectionTitle, { textAlign: rtlTextAlign(isRTL) }]}>
              Seller
            </Text>
            <Pressable
              onPress={() => router.push(`/(screens)/profile/${data.seller.id}` as `/${string}`)}
              accessibilityLabel={`View ${data.seller.displayName}'s profile`}
            >
              <LinearGradient
                colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
                style={[styles.sellerCard, { flexDirection: rtlFlexRow(isRTL) }]}
              >
                <Avatar uri={data.seller.avatarUrl} name={data.seller.displayName} size="md" />
                <View style={styles.sellerInfo}>
                  <View style={[styles.sellerNameRow, { flexDirection: rtlFlexRow(isRTL) }]}>
                    <Text style={styles.sellerName}>{data.seller.displayName}</Text>
                    {data.seller.isVerified && <VerifiedBadge size={13} />}
                  </View>
                  <Text style={styles.sellerUsername}>@{data.seller.username}</Text>
                </View>
                <Icon name="chevron-right" size="sm" color={colors.text.tertiary} />
              </LinearGradient>
            </Pressable>
          </Animated.View>

          {/* Installment options */}
          <Animated.View entering={FadeInUp.delay(300).duration(400)}>
            <Text style={[styles.sectionTitle, { textAlign: rtlTextAlign(isRTL) }]}>
              Payment Options
            </Text>
            <View style={[styles.installmentRow, { flexDirection: rtlFlexRow(isRTL) }]}>
              {INSTALLMENT_OPTIONS.map((opt) => (
                <Pressable
                  key={opt}
                  onPress={() => {
                    haptic.light();
                    setSelectedInstallment(opt);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: selectedInstallment === opt }}
                  accessibilityLabel={`${opt}x payment`}
                >
                  <LinearGradient
                    colors={
                      selectedInstallment === opt
                        ? [colors.emeraldLight, colors.emerald]
                        : ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']
                    }
                    style={[
                      styles.installmentOption,
                      selectedInstallment === opt && styles.installmentOptionActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.installmentLabel,
                        selectedInstallment === opt && styles.installmentLabelActive,
                      ]}
                    >
                      {opt}x
                    </Text>
                    <Text
                      style={[
                        styles.installmentPrice,
                        selectedInstallment === opt && styles.installmentPriceActive,
                      ]}
                    >
                      {data.currency} {(data.price / opt).toFixed(2)}
                    </Text>
                  </LinearGradient>
                </Pressable>
              ))}
            </View>
          </Animated.View>

          {/* Buy button */}
          <Animated.View entering={FadeInUp.delay(350).duration(400)} style={styles.buyBtnWrap}>
            <GradientButton
              label={`Buy Now - ${data.currency} ${installmentPrice.toFixed(2)}${selectedInstallment > 1 ? `/mo` : ''}`}
              onPress={() => orderMutation.mutate()}
              fullWidth
              size="lg"
              loading={orderMutation.isPending}
            />
          </Animated.View>

          {/* Reviews */}
          {data.reviews && data.reviews.length > 0 && (
            <Animated.View entering={FadeInUp.delay(400).duration(400)}>
              <Text style={[styles.sectionTitle, { textAlign: rtlTextAlign(isRTL) }]}>
                Reviews ({data.reviews.length})
              </Text>
              {data.reviews.map((review, i) => (
                <ReviewCard key={review.id} review={review} index={i} isRTL={isRTL} />
              ))}
            </Animated.View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

export default function ProductDetailScreenWrapper() {
  return (
    <ScreenErrorBoundary>
      <ProductDetailScreen />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  emptyWrap: {
    flex: 1,
    paddingTop: 120,
  },
  // Carousel
  carouselWrap: {
    position: 'relative',
  },
  imagePlaceholder: {
    width: '100%',
    height: IMAGE_HEIGHT,
    backgroundColor: colors.dark.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotRow: {
    position: 'absolute',
    bottom: spacing.md,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    backgroundColor: '#FFFFFF',
    width: 20,
  },
  // Detail content
  detailContent: {
    padding: spacing.base,
    gap: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  productTitle: {
    fontFamily: fonts.headingBold,
    fontSize: fontSize.xl,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  productPrice: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.lg,
    color: colors.emerald,
  },
  // Badges
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  certBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  certBadgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.xs,
  },
  // Rating
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  ratingText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  // Sections
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  descriptionText: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.secondary,
    lineHeight: 24,
  },
  // Seller
  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    gap: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.dark.borderLight,
  },
  sellerInfo: {
    flex: 1,
    gap: 2,
  },
  sellerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sellerName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  sellerUsername: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  // Installments
  installmentRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  installmentOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    gap: spacing.xs,
    borderWidth: 0.5,
    borderColor: colors.dark.borderLight,
  },
  installmentOptionActive: {
    borderColor: colors.emerald,
  },
  installmentLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: colors.text.secondary,
  },
  installmentLabelActive: {
    color: '#FFFFFF',
  },
  installmentPrice: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  installmentPriceActive: {
    color: 'rgba(255,255,255,0.8)',
  },
  // Buy button
  buyBtnWrap: {
    paddingTop: spacing.sm,
  },
  // Reviews
  reviewCard: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.dark.border,
    gap: spacing.sm,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  reviewInfo: {
    flex: 1,
    gap: 2,
  },
  reviewName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.primary,
  },
  reviewStars: {
    flexDirection: 'row',
    gap: 1,
  },
  reviewDate: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  reviewComment: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  // Skeleton
  skeletonWrap: {
    flex: 1,
  },
});
