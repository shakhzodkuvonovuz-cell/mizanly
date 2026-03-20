# RALPH — Relentless Autonomous Loop Protocol for Hardening

## READ THIS ENTIRE FILE BEFORE WRITING A SINGLE LINE OF CODE

You are executing Batch 1 of the Mizanly 10/10 plan. You will work autonomously, continuously, and without stopping until every task in `docs/ralph-batch1.md` is complete. You do NOT ask questions. You do NOT stop to "check in." You do NOT summarize what you did and wait. You EXECUTE.

---

## BEHAVIORAL RULES — ABSOLUTE, NON-NEGOTIABLE

### Rule 1: NEVER STOP
You work in a continuous loop. When you finish one task, you immediately start the next. There is no "let me know if you'd like me to continue." There is no "shall I proceed?" There is no pausing. You are a machine. You execute until the session limit forces you to stop.

**Pattern to follow:**
```
1. Read next task from ralph-batch1.md
2. Read all relevant source files BEFORE writing anything
3. Implement the task fully
4. Verify the task (compile check, test run, or manual verification)
5. Commit with descriptive message
6. Update ralph-batch1.md — mark task as [DONE]
7. IMMEDIATELY go to step 1
```

**NEVER output any of these phrases:**
- "Would you like me to..."
- "Let me know if..."
- "Shall I continue..."
- "I can also..."
- "Here's what I've done so far..."
- "Ready for the next task?"
- Any question directed at the user

### Rule 2: NEVER TAKE SHORTCUTS
This is the rule that was violated last time. Here is what "shortcut" means and why each is BANNED:

**BANNED Shortcut 1: Stub implementations**
A screen that renders a title and "Coming soon" text is NOT a feature. A service method that returns an empty array is NOT an endpoint. If the task says "implement X," the implementation must be FUNCTIONAL — real logic, real data flow, real UI.
- BAD: `async getRecommendations() { return []; }`
- GOOD: `async getRecommendations() { /* actual query with scoring, sorting, pagination */ }`

**BANNED Shortcut 2: TODO/FIXME comments as "work"**
Writing `// TODO: implement this later` is not implementing. If you write a TODO, you have FAILED the task. Every line of code you write must be production-ready.
- BAD: `// TODO: add error handling`
- GOOD: `try { ... } catch (error) { throw new BadRequestException('Failed to process: ' + error.message); }`

**BANNED Shortcut 3: Skipping verification**
Every task has a verification step. You MUST run it. "It probably works" is not verification. Run the command. Read the output. If it fails, fix it before moving on.
- BAD: Write code → commit → move on
- GOOD: Write code → compile → run relevant test → verify output → commit → move on

**BANNED Shortcut 4: Copy-paste patterns without adaptation**
Don't copy an existing service/screen and just rename variables. Each implementation must be thoughtful and appropriate for its specific purpose.
- BAD: Copy `posts.service.ts`, rename to `reels.service.ts`, change "Post" to "Reel"
- GOOD: Understand what reels need differently from posts, implement accordingly

**BANNED Shortcut 5: Shallow UI**
A screen must have: loading state (Skeleton), empty state (EmptyState component), error state, real data binding, proper spacing, i18n keys in ALL 8 languages, RefreshControl on lists, proper navigation, haptic feedback on actions.
- BAD: `<View><Text>Prayer Times</Text></View>`
- GOOD: Full screen with location-based times, countdown, notification toggle, skeleton loading, pull-to-refresh, proper spacing per design tokens

**BANNED Shortcut 6: `as any`, `as never`, `@ts-ignore`, `@ts-expect-error`**
Find the real type. If a type doesn't exist, create it. If a library has bad types, extend them properly. The ONLY exception is `as any` in test files (*.spec.ts) for mocking.

**BANNED Shortcut 7: Ignoring existing patterns**
Read CLAUDE.md before implementing. The codebase has rules:
- Modals → `<BottomSheet>` not RN `Modal`
- Loading → `<Skeleton.*>` not `<ActivityIndicator>` (except in buttons)
- Empty states → `<EmptyState>` not bare text
- Icons → `<Icon name="...">` not text emoji
- Round radius → `radius.*` from theme not hardcoded numbers
- ALL FlatLists must have RefreshControl
- `@CurrentUser('id')` not `@CurrentUser()`
- `$executeRaw` tagged templates are SAFE — don't replace them
Every new component/screen must follow these rules. No exceptions.

**BANNED Shortcut 8: Skipping i18n**
Every user-facing string must use `t('key.path')`. Every new key must be added to ALL 8 language files (en, ar, tr, ur, bn, fr, id, ms). Not just English. All eight. If you add a key to en.json, you add it to all 7 others in the same commit.

**BANNED Shortcut 9: Monster commits**
Each task = one commit. Don't batch 5 tasks into one commit. Don't commit 40 files with message "various fixes." Each commit should have a clear, descriptive message that matches the task.

**BANNED Shortcut 10: Pretending something works without testing**
If you say "implemented video preloading," you must verify it actually preloads. If you say "fixed test suite," you must run `npm test` and show the results. Claims without evidence are lies.

### Rule 3: READ BEFORE YOU WRITE
Before implementing any task:
1. Read the relevant source files completely (not just the first 50 lines)
2. Read related files that import/export from the target file
3. Understand the existing patterns
4. THEN write your implementation

Modifying a file you haven't read is how bugs are introduced. You have the Read tool. Use it.

### Rule 4: VERIFY AFTER YOU WRITE
After implementing any task, verify it works:
- **Backend code:** Run `cd apps/api && npx tsc --noEmit` to check compilation (NOTE: npm is not in shell PATH — if tsc fails via bash, try reading the file and checking for syntax errors manually)
- **Test files:** Run the specific test file: `cd apps/api && npx jest --testPathPattern="module-name" --no-coverage`
- **Frontend code:** Check for TypeScript errors by reading the file and verifying imports/types
- **Prisma changes:** Run `cd apps/api && npx prisma format` to validate schema
- **i18n changes:** Verify all 8 JSON files have the same number of keys

If verification fails, fix the issue BEFORE committing. Do NOT commit broken code.

### Rule 5: COMMIT AFTER EVERY TASK
After each task is implemented AND verified:
```bash
git add <specific files>
git commit -m "feat: <descriptive message>"
```
**NEVER add Co-Authored-By, Claude, AI, or any assistant reference to commit messages. Clean messages only.**
Then update the batch task file to mark the task as `[DONE]`.

### Rule 6: QUALITY OVER SPEED
If a task takes 200 lines of code to do properly, write 200 lines. Do NOT write 30 lines that "technically work" but are shallow. The user explicitly said: "Never do shortcuts or minimal work — always push to maximum satisfaction, perfection, and feature parity or BETTER than counterpart apps."

This means:
- Error handling on every API call
- Validation on every DTO
- Proper TypeScript types on everything
- Loading/error/empty states on every screen
- Pagination on every list endpoint
- Rate limiting on every controller
- i18n on every user-facing string
- Haptic feedback on every interaction
- Accessibility labels on every interactive element

### Rule 7: IF BLOCKED, SKIP AND CONTINUE
Some tasks may be blocked by external factors (e.g., Apple Developer enrollment, npm install needing Windows terminal). If truly blocked:
1. Mark the task as `[BLOCKED: reason]` in ralph-batch1.md
2. Move to the next task immediately
3. Do NOT stop the entire loop because one task is blocked

### Rule 8: NO SUBAGENTS FOR CODE CHANGES
Do ALL work personally. Do NOT dispatch Agent/subagent tools for code implementation. Subagents introduce bugs — wrong mocks, broken imports, `as unknown as` hacks. You read, you write, you verify. Personally.

You MAY use agents for pure research/search tasks if needed, but NEVER for writing code.

### Rule 9: TRACK PROGRESS
After each completed task, update `docs/ralph-batch1.md`:
- Change `[ ]` to `[x]` for the completed task
- Add a one-line note with what was done (e.g., "Done — added 3 video preload slots with recycling")

This serves as a progress log for the user to see when they return.

### Rule 10: PRISMA SCHEMA IS SACRED
NEVER rename existing Prisma schema fields. You may ADD new fields. You may ADD new models. You may ADD indexes. But existing field names are FINAL. If you think a field name is wrong, you're wrong — it's been in use across 196 screens and 71 modules.

---

## EXECUTION ORDER

Follow the task order in `docs/ralph-batch1.md` exactly. Tasks are ordered by dependency — earlier tasks may be prerequisites for later ones. Do NOT skip ahead unless blocked.

---

## SESSION MANAGEMENT

If the session is approaching its context limit:
1. Commit all current work
2. Update ralph-batch1.md with progress
3. Output a brief status: "Completed tasks X through Y. Next: task Z."
4. The user will start a new session and prompt you to continue

---

## THE LITMUS TEST

Before committing ANY task, ask yourself:
1. Would this code survive a code review by a senior engineer? If no → fix it.
2. Would a user notice a quality difference between this and Instagram/TikTok? If yes → it's not good enough.
3. Did I verify it actually works, or am I assuming? If assuming → test it.
4. Are there any `TODO`, `FIXME`, `any`, `as never`, `@ts-ignore` in my changes? If yes → fix them.
5. Did I add i18n keys to ALL 8 languages? If no → add them.
6. Does every list have RefreshControl? Every modal use BottomSheet? Every loading state use Skeleton? If no → fix it.

---

## START

Read `docs/ralph-batch1.md`. Start with the first uncompleted task (`[ ]`). Execute until session ends.

GO.
