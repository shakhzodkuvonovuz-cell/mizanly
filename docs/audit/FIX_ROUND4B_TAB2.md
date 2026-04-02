# FIX SESSION — Round 4B Tab 2: Chat Wallpaper/Circles/Close Friends/Collabs/Communities + Series/Settings/Share (D08 + D34)

> 141 findings across 10 screens. D08: chat-wallpaper, circles, close-friends, collab-requests, communities. D34: series-detail, series-discover, settings, share-profile, share-receive.

---

## RULES — NON-NEGOTIABLE (learned from 16 previous agent sessions)

### RULE 0: YOU ARE BEING AUDITED
A hostile auditor will verify every claimed fix at the code level. Previous agents invented fake categories, inflated counts, and deferred 47%. Zero tolerance.

### RULE 1: TOTAL ACCOUNTING — every finding by ID
`FIXED + DEFERRED + ALREADY_FIXED + NOT_A_BUG = TOTAL_IN_FILES`. D08 has 89, D34 has 52. All 141 documented. No "REMAINING." No silent skips.

### RULE 2: DEFERRAL CAP — 15% HARD LIMIT
Maximum 21 items. Each needs a SPECIFIC TECHNICAL BLOCKER — not "low priority" or "polish."

### RULE 3: FIX ALL SEVERITIES — Low and Info are NOT optional
A Low-severity hardcoded color takes 30 seconds. An Info-severity dead import takes 10 seconds. Fix them ALL.

### RULE 4: "FIXED" = CODE CHANGED (not TODO, not comment)

### RULE 5: TESTS — minimum 20
Screen structural tests, render tests, import verification.

### RULE 6: READ BEFORE EDIT — Read tool first, then Edit tool

### RULE 7: PATTERN COMPLETION
Fix a `colors.dark.bg` in one screen → grep ALL 10 screens for the same pattern → fix all.

### RULE 8: CHECKPOINT = TSC + COMMIT after every 2-3 screens

### RULE 9: NO SUBAGENTS FOR CODE

### RULE 10: NO CO-AUTHORED-BY

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — especially Mobile Screen Rules (components, hooks, theme tokens, i18n)
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read BOTH audit files IN FULL:
   - `docs/audit/v2/wave4/D08.md` (89 findings — chat-wallpaper, circles, close-friends, collab-requests, communities)
   - `docs/audit/v2/wave4/D34.md` (52 findings — series-detail, series-discover, settings, share-profile, share-receive)
4. Create: `docs/audit/v2/fixes/R4B_TAB2_PROGRESS.md`

---

## YOUR SCOPE — 10 screens

```
apps/mobile/app/(screens)/chat-wallpaper.tsx       (685 lines)
apps/mobile/app/(screens)/circles.tsx              (367 lines)
apps/mobile/app/(screens)/close-friends.tsx         (494 lines)
apps/mobile/app/(screens)/collab-requests.tsx       (407 lines)
apps/mobile/app/(screens)/communities.tsx           (633 lines)
apps/mobile/app/(screens)/series-detail.tsx         (597 lines)
apps/mobile/app/(screens)/series-discover.tsx       (487 lines)
apps/mobile/app/(screens)/settings.tsx              (1532 lines)
apps/mobile/app/(screens)/share-profile.tsx         (424 lines)
apps/mobile/app/(screens)/share-receive.tsx         (580 lines)
```

**FORBIDDEN:** Backend API, schema.prisma, signal/, shared components, hooks, any screen NOT listed above.

**SPECIAL NOTES:**
- `communities.tsx` is flagged as "weakest screen" — manual state management, broken pagination, silent errors. Fix thoroughly.
- `settings.tsx` is 1,532 lines — read carefully, fix only what findings specify. Don't refactor structure.
- D34 notes "No RTL support in 4 of 5 screens" — apply RTL fixes systematically.

---

## COMMON FIX PATTERNS

### Theme-aware colors
```typescript
// Remove from StyleSheet, apply inline:
style={[styles.container, { backgroundColor: tc.bg }]}
style={[styles.text, { color: tc.text.primary }]}
```

### Loading / Error / Empty states
```typescript
if (isLoading) return <Skeleton.PostCard />;
if (isError) return <EmptyState icon="alert-circle" title={t('common.error')} action={{ label: t('common.retry'), onPress: refetch }} />;
if (!data?.length) return <EmptyState icon="inbox" title={t('screen.empty')} />;
```

### i18n — ALL 8 languages
No hardcoded English. Add keys to en, ar, tr, ur, bn, fr, id, ms. Use Node JSON parse/write — NEVER sed.

### RTL support
`marginLeft→marginStart`, `paddingRight→paddingEnd`, `left→start`, `right→end`, `flexDirection: rtlFlexRow(isRTL)`.

### Cleanup, haptic, error handling, double-tap, press feedback
Same patterns as R4 Tab 1 prompt (useContextualHaptic, mutation onError with showToast, isNavigatingRef guard, pressed opacity).

---

## FIX ORDER
1. Criticals first (crashes, data loss)
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
- 141/141 findings documented
- Max 21 deferred with specific blockers
- 20+ new tests
- `communities.tsx` pagination + error handling fixed
- RTL support on all 10 screens
- All theme colors dynamic
- Progress file with per-screen tables

**141 findings. 141 documented. Every Low. Every Info. Begin.**
