import { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Share,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { Icon, type IconName } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, radius, fontSize, fonts, fontSizeExt } from '@/theme';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { rtlFlexRow } from '@/utils/rtl';
import { islamicApi } from '@/services/islamicApi';

// Dimensions.get('window') width removed — was unused dead code

// Fallback metal prices used when backend is unreachable (approx. market values)
const FALLBACK_GOLD_PRICE_PER_GRAM = 92;
const FALLBACK_SILVER_PRICE_PER_GRAM = 1.05;
const ZAKAT_RATE = 0.025;

// Standard Islamic thresholds (grams)
const NISAB_GOLD_GRAMS = 87.48;
const NISAB_SILVER_GRAMS = 612.36;

type Step = 1 | 2 | 3;

interface AssetInput {
  cash: string;
  gold: string;
  investments: string;
  inventory: string;
  property: string;
}

interface DeductionInput {
  debts: string;
  expenses: string;
}

function StepIndicator({ currentStep }: { currentStep: Step }) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { t } = useTranslation();
  const steps = [
    { num: 1, label: t('screens.zakatCalculator.stepAssets') },
    { num: 2, label: t('screens.zakatCalculator.stepDeductions') },
    { num: 3, label: t('screens.zakatCalculator.stepResult') },
  ];

  return (
    <View style={styles.stepIndicator}>
      {steps.map((step, index) => (
        <View key={step.num} style={styles.stepItem}>
          <LinearGradient
            colors={
              currentStep >= step.num
                ? [colors.emerald, colors.emeraldLight]
                : ['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']
            }
            style={[
              styles.stepDot,
              currentStep === step.num && styles.stepDotActive,
            ]}
          >
            <Text
              style={[
                styles.stepNumber,
                currentStep >= step.num && styles.stepNumberActive,
              ]}
            >
              {step.num}
            </Text>
          </LinearGradient>
          <Text
            style={[
              styles.stepLabel,
              currentStep >= step.num && styles.stepLabelActive,
            ]}
          >
            {step.label}
          </Text>
          {index < steps.length - 1 && <View style={styles.stepConnector} />}
        </View>
      ))}
    </View>
  );
}

function InputCard({
  icon,
  label,
  value,
  onChangeText,
  placeholder,
  prefix = '$',
  suffix,
  delay = 0,
}: {
  icon: IconName;
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  delay?: number;
}) {
  const tc = useThemeColors();
  const { isRTL: inputIsRTL } = useTranslation();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const [isFocused, setIsFocused] = useState(false);

  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(400)}>
      <LinearGradient
        colors={colors.gradient.cardDark}
        style={[
          styles.inputCard,
          isFocused && styles.inputCardFocused,
        ]}
      >
        <View style={[styles.inputRow, { flexDirection: rtlFlexRow(inputIsRTL) }]}>
          <LinearGradient
            colors={['rgba(10,123,79,0.15)', 'rgba(10,123,79,0.05)']}
            style={styles.inputIconBg}
          >
            <Icon name={icon} size="sm" color={colors.emerald} />
          </LinearGradient>
          <View style={styles.inputContent}>
            <Text style={styles.inputLabel}>{label}</Text>
            <View style={styles.inputWrapper}>
              {prefix && <Text style={styles.inputPrefix}>{prefix}</Text>}
              <TextInput
                style={styles.textInput}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder || '0'}
                placeholderTextColor={tc.text.tertiary}
                keyboardType="decimal-pad"
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
              />
              {suffix && <Text style={styles.inputSuffix}>{suffix}</Text>}
            </View>
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

export default function ZakatCalculatorScreen() {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const router = useRouter();
  const { t, isRTL } = useTranslation();
  const haptic = useContextualHaptic();
  const isShareRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [currentStep, setCurrentStep] = useState<Step>(1);

  const [assets, setAssets] = useState<AssetInput>({
    cash: '',
    gold: '',
    investments: '',
    inventory: '',
    property: '',
  });

  const [deductions, setDeductions] = useState<DeductionInput>({
    debts: '',
    expenses: '',
  });

  // Fetch live metal prices from backend (which uses GOLD_PRICE_PER_GRAM / SILVER_PRICE_PER_GRAM env vars)
  // We call the backend zakat endpoint with minimal values just to get the current prices
  const { data: priceData, isLoading: pricesLoading, refetch: refetchPrices } = useQuery({
    queryKey: ['zakat-metal-prices'],
    queryFn: () => islamicApi.calculateZakat({ cash: 0, gold: 0, silver: 0, investments: 0, debts: 0 }),
    staleTime: 1000 * 60 * 60, // 1 hour — metal prices don't change that fast
    retry: 2,
  });

  const usingFallbackPrices = !priceData;
  const goldPricePerGram = priceData?.goldPricePerGram ?? FALLBACK_GOLD_PRICE_PER_GRAM;
  const silverPricePerGram = priceData?.silverPricePerGram ?? FALLBACK_SILVER_PRICE_PER_GRAM;
  const nisabGold = NISAB_GOLD_GRAMS * goldPricePerGram;
  const nisabSilver = NISAB_SILVER_GRAMS * silverPricePerGram;
  const nisabThreshold = Math.min(nisabGold, nisabSilver);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Only refresh metal prices — do NOT destroy user input
    await refetchPrices();
    setRefreshing(false);
  }, [refetchPrices]);

  const safeParseFloat = (val: string): number => {
    const parsed = parseFloat(val || '0');
    return isNaN(parsed) ? 0 : parsed;
  };

  const totalAssets = useMemo(() => {
    return (
      safeParseFloat(assets.cash) +
      safeParseFloat(assets.gold) +
      safeParseFloat(assets.investments) +
      safeParseFloat(assets.inventory) +
      safeParseFloat(assets.property)
    );
  }, [assets]);

  const totalDeductions = useMemo(() => {
    return (
      safeParseFloat(deductions.debts) +
      safeParseFloat(deductions.expenses)
    );
  }, [deductions]);

  const netWealth = totalAssets - totalDeductions;
  const isAboveNisab = netWealth >= nisabThreshold;
  const zakatDue = isAboveNisab ? netWealth * ZAKAT_RATE : 0;

  const updateAsset = useCallback((key: keyof AssetInput, value: string) => {
    setAssets(prev => ({ ...prev, [key]: value }));
  }, []);

  const updateDeduction = useCallback((key: keyof DeductionInput, value: string) => {
    setDeductions(prev => ({ ...prev, [key]: value }));
  }, []);

  const goNext = useCallback(() => {
    haptic.navigate();
    setCurrentStep(prev => (prev < 3 ? ((prev + 1) as Step) : prev));
  }, [haptic]);

  const goBack = useCallback(() => {
    haptic.navigate();
    setCurrentStep(prev => (prev > 1 ? ((prev - 1) as Step) : prev));
  }, [haptic]);

  const reset = useCallback(() => {
    haptic.delete();
    Alert.alert(
      t('screens.zakatCalculator.recalculate'),
      t('screens.zakatCalculator.resetConfirm', 'This will clear all entered data. Continue?'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('screens.zakatCalculator.recalculate'),
          style: 'destructive',
          onPress: () => {
            setCurrentStep(1);
            setAssets({ cash: '', gold: '', investments: '', inventory: '', property: '' });
            setDeductions({ debts: '', expenses: '' });
          },
        },
      ],
    );
  }, [haptic, t]);

  const handleShare = useCallback(async () => {
    if (isShareRef.current) return;
    isShareRef.current = true;
    haptic.send();
    try {
      await Share.share({
        message: t('screens.zakatCalculator.shareMessage', {
          netWealth: formatCurrency(netWealth),
          zakatDue: formatCurrency(zakatDue),
        }),
      });
    } catch {
      // User cancelled share
    } finally {
      isShareRef.current = false;
    }
  }, [haptic, netWealth, zakatDue, t]);

  const formatCurrency = (value: number) => {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={styles.container}>
        <GlassHeader
          title={t('screens.zakatCalculator.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            refreshControl={<BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Info Banner */}
            <Animated.View entering={FadeInUp.duration(400)}>
              <LinearGradient
                colors={['rgba(10,123,79,0.15)', 'rgba(28,35,51,0.2)']}
                style={[styles.infoBanner, { flexDirection: rtlFlexRow(isRTL) }]}
              >
                <LinearGradient
                  colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                  style={styles.infoIconBg}
                >
                  <Icon name="calculator" size="sm" color={colors.emerald} />
                </LinearGradient>
                <Text style={styles.infoText}>
                  {t('screens.zakatCalculator.infoBannerText')}
                </Text>
              </LinearGradient>
            </Animated.View>

            {/* Step Indicator */}
            <StepIndicator currentStep={currentStep} />

            {/* Step 1: Assets */}
            {currentStep === 1 && (
              <Animated.View entering={FadeInUp.delay(100).duration(400)}>
                <Text style={styles.stepTitle}>{t('screens.zakatCalculator.enterYourAssets')}</Text>

                <InputCard
                  icon="circle"
                  label={t('screens.zakatCalculator.cashAndBank')}
                  value={assets.cash}
                  onChangeText={(v) => updateAsset('cash', v)}
                  delay={100}
                />
                <InputCard
                  icon="layers"
                  label={t('screens.zakatCalculator.goldAndSilver')}
                  value={assets.gold}
                  onChangeText={(v) => updateAsset('gold', v)}
                  delay={150}
                />
                <InputCard
                  icon="bar-chart-2"
                  label={t('screens.zakatCalculator.investmentsAndStocks')}
                  value={assets.investments}
                  onChangeText={(v) => updateAsset('investments', v)}
                  delay={200}
                />
                <InputCard
                  icon="briefcase"
                  label={t('screens.zakatCalculator.businessInventory')}
                  value={assets.inventory}
                  onChangeText={(v) => updateAsset('inventory', v)}
                  delay={250}
                />
                <InputCard
                  icon="home"
                  label={t('screens.zakatCalculator.propertyForRentSale')}
                  value={assets.property}
                  onChangeText={(v) => updateAsset('property', v)}
                  delay={300}
                />

                {/* Total Preview */}
                <Animated.View entering={FadeInUp.delay(350).duration(400)}>
                  <LinearGradient
                    colors={['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.1)']}
                    style={styles.previewCard}
                  >
                    <Text style={styles.previewLabel}>{t('screens.zakatCalculator.totalAssets')}</Text>
                    <Text style={styles.previewValue}>{formatCurrency(totalAssets)}</Text>
                  </LinearGradient>
                </Animated.View>

                {/* Next Button */}
                <Animated.View entering={FadeInUp.delay(400).duration(400)}>
                  <Pressable
                    accessibilityLabel={t('accessibility.seeMore')}
                    accessibilityRole="button"
                    onPress={goNext}
                    disabled={totalAssets === 0}
                    style={({ pressed }) => [{ opacity: totalAssets === 0 ? 0.5 : pressed ? 0.8 : 1 }]}
                  >
                    <LinearGradient
                      colors={[colors.emerald, colors.emeraldDark]}
                      style={styles.nextButton}
                    >
                      <Text style={styles.nextButtonText}>{t('screens.zakatCalculator.nextDeductions')}</Text>
                      <Icon name="chevron-right" size="sm" color={tc.text.primary} />
                    </LinearGradient>
                  </Pressable>
                </Animated.View>
              </Animated.View>
            )}

            {/* Step 2: Deductions */}
            {currentStep === 2 && (
              <Animated.View entering={FadeInUp.delay(100).duration(400)}>
                <Text style={styles.stepTitle}>{t('screens.zakatCalculator.enterDeductions')}</Text>

                <InputCard
                  icon="credit-card"
                  label={t('screens.zakatCalculator.outstandingDebts')}
                  value={deductions.debts}
                  onChangeText={(v) => updateDeduction('debts', v)}
                  delay={100}
                />
                <InputCard
                  icon="clock"
                  label={t('screens.zakatCalculator.immediateExpenses')}
                  value={deductions.expenses}
                  onChangeText={(v) => updateDeduction('expenses', v)}
                  delay={150}
                />

                {/* Net Wealth Preview */}
                <Animated.View entering={FadeInUp.delay(200).duration(400)}>
                  <LinearGradient
                    colors={['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.1)']}
                    style={styles.previewCard}
                  >
                    <View style={styles.previewRow}>
                      <Text style={styles.previewLabel}>{t('screens.zakatCalculator.totalAssets')}</Text>
                      <Text style={styles.previewValueSmall}>{formatCurrency(totalAssets)}</Text>
                    </View>
                    <View style={styles.previewRow}>
                      <Text style={styles.previewLabel}>{t('screens.zakatCalculator.totalDeductions')}</Text>
                      <Text style={[styles.previewValueSmall, styles.negativeValue]}>
                        -{formatCurrency(totalDeductions)}
                      </Text>
                    </View>
                    <View style={styles.previewDivider} />
                    <View style={styles.previewRow}>
                      <Text style={[styles.previewLabel, styles.boldLabel]}>{t('screens.zakatCalculator.netZakatableWealth')}</Text>
                      <Text style={[styles.previewValue, styles.emeraldValue]}>
                        {formatCurrency(netWealth)}
                      </Text>
                    </View>
                  </LinearGradient>
                </Animated.View>

                {/* Buttons */}
                <View style={[styles.buttonRow, { flexDirection: rtlFlexRow(isRTL) }]}>
                  <Pressable accessibilityRole="button" onPress={goBack} style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.8 }]}>
                    <LinearGradient
                      colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
                      style={styles.backButtonGradient}
                    >
                      <Icon name="chevron-left" size="sm" color={tc.text.secondary} />
                      <Text style={styles.backButtonText}>{t('common.back')}</Text>
                    </LinearGradient>
                  </Pressable>

                  <Pressable accessibilityRole="button" onPress={goNext} style={({ pressed }) => [styles.calculateButton, pressed && { opacity: 0.8 }]}>
                    <LinearGradient
                      colors={[colors.emerald, colors.emeraldDark]}
                      style={styles.calculateButtonGradient}
                    >
                      <Text style={styles.calculateButtonText}>{t('screens.zakatCalculator.calculateZakat')}</Text>
                      <Icon name="check-circle" size="sm" color={tc.text.primary} />
                    </LinearGradient>
                  </Pressable>
                </View>
              </Animated.View>
            )}

            {/* Step 3: Result */}
            {currentStep === 3 && (
              <Animated.View entering={FadeInUp.delay(100).duration(400)}>
                <Text style={styles.stepTitle}>{t('screens.zakatCalculator.yourZakatCalculation')}</Text>

                {/* Result Card */}
                <LinearGradient
                  colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
                  style={[styles.resultCard, { borderStartWidth: 3, borderStartColor: colors.gold }]}
                >
                  {/* Calculation Summary */}
                  <View style={styles.calculationRow}>
                    <Text style={styles.calculationLabel}>{t('screens.zakatCalculator.totalAssets')}</Text>
                    <Text style={styles.calculationValue}>{formatCurrency(totalAssets)}</Text>
                  </View>
                  <View style={styles.calculationRow}>
                    <Text style={styles.calculationLabel}>{t('screens.zakatCalculator.totalDeductions')}</Text>
                    <Text style={styles.calculationValue}>{formatCurrency(totalDeductions)}</Text>
                  </View>
                  <View style={styles.calculationDivider} />
                  <View style={styles.calculationRow}>
                    <Text style={[styles.calculationLabel, styles.boldLabel]}>{t('screens.zakatCalculator.netWealth')}</Text>
                    <Text style={[styles.calculationValue, styles.boldValue]}>{formatCurrency(netWealth)}</Text>
                  </View>

                  {/* Nisab Display */}
                  <View style={styles.nisabContainer}>
                    <View style={styles.nisabHeaderRow}>
                      <Text style={styles.nisabTitle}>{t('screens.zakatCalculator.currentNisabThreshold')}</Text>
                      {pricesLoading && <ActivityIndicator size="small" color={colors.emerald} />}
                      {usingFallbackPrices && !pricesLoading && (
                        <Text style={{ color: colors.gold, fontSize: fontSize.xs, fontFamily: fonts.body }}>
                          {t('screens.zakatCalculator.estimatedPrices', 'Estimated prices')}
                        </Text>
                      )}
                    </View>
                    <View style={styles.nisabRow}>
                      <Text style={styles.nisabLabel}>{t('screens.zakatCalculator.goldNisab')}</Text>
                      <Text style={styles.nisabValue}>{formatCurrency(nisabGold)}</Text>
                    </View>
                    <View style={styles.nisabRow}>
                      <Text style={styles.nisabLabel}>{t('screens.zakatCalculator.silverNisab')}</Text>
                      <Text style={styles.nisabValue}>{formatCurrency(nisabSilver)}</Text>
                    </View>
                    {priceData && (
                      <View style={styles.nisabRow}>
                        <Text style={styles.nisabLabel}>{t('screens.zakatCalculator.goldPricePerGram') || `Gold/g`}</Text>
                        <Text style={styles.nisabValue}>{formatCurrency(goldPricePerGram)}</Text>
                      </View>
                    )}
                  </View>

                  {/* Final Result */}
                  {isAboveNisab ? (
                    <View style={styles.zakatDueContainer}>
                      <Text style={styles.zakatDueLabel}>{t('screens.zakatCalculator.zakatDue')}</Text>
                      <Text style={styles.zakatDueValue}>{formatCurrency(zakatDue)}</Text>
                    </View>
                  ) : (
                    <View style={styles.belowNisabContainer}>
                      <Icon name="check-circle" size="md" color={colors.gold} />
                      <Text style={styles.belowNisabText}>
                        {t('screens.zakatCalculator.belowNisabMessage')}
                      </Text>
                    </View>
                  )}
                </LinearGradient>

                {/* Educational Note */}
                <Animated.View entering={FadeInUp.delay(200).duration(400)}>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.1)', 'rgba(28,35,51,0.1)']}
                    style={styles.educationCard}
                  >
                    <Icon name="book-open" size="sm" color={colors.emerald} />
                    <Text style={styles.educationText}>
                      {t('screens.zakatCalculator.educationNote')}
                    </Text>
                  </LinearGradient>
                </Animated.View>

                {/* Action Buttons */}
                <View style={[styles.buttonRow, { flexDirection: rtlFlexRow(isRTL) }]}>
                  <Pressable accessibilityRole="button" onPress={reset} style={({ pressed }) => [styles.actionButtonHalf, pressed && { opacity: 0.8 }]}>
                    <LinearGradient
                      colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
                      style={styles.actionButtonHalfGradient}
                    >
                      <Icon name="repeat" size="sm" color={tc.text.secondary} />
                      <Text style={styles.actionButtonHalfText}>{t('screens.zakatCalculator.recalculate')}</Text>
                    </LinearGradient>
                  </Pressable>

                  <Pressable accessibilityRole="button" onPress={handleShare} style={({ pressed }) => [styles.actionButtonHalf, pressed && { opacity: 0.8 }]}>
                    <LinearGradient
                      colors={[colors.emerald, colors.emeraldDark]}
                      style={styles.actionButtonHalfGradient}
                    >
                      <Icon name="share" size="sm" color={tc.text.primary} />
                      <Text style={styles.shareButtonText}>{t('common.share')}</Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              </Animated.View>
            )}

            {/* Bottom spacing */}
            <View style={{ height: spacing.xxl }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
  
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
    paddingTop: 96,
  },
  infoBanner: {
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  infoIconBg: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: spacing.md,
  },
  infoText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: tc.text.secondary,
    flex: 1,
    lineHeight: 20,
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  stepItem: {
    alignItems: 'center',
    flex: 1,
    position: 'relative',
  },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  stepDotActive: {
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  stepNumber: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: tc.text.tertiary,
  },
  stepNumberActive: {
    color: tc.text.primary,
  },
  stepLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: tc.text.tertiary,
  },
  stepLabelActive: {
    color: colors.emerald,
  },
  stepConnector: {
    position: 'absolute',
    top: 16,
    end: -50,
    width: 100,
    height: 2,
    backgroundColor: tc.surface,
  },
  stepTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: tc.text.primary,
    marginBottom: spacing.md,
  },
  inputCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  inputCardFocused: {
    borderColor: colors.active.emerald50,
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  inputRow: {
    alignItems: 'center',
  },
  inputIconBg: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: spacing.md,
  },
  inputContent: {
    flex: 1,
  },
  inputLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: tc.text.secondary,
    marginBottom: spacing.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputPrefix: {
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    color: tc.text.tertiary,
    marginEnd: spacing.xs,
  },
  inputSuffix: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: tc.text.tertiary,
    marginStart: spacing.xs,
  },
  textInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    color: tc.text.primary,
    padding: 0,
  },
  previewCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  previewDivider: {
    height: 1,
    backgroundColor: tc.border,
    marginVertical: spacing.sm,
  },
  previewLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: tc.text.secondary,
  },
  boldLabel: {
    fontFamily: fonts.bodySemiBold,
    color: tc.text.primary,
  },
  previewValue: {
    fontFamily: fonts.heading,
    fontSize: fontSize.lg,
    color: tc.text.primary,
  },
  previewValueSmall: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: tc.text.primary,
  },
  negativeValue: {
    color: colors.error,
  },
  emeraldValue: {
    color: colors.emerald,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  nextButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: tc.text.primary,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  backButton: {
    flex: 0.3,
  },
  backButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  backButtonText: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: tc.text.secondary,
  },
  calculateButton: {
    flex: 0.7,
  },
  calculateButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  calculateButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: tc.text.primary,
  },
  resultCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  calculationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  calculationLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: tc.text.secondary,
  },
  calculationValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: tc.text.primary,
  },
  calculationDivider: {
    height: 1,
    backgroundColor: tc.border,
    marginVertical: spacing.md,
  },
  boldValue: {
    fontFamily: fonts.heading,
    fontSize: fontSize.md,
  },
  nisabContainer: {
    backgroundColor: 'rgba(45,53,72,0.4)',
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  nisabHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  nisabTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: tc.text.primary,
  },
  nisabRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  nisabLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: tc.text.secondary,
  },
  nisabValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: tc.text.tertiary,
  },
  zakatDueContainer: {
    backgroundColor: colors.active.emerald15,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  zakatDueLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: tc.text.secondary,
    marginBottom: spacing.xs,
  },
  zakatDueValue: {
    fontFamily: fonts.heading,
    fontSize: fontSizeExt.display,
    color: colors.emerald,
  },
  belowNisabContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.active.gold10,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  belowNisabText: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: tc.text.secondary,
    flex: 1,
    lineHeight: 22,
  },
  educationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  educationText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: tc.text.secondary,
    flex: 1,
    lineHeight: 20,
  },
  actionButtonHalf: {
    flex: 1,
  },
  actionButtonHalfGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  actionButtonHalfText: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: tc.text.secondary,
  },
  shareButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: tc.text.primary,
  },
});
