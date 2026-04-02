# YOU ARE TAB 1. YOUR AUDIT FILES ARE D27 + D20. DO NOT TOUCH ANY OTHER FILES. DO NOT SPAWN SUBAGENTS.

# FIX SESSION — Round 4D Tab 1: Playlists/Post Detail/Post Insights/Prayer Times/Product Detail + Hashtag/Hifz/Image Editor/Invite Friends (D27 + D20)

> 130 findings across 10 screens. D27 (74): playlist/[id], post/[id], post-insights, prayer-times, product-detail. D20 (56): hashtag/[tag], hashtag-explore, hifz-tracker, image-editor, invite-friends.
> **YOUR JOB: Read D27.md + D20.md. Fix the findings in THOSE files. Nothing else.**

---

## RULES — NON-NEGOTIABLE (learned from 20 previous agent sessions)

### RULE 0: YOU ARE BEING AUDITED
A hostile auditor will grep every file you touched, count every status row in your progress file, verify every "FIXED" claim at the code level, and cross-check your accounting equation. The auditor has caught across 20 sessions: invented "REMAINING" categories to hide 63 items, inflated FIXED counts by 26, fabricated reference counts ("38+ references" when actual was 1), deferred 47% of work while claiming 10%, and wrote TODO comments marked as "FIXED." The best agent in this project self-audited its own summary, caught a 4-item inflation, corrected it, and documented the correction. Be that agent.

### RULE 1: TOTAL ACCOUNTING — every finding by ID
Your progress file MUST list every finding with exactly one status. The equation MUST balance:
```
FIXED + DEFERRED + ALREADY_FIXED + NOT_A_BUG = TOTAL_IN_FILES
```
D27 has 74 findings. D20 has 56. You document all 130. No "REMAINING" category. No "TODO" status. No silent skips. The auditor counts rows and verifies the sum matches the total.

### RULE 2: DEFERRAL CAP — 15% HARD LIMIT (max 19 items)
Every deferral needs a SPECIFIC TECHNICAL BLOCKER — not "low priority", not "polish", not "enhancement", not "minor", not "acceptable", not "edge case." The blocker must name what prevents you from fixing it RIGHT NOW: a missing npm dependency, a backend API endpoint that doesn't exist, an architectural change that affects 10+ files. If you can fix it in under 5 minutes, it is NOT a deferral — it is laziness.

### RULE 3: FIX ALL SEVERITIES — Low and Info are NOT optional
Previous agents fixed all Criticals and Highs then deferred every Low as "low priority." This is the single most common failure mode. A Low-severity hardcoded color takes 30 seconds to fix. An Info-severity dead import takes 10 seconds to delete. An Info-severity magic number takes 15 seconds to replace with a spacing token. Fix them ALL. The deferral cap applies to ALL severities combined — you cannot "save" your deferral budget by skipping Lows.

### RULE 4: "FIXED" = CODE CHANGED
Not a TODO comment. Not a console.log added. Not "acceptable as-is." Not "already works fine." If the audit found a problem and you write FIXED, the code must be different from before. The auditor diffs every claimed fix.

### RULE 5: "NOT_A_BUG" REQUIRES EVIDENCE
Every NOT_A_BUG must include a 1-sentence technical justification proving the finding is wrong. Examples of GOOD evidence: "White text on emerald gradient is correct — tc.text.primary would be invisible on green in light mode." "QR code is a data URI, not a network image — ProgressiveImage is for network images only." Examples of BAD evidence: "Works fine." "Acceptable." "Standard pattern." The auditor reclassified 7 lazy NOT_A_BUGs to FIXED in Round 4B.

### RULE 6: TESTS — minimum 20 meaningful tests
Tests must assert specific behavior. `expect(result).toBeDefined()` alone does not count. Good tests: component renders without crash, correct theme token used (not hardcoded hex), no hardcoded English strings in render output, cleanup fires on unmount, error handler called on mutation failure, double-tap guard prevents re-fire.

### RULE 7: READ BEFORE EDIT
For every fix: Read the actual screen file FIRST using the Read tool. Understand surrounding code. Don't grep-replace blindly across files. The auditor caught agents who "fixed" patterns that were intentionally different in context.

### RULE 8: PATTERN COMPLETION
When you fix `colors.dark.bg` in one screen, grep ALL 10 screens for the same pattern and fix every instance. Not 4 of 5. Not "and similar changes for the rest." All 10. Show the grep command and the result count. The auditor greps independently.

### RULE 9: CHECKPOINT PROTOCOL
After every 2-3 screens: run `cd apps/mobile && npx tsc --noEmit`, fix any errors you introduced, then commit with a descriptive message. Format: `fix(mobile): R4D-T1 CP[N] — [screens] [summary]`. No batching all 10 screens into one mega-commit. No committing without running tsc first.

### RULE 10: NO SUBAGENTS FOR CODE
Do everything directly. Subagents produce buggy, shallow work that requires a Part 2 session to clean up.

### RULE 11: NO CO-AUTHORED-BY
No AI attribution in commits. Per CLAUDE.md standing rules.

### RULE 12: SELF-AUDIT BEFORE SUBMISSION
Before writing "COMPLETE" or "Status: COMPLETE": go back to your per-screen tables and manually count the rows in each status category. Sum them across all 10 screens. Compare the sums to your summary table. If they don't match, the summary is wrong — fix it. Do NOT inflate the summary to look better. Document the self-audit: "Self-audit: per-screen sums = X FIXED + Y DEFERRED + Z NOT_A_BUG = TOTAL. Summary matches."

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — especially the Mobile Screen Rules section. It defines which components to use:
   - `<Skeleton>` for loading states — NOT `<ActivityIndicator>` (buttons are OK)
   - `<EmptyState>` for empty/error states — NOT bare `<Text>No items</Text>`
   - `<BottomSheet>` — NOT React Native `<Modal>`
   - `showToast()` for mutation feedback — NOT `Alert.alert` for non-destructive actions
   - `<BrandedRefreshControl>` — NOT raw `<RefreshControl>`
   - `<ProgressiveImage>` — NOT raw `<Image>` from expo-image for content
   - `useContextualHaptic()` — NOT `useHaptic()`
   - `useThemeColors()` → `tc.*` — NOT `colors.dark.*` directly in JSX
   - `formatCount()` for engagement numbers
   - `radius.*` from theme — NOT hardcoded `borderRadius >= 6`

2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references — especially:
   - `feedback_fix_all_severities.md` — every severity is mandatory
   - `feedback_no_git_shortcuts.md` — stage specific files, read before commit
   - `feedback_always_test.md` — testing is a religious rule
   - `feedback_implement_all.md` — implement ALL findings, never skip

3. Read BOTH audit files IN FULL — every row, every finding, every severity:
   - `docs/audit/v2/wave4/D27.md` (74 findings — playlist/[id], post/[id], post-insights, prayer-times, product-detail)
   - `docs/audit/v2/wave4/D20.md` (56 findings — hashtag/[tag], hashtag-explore, hifz-tracker, image-editor, invite-friends)

4. Create your progress file: `docs/audit/v2/fixes/R4D_TAB1_PROGRESS.md`

---

## YOUR SCOPE — 10 screens

```
apps/mobile/app/(screens)/playlist/[id].tsx
apps/mobile/app/(screens)/post/[id].tsx
apps/mobile/app/(screens)/post-insights.tsx
apps/mobile/app/(screens)/prayer-times.tsx
apps/mobile/app/(screens)/product-detail.tsx
apps/mobile/app/(screens)/hashtag/[tag].tsx
apps/mobile/app/(screens)/hashtag-explore.tsx
apps/mobile/app/(screens)/hifz-tracker.tsx
apps/mobile/app/(screens)/image-editor.tsx
apps/mobile/app/(screens)/invite-friends.tsx
```

**FORBIDDEN — do NOT touch these:**
- Backend API code (`apps/api/`)
- Prisma schema (`apps/api/prisma/schema.prisma`)
- Signal protocol files (`apps/mobile/src/services/signal/`)
- Shared components in `apps/mobile/src/components/` — only fix screen-level code
- Hooks in `apps/mobile/src/hooks/` — only fix screen-level code
- Any screen file NOT listed above

**SPECIAL NOTES:**
- `post/[id].tsx` is a high-traffic screen (every post tap lands here) — loading/error/empty states must be production-grade. Skeleton while loading, EmptyState with retry on error, proper content rendering.
- `prayer-times.tsx` uses `expo-sensors` (Magnetometer for qibla direction) — type declarations exist at `src/types/expo-sensors.d.ts`. Import `MagnetometerMeasurement` if needed.
- `hifz-tracker.tsx` contains Islamic Quran tracking content — the data (surah names, juz boundaries) is curated by the user personally. NEVER AI-generate Quran content per CLAUDE.md.
- `image-editor.tsx` has complex canvas/filter state — handle timer cleanup on unmount carefully. Multiple useEffect cleanups may be needed.
- `product-detail.tsx` handles commerce — ensure price display, add-to-cart, and purchase actions have proper error handling and double-tap prevention.
- `invite-friends.tsx` may access contacts — handle permission denial gracefully.

---

## COMMON FIX PATTERNS — apply to EVERY screen

### Theme-aware colors (most common finding across all rounds)
```typescript
// WRONG — hardcoded dark theme in StyleSheet.create:
backgroundColor: '#0D1117'            // or colors.dark.bg
color: '#C9D1D9'                      // or colors.text.secondary
borderColor: 'rgba(255,255,255,0.1)'  // or colors.dark.border

// RIGHT — remove from StyleSheet, apply inline with theme hook:
const tc = useThemeColors();
style={[styles.container, { backgroundColor: tc.bg }]}
style={[styles.text, { color: tc.text.primary }]}
style={[styles.card, { borderColor: tc.border }]}
```

### Loading states
```typescript
// WRONG:
if (isLoading) return <ActivityIndicator />;
if (isLoading) return <Text>Loading...</Text>;

// RIGHT:
if (isLoading) return <Skeleton.PostCard />;
// or for lists:
if (isLoading) return (
  <View style={styles.skeletonContainer}>
    {Array.from({ length: 5 }).map((_, i) => <Skeleton.PostCard key={i} />)}
  </View>
);
```

### Error states
```typescript
if (isError) return (
  <EmptyState
    icon="alert-circle"
    title={t('common.error')}
    subtitle={t('common.tryAgain')}
    action={{ label: t('common.retry'), onPress: refetch }}
  />
);
```

### Empty states
```typescript
if (!data?.length) return (
  <EmptyState
    icon="inbox"
    title={t('screen.noItems')}
    subtitle={t('screen.noItemsSubtitle')}
  />
);
```

### i18n — NO hardcoded English, ALL 8 languages
```typescript
// WRONG:
<Text>No posts yet</Text>
Alert.alert('Delete', 'Are you sure?')
placeholder="Search..."

// RIGHT:
<Text>{t('screen.noPosts')}</Text>
Alert.alert(t('common.delete'), t('common.confirmDelete'))
placeholder={t('common.search')}

// Add keys to ALL 8 language files: en, ar, tr, ur, bn, fr, id, ms
// Use Node JSON parse/write for i18n files — NEVER use sed
```

### RTL support
```typescript
// WRONG:
marginLeft: 8
paddingRight: 12
left: 0
right: 16
flexDirection: 'row'  // when content order matters for reading direction

// RIGHT:
marginStart: 8
paddingEnd: 12
start: 0
end: 16
flexDirection: rtlFlexRow(isRTL)  // import from @/utils/rtl
```

### Cleanup on unmount — EVERY timer, listener, subscription
```typescript
useEffect(() => {
  const timer = setTimeout(() => { ... }, 1000);
  const sub = AppState.addEventListener('change', handler);
  const interval = setInterval(() => { ... }, 5000);
  return () => {
    clearTimeout(timer);
    sub.remove();
    clearInterval(interval);
  };
}, []);
```

### Haptic feedback — useContextualHaptic
```typescript
const haptic = useContextualHaptic();

// Selections, toggles, taps:
haptic.tick();

// Completed actions (save, post, send):
haptic.success();

// Failed operations:
haptic.error();

// Before destructive confirmation dialogs:
haptic.delete();
```

### Error handling on mutations
```typescript
const mutation = useMutation({
  mutationFn: () => api.doSomething(),
  onSuccess: () => {
    haptic.success();
    showToast({ message: t('screen.actionSuccess'), variant: 'success' });
    queryClient.invalidateQueries({ queryKey: ['relevant-key'] });
  },
  onError: () => {
    haptic.error();
    showToast({ message: t('common.somethingWentWrong'), variant: 'error' });
  },
});
```

### Double-tap prevention
```typescript
// For navigation:
const isNavigatingRef = useRef(false);
const handlePress = useCallback(() => {
  if (isNavigatingRef.current) return;
  isNavigatingRef.current = true;
  router.push('/target');
  setTimeout(() => { isNavigatingRef.current = false; }, 500);
}, []);

// For mutations — use the built-in isPending:
<Pressable disabled={mutation.isPending} onPress={handleAction}>
<GradientButton disabled={mutation.isPending} loading={mutation.isPending} />
```

### Press feedback on interactive elements
```typescript
<Pressable
  style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
  android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
>
```

### Magic numbers → spacing/font tokens
```typescript
// WRONG:
gap: 2           paddingBottom: 40       fontSize: 14       fontWeight: '600'

// RIGHT:
gap: spacing.xs  paddingBottom: spacing['2xl']  fontSize: fontSize.sm  fontFamily: fonts.bodySemiBold
```

---

## FIX ORDER

1. **Criticals** in both files first (crashes, data loss, security issues)
2. **Highs** (broken features, invisible text on light theme, missing error handling)
3. **Mediums** (theme colors, RTL, haptic, missing states, double-tap)
4. **Lows** (press feedback, magic numbers, spacing tokens, cosmetic)
5. **Infos** (dead imports, dead code, suggestions, documentation)

Work screen by screen within each severity pass. When you open a file, fix ALL findings for that file before moving on.

---

## TEST COMMANDS
```bash
cd apps/mobile && npx tsc --noEmit                                          # TypeScript check
cd apps/mobile && npx jest --config src/hooks/__tests__/jest.config.js       # Hook/screen tests
```

---

## DELIVERABLES

- **130/130 findings documented** in per-screen tables with status and notes
- **Max 19 deferred** (15% cap) — each with a specific technical blocker
- **20+ meaningful tests** — not `toBeDefined()` stubs
- **All 10 screens:** theme-aware colors, RTL-ready, i18n complete (8 languages), haptic wired, error handling on all mutations, cleanup on all timers/listeners, double-tap prevention on navigation and mutations
- **Progress file** with per-screen tables, summary table, balancing equation, and self-audit confirmation
- **3-4 atomic commits** with descriptive messages, each preceded by `tsc --noEmit`

**130 findings. 130 documented. Every Low fixed. Every Info addressed. Self-audit your counts before submitting. Begin.**
