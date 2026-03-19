import { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable,
  KeyboardAvoidingView, Platform, Keyboard, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSignIn } from '@clerk/clerk-expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GradientButton } from '@/components/ui/GradientButton';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

type Step = 'email' | 'code' | 'newPassword';

export default function ForgotPasswordScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSendCode = async () => {
    if (!isLoaded || !email.trim()) return;
    setLoading(true);
    setError('');
    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email.trim(),
      });
      setStep('code');
    } catch (err: unknown) {
      const e = err as { errors?: Array<{ longMessage?: string; message?: string }>; message?: string };
      setError(e.errors?.[0]?.longMessage || e.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!isLoaded || !code.trim()) return;
    setLoading(true);
    setError('');
    try {
      await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: code.trim(),
      });
      setStep('newPassword');
    } catch (err: unknown) {
      const e = err as { errors?: Array<{ longMessage?: string; message?: string }>; message?: string };
      setError(e.errors?.[0]?.longMessage || e.message || t('auth.invalidCode'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!isLoaded) return;
    if (newPassword !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    if (newPassword.length < 8) {
      setError(t('auth.passwordTooShort'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await signIn.resetPassword({ password: newPassword });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        Alert.alert(t('common.success'), t('auth.passwordResetSuccess'));
      }
    } catch (err: unknown) {
      const e = err as { errors?: Array<{ longMessage?: string; message?: string }>; message?: string };
      setError(e.errors?.[0]?.longMessage || e.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={styles.container}>
        <GlassHeader
          title={t('auth.resetPassword')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.goBack') }}
        />
        <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss} accessible={false}>
          <KeyboardAvoidingView
            style={styles.inner}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {step === 'email' && (
              <View style={styles.form}>
                <Text style={styles.heading}>{t('auth.resetPassword')}</Text>
                <Text style={styles.subtitle}>{t('auth.resetPasswordHint')}</Text>
                <View style={styles.inputRow}>
                  <Icon name="mail" size="sm" color={colors.text.tertiary} />
                  <TextInput
                    style={styles.inputInner}
                    placeholder={t('auth.email')}
                    placeholderTextColor={colors.text.tertiary}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                  />
                </View>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <GradientButton
                  label={t('auth.sendCode')}
                  onPress={handleSendCode}
                  loading={loading}
                  disabled={!email.trim()}
                  fullWidth
                />
              </View>
            )}

            {step === 'code' && (
              <View style={styles.form}>
                <Text style={styles.heading}>{t('auth.verificationCode')}</Text>
                <Text style={styles.subtitle}>{t('auth.codeSentTo')} {email}</Text>
                <View style={styles.inputRow}>
                  <Icon name="lock" size="sm" color={colors.text.tertiary} />
                  <TextInput
                    style={styles.inputInner}
                    placeholder={t('auth.verificationCode')}
                    placeholderTextColor={colors.text.tertiary}
                    value={code}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                  />
                </View>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <GradientButton
                  label={t('auth.verify')}
                  onPress={handleVerifyCode}
                  loading={loading}
                  disabled={!code.trim()}
                  fullWidth
                />
                <Pressable onPress={handleSendCode} hitSlop={8} style={styles.resendBtn}>
                  <Text style={styles.resendText}>{t('auth.resendCode')}</Text>
                </Pressable>
              </View>
            )}

            {step === 'newPassword' && (
              <View style={styles.form}>
                <Text style={styles.heading}>{t('auth.newPassword')}</Text>
                <View style={styles.inputRow}>
                  <Icon name="lock" size="sm" color={colors.text.tertiary} />
                  <TextInput
                    style={styles.inputInner}
                    placeholder={t('auth.newPassword')}
                    placeholderTextColor={colors.text.tertiary}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry
                  />
                </View>
                <View style={styles.inputRow}>
                  <Icon name="lock" size="sm" color={colors.text.tertiary} />
                  <TextInput
                    style={styles.inputInner}
                    placeholder={t('auth.confirmPassword')}
                    placeholderTextColor={colors.text.tertiary}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                  />
                </View>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <GradientButton
                  label={t('auth.resetPassword')}
                  onPress={handleResetPassword}
                  loading={loading}
                  disabled={!newPassword || !confirmPassword}
                  fullWidth
                />
              </View>
            )}
          </KeyboardAvoidingView>
        </Pressable>
      </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  inner: { flex: 1, paddingHorizontal: spacing.xl, justifyContent: 'center' },
  form: { gap: spacing.md },
  heading: { color: colors.text.primary, fontSize: fontSize.xl, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: colors.text.secondary, fontSize: fontSize.sm, textAlign: 'center', marginBottom: spacing.md },
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
  inputInner: { flex: 1, color: colors.text.primary, fontSize: fontSize.base },
  error: { color: colors.error, fontSize: fontSize.sm, textAlign: 'center' },
  resendBtn: { alignSelf: 'center', marginTop: spacing.sm },
  resendText: { color: colors.emerald, fontSize: fontSize.sm, fontWeight: '500' },
});
