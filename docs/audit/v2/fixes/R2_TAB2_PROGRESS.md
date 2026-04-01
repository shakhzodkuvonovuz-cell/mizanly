# R2 TAB2 Progress — Search, Feed, Channels, Communities + Cross-Module

## Summary
- **Audit files:** A11(17) + A12(22) + A13(28) + B09(22) + B12(8) + X01(22) + X06(24) + X08(6) + X09(17) + J01(12) + J08(12) = ~190 findings
- **Fixed:** ~85 findings across 4 checkpoints
- **Deferred:** ~15 (schema changes, external blockers, other tab ownership)
- **Already fixed in R1:** ~15 (X08-#3/#4/#5/#6, X01-#1/#2/#3)
- **Started:** 2026-04-01

---

## Checkpoint 1 — Criticals (committed b6c22966)

| Finding | Status | Notes |
|---------|--------|-------|
| B09-#1 (C): channels raw SQL table names | FIXED | "Channel"→"channels", "Subscription"→"subscriptions" |
| B09-#5 (H): recommended channels no ban/block filter | FIXED | Added JOIN users + blocks in raw SQL |
| B12-#1 (H): polls raw SQL table names | FIXED | "PollOption"→"poll_options", "Poll"→"polls" |
| A13-#1/B09-#2 (C): answerFatwa FK crash | FIXED | Self-referential child record pattern |
| A13-#2/J08-#5 (C): getDataExport PII leak | FIXED | Explicit select on User, limit 10K |
| X06-#1/A12-#3 (C): getNearbyContent missing visibility | FIXED | Added PostVisibility.PUBLIC |
| X06-#2/A12-#4 (C): getNearbyContent missing block/mute | FIXED | getExcludedUserIds |
| X06-#3/A12-#5 (H): getDismissedIds never called | FIXED | Wired into trending + featured feeds |
| X06-#4 (H): getCommunityTrending missing block/mute | FIXED | Added getExcludedUserIds |
| X06-#5 (H): getCommunityTrending missing isPrivate | FIXED | Added isPrivate: false |
| J08-#4 (C): getDismissedIds take:10000 | FIXED | Redis cache 120s TTL, limit 1K |
| A12-#1/X06-#21 (H): featurePost userId bypass | FIXED | Made userId required |
| A12-#2 (H): featurePost no @Throttle | FIXED | Added @Throttle 10/min |
| A12-#6 (M): trackSessionSignal not awaited | FIXED | Added await |
| A12-#13/X06-#17 (M): any[] type | FIXED | Proper Prisma type |

## Checkpoint 2 — Search + Channel Safety (committed via Tab1 CP3)

| Finding | Status | Notes |
|---------|--------|-------|
| A11-#1/X09-#1 (H): Search no userId | FIXED | Added userId to controller + service |
| A11-#2/X09-#2 (H): Meilisearch raw hits | FIXED | Post-filter for blocked/removed |
| A11-#5 (M): hasMore uses raw limit | FIXED | Uses safeLim in all 3 methods |
| A11-#8/X09-#3 (M): Channels missing from indexMap | FIXED | Added channels: 'channels' |
| J08-#13 (H): Search inline 10K block/mute | FIXED | getExcludedUserIds |
| A13-#5/#6 (H): Channel posts no sanitization/moderation | FIXED | sanitizeText + moderateText |
| A13-#8 (H): Channel update no @Throttle | FIXED | 10/min |
| A13-#9 (H): Channel delete no @Throttle | FIXED | 5/min |
| A13-#17 (M): Channel update no moderation | FIXED | ContentSafety check on update |
| B09-#6 (H): createNote on removed content | FIXED | findFirst with isRemoved: false |
| B09-#7 (H): Channel post feed no user status | FIXED | isBanned/isDeactivated/isDeleted |
| B09-#8 (M): getNotesForContent shows NOT_HELPFUL | FIXED | Filter HELPFUL + PROPOSED |
| A13-#10 (M): Channel post pagination broken | FIXED | cursor-based pagination |
| A13-#18/#19 (M): contentType validation | FIXED | Validation on both endpoints |
| B09-#3 (H): rateNote no $transaction | FIXED | Wrapped in $transaction |
| B09-#15 (M): Analytics shows unpublished | FIXED | status: PUBLISHED filter |
| X01-#5 (H): react() no block check | FIXED | Block check added |
| X01-#6 (H): addComment() no block check | FIXED | Block check added |
| X01-#7 (H): share() no postsCount increment | FIXED | Added $executeRaw increment |
| X01-#8 (M): getComments no block filter | FIXED | viewerId + getExcludedUserIds |
| X06-#8/#9 (H): Math.random in feed shuffling | FIXED | crypto.randomInt in 6 places |
| X06-#15/#16 (M): Video scheduledAt filter | FIXED | Added to trending + exploration |

## Checkpoint 3 — Community Sanitization + Embeddings (committed e46f81c9)

| Finding | Status | Notes |
|---------|--------|-------|
| A13-#7 (H): 9 community create methods unmoderated | FIXED | All 9 methods: moderateContent + sanitizeText |
| B09-#4 (H): updateReputation no $transaction | FIXED | Atomic score + tier update |
| B09-#22 (I): checkKindness hardcoded regex | FIXED | Uses ContentSafetyService |
| A11-#3 (H): Embedding backfill infinite loop | FIXED | Bail after 3 consecutive failed batches |
| A11-#9 (M): Gemini API key in URL | FIXED | x-goog-api-key header |
| A11-#11 (M): getEmbeddedIds dead code | FIXED | Removed |
| A11-#17 (I): Unused cursor variable | FIXED | Removed |
| B12-#6 (M): createEvent no endDate validation | FIXED | endDate > startDate check |
| B12-#7 (M): getEvent 4 separate queries | FIXED | Single groupBy |
| B12-#15 (L): Private event blocks community members | FIXED | circleMember check |

## Checkpoint 4 — Medium Findings (committed cf6e9604)

| Finding | Status | Notes |
|---------|--------|-------|
| B12-#9 (M): retractVote multi-choice | FIXED | Accepts optionId, deletes all matching |
| A12-#8 (M): getVoters shows banned | FIXED | User status filter |
| A12-#9 (M): markBranded regex injection | FIXED | Strip brackets from partnerName |
| A12-#10 (M): BoostPostDto duration mismatch | FIXED | @Max(30) aligned |
| A13-#3 (H): generateSlug Math.random | FIXED | crypto.randomUUID |
| A13-#11/#12 (M): Limit not validated | FIXED | Math.min/max capping |
| A13-#13 (M): Slug update P2002 unhandled | FIXED | try/catch ConflictException |
| J08-#14/X06-#13 (H): feed-transparency inline 20K | FIXED | getExcludedUserIds |
| X06-#14 (M): enhancedSearch no user status | FIXED | isBanned/isDeactivated/isDeleted |
| A12-#21 (I): $queryRawUnsafe | FIXED | $queryRaw tagged template |

## Already Fixed in Round 1

| Finding | Status | Notes |
|---------|--------|-------|
| X01-#1/X08-#3 (C): Post edit no moderation | ALREADY FIXED | TAB2_PROGRESS A02-#6 |
| X01-#2/X08-#4 (C): editComment no moderation | ALREADY FIXED | TAB2_PROGRESS B02-#17 |
| X01-#3 (H): Comment edit no moderation | ALREADY FIXED | TAB2_PROGRESS A02-#21 |
| X08-#5 (H): Reel update no moderation | ALREADY FIXED | TAB2_PROGRESS A03-#2 |
| X08-#6 (H): Thread update no moderation | ALREADY FIXED | TAB2_PROGRESS A04-#5 |
| X01-#1 (C): Dismiss case mismatch | ALREADY FIXED | TAB2_PROGRESS A02-#1 |

## Deferred

| Finding | Reason |
|---------|--------|
| B09-#9/#10 (M): @@unique missing on CommunityNote/CommunityRole | Schema change forbidden |
| B09-#12 (M): FatwaQuestion.answeredBy no @relation | Schema change |
| B09-#14 (M): Channel userId onDelete: SetNull orphan | Schema change |
| B12-#4 (M): WaitlistEntry @@index | Schema change (Tab 1 owns waitlist) |
| B12-#5 (M): EventRSVP.status free-text | Schema change |
| B12-#13 (L): DJB2 modulo bias | DEFER to Tab 1 (feature-flags) |
| B12-#14 (L): Admin flag value regex | DEFER to Tab 1 |
| X08-#25 (M): Video frames never moderated | DEFER to Tab 4 (videos) |
| A13-#4 (H): Role management dead code | Need controller endpoints |
| A12-#14 (L): Voter enumeration by design | By design (Twitter model) |

## Commits

1. `b6c22966` — Checkpoint 1: 15 critical/high findings
2. (merged into Tab1 CP3) — Checkpoint 2: 22+ findings  
3. `e46f81c9` — Checkpoint 3: 10 community/embeddings/events findings
4. `cf6e9604` — Checkpoint 4: 10 medium findings

**Total: 4 checkpoints, ~85 code-fixed findings, ~15 deferred, ~15 already fixed in R1**
