# FIX SESSION — Tab 2: Posts, Reels, Threads

> Paste into a fresh Claude Code session. Fixes 135 findings across posts, reels, threads and their sub-modules.

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — every rule, especially Integrity Rules and Code Patterns
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read ALL 6 of your audit finding files IN FULL before writing a single line of code:
   - `docs/audit/v2/wave1/A02.md` (25 findings — posts, bookmarks, collabs)
   - `docs/audit/v2/wave2/B02.md` (24 findings — Post model, PostComment, PostReaction)
   - `docs/audit/v2/wave1/A03.md` (24 findings — reels, reel-templates, clips)
   - `docs/audit/v2/wave2/B03.md` (21 findings — Reel model, ReelComment)
   - `docs/audit/v2/wave1/A04.md` (21 findings — threads, majlis-lists)
   - `docs/audit/v2/wave2/B04.md` (20 findings — Thread model, MajlisList)
4. Create: `docs/audit/v2/fixes/TAB2_PROGRESS.md`
5. Run `mkdir -p docs/audit/v2/fixes` if it doesn't exist
6. Read this ENTIRE prompt before touching source code

---

## YOUR SCOPE — THESE MODULES ONLY

```
apps/api/src/modules/posts/
apps/api/src/modules/bookmarks/
apps/api/src/modules/collabs/
apps/api/src/modules/reels/
apps/api/src/modules/reel-templates/
apps/api/src/modules/clips/
apps/api/src/modules/threads/
apps/api/src/modules/majlis-lists/
```

**FORBIDDEN — DO NOT TOUCH:**
- Any module not listed above
- `schema.prisma`
- `chat.gateway.ts`
- `apps/mobile/`
- Any Go service
- Modules being fixed by Tab 1 (auth, users, follows, blocks, mutes, reports, moderation)
- Modules being fixed by Tab 3 (videos, stories, messages)
- Modules being fixed by Tab 4 (payments, notifications, islamic)

---

## ENFORCEMENT RULES

### E1: PROVE every fix
Write to `docs/audit/v2/fixes/TAB2_PROGRESS.md` for each finding:
```
### Finding A02-#5 (Severity: M)
**Audit says:** posts.service.ts:287 — update() missing moderateText call
**Before:** [no moderation check in update path]
**After:** Added `await this.contentSafety.moderateText(dto.content)` at line 289, before prisma.post.update
**Test:** posts.service.spec.ts — added "should moderate text on post update" test
**Status:** FIXED + TESTED
```
No diff in progress file = not fixed.

### E2: TEST every fix individually
```bash
cd apps/api && pnpm test -- --testPathPattern=posts    # after each posts fix
cd apps/api && pnpm test -- --testPathPattern=reels    # after each reels fix
cd apps/api && pnpm test -- --testPathPattern=threads  # after each threads fix
```
Fail = stop. Fix the fix. Then proceed.

**Minimum new tests: 30.** Three content modules with ~45 findings each = 10 new tests per module minimum.

### E3: CHECKPOINT every 10 fixes
After every 10th fix, STOP:
```
CHECKPOINT [10/135]

1. Run: cd apps/api && pnpm test -- --testPathPattern="posts|reels|threads|bookmarks|collabs|clips|reel-templates|majlis"
2. Run: cd apps/api && npx tsc --noEmit 2>&1 | tail -20
3. Run: git diff --stat
4. Grep-verify 3 random fixes:
   - Finding A02-#X: verify the fix exists at the expected line
   - Finding B03-#Y: verify the fix exists
   - Finding A04-#Z: verify the fix exists
5. Write checkpoint to progress file
6. COMMIT: git add <files> && git commit -m "fix(posts,reels,threads): checkpoint N/135 — [summary]"
```

Checkpoints at: 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 135.

### E4: NO SKIPPING
Every finding = FIXED + TESTED, DEFERRED (with reason), or DISPUTED (with code proof). No silent skips.

### E5: READ before fixing
Read tool first. Then Edit tool. Never Edit without Read.

### E6: PATTERN PROPAGATION
These 3 content modules share identical architecture. When you fix a pattern in posts, grep for it in reels AND threads:
```bash
# Example: if posts.service.ts update() needs moderateText, check reels and threads too
grep -rn "async update\|async updateReel\|async updateThread" apps/api/src/modules/posts/ apps/api/src/modules/reels/ apps/api/src/modules/threads/ --include="*.service.ts" | grep -v spec
```
The audit may cite the bug in posts but miss the identical bug in reels. You fix ALL instances.

### E7: NO SHALLOW FIXES
Not acceptable:
- `@Throttle()` with no rate values
- DTO class with zero `@IsString()` / `@IsInt()` / etc decorators
- `findFirst` without adding the actual filter conditions
- Test that only checks `toBeDefined()`
- Adding `moderateText` call but not `await`-ing it
- Adding error handling that catches and ignores (`catch(e) {}`)

### E8: COMMIT every checkpoint
13 checkpoints = 13 commits minimum. Do NOT accumulate.

### E9: HOSTILE SELF-REVIEW
After all 135:
1. Re-read every modified file
2. Run full test suite
3. TypeScript check
4. Count: FIXED + DEFERRED + DISPUTED = 135? If not, you missed findings.

### E10: FINAL PROGRESS FILE
`docs/audit/v2/fixes/TAB2_PROGRESS.md` must contain before/after for all 135 findings, checkpoint results, deferred items, disputed items, test counts.

---

## CRITICAL PATTERNS IN THIS SCOPE

### Content Moderation on Edit (all 3 modules)
**The audit found: create() calls moderateText, update()/edit() does NOT.**
This is a bait-and-switch attack: post clean content → pass moderation → edit to hate speech.
Fix in ALL modules:
- `posts.service.ts` — update(), editComment()
- `reels.service.ts` — updateReel()
- `threads.service.ts` — updateThread()
Pattern: `await this.contentSafety.moderateText(content)` BEFORE the prisma update call.

### Visibility Filters on Direct Access (all 3 modules)
**The audit found: feed queries filter isBanned, but getById does NOT.**
Fix: change `findUnique({ where: { id } })` to:
```typescript
findFirst({
  where: {
    id,
    isRemoved: false,
    user: { isBanned: false, isDeactivated: false, isDeleted: false }
  }
})
```
Apply to EVERY getById, getBySlug, getComments, getReactions endpoint in all 3 modules.

### Missing DTO Validation (all 3 modules)
**The audit found: @Body('field') string extraction bypasses ValidationPipe.**
Fix: create proper DTO classes in `dto/` folder with class-validator decorators.
Every @Body() must use a DTO class, never inline types or string extraction.

### Missing @Throttle on Mutations (all 3 modules)
**The audit found: DELETE/PATCH endpoints without rate limiting.**
Fix: add `@Throttle({ default: { limit: 10, ttl: 60000 } })` to every mutation endpoint that's missing it.

### Counter Consistency (all 3 modules)
**The audit found: decrement without GREATEST(0).**
Fix: any counter decrement must use `GREATEST(column - 1, 0)` or equivalent to prevent negative counts.

### scheduledAt Filtering (all 3 modules)
**The audit found: public queries don't filter scheduled content.**
Fix: add `OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }]` to every public-facing query.

---

## TEST COMMANDS
```bash
cd apps/api && pnpm test -- --testPathPattern=posts
cd apps/api && pnpm test -- --testPathPattern=reels
cd apps/api && pnpm test -- --testPathPattern=threads
cd apps/api && pnpm test -- --testPathPattern=bookmarks
cd apps/api && pnpm test -- --testPathPattern=collabs
cd apps/api && pnpm test -- --testPathPattern=clips
cd apps/api && pnpm test -- --testPathPattern=majlis
cd apps/api && pnpm test  # full suite at checkpoints
cd apps/api && npx tsc --noEmit
```

---

## THE STANDARD

135 findings. 135 documented outcomes. 30+ new tests. 13 checkpoints. 13 commits. 1 progress file with before/after diffs.

These are the 3 most trafficked content modules in the app. Every user's first experience is a post, reel, or thread. Every fix here directly impacts product quality. Fix them like the app has 1 million users watching.

**135 findings. Zero shortcuts. Begin.**
