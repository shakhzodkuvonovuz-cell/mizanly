import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  Alert, Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
// expo-video-thumbnails not installed — thumbnail generation skipped
const VideoThumbnail = { getThumbnailAsync: async (_uri: string, _opts?: { time?: number }) => ({ uri: '' }) };
import { Video, ResizeMode } from 'expo-av';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { colors, spacing, fontSize, radius } from '@/theme';
import { channelsApi, videosApi, uploadApi } from '@/services/api';

const CATEGORIES = [
  'EDUCATION', 'QURAN', 'LECTURE', 'VLOG', 'NEWS', 'DOCUMENTARY',
  'ENTERTAINMENT', 'SPORTS', 'COOKING', 'TECH', 'OTHER',
] as const;

type VideoCategory = typeof CATEGORIES[number];
type Visibility = 'PUBLIC' | 'UNLISTED' | 'PRIVATE';

interface PickedVideo {
  uri: string;
  type: 'video';
  duration: number;
  width?: number;
  height?: number;
}

export default function CreateVideoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const queryClient = useQueryClient();

  // Video state
  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  // Form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<VideoCategory>('EDUCATION');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [visibility, setVisibility] = useState<Visibility>('PUBLIC');

  // UI state
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [showVisibilitySheet, setShowVisibilitySheet] = useState(false);
  const [showChannelSheet, setShowChannelSheet] = useState(false);

  // Draft auto-save
  const draftSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch user's channels
  const channelsQuery = useQuery({
    queryKey: ['my-channels'],
    queryFn: () => channelsApi.getMyChannels(),
  });

  const channels = channelsQuery.data ?? [];

  // Auto-select first channel if only one
  useEffect(() => {
    if (channels.length === 1 && !selectedChannelId) {
      setSelectedChannelId(channels[0].id);
    }
  }, [channels, selectedChannelId]);

  // Load draft on mount
  useEffect(() => {
    const loadDraft = async () => {
      try {
        const saved = await AsyncStorage.getItem('video-draft');
        if (saved) {
          const draft = JSON.parse(saved);
          if (draft.title) setTitle(draft.title);
          if (draft.description) setDescription(draft.description);
          if (draft.category) setSelectedCategory(draft.category);
          if (draft.tags) setTags(draft.tags);
          if (draft.channelId) setSelectedChannelId(draft.channelId);
          if (draft.visibility) setVisibility(draft.visibility);
          // Note: cannot restore video/thumbnail files
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
        const draft = {
          title,
          description,
          category: selectedCategory,
          tags,
          channelId: selectedChannelId,
          visibility,
        };
        await AsyncStorage.setItem('video-draft', JSON.stringify(draft));
      } catch (err) {
      }
    }, 1000);
  }, [title, description, selectedCategory, tags, selectedChannelId, visibility]);

  // Auto-save when fields change
  useEffect(() => {
    saveDraft();
  }, [saveDraft]);

  // Pick video
  const pickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please grant permission to access videos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: false,
      quality: 1,
      videoMaxDuration: 0, // no limit (long-form)
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      const videoAsset: PickedVideo = {
        uri: asset.uri,
        type: 'video',
        duration: asset.duration || 0,
        width: asset.width,
        height: asset.height,
      };
      setVideo(videoAsset);
      setThumbnailUri(null); // reset thumbnail

      // Try to generate thumbnail
      try {
        const { uri } = await VideoThumbnail.getThumbnailAsync(asset.uri, {
          time: Math.min(1000, (asset.duration || 1) * 1000 / 2),
        });
        setThumbnailUri(uri);
      } catch (e) {
      }
    }
  };

  // Pick thumbnail
  const pickThumbnail = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled) {
      setThumbnailUri(result.assets[0].uri);
    }
  };

  // Add tag
  const addTag = () => {
    const trimmed = tagInput.trim().replace(/\s+/g, '-').toLowerCase();
    if (trimmed && !tags.includes(trimmed) && tags.length < 10) {
      setTags([...tags, trimmed]);
      setTagInput('');
    }
  };

  // Remove tag
  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  // Upload video
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!video || !selectedChannelId) throw new Error('Missing video or channel');

      setUploading(true);
      setUploadProgress(0);

      // 1. Upload video
      const videoPresign = await uploadApi.getPresignUrl('video/mp4', 'videos');
      const videoRes = await fetch(videoPresign.uploadUrl, {
        method: 'PUT',
        body: await fetch(video.uri).then(r => r.blob()),
        headers: { 'Content-Type': 'video/mp4' },
      });
      if (!videoRes.ok) throw new Error('Failed to upload video');
      const videoUrl = videoPresign.publicUrl;

      // 2. Upload thumbnail if exists
      let thumbnailUrl = undefined;
      if (thumbnailUri) {
        const thumbPresign = await uploadApi.getPresignUrl('image/jpeg', 'thumbnails');
        const thumbRes = await fetch(thumbPresign.uploadUrl, {
          method: 'PUT',
          body: await fetch(thumbnailUri).then(r => r.blob()),
          headers: { 'Content-Type': 'image/jpeg' },
        });
        if (thumbRes.ok) {
          thumbnailUrl = thumbPresign.publicUrl;
        }
      }

      // 3. Create video record
      return videosApi.create({
        channelId: selectedChannelId,
        title,
        description: description || undefined,
        videoUrl,
        thumbnailUrl,
        duration: Math.round(video.duration),
        category: selectedCategory,
        tags: tags.length > 0 ? tags : undefined,
      });
    },
    onSuccess: (video) => {
      // Clear draft
      AsyncStorage.removeItem('video-draft').catch(() => {});
      // Invalidate feeds
      queryClient.invalidateQueries({ queryKey: ['videos-feed'] });
      queryClient.invalidateQueries({ queryKey: ['channel-videos'] });
      // Navigate to video page
      router.replace(`/(screens)/video/${video.id}`);
    },
    onError: (error: Error) => {
      Alert.alert('Upload failed', error.message || 'Please try again.');
    },
    onSettled: () => {
      setUploading(false);
      setUploadProgress(0);
    },
  });

  const handleSubmit = () => {
    if (!video) {
      Alert.alert('Missing video', 'Please select a video to upload.');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Missing title', 'Please enter a video title.');
      return;
    }
    if (!selectedChannelId) {
      Alert.alert('Missing channel', 'Please select a channel.');
      return;
    }
    uploadMutation.mutate();
  };

  const selectedChannel = channels.find(c => c.id === selectedChannelId);

  return (
    <View style={styles.container}>
      <GlassHeader
        title="Upload Video"
        leftAction={{ icon: 'x', onPress: () => router.back(), accessibilityLabel: 'Close' }}
        rightActions={[{ icon: 'send', onPress: handleSubmit, accessibilityLabel: 'Upload' }]}
      />

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 52 }}>
        {/* Video picker */}
        <TouchableOpacity style={styles.videoPicker} onPress={pickVideo} activeOpacity={0.8}>
          {video ? (
            <>
              <Video
                source={{ uri: video.uri }}
                style={styles.videoPreview}
                resizeMode={ResizeMode.COVER}
                useNativeControls={false}
              />
              <View style={styles.videoOverlay}>
                <Icon name="video" size="lg" color="#FFF" />
                <Text style={styles.videoDuration}>
                  {Math.floor(video.duration / 60)}:{Math.floor(video.duration % 60).toString().padStart(2, '0')}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.videoPlaceholder}>
              <Icon name="video" size="xl" color={colors.text.secondary} />
              <Text style={styles.videoPlaceholderText}>Select video</Text>
              <Text style={styles.videoPlaceholderSub}>Long‑form videos supported</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Thumbnail picker */}
        <View style={styles.thumbnailSection}>
          <Text style={styles.sectionLabel}>Thumbnail (optional)</Text>
          <TouchableOpacity style={styles.thumbnailPicker} onPress={pickThumbnail} activeOpacity={0.8}>
            {thumbnailUri ? (
              <Image source={{ uri: thumbnailUri }} style={styles.thumbnail} />
            ) : (
              <View style={styles.thumbnailPlaceholder}>
                <Icon name="image" size="md" color={colors.text.secondary} />
                <Text style={styles.thumbnailPlaceholderText}>Pick thumbnail</Text>
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.thumbnailHint}>
            Thumbnail will be auto‑generated from video if not selected.
          </Text>
        </View>

        {/* Title */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Title *</Text>
          <TextInput
            style={styles.titleInput}
            placeholder="Enter video title"
            placeholderTextColor={colors.text.tertiary}
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />
          <View style={styles.titleFooter}>
            <CharCountRing current={title.length} max={100} size={28} />
          </View>
        </View>

        {/* Description */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Description</Text>
          <TextInput
            style={styles.descriptionInput}
            placeholder="Describe your video"
            placeholderTextColor={colors.text.tertiary}
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={5000}
          />
          <Text style={styles.charCount}>{description.length}/5000</Text>
        </View>

        {/* Category */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Category</Text>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => setShowCategorySheet(true)}
          >
            <Text style={styles.pickerText}>{selectedCategory.replace('_', ' ').toLowerCase()}</Text>
            <Icon name="chevron-down" size="sm" color={colors.text.secondary} />
          </TouchableOpacity>
        </View>

        {/* Tags */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Tags</Text>
          <View style={styles.tagInputRow}>
            <TextInput
              style={styles.tagInput}
              placeholder="Add a tag"
              placeholderTextColor={colors.text.tertiary}
              value={tagInput}
              onChangeText={setTagInput}
              onSubmitEditing={addTag}
            />
            <TouchableOpacity style={styles.tagAddButton} onPress={addTag}>
              <Icon name="plus" size="xs" color={colors.text.primary} />
            </TouchableOpacity>
          </View>
          {tags.length > 0 && (
            <View style={styles.tagsContainer}>
              {tags.map(tag => (
                <View key={tag} style={styles.tagChip}>
                  <Text style={styles.tagText}>#{tag}</Text>
                  <TouchableOpacity onPress={() => removeTag(tag)} hitSlop={8}>
                    <Icon name="x" size={10} color={colors.text.secondary} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Channel selector (if multiple channels) */}
        {channels.length > 1 && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Channel</Text>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowChannelSheet(true)}
            >
              <Text style={styles.pickerText}>{selectedChannel?.name || 'Select channel'}</Text>
              <Icon name="chevron-down" size="sm" color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Visibility */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Visibility</Text>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => setShowVisibilitySheet(true)}
          >
            <Text style={styles.pickerText}>
              {visibility === 'PUBLIC' ? 'Public' : visibility === 'UNLISTED' ? 'Unlisted' : 'Private'}
            </Text>
            <Icon name="chevron-down" size="sm" color={colors.text.secondary} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Upload progress */}
      {uploading && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${uploadProgress * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>Uploading... {Math.round(uploadProgress * 100)}%</Text>
        </View>
      )}

      {/* Category bottom sheet */}
      <BottomSheet visible={showCategorySheet} onClose={() => setShowCategorySheet(false)}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Select category</Text>
        </View>
        {CATEGORIES.map(cat => (
          <BottomSheetItem
            key={cat}
            label={cat.replace('_', ' ').toLowerCase()}
            onPress={() => {
              setSelectedCategory(cat);
              setShowCategorySheet(false);
            }}
          />
        ))}
      </BottomSheet>

      {/* Channel bottom sheet */}
      <BottomSheet visible={showChannelSheet} onClose={() => setShowChannelSheet(false)}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Select channel</Text>
        </View>
        {channels.map(channel => (
          <BottomSheetItem
            key={channel.id}
            label={channel.name}
            onPress={() => {
              setSelectedChannelId(channel.id);
              setShowChannelSheet(false);
            }}
          />
        ))}
      </BottomSheet>

      {/* Visibility bottom sheet */}
      <BottomSheet visible={showVisibilitySheet} onClose={() => setShowVisibilitySheet(false)}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Visibility</Text>
        </View>
        <BottomSheetItem
          label="Public"
          onPress={() => { setVisibility('PUBLIC'); setShowVisibilitySheet(false); }}
        />
        <BottomSheetItem
          label="Unlisted"
          onPress={() => { setVisibility('UNLISTED'); setShowVisibilitySheet(false); }}
        />
        <BottomSheetItem
          label="Private"
          onPress={() => { setVisibility('PRIVATE'); setShowVisibilitySheet(false); }}
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  scroll: {
    flex: 1,
  },
  videoPicker: {
    margin: spacing.base,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.md,
    aspectRatio: 16 / 9,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPreview: {
    width: '100%',
    height: '100%',
  },
  videoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
  },
  videoDuration: {
    color: '#FFF',
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  videoPlaceholder: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  videoPlaceholderText: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  videoPlaceholderSub: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  thumbnailSection: {
    paddingHorizontal: spacing.base,
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  thumbnailPicker: {
    backgroundColor: colors.dark.surface,
    borderRadius: radius.md,
    aspectRatio: 16 / 9,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  thumbnailPlaceholderText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  thumbnailHint: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  field: {
    paddingHorizontal: spacing.base,
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  titleInput: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
    backgroundColor: colors.dark.surface,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  titleFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.xs,
  },
  descriptionInput: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  charCount: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  pickerButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.dark.surface,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pickerText: {
    color: colors.text.primary,
    fontSize: fontSize.base,
  },
  tagInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tagInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.base,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tagAddButton: {
    backgroundColor: colors.emerald,
    borderRadius: radius.sm,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  tagText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  progressContainer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.dark.border,
    backgroundColor: colors.dark.bg,
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.dark.border,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.emerald,
  },
  progressText: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  sheetHeader: {
    alignItems: 'center',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.dark.border,
  },
  sheetTitle: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
});