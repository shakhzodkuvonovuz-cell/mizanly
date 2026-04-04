/**
 * useVideoEditorState — manages ALL editable state for the video editor.
 *
 * Extracted from video-editor.tsx to reduce the god component.
 * Includes the undo/redo snapshot system.
 */

import { useState, useCallback } from 'react';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import type { AudioTrack } from '@/types';
import type {
  ToolTab,
  SpeedOption,
  FilterName,
  QualityOption,
  VoiceEffect,
  SpeedCurve,
  EditSnapshot,
  VideoEditorState,
  UndoRedoSystem,
} from './types';

export interface UseVideoEditorStateReturn extends VideoEditorState, UndoRedoSystem {}

export function useVideoEditorState(): UseVideoEditorStateReturn {
  const haptic = useContextualHaptic();

  // Playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [videoLoaded, setVideoLoaded] = useState(false);

  // Trim
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);

  // Speed
  const [playbackSpeed, setPlaybackSpeed] = useState<SpeedOption>(1);
  const [speedCurve, setSpeedCurve] = useState<SpeedCurve>('none');

  // Filter
  const [selectedFilter, setSelectedFilter] = useState<FilterName>('original');

  // Quality
  const [selectedQuality, setSelectedQuality] = useState<QualityOption>('1080p');

  // Tools
  const [selectedTool, setSelectedTool] = useState<ToolTab>('trim');

  // Text/Caption
  const [captionText, setCaptionText] = useState('');
  const [selectedFont, setSelectedFont] = useState('default');
  const [selectedTextColor, setSelectedTextColor] = useState('#FFFFFF');
  const [textStartTime, setTextStartTime] = useState(0);
  const [textEndTime, setTextEndTime] = useState(0);
  const [textSize, setTextSize] = useState(48);
  const [textBg, setTextBg] = useState(false);
  const [textShadow, setTextShadow] = useState(false);

  // Volume
  const [originalVolume, setOriginalVolume] = useState(80);
  const [musicVolume, setMusicVolume] = useState(60);

  // Music
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<AudioTrack | null>(null);

  // Voiceover
  const [voiceoverUri, setVoiceoverUri] = useState<string | null>(null);
  const [isRecordingVoiceover, setIsRecordingVoiceover] = useState(false);

  // Effects — color grading
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [saturation, setSaturation] = useState(0);
  const [temperature, setTemperature] = useState(0);
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);

  // Effects — visual
  const [isReversed, setIsReversed] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9' | '1:1' | '4:5'>('9:16');
  const [voiceEffect, setVoiceEffect] = useState<VoiceEffect>('none');
  const [stabilize, setStabilize] = useState(false);
  const [noiseReduce, setNoiseReduce] = useState(false);
  const [freezeFrameAt, setFreezeFrameAt] = useState<number | null>(null);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [sharpen, setSharpen] = useState(false);
  const [vignetteOn, setVignetteOn] = useState(false);
  const [grain, setGrain] = useState(false);
  const [audioPitch, setAudioPitch] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [glitch, setGlitch] = useState(false);
  const [letterbox, setLetterbox] = useState(false);
  const [boomerang, setBoomerang] = useState(false);

  // Emoji picker
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // TTS
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Export
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // ── Undo/Redo ──────────────────────────────────────────────────────

  const [undoStack, setUndoStack] = useState<EditSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<EditSnapshot[]>([]);

  const captureSnapshot = useCallback((): EditSnapshot => ({
    startTime, endTime, speed: playbackSpeed, speedCurve, filter: selectedFilter,
    captionText, originalVolume, musicVolume, isReversed,
    voiceEffect, stabilize, noiseReduce, freezeFrameAt,
    textStartTime, textEndTime, aspectRatio,
    brightness, contrast, saturation, temperature, fadeIn, fadeOut,
    rotation, sharpen, vignetteOn, grain, audioPitch,
    flipH, flipV, glitch, letterbox, boomerang, textSize, textBg, textShadow,
  }), [startTime, endTime, playbackSpeed, speedCurve, selectedFilter, captionText, originalVolume, musicVolume, isReversed, voiceEffect, stabilize, noiseReduce, freezeFrameAt, textStartTime, textEndTime, aspectRatio, brightness, contrast, saturation, temperature, fadeIn, fadeOut, rotation, sharpen, vignetteOn, grain, audioPitch, flipH, flipV, glitch, letterbox, boomerang, textSize, textBg, textShadow]);

  const applySnapshot = useCallback((s: EditSnapshot) => {
    setStartTime(s.startTime); setEndTime(s.endTime);
    setPlaybackSpeed(s.speed); setSpeedCurve(s.speedCurve); setSelectedFilter(s.filter);
    setBrightness(s.brightness); setContrast(s.contrast); setSaturation(s.saturation);
    setTemperature(s.temperature); setFadeIn(s.fadeIn); setFadeOut(s.fadeOut);
    setRotation(s.rotation); setSharpen(s.sharpen); setVignetteOn(s.vignetteOn); setGrain(s.grain);
    setAudioPitch(s.audioPitch); setFlipH(s.flipH); setFlipV(s.flipV); setGlitch(s.glitch);
    setLetterbox(s.letterbox); setBoomerang(s.boomerang); setTextSize(s.textSize);
    setTextBg(s.textBg); setTextShadow(s.textShadow);
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

  return {
    // Playback
    isPlaying, setIsPlaying,
    currentTime, setCurrentTime,
    totalDuration, setTotalDuration,
    videoLoaded, setVideoLoaded,

    // Trim
    startTime, setStartTime,
    endTime, setEndTime,

    // Speed
    playbackSpeed, setPlaybackSpeed,
    speedCurve, setSpeedCurve,

    // Filter
    selectedFilter, setSelectedFilter,

    // Quality
    selectedQuality, setSelectedQuality,

    // Tools
    selectedTool, setSelectedTool,

    // Text/Caption
    captionText, setCaptionText,
    selectedFont, setSelectedFont,
    selectedTextColor, setSelectedTextColor,
    textStartTime, setTextStartTime,
    textEndTime, setTextEndTime,
    textSize, setTextSize,
    textBg, setTextBg,
    textShadow, setTextShadow,

    // Volume
    originalVolume, setOriginalVolume,
    musicVolume, setMusicVolume,

    // Music
    showMusicPicker, setShowMusicPicker,
    selectedTrack, setSelectedTrack,

    // Voiceover
    voiceoverUri, setVoiceoverUri,
    isRecordingVoiceover, setIsRecordingVoiceover,

    // Effects — color grading
    brightness, setBrightness,
    contrast, setContrast,
    saturation, setSaturation,
    temperature, setTemperature,
    fadeIn, setFadeIn,
    fadeOut, setFadeOut,

    // Effects — visual
    isReversed, setIsReversed,
    aspectRatio, setAspectRatio,
    voiceEffect, setVoiceEffect,
    stabilize, setStabilize,
    noiseReduce, setNoiseReduce,
    freezeFrameAt, setFreezeFrameAt,
    rotation, setRotation,
    sharpen, setSharpen,
    vignetteOn, setVignetteOn,
    grain, setGrain,
    audioPitch, setAudioPitch,
    flipH, setFlipH,
    flipV, setFlipV,
    glitch, setGlitch,
    letterbox, setLetterbox,
    boomerang, setBoomerang,

    // Emoji picker
    showEmojiPicker, setShowEmojiPicker,

    // TTS
    isSpeaking, setIsSpeaking,

    // Export
    isExporting, setIsExporting,
    exportProgress, setExportProgress,

    // Undo/Redo
    undoStack, redoStack,
    pushUndo, handleUndo, handleRedo,
    captureSnapshot, applySnapshot,
  };
}
