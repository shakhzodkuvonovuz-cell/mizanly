# FIX SESSION — Round 2 Tab 1 Part 2: Failed Fixes + Gaps + Tests

> Paste into a fresh Claude Code session. This session fixes 2 FAILED findings, 4 SUSPECT gaps, and adds test coverage for all critical Tab 1 fixes.

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — every rule, especially Integrity Rules and Testing Rules
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read the Tab 1 Round 2 progress file:
   - `docs/audit/v2/fixes/R2_TAB1_PROGRESS.md`
4. Create your progress file: `docs/audit/v2/fixes/R2_TAB1_PART2_PROGRESS.md`
5. Read this ENTIRE prompt before touching any source code

---

## YOUR SCOPE — THESE FILES ONLY

```
apps/api/src/modules/users/users.service.ts
apps/api/src/modules/users/users.module.ts
apps/api/src/modules/users/*.spec.ts
apps/api/src/modules/live/live.service.ts
apps/api/src/modules/live/*.spec.ts
apps/api/src/modules/admin/admin.service.ts
apps/api/src/modules/admin/*.spec.ts
apps/api/src/modules/reports/reports.service.ts
apps/api/src/modules/reports/dto/create-report.dto.ts
apps/api/src/modules/reports/*.spec.ts
apps/api/src/modules/parental-controls/*.spec.ts
apps/api/src/modules/moderation/moderation.service.ts
apps/api/src/modules/moderation/*.spec.ts
apps/api/src/modules/privacy/privacy.service.ts
apps/api/src/modules/privacy/*.spec.ts
apps/api/src/modules/auth/auth.service.ts
apps/api/src/modules/auth/*.spec.ts
apps/api/src/gateways/chat.gateway.ts
apps/api/src/common/services/ab-testing.service.ts
apps/api/src/common/services/ab-testing.service.spec.ts
apps/api/src/common/services/retention.service.ts
apps/api/src/common/services/content-safety.service.ts
apps/api/src/modules/notifications/notifications.service.ts
apps/api/src/modules/moderation/moderation.module.ts (read-only reference)
```

**FORBIDDEN — DO NOT TOUCH:**
- `schema.prisma`
- `apps/mobile/`
- `apps/e2e-server/`, `apps/livekit-server/`
- Any module owned by Tab 2, 3, or 4
- `counter-reconciliation.service.ts` (Tab 4 owns it)
- `payments.service.ts`, `messages.service.ts`, `stories.service.ts` (Tab 4 owns them)

---

## SECTION 1: FAILED FIXES (2 items — must fix NOW)

### 1.1 — X08-#13 (H): Profile bio/displayName has ZERO content moderation — FAKE FIX

**What the agent did:** Added a TODO comment. Called it "FIXED (TODO)". That is not a fix.

**What you must do:**

Read `apps/api/src/modules/users/users.service.ts`. Find the `updateProfile` method (~line 103). Currently bio, displayName, and location are only passed through `sanitizeText()` (XSS stripping) but NEVER moderated for hate speech, slurs, CSAM text, etc.

**Step 1:** Add ModerationModule import to users.module.ts
```typescript
import { ModerationModule } from '../moderation/moderation.module';

@Module({
  imports: [...existingImports, ModerationModule],
  // ...
})
```

Read users.module.ts first to see existing imports. Add ModerationModule to the imports array.

**Step 2:** Inject ContentSafetyService in UsersService constructor
```typescript
import { ContentSafetyService } from '../moderation/content-safety.service';

constructor(
  // ...existing deps
  private readonly contentSafety: ContentSafetyService,
) {}
```

**Step 3:** Add moderateText calls in updateProfile, BEFORE the Prisma update:
```typescript
// Moderate text fields that will be publicly visible
if (dto.bio) {
  await this.contentSafety.moderateText(dto.bio);
}
if (dto.displayName) {
  await this.contentSafety.moderateText(dto.displayName);
}
if (dto.location) {
  await this.contentSafety.moderateText(dto.location);
}
```

Read `content-safety.service.ts` to confirm `moderateText()` throws `BadRequestException` when content is flagged. That's the correct behavior — the exception prevents the update from executing.

**Step 4:** Remove the TODO comment that the previous agent left.

**Step 5:** Write tests (see Section 2.1).

### 1.2 — A16-#6/#7 regression: getHostSessions() pagination still broken

**What the agent did:** Fixed `getActive()` and `getScheduled()` to use Prisma cursor pagination. Missed `getHostSessions()` in the same file.

**What you must do:**

Read `apps/api/src/modules/live/live.service.ts`. Find `getHostSessions()` (~line 332-342).

**Current (broken):**
```typescript
where: { hostId: userId, ...(cursor ? { id: { lt: cursor } } : {}) },
orderBy: { createdAt: 'desc' },
```

The `id: { lt: cursor }` filter doesn't correlate with `createdAt` ordering for CUIDs. Pages skip or duplicate rows.

**Fix to:**
```typescript
where: { hostId: userId },
orderBy: { createdAt: 'desc' },
...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
take: limit + 1,
```

Then handle hasMore by checking if results.length > limit and popping the extra item. Match the exact pattern used in `getActive()` and `getScheduled()` in the same file.

---

## SECTION 2: SUSPECT GAPS (4 items — should fix)

### 2.1 — X08-#23: CreateReportDto missing thread/reel/video fields — AUTO-HIDE IS DEAD CODE

**The problem:** Round 2 Tab 1 added auto-hide code for threads, reels, and videos in `reports.service.ts`. The `resolve()` method also handles them. But `CreateReportDto` has no fields for `reportedThreadId`, `reportedReelId`, or `reportedVideoId`. The `create()` method never persists them. So the auto-hide and resolve code can NEVER trigger for these content types.

**What you must do:**

**Step 1:** Read `apps/api/src/modules/reports/dto/create-report.dto.ts`. Add the missing optional fields:
```typescript
@IsString()
@IsOptional()
reportedThreadId?: string;

@IsString()
@IsOptional()
reportedReelId?: string;

@IsString()
@IsOptional()
reportedVideoId?: string;
```

**Step 2:** Read `reports.service.ts` `create()` method. Add these fields to the `prisma.report.create` data:
```typescript
data: {
  ...existingFields,
  ...(dto.reportedThreadId ? { reportedThreadId: dto.reportedThreadId } : {}),
  ...(dto.reportedReelId ? { reportedReelId: dto.reportedReelId } : {}),
  ...(dto.reportedVideoId ? { reportedVideoId: dto.reportedVideoId } : {}),
}
```

**Step 3:** Verify the Report model in schema.prisma (READ ONLY, don't edit) has these fields. If it doesn't, the DTO fields need to be stored in the `description` field as a JSON string (same workaround used for story reports in R1 Tab3). Check the schema first:
```bash
grep -n "reportedThreadId\|reportedReelId\|reportedVideoId" apps/api/prisma/schema.prisma
```

If the fields DON'T exist in schema, use the description workaround:
```typescript
// Store content type in description since schema lacks FK fields
description: `${dto.contentType}:${dto.contentId}`,
```
And update the auto-hide logic to parse this description format. Document this clearly.

### 2.2 — X07-#1: send_sealed_message optional E2E fields have NO length validation

**The problem:** The 5 main fields (recipientId, conversationId, ephemeralKey, sealedCiphertext, encryptedContent) are size-capped. But ~10 optional fields have zero validation. A malicious client can send 100MB in `e2eSenderRatchetKey` or `mediaUrl`.

**What you must do:**

Read `apps/api/src/gateways/chat.gateway.ts`. Find the send_sealed_message handler. After the existing validation block, add length checks for ALL remaining string fields:

```typescript
// Validate remaining optional fields — prevent OOM from oversized strings
const stringFieldLimits: Record<string, number> = {
  e2eSenderRatchetKey: 500,     // Base64 X25519 public key (~44 chars)
  e2eIdentityKey: 500,          // Base64 identity key
  e2eEphemeralKey: 500,         // Base64 ephemeral key
  e2eSenderDeviceId: 50,        // Device ID string
  messageType: 50,              // Enum-like string
  replyToId: 50,                // CUID
  mediaUrl: 2000,               // URL
  clientMessageId: 100,         // Client-generated ID
  thumbnailUrl: 2000,           // URL
  fileName: 500,                // File name
  mimeType: 100,                // MIME type
};

for (const [field, maxLen] of Object.entries(stringFieldLimits)) {
  if (data[field] && (typeof data[field] !== 'string' || data[field].length > maxLen)) {
    client.emit('error', { message: `Invalid ${field}` });
    return;
  }
}
```

Read the full type annotation for the handler's data parameter to find ALL string fields. Don't miss any.

### 2.3 — J07-H6: INCR+EXPIRE race exists in 7 more locations

**The problem:** The chat gateway was fixed with atomic Lua scripts. But 7 other INCR+EXPIRE patterns across the codebase still have the race condition where a crash between INCR and EXPIRE leaves an immortal key.

**What you must do:**

Create a shared utility function:
```typescript
// apps/api/src/common/utils/redis-atomic.ts
export async function atomicIncr(redis: Redis, key: string, ttlSeconds: number): Promise<number> {
  return redis.eval(
    "local c = redis.call('INCR', KEYS[1]); if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end; return c",
    1, key, ttlSeconds,
  ) as Promise<number>;
}
```

Then replace ALL non-atomic INCR+EXPIRE patterns with this utility. The 7 locations to fix:

1. **auth.service.ts** — register rate limit (~line 68-69)
2. **auth.service.ts** — device counter (~line 188-189)
3. **ab-testing.service.ts** — trackConversion (~line 225-227)
4. **retention.service.ts** — trackNotificationSent (~line 202-205)
5. **notifications.service.ts** — notif_batch (~line 306-307)
6. **content-safety.service.ts** — incrementForwardCount (~line 160-161)
7. **content-safety.service.ts** — trackShare (~line 312-313)

For each location:
1. Read the current code
2. Replace `redis.incr(key)` + `redis.expire(key, ttl)` with `atomicIncr(redis, key, ttl)`
3. Verify the import works
4. Run tests

Also update the existing chat.gateway.ts to use the shared utility instead of inline Lua:
```typescript
// Replace inline eval with:
import { atomicIncr } from '../common/utils/redis-atomic';
const count = await atomicIncr(this.redis, key, windowSec);
```

### 2.4 — X04-#9: Admin ban Meilisearch deindex capped at 1000

**The problem:** `admin.service.ts` `removeUserContentFromSearch()` uses `take: 1000` per content type. `reports.service.ts` correctly uses cursor pagination with no cap. A prolific user (>1000 posts) leaves orphaned search results when banned via admin.

**What you must do:**

Read `admin.service.ts` `removeUserContentFromSearch()` method. Replace `take: 1000` with cursor-based pagination:

```typescript
private async removeUserContentFromSearch(userId: string): Promise<void> {
  const contentTypes = [
    { model: 'post', type: 'post' },
    { model: 'thread', type: 'thread' },
    { model: 'reel', type: 'reel' },
    { model: 'video', type: 'video' },
  ] as const;

  for (const ct of contentTypes) {
    let cursor: string | undefined;
    while (true) {
      const items = await this.prisma[ct.model].findMany({
        where: { userId },
        select: { id: true },
        take: 500,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: 'asc' },
      });
      if (items.length === 0) break;
      for (const item of items) {
        this.publishWorkflow.onUnpublish({
          contentType: ct.type,
          contentId: item.id,
          userId,
        }).catch(() => {});
      }
      cursor = items[items.length - 1].id;
      if (items.length < 500) break;
    }
  }
}
```

Read the existing method first and adapt the pattern. The key change is: cursor pagination loop instead of single `take: 1000` query.

---

## SECTION 3: TEST COVERAGE

Tab 1 Part 1 added some tests but critical paths are undertested. Write tests for:

### 3.1 — PIN security tests (parental-controls.service.spec.ts)

```
1. "updateControls should NOT store plaintext PIN in database"
   - Call updateControls with pin: '123456'
   - Verify prisma.parentalControl.update data does NOT contain raw pin
   - Verify data contains pinHash (hashed value)

2. "linkChild response should NOT include pin hash"
   - Mock prisma.parentalControl.create to resolve
   - Verify response does NOT contain pin or pinHash fields

3. "changePin should hash the new PIN"
   - Call changePin with newPin: '654321'
   - Verify prisma.parentalControl.update data.pin is a hash, not '654321'
```

### 3.2 — Profile moderation tests (users.service.spec.ts)

After fixing 1.1 above:
```
1. "updateProfile should moderate bio text"
   - Mock contentSafety.moderateText to resolve (safe)
   - Call updateProfile with bio: 'hello world'
   - Verify moderateText called with 'hello world'

2. "updateProfile should reject flagged bio"
   - Mock contentSafety.moderateText to throw BadRequestException
   - Verify prisma.user.update NOT called
   - Verify error propagates

3. "updateProfile should moderate displayName"
   - Mock contentSafety.moderateText to resolve
   - Call updateProfile with displayName: 'New Name'
   - Verify moderateText called with 'New Name'

4. "updateProfile should skip moderation for unchanged fields"
   - Call updateProfile with only avatarUrl (no bio/displayName)
   - Verify moderateText NOT called
```

### 3.3 — GDPR deletion tests (privacy.service.spec.ts)

```
1. "processScheduledDeletions should include Clerk-deleted users"
   - Mock prisma.user.findMany with a user that has isDeactivated:true, scheduledDeletionAt in past
   - Verify deletion proceeds (the X04-#1 fix)

2. "deleteAllUserData should collect message media URLs for R2 deletion"
   - Mock prisma.message.findMany to return messages with mediaUrl
   - Verify uploadService.deleteFile called for each URL

3. "deleteAllUserData should anonymize clerkId"
   - Verify prisma.user.update sets clerkId to 'deleted_{userId}'

4. "deleteAllUserData should anonymize stripeConnectAccountId"
   - Verify prisma.user.update sets stripeConnectAccountId to null
```

### 3.4 — Auth guard deletion cancellation test (auth guard or auth.service.spec.ts)

```
1. "should allow deactivated user with pending deletion to authenticate"
   - Mock user with isDeactivated: true, scheduledDeletionAt: future date, isDeleted: false
   - Verify auth does NOT throw ForbiddenException

2. "should block deactivated user WITHOUT pending deletion"
   - Mock user with isDeactivated: true, scheduledDeletionAt: null
   - Verify throws ForbiddenException
```

### 3.5 — Reports resolve tests (reports.service.spec.ts)

```
1. "resolve should remove reported thread on CONTENT_REMOVED"
   - Mock report with reportedThreadId set
   - Call resolve with actionTaken: CONTENT_REMOVED
   - Verify prisma.thread.update called with isRemoved: true

2. "resolve should remove reported reel on CONTENT_REMOVED"
   - Same pattern for reelId

3. "resolve should remove reported video on CONTENT_REMOVED"
   - Same pattern for videoId

4. "urgent auto-hide should handle threads" (after 2.1 DTO fix)
   - Create report with reportedThreadId
   - Verify thread.update called with isRemoved: true when threshold met
```

### 3.6 — Raw SQL table name smoke tests (live.service.spec.ts)

```
1. "viewer count update should use 'live_sessions' table name"
   - Mock prisma.$executeRaw
   - Call the method that updates viewer count
   - Verify the SQL template contains 'live_sessions' not 'LiveSession'
```

### 3.7 — Socket security tests (chat.gateway.spec.ts or integration)

```
1. "send_sealed_message should reject non-member sender"
   - Mock conversationMember.findUnique to return null
   - Verify error emitted, message NOT sent

2. "send_sealed_message should reject oversized fields"
   - Send data with recipientId longer than 50 chars
   - Verify error emitted

3. "subscribe_presence should reject non-partner user"
   - Mock no shared conversations
   - Verify user NOT joined to presence room

4. "message_delivered should await DB update"
   - Verify prisma.message.updateMany is awaited (mock returns promise)
```

### 3.8 — Redis atomic INCR tests (redis-atomic utility)

After creating the utility in 2.3:
```
1. "atomicIncr should return incremented count"
   - Mock redis.eval to return 1
   - Verify returns 1

2. "atomicIncr should set TTL on first increment"
   - Verify eval called with Lua script containing EXPIRE
```

### 3.9 — Admin ban Meilisearch deindex test

```
1. "banUser should deindex all user content from search"
   - Mock prisma.post/thread/reel/video.findMany to return items
   - Verify publishWorkflow.onUnpublish called for each item

2. "banUser should paginate through all content (no take:1000 cap)"
   - Mock first findMany to return 500 items, second to return 200
   - Verify two rounds of findMany called (cursor pagination)
```

### 3.10 — Temp ban expiry test

```
1. "temp ban should set banExpiresAt to 72 hours from now"
   - Call reports resolve with TEMP_BAN action
   - Verify user.update data.banExpiresAt is approximately 72 hours from now

2. "auth guard should auto-unban when banExpiresAt has passed"
   - Mock user with isBanned: true, banExpiresAt: 1 hour ago
   - Verify user can authenticate (auto-unban)
```

---

## ENFORCEMENT RULES

### E1-E10: Same as all previous sessions

### Additional:
- **ZERO TODO comments as fixes.** If you can't fix something, mark it DEFERRED with a reason. "FIXED (TODO)" is a lie and will be caught in hostile audit.
- **Every failed/suspect item in this prompt must have a code change AND a test.** No exceptions.
- **Read the actual code before fixing.** The line numbers in this prompt are approximations — the actual lines may have shifted due to Part 1 changes.

---

## CHECKPOINT SCHEDULE

| # | After | Run | Commit |
|---|-------|-----|--------|
| 1 | Section 1 (2 failed fixes) | Full test suite + tsc | `fix(users,live): R2-Tab1-P2 CP1 — profile moderation + pagination` |
| 2 | Section 2 (4 suspect gaps) | Full test suite + tsc | `fix(reports,gateway,redis,admin): R2-Tab1-P2 CP2 — gaps closed` |
| 3 | Section 3 (all tests) | Full test suite + tsc | `test(auth,admin,reports,parental,live,gateway): R2-Tab1-P2 CP3 — 30+ tests` |

---

## TEST COMMANDS
```bash
cd apps/api && pnpm test -- --testPathPattern=users
cd apps/api && pnpm test -- --testPathPattern=parental
cd apps/api && pnpm test -- --testPathPattern=admin
cd apps/api && pnpm test -- --testPathPattern=reports
cd apps/api && pnpm test -- --testPathPattern=privacy
cd apps/api && pnpm test -- --testPathPattern=auth
cd apps/api && pnpm test -- --testPathPattern=live
cd apps/api && pnpm test -- --testPathPattern=moderation
cd apps/api && pnpm test -- --testPathPattern=chat.gateway
cd apps/api && pnpm test -- --testPathPattern=ab-testing
cd apps/api && pnpm test -- --testPathPattern=retention
cd apps/api && pnpm test  # full at checkpoints
cd apps/api && npx tsc --noEmit
```

---

## MINIMUM DELIVERABLES

| Category | Minimum |
|---|---|
| Failed fixes repaired | 2 (profile moderation, getHostSessions pagination) |
| Suspect gaps closed | 4 (report DTO, sealed message validation, atomic INCR x7, Meilisearch pagination) |
| New tests | 30+ across 10 test categories |
| Shared utility created | 1 (redis-atomic.ts) |
| Checkpoints | 3 |
| Commits | 3 |
| Progress file | Complete with before/after diffs |

---

## THE STANDARD

Tab 1 Part 1 scored 7/10. Two fixes were dishonest (TODO comment called "FIXED", missed pagination in same file). Four gaps reduce security posture. This session closes every gap and adds test coverage that proves the fixes work.

A TODO comment is not a fix. A size-uncapped socket field is an OOM vector. A non-atomic INCR is a key leak. A capped deindex leaves banned users' content searchable.

**2 repairs. 4 gap closures. 30+ tests. 3 commits. Zero TODO-as-fix. Begin.**
