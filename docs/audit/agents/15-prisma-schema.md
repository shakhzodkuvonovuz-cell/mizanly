# Agent #15 — Prisma Schema Deep Audit

**File:** `apps/api/prisma/schema.prisma` (4,050 lines, 187 models)
**Auditor:** Claude Opus 4.6 agent #15
**Date:** 2026-03-21
**Total Findings:** 92

---

## SEVERITY LEGEND
- **P0 — CRITICAL:** Data loss, security vulnerability, or runtime crash
- **P1 — HIGH:** Incorrect behavior, data integrity risk, or significant performance issue
- **P2 — MEDIUM:** Suboptimal design, missing constraint, or maintenance risk
- **P3 — LOW:** Style inconsistency, redundancy, or minor improvement opportunity

---

## 1. CASCADE DELETE DANGERS (12 findings)

### P0-CASCADE-01: Message cascade on User delete (line 1178)
- **File:** schema.prisma:1178
- **Severity:** P0
- **Category:** Cascade delete
- **Description:** `Message.sender → User` has `onDelete: Cascade`. Deleting a user permanently destroys ALL their messages from every conversation. This is catastrophic for group chats — other members lose visible messages. Should be `onDelete: SetNull` with `senderId` made optional, preserving messages as "[Deleted User]".

### P0-CASCADE-02: Tip cascade on User delete (lines 2132-2133)
- **File:** schema.prisma:2132-2133
- **Severity:** P0
- **Category:** Cascade delete
- **Description:** `Tip.sender → User` and `Tip.receiver → User` both have `onDelete: Cascade`. Deleting either the sender or receiver destroys the financial transaction record. Tips are financial records that must be preserved for tax reporting, audit trails, and dispute resolution. Should be `onDelete: SetNull` with IDs made optional.

### P0-CASCADE-03: GiftRecord cascade on User delete (lines 2386-2388)
- **File:** schema.prisma:2386-2388
- **Severity:** P0
- **Category:** Cascade delete
- **Description:** `GiftRecord.sender → User` and `GiftRecord.receiver → User` both have `onDelete: Cascade`. Gift records track virtual currency transfers — deleting them creates accounting discrepancies where coins/diamonds appear or disappear from the system. Must be preserved for auditing. Should be `onDelete: SetNull`.

### P0-CASCADE-04: Order cascade on User delete (line 3126)
- **File:** schema.prisma:3126
- **Severity:** P0
- **Category:** Cascade delete
- **Description:** `Order.buyer → User` has `onDelete: Cascade`. Deleting a buyer account destroys all order records. Sellers lose proof of sales, and financial records needed for tax reporting are lost. This is a legal compliance issue. Should be `onDelete: SetNull`.

### P0-CASCADE-05: ZakatDonation cascade on User delete (line 3221)
- **File:** schema.prisma:3221
- **Severity:** P0
- **Category:** Cascade delete
- **Description:** `ZakatDonation.donor → User` has `onDelete: Cascade`. Zakat donations are religious financial obligations — deleting a user destroys donation records, corrupting `raisedAmount` tallies on ZakatFund. Should be `onDelete: SetNull`.

### P0-CASCADE-06: CharityDonation cascade on User delete (line 2524)
- **File:** schema.prisma:2524
- **Severity:** P0
- **Category:** Cascade delete
- **Description:** `CharityDonation.user → User` has `onDelete: Cascade`. Same issue as Zakat — charity donation records are financial and must survive user deletion. The `raisedAmount` on CharityCampaign becomes incorrect when donation records are deleted.

### P0-CASCADE-07: TreasuryContribution cascade on User delete (line 3256)
- **File:** schema.prisma:3256
- **Severity:** P0
- **Category:** Cascade delete
- **Description:** `TreasuryContribution.user → User` has `onDelete: Cascade`. Community treasury contributions are financial records. Deletion corrupts `raisedAmount` on CommunityTreasury.

### P1-CASCADE-08: CreatorEarning cascade on User delete (line 3693)
- **File:** schema.prisma:3693
- **Severity:** P1
- **Category:** Cascade delete
- **Description:** `CreatorEarning.user → User` has `onDelete: Cascade`. Creator earnings records needed for tax reporting (1099 forms in the US, equivalent elsewhere) are destroyed when a creator deletes their account. Legal obligation to retain financial records.

### P1-CASCADE-09: ModerationLog cascade on moderator delete (line 1471)
- **File:** schema.prisma:1471
- **Severity:** P1
- **Category:** Cascade delete
- **Description:** `ModerationLog.moderator → User` has `onDelete: Cascade`. If a moderator's account is deleted, the entire moderation audit trail is destroyed. This undermines trust & safety accountability. Should be `onDelete: SetNull`.

### P1-CASCADE-10: Report cascade on reporter delete (line 1446)
- **File:** schema.prisma:1446
- **Severity:** P1
- **Category:** Cascade delete
- **Description:** `Report.reporter → User` has `onDelete: Cascade`. If a reporter deletes their account, all their pending reports are destroyed — reported content escapes review. Should be `onDelete: SetNull`.

### P1-CASCADE-11: Report cascade on reportedUser delete (line 1447)
- **File:** schema.prisma:1447
- **Severity:** P1
- **Category:** Cascade delete
- **Description:** `Report.reportedUser → User` has `onDelete: Cascade`. If a reported user deletes their account to evade moderation, all reports against them are destroyed. Should be `onDelete: SetNull`.

### P2-CASCADE-12: BroadcastMessage cascade on sender delete (line 1235)
- **File:** schema.prisma:1235
- **Severity:** P2
- **Category:** Cascade delete
- **Description:** `BroadcastMessage.sender → User` has `onDelete: Cascade`. If the broadcast channel owner deletes their account, all broadcast messages are lost. Subscribers lose content. Should be `onDelete: SetNull`.

---

## 2. DANGLING FOREIGN KEYS (8 findings)

### P1-DANGLING-01: ReelTemplate.sourceReelId has no relation (line 2269)
- **File:** schema.prisma:2269
- **Severity:** P1
- **Category:** Dangling FK
- **Description:** `sourceReelId String` is a plain string field with no `@relation` to the `Reel` model. If the source reel is deleted, the template references a nonexistent reel. Should have a proper relation with `onDelete: SetNull` or `onDelete: Cascade`.

### P1-DANGLING-02: VideoReply.commentId has no relation (line 2290)
- **File:** schema.prisma:2290
- **Severity:** P1
- **Category:** Dangling FK
- **Description:** `commentId String` and `commentType String` are plain strings with no foreign key relation. Video replies can reference deleted comments with no cascade or nullification. This is a polymorphic FK pattern that Prisma doesn't support natively, but should at minimum have an index and application-level cleanup.

### P1-DANGLING-03: FatwaQuestion.answeredBy has no relation (line 3346)
- **File:** schema.prisma:3346
- **Severity:** P1
- **Category:** Dangling FK
- **Description:** `answeredBy String?` stores a user ID but has no `@relation`. Cannot enforce referential integrity — the answering scholar could be deleted and the field would point to nothing.

### P1-DANGLING-04: FatwaQuestion.answerId has no relation (line 3345)
- **File:** schema.prisma:3345
- **Severity:** P1
- **Category:** Dangling FK
- **Description:** `answerId String?` presumably references some answer record but has no relation and no corresponding model. It's unclear what this references. Dead field or missing model.

### P1-DANGLING-05: MessageChecklistItem.completedBy has no relation (line 3978)
- **File:** schema.prisma:3978
- **Severity:** P1
- **Category:** Dangling FK
- **Description:** `completedBy String?` stores a user ID but has no `@relation`. The completing user cannot be resolved via Prisma includes, and referential integrity is not enforced.

### P1-DANGLING-06: Message.forwardedFromId has no relation (line 1156)
- **File:** schema.prisma:1156
- **Severity:** P1
- **Category:** Dangling FK
- **Description:** `forwardedFromId String?` stores the ID of the original message but has no `@relation`. Cannot be resolved via Prisma includes. Likely intended as a self-reference to Message but was never wired up.

### P1-DANGLING-07: SavedMessage.forwardedFromId has no relation (line 3487)
- **File:** schema.prisma:3487
- **Severity:** P1
- **Category:** Dangling FK
- **Description:** `forwardedFromId String?` is a polymorphic FK (paired with `forwardedFromType`) but has no relation. Can reference any content type. Application-level integrity only.

### P2-DANGLING-08: Webhook.targetChannelId has no relation (line 3622)
- **File:** schema.prisma:3622
- **Severity:** P2
- **Category:** Dangling FK
- **Description:** `targetChannelId String?` presumably references a BroadcastChannel or Channel but has no `@relation`. If the target channel is deleted, the webhook silently targets nothing.

---

## 3. STRING[] USED AS FK ARRAYS (4 findings)

### P1-FKARRAY-01: Message.starredBy is a String[] of user IDs (line 1164)
- **File:** schema.prisma:1164
- **Severity:** P1
- **Category:** String[] FK array
- **Description:** `starredBy String[] @default([])` stores an array of user IDs as plain strings. This cannot enforce referential integrity, cannot be queried efficiently (no index on array membership in PG without GIN), and deleted users leave phantom IDs in the array. Should be a separate `MessageStar` join table with composite PK `[messageId, userId]`.

### P1-FKARRAY-02: ChatFolder.conversationIds is a String[] of conversation IDs (line 3503)
- **File:** schema.prisma:3503
- **Severity:** P1
- **Category:** String[] FK array
- **Description:** `conversationIds String[]` stores conversation IDs as plain strings. Deleted conversations leave phantom IDs. Cannot be efficiently queried or joined. Should be a `ChatFolderConversation` join table.

### P1-FKARRAY-03: StageSession.speakerIds is a String[] of user IDs (line 3643)
- **File:** schema.prisma:3643
- **Severity:** P1
- **Category:** String[] FK array
- **Description:** `speakerIds String[]` stores user IDs as plain strings. No referential integrity. Should be a `StageSpeaker` join table with proper User relations.

### P2-FKARRAY-04: Webhook.events is a String[] (line 3625)
- **File:** schema.prisma:3625
- **Severity:** P2
- **Category:** String[] FK array
- **Description:** `events String[]` stores event types as plain strings with no enum validation. Any arbitrary string can be stored. Should use an enum or separate table.

---

## 4. MISSING INDEXES (20 findings)

### P1-INDEX-01: Notification missing index on actorId (line 1390)
- **File:** schema.prisma:1390
- **Severity:** P1
- **Category:** Missing index
- **Description:** `Notification.actorId` has no index. Queries like "get all notifications where I am the actor" (for notification dedup) require full table scan.

### P1-INDEX-02: Notification missing index on postId, threadId, reelId, videoId (lines 1392-1398)
- **File:** schema.prisma:1392-1398
- **Severity:** P1
- **Category:** Missing index
- **Description:** Notification FK fields `postId`, `threadId`, `reelId`, `videoId`, `commentId`, `circleId`, `conversationId` have no indexes. Cascade deletes on these content types trigger sequential scans to find matching notifications.

### P1-INDEX-03: FeedInteraction missing unique constraint on [userId, postId] (line 1533)
- **File:** schema.prisma:1533
- **Severity:** P1
- **Category:** Missing unique constraint
- **Description:** `FeedInteraction` has no `@@unique([userId, postId])`. This means duplicate interaction records can be created for the same user-post pair, inflating engagement metrics.

### P1-INDEX-04: Report missing index on reporterId (line 1427)
- **File:** schema.prisma:1427
- **Severity:** P1
- **Category:** Missing index
- **Description:** `Report.reporterId` has no index. "Get my reports" requires full table scan. Also means duplicate report detection is O(n).

### P1-INDEX-05: ModerationLog missing index on reportId (line 1465)
- **File:** schema.prisma:1465
- **Severity:** P1
- **Category:** Missing index
- **Description:** `ModerationLog.reportId` has no index. Looking up moderation actions for a specific report requires full table scan.

### P1-INDEX-06: CallSession missing index on status (line 1800)
- **File:** schema.prisma:1800
- **Severity:** P1
- **Category:** Missing index
- **Description:** `CallSession.status` has no index. Finding active calls (`status: 'ACTIVE'`) requires full table scan.

### P1-INDEX-07: CallSession missing index on createdAt (line 1808)
- **File:** schema.prisma:1808
- **Severity:** P1
- **Category:** Missing index
- **Description:** No index on `CallSession.createdAt`. Recent call history queries are inefficient.

### P1-INDEX-08: Embedding missing pgvector index on vector (line 3670)
- **File:** schema.prisma:3670
- **Severity:** P1
- **Category:** Missing index
- **Description:** The `vector(768)` column has no index. Nearest-neighbor similarity searches do full sequential scan on entire embeddings table. Needs an IVFFlat or HNSW index for reasonable query performance at scale. Prisma cannot create these natively — requires a raw migration.

### P2-INDEX-09: ChannelPost missing index on userId (line 2032)
- **File:** schema.prisma:2032
- **Severity:** P2
- **Category:** Missing index
- **Description:** `ChannelPost.userId` has no index. "Get my channel posts" across channels is O(n).

### P2-INDEX-10: VoicePost missing index on createdAt (line 3423)
- **File:** schema.prisma:3423
- **Severity:** P2
- **Category:** Missing index
- **Description:** `VoicePost` has index on `userId` but not on `createdAt`. Feed-ordered voice post listing requires sequential scan within user's posts.

### P2-INDEX-11: WatchParty missing index on isActive (line 3436)
- **File:** schema.prisma:3436
- **Severity:** P2
- **Category:** Missing index
- **Description:** `WatchParty.isActive` has no index. Finding active watch parties requires full scan.

### P2-INDEX-12: SharedCollection missing index on isPublic (line 3453)
- **File:** schema.prisma:3453
- **Severity:** P2
- **Category:** Missing index
- **Description:** `SharedCollection.isPublic` has no index. Discovering public collections requires full scan.

### P2-INDEX-13: Event missing index on communityId (line 2103)
- **File:** schema.prisma:2103
- **Severity:** P2
- **Category:** Missing index
- **Description:** `Event.communityId` has no index. Getting events for a specific community requires sequential scan.

### P2-INDEX-14: StoryChainEntry missing index on storyId (line 2255)
- **File:** schema.prisma:2255
- **Severity:** P2
- **Category:** Missing index
- **Description:** `StoryChainEntry.storyId` has no index. Finding which chain a story belongs to is O(n).

### P2-INDEX-15: GeneratedSticker has no text search capability (line 1873)
- **File:** schema.prisma:1873
- **Severity:** P2
- **Category:** Missing index
- **Description:** `GeneratedSticker.prompt` has no index. Searching past generated stickers by prompt text requires full scan.

### P2-INDEX-16: HashtagFollow missing index on hashtagId alone (line 2348)
- **File:** schema.prisma:2348
- **Severity:** P2
- **Category:** Missing index
- **Description:** While `@@index([hashtagId])` exists, there's no compound index with count-based ordering for "most followed hashtags". Also, `Hashtag` model has no FK relation to `HashtagFollow` — the hashtagId in HashtagFollow is a raw string, not a relation.

### P2-INDEX-17: CommunityNoteRating missing index on noteId alone (line 3922)
- **File:** schema.prisma:3922-3929
- **Severity:** P2
- **Category:** Missing index
- **Description:** While `@@unique([noteId, userId])` exists, there's no standalone index on `noteId` for efficient "get all ratings for this note" queries.

### P2-INDEX-18: ForumReply missing index on authorId (line 3604)
- **File:** schema.prisma:3604
- **Severity:** P2
- **Category:** Missing index
- **Description:** `ForumReply.authorId` has no index. "Get all my forum replies" requires full scan.

### P2-INDEX-19: CollabInvite missing index on inviterId (line 3941)
- **File:** schema.prisma:3941
- **Severity:** P2
- **Category:** Missing index
- **Description:** `CollabInvite.inviterId` has no index. "Get my sent collab invites" requires full scan.

### P2-INDEX-20: AdminLog missing index on adminId (line 3519)
- **File:** schema.prisma:3519
- **Severity:** P2
- **Category:** Missing index
- **Description:** `AdminLog.adminId` has no index. "Get all actions by this admin" requires full scan.

---

## 5. MISSING UNIQUE CONSTRAINTS (6 findings)

### P1-UNIQUE-01: FeedInteraction should have unique on [userId, postId] (line 1533)
- **File:** schema.prisma:1533
- **Severity:** P1
- **Category:** Missing unique constraint
- **Description:** Already noted in INDEX-03. Without this constraint, duplicate feed interaction records accumulate, skewing algorithm signals. Every view of the same post creates a new row.

### P1-UNIQUE-02: Hashtag.name already has @unique but HashtagFollow.hashtagId is not a FK (line 2343)
- **File:** schema.prisma:2343
- **Severity:** P1
- **Category:** Missing relation
- **Description:** `HashtagFollow.hashtagId` is a raw string. It is not a `@relation` to `Hashtag`. This means: (1) hashtagId can contain any string, not just valid hashtag IDs; (2) deleting a Hashtag does not clean up follows; (3) no cascade or referential integrity. Should be a proper relation.

### P2-UNIQUE-03: AudioRoomParticipant has @@unique but CallParticipant does not need one (line 2215 vs 1824)
- **File:** schema.prisma:1824
- **Severity:** P2
- **Category:** Design inconsistency
- **Description:** `CallParticipant` uses `@@id([sessionId, userId])` which inherently prevents duplicates. But `AudioRoomParticipant` uses a generated `id` PK plus `@@unique([roomId, userId])`. These are two different patterns for the same concept (participant join table). Minor inconsistency.

### P2-UNIQUE-04: StickerPack missing unique on name (line 1832)
- **File:** schema.prisma:1832
- **Severity:** P2
- **Category:** Missing unique constraint
- **Description:** `StickerPack.name` has no unique constraint. Duplicate pack names can be created, making it hard to identify packs uniquely.

### P2-UNIQUE-05: CustomEmoji.shortcode should be unique within a pack (line 3553)
- **File:** schema.prisma:3553
- **Severity:** P2
- **Category:** Missing unique constraint
- **Description:** `CustomEmoji` has no `@@unique([packId, shortcode])`. Duplicate shortcodes can exist within the same pack, causing ambiguous emoji resolution.

### P3-UNIQUE-06: ViewerDemographic has no de-duplication (line 3703)
- **File:** schema.prisma:3703
- **Severity:** P3
- **Category:** Missing unique constraint
- **Description:** `ViewerDemographic` has no unique constraint at all. The same demographic data point can be inserted multiple times, inflating analytics. However, this may be intentional if it's tracking individual views.

---

## 6. MONEY/DECIMAL FIELDS THAT SHOULD NOT BE FLOAT/INT (5 findings)

### P1-MONEY-01: Product.rating is Float (line 3081)
- **File:** schema.prisma:3081
- **Severity:** P1
- **Category:** Float precision
- **Description:** `rating Float @default(0)` — While rating is not money, it's an average that should maintain precision. More importantly, `Product.rating` is computed from integer star ratings (1-5) and should be stored with `@db.Decimal(3, 2)` to avoid floating point drift (e.g., 3.4999999999999996 instead of 3.5).

### P1-MONEY-02: HalalBusiness.rating is Float (line 3162)
- **File:** schema.prisma:3162
- **Severity:** P1
- **Category:** Float precision
- **Description:** Same issue as Product.rating. `rating Float @default(0)` should be `Decimal @db.Decimal(3, 2)`.

### P1-MONEY-03: HalalRestaurant.averageRating is Float (line 4022)
- **File:** schema.prisma:4022
- **Severity:** P1
- **Category:** Float precision
- **Description:** `averageRating Float @default(0)` — same floating point precision issue.

### P1-MONEY-04: User.coinBalance and diamondBalance are Int (lines 267-268)
- **File:** schema.prisma:267-268
- **Severity:** P1
- **Category:** Dual balance system
- **Description:** `coinBalance Int` and `diamondBalance Int` on the User model duplicates the `CoinBalance` model (line 2357) which also tracks `coins Int` and `diamonds Int`. Two separate balance systems for the same user creates a data integrity nightmare — which one is the source of truth? One must be removed.

### P2-MONEY-05: CoinTransaction.amount is Int (line 2375)
- **File:** schema.prisma:2375
- **Severity:** P2
- **Category:** Data type
- **Description:** `amount Int` for coin transactions. If fractional coins are ever introduced (e.g., coin bundles with bonus percentages), this breaks. Low risk currently since coins are whole numbers, but architecturally fragile.

---

## 7. MODELS REFERENCED IN CODE BUT NOT IN SCHEMA (2 findings)

### P0-GHOST-01: `prisma.community` referenced in communities.service.ts but does not exist (line 414 of communities.service.ts)
- **File:** communities.service.ts:414
- **Severity:** P0
- **Category:** Ghost model
- **Description:** `this.prisma.community.findUnique()` is called in the communities service, but there is no `model Community` in the schema. The schema uses `Circle` for communities (with `@@map("circles")`). This call will crash at runtime with "Unknown arg community".

### P0-GHOST-02: `prisma.streak` referenced in retention.service.ts but does not exist (line 59 of retention.service.ts)
- **File:** retention.service.ts:59
- **Severity:** P0
- **Category:** Ghost model
- **Description:** `this.prisma.streak.findMany()` is called in the retention service, but there is no `model Streak` in the schema. The correct model is `UserStreak` (line 2858, mapped to `user_streaks`). This call will crash at runtime.

---

## 8. REDUNDANT MODELS/FIELDS (4 findings)

### P1-REDUNDANT-01: Dual coin balance — User.coinBalance vs CoinBalance model (lines 267 vs 2357)
- **File:** schema.prisma:267 and 2357
- **Severity:** P1
- **Category:** Redundant data
- **Description:** `User.coinBalance` (Int) and `CoinBalance.coins` (Int) both claim to track the same value. `User.diamondBalance` (Int) and `CoinBalance.diamonds` (Int) are also duplicated. If code updates one but not the other, balances diverge. One system must be authoritative and the other removed.

### P2-REDUNDANT-02: User.warningsCount duplicates UserReputation.warningCount (lines 261 vs 3406)
- **File:** schema.prisma:261 and 3406
- **Severity:** P2
- **Category:** Redundant data
- **Description:** Warning count is tracked in two places. If a moderation action increments one but not the other, they diverge.

### P2-REDUNDANT-03: Hashtag count fields are denormalized without sync (lines 1517-1520)
- **File:** schema.prisma:1517-1520
- **Severity:** P2
- **Category:** Denormalization risk
- **Description:** `Hashtag.postsCount`, `reelsCount`, `threadsCount`, `videosCount` are denormalized counters. If content is deleted or hashtags change on a post, these counters must be decremented. With Cascade deletes on User→Post, posts are silently deleted without decrementing hashtag counters. Counters drift over time.

### P3-REDUNDANT-04: Channel.totalViews vs aggregating from Video.viewsCount (line 851)
- **File:** schema.prisma:851
- **Severity:** P3
- **Category:** Denormalization risk
- **Description:** `Channel.totalViews` is a denormalized aggregate of all video views. Must be manually kept in sync when videos are deleted or views increment. Minor — common pattern for performance.

---

## 9. ENUM INCONSISTENCIES AND MISSING ENUMS (7 findings)

### P2-ENUM-01: ConversationMember.role is String, not enum (line 1126)
- **File:** schema.prisma:1126
- **Severity:** P2
- **Category:** Missing enum
- **Description:** `role String @default("member") @db.VarChar(10)` should use a proper enum instead of a freeform string. Any value can be stored. Expected values: "member", "admin", "owner".

### P2-ENUM-02: Multiple models use freeform String for status fields
- **File:** Various
- **Severity:** P2
- **Category:** Missing enum
- **Description:** The following models use `String` for status fields that should be enums:
  - `AudioRoom.status` (line 2186): "live", "ended", "scheduled"
  - `MembershipSubscription.status` (line 2170): "active", "cancelled", "expired"
  - `CharityDonation.status` (line 2532): "pending", "completed"
  - `Order.status` (line 3120): "pending", "paid", "shipped", etc.
  - `PremiumSubscription.status` (line 3267): "active", "cancelled", "expired"
  - `OfflineDownload.status` (line 2693): "pending", "downloading", etc.
  - `ScholarVerification.status` (line 2615): "pending", "approved", "rejected"
  - `FatwaQuestion.status` (line 3344): "pending", "answered", "closed"
  - `Mentorship.status` (line 3304): "pending", "active", "completed", "cancelled"
  - `StageSession.status` (line 3642): "scheduled", "live", "ended"

  Using String instead of enum means invalid values can be stored (e.g., typos like "actvie"), no compile-time validation, and no automatic migration when values change.

### P2-ENUM-03: LiveParticipant.role and CallParticipant.role are Strings (lines 1281, 1818)
- **File:** schema.prisma:1281, 1818
- **Severity:** P2
- **Category:** Missing enum
- **Description:** `role String @default("viewer")` and `role String @default("caller")` should be enums for type safety.

### P2-ENUM-04: EndScreen.type is unvalidated String (line 2763)
- **File:** schema.prisma:2763
- **Severity:** P2
- **Category:** Missing enum
- **Description:** `type String // subscribe | watch_next | playlist | link` — documented valid values in comments but uses freeform String. Should be an enum.

### P2-ENUM-05: OfflineDownload.contentType is unvalidated String (line 2689)
- **File:** schema.prisma:2689
- **Severity:** P2
- **Category:** Missing enum
- **Description:** `contentType String // post | video | reel` — should use an enum (possibly `ContentSpace` or a new enum).

### P2-ENUM-06: AiTranslation.contentType is unvalidated String (line 2817)
- **File:** schema.prisma:2817
- **Severity:** P2
- **Category:** Missing enum
- **Description:** `contentType String // post | thread | comment | video_description` — should be an enum for type safety.

### P3-ENUM-07: CommunityNote.contentType is VarChar(20) (line 3903)
- **File:** schema.prisma:3903
- **Severity:** P3
- **Category:** Missing enum
- **Description:** `contentType String @db.VarChar(20) // post, thread, reel` — should be an enum to prevent invalid content types.

---

## 10. ID STRATEGY INCONSISTENCIES (3 findings)

### P2-ID-01: Mixed cuid() and uuid() across models
- **File:** schema.prisma (various)
- **Severity:** P2
- **Category:** ID inconsistency
- **Description:** Core models (User, Post, Story, Reel, Thread, etc.) use `@default(cuid())` while extension models (from Batch 33+) use `@default(uuid())`. Per CLAUDE.md, this is documented and new models should use `cuid()`. However, some late-addition models that are tightly coupled to core use uuid: QuranReadingPlan, DhikrSession, CharityDonation, HajjProgress — these reference User (cuid) but generate their own IDs as uuid. This creates inconsistent ID formats across the API (cuids are 25 chars, uuids are 36 chars with dashes).

### P2-ID-02: Post-Batch-4 models (line 3704+) revert to cuid()
- **File:** schema.prisma:3704+
- **Severity:** P2
- **Category:** ID inconsistency
- **Description:** Models after batch 85 (ViewerDemographic, VideoChapter, CommunityRole, HifzProgress, MosqueCommunity, ScholarQA, DuaBookmark, CommunityNote, CollabInvite, MessageChecklist, FastingLog, HalalRestaurant) use `@default(cuid())`, breaking the "Batch 33+ uses uuid" convention. This means the codebase has three ID zones: core (cuid), batch 33-85 (uuid), late additions (cuid again).

### P3-ID-03: CircleInvite.code uses @default(cuid()) for invite codes (line 1369)
- **File:** schema.prisma:1369
- **Severity:** P3
- **Category:** ID design
- **Description:** `code String @unique @default(cuid())` uses cuid for invite codes. CUIDs are not user-friendly for sharing (25 chars, mixed case). A shorter, URL-safe, human-readable code would be better for invite links.

---

## 11. OPTIONAL FIELDS THAT SHOULD BE REQUIRED (5 findings)

### P2-OPTIONAL-01: Reel.duration should not be optional-adjacent (line 653)
- **File:** schema.prisma:653
- **Severity:** P2
- **Category:** Schema correctness
- **Description:** `Reel.duration Float` is correctly required, but `Reel.videoUrl String` should have `@db.Text` or a length constraint. URLs can exceed VarChar defaults.

### P2-OPTIONAL-02: Post.content is optional (line 522)
- **File:** schema.prisma:522
- **Severity:** P2
- **Category:** Schema correctness
- **Description:** `content String? @db.VarChar(2000)` is optional. A post with no content, no media, and no shared post is an empty post. Should have application-level validation that at least one of content/mediaUrls/sharedPostId is non-empty, but the schema allows completely empty posts.

### P2-OPTIONAL-03: MosqueCommunity.latitude/longitude should be required (lines 3790-3791)
- **File:** schema.prisma:3790-3791
- **Severity:** P2
- **Category:** Schema correctness
- **Description:** `latitude Float` and `longitude Float` are required, which is correct for mosque finder. But `HalalBusiness.lat` (line 3154) and `HalalBusiness.lng` (line 3155) are `Float?` (optional). For a location-based finder feature, coordinates should be required.

### P2-OPTIONAL-04: Event.endDate is optional (line 2094)
- **File:** schema.prisma:2094
- **Severity:** P2
- **Category:** Schema correctness
- **Description:** `endDate DateTime?` is optional. While single-moment events exist, having no end date means the event never "ends" in queries filtering by date range. Should default to startDate + some duration.

### P3-OPTIONAL-05: TwoFactorSecret.secret is a plain String (line 2224)
- **File:** schema.prisma:2224
- **Severity:** P3 (security flagged separately)
- **Category:** Schema correctness
- **Description:** `secret String` stores the TOTP secret in plaintext. It's required and not encrypted at the database level. While application-level encryption could handle this, the schema doesn't signal that this is sensitive data.

---

## 12. DESIGN ISSUES AND ARCHITECTURAL CONCERNS (16 findings)

### P1-DESIGN-01: Notification model is a God table with too many optional FKs (lines 1387-1414)
- **File:** schema.prisma:1387-1414
- **Severity:** P1
- **Category:** Design
- **Description:** `Notification` has 8 optional FK fields (postId, commentId, circleId, conversationId, threadId, reelId, videoId, followRequestId), all with `onDelete: Cascade`. For any given notification, 7 of 8 are null. This is a wide, sparse table. Worse, all 8 FK fields lack individual indexes, so cascade deletes on any of these content types trigger sequential scans on the notifications table.

### P1-DESIGN-02: Conversation.lockCode stored as plaintext (line 1103)
- **File:** schema.prisma:1103
- **Severity:** P1
- **Category:** Security design
- **Description:** `lockCode String?` stores the secret code to unlock a conversation in plaintext. Should be hashed (e.g., scrypt/bcrypt) in the same way ParentalControl.pin is documented as being hashed.

### P1-DESIGN-03: TwoFactorSecret.backupCodes stored as plaintext String[] (line 2226)
- **File:** schema.prisma:2226
- **Severity:** P1
- **Category:** Security design
- **Description:** `backupCodes String[] @default([])` stores 2FA backup codes in plaintext. If the database is breached, all backup codes are exposed. Each code should be individually hashed (bcrypt), with the plaintext shown to the user only once at generation time.

### P1-DESIGN-04: TwoFactorSecret.secret stored as plaintext (line 2224)
- **File:** schema.prisma:2224
- **Severity:** P1
- **Category:** Security design
- **Description:** `secret String` stores the TOTP seed in plaintext. If the database is compromised, attackers can generate valid 2FA codes for any account. Should be encrypted at rest using application-level AES-256 with a separate encryption key.

### P2-DESIGN-05: FeedDismissal uses polymorphic FK (contentId + contentType) (lines 1741-1742)
- **File:** schema.prisma:1741-1742
- **Severity:** P2
- **Category:** Design pattern
- **Description:** `contentId String` + `contentType String` is a polymorphic FK pattern. Prisma cannot enforce referential integrity on these. If the referenced content is deleted, the dismissal record becomes orphaned. Same pattern used in: VideoReply (line 2290-2291), ThumbnailVariant (line 3020-3021), AiTranslation (line 2817-2818), CommunityNote (line 3903-3904), OfflineDownload (line 2689-2690).

### P2-DESIGN-06: Channel.trailerVideoId has no relation (line 860)
- **File:** schema.prisma:860
- **Severity:** P2
- **Category:** Dangling FK
- **Description:** `trailerVideoId String?` presumably references a Video but has no `@relation`. If the trailer video is deleted, this field silently points to nothing.

### P2-DESIGN-07: Post.hashtags and Post.mentions are String[] (lines 532-533)
- **File:** schema.prisma:532-533
- **Severity:** P2
- **Category:** Design pattern
- **Description:** `hashtags String[]` and `mentions String[]` store raw strings instead of referencing the `Hashtag` model or `User` model. This means: (1) No referential integrity (deleted users leave phantom mentions); (2) Hashtag count maintenance is purely application logic; (3) No efficient "find all posts mentioning user X" query without GIN index on the array. Same pattern on Reel (658-659), Thread (755-756), and Comment (1027).

### P2-DESIGN-08: Product.images is String[] (line 3074)
- **File:** schema.prisma:3074
- **Severity:** P2
- **Category:** Design pattern
- **Description:** `images String[]` stores product image URLs as a plain array. Should be a separate `ProductImage` model if ordering, alt text, or individual deletion is needed.

### P2-DESIGN-09: HalalBusiness.openingHours is String stored as JSON (line 3165)
- **File:** schema.prisma:3165
- **Severity:** P2
- **Category:** Data type
- **Description:** `openingHours String? @db.VarChar(500) // JSON` stores JSON in a VarChar field. Should use `Json?` type for proper PostgreSQL JSON support, validation, and querying.

### P2-DESIGN-10: HajjProgress.checklistJson stored as String instead of Json (line 2567)
- **File:** schema.prisma:2567
- **Severity:** P2
- **Category:** Data type
- **Description:** `checklistJson String @default("{}")` stores JSON in a String field. Should use `Json @default("{}")` for proper type support.

### P2-DESIGN-11: VideoReply.commentType uses String instead of enum (line 2291)
- **File:** schema.prisma:2291
- **Severity:** P2
- **Category:** Missing enum
- **Description:** `commentType String @db.VarChar(10) // 'post' or 'reel'` — only two valid values, perfect for an enum.

### P2-DESIGN-12: Reel model uses `caption` while Post uses `content` (line 657 vs 522)
- **File:** schema.prisma:657 vs 522
- **Severity:** P2
- **Category:** Naming inconsistency
- **Description:** `Reel.caption` and `Post.content` describe the same concept (text body of content) but use different field names. This creates confusion in application code. Per CLAUDE.md, "Post: `content` (NOT caption)" is the convention, but Reel breaks it.

### P2-DESIGN-13: Conversation has no explicit type field for DM vs Group (line 1090)
- **File:** schema.prisma:1090-1117
- **Severity:** P2
- **Category:** Design
- **Description:** `Conversation` uses `isGroup Boolean` to distinguish DMs from groups. There's no support for a third type (e.g., self-chat, broadcast group). An enum like `ConversationType` with values `DM`, `GROUP`, `BROADCAST`, `SELF` would be more extensible.

### P3-DESIGN-14: Poll.threadId index is redundant with @unique (line 1586)
- **File:** schema.prisma:1586
- **Severity:** P3
- **Category:** Redundant index
- **Description:** `@@index([threadId])` on Poll is redundant because `threadId String @unique` already creates a unique index. The explicit @@index is wasteful disk space.

### P3-DESIGN-15: EncryptionKey.userId index is redundant with @unique (line 2319)
- **File:** schema.prisma:2319
- **Severity:** P3
- **Category:** Redundant index
- **Description:** `@@index([userId])` is redundant because `userId String @unique` already creates an index.

### P3-DESIGN-16: Multiple models have @@index on fields that are already part of @unique
- **File:** Various
- **Severity:** P3
- **Category:** Redundant indexes
- **Description:** Several models have `@@index` on fields that are already covered by `@unique` constraints: TwoFactorSecret (line 2231), UserSettings (line 2010), PrayerNotificationSetting (line 2588), ContentFilterSetting (line 2603). Each redundant index consumes storage and slows writes.

---

## SUMMARY BY SEVERITY

| Severity | Count | Description |
|----------|-------|-------------|
| P0       | 9     | 7 cascade delete dangers on financial data, 2 ghost models |
| P1       | 32    | 5 more cascade issues, 8 dangling FKs, 3 FK arrays, 8 missing indexes, 3 unique constraints, 3 money/decimal, 2 design issues |
| P2       | 39    | Missing indexes, enum inconsistencies, design patterns, naming, redundant data |
| P3       | 12    | Redundant indexes, minor inconsistencies, low-impact issues |
| **Total**| **92**|  |

## TOP 5 PRIORITIES TO FIX

1. **Ghost models** (P0-GHOST-01, P0-GHOST-02): `prisma.community` and `prisma.streak` will crash at runtime. Fix: change to `prisma.circle` and `prisma.userStreak` respectively.

2. **Financial record cascade deletes** (P0-CASCADE-02 through P0-CASCADE-07): Deleting a user destroys Tips, GiftRecords, Orders, ZakatDonations, CharityDonations, and TreasuryContributions. Fix: change all financial model User relations to `onDelete: SetNull` and make the FK fields optional.

3. **Message cascade on User delete** (P0-CASCADE-01): All messages from a deleted user are permanently destroyed from all conversations. Fix: change to `onDelete: SetNull` on Message.sender.

4. **Dual coin balance system** (P1-MONEY-04, P1-REDUNDANT-01): `User.coinBalance`/`diamondBalance` vs `CoinBalance.coins`/`diamonds` — two sources of truth. Fix: remove one.

5. **Plaintext 2FA secrets and backup codes** (P1-DESIGN-03, P1-DESIGN-04): Database breach exposes all 2FA secrets and backup codes. Fix: encrypt secret with AES-256, hash backup codes with bcrypt.
