import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { broadcastApi, uploadApi } from '@/services/api';

// Slugify helper
const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

export default function CreateBroadcastScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
      Alert.alert('Error', err.message || 'Failed to create channel. Please try again.');
    },
  });

  // Validation
  const isValid = name.trim().length >= 1 && slug.trim().length >= 1 && !createMutation.isPending && !uploading;
  const nameCount = name.length;
  const slugCount = slug.length;
  const descCount = description.length;

  return (
    <View style={styles.container}>
      <GlassHeader
        title="Create Channel"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Back' }}
      />
      <ScrollView
        style={styles.body}
        contentContainerStyle={{ paddingTop: insets.top + 52 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar picker */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={pickAvatar} activeOpacity={0.8}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} contentFit="cover" />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Icon name="camera" size="xl" color={colors.text.secondary} />
                <Text style={styles.avatarPlaceholderText}>Channel photo</Text>
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.avatarHint}>Optional. Tap to add a channel photo.</Text>
        </View>

        {/* Name */}
        <View style={styles.field}>
          <View style={styles.fieldHeader}>
            <Text style={styles.label}>Channel Name</Text>
            <CharCountRing current={nameCount} max={50} size={24} />
          </View>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g., Tech News Daily"
            placeholderTextColor={colors.text.tertiary}
            maxLength={50}
            autoCorrect={false}
            accessibilityLabel="Channel name"
          />
        </View>

        {/* Slug */}
        <View style={styles.field}>
          <View style={styles.fieldHeader}>
            <Text style={styles.label}>Channel URL</Text>
            <CharCountRing current={slugCount} max={30} size={24} />
          </View>
          <View style={styles.slugContainer}>
            <Text style={styles.slugPrefix}>mizanly.app/c/</Text>
            <TextInput
              style={[styles.input, styles.slugInput]}
              value={slug}
              onChangeText={(text) => setSlug(slugify(text))}
              placeholder="tech-news-daily"
              placeholderTextColor={colors.text.tertiary}
              maxLength={30}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Channel URL slug"
            />
          </View>
          <Text style={styles.hint}>Letters, numbers, and hyphens only. This will be your channel's web address.</Text>
        </View>

        {/* Description */}
        <View style={styles.field}>
          <View style={styles.fieldHeader}>
            <Text style={styles.label}>Description</Text>
            <CharCountRing current={descCount} max={200} size={24} />
          </View>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="What is this channel about? (optional)"
            placeholderTextColor={colors.text.tertiary}
            multiline
            maxLength={200}
            textAlignVertical="top"
            accessibilityLabel="Channel description"
          />
        </View>

        {/* Info note */}
        <View style={styles.note}>
          <Icon name="info" size="sm" color={colors.gold} />
          <Text style={styles.noteText}>
            Channels are public. Anyone can subscribe and view your messages.
          </Text>
        </View>

        {/* Create button */}
        <GradientButton
          label={createMutation.isPending || uploading ? 'Creating...' : 'Create'}
          onPress={() => isValid && createMutation.mutate()}
          disabled={!isValid}
          style={{ marginBottom: spacing.xl }}
        />
      </ScrollView>
    </View>
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
  },
  avatarImage: {
    width: 120,
    height: 120,
    borderRadius: radius.full,
    backgroundColor: colors.dark.bgElevated,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: radius.full,
    backgroundColor: colors.dark.bgElevated,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.dark.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  avatarPlaceholderText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  avatarHint: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
    textAlign: 'center',
  },

  // Field
  field: { marginBottom: spacing.xl },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  label: { color: colors.text.secondary, fontSize: fontSize.sm },
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
    marginLeft: spacing.xs,
  },

  // Note
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.active.emerald10,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },
  noteText: {
    flex: 1,
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
});