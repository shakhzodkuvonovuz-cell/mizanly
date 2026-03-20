# RALPH — Test Expansion Batch 1: Backend Services
## Target: Every public method in every service gets happy path + error path + auth check tests
## Expected output: ~800-1,000 new tests across all 87 services

> **Read `docs/ralph-instructions.md` first.** No shortcuts. No subagents. No shallow tests.
> **Read `CLAUDE.md` second.** Architecture and patterns.

---

## RULES SPECIFIC TO TEST WRITING

1. **READ THE SERVICE BEFORE WRITING TESTS.** Don't guess what a method does from its name. Read the actual implementation. Understand the logic. Then test it.

2. **EVERY TEST MUST ASSERT SOMETHING MEANINGFUL.** These are banned:
   - `expect(service).toBeDefined()` as the ONLY test for a service — you can have it as ONE test, but not the only one
   - `expect(result).toBeTruthy()` — assert the actual value
   - `expect(mockPrisma.user.findUnique).toHaveBeenCalled()` as the ONLY assertion — also verify the return value
   - Tests that pass no matter what the implementation does

3. **THREE TYPES OF TESTS PER METHOD:**
   - **Happy path:** Valid input → expected output. Verify the correct data is returned, correct DB calls are made, correct side effects happen.
   - **Error path:** Invalid input, missing resource, DB failure → expected error. Verify the correct exception type is thrown (NotFoundException, ForbiddenException, BadRequestException).
   - **Auth/ownership check:** Verify that User A cannot access/modify User B's resources. If the service method checks `userId === requestingUserId`, test that it throws ForbiddenException when they don't match.

4. **MOCK PROPERLY.** When mocking Prisma:
   - `findUnique` should return a realistic object (not `{}` or `true`) with all fields the service uses
   - `findMany` should return an array of 2-3 realistic objects
   - `create` should return the created object with an `id`
   - `update` should return the updated object
   - `delete` should return the deleted object
   - Return `null` from `findUnique` to test not-found paths

5. **USE `as any` FOR MOCKS ONLY IN SPEC FILES.** This is the one exception to the "no any" rule per CLAUDE.md.

6. **GROUP TESTS BY METHOD.** Use `describe('methodName', () => { ... })` blocks to organize.

7. **NAME TESTS DESCRIPTIVELY.** Not `it('should work')`. Use `it('should return NotFoundException when post does not exist')`.

8. **COMMIT PER MODULE.** Each module's tests = one commit.

9. **RUN TESTS AFTER EACH MODULE.** `npx jest --testPathPattern="module-name" --no-coverage` to verify before committing.

10. **DON'T BREAK EXISTING TESTS.** If a module already has a spec file, ADD tests to it. Don't rewrite it from scratch.

---

## HOW TO STRUCTURE EACH TEST

Here is the exact pattern for every test. Follow this structure:

```typescript
describe('ServiceName', () => {
  let service: ServiceName;
  let prisma: DeepMockProxy<PrismaService>;  // or however the project mocks it
  let redis: jest.Mocked<Redis>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ServiceName,
        ...globalMockProviders,  // use the project's existing mock pattern
        // any additional mocks needed
      ],
    }).compile();

    service = module.get(ServiceName);
    prisma = module.get(PrismaService);
  });

  describe('methodName', () => {
    const userId = 'user-123';
    const otherUserId = 'user-456';

    // Test data — realistic, not minimal
    const mockPost = {
      id: 'post-abc',
      userId,
      content: 'Test post content',
      postType: 'TEXT',
      mediaUrls: [],
      mediaTypes: [],
      likesCount: 5,
      commentsCount: 2,
      sharesCount: 1,
      savesCount: 0,
      isRemoved: false,
      isFeatured: false,
      visibility: 'PUBLIC',
      createdAt: new Date('2026-03-15'),
      updatedAt: new Date('2026-03-15'),
    };

    it('should return the post when it exists and user has access', async () => {
      prisma.post.findUnique.mockResolvedValue(mockPost as any);
      const result = await service.getById('post-abc', userId);
      expect(result).toEqual(expect.objectContaining({
        id: 'post-abc',
        content: 'Test post content',
      }));
      expect(prisma.post.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post-abc' },
        })
      );
    });

    it('should throw NotFoundException when post does not exist', async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      await expect(service.getById('nonexistent', userId))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user does not own the post and tries to edit', async () => {
      prisma.post.findUnique.mockResolvedValue(mockPost as any);
      await expect(service.update('post-abc', otherUserId, { content: 'hacked' }))
        .rejects.toThrow(ForbiddenException);
    });
  });
});
```

---

## EXECUTION ORDER

Work through services by SIZE (largest first — they need the most tests). For each service:

1. **Read the existing spec file** (if it exists) — understand what's already tested
2. **Read the service file** — list every public `async` method
3. **For each untested method** — write happy path, error path, and auth check tests
4. **For each under-tested method** (has happy path but no error/auth tests) — add the missing tests
5. **Run the tests** — `npx jest --testPathPattern="module-name" --no-coverage`
6. **Commit** — `"test(module-name): add X tests for Y methods — happy, error, auth paths"`

---

## MODULE-BY-MODULE INSTRUCTIONS

Below is every module, its service size, current test count, and exactly what tests to write. **Do not skip any module.**

---

### Module 1: islamic (1,798 lines, 48 methods, 31 existing tests)

**The biggest and most important service.** Read `islamic.service.ts` COMPLETELY.

**Methods to test (for each, write happy + error + edge case):**

1. `getPrayerTimes(lat, lng, date, method)`
   - Happy: valid coordinates → returns 6 prayer times with correct format (HH:MM)
   - Happy: different methods (2 vs 4) → returns different Fajr/Isha times
   - Error: invalid lat (999) → appropriate response
   - Edge: coordinates near North Pole (lat=65) where prayer times may not exist in summer
   - Edge: no Redis cache → still works (API or fallback calculation)

2. `getQuranChapter(surahNumber)`
   - Happy: surah 1 → returns Al-Fatiha metadata (7 ayahs, Meccan)
   - Happy: surah 114 → returns An-Nas
   - Error: surah 0 → BadRequestException
   - Error: surah 115 → NotFoundException
   - Edge: surah number as string → handled or rejected

3. `getQuranVerses(surahNumber, translation)`
   - Happy: surah 1 → returns 7 verses with Arabic text
   - Happy: with translation='en' → includes English translation
   - Error: surah 0 → error
   - Edge: large surah (2, with 286 verses) → pagination or full return

4. `searchQuran(query, language, limit)`
   - Happy: query='patience' → returns matching verses
   - Happy: query in Arabic → works
   - Error: empty query → BadRequestException
   - Edge: query with special characters

5. `getNearbyMosques(lat, lng, radius)`
   - Happy: coordinates with mosques in DB → returns sorted by distance
   - Happy: coordinates with no mosques in DB → falls back to OSM API
   - Edge: very large radius → reasonable limit applied
   - Edge: 0,0 coordinates → doesn't crash

6. `getDailyBriefing(userId, lat, lng)`
   - Happy: returns prayer times + hadith + ayah + dua + dhikr challenge + hijri date
   - Edge: user with no daily task completions → returns 0/3

7. `completeDailyTask(userId, taskType)`
   - Happy: complete 'dhikr' → marks complete, returns updated status
   - Happy: complete all 3 → awards bonus XP
   - Error: complete same task twice on same day → appropriate response
   - Error: invalid taskType → BadRequestException

8. `calculateZakat(assets)`
   - Happy: cash above nisab → returns zakat amount (2.5%)
   - Happy: mixed assets (cash + gold + silver) → correct total
   - Edge: all zeros → zakat = 0
   - Edge: below nisab → zakat = 0
   - Error: negative amounts → BadRequestException

9. `getHifzProgress(userId)`
   - Happy: user with some progress → returns 114 surahs with statuses
   - Edge: new user with no progress → returns all 'not_started'

10. `updateHifzProgress(userId, surahNum, status)`
    - Happy: mark surah 1 as 'memorized' → updated
    - Error: invalid surah number → error
    - Error: invalid status → error

11. `getFastingLog(userId, month)`
    - Happy: month with data → returns days with fasting status
    - Edge: month with no data → empty array

12. `logFast(userId, date, isFasting, type, reason)`
    - Happy: log fasting day → created
    - Error: duplicate entry for same date → handle upsert or error
    - Edge: log future date → allowed or rejected?

13. `getDuas(category)`
    - Happy: category='morning' → returns morning duas
    - Happy: no category → returns all duas
    - Edge: invalid category → empty array or error

14. `bookmarkDua(userId, duaId)`
    - Happy: bookmark → created
    - Error: already bookmarked → idempotent or error

15. `getNamesOfAllah()`
    - Happy: returns 99 names with Arabic + meaning + explanation

16. `getDailyName()`
    - Happy: returns one name (deterministic per date)
    - Edge: same date → same name every time

**Target for this module: 60-80 new tests.**

---

### Module 2: posts (1,175 lines, ~30 methods, 41 existing tests)

**Read `posts.service.ts` completely. Read existing `posts.service.spec.ts` first to understand what's covered.**

**Methods to add tests for:**

1. `create(userId, dto)`
   - Happy: text post → returns created post with id
   - Happy: post with media → mediaUrls populated
   - Happy: post with hashtags in content → hashtags extracted and linked
   - Auth: verify the post's userId matches the requesting user
   - Side effect: verify gamification XP is awarded
   - Side effect: verify BullMQ job is enqueued for notifications

2. `update(postId, userId, dto)`
   - Happy: update content → returns updated post
   - Auth: User B tries to update User A's post → ForbiddenException
   - Error: post doesn't exist → NotFoundException
   - Edge: update with empty content → BadRequestException or allowed?

3. `delete(postId, userId)`
   - Happy: soft delete → isRemoved set to true
   - Auth: User B tries to delete User A's post → ForbiddenException
   - Error: post doesn't exist → NotFoundException
   - Side effect: counts (user's postCount) decremented

4. `getById(postId, userId)`
   - Happy: returns post with user info
   - Error: post doesn't exist → NotFoundException
   - Edge: post is isRemoved → NotFoundException (or should it return?)
   - Edge: viewer is blocked by post author → what happens?

5. `getFeed(userId, type, cursor, limit)`
   - Happy: type='following' with follows → returns followed users' posts
   - Happy: type='foryou' → returns scored posts
   - Edge: user with 0 follows → returns trending
   - Edge: cursor pagination → second page returns different posts
   - Edge: limit respected (never returns more than limit)

6. `like(postId, userId)` / `unlike(postId, userId)`
   - Happy: like → likesCount incremented, reaction created
   - Happy: unlike → likesCount decremented, reaction deleted
   - Error: like already-liked post → idempotent or error
   - Error: unlike not-liked post → no crash

7. `save(postId, userId)` / `unsave(postId, userId)`
   - Same pattern as like/unlike

8. `getComments(postId, cursor, limit)`
   - Happy: returns comments sorted by createdAt
   - Edge: post with 0 comments → empty array
   - Edge: cursor pagination works

9. `addComment(postId, userId, dto)`
   - Happy: creates comment, increments commentsCount
   - Error: post doesn't exist → NotFoundException
   - Auth: can any user comment? Or only if not blocked?

10. `getTrendingFeed(cursor, limit)`
    - Happy: returns posts scored by engagement rate
    - Edge: no posts in last 7 days → empty
    - Edge: limit respected

**Target for this module: 30-40 new tests.**

---

### Module 3: messages (873 lines, ~25 methods, 51 existing tests)

**Already has 51 tests — the most tested service. Read what's covered first. Add what's missing.**

**Methods to verify test coverage for:**

1. `sendMessage(conversationId, senderId, dto)`
   - Auth: sender must be member of conversation
   - Edge: very long content (10,000 chars) → truncated or rejected?
   - Edge: voice message → triggers transcription job?

2. `forwardMessage(messageId, userId, targetConversationIds)`
   - Happy: forward to 3 conversations → 3 copies created
   - Error: forward to 6 → BadRequestException (max 5)
   - Auth: user must be member of source AND all target conversations
   - Side effect: forwardCount incremented on original

3. `editMessage(messageId, userId, content)`
   - Happy: edit within time limit → updated
   - Auth: only sender can edit
   - Error: edit after time limit → ForbiddenException
   - Edge: edit to empty content → BadRequestException?

4. `deleteMessage(messageId, userId)`
   - Happy: soft delete → isDeleted true
   - Auth: only sender can delete (or conversation admin)
   - Error: message doesn't exist → NotFoundException

5. `reactToMessage(messageId, userId, emoji)`
   - Happy: add reaction → created
   - Edge: same user reacts twice → updates or error
   - Edge: remove reaction

6. `getConversationMessages(conversationId, userId, cursor, limit)`
   - Auth: user must be member
   - Edge: conversation with 0 messages → empty array
   - Edge: cursor pagination

**Target: 15-25 new tests.**

---

### Module 4: reels (937 lines, ~20 methods, 19 existing tests)

**Read `reels.service.ts`. Only 19 tests for 937 lines — needs significant expansion.**

**Methods to test:**

1. `create(userId, dto)` — happy, auth, side effects (XP, notification job)
2. `getById(reelId, userId)` — happy, not found, isRemoved
3. `delete(reelId, userId)` — happy, auth (only owner), not found
4. `getFeed(userId, cursor, limit)` — happy, zero follows fallback, pagination
5. `getTrendingReels(cursor, limit)` — happy, engagement scoring, empty
6. `like(reelId, userId)` / `unlike` — happy, idempotent, counts
7. `addComment(reelId, userId, dto)` — happy, not found
8. `getComments(reelId, cursor, limit)` — happy, empty, pagination
9. `getDuetSource(reelId)` — happy, not found
10. `incrementView(reelId, userId)` — happy, view tracking

**Target: 25-35 new tests.**

---

### Module 5: threads (885 lines, ~20 methods, 10 existing tests)

**Only 10 tests! Severely under-tested. Read `threads.service.ts` completely.**

**Methods to test (EVERY ONE — almost nothing is tested):**

1. `create(userId, dto)` — happy, with poll, with media, XP award
2. `getById(threadId, userId)` — happy, not found, isRemoved
3. `delete(threadId, userId)` — happy, auth, not found
4. `getFeed(userId, type, cursor, limit)` — happy for each type (foryou/following/trending), zero follows
5. `getTrendingThreads(cursor, limit)` — happy, reply-depth scoring
6. `like(threadId, userId)` / `unlike` — happy, counts
7. `repost(threadId, userId)` — happy, auth
8. `quote(threadId, userId, content)` — happy, creates new thread
9. `addReply(threadId, userId, dto)` — happy, nested replies, not found
10. `bookmark(threadId, userId)` / `unbookmark` — happy, idempotent

**Target: 35-45 new tests.**

---

### Module 6: videos (898 lines, ~20 methods, 39 existing tests)

**39 tests exists. Add error/auth paths.**

Similar pattern to reels. Test: create, getById, delete, getFeed, like, comment, addChapter, getChapters, incrementView, getWatchProgress, updateWatchProgress.

**Target: 20-30 new tests.**

---

### Module 7: users (863 lines, ~25 methods, 23 existing tests)

**Methods to test:**

1. `getProfile(username, currentUserId)` — happy, not found, blocked user, private account
2. `updateProfile(userId, dto)` — happy, invalid data
3. `deleteAccount(userId)` — happy, grace period, data anonymization
4. `exportData(userId)` — happy, returns all data types
5. `getSuggestedUsers(userId, limit)` — happy, no suggestions
6. `searchUsers(query, currentUserId)` — happy, empty results, blocked users excluded
7. `getFollowers(userId, cursor, limit)` — happy, pagination, private account
8. `getFollowing(userId, cursor, limit)` — same
9. `checkUsername(username)` — happy (available), taken, invalid chars
10. `findByPhoneNumbers(userId, numbers)` — happy, no matches

**Target: 25-35 new tests.**

---

### Module 8: channels (504 lines, ~14 methods, 23 existing tests)

Test: create, update, delete, subscribe, unsubscribe, getSubscribers, getByHandle, getFeed, getAnalytics. Focus on auth checks (only owner can edit/delete).

**Target: 15-20 new tests.**

---

### Module 9: stories (462 lines, ~12 methods, 10 existing tests)

**Only 10 tests for 462 lines.**

Test: create, getById, delete, getFeedStories, markViewed, getViewers, getHighlights, addToHighlight, removeFromHighlight. Focus on: close friends only visibility, subscriber only visibility, 24h expiration logic.

**Target: 20-30 new tests.**

---

### Module 10: follows (420 lines, ~10 methods, 14 existing tests)

Test: follow, unfollow, getFollowers, getFollowing, getMutualFollowers, sendFollowRequest, acceptRequest, rejectRequest, getFollowRequests. Focus on: private account flow, already following idempotency, self-follow rejection.

**Target: 15-20 new tests.**

---

### Module 11: feed (403+504 lines across feed.service + personalized-feed.service, 27 existing tests)

Test: getFeed, getTrendingFeed, getFeaturedFeed, trackInteraction, getPersonalizedFeed, calculateScore, getSessionBoost, explainRecommendation. Focus on: zero-follow fallback, blended feed ratios, diversity injection, scoring formula correctness.

**Target: 20-30 new tests.**

---

### Module 12: gamification (584 lines, 24 methods, 14 existing tests)

Test: awardXP, getLevel, getStreak, updateStreak, breakStreak, getAchievements, unlockAchievement, getChallenges, joinChallenge, completeChallenge, getLeaderboard, getXPHistory, getContinueWatching, updateSeriesProgress. Focus on: XP calculation correctness, streak edge cases (day boundary), achievement unlock conditions.

**Target: 25-35 new tests.**

---

### Module 13: ai (603 lines, 16 methods, 15 existing tests)

Test: moderateContent, moderateImage, suggestCaptions, suggestHashtags, generateSmartReplies, translateText, summarizeContent, routeToSpace, transcribeVoiceMessage, generateAvatar. Focus on: API unavailable fallback, rate limiting, content moderation classifications (SAFE/WARNING/BLOCK).

**Target: 15-20 new tests.**

---

### Module 14: search (583 lines, ~10 methods, 19 existing tests)

Test: search (users, posts, hashtags, channels), getAutocompleteSuggestions, getRecentSearches, saveRecentSearch, clearRecentSearches, getTrendingSearches. Focus on: Meilisearch available vs fallback to Prisma, empty results, special characters in query, Arabic text search.

**Target: 10-15 new tests.**

---

### Module 15: encryption (309 lines, 10 methods, 12 existing tests)

Test: registerKey, getPublicKey, getBulkKeys, storeEnvelope, getEnvelope, rotateKey, computeSafetyNumber, notifyKeyChange. Focus on: key re-registration (change detection), concurrent rotation conflict, envelope versioning.

**Target: 10-15 new tests.**

---

### Module 16: payments (419 lines, ~12 methods, 13 existing tests)

Test: createPaymentIntent, getOrCreateCustomer, processWebhook, createSubscription, cancelSubscription, getPaymentHistory, refund. Focus on: Stripe API errors, webhook signature verification, duplicate payment prevention.

**Target: 10-15 new tests.**

---

### Module 17: moderation (396 lines, ~10 methods, 13 existing tests)

Test: checkText, checkImage (now Claude Vision), flagContent, queueForReview, getReviewQueue, resolveReport, appealDecision, autoAction. Focus on: SAFE/WARNING/BLOCK classification, appeal flow, auto-remove for BLOCK.

**Target: 10-15 new tests.**

---

### Module 18: live (336 lines, ~12 methods, 12 existing tests)

Test: createSession, startRehearsal, goLive, endStream, addGuest, removeGuest, setSubscribersOnly, toggleSubscribersOnly, getActiveStreams, getViewerCount. Focus on: rehearsal→live transition, max guests limit, subscribers-only paywall.

**Target: 10-15 new tests.**

---

### Module 19: calls (256 lines, ~11 methods, 10 existing tests)

Test: initiate, answer, reject, end, getICEServers, getHistory, getActiveCall. Focus on: can't call yourself, can't call someone already in a call, concurrent call prevention.

**Target: 8-12 new tests.**

---

### Modules 20-45: Remaining 45 smaller services (each <250 lines)

For EACH of these, add at minimum:
- 3 happy path tests (one per major method)
- 2 error path tests (not found, unauthorized)
- 1 edge case test

**Services (group by size, process largest first):**

```
audio-rooms (510, 34 tests) — add 10 more: room lifecycle, max participants, host transfer
communities (418, 16 tests) — add 8: create, join, leave, post, admin actions
events (413, 27 tests) — add 5: RSVP limits, past events, recurring
bookmarks (404, 18 tests) — add 6: folder management, cross-content types
majlis-lists (404, 30 tests) — add 5: list ordering, member limits
playlists (481, 24 tests) — add 8: reorder, collaborative, max items
hashtags (419, 11 tests) — add 8: trending calculation, follow/unfollow
payments (419, 13 tests) — covered above
moderation (396, 13 tests) — covered above
creator (392, 9 tests) — add 10: analytics calculation, earnings, storefront
stickers (366, 12 tests) — add 8: AI generation, rate limit, Islamic presets
telegram-features (359, 10 tests) — add 8: saved messages, chat folders, slow mode
monetization (359, 39 tests) — add 5: membership tiers, revenue split
commerce (341, 11 tests) — add 10: product CRUD, order lifecycle, review
broadcast (259, 7 tests) — add 8: create, manage, subscriber limits
community (311, 11 tests) — add 8: local boards, mentorship, fatwa
polls (254, 12 tests) — add 5: vote, close, results
reports (245, 20 tests) — add 5: create, review, appeal
retention (241, 13 tests) — add 5: milestones, streak warnings
gifts (275, 14 tests) — add 5: send, receive, coin deduction
alt-profile (223, 6 tests) — add 8: create, access control, post visibility
chat-export (223, 6 tests) — add 3: export format, large conversations
scheduling (209, 13 tests) — add 3: schedule, cancel, publish
story-chains (193, 9 tests) — add 5: create chain, add entry, collaborate
promotions (201, 16 tests) — add 3: budget tracking, auto-pause
settings (200, 11 tests) — add 3: update, defaults
discord-features (186, 17 tests) — add 3: forums, webhooks, stage
halal (183, 4 tests) — add 8: nearby query, reviews, community verify
watch-history (179, 11 tests) — add 3: track, clear, resume
stream (178, 8 tests) — add 3: upload, transcode, thumbnail
video-replies (175, 12 tests) — add 3: create, list, delete
admin (171, 18 tests) — add 3: dashboard stats, user management
downloads (163, 11 tests) — add 3: queue, status, cleanup
thumbnails (151, 8 tests) — add 5: create variants, serve random, declare winner
mosques (151, 5 tests) — add 8: create, join, feed, nearby
upload (142, 10 tests) — add 3: presign, validate type, size limit
circles (139, 16 tests) — add 3: invite, remove, limit
subtitles (134, 19 tests) — add 2: generate, edit
devices (131, 6 tests) — add 5: register, logout, session tracking
scholar-qa (120, 6 tests) — add 8: schedule, questions, vote, answer, record
reel-templates (116, 10 tests) — add 3: browse, use, create
collabs (110, 11 tests) — add 3: invite, accept, decline
webhooks (109, 5 tests) — add 5: create, deliver, HMAC verify, retry
privacy (102, 5 tests) — add 3: toggle settings, defaults
restricts (100, 9 tests) — add 3: restrict, unrestrict, effects
clips (99, 12 tests) — add 2: create clip, from timestamp
profile-links (83, 12 tests) — add 2: add, reorder
mutes (83, 7 tests) — add 2: mute, unmute
channel-posts (82, 9 tests) — add 2: create, delete
audio-tracks (75, 12 tests) — add 2: upload, browse
community-notes (74, 6 tests) — add 5: create note, rate, threshold display
drafts (71, 6 tests) — add 3: save, load, delete
checklists (71, 5 tests) — add 5: create, check item, sync, complete notification
two-factor (295, 15 tests) — add 5: setup, verify, disable, backup codes
parental-controls (321, 10 tests) — add 5: PIN, content restrictions, time limits
```

**Total target for modules 20-45: ~250-350 new tests.**

---

## RUNNING TOTAL TARGET

| Group | Modules | Existing Tests | New Tests Target |
|-------|---------|---------------|-----------------|
| Module 1 (islamic) | 1 | 31 | 60-80 |
| Module 2 (posts) | 1 | 41 | 30-40 |
| Module 3 (messages) | 1 | 51 | 15-25 |
| Module 4 (reels) | 1 | 19 | 25-35 |
| Module 5 (threads) | 1 | 10 | 35-45 |
| Module 6 (videos) | 1 | 39 | 20-30 |
| Module 7 (users) | 1 | 23 | 25-35 |
| Modules 8-19 | 12 | ~170 | 120-175 |
| Modules 20-45 | 45 | ~530 | 250-350 |
| **TOTAL** | **64** | **~914** | **~580-815** |

**Expected final count: 1,493 + 580-815 = ~2,073-2,308 tests**

This is session 1 of 3. Sessions 2-3 will cover:
- Session 2: Remaining services + gateway tests + edge cases
- Session 3: Integration tests + controller tests + remaining gaps to reach 3,500+

---

## SESSION MANAGEMENT

This is too many modules for one context window. Expected: 2-3 context windows.

**Window 1:** Modules 1-7 (the 7 largest services)
**Window 2:** Modules 8-19 (medium services)
**Window 3:** Modules 20-45 (smaller services, batch together)

**At end of each window:**
1. Run full test suite → 0 failures
2. Commit all test files
3. Note which module you stopped at
4. User starts new session: "Continue test batch from Module X"

---

## REMEMBER

- **Read the service method before writing the test.**
- **Every test must assert something meaningful.**
- **Happy path + error path + auth check for every method.**
- **Don't break existing tests.**
- **Commit per module. Run tests per module.**
- **No `expect(service).toBeDefined()` as the only test.**

**BEGIN WITH MODULE 1: ISLAMIC SERVICE.**
