# X13 — Schema vs Runtime Hostile Audit

**Date:** 2026-04-05
**Scope:** Cross-module audit verifying Prisma schema constraints match runtime behavior
**Models audited:** ~200 models, ~80 services, ~5,416 lines of schema
**Methodology:** Systematic comparison of every @@unique, @@index, enum, @default, optional field, and onDelete rule against service code

---

## CRITICAL Findings (data loss / crash risk)

### C-01: BigInt fields not serialized — JSON.stringify crash on any endpoint returning Channel or LiveSession

**Schema:** `Channel.subscribersCount BigInt`, `Channel.totalViews BigInt`, `LiveSession.peakViewers BigInt`, `LiveSession.currentViewers BigInt`
**Runtime:** `TransformInterceptor` wraps all responses with `JSON.stringify` via NestJS serialization. BigInt cannot be serialized by `JSON.stringify` — throws `TypeError: Do not know how to serialize a BigInt`.
**Impact:** ANY endpoint returning a Channel (channels.service.ts getAnalytics, list, detail) or LiveSession (live.service.ts join, detail) will crash at serialization time.
**Evidence:**
- `apps/api/src/common/interceptors/transform.interceptor.ts` — no BigInt handling
- `apps/api/src/main.ts` — no `BigInt.prototype.toJSON` polyfill
- `apps/api/src/modules/live/live.service.ts:289` — returns `currentViewers` raw as BigInt
- `apps/api/src/modules/channels/channels.service.ts:402` — returns `subscribersCount` raw as BigInt
- Only ONE place converts: `channels.service.ts:406` does `Number(channel.totalViews)` for a calculation, but `subscribersCount` at line 402 is returned raw
**Severity:** CRITICAL — server 500 on first channel/live endpoint call

### C-02: Mobile MessageType enum includes 'AUDIO' which does not exist in Prisma schema

**Schema enum MessageType:** `TEXT, IMAGE, VOICE, VIDEO, STICKER, FILE, SYSTEM, GIF, STORY_REPLY, LOCATION, CONTACT`
**Mobile type:** `'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'VOICE' | 'FILE' | 'GIF' | 'STICKER' | 'LOCATION' | 'SYSTEM'` (apps/mobile/src/types/index.ts:384)
**Impact:** If mobile sends a message with `messageType: 'AUDIO'`, Prisma will reject with an invalid enum value error. The DB has no 'AUDIO' value — only 'VOICE'.
**Secondary:** Mobile type also omits `STORY_REPLY` and `CONTACT` from the enum — those are in schema but not in mobile type. Code paths that set those types from mobile would fail TypeScript checks, potentially silenced by `as any` casts.
**Evidence:**
- `apps/mobile/src/types/index.ts:384` — defines 'AUDIO' which is not in schema
- `apps/mobile/src/services/signal/types.ts:234` — also references 'AUDIO'
- Schema line 176-188 — no 'AUDIO' value in MessageType enum
**Severity:** CRITICAL — messages of type AUDIO silently fail to persist

### C-03: DownloadQuality enum case mismatch — 'auto' (lowercase) vs AUTO (schema)

**Schema enum DownloadQuality:** `AUTO, LOW, MEDIUM, HIGH` (uppercase)
**Runtime:** `downloads.service.ts:40,46` — fallback value is `'auto'` (lowercase string)
```typescript
quality: (dto.quality as DownloadQuality) ?? 'auto',
```
**Impact:** When `dto.quality` is null/undefined, the code passes the string `'auto'` to Prisma, but the enum value is `AUTO`. Prisma is case-sensitive for enums — this will throw a validation error.
**Evidence:**
- `apps/api/src/modules/downloads/downloads.service.ts:40` — `'auto'` lowercase
- Schema line 3764 — `@default(AUTO)` uppercase
**Severity:** CRITICAL — every download request without explicit quality param crashes

---

## HIGH Findings (race conditions / data integrity)

### H-01: StoryHighlightAlbum.create — TOCTOU race on @@unique([userId, position])

**Schema:** `@@unique([userId, position])` on StoryHighlightAlbum (line 2639)
**Runtime:** `stories.service.ts:617-623`
```typescript
const count = await this.prisma.storyHighlightAlbum.count({ where: { userId } });
return this.prisma.storyHighlightAlbum.create({
  data: { userId, title, coverUrl, position: count },
});
```
**Issue:** Two concurrent requests read the same `count` (e.g., 5), both try to create with `position: 5`. Second request hits P2002 on `@@unique([userId, position])`. No P2002 catch.
**Fix:** Use upsert pattern, or wrap in try/catch with P2002 retry, or use a serializable transaction.
**Severity:** HIGH — concurrent album creation crashes

### H-02: CommunityRole.create — no P2002 handling for @@unique([communityId, name])

**Schema:** `@@unique([communityId, name])` on CommunityRole (line 4885)
**Runtime:** `communities.service.ts:412`
```typescript
return this.prisma.communityRole.create({
  data: { communityId, position: maxPosition, ...data },
});
```
**Issue:** `data` includes `name` from the DTO. If two admins create a role with the same name simultaneously, or if a duplicate name is submitted, the DB throws P2002. No catch block.
**Severity:** HIGH — unhandled P2002 crashes role creation

### H-03: ChannelPostLike.create — TOCTOU race despite pre-check

**Schema:** `@@unique([userId, postId])` on ChannelPostLike (line 3022)
**Runtime:** `channel-posts.service.ts:125-140`
```typescript
const existing = await this.prisma.channelPostLike.findUnique({ ... });
if (existing) throw new ConflictException('Already liked');
await this.prisma.$transaction([
  this.prisma.channelPostLike.create({ data: { userId, postId } }),
  // ...
]);
```
**Issue:** Classic TOCTOU — findUnique returns null, but between that check and the create, another request creates the same like. P2002 crashes the transaction. No P2002 catch (only pre-check).
**Severity:** HIGH — concurrent double-tap crashes

### H-04: ConversationMember.create in joinViaInviteLink — TOCTOU race

**Schema:** `@@id([conversationId, userId])` on ConversationMember (composite PK = implicit unique)
**Runtime:** `messages.service.ts:900-912`
```typescript
const existing = await this.prisma.conversationMember.findUnique({...});
if (existing?.isBanned) throw ...;
if (existing) throw new ConflictException('Already a member');
await this.prisma.conversationMember.create({
  data: { conversationId, userId, role: 'member' },
});
```
**Issue:** Same TOCTOU pattern. Two concurrent join-via-invite-link requests for the same user could race past the findUnique and crash on the composite PK constraint. No P2002 catch.
**Severity:** HIGH — concurrent group join crashes

### H-05: WaitlistEntry.create — race on @@unique([email])

**Schema:** `email String @unique` on WaitlistEntry (line 5330)
**Runtime:** `waitlist.service.ts:17-54`
```typescript
const existing = await this.prisma.waitlistEntry.findUnique({ where: { email } });
if (existing) return ...;
const entry = await this.prisma.waitlistEntry.create({ data: { email: normalizedEmail, ... } });
```
**Issue:** Two concurrent requests for the same email both pass the findUnique check, then the second create crashes on `email @unique`. No P2002 catch.
**Severity:** HIGH — concurrent waitlist signup crashes

### H-06: Story report — raw create on Report model with @@unique constraints, but reportedPostId/etc. are NULL for stories

**Schema:** `@@unique([reporterId, reportedPostId])`, etc. on Report (lines 2328-2334)
**Runtime:** `stories.service.ts:757-764` creates a Report with `reportedUserId` but NO `reportedPostId` etc. The dedup check (line 746) uses `findFirst` on `description` field prefix match, NOT the unique constraint. This means:
1. The unique constraint is bypassed because it's on nullable columns (NULLs don't trigger unique violations in PostgreSQL)
2. The string-based dedup (`description: { startsWith: 'story:...' }`) is fragile and doesn't use the DB constraint
**Severity:** HIGH — story reports bypass database-level dedup

---

## MEDIUM Findings

### M-01: chat-export.service.ts — null dereference on Message.sender (nullable relation)

**Schema:** `Message.senderId String?` and `sender User?` with `onDelete: SetNull`
**Runtime:** `chat-export.service.ts:200,227`
```typescript
sender: m.sender.displayName || m.sender.username,
```
**Issue:** `sender` is nullable (senderId is optional, sender relation has onDelete: SetNull). If the sender account is deleted, `m.sender` becomes null. Accessing `.displayName` on null throws TypeError.
**Severity:** MEDIUM — chat export crashes for conversations with deleted users

### M-02: og.service.ts — properly handles null user with early exit (GOOD), but no null check for user.avatarUrl

**Schema:** Post.userId optional, user relation nullable
**Runtime:** `og.service.ts:59` correctly checks `if (!post || !post.user || ...)` before accessing user fields.
**Status:** Properly handled. Included for completeness as a verified-good pattern.

### M-03: LiveType enum mismatch between mobile and schema

**Schema enum LiveType:** `VIDEO_STREAM, AUDIO_SPACE` (line 98-101)
**Mobile type:** `liveType?: 'VIDEO' | 'AUDIO'` (apps/mobile/src/types/index.ts:724)
**Runtime:** `live.service.ts:52` — casts `data.liveType as LiveType` from DTO
**Impact:** If mobile sends `'VIDEO'` or `'AUDIO'`, the cast would attempt to store values that don't match the schema enum (`VIDEO_STREAM` vs `VIDEO`). The DTO's `@IsEnum` validator should catch this at the controller level, but the mobile type definition is wrong and will cause client-side confusion.
**Severity:** MEDIUM — type mismatch may cause runtime errors depending on DTO validation

### M-04: MembershipSubscription status enum values used as lowercase strings without import

**Schema enum MemberSubStatus:** `active, cancelled, expired, pending, past_due, cancel_pending`
**Runtime:** `monetization.service.ts:318,338,358` — uses string literals like `'pending'`, `'active'`
**Status:** These happen to match because the enum was defined with lowercase values. However, the code uses raw string literals instead of importing the enum, which means no compile-time safety if the enum values change.
**Severity:** MEDIUM — fragile; a rename of the enum value breaks silently at runtime

### M-05: FeedInteraction has three separate @@unique constraints — logInteraction only uses one at a time

**Schema:** `@@unique([userId, postId])`, `@@unique([userId, reelId])`, `@@unique([userId, threadId])` on FeedInteraction
**Runtime:** `feed.service.ts:65` — upserts on `userId_postId` only. No code path upserts on `userId_reelId` or `userId_threadId`. The reel and thread interaction logging goes through `ReelInteraction.upsert` and the feed service does not use the thread/reel unique constraints.
**Impact:** The `@@unique([userId, reelId])` and `@@unique([userId, threadId])` constraints exist but are never leveraged for upserts. They serve as passive integrity guards but could cause unexpected P2002 if a code path tries to create FeedInteraction with reelId/threadId without checking uniqueness first.
**Severity:** MEDIUM — unused constraints; potential surprise P2002

### M-06: Report model has 7 @@unique constraints for dedup, but story reports bypass all of them

**Schema:** Report has `@@unique([reporterId, reportedPostId])`, `@@unique([reporterId, reportedCommentId])`, etc.
**Runtime:** `stories.service.ts:745-764` — reports a story by creating a Report with only `reportedUserId` set (no postId, commentId, etc.). The unique constraint for `[reporterId, reportedUserId]` WOULD fire, but the dedup check at line 746 uses a string match on `description` field instead. This means:
1. Two reports for different stories by the same user against the same story owner would trigger the `@@unique([reporterId, reportedUserId])` constraint and crash
2. But two reports for stories by DIFFERENT owners would not be deduped at all
**Impact:** Story reporting dedup is inconsistent with the rest of the report system
**Severity:** MEDIUM

### M-07: Tip model @@unique([senderId, receiverId, createdAt]) — practically useless constraint

**Schema:** `@@unique([senderId, receiverId, createdAt])` on Tip (line 3127)
**Impact:** `createdAt` uses `@default(now())` which is microsecond-precise. Two tips from the same sender to the same receiver in the same microsecond are astronomically unlikely. This constraint provides zero practical dedup protection while adding index overhead.
**Severity:** MEDIUM (LOW for data integrity, MEDIUM for wasted resources)

---

## LOW Findings

### L-01: VideoInteraction model marked @deprecated — still has schema space and indexes

**Schema:** `VideoInteraction` at line 3048 is commented as deprecated with zero code references.
**Impact:** Dead table with indexes consuming DB resources.
**Severity:** LOW — cleanup candidate

### L-02: VideoCommentLike model marked @deprecated — join table never wired

**Schema:** `VideoCommentLike` at line 5225 is deprecated.
**Impact:** Same as L-01.
**Severity:** LOW

### L-03: LocalBoard, SharedCollection, VolunteerOpportunity marked @deprecated

**Schema:** Three models marked as dead at lines 4364, 4544, 4444.
**Impact:** Same as L-01.
**Severity:** LOW

### L-04: VideoClip model marked @deprecated — zero code references

**Schema:** `VideoClip` at line 3812 is deprecated.
**Severity:** LOW

### L-05: ChatFolder.conversationIds — dangling FK stored as String array

**Schema:** `conversationIds String[]` at line 4618, comment says "Dangling FK: stores Conversation IDs without relation"
**Impact:** If a conversation is deleted, its ID persists in chat folders with no cascade cleanup. Not a crash risk but data integrity gap.
**Severity:** LOW — documented, deferred

### L-06: StageSession.speakerIds — dangling FK stored as String array

**Schema:** `speakerIds String[]` at line 4764, comment says "Dangling FK: stores User IDs without relation"
**Impact:** Same as L-05 — deleted users persist as phantom speaker IDs.
**Severity:** LOW — documented, deferred

### L-07: Post.hiddenFromUserIds — dangling FK stored as String array

**Schema:** `hiddenFromUserIds String[]` at line 1279
**Impact:** Same pattern — no cascade on user deletion.
**Severity:** LOW — documented, deferred

### L-08: HashtagFollow model has no service code that creates records

**Schema:** `HashtagFollow` at line 3409 with `@@id([userId, hashtagId])`
**No create calls found** in any service file for `hashtagFollow.create`. The model exists in schema but has zero write paths. Hashtag following appears unimplemented.
**Severity:** LOW — dead model, no crash risk

### L-09: Multiple indexes on the same leading column as an existing unique/PK

These are already annotated with comments in the schema (e.g., "redundant: @unique"), which shows prior audit awareness. Confirmed redundant indexes are properly documented.
**Severity:** INFO — already acknowledged

---

## Verified GOOD Patterns (not findings)

These areas were checked and found to be correctly implemented:

| Area | Pattern | Verdict |
|------|---------|---------|
| StoryView.create | P2002 catch in try/catch at stories.service.ts:366 | GOOD |
| Follow create | P2002 handling in follows.service.ts | GOOD |
| Block create | P2002 handling in blocks.service.ts | GOOD |
| Mute create | P2002 handling in mutes.service.ts | GOOD |
| Restrict create | P2002 handling in restricts.service.ts | GOOD |
| FeedInteraction | Upsert pattern at feed.service.ts:65 | GOOD |
| ReelInteraction | Upsert pattern at reels.service.ts:684 | GOOD |
| WatchHistory | Upsert pattern at videos.service.ts:916 | GOOD |
| StoryStickerResponse | Upsert pattern at stories.service.ts:601,701 | GOOD |
| MembershipSubscription | Upsert pattern at monetization.service.ts:336 | GOOD |
| OfflineDownload | Upsert pattern at downloads.service.ts:35 | GOOD |
| Device | Upsert pattern at devices.service.ts:29 | GOOD |
| UserSettings | Upsert pattern at auth.service.ts:173 | GOOD |
| OG service | Null-checks user before access at og.service.ts:59,79,122 | GOOD |
| PostTaggedUser.createMany | Uses skipDuplicates:true at posts.service.ts:529 | GOOD |
| Report.create | P2002 handling in reports.service.ts (via try/catch) | GOOD |
| clientMessageId dedup | Pre-check + relies on @unique constraint at messages.service.ts:232 | GOOD |
| Poll P2002 | Handled in polls.service.ts | GOOD |
| Auth user upsert | Proper upsert at auth.service.ts:143 | GOOD |

---

## Summary by Checklist

| # | Question | Findings |
|---|----------|----------|
| 1 | @@unique that code doesn't handle P2002 for? | H-01 (StoryHighlightAlbum), H-02 (CommunityRole), H-03 (ChannelPostLike), H-04 (ConversationMember), H-05 (WaitlistEntry) |
| 2 | Composite index not aligned with query patterns? | M-05 (FeedInteraction reel/thread uniques unused), M-07 (Tip createdAt unique useless) |
| 3 | Enum value used in code but missing from schema? | C-02 (mobile 'AUDIO' not in MessageType enum) |
| 4 | Schema enum value never used in code? | L-08 (HashtagFollow entire model dead) |
| 5 | Required field that creation code doesn't provide? | None found — all creates provide required fields |
| 6 | Optional field that code uses without null check? | M-01 (chat-export sender null dereference) |
| 7 | onDelete rule that differs from runtime cleanup? | L-05, L-06, L-07 (dangling FK arrays, no cascade) |
| 8 | Field type mismatch (String in schema but number in code)? | C-01 (BigInt not serialized), C-03 (enum case mismatch), M-03 (LiveType enum mismatch) |

---

## Totals

| Severity | Count |
|----------|-------|
| CRITICAL | 3 |
| HIGH | 6 |
| MEDIUM | 7 |
| LOW | 9 |
| **Total** | **25** |
