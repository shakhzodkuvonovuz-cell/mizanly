# Audit Agent #9 — Community Features Deep Audit

**Auditor:** Claude Opus 4.6 (Agent #9 of 57)
**Date:** 2026-03-21
**Scope:** All community-related backend modules
**Files Audited:** 45+ files across 9 modules (communities, community, circles, community-notes, events, mosques, scholar-qa, halal, discord-features)
**Total Findings:** 62

---

## TIER 0 — CRITICAL / SHIP BLOCKERS (8 findings)

### F01. `prisma.community` model does not exist — role management crashes at runtime
- **File:** `apps/api/src/modules/communities/communities.service.ts`, line 414
- **Severity:** P0 — CRASH
- **Category:** Model Existence
- **Description:** The `requireAdmin()` method calls `this.prisma.community.findUnique()` but there is NO `Community` model in the Prisma schema. The model is `Circle`. This means all role management methods (`createRole`, `updateRole`, `deleteRole`) crash with a Prisma runtime error when called.
- **Code:**
  ```ts
  private async requireAdmin(communityId: string, userId: string) {
    const community = await this.prisma.community.findUnique({ where: { id: communityId } });
    // ^^^ prisma.community does NOT exist — should be prisma.circle
  ```
- **Impact:** Community role management (CommunityRole CRUD) is completely non-functional. All 4 role methods throw runtime errors.
- **Fix:** Change `this.prisma.community` to `this.prisma.circle` and verify `ownerId` field matches.

---

### F02. Role management endpoints unreachable — no controller routes
- **File:** `apps/api/src/modules/communities/communities.controller.ts`
- **Severity:** P0 — DEAD CODE
- **Category:** Missing Routes
- **Description:** `CommunitiesService` has 4 role management methods (`createRole`, `updateRole`, `deleteRole`, `listRoles`) at lines 379-411, but `CommunitiesController` has zero corresponding route handlers. These methods are exported but never callable via HTTP.
- **Impact:** The entire `CommunityRole` feature (granular permissions: canSendMessages, canKick, canBan, etc.) is unreachable from any client.
- **Fix:** Add controller endpoints: `POST :id/roles`, `PATCH roles/:roleId`, `DELETE roles/:roleId`, `GET :id/roles`.

---

### F03. Events controller has double-prefix — routes unreachable
- **File:** `apps/api/src/modules/events/events.controller.ts`, line 157
- **Severity:** P0 — ROUTE BUG
- **Category:** Route Configuration
- **Description:** `@Controller('api/v1/events')` combined with `app.setGlobalPrefix('api/v1')` in `main.ts:60` produces actual path `/api/v1/api/v1/events`. All event endpoints are unreachable at their intended paths.
- **Code:**
  ```ts
  @Controller('api/v1/events')  // Should be @Controller('events')
  export class EventsController {
  ```
- **Impact:** All event operations (create, list, RSVP, update, delete) are at wrong URLs.
- **Fix:** Change to `@Controller('events')`.

---

### F04. Watch parties are permanently inactive — no activate mechanism
- **File:** `apps/api/src/modules/community/community.service.ts`, lines 228-246
- **Severity:** P0 — FEATURE BROKEN
- **Category:** Watch Parties
- **Description:** `WatchParty` model defaults `isActive: false` (schema line 3436). `createWatchParty()` creates a party but never sets `isActive: true`. `getActiveWatchParties()` queries `{ isActive: true }`, so newly created parties are invisible. There is no `startWatchParty` or `activateWatchParty` endpoint. The entire watch party feature is dead.
- **Impact:** Watch parties can be created but never found or joined. The feature is a no-op.
- **Fix:** Either default `isActive` to `true` or add a `start/activate` endpoint.

---

### F05. Non-members can create forum threads in any community
- **File:** `apps/api/src/modules/discord-features/discord-features.service.ts`, line 13
- **Severity:** P0 — AUTHORIZATION BYPASS
- **Category:** Membership Authorization
- **Description:** `createForumThread()` accepts any authenticated `userId` and `circleId` but never checks if the user is a member of that circle. Any logged-in user can create forum threads in any community, including private ones.
- **Code:**
  ```ts
  async createForumThread(userId: string, circleId: string, dto: ...) {
    // NO membership check
    return this.prisma.forumThread.create({
      data: { circleId, authorId: userId, ... },
    });
  }
  ```
- **Impact:** Authorization bypass. Private community content integrity compromised.
- **Fix:** Add `CircleMember` lookup before allowing thread creation.

---

### F06. Non-members can create webhooks in any community
- **File:** `apps/api/src/modules/discord-features/discord-features.service.ts`, line 94
- **Severity:** P0 — AUTHORIZATION BYPASS
- **Category:** Membership Authorization
- **Description:** `createWebhook()` does not check if the user is a member (let alone admin/moderator) of the circle. Any authenticated user can create up to 15 webhooks in any community.
- **Impact:** Attackers can create webhooks in private communities they don't belong to, potentially injecting messages.
- **Fix:** Add membership + role permission check (should require admin/moderator role with `canManageChannels` permission).

---

### F07. Stage sessions have no membership check
- **File:** `apps/api/src/modules/discord-features/discord-features.service.ts`, line 133
- **Severity:** P0 — AUTHORIZATION BYPASS
- **Category:** Membership Authorization
- **Description:** `createStageSession()` allows any authenticated user to create stage sessions in any community. No membership verification.
- **Impact:** Unauthorized users can create and host moderated audio sessions in communities they don't belong to.

---

### F08. Mosque feed accessible to non-members for private mosque data
- **File:** `apps/api/src/modules/mosques/mosques.controller.ts`, line 84-89
- **Severity:** P0 — PRIVACY VIOLATION
- **Category:** Access Control
- **Description:** `getFeed()` uses `OptionalClerkAuthGuard` and performs zero membership checks. Any user (or guest) can read any mosque's feed by knowing the mosque ID, even though mosque posts require membership to create.
- **Impact:** Mosque community content has write-protection but no read-protection.

---

## TIER 1 — HIGH SEVERITY (12 findings)

### F09. Fatwa answering has no scholar verification
- **File:** `apps/api/src/modules/community/community.service.ts`, line 118
- **Severity:** P1 — AUTHORIZATION
- **Category:** Role Verification
- **Description:** `answerFatwa()` accepts any `scholarId` without checking `ScholarVerification` status. Any user can answer fatwa questions, presenting as a religious authority. This is a serious trust/safety issue for an Islamic platform.
- **Code:**
  ```ts
  async answerFatwa(scholarId: string, questionId: string, answer: string) {
    // NO verification that scholarId is actually a verified scholar
  ```
- **Fix:** Query `ScholarVerification` where `userId = scholarId AND status = 'approved'`.

---

### F10. Scholar Q&A sessions schedulable by anyone
- **File:** `apps/api/src/modules/scholar-qa/scholar-qa.service.ts`, line 8
- **Severity:** P1 — AUTHORIZATION
- **Category:** Role Verification
- **Description:** `schedule()` creates Q&A sessions for any authenticated user. No check that the `scholarId` is a verified scholar. An impersonator could schedule fake Q&A sessions.
- **Fix:** Verify `ScholarVerification` status before allowing session creation.

---

### F11. Scholar Q&A vote unlimited — no dedup
- **File:** `apps/api/src/modules/scholar-qa/scholar-qa.service.ts`, line 66
- **Severity:** P1 — DATA INTEGRITY
- **Category:** Vote Manipulation
- **Description:** `voteQuestion()` increments `votes` counter without checking if the user has already voted. A single user can call this endpoint repeatedly to inflate vote counts.
- **Code:**
  ```ts
  async voteQuestion(userId: string, questionId: string) {
    // "Simple increment (no duplicate check for simplicity — could add a vote model)"
    return this.prisma.scholarQuestion.update({
      where: { id: questionId },
      data: { votes: { increment: 1 } },
    });
  }
  ```

---

### F12. Halal verify unlimited — same user can verify a restaurant infinitely
- **File:** `apps/api/src/modules/halal/halal.service.ts`, line 152
- **Severity:** P1 — DATA INTEGRITY
- **Category:** Vote Manipulation
- **Description:** `verifyHalal()` increments `verifyVotes` without checking if the user already verified. A single user calling this 5 times auto-verifies any restaurant as halal. Given the religious significance of halal certification, this is a trust-critical vulnerability.
- **Fix:** Add a `HalalVerifyVote` join table or at minimum a per-user dedup check.

---

### F13. Community notes created for non-existent content
- **File:** `apps/api/src/modules/community-notes/community-notes.service.ts`, line 8
- **Severity:** P1 — DATA INTEGRITY
- **Category:** Referential Integrity
- **Description:** `createNote()` validates `contentType` but never verifies that `contentId` points to an actual post/thread/reel. Notes can be created for non-existent content IDs. Since `CommunityNote` uses a polymorphic FK (String contentId, String contentType) rather than a proper relation, there is no database-level referential integrity either.
- **Fix:** Query the appropriate model (post/thread/reel) by contentId before creating the note.

---

### F14. `membersCount` can go negative on community leave
- **File:** `apps/api/src/modules/communities/communities.service.ts`, line 320
- **Severity:** P1 — DATA INTEGRITY
- **Category:** Counter Integrity
- **Description:** `leave()` decrements `membersCount` by 1 without clamping to zero. Race conditions or repeated leave attempts could drive the count negative. Compare with `circles.service.ts:123` which uses `GREATEST("membersCount" - ..., 1)`.
- **Code:**
  ```ts
  this.prisma.circle.update({
    where: { id },
    data: { membersCount: { decrement: 1 } },  // Can go negative
  }),
  ```

---

### F15. `memberCount` can go negative on mosque leave
- **File:** `apps/api/src/modules/mosques/mosques.service.ts`, line 81
- **Severity:** P1 — DATA INTEGRITY
- **Category:** Counter Integrity
- **Description:** `leave()` decrements `memberCount` without clamping, and the `catch` block swallows all errors — so even if the delete fails (user is not a member), the count still decrements.
- **Code:**
  ```ts
  async leave(userId: string, mosqueId: string) {
    try {
      await this.prisma.mosqueMembership.delete({ ... });
      await this.prisma.mosqueCommunity.update({
        data: { memberCount: { decrement: 1 } },  // Not atomic with delete; can desync
      });
    } catch {
      // SILENTLY swallows all errors — returns { left: true } even if user wasn't a member
    }
  }
  ```

---

### F16. Mosque leave is not transactional — counter desync
- **File:** `apps/api/src/modules/mosques/mosques.service.ts`, lines 77-88
- **Severity:** P1 — DATA INTEGRITY
- **Category:** Race Condition
- **Description:** `leave()` performs membership delete and counter decrement as separate operations (not in a `$transaction`). If the delete succeeds but the update fails, the counter desync is permanent. The catch block hides the error.

---

### F17. Mosque join is not transactional — counter desync
- **File:** `apps/api/src/modules/mosques/mosques.service.ts`, lines 55-73
- **Severity:** P1 — DATA INTEGRITY
- **Category:** Race Condition
- **Description:** `join()` performs membership create and counter increment as separate operations. If the create succeeds but the increment fails, the count is wrong.

---

### F18. Forum thread lock/pin has no authorization check
- **File:** `apps/api/src/modules/discord-features/discord-features.service.ts`, lines 79-90
- **Severity:** P1 — AUTHORIZATION
- **Category:** Missing Permission Check
- **Description:** `lockForumThread()` and `pinForumThread()` accept a `userId` parameter but never check if the user is an admin/moderator. Any authenticated user can lock or pin any forum thread.
- **Code:**
  ```ts
  async lockForumThread(threadId: string, userId: string) {
    // userId is received but NEVER checked
    return this.prisma.forumThread.update({ where: { id: threadId }, data: { isLocked: true } });
  }
  ```

---

### F19. Webhook deletion only checks creator — admins cannot manage
- **File:** `apps/api/src/modules/discord-features/discord-features.service.ts`, line 111
- **Severity:** P1 — AUTHORIZATION
- **Category:** Incomplete Permission Model
- **Description:** `deleteWebhook()` uses `findFirst({ createdById: userId })`. Community admins cannot delete webhooks created by other users, even if they have `canManageChannels` permission.

---

### F20. Community notes `somewhat_helpful` rating counted as helpful
- **File:** `apps/api/src/modules/community-notes/community-notes.service.ts`, line 47
- **Severity:** P1 — LOGIC ERROR
- **Category:** Rating Logic
- **Description:** The rating increment logic only distinguishes `not_helpful` from everything else. Both `helpful` and `somewhat_helpful` increment `helpfulVotes`. This inflates the "helpful" ratio since `somewhat_helpful` is a middle-ground rating.
- **Code:**
  ```ts
  const incrementField = rating === 'not_helpful' ? 'notHelpfulVotes' : 'helpfulVotes';
  ```
- **Impact:** Notes are promoted to "helpful" status more easily than intended.

---

## TIER 2 — MEDIUM SEVERITY (16 findings)

### F21. Pagination cursor bug in `listMembers` — skips records with ascending order
- **File:** `apps/api/src/modules/communities/communities.service.ts`, lines 353-360
- **Severity:** P2 — PAGINATION BUG
- **Category:** Data Access
- **Description:** Uses `where.joinedAt = { lt: new Date(cursor) }` with `orderBy: { joinedAt: 'asc' }`. For ascending order, the cursor should use `gt` (greater than), not `lt` (less than). As written, the second page returns records *before* the cursor, producing infinite loops or missing records.
- **Fix:** Change `lt` to `gt` for ascending pagination.

---

### F22. Mosque `my/memberships` route shadowed by `:id` wildcard
- **File:** `apps/api/src/modules/mosques/mosques.controller.ts`, lines 62-117
- **Severity:** P2 — ROUTE BUG
- **Category:** Route Ordering
- **Description:** `@Get(':id')` at line 63 appears BEFORE `@Get('my/memberships')` at line 113. NestJS evaluates routes top-to-bottom, so `GET /mosques/my` is caught by the `:id` param route, interpreting `my` as a mosque ID and returning 404. The `my/memberships` route is unreachable.
- **Fix:** Move `@Get('my/memberships')` above `@Get(':id')`, or use `@Get('nearby')` pattern (which already works because it's first).

---

### F23. Private communities joinable without approval
- **File:** `apps/api/src/modules/communities/communities.service.ts`, line 274
- **Severity:** P2 — PRIVACY
- **Category:** Access Control
- **Description:** Comment on line 274 says "For private communities, maybe require approval? For now, allow join." PRIVATE communities can be joined by anyone without approval. Only INVITE_ONLY communities are blocked.
- **Impact:** The `PRIVATE` privacy setting is functionally identical to `PUBLIC`.

---

### F24. Events privacy filter bypass for authenticated users
- **File:** `apps/api/src/modules/events/events.service.ts`, lines 72-82
- **Severity:** P2 — PRIVACY
- **Category:** Access Control
- **Description:** `listEvents()` only restricts to `public` events when `!userId`. Authenticated users can see ALL events (including private ones) in the list view. The privacy filter on line 76-82 does nothing for logged-in users who don't explicitly pass `privacy=public`.
- **Code:**
  ```ts
  if (privacy) {
    where.privacy = privacy;
  } else {
    if (!userId) { where.privacy = 'public'; }
    // Authenticated users with no privacy filter = see ALL events including private
  }
  ```

---

### F25. Community data export capped at 50 records per type
- **File:** `apps/api/src/modules/community/community.service.ts`, lines 297-308
- **Severity:** P2 — GDPR COMPLIANCE
- **Category:** Legal/Data Rights
- **Description:** `getDataExport()` uses `take: 50` on posts, threads, and messages. Users with more than 50 posts get an incomplete export. Under GDPR Article 15/20, users have the right to ALL their data.
- **Impact:** GDPR non-compliance for data portability.

---

### F26. CommunityController routes at root level — no namespace
- **File:** `apps/api/src/modules/community/community.controller.ts`, line 19
- **Severity:** P2 — API DESIGN
- **Category:** Route Namespace
- **Description:** `@Controller()` with no path means all routes are at root: `POST /api/v1/boards`, `POST /api/v1/mentorship/request`, `POST /api/v1/fatwa`, etc. These compete with other modules' routes and violate REST resource naming conventions.
- **Impact:** Route collisions, confusing API surface, poor discoverability.

---

### F27. No throttle on 17 of 18 CommunityController endpoints
- **File:** `apps/api/src/modules/community/community.controller.ts`
- **Severity:** P2 — RATE LIMITING
- **Category:** Abuse Prevention
- **Description:** Only `askFatwa` (line 82) has `@Throttle`. The other 17 write endpoints (createBoard, requestMentorship, createStudyCircle, createOpportunity, createEvent, createVoicePost, createWatchParty, createCollection, createWaqf) have NO rate limiting beyond the global 100/min.
- **Endpoints missing throttle:** createBoard, requestMentorship, respondMentorship, createStudyCircle, createOpportunity, createEvent, createVoicePost, createWatchParty, createCollection, createWaqf, checkKindness, getDataExport, getReputation, updateReputation, getEvents, getVoicePosts, getBoards

---

### F28. Inline DTOs in controller files — poor separation of concerns
- **File:** `apps/api/src/modules/events/events.controller.ts`, lines 22-154
- **File:** `apps/api/src/modules/mosques/mosques.controller.ts`, lines 10-27
- **File:** `apps/api/src/modules/scholar-qa/scholar-qa.controller.ts`, lines 10-20
- **File:** `apps/api/src/modules/halal/halal.controller.ts`, lines 10-29
- **File:** `apps/api/src/modules/community-notes/community-notes.controller.ts`, lines 10-18
- **Severity:** P2 — CODE QUALITY
- **Category:** Architecture
- **Description:** 5 modules define DTOs inline in controller files instead of in `dto/` directories. While functional, this makes DTOs harder to find, reuse, and test independently.

---

### F29. No `@MaxLength` on multiple inline DTO string fields
- **Files:** Multiple inline DTOs across community-notes, mosques, scholar-qa, halal controllers
- **Severity:** P2 — INPUT VALIDATION
- **Category:** DTO Validation
- **Description:** The following fields have `@IsString()` but no `@MaxLength()`:
  - `CreateNoteDto.note` (community-notes) — unbounded text to DB
  - `CreateNoteDto.contentType`, `CreateNoteDto.contentId`
  - `RateNoteDto.rating`
  - `CreateMosqueDto.name`, `address`, `city`, `country`, `madhab`, `language`, `phone`, `website`, `imageUrl`
  - `CreateMosquePostDto.content`
  - `ScheduleQADto.title`, `description`, `category`, `language`, `scheduledAt`
  - `SubmitQuestionDto.question`
  - `CreateRestaurantDto.name`, `address`, `city`, `country`, `cuisineType`, `certifyingBody`, `phone`, `website`, `imageUrl`
  - `AddReviewDto.comment`
- **Impact:** Unbounded strings can cause DB storage abuse and potential DoS.

---

### F30. No `@IsUrl()` on URL fields in community DTOs
- **Files:**
  - `communities/dto/create-community.dto.ts:19` — `coverUrl: @IsString()` (no @IsUrl)
  - `communities/dto/update-community.dto.ts:20` — `coverUrl: @IsString()` (no @IsUrl)
  - `community/dto/community.dto.ts:58` — `coverUrl: @IsString()` (no @IsUrl)
  - `community/dto/community.dto.ts:62` — `audioUrl: @IsString()` (no @IsUrl)
  - `mosques/mosques.controller.ts:21` — `website: @IsString()` (no @IsUrl)
  - `mosques/mosques.controller.ts:22` — `imageUrl: @IsString()` (no @IsUrl)
  - `halal/halal.controller.ts:22` — `website: @IsString()` (no @IsUrl)
  - `halal/halal.controller.ts:23` — `imageUrl: @IsString()` (no @IsUrl)
- **Severity:** P2 — INPUT VALIDATION
- **Category:** SSRF Risk
- **Description:** URL fields accept arbitrary strings. Malicious URLs could be stored and rendered client-side, or could be used in SSRF attacks if processed server-side.

---

### F31. `FatwaQuestion.answerId` stores the answer text, not an ID
- **File:** `apps/api/src/modules/community/community.service.ts`, line 124
- **Severity:** P2 — SCHEMA MISMATCH
- **Category:** Data Model
- **Description:** The field is named `answerId` (suggesting a foreign key reference) but the code stores the answer text in it: `answerId: answer` where `answer` is a string of text up to 5000 chars. The schema field (`FatwaQuestion.answerId`) is typed as `String?` with no VarChar limit.
- **Code:**
  ```ts
  data: { status: 'answered', answerId: answer, answeredBy: scholarId, answeredAt: new Date() },
  //                          ^^^^^^^^ "answerId" holds the answer TEXT, not an ID
  ```
- **Impact:** Confusing schema design, potential issues if the field is later expected to be a reference.

---

### F32. Arabic community names produce empty slugs
- **File:** `apps/api/src/modules/communities/communities.service.ts`, line 63-69
- **Severity:** P2 — BUG
- **Category:** Slug Generation
- **Description:** `generateSlug()` strips everything except `[a-z0-9]`. For pure Arabic/Urdu/Turkish names, the result is an empty string `''`. This causes the `prisma.circle.findUnique({ where: { slug } })` uniqueness check to always find the empty slug if any previous Arabic community exists.
- **Code:**
  ```ts
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')  // Strips ALL non-Latin characters
      .replace(/^-|-$/g, '')
      .substring(0, 100);
  }
  ```
- **Impact:** Arabic community names all collide on the empty slug, making it impossible to create more than one Arabic-named community.

---

### F33. `circles.service.ts` slug uses random suffix — update does not regenerate
- **File:** `apps/api/src/modules/circles/circles.service.ts`, lines 5-14, 78
- **Severity:** P2 — INCONSISTENCY
- **Category:** Slug Management
- **Description:** `CirclesService.generateSlug()` appends a random suffix (`Math.random().toString(36).slice(2, 7)`) for uniqueness. But `CommunitiesService.generateSlug()` does NOT. The two services that operate on the same `Circle` model have incompatible slug generation. Also, `CirclesService.update()` does not regenerate the slug when the name changes, while `CommunitiesService.update()` does.

---

### F34. Two separate modules for the same `Circle` model — split-brain architecture
- **Files:**
  - `apps/api/src/modules/communities/` (CRUD, join/leave, role management)
  - `apps/api/src/modules/circles/` (CRUD, member management)
- **Severity:** P2 — ARCHITECTURE
- **Category:** Module Design
- **Description:** Both `CommunitiesService` and `CirclesService` operate on the `Circle` and `CircleMember` Prisma models. They have overlapping functionality (create, delete, member management) with different implementations. `circles` doesn't check `isBanned`, doesn't handle privacy, and uses different slug generation. `communities` has role management but broken. This split creates inconsistent behavior.
- **Impact:** Same data model, different rules. Clients using one API bypass the other's protections.

---

### F35. `CommunityService` (community module) is a god service
- **File:** `apps/api/src/modules/community/community.service.ts`
- **Severity:** P2 — ARCHITECTURE
- **Category:** Single Responsibility
- **Description:** One service handles 12 different features: local boards, mentorship, study circles, fatwa Q&A, volunteer opportunities, Islamic events, reputation, voice posts, watch parties, collections, waqf, kindness check, and data export. At 311 lines, it's manageable, but features are intermingled with no domain separation.

---

### F36. `reputation.score` can go negative via `updateReputation` with negative delta
- **File:** `apps/api/src/modules/community/community.service.ts`, line 188
- **Severity:** P2 — DATA INTEGRITY
- **Category:** Counter Integrity
- **Description:** `updateReputation()` uses `{ increment: delta }` where `delta` can be negative. The `create` path uses `Math.max(0, delta)` but the `update` path uses raw increment. If score is 10 and delta is -50, score becomes -40.

---

## TIER 3 — LOW SEVERITY (26 findings)

### F37. `events.service.ts` imports DTOs from controller file
- **File:** `apps/api/src/modules/events/events.service.ts`, line 10
- **Severity:** P3 — CODE QUALITY
- **Category:** Import Direction
- **Description:** `import { CreateEventDto, UpdateEventDto } from './events.controller'` — services should not import from controllers. This inverts the dependency direction.

---

### F38. `getBoards` cursor uses `id: { lt: cursor }` — wrong cursor type
- **File:** `apps/api/src/modules/community/community.service.ts`, line 21
- **Severity:** P3 — PAGINATION
- **Category:** Cursor Logic
- **Description:** Uses `{ id: { lt: cursor } }` where cursor is expected to be an ID string. Combined with `orderBy: { membersCount: 'desc' }`, this is comparing IDs lexicographically which doesn't produce correct pagination for CUID/UUID IDs.

---

### F39. `getStudyCircles` cursor uses `id: { lt: cursor }` — same as F38
- **File:** `apps/api/src/modules/community/community.service.ts`, line 84

---

### F40. `getFatwaQuestions` cursor uses `id: { lt: cursor }` — same as F38
- **File:** `apps/api/src/modules/community/community.service.ts`, line 107

---

### F41. `getOpportunities` cursor uses `id: { lt: cursor }` — same as F38
- **File:** `apps/api/src/modules/community/community.service.ts`, line 142

---

### F42. `getVoicePosts` cursor uses `id: { lt: cursor }` — same as F38
- **File:** `apps/api/src/modules/community/community.service.ts`, line 215

---

### F43. `getWaqfFunds` cursor uses `id: { lt: cursor }` — same as F38
- **File:** `apps/api/src/modules/community/community.service.ts`, line 274

---

### F44. Halal restaurant pagination uses `createdAt` cursor but returns sorted by distance
- **File:** `apps/api/src/modules/halal/halal.service.ts`, lines 27-44
- **Severity:** P3 — PAGINATION
- **Category:** Data Access
- **Description:** The query uses `createdAt: { lt: cursor }` for pagination but then re-sorts results by distance client-side. This means page 2 could contain restaurants closer than page 1 results, producing a confusing UX. Distance-sorted pagination needs a different approach (e.g., cursor based on distance).

---

### F45. `mosques.service.ts` `getFeed` hasMore uses `length === limit` heuristic
- **File:** `apps/api/src/modules/mosques/mosques.service.ts`, line 101
- **Severity:** P3 — PAGINATION
- **Category:** Off-by-one
- **Description:** Uses `posts.length === limit` to determine `hasMore`. If exactly `limit` records exist, `hasMore` is true even though there are no more. Standard pattern is `take: limit + 1` and check if more than `limit` returned.

---

### F46. Same heuristic bug in `mosques.service.ts:133` for `getMembers`
- **File:** `apps/api/src/modules/mosques/mosques.service.ts`, line 133

---

### F47. Same heuristic bug in `halal.service.ts:45` for `findNearby`
- **File:** `apps/api/src/modules/halal/halal.service.ts`, line 45

---

### F48. Same heuristic bug in `halal.service.ts:142` for `getReviews`
- **File:** `apps/api/src/modules/halal/halal.service.ts`, line 142

---

### F49. Halal review: NaN latitude/longitude from query params
- **File:** `apps/api/src/modules/halal/halal.controller.ts`, lines 57-60
- **Severity:** P3 — INPUT VALIDATION
- **Category:** Type Coercion
- **Description:** `parseFloat(lat)` and `parseFloat(lng)` can produce `NaN` if the user sends non-numeric strings. No validation or default handling.
- **Same issue in:** `mosques.controller.ts:47-49`

---

### F50. Mosque `findNearby` uses `parseInt` for radius — loses decimal precision
- **File:** `apps/api/src/modules/mosques/mosques.controller.ts`, line 50
- **Severity:** P3 — MINOR BUG
- **Description:** `parseInt(radius, 10)` truncates decimal radius values. Should be `parseFloat()` for consistency.

---

### F51. No coordinate validation on mosque/halal/board creation
- **Files:**
  - `mosques.controller.ts` — `latitude`/`longitude` accept any number
  - `halal.controller.ts` — same
  - `community.dto.ts` — `CreateBoardDto` has no lat/lng fields at all (DTO missing, but service accepts them)
- **Severity:** P3 — INPUT VALIDATION
- **Description:** No `@Min(-90) @Max(90)` on latitude, no `@Min(-180) @Max(180)` on longitude. Invalid coordinates (e.g., lat=999) will produce incorrect Haversine calculations.

---

### F52. `CreateBoardDto` missing `lat`/`lng` fields
- **File:** `apps/api/src/modules/community/dto/community.dto.ts`, lines 7-12
- **Severity:** P3 — DTO MISMATCH
- **Description:** `CreateBoardDto` has `name`, `description`, `city`, `country` but not `lat`/`lng`. However, `CommunityService.createBoard()` spreads the DTO to `prisma.localBoard.create()`, and the `LocalBoard` schema has `lat Float?` and `lng Float?`. The fields are optional in the schema, but they can never be set via the DTO.

---

### F53. `CreateStudyCircleDto` missing `isOnline` and `maxMembers` fields
- **File:** `apps/api/src/modules/community/dto/community.dto.ts`, line 24-29
- **Severity:** P3 — DTO MISMATCH
- **Description:** DTO has `title`, `description`, `topic`, `schedule` but not `isOnline` or `maxMembers`. The service method signature accepts these fields, and the schema supports them, but they can never be set via API.

---

### F54. `CreateOpportunityDto.date` is a string, not validated as ISO date
- **File:** `apps/api/src/modules/community/dto/community.dto.ts`, line 46
- **Severity:** P3 — INPUT VALIDATION
- **Description:** `date` is `@IsString()` but not `@IsISO8601()`. Invalid date strings will produce `Invalid Date` objects when `new Date(dto.date)` is called in the service.

---

### F55. `CreateEventDto` in community module: `startDate` is string, not validated
- **File:** `apps/api/src/modules/community/dto/community.dto.ts`, line 55
- **Severity:** P3 — INPUT VALIDATION
- **Description:** Same as F54. `startDate` and `endDate` are `@IsString()` but not `@IsISO8601()`.

---

### F56. `CreateVoicePostDto.audioUrl` not validated as URL
- **File:** `apps/api/src/modules/community/dto/community.dto.ts`, line 62
- **Severity:** P3 — INPUT VALIDATION / SSRF
- **Description:** `audioUrl` is `@IsString()` but not `@IsUrl()`. Could store arbitrary strings or SSRF targets.

---

### F57. Community slug uniqueness race condition
- **File:** `apps/api/src/modules/communities/communities.service.ts`, lines 91-95
- **Severity:** P3 — RACE CONDITION
- **Category:** Concurrency
- **Description:** `create()` checks for slug uniqueness via `findUnique`, then creates. Two concurrent requests with the same name will both pass the check and one will get a P2002 unique constraint error that is unhandled.
- **Fix:** Wrap in try/catch for P2002 or use `createMany` with `skipDuplicates`.

---

### F58. `CreateCircleDto.memberIds` validates UUID v4 but core models use CUID
- **File:** `apps/api/src/modules/circles/dto/create-circle.dto.ts`, line 13
- **Severity:** P3 — VALIDATION MISMATCH
- **Description:** `@IsUUID('4', { each: true })` but the project uses CUID for core models (like User). CUIDs are not UUIDs. This validation would reject valid user IDs.
- **Same issue in:** `ManageMembersDto` at line 7

---

### F59. `circles.service.ts:44` — `memberIds` may contain non-existent user IDs
- **File:** `apps/api/src/modules/circles/circles.service.ts`, line 31
- **Severity:** P3 — DATA INTEGRITY
- **Description:** `create()` accepts `memberIds` and creates `CircleMember` rows without verifying the user IDs exist. Non-existent user IDs will fail with a foreign key constraint violation (P2003).

---

### F60. `CommunityNote` — self-rating possible (author rates own note)
- **File:** `apps/api/src/modules/community-notes/community-notes.service.ts`, line 27
- **Severity:** P3 — INTEGRITY
- **Description:** `rateNote()` doesn't check if `userId === note.authorId`. Authors can rate their own notes as "helpful" to boost approval.

---

### F61. `CommunitiesModule` does not import `PrismaModule`
- **File:** `apps/api/src/modules/communities/communities.module.ts`, line 6
- **Severity:** P3 — DEPENDENCY
- **Description:** `imports: []` is empty — relies on PrismaService being globally provided. If PrismaModule is not global, the service will fail to inject.
- **Same issue in:** `CirclesModule`, `CommunityNotesModule`, `EventsModule`, `MosquesModule`, `ScholarQAModule`, `HalalModule`
- **Note:** If `PrismaModule` is registered as `@Global()`, this is not a bug. But it creates fragile coupling.

---

### F62. Events `listEvents` pagination uses cursor-based with `skip: 1` — may miss records
- **File:** `apps/api/src/modules/events/events.service.ts`, line 108
- **Severity:** P3 — PAGINATION
- **Description:** Uses Prisma's `cursor: { id: cursor }, skip: 1` pattern which can skip records if the cursor record was deleted between requests.

---

## Summary

| Tier | Count | Category Breakdown |
|------|-------|--------------------|
| P0 — Ship Blockers | 8 | 1 crash (prisma.community), 1 dead code (role routes), 1 route bug (events double-prefix), 1 broken feature (watch parties), 4 auth bypasses (forum/webhook/stage/mosque feed) |
| P1 — High Severity | 12 | 3 missing auth checks (fatwa/scholar), 2 vote manipulation (scholar QA/halal verify), 3 counter integrity, 2 race conditions, 1 referential integrity, 1 logic error |
| P2 — Medium Severity | 16 | 2 privacy issues, 2 route bugs, 4 input validation, 2 architecture, 2 data integrity, 1 GDPR, 1 schema mismatch, 1 slug bug, 1 rate limiting |
| P3 — Low Severity | 26 | 8 pagination bugs, 6 input validation, 4 DTO mismatches, 3 data integrity, 2 coordination, 2 code quality, 1 dependency |
| **Total** | **62** | |

### Top 5 Actions (highest ROI)

1. **Fix `prisma.community` → `prisma.circle`** in `requireAdmin()` (F01) — 1 line fix, unblocks all role management
2. **Add membership checks to discord-features** (F05-F07, F18) — prevents non-members from polluting community content
3. **Fix events controller prefix** (F03) — 1 word change, unblocks all event functionality
4. **Add scholar verification** to fatwa/Q&A endpoints (F09-F10) — critical for Islamic platform trust
5. **Fix watch party activation** (F04) — add start endpoint or change default to `true`
