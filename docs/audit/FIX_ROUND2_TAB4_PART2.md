# FIX SESSION — Round 2 Tab 4 Part 2: Hardening + Tests + Missed Fixes

> Paste into a fresh Claude Code session. This session hardens Tab 4's Round 2 work: fixes missed items, adds idempotency guards, wires content moderation, and writes tests for every critical fix.

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — every rule, especially Integrity Rules and Testing Rules
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read the Tab 4 Round 2 progress file to understand what was already done:
   - `docs/audit/v2/fixes/R2_TAB4_PROGRESS.md`
4. Read this ENTIRE prompt before touching any source code
5. Create your progress file: `docs/audit/v2/fixes/R2_TAB4_PART2_PROGRESS.md`

---

## YOUR SCOPE — THESE FILES ONLY

```
apps/api/src/modules/messages/messages.service.ts
apps/api/src/modules/messages/messages.module.ts
apps/api/src/modules/stories/stories.service.ts
apps/api/src/modules/stories/stories.module.ts
apps/api/src/modules/payments/payments.service.ts
apps/api/src/modules/payments/*.spec.ts
apps/api/src/modules/messages/*.spec.ts
apps/api/src/modules/stories/*.spec.ts
apps/api/src/modules/notifications/notifications.service.ts
apps/api/src/modules/notifications/*.spec.ts
apps/api/src/modules/moderation/moderation.module.ts (read-only reference)
apps/api/src/modules/moderation/content-safety.service.ts (read-only reference)
```

**FORBIDDEN — DO NOT TOUCH:**
- `schema.prisma`
- `chat.gateway.ts` (Tab 1 owns it)
- `counter-reconciliation.service.ts` (already fixed in Part 1)
- `apps/mobile/` files (already fixed in Part 1)
- Any module owned by Tab 1, 2, or 3

---

## SECTION 1: MISSED CODE FIXES (4 items)

### 1.1 — generateGroupInviteLink missing select (J08-#2 incomplete)

The Part 1 session fixed 4 of 5 permission-check findUnique calls on Conversation but missed `generateGroupInviteLink`.

**File:** `apps/api/src/modules/messages/messages.service.ts` line 839
**Current:** `this.prisma.conversation.findUnique({ where: { id: conversationId } })` — fetches full row
**Fix:** Add `select: { id: true, isGroup: true, createdById: true, inviteCode: true, inviteExpiresAt: true }`

Read the method first (lines 838-860). It uses `convo.isGroup`, `convo.createdById`, and writes back `inviteCode` + `inviteExpiresAt`. Make sure your select includes every field the method actually reads.

### 1.2 — editMessage missing content moderation (X08-#7)

Part 1 deferred this claiming "needs ContentSafetyService injection." It doesn't — the fix is straightforward.

**Problem:** `editMessage()` at line 591 accepts plaintext content for non-E2E messages but does NOT run content moderation. A user can post a clean message, then edit it to hate speech/CSAM text after it goes viral.

**Current state:**
- `messages.module.ts` imports `AiModule` but NOT `ModerationModule`
- `ContentSafetyService` is exported from `ModerationModule` (confirmed: `moderation.module.ts` line 11)
- `messages.service.ts` does NOT inject `ContentSafetyService`

**Fix (3 steps):**

Step 1: Add ModerationModule import to messages.module.ts
```typescript
// messages.module.ts
import { ModerationModule } from '../moderation/moderation.module';

@Module({
  imports: [NotificationsModule, AiModule, ModerationModule],
  // ...
})
```

Step 2: Inject ContentSafetyService in MessagesService constructor
```typescript
// messages.service.ts constructor
constructor(
  private readonly prisma: PrismaService,
  private readonly redis: RedisService,
  private readonly notifications: NotificationsService,
  private readonly contentSafety: ContentSafetyService, // ADD THIS
) {}
```

Step 3: Add moderation call in editMessage() BEFORE the prisma.message.update
```typescript
// After the E2E check (line 610) and time window check (line 616), BEFORE the update:
await this.contentSafety.moderateText(content);
```

Read `content-safety.service.ts` to understand `moderateText()` — it throws `BadRequestException` if content is flagged, which is the correct behavior for an edit rejection.

### 1.3 — Story text content missing moderation (X08-#14)

Same pattern as 1.2 but for stories.

**Problem:** Stories with `textOverlay` or `stickerData` containing text are created without content moderation. A user can post a story with hate speech text overlay.

**Current state:**
- `stories.module.ts` imports `AiModule` but NOT `ModerationModule`
- `stories.service.ts` does NOT inject `ContentSafetyService`

**Fix (3 steps):**

Step 1: Add ModerationModule import to stories.module.ts
```typescript
import { ModerationModule } from '../moderation/moderation.module';

@Module({
  imports: [AiModule, NotificationsModule, ModerationModule],
  // ...
})
```

Step 2: Inject ContentSafetyService in StoriesService constructor

Step 3: Add moderation in the create story method. Read the create method first to find where textOverlay/stickerData are processed. Moderate the text BEFORE persisting:
```typescript
// In createStory(), after DTO validation, before prisma.story.create:
if (dto.textOverlay) {
  await this.contentSafety.moderateText(dto.textOverlay);
}
if (dto.stickerData) {
  // stickerData may contain user-entered text (poll questions, quiz answers, etc.)
  const stickerText = typeof dto.stickerData === 'string' 
    ? dto.stickerData 
    : JSON.stringify(dto.stickerData);
  if (stickerText.length > 0) {
    await this.contentSafety.moderateText(stickerText);
  }
}
```

Read the actual DTO and create method first — the field names and types may differ from my guess above. Adapt accordingly.

### 1.4 — handleDisputeCreated missing method-level idempotency (X03-#7 hardening)

**Problem:** The dispute handler relies on webhook-level event dedup (good), but has no method-level guard against processing a tip that's already been disputed. If two different Stripe dispute events reference the same PaymentIntent (rare but possible with dispute updates), diamonds get reversed twice.

**File:** `apps/api/src/modules/payments/payments.service.ts` lines 954-1027

**Fix:** Add a status check inside the $transaction, BEFORE updating:

```typescript
await this.prisma.$transaction(async (tx) => {
  // IDEMPOTENCY: Check tip status before reversing
  const currentTip = await tx.tip.findUnique({
    where: { id: tipId as string },
    select: { status: true },
  });
  if (currentTip?.status === 'disputed') {
    this.logger.warn(`Tip ${tipId} already disputed, skipping duplicate reversal`);
    return; // Already processed — exit transaction cleanly
  }

  const tip = await tx.tip.update({
    // ... existing update code
  });
  // ... rest of diamond reversal
});
```

This ensures the reversal runs exactly once even if the method is somehow called twice for the same tip.

---

## SECTION 2: TEST COVERAGE (the big one)

Part 1 added ZERO new tests. Every critical code change needs test coverage. Write tests for ALL of the following:

### 2.1 — Dispute handler tests (payments.service.spec.ts or payments.service.edge.spec.ts)

There are currently ZERO tests for `handleDisputeCreated`. Write at least 6:

```
1. "should find tip via Redis and reverse diamonds"
   - Mock Redis to return tipId
   - Verify $transaction runs
   - Verify coinBalance.updateMany called with decrement
   - Verify coinTransaction.create called with negative amount

2. "should fallback to PaymentMapping when Redis misses"
   - Mock Redis to return null
   - Mock paymentMapping.findUnique to return { internalId: tipId }
   - Verify tip found and processed

3. "should fallback to Tip.stripePaymentId when both Redis and PaymentMapping miss"
   - Mock Redis null, PaymentMapping null
   - Mock tip.findFirst to return { id: tipId }
   - Verify tip found and processed

4. "should skip reversal when no tip found across all 3 lookups"
   - All 3 lookups return null
   - Verify logger.warn called
   - Verify NO $transaction runs

5. "should skip reversal when tip already disputed (idempotency)"
   - After you add the 1.4 fix above
   - Mock tip.findUnique to return { status: 'disputed' }
   - Verify diamonds NOT reversed
   - Verify logger.warn called

6. "should not go below 0 diamonds on reversal"
   - Verify coinBalance.updateMany uses { diamonds: { gte: diamondsToDeduct } } condition
   - With mock balance of 5 and deduction of 100, verify updateMany where clause prevents negative
```

### 2.2 — scheduleMessage E2E rejection tests (messages.service.spec.ts)

Write at least 3:

```
1. "should reject scheduling plaintext message in E2E conversation"
   - Mock conversation.findUnique to return { isE2E: true }
   - Verify throws BadRequestException with 'Cannot schedule plaintext messages in E2E'
   - Verify message.create NOT called

2. "should allow scheduling in non-E2E conversation"
   - Mock conversation.findUnique to return { isE2E: false }
   - Verify message.create called with isScheduled: true

3. "should allow scheduling in conversation with no isE2E field (legacy)"
   - Mock conversation.findUnique to return { isE2E: null }
   - Verify message.create called (null is falsy, not E2E)
```

### 2.3 — editMessage content moderation tests (messages.service.spec.ts)

After fixing 1.2 above, write at least 3:

```
1. "should run content moderation on message edit"
   - Mock contentSafety.moderateText to resolve (safe)
   - Verify moderateText called with the new content
   - Verify message.update proceeds

2. "should reject edit when content is flagged"
   - Mock contentSafety.moderateText to throw BadRequestException
   - Verify message.update NOT called
   - Verify error propagates

3. "should NOT moderate encrypted message edits (rejected before moderation)"
   - Mock message with isEncrypted: true
   - Verify throws BadRequestException('Encrypted messages cannot be edited via server')
   - Verify moderateText NOT called
```

### 2.4 — Story text moderation tests (stories.service.spec.ts)

After fixing 1.3 above, write at least 2:

```
1. "should moderate textOverlay content on story creation"
   - Mock contentSafety.moderateText to resolve
   - Create story with textOverlay
   - Verify moderateText called with the textOverlay text

2. "should reject story creation when textOverlay is flagged"
   - Mock contentSafety.moderateText to throw BadRequestException
   - Verify story.create NOT called
```

### 2.5 — Counter reconciliation SQL tests (counter-reconciliation.service.spec.ts)

The counter reconciliation was the #1 critical fix (13 SQL table names). There should be at least basic tests verifying the SQL runs without error. Write at least 3:

```
1. "reconcilePostCounts should execute without SQL error"
   - Mock prisma.$executeRaw to resolve (verify it's called, not that counts are correct)
   - Verify BOTH likesCount and commentsCount queries execute

2. "reconcileReelCounts should execute without SQL error"
   - Same pattern

3. "reconcileHashtagCounts should execute without SQL error"
   - Same pattern
```

These are smoke tests — they verify the SQL template literals are syntactically valid and the method runs. They don't verify actual counts (that needs a real DB), but they catch the exact bug that existed before: wrong table names causing runtime SQL errors.

### 2.6 — Sealed sender e2eSenderKeyId test (messages.service.spec.ts)

```
1. "should include e2eSenderKeyId in sealed sender message creation"
   - Call sendMessage (or the sealed sender path) with e2eSenderKeyId: 5
   - Verify prisma.message.create data includes e2eSenderKeyId: 5

2. "should include e2eSenderKeyId: 0 (not drop it as falsy)"
   - Call with e2eSenderKeyId: 0
   - Verify data includes e2eSenderKeyId: 0 (the original bug was dropping 0 as falsy)
```

### 2.7 — Premium endDate extension test (payments.service.spec.ts)

```
1. "should extend premium from current endDate, not from now"
   - Mock existing subscription with endDate = 30 days from now
   - Call with 30-day extension
   - Verify new endDate is 60 days from now (not 30)

2. "should extend expired premium from now"
   - Mock existing subscription with endDate = 10 days ago (expired)
   - Call with 30-day extension
   - Verify new endDate is 30 days from now (not 20 days from now)
```

### 2.8 — Notification typeToSetting map tests (notifications.service.spec.ts)

```
1. "should respect user settings for REPOST notifications"
   - Mock notificationSetting with repost: false
   - Call with type REPOST
   - Verify notification NOT created

2. "should respect user settings for TAG notifications"
   - Mock notificationSetting with tag: false
   - Verify notification NOT created

3. "should create notification when setting is enabled"
   - Mock notificationSetting with repost: true
   - Call with type REPOST
   - Verify notification created
```

### 2.9 — Mobile API parity smoke tests

You can't test api.ts easily (it's a mobile service), but verify the route strings are correct at minimum:

```
1. Read api.ts and verify reaction-summary route is correct
2. Read api.ts and verify /search/explore route is correct
3. Read api.ts and verify archiveConversation uses .put()
```

These can be grep verifications in the progress file rather than Jest tests.

### 2.10 — Order cancel/refund atomicity test (commerce.service.spec.ts)

```
1. "should cancel order and restore stock in $transaction"
   - Verify $transaction wraps both order status update AND stock increment
   - Verify both use tx. (not this.prisma.)
```

---

## SECTION 3: DOCUMENTED ITEMS THAT SHOULD BE FIXED

Part 1 marked several items as "DOCUMENTED" that are actually fixable:

### 3.1 — X03-#32: Diamond conversion magic number 0.007

**Current:** `Math.floor(netAmount / 0.007)` scattered in code
**Fix:** Import from `apps/api/src/common/constants/financial.ts` (this file was created in Round 1 Tab 4 per TAB4_PROGRESS.md). Verify the constant exists and use it:
```typescript
import { DIAMONDS_PER_USD_CENT } from '../../../common/constants/financial';
// Then: Math.floor(netAmount / DIAMONDS_PER_USD_CENT)
```
Grep for ALL instances of `0.007` in payments.service.ts and replace with the constant.

### 3.2 — X03-#33: Platform fee magic number 0.10

Same pattern. Find all `0.10` platform fee references in payments.service.ts and replace with `PLATFORM_FEE_RATE` from financial.ts.

### 3.3 — X05-#11 verification: typeToSetting map completeness

Part 1 claims 7 new types were added to the typeToSetting map. Verify the COMPLETE map covers ALL NotificationType enum values:

```bash
# Find all notification types used in the codebase
grep -rn "type: '" apps/api/src/modules/notifications/notifications.service.ts | grep -oP "type: '[A-Z_]+'" | sort -u
```

Cross-reference with the typeToSetting map. Every type that has a matching setting field should be mapped. List any that are missing.

---

## ENFORCEMENT RULES

### E1: PROVE every fix with before/after diff
### E2: TEST every fix — this session is primarily about tests
### E3: CHECKPOINT after each section
After Section 1 (4 fixes): run tests, commit
After Section 2 (tests): run tests, commit  
After Section 3 (constants): run tests, commit

### E4: Every item = FIXED + TESTED or explained why not
### E5: Read source before fixing
### E6: Pattern propagation
### E7: No shallow tests — every test must assert real behavior, not just `toBeDefined()`
### E8: Commit after each checkpoint

---

## TEST COMMANDS
```bash
cd apps/api && pnpm test -- --testPathPattern=payments
cd apps/api && pnpm test -- --testPathPattern=messages
cd apps/api && pnpm test -- --testPathPattern=stories
cd apps/api && pnpm test -- --testPathPattern=notifications
cd apps/api && pnpm test -- --testPathPattern=counter-recon
cd apps/api && pnpm test -- --testPathPattern=commerce
cd apps/api && pnpm test  # full suite at final checkpoint
cd apps/api && npx tsc --noEmit
```

---

## MINIMUM DELIVERABLES

| Category | Minimum count |
|---|---|
| Code fixes | 4 (generateGroupInviteLink, editMessage moderation, story moderation, dispute idempotency) |
| New tests | 25+ (6 dispute + 3 schedule + 3 editMessage + 2 story + 3 counter + 2 sealed + 2 premium + 3 notification + 1 commerce) |
| Constants cleanup | 2 (diamond conversion, platform fee) |
| Checkpoints | 3 |
| Commits | 3 |
| Progress file | Complete with before/after for every fix |

---

## THE STANDARD

This session turns Tab 4's 7.5/10 into a 10/10. The code fixes from Part 1 are solid — what's missing is test coverage and defense-in-depth. A dispute handler with no tests is a ticking time bomb. Content moderation bypass on message edit is a trust & safety gap. An idempotency-free money path is an eventual double-reversal.

**4 fixes. 25+ tests. 3 commits. Zero untested money paths. Begin.**
