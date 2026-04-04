/**
 * useVideoExport — FFmpeg export pipeline and server-side upload fallback.
 *
 * Extracted from video-editor.tsx. Manages:
 * - Real FFmpeg export via ffmpegEngine (when available)
 * - Fallback: upload original + edit metadata for server-side processing
 * - Export progress tracking (animated)
 * - Cancel support
 */

import { useCallback, useRef } from 'react';
import { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { showToast } from '@/components/ui/Toast';
import { uploadApi } from '@/services/api';
import { executeExport, cancelExport, isFFmpegAvailable, type EditParams } from '@/services/ffmpegEngine';
import type { AudioTrack } from '@/types';
import type { SpeedOption, SpeedCurve, FilterName, QualityOption } from './types';

interface UseVideoExportParams {
  videoUri: string | null;
  t: (key: string, defaultValueOrOptions?: string | Record<string, unknown>) => string;
  router: { back: () => void; replace: (opts: { pathname: string; params: Record<string, string> }) => void };
  returnTo: string | undefined;

  // Edit state
  startTime: number;
  endTime: number;
  totalDuration: number;
  playbackSpeed: SpeedOption;
  speedCurve: SpeedCurve;
  selectedFilter: FilterName;
  selectedQuality: QualityOption;
  captionText: string;
  selectedTextColor: string;
  selectedFont: string;
  textStartTime: number;
  textEndTime: number;
  textSize: number;
  textBg: boolean;
  textShadow: boolean;
  originalVolume: number;
  musicVolume: number;
  selectedTrack: AudioTrack | null;
  voiceoverUri: string | null;
  isReversed: boolean;
  aspectRatio: '9:16' | '16:9' | '1:1' | '4:5';
  voiceEffect: string;
  stabilize: boolean;
  noiseReduce: boolean;
  freezeFrameAt: number | null;
  brightness: number;
  contrast: number;
  saturation: number;
  temperature: number;
  fadeIn: number;
  fadeOut: number;
  rotation: 0 | 90 | 180 | 270;
  sharpen: boolean;
  vignetteOn: boolean;
  grain: boolean;
  audioPitch: number;
  flipH: boolean;
  flipV: boolean;
  glitch: boolean;
  letterbox: boolean;
  boomerang: boolean;

  // Export state setters
  isExporting: boolean;
  setIsExporting: (v: boolean) => void;
  setExportProgress: (v: number) => void;
}

export interface UseVideoExportReturn {
  handleExport: () => Promise<void>;
  handleCancelExport: () => Promise<void>;
  exportProgressAnim: ReturnType<typeof useSharedValue<number>>;
  exportBarStyle: ReturnType<typeof useAnimatedStyle>;
}

export function useVideoExport(params: UseVideoExportParams): UseVideoExportReturn {
  const haptic = useContextualHaptic();
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exportProgressAnim = useSharedValue(0);

  const exportBarStyle = useAnimatedStyle(() => ({
    width: `${exportProgressAnim.value}%`,
  }));

  const handleExport = useCallback(async () => {
    if (params.isExporting) return;
    if (!params.videoUri) {
      showToast({ message: params.t('videoEditor.noVideo'), variant: 'error' });
      return;
    }

    haptic.send();
    params.setIsExporting(true);
    params.setExportProgress(0);
    exportProgressAnim.value = 0;

    const ffmpegReady = await isFFmpegAvailable();

    if (!ffmpegReady) {
      // FFmpeg not available - upload original video with edit metadata for server-side processing
      try {
        const editMetadata = {
          trimStart: params.startTime,
          trimEnd: params.endTime,
          speed: params.playbackSpeed,
          speedCurve: params.speedCurve !== 'none' ? params.speedCurve : undefined,
          filter: params.selectedFilter,
          caption: params.captionText,
          captionColor: params.selectedTextColor,
          captionFont: params.selectedFont,
          textStartTime: params.textStartTime,
          textEndTime: params.textEndTime || undefined,
          textSize: params.textSize !== 48 ? params.textSize : undefined,
          textBg: params.textBg || undefined,
          textShadow: params.textShadow || undefined,
          volume: params.originalVolume,
          musicVolume: params.musicVolume,
          musicTrackId: params.selectedTrack?.id,
          voiceEffect: params.voiceEffect !== 'none' ? params.voiceEffect : undefined,
          audioPitch: params.audioPitch !== 0 ? params.audioPitch : undefined,
          noiseReduce: params.noiseReduce || undefined,
          quality: params.selectedQuality,
          isReversed: params.isReversed || undefined,
          aspectRatio: params.aspectRatio !== '9:16' ? params.aspectRatio : undefined,
          stabilize: params.stabilize || undefined,
          brightness: params.brightness !== 0 ? params.brightness : undefined,
          contrast: params.contrast !== 0 ? params.contrast : undefined,
          saturation: params.saturation !== 0 ? params.saturation : undefined,
          temperature: params.temperature !== 0 ? params.temperature : undefined,
          fadeIn: params.fadeIn > 0 ? params.fadeIn : undefined,
          fadeOut: params.fadeOut > 0 ? params.fadeOut : undefined,
          rotation: params.rotation !== 0 ? params.rotation : undefined,
          sharpen: params.sharpen || undefined,
          vignette: params.vignetteOn || undefined,
          grain: params.grain || undefined,
          flipH: params.flipH || undefined,
          flipV: params.flipV || undefined,
          glitch: params.glitch || undefined,
          letterbox: params.letterbox || undefined,
          boomerang: params.boomerang || undefined,
          freezeFrameAt: params.freezeFrameAt,
        };

        params.setExportProgress(5);
        exportProgressAnim.value = withTiming(5, { duration: 200 });

        const presign = await uploadApi.getPresignUrl('video/mp4', 'videos');

        params.setExportProgress(15);
        exportProgressAnim.value = withTiming(15, { duration: 200 });

        const response = await fetch(params.videoUri);
        const blob = await (response as Response & { blob: () => Promise<Blob> }).blob();

        params.setExportProgress(30);
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

        params.setExportProgress(100);
        exportProgressAnim.value = withTiming(100, { duration: 200 });

        showToast({ message: params.t('videoEditor.videoSaved'), variant: 'success' });
        const navTimer = setTimeout(() => params.router.back(), 800);
        navTimerRef.current = navTimer;
      } catch {
        showToast({ message: params.t('videoEditor.saveFailed'), variant: 'error' });
      } finally {
        params.setIsExporting(false);
      }
      return;
    }

    // Real FFmpeg export via engine
    try {
      const editParams: EditParams = {
        inputUri: params.videoUri,
        startTime: params.startTime,
        endTime: params.endTime,
        totalDuration: params.totalDuration,
        speed: params.playbackSpeed,
        filter: params.selectedFilter,
        captionText: params.captionText,
        captionColor: params.selectedTextColor,
        captionFont: params.selectedFont,
        originalVolume: params.originalVolume,
        musicVolume: params.musicVolume,
        musicUri: params.selectedTrack?.audioUrl,
        voiceoverUri: params.voiceoverUri || undefined,
        quality: params.selectedQuality,
        isReversed: params.isReversed,
        aspectRatio: params.aspectRatio,
        speedCurve: params.speedCurve !== 'none' ? params.speedCurve : undefined,
        textStartTime: params.textStartTime,
        textEndTime: params.textEndTime || undefined,
        voiceEffect: params.voiceEffect as EditParams['voiceEffect'],
        stabilize: params.stabilize,
        noiseReduce: params.noiseReduce,
        freezeFrameAt: params.freezeFrameAt,
        brightness: params.brightness !== 0 ? params.brightness : undefined,
        contrast: params.contrast !== 0 ? params.contrast : undefined,
        saturation: params.saturation !== 0 ? params.saturation : undefined,
        temperature: params.temperature !== 0 ? params.temperature : undefined,
        fadeIn: params.fadeIn > 0 ? params.fadeIn : undefined,
        fadeOut: params.fadeOut > 0 ? params.fadeOut : undefined,
        rotation: params.rotation !== 0 ? params.rotation : undefined,
        sharpen: params.sharpen || undefined,
        vignette: params.vignetteOn || undefined,
        grain: params.grain || undefined,
        audioPitch: params.audioPitch !== 0 ? params.audioPitch : undefined,
        flipH: params.flipH || undefined,
        flipV: params.flipV || undefined,
        glitch: params.glitch || undefined,
        letterbox: params.letterbox || undefined,
        boomerang: params.boomerang || undefined,
        textSize: params.textSize !== 48 ? params.textSize : undefined,
        textBg: params.textBg || undefined,
        textShadow: params.textShadow || undefined,
      };

      const result = await executeExport(editParams, (percent) => {
        params.setExportProgress(percent);
        exportProgressAnim.value = withTiming(percent, { duration: 80 });
      });

      if (result.success && result.outputUri) {
        params.setExportProgress(100);
        exportProgressAnim.value = withTiming(100, { duration: 200 });
        showToast({ message: params.t('videoEditor.exportComplete'), variant: 'success' });
        // Pass exported URI back
        if (params.returnTo) {
          params.router.replace({ pathname: params.returnTo, params: { videoUri: result.outputUri, edited: 'true' } });
        } else {
          params.router.back();
        }
      } else if (result.cancelled) {
        showToast({ message: params.t('videoEditor.exportCancelled'), variant: 'info' });
      } else {
        showToast({ message: params.t('videoEditor.exportFailed'), variant: 'error' });
      }
    } catch {
      showToast({ message: params.t('videoEditor.exportFailed'), variant: 'error' });
    } finally {
      params.setIsExporting(false);
    }
  }, [haptic, exportProgressAnim, params]);

  const handleCancelExport = useCallback(async () => {
    haptic.delete();
    await cancelExport();
  }, [haptic]);

  return {
    handleExport,
    handleCancelExport,
    exportProgressAnim,
    exportBarStyle,
  };
}
