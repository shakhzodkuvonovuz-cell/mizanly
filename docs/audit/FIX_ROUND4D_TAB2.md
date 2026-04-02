# YOU ARE TAB 2. YOUR AUDIT FILES ARE D36 + D21. DO NOT TOUCH ANY OTHER FILES. DO NOT SPAWN SUBAGENTS.

# FIX SESSION — Round 4D Tab 2: Storage/Story Viewer/Streaks/Surah/Tafsir + Islamic Calendar/Leaderboard/Link Child/Live/Local Boards (D36 + D21)

> 140 findings across 10 screens. D36 (70): storage-management, story-viewer, streaks, surah-browser, tafsir-viewer. D21 (70): islamic-calendar, leaderboard, link-child-account, live/[id], local-boards.
> **YOUR JOB: Read D36.md + D21.md. Fix the findings in THOSE files. Nothing else.**

---

## RULES — NON-NEGOTIABLE (learned from 20 previous agent sessions)

### RULE 0: YOU ARE BEING AUDITED
A hostile auditor will grep every file you touched, count every status row in your progress file, verify every "FIXED" claim at the code level, and cross-check your accounting equation. The auditor has caught across 20 sessions: invented "REMAINING" categories to hide 63 items, inflated FIXED counts by 26, fabricated reference counts, deferred 47% while claiming 10%, and wrote TODO comments marked as "FIXED." The best agent self-audited its own summary, caught a 4-item inflation, corrected it, and documented the correction. Be that agent.

### RULE 1: TOTAL ACCOUNTING — every finding by ID
Your progress file MUST list every finding with exactly one status. The equation MUST balance:
```
FIXED + DEFERRED + ALREADY_FIXED + NOT_A_BUG = TOTAL_IN_FILES
```
D36 has 70 findings. D21 has 70. You document all 140. No "REMAINING" category. No "TODO" status. No silent skips. The auditor counts rows and verifies.

### RULE 2: DEFERRAL CAP — 15% HARD LIMIT (max 21 items)
Every deferral needs a SPECIFIC TECHNICAL BLOCKER — not "low priority", not "polish", not "enhancement", not "minor", not "acceptable", not "edge case." The blocker must name what prevents fixing it RIGHT NOW: missing npm dependency, backend API that doesn't exist, architectural change affecting 10+ files. If fixable in under 5 minutes, it is NOT a deferral.

### RULE 3: FIX ALL SEVERITIES — Low and Info are NOT optional
A Low-severity hardcoded color = 30 seconds. An Info-severity dead import = 10 seconds. An Info-severity magic number = 15 seconds. Fix them ALL. The deferral cap applies to ALL severities combined — you cannot skip Lows to "save" deferral budget for Highs.

### RULE 4: "FIXED" = CODE CHANGED
Not a TODO comment. Not a console.log. Not "acceptable as-is." Not "already works fine." If the audit found a problem and you write FIXED, the code must be different.

### RULE 5: "NOT_A_BUG" REQUIRES EVIDENCE
Every NOT_A_BUG needs a 1-sentence technical justification. GOOD: "White on emerald is correct — tc.text.primary would be invisible on green in light mode." BAD: "Works fine." "Acceptable." "Standard pattern." The auditor reclassified 7 lazy NOT_A_BUGs to FIXED in R4B.

### RULE 6: TESTS — minimum 20 meaningful tests
Tests must assert specific behavior. `expect(result).toBeDefined()` alone does not count. Test: renders without crash, correct theme tokens, no hardcoded English, cleanup on unmount, error handler fires, double-tap guard works.

### RULE 7: READ BEFORE EDIT
Read every file with the Read tool before editing. No grep-replace without understanding context.

### RULE 8: PATTERN COMPLETION
Fix `colors.dark.bg` in one screen → grep ALL 10 screens → fix every instance. Not 4 of 5. The auditor greps independently.

### RULE 9: CHECKPOINT = TSC + COMMIT
After every 2-3 screens: `cd apps/mobile && npx tsc --noEmit`, fix errors, then commit. Format: `fix(mobile): R4D-T2 CP[N] — [screens] [summary]`. No mega-commits.

### RULE 10: NO SUBAGENTS FOR CODE. NO CO-AUTHORED-BY.

### RULE 11: SELF-AUDIT BEFORE SUBMISSION
Before writing "COMPLETE": manually count per-screen rows in each status. Sum across all 10 screens. Compare to summary table. If mismatch, fix the table. Document: "Self-audit: X FIXED + Y DEFERRED + Z NOT_A_BUG = TOTAL. Verified."

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — especially Mobile Screen Rules:
   - `<Skeleton>` not `<ActivityIndicator>` for loading (buttons OK)
   - `<EmptyState>` not bare text for empty/error
   - `<BottomSheet>` not `<Modal>`
   - `showToast()` not `Alert.alert` for non-destructive feedback
   - `<BrandedRefreshControl>` not raw `<RefreshControl>`
   - `<ProgressiveImage>` not raw `<Image>` for content
   - `useContextualHaptic()` not `useHaptic()`
   - `useThemeColors()` → `tc.*` not `colors.dark.*`
   - `radius.*` from theme not hardcoded `borderRadius`
   - `formatCount()` for engagement numbers

2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references — especially feedback files about fixing all severities, testing, honest assessment, and no git shortcuts.

3. Read BOTH audit files IN FULL — every row, every finding:
   - `docs/audit/v2/wave4/D36.md` (70 findings — storage-management, story-viewer, streaks, surah-browser, tafsir-viewer)
   - `docs/audit/v2/wave4/D21.md` (70 findings — islamic-calendar, leaderboard, link-child-account, live/[id], local-boards)

4. Create: `docs/audit/v2/fixes/R4D_TAB2_PROGRESS.md`

---

## YOUR SCOPE — 10 screens

```
apps/mobile/app/(screens)/storage-management.tsx    (560 lines)
apps/mobile/app/(screens)/story-viewer.tsx          (967 lines)
apps/mobile/app/(screens)/streaks.tsx               (509 lines)
apps/mobile/app/(screens)/surah-browser.tsx         (234 lines)
apps/mobile/app/(screens)/tafsir-viewer.tsx         (440 lines)
apps/mobile/app/(screens)/islamic-calendar.tsx      (990 lines)
apps/mobile/app/(screens)/leaderboard.tsx           (477 lines)
apps/mobile/app/(screens)/link-child-account.tsx    (386 lines)
apps/mobile/app/(screens)/live/[id].tsx             (1260 lines)
apps/mobile/app/(screens)/local-boards.tsx          (157 lines)
```

**FORBIDDEN — do NOT touch:**
- Backend API code (`apps/api/`)
- Prisma schema
- Signal protocol files (`apps/mobile/src/services/signal/`)
- Shared components in `apps/mobile/src/components/`
- Hooks in `apps/mobile/src/hooks/`
- Any screen file NOT listed above

**SPECIAL NOTES:**
- `live/[id].tsx` (1260 lines) is the biggest screen in this batch — live streaming with chat overlay, viewer count, reactions, host controls. DO NOT refactor structure. Fix only the specific findings (theme, RTL, error handling, cleanup). Timer cleanup is critical — live screens have polling intervals.
- `story-viewer.tsx` (967 lines) has complex gesture handling (swipe between stories, tap for next, long-press to pause). Be careful with cleanup on unmount — gesture handlers and animation timers must be cleaned.
- `islamic-calendar.tsx` (990 lines) contains Hijri date data — the Islamic calendar data is curated by the user personally. NEVER AI-generate dates, month names, or Islamic event data per CLAUDE.md.
- `surah-browser.tsx` and `tafsir-viewer.tsx` contain Quran content — never AI-generate. Fix only UI/UX issues.
- `link-child-account.tsx` is security-sensitive (parental controls linking). PIN input must never be logged, error handling must be robust, and biometric fallback should work.
- `local-boards.tsx` (157 lines) is the smallest — should be quick.
- D21 audit notes: "fontWeight instead of fontFamily in 4 of 5 screens" — systematic fix needed across islamic-calendar, link-child-account, live/[id], local-boards.

---

## COMMON FIX PATTERNS — apply to EVERY screen

### Theme-aware colors
```typescript
// WRONG (in StyleSheet.create):
backgroundColor: colors.dark.bg     // or '#0D1117'
color: colors.text.primary           // or '#C9D1D9'

// RIGHT (remove from StyleSheet, add inline):
const tc = useThemeColors();
style={[styles.container, { backgroundColor: tc.bg }]}
style={[styles.text, { color: tc.text.primary }]}
```

### Loading states
```typescript
// WRONG:
if (isLoading) return <ActivityIndicator />;
if (isLoading) return <Text>Loading...</Text>;

// RIGHT:
if (isLoading) return <Skeleton.PostCard />;
// For lists:
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
  <EmptyState icon="inbox" title={t('screen.noItems')} subtitle={t('screen.noItemsSubtitle')} />
);
```

### i18n — ALL 8 languages (en, ar, tr, ur, bn, fr, id, ms)
```typescript
// WRONG:
<Text>No posts yet</Text>
Alert.alert('Delete', 'Are you sure?')
placeholder="Search..."

// RIGHT:
<Text>{t('screen.noPosts')}</Text>
Alert.alert(t('common.delete'), t('common.confirmDelete'))
placeholder={t('common.search')}
// Add keys to ALL 8 language files. Use Node JSON parse/write — NEVER sed.
```

### RTL support
```typescript
// WRONG:
marginLeft: 8, paddingRight: 12, left: 0, right: 16
flexDirection: 'row'  // when content order matters

// RIGHT:
marginStart: 8, paddingEnd: 12, start: 0, end: 16
flexDirection: rtlFlexRow(isRTL)  // import from @/utils/rtl
```

### Cleanup on unmount — EVERY timer, listener, subscription
```typescript
useEffect(() => {
  const timer = setTimeout(() => { ... }, 1000);
  const sub = AppState.addEventListener('change', handler);
  return () => { clearTimeout(timer); sub.remove(); };
}, []);
```

### Haptic feedback
```typescript
const haptic = useContextualHaptic();
haptic.tick();     // selections, toggles
haptic.success();  // completed actions
haptic.error();    // failed operations
haptic.delete();   // before destructive confirmations
```

### Mutation error handling
```typescript
const mutation = useMutation({
  mutationFn: () => api.doSomething(),
  onSuccess: () => {
    haptic.success();
    showToast({ message: t('screen.actionSuccess'), variant: 'success' });
    queryClient.invalidateQueries({ queryKey: ['key'] });
  },
  onError: () => {
    haptic.error();
    showToast({ message: t('common.somethingWentWrong'), variant: 'error' });
  },
});
```

### Double-tap prevention
```typescript
// Navigation:
const isNavigatingRef = useRef(false);
const handlePress = useCallback(() => {
  if (isNavigatingRef.current) return;
  isNavigatingRef.current = true;
  router.push('/target');
  setTimeout(() => { isNavigatingRef.current = false; }, 500);
}, []);

// Mutations:
<Pressable disabled={mutation.isPending} onPress={handleAction}>
```

### Press feedback
```typescript
<Pressable
  style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
  android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
>
```

### Magic numbers → tokens
```typescript
// WRONG:
gap: 2, paddingBottom: 40, fontSize: 14, fontWeight: '600'

// RIGHT:
gap: spacing.xs, paddingBottom: spacing['2xl'], fontSize: fontSize.sm, fontFamily: fonts.bodySemiBold
```

---

## FIX ORDER

1. **Criticals** (crashes, data loss, security)
2. **Highs** (broken features, invisible text on light theme)
3. **Mediums** (theme, error handling, RTL, haptic, missing states)
4. **Lows** (press feedback, magic numbers, spacing, cosmetic)
5. **Infos** (dead imports, dead code, suggestions)

Work screen by screen within each severity pass.

---

## TEST COMMANDS
```bash
cd apps/mobile && npx tsc --noEmit
cd apps/mobile && npx jest --config src/hooks/__tests__/jest.config.js
```

---

## DELIVERABLES

- **140/140 findings documented** with per-screen tables
- **Max 21 deferred** with specific technical blockers
- **20+ meaningful tests**
- **All 10 screens:** theme-aware, RTL-ready, i18n complete (8 languages), haptic wired, error handling on all mutations, cleanup on all timers/listeners
- **Progress file** with per-screen tables, summary, equation, self-audit confirmation
- **3-4 atomic commits**

**140 findings. 140 documented. Every Low fixed. Every Info addressed. Self-audit your counts. Begin.**
