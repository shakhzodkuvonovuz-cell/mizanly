/**
 * R4D-Tab3 Screen Tests
 * Covers: video-editor, video-premiere, voice-post-create, voice-recorder,
 * volunteer-board, theme-settings, thread/[id], trending-audio,
 * verify-encryption, video/[id]
 */
import * as fs from 'fs';
import * as path from 'path';

const SCREENS_DIR = path.resolve(__dirname, '../../../app/(screens)');

function readScreen(name: string): string {
  return fs.readFileSync(path.join(SCREENS_DIR, `${name}.tsx`), 'utf-8');
}

// ── theme-settings.tsx ──

describe('theme-settings', () => {
  const src = readScreen('theme-settings');

  test('uses tc.text.* not colors.text.* in styles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.text.primary');
    expect(stylesSection).not.toContain('colors.text.secondary');
    expect(stylesSection).not.toContain('colors.text.tertiary');
  });

  test('imports useContextualHaptic', () => {
    expect(src).toContain("import { useContextualHaptic }");
  });

  test('haptic.tick on theme selection', () => {
    expect(src).toContain('haptic.tick()');
  });

  test('theme-aware gradients use tc.isDark', () => {
    expect(src).toContain('tc.isDark');
  });

  test('no hardcoded paddingTop: 100', () => {
    expect(src).not.toContain('paddingTop: 100');
  });

  test('uses tc.border not colors.active.white6', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.active.white6');
  });

  test('has ScreenErrorBoundary', () => {
    expect(src).toContain('ScreenErrorBoundary');
  });
});

// ── video-premiere.tsx ──

describe('video-premiere', () => {
  const src = readScreen('video-premiere');

  test('uses tc.text.* not colors.text.* in styles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.text.primary');
    expect(stylesSection).not.toContain('colors.text.secondary');
    expect(stylesSection).not.toContain('colors.text.tertiary');
  });

  test('ScrollView has keyboard handling', () => {
    expect(src).toContain('keyboardShouldPersistTaps');
    expect(src).toContain('keyboardDismissMode');
  });

  test('handles missing videoId params', () => {
    expect(src).toContain('if (!videoId)');
  });

  test('haptic on theme selection and scheduling', () => {
    expect(src).toContain('haptic.tick()');
    expect(src).toContain('haptic.save()');
  });

  test('has error toast on mutation failure', () => {
    expect(src).toContain('onError');
    expect(src).toContain('somethingWentWrong');
  });
});

// ── voice-post-create.tsx ──

describe('voice-post-create', () => {
  const src = readScreen('voice-post-create');

  test('uses tc.text.* not colors.text.* in styles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.text.primary');
    expect(stylesSection).not.toContain('colors.text.secondary');
    expect(stylesSection).not.toContain('colors.text.tertiary');
  });

  test('has SafeAreaView', () => {
    expect(src).toContain('SafeAreaView');
  });

  test('has StatusBar component', () => {
    expect(src).toContain('StatusBar');
  });

  test('recording cleanup on unmount stops recording', () => {
    expect(src).toContain('recordingRef.current.stopAndUnloadAsync');
  });

  test('startRecording error handler shows toast', () => {
    // The catch block should show a toast, not be empty
    expect(src).toContain('recordingFailed');
    expect(src).toContain('haptic.error()');
  });

  test('post mutation has onError', () => {
    expect(src).toContain('onError');
  });
});

// ── voice-recorder.tsx ──

describe('voice-recorder', () => {
  const src = readScreen('voice-recorder');

  test('uses haptic.tick not haptic.send for recording', () => {
    expect(src).not.toContain('haptic.send()');
    expect(src).toContain('haptic.tick()');
  });

  test('no double safe-area padding (no insets.top in content padding)', () => {
    // Should use paddingTop: 52, not paddingTop: insets.top + 52
    expect(src).toContain("paddingTop: 52");
    expect(src).not.toContain("paddingTop: insets.top + 52");
  });

  test('theme-aware gradient uses tc.isDark', () => {
    expect(src).toContain('tc.isDark');
  });

  test('uses tc.border not colors.active.white6', () => {
    const stylesSection = src.slice(src.indexOf('const createS'));
    expect(stylesSection).not.toContain('colors.active.white6');
  });

  test('has audio cleanup on unmount', () => {
    expect(src).toContain('sound.current?.unloadAsync');
    expect(src).toContain('recording.current?.stopAndUnloadAsync');
  });
});

// ── volunteer-board.tsx ──

describe('volunteer-board', () => {
  const src = readScreen('volunteer-board');

  test('uses tc.text.* not colors.text.* in styles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.text.primary');
    expect(stylesSection).not.toContain('colors.text.secondary');
    expect(stylesSection).not.toContain('colors.text.tertiary');
  });

  test('signUpMutation has onError handler', () => {
    expect(src).toContain('onError');
    expect(src).toContain('somethingWentWrong');
  });

  test('signUpMutation has success toast', () => {
    expect(src).toContain('signUpSuccess');
  });

  test('uses haptic.tick not haptic.follow for sign-up', () => {
    expect(src).not.toContain('haptic.follow()');
  });

  test('spotsTotal divide-by-zero guard', () => {
    expect(src).toContain('item.spotsTotal > 0');
  });

  test('animation delay is capped', () => {
    expect(src).toContain('Math.min(index');
  });

  test('imports showToast', () => {
    expect(src).toContain("import { showToast }");
  });
});

// ── trending-audio.tsx ──

describe('trending-audio', () => {
  const src = readScreen('trending-audio');

  test('uses tc.text.* not colors.text.* in styles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.text.primary');
    expect(stylesSection).not.toContain('colors.text.secondary');
    expect(stylesSection).not.toContain('colors.text.tertiary');
  });

  test('audio playback uses ref for playingId (no stale closure)', () => {
    expect(src).toContain('playingIdRef');
  });

  test('audio playback has mutex guard', () => {
    expect(src).toContain('audioMutex');
  });

  test('sound cleanup on unmount', () => {
    expect(src).toContain('soundRef.current?.unloadAsync');
  });

  test('animation delay is capped', () => {
    expect(src).toContain('Math.min(index');
  });

  test('theme-aware gradient uses tc.isDark', () => {
    expect(src).toContain('tc.isDark');
  });

  test('uses tc.border not colors.active.white6', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.active.white6');
  });
});

// ── verify-encryption.tsx ──

describe('verify-encryption', () => {
  const src = readScreen('verify-encryption');

  test('uses tc.text.* not colors.text.* in styles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.text.primary');
    expect(stylesSection).not.toContain('colors.text.secondary');
    expect(stylesSection).not.toContain('colors.text.tertiary');
  });

  test('no `as any` in production code', () => {
    // Only allowed in tests
    expect(src).not.toContain('as any');
  });

  test('safety number uses stronger hash (not djb2/LCG)', () => {
    // Should not contain the simple djb2 hash pattern
    expect(src).not.toContain('hash << 5) - hash');
    // Should not contain LCG
    expect(src).not.toContain('1103515245');
  });

  test('unmark verification requires confirmation dialog', () => {
    expect(src).toContain('Alert.alert');
    expect(src).toContain('unverifyTitle');
  });

  test('haptic.success fires after async, not before', () => {
    // In handleMarkVerified, haptic should come after setItem
    const markFn = src.slice(src.indexOf('handleMarkVerified'), src.indexOf('handleUnmark'));
    const setItemIdx = markFn.indexOf('setItem');
    const hapticIdx = markFn.indexOf('haptic.success()');
    expect(hapticIdx).toBeGreaterThan(setItemIdx);
  });

  test('no hardcoded paddingTop: 100 or 120', () => {
    expect(src).not.toContain('paddingTop: 100');
    expect(src).not.toContain('paddingTop: 120');
  });

  test('theme-aware gradient cards use tc.isDark', () => {
    expect(src).toContain('tc.isDark');
  });

  test('screenshot prevention enabled', () => {
    expect(src).toContain('preventScreenCaptureAsync');
    expect(src).toContain('allowScreenCaptureAsync');
  });
});

// ── thread/[id].tsx ──

describe('thread/[id]', () => {
  const src = readScreen('thread/[id]');

  test('uses tc.text.* not colors.text.* in styles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.text.primary');
    expect(stylesSection).not.toContain('colors.text.secondary');
    expect(stylesSection).not.toContain('colors.text.tertiary');
  });

  test('send button has double-tap guard via isPending', () => {
    expect(src).toContain('sendMutation.isPending');
  });

  test('KeyboardAvoidingView works on both platforms', () => {
    expect(src).toContain("'height'");
  });

  test('listen button uses volume-2 icon (not volume-x)', () => {
    expect(src).toContain('volume-2');
    expect(src).not.toContain('volume-x');
  });

  test('Android BlurView fallback is theme-aware', () => {
    expect(src).toContain("tc.isDark ? 'rgba(13, 17, 23, 0.95)' : 'rgba(255, 255, 255, 0.95)'");
  });

  test('has RTL support', () => {
    expect(src).toContain('rtlFlexRow');
    expect(src).toContain('rtlTextAlign');
  });
});

// ── video/[id].tsx ──

describe('video/[id]', () => {
  const src = readScreen('video/[id]');

  test('uses tc.text.* not colors.text.* in styles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.text.primary');
    expect(stylesSection).not.toContain('colors.text.secondary');
    expect(stylesSection).not.toContain('colors.text.tertiary');
  });

  test('uses ProgressiveImage for thumbnails (not Animated.Image)', () => {
    expect(src).toContain("import { ProgressiveImage }");
  });

  test('dislike has guard against concurrent mutations', () => {
    expect(src).toContain('dislikeMutation.isPending || removeReactionMutation.isPending');
  });

  test('comment submit has double-tap guard', () => {
    expect(src).toContain('commentMutation.isPending');
  });

  test('uses marginEnd not marginRight for RTL', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('marginRight');
  });

  test('Android BlurView fallback is theme-aware', () => {
    expect(src).toContain("tc.isDark ? 'rgba(13, 17, 23, 0.95)'");
  });

  test('save-to-playlist uses bookmark icon', () => {
    expect(src).toContain('name="bookmark" size="sm"');
  });

  test('quality selector shows toast instead of silently failing', () => {
    expect(src).toContain('qualityUnavailable');
  });
});

// ── video-editor.tsx ──

describe('video-editor', () => {
  const src = readScreen('video-editor');

  test('uses tc.text.* not colors.text.* in styles', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toContain('colors.text.primary');
    expect(stylesSection).not.toContain('colors.text.secondary');
    expect(stylesSection).not.toContain('colors.text.tertiary');
  });

  test('no hardcoded borderRadius >= 6 (uses tokens)', () => {
    const stylesSection = src.slice(src.indexOf('const createStyles'));
    expect(stylesSection).not.toMatch(/borderRadius: [7-9]\b/);
    expect(stylesSection).not.toMatch(/borderRadius: 1[0-9]\b/);
  });

  test('playhead position guards against NaN (division by zero)', () => {
    expect(src).toContain('totalDuration > 0');
  });

  test('nav timer cleanup on unmount', () => {
    expect(src).toContain('navTimerRef');
    expect(src).toContain('clearTimeout(navTimerRef.current)');
  });

  test('recording cleanup on unmount', () => {
    expect(src).toContain('recordingRef.current.stopAndUnloadAsync');
  });

  test('Speech cleanup on unmount', () => {
    expect(src).toContain('Speech.stop()');
  });

  test('font selection has haptic feedback', () => {
    expect(src).toContain('setSelectedFont(font); haptic.tick()');
  });

  test('speed selection has haptic feedback', () => {
    expect(src).toContain('setPlaybackSpeed(speed); haptic.tick()');
  });

  test('export has double-tap guard (isExporting check)', () => {
    expect(src).toContain('if (isExporting) return');
  });

  test('undo/redo buttons have disabled prop and accessibilityState', () => {
    expect(src).toContain('disabled={undoStack.length === 0}');
    expect(src).toContain('disabled={redoStack.length === 0}');
    expect(src).toContain('accessibilityState={{ disabled: undoStack.length === 0 }}');
  });

  test('bottom bar has safe area inset', () => {
    expect(src).toContain('paddingBottom: insets.bottom');
  });

  test('uses useWindowDimensions instead of module-scope Dimensions', () => {
    expect(src).toContain('useWindowDimensions()');
  });

  test('RTL-aware scaleX on redo icon', () => {
    expect(src).toContain('isRTL ? 1 : -1');
  });

  test('ScrollView has keyboard handling', () => {
    expect(src).toContain('keyboardShouldPersistTaps');
  });

  test('voiceover error uses recording-specific message (not exportFailed)', () => {
    // The recording start catch should NOT use exportFailed
    const recordingStartSection = src.slice(
      src.indexOf('// Start recording'),
      src.indexOf('// Start recording') + 1000
    );
    expect(recordingStartSection).toContain('recordingFailed');
    expect(recordingStartSection).not.toContain('exportFailed');
  });

  test('play/pause accessibility label differentiates states', () => {
    expect(src).toContain("isPlaying ? t('videoEditor.pause'");
  });
});
