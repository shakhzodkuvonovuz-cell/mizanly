import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { GradientButton } from '@/components/ui/GradientButton';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius, animation } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { usersApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

const STEP = 2; // Step 2 of 2 in onboarding (if profile screen is re-enabled)

function OnboardingProfileScreenContent() {
  const router = useRouter();
  const { user } = useUser();
  const { username } = useLocalSearchParams<{ username: string }>();
  const { t } = useTranslation();
  const tc = useThemeColors();
  const [displayName, setDisplayName] = useState(user?.fullName ?? '');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nameFocused, setNameFocused] = useState(false);
  const [bioFocused, setBioFocused] = useState(false);

  // Animated progress bar (step 2 of 4 = 50%)
  const progressWidth = useSharedValue(0);
  useEffect(() => {
    progressWidth.value = withSpring(50, animation.spring.responsive);
  }, []);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  // Avatar placeholder pulse animation
  const pulseScale = useSharedValue(1);
  useEffect(() => {
    if (!user?.imageUrl) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 1200 }),
          withTiming(1, { duration: 1200 })
        ),
        -1,
        true
      );
    }
    return () => {
      // Cleanup handled automatically
    };
  }, [user?.imageUrl]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const handleContinue = async () => {
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setError(t('onboarding.profile.errors.nameRequired'));
      return;
    }
    if (trimmedName.length < 2 || trimmedName.length > 50) {
      setError(t('onboarding.profile.errors.nameLength'));
      return;
    }

    setLoading(true);
    setError('');
    try {
      await usersApi.updateMe({
        displayName: trimmedName,
        username: username,
        bio: bio.trim() || undefined,
      });
      router.push('/onboarding/interests');
    } catch {
      setError(t('onboarding.profile.errors.saveFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]}>
      {/* Animated progress bar */}
      <View style={[styles.progressTrack, { backgroundColor: tc.border }]}>
        <Animated.View style={[styles.progressFill, progressStyle]} />
      </View>

      <Text style={[styles.title, { color: tc.text.primary }]}>{t('onboarding.profile.title')}</Text>
      <Text style={[styles.subtitle, { color: tc.text.secondary }]}>{t('onboarding.profile.subtitle')}</Text>

      {/* Avatar (read-only from Clerk, changeable later in settings) */}
      {user?.imageUrl ? (
        <ProgressiveImage
          uri={user.imageUrl}
          width={96}
          height={96}
          borderRadius={radius.full}
        />
      ) : (
        <Animated.View style={[styles.avatarPlaceholderWrap, pulseStyle]}>
          <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: tc.bgElevated }]}>
            <Icon name="user" size="lg" color={tc.text.tertiary} />
          </View>
        </Animated.View>
      )}
      <Text style={[styles.avatarHint, { color: tc.text.tertiary }]}>
        {t('onboarding.profile.avatarHint')}
      </Text>

      {/* Display name with icon */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: tc.text.secondary }]}>{t('onboarding.profile.displayName')}</Text>
        <View style={[styles.inputRow, { backgroundColor: tc.bgElevated, borderColor: tc.border }, nameFocused && styles.inputRowFocused]}>
          <Icon
            name="user"
            size="sm"
            color={nameFocused ? colors.emerald : tc.text.tertiary}
          />
          <TextInput
            style={[styles.inputInner, { color: tc.text.primary }]}
            value={displayName}
            onChangeText={(text) => { setDisplayName(text); setError(''); }}
            placeholder={t('onboarding.profile.namePlaceholder')}
            placeholderTextColor={tc.text.tertiary}
            maxLength={50}
            autoFocus
            returnKeyType="next"
            onFocus={() => setNameFocused(true)}
            onBlur={() => setNameFocused(false)}
          />
        </View>
      </View>

      {/* Bio with focus glow */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: tc.text.secondary }]}>{t('onboarding.profile.bioLabel')} <Text style={[styles.optional, { color: tc.text.tertiary }]}>{t('onboarding.profile.optional')}</Text></Text>
        <View style={[styles.bioRow, { backgroundColor: tc.bgElevated, borderColor: tc.border }, bioFocused && styles.bioRowFocused]}>
          <TextInput
            style={[styles.inputInner, styles.bioInput]}
            value={bio}
            onChangeText={setBio}
            placeholder={t('onboarding.profile.bioPlaceholder')}
            placeholderTextColor={tc.text.tertiary}
            multiline
            maxLength={150}
            onFocus={() => setBioFocused(true)}
            onBlur={() => setBioFocused(false)}
          />
        </View>
        <View style={styles.charCountWrap}><CharCountRing current={bio.length} max={150} size={24} /></View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <GradientButton
        label={t('common.continue')}
        onPress={handleContinue}
        loading={loading}
        disabled={!displayName.trim()}
        fullWidth
      />

      <View style={styles.skipBtn}>
        <GradientButton
          label={t('onboarding.profile.skip')}
          onPress={() => router.push('/onboarding/interests')}
          variant="ghost"
        />
      </View>
    </SafeAreaView>
  );
}

export default function OnboardingProfileScreen() {
  return (
    <ScreenErrorBoundary>
      <OnboardingProfileScreenContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center', paddingHorizontal: spacing.xl,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.xl,
    overflow: 'hidden',
    width: '100%',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.emerald,
  },
  title: {
    color: colors.text.primary, fontSize: fontSize.xl,
    fontWeight: '700', textAlign: 'center', marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.text.secondary, fontSize: fontSize.base,
    textAlign: 'center', marginBottom: spacing.xl,
  },
  avatar: {
    width: 96, height: 96, borderRadius: radius.full, marginBottom: spacing.sm,
  },
  avatarPlaceholderWrap: {
    marginBottom: spacing.sm,
  },
  avatarPlaceholder: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.emerald,
    borderStyle: 'dashed',
    marginBottom: 0,
  },
  avatarHintInner: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  avatarHint: {
    color: colors.text.tertiary, fontSize: fontSize.xs,
    marginBottom: spacing.xl,
  },
  field: { width: '100%', marginBottom: spacing.lg },
  label: { color: colors.text.secondary, fontSize: fontSize.sm, marginBottom: spacing.xs, fontWeight: '600' },
  optional: { color: colors.text.tertiary, fontWeight: '400' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderWidth: 1,
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
  bioRow: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  bioRowFocused: {
    borderColor: colors.emerald,
    shadowColor: colors.emerald,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  bioInput: { height: 80, textAlignVertical: 'top' },
  charCountWrap: { alignItems: 'flex-end', marginTop: spacing.xs },
  error: {
    color: colors.error, fontSize: fontSize.sm,
    marginBottom: spacing.md, textAlign: 'center',
  },
  skipBtn: { marginTop: spacing.lg, alignItems: 'center' },
});
