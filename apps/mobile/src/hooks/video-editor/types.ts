/**
 * Shared types for the video editor hooks.
 * Extracted from video-editor.tsx to avoid circular dependencies.
 */

export type ToolTab = 'trim' | 'speed' | 'filters' | 'adjust' | 'text' | 'music' | 'volume' | 'voiceover' | 'effects';
export type SpeedOption = 0.25 | 0.5 | 1 | 1.5 | 2 | 3;
export type FilterName = 'original' | 'warm' | 'cool' | 'bw' | 'vintage' | 'vivid' | 'dramatic' | 'fade' | 'emerald' | 'golden' | 'night' | 'soft' | 'cinematic';
export type QualityOption = '720p' | '1080p' | '4K';
export type VoiceEffect = 'none' | 'robot' | 'echo' | 'deep' | 'chipmunk' | 'telephone';
export type SpeedCurve = 'none' | 'montage' | 'hero' | 'bullet' | 'flashIn' | 'flashOut';

export type EditSnapshot = {
  startTime: number; endTime: number; speed: SpeedOption; speedCurve: SpeedCurve; filter: FilterName;
  captionText: string; originalVolume: number; musicVolume: number; isReversed: boolean;
  voiceEffect: VoiceEffect; stabilize: boolean; noiseReduce: boolean;
  freezeFrameAt: number | null; textStartTime: number; textEndTime: number;
  aspectRatio: '9:16' | '16:9' | '1:1' | '4:5';
  brightness: number; contrast: number; saturation: number; temperature: number;
  fadeIn: number; fadeOut: number;
  rotation: 0 | 90 | 180 | 270; sharpen: boolean; vignetteOn: boolean; grain: boolean;
  audioPitch: number; flipH: boolean; flipV: boolean; glitch: boolean;
  letterbox: boolean; boomerang: boolean; textSize: number; textBg: boolean; textShadow: boolean;
};

/** All editable state managed by useVideoEditorState */
export interface VideoEditorState {
  // Playback
  isPlaying: boolean;
  setIsPlaying: (v: boolean) => void;
  currentTime: number;
  setCurrentTime: (v: number) => void;
  totalDuration: number;
  setTotalDuration: (v: number) => void;
  videoLoaded: boolean;
  setVideoLoaded: (v: boolean) => void;

  // Trim
  startTime: number;
  setStartTime: (v: number) => void;
  endTime: number;
  setEndTime: (v: number) => void;

  // Speed
  playbackSpeed: SpeedOption;
  setPlaybackSpeed: (v: SpeedOption) => void;
  speedCurve: SpeedCurve;
  setSpeedCurve: (v: SpeedCurve) => void;

  // Filter
  selectedFilter: FilterName;
  setSelectedFilter: (v: FilterName) => void;

  // Quality
  selectedQuality: QualityOption;
  setSelectedQuality: (v: QualityOption) => void;

  // Tools
  selectedTool: ToolTab;
  setSelectedTool: (v: ToolTab) => void;

  // Text/Caption — setCaptionText uses Dispatch to allow updater function form
  captionText: string;
  setCaptionText: React.Dispatch<React.SetStateAction<string>>;
  selectedFont: string;
  setSelectedFont: (v: string) => void;
  selectedTextColor: string;
  setSelectedTextColor: (v: string) => void;
  textStartTime: number;
  setTextStartTime: (v: number) => void;
  textEndTime: number;
  setTextEndTime: (v: number) => void;
  textSize: number;
  setTextSize: (v: number) => void;
  textBg: boolean;
  setTextBg: (v: boolean) => void;
  textShadow: boolean;
  setTextShadow: (v: boolean) => void;

  // Volume
  originalVolume: number;
  setOriginalVolume: (v: number) => void;
  musicVolume: number;
  setMusicVolume: (v: number) => void;

  // Music
  showMusicPicker: boolean;
  setShowMusicPicker: (v: boolean) => void;
  selectedTrack: import('@/types').AudioTrack | null;
  setSelectedTrack: (v: import('@/types').AudioTrack | null) => void;

  // Voiceover
  voiceoverUri: string | null;
  setVoiceoverUri: (v: string | null) => void;
  isRecordingVoiceover: boolean;
  setIsRecordingVoiceover: (v: boolean) => void;

  // Effects — color grading
  brightness: number;
  setBrightness: (v: number) => void;
  contrast: number;
  setContrast: (v: number) => void;
  saturation: number;
  setSaturation: (v: number) => void;
  temperature: number;
  setTemperature: (v: number) => void;
  fadeIn: number;
  setFadeIn: (v: number) => void;
  fadeOut: number;
  setFadeOut: (v: number) => void;

  // Effects — visual
  isReversed: boolean;
  setIsReversed: (v: boolean) => void;
  aspectRatio: '9:16' | '16:9' | '1:1' | '4:5';
  setAspectRatio: (v: '9:16' | '16:9' | '1:1' | '4:5') => void;
  voiceEffect: VoiceEffect;
  setVoiceEffect: (v: VoiceEffect) => void;
  stabilize: boolean;
  setStabilize: (v: boolean) => void;
  noiseReduce: boolean;
  setNoiseReduce: (v: boolean) => void;
  freezeFrameAt: number | null;
  setFreezeFrameAt: (v: number | null) => void;
  rotation: 0 | 90 | 180 | 270;
  setRotation: (v: 0 | 90 | 180 | 270) => void;
  sharpen: boolean;
  setSharpen: (v: boolean) => void;
  vignetteOn: boolean;
  setVignetteOn: (v: boolean) => void;
  grain: boolean;
  setGrain: (v: boolean) => void;
  audioPitch: number;
  setAudioPitch: (v: number) => void;
  flipH: boolean;
  setFlipH: (v: boolean) => void;
  flipV: boolean;
  setFlipV: (v: boolean) => void;
  glitch: boolean;
  setGlitch: (v: boolean) => void;
  letterbox: boolean;
  setLetterbox: (v: boolean) => void;
  boomerang: boolean;
  setBoomerang: (v: boolean) => void;

  // Emoji picker
  showEmojiPicker: boolean;
  setShowEmojiPicker: (v: boolean) => void;

  // TTS
  isSpeaking: boolean;
  setIsSpeaking: (v: boolean) => void;

  // Export
  isExporting: boolean;
  setIsExporting: (v: boolean) => void;
  exportProgress: number;
  setExportProgress: (v: number) => void;
}

/** Undo/redo system */
export interface UndoRedoSystem {
  undoStack: EditSnapshot[];
  redoStack: EditSnapshot[];
  pushUndo: () => void;
  handleUndo: () => void;
  handleRedo: () => void;
  captureSnapshot: () => EditSnapshot;
  applySnapshot: (s: EditSnapshot) => void;
}
