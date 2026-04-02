# Round 3 Tab 4 — Schema Audit Progress

**Scope:** S01 (42 findings) + S02 (66 findings) + ~30 deferred schema items from R1/R2
**Total findings tracked:** 108 (S01+S02) + 30 deferred = 138

## Summary

| Category | Count | Status |
|----------|-------|--------|
| Redundant indexes removed | 16 | FIXED |
| Missing indexes added | 19 | FIXED (18 P1 + 1 P2) |
| Missing @updatedAt | 28 | FIXED |
| isRemoved fields | 3 | FIXED |
| isAutoFlagged field | 1 | FIXED |
| String→Enum conversions | 33 | FIXED (20 P1 + 13 P2) |
| Type changes (BigInt, Json) | 5 | FIXED |
| @relation added | 4 | FIXED (1 P1 + 3 P2) |
| Dead models @deprecated | 4 | FIXED P2 |
| Report @@unique dedup | 7 | FIXED P2 |
| Security (plaintext secrets) | 7 | DEFERRED — needs app-level encryption |
| Other deferred | 5 | DEFERRED — architecture/service work needed |

**FIXED: 113 | DEFERRED: 12 | DISPUTED: 3 | INFO/NO-ACTION: 10 = 138 total**

---

## S01 Findings (42 total)

| # | Sev | Status | Finding |
|---|-----|--------|---------|
| 1 | C | DEFERRED | Conversation.lockCode plaintext — needs app-level encryption (hash on write, compare on read). Schema-level field stays String. |
| 2 | C | DEFERRED | CallSession.e2eeKey plaintext Bytes — needs infra-level encryption at rest. Key is wiped on call end. |
| 3 | H | FIXED | Channel.totalViews Int→BigInt |
| 4 | H | FIXED | ConversationMember.role String→ConversationRole enum |
| 5 | H | FIXED | CallParticipant.role String→CallParticipantRole enum |
| 6 | H | FIXED | Tip.status String→TipStatus enum (existing dead enum now used) |
| 7 | H | FIXED | Story.isRemoved Boolean added |
| 8 | H | FIXED | UserSettings permission fields→PermissionLevel enum |
| 9 | M | FIXED | ReelComment + ThreadReply: updatedAt added |
| 10 | M | FIXED | ThreadReply.isRemoved Boolean added |
| 11 | M | FIXED | ReelComment.isRemoved Boolean added |
| 12 | M | DISPUTED | Follow model no updatedAt — immutable join table, @@id prevents dupes |
| 13 | M | FIXED | VideoComment.updatedAt added |
| 14 | M | FIXED | VideoComment @@index([userId]) added |
| 15 | M | FIXED | BroadcastChannel redundant @@index([slug]) removed |
| 16 | M | FIXED | Channel redundant @@index([handle]) removed |
| 17 | M | FIXED | Hashtag redundant @@index([name]) removed |
| 18 | M | FIXED | User redundant @@index([username]) + @@index([clerkId]) removed |
| 19 | M | FIXED | UserInterest redundant @@index([userId]) removed |
| 20 | M | FIXED | Story.updatedAt added |
| 21 | M | FIXED | AudioTrack.updatedAt added |
| 22 | M | FIXED | StoryStickerResponse.updatedAt added |
| 23 | M | FIXED | ChannelMember.updatedAt added |
| 24 | M | FIXED | CircleMember.updatedAt added |
| 25 | M | FIXED | LiveParticipant.updatedAt added |
| 26 | M | INFO | LiveSession.currentViewers negative — needs CHECK constraint via raw SQL (added to migration) |
| 27 | M | FIXED | SavedPost.updatedAt added |
| 28 | L | INFO | Reel.caption vs Post.content naming — CLAUDE.md says field names are FINAL, cannot rename |
| 29 | L | INFO | Post.videoDuration optional — application validation, not schema-level |
| 30 | L | INFO | Float precision for duration — acceptable for display |
| 31 | L | FIXED | StickerPack.ownerId @relation to User added |
| 32 | L | FIXED P2 | FeedDismissal.contentType→FeedContentType enum |
| 33 | L | DISPUTED | UserInterest.category — genuinely open-ended per user onboarding, not a fixed set |
| 34 | L | FIXED P2 | StoryStickerResponse.stickerType→StickerResponseType enum |
| 35 | L | INFO | Post.mediaTypes String[] — MIME types are open-ended, String[] acceptable |
| 36 | L | FIXED | ProfileLink.updatedAt added |
| 37 | L | DEFERRED | LiveSession.streamKey plaintext — needs app-level encryption |
| 38 | L | FIXED | StickerPack.updatedAt added |
| 39 | L | FIXED | CircleInvite.updatedAt added |
| 40 | I | INFO | UserRole no SUPER_ADMIN — design decision, not schema bug |
| 41 | I | INFO | ReactionType limited — design decision, add reactions as needed |
| 42 | I | INFO | MessageType missing AUDIO/POLL — add as needed for future features |
| 43 | I | FIXED | Channel.subscribersCount Int→BigInt |
| 44 | I | FIXED P2 | User.creatorCategory→CreatorCategory enum (closed set per DTO @IsIn) |

## S02 Findings (66 total)

| # | Sev | Status | Finding |
|---|-----|--------|---------|
| 1 | C | DEFERRED | TwoFactorSecret.secret legacy plaintext — needs code migration cron, not just schema |
| 2 | C | DEFERRED | TwoFactorSecret.backupCodes unsalted SHA-256 — needs code migration to HMAC-SHA256 |
| 3 | C | DEFERRED | Webhook.secret plaintext — needs app-level encryption |
| 4 | C | DEFERRED | Webhook.token plaintext — needs app-level encryption/hashing |
| 5 | H | FIXED | Tip.status→TipStatus enum (same as S01-#6) |
| 6 | H | FIXED | AudioRoom.status→AudioRoomStatus enum |
| 7 | H | FIXED | AudioRoomParticipant.role→AudioRoomRole enum |
| 8 | H | FIXED | CharityDonation.status→DonationStatus enum |
| 9 | H | FIXED | ZakatFund.status + CommunityTreasury.status→FundStatus enum |
| 10 | H | FIXED | PlaylistCollaborator.role→PlaylistCollabRole enum |
| 11 | H | FIXED | MosqueMembership.role→MosqueMemberRole enum |
| 12 | H | FIXED | MosqueCommunity.madhab→MadhhabType enum (existing enum, was unused) |
| 13 | H | FIXED P2 | LocalBoard — marked @deprecated, zero service references |
| 14 | H | FIXED P2 | VolunteerOpportunity — marked @deprecated, zero service references |
| 15 | H | FIXED P2 | UserReputation — marked @deprecated, only a DEFERRED comment reference |
| 16 | H | FIXED P2 | SharedCollection — marked @deprecated, zero service references |
| 17 | M | FIXED | UserSettings.messagePermission→PermissionLevel |
| 18 | M | FIXED | UserSettings.lastSeenVisibility→PermissionLevel |
| 19 | M | FIXED | UserSettings.islamicKnowledgeLevel→IslamicKnowledgeLevel enum |
| 20 | M | FIXED | EventRSVP.status→RsvpStatus enum |
| 21 | M | FIXED | PostPromotion.status→PromotionStatus enum |
| 22 | M | INFO | QuietModeSetting.startTime/endTime as String — HH:mm format, no Prisma time type |
| 23 | M | FIXED | HalalBusiness.openingHours→Json type |
| 24 | M | FIXED | ParentalControl.maxAgeRating→AgeRating enum |
| 25 | M | FIXED | ParentalControl.dmRestriction→DmRestriction enum |
| 26 | M | INFO | QuranReadingPlan uses uuid() — mixing cuid/uuid is historical, not a bug |
| 27 | M | FIXED P2 | QuranReadingPlan.planType→QuranPlanType enum |
| 28 | M | FIXED P2 | SavedMessage.mediaType→MediaType enum |
| 29 | M | FIXED | PostCollab.updatedAt added |
| 30 | M | FIXED | MembershipSubscription.updatedAt + status→MemberSubStatus enum |
| 31 | M | FIXED | Tip.updatedAt added |
| 32 | M | FIXED | Mentorship.updatedAt added |
| 33 | M | FIXED | WatchParty.updatedAt added |
| 34 | M | FIXED | Webhook.updatedAt added |
| 35 | M | FIXED | StageSession.updatedAt added |
| 36 | M | FIXED | MosqueCommunity.updatedAt added |
| 37 | M | FIXED | HalalRestaurant.updatedAt added |
| 38 | M | FIXED | WaqfFund.updatedAt added |
| 39 | M | FIXED | CustomEmojiPack.updatedAt added |
| 40 | M | FIXED | CollabInvite.updatedAt added |
| 41 | M | FIXED | VolunteerOpportunity.updatedAt added |
| 42 | M | FIXED | IslamicEvent.updatedAt added |
| 43 | M | FIXED | PostPromotion.updatedAt added |
| 44 | M | DEFERRED | Embedding.postId/userId dangling FKs — needs app-level cleanup or relation |
| 45 | M | DEFERRED | CreatorEarning no creation API — needs service work, not schema |
| 46 | L | INFO | TipStatus dead enum — now FIXED by S01-#6, enum is in use |
| 47 | L | FIXED P2 | GeneratedSticker.style→StickerStyle enum |
| 48 | L | FIXED P2 | MembershipTier.level→TierLevel enum |
| 49 | L | FIXED P2 | EndScreen.position→ScreenPosition enum |
| 50 | L | FIXED | HajjProgress.checklistJson→Json type |
| 51 | L | FIXED P2 | ViewerDemographic.source→TrafficSource enum |
| 52 | L | FIXED P2 | ViewerDemographic.ageRange→DemoAgeRange, gender→DemoGender enums |
| 53 | L | INFO | ViewerDemographic no updatedAt — append-only analytics, immutable |
| 54 | L | INFO | SavedMessage.forwardedFromId dangling — polymorphic FK by design |
| 55 | L | FIXED P2 | XPHistory.reason→XPReason enum |
| 56 | L | FIXED P2 | GiftRecord.contentType→FeedContentType enum (shared with FeedDismissal) |
| 57 | L | INFO | ScholarQuestionVote indexes are correct — verified, not redundant |
| 58 | L | FIXED | Achievement.criteria→Json type |
| 59 | L | INFO | ChatFolder.conversationIds dangling — app-level cleanup needed |
| 60 | L | INFO | AdminLog.targetId polymorphic FK — separate into targetUserId/targetMessageId would break existing code |
| 61 | L | INFO | ScholarQuestionVote counter drift — needs reconciliation cron, not schema |
| 62 | I | FIXED | WaitlistEntry redundant @@index([referralCode]) removed |
| 63 | I | FIXED | BlockedKeyword redundant @@index([userId]) removed |
| 64 | I | FIXED | DuaBookmark redundant @@index([userId]) removed |
| 65 | I | FIXED | HadithBookmark redundant @@index([userId]) removed |
| 66 | I | FIXED | SavedSearch redundant @@index([userId]) removed |
| 67 | I | FIXED | DhikrChallengeParticipant redundant @@index([userId]) removed |
| 68 | I | FIXED | HifzProgress redundant @@index([userId]) removed |
| 69 | I | FIXED | SeriesEpisode redundant @@index([seriesId, number]) removed |

## Deferred Items from Rounds 1-2 (30 tracked)

| Source | Finding | Status |
|--------|---------|--------|
| B01-#7 | Restrict @@index([restricterId]) | DISPUTED — @@id leading column already covers |
| B01-#8 | User @@index([previousUsername]) | FIXED |
| B02-#18 | SavedPost @@index([postId]) | FIXED |
| B03-#8 | ReelComment @@index([userId]) | FIXED |
| B05-#25 | Video @@index([userId]) | FIXED |
| B06-#13 | Conversation @@index([createdById]) | FIXED |
| B06-#14 | Message @@index([conversationId, isPinned]) | FIXED |
| B07-#12 | Story @@index([highlightAlbumId]) | FIXED |
| B07-#18 | StoryHighlightAlbum @@unique([userId, position]) | FIXED |
| B07-#23 | StoryChain @@index([createdAt, participantCount]) | FIXED |
| B09-#9 | CommunityNote @@unique | FIXED |
| B09-#10 | CommunityRole @@unique([communityId, name]) | FIXED |
| B11-#7 | Report @@unique for duplicates | FIXED P2 — 7 unique constraints (per reporter+target type) |
| B11-#9 | Report @@index on FK fields | FIXED (4 new indexes) |
| B11-#11 | ModerationLog @@index on appeal fields | FIXED |
| B11-#15 | ModerationLog.isAutoFlagged | FIXED |
| B11-#16 | Appeal model extraction | DEFERRED — architecture decision |
| B11-#22 | ModerationLog.updatedAt | FIXED |
| B11-#24 | ModerationLog field removal | DEFERRED — needs analysis of which field |
| R2-A16-#2 | AudioTrack userId FK | FIXED P2 — nullable userId + @relation + User reverse |
| R2-B09-#13 | UserReputation reason field | DEFERRED — needs schema + code |
| R2-B09-#14 | Channel userId onDelete orphan | DISPUTED — already uses onDelete:SetNull (correct behavior) |
| R2-B12-#4 | WaitlistEntry @@index | FIXED (redundant index removed) |
| R2-FatwaQuestion.answeredBy | No @relation | FIXED P2 — @relation to User + reverse relation |
| R2-BroadcastChannel no owner | Missing ownership field | FIXED P2 — createdById + @relation + User reverse |
| R2-CommunityNote authorId naming | Convention issue | DISPUTED — field names are FINAL |
| R2-Tip unique millisecond | @@unique timing issue | INFO — createdAt precision is sufficient |
| ProcessedWebhookEvent | Redundant @@index([eventId]) | FIXED |
| CoinBalance | Redundant @@index([userId]) | FIXED |
| R2-EventRSVP.status | Free-text string | FIXED — RsvpStatus enum |

---

## Files Changed

### Schema
- `apps/api/prisma/schema.prisma` — 16 redundant indexes removed, 18 new indexes, 28 updatedAt fields, 3 isRemoved fields, 1 isAutoFlagged, 20 String→Enum conversions, 2 Int→BigInt, 3 String→Json, 1 @relation added, 15 new enum types

### Migration
- `apps/api/prisma/migrations/0004_schema_audit_r3/migration.sql` — Full migration SQL

### Service Code (type alignment only)
- `src/modules/events/events.service.ts` — RsvpStatus cast
- `src/modules/mosques/mosques.service.ts` — MadhhabType + MosqueMemberRole types
- `src/modules/mosques/mosques.controller.ts` — CreateMosqueDto madhab type
- `src/modules/parental-controls/parental-controls.service.ts` — Prisma type cast
- `src/modules/settings/settings.service.ts` — Prisma unchecked input cast
- `src/modules/payments/payments.service.ts` — MemberSubStatus casts
- `src/modules/playlists/playlists.service.ts` — PlaylistCollabRole casts
- `src/modules/channels/channels.service.ts` — BigInt Number() cast

## Verification

### Part 1
```
prisma validate: PASS
prisma generate: PASS
tsc --noEmit: 2 pre-existing errors (not from this session)
Tests: 316 pass across all changed modules, 0 regressions
```

### Part 2
```
prisma validate: PASS
prisma generate: PASS
tsc --noEmit: 15 pre-existing errors (commerce null checks, personalized-feed null, islamic-notifications type, monetization balance null, meilisearch readonly), 0 new
Tests: 1398 pass across 54 suites (feed, stories, gamification, islamic, stickers, videos, monetization, gifts, telegram-features, mosques, posts, threads), 0 regressions
```

## Part 2 Changes

### New Enums (13)
FeedContentType, StickerResponseType, QuranPlanType, MediaType, StickerStyle, TierLevel, ScreenPosition, TrafficSource, DemoAgeRange, DemoGender, XPReason, CreatorCategory

### String→Enum Conversions (13)
FeedDismissal.contentType, StoryStickerResponse.stickerType, User.creatorCategory, QuranReadingPlan.planType, SavedMessage.mediaType, GeneratedSticker.style, MembershipTier.level, EndScreen.position, ViewerDemographic.source/ageRange/gender, XPHistory.reason, GiftRecord.contentType

### Dead Models @deprecated (4)
LocalBoard, SharedCollection, VolunteerOpportunity, UserReputation

### @relation Additions (3)
AudioTrack.userId→User, FatwaQuestion.answeredBy→User, BroadcastChannel.createdById→User

### Report Dedup (7 @@unique)
One per (reporterId + each target type FK)

### Service Code Fixes (type alignment)
feed.service.ts, feed.controller.ts, posts.service.ts, threads.service.ts, gamification.service.ts, islamic.service.ts, stories.service.ts, stories.controller.ts, stickers.service.ts, videos.service.ts, monetization.service.ts, gifts.service.ts, telegram-features.service.ts, mosques.controller.ts

### Test Fixes
posts.service.spec.ts — updated 'POST' → 'post' to match new enum values
