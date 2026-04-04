/**
 * useVideoPlayback — video player controls (play/pause, speed, volume, status).
 *
 * Extracted from video-editor.tsx. Manages:
 * - Play/pause toggle
 * - Speed cycling
 * - Volume application to video
 * - Playback status updates
 * - Seeking to position
 */

import { useRef, useCallback, useEffect } from 'react';
import type { Video, AVPlaybackStatus } from 'expo-av';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import type { SpeedOption } from './types';

interface UseVideoPlaybackParams {
  isPlaying: boolean;
  setIsPlaying: (v: boolean) => void;
  setCurrentTime: (v: number) => void;
  totalDuration: number;
  setTotalDuration: (v: number) => void;
  setEndTime: (v: number) => void;
  videoLoaded: boolean;
  setVideoLoaded: (v: boolean) => void;
  playbackSpeed: SpeedOption;
  setPlaybackSpeed: (v: SpeedOption) => void;
  originalVolume: number;
  startTime: number;
  endTime: number;
}

export interface UseVideoPlaybackReturn {
  videoRef: React.MutableRefObject<Video | null>;
  onPlaybackStatusUpdate: (status: AVPlaybackStatus) => void;
  togglePlayback: () => Promise<void>;
  seekToPosition: (fraction: number) => Promise<void>;
  cyclePlaybackSpeed: () => void;
}

export function useVideoPlayback({
  isPlaying,
  setIsPlaying,
  setCurrentTime,
  totalDuration,
  setTotalDuration,
  setEndTime,
  videoLoaded,
  setVideoLoaded,
  playbackSpeed,
  setPlaybackSpeed,
  originalVolume,
  startTime,
  endTime,
}: UseVideoPlaybackParams): UseVideoPlaybackReturn {
  const haptic = useContextualHaptic();
  const videoRef = useRef<Video>(null);

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
  }, [totalDuration, setCurrentTime, setTotalDuration, setEndTime, setIsPlaying]);

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

  const cyclePlaybackSpeed = useCallback(() => {
    haptic.tick();
    const speeds: SpeedOption[] = [0.5, 1, 1.5, 2];
    const currentIndex = speeds.indexOf(playbackSpeed);
    const nextIndex = (currentIndex + 1) % speeds.length;
    setPlaybackSpeed(speeds[nextIndex]);
  }, [haptic, playbackSpeed, setPlaybackSpeed]);

  return {
    videoRef,
    onPlaybackStatusUpdate,
    togglePlayback,
    seekToPosition,
    cyclePlaybackSpeed,
  };
}
