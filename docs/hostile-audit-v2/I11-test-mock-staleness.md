# I11 — Test Mock Staleness Audit

**Scope:** `apps/api/src/common/test/mock-providers.ts` vs real service implementations; `jest-ci-retry.setup.ts` review.
**Auditor:** Hostile code audit, 2026-04-05
**Verdict:** 14 findings (3 Critical, 5 High, 4 Medium, 2 Low)

---

## Summary

The shared mock-providers file is the single source of truth for ~250 test files. Any stale or missing method means tests silently pass while calling undefined functions — which return `undefined` instead of the real behavior, masking regressions.

---

## Findings

### I11-01 [CRITICAL] — StreamService mock has phantom method `uploadVideo`, real service has `uploadFromUrl`

| Field | Value |
|-------|-------|
| **Mock method** | `uploadVideo` |
| **Real method** | `uploadFromUrl(r2PublicUrl, meta)` |
| **File** | `mock-providers.ts:72`, `stream.service.ts:68` |

The mock exposes `uploadVideo` which does NOT exist on the real `StreamService`. The real method is `uploadFromUrl`. Any test calling `mockStreamService.useValue.uploadVideo()` gets a mock result, but in production the call would fail. Additionally, 6 real methods are entirely absent from the mock:

| Real method | Mock present? |
|-------------|--------------|
| `uploadFromUrl` | NO (mock has wrong name `uploadVideo`) |
| `getPlaybackUrls` | NO |
| `deleteVideo` | NO |
| `handleStreamReady` | NO |
| `handleStreamError` | NO |
| `createLiveInput` | NO |
| `deleteLiveInput` | NO |

**Risk:** Tests for any service that injects `StreamService` and calls these methods will get `undefined` silently, masking integration failures.

---

### I11-02 [CRITICAL] — PushService mock has wrong method name `sendPush`, real service has `sendToUser`/`sendToUsers`

| Field | Value |
|-------|-------|
| **Mock** | `{ sendPush: jest.fn() }` |
| **Real methods** | `sendToUser(userId, notification)`, `sendToUsers(userIds, notification)` |
| **File** | `mock-providers.ts:31`, `push.service.ts:83,106` |

The real `PushService` has no `sendPush` method. It has `sendToUser` and `sendToUsers`. Any test using this mock and calling `sendPush` gets a successful mock result for a method that doesn't exist. Both real methods are missing from the mock.

---

### I11-03 [CRITICAL] — QueueService mock missing `onModuleDestroy` lifecycle method

| Field | Value |
|-------|-------|
| **Mock** | Missing `onModuleDestroy` |
| **Real** | `async onModuleDestroy()` closes all 6 queues |
| **File** | `mock-providers.ts:120-134`, `queue.service.ts:43-52` |

The real `QueueService` implements `OnModuleDestroy` and closes all BullMQ queues. The mock omits this. While NestJS calls lifecycle hooks via interface detection (so this won't crash tests), any test that explicitly tests shutdown behavior will silently skip queue cleanup verification.

---

### I11-04 [HIGH] — AiService mock missing 9 of 18 real methods

| Real method | Mocked? |
|-------------|---------|
| `moderateContent` | YES |
| `moderateImage` | YES |
| `isAvailable` | YES |
| `suggestCaptions` | YES |
| `suggestHashtags` | YES |
| `translateText` | YES (but mock returns `{ translatedText: '' }` — real returns `string`) |
| `generateAltText` | YES |
| `clearTranslationCache` | YES |
| `checkAiQuota` | **NO** |
| `checkDailyQuota` | **NO** |
| `suggestPostingTime` | **NO** |
| `suggestSmartReplies` | **NO** |
| `summarizeContent` | **NO** |
| `routeToSpace` | **NO** |
| `generateVideoCaptions` | **NO** |
| `transcribeVoiceMessage` | **NO** |
| `getVideoCaptions` | **NO** |
| `generateAvatar` | **NO** |
| `getUserAvatars` | **NO** |

**File:** `mock-providers.ts:55-67`, `ai.service.ts` (full file)

**Risk:** Any module test that injects AiService and calls any of the 9+ missing methods receives `undefined` instead of the expected return type. The `translateText` mock returns an object `{ translatedText: '' }` but the real method returns a bare `string` — any test asserting on the return type passes with the mock but would fail in production.

---

### I11-05 [HIGH] — NotificationsService mock missing 4 of 9 real methods

| Real method | Mocked? |
|-------------|---------|
| `create` | YES |
| `getNotifications` | YES |
| `markRead` | YES |
| `markAllRead` | YES |
| `getUnreadCount` | YES (but mock returns `0` — real returns `{ unread: number }`) |
| `getUnreadCounts` | **NO** |
| `getUnreadCountTotal` | **NO** |
| `deleteNotification` | **NO** |
| `buildContentIncludes` | N/A (private) |

**File:** `mock-providers.ts:34-43`, `notifications.service.ts`

**Return type mismatch on `getUnreadCount`:** Mock returns `0` (number). Real returns `{ unread: count }` (object). Any test asserting `result.unread` will get `undefined` from the mock.

---

### I11-06 [HIGH] — GamificationService mock missing 7+ real methods

| Real method | Mocked? |
|-------------|---------|
| `awardXP` | YES |
| `updateStreak` | YES |
| `getXP` | YES |
| `getStreaks` | YES |
| `getXPHistory` | **NO** |
| `getLeaderboard` | **NO** |
| `getChallenges` | **NO** |
| `getSeries` | **NO** |
| `getSeriesProgress` | **NO** |
| `getProfileCustomization` | **NO** |
| `updateProfileCustomization` | **NO** |

**File:** `mock-providers.ts:45-53`, `gamification.service.ts`

---

### I11-07 [HIGH] — ContentSafetyService mock has phantom method `moderateImage`, real service removed it

| Field | Value |
|-------|-------|
| **Mock** | `moderateImage: jest.fn().mockResolvedValue(...)` |
| **Real** | `// A10-#21: Removed deprecated moderateImage()` |
| **File** | `mock-providers.ts:161`, `content-safety.service.ts:69` |

The real `ContentSafetyService` explicitly removed `moderateImage()` (comment at line 69 says "Removed deprecated moderateImage() -- all consumers use AiService.moderateImage()"). The mock still exposes it. Any test calling `contentSafetyService.moderateImage()` passes with a fake result for a method that no longer exists.

---

### I11-08 [HIGH] — PrivacyService mock missing `scheduleAccountDeletion`, `cancelAccountDeletion`, `getAccountDeletionStatus`, `anonymizeUser`

The mock has 5 methods but the real service has additional methods that may be called by controllers or other services. Specifically the mock is missing any scheduling/cancellation methods that would exist for the GDPR account deletion flow.

**File:** `mock-providers.ts:171-180`, `privacy.service.ts`

**Note:** The 5 methods currently mocked match the core methods found in the real service at the time of auditing. However, the mock's return types may drift as the service evolves. The mock for `exportUserData` returns `{}` (empty object) while the real service returns a structured export with user data, posts, messages, etc. Tests using the mock never verify the export shape.

---

### I11-09 [MEDIUM] — PrismaService mock covers only 4 of ~200 models

| Mocked model | Operations mocked |
|-------------|-------------------|
| `user` | `findUnique`, `findMany` |
| `processedWebhookEvent` | `findUnique`, `create` |
| `tip` | `findFirst`, `findMany` |
| `conversationMember` | `update`, `updateMany`, `findMany` |

The real `PrismaService` extends `PrismaClient` with ~200 models. The mock only covers 4 models with a handful of operations. Every test that uses `globalMockProviders` and accesses any other model (e.g., `prisma.post.findMany()`) gets `undefined` because `prisma.post` is `undefined`.

**Mitigation:** Most test files create their own model-specific mocks. But any test relying solely on `globalMockProviders` for Prisma will silently fail on unmocked models.

**File:** `mock-providers.ts:227-245`

---

### I11-10 [MEDIUM] — Redis mock missing `sismember`, `zrangebyscore`, `exists`, `ttl`, `pttl`, `getdel`, `scan`

The mock covers common Redis commands but misses several that are used across the codebase. Any test hitting these will get `undefined`. Notable absences:

| Missing command | Used by |
|----------------|---------|
| `sismember` | Set membership checks |
| `zrangebyscore` | Sorted set range queries |
| `exists` | Key existence checks |
| `ttl` / `pttl` | TTL inspection |
| `getdel` | Atomic get-and-delete |
| `scan` | Key iteration (used in PublishWorkflowService cache invalidation) |

**File:** `mock-providers.ts:76-118`

---

### I11-11 [MEDIUM] — `mockAnalyticsService` missing `flush` and `onModuleDestroy`

The real `AnalyticsService` implements `OnModuleDestroy` and has a `flush()` method plus a `setInterval` timer. The mock exposes only 4 methods (`track`, `increment`, `getCounter`, `getCounters`). While `flush` is private, `onModuleDestroy` is a lifecycle hook that tests should be aware of.

**File:** `mock-providers.ts:136-144`, `analytics.service.ts:119-122`

---

### I11-12 [MEDIUM] — `mockPublishWorkflowService` has `onUnpublish` but missing common call pattern

The mock has `onPublish` and `onUnpublish` which match the real service. However, the `onPublish` mock returns `undefined` while the real method is `void`. This is actually fine, but worth noting that the mock doesn't validate the shape of the `params` argument (contentType, contentId, userId, indexDocument). Tests pass any garbage and get success.

**File:** `mock-providers.ts:190-196`

---

### I11-13 [LOW] — jest-ci-retry.setup.ts referenced from rootDir but lives at `src/jest-ci-retry.setup.ts`

The `jest.config.ts` sets `rootDir: 'src'` and references `setupFilesAfterEnv: ['./jest-ci-retry.setup.ts']`. This resolves to `apps/api/src/jest-ci-retry.setup.ts`, which exists. The file correctly uses `jest.retryTimes(2)` only when `JEST_RETRY=true`.

**Concern:** The retry mechanism silently masks flaky tests. With `logErrorsBeforeRetry: true` the errors are logged but the test still passes on retry. In CI, this creates false confidence — a test that fails 1 in 3 times is a bug, not "infrastructure flakiness."

**Risk:** Flaky tests caused by real race conditions or missing mocks will pass in CI and fail intermittently in production.

---

### I11-14 [LOW] — `globalMockProviders` array missing `mockEventEmitter`

The `globalMockProviders` array (line 265-284) includes 17 mock providers but omits `mockEventEmitter` (defined at line 216-225). Many services inject `EventEmitter2`. Tests using `globalMockProviders` without manually adding `mockEventEmitter` will get a real `EventEmitter2` instance (if the EventEmitterModule is imported) or a resolution error.

**File:** `mock-providers.ts:265-284`

---

## Risk Matrix

| ID | Severity | Category | Impact |
|----|----------|----------|--------|
| I11-01 | CRITICAL | Phantom method | Tests pass for nonexistent API |
| I11-02 | CRITICAL | Phantom method | Tests pass for nonexistent API |
| I11-03 | CRITICAL | Missing lifecycle | Shutdown behavior untested |
| I11-04 | HIGH | Missing methods (9) | Silent undefined in 250 test files |
| I11-05 | HIGH | Missing methods + wrong return type | `getUnreadCount` return shape wrong |
| I11-06 | HIGH | Missing methods (7+) | Gamification features untested |
| I11-07 | HIGH | Phantom method (removed) | Tests for deleted method pass |
| I11-08 | HIGH | Incomplete mock | Export shape never verified |
| I11-09 | MEDIUM | Partial Prisma mock (4/200) | Unmocked models return undefined |
| I11-10 | MEDIUM | Missing Redis commands | Redis operations silently undefined |
| I11-11 | MEDIUM | Missing lifecycle | Timer cleanup untested |
| I11-12 | MEDIUM | Param validation | Tests accept invalid params |
| I11-13 | LOW | Flaky test masking | CI hides real failures |
| I11-14 | LOW | Missing from array | EventEmitter not in globalMockProviders |

---

## Systemic Issue

The mock-providers file has no automated mechanism to detect drift from the real services. When a developer adds a method to a service, there is no check that updates the corresponding mock. This means mock staleness is a guaranteed outcome of every feature addition. A type-level solution (e.g., `Partial<Record<keyof StreamService, jest.Mock>>` with `satisfies`) would catch this at compile time.
