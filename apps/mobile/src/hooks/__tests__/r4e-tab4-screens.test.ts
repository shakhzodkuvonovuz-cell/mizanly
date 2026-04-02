/**
 * R4E-Tab4 Screen Tests
 * Covers 20 screens across D19, D28, D29, D30:
 * green-screen-editor, hadith, hajj-companion, hajj-step, halal-finder,
 * product-detail, profile/[username], profile-customization, qibla-compass, qr-code,
 * qr-scanner, quiet-mode, quran-reading-plan, quran-room, quran-share,
 * ramadan-mode, reel/[id], reel-remix, reel-templates, report
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

// ── D19: green-screen-editor.tsx ──

describe('green-screen-editor', () => {
  const src = readScreen('green-screen-editor');

  test('no dead audioPermission state', () => {
    expect(src).not.toMatch(/\baudioPermission\b.*useState/);
  });

  test('recording guard ref prevents double-tap', () => {
    expect(src).toContain('recordingGuard');
    expect(src).toContain('recordingGuard.current');
  });

  test('error toast on recording failure', () => {
    expect(src).toContain("variant: 'error'");
    expect(src).toContain('haptic.error()');
  });

  test('haptic on bottom bar buttons', () => {
    expect(src).toContain('haptic.tick(); router.back()');
    expect(src).toContain('haptic.navigate(); navigate');
  });

  test('bottom bar uses safe area insets', () => {
    expect(src).toContain('useSafeAreaInsets');
    expect(src).toContain('insets.bottom');
  });

  test('text colors overridden inline with tc.text', () => {
    expect(src).toContain('color: tc.text.primary');
    expect(src).toContain('color: tc.text.secondary');
    expect(src).toContain('color: tc.text.tertiary');
  });
});

// ── D19: hadith.tsx ──

describe('hadith', () => {
  const src = readScreen('hadith');

  test('listHadiths data unwrapping extracts .data from response', () => {
    expect(src).toContain('listResp as { data?:');
    expect(src).toContain('?.data ?? []');
  });

  test('bookmark guard prevents double-tap', () => {
    expect(src).toContain('bookmarkGuard');
    expect(src).toContain('bookmarkGuard.current');
  });

  test('bookmarkedIds rollback on failure', () => {
    expect(src).toContain('wasBookmarked');
    // Rollback must update bookmarkedIds too
    expect(src).toMatch(/setBookmarkedIds.*wasBookmarked/s);
  });

  test('RTL applied to actionRow', () => {
    expect(src).toContain('rtlFlexRow');
  });

  test('scroll to top on selectHadith', () => {
    expect(src).toContain('scrollToOffset');
  });
});

// ── D19: hajj-companion.tsx ──

describe('hajj-companion', () => {
  const src = readScreen('hajj-companion');

  test('has useContextualHaptic', () => {
    expect(src).toContain('useContextualHaptic');
  });

  test('createMutation has onError', () => {
    expect(src).toMatch(/createMutation.*onError/s);
  });

  test('resetMutation has onError', () => {
    expect(src).toMatch(/resetMutation.*onError/s);
  });

  test('Start Tracker button has disabled state', () => {
    expect(src).toContain('createMutation.isPending');
    expect(src).toContain('disabled={createMutation.isPending}');
  });

  test('timeline uses RTL-safe start instead of left', () => {
    expect(src).toContain('start: 23');
    expect(src).not.toContain('left: 23');
  });

  test('reset has double-confirmation with Alert.alert', () => {
    expect(src).toContain('Alert.alert');
    expect(src).toContain('resetConfirmTitle');
  });
});

// ── D19: hajj-step.tsx ──

describe('hajj-step', () => {
  const src = readScreen('hajj-step');

  test('updateMutation has onError', () => {
    expect(src).toMatch(/updateMutation.*onError/s);
  });

  test('haptic on checklist toggle', () => {
    expect(src).toContain('haptic.tick(); toggleCheckItem');
  });

  test('haptic on dua expand', () => {
    expect(src).toContain('haptic.tick()');
    expect(src).toContain('setExpandedDua');
  });

  test('mark complete button has disabled state', () => {
    expect(src).toContain('disabled={updateMutation.isPending}');
  });

  test('success toast on step complete', () => {
    expect(src).toContain('stepCompleted');
    expect(src).toContain("variant: 'success'");
  });

  test('RTL import and checkItem uses rtlFlexRow', () => {
    expect(src).toContain('rtlFlexRow');
    expect(src).toContain('isRTL');
  });
});

// ── D19: halal-finder.tsx ──

describe('halal-finder', () => {
  const src = readScreen('halal-finder');

  test('rating field matches API (rating not averageRating)', () => {
    expect(src).not.toContain('averageRating');
    expect(src).toContain('rating?:');
  });

  test('verificationCount used instead of isVerified boolean', () => {
    expect(src).toContain('verificationCount');
    expect(src).not.toMatch(/isVerified:\s*boolean/);
  });

  test('useMemo deps includes tc', () => {
    expect(src).toContain('selectedCuisine, haptic, tc');
  });
});

// ── D28: product-detail.tsx ──

describe('product-detail', () => {
  const src = readScreen('product-detail');
  const styles = getStylesSection(src);

  test('uses createStyles with tc', () => {
    expect(src).toContain('createStyles(tc)');
  });

  test('View All Reviews has onPress', () => {
    expect(src).toContain('product-reviews');
  });

  test('orderMutation has onError handler', () => {
    expect(src).toMatch(/orderMutation.*onError/s);
  });

  test('buy button has disabled state', () => {
    expect(src).toContain('disabled={orderMutation.isPending}');
  });

  test('ratingRow uses spacing token not raw pixels', () => {
    expect(styles).toContain('gap: spacing.xs');
  });
});

// ── D28: profile/[username].tsx ──

describe('profile/[username]', () => {
  const src = fs.readFileSync(path.join(SCREENS_DIR, 'profile/[username].tsx'), 'utf-8');
  const styles = getStylesSection(src);

  test('no colors.text.primary in createStyles', () => {
    expect(styles).not.toContain('colors.text.primary');
  });

  test('no colors.text.tertiary in createStyles', () => {
    expect(styles).not.toContain('colors.text.tertiary');
  });

  test('uses fonts.bodyBold not raw fontWeight 700 in styles', () => {
    expect(styles).not.toMatch(/fontWeight:\s*'700'/);
  });

  test('uses tc.text.primary for theme-aware text', () => {
    expect(styles).toContain('tc.text.primary');
  });

  test('blockMutation has onError', () => {
    expect(src).toMatch(/blockMutation.*onError/s);
  });

  test('muteMutation has onError', () => {
    expect(src).toMatch(/muteMutation.*onError/s);
  });

  test('collaborator badge uses spacing tokens not raw pixels', () => {
    expect(src).toContain('top: spacing.xs');
    expect(src).toContain('end: spacing.xs');
  });

  test('highlight press error shows toast', () => {
    expect(src).not.toContain('silently ignore');
  });

  test('createDM catch shows error toast', () => {
    const dmSection = src.slice(src.indexOf('messagesApi.createDM'));
    expect(dmSection).toContain('showToast');
  });
});

// ── D28: profile-customization.tsx ──

describe('profile-customization', () => {
  const src = readScreen('profile-customization');
  const styles = getStylesSection(src);

  test('sectionLabel uses tc.text.secondary', () => {
    expect(styles).toContain('tc.text.secondary');
  });

  test('toggleLabel uses tc.text.primary', () => {
    expect(styles).toContain('tc.text.primary');
  });

  test('divider uses tc.border not rgba', () => {
    expect(styles).not.toMatch(/divider.*rgba\(45/s);
  });
});

// ── D28: qibla-compass.tsx ──

describe('qibla-compass', () => {
  const src = readScreen('qibla-compass');

  test('main view uses SafeAreaView', () => {
    expect(src).toMatch(/SafeAreaView.*edges.*top.*accessibilityLabel/s);
  });

  test('cardinalLabel uses tc.text not colors.text', () => {
    const styles = getStylesSection(src);
    expect(styles).not.toContain("color: colors.text.secondary");
    expect(styles).toContain('tc.text.secondary');
  });

  test('uses fonts.bodyBold for cardinalLabel', () => {
    const styles = getStylesSection(src);
    expect(styles).toContain('fonts.bodyBold');
  });
});

// ── D28: qr-code.tsx ──

describe('qr-code', () => {
  const src = readScreen('qr-code');

  test('no fake setTimeout loading', () => {
    expect(src).not.toContain('setTimeout(() => setIsLoading');
  });

  test('title uses tc.text.primary', () => {
    const styles = getStylesSection(src);
    expect(styles).toContain('tc.text.primary');
  });

  test('uses fonts.bodyBold for title', () => {
    const styles = getStylesSection(src);
    expect(styles).toContain('fonts.bodyBold');
  });
});

// ── D29: qr-scanner.tsx ──

describe('qr-scanner', () => {
  const src = readScreen('qr-scanner');

  test('uses showToast not Alert.alert for invalid QR', () => {
    expect(src).toContain('showToast');
    // Should not use Alert.alert for invalid QR (the only Alert.alert should be for permission)
    const afterScan = src.slice(src.indexOf('handleBarCodeScanned'));
    const scanSection = afterScan.slice(0, afterScan.indexOf('if (!permission)'));
    expect(scanSection).not.toContain('Alert.alert');
  });

  test('has haptic on scan', () => {
    expect(src).toContain('haptic.success()');
    expect(src).toContain('haptic.error()');
  });
});

// ── D29: quiet-mode.tsx ──

describe('quiet-mode', () => {
  const src = readScreen('quiet-mode');

  test('mutation has onError callback', () => {
    expect(src).toMatch(/mutation.*onError/s);
  });

  test('mutation has success toast', () => {
    expect(src).toContain("variant: 'success'");
  });

  test('theme colors use tc.text.primary', () => {
    const styles = getStylesSection(src);
    expect(styles).not.toContain('colors.text.primary');
    expect(styles).toContain('tc.text.primary');
  });

  test('has entrance animations', () => {
    expect(src).toContain('FadeInUp');
    expect(src).toContain('Animated');
  });
});

// ── D29: quran-reading-plan.tsx ──

describe('quran-reading-plan', () => {
  const src = readScreen('quran-reading-plan');

  test('all 3 mutations have onError', () => {
    const matches = src.match(/onError:/g);
    expect(matches?.length).toBeGreaterThanOrEqual(3);
  });

  test('showToast imported', () => {
    expect(src).toContain('showToast');
  });

  test('sectionTitle uses tc.text.primary', () => {
    const styles = getStylesSection(src);
    expect(styles).toMatch(/sectionTitle.*tc\.text\.primary/s);
  });

  test('handleCreatePlan has isPending guard', () => {
    expect(src).toContain('createMutation.isPending');
  });
});

// ── D29: quran-room.tsx ──

describe('quran-room', () => {
  const src = readScreen('quran-room');

  test('SafeAreaView imported and used', () => {
    expect(src).toContain("import { SafeAreaView }");
    expect(src).toContain('<SafeAreaView');
  });

  test('no plain View as container wrapper in returns', () => {
    // The main container should be SafeAreaView, not View
    expect(src).not.toMatch(/<View style={styles\.container}>/);
  });

  test('translationText uses tc.text.secondary', () => {
    const styles = getStylesSection(src);
    expect(styles).toMatch(/translationText.*tc\.text\.secondary/s);
  });
});

// ── D29: quran-share.tsx ──

describe('quran-share', () => {
  const src = readScreen('quran-share');

  test('SafeAreaView used in all return branches', () => {
    const safeAreaCount = (src.match(/<SafeAreaView/g) || []).length;
    expect(safeAreaCount).toBeGreaterThanOrEqual(3);
  });

  test('surahNumber uses tc.text.primary', () => {
    const styles = getStylesSection(src);
    expect(styles).toMatch(/surahNumber.*tc\.text\.primary/s);
  });

  test('verseTranslation uses tc.text.secondary', () => {
    const styles = getStylesSection(src);
    expect(styles).toMatch(/verseTranslation.*tc\.text\.secondary/s);
  });

  test('has useContextualHaptic', () => {
    expect(src).toContain('useContextualHaptic');
  });
});

// ── D30: ramadan-mode.tsx ──

describe('ramadan-mode', () => {
  const src = readScreen('ramadan-mode');
  const styles = getStylesSection(src);

  test('no colors.text.primary in createStyles', () => {
    expect(styles).not.toContain('colors.text.primary');
  });

  test('toggleGoal has error rollback', () => {
    expect(src).toContain('completeDailyTask');
    expect(src).toMatch(/completeDailyTask.*catch.*setGoals/s);
  });

  test('showToast on goal error', () => {
    expect(src).toContain('showToast');
  });

  test('schedule uses prayerTimesQuery data when available', () => {
    expect(src).toContain('prayerTimesQuery.data');
    expect(src).toMatch(/schedule.*useMemo/s);
    expect(src).toContain('schedule.map');
  });

  test('no dead handleDhikrPress function', () => {
    expect(src).not.toContain('handleDhikrPress');
  });
});

// ── D30: reel/[id].tsx ──

describe('reel/[id]', () => {
  const src = fs.readFileSync(path.join(SCREENS_DIR, 'reel/[id].tsx'), 'utf-8');

  test('remix navigation uses originalReelId param', () => {
    expect(src).toContain('originalReelId');
    expect(src).not.toMatch(/navigate.*reel-remix.*\breelId\b/);
  });

  test('RTL: marginStart instead of marginLeft on reelUserInfo', () => {
    const styles = getStylesSection(src);
    expect(styles).toMatch(/reelUserInfo.*marginStart/s);
    expect(styles).not.toMatch(/reelUserInfo.*marginLeft/s);
  });

  test('comment section uses tc.text.primary', () => {
    const styles = getStylesSection(src);
    expect(styles).toMatch(/commentUser.*tc\.text\.primary/s);
    expect(styles).toMatch(/commentText.*tc\.text\.primary/s);
  });

  test('fonts import present', () => {
    expect(src).toContain("fonts } from '@/theme'");
  });
});

// ── D30: reel-remix.tsx ──

describe('reel-remix', () => {
  const src = readScreen('reel-remix');
  const styles = getStylesSection(src);

  test('originalCreatorName uses tc.text.primary', () => {
    expect(styles).toMatch(/originalCreatorName.*tc\.text\.primary/s);
  });

  test('captionInput uses tc.text.primary', () => {
    expect(styles).toMatch(/captionInput.*tc\.text\.primary/s);
  });

  test('destructive discard has haptic', () => {
    expect(src).toMatch(/discardRecording.*haptic\.delete/s);
  });

  test('handleBack with unsaved has haptic', () => {
    expect(src).toMatch(/handleBack.*haptic\.delete/s);
  });

  test('onRefresh awaits invalidateQueries', () => {
    expect(src).toContain('await queryClient.invalidateQueries');
  });
});

// ── D30: reel-templates.tsx ──

describe('reel-templates', () => {
  const src = readScreen('reel-templates');
  const styles = getStylesSection(src);

  test('cardName uses tc.text.primary', () => {
    expect(styles).toMatch(/cardName.*tc\.text\.primary/s);
  });

  test('no colors.text in styles', () => {
    expect(styles).not.toContain('colors.text.primary');
    expect(styles).not.toContain('colors.text.secondary');
    expect(styles).not.toContain('colors.text.tertiary');
  });
});

// ── D30: report.tsx ──

describe('report', () => {
  const src = readScreen('report');
  const styles = getStylesSection(src);

  test('has useContextualHaptic', () => {
    expect(src).toContain('useContextualHaptic');
  });

  test('prompt uses tc.text.primary', () => {
    expect(styles).toMatch(/prompt.*tc\.text\.primary/s);
  });

  test('reasonLabel uses tc.text.primary', () => {
    expect(styles).toMatch(/reasonLabel.*tc\.text\.primary/s);
  });

  test('fonts imported', () => {
    expect(src).toContain("fonts } from '@/theme'");
  });

  test('submit has haptic', () => {
    expect(src).toContain('haptic.send()');
  });

  test('disabled submit shows error toast', () => {
    expect(src).toContain('selectReason');
    expect(src).toMatch(/!selectedReason.*haptic\.error/s);
  });

  test('reason selection has haptic', () => {
    expect(src).toContain('haptic.tick(); setSelectedReason');
  });
});
