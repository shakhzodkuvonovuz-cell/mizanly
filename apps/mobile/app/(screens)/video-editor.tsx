import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions, TextInput, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, Audio, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { Icon, type IconName } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import { showToast } from '@/components/ui/Toast';
import { MusicPicker } from '@/components/story/MusicPicker';
import { uploadApi } from '@/services/api';
import type { AudioTrack } from '@/types';
import { executeExport, cancelExport, isFFmpegAvailable, type EditParams } from '@/services/ffmpegEngine';
import * as Speech from 'expo-speech';
import { EmojiPicker } from '@/components/ui/EmojiPicker';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

type ToolTab = 'trim' | 'speed' | 'filters' | 'adjust' | 'text' | 'music' | 'volume' | 'voiceover' | 'effects';
type SpeedOption = 0.25 | 0.5 | 1 | 1.5 | 2 | 3;
type FilterName = 'original' | 'warm' | 'cool' | 'bw' | 'vintage' | 'vivid' | 'dramatic' | 'fade' | 'emerald' | 'golden' | 'night' | 'soft' | 'cinematic';
type QualityOption = '720p' | '1080p' | '4K';

const SPEED_OPTIONS: SpeedOption[] = [0.25, 0.5, 1, 1.5, 2, 3];

const FILTERS: { id: FilterName; labelKey: string; color: string }[] = [
  { id: 'original', labelKey: 'videoEditor.filterOriginal', color: '#FFFFFF' },
  { id: 'warm', labelKey: 'videoEditor.filterWarm', color: '#D4A94F' },
  { id: 'cool', labelKey: 'videoEditor.filterCool', color: colors.extended.blue },
  { id: 'bw', labelKey: 'videoEditor.filterBW', color: '#8B949E' },
  { id: 'vintage', labelKey: 'videoEditor.filterVintage', color: '#C8963E' },
  { id: 'vivid', labelKey: 'videoEditor.filterVivid', color: '#0A7B4F' },
  { id: 'dramatic', labelKey: 'videoEditor.filterDramatic', color: '#F85149' },
  { id: 'fade', labelKey: 'videoEditor.filterFade', color: '#6E7781' },
  { id: 'emerald', labelKey: 'videoEditor.filterEmerald', color: '#0A7B4F' },
  { id: 'golden', labelKey: 'videoEditor.filterGolden', color: '#C8963E' },
  { id: 'night', labelKey: 'videoEditor.filterNight', color: '#1C2333' },
  { id: 'soft', labelKey: 'videoEditor.filterSoft', color: '#E8D5B7' },
  { id: 'cinematic', labelKey: 'videoEditor.filterCinematic', color: '#2D3548' },
];

const FONT_OPTION_KEYS = ['default', 'bold', 'handwritten'];
const TEXT_COLORS = ['#FFFFFF', '#D4A94F', '#0A7B4F', '#C8963E', '#F85149', colors.extended.blue];

type VoiceEffect = 'none' | 'robot' | 'echo' | 'deep' | 'chipmunk' | 'telephone';
type SpeedCurve = 'none' | 'montage' | 'hero' | 'bullet' | 'flashIn' | 'flashOut';

type EditSnapshot = {
  startTime: number; endTime: number; speed: SpeedOption; speedCurve: SpeedCurve; filter: FilterName;
  captionText: string; originalVolume: number; musicVolume: number; isReversed: boolean;
  voiceEffect: VoiceEffect; stabilize: boolean; noiseReduce: boolean;
  freezeFrameAt: number | null; textStartTime: number; textEndTime: number;
  aspectRatio: '9:16' | '16:9' | '1:1' | '4:5';
  brightness: number; contrast: number; saturation: number; temperature: number;
  fadeIn: number; fadeOut: number;
  rotation: 0 | 90 | 180 | 270; sharpen: boolean; vignetteOn: boolean; grain: boolean;
  audioPitch: number;
};

export default function VideoEditorScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const router = useRouter();
  const params = useLocalSearchParams<{ videoUri?: string; uri?: string; returnTo?: string }>();
  const { t, language: currentLanguage } = useTranslation();
  const haptic = useContextualHaptic();
  const videoRef = useRef<Video>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<SpeedOption>(1);
  const [selectedTool, setSelectedTool] = useState<ToolTab>('trim');
  const [selectedFilter, setSelectedFilter] = useState<FilterName>('original');
  const [selectedQuality, setSelectedQuality] = useState<QualityOption>('1080p');
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [selectedFont, setSelectedFont] = useState('default');
  const [selectedTextColor, setSelectedTextColor] = useState('#FFFFFF');
  const [captionText, setCaptionText] = useState('');
  const [originalVolume, setOriginalVolume] = useState(80);
  const [musicVolume, setMusicVolume] = useState(60);
  const [voiceoverUri, setVoiceoverUri] = useState<string | null>(null);
  const [isRecordingVoiceover, setIsRecordingVoiceover] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<AudioTrack | null>(null);
  const [isReversed, setIsReversed] = useState(false);
  const [speedCurve, setSpeedCurve] = useState<SpeedCurve>('none');

  // Color grading adjustments (-100 to +100, 0 = neutral)
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [saturation, setSaturation] = useState(0);
  const [temperature, setTemperature] = useState(0);
  const [fadeIn, setFadeIn] = useState(0);   // seconds, 0 = no fade
  const [fadeOut, setFadeOut] = useState(0);  // seconds, 0 = no fade
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9' | '1:1' | '4:5'>('9:16');

  // Text timing — when the caption appears and disappears
  const [textStartTime, setTextStartTime] = useState(0);
  const [textEndTime, setTextEndTime] = useState(0); // 0 = full duration

  // Effects: voice effect, stabilization, noise reduction, freeze frame
  const [voiceEffect, setVoiceEffect] = useState<VoiceEffect>('none');
  const [stabilize, setStabilize] = useState(false);
  const [noiseReduce, setNoiseReduce] = useState(false);
  const [freezeFrameAt, setFreezeFrameAt] = useState<number | null>(null); // seconds, null = none
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [sharpen, setSharpen] = useState(false);
  const [vignetteOn, setVignetteOn] = useState(false);
  const [grain, setGrain] = useState(false);
  const [audioPitch, setAudioPitch] = useState(0); // -12 to +12 semitones
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [videoLoaded, setVideoLoaded] = useState(false);

  // Undo/redo stack — snapshot ALL edit state
  const [undoStack, setUndoStack] = useState<EditSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<EditSnapshot[]>([]);

  const captureSnapshot = useCallback((): EditSnapshot => ({
    startTime, endTime, speed: playbackSpeed, speedCurve, filter: selectedFilter,
    captionText, originalVolume, musicVolume, isReversed,
    voiceEffect, stabilize, noiseReduce, freezeFrameAt,
    textStartTime, textEndTime, aspectRatio,
    brightness, contrast, saturation, temperature, fadeIn, fadeOut,
    rotation, sharpen, vignetteOn, grain, audioPitch,
  }), [startTime, endTime, playbackSpeed, speedCurve, selectedFilter, captionText, originalVolume, musicVolume, isReversed, voiceEffect, stabilize, noiseReduce, freezeFrameAt, textStartTime, textEndTime, aspectRatio, brightness, contrast, saturation, temperature, fadeIn, fadeOut, rotation, sharpen, vignetteOn, grain, audioPitch]);

  const applySnapshot = useCallback((s: EditSnapshot) => {
    setStartTime(s.startTime); setEndTime(s.endTime);
    setPlaybackSpeed(s.speed); setSpeedCurve(s.speedCurve); setSelectedFilter(s.filter);
    setBrightness(s.brightness); setContrast(s.contrast); setSaturation(s.saturation);
    setTemperature(s.temperature); setFadeIn(s.fadeIn); setFadeOut(s.fadeOut);
    setRotation(s.rotation); setSharpen(s.sharpen); setVignetteOn(s.vignetteOn); setGrain(s.grain);
    setAudioPitch(s.audioPitch);
    setCaptionText(s.captionText); setOriginalVolume(s.originalVolume);
    setMusicVolume(s.musicVolume); setIsReversed(s.isReversed);
    setVoiceEffect(s.voiceEffect); setStabilize(s.stabilize);
    setNoiseReduce(s.noiseReduce); setFreezeFrameAt(s.freezeFrameAt);
    setTextStartTime(s.textStartTime); setTextEndTime(s.textEndTime);
    setAspectRatio(s.aspectRatio);
  }, []);

  const pushUndo = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-19), captureSnapshot()]);
    setRedoStack([]);
  }, [captureSnapshot]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    haptic.tick();
    const prev = undoStack[undoStack.length - 1];
    setRedoStack(r => [...r, captureSnapshot()]);
    setUndoStack(s => s.slice(0, -1));
    applySnapshot(prev);
  }, [undoStack, captureSnapshot, applySnapshot, haptic]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    haptic.tick();
    const next = redoStack[redoStack.length - 1];
    setUndoStack(s => [...s, captureSnapshot()]);
    setRedoStack(r => r.slice(0, -1));
    applySnapshot(next);
  }, [redoStack, captureSnapshot, applySnapshot, haptic]);
  const videoUri = params.videoUri || params.uri || null;

  // Timeline width reference for gesture calculations
  const timelineWidth = useRef(0);
  const MIN_TRIM_GAP = 1; // minimum 1 second between handles

  // Animated trim handle positions (0-1 fraction of timeline)
  const leftHandlePos = useSharedValue(0);
  const rightHandlePos = useSharedValue(1);
  // Store initial position at gesture start to avoid compounding
  const leftHandleStartPos = useSharedValue(0);
  const rightHandleStartPos = useSharedValue(1);

  // Update shared values when trim times change from other interactions
  useEffect(() => {
    if (totalDuration > 0) {
      leftHandlePos.value = startTime / totalDuration;
      rightHandlePos.value = endTime / totalDuration;
    }
  }, [totalDuration, startTime, endTime, leftHandlePos, rightHandlePos]);

  // Seek helper — extracted as named function for runOnJS
  const seekToStart = useCallback(() => {
    videoRef.current?.setPositionAsync(startTime * 1000);
  }, [startTime]);

  // FIX: Gesture captures start position in onStart, uses absolute offset in onUpdate
  const leftTrimGesture = Gesture.Pan()
    .onStart(() => {
      leftHandleStartPos.value = leftHandlePos.value;
    })
    .onUpdate((e) => {
      if (timelineWidth.current <= 0 || totalDuration <= 0) return;
      const fraction = Math.max(0, Math.min(
        rightHandlePos.value - MIN_TRIM_GAP / totalDuration,
        leftHandleStartPos.value + e.translationX / timelineWidth.current
      ));
      leftHandlePos.value = fraction;
      runOnJS(setStartTime)(fraction * totalDuration);
    })
    .onEnd(() => {
      runOnJS(seekToStart)();
    });

  // FIX: Same pattern for right handle
  const rightTrimGesture = Gesture.Pan()
    .onStart(() => {
      rightHandleStartPos.value = rightHandlePos.value;
    })
    .onUpdate((e) => {
      if (timelineWidth.current <= 0 || totalDuration <= 0) return;
      const fraction = Math.min(1, Math.max(
        leftHandlePos.value + MIN_TRIM_GAP / totalDuration,
        rightHandleStartPos.value + e.translationX / timelineWidth.current
      ));
      rightHandlePos.value = fraction;
      runOnJS(setEndTime)(fraction * totalDuration);
    });

  // Animated styles for trim handles
  const leftHandleStyle = useAnimatedStyle(() => ({
    left: `${leftHandlePos.value * 100}%`,
  }));
  const rightHandleStyle = useAnimatedStyle(() => ({
    right: `${(1 - rightHandlePos.value) * 100}%`,
  }));

  // Volume slider uses ref + onLayout to capture absolute X position
  const volumeSliderWidth = useRef(0);
  const volumeSliderX = useRef(0);
  const volumeSliderRef = useRef<View>(null);
  const onOriginalVolumeGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (volumeSliderWidth.current <= 0) return;
      const newVol = Math.max(0, Math.min(100, Math.round((e.absoluteX - volumeSliderX.current) / volumeSliderWidth.current * 100)));
      runOnJS(setOriginalVolume)(newVol);
    });
  const onMusicVolumeGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (volumeSliderWidth.current <= 0) return;
      const newVol = Math.max(0, Math.min(100, Math.round((e.absoluteX - volumeSliderX.current) / volumeSliderWidth.current * 100)));
      runOnJS(setMusicVolume)(newVol);
    });

  // Deterministic waveform pattern that looks like real audio (no Math.random)
  const waveformData = useMemo(() =>
    Array.from({ length: 40 }, (_, i) => {
      const t = i / 40;
      return 10 + 15 * Math.abs(Math.sin(t * Math.PI * 4)) + 8 * Math.abs(Math.sin(t * Math.PI * 7));
    }),
  []);

  // Animated export progress
  const exportProgressAnim = useSharedValue(0);
  const exportBarStyle = useAnimatedStyle(() => ({
    width: `${exportProgressAnim.value}%`,
  }));


  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle video playback status updates
  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setCurrentTime(status.positionMillis / 1000);
    if (status.durationMillis) {
      const dur = status.durationMillis / 1000;
      if (totalDuration !== dur) {
        setTotalDuration(dur);
        setEndTime(dur);
      }
    }
    setIsPlaying(status.isPlaying);
  }, [totalDuration]);

  // Toggle play/pause with real video
  const togglePlayback = useCallback(async () => {
    haptic.navigate();
    if (!videoRef.current) return;
    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
  }, [isPlaying, haptic]);

  // Seek to position when tapping timeline
  const seekToPosition = useCallback(async (fraction: number) => {
    if (!videoRef.current) return;
    const seekMs = Math.max(startTime, Math.min(endTime, fraction * totalDuration)) * 1000;
    await videoRef.current.setPositionAsync(seekMs);
  }, [startTime, endTime, totalDuration]);

  // Apply playback speed to real video
  useEffect(() => {
    if (videoRef.current && videoLoaded) {
      videoRef.current.setRateAsync(playbackSpeed, true);
    }
  }, [playbackSpeed, videoLoaded]);

  // Apply volume to real video
  useEffect(() => {
    if (videoRef.current && videoLoaded) {
      videoRef.current.setVolumeAsync(originalVolume / 100);
    }
  }, [originalVolume, videoLoaded]);

  const cyclePlaybackSpeed = () => {
    haptic.tick();
    const speeds: SpeedOption[] = [0.5, 1, 1.5, 2];
    const currentIndex = speeds.indexOf(playbackSpeed);
    const nextIndex = (currentIndex + 1) % speeds.length;
    setPlaybackSpeed(speeds[nextIndex]);
  };

  // FFmpeg export pipeline — uses ffmpegEngine.ts for command building + execution
  const handleExport = useCallback(async () => {
    if (!videoUri) {
      showToast({ message: t('videoEditor.noVideo'), variant: 'error' });
      return;
    }

    haptic.send();
    setIsExporting(true);
    setExportProgress(0);
    exportProgressAnim.value = 0;

    const ffmpegReady = await isFFmpegAvailable();

    if (!ffmpegReady) {
      // FFmpeg not available — upload original video with edit metadata for server-side processing
      try {
        const editMetadata = {
          trimStart: startTime,
          trimEnd: endTime,
          speed: playbackSpeed,
          filter: selectedFilter,
          caption: captionText,
          captionColor: selectedTextColor,
          captionFont: selectedFont,
          volume: originalVolume,
          musicVolume,
          musicTrackId: selectedTrack?.id,
          quality: selectedQuality,
        };

        setExportProgress(5);
        exportProgressAnim.value = withTiming(5, { duration: 200 });

        const presign = await uploadApi.getPresignUrl('video/mp4', 'videos');

        setExportProgress(15);
        exportProgressAnim.value = withTiming(15, { duration: 200 });

        const response = await fetch(videoUri);
        const blob = await (response as Response & { blob: () => Promise<Blob> }).blob();

        setExportProgress(30);
        exportProgressAnim.value = withTiming(30, { duration: 200 });

        const uploadRes = await fetch(presign.uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'video/mp4',
            'x-amz-meta-edit': JSON.stringify(editMetadata),
          },
          body: blob,
        });

        if (!uploadRes.ok) throw new Error('Upload failed');

        setExportProgress(100);
        exportProgressAnim.value = withTiming(100, { duration: 200 });

        showToast({ message: t('videoEditor.videoSaved'), variant: 'success' });
        setTimeout(() => router.back(), 800);
      } catch {
        showToast({ message: t('videoEditor.saveFailed'), variant: 'error' });
      } finally {
        setIsExporting(false);
      }
      return;
    }

    // Real FFmpeg export via engine
    try {
      const editParams: EditParams = {
        inputUri: videoUri,
        startTime,
        endTime,
        totalDuration,
        speed: playbackSpeed,
        filter: selectedFilter,
        captionText,
        captionColor: selectedTextColor,
        captionFont: selectedFont,
        originalVolume,
        musicVolume,
        musicUri: selectedTrack?.audioUrl,
        voiceoverUri: voiceoverUri || undefined,
        quality: selectedQuality,
        isReversed,
        aspectRatio,
        speedCurve: speedCurve !== 'none' ? speedCurve : undefined,
        textStartTime,
        textEndTime: textEndTime || undefined,
        voiceEffect,
        stabilize,
        noiseReduce,
        freezeFrameAt,
        brightness: brightness !== 0 ? brightness : undefined,
        contrast: contrast !== 0 ? contrast : undefined,
        saturation: saturation !== 0 ? saturation : undefined,
        temperature: temperature !== 0 ? temperature : undefined,
        fadeIn: fadeIn > 0 ? fadeIn : undefined,
        fadeOut: fadeOut > 0 ? fadeOut : undefined,
        rotation: rotation !== 0 ? rotation : undefined,
        sharpen: sharpen || undefined,
        vignette: vignetteOn || undefined,
        grain: grain || undefined,
        audioPitch: audioPitch !== 0 ? audioPitch : undefined,
      };

      const result = await executeExport(editParams, (percent) => {
        setExportProgress(percent);
        exportProgressAnim.value = withTiming(percent, { duration: 80 });
      });

      if (result.success && result.outputUri) {
        setExportProgress(100);
        exportProgressAnim.value = withTiming(100, { duration: 200 });
        showToast({ message: t('videoEditor.exportComplete'), variant: 'success' });
        // Pass exported URI back — if returnTo is specified, navigate there with the URI
        if (params.returnTo) {
          router.replace({ pathname: params.returnTo as any, params: { videoUri: result.outputUri, edited: 'true' } });
        } else {
          router.back();
        }
      } else if (result.cancelled) {
        showToast({ message: t('videoEditor.exportCancelled'), variant: 'info' });
      } else {
        showToast({ message: t('videoEditor.exportFailed'), variant: 'error' });
      }
    } catch {
      showToast({ message: t('videoEditor.exportFailed'), variant: 'error' });
    } finally {
      setIsExporting(false);
    }
  }, [haptic, videoUri, startTime, endTime, totalDuration, playbackSpeed, speedCurve, captionText, selectedTextColor, selectedFont, selectedFilter, selectedQuality, originalVolume, musicVolume, selectedTrack, voiceoverUri, isReversed, aspectRatio, voiceEffect, stabilize, noiseReduce, freezeFrameAt, brightness, contrast, saturation, temperature, fadeIn, fadeOut, rotation, sharpen, vignetteOn, grain, audioPitch, textStartTime, textEndTime, exportProgressAnim, t, router, params.returnTo]);

  // Cancel export handler
  const handleCancelExport = useCallback(async () => {
    haptic.delete();
    await cancelExport();
  }, [haptic]);

  const renderToolPanel = () => {
    switch (selectedTool) {
      case 'trim':
        return (
          <View style={styles.toolPanel}>
            <View style={styles.timeInputRow}>
              <View style={styles.timeInputContainer}>
                <Text style={styles.timeInputLabel}>{t('videoEditor.start')}</Text>
                <TextInput
                  style={styles.timeInput}
                  value={formatTime(startTime)}
                  editable={false}
                />
              </View>
              <View style={styles.timeInputContainer}>
                <Text style={styles.timeInputLabel}>{t('videoEditor.end')}</Text>
                <TextInput
                  style={styles.timeInput}
                  value={formatTime(endTime)}
                  editable={false}
                />
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('videoEditor.splitAtPlayhead')}
              style={styles.splitButton}
              onPress={() => {
                // Split at current playhead: set endTime to current position
                if (currentTime > startTime + 1 && currentTime < endTime - 1) {
                  pushUndo();
                  haptic.tick();
                  setEndTime(currentTime);
                  showToast({ message: t('videoEditor.splitDone'), variant: 'success' });
                } else {
                  showToast({ message: t('videoEditor.splitTooShort'), variant: 'info' });
                }
              }}
            >
              <LinearGradient
                colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                style={styles.splitButtonGradient}
              >
                <Icon name="scissors" size="sm" color={tc.text.primary} />
                <Text style={styles.splitButtonText}>{t('videoEditor.splitAtPlayhead')}</Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('videoEditor.deleteSelectedSegment')}
              style={styles.deleteButton}
              onPress={() => {
                // Reset trim to full duration
                pushUndo();
                haptic.delete();
                setStartTime(0);
                setEndTime(totalDuration);
              }}
            >
              <View style={styles.deleteButtonInner}>
                <Icon name="trash" size="sm" color={colors.error} />
                <Text style={styles.deleteButtonText}>{t('videoEditor.deleteSelectedSegment')}</Text>
              </View>
            </Pressable>
          </View>
        );

      case 'speed':
        return (
          <View style={styles.toolPanel}>
            <Text style={styles.toolPanelTitle}>{t('videoEditor.playbackSpeed')}</Text>
            <View style={styles.speedGrid}>
              {SPEED_OPTIONS.map((speed) => (
                <Pressable accessibilityRole="button"
                  accessibilityLabel={`${speed}x ${t('videoEditor.speed')}`}
                  key={speed}
                  style={styles.speedButton}
                  onPress={() => { pushUndo(); setPlaybackSpeed(speed); }}
                >
                  <LinearGradient
                    colors={playbackSpeed === speed
                      ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                      : colors.gradient.cardDark
                    }
                    style={styles.speedButtonGradient}
                  >
                    <Text style={[
                      styles.speedButtonText,
                      playbackSpeed === speed && styles.speedButtonTextActive
                    ]}>
                      {speed}x
                    </Text>
                  </LinearGradient>
                </Pressable>
              ))}
            </View>

            {/* Speed curve presets (CapCut-style) */}
            <Text style={[styles.toolSubTitle, { marginTop: spacing.md }]}>{t('videoEditor.speedCurves')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.effectsRow}>
                {[
                  { id: 'none', label: t('videoEditor.curve.none') },
                  { id: 'montage', label: t('videoEditor.curve.montage') },
                  { id: 'hero', label: t('videoEditor.curve.hero') },
                  { id: 'bullet', label: t('videoEditor.curve.bullet') },
                  { id: 'flashIn', label: t('videoEditor.curve.flashIn') },
                  { id: 'flashOut', label: t('videoEditor.curve.flashOut') },
                ].map((curve) => (
                  <Pressable
                    key={curve.id}
                    accessibilityRole="button"
                    style={styles.effectChip}
                    onPress={() => { pushUndo(); setSpeedCurve(curve.id as SpeedCurve); haptic.tick(); }}
                  >
                    <LinearGradient
                      colors={speedCurve === curve.id
                        ? ['rgba(200,150,62,0.4)', 'rgba(200,150,62,0.2)']
                        : colors.gradient.cardDark
                      }
                      style={styles.effectChipGradient}
                    >
                      <Text style={[styles.effectChipText, speedCurve === curve.id && { color: colors.gold, fontWeight: '600' }]}>
                        {curve.label}
                      </Text>
                    </LinearGradient>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        );

      case 'filters':
        return (
          <View style={styles.toolPanel}>
            <Text style={styles.toolPanelTitle}>{t('videoEditor.selectFilter')}</Text>
            <View style={styles.filterGrid}>
              {FILTERS.map((filter, index) => (
                <Animated.View
                  key={filter.id}
                  entering={FadeInUp.delay(index * 50).duration(300)}
                >
                  <Pressable accessibilityRole="button"
                    accessibilityLabel={t(filter.labelKey)}
                    style={styles.filterButton}
                    onPress={() => { pushUndo(); setSelectedFilter(filter.id); }}
                  >
                    <LinearGradient
                      colors={colors.gradient.cardDark}
                      style={[
                        styles.filterButtonGradient,
                        selectedFilter === filter.id && styles.filterButtonGradientActive
                      ]}
                    >
                      <View style={[styles.filterPreview, { backgroundColor: filter.color }]} />
                      <Text style={styles.filterName}>{t(filter.labelKey)}</Text>
                    </LinearGradient>
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          </View>
        );

      case 'adjust':
        return (
          <View style={styles.toolPanel}>
            <Text style={styles.toolPanelTitle}>{t('videoEditor.adjust')}</Text>
            {[
              { label: t('videoEditor.brightness'), value: brightness, setter: setBrightness, icon: 'sun' as IconName },
              { label: t('videoEditor.contrast'), value: contrast, setter: setContrast, icon: 'circle-plus' as IconName },
              { label: t('videoEditor.saturation'), value: saturation, setter: setSaturation, icon: 'layers' as IconName },
              { label: t('videoEditor.temperature'), value: temperature, setter: setTemperature, icon: 'hash' as IconName },
            ].map(({ label, value, setter, icon }) => (
              <View key={label} style={styles.adjustRow}>
                <View style={styles.adjustLabelRow}>
                  <Icon name={icon} size={14} color={value !== 0 ? colors.emerald : tc.text.secondary} />
                  <Text style={styles.adjustLabel}>{label}</Text>
                  <Text style={styles.adjustValue}>{value > 0 ? '+' : ''}{value}</Text>
                </View>
                <View style={styles.adjustSliderTrack}>
                  <View style={[styles.adjustSliderCenter]} />
                  <View style={[
                    styles.adjustSliderFill,
                    value >= 0
                      ? { left: '50%', width: `${Math.abs(value) / 2}%` }
                      : { right: '50%', width: `${Math.abs(value) / 2}%` }
                  ]} />
                  <Pressable
                    style={[styles.adjustSliderThumb, { left: `${50 + value / 2}%` }]}
                    onPress={() => { pushUndo(); setter(0); haptic.tick(); }}
                  />
                </View>
                <View style={styles.adjustPresetRow}>
                  {[-50, -25, 0, 25, 50].map(preset => (
                    <Pressable
                      key={preset}
                      style={[styles.adjustPreset, value === preset && styles.adjustPresetActive]}
                      onPress={() => { pushUndo(); setter(preset); haptic.tick(); }}
                    >
                      <Text style={[styles.adjustPresetText, value === preset && styles.adjustPresetTextActive]}>
                        {preset > 0 ? `+${preset}` : String(preset)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}

            {/* Video Fade In/Out */}
            <Text style={[styles.toolSubTitle, { marginTop: spacing.md }]}>{t('videoEditor.videoFade')}</Text>
            <View style={styles.fadeRow}>
              <View style={styles.fadeItem}>
                <Text style={styles.fadeLabel}>{t('videoEditor.fadeIn')}</Text>
                <View style={styles.fadeButtons}>
                  {[0, 0.5, 1, 2].map(sec => (
                    <Pressable
                      key={sec}
                      style={[styles.fadeButton, fadeIn === sec && styles.fadeButtonActive]}
                      onPress={() => { pushUndo(); setFadeIn(sec); haptic.tick(); }}
                    >
                      <Text style={[styles.fadeButtonText, fadeIn === sec && styles.fadeButtonTextActive]}>
                        {sec === 0 ? t('videoEditor.off') : `${sec}s`}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={styles.fadeItem}>
                <Text style={styles.fadeLabel}>{t('videoEditor.fadeOut')}</Text>
                <View style={styles.fadeButtons}>
                  {[0, 0.5, 1, 2].map(sec => (
                    <Pressable
                      key={sec}
                      style={[styles.fadeButton, fadeOut === sec && styles.fadeButtonActive]}
                      onPress={() => { pushUndo(); setFadeOut(sec); haptic.tick(); }}
                    >
                      <Text style={[styles.fadeButtonText, fadeOut === sec && styles.fadeButtonTextActive]}>
                        {sec === 0 ? t('videoEditor.off') : `${sec}s`}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          </View>
        );

      case 'text':
        return (
          <View style={styles.toolPanel}>
            <Text style={styles.toolPanelTitle}>{t('videoEditor.addCaption')}</Text>
            <TextInput
              style={styles.captionInput}
              placeholder={t('videoEditor.addTextOverlay')}
              placeholderTextColor={tc.text.tertiary}
              value={captionText}
              onChangeText={setCaptionText}
              maxLength={200}
              multiline
              numberOfLines={3}
            />
            {captionText.length > 0 && (
              <Text style={styles.captionCharCount}>{captionText.length}/200</Text>
            )}

            {/* Text timing — when caption appears/disappears */}
            {captionText.length > 0 && (
              <>
                <Text style={styles.toolSubTitle}>{t('videoEditor.textTiming')}</Text>
                <View style={styles.timeInputRow}>
                  <View style={styles.timeInputContainer}>
                    <Text style={styles.timeInputLabel}>{t('videoEditor.textAppears')}</Text>
                    <Pressable
                      accessibilityRole="button"
                      style={styles.timeInput}
                      onPress={() => { pushUndo(); setTextStartTime(currentTime); haptic.tick(); }}
                    >
                      <Text style={styles.timeInputValue}>{formatTime(textStartTime)}</Text>
                    </Pressable>
                  </View>
                  <View style={styles.timeInputContainer}>
                    <Text style={styles.timeInputLabel}>{t('videoEditor.textDisappears')}</Text>
                    <Pressable
                      accessibilityRole="button"
                      style={styles.timeInput}
                      onPress={() => { pushUndo(); setTextEndTime(currentTime); haptic.tick(); }}
                    >
                      <Text style={styles.timeInputValue}>{formatTime(textEndTime || endTime)}</Text>
                    </Pressable>
                  </View>
                </View>
                <Text style={styles.textTimingHint}>{t('videoEditor.textTimingHint')}</Text>
              </>
            )}

            <Text style={styles.toolSubTitle}>{t('videoEditor.fontStyle')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fontScroll}>
              {FONT_OPTION_KEYS.map((font) => (
                <Pressable accessibilityRole="button"
                  accessibilityLabel={t(`videoEditor.font.${font}`)}
                  key={font}
                  style={styles.fontButton}
                  onPress={() => setSelectedFont(font)}
                >
                  <LinearGradient
                    colors={selectedFont === font
                      ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                      : colors.gradient.cardDark
                    }
                    style={styles.fontButtonGradient}
                  >
                    <Text style={[
                      styles.fontButtonText,
                      selectedFont === font && styles.fontButtonTextActive
                    ]}>
                      {t(`videoEditor.font.${font}`)}
                    </Text>
                  </LinearGradient>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.toolSubTitle}>{t('videoEditor.textColor')}</Text>
            <View style={styles.colorRow}>
              {TEXT_COLORS.map((color) => (
                <Pressable accessibilityRole="button"
                  accessibilityLabel={`${t('videoEditor.textColor')} ${color}`}
                  key={color}
                  style={[
                    styles.colorCircle,
                    { backgroundColor: color },
                    selectedTextColor === color && styles.colorCircleActive
                  ]}
                  onPress={() => setSelectedTextColor(color)}
                />
              ))}
            </View>

            {/* Text-to-Speech + Emoji */}
            <View style={styles.ttsRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('videoEditor.textToSpeech')}
                style={styles.ttsButton}
                onPress={async () => {
                  if (!captionText.trim()) return;
                  if (isSpeaking) {
                    Speech.stop();
                    setIsSpeaking(false);
                  } else {
                    setIsSpeaking(true);
                    // Preview TTS — plays through device speaker only (not burned into export)
                    const langMap: Record<string, string> = { en: 'en-US', ar: 'ar-SA', tr: 'tr-TR', ur: 'ur-PK', bn: 'bn-BD', fr: 'fr-FR', id: 'id-ID', ms: 'ms-MY' };
                    Speech.speak(captionText, {
                      language: langMap[currentLanguage] || 'en-US',
                      onDone: () => setIsSpeaking(false),
                      onStopped: () => setIsSpeaking(false),
                    });
                  }
                }}
              >
                <LinearGradient
                  colors={isSpeaking
                    ? ['rgba(248,81,73,0.4)', 'rgba(248,81,73,0.2)']
                    : colors.gradient.cardDark
                  }
                  style={styles.ttsButtonGradient}
                >
                  <Icon name={isSpeaking ? 'volume-x' : 'volume-2'} size="sm" color={isSpeaking ? colors.error : tc.text.secondary} />
                  <Text style={styles.ttsButtonText}>
                    {isSpeaking ? t('videoEditor.stopTTS') : t('videoEditor.textToSpeech')}
                  </Text>
                </LinearGradient>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('videoEditor.addEmoji')}
                style={styles.ttsButton}
                onPress={() => setShowEmojiPicker(true)}
              >
                <LinearGradient
                  colors={colors.gradient.cardDark}
                  style={styles.ttsButtonGradient}
                >
                  <Icon name="smile" size="sm" color={tc.text.secondary} />
                  <Text style={styles.ttsButtonText}>{t('videoEditor.addEmoji')}</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        );

      case 'music':
        return (
          <View style={styles.toolPanel}>
            <Text style={styles.toolPanelTitle}>{t('videoEditor.backgroundMusic')}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('videoEditor.addFromAudioLibrary')}
              style={styles.libraryButton}
              onPress={() => setShowMusicPicker(true)}
            >
              <LinearGradient
                colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                style={styles.libraryButtonGradient}
              >
                <Icon name="music" size="sm" color={colors.emerald} />
                <Text style={styles.libraryButtonText}>{t('videoEditor.addFromAudioLibrary')}</Text>
                <Icon name="chevron-right" size="sm" color={tc.text.tertiary} />
              </LinearGradient>
            </Pressable>

            {selectedTrack ? (
              <View style={styles.currentTrackCard}>
                <LinearGradient
                  colors={colors.gradient.cardDark}
                  style={styles.currentTrackGradient}
                >
                  <View style={styles.trackInfo}>
                    <View style={styles.trackIconContainer}>
                      <LinearGradient
                        colors={['rgba(200,150,62,0.2)', 'rgba(10,123,79,0.1)']}
                        style={styles.trackIconGradient}
                      >
                        <Icon name="music" size="sm" color={colors.gold} />
                      </LinearGradient>
                    </View>
                    <View style={styles.trackDetails}>
                      <Text style={styles.trackName} numberOfLines={1}>{selectedTrack.title}</Text>
                      <Text style={styles.trackArtist} numberOfLines={1}>{selectedTrack.artist}</Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('videoEditor.removeTrack')}
                      style={styles.removeTrackButton}
                      onPress={() => setSelectedTrack(null)}
                    >
                      <Icon name="x" size="xs" color={colors.error} />
                    </Pressable>
                  </View>
                </LinearGradient>
              </View>
            ) : (
              <View style={styles.noTrackHint}>
                <Icon name="music" size="sm" color={tc.text.tertiary} />
                <Text style={styles.noTrackHintText}>{t('videoEditor.noMusicSelected')}</Text>
              </View>
            )}
          </View>
        );

      case 'volume':
        return (
          <View style={styles.toolPanel}>
            <Text style={styles.toolPanelTitle}>{t('videoEditor.audioLevels')}</Text>

            <View style={styles.volumeRow}>
              <View style={styles.volumeIconContainer}>
                <Icon name="volume-2" size="sm" color={tc.text.secondary} />
              </View>
              <View style={styles.volumeLabelContainer}>
                <Text style={styles.volumeLabel}>{t('videoEditor.originalAudio')}</Text>
                <Text style={styles.volumeValue}>{originalVolume}%</Text>
              </View>
            </View>
            <GestureDetector gesture={onOriginalVolumeGesture}>
              <View
                ref={volumeSliderRef}
                style={styles.sliderTrack}
                onLayout={(e) => {
                  volumeSliderWidth.current = e.nativeEvent.layout.width;
                  volumeSliderRef.current?.measureInWindow((x) => { volumeSliderX.current = x; });
                }}
              >
                <View style={[styles.sliderFill, { width: `${originalVolume}%` }]} />
                <View style={[styles.sliderThumb, { left: `${originalVolume}%` }]} />
              </View>
            </GestureDetector>

            <View style={[styles.volumeRow, styles.volumeRowSecond]}>
              <View style={styles.volumeIconContainer}>
                <Icon name="music" size="sm" color={tc.text.secondary} />
              </View>
              <View style={styles.volumeLabelContainer}>
                <Text style={styles.volumeLabel}>{t('videoEditor.backgroundMusic')}</Text>
                <Text style={styles.volumeValue}>{musicVolume}%</Text>
              </View>
            </View>
            <GestureDetector gesture={onMusicVolumeGesture}>
              <View style={styles.sliderTrack}>
                <View style={[styles.sliderFill, { width: `${musicVolume}%` }]} />
                <View style={[styles.sliderThumb, { left: `${musicVolume}%` }]} />
              </View>
            </GestureDetector>
          </View>
        );

      case 'effects':
        return (
          <View style={styles.toolPanel}>
            <Text style={styles.toolPanelTitle}>{t('videoEditor.audioEffects')}</Text>

            {/* Voice effects */}
            <Text style={styles.toolSubTitle}>{t('videoEditor.voiceEffect')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.effectsRow}>
                {(['none', 'robot', 'echo', 'deep', 'chipmunk', 'telephone'] as VoiceEffect[]).map((effect) => (
                  <Pressable
                    key={effect}
                    accessibilityRole="button"
                    accessibilityLabel={t(`videoEditor.effect.${effect}`)}
                    style={styles.effectChip}
                    onPress={() => { pushUndo(); setVoiceEffect(effect); haptic.tick(); }}
                  >
                    <LinearGradient
                      colors={voiceEffect === effect
                        ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                        : colors.gradient.cardDark
                      }
                      style={styles.effectChipGradient}
                    >
                      <Text style={[styles.effectChipText, voiceEffect === effect && styles.effectChipTextActive]}>
                        {t(`videoEditor.effect.${effect}`)}
                      </Text>
                    </LinearGradient>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* Audio Pitch */}
            <Text style={[styles.toolSubTitle, { marginTop: spacing.md }]}>{t('videoEditor.audioPitch')}</Text>
            <View style={styles.adjustLabelRow}>
              <Text style={styles.adjustLabel}>{t('videoEditor.pitchSemitones')}</Text>
              <Text style={styles.adjustValue}>{audioPitch > 0 ? '+' : ''}{audioPitch}</Text>
            </View>
            <View style={styles.adjustPresetRow}>
              {[-6, -3, 0, 3, 6].map(preset => (
                <Pressable
                  key={preset}
                  style={[styles.adjustPreset, audioPitch === preset && styles.adjustPresetActive]}
                  onPress={() => { pushUndo(); setAudioPitch(preset); haptic.tick(); }}
                >
                  <Text style={[styles.adjustPresetText, audioPitch === preset && styles.adjustPresetTextActive]}>
                    {preset > 0 ? `+${preset}` : String(preset)}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Enhancement toggles */}
            <Text style={[styles.toolSubTitle, { marginTop: spacing.md }]}>{t('videoEditor.enhancements')}</Text>

            <Pressable
              accessibilityRole="switch"
              style={styles.toggleRow}
              onPress={() => { pushUndo(); setNoiseReduce(!noiseReduce); haptic.tick(); }}
            >
              <View style={styles.toggleInfo}>
                <Icon name="volume-x" size="sm" color={noiseReduce ? colors.emerald : tc.text.secondary} />
                <View>
                  <Text style={styles.toggleLabel}>{t('videoEditor.noiseReduction')}</Text>
                  <Text style={styles.toggleDesc}>{t('videoEditor.noiseReductionDesc')}</Text>
                </View>
              </View>
              <View style={[styles.toggleSwitch, noiseReduce && styles.toggleSwitchActive]}>
                <View style={[styles.toggleThumb, noiseReduce && styles.toggleThumbActive]} />
              </View>
            </Pressable>

            <Pressable
              accessibilityRole="switch"
              style={styles.toggleRow}
              onPress={() => { pushUndo(); setStabilize(!stabilize); haptic.tick(); }}
            >
              <View style={styles.toggleInfo}>
                <Icon name="layers" size="sm" color={stabilize ? colors.emerald : tc.text.secondary} />
                <View>
                  <Text style={styles.toggleLabel}>{t('videoEditor.stabilization')}</Text>
                  <Text style={styles.toggleDesc}>{t('videoEditor.stabilizationDesc')}</Text>
                </View>
              </View>
              <View style={[styles.toggleSwitch, stabilize && styles.toggleSwitchActive]}>
                <View style={[styles.toggleThumb, stabilize && styles.toggleThumbActive]} />
              </View>
            </Pressable>

            {/* Freeze frame */}
            <Text style={[styles.toolSubTitle, { marginTop: spacing.md }]}>{t('videoEditor.freezeFrame')}</Text>
            <View style={styles.freezeRow}>
              <Pressable
                accessibilityRole="button"
                style={styles.freezeButton}
                onPress={() => {
                  pushUndo();
                  haptic.tick();
                  setFreezeFrameAt(freezeFrameAt === null ? currentTime : null);
                }}
              >
                <LinearGradient
                  colors={freezeFrameAt !== null
                    ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                    : colors.gradient.cardDark
                  }
                  style={styles.freezeButtonGradient}
                >
                  <Icon name="pause" size="sm" color={freezeFrameAt !== null ? colors.emerald : tc.text.secondary} />
                  <Text style={[styles.freezeButtonText, freezeFrameAt !== null && { color: colors.emerald }]}>
                    {freezeFrameAt !== null
                      ? `${t('videoEditor.frozenAt')} ${formatTime(freezeFrameAt)}`
                      : t('videoEditor.freezeAtPlayhead')
                    }
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>

            {/* Visual effects toggles */}
            <Text style={[styles.toolSubTitle, { marginTop: spacing.md }]}>{t('videoEditor.visualEffects')}</Text>

            <View style={styles.effectToggleGrid}>
              <Pressable
                style={[styles.effectToggleItem, sharpen && styles.effectToggleActive]}
                onPress={() => { pushUndo(); setSharpen(!sharpen); haptic.tick(); }}
              >
                <Icon name="eye" size="sm" color={sharpen ? colors.emerald : tc.text.secondary} />
                <Text style={[styles.effectToggleText, sharpen && styles.effectToggleTextActive]}>{t('videoEditor.sharpen')}</Text>
              </Pressable>
              <Pressable
                style={[styles.effectToggleItem, vignetteOn && styles.effectToggleActive]}
                onPress={() => { pushUndo(); setVignetteOn(!vignetteOn); haptic.tick(); }}
              >
                <Icon name="circle-plus" size="sm" color={vignetteOn ? colors.emerald : tc.text.secondary} />
                <Text style={[styles.effectToggleText, vignetteOn && styles.effectToggleTextActive]}>{t('videoEditor.vignetteEffect')}</Text>
              </Pressable>
              <Pressable
                style={[styles.effectToggleItem, grain && styles.effectToggleActive]}
                onPress={() => { pushUndo(); setGrain(!grain); haptic.tick(); }}
              >
                <Icon name="hash" size="sm" color={grain ? colors.emerald : tc.text.secondary} />
                <Text style={[styles.effectToggleText, grain && styles.effectToggleTextActive]}>{t('videoEditor.filmGrain')}</Text>
              </Pressable>
              <Pressable
                style={[styles.effectToggleItem, rotation !== 0 && styles.effectToggleActive]}
                onPress={() => {
                  pushUndo();
                  const rotations: (0 | 90 | 180 | 270)[] = [0, 90, 180, 270];
                  const idx = rotations.indexOf(rotation);
                  setRotation(rotations[(idx + 1) % rotations.length]);
                  haptic.tick();
                }}
              >
                <Icon name="repeat" size="sm" color={rotation !== 0 ? colors.emerald : tc.text.secondary} />
                <Text style={[styles.effectToggleText, rotation !== 0 && styles.effectToggleTextActive]}>
                  {rotation === 0 ? t('videoEditor.rotate') : `${rotation}°`}
                </Text>
              </Pressable>
            </View>
          </View>
        );

      case 'voiceover':
        return (
          <View style={styles.toolPanel}>
            <Text style={styles.toolPanelTitle}>{t('videoEditor.voiceover')}</Text>
            <Text style={styles.voiceoverHint}>
              {t('videoEditor.voiceoverHint')}
            </Text>

            {/* Record button */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isRecordingVoiceover ? t('videoEditor.stopRecording') : t('videoEditor.startRecording')}
              style={styles.voiceoverRecordButton}
              onPress={async () => {
                haptic.tick();
                if (isRecordingVoiceover) {
                  // Stop recording
                  setIsRecordingVoiceover(false);
                  if (videoRef.current) await videoRef.current.pauseAsync();
                  if (recordingRef.current) {
                    try {
                      await recordingRef.current.stopAndUnloadAsync();
                      const uri = recordingRef.current.getURI();
                      recordingRef.current = null;
                      // Reset audio mode so video playback works again (iOS mutes playback during recording)
                      await Audio.setAudioModeAsync({
                        allowsRecordingIOS: false,
                        playsInSilentModeIOS: true,
                      });
                      if (uri) {
                        setVoiceoverUri(uri);
                        showToast({ message: t('videoEditor.voiceoverSaved'), variant: 'success' });
                      }
                    } catch {
                      showToast({ message: t('videoEditor.exportFailed'), variant: 'error' });
                    }
                  }
                } else {
                  // Start recording
                  try {
                    await Audio.setAudioModeAsync({
                      allowsRecordingIOS: true,
                      playsInSilentModeIOS: true,
                    });
                    const { recording } = await Audio.Recording.createAsync(
                      Audio.RecordingOptionsPresets.HIGH_QUALITY,
                    );
                    recordingRef.current = recording;
                    setIsRecordingVoiceover(true);
                    // Play video from trim start while recording
                    if (videoRef.current) {
                      await videoRef.current.setPositionAsync(startTime * 1000);
                      await videoRef.current.playAsync();
                    }
                  } catch {
                    showToast({ message: t('videoEditor.exportFailed'), variant: 'error' });
                  }
                }
              }}
            >
              <LinearGradient
                colors={isRecordingVoiceover
                  ? ['rgba(248,81,73,0.8)', 'rgba(248,81,73,0.6)']
                  : ['rgba(10,123,79,0.8)', 'rgba(10,123,79,0.6)']
                }
                style={styles.voiceoverRecordGradient}
              >
                <Icon name={isRecordingVoiceover ? 'square' : 'mic'} size="lg" color="#FFF" />
                <Text style={styles.voiceoverRecordText}>
                  {isRecordingVoiceover ? t('videoEditor.stopRecording') : t('videoEditor.startRecording')}
                </Text>
              </LinearGradient>
            </Pressable>

            {/* Show recorded voiceover */}
            {voiceoverUri && (
              <View style={styles.voiceoverRecorded}>
                <Icon name="check-circle" size="sm" color={colors.emerald} />
                <Text style={styles.voiceoverRecordedText}>{t('videoEditor.voiceoverReady')}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setVoiceoverUri(null);
                    haptic.delete();
                  }}
                >
                  <Icon name="trash" size="sm" color={colors.error} />
                </Pressable>
              </View>
            )}
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <ScreenErrorBoundary>
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlassHeader title={t('videoEditor.editVideo')} showBackButton />

      {/* Quick action bar — undo/redo, reverse, aspect ratio, captions */}
      <View style={styles.quickActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('videoEditor.undo')} onPress={handleUndo} style={[styles.quickActionBtn, undoStack.length === 0 && styles.quickActionDisabled]}>
          <Icon name="arrow-left" size="sm" color={undoStack.length > 0 ? tc.text.primary : tc.text.tertiary} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('videoEditor.redo')} onPress={handleRedo} style={[styles.quickActionBtn, redoStack.length === 0 && styles.quickActionDisabled]}>
          <View style={{ transform: [{ scaleX: -1 }] }}>
            <Icon name="arrow-left" size="sm" color={redoStack.length > 0 ? tc.text.primary : tc.text.tertiary} />
          </View>
        </Pressable>
        <View style={styles.quickActionDivider} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('videoEditor.reverse')}
          onPress={() => { pushUndo(); setIsReversed(!isReversed); haptic.tick(); }}
          style={[styles.quickActionBtn, isReversed && styles.quickActionActive]}
        >
          <Icon name="repeat" size="sm" color={isReversed ? colors.emerald : tc.text.secondary} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('videoEditor.aspectRatio')}
          onPress={() => {
            haptic.tick();
            const ratios: typeof aspectRatio[] = ['9:16', '16:9', '1:1', '4:5'];
            const idx = ratios.indexOf(aspectRatio);
            setAspectRatio(ratios[(idx + 1) % ratios.length]);
          }}
          style={styles.quickActionBtn}
        >
          <Icon name="layers" size="sm" color={tc.text.secondary} />
          <Text style={styles.quickActionLabel}>{aspectRatio}</Text>
        </Pressable>
        <View style={styles.quickActionDivider} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('videoEditor.autoCaptions')}
          onPress={() => {
            if (videoUri) router.push({ pathname: '/(screens)/caption-editor' as any, params: { videoUri } });
          }}
          style={styles.quickActionBtn}
        >
          <Icon name="edit" size="sm" color={tc.text.secondary} />
          <Text style={styles.quickActionLabel}>{t('videoEditor.autoCaptions')}</Text>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
      >
        {/* Video Preview Area */}
        <View style={styles.previewContainer}>
          <LinearGradient
            colors={['rgba(28,35,51,0.8)', 'rgba(13,17,23,0.9)']}
            style={styles.previewGradient}
          >
            {/* Timestamp Badge */}
            <View style={styles.timestampBadge}>
              <LinearGradient
                colors={['rgba(45,53,72,0.8)', 'rgba(28,35,51,0.6)']}
                style={styles.timestampGradient}
              >
                <Text style={styles.timestampText}>
                  {formatTime(currentTime)} / {formatTime(totalDuration)}
                </Text>
              </LinearGradient>
            </View>

            {/* Playback Speed Badge */}
            <Pressable accessibilityRole="button" accessibilityLabel={`${t('videoEditor.playbackSpeed')} ${playbackSpeed}x`} style={styles.speedBadge} onPress={cyclePlaybackSpeed}>
              <LinearGradient
                colors={['rgba(45,53,72,0.8)', 'rgba(28,35,51,0.6)']}
                style={styles.speedBadgeGradient}
              >
                <Text style={styles.speedBadgeText}>{playbackSpeed}x</Text>
              </LinearGradient>
            </Pressable>

            {/* Real Video Player */}
            {videoUri ? (
              <Video
                ref={videoRef}
                source={{ uri: videoUri }}
                style={StyleSheet.absoluteFill}
                resizeMode={ResizeMode.CONTAIN}
                onPlaybackStatusUpdate={onPlaybackStatusUpdate}
                onLoad={() => setVideoLoaded(true)}
                shouldPlay={false}
                isLooping={false}
              />
            ) : (
              <View style={styles.videoPlaceholder}>
                <Icon name="video" size="xl" color={tc.text.tertiary} />
                <Text style={styles.noVideoText}>{t('videoEditor.noVideo')}</Text>
              </View>
            )}

            {/* Play/Pause Button */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? t('videoEditor.preview') : t('videoEditor.preview')}
              style={styles.playButton}
              onPress={togglePlayback}
            >
              <LinearGradient
                colors={['rgba(10,123,79,0.9)', 'rgba(6,107,66,0.95)']}
                style={styles.playButtonGradient}
              >
                <Icon name={isPlaying ? 'pause' : 'play'} size="xl" color="#FFF" />
              </LinearGradient>
            </Pressable>
          </LinearGradient>
        </View>

        {/* Timeline Section */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)}>
          <View style={styles.timelineContainer}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.timelineGradient}
            >
              {/* Time Labels — show trim range */}
              <View style={styles.timeLabels}>
                <Text style={styles.timeLabelStart}>{formatTime(startTime)}</Text>
                <Text style={styles.timeLabelEnd}>{formatTime(endTime)}</Text>
              </View>

              {/* Waveform Strip with Draggable Trim Handles */}
              <View
                style={styles.waveformContainer}
                onLayout={(e) => { timelineWidth.current = e.nativeEvent.layout.width; }}
              >
                <View style={styles.waveform}>
                  {waveformData.map((h, i) => (
                    <View
                      key={i}
                      style={[
                        styles.waveformBar,
                        { height: h }
                      ]}
                    />
                  ))}
                </View>

                {/* Left Trim Handle — draggable */}
                <GestureDetector gesture={leftTrimGesture}>
                  <Animated.View style={[styles.trimHandle, leftHandleStyle]}>
                    <LinearGradient
                      colors={['rgba(10,123,79,0.8)', 'rgba(10,123,79,0.6)']}
                      style={styles.trimHandleGradient}
                    >
                      <Icon name="chevron-right" size="xs" color="#FFF" />
                    </LinearGradient>
                  </Animated.View>
                </GestureDetector>

                {/* Right Trim Handle — draggable */}
                <GestureDetector gesture={rightTrimGesture}>
                  <Animated.View style={[styles.trimHandle, rightHandleStyle]}>
                    <LinearGradient
                      colors={['rgba(10,123,79,0.8)', 'rgba(10,123,79,0.6)']}
                      style={styles.trimHandleGradient}
                    >
                      <Icon name="chevron-left" size="xs" color="#FFF" />
                    </LinearGradient>
                  </Animated.View>
                </GestureDetector>

                {/* Playhead */}
                <View style={[styles.playhead, { left: `${(currentTime / totalDuration) * 100}%` }]}>
                  <View style={styles.playheadTriangle} />
                  <View style={styles.playheadLine} />
                </View>
              </View>

              <Text style={styles.dragHint}>{t('videoEditor.dragHandlesToTrim')}</Text>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Tools Tab Bar */}
        <Animated.View entering={FadeInUp.delay(150).duration(400)}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.toolsScroll}
            contentContainerStyle={styles.toolsContent}
          >
            {[
              { id: 'trim', icon: 'scissors' as IconName, label: t('videoEditor.trim') },
              { id: 'speed', icon: 'fast-forward' as IconName, label: t('videoEditor.speed') },
              { id: 'filters', icon: 'sliders' as IconName, label: t('videoEditor.filters') },
              { id: 'adjust', icon: 'sun' as IconName, label: t('videoEditor.adjust') },
              { id: 'text', icon: 'type' as IconName, label: t('videoEditor.text') },
              { id: 'music', icon: 'music' as IconName, label: t('videoEditor.music') },
              { id: 'volume', icon: 'volume-2' as IconName, label: t('videoEditor.volume') },
              { id: 'effects', icon: 'sliders' as IconName, label: t('videoEditor.effects') },
              { id: 'voiceover', icon: 'mic' as IconName, label: t('videoEditor.voiceover') },
            ].map((tool) => (
              <Pressable accessibilityRole="button"
                accessibilityLabel={tool.label}
                key={tool.id}
                style={styles.toolTab}
                onPress={() => setSelectedTool(tool.id as ToolTab)}
              >
                <LinearGradient
                  colors={selectedTool === tool.id
                    ? ['rgba(10,123,79,0.5)', 'rgba(10,123,79,0.3)']
                    : colors.gradient.cardDark
                  }
                  style={styles.toolTabGradient}
                >
                  <Icon
                    name={tool.icon}
                    size="sm"
                    color={selectedTool === tool.id ? colors.emerald : tc.text.secondary}
                  />
                  <Text style={[
                    styles.toolTabText,
                    selectedTool === tool.id && styles.toolTabTextActive
                  ]}>
                    {tool.label}
                  </Text>
                </LinearGradient>
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>

        {/* Tool Panel */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)}>
          <View style={styles.toolPanelContainer}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.toolPanelGradient}
            >
              {renderToolPanel()}
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Quality Selector */}
        <Animated.View entering={FadeInUp.delay(250).duration(400)}>
          <View style={styles.qualityContainer}>
            <Text style={styles.qualityLabel}>{t('videoEditor.exportQuality')}</Text>
            <View style={styles.qualityButtons}>
              {(['720p', '1080p', '4K'] as QualityOption[]).map((quality) => (
                <Pressable accessibilityRole="button"
                  accessibilityLabel={`${t('videoEditor.exportQuality')} ${quality}`}
                  key={quality}
                  style={styles.qualityButton}
                  onPress={() => setSelectedQuality(quality)}
                >
                  <LinearGradient
                    colors={selectedQuality === quality
                      ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
                      : colors.gradient.cardDark
                    }
                    style={styles.qualityButtonGradient}
                  >
                    <Text style={[
                      styles.qualityButtonText,
                      selectedQuality === quality && styles.qualityButtonTextActive
                    ]}>
                      {quality}
                    </Text>
                  </LinearGradient>
                </Pressable>
              ))}
            </View>
          </View>
        </Animated.View>

        {/* Bottom Spacing */}
        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <LinearGradient
          colors={['rgba(13,17,23,0.95)', 'rgba(13,17,23,1)']}
          style={styles.bottomBarGradient}
        >
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.cancel')} style={styles.cancelButton} onPress={() => router.back()}>
            <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
          </Pressable>
          {isExporting ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.cancel')} style={styles.exportButton} onPress={handleCancelExport}>
              <LinearGradient
                colors={['rgba(248,81,73,0.8)', 'rgba(248,81,73,0.6)']}
                style={styles.exportButtonGradient}
              >
                <View style={styles.exportProgressContainer}>
                  <ActivityIndicator size="small" color="#FFF" />
                  <Text style={styles.exportButtonText}>{exportProgress}%</Text>
                </View>
              </LinearGradient>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel={t('videoEditor.export')} style={styles.exportButton} onPress={handleExport}>
              <LinearGradient
                colors={['rgba(10,123,79,0.9)', 'rgba(6,107,66,0.95)']}
                style={styles.exportButtonGradient}
              >
                <Icon name="check" size="sm" color="#FFF" />
                <Text style={styles.exportButtonText}>{t('videoEditor.export')}</Text>
              </LinearGradient>
            </Pressable>
          )}
        </LinearGradient>
      </View>
      {/* Emoji Picker Bottom Sheet */}
      <EmojiPicker
        visible={showEmojiPicker}
        onClose={() => setShowEmojiPicker(false)}
        onSelect={(emoji) => {
          setCaptionText(prev => prev + emoji);
          setShowEmojiPicker(false);
          haptic.tick();
        }}
      />

      {/* Music Picker Bottom Sheet */}
      <MusicPicker
        visible={showMusicPicker}
        onClose={() => setShowMusicPicker(false)}
        onSelect={(track) => {
          setSelectedTrack(track);
          setShowMusicPicker(false);
          haptic.tick();
        }}
      />
    </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  quickActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  quickActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  quickActionDisabled: {
    opacity: 0.3,
  },
  quickActionActive: {
    backgroundColor: 'rgba(10,123,79,0.15)',
  },
  quickActionLabel: {
    fontSize: fontSize.xs,
    color: tc.text.secondary,
  },
  quickActionDivider: {
    width: 1,
    height: 16,
    backgroundColor: tc.border,
    marginHorizontal: spacing.xs,
  },
  previewContainer: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  previewGradient: {
    height: screenHeight * 0.42,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  timestampBadge: {
    position: 'absolute',
    top: spacing.md,
    end: spacing.md,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  timestampGradient: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  timestampText: {
    fontSize: fontSize.xs,
    color: colors.text.primary,
    fontFamily: fonts.mono,
  },
  speedBadge: {
    position: 'absolute',
    top: spacing.md,
    start: spacing.md,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  speedBadgeGradient: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  speedBadgeText: {
    fontSize: fontSize.xs,
    color: colors.text.primary,
    fontFamily: fonts.mono,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  playButtonGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlaceholder: {
    position: 'absolute',
    opacity: 0.3,
    alignItems: 'center',
    gap: spacing.sm,
  },
  noVideoText: {
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
  },
  exportProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  timelineContainer: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  timelineGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.base,
  },
  timeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  timeLabelStart: {
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    fontFamily: fonts.mono,
  },
  timeLabelEnd: {
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    fontFamily: fonts.mono,
  },
  waveformContainer: {
    height: 60,
    backgroundColor: tc.surface,
    borderRadius: radius.md,
    position: 'relative',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  waveformBar: {
    width: 3,
    backgroundColor: 'rgba(200,150,62,0.6)',
    borderRadius: radius.sm,
  },
  trimHandle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 28,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  trimHandleGradient: {
    width: 20,
    height: 44,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playhead: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    alignItems: 'center',
  },
  playheadLine: {
    width: 2,
    height: '100%',
    backgroundColor: colors.gold,
  },
  playheadTriangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.gold,
    marginBottom: 2,
  },
  dragHint: {
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  toolsScroll: {
    marginTop: spacing.md,
  },
  toolsContent: {
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
  },
  toolTab: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  toolTabGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  toolTabText: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  toolTabTextActive: {
    color: colors.emerald,
    fontWeight: '600',
  },
  toolPanelContainer: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  toolPanelGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.base,
  },
  toolPanel: {
    gap: spacing.md,
  },
  toolPanelTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text.primary,
  },
  toolSubTitle: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginTop: spacing.sm,
  },
  timeInputRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  timeInputContainer: {
    flex: 1,
  },
  timeInputLabel: {
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    marginBottom: spacing.xs,
  },
  timeInput: {
    backgroundColor: tc.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: fontSize.base,
    color: colors.text.primary,
    fontFamily: fonts.mono,
    textAlign: 'center',
  },
  splitButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  splitButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.md,
  },
  splitButtonText: {
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  deleteButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  deleteButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    backgroundColor: 'rgba(248,81,73,0.1)',
    borderRadius: radius.md,
  },
  deleteButtonText: {
    fontSize: fontSize.base,
    color: colors.error,
  },
  speedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  speedButton: {
    flex: 1,
    minWidth: 70,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  speedButtonGradient: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  speedButtonText: {
    fontSize: fontSize.base,
    color: colors.text.secondary,
  },
  speedButtonTextActive: {
    color: colors.emerald,
    fontWeight: '600',
  },
  filterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  filterButton: {
    width: (screenWidth - spacing.base * 4 - spacing.sm * 2) / 3,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  filterButtonGradient: {
    padding: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
  },
  filterButtonGradientActive: {
    borderWidth: 2,
    borderColor: colors.emerald,
  },
  filterPreview: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  filterName: {
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  captionInput: {
    backgroundColor: tc.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: fontSize.base,
    color: tc.text.primary,
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: tc.border,
  },
  captionCharCount: {
    fontSize: fontSize.xs,
    color: tc.text.tertiary,
    textAlign: 'right',
  },
  addTextButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  addTextButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.md,
  },
  addTextButtonText: {
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  fontScroll: {
    marginTop: spacing.sm,
  },
  fontButton: {
    marginEnd: spacing.sm,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  fontButtonGradient: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  fontButtonText: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  fontButtonTextActive: {
    color: colors.emerald,
    fontWeight: '600',
  },
  colorRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  colorCircle: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  colorCircleActive: {
    borderColor: colors.emerald,
    borderWidth: 3,
  },
  libraryButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  libraryButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  libraryButtonText: {
    fontSize: fontSize.base,
    color: colors.text.primary,
    flex: 1,
    marginStart: spacing.sm,
  },
  currentTrackCard: {
    marginTop: spacing.sm,
  },
  currentTrackGradient: {
    borderRadius: radius.md,
    padding: spacing.md,
  },
  trackInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  trackIconContainer: {
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  trackIconGradient: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackDetails: {
    flex: 1,
  },
  trackName: {
    fontSize: fontSize.base,
    color: colors.text.primary,
    fontWeight: '500',
  },
  trackArtist: {
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  removeTrackButton: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: 'rgba(248,81,73,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  effectToggleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  effectToggleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: tc.surface,
    borderWidth: 1,
    borderColor: tc.border,
  },
  effectToggleActive: {
    borderColor: colors.emerald,
    backgroundColor: 'rgba(10,123,79,0.1)',
  },
  effectToggleText: {
    fontSize: fontSize.sm,
    color: tc.text.secondary,
  },
  effectToggleTextActive: {
    color: colors.emerald,
    fontWeight: '600',
  },
  adjustRow: {
    marginBottom: spacing.md,
  },
  adjustLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  adjustLabel: {
    flex: 1,
    fontSize: fontSize.sm,
    color: tc.text.primary,
  },
  adjustValue: {
    fontSize: fontSize.xs,
    color: tc.text.tertiary,
    fontFamily: fonts.mono,
    minWidth: 30,
    textAlign: 'right',
  },
  adjustSliderTrack: {
    height: 4,
    backgroundColor: tc.surface,
    borderRadius: radius.full,
    position: 'relative',
    marginBottom: spacing.xs,
  },
  adjustSliderCenter: {
    position: 'absolute',
    left: '50%',
    width: 1,
    height: '100%',
    backgroundColor: tc.border,
  },
  adjustSliderFill: {
    position: 'absolute',
    height: '100%',
    backgroundColor: colors.emerald,
    borderRadius: radius.full,
  },
  adjustSliderThumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.gold,
    top: -5,
    marginStart: -7,
  },
  adjustPresetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  adjustPreset: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  adjustPresetActive: {
    backgroundColor: 'rgba(10,123,79,0.15)',
  },
  adjustPresetText: {
    fontSize: fontSize.xs,
    color: tc.text.tertiary,
  },
  adjustPresetTextActive: {
    color: colors.emerald,
    fontWeight: '600',
  },
  fadeRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  fadeItem: {
    flex: 1,
  },
  fadeLabel: {
    fontSize: fontSize.sm,
    color: tc.text.secondary,
    marginBottom: spacing.xs,
  },
  fadeButtons: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  fadeButton: {
    flex: 1,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: tc.surface,
    alignItems: 'center',
  },
  fadeButtonActive: {
    backgroundColor: 'rgba(10,123,79,0.2)',
  },
  fadeButtonText: {
    fontSize: fontSize.xs,
    color: tc.text.tertiary,
  },
  fadeButtonTextActive: {
    color: colors.emerald,
    fontWeight: '600',
  },
  ttsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  ttsButton: {
    flex: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  ttsButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  ttsButtonText: {
    fontSize: fontSize.sm,
    color: tc.text.secondary,
  },
  textTimingHint: {
    fontSize: fontSize.xs,
    color: tc.text.tertiary,
    fontStyle: 'italic',
  },
  timeInputValue: {
    fontSize: fontSize.base,
    color: tc.text.primary,
    fontFamily: fonts.mono,
    textAlign: 'center',
  },
  effectsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  effectChip: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  effectChipGradient: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  effectChipText: {
    fontSize: fontSize.sm,
    color: tc.text.secondary,
  },
  effectChipTextActive: {
    color: colors.emerald,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  toggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  toggleLabel: {
    fontSize: fontSize.base,
    color: tc.text.primary,
  },
  toggleDesc: {
    fontSize: fontSize.xs,
    color: tc.text.tertiary,
  },
  toggleSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: tc.surface,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleSwitchActive: {
    backgroundColor: colors.emerald,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: tc.text.tertiary,
  },
  toggleThumbActive: {
    backgroundColor: '#FFF',
    alignSelf: 'flex-end',
  },
  freezeRow: {
    marginTop: spacing.xs,
  },
  freezeButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  freezeButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  freezeButtonText: {
    fontSize: fontSize.base,
    color: tc.text.secondary,
  },
  voiceoverHint: {
    fontSize: fontSize.sm,
    color: tc.text.secondary,
    lineHeight: fontSize.sm * 1.5,
  },
  voiceoverRecordButton: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  voiceoverRecordGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
  },
  voiceoverRecordText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#FFF',
  },
  voiceoverRecorded: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(10,123,79,0.1)',
    borderRadius: radius.md,
  },
  voiceoverRecordedText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.emerald,
  },
  noTrackHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    opacity: 0.5,
  },
  noTrackHintText: {
    fontSize: fontSize.sm,
    color: tc.text.tertiary,
  },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  volumeRowSecond: {
    marginTop: spacing.md,
  },
  volumeIconContainer: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: tc.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  volumeLabelContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  volumeLabel: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  volumeValue: {
    fontSize: fontSize.sm,
    color: colors.emerald,
    fontFamily: fonts.mono,
  },
  sliderTrack: {
    height: 6,
    backgroundColor: tc.surface,
    borderRadius: radius.full,
    marginTop: spacing.xs,
    position: 'relative',
  },
  sliderFill: {
    height: '100%',
    backgroundColor: colors.emerald,
    borderRadius: radius.full,
  },
  sliderThumb: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: radius.full,
    backgroundColor: colors.gold,
    top: -5,
  },
  qualityContainer: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  qualityLabel: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  qualityButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  qualityButton: {
    flex: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  qualityButtonGradient: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  qualityButtonText: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  qualityButtonTextActive: {
    color: colors.emerald,
    fontWeight: '600',
  },
  bottomSpacing: {
    height: 100,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
  },
  bottomBarGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    paddingBottom: spacing.lg,
  },
  cancelButton: {
    paddingHorizontal: spacing.lg,
  },
  cancelButtonText: {
    fontSize: fontSize.base,
    color: colors.text.secondary,
  },
  exportButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  exportButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  exportButtonText: {
    fontSize: fontSize.base,
    color: '#FFF',
    fontWeight: '600',
  },
});
