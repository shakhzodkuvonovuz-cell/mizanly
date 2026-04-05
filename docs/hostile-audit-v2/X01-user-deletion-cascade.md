# X01 — User Deletion/Deactivation Cascade Audit

**Auditor:** Hostile cross-module trace  
**Date:** 2026-04-05  
**Scope:** Full user lifecycle termination — deactivation, soft-delete, hard-delete  
**Files examined:**
- `apps/api/src/modules/users/users.service.ts` (deactivate, deleteAccount, requestAccountDeletion, cancelAccountDeletion, reactivateAccount)
- `apps/api/src/modules/privacy/privacy.service.ts` (deleteAllUserData, hardDeletePurgedUsers, processScheduledDeletions)
- `apps/api/src/modules/auth/auth.service.ts` (deactivateByClerkId)
- `apps/api/src/modules/auth/webhooks.controller.ts` (Clerk webhook handler)
- `apps/api/prisma/schema.prisma` (214 models, 349 onDelete rules)

---

## Architecture Summary

Three-phase deletion pipeline:

| Phase | Trigger | What happens | Timing |
|-------|---------|-------------|--------|
| **1. Deactivation** | `POST /me/deactivate` or `POST /me/delete-account` | Sets `isDeactivated: true`, deletes 1 Redis cache key. Nothing else. | Immediate |
| **2. Soft-delete (data purge)** | `DELETE /me` (immediate) or daily cron for scheduled deletions | `PrivacyService.deleteAllUserData()` — anonymizes PII, soft-deletes content, cleans ~70 tables, R2 media, Meilisearch, Redis | Immediate or after 30-day grace period |
| **3. Hard-delete (row purge)** | Daily cron at 4:30 AM | `prisma.user.delete()` on users with `isDeleted: true` for 90+ days. Prisma cascades handle remaining FKs. | 90 days after soft-delete |

Clerk webhook path: `user.deleted` -> `deactivateByClerkId` -> sets `isDeleted: true` + `scheduledDeletionAt: now()` -> cron picks up next day -> `deleteAllUserData()`.

---

## CRITICAL FINDINGS

### X01-C1: Cascade Hard-Delete Destroys Entire Communities (CRITICAL)

**Severity:** CRITICAL  
**Location:** `apps/api/prisma/schema.prisma` + `privacy.service.ts:hardDeletePurgedUsers()`

When `prisma.user.delete()` runs at the hard-delete phase, Prisma cascade rules destroy ALL entities the user OWNS. This includes multi-user entities where other users' data lives:

| Model | onDelete | Cascading destruction |
|-------|----------|----------------------|
| **Circle** (community) | `Cascade` on ownerId | Destroys the entire community, ALL members, ALL posts, ALL threads, ALL events, ALL forum threads, ALL treasuries, ALL roles |
| **AudioRoom** | `Cascade` on hostId | Destroys room + all participant records |
| **LiveSession** | `Cascade` on hostId | Destroys session + all participant + guest records |
| **HalalBusiness** | `Cascade` on ownerId | Destroys business + all reviews from other users |
| **Product** | `Cascade` on sellerId | Destroys products + all reviews from other users. Orders lose product FK. |
| **Challenge** | `Cascade` on createdById | Destroys challenge + all participant records |
| **CommunityTreasury** | `Cascade` on createdById | Destroys treasury + contribution records from other users |
| **WaqfFund** | `Cascade` on createdById | Destroys endowment fund + all donation records |
| **CharityCampaign** | `Cascade` on userId | Destroys charity campaign (donations survive via SetNull on campaignId) |
| **MosqueCommunity** | `Cascade` on createdById | Destroys mosque + all memberships + all posts from other users |
| **StageSession** | `Cascade` on hostId | Destroys session records |
| **WatchParty** | `Cascade` on hostId | Destroys party records |
| **SharedCollection** | `Cascade` on createdById | Destroys shared collections |
| **LocalBoard** | `Cascade` on createdById | Destroys local board (community entity) |
| **StudyCircle** | `Cascade` on leaderId | Destroys study circle |
| **Mentorship** | `Cascade` on both mentorId and menteeId | Destroys mentorship records |
| **IslamicEvent** | `Cascade` on organizerId | Destroys events |
| **VolunteerOpportunity** | `Cascade` on organizerId | Destroys volunteer listings |
| **Webhook** | `Cascade` on createdById | Destroys community webhooks |
| **GroupTopic** | `Cascade` on createdById | Destroys conversation topics |
| **MessageChecklist** | `Cascade` on createdById | Destroys shared checklists in conversations |
| **MajlisList** | `Cascade` on ownerId | Destroys list + all member records |

**Impact:** One user deleting their account can destroy an entire community of 10,000+ members, including all their posts, discussions, financial contributions, and event records. This is a catastrophic data loss for other users.

**Fix required:** Multi-user entities (Circle, HalalBusiness, Product, CommunityTreasury, WaqfFund, MosqueCommunity, AudioRoom, LiveSession) must use `onDelete: SetNull` on their owner FK, not `Cascade`. Alternatively, the soft-delete phase must transfer ownership or explicitly anonymize these entities before the user row is hard-deleted.

---

### X01-C2: ZakatFund + ZakatDonation Financial Record Loss (CRITICAL)

**Severity:** CRITICAL  
**Location:** `schema.prisma:4285` + `schema.prisma:4300`

`ZakatFund` has `onDelete: Cascade` on `recipientId` (the user receiving zakat). `ZakatDonation` has `onDelete: Cascade` on `fundId`. When the recipient user is hard-deleted:

1. ZakatFund is cascade-deleted
2. ALL ZakatDonation records for that fund are cascade-deleted

This destroys **financial records** that may be needed for:
- Tax reporting by donors
- Zakat compliance auditing
- Legal disputes

The comment in `privacy.service.ts:397` explicitly says "Financial records are NOT deleted... preserved for audit/tax compliance" -- but this is FALSE for ZakatDonation because the cascade path goes through ZakatFund, not directly through User.

**Fix required:** `ZakatFund.recipientId` must use `onDelete: SetNull` (make recipientId nullable). `ZakatDonation.fundId` must also use `SetNull` to preserve donation records independently of fund survival.

---

### X01-C3: No External Service Cleanup (CRITICAL)

**Severity:** CRITICAL  
**Location:** `privacy.service.ts:deleteAllUserData()`

The deletion function does NOT notify or clean up any external services:

| Service | What happens | Problem |
|---------|-------------|---------|
| **Clerk** | `clerkId` is overwritten to `deleted_${userId}` but Clerk user record persists | User could potentially re-authenticate via Clerk. No `clerkClient.users.deleteUser()` call. |
| **Stripe** | `stripeConnectAccountId` is nulled but Stripe customer/connect account persists | Stripe customer record with email, payment methods, transaction history remains. Violates GDPR Art 17. |
| **Stripe Subscriptions** | Active `MembershipSubscription`/`PremiumSubscription` records are deleted in DB | But Stripe continues billing. No `stripe.subscriptions.cancel()` call. User continues being charged after "deletion". |
| **Meilisearch** | Handled (posts, threads, reels, videos, users indexes are cleaned) | OK |
| **R2/Cloudflare** | Handled (media files deleted in batches) | OK |
| **Go E2E Key Server** | No notification. E2E keys exist in Prisma DB (cleaned at hard-delete via Cascade) | But the Go server may have cached or in-memory references. No endpoint to purge user keys. |
| **Go LiveKit Server** | No notification. Active call sessions may persist. | User could have active call room. No force-disconnect or session cleanup. |

---

## HIGH FINDINGS

### X01-H1: Deactivation Is a No-Op (Only Sets a Flag)

**Severity:** HIGH  
**Location:** `users.service.ts:198-211`

The `deactivate()` function only:
1. Sets `isDeactivated: true`
2. Deletes ONE Redis cache key (`user:${username}`)

It does NOT:
- Remove user from Meilisearch (user remains searchable)
- Clean presence keys (`presence:${userId}`)
- Force-disconnect WebSocket connections
- Cancel active subscriptions
- Invalidate Clerk sessions
- Remove user from feed caches
- Clean rate-limiting keys

A "deactivated" user's content remains fully visible and accessible. The only protection is query-level filtering in feeds (`isDeactivated: false`), but many endpoints do not check this flag.

### X01-H2: ~30 Models Not Explicitly Handled in Soft-Delete

**Severity:** HIGH  
**Location:** `privacy.service.ts:deleteAllUserData()`

The following user-owned models are NOT explicitly deleted or anonymized during soft-delete. They will only be cleaned 90 days later during hard-delete (via Prisma cascade). During the 90-day window, the user's content/PII in these tables remains intact:

**Content with PII/media (R2 orphans risk):**

| Model | Has media? | Has PII content? | Notes |
|-------|-----------|-----------------|-------|
| `VideoReply` | YES (`mediaUrl`, `thumbnailUrl`) | No | R2 media orphaned for 90 days |
| `ChannelPost` | YES (`mediaUrls[]`) | YES (`content`) | Full content + media visible for 90 days |
| `ForumThread` | No | YES (`title`, `content`) | Content visible for 90 days |
| `ForumReply` | No | YES (`content`) | Content visible for 90 days |
| `CommunityNote` | No | YES (`content`) | Content visible for 90 days |
| `FatwaQuestion` | No | YES (`question`) | Religious question PII for 90 days |

**Engagement/behavioral data:**

| Model | Notes |
|-------|-------|
| `ChannelPostLike` | Engagement data persists |
| `HadithBookmark` | GDPR Art 9 religious data persists for 90 days |
| `AdminLog` | User admin actions remain attributed |
| `AdminAuditLog` | Same |

**Owned entities (other users' data at risk during hard-delete):**

| Model | Notes |
|-------|-------|
| `LocalBoard` | Community entity survives 90 days then cascade-deleted |
| `Mentorship` | Both sides cascade-deleted when either user deletes |
| `StudyCircle` | Leader deletion destroys circle |
| `FatwaQuestion` | Asker deletion destroys answered fatwas |
| `VolunteerOpportunity` | Organizer deletion destroys listings |
| `IslamicEvent` | Organizer deletion destroys events |
| `WatchParty` | Host deletion destroys party |
| `SharedCollection` | Creator deletion destroys collection |
| `ParentalControl` | Parent or child deletion breaks control link |
| `Webhook` | Creator deletion destroys community webhooks |
| `GroupTopic` | Creator deletion destroys topics |
| `MessageChecklist` + items | Creator deletion destroys shared checklists |
| `CustomEmojiPack` | Creator deletion destroys pack + all emojis |

### X01-H3: WebSocket Sessions Not Terminated on Deletion

**Severity:** HIGH  
**Location:** `privacy.service.ts:deleteAllUserData()`

Neither `deleteAllUserData()` nor `deactivate()` force-disconnects active WebSocket connections. A deleted/deactivated user can continue sending messages until their existing socket connection drops naturally (heartbeat timeout).

The ChatGateway (`chat.gateway.ts:114`) has a channel-based force-disconnect mechanism (`user:${userId}` room -> `fetchSockets` -> `disconnect(true)`), but deletion code never invokes it.

### X01-H4: Counter Denormalization Inconsistency

**Severity:** HIGH  
**Location:** `privacy.service.ts:588-600`

The deletion function correctly decrements `followersCount`/`followingCount` on other users, but does NOT decrement:

| Counter | On Model | When |
|---------|----------|------|
| `membersCount` | Circle | CircleMember deleted |
| `subscribersCount` | Channel (BroadcastChannel) | ChannelMember deleted |
| `subscribersCount` | Channel (Video) | Subscription deleted |
| `membersCount` | MosqueCommunity | MosqueMembership deleted |
| `membersCount` | StudyCircle | (no explicit member model, uses circleId) |
| `commentsCount` on posts/reels/videos | Post/Reel/Video | Comments soft-deleted |
| `likesCount` on posts/reels/videos | Post/Reel/Video | Reactions deleted |
| `viewsCount` on stories | Story | StoryView deleted |
| `donorCount` on CharityCampaign | CharityCampaign | (no explicit deletion) |

This leads to permanently inflated counts on other users' content and communities.

### X01-H5: Redis Key Leaks

**Severity:** HIGH  
**Location:** `privacy.service.ts:766-784`

The deletion function cleans 10 Redis key patterns, but misses:

| Redis Key Pattern | Set By | Purpose |
|------------------|--------|---------|
| `user:mosque:${userId}` | `islamic.service.ts:1963` | Cached mosque data (HSET, 1yr TTL) |
| `user:customer:${userId}` | `payments.service.ts:52` | Stripe customer ID mapping |
| `presence:${userId}` | `chat.gateway.ts:288` | Online presence SSET (no TTL if not cleaned) |
| `session:${userId}` | `personalized-feed.service.ts:50` | Feed session state |
| `session:${userId}:*` | `retention.service.ts:33` | Daily retention tracking |
| `2fa:verified:${userId}` or `2fa:verified:${userId}:*` | `two-factor.service.ts:339-342` | 2FA verification state |
| `ws:ratelimit:*:${userId}` | `chat.gateway.ts:240` | WebSocket rate-limit counters |

Most of these have TTLs and will eventually expire, but `presence:${userId}` could persist indefinitely if the socket disconnect handler didn't fire, causing a "ghost online" state.

---

## MEDIUM FINDINGS

### X01-M1: Clerk Webhook Deletion Path Skips Immediate Data Purge

**Severity:** MEDIUM  
**Location:** `auth.service.ts:439-462`

When Clerk sends `user.deleted` webhook:
1. `deactivateByClerkId()` sets `isDeleted: true`, `scheduledDeletionAt: now()`
2. Device tokens are cleared
3. **Data purge is deferred to the daily cron** (`processScheduledDeletions` at 3 AM)

This means a Clerk-side deletion could leave user data fully intact for up to ~24 hours before the cron runs. The `processScheduledDeletions` cron filters by `isDeactivated: true` AND `username NOT starting with 'deleted_'`. But `deactivateByClerkId` sets `isDeactivated: true` without anonymizing the username, so the cron should pick it up correctly. Still, the delay is a GDPR concern for "without undue delay" (Art 17).

### X01-M2: processScheduledDeletions Cron Bug — Checks isDeactivated but Not isDeleted

**Severity:** MEDIUM  
**Location:** `privacy.service.ts:157-165`

The cron query is:
```typescript
where: {
  scheduledDeletionAt: { lte: now },
  isDeactivated: true,
  username: { not: { startsWith: 'deleted_' } },
}
```

It requires `isDeactivated: true` but does NOT check `isDeleted: false`. The comment at line 154-156 explains this was intentional (to catch Clerk-deleted users). However, this means it could re-process already-purged users if their username somehow doesn't start with `deleted_`. The `deleteAllUserData` function has its own guard (`if (user.isDeleted) throw`), so this is a defense-in-depth issue, not a live bug.

### X01-M3: Soft-Delete Does Not Mark Content as isRemoved for All Types

**Severity:** MEDIUM  
**Location:** `privacy.service.ts:523-550`

Content types handled with `isRemoved: true`:
- Post (yes, with removedReason)
- Thread (yes)
- Comment (yes)
- Reel (yes, with location strip)
- Video (yes)

Content types NOT soft-deleted (only hard-deleted later):
- ThreadReply (content set to `[deleted]` but no isRemoved flag -- different pattern)
- ReelComment (hard-deleted immediately)
- VideoComment (hard-deleted immediately)
- ChannelPost (not handled at all)
- ForumThread (not handled at all)
- ForumReply (not handled at all)
- CommunityNote (not handled at all)
- VideoReply (not handled at all)

The inconsistency between soft-delete for some content types and hard-delete for others means:
- ReelComment/VideoComment are immediately gone (no "[deleted]" placeholder)
- ChannelPost/ForumThread/ForumReply remain fully visible for 90 days

### X01-M4: R2 Media Orphans from Unhandled Models

**Severity:** MEDIUM  
**Location:** `privacy.service.ts:412-491`

Media URLs are collected from: Post, Reel, Story, Video, Message, VoicePost, User avatar/cover.

Media URLs NOT collected (orphaned on R2 indefinitely):
- `VideoReply.mediaUrl` + `VideoReply.thumbnailUrl`
- `ChannelPost.mediaUrls[]`
- `SharedCollection` (if it has media)
- `IslamicEvent.coverUrl`
- `CharityCampaign.imageUrl`
- `ProfileCustomization.backgroundUrl` + `backgroundMusic`
- `HalalBusiness.logoUrl` (if exists)

These files remain on R2 after the user's DB records are cascade-deleted, with no reference to them.

### X01-M5: E2E Encryption Keys Persist Through Soft-Delete Window

**Severity:** MEDIUM  
**Location:** `privacy.service.ts` (missing) + `schema.prisma:3346-3402`

The soft-delete phase explicitly handles:
- `EncryptionKey` (line 577)
- `ConversationKeyEnvelope` (line 578)

But does NOT explicitly handle:
- `E2EIdentityKey`
- `E2ESignedPreKey`
- `E2EOneTimePreKey`
- `E2ESenderKey`

These are all `onDelete: Cascade` so they'll be cleaned at hard-delete (90 days later). But for 90 days after soft-delete, the user's Signal Protocol keys remain in the database. While these are public keys (not private), they could be used to:
- Verify past message signatures
- Attempt to establish new sessions with a "deleted" user
- Profile the user's device/key history

### X01-M6: No Notification to Contacts About Account Deletion

**Severity:** MEDIUM  
**Location:** `privacy.service.ts:deleteAllUserData()`

When a user deletes their account:
- Their followers/following counts on other users are decremented
- Their conversation memberships are removed
- But NO notification is sent to:
  - Their followers ("User X has deleted their account")
  - Their conversation partners (the conversation just shows a "Deleted User" member)
  - Circle members they owned (community is silently destroyed at hard-delete)
  - Active call participants (if in a call)

### X01-M7: Deactivation Does Not Prevent Login

**Severity:** MEDIUM  
**Location:** `users.service.ts:198-211`

The `deactivate()` function sets `isDeactivated: true` but does NOT:
- Invalidate Clerk sessions
- Revoke JWT tokens
- Block new logins

A deactivated user can continue to log in and use the app if their JWT hasn't expired. The `ClerkGuard` presumably validates JWTs against Clerk's API which doesn't know about the deactivation. The user could reactivate themselves by calling `POST /me/reactivate`.

---

## LOW FINDINGS

### X01-L1: requestAccountDeletion Does Not Check for Active Subscriptions

**Severity:** LOW  
**Location:** `users.service.ts:1069-1096`

The 30-day deletion request does not warn the user about:
- Active paid subscriptions (MembershipSubscription, PremiumSubscription)
- Pending orders
- Coins balance
- Community ownership (Circles they own)
- Active charity campaigns

### X01-L2: cancelAccountDeletion Clears deletedAt That Was Never Set

**Severity:** LOW  
**Location:** `users.service.ts:1107-1108`

`cancelAccountDeletion` sets `deletedAt: null`, but `requestAccountDeletion` (line 1084-1085) never sets `deletedAt` (it sets `scheduledDeletionAt`). The `deletedAt: null` assignment is harmless but misleading.

### X01-L3: hardDeletePurgedUsers Has No Maximum Retry Count

**Severity:** LOW  
**Location:** `privacy.service.ts:91-133`

If `prisma.user.delete()` fails for a user (e.g., FK violation from a missing cascade rule), the hard-delete cron logs the error and continues. But the same user will be retried on every daily cron run indefinitely. There's no retry counter, backoff, or dead-letter mechanism.

### X01-L4: Embedding Records Not Cleaned

**Severity:** LOW  
**Location:** `schema.prisma:4788-4804`

The `Embedding` model has `userId String?` with no explicit User relation (no onDelete rule). This means embedding vectors associated with the user's content persist even after hard-delete. These contain ML-derived representations of the user's posts which could be considered personal data under GDPR.

### X01-L5: No Audit Trail of What Was Deleted

**Severity:** LOW  
**Location:** `privacy.service.ts:deleteAllUserData()`

The function logs a single `logger.log` and returns `{ deleted: true }`. There is no itemized record of:
- How many posts/threads/reels/videos were soft-deleted
- How many R2 files were deleted (vs failed)
- How many search index deletions were queued
- What subscriptions/memberships were removed

For GDPR compliance, a deletion receipt should be generated and stored (separate from the user record, since that's being deleted).

### X01-L6: Race Condition Between Deletion and Content Creation

**Severity:** LOW  
**Location:** `privacy.service.ts:495-712`

The deletion runs in a transaction, but new content could be created between the pre-transaction media collection (lines 412-443) and the transaction start (line 495). If the user posts content in that window:
- The new post's media URLs won't be in `mediaKeysToDelete`
- The new post may or may not be caught by `updateMany({ where: { userId } })`

This is an unlikely race but theoretically possible if the user has active sessions.

---

## INFO

### X01-I1: Deletion Flow Diagram

```
User clicks "Delete Account" (30-day)
  |
  v
requestAccountDeletion() -- sets scheduledDeletionAt, isDeactivated
  |
  v  (30 days)
processScheduledDeletions() cron (3 AM daily) -- finds overdue users
  |
  v
deleteAllUserData() -- soft-delete phase (PII scrub, content remove, R2 clean)
  |
  v  (90 days)
hardDeletePurgedUsers() cron (4:30 AM daily) -- prisma.user.delete() + cascade
```

```
User clicks "Delete Account" (immediate)
  |
  v
deleteAccount() -> privacyService.deleteAllUserData() -- immediate purge
  |
  v  (90 days)
hardDeletePurgedUsers() cron -- prisma.user.delete() + cascade
```

```
Clerk webhook user.deleted
  |
  v
deactivateByClerkId() -- sets isDeleted + scheduledDeletionAt
  |
  v  (next cron at 3 AM)
processScheduledDeletions() -> deleteAllUserData()
  |
  v  (90 days)
hardDeletePurgedUsers() cron
```

### X01-I2: Models Explicitly Handled in deleteAllUserData (70 tables)

Category 1 - PII Anonymization: User profile
Category 2 - Content Soft-Delete: Post, Thread, Comment, Reel, Video, Story, ThreadReply, ReelComment, VideoComment
Category 3 - Message Anonymization: Message, MessageReaction, StarredMessage, SavedMessage
Category 4 - Sensitive Data: ProfileLink, TwoFactorSecret, EncryptionKey, ConversationKeyEnvelope, Device, AltProfile, AltProfileAccess, DMNote, ScholarVerification
Category 5 - Social Graph: Follow, Block, Mute, Restrict, FollowRequest, ConversationMember, CircleMember, Subscription, ChannelMember, HashtagFollow, MosqueMembership, SeriesFollower, MajlisListMember
Category 6 - Engagement: SavedPost, ThreadBookmark, VideoBookmark, PostReaction, ThreadReaction, ThreadReplyLike, ReelReaction, ReelCommentReaction, CommentReaction, VideoReaction, VideoCommentLike, WatchHistory, WatchLater, Notification, StoryView, StoryStickerResponse, StoryChainEntry, PollVote, EventRSVP, ScholarQuestionVote, HalalVerifyVote, CommunityNoteRating, ProductReview, BusinessReview, HalalRestaurantReview, PostCollab, PostTaggedUser, ReelTaggedUser, CollabInvite
Category 7 - Religious: DhikrSession, FastingLog, HajjProgress, HifzProgress, QuranReadingPlan, PrayerNotificationSetting, DhikrChallengeParticipant, DailyTaskCompletion, DuaBookmark, MosquePost, ScholarQuestion
Category 8 - Behavioral: FeedInteraction, FeedDismissal, UserInterest, ReelInteraction, VideoInteraction, UserSettings, ContentFilterSetting, ScreenTimeLog, QuietModeSetting, ProfileCustomization, StoryHighlightAlbum, BlockedKeyword, DraftPost, SavedSearch, ChatFolder, OfflineDownload
Category 9 - Creator/Commerce: UserStreak, UserAchievement, UserXP, UserReputation, CoinBalance, CreatorStat, PostPromotion, PostReminder, PremiumSubscription, MembershipSubscription, ChallengeParticipant, SeriesProgress, PremiereReminder, VideoClip, ReelTemplate, UserStickerPack, GeneratedSticker, AiAvatar, VoicePost, PlaylistCollaborator
Category 10 - Live/Audio: LiveParticipant, LiveGuest, AudioRoomParticipant, CallParticipant

### X01-I3: Models NOT Explicitly Handled (rely on cascade at hard-delete)

- VideoReply, ChannelPost, ChannelPostLike, ForumThread, ForumReply, CommunityNote
- HadithBookmark, Embedding (no User relation, orphaned)
- AdminLog, AdminAuditLog, GroupTopic, MessageChecklist, MessageChecklistItem
- Webhook, StageSession, CustomEmojiPack, CustomEmoji
- ParentalControl, WatchParty, SharedCollection
- LocalBoard, Mentorship, StudyCircle, FatwaQuestion, VolunteerOpportunity, IslamicEvent
- Circle (OWNED), AudioRoom (OWNED), LiveSession (OWNED), HalalBusiness (OWNED)
- Product (OWNED), Challenge (OWNED), CommunityTreasury (OWNED), WaqfFund (OWNED)
- CharityCampaign (OWNED), MosqueCommunity (OWNED), MajlisList (OWNED)
- StoryChain, Series (OWNED), Playlist (if owner FK exists)
- E2EIdentityKey, E2ESignedPreKey, E2EOneTimePreKey, E2ESenderKey

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 3 | X01-C1, X01-C2, X01-C3 |
| HIGH | 5 | X01-H1, X01-H2, X01-H3, X01-H4, X01-H5 |
| MEDIUM | 7 | X01-M1, X01-M2, X01-M3, X01-M4, X01-M5, X01-M6, X01-M7 |
| LOW | 6 | X01-L1, X01-L2, X01-L3, X01-L4, X01-L5, X01-L6 |
| **TOTAL** | **21** | |

### Most Urgent Fixes (in order)

1. **X01-C1:** Change `onDelete: Cascade` to `onDelete: SetNull` on Circle.ownerId and all multi-user owned entities. Add ownership transfer or anonymization in soft-delete phase.
2. **X01-C2:** Change ZakatFund.recipientId to `SetNull` (make nullable). Financial records must survive user deletion.
3. **X01-C3:** Add Clerk user deletion, Stripe subscription cancellation, and Stripe customer data removal to the deletion flow.
4. **X01-H3:** Force-disconnect WebSocket connections on deletion/deactivation.
5. **X01-H4:** Decrement counters on affected entities (Circle.membersCount, Channel.subscribersCount, etc.).
6. **X01-H5:** Clean all Redis key patterns, especially `presence:${userId}` and `user:mosque:${userId}`.
7. **X01-H2:** Add explicit soft-delete handling for VideoReply, ChannelPost, ForumThread, ForumReply, CommunityNote, FatwaQuestion (content PII), plus R2 media cleanup for VideoReply and ChannelPost.
