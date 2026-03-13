import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Dimensions,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  FadeInUp,
  SlideInDown,
  withSpring,
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, radius, fontSize, animation } from '@/theme';
import { twoFactorApi } from '@/services/twoFactorApi';
import { useUser } from '@/store';
import { useTranslation } from '@/hooks/useTranslation';
import type { ValidateTwoFactorDto, BackupCodeDto } from '@/types/twoFactor';

const { width: screenWidth } = Dimensions.get('window');

export default function TwoFactorVerifyScreen() {
  const router = useRouter();
  const user = useUser();
  const { t } = useTranslation();
  const [mode, setMode] = useState<'code' | 'backup'>('code');
  const [verificationCode, setVerificationCode] = useState(['', '', '', '', '', '']);
  const [backupCode, setBackupCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const shakeAnimation = useSharedValue(0);

  // Refs for OTP inputs
  const inputRefs = Array(6).fill(null);
  const backupInputRef = useRef<TextInput>(null);

  const handleCodeChange = (text: string, index: number) => {
    if (!/^\d?$/.test(text)) return;

    const newCode = [...verificationCode];
    newCode[index] = text;
    setVerificationCode(newCode);
    setError(false);

    // Auto-focus next input
    if (text && index < 5) {
      inputRefs[index + 1]?.focus();
    }

    // Auto-submit when all digits entered
    if (newCode.every(digit => digit !== '') && index === 5) {
      handleVerify();
    }
  };

  const handleBackupCodeChange = (text: string) => {
    setBackupCode(text.toUpperCase().replace(/[^A-Z0-9]/g, ''));
    setError(false);
  };

  const triggerShake = () => {
    shakeAnimation.value = withSequence(
      withTiming(10, { duration: 50 }),
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 50 }),
      withTiming(-10, { duration: 50 }),
      withTiming(0, { duration: 50 })
    );
  };

  const handleVerify = useCallback(async () => {
    setLoading(true);
    setError(false);
    if (!user?.id) {
      Alert.alert(t('screens.2faVerify.errorTitle'), t('screens.2faVerify.userNotFound'));
      setLoading(false);
      return;
    }
    try {
      if (mode === 'code') {
        const code = verificationCode.join('');
        await twoFactorApi.validate({ userId: user.id, code });
      } else {
        await twoFactorApi.backup({ userId: user.id, backupCode });
      }
      Alert.alert(
        t('screens.2faVerify.verificationSuccessTitle'),
        t('screens.2faVerify.verificationSuccessMessage'),
        [{ text: t('common.continue'), onPress: () => router.back() }]
      );
    } catch (err) {
      setError(true);
      triggerShake();
      Alert.alert(t('screens.2faVerify.verificationFailedTitle'), t('screens.2faVerify.invalidCodeMessage'));
    } finally {
      setLoading(false);
    }
  }, [mode, verificationCode, backupCode, user, router]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeAnimation.value }],
  }));

  const renderCodeInput = () => (
    <>
      <Text style={styles.inputLabel}>{t('screens.2faVerify.codeInputLabel')}</Text>
      <View style={styles.otpContainer}>
        {verificationCode.map((digit, idx) => (
          <Animated.View
            key={idx}
            entering={FadeInUp.delay(idx * 80).duration(300)}
            style={animatedStyle}
          >
            <LinearGradient
              colors={digit
                ? error
                  ? ['rgba(248,81,73,0.4)', 'rgba(248,81,73,0.2)']
                  : [colors.emerald, colors.gold]
                : ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']
              }
              style={styles.otpDigitBox}
            >
              <TextInput
                ref={el => inputRefs[idx] = el}
                style={[styles.otpDigit, error && styles.otpDigitError]}
                value={digit}
                onChangeText={text => handleCodeChange(text, idx)}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
                autoFocus={idx === 0}
                editable={!loading}
              />
            </LinearGradient>
          </Animated.View>
        ))}
      </View>
    </>
  );

  const renderBackupInput = () => (
    <>
      <Text style={styles.inputLabel}>{t('screens.2faVerify.backupInputLabel')}</Text>
      <Animated.View entering={SlideInDown.duration(400)} style={animatedStyle}>
        <LinearGradient
          colors={backupCode
            ? error
              ? ['rgba(248,81,73,0.4)', 'rgba(248,81,73,0.2)']
              : [colors.emerald, colors.gold]
            : ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']
          }
          style={styles.backupInputBox}
        >
          <TextInput
            ref={backupInputRef}
            style={[styles.backupInput, error && styles.backupInputError]}
            value={backupCode}
            onChangeText={handleBackupCodeChange}
            placeholder={t('screens.2faVerify.backupPlaceholder')}
            placeholderTextColor={colors.text.tertiary}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            maxLength={6}
            editable={!loading}
          />
          <TouchableOpacity onPress={() => setBackupCode('')}>
            <Icon name="x" size="sm" color={colors.text.tertiary} />
          </TouchableOpacity>
        </LinearGradient>
      </Animated.View>
      <Text style={styles.backupHint}>
        {t('screens.2faVerify.backupHint')}
      </Text>
    </>
  );

  return (
    <View style={styles.container}>
      <GlassHeader
        title={t('screens.2faVerify.title')}
        leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
      />

      <View style={styles.content}>
        {/* Hero Icon */}
        <Animated.View
          entering={FadeInUp.duration(600)}
          style={styles.heroContainer}
        >
          <LinearGradient
            colors={[colors.emerald, colors.gold]}
            style={styles.heroCircle}
          >
            <Icon name="lock" size="xl" color="#fff" />
          </LinearGradient>
          <Text style={styles.heroTitle}>{t('screens.2faVerify.heroTitle')}</Text>
          <Text style={styles.heroSubtitle}>
            {t('screens.2faVerify.heroSubtitle')}
          </Text>
        </Animated.View>

        {/* Input Section */}
        <Animated.View entering={FadeInUp.delay(200).duration(500)} style={styles.inputSection}>
          {mode === 'code' ? renderCodeInput() : renderBackupInput()}

          {/* Mode Toggle */}
          <TouchableOpacity
            style={styles.modeToggle}
            onPress={() => {
              setMode(mode === 'code' ? 'backup' : 'code');
              setError(false);
              if (mode === 'code') {
                setTimeout(() => backupInputRef.current?.focus(), 100);
              }
            }}
            disabled={loading}
          >
            <Text style={styles.modeToggleText}>
              {mode === 'code' ? t('screens.2faVerify.useBackupCodeInstead') : t('screens.2faVerify.useAuthenticatorCodeInstead')}
            </Text>
            <Icon name={mode === 'code' ? 'lock' : 'phone'} size="xs" color={colors.emerald} />
          </TouchableOpacity>

          {/* Verify Button */}
          <TouchableOpacity
            style={styles.verifyButton}
            onPress={handleVerify}
            disabled={loading || (mode === 'code' && verificationCode.some(d => d === '')) || (mode === 'backup' && backupCode.length !== 6)}
          >
            <LinearGradient
              colors={loading
                ? ['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']
                : [colors.emerald, colors.gold]
              }
              style={styles.verifyGradient}
            >
              {loading ? (
                <Icon name="loader" size="md" color="#fff" />
              ) : (
                <>
                  <Text style={styles.verifyText}>{t('auth.verify')}</Text>
                  <Icon name="check" size="md" color="#fff" />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Lost Access Link */}
          <TouchableOpacity
            style={styles.lostAccessLink}
            onPress={() =>
              Alert.alert(
                t('screens.2faVerify.lostAccessTitle'),
                t('screens.2faVerify.lostAccessMessage'),
                [
                  { text: t('common.cancel'), style: 'cancel' },
                  { text: t('screens.2faVerify.lostAccessButtonContact'), onPress: () => {} },
                ]
              )
            }
          >
            <Icon name="circle" size="xs" color={colors.text.tertiary} />
            <Text style={styles.lostAccessText}>{t('screens.2faVerify.lostAccessLinkText')}</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Help Info */}
        <Animated.View entering={FadeInUp.delay(400).duration(500)} style={styles.helpInfo}>
          <LinearGradient
            colors={['rgba(10,123,79,0.1)', 'rgba(200,150,62,0.05)']}
            style={styles.helpCard}
          >
            <Icon name="circle" size="sm" color={colors.emerald} />
            <View style={styles.helpTextContainer}>
              <Text style={styles.helpTitle}>{t('screens.2faVerify.helpTitle')}</Text>
              <Text style={styles.helpDescription}>
                {t('screens.2faVerify.helpDescription')}
              </Text>
            </View>
          </LinearGradient>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  content: {
    flex: 1,
    paddingTop: 100,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['3xl'],
  },

  // Hero Section
  heroContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  heroCircle: {
    width: 120,
    height: 120,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  heroTitle: {
    color: colors.text.primary,
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  heroSubtitle: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: '90%',
  },

  // Input Section
  inputSection: {
    marginBottom: spacing.xl,
  },
  inputLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
    marginBottom: spacing.lg,
    textAlign: 'center',
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
  otpDigitError: {
    color: colors.error,
  },

  // Backup Input
  backupInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: spacing.sm,
  },
  backupInput: {
    color: colors.text.primary,
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    fontFamily: 'monospace',
    flex: 1,
    letterSpacing: 4,
  },
  backupInputError: {
    color: colors.error,
  },
  backupHint: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },

  // Mode Toggle
  modeToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xl,
  },
  modeToggleText: {
    color: colors.emerald,
    fontSize: fontSize.base,
    fontWeight: '600',
  },

  // Verify Button
  verifyButton: {
    marginBottom: spacing.lg,
  },
  verifyGradient: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
  },
  verifyText: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '700',
  },

  // Lost Access Link
  lostAccessLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xl,
  },
  lostAccessText: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },

  // Help Info
  helpInfo: {
    marginTop: 'auto',
  },
  helpCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(10,123,79,0.2)',
  },
  helpTextContainer: {
    flex: 1,
  },
  helpTitle: {
    color: colors.emerald,
    fontSize: fontSize.base,
    fontWeight: '600',
    marginBottom: 2,
  },
  helpDescription: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
});