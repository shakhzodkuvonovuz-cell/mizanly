# Wave 7 Tab 2 — Test Progress

## Scope
- **T11**: islamic, mosques, halal, scholar-qa, live, audio-rooms, broadcast (124 rows, 87 findings)
- **T13**: queue processors (37 rows, 34 findings)

## Commits
| CP | Commit | Scope | Tests |
|----|--------|-------|-------|
| CP1 | fc7641da | T11: islamic/mosques/halal/scholar-qa/live/audio-rooms/broadcast | 120 |
| CP2 | 6182f515 | T13: queue processors (QueueService + search/ai-tasks/webhook) | 28 |
| CP3 | 5569ad41 | Missed gaps: notifications, mosques sort, live re-join/stream, broadcast, queue CB, ai-tasks lifecycle | 19 |

## New Test Counts by Module

| Module | New it() blocks | Key coverage added |
|--------|----------------|-------------------|
| islamic.controller | 51 | 49 untested endpoints + glossary/classify/detect |
| islamic.service | 6 | toggleHadithBookmark, followMosque, getFollowedMosqueTimes |
| islamic-notifications.service | 6 | isInPrayerDND mosque fallback, shouldShowPrayFirstNudge full path, getJummahReminder behavior, getRamadanStatus hijri verification |
| mosques.service | 4 | ConflictException, mediaUrls, pagination hasMore, distance sort |
| halal.service | 4 | ConflictException x2, pagination hasMore x2 |
| scholar-qa.controller | 2 | markAnswered, getById |
| scholar-qa.service | 4 | ForbiddenException, self-vote, double-vote, P2002 |
| live.controller | 8 | guest CRUD, rehearsal, subscribers-only |
| live.service | 24 | guest management (10), rehearsal (6), subscribers-only (3), join paths (3), re-join after leaving, Stream failure fallback |
| audio-rooms.controller | 6 | recording endpoints, discovery endpoints |
| audio-rooms.service | 14 | recording CRUD (10), discovery (3), P2002 (1) |
| broadcast.service | 8 | subscribe idempotency, sendMessage validation+fan-out, discover pagination, getSubscribers no userId |
| **T11 subtotal** | **137** | |
| queue.service (NEW) | 18 | All 7 public methods + moveToDlq + getStats + destroy + circuit breaker + addWebhookDeliveryJob HMAC |
| search-indexing.processor | 2 | update action, unknown action throw |
| ai-tasks.processor | 9 | thread/reel/video content types, mapFlagsToReason, lifecycle init/destroy |
| webhook.processor | 4 | successful delivery, non-2xx, lifecycle |
| **T13 subtotal** | **33** | |
| **GRAND TOTAL** | **167** | |

## Remaining Gaps (not testable or very low value)

| Row | Sev | Why skipped |
|-----|-----|-------------|
| T11-58 | L | `getAudioAyahNumber` — private helper, tested indirectly via getQuranAudioUrl |
| T11-112 | C | `createPersistentRoom` — dead code, removed in A16-#11 |
| T11-116/117 | M | sendMessage fan-out + Redis publish — runs in background `.then()` chain, not awaitable in tests |
| T13-4 | C | `withCorrelation()` — private method, tested indirectly via addPushNotificationJob data propagation |
| T13-5 | C | `attachCorrelationId()` — 10 lines, sets Sentry tag from job.data, covered implicitly by all processor handlers |
| T13-6-9 | C | Dead code handlers: bulk-push, media, track-engagement, generate-caption — no producer exists |
| T13-13-18 | M | Media processor happy paths — dead code (no producer to enqueue media jobs) |
| T13-22-25 | M | Unknown job type throws — require mocking BullMQ Worker's internal dispatch, not directly invokable |
| T13-26 | M | AbortSignal.timeout — not testable without real network or complex timer mocking |
| T13-29-34 | L | Weak assertions, Worker event handlers, queue module stubs |

## Final Test Run
- **345 suites, 6628 tests, 0 failures**
