import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  ScrollView, Alert, Dimensions, Pressable,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInUp, FadeOut, useSharedValue, useAnimatedStyle, withSpring, withSequence, withDelay } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Video, ResizeMode } from 'expo-av';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Avatar } from '@/components/ui/Avatar';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { Autocomplete } from '@/components/ui/Autocomplete';
import { colors, spacing, fontSize, radius } from '@/theme';
import { reelsApi, uploadApi } from '@/services/api';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { navigate } from '@/utils/navigation';
import { showToast } from '@/components/ui/Toast';
import { MusicPicker } from '@/components/story/MusicPicker';
import type { AudioTrack } from '@/types';

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
  const routeParams = useLocalSearchParams<{ videoUri?: string; edited?: string }>();
  const tc = useThemeColors();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const haptic = useContextualHaptic();
  const { t } = useTranslation();

  const [caption, setCaption] = useState('');
  const [video, setVideo] = useState<PickedVideo | null>(null);
  // Multi-clip recording (TikTok-style: record → pause → record more)
  const [clips, setClips] = useState<{ uri: string; duration: number }[]>([]);
  const totalClipsDuration = clips.reduce((sum, c) => sum + c.duration, 0);
  type TransitionType = 'none' | 'fade' | 'dissolve' | 'wipeleft' | 'slideup';
  const [clipTransition, setClipTransition] = useState<TransitionType>('none');
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [mentions, setMentions] = useState<string[]>([]);
  const [thumbnailOptions, setThumbnailOptions] = useState<string[]>([]);
  const [customThumbnail, setCustomThumbnail] = useState(false);
  const [normalizeAudio, setNormalizeAudio] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showAutocomplete, setShowAutocomplete] = useState<AutocompleteType>(null);
  const [autocompleteAnchor, setAutocompleteAnchor] = useState(0);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<AudioTrack | null>(null);
  const captionInputRef = useRef<TextInput>(null);

  const videoRef = useRef<Video>(null);

  // Camera recording state
  const [showCamera, setShowCamera] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [recordTime, setRecordTime] = useState(0);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-load video from route params (duet/stitch/editor return)
  useEffect(() => {
    if (routeParams.videoUri && !video) {
      setVideo({ uri: routeParams.videoUri, type: 'video', duration: 0 });
    }
  }, [routeParams.videoUri, video]);

  useEffect(() => {
    if (isRecording) {
      recordTimerRef.current = setInterval(() => {
        setRecordTime((prev) => {
          if (prev >= 60) {
            if (recordTimerRef.current) clearInterval(recordTimerRef.current);
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
    }
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    };
  }, [isRecording]);

  const handleCameraRecord = async () => {
    if (!cameraRef.current) return;

    if (isRecording) {
      cameraRef.current.stopRecording();
      setIsRecording(false);
    } else {
      const remainingTime = Math.max(1, 60 - totalClipsDuration);
      setIsRecording(true);
      setRecordTime(0);
      try {
        const result = await cameraRef.current.recordAsync({ maxDuration: remainingTime });
        if (result?.uri) {
          const clipDuration = recordTime || 1;
          // Add to clips array (multi-clip mode)
          setClips(prev => [...prev, { uri: result.uri, duration: clipDuration }]);
          haptic.tick();
        }
      } catch (_err: unknown) {
        // Recording was cancelled or failed
      } finally {
        setIsRecording(false);
      }
    }
  };

  // Finalize clips → concatenate via FFmpeg if multiple, then exit camera
  const finalizeClips = useCallback(async () => {
    if (clips.length === 0) return;
    if (clips.length === 1) {
      setVideo({ uri: clips[0].uri, type: 'video', duration: clips[0].duration });
      generateFrames(clips[0].uri, clips[0].duration * 1000);
      setShowCamera(false);
      return;
    }

    // Multiple clips — concatenate via FFmpeg
    try {
      const FFmpegKit = await import('ffmpeg-kit-react-native').catch(() => null);
      const FileSystemMod = await import('expo-file-system');

      if (FFmpegKit) {
        // Build concat with optional transitions
        const { buildConcatCommand } = await import('@/services/ffmpegEngine');
        const cacheDir = (FileSystemMod.cacheDirectory || '').replace(/\/?$/, '/');
        const outputPath = `${cacheDir}reel_concat_${Date.now()}.mp4`;
        const cmd = buildConcatCommand(clips, outputPath, clipTransition as any, 0.5);

        showToast({ message: t('createReel.mergingClips'), variant: 'info' });
        const session = await FFmpegKit.FFmpegKit.execute(cmd);
        const returnCode = await session.getReturnCode();

        if (returnCode.isValueSuccess()) {
          setVideo({ uri: outputPath, type: 'video', duration: totalClipsDuration });
          generateFrames(outputPath, totalClipsDuration * 1000);
          showToast({ message: `${clips.length} ${t('createReel.clipsMerged')}`, variant: 'success' });
        } else {
          // FFmpeg concat failed — fall back to first clip
          setVideo({ uri: clips[0].uri, type: 'video', duration: clips[0].duration });
          generateFrames(clips[0].uri, clips[0].duration * 1000);
          showToast({ message: t('createReel.mergeFailed'), variant: 'error' });
        }
      } else {
        // No FFmpeg — use first clip only, warn user
        setVideo({ uri: clips[0].uri, type: 'video', duration: clips[0].duration });
        generateFrames(clips[0].uri, clips[0].duration * 1000);
        showToast({ message: t('createReel.mergeUnavailable'), variant: 'info' });
      }
    } catch {
      setVideo({ uri: clips[0].uri, type: 'video', duration: clips[0].duration });
      generateFrames(clips[0].uri, clips[0].duration * 1000);
    }
    setShowCamera(false);
  }, [clips, totalClipsDuration, t]);

  // Delete last recorded clip
  const deleteLastClip = useCallback(() => {
    if (clips.length === 0) return;
    haptic.delete();
    setClips(prev => prev.slice(0, -1));
  }, [clips.length, haptic]);

  const handleOpenCamera = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        showToast({ message: t('camera.permissionMessage'), variant: 'error' });
        return;
      }
    }
    setShowCamera(true);
  };

  const formatRecordTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Request permissions on mount
  useEffect(() => {
    (async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showToast({ message: t('createReel.permissionMessage'), variant: 'error' });
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

  const MAX_REEL_SIZE = 100 * 1024 * 1024; // 100MB

  const pickVideo = useCallback(async () => {
    haptic.navigate();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: true,
      aspect: [9, 16],
      quality: 1,
      videoMaxDuration: 60, // 60 seconds max
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      // Check file size
      let fileSize = asset.fileSize;
      if (!fileSize) {
        const info = await FileSystem.getInfoAsync(asset.uri, { size: true });
        fileSize = info.exists && 'size' in info ? info.size : 0;
      }
      if (fileSize > MAX_REEL_SIZE) {
        showToast({ message: t('createReel.videoTooLarge', { max: '100MB' }), variant: 'error' });
        return;
      }
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
  }, [haptic, t]);

  const removeVideo = () => {
    setVideo(null);
    setThumbnailUri(null);
  };

  const extractHashtags = (text: string) => {
    const matches = text.match(/#[\w\u0600-\u06FF]+/g) || [];
    return matches.map(tag => tag.slice(1).toLowerCase());
  };

  const extractMentions = (text: string) => {
    const matches = text.match(/@[\w\u0600-\u06FF]+/g) || [];
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
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up countdown interval on unmount
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  const startCountdown = (onComplete: () => void) => {
    // Clear any existing countdown
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setCountdown(3);
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          setTimeout(() => {
            setCountdown(null);
            onComplete();
          }, 500);
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
          body: await fetch(video?.uri ?? '').then(r => r.blob()),
        });
        if (!videoUploadRes.ok) throw new Error('Video upload failed');

        // Step 2: Upload thumbnail if we have one
        let thumbnailUrl = presign.publicUrl;
        if (thumbnailUri) {
          const thumbPresign = await uploadApi.getPresignUrl('image/jpeg', 'thumbnails');
          const thumbResponse = await fetch(thumbnailUri);
          const thumbBlob = await thumbResponse.blob();
          await fetch(thumbPresign.uploadUrl, { method: 'PUT', body: thumbBlob, headers: { 'Content-Type': 'image/jpeg' } });
          thumbnailUrl = thumbPresign.publicUrl;
        }

        // Step 3: Create reel
        return await reelsApi.create({
          videoUrl: presign.publicUrl,
          thumbnailUrl,
          duration: video?.duration ?? 0,
          caption,
          hashtags,
          mentions,
          normalizeAudio,
          audioTrackId: selectedTrack?.id,
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
      showToast({ message: error.message || t('common.somethingWentWrong'), variant: 'error' });
    },
  });

  const handleUpload = () => {
    if (!video) {
      showToast({ message: t('createReel.selectVideoFirst'), variant: 'error' });
      return;
    }
    if (caption.length > 500) {
      showToast({ message: t('createReel.maxCharacters', { max: 500 }), variant: 'error' });
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
    haptic.tick();
    setShowAutocomplete(type);
  };

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
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
                  colors={[colors.emerald, colors.extended.greenDark]}
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
                    style={[styles.videoPreview, { backgroundColor: tc.surface }]}
                    resizeMode={ResizeMode.COVER}
                    useNativeControls
                    isLooping
                    onLoad={(status) => {
                      // Capture real duration when video loads (fixes duration:0 from route params)
                      if (status.isLoaded && status.durationMillis && video.duration === 0) {
                        setVideo(prev => prev ? { ...prev, duration: status.durationMillis! / 1000 } : prev);
                      }
                    }}
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

              {/* Edit video button */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.edit')}
                style={styles.editVideoButton}
                onPress={() => navigate('/(screens)/video-editor', { videoUri: video.uri, returnTo: '/(screens)/create-reel' })}
                hitSlop={8}
              >
                <LinearGradient
                  colors={['rgba(10,123,79,0.9)', 'rgba(6,107,66,0.9)']}
                  style={styles.editVideoGradient}
                >
                  <Icon name="scissors" size="sm" color="#fff" />
                </LinearGradient>
              </Pressable>

              <Pressable
                accessibilityRole="button"
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
              </Pressable>
            </Animated.View>
          ) : showCamera ? (
            <View style={styles.cameraSection}>
              {/* Mode toggle */}
              <View style={styles.modeToggle}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowCamera(false)}
                  style={[styles.modeTab, !showCamera && styles.modeTabActive]}
                >
                  <Icon name="image" size="sm" color={!showCamera ? '#FFF' : tc.text.secondary} />
                  <Text style={[styles.modeText, !showCamera && styles.modeTextActive]}>{t('createReel.gallery')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleOpenCamera}
                  style={[styles.modeTab, showCamera && styles.modeTabActive]}
                >
                  <Icon name="camera" size="sm" color={showCamera ? '#FFF' : tc.text.secondary} />
                  <Text style={[styles.modeText, showCamera && styles.modeTextActive]}>{t('createReel.record')}</Text>
                </Pressable>
              </View>

              {/* Camera view */}
              <View style={styles.cameraContainer}>
                <CameraView
                  ref={cameraRef}
                  style={styles.camera}
                  facing={facing}
                  mode="video"
                />

                {/* Timer overlay */}
                {isRecording && (
                  <View style={styles.cameraTimerOverlay}>
                    <View style={styles.cameraTimerBadge}>
                      <View style={styles.cameraRecordingDot} />
                      <Text style={styles.cameraTimerText}>{formatRecordTime(recordTime)}</Text>
                    </View>
                  </View>
                )}

                {/* Camera controls */}
                <View style={styles.cameraControls}>
                  {/* Flip camera */}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
                    style={styles.cameraFlipButton}
                  >
                    <Icon name="repeat" size="md" color="#fff" />
                  </Pressable>

                  {/* Timer/countdown button */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('createReel.timerRecord')}
                    onPress={() => {
                      if (!isRecording) {
                        startCountdown(() => handleCameraRecord());
                      }
                    }}
                    style={styles.cameraFlipButton}
                  >
                    <Icon name="clock" size="md" color="#fff" />
                  </Pressable>

                  {/* Record button */}
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleCameraRecord}
                    style={styles.recordButton}
                  >
                    <View style={styles.recordButtonOuter}>
                      {isRecording ? (
                        <View style={styles.recordDotActive} />
                      ) : (
                        <View style={styles.recordDot} />
                      )}
                    </View>
                  </Pressable>

                  {/* Delete last clip / Close camera */}
                  {clips.length > 0 && !isRecording ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('createReel.deleteLastClip')}
                      onPress={deleteLastClip}
                      style={styles.cameraFlipButton}
                    >
                      <Icon name="trash" size="md" color={colors.error} />
                    </Pressable>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        if (clips.length > 0) {
                          Alert.alert(
                            t('createReel.discardClips'),
                            t('createReel.discardClipsMessage'),
                            [
                              { text: t('common.cancel'), style: 'cancel' },
                              { text: t('createReel.discard'), style: 'destructive', onPress: () => { setShowCamera(false); setClips([]); } },
                            ]
                          );
                        } else {
                          setShowCamera(false);
                        }
                      }}
                      style={styles.cameraFlipButton}
                    >
                      <Icon name="x" size="md" color="#fff" />
                    </Pressable>
                  )}
                </View>

                {/* Clip counter + Transition + Done button */}
                {clips.length > 0 && !isRecording && (
                  <View style={styles.clipBar}>
                    <View style={styles.clipCountBadge}>
                      <Text style={styles.clipCountText}>
                        {clips.length} {clips.length === 1 ? t('createReel.clip') : t('createReel.clips')} · {formatRecordTime(totalClipsDuration)}
                      </Text>
                    </View>
                    {clips.length >= 2 && (
                      <Pressable
                        accessibilityRole="button"
                        style={styles.transitionBadge}
                        onPress={() => {
                          const types: TransitionType[] = ['none', 'fade', 'dissolve', 'wipeleft', 'slideup'];
                          const idx = types.indexOf(clipTransition);
                          setClipTransition(types[(idx + 1) % types.length]);
                        }}
                      >
                        <Icon name="layers" size={12} color={clipTransition !== 'none' ? colors.emerald : '#fff'} />
                        <Text style={[styles.clipCountText, clipTransition !== 'none' && { color: colors.emerald }]}>
                          {clipTransition === 'none' ? t('createReel.noTransition') : clipTransition}
                        </Text>
                      </Pressable>
                    )}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('createReel.doneRecording')}
                      style={styles.clipDoneButton}
                      onPress={finalizeClips}
                    >
                      <LinearGradient
                        colors={[colors.emerald, 'rgba(6,107,66,0.95)']}
                        style={styles.clipDoneGradient}
                      >
                        <Icon name="check" size="sm" color="#fff" />
                        <Text style={styles.clipDoneText}>{t('createReel.doneRecording')}</Text>
                      </LinearGradient>
                    </Pressable>
                  </View>
                )}

                {/* Remaining time indicator */}
                {totalClipsDuration > 0 && (
                  <View style={styles.clipProgressBar}>
                    <View style={[styles.clipProgressFill, { width: `${Math.min(100, (totalClipsDuration / 60) * 100)}%` }]} />
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View>
              {/* Mode toggle */}
              <View style={styles.modeToggle}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowCamera(false)}
                  style={[styles.modeTab, !showCamera && styles.modeTabActive]}
                >
                  <Icon name="image" size="sm" color={!showCamera ? '#FFF' : tc.text.secondary} />
                  <Text style={[styles.modeText, !showCamera && styles.modeTextActive]}>{t('createReel.gallery')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleOpenCamera}
                  style={[styles.modeTab, showCamera && styles.modeTabActive]}
                >
                  <Icon name="camera" size="sm" color={showCamera ? '#FFF' : tc.text.secondary} />
                  <Text style={[styles.modeText, showCamera && styles.modeTextActive]}>{t('createReel.record')}</Text>
                </Pressable>
              </View>

              <Pressable style={[styles.uploadPlaceholder, { backgroundColor: tc.surface, borderColor: tc.border }]} onPress={pickVideo}>
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
              </Pressable>
            </View>
          )}

          {/* Thumbnail filmstrip */}
          {video && thumbnailOptions.length > 0 && (
            <View style={styles.thumbnailSection}>
              <Text style={styles.sectionLabel}>{t('createReel.selectThumbnail')}</Text>
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
                    <ProgressiveImage uri={frame} width={80} height={45} accessibilityLabel="Content image" />
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
                  <Text style={styles.uploadThumbnailText}>{t('createReel.customThumbnail')}</Text>
                </Pressable>
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
              colors={colors.gradient.cardDark}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.captionCard}
            >
              <TextInput
                ref={captionInputRef}
                style={styles.captionInput}
                placeholder={t('createReel.captionPlaceholder')}
                placeholderTextColor={tc.text.tertiary}
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
              <Pressable
                accessibilityRole="button"
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
              </Pressable>

              <Pressable
                accessibilityRole="button"
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
              </Pressable>

              <Pressable style={styles.toolbarButton} onPress={() => setShowMusicPicker(true)}>
                <LinearGradient
                  colors={selectedTrack ? ['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.05)'] : ['rgba(110,119,129,0.15)', 'rgba(110,119,129,0.05)']}
                  style={styles.toolbarBtnGradient}
                >
                  <Icon name="volume-x" size="md" color={selectedTrack ? colors.emerald : tc.text.primary} />
                </LinearGradient>
                <Text style={styles.toolbarLabel}>{t('createReel.music')}</Text>
              </Pressable>

              <Pressable
                style={styles.toolbarButton}
                onPress={() => navigate('/(screens)/reel-templates')}
                accessibilityRole="button"
              >
                <LinearGradient
                  colors={['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.05)']}
                  style={styles.toolbarBtnGradient}
                >
                  <Icon name="layers" size="md" color={colors.gold} />
                </LinearGradient>
                <Text style={styles.toolbarLabel}>{t('createReel.templates')}</Text>
              </Pressable>

              <Pressable
                style={styles.toolbarButton}
                onPress={() => navigate('/(screens)/schedule-post', { space: 'bakra' })}
                accessibilityRole="button"
              >
                <LinearGradient
                  colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.05)']}
                  style={styles.toolbarBtnGradient}
                >
                  <Icon name="clock" size="md" color={colors.emerald} />
                </LinearGradient>
                <Text style={styles.toolbarLabel}>{t('createReel.schedule')}</Text>
              </Pressable>

              <Pressable
                style={styles.toolbarButton}
                onPress={() => navigate('/(screens)/green-screen-editor')}
                accessibilityRole="button"
              >
                <LinearGradient
                  colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.05)']}
                  style={styles.toolbarBtnGradient}
                >
                  <Icon name="image" size="md" color={colors.emerald} />
                </LinearGradient>
                <Text style={styles.toolbarLabel}>{t('createReel.greenScreen')}</Text>
              </Pressable>

              <Pressable
                style={styles.toolbarButton}
                onPress={() => navigate('/(screens)/audio-library')}
                accessibilityRole="button"
              >
                <LinearGradient
                  colors={['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.05)']}
                  style={styles.toolbarBtnGradient}
                >
                  <Icon name="volume-x" size="md" color={colors.gold} />
                </LinearGradient>
                <Text style={styles.toolbarLabel}>{t('createReel.audioLibrary')}</Text>
              </Pressable>
            </LinearGradient>
          </View>

          {/* Selected track indicator */}
          {selectedTrack && (
            <Animated.View entering={FadeIn} style={[styles.selectedTrackBar, { backgroundColor: tc.bgCard }]}>
              <Icon name="volume-x" size="sm" color={colors.emerald} />
              <Text style={styles.selectedTrackText} numberOfLines={1}>
                {selectedTrack.title} — {selectedTrack.artist}
              </Text>
              <Pressable onPress={() => setSelectedTrack(null)} hitSlop={8}>
                <Icon name="x" size="sm" color={tc.text.secondary} />
              </Pressable>
            </Animated.View>
          )}

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
          <View style={[styles.toggleRow, { borderBottomColor: tc.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>{t('createReel.normalizeAudio')}</Text>
              <Text style={styles.toggleSubtitle}>{t('createReel.normalizeAudioDesc')}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setNormalizeAudio(!normalizeAudio)}
              style={[styles.toggle, normalizeAudio && styles.toggleActive]}
            >
              <View style={[styles.toggleThumb, normalizeAudio && styles.toggleThumbActive]} />
            </Pressable>
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
              visible
              type="hashtag"
              query=""
              onSelect={(item) => insertAtCursor(`#${item}`)}
              onClose={() => setShowAutocomplete(null)}
            />
          )}
          {showAutocomplete === 'mention' && (
            <Autocomplete
              visible
              type="mention"
              query=""
              onSelect={(item) => insertAtCursor(`@${item}`)}
              onClose={() => setShowAutocomplete(null)}
            />
          )}
        </BottomSheet>

        <MusicPicker
          visible={showMusicPicker}
          onClose={() => setShowMusicPicker(false)}
          onSelect={(track) => {
            setSelectedTrack(track);
            setShowMusicPicker(false);
          }}
        />
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
  editVideoButton: {
    position: 'absolute',
    top: spacing.sm,
    end: spacing.sm + 32 + spacing.sm, // remove button width (32) + gap
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: radius.full,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    overflow: 'hidden',
  },
  editVideoGradient: {
    width: '100%',
    height: '100%',
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeVideoButton: {
    position: 'absolute',
    top: spacing.sm,
    end: spacing.sm,
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
  clipBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  clipCountBadge: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  clipCountText: {
    fontSize: fontSize.sm,
    color: '#fff',
    fontFamily: fonts.mono,
  },
  transitionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  clipDoneButton: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  clipDoneGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  clipDoneText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: '#fff',
  },
  clipProgressBar: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: spacing.base,
    borderRadius: radius.full,
  },
  clipProgressFill: {
    height: '100%',
    backgroundColor: colors.emerald,
    borderRadius: radius.full,
  },
  countdownOverlay: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
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
    borderRadius: radius.full,
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
    fontWeight: '700',
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
    start: spacing.sm,
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
    borderColor: colors.active.emerald30,
    borderStyle: 'dashed',
    marginBottom: spacing.lg,
  },
  uploadIconContainer: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.active.emerald10,
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

  // Mode toggle (Gallery / Record)
  modeToggle: {
    flexDirection: 'row' as const,
    marginBottom: spacing.md,
    borderRadius: radius.full,
    backgroundColor: 'rgba(45,53,72,0.4)',
    padding: 3,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  modeTabActive: {
    backgroundColor: colors.emerald,
  },
  modeText: {
    fontSize: fontSize.sm,
    fontWeight: '600' as const,
    color: colors.text.secondary,
  },
  modeTextActive: {
    color: '#FFF',
  },

  // Camera section
  cameraSection: {
    marginBottom: spacing.lg,
  },
  cameraContainer: {
    width: VIDEO_PREVIEW_WIDTH,
    height: VIDEO_PREVIEW_HEIGHT,
    borderRadius: radius.lg,
    overflow: 'hidden' as const,
    position: 'relative' as const,
  },
  camera: {
    width: '100%' as const,
    height: '100%' as const,
  },
  cameraTimerOverlay: {
    position: 'absolute' as const,
    top: spacing.md,
    start: 0,
    end: 0,
    alignItems: 'center' as const,
  },
  cameraTimerBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  cameraRecordingDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.error,
  },
  cameraTimerText: {
    color: '#FFF',
    fontSize: fontSize.sm,
    fontWeight: '600' as const,
  },
  cameraControls: {
    position: 'absolute' as const,
    bottom: spacing.lg,
    start: 0,
    end: 0,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xl,
  },
  cameraFlipButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  recordButton: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  recordButtonOuter: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    borderWidth: 4,
    borderColor: '#FFF',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  recordDot: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.error,
  },
  recordDotActive: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    backgroundColor: colors.error,
  },

  // Selected track bar
  selectedTrackBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: colors.dark.bgCard,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  selectedTrackText: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.sm,
  },
});