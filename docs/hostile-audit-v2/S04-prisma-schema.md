# S04 -- Prisma Schema Hostile Audit

**File:** `apps/api/prisma/schema.prisma` (5,415 lines, ~200 models, ~90 enums)
**Date:** 2026-04-05
**Auditor:** Opus 4.6

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 5 |
| HIGH | 14 |
| MEDIUM | 28 |
| LOW | 9 |
| INFO | 10 |
| **TOTAL** | **66** |

---

## 1. Missing Indexes on FK Fields

FK columns without indexes cause sequential scans on JOINs and cascading deletes.

### CRITICAL

| # | Finding | Model | Field | Why It Matters |
|---|---------|-------|-------|----------------|
| S04-C1 | **Missing index on `BroadcastMessage.senderId`** | BroadcastMessage | senderId | Queried when looking up a user's broadcast messages. Cascade delete on User must scan entire table without index. Only `@@index([channelId, createdAt])` exists. |
| S04-C2 | **Missing index on `Message.replyToId`** | Message | replyToId | Every reply-to lookup and SetNull cascade on parent message deletion requires full scan of messages table. High-volume table. |
| S04-C3 | **Missing index on `Message.forwardedFromId`** | Message | forwardedFromId | Forward chain lookups and SetNull cascades on original message require full scan. |
| S04-C4 | **Missing index on `Post.sharedPostId`** | Post | sharedPostId | Share chain traversal. `posts.service.ts` queries by `sharedPostId`. SetNull cascade on shared post requires full scan. |
| S04-C5 | **Missing index on `Reel.audioTrackId`** | Reel | audioTrackId | `reels.service.ts` and `feed.service.ts` query by `audioTrackId`. "Sounds" page lists all reels using a track -- scans entire reels table without this index. |

### HIGH

| # | Finding | Model | Field | Why It Matters |
|---|---------|-------|-------|----------------|
| S04-H1 | Missing index on `Reel.duetOfId` | Reel | duetOfId | `reels.service.ts` queries duets of a reel (2 query occurrences). SetNull cascade requires scan. |
| S04-H2 | Missing index on `Reel.stitchOfId` | Reel | stitchOfId | Same pattern as duetOfId. |
| S04-H3 | Missing index on `Message.pinnedById` | Message | pinnedById | SetNull cascade on user delete needs to find all messages pinned by that user. |
| S04-H4 | Missing index on `CallSession.screenShareUserId` | CallSession | screenShareUserId | SetNull cascade on user delete. |
| S04-H5 | Missing index on `SeriesEpisode.postId` | SeriesEpisode | postId | SetNull cascade on post delete. |
| S04-H6 | Missing index on `SeriesEpisode.reelId` | SeriesEpisode | reelId | SetNull cascade on reel delete. |
| S04-H7 | Missing index on `SeriesEpisode.videoId` | SeriesEpisode | videoId | SetNull cascade on video delete. |
| S04-H8 | Missing index on `ZakatFund.recipientId` | ZakatFund | recipientId | Cascade delete on user must find all their zakat funds. |

### MEDIUM

| # | Finding | Model | Field | Why It Matters |
|---|---------|-------|-------|----------------|
| S04-M1 | Missing index on `MosquePost.userId` | MosquePost | userId | User's mosque posts lookup, cascade delete. |
| S04-M2 | Missing index on `HalalRestaurant.addedById` | HalalRestaurant | addedById | SetNull cascade on user delete. |
| S04-M3 | Missing index on `FatwaQuestion.answeredBy` | FatwaQuestion | answeredBy | Scholar's answered fatwas lookup. SetNull cascade. |
| S04-M4 | Missing index on `ScholarQuestion.userId` | ScholarQuestion | userId | User's questions lookup, cascade delete. |
| S04-M5 | Missing index on `StageSession.hostId` | StageSession | hostId | Host's stage sessions lookup, cascade delete. |
| S04-M6 | `VoicePost` has `@@index([userId])` and `@@index([createdAt])` separately | VoicePost | userId+createdAt | Should be one composite `@@index([userId, createdAt(sort: Desc)])` instead of two separate indexes for "user's voice posts sorted by date" pattern. |
| S04-M7 | Missing index on `DhikrChallenge.userId` | DhikrChallenge | userId | Creator lookup. Only `@@index([createdAt])` exists. |
| S04-M8 | Missing index on `Challenge.createdById` | Challenge | createdById | Creator's challenges lookup. Only `@@index([isActive, endDate])` exists. |
| S04-M9 | Missing index on `Conversation.lastMessageById` | Conversation | lastMessageById | SetNull cascade on user delete. |

---

## 2. Missing Unique Constraints

### HIGH

| # | Finding | Model | Details |
|---|---------|-------|---------|
| S04-H9 | **`User.phone` should be unique** | User | `phone` is optional `String?` but has no unique constraint. Two users could register the same phone number. If phone-based login or contact sync is ever added (planned in Phase 5), this causes ambiguity. Add `@unique` or document why duplicates are acceptable. |
| S04-H10 | **`CallSession.livekitRoomName` should be unique** | CallSession | Has `@@index([livekitRoomName])` but no `@unique`. Two call sessions could reference the same LiveKit room name, causing data integrity issues. `livekitRoomSid` also lacks uniqueness. |

### MEDIUM

| # | Finding | Model | Details |
|---|---------|-------|---------|
| S04-M10 | `WaitlistEntry.referredBy` is `String?` not a relation | WaitlistEntry | Stores referral code as raw string with no FK to `WaitlistEntry.referralCode` or `User.referralCode`. Orphaned referral codes possible after deletion. Acceptable for a waitlist table but worth noting. |
| S04-M11 | `Experiment.id` has no `@default` | Experiment | Uses `String @id` without `@default(cuid())` or `@default(uuid())`. Requires caller to supply ID. Intentional (caller sets meaningful key) but fragile. |

---

## 3. Dangerous Cascade Rules

### HIGH -- Cascade Overkill

| # | Finding | Model | Relation | Risk |
|---|---------|-------|----------|------|
| S04-H11 | **`LiveSession.hostId onDelete: Cascade`** | LiveSession | host->User | Deleting a user nukes all their past live session records including participants, viewers, recording URLs. Should be `SetNull` to preserve historical data. |
| S04-H12 | **`AudioRoom.hostId onDelete: Cascade`** | AudioRoom | host->User | Same pattern. Historical audio room data and participant records lost on host deletion. Should be `SetNull`. |
| S04-H13 | **`CharityCampaign.userId onDelete: Cascade`** | CharityCampaign | user->User | Deleting a campaign creator cascades to delete ALL donation records. Financial records should NEVER cascade-delete. Should be `SetNull` for audit trail preservation. |
| S04-H14 | **`CommunityTreasury.createdById onDelete: Cascade`** | CommunityTreasury | creator->User | All community treasury contributions lost on creator deletion. Financial audit trail destroyed. Should be `SetNull`. |

### MEDIUM -- Cascade Chain Depth

| # | Finding | Chain | Risk |
|---|---------|-------|------|
| S04-M12 | **User -> Circle -> Post -> Comment -> CommentReaction** (4 levels) | Circle cascades | Deleting a circle owner cascades through Circle -> Posts -> Comments -> Reactions. Single user delete could trigger hundreds of thousands of row deletions in one transaction. PostgreSQL may timeout on large datasets. |
| S04-M13 | **User -> Channel -> Video -> VideoComment -> VideoCommentLike** (4 levels) | Channel cascades | Channel owner delete cascades through all their videos, comments, likes, bookmarks, watch history, subtitles, clips, end screens, AI captions, chapters, demographics, series episodes. Massive blast radius. |
| S04-M14 | `Challenge.createdById onDelete: Cascade` | Challenge | Deleting a user nukes the challenge AND all participant progress. 100 participants lose their data because the creator left. Should be `SetNull`. |
| S04-M15 | `DhikrChallenge.userId onDelete: Cascade` | DhikrChallenge | Same as M14. All participants' dhikr counts lost on creator deletion. |
| S04-M16 | `WaqfFund.createdById onDelete: Cascade` | WaqfFund | Waqf (Islamic endowment) fund and all donations deleted when creator account deleted. Waqf funds are meant to be perpetual by religious definition. Should be `SetNull`. |

---

## 4. Optional vs Required Issues

### MEDIUM

| # | Finding | Model | Field | Issue |
|---|---------|-------|-------|-------|
| S04-M17 | `Post.userId` is optional (`String?`) | Post | userId | Posts can exist without an author. After `SetNull` cascade on user delete, orphaned posts float with `userId: null`. All feed queries must handle null user. Design decision -- but creates "ghost posts" in feeds with no profile to navigate to. |
| S04-M18 | Inconsistent optionality on content authors: `Post.userId?`, `Story.userId?`, `Thread.userId?`, `Video.userId?` vs `Reel.userId?` (all optional) | Multiple | userId | All content types allow orphaned content after user deletion. This is a consistent policy (preserve content, remove author reference). But there is no mechanism to display these -- no "Deleted User" placeholder logic documented. |
| S04-M19 | `Video.userId?` optional but `Video.channelId` required | Video | userId + channelId | If user deleted (SetNull), video has `userId: null` but still references channel. The channel also has `userId? @unique` which also SetNulls. So both the video and its channel become orphaned simultaneously. |

### LOW

| # | Finding | Model | Field | Issue |
|---|---------|-------|-------|-------|
| S04-L1 | `CoinTransaction.userId` is optional (SetNull) | CoinTransaction | userId | Financial transactions lose user reference on deletion. For audit trails, should preserve user ID. |
| S04-L2 | `CreatorEarning.userId` is optional (SetNull) | CreatorEarning | userId | Tax-reportable earnings lose user reference. IRS/ATO reporting requires knowing who earned what. |
| S04-L3 | `Tip.senderId` and `Tip.receiverId` both optional (SetNull) | Tip | senderId, receiverId | After both users delete accounts, tip record has `senderId: null, receiverId: null`. Cannot reconstruct who paid whom. |

---

## 5. Soft Delete Without Index

### HIGH

| # | Finding | Model | Field | Issue |
|---|---------|-------|-------|-------|
| S04-H15 | `VideoComment.isDeleted` has no index | VideoComment | isDeleted | Service code filters `isDeleted: false`. No index covers this boolean. The `@@index([videoId, createdAt])` does not include `isDeleted`, so PostgreSQL must heap-check every row. |

### MEDIUM

| # | Finding | Model | Field | Issue |
|---|---------|-------|-------|-------|
| S04-M20 | `ReelComment.isRemoved` has no index | ReelComment | isRemoved | All comment list queries must filter this, but no index includes it. Only `@@index([reelId, createdAt])` exists. |
| S04-M21 | `ThreadReply.isRemoved` has no index | ThreadReply | isRemoved | Same pattern. `@@index([threadId, createdAt])` does not include soft-delete filter. |
| S04-M22 | `VideoReply.isDeleted` has no index | VideoReply | isDeleted | Only `@@index([commentId])` and `@@index([userId])`. Soft-delete filter not covered. |
| S04-M23 | `Story.isRemoved` has no index | Story | isRemoved | `@@index([userId, createdAt])` exists but stories query always filters `isRemoved: false`. Not covered. |
| S04-M24 | `Story.isArchived` has no index | Story | isArchived | Stories are archived after 24h. Queries for active stories filter `isArchived: false`. Not covered. |

---

## 6. Missing Composite Indexes for Hot Query Patterns

### MEDIUM

| # | Finding | Model | Pattern | Recommendation |
|---|---------|-------|---------|----------------|
| S04-M25 | Notification unread query not optimally indexed | Notification | `userId + isRead + createdAt` | Has `@@index([userId, isRead])` and `@@index([userId, createdAt])` separately. A composite `@@index([userId, isRead, createdAt(sort: Desc)])` would serve "unread notifications, newest first" more efficiently. |
| S04-M26 | ConversationMember archive filter not indexed | ConversationMember | `userId + isArchived + lastMessageAt` | Has `@@index([userId, lastMessageAt])` but doesn't include `isArchived`. Every conversation list query filters archived conversations. |

---

## 7. Enum Completeness Issues

### LOW

| # | Finding | Enum | Issue |
|---|---------|------|-------|
| S04-L4 | Inconsistent enum casing: ~15 enums use lowercase, ~45 use UPPERCASE | Multiple | `TipStatus`, `ConversationRole`, `AudioRoomStatus`, `DonationStatus`, etc. use lowercase. `PostType`, `UserRole`, `ReelStatus`, etc. use UPPERCASE. Comments explain this matches existing DB data, but creates confusion. |
| S04-L5 | `MessageType` may be missing `POLL`, `CHECKLIST` types | MessageType | `MessageChecklist` model exists but no corresponding `MessageType` value. Forwarded messages use `isForwarded` boolean. |
| S04-L6 | `NotificationType` missing types for several features | NotificationType | No types for: video premiere going live, challenge completion, zakat/charity donation received, membership subscription events, mentorship status changes. |

---

## 8. Relation Naming Ambiguity

### LOW

| # | Finding | Model | Issue |
|---|---------|-------|-------|
| S04-L7 | `FatwaQuestion` self-relation as "answer" | FatwaQuestion | A fatwa question references another `FatwaQuestion` as its answer via `answerId`. Semantically, an answer is not a question. A separate `FatwaAnswer` model would be clearer. |
| S04-L8 | `Channel` vs `BroadcastChannel` naming collision | Channel + BroadcastChannel | `Channel` = YouTube-style video channel (Minbar). `BroadcastChannel` = Telegram-style broadcast channel (Risalah). `ChannelMember` belongs to `BroadcastChannel`. `ChannelPost` belongs to `Channel`. Easy to confuse. |

---

## 9. Security-Sensitive Fields

### HIGH

| # | Finding | Details |
|---|---------|---------|
| S04-H16 | **`CallSession.e2eeKey` and `e2eeSalt` stored as plaintext `Bytes?`** | E2EE key material for calls in the database as raw bytes. Per CLAUDE.md technical debt, the server generates and distributes these keys. If DB is breached, all ongoing call encryption keys are exposed. These fields MUST be set to NULL immediately when a call ends. Verify the CallSession updater does this on `status=ENDED`. |
| S04-H17 | **`TwoFactorSecret.secret` is plaintext `String`** | TOTP secret stored as plaintext. There is an `encryptedSecret String?` column and a TODO about migration, but the plaintext column is still required (not nullable). Any DB access exposes all 2FA secrets. Migration to encrypted-only should be prioritized. |
| S04-H18 | **`ParentalControl.pin` is plaintext `String`** | Parental control PIN stored in plain text. Should be bcrypt-hashed. A DB breach exposes all parental control PINs. |

---

## 10. Dead Models and Deprecated Fields

### INFO

| # | Model/Field | Schema Line | Status |
|---|-------------|-------------|--------|
| S04-I1 | `VideoInteraction` | ~3048 | Dead -- "Zero code references. Superseded by FeedInteraction." |
| S04-I2 | `VideoClip` | ~3810 | Dead -- "Zero code references in API. Mobile has unused type only." |
| S04-I3 | `LocalBoard` | ~4364 | Dead -- "Zero service references." |
| S04-I4 | `VolunteerOpportunity` | ~4444 | Dead -- "Zero service references." |
| S04-I5 | `UserReputation` | ~4491 | Dead -- "No standalone service." |
| S04-I6 | `SharedCollection` | ~4544 | Dead -- "Zero service references." |
| S04-I7 | `VideoCommentLike` | ~5222 | Dead -- "Zero code references. likesCount incremented directly." |
| S04-I8 | `Message.starredBy` field | ~2003 | Deprecated -- "Use StarredMessage join table. Kept for migration." |
| S04-I9 | 7 dead models consume migration overhead | -- | Should be removed in next major migration. |
| S04-I10 | `Embedding.vector` uses `Unsupported("vector(768)")` | ~4792 | Expected for pgvector. Requires raw SQL. No Prisma type safety on vector ops. |

---

## 11. Dangling FK Arrays

### MEDIUM

| # | Model | Field | Issue |
|---|-------|-------|-------|
| S04-M27 | `Post` | `hiddenFromUserIds String[]` | Stores User IDs without relation. Schema comment acknowledges this. If referenced users are deleted, stale IDs remain. |
| S04-M28 | `ChatFolder` | `conversationIds String[]` | Stores Conversation IDs without relation. Schema comment acknowledges this. |
| S04-M29 | `StageSession` | `speakerIds String[]` | Stores User IDs without relation. Schema comment acknowledges this. Ephemeral data but still accumulates stale refs. |

---

## Consolidated Fix Priority

### Tier 1: Must Fix Before Launch (data integrity + security)

| Priority | IDs | Fix |
|----------|-----|-----|
| 1 | S04-C1 to C5 | Add missing indexes on 5 high-volume FK fields |
| 2 | S04-H16 | Verify e2eeKey/e2eeSalt wiped from DB on call end |
| 3 | S04-H17 | Migrate TwoFactorSecret to encrypted-only, drop plaintext |
| 4 | S04-H18 | Hash ParentalControl.pin |
| 5 | S04-H11 to H14 | Change cascade to SetNull on LiveSession, AudioRoom, CharityCampaign, CommunityTreasury |
| 6 | S04-H9 | Add `@unique` to User.phone |
| 7 | S04-H10 | Add `@unique` to CallSession.livekitRoomName |
| 8 | S04-H15 | Add composite index including isDeleted on VideoComment |

### Tier 2: Should Fix (performance)

| Priority | IDs | Fix |
|----------|-----|-----|
| 9 | S04-H1 to H8 | Add indexes on remaining 8 FK fields |
| 10 | S04-M14 to M16 | Change cascade to SetNull on Challenge, DhikrChallenge, WaqfFund creators |
| 11 | S04-M20 to M24 | Add soft-delete boolean to composite indexes |
| 12 | S04-M25, M26 | Optimize composite indexes for notification/conversation queries |
| 13 | S04-M1 to M9 | Add indexes on lower-volume FK fields |

### Tier 3: Deferred (cleanup)

| Priority | IDs | Fix |
|----------|-----|-----|
| 14 | S04-I1 to I8 | Remove dead models in next major migration |
| 15 | S04-L1 to L3 | Decide policy on financial record user references |
| 16 | S04-L4 to L8 | Enum casing, naming, completeness cleanup |
| 17 | S04-M27 to M29 | Address dangling FK arrays (join table migration) |

---

## Methodology

1. Read entire schema (5,415 lines) in 500-line chunks -- every model examined
2. For every model: checked `@@index`, `@@unique`, `@unique` against all FK fields
3. For every relation: verified `onDelete` rule exists and is appropriate
4. Cross-referenced FK fields against grep of service code for WHERE clause usage
5. Checked all soft-delete boolean fields (`isDeleted`, `isRemoved`, `isArchived`) for index coverage
6. Verified cascade chain depth for user deletion blast radius
7. Checked all sensitive fields (secrets, keys, PINs) for plaintext storage
8. Identified all `@deprecated` annotations and verified dead status
9. Reviewed enum completeness against actual feature usage
10. Analyzed composite index coverage for known hot query patterns
