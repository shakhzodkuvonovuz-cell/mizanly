import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput,
  ScrollView, Switch, Platform, KeyboardAvoidingView,
} from 'react-native';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useRouter } from 'expo-router';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
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
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { showToast } from '@/components/ui/Toast';

type UpdateProfilePayload = {
  displayName?: string;
  bio?: string;
  website?: string;
  location?: string;
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
  // Note: pronouns and birthday fields are not supported by the backend DTO/schema yet
  // When backend adds support, re-enable these fields
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
  const tc = useThemeColors();

  const addLinkMutation = useMutation({
    mutationFn: () => profileLinksApi.create({ title: newLinkTitle.trim(), url: newLinkUrl.trim() }),
    onSuccess: () => {
      setNewLinkTitle('');
      setNewLinkUrl('');
      setShowAddLink(false);
      queryClient.invalidateQueries({ queryKey: ['profile-links'] });
    },
    onError: (err: Error) => showToast({ message: err.message, variant: 'error' }),
  });

  const deleteLinkMutation = useMutation({
    mutationFn: (id: string) => profileLinksApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile-links'] }),
    onError: (err: Error) => showToast({ message: err.message, variant: 'error' }),
  });

  // Seed form from loaded profile
  useEffect(() => {
    if (me) {
      const profile = me as User & { location?: string };
      setDisplayName(me.displayName ?? '');
      setBio(me.bio ?? '');
      setWebsite(me.website ?? '');
      setLocation(profile.location ?? '');
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
        displayName: displayName.trim(),
        bio: bio.trim(),
        website: website.trim(),
        location: location.trim(),
        isPrivate,
        ...(avatarUrl ? { avatarUrl } : {}),
        ...(coverUrl ? { coverUrl } : {}),
      };
      return usersApi.updateMe(payload as Parameters<typeof usersApi.updateMe>[0]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      showToast({ message: t('common.saved'), variant: 'success' });
      router.back();
    },
    onError: (err: Error) => {
      setUploading(false);
      showToast({ message: err.message || t('editProfile.couldNotSave'), variant: 'error' });
    },
  });

  if (meQuery.isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
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
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
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
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
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

        <ScrollView
          style={[styles.body, { paddingTop: HEADER_HEIGHT }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <BrandedRefreshControl
              refreshing={meQuery.isRefetching}
              onRefresh={() => meQuery.refetch()}
            />
          }
        >
          {/* Cover photo with premium gradient overlay */}
          <Pressable onPress={pickCover}>
            {currentCover ? (
              <Animated.View entering={FadeIn.duration(400)}>
                <ProgressiveImage uri={currentCover} width="100%" height={160} />
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
                    <Text style={styles.coverEditText}>{t('editProfile.changeCover')}</Text>
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
                  <Text style={[styles.coverPlaceholderText, { color: tc.text.primary }]}>{t('editProfile.addCoverPhoto')}</Text>
                  <Text style={[styles.coverPlaceholderSubtext, { color: tc.text.tertiary }]}>{t('editProfile.tapToUpload')}</Text>
                </View>
              </LinearGradient>
            )}
          </Pressable>

          {/* Avatar with glassmorphism overlay */}
          <Animated.View entering={FadeInUp.delay(100).duration(500)} style={styles.avatarWrap}>
            <Pressable onPress={pickAvatar}>
              <View style={styles.avatarContainer}>
                <Avatar uri={currentAvatar} name={displayName || me?.displayName} size="2xl" />
                <LinearGradient
                  colors={['rgba(10,123,79,0.9)', 'rgba(8,95,39,0.95)']}
                  style={[styles.avatarEdit, { borderColor: tc.bg }]}
                >
                  <Icon name="camera" size="sm" color="#fff" />
                </LinearGradient>
              </View>
            </Pressable>
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
                  <Text style={[styles.label, { color: tc.text.secondary }]}>{t('editProfile.displayName')}</Text>
                </View>
                <TextInput
                  style={[styles.input, focusedField === 'displayName' && styles.inputFocused]}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder={t('editProfile.namePlaceholder')}
                  placeholderTextColor={tc.text.tertiary}
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
                    <Icon name="at-sign" size="xs" color={tc.text.tertiary} />
                  </LinearGradient>
                  <Text style={[styles.label, { color: tc.text.secondary }]}>{t('editProfile.username')}</Text>
                </View>
                <Text style={[styles.usernameText, { color: tc.text.secondary }]}>@{me?.username}</Text>
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
                  <Text style={[styles.label, { color: tc.text.secondary }]}>{t('editProfile.bio')}</Text>
                </View>
                <TextInput
                  style={[styles.input, styles.multiline, focusedField === 'bio' && styles.inputFocused]}
                  value={bio}
                  onChangeText={setBio}
                  placeholder={t('editProfile.bioPlaceholder')}
                  placeholderTextColor={tc.text.tertiary}
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
                  <Text style={[styles.label, { color: tc.text.secondary }]}>{t('editProfile.website')}</Text>
                </View>
                <TextInput
                  style={[styles.input, focusedField === 'website' && styles.inputFocused]}
                  value={website}
                  onChangeText={setWebsite}
                  placeholder={t('editProfile.websitePlaceholder')}
                  placeholderTextColor={tc.text.tertiary}
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
                  <Text style={[styles.label, { color: tc.text.secondary }]}>{t('editProfile.location')}</Text>
                </View>
                <View style={styles.iconInputRow}>
                  <Icon name="map-pin" size="sm" color={tc.text.tertiary} />
                  <TextInput
                    style={[styles.input, styles.iconInput, focusedField === 'location' && styles.inputFocused]}
                    value={location}
                    onChangeText={setLocation}
                    placeholder={t('editProfile.locationPlaceholder')}
                    placeholderTextColor={tc.text.tertiary}
                    maxLength={100}
                    onFocus={() => setFocusedField('location')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>
            </LinearGradient>

            {/* Pronouns and Birthday fields removed -- not supported by backend DTO/schema yet */}

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
                    <Text style={[styles.label, { color: tc.text.secondary }]}>{t('editProfile.privateAccount')}</Text>
                  </View>
                  <Text style={[styles.fieldHint, { color: tc.text.tertiary }]}>{t('editProfile.privateAccountHint')}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  style={[styles.toggleTrack, { backgroundColor: tc.border }, isPrivate && styles.toggleTrackActive]}
                  onPress={() => setIsPrivate(!isPrivate)}
                >
                  <View style={[styles.toggleThumb, isPrivate && styles.toggleThumbActive]}>
                    <LinearGradient
                      colors={isPrivate ? [colors.emerald, colors.emerald] : [tc.bgCard, tc.border]}
                      style={styles.toggleThumbGradient}
                    />
                  </View>
                </Pressable>
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
                    <Text style={[styles.label, { color: tc.text.secondary }]}>{t('editProfile.profileLinks')}</Text>
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
                          <Text style={[styles.linkTitle, { color: tc.text.primary }]} numberOfLines={1}>{link.title}</Text>
                          <Text style={[styles.linkUrl, { color: tc.text.secondary }]} numberOfLines={1}>{link.url}</Text>
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          hitSlop={8}
                          onPress={() => deleteLinkMutation.mutate(link.id)}
                          disabled={deleteLinkMutation.isPending && deleteLinkMutation.variables === link.id}
                          style={styles.linkDeleteBtn}
                        >
                          <Icon name="x" size="sm" color={tc.text.tertiary} />
                        </Pressable>
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
                      placeholderTextColor={tc.text.tertiary}
                      value={newLinkTitle}
                      onChangeText={setNewLinkTitle}
                      maxLength={40}
                    />
                    <TextInput
                      style={[styles.addLinkInput, styles.addLinkInputBottom]}
                      placeholder={t('editProfile.urlPlaceholder')}
                      placeholderTextColor={tc.text.tertiary}
                      value={newLinkUrl}
                      onChangeText={setNewLinkUrl}
                      autoCapitalize="none"
                      keyboardType="url"
                      maxLength={200}
                    />
                    <View style={styles.addLinkActions}>
                      <Pressable onPress={() => { setShowAddLink(false); setNewLinkTitle(''); setNewLinkUrl(''); }}>
                        <Text style={[styles.addLinkCancel, { color: tc.text.secondary }]}>{t('common.cancel')}</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        style={[
                          styles.addLinkSave,
                          (!newLinkTitle.trim() || !newLinkUrl.trim() || addLinkMutation.isPending) && styles.addLinkSaveDisabled,
                        ]}
                        onPress={() => addLinkMutation.mutate()}
                        disabled={!newLinkTitle.trim() || !newLinkUrl.trim() || addLinkMutation.isPending}
                      >
                        {addLinkMutation.isPending ? (
                          <Skeleton.Rect width={24} height={24} borderRadius={radius.full} />
                        ) : (
                          <Text style={styles.addLinkSaveText}>{t('editProfile.addLink')}</Text>
                        )}
                      </Pressable>
                    </View>
                  </LinearGradient>
                ) : links.length < 5 ? (
                  <Pressable style={styles.addLinkBtn} onPress={() => setShowAddLink(true)}>
                    <LinearGradient
                      colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.1)']}
                      style={styles.addLinkBtnGradient}
                    >
                      <Icon name="plus" size="sm" color={colors.emerald} />
                      <Text style={styles.addLinkBtnText}>{t('editProfile.addLink')}</Text>
                    </LinearGradient>
                  </Pressable>
                ) : null}
              </View>
            </LinearGradient>
          </Animated.View>
        </ScrollView>
      </View>
  
    </ScreenErrorBoundary>
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
    borderWidth: 1, borderColor: colors.active.white6,
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
    borderWidth: 1, borderColor: colors.active.white6,
    overflow: 'hidden',
    minHeight: 140,
  },
  formCardToggle: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.active.white6,
    overflow: 'hidden',
  },
  formCardLinks: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.active.white6,
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
    backgroundColor: colors.active.emerald30,
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
    backgroundColor: colors.active.emerald20,
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
    borderWidth: 1, borderStyle: 'dashed', borderColor: colors.active.emerald40,
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
