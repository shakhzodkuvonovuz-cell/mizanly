import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Share,
  TextInput,
  Alert,
  Image,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp, SlideInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { colors, spacing, radius, fontSize, animation, fonts } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { twoFactorApi } from '@/services/twoFactorApi';
import { useTranslation } from '@/hooks/useTranslation';
import type { TwoFactorSetupResponse, TwoFactorStatus } from '@/types/twoFactor';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { showToast } from '@/components/ui/Toast';

// Mock authenticator apps
const AUTHENTICATOR_APPS: { name: string; icon: IconName }[] = [
  { name: 'Google Authenticator', icon: 'globe' },
  { name: 'Authy', icon: 'lock' },
  { name: 'Microsoft Authenticator', icon: 'globe' },
  { name: 'LastPass Authenticator', icon: 'lock' },
  { name: 'Duo Mobile', icon: 'lock' },
];


export default function TwoFactorSetupScreen() {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState<'info' | 'qr' | 'verify' | 'backup'>('info');
  const [verificationCode, setVerificationCode] = useState(['', '', '', '', '', '']);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [showAppPicker, setShowAppPicker] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState<string[]>([]);
  const [isEnabling, setIsEnabling] = useState(false);
  const [secret, setSecret] = useState<string>('');
  const [qrDataUri, setQrDataUri] = useState<string>('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupResponse, setSetupResponse] = useState<TwoFactorSetupResponse | null>(null);
  const { t } = useTranslation();
  const tc = useThemeColors();

  // Refs for OTP inputs
  const inputRefs = useRef<(TextInput | null)[]>(Array(6).fill(null));
  const submittingRef = useRef(false);

  const handleCodeChange = (text: string, index: number) => {
    if (!/^\d?$/.test(text)) return;

    const newCode = [...verificationCode];
    newCode[index] = text;
    setVerificationCode(newCode);

    // Auto-focus next input
    if (text && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits entered
    if (newCode.every(digit => digit !== '') && index === 5) {
      if (!submittingRef.current) {
        submittingRef.current = true;
        handleEnable2FA();
      }
    }
  };

  const fetchSetup = useCallback(async () => {
    try {
      setLoading(true);
      const response = await twoFactorApi.setup();
      setSecret(response.secret);
      setQrDataUri(response.qrDataUri);
      setBackupCodes(response.backupCodes);
      setSetupResponse(response);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.setupFailed'));
      showToast({ message: t('auth.setupFailedMessage'), variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (activeStep === 'qr' && !setupResponse) {
      fetchSetup();
    }
  }, [activeStep, setupResponse, fetchSetup]);

  const handleEnable2FA = async () => {
    setIsEnabling(true);
    setError(null);
    try {
      const code = verificationCode.join('');
      await twoFactorApi.verify({ code });
      setActiveStep('backup');
      showToast({ message: t('auth.twoFactorEnabledMessage'), variant: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.verificationFailed'));
      showToast({ message: t('auth.verificationFailedMessage'), variant: 'error' });
      // Optionally shake animation
    } finally {
      setIsEnabling(false);
      submittingRef.current = false;
    }
  };

  const copyBackupCode = async (code: string) => {
    await Clipboard.setStringAsync(code);
    setCopiedCodes(prev => [...prev, code]);
    showToast({ message: t('auth.backupCodeCopied', { code }), variant: 'success' });
  };

  const copyAllBackupCodes = async () => {
    const allCodes = backupCodes.join('\n');
    await Clipboard.setStringAsync(allCodes);
    showToast({ message: t('auth.allBackupCodesCopied'), variant: 'success' });
  };

  const downloadBackupCodes = () => {
    Alert.alert(
      t('auth.downloadBackupCodes'),
      t('auth.downloadBackupCodesMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.download'), onPress: async () => {
          try {
            await Share.share({ message: backupCodes.join('\n'), title: '2FA Backup Codes' });
          } catch {}
        } },
      ]
    );
  };

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      {['info', 'qr', 'verify', 'backup'].map((step, idx) => (
        <View key={step} style={styles.stepRow}>
          <LinearGradient
            colors={activeStep === step
              ? [colors.emerald, colors.gold]
              : ['rgba(45,53,72,0.5)', 'rgba(28,35,51,0.3)']
            }
            style={styles.stepCircle}
          >
            <Text style={[
              styles.stepNumber,
              activeStep === step && styles.stepNumberActive
            ]}>
              {idx + 1}
            </Text>
          </LinearGradient>
          {idx < 3 && (
            <View style={[
              styles.stepLine,
              activeStep === step && styles.stepLineActive,
              (activeStep === 'qr' && idx === 0) && styles.stepLineActive,
              (activeStep === 'verify' && idx < 2) && styles.stepLineActive,
              (activeStep === 'backup' && idx < 3) && styles.stepLineActive,
            ]} />
          )}
        </View>
      ))}
    </View>
  );

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('auth.twoFactorAuthentication')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeInUp.duration(500)}>
            {/* Step Indicator */}
            {renderStepIndicator()}

            {/* Info Card */}
            <LinearGradient
              colors={['rgba(10,123,79,0.15)', 'rgba(200,150,62,0.1)']}
              style={styles.infoCard}
            >
              <View style={styles.infoIconContainer}>
                <LinearGradient
                  colors={[colors.emerald, colors.gold]}
                  style={styles.infoIconBg}
                >
                  <Icon name="lock" size="lg" color="#fff" />
                </LinearGradient>
              </View>
              <Text style={styles.infoTitle}>{t('auth.secureYourAccount')}</Text>
              <Text style={styles.infoDescription}>
                {t('auth.twoFactorDescription')}
              </Text>
            </LinearGradient>

            {/* Step 1: Authenticator App */}
            <Animated.View entering={FadeInUp.delay(100).duration(500)} style={styles.stepCard}>
              <View style={styles.stepHeader}>
                <LinearGradient
                  colors={activeStep === 'info' ? [colors.emerald, colors.gold] : ['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.15)']}
                  style={styles.stepIconBg}
                >
                  <Icon name="chevron-down" size="sm" color={activeStep === 'info' ? '#fff' : tc.text.tertiary} />
                </LinearGradient>
                <Text style={[styles.stepTitle, activeStep === 'info' && styles.stepTitleActive]}>
                  {t('auth.step1InstallAuthenticatorApp')}
                </Text>
              </View>
              <Text style={styles.stepDescription}>
                {t('auth.step1Description')}
              </Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('auth.selectAuthenticatorApp')}
                style={styles.appPickerButton}
                onPress={() => setShowAppPicker(true)}
              >
                <LinearGradient
                  colors={colors.gradient.cardDark}
                  style={styles.appPickerCard}
                >
                  <View style={styles.appPickerLeft}>
                    <Icon name="phone" size="sm" color={colors.emerald} />
                    <Text style={styles.appPickerText}>
                      {selectedApp || t('auth.selectAuthenticatorApp')}
                    </Text>
                  </View>
                  <Icon name="chevron-down" size="sm" color={tc.text.tertiary} />
                </LinearGradient>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.continue')}
                style={styles.nextButton}
                onPress={() => setActiveStep('qr')}
              >
                <LinearGradient
                  colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                  style={styles.nextButtonGradient}
                >
                  <Text style={styles.nextButtonText}>{t('common.continue')}</Text>
                  <Icon name="chevron-right" size="sm" color={tc.text.primary} />
                </LinearGradient>
              </Pressable>
            </Animated.View>

            {/* Step 2: QR Code */}
            {activeStep === 'qr' && (
              <Animated.View entering={SlideInDown.duration(500)} style={styles.stepCard}>
                <View style={styles.stepHeader}>
                  <LinearGradient
                    colors={[colors.emerald, colors.gold]}
                    style={styles.stepIconBg}
                  >
                    <Icon name="layout" size="sm" color="#fff" />
                  </LinearGradient>
                  <Text style={[styles.stepTitle, styles.stepTitleActive]}>
                    {t('auth.step2ScanQRCode')}
                  </Text>
                </View>
                <Text style={styles.stepDescription}>
                  {t('auth.step2Description')}
                </Text>

                {/* QR Code Display */}
                <LinearGradient
                  colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.02)']}
                  style={styles.qrContainer}
                >
                  <View style={styles.qrPlaceholder}>
                    {qrDataUri ? (
                      <Image source={{ uri: qrDataUri }} style={styles.qrImage} />
                    ) : (
                      <View style={styles.qrMock}>
                        {loading ? (
                          <>
                            <Icon name="loader" size="lg" color={tc.text.tertiary} />
                            <Text style={styles.qrMockSubtext}>{t('auth.generatingQRCode')}</Text>
                          </>
                        ) : (
                          <>
                            <Text style={styles.qrMockText}>{t('auth.qrCode')}</Text>
                            <Text style={styles.qrMockSubtext}>{t('auth.scanWithAuthenticatorApp')}</Text>
                          </>
                        )}
                      </View>
                    )}
                  </View>
                </LinearGradient>

                {/* Manual Secret */}
                <View style={styles.secretContainer}>
                  <Text style={styles.secretLabel}>{t('auth.enterSecretManually')}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('auth.enterSecretManually')} onPress={async () => { await Clipboard.setStringAsync(secret); showToast({ message: t('common.copied'), variant: 'success' }); }}>
                    <LinearGradient
                      colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                      style={styles.secretBox}
                    >
                      <Text style={styles.secretText} selectable>{secret}</Text>
                      <Icon name="layers" size="xs" color={colors.emerald} />
                    </LinearGradient>
                  </Pressable>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('auth.scannedCodeButton')}
                  style={styles.nextButton}
                  onPress={() => setActiveStep('verify')}
                >
                  <LinearGradient
                    colors={[colors.emerald, colors.gold]}
                    style={styles.nextButtonGradient}
                  >
                    <Text style={styles.nextButtonText}>{t('auth.scannedCodeButton')}</Text>
                    <Icon name="chevron-right" size="sm" color="#fff" />
                  </LinearGradient>
                </Pressable>
              </Animated.View>
            )}

            {/* Step 3: Verification */}
            {activeStep === 'verify' && (
              <Animated.View entering={SlideInDown.duration(500)} style={styles.stepCard}>
                <View style={styles.stepHeader}>
                  <LinearGradient
                    colors={[colors.emerald, colors.gold]}
                    style={styles.stepIconBg}
                  >
                    <Icon name="check-circle" size="sm" color="#fff" />
                  </LinearGradient>
                  <Text style={[styles.stepTitle, styles.stepTitleActive]}>
                    {t('auth.step3EnterVerificationCode')}
                  </Text>
                </View>
                <Text style={styles.stepDescription}>
                  {t('auth.step3Description')}
                </Text>

                {/* OTP Input */}
                <View style={styles.otpContainer}>
                  {verificationCode.map((digit, idx) => (
                    <Animated.View
                      key={idx}
                      entering={FadeInUp.delay(idx * 80).duration(300)}
                    >
                      <LinearGradient
                        colors={digit ? [colors.emerald, colors.gold] : colors.gradient.cardDark}
                        style={styles.otpDigitBox}
                      >
                        <TextInput
                          ref={el => inputRefs.current[idx] = el}
                          style={styles.otpDigit}
                          value={digit}
                          onChangeText={text => handleCodeChange(text, idx)}
                          keyboardType="number-pad"
                          maxLength={1}
                          selectTextOnFocus
                          autoFocus={idx === 0}
                        />
                      </LinearGradient>
                    </Animated.View>
                  ))}
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('auth.enable2FA')}
                  style={styles.nextButton}
                  onPress={handleEnable2FA}
                  disabled={isEnabling || verificationCode.some(d => d === '')}
                >
                  <LinearGradient
                    colors={isEnabling
                      ? ['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']
                      : [colors.emerald, colors.gold]
                    }
                    style={styles.nextButtonGradient}
                  >
                    {isEnabling ? (
                      <Icon name="loader" size="sm" color="#fff" />
                    ) : (
                      <>
                        <Text style={styles.nextButtonText}>{t('auth.enable2FA')}</Text>
                        <Icon name="lock" size="sm" color="#fff" />
                      </>
                    )}
                  </LinearGradient>
                </Pressable>
              </Animated.View>
            )}

            {/* Step 4: Backup Codes */}
            {activeStep === 'backup' && (
              <Animated.View entering={SlideInDown.duration(500)} style={styles.stepCard}>
                <View style={styles.stepHeader}>
                  <LinearGradient
                    colors={[colors.emerald, colors.gold]}
                    style={styles.stepIconBg}
                  >
                    <Icon name="lock" size="sm" color="#fff" />
                  </LinearGradient>
                  <Text style={[styles.stepTitle, styles.stepTitleActive]}>
                    {t('auth.step4SaveBackupCodes')}
                  </Text>
                </View>
                <Text style={styles.stepDescription}>
                  {t('auth.step4Description')}
                </Text>

                {/* Backup Codes Grid */}
                <Text style={styles.backupWarning}>{t('auth.backupCodesWarning')}</Text>
                <View style={styles.backupGrid}>
                  {backupCodes.map((code, idx) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('auth.backupCodeCopied', { code })}
                      key={idx}
                      onPress={() => copyBackupCode(code)}
                    >
                      <LinearGradient
                        colors={copiedCodes.includes(code)
                          ? ['rgba(10,123,79,0.4)', 'rgba(200,150,62,0.3)']
                          : ['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.15)']
                        }
                        style={styles.backupCodeCard}
                      >
                        <Text style={[
                          styles.backupCodeText,
                          copiedCodes.includes(code) && styles.backupCodeTextCopied
                        ]}>
                          {code}
                        </Text>
                        {copiedCodes.includes(code) && (
                          <Icon name="check" size="xs" color={colors.emerald} />
                        )}
                      </LinearGradient>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.backupActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('common.copyAll')}
                    style={styles.backupActionButton}
                    onPress={copyAllBackupCodes}
                  >
                    <LinearGradient
                      colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                      style={styles.backupActionGradient}
                    >
                      <Icon name="layers" size="sm" color={tc.text.primary} />
                      <Text style={styles.backupActionText}>{t('common.copyAll')}</Text>
                    </LinearGradient>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('common.download')}
                    style={styles.backupActionButton}
                    onPress={downloadBackupCodes}
                  >
                    <LinearGradient
                      colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                      style={styles.backupActionGradient}
                    >
                      <Icon name="chevron-down" size="sm" color={tc.text.primary} />
                      <Text style={styles.backupActionText}>{t('common.download')}</Text>
                    </LinearGradient>
                  </Pressable>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('common.done')}
                  style={styles.nextButton}
                  onPress={() => router.back()}
                >
                  <LinearGradient
                    colors={[colors.emerald, colors.gold]}
                    style={styles.nextButtonGradient}
                  >
                    <Text style={styles.nextButtonText}>{t('common.done')}</Text>
                    <Icon name="check" size="sm" color="#fff" />
                  </LinearGradient>
                </Pressable>
              </Animated.View>
            )}
          </Animated.View>
        </ScrollView>

        {/* Authenticator App Picker Bottom Sheet */}
        <BottomSheet visible={showAppPicker} onClose={() => setShowAppPicker(false)}>
          {AUTHENTICATOR_APPS.map(app => (
            <BottomSheetItem
              key={app.name}
              label={app.name}
              icon={<Icon name={app.icon as IconName} size="sm" color={tc.text.primary} />}
              onPress={() => {
                setSelectedApp(app.name);
                setShowAppPicker(false);
              }}
            />
          ))}
        </BottomSheet>
      </View>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg, // overridden inline
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 100,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['3xl'],
  },

  // Step Indicator
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumber: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  stepNumberActive: {
    color: '#fff',
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: spacing.xs,
  },
  stepLineActive: {
    backgroundColor: colors.emerald,
  },

  // Info Card
  infoCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  infoIconContainer: {
    marginBottom: spacing.md,
  },
  infoIconBg: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoTitle: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  infoDescription: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Step Card
  stepCard: {
    marginBottom: spacing.xl,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  stepIconBg: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepTitle: {
    color: colors.text.secondary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  stepTitleActive: {
    color: colors.text.primary,
  },
  stepDescription: {
    color: colors.text.tertiary,
    fontSize: fontSize.base,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },

  // App Picker
  appPickerButton: {
    marginBottom: spacing.lg,
  },
  appPickerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  appPickerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  appPickerText: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '500',
  },

  // Next Button
  nextButton: {
    marginTop: spacing.md,
  },
  nextButtonGradient: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
  },
  nextButtonText: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },

  // QR Code
  qrContainer: {
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  qrPlaceholder: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: radius.lg,
  },
  qrImage: {
    width: 200,
    height: 200,
    borderRadius: radius.lg,
  },
  qrMock: {
    alignItems: 'center',
  },
  qrMockText: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  qrMockSubtext: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
  },

  // Secret
  secretContainer: {
    marginBottom: spacing.lg,
  },
  secretLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
  },
  secretBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.emerald30,
  },
  secretText: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
    fontFamily: fonts.mono,
  },

  // OTP Input
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  otpDigitBox: {
    width: 56,
    height: 64,
    borderRadius: radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  otpDigit: {
    color: colors.text.primary,
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
  },

  // Backup Codes
  backupWarning: {
    color: colors.warning,
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  backupGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  backupCodeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    flex: 1,
    minWidth: '47%',
    justifyContent: 'center',
  },
  backupCodeText: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '700',
    fontFamily: fonts.mono,
  },
  backupCodeTextCopied: {
    color: colors.emerald,
  },
  backupActions: {
    flexDirection: 'row',
    gap: spacing.base,
    marginBottom: spacing.lg,
  },
  backupActionButton: {
    flex: 1,
  },
  backupActionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  backupActionText: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
});