/**
 * FFmpeg command builder and executor for the video editor.
 *
 * Encapsulates all FFmpeg-kit interactions:
 * - Command string construction from edit parameters
 * - Async execution with progress callbacks
 * - Cancel support
 * - Quality preset mapping
 * - Filter graph composition
 *
 * Uses ffmpeg-kit-react-native (full-gpl variant configured via Expo plugin).
 * Gracefully degrades if native module isn't linked.
 *
 * NOTE: Only one export can run at a time (single activeSessionId).
 */

import * as FileSystem from 'expo-file-system';

// ── Types ──────────────────────────────────────────────────────────

export type FilterName = 'original' | 'warm' | 'cool' | 'bw' | 'vintage' | 'vivid' | 'dramatic' | 'fade' | 'emerald' | 'golden' | 'night' | 'soft' | 'cinematic';
export type QualityPreset = '720p' | '1080p' | '4K';

export type AspectRatio = '9:16' | '16:9' | '1:1' | '4:5';

/** Max clip duration (seconds) for reverse — prevents OOM on long videos */
const MAX_REVERSE_DURATION = 300; // 5 minutes

export type VoiceEffect = 'none' | 'robot' | 'echo' | 'deep' | 'chipmunk' | 'telephone';

export interface EditParams {
  inputUri: string;
  startTime: number;       // seconds
  endTime: number;         // seconds
  totalDuration: number;   // seconds
  speed: number;           // 0.25–3
  filter: FilterName;
  captionText: string;
  captionColor: string;
  captionFont: string;
  textStartTime?: number;  // when caption appears (seconds)
  textEndTime?: number;    // when caption disappears (0 = end of clip)
  originalVolume: number;  // 0–100
  musicVolume: number;     // 0–100
  musicUri?: string;       // optional background music
  quality: QualityPreset;
  isReversed?: boolean;    // reverse playback
  aspectRatio?: AspectRatio; // output aspect ratio
  voiceEffect?: VoiceEffect; // audio voice effect
  stabilize?: boolean;     // video stabilization (vidstab)
  noiseReduce?: boolean;   // audio noise reduction
  freezeFrameAt?: number | null; // seconds to freeze, null = none
}

export interface ExportResult {
  success: boolean;
  outputUri?: string;
  error?: string;
  cancelled?: boolean;
}

export type ProgressCallback = (percent: number) => void;

// ── Filter map ─────────────────────────────────────────────────────

const FILTER_MAP: Record<FilterName, string> = {
  original: '',
  warm: "curves=r='0/0 0.5/0.6 1/1':g='0/0 0.5/0.5 1/0.9':b='0/0 0.5/0.4 1/0.8'",
  cool: "curves=r='0/0 0.5/0.4 1/0.85':g='0/0 0.5/0.5 1/0.95':b='0/0 0.5/0.6 1/1'",
  bw: 'hue=s=0',
  vintage: "curves=r='0/0.1 0.5/0.55 1/0.9':g='0/0.05 0.5/0.45 1/0.85':b='0/0 0.5/0.35 1/0.7',vignette",
  vivid: 'eq=saturation=1.5:contrast=1.1',
  dramatic: 'eq=contrast=1.3:brightness=-0.05:saturation=1.2,vignette=PI/4',
  fade: 'eq=saturation=0.5:contrast=0.9:brightness=0.05',
  emerald: "curves=r='0/0 0.5/0.3 1/0.7':g='0/0 0.5/0.6 1/1':b='0/0 0.5/0.35 1/0.75'",
  golden: "curves=r='0/0 0.5/0.6 1/1':g='0/0 0.5/0.5 1/0.85':b='0/0 0.5/0.3 1/0.6',eq=brightness=0.03",
  night: "eq=brightness=-0.1:contrast=1.2:saturation=0.7,curves=b='0/0 0.5/0.55 1/0.9'",
  soft: "eq=saturation=0.8:contrast=0.9:brightness=0.06,gblur=sigma=0.5",
  cinematic: "eq=contrast=1.15:saturation=0.9,curves=r='0/0.05 0.5/0.45 1/0.9':b='0/0 0.5/0.4 1/0.85',vignette=PI/5",
};

// ── Quality presets ────────────────────────────────────────────────

// ── Voice effects map ──────────────────────────────────────────────

const VOICE_EFFECT_MAP: Record<VoiceEffect, string> = {
  none: '',
  robot: 'asetrate=44100*0.8,aresample=44100,atempo=1.25',
  echo: 'aecho=0.8:0.88:60:0.4',
  deep: 'asetrate=44100*0.75,aresample=44100,atempo=1.333',
  chipmunk: 'asetrate=44100*1.5,aresample=44100,atempo=0.667',
  telephone: 'highpass=f=300,lowpass=f=3400',
};

interface QualityConfig {
  scale: string;      // FFmpeg scale filter (empty = keep original)
  crf: number;        // H.264 constant rate factor (lower = higher quality)
  preset: string;     // encoding speed preset
  audioBitrate: string;
}

const QUALITY_MAP: Record<QualityPreset, QualityConfig> = {
  '720p':  { scale: 'scale=-2:720',  crf: 28, preset: 'fast',   audioBitrate: '128k' },
  '1080p': { scale: '',              crf: 23, preset: 'fast',   audioBitrate: '192k' },
  '4K':    { scale: 'scale=-2:2160', crf: 18, preset: 'medium', audioBitrate: '256k' },
};

// ── Active session tracking (for cancel) ───────────────────────────

let activeSessionId: number | null = null;

// ── FFmpeg availability check ──────────────────────────────────────

let _ffmpegKit: typeof import('ffmpeg-kit-react-native') | null = null;
let _loadFailed = false;

async function getFFmpegKit(): Promise<typeof import('ffmpeg-kit-react-native') | null> {
  // Return cached result if already loaded
  if (_ffmpegKit) return _ffmpegKit;
  // Don't retry if it previously failed (avoids repeated import cost)
  // But allow one retry per app session via resetFFmpegCheck()
  if (_loadFailed) return null;
  try {
    _ffmpegKit = await import('ffmpeg-kit-react-native');
    return _ffmpegKit;
  } catch {
    _loadFailed = true;
    if (__DEV__) console.warn('[FFmpegEngine] ffmpeg-kit-react-native not available');
    return null;
  }
}

export async function isFFmpegAvailable(): Promise<boolean> {
  const kit = await getFFmpegKit();
  return kit !== null;
}

/** Allow retrying FFmpeg import (e.g., after hot reload in dev) */
export function resetFFmpegCheck(): void {
  _ffmpegKit = null;
  _loadFailed = false;
}

// ── Atempo helper ──────────────────────────────────────────────────
// atempo only supports 0.5–100. For values below 0.5, chain multiple.

function buildAtempoChain(speed: number): string {
  if (speed >= 0.5 && speed <= 100) {
    return `atempo=${speed}`;
  }
  if (speed < 0.5 && speed >= 0.25) {
    return 'atempo=0.5,atempo=0.5';
  }
  if (speed < 0.25) {
    // 0.125x = atempo=0.5,atempo=0.5,atempo=0.5
    const chains: string[] = [];
    let remaining = speed;
    while (remaining < 0.5) {
      chains.push('atempo=0.5');
      remaining *= 2;
    }
    if (remaining !== 1) chains.push(`atempo=${remaining}`);
    return chains.join(',');
  }
  return `atempo=${speed}`;
}

// ── Command builder ────────────────────────────────────────────────

export function buildCommand(params: EditParams, outputPath: string): string {
  const { inputUri, startTime, endTime, totalDuration, speed, filter, captionText, captionColor, originalVolume, quality } = params;
  const qualityCfg = QUALITY_MAP[quality];
  const clipDuration = endTime - startTime;

  const parts: string[] = [];

  // Input with seek (use -ss before -i for fast seek)
  // When reversing, we must NOT use -ss seek — reverse needs full decoded frames.
  // Instead, use trim filter inside the filter chain for reversed clips.
  const needsTrim = startTime > 0.1 || endTime < totalDuration - 0.1;
  if (needsTrim && !params.isReversed) {
    parts.push(`-ss ${startTime.toFixed(3)}`);
    parts.push(`-to ${endTime.toFixed(3)}`);
  }
  parts.push(`-i "${inputUri}"`);

  // Music input (if any)
  if (params.musicUri) {
    parts.push(`-i "${params.musicUri}"`);
  }

  // ── Video filter chain ──────────────────────────────────

  const vFilters: string[] = [];

  // When reversing with trim, use trim filter first (since we can't use -ss with reverse)
  if (params.isReversed && needsTrim) {
    vFilters.push(`trim=start=${startTime.toFixed(3)}:end=${endTime.toFixed(3)},setpts=PTS-STARTPTS`);
  }

  // Reverse video (requires entire segment in memory — capped at MAX_REVERSE_DURATION)
  if (params.isReversed && clipDuration <= MAX_REVERSE_DURATION) {
    vFilters.push('reverse');
  }

  // Speed adjustment
  if (speed !== 1) {
    vFilters.push(`setpts=${(1 / speed).toFixed(4)}*PTS`);
  }

  // Color filter
  const colorFilter = FILTER_MAP[filter];
  if (colorFilter) {
    vFilters.push(colorFilter);
  }

  // Scale (quality preset)
  if (qualityCfg.scale) {
    vFilters.push(qualityCfg.scale);
  }

  // Aspect ratio crop (center crop to target ratio)
  // Use min() to prevent crop dimensions exceeding input dimensions
  if (params.aspectRatio && params.aspectRatio !== '9:16') {
    const ratioMap: Record<string, string> = {
      '16:9': 'crop=min(iw\\,ih*16/9):min(ih\\,iw*9/16)',
      '1:1': 'crop=min(iw\\,ih):min(iw\\,ih)',
      '4:5': 'crop=min(iw\\,ih*4/5):min(ih\\,iw*5/4)',
    };
    const cropFilter = ratioMap[params.aspectRatio];
    if (cropFilter) vFilters.push(cropFilter);
  }

  // Text overlay — use FFmpeg-native escaping + optional timing
  if (captionText.trim()) {
    const escaped = captionText
      .replace(/\\/g, '\\\\\\\\')  // backslash
      .replace(/'/g, "'\\\\\\''")   // single quote
      .replace(/:/g, '\\:')         // colon (FFmpeg option separator)
      .replace(/%/g, '%%')          // percent (FFmpeg time code)
      .replace(/\[/g, '\\[')        // brackets
      .replace(/\]/g, '\\]');
    // Text timing: enable only between textStartTime and textEndTime
    const txtStart = params.textStartTime ?? 0;
    const txtEnd = params.textEndTime && params.textEndTime > 0 ? params.textEndTime : clipDuration;
    const enableExpr = `:enable='between(t,${txtStart.toFixed(2)},${txtEnd.toFixed(2)})'`;
    vFilters.push(
      `drawtext=text='${escaped}':fontsize=48:fontcolor=${captionColor}:x=(w-text_w)/2:y=h-th-80:borderw=2:bordercolor=black@0.5${enableExpr}`
    );
  }

  // Video stabilization (2-pass: vidstabdetect then vidstabtransform)
  // NOTE: vidstab requires 2-pass which can't be done in a single command.
  // Use a lightweight approach: deshake filter (single-pass, less accurate but works)
  if (params.stabilize) {
    vFilters.push('deshake=rx=32:ry=32');
  }

  // Freeze frame at specific time (tpad extends the frame)
  if (params.freezeFrameAt !== null && params.freezeFrameAt !== undefined) {
    const freezeAt = params.freezeFrameAt - startTime; // relative to trimmed clip
    if (freezeAt > 0 && freezeAt < clipDuration) {
      vFilters.push(`tpad=stop_mode=clone:stop_duration=2:stop=${Math.floor(freezeAt * 25)}`);
    }
  }

  if (vFilters.length > 0) {
    parts.push(`-vf "${vFilters.join(',')}"`);
  }

  // ── Audio filter chain ──────────────────────────────────

  if (params.musicUri) {
    // Complex audio filter for mixing original + music
    // Handles: reverse, speed, volume for original audio + volume for music
    const musicVol = (params.musicVolume / 100).toFixed(2);
    const origVol = (originalVolume / 100).toFixed(2);

    const origChain: string[] = [`volume=${origVol}`];
    if (params.isReversed && needsTrim) {
      origChain.unshift(`atrim=start=${startTime.toFixed(3)}:end=${endTime.toFixed(3)},asetpts=PTS-STARTPTS`);
    }
    if (params.isReversed && clipDuration <= MAX_REVERSE_DURATION) {
      origChain.push('areverse');
    }
    if (speed !== 1) {
      origChain.push(buildAtempoChain(speed));
    }
    const voiceFilterMix = VOICE_EFFECT_MAP[params.voiceEffect || 'none'];
    if (voiceFilterMix) origChain.push(voiceFilterMix);
    if (params.noiseReduce) origChain.push('highpass=f=80,lowpass=f=12000,afftdn=nf=-20');

    parts.push(
      `-filter_complex "[0:a]${origChain.join(',')}[a0];[1:a]volume=${musicVol}[a1];[a0][a1]amix=inputs=2:duration=first[aout]"`,
      '-map 0:v',
      '-map "[aout]"'
    );
  } else {
    // Simple audio filter chain (no music mixing)
    const aFilters: string[] = [];

    // Trim audio when reversing (since we can't use -ss)
    if (params.isReversed && needsTrim) {
      aFilters.push(`atrim=start=${startTime.toFixed(3)}:end=${endTime.toFixed(3)},asetpts=PTS-STARTPTS`);
    }

    // Reverse audio
    if (params.isReversed && clipDuration <= MAX_REVERSE_DURATION) {
      aFilters.push('areverse');
    }

    // Speed adjustment for audio
    if (speed !== 1) {
      aFilters.push(buildAtempoChain(speed));
    }

    // Volume adjustment
    if (originalVolume !== 100) {
      aFilters.push(`volume=${(originalVolume / 100).toFixed(2)}`);
    }

    // Voice effect
    const voiceFilter = VOICE_EFFECT_MAP[params.voiceEffect || 'none'];
    if (voiceFilter) {
      aFilters.push(voiceFilter);
    }

    // Noise reduction (highpass + lowpass to remove hum/hiss)
    if (params.noiseReduce) {
      aFilters.push('highpass=f=80,lowpass=f=12000,afftdn=nf=-20');
    }

    if (aFilters.length > 0) {
      parts.push(`-af "${aFilters.join(',')}"`);
    }
  }

  // ── Encoding settings ───────────────────────────────────

  parts.push(`-c:v libx264 -preset ${qualityCfg.preset} -crf ${qualityCfg.crf}`);
  parts.push(`-c:a aac -b:a ${qualityCfg.audioBitrate}`);
  parts.push('-movflags +faststart');  // Web-optimized MP4
  parts.push(`-y "${outputPath}"`);

  return parts.join(' ');
}

// ── Export executor ────────────────────────────────────────────────

export async function executeExport(
  params: EditParams,
  onProgress?: ProgressCallback,
): Promise<ExportResult> {
  const kit = await getFFmpegKit();

  if (!kit) {
    return { success: false, error: 'FFmpeg not available — native module not linked' };
  }

  // Validate reverse duration
  const clipDuration = params.endTime - params.startTime;
  if (params.isReversed && clipDuration > MAX_REVERSE_DURATION) {
    return { success: false, error: `Reverse is limited to ${MAX_REVERSE_DURATION / 60} minutes. Trim the clip first.` };
  }

  // Generate output path in cache directory
  const timestamp = Date.now();
  const outputPath = `${FileSystem.cacheDirectory}video_export_${timestamp}.mp4`;

  const command = buildCommand(params, outputPath);

  if (__DEV__) {
    console.log('[FFmpegEngine] Command:', command);
  }

  // Progress estimation — account for reverse (which processes slower)
  const trimDuration = params.endTime - params.startTime;
  const speedFactor = params.speed || 1;
  const reverseFactor = params.isReversed ? 2 : 1; // reverse is ~2x slower
  const exportDurationMs = (trimDuration / speedFactor) * reverseFactor * 1000;

  return new Promise<ExportResult>((resolve) => {
    // Capture session ID synchronously via the returned promise
    const sessionPromise = kit.FFmpegKit.executeAsync(
      command,
      // Complete callback
      async (session) => {
        activeSessionId = null;
        const returnCode = await session.getReturnCode();
        if (returnCode.isValueSuccess()) {
          resolve({ success: true, outputUri: outputPath });
        } else if (returnCode.isValueCancel()) {
          // Clean up partial file
          try { await FileSystem.deleteAsync(outputPath, { idempotent: true }); } catch {}
          resolve({ success: false, cancelled: true });
        } else {
          const logs = await session.getLogsAsString();
          if (__DEV__) console.error('[FFmpegEngine] Export failed:', logs);
          resolve({ success: false, error: `FFmpeg error (code ${returnCode})` });
        }
      },
      // Log callback
      undefined,
      // Statistics callback (progress)
      (statistics) => {
        if (onProgress && exportDurationMs > 0) {
          const timeMs = statistics.getTime();
          const percent = Math.min(99, Math.round((timeMs / exportDurationMs) * 100));
          onProgress(percent);
        }
      },
    );

    // Set activeSessionId BEFORE the complete callback can fire
    // by awaiting the session promise immediately
    sessionPromise.then((session) => {
      // Only set if not already completed (race guard)
      if (activeSessionId === null) {
        activeSessionId = session.getSessionId();
      }
    });
  });
}

// ── Cancel ─────────────────────────────────────────────────────────

export async function cancelExport(): Promise<void> {
  const kit = await getFFmpegKit();
  if (kit && activeSessionId !== null) {
    await kit.FFmpegKit.cancel(activeSessionId);
    activeSessionId = null;
  }
}

// ── Probe (get video info) ─────────────────────────────────────────

export interface VideoInfo {
  duration: number;      // seconds
  width: number;
  height: number;
  bitrate?: number;
  codec?: string;
}

export async function getVideoInfo(uri: string): Promise<VideoInfo | null> {
  const kit = await getFFmpegKit();
  if (!kit) return null;

  try {
    const session = await kit.FFprobeKit.getMediaInformation(uri);
    const info = session.getMediaInformation();
    if (!info) return null;

    const duration = parseFloat(info.getDuration() || '0');
    const streams = info.getStreams() || [];
    const videoStream = streams.find((s: { getType: () => string }) => s.getType() === 'video');

    return {
      duration,
      width: videoStream ? parseInt(videoStream.getWidth() || '0', 10) : 0,
      height: videoStream ? parseInt(videoStream.getHeight() || '0', 10) : 0,
      bitrate: info.getBitrate() ? parseInt(info.getBitrate(), 10) : undefined,
      codec: videoStream?.getCodec() || undefined,
    };
  } catch {
    return null;
  }
}
