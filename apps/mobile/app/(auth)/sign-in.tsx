import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSignIn } from '@clerk/clerk-expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius } from '@/theme';

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const handleSignIn = async () => {
    if (!isLoaded) return;
    setLoading(true);
    setError('');

    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
      }
    } catch (err: any) {
      setError(err.errors?.[0]?.message || 'Sign in failed');
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
        {/* Logo */}
        <View style={styles.logoSection}>
          <Text style={styles.logo}>Mizanly</Text>
          <Text style={styles.logoArabic}>ميزانلي</Text>
          <Text style={styles.tagline}>The Muslim social platform</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <TextInput
            style={[styles.input, emailFocused && styles.inputFocused]}
            placeholder="Email address"
            placeholderTextColor={colors.text.tertiary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            onFocus={() => setEmailFocused(true)}
            onBlur={() => setEmailFocused(false)}
          />
          <TextInput
            style={[styles.input, passwordFocused && styles.inputFocused]}
            placeholder="Password"
            placeholderTextColor={colors.text.tertiary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <GradientButton
            label="Sign In"
            onPress={handleSignIn}
            loading={loading}
            disabled={!email || !password}
            fullWidth
          />
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => router.replace('/(auth)/sign-up')}>
            <Text style={styles.footerLink}>Sign up</Text>
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
  logo: { color: colors.emerald, fontSize: 42, fontFamily: 'PlayfairDisplay-Bold', letterSpacing: -1 },
  logoArabic: { color: colors.gold, fontSize: fontSize.xl, marginTop: spacing.xs },
  tagline: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: spacing.sm },
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
  inputFocused: {
    borderColor: colors.emerald,
  },
  error: { color: colors.error, fontSize: fontSize.sm, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing['2xl'] },
  footerText: { color: colors.text.secondary, fontSize: fontSize.sm },
  footerLink: { color: colors.gold, fontSize: fontSize.sm, fontWeight: '600' },
});
