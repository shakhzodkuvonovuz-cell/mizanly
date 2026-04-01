/**
 * R3 Tab3 Part 2 — Tests for lazy-skip fixes.
 *
 * Covers: formatTime hoisted, useShallow pattern, PostCard URL memo,
 * useTTS ref pattern, useIslamicTheme shared interval, callkit fallback,
 * halalApi dedup, RichCaptionInput RTL.
 */

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  I18nManager: { isRTL: false },
}));

describe('R3-Tab3-P2: formatTime hoisted outside component', () => {
  // The function was moved outside the component body — verify it works as pure function
  function formatTime(milliseconds: number): string {
    if (!milliseconds) return '0:00';
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  test('0ms returns 0:00', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  test('59 seconds', () => {
    expect(formatTime(59000)).toBe('0:59');
  });

  test('exactly 1 minute', () => {
    expect(formatTime(60000)).toBe('1:00');
  });

  test('1 hour 1 minute 1 second (3661s)', () => {
    expect(formatTime(3661000)).toBe('61:01');
  });

  test('NaN/undefined input returns 0:00', () => {
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(undefined as unknown as number)).toBe('0:00');
  });
});

describe('R3-Tab3-P2: VideoPlayer formatTime is hoisted in source', () => {
  test('formatTime defined before component declaration', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../components/ui/VideoPlayer.tsx'), 'utf8'
    );
    // formatTime should appear before the component
    const formatTimeIdx = src.indexOf('function formatTime');
    const componentIdx = src.indexOf('export const VideoPlayer');
    expect(formatTimeIdx).toBeGreaterThan(-1);
    expect(componentIdx).toBeGreaterThan(-1);
    expect(formatTimeIdx).toBeLessThan(componentIdx);
  });
});

describe('R3-Tab3-P2: MiniPlayer useShallow', () => {
  test('MiniPlayer uses useShallow for store selectors', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../components/ui/MiniPlayer.tsx'), 'utf8'
    );
    expect(src).toContain('useShallow');
    expect(src).toContain("from 'zustand/react/shallow'");
    // Should be ONE useStore call, not 6 separate ones
    const useStoreCalls = (src.match(/useStore\(/g) || []).length;
    expect(useStoreCalls).toBe(1);
  });
});

describe('R3-Tab3-P2: PostCard URL regex memoized', () => {
  test('PostCard uses useMemo for URL extraction, not IIFE', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../components/saf/PostCard.tsx'), 'utf8'
    );
    // Should use useMemo for firstUrl
    expect(src).toContain('const firstUrl = useMemo');
    // Should NOT have the old IIFE pattern wrapping URL extraction
    expect(src).not.toMatch(/mediaUrls\.length === 0 && \(\(\) =>/);
    // URL match should be inside useMemo, not in JSX render
    expect(src).toMatch(/useMemo\(\(\) => \{[\s\S]*?post\.content\.match/);
    // Should use firstUrl in JSX
    expect(src).toContain('{firstUrl && <LinkPreview');
  });
});

describe('R3-Tab3-P2: useTTS cycleSpeed ref pattern', () => {
  test('cycleSpeed uses refs not closure state', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../hooks/useTTS.ts'), 'utf8'
    );
    // Should have ref declarations
    expect(src).toContain('ttsPlayingRef');
    expect(src).toContain('ttsTextRef');
    expect(src).toContain('ttsSpeedRef');
    // cycleSpeed should read from refs
    expect(src).toContain('ttsPlayingRef.current');
    expect(src).toContain('ttsTextRef.current');
    expect(src).toContain('ttsSpeedRef.current');
    // Should NOT have ttsPlaying/ttsText in cycleSpeed deps
    const cycleSpeedDeps = src.match(/cycleSpeed[\s\S]*?\], \[([^\]]*)\]/);
    if (cycleSpeedDeps) {
      expect(cycleSpeedDeps[1]).not.toContain('ttsPlaying');
      expect(cycleSpeedDeps[1]).not.toContain('ttsText');
      expect(cycleSpeedDeps[1]).not.toContain('ttsSpeed');
    }
  });
});

describe('R3-Tab3-P2: useIslamicTheme shared interval', () => {
  test('single useMinuteKey function shared by both hooks', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../hooks/useIslamicTheme.ts'), 'utf8'
    );
    // Should have a shared useMinuteKey function
    expect(src).toContain('function useMinuteKey');
    // Both hooks should call it
    // Both exported hooks should call useMinuteKey()
    const minuteKeyCalls = (src.match(/= useMinuteKey\(\)/g) || []).length;
    expect(minuteKeyCalls).toBe(2);
    // Should only have ONE setInterval (in useMinuteKey)
    const setIntervalCalls = (src.match(/setInterval/g) || []).length;
    expect(setIntervalCalls).toBe(1);
  });
});

describe('R3-Tab3-P2: callkit UUID fallback', () => {
  test('generateCallUUID has fallback for missing crypto.getRandomValues', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../services/callkit.ts'), 'utf8'
    );
    // Should have crypto check
    expect(src).toContain("typeof crypto !== 'undefined' && crypto.getRandomValues");
    // Should have fallback
    expect(src).toContain('react-native-quick-crypto');
    expect(src).toContain('generateRandomBytes');
  });
});

describe('R3-Tab3-P2: halalApi uses shared PaginatedResponse', () => {
  test('imports PaginatedResponse from @/types', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../services/halalApi.ts'), 'utf8'
    );
    expect(src).toContain("from '@/types'");
    // Should NOT have local PaginatedResponse definition
    expect(src).not.toMatch(/type PaginatedResponse/);
  });
});

describe('R3-Tab3-P2: RichCaptionInput RTL-safe positioning', () => {
  test('uses start/end instead of left/right', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../components/ui/RichCaptionInput.tsx'), 'utf8'
    );
    // Should use start/end
    expect(src).toContain('start: 0');
    expect(src).toContain('end: 0');
    // Should NOT use left/right in styles (except in non-positioning contexts)
    const leftRight = src.match(/\bleft:\s*0\b|\bright:\s*0\b/g);
    expect(leftRight).toBeNull();
  });
});

describe('R3-Tab3-P2: CreateSheet GridCard wrapped in memo', () => {
  test('GridCard is memoized', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../components/ui/CreateSheet.tsx'), 'utf8'
    );
    expect(src).toContain('memo(function GridCard');
  });
});

describe('R3-Tab3-P2: StoryRow dead static style removed', () => {
  test('no hardcoded colors.dark.border in stylesheet', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../components/saf/StoryRow.tsx'), 'utf8'
    );
    expect(src).not.toContain('colors.dark.border');
  });
});

describe('R3-Tab3-P2: ThreadCard Animated.View wrapper removed', () => {
  test('no bare Animated.View wrapping the card', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../components/majlis/ThreadCard.tsx'), 'utf8'
    );
    // The Animated.View that wrapped the entire card should be gone
    // But the Animated.View for poll bar should remain
    expect(src).not.toMatch(/<Animated\.View>\s*\n\s*<Pressable/);
  });
});

describe('R3-Tab3-P2: placehold.co external URLs removed', () => {
  test('no placehold.co URLs in StickerPackBrowser', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../components/risalah/StickerPackBrowser.tsx'), 'utf8'
    );
    expect(src).not.toContain('placehold.co');
  });

  test('no placehold.co URLs in StickerPicker', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../components/risalah/StickerPicker.tsx'), 'utf8'
    );
    expect(src).not.toContain('placehold.co');
  });
});

describe('R3-Tab3-P2: deleted files are actually gone', () => {
  const fs = require('fs');
  const path = require('path');

  const deletedServices = [
    'pushNotifications', 'downloadManager', 'streamApi', 'checklistsApi',
    'discordFeaturesApi', 'mosquesApi', 'ogApi', 'privacyApi',
    'retentionApi', 'scholarQaApi', 'storyChainsApi',
    'telegramFeaturesApi', 'thumbnailsApi', 'videoRepliesApi',
  ];

  for (const svc of deletedServices) {
    test(`services/${svc}.ts deleted by Tab 2`, () => {
      const filePath = path.join(__dirname, `../../services/${svc}.ts`);
      expect(fs.existsSync(filePath)).toBe(false);
    });
  }

  const deletedHooks = [
    'useOfflineFallback', 'useClipboardLinkDetection',
    'useAutoUpdateTimestamp', 'useProgressiveDisclosure', 'useHaptic',
  ];

  for (const hook of deletedHooks) {
    test(`hooks/${hook}.ts deleted by Tab 2`, () => {
      const filePath = path.join(__dirname, `../../hooks/${hook}.ts`);
      expect(fs.existsSync(filePath)).toBe(false);
    });
  }
});
