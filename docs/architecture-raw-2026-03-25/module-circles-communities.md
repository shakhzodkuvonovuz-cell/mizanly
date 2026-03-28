# Module Architecture: Circles, Communities, Community Notes, Community

Extraction date: 2026-03-25
Scope: 4 NestJS modules covering circle/community management, community notes, and community features (boards, mentorship, fatwa, volunteer, events, voice posts, watch parties, collections, waqf, kindness, data export).

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Circles Module](#2-circles-module)
3. [Communities Module](#3-communities-module)
4. [Community Notes Module](#4-community-notes-module)
5. [Community Module (Broad Features)](#5-community-module-broad-features)
6. [Prisma Schema Models & Enums](#6-prisma-schema-models--enums)
7. [Cross-Module Dependencies](#7-cross-module-dependencies)
8. [Test Coverage Summary](#8-test-coverage-summary)
9. [Known Issues & Gaps](#9-known-issues--gaps)

---

## 1. Module Overview

| Module | Path | Controller | Service | DTOs | Tests | Purpose |
|--------|------|-----------|---------|------|-------|---------|
| CirclesModule | `modules/circles/` | CirclesController | CirclesService | 3 (CreateCircle, UpdateCircle, ManageMembers) | 2 spec files | Private, user-owned friend groups (like Instagram Close Friends) |
| CommunitiesModule | `modules/communities/` | CommunitiesController | CommunitiesService | 2 (CreateCommunity, UpdateCommunity) | 4 spec files | Public/private communities with roles, rules, moderation (like Discord servers) |
| CommunityNotesModule | `modules/community-notes/` | CommunityNotesController | CommunityNotesService | 2 inline (CreateNote, RateNote) | 2 spec files | X/Twitter-style community notes: propose, rate, auto-promote/dismiss |
| CommunityModule | `modules/community/` | CommunityController | CommunityService | 12 exported DTOs | 3 spec files | Broad community features: boards, mentorship, study circles, fatwa, volunteer, events, voice posts, watch parties, collections, waqf, kindness check, data export |

**Key Design Decision:** Both CirclesModule and CommunitiesModule operate on the same Prisma `Circle` model but serve different user-facing features. CirclesModule is for private friend lists (1:many owner->circles), CommunitiesModule is for public/private community groups with roles and moderation.

---

## 2. Circles Module

### 2.1 Module Definition

**File:** `apps/api/src/modules/circles/circles.module.ts` (16 lines)

```
Imports: [NotificationsModule]
Controllers: [CirclesController]
Providers: [CirclesService]
Exports: [CirclesService]
```

### 2.2 Controller — CirclesController

**File:** `apps/api/src/modules/circles/circles.controller.ts` (62 lines)

- **Class-level decorators:** `@ApiTags('Circles')`, `@Throttle({ default: { limit: 60, ttl: 60000 } })`, `@Controller('circles')`, `@UseGuards(ClerkAuthGuard)`, `@ApiBearerAuth()`
- All endpoints require authentication (class-level ClerkAuthGuard).

| # | Method | Route | Handler | Throttle Override | Auth | Line |
|---|--------|-------|---------|-------------------|------|------|
| 1 | GET | `/circles` | `getMyCircles(userId)` | — (60/min class default) | Required | L19-21 |
| 2 | POST | `/circles` | `create(userId, dto)` | 10/min | Required | L23-28 |
| 3 | PUT | `/circles/:id` | `update(id, userId, dto)` | — | Required | L30-34 |
| 4 | DELETE | `/circles/:id` | `delete(id, userId)` | — | Required | L36-38 |
| 5 | GET | `/circles/:id/members` | `getMembers(id, userId, cursor?)` | — | Required | L40-48 |
| 6 | POST | `/circles/:id/members` | `addMembers(id, userId, dto)` | — | Required | L50-54 |
| 7 | DELETE | `/circles/:id/members` | `removeMembers(id, userId, dto)` | — | Required | L56-60 |

### 2.3 Service — CirclesService

**File:** `apps/api/src/modules/circles/circles.service.ts` (198 lines)

**Dependencies injected:**
- `PrismaService` — database access
- `NotificationsService` — sends CIRCLE_INVITE notifications when members are added

**Helper function (module-level, L6-15):**
```
generateSlug(name: string): string
```
- Lowercases, strips non-word chars, replaces spaces with hyphens, truncates to 50 chars, appends 5-char random suffix.

#### Service Methods

| # | Method | Signature | Lines | Description |
|---|--------|-----------|-------|-------------|
| 1 | `getMyCircles` | `(userId: string)` | L25-32 | Returns circles owned by user. `findMany` where `ownerId`, includes `_count.members`, ordered by `createdAt asc`, max 50. |
| 2 | `create` | `(userId: string, name: string, memberIds?: string[])` | L34-77 | Creates circle with owner as first member. Enforces **50 circles per user** limit (L37). Filters owner from memberIds (L41). Retries slug generation up to 3 times on P2002 collision (L45-73). Sets `membersCount` = 1 + extra members. |
| 3 | `update` | `(circleId: string, userId: string, name?: string)` | L79-84 | Owner-only. Updates name if provided. |
| 4 | `delete` | `(circleId: string, userId: string)` | L86-91 | Owner-only. Deletes circle (cascades via Prisma). |
| 5 | `addMembers` | `(circleId: string, userId: string, memberIds: string[])` | L93-150 | Owner-only. Validates users exist (not deleted/banned, L99-107). Filters blocked users bidirectionally (L110-126). Uses `createMany` with `skipDuplicates`. Atomic `membersCount` increment via raw SQL (L135). Sends CIRCLE_INVITE notification to each added member (capped at 50, fire-and-forget, L138-146). Returns `{ added: count }`. |
| 6 | `removeMembers` | `(circleId: string, userId: string, memberIds: string[])` | L152-173 | Owner-only. Prevents removing the owner (L158). `deleteMany` then atomic decrement with `GREATEST(membersCount - count, 1)` (L169). Returns `{ removed: count }`. |
| 7 | `getMembers` | `(circleId: string, userId: string, cursor?: string, limit = 20)` | L175-197 | Owner-only. Cursor-based keyset pagination using composite PK `circleId_userId`. Returns `{ data, meta: { cursor, hasMore } }`. Includes user select: id, username, displayName, avatarUrl. |

### 2.4 DTOs

**CreateCircleDto** (`dto/create-circle.dto.ts`, 17 lines)
| Field | Type | Validators | Required |
|-------|------|-----------|----------|
| `name` | string | `@IsString()`, `@MaxLength(30)` | Yes |
| `memberIds` | string[] | `@IsArray()`, `@IsString({ each: true })`, `@MaxLength(50, { each: true })`, `@ArrayMaxSize(100)` | No |

**UpdateCircleDto** (`dto/update-circle.dto.ts`, 10 lines)
| Field | Type | Validators | Required |
|-------|------|-----------|----------|
| `name` | string | `@IsString()`, `@MaxLength(30)` | No |

**ManageMembersDto** (`dto/manage-members.dto.ts`, 12 lines)
| Field | Type | Validators | Required |
|-------|------|-----------|----------|
| `memberIds` | string[] | `@IsArray()`, `@IsString({ each: true })`, `@MaxLength(50, { each: true })`, `@ArrayMinSize(1)`, `@ArrayMaxSize(100)` | Yes |

---

## 3. Communities Module

### 3.1 Module Definition

**File:** `apps/api/src/modules/communities/communities.module.ts` (19 lines)

```
Imports: [] (none — no NotificationsModule imported)
Controllers: [CommunitiesController]
Providers: [CommunitiesService]
Exports: [CommunitiesService]
```

### 3.2 Controller — CommunitiesController

**File:** `apps/api/src/modules/communities/communities.controller.ts` (120 lines)

- **Class-level decorators:** `@ApiTags('Communities')`, `@Controller('communities')`
- Mixed auth: some endpoints require ClerkAuthGuard, others use OptionalClerkAuthGuard.

| # | Method | Route | Handler | Throttle | Auth | Line |
|---|--------|-------|---------|----------|------|------|
| 1 | POST | `/communities` | `create(userId, dto)` | 10/min | Required | L29-35 |
| 2 | GET | `/communities` | `list(viewerId?, cursor?, limit)` | — | Optional | L37-46 |
| 3 | GET | `/communities/:id` | `getById(id, viewerId?)` | — | Optional | L48-56 |
| 4 | PATCH | `/communities/:id` | `update(id, userId, dto)` | 10/min | Required | L58-69 |
| 5 | DELETE | `/communities/:id` | `delete(id, userId)` | 10/min | Required | L71-82 |
| 6 | POST | `/communities/:id/join` | `join(id, userId)` | 10/min | Required | L84-94 |
| 7 | DELETE | `/communities/:id/leave` | `leave(id, userId)` | 10/min | Required | L96-107 |
| 8 | GET | `/communities/:id/members` | `listMembers(id, viewerId?, cursor?, limit)` | — | Optional | L109-119 |

### 3.3 Service — CommunitiesService

**File:** `apps/api/src/modules/communities/communities.service.ts` (470 lines)

**Dependencies injected:**
- `PrismaService` — database access

**Select constants (L14-54):**
- `CIRCLE_SELECT` — 14 fields including owner relation (id, username, displayName, avatarUrl, isVerified)
- `CIRCLE_MEMBER_SELECT` — circleId, userId, role, joinedAt, user (id, username, displayName, avatarUrl, isVerified)

#### Private Helper Methods

| Method | Signature | Lines | Purpose |
|--------|-----------|-------|---------|
| `generateSlug` | `(name: string): string` | L63-76 | Unicode-aware slug: preserves Arabic chars (`\u0600-\u06FF`, `\u0750-\u077F`, `\u08A0-\u08FF`). Max 100 chars. Falls back to random `community-xxxxx` if all chars stripped. |
| `checkUserPermission` | `(circleId, userId): Promise<boolean>` | L79-85 | Checks if user has OWNER, ADMIN, or MODERATOR role in community. |
| `isOwner` | `(circleId, userId): Promise<boolean>` | L88-94 | Checks circle.ownerId match. |
| `requireAdmin` | `(communityId, userId)` | L452-469 | Throws NotFoundException or ForbiddenException. Owner always passes. Otherwise requires ADMIN role (not MODERATOR). |

#### CRUD Methods

| # | Method | Signature | Lines | Description |
|---|--------|-----------|-------|-------------|
| 1 | `create` | `(userId, dto: CreateCommunityDto)` | L97-134 | Generates slug, checks uniqueness. Maps `dto.isPrivate` to `CirclePrivacy.PRIVATE`/`PUBLIC`. Creates circle with owner as OWNER-role member. Catches P2002 as ConflictException. Returns `{ data, success, timestamp }`. |
| 2 | `list` | `(viewerId?, cursor?, limit = 20)` | L137-182 | Guests: PUBLIC only. Authenticated: PUBLIC + any where member (fetches memberCircleIds, max 50). Excludes banned. Cursor by `createdAt` (date string). Returns `{ data, meta: { cursor, hasMore }, success, timestamp }`. |
| 3 | `getById` | `(id, viewerId?)` | L185-209 | Throws NotFoundException if missing/banned. PRIVATE and INVITE_ONLY require membership check. |
| 4 | `update` | `(id, userId, dto: UpdateCommunityDto)` | L212-248 | Owner always allowed. Admin/Moderator checked via `checkUserPermission`. Updates name (+ regenerates slug), description, coverUrl, rules, privacy. |
| 5 | `delete` | `(id, userId)` | L251-265 | Owner-only (no admin override). |
| 6 | `join` | `(id, userId)` | L268-305 | Checks community not banned. Idempotent check — throws ConflictException if already member. INVITE_ONLY and PRIVATE throw ForbiddenException. Uses `$transaction` to create member (MEMBER role) + increment `membersCount`. |
| 7 | `leave` | `(id, userId)` | L308-344 | Owner cannot leave (must transfer ownership first). Checks membership exists. `$transaction` to delete member + decrement. Safety: `updateMany` to clamp membersCount >= 0 (L338-341). |
| 8 | `listMembers` | `(id, viewerId?, cursor?, limit = 50)` | L347-394 | Privacy check for PRIVATE/INVITE_ONLY. Cursor by `joinedAt` (date string). Ordered by joinedAt asc. |

#### Role Management Methods (L396-469)

| # | Method | Signature | Lines | Description |
|---|--------|-----------|-------|-------------|
| 9 | `createRole` | `(communityId, userId, data)` | L398-409 | Requires admin (via `requireAdmin`). Auto-positions at end (`count`). Creates `CommunityRole`. Data fields: name, color, 8 permission booleans. |
| 10 | `updateRole` | `(roleId, userId, data)` | L411-435 | Requires admin of role's community. Whitelist-only field update (prevents injection). |
| 11 | `deleteRole` | `(roleId, userId)` | L437-442 | Requires admin. Deletes by ID. |
| 12 | `listRoles` | `(communityId)` | L444-450 | No auth check. Returns roles ordered by position, max 50. |

**NOTE:** Role management methods (createRole, updateRole, deleteRole, listRoles) exist in the service but have NO corresponding controller endpoints. They are only accessible programmatically, not via REST API.

### 3.4 DTOs

**CreateCommunityDto** (`dto/create-community.dto.ts`, 31 lines)
| Field | Type | Validators | Required |
|-------|------|-----------|----------|
| `name` | string | `@IsString()`, `@MaxLength(100)` | Yes |
| `description` | string | `@IsString()`, `@MaxLength(1000)` | No |
| `coverUrl` | string | `@IsUrl()` | No |
| `rules` | string | `@IsString()`, `@MaxLength(2000)` | No |
| `isPrivate` | boolean | `@IsBoolean()`, default false | No |

**UpdateCommunityDto** (`dto/update-community.dto.ts`, 32 lines)
| Field | Type | Validators | Required |
|-------|------|-----------|----------|
| `name` | string | `@IsString()`, `@MaxLength(100)` | No |
| `description` | string | `@IsString()`, `@MaxLength(1000)` | No |
| `coverUrl` | string | `@IsUrl()` | No |
| `rules` | string | `@IsString()`, `@MaxLength(2000)` | No |
| `isPrivate` | boolean | `@IsBoolean()` | No |

---

## 4. Community Notes Module

### 4.1 Module Definition

**File:** `apps/api/src/modules/community-notes/community-notes.module.ts` (9 lines)

```
Imports: [] (none)
Controllers: [CommunityNotesController]
Providers: [CommunityNotesService]
Exports: [] (none)
```

### 4.2 Controller — CommunityNotesController

**File:** `apps/api/src/modules/community-notes/community-notes.controller.ts` (67 lines)

- **Class-level decorators:** `@ApiTags('Community Notes')`, `@ApiBearerAuth()`, `@Controller('community-notes')`
- DTOs defined inline in the controller file (not separate DTO files).

**Inline DTOs (L10-18):**

```
CreateNoteDto:
  contentType: string — @IsIn(['post', 'thread', 'reel'])
  contentId: string — @MaxLength(50)
  note: string — @MaxLength(2000)

RateNoteDto:
  rating: string — @IsIn(['helpful', 'somewhat_helpful', 'not_helpful'])
```

| # | Method | Route | Handler | Throttle | Auth | Line |
|---|--------|-------|---------|----------|------|------|
| 1 | POST | `/community-notes` | `createNote(userId, dto)` | 10/min | Required | L27-32 |
| 2 | GET | `/community-notes/:contentType/:contentId` | `getNotesForContent(contentType, contentId)` | — | Optional | L34-42 |
| 3 | GET | `/community-notes/:contentType/:contentId/helpful` | `getHelpfulNotes(contentType, contentId)` | — | Optional | L44-52 |
| 4 | POST | `/community-notes/:noteId/rate` | `rateNote(userId, noteId, dto)` | 30/min | Required | L54-65 |

### 4.3 Service — CommunityNotesService

**File:** `apps/api/src/modules/community-notes/community-notes.service.ts` (94 lines)

**Dependencies injected:**
- `PrismaService`

**Imports from Prisma:** `EmbeddingContentType`, `NoteRating`, `CommunityNoteStatus`

#### Service Methods

| # | Method | Signature | Lines | Description |
|---|--------|-----------|-------|-------------|
| 1 | `createNote` | `(authorId, contentType, contentId, note)` | L9-29 | Validates contentType in ['post', 'thread', 'reel']. Verifies content exists via direct Prisma lookup on Post/Thread/Reel. Creates CommunityNote with status PROPOSED. |
| 2 | `getNotesForContent` | `(contentType, contentId)` | L31-37 | Returns up to 10 notes ordered by `helpfulVotes desc`. |
| 3 | `rateNote` | `(userId, noteId, rating)` | L39-85 | Validates rating in ['NOTE_HELPFUL', 'NOTE_SOMEWHAT_HELPFUL', 'NOTE_NOT_HELPFUL']. Self-rating prevented (L49). Duplicate rating throws ConflictException (L55). Creates CommunityNoteRating. Increments helpfulVotes or notHelpfulVotes (somewhat_helpful is neutral — no increment, L63). **Auto-promote/dismiss logic (L74-82):** When totalVotes >= 5, if helpfulRatio >= 0.6 → status = HELPFUL, else status = NOT_HELPFUL. |
| 4 | `getHelpfulNotes` | `(contentType, contentId)` | L87-93 | Returns up to 3 notes with status = HELPFUL, ordered by helpfulVotes desc. |

**Rating threshold logic:**
- Total votes needed: 5
- Helpful ratio threshold: 60%
- If >= 60% helpful → note becomes HELPFUL (visible as approved)
- If < 60% helpful → note becomes NOT_HELPFUL (dismissed)
- `NOTE_SOMEWHAT_HELPFUL` rating counts toward total vote count but does NOT increment either counter

**BUG NOTE:** The controller DTO accepts 'helpful'/'somewhat_helpful'/'not_helpful' but the service validates against 'NOTE_HELPFUL'/'NOTE_SOMEWHAT_HELPFUL'/'NOTE_NOT_HELPFUL'. This means the DTO validation passes but service validation fails — the rating values don't match.

---

## 5. Community Module (Broad Features)

### 5.1 Module Definition

**File:** `apps/api/src/modules/community/community.module.ts` (12 lines)

```
Imports: [NotificationsModule]
Controllers: [CommunityController]
Providers: [CommunityService]
Exports: [CommunityService]
```

### 5.2 Controller — CommunityController

**File:** `apps/api/src/modules/community/community.controller.ts` (225 lines)

- **Class-level decorators:** `@ApiTags('Community')`, `@ApiBearerAuth()`, `@Controller()` (empty prefix — routes at root), `@Throttle({ default: { ttl: 60000, limit: 30 } })`
- **IMPORTANT:** No route prefix — all routes are directly under `/api/v1/` (e.g., `/api/v1/boards`, `/api/v1/mentorship/request`).

| # | Method | Route | Handler | Throttle | Auth | Line |
|---|--------|-------|---------|----------|------|------|
| **Local Boards** | | | | | | |
| 1 | POST | `/boards` | `createBoard(userId, dto)` | 30/min (class) | Required | L27-31 |
| 2 | GET | `/boards` | `getBoards(city?, country?, cursor?)` | 30/min | Optional | L33-39 |
| **Mentorship** | | | | | | |
| 3 | POST | `/mentorship/request` | `requestMentorship(userId, dto)` | 30/min | Required | L43-47 |
| 4 | PATCH | `/mentorship/:menteeId/respond` | `respondMentorship(userId, menteeId, dto)` | 30/min | Required | L49-54 |
| 5 | GET | `/mentorship/me` | `getMyMentorships(userId)` | 30/min | Required | L56-61 |
| **Study Circles** | | | | | | |
| 6 | POST | `/study-circles` | `createStudyCircle(userId, dto)` | 30/min | Required | L65-70 |
| 7 | GET | `/study-circles` | `getStudyCircles(topic?, cursor?)` | 30/min | Optional | L72-78 |
| **Fatwa Q&A** | | | | | | |
| 8 | POST | `/fatwa` | `askFatwa(userId, dto)` | **5/min** | Required | L82-88 |
| 9 | GET | `/fatwa` | `getFatwaQuestions(status?, madhab?, cursor?)` | 30/min | Optional | L90-95 |
| 10 | POST | `/fatwa/:id/answer` | `answerFatwa(userId, id, dto)` | 30/min | Required | L97-102 |
| **Volunteer** | | | | | | |
| 11 | POST | `/volunteer` | `createOpportunity(userId, dto)` | 30/min | Required | L106-110 |
| 12 | GET | `/volunteer` | `getOpportunities(category?, cursor?)` | 30/min | Optional | L112-118 |
| **Islamic Events** | | | | | | |
| 13 | POST | `/events` | `createEvent(userId, dto)` | 30/min | Required | L122-126 |
| 14 | GET | `/events` | `getEvents(eventType?, cursor?)` | 30/min | Optional | L128-134 |
| **Reputation** | | | | | | |
| 15 | GET | `/reputation` | `getReputation(userId)` | 30/min | Required | L138-142 |
| **Voice Posts** | | | | | | |
| 16 | POST | `/voice-posts` | `createVoicePost(userId, dto)` | 30/min | Required | L147-151 |
| 17 | GET | `/voice-posts` | `getVoicePosts(cursor?)` | 30/min | Optional | L153-159 |
| **Watch Parties** | | | | | | |
| 18 | POST | `/watch-parties` | `createWatchParty(userId, dto)` | 30/min | Required | L163-167 |
| 19 | GET | `/watch-parties` | `getActiveWatchParties()` | 30/min | Optional | L169-175 |
| **Collections** | | | | | | |
| 20 | POST | `/collections` | `createCollection(userId, dto)` | 30/min | Required | L179-183 |
| 21 | GET | `/collections/me` | `getMyCollections(userId)` | 30/min | Required | L185-191 |
| **Waqf** | | | | | | |
| 22 | POST | `/waqf` | `createWaqf(userId, dto)` | 30/min | Required | L195-199 |
| 23 | GET | `/waqf` | `getWaqfFunds(cursor?)` | 30/min | Optional | L201-207 |
| **Safety** | | | | | | |
| 24 | POST | `/kindness-check` | `checkKindness(dto)` | 30/min | Required | L211-216 |
| **Data Export** | | | | | | |
| 25 | GET | `/data-export` | `getDataExport(userId)` | 30/min | Required | L218-223 |

### 5.3 Service — CommunityService

**File:** `apps/api/src/modules/community/community.service.ts` (360 lines)

**Dependencies injected:**
- `PrismaService`
- `NotificationsService` — used for mentorship and fatwa notifications

**Constants (L7):**
```ts
const USER_SELECT = { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true };
```

**Prisma enums imported (L3):** `FatwaTopicType`, `IslamicEventType`, `ReputationTier`, `ScholarTopicType`, `MadhhabType`, `VolunteerCategory`, `MentorshipStatus`, `FatwaStatus`, `ScholarVerificationStatus`

#### Service Methods — Detailed

##### Local Boards (L17-36)

| Method | Lines | Prisma Model | Details |
|--------|-------|-------------|---------|
| `createBoard(userId, dto)` | L19-21 | `localBoard` | Simple create. Fields: name, description?, city, country, lat?, lng?. Sets createdById. |
| `getBoards(city?, country?, cursor?, limit=20)` | L23-36 | `localBoard` | Filters by city/country. Ordered by membersCount desc. Cursor pagination by ID. Includes creator user. |

##### Mentorship (L38-90)

| Method | Lines | Prisma Model | Details |
|--------|-------|-------------|---------|
| `requestMentorship(menteeId, dto)` | L40-68 | `mentorship` | Self-mentor check. Verifies mentor exists. Casts topic to `FatwaTopicType`. Catches P2002 as ConflictException (unique constraint on [mentorId, menteeId]). Sends SYSTEM notification to mentor. |
| `respondMentorship(mentorId, menteeId, accept)` | L70-78 | `mentorship` | Composite PK lookup `mentorId_menteeId`. Must be MENTORSHIP_PENDING. Accept -> MENTORSHIP_ACTIVE + sets startedAt. Decline -> MENTORSHIP_CANCELLED. |
| `getMyMentorships(userId)` | L80-90 | `mentorship` | Parallel queries: as mentor (include mentee) + as mentee (include mentor). Max 50 each. Returns `{ asMentor, asMentee }`. |

##### Study Circles (L92-110)

| Method | Lines | Prisma Model | Details |
|--------|-------|-------------|---------|
| `createStudyCircle(userId, dto)` | L94-96 | `studyCircle` | Simple create. Sets leaderId. Casts topic to `ScholarTopicType`. Fields: title, description?, topic, schedule?, isOnline?, maxMembers?. |
| `getStudyCircles(topic?, cursor?, limit=20)` | L98-110 | `studyCircle` | Filters `isActive: true` + optional topic. Ordered by membersCount desc. Cursor pagination by ID. Includes leader user. |

##### Fatwa Q&A (L112-160)

| Method | Lines | Prisma Model | Details |
|--------|-------|-------------|---------|
| `askFatwa(userId, dto)` | L114-118 | `fatwaQuestion` | Creates question. Casts madhab to `MadhhabType`. Fields: question, madhab?, language?. |
| `getFatwaQuestions(status?, madhab?, cursor?, limit=20)` | L120-133 | `fatwaQuestion` | Optional filters. Ordered by createdAt desc. Cursor pagination. Includes asker user. |
| `answerFatwa(scholarId, questionId, answer)` | L135-160 | `fatwaQuestion` + `scholarVerification` | **Scholar verification required** — checks `ScholarVerification` for status `VERIFICATION_APPROVED` (L137-139). Question must exist and not be FATWA_ANSWERED. Updates question with answer, answeredBy, answeredAt. Sends SYSTEM notification to asker. |

##### Volunteer Opportunities (L162-185)

| Method | Lines | Prisma Model | Details |
|--------|-------|-------------|---------|
| `createOpportunity(userId, dto)` | L164-171 | `volunteerOpportunity` | Sets organizerId. Casts category to `VolunteerCategory`. Converts date string to Date. Fields: title, description, category, location?, lat?, lng?, date?, spotsTotal?. |
| `getOpportunities(category?, cursor?, limit=20)` | L173-185 | `volunteerOpportunity` | Filters `isActive: true` + optional category. Ordered by createdAt desc. Cursor pagination. Includes organizer user. |

##### Islamic Events (L187-211)

| Method | Lines | Prisma Model | Details |
|--------|-------|-------------|---------|
| `createEvent(userId, dto)` | L189-197 | `islamicEvent` | Sets organizerId. Casts eventType to `IslamicEventType`. Converts date strings. Fields: title, description?, eventType, location?, lat?, lng?, startDate, endDate?, isOnline?, streamUrl?, coverUrl?. |
| `getEvents(eventType?, cursor?, limit=20)` | L199-211 | `islamicEvent` | Filters future events only (`startDate >= now()`). Optional eventType filter. Ordered by startDate asc (soonest first). Cursor pagination. Includes organizer. |

##### Reputation (L213-245)

| Method | Lines | Prisma Model | Details |
|--------|-------|-------------|---------|
| `getReputation(userId)` | L215-219 | `userReputation` | Auto-creates if not found (default score 0). |
| `updateReputation(userId, delta, reason)` | L221-245 | `userReputation` | Upsert with increment. Clamps score >= 0. **Tier thresholds:** NEWCOMER (0-49), MEMBER (50-199), TRUSTED (200-499), GUARDIAN (500-999), ELDER (1000+). Note: `reason` parameter is accepted but not stored anywhere. |

##### Voice Posts (L247-267)

| Method | Lines | Prisma Model | Details |
|--------|-------|-------------|---------|
| `createVoicePost(userId, dto)` | L249-254 | `voicePost` | Fields: audioUrl, duration, transcript?. Includes user in response. |
| `getVoicePosts(cursor?, limit=20)` | L256-267 | `voicePost` | Ordered by createdAt desc. Cursor pagination. Includes user. |

##### Watch Parties (L269-289)

| Method | Lines | Prisma Model | Details |
|--------|-------|-------------|---------|
| `createWatchParty(userId, dto)` | L271-280 | `watchParty` | Verifies video exists and is PUBLISHED. Fields: videoId, title. Sets hostId, isActive=true. |
| `getActiveWatchParties()` | L282-289 | `watchParty` | Filters `isActive: true`. Ordered by viewerCount desc. Max 50. Includes host user. |

##### Shared Collections (L291-305)

| Method | Lines | Prisma Model | Details |
|--------|-------|-------------|---------|
| `createCollection(userId, dto)` | L293-297 | `sharedCollection` | Fields: name, description?, isPublic?. Sets createdById. |
| `getMyCollections(userId)` | L299-305 | `sharedCollection` | Filters by createdById. Ordered by updatedAt desc. Max 50. |

##### Waqf (L307-326)

| Method | Lines | Prisma Model | Details |
|--------|-------|-------------|---------|
| `createWaqf(userId, dto)` | L309-313 | `waqfFund` | Fields: title, description, goalAmount. Sets createdById. |
| `getWaqfFunds(cursor?, limit=20)` | L315-326 | `waqfFund` | Filters `isActive: true`. Ordered by raisedAmount desc (most funded first). Cursor pagination. Includes creator user. |

##### Content Safety (L328-337)

| Method | Lines | Details |
|--------|-------|---------|
| `checkKindness(text)` | L330-337 | Simple regex-based negativity detection. Pattern: `/\b(hate\|stupid\|idiot\|shut up\|kill\|die\|worst\|trash\|garbage\|loser)\b/i`. Returns `{ needsRephrase: boolean, suggestion?: string }`. No AI/ML — just word matching. |

##### Data Export (L339-359)

| Method | Lines | Details |
|--------|-------|---------|
| `getDataExport(userId)` | L339-359 | GDPR Article 15/20 compliance. Parallel fetches: user profile, posts (id, content, mediaUrls, createdAt), threads (id, content, createdAt), messages (id, content, createdAt). All capped at 10,000 per table. Returns `{ user, posts, threads, messages, exportedAt }`. |

### 5.4 DTOs

**File:** `apps/api/src/modules/community/dto/community.dto.ts` (87 lines)

All 12 DTOs exported:

| DTO | Fields | Line |
|-----|--------|------|
| `CreateBoardDto` | name (max 200), description? (max 1000), city (max 100), country (max 100) | L7-12 |
| `RequestMentorshipDto` | mentorId, topic (enum: new_muslim/quran/arabic/fiqh/general), notes? (max 1000) | L14-18 |
| `RespondMentorshipDto` | accept (boolean) | L20-22 |
| `CreateStudyCircleDto` | title (max 200), description? (max 1000), topic (enum: quran/hadith/fiqh/seerah/arabic/tafsir), schedule? (max 200) | L24-29 |
| `AskFatwaDto` | question (max 2000), madhab? (enum: hanafi/maliki/shafii/hanbali/any), language? (max 5) | L31-35 |
| `AnswerFatwaDto` | answer (max 5000) | L37-39 |
| `CreateOpportunityDto` | title (max 200), description (max 2000), category (max 50), location? (max 300), date?, spotsTotal? (1-1000) | L41-48 |
| `CreateEventDto` | title (max 200), description? (max 2000), eventType (max 30), location? (max 300), startDate, endDate?, isOnline?, coverUrl? | L50-59 |
| `CreateVoicePostDto` | audioUrl (@IsUrl), duration (1-300), transcript? (max 5000) | L61-65 |
| `CreateWatchPartyDto` | videoId, title (max 200) | L67-70 |
| `CreateCollectionDto` | name (max 100), description? (max 300), isPublic? | L72-76 |
| `CreateWaqfDto` | title (max 200), description (max 2000), goalAmount (1-10,000,000) | L78-82 |
| `KindnessCheckDto` | text (max 2000) | L84-86 |

---

## 6. Prisma Schema Models & Enums

### 6.1 Circle Model (schema.prisma L1832-1864)

```prisma
model Circle {
  id                  String              @id @default(cuid())
  name                String              @db.VarChar(100)
  slug                String              @unique
  description         String?             @db.VarChar(1000)
  avatarUrl           String?
  coverUrl            String?
  privacy             CirclePrivacy       @default(PUBLIC)
  ownerId             String
  owner               User                @relation(...)
  membersCount        Int                 @default(1)
  postsCount          Int                 @default(0)
  rules               String?
  isBanned            Boolean             @default(false)
  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt
  posts               Post[]
  threads             Thread[]
  members             CircleMember[]
  invites             CircleInvite[]
  notifications       Notification[]
  communityRoles      CommunityRole[]
  forumThreads        ForumThread[]
  webhooks            Webhook[]
  stageSessions       StageSession[]
  communityEvents     Event[]
  communityTreasuries CommunityTreasury[]

  @@index([slug])
  @@index([ownerId])
  @@index([privacy, membersCount(sort: Desc)])
  @@map("circles")
}
```

### 6.2 CircleMember Model (L1866-1877)

```prisma
model CircleMember {
  circleId String
  userId   String
  role     CircleRole @default(MEMBER)
  joinedAt DateTime   @default(now())
  circle   Circle     @relation(...)
  user     User       @relation(...)

  @@id([circleId, userId])           -- composite PK
  @@index([userId])
  @@map("circle_members")
}
```

### 6.3 CircleInvite Model (L1879-1894)

```prisma
model CircleInvite {
  id          String    @id @default(cuid())
  circleId    String
  code        String    @unique @default(cuid())
  createdById String
  maxUses     Int       @default(0)     -- 0 = unlimited
  useCount    Int       @default(0)
  expiresAt   DateTime?
  createdAt   DateTime  @default(now())
  circle      Circle    @relation(...)
  createdBy   User      @relation(...)

  @@index([circleId])
  @@index([createdById])
  @@map("circle_invites")
}
```

**NOTE:** CircleInvite model exists in schema but has NO service methods or controller endpoints in any of the 4 modules. The invite system is defined in the schema but not implemented.

### 6.4 CommunityRole Model (L4321-4340)

```prisma
model CommunityRole {
  id                String   @id @default(cuid())
  communityId       String
  community         Circle   @relation("communityRoles", ...)
  name              String   @db.VarChar(100)
  color             String?  @db.VarChar(7)
  position          Int      @default(0)
  canSendMessages   Boolean  @default(true)
  canPostMedia      Boolean  @default(true)
  canInvite         Boolean  @default(false)
  canKick           Boolean  @default(false)
  canBan            Boolean  @default(false)
  canManageRoles    Boolean  @default(false)
  canManageChannels Boolean  @default(false)
  canSpeak          Boolean  @default(true)
  createdAt         DateTime @default(now())

  @@index([communityId, position])
  @@map("community_roles")
}
```

### 6.5 CommunityNote Model (L4482-4499)

```prisma
model CommunityNote {
  id              String              @id @default(cuid())
  contentType     EmbeddingContentType
  contentId       String
  authorId        String
  author          User                @relation("communityNotes", ...)
  note            String
  status          CommunityNoteStatus @default(PROPOSED)
  helpfulVotes    Int                 @default(0)
  notHelpfulVotes Int                 @default(0)
  createdAt       DateTime            @default(now())
  ratings         CommunityNoteRating[]

  @@index([contentType, contentId])
  @@index([authorId])
  @@map("community_notes")
}
```

### 6.6 CommunityNoteRating Model (L4501-4513)

```prisma
model CommunityNoteRating {
  id        String        @id @default(cuid())
  noteId    String
  note      CommunityNote @relation(...)
  userId    String
  user      User          @relation("communityNoteRatings", ...)
  rating    NoteRating
  createdAt DateTime      @default(now())

  @@unique([noteId, userId])           -- one rating per user per note
  @@index([noteId])
  @@map("community_note_ratings")
}
```

### 6.7 Enums

| Enum | Values | Schema Line |
|------|--------|-------------|
| `CircleRole` | OWNER, ADMIN, MODERATOR, MEMBER | L187-192 |
| `CirclePrivacy` | PUBLIC, PRIVATE, INVITE_ONLY | L194-198 |
| `CommunityNoteStatus` | PROPOSED, HELPFUL, NOT_HELPFUL | L646-650 |
| `NoteRating` | NOTE_HELPFUL, NOTE_SOMEWHAT_HELPFUL, NOTE_NOT_HELPFUL | L630-634 |
| `ReputationTier` | NEWCOMER, MEMBER, TRUSTED, GUARDIAN, ELDER | L375-381 |

---

## 7. Cross-Module Dependencies

### 7.1 Import Graph

```
CirclesModule
  └── imports: NotificationsModule
       └── NotificationsService (used for CIRCLE_INVITE notifications)
  └── providers: PrismaService (global)

CommunitiesModule
  └── imports: [] (no external module imports)
  └── providers: PrismaService (global)

CommunityNotesModule
  └── imports: [] (no external module imports)
  └── providers: PrismaService (global)

CommunityModule
  └── imports: NotificationsModule
       └── NotificationsService (used for mentorship + fatwa answer notifications)
  └── providers: PrismaService (global)
```

### 7.2 Shared Prisma Models

| Prisma Model | Used By Modules |
|-------------|----------------|
| `Circle` | Circles, Communities |
| `CircleMember` | Circles, Communities |
| `CommunityRole` | Communities (service only, no controller endpoints) |
| `CircleInvite` | **None** (schema only) |
| `CommunityNote` | Community Notes |
| `CommunityNoteRating` | Community Notes |
| `LocalBoard` | Community |
| `Mentorship` | Community |
| `StudyCircle` | Community |
| `FatwaQuestion` | Community |
| `VolunteerOpportunity` | Community |
| `IslamicEvent` | Community |
| `UserReputation` | Community |
| `VoicePost` | Community |
| `WatchParty` | Community |
| `SharedCollection` | Community |
| `WaqfFund` | Community |
| `ScholarVerification` | Community (read-only, for fatwa answer auth) |
| `Post`, `Thread`, `Reel` | Community Notes (existence check) |
| `Video` | Community (watch party creation) |
| `User` | All modules (auth, relations) |
| `Block` | Circles (member filtering) |

### 7.3 Notification Types Emitted

| Module | Notification Type | Trigger | Target |
|--------|------------------|---------|--------|
| Circles | `CIRCLE_INVITE` | addMembers | Each added member (capped at 50) |
| Community | `SYSTEM` | requestMentorship | Mentor |
| Community | `SYSTEM` | answerFatwa | Question asker |

### 7.4 Auth Guards Used

| Guard | Modules Using |
|-------|--------------|
| `ClerkAuthGuard` | All 4 (required auth endpoints) |
| `OptionalClerkAuthGuard` | Communities, Community Notes, Community (public read endpoints) |

---

## 8. Test Coverage Summary

### 8.1 Circles Tests

**circles.controller.spec.ts** (127 lines, 7 tests)
- getMyCircles: delegates to service
- create: passes userId, name, memberIds
- update: passes id, userId, name
- delete: delegates + ForbiddenException propagation
- getMembers: delegates with cursor
- addMembers: passes memberIds
- removeMembers: passes memberIds

**circles.service.spec.ts** (315 lines, 13 tests)
- getMyCircles: returns owned circles
- create: with members, without members, filters duplicate owner ID
- update: owner success, NotFoundException, ForbiddenException
- delete: owner success, NotFoundException, ForbiddenException
- addMembers: success, NotFoundException, block filtering, all-blocked returns 0
- removeMembers: success, NotFoundException
- getMembers: success with pagination, NotFoundException

### 8.2 Communities Tests

**communities.controller.spec.ts** (138 lines, 8 tests)
- create, list, getById, update, delete, join, leave, listMembers — all delegation tests

**communities.service.spec.ts** (143 lines, 11 tests)
- create: success, duplicate slug
- list: guest (public only), authenticated (includes private)
- getById: public, missing/banned, private non-member
- update: owner success, non-owner/non-admin ForbiddenException
- delete: owner success, non-owner ForbiddenException
- join: public, already member ConflictException, invite-only ForbiddenException
- leave: success, owner cannot leave

**communities.service.edge.spec.ts** (111 lines, 6 tests)
- Arabic community name creation
- Non-existent community getById
- Empty members list
- Empty communities list
- Non-existent community delete (NotFoundException)
- Non-owner delete (ForbiddenException)

**communities.service.auth.spec.ts** (84 lines, 7 tests)
- Owner update: allowed
- Non-owner update: ForbiddenException
- Owner delete: allowed
- Non-owner delete: ForbiddenException
- Non-existent getById: NotFoundException
- Non-existent delete: NotFoundException
- Non-existent update: NotFoundException
- Empty members list

### 8.3 Community Notes Tests

**community-notes.controller.spec.ts** (85 lines, 4 tests)
- createNote: delegates all params
- getNotesForContent: delegates contentType + contentId
- getHelpfulNotes: delegates
- rateNote: delegates userId, noteId, rating

**community-notes.service.spec.ts** (126 lines, 11 tests)
- createNote: success, invalid content type, thread type, reel type
- getNotesForContent: returns array
- rateNote: success, invalid rating, missing note, duplicate rating (ConflictException)
- getHelpfulNotes: filters by HELPFUL status
- helpfulVotes increment on helpful rating
- notHelpfulVotes increment on not_helpful rating

### 8.4 Community Tests

**community.controller.spec.ts** (180 lines, 11 tests)
- createBoard, getBoards, requestMentorship, createStudyCircle, askFatwa, answerFatwa, createVoicePost, createWatchParty, getActiveWatchParties, checkKindness, getDataExport

**community.service.spec.ts** (347 lines, 24 tests)
- requestMentorship: success, self-mentorship (BadRequest), duplicate (P2002), mentor not found
- respondMentorship: accept, decline, not found, not pending
- reputation: default creation, tier update
- checkKindness: negative language flagged, positive passes
- getDataExport: complete data returned
- createVoicePost, createEvent, createBoard, getBoards (with/without data)
- createStudyCircle, askFatwa, getFatwaQuestions
- createOpportunity, getVoicePosts, createWaqf
- getMyMentorships: returns both roles
- answerFatwa: verified scholar success, non-verified ForbiddenException, missing question, already answered
- createWatchParty: published video, video not found, unpublished video
- getActiveWatchParties, createCollection, getMyCollections, getWaqfFunds

**community.service.cursor.spec.ts** (86 lines, 7 tests)
- Cursor pagination verification for: getBoards, getStudyCircles, getFatwaQuestions, getEvents, getVoicePosts, getWaqfFunds
- No-cursor case: cursor and skip both undefined

**Total test count across all 4 modules: ~97 tests across 11 spec files.**

---

## 9. Known Issues & Gaps

### 9.1 Bugs

1. **Community Notes rating DTO mismatch (L11-18 vs L40-43 in community-notes files):** Controller DTO validates `['helpful', 'somewhat_helpful', 'not_helpful']` but service validates `['NOTE_HELPFUL', 'NOTE_SOMEWHAT_HELPFUL', 'NOTE_NOT_HELPFUL']`. The incoming value will pass DTO validation but fail service validation.

2. **Fatwa answer stores answer text in `answerId` field (community.service.ts L147):** `answerId: answer` — the answer TEXT is stored in a field named `answerId`, which semantically looks like it should be an FK/relation ID.

3. **Reputation `reason` parameter unused (community.service.ts L221):** `updateReputation(userId, delta, reason)` accepts a `reason` string but never persists it. No audit trail for reputation changes.

4. **Reputation score can briefly go negative (L226-235):** The upsert increments first, then checks and clamps. In a race condition, a read between L222 and L232 could see a negative score.

### 9.2 Missing Features / Schema-Code Gaps

1. **CircleInvite model has no API endpoints.** The schema defines invite codes with maxUses, useCount, expiresAt, but no service methods exist to create, use, or list invites.

2. **CommunityRole CRUD has no controller endpoints.** The CommunitiesService has createRole, updateRole, deleteRole, listRoles methods, but the CommunitiesController does not expose them. They are only callable internally.

3. **No ownership transfer** for communities. Owner cannot leave (L316-317), and there is no transferOwnership method.

4. **No member role assignment.** Members always join as MEMBER. No endpoint to promote to ADMIN/MODERATOR or demote.

5. **No community ban/kick functionality** via API, despite CommunityRole having `canKick` and `canBan` permission fields.

6. **No community search endpoint.** Only list (paginated browse).

7. **Waqf contribution endpoint MISSING** (documented as critical bug in CLAUDE.md). The `POST /community/waqf/{id}/contribute` does not exist, so waqf donations cannot be processed.

8. **Watch party has no join/leave/sync endpoints.** Only create and list-active. No real-time sync for viewer position.

9. **Collection has no add-item/remove-item endpoints.** Only create and list-my. Cannot actually populate collections.

10. **Kindness check is regex-only.** No AI/ML sentiment analysis. Limited 10-word pattern list.

11. **Data export is missing many tables.** Only exports posts, threads, messages. Missing: reels, stories, bookmarks, likes, comments, follows, blocks, notifications, voice posts, circle memberships.

### 9.3 Architectural Notes

- **CirclesModule vs CommunitiesModule shared model:** Both modules operate on the `Circle` Prisma model. CirclesModule treats it as a lightweight friend list (private, owner-centric). CommunitiesModule treats it as a Discord-like community (public/private, roles, rules). This dual-use works because CirclePrivacy and CircleRole enums cover both use cases, but it could lead to data confusion if a circle created by CirclesModule is visible in CommunitiesModule's list endpoint.

- **CommunityModule has empty controller prefix:** `@Controller()` with no argument means all routes register at the API root (`/api/v1/boards`, `/api/v1/fatwa`, etc.). This could cause route conflicts with other modules.

- **Cursor pagination style varies:** CirclesModule uses composite PK cursor (`circleId_userId`). CommunitiesModule uses `createdAt` date string cursor. CommunityModule uses standard `id` cursor. Community Notes uses no pagination for reads (hardcoded `take: 10`).

- **CommunitiesService.list fetches member circle IDs with `take: 50`:** If a user is a member of more than 50 communities, private communities beyond the first 50 won't appear in the list.
