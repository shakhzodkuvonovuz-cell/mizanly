import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, radius, fontSize } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { islamicApi } from '@/services/islamicApi';
import type { CharityCampaign, CharityDonation } from '@/types/islamic';

const PRESET_AMOUNTS = [500, 1000, 2500, 5000]; // in cents
const CURRENCIES = ['usd', 'gbp', 'eur'] as const;

type Currency = typeof CURRENCIES[number];

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  usd: '$',
  gbp: '\u00A3',
  eur: '\u20AC',
};

function formatAmount(cents: number, currency: Currency): string {
  const symbol = CURRENCY_SYMBOLS[currency];
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

function DonateScreenContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ campaignId?: string }>();
  const queryClient = useQueryClient();

  const [selectedAmount, setSelectedAmount] = useState<number | null>(1000);
  const [customAmount, setCustomAmount] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [currency, setCurrency] = useState<Currency>('usd');
  const [showSuccess, setShowSuccess] = useState(false);

  const campaignQuery = useQuery({
    queryKey: ['charity-campaign', params.campaignId],
    queryFn: () => islamicApi.getCampaign(params.campaignId!),
    enabled: !!params.campaignId,
  });

  const donationsQuery = useQuery({
    queryKey: ['my-donations'],
    queryFn: () => islamicApi.getMyDonations(),
  });

  const donateMutation = useMutation({
    mutationFn: islamicApi.donate,
    onSuccess: () => {
      setShowSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['my-donations'] });
      if (params.campaignId) {
        queryClient.invalidateQueries({ queryKey: ['charity-campaign', params.campaignId] });
      }
    },
  });

  const handleRefresh = useCallback(() => {
    donationsQuery.refetch();
  }, [donationsQuery]);

  const getAmount = (): number => {
    if (isCustom) {
      const parsed = parseFloat(customAmount);
      if (isNaN(parsed) || parsed < 1) return 0;
      return Math.round(parsed * 100);
    }
    return selectedAmount || 0;
  };

  const handleDonate = () => {
    const amount = getAmount();
    if (amount < 100) return;
    donateMutation.mutate({
      campaignId: params.campaignId,
      amount,
      currency,
    });
  };

  const handlePresetPress = (amount: number) => {
    setIsCustom(false);
    setSelectedAmount(amount);
    setCustomAmount('');
  };

  const handleCustomFocus = () => {
    setIsCustom(true);
    setSelectedAmount(null);
  };

  const campaign = campaignQuery.data as CharityCampaign | undefined;

  if (showSuccess) {
    return (
      <View style={styles.container}>
        <GlassHeader title={t('charity.title')} showBack />
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Icon name="check-circle" size="xl" color={colors.emerald} />
          </View>
          <Text style={styles.successTitle}>{t('charity.success')}</Text>
          <Text style={styles.successMessage}>{t('charity.successMessage')}</Text>
          <View style={styles.successAction}>
            <GradientButton
              label={t('common.done')}
              onPress={() => router.back()}
              fullWidth
            />
          </View>
        </View>
      </View>
    );
  }

  const renderDonationItem = ({ item }: { item: CharityDonation }) => (
    <View style={styles.donationItem}>
      <View style={styles.donationLeft}>
        <Icon name="heart" size="sm" color={colors.emerald} />
        <View style={styles.donationInfo}>
          <Text style={styles.donationAmount}>
            {formatAmount(item.amount, item.currency as Currency)}
          </Text>
          <Text style={styles.donationDate}>
            {new Date(item.createdAt).toLocaleDateString()}
          </Text>
        </View>
      </View>
      <Text style={styles.donationStatus}>{item.status}</Text>
    </View>
  );

  const donations = (donationsQuery.data as { data: CharityDonation[] } | undefined)?.data || [];

  const ListHeader = () => (
    <View>
      {/* Campaign card */}
      {params.campaignId && (
        <View style={styles.campaignCard}>
          {campaignQuery.isLoading ? (
            <Skeleton.Rect width="100%" height={80} borderRadius={radius.md} />
          ) : campaign ? (
            <>
              <Text style={styles.campaignTitle}>{campaign.title}</Text>
              {campaign.description && (
                <Text style={styles.campaignDescription}>{campaign.description}</Text>
              )}
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${Math.min((campaign.raisedAmount / campaign.goalAmount) * 100, 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.campaignRaised}>
                {t('charity.raised', {
                  amount: formatAmount(campaign.raisedAmount, currency),
                  goal: formatAmount(campaign.goalAmount, currency),
                })}
              </Text>
            </>
          ) : null}
        </View>
      )}

      {/* Amount picker */}
      <Text style={styles.sectionLabel}>{t('charity.amount')}</Text>
      <View style={styles.amountGrid}>
        {PRESET_AMOUNTS.map((amt) => (
          <Pressable
            accessibilityRole="button"
            key={amt}
            style={[
              styles.amountChip,
              !isCustom && selectedAmount === amt && styles.amountChipActive,
            ]}
            onPress={() => handlePresetPress(amt)}
           
          >
            <Text
              style={[
                styles.amountChipText,
                !isCustom && selectedAmount === amt && styles.amountChipTextActive,
              ]}
            >
              {formatAmount(amt, currency)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Custom amount */}
      <View style={[styles.customInputRow, isCustom && styles.customInputRowActive]}>
        <Text style={styles.currencySymbol}>{CURRENCY_SYMBOLS[currency]}</Text>
        <TextInput
          style={styles.customInput}
          placeholder={t('charity.custom')}
          placeholderTextColor={colors.text.tertiary}
          keyboardType="decimal-pad"
          value={customAmount}
          onChangeText={setCustomAmount}
          onFocus={handleCustomFocus}
        />
      </View>

      {/* Currency selector */}
      <View style={styles.currencyRow}>
        {CURRENCIES.map((cur) => (
          <Pressable
            accessibilityRole="button"
            key={cur}
            style={[styles.currencyPill, currency === cur && styles.currencyPillActive]}
            onPress={() => setCurrency(cur)}
           
          >
            <Text style={[styles.currencyText, currency === cur && styles.currencyTextActive]}>
              {cur.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Donate button */}
      <View style={styles.donateButtonRow}>
        <GradientButton
          label={t('charity.donate')}
          onPress={handleDonate}
          loading={donateMutation.isPending}
          disabled={getAmount() < 100}
          fullWidth
        />
      </View>

      {/* My Donations header */}
      <Text style={styles.sectionLabel}>{t('charity.myDonations')}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <GlassHeader title={t('charity.title')} showBack />
      {donationsQuery.isLoading && donations.length === 0 ? (
        <View style={styles.skeletonContainer}>
          <Skeleton.Rect width="100%" height={48} borderRadius={radius.md} />
          <Skeleton.Rect width="100%" height={48} borderRadius={radius.md} />
          <Skeleton.Rect width="100%" height={48} borderRadius={radius.md} />
        </View>
      ) : (
        <FlatList
          data={donations}
          keyExtractor={(item) => item.id}
          renderItem={renderDonationItem}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            <EmptyState
              icon="heart"
              title={t('charity.noDonations')}
            />
          }
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={donationsQuery.isFetching && !donationsQuery.isLoading}
              onRefresh={handleRefresh}
              tintColor={colors.emerald}
            />
          }
        />
      )}
    </View>
  );
}

export default function DonateScreen() {
  return (
    <ScreenErrorBoundary>
      <DonateScreenContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  listContent: {
    padding: spacing.base,
    paddingBottom: spacing['2xl'],
  },
  skeletonContainer: {
    padding: spacing.base,
    gap: spacing.md,
  },
  sectionLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  // Campaign card
  campaignCard: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  campaignTitle: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  campaignDescription: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.full,
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.emerald,
    borderRadius: radius.full,
  },
  campaignRaised: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  // Amount grid
  amountGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  amountChip: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  amountChipActive: {
    borderColor: colors.emerald,
    backgroundColor: colors.active.emerald10,
  },
  amountChipText: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  amountChipTextActive: {
    color: colors.emerald,
  },
  // Custom input
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  customInputRowActive: {
    borderColor: colors.emerald,
  },
  currencySymbol: {
    color: colors.text.secondary,
    fontSize: fontSize.md,
    fontWeight: '600',
    marginRight: spacing.xs,
  },
  customInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.base,
    paddingVertical: spacing.md,
  },
  // Currency selector
  currencyRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  currencyPill: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.dark.bgCard,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  currencyPillActive: {
    borderColor: colors.emerald,
    backgroundColor: colors.active.emerald10,
  },
  currencyText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  currencyTextActive: {
    color: colors.emerald,
  },
  // Donate button
  donateButtonRow: {
    marginTop: spacing.lg,
  },
  // Donations list
  donationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  donationLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  donationInfo: {
    gap: 2,
  },
  donationAmount: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  donationDate: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
  },
  donationStatus: {
    color: colors.emerald,
    fontSize: fontSize.xs,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  // Success state
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing['2xl'],
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    backgroundColor: colors.active.emerald10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  successTitle: {
    color: colors.emerald,
    fontSize: fontSize.xl,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  successMessage: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
    textAlign: 'center',
  },
  successAction: {
    width: '100%',
    marginTop: spacing['2xl'],
  },
});
