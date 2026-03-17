import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInUp, FadeOut, useSharedValue, useAnimatedStyle, withSpring, withSequence, withDelay } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
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
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

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
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const haptic = useHaptic();
  const { t } = useTranslation();

  const [caption, setCaption] = useState('');
  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [mentions, setMentions] = useState<string[]>([]);
  const [thumbnailOptions, setThumbnailOptions] = useState<string[]>([]);
  const [customThumbnail, setCustomThumbnail] = useState(false);
  const [normalizeAudio, setNormalizeAudio] = useState(false);
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
        Alert.alert(t('createReel.permissionRequired'), t('createReel.permissionMessage'));
      }
    })();
  }, []);

  const generateFrames = async (videoUri: string, durationMs: number) => {
    const frameCount = Math.min(6, Math.max(3, Math.floor(durationMs / 1000)));
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
      // Generate thumbnail frames for picker
      generateFrames(asset.uri, (asset.duration || 0) * 1000);
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

  // Countdown animation for video recording mode
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownScale = useSharedValue(1);
  const countdownOpacity = useSharedValue(1);

  const startCountdown = () => {
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          setTimeout(() => setCountdown(null), 500);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    if (countdown !== null) {
      countdownScale.value = withSequence(
        withSpring(1.5, { damping: 10, stiffness: 200 }),
        withSpring(1, { damping: 15, stiffness: 300 })
      );
      countdownOpacity.value = withDelay(600, withSpring(0));
    }
  }, [countdown]);

  const countdownStyle = useAnimatedStyle(() => ({
    transform: [{ scale: countdownScale.value }],
    opacity: countdownOpacity.value,
  }));

  const uploadMutation = useMutation({
    mutationFn: async () => {
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
          normalizeAudio,
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
    onError: (error: Error) => {
      haptic.error();
      Alert.alert(t('createReel.uploadFailed'), error.message || t('common.somethingWentWrong'));
    },
  });

  const handleUpload = () => {
    if (!video) {
      Alert.alert(t('createReel.noVideo'), t('createReel.selectVideoFirst'));
      return;
    }
    if (caption.length > 500) {
      Alert.alert(t('createReel.captionTooLong'), t('createReel.maxCharacters', { max: 500 }));
      return;
    }
    uploadMutation.mutate();
  };

  const handleBack = () => {
    const hasContent = !!video || caption.trim().length > 0;
    if (hasContent) {
      Alert.alert(t('createReel.discardTitle'), t('createReel.discardMessage'), [
        { text: t('createReel.keepEditing') },
        { text: t('createReel.discard'), style: 'destructive', onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  };

  const handleToolbarPress = (type: AutocompleteType) => {
    haptic.light();
    setShowAutocomplete(type);
  };

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('createReel.title')}
          leftAction={{ icon: 'arrow-left', onPress: handleBack, accessibilityLabel: t('common.back') }}
          rightActions={[{ icon: 'send', onPress: handleUpload, accessibilityLabel: t('common.share') }]}
        />

        <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 52 }]}>
          {/* Countdown Overlay */}
          {countdown !== null && (
            <View style={styles.countdownOverlay}>
              <Animated.View style={[styles.countdownContainer, countdownStyle]}>
                <LinearGradient
                  colors={[colors.emerald, '#05593A']}
                  style={styles.countdownCircle}
                >
                  <Text style={styles.countdownText}>{countdown}</Text>
                </LinearGradient>
              </Animated.View>
            </View>
          )}

          {/* Video preview with focus ring */}
          {video ? (
            <Animated.View entering={FadeInUp} style={styles.videoContainer}>
              {/* Focus ring */}
              <LinearGradient
                colors={[colors.emerald, colors.gold, colors.emerald]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.focusRing}
              >
                <View style={styles.videoInner}>
                  <Video
                    ref={videoRef}
                    source={{ uri: video.uri }}
                    style={styles.videoPreview}
                    resizeMode={ResizeMode.COVER}
                    useNativeControls
                    isLooping
                  />
                </View>
              </LinearGradient>

              {/* Video info badge */}
              <View style={styles.videoInfoBadge}>
                <LinearGradient
                  colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.5)']}
                  style={styles.videoInfoGradient}
                >
                  <Icon name="play" size={12} color="#fff" />
                  <Text style={styles.videoInfoText}>
                    {Math.floor(video.duration)}s
                  </Text>
                </LinearGradient>
              </View>

              <TouchableOpacity
                style={styles.removeVideoButton}
                onPress={removeVideo}
                hitSlop={8}
              >
                <LinearGradient
                  colors={['rgba(248,81,73,0.9)', 'rgba(200,60,50,0.9)']}
                  style={styles.removeVideoGradient}
                >
                  <Icon name="x" size="sm" color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          ) : (
            <TouchableOpacity style={styles.uploadPlaceholder} onPress={pickVideo}>
              <LinearGradient
                colors={['rgba(10,123,79,0.1)', 'rgba(200,150,62,0.05)']}
                style={styles.uploadPlaceholderGradient}
              >
                <View style={styles.uploadIconContainer}>
                  <Icon name="video" size="xl" color={colors.emerald} />
                </View>
                <Text style={styles.uploadText}>{t('createReel.selectVideo')}</Text>
                <Text style={styles.uploadSubtext}>{t('createReel.videoRequirements')}</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}

          {/* Thumbnail filmstrip */}
          {video && thumbnailOptions.length > 0 && (
            <View style={styles.thumbnailSection}>
              <Text style={styles.sectionLabel}>{t('createReel.selectThumbnail')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                {thumbnailOptions.map((frame, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => { setThumbnailUri(frame); setCustomThumbnail(false); }}
                    style={[
                      styles.thumbnailFrame,
                      thumbnailUri === frame && !customThumbnail && styles.thumbnailFrameSelected,
                    ]}
                  >
                    <Image source={{ uri: frame }} style={styles.thumbnailImage} />
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  onPress={async () => {
                    const result = await ImagePicker.launchImageLibraryAsync({
                      mediaTypes: ImagePicker.MediaTypeOptions.Images,
                      quality: 0.8,
                    });
                    if (!result.canceled && result.assets[0]) {
                      setThumbnailUri(result.assets[0].uri);
                      setCustomThumbnail(true);
                    }
                  }}
                  style={[styles.thumbnailFrame, styles.uploadThumbnailButton]}
                >
                  <Icon name="image" size="md" color={colors.text.secondary} />
                  <Text style={styles.uploadThumbnailText}>{t('createReel.customThumbnail')}</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}

          {/* Caption with glassmorphism card */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <LinearGradient
                colors={[colors.gold, colors.emerald]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.sectionAccent}
              />
              <Text style={styles.sectionLabel}>{t('createReel.caption')}</Text>
            </View>
            <LinearGradient
              colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.captionCard}
            >
              <TextInput
                ref={captionInputRef}
                style={styles.captionInput}
                placeholder={t('createReel.captionPlaceholder')}
                placeholderTextColor={colors.text.tertiary}
                value={caption}
                onChangeText={handleCaptionChange}
                multiline
                maxLength={500}
                textAlignVertical="top"
              />
              <View style={styles.captionFooter}>
                <CharCountRing current={caption.length} max={500} size={28} />
              </View>
            </LinearGradient>
          </View>

          {/* Premium Gradient Toolbar */}
          <View style={styles.toolbarContainer}>
            <LinearGradient
              colors={['rgba(45,53,72,0.5)', 'rgba(28,35,51,0.3)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.toolbarCard}
            >
              <TouchableOpacity
                style={styles.toolbarButton}
                onPress={() => handleToolbarPress('hashtag')}
              >
                <LinearGradient
                  colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.05)']}
                  style={styles.toolbarBtnGradient}
                >
                  <Icon name="hash" size="md" color={colors.emerald} />
                </LinearGradient>
                <Text style={styles.toolbarLabel}>{t('createReel.hashtag')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.toolbarButton}
                onPress={() => handleToolbarPress('mention')}
              >
                <LinearGradient
                  colors={['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.05)']}
                  style={styles.toolbarBtnGradient}
                >
                  <Icon name="at-sign" size="md" color={colors.gold} />
                </LinearGradient>
                <Text style={styles.toolbarLabel}>{t('createReel.mention')}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.toolbarButton} disabled>
                <LinearGradient
                  colors={['rgba(110,119,129,0.15)', 'rgba(110,119,129,0.05)']}
                  style={styles.toolbarBtnGradient}
                >
                  <Icon name="music" size="md" color={colors.text.tertiary} />
                </LinearGradient>
                <Text style={[styles.toolbarLabel, { color: colors.text.tertiary }]}>{t('createReel.sound')}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.toolbarButton} disabled>
                <LinearGradient
                  colors={['rgba(110,119,129,0.15)', 'rgba(110,119,129,0.05)']}
                  style={styles.toolbarBtnGradient}
                >
                  <Icon name="repeat" size="md" color={colors.text.tertiary} />
                </LinearGradient>
                <Text style={[styles.toolbarLabel, { color: colors.text.tertiary }]}>{t('createReel.duet')}</Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>

          {/* Extracted tags with premium badges */}
          {(hashtags.length > 0 || mentions.length > 0) && (
            <View style={styles.tagsSection}>
              <View style={styles.sectionHeader}>
                <LinearGradient
                  colors={[colors.emerald, colors.gold]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.sectionAccent}
                />
                <Text style={styles.sectionLabel}>{t('createReel.tags')}</Text>
              </View>
              <View style={styles.tagsRow}>
                {hashtags.map(tag => (
                  <LinearGradient
                    key={tag}
                    colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.1)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.tagGradient}
                  >
                    <Icon name="hash" size={12} color={colors.emerald} />
                    <Text style={styles.tagText}>{tag}</Text>
                  </LinearGradient>
                ))}
                {mentions.map(mention => (
                  <LinearGradient
                    key={mention}
                    colors={['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.1)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.tagGradient}
                  >
                    <Icon name="at-sign" size={12} color={colors.gold} />
                    <Text style={styles.tagTextGold}>{mention}</Text>
                  </LinearGradient>
                ))}
              </View>
            </View>
          )}
          {/* Normalize audio toggle */}
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>{t('createReel.normalizeAudio')}</Text>
              <Text style={styles.toggleSubtitle}>{t('createReel.normalizeAudioDesc')}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setNormalizeAudio(!normalizeAudio)}
              style={[styles.toggle, normalizeAudio && styles.toggleActive]}
            >
              <View style={[styles.toggleThumb, normalizeAudio && styles.toggleThumbActive]} />
            </TouchableOpacity>
          </View>
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
      </View>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
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

  // Countdown overlay
  countdownOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(13,17,23,0.8)',
  },
  countdownContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  countdownText: {
    color: '#fff',
    fontSize: 60,
    fontWeight: '800',
  },

  // Focus ring video container
  focusRing: {
    padding: 3,
    borderRadius: radius.lg,
  },
  videoInner: {
    borderRadius: radius.lg - 3,
    overflow: 'hidden',
  },
  videoInfoBadge: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
  },
  videoInfoGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  videoInfoText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  removeVideoGradient: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Upload placeholder
  uploadPlaceholderGradient: {
    width: VIDEO_PREVIEW_WIDTH,
    height: VIDEO_PREVIEW_HEIGHT,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(10,123,79,0.3)',
    borderStyle: 'dashed',
    marginBottom: spacing.lg,
  },
  uploadIconContainer: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(10,123,79,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },

  // Section header with accent
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionAccent: {
    width: 4,
    height: 16,
    borderRadius: 2,
  },

  // Caption card
  captionCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(45,53,72,0.3)',
  },

  // Premium toolbar
  toolbarContainer: {
    marginBottom: spacing.lg,
  },
  toolbarCard: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(45,53,72,0.3)',
  },
  toolbarBtnGradient: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },

  // Premium tags
  tagGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  tagTextGold: {
    color: colors.gold,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },

  // Thumbnail filmstrip
  thumbnailSection: {
    marginTop: spacing.base,
    marginBottom: spacing.base,
  },
  thumbnailFrame: {
    width: 64,
    height: 114,
    borderRadius: radius.sm,
    overflow: 'hidden' as const,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbnailFrameSelected: {
    borderColor: colors.emerald,
  },
  thumbnailImage: {
    width: '100%' as const,
    height: '100%' as const,
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

  // Normalize audio toggle
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