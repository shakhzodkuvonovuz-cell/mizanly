import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable,
  ScrollView, Platform, Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { Autocomplete } from '@/components/ui/Autocomplete';
import { LocationPicker } from '@/components/ui/LocationPicker';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { AnimatedAccordion } from '@/components/ui/AnimatedAccordion';
import { colors, spacing, fontSize, radius, fontSizeExt, fonts } from '@/theme';
import { Circle } from '@/types';
import { postsApi, uploadApi, circlesApi, draftsApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { navigate } from '@/utils/navigation';
import { showToast } from '@/components/ui/Toast';

type Visibility = 'PUBLIC' | 'FOLLOWERS' | 'CIRCLE';

interface PickedMedia {
  uri: string;
  type: 'image' | 'video';
  width?: number;
  height?: number;
}

type AutocompleteType = 'hashtag' | 'mention' | null;

type VisIconName = React.ComponentProps<typeof Icon>['name'];
const VISIBILITY_KEYS: { value: Visibility; labelKey: string; iconName: VisIconName }[] = [
  { value: 'PUBLIC', labelKey: 'compose.visibility.everyone', iconName: 'globe' },
  { value: 'FOLLOWERS', labelKey: 'compose.visibility.followers', iconName: 'users' },
  { value: 'CIRCLE', labelKey: 'compose.visibility.circle', iconName: 'lock' },
];

export default function CreatePostScreen() {
  const router = useRouter();
  const tc = useThemeColors();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const [content, setContent] = useState('');
  const [media, setMedia] = useState<PickedMedia[]>([]);
  const [visibility, setVisibility] = useState<Visibility>('PUBLIC');
  const [showVisibility, setShowVisibility] = useState(false);
  const [circleId, setCircleId] = useState<string | undefined>();
  const [showCirclePicker, setShowCirclePicker] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Autocomplete state
  const [autocompleteType, setAutocompleteType] = useState<AutocompleteType>(null);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);

  // Discard sheet state
  const [showDiscardSheet, setShowDiscardSheet] = useState(false);

  // Location state
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [location, setLocation] = useState<{ name: string; latitude?: number; longitude?: number } | null>(null);

  // ── Publish fields (Session 4 — Instagram parity) ──
  const [altText, setAltText] = useState('');
  const [taggedUsers, setTaggedUsers] = useState<string[]>([]);
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [collaboratorUsername, setCollaboratorUsername] = useState('');
  const [commentControl, setCommentControl] = useState<'everyone' | 'followers' | 'nobody'>('everyone');
  const [showCommentControl, setShowCommentControl] = useState(false);
  const [shareToFeed, setShareToFeed] = useState(true);
  const [brandedContent, setBrandedContent] = useState(false);
  const [brandPartner, setBrandPartner] = useState('');
  const [remixAllowed, setRemixAllowed] = useState(true);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [showTopics, setShowTopics] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  const inputRef = useRef<TextInput>(null);
  const draftSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showDraftBanner, setShowDraftBanner] = useState(false);

  // Load draft on mount
  useEffect(() => {
    const loadDraft = async () => {
      try {
        const saved = await AsyncStorage.getItem('post-draft');
        if (saved) {
          const draft = JSON.parse(saved);
          if (draft.content) setContent(draft.content);
          if (draft.mediaUrls && draft.mediaUrls.length > 0) {
            // Note: mediaUrls are URLs, not local URIs. We cannot restore picked media files.
            // We'll only restore content for now.
          }
          setShowDraftBanner(true);
          setTimeout(() => setShowDraftBanner(false), 3000);
        }
      } catch (err) {
      }
    };
    loadDraft();

    return () => {
      if (draftSaveRef.current) clearTimeout(draftSaveRef.current);
    };
  }, []);

  // Debounced auto-save
  const saveDraft = useCallback(() => {
    if (draftSaveRef.current) clearTimeout(draftSaveRef.current);
    draftSaveRef.current = setTimeout(async () => {
      try {
        if (!content.trim() && media.length === 0) {
          await AsyncStorage.removeItem('post-draft');
          return;
        }
        await AsyncStorage.setItem('post-draft', JSON.stringify({
          content,
          mediaUrls: media.map(m => m.uri),
        }));
      } catch (err) {
      }
    }, 2000);
  }, [content, media]);

  // Auto-save when content or media changes
  useEffect(() => {
    saveDraft();
  }, [saveDraft]);

  const circlesQuery = useQuery({
    queryKey: ['my-circles'],
    queryFn: () => circlesApi.getMyCircles(),
    enabled: visibility === 'CIRCLE',
  });
  const circles: Circle[] = (circlesQuery.data ?? []) as Circle[];

  // ── File size limits ──
  const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB
  const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

  const getFileSize = async (uri: string): Promise<number> => {
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    return info.exists && 'size' in info ? info.size : 0;
  };

  // ── Media picker ──
  const pickMedia = async () => {
    if (media.length >= 10) {
      showToast({ message: t('compose.mediaLimit'), variant: 'error' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: 10 - media.length,
      quality: 0.85,
      exif: false,
    });
    if (!result.canceled) {
      const validAssets: PickedMedia[] = [];
      for (const a of result.assets) {
        const isVideo = a.type === 'video';
        const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
        const maxLabel = isVideo ? '100MB' : '20MB';
        const fileSize = a.fileSize ?? await getFileSize(a.uri);
        if (fileSize > maxSize) {
          const msgKey = isVideo ? 'compose.videoTooLarge' : 'compose.fileTooLarge';
          showToast({ message: t(msgKey, { max: maxLabel }), variant: 'error' });
          continue;
        }
        validAssets.push({
          uri: a.uri,
          type: isVideo ? 'video' : 'image',
          width: a.width,
          height: a.height,
        });
      }
      // Client-side NSFW screening — blocks before upload (zero API cost)
      if (validAssets.length > 0) {
        const imageUris = validAssets.filter(a => a.type === 'image').map(a => a.uri);
        if (imageUris.length > 0) {
          try {
            const { checkImages } = require('@/services/nsfwCheck');
            const nsfwResult = await checkImages(imageUris);
            if (!nsfwResult.safe) {
              showToast({ message: t('compose.contentBlocked') || 'This image violates community guidelines', variant: 'error' });
              return;
            }
          } catch {
            // nsfwCheck not available — server-side moderation is the fallback
          }
        }
        setMedia((prev) => [...prev, ...validAssets].slice(0, 10));
      }
    }
  };

  const removeMedia = (index: number) => {
    setMedia((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Upload + create ──
  const createMutation = useMutation({
    mutationFn: async () => {
      setUploading(media.length > 0);

      const mediaUrls: string[] = [];
      const mediaTypes: string[] = [];
      let mediaWidth: number | undefined;
      let mediaHeight: number | undefined;

      // Upload each media file
      for (const item of media) {
        const ext = item.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
        const contentType = item.type === 'video' ? `video/${ext}` : `image/${ext}`;
        const { uploadUrl, publicUrl } = await uploadApi.getPresignUrl(contentType, 'posts');

        // Fetch file and upload to presigned URL
        const fileRes = await fetch(item.uri);
        const blob = await fileRes.blob();
        const uploadRes = await fetch(uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': contentType } });
        if (!uploadRes.ok) throw new Error(`Upload failed (${uploadRes.status})`);

        mediaUrls.push(publicUrl);
        mediaTypes.push(item.type);
        if (mediaWidth === undefined && item.width) {
          mediaWidth = item.width;
          mediaHeight = item.height;
        }
      }

      setUploading(false);

      const postType =
        mediaUrls.length === 0 ? 'TEXT'
        : mediaUrls.length > 1 ? 'CAROUSEL'
        : mediaTypes[0] === 'video' ? 'VIDEO'
        : 'IMAGE';

      return postsApi.create({
        content: content.trim() || undefined,
        postType,
        mediaUrls,
        mediaTypes,
        mediaWidth,
        mediaHeight,
        visibility,
        circleId: visibility === 'CIRCLE' ? circleId : undefined,
        locationName: location?.name,
        altText: altText.trim() || undefined,
        taggedUsers: taggedUsers.length > 0 ? taggedUsers : undefined,
        collaboratorUsername: collaboratorUsername.trim() || undefined,
        commentControl,
        shareToFeed,
        brandedContent,
        brandPartner: brandedContent ? brandPartner.trim() || undefined : undefined,
        remixAllowed,
        topics: selectedTopics.length > 0 ? selectedTopics : undefined,
      });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['saf-feed'] });
      try {
        await AsyncStorage.removeItem('post-draft');
      } catch (err) {
      }
      showToast({ message: t('compose.postPublished'), variant: 'success' });
      router.back();
    },
    onError: (err: Error) => {
      setUploading(false);
      showToast({ message: err.message || t('compose.failedToCreatePost'), variant: 'error' });
    },
  });

  const canPost =
    (content.trim().length > 0 || media.length > 0) && !createMutation.isPending;

  const visibilityOption = VISIBILITY_KEYS.find((o) => o.value === visibility)!;
  const selectedCircle = circles.find((c) => c.id === circleId);
  const pillText = visibility === 'CIRCLE' && selectedCircle
    ? selectedCircle.name
    : t(visibilityOption.labelKey);

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: tc.border }]}>
          <Pressable onPress={() => {
            if (content.trim() || media.length > 0) {
              setShowDiscardSheet(true);
            } else {
              router.back();
            }
          }} hitSlop={8}>
            <Icon name="x" size="md" color={tc.text.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('saf.newPost')}</Text>
          <GradientButton
            label={t('common.share')}
            size="sm"
            onPress={() => canPost && createMutation.mutate()}
            loading={createMutation.isPending}
            disabled={!canPost}
          />
        </View>

        {/* Draft restored banner */}
        {showDraftBanner && (
          <View style={styles.draftBanner}>
            <Icon name="clock" size="sm" color={colors.gold} />
            <Text style={styles.draftBannerText}>{t('compose.draftRestored')}</Text>
            <Pressable onPress={() => setShowDraftBanner(false)} hitSlop={8}>
              <Icon name="x" size="xs" color={tc.text.secondary} />
            </Pressable>
          </View>
        )}

        <ScrollView
          style={styles.body}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.bodyContent}
        >
          {/* User row */}
          <View style={styles.userRow}>
            <Avatar uri={user?.imageUrl} name={user?.fullName ?? t('common.me')} size="md" />
            <View>
              <Text style={styles.userName}>{user?.fullName ?? user?.username}</Text>
              {/* Visibility picker */}
              <Pressable
                style={[styles.visibilityPill, { backgroundColor: tc.bgElevated }]}
                onPress={() => setShowVisibility((v) => !v)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <Icon name={visibilityOption.iconName} size={12} color={tc.text.secondary} />
                  <Text style={styles.visibilityPillText}>{pillText}</Text>
                  <Icon name="chevron-down" size={12} color={tc.text.tertiary} />
                </View>
              </Pressable>
            </View>
          </View>

          {showVisibility && (
            <View style={[styles.visibilityMenu, { backgroundColor: tc.bgSheet, borderColor: tc.border }]}>
              {VISIBILITY_KEYS.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[styles.visOption, visibility === opt.value && styles.visOptionActive]}
                  onPress={() => {
                    setVisibility(opt.value);
                    setShowVisibility(false);
                    if (opt.value === 'CIRCLE') setShowCirclePicker(true);
                  }}
                >
                  <Icon name={opt.iconName} size="sm" color={visibility === opt.value ? colors.emerald : tc.text.secondary} />
                  <Text style={[styles.visOptionText, visibility === opt.value && styles.visOptionTextActive]}>
                    {t(opt.labelKey)}
                  </Text>
                  {visibility === opt.value && <Icon name="check" size="sm" color={colors.emerald} />}
                </Pressable>
              ))}
            </View>
          )}

          {/* Circle picker — shown when CIRCLE visibility is active */}
          {visibility === 'CIRCLE' && (
            <Pressable
              style={styles.circlePill}
              onPress={() => setShowCirclePicker(true)}
            >
              <Text style={styles.circlePillText}>
                {selectedCircle
                  ? selectedCircle.name
                  : t('compose.chooseCircle')}
              </Text>
              <Icon name="chevron-right" size="sm" color={colors.emerald} />
            </Pressable>
          )}

          {/* Caption input */}
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder={t('compose.whatsOnYourMind')}
            placeholderTextColor={tc.text.tertiary}
            accessibilityLabel={t('accessibility.postContent')}
            value={content}
            onChangeText={(text) => {
              setContent(text);

              // Detect if typing a hashtag or mention
              const cursorPos = text.length;
              const textBeforeCursor = text.slice(0, cursorPos);

              // Check for hashtag pattern: #word
              const hashMatch = textBeforeCursor.match(/#([a-zA-Z0-9_\u0600-\u06FF]*)$/);
              if (hashMatch) {
                setAutocompleteType('hashtag');
                setShowAutocomplete(true);
                setAutocompleteQuery(hashMatch[1]);
                return;
              }

              // Check for mention pattern: @word
              const mentionMatch = textBeforeCursor.match(/@([a-zA-Z0-9_\.]*)$/);
              if (mentionMatch) {
                setAutocompleteType('mention');
                setShowAutocomplete(true);
                setAutocompleteQuery(mentionMatch[1]);
                return;
              }

              // If no pattern matched, hide autocomplete
              if (showAutocomplete) {
                setShowAutocomplete(false);
                setAutocompleteType(null);
                setAutocompleteQuery('');
              }
            }}
            multiline
            maxLength={2200}
            autoFocus
          />

          {/* Premium glassmorphism media previews */}
          {media.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.mediaRow}
              contentContainerStyle={{ gap: spacing.sm, paddingEnd: spacing.base }}
            >
              {media.map((item, idx) => (
                <Animated.View key={idx} entering={FadeInUp.delay(idx * 50)} style={styles.mediaCard}>
                  <LinearGradient
                    colors={['rgba(45,53,72,0.5)', 'rgba(28,35,51,0.3)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.mediaCardGradient}
                  >
                    <ProgressiveImage uri={item.uri} width="100%" height={100} borderRadius={radius.md - 3} accessibilityLabel={altText || t('compose.contentImage')} />
                    {item.type === 'video' && (
                      <LinearGradient
                        colors={['rgba(0,0,0,0.6)', 'transparent']}
                        style={styles.videoBadgeGradient}
                      >
                        <Icon name="play" size={12} color="#fff" />
                      </LinearGradient>
                    )}
                    <Pressable
                      style={styles.removeMedia}
                      onPress={() => removeMedia(idx)}
                      hitSlop={4}
                      accessibilityLabel={t('compose.removeMedia')}
                      accessibilityRole="button"
                    >
                      <LinearGradient
                        colors={['rgba(248,81,73,0.9)', 'rgba(200,60,50,0.9)']}
                        style={styles.removeMediaGradient}
                      >
                        <Icon name="x" size={12} color="#fff" />
                      </LinearGradient>
                    </Pressable>
                    <Pressable
                      style={[styles.removeMedia, { top: undefined, bottom: spacing.xs }]}
                      onPress={() => {
                        const editorScreen = item.type === 'video'
                          ? '/(screens)/video-editor'
                          : '/(screens)/image-editor';
                        navigate(editorScreen, { uri: item.uri });
                      }}
                      hitSlop={4}
                      accessibilityLabel={t('compose.editMedia')}
                      accessibilityRole="button"
                    >
                      <LinearGradient
                        colors={['rgba(10,123,79,0.9)', 'rgba(10,123,79,0.7)']}
                        style={styles.removeMediaGradient}
                      >
                        <Icon name="pencil" size={12} color="#fff" />
                      </LinearGradient>
                    </Pressable>
                  </LinearGradient>
                </Animated.View>
              ))}
              {media.length < 10 && (
                <Pressable style={styles.addMoreMedia} onPress={pickMedia} accessibilityLabel={t('compose.addMoreMedia')} accessibilityRole="button">
                  <LinearGradient
                    colors={['rgba(10,123,79,0.1)', 'rgba(10,123,79,0.05)']}
                    style={styles.addMoreMediaGradient}
                  >
                    <Icon name="plus" size="md" color={colors.emerald} />
                  </LinearGradient>
                </Pressable>
              )}
            </ScrollView>
          )}

          {/* ═══════ Publish Settings ═══════ */}
          <Animated.View entering={FadeInUp.delay(200)} style={{ marginTop: spacing.xl, gap: spacing.md }}>
            {/* Section header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
              <View style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: colors.emerald }} />
              <Text style={{ color: tc.text.primary, fontSize: fontSize.base, fontFamily: 'DMSans_700Bold', fontWeight: '700' }}>
                {t('compose.publishSettings')}
              </Text>
            </View>

            {/* ── Alt text (accessibility) — animated accordion ── */}
            {media.length > 0 && (
              <AnimatedAccordion
                icon="eye"
                title={altText ? t('compose.altTextAdded') : t('compose.addAltText')}
                isActive={!!altText}
              >
                <View style={{ paddingTop: spacing.sm }}>
                  <TextInput
                    value={altText}
                    onChangeText={setAltText}
                    placeholder={t('compose.describeForScreenReaders')}
                    placeholderTextColor={tc.text.tertiary}
                    multiline
                    maxLength={1000}
                    style={{ color: tc.text.primary, fontSize: fontSize.sm, minHeight: 60, textAlignVertical: 'top', backgroundColor: tc.bgElevated, borderRadius: radius.md, padding: spacing.md }}
                    accessibilityLabel={t('compose.altTextInput')}
                  />
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.xs }}>
                    <CharCountRing current={altText.length} max={1000} size={20} />
                  </View>
                </View>
              </AnimatedAccordion>
            )}

            {/* ── Tag people — animated accordion ── */}
            <AnimatedAccordion
              icon="users"
              title={taggedUsers.length > 0 ? `${taggedUsers.length} ${t('compose.peopleTagged')}` : t('compose.tagPeople')}
              isActive={taggedUsers.length > 0}
            >
              <View style={{ paddingTop: spacing.sm }}>
                <TextInput
                  value={tagSearchQuery}
                  onChangeText={setTagSearchQuery}
                  placeholder={t('compose.searchPeopleToTag')}
                  placeholderTextColor={tc.text.tertiary}
                  autoCapitalize="none"
                  style={{ color: tc.text.primary, fontSize: fontSize.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: tc.bgElevated, borderRadius: radius.md }}
                  accessibilityLabel={t('compose.searchPeopleToTag')}
                />
                {taggedUsers.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm }}>
                    {taggedUsers.map((user, i) => (
                      <Pressable key={i} onPress={() => setTaggedUsers(prev => prev.filter((_, idx) => idx !== i))} hitSlop={4} accessibilityRole="button" accessibilityLabel={`${t('common.remove')} @${user}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', backgroundColor: pressed ? colors.active.emerald20 : colors.active.emerald10, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, gap: spacing.xs, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
                        <Text style={{ color: colors.emerald, fontSize: fontSize.xs, fontFamily: fonts.bodyBold, fontWeight: '600' }}>@{user}</Text>
                        <Icon name="x" size={12} color={colors.emerald} />
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </AnimatedAccordion>

            {/* ── Invite collaborator — animated accordion ── */}
            <AnimatedAccordion
              icon="users"
              iconColor={colors.gold}
              title={collaboratorUsername ? `${t('compose.collaborator')}: @${collaboratorUsername}` : t('compose.inviteCollaborator')}
              isActive={!!collaboratorUsername}
            >
              <View style={{ paddingTop: spacing.sm }}>
                <Text style={{ color: tc.text.secondary, fontSize: fontSize.xs, fontFamily: fonts.body, marginBottom: spacing.sm, lineHeight: 16 }}>
                  {t('compose.collaboratorDescription')}
                </Text>
                <TextInput
                  value={collaboratorUsername}
                  onChangeText={setCollaboratorUsername}
                  placeholder="@username"
                  placeholderTextColor={tc.text.tertiary}
                  autoCapitalize="none"
                  style={{ color: tc.text.primary, fontSize: fontSize.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: tc.bgElevated, borderRadius: radius.md }}
                  accessibilityLabel={t('compose.collaboratorUsername')}
                />
              </View>
            </AnimatedAccordion>

            {/* ── Who can comment ── */}
            <Pressable
              onPress={() => setShowCommentControl(!showCommentControl)}
              style={({ pressed }) => [publishRowStyle, { backgroundColor: tc.bgElevated, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
              accessibilityRole="button"
              accessibilityLabel={t('compose.whoCanComment')}
            >
              <Icon name="message-circle" size="sm" color={commentControl !== 'everyone' ? colors.emerald : tc.text.secondary} />
              <Text style={{ flex: 1, color: tc.text.primary, fontSize: fontSize.sm, fontWeight: '500' }}>
                {t('compose.whoCanComment')}
              </Text>
              <Text style={{ color: tc.text.secondary, fontSize: fontSize.xs, textTransform: 'capitalize' }}>
                {t(`compose.comment${commentControl.charAt(0).toUpperCase() + commentControl.slice(1)}`)}
              </Text>
              <Icon name="chevron-right" size="sm" color={tc.text.tertiary} />
            </Pressable>
            {showCommentControl && (
              <View style={{ backgroundColor: tc.bgElevated, borderRadius: radius.md, overflow: 'hidden' }}>
                {(['everyone', 'followers', 'nobody'] as const).map(opt => (
                  <Pressable
                    key={opt}
                    onPress={() => { setCommentControl(opt); setShowCommentControl(false); }}
                    style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.md, backgroundColor: commentControl === opt ? colors.active.emerald10 : 'transparent' }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: commentControl === opt }}
                    accessibilityLabel={t(`compose.comment${opt.charAt(0).toUpperCase() + opt.slice(1)}`)}
                  >
                    <Text style={{ flex: 1, color: commentControl === opt ? colors.emerald : tc.text.primary, fontSize: fontSize.sm, fontWeight: '500', textTransform: 'capitalize' }}>
                      {t(`compose.comment${opt.charAt(0).toUpperCase() + opt.slice(1)}`)}
                    </Text>
                    {commentControl === opt && <Icon name="check" size="sm" color={colors.emerald} />}
                  </Pressable>
                ))}
              </View>
            )}

            {/* ── Advanced settings toggle ── */}
            <Pressable
              onPress={() => setShowAdvancedSettings(!showAdvancedSettings)}
              style={({ pressed }) => [publishRowStyle, { backgroundColor: tc.bgElevated, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
              accessibilityRole="button"
              accessibilityLabel={t('compose.advancedSettings')}
            >
              <Icon name="settings" size="sm" color={tc.text.secondary} />
              <Text style={{ flex: 1, color: tc.text.primary, fontSize: fontSize.sm, fontWeight: '500' }}>
                {t('compose.advancedSettings')}
              </Text>
              <Icon name={showAdvancedSettings ? 'chevron-down' : 'chevron-right'} size="sm" color={tc.text.tertiary} />
            </Pressable>

            {showAdvancedSettings && (
              <View style={{ gap: spacing.sm }}>
                {/* Share to feed toggle */}
                <Pressable
                  onPress={() => setShareToFeed(!shareToFeed)}
                  style={({ pressed }) => [publishRowStyle, { backgroundColor: tc.bgElevated, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: shareToFeed }}
                  accessibilityLabel={t('compose.shareToFeed')}
                >
                  <Icon name="layers" size="sm" color={shareToFeed ? colors.emerald : tc.text.secondary} />
                  <Text style={{ flex: 1, color: tc.text.primary, fontSize: fontSize.sm, fontWeight: '500' }}>
                    {t('compose.shareToFeed')}
                  </Text>
                  <View style={{ width: 20, height: 20, borderRadius: radius.full, backgroundColor: shareToFeed ? colors.emerald : tc.surface, borderWidth: 1, borderColor: tc.border, justifyContent: 'center', alignItems: 'center' }}>
                    {shareToFeed && <Icon name="check" size={12} color="#fff" />}
                  </View>
                </Pressable>

                {/* Remix allowed toggle */}
                <Pressable
                  onPress={() => setRemixAllowed(!remixAllowed)}
                  style={({ pressed }) => [publishRowStyle, { backgroundColor: tc.bgElevated, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: remixAllowed }}
                  accessibilityLabel={t('compose.allowRemix')}
                >
                  <Icon name="repeat" size="sm" color={remixAllowed ? colors.emerald : tc.text.secondary} />
                  <Text style={{ flex: 1, color: tc.text.primary, fontSize: fontSize.sm, fontWeight: '500' }}>
                    {t('compose.allowRemix')}
                  </Text>
                  <View style={{ width: 20, height: 20, borderRadius: radius.full, backgroundColor: remixAllowed ? colors.emerald : tc.surface, borderWidth: 1, borderColor: tc.border, justifyContent: 'center', alignItems: 'center' }}>
                    {remixAllowed && <Icon name="check" size={12} color="#fff" />}
                  </View>
                </Pressable>

                {/* Branded content */}
                <Pressable
                  onPress={() => setBrandedContent(!brandedContent)}
                  style={({ pressed }) => [publishRowStyle, { backgroundColor: tc.bgElevated, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: brandedContent }}
                  accessibilityLabel={t('compose.brandedContent')}
                >
                  <Icon name="check-circle" size="sm" color={brandedContent ? colors.gold : tc.text.secondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: tc.text.primary, fontSize: fontSize.sm, fontWeight: '500' }}>
                      {t('compose.brandedContent')}
                    </Text>
                    <Text style={{ color: tc.text.tertiary, fontSize: fontSize.xs }}>
                      {t('compose.brandedContentHint')}
                    </Text>
                  </View>
                  <View style={{ width: 20, height: 20, borderRadius: radius.full, backgroundColor: brandedContent ? colors.gold : tc.surface, borderWidth: 1, borderColor: tc.border, justifyContent: 'center', alignItems: 'center' }}>
                    {brandedContent && <Icon name="check" size={12} color="#fff" />}
                  </View>
                </Pressable>
                {brandedContent && (
                  <View style={{ backgroundColor: tc.bgElevated, borderRadius: radius.md, padding: spacing.md }}>
                    <TextInput
                      value={brandPartner}
                      onChangeText={setBrandPartner}
                      placeholder={t('compose.brandPartnerPlaceholder')}
                      placeholderTextColor={tc.text.tertiary}
                      autoCapitalize="none"
                      style={{ color: tc.text.primary, fontSize: fontSize.sm }}
                      accessibilityLabel={t('compose.brandPartner')}
                    />
                  </View>
                )}

                {/* Topics / categories */}
                <Pressable
                  onPress={() => setShowTopics(!showTopics)}
                  style={({ pressed }) => [publishRowStyle, { backgroundColor: tc.bgElevated, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('compose.addTopics')}
                >
                  <Icon name="hash" size="sm" color={selectedTopics.length > 0 ? colors.emerald : tc.text.secondary} />
                  <Text style={{ flex: 1, color: tc.text.primary, fontSize: fontSize.sm, fontWeight: '500' }}>
                    {selectedTopics.length > 0 ? `${selectedTopics.length} ${t('compose.topicsSelected')}` : t('compose.addTopics')}
                  </Text>
                  <Icon name="chevron-right" size="sm" color={tc.text.tertiary} />
                </Pressable>
                {showTopics && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.sm }}>
                    {(['Islamic', 'Lifestyle', 'Education', 'Technology', 'Food', 'Travel', 'Fashion', 'Sports', 'Business', 'Art'] as const).map(topic => {
                      const isSelected = selectedTopics.includes(topic);
                      return (
                        <Pressable
                          key={topic}
                          onPress={() => {
                            setSelectedTopics(prev =>
                              isSelected ? prev.filter(t => t !== topic) : [...prev, topic].slice(0, 3)
                            );
                          }}
                          style={{
                            paddingHorizontal: spacing.md,
                            paddingVertical: spacing.sm,
                            borderRadius: radius.full,
                            backgroundColor: isSelected ? colors.emerald : tc.bgElevated,
                            borderWidth: 1,
                            borderColor: isSelected ? colors.emerald : tc.border,
                          }}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: isSelected }}
                          accessibilityLabel={topic}
                        >
                          <Text style={{ color: isSelected ? '#fff' : tc.text.primary, fontSize: fontSize.sm, fontWeight: '500' }}>
                            {t(`compose.topic${topic}`)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
          </Animated.View>
        </ScrollView>

        {/* Discard confirmation */}
        <BottomSheet visible={showDiscardSheet} onClose={() => setShowDiscardSheet(false)}>
          <BottomSheetItem
            label={t('common.saveDraft')}
            icon={<Icon name="bookmark" size="sm" color={tc.text.primary} />}
            onPress={async () => {
              try {
                await AsyncStorage.setItem('post-draft', JSON.stringify({
                  content,
                  mediaUrls: media.map(m => m.uri),
                }));
                setShowDiscardSheet(false);
                showToast({ message: t('common.draftSaved'), variant: 'success' });
                router.back();
              } catch {
                showToast({ message: t('compose.failedToSaveDraft'), variant: 'error' });
              }
            }}
          />
          <BottomSheetItem
            label={t('compose.discard')}
            icon={<Icon name="trash" size="sm" color={colors.error} />}
            destructive
            onPress={async () => {
              setShowDiscardSheet(false);
              await AsyncStorage.removeItem('post-draft').catch(() => {});
              router.back();
            }}
          />
          <BottomSheetItem
            label={t('common.cancel')}
            icon={<Icon name="x" size="sm" color={tc.text.primary} />}
            onPress={() => setShowDiscardSheet(false)}
          />
        </BottomSheet>

        {/* Circle picker */}
        <BottomSheet visible={showCirclePicker} onClose={() => setShowCirclePicker(false)}>
          <Text style={styles.sheetTitle}>{t('compose.chooseCircle')}</Text>
          {circlesQuery.isLoading ? (
            <View style={styles.skeletonList}>
              {Array.from({ length: 3 }).map((_, i) => (
                <View key={i} style={styles.skeletonRow}>
                  <Skeleton.Circle size={36} />
                  <View style={{ flex: 1, gap: spacing.xs }}>
                    <Skeleton.Rect width={120} height={14} />
                    <Skeleton.Rect width={80} height={11} />
                  </View>
                </View>
              ))}
            </View>
          ) : circles.length === 0 ? (
            <View style={styles.emptyCircles}>
              <Text style={styles.emptyCirclesText}>{t('compose.noCirclesYet')}</Text>
              <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }} onPress={() => { setShowCirclePicker(false); router.push('/(screens)/circles'); }}>
                <Text style={styles.emptyCirclesLink}>{t('compose.createCircle')}</Text>
                <Icon name="chevron-right" size="sm" color={colors.emerald} />
              </Pressable>
            </View>
          ) : (
            circles.map((c) => (
              <BottomSheetItem
                key={c.id}
                label={c.name}
                icon={
                  <View style={styles.circleIconWrap}>
                    {c.emoji ? (
                      <Text style={styles.circleEmoji}>{c.emoji}</Text>
                    ) : (
                      <Icon name="users" size="sm" color={colors.emerald} />
                    )}
                  </View>
                }
                onPress={() => { setCircleId(c.id); setShowCirclePicker(false); }}
              />
            ))
          )}
        </BottomSheet>

        {/* Upload progress overlay */}
        {uploading && (
          <View style={styles.uploadOverlay}>
            <Skeleton.Circle size={48} />
            <Text style={styles.uploadText}>{t('compose.uploadingMedia')}</Text>
          </View>
        )}

        {/* Location display */}
        {location && (
          <View style={styles.locationPill}>
            <Icon name="map-pin" size="xs" color={colors.emerald} />
            <Text style={styles.locationPillText}>{location.name}</Text>
            <Pressable onPress={() => setLocation(null)} hitSlop={8}>
              <Icon name="x" size="xs" color={tc.text.tertiary} />
            </Pressable>
          </View>
        )}

        {/* Autocomplete dropdown */}
        <Autocomplete
          visible={showAutocomplete}
          type={autocompleteType || 'hashtag'}
          query={autocompleteQuery}
          onSelect={(value) => {
            // Find cursor position and replace the partial tag
            const cursorPos = content.length;
            const lastHashIndex = content.lastIndexOf('#', cursorPos - 1);
            const lastAtIndex = content.lastIndexOf('@', cursorPos - 1);

            let newContent = content;
            if (autocompleteType === 'hashtag' && lastHashIndex !== -1) {
              // Replace from # to cursor with the selected hashtag
              const before = content.slice(0, lastHashIndex);
              const after = content.slice(cursorPos);
              newContent = before + value + ' ' + after;
            } else if (autocompleteType === 'mention' && lastAtIndex !== -1) {
              // Replace from @ to cursor with the selected mention
              const before = content.slice(0, lastAtIndex);
              const after = content.slice(cursorPos);
              newContent = before + value + ' ' + after;
            }
            setContent(newContent);
          }}
          onClose={() => {
            setShowAutocomplete(false);
            setAutocompleteType(null);
            setAutocompleteQuery('');
          }}
        />

        {/* Location Picker */}
        <LocationPicker
          visible={showLocationPicker}
          onClose={() => setShowLocationPicker(false)}
          onSelect={(loc) => setLocation(loc)}
        />

        {/* Premium gradient toolbar */}
        <LinearGradient
          colors={['transparent', 'rgba(13,17,23,0.95)', tc.bg]}
          locations={[0, 0.3, 1]}
          style={styles.toolbarGradient}
        >
          <View style={[styles.toolbar, { backgroundColor: tc.bg, borderTopColor: tc.border }]}>
            <Pressable onPress={pickMedia} hitSlop={8} style={styles.toolbarBtn}>
              <LinearGradient
                colors={['rgba(10,123,79,0.1)', 'rgba(10,123,79,0.05)']}
                style={[styles.toolbarBtnGradient, media.length > 0 && styles.toolbarBtnGradientActive]}
              >
                <Icon name="image" size="md" color={media.length > 0 ? colors.emerald : tc.text.secondary} />
                {media.length > 0 && (
                  <View style={[styles.mediaBadge, { borderColor: tc.bg }]}>
                    <Text style={styles.mediaBadgeText}>{media.length}</Text>
                  </View>
                )}
              </LinearGradient>
            </Pressable>

            <Pressable
              hitSlop={8}
              style={styles.toolbarBtn}
              onPress={() => setShowLocationPicker(true)}
            >
              <LinearGradient
                colors={location ? [colors.active.emerald10, 'rgba(10,123,79,0.05)'] : ['rgba(45,53,72,0.3)', 'rgba(45,53,72,0.1)']}
                style={styles.toolbarBtnGradient}
              >
                <Icon name="map-pin" size="md" color={location ? colors.emerald : tc.text.secondary} />
              </LinearGradient>
            </Pressable>

            <Pressable
              hitSlop={8}
              style={styles.toolbarBtn}
              onPress={() => {
                setAutocompleteType('hashtag');
                setShowAutocomplete(true);
                setAutocompleteQuery('');
                inputRef.current?.focus();
              }}
            >
              <LinearGradient
                colors={showAutocomplete && autocompleteType === 'hashtag' ? [colors.active.emerald10, 'rgba(10,123,79,0.05)'] : ['rgba(45,53,72,0.3)', 'rgba(45,53,72,0.1)']}
                style={styles.toolbarBtnGradient}
              >
                <Icon name="hash" size="md" color={showAutocomplete && autocompleteType === 'hashtag' ? colors.emerald : tc.text.secondary} />
              </LinearGradient>
            </Pressable>

            <Pressable
              hitSlop={8}
              style={styles.toolbarBtn}
              onPress={() => {
                setAutocompleteType('mention');
                setShowAutocomplete(true);
                setAutocompleteQuery('');
                inputRef.current?.focus();
              }}
            >
              <LinearGradient
                colors={showAutocomplete && autocompleteType === 'mention' ? [colors.active.emerald10, 'rgba(10,123,79,0.05)'] : ['rgba(45,53,72,0.3)', 'rgba(45,53,72,0.1)']}
                style={styles.toolbarBtnGradient}
              >
                <Icon name="at-sign" size="md" color={showAutocomplete && autocompleteType === 'mention' ? colors.emerald : tc.text.secondary} />
              </LinearGradient>
            </Pressable>

            <Pressable
              style={styles.toolbarBtn}
              onPress={async () => {
                try {
                  await draftsApi.save('SAF', {
                    content,
                    mediaUrls: media.map(m => m.uri),
                    mediaTypes: media.map(m => m.type),
                    visibility,
                    circleId,
                  });
                  showToast({ message: t('compose.draftSavedToAccount'), variant: 'success' });
                } catch {
                  showToast({ message: t('compose.failedToSaveDraft'), variant: 'error' });
                }
              }}
              accessibilityLabel={t('accessibility.saveDraftToCloud')}
              accessibilityRole="button"
            >
              <LinearGradient
                colors={['rgba(200,150,62,0.1)', 'rgba(200,150,62,0.05)']}
                style={styles.toolbarBtnGradient}
              >
                <Icon name="clock" size="sm" color={colors.gold} />
              </LinearGradient>
            </Pressable>

            <Pressable
              style={styles.toolbarBtn}
              onPress={() => navigate('/(screens)/schedule-post', { space: 'saf' })}
              accessibilityLabel={t('screens.schedule-post.title')}
              accessibilityRole="button"
            >
              <LinearGradient
                colors={['rgba(10,123,79,0.1)', 'rgba(10,123,79,0.05)']}
                style={styles.toolbarBtnGradient}
              >
                <Icon name="calendar" size="sm" color={colors.emerald} />
              </LinearGradient>
            </Pressable>

            <Pressable
              style={styles.toolbarBtn}
              onPress={() => navigate('/(screens)/branded-content')}
              accessibilityLabel={t('saf.brandedContent')}
              accessibilityRole="button"
            >
              <LinearGradient
                colors={['rgba(200,150,62,0.1)', 'rgba(200,150,62,0.05)']}
                style={styles.toolbarBtnGradient}
              >
                <Icon name="check-circle" size="sm" color={colors.gold} />
              </LinearGradient>
            </Pressable>

            <View style={styles.toolbarSpacer} />

            {/* Animated char count with glow effect */}
            <View style={styles.charCountContainer}>
              <LinearGradient
                colors={content.length > 2000 ? ['rgba(248,81,73,0.2)', 'transparent'] : ['rgba(10,123,79,0.1)', 'transparent']}
                style={styles.charCountGlow}
              >
                <CharCountRing current={content.length} max={2200} />
              </LinearGradient>
            </View>
          </View>
        </LinearGradient>
      </SafeAreaView>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.dark.border,
    backgroundColor: 'rgba(13, 17, 23, 0.92)',
  },
  headerTitle: { color: colors.text.primary, fontSize: fontSize.md, fontWeight: '700', letterSpacing: 0.2 },
  draftBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.active.emerald10,
    borderWidth: 1,
    borderColor: colors.emerald,
    borderRadius: radius.md,
    marginHorizontal: spacing.base,
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  draftBannerText: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },

  // Body
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 80 },

  // User row
  userRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  userName: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700', marginBottom: spacing.xs },
  visibilityPill: {
    backgroundColor: colors.dark.bgElevated, borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  visibilityPillText: { color: colors.text.secondary, fontSize: fontSize.xs, fontWeight: '600' },

  // Visibility dropdown
  visibilityMenu: {
    backgroundColor: colors.dark.bgSheet, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.dark.border,
    marginBottom: spacing.md, overflow: 'hidden',
  },
  visOption: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
  },
  visOptionActive: { backgroundColor: colors.active.emerald10 },
  visOptionText: { flex: 1, color: colors.text.secondary, fontSize: fontSize.base },
  visOptionTextActive: { color: colors.text.primary, fontWeight: '600' },

  // Caption
  input: {
    color: colors.text.primary, fontSize: fontSize.base, lineHeight: 24,
    minHeight: 120, textAlignVertical: 'top',
  },
  // Premium media cards
  mediaRow: { marginTop: spacing.md },
  mediaCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  mediaCardGradient: {
    width: 120,
    height: 120,
    borderRadius: radius.lg,
    padding: 3,
  },
  mediaThumbnail: {
    width: 100, height: 100, borderRadius: radius.md, overflow: 'hidden',
    backgroundColor: colors.dark.bgElevated,
  },
  mediaImage: {
    width: '100%',
    height: '100%',
    borderRadius: radius.md - 3,
  },
  videoBadgeGradient: {
    position: 'absolute',
    bottom: 6,
    start: 6,
    end: 6,
    top: '50%',
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoBadge: {
    position: 'absolute', bottom: 6, start: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.md,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  removeMedia: {
    position: 'absolute',
    top: spacing.xs,
    end: spacing.xs,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  removeMediaGradient: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  addMoreMedia: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  addMoreMediaGradient: {
    width: 120,
    height: 120,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.active.emerald30,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Upload overlay
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13,17,23,0.85)',
    alignItems: 'center', justifyContent: 'center', gap: spacing.md,
  },
  uploadText: { color: colors.text.primary, fontSize: fontSize.base },

  // Toolbar
  toolbar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    borderTopWidth: 0.5, borderTopColor: colors.dark.border,
    paddingBottom: Platform.OS === 'ios' ? spacing.lg : spacing.sm,
    backgroundColor: colors.dark.bg,
  },
  toolbarBtn: { padding: spacing.xs },
  toolbarSpacer: { flex: 1 },
  toolbarBtnActive: { opacity: 1 },

  // Location pill
  locationPill: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.active.emerald10,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    alignSelf: 'flex-start',
    borderWidth: 1, borderColor: colors.emerald,
  },
  locationPillText: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },

  // Circle inline pill
  circlePill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.active.emerald10, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.emerald,
  },
  circlePillText: { flex: 1, color: colors.emerald, fontSize: fontSize.sm, fontWeight: '600' },

  // Circle picker sheet
  sheetTitle: {
    color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700',
    paddingHorizontal: spacing.xl, paddingBottom: spacing.sm,
  },
  skeletonList: { paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.md },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  circleIconWrap: { width: 36, height: 36, borderRadius: radius.full, backgroundColor: colors.active.emerald10, alignItems: 'center', justifyContent: 'center' },
  circleEmoji: { fontSize: 18 },
  emptyCircles: { alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyCirclesText: { color: colors.text.secondary, fontSize: fontSize.base },
  emptyCirclesLink: { color: colors.emerald, fontSize: fontSize.base, fontWeight: '600' },

  // Premium toolbar styles
  toolbarGradient: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
    paddingTop: spacing.xl,
  },
  toolbarBtnGradient: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarBtnGradientActive: {
    borderWidth: 1,
    borderColor: colors.emerald,
  },
  mediaBadge: {
    position: 'absolute',
    top: -4,
    end: -4,
    backgroundColor: colors.emerald,
    borderRadius: radius.md,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.dark.bg,
  },
  mediaBadgeText: {
    color: '#fff',
    fontSize: fontSizeExt.tiny,
    fontWeight: '700',
  },
  charCountContainer: {
    padding: 4,
    borderRadius: radius.full,
  },
  charCountGlow: {
    padding: 4,
    borderRadius: radius.full,
  },
});

// Shared publish row style
const publishRowStyle: import('react-native').ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: spacing.md,
  padding: spacing.md,
  borderRadius: radius.md,
};
