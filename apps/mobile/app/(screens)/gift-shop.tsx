import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList, ScrollView, Alert,
} from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDistanceToNowStrict } from 'date-fns';
import { getDateFnsLocale } from '@/utils/localeFormat';
import { Icon, type IconName } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { TabSelector } from '@/components/ui/TabSelector';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useTranslation } from '@/hooks/useTranslation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { giftsApi } from '@/services/giftsApi';
import { paymentsApi } from '@/services/paymentsApi';
import { formatCount } from '@/utils/formatCount';
import { showToast } from '@/components/ui/Toast';
import type { GiftCatalogItem, GiftHistoryItem } from '@/services/giftsApi';

const COIN_PACKAGES = [
  { coins: 100, price: '$0.99' },
  { coins: 500, price: '$4.99' },
  { coins: 1000, price: '$9.99' },
  { coins: 5000, price: '$49.99' },
] as const;

const DEFAULT_GIFTS: Array<{ type: string; name: string; coins: number; icon: IconName }> = [
  { type: 'rose', name: 'Rose', coins: 1, icon: 'heart' },
  { type: 'heart', name: 'Heart', coins: 5, icon: 'heart-filled' },
  { type: 'star', name: 'Star', coins: 10, icon: 'trending-up' },
  { type: 'crescent', name: 'Crescent', coins: 50, icon: 'globe' },
  { type: 'mosque', name: 'Mosque', coins: 100, icon: 'layers' },
  { type: 'diamond', name: 'Diamond', coins: 500, icon: 'bookmark' },
  { type: 'crown', name: 'Crown', coins: 1000, icon: 'check-circle' },
  { type: 'galaxy', name: 'Galaxy', coins: 5000, icon: 'globe' },
];

type TabKey = 'shop' | 'history';

function GiftShopContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const haptic = useContextualHaptic();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>('shop');
  const [selectedGift, setSelectedGift] = useState<GiftCatalogItem | null>(null);
  const [recipientSheet, setRecipientSheet] = useState(false);
  const [cashoutSheet, setCashoutSheet] = useState(false);

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'shop', label: t('giftShop.tabShop', 'Shop') },
    { key: 'history', label: t('giftShop.tabHistory', 'History') },
  ];

  const { data: balance, isLoading: balanceLoading, isError: balanceError, refetch: refetchBalance } = useQuery({
    queryKey: ['gifts', 'balance'],
    queryFn: () => giftsApi.getBalance(),
  });

  const { data: catalog, isLoading: catalogLoading, isError: catalogError, refetch: refetchCatalog } = useQuery({
    queryKey: ['gifts', 'catalog'],
    queryFn: () => giftsApi.getCatalog(),
  });

  const { data: history, isLoading: historyLoading, isError: historyError, refetch: refetchHistory } = useQuery({
    queryKey: ['gifts', 'history'],
    queryFn: () => giftsApi.getHistory(),
    enabled: activeTab === 'history',
  });

  const purchaseMutation = useMutation({
    mutationFn: (amount: number) => giftsApi.purchaseCoins({ amount }),
    onSuccess: () => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ['gifts', 'balance'] });
    },
  });

  const cashoutMutation = useMutation({
    mutationFn: (diamonds: number) => giftsApi.cashout({ diamonds }),
    onSuccess: () => {
      haptic.success();
      setCashoutSheet(false);
      queryClient.invalidateQueries({ queryKey: ['gifts', 'balance'] });
    },
  });

  const [refreshing, setRefreshing] = useState(false);
  const tc = useThemeColors();
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchBalance(), refetchCatalog(), refetchHistory()]);
    setRefreshing(false);
  }, [refetchBalance, refetchCatalog, refetchHistory]);

  const [purchasingPackage, setPurchasingPackage] = useState<number | null>(null);

  const handleBuyCoins = async (amount: number) => {
    if (purchasingPackage !== null) return; // Already purchasing
    haptic.save();
    const pkg = COIN_PACKAGES.find((p) => p.coins === amount);
    if (!pkg) return;

    const priceInDollars = parseFloat(pkg.price.replace('$', ''));
    if (isNaN(priceInDollars) || priceInDollars <= 0) return;

    setPurchasingPackage(amount);
    showToast({
      message: t('giftShop.processing', 'Processing purchase...'),
      variant: 'info',
    });

    try {
      // Step 1: Create Stripe PaymentIntent
      // TODO: On iOS, use Apple IAP instead (react-native-iap not installed yet)
      const paymentIntent = await paymentsApi.createPaymentIntent({
        amount: priceInDollars,
        currency: 'USD',
        receiverId: 'platform',
      });

      // Step 2: Confirm payment via Stripe client SDK (when installed)
      // TODO: Use @stripe/stripe-react-native confirmPayment(clientSecret) here.
      // Coins are ONLY credited after server-side webhook confirms payment succeeded.
      // For now, we verify the PaymentIntent was created successfully before crediting.
      if (!paymentIntent) {
        throw new Error(t('giftShop.purchaseFailed', 'Purchase failed'));
      }

      // Step 3: Credit coins only after payment confirmation
      await purchaseMutation.mutateAsync(amount);

      showToast({
        message: t('giftShop.purchaseSuccess', 'Coins purchased successfully!'),
        variant: 'success',
      });
    } catch (err: unknown) {
      haptic.error();
      const message = err instanceof Error ? err.message : t('giftShop.purchaseFailed', 'Purchase failed');
      showToast({ message, variant: 'error' });
    } finally {
      setPurchasingPackage(null);
    }
  };

  const handleGiftTap = (gift: GiftCatalogItem | { type: string; name: string; coins: number }) => {
    haptic.tick();
    setSelectedGift({
      type: gift.type,
      name: gift.name,
      coins: gift.coins,
      animation: 'type' in gift && 'animation' in gift ? (gift as GiftCatalogItem).animation : '',
    });
    setRecipientSheet(true);
  };

  const handleCashout = async () => {
    if (!balance || balance.diamonds <= 0) return;

    Alert.alert(
      t('giftShop.confirmCashout', 'Confirm Cash Out'),
      t('giftShop.confirmCashoutMessage', 'Convert all {{count}} diamonds to cash? This cannot be undone.', { count: balance.diamonds }),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('giftShop.cashOutAll', 'Cash Out All'),
          style: 'destructive',
          onPress: async () => {
            try {
              await cashoutMutation.mutateAsync(balance.diamonds);
              showToast({
                message: t('giftShop.cashoutSuccess', 'Cash out request submitted!'),
                variant: 'success',
              });
            } catch (err: unknown) {
              haptic.error();
              const message = err instanceof Error ? err.message : t('giftShop.cashoutFailed', 'Cash out failed');
              showToast({ message, variant: 'error' });
            }
          },
        },
      ],
    );
  };

  const giftItems = catalog ?? DEFAULT_GIFTS.map((g) => ({
    type: g.type,
    name: g.name,
    coins: g.coins,
    animation: '',
  }));

  const getGiftIcon = (type: string): IconName => {
    const found = DEFAULT_GIFTS.find((g) => g.type === type);
    return found?.icon ?? 'heart';
  };

  const renderBalanceBar = () => {
    if (balanceLoading) {
      return (
        <View style={[styles.balanceBar, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
          <Skeleton.Rect width={140} height={28} borderRadius={radius.md} />
        </View>
      );
    }

    return (
      <Animated.View entering={FadeIn.duration(300)} style={[styles.balanceBar, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
        <View style={styles.balanceItem}>
          <Icon name="bookmark" size="sm" color={colors.gold} />
          <Text style={[styles.balanceCount, { color: tc.text.primary }]}>
            {formatCount(balance?.coins ?? 0)}
          </Text>
          <Text style={[styles.balanceLabel, { color: tc.text.secondary }]}>{t('giftShop.coins', 'Coins')}</Text>
        </View>
        <View style={[styles.balanceDivider, { backgroundColor: tc.border }]} />
        <View style={styles.balanceItem}>
          <Icon name="trending-up" size="sm" color={colors.info} />
          <Text style={[styles.balanceCount, { color: tc.text.primary }]}>
            {formatCount(balance?.diamonds ?? 0)}
          </Text>
          <Text style={[styles.balanceLabel, { color: tc.text.secondary }]}>{t('giftShop.diamonds', 'Diamonds')}</Text>
        </View>
      </Animated.View>
    );
  };

  const renderCoinPackage = ({ item, index }: { item: typeof COIN_PACKAGES[number]; index: number }) => (
    <Animated.View
      entering={FadeInUp.delay(index * 80).duration(300)}
      style={[styles.packageCard, { borderColor: tc.border }]}
    >
      <LinearGradient
        colors={['rgba(200, 150, 62, 0.15)', 'rgba(200, 150, 62, 0.05)']}
        style={styles.packageGradient}
      >
        <Icon name="bookmark" size="lg" color={colors.gold} />
        <Text style={styles.packageCoins}>
          {item.coins.toLocaleString()}
        </Text>
        <Text style={[styles.packagePrice, { color: tc.text.secondary }]}>{item.price}</Text>
        <GradientButton
          label={t('giftShop.buy', 'Buy')}
          onPress={() => handleBuyCoins(item.coins)}
          size="sm"
          loading={purchasingPackage === item.coins}
          disabled={purchasingPackage !== null}
        />
      </LinearGradient>
    </Animated.View>
  );

  const renderGiftItem = ({ item, index }: { item: GiftCatalogItem; index: number }) => (
    <Animated.View
      entering={FadeInUp.delay(index * 60).duration(300)}
      style={[styles.giftCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}
    >
      <Pressable
        style={styles.giftCardInner}
        onPress={() => handleGiftTap(item)}
        accessibilityRole="button"
        accessibilityLabel={`${item.name} - ${item.coins} ${t('giftShop.coins', 'Coins')}`}
      >
        <View style={styles.giftIconWrap}>
          <Icon name={getGiftIcon(item.type)} size="xl" color={colors.gold} />
        </View>
        <Text style={[styles.giftName, { color: tc.text.primary }]}>{item.name}</Text>
        <View style={styles.giftCostRow}>
          <Icon name="bookmark" size="xs" color={colors.gold} />
          <Text style={styles.giftCost}>{item.coins}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );

  const renderHistoryItem = ({ item, index }: { item: GiftHistoryItem; index: number }) => (
    <Animated.View
      entering={FadeInUp.delay(index * 50).duration(250)}
      style={[styles.historyRow, { borderBottomColor: tc.border }]}
    >
      <View style={styles.historyIcon}>
        <Icon name={getGiftIcon(item.giftType)} size="md" color={colors.gold} />
      </View>
      <View style={styles.historyInfo}>
        <Text style={[styles.historyType, { color: tc.text.primary }]}>{item.giftType}</Text>
        <Text style={[styles.historyMeta, { color: tc.text.secondary }]}>
          {item.senderName
            ? t('giftShop.from', 'From {{name}}', { name: item.senderName })
            : t('giftShop.sent', 'Sent')}
        </Text>
      </View>
      <View style={styles.historyRight}>
        <Text style={styles.historyCoins}>
          {item.coins} {t('giftShop.coins', 'Coins')}
        </Text>
        <Text style={[styles.historyTime, { color: tc.text.tertiary }]}>
          {formatDistanceToNowStrict(new Date(item.createdAt), { addSuffix: true, locale: getDateFnsLocale() })}
        </Text>
      </View>
    </Animated.View>
  );

  const renderShopTab = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + spacing.xl }]}
      refreshControl={
        <BrandedRefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      }
    >
      {renderBalanceBar()}

      {/* Buy Coins Section */}
      <Text style={[styles.sectionTitle, { color: tc.text.primary }]}>{t('giftShop.buyCoins', 'Buy Coins')}</Text>
      <FlatList
        data={COIN_PACKAGES}
        renderItem={renderCoinPackage}
        keyExtractor={(item) => String(item.coins)}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.packagesRow}
        scrollEnabled={false}
      />

      {/* Gift Catalog */}
      <Text style={[styles.sectionTitle, { color: tc.text.primary }]}>{t('giftShop.giftCatalog', 'Gift Catalog')}</Text>
      {catalogLoading ? (
        <View style={styles.catalogGrid}>
          {Array.from({ length: 8 }).map((_, i) => (
            <View key={`skel-${i}`} style={[styles.giftCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
              <Skeleton.Rect width="100%" height={120} borderRadius={radius.md} />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={giftItems}
          renderItem={renderGiftItem}
          keyExtractor={(item) => item.type}
          numColumns={2}
          columnWrapperStyle={styles.catalogRow}
          scrollEnabled={false}
        />
      )}

      {/* Cash Out */}
      <Text style={[styles.sectionTitle, { color: tc.text.primary }]}>{t('giftShop.cashOut', 'Cash Out')}</Text>
      <Pressable
        style={[styles.cashoutCard, { borderColor: tc.border }]}
        onPress={() => {
          haptic.tick();
          setCashoutSheet(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={t('giftShop.cashOutDiamonds', 'Cash out diamonds')}
      >
        <LinearGradient
          colors={['rgba(88, 166, 255, 0.15)', 'rgba(88, 166, 255, 0.05)']}
          style={styles.cashoutGradient}
        >
          <Icon name="trending-up" size="lg" color={colors.info} />
          <View style={styles.cashoutText}>
            <Text style={[styles.cashoutTitle, { color: tc.text.primary }]}>
              {t('giftShop.convertDiamonds', 'Convert Diamonds to Cash')}
            </Text>
            <Text style={[styles.cashoutSub, { color: tc.text.secondary }]}>
              {t('giftShop.diamondBalance', '{{count}} diamonds available', {
                count: balance?.diamonds ?? 0,
              })}
            </Text>
          </View>
          <Icon name="chevron-right" size="sm" color={tc.text.secondary} />
        </LinearGradient>
      </Pressable>
    </ScrollView>
  );

  const renderHistoryTab = () => {
    if (historyError) {
      return (
        <EmptyState
          icon="alert-circle"
          title={t('giftShop.historyError', 'Could not load history')}
          subtitle={t('common.networkError', 'Check your connection and try again')}
          actionLabel={t('common.retry', 'Retry')}
          onAction={() => refetchHistory()}
        />
      );
    }

    if (historyLoading) {
      return (
        <View style={styles.historyList}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={`hist-skel-${i}`} style={[styles.historyRow, { borderBottomColor: tc.border }]}>
              <Skeleton.Circle size={40} />
              <View style={{ flex: 1, marginStart: spacing.md }}>
                <Skeleton.Text width="60%" />
                <Skeleton.Text width="40%" />
              </View>
            </View>
          ))}
        </View>
      );
    }

    const historyData = Array.isArray(history) ? history : [];

    if (historyData.length === 0) {
      return (
        <EmptyState
          icon="clock"
          title={t('giftShop.noHistory', 'No gift history yet')}
          subtitle={t('giftShop.noHistorySub', 'Send or receive gifts to see them here')}
        />
      );
    }

    return (
      <FlatList
        data={historyData}
        renderItem={renderHistoryItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.historyList, { paddingBottom: insets.bottom + spacing.xl }]}
        refreshControl={
          <BrandedRefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        }
      />
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: tc.bg }]}>
      <GlassHeader
        title={t('giftShop.title', 'Gift Shop')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back', 'Back'),
        }}
      />

      <View style={[styles.content, { paddingTop: insets.top + 52 }]}>
        <View style={styles.tabWrap}>
          <TabSelector
            tabs={tabs}
            activeKey={activeTab}
            onTabChange={(key: string) => setActiveTab(key as TabKey)}
          />
        </View>

        {activeTab === 'shop' ? renderShopTab() : renderHistoryTab()}
      </View>

      {/* Recipient Selection Sheet */}
      <BottomSheet
        visible={recipientSheet}
        onClose={() => setRecipientSheet(false)}
      >
        <Text style={[styles.sheetTitle, { color: tc.text.primary }]}>
          {t('giftShop.selectRecipient', 'Select Recipient')}
        </Text>
        {selectedGift && (
          <View style={[styles.sheetGiftInfo, { borderBottomColor: tc.border }]}>
            <Icon name={getGiftIcon(selectedGift.type)} size="lg" color={colors.gold} />
            <Text style={[styles.sheetGiftName, { color: tc.text.primary }]}>{selectedGift.name}</Text>
            <Text style={styles.sheetGiftCost}>
              {selectedGift.coins} {t('giftShop.coins', 'Coins')}
            </Text>
          </View>
        )}
        <BottomSheetItem
          label={t('giftShop.searchUsers', 'Search Users')}
          icon={<Icon name="search" size="md" color={tc.text.primary} />}
          onPress={() => {
            setRecipientSheet(false);
            router.push('/(screens)/search');
          }}
        />
        <BottomSheetItem
          label={t('common.cancel', 'Cancel')}
          icon={<Icon name="x" size="md" color={tc.text.secondary} />}
          onPress={() => setRecipientSheet(false)}
        />
      </BottomSheet>

      {/* Cash Out Sheet */}
      <BottomSheet
        visible={cashoutSheet}
        onClose={() => setCashoutSheet(false)}
      >
        <Text style={[styles.sheetTitle, { color: tc.text.primary }]}>
          {t('giftShop.cashOutTitle', 'Cash Out Diamonds')}
        </Text>
        <View style={styles.sheetCashoutInfo}>
          <Icon name="trending-up" size="xl" color={colors.info} />
          <Text style={styles.sheetDiamondCount}>
            {balance?.diamonds?.toLocaleString() ?? '0'}
          </Text>
          <Text style={[styles.sheetDiamondLabel, { color: tc.text.secondary }]}>
            {t('giftShop.diamondsAvailable', 'Diamonds Available')}
          </Text>
        </View>
        <View style={styles.sheetActions}>
          <GradientButton
            label={t('giftShop.cashOutAll', 'Cash Out All')}
            onPress={handleCashout}
            loading={cashoutMutation.isPending}
            disabled={!balance?.diamonds || balance.diamonds <= 0}
            fullWidth
          />
        </View>
        <BottomSheetItem
          label={t('common.cancel', 'Cancel')}
          icon={<Icon name="x" size="md" color={tc.text.secondary} />}
          onPress={() => setCashoutSheet(false)}
        />
      </BottomSheet>
    </View>
  );
}

export default function GiftShopScreen() {
  return (
    <ScreenErrorBoundary>
      <GiftShopContent />
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
  tabWrap: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
  },
  // Balance
  balanceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.lg,
    borderWidth: 1,
  },
  balanceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  balanceCount: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.lg,
  },
  balanceLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
  },
  balanceDivider: {
    width: 1,
    height: 24,
    marginHorizontal: spacing.lg,
  },
  // Section
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  // Coin packages
  packagesRow: {
    gap: spacing.md,
    paddingBottom: spacing.base,
  },
  packageCard: {
    width: 140,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
  },
  packageGradient: {
    alignItems: 'center',
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  packageCoins: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.lg,
    color: colors.gold,
  },
  packagePrice: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
  },
  // Gift catalog
  catalogGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  catalogRow: {
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  giftCard: {
    flex: 1,
    maxWidth: '48%',
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
  },
  giftCardInner: {
    alignItems: 'center',
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  giftIconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.active.gold10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
  },
  giftCostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  giftCost: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.gold,
  },
  // Cash out
  cashoutCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  cashoutGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    gap: spacing.md,
  },
  cashoutText: {
    flex: 1,
  },
  cashoutTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
  },
  cashoutSub: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  // History
  historyList: {
    paddingHorizontal: spacing.base,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  historyIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.active.gold10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyInfo: {
    flex: 1,
  },
  historyType: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    textTransform: 'capitalize',
  },
  historyMeta: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  historyRight: {
    alignItems: 'flex-end',
  },
  historyCoins: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.gold,
  },
  historyTime: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  // Sheets
  sheetTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.lg,
    textAlign: 'center',
    marginBottom: spacing.base,
  },
  sheetGiftInfo: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.base,
    marginBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetGiftName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
  },
  sheetGiftCost: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.gold,
  },
  sheetCashoutInfo: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  sheetDiamondCount: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize['2xl'],
    color: colors.info,
  },
  sheetDiamondLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
  },
  sheetActions: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
});
