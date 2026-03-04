import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize } from '@/theme';
import { storiesApi, uploadApi } from '@/services/api';

export default function CreateStoryScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [textOverlay, setTextOverlay] = useState('');
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [closeFriendsOnly, setCloseFriendsOnly] = useState(false);
  const [uploading, setUploading] = useState(false);

  const pickMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.9,
    });
    if (!result.canceled) {
      setMediaUri(result.assets[0].uri);
      setMediaType(result.assets[0].type === 'video' ? 'video' : 'image');
    }
  };

  const TEXT_COLORS = ['#FFFFFF', '#000000', '#0A7B4F', '#C8963E', '#FF453A', '#30D158'];

  const postMutation = useMutation({
    mutationFn: async () => {
      if (!mediaUri) throw new Error('No media selected');

      setUploading(true);
      const ext = mediaUri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const contentType = mediaType === 'video' ? `video/${ext}` : `image/${ext}`;
      const folder = mediaType === 'video' ? 'stories' : 'stories';

      const { uploadUrl, publicUrl } = await uploadApi.getPresignUrl(contentType, folder);
      const fileRes = await fetch(mediaUri);
      const blob = await fileRes.blob();
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT', body: blob, headers: { 'Content-Type': contentType },
      });
      if (!uploadRes.ok) throw new Error('Upload failed');
      setUploading(false);

      return storiesApi.create({
        mediaUrl: publicUrl,
        mediaType: contentType,
        textOverlay: textOverlay.trim() || undefined,
        textColor: textOverlay.trim() ? textColor : undefined,
        closeFriendsOnly,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stories-feed'] });
      router.back();
    },
    onError: (err: Error) => {
      setUploading(false);
      Alert.alert('Error', err.message || 'Could not post story');
    },
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Story</Text>
        <TouchableOpacity
          style={[styles.postBtn, (!mediaUri || postMutation.isPending || uploading) && styles.postBtnDisabled]}
          onPress={() => postMutation.mutate()}
          disabled={!mediaUri || postMutation.isPending || uploading}
        >
          {postMutation.isPending || uploading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.postBtnText}>Share</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Preview */}
      <TouchableOpacity style={styles.previewArea} onPress={pickMedia} activeOpacity={0.85}>
        {mediaUri ? (
          <Image source={{ uri: mediaUri }} style={styles.preview} contentFit="cover" />
        ) : (
          <View style={styles.pickPlaceholder}>
            <Icon name="camera" size={48} color={colors.text.secondary} />
            <Text style={styles.pickText}>Tap to pick a photo or video</Text>
          </View>
        )}

        {/* Text overlay preview */}
        {textOverlay.trim().length > 0 && (
          <View style={styles.textOverlayPreview}>
            <Text style={[styles.overlayText, { color: textColor }]}>{textOverlay}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Controls */}
      <View style={styles.controls}>
        {/* Text overlay input */}
        <View style={styles.textRow}>
          <Text style={styles.controlLabel}>Text</Text>
          <TextInput
            style={styles.textInput}
            value={textOverlay}
            onChangeText={setTextOverlay}
            placeholder="Add text overlay…"
            placeholderTextColor={colors.text.tertiary}
            maxLength={100}
          />
        </View>

        {/* Color picker */}
        {textOverlay.trim().length > 0 && (
          <View style={styles.colorRow}>
            <Text style={styles.controlLabel}>Color</Text>
            <View style={styles.colorPicker}>
              {TEXT_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorSwatch, { backgroundColor: c }, textColor === c && styles.colorSwatchActive]}
                  onPress={() => setTextColor(c)}
                />
              ))}
            </View>
          </View>
        )}

        {/* Close friends toggle */}
        <TouchableOpacity
          style={styles.toggleRow}
          onPress={() => setCloseFriendsOnly((v) => !v)}
          activeOpacity={0.7}
        >
          <View style={styles.toggleIcon}>
            <Icon name={closeFriendsOnly ? 'lock' : 'globe'} size="sm" color={colors.text.secondary} />
          </View>
          <View style={styles.toggleText}>
            <Text style={styles.toggleLabel}>
              {closeFriendsOnly ? 'Close Friends Only' : 'Everyone'}
            </Text>
            <Text style={styles.toggleHint}>
              {closeFriendsOnly ? 'Only your close friends list' : 'Visible to your followers'}
            </Text>
          </View>
          <Icon name="chevron-right" size="sm" color={colors.text.tertiary} />
        </TouchableOpacity>
      </View>
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
  postBtn: {
    backgroundColor: colors.emerald, borderRadius: 20,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.xs + 2,
    minWidth: 70, alignItems: 'center',
  },
  postBtnDisabled: { backgroundColor: colors.dark.surface },
  postBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700' },

  previewArea: {
    flex: 1, backgroundColor: colors.dark.bgElevated, position: 'relative',
    margin: spacing.base, borderRadius: 16, overflow: 'hidden',
  },
  preview: { ...StyleSheet.absoluteFillObject },
  pickPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  pickText: { color: colors.text.secondary, fontSize: fontSize.base },

  textOverlayPreview: {
    position: 'absolute', top: '40%', left: spacing.lg, right: spacing.lg,
    alignItems: 'center',
  },
  overlayText: {
    fontSize: fontSize.xl, fontWeight: '700', textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },

  controls: { paddingHorizontal: spacing.base, paddingBottom: spacing.md },

  textRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  controlLabel: { color: colors.text.secondary, fontSize: fontSize.sm, width: 44 },
  textInput: {
    flex: 1, color: colors.text.primary, fontSize: fontSize.base,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
    paddingVertical: Platform.OS === 'ios' ? spacing.xs : 0,
  },

  colorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  colorPicker: { flex: 1, flexDirection: 'row', gap: spacing.sm },
  colorSwatch: { width: 28, height: 28, borderRadius: 14 },
  colorSwatchActive: { borderWidth: 2, borderColor: colors.emerald },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 0.5, borderTopColor: colors.dark.border,
  },
  toggleIcon: { width: 36, alignItems: 'center' },
  toggleText: { flex: 1 },
  toggleLabel: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  toggleHint: { color: colors.text.secondary, fontSize: fontSize.xs, marginTop: 2 },
});
