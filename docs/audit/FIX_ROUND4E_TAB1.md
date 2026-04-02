# YOU ARE TAB 1. YOUR AUDIT FILES ARE D15 + D39 + D40. DO NOT TOUCH ANY OTHER FILES. DO NOT SPAWN SUBAGENTS.

# FIX SESSION — Round 4E Tab 1: Donate/Downloads/Drafts/Dua/Duet + Waqf/Watch History/Watch Party/Whats New/Why Showing + Wind Down/XP History/Zakat Calculator/Layout (D15 + D39 + D40)

> 152 findings across 14 screens. D15 (59): donate, downloads, drafts, dua-collection, duet-create. D39 (46): waqf, watch-history, watch-party, whats-new, why-showing. D40 (47): _layout, wind-down, xp-history, zakat-calculator.
> **YOUR JOB: Read D15.md + D39.md + D40.md. Fix the findings in THOSE files. Nothing else.**

---

## RULES — NON-NEGOTIABLE (distilled from 24 previous agent sessions)

### RULE 0: YOU ARE BEING AUDITED
A hostile auditor will grep every file you touched, count every status row in your progress file, verify every "FIXED" claim at the code level, and cross-check your accounting equation. Across 24 sessions, auditors have caught: invented "REMAINING" categories to hide 63 items, inflated FIXED counts by 26, fabricated reference counts ("38+ references" when actual was 1), deferred 47% while claiming 10%, written TODO comments marked as "FIXED", falsely claimed 6 items FIXED when no code change existed (caught by Tab 3's self-audit in R4D), and lazily deferred 4 items that were 1-2 minute fixes. The best agent in this project self-audited its own summary, caught its own inflation, corrected it, and documented the correction with 1.5% deferral rate and 75 tests. Be that agent.

### RULE 1: TOTAL ACCOUNTING — every finding by ID
Your progress file MUST list every finding with exactly one status. The equation MUST balance:
```
FIXED + DEFERRED + ALREADY_FIXED + NOT_A_BUG = TOTAL_IN_FILES
```
D15 has 59 findings. D39 has 46. D40 has 47. You document all 152. No "REMAINING" category. No "TODO" status. No silent skips. The auditor counts rows and verifies the sum matches the total.

### RULE 2: DEFERRAL CAP — 15% HARD LIMIT (max 22 items)
Every deferral needs a SPECIFIC TECHNICAL BLOCKER — not "low priority", not "polish", not "enhancement", not "minor", not "acceptable", not "edge case." The blocker must name what prevents you from fixing it RIGHT NOW: a missing npm dependency, a backend API endpoint that doesn't exist, an architectural change that affects 10+ files. If you can fix it in under 5 minutes, it is NOT a deferral — it is laziness. The best agent achieved 1.5% deferral (2/134). Target that.

### RULE 3: FIX ALL SEVERITIES — Low and Info are NOT optional
Previous agents fixed all Criticals and Highs then deferred every Low as "low priority." This is the single most common failure mode. A Low-severity hardcoded color takes 30 seconds to fix. An Info-severity dead import takes 10 seconds to delete. An Info-severity magic number takes 15 seconds to replace with a spacing token. Fix them ALL. The deferral cap applies to ALL severities combined.

### RULE 4: "FIXED" = CODE CHANGED
Not a TODO comment. Not a console.log added. Not "acceptable as-is." Not "already works fine." If the audit found a problem and you write FIXED, the code must be different from before. The auditor diffs every claimed fix. In R4D, an agent falsely claimed 6 items FIXED when zero code changes existed — all 6 were caught and corrected in a honesty pass.

### RULE 5: "NOT_A_BUG" REQUIRES EVIDENCE
Every NOT_A_BUG must include a 1-sentence technical justification proving the finding is wrong. Examples of GOOD evidence: "White text on emerald gradient is correct — tc.text.primary would be invisible on green in light mode." "QR code is a data URI, not a network image — ProgressiveImage is for network images only." "Alert.alert is correct here per CLAUDE.md — this IS a destructive action (delete)." Examples of BAD evidence: "Works fine." "Acceptable." "Standard pattern." "Minor." The auditor reclassified 7 lazy NOT_A_BUGs to FIXED in Round 4B.

### RULE 6: TESTS — minimum 30 meaningful tests (14 screens = more tests)
Tests must assert specific behavior. `expect(result).toBeDefined()` alone does not count. Good tests: component renders without crash, correct theme token used (not hardcoded hex), no hardcoded English strings in render output, cleanup fires on unmount, error handler called on mutation failure, double-tap guard prevents re-fire. Aim for 2-3 tests per screen minimum.

### RULE 7: READ BEFORE EDIT
For every fix: Read the actual screen file FIRST using the Read tool. Understand surrounding code. Don't grep-replace blindly across files. The auditor caught agents who "fixed" patterns that were intentionally different in context.

### RULE 8: PATTERN COMPLETION
When you fix `colors.text.primary` → `tc.text.primary` in one screen, grep ALL 14 screens for the same pattern and fix every instance. Not 4 of 5. Not "and similar changes for the rest." All 14. Show the grep command and the result count. The auditor greps independently.

### RULE 9: CHECKPOINT PROTOCOL
After every D file (D15, then D39, then D40): run `cd apps/mobile && npx tsc --noEmit`, fix any errors you introduced, then commit with a descriptive message. Format: `fix(mobile): R4E-T1 CP[N] — [screens] [summary]`. Do NOT batch all 14 screens into one commit.

### RULE 10: NO SUBAGENTS. NO CO-AUTHORED-BY. NO AI REFERENCES IN COMMITS.

### RULE 11: SELF-AUDIT BEFORE SUBMISSION (HONESTY PASS)
Before writing "COMPLETE": go back to your per-screen tables and manually count the rows in each status category. Sum them across all 14 screens. Compare the sums to your summary table. If they don't match, the summary is wrong — fix it.

THEN do a honesty pass: for every item marked FIXED, ask yourself "did I actually change code for this, or did I just SAY I did?" If you find any items you falsely claimed FIXED, fix them now and document the correction. R4D Tab 3 caught 6 of its own false FIXED claims this way. Document: "Self-audit: per-screen sums = X FIXED + Y DEFERRED + Z NOT_A_BUG = TOTAL. Honesty pass: [N items corrected or 'all genuine']."

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

3. Read ALL THREE audit files IN FULL — every row, every finding, every severity:
   - `docs/audit/v2/wave4/D15.md` (59 findings — donate, downloads, drafts, dua-collection, duet-create)
   - `docs/audit/v2/wave4/D39.md` (46 findings — waqf, watch-history, watch-party, whats-new, why-showing)
   - `docs/audit/v2/wave4/D40.md` (47 findings — _layout, wind-down, xp-history, zakat-calculator)

4. Create: `docs/audit/v2/fixes/R4E_TAB1_PROGRESS.md`

---

## YOUR SCOPE — 14 screens

```
# D15 screens
apps/mobile/app/(screens)/donate.tsx              (610 lines)
apps/mobile/app/(screens)/downloads.tsx            (584 lines)
apps/mobile/app/(screens)/drafts.tsx               (214 lines)
apps/mobile/app/(screens)/dua-collection.tsx        (437 lines)
apps/mobile/app/(screens)/duet-create.tsx           (1050 lines)

# D39 screens
apps/mobile/app/(screens)/waqf.tsx                 (292 lines)
apps/mobile/app/(screens)/watch-history.tsx         (331 lines)
apps/mobile/app/(screens)/watch-party.tsx           (386 lines)
apps/mobile/app/(screens)/whats-new.tsx             (85 lines)
apps/mobile/app/(screens)/why-showing.tsx           (368 lines)

# D40 screens
apps/mobile/app/(screens)/_layout.tsx              (15 lines)
apps/mobile/app/(screens)/wind-down.tsx             (224 lines)
apps/mobile/app/(screens)/xp-history.tsx            (423 lines)
apps/mobile/app/(screens)/zakat-calculator.tsx      (950 lines)
```

**FORBIDDEN — do NOT touch:**
- Backend API code (`apps/api/`)
- Prisma schema (`apps/api/prisma/schema.prisma`)
- Signal protocol files (`apps/mobile/src/services/signal/`)
- Shared components in `apps/mobile/src/components/` — only fix screen-level code
- Hooks in `apps/mobile/src/hooks/` — only fix screen-level code
- Any screen file NOT listed above

**CRITICAL SPECIAL NOTES — read carefully:**

- **`donate.tsx` (610 lines) — STRIPE PAYMENT BUG (C severity).** The screen creates a PaymentIntent then optimistically records the donation via `donateMutation.mutateAsync` BEFORE Stripe confirms payment. If Stripe SDK confirmation fails/user cancels, a phantom donation record persists. Fix: move `donateMutation.mutateAsync` AFTER `confirmPayment` succeeds, or guard with `if (paymentResult.error) return`. This is real money flow — get it right.

- **`waqf.tsx` (292 lines) — STRIPE PAYMENT BUG (C severity).** Same pattern: `createPaymentIntent` but `clientSecret` is discarded and never confirmed via Stripe SDK. Backend records phantom contribution regardless of payment. Fix: add `confirmPayment(clientSecret)` step between creating the intent and recording the contribution.

- **`zakat-calculator.tsx` (950 lines) — Islamic financial calculation.** The zakat calculation logic (2.5% of eligible wealth above nisab threshold) is curated by the user personally. NEVER change the calculation formulas or threshold values. Only fix UI/UX issues: theme colors, RTL, haptics, error handling, i18n.

- **`dua-collection.tsx` (437 lines) — Islamic supplications.** Content (dua text, transliterations, references) is curated by the user personally. NEVER AI-generate Islamic content per CLAUDE.md. Only fix UI/UX.

- **`duet-create.tsx` (1050 lines) — Complex video creation screen.** Similar to video-editor — DO NOT refactor structure. Fix only specific findings: theme colors, cleanup on unmount, error handling. Multiple timers and recording sessions likely need cleanup returns.

- **`_layout.tsx` (15 lines) — Tiny file.** Only 3 findings (L, I, I). Quick fixes.

- **`whats-new.tsx` (85 lines) — Tiny file.** Should be very quick.

- **`donate.tsx` — SECOND CRITICAL: Double-tap double-charge (D15 #2).** `handleDonate` uses manual `isProcessing` flag but does NOT disable the GradientButton's `onPress` until the next render cycle. Fast double-tap fires `handleDonate` twice, creating TWO PaymentIntents and double-charging the user. Fix: add `disabled={isProcessing || donateMutation.isPending}` to the button.

- **`duet-create.tsx` — TWO CRITICALS (D15 #45, #46).** #45: `handleRecord` has no debounce/guard — rapid double-tap calls `recordAsync` twice or calls `stopRecording` then immediately `recordAsync` again, crashing the camera. Fix: add recording-state guard. #46: Next button navigates with empty `videoUri` — no guard for undefined/null video URI. Downstream screen breaks. Fix: guard navigation with `if (!recordedUri) return`.

- **`zakat-calculator.tsx` — CRITICAL: ALL i18n keys missing (D40 #27).** Every single label, button, and message renders as a raw key string like `"screens.zakatCalculator.stepAssets"`. The entire screen is NON-FUNCTIONAL in any language. You MUST add all ~20 i18n keys to ALL 8 language files. This is the single most impactful finding in your scope.

- **`zakat-calculator.tsx` — HIGH: Pull-to-refresh destroys user input (D40 #37).** Users spend minutes entering financial data. Pull-to-refresh resets ALL input without confirmation. Fix: either remove pull-to-refresh or add confirmation dialog before resetting.

- **`wind-down.tsx` (224 lines) — Hardcoded dark gradient.** In light mode, `tc.bg` blends with dark hex values creating ugly gradient. Text uses `colors.text.primary` (white) which is invisible on light portion. Fix the gradient to use `tc` tokens and theme-aware text colors.

---

## COMMON FIX PATTERNS — apply to EVERY screen

### Theme-aware colors (most common finding)
```typescript
// WRONG — in StyleSheet.create:
backgroundColor: colors.dark.bg       // or '#0D1117'
color: colors.text.primary            // or '#C9D1D9'
borderColor: colors.dark.border

// RIGHT — remove from StyleSheet, apply inline:
const tc = useThemeColors();
style={[styles.container, { backgroundColor: tc.bg }]}
style={[styles.text, { color: tc.text.primary }]}
style={[styles.card, { borderColor: tc.border }]}
```

### Loading / Error / Empty states
```typescript
if (isLoading) return <Skeleton.PostCard />;
if (isError) return (
  <EmptyState icon="alert-circle" title={t('common.error')}
    subtitle={t('common.tryAgain')}
    action={{ label: t('common.retry'), onPress: refetch }} />
);
if (!data?.length) return (
  <EmptyState icon="inbox" title={t('screen.noItems')} subtitle={t('screen.noItemsSubtitle')} />
);
```

### i18n — ALL 8 languages (en, ar, tr, ur, bn, fr, id, ms)
```typescript
// WRONG: <Text>No posts</Text>  /  Alert.alert('Delete', 'Sure?')
// RIGHT: <Text>{t('screen.noPosts')}</Text>  /  Alert.alert(t('common.delete'), t('common.confirmDelete'))
// Add keys to ALL 8 language files. Use Node JSON parse/write — NEVER sed.
```

### RTL support
```typescript
// WRONG: marginLeft: 8, left: 0, flexDirection: 'row' (directional content)
// RIGHT: marginStart: 8, start: 0, flexDirection: rtlFlexRow(isRTL)
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
// gap: spacing.xs, paddingBottom: spacing['2xl'], fontSize: fontSize.sm, fontFamily: fonts.bodySemiBold
```

---

## WORK ORDER — process one D file at a time

1. **D15 first** (5 screens, 59 findings) — START with donate.tsx Critical payment bug
2. **Checkpoint 1:** `npx tsc --noEmit` → commit `fix(mobile): R4E-T1 CP1 — D15 screens`
3. **D39 second** (5 screens, 46 findings) — START with waqf.tsx Critical payment bug
4. **Checkpoint 2:** `npx tsc --noEmit` → commit `fix(mobile): R4E-T1 CP2 — D39 screens`
5. **D40 third** (4 screens, 47 findings) — _layout is tiny, then wind-down, xp-history, zakat-calculator
6. **Checkpoint 3:** `npx tsc --noEmit` → commit `fix(mobile): R4E-T1 CP3 — D40 screens`
7. **Tests:** write 30+ tests → commit `test(mobile): R4E-T1 — [N] tests across 14 screens`
8. **Self-audit + honesty pass** → correct any false claims → final commit if needed

Within each D file, fix by severity: Criticals → Highs → Mediums → Lows → Infos.
When you open a file, fix ALL findings for that file before moving on.

---

## TEST COMMANDS
```bash
cd apps/mobile && npx tsc --noEmit
cd apps/mobile && npx jest --config src/hooks/__tests__/jest.config.js
```

---

## DELIVERABLES

- **152/152 findings documented** in per-screen tables with status and notes
- **Max 22 deferred** (15% cap) — each with a specific technical blocker. Target <10.
- **30+ meaningful tests** — not `toBeDefined()` stubs
- **All 14 screens:** theme-aware colors, RTL-ready, i18n complete (8 languages), haptic wired, error handling on all mutations, cleanup on all timers/listeners, double-tap prevention
- **donate.tsx + waqf.tsx:** Stripe payment flow fixed — no phantom records
- **zakat-calculator.tsx + dua-collection.tsx:** Islamic content untouched, UI only
- **Progress file** with per-screen tables, summary table, balancing equation, self-audit + honesty pass
- **3-4 atomic commits** (one per D file + tests)

**152 findings. 152 documented. Every Low fixed. Every Info addressed. Self-audit your counts. Honesty-pass your FIXED claims. Begin.**
