import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable,
  KeyboardAvoidingView, Platform, Keyboard, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSignIn } from '@clerk/clerk-expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  FadeInDown,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { GradientButton } from '@/components/ui/GradientButton';
import { Icon } from '@/components/ui/Icon';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { colors, spacing, fontSize, radius, animation, shadow, fonts } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { navigate } from '@/utils/navigation';

function SignInScreenContent() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const { t } = useTranslation();

  const tc = useThemeColors();
  const haptic = useContextualHaptic();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [needs2FA, setNeeds2FA] = useState(false);
  const [twoFACode, setTwoFACode] = useState('');

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

  const handleSignIn = async () => {
    if (!isLoaded) return;
    setLoading(true);
    setError('');

    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
      } else if (result.status === 'needs_second_factor') {
        setNeeds2FA(true);
      }
    } catch (err: unknown) {
      if (__DEV__) console.warn('Sign in failed:', (err as Error).message);
      const e = err as { errors?: Array<{ message?: string }>; message?: string };
      setError(e.errors?.[0]?.message || e.message || t('auth.signInFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handle2FAVerify = async () => {
    if (!isLoaded || twoFACode.length < 6) return;
    setLoading(true);
    setError('');
    try {
      const result = await signIn.attemptSecondFactor({ strategy: 'totp', code: twoFACode });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
      }
    } catch (err: unknown) {
      const e = err as { errors?: Array<{ message?: string }>; message?: string };
      setError(e.errors?.[0]?.message || t('auth.invalidCode'));
    } finally {
      setLoading(false);
    }
  };

  if (needs2FA) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]}>
        <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss} accessible={false}>
          <KeyboardAvoidingView style={styles.inner} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable onPress={() => { setNeeds2FA(false); setTwoFACode(''); setError(''); }} style={{ alignSelf: 'flex-start', padding: spacing.sm }} accessibilityRole="button">
              <Icon name="arrow-left" size="md" color={tc.text.secondary} />
            </Pressable>
            <View style={styles.logoSection}>
              <Icon name="lock" size="xl" color={colors.emerald} />
              <Text style={[styles.tagline, { marginTop: spacing.md, color: tc.text.secondary }]}>{t('auth.twoFactorRequired')}</Text>
            </View>
            <View style={styles.form}>
              <View style={[styles.inputRow, { backgroundColor: tc.bgElevated, borderColor: tc.border }]}>
                <Icon name="lock" size="sm" color={tc.text.tertiary} />
                <TextInput
                  style={[styles.inputInner, { color: tc.text.primary }]}
                  placeholder={t('auth.verificationCode')}
                  placeholderTextColor={tc.text.tertiary}
                  value={twoFACode}
                  onChangeText={(v) => setTwoFACode(v.replace(/[^0-9]/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                />
              </View>
              {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
              <GradientButton label={t('auth.verify')} onPress={handle2FAVerify} loading={loading} disabled={twoFACode.length < 6} fullWidth />
            </View>
          </KeyboardAvoidingView>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]}>
      <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Decorative gradient behind logo */}
        <View style={styles.bgGlow}>
          <LinearGradient
            colors={[colors.active.emerald20, 'transparent']}
            style={{ width: Dimensions.get('window').width * 0.6, height: Dimensions.get('window').width * 0.6, borderRadius: radius.full }}
            start={{ x: 0.5, y: 0.5 }}
            end={{ x: 1, y: 1 }}
          />
        </View>

        {/* Logo */}
        <Animated.View style={[styles.logoSection, logoAnimStyle]}>
          <Text style={styles.logo}>Mizanly</Text>
          <Text style={styles.logoArabic}>ميزانلي</Text>
          <Text style={[styles.tagline, { color: tc.text.secondary }]}>{t('auth.tagline')}</Text>
        </Animated.View>

        {/* Form */}
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

          {/* Password input with icon + show/hide toggle */}
          <View style={[styles.inputRow, { backgroundColor: tc.bgElevated, borderColor: tc.border }, passwordFocused && styles.inputRowFocused]}>
            <Icon
              name="lock"
              size="sm"
              color={passwordFocused ? colors.emerald : tc.text.tertiary}
            />
            <TextInput
              style={[styles.inputInner, { color: tc.text.primary }]}
              placeholder={t('auth.passwordPlaceholder')}
              placeholderTextColor={tc.text.tertiary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoComplete="password"
              textContentType="password"
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={12}
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              accessibilityRole="button"
            >
              <Icon
                name={showPassword ? 'eye-off' : 'eye'}
                size="sm"
                color={tc.text.tertiary}
              />
            </Pressable>
          </View>

          {error ? (
            <Text style={styles.error} accessibilityRole="alert">{error}</Text>
          ) : null}

          {/* Forgot password */}
          <Pressable
            onPress={() => navigate('/(auth)/forgot-password')}
            style={styles.forgotBtn}
            hitSlop={8}
            accessibilityRole="link"
          >
            <Text style={[styles.forgotText, { color: tc.text.secondary }]}>{t('auth.forgotPassword') || 'Forgot password?'}</Text>
          </Pressable>

          <GradientButton
            label={t('auth.signIn')}
            onPress={handleSignIn}
            loading={loading}
            disabled={!email || !password}
            fullWidth
          />

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
          <Text style={[styles.footerText, { color: tc.text.secondary }]}>{t('auth.dontHaveAccount')}</Text>
          <Pressable
            onPress={() => router.replace('/(auth)/sign-up')}
            hitSlop={8}
            accessibilityRole="link"
          >
            <Text style={styles.footerLink}>{t('auth.signUp')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      </Pressable>
    </SafeAreaView>
  );
}

export default function SignInScreen() {
  return (
    <ScreenErrorBoundary>
      <SignInScreenContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  inner: { flex: 1, paddingHorizontal: spacing.xl, justifyContent: 'center' },
  bgGlow: {
    position: 'absolute',
    top: '15%',
    alignSelf: 'center',
    opacity: 0.5,
  },
  logoSection: { alignItems: 'center', marginBottom: spacing['3xl'] },
  logo: { color: colors.emerald, fontSize: 42, fontFamily: fonts.headingBold, letterSpacing: -1 },
  logoArabic: { color: colors.gold, fontSize: fontSize.xl, marginTop: spacing.xs },
  tagline: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: spacing.sm },
  form: { gap: spacing.md },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dark.bgElevated,
    borderWidth: 1,
    borderColor: colors.dark.border,
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
  error: { color: colors.error, fontSize: fontSize.sm, textAlign: 'center' },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  dividerLine: { flex: 1, height: 0.5, backgroundColor: colors.dark.border },
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
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  socialBtnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  socialText: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '500' },
  comingSoonText: { color: colors.text.tertiary, fontSize: fontSize.xs },
  comingSoonBadge: { color: colors.text.tertiary, fontSize: 10 },
  forgotBtn: { alignSelf: 'flex-end', marginTop: -spacing.xs },
  forgotText: { color: colors.text.secondary, fontSize: fontSize.sm },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing['2xl'] },
  footerText: { color: colors.text.secondary, fontSize: fontSize.sm },
  footerLink: { color: colors.gold, fontSize: fontSize.sm, fontWeight: '600' },
});
