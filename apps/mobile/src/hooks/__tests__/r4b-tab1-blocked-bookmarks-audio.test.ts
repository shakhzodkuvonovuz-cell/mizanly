/**
 * R4B Tab1 — Tests for blocked, bookmark-collections, bookmark-folders,
 * boost-post, branded-content, audio-library, audio-room, banned,
 * biometric-lock, blocked-keywords screen fixes.
 *
 * Covers: haptic feedback integration, dead stylesheet cleanup,
 * host-only controls, error handling, loading guards, press feedback,
 * theme-aware colors, and i18n formatting.
 */

import * as fs from 'fs';
import * as path from 'path';

const screensDir = path.resolve(__dirname, '../../../app/(screens)');

function readScreen(name: string): string {
  return fs.readFileSync(path.join(screensDir, name), 'utf8');
}

// ── blocked.tsx ──
describe('R4B-Tab1: blocked.tsx', () => {
  const src = readScreen('blocked.tsx');

  test('imports useContextualHaptic', () => {
    expect(src).toContain("useContextualHaptic");
  });

  test('uses haptic.delete() before unblock confirmation', () => {
    expect(src).toContain('haptic.delete()');
  });

  test('shows success toast on unblock', () => {
    expect(src).toContain('unblockSuccess');
    expect(src).toContain("variant: 'success'");
  });

  test('animation delay is capped', () => {
    expect(src).toContain('Math.min(index, 15)');
  });

  test('container stylesheet has no hardcoded dark bg', () => {
    // Check that container style doesn't reference colors.dark.bg
    const containerMatch = src.match(/container:\s*\{[^}]*\}/);
    expect(containerMatch).toBeTruthy();
    expect(containerMatch![0]).not.toContain('colors.dark.bg');
  });

  test('skeleton row gets inline borderColor', () => {
    expect(src).toContain('borderColor: tc.border');
  });

  test('name style has no hardcoded color', () => {
    const nameStyleMatch = src.match(/name:\s*\{[^}]*fontSize[^}]*\}/);
    expect(nameStyleMatch).toBeTruthy();
    expect(nameStyleMatch![0]).not.toContain("colors.text.primary");
  });
});

// ── bookmark-collections.tsx ──
describe('R4B-Tab1: bookmark-collections.tsx', () => {
  const src = readScreen('bookmark-collections.tsx');

  test('has staleTime on query', () => {
    expect(src).toContain('staleTime');
  });

  test('renderItem deps include tc.text values not tc.bgElevated', () => {
    expect(src).toContain('tc.text.primary');
    // The deps array should contain tc.text.primary and NOT tc.bgElevated
    expect(src).not.toMatch(/\[haptic,\s*tc\.bgElevated/);
  });

  test('Pressable has press feedback', () => {
    expect(src).toContain('pressed && { opacity: 0.7 }');
  });

  test('skeleton card gets inline theme colors', () => {
    expect(src).toContain('backgroundColor: tc.bgCard, borderColor: tc.border');
  });

  test('info gap uses spacing token', () => {
    const infoMatch = src.match(/info:\s*\{[^}]*\}/);
    expect(infoMatch).toBeTruthy();
    expect(infoMatch![0]).toContain('spacing.xs');
    expect(infoMatch![0]).not.toMatch(/gap:\s*2[^0-9]/);
  });

  test('cover placeholder gets inline bgElevated', () => {
    expect(src).toContain('backgroundColor: tc.bgElevated');
  });
});

// ── bookmark-folders.tsx ──
describe('R4B-Tab1: bookmark-folders.tsx', () => {
  const src = readScreen('bookmark-folders.tsx');

  test('imports useContextualHaptic', () => {
    expect(src).toContain("useContextualHaptic");
  });

  test('has error state check for collectionsQuery', () => {
    expect(src).toContain('collectionsQuery.isError');
  });

  test('Folder type uses count instead of itemIds', () => {
    expect(src).toContain('count: number');
    expect(src).not.toContain('itemIds: string[]');
  });

  test('FAB icon uses tc.text.primary not hardcoded #fff', () => {
    // Check the FAB icon specifically
    const fabSection = src.substring(src.indexOf('FAB'));
    expect(fabSection).toContain('tc.text.primary');
  });

  test('create button is disabled when name is empty', () => {
    expect(src).toContain("disabled={!newFolderName.trim()}");
  });

  test('haptic.delete called before folder delete', () => {
    expect(src).toContain('haptic.delete()');
  });

  test('createText style has no hardcoded color', () => {
    const match = src.match(/createText:\s*\{[^}]*\}/);
    expect(match).toBeTruthy();
    expect(match![0]).not.toContain("#fff");
    expect(match![0]).not.toContain("colors.text");
  });
});

// ── boost-post.tsx ──
describe('R4B-Tab1: boost-post.tsx', () => {
  const src = readScreen('boost-post.tsx');

  test('imports useContextualHaptic', () => {
    expect(src).toContain("useContextualHaptic");
  });

  test('boost button disabled also checks boosting state', () => {
    expect(src).toContain('activeBudget <= 0 || boosting');
  });

  test('handleBoost has double-tap guard', () => {
    expect(src).toContain('|| boosting) return');
  });

  test('pill styles have no hardcoded dark colors', () => {
    const pillMatch = src.match(/pill:\s*\{[^}]*\}/);
    expect(pillMatch).toBeTruthy();
    expect(pillMatch![0]).not.toContain('colors.dark');
  });

  test('custom input gets inline tc.text.primary', () => {
    expect(src).toContain('color: tc.text.primary');
  });

  test('reachValue dead style is removed', () => {
    expect(src).not.toContain('reachValue:');
  });

  test('no marginTop: 100 magic number in scroll', () => {
    const scrollMatch = src.match(/scroll:\s*\{[^}]*\}/);
    expect(scrollMatch).toBeTruthy();
    expect(scrollMatch![0]).not.toContain('100');
  });
});

// ── branded-content.tsx ──
describe('R4B-Tab1: branded-content.tsx', () => {
  const src = readScreen('branded-content.tsx');

  test('imports useContextualHaptic', () => {
    expect(src).toContain("useContextualHaptic");
  });

  test('handleSave has guard for empty partner name', () => {
    expect(src).toContain('isPaidPartnership && !partnerName.trim()');
  });

  test('infoTitle gets inline gold color', () => {
    expect(src).toContain('colors.gold');
  });

  test('switch toggle has haptic feedback', () => {
    expect(src).toContain('haptic.tick(); setIsPaidPartnership');
  });

  test('toggleCard style has no hardcoded bgCard', () => {
    const match = src.match(/toggleCard:\s*\{[^}]*\}/);
    expect(match).toBeTruthy();
    expect(match![0]).not.toContain('colors.dark');
  });

  test('previewNameCol gap uses spacing token', () => {
    const match = src.match(/previewNameCol:\s*\{[^}]*\}/);
    expect(match).toBeTruthy();
    expect(match![0]).toContain('spacing.xs');
  });
});

// ── audio-library.tsx ──
describe('R4B-Tab1: audio-library.tsx', () => {
  const src = readScreen('audio-library.tsx');

  test('uses SafeAreaView as root container', () => {
    expect(src).toContain('<SafeAreaView style=');
    expect(src).toContain("</SafeAreaView>");
  });

  test('no dead Dimensions import', () => {
    expect(src).not.toContain("Dimensions,");
    expect(src).not.toContain("Dimensions }");
  });

  test('play has double-tap guard', () => {
    expect(src).toContain('playingLockRef');
  });

  test('play button has press feedback', () => {
    const playSection = src.substring(src.indexOf('Play Button'));
    expect(playSection).toContain('pressed && { opacity: 0.7 }');
  });

  test('FlatList gets extra padding when now-playing bar visible', () => {
    expect(src).toContain('currentTrackId ? { paddingBottom: 120 }');
  });

  test('empty state distinguishes search vs no data', () => {
    expect(src).toContain('searchQuery.length > 0');
    expect(src).toContain('noSearchResults');
  });

  test('categoryPill paddingVertical uses spacing.sm token', () => {
    const match = src.match(/categoryPill:\s*\{[^}]*\}/);
    expect(match).toBeTruthy();
    expect(match![0]).toContain('spacing.sm');
    expect(match![0]).not.toContain('spacing.xs + 2');
  });
});

// ── audio-room.tsx ──
describe('R4B-Tab1: audio-room.tsx', () => {
  const src = readScreen('audio-room.tsx');

  test('End Room button is host-only', () => {
    // The End Room section should be wrapped in {isHost && (
    const endRoomIdx = src.indexOf('End Room');
    expect(endRoomIdx).toBeGreaterThan(-1);
    // Look for isHost guard within 100 chars AFTER the End Room comment
    const afterCode = src.substring(endRoomIdx, endRoomIdx + 100);
    expect(afterCode).toContain('isHost');
  });

  test('Accept/Decline buttons are host-only', () => {
    // The raisedHandActions section should be guarded by isHost
    // Both handleAcceptHand and handleDeclineHand appear inside an {isHost && (...)} block
    const raisedHandActionsIdx = src.indexOf('raisedHandActions');
    expect(raisedHandActionsIdx).toBeGreaterThan(-1);
    // Look back up to 300 chars for the isHost guard
    const before = src.substring(Math.max(0, raisedHandActionsIdx - 300), raisedHandActionsIdx);
    expect(before).toContain('isHost');
  });

  test('uses useWindowDimensions not Dimensions.get', () => {
    expect(src).toContain('useWindowDimensions');
    expect(src).not.toContain("Dimensions.get('window')");
  });

  test('error state uses EmptyState component', () => {
    expect(src).toContain('EmptyState');
    // Check that raw inline error state is gone
    expect(src).not.toContain("{ color: colors.error, fontSize: fontSize.md");
  });

  test('formatTimeAgo uses i18n keys', () => {
    expect(src).toContain("t('audioRoom.justNow')");
    expect(src).toContain("t('audioRoom.minutesAgo'");
    expect(src).not.toContain("'Just now'");
    expect(src).not.toContain("'m ago'");
  });

  test('handleLeave has confirmation dialog', () => {
    const leaveSection = src.substring(src.indexOf('handleLeave'));
    expect(leaveSection).toContain('Alert.alert');
  });

  test('control buttons have disabled state during action', () => {
    expect(src).toContain('disabled={actionPending}');
  });

  test('isHost is derived from currentParticipant', () => {
    expect(src).toContain("const isHost = currentParticipant?.role === 'host'");
  });
});

// ── banned.tsx ──
describe('R4B-Tab1: banned.tsx', () => {
  const src = readScreen('banned.tsx');

  test('handleSignOut has try/catch', () => {
    expect(src).toContain('try {');
    expect(src).toContain('await signOut()');
    expect(src).toContain('} catch');
  });

  test('imports useContextualHaptic', () => {
    expect(src).toContain("useContextualHaptic");
  });

  test('has entrance animation', () => {
    expect(src).toContain('FadeInUp');
    expect(src).toContain('Animated.View');
  });

  test('no hardcoded dark bg in container style', () => {
    const match = src.match(/container:\s*\{[^}]*\}/);
    expect(match).toBeTruthy();
    expect(match![0]).not.toContain('colors.dark');
  });
});

// ── biometric-lock.tsx ──
describe('R4B-Tab1: biometric-lock.tsx', () => {
  const src = readScreen('biometric-lock.tsx');

  test('authenticate has try/catch', () => {
    const authFn = src.substring(src.indexOf('const authenticate'));
    const endIdx = authFn.indexOf('}, [t]');
    const authBody = authFn.substring(0, endIdx > -1 ? endIdx : 200);
    expect(authBody).toContain('try {');
    expect(authBody).toContain('} catch');
  });

  test('toggle Pressable has disabled state', () => {
    expect(src).toContain('disabled={authPending}');
  });

  test('toggle Pressable has press feedback', () => {
    expect(src).toContain('pressed && { opacity: 0.7 }');
  });

  test('handleToggle has double-auth guard', () => {
    expect(src).toContain('if (authPending) return');
  });
});

// ── blocked-keywords.tsx ──
describe('R4B-Tab1: blocked-keywords.tsx', () => {
  const src = readScreen('blocked-keywords.tsx');

  test('imports useContextualHaptic', () => {
    expect(src).toContain("useContextualHaptic");
  });

  test('add mutation shows success toast', () => {
    expect(src).toContain('addSuccess');
  });

  test('haptic.delete called before keyword delete', () => {
    expect(src).toContain('haptic.delete()');
  });

  test('add button has press feedback', () => {
    const addBtnSection = src.substring(src.indexOf('onPress={handleAdd}'));
    expect(addBtnSection).toContain('pressed && { opacity: 0.7 }');
  });

  test('no hardcoded paddingTop: 100', () => {
    const hintMatch = src.match(/hint:\s*\{[^}]*\}/);
    expect(hintMatch).toBeTruthy();
    expect(hintMatch![0]).not.toContain('100');
  });

  test('container has no hardcoded dark bg', () => {
    const match = src.match(/container:\s*\{[^}]*\}/);
    expect(match).toBeTruthy();
    expect(match![0]).not.toContain('colors.dark');
  });
});
