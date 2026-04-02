# FIX SESSION — Round 4 Tab 6: AI + Analytics + Archive (D02)

> 98 findings across 5 screens: ai-assistant (381 lines), ai-avatar (275), analytics (612), appeal-moderation (919), archive (289).

---

## RULES — LEARNED FROM 12 PREVIOUS TABS

### RULE 0: YOU ARE BEING AUDITED
### RULE 1: TOTAL ACCOUNTING — every finding by ID, no "REMAINING"
### RULE 2: DEFERRAL CAP — 15% (max ~15 items)
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
3. Read `docs/audit/v2/wave4/D02.md` IN FULL (98 findings)
4. Create: `docs/audit/v2/fixes/R4_TAB6_PROGRESS.md`

---

## YOUR SCOPE

```
apps/mobile/app/(screens)/ai-assistant.tsx
apps/mobile/app/(screens)/ai-avatar.tsx
apps/mobile/app/(screens)/analytics.tsx
apps/mobile/app/(screens)/appeal-moderation.tsx
apps/mobile/app/(screens)/archive.tsx
```

**FORBIDDEN:** Backend API, schema.prisma, signal/, components, hooks

---

## DELIVERABLES
- 98/98 findings documented
- Max 15 deferred
- 12+ new tests
- Analytics screen with proper chart loading/error states
- Appeal moderation with complete workflow states

**98 findings. 98 documented. Begin.**
