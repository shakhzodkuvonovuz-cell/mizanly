/**
 * R4B-Tab3 Screen Tests
 * Covers: creator-storefront, cross-post, dhikr-challenge-detail, dhikr-challenges,
 * dhikr-counter, disappearing-default, disappearing-settings, discover,
 * disposable-camera, dm-note-editor
 */
import * as fs from 'fs';
import * as path from 'path';

const SCREENS_DIR = path.resolve(__dirname, '../../../app/(screens)');

function readScreen(name: string): string {
  return fs.readFileSync(path.join(SCREENS_DIR, `${name}.tsx`), 'utf-8');
}

// ── creator-storefront.tsx ──

describe('creator-storefront', () => {
  const src = readScreen('creator-storefront');

  test('has error state handling', () => {
    expect(src).toContain('hasError');
    expect(src).toContain('alert-circle');
  });

  test('double-tap guard on product press', () => {
    expect(src).toContain('isNavigatingRef');
  });

  test('followers text has inline theme color', () => {
    expect(src).toContain("styles.creatorFollowers, { color: tc.text.tertiary }");
  });

  test('stat text has inline theme colors', () => {
    expect(src).toContain("styles.statValue, { color: tc.text.primary }");
    expect(src).toContain("styles.statLabel, { color: tc.text.secondary }");
  });

  test('imports showToast', () => {
    expect(src).toContain("import { showToast }");
  });

  test('animation delay is capped', () => {
    expect(src).toContain('Math.min(index, 15)');
  });

  test('FAB has press feedback', () => {
    expect(src).toContain('pressed && { opacity: 0.7 }');
  });

  test('halalBadge uses spacing.xs not hardcoded 3', () => {
    // The halalBadge section should use spacing.xs
    const ssMatch = src.indexOf('halalBadge:');
    const badgeSection = src.slice(ssMatch, ssMatch + 200);
    expect(badgeSection).toContain('spacing.xs');
    expect(badgeSection).not.toContain('gap: 3');
  });
});

// ── cross-post.tsx ──

describe('cross-post', () => {
  const src = readScreen('cross-post');

  test('safe access to mediaUrls (no crash)', () => {
    expect(src).toContain("post.mediaUrls?.[0]");
  });

  test('double-tap guard on cross-post mutation', () => {
    expect(src).toContain('crossPostMutation.isPending) return');
  });

  test('error mutation shows toast', () => {
    expect(src).toContain("showToast({ message: t('common.somethingWentWrong')");
  });

  test('bottom bar has theme-aware colors', () => {
    expect(src).toContain('backgroundColor: tc.bg, borderTopColor: tc.border');
  });

  test('captionInput has inline color override', () => {
    expect(src).toContain('color: tc.text.primary, textAlign:');
  });

  test('space options use tc for unselected state', () => {
    expect(src).toContain('backgroundColor: tc.bgCard, borderColor: tc.border');
  });
});

// ── dhikr-challenge-detail.tsx ──

describe('dhikr-challenge-detail', () => {
  const src = readScreen('dhikr-challenge-detail');

  test('has error state with retry', () => {
    expect(src).toContain('isError');
    expect(src).toContain('onAction={() => refetch()}');
  });

  test('join mutation has onError', () => {
    const joinSection = src.slice(src.indexOf('joinMutation'), src.indexOf('contributeMutation'));
    expect(joinSection).toContain('onError');
  });

  test('contribute mutation has onError', () => {
    const contributeIdx = src.indexOf('contributeMutation = useMutation');
    const contributeSection = src.slice(contributeIdx, contributeIdx + 800);
    expect(contributeSection).toContain('onError');
  });

  test('animation delay is capped on leaderboard', () => {
    expect(src).toContain('Math.min(index, 15) * 50');
  });

  test('contributor row border uses tc.border', () => {
    expect(src).toContain('borderBottomColor: tc.border');
  });
});

// ── dhikr-challenges.tsx ──

describe('dhikr-challenges', () => {
  const src = readScreen('dhikr-challenges');

  test('has error state for infinite query', () => {
    expect(src).toContain('isError');
    expect(src).toContain("onAction={() => refetch()}");
  });

  test('create mutation checks isPending', () => {
    expect(src).toContain('createMutation.isPending) return');
  });

  test('button uses mutation isPending not local state', () => {
    expect(src).toContain('loading={createMutation.isPending}');
  });

  test('pagination footer shows loading indicator', () => {
    expect(src).toContain('isFetchingNextPage');
    expect(src).toContain('ListFooterComponent');
  });

  test('onEndReached checks isFetchingNextPage', () => {
    expect(src).toContain('!isFetchingNextPage) fetchNextPage()');
  });
});

// ── dhikr-counter.tsx ──

describe('dhikr-counter', () => {
  const src = readScreen('dhikr-counter');

  test('save mutation has onError handler', () => {
    const saveIdx = src.indexOf('saveSessionMutation = useMutation');
    const saveSection = src.slice(saveIdx, saveIdx + 500);
    expect(saveSection).toContain('onError');
  });

  test('has queued save to prevent race conditions', () => {
    expect(src).toContain('queueSave');
    expect(src).toContain('saveQueueRef');
  });

  test('reset has confirmation dialog for count >= 10', () => {
    expect(src).toContain('Alert.alert');
    expect(src).toContain('count >= 10');
  });

  test('reset has double-tap guard', () => {
    expect(src).toContain('isResettingRef');
  });

  test('uses useWindowDimensions instead of module-level Dimensions', () => {
    expect(src).toContain('useWindowDimensions');
    expect(src).not.toMatch(/^const \{ width \} = Dimensions\.get/m);
  });

  test('reset button uses end instead of right for RTL', () => {
    expect(src).toContain('end: screenWidth');
    // Stylesheet should not have hardcoded right
    const resetBtnIdx = src.indexOf("resetButton:");
    const resetSection = src.slice(resetBtnIdx, resetBtnIdx + 200);
    expect(resetSection).not.toContain('right:');
  });

  test('icon changed from circle to repeat', () => {
    const resetArea = src.slice(src.indexOf('Reset Button'));
    expect(resetArea).toContain('name="repeat"');
    expect(resetArea).not.toContain('name="circle"');
  });

  test('uses pre-loaded sound instance', () => {
    expect(src).toContain('getBeadClickSound');
  });

  test('auto-save effect has minimal dependencies', () => {
    expect(src).toContain('[isComplete]');
  });
});

// ── disappearing-default.tsx ──

describe('disappearing-default', () => {
  const src = readScreen('disappearing-default');

  test('imports useContextualHaptic', () => {
    expect(src).toContain("import { useContextualHaptic }");
  });

  test('uses haptic on selection', () => {
    expect(src).toContain('haptic.tick()');
  });

  test('load error shows toast', () => {
    expect(src).toContain("showToast({ message: t('disappearingDefault.errorLoad'");
  });
});

// ── disappearing-settings.tsx ──

describe('disappearing-settings', () => {
  const src = readScreen('disappearing-settings');

  test('validates conversationId before save', () => {
    expect(src).toContain('!conversationId');
  });

  test('checks mutation.isPending before save', () => {
    expect(src).toContain('mutation.isPending) return');
  });

  test('lockBadge uses tc.bg for border', () => {
    expect(src).toContain('borderColor: tc.bg');
  });
});

// ── discover.tsx ──

describe('discover', () => {
  const src = readScreen('discover');

  test('no ExpoVideo autoplay in grid (OOM fix)', () => {
    // Should not have shouldPlay in ExploreGridItem
    const gridItemIdx = src.indexOf('ExploreGridItem');
    const gridItemSection = src.slice(gridItemIdx, gridItemIdx + 2000);
    expect(gridItemSection).not.toContain('shouldPlay');
  });

  test('imports fonts from theme', () => {
    expect(src).toMatch(/import.*fonts.*from.*@\/theme/);
  });

  test('imports useContextualHaptic', () => {
    expect(src).toContain("import { useContextualHaptic }");
  });

  test('double-tap guard on grid item press', () => {
    expect(src).toContain('isNavigatingRef');
  });

  test('featured items are memoized', () => {
    expect(src).toContain('useMemo');
  });

  test('explore query has staleTime', () => {
    expect(src).toContain('staleTime');
  });

  test('pagination checks isFetchingNextPage', () => {
    expect(src).toContain('!isFetchingNextPage');
  });

  test('sectionTitle uses fontFamily', () => {
    const ssMatch = src.indexOf('sectionTitle:');
    const section = src.slice(ssMatch, ssMatch + 200);
    expect(section).toContain('fontFamily');
  });

  test('hashtagTextGold uses fontFamily', () => {
    const idx = src.indexOf('hashtagTextGold:');
    const section = src.slice(idx, idx + 200);
    expect(section).toContain('fontFamily');
  });
});

// ── disposable-camera.tsx ──

describe('disposable-camera', () => {
  const src = readScreen('disposable-camera');

  test('share button checks isPending', () => {
    expect(src).toContain('postMutation.isPending) postMutation.mutate()');
    expect(src).toContain('disabled={postMutation.isPending}');
  });

  test('setTimeout cleaned up on unmount', () => {
    expect(src).toContain('bounceTimerRef');
    expect(src).toContain('clearTimeout(bounceTimerRef.current)');
  });

  test('retake has confirmation dialog', () => {
    expect(src).toContain('Alert.alert');
    expect(src).toContain('retakeTitle');
  });

  test('tagline text has inline theme color', () => {
    expect(src).toContain("styles.taglineMain, { color: tc.text.secondary }");
  });

  test('no-edit text has inline theme color', () => {
    expect(src).toContain("styles.noEditText, { color: tc.text.secondary }");
  });
});

// ── dm-note-editor.tsx ──

describe('dm-note-editor', () => {
  const src = readScreen('dm-note-editor');

  test('delete uses BottomSheet not Alert.alert', () => {
    // Should not call Alert.alert() anywhere (comments mentioning it are OK)
    expect(src).not.toMatch(/Alert\.alert\s*\(/);
    expect(src).toContain('deleteSheetVisible');
  });

  test('imports useContextualHaptic', () => {
    expect(src).toContain("import { useContextualHaptic }");
  });

  test('handlePost checks isPending', () => {
    expect(src).toContain('createMutation.isPending) return');
  });

  test('keyboard behavior works on Android', () => {
    expect(src).toContain("'height'");
  });

  test('query has staleTime', () => {
    expect(src).toContain('staleTime: 30_000');
  });

  test('imports fonts from theme', () => {
    expect(src).toMatch(/import.*fonts.*from.*@\/theme/);
  });

  test('textInput has fontFamily', () => {
    const ssMatch = src.indexOf('textInput:');
    const section = src.slice(ssMatch, ssMatch + 200);
    expect(section).toContain('fontFamily');
  });
});
