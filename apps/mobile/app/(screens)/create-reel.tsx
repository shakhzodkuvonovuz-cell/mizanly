import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Platform, Alert, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';
import { Image } from 'expo-image';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { Autocomplete } from '@/components/ui/Autocomplete';
import { colors, spacing, fontSize, radius } from '@/theme';
import { reelsApi, uploadApi } from '@/services/api';
import { useHaptic } from '@/hooks/useHaptic';

const { width: SCREEN_W } = Dimensions.get('window');
const VIDEO_PREVIEW_WIDTH = SCREEN_W - spacing.base * 2;
const VIDEO_PREVIEW_HEIGHT = VIDEO_PREVIEW_WIDTH * (16 / 9);

type PickedVideo = {
  uri: string;
  type: 'video';
  duration: number;
  width?: number;
  height?: number;
};

type AutocompleteType = 'hashtag' | 'mention' | null;

export default function CreateReelScreen() {
  const router = useRouter();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const haptic = useHaptic();

  const [caption, setCaption] = useState('');
  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [mentions, setMentions] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showAutocomplete, setShowAutocomplete] = useState<AutocompleteType>(null);
  const [autocompleteAnchor, setAutocompleteAnchor] = useState(0);
  const captionInputRef = useRef<TextInput>(null);

  const videoRef = useRef<Video>(null);

  // Request permissions on mount
  useEffect(() => {
    (async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please grant access to your media library to upload videos.');
      }
    })();
  }, []);

  const pickVideo = useCallback(async () => {
    haptic.light();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      aspect: [9, 16],
      quality: 1,
      videoMaxDuration: 60, // 60 seconds max
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setVideo({
        uri: asset.uri,
        type: 'video',
        duration: asset.duration || 0,
        width: asset.width,
        height: asset.height,
      });
      // Generate thumbnail from first frame
      setThumbnailUri(asset.uri); // expo-av can extract thumbnail, but for simplicity use video URI
    }
  }, [haptic]);

  const removeVideo = () => {
    setVideo(null);
    setThumbnailUri(null);
  };

  const extractHashtags = (text: string) => {
    const matches = text.match(/#[a-zA-Z0-9_]+/g) || [];
    return matches.map(tag => tag.slice(1).toLowerCase());
  };

  const extractMentions = (text: string) => {
    const matches = text.match(/@[a-zA-Z0-9_]+/g) || [];
    return matches.map(mention => mention.slice(1).toLowerCase());
  };

  const handleCaptionChange = (text: string) => {
    setCaption(text);
    // Update hashtags and mentions from caption
    setHashtags(extractHashtags(text));
    setMentions(extractMentions(text));
  };

  const insertAtCursor = (text: string) => {
    if (!captionInputRef.current) return;
    // Simplified: just append for now
    setCaption(prev => prev + text);
    setShowAutocomplete(null);
  };

  const uploadMutation = useMutation({
    mutationFn: async (payload: any) => {
      setIsUploading(true);
      try {
        // Step 1: Upload video to R2
        const presign = await uploadApi.getPresignUrl('video/mp4', 'reels');
        const videoUploadRes = await fetch(presign.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'video/mp4' },
          body: await fetch(video!.uri).then(r => r.blob()),
        });
        if (!videoUploadRes.ok) throw new Error('Video upload failed');

        // Step 2: Upload thumbnail if we have one (for now reuse video URL)
        let thumbnailUrl = presign.publicUrl; // TODO: generate thumbnail

        // Step 3: Create reel
        return await reelsApi.create({
          videoUrl: presign.publicUrl,
          thumbnailUrl,
          duration: video!.duration,
          caption,
          hashtags,
          mentions,
          // audioTrackId: undefined,
          // isDuet: false,
          // isStitch: false,
        });
      } finally {
        setIsUploading(false);
      }
    },
    onSuccess: () => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ['reels-feed'] });
      queryClient.invalidateQueries({ queryKey: ['reel', user?.id] });
      router.back();
    },
    onError: (error: any) => {
      haptic.error();
      Alert.alert('Upload failed', error.message || 'Something went wrong');
    },
  });

  const handleUpload = () => {
    if (!video) {
      Alert.alert('No video', 'Please select a video first');
      return;
    }
    if (caption.length > 500) {
      Alert.alert('Caption too long', 'Maximum 500 characters');
      return;
    }
    uploadMutation.mutate({});
  };

  const handleToolbarPress = (type: AutocompleteType) => {
    haptic.light();
    setShowAutocomplete(type);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Icon name="arrow-left" size="sm" color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Reel</Text>
        <TouchableOpacity
          onPress={handleUpload}
          disabled={isUploading || !video}
          hitSlop={8}
        >
          {isUploading ? (
            <ActivityIndicator color={colors.emerald} size="small" />
          ) : (
            <Text style={[styles.headerAction, (!video || isUploading) && styles.headerActionDisabled]}>
              Share
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Video preview */}
        {video ? (
          <View style={styles.videoContainer}>
            <Video
              ref={videoRef}
              source={{ uri: video.uri }}
              style={styles.videoPreview}
              resizeMode={ResizeMode.COVER}
              useNativeControls
              isLooping
            />
            <TouchableOpacity
              style={styles.removeVideoButton}
              onPress={removeVideo}
              hitSlop={8}
            >
              <Icon name="x" size="sm" color={colors.text.primary} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.uploadPlaceholder} onPress={pickVideo}>
            <Icon name="video" size="xl" color={colors.text.secondary} />
            <Text style={styles.uploadText}>Select video</Text>
            <Text style={styles.uploadSubtext}>Up to 60 seconds, vertical (9:16)</Text>
          </TouchableOpacity>
        )}

        {/* Caption */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Caption</Text>
          <View style={styles.captionContainer}>
            <TextInput
              ref={captionInputRef}
              style={styles.captionInput}
              placeholder="Add a caption..."
              placeholderTextColor={colors.text.tertiary}
              value={caption}
              onChangeText={handleCaptionChange}
              multiline
              maxLength={500}
              textAlignVertical="top"
            />
            <View style={styles.captionFooter}>
              <CharCountRing current={caption.length} max={500} size={24} />
            </View>
          </View>
        </View>

        {/* Toolbar */}
        <View style={styles.toolbar}>
          <TouchableOpacity
            style={styles.toolbarButton}
            onPress={() => handleToolbarPress('hashtag')}
          >
            <Icon name="hash" size="sm" color={colors.text.secondary} />
            <Text style={styles.toolbarLabel}>Hashtag</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.toolbarButton}
            onPress={() => handleToolbarPress('mention')}
          >
            <Icon name="at-sign" size="sm" color={colors.text.secondary} />
            <Text style={styles.toolbarLabel}>Mention</Text>
          </TouchableOpacity>
          {/* Audio placeholder */}
          <TouchableOpacity style={styles.toolbarButton} disabled>
            <Icon name="music" size="sm" color={colors.text.tertiary} />
            <Text style={[styles.toolbarLabel, { color: colors.text.tertiary }]}>Sound</Text>
          </TouchableOpacity>
          {/* Duet/Stitch placeholder */}
          <TouchableOpacity style={styles.toolbarButton} disabled>
            <Icon name="repeat" size="sm" color={colors.text.tertiary} />
            <Text style={[styles.toolbarLabel, { color: colors.text.tertiary }]}>Duet</Text>
          </TouchableOpacity>
        </View>

        {/* Extracted tags */}
        {(hashtags.length > 0 || mentions.length > 0) && (
          <View style={styles.tagsSection}>
            <Text style={styles.sectionLabel}>Tags</Text>
            <View style={styles.tagsRow}>
              {hashtags.map(tag => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>#{tag}</Text>
                </View>
              ))}
              {mentions.map(mention => (
                <View key={mention} style={styles.tag}>
                  <Text style={styles.tagText}>@{mention}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Autocomplete sheets */}
      <BottomSheet
        visible={showAutocomplete !== null}
        onClose={() => setShowAutocomplete(null)}
        snapPoint={0.5}
      >
        {showAutocomplete === 'hashtag' && (
          <Autocomplete
            type="hashtag"
            query=""
            onSelect={(item) => insertAtCursor(`#${item}`)}
          />
        )}
        {showAutocomplete === 'mention' && (
          <Autocomplete
            type="mention"
            query=""
            onSelect={(item) => insertAtCursor(`@${item}`)}
          />
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.dark.border,
  },
  headerTitle: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  headerAction: {
    color: colors.emerald,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  headerActionDisabled: {
    color: colors.text.tertiary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
  },
  videoContainer: {
    position: 'relative',
    marginBottom: spacing.lg,
  },
  videoPreview: {
    width: VIDEO_PREVIEW_WIDTH,
    height: VIDEO_PREVIEW_HEIGHT,
    borderRadius: radius.md,
    backgroundColor: colors.dark.surface,
  },
  removeVideoButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: radius.full,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadPlaceholder: {
    width: VIDEO_PREVIEW_WIDTH,
    height: VIDEO_PREVIEW_HEIGHT,
    borderRadius: radius.md,
    backgroundColor: colors.dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.dark.border,
    borderStyle: 'dashed',
    marginBottom: spacing.lg,
  },
  uploadText: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  uploadSubtext: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  captionContainer: {
    backgroundColor: colors.dark.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  captionInput: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    minHeight: 100,
  },
  captionFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.sm,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  toolbarButton: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  toolbarLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
  },
  tagsSection: {
    marginBottom: spacing.lg,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tag: {
    backgroundColor: colors.active.emerald10,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  tagText: {
    color: colors.emerald,
    fontSize: fontSize.sm,
  },
});