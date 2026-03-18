import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Pressable,
  KeyboardAvoidingView, Platform, ScrollView,
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
import { colors, spacing, fontSize, radius, animation } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';

export default function SignUpScreen() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const router = useRouter();
  const { t } = useTranslation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const hiddenInputRef = useRef<TextInput>(null);

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

  // Password strength
  const strength = password.length === 0
    ? 0
    : password.length < 6
      ? 1
      : password.length < 8
        ? 2
        : /[A-Z]/.test(password) && /[0-9]/.test(password)
          ? 4
          : 3;

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
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.inner}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Animated envelope icon */}
          <Animated.View style={[styles.verifyIconWrap, envelopeAnimStyle]}>
            <Icon name="mail" size="xl" color={colors.emerald} />
          </Animated.View>

          <Text style={styles.title}>{t('auth.checkEmail')}</Text>
          <Text style={styles.subtitle}>
            {t('auth.verificationSent')}{'\n'}
            <Text style={styles.emailHighlight}>{email}</Text>
          </Text>

          <View style={styles.form}>
            {/* Digit boxes with hidden input */}
            <Pressable
              onPress={() => hiddenInputRef.current?.focus()}
              style={styles.codeRow}
            >
              {digits.map((d, i) => (
                <View
                  key={i}
                  style={[
                    styles.digitBox,
                    i === code.length && styles.digitBoxActive,
                  ]}
                >
                  <Text style={styles.digitText}>{d}</Text>
                </View>
              ))}
            </Pressable>
            <TextInput
              ref={hiddenInputRef}
              style={{ position: 'absolute', opacity: 0 }}
              value={code}
              onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Text style={styles.hintText}>{t('auth.checkSpam')}</Text>

            <GradientButton
              label={t('auth.verifyEmail')}
              onPress={handleVerify}
              loading={loading}
              disabled={code.length < 6}
              fullWidth
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          keyboardShouldPersistTaps="handled"
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
            <Text style={styles.logo}>{t('auth.joinTitle')}</Text>
            <Text style={styles.tagline}>{t('auth.tagline')}</Text>
          </Animated.View>

          <View style={styles.form}>
            {/* Email input with icon */}
            <View style={[styles.inputRow, emailFocused && styles.inputRowFocused]}>
              <Icon
                name="mail"
                size="sm"
                color={emailFocused ? colors.emerald : colors.text.tertiary}
              />
              <TextInput
                style={styles.inputInner}
                placeholder={t('auth.emailPlaceholder')}
                placeholderTextColor={colors.text.tertiary}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
              />
            </View>

            {/* Password input with icon */}
            <View style={[styles.inputRow, passwordFocused && styles.inputRowFocused]}>
              <Icon
                name="lock"
                size="sm"
                color={passwordFocused ? colors.emerald : colors.text.tertiary}
              />
              <TextInput
                style={styles.inputInner}
                placeholder={t('auth.passwordPlaceholderMin')}
                placeholderTextColor={colors.text.tertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
              />
            </View>

            {/* Password strength indicator */}
            <View style={styles.strengthRow}>
              {[1, 2, 3, 4].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.strengthBar,
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

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <GradientButton
              label={t('auth.createAccount')}
              onPress={handleSignUp}
              loading={loading}
              disabled={!email || password.length < 8}
              fullWidth
            />

            <Text style={styles.terms}>
              {t('auth.termsAgreement')}
            </Text>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{t('auth.or')}</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Social auth placeholder */}
            <View style={styles.socialRow}>
              <Pressable style={styles.socialBtn}>
                <Icon name="globe" size="sm" color={colors.text.primary} />
                <Text style={styles.socialText}>{t('auth.google')}</Text>
              </Pressable>
              <Pressable style={styles.socialBtn}>
                <Icon name="lock" size="sm" color={colors.text.primary} />
                <Text style={styles.socialText}>{t('auth.apple')}</Text>
              </Pressable>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>{t('auth.alreadyHaveAccount')}</Text>
            <TouchableOpacity onPress={() => router.replace('/(auth)/sign-in')}>
              <Text style={styles.footerLink}>{t('auth.signIn')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  inner: { flex: 1, paddingHorizontal: spacing.xl, justifyContent: 'center' },
  bgGlow: {
    position: 'absolute',
    top: '12%',
    alignSelf: 'center',
    opacity: 0.5,
  },
  logoSection: { alignItems: 'center', marginBottom: spacing['3xl'] },
  logo: { color: colors.text.primary, fontSize: 32, fontFamily: 'PlayfairDisplay-Bold' },
  tagline: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: spacing.sm },
  title: { color: colors.text.primary, fontSize: fontSize.xl, fontWeight: '700', textAlign: 'center', marginBottom: spacing.sm },
  subtitle: { color: colors.text.secondary, fontSize: fontSize.base, textAlign: 'center', lineHeight: 24, marginBottom: spacing['2xl'] },
  emailHighlight: { color: colors.emerald, fontWeight: '700' },
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
    paddingVertical: spacing.md,
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
    gap: 4,
    marginTop: spacing.xs,
  },
  strengthBar: {
    flex: 1,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.dark.border,
  },
  error: { color: colors.error, fontSize: fontSize.sm, textAlign: 'center' },
  terms: { color: colors.text.tertiary, fontSize: fontSize.xs, textAlign: 'center', lineHeight: 18 },
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
  socialText: { color: colors.text.primary, fontSize: fontSize.sm },
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
    backgroundColor: colors.dark.bgElevated,
    borderWidth: 1.5,
    borderColor: colors.dark.border,
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
});
