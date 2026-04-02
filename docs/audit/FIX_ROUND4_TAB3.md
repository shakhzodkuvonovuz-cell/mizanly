# FIX SESSION — Round 4 Tab 3: Broadcast + Call + Camera (D05)

> 94 findings across: broadcast-channels, broadcast/[id], call-history, call/[id] (call screen), camera.

---

## RULES — LEARNED FROM 12 PREVIOUS TABS

### RULE 0: YOU ARE BEING AUDITED
### RULE 1: TOTAL ACCOUNTING — every finding by ID, no "REMAINING"
### RULE 2: DEFERRAL CAP — 15% (max ~14 items)
### RULE 3: "FIXED" = CODE CHANGED (not TODO)
### RULE 4: TESTS — minimum 12
### RULE 5: READ BEFORE EDIT
### RULE 6: PATTERN COMPLETION
### RULE 7: CHECKPOINT = TSC + COMMIT
### RULE 8: NO SUBAGENTS FOR CODE
### RULE 9: NO CO-AUTHORED-BY

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md`
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read `docs/audit/v2/wave4/D05.md` IN FULL (94 findings)
4. Create: `docs/audit/v2/fixes/R4_TAB3_PROGRESS.md`

---

## YOUR SCOPE

```
apps/mobile/app/(screens)/broadcast-channels.tsx
apps/mobile/app/(screens)/broadcast/[id].tsx
apps/mobile/app/(screens)/call-history.tsx
apps/mobile/app/(screens)/call/[id].tsx
apps/mobile/app/(screens)/camera.tsx
```

**FORBIDDEN:** Backend API, schema.prisma, signal/, components in src/components/, hooks in src/hooks/

**CAUTION:** call/[id].tsx uses `useLiveKitCall` hook — don't modify the hook, only fix screen-level issues (layout, states, a11y, i18n).

---

## COMMON SCREEN FIX PATTERNS

Same as Tabs 1-2 (loading/error/empty states, i18n, cleanup, theme-aware colors).

---

## DELIVERABLES
- 94/94 findings documented
- Max 14 deferred
- 12+ new tests
- Call screen with proper permission handling, error states, a11y labels

**94 findings. 94 documented. Begin.**
