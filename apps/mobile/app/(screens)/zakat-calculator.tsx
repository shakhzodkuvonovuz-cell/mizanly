import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, type IconName } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { useHaptic } from '@/hooks/useHaptic';

const { width } = Dimensions.get('window');

const NISAB_GOLD = 5800;
const NISAB_SILVER = 490;
const ZAKAT_RATE = 0.025;

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
  const steps = [
    { num: 1, label: 'Assets' },
    { num: 2, label: 'Deductions' },
    { num: 3, label: 'Result' },
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
  const [isFocused, setIsFocused] = useState(false);

  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(400)}>
      <LinearGradient
        colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
        style={[
          styles.inputCard,
          isFocused && styles.inputCardFocused,
        ]}
      >
        <View style={styles.inputRow}>
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
                placeholderTextColor={colors.text.tertiary}
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
  const router = useRouter();
  const haptic = useHaptic();
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

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const totalAssets = useMemo(() => {
    return (
      parseFloat(assets.cash || '0') +
      parseFloat(assets.gold || '0') +
      parseFloat(assets.investments || '0') +
      parseFloat(assets.inventory || '0') +
      parseFloat(assets.property || '0')
    );
  }, [assets]);

  const totalDeductions = useMemo(() => {
    return (
      parseFloat(deductions.debts || '0') +
      parseFloat(deductions.expenses || '0')
    );
  }, [deductions]);

  const netWealth = totalAssets - totalDeductions;
  const isAboveNisab = netWealth >= NISAB_SILVER;
  const zakatDue = isAboveNisab ? netWealth * ZAKAT_RATE : 0;

  const updateAsset = useCallback((key: keyof AssetInput, value: string) => {
    setAssets(prev => ({ ...prev, [key]: value }));
  }, []);

  const updateDeduction = useCallback((key: keyof DeductionInput, value: string) => {
    setDeductions(prev => ({ ...prev, [key]: value }));
  }, []);

  const goNext = useCallback(() => {
    haptic.light();
    setCurrentStep(prev => (prev < 3 ? ((prev + 1) as Step) : prev));
  }, [haptic]);

  const goBack = useCallback(() => {
    haptic.light();
    setCurrentStep(prev => (prev > 1 ? ((prev - 1) as Step) : prev));
  }, [haptic]);

  const reset = useCallback(() => {
    haptic.medium();
    setCurrentStep(1);
    setAssets({ cash: '', gold: '', investments: '', inventory: '', property: '' });
    setDeductions({ debts: '', expenses: '' });
  }, [haptic]);

  const formatCurrency = (value: number) => {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <GlassHeader
        title="Zakat Calculator"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          refreshControl={<RefreshControl tintColor={colors.emerald} refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Info Banner */}
          <Animated.View entering={FadeInUp.duration(400)}>
            <LinearGradient
              colors={['rgba(10,123,79,0.15)', 'rgba(28,35,51,0.2)']}
              style={styles.infoBanner}
            >
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                style={styles.infoIconBg}
              >
                <Icon name="calculator" size="sm" color={colors.emerald} />
              </LinearGradient>
              <Text style={styles.infoText}>
                Calculate your annual Zakat obligation (2.5% of eligible wealth above Nisab)
              </Text>
            </LinearGradient>
          </Animated.View>

          {/* Step Indicator */}
          <StepIndicator currentStep={currentStep} />

          {/* Step 1: Assets */}
          {currentStep === 1 && (
            <Animated.View entering={FadeInUp.delay(100).duration(400)}>
              <Text style={styles.stepTitle}>Enter your assets</Text>

              <InputCard
                icon="circle"
                label="Cash & Bank Balances"
                value={assets.cash}
                onChangeText={(v) => updateAsset('cash', v)}
                delay={100}
              />
              <InputCard
                icon="layers"
                label="Gold & Silver Value"
                value={assets.gold}
                onChangeText={(v) => updateAsset('gold', v)}
                delay={150}
              />
              <InputCard
                icon="bar-chart-2"
                label="Investments & Stocks"
                value={assets.investments}
                onChangeText={(v) => updateAsset('investments', v)}
                delay={200}
              />
              <InputCard
                icon="briefcase"
                label="Business Inventory"
                value={assets.inventory}
                onChangeText={(v) => updateAsset('inventory', v)}
                delay={250}
              />
              <InputCard
                icon="home"
                label="Property for Rent/Sale"
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
                  <Text style={styles.previewLabel}>Total Assets</Text>
                  <Text style={styles.previewValue}>{formatCurrency(totalAssets)}</Text>
                </LinearGradient>
              </Animated.View>

              {/* Next Button */}
              <Animated.View entering={FadeInUp.delay(400).duration(400)}>
                <TouchableOpacity onPress={goNext} activeOpacity={0.8}>
                  <LinearGradient
                    colors={[colors.emerald, colors.emeraldDark]}
                    style={styles.nextButton}
                  >
                    <Text style={styles.nextButtonText}>Next: Deductions</Text>
                    <Icon name="chevron-right" size="sm" color={colors.text.primary} />
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            </Animated.View>
          )}

          {/* Step 2: Deductions */}
          {currentStep === 2 && (
            <Animated.View entering={FadeInUp.delay(100).duration(400)}>
              <Text style={styles.stepTitle}>Enter deductions</Text>

              <InputCard
                icon="credit-card"
                label="Outstanding Debts"
                value={deductions.debts}
                onChangeText={(v) => updateDeduction('debts', v)}
                delay={100}
              />
              <InputCard
                icon="clock"
                label="Immediate Expenses"
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
                    <Text style={styles.previewLabel}>Total Assets</Text>
                    <Text style={styles.previewValueSmall}>{formatCurrency(totalAssets)}</Text>
                  </View>
                  <View style={styles.previewRow}>
                    <Text style={styles.previewLabel}>Total Deductions</Text>
                    <Text style={[styles.previewValueSmall, styles.negativeValue]}>
                      -{formatCurrency(totalDeductions)}
                    </Text>
                  </View>
                  <View style={styles.previewDivider} />
                  <View style={styles.previewRow}>
                    <Text style={[styles.previewLabel, styles.boldLabel]}>Net Zakatable Wealth</Text>
                    <Text style={[styles.previewValue, styles.emeraldValue]}>
                      {formatCurrency(netWealth)}
                    </Text>
                  </View>
                </LinearGradient>
              </Animated.View>

              {/* Buttons */}
              <View style={styles.buttonRow}>
                <TouchableOpacity onPress={goBack} activeOpacity={0.8} style={styles.backButton}>
                  <LinearGradient
                    colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
                    style={styles.backButtonGradient}
                  >
                    <Icon name="chevron-left" size="sm" color={colors.text.secondary} />
                    <Text style={styles.backButtonText}>Back</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity onPress={goNext} activeOpacity={0.8} style={styles.calculateButton}>
                  <LinearGradient
                    colors={[colors.emerald, colors.emeraldDark]}
                    style={styles.calculateButtonGradient}
                  >
                    <Text style={styles.calculateButtonText}>Calculate Zakat</Text>
                    <Icon name="check-circle" size="sm" color={colors.text.primary} />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}

          {/* Step 3: Result */}
          {currentStep === 3 && (
            <Animated.View entering={FadeInUp.delay(100).duration(400)}>
              <Text style={styles.stepTitle}>Your Zakat calculation</Text>

              {/* Result Card */}
              <LinearGradient
                colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
                style={[styles.resultCard, { borderLeftWidth: 3, borderLeftColor: colors.gold }]}
              >
                {/* Calculation Summary */}
                <View style={styles.calculationRow}>
                  <Text style={styles.calculationLabel}>Total Assets</Text>
                  <Text style={styles.calculationValue}>{formatCurrency(totalAssets)}</Text>
                </View>
                <View style={styles.calculationRow}>
                  <Text style={styles.calculationLabel}>Total Deductions</Text>
                  <Text style={styles.calculationValue}>{formatCurrency(totalDeductions)}</Text>
                </View>
                <View style={styles.calculationDivider} />
                <View style={styles.calculationRow}>
                  <Text style={[styles.calculationLabel, styles.boldLabel]}>Net Wealth</Text>
                  <Text style={[styles.calculationValue, styles.boldValue]}>{formatCurrency(netWealth)}</Text>
                </View>

                {/* Nisab Display */}
                <View style={styles.nisabContainer}>
                  <Text style={styles.nisabTitle}>Current Nisab Threshold</Text>
                  <View style={styles.nisabRow}>
                    <Text style={styles.nisabLabel}>Gold Nisab:</Text>
                    <Text style={styles.nisabValue}>{formatCurrency(NISAB_GOLD)}</Text>
                  </View>
                  <View style={styles.nisabRow}>
                    <Text style={styles.nisabLabel}>Silver Nisab:</Text>
                    <Text style={styles.nisabValue}>{formatCurrency(NISAB_SILVER)}</Text>
                  </View>
                </View>

                {/* Final Result */}
                {isAboveNisab ? (
                  <View style={styles.zakatDueContainer}>
                    <Text style={styles.zakatDueLabel}>Zakat Due (2.5%)</Text>
                    <Text style={styles.zakatDueValue}>{formatCurrency(zakatDue)}</Text>
                  </View>
                ) : (
                  <View style={styles.belowNisabContainer}>
                    <Icon name="check-circle" size="md" color={colors.gold} />
                    <Text style={styles.belowNisabText}>
                      Your wealth is below the Nisab threshold. No Zakat is due.
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
                    Zakat is 2.5% of wealth held for one lunar year above the Nisab threshold
                  </Text>
                </LinearGradient>
              </Animated.View>

              {/* Action Buttons */}
              <View style={styles.buttonRow}>
                <TouchableOpacity onPress={reset} activeOpacity={0.8} style={styles.actionButtonHalf}>
                  <LinearGradient
                    colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
                    style={styles.actionButtonHalfGradient}
                  >
                    <Icon name="repeat" size="sm" color={colors.text.secondary} />
                    <Text style={styles.actionButtonHalfText}>Recalculate</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => {}} activeOpacity={0.8} style={styles.actionButtonHalf}>
                  <LinearGradient
                    colors={[colors.emerald, colors.emeraldDark]}
                    style={styles.actionButtonHalfGradient}
                  >
                    <Icon name="share" size="sm" color={colors.text.primary} />
                    <Text style={styles.shareButtonText}>Share</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}

          {/* Bottom spacing */}
          <View style={{ height: spacing.xxl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
    paddingTop: 100,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  infoIconBg: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  infoText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
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
    color: colors.text.tertiary,
  },
  stepNumberActive: {
    color: colors.text.primary,
  },
  stepLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  stepLabelActive: {
    color: colors.emerald,
  },
  stepConnector: {
    position: 'absolute',
    top: 16,
    right: -50,
    width: 100,
    height: 2,
    backgroundColor: colors.dark.surface,
  },
  stepTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  inputCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  inputCardFocused: {
    borderColor: 'rgba(10,123,79,0.5)',
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputIconBg: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  inputContent: {
    flex: 1,
  },
  inputLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputPrefix: {
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    color: colors.text.tertiary,
    marginRight: spacing.xs,
  },
  inputSuffix: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
    marginLeft: spacing.xs,
  },
  textInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    color: colors.text.primary,
    padding: 0,
  },
  previewCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
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
    backgroundColor: colors.dark.border,
    marginVertical: spacing.sm,
  },
  previewLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  boldLabel: {
    fontFamily: fonts.bodySemiBold,
    color: colors.text.primary,
  },
  previewValue: {
    fontFamily: fonts.heading,
    fontSize: fontSize.lg,
    color: colors.text.primary,
  },
  previewValueSmall: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
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
    color: colors.text.primary,
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
    color: colors.text.secondary,
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
    color: colors.text.primary,
  },
  resultCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
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
    color: colors.text.secondary,
  },
  calculationValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  calculationDivider: {
    height: 1,
    backgroundColor: colors.dark.border,
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
  nisabTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  nisabRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  nisabLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  nisabValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
  },
  zakatDueContainer: {
    backgroundColor: 'rgba(10,123,79,0.15)',
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  zakatDueLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  zakatDueValue: {
    fontFamily: fonts.heading,
    fontSize: 32,
    color: colors.emerald,
  },
  belowNisabContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(200,150,62,0.1)',
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  belowNisabText: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.secondary,
    flex: 1,
    lineHeight: 22,
  },
  educationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  educationText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
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
    color: colors.text.secondary,
  },
  shareButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
});
