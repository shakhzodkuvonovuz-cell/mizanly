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
  originalVolume: number;
  musicVolume: number;
  musicUri?: string;
  quality: QualityPreset;
  isReversed?: boolean;
  aspectRatio?: '9:16' | '16:9' | '1:1' | '4:5';
}

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

function buildCommand(params: EditParams, outputPath: string): string {
  const { inputUri, startTime, endTime, totalDuration, speed, filter, captionText, captionColor, originalVolume, quality } = params;
  const qualityCfg = QUALITY_MAP[quality];
  const parts: string[] = [];

  const needsTrim = startTime > 0.1 || endTime < totalDuration - 0.1;
  if (needsTrim) {
    parts.push(`-ss ${startTime.toFixed(3)}`);
    parts.push(`-to ${endTime.toFixed(3)}`);
  }
  parts.push(`-i "${inputUri}"`);

  if (params.musicUri) {
    parts.push(`-i "${params.musicUri}"`);
  }

  const vFilters: string[] = [];
  if (params.isReversed) {
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
      '16:9': 'crop=ih*16/9:ih',
      '1:1': 'crop=min(iw\\,ih):min(iw\\,ih)',
      '4:5': 'crop=ih*4/5:ih',
    };
    const cropFilter = ratioMap[params.aspectRatio];
    if (cropFilter) vFilters.push(cropFilter);
  }
  if (captionText.trim()) {
    const escaped = captionText.replace(/'/g, "'\\''").replace(/:/g, '\\:');
    vFilters.push(
      `drawtext=text='${escaped}':fontsize=48:fontcolor=${captionColor}:x=(w-text_w)/2:y=h-th-80:borderw=2:bordercolor=black@0.5`,
    );
  }
  if (vFilters.length > 0) {
    parts.push(`-vf "${vFilters.join(',')}"`);
  }

  const aFilters: string[] = [];
  if (params.isReversed) {
    aFilters.push('areverse');
  }
  if (speed !== 1) {
    if (speed >= 0.5 && speed <= 100) {
      aFilters.push(`atempo=${speed}`);
    } else if (speed < 0.5) {
      aFilters.push('atempo=0.5', 'atempo=0.5');
    }
  }
  if (originalVolume !== 100) {
    aFilters.push(`volume=${(originalVolume / 100).toFixed(2)}`);
  }

  if (params.musicUri) {
    const musicVol = (params.musicVolume / 100).toFixed(2);
    const origVol = (originalVolume / 100).toFixed(2);
    const speedFilters = speed !== 1 ? `,atempo=${speed}` : '';
    parts.push(
      `-filter_complex "[0:a]volume=${origVol}${speedFilters}[a0];[1:a]volume=${musicVol}[a1];[a0][a1]amix=inputs=2:duration=first[aout]"`,
      '-map 0:v',
      '-map "[aout]"',
    );
  } else if (aFilters.length > 0) {
    parts.push(`-af "${aFilters.join(',')}"`);
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
      expect(cmd).toContain("text='it'\\''s a test'");
    });

    it('should escape colons in caption', () => {
      const cmd = buildCommand(defaultParams({ captionText: 'Time: 12:30' }), outputPath);
      expect(cmd).toContain('Time\\: 12\\:30');
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
  });

  describe('aspect ratio', () => {
    it('should not crop for default 9:16', () => {
      const cmd = buildCommand(defaultParams({ aspectRatio: '9:16' }), outputPath);
      expect(cmd).not.toContain('crop=');
    });

    it('should crop for 16:9', () => {
      const cmd = buildCommand(defaultParams({ aspectRatio: '16:9' }), outputPath);
      expect(cmd).toContain('crop=ih*16/9:ih');
    });

    it('should crop for 1:1 (square)', () => {
      const cmd = buildCommand(defaultParams({ aspectRatio: '1:1' }), outputPath);
      expect(cmd).toContain('crop=min(iw');
    });

    it('should crop for 4:5', () => {
      const cmd = buildCommand(defaultParams({ aspectRatio: '4:5' }), outputPath);
      expect(cmd).toContain('crop=ih*4/5:ih');
    });

    it('should not crop when aspectRatio is undefined', () => {
      const cmd = buildCommand(defaultParams(), outputPath);
      expect(cmd).not.toContain('crop=');
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
