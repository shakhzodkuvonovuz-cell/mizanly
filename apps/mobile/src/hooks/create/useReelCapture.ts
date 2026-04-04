import { useState, useCallback, useRef, useEffect } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { showToast } from '@/components/ui/Toast';
import type { TFunction } from 'i18next';

type PickedVideo = {
  uri: string;
  type: 'video';
  duration: number;
  width?: number;
  height?: number;
};

const MAX_REEL_SIZE = 100 * 1024 * 1024; // 100MB

interface UseReelCaptureReturn {
  video: PickedVideo | null;
  setVideo: React.Dispatch<React.SetStateAction<PickedVideo | null>>;
  clips: { uri: string; duration: number }[];
  setClips: React.Dispatch<React.SetStateAction<{ uri: string; duration: number }[]>>;
  totalClipsDuration: number;
  thumbnailUri: string | null;
  setThumbnailUri: (v: string | null) => void;
  thumbnailOptions: string[];
  customThumbnail: boolean;
  setCustomThumbnail: (v: boolean) => void;
  showCamera: boolean;
  setShowCamera: (v: boolean) => void;
  cameraRef: React.RefObject<CameraView>;
  cameraPermission: ReturnType<typeof useCameraPermissions>[0];
  isRecording: boolean;
  facing: 'front' | 'back';
  setFacing: (v: 'front' | 'back') => void;
  recordTime: number;
  pickVideo: () => Promise<void>;
  removeVideo: () => void;
  handleCameraRecord: () => Promise<void>;
  finalizeClips: () => Promise<void>;
  deleteLastClip: () => void;
  handleOpenCamera: () => Promise<void>;
  formatRecordTime: (seconds: number) => string;
  generateFrames: (videoUri: string, durationMs: number) => Promise<void>;
}

export function useReelCapture(
  t: TFunction,
  routeVideoUri?: string,
): UseReelCaptureReturn {
  const haptic = useContextualHaptic();

  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [clips, setClips] = useState<{ uri: string; duration: number }[]>([]);
  const totalClipsDuration = clips.reduce((sum, c) => sum + c.duration, 0);
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [thumbnailOptions, setThumbnailOptions] = useState<string[]>([]);
  const [customThumbnail, setCustomThumbnail] = useState(false);

  // Camera recording state
  const [showCamera, setShowCamera] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [recordTime, setRecordTime] = useState(0);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-load video from route params
  useEffect(() => {
    if (routeVideoUri && !video) {
      setVideo({ uri: routeVideoUri, type: 'video', duration: 0 });
    }
  }, [routeVideoUri, video]);

  // Record timer
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

  // Request permissions on mount
  useEffect(() => {
    (async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showToast({ message: t('createReel.permissionMessage'), variant: 'error' });
      }
    })();
  }, []);

  const generateFrames = useCallback(async (videoUri: string, durationMs: number) => {
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
  }, []);

  const handleCameraRecord = useCallback(async () => {
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
          setClips(prev => [...prev, { uri: result.uri, duration: clipDuration }]);
          haptic.tick();
        }
      } catch (_err: unknown) {
        haptic.error();
        showToast({ message: t('createReel.recordingFailed', 'Recording failed'), variant: 'error' });
      } finally {
        setIsRecording(false);
      }
    }
  }, [isRecording, totalClipsDuration, recordTime, haptic, t]);

  const finalizeClips = useCallback(async () => {
    if (clips.length === 0) return;
    if (clips.length === 1) {
      setVideo({ uri: clips[0].uri, type: 'video', duration: clips[0].duration });
      generateFrames(clips[0].uri, clips[0].duration * 1000);
      setShowCamera(false);
      return;
    }

    try {
      const FFmpegKit = await import('ffmpeg-kit-react-native').catch(() => null);
      const FileSystemMod = await import('expo-file-system');

      if (FFmpegKit) {
        const { buildConcatCommand } = await import('@/services/ffmpegEngine');
        const cacheDir = (FileSystemMod.cacheDirectory || '').replace(/\/?$/, '/');
        const outputPath = `${cacheDir}reel_concat_${Date.now()}.mp4`;
        const cmd = buildConcatCommand(clips, outputPath, 'none', 0.5);

        showToast({ message: t('createReel.mergingClips'), variant: 'info' });
        const session = await FFmpegKit.FFmpegKit.execute(cmd);
        const returnCode = await session.getReturnCode();

        if (returnCode.isValueSuccess()) {
          setVideo({ uri: outputPath, type: 'video', duration: totalClipsDuration });
          generateFrames(outputPath, totalClipsDuration * 1000);
          showToast({ message: `${clips.length} ${t('createReel.clipsMerged')}`, variant: 'success' });
        } else {
          setVideo({ uri: clips[0].uri, type: 'video', duration: clips[0].duration });
          generateFrames(clips[0].uri, clips[0].duration * 1000);
          showToast({ message: t('createReel.mergeFailed'), variant: 'error' });
        }
      } else {
        setVideo({ uri: clips[0].uri, type: 'video', duration: clips[0].duration });
        generateFrames(clips[0].uri, clips[0].duration * 1000);
        showToast({ message: t('createReel.mergeUnavailable'), variant: 'info' });
      }
    } catch {
      setVideo({ uri: clips[0].uri, type: 'video', duration: clips[0].duration });
      generateFrames(clips[0].uri, clips[0].duration * 1000);
      showToast({ message: t('createReel.mergeFailed'), variant: 'error' });
    }
    setShowCamera(false);
  }, [clips, totalClipsDuration, t, generateFrames]);

  const deleteLastClip = useCallback(() => {
    if (clips.length === 0) return;
    haptic.delete();
    setClips(prev => prev.slice(0, -1));
  }, [clips.length, haptic]);

  const handleOpenCamera = useCallback(async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        showToast({ message: t('camera.permissionMessage'), variant: 'error' });
        return;
      }
    }
    setShowCamera(true);
  }, [cameraPermission, requestCameraPermission, t]);

  const formatRecordTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const pickVideo = useCallback(async () => {
    haptic.navigate();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: true,
      aspect: [9, 16],
      quality: 1,
      videoMaxDuration: 60,
      exif: false,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
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
      generateFrames(asset.uri, (asset.duration || 0) * 1000);
    }
  }, [haptic, t, generateFrames]);

  const removeVideo = useCallback(() => {
    setVideo(null);
    setThumbnailUri(null);
  }, []);

  return {
    video,
    setVideo,
    clips,
    setClips,
    totalClipsDuration,
    thumbnailUri,
    setThumbnailUri,
    thumbnailOptions,
    customThumbnail,
    setCustomThumbnail,
    showCamera,
    setShowCamera,
    cameraRef,
    cameraPermission,
    isRecording,
    facing,
    setFacing,
    recordTime,
    pickVideo,
    removeVideo,
    handleCameraRecord,
    finalizeClips,
    deleteLastClip,
    handleOpenCamera,
    formatRecordTime,
    generateFrames,
  };
}
