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
export type TransitionType = 'none' | 'fade' | 'dissolve' | 'wipeleft' | 'wiperight' | 'slideup' | 'slidedown' | 'circleopen' | 'circleclose';

/**
 * Build FFmpeg concat command with optional transitions for multi-clip merge.
 *
 * @param clips — array of { uri, duration } for each clip
 * @param outputPath — output file path
 * @param transition — xfade transition type or 'none' for simple concat
 * @param transitionDuration — seconds of overlap between clips (0.3-1.0 recommended)
 */
export function buildConcatCommand(
  clips: { uri: string; duration: number }[],
  outputPath: string,
  transition: TransitionType = 'none',
  transitionDuration: number = 0.5,
): string {
  if (clips.length === 0) return '';
  if (clips.length === 1) return `-i "${clips[0].uri}" -c copy -y "${outputPath}"`;

  const inputs = clips.map(c => `-i "${c.uri}"`).join(' ');

  if (transition === 'none') {
    // Simple concat without transitions
    const filterInputs = clips.map((_, i) => `[${i}:v][${i}:a]`).join('');
    return `${inputs} -filter_complex "${filterInputs}concat=n=${clips.length}:v=1:a=1[outv][outa]" -map "[outv]" -map "[outa]" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 192k -movflags +faststart -y "${outputPath}"`;
  }

  // Transitions using xfade between consecutive clips
  // offset = cumulative duration of all previous clips minus transition overlap
  // Example: clip0(3s) + clip1(5s) with 0.5s fade → offset = 3 - 0.5 = 2.5
  const dur = Math.max(0.1, Math.min(transitionDuration, 2)).toFixed(2);
  let vChain = '';
  let aChain = '';
  let prevVideoLabel = '[0:v]';
  let prevAudioLabel = '[0:a]';
  let cumulativeOffset = 0;

  for (let i = 1; i < clips.length; i++) {
    const outLabel = i < clips.length - 1 ? `[v${i}]` : '[outv]';
    const aOutLabel = i < clips.length - 1 ? `[a${i}]` : '[outa]';

    // offset = end of previous clip minus transition duration
    cumulativeOffset += clips[i - 1].duration - transitionDuration;
    const offset = Math.max(0, cumulativeOffset).toFixed(2);

    vChain += `${prevVideoLabel}[${i}:v]xfade=transition=${transition}:duration=${dur}:offset=${offset}${outLabel};`;
    aChain += `${prevAudioLabel}[${i}:a]acrossfade=d=${dur}${aOutLabel};`;
    prevVideoLabel = outLabel;
    prevAudioLabel = aOutLabel;
  }

  const filterComplex = (vChain + aChain).replace(/;$/, '');
  return `${inputs} -filter_complex "${filterComplex}" -map "[outv]" -map "[outa]" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 192k -movflags +faststart -y "${outputPath}"`;
}

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
  voiceoverUri?: string;   // optional voiceover recording to mix in
  quality: QualityPreset;
  speedCurve?: 'montage' | 'hero' | 'bullet' | 'flashIn' | 'flashOut'; // variable speed curve preset
  isReversed?: boolean;    // reverse playback
  aspectRatio?: AspectRatio; // output aspect ratio
  voiceEffect?: VoiceEffect; // audio voice effect
  stabilize?: boolean;     // video stabilization (vidstab)
  noiseReduce?: boolean;   // audio noise reduction
  freezeFrameAt?: number | null; // seconds to freeze, null = none
  brightness?: number;           // -100 to +100, 0 = neutral
  contrast?: number;             // -100 to +100, 0 = neutral
  saturation?: number;           // -100 to +100, 0 = neutral
  temperature?: number;          // -100 to +100, 0 = neutral
  fadeIn?: number;               // seconds, 0 = no fade
  fadeOut?: number;               // seconds, 0 = no fade
  rotation?: 0 | 90 | 180 | 270; // clockwise rotation
  sharpen?: boolean;              // sharpen filter
  vignette?: boolean;             // standalone vignette effect
  grain?: boolean;                // film grain effect
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
  // atempo supports 0.5–100. For values below 0.5, chain multiple atempo=0.5
  // then apply the remainder. E.g., 0.3x = atempo=0.5,atempo=0.6 (0.5*0.6=0.3)
  if (speed >= 0.5 && speed <= 100) {
    return `atempo=${speed}`;
  }
  if (speed < 0.5 && speed > 0) {
    const chains: string[] = [];
    let remaining = speed;
    while (remaining < 0.5) {
      chains.push('atempo=0.5');
      remaining *= 2; // 0.3 → 0.6, 0.25 → 0.5, 0.125 → 0.25 → 0.5
    }
    // remaining is now >= 0.5, apply it if not exactly 1.0
    if (Math.abs(remaining - 1.0) > 0.001) {
      chains.push(`atempo=${remaining.toFixed(4)}`);
    }
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

  // Voiceover input (if any)
  if (params.voiceoverUri) {
    parts.push(`-i "${params.voiceoverUri}"`);
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

  // Speed adjustment — constant or variable (speed curve)
  if (params.speedCurve) {
    // Speed curves use variable PTS expression based on time T
    // We substitute actual clip duration (D) since FFmpeg setpts doesn't have DURATION
    const D = clipDuration.toFixed(2);
    const curvePtsMap: Record<string, string> = {
      // Montage: fast-slow-fast (2x speed at edges, 0.5x in middle)
      montage: `setpts='if(lt(T,0.3*${D}),0.5*PTS,if(gt(T,0.7*${D}),0.5*PTS,2.0*PTS))'`,
      // Hero: normal bookends, 2.5x slow in middle section
      hero: `setpts='if(lt(T,0.2*${D}),PTS,if(gt(T,0.8*${D}),PTS,2.5*PTS))'`,
      // Bullet: extreme slow-mo in the middle 40-60% of clip
      bullet: `setpts='if(between(T,0.4*${D},0.6*${D}),3.0*PTS,0.8*PTS)'`,
      // Flash In: starts 3.3x speed, decelerates to normal by end
      flashIn: `setpts='(0.3+0.7*T/${D})*PTS'`,
      // Flash Out: normal speed, accelerates to 3.3x by end
      flashOut: `setpts='(1.0-0.7*T/${D})*PTS'`,
    };
    const curveExpr = curvePtsMap[params.speedCurve];
    if (curveExpr) vFilters.push(curveExpr);
  } else if (speed !== 1) {
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
    // Convert from absolute video time to relative-to-trimmed-clip time
    const rawTxtStart = params.textStartTime ?? 0;
    const rawTxtEnd = params.textEndTime && params.textEndTime > 0 ? params.textEndTime : endTime;
    const txtStart = Math.max(0, rawTxtStart - startTime);
    const txtEnd = Math.min(clipDuration, rawTxtEnd - startTime);
    const enableExpr = `:enable='between(t,${txtStart.toFixed(2)},${txtEnd.toFixed(2)})'`;
    vFilters.push(
      `drawtext=text='${escaped}':fontsize=48:fontcolor=${captionColor}:x=(w-text_w)/2:y=h-th-80:borderw=2:bordercolor=black@0.5${enableExpr}`
    );
  }

  // Color grading adjustments (eq filter)
  const eqParts: string[] = [];
  if (params.brightness && params.brightness !== 0) {
    // FFmpeg eq brightness: -1.0 to 1.0 (we map -100..+100 to -0.3..+0.3)
    eqParts.push(`brightness=${(params.brightness / 333).toFixed(3)}`);
  }
  if (params.contrast && params.contrast !== 0) {
    // FFmpeg eq contrast: 0.0 to 2.0 (default 1.0; we map -100..+100 to 0.5..1.5)
    eqParts.push(`contrast=${(1 + params.contrast / 200).toFixed(3)}`);
  }
  if (params.saturation && params.saturation !== 0) {
    // FFmpeg eq saturation: 0.0 to 3.0 (default 1.0; we map -100..+100 to 0.0..2.0)
    eqParts.push(`saturation=${Math.max(0, 1 + params.saturation / 100).toFixed(3)}`);
  }
  if (eqParts.length > 0) {
    vFilters.push(`eq=${eqParts.join(':')}`);
  }

  // Temperature (warm/cool shift via colorbalance)
  if (params.temperature && params.temperature !== 0) {
    const shift = (params.temperature / 200).toFixed(3); // -0.5 to +0.5
    const negShift = (-params.temperature / 200).toFixed(3);
    vFilters.push(`colorbalance=rs=${shift}:gs=0:bs=${negShift}:rm=${shift}:gm=0:bm=${negShift}`);
  }

  // Video stabilization
  if (params.stabilize) {
    vFilters.push('deshake=rx=32:ry=32');
  }

  // Video fade in/out
  if (params.fadeIn && params.fadeIn > 0) {
    vFilters.push(`fade=t=in:st=0:d=${params.fadeIn.toFixed(2)}`);
  }
  if (params.fadeOut && params.fadeOut > 0) {
    const fadeStart = Math.max(0, clipDuration - params.fadeOut);
    vFilters.push(`fade=t=out:st=${fadeStart.toFixed(2)}:d=${params.fadeOut.toFixed(2)}`);
  }

  // Rotation (clockwise: 90, 180, 270)
  if (params.rotation && params.rotation !== 0) {
    const rotMap: Record<number, string> = {
      90: 'transpose=1',    // 90° clockwise
      180: 'transpose=1,transpose=1', // 180°
      270: 'transpose=2',   // 90° counter-clockwise (270° clockwise)
    };
    const rotFilter = rotMap[params.rotation];
    if (rotFilter) vFilters.push(rotFilter);
  }

  // Sharpen (unsharp mask)
  if (params.sharpen) {
    vFilters.push('unsharp=5:5:1.0:5:5:0.0');
  }

  // Standalone vignette (separate from filter presets)
  if (params.vignette) {
    vFilters.push('vignette=PI/4');
  }

  // Film grain effect
  if (params.grain) {
    vFilters.push('noise=alls=20:allf=t');
  }

  // Freeze frame — hold the last frame for 2 seconds (fps-independent)
  // Uses tpad=stop_mode=clone which clones the final frame for stop_duration seconds.
  // This effectively adds a 2-second freeze at the end of the clip.
  // A mid-clip freeze would require splitting the video (complex filter graph) — deferred to v2.
  if (params.freezeFrameAt !== null && params.freezeFrameAt !== undefined) {
    const freezeAt = params.freezeFrameAt - startTime; // relative to trimmed clip
    if (freezeAt > 0.1 && freezeAt < clipDuration - 0.1) {
      vFilters.push('tpad=stop_mode=clone:stop_duration=2');
    }
  }

  if (vFilters.length > 0) {
    parts.push(`-vf "${vFilters.join(',')}"`);
  }

  // ── Audio filter chain ──────────────────────────────────
  // Build original audio processing chain (shared across all paths)
  const origChain: string[] = [];
  if (params.isReversed && needsTrim) {
    origChain.push(`atrim=start=${startTime.toFixed(3)}:end=${endTime.toFixed(3)},asetpts=PTS-STARTPTS`);
  }
  if (params.isReversed && clipDuration <= MAX_REVERSE_DURATION) {
    origChain.push('areverse');
  }
  if (speed !== 1) {
    origChain.push(buildAtempoChain(speed));
  }
  if (originalVolume !== 100) {
    origChain.push(`volume=${(originalVolume / 100).toFixed(2)}`);
  }
  const voiceEffectFilter = VOICE_EFFECT_MAP[params.voiceEffect || 'none'];
  if (voiceEffectFilter) origChain.push(voiceEffectFilter);
  if (params.noiseReduce) origChain.push('highpass=f=80,lowpass=f=12000,afftdn=nf=-20');
  if (params.fadeIn && params.fadeIn > 0) origChain.push(`afade=t=in:st=0:d=${params.fadeIn.toFixed(2)}`);
  if (params.fadeOut && params.fadeOut > 0) {
    const aFadeStart = Math.max(0, clipDuration - params.fadeOut);
    origChain.push(`afade=t=out:st=${aFadeStart.toFixed(2)}:d=${params.fadeOut.toFixed(2)}`);
  }

  const hasMusic = !!params.musicUri;
  const hasVoiceover = !!params.voiceoverUri;
  const needsComplexAudio = hasMusic || hasVoiceover;

  if (needsComplexAudio) {
    // Complex filter_complex: mix original + optional music + optional voiceover
    // Input indices: 0=video, 1=music (if present), next=voiceover (if present)
    const musicIdx = hasMusic ? 1 : -1;
    const voiceoverIdx = hasMusic ? (hasVoiceover ? 2 : -1) : (hasVoiceover ? 1 : -1);
    const musicVol = (params.musicVolume / 100).toFixed(2);

    const origLabel = origChain.length > 0 ? `[0:a]${origChain.join(',')}[a0]` : '[0:a]anull[a0]';
    const chains = [origLabel];
    const mixInputs = ['[a0]'];
    let mixCount = 1;

    if (hasMusic) {
      chains.push(`[${musicIdx}:a]volume=${musicVol}[amusic]`);
      mixInputs.push('[amusic]');
      mixCount++;
    }
    if (hasVoiceover) {
      chains.push(`[${voiceoverIdx}:a]volume=1.0[avoice]`);
      mixInputs.push('[avoice]');
      mixCount++;
    }

    const mixExpr = `${mixInputs.join('')}amix=inputs=${mixCount}:duration=first[aout]`;
    parts.push(
      `-filter_complex "${chains.join(';')};${mixExpr}"`,
      '-map 0:v',
      '-map "[aout]"'
    );
  } else if (origChain.length > 0) {
    // Simple -af chain (no mixing needed)
    parts.push(`-af "${origChain.join(',')}"`);
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

  // Generate output path in cache directory (ensure trailing slash)
  const timestamp = Date.now();
  const cacheDir = (FileSystem.cacheDirectory || '').replace(/\/?$/, '/');
  const outputPath = `${cacheDir}video_export_${timestamp}.mp4`;

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
