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
 */

import * as FileSystem from 'expo-file-system';

// ── Types ──────────────────────────────────────────────────────────

export type FilterName = 'original' | 'warm' | 'cool' | 'bw' | 'vintage' | 'vivid' | 'dramatic' | 'fade' | 'emerald' | 'golden' | 'night' | 'soft' | 'cinematic';
export type QualityPreset = '720p' | '1080p' | '4K';

export type AspectRatio = '9:16' | '16:9' | '1:1' | '4:5';

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
  originalVolume: number;  // 0–100
  musicVolume: number;     // 0–100
  musicUri?: string;       // optional background music
  quality: QualityPreset;
  isReversed?: boolean;    // reverse playback
  aspectRatio?: AspectRatio; // output aspect ratio
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
let _ffmpegChecked = false;

async function getFFmpegKit(): Promise<typeof import('ffmpeg-kit-react-native') | null> {
  if (_ffmpegChecked) return _ffmpegKit;
  _ffmpegChecked = true;
  try {
    _ffmpegKit = await import('ffmpeg-kit-react-native');
    return _ffmpegKit;
  } catch {
    if (__DEV__) console.warn('[FFmpegEngine] ffmpeg-kit-react-native not available');
    return null;
  }
}

export async function isFFmpegAvailable(): Promise<boolean> {
  const kit = await getFFmpegKit();
  return kit !== null;
}

// ── Command builder ────────────────────────────────────────────────

export function buildCommand(params: EditParams, outputPath: string): string {
  const { inputUri, startTime, endTime, totalDuration, speed, filter, captionText, captionColor, originalVolume, quality } = params;
  const qualityCfg = QUALITY_MAP[quality];

  const parts: string[] = [];

  // Input with seek (use -ss before -i for fast seek)
  const needsTrim = startTime > 0.1 || endTime < totalDuration - 0.1;
  if (needsTrim) {
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

  // Reverse (must come before speed to get correct visual result)
  if (params.isReversed) {
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
  if (params.aspectRatio && params.aspectRatio !== '9:16') {
    const ratioMap: Record<string, string> = {
      '16:9': 'crop=ih*16/9:ih',
      '1:1': 'crop=min(iw\\,ih):min(iw\\,ih)',
      '4:5': 'crop=ih*4/5:ih',
    };
    const cropFilter = ratioMap[params.aspectRatio];
    if (cropFilter) vFilters.push(cropFilter);
  }

  // Text overlay
  if (captionText.trim()) {
    const escaped = captionText.replace(/'/g, "'\\''").replace(/:/g, '\\:');
    vFilters.push(
      `drawtext=text='${escaped}':fontsize=48:fontcolor=${captionColor}:x=(w-text_w)/2:y=h-th-80:borderw=2:bordercolor=black@0.5`
    );
  }

  if (vFilters.length > 0) {
    parts.push(`-vf "${vFilters.join(',')}"`);
  }

  // ── Audio filter chain ──────────────────────────────────

  const aFilters: string[] = [];

  // Reverse audio
  if (params.isReversed) {
    aFilters.push('areverse');
  }

  // Speed adjustment for audio
  if (speed !== 1) {
    // atempo only supports 0.5–100, chain multiple for extreme values
    if (speed >= 0.5 && speed <= 100) {
      aFilters.push(`atempo=${speed}`);
    } else if (speed < 0.5) {
      // Chain: 0.25x = atempo=0.5,atempo=0.5
      aFilters.push('atempo=0.5', 'atempo=0.5');
    }
  }

  // Volume adjustment
  if (originalVolume !== 100) {
    aFilters.push(`volume=${(originalVolume / 100).toFixed(2)}`);
  }

  if (params.musicUri) {
    // Complex audio filter for mixing original + music
    const musicVol = (params.musicVolume / 100).toFixed(2);
    const origVol = (originalVolume / 100).toFixed(2);
    const speedFilters = speed !== 1 ? `,atempo=${speed}` : '';
    parts.push(
      `-filter_complex "[0:a]volume=${origVol}${speedFilters}[a0];[1:a]volume=${musicVol}[a1];[a0][a1]amix=inputs=2:duration=first[aout]"`,
      '-map 0:v',
      '-map "[aout]"'
    );
  } else if (aFilters.length > 0) {
    parts.push(`-af "${aFilters.join(',')}"`);
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

  // Generate output path in cache directory
  const timestamp = Date.now();
  const outputPath = `${FileSystem.cacheDirectory}video_export_${timestamp}.mp4`;

  const command = buildCommand(params, outputPath);

  if (__DEV__) {
    console.log('[FFmpegEngine] Command:', command);
  }

  const trimDuration = params.endTime - params.startTime;
  const exportDurationMs = (trimDuration / params.speed) * 1000;

  return new Promise<ExportResult>((resolve) => {
    kit.FFmpegKit.executeAsync(
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
    ).then((session) => {
      activeSessionId = session.getSessionId();
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
