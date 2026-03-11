import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { Image } from 'expo-image';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { usersApi } from '@/services/api';

const STEP = 2; // Step 2 of 4 in onboarding

export default function OnboardingProfileScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { username } = useLocalSearchParams<{ username: string }>();
  const [displayName, setDisplayName] = useState(user?.fullName ?? '');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleContinue = async () => {
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setError('Display name is required');
      return;
    }
    if (trimmedName.length < 2 || trimmedName.length > 50) {
      setError('Name must be 2–50 characters');
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
      setError('Failed to save. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Progress dots */}
      <View style={styles.dots}>
        {[1, 2, 3, 4].map((n) => (
          <View key={n} style={[styles.dot, n <= STEP && styles.dotActive]} />
        ))}
      </View>

      <Text style={styles.title}>Set up your profile</Text>
      <Text style={styles.subtitle}>How should people know you?</Text>

      {/* Avatar (read-only from Clerk, changeable later in settings) */}
      {user?.imageUrl ? (
        <Image
          source={{ uri: user.imageUrl }}
          style={styles.avatar}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarInitial}>
            {(displayName[0] || '?').toUpperCase()}
          </Text>
        </View>
      )}
      <Text style={styles.avatarHint}>
        You can change your photo from Settings later
      </Text>

      {/* Display name */}
      <View style={styles.field}>
        <Text style={styles.label}>Display Name</Text>
        <TextInput
          style={styles.input}
          value={displayName}
          onChangeText={(t) => { setDisplayName(t); setError(''); }}
          placeholder="Your name"
          placeholderTextColor={colors.text.tertiary}
          maxLength={50}
          autoFocus
          returnKeyType="next"
        />
      </View>

      {/* Bio */}
      <View style={styles.field}>
        <Text style={styles.label}>Bio <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput
          style={[styles.input, styles.bioInput]}
          value={bio}
          onChangeText={setBio}
          placeholder="Tell people a bit about yourself…"
          placeholderTextColor={colors.text.tertiary}
          multiline
          maxLength={150}
        />
        <View style={styles.charCountWrap}><CharCountRing current={bio.length} max={150} size={24} /></View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <GradientButton
        label="Continue"
        onPress={handleContinue}
        loading={loading}
        disabled={!displayName.trim()}
        fullWidth
      />

      <View style={styles.skipBtn}>
        <GradientButton
          label="Skip for now"
          onPress={() => router.push('/onboarding/interests')}
          variant="ghost"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: colors.dark.bg,
    alignItems: 'center', paddingHorizontal: spacing.xl,
    paddingTop: 60,
  },
  dots: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl },
  dot: { width: 8, height: 8, borderRadius: radius.sm, backgroundColor: colors.dark.border },
  dotActive: { backgroundColor: colors.emerald, width: 20 },
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
  avatarPlaceholder: {
    backgroundColor: colors.dark.bgElevated,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.emerald,
    borderStyle: 'dashed',
  },
  avatarInitial: {
    color: colors.text.primary, fontSize: fontSize.xl, fontWeight: '700',
  },
  avatarHint: {
    color: colors.text.tertiary, fontSize: fontSize.xs,
    marginBottom: spacing.xl,
  },
  field: { width: '100%', marginBottom: spacing.lg },
  label: { color: colors.text.secondary, fontSize: fontSize.sm, marginBottom: spacing.xs, fontWeight: '600' },
  optional: { color: colors.text.tertiary, fontWeight: '400' },
  input: {
    backgroundColor: colors.dark.bgElevated, borderRadius: radius.lg,
    color: colors.text.primary, fontSize: fontSize.base,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderWidth: 1, borderColor: colors.dark.border,
  },
  bioInput: { height: 80, textAlignVertical: 'top' },
  charCountWrap: { alignItems: 'flex-end', marginTop: spacing.xs },
  error: {
    color: colors.error, fontSize: fontSize.sm,
    marginBottom: spacing.md, textAlign: 'center',
  },
  skipBtn: { marginTop: spacing.lg, alignItems: 'center' },
});
