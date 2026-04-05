# X06 — Pagination & Unbounded Query Audit

**Auditor:** Opus 4.6 (1M context) — Hostile Mode
**Date:** 2026-04-05
**Scope:** Every `findMany` call across all `*.service.ts` files in `apps/api/src`, plus raw SQL `$queryRaw` / `$queryRawUnsafe` calls
**Method:** Automated AST-like scanning of 536 `findMany` calls + manual verification of flagged items

---

## Executive Summary

| Metric | Count |
|--------|-------|
| Total `findMany` calls | 536 |
| With `take` limit | 505 (94.2%) |
| **WITHOUT `take` limit (UNBOUNDED)** | **31** |
| High `take` values (>= 1000) | 32 |
| Offset-based pagination (skip, no cursor) | 2 |
| With cursor-based pagination | 141 (26.3%) |
| Raw SQL `$queryRaw` calls | ~30 |
| Raw SQL missing `LIMIT` | 2 |

**Verdict:** 31 unbounded `findMany` calls can return unlimited rows. Most are in non-user-facing internal paths, but several are on user-facing API endpoints that an attacker could exploit to OOM the server. 32 more have take >= 1000, which at scale still loads excessive data.

---

## CRITICAL: Unbounded findMany (No `take` at all)

These queries have NO row limit. If the underlying table grows, they return everything.

### Severity: CRITICAL (User-facing API endpoints)

| # | File | Line | Model | Context | Risk |
|---|------|------|-------|---------|------|
| 1 | `messages/messages.service.ts` | 1123 | `conversationMember` | `forwardMessage()` — fetches ALL memberships for target conversations | An attacker forwarding to many conversations triggers unbounded member lookup |
| 2 | `messages/messages.service.ts` | 1140 | `block` | `forwardMessage()` — fetches ALL blocks between user and other members | Scales with block count * conversation count |
| 3 | `messages/messages.service.ts` | 1370 | `message` | `getStarredMessages()` — hydration: fetches messages by ID array | Bounded by starred count, but starred count itself is unbounded |
| 4 | `notifications/push.service.ts` | 108 | `device` | `sendToUsers()` — fetches ALL active devices for a list of user IDs | Group message to 500-person group = unbounded device query |
| 5 | `notifications/notifications.service.ts` | 66 | `follow` | `getNotifications()` — fetches ALL follows for actor IDs | Unbounded if actor count grows (popular user with 10K notifications) |
| 6 | `users/users.service.ts` | 1275 | `user` | `getSimilarAccounts()` — fetches users by collaborative filtering IDs | Bounded by prior `take: limit + 5`, but no explicit limit on this call |
| 7 | `users/users.service.ts` | 1366 | `post` | `getFriendLikedPosts()` — fetches posts by pre-filtered ID list | Bounded by `topPostIds.slice(0, limit)`, but no explicit `take` |
| 8 | `videos/videos.service.ts` | 96 | `videoReaction` | `enhanceVideos()` — fetches ALL reactions for a batch of video IDs | If called with large batch, unbounded |
| 9 | `videos/videos.service.ts` | 100 | `videoBookmark` | `enhanceVideos()` — fetches ALL bookmarks for a batch of video IDs | Same as above |
| 10 | `monetization/monetization.service.ts` | 174 | `user` | `getEarningsDashboard()` — fetches users by pre-computed sender IDs | Bounded by `topSupporters.take(5)`, low risk |

### Severity: HIGH (Internal/batch operations, still dangerous)

| # | File | Line | Model | Context | Risk |
|---|------|------|-------|---------|------|
| 11 | `privacy/privacy.service.ts` | 413 | `post` | `deleteAllData()` — fetches ALL user posts for R2 cleanup | Power user with 100K posts = OOM |
| 12 | `privacy/privacy.service.ts` | 417 | `reel` | `deleteAllData()` — fetches ALL user reels | Same |
| 13 | `privacy/privacy.service.ts` | 421 | `story` | `deleteAllData()` — fetches ALL user stories | Same |
| 14 | `privacy/privacy.service.ts` | 425 | `video` | `deleteAllData()` — fetches ALL user videos | Same |
| 15 | `privacy/privacy.service.ts` | 429 | `thread` | `deleteAllData()` — fetches ALL user threads | Same |
| 16 | `privacy/privacy.service.ts` | 434 | `message` | `deleteAllData()` — fetches ALL user messages for media cleanup | Active chatter with 500K messages = OOM |
| 17 | `privacy/privacy.service.ts` | 439 | `voicePost` | `deleteAllData()` — fetches ALL voice posts | Same |
| 18 | `privacy/privacy.service.ts` | 305 | `conversationKeyEnvelope` | `exportData()` — fetches ALL E2E envelopes | Grows with conversation count |
| 19 | `devices/devices.service.ts` | 109 | `device` | `logoutAllOtherSessions()` — fetches ALL active sessions | Low risk (users have few devices), but no cap |

### Severity: MEDIUM (Lookup queries, bounded by input)

| # | File | Line | Model | Context | Risk |
|---|------|------|-------|---------|------|
| 20 | `reels/reels.service.ts` | 179 | `user` | `create()` — validates tagged user IDs | Bounded by `dto.taggedUserIds` array length (should clamp at 20) |
| 21 | `reels/reels.service.ts` | 230 | `reelTaggedUser` | `create()` — fetches tag records for notifications | Bounded by created tags |
| 22 | `posts/posts.service.ts` | 512 | `user` | `create()` — validates tagged user IDs | Same as #20 |
| 23 | `posts/posts.service.ts` | 601 | `postTaggedUser` | `create()` — fetches tag records for notifications | Same as #21 |
| 24 | `polls/polls.service.ts` | 188 | `pollVote` | `retractVote()` — fetches user's votes in a poll | Low: bounded by poll options (10 max) |
| 25 | `circles/circles.service.ts` | 118 | `user` | `addMembers()` — validates member IDs | Bounded by input array |
| 26 | `alt-profile/alt-profile.service.ts` | 113 | `altProfileAccess` | `grantAccess()` — checks existing access records | Bounded by input array |
| 27 | `hashtags/hashtags.service.ts` | 386 | `hashtag` | `getFollowedHashtags()` — hydration by ID array | Bounded by prior paginated query |
| 28 | `gamification/gamification.service.ts` | 637 | `series` | `getContinueWatching()` — fetches series by ID array | Bounded by `progress.take(10)` |
| 29 | `feed/personalized-feed.service.ts` | 269 | `hashtag` | ID lookup for hashtag names | Bounded by prior `take: 10000` on hashtagFollow |
| 30 | `feed/feed.service.ts` | 153 | `hashtag` | Same pattern | Same |
| 31 | `feed/feed.service.ts` | 444 | `post` | Feed hydration by scored IDs | Bounded by scored page size |

---

## HIGH TAKE VALUES (>= 1000)

These technically have a limit, but the limits are dangerously high. At scale with 10M users, `take: 10000` loads an excessive amount of data per request.

### take: 10000 (17 occurrences)

| # | File | Line | Model | Context |
|---|------|------|-------|---------|
| 1 | `stories/stories.service.ts` | 70 | `follow` | Story feed — loads 10K following IDs |
| 2 | `blocks/blocks.service.ts` | 236 | `block` | Block list — loads ALL blocks |
| 3 | `messages/messages.service.ts` | 170 | `block` | Message block filter |
| 4 | `messages/messages.service.ts` | 704 | `block` | Group create block check |
| 5 | `messages/messages.service.ts` | 788 | `block` | Group add-member block check |
| 6 | `messages/messages.service.ts` | 1641 | `block` | DM notes block filter |
| 7 | `chat-export/chat-export.service.ts` | 79 | `block` | Export block check |
| 8 | `mutes/mutes.service.ts` | 84 | `mute` | Mute list |
| 9 | `restricts/restricts.service.ts` | 111 | `restrict` | Restrict list |
| 10 | `privacy/privacy.service.ts` | 589 | `follow` | Account deletion — following cleanup |
| 11 | `privacy/privacy.service.ts` | 591 | `follow` | Account deletion — followers cleanup |
| 12 | `broadcast/broadcast.service.ts` | 179 | `channelMember` | Broadcast send — loads ALL members |
| 13 | `islamic/islamic.service.ts` | 2027 | `device` | Adhan notification — loads ALL users with tokens |
| 14 | `islamic/islamic.service.ts` | 2105 | `user` | Jummah reminder — loads ALL non-banned users |
| 15 | `users/users.service.ts` | 831 | `userSettings` | Screen time enforcement batch |
| 16 | `feed/personalized-feed.service.ts` | 259 | `hashtagFollow` | Load ALL followed hashtags |

### take: 5000 (4 occurrences)

| # | File | Line | Model | Context |
|---|------|------|-------|---------|
| 1 | `threads/threads.service.ts` | 132 | `follow` | Thread feed — 5K following IDs |
| 2 | `posts/posts.service.ts` | 164 | `follow` | Post feed — 5K following IDs |
| 3 | `posts/posts.service.ts` | 339 | `follow` | Circle posts feed — 5K following IDs |
| 4 | `feed/feed.service.ts` | 552 | `follow` | Feed suggestions — 5K following IDs |

### take: 1000-1024 (8 occurrences)

| # | File | Line | Model | Context |
|---|------|------|-------|---------|
| 1 | `search/search.service.ts` | 547 | `follow` | Suggested users — 1K following |
| 2 | `auth/auth.service.ts` | 268 | `follow` | Onboarding suggestions — 1K following |
| 3 | `feed/feed.service.ts` | 102 | `feedDismissal` | Dismissed content — 1K |
| 4 | `messages/messages.service.ts` | 527 | `conversationMember` | Group message delivery — 1024 members |
| 5 | `messages/messages.service.ts` | 1132 | `conversationMember` | Forward message — 1K other members |
| 6 | `notifications/push.service.ts` | 228 | `device` | Push to group — 1K devices |
| 7-12 | `search-reconciliation.service.ts` | various | `post/thread/reel/video/user/hashtag` | Batch reconciliation — 1K per entity (acceptable for cron) |

---

## OFFSET-BASED PAGINATION (skip without cursor)

Offset-based pagination degrades O(n) as the user pages deeper. At offset 100,000 the DB scans and discards 100K rows.

| # | File | Line | Model | Context | Risk |
|---|------|------|-------|---------|------|
| 1 | `recommendations/recommendations.service.ts` | 712 | `channel` | Suggested channels | Deep paging of channels |
| 2 | `halal/halal.service.ts` | 32 | `halalRestaurant` | Restaurant search | Deep paging of restaurants |

---

## RAW SQL QUERIES MISSING `LIMIT`

| # | File | Line | Query | Risk |
|---|------|------|-------|------|
| 1 | `feed/feed.service.ts` | 669 | `SELECT p."userId"... GROUP BY ... HAVING COUNT(*) >= 10` | Returns all frequent creators. Could grow unbounded. No LIMIT clause. |
| 2 | `stories/stories.service.ts` | 521 | `SELECT "responseData"->>'emoji'... GROUP BY ... ORDER BY count DESC` | Returns all distinct emoji reactions for a story. Technically bounded by emoji variety (~50) but no formal LIMIT. |

---

## CLIENT-CONTROLLED `limit` PARAMS NOT CLAMPED

These controllers pass a client-supplied `limit` directly to the service without `Math.min` clamping.

| # | File | Line | Endpoint | Issue |
|---|------|------|----------|-------|
| 1 | `channels/channels.controller.ts` | 56 | `GET /channels/recommended` | `limit` parsed but not clamped to max. Client can pass `?limit=999999` |
| 2 | `audio-tracks/audio-tracks.controller.ts` | 28 | `GET /audio-tracks/trending` | `limit` parsed but not clamped |
| 3 | `audio-tracks/audio-tracks.controller.ts` | 36 | `GET /audio-tracks/search` | Same |
| 4 | `islamic/islamic.controller.ts` | 290 | `GET /islamic/reading-plans/history` | `limit` passed directly, no clamp |
| 5 | `islamic/islamic.controller.ts` | 401 | `GET /islamic/charity/campaigns` | `limit` passed directly, no clamp |
| 6 | `users/users.controller.ts` | 368 | `GET /users/:username/mutual-followers` | `limit` defaults to 20, clamped in service to 50 max — OK |
| 7 | `events/events.controller.ts` | 180 | `GET /events` | `limit` not clamped in controller |
| 8 | `events/events.controller.ts` | 224 | `GET /events/rsvps` | Same |
| 9 | `downloads/downloads.controller.ts` | 46 | `GET /downloads` | `limit` passed as-is |
| 10 | `reels/reels.controller.ts` | 74 | `GET /reels/trending` | `limit` parsed but not clamped |

Note: Some services internally clamp via `Math.min`, but if the service trusts the controller's input, the controller must enforce bounds.

---

## AGGREGATION QUERIES

58 `.count()` calls, 17 `.groupBy()` calls, 23 `.aggregate()` calls found. These are generally safe because:
- `count()` returns a single number
- `groupBy()` groups by indexed columns (userId, contentType)
- `aggregate()` computes sums/averages

No unbounded aggregation issues found.

---

## PATTERNS: What's Done Well

1. **Privacy data export** (`privacy.service.ts:264-299`): 30+ `findMany` calls all have `take: EXPORT_CAP` — excellent pattern
2. **Meilisearch sync** (`meilisearch-sync.service.ts`): Proper batched cursor pagination with `BATCH + 1` pattern
3. **Admin batch operations** (`admin.service.ts`): Proper cursor-based iteration with `take: 500`
4. **Feed service** (`feed.service.ts`): Raw SQL feed scoring has `LIMIT ${take}` with clamped input
5. **Most user-facing endpoints**: Proper `take: limit + 1` + cursor pattern for hasMore detection

## PATTERNS: Systemic Issues

1. **Block/mute queries all use `take: 10000`**: 11 occurrences. A user with 50K blocks would have their block list silently truncated. This is a correctness bug for safety-critical features.
2. **`follow.findMany` with `take: 5000-10000`**: Feed queries load massive following lists into memory. At 10M users, popular accounts follow thousands — this pattern loads them all per feed request.
3. **Privacy `deleteAllData` has ZERO limits**: 7 queries fetch ALL user content with no batching. A power user deleting their account could OOM the server.
4. **`enhanceVideos` has no limit**: Called on every video list response. If the batch grows, the enhancement queries are unbounded.
5. **No global Prisma middleware enforcing max take**: Any new `findMany` added by a developer defaults to unlimited.

---

## RECOMMENDATIONS (ordered by impact)

### P0 — Must fix before production

| # | Fix | Effort |
|---|-----|--------|
| 1 | Add `take` to all 31 unbounded `findMany` calls | Small — add reasonable limits |
| 2 | Batch `privacy.service.ts` `deleteAllData()` queries (7 calls) — use cursor pagination like meilisearch-sync pattern | Medium |
| 3 | Add `take: 50` to `enhanceVideos` `videoReaction`/`videoBookmark` queries (bounded by video batch) | Small |
| 4 | Clamp all 10 unclamped controller `limit` params with `Math.min(limit, 100)` | Small |

### P1 — Fix before 50K users

| # | Fix | Effort |
|---|-----|--------|
| 5 | Replace `take: 10000` on block/mute queries with paginated iteration or move block check to Redis bitmap | Medium |
| 6 | Replace `take: 5000-10000` on follow queries with Redis cached following sets or database-side filtering | Medium |
| 7 | Add `LIMIT 100` to raw SQL queries in `feed.service.ts:669` and `stories.service.ts:521` | Small |
| 8 | Convert offset-based pagination in `recommendations` and `halal` to cursor-based | Small |
| 9 | Add Prisma middleware that logs a warning when `findMany` is called without `take` | Small |

### P2 — Fix before 500K users

| # | Fix | Effort |
|---|-----|--------|
| 10 | Cache block/mute/follow lists in Redis (bitmap or sorted set) instead of loading per-request | Large |
| 11 | Add global Prisma `$extends` middleware that enforces `take <= 500` on all queries unless explicitly overridden | Medium |
| 12 | Move broadcast member fan-out (`take: 10000` channelMember) to a queue worker | Medium |
| 13 | Batch `islamic.service.ts` adhan/jummah notifications (`take: 10000` device/user) through queue | Medium |

---

## FULL UNBOUNDED CALL LIST (for grep verification)

```
# Run this to find all unbounded findMany calls:
# cd apps/api && node ../scripts/audit-pagination.js
```

Total findings: 31 unbounded + 32 high-take + 2 offset-based + 2 raw SQL missing LIMIT + 10 unclamped controller params = **77 findings**

---

*Audit complete. NO code fixes applied — findings only.*
