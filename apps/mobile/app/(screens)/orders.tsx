import { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
} from 'react-native';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useTranslation } from '@/hooks/useTranslation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { commerceApi } from '@/services/api';
import { navigate } from '@/utils/navigation';

type OrderStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';

interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  totalPrice: number;
  status: OrderStatus;
  createdAt: string;
  product: {
    id: string;
    title: string;
    imageUrls: string[];
    price: number;
  };
}

interface OrdersResponse {
  data: OrderItem[];
  meta: { cursor: string | null; hasMore: boolean };
}

const STATUS_CONFIG: Record<OrderStatus, { color: string; bgColor: string; labelKey: string }> = {
  pending: { color: colors.gold, bgColor: colors.active.gold10, labelKey: 'orders.statusPending' },
  paid: { color: colors.info, bgColor: 'rgba(88, 166, 255, 0.1)', labelKey: 'orders.statusPaid' },
  shipped: { color: colors.emerald, bgColor: colors.active.emerald10, labelKey: 'orders.statusShipped' },
  delivered: { color: colors.extended.greenBright, bgColor: 'rgba(63, 185, 80, 0.1)', labelKey: 'orders.statusDelivered' },
  cancelled: { color: colors.error, bgColor: colors.active.error10, labelKey: 'orders.statusCancelled' },
};

function OrdersContent() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { t } = useTranslation();
  const router = useRouter();
  const haptic = useContextualHaptic();
  const insets = useSafeAreaInsets();

  const ordersQuery = useInfiniteQuery<OrdersResponse>({
    queryKey: ['my-orders'],
    queryFn: ({ pageParam }) =>
      commerceApi.getMyOrders(pageParam as string | undefined) as Promise<OrdersResponse>,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore ? lastPage.meta.cursor ?? undefined : undefined,
    initialPageParam: undefined as string | undefined,
  });

  const allOrders = ordersQuery.data?.pages.flatMap((p) => p.data) ?? [];

  const handleRefresh = useCallback(() => {
    ordersQuery.refetch();
  }, [ordersQuery]);

  const handleLoadMore = () => {
    if (ordersQuery.hasNextPage && !ordersQuery.isFetchingNextPage) {
      ordersQuery.fetchNextPage();
    }
  };

  const handleOrderPress = (order: OrderItem) => {
    haptic.navigate();
    navigate('/(screens)/product-detail', { id: order.productId });
  };

  const getStatusConfig = (status: string) => {
    return STATUS_CONFIG[status as OrderStatus] ?? STATUS_CONFIG.pending;
  };

  const renderOrderItem = ({ item, index }: { item: OrderItem; index: number }) => {
    const statusConf = getStatusConfig(item.status);

    return (
      <Animated.View entering={FadeInUp.delay(index * 60).duration(300)}>
        <Pressable
          style={styles.orderCard}
          onPress={() => handleOrderPress(item)}
          accessibilityRole="button"
          accessibilityLabel={`Order ${item.id}, ${item.product.title}`}
        >
          <View style={styles.orderRow}>
            {/* Thumbnail */}
            <View style={styles.thumbnailWrap}>
              {item.product.imageUrls?.[0] ? (
                <ProgressiveImage
                  uri={item.product.imageUrls[0]}
                  width={72}
                  height={72}
                  borderRadius={radius.md}
                />
              ) : (
                <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
                  <Icon name="image" size="md" color={tc.text.tertiary} />
                </View>
              )}
            </View>

            {/* Info */}
            <View style={styles.orderInfo}>
              <Text style={styles.orderTitle} numberOfLines={2}>
                {item.product.title}
              </Text>
              <Text style={styles.orderPrice}>
                ${(item.totalPrice / 100).toFixed(2)}
                {item.quantity > 1 && (
                  <Text style={styles.orderQty}> x{item.quantity}</Text>
                )}
              </Text>
              <View style={styles.orderMeta}>
                <Text style={styles.orderDate}>
                  {new Date(item.createdAt).toLocaleDateString()}
                </Text>
                <Text style={styles.orderId}>
                  #{item.id.slice(0, 8).toUpperCase()}
                </Text>
              </View>
            </View>

            {/* Status Badge */}
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: statusConf.bgColor },
              ]}
            >
              <Text style={[styles.statusText, { color: statusConf.color }]}>
                {t(statusConf.labelKey, item.status)}
              </Text>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    );
  };

  const renderSkeleton = () => (
    <View style={styles.skeletonWrap}>
      {Array.from({ length: 5 }).map((_, i) => (
        <View key={`skel-${i}`} style={styles.orderCard}>
          <View style={styles.orderRow}>
            <Skeleton.Rect width={72} height={72} borderRadius={radius.md} />
            <View style={{ flex: 1, gap: spacing.sm }}>
              <Skeleton.Text width="70%" />
              <Skeleton.Text width="40%" />
              <Skeleton.Text width="50%" />
            </View>
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      <GlassHeader
        title={t('orders.title', 'My Orders')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back', 'Back'),
        }}
      />

      <View style={[styles.content, { paddingTop: insets.top + 52 }]}>
        {ordersQuery.isLoading ? (
          renderSkeleton()
        ) : (
          <FlatList
            data={allOrders}
            renderItem={renderOrderItem}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <EmptyState
                icon="layers"
                title={t('orders.empty', 'No orders yet')}
                subtitle={t('orders.emptySub', 'Your orders will appear here')}
              />
            }
            ListFooterComponent={
              ordersQuery.isFetchingNextPage ? (
                <View style={styles.footerLoader}>
                  <Skeleton.Rect width={120} height={20} borderRadius={radius.sm} />
                </View>
              ) : null
            }
            contentContainerStyle={styles.listContent}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            refreshControl={
              <BrandedRefreshControl
                refreshing={ordersQuery.isFetching && !ordersQuery.isLoading}
                onRefresh={handleRefresh}
              />
            }
          />
        )}
      </View>
    </View>
  );
}

export default function OrdersScreen() {
  return (
    <ScreenErrorBoundary>
      <OrdersContent />
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  content: {
    flex: 1,
  },
  listContent: {
    padding: spacing.base,
    paddingBottom: spacing['2xl'],
  },
  skeletonWrap: {
    padding: spacing.base,
    gap: spacing.sm,
  },
  // Order card
  orderCard: {
    backgroundColor: tc.bgCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: tc.border,
  },
  orderRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  thumbnailWrap: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
  },
  thumbnailPlaceholder: {
    backgroundColor: tc.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  orderTitle: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontFamily: fonts.bodySemiBold,
  },
  orderPrice: {
    color: colors.gold,
    fontSize: fontSize.base,
    fontFamily: fonts.bodyBold,
  },
  orderQty: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
  },
  orderMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  orderDate: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
  },
  orderId: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    fontFamily: fonts.mono,
  },
  // Status
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.bodySemiBold,
  },
  footerLoader: {
    paddingVertical: spacing.base,
    alignItems: 'center',
  },
});
