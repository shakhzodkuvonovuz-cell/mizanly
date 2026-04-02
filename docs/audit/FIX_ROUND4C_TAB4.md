# FIX SESSION — Round 4C Tab 4: Manage Data/Marketplace/Settings + Orders/Parental/Media (D23 + D26)

> 142 findings across 10 screens. D23 (75): manage-data, marketplace, media-settings, membership-tiers, mentorship. D26 (67): orders, parental-controls, photo-music, pinned-messages, playlist/[id].

---

## RULES — NON-NEGOTIABLE

These rules exist because previous agents cheated. 16 agent sessions were audited. Agents that broke these rules had their work redone at 2x cost.

### RULE 0: YOU ARE BEING AUDITED
A hostile auditor will verify every fix. Previous agents: invented "REMAINING" (63 hidden items), inflated counts by 26, deferred 47%. Assume every claim is verified.

### RULE 1: TOTAL ACCOUNTING — every finding by ID
`FIXED + DEFERRED + ALREADY_FIXED + NOT_A_BUG = TOTAL`. D23=75, D26=67. All 142 documented. No silent skips.

### RULE 2: DEFERRAL CAP — 15% HARD LIMIT (max 21 items)
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
   - `docs/audit/v2/wave4/D23.md` (75 findings — manage-data, marketplace, media-settings, membership-tiers, mentorship)
   - `docs/audit/v2/wave4/D26.md` (67 findings — orders, parental-controls, photo-music, pinned-messages, playlist/[id])
4. Create: `docs/audit/v2/fixes/R4C_TAB4_PROGRESS.md`

---

## YOUR SCOPE — 10 screens

```
apps/mobile/app/(screens)/manage-data.tsx
apps/mobile/app/(screens)/marketplace.tsx
apps/mobile/app/(screens)/media-settings.tsx
apps/mobile/app/(screens)/membership-tiers.tsx
apps/mobile/app/(screens)/mentorship.tsx
apps/mobile/app/(screens)/orders.tsx
apps/mobile/app/(screens)/parental-controls.tsx    (859 lines)
apps/mobile/app/(screens)/photo-music.tsx           (719 lines)
apps/mobile/app/(screens)/pinned-messages.tsx
apps/mobile/app/(screens)/playlist/[id].tsx
```

**FORBIDDEN:** Backend API, schema.prisma, signal/, shared components, hooks.

**SPECIAL NOTES:**
- `parental-controls.tsx` (859 lines) is the most complex — PIN entry, child linking, restriction toggles. Security-sensitive: ensure PIN is never logged, error handling is robust, and biometric fallback works
- `marketplace.tsx` handles commerce — product listings, search, filtering. Must have proper loading/error/empty for search and category views
- `orders.tsx` shows purchase history — financial data must be handled carefully (no PII in error messages)
- D26 audit notes "RTL broken on 4 of 5 screens" — systematic RTL pass needed: `marginLeft→marginStart`, `left→start`, `flexDirection: rtlFlexRow(isRTL)`
- `manage-data.tsx` handles GDPR data export/delete — ensure destructive actions have confirmation dialogs

---

## FIX PATTERNS

Same as Tab 1 (theme colors, loading/error/empty, i18n 8 languages, RTL, cleanup, haptic, mutation error handling, double-tap, press feedback, spacing tokens, font family). Refer to `FIX_ROUND4C_TAB1.md` for exact code examples.

---

## FIX ORDER
1. Criticals (crashes, security in parental-controls, financial in orders)
2. Highs (broken features, invisible text)
3. Mediums (theme, error handling, RTL — especially D26's 4 broken screens, haptic)
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
- 142/142 findings documented with per-screen tables
- Max 21 deferred with specific blockers
- 20+ tests
- parental-controls: PIN security, error handling, biometric
- marketplace: loading/empty/error per search/category
- manage-data: GDPR export/delete with confirmation
- RTL fixed on all D26 screens
- Progress file with accurate counts

**142 findings. 142 documented. Every Low fixed. Every Info addressed. Begin.**
