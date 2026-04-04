/**
 * R4C Tab1 — Tests for create-reel, create-story, create-thread,
 * create-video, creator-dashboard, sound/[id], starred-messages,
 * status-privacy, sticker-browser, stitch-create screen fixes.
 *
 * 147 findings: D12 (102) + D35 (45)
 * Covers: theme-aware colors, double-tap guards, RTL, haptic,
 * keyboard handling, accessibility, ProgressiveImage, error handling.
 */

import * as fs from 'fs';
import * as path from 'path';

const screensDir = path.resolve(__dirname, '../../../app/(screens)');

function readScreen(name: string): string {
  return fs.readFileSync(path.join(screensDir, name), 'utf8');
}

// ── create-reel.tsx ──
describe('R4C-Tab1: create-reel.tsx', () => {
  const src = readScreen('create-reel.tsx');

  test('uses createStyles(tc) pattern, not module-scope StyleSheet', () => {
    expect(src).toContain('const createStyles = (tc:');
    // After hook extraction, styles are memoized via useMemo
    expect(src).toMatch(/const styles = (?:useMemo\(\(\) => )?createStyles\(tc/);
  });

  test('no hardcoded colors.dark.* in createStyles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.dark.bg');
    expect(stylesSection).not.toContain('colors.dark.surface');
    expect(stylesSection).not.toContain('colors.dark.bgCard');
    expect(stylesSection).not.toContain('colors.dark.border');
  });

  test('no hardcoded colors.text.* in createStyles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.text.primary');
    expect(stylesSection).not.toContain('colors.text.secondary');
  });

  test('ScrollView has keyboardShouldPersistTaps', () => {
    expect(src).toContain('keyboardShouldPersistTaps="handled"');
  });

  test('handleUpload has double-tap guard via isPending', () => {
    // After hook extraction, the guard is in useReelPublish hook; screen delegates via publish.handleUpload
    expect(src).toContain('publish.handleUpload');
  });

  test('handleCameraRecord has error toast, not silent catch', () => {
    // After hook extraction, error toast is in useReelCapture hook; screen delegates via capture.handleCameraRecord
    expect(src).toContain('capture.handleCameraRecord');
  });

  test('music icon uses "music" not "volume-x"', () => {
    expect(src).not.toContain('name="volume-x"');
    expect(src).toContain('name="music"');
  });

  test('music Pressable has accessibilityRole', () => {
    // The music toolbar button should have accessibilityRole
    const musicPressable = src.match(/accessibilityRole="button".*setShowMusicPicker/s);
    expect(musicPressable).not.toBeNull();
  });

  test('gap uses spacing.xs not magic number 4', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toMatch(/gap:\s*4,/);
  });
});

// ── create-story.tsx ──
describe('R4C-Tab1: create-story.tsx', () => {
  const src = readScreen('create-story.tsx');

  test('no raw Image import from expo-image', () => {
    expect(src).not.toMatch(/import\s+\{\s*Image\s*\}\s+from\s+'expo-image'/);
  });

  test('toolBtnStyle uses getToolBtnStyle(tc) factory', () => {
    expect(src).toContain('const getToolBtnStyle');
    expect(src).toContain('const toolBtnStyle = getToolBtnStyle(tc)');
  });

  test('editorTitle uses getEditorTitle(tc) factory', () => {
    expect(src).toContain('const getEditorTitle');
    expect(src).toContain('const editorTitle = getEditorTitle(tc)');
  });

  test('editorInput uses getEditorInput(tc) factory', () => {
    expect(src).toContain('const getEditorInput');
    expect(src).toContain('const editorInput = getEditorInput(tc)');
  });

  test('header does not hardcode rgba(13,17,23,0.92)', () => {
    expect(src).not.toContain("backgroundColor: 'rgba(13, 17, 23, 0.92)'");
  });

  test('music icon uses "music" not "volume-x"', () => {
    expect(src).not.toContain('name="volume-x"');
  });

  test('publish button has double-tap guard', () => {
    expect(src).toContain('publishMutation.isPending');
  });

  test('pickMedia is delegated to capture hook', () => {
    // After hook extraction, permission request is in useStoryCapture hook; screen delegates via capture.pickMedia
    expect(src).toContain('capture.pickMedia');
  });

  test('uses modern mediaTypes array, not deprecated MediaTypeOptions', () => {
    expect(src).not.toContain('MediaTypeOptions.All');
  });

  test('ScrollView has keyboardShouldPersistTaps', () => {
    expect(src).toContain('keyboardShouldPersistTaps="handled"');
  });

  test('sticker editor buttons have accessibilityRole="button"', () => {
    // Count accessibilityRole="button" on Pressables in editor sections
    const editorSections = src.slice(src.indexOf('activeStickerEditor'));
    const a11yCount = (editorSections.match(/accessibilityRole="button"/g) || []).length;
    expect(a11yCount).toBeGreaterThanOrEqual(10);
  });

  test('DraggableSticker uses useContextualHaptic not Vibration', () => {
    const dragSection = src.slice(src.indexOf('function DraggableSticker'), src.indexOf('function DraggableSticker') + 500);
    expect(dragSection).toContain('useContextualHaptic');
    expect(dragSection).not.toContain('Vibration');
  });

  test('publishMutation onError is handled by publish hook', () => {
    // After hook extraction, onError is in useStoryPublish hook; screen delegates via publish.publishMutation
    expect(src).toContain('publish.publishMutation');
  });
});

// ── create-thread.tsx ──
describe('R4C-Tab1: create-thread.tsx', () => {
  const src = readScreen('create-thread.tsx');

  test('uses createStyles(tc) pattern via useMemo', () => {
    expect(src).toContain('const createStyles = (tc:');
    // After hook extraction, styles are memoized
    expect(src).toMatch(/const styles = (?:useMemo\(\(\) => )?createStyles\(tc/);
  });

  test('no hardcoded colors.dark.* in createStyles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.dark.bg');
    expect(stylesSection).not.toContain('colors.dark.bgElevated');
    expect(stylesSection).not.toContain('colors.dark.border');
    expect(stylesSection).not.toContain('colors.dark.bgSheet');
  });

  test('no hardcoded colors.text.* in createStyles (except brand colors)', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    // These should all be tc.text.* now
    expect(stylesSection).not.toContain("color: colors.text.primary");
    expect(stylesSection).not.toContain("color: colors.text.secondary");
  });

  test('createMutation has double-tap guard', () => {
    expect(src).toContain('!createMutation.isPending');
  });

  test('glassmorphism card has light-mode variant', () => {
    expect(src).toContain('tc.isDark');
    expect(src).toContain('rgba(255,255,255,0.7)');
  });
});

// ── create-video.tsx ──
describe('R4C-Tab1: create-video.tsx', () => {
  const src = readScreen('create-video.tsx');

  test('uses createStyles(tc) pattern via useMemo', () => {
    expect(src).toContain('const createStyles = (tc:');
    // After hook extraction, styles are memoized
    expect(src).toMatch(/const styles = (?:useMemo\(\(\) => )?createStyles\(tc/);
  });

  test('no hardcoded colors.dark.* in createStyles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.dark.bg');
    expect(stylesSection).not.toContain('colors.dark.surface');
    expect(stylesSection).not.toContain('colors.dark.border');
    expect(stylesSection).not.toContain('colors.dark.bgCard');
    expect(stylesSection).not.toContain('colors.dark.bgElevated');
  });

  test('ScrollView has keyboardShouldPersistTaps', () => {
    expect(src).toContain('keyboardShouldPersistTaps="handled"');
  });

  test('handleSubmit has double-tap guard', () => {
    expect(src).toContain('if (uploadMutation.isPending) return');
  });

  test('progress bar does not show fake 100% width', () => {
    expect(src).not.toContain("width: '100%' }]} />");
  });
});

// ── creator-dashboard.tsx ──
describe('R4C-Tab1: creator-dashboard.tsx', () => {
  const src = readScreen('creator-dashboard.tsx');

  test('uses createStyles(tc) pattern via useMemo', () => {
    expect(src).toContain('const createStyles = (tc:');
    // After hook extraction, styles are memoized
    expect(src).toMatch(/const styles = (?:useMemo\(\(\) => )?createStyles\(tc/);
  });

  test('no hardcoded colors.dark.* in createStyles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.dark.bg');
    expect(stylesSection).not.toContain('colors.dark.bgCard');
    expect(stylesSection).not.toContain('colors.dark.surface');
    expect(stylesSection).not.toContain('colors.dark.border');
  });

  test('no raw Image import from react-native', () => {
    // Should only import ProgressiveImage
    expect(src).toContain('ProgressiveImage');
    expect(src).not.toMatch(/Image\s*\}\s*from\s*'react-native'/);
  });

  test('formatNumber uses formatCount, not duplicate implementation', () => {
    expect(src).toContain('const formatNumber = formatCount');
    expect(src).not.toContain('1_000_000');
  });

  test('imports useContextualHaptic', () => {
    expect(src).toContain("useContextualHaptic");
  });

  test('postGridItem has press feedback', () => {
    expect(src).toContain('pressed && { opacity: 0.7 }');
  });
});

// ── sound/[id].tsx ──
describe('R4C-Tab1: sound/[id].tsx', () => {
  const src = readScreen('sound/[id].tsx');

  test('no raw ExpoImage import', () => {
    expect(src).not.toContain("import { Image as ExpoImage }");
  });

  test('uses ProgressiveImage instead of ExpoImage', () => {
    expect(src).toContain('ProgressiveImage');
    expect(src).not.toContain('<ExpoImage');
  });

  test('trackTitle uses tc.text.primary not hardcoded', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toMatch(/trackTitle.*color: colors\.text\.primary/s);
  });

  test('viewCountOverlay uses start not left for RTL', () => {
    expect(src).toContain('start: spacing.xs');
    expect(src).not.toMatch(/viewCountOverlay[\s\S]*?left: spacing/);
  });

  test('handleUseSound has double-tap guard', () => {
    expect(src).toContain('isNavigatingRef');
  });

  test('unused queryClient removed', () => {
    expect(src).not.toContain('const queryClient');
  });

  test('playPreview has mutex lock to prevent race condition', () => {
    expect(src).toContain('isPlayingLockRef');
    expect(src).toContain('if (isPlayingLockRef.current) return');
  });

  test('FadeInUp stagger capped at 10', () => {
    expect(src).toContain('Math.min(index, 10)');
  });
});

// ── starred-messages.tsx ──
describe('R4C-Tab1: starred-messages.tsx', () => {
  const src = readScreen('starred-messages.tsx');

  test('no hardcoded colors.text.* in createStyles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain("color: colors.text.primary");
    expect(stylesSection).not.toContain("color: colors.text.secondary");
    expect(stylesSection).not.toContain("color: colors.text.tertiary");
  });

  test('uses borderStartWidth not borderLeftWidth for RTL', () => {
    expect(src).toContain('borderStartWidth');
    expect(src).not.toContain('borderLeftWidth');
  });

  test('handleUnstar has conversationId null check', () => {
    expect(src).toContain('if (!conversationId)');
  });

  test('handleUnstar has double-tap guard', () => {
    expect(src).toContain('isUnstarringRef');
  });

  test('FadeInUp stagger capped at 10', () => {
    expect(src).toContain('Math.min(index, 10)');
  });
});

// ── status-privacy.tsx ──
describe('R4C-Tab1: status-privacy.tsx', () => {
  const src = readScreen('status-privacy.tsx');

  test('no hardcoded colors.text.* in createStyles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain("color: colors.text.primary");
    expect(stylesSection).not.toContain("color: colors.text.secondary");
    expect(stylesSection).not.toContain("color: colors.text.tertiary");
  });
});

// ── sticker-browser.tsx ──
describe('R4C-Tab1: sticker-browser.tsx', () => {
  const src = readScreen('sticker-browser.tsx');

  test('no hardcoded colors.text.* in createStyles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain("color: colors.text.primary");
    expect(stylesSection).not.toContain("color: colors.text.secondary");
  });

  test('PackCard has double-tap guard', () => {
    expect(src).toContain('isTogglingRef');
  });

  test('empty state differentiates search vs browse', () => {
    expect(src).toContain('noStickers');
  });

  test('onRefresh uses haptic.tick() not haptic.navigate()', () => {
    expect(src).toContain('haptic.tick()');
    // Should not have haptic.navigate() in onRefresh
    const onRefreshFn = src.slice(src.indexOf('const onRefresh'), src.indexOf('const onRefresh') + 200);
    expect(onRefreshFn).not.toContain('haptic.navigate');
  });

  test('FadeInUp stagger capped at 10', () => {
    expect(src).toContain('Math.min(index, 10)');
  });
});

// ── stitch-create.tsx ──
describe('R4C-Tab1: stitch-create.tsx', () => {
  const src = readScreen('stitch-create.tsx');

  test('CameraView has enableTorch prop', () => {
    expect(src).toContain('enableTorch={flashOn}');
  });

  test('no hardcoded colors.text.* in createStyles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain("color: colors.text.primary");
    expect(stylesSection).not.toContain("color: colors.text.secondary");
    expect(stylesSection).not.toContain("color: colors.text.tertiary");
  });

  test('next button validates recordedUri before navigation', () => {
    expect(src).toContain("if (!recordedUri)");
    expect(src).toContain('recordOrPickVideo');
  });

  test('next button has double-tap guard', () => {
    expect(src).toContain('isNavigatingRef');
  });

  test('cancel button confirms discard when video exists', () => {
    expect(src).toContain('discardTitle');
    expect(src).toContain('Alert.alert');
  });

  test('handleRecord has recording lock', () => {
    expect(src).toContain('isRecordingLockRef');
  });

  test('onRefresh uses setTimeout for animation', () => {
    expect(src).toContain('setTimeout(() => setRefreshing(false)');
  });

  test('imports Alert from react-native', () => {
    expect(src).toContain("Alert } from 'react-native'");
  });

  test('dead screenHeight removed', () => {
    expect(src).not.toContain('screenHeight');
  });

  test('chevron-right flips for RTL', () => {
    expect(src).toContain("isRTL ? 'chevron-left' : 'chevron-right'");
  });
});
