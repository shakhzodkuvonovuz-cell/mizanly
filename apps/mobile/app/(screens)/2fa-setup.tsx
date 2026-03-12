import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  TextInput,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp, SlideInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { colors, spacing, radius, fontSize, animation } from '@/theme';

const { width: screenWidth } = Dimensions.get('window');

// Mock authenticator apps
const AUTHENTICATOR_APPS = [
  { name: 'Google Authenticator', icon: 'globe' },
  { name: 'Authy', icon: 'lock' },
  { name: 'Microsoft Authenticator', icon: 'globe' },
  { name: 'LastPass Authenticator', icon: 'lock' },
  { name: 'Duo Mobile', icon: 'lock' },
];

// Mock QR data (in real app, this comes from backend)
const MOCK_QR_SECRET = 'JBSWY3DPEHPK3PXP';
const MOCK_QR_DATA_URI = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
  `otpauth://totp/Mizanly:user@example.com?secret=${MOCK_QR_SECRET}&issuer=Mizanly`
)}`;

// Mock backup codes
const MOCK_BACKUP_CODES = [
  '3F7A9C', 'B2D8E5', '9A4C1F', 'E7B2D8',
  '5C9A3F', 'D8E5B2', '1F9A4C', 'B2E7D8',
];

export default function TwoFactorSetupScreen() {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState<'info' | 'qr' | 'verify' | 'backup'>('info');
  const [verificationCode, setVerificationCode] = useState(['', '', '', '', '', '']);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [showAppPicker, setShowAppPicker] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState<string[]>([]);
  const [isEnabling, setIsEnabling] = useState(false);

  // Refs for OTP inputs (simplified array)
  const inputRefs = Array(6).fill(null);

  const handleCodeChange = (text: string, index: number) => {
    if (!/^\d?$/.test(text)) return;

    const newCode = [...verificationCode];
    newCode[index] = text;
    setVerificationCode(newCode);

    // Auto-focus next input
    if (text && index < 5) {
      inputRefs[index + 1]?.focus();
    }

    // Auto-submit when all digits entered
    if (newCode.every(digit => digit !== '') && index === 5) {
      handleEnable2FA();
    }
  };

  const handleEnable2FA = () => {
    setIsEnabling(true);
    // Simulate API call
    setTimeout(() => {
      setIsEnabling(false);
      setActiveStep('backup');
      Alert.alert(
        '2FA Enabled',
        'Two-factor authentication is now enabled for your account. Save your backup codes!',
        [{ text: 'OK' }]
      );
    }, 1500);
  };

  const copyBackupCode = (code: string) => {
    // In real app: Clipboard.setString(code);
    setCopiedCodes(prev => [...prev, code]);
    Alert.alert('Copied', `Backup code ${code} copied to clipboard.`);
  };

  const copyAllBackupCodes = () => {
    const allCodes = MOCK_BACKUP_CODES.join('\n');
    // Clipboard.setString(allCodes);
    Alert.alert('Copied', 'All backup codes copied to clipboard.');
  };

  const downloadBackupCodes = () => {
    Alert.alert(
      'Download Backup Codes',
      'This would download a text file with your backup codes. Save it in a secure location.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Download', onPress: () => {} },
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
    <View style={styles.container}>
      <GlassHeader
        title="Two-Factor Authentication"
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
            <Text style={styles.infoTitle}>Secure Your Account</Text>
            <Text style={styles.infoDescription}>
              Two‑factor authentication adds an extra layer of security by requiring a verification code from your authenticator app each time you sign in.
            </Text>
          </LinearGradient>

          {/* Step 1: Authenticator App */}
          <Animated.View entering={FadeInUp.delay(100).duration(500)} style={styles.stepCard}>
            <View style={styles.stepHeader}>
              <LinearGradient
                colors={activeStep === 'info' ? [colors.emerald, colors.gold] : ['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.15)']}
                style={styles.stepIconBg}
              >
                <Icon name="chevron-down" size="sm" color={activeStep === 'info' ? '#fff' : colors.text.tertiary} />
              </LinearGradient>
              <Text style={[styles.stepTitle, activeStep === 'info' && styles.stepTitleActive]}>
                Step 1: Install Authenticator App
              </Text>
            </View>
            <Text style={styles.stepDescription}>
              If you don't already have one, download an authenticator app from the list below.
            </Text>

            <TouchableOpacity
              style={styles.appPickerButton}
              onPress={() => setShowAppPicker(true)}
            >
              <LinearGradient
                colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
                style={styles.appPickerCard}
              >
                <View style={styles.appPickerLeft}>
                  <Icon name="smartphone" size="sm" color={colors.emerald} />
                  <Text style={styles.appPickerText}>
                    {selectedApp || 'Select an authenticator app'}
                  </Text>
                </View>
                <Icon name="chevron-down" size="sm" color={colors.text.tertiary} />
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.nextButton}
              onPress={() => setActiveStep('qr')}
            >
              <LinearGradient
                colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                style={styles.nextButtonGradient}
              >
                <Text style={styles.nextButtonText}>Continue</Text>
                <Icon name="chevron-right" size="sm" color={colors.text.primary} />
              </LinearGradient>
            </TouchableOpacity>
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
                  Step 2: Scan QR Code
                </Text>
              </View>
              <Text style={styles.stepDescription}>
                Open your authenticator app and scan this QR code.
              </Text>

              {/* QR Code Display */}
              <LinearGradient
                colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.02)']}
                style={styles.qrContainer}
              >
                <View style={styles.qrPlaceholder}>
                  {/* In real app: <Image source={{ uri: MOCK_QR_DATA_URI }} style={styles.qrImage} /> */}
                  <View style={styles.qrMock}>
                    <Text style={styles.qrMockText}>QR Code</Text>
                    <Text style={styles.qrMockSubtext}>Scan with authenticator app</Text>
                  </View>
                </View>
              </LinearGradient>

              {/* Manual Secret */}
              <View style={styles.secretContainer}>
                <Text style={styles.secretLabel}>Or enter this secret manually:</Text>
                <TouchableOpacity onPress={() => {}}>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                    style={styles.secretBox}
                  >
                    <Text style={styles.secretText} selectable>{MOCK_QR_SECRET}</Text>
                    <Icon name="copy" size="xs" color={colors.emerald} />
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.nextButton}
                onPress={() => setActiveStep('verify')}
              >
                <LinearGradient
                  colors={[colors.emerald, colors.gold]}
                  style={styles.nextButtonGradient}
                >
                  <Text style={styles.nextButtonText}>I've scanned the code</Text>
                  <Icon name="chevron-right" size="sm" color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
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
                  Step 3: Enter Verification Code
                </Text>
              </View>
              <Text style={styles.stepDescription}>
                Enter the 6‑digit code from your authenticator app.
              </Text>

              {/* OTP Input */}
              <View style={styles.otpContainer}>
                {verificationCode.map((digit, idx) => (
                  <Animated.View
                    key={idx}
                    entering={FadeInUp.delay(idx * 80).duration(300)}
                  >
                    <LinearGradient
                      colors={digit ? [colors.emerald, colors.gold] : ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
                      style={styles.otpDigitBox}
                    >
                      <TextInput
                        ref={el => inputRefs[idx] = el}
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

              <TouchableOpacity
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
                      <Text style={styles.nextButtonText}>Enable 2FA</Text>
                      <Icon name="lock" size="sm" color="#fff" />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
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
                  Step 4: Save Backup Codes
                </Text>
              </View>
              <Text style={styles.stepDescription}>
                Save these backup codes in a secure place. You can use them to sign in if you lose access to your authenticator app.
              </Text>

              {/* Backup Codes Grid */}
              <View style={styles.backupGrid}>
                {MOCK_BACKUP_CODES.map((code, idx) => (
                  <TouchableOpacity
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
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.backupActions}>
                <TouchableOpacity
                  style={styles.backupActionButton}
                  onPress={copyAllBackupCodes}
                >
                  <LinearGradient
                    colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                    style={styles.backupActionGradient}
                  >
                    <Icon name="copy" size="sm" color={colors.text.primary} />
                    <Text style={styles.backupActionText}>Copy All</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.backupActionButton}
                  onPress={downloadBackupCodes}
                >
                  <LinearGradient
                    colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                    style={styles.backupActionGradient}
                  >
                    <Icon name="chevron-down" size="sm" color={colors.text.primary} />
                    <Text style={styles.backupActionText}>Download</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.nextButton}
                onPress={() => router.back()}
              >
                <LinearGradient
                  colors={[colors.emerald, colors.gold]}
                  style={styles.nextButtonGradient}
                >
                  <Text style={styles.nextButtonText}>Done</Text>
                  <Icon name="check" size="sm" color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
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
            icon={<Icon name={app.icon as any} size="sm" color={colors.text.primary} />}
            onPress={() => {
              setSelectedApp(app.name);
              setShowAppPicker(false);
            }}
          />
        ))}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
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
    borderColor: 'rgba(255,255,255,0.06)',
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
    borderColor: 'rgba(255,255,255,0.06)',
  },
  qrPlaceholder: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
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
    borderColor: 'rgba(10,123,79,0.3)',
  },
  secretText: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
    fontFamily: 'monospace',
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
    borderColor: 'rgba(255,255,255,0.06)',
    flex: 1,
    minWidth: '47%',
    justifyContent: 'center',
  },
  backupCodeText: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '700',
    fontFamily: 'monospace',
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