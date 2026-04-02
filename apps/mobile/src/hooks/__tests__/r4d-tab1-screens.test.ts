/**
 * R4D-Tab1 Screen Tests
 * Covers: playlist/[id], post/[id], post-insights, prayer-times, product-detail,
 * hashtag/[tag], hashtag-explore, hifz-tracker, image-editor, invite-friends
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

// ── playlist/[id].tsx ──

describe('playlist/[id]', () => {
  const src = readScreen('playlist/[id]');

  test('no hardcoded colors.dark.bg in stylesheet', () => {
    const styles = getStylesSection(src);
    expect(styles).not.toContain('colors.dark.bg');
  });

  test('uses tc.bg inline for container background', () => {
    expect(src).toContain('backgroundColor: tc.bg');
  });

  test('uses rtlFlexRow for RTL layout', () => {
    expect(src).toContain('rtlFlexRow(isRTL)');
  });

  test('has staleTime on queries', () => {
    expect(src).toContain('staleTime: 30_000');
  });

  test('has double-tap guard on video card', () => {
    expect(src).toContain('doubleTapRef.current');
  });

  test('uses haptic feedback on card press', () => {
    expect(src).toContain('haptic.navigate()');
  });

  test('has press feedback opacity on cards', () => {
    expect(src).toContain('pressed && { opacity: 0.7 }');
  });

  test('accessibility label uses i18n', () => {
    expect(src).toContain("t('accessibility.watchVideo'");
  });

  test('includes bottom safe area inset', () => {
    expect(src).toContain('insets.bottom + spacing.xl');
  });

  test('caps animation delay to prevent lag', () => {
    expect(src).toContain('Math.min(index, 10)');
  });

  test('has error state with retry', () => {
    expect(src).toContain('playlistQuery.isError');
    expect(src).toContain('itemsQuery.refetch()');
  });
});

// ── post/[id].tsx ──

describe('post/[id]', () => {
  const src = readScreen('post/[id]');

  test('createStyles uses tc.text.primary not colors.text.primary for comments', () => {
    const styles = getStylesSection(src);
    expect(styles).not.toContain('color: colors.text.primary');
  });

  test('createStyles uses tc.text.secondary for comment meta', () => {
    const styles = getStylesSection(src);
    expect(styles).toContain('tc.text.secondary');
  });

  test('createStyles uses tc.text.tertiary for timestamps', () => {
    const styles = getStylesSection(src);
    expect(styles).toContain('tc.text.tertiary');
  });

  test('has staleTime on post and comments queries', () => {
    const matches = src.match(/staleTime: 30_000/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  test('comment like haptic guarded by viewerId', () => {
    expect(src).toContain('if (!viewerId) return; likeMutation.mutate()');
  });

  test('handleCommentReaction has proper deps', () => {
    expect(src).toContain('[postId, comment.id]');
  });

  test('uses functional updaters in optimistic rollback', () => {
    expect(src).toContain('setLocalLiked((wasLiked: boolean)');
  });

  test('uses fonts.bodySemiBold not fontWeight for listenText', () => {
    expect(src).toContain('fonts.bodySemiBold');
  });

  test('view replies uses theme spacing tokens', () => {
    expect(src).toContain("paddingStart: spacing['2xl']");
  });

  test('imports fonts from theme', () => {
    expect(src).toContain("fonts } from '@/theme'");
  });
});

// ── post-insights.tsx ──

describe('post-insights', () => {
  const src = readScreen('post-insights');

  test('createStyles uses tc.text.primary for all text colors', () => {
    const styles = getStylesSection(src);
    expect(styles).not.toContain('color: colors.text.primary');
    expect(styles).toContain('tc.text.primary');
  });

  test('createStyles uses tc.text.secondary for labels', () => {
    const styles = getStylesSection(src);
    expect(styles).not.toContain('color: colors.text.secondary');
    expect(styles).toContain('tc.text.secondary');
  });

  test('has RTL support with rtlFlexRow', () => {
    expect(src).toContain('rtlFlexRow(isRTL)');
  });

  test('imports rtlFlexRow', () => {
    expect(src).toContain("import { rtlFlexRow }");
  });

  test('error handling shows toast', () => {
    expect(src).toContain('showToast');
    expect(src).toContain("variant: 'error'");
  });

  test('GlassHeader has accessibility label', () => {
    expect(src).toContain("accessibilityLabel: t('common.back'");
  });
});

// ── prayer-times.tsx ──

describe('prayer-times', () => {
  const src = readScreen('prayer-times');

  test('createStyles uses tc.text.primary for prayer names', () => {
    const styles = getStylesSection(src);
    expect(styles).toContain('tc.text.primary');
  });

  test('no colors.text.* in createStyles', () => {
    const styles = getStylesSection(src);
    expect(styles).not.toContain('color: colors.text.');
  });

  test('countdown timer uses i18n', () => {
    expect(src).toContain("t('islamic.nextPrayerIn'");
  });

  test('currentBadge uses radius.sm not hardcoded 4', () => {
    const styles = getStylesSection(src);
    const currentBadge = styles.slice(styles.indexOf('currentBadge'));
    expect(currentBadge).toContain('borderRadius: radius.sm');
  });

  test('nextBadge uses radius.sm', () => {
    const styles = getStylesSection(src);
    const nextBadge = styles.slice(styles.indexOf('nextBadge'));
    expect(nextBadge).toContain('borderRadius: radius.sm');
  });

  test('notifSettings query has staleTime', () => {
    expect(src).toContain('staleTime: 60_000');
  });

  test('has error state with retry', () => {
    expect(src).toContain("actionLabel={t('common.retry')}");
    expect(src).toContain('onAction={fetchData}');
  });
});

// ── product-detail.tsx ──

describe('product-detail', () => {
  const src = readScreen('product-detail');

  test('createStyles uses tc.text.primary for product title', () => {
    const styles = getStylesSection(src);
    expect(styles).toContain('tc.text.primary');
  });

  test('no colors.text.primary in createStyles (except gold/emerald brand)', () => {
    const styles = getStylesSection(src);
    expect(styles).not.toContain('color: colors.text.primary');
  });

  test('order mutation has onError handler', () => {
    expect(src).toContain('onError: (err: Error)');
    expect(src).toContain("variant: 'error'");
  });

  test('buy button has disabled prop', () => {
    expect(src).toContain('disabled={orderMutation.isPending}');
  });

  test('staleTime on product query', () => {
    expect(src).toContain('staleTime: 30_000');
  });

  test('seller profile accessibility uses i18n', () => {
    expect(src).toContain("t('accessibility.viewProfile'");
  });

  test('share button wired to Share.share', () => {
    expect(src).toContain('Share.share');
  });
});

// ── hashtag/[tag].tsx ──

describe('hashtag/[tag]', () => {
  const src = readScreen('hashtag/[tag]');

  test('no colors.text.primary in createStyles', () => {
    const styles = getStylesSection(src);
    expect(styles).not.toContain('color: colors.text.primary');
  });

  test('animation delay capped', () => {
    expect(src).toContain('Math.min(index, 10)');
  });

  test('GridItem has haptic feedback', () => {
    expect(src).toContain('haptic.navigate()');
  });

  test('has staleTime on query', () => {
    expect(src).toContain('staleTime: 30_000');
  });

  test('follow toggle shows toast', () => {
    expect(src).toContain('showToast');
  });

  test('has error state with retry', () => {
    expect(src).toContain('postsQuery.isError');
    expect(src).toContain("t('common.retry')");
  });
});

// ── hashtag-explore.tsx ──

describe('hashtag-explore', () => {
  const src = readScreen('hashtag-explore');

  test('no colors.dark.bg in static stylesheet', () => {
    const styles = getStylesSection(src);
    expect(styles).not.toContain('colors.dark.bg');
  });

  test('no colors.text.primary in static stylesheet', () => {
    const styles = getStylesSection(src);
    expect(styles).not.toContain('color: colors.text.primary');
  });

  test('animation delay capped', () => {
    expect(src).toContain('Math.min(index, 8)');
  });

  test('row press has opacity feedback', () => {
    expect(src).toContain('pressed && { opacity: 0.7 }');
  });

  test('navigates to hashtag detail not search-results', () => {
    expect(src).toContain("navigate('/(screens)/hashtag/'");
  });

  test('TextInput has returnKeyType', () => {
    expect(src).toContain('returnKeyType="search"');
  });

  test('has error state', () => {
    expect(src).toContain('isTrendingError');
    expect(src).toContain("t('common.retry')");
  });
});

// ── hifz-tracker.tsx ──

describe('hifz-tracker', () => {
  const src = readScreen('hifz-tracker');

  test('no colors.dark.bg in static stylesheet', () => {
    const styles = getStylesSection(src);
    expect(styles).not.toContain('colors.dark.bg');
  });

  test('no colors.dark.bgCard in static stylesheet', () => {
    const styles = getStylesSection(src);
    expect(styles).not.toContain('colors.dark.bgCard');
  });

  test('uses borderStartWidth not borderLeftWidth', () => {
    const styles = getStylesSection(src);
    expect(styles).toContain('borderStartWidth');
    expect(styles).not.toContain('borderLeftWidth');
  });

  test('uses borderStartColor not borderLeftColor in inline styles', () => {
    expect(src).toContain('borderStartColor');
    expect(src).not.toContain('borderLeftColor');
  });

  test('useMemo deps include tc', () => {
    expect(src).toContain('[stats, reviewList, isRTL, t, tc]');
  });

  test('updateMutation has onError handler', () => {
    expect(src).toContain("onError: (err: Error)");
  });

  test('review icon uses theme token not hardcoded hex', () => {
    expect(src).not.toContain('#F59E0B');
    expect(src).toContain('colors.extended.orange');
  });

  test('SurahRow uses inline tc colors', () => {
    expect(src).toContain('{ color: tc.text.primary }');
    expect(src).toContain('{ color: tc.text.secondary }');
    expect(src).toContain('{ color: tc.text.tertiary }');
  });
});

// ── image-editor.tsx ──

describe('image-editor', () => {
  const src = readScreen('image-editor');

  test('no colors.dark.bg in stylesheet', () => {
    const styles = getStylesSection(src);
    expect(styles).not.toContain('colors.dark.bg');
  });

  test('no colors.dark.border in stylesheet', () => {
    const styles = getStylesSection(src);
    expect(styles).not.toContain('colors.dark.border');
  });

  test('imports useContextualHaptic', () => {
    expect(src).toContain('useContextualHaptic');
  });

  test('haptic fires on tab switch', () => {
    expect(src).toContain("haptic.tick(); setActiveTab(tab)");
  });

  test('haptic fires on filter selection', () => {
    expect(src).toContain("haptic.tick(); setSelectedFilter(filter.id)");
  });

  test('uses marginStart not marginLeft for slider thumb', () => {
    const styles = getStylesSection(src);
    expect(styles).toContain('marginStart');
    expect(styles).not.toContain('marginLeft');
  });

  test('no unused screenHeight variable', () => {
    expect(src).not.toContain('screenHeight');
  });

  test('inline tc colors applied to text elements', () => {
    expect(src).toContain('{ color: tc.text.secondary }');
    expect(src).toContain('{ color: tc.text.tertiary }');
  });
});

// ── invite-friends.tsx ──

describe('invite-friends', () => {
  const src = readScreen('invite-friends');

  test('RTL support on copy button', () => {
    expect(src).toContain('rtlFlexRow(isRTL)');
  });

  test('imports rtlFlexRow', () => {
    expect(src).toContain("import { rtlFlexRow }");
  });

  test('copy button has accessibility role', () => {
    expect(src).toContain('accessibilityRole="button"');
  });

  test('share has double-tap prevention', () => {
    expect(src).toContain('sharingRef.current');
  });

  test('share blocks during loading', () => {
    expect(src).toContain('if (isLoading || sharingRef.current) return');
  });

  test('query has staleTime', () => {
    expect(src).toContain('staleTime: 300_000');
  });

  test('query destructures error state', () => {
    expect(src).toContain('isError');
    expect(src).toContain('refetch');
  });

  test('copy button has press feedback', () => {
    expect(src).toContain('pressed && { opacity: 0.7 }');
  });
});
