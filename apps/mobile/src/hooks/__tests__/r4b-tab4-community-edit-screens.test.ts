/**
 * R4B-Tab4 Screen Tests
 * Covers: community-guidelines, community-posts, contact-sync,
 * content-filter-settings, content-settings, edit-channel, edit-profile,
 * eid-cards, enable-tips, end-screen-editor
 */
import * as fs from 'fs';
import * as path from 'path';

const SCREENS_DIR = path.resolve(__dirname, '../../../app/(screens)');

function readScreen(name: string): string {
  return fs.readFileSync(path.join(SCREENS_DIR, `${name}.tsx`), 'utf-8');
}

// ── community-guidelines.tsx ──

describe('community-guidelines', () => {
  const src = readScreen('community-guidelines');

  test('uses i18n keys instead of hardcoded English strings', () => {
    // Titles should use t() with i18n keys, not hardcoded strings
    expect(src).toContain('titleKey:');
    expect(src).toContain('ruleKeys:');
    expect(src).not.toContain("title: 'Respect & Kindness'");
    expect(src).not.toContain("title: 'Safety'");
  });

  test('uses expo-status-bar auto-management (no hardcoded StatusBar)', () => {
    expect(src).not.toContain('<StatusBar barStyle');
    // Screen uses SafeAreaView for safe area handling
    expect(src).toContain('SafeAreaView');
  });

  test('uses useContextualHaptic', () => {
    expect(src).toContain('useContextualHaptic');
    expect(src).toContain('haptic.tick()');
  });

  test('wraps in ScreenErrorBoundary', () => {
    expect(src).toContain('<ScreenErrorBoundary>');
  });
});

// ── community-posts.tsx ──

describe('community-posts', () => {
  const src = readScreen('community-posts');

  test('delete post has confirmation dialog', () => {
    expect(src).toContain('Alert.alert');
    expect(src).toContain('confirmDeleteTitle');
  });

  test('uses useContextualHaptic', () => {
    expect(src).toContain('useContextualHaptic');
    expect(src).toContain('haptic.tick()');
  });

  test('operator precedence fixed on disabled prop', () => {
    expect(src).toContain('(!composeText.trim() && selectedMediaList.length === 0) || createMutation.isPending');
  });

  test('animation is capped for first N items', () => {
    expect(src).toContain('index < 10 ?');
  });

  test('RichText gets theme color for post content', () => {
    expect(src).toContain("styles.postContent, { color: tc.text.primary }");
  });

  test('composeInput gets theme text color', () => {
    expect(src).toContain("{ backgroundColor: tc.bgElevated, color: tc.text.primary }");
  });

  test('staleTime is set on queries', () => {
    expect(src).toContain('staleTime: 30_000');
  });

  test('does not use RNImage for media preview', () => {
    expect(src).not.toContain('RNImage source=');
    // ProgressiveImage is used instead
    expect(src).toContain('<ProgressiveImage uri={media.uri}');
  });

  test('uses expo-status-bar auto-management (no hardcoded StatusBar)', () => {
    expect(src).not.toContain('<StatusBar barStyle');
    // Screen uses GlassHeader for status bar area management
    expect(src).toContain('GlassHeader');
  });

  test('unlike count has theme color', () => {
    expect(src).toContain("styles.postActionCount, { color: tc.text.secondary }");
  });
});

// ── contact-sync.tsx ──

describe('contact-sync', () => {
  const src = readScreen('contact-sync');

  test('has error state with retry', () => {
    expect(src).toContain('fetchError');
    expect(src).toContain('<EmptyState');
    expect(src).toContain('onAction={fetchContacts}');
  });

  test('uses useContextualHaptic', () => {
    expect(src).toContain('useContextualHaptic');
  });

  test('animation is capped for first 10 items', () => {
    expect(src).toContain('index < 10 ?');
  });

  test('row border uses theme color', () => {
    expect(src).toContain("styles.row, { borderColor: tc.border }");
  });

  test('skeleton spacing uses spacing token', () => {
    expect(src).toContain('gap: spacing.sm');
    expect(src).not.toContain('gap: 6 }');
  });

  test('uses expo-status-bar auto-management (no hardcoded StatusBar)', () => {
    expect(src).not.toContain('<StatusBar barStyle');
    // Screen uses GlassHeader for status bar area management
    expect(src).toContain('GlassHeader');
  });
});

// ── content-filter-settings.tsx ──

describe('content-filter-settings', () => {
  const src = readScreen('content-filter-settings');

  test('has error state handling', () => {
    expect(src).toContain('settingsQuery.isError');
    expect(src).toContain('<EmptyState');
  });

  test('uses useContextualHaptic', () => {
    expect(src).toContain('useContextualHaptic');
    expect(src).toContain('haptic.tick()');
  });

  test('mutation has onError with rollback', () => {
    expect(src).toContain('setLocalLevel(null)');
    expect(src).toContain('setLocalBlurHaram(null)');
    expect(src).toContain('setLocalHideMusic(null)');
    expect(src).toContain('setLocalHideMixedGender(null)');
  });

  test('thumbColor uses theme instead of hardcoded #fff', () => {
    expect(src).not.toContain('thumbColor="#fff"');
    expect(src).toContain('thumbColor={tc.bgCard}');
  });

  test('separator uses theme border color', () => {
    expect(src).toContain("styles.separator, { backgroundColor: tc.border }");
  });

  test('level card border uses theme', () => {
    expect(src).toContain("{ borderColor: tc.border }");
  });

  test('level title gets theme text color for non-selected', () => {
    expect(src).toContain("{ color: tc.text.primary }");
  });

  test('uses expo-status-bar auto-management (no hardcoded StatusBar)', () => {
    expect(src).not.toContain('<StatusBar barStyle');
    // Screen uses GlassHeader for status bar area management
    expect(src).toContain('GlassHeader');
  });
});

// ── content-settings.tsx ──

describe('content-settings', () => {
  const src = readScreen('content-settings');

  test('error state uses EmptyState with GlassHeader', () => {
    // Error state should have both GlassHeader and EmptyState
    const errorBlock = src.indexOf('settingsQuery.isError');
    const nextReturn = src.indexOf('return', errorBlock);
    const errorJsx = src.slice(nextReturn, nextReturn + 500);
    expect(errorJsx).toContain('GlassHeader');
    expect(errorJsx).toContain('EmptyState');
  });

  test('loading state has GlassHeader', () => {
    const loadingBlock = src.indexOf('settingsQuery.isLoading');
    const nextReturn = src.indexOf('return', loadingBlock);
    const loadingJsx = src.slice(nextReturn, nextReturn + 500);
    expect(loadingJsx).toContain('GlassHeader');
  });

  test('uses useContextualHaptic', () => {
    expect(src).toContain('useContextualHaptic');
    expect(src).toContain('haptic.tick()');
  });

  test('queries have staleTime', () => {
    expect(src).toContain('staleTime: 30_000');
  });

  test('card border uses theme', () => {
    expect(src).toContain("styles.card, { borderColor: tc.border }");
  });

  test('divider uses theme', () => {
    expect(src).toContain("styles.divider, { backgroundColor: tc.border }");
  });

  test('uses expo-status-bar auto-management (no hardcoded StatusBar)', () => {
    expect(src).not.toContain('<StatusBar barStyle');
    // Screen uses SafeAreaView for status bar area management
    expect(src).toContain('SafeAreaView');
  });
});

// ── edit-channel.tsx ──

describe('edit-channel', () => {
  const src = readScreen('edit-channel');

  test('has KeyboardAvoidingView wrapping ScrollView', () => {
    expect(src).toContain('KeyboardAvoidingView');
    const kbaIdx = src.indexOf('<KeyboardAvoidingView');
    const scrollIdx = src.indexOf('<ScrollView', kbaIdx);
    expect(scrollIdx).toBeGreaterThan(kbaIdx);
  });

  test('error state has retry option', () => {
    expect(src).toContain("actionLabel={t('common.retry')}");
  });

  test('uses expo-status-bar auto-management (no hardcoded StatusBar)', () => {
    expect(src).not.toContain('<StatusBar barStyle');
    // Screen uses GlassHeader for status bar area management
    expect(src).toContain('GlassHeader');
  });

  test('unsaved changes guard exists', () => {
    expect(src).toContain('isDirty');
    expect(src).toContain('Alert.alert');
  });
});

// ── edit-profile.tsx ──

describe('edit-profile', () => {
  const src = readScreen('edit-profile');

  test('KeyboardAvoidingView wraps ScrollView', () => {
    expect(src).toContain('<KeyboardAvoidingView');
    const kbaIdx = src.indexOf('<KeyboardAvoidingView');
    const scrollIdx = src.indexOf('<ScrollView', kbaIdx);
    expect(scrollIdx).toBeGreaterThan(kbaIdx);
  });

  test('uses useContextualHaptic', () => {
    expect(src).toContain('useContextualHaptic');
    expect(src).toContain('haptic.save()');
  });

  test('cover and avatar have accessibility roles', () => {
    expect(src).toContain('accessibilityRole="button" accessibilityLabel={t(\'editProfile.changeCover\'');
    expect(src).toContain('accessibilityRole="button" accessibilityLabel={t(\'editProfile.changeAvatar\'');
  });

  test('private toggle uses switch role', () => {
    expect(src).toContain('accessibilityRole="switch"');
    expect(src).toContain('accessibilityState={{ checked: isPrivate }}');
  });

  test('unsaved changes guard', () => {
    expect(src).toContain('isDirty');
    expect(src).toContain('handleBack');
    expect(src).toContain('Alert.alert');
  });

  test('no unused Switch import', () => {
    // Switch was removed from imports (dead import)
    expect(src).not.toMatch(/import.*\bSwitch\b.*from 'react-native'/);
  });

  test('uses expo-status-bar auto-management (no hardcoded StatusBar)', () => {
    expect(src).not.toContain('<StatusBar barStyle');
    // Screen uses GlassHeader for status bar area management
    expect(src).toContain('GlassHeader');
  });
});

// ── eid-cards.tsx ──

describe('eid-cards', () => {
  const src = readScreen('eid-cards');

  test('uses useContextualHaptic', () => {
    expect(src).toContain('useContextualHaptic');
    expect(src).toContain('haptic.tick()');
  });

  test('SafeAreaView includes bottom edge', () => {
    expect(src).toContain("edges={['top', 'bottom']}");
  });

  test('card has press feedback', () => {
    expect(src).toContain('pressed && { opacity: 0.85');
    expect(src).toContain('android_ripple');
  });

  test('no no-op BrandedRefreshControl', () => {
    expect(src).not.toContain('BrandedRefreshControl');
    expect(src).not.toContain('onRefresh={() => {}}');
  });

  test('English card name has fontFamily', () => {
    const cardNameStyle = src.indexOf('cardName:');
    const section = src.slice(cardNameStyle, cardNameStyle + 200);
    expect(section).toContain('fontFamily: fonts.body');
  });

  test('uses expo-status-bar auto-management (no hardcoded StatusBar)', () => {
    expect(src).not.toContain('<StatusBar barStyle');
    // Screen uses SafeAreaView for status bar area management
    expect(src).toContain('SafeAreaView');
  });
});

// ── enable-tips.tsx ──

describe('enable-tips', () => {
  const src = readScreen('enable-tips');

  test('loading state renders skeleton', () => {
    expect(src).toContain('loading && !refreshing');
    expect(src).toContain('<Skeleton.Rect');
  });

  test('error state renders EmptyState', () => {
    expect(src).toContain('if (error)');
    expect(src).toContain('<EmptyState');
  });

  test('has KeyboardAvoidingView', () => {
    expect(src).toContain('KeyboardAvoidingView');
  });

  test('no unused Dimensions import', () => {
    expect(src).not.toContain('Dimensions.get');
  });

  test('save button has disabled state', () => {
    expect(src).toContain('disabled={submitting}');
  });

  test('uses expo-status-bar auto-management (no hardcoded StatusBar)', () => {
    expect(src).not.toContain('<StatusBar barStyle');
    // Screen uses SafeAreaView for status bar area management
    expect(src).toContain('SafeAreaView');
  });
});

// ── end-screen-editor.tsx ──

describe('end-screen-editor', () => {
  const src = readScreen('end-screen-editor');

  test('CRITICAL: no setState inside useQuery select', () => {
    // The select callback should NOT contain setState calls
    const selectIdx = src.indexOf('select:');
    // There should be no select callback at all now
    expect(selectIdx).toBe(-1);
  });

  test('uses useEffect to initialize items from query data', () => {
    expect(src).toContain('useEffect');
    expect(src).toContain('endScreenData');
    expect(src).toContain('setItems(endScreenData.map(mapToEndScreenDraft))');
  });

  test('has error state handling', () => {
    expect(src).toContain('isError');
    expect(src).toContain('<EmptyState');
  });

  test('uses useContextualHaptic', () => {
    expect(src).toContain('useContextualHaptic');
    expect(src).toContain('haptic.success()');
    expect(src).toContain('haptic.error()');
  });

  test('delete has confirmation dialog', () => {
    expect(src).toContain('Alert.alert');
    expect(src).toContain('confirmRemove');
  });

  test('unsaved changes guard on back', () => {
    expect(src).toContain('isDirty');
    expect(src).toContain('handleBack');
  });

  test('unique draft IDs prevent key collision', () => {
    expect(src).toContain('draftCounter');
    expect(src).toContain('draft-${Date.now()}-${draftCounter}');
  });

  test('no dead BottomSheet code', () => {
    expect(src).not.toContain('BottomSheet');
    expect(src).not.toContain('positionSheetIndex');
  });

  test('SafeAreaView includes bottom edge', () => {
    expect(src).toContain("edges={['top', 'bottom']}");
  });

  test('paddingTop uses insets not hardcoded 100', () => {
    expect(src).toContain('paddingTop: insets.top + 52');
    expect(src).not.toContain('paddingTop: 100');
  });

  test('info text has writingDirection for RTL', () => {
    expect(src).toContain("writingDirection: 'auto'");
  });

  test('field labels get theme color', () => {
    expect(src).toContain("styles.fieldLabel, { color: tc.text.secondary }");
  });
});
