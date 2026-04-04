/**
 * useVideoVolumeGestures — pan gestures for volume sliders.
 *
 * Extracted from video-editor.tsx. Manages:
 * - Original audio volume gesture
 * - Music volume gesture
 * - Slider layout measurement refs
 */

import { useRef } from 'react';
import { View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

interface UseVideoVolumeGesturesParams {
  setOriginalVolume: (v: number) => void;
  setMusicVolume: (v: number) => void;
}

export interface UseVideoVolumeGesturesReturn {
  volumeSliderWidth: React.MutableRefObject<number>;
  volumeSliderX: React.MutableRefObject<number>;
  volumeSliderRef: React.MutableRefObject<View | null>;
  onOriginalVolumeGesture: ReturnType<typeof Gesture.Pan>;
  onMusicVolumeGesture: ReturnType<typeof Gesture.Pan>;
}

export function useVideoVolumeGestures({
  setOriginalVolume,
  setMusicVolume,
}: UseVideoVolumeGesturesParams): UseVideoVolumeGesturesReturn {
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

  return {
    volumeSliderWidth,
    volumeSliderX,
    volumeSliderRef,
    onOriginalVolumeGesture,
    onMusicVolumeGesture,
  };
}
