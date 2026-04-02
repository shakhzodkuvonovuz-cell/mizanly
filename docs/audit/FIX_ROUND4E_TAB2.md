# YOU ARE TAB 2. YOUR AUDIT FILES ARE D17 + D22. DO NOT TOUCH ANY OTHER FILES. DO NOT SPAWN SUBAGENTS.

# FIX SESSION — Round 4E Tab 2: Event Detail/Fasting Tracker/Fatwa QA/Flipside/Follow Requests + Location Picker/Maintenance/Majlis List/Majlis Lists/Manage Broadcast (D17 + D22)

> 116 findings across 10 screens. D17 (57): event-detail, fasting-tracker, fatwa-qa, flipside, follow-requests. D22 (59): location-picker, maintenance, majlis-list/[id], majlis-lists, manage-broadcast.
> **YOUR JOB: Read D17.md + D22.md. Fix the findings in THOSE files. Nothing else.**

---

## RULES — NON-NEGOTIABLE (distilled from 24 previous agent sessions)

### RULE 0: YOU ARE BEING AUDITED
A hostile auditor will grep every file you touched, count every status row in your progress file, verify every "FIXED" claim at the code level, and cross-check your accounting equation. Across 24 sessions, auditors have caught: invented "REMAINING" categories to hide 63 items, inflated FIXED counts by 26, fabricated reference counts ("38+ references" when actual was 1), deferred 47% while claiming 10%, written TODO comments marked as "FIXED", falsely claimed 6 items FIXED when no code change existed, and lazily deferred 4 items that were 1-2 minute fixes. The best agent self-audited its own summary, caught its own inflation, corrected it, and documented the correction with 1.5% deferral rate. Be that agent.

### RULE 1: TOTAL ACCOUNTING — every finding by ID
Your progress file MUST list every finding with exactly one status. The equation MUST balance:
```
FIXED + DEFERRED + ALREADY_FIXED + NOT_A_BUG = TOTAL_IN_FILES
```
D17 has 57 findings. D22 has 59. You document all 116. No "REMAINING" category. No "TODO" status. No silent skips.

### RULE 2: DEFERRAL CAP — 15% HARD LIMIT (max 17 items)
Every deferral needs a SPECIFIC TECHNICAL BLOCKER — not "low priority", not "polish", not "enhancement", not "minor", not "acceptable", not "edge case." The blocker must name what prevents you from fixing it RIGHT NOW: a missing npm dependency, a backend API endpoint that doesn't exist, an architectural change that affects 10+ files. If you can fix it in under 5 minutes, it is NOT a deferral — it is laziness.

### RULE 3: FIX ALL SEVERITIES — Low and Info are NOT optional
A Low-severity hardcoded color takes 30 seconds to fix. An Info-severity dead import takes 10 seconds to delete. Fix them ALL. The deferral cap applies to ALL severities combined.

### RULE 4: "FIXED" = CODE CHANGED
Not a TODO comment. Not "acceptable as-is." Not "already works fine." If the audit found a problem and you write FIXED, the code must be different from before. The auditor diffs every claimed fix. In R4D, an agent falsely claimed 6 items FIXED when zero code changes existed — all 6 were caught.

### RULE 5: "NOT_A_BUG" REQUIRES EVIDENCE
Every NOT_A_BUG must include a 1-sentence technical justification. GOOD: "White on emerald gradient is correct contrast." "Alert.alert is correct here — this IS a destructive action (delete)." BAD: "Works fine." "Acceptable." "Standard pattern."

### RULE 6: TESTS — minimum 20 meaningful tests
Tests must assert specific behavior. `expect(result).toBeDefined()` alone does not count.

### RULE 7: READ BEFORE EDIT
Read every file with the Read tool before editing. No grep-replace without understanding context.

### RULE 8: PATTERN COMPLETION
Fix `colors.text.primary` in one screen → grep ALL 10 screens → fix every instance. The auditor greps independently.

### RULE 9: CHECKPOINT = TSC + COMMIT after each D file
After D17 (5 screens): `npx tsc --noEmit` → commit. After D22 (5 screens): same.
Format: `fix(mobile): R4E-T2 CP[N] — [screens] [summary]`

### RULE 10: NO SUBAGENTS. NO CO-AUTHORED-BY. NO AI REFERENCES IN COMMITS.

### RULE 11: SELF-AUDIT + HONESTY PASS BEFORE SUBMISSION
Count per-screen rows. Sum. Compare to summary. Fix mismatches. Then for every FIXED item, ask: "did I actually change code?" If you falsely claimed FIXED, fix it now. Document: "Self-audit: X FIXED + Y DEFERRED + Z NOT_A_BUG = TOTAL. Honesty pass: [N corrected or 'all genuine']."

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

2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references — especially feedback files.

3. Read BOTH audit files IN FULL — every row, every finding, every severity:
   - `docs/audit/v2/wave4/D17.md` (57 findings — event-detail, fasting-tracker, fatwa-qa, flipside, follow-requests)
   - `docs/audit/v2/wave4/D22.md` (59 findings — location-picker, maintenance, majlis-list/[id], majlis-lists, manage-broadcast)

4. Create: `docs/audit/v2/fixes/R4E_TAB2_PROGRESS.md`

---

## YOUR SCOPE — 10 screens

```
# D17 screens
apps/mobile/app/(screens)/event-detail.tsx         (826 lines)
apps/mobile/app/(screens)/fasting-tracker.tsx       (424 lines)
apps/mobile/app/(screens)/fatwa-qa.tsx              (250 lines)
apps/mobile/app/(screens)/flipside.tsx              (622 lines)
apps/mobile/app/(screens)/follow-requests.tsx       (229 lines)

# D22 screens
apps/mobile/app/(screens)/location-picker.tsx       (488 lines)
apps/mobile/app/(screens)/maintenance.tsx           (127 lines)
apps/mobile/app/(screens)/majlis-list/[id].tsx      (147 lines)
apps/mobile/app/(screens)/majlis-lists.tsx          (383 lines)
apps/mobile/app/(screens)/manage-broadcast.tsx      (280 lines)
```

**FORBIDDEN — do NOT touch:**
- Backend API code (`apps/api/`)
- Prisma schema
- Signal protocol files (`apps/mobile/src/services/signal/`)
- Shared components in `apps/mobile/src/components/`
- Hooks in `apps/mobile/src/hooks/`
- Any screen file NOT listed above

**CRITICAL SPECIAL NOTES — read carefully:**

- **`event-detail.tsx` (826 lines) — CRITICAL: No back button renders.** D17 finding #1: `GlassHeader` uses `onBack` prop without `showBack` or `showBackButton`. The `onBack` prop is ignored unless `showBack={true}`. User is TRAPPED on this screen. Fix ALL 3 GlassHeader instances to include `showBack={true}`.

- **`event-detail.tsx` — CRITICAL: `calshow:` URL is iOS-only (D17 #12).** `Linking.openURL('calshow:')` crashes or does nothing on Android. Add platform check: `Platform.OS === 'ios' ? Linking.openURL('calshow:') : /* Android calendar intent */`.

- **`fasting-tracker.tsx` — Islamic content.** Fasting-related data is curated by the user personally. NEVER AI-generate Islamic content. Only fix UI/UX issues.

- **`fatwa-qa.tsx` (250 lines) — Islamic rulings.** Same rule: never AI-generate fatwa content. Fix only UI patterns.

- **`majlis-list/[id].tsx` (147 lines) — D22 notes it's "visually broken."** Container has no `tc` override for background (permanently dark) AND no safe area handling. Content renders behind header. Fix both.

- **`manage-broadcast.tsx` — D22 #51: Screen shows WRONG DATA.** Fetches channel owner's FOLLOWERS instead of broadcast subscribers. The code comment admits "simulate the list." This is a facade. Mark as DEFERRED with note: "backend endpoint for broadcast subscribers does not exist."

- **`maintenance.tsx` (127 lines) — Tiny screen.** Should be very quick.

- **`flipside.tsx` — HIGH: Deletion dialog shows WRONG message (D17 #37).** Alert.alert for deleting a flipside shows the feature description text instead of a delete warning. User sees a paragraph of text instead of "Are you sure you want to delete?" Fix the alert message.

- **`flipside.tsx` — HIGH: No SafeAreaView in any of the 4 render branches (D17 #36).** Content behind notch on every view state.

- **`fatwa-qa.tsx` — HIGH: No SafeAreaView (D17 #26).** Same pattern — add SafeAreaView wrapper.

- **`follow-requests.tsx` — HIGH: No SafeAreaView (D17 #47).** Same pattern.

- **`majlis-list/[id].tsx` — HIGH: Zero error state (D22 #25).** API failure shows empty state instead of error + retry. User can't distinguish "no items" from "network failed."

- **`manage-broadcast.tsx` — HIGH: No query invalidation after mutations (D22 #50).** Promote/demote/remove mutations succeed but screen shows stale data. Fix: add `queryClient.invalidateQueries` in each mutation's `onSuccess`.

- **`majlis-lists.tsx` — HIGH: Delete mutation allows duplicates (D22 #38).** No per-item loading state — rapid taps fire multiple delete mutations.

- **RTL WARNING:** ALL 5 D17 screens have explicit `flexDirection: 'row'` hardcoded (event-detail has 4 instances, fatwa-qa has 7). Import `rtlFlexRow` and fix systematically.

---

## COMMON FIX PATTERNS — apply to EVERY screen

### Theme-aware colors
```typescript
// Remove from StyleSheet, apply inline:
const tc = useThemeColors();
style={[styles.container, { backgroundColor: tc.bg }]}
style={[styles.text, { color: tc.text.primary }]}
```

### Loading / Error / Empty states
```typescript
if (isLoading) return <Skeleton.PostCard />;
if (isError) return (
  <EmptyState icon="alert-circle" title={t('common.error')}
    action={{ label: t('common.retry'), onPress: refetch }} />
);
if (!data?.length) return <EmptyState icon="inbox" title={t('screen.noItems')} />;
```

### i18n — ALL 8 languages (en, ar, tr, ur, bn, fr, id, ms)
```typescript
// Add keys to ALL 8 language files. Use Node JSON parse/write — NEVER sed.
```

### RTL support
```typescript
// WRONG: marginLeft: 8, left: 0, flexDirection: 'row'
// RIGHT: marginStart: 8, start: 0, flexDirection: rtlFlexRow(isRTL)
```

### Cleanup on unmount
```typescript
useEffect(() => {
  const timer = setTimeout(() => { ... }, 1000);
  return () => { clearTimeout(timer); };
}, []);
```

### Haptic feedback
```typescript
const haptic = useContextualHaptic();
haptic.tick();     // selections, toggles
haptic.success();  // completed actions
haptic.error();    // failures
haptic.delete();   // before destructive confirmations
```

### Mutation error handling
```typescript
onSuccess: () => { haptic.success(); showToast({ message: t('screen.success'), variant: 'success' }); },
onError: () => { haptic.error(); showToast({ message: t('common.somethingWentWrong'), variant: 'error' }); },
```

### Double-tap prevention
```typescript
// Navigation: isNavigatingRef with 500ms cooldown
// Mutations: disabled={mutation.isPending}
```

### Press feedback + Magic numbers → tokens
```typescript
style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
// gap: spacing.xs, fontSize: fontSize.sm, fontFamily: fonts.bodySemiBold
```

---

## WORK ORDER

1. **D17 first** (5 screens, 57 findings) — START with event-detail Critical back-button bug
2. **Checkpoint 1:** `npx tsc --noEmit` → commit `fix(mobile): R4E-T2 CP1 — D17 screens`
3. **D22 second** (5 screens, 59 findings) — START with majlis-list/[id] visual breakage
4. **Checkpoint 2:** `npx tsc --noEmit` → commit `fix(mobile): R4E-T2 CP2 — D22 screens`
5. **Tests:** write 20+ tests → commit `test(mobile): R4E-T2 — [N] tests across 10 screens`
6. **Self-audit + honesty pass** → final commit if corrections needed

Within each D file: Criticals → Highs → Mediums → Lows → Infos.
Fix ALL findings for a file before moving to the next.

---

## TEST COMMANDS
```bash
cd apps/mobile && npx tsc --noEmit
cd apps/mobile && npx jest --config src/hooks/__tests__/jest.config.js
```

---

## DELIVERABLES

- **116/116 findings documented** with per-screen tables
- **Max 17 deferred** with specific technical blockers. Target <10.
- **20+ meaningful tests**
- **All 10 screens:** theme-aware, RTL-ready, i18n complete (8 languages), haptic wired, error handling, cleanup, double-tap prevention
- **event-detail.tsx:** Back button renders. Calendar intent platform-safe.
- **majlis-list/[id].tsx:** Background and safe area fixed.
- **Progress file** with self-audit + honesty pass
- **2-3 atomic commits**

**116 findings. 116 documented. Every Low fixed. Every Info addressed. Self-audit. Honesty-pass. Begin.**
