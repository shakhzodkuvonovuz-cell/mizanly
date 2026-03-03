import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Platform, FlatList, Alert, Modal, Pressable,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Avatar } from '@/components/ui/Avatar';
import { colors, spacing, fontSize } from '@/theme';
import { postsApi, uploadApi, circlesApi } from '@/services/api';

type Visibility = 'PUBLIC' | 'FOLLOWERS' | 'CIRCLE';

interface PickedMedia {
  uri: string;
  type: 'image' | 'video';
  width?: number;
  height?: number;
}

const VISIBILITY_OPTIONS: { value: Visibility; label: string; icon: string }[] = [
  { value: 'PUBLIC', label: 'Everyone', icon: '🌍' },
  { value: 'FOLLOWERS', label: 'Followers', icon: '👥' },
  { value: 'CIRCLE', label: 'Circle', icon: '⭕' },
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

  const inputRef = useRef<TextInput>(null);

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
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saf-feed'] });
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
  const pillLabel = visibility === 'CIRCLE' && selectedCircle
    ? `${selectedCircle.emoji ?? '⭕'} ${selectedCircle.name}`
    : `${visibilityLabel.icon} ${visibilityLabel.label}`;

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
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.postBtnText}>Share</Text>
          )}
        </TouchableOpacity>
      </View>

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
              <Text style={styles.visibilityPillText}>{pillLabel} ▾</Text>
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
                <Text style={styles.visOptionIcon}>{opt.icon}</Text>
                <Text style={[styles.visOptionText, visibility === opt.value && styles.visOptionTextActive]}>
                  {opt.label}
                </Text>
                {visibility === opt.value && <Text style={styles.visCheck}>✓</Text>}
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
                ? `${selectedCircle.emoji ?? '⭕'} ${selectedCircle.name}`
                : '⭕ Choose a circle…'}
            </Text>
            <Text style={styles.circlePillChevron}>›</Text>
          </TouchableOpacity>
        )}

        {/* Caption input */}
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="What's on your mind?"
          placeholderTextColor={colors.text.tertiary}
          value={content}
          onChangeText={setContent}
          multiline
          maxLength={2200}
          autoFocus
        />

        {content.length > 1800 && (
          <Text style={styles.charCount}>{2200 - content.length} remaining</Text>
        )}

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
                  <View style={styles.videoBadge}><Text style={styles.videoBadgeText}>▶</Text></View>
                )}
                <TouchableOpacity
                  style={styles.removeMedia}
                  onPress={() => removeMedia(idx)}
                  hitSlop={4}
                >
                  <Text style={styles.removeMediaText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            {media.length < 10 && (
              <TouchableOpacity style={styles.addMoreMedia} onPress={pickMedia}>
                <Text style={styles.addMoreIcon}>+</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        )}
      </ScrollView>

      {/* Circle picker modal */}
      <Modal visible={showCirclePicker} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowCirclePicker(false)}>
          <Pressable style={styles.sheet}>
            <Text style={styles.sheetTitle}>Choose a Circle</Text>
            {circlesQuery.isLoading ? (
              <ActivityIndicator color={colors.emerald} style={{ marginVertical: 24 }} />
            ) : circles.length === 0 ? (
              <View style={styles.emptyCircles}>
                <Text style={styles.emptyCirclesText}>You haven't created any circles yet.</Text>
                <TouchableOpacity onPress={() => { setShowCirclePicker(false); router.push('/(screens)/circles'); }}>
                  <Text style={styles.emptyCirclesLink}>Create a circle →</Text>
                </TouchableOpacity>
              </View>
            ) : (
              circles.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.circleRow, circleId === c.id && styles.circleRowActive]}
                  onPress={() => { setCircleId(c.id); setShowCirclePicker(false); }}
                >
                  <Text style={styles.circleEmoji}>{c.emoji ?? '⭕'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.circleName}>{c.name}</Text>
                    <Text style={styles.circleMeta}>{c._count?.members ?? 0} members</Text>
                  </View>
                  {circleId === c.id && <Text style={styles.circleCheck}>✓</Text>}
                </TouchableOpacity>
              ))
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Upload progress overlay */}
      {uploading && (
        <View style={styles.uploadOverlay}>
          <ActivityIndicator color={colors.emerald} size="large" />
          <Text style={styles.uploadText}>Uploading media…</Text>
        </View>
      )}

      {/* Bottom toolbar */}
      <View style={styles.toolbar}>
        <TouchableOpacity onPress={pickMedia} hitSlop={8} style={styles.toolbarBtn}>
          <Text style={styles.toolbarIcon}>🖼️</Text>
        </TouchableOpacity>
        <TouchableOpacity hitSlop={8} style={styles.toolbarBtn}>
          <Text style={styles.toolbarIcon}>📍</Text>
        </TouchableOpacity>
        <TouchableOpacity hitSlop={8} style={styles.toolbarBtn}>
          <Text style={styles.toolbarIcon}>#</Text>
        </TouchableOpacity>
        <TouchableOpacity hitSlop={8} style={styles.toolbarBtn}>
          <Text style={styles.toolbarIcon}>@</Text>
        </TouchableOpacity>
        <View style={styles.toolbarSpacer} />
        <Text style={styles.charCountInline}>{content.length}/2200</Text>
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
    backgroundColor: colors.emerald, borderRadius: 20,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.xs + 2,
    minWidth: 70, alignItems: 'center',
  },
  postBtnDisabled: { backgroundColor: colors.dark.surface },
  postBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700' },

  // Body
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 80 },

  // User row
  userRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  userName: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700', marginBottom: 4 },
  visibilityPill: {
    backgroundColor: colors.dark.bgElevated, borderRadius: 20,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  visibilityPillText: { color: colors.text.secondary, fontSize: fontSize.xs, fontWeight: '600' },

  // Visibility dropdown
  visibilityMenu: {
    backgroundColor: colors.dark.bgSheet, borderRadius: 12,
    borderWidth: 1, borderColor: colors.dark.border,
    marginBottom: spacing.md, overflow: 'hidden',
  },
  visOption: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
  },
  visOptionActive: { backgroundColor: 'rgba(10,123,79,0.1)' },
  visOptionIcon: { fontSize: 18 },
  visOptionText: { flex: 1, color: colors.text.secondary, fontSize: fontSize.base },
  visOptionTextActive: { color: colors.text.primary, fontWeight: '600' },
  visCheck: { color: colors.emerald, fontSize: fontSize.base },

  // Caption
  input: {
    color: colors.text.primary, fontSize: fontSize.base, lineHeight: 24,
    minHeight: 120, textAlignVertical: 'top',
  },
  charCount: {
    color: colors.text.tertiary, fontSize: fontSize.xs, textAlign: 'right', marginTop: spacing.xs,
  },

  // Media
  mediaRow: { marginTop: spacing.md },
  mediaThumbnail: {
    width: 100, height: 100, borderRadius: 10, overflow: 'hidden',
    backgroundColor: colors.dark.bgElevated,
  },
  mediaImage: { width: '100%', height: '100%' },
  videoBadge: {
    position: 'absolute', bottom: 6, left: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  videoBadgeText: { color: '#fff', fontSize: 10 },
  removeMedia: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 10,
    width: 20, height: 20, alignItems: 'center', justifyContent: 'center',
  },
  removeMediaText: { color: '#fff', fontSize: 12 },
  addMoreMedia: {
    width: 100, height: 100, borderRadius: 10,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.dark.border,
    alignItems: 'center', justifyContent: 'center',
  },
  addMoreIcon: { color: colors.text.secondary, fontSize: 28 },

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
  toolbarIcon: { fontSize: 22 },
  toolbarSpacer: { flex: 1 },
  charCountInline: { color: colors.text.tertiary, fontSize: fontSize.xs },

  // Circle inline pill
  circlePill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(10,123,79,0.1)', borderRadius: 10,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.emerald,
  },
  circlePillText: { flex: 1, color: colors.emerald, fontSize: fontSize.sm, fontWeight: '600' },
  circlePillChevron: { color: colors.emerald, fontSize: 18 },

  // Circle picker modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.dark.bgSheet, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: spacing.base, paddingTop: spacing.lg, paddingBottom: spacing.xl,
    maxHeight: '60%',
  },
  sheetTitle: {
    color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '700',
    textAlign: 'center', marginBottom: spacing.lg,
  },
  circleRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  circleRowActive: { backgroundColor: 'rgba(10,123,79,0.08)' },
  circleEmoji: { fontSize: 22, width: 32, textAlign: 'center' },
  circleName: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  circleMeta: { color: colors.text.secondary, fontSize: fontSize.xs, marginTop: 2 },
  circleCheck: { color: colors.emerald, fontSize: fontSize.base, fontWeight: '700' },
  emptyCircles: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  emptyCirclesText: { color: colors.text.secondary, fontSize: fontSize.base },
  emptyCirclesLink: { color: colors.emerald, fontSize: fontSize.base, fontWeight: '600' },
});
