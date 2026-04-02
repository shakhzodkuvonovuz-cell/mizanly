# FIX SESSION — Round 4C Tab 1: Create Screens + Creator Dashboard + Misc (D12 + D35)

> 147 findings across 10 screens. D12 (102): create-reel, create-story, create-thread, create-video, creator-dashboard. D35 (45): sound/[id], starred-messages, status-privacy, sticker-browser, stitch-create.

---

## RULES — NON-NEGOTIABLE

These rules exist because previous agents cheated. 16 agent sessions were audited. Agents that broke these rules had their work redone at 2x cost.

### RULE 0: YOU ARE BEING AUDITED
A hostile auditor will grep every file you touched, count every status in your progress file, verify every "FIXED" claim at the code level, and cross-check your accounting equation. The auditor has caught: invented "REMAINING" categories (63 hidden items), inflated FIXED counts by 26, fabricated reference counts, and 47% deferral rates. Assume every claim you make will be verified byte-by-byte.

### RULE 1: TOTAL ACCOUNTING — every finding by ID
Your progress file MUST list every finding with exactly one status. The equation MUST balance:
```
FIXED + DEFERRED + ALREADY_FIXED + NOT_A_BUG = TOTAL_IN_FILES
```
D12 has 102 findings. D35 has 45. You document all 147. No "REMAINING." No "TODO." No silent skips. The auditor counts rows.

### RULE 2: DEFERRAL CAP — 15% HARD LIMIT (max 22 items)
Every deferral needs a SPECIFIC TECHNICAL BLOCKER: what dependency is missing, what backend API doesn't exist, what architectural change is required. These are NOT valid reasons: "low priority", "polish", "enhancement", "minor", "acceptable", "edge case." If you can fix it in under 5 minutes, it is not a deferral.

### RULE 3: FIX ALL SEVERITIES — Low and Info are mandatory
Previous agents fixed Criticals/Highs then deferred all Lows as "low priority." This is unacceptable. A Low-severity hardcoded color takes 30 seconds to fix. An Info-severity dead import takes 10 seconds to delete. The deferral cap applies to ALL severities combined. An agent that fixes all Highs but defers all Lows has FAILED.

### RULE 4: "FIXED" = CODE CHANGED
Not a TODO comment. Not a console.log. Not "acceptable as-is." Not "already works." If the audit found a problem and you write FIXED, the code must be different.

### RULE 5: "NOT_A_BUG" REQUIRES EVIDENCE
Every NOT_A_BUG must include a 1-sentence technical justification. "White on emerald is intentional brand contrast" is evidence. "Works fine" is not. The auditor reclassified 7 lazy NOT_A_BUGs to FIXED in the last round.

### RULE 6: TESTS — minimum 20 meaningful tests
Tests must assert specific behavior. `expect(result).toBeDefined()` alone does not count. Test: component renders, correct imports, theme tokens used, no hardcoded English, cleanup on unmount, error handling paths.

### RULE 7: READ BEFORE EDIT
Read every file with the Read tool before editing. No grep-replace across files without understanding context. The auditor caught agents who "fixed" patterns that were intentionally different.

### RULE 8: PATTERN COMPLETION
When you fix `colors.dark.bg` in one screen, grep ALL 10 screens for the same pattern and fix every instance. Not 4 of 5. Not "similar changes for the rest." All 10. The auditor greps.

### RULE 9: CHECKPOINT = TSC + COMMIT
After every 2-3 screens: `cd apps/mobile && npx tsc --noEmit`, fix any errors, then commit. Message format: `fix(mobile): R4C-T1 CP[N] — [screens] [summary]`. No batching all 10 screens into one commit.

### RULE 10: NO SUBAGENTS, NO CO-AUTHORED-BY

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — the Mobile Screen Rules section defines which components to use (`<Skeleton>` not `<ActivityIndicator>`, `<EmptyState>` not bare text, `<BottomSheet>` not `<Modal>`, `showToast()` not `Alert.alert` for non-destructive feedback, `useContextualHaptic()` not `useHaptic()`, theme tokens from `useThemeColors()`)
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references — especially feedback files about fixing all severities, testing requirements, and honest assessment
3. Read BOTH audit files IN FULL — every row, every finding:
   - `docs/audit/v2/wave4/D12.md` (102 findings)
   - `docs/audit/v2/wave4/D35.md` (45 findings)
4. Create: `docs/audit/v2/fixes/R4C_TAB1_PROGRESS.md`

---

## YOUR SCOPE — 10 screens

```
apps/mobile/app/(screens)/create-reel.tsx           (1613 lines)
apps/mobile/app/(screens)/create-story.tsx          (1645 lines)
apps/mobile/app/(screens)/create-thread.tsx         (973 lines)
apps/mobile/app/(screens)/create-video.tsx          (971 lines)
apps/mobile/app/(screens)/creator-dashboard.tsx     (1081 lines)
apps/mobile/app/(screens)/sound/[id].tsx            (varies)
apps/mobile/app/(screens)/starred-messages.tsx      (varies)
apps/mobile/app/(screens)/status-privacy.tsx        (varies)
apps/mobile/app/(screens)/sticker-browser.tsx       (varies)
apps/mobile/app/(screens)/stitch-create.tsx         (varies)
```

**FORBIDDEN:** Backend API code, schema.prisma, signal/, shared components in src/components/, hooks in src/hooks/.

---

## FIX PATTERNS — apply to EVERY screen

### Theme colors — most common finding
```typescript
// WRONG (in StyleSheet.create):
backgroundColor: colors.dark.bg     // or '#0D1117'
color: colors.text.primary           // or '#C9D1D9'

// RIGHT (remove from StyleSheet, add inline):
style={[styles.container, { backgroundColor: tc.bg }]}
style={[styles.text, { color: tc.text.primary }]}
```

### Loading / Error / Empty states
```typescript
if (isLoading) return <Skeleton.PostCard />;
if (isError) return <EmptyState icon="alert-circle" title={t('common.error')} action={{ label: t('common.retry'), onPress: refetch }} />;
if (!data?.length) return <EmptyState icon="inbox" title={t('screen.noItems')} />;
```

### i18n — ALL 8 languages (en, ar, tr, ur, bn, fr, id, ms)
No hardcoded English. Add keys with Node JSON parse/write — NEVER sed.

### RTL
`marginLeft→marginStart`, `paddingRight→paddingEnd`, `left→start`, `right→end`.
For content-ordered rows: `flexDirection: rtlFlexRow(isRTL)`.

### Cleanup on unmount
Every `setTimeout`, `setInterval`, `addEventListener`, `AppState.addEventListener` MUST have cleanup in useEffect return. `clearTimeout`, `clearInterval`, `sub.remove()`.

### Haptic (useContextualHaptic)
`haptic.tick()` — selections, toggles. `haptic.success()` — completions. `haptic.error()` — failures. `haptic.delete()` — before destructive confirmation dialogs.

### Mutation error handling
```typescript
onError: () => { haptic.error(); showToast({ message: t('common.somethingWentWrong'), variant: 'error' }); }
```

### Double-tap prevention
Navigation: `isNavigatingRef` with 500ms cooldown. Mutations: `disabled={mutation.isPending}`.

### Press feedback
```typescript
style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
```

### Magic numbers → spacing tokens
`gap: 2` → `spacing.xs`. `paddingBottom: 40` → `spacing['2xl']`. `fontSize: 14` → `fontSize.sm`.

### Font family
`fontWeight: '600'` → `fontFamily: fonts.bodySemiBold`. `fontWeight: '700'` → `fontFamily: fonts.bodyBold`.

---

## FIX ORDER
1. Criticals (crashes, data loss, security)
2. Highs (broken features, invisible text on light theme)
3. Mediums (theme, error handling, RTL, haptic)
4. Lows (press feedback, spacing tokens, cosmetic)
5. Infos (dead imports, dead code, suggestions)

---

## TEST COMMANDS
```bash
cd apps/mobile && npx tsc --noEmit
cd apps/mobile && npx jest --config src/hooks/__tests__/jest.config.js
```

---

## DELIVERABLES
- 147/147 findings documented with per-screen tables
- Max 22 deferred (15% cap) with specific technical blockers
- 20+ meaningful tests
- All 10 screens: theme-aware, RTL-ready, i18n complete, haptic wired, error handling on all mutations, cleanup on all timers
- Progress file with accurate counts and balancing equation
- 3-4 atomic commits with descriptive messages

**147 findings. 147 documented. Every Low fixed. Every Info addressed. Begin.**
