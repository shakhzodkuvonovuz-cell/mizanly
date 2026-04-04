/**
 * useVideoVoiceover — voiceover recording management.
 *
 * Extracted from video-editor.tsx. Manages:
 * - Audio recording start/stop
 * - Recording ref lifecycle
 * - Cleanup on unmount
 * - Audio mode switching (iOS recording/playback)
 */

import { useRef, useEffect, useCallback } from 'react';
import { Audio } from 'expo-av';
import type { Video } from 'expo-av';
import * as Speech from 'expo-speech';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { showToast } from '@/components/ui/Toast';

interface UseVideoVoiceoverParams {
  videoRef: React.RefObject<Video | null>;
  startTime: number;
  setVoiceoverUri: (v: string | null) => void;
  isRecordingVoiceover: boolean;
  setIsRecordingVoiceover: (v: boolean) => void;
  t: (key: string, defaultValueOrOptions?: string | Record<string, unknown>) => string;
}

export interface UseVideoVoiceoverReturn {
  /** Toggle voiceover recording on/off */
  toggleVoiceoverRecording: () => Promise<void>;
}

export function useVideoVoiceover({
  videoRef,
  startTime,
  setVoiceoverUri,
  isRecordingVoiceover,
  setIsRecordingVoiceover,
  t,
}: UseVideoVoiceoverParams): UseVideoVoiceoverReturn {
  const haptic = useContextualHaptic();
  const recordingRef = useRef<Audio.Recording | null>(null);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup: stop voiceover recording and TTS on unmount
  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
      if (navTimerRef.current) {
        clearTimeout(navTimerRef.current);
      }
      Speech.stop();
      Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    };
  }, []);

  const toggleVoiceoverRecording = useCallback(async () => {
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
          showToast({ message: t('videoEditor.voiceoverFailed', 'Voiceover save failed'), variant: 'error' });
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
        showToast({ message: t('videoEditor.recordingFailed', 'Recording failed to start'), variant: 'error' });
      }
    }
  }, [haptic, isRecordingVoiceover, setIsRecordingVoiceover, videoRef, setVoiceoverUri, startTime, t]);

  return {
    toggleVoiceoverRecording,
  };
}
