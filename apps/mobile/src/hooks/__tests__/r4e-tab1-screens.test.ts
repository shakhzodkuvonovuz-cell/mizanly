/**
 * R4E-Tab1 Screen Tests
 * Covers: donate, downloads, drafts, dua-collection, duet-create,
 * waqf, watch-history, watch-party, whats-new, why-showing,
 * _layout, wind-down, xp-history, zakat-calculator
 */
import * as fs from 'fs';
import * as path from 'path';

const SCREENS_DIR = path.resolve(__dirname, '../../../app/(screens)');
const I18N_DIR = path.resolve(__dirname, '../../i18n');

function readScreen(name: string): string {
  return fs.readFileSync(path.join(SCREENS_DIR, `${name}.tsx`), 'utf-8');
}

function getStylesSection(src: string): string {
  const stylesIdx = src.lastIndexOf('StyleSheet.create');
  if (stylesIdx < 0) {
    const createIdx = src.lastIndexOf('createStyles');
    return createIdx >= 0 ? src.slice(createIdx) : '';
  }
  return src.slice(stylesIdx);
}

function readI18n(lang: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(I18N_DIR, `${lang}.json`), 'utf-8'));
}

// ── donate.tsx ──

describe('donate', () => {
  const src = readScreen('donate');
  const styles = getStylesSection(src);

  test('uses SafeAreaView', () => {
    expect(src).toContain('SafeAreaView');
  });

  test('payment flow: donateMutation after PI guard', () => {
    const piIdx = src.indexOf('createPaymentIntent');
    const mutateIdx = src.indexOf('donateMutation.mutateAsync');
    expect(piIdx).toBeGreaterThan(-1);
    expect(mutateIdx).toBeGreaterThan(piIdx);
    expect(src).toContain('if (!paymentResult)');
  });

  test('double-tap guard: isProcessingRef', () => {
    expect(src).toContain('isProcessingRef.current');
  });

  test('donateMutation has onError handler', () => {
    const donateBlock = src.slice(src.indexOf('donateMutation = useMutation'), src.indexOf('donateMutation = useMutation') + 500);
    expect(donateBlock).toContain('onError');
  });

  test('haptic on preset press', () => {
    expect(src).toContain('handlePresetPress');
    const fnBlock = src.slice(src.indexOf('handlePresetPress'), src.indexOf('handlePresetPress') + 200);
    expect(fnBlock).toContain('haptic.tick()');
  });

  test('haptic on currency selection', () => {
    expect(src).toContain("haptic.tick(); setCurrency(cur)");
  });

  test('RTL support: rtlFlexRow imported and used', () => {
    expect(src).toContain("import { rtlFlexRow }");
    expect(src).toContain('rtlFlexRow(isRTL)');
  });

  test('error state for donations query', () => {
    expect(src).toContain('donationsQuery.isError');
  });

  test('ListHeader is memoized (useMemo)', () => {
    expect(src).toContain('listHeader = useMemo');
  });

  test('no fontWeight + fontFamily conflict on goldenBannerText', () => {
    expect(styles).not.toMatch(/goldenBannerText[\s\S]*?fontWeight.*fontFamily/);
    expect(src).toContain('fonts.bodySemiBold');
  });
});

// ── downloads.tsx ──

describe('downloads', () => {
  const src = readScreen('downloads');

  test('deleteMutation has onSuccess toast', () => {
    const block = src.slice(src.indexOf('deleteMutation = useMutation'), src.indexOf('deleteMutation = useMutation') + 600);
    expect(block).toContain('showToast');
    expect(block).toContain('onError');
  });

  test('uses insets for header spacing, not hardcoded 100', () => {
    expect(src).toContain('insets.top + 56');
  });

  test('no duplicate viewOriginal action (removed)', () => {
    expect(src).not.toContain('viewOriginal');
  });

  test('refresh uses query state, not manual useState', () => {
    expect(src).toContain('isRefreshing');
    expect(src).not.toContain("setRefreshing(true);\n    await");
  });

  test('RTL imported', () => {
    expect(src).toContain("import { rtlFlexRow }");
  });
});

// ── drafts.tsx ──

describe('drafts', () => {
  const src = readScreen('drafts');

  test('useContextualHaptic imported and used', () => {
    expect(src).toContain('useContextualHaptic');
    expect(src).toContain('haptic.tick()');
    expect(src).toContain('haptic.delete()');
    expect(src).toContain('haptic.success()');
  });

  test('showToast imported and used for delete feedback', () => {
    expect(src).toContain("import { showToast }");
    expect(src).toContain('showToast');
  });

  test('double-tap guard on handleOpen', () => {
    expect(src).toContain('isNavigatingRef.current');
  });

  test('animation delay capped', () => {
    expect(src).toContain('Math.min(index * 50, 500)');
  });

  test('RTL imported and used', () => {
    expect(src).toContain("import { rtlFlexRow }");
    expect(src).toContain('rtlFlexRow(isRTL)');
  });

  test('uses dynamic insets for header', () => {
    expect(src).toContain('insets.top + 56');
  });
});

// ── dua-collection.tsx ──

describe('dua-collection', () => {
  const src = readScreen('dua-collection');

  test('error state handling for duasQuery', () => {
    expect(src).toContain('duasQuery.isError');
    expect(src).toContain('alert-circle');
  });

  test('bookmark debounce via bookmarkingRef', () => {
    expect(src).toContain('bookmarkingRef');
    expect(src).toContain('bookmarkingRef.current.has');
  });

  test('haptic on play audio is tick not navigate', () => {
    const block = src.slice(src.indexOf('handlePlayAudio'), src.indexOf('handlePlayAudio') + 150);
    expect(block).toContain('haptic.tick()');
    expect(block).not.toContain('haptic.navigate()');
  });

  test('bookmarkMutation has onError', () => {
    const block = src.slice(src.indexOf('bookmarkMutation = useMutation'), src.indexOf('bookmarkMutation = useMutation') + 500);
    expect(block).toContain('onError');
  });
});

// ── duet-create.tsx ──

describe('duet-create', () => {
  const src = readScreen('duet-create');

  test('recording race condition: isRecordingRef', () => {
    expect(src).toContain('isRecordingRef.current');
    expect(src).toContain('isRecordingRef.current = true');
  });

  test('next button disabled without video', () => {
    expect(src).toContain('disabled={!hasVideo');
    expect(src).toContain('if (!recordedUri) return');
  });

  test('no unused reanimated imports (withSpring/withRepeat/useAnimatedStyle)', () => {
    const importLine = src.match(/import.*from 'react-native-reanimated'/)?.[0] ?? '';
    expect(importLine).not.toContain('withSpring');
    expect(importLine).not.toContain('withRepeat');
    expect(importLine).not.toContain('useAnimatedStyle');
  });

  test('no BrandedRefreshControl (removed fake refresh)', () => {
    expect(src).not.toContain('BrandedRefreshControl');
    expect(src).not.toContain('onRefresh');
  });

  test('audio permission has error handling', () => {
    expect(src).toContain('} catch {');
    expect(src).toContain('setAudioPermission(false)');
  });

  test('mute button has haptic', () => {
    expect(src).toContain("haptic.tick(); setIsMuted");
  });

  test('uses spacing[\'2xl\'] not spacing.xxl', () => {
    expect(src).toContain("spacing['2xl']");
    expect(src).not.toContain('spacing.xxl');
  });
});

// ── waqf.tsx ──

describe('waqf', () => {
  const src = readScreen('waqf');
  const styles = getStylesSection(src);

  test('payment flow guarded: !paymentResult check', () => {
    expect(src).toContain('if (!paymentResult)');
    const piIdx = src.indexOf('createPaymentIntent');
    const recordIdx = src.indexOf('api.post(`/waqf/funds');
    expect(recordIdx).toBeGreaterThan(piIdx);
  });

  test('error state in ListEmptyComponent', () => {
    expect(src).toContain('fundsQuery.isError');
  });

  test('theme-aware text colors in styles', () => {
    expect(styles).toContain('tc.text.primary');
    expect(styles).toContain('tc.text.secondary');
    expect(styles).toContain('tc.text.tertiary');
    expect(styles).not.toContain("color: colors.text.primary");
  });

  test('uses fontFamily tokens instead of fontWeight', () => {
    expect(styles).toContain('fonts.bodySemiBold');
    expect(styles).toContain('fonts.bodyBold');
  });
});

// ── watch-history.tsx ──

describe('watch-history', () => {
  const src = readScreen('watch-history');
  const styles = getStylesSection(src);

  test('success toast on clear history', () => {
    expect(src).toContain("showToast({ message: t('screens.watch-history.cleared'");
  });

  test('haptic imported and used', () => {
    expect(src).toContain('useContextualHaptic');
    expect(src).toContain('haptic.tick()');
    expect(src).toContain('haptic.success()');
  });

  test('double-tap guard on video press', () => {
    expect(src).toContain('isNavigatingRef.current');
  });

  test('theme-aware text colors in styles', () => {
    expect(styles).toContain('tc.text.primary');
    expect(styles).toContain('tc.text.secondary');
    expect(styles).toContain('tc.text.tertiary');
  });

  test('no unused isRTL variable', () => {
    expect(src).not.toMatch(/const.*isRTL.*=.*useTranslation/);
  });
});

// ── watch-party.tsx ──

describe('watch-party', () => {
  const src = readScreen('watch-party');
  const styles = getStylesSection(src);

  test('error state in ListEmptyComponent', () => {
    expect(src).toContain('partiesQuery.isError');
  });

  test('theme-aware text colors', () => {
    expect(styles).toContain('tc.text.primary');
    expect(styles).toContain('tc.text.secondary');
    expect(styles).toContain('tc.text.tertiary');
  });
});

// ── whats-new.tsx ──

describe('whats-new', () => {
  const src = readScreen('whats-new');

  test('scroll indicator hidden', () => {
    expect(src).toContain('showsVerticalScrollIndicator={false}');
  });

  test('emerald opacity uses hex 1F not 12', () => {
    expect(src).toContain('${colors.emerald}1F');
    expect(src).not.toContain('${colors.emerald}12');
  });
});

// ── why-showing.tsx ──

describe('why-showing', () => {
  const src = readScreen('why-showing');
  const styles = getStylesSection(src);

  test('haptic on actions', () => {
    expect(src).toContain('useContextualHaptic');
    expect(src).toContain('haptic.send()');
    expect(src).toContain('haptic.success()');
    expect(src).toContain('haptic.error()');
  });

  test('double-tap guard on action buttons', () => {
    expect(src).toContain('isActioning');
    expect(src).toContain('disabled={isActioning}');
  });

  test('feed invalidated after dismiss', () => {
    expect(src).toContain("queryClient.invalidateQueries({ queryKey: ['feed'] })");
  });

  test('theme-aware text in styles', () => {
    expect(styles).toContain('tc.text.primary');
    expect(styles).toContain('tc.text.secondary');
  });
});

// ── _layout.tsx ──

describe('_layout', () => {
  const src = readScreen('_layout');

  test('uses useThemeColors for bg', () => {
    expect(src).toContain('useThemeColors');
    expect(src).toContain('tc.bg');
  });

  test('sets headerShown: false', () => {
    expect(src).toContain('headerShown: false');
  });

  test('has animation configured', () => {
    expect(src).toContain("animation: 'slide_from_right'");
  });
});

// ── wind-down.tsx ──

describe('wind-down', () => {
  const src = readScreen('wind-down');
  const styles = getStylesSection(src);

  test('gradient uses theme tokens not hardcoded hex', () => {
    expect(src).toContain("colors={[tc.bg, tc.bgCard, tc.bg]}");
    expect(src).not.toContain("'#0A1628'");
  });

  test('theme-aware text colors in styles', () => {
    expect(styles).toContain('tc.text.primary');
    expect(styles).toContain('tc.text.secondary');
    expect(styles).toContain('tc.text.tertiary');
  });

  test('RTL imported and used', () => {
    expect(src).toContain('rtlFlexRow');
  });

  test('continue scrolling has press feedback', () => {
    expect(src).toContain('pressed && { opacity: 0.7 }');
  });

  test('no fontWeight + fontFamily conflict on title', () => {
    expect(styles).not.toMatch(/title:[\s\S]*?fontWeight.*fontFamily.*fonts\.headingBold/);
  });
});

// ── xp-history.tsx ──

describe('xp-history', () => {
  const src = readScreen('xp-history');
  const styles = getStylesSection(src);

  test('error state for queries', () => {
    expect(src).toContain('xpQuery.isError');
    expect(src).toContain('historyQuery.isError');
  });

  test('haptic imported', () => {
    expect(src).toContain('useContextualHaptic');
  });

  test('theme-aware text in styles', () => {
    expect(styles).toContain('tc.text.primary');
    expect(styles).toContain('tc.text.secondary');
    expect(styles).toContain('tc.text.tertiary');
  });

  test('levelCard RTL: uses rtlFlexRow inline', () => {
    expect(src).toContain("{ flexDirection: rtlFlexRow(isRTL) }");
  });
});

// ── zakat-calculator.tsx ──

describe('zakat-calculator', () => {
  const src = readScreen('zakat-calculator');
  const styles = getStylesSection(src);

  test('i18n keys exist in en.json', () => {
    const en = readI18n('en') as { screens: { zakatCalculator: Record<string, string> } };
    expect(en.screens.zakatCalculator).toBeDefined();
    expect(en.screens.zakatCalculator.title).toBe('Zakat Calculator');
    expect(en.screens.zakatCalculator.stepAssets).toBe('Assets');
    expect(en.screens.zakatCalculator.zakatDue).toContain('2.5%');
    expect(en.screens.zakatCalculator.belowNisabMessage).toContain('Nisab');
  });

  test('i18n keys exist in all 8 languages', () => {
    const langs = ['en', 'ar', 'tr', 'ur', 'bn', 'fr', 'id', 'ms'];
    for (const lang of langs) {
      const data = readI18n(lang) as { screens: { zakatCalculator: Record<string, string> } };
      expect(data.screens.zakatCalculator).toBeDefined();
      expect(data.screens.zakatCalculator.title).toBeTruthy();
      expect(data.screens.zakatCalculator.zakatDue).toBeTruthy();
      expect(data.screens.zakatCalculator.recalculate).toBeTruthy();
    }
  });

  test('pull-to-refresh does NOT clear user input', () => {
    const onRefresh = src.slice(src.indexOf('onRefresh = useCallback'), src.indexOf('onRefresh = useCallback') + 300);
    expect(onRefresh).not.toContain('setAssets');
    expect(onRefresh).not.toContain('setDeductions');
    expect(onRefresh).not.toContain('setCurrentStep');
  });

  test('no dead Dimensions.get import used for width', () => {
    expect(src).not.toMatch(/const \{ width \} = Dimensions/);
  });

  test('theme-aware text colors', () => {
    expect(styles).toContain('tc.text.primary');
    expect(styles).toContain('tc.text.secondary');
    expect(styles).not.toContain("color: colors.text.primary");
  });

  test('zakat formula constants unchanged (Islamic data rule)', () => {
    expect(src).toContain('ZAKAT_RATE = 0.025');
    expect(src).toContain('NISAB_GOLD_GRAMS = 87.48');
    expect(src).toContain('NISAB_SILVER_GRAMS = 612.36');
  });
});
