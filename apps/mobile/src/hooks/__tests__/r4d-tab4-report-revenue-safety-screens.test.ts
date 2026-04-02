/**
 * R4D Tab4 — Tests for reports/[id], restricted, revenue, safety-center,
 * save-to-playlist, morning-briefing, mosque-finder, muted, mutual-followers,
 * my-reports screen fixes.
 *
 * 130 findings: D31 (67) + D24 (63)
 * Covers: theme-aware colors, haptic, error handling, font families,
 * double-tap guards, null safety, staleTime, animation caps, destructive
 * confirmation patterns.
 */

import * as fs from 'fs';
import * as path from 'path';

const screensDir = path.resolve(__dirname, '../../../app/(screens)');

function readScreen(name: string): string {
  return fs.readFileSync(path.join(screensDir, name), 'utf8');
}

// ── reports/[id].tsx ──
describe('R4D-T4: reports/[id].tsx', () => {
  const src = readScreen('reports/[id].tsx');

  test('imports useContextualHaptic', () => {
    expect(src).toContain('useContextualHaptic');
  });

  test('uses haptic in component', () => {
    expect(src).toContain('haptic.tick()');
    expect(src).toContain('haptic.delete()');
    expect(src).toContain('haptic.success()');
    expect(src).toContain('haptic.error()');
  });

  test('has confirmation dialog before submit', () => {
    expect(src).toContain('Alert.alert');
    expect(src).toContain('confirmTitle');
    expect(src).toContain('confirmMessage');
  });

  test('no hardcoded colors.dark.bg in static styles', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    expect(stylesSection).not.toContain('colors.dark.bg');
  });

  test('no hardcoded colors.text.primary in static styles', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    expect(stylesSection).not.toContain('colors.text.primary');
  });

  test('container bg uses tc.bg inline', () => {
    expect(src).toContain('backgroundColor: tc.bg');
  });

  test('uses KeyboardAvoidingView', () => {
    expect(src).toContain('KeyboardAvoidingView');
  });

  test('uses fontFamily instead of fontWeight in styles', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    expect(stylesSection).toContain('fonts.bodySemiBold');
    expect(stylesSection).toContain('fonts.body');
  });

  test('no fake setTimeout for loading', () => {
    expect(src).not.toContain('setTimeout(() => setIsLoading');
  });

  test('press feedback on reason items', () => {
    expect(src).toContain('pressed && { opacity: 0.7 }');
  });
});

// ── restricted.tsx ──
describe('R4D-T4: restricted.tsx', () => {
  const src = readScreen('restricted.tsx');

  test('imports useContextualHaptic', () => {
    expect(src).toContain('useContextualHaptic');
  });

  test('haptic on unrestrict flow', () => {
    expect(src).toContain('haptic.tick()');
    expect(src).toContain('haptic.success()');
  });

  test('staleTime configured on query', () => {
    expect(src).toContain('staleTime');
  });

  test('success toast on unrestrict', () => {
    expect(src).toContain('unrestrictSuccess');
  });

  test('no hardcoded colors.text.primary in styles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain("color: colors.text.primary");
    expect(stylesSection).not.toContain("color: colors.text.secondary");
  });

  test('font family used instead of fontWeight', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).toContain('fonts.bodySemiBold');
  });

  test('animation delay capped at 10 items', () => {
    expect(src).toContain('Math.min(index, 10)');
  });

  test('confirmation text is specific (not info text)', () => {
    expect(src).toContain('unrestrictConfirm');
  });
});

// ── revenue.tsx ──
describe('R4D-T4: revenue.tsx', () => {
  const src = readScreen('revenue.tsx');

  test('trend icon correctly uses trending-down', () => {
    expect(src).toContain("'trending-down'");
  });

  test('imports useContextualHaptic', () => {
    expect(src).toContain('useContextualHaptic');
  });

  test('error handling in fetchData (not silent)', () => {
    expect(src).not.toContain('// Keep existing data on error');
    expect(src).toContain('showToast');
  });

  test('error handling in loadMore (not silent)', () => {
    expect(src).not.toContain('// Ignore load more errors');
  });

  test('concurrent load guard on loadMore', () => {
    expect(src).toContain('isLoadingMoreRef');
  });

  test('double-tap guard on Cash Out button', () => {
    expect(src).toContain('isNavigatingRef');
  });

  test('tc.text.* used in createStyles instead of colors.text.*', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    // breakdownAmount, splitTitle, sectionTitle, txDescription should use tc
    expect(stylesSection).toContain('tc.text.primary');
    expect(stylesSection).toContain('tc.text.secondary');
    expect(stylesSection).toContain('tc.text.tertiary');
  });
});

// ── safety-center.tsx ──
describe('R4D-T4: safety-center.tsx', () => {
  const src = readScreen('safety-center.tsx');

  test('icon wrap uses radius.full not hardcoded 22', () => {
    expect(src).not.toContain('borderRadius: 22');
    expect(src).toContain('radius.full');
  });

  test('press feedback on items', () => {
    expect(src).toContain('pressed && { opacity: 0.7 }');
  });

  test('double-tap guard', () => {
    expect(src).toContain('isNavigatingRef');
  });

  test('crisis link has error handling', () => {
    expect(src).toContain('.catch(');
    expect(src).toContain('crisisLinkOffline');
  });

  test('uses colors.active.emerald10 instead of hex+suffix', () => {
    expect(src).not.toContain('`${colors.emerald}12`');
    expect(src).toContain('colors.active.emerald10');
  });

  test('bottom padding on scroll', () => {
    expect(src).toContain("paddingBottom: spacing['2xl']");
  });

  test('android_ripple on items', () => {
    expect(src).toContain('android_ripple');
  });
});

// ── save-to-playlist.tsx ──
describe('R4D-T4: save-to-playlist.tsx', () => {
  const src = readScreen('save-to-playlist.tsx');

  test('imports useContextualHaptic', () => {
    expect(src).toContain('useContextualHaptic');
  });

  test('haptic on toggle', () => {
    expect(src).toContain('haptic.tick()');
    expect(src).toContain('haptic.success()');
  });

  test('staleTime on channels query', () => {
    expect(src).toContain('staleTime: 60_000');
  });

  test('videoId guard in togglePlaylist', () => {
    expect(src).toContain('if (!videoId) return');
  });

  test('uses tc.text in createStyles for playlist text', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).toContain('tc.text.primary');
    expect(stylesSection).toContain('tc.text.tertiary');
  });

  test('font family used', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).toContain('fonts.bodySemiBold');
  });
});

// ── morning-briefing.tsx ──
describe('R4D-T4: morning-briefing.tsx', () => {
  const src = readScreen('morning-briefing.tsx');

  test('null-safe access on hadithOfTheDay', () => {
    expect(src).toContain('hadithOfTheDay?.arabic');
    expect(src).toContain('hadithOfTheDay?.text');
    expect(src).toContain('hadithOfTheDay?.source');
  });

  test('null-safe access on duaOfTheDay', () => {
    expect(src).toContain('duaOfTheDay?.arabic');
    expect(src).toContain('duaOfTheDay?.translation');
  });

  test('null-safe access on dhikrChallenge', () => {
    expect(src).toContain('dhikrChallenge?.target');
    expect(src).toContain('dhikrChallenge?.completed');
  });

  test('NaN division guard on progress bar', () => {
    expect(src).toContain('briefing.totalTasks > 0');
  });

  test('completeMutation has onError', () => {
    const mutationSection = src.slice(src.indexOf('const completeMutation'));
    expect(mutationSection).toContain('onError');
  });

  test('disabled state on quran task pressable', () => {
    expect(src).toContain('completeMutation.isPending');
  });

  test('play haptic is tick not navigate', () => {
    expect(src).toContain('haptic.tick()');
    // Should NOT have haptic.navigate in play handlers
    const playHadithSection = src.slice(src.indexOf('handlePlayHadith'), src.indexOf('handlePlayDua'));
    expect(playHadithSection).not.toContain('haptic.navigate');
  });

  test('reflectionInput has no hardcoded colors.dark.border', () => {
    const stylesSection = src.slice(src.indexOf('reflectionInput'));
    expect(stylesSection).not.toContain('colors.dark.border');
  });

  test('totalTasks guard on celebration card', () => {
    // Guard appears before the celebration card render
    expect(src).toContain('(briefing.totalTasks ?? 0) > 0 && briefing.tasksCompleted >= briefing.totalTasks');
  });

  test('uses KeyboardAvoidingView for reflection input', () => {
    expect(src).toContain('KeyboardAvoidingView');
    expect(src).toContain('keyboardShouldPersistTaps');
  });

  test('animation delays halved (max 400ms not 800ms)', () => {
    // Last card should be delay(400) not delay(800)
    expect(src).not.toContain('delay(800)');
    expect(src).not.toContain('delay(700)');
    expect(src).not.toContain('delay(600)');
    expect(src).not.toContain('delay(500)');
  });
});

// ── mosque-finder.tsx ──
describe('R4D-T4: mosque-finder.tsx', () => {
  const src = readScreen('mosque-finder.tsx');

  test('does NOT navigate to non-existent mosque-detail', () => {
    expect(src).not.toContain("'/(screens)/mosque-detail'");
  });

  test('uses useWindowDimensions instead of module-level Dimensions', () => {
    expect(src).toContain('useWindowDimensions');
    expect(src).not.toMatch(/^const \{ width \} = Dimensions\.get/m);
  });

  test('qibla bearing computed once (not twice)', () => {
    const qiblaSection = src.slice(src.indexOf('qiblaContent'));
    // Should have single computeQiblaBearing call via variable
    expect(qiblaSection).toContain('const qibla');
  });

  test('directions button has press feedback', () => {
    expect(src).toContain('pressed && { opacity: 0.7 }');
  });

  test('facility icons are semantic (not generic)', () => {
    // parking should NOT be map-pin, wheelchair should NOT be check-circle
    expect(src).not.toContain("parking: 'map-pin'");
    expect(src).not.toContain("wheelchair: 'check-circle'");
    expect(src).not.toContain("wudu: 'globe'");
    expect(src).not.toContain("cafe: 'clock'");
  });
});

// ── muted.tsx ──
describe('R4D-T4: muted.tsx', () => {
  const src = readScreen('muted.tsx');

  test('imports useContextualHaptic', () => {
    expect(src).toContain('useContextualHaptic');
  });

  test('no destructive style on unmute button', () => {
    expect(src).not.toContain("style: 'destructive'");
  });

  test('success toast on unmute', () => {
    expect(src).toContain('unmuteSuccess');
  });

  test('user-friendly error message (not raw err.message)', () => {
    expect(src).toContain("t('common.somethingWentWrong')");
  });

  test('no hardcoded colors.dark.bg in styles', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    expect(stylesSection).not.toContain('colors.dark.bg');
    expect(stylesSection).not.toContain('colors.dark.bgCard');
  });

  test('font family used', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    expect(stylesSection).toContain('fonts.bodySemiBold');
  });

  test('animation delay capped', () => {
    expect(src).toContain('Math.min(index, 10)');
  });

  test('staleTime configured', () => {
    expect(src).toContain('staleTime');
  });
});

// ── mutual-followers.tsx ──
describe('R4D-T4: mutual-followers.tsx', () => {
  const src = readScreen('mutual-followers.tsx');

  test('imports useContextualHaptic', () => {
    expect(src).toContain('useContextualHaptic');
  });

  test('follow mutation has onError', () => {
    const followSection = src.slice(src.indexOf('const followMutation'), src.indexOf('const unfollowMutation'));
    expect(followSection).toContain('onError');
  });

  test('unfollow mutation has onError', () => {
    const unfollowSection = src.slice(src.indexOf('const unfollowMutation'), src.indexOf('handleToggleFollow'));
    expect(unfollowSection).toContain('onError');
  });

  test('GradientButton has disabled prop', () => {
    expect(src).toContain('disabled={isToggling}');
  });

  test('no hardcoded container bg in styles', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    expect(stylesSection).not.toContain('colors.dark.bg');
  });

  test('font family used instead of fontWeight', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    expect(stylesSection).toContain('fonts.bodySemiBold');
  });

  test('animation delay capped', () => {
    expect(src).toContain('Math.min(index, 10)');
  });

  test('shows toast on error', () => {
    expect(src).toContain('showToast');
    expect(src).toContain("t('common.somethingWentWrong')");
  });
});

// ── my-reports.tsx ──
describe('R4D-T4: my-reports.tsx', () => {
  const src = readScreen('my-reports.tsx');

  test('no hardcoded colors.dark.bg in styles', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    expect(stylesSection).not.toContain('colors.dark.bg');
  });

  test('font family used instead of fontWeight', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    expect(stylesSection).toContain('fonts.bodySemiBold');
    expect(stylesSection).toContain('fonts.bodyBold');
  });

  test('no haptic on pull-to-refresh', () => {
    const refreshSection = src.slice(src.indexOf('onRefresh'), src.indexOf('onRefresh') + 200);
    expect(refreshSection).not.toContain('haptic.tick()');
  });

  test('animation delay capped', () => {
    expect(src).toContain('Math.min(index, 10)');
  });

  test('consistent layout padding for error/loading/main states', () => {
    // All states should use insets.top + 52 + spacing.md
    expect(src).toContain('insets.top + 52 + spacing.md');
  });

  test('uses spacing tokens not magic numbers for margins', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    expect(stylesSection).toContain('spacing.xs');
  });

  test('imports fonts from theme', () => {
    expect(src).toContain("fonts } from '@/theme'");
  });

  test('no hardcoded text colors in styles', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    expect(stylesSection).not.toContain('color: colors.text.primary');
    expect(stylesSection).not.toContain('color: colors.text.secondary');
    expect(stylesSection).not.toContain('color: colors.text.tertiary');
  });
});
