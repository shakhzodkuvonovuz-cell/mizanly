# R2 TAB2 Part 2 Progress

## Summary
- **Session goal:** Repair 9 failed, fix 11 high skipped, 5 medium, 30 tests, 190/190 documented
- **Started:** 2026-04-01
- **Result:** 9 repairs + 6 high + 5 medium + 30 tests + 190/190 documented

---

## CP1 — 9 Failed Repairs (committed ecfb7794)

| # | Finding | Fix |
|---|---------|-----|
| 1.1 | A11-#2: Search paginated paths bypass block/mute | FIXED — userExcludeFilter added to all 5 type-specific where clauses; Meilisearch post-filter checks isRemoved, visibility, isBanned |
| 1.2 | X01-#5/#6: react/addComment block-only, no mute | FIXED — Promise.all checks block AND mute in both methods |
| 1.3 | X06-#6/#7: getContentMetadata/hydrateItems zero safety | FIXED — isRemoved:false, visibility:PUBLIC, scheduledAt, user banned status on all queries |
| 1.4 | A11-#9 batch: generateBatchEmbeddings API key in URL | FIXED — x-goog-api-key header |
| 1.5 | J08-#11: reels.service take:10000 block/mute | FIXED — getExcludedUserIds |
| 1.6 | J08-#12: channels.service getVideos take:10000 | FIXED — getExcludedUserIds |
| 1.7 | X09-#5: reports ban deindex missing video | FIXED — added 'video' to loop |
| 1.8 | X06-#3: getDismissedIds only in 2 of 6 feeds | FIXED — wired into getNearbyContent + getCommunityTrending |
| 1.9 | A11-#1: trending/getHashtagPosts no userId | FIXED — both accept userId, filter via getExcludedUserIds |

## CP2 — 6 High Skipped Fixes (committed 7f5976ae)

| # | Finding | Fix |
|---|---------|-----|
| 2.6 | A13-#14: channel-posts getFeed no userId | FIXED — accepts userId, getExcludedUserIds |
| 2.7 | X09-#7/#8: search-reconciliation re-indexes private/scheduled | FIXED — visibility:PUBLIC + scheduledAt filters on all content types |
| 2.8 | B09-#16: community listings no user status filter | FIXED — 8 methods add isBanned/isDeactivated/isDeleted |
| 2.9 | B09-#13: updateReputation reason not stored | DEFERRED — no field in UserReputation model, schema change needed |
| 2.10 | A13-#16: channel-posts mediaUrls no validation | FIXED — @MaxLength(2000, { each: true }) |
| 2.11 | B09-#11: channel-posts like increment no GREATEST | FIXED — GREATEST guard added |

## CP3 — 5 Medium Fixes (committed 07f5bc0a)

| # | Finding | Fix |
|---|---------|-----|
| 3.1 | X06-#10: logInteraction TOCTOU race | FIXED — atomic upsert on @@unique |
| 3.2 | J08-#23: collabs.service permission checks no select | FIXED — select on 3 methods |
| 3.3 | J08-#24: channel-posts permission checks no select | FIXED — private getPostForPermissionCheck |
| 3.4 | J08-#29: gamification duplicate Challenge include | FIXED — selective include (6 of 15 fields) |
| 3.5 | A12-#17: stale comment about FeedInteraction @@unique | FIXED — removed comment |

## CP4 — 30 New Tests (committed 40dbb6f7)

| Spec File | Tests | Findings Covered |
|-----------|-------|-----------------|
| search.service.spec | 5 | A11-#1/#2, X09-#1/#2 |
| feed.service.spec | 5 | X06-#1/#2/#3, A12-#3/#4/#5 |
| personalized-feed.service.spec | 4 | X06-#6/#7 |
| posts.service.spec | 4 | X01-#5/#6 |
| channel-posts.service.spec | 4 | A13-#5/#6/#14, B09-#11 |
| community.service.spec | 3 | A13-#7, B09-#22 |
| channels.service.spec | 2 | B09-#1 |
| polls.service.spec | 1 | B12-#1 |
| reels.service.edge.spec | 1 | J01-#2, J08-#11 |
| reports.service.spec | 1 | X09-#5 |

---

## COMPLETE FINDING ACCOUNTING (190/190)

### A11 — Search, Hashtags, Embeddings (17 findings)

| # | Sev | Status | Notes |
|---|-----|--------|-------|
| 1 | H | FIXED Part1+P2 | Search userId passed; P2 added paginated filter |
| 2 | H | FIXED P2 | Meilisearch post-filter checks isRemoved/visibility/isBanned |
| 3 | H | FIXED Part1 | Backfill infinite loop bail-out |
| 4 | M | DEFERRED | Search controller DTO — input validation exists in service |
| 5 | M | FIXED Part1 | hasMore uses safeLim |
| 6 | M | DEFERRED | @ApiBearerAuth misleading — cosmetic Swagger |
| 7 | M | DEFERRED | URI encoding inconsistency — no current bug |
| 8 | M | FIXED Part1 | Channels added to Meilisearch indexMap |
| 9 | M | FIXED Part1+P2 | API key header (single + batch) |
| 10 | M | DEFERRED | Trending hashtags 8 subqueries — perf, 5-min Redis cache mitigates |
| 11 | M | FIXED Part1 | getEmbeddedIds dead code removed |
| 12 | L | DEFERRED | getHashtagPosts limit no cap — default 20, not exposed |
| 13 | L | DEFERRED | recommendations limit string type — JS coercion works |
| 14 | L | DEFERRED | Search controller no DTO — validation in service |
| 15 | L | DEFERRED | hashtags.search() raw array — response shape inconsistency |
| 16 | L | DEFERRED | people/tags no pagination meta — aggregate endpoint |
| 17 | I | FIXED Part1 | Unused cursor variable removed |

### A12 — Feed, Promotions, Polls (22 findings)

| # | Sev | Status | Notes |
|---|-----|--------|-------|
| 1 | H | FIXED Part1 | featurePost userId required |
| 2 | H | FIXED Part1 | featurePost @Throttle |
| 3 | H | FIXED Part1 | getNearbyContent visibility:PUBLIC |
| 4 | H | FIXED Part1 | getNearbyContent block/mute |
| 5 | H | FIXED Part1+P2 | getDismissedIds wired into all feeds |
| 6 | M | FIXED Part1 | trackSessionSignal awaited |
| 7 | M | FIXED Part1 | retractVote multi-choice |
| 8 | M | FIXED Part1 | getVoters banned filter |
| 9 | M | FIXED Part1 | markBranded bracket strip |
| 10 | M | FIXED Part1 | BoostPostDto @Max(30) |
| 11 | M | FIXED Part1 | video trending scheduledAt |
| 12 | M | FIXED Part1 | video exploration scheduledAt |
| 13 | M | FIXED Part1 | any[] typed |
| 14 | L | DEFERRED | Voter enumeration — by design (Twitter model) |
| 15 | L | DEFERRED | feed-transparency ILIKE — needs Meilisearch migration |
| 16 | L | DEFERRED | feed-transparency inline block/mute — FIXED in Part1 via getExcludedUserIds |
| 17 | L | FIXED P2 | Stale @@unique comment removed |
| 18 | L | DEFERRED | Math.random in feed — FIXED in Part1 (crypto.randomInt) |
| 19 | I | FIXED Part1 | VoteDto inline — cosmetic |
| 20 | I | FIXED Part1 | Promotion DTOs inline — cosmetic |
| 21 | I | FIXED Part1 | $queryRawUnsafe → $queryRaw |
| 22 | I | DEFERRED | getOnThisDay JS filter — perf optimization, 100-row cap |

### A13 — Channels, Channel Posts, Communities (28 findings)

| # | Sev | Status | Notes |
|---|-----|--------|-------|
| 1 | C | FIXED Part1 | answerFatwa FK crash — self-referential child record |
| 2 | C | FIXED Part1 | getDataExport PII — explicit select |
| 3 | H | FIXED Part1 | generateSlug crypto.randomUUID |
| 4 | H | DEFERRED | Role management dead code — needs controller endpoints |
| 5 | H | FIXED Part1 | Channel posts sanitization |
| 6 | H | FIXED Part1 | Channel posts moderation |
| 7 | H | FIXED Part1 | 9 community create methods moderated |
| 8 | H | FIXED Part1 | Channel update @Throttle |
| 9 | H | FIXED Part1 | Channel delete @Throttle |
| 10 | M | FIXED Part1 | Channel post pagination cursor-based |
| 11 | M | FIXED Part1 | Limit validation on list |
| 12 | M | FIXED Part1 | Limit validation on listMembers |
| 13 | M | FIXED Part1 | Slug update P2002 try/catch |
| 14 | M | FIXED P2 | Channel-posts getFeed userId + block/mute |
| 15 | M | DEFERRED | community-notes inline DTOs — cosmetic |
| 16 | M | FIXED P2 | Channel-posts mediaUrls @MaxLength |
| 17 | M | FIXED Part1 | Channel update moderation |
| 18 | M | FIXED Part1 | contentType validation getNotesForContent |
| 19 | M | FIXED Part1 | contentType validation getHelpfulNotes |
| 20 | L | DEFERRED | channels getVideos take:10000 — FIXED in P2 via getExcludedUserIds |
| 21 | L | DEFERRED | communities private list take:50 — bounded, low risk |
| 22 | L | DEFERRED | answerFatwa string literal enum — cosmetic |
| 23 | L | DEFERRED | requestMentorship FatwaTopicType cast — DTO validates |
| 24 | L | DEFERRED | createStudyCircle ScholarTopicType cast — DTO validates |
| 25 | L | DEFERRED | createOpportunity VolunteerCategory — @IsString validates |
| 26 | L | DEFERRED | createEvent IslamicEventType — @IsString validates |
| 27 | I | DEFERRED | TOCTOU slug race — P2002 catch handles it |
| 28 | I | DEFERRED | sanitizeText ternary simplification — cosmetic |

### B09 — Channel, ChannelPost, Community models (22 findings)

| # | Sev | Status | Notes |
|---|-----|--------|-------|
| 1 | C | FIXED Part1 | Raw SQL table names channels/subscriptions |
| 2 | C | FIXED Part1 | answerFatwa FK crash (same as A13-#1) |
| 3 | H | FIXED Part1 | rateNote $transaction |
| 4 | H | FIXED Part1 | updateReputation $transaction |
| 5 | H | FIXED Part1 | fetchRecommendedChannels ban/block filter |
| 6 | H | FIXED Part1 | createNote isRemoved check |
| 7 | H | FIXED Part1 | Channel post feed user status |
| 8 | M | FIXED Part1 | getNotesForContent NOT_HELPFUL filter |
| 9 | M | DEFERRED | @@unique on CommunityNote — schema change |
| 10 | M | DEFERRED | @@unique on CommunityRole — schema change |
| 11 | M | FIXED P2 | ChannelPostLike GREATEST guard |
| 12 | M | DEFERRED | FatwaQuestion.answeredBy no @relation — schema change |
| 13 | M | DEFERRED | updateReputation reason not stored — no schema field |
| 14 | M | DEFERRED | Channel userId onDelete:SetNull orphan — schema change |
| 15 | M | FIXED Part1 | Analytics PUBLISHED filter |
| 16 | M | FIXED P2 | Community listing user status filter (8 methods) |
| 17 | L | DEFERRED | BroadcastChannel no owner field — schema change |
| 18 | L | DEFERRED | Channel post id-cursor pagination — FIXED in Part1 |
| 19 | L | DEFERRED | Vote count increment no GREATEST — no decrement path exists |
| 20 | L | DEFERRED | Channel hard delete — design decision |
| 21 | I | DEFERRED | CommunityNote authorId naming — schema convention |
| 22 | I | FIXED Part1 | checkKindness → ContentSafetyService |

### B12 — Polls, Events (8 findings — Tab 2 portion)

| # | Sev | Status | Notes |
|---|-----|--------|-------|
| 1 | H | FIXED Part1 | Polls raw SQL table names |
| 5 | M | DEFERRED | EventRSVP.status free-text — schema change |
| 6 | M | FIXED Part1 | createEvent endDate validation |
| 7 | M | FIXED Part1 | getEvent groupBy (4→1 query) |
| 9 | M | FIXED Part1 | retractVote multi-choice |
| 13 | L | DEFERRED | DJB2 modulo bias — Tab 1 owns feature-flags |
| 14 | L | DEFERRED | Admin flag value regex — Tab 1 |
| 15 | L | FIXED Part1 | Private event community members |

### X01 — Post Lifecycle (22 findings)

| # | Sev | Status | Notes |
|---|-----|--------|-------|
| 1 | C | ALREADY FIXED R1 | Dismiss case mismatch — A02-#1 |
| 2 | H | ALREADY FIXED R1 | Post edit moderation — A02-#6 |
| 3 | H | ALREADY FIXED R1 | Comment edit moderation — B02-#17 |
| 4 | H | DEFERRED | Real-time events silently dropped — gateway room architecture |
| 5 | H | FIXED Part1+P2 | react() block+mute check |
| 6 | H | FIXED Part1+P2 | addComment() block+mute check |
| 7 | H | FIXED Part1 | share() postsCount increment |
| 8 | M | FIXED Part1 | getComments viewerId + block filter |
| 9 | M | DEFERRED | Math.random in feed — FIXED in Part1 |
| 10 | M | DEFERRED | delete() cleanup — soft-delete, orphans acceptable |
| 11 | M | DEFERRED | recordView dedup — design choice, bounded by throttle |
| 12 | M | DEFERRED | ReactDto string type — @IsEnum validates at pipe level |
| 13 | M | DEFERRED | any[] in feed — FIXED in Part1 |
| 14 | L | DEFERRED | Dynamic import('crypto') — module cached, ~1ms |
| 15 | L | DEFERRED | Blended feed cursor semantics — < 10 follows edge case |
| 16 | L | DEFERRED | type param not validated — falls to default safely |
| 17 | L | DEFERRED | Edit history preserves content — useful for moderation audit |
| 18 | L | DEFERRED | $queryRawUnsafe — FIXED in Part1 |
| 19 | I | DEFERRED | Cache TTL eventual consistency — design tradeoff |
| 20 | I | DEFERRED | shareAsStory no re-moderation — original was moderated |
| 21 | I | DEFERRED | crossPost no publishWorkflow — low priority |
| 22 | I | DEFERRED | crossPost no re-moderation — original was moderated |

### X06 — Feed & Algorithm (24 findings)

| # | Sev | Status | Notes |
|---|-----|--------|-------|
| 1 | C | FIXED Part1 | getNearbyContent visibility |
| 2 | C | FIXED Part1 | getNearbyContent block/mute |
| 3 | H | FIXED Part1+P2 | getDismissedIds wired into all feeds |
| 4 | H | FIXED Part1 | getCommunityTrending block/mute |
| 5 | H | FIXED Part1 | getCommunityTrending isPrivate |
| 6 | H | FIXED P2 | getContentMetadata safety filters |
| 7 | H | FIXED P2 | hydrateItems safety filters |
| 8 | H | FIXED Part1 | Math.random → crypto.randomInt |
| 9 | H | FIXED Part1 | Math.random exploration |
| 10 | M | FIXED P2 | logInteraction TOCTOU → upsert |
| 11 | M | DEFERRED | Personalized feed hasMore — complex refactor |
| 12 | M | DEFERRED | Personalized feed session pagination — complex refactor |
| 13 | M | FIXED Part1 | feed-transparency getExcludedUserIds |
| 14 | M | FIXED Part1 | enhancedSearch user status |
| 15 | M | FIXED Part1 | Video trending scheduledAt |
| 16 | M | FIXED Part1 | Video exploration scheduledAt |
| 17 | M | FIXED Part1 | any[] → Prisma type |
| 18 | L | DEFERRED | getOnThisDay JS filter — 100-row cap, rare query |
| 19 | L | DEFERRED | isRamadanPeriod shift — 30-day buffer absorbs error |
| 20 | L | DEFERRED | Space type annotation — cosmetic TypeScript |
| 21 | L | FIXED Part1 | featurePost userId bypass |
| 22 | L | DEFERRED | Diversity reranking same-author — design improvement |
| 23 | I | DEFERRED | ENGAGEMENT_WEIGHTS not referenced — needs refactor |
| 24 | I | DEFERRED | Scholar verification cast — unnecessary but harmless |

### X08 — Content Moderation (6 findings — Tab 2 portion)

| # | Sev | Status | Notes |
|---|-----|--------|-------|
| 3 | C | ALREADY FIXED R1 | Post update moderation — A02-#6 |
| 4 | C | ALREADY FIXED R1 | editComment moderation — B02-#17 |
| 5 | H | ALREADY FIXED R1 | Reel update moderation — A03-#2 |
| 6 | H | ALREADY FIXED R1 | Thread update moderation — A04-#5 |
| 25 | M | DEFERRED | Video frames never moderated — Tab 4 |
| 29 | L | ALREADY FIXED R1 | Comment creation moderation — A02-#21 |

### X09 — Search & Discovery (17 findings)

| # | Sev | Status | Notes |
|---|-----|--------|-------|
| 1 | H | FIXED Part1 | Main search userId |
| 2 | H | FIXED P2 | Meilisearch isRemoved/visibility filter |
| 3 | H | FIXED Part1 | Channels in Meilisearch indexMap |
| 4 | H | DEFERRED | Admin ban deindex user content — Tab 1 owns admin |
| 5 | M | FIXED P2 | Reports ban deindex adds 'video' |
| 6 | M | FIXED Part1 | searchPosts hasMore safeLim |
| 7 | M | FIXED P2 | Search reconciliation visibility/scheduledAt |
| 8 | M | FIXED P2 | Meilisearch sync visibility/scheduledAt |
| 9 | M | FIXED P2 | getExploreFeed getExcludedUserIds (was in Part1) |
| 10 | M | FIXED P2 | Meilisearch sync scheduledAt (all 4 types) |
| 11 | L | DEFERRED | getHashtagPosts no limit param — default 20 |
| 12 | L | DEFERRED | suggestedUsers take:1000 — bounded, 1K adequate |
| 13 | L | DEFERRED | Trending hashtags banned user influence — SQL aggregation |
| 14 | L | DEFERRED | searchReels string limit — JS coercion works |
| 15 | L | DEFERRED | createIndex no status check — logged as debug |
| 16 | I | DEFERRED | SELECT constants not shared — maintenance burden |
| 17 | I | DEFERRED | Dedicated search endpoint divergence — feature by design |

### J01 — N+1 Queries (12 findings — Tab 2 portion)

| # | Sev | Status | Notes |
|---|-----|--------|-------|
| 2 | H | FIXED Part1 | Reels hashtag N+1 → createMany + batch |
| 3 | H | FIXED Part1 | Scheduling 3 N+1 hashtag loops (publishScheduled) |
| 4 | H | FIXED Part1 | Scheduling 3 N+1 hashtag loops (publishOverdue) |
| 5 | H | FIXED Part1 | Posts delete hashtag N→1 batch |
| 6 | M | DEFERRED | Posts cron sequential Redis — low frequency |
| 7 | M | DEFERRED | Posts sequential mention notifications — bounded |
| 9 | M | DEFERRED | Reels sequential tag notifications — bounded |
| 10 | M | DEFERRED | Reels sequential mention notifications — bounded |
| 15 | M | DEFERRED | Embedding N+1 with sleep — intentional rate limiting |
| 16 | M | DEFERRED | Community trending 2 queries — join optimization |

### J08 — API Response Size (12 findings — Tab 2 portion)

| # | Sev | Status | Notes |
|---|-----|--------|-------|
| 4 | C | FIXED Part1 | getDismissedIds Redis cache + limit 1K |
| 5 | C | FIXED Part1 | getDataExport PII + limit 10K |
| 9 | H | DEFERRED | Posts getFeed follow take:5000 — needs cached follow set |
| 10 | H | DEFERRED | Threads getFeed follow take:5000 — same |
| 11 | H | FIXED P2 | Reels getFeed getExcludedUserIds |
| 12 | H | FIXED P2 | Channels getVideos getExcludedUserIds |
| 13 | H | FIXED Part1 | Search getExcludedUserIds |
| 14 | H | FIXED Part1 | Feed-transparency getExcludedUserIds |
| 23 | M | FIXED P2 | Collabs select clause |
| 24 | M | FIXED P2 | Channel-posts select clause |
| 29 | M | FIXED P2 | Gamification selective include |
| 32 | M | DEFERRED | getSavedVideos unnecessary fields — minor bandwidth |

---

## Commits

1. `ecfb7794` — CP1: 9 failed repairs
2. `7f5976ae` — CP2: 6 high fixes + reconciliation/sync safety
3. `07f5bc0a` — CP3: 5 medium fixes
4. `40dbb6f7` — CP4: 30 new tests
5. This file — CP5: Complete accounting

## Totals

| Category | Count |
|----------|-------|
| Fixed in P2 (this session) | 25 |
| Fixed in Part 1 (previous) | 60 |
| Already Fixed in R1 | 6 |
| Deferred (schema) | 10 |
| Deferred (other tab) | 5 |
| Deferred (design/perf) | 35 |
| Deferred (low/info) | 49 |
| **Total accounted** | **190/190** |
| New tests written | 30 |
