import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Pressable,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSignIn } from '@clerk/clerk-expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { GradientButton } from '@/components/ui/GradientButton';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius, animation } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const { t } = useTranslation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

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
      }
    } catch (err: unknown) {
      console.error('Sign in error:', JSON.stringify(err, null, 2));
      const e = err as { errors?: Array<{ longMessage?: string; message?: string }>; message?: string };
      setError(e.errors?.[0]?.longMessage || e.errors?.[0]?.message || e.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
          <Text style={styles.logo}>Mizanly</Text>
          <Text style={styles.logoArabic}>ميزانلي</Text>
          <Text style={styles.tagline}>{t('auth.tagline')}</Text>
        </Animated.View>

        {/* Form */}
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
              placeholder={t('auth.passwordPlaceholder')}
              placeholderTextColor={colors.text.tertiary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <GradientButton
            label={t('auth.signIn')}
            onPress={handleSignIn}
            loading={loading}
            disabled={!email || !password}
            fullWidth
          />

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
          <Text style={styles.footerText}>{t('auth.dontHaveAccount')}</Text>
          <TouchableOpacity onPress={() => router.replace('/(auth)/sign-up')}>
            <Text style={styles.footerLink}>{t('auth.signUp')}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  logo: { color: colors.emerald, fontSize: 42, fontFamily: 'PlayfairDisplay-Bold', letterSpacing: -1 },
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
  socialText: { color: colors.text.primary, fontSize: fontSize.sm },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing['2xl'] },
  footerText: { color: colors.text.secondary, fontSize: fontSize.sm },
  footerLink: { color: colors.gold, fontSize: fontSize.sm, fontWeight: '600' },
});
