/**
 * R4C Tab4 — Tests for manage-data, marketplace, media-settings,
 * membership-tiers, mentorship, orders, parental-controls, photo-music,
 * pinned-messages, playlist/[id] screen fixes.
 *
 * 142 findings: D23 (75) + D26 (67)
 * Covers: theme-aware colors, RTL, haptic, error handling, search debounce,
 * double-tap guards, fontFamily, hooks order, destructive confirmations,
 * ProgressiveImage, animation caps, staleTime, keyboard handling.
 */

import * as fs from 'fs';
import * as path from 'path';

const screensDir = path.resolve(__dirname, '../../../app/(screens)');

function readScreen(name: string): string {
  return fs.readFileSync(path.join(screensDir, name), 'utf8');
}

// ── manage-data.tsx ──
describe('R4C-Tab4: manage-data.tsx', () => {
  const src = readScreen('manage-data.tsx');

  test('no dead Skeleton import', () => {
    expect(src).not.toMatch(/import.*Skeleton.*from.*Skeleton/);
  });

  test('imports RTL utilities', () => {
    expect(src).toContain('rtlFlexRow');
    expect(src).toContain('rtlTextAlign');
  });

  test('imports useContextualHaptic', () => {
    expect(src).toContain('useContextualHaptic');
  });

  test('haptic on delete account', () => {
    expect(src).toContain('haptic.error()');
  });

  test('no hardcoded colors.dark.bg in static styles', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    expect(stylesSection).not.toContain('colors.dark.bg');
  });

  test('no hardcoded colors.text.* in static styles', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    expect(stylesSection).not.toContain('colors.text.primary');
    expect(stylesSection).not.toContain('colors.text.tertiary');
  });

  test('ActionRow has accessibilityState for disabled', () => {
    expect(src).toContain('accessibilityState={{ disabled: !!loading }}');
  });

  test('handleClearSearchHistory has try/catch', () => {
    const clearSection = src.slice(src.indexOf('handleClearSearchHistory'));
    expect(clearSection).toContain('try {');
    expect(clearSection).toContain('catch');
  });

  test('navigates after signOut', () => {
    expect(src).toContain("router.replace('/')");
  });

  test('RTL applied to rows', () => {
    expect(src).toContain('rtlFlexRow(isRTL)');
    expect(src).toContain('rtlTextAlign(isRTL)');
  });
});

// ── marketplace.tsx ──
describe('R4C-Tab4: marketplace.tsx', () => {
  const src = readScreen('marketplace.tsx');

  test('search is debounced', () => {
    expect(src).toContain('debouncedSearchQuery');
    expect(src).toContain('setTimeout(() => setDebouncedSearchQuery');
  });

  test('query uses debounced value not raw searchQuery', () => {
    const querySection = src.slice(src.indexOf('queryKey:'), src.indexOf('queryKey:') + 200);
    expect(querySection).toContain('debouncedSearchQuery');
    expect(querySection).not.toContain(', searchQuery]');
  });

  test('has staleTime on query', () => {
    expect(src).toContain('staleTime: 30_000');
  });

  test('animation delay is capped', () => {
    expect(src).toContain('Math.min(index, 10)');
  });

  test('no hardcoded colors.dark.* in static styles', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    expect(stylesSection).not.toContain('colors.dark.bg');
    expect(stylesSection).not.toContain('colors.dark.bgCard');
    expect(stylesSection).not.toContain('colors.dark.border');
    expect(stylesSection).not.toContain('colors.dark.surface');
  });

  test('badge text uses theme token not hardcoded white', () => {
    expect(src).toContain('colors.text.onColor');
    const stylesSection = src.slice(src.indexOf('badgeText'));
    expect(stylesSection).not.toContain("'#FFFFFF'");
  });

  test('RTL support on search and product rows', () => {
    expect(src).toContain('rtlFlexRow(isRTL)');
  });

  test('chip text color is theme-aware', () => {
    expect(src).toContain('selectedCategory === cat.key ? colors.emerald : tc.text.secondary');
  });

  test('bottom safe area inset applied', () => {
    expect(src).toContain('insets.bottom + spacing');
  });
});

// ── media-settings.tsx ──
describe('R4C-Tab4: media-settings.tsx', () => {
  const src = readScreen('media-settings.tsx');

  test('Switch thumb uses theme token not hardcoded white', () => {
    expect(src).not.toContain("thumbColor={value && !disabled ? '#FFFFFF'");
    expect(src).toContain('colors.text.onColor');
  });

  test('autoplay load has error toast in production', () => {
    expect(src).toContain("showToast({ message: t('common.somethingWentWrong')");
  });

  test('AsyncStorage save failure shows toast', () => {
    const saveSection = src.slice(src.indexOf('saveSettings'));
    expect(saveSection).toContain('showToast');
  });

  test('ambient haptic fires before state update', () => {
    // Find the ambient toggle onToggle handler
    const toggleStart = src.indexOf('setAmbientModeEnabled');
    const section = src.slice(Math.max(0, toggleStart - 200), toggleStart + 200);
    const hapticIdx = section.indexOf('haptic.tick()');
    const setIdx = section.indexOf('setAmbientMode(v)');
    expect(hapticIdx).toBeGreaterThan(-1);
    expect(hapticIdx).toBeLessThan(setIdx);
  });

  test('disabled icon uses tc.text.tertiary', () => {
    expect(src).toContain('disabled ? tc.text.tertiary : tc.text.secondary');
  });

  test('radio items have tc.text.primary color', () => {
    const radioSection = src.slice(src.indexOf("(['wifi', 'always', 'never']"));
    expect(radioSection).toContain('color: tc.text.primary');
  });

  test('no hardcoded dark colors in static styles', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    expect(stylesSection).not.toContain('colors.dark.bg');
    expect(stylesSection).not.toContain('colors.dark.bgCard');
    expect(stylesSection).not.toContain('colors.dark.border');
  });
});

// ── membership-tiers.tsx ──
describe('R4C-Tab4: membership-tiers.tsx', () => {
  const src = readScreen('membership-tiers.tsx');

  test('imports RTL utilities', () => {
    expect(src).toContain('rtlFlexRow');
  });

  test('imports KeyboardAvoidingView', () => {
    expect(src).toContain('KeyboardAvoidingView');
  });

  test('no dead star header action', () => {
    expect(src).not.toContain("onPress: () => {}");
  });

  test('borderStartWidth instead of borderLeftWidth for RTL', () => {
    expect(src).toContain('borderStartWidth');
    expect(src).not.toContain('borderLeftWidth');
  });

  test('create form has disabled state', () => {
    expect(src).toContain("disabled={!newTierName.trim() || !newTierPrice.trim()}");
  });

  test('edit button shows toast instead of being dead', () => {
    expect(src).toContain("showToast({ message: t('common.comingSoon'");
  });

  test('tier price uses i18n', () => {
    expect(src).toContain("t('monetization.perMonth'");
  });

  test('form buttons use i18n not hardcoded English', () => {
    expect(src).toContain("t('common.cancel'");
    expect(src).toContain("t('monetization.create'");
    expect(src).toContain("t('monetization.benefitsPerLine'");
  });

  test('toggle thumb uses theme-aware color', () => {
    expect(src).toContain('tier.isActive ? colors.text.onColor : tc.border');
  });

  test('revenue card stats use i18n', () => {
    expect(src).toContain("t('monetization.activeMembers'");
    expect(src).toContain("t('monetization.payoutSchedule'");
  });

  test('toggle has optimistic update with revert on failure', () => {
    const toggleSection = src.slice(src.indexOf('toggleTier'));
    expect(toggleSection).toContain('Optimistic update');
    expect(toggleSection).toContain('Revert optimistic update');
    expect(toggleSection).toContain('isActive: !tier.isActive');
  });
});

// ── mentorship.tsx ──
describe('R4C-Tab4: mentorship.tsx', () => {
  const src = readScreen('mentorship.tsx');

  test('search is debounced', () => {
    expect(src).toContain('debouncedSearchQuery');
  });

  test('has double-tap guard on mentor card', () => {
    expect(src).toContain('doubleTapRef.current');
  });

  test('no dead selectedTopic state', () => {
    expect(src).not.toContain('selectedTopic');
    expect(src).not.toContain('setSelectedTopic');
  });

  test('mentorship request differentiates 409 errors', () => {
    expect(src).toContain('status === 409');
    expect(src).toContain('duplicateRequest');
  });

  test('invalidates query after successful request', () => {
    expect(src).toContain("invalidateQueries({ queryKey: ['my-mentorships']");
  });

  test('tabs have top padding for safe area', () => {
    expect(src).toContain('marginTop: insets.top + 52');
  });

  test('uses fontFamily not raw fontWeight in styles', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    expect(stylesSection).toContain('fonts.bodySemiBold');
    expect(stylesSection).toContain('fonts.body');
  });

  test('no hardcoded dark colors in styles', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    expect(stylesSection).not.toContain('colors.dark.bg');
    expect(stylesSection).not.toContain('colors.dark.bgCard');
    expect(stylesSection).not.toContain('colors.dark.border');
  });
});

// ── orders.tsx ──
describe('R4C-Tab4: orders.tsx', () => {
  const src = readScreen('orders.tsx');

  test('has error state rendering', () => {
    expect(src).toContain('ordersQuery.isError');
    expect(src).toContain('Failed to load orders');
  });

  test('has double-tap guard', () => {
    expect(src).toContain('doubleTapRef.current');
  });

  test('has onLongPress for copying order ID', () => {
    expect(src).toContain('handleOrderLongPress');
    expect(src).toContain('Clipboard.setStringAsync');
    expect(src).toContain('onLongPress');
  });

  test('has staleTime on query', () => {
    expect(src).toContain('staleTime: 30_000');
  });

  test('animation delay is capped', () => {
    expect(src).toContain('Math.min(index, 10)');
  });

  test('RTL support on order rows', () => {
    expect(src).toContain('rtlFlexRow(isRTL)');
  });

  test('text colors use tc.text.* in createStyles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).toContain('tc.text.primary');
    expect(stylesSection).toContain('tc.text.tertiary');
    expect(stylesSection).not.toContain('colors.text.primary');
    // colors.text.tertiary should not appear in createStyles
    const createStylesOnly = stylesSection.slice(0, stylesSection.indexOf('});') + 3);
    expect(createStylesOnly).not.toContain('colors.text.tertiary');
  });
});

// ── parental-controls.tsx ──
describe('R4C-Tab4: parental-controls.tsx', () => {
  const src = readScreen('parental-controls.tsx');

  test('useEffect is before early returns (hooks rule)', () => {
    const autoVerifyIdx = src.indexOf('Auto-verify when no controls exist');
    const loadingReturnIdx = src.indexOf('if (hasControlsQuery.isLoading)');
    expect(autoVerifyIdx).toBeGreaterThan(0);
    expect(loadingReturnIdx).toBeGreaterThan(autoVerifyIdx);
  });

  test('hasControlsQuery uses separate query key', () => {
    expect(src).toContain("queryKey: ['parental-control-check']");
  });

  test('unlink has Alert confirmation dialog', () => {
    const unlinkSection = src.slice(src.indexOf('handleUnlink'));
    expect(unlinkSection).toContain('Alert.alert');
    expect(unlinkSection).toContain('confirmUnlinkTitle');
  });

  test('all mutations have onError handlers', () => {
    const mutationCount = (src.match(/onError:/g) || []).length;
    expect(mutationCount).toBeGreaterThanOrEqual(3);
  });

  test('toggle mutation has isPending guard against racing', () => {
    expect(src).toContain('if (updateMutation.isPending) return');
  });

  test('haptic on unlink and changePin', () => {
    const unlinkSection = src.slice(src.indexOf('handleUnlink'), src.indexOf('handleChangePin'));
    expect(unlinkSection).toContain('haptic.error()');
    const changePinSection = src.slice(src.indexOf('handleChangePin'));
    expect(changePinSection).toContain('haptic.tick()');
  });

  test('all text colors use tc.text.* in createStyles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.text.primary');
    expect(stylesSection).not.toContain('colors.text.secondary');
    expect(stylesSection).not.toContain('colors.text.tertiary');
  });

  test('uses fontFamily not raw fontWeight in styles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).toContain('fonts.heading');
    expect(stylesSection).toContain('fonts.bodySemiBold');
    expect(stylesSection).toContain('fonts.body');
  });
});

// ── photo-music.tsx ──
describe('R4C-Tab4: photo-music.tsx', () => {
  const src = readScreen('photo-music.tsx');

  test('double-tap guard on post', () => {
    expect(src).toContain('!postMutation.isPending');
  });

  test('audio error shows toast', () => {
    expect(src).toContain("showToast({ message: t('photoMusic.audioPlaybackFailed'");
  });

  test('responsive dimensions via useWindowDimensions hook', () => {
    expect(src).toContain('useWindowDimensions');
  });

  test('RTL on music bar and caption footer', () => {
    expect(src).toContain('rtlFlexRow(isRTL)');
  });

  test('text colors use tc in createStyles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.text.primary');
  });

  test('last image removal has confirmation dialog', () => {
    expect(src).toContain('removeLastPhotoTitle');
    expect(src).toContain('Alert.alert');
  });

  test('renderImageItem includes styles and tc in deps', () => {
    const depsLine = src.slice(src.indexOf('isPreviewPlaying, removeImage, t'));
    expect(depsLine).toContain('styles');
    expect(depsLine).toContain('tc');
  });
});

// ── pinned-messages.tsx ──
describe('R4C-Tab4: pinned-messages.tsx', () => {
  const src = readScreen('pinned-messages.tsx');

  test('unpin has confirmation dialog', () => {
    expect(src).toContain('Alert.alert');
    expect(src).toContain('confirmUnpinTitle');
  });

  test('has haptic feedback', () => {
    expect(src).toContain('useContextualHaptic');
    expect(src).toContain('haptic.tick()');
  });

  test('double-tap guard on unpin', () => {
    expect(src).toContain('if (unpinning) return');
  });

  test('animation delay is capped', () => {
    expect(src).toContain('Math.min(index, 10)');
  });

  test('text colors use tc.text.* in createStyles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).toContain('tc.text.primary');
    expect(stylesSection).toContain('tc.text.secondary');
    expect(stylesSection).toContain('tc.text.tertiary');
  });

  test('uses fontFamily in styles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).toContain('fonts.bodySemiBold');
    expect(stylesSection).toContain('fonts.body');
  });
});

// ── playlist/[id].tsx ──
describe('R4C-Tab4: playlist/[id].tsx', () => {
  const src = readScreen('playlist/[id].tsx');

  test('uses ProgressiveImage for video thumbnails', () => {
    expect(src).toContain('<ProgressiveImage');
    // Should not use raw <Image for video thumbnails
    const renderSection = src.slice(src.indexOf('renderItem'));
    expect(renderSection).not.toMatch(/<Image\s+source/);
  });

  test('no hardcoded dark.bg in styles', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    expect(stylesSection).not.toContain('colors.dark.bg');
  });

  test('has staleTime on queries', () => {
    const matches = src.match(/staleTime: 30_000/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  test('animation delay capped', () => {
    expect(src).toContain('Math.min(index, 10)');
  });

  test('double-tap guard on video press', () => {
    expect(src).toContain('doubleTapRef.current');
  });

  test('ListHeader is memoized', () => {
    expect(src).toContain('useMemo(() =>');
  });

  test('uses fontFamily not fontWeight in styles', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    expect(stylesSection).toContain('fonts.heading');
    expect(stylesSection).toContain('fonts.bodyMedium');
    expect(stylesSection).toContain('fonts.bodySemiBold');
  });

  test('RTL support on video rows and play actions', () => {
    expect(src).toContain('rtlFlexRow(isRTL)');
  });

  test('spacing token used instead of raw pixel values', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    expect(stylesSection).not.toMatch(/paddingHorizontal: 4[,\s]/);
  });

  test('play button text uses theme token', () => {
    expect(src).toContain('colors.text.onColor');
  });
});
