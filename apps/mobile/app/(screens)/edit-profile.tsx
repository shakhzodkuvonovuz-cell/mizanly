import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert, Switch, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Avatar } from '@/components/ui/Avatar';
import { colors, spacing, fontSize } from '@/theme';
import { usersApi, uploadApi } from '@/services/api';

export default function EditProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => usersApi.getMe(),
  });
  const me = meQuery.data;

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [website, setWebsite] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | undefined>();
  const [coverUri, setCoverUri] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);

  // Seed form from loaded profile
  useEffect(() => {
    if (me) {
      setDisplayName(me.displayName ?? '');
      setBio(me.bio ?? '');
      setWebsite((me as any).website ?? '');
      setIsPrivate(me.isPrivate ?? false);
    }
  }, [me]);

  // ── Image pickers ──
  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (!result.canceled) setAvatarUri(result.assets[0].uri);
  };

  const pickCover = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 1],
      quality: 0.9,
    });
    if (!result.canceled) setCoverUri(result.assets[0].uri);
  };

  // ── Upload helper ──
  const uploadImage = async (uri: string, folder: 'avatars' | 'covers') => {
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const contentType = `image/${ext}`;
    const { uploadUrl, publicUrl } = await uploadApi.getPresignUrl(contentType, folder);
    const fileRes = await fetch(uri);
    const blob = await fileRes.blob();
    const res = await fetch(uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': contentType } });
    if (!res.ok) throw new Error('Image upload failed');
    return publicUrl;
  };

  // ── Save mutation ──
  const saveMutation = useMutation({
    mutationFn: async () => {
      setUploading(true);
      let avatarUrl: string | undefined;
      let coverUrl: string | undefined;

      if (avatarUri) avatarUrl = await uploadImage(avatarUri, 'avatars');
      if (coverUri) coverUrl = await uploadImage(coverUri, 'covers');
      setUploading(false);

      return usersApi.updateMe({
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
        website: website.trim() || undefined,
        isPrivate,
        ...(avatarUrl ? { avatarUrl } : {}),
        ...(coverUrl ? { coverUrl } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      router.back();
    },
    onError: (err: Error) => {
      setUploading(false);
      Alert.alert('Error', err.message || 'Could not save profile');
    },
  });

  if (meQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ActivityIndicator color={colors.emerald} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  const currentAvatar = avatarUri ?? me?.avatarUrl;
  const currentCover = coverUri ?? me?.coverUrl;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <TouchableOpacity
          onPress={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || uploading}
          hitSlop={8}
        >
          {saveMutation.isPending || uploading ? (
            <ActivityIndicator color={colors.emerald} size="small" />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
        {/* Cover photo */}
        <TouchableOpacity onPress={pickCover} activeOpacity={0.8}>
          {currentCover ? (
            <Image source={{ uri: currentCover }} style={styles.cover} contentFit="cover" />
          ) : (
            <View style={styles.coverPlaceholder}>
              <Text style={styles.coverPlaceholderText}>📷 Add cover photo</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Avatar */}
        <TouchableOpacity style={styles.avatarWrap} onPress={pickAvatar} activeOpacity={0.8}>
          <Avatar uri={currentAvatar} name={displayName || me?.displayName} size="2xl" />
          <View style={styles.avatarEdit}>
            <Text style={styles.avatarEditIcon}>📷</Text>
          </View>
        </TouchableOpacity>

        {/* Form fields */}
        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Display Name</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your name"
              placeholderTextColor={colors.text.tertiary}
              maxLength={50}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.field}>
            <Text style={styles.label}>Username</Text>
            <Text style={styles.usernameText}>@{me?.username}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.field}>
            <Text style={styles.label}>Bio</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={bio}
              onChangeText={setBio}
              placeholder="Tell people about yourself"
              placeholderTextColor={colors.text.tertiary}
              multiline
              maxLength={150}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{bio.length}/150</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.field}>
            <Text style={styles.label}>Website</Text>
            <TextInput
              style={styles.input}
              value={website}
              onChangeText={setWebsite}
              placeholder="https://yoursite.com"
              placeholderTextColor={colors.text.tertiary}
              autoCapitalize="none"
              keyboardType="url"
              maxLength={100}
            />
          </View>

          <View style={styles.divider} />

          <View style={[styles.field, styles.rowField]}>
            <View>
              <Text style={styles.label}>Private Account</Text>
              <Text style={styles.fieldHint}>Only approved followers see your posts</Text>
            </View>
            <Switch
              value={isPrivate}
              onValueChange={setIsPrivate}
              trackColor={{ false: colors.dark.border, true: colors.emerald }}
              thumbColor="#fff"
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  cancelText: { color: colors.text.secondary, fontSize: fontSize.base },
  headerTitle: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  saveText: { color: colors.emerald, fontSize: fontSize.base, fontWeight: '700' },

  body: { flex: 1 },

  cover: { width: '100%', height: 140 },
  coverPlaceholder: {
    width: '100%', height: 140, backgroundColor: colors.dark.bgElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  coverPlaceholderText: { color: colors.text.secondary, fontSize: fontSize.base },

  avatarWrap: {
    marginLeft: spacing.base, marginTop: -36, marginBottom: spacing.md,
    alignSelf: 'flex-start', position: 'relative',
  },
  avatarEdit: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.dark.bgElevated,
    borderWidth: 2, borderColor: colors.dark.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEditIcon: { fontSize: 14 },

  form: { paddingHorizontal: spacing.base },

  field: { paddingVertical: spacing.md },
  rowField: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  label: { color: colors.text.secondary, fontSize: fontSize.sm, marginBottom: spacing.xs },
  fieldHint: { color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: 2 },
  input: {
    color: colors.text.primary, fontSize: fontSize.base,
    paddingVertical: Platform.OS === 'ios' ? spacing.xs : 0,
  },
  multiline: { minHeight: 80, lineHeight: 22 },
  charCount: {
    color: colors.text.tertiary, fontSize: fontSize.xs, textAlign: 'right', marginTop: 4,
  },
  usernameText: { color: colors.text.secondary, fontSize: fontSize.base },

  divider: { height: 0.5, backgroundColor: colors.dark.border },
});
