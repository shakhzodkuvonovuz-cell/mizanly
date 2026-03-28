# Testing Infrastructure — Complete Architecture Extraction

> Extracted: 2026-03-25 | Source: `apps/api/` (backend only — mobile has 0 custom test files)

---

## 1. Jest Configuration

**File:** `apps/api/jest.config.ts`

```ts
export default {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': ['ts-jest', { diagnostics: false }] },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};
```

### Key Config Decisions

| Setting | Value | Rationale |
|---------|-------|-----------|
| `testEnvironment` | `node` | NestJS backend — no DOM needed |
| `diagnostics` | `false` | ts-jest type checking disabled for speed |
| `testRegex` | `.*\\.spec\\.ts$` | Matches `*.spec.ts` anywhere under `src/` |
| `moduleNameMapper` | `@/` → `<rootDir>/` | Mirrors tsconfig path alias |
| `rootDir` | `src` | Tests co-located with source code |

### What's NOT configured
- No `setupFilesAfterSetup` or `globalSetup` — no global test setup file
- No `coverageThreshold` — no enforced minimum coverage
- No `testTimeout` override — uses Jest default (5s)
- No `maxWorkers` — Jest auto-detects CPU cores
- No `watchPlugins` or `reporters`

---

## 2. Aggregate Test Statistics

| Metric | Count |
|--------|-------|
| **Total spec files** | 305 |
| **Total lines of test code** | 70,305 |
| **Total `it()` blocks** | 5,248 |
| **Total `describe()` blocks** | 2,271 |
| **Total `expect()` assertions** | 7,731 |
| **Skipped tests (`it.skip`, `xdescribe`)** | 0 |
| **Focused tests (`it.only`, `fdescribe`)** | 0 |
| **`mockResolvedValue` calls** | 7,008 |
| **`mockReturnValue` calls** | 75 |
| **`mockRejectedValue` calls** | 119 |
| **`mockImplementation` calls** | 148 |
| **`jest.spyOn` calls** | 39 |
| **`jest.mock()` calls** | 23 |
| **`$transaction` references in specs** | 403 |
| **`globalMockProviders` usages** | 548 |
| **`Test.createTestingModule` calls** | 325 |
| **Files with `beforeEach`/`afterEach`** | 288 |
| **Parameterized tests (`.each`)** | 0 |

### Assertion Type Breakdown

| Assertion Category | Count |
|--------------------|-------|
| `toHaveBeenCalledWith` / `toHaveBeenCalled` | 1,851 |
| `toThrow` / `toThrowError` / `rejects.toThrow` | 1,484 |
| `toEqual` / `toStrictEqual` / `toMatchObject` | 938 |
| `toHaveLength` / `toContain` / `toContainEqual` | 858 |
| `toBeDefined` / `toBeNull` / `toBeTruthy` / `toBeFalsy` | 562 |
| Other (`toBe`, `toBeGreaterThan`, etc.) | ~2,038 |
| **Total** | **7,731** |

### Observations
- **Strong negative-path coverage:** 1,484 error assertions (19.2% of all assertions)
- **Mock-heavy architecture:** 7,008 `mockResolvedValue` calls dominate — almost all Prisma interactions mocked
- **Zero skipped/focused tests:** Clean test discipline
- **Zero parameterized tests:** No `it.each()` or `describe.each()` used anywhere — data-driven testing gap
- **Low `jest.spyOn` usage (39):** Mocks are primarily via DI provider replacement, not spy patching

---

## 3. Spec Files by Type

| Type | Count | Lines | Pattern |
|------|-------|-------|---------|
| **Controller specs** (`*.controller.spec.ts`) | 82 | — | HTTP endpoint routing, guards, DTO validation |
| **Service specs** (`*.service.spec.ts`) | 87 | — | Business logic, Prisma calls, error handling |
| **Edge case specs** (`*.edge.spec.ts`) | 34 | — | Boundary values, null inputs, empty results |
| **Auth specs** (`*.auth.spec.ts`) | 19 | — | Permission checks, ownership, role guards |
| **Concurrency specs** (`*.concurrency.spec.ts`) | 10 | — | Race conditions, parallel mutations |
| **Abuse specs** (`*.abuse.spec.ts`) | 5 | — | Self-actions, spam, manipulation vectors |
| **Integration specs** (`src/integration/*.spec.ts`) | 21 | 6,254 | Multi-service flows, cross-module interactions |
| **Gateway specs** (`*.gateway.spec.ts`) | 2 | — | WebSocket events, auth, rate limits |
| **Common infra specs** (guards, filters, utils, processors) | 16 | 2,043 | Guards, interceptors, queue processors, utils |
| **Other specialized** (dto, carousel, publish, ffmpeg, etc.) | 29 | — | Feature-specific validation and logic |
| **Total** | **305** | **70,305** | — |

---

## 4. Spec Files Per Module (Top 40)

| Module | Spec Files | Breakdown |
|--------|-----------|-----------|
| posts | 11 | service, controller, edge, auth, concurrency, abuse, comment-permission, publish-fields, carousel, carousel-validation, nullguard |
| stories | 10 | service, controller, edge, auth, concurrency, abuse, story-stickers, publish-fields, schedule, expiry |
| reels | 9 | service, controller, edge, auth, concurrency, abuse, publish-fields, dto-validation, blocked |
| messages | 7 | service, controller, edge, auth, concurrency, abuse, viewonce |
| videos | 6 | service, controller, edge, auth, concurrency, abuse |
| islamic | 6 | service, controller, edge, recovery, prayer-calculator, enum |
| gifts | 6 | service, controller, edge, auth, concurrency, abuse |
| users | 5 | service, controller, edge, dto, (dto subdir) |
| threads | 5 | service, controller, edge, auth, concurrency |
| live | 5 | service, controller, edge, auth, enum |
| follows | 5 | service, controller, edge, concurrency, abuse |
| channels | 5 | service, controller, edge, auth, concurrency |
| search | 4 | service, controller, edge, auth |
| scheduling | 4 | service, controller, edge, auth |
| playlists | 4 | service, controller, edge, auth |
| payments | 4 | service, controller, edge, auth |
| notifications | 4 | service, controller, edge, auth |
| moderation | 4 | service, controller, edge, auth |
| gamification | 4 | service, controller, edge, concurrency |
| feed | 4 | service, controller, edge, auth |
| events | 4 | service, controller, edge, auth |
| embeddings | 4 | service, controller, edge, security |
| communities | 4 | service, controller, edge, auth |
| bookmarks | 4 | service, controller, edge, auth |
| auth | 4 | service, controller, edge, (webhooks type) |
| alt-profile | 4 | service, controller, edge, auth |
| two-factor | 3 | service, controller, edge |
| telegram-features | 3 | service, controller, edge |
| stream | 3 | service, controller, edge |
| stickers | 3 | service, controller, edge |
| settings | 3 | service, controller, edge |
| privacy | 3 | service, controller, edge |
| polls | 3 | service, controller, edge |
| parental-controls | 3 | service, controller, edge |
| hashtags | 3 | service, controller, edge |
| encryption | 3 | service, controller, edge |
| drafts | 3 | service, controller, edge |
| discord-features | 3 | service, controller, edge |
| devices | 3 | service, controller, auth |

### Modules with 2 spec files (37 modules)
webhooks, watch-history, video-replies, upload, thumbnails, subtitles, story-chains, scholar-qa, retention, restricts, reports, reel-templates, recommendations, promotions, profile-links, og, mutes, mosques, monetization, majlis-lists, health, halal, downloads, creator, community-notes, collabs, clips, circles, checklists, chat-export, channel-posts, blocks, audio-tracks, audio-rooms, admin, community

### Modules with 1 spec file
video-editor (ffmpeg-engine.spec.ts only)

---

## 5. Top 10 Largest Spec Files

| File | Lines | it() estimate |
|------|-------|---------------|
| `modules/islamic/islamic.service.spec.ts` | 1,968 | ~100 |
| `modules/messages/messages.service.spec.ts` | 1,376 | ~70 |
| `modules/users/users.service.spec.ts` | 1,338 | ~65 |
| `modules/posts/posts.service.spec.ts` | 1,196 | ~60 |
| `gateways/chat.gateway.spec.ts` | 1,169 | ~55 |
| `modules/video-editor/ffmpeg-engine.spec.ts` | 1,130 | ~118 |
| `modules/videos/videos.service.spec.ts` | 1,056 | ~50 |
| `modules/search/search.service.spec.ts` | 984 | ~45 |
| `modules/reels/reels.service.spec.ts` | 958 | ~45 |
| `modules/monetization/monetization.service.spec.ts` | 927 | ~45 |
| `modules/threads/threads.service.spec.ts` | 866 | ~40 |

---

## 6. Integration Test Suite

**Directory:** `apps/api/src/integration/` — 21 files, 6,254 total lines

| File | Lines | it() | Focus |
|------|-------|------|-------|
| `content-flow.integration.spec.ts` | 747 | 25 | Post→react→comment→feed→dismiss→delete lifecycle |
| `final-push-part3.spec.ts` | 591 | 64 | Coverage push: miscellaneous service edge cases |
| `edge-cases-additional.spec.ts` | 551 | 65 | Additional boundary/edge scenarios |
| `final-coverage-push.spec.ts` | 510 | 63 | Coverage push: remaining untested paths |
| `concurrency-remaining.spec.ts` | 450 | 48 | Race condition scenarios |
| `abuse-comprehensive.spec.ts` | 391 | 48 | Abuse vector coverage |
| `final-100.spec.ts` | 374 | 36 | Final 100 test push |
| `comprehensive-auth-batch.spec.ts` | 355 | 40 | Auth matrix scenarios |
| `final-push-part2.spec.ts` | 350 | 47 | Coverage push part 2 |
| `rate-limiting.integration.spec.ts` | 314 | 29 | Throttle guard behavior |
| `auth-matrix-remaining.spec.ts` | 298 | 31 | Remaining auth permutations |
| `db-recovery.spec.ts` | 226 | 11 | Database failure/recovery |
| `abuse-vectors-batch.spec.ts` | 170 | 12 | Abuse batch scenarios |
| `error-recovery-batch.spec.ts` | 157 | 10 | Error recovery scenarios |
| `post-lifecycle.integration.spec.ts` | 133 | 10 | Full post lifecycle |
| `gamification.integration.spec.ts` | 116 | 10 | XP, streaks, levels |
| `auth-matrix-batch.spec.ts` | 113 | 10 | Auth matrix batch |
| `thread-lifecycle.integration.spec.ts` | 109 | 10 | Thread lifecycle |
| `messaging-flow.integration.spec.ts` | 106 | 10 | Messaging end-to-end |
| `islamic-features.integration.spec.ts` | 97 | 10 | Islamic features |
| `follow-feed.integration.spec.ts` | 96 | 10 | Follow→feed visibility |

### Integration Test Characteristics
- All use `Test.createTestingModule` (NestJS DI) — NOT true integration with DB
- Multiple services wired together in single test module
- Transaction mocks simulate `$transaction` callbacks
- These are "service-layer integration" tests, not E2E HTTP tests
- No real database connections — all Prisma calls mocked

---

## 7. Mock Provider Architecture

**File:** `apps/api/src/common/test/mock-providers.ts` (198 lines)

### Individual Mock Providers (15 total)

| Mock Provider | Service | Key Methods |
|---------------|---------|-------------|
| `mockPushTriggerService` | PushTriggerService | `triggerPush` |
| `mockPushService` | PushService | `sendPush` |
| `mockNotificationsService` | NotificationsService | `create`, `getNotifications`, `markRead`, `markAllRead`, `getUnreadCount` |
| `mockGamificationService` | GamificationService | `awardXP`, `updateStreak`, `getXP`, `getStreaks` |
| `mockAiService` | AiService | `moderateContent`, `moderateImage`, `isAvailable`, `suggestCaptions`, `suggestHashtags`, `translateText`, `generateAltText` |
| `mockStreamService` | StreamService | `uploadVideo` |
| `mockRedis` | `'REDIS'` token | `get`, `set`, `setex`, `del`, `sadd`, `srem`, `scard`, `smembers`, `hgetall`, `hset`, `hdel`, `incr`, `expire`, `ping`, `pipeline`, `keys`, `mget`, `connect` |
| `mockAsyncJobService` | AsyncJobService | `enqueue`, `getStats` |
| `mockQueueService` | QueueService | `addPushNotificationJob`, `addGamificationJob`, `addWebhookDeliveryJob`, `addSearchIndexJob`, `addModerationJob`, `getStats`, `moveToDlq` |
| `mockAnalyticsService` | AnalyticsService | `track`, `increment`, `getCounter`, `getCounters` |
| `mockFeatureFlagsService` | FeatureFlagsService | `isEnabled`, `isEnabledForUser`, `getAllFlags`, `setFlag`, `deleteFlag` |
| `mockContentSafetyService` | ContentSafetyService | `moderateText`, `moderateImage`, `checkForwardLimit`, `incrementForwardCount`, `checkKindness`, `autoRemoveContent`, `checkViralThrottle`, `trackShare` |
| `mockPrismaService` | PrismaService | `user.findUnique`, `user.findMany` (minimal — most specs override) |
| `mockConfigService` | ConfigService | `get()` with test values for Clerk, Stripe, Meilisearch keys |

### `globalMockProviders` Array
```ts
export const globalMockProviders = [
  mockPrismaService,
  mockConfigService,
  mockRedis,
  mockPushTriggerService,
  mockPushService,
  mockNotificationsService,
  mockGamificationService,
  mockAiService,
  mockStreamService,
  mockAsyncJobService,
  mockQueueService,
  mockAnalyticsService,
  mockFeatureFlagsService,
  mockContentSafetyService,
];
```

### Usage Pattern (548 spec files reference it)
```ts
const module: TestingModule = await Test.createTestingModule({
  providers: [
    ...globalMockProviders,   // spread 15 global mocks
    MyService,                // service under test
    {
      provide: PrismaService, // OVERRIDE the minimal mock with model-specific mocks
      useValue: {
        post: { create: jest.fn(), findUnique: jest.fn(), ... },
        $transaction: jest.fn(),
      },
    },
    // Additional service-specific mock overrides
  ],
}).compile();
```

### Key Design: PrismaService Double-Override
The `globalMockProviders` includes `mockPrismaService` with only `user.findUnique` and `user.findMany`. Nearly every spec file then **overrides** this with a module-specific Prisma mock containing the exact model methods needed. NestJS DI takes the last provider when duplicates exist, so the override wins.

---

## 8. Transaction Simulation Patterns

### Pattern A: Callback Transaction (most common)
Used when service code calls `prisma.$transaction(async (tx) => { ... })`:

```ts
$transaction: jest.fn().mockImplementation(async (fn: unknown) => {
  if (typeof fn === 'function') {
    return fn({
      message: { create: jest.fn().mockResolvedValue({ id: 'msg-tx', content: 'test' }) },
      conversation: { update: jest.fn() },
      conversationMember: { updateMany: jest.fn() },
    });
  }
  return Promise.all(fn as Promise<unknown>[]);
})
```

The mock detects whether `$transaction` received a callback function or an array of promises:
- **Callback:** Invokes with a mock transaction client containing model methods
- **Array:** Resolves all promises via `Promise.all`

### Pattern B: Array Transaction (batch operations)
```ts
$transaction: jest.fn().mockImplementation((args) => Promise.resolve(args))
```
Simply resolves the array of promises passed in.

### Pattern C: Simple Resolve (when transaction result is ignored)
```ts
$transaction: jest.fn().mockResolvedValue([{}, {}, {}])
```

### Occurrences
- 403 spec files reference `$transaction`
- Callback pattern (Pattern A) is dominant — used in messages, content-flow integration, auth batch tests
- Pattern B/C used in simpler modules (follows, gamification)

---

## 9. Common Test Patterns

### Pattern 1: NestJS TestingModule Setup
Every spec file creates a NestJS `TestingModule` in `beforeEach`:

```ts
beforeEach(async () => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ...globalMockProviders,
      ServiceUnderTest,
      { provide: PrismaService, useValue: { /* model mocks */ } },
    ],
  }).compile();

  service = module.get<ServiceUnderTest>(ServiceUnderTest);
  prisma = module.get(PrismaService) as any;
  jest.clearAllMocks();
});
```

### Pattern 2: Error Path Testing (1,484 occurrences)
```ts
it('should throw NotFoundException when user not found', async () => {
  prisma.user.findUnique.mockResolvedValue(null);
  await expect(service.getProfile('nonexistent')).rejects.toThrow(NotFoundException);
});
```

### Pattern 3: Mock Chain Setup
```ts
prisma.user.findUnique.mockResolvedValue({ id: 'user-2', isPrivate: false, isDeactivated: false, isBanned: false });
prisma.block.findFirst.mockResolvedValue(null);
prisma.follow.findUnique.mockResolvedValue(null);

const result = await service.follow('user-1', 'user-2');
expect(result.type).toBe('follow');
expect(prisma.follow.create).toHaveBeenCalled();
```

### Pattern 4: Interaction Verification
```ts
expect(prisma.follow.create).toHaveBeenCalledWith({
  data: { followerId: 'user-1', followingId: 'user-2' },
});
expect(prisma.follow.create).not.toHaveBeenCalled(); // negative case
```

### Pattern 5: Socket Mock (Gateway Specs)
```ts
const mockSocket = {
  join: jest.fn(),
  leave: jest.fn(),
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
  disconnect: jest.fn(),
  handshake: { auth: {}, headers: {} },
  data: {},
};
```

### Pattern 6: class-validator Mock (Gateway Specs Only)
```ts
jest.mock('class-validator', () => {
  const actual = jest.requireActual('class-validator');
  return {
    ...actual,
    validate: jest.fn().mockImplementation((dto: any) => {
      const errors: any[] = [];
      // manual UUID and range validation
      return Promise.resolve(errors);
    }),
  };
});
```
Needed because ts-jest doesn't emit decorator metadata for class-validator.

### Pattern 7: Redis Pipeline Mock
```ts
pipeline: jest.fn().mockReturnValue({
  incrby: jest.fn().mockReturnThis(),
  expire: jest.fn().mockReturnThis(),
  lpush: jest.fn().mockReturnThis(),
  ltrim: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([]),
}),
```
Pipeline methods return `this` for chaining, `exec()` resolves.

### Pattern 8: Global Fetch Mock (Islamic Service)
```ts
const mockFetch = jest.fn().mockRejectedValue(new Error('Network disabled in tests'));
global.fetch = mockFetch as any;
```
Prevents real API calls to external prayer time / Quran APIs.

### Pattern 9: JSON Data Module Mock
```ts
jest.mock('./data/hadiths.json', () => [
  { id: 1, arabic: 'Test Arabic 1', english: 'Test English 1', ... },
], { virtual: true });
```

---

## 10. Specialized Test Categories

### Edge Case Specs (34 files)
Test boundary conditions: empty arrays, null values, zero-length strings, maximum pagination cursors, deactivated/banned users.

**Example pattern:**
```ts
describe('FollowsService — edge cases', () => {
  it('should handle empty followers list gracefully', ...);
  it('should return empty array for deactivated user', ...);
  it('should not crash on null cursor', ...);
});
```

### Auth Specs (19 files)
Test ownership verification, role-based access, banned/deactivated user rejection.

**Tested assertions:**
- Owner can modify own resource
- Non-owner gets `ForbiddenException`
- Admin bypasses ownership check
- Banned user gets `ForbiddenException`
- Deactivated user gets `ForbiddenException`

### Concurrency Specs (10 files)
Test race conditions via `Promise.allSettled`:

```ts
it('should handle mutual follow simultaneously', async () => {
  const [r1, r2] = await Promise.allSettled([
    service.follow('user-a', 'user-b'),
    service.follow('user-b', 'user-a'),
  ]);
  expect(r1.status).toBe('fulfilled');
  expect(r2.status).toBe('fulfilled');
});
```

### Abuse Specs (5 files)
Test self-action rejection, idempotency, spam prevention:

```ts
it('should reject self-follow', async () => {
  await expect(service.follow('user-1', 'user-1')).rejects.toThrow(BadRequestException);
});

it('should be idempotent when following same user twice', async () => {
  // ...setup existing follow...
  expect(prisma.follow.create).not.toHaveBeenCalled(); // no duplicate
});
```

---

## 11. Common Infrastructure Specs

| File | Lines | Focus |
|------|-------|-------|
| `common/guards/clerk-auth.guard.spec.ts` | 386 | JWT verification, token extraction, missing auth header |
| `common/guards/optional-clerk-auth.guard.spec.ts` | 322 | Optional auth (public endpoints), null user passthrough |
| `common/utils/image.spec.ts` | 172 | Image URL parsing, thumbnail generation helpers |
| `common/utils/sanitize.spec.ts` | 149 | HTML sanitization, XSS prevention |
| `common/queue/processors/notification.processor.spec.ts` | 128 | Push notification queue processing |
| `common/queue/processors/media.processor.spec.ts` | 121 | Media processing queue (resize, transcode) |
| `common/queue/processors/ai-tasks.processor.spec.ts` | 106 | AI moderation queue processing |
| `common/queue/processors/webhook.processor.spec.ts` | 102 | Webhook delivery queue processing |
| `common/queue/processors/analytics.processor.spec.ts` | 102 | Analytics event queue processing |
| `common/queue/processors/search-indexing.processor.spec.ts` | 89 | Search index sync queue processing |
| `common/filters/http-exception.filter.spec.ts` | 87 | HTTP error response formatting |
| `common/interceptors/transform.interceptor.spec.ts` | 68 | Response transformation (wrap in `{ data, success, timestamp }`) |
| `common/utils/hashtag.spec.ts` | 57 | Hashtag extraction from text |
| `common/guards/user-throttler.guard.spec.ts` | 57 | Rate limiting guard |
| `config/redis.module.spec.ts` | 53 | Redis module registration |
| `common/middleware/security-headers.middleware.spec.ts` | 44 | Security header injection |

---

## 12. Mobile Test Status

**Mobile test files: 0** (all 13 found are from `node_modules`)

The React Native Expo mobile app (`apps/mobile/`) has no custom test files. All test coverage is on the NestJS backend.

---

## 13. CI Integration

From `.github/workflows/ci.yml`:

```yaml
test-api:
  needs: lint-and-typecheck
  services:
    postgres:16
    redis:7
  steps:
    - npm install --legacy-peer-deps
    - npx prisma generate
    - npx jest --passWithNoTests --forceExit --silent
```

- Tests run with **real PostgreSQL 16 + Redis 7 services** in CI, but all Prisma calls are mocked — services are available for potential future integration tests
- `--forceExit` prevents hanging from unclosed handles
- `--passWithNoTests` prevents failure if a directory has no specs
- `--silent` suppresses console output for clean CI logs

---

## 14. Test Architecture Diagram

```
apps/api/src/
├── common/test/
│   └── mock-providers.ts          ← 15 global mock providers (198 lines)
│
├── modules/{module}/
│   ├── {module}.controller.spec.ts  ← HTTP layer (82 files)
│   ├── {module}.service.spec.ts     ← Business logic (87 files)
│   ├── {module}.service.edge.spec.ts    ← Boundary cases (34 files)
│   ├── {module}.service.auth.spec.ts    ← Permission tests (19 files)
│   ├── {module}.service.concurrency.spec.ts  ← Race conditions (10 files)
│   └── {module}.service.abuse.spec.ts   ← Abuse vectors (5 files)
│
├── gateways/
│   ├── chat.gateway.spec.ts         ← WebSocket events (1,169 lines)
│   └── chat.gateway.ratelimit.spec.ts ← WS rate limiting
│
├── integration/                     ← Cross-service flows (21 files, 6,254 lines)
│   ├── content-flow.integration.spec.ts
│   ├── auth-matrix-*.spec.ts
│   ├── abuse-*.spec.ts
│   ├── concurrency-*.spec.ts
│   └── ...
│
└── common/
    ├── guards/*.spec.ts             ← Auth guards (4 files)
    ├── filters/*.spec.ts            ← Exception filters (1 file)
    ├── interceptors/*.spec.ts       ← Response transform (1 file)
    ├── middleware/*.spec.ts          ← Security headers (1 file)
    ├── queue/processors/*.spec.ts   ← Queue workers (6 files)
    └── utils/*.spec.ts              ← Utility functions (3 files)
```

---

## 15. Test Naming Conventions

### Describe Block Naming
- **Service:** `describe('PostsService', ...)`
- **Edge:** `describe('FollowsService — edge cases', ...)`
- **Auth:** `describe('BookmarksService — auth', ...)`
- **Concurrency:** `describe('FollowsService — concurrency (Task 89)', ...)`
- **Abuse:** `describe('FollowsService — abuse vectors (Task 96)', ...)`
- **Integration:** `describe('Integration: Content Flow', ...)`

### It Block Naming
- `it('should return conversations with membership info', ...)`
- `it('should throw NotFoundException when user not found', ...)`
- `it('should reject self-follow', ...)`
- `it('should be idempotent when following same user twice', ...)`
- `it('should handle mutual follow simultaneously', ...)`

Pattern: `should {expected behavior}` — consistent across all 5,248 test cases.

---

## 16. Known Test Architecture Gaps

1. **No mobile tests** — 0 custom test files in `apps/mobile/`
2. **No E2E HTTP tests** — all "integration" tests mock Prisma, none hit real HTTP endpoints
3. **No parameterized tests** — 0 uses of `it.each()` or `describe.each()`
4. **No snapshot tests** — no `toMatchSnapshot()` or `toMatchInlineSnapshot()`
5. **No coverage thresholds** — Jest config has no minimum coverage enforcement
6. **No test timeout overrides** — all tests use default 5s timeout
7. **`mockPrismaService` is minimal** — only `user.findUnique/findMany`, every spec must override
8. **No shared test fixtures** — mock data (users, posts, etc.) is duplicated across spec files
9. **No test data factory** — no `createMockUser()`, `createMockPost()` helper functions
10. **Heavy beforeEach overhead** — every test recreates the entire NestJS TestingModule
11. **No database seeding tests** — `prisma/seed.ts` is not tested
12. **Integration tests are service-layer only** — no controller-level integration tests

---

## 17. Test Suite Summary by Numbers

```
302 test suites
5,226 tests (as of last run)
100% pass rate
0 TypeScript errors
0 skipped
0 focused
70,305 lines of test code
7,731 assertions
~80 modules covered
```
