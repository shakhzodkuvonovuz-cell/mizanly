import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput,
  ScrollView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { showToast } from '@/components/ui/Toast';
import { broadcastApi, uploadApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

// Slugify helper
const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

export default function CreateBroadcastScreen() {
  const router = useRouter();
  const tc = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  // Form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);

  // Auto-generate slug from name
  useEffect(() => {
    if (name.trim()) {
      const generated = slugify(name);
      setSlug(generated);
    }
  }, [name]);

  // Avatar picker
  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (!result.canceled) setAvatarUri(result.assets[0].uri);
  };

  // Upload avatar if selected
  const uploadAvatar = async (uri: string): Promise<string> => {
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const contentType = `image/${ext}`;
    const { uploadUrl, publicUrl } = await uploadApi.getPresignUrl(contentType, 'broadcast');
    const fileRes = await fetch(uri);
    const blob = await fileRes.blob();
    const res = await fetch(uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': contentType } });
    if (!res.ok) throw new Error('Image upload failed');
    return publicUrl;
  };

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      setUploading(!!avatarUri);
      let avatarUrl: string | undefined;
      if (avatarUri) {
        avatarUrl = await uploadAvatar(avatarUri);
      }
      setUploading(false);
      return broadcastApi.create({
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim() || undefined,
        avatarUrl,
      });
    },
    onSuccess: (channel) => {
      router.replace(`/(screens)/broadcast/${channel.id}`);
    },
    onError: (err: Error) => {
      setUploading(false);
      showToast({ message: err.message || t('createBroadcast.createError'), variant: 'error' });
    },
  });

  // Validation
  const isValid = name.trim().length >= 1 && slug.trim().length >= 1 && !createMutation.isPending && !uploading;
  const nameCount = name.length;
  const slugCount = slug.length;
  const descCount = description.length;

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('createBroadcast.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />
        <ScrollView
          style={styles.body}
          contentContainerStyle={{ paddingTop: insets.top + 52 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar picker — Glassmorphism Card */}
          <Animated.View entering={FadeInUp.delay(0).duration(400)}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.avatarSection}
            >
              <Pressable accessibilityRole="button" onPress={pickAvatar}>
                {avatarUri ? (
                  <ProgressiveImage uri={avatarUri} width={120} height={120} borderRadius={radius.full} />
                ) : (
                  <LinearGradient
                    colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                    style={styles.avatarPlaceholder}
                  >
                    <Icon name="camera" size="xl" color={colors.emerald} />
                    <Text style={styles.avatarPlaceholderText}>{t('createBroadcast.avatarPlaceholder')}</Text>
                  </LinearGradient>
                )}
              </Pressable>
              <Text style={[styles.avatarHint, { color: tc.text.tertiary }]}>{t('createBroadcast.avatarHint')}</Text>
            </LinearGradient>
          </Animated.View>

          {/* Name — Glassmorphism Card */}
          <Animated.View entering={FadeInUp.delay(100).duration(400)}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.fieldCard}
            >
              <View style={styles.sectionHeader}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                  style={styles.sectionIconBg}
                >
                  <Icon name="edit" size="xs" color={colors.emerald} />
                </LinearGradient>
                <Text style={[styles.sectionLabel, { color: tc.text.secondary }]}>{t('createBroadcast.sectionLabel.name')}</Text>
                <CharCountRing current={nameCount} max={50} size={24} />
              </View>
              <TextInput
                style={[styles.input, { borderBottomColor: tc.border }]}
                value={name}
                onChangeText={setName}
                placeholder={t('createBroadcast.placeholder.name')}
                placeholderTextColor={tc.text.tertiary}
                maxLength={50}
                autoCorrect={false}
                accessibilityLabel={t('createBroadcast.accessibility.name')}
              />
            </LinearGradient>
          </Animated.View>

          {/* Slug — Glassmorphism Card */}
          <Animated.View entering={FadeInUp.delay(200).duration(400)}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.fieldCard}
            >
              <View style={styles.sectionHeader}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                  style={styles.sectionIconBg}
                >
                  <Icon name="link" size="xs" color={colors.emerald} />
                </LinearGradient>
                <Text style={[styles.sectionLabel, { color: tc.text.secondary }]}>{t('createBroadcast.sectionLabel.url')}</Text>
                <CharCountRing current={slugCount} max={30} size={24} />
              </View>
              <View style={[styles.slugContainer, { borderBottomColor: tc.border }]}>
                <Text style={[styles.slugPrefix, { color: tc.text.secondary }]}>mizanly.app/c/</Text>
                <TextInput
                  style={[styles.input, styles.slugInput]}
                  value={slug}
                  onChangeText={(text) => setSlug(slugify(text))}
                  placeholder={t('createBroadcast.placeholder.url')}
                  placeholderTextColor={tc.text.tertiary}
                  maxLength={30}
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel={t('createBroadcast.accessibility.url')}
                />
              </View>
              <Text style={[styles.hint, { color: tc.text.tertiary }]}>{t('createBroadcast.hint.url')}</Text>
            </LinearGradient>
          </Animated.View>

          {/* Description — Glassmorphism Card */}
          <Animated.View entering={FadeInUp.delay(300).duration(400)}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.fieldCard}
            >
              <View style={styles.sectionHeader}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                  style={styles.sectionIconBg}
                >
                  <Icon name="edit" size="xs" color={colors.emerald} />
                </LinearGradient>
                <Text style={[styles.sectionLabel, { color: tc.text.secondary }]}>{t('createBroadcast.sectionLabel.description')}</Text>
                <CharCountRing current={descCount} max={200} size={24} />
              </View>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={description}
                onChangeText={setDescription}
                placeholder={t('createBroadcast.placeholder.description')}
                placeholderTextColor={tc.text.tertiary}
                multiline
                maxLength={200}
                textAlignVertical="top"
                accessibilityLabel={t('createBroadcast.accessibility.description')}
              />
            </LinearGradient>
          </Animated.View>

          {/* Info note */}
          <Animated.View entering={FadeInUp.delay(400).duration(400)}>
            <LinearGradient
              colors={['rgba(200,150,62,0.15)', 'rgba(10,123,79,0.1)']}
              style={styles.note}
            >
              <LinearGradient
                colors={['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.1)']}
                style={styles.noteIconBg}
              >
                <Icon name="info" size="xs" color={colors.gold} />
              </LinearGradient>
              <Text style={[styles.noteText, { color: tc.text.secondary }]}>
                {t('createBroadcast.note')}
              </Text>
            </LinearGradient>
          </Animated.View>

          {/* Create button */}
          <GradientButton
            label={createMutation.isPending || uploading ? t('createBroadcast.creating') : t('createBroadcast.create')}
            onPress={() => isValid && createMutation.mutate()}
            disabled={!isValid}
            style={{ marginBottom: spacing.xl }}
          />
        </ScrollView>
      </View>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },

  // Body
  body: { flex: 1, paddingHorizontal: spacing.base },

  // Avatar
  avatarSection: {
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
    padding: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  avatarImage: {
    width: 120,
    height: 120,
    borderRadius: radius.full,
    backgroundColor: colors.dark.bgElevated,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 2,
    borderColor: colors.active.emerald30,
    borderStyle: 'dashed',
  },
  avatarPlaceholderText: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  avatarHint: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
    textAlign: 'center',
  },

  // Field Card
  fieldCard: {
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionIconBg: {
    width: 32, height: 32, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionLabel: {
    flex: 1,
    color: colors.text.secondary, fontSize: fontSize.sm,
  },
  input: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    paddingVertical: Platform.OS === 'ios' ? spacing.xs : 0,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.dark.border,
  },
  multiline: {
    minHeight: 100,
    lineHeight: 22,
    textAlignVertical: 'top',
    paddingTop: spacing.sm,
  },
  hint: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },

  // Slug
  slugContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: colors.dark.border,
  },
  slugPrefix: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
    paddingVertical: Platform.OS === 'ios' ? spacing.xs : 0,
  },
  slugInput: {
    flex: 1,
    borderBottomWidth: 0,
    marginStart: spacing.xs,
  },

  // Note
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.active.gold20,
  },
  noteIconBg: {
    width: 28, height: 28, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  noteText: {
    flex: 1,
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
});