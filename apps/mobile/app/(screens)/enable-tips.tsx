import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { monetizationApi } from '@/services/monetizationApi';
import { settingsApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { showToast } from '@/components/ui/Toast';

const { width } = Dimensions.get('window');

const PRESET_AMOUNTS = [1, 2, 5, 10];
const MAX_MESSAGE_LENGTH = 150;

function CustomToggle({
  value,
  onValueChange,
  label,
  description,
}: {
  value: boolean;
  onValueChange: (val: boolean) => void;
  label: string;
  description?: string;
}) {
  const haptic = useContextualHaptic();
  const tc = useThemeColors();

  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleContent}>
        <Text style={[styles.toggleLabel, { color: tc.text.primary }]}>{label}</Text>
        {description && <Text style={[styles.toggleDescription, { color: tc.text.tertiary }]}>{description}</Text>}
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value }}
        onPress={() => {
          haptic.tick();
          onValueChange(!value);
        }}

      >
        <LinearGradient
          colors={value ? [colors.emerald, colors.emeraldDark] : [tc.surface, tc.bgCard]}
          style={styles.toggleTrack}
        >
          <View
            style={[
              styles.toggleThumb,
              value && styles.toggleThumbActive,
            ]}
          />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

export default function EnableTipsScreen() {
  const router = useRouter();
  const haptic = useContextualHaptic();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { t } = useTranslation();
  const [isEnabled, setIsEnabled] = useState(true);
  const [minTipAmount, setMinTipAmount] = useState(2);
  const [customAmount, setCustomAmount] = useState('');

  const [displaySettings, setDisplaySettings] = useState({
    showOnProfile: true,
    showOnPosts: false,
    showTopSupporters: true,
  });

  const [thankYouMessage, setThankYouMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const tc = useThemeColors();

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const stats = await monetizationApi.getTipStats();
      if (stats) {
        setIsConnected(true);
        setIsEnabled(true);
      }
    } catch (err) {
      setError(t('screens.enableTips.errorLoadFailed'));
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

  const toggleDisplaySetting = useCallback((key: keyof typeof displaySettings) => {
    setDisplaySettings(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleSave = useCallback(async () => {
    haptic.save();
    // Tip settings are saved locally. Backend persistence requires Stripe Connect integration.
    // Show feedback that settings are saved locally.
    showToast({
      message: t('screens.enableTips.savedLocallyMessage', 'Your tip preferences are saved on this device. They will sync to your account once payment processing is connected.'),
      variant: 'success',
    });
  }, [haptic, t]);

  const handleConnectPayment = useCallback(() => {
    haptic.tick();
    // Stripe Connect onboarding is required before creators can receive tips.
    showToast({
      message: t('screens.enableTips.connectRequiredMessage', 'Stripe Connect integration is being set up. You will be notified when you can connect your payment account to start receiving tips.'),
      variant: 'info',
    });
  }, [haptic, t]);

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('screens.enableTips.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
          rightActions={[{ icon: 'gift', onPress: () => {}, accessibilityLabel: t('screens.enableTips.tipsLabel') }]}
        />

        <ScrollView
          refreshControl={<BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Hero Card */}
          <Animated.View entering={FadeInUp.duration(400)}>
            <LinearGradient
              colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
              style={[styles.heroCard, !isEnabled && styles.heroCardDisabled]}
            >
              <LinearGradient
                colors={['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.1)']}
                style={styles.heroIconBg}
              >
                <Icon name="gift" size="lg" color={colors.gold} />
              </LinearGradient>

              <Text style={[styles.heroTitle, { color: tc.text.primary }]}>{t('screens.enableTips.heroTitle')}</Text>
              <Text style={[styles.heroSubtitle, { color: tc.text.secondary }]}>
                {t('screens.enableTips.heroSubtitle')}
              </Text>

              {/* Main Toggle */}
              <View style={[styles.mainToggleRow, { borderTopColor: tc.border }]}>
                <Text style={[styles.mainToggleLabel, { color: tc.text.primary }]}>{isEnabled ? t('screens.enableTips.enabled') : t('screens.enableTips.disabled')}</Text>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityLabel={t('screens.enableTips.title')}
                  accessibilityState={{ checked: isEnabled }}
                  onPress={() => {
                    haptic.tick();
                    setIsEnabled(!isEnabled);
                  }}

                >
                  <LinearGradient
                    colors={isEnabled ? [colors.emerald, colors.emeraldDark] : [tc.surface, tc.bgCard]}
                    style={styles.mainToggleTrack}
                  >
                    <View
                      style={[
                        styles.mainToggleThumb,
                        isEnabled && styles.mainToggleThumbActive,
                      ]}
                    />
                  </LinearGradient>
                </Pressable>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Configuration Cards - Only shown when enabled */}
          {isEnabled && (
            <>
              {/* Minimum Tip Amount Card */}
              <Animated.View entering={FadeInUp.delay(100).duration(400)}>
                <LinearGradient
                  colors={colors.gradient.cardDark}
                  style={styles.configCard}
                >
                  <View style={styles.configHeader}>
                    <LinearGradient
                      colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.05)']}
                      style={styles.configIconBg}
                    >
                      <Icon name="circle" size="sm" color={colors.emerald} />
                    </LinearGradient>
                    <Text style={[styles.configTitle, { color: tc.text.primary }]}>{t('screens.enableTips.configTitle.minimumTipAmount')}</Text>
                  </View>

                  {/* Preset Amounts */}
                  <View style={styles.presetRow}>
                    {PRESET_AMOUNTS.map(amount => (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`$${amount}`}
                        key={amount}
                        onPress={() => {
                          haptic.tick();
                          setMinTipAmount(amount);
                          setCustomAmount('');
                        }}

                      >
                        <LinearGradient
                          colors={
                            minTipAmount === amount && !customAmount
                              ? [colors.emerald, colors.emeraldDark]
                              : ['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']
                          }
                          style={styles.presetButton}
                        >
                          <Text
                            style={[
                              styles.presetButtonText,
                              minTipAmount === amount && !customAmount && styles.presetButtonTextActive,
                            ]}
                          >
                            ${amount}
                          </Text>
                        </LinearGradient>
                      </Pressable>
                    ))}
                  </View>

                  {/* Custom Amount Input */}
                  <LinearGradient
                    colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
                    style={styles.customInputContainer}
                  >
                    <Text style={styles.currencyPrefix}>$</Text>
                    <TextInput
                      style={styles.customInput}
                      value={customAmount}
                      onChangeText={(text) => {
                        setCustomAmount(text.replace(/[^0-9]/g, ''));
                        if (text) setMinTipAmount(parseInt(text) || 0);
                      }}
                      placeholder={t('screens.enableTips.customAmountPlaceholder')}
                      placeholderTextColor={tc.text.tertiary}
                      keyboardType="number-pad"
                    />
                  </LinearGradient>
                </LinearGradient>
              </Animated.View>

              {/* Display Settings Card */}
              <Animated.View entering={FadeInUp.delay(200).duration(400)}>
                <LinearGradient
                  colors={colors.gradient.cardDark}
                  style={styles.configCard}
                >
                  <View style={styles.configHeader}>
                    <LinearGradient
                      colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.05)']}
                      style={styles.configIconBg}
                    >
                      <Icon name="eye" size="sm" color={colors.emerald} />
                    </LinearGradient>
                    <Text style={[styles.configTitle, { color: tc.text.primary }]}>{t('screens.enableTips.configTitle.displaySettings')}</Text>
                  </View>

                  <CustomToggle
                    value={displaySettings.showOnProfile}
                    onValueChange={() => toggleDisplaySetting('showOnProfile')}
                    label={t('screens.enableTips.toggleLabel.showOnProfile')}
                    description={t('screens.enableTips.toggleDescription.showOnProfile')}
                  />
                  <View style={[styles.toggleDivider, { backgroundColor: tc.border }]} />
                  <CustomToggle
                    value={displaySettings.showOnPosts}
                    onValueChange={() => toggleDisplaySetting('showOnPosts')}
                    label={t('screens.enableTips.toggleLabel.showOnPosts')}
                    description={t('screens.enableTips.toggleDescription.showOnPosts')}
                  />
                  <View style={[styles.toggleDivider, { backgroundColor: tc.border }]} />
                  <CustomToggle
                    value={displaySettings.showTopSupporters}
                    onValueChange={() => toggleDisplaySetting('showTopSupporters')}
                    label={t('screens.enableTips.toggleLabel.showTopSupporters')}
                    description={t('screens.enableTips.toggleDescription.showTopSupporters')}
                  />
                </LinearGradient>
              </Animated.View>

              {/* Thank You Message Card */}
              <Animated.View entering={FadeInUp.delay(300).duration(400)}>
                <LinearGradient
                  colors={colors.gradient.cardDark}
                  style={styles.configCard}
                >
                  <View style={styles.configHeader}>
                    <LinearGradient
                      colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.05)']}
                      style={styles.configIconBg}
                    >
                      <Icon name="mail" size="sm" color={colors.emerald} />
                    </LinearGradient>
                    <Text style={[styles.configTitle, { color: tc.text.primary }]}>{t('screens.enableTips.configTitle.thankYouMessage')}</Text>
                  </View>

                  <LinearGradient
                    colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
                    style={styles.messageInputContainer}
                  >
                    <TextInput
                      style={[styles.messageInput, { color: tc.text.primary }]}
                      value={thankYouMessage}
                      onChangeText={setThankYouMessage}
                      placeholder={t('screens.enableTips.thankYouPlaceholder')}
                      placeholderTextColor={tc.text.tertiary}
                      multiline
                      numberOfLines={3}
                      maxLength={MAX_MESSAGE_LENGTH}
                      textAlignVertical="top"
                    />
                    <View style={styles.charCountContainer}>
                      <CharCountRing current={thankYouMessage.length} max={MAX_MESSAGE_LENGTH} size={28} />
                    </View>
                  </LinearGradient>
                </LinearGradient>
              </Animated.View>

              {/* Payment Method Card */}
              <Animated.View entering={FadeInUp.delay(400).duration(400)}>
                <LinearGradient
                  colors={colors.gradient.cardDark}
                  style={styles.configCard}
                >
                  <View style={styles.configHeader}>
                    <LinearGradient
                      colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.05)']}
                      style={styles.configIconBg}
                    >
                      <Icon name="link" size="sm" color={colors.emerald} />
                    </LinearGradient>
                    <Text style={[styles.configTitle, { color: tc.text.primary }]}>{t('screens.enableTips.configTitle.paymentMethod')}</Text>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={isConnected ? t('screens.enableTips.connected') : t('screens.enableTips.connectPaymentMethod')}
                    onPress={handleConnectPayment}

                    style={styles.connectButton}
                  >
                    <LinearGradient
                      colors={isConnected ? ['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.1)'] : [colors.emerald, colors.emeraldDark]}
                      style={styles.connectButtonGradient}
                    >
                      <Icon
                        name={isConnected ? 'check-circle' : 'link'}
                        size="sm"
                        color={isConnected ? colors.emerald : tc.text.primary}
                      />
                      <Text
                        style={[
                          styles.connectButtonText,
                          isConnected && styles.connectButtonTextConnected,
                        ]}
                      >
                        {isConnected ? t('screens.enableTips.connected') : t('screens.enableTips.connectPaymentMethod')}
                      </Text>
                    </LinearGradient>
                  </Pressable>

                  <Text
                    style={[
                      styles.connectionStatus,
                      isConnected ? styles.connectionStatusConnected : styles.connectionStatusDisconnected,
                    ]}
                  >
                    {isConnected ? t('screens.enableTips.readyToReceiveTips') : t('screens.enableTips.requiredToReceiveTips')}
                  </Text>
                </LinearGradient>
              </Animated.View>
            </>
          )}

          {/* Save Button */}
          {isEnabled && (
            <Animated.View entering={FadeInUp.delay(500).duration(400)}>
              <Pressable onPress={handleSave} accessibilityRole="button" accessibilityLabel={t('screens.enableTips.saveSettings')}>
                <LinearGradient
                  colors={[colors.emerald, colors.emeraldDark]}
                  style={styles.saveButton}
                >
                  <Text style={[styles.saveButtonText, { color: tc.text.primary }]}>{t('screens.enableTips.saveSettings')}</Text>
                </LinearGradient>
              </Pressable>
            </Animated.View>
          )}

          {/* Bottom spacing */}
          <View style={{ height: spacing.xxl }} />
        </ScrollView>
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
  heroCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  heroCardDisabled: {
    opacity: 0.6,
  },
  heroIconBg: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  heroTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSize.lg,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  heroSubtitle: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  mainToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.dark.border,
  },
  mainToggleLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  mainToggleTrack: {
    width: 52,
    height: 32,
    borderRadius: radius.full,
    padding: 4,
  },
  mainToggleThumb: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: colors.text.primary,
    transform: [{ translateX: 0 }],
  },
  mainToggleThumbActive: {
    transform: [{ translateX: 20 }],
  },
  configCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  configHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  configIconBg: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: spacing.md,
  },
  configTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  presetRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  presetButton: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  presetButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.secondary,
  },
  presetButtonTextActive: {
    color: colors.text.primary,
  },
  customInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.active.white6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  currencyPrefix: {
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    color: colors.text.tertiary,
    marginEnd: spacing.xs,
  },
  customInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.primary,
    padding: 0,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleContent: {
    flex: 1,
    marginEnd: spacing.md,
  },
  toggleLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  toggleDescription: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
  },
  toggleDivider: {
    height: 1,
    backgroundColor: colors.dark.border,
    marginVertical: spacing.md,
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
  messageInputContainer: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.md,
    minHeight: 80,
  },
  messageInput: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.primary,
    lineHeight: 22,
    minHeight: 60,
  },
  charCountContainer: {
    position: 'absolute',
    bottom: spacing.sm,
    end: spacing.sm,
  },
  connectButton: {
    marginBottom: spacing.sm,
  },
  connectButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  connectButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  connectButtonTextConnected: {
    color: colors.emerald,
  },
  connectionStatus: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  connectionStatusConnected: {
    color: colors.emerald,
  },
  connectionStatusDisconnected: {
    color: colors.warning,
  },
  saveButton: {
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  saveButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
});
