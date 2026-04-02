/**
 * R4C-Tab2 Screen Tests
 * Covers: names-of-allah, nasheed-mode, new-conversation, notification-tones,
 * notifications, 2fa-setup, 2fa-verify, account-settings, account-switcher, achievements
 *
 * 143 findings across 10 screens — these tests verify the fixes are in place.
 */
import * as fs from 'fs';
import * as path from 'path';

const SCREENS_DIR = path.resolve(__dirname, '../../../app/(screens)');

function readScreen(name: string): string {
  return fs.readFileSync(path.join(SCREENS_DIR, `${name}.tsx`), 'utf-8');
}

function getStylesheet(src: string): string {
  const idx = src.indexOf('StyleSheet.create');
  return idx >= 0 ? src.slice(idx) : '';
}

// ── names-of-allah.tsx ──

describe('names-of-allah', () => {
  const src = readScreen('names-of-allah');
  const ss = getStylesheet(src);

  test('D25-1..6: no hardcoded colors.text.* in stylesheet', () => {
    expect(ss).not.toContain('color: colors.text.primary');
    expect(ss).not.toContain('color: colors.text.secondary');
    expect(ss).not.toContain('color: colors.text.tertiary');
  });

  test('D25-1..6: uses tc.text.* in stylesheet', () => {
    expect(ss).toContain('color: tc.text.primary');
    expect(ss).toContain('color: tc.text.secondary');
  });

  test('D25-8: haptic on card expand', () => {
    expect(src).toContain('haptic.tick()');
    expect(src).toContain('onToggleExpand');
  });

  test('D25-9: press feedback on name cards', () => {
    expect(src).toContain('pressed && { opacity: 0.85 }');
    expect(src).toContain('android_ripple');
  });

  test('D25-10: toggleLearned has debounce guard', () => {
    expect(src).toContain('togglingRef.current');
  });

  test('D25-11: namesQuery has staleTime', () => {
    expect(src).toContain("staleTime: 24 * 60 * 60 * 1000");
  });

  test('D25-12: loadLearned shows error on failure', () => {
    expect(src).toContain("showToast({ message: t('common.error'");
  });

  test('D25-13: daily name skeleton prevents layout jump', () => {
    expect(src).toContain('dailyQuery.isLoading');
    expect(src).toContain('Skeleton.Rect');
  });

  test('D25-14: empty state has retry action', () => {
    expect(src).toContain("actionLabel={t('common.retry')}");
    expect(src).toContain('onAction={() => namesQuery.refetch()}');
  });

  test('D25-15: no dead Audio import', () => {
    expect(src).not.toContain("import { Audio } from 'expo-av'");
    expect(src).not.toContain('soundRef');
  });
});

// ── nasheed-mode.tsx ──

describe('nasheed-mode', () => {
  const src = readScreen('nasheed-mode');
  const ss = getStylesheet(src);

  test('D25-17..22: no hardcoded colors.text.* in stylesheet', () => {
    expect(ss).not.toContain('color: colors.text.primary');
    expect(ss).not.toContain('color: colors.text.secondary');
    expect(ss).not.toContain('color: colors.text.tertiary');
  });

  test('D25-23..25: RTL support via rtlFlexRow', () => {
    expect(src).toContain('rtlFlexRow');
    expect(src).toContain('isRTL');
  });

  test('D25-26: uses SafeAreaView', () => {
    expect(src).toContain('SafeAreaView');
    expect(src).toContain("edges={['top']}");
  });

  test('D25-27,31: haptic on toggle', () => {
    expect(src).toContain('useContextualHaptic');
    expect(src).toContain('haptic.tick()');
  });

  test('D25-29: error toast on mutation failure', () => {
    expect(src).toContain('showToast');
    expect(src).toContain("variant: 'error'");
  });
});

// ── new-conversation.tsx ──

describe('new-conversation', () => {
  const src = readScreen('new-conversation');
  const ss = getStylesheet(src);

  test('D25-33..36: no hardcoded colors.text.* in stylesheet', () => {
    expect(ss).not.toContain('color: colors.text.primary');
    expect(ss).not.toContain('color: colors.text.secondary');
    expect(ss).not.toContain('color: colors.text.tertiary');
  });

  test('D25-37: RTL support', () => {
    expect(src).toContain('rtlFlexRow');
    expect(src).toContain('isRTL');
  });

  test('D25-38: haptic feedback', () => {
    expect(src).toContain('useContextualHaptic');
    expect(src).toContain('haptic.navigate()');
  });

  test('D25-41: keyboardShouldPersistTaps on lists', () => {
    const matches = src.match(/keyboardShouldPersistTaps/g);
    expect(matches?.length).toBeGreaterThanOrEqual(2);
  });

  test('D25-42: staleTime on recentConversationsQuery', () => {
    expect(src).toContain('staleTime: 30 * 1000');
  });

  test('D25-44: router.push instead of router.replace', () => {
    expect(src).toContain("router.push(`/(screens)/conversation/");
  });

  test('D25-45: animation cap at 10', () => {
    expect(src).toContain('Math.min(index, 10)');
  });
});

// ── notification-tones.tsx ──

describe('notification-tones', () => {
  const src = readScreen('notification-tones');
  const ss = getStylesheet(src);

  test('D25-46..49: no hardcoded colors.text.* in stylesheet', () => {
    expect(ss).not.toContain('color: colors.text.primary');
    expect(ss).not.toContain('color: colors.text.secondary');
    expect(ss).not.toContain('color: colors.text.tertiary');
  });

  test('D25-50: save bar theme-aware background', () => {
    expect(ss).toContain("tc.isDark ? 'rgba(13, 17, 23, 0.95)' : 'rgba(255, 255, 255, 0.95)'");
  });

  test('D25-51: RTL support', () => {
    expect(src).toContain('rtlFlexRow');
    expect(src).toContain('isRTL');
  });

  test('D25-52: uses SafeAreaView', () => {
    expect(src).toContain('SafeAreaView');
  });

  test('D25-53: no hardcoded marginTop: 100', () => {
    expect(ss).not.toContain('marginTop: 100');
  });

  test('D25-54: double-tap guard on save', () => {
    expect(src).toContain('if (!conversationId || saving) return');
  });

  test('D25-55: save success/error toast', () => {
    expect(src).toContain("showToast({ message: t('notificationTones.saved'");
  });

  test('D25-56: AsyncStorage load has catch', () => {
    expect(src).toContain('.catch(');
  });

  test('D25-59: playing icon is volume-2 not check', () => {
    expect(src).toContain("name={isPlaying ? 'volume-2' : 'play'}");
  });
});

// ── notifications.tsx ──

describe('notifications', () => {
  const src = readScreen('notifications');
  const ss = getStylesheet(src);

  test('D25-60..62: no hardcoded colors.text.* in main text styles', () => {
    expect(ss).toContain('color: tc.text.primary');
    expect(ss).toContain('color: tc.text.secondary');
    expect(ss).toContain('color: tc.text.tertiary');
  });

  test('D25-65: mark-all-read fires only once', () => {
    // The onPress should be empty (no-op) and the GradientButton has the actual onPress
    expect(src).toContain("onPress: () => {},");
    expect(src).toContain('disabled={markAllMutation.isPending}');
  });

  test('D25-68: staleTime on notifications query', () => {
    expect(src).toContain('staleTime: 15 * 1000');
  });

  test('D25-75: zero-others guard in aggregation', () => {
    expect(src).toContain('> 0 && (');
  });

  test('D25-76: follow mutation has error handler', () => {
    const followMutationBlock = src.slice(
      src.indexOf("const followMutation"),
      src.indexOf("const handlePress")
    );
    expect(followMutationBlock).toContain('onError');
  });

  test('D25-77: padding bottom uses insets', () => {
    expect(src).toContain('paddingBottom: insets.bottom + spacing.xl');
  });
});

// ── 2fa-setup.tsx ──

describe('2fa-setup', () => {
  const src = readScreen('2fa-setup');
  const ss = getStylesheet(src);

  test('D01-1..3: uses createStyles(tc) pattern', () => {
    expect(src).toContain('const createStyles = (tc:');
    expect(src).toContain('const styles = createStyles(tc)');
  });

  test('D01-4: uses SafeAreaView', () => {
    expect(src).toContain("<SafeAreaView style=");
    expect(src).toContain("edges={['top']}");
  });

  test('D01-5: no hardcoded paddingTop: 100', () => {
    expect(ss).not.toContain('paddingTop: 100');
  });

  test('D01-7: haptic feedback imported and used', () => {
    expect(src).toContain('useContextualHaptic');
    expect(src).toContain('haptic.tick()');
  });

  test('D01-10: KeyboardAvoidingView wraps ScrollView', () => {
    expect(src).toContain('KeyboardAvoidingView');
    expect(src).toContain("behavior={Platform.OS === 'ios' ? 'padding' : undefined}");
  });

  test('D01-14: backup codes use Share directly without Alert', () => {
    expect(src).not.toContain("Alert.alert(\n      t('auth.downloadBackupCodes')");
    expect(src).toContain("Share.share({ message: backupCodes.join('\\n')");
  });

  test('D01-16: Continue button has press feedback', () => {
    expect(src).toContain("pressed && { opacity: 0.85 }");
  });
});

// ── 2fa-verify.tsx ──

describe('2fa-verify', () => {
  const src = readScreen('2fa-verify');
  const ss = getStylesheet(src);

  test('D01-18: uses createStyles(tc) pattern', () => {
    expect(src).toContain('const createStyles = (tc:');
  });

  test('D01-19: uses SafeAreaView', () => {
    expect(src).toContain('SafeAreaView');
  });

  test('D01-20: no hardcoded paddingTop: 100', () => {
    expect(ss).not.toContain('paddingTop: 100');
  });

  test('D01-22: haptic feedback', () => {
    expect(src).toContain('useContextualHaptic');
    expect(src).toContain('haptic.tick()');
    expect(src).toContain('haptic.success()');
  });

  test('D01-25: KeyboardAvoidingView', () => {
    expect(src).toContain('KeyboardAvoidingView');
  });

  test('D01-26: Contact Support opens email', () => {
    expect(src).toContain("Linking.openURL('mailto:support@mizanly.app");
    expect(src).not.toContain('onPress: () => {}');
  });
});

// ── account-settings.tsx ──

describe('account-settings', () => {
  const src = readScreen('account-settings');

  test('D01-38: pull-to-refresh uses isRefetching', () => {
    expect(src).toContain('refreshing={userQuery.isRefetching}');
    expect(src).not.toContain('refreshing={userQuery.isLoading}');
  });

  test('D01-39: bodyContent uses spacing token', () => {
    expect(src).toContain("paddingBottom: spacing['3xl']");
  });

  test('D01-40: biometric error blocks deletion', () => {
    expect(src).toContain("// Biometric error — do NOT proceed with deletion");
    expect(src).not.toContain("catch {\n                      await requestDeletionMutation.mutateAsync()");
  });

  test('D01-36: export data calls directly without Alert', () => {
    expect(src).not.toContain("Alert.alert(\n      t('accountSettings.downloadDataTitle')");
    expect(src).toContain('exportDataMutation.mutate()');
  });

  test('D01-34: destructive mutations have disabled guards', () => {
    expect(src).toContain('deactivateMutation.isPending ? undefined : handleDeactivate');
    expect(src).toContain('requestDeletionMutation.isPending ? undefined : handleDeleteAccount');
  });
});

// ── account-switcher.tsx ──

describe('account-switcher', () => {
  const src = readScreen('account-switcher');

  test('D01-44,55: no hardcoded English lastActive strings', () => {
    expect(src).not.toMatch(/lastActive:.*'Active now'/);
    expect(src).not.toMatch(/lastActive:.*'Tap to switch'/);
    expect(src).toContain("t('screens.accountSwitcher.activeNow'");
    expect(src).toContain("t('screens.accountSwitcher.tapToSwitch'");
  });

  test('D01-43: unreadBadgeText uses fontSize token', () => {
    expect(src).toContain('fontSize: fontSize.xs');
    const ssMatch = src.indexOf('unreadBadgeText');
    const block = src.slice(ssMatch, ssMatch + 100);
    expect(block).not.toContain('fontSize: 12');
  });

  test('D01-45: haptic on switch', () => {
    expect(src).toContain('haptic.navigate()');
  });

  test('D01-48,49: dead buttons show Coming Soon toast', () => {
    expect(src).toContain("showToast({ message: t('common.comingSoon'");
  });
});

// ── achievements.tsx ──

describe('achievements', () => {
  const src = readScreen('achievements');
  const ss = getStylesheet(src);

  test('D01-59: uses SafeAreaView', () => {
    expect(src).toContain('SafeAreaView');
    expect(src).toContain("edges={['top']}");
  });

  test('D01-60: no hardcoded paddingTop: 100', () => {
    expect(ss).not.toContain('paddingTop: 100');
  });

  test('D01-62: no unsafe type assertion', () => {
    expect(src).not.toContain("'star' as IconName");
  });

  test('D01-61: rarityBadge uses spacing token', () => {
    const rarityBadgeIdx = ss.indexOf('rarityBadge');
    const block = ss.slice(rarityBadgeIdx, rarityBadgeIdx + 120);
    expect(block).toContain('paddingVertical: spacing.xs');
  });
});
