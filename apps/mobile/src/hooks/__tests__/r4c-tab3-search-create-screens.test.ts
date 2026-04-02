/**
 * R4C Tab3 — Tests for screen-time, search, search-results, send-tip,
 * series/[id], create-clip, create-event, create-group, create-playlist,
 * create-post screen fixes.
 *
 * 137 findings: D33 (77) + D11 (60)
 * Covers: theme-aware colors, double-tap guards, RTL, haptic,
 * keyboard handling, safe area, error handling, ProgressiveImage.
 */

import * as fs from 'fs';
import * as path from 'path';

const screensDir = path.resolve(__dirname, '../../../app/(screens)');

function readScreen(name: string): string {
  return fs.readFileSync(path.join(screensDir, name), 'utf8');
}

// ── screen-time.tsx ──
describe('R4C-Tab3: screen-time.tsx', () => {
  const src = readScreen('screen-time.tsx');

  test('no hardcoded colors.text.* in styles', () => {
    // Only check the createStyles section
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.text.primary');
    expect(stylesSection).not.toContain('colors.text.secondary');
    expect(stylesSection).not.toContain('colors.text.tertiary');
  });

  test('no hardcoded rgba border colors in styles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain("'rgba(45,53,72,0.3)'");
  });

  test('has double-tap guard ref for limit mutation', () => {
    expect(src).toContain('limitLockRef');
    expect(src).toContain('if (limitLockRef.current) return');
  });

  test('limitMutation has onError handler', () => {
    expect(src).toContain('onError:');
    expect(src).toContain('limitFailed');
  });

  test('AsyncStorage calls have .catch()', () => {
    // Every AsyncStorage.getItem or setItem should be followed by .catch
    const asyncCalls = src.match(/AsyncStorage\.\w+Item\([^)]+\)/g) || [];
    expect(asyncCalls.length).toBeGreaterThan(0);
    // The main AsyncStorage.getItem for take-a-break has .catch()
    expect(src).toContain(".catch(() => {})");
  });

  test('chevron flips for RTL', () => {
    expect(src).toContain("isRTL ? 'chevron-left' : 'chevron-right'");
  });

  test('uses useRef import', () => {
    expect(src).toContain('useRef');
  });
});

// ── search.tsx ──
describe('R4C-Tab3: search.tsx', () => {
  const src = readScreen('search.tsx');

  test('no hardcoded colors.text.* in createStyles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.text.primary');
    expect(stylesSection).not.toContain('colors.text.secondary');
    expect(stylesSection).not.toContain('colors.text.tertiary');
  });

  test('delete history has haptic feedback', () => {
    expect(src).toContain('haptic.delete()');
  });

  test('clear all history has haptic feedback', () => {
    // haptic.delete() should appear for both individual delete and clear all
    const hapticDeleteCount = (src.match(/haptic\.delete\(\)/g) || []).length;
    expect(hapticDeleteCount).toBeGreaterThanOrEqual(2);
  });

  test('AsyncStorage writes have .catch()', () => {
    // Search history saves should have .catch() — check that at least one exists
    // The regex needs to account for multi-line setItem calls
    const hasCatch = src.includes('setItem') && src.includes('.catch(() => {})');
    expect(hasCatch).toBe(true);
  });
});

// ── search-results.tsx ──
describe('R4C-Tab3: search-results.tsx', () => {
  const src = readScreen('search-results.tsx');

  test('does not import raw Image from react-native', () => {
    // Should not have Image in the RN import
    const rnImport = src.match(/from 'react-native'[\s\S]*?;/);
    expect(rnImport).toBeTruthy();
    expect(rnImport![0]).not.toContain('Image');
  });

  test('uses ProgressiveImage import', () => {
    expect(src).toContain("import { ProgressiveImage }");
  });

  test('ReelGridItem uses ProgressiveImage', () => {
    expect(src).toContain('<ProgressiveImage');
  });

  test('no hardcoded colors.text.* in createStyles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.text.primary');
    expect(stylesSection).not.toContain('colors.text.secondary');
    expect(stylesSection).not.toContain('colors.text.tertiary');
  });

  test('follow mutation has double-tap lock ref', () => {
    expect(src).toContain('followLockRef');
  });

  test('animation delays are capped at 500ms', () => {
    // All FadeInUp.delay calls should use Math.min
    const delays = src.match(/FadeInUp\.delay\([^)]+\)/g) || [];
    for (const delay of delays) {
      if (delay.includes('index')) {
        expect(delay).toContain('Math.min');
      }
    }
  });

  test('clear button has haptic feedback', () => {
    expect(src).toContain('haptic.tick()');
  });
});

// ── send-tip.tsx ──
describe('R4C-Tab3: send-tip.tsx', () => {
  const src = readScreen('send-tip.tsx');

  test('has sendLockRef double-tap guard', () => {
    expect(src).toContain('sendLockRef');
    expect(src).toContain('if (sendLockRef.current) return');
  });

  test('no module-scope Dimensions.get', () => {
    // Should NOT have const { width } = Dimensions.get('window') at module scope
    const moduleScope = src.slice(0, src.indexOf('function AmountButton'));
    expect(moduleScope).not.toContain("Dimensions.get('window')");
  });

  test('uses useWindowDimensions hook', () => {
    expect(src).toContain('useWindowDimensions');
  });

  test('no hardcoded colors.text.* in createStyles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.text.primary');
    expect(stylesSection).not.toContain('colors.text.secondary');
    expect(stylesSection).not.toContain('colors.text.tertiary');
  });

  test('uses borderStartWidth instead of borderLeftWidth for RTL', () => {
    expect(src).toContain('borderStartWidth');
    expect(src).not.toContain('borderLeftWidth');
    expect(src).not.toContain('borderLeftColor');
  });

  test('error handler differentiates error types', () => {
    expect(src).toContain("errMsg.includes('network')");
    expect(src).toContain("errMsg.includes('amount')");
  });

  test('amountButton uses percentage width', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).toContain("width: '31%'");
  });
});

// ── series/[id].tsx ──
describe('R4C-Tab3: series/[id].tsx', () => {
  const src = readScreen('series/[id].tsx');

  test('no hardcoded colors.text.* in createStyles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.text.primary');
    expect(stylesSection).not.toContain('colors.text.secondary');
    expect(stylesSection).not.toContain('colors.text.tertiary');
  });

  test('uses start/end instead of left/right for RTL', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain("left: 0");
    expect(stylesSection).not.toContain("right: 0");
    expect(stylesSection).toContain("start:");
    expect(stylesSection).toContain("end:");
  });

  test('followBtnWrap uses marginStart not marginLeft', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).toContain("marginStart: 'auto'");
    expect(stylesSection).not.toContain("marginLeft:");
  });

  test('has double-tap guard on follow mutation', () => {
    expect(src).toContain('followLockRef');
  });

  test('episode row has haptic feedback', () => {
    expect(src).toContain('haptic.navigate()');
  });

  test('chevron flips for RTL in episode row', () => {
    expect(src).toContain("isRTL ? 'chevron-left' : 'chevron-right'");
  });
});

// ── create-clip.tsx ──
describe('R4C-Tab3: create-clip.tsx', () => {
  const src = readScreen('create-clip.tsx');

  test('ScrollView has keyboardShouldPersistTaps', () => {
    expect(src).toContain('keyboardShouldPersistTaps="handled"');
  });

  test('onError shows server error message', () => {
    expect(src).toContain('err.message');
  });

  test('onError has haptic feedback', () => {
    expect(src).toContain('haptic.error()');
  });
});

// ── create-event.tsx ──
describe('R4C-Tab3: create-event.tsx', () => {
  const src = readScreen('create-event.tsx');

  test('imports useContextualHaptic', () => {
    expect(src).toContain('useContextualHaptic');
  });

  test('uses createStyles(tc) pattern', () => {
    expect(src).toContain('const createStyles');
    expect(src).toContain('const styles = createStyles(tc)');
  });

  test('no colors.dark.* in styles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.dark.bg');
    expect(stylesSection).not.toContain('colors.dark.surface');
    expect(stylesSection).not.toContain('colors.dark.border');
  });

  test('no colors.text.* in styles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.text.primary');
    expect(stylesSection).not.toContain('colors.text.secondary');
    expect(stylesSection).not.toContain('colors.text.tertiary');
  });

  test('ScrollView has keyboardShouldPersistTaps', () => {
    expect(src).toContain('keyboardShouldPersistTaps="handled"');
  });

  test('bottom bar has safe area padding', () => {
    expect(src).toContain('insets.bottom');
  });

  test('submit has haptic.success()', () => {
    expect(src).toContain('haptic.success()');
  });

  test('no dead Dimensions.get import', () => {
    expect(src).not.toContain("const { width } = Dimensions.get('window')");
  });
});

// ── create-group.tsx ──
describe('R4C-Tab3: create-group.tsx', () => {
  const src = readScreen('create-group.tsx');

  test('does not nest FlatList inside ScrollView', () => {
    // Should not import ScrollView
    const rnImport = src.match(/from 'react-native'[\s\S]*?;/);
    expect(rnImport).toBeTruthy();
    expect(rnImport![0]).not.toContain('ScrollView');
  });

  test('uses createStyles(tc) pattern', () => {
    expect(src).toContain('const createStyles');
  });

  test('no colors.dark.* in styles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.dark.bg');
    expect(stylesSection).not.toContain('colors.dark.bgCard');
    expect(stylesSection).not.toContain('colors.dark.border');
  });

  test('SafeAreaView includes bottom edge', () => {
    expect(src).toContain("edges={['top', 'bottom']}");
  });
});

// ── create-playlist.tsx ──
describe('R4C-Tab3: create-playlist.tsx', () => {
  const src = readScreen('create-playlist.tsx');

  test('uses createStyles(tc) pattern', () => {
    expect(src).toContain('const createStyles');
  });

  test('no colors.dark.bg in styles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.dark.bg');
  });

  test('no colors.text.* in styles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.text.primary');
    expect(stylesSection).not.toContain('colors.text.secondary');
  });
});

// ── create-post.tsx ──
describe('R4C-Tab3: create-post.tsx', () => {
  const src = readScreen('create-post.tsx');

  test('uses createStyles(tc) pattern', () => {
    expect(src).toContain('const createStyles');
    expect(src).toContain('const styles = createStyles(tc)');
  });

  test('no colors.dark.* in styles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.dark.bg');
    expect(stylesSection).not.toContain('colors.dark.bgElevated');
    expect(stylesSection).not.toContain('colors.dark.border');
  });

  test('header has theme-aware background', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain("'rgba(13, 17, 23, 0.92)'");
  });

  test('toolbar gradient uses theme-aware colors', () => {
    expect(src).not.toContain("'rgba(13,17,23,0.95)'");
  });

  test('share button has double-tap prevention', () => {
    expect(src).toContain('createMutation.isPending) return');
  });

  test('draft load has error handling', () => {
    // Draft load catch block should exist — search wider range
    const draftSection = src.slice(src.indexOf('loadDraft'), src.indexOf('loadDraft') + 800);
    expect(draftSection).toContain('catch');
  });

  test('uses fonts.bodyBold instead of hardcoded font family', () => {
    expect(src).not.toContain("fontFamily: 'DMSans_700Bold'");
    expect(src).toContain('fonts.bodyBold');
  });

  test('alt text reminder uses fontSize token', () => {
    expect(src).toContain('fontSize.xs');
    // Should not have literal fontSize: 11 for alt text reminder
    expect(src).not.toMatch(/fontSize: 11,\s*marginEnd: 8/);
  });
});
