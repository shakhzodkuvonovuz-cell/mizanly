/**
 * R4B-Tab2 Screen Tests
 * Covers: chat-wallpaper, circles, close-friends, collab-requests, communities,
 * series-detail, series-discover, settings, share-profile, share-receive
 */
import * as fs from 'fs';
import * as path from 'path';

const SCREENS_DIR = path.resolve(__dirname, '../../../app/(screens)');

function readScreen(name: string): string {
  return fs.readFileSync(path.join(SCREENS_DIR, `${name}.tsx`), 'utf-8');
}

// ── chat-wallpaper.tsx ──

describe('chat-wallpaper', () => {
  const src = readScreen('chat-wallpaper');

  test('no hardcoded colors.dark.bg in stylesheet', () => {
    // The stylesheet section starts after "StyleSheet.create"
    const ssMatch = src.indexOf('StyleSheet.create');
    const stylesheet = src.slice(ssMatch);
    expect(stylesheet).not.toContain("backgroundColor: colors.dark.bg");
  });

  test('tab text uses inline tc override', () => {
    expect(src).toContain('color: tc.text.secondary');
    expect(src).toContain('color: colors.emerald');
  });

  test('AsyncStorage has .catch handler', () => {
    expect(src).toContain('.catch(');
  });

  test('uses useContextualHaptic', () => {
    expect(src).toContain('useContextualHaptic');
  });

  test('no dead colors.dark.border in stylesheet', () => {
    const ssMatch = src.indexOf('StyleSheet.create');
    const stylesheet = src.slice(ssMatch);
    expect(stylesheet).not.toContain("borderColor: colors.dark.border");
  });
});

// ── circles.tsx ──

describe('circles', () => {
  const src = readScreen('circles');

  test('imports fonts from theme', () => {
    expect(src).toMatch(/import.*fonts.*from.*@\/theme/);
  });

  test('imports useContextualHaptic', () => {
    expect(src).toContain("import { useContextualHaptic }");
  });

  test('subtitle uses tc.text.secondary inline', () => {
    expect(src).toContain('color: tc.text.secondary');
  });

  test('nameInput uses tc.text.primary inline', () => {
    expect(src).toContain('color: tc.text.primary');
  });

  test('uses fontFamily instead of fontWeight in styles', () => {
    const ssMatch = src.indexOf('StyleSheet.create');
    const stylesheet = src.slice(ssMatch);
    expect(stylesheet).not.toContain("fontWeight: '600'");
    expect(stylesheet).not.toContain("fontWeight: '700'");
    expect(stylesheet).toContain('fontFamily: fonts.');
  });

  test('create mutation has success toast', () => {
    expect(src).toContain('showToast');
    expect(src).toContain("createdToast");
  });

  test('delete has haptic feedback', () => {
    expect(src).toContain('haptic.delete()');
  });
});

// ── close-friends.tsx ──

describe('close-friends', () => {
  const src = readScreen('close-friends');

  test('imports useContextualHaptic and showToast', () => {
    expect(src).toContain("useContextualHaptic");
    expect(src).toContain("showToast");
  });

  test('toggle mutation has onError handler', () => {
    expect(src).toContain('onError');
  });

  test('toggle mutation has onSuccess toast', () => {
    expect(src).toContain('addedToast');
    expect(src).toContain('removedToast');
  });

  test('name uses tc.text.primary inline', () => {
    expect(src).toContain('color: tc.text.primary');
  });

  test('uses fontFamily instead of fontWeight', () => {
    const ssMatch = src.indexOf('StyleSheet.create');
    const stylesheet = src.slice(ssMatch);
    expect(stylesheet).not.toContain("fontWeight: '600'");
  });

  test('no hardcoded container backgroundColor', () => {
    const ssMatch = src.indexOf('StyleSheet.create');
    const stylesheet = src.slice(ssMatch);
    expect(stylesheet).not.toContain("backgroundColor: colors.dark.bg");
  });
});

// ── collab-requests.tsx ──

describe('collab-requests', () => {
  const src = readScreen('collab-requests');

  test('imports useContextualHaptic and fonts', () => {
    expect(src).toContain("useContextualHaptic");
    expect(src).toMatch(/import.*fonts.*from.*@\/theme/);
  });

  test('Pressable wraps LinearGradient for action buttons', () => {
    // Accept button: Pressable should come before LinearGradient
    const actionSection = src.slice(src.indexOf('actionRow'));
    const pressableIdx = actionSection.indexOf('<Pressable');
    const gradientIdx = actionSection.indexOf('<LinearGradient', pressableIdx);
    expect(pressableIdx).toBeLessThan(gradientIdx);
  });

  test('bottom SafeArea includes bottom edge', () => {
    expect(src).toContain("edges={['top', 'bottom']}");
  });

  test('uses fontFamily instead of fontWeight in styles', () => {
    const ssMatch = src.indexOf('StyleSheet.create');
    const stylesheet = src.slice(ssMatch);
    expect(stylesheet).not.toContain("fontWeight: '700'");
    expect(stylesheet).not.toContain("fontWeight: '600'");
  });

  test('haptic on destructive actions', () => {
    expect(src).toContain('haptic.delete()');
  });
});

// ── communities.tsx ──

describe('communities', () => {
  const src = readScreen('communities');

  test('imports useContextualHaptic, showToast, fonts', () => {
    expect(src).toContain("useContextualHaptic");
    expect(src).toContain("showToast");
    expect(src).toMatch(/import.*fonts.*from.*@\/theme/);
  });

  test('no setTimeout for fake loading', () => {
    // After removing setTimeout fake delays, should not have setTimeout(.*100)
    expect(src).not.toMatch(/setTimeout\([^)]*100\)/);
  });

  test('handleJoin shows toast on success', () => {
    expect(src).toContain('joinedToast');
  });

  test('handleJoin shows toast on error', () => {
    expect(src).toContain('errorJoinFailed');
  });

  test('handleJoin updates memberCount optimistically', () => {
    expect(src).toContain('memberCount:');
  });

  test('search bar uses tc.border inline', () => {
    expect(src).toContain('borderColor: tc.border');
  });

  test('tab text uses tc.text.tertiary inline', () => {
    expect(src).toContain('color: tc.text.tertiary');
  });

  test('error state shows retry button', () => {
    expect(src).toContain('errorTitle');
    expect(src).toContain("icon=\"alert-circle\"");
  });

  test('no hardcoded rgba searchBar border in stylesheet', () => {
    const ssMatch = src.indexOf('StyleSheet.create');
    const searchBarSection = src.slice(ssMatch);
    expect(searchBarSection.slice(0, searchBarSection.indexOf('searchInput'))).not.toContain("rgba(255,255,255,0.08)");
  });

  test('uses fontFamily instead of fontWeight in styles', () => {
    const ssMatch = src.indexOf('StyleSheet.create');
    const stylesheet = src.slice(ssMatch);
    expect(stylesheet).not.toContain("fontWeight: '500'");
    expect(stylesheet).not.toContain("fontWeight: '600'");
    expect(stylesheet).not.toContain("fontWeight: '700'");
  });
});

// ── series-detail.tsx ──

describe('series-detail', () => {
  const src = readScreen('series-detail');

  test('no dead screenWidth variable', () => {
    expect(src).not.toContain('screenWidth');
    expect(src).not.toContain("Dimensions.get('window')");
  });

  test('createStyles uses tc.text.primary for text colors', () => {
    const ssMatch = src.indexOf('createStyles');
    const stylesheet = src.slice(ssMatch);
    expect(stylesheet).toContain('color: tc.text.primary');
    expect(stylesheet).toContain('color: tc.text.secondary');
    expect(stylesheet).toContain('color: tc.text.tertiary');
  });

  test('follow mutation has onError', () => {
    expect(src).toContain('onError');
    expect(src).toContain('showToast');
  });

  test('double-tap guard on follow', () => {
    expect(src).toContain('followMutation.isPending || unfollowMutation.isPending');
  });

  test('episode row has press feedback', () => {
    expect(src).toContain('android_ripple');
    expect(src).toContain('opacity: 0.7');
  });
});

// ── series-discover.tsx ──

describe('series-discover', () => {
  const src = readScreen('series-discover');

  test('no dead screenWidth variable', () => {
    expect(src).not.toContain('screenWidth');
    expect(src).not.toContain("Dimensions.get('window')");
  });

  test('createStyles uses tc.text.* for text colors', () => {
    const ssMatch = src.indexOf('createStyles');
    const stylesheet = src.slice(ssMatch);
    expect(stylesheet).toContain('color: tc.text.primary');
    expect(stylesheet).toContain('color: tc.text.secondary');
    expect(stylesheet).toContain('color: tc.text.tertiary');
  });

  test('follow mutation has onError', () => {
    expect(src).toContain('onError');
  });

  test('series card has press feedback', () => {
    expect(src).toContain('android_ripple');
    expect(src).toContain('opacity: 0.8');
  });
});

// ── settings.tsx ──

describe('settings', () => {
  const src = readScreen('settings');

  test('createStyles uses tc.text.* for row labels', () => {
    const ssMatch = src.indexOf('createStyles');
    const stylesheet = src.slice(ssMatch);
    // Check key styles use tc instead of colors
    expect(stylesheet).toContain('color: tc.text.primary');
    expect(stylesheet).toContain('color: tc.text.tertiary');
    expect(stylesheet).toContain('color: tc.text.secondary');
  });

  test('destructive uses colors.error not hardcoded hex', () => {
    const ssMatch = src.indexOf('createStyles');
    const stylesheet = src.slice(ssMatch);
    expect(stylesheet).not.toContain("'#FF453A'");
  });

  test('mutations have onError handlers', () => {
    // Count onError occurrences in mutation definitions
    const mutationSection = src.slice(
      src.indexOf('privacyMutation'),
      src.indexOf('toggleReadReceipts')
    );
    const errorCount = (mutationSection.match(/onError/g) || []).length;
    expect(errorCount).toBeGreaterThanOrEqual(4);
  });

  test('uses fontFamily instead of fontWeight in styles', () => {
    const ssMatch = src.indexOf('createStyles');
    const stylesheet = src.slice(ssMatch);
    expect(stylesheet).not.toContain("fontWeight: '700'");
    expect(stylesheet).not.toContain("fontWeight: '600'");
  });
});

// ── share-profile.tsx ──

describe('share-profile', () => {
  const src = readScreen('share-profile');

  test('no fake setTimeout loading delay', () => {
    expect(src).not.toContain('setIsReady');
  });

  test('imports useSafeAreaInsets', () => {
    expect(src).toContain('useSafeAreaInsets');
  });

  test('content has insets.top padding', () => {
    expect(src).toContain('paddingTop: insets.top');
  });

  test('uses showToast for copy feedback', () => {
    expect(src).toContain('showToast');
    expect(src).toContain('copiedToast');
  });

  test('avatar overlay uses start instead of left', () => {
    const ssMatch = src.indexOf('createStyles');
    const stylesheet = src.slice(ssMatch);
    expect(stylesheet).not.toContain("left: '50%'");
    expect(stylesheet).toContain("start: '50%'");
  });

  test('createStyles uses tc.text.* for text colors', () => {
    const ssMatch = src.indexOf('createStyles');
    const stylesheet = src.slice(ssMatch);
    expect(stylesheet).toContain('color: tc.text.primary');
    expect(stylesheet).toContain('color: tc.text.secondary');
  });

  test('uses fontFamily instead of fontWeight', () => {
    const ssMatch = src.indexOf('createStyles');
    const stylesheet = src.slice(ssMatch);
    expect(stylesheet).not.toContain("fontWeight: '700'");
    expect(stylesheet).not.toContain("fontWeight: '600'");
  });
});

// ── share-receive.tsx ──

describe('share-receive', () => {
  const src = readScreen('share-receive');

  test('createStyles uses tc.text.* for text colors', () => {
    const ssMatch = src.indexOf('createStyles');
    const stylesheet = src.slice(ssMatch);
    // Should use tc.text.primary for main text
    expect(stylesheet).toContain('color: tc.text.primary');
    expect(stylesheet).toContain('color: tc.text.secondary');
  });

  test('captionInput uses tc.text.primary', () => {
    expect(src).toContain('color: tc.text.primary');
  });

  test('uses fonts for typography', () => {
    expect(src).toContain('fontFamily: fonts.');
  });
});
