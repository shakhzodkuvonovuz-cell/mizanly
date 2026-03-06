import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Platform, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { Autocomplete } from '@/components/ui/Autocomplete';
import { LocationPicker } from '@/components/ui/LocationPicker';
import { colors, spacing, fontSize, radius } from '@/theme';
import { postsApi, uploadApi, circlesApi } from '@/services/api';

type Visibility = 'PUBLIC' | 'FOLLOWERS' | 'CIRCLE';

interface PickedMedia {
  uri: string;
  type: 'image' | 'video';
  width?: number;
  height?: number;
}

type AutocompleteType = 'hashtag' | 'mention' | null;

type VisIconName = React.ComponentProps<typeof Icon>['name'];
const VISIBILITY_OPTIONS: { value: Visibility; label: string; iconName: VisIconName }[] = [
  { value: 'PUBLIC', label: 'Everyone', iconName: 'globe' },
  { value: 'FOLLOWERS', label: 'Followers', iconName: 'users' },
  { value: 'CIRCLE', label: 'Circle', iconName: 'lock' },
];

export default function CreatePostScreen() {
  const router = useRouter();
  const { user } = useUser();
  const queryClient = useQueryClient();

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

  // Location state
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [location, setLocation] = useState<{ name: string; latitude?: number; longitude?: number } | null>(null);

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
        console.warn('Failed to load draft', err);
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
        console.warn('Failed to save draft', err);
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
  const circles: any[] = (circlesQuery.data as any[]) ?? [];

  // ── Media picker ──
  const pickMedia = async () => {
    if (media.length >= 10) {
      Alert.alert('Limit reached', 'You can add up to 10 photos or videos.');
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
      const picked: PickedMedia[] = result.assets.map((a) => ({
        uri: a.uri,
        type: a.type === 'video' ? 'video' : 'image',
        width: a.width,
        height: a.height,
      }));
      setMedia((prev) => [...prev, ...picked].slice(0, 10));
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
      });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['saf-feed'] });
      try {
        await AsyncStorage.removeItem('post-draft');
      } catch (err) {
        console.warn('Failed to clear draft', err);
      }
      router.back();
    },
    onError: (err: Error) => {
      setUploading(false);
      Alert.alert('Error', err.message || 'Failed to create post. Please try again.');
    },
  });

  const canPost =
    (content.trim().length > 0 || media.length > 0) && !createMutation.isPending;

  const visibilityLabel = VISIBILITY_OPTIONS.find((o) => o.value === visibility)!;
  const selectedCircle = circles.find((c) => c.id === circleId);
  const pillText = visibility === 'CIRCLE' && selectedCircle
    ? selectedCircle.name
    : visibilityLabel.label;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Post</Text>
        <TouchableOpacity
          style={[styles.postBtn, !canPost && styles.postBtnDisabled]}
          onPress={() => canPost && createMutation.mutate()}
          disabled={!canPost}
        >
          {createMutation.isPending ? (
            <ActivityIndicator color={colors.text.primary} size="small" />
          ) : (
            <Text style={styles.postBtnText}>Share</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Draft restored banner */}
      {showDraftBanner && (
        <View style={styles.draftBanner}>
          <Icon name="clock" size="sm" color={colors.gold} />
          <Text style={styles.draftBannerText}>Draft restored</Text>
          <TouchableOpacity onPress={() => setShowDraftBanner(false)} hitSlop={8}>
            <Icon name="x" size="xs" color={colors.text.secondary} />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={styles.body}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.bodyContent}
      >
        {/* User row */}
        <View style={styles.userRow}>
          <Avatar uri={user?.imageUrl} name={user?.fullName ?? 'Me'} size="md" />
          <View>
            <Text style={styles.userName}>{user?.fullName ?? user?.username}</Text>
            {/* Visibility picker */}
            <TouchableOpacity
              style={styles.visibilityPill}
              onPress={() => setShowVisibility((v) => !v)}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Icon name={visibilityLabel.iconName} size={12} color={colors.text.secondary} />
                <Text style={styles.visibilityPillText}>{pillText}</Text>
                <Icon name="chevron-down" size={12} color={colors.text.tertiary} />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {showVisibility && (
          <View style={styles.visibilityMenu}>
            {VISIBILITY_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.visOption, visibility === opt.value && styles.visOptionActive]}
                onPress={() => {
                  setVisibility(opt.value);
                  setShowVisibility(false);
                  if (opt.value === 'CIRCLE') setShowCirclePicker(true);
                }}
              >
                <Icon name={opt.iconName} size="sm" color={visibility === opt.value ? colors.emerald : colors.text.secondary} />
                <Text style={[styles.visOptionText, visibility === opt.value && styles.visOptionTextActive]}>
                  {opt.label}
                </Text>
                {visibility === opt.value && <Icon name="check" size="sm" color={colors.emerald} />}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Circle picker — shown when CIRCLE visibility is active */}
        {visibility === 'CIRCLE' && (
          <TouchableOpacity
            style={styles.circlePill}
            onPress={() => setShowCirclePicker(true)}
          >
            <Text style={styles.circlePillText}>
              {selectedCircle
                ? selectedCircle.name
                : 'Choose a circle…'}
            </Text>
            <Icon name="chevron-right" size="sm" color={colors.emerald} />
          </TouchableOpacity>
        )}

        {/* Caption input */}
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="What's on your mind?"
          placeholderTextColor={colors.text.tertiary}
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

        {/* Media previews */}
        {media.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.mediaRow}
            contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.base }}
          >
            {media.map((item, idx) => (
              <View key={idx} style={styles.mediaThumbnail}>
                <Image source={{ uri: item.uri }} style={styles.mediaImage} contentFit="cover" />
                {item.type === 'video' && (
                  <View style={styles.videoBadge}><Icon name="play" size={10} color="#fff" /></View>
                )}
                <TouchableOpacity
                  style={styles.removeMedia}
                  onPress={() => removeMedia(idx)}
                  hitSlop={4}
                >
                  <Icon name="x" size={12} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
            {media.length < 10 && (
              <TouchableOpacity style={styles.addMoreMedia} onPress={pickMedia}>
                <Icon name="plus" size="md" color={colors.text.secondary} />
              </TouchableOpacity>
            )}
          </ScrollView>
        )}
      </ScrollView>

      {/* Circle picker */}
      <BottomSheet visible={showCirclePicker} onClose={() => setShowCirclePicker(false)}>
        <Text style={styles.sheetTitle}>Choose a Circle</Text>
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
            <Text style={styles.emptyCirclesText}>You haven't created any circles yet.</Text>
            <TouchableOpacity onPress={() => { setShowCirclePicker(false); router.push('/(screens)/circles'); }}>
              <Text style={styles.emptyCirclesLink}>Create a circle →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          circles.map((c) => (
            <BottomSheetItem
              key={c.id}
              label={c.name}
              icon={
                <View style={styles.circleIconWrap}>
                  <Text style={styles.circleEmoji}>{c.emoji ?? '●'}</Text>
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
          <ActivityIndicator color={colors.emerald} size="large" />
          <Text style={styles.uploadText}>Uploading media…</Text>
        </View>
      )}

      {/* Location display */}
      {location && (
        <View style={styles.locationPill}>
          <Icon name="map-pin" size="xs" color={colors.emerald} />
          <Text style={styles.locationPillText}>{location.name}</Text>
          <TouchableOpacity onPress={() => setLocation(null)} hitSlop={8}>
            <Icon name="x" size="xs" color={colors.text.tertiary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Autocomplete dropdown */}
      <Autocomplete
        visible={showAutocomplete}
        type={autocompleteType || 'hashtag'}
        query={autocompleteQuery}
        onSelect={(value) => {
          // Find cursor position and replace the partial tag
          const cursorPos = inputRef.current?._lastNativeText?.length ?? content.length;
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

      {/* Bottom toolbar */}
      <View style={styles.toolbar}>
        <TouchableOpacity onPress={pickMedia} hitSlop={8} style={styles.toolbarBtn}>
          <Icon name="image" size="md" color={colors.text.secondary} />
        </TouchableOpacity>
        <TouchableOpacity
          hitSlop={8}
          style={[styles.toolbarBtn, location && styles.toolbarBtnActive]}
          onPress={() => setShowLocationPicker(true)}
        >
          <Icon name="map-pin" size="md" color={location ? colors.emerald : colors.text.secondary} />
        </TouchableOpacity>
        <TouchableOpacity
          hitSlop={8}
          style={[styles.toolbarBtn, showAutocomplete && autocompleteType === 'hashtag' && styles.toolbarBtnActive]}
          onPress={() => {
            setAutocompleteType('hashtag');
            setShowAutocomplete(true);
            setAutocompleteQuery('');
            inputRef.current?.focus();
          }}
        >
          <Icon name="hash" size="md" color={showAutocomplete && autocompleteType === 'hashtag' ? colors.emerald : colors.text.secondary} />
        </TouchableOpacity>
        <TouchableOpacity
          hitSlop={8}
          style={[styles.toolbarBtn, showAutocomplete && autocompleteType === 'mention' && styles.toolbarBtnActive]}
          onPress={() => {
            setAutocompleteType('mention');
            setShowAutocomplete(true);
            setAutocompleteQuery('');
            inputRef.current?.focus();
          }}
        >
          <Icon name="at-sign" size="md" color={showAutocomplete && autocompleteType === 'mention' ? colors.emerald : colors.text.secondary} />
        </TouchableOpacity>
        <View style={styles.toolbarSpacer} />
        <CharCountRing current={content.length} max={2200} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  cancelText: { color: colors.text.secondary, fontSize: fontSize.base },
  headerTitle: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  postBtn: {
    backgroundColor: colors.emerald, borderRadius: radius.full,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.xs + 2,
    minWidth: 70, alignItems: 'center',
  },
  postBtnDisabled: { backgroundColor: colors.dark.surface },
  postBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700' },
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
  visOptionActive: { backgroundColor: 'rgba(10,123,79,0.1)' },
  visOptionText: { flex: 1, color: colors.text.secondary, fontSize: fontSize.base },
  visOptionTextActive: { color: colors.text.primary, fontWeight: '600' },

  // Caption
  input: {
    color: colors.text.primary, fontSize: fontSize.base, lineHeight: 24,
    minHeight: 120, textAlignVertical: 'top',
  },
  // Media
  mediaRow: { marginTop: spacing.md },
  mediaThumbnail: {
    width: 100, height: 100, borderRadius: radius.md, overflow: 'hidden',
    backgroundColor: colors.dark.bgElevated,
  },
  mediaImage: { width: '100%', height: '100%' },
  videoBadge: {
    position: 'absolute', bottom: 6, left: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.md,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  removeMedia: {
    position: 'absolute', top: spacing.xs, right: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: radius.md,
    width: 20, height: 20, alignItems: 'center', justifyContent: 'center',
  },
  addMoreMedia: {
    width: 100, height: 100, borderRadius: radius.md,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.dark.border,
    alignItems: 'center', justifyContent: 'center',
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
    backgroundColor: 'rgba(10,123,79,0.1)', borderRadius: radius.md,
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
});
