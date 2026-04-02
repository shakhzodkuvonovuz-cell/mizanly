# FIX SESSION — Round 4 Tab 2: Conversation Screens (D10)

> 75 findings across the messaging core: conversation/[id].tsx (3,169 lines), conversation-info.tsx, create-broadcast.tsx, create-carousel.tsx.

---

## RULES — LEARNED FROM 12 PREVIOUS TABS

### RULE 0: YOU ARE BEING AUDITED
A hostile auditor will verify every fix. Previous agents invented "REMAINING" to hide 63 items, inflated FIXED counts by 26, and deferred 47%. You will be caught.

### RULE 1: TOTAL ACCOUNTING
Every finding by ID. `FIXED + DEFERRED + ALREADY_FIXED + NOT_A_BUG = TOTAL`. No "REMAINING."

### RULE 2: DEFERRAL CAP — 15%
Max ~11 items deferred. Each needs a specific technical blocker.

### RULE 3: "FIXED" = CODE CHANGED (not TODO)
### RULE 4: TESTS — minimum 10
### RULE 5: READ BEFORE EDIT
### RULE 6: PATTERN COMPLETION — fix same pattern across all screens in scope
### RULE 7: CHECKPOINT = TSC + COMMIT
### RULE 8: NO SUBAGENTS FOR CODE
### RULE 9: NO CO-AUTHORED-BY

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — especially Mobile Screen Rules
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read the audit file IN FULL: `docs/audit/v2/wave4/D10.md` (75 findings)
4. Create: `docs/audit/v2/fixes/R4_TAB2_PROGRESS.md`

---

## YOUR SCOPE

```
apps/mobile/app/(screens)/conversation/[id].tsx     (3,169 lines — the biggest screen)
apps/mobile/app/(screens)/conversation-info.tsx
apps/mobile/app/(screens)/create-broadcast.tsx
apps/mobile/app/(screens)/create-carousel.tsx
```

**FORBIDDEN:** Backend API code, schema.prisma, signal/ files, components in src/components/

**CAUTION:** conversation/[id].tsx is 3,169 lines — a god component. DO NOT refactor its structure (that's an L06 deferred item). Fix the specific findings only. Don't move code around beyond what each finding requires.

---

## COMMON SCREEN FIX PATTERNS

Same as Tab 1 (loading/error/empty states, i18n, cleanup, theme-aware colors). Plus:

### Conversation-specific
- Message list: proper `keyExtractor`, `getItemLayout` for performance
- Input bar: keyboard avoidance, proper cleanup on unmount
- Media attachments: loading states, error handling
- Encryption status: correct E2E indicator display

---

## TEST COMMANDS
```bash
cd apps/mobile && npx tsc --noEmit
```

---

## DELIVERABLES
- 75/75 findings documented
- Max 11 deferred (15% cap)
- 10+ new tests
- Conversation screen: all states handled (loading, error, empty, encrypted, unencrypted)

**75 findings. 75 documented. This is the messaging heart of the app. Begin.**
