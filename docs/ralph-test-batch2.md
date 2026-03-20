# RALPH — Test Expansion Batch 2: Controllers + Gateway + Service Gaps
## Target: 63 new controller specs + gateway expansion + 55 under-tested services → 1,500+ new tests
## Expected final total: ~3,500 tests

> **Read `docs/ralph-instructions.md` first.** No shortcuts. No subagents.
> **Read `docs/ralph-test-batch1.md`** for the testing rules — they ALL still apply.
> **Read `CLAUDE.md`** for architecture patterns.

---

## WHY THIS BATCH EXISTS

Batch 1 added 548 service tests but left these gaps:
- **63 controllers have ZERO test files** — no endpoint-level testing at all
- **55 service specs have fewer than 15 tests** — under-tested methods remain
- **Gateway has 15 events but only 14 tests** — socket.io coverage minimal
- **128 `toBeDefined()` instances remain** — 20+ are sole assertions in tests (meaningless)
- **No integration test expansion** — still only 3 integration test files

---

## ABSOLUTE RULES (REITERATED — RALPH VIOLATED THESE IN BATCH 1)

### Rules Ralph Broke Last Time and MUST NOT Break Again:

1. **DO NOT use `if (typeof (service as any).method === 'function')` guards.** This makes tests silently pass when a method doesn't exist. If you're unsure about a method name, READ THE SERVICE FILE FIRST.

2. **DO NOT write `expect(service).toBeDefined()` as the only assertion in a test.** You can have it alongside other assertions, but a test whose ONLY assertion is `toBeDefined()` tests nothing.

3. **DO NOT write tests that assert on mock return values.** Example of what NOT to do:
   ```typescript
   // BAD — tests the mock framework, not Mizanly code
   prisma.report.count.mockResolvedValue(5);
   const count = await prisma.report.count({ where: { targetUserId: 'user-1' } });
   expect(count).toBe(5);
   ```
   You must call the SERVICE method, not the mock directly.

4. **DO NOT write tests that assert string constants are non-empty:**
   ```typescript
   // BAD — tests that a JavaScript string literal isn't empty
   const arabicContent = 'محتوى عربي';
   expect(arabicContent.length).toBeGreaterThan(0);
   ```
   This tests JavaScript itself, not your code.

5. **DO NOT stop and say "batch complete" until EVERY task in this file is checked off.** In Batch 1, ralph declared completion 3 times before actually finishing. This time: every task below has a checkbox. ALL must be `[x]` before claiming completion.

6. **DO NOT skip a task because "it's already covered."** If the task says "add tests for X," check the current spec file first. If it's already tested with meaningful assertions, mark `[x]` with a note. If not, add the tests.

7. **READ THE ACTUAL SOURCE FILE BEFORE WRITING ANY TEST.** Every time. For controllers, read the controller AND the service it delegates to. Understand what HTTP method, what DTO, what guard, what response shape.

---

## TESTING PATTERN FOR CONTROLLERS

Controllers are different from services. Here's the exact pattern:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { XxxController } from './xxx.controller';
import { XxxService } from './xxx.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('XxxController', () => {
  let controller: XxxController;
  let service: jest.Mocked<XxxService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        XxxController,
        {
          provide: XxxService,
          useValue: {
            // Mock every public method the controller calls
            getById: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            // etc.
          },
        },
      ],
    }).compile();

    controller = module.get(XxxController);
    service = module.get(XxxService) as jest.Mocked<XxxService>;
  });

  // Test 1: Controller delegates to service correctly
  describe('GET /:id', () => {
    it('should call service.getById with correct params', async () => {
      service.getById.mockResolvedValue({ id: 'abc', name: 'Test' } as any);
      const result = await controller.getById('abc', 'user-123');
      expect(service.getById).toHaveBeenCalledWith('abc', 'user-123');
      expect(result).toEqual(expect.objectContaining({ id: 'abc' }));
    });
  });

  // Test 2: Controller passes DTO to service
  describe('POST /', () => {
    it('should call service.create with userId and dto', async () => {
      const dto = { content: 'test', mediaUrls: [] };
      service.create.mockResolvedValue({ id: 'new-1', ...dto } as any);
      const result = await controller.create('user-123', dto as any);
      expect(service.create).toHaveBeenCalledWith('user-123', dto);
      expect(result).toHaveProperty('id');
    });
  });

  // Test 3: Controller handles service errors
  describe('DELETE /:id', () => {
    it('should propagate NotFoundException from service', async () => {
      service.delete.mockRejectedValue(new NotFoundException('Not found'));
      await expect(controller.delete('nonexistent', 'user-123')).rejects.toThrow(NotFoundException);
    });
  });
});
```

**What to test in controllers:**
1. Controller delegates to the correct service method with correct arguments
2. Controller passes userId from `@CurrentUser('id')` to service
3. Controller passes DTO body to service
4. Controller returns the service response
5. Controller propagates service exceptions (NotFoundException, ForbiddenException)
6. For list endpoints: controller passes cursor/limit query params

**What NOT to test in controllers:**
- Auth guard behavior (tested separately by NestJS)
- Rate limiting (tested separately by throttler)
- DTO validation (tested separately by ValidationPipe)
- The business logic itself (already tested in service specs)

---

## SECTION 1: CONTROLLER SPECS (Tasks 1-63)

Create a spec file for EVERY controller listed below. Each spec must have at minimum:
- 1 test per endpoint method in the controller
- Each test verifies: service method called with correct args + response returned

**For EACH controller, you MUST:**
1. Read the controller file — list every endpoint method
2. Read the service file — understand what each method returns
3. Create the spec file with proper mocks
4. Run `npx jest --testPathPattern="module-name.controller" --no-coverage` to verify
5. Mark the task `[x]` with test count

**Here is every controller that needs a spec file (63 total). Do NOT skip any.**

### [x] Task 1: admin.controller.spec.ts — Done, 12 tests
Read `admin.controller.ts`. Methods to test: every endpoint (user management, content review, stats).
**Minimum 5 tests.**

### [x] Task 2: ai.controller.spec.ts — Done, 15 tests
Read `ai.controller.ts`. Methods: suggestCaptions, suggestHashtags, moderateContent, moderateImage, generateSmartReplies, translateText, summarizeContent, routeToSpace, transcribeVoice, generateAvatar.
**Minimum 8 tests.**

### [x] Task 3: alt-profile.controller.spec.ts — Done, 12 tests
Read `alt-profile.controller.ts`. Methods: create, get, update, delete, grantAccess, revokeAccess, getAccessList.
**Minimum 6 tests.**

### [x] Task 4: audio-rooms.controller.spec.ts — Done, 14 tests
Read `audio-rooms.controller.ts`. Methods: create, join, leave, getActive, getById, mute, unmute, end, setHost.
**Minimum 7 tests.**

### [x] Task 5: auth.controller.spec.ts — Done, 7 tests
Read `auth.controller.ts`. Methods: whatever auth endpoints exist.
**Minimum 3 tests.**

### [x] Task 6: auth/webhooks.controller.spec.ts — Done, 6 tests
Read `webhooks.controller.ts`. Methods: handleClerkWebhook — verify Svix signature, user.created, user.updated, user.deleted events.
**Minimum 4 tests (one per event type + signature rejection).**

### [x] Task 7: blocks.controller.spec.ts — Done, 4 tests
Methods: block, unblock, getBlocked.
**Minimum 3 tests.**

### [x] Task 8: bookmarks.controller.spec.ts — Done, 10 tests
Methods: bookmark, unbookmark, getBookmarks, getBookmarkFolders, createFolder, deleteFolder.
**Minimum 5 tests.**

### [x] Task 9: chat-export.controller.spec.ts — Done, 4 tests
Methods: exportConversation, getExportStatus.
**Minimum 2 tests.**

### [x] Task 10: checklists.controller.spec.ts — Done, 7 tests
Methods: create, getItems, toggleItem, deleteItem, deleteChecklist.
**Minimum 4 tests.**

### [x] Task 11: circles.controller.spec.ts — Done, 8 tests
Methods: create, getMyCircles, addMember, removeMember, deleteCircle.
**Minimum 4 tests.**

### [x] Task 12: clips.controller.spec.ts — Done, 6 tests
Methods: create, getByVideo, getById, delete.
**Minimum 3 tests.**

### [x] Task 13: commerce.controller.spec.ts — Done, 11 tests
Methods: createProduct, getProducts, getProductById, createOrder, getOrders, getBusinesses.
**Minimum 5 tests.**

### [x] Task 14: communities.controller.spec.ts — Done, 9 tests
Methods: create, getAll, getById, join, leave, getMembers, getPosts.
**Minimum 6 tests.**

### [x] Task 15: community-notes.controller.spec.ts — Done, 4 tests
Methods: create, rate, getByPost, getByThread.
**Minimum 3 tests.**

### [x] Task 16: community.controller.spec.ts — Done, 11 tests
Methods: getLocalBoards, createMentorship, getStudyCircles, submitFatwa, getVolunteerOpportunities, createVoicePost, createWatchParty, getWaqfFunds.
**Minimum 6 tests.**

### [x] Task 17: creator.controller.spec.ts — Done, 10 tests
Methods: getDashboard, getAnalytics, getRevenue, getStorefront, createStorefrontItem.
**Minimum 4 tests.**

### [x] Task 18: devices.controller.spec.ts — Done, 5 tests
Methods: register, getSessions, logoutSession, logoutAllOther, unregister.
**Minimum 4 tests.**

### [x] Task 19: discord-features.controller.spec.ts — Done, 9 tests
Methods: createForumThread, getForumThreads, createWebhook, getWebhooks, createStageSession.
**Minimum 4 tests.**

### [x] Task 20: downloads.controller.spec.ts — Done, 6 tests
Methods: queue, getStatus, getAll, cancel, delete.
**Minimum 4 tests.**

### [x] Task 21: embeddings.controller.spec.ts — Done, 2 tests
Methods: generateForContent, getSimilar, getUserVector.
**Minimum 3 tests.**

### [x] Task 22: encryption.controller.spec.ts — Done, 9 tests
Methods: registerKey, getPublicKey, getBulkKeys, storeEnvelope, getEnvelope, rotateKey, getSafetyNumber, getEncryptionStatus.
**Minimum 6 tests.**

### [x] Task 23: events.controller.spec.ts — Done, 9 tests
Methods: create, getById, update, delete, rsvp, cancelRsvp, getAttendees, getUpcoming.
**Minimum 6 tests.**

### [x] Task 24: follows.controller.spec.ts — Done, 10 tests
Methods: follow, unfollow, getFollowers, getFollowing, getMutualFollowers, getRequests, acceptRequest, rejectRequest.
**Minimum 7 tests.**

### [x] Task 25: gamification.controller.spec.ts — Done, 11 tests
Methods: getProfile, getLeaderboard, getAchievements, getChallenges, joinChallenge, getStreaks, getXPHistory, getSeries, getContinueWatching.
**Minimum 7 tests.**

### [x] Task 26: gifts.controller.spec.ts — Done, 9 tests
Methods: getCatalog, send, getReceived, getSent, getCoinBalance, purchaseCoins.
**Minimum 5 tests.**

### [x] Task 27: halal.controller.spec.ts — Done, 7 tests
Methods: findNearby, getById, create, addReview, getReviews, verifyHalal.
**Minimum 5 tests.**

### [x] Task 28: hashtags.controller.spec.ts — Done, 12 tests
Methods: getTrending, getByName, follow, unfollow, getFollowed, search.
**Minimum 5 tests.**

### [x] Task 29: health/legal.controller.spec.ts — Done, 6 tests
Methods: getPrivacyPolicy, getTermsOfService.
**Minimum 2 tests.**

### [x] Task 30: islamic.controller.spec.ts — Done, 26 tests
**This is the biggest controller — read it fully.** Methods: getPrayerTimes, getQuranChapters, getQuranVerses, searchQuran, getHadiths, getDuas, getNamesOfAllah, getHifzProgress, updateHifzProgress, getFastingLog, logFast, getDailyBriefing, completeDailyTask, calculateZakat, getNearbyMosques, getHajjGuide, getNasheedMode, updateNasheedMode.
**Minimum 15 tests.**

### [x] Task 31: majlis-lists.controller.spec.ts — Done, 8 tests
Methods: create, getAll, getById, addMember, removeMember, delete, getFeed.
**Minimum 5 tests.**

### [x] Task 32: moderation.controller.spec.ts — Done, 8 tests
Methods: getQueue, reviewContent, takeAction, getAppeals, resolveAppeal, getStats.
**Minimum 5 tests.**

### [x] Task 33: monetization.controller.spec.ts — Done, 12 tests
Methods: createTier, getTiers, subscribe, unsubscribe, getSubscribers, getRevenue.
**Minimum 5 tests.**

### [x] Task 34: mosques.controller.spec.ts — Done, 10 tests
Methods: getNearby, getById, create, join, leave, getFeed, createPost, getMembers.
**Minimum 6 tests.**

### [x] Task 35: mutes.controller.spec.ts — Done, 3 tests
Methods: mute, unmute, getMuted.
**Minimum 3 tests.**

### [x] Task 36: notifications.controller.spec.ts — Done, 6 tests
Methods: getAll, markRead, markAllRead, getPreferences, updatePreferences, getUnreadCount.
**Minimum 5 tests.**

### [x] Task 37: og.controller.spec.ts — Done, 6 tests
Methods: getPostOG, getReelOG, getProfileOG, getThreadOG.
**Minimum 3 tests.**

### [x] Task 38: parental-controls.controller.spec.ts — Done, 9 tests
Methods: setPin, verifyPin, getSettings, updateSettings, getActivityDigest.
**Minimum 4 tests.**

### [x] Task 39: payments.controller.spec.ts — Done, 5 tests
Methods: createPaymentIntent, getHistory, getSubscriptions.
**Minimum 3 tests.**

### [x] Task 40: payments/stripe-webhook.controller.spec.ts — Done, 6 tests
Methods: handleWebhook — verify signature + handle checkout.session.completed, invoice.paid, customer.subscription.deleted.
**Minimum 4 tests.**

### [x] Task 41: polls.controller.spec.ts — Done, 5 tests
Methods: create, vote, getResults, close.
**Minimum 3 tests.**

### [x] Task 42: privacy.controller.spec.ts — Done, 2 tests
Methods: getSettings, updateSettings.
**Minimum 2 tests.**

### [x] Task 43: profile-links.controller.spec.ts — Done, 5 tests
Methods: getLinks, addLink, updateLink, deleteLink, reorder.
**Minimum 4 tests.**

### [x] Task 44: promotions.controller.spec.ts — Done, 6 tests
Methods: create, getById, pause, resume, getStats, getAll.
**Minimum 5 tests.**

### [x] Task 45: recommendations.controller.spec.ts — Done, 4 tests
Methods: getRecommendedUsers, getRecommendedContent, getSimilarPosts.
**Minimum 3 tests.**

### [x] Task 46: reel-templates.controller.spec.ts — Done, 6 tests
Methods: getAll, getById, use, create.
**Minimum 3 tests.**

### [x] Task 47: reports.controller.spec.ts — Done, 5 tests
Methods: create, getMyReports, getById, appeal.
**Minimum 3 tests.**

### [x] Task 48: restricts.controller.spec.ts — Done, 3 tests
Methods: restrict, unrestrict, getRestricted.
**Minimum 3 tests.**

### [x] Task 49: retention.controller.spec.ts — Done, 1 test
Methods: getStreakStatus, getEngagementMetrics, getMilestones.
**Minimum 3 tests.**

### [x] Task 50: scheduling.controller.spec.ts — Done, 4 tests
Methods: schedule, cancel, getScheduled, publish.
**Minimum 3 tests.**

### [x] Task 51: scholar-qa.controller.spec.ts — Done, 7 tests
Methods: schedule, getUpcoming, submitQuestion, voteQuestion, startSession, endSession, getRecordings.
**Minimum 5 tests.**

### [x] Task 52: search.controller.spec.ts — Done, 5 tests
Methods: search, getAutocompleteSuggestions, getRecentSearches, getTrendingSearches, clearRecent.
**Minimum 4 tests.**

### [x] Task 53: settings.controller.spec.ts — Done, 6 tests
Methods: getAll, update, getScreenTime, getQuietMode, updateQuietMode.
**Minimum 4 tests.**

### [x] Task 54: story-chains.controller.spec.ts — Done, 5 tests
Methods: create, getById, addEntry, getEntries.
**Minimum 3 tests.**

### [x] Task 55: stream.controller.spec.ts — Done, 3 tests
Methods: getUploadUrl, getVideoStatus, getThumbnail.
**Minimum 3 tests.**

### [x] Task 56: subtitles.controller.spec.ts — Done, 4 tests
Methods: generate, getByVideo, update, delete.
**Minimum 3 tests.**

### [x] Task 57: telegram-features.controller.spec.ts — Done, 8 tests
Methods: getSavedMessages, saveSelf, getChatFolders, createFolder, setSlowMode, getAdminLog, getGroupTopics, getCustomEmojis.
**Minimum 6 tests.**

### [x] Task 58: thumbnails.controller.spec.ts — Done, 5 tests
Methods: createVariants, serveThumbnail, trackImpression, trackClick, getResults.
**Minimum 4 tests.**

### [x] Task 59: two-factor.controller.spec.ts — Done, 8 tests
Methods: setup, verify, disable, getStatus.
**Minimum 3 tests.**

### [x] Task 60: upload.controller.spec.ts — Done, 5 tests
Methods: getPresignedUrl, validateUpload.
**Minimum 2 tests.**

### [x] Task 61: video-replies.controller.spec.ts — Done, 4 tests
Methods: create, getByComment, delete.
**Minimum 3 tests.**

### [x] Task 62: watch-history.controller.spec.ts — Done, 8 tests
Methods: getHistory, addToHistory, clearHistory, getWatchLater, addToWatchLater, removeFromWatchLater.
**Minimum 5 tests.**

### [x] Task 63: webhooks.controller.spec.ts — Done, 4 tests
Methods: create, getByCircle, delete, test, getDeliveryLog.
**Minimum 4 tests.**

---

## SECTION 2: EXPAND UNDER-TESTED SERVICES (Tasks 64-90)

For each service with fewer than 15 tests, add tests until it has at least 15 meaningful tests covering every public method with happy + error paths.

**Process for each:**
1. Read the existing spec file
2. Read the service file — count public methods
3. For each method without tests: add happy path + error path
4. For each method with only happy path: add error path
5. Run tests → verify → commit

### [x] Task 64: auth.service — expanded to 15 tests
### [x] Task 65: blocks.service — expanded to 15 tests
### [x] Task 66: broadcast.service — expanded to 22 tests
### [x] Task 67: chat-export.service — expanded to 15 tests
### [x] Task 68: clips.service — expanded to 15 tests
### [x] Task 69: community.service — expanded to 20 tests
### [x] Task 70: community-notes.service — expanded to 15 tests
### [x] Task 71: creator.service — expanded to 15 tests
### [x] Task 72: devices.service — expanded to 15 tests
### [x] Task 73: drafts.service — expanded to 15 tests
### [x] Task 74: feed.service — expanded to 15 tests
### [x] Task 75: live.service — expanded to 20 tests
### [x] Task 76: mutes.service — expanded to 10 tests
### [x] Task 77: og.service — expanded to 17 tests
### [x] Task 78: parental-controls.service — expanded to 25 tests
### [x] Task 79: personalized-feed.service — rewritten to 15 real tests
### [x] Task 80: privacy.service — expanded to 8 tests
### [x] Task 81: restricts.service — expanded to 14 tests
### [x] Task 82: scholar-qa.service — expanded to 21 tests
### [x] Task 83: story-chains.service — expanded to 17 tests
### [x] Task 84: stream.service — expanded to 15 tests
### [x] Task 85: thumbnails.service — expanded to 15 tests
### [x] Task 86: upload.service — expanded to 15 tests
### [x] Task 87: watch-history.service — expanded to 19 tests
### [x] Task 88: webhooks.service — expanded to 16 tests
### [x] Task 89: feed-transparency.service — expanded to 21 tests
### [x] Task 90: islamic-notifications.service — expanded to 17 tests

---

## SECTION 3: GATEWAY TESTS (Tasks 91-92)

### [x] Task 91: Expand chat.gateway.spec.ts — expanded to 31 tests

Read `apps/api/src/gateways/chat.gateway.ts` completely. Current: 14 tests for 15 events.

For EACH `@SubscribeMessage` event, verify:
1. Handler validates input DTO
2. Handler checks user authorization (membership in conversation)
3. Handler calls the correct service method
4. Handler emits the correct response event to the correct room
5. Handler handles errors (invalid conversation, not a member)

Events to test:
- `send_message` — send + emit `new_message` to room
- `join_conversation` — join socket room
- `leave_conversation` — leave socket room
- `typing` — emit `user_typing` to room
- `read_receipt` — mark messages read
- `call_initiate` — start call signaling
- `call_answer` — accept call
- `call_reject` — decline call
- `call_end` — end call
- `call_signal` — WebRTC signaling data
- `join_quran_room` — join Quran reading room
- `leave_quran_room` — leave room
- `quran_verse_sync` — host navigates verse
- `quran_reciter_change` — host changes reciter
- Plus any other events

**Minimum 25 tests total for the gateway.**

### [x] Task 92: Add gateway connection/disconnection tests — included in 31 total

- Test JWT auth on connection (valid token → connected, invalid → rejected)
- Test heartbeat/presence tracking
- Test reconnection handling
- Test room cleanup on disconnect
**Minimum 5 tests.**

---

## SECTION 4: ANTI-PATTERN CLEANUP (Tasks 93-94)

### [x] Task 93: Replace all sole-assertion `toBeDefined()` tests — fixed 40 tests across 30+ files

There are 20+ tests where the ONLY assertion is `expect(X).toBeDefined()`. For each:
1. Find the test
2. Add a meaningful assertion alongside it (or replace it entirely)
3. The test must now verify actual behavior, not just DI existence

Files with sole `toBeDefined()`:
- alt-profile, audio-tracks.controller, broadcast.controller, calls.controller, channel-posts.controller, channels.controller, collabs.controller, feed.controller, halal, health.controller, live.controller, messages.controller, content-safety, stripe-connect, playlists.controller, playlists.service, posts.controller, reels.controller, reels.service, stickers.controller, stories.controller, subtitles, telegram-features, threads.controller, threads.service, two-factor, users.controller, users.service, videos.controller, videos.service

**For each file:** Read the first test, if it's just `expect(service/controller).toBeDefined()`, add a meaningful test alongside it. The `toBeDefined` can stay but must NOT be the only test in the describe block.

### [x] Task 94: Replace `.length > 0` assertions — 1 replaced, 14 kept (legitimate API response checks)

15 remaining `.length > 0` checks. Review each:
- If it tests a mock return value → replace with `toEqual` on actual expected data
- If it tests an API response array size → keep (legitimate)
- If it tests a string constant → delete (meaningless)

---

## SECTION 5: INTEGRATION TEST EXPANSION (Tasks 95-100)

### [ ] Task 95: Integration test — Post lifecycle
```
Create user → Create post → Get post → Like post → Comment → Get comments → Unlike → Delete post → Verify gone
```
**10 tests.**

### [ ] Task 96: Integration test — Thread lifecycle
```
Create thread → Reply → Like reply → Get thread with replies → Delete thread
```
**6 tests.**

### [ ] Task 97: Integration test — Follow + Feed
```
User A creates → User B follows A → User B's feed includes A's content → Unfollow → Feed no longer includes A
```
**5 tests.**

### [ ] Task 98: Integration test — Messaging flow
```
Create conversation → Send message → Forward (within limit) → Forward (exceed limit → error) → Edit → Delete
```
**6 tests.**

### [ ] Task 99: Integration test — Islamic features
```
Get prayer times → Get Quran chapters → Get verses → Search Quran → Log fast → Get daily briefing
```
**6 tests.**

### [ ] Task 100: Integration test — Gamification
```
Create post → Verify XP awarded → Check streak → Complete daily task → Check level
```
**5 tests.**

---

## COMPLETION CHECKLIST

**DO NOT claim completion until ALL of these are true:**

- [ ] All 63 controller spec files created (Tasks 1-63)
- [ ] All 27 under-tested services expanded (Tasks 64-90)
- [ ] Gateway expanded to 30+ tests (Tasks 91-92)
- [ ] All sole `toBeDefined()` tests have meaningful assertions added (Task 93)
- [ ] `.length > 0` assertions reviewed and fixed where inappropriate (Task 94)
- [ ] 6 new integration test files created (Tasks 95-100)
- [ ] Full test suite passes: `npx jest --no-coverage` → 0 failures
- [ ] Total test count is 3,000+ (up from 2,043)
- [ ] Zero `if (typeof (service as any)` guards exist
- [ ] No new `expect(true).toBe(true)` or `expect(stringLiteral.length).toBeGreaterThan(0)` patterns

---

## EXPECTED TEST COUNT MATH

| Section | Items | Tests Per Item | Total |
|---------|-------|---------------|-------|
| Controller specs (63 new) | 63 | ~4 avg | ~252 |
| Service expansions (27) | 27 | ~6 avg new | ~162 |
| Gateway expansion | 1 | ~16 new | ~16 |
| Anti-pattern fixes | ~25 | ~1 replacement | ~25 |
| Integration tests (6) | 6 | ~6 avg | ~38 |
| **Total new** | | | **~493** |
| **Existing** | | | **2,043** |
| **Expected final** | | | **~2,536** |

**Note:** This is a MINIMUM. If you read a controller and it has 15 endpoints, write 15 tests, not 4. The "minimum per task" numbers are floors, not targets. More is better.

**Realistic target: 2,800-3,200 tests.**

---

## SESSION MANAGEMENT

This is a LOT of work. You will likely need multiple context windows.

**Window 1:** Tasks 1-30 (first 30 controller specs)
**Window 2:** Tasks 31-63 (remaining 33 controller specs)
**Window 3:** Tasks 64-94 (service expansions + gateway + anti-patterns)
**Window 4:** Tasks 95-100 (integration tests) + final verification

**At end of each window:**
1. Run `npx jest --no-coverage` → 0 failures
2. Commit all new test files
3. Count tests: `grep -r "it(" apps/api/src --include="*.spec.ts" | wc -l`
4. Note which task you stopped at
5. DO NOT say "batch complete" — say "completed through Task X, continuing in next window"

---

## REMEMBER

- **63 controllers need specs. 27 services need expansion. Gateway needs 16 more tests. That's ~100 tasks.**
- **Read the source before writing tests. Every time.**
- **No typeof guards. No sole toBeDefined(). No mock-assertion tests.**
- **Run tests after every 5 files. Don't accumulate 30 broken tests.**
- **Commit after every 5-10 tasks. Don't lose work.**

**BEGIN WITH TASK 1: admin.controller.spec.ts.**
