import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert, Switch, Platform, KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from '@/hooks/useTranslation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { colors, spacing, fontSize, radius } from '@/theme';
import { usersApi, uploadApi, profileLinksApi } from '@/services/api';
import type { ProfileLink, User } from '@/types';

type UpdateProfilePayload = {
  displayName?: string;
  bio?: string;
  website?: string;
  location?: string;
  pronouns?: string;
  birthday?: string;
  isPrivate?: boolean;
  avatarUrl?: string;
  coverUrl?: string;
};

export default function EditProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => usersApi.getMe(),
  });
  const me = meQuery.data;

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [website, setWebsite] = useState('');
  const [location, setLocation] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [birthday, setBirthday] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | undefined>();
  const [coverUri, setCoverUri] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

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
      const profile = me as User & { location?: string; pronouns?: string; birthday?: string };
      setDisplayName(me.displayName ?? '');
      setBio(me.bio ?? '');
      setWebsite(me.website ?? '');
      setLocation(profile.location ?? '');
      setPronouns(profile.pronouns ?? '');
      setBirthday(profile.birthday ?? '');
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

      const payload: UpdateProfilePayload = {
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
        website: website.trim() || undefined,
        location: location.trim() || undefined,
        pronouns: pronouns.trim() || undefined,
        birthday: birthday.trim() || undefined,
        isPrivate,
        ...(avatarUrl ? { avatarUrl } : {}),
        ...(coverUrl ? { coverUrl } : {}),
      };
      return usersApi.updateMe(payload as Parameters<typeof usersApi.updateMe>[0]);
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
      <View style={styles.container}>
        <GlassHeader
          title={t('profile.editProfile')}
          leftAction={{ icon: 'x', onPress: () => router.back() }}
        />
        <View style={{ marginTop: insets.top + 44 }}>
          <Skeleton.ProfileHeader />
        </View>
      </View>
    );
  }

  if (meQuery.isError) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title={t('profile.editProfile')}
          leftAction={{ icon: 'x', onPress: () => router.back() }}
        />
        <View style={{ flex: 1, justifyContent: 'center', paddingTop: insets.top + 44 }}>
          <EmptyState
            icon="flag"
            title={t('editProfile.loadErrorTitle')}
            subtitle={t('editProfile.loadErrorSubtitle')}
            actionLabel={t('common.retry')}
            onAction={() => meQuery.refetch()}
          />
        </View>
      </View>
    );
  }

  const currentAvatar = avatarUri ?? me?.avatarUrl;
  const currentCover = coverUri ?? me?.coverUrl;

  const HEADER_HEIGHT = insets.top + 44;

  return (
    <View style={styles.container}>
      <GlassHeader
        title={t('profile.editProfile')}
        leftAction={{ icon: 'x', onPress: () => router.back(), accessibilityLabel: t('common.cancel') }}
      />
      {/* Save button overlay on GlassHeader right area */}
      <View style={[styles.saveButtonWrap, { top: insets.top + 4 }]} pointerEvents="box-none">
        <GradientButton
          label={t('common.save')}
          size="sm"
          onPress={() => saveMutation.mutate()}
          loading={saveMutation.isPending || uploading}
          disabled={saveMutation.isPending || uploading}
        />
      </View>

      <ScrollView style={[styles.body, { paddingTop: HEADER_HEIGHT }]} keyboardShouldPersistTaps="handled">
        {/* Cover photo with premium gradient overlay */}
        <TouchableOpacity onPress={pickCover} activeOpacity={0.9}>
          {currentCover ? (
            <Animated.View entering={FadeIn.duration(400)}>
              <Image source={{ uri: currentCover }} style={styles.cover} contentFit="cover" />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.7)']}
                style={styles.coverGradient}
              />
              <View style={styles.coverOverlay}>
                <LinearGradient
                  colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                  style={styles.coverEditBadge}
                >
                  <Icon name="camera" size="sm" color="#fff" />
                  <Text style={styles.coverEditText}>Change Cover</Text>
                </LinearGradient>
              </View>
            </Animated.View>
          ) : (
            <LinearGradient
              colors={['rgba(10,123,79,0.15)', 'rgba(200,150,62,0.1)']}
              style={styles.coverPlaceholder}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.coverPlaceholderInner}>
                <LinearGradient
                  colors={['rgba(45,53,72,0.5)', 'rgba(28,35,51,0.3)']}
                  style={styles.coverPlaceholderIconBg}
                >
                  <Icon name="camera" size="lg" color={colors.gold} />
                </LinearGradient>
                <Text style={styles.coverPlaceholderText}>Add cover photo</Text>
                <Text style={styles.coverPlaceholderSubtext}>Tap to upload</Text>
              </View>
            </LinearGradient>
          )}
        </TouchableOpacity>

        {/* Avatar with glassmorphism overlay */}
        <Animated.View entering={FadeInUp.delay(100).duration(500)} style={styles.avatarWrap}>
          <TouchableOpacity onPress={pickAvatar} activeOpacity={0.9}>
            <View style={styles.avatarContainer}>
              <Avatar uri={currentAvatar} name={displayName || me?.displayName} size="2xl" />
              <LinearGradient
                colors={['rgba(10,123,79,0.9)', 'rgba(8,95,39,0.95)']}
                style={styles.avatarEdit}
              >
                <Icon name="camera" size="sm" color="#fff" />
              </LinearGradient>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Form fields with glassmorphism cards */}
        <Animated.View entering={FadeInUp.delay(200).duration(500)} style={styles.form}>
          <LinearGradient
            colors={['rgba(45,53,72,0.35)', 'rgba(28,35,51,0.2)']}
            style={styles.formCard}
          >
            <View style={styles.field}>
              <View style={styles.fieldHeader}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
                  style={styles.fieldIconBg}
                >
                  <Icon name="user" size="xs" color={colors.emerald} />
                </LinearGradient>
                <Text style={styles.label}>Display Name</Text>
              </View>
              <TextInput
                style={[styles.input, focusedField === 'displayName' && styles.inputFocused]}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder={t('editProfile.namePlaceholder')}
                placeholderTextColor={colors.text.tertiary}
                maxLength={50}
                onFocus={() => setFocusedField('displayName')}
                onBlur={() => setFocusedField(null)}
              />
            </View>
          </LinearGradient>

          {/* Username - Read only glassmorphism card */}
          <LinearGradient
            colors={['rgba(45,53,72,0.25)', 'rgba(28,35,51,0.15)']}
            style={styles.formCardReadOnly}
          >
            <View style={styles.field}>
              <View style={styles.fieldHeader}>
                <LinearGradient
                  colors={['rgba(110,119,129,0.3)', 'rgba(110,119,129,0.1)']}
                  style={styles.fieldIconBg}
                >
                  <Icon name="at-sign" size="xs" color={colors.text.tertiary} />
                </LinearGradient>
                <Text style={styles.label}>Username</Text>
              </View>
              <Text style={styles.usernameText}>@{me?.username}</Text>
            </View>
          </LinearGradient>

          {/* Bio with glassmorphism */}
          <LinearGradient
            colors={['rgba(45,53,72,0.35)', 'rgba(28,35,51,0.2)']}
            style={styles.formCardMultiline}
          >
            <View style={styles.field}>
              <View style={styles.fieldHeader}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
                  style={styles.fieldIconBg}
                >
                  <Icon name="edit" size="xs" color={colors.emerald} />
                </LinearGradient>
                <Text style={styles.label}>Bio</Text>
              </View>
              <TextInput
                style={[styles.input, styles.multiline, focusedField === 'bio' && styles.inputFocused]}
                value={bio}
                onChangeText={setBio}
                placeholder={t('editProfile.bioPlaceholder')}
                placeholderTextColor={colors.text.tertiary}
                multiline
                maxLength={150}
                textAlignVertical="top"
                onFocus={() => setFocusedField('bio')}
                onBlur={() => setFocusedField(null)}
              />
              <View style={styles.charCountWrap}><CharCountRing current={bio.length} max={150} size={24} /></View>
            </View>
          </LinearGradient>

          {/* Website */}
          <LinearGradient
            colors={['rgba(45,53,72,0.35)', 'rgba(28,35,51,0.2)']}
            style={styles.formCard}
          >
            <View style={styles.field}>
              <View style={styles.fieldHeader}>
                <LinearGradient
                  colors={['rgba(200,150,62,0.3)', 'rgba(200,150,62,0.1)']}
                  style={styles.fieldIconBg}
                >
                  <Icon name="globe" size="xs" color={colors.gold} />
                </LinearGradient>
                <Text style={styles.label}>Website</Text>
              </View>
              <TextInput
                style={[styles.input, focusedField === 'website' && styles.inputFocused]}
                value={website}
                onChangeText={setWebsite}
                placeholder="https://yoursite.com"
                placeholderTextColor={colors.text.tertiary}
                autoCapitalize="none"
                keyboardType="url"
                maxLength={100}
                onFocus={() => setFocusedField('website')}
                onBlur={() => setFocusedField(null)}
              />
            </View>
          </LinearGradient>

          {/* Location */}
          <LinearGradient
            colors={['rgba(45,53,72,0.35)', 'rgba(28,35,51,0.2)']}
            style={styles.formCard}
          >
            <View style={styles.field}>
              <View style={styles.fieldHeader}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
                  style={styles.fieldIconBg}
                >
                  <Icon name="map-pin" size="xs" color={colors.emerald} />
                </LinearGradient>
                <Text style={styles.label}>Location</Text>
              </View>
              <View style={styles.iconInputRow}>
                <Icon name="map-pin" size="sm" color={colors.text.tertiary} />
                <TextInput
                  style={[styles.input, styles.iconInput, focusedField === 'location' && styles.inputFocused]}
                  value={location}
                  onChangeText={setLocation}
                  placeholder={t('editProfile.locationPlaceholder')}
                  placeholderTextColor={colors.text.tertiary}
                  maxLength={100}
                  onFocus={() => setFocusedField('location')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            </View>
          </LinearGradient>

          {/* Pronouns */}
          <LinearGradient
            colors={['rgba(45,53,72,0.35)', 'rgba(28,35,51,0.2)']}
            style={styles.formCard}
          >
            <View style={styles.field}>
              <View style={styles.fieldHeader}>
                <LinearGradient
                  colors={['rgba(200,150,62,0.3)', 'rgba(200,150,62,0.1)']}
                  style={styles.fieldIconBg}
                >
                  <Icon name="user" size="xs" color={colors.gold} />
                </LinearGradient>
                <Text style={styles.label}>Pronouns</Text>
              </View>
              <TextInput
                style={[styles.input, focusedField === 'pronouns' && styles.inputFocused]}
                value={pronouns}
                onChangeText={setPronouns}
                placeholder={t('editProfile.pronounsPlaceholder')}
                placeholderTextColor={colors.text.tertiary}
                maxLength={30}
                onFocus={() => setFocusedField('pronouns')}
                onBlur={() => setFocusedField(null)}
              />
            </View>
          </LinearGradient>

          {/* Birthday */}
          <LinearGradient
            colors={['rgba(45,53,72,0.35)', 'rgba(28,35,51,0.2)']}
            style={styles.formCard}
          >
            <View style={styles.field}>
              <View style={styles.fieldHeader}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
                  style={styles.fieldIconBg}
                >
                  <Icon name="clock" size="xs" color={colors.emerald} />
                </LinearGradient>
                <Text style={styles.label}>Birthday</Text>
              </View>
              <TextInput
                style={[styles.input, focusedField === 'birthday' && styles.inputFocused]}
                value={birthday}
                onChangeText={setBirthday}
                placeholder={t('editProfile.birthdayPlaceholder')}
                placeholderTextColor={colors.text.tertiary}
                maxLength={10}
                onFocus={() => setFocusedField('birthday')}
                onBlur={() => setFocusedField(null)}
              />
            </View>
          </LinearGradient>

          {/* Private Account with Premium Toggle */}
          <LinearGradient
            colors={['rgba(45,53,72,0.35)', 'rgba(28,35,51,0.2)']}
            style={styles.formCardToggle}
          >
            <View style={[styles.field, styles.rowField]}>
              <View style={styles.toggleTextContainer}>
                <View style={styles.toggleHeader}>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
                    style={styles.fieldIconBg}
                  >
                    <Icon name="lock" size="xs" color={colors.emerald} />
                  </LinearGradient>
                  <Text style={styles.label}>Private Account</Text>
                </View>
                <Text style={styles.fieldHint}>Only approved followers see your posts</Text>
              </View>
              <TouchableOpacity
                style={[styles.toggleTrack, isPrivate && styles.toggleTrackActive]}
                onPress={() => setIsPrivate(!isPrivate)}
                activeOpacity={0.9}
              >
                <View style={[styles.toggleThumb, isPrivate && styles.toggleThumbActive]}>
                  <LinearGradient
                    colors={isPrivate ? [colors.emerald, colors.emerald] : ['#fff', '#f0f0f0']}
                    style={styles.toggleThumbGradient}
                  />
                </View>
              </TouchableOpacity>
            </View>
          </LinearGradient>

          {/* Profile Links - Glassmorphism Section */}
          <LinearGradient
            colors={['rgba(45,53,72,0.35)', 'rgba(28,35,51,0.2)']}
            style={styles.formCardLinks}
          >
            <View style={styles.field}>
              <View style={styles.linksSectionHeader}>
                <View style={styles.toggleHeader}>
                  <LinearGradient
                    colors={['rgba(200,150,62,0.3)', 'rgba(200,150,62,0.1)']}
                    style={styles.fieldIconBg}
                  >
                    <Icon name="link" size="xs" color={colors.gold} />
                  </LinearGradient>
                  <Text style={styles.label}>Profile Links</Text>
                </View>
                <View style={styles.linksCountBadge}>
                  <Text style={styles.linksCount}>{links.length}/5</Text>
                </View>
              </View>

              {linksQuery.isLoading ? (
                <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                  <Skeleton.Rect width="100%" height={44} />
                  <Skeleton.Rect width="70%" height={44} />
                </View>
              ) : (
                links.map((link, index) => (
                  <Animated.View key={link.id} entering={FadeInUp.delay(index * 50).duration(300)}>
                    <LinearGradient
                      colors={['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.15)']}
                      style={styles.linkRowGlass}
                    >
                      <LinearGradient
                        colors={['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']}
                        style={styles.linkIconGlass}
                      >
                        <Icon name="link" size="sm" color={colors.emerald} />
                      </LinearGradient>
                      <View style={styles.linkInfo}>
                        <Text style={styles.linkTitle} numberOfLines={1}>{link.title}</Text>
                        <Text style={styles.linkUrl} numberOfLines={1}>{link.url}</Text>
                      </View>
                      <TouchableOpacity
                        hitSlop={8}
                        onPress={() => deleteLinkMutation.mutate(link.id)}
                        disabled={deleteLinkMutation.isPending && deleteLinkMutation.variables === link.id}
                        style={styles.linkDeleteBtn}
                      >
                        <Icon name="x" size="sm" color={colors.text.tertiary} />
                      </TouchableOpacity>
                    </LinearGradient>
                  </Animated.View>
                ))
              )}

              {showAddLink ? (
                <LinearGradient
                  colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.25)']}
                  style={styles.addLinkFormGlass}
                >
                  <TextInput
                    style={styles.addLinkInput}
                    placeholder={t('editProfile.linkTitlePlaceholder')}
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
                        <ActivityIndicator color={colors.text.primary} size="small" />
                      ) : (
                        <Text style={styles.addLinkSaveText}>Add</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </LinearGradient>
              ) : links.length < 5 ? (
                <TouchableOpacity style={styles.addLinkBtn} onPress={() => setShowAddLink(true)}>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.1)']}
                    style={styles.addLinkBtnGradient}
                  >
                    <Icon name="plus" size="sm" color={colors.emerald} />
                    <Text style={styles.addLinkBtnText}>Add a link</Text>
                  </LinearGradient>
                </TouchableOpacity>
              ) : null}
            </View>
          </LinearGradient>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },

  saveButtonWrap: {
    position: 'absolute', right: spacing.base, zIndex: 101,
    alignItems: 'flex-end',
  },

  body: { flex: 1 },

  // Cover photo styles
  cover: { width: '100%', height: 160 },
  coverGradient: {
    ...StyleSheet.absoluteFillObject,
    height: 160,
  },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    height: 160,
    alignItems: 'center', justifyContent: 'center',
  },
  coverEditBadge: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  coverEditText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '600' },
  coverPlaceholder: {
    width: '100%', height: 160,
    alignItems: 'center', justifyContent: 'center',
  },
  coverPlaceholderInner: { alignItems: 'center', gap: spacing.sm },
  coverPlaceholderIconBg: {
    width: 64, height: 64, borderRadius: radius.full,
    alignItems: 'center', justifyContent: 'center',
  },
  coverPlaceholderText: { color: colors.text.primary, fontSize: fontSize.md, fontWeight: '600' },
  coverPlaceholderSubtext: { color: colors.text.tertiary, fontSize: fontSize.sm },

  // Avatar styles
  avatarWrap: {
    marginLeft: spacing.base, marginTop: -40, marginBottom: spacing.md,
    alignSelf: 'flex-start',
  },
  avatarContainer: { position: 'relative' },
  avatarEdit: {
    position: 'absolute', bottom: 0, right: 0,
    width: 36, height: 36, borderRadius: radius.full,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: colors.dark.bg,
  },

  // Form styles with glassmorphism cards
  form: { paddingHorizontal: spacing.base, gap: spacing.md, paddingBottom: spacing.xl },

  formCard: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  formCardReadOnly: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
    opacity: 0.8,
  },
  formCardMultiline: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    minHeight: 140,
  },
  formCardToggle: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  formCardLinks: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },

  field: { paddingVertical: spacing.sm },
  rowField: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  fieldHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  fieldIconBg: {
    width: 28, height: 28, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  label: { color: colors.text.secondary, fontSize: fontSize.sm, fontWeight: '500' },
  fieldHint: { color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: 2, marginLeft: 40 },
  input: {
    color: colors.text.primary, fontSize: fontSize.base,
    paddingVertical: Platform.OS === 'ios' ? spacing.xs : 0,
    paddingHorizontal: 0,
  },
  inputFocused: {
    color: colors.emerald,
  },
  multiline: { minHeight: 60, lineHeight: 22, textAlignVertical: 'top' },
  iconInputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconInput: { flex: 1 },
  charCountWrap: { alignItems: 'flex-end', marginTop: spacing.xs },
  usernameText: { color: colors.text.secondary, fontSize: fontSize.base, marginLeft: 40 },

  // Premium Toggle Switch
  toggleTextContainer: { flex: 1 },
  toggleHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  toggleTrack: {
    width: 52, height: 28, borderRadius: radius.full,
    backgroundColor: colors.dark.border,
    padding: 2,
    justifyContent: 'center',
  },
  toggleTrackActive: {
    backgroundColor: 'rgba(10,123,79,0.3)',
  },
  toggleThumb: {
    width: 24, height: 24, borderRadius: radius.full,
    backgroundColor: '#fff',
    transform: [{ translateX: 0 }],
  },
  toggleThumbActive: {
    transform: [{ translateX: 24 }],
  },
  toggleThumbGradient: {
    width: '100%', height: '100%', borderRadius: radius.full,
  },

  divider: { height: 0.5, backgroundColor: colors.dark.border },

  // Profile links with glassmorphism
  linksSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  linksCountBadge: {
    backgroundColor: 'rgba(10,123,79,0.2)',
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  linksCount: { color: colors.emerald, fontSize: fontSize.xs, fontWeight: '600' },
  // Glassmorphism link rows
  linkRowGlass: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  linkIconGlass: {
    width: 36, height: 36, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  linkDeleteBtn: {
    width: 28, height: 28, borderRadius: radius.full,
    backgroundColor: 'rgba(248,81,73,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  linkInfo: { flex: 1 },
  linkTitle: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '600' },
  linkUrl: { color: colors.text.secondary, fontSize: fontSize.xs, marginTop: 2 },

  // Add link button with gradient
  addLinkBtn: {
    marginTop: spacing.sm,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  addLinkBtnGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(10,123,79,0.4)',
    borderRadius: radius.sm,
  },
  addLinkBtnText: { color: colors.emerald, fontSize: fontSize.sm, fontWeight: '600' },

  // Add link form with glassmorphism
  addLinkFormGlass: {
    marginTop: spacing.sm,
    borderRadius: radius.md, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    padding: spacing.sm,
  },
  addLinkInput: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    color: colors.text.primary, fontSize: fontSize.base,
    borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
  addLinkInputBottom: { marginBottom: 0 },
  addLinkActions: {
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
    gap: spacing.md, padding: spacing.sm,
  },
  addLinkCancel: { color: colors.text.secondary, fontSize: fontSize.base },
  addLinkSave: {
    backgroundColor: colors.emerald, borderRadius: radius.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.xs + 2,
    minWidth: 60, alignItems: 'center',
  },
  addLinkSaveDisabled: { backgroundColor: colors.dark.surface, opacity: 0.5 },
  addLinkSaveText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700' },
});
