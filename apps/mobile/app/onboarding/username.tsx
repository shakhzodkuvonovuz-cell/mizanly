import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  cancelAnimation,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius, animation } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { authApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const USERNAME_RE = /^[a-z][a-z0-9._]{1,28}[a-z0-9]$/;

function UsernameScreenContent() {
  const router = useRouter();
  const { t } = useTranslation();
  const tc = useThemeColors();
  const [username, setUsername] = useState('');
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const debouncedUsername = useDebounce(username, 500);

  // Animated progress bar (step 1 = 25%)
  const progressWidth = useSharedValue(0);
  useEffect(() => {
    progressWidth.value = withSpring(25, animation.spring.responsive);
  }, []);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  // Spinning loader animation
  const rotation = useSharedValue(0);
  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  useEffect(() => {
    if (checking) {
      rotation.value = withRepeat(
        withTiming(360, { duration: 800 }),
        -1,
        false
      );
    } else {
      cancelAnimation(rotation);
      rotation.value = 0;
    }
  }, [checking]);

  // Checkmark bounce animation
  const checkScale = useSharedValue(0);
  useEffect(() => {
    if (available === true) {
      checkScale.value = withSpring(1, animation.spring.bouncy);
    } else {
      checkScale.value = 0;
    }
  }, [available]);

  const checkAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  // Preview card fade animation
  const previewOpacity = useSharedValue(0);
  useEffect(() => {
    if (available === true && USERNAME_RE.test(username)) {
      previewOpacity.value = withTiming(1, { duration: 300 });
    } else {
      previewOpacity.value = 0;
    }
  }, [available, username]);

  const previewFadeStyle = useAnimatedStyle(() => ({
    opacity: previewOpacity.value,
  }));

  useEffect(() => {
    setAvailable(null);
    if (!USERNAME_RE.test(debouncedUsername)) return;
    let cancelled = false;
    setChecking(true);
    authApi.checkUsername(debouncedUsername)
      .then((res) => { if (!cancelled) setAvailable(res.available); })
      .catch(() => { if (!cancelled) setAvailable(null); })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [debouncedUsername]);

  const isValid = USERNAME_RE.test(username) && available === true;

  const handleContinue = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      // Register username + display name in the backend
      await authApi.register({ username, displayName: username });
      router.push('/onboarding/interests');
    } catch {
      // Continue even if registration fails — webhook may create the user
      router.push('/onboarding/interests');
    } finally {
      setLoading(false);
    }
  };

  const statusText = () => {
    if (username.length < 3) return null;
    if (!USERNAME_RE.test(username)) return { text: t('onboarding.username.validation.invalidChars'), color: colors.error };
    if (checking) return { text: t('onboarding.username.checking'), color: colors.text.secondary };
    if (available === true) return { text: `@${username} ${t('onboarding.username.available')}`, color: colors.emerald };
    if (available === false) return { text: t('onboarding.username.taken'), color: colors.error };
    return null;
  };

  const status = statusText();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]}>
      <View style={styles.inner}>
        {/* Animated progress bar */}
        <View style={[styles.progressTrack, { backgroundColor: tc.border }]}>
          <Animated.View style={[styles.progressFill, progressStyle]} />
        </View>

        <Text style={styles.title}>{t('onboarding.username.title')}</Text>
        <Text style={styles.subtitle}>{t('onboarding.username.subtitle')}</Text>

        <View style={[styles.inputWrap, { backgroundColor: tc.bgElevated, borderColor: tc.border }]}>
          <Text style={styles.at}>@</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
            placeholder={t('onboarding.username.placeholder')}
            placeholderTextColor={colors.text.tertiary}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={30}
          />
          {checking && (
            <Animated.View style={spinStyle}>
              <Icon name="loader" size="sm" color={colors.text.secondary} />
            </Animated.View>
          )}
          {!checking && available === true && (
            <Animated.View style={checkAnimStyle}>
              <Icon name="check-circle" size="sm" color={colors.emerald} />
            </Animated.View>
          )}
          {!checking && available === false && (
            <Icon name="x" size="sm" color={colors.error} />
          )}
        </View>

        {status && (
          <View style={styles.statusRow}>
            <Text style={[styles.status, { color: status.color }]}>{status.text}</Text>
          </View>
        )}

        {/* Username preview card */}
        <Animated.View style={[styles.previewCard, { backgroundColor: tc.bgCard, borderColor: tc.border }, previewFadeStyle]}>
          <Text style={styles.previewText}>{t('onboarding.username.preview', { username })}</Text>
        </Animated.View>

        <View style={styles.btnWrap}>
          <GradientButton
            label={t('common.continue')}
            onPress={handleContinue}
            loading={loading}
            disabled={!isValid}
            fullWidth
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function UsernameScreen() {
  return (
    <ScreenErrorBoundary>
      <UsernameScreenContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  inner: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing['2xl'] },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.dark.border,
    marginBottom: spacing['3xl'],
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.emerald,
  },
  title: { color: colors.text.primary, fontSize: fontSize.xl, fontWeight: '700', marginBottom: spacing.sm },
  subtitle: { color: colors.text.secondary, fontSize: fontSize.base, marginBottom: spacing['2xl'] },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark.bgElevated,
    borderWidth: 1,
    borderColor: colors.dark.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    minHeight: 52,
    gap: spacing.xs,
  },
  at: { color: colors.text.secondary, fontSize: fontSize.base },
  input: { flex: 1, paddingVertical: spacing.md, color: colors.text.primary, fontSize: fontSize.base },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  status: { fontSize: fontSize.sm },
  previewCard: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.dark.border,
  },
  previewText: { color: colors.text.secondary, fontSize: fontSize.sm },
  btnWrap: {
    marginTop: 'auto',
    marginBottom: spacing.xl,
  },
});
