# FIX SESSION — Round 4B Tab 3: Creator Storefront/Cross-Post/Dhikr Screens + Disappearing/Discover/Disposable/DM (D13 + D14)

> 140 findings across 10 screens. D13: creator-storefront, cross-post, dhikr-challenge-detail, dhikr-challenges, dhikr-counter. D14: disappearing-default, disappearing-settings, discover, disposable-camera, dm-note-editor.

---

## RULES — NON-NEGOTIABLE (learned from 16 previous agent sessions)

### RULE 0: YOU ARE BEING AUDITED
A hostile auditor will verify every claimed fix at the code level. Previous agents invented fake categories, inflated counts, and deferred 47%. Zero tolerance.

### RULE 1: TOTAL ACCOUNTING — every finding by ID
`FIXED + DEFERRED + ALREADY_FIXED + NOT_A_BUG = TOTAL_IN_FILES`. D13 has 87, D14 has 53. All 140 documented. No "REMAINING." No silent skips.

### RULE 2: DEFERRAL CAP — 15% HARD LIMIT
Maximum 21 items. Each needs a SPECIFIC TECHNICAL BLOCKER — not "low priority" or "polish."

### RULE 3: FIX ALL SEVERITIES — Low and Info are NOT optional
A Low-severity hardcoded color takes 30 seconds. An Info-severity dead import takes 10 seconds. Fix them ALL.

### RULE 4: "FIXED" = CODE CHANGED (not TODO, not comment)

### RULE 5: TESTS — minimum 20

### RULE 6: READ BEFORE EDIT

### RULE 7: PATTERN COMPLETION — fix same pattern across ALL 10 screens

### RULE 8: CHECKPOINT = TSC + COMMIT after every 2-3 screens

### RULE 9: NO SUBAGENTS FOR CODE

### RULE 10: NO CO-AUTHORED-BY

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — especially Mobile Screen Rules (components, hooks, theme tokens, i18n)
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read BOTH audit files IN FULL:
   - `docs/audit/v2/wave4/D13.md` (87 findings — creator-storefront, cross-post, dhikr-challenge-detail, dhikr-challenges, dhikr-counter)
   - `docs/audit/v2/wave4/D14.md` (53 findings — disappearing-default, disappearing-settings, discover, disposable-camera, dm-note-editor)
4. Create: `docs/audit/v2/fixes/R4B_TAB3_PROGRESS.md`

---

## YOUR SCOPE — 10 screens

```
apps/mobile/app/(screens)/creator-storefront.tsx        (460 lines)
apps/mobile/app/(screens)/cross-post.tsx                (400 lines)
apps/mobile/app/(screens)/dhikr-challenge-detail.tsx    (491 lines)
apps/mobile/app/(screens)/dhikr-challenges.tsx          (456 lines)
apps/mobile/app/(screens)/dhikr-counter.tsx             (751 lines)
apps/mobile/app/(screens)/disappearing-default.tsx      (349 lines)
apps/mobile/app/(screens)/disappearing-settings.tsx     (369 lines)
apps/mobile/app/(screens)/discover.tsx                  (779 lines)
apps/mobile/app/(screens)/disposable-camera.tsx         (589 lines)
apps/mobile/app/(screens)/dm-note-editor.tsx            (373 lines)
```

**FORBIDDEN:** Backend API, schema.prisma, signal/, shared components, hooks, any screen NOT listed above.

**SPECIAL NOTES:**
- `dhikr-counter.tsx` (751 lines) is the most complex screen — haptic vibration patterns, animation loops, counter persistence. Handle timer cleanups carefully.
- `discover.tsx` (779 lines) is a high-traffic screen — search, trending, categories. Ensure loading/error/empty states are thorough.
- `disposable-camera.tsx` is a camera facade — same caution as camera.tsx in R4 Tab 3. Hardcoded dark colors on camera viewfinder ARE intentional (mark NOT_A_BUG with reason).

---

## COMMON FIX PATTERNS

### Theme-aware colors
```typescript
// Remove from StyleSheet, apply inline with tc.*
style={[styles.container, { backgroundColor: tc.bg }]}
style={[styles.text, { color: tc.text.primary }]}
```

### Loading / Error / Empty states
```typescript
if (isLoading) return <Skeleton.PostCard />;
if (isError) return <EmptyState icon="alert-circle" title={t('common.error')} action={{ label: t('common.retry'), onPress: refetch }} />;
if (!data?.length) return <EmptyState icon="inbox" title={t('screen.empty')} />;
```

### i18n — ALL 8 languages (en, ar, tr, ur, bn, fr, id, ms)
No hardcoded English. Use Node JSON parse/write — NEVER sed.

### RTL support
`marginLeft→marginStart`, `paddingRight→paddingEnd`, `left→start`, `right→end`, `flexDirection: rtlFlexRow(isRTL)`.

### Cleanup on unmount
Every `setTimeout`, `setInterval`, `addEventListener` MUST have cleanup in useEffect return.

### Haptic feedback (useContextualHaptic)
`haptic.tick()` on selections, `haptic.success()` on completions, `haptic.error()` on failures, `haptic.delete()` before destructive confirmations.

### Error handling on mutations
`onError: () => { haptic.error(); showToast({ message: t('common.somethingWentWrong'), variant: 'error' }); }`

### Double-tap prevention
Navigation: `isNavigatingRef` with 500ms cooldown. Mutations: `disabled={mutation.isPending}`.

### Press feedback
`style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}`

---

## FIX ORDER
1. Criticals (crashes, data loss)
2. Highs (broken features, invisible text, security)
3. Mediums (theme, error handling, RTL)
4. Lows (press feedback, spacing, cosmetic)
5. Infos (dead imports, suggestions)

---

## TEST COMMANDS
```bash
cd apps/mobile && npx tsc --noEmit
cd apps/mobile && npx jest --config src/hooks/__tests__/jest.config.js
```

---

## DELIVERABLES
- 140/140 findings documented
- Max 21 deferred with specific blockers
- 20+ new tests
- Dhikr counter: all timers/intervals cleaned on unmount
- Discover: loading/error/empty states for search + trending + categories
- All 10 screens theme-aware, RTL-ready, i18n complete
- Progress file with per-screen tables and accurate counts

**140 findings. 140 documented. Every Low. Every Info. Begin.**
