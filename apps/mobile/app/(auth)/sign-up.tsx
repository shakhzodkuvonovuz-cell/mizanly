import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSignUp } from '@clerk/clerk-expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, fontSize, radius } from '@/theme';

export default function SignUpScreen() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignUp = async () => {
    if (!isLoaded) return;
    setLoading(true);
    setError('');

    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (err: any) {
      setError(err.errors?.[0]?.message || 'Sign up failed');
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
        // AuthGuard will redirect to onboarding automatically
      }
    } catch (err: any) {
      setError(err.errors?.[0]?.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  if (pendingVerification) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.inner}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>
            We sent a verification code to{'\n'}{email}
          </Text>
          <View style={styles.form}>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="000000"
              placeholderTextColor={colors.text.tertiary}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
              textAlign="center"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleVerify}
              disabled={loading || code.length < 6}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnText}>Verify Email</Text>}
            </TouchableOpacity>
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
        <View style={styles.logoSection}>
          <Text style={styles.logo}>Join Mizanly</Text>
          <Text style={styles.tagline}>The Muslim social platform</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email address"
            placeholderTextColor={colors.text.tertiary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <TextInput
            style={styles.input}
            placeholder="Password (min 8 characters)"
            placeholderTextColor={colors.text.tertiary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleSignUp}
            disabled={loading || !email || password.length < 8}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Create Account</Text>}
          </TouchableOpacity>

          <Text style={styles.terms}>
            By signing up you agree to our Terms of Service and Privacy Policy
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.replace('/(auth)/sign-in')}>
            <Text style={styles.footerLink}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  inner: { flex: 1, paddingHorizontal: spacing.xl, justifyContent: 'center' },
  logoSection: { alignItems: 'center', marginBottom: spacing['3xl'] },
  logo: { color: colors.text.primary, fontSize: 32, fontWeight: '700' },
  tagline: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: spacing.sm },
  title: { color: colors.text.primary, fontSize: fontSize.xl, fontWeight: '700', textAlign: 'center', marginBottom: spacing.sm },
  subtitle: { color: colors.text.secondary, fontSize: fontSize.base, textAlign: 'center', lineHeight: 24, marginBottom: spacing['2xl'] },
  form: { gap: spacing.md },
  input: {
    backgroundColor: colors.dark.bgElevated,
    borderWidth: 1,
    borderColor: colors.dark.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    color: colors.text.primary,
    fontSize: fontSize.base,
  },
  codeInput: { fontSize: 28, letterSpacing: 12, fontWeight: '700' },
  error: { color: colors.error, fontSize: fontSize.sm, textAlign: 'center' },
  btn: {
    backgroundColor: colors.emerald,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },
  terms: { color: colors.text.tertiary, fontSize: fontSize.xs, textAlign: 'center', lineHeight: 18 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing['2xl'] },
  footerText: { color: colors.text.secondary, fontSize: fontSize.sm },
  footerLink: { color: colors.emerald, fontSize: fontSize.sm, fontWeight: '600' },
});
