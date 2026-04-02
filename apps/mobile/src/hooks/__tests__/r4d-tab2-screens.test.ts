/**
 * R4D-Tab2 Screen Tests
 * Covers: local-boards, leaderboard, streaks, surah-browser, tafsir-viewer,
 * islamic-calendar, link-child-account, story-viewer, storage-management, live/[id]
 */
import * as fs from 'fs';
import * as path from 'path';

const SCREENS_DIR = path.resolve(__dirname, '../../../app/(screens)');

function readScreen(name: string): string {
  return fs.readFileSync(path.join(SCREENS_DIR, `${name}.tsx`), 'utf-8');
}

// ── local-boards.tsx ──

describe('local-boards', () => {
  const src = readScreen('local-boards');

  test('uses fonts.* not fontWeight in stylesheet', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    expect(stylesSection).not.toContain("fontWeight:");
  });

  test('removes colors.dark.bg from stylesheet', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    expect(stylesSection).not.toContain('colors.dark.bg');
  });

  test('imports rtlFlexRow for RTL support', () => {
    expect(src).toContain("import { rtlFlexRow }");
  });

  test('applies RTL flex to boardHeader and stats', () => {
    expect(src).toContain('rtlFlexRow(isRTL)');
  });

  test('has double-tap guard on board press', () => {
    expect(src).toContain('isNavigatingRef.current');
  });

  test('has error state rendering', () => {
    expect(src).toContain('boardsQuery.isError');
    expect(src).toContain("icon=\"alert-circle\"");
  });

  test('animation delay capped', () => {
    expect(src).toContain('Math.min(index * 60, 600)');
  });

  test('keyboard dismiss on scroll', () => {
    expect(src).toContain('keyboardDismissMode="on-drag"');
  });

  test('has press feedback on board cards', () => {
    expect(src).toContain('pressed && { opacity: 0.7 }');
  });

  test('has android ripple', () => {
    expect(src).toContain('android_ripple');
  });
});

// ── leaderboard.tsx ──

describe('leaderboard', () => {
  const src = readScreen('leaderboard');

  test('removes colors.dark.bg from container style', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    expect(stylesSection).not.toContain('colors.dark.bg');
  });

  test('medal badge no longer has hardcoded borderColor', () => {
    const medalSection = src.slice(src.indexOf('medalBadge:'));
    const endIdx = medalSection.indexOf('},');
    const badge = medalSection.slice(0, endIdx);
    expect(badge).not.toContain("borderColor: colors.dark.bg");
  });

  test('PodiumCard has double-tap guard', () => {
    const podiumSection = src.slice(src.indexOf('function PodiumCard'));
    expect(podiumSection).toContain('isNavigatingRef');
  });

  test('LeaderboardRow has double-tap guard', () => {
    const rowSection = src.slice(src.indexOf('function LeaderboardRow'));
    expect(rowSection).toContain('isNavigatingRef');
  });

  test('tab label uses tc.text.secondary inline', () => {
    expect(src).toContain("{ color: tc.text.secondary }");
  });

  test('uses RTL flex in tab row', () => {
    expect(src).toContain('rtlFlexRow(isRTL)');
  });
});

// ── streaks.tsx ──

describe('streaks', () => {
  const src = readScreen('streaks');

  test('uses tc.text.* not colors.text.* in createStyles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.text.primary');
    expect(stylesSection).not.toContain('colors.text.secondary');
    expect(stylesSection).not.toContain('colors.text.tertiary');
  });

  test('has error state handling for isError', () => {
    expect(src).toContain('isError ?');
    expect(src).toContain("icon=\"alert-circle\"");
  });

  test('uses useSafeAreaInsets for paddingTop', () => {
    expect(src).toContain('useSafeAreaInsets');
    expect(src).toContain('insets.top + 60');
  });

  test('paddingBottom includes insets.bottom', () => {
    expect(src).toContain('insets.bottom');
  });

  test('has staleTime set', () => {
    expect(src).toContain('staleTime');
  });
});

// ── surah-browser.tsx ──

describe('surah-browser', () => {
  const src = readScreen('surah-browser');

  test('imports rtlFlexRow', () => {
    expect(src).toContain('rtlFlexRow');
  });

  test('surah row uses RTL flex direction', () => {
    expect(src).toContain('flexDirection: rtlFlexRow(isRTL)');
  });

  test('uses borderRadius token for surahNumber', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    expect(stylesSection).not.toContain('borderRadius: 20');
  });

  test('has error state rendering', () => {
    expect(src).toContain('surahsQuery.isError');
  });

  test('double-tap guard on surah press', () => {
    expect(src).toContain('isNavigatingRef.current');
  });

  test('uses isRefetching from query instead of manual state', () => {
    expect(src).toContain('surahsQuery.isRefetching');
    expect(src).not.toContain('setRefreshing');
  });

  test('wudu reminder uses RTL flex', () => {
    expect(src).toContain("flexDirection: rtlFlexRow(isRTL), alignItems: 'center', gap: spacing.sm, margin: spacing.sm");
  });

  test('search container uses RTL', () => {
    expect(src).toContain("flexDirection: rtlFlexRow(isRTL) }]");
  });

  test('uses i18n for revelation type', () => {
    expect(src).toContain("t('quran.meccan')");
    expect(src).toContain("t('quran.medinan')");
  });
});

// ── tafsir-viewer.tsx ──

describe('tafsir-viewer', () => {
  const src = readScreen('tafsir-viewer');

  test('uses tc.text.* not colors.text.* in createStyles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain("color: colors.text.primary");
    expect(stylesSection).not.toContain("color: colors.text.secondary");
    expect(stylesSection).not.toContain("color: colors.text.tertiary");
  });

  test('imports useContextualHaptic', () => {
    expect(src).toContain("import { useContextualHaptic }");
  });

  test('haptic on share', () => {
    expect(src).toContain('haptic.tick()');
  });

  test('share double-tap guard', () => {
    expect(src).toContain('shareGuardRef.current');
  });

  test('uses fontFamily tokens not fontWeight', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain("fontWeight:");
  });

  test('uses safe area for paddingTop', () => {
    expect(src).toContain('insets.top + 60');
  });

  test('has staleTime for tafsir data', () => {
    expect(src).toContain('staleTime: 1000 * 60 * 60');
  });

  test('filter bar uses RTL flex', () => {
    expect(src).toContain("rtlFlexRow(isRTL)");
  });
});

// ── islamic-calendar.tsx ──

describe('islamic-calendar', () => {
  const src = readScreen('islamic-calendar');

  test('removes colors.dark.bg from stylesheet', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    expect(stylesSection).not.toContain("backgroundColor: colors.dark.bg");
  });

  test('imports useContextualHaptic', () => {
    expect(src).toContain("import { useContextualHaptic }");
  });

  test('month navigation has haptic', () => {
    const prevSection = src.slice(src.indexOf('handlePrevMonth'));
    expect(prevSection.slice(0, 200)).toContain('haptic.tick()');
  });

  test('imports rtlFlexRow', () => {
    expect(src).toContain("import { rtlFlexRow }");
  });

  test('weekday header uses RTL flex', () => {
    expect(src).toContain("styles.weekdayHeader, { flexDirection: rtlFlexRow(isRTL) }");
  });

  test('calendar grid flips for RTL', () => {
    expect(src).toContain("isRTL ? 'row-reverse' : 'row'");
  });

  test('quick links use RTL flex', () => {
    expect(src).toContain("styles.quickLinks, { flexDirection: rtlFlexRow(isRTL) }");
  });

  test('uses fontFamily tokens not fontWeight in stylesheet', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    const fontWeightMatches = stylesSection.match(/fontWeight:/g) || [];
    // dayText and currentHijriSub don't have fontFamily since they don't need custom fonts
    // Allow at most a couple
    expect(fontWeightMatches.length).toBeLessThanOrEqual(2);
  });

  test('quick link presses have haptic.navigate', () => {
    expect(src).toContain('haptic.navigate()');
  });

  test('community event press has haptic', () => {
    const communitySection = src.slice(src.indexOf('communityEvents.map'));
    expect(communitySection.slice(0, 300)).toContain('haptic.navigate()');
  });
});

// ── link-child-account.tsx ──

describe('link-child-account', () => {
  const src = readScreen('link-child-account');

  test('removes colors.dark.* from stylesheet', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    expect(stylesSection).not.toContain('colors.dark.');
  });

  test('uses debounced search', () => {
    expect(src).toContain('debouncedSearch');
    expect(src).toContain('debounceRef');
  });

  test('uses fontFamily not fontWeight in stylesheet', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    expect(stylesSection).not.toContain("fontWeight:");
  });

  test('confirm step has haptic', () => {
    const confirmSection = src.slice(src.indexOf('handleConfirm'));
    expect(confirmSection.slice(0, 100)).toContain('haptic.tick()');
  });

  test('has error state for search', () => {
    expect(src).toContain('searchResults.isError');
  });

  test('imports fonts from theme', () => {
    expect(src).toContain("fonts }");
  });
});

// ── storage-management.tsx ──

describe('storage-management', () => {
  const src = readScreen('storage-management');

  test('uses tc.text.* not colors.text.* in createStyles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain("color: colors.text.primary");
    expect(stylesSection).not.toContain("color: colors.text.secondary");
    expect(stylesSection).not.toContain("color: colors.text.tertiary");
  });

  test('category clear uses haptic.delete not haptic.tick', () => {
    const clearSection = src.slice(src.indexOf('const handleClear'));
    expect(clearSection.slice(0, 100)).toContain('haptic.delete()');
  });

  test('error feedback on loadSizes failure', () => {
    expect(src).toContain('showToast');
    expect(src).toContain('storage.loadError');
  });

  test('clear button has press feedback', () => {
    expect(src).toContain('pressed && { opacity: 0.7 }');
  });
});

// ── story-viewer.tsx ──

describe('story-viewer', () => {
  const src = readScreen('story-viewer');

  test('imports fonts from theme', () => {
    expect(src).toContain("fonts }");
  });

  test('uses fontFamily not fontWeight in styles', () => {
    const stylesSection = src.slice(src.indexOf('const styles'));
    expect(stylesSection).not.toContain("fontWeight: '700'");
    expect(stylesSection).not.toContain("fontWeight: '600'");
  });

  test('haptic on tap navigation', () => {
    const tapLeftSection = src.slice(src.indexOf('handleTapLeft'));
    expect(tapLeftSection.slice(0, 200)).toContain('haptic.tick()');
  });

  test('close button uses #fff not colors.text.primary', () => {
    expect(src).toContain('color="#fff"');
    // For the close button specifically
    expect(src).not.toContain('color={colors.text.primary}');
  });

  test('keyboard avoiding has behavior on Android', () => {
    expect(src).toContain("'height'");
  });
});

// ── live/[id].tsx ──

describe('live/[id]', () => {
  const src = fs.readFileSync(path.join(SCREENS_DIR, 'live/[id].tsx'), 'utf-8');

  test('imports useContextualHaptic', () => {
    expect(src).toContain("import { useContextualHaptic }");
  });

  test('imports fonts from theme', () => {
    expect(src).toContain("fonts }");
  });

  test('haptic on raise hand', () => {
    const raiseSection = src.slice(src.indexOf('handleRaiseHand'));
    expect(raiseSection.slice(0, 200)).toContain('haptic.tick()');
  });

  test('haptic on share', () => {
    const shareSection = src.slice(src.indexOf('handleShare'));
    expect(shareSection.slice(0, 200)).toContain('haptic.tick()');
  });

  test('haptic on reactions', () => {
    const reactionSection = src.slice(src.indexOf('addFloatingReaction'));
    expect(reactionSection.slice(0, 200)).toContain('haptic.tick()');
  });

  test('imports rtlFlexRow', () => {
    expect(src).toContain("import { rtlFlexRow }");
  });

  test('overlay action row uses RTL flex', () => {
    expect(src).toContain("styles.overlayActionRow, { flexDirection: rtlFlexRow(isRTL) }");
  });

  test('participant item uses RTL flex', () => {
    expect(src).toContain("styles.participantItem, { flexDirection: rtlFlexRow(isRTL) }");
  });

  test('uses fontFamily not fontWeight in createStyles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain("fontWeight: '700'");
    expect(stylesSection).not.toContain("fontWeight: '600'");
    expect(stylesSection).not.toContain("fontWeight: '500'");
  });

  test('uses tc.text.primary not colors.text.primary in createStyles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    // Exclude brand colors like colors.emerald, colors.gold, colors.error — only check colors.text.*
    const textPrimaryCount = (stylesSection.match(/colors\.text\.primary/g) || []).length;
    expect(textPrimaryCount).toBe(0);
  });

  test('send chat has double-tap guard', () => {
    expect(src).toContain('!sendChatMutation.isPending');
  });

  test('remove participant has success feedback', () => {
    expect(src).toContain("haptic.success()");
    expect(src).toContain("participantRemoved");
  });
});
