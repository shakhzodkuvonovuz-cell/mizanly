# FIX SESSION — Round 4 Tab 4: Caption Editor + Channel + Cashout + Challenges + Charity (D06)

> 120 findings across 5 screens: caption-editor (960 lines), cashout (862), challenges (657), channel/[handle] (1,327), charity-campaign (274).

---

## RULES — LEARNED FROM 12 PREVIOUS TABS

### RULE 0: YOU ARE BEING AUDITED
### RULE 1: TOTAL ACCOUNTING — every finding by ID, no "REMAINING"
### RULE 2: DEFERRAL CAP — 15% (max ~18 items)
### RULE 3: "FIXED" = CODE CHANGED (not TODO)
### RULE 4: TESTS — minimum 15
### RULE 5: READ BEFORE EDIT
### RULE 6: PATTERN COMPLETION
### RULE 7: CHECKPOINT = TSC + COMMIT
### RULE 8: NO SUBAGENTS FOR CODE
### RULE 9: NO CO-AUTHORED-BY

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md`
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read `docs/audit/v2/wave4/D06.md` IN FULL (120 findings)
4. Create: `docs/audit/v2/fixes/R4_TAB4_PROGRESS.md`

---

## YOUR SCOPE

```
apps/mobile/app/(screens)/caption-editor.tsx
apps/mobile/app/(screens)/cashout.tsx
apps/mobile/app/(screens)/challenges.tsx
apps/mobile/app/(screens)/channel/[handle].tsx
apps/mobile/app/(screens)/charity-campaign.tsx
```

**FORBIDDEN:** Backend API, schema.prisma, signal/, components, hooks

---

## DELIVERABLES
- 120/120 findings documented
- Max 18 deferred
- 15+ new tests
- All 5 screens with proper states, i18n, a11y, cleanup

**120 findings. This is the max per agent. Stay focused. Begin.**
