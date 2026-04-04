/**
 * useVideoTimeline — timeline scrubbing, trim gestures, waveform data.
 *
 * Extracted from video-editor.tsx. Manages:
 * - Animated trim handle positions (left/right)
 * - Pan gestures for dragging trim handles
 * - Waveform data (deterministic, no Math.random)
 * - Timeline width tracking for gesture math
 */

import { useRef, useEffect, useMemo, useCallback } from 'react';
import { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import { Gesture } from 'react-native-gesture-handler';
import type { Video } from 'expo-av';

const MIN_TRIM_GAP = 1; // minimum 1 second between handles

interface UseVideoTimelineParams {
  totalDuration: number;
  startTime: number;
  endTime: number;
  setStartTime: (v: number) => void;
  setEndTime: (v: number) => void;
  videoRef: React.RefObject<Video | null>;
}

export interface UseVideoTimelineReturn {
  /** Ref for timeline layout width measurement */
  timelineWidth: React.MutableRefObject<number>;
  /** Animated styles for left trim handle */
  leftHandleStyle: ReturnType<typeof useAnimatedStyle>;
  /** Animated styles for right trim handle */
  rightHandleStyle: ReturnType<typeof useAnimatedStyle>;
  /** Pan gesture for left trim handle */
  leftTrimGesture: ReturnType<typeof Gesture.Pan>;
  /** Pan gesture for right trim handle */
  rightTrimGesture: ReturnType<typeof Gesture.Pan>;
  /** Deterministic waveform bar heights (40 values) */
  waveformData: number[];
}

export function useVideoTimeline({
  totalDuration,
  startTime,
  endTime,
  setStartTime,
  setEndTime,
  videoRef,
}: UseVideoTimelineParams): UseVideoTimelineReturn {
  // Timeline width reference for gesture calculations
  const timelineWidth = useRef(0);

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

  // Seek helper - extracted as named function for runOnJS
  const seekToStart = useCallback(() => {
    videoRef.current?.setPositionAsync(startTime * 1000);
  }, [startTime, videoRef]);

  // Left trim gesture: captures start position in onStart, uses absolute offset in onUpdate
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

  // Right trim gesture: same pattern
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

  // Deterministic waveform pattern that looks like real audio (no Math.random)
  const waveformData = useMemo(() =>
    Array.from({ length: 40 }, (_, i) => {
      const t = i / 40;
      return 10 + 15 * Math.abs(Math.sin(t * Math.PI * 4)) + 8 * Math.abs(Math.sin(t * Math.PI * 7));
    }),
  []);

  return {
    timelineWidth,
    leftHandleStyle,
    rightHandleStyle,
    leftTrimGesture,
    rightTrimGesture,
    waveformData,
  };
}
