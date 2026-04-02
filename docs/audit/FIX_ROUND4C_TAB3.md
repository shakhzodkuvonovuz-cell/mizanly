# FIX SESSION — Round 4C Tab 3: Search + Send Tip + Series + Create Screens (D33 + D11)

> 137 findings across 10 screens. D33 (77): screen-time, search, search-results, send-tip, series/[id]. D11 (60): create-clip, create-event, create-group, create-playlist, create-post.

---

## RULES — NON-NEGOTIABLE

These rules exist because previous agents cheated. 16 agent sessions were audited. Agents that broke these rules had their work redone at 2x cost.

### RULE 0: YOU ARE BEING AUDITED
A hostile auditor will verify every fix. Previous agents: invented "REMAINING" (63 hidden items), inflated counts by 26, deferred 47%. Assume every claim is verified.

### RULE 1: TOTAL ACCOUNTING — every finding by ID
`FIXED + DEFERRED + ALREADY_FIXED + NOT_A_BUG = TOTAL`. D33=77, D11=60. All 137 documented. No silent skips.

### RULE 2: DEFERRAL CAP — 15% HARD LIMIT (max 20 items)
Specific technical blockers only. "Low priority" is NOT a valid reason.

### RULE 3: FIX ALL SEVERITIES — Low and Info are mandatory
If fixable in under 5 minutes, fix it. Period.

### RULE 4: "FIXED" = CODE CHANGED (not TODO, not "works fine")

### RULE 5: "NOT_A_BUG" REQUIRES EVIDENCE — 1-sentence technical justification

### RULE 6: TESTS — minimum 20 meaningful tests

### RULE 7: READ BEFORE EDIT

### RULE 8: PATTERN COMPLETION — all 10 screens

### RULE 9: CHECKPOINT = TSC + COMMIT after every 2-3 screens

### RULE 10: NO SUBAGENTS, NO CO-AUTHORED-BY

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — especially Mobile Screen Rules
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read BOTH audit files IN FULL:
   - `docs/audit/v2/wave4/D33.md` (77 findings — screen-time, search, search-results, send-tip, series/[id])
   - `docs/audit/v2/wave4/D11.md` (60 findings — create-clip, create-event, create-group, create-playlist, create-post)
4. Create: `docs/audit/v2/fixes/R4C_TAB3_PROGRESS.md`

---

## YOUR SCOPE — 10 screens

```
apps/mobile/app/(screens)/screen-time.tsx           (643 lines)
apps/mobile/app/(screens)/search.tsx                (1025 lines)
apps/mobile/app/(screens)/search-results.tsx        (721 lines)
apps/mobile/app/(screens)/send-tip.tsx              (693 lines)
apps/mobile/app/(screens)/series/[id].tsx           (506 lines)
apps/mobile/app/(screens)/create-clip.tsx           (235 lines)
apps/mobile/app/(screens)/create-event.tsx          (1011 lines)
apps/mobile/app/(screens)/create-group.tsx          (392 lines)
apps/mobile/app/(screens)/create-playlist.tsx       (323 lines)
apps/mobile/app/(screens)/create-post.tsx           (1347 lines)
```

**FORBIDDEN:** Backend API, schema.prisma, signal/, shared components, hooks.

**SPECIAL NOTES:**
- `search.tsx` (1025 lines) is a high-traffic screen — must have proper loading/error/empty for each search category (people, hashtags, content)
- `create-post.tsx` (1347 lines) is the primary content creation screen — media upload error handling, draft save, moderation feedback are critical
- `send-tip.tsx` handles financial transactions — must have proper error handling, double-tap prevention, and clear amount validation feedback
- `screen-time.tsx` uses AsyncStorage for local persistence — ensure `.catch()` on all async storage calls

---

## FIX PATTERNS

Same as Tab 1 (theme colors, loading/error/empty, i18n 8 languages, RTL, cleanup, haptic, mutation error handling, double-tap, press feedback, spacing tokens, font family). Refer to `FIX_ROUND4C_TAB1.md` for exact code examples.

---

## FIX ORDER
1. Criticals (crashes, financial in send-tip)
2. Highs (broken features, invisible text)
3. Mediums (theme, error handling, RTL, haptic)
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
- 137/137 findings documented with per-screen tables
- Max 20 deferred with specific blockers
- 20+ tests
- search.tsx: loading/empty/error per category
- send-tip.tsx: amount validation, error handling, double-tap guard
- create-post.tsx: upload error handling, draft save
- Progress file with accurate counts

**137 findings. 137 documented. Every Low fixed. Every Info addressed. Begin.**
