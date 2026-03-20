# RALPH — Test Expansion Batch 3: Edge Cases, Authorization Matrix, Error Recovery, Concurrency, Abuse Vectors
## Target: ~110 tasks, ~1,050+ new tests
## Expected final total: ~3,800+ tests (from current ~2,780)

> **Read `docs/ralph-instructions.md` first.** No shortcuts. No subagents. No shallow tests.
> **Read `docs/ralph-test-batch1.md`** for the testing rules — they ALL still apply.
> **Read `docs/ralph-test-batch2.md`** for controller/integration patterns — they ALL still apply.
> **Read `CLAUDE.md`** for architecture patterns and field names.

---

## WHY THIS BATCH EXISTS

Batches 1-2 covered happy paths, error paths, basic auth checks, controller delegation, and integration lifecycles. But they left MASSIVE gaps:

- **Zero edge case tests** — no Arabic text, no max-length strings, no emoji usernames, no negative numbers, no special characters
- **Zero systematic authorization matrix** — some methods have a "User B can't edit User A's post" test, but there's no systematic coverage of ALL write endpoints
- **Zero error recovery tests** — what happens when the DB is down? When Redis is unreachable? When Aladhan API returns 500? When Stripe webhook verification fails?
- **Zero concurrency tests** — simultaneous likes, race conditions on view counts, double-submit prevention
- **Zero abuse vector tests** — follow spam, mass-report coordinated attacks, self-gifting, account enumeration

These are the tests that catch production bugs. Happy path tests prove the app works when everything is perfect. Batch 3 proves the app SURVIVES when things go wrong.

---

## ANTI-SHORTCUT RULES — RALPH WILL TRY TO CUT CORNERS. THESE RULES PREVENT IT.

### The 12 Patterns Ralph Used to Fake Progress in Batches 1-2:

**Pattern 1: "Batch complete" lie.** Ralph declared batch 1 "complete" THREE TIMES before it was actually done. Then in batch 2, he declared it done when 9 tests were broken and 13 were trivial. **Rule: DO NOT output "batch complete" or "all tasks done" until EVERY SINGLE CHECKBOX below is `[x]` AND `npx jest --no-coverage` passes with 0 failures.**

**Pattern 2: `typeof (service as any).method === 'function'` guards.** Makes tests pass when the method doesn't exist. If the test doesn't fail when you remove the method, it tests nothing. **Rule: NEVER use typeof guards. If you don't know the method name, READ THE SERVICE FILE.**

**Pattern 3: Testing mock return values.** `prisma.post.count.mockResolvedValue(5); expect(count).toBe(5);` tests the mock framework, not your code. **Rule: ALWAYS call the SERVICE method, then assert on its return value.**

**Pattern 4: Sole `toBeDefined()` assertions.** `expect(service).toBeDefined()` proves DI injection works. It doesn't prove your code works. **Rule: Every `it()` block must have at least one assertion that would FAIL if you changed the implementation logic.**

**Pattern 5: Testing string literal lengths.** `const arabic = 'محتوى'; expect(arabic.length).toBeGreaterThan(0);` tests JavaScript, not Mizanly. **Rule: ONLY assert on values returned from service/controller methods.**

**Pattern 6: "Skip because already covered."** Ralph skipped 8 tasks in batch 2 claiming they were "already tested." 4 of those 8 were NOT actually tested. **Rule: BEFORE marking a task `[x]` without writing tests, PASTE THE EXISTING TEST'S `it()` line AND assertion. If you can't paste it, it doesn't exist.**

**Pattern 7: `expect(true).toBe(true)` / `expect(1).toBe(1)`.** Always passes. Tests nothing. **Rule: Zero tolerance. If found, delete and replace.**

**Pattern 8: Committing broken tests.** Batch 2 committed 9 tests that threw runtime errors (wrong method signatures, missing mocks). **Rule: RUN `npx jest --testPathPattern="FILENAME" --no-coverage` BEFORE every commit. If it fails, FIX IT before committing.**

**Pattern 9: Copy-paste tests across modules without adapting.** Same test structure in every file with just variable names changed, even when the service logic is completely different. **Rule: Each test must assert behavior SPECIFIC to that service's implementation. If the test would pass identically on a different service, it's too generic.**

**Pattern 10: Monster commits.** 30 files in one commit with message "add tests." **Rule: Maximum 5 spec files per commit. Descriptive commit messages. No "test(module)" — use "test(module): add X edge case tests for Y — arabic input, max length, negative values".**

**Pattern 11: Skipping test execution.** Writing 50 tests without running any, then committing. **Rule: Run tests after EVERY spec file modification. Not after every 5. EVERY SINGLE ONE.**

**Pattern 12: Inflated task descriptions.** Marking "Done, 12 tests" when only 8 actually execute (4 are inside `if` guards that skip). **Rule: After running tests, verify the test count in the output matches what you claim. `Tests: X passed` must match your claim.**

### MANDATORY CHECKPOINT PROTOCOL

After EVERY 10 tasks:
1. Run `npx jest --no-coverage` — full suite
2. Output: `CHECKPOINT: Tasks X-Y complete. Suite: Z tests, 0 failures.`
3. Commit all work since last checkpoint
4. If ANY test fails, STOP and fix before continuing

After EVERY 25 tasks:
1. Run `grep -c "it(" apps/api/src/**/*.spec.ts | paste -sd+ | bc` (or equivalent) to count total tests
2. Output: `PROGRESS: Total tests now: XXXX (target: 3,800+)`
3. If the count hasn't increased by at least 200 since last 25-task checkpoint, you are writing shallow tests. STOP and review quality.

---

## SECTION 1: EDGE CASE TESTS (Tasks 1-30, ~300 tests)

These tests verify that every input-handling method in every service correctly handles unusual, extreme, and malformed input. The goal: no input can crash the service.

### General Edge Case Pattern

For EVERY task below, the test file structure is:

```typescript
describe('ServiceName — edge cases', () => {
  // ... standard beforeEach with mocking ...

  describe('methodName — input edge cases', () => {
    it('should handle Arabic/RTL text input', async () => {
      // Use actual Arabic text with RTL markers: 'بسم الله الرحمن الرحيم\u200F'
      // Assert: does NOT throw, processes correctly
    });

    it('should handle maximum length input', async () => {
      // Use string of exactly MAX_LENGTH characters
      // Assert: accepted or rejected with BadRequestException (NOT crash)
    });

    it('should handle empty string input', async () => {
      // Use ''
      // Assert: rejected with BadRequestException OR handled gracefully
    });

    it('should handle emoji and special characters', async () => {
      // Use '🕌🤲📿 test\u200B\uFEFF\u00AD'  (emoji + zero-width + BOM + soft hyphen)
      // Assert: does NOT throw
    });

    it('should handle negative numbers', async () => {
      // Use -1, -999, Number.MIN_SAFE_INTEGER
      // Assert: rejected with BadRequestException (NOT crash)
    });

    it('should handle very large numbers', async () => {
      // Use Number.MAX_SAFE_INTEGER, Infinity
      // Assert: rejected with BadRequestException or clamped
    });
  });
});
```

### [x] Task 1: posts.service — edge cases (10 tests) — Done, 10 tests passing

**File to read first:** `apps/api/src/modules/posts/posts.service.ts` (1,175 lines)
**File to create/append:** `apps/api/src/modules/posts/posts.service.edge.spec.ts`

**Tests to write:**
1. `create` with Arabic content containing RTL markers: `'بسم الله الرحمن الرحيم \u200F #حديث @user'` — assert: creates successfully, content stored correctly
2. `create` with content at maximum length (if there's a limit) — find the actual DTO validation or `@MaxLength` decorator in `create-post.dto.ts`. If 5000 chars, test 5000 and 5001. Assert: 5000 accepted, 5001 rejected with `BadRequestException`
3. `create` with empty content `''` — assert: rejected with `BadRequestException` (content is required for text posts)
4. `create` with content containing ONLY emoji: `'🕌🤲📿🌙⭐'` — assert: accepted
5. `create` with content containing zero-width characters: `'Hello\u200B\u200C\u200D\uFEFF World'` — assert: accepted (should not crash, may strip them)
6. `create` with content that is 1MB of text (1,048,576 characters of 'a') — assert: rejected (no service should accept 1MB text posts)
7. `getFeed` with limit = 0 — assert: returns empty array or uses default limit, does NOT crash
8. `getFeed` with limit = -1 — assert: rejected or clamped to minimum
9. `getFeed` with limit = 999999 — assert: clamped to 50 (per the pagination limit rule)
10. `getFeed` with cursor = 'not-a-valid-id' — assert: returns empty or throws BadRequestException, does NOT crash

**Run:** `npx jest --testPathPattern="posts.service.edge" --no-coverage`

---

### [x] Task 2: threads.service — edge cases (10 tests) — Done, 10 tests passing

**File to read first:** `apps/api/src/modules/threads/threads.service.ts` (885 lines)
**File to create/append:** `apps/api/src/modules/threads/threads.service.edge.spec.ts`

**Tests to write:**
1. `create` with Arabic thread content: `'ما شاء الله \u200F #إسلام @scholar'` — accepted
2. `create` with content containing mixed bidirectional text: `'English عربي English عربي'` — accepted
3. `create` with poll options containing emoji: `['Option 🕌', 'خيار 📿', '🤲']` — accepted
4. `create` with empty content `''` — rejected
5. `create` with content of 10,000 characters — test against actual limit
6. `addReply` with reply content containing HTML-like tags: `'<script>alert("xss")</script>'` — accepted as plain text (no XSS), content stored literally
7. `addReply` with empty reply `''` — rejected
8. `getFeed` with limit = 0 — does not crash
9. `getTrendingThreads` with no threads in DB (findMany returns `[]`) — returns empty array, not error
10. `like` on a thread that was already soft-deleted (`isRemoved: true`) — throws NotFoundException

**Run:** `npx jest --testPathPattern="threads.service.edge" --no-coverage`

---

### [x] Task 3: messages.service — edge cases (11 tests) — Done, 11 tests passing

**File to read first:** `apps/api/src/modules/messages/messages.service.ts` (873 lines)
**File to create/append:** `apps/api/src/modules/messages/messages.service.edge.spec.ts`

**Tests to write:**
1. `sendMessage` with Arabic message: `'السلام عليكم ورحمة الله وبركاته'` — accepted
2. `sendMessage` with 10,000 character message — test against actual limit
3. `sendMessage` with empty content `''` — test behavior (may be allowed for media messages)
4. `sendMessage` with content containing null bytes `'hello\x00world'` — does NOT crash
5. `sendMessage` with emoji-only message: `'🤲🕌📿🌙'` — accepted
6. `forwardMessage` with targetConversationIds as empty array `[]` — rejected
7. `forwardMessage` with 6 target conversations (limit is 5) — rejected with BadRequestException
8. `editMessage` with content changed to empty string — test behavior
9. `editMessage` with content containing RTL overrides: `'\u202E\u202D mixed direction'` — accepted without crash
10. `reactToMessage` with emoji that is multi-codepoint: `'👨‍👩‍👧‍👦'` (family emoji, 7 codepoints) — accepted

**Run:** `npx jest --testPathPattern="messages.service.edge" --no-coverage`

---

### [x] Task 4: reels.service — edge cases (10 tests) — Done, 10 tests passing

**File to read first:** `apps/api/src/modules/reels/reels.service.ts` (937 lines)
**File to create/append:** `apps/api/src/modules/reels/reels.service.edge.spec.ts`

**Tests to write:**
1. `create` with Arabic caption: `'ما شاء الله تبارك الله #بكرة'` — accepted
2. `create` with caption of maximum length — test against DTO limit
3. `create` with empty caption — test if allowed (videos can have no caption)
4. `create` with caption containing only hashtags: `'#reel #viral #mizanly'` — accepted
5. `getFeed` with limit = 0, limit = -1 — no crash
6. `getFeed` with user who has no follows and no content exists — returns empty, not error
7. `getTrendingReels` when no reels exist in DB — returns empty array
8. `incrementView` called twice for same reel and same user — should not double-count
9. `like` on reel with `likesCount` at Number.MAX_SAFE_INTEGER — test overflow behavior
10. `getComments` on reel with 0 comments — returns empty array, not error

**Run:** `npx jest --testPathPattern="reels.service.edge" --no-coverage`

---

### [x] Task 5: videos.service — edge cases (10 tests) — Done, 10 tests passing

**File to read first:** `apps/api/src/modules/videos/videos.service.ts` (898 lines)
**File to create/append:** `apps/api/src/modules/videos/videos.service.edge.spec.ts`

**Tests to write:**
1. `create` with Arabic title and description — accepted
2. `create` with title at max length — test against DTO
3. `create` with empty title — rejected
4. `addChapter` with timestamp = "99:99:99" — test validation (invalid time format)
5. `addChapter` with timestamp = "-00:01:00" — rejected
6. `addChapter` with title containing Arabic and emoji — accepted
7. `getWatchProgress` for user with no progress record — returns 0 or null
8. `updateWatchProgress` with progressSeconds = -1 — rejected
9. `updateWatchProgress` with progressSeconds = 999999 (longer than video) — clamped or rejected
10. `getFeed` with cursor pointing to deleted video — skips gracefully

**Run:** `npx jest --testPathPattern="videos.service.edge" --no-coverage`

---

### [x] Task 6: stories.service — edge cases (8 tests) — Done, 8 tests passing

**File to read first:** `apps/api/src/modules/stories/stories.service.ts` (462 lines)
**File to create/append:** `apps/api/src/modules/stories/stories.service.edge.spec.ts`

**Tests to write:**
1. `create` with Arabic text overlay — accepted
2. `create` with story that already expired (createdAt > 24h ago) — test behavior
3. `markViewed` called twice by same user on same story — idempotent (no error, no double count)
4. `getViewers` on a story with 0 views — returns empty array
5. `getFeedStories` when user follows nobody — returns empty, not error
6. `getHighlights` for user with 0 highlights — returns empty array
7. `addToHighlight` with highlight name containing Arabic: `'أبرز القصص'` — accepted
8. `addToHighlight` with highlight name as empty string — rejected

**Run:** `npx jest --testPathPattern="stories.service.edge" --no-coverage`

---

### [x] Task 7: users.service — edge cases (10 tests) — Done, 10 tests passing

**File to read first:** `apps/api/src/modules/users/users.service.ts` (863 lines)
**File to create/append:** `apps/api/src/modules/users/users.service.edge.spec.ts`

**Tests to write:**
1. `updateProfile` with displayName in Arabic: `'عبد الله'` — accepted
2. `updateProfile` with displayName containing emoji: `'Ahmed 🕌'` — test behavior
3. `updateProfile` with bio at maximum length — test against limit
4. `updateProfile` with bio containing only whitespace — test (should reject or trim)
5. `checkUsername` with username containing Arabic characters: `'عبدالله'` — test if rejected (usernames should be alphanumeric)
6. `checkUsername` with username containing emoji: `'user🕌'` — rejected
7. `checkUsername` with username containing SQL injection: `'; DROP TABLE users; --'` — rejected, no crash
8. `checkUsername` with empty string `''` — rejected
9. `searchUsers` with query `''` — returns empty or uses a default
10. `findByPhoneNumbers` with empty array `[]` — returns empty

**Run:** `npx jest --testPathPattern="users.service.edge" --no-coverage`

---

### [x] Task 8: islamic.service — edge cases (15 tests) — Done, 15 tests passing

**File to read first:** `apps/api/src/modules/islamic/islamic.service.ts` (1,798 lines)
**File to create/append:** `apps/api/src/modules/islamic/islamic.service.edge.spec.ts`

**Tests to write:**
1. `getPrayerTimes` with lat = 91 (invalid, max is 90) — rejected or clamped
2. `getPrayerTimes` with lat = -91 (invalid) — rejected or clamped
3. `getPrayerTimes` with lng = 181 (invalid, max is 180) — rejected or clamped
4. `getPrayerTimes` with lat = 65, lng = 25 (Arctic — extreme prayer time edge case) — does not crash
5. `getPrayerTimes` with lat = 0, lng = 0 (Gulf of Guinea — edge case coordinates) — accepted
6. `getQuranChapter` with surahNumber = 0 — rejected (valid range: 1-114)
7. `getQuranChapter` with surahNumber = 115 — rejected
8. `getQuranChapter` with surahNumber = -1 — rejected
9. `getQuranChapter` with surahNumber = 1.5 — rejected (must be integer)
10. `searchQuran` with Arabic query: `'الصبر'` — accepted, returns results
11. `searchQuran` with query containing special regex characters: `'verse (1) [test]'` — does not crash (no regex injection)
12. `calculateZakat` with all zeros: `{ cash: 0, gold: 0, silver: 0 }` — returns zakat = 0
13. `calculateZakat` with negative cash: `{ cash: -1000 }` — rejected
14. `calculateZakat` with cash exactly at nisab threshold — test boundary (zakat should be exactly 2.5%)
15. `getNearbyMosques` with radius = 0 — returns empty or very close mosques only

**Run:** `npx jest --testPathPattern="islamic.service.edge" --no-coverage`

---

### [ ] Task 9: channels.service — edge cases (8 tests)

**File to read first:** `apps/api/src/modules/channels/channels.service.ts` (504 lines)
**File to create/append:** `apps/api/src/modules/channels/channels.service.edge.spec.ts`

**Tests to write:**
1. `create` with Arabic channel name: `'قناة المعرفة'` — accepted
2. `create` with channel handle containing spaces — rejected
3. `create` with channel handle containing SQL injection: `'channel; DROP TABLE'` — rejected
4. `getByHandle` with handle that doesn't exist — returns NotFoundException
5. `subscribe` to a channel you're already subscribed to — idempotent
6. `unsubscribe` from a channel you're not subscribed to — no error
7. `getFeed` for channel with 0 posts — returns empty array
8. `getAnalytics` for channel with 0 subscribers — returns zeros, not error

**Run:** `npx jest --testPathPattern="channels.service.edge" --no-coverage`

---

### [ ] Task 10: follows.service — edge cases (8 tests)

**File to read first:** `apps/api/src/modules/follows/follows.service.ts` (420 lines)
**File to create/append:** `apps/api/src/modules/follows/follows.service.edge.spec.ts`

**Tests to write:**
1. `follow` yourself (userId === targetUserId) — rejected with BadRequestException
2. `follow` a user you already follow — idempotent or error
3. `unfollow` a user you don't follow — no error
4. `follow` a private account — creates FollowRequest, not Follow
5. `getFollowers` for user with 0 followers — returns empty array
6. `getFollowing` for user with 0 following — returns empty array
7. `getMutualFollowers` when no mutual followers exist — returns empty array
8. `acceptRequest` for a request that doesn't exist — NotFoundException

**Run:** `npx jest --testPathPattern="follows.service.edge" --no-coverage`

---

### [ ] Task 11: gamification.service — edge cases (8 tests)

**File to read first:** `apps/api/src/modules/gamification/gamification.service.ts` (584 lines)
**File to create/append:** `apps/api/src/modules/gamification/gamification.service.edge.spec.ts`

**Tests to write:**
1. `awardXP` with amount = 0 — no effect (no crash)
2. `awardXP` with amount = -100 — rejected (no negative XP)
3. `getStreak` for user who has never posted — returns streak = 0
4. `updateStreak` at exactly midnight boundary — test day-change logic
5. `getLeaderboard` with no users — returns empty array
6. `unlockAchievement` for already-unlocked achievement — idempotent
7. `joinChallenge` for challenge that is already full — rejected
8. `joinChallenge` for challenge that has ended — rejected

**Run:** `npx jest --testPathPattern="gamification.service.edge" --no-coverage`

---

### [ ] Task 12: ai.service — edge cases (8 tests)

**File to read first:** `apps/api/src/modules/ai/ai.service.ts` (603 lines)
**File to create/append:** `apps/api/src/modules/ai/ai.service.edge.spec.ts`

**Tests to write:**
1. `moderateContent` with Arabic text: `'محتوى إسلامي مفيد'` — returns SAFE
2. `moderateContent` with empty string — returns SAFE or skips (no crash)
3. `moderateContent` with 50,000 character text — test behavior (may truncate or reject)
4. `suggestCaptions` with empty content — returns empty array or error
5. `translateText` with Arabic to English — returns English text
6. `translateText` with same source and target language — returns original or error
7. `generateSmartReplies` with empty message — returns empty array
8. `moderateImage` with URL to non-existent image — returns error, not crash

**Run:** `npx jest --testPathPattern="ai.service.edge" --no-coverage`

---

### [ ] Task 13: search.service — edge cases (8 tests)

**File to read first:** `apps/api/src/modules/search/search.service.ts` (583 lines)
**File to create/append:** `apps/api/src/modules/search/search.service.edge.spec.ts`

**Tests to write:**
1. `search` with Arabic query: `'إسلام'` — returns results, no crash
2. `search` with query containing regex special chars: `'user (test) [bracket]'` — no regex injection
3. `search` with query = `''` — returns empty or error
4. `search` with query = 1 character — test minimum length
5. `search` with query of 1000 characters — test max length
6. `getAutocompleteSuggestions` with query = `''` — returns empty
7. `getTrendingSearches` with no search history — returns empty array
8. `saveRecentSearch` with query containing zero-width characters — accepted or cleaned

**Run:** `npx jest --testPathPattern="search.service.edge" --no-coverage`

---

### [ ] Task 14: encryption.service — edge cases (6 tests)

**File to read first:** `apps/api/src/modules/encryption/encryption.service.ts` (309 lines)
**File to create/append:** `apps/api/src/modules/encryption/encryption.service.edge.spec.ts`

**Tests to write:**
1. `registerKey` with empty public key — rejected
2. `registerKey` with malformed key (not valid base64) — rejected or handled
3. `getPublicKey` for non-existent user — returns null or NotFoundException
4. `getBulkKeys` with empty userId array — returns empty object
5. `getBulkKeys` with 1000 userIds — test performance boundary
6. `computeSafetyNumber` with same user twice — test behavior (shouldn't crash)

**Run:** `npx jest --testPathPattern="encryption.service.edge" --no-coverage`

---

### [ ] Task 15: gifts.service — edge cases (6 tests)

**File to read first:** `apps/api/src/modules/gifts/gifts.service.ts` (275 lines)
**File to create/append:** `apps/api/src/modules/gifts/gifts.service.edge.spec.ts`

**Tests to write:**
1. `send` with amount = 0 — rejected
2. `send` with amount = -1 — rejected
3. `send` with amount greater than user's balance — rejected
4. `send` to yourself (senderId === receiverId) — rejected (self-gifting abuse vector)
5. `purchaseCoins` with amount = 0 — rejected
6. `getCoinBalance` for user who never purchased — returns 0

**Run:** `npx jest --testPathPattern="gifts.service.edge" --no-coverage`

---

### [ ] Task 16: commerce.service — edge cases (6 tests)

**File to read first:** `apps/api/src/modules/commerce/commerce.service.ts` (341 lines)
**File to create/append:** `apps/api/src/modules/commerce/commerce.service.edge.spec.ts`

**Tests to write:**
1. `createProduct` with price = 0 — test if allowed (free products?)
2. `createProduct` with price = -1 — rejected
3. `createProduct` with Arabic title: `'حلال عطور'` — accepted
4. `createOrder` with quantity = 0 — rejected
5. `createOrder` with quantity > stock — rejected
6. `getProducts` when no products exist — returns empty array

**Run:** `npx jest --testPathPattern="commerce.service.edge" --no-coverage`

---

### [ ] Task 17: events.service — edge cases (6 tests)

**File to read first:** `apps/api/src/modules/events/events.service.ts` (413 lines)
**File to create/append:** `apps/api/src/modules/events/events.service.edge.spec.ts`

**Tests to write:**
1. `create` with Arabic event title: `'ليلة القدر'` — accepted
2. `create` with start date in the past — test behavior (should it be rejected?)
3. `create` with end date before start date — rejected
4. `rsvp` to event that is already full (maxAttendees reached) — rejected
5. `rsvp` to event you're already attending — idempotent
6. `cancelRsvp` for event you're not attending — no error

**Run:** `npx jest --testPathPattern="events.service.edge" --no-coverage`

---

### [ ] Task 18: communities.service — edge cases (6 tests)

**File to read first:** `apps/api/src/modules/communities/communities.service.ts` (418 lines)
**File to create/append:** `apps/api/src/modules/communities/communities.service.edge.spec.ts`

**Tests to write:**
1. `create` with Arabic community name: `'مجتمع المسلمين'` — accepted
2. `join` a community you're already a member of — idempotent
3. `leave` a community you're not a member of — no error
4. `leave` as the owner/creator — test behavior (should it transfer ownership or reject?)
5. `getMembers` for community with 0 members — returns empty array
6. `getPosts` for community with 0 posts — returns empty array

**Run:** `npx jest --testPathPattern="communities.service.edge" --no-coverage`

---

### [ ] Task 19: live.service — edge cases (6 tests)

**File to read first:** `apps/api/src/modules/live/live.service.ts` (336 lines)
**File to create/append:** `apps/api/src/modules/live/live.service.edge.spec.ts`

**Tests to write:**
1. `addGuest` when already at max guests (4) — rejected
2. `addGuest` adding yourself as guest — rejected
3. `goLive` when already live — test idempotency
4. `endStream` on stream that already ended — no crash
5. `setSubscribersOnly` with no subscribers — accepted (no crash)
6. `getActiveStreams` when no streams are active — returns empty array

**Run:** `npx jest --testPathPattern="live.service.edge" --no-coverage`

---

### [ ] Task 20: bookmarks.service — edge cases (6 tests)

**File to read first:** `apps/api/src/modules/bookmarks/bookmarks.service.ts` (404 lines)
**File to create/append:** `apps/api/src/modules/bookmarks/bookmarks.service.edge.spec.ts`

**Tests to write:**
1. `bookmark` a post that's already bookmarked — idempotent
2. `unbookmark` a post that's not bookmarked — no error
3. `createFolder` with Arabic name: `'مفضلاتي'` — accepted
4. `createFolder` with empty name — rejected
5. `getBookmarks` when no bookmarks exist — returns empty array
6. `getBookmarkFolders` when no folders exist — returns empty array

**Run:** `npx jest --testPathPattern="bookmarks.service.edge" --no-coverage`

---

### [ ] Task 21: payments.service — edge cases (6 tests)

**File to read first:** `apps/api/src/modules/payments/payments.service.ts` (419 lines)
**File to create/append:** `apps/api/src/modules/payments/payments.service.edge.spec.ts`

**Tests to write:**
1. `createPaymentIntent` with amount = 0 — rejected
2. `createPaymentIntent` with amount = -100 — rejected
3. `createPaymentIntent` with very large amount (999999999) — test if Stripe limit is enforced
4. `processWebhook` with invalid signature — rejected with ForbiddenException
5. `getPaymentHistory` for user with no payments — returns empty array
6. `refund` on already-refunded payment — test behavior

**Run:** `npx jest --testPathPattern="payments.service.edge" --no-coverage`

---

### [ ] Task 22: polls.service — edge cases (6 tests)

**File to read first:** `apps/api/src/modules/polls/polls.service.ts` (254 lines)
**File to create/append:** `apps/api/src/modules/polls/polls.service.edge.spec.ts`

**Tests to write:**
1. `create` with Arabic options: `['نعم', 'لا', 'ربما']` — accepted
2. `create` with 1 option (need minimum 2) — rejected
3. `create` with 50 options — test max limit
4. `vote` on closed poll — rejected
5. `vote` twice on same poll (same user) — changes vote or rejected
6. `getResults` on poll with 0 votes — returns all options with 0 counts

**Run:** `npx jest --testPathPattern="polls.service.edge" --no-coverage`

---

### [ ] Task 23: hashtags.service — edge cases (6 tests)

**File to read first:** `apps/api/src/modules/hashtags/hashtags.service.ts` (419 lines)
**File to create/append:** `apps/api/src/modules/hashtags/hashtags.service.edge.spec.ts`

**Tests to write:**
1. `getByName` with Arabic hashtag: `'إسلام'` — test if supported
2. `getByName` with hashtag that doesn't exist — returns null/NotFoundException
3. `follow` a hashtag you already follow — idempotent
4. `unfollow` a hashtag you don't follow — no error
5. `getTrending` with no hashtags in DB — returns empty array
6. `search` with query `''` — returns empty or all

**Run:** `npx jest --testPathPattern="hashtags.service.edge" --no-coverage`

---

### [ ] Task 24: moderation.service — edge cases (6 tests)

**File to read first:** `apps/api/src/modules/moderation/moderation.service.ts` (396 lines)
**File to create/append:** `apps/api/src/modules/moderation/moderation.service.edge.spec.ts`

**Tests to write:**
1. `flagContent` with Arabic reason: `'محتوى مسيء'` — accepted
2. `getReviewQueue` when queue is empty — returns empty array
3. `resolveReport` on already-resolved report — test behavior
4. `appealDecision` on content that was not moderated — rejected
5. `appealDecision` with empty appeal reason — rejected
6. `checkText` with text containing only whitespace — returns SAFE or skips

**Run:** `npx jest --testPathPattern="moderation.service.edge" --no-coverage`

---

### [ ] Task 25: two-factor.service — edge cases (6 tests)

**File to read first:** `apps/api/src/modules/two-factor/two-factor.service.ts` (295 lines)
**File to create/append:** `apps/api/src/modules/two-factor/two-factor.service.edge.spec.ts`

**Tests to write:**
1. `verify` with incorrect code — rejected
2. `verify` with expired code — rejected
3. `verify` with empty string code — rejected
4. `setup` for user who already has 2FA enabled — test behavior (re-setup?)
5. `disable` when 2FA is not enabled — no crash
6. `getBackupCodes` count is exactly 10 (or whatever the implementation generates)

**Run:** `npx jest --testPathPattern="two-factor.service.edge" --no-coverage`

---

### [ ] Task 26: parental-controls.service — edge cases (6 tests)

**File to read first:** `apps/api/src/modules/parental-controls/parental-controls.service.ts` (321 lines)
**File to create/append:** `apps/api/src/modules/parental-controls/parental-controls.service.edge.spec.ts`

**Tests to write:**
1. `setPin` with PIN shorter than minimum (e.g., 3 digits) — rejected
2. `setPin` with PIN containing letters — rejected
3. `verifyPin` with wrong PIN — rejected, attempt count incremented
4. `verifyPin` after max attempts exceeded — locked out
5. `updateSettings` with screenTimeLimit = -1 — rejected
6. `updateSettings` with screenTimeLimit = 0 — test (disable or reject?)

**Run:** `npx jest --testPathPattern="parental-controls.service.edge" --no-coverage`

---

### [ ] Task 27: broadcast.service — edge cases (6 tests)

**File to read first:** `apps/api/src/modules/broadcast/broadcast.service.ts` (259 lines)
**File to create/append:** `apps/api/src/modules/broadcast/broadcast.service.edge.spec.ts`

**Tests to write:**
1. `create` with Arabic broadcast name: `'بث مباشر'` — accepted
2. `create` with empty name — rejected
3. `sendMessage` to broadcast with 0 subscribers — no crash (message sent to nobody)
4. `subscribe` to broadcast you're already subscribed to — idempotent
5. `unsubscribe` from broadcast you're not subscribed to — no error
6. `getSubscribers` for broadcast with 0 subscribers — returns empty array

**Run:** `npx jest --testPathPattern="broadcast.service.edge" --no-coverage`

---

### [ ] Task 28: discord-features.service — edge cases (6 tests)

**File to read first:** `apps/api/src/modules/discord-features/discord-features.service.ts` (186 lines)
**File to create/append:** `apps/api/src/modules/discord-features/discord-features.service.edge.spec.ts`

**Tests to write:**
1. `createForumThread` with Arabic title: `'نقاش في الفقه'` — accepted
2. `createForumThread` with empty title — rejected
3. `createWebhook` with invalid URL — rejected
4. `createWebhook` with URL containing SQL injection — rejected, no crash
5. `getForumThreads` when no threads exist — returns empty array
6. `createStageSession` with empty topic — rejected

**Run:** `npx jest --testPathPattern="discord-features.service.edge" --no-coverage`

---

### [ ] Task 29: telegram-features.service — edge cases (6 tests)

**File to read first:** `apps/api/src/modules/telegram-features/telegram-features.service.ts` (359 lines)
**File to create/append:** `apps/api/src/modules/telegram-features/telegram-features.service.edge.spec.ts`

**Tests to write:**
1. `saveSelf` with Arabic message: `'رسالة محفوظة'` — accepted
2. `createFolder` with Arabic folder name: `'مجلد خاص'` — accepted
3. `createFolder` with empty name — rejected
4. `setSlowMode` with interval = 0 — disables slow mode
5. `setSlowMode` with interval = -1 — rejected
6. `getSavedMessages` when no saved messages — returns empty array

**Run:** `npx jest --testPathPattern="telegram-features.service.edge" --no-coverage`

---

### [ ] Task 30: remaining small services — edge cases (15 tests)

**Files to create/append:** One edge spec per service listed below.
**For EACH service, write 3 edge case tests (minimum).**

Group these into ONE spec file: `apps/api/src/modules/misc-edge-cases.spec.ts` (or individual edge spec files per module — your choice, but all 15 tests must exist).

| Service | Test 1 | Test 2 | Test 3 |
|---------|--------|--------|--------|
| `alt-profile.service.ts` | Create with Arabic name | Access control: User B cannot view User A's alt profile | Delete non-existent alt profile |
| `stickers.service.ts` | Generate sticker with Arabic prompt | Generate with empty prompt | Rate limit handling |
| `playlists.service.ts` | Create with Arabic title | Add duplicate item | Reorder with invalid indices |
| `drafts.service.ts` | Save draft with Arabic content | Load non-existent draft | Delete already-deleted draft |
| `scheduling.service.ts` | Schedule post with Arabic content | Schedule in past — rejected | Cancel non-existent schedule |

**Run:** `npx jest --testPathPattern="edge" --no-coverage`

---

## SECTION 2: AUTHORIZATION MATRIX (Tasks 31-70, ~400 tests)

**This is the most important section.** For EVERY service method that modifies data (create, update, delete, like, follow, send, etc.), verify that User A CANNOT access User B's resources. This catches the #1 production vulnerability: Insecure Direct Object Reference (IDOR).

### Authorization Test Pattern

```typescript
describe('ServiceName — authorization matrix', () => {
  const userA = 'user-a-id';
  const userB = 'user-b-id';

  describe('update — ownership check', () => {
    it('should allow owner to update their own resource', async () => {
      prisma.resource.findUnique.mockResolvedValue({ id: 'res-1', userId: userA } as any);
      prisma.resource.update.mockResolvedValue({ ...mockResource, content: 'updated' } as any);
      const result = await service.update('res-1', userA, { content: 'updated' });
      expect(result.content).toBe('updated');
    });

    it('should throw ForbiddenException when non-owner tries to update', async () => {
      prisma.resource.findUnique.mockResolvedValue({ id: 'res-1', userId: userA } as any);
      await expect(service.update('res-1', userB, { content: 'hacked' }))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('delete — ownership check', () => {
    it('should allow owner to delete', async () => { ... });
    it('should throw ForbiddenException when non-owner tries to delete', async () => { ... });
  });
});
```

**CRITICAL: Before writing authorization tests for a service, READ the service implementation and find EVERY method that:**
1. Takes a `userId` parameter
2. Loads a resource from DB
3. Checks if `resource.userId === userId`
4. If the check EXISTS: test that it works
5. If the check is MISSING: still write the test — it should FAIL, exposing an IDOR vulnerability. Note in the test comment: `// IDOR: no ownership check in implementation`

---

### [ ] Task 31: posts.service — auth matrix (15 tests)

**File to read:** `apps/api/src/modules/posts/posts.service.ts`
**File to create:** `apps/api/src/modules/posts/posts.service.auth.spec.ts`

**EVERY write method needs 2 tests: owner-allowed + non-owner-rejected.**

| Method | Owner Test | Non-Owner Test |
|--------|-----------|---------------|
| `update(postId, userId, dto)` | Owner can update content | Non-owner gets ForbiddenException |
| `delete(postId, userId)` | Owner can delete | Non-owner gets ForbiddenException |
| `like(postId, userId)` | Any user can like any post | (no ownership check needed) |
| `unlike(postId, userId)` | Only the liker can unlike | Different user unliking → should only remove THEIR like |
| `save(postId, userId)` | Any user can save | (bookmark is per-user) |
| `addComment(postId, userId, dto)` | Any user can comment on any post | (verify comment's userId is set correctly) |
| `deleteComment(commentId, userId)` | Comment author can delete | Non-author gets ForbiddenException |
| `pin(postId, userId)` | Owner can pin | Non-owner gets ForbiddenException |

Plus:
- User A's post should not appear in User B's "my posts" query
- Deleted post by User A should not be editable by User A (NotFoundException)
- isRemoved post not accessible by anyone

**Run:** `npx jest --testPathPattern="posts.service.auth" --no-coverage`

---

### [ ] Task 32: threads.service — auth matrix (12 tests)

**File to read:** `apps/api/src/modules/threads/threads.service.ts`
**File to create:** `apps/api/src/modules/threads/threads.service.auth.spec.ts`

| Method | Tests |
|--------|-------|
| `update(threadId, userId, dto)` | Owner allowed, non-owner rejected |
| `delete(threadId, userId)` | Owner allowed, non-owner rejected |
| `deleteReply(replyId, userId)` | Reply author allowed, non-author rejected |
| `like(threadId, userId)` | Any user (no ownership) |
| `repost(threadId, userId)` | Any user (no ownership) |
| `bookmark(threadId, userId)` | Per-user operation |

**Minimum 12 tests.**

---

### [ ] Task 33: messages.service — auth matrix (12 tests)

**File to read:** `apps/api/src/modules/messages/messages.service.ts`
**File to create:** `apps/api/src/modules/messages/messages.service.auth.spec.ts`

| Method | Tests |
|--------|-------|
| `sendMessage(conversationId, senderId, dto)` | Member can send, non-member rejected |
| `editMessage(messageId, userId, content)` | Sender can edit, non-sender rejected |
| `deleteMessage(messageId, userId)` | Sender can delete, non-sender rejected |
| `forwardMessage(messageId, userId, targetIds)` | Must be member of source AND all targets |
| `getConversationMessages(convId, userId, ...)` | Member can read, non-member rejected |
| `reactToMessage(messageId, userId, emoji)` | Must be member of conversation |

**Minimum 12 tests.**

---

### [ ] Task 34: reels.service — auth matrix (10 tests)

**File to read:** `apps/api/src/modules/reels/reels.service.ts`
**File to create:** `apps/api/src/modules/reels/reels.service.auth.spec.ts`

| Method | Tests |
|--------|-------|
| `update(reelId, userId, dto)` | Owner allowed, non-owner rejected |
| `delete(reelId, userId)` | Owner allowed, non-owner rejected |
| `like/unlike` | Any user / per-user |
| `addComment/deleteComment` | Any user can comment / only comment author can delete |

**Minimum 10 tests.**

---

### [ ] Task 35: videos.service — auth matrix (10 tests)

**File to read:** `apps/api/src/modules/videos/videos.service.ts`
**File to create:** `apps/api/src/modules/videos/videos.service.auth.spec.ts`

Same pattern as reels. Also test:
- `addChapter` — only video owner
- `deleteChapter` — only video owner
- `updateWatchProgress` — per-user (User A's progress doesn't affect User B)

**Minimum 10 tests.**

---

### [ ] Task 36: stories.service — auth matrix (8 tests)

**File to read:** `apps/api/src/modules/stories/stories.service.ts`
**File to create:** `apps/api/src/modules/stories/stories.service.auth.spec.ts`

| Method | Tests |
|--------|-------|
| `delete(storyId, userId)` | Owner allowed, non-owner rejected |
| `addToHighlight(storyId, userId, ...)` | Owner allowed, non-owner rejected |
| `removeFromHighlight` | Owner allowed, non-owner rejected |
| `getViewers(storyId, userId)` | Only story owner can see viewers |
| Close friends story: non-close-friend cannot view | ForbiddenException or NotFoundException |

**Minimum 8 tests.**

---

### [ ] Task 37: channels.service — auth matrix (10 tests)

**File to read:** `apps/api/src/modules/channels/channels.service.ts`
**File to create:** `apps/api/src/modules/channels/channels.service.auth.spec.ts`

| Method | Tests |
|--------|-------|
| `update(channelId, userId, dto)` | Owner allowed, non-owner rejected |
| `delete(channelId, userId)` | Owner allowed, non-owner rejected |
| `getAnalytics(channelId, userId)` | Owner allowed, non-owner rejected |
| `subscribe/unsubscribe` | Any user (per-user operation) |
| Non-subscriber cannot post to channel | ForbiddenException |

**Minimum 10 tests.**

---

### [ ] Task 38: users.service — auth matrix (8 tests)

**File to read:** `apps/api/src/modules/users/users.service.ts`
**File to create:** `apps/api/src/modules/users/users.service.auth.spec.ts`

| Method | Tests |
|--------|-------|
| `updateProfile(userId, dto)` | Can only update own profile |
| `deleteAccount(userId)` | Can only delete own account |
| `exportData(userId)` | Can only export own data |
| `getProfile` of blocked user | Blocked user should get NotFoundException or empty |
| `getProfile` of private account (not following) | Limited data returned |

**Minimum 8 tests.**

---

### [ ] Task 39: encryption.service — auth matrix (6 tests)

**File to read:** `apps/api/src/modules/encryption/encryption.service.ts`
**File to create:** `apps/api/src/modules/encryption/encryption.service.auth.spec.ts`

| Method | Tests |
|--------|-------|
| `registerKey(userId, publicKey)` | Can only register own key |
| `rotateKey(userId, newKey)` | Can only rotate own key |
| `getEnvelope(envelopeId, userId)` | Only recipient can retrieve |
| User A cannot overwrite User B's public key | ForbiddenException |

**Minimum 6 tests.**

---

### [ ] Task 40: gifts.service — auth matrix (6 tests)

**File to read:** `apps/api/src/modules/gifts/gifts.service.ts`
**File to create:** `apps/api/src/modules/gifts/gifts.service.auth.spec.ts`

| Method | Tests |
|--------|-------|
| `send(senderId, receiverId, amount)` | Sender's balance deducted, receiver credited |
| `send` self-gift (senderId === receiverId) | MUST be rejected (abuse vector) |
| `getCoinBalance(userId)` | Can only see own balance |
| `getReceived(userId)` | Can only see own received gifts |
| `getSent(userId)` | Can only see own sent gifts |
| `purchaseCoins(userId, amount)` | Can only purchase for self |

**Minimum 6 tests.**

---

### [ ] Task 41: commerce.service — auth matrix (8 tests)

**File to read:** `apps/api/src/modules/commerce/commerce.service.ts`
**File to create:** `apps/api/src/modules/commerce/commerce.service.auth.spec.ts`

| Method | Tests |
|--------|-------|
| `updateProduct(productId, userId, dto)` | Owner allowed, non-owner rejected |
| `deleteProduct(productId, userId)` | Owner allowed, non-owner rejected |
| `cancelOrder(orderId, userId)` | Only buyer can cancel |
| `fulfillOrder(orderId, userId)` | Only seller can fulfill |
| `addReview` | Only buyer who purchased can review |
| User A's orders not visible to User B | Different userId returns different results |

**Minimum 8 tests.**

---

### [ ] Task 42: communities.service — auth matrix (8 tests)

**File to read:** `apps/api/src/modules/communities/communities.service.ts`
**File to create:** `apps/api/src/modules/communities/communities.service.auth.spec.ts`

| Method | Tests |
|--------|-------|
| `update(communityId, userId, dto)` | Only admin/owner |
| `delete(communityId, userId)` | Only owner |
| `removeMember(communityId, userId, memberId)` | Only admin can remove |
| `post(communityId, userId, dto)` | Only members can post |
| Non-member cannot see private community posts | Rejected |
| Non-admin cannot change community settings | Rejected |

**Minimum 8 tests.**

---

### [ ] Task 43: live.service — auth matrix (6 tests)

**File to read:** `apps/api/src/modules/live/live.service.ts`
**File to create:** `apps/api/src/modules/live/live.service.auth.spec.ts`

| Method | Tests |
|--------|-------|
| `endStream(sessionId, userId)` | Only host can end |
| `removeGuest(sessionId, userId, guestId)` | Only host can remove guests |
| `setSubscribersOnly(sessionId, userId)` | Only host can toggle |
| `goLive(sessionId, userId)` | Only creator who started rehearsal |
| Non-host cannot modify stream settings | ForbiddenException |

**Minimum 6 tests.**

---

### [ ] Task 44: bookmarks.service — auth matrix (6 tests)

**File to read:** `apps/api/src/modules/bookmarks/bookmarks.service.ts`
**File to create:** `apps/api/src/modules/bookmarks/bookmarks.service.auth.spec.ts`

| Method | Tests |
|--------|-------|
| `getBookmarks(userId)` | Can only see own bookmarks |
| `deleteFolder(folderId, userId)` | Can only delete own folders |
| User A's bookmarks NEVER returned for User B queries | Isolation |
| User A cannot add User B's post to User B's folder | Should fail |

**Minimum 6 tests.**

---

### [ ] Task 45: events.service — auth matrix (6 tests)

**File to read:** `apps/api/src/modules/events/events.service.ts`
**File to create:** `apps/api/src/modules/events/events.service.auth.spec.ts`

| Method | Tests |
|--------|-------|
| `update(eventId, userId, dto)` | Only organizer |
| `delete(eventId, userId)` | Only organizer |
| `cancelRsvp(eventId, userId)` | Can only cancel own RSVP |
| Non-organizer cannot see attendee details (if private) | Restricted |

**Minimum 6 tests.**

---

### [ ] Task 46: settings.service — auth matrix (4 tests)

**File to read:** `apps/api/src/modules/settings/settings.service.ts`
**File to create:** `apps/api/src/modules/settings/settings.service.auth.spec.ts`

| Method | Tests |
|--------|-------|
| `getAll(userId)` | Can only get own settings |
| `update(userId, dto)` | Can only update own settings |
| User A's settings NEVER leaked to User B | Isolation |
| User A cannot update User B's quiet mode | Rejected |

**Minimum 4 tests.**

---

### [ ] Task 47: privacy.service — auth matrix (4 tests)

**File to read:** `apps/api/src/modules/privacy/privacy.service.ts`
**File to create:** `apps/api/src/modules/privacy/privacy.service.auth.spec.ts`

| Method | Tests |
|--------|-------|
| `getSettings(userId)` | Own settings only |
| `updateSettings(userId, dto)` | Own settings only |
| User A cannot read User B's privacy settings | Rejected |
| User A cannot disable User B's read receipts | Rejected |

**Minimum 4 tests.**

---

### [ ] Task 48: devices.service — auth matrix (4 tests)

**File to read:** `apps/api/src/modules/devices/devices.service.ts`
**File to create:** `apps/api/src/modules/devices/devices.service.auth.spec.ts`

| Method | Tests |
|--------|-------|
| `getSessions(userId)` | Own sessions only |
| `logoutSession(sessionId, userId)` | Can only logout own session |
| `logoutAllOther(userId)` | Only affects own sessions |
| User A cannot see/logout User B's devices | Rejected |

**Minimum 4 tests.**

---

### [ ] Task 49: alt-profile.service — auth matrix (6 tests)

**File to read:** `apps/api/src/modules/alt-profile/alt-profile.service.ts`
**File to create:** `apps/api/src/modules/alt-profile/alt-profile.service.auth.spec.ts`

| Method | Tests |
|--------|-------|
| `create(userId, dto)` | Creates for self |
| `get(userId, requestingUserId)` | Owner can view, granted user can view |
| `update(userId, dto)` | Only owner |
| `delete(userId)` | Only owner |
| `grantAccess(userId, targetUserId)` | Only owner can grant |
| Non-granted User B cannot see User A's alt profile | NotFoundException |

**Minimum 6 tests.**

---

### [ ] Task 50: monetization.service — auth matrix (6 tests)

**File to read:** `apps/api/src/modules/monetization/monetization.service.ts`
**File to create:** `apps/api/src/modules/monetization/monetization.service.auth.spec.ts`

| Method | Tests |
|--------|-------|
| `createTier(userId, dto)` | Creator creates own tier |
| `deleteTier(tierId, userId)` | Only tier creator |
| `getRevenue(userId)` | Only own revenue |
| `getSubscribers(userId)` | Only own subscriber list |
| Non-creator User B cannot create tiers | Logic check |
| User A's revenue never leaked to User B | Isolation |

**Minimum 6 tests.**

---

### [ ] Task 51: creator.service — auth matrix (6 tests)

**File to read:** `apps/api/src/modules/creator/creator.service.ts`
**File to create:** `apps/api/src/modules/creator/creator.service.auth.spec.ts`

| Method | Tests |
|--------|-------|
| `getDashboard(userId)` | Own dashboard only |
| `getAnalytics(userId)` | Own analytics only |
| `getRevenue(userId)` | Own revenue only |
| `getStorefront(userId)` | Own storefront only |
| `createStorefrontItem(userId, dto)` | Creates for self |
| User A cannot view User B's creator analytics | Rejected |

**Minimum 6 tests.**

---

### [ ] Task 52: playlists.service — auth matrix (6 tests)

**File to read:** `apps/api/src/modules/playlists/playlists.service.ts`
**File to create:** `apps/api/src/modules/playlists/playlists.service.auth.spec.ts`

| Method | Tests |
|--------|-------|
| `update(playlistId, userId, dto)` | Owner allowed |
| `delete(playlistId, userId)` | Owner allowed |
| `addItem(playlistId, userId, videoId)` | Owner or collaborator |
| `removeItem(playlistId, userId, itemId)` | Owner or collaborator |
| `reorder(playlistId, userId, items)` | Owner only |
| Non-owner cannot modify | Rejected |

**Minimum 6 tests.**

---

### [ ] Task 53: majlis-lists.service — auth matrix (6 tests)

**File to read:** `apps/api/src/modules/majlis-lists/majlis-lists.service.ts`
**File to create:** `apps/api/src/modules/majlis-lists/majlis-lists.service.auth.spec.ts`

| Method | Tests |
|--------|-------|
| `update(listId, userId, dto)` | Owner only |
| `delete(listId, userId)` | Owner only |
| `addMember(listId, userId, memberId)` | Owner only |
| `removeMember(listId, userId, memberId)` | Owner only |
| Non-owner cannot see private list members | Rejected |
| Non-owner cannot modify list | Rejected |

**Minimum 6 tests.**

---

### [ ] Task 54: reports.service — auth matrix (4 tests)

**File to read:** `apps/api/src/modules/reports/reports.service.ts`
**File to create:** `apps/api/src/modules/reports/reports.service.auth.spec.ts`

| Method | Tests |
|--------|-------|
| `getMyReports(userId)` | Own reports only |
| `appeal(reportId, userId, reason)` | Only reported user can appeal |
| `resolveReport(reportId, adminId)` | Only admin can resolve |
| Non-admin cannot access review queue | Rejected |

**Minimum 4 tests.**

---

### [ ] Task 55: scheduling.service — auth matrix (4 tests)

**File to read:** `apps/api/src/modules/scheduling/scheduling.service.ts`
**File to create:** `apps/api/src/modules/scheduling/scheduling.service.auth.spec.ts`

| Method | Tests |
|--------|-------|
| `cancel(scheduleId, userId)` | Only creator |
| `getScheduled(userId)` | Own scheduled posts only |
| Non-owner cannot cancel | Rejected |
| Non-owner cannot view scheduled posts | Rejected |

**Minimum 4 tests.**

---

### [ ] Task 56: circles.service — auth matrix (6 tests)

**File to read:** `apps/api/src/modules/circles/circles.service.ts`
**File to create:** `apps/api/src/modules/circles/circles.service.auth.spec.ts`

| Method | Tests |
|--------|-------|
| `getMyCircles(userId)` | Own circles only |
| `addMember(circleId, userId, memberId)` | Only circle owner |
| `removeMember(circleId, userId, memberId)` | Only circle owner |
| `deleteCircle(circleId, userId)` | Only circle owner |
| Non-owner cannot modify circle | Rejected |
| Circle member list not visible to non-owner | Restricted |

**Minimum 6 tests.**

---

### [ ] Task 57: webhooks.service — auth matrix (4 tests)

**File to read:** `apps/api/src/modules/webhooks/webhooks.service.ts`
**File to create:** `apps/api/src/modules/webhooks/webhooks.service.auth.spec.ts`

| Method | Tests |
|--------|-------|
| `create(userId, dto)` | User creates for own circle |
| `delete(webhookId, userId)` | Only creator |
| `getDeliveryLog(webhookId, userId)` | Only creator |
| Non-creator cannot delete or view webhook | Rejected |

**Minimum 4 tests.**

---

### [ ] Task 58: audio-rooms.service — auth matrix (6 tests)

**File to read:** `apps/api/src/modules/audio-rooms/audio-rooms.service.ts`
**File to create:** `apps/api/src/modules/audio-rooms/audio-rooms.service.auth.spec.ts`

| Method | Tests |
|--------|-------|
| `end(roomId, userId)` | Only host |
| `mute(roomId, userId, targetId)` | Only host/moderator |
| `setHost(roomId, userId, newHostId)` | Only current host |
| Non-host cannot end room | Rejected |
| Non-host cannot mute others | Rejected |
| Non-member cannot join recording | Rejected |

**Minimum 6 tests.**

---

### [ ] Task 59: scholar-qa.service — auth matrix (4 tests)

**File to read:** `apps/api/src/modules/scholar-qa/scholar-qa.service.ts`
**File to create:** `apps/api/src/modules/scholar-qa/scholar-qa.service.auth.spec.ts`

| Method | Tests |
|--------|-------|
| `startSession(sessionId, userId)` | Only scheduled scholar |
| `endSession(sessionId, userId)` | Only the scholar who started |
| `answer(questionId, userId, content)` | Only the assigned scholar |
| Non-scholar cannot start/end session | Rejected |

**Minimum 4 tests.**

---

### [ ] Task 60: parental-controls.service — auth matrix (4 tests)

**File to read:** `apps/api/src/modules/parental-controls/parental-controls.service.ts`
**File to create:** `apps/api/src/modules/parental-controls/parental-controls.service.auth.spec.ts`

| Method | Tests |
|--------|-------|
| `setPin(userId, pin)` | Can only set own PIN |
| `getSettings(userId)` | Can only see own settings |
| `updateSettings(userId, dto)` | Can only update own |
| `getActivityDigest(userId)` | Can only see own child's activity |

**Minimum 4 tests.**

---

### [ ] Task 61-65: Batch auth tests for small services (20 tests total)

Write 4 auth tests each for these services:

**Task 61:** `story-chains.service` — Only chain creator can add entries, delete chain. Non-creator cannot modify.
**Task 62:** `promotions.service` — Only promotion creator can pause/resume/delete. Non-creator cannot modify.
**Task 63:** `downloads.service` — Only the requester can see their downloads. User A cannot see User B's downloads.
**Task 64:** `collabs.service` — Only the invited user can accept/decline. Inviter can cancel. Non-parties cannot interfere.
**Task 65:** `mosques.service` — Only mosque admin can edit mosque. Any user can join/leave. Non-admin cannot delete.

**4 tests each × 5 services = 20 tests.**

---

### [ ] Task 66-70: Batch auth tests for remaining services (20 tests total)

**Task 66:** `admin.service` — Admin-only access. Non-admin gets ForbiddenException on ALL admin methods.
**Task 67:** `notifications.service` — Can only mark OWN notifications read. Can only see OWN notification preferences.
**Task 68:** `chat-export.service` — Can only export conversations you're a member of.
**Task 69:** `clips.service` — Only clip creator can delete. Any user can view public clips.
**Task 70:** `subtitles.service` — Only video owner can generate/edit subtitles.

**4 tests each × 5 services = 20 tests.**

---

## SECTION 3: ERROR RECOVERY TESTS (Tasks 71-85, ~150 tests)

These tests verify that when external dependencies fail, the service handles it gracefully (returns error, uses fallback, or retries) instead of crashing with an unhandled exception.

### Error Recovery Pattern

```typescript
describe('ServiceName — error recovery', () => {
  it('should handle database connection failure gracefully', async () => {
    prisma.resource.findUnique.mockRejectedValue(new Error('Connection refused'));
    // Service should throw a known NestJS exception (InternalServerErrorException)
    // NOT let the raw "Connection refused" bubble up unhandled
    await expect(service.getById('id', 'user'))
      .rejects.toThrow(); // At minimum, should throw SOMETHING (not hang)
  });

  it('should handle Redis unavailability', async () => {
    redis.get.mockRejectedValue(new Error('ECONNREFUSED'));
    // Service should either fall back to DB or throw gracefully
    // NOT crash the entire request
  });
});
```

---

### [ ] Task 71: islamic.service — external API failures (15 tests)

**This is the most critical error recovery module because it depends on 3 external APIs.**

**File to read:** `apps/api/src/modules/islamic/islamic.service.ts`
**File to create:** `apps/api/src/modules/islamic/islamic.service.recovery.spec.ts`

**Tests:**
1. `getPrayerTimes` — Aladhan API returns 500 → should use local solar calculator fallback
2. `getPrayerTimes` — Aladhan API times out (5s) → should use fallback
3. `getPrayerTimes` — Aladhan API returns malformed JSON → should handle gracefully
4. `getPrayerTimes` — Aladhan API returns 429 (rate limited) → should use fallback
5. `getPrayerTimes` — Redis cache down → should still work (skip cache, call API directly)
6. `getQuranChapter` — Quran.com API returns 500 → should throw InternalServerErrorException or use cached
7. `getQuranChapter` — Quran.com API times out → graceful error
8. `getQuranVerses` — Quran.com API returns empty data → returns empty array, not crash
9. `searchQuran` — Quran.com API down → graceful error message
10. `getNearbyMosques` — DB query returns no results → falls back to OSM Overpass API
11. `getNearbyMosques` — OSM Overpass API returns 500 → returns empty array with message
12. `getNearbyMosques` — OSM Overpass API times out → returns empty with message
13. `getDailyBriefing` — Redis cache for prayer times down → recalculates
14. `getDailyBriefing` — Some components fail but others succeed → returns partial data
15. `calculateZakat` — Gold price API fails → uses env variable fallback price

**Run:** `npx jest --testPathPattern="islamic.service.recovery" --no-coverage`

---

### [ ] Task 72: ai.service — API failures (10 tests)

**File to read:** `apps/api/src/modules/ai/ai.service.ts`
**File to create:** `apps/api/src/modules/ai/ai.service.recovery.spec.ts`

**Tests:**
1. `moderateContent` — Claude API returns 500 → should default to SAFE (fail-open for content)
2. `moderateContent` — Claude API rate limited (429) → should queue for later review
3. `moderateContent` — Claude API times out → default to SAFE with flag for manual review
4. `moderateImage` — Claude Vision API returns 500 → should flag for manual review
5. `moderateImage` — Image URL returns 404 → should return error, not crash
6. `translateText` — API failure → should return original text with error flag
7. `suggestCaptions` — API failure → should return empty array
8. `transcribeVoiceMessage` — Whisper API failure → should flag as "transcription unavailable"
9. `generateAvatar` — API failure → should return null/default avatar
10. `generateSmartReplies` — API failure → should return empty array

**Run:** `npx jest --testPathPattern="ai.service.recovery" --no-coverage`

---

### [ ] Task 73: search.service — Meilisearch failures (6 tests)

**File to read:** `apps/api/src/modules/search/search.service.ts` AND `meilisearch.service.ts`
**File to create:** `apps/api/src/modules/search/search.service.recovery.spec.ts`

**Tests:**
1. `search` — Meilisearch offline → falls back to Prisma fulltext search
2. `search` — Meilisearch returns empty → falls back to Prisma
3. `search` — Meilisearch returns error → falls back to Prisma
4. `getAutocompleteSuggestions` — Meilisearch down → returns empty array
5. `getTrendingSearches` — Redis down → recalculates from DB
6. `saveRecentSearch` — Redis down → silently fails (non-critical)

**Run:** `npx jest --testPathPattern="search.service.recovery" --no-coverage`

---

### [ ] Task 74: payments.service — Stripe failures (8 tests)

**File to read:** `apps/api/src/modules/payments/payments.service.ts`
**File to create:** `apps/api/src/modules/payments/payments.service.recovery.spec.ts`

**Tests:**
1. `createPaymentIntent` — Stripe API returns 500 → InternalServerErrorException
2. `createPaymentIntent` — Stripe API returns card_declined → return friendly error
3. `processWebhook` — Invalid Stripe signature → ForbiddenException
4. `processWebhook` — Webhook event type unknown → log and ignore (not crash)
5. `createSubscription` — Stripe customer not found → create customer first
6. `cancelSubscription` — Stripe returns already_canceled → handle gracefully
7. `refund` — Stripe returns charge_already_refunded → return error, not crash
8. `getPaymentHistory` — Stripe API rate limited → return cached or error

**Run:** `npx jest --testPathPattern="payments.service.recovery" --no-coverage`

---

### [ ] Task 75: stream.service — Cloudflare failures (6 tests)

**File to read:** `apps/api/src/modules/stream/stream.service.ts`
**File to create:** `apps/api/src/modules/stream/stream.service.recovery.spec.ts`

**Tests:**
1. `getUploadUrl` — Cloudflare Stream API returns 500 → InternalServerErrorException
2. `getUploadUrl` — Cloudflare API times out → graceful error
3. `getVideoStatus` — Video ID not found on Cloudflare → NotFoundException
4. `getThumbnail` — Thumbnail generation failed → return placeholder URL
5. `getUploadUrl` — Cloudflare rate limited → retry-after header respected
6. `getUploadUrl` — Cloudflare auth token expired → graceful error message

**Run:** `npx jest --testPathPattern="stream.service.recovery" --no-coverage`

---

### [ ] Task 76: upload.service — R2 failures (4 tests)

**File to read:** `apps/api/src/modules/upload/upload.service.ts`
**File to create:** `apps/api/src/modules/upload/upload.service.recovery.spec.ts`

**Tests:**
1. `getPresignedUrl` — R2 returns error → InternalServerErrorException
2. `getPresignedUrl` — R2 times out → graceful error
3. `validateUpload` — File type not in whitelist → BadRequestException with clear message
4. `validateUpload` — File size exceeds limit → BadRequestException with limit info

**Run:** `npx jest --testPathPattern="upload.service.recovery" --no-coverage`

---

### [ ] Task 77: notifications/push.service — delivery failures (6 tests)

**File to read:** `apps/api/src/modules/notifications/push.service.ts`
**File to create:** `apps/api/src/modules/notifications/push.service.recovery.spec.ts`

**Tests:**
1. Push token expired → remove token from DB, don't crash
2. Push service returns 500 → log error, don't crash
3. Push to user with no registered tokens → skip silently
4. Push payload too large → truncate body, send anyway
5. Batch push to 1000 users where 5 tokens are invalid → send to 995, remove 5 invalid
6. Push service rate limited → queue for retry

**Run:** `npx jest --testPathPattern="push.service.recovery" --no-coverage`

---

### [ ] Task 78: embeddings.service — Gemini failures (4 tests)

**File to read:** `apps/api/src/modules/embeddings/embeddings.service.ts`
**File to create:** `apps/api/src/modules/embeddings/embeddings.service.recovery.spec.ts`

**Tests:**
1. Gemini API returns 500 → log error, return null embedding
2. Gemini API rate limited → queue for retry
3. Content too long for embedding (exceeds token limit) → truncate and embed
4. Gemini API returns malformed response → handle gracefully

**Run:** `npx jest --testPathPattern="embeddings.service.recovery" --no-coverage`

---

### [ ] Task 79: webhooks.service — delivery failures (4 tests)

**File to read:** `apps/api/src/modules/webhooks/webhooks.service.ts`
**File to create:** `apps/api/src/modules/webhooks/webhooks.service.recovery.spec.ts`

**Tests:**
1. Webhook endpoint returns 500 → log failure, schedule retry
2. Webhook endpoint times out → log failure, schedule retry
3. Webhook endpoint returns 200 → mark delivery successful
4. HMAC signature generation with empty payload → should still produce valid signature

**Run:** `npx jest --testPathPattern="webhooks.service.recovery" --no-coverage`

---

### [ ] Task 80: DB connection failures across core services (15 tests)

**File to create:** `apps/api/src/integration/db-recovery.spec.ts`

For EACH of these core services, write 1 test where `prisma.model.findUnique` rejects with `PrismaClientKnownRequestError`:

1. posts.service.getById — DB error → throws (not hangs)
2. threads.service.getById — DB error → throws
3. messages.service.getConversationMessages — DB error → throws
4. reels.service.getById — DB error → throws
5. videos.service.getById — DB error → throws
6. stories.service.getFeedStories — DB error → throws
7. users.service.getProfile — DB error → throws
8. follows.service.follow — DB error → throws
9. channels.service.getByHandle — DB error → throws
10. gamification.service.getLevel — DB error → throws
11. islamic.service.getHifzProgress — DB error → throws
12. bookmarks.service.getBookmarks — DB error → throws
13. events.service.getById — DB error → throws
14. search.service.search (DB fallback) — DB error → throws
15. commerce.service.getProducts — DB error → throws

**The point: verify EVERY service throws a catchable exception when DB fails, rather than hanging indefinitely or leaking raw Prisma errors.**

**Run:** `npx jest --testPathPattern="db-recovery" --no-coverage`

---

### [ ] Task 81-85: Redis failures across caching services (20 tests total)

For services that use Redis (caching, rate limiting, presence):

**Task 81:** `islamic.service` — Redis down: prayer times, daily briefing, Quran cache — 4 tests
**Task 82:** `feed.service` — Redis down: trending cache, session boost — 4 tests
**Task 83:** `gamification.service` — Redis down: leaderboard cache, streak cache — 4 tests
**Task 84:** `search.service` — Redis down: recent searches, trending searches — 4 tests
**Task 85:** `retention.service` — Redis down: engagement metrics cache — 4 tests

**Each test pattern:**
```typescript
it('should handle Redis ECONNREFUSED gracefully', async () => {
  redis.get.mockRejectedValue(new Error('ECONNREFUSED'));
  // Service should fall back to DB query or return default data
  // NOT crash or hang
  const result = await service.methodThatUsesCache(args);
  expect(result).toBeDefined(); // Should return something, even without cache
});
```

**4 tests each × 5 services = 20 tests.**

---

## SECTION 4: CONCURRENCY TESTS (Tasks 86-95, ~100 tests)

These tests verify that the service handles simultaneous requests correctly — no race conditions, no double-counting, no data corruption.

### Concurrency Test Pattern

```typescript
describe('ServiceName — concurrency', () => {
  it('should not double-count when two likes arrive simultaneously', async () => {
    const post = { id: 'post-1', likesCount: 10, userId: 'owner' };
    prisma.post.findUnique.mockResolvedValue(post as any);

    // Simulate two concurrent like requests
    prisma.postReaction.create
      .mockResolvedValueOnce({ id: 'reaction-1' } as any)
      .mockResolvedValueOnce({ id: 'reaction-2' } as any);
    prisma.post.update.mockResolvedValue({ ...post, likesCount: 11 } as any);

    // Fire both simultaneously
    const [result1, result2] = await Promise.allSettled([
      service.like('post-1', 'user-1'),
      service.like('post-1', 'user-2'),
    ]);

    // At least one should succeed
    const successes = [result1, result2].filter(r => r.status === 'fulfilled');
    expect(successes.length).toBeGreaterThanOrEqual(1);

    // Both should NOT increment the same counter twice
    // (this tests the implementation's update call)
    expect(prisma.post.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          likesCount: expect.anything(),
        }),
      })
    );
  });
});
```

---

### [ ] Task 86: posts.service — concurrency (10 tests)

**File to create:** `apps/api/src/modules/posts/posts.service.concurrency.spec.ts`

**Tests:**
1. Two users like the same post simultaneously — both succeed, likesCount incremented correctly
2. Like and unlike the same post simultaneously by same user — consistent final state
3. Two comments added simultaneously — both created, commentsCount correct
4. Create post while another post creation is in-flight — both succeed independently
5. Delete post while someone is liking it — delete takes precedence
6. Update post while someone is commenting — both complete
7. Two saves on same post by different users — both succeed independently
8. getFeed called 100 times concurrently — all return results (no connection pool exhaustion)
9. Double-submit create post (same content, same user, within 1 second) — second should be idempotent or rejected
10. Like → unlike → like in rapid succession — final state is "liked"

---

### [ ] Task 87: stories.service — concurrency (8 tests)

**File to create:** `apps/api/src/modules/stories/stories.service.concurrency.spec.ts`

**Tests:**
1. 50 simultaneous view marks on same story — viewsCount should be 50 (not corrupted)
2. markViewed by same user twice concurrently — should count as 1 view
3. Create story while another story is being created — both succeed
4. Delete story while someone is viewing it — delete takes precedence
5. addToHighlight and delete story simultaneously — consistent state
6. 10 users view same story at same time — all recorded correctly
7. Story expires exactly when someone views it — graceful handling
8. getFeedStories called concurrently by 20 users — all return results

---

### [ ] Task 88: messages.service — concurrency (10 tests)

**File to create:** `apps/api/src/modules/messages/messages.service.concurrency.spec.ts`

**Tests:**
1. Two messages sent to same conversation simultaneously — both delivered, correct order
2. Edit and delete same message simultaneously — one wins, no corrupt state
3. Forward same message to same target twice — deduplication or both created
4. React to message while it's being deleted — graceful handling
5. Two users react with same emoji to same message — both reactions recorded
6. sendMessage while conversation is being deleted — graceful error
7. 100 messages sent in quick succession — all created, correct ordering
8. Read receipt sent while new message arrives — both processed
9. Typing indicator from 10 users simultaneously — all tracked
10. Delete conversation while messages are being sent — clean shutdown

---

### [ ] Task 89: follows.service — concurrency (8 tests)

**File to create:** `apps/api/src/modules/follows/follows.service.concurrency.spec.ts`

**Tests:**
1. User A and User B follow each other simultaneously — both succeed
2. Follow and unfollow same user simultaneously — consistent final state
3. 100 users follow same user simultaneously — followerCount = 100
4. Follow request while target is switching from private to public — correct handling
5. Accept follow request while requester unfollows — consistent state
6. Follow/unfollow rapid toggle (10 times in 1 second) — final state is last action
7. Mutual follow and block simultaneously — block takes precedence
8. Two users send follow requests to same private account — both requests created

---

### [ ] Task 90: gamification.service — concurrency (8 tests)

**File to create:** `apps/api/src/modules/gamification/gamification.service.concurrency.spec.ts`

**Tests:**
1. XP awarded from 3 different actions simultaneously — total XP is sum of all three
2. Streak update at midnight from two time zones — correct day boundary
3. Two challenge joins simultaneously (last spot) — only one succeeds
4. Level up triggered by concurrent XP gains — level calculated correctly
5. Leaderboard update while being read — consistent snapshot
6. Achievement unlock check from concurrent events — unlocked exactly once
7. Daily task completion from two devices — counted once
8. Simultaneous coin purchases — balance updated atomically

---

### [ ] Task 91: gifts.service — concurrency (6 tests)

**File to create:** `apps/api/src/modules/gifts/gifts.service.concurrency.spec.ts`

**Tests:**
1. Send gift with exact remaining balance from two devices — only one succeeds
2. Two users send gifts to same user simultaneously — both processed
3. Purchase coins while sending gift simultaneously — balance consistent
4. Gift sent exactly as receiver deletes account — graceful handling
5. 50 simultaneous gift sends from different users — all processed or rejected correctly
6. Simultaneous coin purchases by same user — total balance correct

---

### [ ] Task 92: reels.service — concurrency (6 tests)

**File to create:** `apps/api/src/modules/reels/reels.service.concurrency.spec.ts`

**Tests:**
1. 100 simultaneous view increments — viewCount = 100
2. Like while reel is being deleted — graceful handling
3. Two comments at exact same time — both created
4. Double-submit create reel — deduplicated or both created
5. Trending calculation while new engagement happens — consistent scores
6. Delete and like from same user simultaneously — delete wins

---

### [ ] Task 93: videos.service — concurrency (6 tests)

**File to create:** `apps/api/src/modules/videos/videos.service.concurrency.spec.ts`

**Tests:**
1. 100 simultaneous view increments — correct count
2. Watch progress update from two devices — latest wins
3. Add chapter while video is being deleted — graceful handling
4. Like while unliking (different users) — both processed
5. Comment and delete video simultaneously — comment rejected or orphaned
6. Trending feed calculation during active engagement — consistent results

---

### [ ] Task 94: threads.service — concurrency (6 tests)

**File to create:** `apps/api/src/modules/threads/threads.service.concurrency.spec.ts`

**Tests:**
1. 50 simultaneous replies to same thread — all created
2. Like and repost same thread simultaneously — both succeed
3. Delete thread while reply is being added — thread deletion wins
4. Quote and delete original thread simultaneously — quote created even if original deleted
5. Bookmark while unbookmarking (same user, two devices) — consistent final state
6. Trending calculation during active engagement — consistent

---

### [ ] Task 95: channels.service — concurrency (4 tests)

**File to create:** `apps/api/src/modules/channels/channels.service.concurrency.spec.ts`

**Tests:**
1. 1000 users subscribe to same channel simultaneously — subscriberCount = 1000
2. Subscribe and unsubscribe simultaneously (same user) — consistent state
3. Post to channel while it's being deleted — graceful handling
4. Update channel settings while subscribers are being counted — consistent

---

## SECTION 5: ABUSE VECTOR TESTS (Tasks 96-110, ~100 tests)

These tests verify that the app can't be exploited by malicious users. Each test simulates a specific attack vector.

---

### [ ] Task 96: Follow spam prevention (8 tests)

**File to create:** `apps/api/src/modules/follows/follows.service.abuse.spec.ts`

**Tests:**
1. Follow 100 users within 1 minute — should be rate-limited after threshold
2. Follow and unfollow same user 50 times — should be detected and rate-limited
3. Follow all users matching a pattern (enumeration) — rate-limited
4. Send 100 follow requests to private accounts — rate-limited
5. Follow → unfollow → follow cycle to spam notifications — no notification on re-follow within cooldown
6. Bulk follow via API (array of userIds, if supported) — limit enforced
7. Follow from 10 accounts (sockpuppets) to same target simultaneously — all succeed but tracked
8. Follow + immediate block (to hide follow spam) — follow notification still sent or not?

---

### [ ] Task 97: Mass-report abuse (6 tests)

**File to create:** `apps/api/src/modules/reports/reports.service.abuse.spec.ts`

**Tests:**
1. Same user reports same content 5 times — only 1 report counted
2. 10 different users report same content within 1 minute — all accepted but flagged as potential coordinated attack
3. User reports 50 different posts in 1 minute — rate-limited
4. Report with extremely long reason (10,000 chars) — truncated or rejected
5. Report own content — rejected (can't report yourself)
6. Report content that's already been reviewed and cleared — accepted but lower priority

---

### [ ] Task 98: Self-gifting and currency abuse (8 tests)

**File to create:** `apps/api/src/modules/gifts/gifts.service.abuse.spec.ts`

**Tests:**
1. Self-gift (senderId === receiverId) — REJECTED (verified in auth matrix, but test explicitly as abuse)
2. Gift to alt account you own (same device fingerprint) — should be flagged (if device tracking exists)
3. Gift amount = 0 — rejected
4. Gift with amount exceeding balance — rejected, balance unchanged
5. Rapid gift sends (100 gifts in 1 minute) — rate-limited
6. Gift to non-existent user — rejected with NotFoundException
7. Purchase 0 coins — rejected
8. Purchase negative coins — rejected

---

### [ ] Task 99: Message flooding (8 tests)

**File to create:** `apps/api/src/modules/messages/messages.service.abuse.spec.ts`

**Tests:**
1. Send 100 messages in 1 minute to same conversation — rate-limited
2. Send 1000 messages across 100 different conversations — rate-limited
3. Send message with 10,000 character content — accepted or truncated, not crash
4. Send message with 1MB content — rejected with BadRequestException
5. Forward same message to maximum conversations (5) — accepted. Forward to 6 — rejected.
6. Send message to conversation you were removed from — rejected
7. Send message to blocked user — rejected
8. Create 100 conversations in 1 minute — rate-limited

---

### [ ] Task 100: Account enumeration protection (6 tests)

**File to create:** `apps/api/src/modules/users/users.service.abuse.spec.ts`

**Tests:**
1. `checkUsername` called 100 times in 1 minute — rate-limited (endpoint has 20/min limit per CLAUDE.md)
2. `searchUsers` with incrementing queries ('a', 'ab', 'abc'...) — rate-limited
3. `getProfile` for 1000 different usernames — rate-limited
4. `findByPhoneNumbers` with large array (10,000 numbers) — rejected or limited
5. `findByPhoneNumbers` with same numbers repeated — deduplicated
6. Error messages for invalid username don't leak whether user exists — consistent error message

---

### [ ] Task 101: Duplicate content detection (6 tests)

**File to create:** `apps/api/src/modules/posts/posts.service.abuse.spec.ts`

**Tests:**
1. Create identical post twice within 1 minute — second rejected as duplicate
2. Create identical post with different casing — detected as duplicate
3. Create identical post with extra whitespace — detected as duplicate
4. Create 50 posts in 1 minute — rate-limited
5. Create post with only hashtags (30+) — accepted but hashtag count capped at 30
6. Create post with 200 @mentions — accepted but mention count capped

---

### [ ] Task 102: Group chat abuse (6 tests)

**File to create:** `apps/api/src/modules/messages/messages.service.group-abuse.spec.ts`

**Tests:**
1. Non-member sends message to group — rejected
2. Removed member tries to rejoin immediately — rejected (if cooldown exists) or allowed
3. Member sends 100 messages in slow-mode group — rate-limited per slow mode setting
4. Non-admin changes group name — rejected
5. Admin removes another admin — test behavior (depends on hierarchy)
6. User joins and leaves group 50 times — rate-limited

---

### [ ] Task 103: Comment/interaction spam (6 tests)

**File to create:** `apps/api/src/modules/posts/posts.service.comment-abuse.spec.ts`

**Tests:**
1. Post 100 comments on same post in 1 minute — rate-limited
2. Post identical comment twice — duplicate detected
3. Comment with 50 @mentions — mentions capped
4. Comment with 30 hashtags — hashtags capped
5. Comment on own post 100 times — rate-limited (same as other users)
6. Comment with only emoji (100 emoji) — accepted but length-capped

---

### [ ] Task 104: Hashtag abuse (6 tests)

**File to create:** `apps/api/src/modules/hashtags/hashtags.service.abuse.spec.ts`

**Tests:**
1. Follow 1000 hashtags in 1 minute — rate-limited
2. Create posts with 100 unique hashtags each — hashtags per post capped
3. Hashtag hijacking (trending hashtag on unrelated content) — no automated prevention but report-able
4. Hashtag with 1000 characters — truncated or rejected
5. Arabic hashtag with diacritics vs without — should match (if normalization exists)
6. Follow/unfollow hashtag 50 times rapidly — rate-limited

---

### [ ] Task 105: Promotion budget abuse (4 tests)

**File to create:** `apps/api/src/modules/promotions/promotions.service.abuse.spec.ts`

**Tests:**
1. Create promotion with budget = 0 — rejected
2. Create promotion with budget = -100 — rejected
3. Create promotion with budget exceeding account balance — rejected
4. Pause and resume promotion 50 times — rate-limited or allowed (not harmful)

---

### [ ] Task 106: Encryption key abuse (4 tests)

**File to create:** `apps/api/src/modules/encryption/encryption.service.abuse.spec.ts`

**Tests:**
1. Register 100 different keys for same user in 1 minute — rate-limited or last wins
2. Request public keys for 10,000 users — rate-limited
3. Store 100 envelopes in 1 minute — rate-limited
4. Malformed public key (not valid key format) — rejected

---

### [ ] Task 107: Webhook abuse (4 tests)

**File to create:** `apps/api/src/modules/webhooks/webhooks.service.abuse.spec.ts`

**Tests:**
1. Create 100 webhooks — limited per user/circle
2. Webhook URL pointing to localhost/internal IP — rejected (SSRF prevention)
3. Webhook URL pointing to non-HTTP protocol — rejected
4. Trigger webhook delivery to URL that always returns 500 — max retries respected, then disabled

---

### [ ] Task 108: Commerce abuse (4 tests)

**File to create:** `apps/api/src/modules/commerce/commerce.service.abuse.spec.ts`

**Tests:**
1. Create 100 products in 1 minute — rate-limited
2. Create product with price = 0.001 (below minimum) — test minimum price enforcement
3. Order quantity = 999999 — rejected or capped
4. Review without purchasing — rejected

---

### [ ] Task 109: Live stream abuse (4 tests)

**File to create:** `apps/api/src/modules/live/live.service.abuse.spec.ts`

**Tests:**
1. Start 10 streams simultaneously — limited to 1 active stream per user
2. Add 10 guests (limit is 4) — 5th rejected
3. Kick all guests and re-add rapidly — rate-limited
4. End and restart stream 20 times in 1 minute — rate-limited

---

### [ ] Task 110: Audio room abuse (4 tests)

**File to create:** `apps/api/src/modules/audio-rooms/audio-rooms.service.abuse.spec.ts`

**Tests:**
1. Create 10 rooms simultaneously — limited per user
2. Join 50 rooms at once — limited (can only be in 1-2 at a time)
3. Mute/unmute rapidly in room — rate-limited
4. Request to speak while banned/muted — rejected

---

## COMPLETION CHECKLIST

**RALPH: DO NOT claim completion until ALL of these conditions are true. Every. Single. One.**

### Section 1: Edge Cases (Tasks 1-30)
- [ ] Task 1: posts.service edge cases — 10 tests
- [ ] Task 2: threads.service edge cases — 10 tests
- [ ] Task 3: messages.service edge cases — 10 tests
- [ ] Task 4: reels.service edge cases — 10 tests
- [ ] Task 5: videos.service edge cases — 10 tests
- [ ] Task 6: stories.service edge cases — 8 tests
- [ ] Task 7: users.service edge cases — 10 tests
- [ ] Task 8: islamic.service edge cases — 15 tests
- [ ] Task 9: channels.service edge cases — 8 tests
- [ ] Task 10: follows.service edge cases — 8 tests
- [ ] Task 11: gamification.service edge cases — 8 tests
- [ ] Task 12: ai.service edge cases — 8 tests
- [ ] Task 13: search.service edge cases — 8 tests
- [ ] Task 14: encryption.service edge cases — 6 tests
- [ ] Task 15: gifts.service edge cases — 6 tests
- [ ] Task 16: commerce.service edge cases — 6 tests
- [ ] Task 17: events.service edge cases — 6 tests
- [ ] Task 18: communities.service edge cases — 6 tests
- [ ] Task 19: live.service edge cases — 6 tests
- [ ] Task 20: bookmarks.service edge cases — 6 tests
- [ ] Task 21: payments.service edge cases — 6 tests
- [ ] Task 22: polls.service edge cases — 6 tests
- [ ] Task 23: hashtags.service edge cases — 6 tests
- [ ] Task 24: moderation.service edge cases — 6 tests
- [ ] Task 25: two-factor.service edge cases — 6 tests
- [ ] Task 26: parental-controls.service edge cases — 6 tests
- [ ] Task 27: broadcast.service edge cases — 6 tests
- [ ] Task 28: discord-features.service edge cases — 6 tests
- [ ] Task 29: telegram-features.service edge cases — 6 tests
- [ ] Task 30: remaining small services edge cases — 15 tests

### Section 2: Authorization Matrix (Tasks 31-70)
- [ ] Task 31: posts.service auth — 15 tests
- [ ] Task 32: threads.service auth — 12 tests
- [ ] Task 33: messages.service auth — 12 tests
- [ ] Task 34: reels.service auth — 10 tests
- [ ] Task 35: videos.service auth — 10 tests
- [ ] Task 36: stories.service auth — 8 tests
- [ ] Task 37: channels.service auth — 10 tests
- [ ] Task 38: users.service auth — 8 tests
- [ ] Task 39: encryption.service auth — 6 tests
- [ ] Task 40: gifts.service auth — 6 tests
- [ ] Task 41: commerce.service auth — 8 tests
- [ ] Task 42: communities.service auth — 8 tests
- [ ] Task 43: live.service auth — 6 tests
- [ ] Task 44: bookmarks.service auth — 6 tests
- [ ] Task 45: events.service auth — 6 tests
- [ ] Task 46: settings.service auth — 4 tests
- [ ] Task 47: privacy.service auth — 4 tests
- [ ] Task 48: devices.service auth — 4 tests
- [ ] Task 49: alt-profile.service auth — 6 tests
- [ ] Task 50: monetization.service auth — 6 tests
- [ ] Task 51: creator.service auth — 6 tests
- [ ] Task 52: playlists.service auth — 6 tests
- [ ] Task 53: majlis-lists.service auth — 6 tests
- [ ] Task 54: reports.service auth — 4 tests
- [ ] Task 55: scheduling.service auth — 4 tests
- [ ] Task 56: circles.service auth — 6 tests
- [ ] Task 57: webhooks.service auth — 4 tests
- [ ] Task 58: audio-rooms.service auth — 6 tests
- [ ] Task 59: scholar-qa.service auth — 4 tests
- [ ] Task 60: parental-controls.service auth — 4 tests
- [ ] Task 61: story-chains.service auth — 4 tests
- [ ] Task 62: promotions.service auth — 4 tests
- [ ] Task 63: downloads.service auth — 4 tests
- [ ] Task 64: collabs.service auth — 4 tests
- [ ] Task 65: mosques.service auth — 4 tests
- [ ] Task 66: admin.service auth — 4 tests
- [ ] Task 67: notifications.service auth — 4 tests
- [ ] Task 68: chat-export.service auth — 4 tests
- [ ] Task 69: clips.service auth — 4 tests
- [ ] Task 70: subtitles.service auth — 4 tests

### Section 3: Error Recovery (Tasks 71-85)
- [ ] Task 71: islamic.service API recovery — 15 tests
- [ ] Task 72: ai.service API recovery — 10 tests
- [ ] Task 73: search.service Meilisearch recovery — 6 tests
- [ ] Task 74: payments.service Stripe recovery — 8 tests
- [ ] Task 75: stream.service Cloudflare recovery — 6 tests
- [ ] Task 76: upload.service R2 recovery — 4 tests
- [ ] Task 77: push.service delivery recovery — 6 tests
- [ ] Task 78: embeddings.service Gemini recovery — 4 tests
- [ ] Task 79: webhooks.service delivery recovery — 4 tests
- [ ] Task 80: DB failures across 15 core services — 15 tests
- [ ] Task 81: islamic.service Redis failure — 4 tests
- [ ] Task 82: feed.service Redis failure — 4 tests
- [ ] Task 83: gamification.service Redis failure — 4 tests
- [ ] Task 84: search.service Redis failure — 4 tests
- [ ] Task 85: retention.service Redis failure — 4 tests

### Section 4: Concurrency (Tasks 86-95)
- [ ] Task 86: posts.service concurrency — 10 tests
- [ ] Task 87: stories.service concurrency — 8 tests
- [ ] Task 88: messages.service concurrency — 10 tests
- [ ] Task 89: follows.service concurrency — 8 tests
- [ ] Task 90: gamification.service concurrency — 8 tests
- [ ] Task 91: gifts.service concurrency — 6 tests
- [ ] Task 92: reels.service concurrency — 6 tests
- [ ] Task 93: videos.service concurrency — 6 tests
- [ ] Task 94: threads.service concurrency — 6 tests
- [ ] Task 95: channels.service concurrency — 4 tests

### Section 5: Abuse Vectors (Tasks 96-110)
- [ ] Task 96: follow spam prevention — 8 tests
- [ ] Task 97: mass-report abuse — 6 tests
- [ ] Task 98: self-gifting/currency abuse — 8 tests
- [ ] Task 99: message flooding — 8 tests
- [ ] Task 100: account enumeration — 6 tests
- [ ] Task 101: duplicate content — 6 tests
- [ ] Task 102: group chat abuse — 6 tests
- [ ] Task 103: comment spam — 6 tests
- [ ] Task 104: hashtag abuse — 6 tests
- [ ] Task 105: promotion budget abuse — 4 tests
- [ ] Task 106: encryption key abuse — 4 tests
- [ ] Task 107: webhook abuse — 4 tests
- [ ] Task 108: commerce abuse — 4 tests
- [ ] Task 109: live stream abuse — 4 tests
- [ ] Task 110: audio room abuse — 4 tests

### Final Verification
- [ ] Full suite passes: `npx jest --no-coverage` → 0 failures
- [ ] Total test count ≥ 3,800: `grep -r "it(" apps/api/src --include="*.spec.ts" | wc -l` → ≥ 3800
- [ ] No new `typeof (service as any)` guards added
- [ ] No new `expect(true).toBe(true)` added
- [ ] No new `expect(stringLiteral.length).toBeGreaterThan(0)` added
- [ ] No new sole `toBeDefined()` assertions (every test has meaningful assertion)
- [ ] Zero `@ts-ignore` or `@ts-expect-error` in new test files
- [ ] Every new spec file has been individually run and passes
- [ ] All commits have descriptive messages (not "add tests")

---

## SESSION MANAGEMENT — HOW TO BREAK THIS INTO CONTEXT WINDOWS

This is ~110 tasks. You will need 4-6 context windows. Here is the exact breakdown:

**Window 1:** Tasks 1-20 (edge cases for 20 largest services) — ~170 tests
**Window 2:** Tasks 21-40 (remaining edge cases + start auth matrix) — ~150 tests
**Window 3:** Tasks 41-60 (auth matrix continued) — ~120 tests
**Window 4:** Tasks 61-80 (remaining auth + error recovery) — ~130 tests
**Window 5:** Tasks 81-100 (remaining recovery + concurrency + start abuse) — ~140 tests
**Window 6:** Tasks 101-110 (remaining abuse vectors + final verification) — ~60 tests + verification

**At end of EVERY window:**
1. Run `npx jest --no-coverage` → 0 failures
2. Count tests: `grep -r "it(" apps/api/src --include="*.spec.ts" | wc -l`
3. Commit all work
4. Output: `WINDOW COMPLETE: Tasks X-Y done. Total tests: XXXX. Suite: 0 failures.`
5. DO NOT say "batch complete" — say "Window N complete, continue with Task Z"

---

## EXPECTED TEST COUNT MATH

| Section | Tasks | Tests Per Task (avg) | Total |
|---------|-------|---------------------|-------|
| Edge Cases (30) | 30 | ~8 | ~240 |
| Auth Matrix (40) | 40 | ~6 | ~240 |
| Error Recovery (15) | 15 | ~7 | ~105 |
| Concurrency (10) | 10 | ~7 | ~72 |
| Abuse Vectors (15) | 15 | ~6 | ~82 |
| **Total new** | **110** | | **~739** |
| **Existing** | | | **~2,780** |
| **Expected final** | | | **~3,519** |

**If ralph writes quality tests with proper depth, the final count should be 3,500-3,800.**

**If ralph cuts corners, the count will hit 3,500 but tests will be shallow. The quality checks above prevent this.**

---

## REMEMBER — THE LAWS OF TEST BATCH 3

1. **Edge cases test BOUNDARIES.** Not normal inputs. The weird stuff. The Arabic. The emoji. The negative numbers. The empty strings. The 1MB payloads.

2. **Auth matrix tests AUTHORIZATION.** User A CANNOT touch User B's stuff. Period. Every write method. Every delete method. Every update method. If the implementation doesn't check ownership, the test should FAIL — that's a bug worth finding.

3. **Error recovery tests RESILIENCE.** When the DB is down, does the service crash or gracefully error? When the API times out, does the request hang forever or timeout? Real production servers lose connections. Test for it.

4. **Concurrency tests ATOMICITY.** When two things happen at the same time, is the result correct? Or does the app double-count, lose data, or corrupt state?

5. **Abuse vector tests SAFETY.** Bad people WILL try to break your app. Follow spam. Mass reports. Self-gifting. Message flooding. Can they? If so, the test should fail — that's a security vulnerability worth finding.

6. **READ THE SERVICE BEFORE WRITING THE TEST.** This rule exists in all 3 batches. Ralph will still try to skip it. DO NOT SKIP IT.

7. **RUN THE TEST BEFORE COMMITTING.** This rule exists in all 3 batches. Ralph will still try to skip it. DO NOT SKIP IT.

8. **Every test must assert something that would FAIL if the implementation changed.** `toBeDefined()` passes no matter what. `toEqual({ id: 'abc', content: 'test' })` only passes for the correct implementation.

---

## BEGIN WITH TASK 1: posts.service — edge cases.

**Read `apps/api/src/modules/posts/posts.service.ts` completely before writing a single test.**

GO.
