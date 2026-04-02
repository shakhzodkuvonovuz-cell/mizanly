# FIX SESSION — Round 4C Tab 2: Islamic + Notifications + Auth/Settings Screens (D25 + D01)

> 143 findings across 10 screens. D25 (77): names-of-allah, nasheed-mode, new-conversation, notification-tones, notifications. D01 (66): 2fa-setup, 2fa-verify, account-settings, account-switcher, achievements.

---

## RULES — NON-NEGOTIABLE

These rules exist because previous agents cheated. 16 agent sessions were audited. Agents that broke these rules had their work redone at 2x cost.

### RULE 0: YOU ARE BEING AUDITED
A hostile auditor will grep every file you touched, count every status in your progress file, verify every "FIXED" claim at the code level, and cross-check your accounting equation. The auditor caught: invented status categories (63 hidden items), inflated FIXED counts by 26, fabricated reference counts, and 47% deferral rates. Assume every claim is verified byte-by-byte.

### RULE 1: TOTAL ACCOUNTING — every finding by ID
`FIXED + DEFERRED + ALREADY_FIXED + NOT_A_BUG = TOTAL`. D25 has 77 findings, D01 has 66. You document all 143. No "REMAINING." No silent skips.

### RULE 2: DEFERRAL CAP — 15% HARD LIMIT (max 21 items)
Every deferral needs a SPECIFIC TECHNICAL BLOCKER. NOT valid: "low priority", "polish", "enhancement", "minor", "edge case." If fixable in under 5 minutes, fix it.

### RULE 3: FIX ALL SEVERITIES — Low and Info are mandatory
A Low-severity hardcoded color = 30 seconds. An Info-severity dead import = 10 seconds. Fix ALL. The deferral cap applies across all severities combined.

### RULE 4: "FIXED" = CODE CHANGED (not TODO, not "works fine")

### RULE 5: "NOT_A_BUG" REQUIRES EVIDENCE
1-sentence technical justification. The auditor reclassified 7 lazy NOT_A_BUGs last round.

### RULE 6: TESTS — minimum 20 meaningful tests

### RULE 7: READ BEFORE EDIT — Read tool first, understand context

### RULE 8: PATTERN COMPLETION — fix same pattern across ALL 10 screens

### RULE 9: CHECKPOINT = TSC + COMMIT after every 2-3 screens

### RULE 10: NO SUBAGENTS, NO CO-AUTHORED-BY

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — especially Mobile Screen Rules
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read BOTH audit files IN FULL:
   - `docs/audit/v2/wave4/D25.md` (77 findings — names-of-allah, nasheed-mode, new-conversation, notification-tones, notifications)
   - `docs/audit/v2/wave4/D01.md` (66 findings — 2fa-setup, 2fa-verify, account-settings, account-switcher, achievements)
4. Create: `docs/audit/v2/fixes/R4C_TAB2_PROGRESS.md`

---

## YOUR SCOPE — 10 screens

```
apps/mobile/app/(screens)/names-of-allah.tsx
apps/mobile/app/(screens)/nasheed-mode.tsx
apps/mobile/app/(screens)/new-conversation.tsx
apps/mobile/app/(screens)/notification-tones.tsx
apps/mobile/app/(screens)/notifications.tsx
apps/mobile/app/(screens)/2fa-setup.tsx
apps/mobile/app/(screens)/2fa-verify.tsx
apps/mobile/app/(screens)/account-settings.tsx
apps/mobile/app/(screens)/account-switcher.tsx
apps/mobile/app/(screens)/achievements.tsx
```

**FORBIDDEN:** Backend API, schema.prisma, signal/, shared components, hooks.

**SPECIAL NOTES:**
- `2fa-setup.tsx` and `2fa-verify.tsx` are security-critical screens — ensure PIN/code inputs have proper error handling, no plaintext logging, and correct keyboard types
- `names-of-allah.tsx` contains Islamic content — the data itself is curated by the user personally (never AI-generate Quran/hadith content per CLAUDE.md)
- `notifications.tsx` is a high-traffic screen — loading/empty/error states must be thorough
- `new-conversation.tsx` handles user search + contact selection — ensure block/mute filtering is respected

---

## FIX PATTERNS

Same as Tab 1 (theme colors, loading/error/empty, i18n 8 languages, RTL, cleanup, haptic, mutation error handling, double-tap, press feedback, spacing tokens, font family). Refer to the patterns section in `FIX_ROUND4C_TAB1.md` for exact code examples.

---

## FIX ORDER
1. Criticals (crashes, security in 2FA screens)
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
- 143/143 findings documented with per-screen tables
- Max 21 deferred with specific blockers
- 20+ tests
- 2FA screens: secure input handling, error feedback
- Notifications: loading skeleton, empty state, error retry
- All 10 screens: theme-aware, RTL-ready, i18n complete
- Progress file with accurate counts

**143 findings. 143 documented. Every Low fixed. Every Info addressed. Begin.**
