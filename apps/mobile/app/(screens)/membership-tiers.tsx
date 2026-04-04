import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, radius, fontSize, fonts, fontSizeExt } from '@/theme';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { rtlFlexRow, rtlTextAlign } from '@/utils/rtl';
import { monetizationApi } from '@/services/monetizationApi';
import { usersApi } from '@/services/api';
import type { MembershipTier, MembershipSubscription } from '@/types/monetization';
import type { User } from '@/types';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { showToast } from '@/components/ui/Toast';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';

const { width } = Dimensions.get('window');


const TIER_COLORS: Record<string, { gradient: readonly [string, string]; iconBg: readonly [string, string]; color: string }> = {
  bronze: {
    gradient: ['rgba(205,127,50,0.3)', 'rgba(205,127,50,0.15)'],
    iconBg: ['rgba(205,127,50,0.4)', 'rgba(205,127,50,0.2)'],
    color: '#CD7F32',
  },
  silver: {
    gradient: ['rgba(192,192,192,0.3)', 'rgba(192,192,192,0.15)'],
    iconBg: ['rgba(192,192,192,0.4)', 'rgba(192,192,192,0.2)'],
    color: '#C0C0C0',
  },
  gold: {
    gradient: ['rgba(200,150,62,0.3)', 'rgba(200,150,62,0.15)'],
    iconBg: ['rgba(200,150,62,0.4)', 'rgba(200,150,62,0.2)'],
    color: colors.gold,
  },
  platinum: {
    gradient: ['rgba(229,228,226,0.3)', 'rgba(229,228,226,0.15)'],
    iconBg: ['rgba(229,228,226,0.4)', 'rgba(229,228,226,0.2)'],
    color: '#E5E4E2',
  },
};

function TierCard({
  tier,
  index,
  onToggle,
}: {
  tier: MembershipTier;
  index: number;
  onToggle: () => void;
}) {
  const haptic = useContextualHaptic();
  const { t, isRTL } = useTranslation();
  const tc = useThemeColors();
  const tierColors = TIER_COLORS[tier.level] ?? TIER_COLORS.bronze;

  return (
    <Animated.View entering={FadeInUp.delay(index * 100).duration(400)}>
      <LinearGradient
        colors={colors.gradient.cardDark}
        style={styles.tierCard}
      >
        {/* Header */}
        <View style={styles.tierHeader}>
          <View style={styles.tierTitleSection}>
            <LinearGradient
              colors={tierColors.iconBg}
              style={styles.tierIconBg}
            >
              <Icon name="star" size="sm" color={tierColors.color} />
            </LinearGradient>
            <View>
              <Text style={[styles.tierName, { color: tc.text.primary }]}>{tier.name}</Text>
              <Text style={[styles.tierPrice, { color: tierColors.color }]}>
                ${tier.price.toFixed(2)}/{t('monetization.perMonth', 'month')}
              </Text>
            </View>
          </View>

          {/* Toggle */}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              haptic.tick();
              onToggle();
            }}
           
          >
            <LinearGradient
              colors={tier.isActive ? [colors.emerald, colors.emeraldDark] : [tc.surface, tc.bgCard]}
              style={styles.toggleTrack}
            >
              <View
                style={[
                  styles.toggleThumb,
                  { backgroundColor: tier.isActive ? colors.text.onColor : tc.border },
                  tier.isActive && styles.toggleThumbActive,
                ]}
              />
            </LinearGradient>
          </Pressable>
        </View>

        {/* Members Badge */}
        <LinearGradient
          colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
          style={styles.membersBadge}
        >
          <Icon name="users" size="xs" color={tc.text.tertiary} />
          <Text style={[styles.membersText, { color: tc.text.secondary }]}>{t('monetization.members', { count: tier._count?.subscriptions ?? 0 })}</Text>
        </LinearGradient>

        {/* Benefits */}
        <View style={styles.benefitsContainer}>
          {tier.benefits.map((benefit, i) => (
            <View key={i} style={styles.benefitRow}>
              <Icon name="check" size="xs" color={colors.emerald} />
              <Text style={[styles.benefitText, { color: tc.text.secondary }]}>{benefit}</Text>
            </View>
          ))}
        </View>

        {/* Edit Button */}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            haptic.tick();
            showToast({ message: t('common.comingSoon', 'Coming soon'), variant: 'info' });
          }}

          style={styles.editButton}
        >
          <LinearGradient
            colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
            style={[styles.editButtonGradient, { flexDirection: rtlFlexRow(isRTL) }]}
          >
            <Icon name="pencil" size="xs" color={tc.text.secondary} />
            <Text style={[styles.editButtonText, { color: tc.text.secondary }]}>{t('monetization.editTier')}</Text>
          </LinearGradient>
        </Pressable>
      </LinearGradient>
    </Animated.View>
  );
}

export default function MembershipTiersScreen() {
  const router = useRouter();
  const haptic = useContextualHaptic();
  const { t, isRTL } = useTranslation();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [tiers, setTiers] = useState<MembershipTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newTierName, setNewTierName] = useState('');
  const [newTierPrice, setNewTierPrice] = useState('');
  const [newTierBenefits, setNewTierBenefits] = useState('');
  const tc = useThemeColors();

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      // First get current user
      const userResponse = await usersApi.getMe();
      setCurrentUser(userResponse);
      // Then get tiers for this user
      const tiersResponse = await monetizationApi.getUserTiers(userResponse.id);
      setTiers(Array.isArray(tiersResponse) ? tiersResponse : []);
    } catch (err) {
      setError(t('monetization.errors.failedToLoadTiers'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const toggleTier = useCallback(async (id: string) => {
    // Optimistic update: toggle immediately in UI
    setTiers(prev => prev.map(tier =>
      tier.id === id ? { ...tier, isActive: !tier.isActive } : tier
    ));
    haptic.tick();
    try {
      await monetizationApi.toggleTierActive(id);
      fetchData(); // Sync with server
      haptic.success();
    } catch (err) {
      // Revert optimistic update on failure
      setTiers(prev => prev.map(tier =>
        tier.id === id ? { ...tier, isActive: !tier.isActive } : tier
      ));
      showToast({ message: t('monetization.errors.failedToToggleTier'), variant: 'error' });
    }
  }, [fetchData, haptic]);

  const renderTierItem = useCallback(
    ({ item, index }: { item: MembershipTier; index: number }) => (
      <TierCard
        tier={item}
        index={index}
        onToggle={() => toggleTier(item.id)}
      />
    ),
    [toggleTier],
  );

  const handleCreateTier = useCallback(async () => {
    if (!currentUser) {
      showToast({ message: t('monetization.errors.userNotLoaded'), variant: 'error' });
      return;
    }
    const price = parseFloat(newTierPrice);
    if (!newTierName.trim() || isNaN(price) || price <= 0) {
      showToast({ message: t('monetization.errors.enterValidNameAndPrice'), variant: 'error' });
      return;
    }
    const benefits = newTierBenefits.split('\n').filter(b => b.trim());
    haptic.navigate();
    setIsCreating(false);
    try {
      await monetizationApi.createTier({
        name: newTierName.trim(),
        price,
        benefits,
        level: 'bronze', // default level
        currency: 'USD',
      });
      // Reset form
      setNewTierName('');
      setNewTierPrice('');
      setNewTierBenefits('');
      // Refresh tiers list
      fetchData();
      haptic.success();
    } catch (err) {
      showToast({ message: t('monetization.errors.failedToCreateTier'), variant: 'error' });
      setIsCreating(true); // Reopen form on error
    }
  }, [currentUser, newTierName, newTierPrice, newTierBenefits, fetchData, haptic]);

  const monthlyRevenue = tiers.reduce((sum, tier) => {
    return tier.isActive ? sum + tier.price * (tier._count?.subscriptions ?? 0) : sum;
  }, 0);
  const totalMembers = tiers.reduce((sum, tier) => {
    return tier.isActive ? sum + (tier._count?.subscriptions ?? 0) : sum;
  }, 0);

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('monetization.membershipTiers')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back', 'Back') }}
        />

        {loading ? (
          <View style={{ padding: spacing.base, paddingTop: 100 }}>
            <Skeleton.Rect width="100%" height={100} borderRadius={radius.lg} />
            <Skeleton.Rect width="100%" height={200} borderRadius={radius.lg} style={{ marginTop: spacing.md }} />
            <Skeleton.Rect width="100%" height={200} borderRadius={radius.lg} style={{ marginTop: spacing.md }} />
          </View>
        ) : error ? (
          <EmptyState icon="slash" title={t('monetization.errors.unableToLoadTiers')} subtitle={error} actionLabel={t('common.retry')} onAction={fetchData} />
        ) : (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <FlatList
            data={tiers}
            keyExtractor={item => item.id}
            keyboardShouldPersistTaps="handled"
            refreshControl={<BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={styles.scrollContent}
            ListHeaderComponent={
              <>
                {/* Info Banner */}
                <Animated.View entering={FadeInUp.duration(400)}>
                  <LinearGradient
                    colors={['rgba(200,150,62,0.15)', 'rgba(28,35,51,0.2)']}
                    style={styles.infoBanner}
                  >
                    <LinearGradient
                      colors={['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.1)']}
                      style={styles.infoIconBg}
                    >
                      <Icon name="star" size="sm" color={colors.gold} />
                    </LinearGradient>
                    <View style={styles.infoContent}>
                      <Text style={[styles.infoTitle, { color: tc.text.primary }]}>{t('monetization.infoTitle')}</Text>
                      <Text style={[styles.infoSubtitle, { color: tc.text.secondary }]}>{t('monetization.infoSubtitle')}</Text>
                    </View>
                  </LinearGradient>
                </Animated.View>
              </>
            }
            renderItem={renderTierItem}
            ListFooterComponent={
              <>
                {/* Create New Tier Button / Form */}
                {!isCreating ? (
                  <Animated.View entering={FadeInUp.delay(tiers.length * 100 + 100).duration(400)}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        haptic.tick();
                        setIsCreating(true);
                      }}
                     
                    >
                      <LinearGradient
                        colors={['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.1)']}
                        style={styles.createButton}
                      >
                        <Icon name="circle-plus" size="lg" color={tc.text.tertiary} />
                        <Text style={[styles.createButtonText, { color: tc.text.tertiary }]}>{t('monetization.addMembershipTier')}</Text>
                      </LinearGradient>
                    </Pressable>
                  </Animated.View>
                ) : (
                  <Animated.View entering={FadeInUp.duration(400)}>
                    <LinearGradient
                      colors={colors.gradient.cardDark}
                      style={styles.createFormCard}
                    >
                      <Text style={[styles.createFormTitle, { color: tc.text.primary }]}>{t('monetization.createNewTier')}</Text>

                      {/* Name Input */}
                      <LinearGradient
                        colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
                        style={styles.formInputContainer}
                      >
                        <Text style={[styles.formInputLabel, { color: tc.text.tertiary }]}>{t('monetization.tierName')}</Text>
                        <TextInput
                          style={[styles.formInput, { color: tc.text.primary }]}
                          value={newTierName}
                          onChangeText={setNewTierName}
                          placeholder={t('monetization.tierNamePlaceholder', 'e.g., Premium Supporter')}
                          placeholderTextColor={tc.text.tertiary}
                        />
                      </LinearGradient>

                      {/* Price Input */}
                      <LinearGradient
                        colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
                        style={styles.formInputContainer}
                      >
                        <Text style={[styles.formInputLabel, { color: tc.text.tertiary }]}>{t('monetization.monthlyPrice')}</Text>
                        <View style={[styles.priceInputWrapper, { flexDirection: rtlFlexRow(isRTL) }]}>
                          <Text style={[styles.pricePrefix, { color: tc.text.tertiary }]}>$</Text>
                          <TextInput
                            style={[styles.formInput, { color: tc.text.primary }]}
                            value={newTierPrice}
                            onChangeText={setNewTierPrice}
                            placeholder="9.99"
                            placeholderTextColor={tc.text.tertiary}
                            keyboardType="decimal-pad"
                          />
                          <Text style={[styles.priceSuffix, { color: tc.text.tertiary }]}>/{t('monetization.perMonth', 'month')}</Text>
                        </View>
                      </LinearGradient>

                      {/* Benefits Input */}
                      <LinearGradient
                        colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
                        style={styles.formInputContainer}
                      >
                        <Text style={[styles.formInputLabel, { color: tc.text.tertiary }]}>{t('monetization.benefitsPerLine', 'Benefits (one per line)')}</Text>
                        <TextInput
                          style={[styles.formInput, styles.multilineInput, { color: tc.text.primary }]}
                          value={newTierBenefits}
                          onChangeText={setNewTierBenefits}
                          placeholder="• Exclusive content&#10;• Early access&#10;• Monthly Q&A"
                          placeholderTextColor={tc.text.tertiary}
                          multiline
                          numberOfLines={4}
                          textAlignVertical="top"
                        />
                      </LinearGradient>

                      {/* Form Buttons */}
                      <View style={styles.formButtonRow}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setIsCreating(false)}
                         
                          style={styles.cancelButton}
                        >
                          <LinearGradient
                            colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
                            style={styles.cancelButtonGradient}
                          >
                            <Text style={[styles.cancelButtonText, { color: tc.text.secondary }]}>{t('common.cancel', 'Cancel')}</Text>
                          </LinearGradient>
                        </Pressable>

                        <Pressable
                          accessibilityRole="button"
                          onPress={handleCreateTier}
                          disabled={!newTierName.trim() || !newTierPrice.trim()}
                          style={[styles.createTierButton, (!newTierName.trim() || !newTierPrice.trim()) && { opacity: 0.5 }]}
                        >
                          <LinearGradient
                            colors={[colors.emerald, colors.emeraldDark]}
                            style={styles.createTierButtonGradient}
                          >
                            <Text style={[styles.createTierButtonText, { color: tc.text.primary }]}>{t('monetization.create', 'Create')}</Text>
                          </LinearGradient>
                        </Pressable>
                      </View>
                    </LinearGradient>
                  </Animated.View>
                )}

                {/* Revenue Summary Card */}
                <Animated.View entering={FadeInUp.delay(500).duration(400)}>
                  <LinearGradient
                    colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
                    style={[styles.revenueCard, { borderStartWidth: 3, borderStartColor: colors.gold }]}
                  >
                    <View style={styles.revenueHeader}>
                      <LinearGradient
                        colors={['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.1)']}
                        style={styles.revenueIconBg}
                      >
                        <Icon name="bar-chart-2" size="sm" color={colors.gold} />
                      </LinearGradient>
                      <Text style={[styles.revenueTitle, { color: tc.text.primary }]}>{t('monetization.monthlyRevenue', 'Monthly Revenue')}</Text>
                    </View>

                    <Text style={styles.revenueAmount}>
                      ${monthlyRevenue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/month
                    </Text>

                    <View style={[styles.revenueStats, { flexDirection: rtlFlexRow(isRTL) }]}>
                      <Text style={[styles.revenueStat, { color: tc.text.secondary }]}>{totalMembers} {t('monetization.activeMembers', 'active members')}</Text>
                      <Text style={[styles.revenuePayout, { color: tc.text.tertiary }]}>{t('monetization.payoutSchedule', 'Payout: 15th of each month')}</Text>
                    </View>
                  </LinearGradient>
                </Animated.View>

                {/* Bottom spacing */}
                <View style={{ height: spacing.xxl }} />
              </>
            }
          />
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
    paddingTop: 100,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  infoIconBg: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: spacing.md,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
    marginBottom: spacing.xs,
    lineHeight: 22,
  },
  infoSubtitle: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  tierCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  tierTitleSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tierIconBg: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: spacing.md,
  },
  tierName: {
    fontFamily: fonts.heading,
    fontSize: fontSize.base,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  tierPrice: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
  },
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: radius.full,
    padding: 2,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
  },
  toggleThumbActive: {
    transform: [{ translateX: 20 }],
  },
  membersBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  membersText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  benefitsContainer: {
    marginBottom: spacing.md,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
    gap: spacing.xs,
  },
  benefitText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  editButton: {
    alignSelf: 'flex-start',
  },
  editButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  editButtonText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  createButton: {
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.active.white6,
    borderStyle: 'dashed',
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  createButtonText: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.tertiary,
    marginTop: spacing.sm,
  },
  createFormCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  createFormTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSize.md,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  formInputContainer: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  formInputLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
    marginBottom: spacing.xs,
  },
  priceInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pricePrefix: {
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    color: colors.text.tertiary,
    marginEnd: spacing.xs,
  },
  formInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.primary,
    padding: 0,
  },
  priceSuffix: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
    marginStart: spacing.xs,
  },
  multilineInput: {
    minHeight: 80,
    lineHeight: 22,
  },
  formButtonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cancelButton: {
    flex: 0.4,
  },
  cancelButtonGradient: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.secondary,
  },
  createTierButton: {
    flex: 0.6,
  },
  createTierButtonGradient: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  createTierButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  revenueCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  revenueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  revenueIconBg: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: spacing.md,
  },
  revenueTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  revenueAmount: {
    fontFamily: fonts.heading,
    fontSize: fontSizeExt.display,
    color: colors.gold,
    marginBottom: spacing.md,
  },
  revenueStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  revenueStat: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  revenuePayout: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
});
