import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert, Switch, Platform, KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { colors, spacing, fontSize } from '@/theme';
import { usersApi, uploadApi, profileLinksApi } from '@/services/api';
import type { ProfileLink } from '@/types';

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

  // Profile links
  const linksQuery = useQuery({
    queryKey: ['profile-links'],
    queryFn: () => profileLinksApi.getLinks(),
  });
  const links: ProfileLink[] = linksQuery.data ?? [];

  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [showAddLink, setShowAddLink] = useState(false);

  const addLinkMutation = useMutation({
    mutationFn: () => profileLinksApi.create({ title: newLinkTitle.trim(), url: newLinkUrl.trim() }),
    onSuccess: () => {
      setNewLinkTitle('');
      setNewLinkUrl('');
      setShowAddLink(false);
      queryClient.invalidateQueries({ queryKey: ['profile-links'] });
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const deleteLinkMutation = useMutation({
    mutationFn: (id: string) => profileLinksApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile-links'] }),
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  // Seed form from loaded profile
  useEffect(() => {
    if (me) {
      setDisplayName(me.displayName ?? '');
      setBio(me.bio ?? '');
      setWebsite(me.website ?? '');
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
        <Skeleton.ProfileHeader />
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Icon name="camera" size="md" color={colors.text.secondary} />
                <Text style={styles.coverPlaceholderText}>Add cover photo</Text>
              </View>
            </View>
          )}
        </TouchableOpacity>

        {/* Avatar */}
        <TouchableOpacity style={styles.avatarWrap} onPress={pickAvatar} activeOpacity={0.8}>
          <Avatar uri={currentAvatar} name={displayName || me?.displayName} size="2xl" />
          <View style={styles.avatarEdit}>
            <Icon name="camera" size={14} color={colors.text.primary} />
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
            <View style={styles.charCountWrap}><CharCountRing current={bio.length} max={150} size={24} /></View>
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

          <View style={styles.divider} />

          {/* Profile Links */}
          <View style={styles.field}>
            <View style={styles.linksSectionHeader}>
              <Text style={styles.label}>Profile Links</Text>
              <Text style={styles.linksCount}>{links.length}/5</Text>
            </View>

            {linksQuery.isLoading ? (
              <View style={{ gap: 8, marginTop: spacing.sm }}>
                <Skeleton.Rect width="100%" height={44} />
                <Skeleton.Rect width="70%" height={44} />
              </View>
            ) : (
              links.map((link) => (
                <View key={link.id} style={styles.linkRow}>
                  <View style={styles.linkIcon}>
                    <Icon name="link" size="sm" color={colors.emerald} />
                  </View>
                  <View style={styles.linkInfo}>
                    <Text style={styles.linkTitle} numberOfLines={1}>{link.title}</Text>
                    <Text style={styles.linkUrl} numberOfLines={1}>{link.url}</Text>
                  </View>
                  <TouchableOpacity
                    hitSlop={8}
                    onPress={() => deleteLinkMutation.mutate(link.id)}
                    disabled={deleteLinkMutation.isPending && deleteLinkMutation.variables === link.id}
                  >
                    <Icon name="x" size="sm" color={colors.text.tertiary} />
                  </TouchableOpacity>
                </View>
              ))
            )}

            {showAddLink ? (
              <View style={styles.addLinkForm}>
                <TextInput
                  style={styles.addLinkInput}
                  placeholder="Title (e.g. My Website)"
                  placeholderTextColor={colors.text.tertiary}
                  value={newLinkTitle}
                  onChangeText={setNewLinkTitle}
                  maxLength={40}
                />
                <TextInput
                  style={[styles.addLinkInput, styles.addLinkInputBottom]}
                  placeholder="URL (https://...)"
                  placeholderTextColor={colors.text.tertiary}
                  value={newLinkUrl}
                  onChangeText={setNewLinkUrl}
                  autoCapitalize="none"
                  keyboardType="url"
                  maxLength={200}
                />
                <View style={styles.addLinkActions}>
                  <TouchableOpacity onPress={() => { setShowAddLink(false); setNewLinkTitle(''); setNewLinkUrl(''); }}>
                    <Text style={styles.addLinkCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.addLinkSave,
                      (!newLinkTitle.trim() || !newLinkUrl.trim() || addLinkMutation.isPending) && styles.addLinkSaveDisabled,
                    ]}
                    onPress={() => addLinkMutation.mutate()}
                    disabled={!newLinkTitle.trim() || !newLinkUrl.trim() || addLinkMutation.isPending}
                  >
                    {addLinkMutation.isPending ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.addLinkSaveText}>Add</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : links.length < 5 ? (
              <TouchableOpacity style={styles.addLinkBtn} onPress={() => setShowAddLink(true)}>
                <Text style={styles.addLinkBtnText}>+ Add a link</Text>
              </TouchableOpacity>
            ) : null}
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
  charCountWrap: { alignItems: 'flex-end', marginTop: 4 },
  usernameText: { color: colors.text.secondary, fontSize: fontSize.base },

  divider: { height: 0.5, backgroundColor: colors.dark.border },

  // Profile links
  linksSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  linksCount: { color: colors.text.tertiary, fontSize: fontSize.xs },
  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  linkIcon: {
    width: 36, height: 36, borderRadius: 8, backgroundColor: colors.dark.bgElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  linkInfo: { flex: 1 },
  linkTitle: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '600' },
  linkUrl: { color: colors.text.secondary, fontSize: fontSize.xs, marginTop: 2 },

  addLinkBtn: {
    marginTop: spacing.sm, paddingVertical: spacing.sm,
    borderWidth: 1, borderStyle: 'dashed', borderColor: colors.dark.border,
    borderRadius: 8, alignItems: 'center',
  },
  addLinkBtnText: { color: colors.emerald, fontSize: fontSize.sm, fontWeight: '600' },

  addLinkForm: {
    marginTop: spacing.sm, backgroundColor: colors.dark.bgElevated,
    borderRadius: 10, overflow: 'hidden',
  },
  addLinkInput: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    color: colors.text.primary, fontSize: fontSize.base,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  addLinkInputBottom: { borderBottomWidth: 0 },
  addLinkActions: {
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
    gap: spacing.md, padding: spacing.sm,
  },
  addLinkCancel: { color: colors.text.secondary, fontSize: fontSize.base },
  addLinkSave: {
    backgroundColor: colors.emerald, borderRadius: 8,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.xs + 2,
    minWidth: 60, alignItems: 'center',
  },
  addLinkSaveDisabled: { backgroundColor: colors.dark.surface },
  addLinkSaveText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700' },
});
