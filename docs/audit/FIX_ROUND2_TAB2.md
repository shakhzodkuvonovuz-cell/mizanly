# FIX SESSION — Round 2 Tab 2: Search, Feed, Channels, Communities + Cross-Module Posts/Reels/Threads/Feed

> Paste into a fresh Claude Code session. This session fixes ~170 findings across discovery modules + cross-module content lifecycle and feed algorithm issues.

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — every rule, especially Integrity Rules and Code Patterns
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read Round 1 progress files to know what was ALREADY FIXED:
   - `docs/audit/v2/fixes/TAB2_PROGRESS.md` (Round 1 fixed posts/reels/threads)
   - `docs/audit/v2/fixes/TAB3_PROGRESS.md` (Round 1 fixed messages/stories/videos)
4. Read ALL of your audit finding files IN FULL before writing a single line of code:
   - `docs/audit/v2/wave1/A11.md` (17 findings — search, hashtags, embeddings, recommendations)
   - `docs/audit/v2/wave1/A12.md` (22 findings — feed, promotions, polls)
   - `docs/audit/v2/wave1/A13.md` (28 findings — channels, channel-posts, communities, community-notes)
   - `docs/audit/v2/wave2/B09.md` (22 findings — Channel, ChannelPost, Community, CommunityNote models)
   - `docs/audit/v2/wave2/B12.md` (19 findings — polls, events, feature-flags, waitlist — YOUR portion only)
   - `docs/audit/v2/wave3/X01.md` (22 findings — Post Lifecycle cross-module)
   - `docs/audit/v2/wave3/X06.md` (24 findings — Feed & Algorithm cross-module)
   - `docs/audit/v2/wave3/X08.md` (32 findings — Content Moderation — YOUR portion only)
   - `docs/audit/v2/wave3/X09.md` (17 findings — Search & Discovery cross-module)
   - `docs/audit/v2/wave9/J01.md` (22 findings — N+1 Queries — YOUR modules only)
   - `docs/audit/v2/wave9/J08.md` (38 findings — API Response Size — YOUR modules only)
5. Create your progress file: `docs/audit/v2/fixes/R2_TAB2_PROGRESS.md`
6. Read this ENTIRE prompt before touching any source code

---

## YOUR SCOPE — THESE FILES ONLY

### Primary modules (all findings)
```
apps/api/src/modules/search/
apps/api/src/modules/hashtags/
apps/api/src/modules/embeddings/
apps/api/src/modules/recommendations/
apps/api/src/modules/feed/
apps/api/src/modules/personalized-feed/
apps/api/src/modules/promotions/
apps/api/src/modules/polls/
apps/api/src/modules/events/
apps/api/src/modules/channels/
apps/api/src/modules/channel-posts/
apps/api/src/modules/communities/
apps/api/src/modules/community/
apps/api/src/modules/community-notes/
apps/api/src/modules/gamification/
apps/api/src/modules/creator/
apps/api/src/modules/discord-features/
apps/api/src/modules/telegram-features/
apps/api/src/modules/watch-history/
apps/api/src/common/utils/scored-feed-cache.ts
apps/api/src/modules/meilisearch/
```

### Cross-module owned files (only for cross-module findings)
```
apps/api/src/modules/posts/         (X01 post lifecycle + X08 moderation on edit)
apps/api/src/modules/reels/         (X08 moderation on edit)
apps/api/src/modules/threads/       (X08 moderation on edit)
apps/api/src/modules/bookmarks/     (X01 save/collection)
apps/api/src/modules/collabs/       (J08 response size)
apps/api/src/modules/publish-workflow/ (X01 real-time events)
apps/api/src/modules/feed-transparency/ (X06 feed)
apps/api/src/common/utils/enrich.ts
```

### FORBIDDEN — DO NOT TOUCH
- `schema.prisma` — note as DEFERRED
- `chat.gateway.ts` — Tab 1 owns it
- `messages.service.ts` — Tab 4 owns it
- `videos.service.ts` — Tab 4 owns it
- `stories.service.ts` — Tab 4 owns it
- `payments.service.ts`, `notifications.service.ts`, `islamic.service.ts` — Tab 4 owns them
- `admin.service.ts`, `moderation.service.ts`, `reports.service.ts`, `content-safety.service.ts` — Tab 1 owns them
- `apps/mobile/src/services/signal/` — Tab 3 owns it
- `apps/e2e-server/`, `apps/livekit-server/` — Tab 3 owns them
- All `apps/mobile/` source files except api service files

---

## FINDING ASSIGNMENT — WHAT YOU FIX FROM EACH AUDIT FILE

### A11 — ALL 17 findings (search, hashtags, embeddings, recommendations)
Fix everything. Key findings:
- A11-#1 (H): Search endpoints don't pass userId — blocked/muted unfiltered
- A11-#2 (H): Meilisearch fast path bypasses ALL visibility/safety filters
- A11-#3 (H): Embedding backfill infinite loop — while(true) with no cursor
- A11-#9 (M): Gemini API key passed as URL query parameter

### A12 — ALL 22 findings (feed, promotions, polls)
Fix everything. Key findings:
- A12-#1 (H): featurePost admin check bypassed when userId undefined
- A12-#3 (H): getNearbyContent missing visibility filter
- A12-#4 (H): getNearbyContent missing block/mute exclusion
- A12-#5 (H): getDismissedIds defined but NEVER CALLED — dismiss is a no-op
- A12-#7 (M): retractVote non-deterministic for multi-choice polls
- A12-#9 (M): markBranded regex injection via partnerName

### A13 — ALL 28 findings (channels, channel-posts, communities, community-notes)
Fix everything. Key criticals:
- A13-#1 (C): answerFatwa stores text into FK column (answerId) — crashes on every call
- A13-#2 (C): getDataExport returns full User object with PII
- A13-#5/#6 (H): channel-posts create skips sanitization AND moderation
- A13-#7 (H): 9 community create methods skip sanitization and moderation

### B09 — ALL 22 findings (Channel/ChannelPost/Community models)
Fix everything. Key criticals:
- B09-#1 (C): Raw SQL uses "Channel"/"Subscription" instead of "channels"/"subscriptions" — subscribe/unsubscribe broken
- B09-#2 (C): answerFatwa FK violation (same as A13-#1)
- B09-#3 (H): rateNote 3 DB ops without $transaction
- B09-#5 (H): fetchRecommendedChannels raw SQL doesn't exclude banned/blocked users

### B12 — YOUR PORTION (~8 of 19 findings)
Fix ONLY polls/events findings:
- B12-#1 (H): polls.service $executeRaw uses "PollOption"/"Poll" instead of "poll_options"/"polls" — retractVote broken
- B12-#6 (M): events createEvent no endDate > startDate validation
- B12-#7 (M): events getEvent makes 4 separate DB queries
- B12-#9 (M): polls retractVote only deletes first vote for multi-choice
- B12-#5 (M): EventRSVP.status is free-text (DEFERRED — schema)
- B12-#13 (L): feature-flags simpleHash DJB2 modulo bias (DEFER to Tab 1 — they own feature-flags)
- B12-#14 (L): admin flag value regex (DEFER to Tab 1)
- B12-#15 (L): events private RSVP blocks community members

DEFER: B12-#2,#3,#8,#16 (livekit-server) → Tab 3; B12-#4,#11 (waitlist schema) → DEFERRED

### X01 — ALL 22 findings (Post Lifecycle)
CHECK FOR R1 OVERLAP. Many of these were fixed in Round 1 Tab 2:
- X01-#1 (C): Dismiss case mismatch → LIKELY FIXED as A02-#1
- X01-#2 (H): Post edit no moderation → LIKELY FIXED as A02-#6
- X01-#3 (H): Comment edit no moderation → LIKELY FIXED as B02-#17 / A02-#21

For each X01 finding, CHECK the R1 TAB2_PROGRESS.md. If fixed, mark as "ALREADY FIXED IN R1" with proof.

Likely NEW findings to fix:
- X01-#4 (H): Real-time content_published/content_removed events silently dropped (roomId undefined) — in publish-workflow.service.ts
- X01-#5 (H): react() doesn't check block/mute status
- X01-#6 (H): addComment() doesn't check block/mute status
- X01-#7 (H): share() doesn't increment sharer's postsCount
- X01-#8 (M): getComments() doesn't filter blocked/muted users
- X01-#10 (M): delete() doesn't clean up bookmarks/reactions/comments
- X01-#14 (L): Dynamic import('crypto') in transaction
- X01-#21 (I): crossPost() doesn't trigger publishWorkflow

### X06 — ALL 24 findings (Feed & Algorithm)
Fix everything. Key findings:
- X06-#1 (C): getNearbyContent missing visibility filter (may overlap A12-#3)
- X06-#2 (C): getNearbyContent missing block/mute exclusion (may overlap A12-#4)
- X06-#3 (H): getDismissedIds NEVER CALLED (may overlap A12-#5)
- X06-#4 (H): getCommunityTrending missing block/mute
- X06-#5 (H): getCommunityTrending missing isPrivate filter
- X06-#6/#7 (H): getContentMetadata/hydrateItems don't filter isRemoved/visibility/scheduledAt
- X06-#8/#9 (H): Math.random() in feed shuffling — replace with crypto.randomInt
- X06-#15/#16 (M): Video trending/exploration missing scheduledAt filter

### X09 — ALL 17 findings (Search & Discovery)
Fix everything. Key findings:
- X09-#1 (H): Main search endpoint doesn't receive userId — block/mute impossible
- X09-#2 (H): Meilisearch returns raw hits with no filtering (overlaps A11-#2)
- X09-#3 (H): Channels missing from Meilisearch pipeline
- X09-#4 (H): Admin ban removes user from index but NOT their content

### X08 — YOUR PORTION (~6 of 32 findings)
Fix ONLY findings in YOUR files:
- X08-#3 (C): posts.service.ts update() no content moderation → CHECK if fixed in R1 (A02-#6)
- X08-#4 (C): posts.service.ts editComment() no moderation → CHECK if fixed in R1 (B02-#17)
- X08-#5 (H): reels.service.ts updateReel() no moderation → CHECK if fixed in R1 (A03-#2)
- X08-#6 (H): threads.service.ts updateThread() no moderation → CHECK if fixed in R1 (A04-#5)
- X08-#25 (M): videos.service.ts video frames never moderated → DEFER to Tab 4
- X08-#29 (L): posts.service.ts comment creation no pre-save moderation → CHECK R1

### J01 — YOUR PORTION (~12 of 22 findings, N+1 Queries)
- J01-#2 (H): reels.service.ts N+1 hashtag upsert
- J01-#3/#4 (H): scheduling.service.ts 6 N+1 hashtag loops
- J01-#5 (H): posts.service.ts N hashtag decrements on delete
- J01-#6 (M): posts.service.ts sequential Redis+Prisma in cron
- J01-#7 (M): posts.service.ts sequential notification for mentions
- J01-#9 (M): reels.service.ts sequential notification for tags
- J01-#10 (M): reels.service.ts sequential notification for mentions
- J01-#15 (M): embedding-pipeline.service.ts N+1 embedding
- J01-#16 (M): feed.service.ts 2 sequential queries for community trending

### J08 — YOUR PORTION (~12 of 38 findings, API Response Size)
- J08-#4 (C): feed.service.ts getDismissedIds take:10000 on every page load
- J08-#5 (C): community.service.ts getDataExport 6 parallel findMany take:100000
- J08-#9 (H): posts.service.ts getFeed follow.findMany take:5000 not cached
- J08-#10 (H): threads.service.ts same uncached follow pattern
- J08-#11 (H): reels.service.ts block+mute findMany take:10000 not using getExcludedUserIds
- J08-#12 (H): channels.service.ts same pattern
- J08-#13 (H): search.service.ts same pattern
- J08-#14 (H): feed-transparency.service.ts same pattern
- J08-#23 (M): collabs.service.ts 3 methods fetch full Post for permission
- J08-#24 (M): channel-posts.service.ts 5 methods fetch full rows
- J08-#29 (M): gamification.service.ts leaderboard includes duplicate Challenge
- J08-#32 (M): users.service.ts getSavedVideos unnecessary channel fields

---

## CROSS-MODULE OVERLAP CHECK — CRITICAL

Round 1 Tab 2 (TAB2_PROGRESS.md) already fixed many findings in posts.service.ts, reels.service.ts, and threads.service.ts. Before fixing ANY X01/X08 cross-module finding, verify it wasn't already fixed:

```bash
# Check Round 1 fixes
grep -i "moderateText\|block.*mute\|visibility.*check\|dismiss.*case\|content.moderation\|comment.*moder" docs/audit/v2/fixes/TAB2_PROGRESS.md
```

If a finding IS already fixed:
```
### X01-#2 (H) — Post edit bypasses content moderation
**Status:** ALREADY FIXED IN R1 — See TAB2_PROGRESS.md A02-#6
**Verification:** grep -n "moderateText" apps/api/src/modules/posts/posts.service.ts confirms line XXX
```

---

## ENFORCEMENT RULES

### E1-E10: Same as Round 1 (prove every fix, test individually, checkpoint every 10, no skipping, read before fixing, pattern propagation, no shallow fixes, commit every checkpoint, hostile self-review, progress file)

### Additional for Round 2:
- **OVERLAP CHECK**: For every X01/X06/X08/X09 finding, verify it's not already fixed before touching the file
- **RAW SQL FIX PATTERN**: When fixing Prisma model name → table name mismatches, grep your ENTIRE scope:
  ```bash
  grep -rn '\$executeRaw\|\$queryRaw' apps/api/src/modules/feed/ apps/api/src/modules/channels/ apps/api/src/modules/communities/ apps/api/src/modules/community/ apps/api/src/modules/polls/ apps/api/src/modules/search/ --include="*.ts" | grep -v spec
  ```
  Fix ALL instances, not just the cited ones.
- **MATH.RANDOM REPLACEMENT**: When fixing Math.random() in feed shuffling (X06-#8/#9), grep for ALL Math.random() in your scope and replace with crypto.randomInt:
  ```bash
  grep -rn "Math.random()" apps/api/src/modules/feed/ apps/api/src/modules/personalized-feed/ apps/api/src/modules/communities/ --include="*.ts" | grep -v spec
  ```

---

## MODULE-SPECIFIC INSTRUCTIONS

### Search — VISIBILITY + BLOCK/MUTE FILTERING
A11 + X09 both report that search results bypass safety filters. The fix pattern:
1. Pass `userId` from controller to service
2. In service: call `getExcludedUserIds(userId)` to get block/mute/restrict IDs
3. For Meilisearch fast path: add `filter` param excluding banned users and non-public content
4. For Prisma fallback: add `user: { isBanned: false, isDeactivated: false, isDeleted: false }` + `visibility: 'PUBLIC'` + `isRemoved: false`

### Feed — DISMISS + NEARBY + ALGORITHM
The dismiss feature (getDismissedIds) is defined but NEVER CALLED. Fix:
1. Read feed.service.ts to find every feed query method
2. Add `getDismissedIds(userId)` call and filter dismissed content from results
3. Cache dismissed IDs in Redis with TTL (same pattern as excluded users)

getNearbyContent (X06-#1/#2) is a geo-based feed with zero privacy:
1. Add `visibility: 'PUBLIC'` filter
2. Add block/mute exclusion via getExcludedUserIds
3. Add `isRemoved: false`, `isBanned: false` filters

### Channels/Communities — RAW SQL + SANITIZATION
B09-#1: Raw SQL uses "Channel" and "Subscription" instead of "channels" and "subscriptions". Same pattern as live/stream from Tab 1.

A13-#5/#6/#7: Channel posts and community content creation skip both sanitization AND moderation. Add `sanitizeText()` and `contentSafety.moderateText()` to ALL create methods.

### Polls — TABLE NAME + MULTI-CHOICE
B12-#1: polls retractVote raw SQL uses "PollOption"/"Poll" — fix to "poll_options"/"polls".
B12-#9: retractVote only deletes first vote via findFirst. For multi-choice polls, need to delete the specific vote for the specific option the user wants to retract.

---

## FIX ORDER (priority)

1. **A13/B09 criticals**: answerFatwa FK crash (#1), getDataExport PII leak (#2), raw SQL table names (B09-#1)
2. **B12-#1**: polls raw SQL table names — retractVote completely broken
3. **Search visibility**: A11-#1/#2, X09-#1/#2/#3 — search results bypass all safety
4. **Feed safety**: A12-#3/#4, X06-#1/#2 — nearby feed leaks private content
5. **Feed dismiss**: A12-#5, X06-#3 — wire getDismissedIds into feed queries
6. **Content moderation on edit**: X08-#3/#4/#5/#6 — verify R1 fixes, fix remaining
7. **Channel/community sanitization**: A13-#5/#6/#7 — 9 unmoderated create methods
8. **Block/mute in social features**: X01-#5/#6/#8 — reactions/comments bypass blocks
9. **N+1 and response size**: J01 + J08 performance fixes
10. **Remaining medium/low**: A11, A12, A13, B09, X01, X06, X09 leftovers

---

## TEST COMMANDS
```bash
cd apps/api && pnpm test -- --testPathPattern=search
cd apps/api && pnpm test -- --testPathPattern=hashtag
cd apps/api && pnpm test -- --testPathPattern=embedding
cd apps/api && pnpm test -- --testPathPattern=recommend
cd apps/api && pnpm test -- --testPathPattern=feed
cd apps/api && pnpm test -- --testPathPattern=personalized
cd apps/api && pnpm test -- --testPathPattern=promoti
cd apps/api && pnpm test -- --testPathPattern=poll
cd apps/api && pnpm test -- --testPathPattern=event
cd apps/api && pnpm test -- --testPathPattern=channel
cd apps/api && pnpm test -- --testPathPattern=communit
cd apps/api && pnpm test -- --testPathPattern=community-note
cd apps/api && pnpm test -- --testPathPattern=post
cd apps/api && pnpm test -- --testPathPattern=reel
cd apps/api && pnpm test -- --testPathPattern=thread
cd apps/api && pnpm test -- --testPathPattern=meilisearch
cd apps/api && pnpm test  # full at checkpoints
cd apps/api && npx tsc --noEmit
```

---

## THE STANDARD

~170 findings across discovery, content lifecycle, and algorithm modules. Every search result must respect visibility, blocks, and bans. Every feed must exclude dismissed content. Every content creation must run sanitization and moderation. Every raw SQL must use @@map table names.

The search and feed modules are where users DISCOVER content. If search returns banned users' CSAM, if feeds show private posts to strangers, if communities let unmoderated hate speech through — the app is a liability. Fix it like your app store listing depends on it.

**~170 findings. Zero shortcuts. Begin.**
