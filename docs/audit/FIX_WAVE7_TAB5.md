# W7-T5 Progress — Channels/Follows/Blocks/Mutes/Reports/Moderation + Reels/Clips + Go E2E

## Checkpoints

| CP | Scope | Tests | Commit |
|----|-------|-------|--------|
| CP1 | T09: channels/channel-posts/follows/blocks/mutes/reports/moderation | 84 | `5ac882ad` |
| CP2 | T03: reels/reel-templates/clips | 56 | `d43b1e7f` |
| CP3 | T14: Go e2e-server handler auth + validation | 15 | `00c34ff7` |
| **Total** | | **155** | |

## T09 Coverage (82 rows, 84 new tests, 11 spec files)

| # | Sev | Finding | Status |
|---|-----|---------|--------|
| 1-5 | H | channels controller 5 missing endpoints | TESTED |
| 6 | M | getRecommended raw SQL | TESTED |
| 7-8 | M | setTrailer video not found + wrong channel | TESTED |
| 9 | M | removeTrailer error paths | TESTED |
| 10 | M | create content moderation | TESTED |
| 11 | M | getAnalytics averageViewsPerVideo division | TESTED |
| 12 | M | getSubscribers pagination hasMore+cursor | TESTED |
| 15 | L | getByHandle trailer fetch | TESTED |
| 16-17 | C | channel-posts like/unlike (transactional) | TESTED |
| 18-20 | M | like conflict, unlike not found, post not found | TESTED |
| 21 | M | delete non-owner forbidden | TESTED |
| 22 | M | unpin all paths | TESTED |
| 23 | M | create channel-not-found | TESTED |
| 24-25 | L | getFeed hasMore, pin by channel owner | TESTED |
| 28-29 | M | follow P2002 race (direct + request) | TESTED |
| 30 | M | follow declined request | TESTED |
| 32-34 | M | private account access control (5 tests) | TESTED |
| 38 | L | removeFollower controller delegation | TESTED |
| 40 | M | blocks P2002 race + re-throw | TESTED |
| 42-43 | M | cleanup error handling (circle + DM) | TESTED |
| 46 | M | mutes non-P2002 error propagation | TESTED |
| 48-49 | C | reports auto-hide + mass-report abuse | TESTED |
| 50-51 | M | self-report comment/message | TESTED |
| 52 | M | moderation queue enqueue | TESTED |
| 53 | M | resolve CONTENT_REMOVED | TESTED |
| 55 | M | resolve TEMP_MUTE warningsCount | TESTED |
| 57-58 | M | already resolved/dismissed | TESTED |
| 59 | M | admin/moderator getById | TESTED |
| 60-61 | H | reports controller getStats/getPending | TESTED |
| 62 | M | checkText self_harm crisis resources | TESTED |
| 63-64 | M | checkImage BLOCK/WARNING | TESTED |
| 65-66 | M | review remove/warn actions | TESTED |
| 67-68 | M | review/getStats forbidden | TESTED |
| 69 | M | resolveAppeal (7 tests: accept/reject/errors) | TESTED |
| 70 | M | getPendingAppeals | TESTED |
| 71-72 | H | moderation controller 2 missing endpoints | TESTED |
| 78-79 | I | getVideos enrichment + hasMore | TESTED |
| 81 | I | acceptRequest P2002 concurrent | TESTED |

## T03 Coverage (38 findings, 56 new tests, 4 spec files)

| # | Sev | Finding | Status |
|---|-----|---------|--------|
| 1 | C | updateReel (4 paths) | TESTED |
| 2 | C | publishTrial (4 paths) | TESTED |
| 3-5 | C | saveDraft/getDrafts/deleteDraft (5 tests) | TESTED |
| 6 | H | getDownloadUrl (3 tests) | TESTED |
| 7 | H | getByAudioTrack (2 tests) | TESTED |
| 8-9 | H | getDuets/getStitches service (4 tests) | TESTED |
| 10 | H | getTrending controller | TESTED |
| 11-12 | M | likeComment/unlikeComment (6 tests) | TESTED |
| 13-14 | M | recordView/recordLoop (3 tests) | TESTED |
| 15 | M | getAccessibilityReport (2 tests) | TESTED |
| 22-23 | M | report duplicate/not found | TESTED |
| 25-26 | M | reel-templates markUsed/delete not found | TESTED |
| 27 | M | negative segment times | TESTED |
| 28 | L | 9 missing controller endpoints | TESTED |
| 32-33 | L | clips null hlsUrl/duration | TESTED |
| 34-35 | L | browse trending sort + limit clamping | TESTED |
| 38 | I | empty result cursor handling | TESTED |

## T14 Coverage (44 rows, 15 new Go tests, 1 file)

| # | Sev | Finding | Status |
|---|-----|---------|--------|
| 16-27 | C/H | 13 handler endpoints auth rejection | TESTED |
| 28 | M | HandleHealth nil store | TESTED |
| 20 | C | Batch max validation | TESTED |
| 1-8 | C | TS integration paths | DEFERRED (no jest config for test/integration/) |
| 9 | C | Mock-only integration tests | STRUCTURAL (acknowledged) |
| 10 | H | WebSocket gateway | DEFERRED (needs real Socket.io) |
| 15, 32 | C | Go store tests | DEFERRED (needs real PostgreSQL) |

## Files Created (16 total, 2,554 lines)

```
# CP1 — 11 files
apps/api/src/modules/channels/channels.service.w7.spec.ts
apps/api/src/modules/channels/channels.controller.w7.spec.ts
apps/api/src/modules/channel-posts/channel-posts.service.w7.spec.ts
apps/api/src/modules/follows/follows.service.w7.spec.ts
apps/api/src/modules/follows/follows.controller.w7.spec.ts
apps/api/src/modules/blocks/blocks.service.w7.spec.ts
apps/api/src/modules/mutes/mutes.service.w7.spec.ts
apps/api/src/modules/reports/reports.service.w7.spec.ts
apps/api/src/modules/reports/reports.controller.w7.spec.ts
apps/api/src/modules/moderation/moderation.service.w7.spec.ts
apps/api/src/modules/moderation/moderation.controller.w7.spec.ts

# CP2 — 4 files
apps/api/src/modules/reels/reels.service.w7.spec.ts
apps/api/src/modules/reels/reels.controller.w7.spec.ts
apps/api/src/modules/reel-templates/reel-templates.service.w7.spec.ts
apps/api/src/modules/clips/clips.service.w7.spec.ts

# CP3 — 1 file
apps/e2e-server/internal/handler/handler_w7_test.go
```
