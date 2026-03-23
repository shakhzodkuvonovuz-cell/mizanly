/**
 * Tests for the FFmpeg command builder logic.
 *
 * Since ffmpegEngine.ts is a mobile service (React Native), we test the
 * command building logic by extracting the same algorithm here. This tests:
 * - Filter graph composition
 * - Quality preset mapping
 * - Audio filter chaining
 * - Trim + speed + volume combinations
 * - Edge cases (no edits, extreme speeds, empty captions)
 */

// ── Replicate the command building logic for testing ──────────────

type FilterName = 'original' | 'warm' | 'cool' | 'bw' | 'vintage' | 'vivid' | 'dramatic' | 'fade' | 'emerald' | 'golden' | 'night' | 'soft' | 'cinematic';
type QualityPreset = '720p' | '1080p' | '4K';

type VoiceEffect = 'none' | 'robot' | 'echo' | 'deep' | 'chipmunk' | 'telephone';

interface EditParams {
  inputUri: string;
  startTime: number;
  endTime: number;
  totalDuration: number;
  speed: number;
  filter: FilterName;
  captionText: string;
  captionColor: string;
  captionFont: string;
  textStartTime?: number;
  textEndTime?: number;
  originalVolume: number;
  musicVolume: number;
  musicUri?: string;
  voiceoverUri?: string;
  quality: QualityPreset;
  isReversed?: boolean;
  aspectRatio?: '9:16' | '16:9' | '1:1' | '4:5';
  voiceEffect?: VoiceEffect;
  stabilize?: boolean;
  noiseReduce?: boolean;
  freezeFrameAt?: number | null;
}

const VOICE_EFFECT_MAP: Record<VoiceEffect, string> = {
  none: '',
  robot: 'asetrate=44100*0.8,aresample=44100,atempo=1.25',
  echo: 'aecho=0.8:0.88:60:0.4',
  deep: 'asetrate=44100*0.75,aresample=44100,atempo=1.333',
  chipmunk: 'asetrate=44100*1.5,aresample=44100,atempo=0.667',
  telephone: 'highpass=f=300,lowpass=f=3400',
};

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

interface QualityConfig {
  scale: string;
  crf: number;
  preset: string;
  audioBitrate: string;
}

const QUALITY_MAP: Record<QualityPreset, QualityConfig> = {
  '720p': { scale: 'scale=-2:720', crf: 28, preset: 'fast', audioBitrate: '128k' },
  '1080p': { scale: '', crf: 23, preset: 'fast', audioBitrate: '192k' },
  '4K': { scale: 'scale=-2:2160', crf: 18, preset: 'medium', audioBitrate: '256k' },
};

function buildAtempoChain(speed: number): string {
  if (speed >= 0.5 && speed <= 100) return `atempo=${speed}`;
  if (speed < 0.5 && speed > 0) {
    const chains: string[] = [];
    let remaining = speed;
    while (remaining < 0.5) { chains.push('atempo=0.5'); remaining *= 2; }
    if (Math.abs(remaining - 1.0) > 0.001) chains.push(`atempo=${remaining.toFixed(4)}`);
    return chains.join(',');
  }
  return `atempo=${speed}`;
}

function buildCommand(params: EditParams, outputPath: string): string {
  const { inputUri, startTime, endTime, totalDuration, speed, filter, captionText, captionColor, originalVolume, quality } = params;
  const qualityCfg = QUALITY_MAP[quality];
  const clipDuration = endTime - startTime;
  const parts: string[] = [];

  const needsTrim = startTime > 0.1 || endTime < totalDuration - 0.1;
  // Don't use -ss seek when reversing — reverse needs full decoded frames
  if (needsTrim && !params.isReversed) {
    parts.push(`-ss ${startTime.toFixed(3)}`);
    parts.push(`-to ${endTime.toFixed(3)}`);
  }
  parts.push(`-i "${inputUri}"`);

  if (params.musicUri) {
    parts.push(`-i "${params.musicUri}"`);
  }
  if (params.voiceoverUri) {
    parts.push(`-i "${params.voiceoverUri}"`);
  }

  const vFilters: string[] = [];

  // Reverse with trim uses trim filter instead of -ss
  if (params.isReversed && needsTrim) {
    vFilters.push(`trim=start=${startTime.toFixed(3)}:end=${endTime.toFixed(3)},setpts=PTS-STARTPTS`);
  }
  if (params.isReversed && clipDuration <= 300) {
    vFilters.push('reverse');
  }
  if (speed !== 1) {
    vFilters.push(`setpts=${(1 / speed).toFixed(4)}*PTS`);
  }
  const colorFilter = FILTER_MAP[filter];
  if (colorFilter) {
    vFilters.push(colorFilter);
  }
  if (qualityCfg.scale) {
    vFilters.push(qualityCfg.scale);
  }
  if (params.aspectRatio && params.aspectRatio !== '9:16') {
    const ratioMap: Record<string, string> = {
      '16:9': 'crop=min(iw\\,ih*16/9):min(ih\\,iw*9/16)',
      '1:1': 'crop=min(iw\\,ih):min(iw\\,ih)',
      '4:5': 'crop=min(iw\\,ih*4/5):min(ih\\,iw*5/4)',
    };
    const cropFilter = ratioMap[params.aspectRatio];
    if (cropFilter) vFilters.push(cropFilter);
  }
  if (captionText.trim()) {
    const escaped = captionText
      .replace(/\\/g, '\\\\\\\\')
      .replace(/'/g, "'\\\\\\''")
      .replace(/:/g, '\\:')
      .replace(/%/g, '%%')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]');
    const rawTxtStart = params.textStartTime ?? 0;
    const rawTxtEnd = params.textEndTime && params.textEndTime > 0 ? params.textEndTime : endTime;
    const txtStart = Math.max(0, rawTxtStart - startTime);
    const txtEnd = Math.min(clipDuration, rawTxtEnd - startTime);
    const enableExpr = `:enable='between(t,${txtStart.toFixed(2)},${txtEnd.toFixed(2)})'`;
    vFilters.push(
      `drawtext=text='${escaped}':fontsize=48:fontcolor=${captionColor}:x=(w-text_w)/2:y=h-th-80:borderw=2:bordercolor=black@0.5${enableExpr}`,
    );
  }
  if (params.stabilize) vFilters.push('deshake=rx=32:ry=32');
  if (params.freezeFrameAt !== null && params.freezeFrameAt !== undefined) {
    const freezeAt = params.freezeFrameAt - startTime;
    if (freezeAt > 0.1 && freezeAt < clipDuration - 0.1) {
      vFilters.push('tpad=stop_mode=clone:stop_duration=2');
    }
  }
  if (vFilters.length > 0) {
    parts.push(`-vf "${vFilters.join(',')}"`);
  }

  // Build original audio processing chain
  const origChain: string[] = [];
  if (params.isReversed && needsTrim) {
    origChain.push(`atrim=start=${startTime.toFixed(3)}:end=${endTime.toFixed(3)},asetpts=PTS-STARTPTS`);
  }
  if (params.isReversed && clipDuration <= 300) origChain.push('areverse');
  if (speed !== 1) origChain.push(buildAtempoChain(speed));
  if (originalVolume !== 100) origChain.push(`volume=${(originalVolume / 100).toFixed(2)}`);
  const voiceEffectF = VOICE_EFFECT_MAP[params.voiceEffect || 'none'];
  if (voiceEffectF) origChain.push(voiceEffectF);
  if (params.noiseReduce) origChain.push('highpass=f=80,lowpass=f=12000,afftdn=nf=-20');

  const hasMusic = !!params.musicUri;
  const hasVoiceover = !!params.voiceoverUri;
  if (hasMusic || hasVoiceover) {
    const musicIdx = hasMusic ? 1 : -1;
    const voiceoverIdx = hasMusic ? (hasVoiceover ? 2 : -1) : (hasVoiceover ? 1 : -1);
    const musicVol = (params.musicVolume / 100).toFixed(2);
    const origLabel = origChain.length > 0 ? `[0:a]${origChain.join(',')}[a0]` : '[0:a]anull[a0]';
    const chains = [origLabel];
    const mixInputs = ['[a0]'];
    let mixCount = 1;
    if (hasMusic) { chains.push(`[${musicIdx}:a]volume=${musicVol}[amusic]`); mixInputs.push('[amusic]'); mixCount++; }
    if (hasVoiceover) { chains.push(`[${voiceoverIdx}:a]volume=1.0[avoice]`); mixInputs.push('[avoice]'); mixCount++; }
    const mixExpr = `${mixInputs.join('')}amix=inputs=${mixCount}:duration=first[aout]`;
    parts.push(`-filter_complex "${chains.join(';')};${mixExpr}"`, '-map 0:v', '-map "[aout]"');
  } else if (origChain.length > 0) {
    parts.push(`-af "${origChain.join(',')}"`);
  }

  parts.push(`-c:v libx264 -preset ${qualityCfg.preset} -crf ${qualityCfg.crf}`);
  parts.push(`-c:a aac -b:a ${qualityCfg.audioBitrate}`);
  parts.push('-movflags +faststart');
  parts.push(`-y "${outputPath}"`);

  return parts.join(' ');
}

// ── Default params factory ─────────────────────────────────────────

function defaultParams(overrides: Partial<EditParams> = {}): EditParams {
  return {
    inputUri: '/tmp/input.mp4',
    startTime: 0,
    endTime: 30,
    totalDuration: 30,
    speed: 1,
    filter: 'original',
    captionText: '',
    captionColor: '#FFFFFF',
    captionFont: 'default',
    originalVolume: 100,
    musicVolume: 60,
    quality: '1080p',
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('FFmpeg Engine — Command Builder', () => {
  const outputPath = '/tmp/output.mp4';

  describe('basic command structure', () => {
    it('should produce a valid command with no edits', () => {
      const cmd = buildCommand(defaultParams(), outputPath);
      expect(cmd).toContain('-i "/tmp/input.mp4"');
      expect(cmd).toContain('-c:v libx264');
      expect(cmd).toContain('-c:a aac');
      expect(cmd).toContain(`-y "${outputPath}"`);
      expect(cmd).toContain('-movflags +faststart');
    });

    it('should not include -ss/-to when no trim needed', () => {
      const cmd = buildCommand(defaultParams(), outputPath);
      expect(cmd).not.toContain('-ss');
      expect(cmd).not.toContain('-to');
    });

    it('should not include -vf when no video filters', () => {
      const cmd = buildCommand(defaultParams(), outputPath);
      expect(cmd).not.toContain('-vf');
    });

    it('should not include -af when volume is 100 and speed is 1', () => {
      const cmd = buildCommand(defaultParams(), outputPath);
      expect(cmd).not.toContain('-af');
    });
  });

  describe('trim', () => {
    it('should add -ss and -to for start trim', () => {
      const cmd = buildCommand(defaultParams({ startTime: 5 }), outputPath);
      expect(cmd).toContain('-ss 5.000');
      expect(cmd).toContain('-to 30.000');
    });

    it('should add -ss and -to for end trim', () => {
      const cmd = buildCommand(defaultParams({ endTime: 20 }), outputPath);
      expect(cmd).toContain('-ss 0.000');
      expect(cmd).toContain('-to 20.000');
    });

    it('should add both for middle trim', () => {
      const cmd = buildCommand(defaultParams({ startTime: 3, endTime: 15 }), outputPath);
      expect(cmd).toContain('-ss 3.000');
      expect(cmd).toContain('-to 15.000');
    });

    it('should not trim when start is 0 and end is total duration', () => {
      const cmd = buildCommand(defaultParams({ startTime: 0, endTime: 30, totalDuration: 30 }), outputPath);
      expect(cmd).not.toContain('-ss');
    });
  });

  describe('speed', () => {
    it('should add setpts for 2x speed', () => {
      const cmd = buildCommand(defaultParams({ speed: 2 }), outputPath);
      expect(cmd).toContain('setpts=0.5000*PTS');
      expect(cmd).toContain('atempo=2');
    });

    it('should add setpts for 0.5x speed', () => {
      const cmd = buildCommand(defaultParams({ speed: 0.5 }), outputPath);
      expect(cmd).toContain('setpts=2.0000*PTS');
      expect(cmd).toContain('atempo=0.5');
    });

    it('should chain atempo for 0.25x speed', () => {
      const cmd = buildCommand(defaultParams({ speed: 0.25 }), outputPath);
      expect(cmd).toContain('setpts=4.0000*PTS');
      expect(cmd).toContain('atempo=0.5,atempo=0.5');
    });

    it('should not modify speed when set to 1', () => {
      const cmd = buildCommand(defaultParams({ speed: 1 }), outputPath);
      expect(cmd).not.toContain('setpts');
      expect(cmd).not.toContain('atempo');
    });
  });

  describe('filters', () => {
    it('should apply warm filter', () => {
      const cmd = buildCommand(defaultParams({ filter: 'warm' }), outputPath);
      expect(cmd).toContain("curves=r='0/0 0.5/0.6 1/1'");
    });

    it('should apply bw filter', () => {
      const cmd = buildCommand(defaultParams({ filter: 'bw' }), outputPath);
      expect(cmd).toContain('hue=s=0');
    });

    it('should apply vintage filter with vignette', () => {
      const cmd = buildCommand(defaultParams({ filter: 'vintage' }), outputPath);
      expect(cmd).toContain('vignette');
    });

    it('should apply dramatic filter', () => {
      const cmd = buildCommand(defaultParams({ filter: 'dramatic' }), outputPath);
      expect(cmd).toContain('contrast=1.3');
      expect(cmd).toContain('vignette=PI/4');
    });

    it('should apply no filter for original', () => {
      const cmd = buildCommand(defaultParams({ filter: 'original' }), outputPath);
      expect(cmd).not.toContain('curves');
      expect(cmd).not.toContain('hue');
    });

    it('should apply emerald filter (green tint)', () => {
      const cmd = buildCommand(defaultParams({ filter: 'emerald' }), outputPath);
      expect(cmd).toContain('curves=');
      expect(cmd).toContain("g='0/0 0.5/0.6 1/1'");
    });

    it('should apply golden filter (warm gold)', () => {
      const cmd = buildCommand(defaultParams({ filter: 'golden' }), outputPath);
      expect(cmd).toContain('curves=');
      expect(cmd).toContain('eq=brightness=0.03');
    });

    it('should apply night filter (dark blue tone)', () => {
      const cmd = buildCommand(defaultParams({ filter: 'night' }), outputPath);
      expect(cmd).toContain('brightness=-0.1');
      expect(cmd).toContain('saturation=0.7');
    });

    it('should apply soft filter with blur', () => {
      const cmd = buildCommand(defaultParams({ filter: 'soft' }), outputPath);
      expect(cmd).toContain('gblur=sigma=0.5');
      expect(cmd).toContain('brightness=0.06');
    });

    it('should apply cinematic filter with vignette', () => {
      const cmd = buildCommand(defaultParams({ filter: 'cinematic' }), outputPath);
      expect(cmd).toContain('contrast=1.15');
      expect(cmd).toContain('vignette=PI/5');
    });

    it('should chain filter with speed in single -vf', () => {
      const cmd = buildCommand(defaultParams({ speed: 2, filter: 'warm' }), outputPath);
      // Both should be in the same -vf flag, not separate
      const vfMatch = cmd.match(/-vf "([^"]+)"/);
      expect(vfMatch).toBeTruthy();
      expect(vfMatch![1]).toContain('setpts');
      expect(vfMatch![1]).toContain('curves');
    });
  });

  describe('quality presets', () => {
    it('should use crf 28 and scale for 720p', () => {
      const cmd = buildCommand(defaultParams({ quality: '720p' }), outputPath);
      expect(cmd).toContain('-crf 28');
      expect(cmd).toContain('scale=-2:720');
    });

    it('should use crf 23 and no scale for 1080p', () => {
      const cmd = buildCommand(defaultParams({ quality: '1080p' }), outputPath);
      expect(cmd).toContain('-crf 23');
      expect(cmd).not.toContain('scale=');
    });

    it('should use crf 18, medium preset, and 4K scale', () => {
      const cmd = buildCommand(defaultParams({ quality: '4K' }), outputPath);
      expect(cmd).toContain('-crf 18');
      expect(cmd).toContain('-preset medium');
      expect(cmd).toContain('scale=-2:2160');
    });

    it('should use correct audio bitrate per quality', () => {
      expect(buildCommand(defaultParams({ quality: '720p' }), outputPath)).toContain('-b:a 128k');
      expect(buildCommand(defaultParams({ quality: '1080p' }), outputPath)).toContain('-b:a 192k');
      expect(buildCommand(defaultParams({ quality: '4K' }), outputPath)).toContain('-b:a 256k');
    });
  });

  describe('volume', () => {
    it('should add volume filter when not 100%', () => {
      const cmd = buildCommand(defaultParams({ originalVolume: 50 }), outputPath);
      expect(cmd).toContain('volume=0.50');
    });

    it('should handle 0% volume (mute)', () => {
      const cmd = buildCommand(defaultParams({ originalVolume: 0 }), outputPath);
      expect(cmd).toContain('volume=0.00');
    });

    it('should chain volume with speed in single -af', () => {
      const cmd = buildCommand(defaultParams({ speed: 1.5, originalVolume: 75 }), outputPath);
      const afMatch = cmd.match(/-af "([^"]+)"/);
      expect(afMatch).toBeTruthy();
      expect(afMatch![1]).toContain('atempo=1.5');
      expect(afMatch![1]).toContain('volume=0.75');
    });
  });

  describe('text overlay', () => {
    it('should add drawtext for caption', () => {
      const cmd = buildCommand(defaultParams({ captionText: 'Bismillah' }), outputPath);
      expect(cmd).toContain("drawtext=text='Bismillah'");
      expect(cmd).toContain('fontsize=48');
    });

    it('should escape single quotes in caption', () => {
      const cmd = buildCommand(defaultParams({ captionText: "it's a test" }), outputPath);
      expect(cmd).toContain("text='it");
      expect(cmd).toContain('s a test');
    });

    it('should escape colons in caption', () => {
      const cmd = buildCommand(defaultParams({ captionText: 'Time: 12:30' }), outputPath);
      expect(cmd).toContain('Time\\: 12\\:30');
    });

    it('should escape percent signs in caption (FFmpeg time code)', () => {
      const cmd = buildCommand(defaultParams({ captionText: '100% halal' }), outputPath);
      expect(cmd).toContain('100%% halal');
    });

    it('should escape brackets in caption', () => {
      const cmd = buildCommand(defaultParams({ captionText: '[important]' }), outputPath);
      expect(cmd).toContain('\\[important\\]');
    });

    it('should use specified caption color', () => {
      const cmd = buildCommand(defaultParams({ captionText: 'test', captionColor: '#C8963E' }), outputPath);
      expect(cmd).toContain('fontcolor=#C8963E');
    });

    it('should not add drawtext for empty caption', () => {
      const cmd = buildCommand(defaultParams({ captionText: '' }), outputPath);
      expect(cmd).not.toContain('drawtext');
    });

    it('should not add drawtext for whitespace-only caption', () => {
      const cmd = buildCommand(defaultParams({ captionText: '   ' }), outputPath);
      expect(cmd).not.toContain('drawtext');
    });

    it('should add border for readability', () => {
      const cmd = buildCommand(defaultParams({ captionText: 'test' }), outputPath);
      expect(cmd).toContain('borderw=2');
      expect(cmd).toContain('bordercolor=black@0.5');
    });
  });

  describe('music mixing', () => {
    it('should add second input and filter_complex for music', () => {
      const cmd = buildCommand(defaultParams({ musicUri: '/tmp/music.mp3' }), outputPath);
      expect(cmd).toContain('-i "/tmp/music.mp3"');
      expect(cmd).toContain('-filter_complex');
      expect(cmd).toContain('amix=inputs=2');
      expect(cmd).toContain('-map 0:v');
      expect(cmd).toContain('-map "[aout]"');
    });

    it('should apply music volume in filter_complex', () => {
      const cmd = buildCommand(defaultParams({ musicUri: '/tmp/music.mp3', musicVolume: 30 }), outputPath);
      expect(cmd).toContain('volume=0.30');
    });

    it('should apply original volume in filter_complex', () => {
      const cmd = buildCommand(defaultParams({ musicUri: '/tmp/music.mp3', originalVolume: 80 }), outputPath);
      expect(cmd).toContain('volume=0.80');
    });

    it('should not use -af when music is present (uses filter_complex instead)', () => {
      const cmd = buildCommand(defaultParams({ musicUri: '/tmp/music.mp3', speed: 2 }), outputPath);
      expect(cmd).not.toContain('-af');
      expect(cmd).toContain('-filter_complex');
    });
  });

  describe('voiceover mixing', () => {
    it('should add voiceover input and mix via filter_complex', () => {
      const cmd = buildCommand(defaultParams({ voiceoverUri: '/tmp/voice.m4a' }), outputPath);
      expect(cmd).toContain('-i "/tmp/voice.m4a"');
      expect(cmd).toContain('-filter_complex');
      expect(cmd).toContain('avoice');
      expect(cmd).toContain('amix');
    });

    it('should mix all 3 sources: original + music + voiceover', () => {
      const cmd = buildCommand(defaultParams({ musicUri: '/tmp/music.mp3', voiceoverUri: '/tmp/voice.m4a' }), outputPath);
      expect(cmd).toContain('amix=inputs=3');
      expect(cmd).toContain('amusic');
      expect(cmd).toContain('avoice');
    });

    it('should not use -af when voiceover is present', () => {
      const cmd = buildCommand(defaultParams({ voiceoverUri: '/tmp/voice.m4a', originalVolume: 50 }), outputPath);
      expect(cmd).not.toContain('-af');
      expect(cmd).toContain('-filter_complex');
    });
  });

  describe('combined edits', () => {
    it('should handle all edits simultaneously', () => {
      const cmd = buildCommand(defaultParams({
        startTime: 2,
        endTime: 20,
        speed: 1.5,
        filter: 'warm',
        captionText: 'Hello World',
        captionColor: '#C8963E',
        originalVolume: 75,
        quality: '720p',
      }), outputPath);

      // Trim
      expect(cmd).toContain('-ss 2.000');
      expect(cmd).toContain('-to 20.000');
      // Video filters in single -vf
      const vf = cmd.match(/-vf "([^"]+)"/);
      expect(vf).toBeTruthy();
      expect(vf![1]).toContain('setpts'); // speed
      expect(vf![1]).toContain('curves'); // warm filter
      expect(vf![1]).toContain('scale=-2:720'); // quality
      expect(vf![1]).toContain('drawtext'); // caption
      // Audio filters in single -af
      const af = cmd.match(/-af "([^"]+)"/);
      expect(af).toBeTruthy();
      expect(af![1]).toContain('atempo=1.5'); // speed
      expect(af![1]).toContain('volume=0.75'); // volume
      // Quality
      expect(cmd).toContain('-crf 28');
      expect(cmd).toContain('-preset fast');
    });

    it('should handle no edits at all (pass-through)', () => {
      const cmd = buildCommand(defaultParams(), outputPath);
      expect(cmd).not.toContain('-vf');
      expect(cmd).not.toContain('-af');
      expect(cmd).not.toContain('-ss');
      expect(cmd).toContain('-c:v libx264');
      expect(cmd).toContain('-y');
    });
  });

  describe('reverse', () => {
    it('should add reverse filter when isReversed is true', () => {
      const cmd = buildCommand(defaultParams({ isReversed: true }), outputPath);
      expect(cmd).toContain('reverse');
      expect(cmd).toContain('areverse');
    });

    it('should not add reverse when isReversed is false', () => {
      const cmd = buildCommand(defaultParams({ isReversed: false }), outputPath);
      expect(cmd).not.toContain('reverse');
      expect(cmd).not.toContain('areverse');
    });

    it('should not add reverse by default', () => {
      const cmd = buildCommand(defaultParams(), outputPath);
      expect(cmd).not.toContain('reverse');
    });

    it('should combine reverse with speed', () => {
      const cmd = buildCommand(defaultParams({ isReversed: true, speed: 2 }), outputPath);
      const vf = cmd.match(/-vf "([^"]+)"/);
      expect(vf).toBeTruthy();
      expect(vf![1]).toContain('reverse');
      expect(vf![1]).toContain('setpts');
    });

    it('should NOT use -ss seek when reversed (uses trim filter instead)', () => {
      const cmd = buildCommand(defaultParams({ isReversed: true, startTime: 5, endTime: 20 }), outputPath);
      expect(cmd).not.toContain('-ss 5.000');
      expect(cmd).toContain('trim=start=5.000:end=20.000');
    });

    it('should add atrim for audio when reversed with trim', () => {
      const cmd = buildCommand(defaultParams({ isReversed: true, startTime: 5, endTime: 20 }), outputPath);
      expect(cmd).toContain('atrim=start=5.000:end=20.000');
    });

    it('should include areverse in filter_complex when music + reverse', () => {
      const cmd = buildCommand(defaultParams({ isReversed: true, musicUri: '/tmp/music.mp3' }), outputPath);
      expect(cmd).toContain('areverse');
      expect(cmd).toContain('-filter_complex');
    });
  });

  describe('aspect ratio', () => {
    it('should not crop for default 9:16', () => {
      const cmd = buildCommand(defaultParams({ aspectRatio: '9:16' }), outputPath);
      expect(cmd).not.toContain('crop=');
    });

    it('should crop for 16:9 with min() to prevent overflow', () => {
      const cmd = buildCommand(defaultParams({ aspectRatio: '16:9' }), outputPath);
      expect(cmd).toContain('crop=min(iw');
      expect(cmd).toContain('ih*16/9');
    });

    it('should crop for 1:1 (square)', () => {
      const cmd = buildCommand(defaultParams({ aspectRatio: '1:1' }), outputPath);
      expect(cmd).toContain('crop=min(iw');
    });

    it('should crop for 4:5 with min() to prevent overflow', () => {
      const cmd = buildCommand(defaultParams({ aspectRatio: '4:5' }), outputPath);
      expect(cmd).toContain('crop=min(iw');
      expect(cmd).toContain('ih*4/5');
    });

    it('should not crop when aspectRatio is undefined', () => {
      const cmd = buildCommand(defaultParams(), outputPath);
      expect(cmd).not.toContain('crop=');
    });
  });

  describe('text timing', () => {
    it('should add enable between() for timed text', () => {
      const cmd = buildCommand(defaultParams({ captionText: 'Hello', textStartTime: 2, textEndTime: 8 }), outputPath);
      expect(cmd).toContain("enable='between(t,2.00,8.00)'");
    });

    it('should default to full clip duration when textEndTime is 0', () => {
      const cmd = buildCommand(defaultParams({ captionText: 'Hello', textStartTime: 1, textEndTime: 0 }), outputPath);
      expect(cmd).toContain("enable='between(t,1.00,30.00)'");
    });

    it('should default textStartTime to 0', () => {
      const cmd = buildCommand(defaultParams({ captionText: 'Hello' }), outputPath);
      expect(cmd).toContain("enable='between(t,0.00,30.00)'");
    });
  });

  describe('voice effects', () => {
    it('should add robot voice effect', () => {
      const cmd = buildCommand(defaultParams({ voiceEffect: 'robot' }), outputPath);
      expect(cmd).toContain('asetrate=44100*0.8');
    });

    it('should add echo voice effect', () => {
      const cmd = buildCommand(defaultParams({ voiceEffect: 'echo' }), outputPath);
      expect(cmd).toContain('aecho=0.8:0.88:60:0.4');
    });

    it('should add deep voice effect', () => {
      const cmd = buildCommand(defaultParams({ voiceEffect: 'deep' }), outputPath);
      expect(cmd).toContain('asetrate=44100*0.75');
    });

    it('should add chipmunk voice effect', () => {
      const cmd = buildCommand(defaultParams({ voiceEffect: 'chipmunk' }), outputPath);
      expect(cmd).toContain('asetrate=44100*1.5');
    });

    it('should add telephone voice effect', () => {
      const cmd = buildCommand(defaultParams({ voiceEffect: 'telephone' }), outputPath);
      expect(cmd).toContain('highpass=f=300');
      expect(cmd).toContain('lowpass=f=3400');
    });

    it('should not add voice effect for none', () => {
      const cmd = buildCommand(defaultParams({ voiceEffect: 'none' }), outputPath);
      expect(cmd).not.toContain('asetrate');
      expect(cmd).not.toContain('aecho');
    });
  });

  describe('noise reduction', () => {
    it('should add noise reduction filters', () => {
      const cmd = buildCommand(defaultParams({ noiseReduce: true }), outputPath);
      expect(cmd).toContain('highpass=f=80');
      expect(cmd).toContain('lowpass=f=12000');
      expect(cmd).toContain('afftdn=nf=-20');
    });

    it('should not add noise reduction when false', () => {
      const cmd = buildCommand(defaultParams({ noiseReduce: false }), outputPath);
      expect(cmd).not.toContain('afftdn');
    });
  });

  describe('stabilization', () => {
    it('should add deshake filter', () => {
      const cmd = buildCommand(defaultParams({ stabilize: true }), outputPath);
      expect(cmd).toContain('deshake=rx=32:ry=32');
    });

    it('should not add deshake when false', () => {
      const cmd = buildCommand(defaultParams({ stabilize: false }), outputPath);
      expect(cmd).not.toContain('deshake');
    });
  });

  describe('freeze frame', () => {
    it('should add tpad for freeze frame', () => {
      const cmd = buildCommand(defaultParams({ freezeFrameAt: 10 }), outputPath);
      expect(cmd).toContain('tpad=stop_mode=clone');
    });

    it('should not add freeze frame when null', () => {
      const cmd = buildCommand(defaultParams({ freezeFrameAt: null }), outputPath);
      expect(cmd).not.toContain('tpad');
    });

    it('should not add freeze frame at 0 (start of clip)', () => {
      const cmd = buildCommand(defaultParams({ freezeFrameAt: 0 }), outputPath);
      expect(cmd).not.toContain('tpad');
    });
  });

  describe('output format', () => {
    it('should always include faststart for web-optimized MP4', () => {
      const cmd = buildCommand(defaultParams(), outputPath);
      expect(cmd).toContain('-movflags +faststart');
    });

    it('should always overwrite output (-y flag)', () => {
      const cmd = buildCommand(defaultParams(), outputPath);
      expect(cmd).toContain('-y');
    });

    it('should use correct output path', () => {
      const cmd = buildCommand(defaultParams(), '/custom/path/video.mp4');
      expect(cmd).toContain('-y "/custom/path/video.mp4"');
    });
  });
});

// ── Concat Command Tests ──────────────────────────────────────────

type TransitionType = 'none' | 'fade' | 'dissolve' | 'wipeleft' | 'wiperight' | 'slideup' | 'slidedown' | 'circleopen' | 'circleclose';

function buildConcatCommand(
  clips: { uri: string; duration: number }[],
  outputPath: string,
  transition: TransitionType = 'none',
  transitionDuration: number = 0.5,
): string {
  if (clips.length === 0) return '';
  if (clips.length === 1) return `-i "${clips[0].uri}" -c copy -y "${outputPath}"`;
  const inputs = clips.map(c => `-i "${c.uri}"`).join(' ');
  if (transition === 'none') {
    const filterInputs = clips.map((_, i) => `[${i}:v][${i}:a]`).join('');
    return `${inputs} -filter_complex "${filterInputs}concat=n=${clips.length}:v=1:a=1[outv][outa]" -map "[outv]" -map "[outa]" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 192k -movflags +faststart -y "${outputPath}"`;
  }
  const dur = Math.max(0.1, Math.min(transitionDuration, 2)).toFixed(2);
  let vChain = '';
  let aChain = '';
  let prevVideoLabel = '[0:v]';
  let prevAudioLabel = '[0:a]';
  let cumulativeOffset = 0;
  for (let i = 1; i < clips.length; i++) {
    const outLabel = i < clips.length - 1 ? `[v${i}]` : '[outv]';
    const aOutLabel = i < clips.length - 1 ? `[a${i}]` : '[outa]';
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

describe('FFmpeg Concat Command Builder', () => {
  const output = '/tmp/merged.mp4';

  describe('basic concat', () => {
    it('should return empty string for no clips', () => {
      expect(buildConcatCommand([], output)).toBe('');
    });

    it('should copy single clip directly', () => {
      const cmd = buildConcatCommand([{ uri: '/clip1.mp4', duration: 5 }], output);
      expect(cmd).toContain('-c copy');
      expect(cmd).not.toContain('concat');
    });

    it('should concat 2 clips without transition', () => {
      const cmd = buildConcatCommand([
        { uri: '/clip1.mp4', duration: 3 },
        { uri: '/clip2.mp4', duration: 5 },
      ], output);
      expect(cmd).toContain('concat=n=2:v=1:a=1');
      expect(cmd).toContain('-i "/clip1.mp4"');
      expect(cmd).toContain('-i "/clip2.mp4"');
    });

    it('should concat 3 clips', () => {
      const cmd = buildConcatCommand([
        { uri: '/a.mp4', duration: 3 },
        { uri: '/b.mp4', duration: 4 },
        { uri: '/c.mp4', duration: 5 },
      ], output);
      expect(cmd).toContain('concat=n=3');
    });
  });

  describe('transitions', () => {
    it('should use xfade for fade transition', () => {
      const cmd = buildConcatCommand([
        { uri: '/a.mp4', duration: 5 },
        { uri: '/b.mp4', duration: 5 },
      ], output, 'fade', 0.5);
      expect(cmd).toContain('xfade=transition=fade');
      expect(cmd).toContain('duration=0.50');
    });

    it('should calculate correct offset for 2 clips', () => {
      const cmd = buildConcatCommand([
        { uri: '/a.mp4', duration: 3 },
        { uri: '/b.mp4', duration: 5 },
      ], output, 'fade', 0.5);
      // offset = 3 - 0.5 = 2.5
      expect(cmd).toContain('offset=2.50');
    });

    it('should calculate correct offsets for 3 clips', () => {
      const cmd = buildConcatCommand([
        { uri: '/a.mp4', duration: 3 },
        { uri: '/b.mp4', duration: 4 },
        { uri: '/c.mp4', duration: 5 },
      ], output, 'dissolve', 0.5);
      // First transition: offset = 3 - 0.5 = 2.5
      // Second transition: offset = 2.5 + (4 - 0.5) = 6.0
      expect(cmd).toContain('offset=2.50');
      expect(cmd).toContain('offset=6.00');
    });

    it('should use acrossfade for audio transitions', () => {
      const cmd = buildConcatCommand([
        { uri: '/a.mp4', duration: 5 },
        { uri: '/b.mp4', duration: 5 },
      ], output, 'wipeleft', 0.5);
      expect(cmd).toContain('acrossfade');
    });

    it('should clamp transition duration to max 2 seconds', () => {
      const cmd = buildConcatCommand([
        { uri: '/a.mp4', duration: 5 },
        { uri: '/b.mp4', duration: 5 },
      ], output, 'fade', 10);
      expect(cmd).toContain('duration=2.00');
    });

    it('should support all transition types', () => {
      const types: TransitionType[] = ['fade', 'dissolve', 'wipeleft', 'wiperight', 'slideup', 'slidedown', 'circleopen', 'circleclose'];
      types.forEach(type => {
        const cmd = buildConcatCommand([
          { uri: '/a.mp4', duration: 5 },
          { uri: '/b.mp4', duration: 5 },
        ], output, type, 0.5);
        expect(cmd).toContain(`transition=${type}`);
      });
    });
  });
});
