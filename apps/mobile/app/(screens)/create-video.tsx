import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Video, ResizeMode } from 'expo-av';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { colors, spacing, fontSize, radius } from '@/theme';
import { channelsApi, videosApi, uploadApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { navigate } from '@/utils/navigation';
import { showToast } from '@/components/ui/Toast';

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
  const tc = useThemeColors();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

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

  // Thumbnail & audio
  const [thumbnailOptions, setThumbnailOptions] = useState<string[]>([]);
  const [customThumbnail, setCustomThumbnail] = useState(false);
  const [normalizeAudio, setNormalizeAudio] = useState(false);

  // UI state
  const [showDiscardSheet, setShowDiscardSheet] = useState(false);
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

  // Generate thumbnail frames from video
  const generateFrames = async (videoUri: string, durationMs: number) => {
    const frameCount = Math.min(10, Math.max(3, Math.floor(durationMs / 1000)));
    const interval = durationMs / (frameCount + 1);
    const frames: string[] = [];

    for (let i = 1; i <= frameCount; i++) {
      try {
        const { uri: frameUri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
          time: Math.floor(interval * i),
        });
        frames.push(frameUri);
      } catch {
        // Skip failed frames
      }
    }

    setThumbnailOptions(frames);
    if (frames.length > 0) {
      setThumbnailUri(frames[0]);
    }
  };

  // Pick video
  const MAX_LONG_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB

  const pickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showToast({ message: t('createVideo.grantPermission'), variant: 'error' });
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
      // Check file size
      let fileSize = asset.fileSize;
      if (!fileSize) {
        const info = await FileSystem.getInfoAsync(asset.uri, { size: true });
        fileSize = info.exists && 'size' in info ? info.size : 0;
      }
      if (fileSize > MAX_LONG_VIDEO_SIZE) {
        showToast({ message: t('createVideo.videoTooLarge', { max: '500MB' }), variant: 'error' });
        return;
      }
      const videoAsset: PickedVideo = {
        uri: asset.uri,
        type: 'video',
        duration: asset.duration || 0,
        width: asset.width,
        height: asset.height,
      };
      setVideo(videoAsset);
      setThumbnailUri(null); // reset thumbnail
      setThumbnailOptions([]);
      setCustomThumbnail(false);

      // Generate thumbnail frames filmstrip
      generateFrames(asset.uri, (asset.duration || 0) * 1000);
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
        normalizeAudio,
      });
    },
    onSuccess: (video) => {
      // Clear draft
      AsyncStorage.removeItem('video-draft').catch(() => {});
      // Invalidate feeds
      queryClient.invalidateQueries({ queryKey: ['videos-feed'] });
      queryClient.invalidateQueries({ queryKey: ['channel-videos'] });
      showToast({ message: t('createVideo.videoUploaded'), variant: 'success' });
      // Navigate to video page
      router.replace(`/(screens)/video/${video.id}`);
    },
    onError: (error: Error) => {
      showToast({ message: error.message || t('createVideo.pleaseTryAgain'), variant: 'error' });
    },
    onSettled: () => {
      setUploading(false);
      setUploadProgress(0);
    },
  });

  const handleBack = () => {
    const hasContent = video || title.trim() || description.trim() || tags.length > 0;
    if (hasContent) {
      setShowDiscardSheet(true);
    } else {
      router.back();
    }
  };

  const handleSubmit = () => {
    if (!video) {
      showToast({ message: t('createVideo.selectVideoToUpload'), variant: 'error' });
      return;
    }
    if (!title.trim()) {
      showToast({ message: t('createVideo.enterVideoTitle'), variant: 'error' });
      return;
    }
    if (!selectedChannelId) {
      showToast({ message: t('minbar.pleaseSelectChannel'), variant: 'error' });
      return;
    }
    uploadMutation.mutate();
  };

  const selectedChannel = channels.find(c => c.id === selectedChannelId);

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('createVideo.title')}
          leftAction={{ icon: 'x', onPress: handleBack, accessibilityLabel: t('common.close') }}
          rightActions={[{ icon: 'send', onPress: handleSubmit, accessibilityLabel: t('createVideo.upload') }]}
        />

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 52 }}>
          {/* Video picker */}
          <Pressable style={[styles.videoPicker, { backgroundColor: tc.surface }]} onPress={pickVideo}>
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
                <Icon name="video" size="xl" color={tc.text.secondary} />
                <Text style={styles.videoPlaceholderText}>{t('createVideo.selectVideo')}</Text>
                <Text style={styles.videoPlaceholderSub}>{t('createVideo.longFormSupported')}</Text>
              </View>
            )}
          </Pressable>

          {/* Thumbnail picker */}
          <View style={styles.thumbnailSection}>
            <Text style={styles.sectionLabel}>{t('createVideo.thumbnailOptional')}</Text>
            <Pressable style={[styles.thumbnailPicker, { backgroundColor: tc.surface }]} onPress={pickThumbnail}>
              {thumbnailUri ? (
                <ProgressiveImage uri={thumbnailUri} width="100%" height={200} contentFit="cover" />
              ) : (
                <View style={styles.thumbnailPlaceholder}>
                  <Icon name="image" size="md" color={tc.text.secondary} />
                  <Text style={styles.thumbnailPlaceholderText}>{t('createVideo.pickThumbnail')}</Text>
                </View>
              )}
            </Pressable>
            <Text style={styles.thumbnailHint}>
              {t('createVideo.thumbnailAutoGenerated')}
            </Text>
          </View>

          {/* Thumbnail filmstrip */}
          {video && thumbnailOptions.length > 0 && (
            <View style={styles.filmstripSection}>
              <Text style={styles.sectionLabel}>{t('createVideo.selectThumbnail')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                {thumbnailOptions.map((frame, index) => (
                  <Pressable
                    accessibilityRole="button"
                    key={index}
                    onPress={() => { setThumbnailUri(frame); setCustomThumbnail(false); }}
                    style={[
                      styles.thumbnailFrame,
                      thumbnailUri === frame && !customThumbnail && styles.thumbnailFrameSelected,
                    ]}
                  >
                    <ProgressiveImage uri={frame} width={80} height={45} borderRadius={radius.sm} />
                  </Pressable>
                ))}
                <Pressable
                  accessibilityRole="button"
                  onPress={async () => {
                    const result = await ImagePicker.launchImageLibraryAsync({
                      mediaTypes: ['images'],
                      quality: 0.8,
                    });
                    if (!result.canceled && result.assets[0]) {
                      setThumbnailUri(result.assets[0].uri);
                      setCustomThumbnail(true);
                    }
                  }}
                  style={[styles.thumbnailFrame, styles.uploadThumbnailButton]}
                >
                  <Icon name="image" size="md" color={tc.text.secondary} />
                  <Text style={styles.uploadThumbnailText}>{t('createVideo.customThumbnail')}</Text>
                </Pressable>
              </ScrollView>
            </View>
          )}

          {/* Quick tools */}
          {video && (
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
              <Pressable
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, backgroundColor: tc.surface, borderRadius: radius.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: tc.border }}
                onPress={() => navigate('/(screens)/caption-editor', { videoUri: video.uri })}
              >
                <Icon name="edit" size="sm" color={colors.emerald} />
                <Text style={{ color: tc.text.primary, fontSize: fontSize.sm }}>{t('ai.captions.title')}</Text>
              </Pressable>
              <Pressable
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, backgroundColor: tc.surface, borderRadius: radius.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: tc.border }}
                onPress={() => navigate('/(screens)/video-editor', { uri: video.uri })}
              >
                <Icon name="video" size="sm" color={colors.gold} />
                <Text style={{ color: tc.text.primary, fontSize: fontSize.sm }}>{t('common.edit')}</Text>
              </Pressable>
            </View>
          )}

          {/* Title */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t('createVideo.titleField')}</Text>
            <TextInput
              style={[styles.titleInput, { backgroundColor: tc.surface }]}
              placeholder={t('createVideo.titlePlaceholder')}
              placeholderTextColor={tc.text.tertiary}
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
            <Text style={styles.fieldLabel}>{t('createVideo.descriptionField')}</Text>
            <TextInput
              style={[styles.descriptionInput, { backgroundColor: tc.surface }]}
              placeholder={t('createVideo.descriptionPlaceholder')}
              placeholderTextColor={tc.text.tertiary}
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={5000}
            />
            <CharCountRing current={description.length} max={5000} size={24} />
          </View>

          {/* Category */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t('createVideo.categoryField')}</Text>
            <Pressable
              accessibilityRole="button"
              style={[styles.pickerButton, { backgroundColor: tc.surface }]}
              onPress={() => setShowCategorySheet(true)}
            >
              <Text style={styles.pickerText}>{selectedCategory.replace('_', ' ').toLowerCase()}</Text>
              <Icon name="chevron-down" size="sm" color={tc.text.secondary} />
            </Pressable>
          </View>

          {/* Tags */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t('createVideo.tagsField')}</Text>
            <View style={styles.tagInputRow}>
              <TextInput
                style={[styles.tagInput, { backgroundColor: tc.surface }]}
                placeholder={t('createVideo.tagPlaceholder')}
                placeholderTextColor={tc.text.tertiary}
                value={tagInput}
                onChangeText={setTagInput}
                onSubmitEditing={addTag}
              />
              <Pressable style={styles.tagAddButton} onPress={addTag}>
                <Icon name="plus" size="xs" color={tc.text.primary} />
              </Pressable>
            </View>
            {tags.length > 0 && (
              <View style={styles.tagsContainer}>
                {tags.map(tag => (
                  <View key={tag} style={[styles.tagChip, { backgroundColor: tc.bgElevated }]}>
                    <Text style={styles.tagText}>#{tag}</Text>
                    <Pressable onPress={() => removeTag(tag)} hitSlop={8}>
                      <Icon name="x" size={10} color={tc.text.secondary} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Channel selector (if multiple channels) */}
          {channels.length > 1 && (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>{t('createVideo.channelField')}</Text>
              <Pressable
                accessibilityRole="button"
                style={[styles.pickerButton, { backgroundColor: tc.surface }]}
                onPress={() => setShowChannelSheet(true)}
              >
                <Text style={styles.pickerText}>{selectedChannel?.name || t('createVideo.selectChannel')}</Text>
                <Icon name="chevron-down" size="sm" color={tc.text.secondary} />
              </Pressable>
            </View>
          )}

          {/* Visibility */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t('createVideo.visibilityField')}</Text>
            <Pressable
              accessibilityRole="button"
              style={[styles.pickerButton, { backgroundColor: tc.surface }]}
              onPress={() => setShowVisibilitySheet(true)}
            >
              <Text style={styles.pickerText}>
                {visibility === 'PUBLIC' ? t('createVideo.public') : visibility === 'UNLISTED' ? t('createVideo.unlisted') : t('createVideo.private')}
              </Text>
              <Icon name="chevron-down" size="sm" color={tc.text.secondary} />
            </Pressable>
          </View>

          {/* Normalize audio toggle */}
          <View style={styles.field}>
            <View style={[styles.toggleRow, { borderBottomColor: tc.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>{t('createVideo.normalizeAudio')}</Text>
                <Text style={styles.toggleSubtitle}>{t('createVideo.normalizeAudioDesc')}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => setNormalizeAudio(!normalizeAudio)}
                style={[styles.toggle, normalizeAudio && styles.toggleActive]}
              >
                <View style={[styles.toggleThumb, normalizeAudio && styles.toggleThumbActive]} />
              </Pressable>
            </View>
          </View>
        </ScrollView>

        {/* Upload progress — progress callbacks require XMLHttpRequest or expo-file-system */}
        {uploading && (
          <View style={[styles.progressContainer, { backgroundColor: tc.bg, borderTopColor: tc.border }]}>
            <View style={[styles.progressBar, { backgroundColor: tc.border }]}>
              <View style={[styles.progressFill, { width: '100%' }]} />
            </View>
            <Text style={styles.progressText}>{t('createVideo.uploading')}</Text>
          </View>
        )}

        {/* Category bottom sheet */}
        <BottomSheet visible={showCategorySheet} onClose={() => setShowCategorySheet(false)}>
          <View style={[styles.sheetHeader, { borderBottomColor: tc.border }]}>
            <Text style={styles.sheetTitle}>{t('createVideo.selectCategory')}</Text>
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
          <View style={[styles.sheetHeader, { borderBottomColor: tc.border }]}>
            <Text style={styles.sheetTitle}>{t('createVideo.selectChannel')}</Text>
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
          <View style={[styles.sheetHeader, { borderBottomColor: tc.border }]}>
            <Text style={styles.sheetTitle}>{t('createVideo.visibility')}</Text>
          </View>
          <BottomSheetItem
            label={t('createVideo.public')}
            onPress={() => { setVisibility('PUBLIC'); setShowVisibilitySheet(false); }}
          />
          <BottomSheetItem
            label={t('createVideo.unlisted')}
            onPress={() => { setVisibility('UNLISTED'); setShowVisibilitySheet(false); }}
          />
          <BottomSheetItem
            label={t('createVideo.private')}
            onPress={() => { setVisibility('PRIVATE'); setShowVisibilitySheet(false); }}
          />
        </BottomSheet>

        {/* Discard confirmation */}
        <BottomSheet visible={showDiscardSheet} onClose={() => setShowDiscardSheet(false)}>
          <BottomSheetItem
            label={t('common.saveDraft')}
            icon={<Icon name="bookmark" size="sm" color={tc.text.primary} />}
            onPress={async () => {
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
                setShowDiscardSheet(false);
                showToast({ message: t('common.draftSaved'), variant: 'success' });
                router.back();
              } catch {
                showToast({ message: t('common.error'), variant: 'error' });
              }
            }}
          />
          <BottomSheetItem
            label={t('compose.discard')}
            icon={<Icon name="trash" size="sm" color={colors.error} />}
            destructive
            onPress={async () => {
              setShowDiscardSheet(false);
              await AsyncStorage.removeItem('video-draft').catch(() => {});
              router.back();
            }}
          />
          <BottomSheetItem
            label={t('common.cancel')}
            icon={<Icon name="x" size="sm" color={tc.text.primary} />}
            onPress={() => setShowDiscardSheet(false)}
          />
        </BottomSheet>
      </View>

    </ScreenErrorBoundary>
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
  filmstripSection: {
    paddingHorizontal: spacing.base,
    marginBottom: spacing.lg,
  },
  thumbnailFrame: {
    width: 80,
    height: 45,
    borderRadius: radius.sm,
    overflow: 'hidden' as const,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbnailFrameSelected: {
    borderColor: colors.emerald,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  uploadThumbnailButton: {
    backgroundColor: colors.dark.bgCard,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderStyle: 'dashed' as const,
    borderColor: colors.dark.border,
  },
  uploadThumbnailText: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  toggleRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.dark.border,
  },
  toggleLabel: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '500' as const,
  },
  toggleSubtitle: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
    justifyContent: 'center' as const,
    padding: 2,
  },
  toggleActive: {
    backgroundColor: colors.emerald,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: colors.text.primary,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end' as const,
  },
});