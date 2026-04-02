# FIX SESSION — Round 4 Tab 5: Chat Screens (D07)

> 110 findings across 5 screens: chat-export (463 lines), chat-folder-view (295), chat-folders (346), chat-lock (388), chat-theme-picker (831).

---

## RULES — LEARNED FROM 12 PREVIOUS TABS

### RULE 0: YOU ARE BEING AUDITED
### RULE 1: TOTAL ACCOUNTING — every finding by ID, no "REMAINING"
### RULE 2: DEFERRAL CAP — 15% (max ~16 items)
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
3. Read `docs/audit/v2/wave4/D07.md` IN FULL (110 findings)
4. Create: `docs/audit/v2/fixes/R4_TAB5_PROGRESS.md`

---

## YOUR SCOPE

```
apps/mobile/app/(screens)/chat-export.tsx
apps/mobile/app/(screens)/chat-folder-view.tsx
apps/mobile/app/(screens)/chat-folders.tsx
apps/mobile/app/(screens)/chat-lock.tsx
apps/mobile/app/(screens)/chat-theme-picker.tsx
```

**FORBIDDEN:** Backend API, schema.prisma, signal/, components, hooks

---

## DELIVERABLES
- 110/110 findings documented
- Max 16 deferred
- 12+ new tests
- Chat screens: proper lock/unlock flows, folder management, export states

**110 findings. 110 documented. Begin.**
