import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable,
  KeyboardAvoidingView, Platform, ScrollView, Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSignUp } from '@clerk/clerk-expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { GradientButton } from '@/components/ui/GradientButton';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius, animation, fonts, fontSizeExt } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

function SignUpScreenContent() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const router = useRouter();
  const { t } = useTranslation();

  const tc = useThemeColors();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const hiddenInputRef = useRef<TextInput>(null);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Animated logo entrance
  const logoScale = useSharedValue(0.85);
  const logoOpacity = useSharedValue(0);

  useEffect(() => {
    logoScale.value = withSpring(1, animation.spring.bouncy);
    logoOpacity.value = withTiming(1, { duration: 600 });
  }, []);

  const logoAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
    opacity: logoOpacity.value,
  }));

  // Animated envelope for verification
  const envelopeScale = useSharedValue(0);
  useEffect(() => {
    if (pendingVerification) {
      envelopeScale.value = withSequence(
        withTiming(0, { duration: 0 }),
        withSpring(1, animation.spring.bouncy)
      );
    }
  }, [pendingVerification]);

  const envelopeAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: envelopeScale.value }],
  }));

  // Resend cooldown timer
  const startCooldown = () => {
    setResendCooldown(60);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          cooldownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  // Password strength — checks length, uppercase, numbers, special chars
  const strength = password.length === 0
    ? 0
    : password.length < 6
      ? 1
      : password.length < 8
        ? 2
        : (/[A-Z]/.test(password) && /[0-9]/.test(password) && /[^a-zA-Z0-9]/.test(password))
          ? 4
          : (/[A-Z]/.test(password) && /[0-9]/.test(password))
            ? 3
            : 2;
  const strengthLabel = strength === 0 ? '' : strength <= 1 ? t('auth.passwordWeak') : strength <= 2 ? t('auth.passwordFair') : strength <= 3 ? t('auth.passwordGood') : t('auth.passwordStrong');

  const handleSignUp = async () => {
    if (!isLoaded) return;
    setLoading(true);
    setError('');

    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (err: unknown) {
      const e = err as { errors?: Array<{ message?: string }>; message?: string };
      setError(e.errors?.[0]?.message || 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!isLoaded) return;
    setLoading(true);
    setError('');

    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
      }
    } catch (err: unknown) {
      const e = err as { errors?: Array<{ message?: string }>; message?: string };
      setError(e.errors?.[0]?.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  // Generate digit boxes based on code
  const digits = code.split('').concat(Array(6 - code.length).fill(''));

  if (pendingVerification) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]}>
        <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          style={styles.inner}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Back button to return to signup form */}
          <Pressable
            onPress={() => { setPendingVerification(false); setError(''); setCode(''); }}
            style={styles.verifyBackBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('common.goBack')}
          >
            <Icon name="arrow-left" size="md" color={tc.text.secondary} />
          </Pressable>

          {/* Animated envelope icon */}
          <Animated.View style={[styles.verifyIconWrap, envelopeAnimStyle]}>
            <Icon name="mail" size="xl" color={colors.emerald} />
          </Animated.View>

          <Text style={[styles.title, { color: tc.text.primary }]}>{t('auth.checkEmail')}</Text>
          <Text style={[styles.subtitle, { color: tc.text.secondary }]}>
            {t('auth.verificationSent')}{'\n'}
            <Text style={styles.emailHighlight}>{email}</Text>
          </Text>

          <View style={styles.form}>
            {/* Digit boxes with hidden input */}
            <Pressable
              accessibilityRole="button"
              onPress={() => hiddenInputRef.current?.focus()}
              style={styles.codeRow}
            >
              {digits.map((d, i) => (
                <View
                  key={i}
                  style={[
                    styles.digitBox,
                    { backgroundColor: tc.bgElevated, borderColor: tc.border },
                    i === code.length && styles.digitBoxActive,
                  ]}
                >
                  <Text style={[styles.digitText, { color: tc.text.primary }]}>{d}</Text>
                </View>
              ))}
            </Pressable>
            <TextInput
              accessibilityLabel={t('accessibility.textInput')}
              ref={hiddenInputRef}
              style={{ position: 'absolute', opacity: 0 }}
              value={code}
              onChangeText={(val) => setCode(val.replace(/[^0-9]/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
            />

            {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}

            <Text style={[styles.hintText, { color: tc.text.tertiary }]}>{t('auth.checkSpam')}</Text>

            <GradientButton
              label={t('auth.verifyEmail')}
              onPress={handleVerify}
              loading={loading}
              disabled={code.length < 6}
              fullWidth
            />

            <Pressable
              accessibilityRole="button"
              disabled={resendCooldown > 0}
              onPress={async () => {
                if (resendCooldown > 0) return;
                try {
                  await signUp?.prepareEmailAddressVerification({ strategy: 'email_code' });
                  setError('');
                  startCooldown();
                } catch {
                  setError(t('auth.resendFailed'));
                }
              }}
              style={[styles.resendBtn, resendCooldown > 0 && { opacity: 0.5 }]}
              hitSlop={8}
            >
              <Text style={styles.resendText}>
                {resendCooldown > 0
                  ? t('auth.resendCooldown', { seconds: resendCooldown })
                  : t('auth.resendCode')}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Decorative gradient behind logo */}
          <View style={styles.bgGlow}>
            <LinearGradient
              colors={[colors.active.emerald20, 'transparent']}
              style={{ width: 250, height: 250, borderRadius: radius.full }}
              start={{ x: 0.5, y: 0.5 }}
              end={{ x: 1, y: 1 }}
            />
          </View>

          {/* Logo */}
          <Animated.View style={[styles.logoSection, logoAnimStyle]}>
            <Text style={[styles.logo, { color: tc.text.primary }]}>{t('auth.joinTitle')}</Text>
            <Text style={[styles.tagline, { color: tc.text.secondary }]}>{t('auth.tagline')}</Text>
          </Animated.View>

          <View style={styles.form}>
            {/* Email input with icon */}
            <View style={[styles.inputRow, { backgroundColor: tc.bgElevated, borderColor: tc.border }, emailFocused && styles.inputRowFocused]}>
              <Icon
                name="mail"
                size="sm"
                color={emailFocused ? colors.emerald : tc.text.tertiary}
              />
              <TextInput
                style={[styles.inputInner, { color: tc.text.primary }]}
                placeholder={t('auth.emailPlaceholder')}
                placeholderTextColor={tc.text.tertiary}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
              />
            </View>

            {/* Password input with icon + show/hide */}
            <View style={[styles.inputRow, { backgroundColor: tc.bgElevated, borderColor: tc.border }, passwordFocused && styles.inputRowFocused]}>
              <Icon
                name="lock"
                size="sm"
                color={passwordFocused ? colors.emerald : tc.text.tertiary}
              />
              <TextInput
                style={[styles.inputInner, { color: tc.text.primary }]}
                placeholder={t('auth.passwordPlaceholderMin')}
                placeholderTextColor={tc.text.tertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="new-password"
                textContentType="newPassword"
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={12}
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Icon name={showPassword ? 'eye-off' : 'eye'} size="sm" color={tc.text.tertiary} />
              </Pressable>
            </View>

            {/* Password strength indicator */}
            <View style={styles.strengthRow}>
              {[1, 2, 3, 4].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.strengthBar,
                    { backgroundColor: tc.border },
                    i <= strength && {
                      backgroundColor:
                        strength <= 1
                          ? colors.error
                          : strength <= 2
                            ? colors.warning
                            : colors.emerald,
                    },
                  ]}
                />
              ))}
            </View>
            {strengthLabel ? (
              <Text style={[styles.strengthLabel, { color: strength <= 1 ? colors.error : strength <= 2 ? colors.warning : colors.emerald }]}>{strengthLabel}</Text>
            ) : null}

            {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}

            <GradientButton
              label={t('auth.createAccount')}
              onPress={handleSignUp}
              loading={loading}
              disabled={!email || password.length < 8}
              fullWidth
            />

            <Text style={[styles.terms, { color: tc.text.tertiary }]}>
              {t('auth.termsAgreement')}
            </Text>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: tc.border }]} />
              <Text style={[styles.dividerText, { color: tc.text.tertiary }]}>{t('auth.or')}</Text>
              <View style={[styles.dividerLine, { backgroundColor: tc.border }]} />
            </View>

            {/* Social auth — disabled until OAuth configured */}
            <View style={styles.socialRow}>
              <Pressable
                style={[styles.socialBtn, { backgroundColor: tc.bgElevated, borderColor: tc.border, opacity: 0.4 }]}
                disabled={true}
                accessibilityLabel={t('auth.signInWith') + ' Google'}
                accessibilityRole="button"
                accessibilityState={{ disabled: true }}
              >
                <Text style={[styles.socialText, { color: tc.text.primary }]}>{t('auth.google')}</Text>
                <Text style={[styles.comingSoonBadge, { color: tc.text.tertiary }]}>{t('common.availableSoon')}</Text>
              </Pressable>
              <Pressable
                style={[styles.socialBtn, { backgroundColor: tc.bgElevated, borderColor: tc.border, opacity: 0.4 }]}
                disabled={true}
                accessibilityLabel={t('auth.signInWith') + ' Apple'}
                accessibilityRole="button"
                accessibilityState={{ disabled: true }}
              >
                <Text style={[styles.socialText, { color: tc.text.primary }]}>{t('auth.apple')}</Text>
                <Text style={[styles.comingSoonBadge, { color: tc.text.tertiary }]}>{t('common.availableSoon')}</Text>
              </Pressable>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: tc.text.secondary }]}>{t('auth.alreadyHaveAccount')}</Text>
            <Pressable onPress={() => router.replace('/(auth)/sign-in')} hitSlop={8} accessibilityRole="link">
              <Text style={styles.footerLink}>{t('auth.signIn')}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function SignUpScreen() {
  return (
    <ScreenErrorBoundary>
      <SignUpScreenContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, paddingHorizontal: spacing.xl, justifyContent: 'center' },
  bgGlow: {
    position: 'absolute',
    top: '12%',
    alignSelf: 'center',
    opacity: 0.5,
  },
  logoSection: { alignItems: 'center', marginBottom: spacing['3xl'] },
  logo: { color: colors.text.primary, fontSize: fontSizeExt.display, fontFamily: fonts.headingBold },
  tagline: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: spacing.sm },
  title: { color: colors.text.primary, fontSize: fontSize.xl, fontWeight: '700', textAlign: 'center', marginBottom: spacing.sm },
  subtitle: { color: colors.text.secondary, fontSize: fontSize.base, textAlign: 'center', lineHeight: 24, marginBottom: spacing['2xl'] },
  emailHighlight: { color: colors.emerald, fontWeight: '700' },
  form: { gap: spacing.md },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    minHeight: 52,
    paddingVertical: 14,
  },
  inputRowFocused: {
    borderColor: colors.emerald,
    shadowColor: colors.emerald,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  inputInner: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.base,
  },
  strengthRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  strengthBar: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  error: { color: colors.error, fontSize: fontSize.sm, textAlign: 'center' },
  terms: { color: colors.text.tertiary, fontSize: fontSize.xs, textAlign: 'center', lineHeight: 18 },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  dividerLine: { flex: 1, height: 0.5 },
  dividerText: { color: colors.text.tertiary, fontSize: fontSize.xs },
  socialRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
  },
  socialBtnPressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  socialText: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '500' },
  comingSoonText: { color: colors.text.tertiary, fontSize: fontSize.xs },
  comingSoonBadge: { color: colors.text.tertiary, fontSize: 10 },
  verifyBackBtn: { alignSelf: 'flex-start', padding: spacing.sm, marginBottom: spacing.md },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing['2xl'] },
  footerText: { color: colors.text.secondary, fontSize: fontSize.sm },
  footerLink: { color: colors.gold, fontSize: fontSize.sm, fontWeight: '600' },
  verifyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: colors.active.emerald10,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  codeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  digitBox: {
    width: 48,
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitBoxActive: {
    borderColor: colors.emerald,
  },
  digitText: {
    color: colors.text.primary,
    fontSize: 24,
    fontWeight: '700',
  },
  hintText: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  resendBtn: {
    marginTop: spacing.lg,
    alignSelf: 'center',
  },
  resendText: {
    color: colors.gold,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});
