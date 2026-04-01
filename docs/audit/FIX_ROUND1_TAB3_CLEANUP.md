# TAB 3 CLEANUP — Unfixed, Partially Fixed, and Lazily Deferred Findings

> Paste into the SAME Tab 3 session if still open, or a new session scoped to the same modules.
> This is the verification pass. The first pass claimed 121/149 fixed. Spot-checking found 5 unfixed, 2 partially fixed, and 5 lazily deferred. Fix them ALL now.

---

## STEP 0 — CONTEXT

Read your own progress file: `docs/audit/v2/fixes/TAB3_PROGRESS.md`
Read the original audit findings for the items below.
DO NOT re-fix things already fixed. Only fix what's listed here.

---

## UNFIXED — These were supposed to be fixed but WEREN'T

### UF-1: Stories report endpoint MISSING (A07 audit scope, A07-#15 or equivalent)
**Problem:** Stories have ZERO report capability. Posts, reels, threads, videos all have report endpoints. Stories don't. The original prompt explicitly said to add one.
**What to do:**
1. Read `apps/api/src/modules/posts/posts.controller.ts` — find the report endpoint
2. Read `apps/api/src/modules/reports/` — understand the Report model and service
3. Add to `stories.controller.ts`:
   - `@Post(':id/report')` endpoint
   - Accept reason string in body via DTO
   - Call reports service to create a Report with the story reference
4. Test: `cd apps/api && pnpm test -- --testPathPattern=stories`
5. Write to progress file: before/after diff

### UF-2: Thumbnails @IsIn case mismatch (A05-#1)
**Problem:** `CreateVariantsDto` validates `@IsIn(['post', 'reel', 'video'])` lowercase but Prisma enum `ThumbnailContentType` expects uppercase `POST`, `REEL`, `VIDEO`. Feature completely broken.
**What to do:**
1. Find the DTO file: `find apps/api/src/modules/thumbnails -name "*.dto.ts"`
2. Change `@IsIn(['post', 'reel', 'video'])` to `@IsIn(['POST', 'REEL', 'VIDEO'])`
3. Check controller for any `as` casts that are now redundant — remove them
4. Test: `cd apps/api && pnpm test -- --testPathPattern=thumbnails`

### UF-3: Subtitles open redirect (A05-#6)
**Problem:** `getSrtRedirect` endpoint uses `@Redirect()` to user-provided URL. Attacker stores `https://evil.com/phishing` as srtUrl, shares the mizanly API link, server redirects to evil.com.
**What to do:**
1. Read `apps/api/src/modules/subtitles/subtitles.controller.ts` — find the redirect endpoint
2. Either: validate URL domain against allowlist (R2/CDN domains only) before redirecting
3. Or: serve the SRT content directly instead of redirecting (read from R2, stream to client)
4. Test the fix

---

## PARTIALLY FIXED — Fix was incomplete

### PF-1: Stories getById closeFriendsOnly bypass (A07-#1)
**Problem:** Tab 3 added expired/archived checks and block checks to getById. But closeFriendsOnly and subscribersOnly are NOT checked. Anyone with a story ID can view a close-friends-only story directly.
**Current code (line 253-265):**
```typescript
const story = await this.prisma.story.findUnique({ where: { id: storyId } });
// checks expired, archived, blocked — but NOT closeFriendsOnly or subscribersOnly
```
**What to do:**
1. After the existing checks, add:
```typescript
if (story.closeFriendsOnly && viewerId !== story.userId) {
  // Check if viewer is in author's close friends
  const isCloseFriend = await this.prisma.closeFriend.findFirst({
    where: { userId: story.userId, friendId: viewerId }
  });
  if (!isCloseFriend) throw new NotFoundException('Story not found');
}
if (story.subscribersOnly && viewerId !== story.userId) {
  // Check if viewer is a subscriber
  const isSubscriber = await this.prisma.subscription.findFirst({
    where: { subscriberId: viewerId, channelId: story.userId }  // adjust FK names to match actual schema
  });
  if (!isSubscriber) throw new NotFoundException('Story not found');
}
```
2. Read the actual schema to verify the correct model names and FK fields for close friends and subscribers
3. Test: add test "should not return closeFriendsOnly story to non-close-friend"

### PF-2: Stories submitStickerResponse missing closeFriendsOnly check (A07-#2)
**Problem:** Block check was added (good) but closeFriendsOnly/subscribersOnly check was NOT.
**What to do:**
1. Add same closeFriendsOnly/subscribersOnly check as PF-1 into `submitStickerResponse` after the block check
2. Test: add test "should reject sticker response from non-close-friend on closeFriendsOnly story"

---

## LAZILY DEFERRED — Should have been fixed, not deferred

### LD-1: AI sticker model hardcoded (A06-#22)
**Problem:** Deferred as "move to ConfigService." This is 2 minutes of work.
**What to do:**
1. Find the hardcoded model string in stickers service
2. Move to ConfigService or environment variable
3. Done. 2 minutes.

### LD-2: scheduledAt dead check in CreateVideoDto (A05-#22)
**Problem:** Deferred. Dead code = delete it.
**What to do:**
1. Find the dead scheduledAt check in the DTO
2. Delete the dead code
3. Run tests

### LD-3: Inline DTO imports in stories controller (A07-#17)
**Problem:** Deferred. Moving imports takes 1 minute.
**What to do:**
1. Check if controller imports DTOs from wrong paths
2. Fix the imports
3. Run tests

### LD-4: StoryChain.viewsCount never incremented (B07-#16)
**Problem:** Deferred as INFO. It's actually a broken feature — viewsCount field exists but nothing ever increments it.
**What to do:**
1. Find where story chain entries are viewed (getChain or similar)
2. Add `prisma.storyChain.update({ where: { id }, data: { viewsCount: { increment: 1 } } })` in the appropriate view/read endpoint
3. Test

### LD-5: publishScheduledMessages 50/tick batch limit (B06-#22)
**Problem:** Deferred. The finding says scheduled messages process only 50 per tick. This is a configuration decision, not a schema change.
**What to do:**
1. Read the code — is 50 an appropriate limit or should it be higher?
2. If the limit is reasonable (prevents overload), document WHY in a comment and mark as DISPUTED in progress file
3. If the limit is too low, increase it to 200 or make it configurable

---

## VERIFICATION PROTOCOL

After fixing all items above:

1. Run full scope tests:
```bash
cd apps/api && pnpm test -- --testPathPattern="messages|videos|stories|chat-export|stickers|video-editor|video-replies|subtitles|thumbnails|story-chains"
```

2. Run TypeScript check:
```bash
cd apps/api && npx tsc --noEmit 2>&1 | tail -20
```

3. Grep-verify each fix:
```bash
# UF-1: Stories report endpoint exists
grep -n "report\|Report" apps/api/src/modules/stories/stories.controller.ts

# UF-2: Thumbnails case fixed
grep -rn "IsIn" apps/api/src/modules/thumbnails/ --include="*.ts"

# UF-3: Open redirect fixed
grep -n "Redirect\|redirect" apps/api/src/modules/subtitles/subtitles.controller.ts

# PF-1: closeFriendsOnly in getById
grep -n "closeFriendsOnly\|closeFriend" apps/api/src/modules/stories/stories.service.ts

# PF-2: closeFriendsOnly in submitStickerResponse
grep -n -A 10 "submitStickerResponse" apps/api/src/modules/stories/stories.service.ts | grep "closeFriend"
```

4. Update `docs/audit/v2/fixes/TAB3_PROGRESS.md`:
   - Change deferred items to FIXED
   - Add before/after diffs for each fix
   - Update totals: should be ~133/149 fixed, ~16 genuinely deferred (schema only)

5. Commit:
```
fix(stories,videos,messages): Tab3 cleanup — 12 unfixed/partial/lazy findings resolved
```

---

## EXPECTED OUTCOME

| Category | Count | Items |
|----------|-------|-------|
| Unfixed → Fixed | 3 | UF-1 (stories report), UF-2 (thumbnails case), UF-3 (redirect) |
| Partial → Fully Fixed | 2 | PF-1 (closeFriends getById), PF-2 (closeFriends sticker) |
| Lazy Deferral → Fixed | 5 | LD-1 through LD-5 |
| Genuinely Deferred (schema) | ~15 | All @@index, onDelete, dead model findings — correct to defer |
| **New total** | **~133/149 fixed** | Up from 121/149 |

**10 findings. Read source. Fix properly. Test each one. Update progress file. Commit. Done.**
