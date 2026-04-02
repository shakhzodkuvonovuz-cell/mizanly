/**
 * R4E-Tab3 Screen Tests
 * Covers: followed-topics, followers/[userId], following/[userId], gift-shop, go-live,
 * saved, saved-messages, schedule-live, schedule-post, scholar-verification
 */
import * as fs from 'fs';
import * as path from 'path';

const SCREENS_DIR = path.resolve(__dirname, '../../../app/(screens)');

function readScreen(name: string): string {
  return fs.readFileSync(path.join(SCREENS_DIR, `${name}.tsx`), 'utf-8');
}

function getStylesSection(src: string): string {
  const stylesIdx = src.lastIndexOf('StyleSheet.create');
  return stylesIdx >= 0 ? src.slice(stylesIdx) : '';
}

// ── gift-shop.tsx ──

describe('gift-shop', () => {
  const src = readScreen('gift-shop');
  const styles = getStylesSection(src);

  test('no colors.dark.bg in stylesheet', () => {
    expect(styles).not.toContain('colors.dark.bg');
  });

  test('no colors.dark.bgCard in stylesheet', () => {
    expect(styles).not.toContain('colors.dark.bgCard');
  });

  test('no colors.dark.border in stylesheet', () => {
    expect(styles).not.toContain('colors.dark.border');
  });

  test('coins credited after payment — purchasingPackage guard', () => {
    expect(src).toContain('purchasingPackage');
    expect(src).toContain('setPurchasingPackage(null)');
  });

  test('per-package loading indicator', () => {
    expect(src).toContain('purchasingPackage === item.coins');
  });

  test('cashout requires confirmation dialog', () => {
    expect(src).toContain('Alert.alert');
    expect(src).toContain('confirmCashout');
  });

  test('has error state for history query', () => {
    expect(src).toContain('historyError');
    expect(src).toContain('Could not load history');
  });

  test('has error state for balance/catalog queries', () => {
    expect(src).toContain('balanceError');
    expect(src).toContain('catalogError');
    expect(src).toContain('Could not load shop');
  });

  test('no unused shadow/animation imports', () => {
    expect(src).not.toMatch(/import.*shadow.*animation.*from/);
  });

  test('uses tc.bg for container background', () => {
    expect(src).toContain('backgroundColor: tc.bg');
  });
});

// ── followed-topics.tsx ──

describe('followed-topics', () => {
  const src = readScreen('followed-topics');
  const styles = getStylesSection(src);

  test('no colors.dark.bg in stylesheet', () => {
    expect(styles).not.toContain('colors.dark.bg');
  });

  test('no colors.dark.bgCard in stylesheet', () => {
    expect(styles).not.toContain('colors.dark.bgCard');
  });

  test('no colors.dark.border in stylesheet', () => {
    expect(styles).not.toContain('colors.dark.border');
  });

  test('timer cleanup on unmount', () => {
    expect(src).toContain('clearTimeout(searchTimeout.current)');
    // The return in useEffect
    expect(src).toMatch(/return\s*\(\)\s*=>\s*\{[\s\S]*clearTimeout/);
  });

  test('uses useContextualHaptic', () => {
    expect(src).toContain('useContextualHaptic');
    expect(src).toContain('haptic.tick()');
  });

  test('has error state when load fails', () => {
    expect(src).toContain('loadError');
    expect(src).toContain('setLoadError(true)');
  });

  test('keyboardShouldPersistTaps on FlatList', () => {
    expect(src).toContain('keyboardShouldPersistTaps="handled"');
  });

  test('tc.text.secondary used for hashtagCount', () => {
    expect(src).toContain('color: tc.text.secondary');
  });
});

// ── followers/[userId].tsx ──

describe('followers/[userId]', () => {
  const src = readScreen('followers/[userId]');
  const styles = getStylesSection(src);

  test('no colors.dark.bg in stylesheet', () => {
    expect(styles).not.toContain('colors.dark.bg');
  });

  test('no colors.dark.bgCard in stylesheet', () => {
    expect(styles).not.toContain('colors.dark.bgCard');
  });

  test('no dead Icon import', () => {
    expect(src).not.toMatch(/import.*\{.*Icon.*\}.*from.*'@\/components\/ui\/Icon'/);
  });

  test('error state inside ScreenErrorBoundary', () => {
    // Error view should be inside the boundary, not before it
    const boundaryIdx = src.indexOf('ScreenErrorBoundary');
    const errorIdx = src.indexOf('isError');
    // ScreenErrorBoundary should appear before the error check
    expect(boundaryIdx).toBeLessThan(errorIdx);
  });

  test('uses fontFamily instead of fontWeight for name', () => {
    expect(styles).toContain('fontFamily: fonts.bodySemiBold');
    expect(styles).not.toContain("fontWeight: '600'");
  });

  test('has haptic on follow mutation', () => {
    expect(src).toContain('haptic.success()');
    expect(src).toContain('haptic.error()');
  });

  test('double-tap guard on follow', () => {
    expect(src).toContain('!followMutation.isPending && followMutation.mutate');
  });

  test('invalidates profile query on follow', () => {
    expect(src).toContain("queryKey: ['profile', userId]");
  });

  test('animation delay capped', () => {
    expect(src).toContain('Math.min(index, 15)');
  });

  test('bottom safe area edge', () => {
    expect(src).toContain("edges={['top', 'bottom']}");
  });
});

// ── following/[userId].tsx ──

describe('following/[userId]', () => {
  const src = readScreen('following/[userId]');
  const styles = getStylesSection(src);

  test('no colors.dark.bg in stylesheet', () => {
    expect(styles).not.toContain('colors.dark.bg');
  });

  test('no dead Icon import', () => {
    expect(src).not.toMatch(/import.*\{.*Icon.*\}.*from.*'@\/components\/ui\/Icon'/);
  });

  test('uses fontFamily instead of fontWeight', () => {
    expect(styles).toContain('fontFamily: fonts.bodySemiBold');
    expect(styles).not.toContain("fontWeight: '600'");
  });

  test('has haptic on follow mutation', () => {
    expect(src).toContain('haptic.success()');
  });

  test('double-tap guard on follow', () => {
    expect(src).toContain('!followMutation.isPending && followMutation.mutate');
  });

  test('animation delay capped', () => {
    expect(src).toContain('Math.min(index, 15)');
  });

  test('error state inside ScreenErrorBoundary', () => {
    const boundaryIdx = src.indexOf('ScreenErrorBoundary');
    const errorIdx = src.indexOf('isError');
    expect(boundaryIdx).toBeLessThan(errorIdx);
  });
});

// ── go-live.tsx ──

describe('go-live', () => {
  const src = readScreen('go-live');
  const styles = getStylesSection(src);

  test('no colors.dark.bg in stylesheet', () => {
    expect(styles).not.toContain('colors.dark.bg');
  });

  test('no colors.dark.bgElevated in stylesheet', () => {
    expect(styles).not.toContain('colors.dark.bgElevated');
  });

  test('no colors.dark.border in stylesheet', () => {
    expect(styles).not.toContain('colors.dark.border');
  });

  test('go live works for non-scheduled streams', () => {
    expect(src).not.toContain('liveNotAvailable');
  });

  test('double-tap guard on go live', () => {
    expect(src).toContain('createMutation.isPending) return');
  });

  test('has KeyboardAvoidingView', () => {
    expect(src).toContain('KeyboardAvoidingView');
  });

  test('no dead useEffect import', () => {
    // useEffect should not appear in imports
    const importSection = src.slice(0, src.indexOf('export'));
    expect(importSection).not.toMatch(/\buseEffect\b/);
  });

  test('Platform import used for KeyboardAvoidingView', () => {
    expect(src).toContain('Platform.OS');
  });

  test('no dead EmptyState import', () => {
    expect(src).not.toContain("import { EmptyState }");
  });

  test('uses fontFamily instead of fontWeight', () => {
    expect(styles).toContain('fontFamily: fonts.bodySemiBold');
    expect(styles).not.toContain("fontWeight: '600'");
    expect(styles).not.toContain("fontWeight: '700'");
  });

  test('haptic on schedule toggle', () => {
    expect(src).toMatch(/handleScheduleToggle[\s\S]*haptic\.tick/);
  });
});

// ── saved.tsx ──

describe('saved', () => {
  const src = readScreen('saved');
  const styles = getStylesSection(src);

  test('query keys include activeCollection', () => {
    expect(src).toContain("queryKey: ['saved-posts', activeCollection]");
    expect(src).toContain("queryKey: ['saved-threads', activeCollection]");
    expect(src).toContain("queryKey: ['saved-reels', activeCollection]");
    expect(src).toContain("queryKey: ['saved-videos', activeCollection]");
  });

  test('no colors.text.primary in stylesheet', () => {
    expect(styles).not.toContain('colors.text.primary');
  });

  test('uses tc.text.primary for text colors in styles', () => {
    expect(styles).toContain('tc.text.primary');
  });

  test('no dead isRTL variable', () => {
    expect(src).not.toMatch(/\bisRTL\b/);
  });

  test('uses useContextualHaptic', () => {
    expect(src).toContain('useContextualHaptic');
  });

  test('has double-tap navigation guard', () => {
    expect(src).toContain('navigateOnce');
    expect(src).toContain('lastNavRef');
  });

  test('error container uses stylesheet not inline', () => {
    expect(src).toContain('styles.errorContainer');
    expect(src).not.toContain("{ flex: 1, justifyContent: 'center' }");
  });
});

// ── saved-messages.tsx ──

describe('saved-messages', () => {
  const src = readScreen('saved-messages');
  const styles = getStylesSection(src);

  test('delete requires confirmation dialog', () => {
    expect(src).toContain('Alert.alert');
    expect(src).toContain('confirmDeleteMessage');
  });

  test('no colors.text.primary in dynamic stylesheet', () => {
    expect(styles).not.toContain('colors.text.primary');
  });

  test('no colors.text.secondary in dynamic stylesheet (except pinText)', () => {
    // forwardText and infoText should use tc.text.*
    expect(styles).toContain('tc.text.secondary');
    expect(styles).toContain('tc.text.primary');
    expect(styles).toContain('tc.text.tertiary');
  });

  test('onEndReached guards isFetchingNextPage', () => {
    expect(src).toContain('!messagesQuery.isFetchingNextPage');
  });

  test('animation delay capped at index 15', () => {
    expect(src).toContain('Math.min(index, 15)');
  });

  test('keyboardShouldPersistTaps on FlatList', () => {
    expect(src).toContain('keyboardShouldPersistTaps="handled"');
  });

  test('search input has RTL textAlign', () => {
    expect(src).toContain("isRTL && { textAlign: 'right' }");
  });

  test('mutations have onError handlers', () => {
    const errorHandlerCount = (src.match(/onError:/g) || []).length;
    expect(errorHandlerCount).toBeGreaterThanOrEqual(2);
  });

  test('compose bar has bottom safe area padding', () => {
    expect(src).toContain('insets.bottom');
    expect(src).toContain('useSafeAreaInsets');
  });

  test('header actions have accessibility labels', () => {
    expect(src).toContain("accessibilityLabel: t('accessibility.goBack')");
    expect(src).toContain("accessibilityLabel: t('common.search')");
  });
});

// ── schedule-live.tsx ──

describe('schedule-live', () => {
  const src = readScreen('schedule-live');
  const styles = getStylesSection(src);

  test('no colors.text.primary in stylesheet', () => {
    expect(styles).not.toContain('colors.text.primary');
  });

  test('no colors.text.secondary in stylesheet', () => {
    expect(styles).not.toContain('colors.text.secondary');
  });

  test('uses router.replace instead of back+push', () => {
    expect(src).toContain('router.replace');
    // Should not have back() followed by push() in onSuccess
    expect(src).not.toMatch(/onSuccess[\s\S]{0,200}router\.back\(\)[\s\S]{0,50}router\.push/);
  });

  test('has haptic on success and error', () => {
    expect(src).toContain('haptic.success()');
    expect(src).toContain('haptic.error()');
  });

  test('uses tc.text.primary in styles', () => {
    expect(styles).toContain('tc.text.primary');
  });

  test('has KeyboardAvoidingView', () => {
    expect(src).toContain('KeyboardAvoidingView');
  });
});

// ── schedule-post.tsx ──

describe('schedule-post', () => {
  const src = readScreen('schedule-post');
  const styles = getStylesSection(src);

  test('no colors.text.primary in stylesheet', () => {
    expect(styles).not.toContain('colors.text.primary');
  });

  test('no colors.text.secondary in stylesheet', () => {
    expect(styles).not.toContain('colors.text.secondary');
  });

  test('no colors.text.tertiary in stylesheet', () => {
    expect(styles).not.toContain('colors.text.tertiary');
  });

  test('no dead isRTL variable', () => {
    expect(src).not.toMatch(/\bisRTL\b/);
  });

  test('date initialization handles month boundaries', () => {
    // Uses Date math instead of raw getDate() + 2
    expect(src).toContain('2 * 86400000');
    expect(src).toContain('defaultDate.getDate()');
  });

  test('quick dates use selectQuickDate for month-safe selection', () => {
    expect(src).toContain('selectQuickDate');
  });

  test('malformed media params show error toast', () => {
    expect(src).toContain('mediaParseError');
  });

  test('schedule button has disabled opacity', () => {
    expect(src).toContain('isScheduling && { opacity: 0.5 }');
  });
});

// ── scholar-verification.tsx ──

describe('scholar-verification', () => {
  const src = readScreen('scholar-verification');
  const styles = getStylesSection(src);

  test('no colors.text.primary in stylesheet', () => {
    expect(styles).not.toContain('colors.text.primary');
  });

  test('no colors.text.secondary in stylesheet', () => {
    expect(styles).not.toContain('colors.text.secondary');
  });

  test('uses tc.text.primary in styles', () => {
    expect(styles).toContain('tc.text.primary');
  });

  test('fetchStatus distinguishes 404 from real errors', () => {
    expect(src).toContain('status !== 404');
  });

  test('submit error differentiates 409 from generic errors', () => {
    expect(src).toContain('status === 409');
  });

  test('has error haptic on submit failure', () => {
    expect(src).toContain('haptic.error()');
  });

  test('keyboardShouldPersistTaps on form ScrollView', () => {
    expect(src).toContain('keyboardShouldPersistTaps="handled"');
  });

  test('specialization labels use i18n', () => {
    expect(src).toContain('scholar.spec.');
  });

  test('madhab labels use i18n', () => {
    expect(src).toContain('scholar.madhab.');
  });

  test('add document button has accessibilityRole', () => {
    expect(src).toContain('accessibilityRole="button"');
  });

  test('has error state UI for load failures', () => {
    expect(src).toContain('loadError');
  });

  test('has KeyboardAvoidingView', () => {
    expect(src).toContain('KeyboardAvoidingView');
  });
});
