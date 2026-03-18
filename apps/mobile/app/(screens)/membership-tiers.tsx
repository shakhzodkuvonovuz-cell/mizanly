import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  TextInput,
  Dimensions,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { useHaptic } from '@/hooks/useHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { monetizationApi } from '@/services/monetizationApi';
import { usersApi } from '@/services/api';
import type { MembershipTier, MembershipSubscription } from '@/types/monetization';
import type { User } from '@/types';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

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
  const haptic = useHaptic();
  const { t } = useTranslation();
  const tierColors = TIER_COLORS[tier.level];

  return (
    <Animated.View entering={FadeInUp.delay(index * 100).duration(400)}>
      <LinearGradient
        colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
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
              <Text style={styles.tierName}>{tier.name}</Text>
              <Text style={[styles.tierPrice, { color: tierColors.color }]}>
                ${tier.price.toFixed(2)}/month
              </Text>
            </View>
          </View>

          {/* Toggle */}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              haptic.light();
              onToggle();
            }}
           
          >
            <LinearGradient
              colors={tier.isActive ? [colors.emerald, colors.emeraldDark] : [colors.dark.surface, colors.dark.bgCard]}
              style={styles.toggleTrack}
            >
              <View
                style={[
                  styles.toggleThumb,
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
          <Icon name="users" size="xs" color={colors.text.tertiary} />
          <Text style={styles.membersText}>{t('monetization.members', { count: tier._count?.subscriptions ?? 0 })}</Text>
        </LinearGradient>

        {/* Benefits */}
        <View style={styles.benefitsContainer}>
          {tier.benefits.map((benefit, i) => (
            <View key={i} style={styles.benefitRow}>
              <Icon name="check" size="xs" color={colors.emerald} />
              <Text style={styles.benefitText}>{benefit}</Text>
            </View>
          ))}
        </View>

        {/* Edit Button */}
        <Pressable
          accessibilityRole="button"
          onPress={() => haptic.light()}
         
          style={styles.editButton}
        >
          <LinearGradient
            colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
            style={styles.editButtonGradient}
          >
            <Icon name="pencil" size="xs" color={colors.text.secondary} />
            <Text style={styles.editButtonText}>{t('monetization.editTier')}</Text>
          </LinearGradient>
        </Pressable>
      </LinearGradient>
    </Animated.View>
  );
}

export default function MembershipTiersScreen() {
  const router = useRouter();
  const haptic = useHaptic();
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [tiers, setTiers] = useState<MembershipTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newTierName, setNewTierName] = useState('');
  const [newTierPrice, setNewTierPrice] = useState('');
  const [newTierBenefits, setNewTierBenefits] = useState('');

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
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const toggleTier = useCallback(async (id: string) => {
    try {
      await monetizationApi.toggleTierActive(id);
      // Refetch tiers to get updated state
      fetchData();
      haptic.success();
    } catch (err) {
      Alert.alert(t('common.error'), t('monetization.errors.failedToToggleTier'));
    }
  }, [fetchData, haptic]);

  const handleCreateTier = useCallback(async () => {
    if (!currentUser) {
      Alert.alert(t('common.error'), t('monetization.errors.userNotLoaded'));
      return;
    }
    const price = parseFloat(newTierPrice);
    if (!newTierName.trim() || isNaN(price) || price <= 0) {
      Alert.alert(t('common.error'), t('monetization.errors.enterValidNameAndPrice'));
      return;
    }
    const benefits = newTierBenefits.split('\n').filter(b => b.trim());
    haptic.medium();
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
      Alert.alert(t('common.error'), t('monetization.errors.failedToCreateTier'));
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
      <SafeAreaView style={styles.container}>
        <GlassHeader
          title={t('monetization.membershipTiers')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
          rightActions={[{ icon: 'star', onPress: () => {}, accessibilityLabel: 'Tiers' }]}
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
          <FlatList
            data={tiers}
            keyExtractor={item => item.id}
            refreshControl={<RefreshControl tintColor={colors.emerald} refreshing={refreshing} onRefresh={onRefresh} />}
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
                      <Text style={styles.infoTitle}>{t('monetization.infoTitle')}</Text>
                      <Text style={styles.infoSubtitle}>{t('monetization.infoSubtitle')}</Text>
                    </View>
                  </LinearGradient>
                </Animated.View>
              </>
            }
            renderItem={({ item, index }) => (
              <TierCard
                tier={item}
                index={index}
                onToggle={() => toggleTier(item.id)}
              />
            )}
            ListFooterComponent={
              <>
                {/* Create New Tier Button / Form */}
                {!isCreating ? (
                  <Animated.View entering={FadeInUp.delay(tiers.length * 100 + 100).duration(400)}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        haptic.light();
                        setIsCreating(true);
                      }}
                     
                    >
                      <LinearGradient
                        colors={['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.1)']}
                        style={styles.createButton}
                      >
                        <Icon name="circle-plus" size="lg" color={colors.text.tertiary} />
                        <Text style={styles.createButtonText}>{t('monetization.addMembershipTier')}</Text>
                      </LinearGradient>
                    </Pressable>
                  </Animated.View>
                ) : (
                  <Animated.View entering={FadeInUp.duration(400)}>
                    <LinearGradient
                      colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
                      style={styles.createFormCard}
                    >
                      <Text style={styles.createFormTitle}>{t('monetization.createNewTier')}</Text>

                      {/* Name Input */}
                      <LinearGradient
                        colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
                        style={styles.formInputContainer}
                      >
                        <Text style={styles.formInputLabel}>{t('monetization.tierName')}</Text>
                        <TextInput
                          style={styles.formInput}
                          value={newTierName}
                          onChangeText={setNewTierName}
                          placeholder="e.g., Premium Supporter"
                          placeholderTextColor={colors.text.tertiary}
                        />
                      </LinearGradient>

                      {/* Price Input */}
                      <LinearGradient
                        colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
                        style={styles.formInputContainer}
                      >
                        <Text style={styles.formInputLabel}>{t('monetization.monthlyPrice')}</Text>
                        <View style={styles.priceInputWrapper}>
                          <Text style={styles.pricePrefix}>$</Text>
                          <TextInput
                            style={styles.formInput}
                            value={newTierPrice}
                            onChangeText={setNewTierPrice}
                            placeholder="9.99"
                            placeholderTextColor={colors.text.tertiary}
                            keyboardType="decimal-pad"
                          />
                          <Text style={styles.priceSuffix}>/month</Text>
                        </View>
                      </LinearGradient>

                      {/* Benefits Input */}
                      <LinearGradient
                        colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
                        style={styles.formInputContainer}
                      >
                        <Text style={styles.formInputLabel}>Benefits (one per line)</Text>
                        <TextInput
                          style={[styles.formInput, styles.multilineInput]}
                          value={newTierBenefits}
                          onChangeText={setNewTierBenefits}
                          placeholder="• Exclusive content&#10;• Early access&#10;• Monthly Q&A"
                          placeholderTextColor={colors.text.tertiary}
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
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                          </LinearGradient>
                        </Pressable>

                        <Pressable
                          accessibilityRole="button"
                          onPress={handleCreateTier}
                         
                          style={styles.createTierButton}
                        >
                          <LinearGradient
                            colors={[colors.emerald, colors.emeraldDark]}
                            style={styles.createTierButtonGradient}
                          >
                            <Text style={styles.createTierButtonText}>Create</Text>
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
                    style={[styles.revenueCard, { borderLeftWidth: 3, borderLeftColor: colors.gold }]}
                  >
                    <View style={styles.revenueHeader}>
                      <LinearGradient
                        colors={['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.1)']}
                        style={styles.revenueIconBg}
                      >
                        <Icon name="bar-chart-2" size="sm" color={colors.gold} />
                      </LinearGradient>
                      <Text style={styles.revenueTitle}>Monthly Revenue</Text>
                    </View>

                    <Text style={styles.revenueAmount}>
                      ${monthlyRevenue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/month
                    </Text>

                    <View style={styles.revenueStats}>
                      <Text style={styles.revenueStat}>{totalMembers} active members</Text>
                      <Text style={styles.revenuePayout}>Payout: 15th of each month</Text>
                    </View>
                  </LinearGradient>
                </Animated.View>

                {/* Bottom spacing */}
                <View style={{ height: spacing.xxl }} />
              </>
            }
          />
        )}
      </SafeAreaView>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
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
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  infoIconBg: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
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
    borderColor: 'rgba(255,255,255,0.06)',
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
    marginRight: spacing.md,
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
    backgroundColor: colors.text.primary,
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
    borderColor: 'rgba(255,255,255,0.06)',
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
    borderColor: 'rgba(255,255,255,0.06)',
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
    borderColor: 'rgba(255,255,255,0.06)',
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
    marginRight: spacing.xs,
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
    marginLeft: spacing.xs,
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
    borderColor: 'rgba(255,255,255,0.06)',
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
    marginRight: spacing.md,
  },
  revenueTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  revenueAmount: {
    fontFamily: fonts.heading,
    fontSize: 32,
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
