# Testing Patterns

**Analysis Date:** 2026-03-30

## Overview

| App | Framework | Test Files | Approx Tests | Config |
|-----|-----------|------------|--------------|--------|
| `apps/api` | Jest 29 + ts-jest | 315 spec + 11 test/ | ~5000+ | `apps/api/jest.config.ts` |
| `apps/mobile` (signal) | Jest + ts-jest | 18 test files | ~633 | `apps/mobile/src/services/signal/__tests__/jest.config.js` |
| `apps/mobile` (hooks) | Jest + ts-jest | 2 test files | ~49 | `apps/mobile/src/hooks/__tests__/jest.config.js` |
| `apps/e2e-server` | Go `testing` | 3 test files | ~50+ | Native Go test runner |
| `apps/livekit-server` | Go `testing` | 5 test files | ~123 | Native Go test runner |

## Test Framework: API (NestJS)

**Runner:**
- Jest 29.7 + ts-jest 29.2
- Config: `apps/api/jest.config.ts`

**Assertion Library:**
- Jest built-in (`expect`, `toBe`, `toEqual`, `toHaveBeenCalledWith`, `toThrow`, etc.)

**Run Commands:**
```bash
cd apps/api && pnpm test                              # All unit tests
cd apps/api && pnpm test -- --testPathPattern=posts    # Single module
cd apps/api && pnpm test:watch                         # Watch mode
cd apps/api && pnpm test:e2e                           # E2E tests (supertest)
cd apps/api && pnpm test:integration                   # Integration tests (real DB)
```

**Jest Config (`apps/api/jest.config.ts`):**
```typescript
export default {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': ['ts-jest', { diagnostics: false }] },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
};
```

## Test File Organization: API

**Location:** Co-located with source files (same directory).

**Naming Patterns:**
- Unit tests: `{feature}.service.spec.ts`, `{feature}.controller.spec.ts`
- Edge case tests: `{feature}.service.edge.spec.ts`
- Auth tests: `{feature}.service.auth.spec.ts`
- Abuse vector tests: `{feature}.service.abuse.spec.ts`
- Concurrency tests: `{feature}.service.concurrency.spec.ts`
- DTO validation tests: `{feature}.dto-validation.spec.ts`
- Integration tests: `src/integration/{name}.integration.spec.ts` or `src/integration/{name}.spec.ts`
- DB integration tests: `test/integration-db/{name}.integration-db.spec.ts`

**Per-module test breakdown (example: posts module at `apps/api/src/modules/posts/`):**
```
posts/
  posts.controller.spec.ts          # Controller routes → service calls
  posts.service.spec.ts             # Core service logic
  posts.service.edge.spec.ts        # Edge cases (null, empty, limits)
  posts.service.auth.spec.ts        # Authorization checks
  posts.service.abuse.spec.ts       # Abuse vectors (duplicate, injection)
  posts.service.blocked.spec.ts     # Block/mute interaction
  posts.service.concurrency.spec.ts # Race conditions
  posts.dto-validation.spec.ts      # DTO validation rules
  posts.analytics.spec.ts           # Analytics-related logic
  posts.schedule.spec.ts            # Scheduled post logic
  posts.publish-fields.spec.ts      # Publish field handling
  posts.comment-permission.spec.ts  # Comment permission logic
```

## Test Structure: API

**Service Test Pattern:**
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { PostsService } from './posts.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('PostsService', () => {
  let service: PostsService;
  let prisma: any;  // Test files MAY use `as any` for mocks

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,  // Shared mock providers
        PostsService,
        {
          provide: PrismaService,
          useValue: {
            post: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
            },
            // ... per-test Prisma model mocks
          },
        },
      ],
    }).compile();

    service = module.get<PostsService>(PostsService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('should create a post', async () => {
      prisma.post.create.mockResolvedValue({ id: 'post-1' });
      const result = await service.create('user-1', { content: 'test' } as any);
      expect(result).toEqual({ id: 'post-1' });
    });
  });
});
```

**Controller Test Pattern:**
```typescript
describe('PostsController', () => {
  let controller: PostsController;
  const mockService = {
    getFeed: jest.fn(),
    create: jest.fn(),
    getById: jest.fn(),
    // ... mock all service methods
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [PostsController],
      providers: [
        ...globalMockProviders,
        { provide: PostsService, useValue: mockService },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();
    controller = module.get(PostsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call service.getFeed with userId and type', async () => {
    mockService.getFeed.mockResolvedValue({ data: [], meta: {} });
    await controller.getFeed('user-1', 'foryou', undefined);
    expect(mockService.getFeed).toHaveBeenCalledWith('user-1', 'foryou', undefined);
  });
});
```

## Global Mock Providers

**Location:** `apps/api/src/common/test/mock-providers.ts`

This file provides reusable mock providers for all shared services. Add `...globalMockProviders` to any test module's providers array to get mocks for:

- `PrismaService` (basic user/webhook models)
- `ConfigService` (returns test keys for CLERK, STRIPE, MEILISEARCH)
- `Redis` (full mock: get/set/del/sadd/srem/pipeline/publish/etc.)
- `PushTriggerService`, `PushService`, `NotificationsService`
- `GamificationService`, `AiService`, `StreamService`
- `AsyncJobService`, `QueueService`, `AnalyticsService`
- `FeatureFlagsService`, `ContentSafetyService`
- `PrivacyService`, `UploadService`, `PublishWorkflowService`
- `CircuitBreakerService`

**Usage:**
```typescript
import { globalMockProviders } from '../../common/test/mock-providers';

const module = await Test.createTestingModule({
  providers: [
    ...globalMockProviders,       // All global services mocked
    MyService,                     // Service under test (real)
    { provide: PrismaService, useValue: { /* custom mocks */ } },  // Override specific provider
  ],
}).compile();
```

**Individual mocks are also exported** for selective use:
```typescript
import { mockRedis, mockPrismaService, mockConfigService } from '../../common/test/mock-providers';
```

## Mocking: API

**Framework:** Jest built-in (`jest.fn()`, `jest.mock()`)

**Prisma Mocking Pattern:**
- Each test provides its own PrismaService mock with only the models it needs
- Mock methods with `jest.fn()` and set return values with `mockResolvedValue()`
- Transaction mock: `$transaction: jest.fn().mockImplementation(async (fn) => fn(prisma))`
- Block/mute checks default to empty arrays: `.mockResolvedValue([])`

**Redis Mocking:**
- `mockRedis` provides comprehensive Redis mock covering: `get`, `set`, `setex`, `del`, `sadd`, `srem`, `scard`, `smembers`, `hgetall`, `hset`, `pipeline`, `zadd`, `zrevrange`, `publish`, `pfadd`, `pfcount`, etc.
- Pipeline mock returns chainable `mockReturnThis()` with `exec: jest.fn().mockResolvedValue([])`

**What to Mock (API):**
- PrismaService (always)
- Redis (always)
- External services (Clerk, Stripe, Sentry, Meilisearch)
- Sibling services (NotificationsService, GamificationService, etc.)

**What NOT to Mock (API):**
- The service under test
- DTOs and their validation
- Utility functions (sanitize, hashtag extraction)

## Integration Tests: API

**Service-layer integration (`apps/api/src/integration/`):**
- 23 files testing cross-service flows
- Use same NestJS `Test.createTestingModule` but with multiple real services
- Still mock Prisma (no DB) -- tests service interaction logic
- Example: content flow (create post -> react -> comment -> feed -> delete)

**DB integration tests (`apps/api/test/integration-db/`):**
- 8 files testing against real PostgreSQL
- CI provisions PostgreSQL 16 + pgvector + Redis 7 via GitHub Actions services
- Test helper: `apps/api/test/integration-db/prisma-test-helper.ts`
- Pattern:
```typescript
const helper = new PrismaTestHelper();
beforeAll(() => helper.setup());     // Connects DB, pushes schema
afterEach(() => helper.cleanup());    // TRUNCATE all tables CASCADE
afterAll(() => helper.teardown());    // Disconnects

it('should atomically update counters', async () => {
  const user = await helper.createUser({ followersCount: 10 });
  // Test actual DB behavior...
});
```
- `PrismaTestHelper` has seed helpers: `createUser()`, `createPost()`, `createThread()`, `createFollow()`, `createBlock()`, `createMute()`, etc.
- Config: `apps/api/test/jest-integration.json` (30s timeout, maxWorkers: 1)

**HTTP E2E tests (`apps/api/test/`):**
- `health.e2e-spec.ts`, `posts.e2e-spec.ts`
- Use `supertest` for HTTP assertions
- Config: `apps/api/test/jest-e2e.json`

## Test Framework: Mobile (Signal Protocol)

**Runner:**
- Jest (via ts-jest), Node.js environment (NOT jest-expo)
- Config: `apps/mobile/src/services/signal/__tests__/jest.config.js`

**Run Command:**
```bash
cd apps/mobile && npx jest --config src/services/signal/__tests__/jest.config.js
```

**Test files at `apps/mobile/src/services/signal/__tests__/`:**
- `crypto.test.ts` -- key generation, DH, AEAD, HKDF, base64, signing
- `double-ratchet.test.ts` -- Double Ratchet protocol
- `e2e-integration.test.ts` -- end-to-end encryption flow
- `e2eApi.test.ts` -- E2E API client
- `prekeys.test.ts` -- prekey generation and bundle
- `safety-numbers.test.ts` -- safety number derivation
- `sender-keys.test.ts` -- group messaging sender keys
- `storage.test.ts` -- MMKV encrypted storage
- `media-crypto.test.ts` -- media file encryption
- `streaming-upload.test.ts` -- streaming encrypted upload
- `telemetry.test.ts` -- telemetry events
- `client-infra.test.ts` -- client infrastructure
- `f1-f5-critical-fixes.test.ts` -- audit finding regression tests
- `f6-f13-high-fixes.test.ts` -- high-priority audit fixes
- `v4-audit-fixes.test.ts` -- v4 audit regression tests
- `v5-audit-fixes.test.ts` -- v5 audit regression tests
- `v7-audit-fixes.test.ts` -- v7 audit regression tests

**Native Module Mocks (at `apps/mobile/src/services/signal/__tests__/__mocks__/`):**
- `expo-crypto.js` -- uses Node.js `crypto.randomBytes` as replacement
- `expo-secure-store.js` -- in-memory key-value store
- `react-native-mmkv.js` -- in-memory Map-based MMKV mock
- `expo-file-system.js` -- file system mock
- `expo-notifications.js` -- notification mock

**Signal Test Pattern:**
```typescript
import { generateX25519KeyPair, aeadEncrypt, aeadDecrypt } from '../crypto';

describe('generateX25519KeyPair', () => {
  it('produces 32-byte public and private keys', () => {
    const kp = generateX25519KeyPair();
    expect(kp.publicKey).toBeInstanceOf(Uint8Array);
    expect(kp.privateKey).toBeInstanceOf(Uint8Array);
    expect(kp.publicKey.length).toBe(32);
    expect(kp.privateKey.length).toBe(32);
  });

  it('produces different keys each time', () => {
    const kp1 = generateX25519KeyPair();
    const kp2 = generateX25519KeyPair();
    expect(Buffer.from(kp1.privateKey).equals(Buffer.from(kp2.privateKey))).toBe(false);
  });
});
```

## Test Framework: Mobile (Hooks + CallKit)

**Runner:**
- Jest (via ts-jest), Node.js environment
- Config: `apps/mobile/src/hooks/__tests__/jest.config.js`

**Run Command:**
```bash
cd apps/mobile && npx jest --config src/hooks/__tests__/jest.config.js
```

**Test files:**
- `apps/mobile/src/hooks/__tests__/useLiveKitCall.test.ts` -- base64, emoji verification, SAS emojis, key zeroing, active room registry
- `apps/mobile/src/services/__tests__/callkit.test.ts` -- CallKit/ConnectionService (22 tests)

**Native Module Mocking Pattern:**
```typescript
// Mock at top of file, before imports
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));
jest.mock('livekit-client', () => ({
  Room: jest.fn(),
  RoomEvent: {},
  Track: { Source: { Camera: 'camera' } },
}));
jest.mock('@livekit/react-native', () => ({
  AudioSession: { startAudioSession: jest.fn() },
  RNE2EEManager: jest.fn(),
  RNKeyProvider: jest.fn(),
}));
// REAL imports (non-native deps) - use actual implementation
import { registerActiveRoomCleanup, disconnectActiveRoom } from '@/services/activeRoomRegistry';
import { base64ToBytes, deriveVerificationEmojis } from '../useLiveKitCall';
```

**Key pattern:** Mock ALL native modules, test exported utility functions directly. The hook itself requires native modules and is tested on device only.

## Test Framework: Go (E2E Server + LiveKit Server)

**Runner:**
- Go standard library `testing` package
- No external test frameworks

**Run Commands:**
```bash
cd apps/e2e-server && go test ./internal/... -v -count=1    # E2E server
cd apps/livekit-server && go test ./internal/... -v -count=1 # LiveKit server
```

**Test files:**
- `apps/e2e-server/internal/handler/handler_test.go`
- `apps/e2e-server/internal/middleware/auth_test.go`
- `apps/e2e-server/internal/middleware/ratelimit_test.go`
- `apps/livekit-server/internal/handler/handler_test.go` (105 tests)
- `apps/livekit-server/internal/handler/mock_store_test.go`
- `apps/livekit-server/internal/config/config_test.go` (10 tests)
- `apps/livekit-server/internal/middleware/auth_test.go` (5 tests)
- `apps/livekit-server/internal/middleware/ratelimit_test.go` (3 tests)

**Go Test Pattern (Handler):**
```go
func newTestHandler() (*Handler, *mockStore) {
    ms := newMockStore()
    ms.addUser("caller-1")
    ms.addUser("callee-1")
    logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelError}))
    h := &Handler{db: ms, cfg: testCfg, logger: logger}
    return h, ms
}

func withAuth(r *http.Request, userID string) *http.Request {
    ctx := context.WithValue(r.Context(), middleware.TestUserIDKey(), userID)
    return r.WithContext(ctx)
}

func TestCreateToken_MissingRoomName(t *testing.T) {
    h, _ := newTestHandler()
    body := strings.NewReader(`{"roomName":""}`)
    r := withAuth(httptest.NewRequest("POST", "/api/v1/calls/token", body), "caller-1")
    w := httptest.NewRecorder()
    h.HandleCreateToken(w, r)
    if w.Code != 400 {
        t.Errorf("expected 400, got %d", w.Code)
    }
}
```

**Go Mock Store Pattern:**
```go
// Compile-time interface check
var _ store.Querier = (*mockStore)(nil)

type mockStore struct {
    mu       sync.Mutex
    sessions map[string]*model.CallSession
    users    map[string]bool
    blocks   map[string]bool
    healthy  bool
}

func newMockStore() *mockStore {
    return &mockStore{
        sessions: make(map[string]*model.CallSession),
        users:    make(map[string]bool),
        blocks:   make(map[string]bool),
        healthy:  true,
    }
}
```

- Mock store implements `store.Querier` interface
- In-memory maps simulate database state
- `sync.Mutex` for concurrency safety
- `addUser()` helper to seed test data
- `healthy` flag to test health check failure paths

**Go Config Test Pattern:**
```go
func clearEnv() {
    for _, key := range []string{"LIVEKIT_API_KEY", "DATABASE_URL", ...} {
        os.Unsetenv(key)
    }
}

func setRequiredEnv() {
    os.Setenv("LIVEKIT_API_KEY", "devkey")
    os.Setenv("DATABASE_URL", "postgres://localhost/test")
    // ...
}

func TestLoad_MissingEach(t *testing.T) {
    required := []string{"LIVEKIT_API_KEY", "DATABASE_URL", ...}
    for _, key := range required {
        t.Run(key, func(t *testing.T) {
            clearEnv(); setRequiredEnv()
            os.Unsetenv(key)
            defer clearEnv()
            _, err := Load()
            if err == nil {
                t.Fatalf("expected error when %s is missing", key)
            }
        })
    }
}
```

## CI/CD Integration

**GitHub Actions at `.github/workflows/ci.yml`:**

| Job | Dependencies | Services | What |
|-----|-------------|----------|------|
| `lint-and-typecheck` | -- | -- | TypeScript typecheck (API + Mobile) |
| `build-mobile` | lint-and-typecheck | -- | Verify mobile deps installed |
| `test-api` | lint-and-typecheck | PostgreSQL 16, Redis 7 | Run `jest` unit tests |
| `test-api-integration` | test-api | PostgreSQL 16 (pgvector), Redis 7 | Push schema + run integration tests |
| `build-api` | test-api | -- | `nest build` |
| `e2e-server` | -- | PostgreSQL 16, Redis 7 | Go build + test |

**CI Environment:**
- Node 20, Go 1.25
- PostgreSQL 16 Alpine (pgvector for integration)
- Redis 7 Alpine
- `npm ci --legacy-peer-deps`
- Prisma generate before all TS jobs
- Integration tests push schema with `--accept-data-loss --force-reset`

**Triggers:** Push and PR to `main` and `develop` branches.

## Coverage

**Requirements:** Not formally enforced (no coverage threshold configured).

**Generate Coverage (API):**
```bash
cd apps/api && pnpm test -- --coverage
# Output: apps/api/coverage/
```

**Generate Coverage (Integration):**
```bash
cd apps/api && pnpm test:integration -- --coverage
# Output: apps/api/coverage-integration/
```

## Test Types Summary

**Unit Tests (API):**
- Scope: individual service methods, controller routes, guards, interceptors, filters, utils
- Approach: mock all dependencies, test single function behavior
- Location: co-located `*.spec.ts` files
- Patterns: happy path, error cases, auth checks, abuse vectors, edge cases, concurrency

**Service Integration Tests (API):**
- Scope: cross-service flows (create -> react -> feed -> delete)
- Approach: multiple real services, mocked DB
- Location: `apps/api/src/integration/*.spec.ts`

**DB Integration Tests (API):**
- Scope: real SQL queries against PostgreSQL
- Approach: real DB, real Prisma queries, TRUNCATE between tests
- Location: `apps/api/test/integration-db/*.integration-db.spec.ts`
- Helper: `apps/api/test/integration-db/prisma-test-helper.ts`

**E2E/HTTP Tests (API):**
- Scope: full HTTP request/response cycle
- Approach: supertest against NestJS app
- Location: `apps/api/test/*.e2e-spec.ts`

**Crypto Unit Tests (Mobile):**
- Scope: Signal Protocol primitives (X25519, Ed25519, AEAD, HKDF, Ratchet)
- Approach: pure Node.js (no React Native), known test vectors, round-trip verification
- Location: `apps/mobile/src/services/signal/__tests__/*.test.ts`

**Utility Tests (Mobile):**
- Scope: exported utility functions from hooks and services
- Approach: mock native modules, test pure functions
- Location: `apps/mobile/src/hooks/__tests__/*.test.ts`, `apps/mobile/src/services/__tests__/*.test.ts`

**Handler Tests (Go):**
- Scope: HTTP handler input/output, authorization, validation
- Approach: mock store interface, httptest.NewRecorder, context injection
- Location: `apps/{service}/internal/handler/handler_test.go`

## Common Test Patterns

**Async Error Testing (API):**
```typescript
it('should throw NotFoundException for missing post', async () => {
  prisma.post.findUnique.mockResolvedValue(null);
  await expect(service.getById('missing-id', 'viewer')).rejects.toThrow(NotFoundException);
});
```

**Conflict Detection (API):**
```typescript
it('should detect duplicate share', async () => {
  prisma.post.findUnique.mockResolvedValue(mockPost);
  prisma.post.findFirst.mockResolvedValue({ id: 'existing-share' });
  await expect(service.share('post-1', 'user-1')).rejects.toThrow(ConflictException);
});
```

**RxJS Observable Testing (Interceptor):**
```typescript
it('should wrap data in { success, data, timestamp }', (done) => {
  const handler = { handle: () => of({ id: 'p1', content: 'test' }) };
  interceptor.intercept(mockContext, handler as any).subscribe((result) => {
    expect(result.success).toBe(true);
    expect((result as any).data).toEqual({ id: 'p1', content: 'test' });
    done();
  });
});
```

**Go HTTP Status Testing:**
```go
func TestCreateToken_MissingRoomName(t *testing.T) {
    h, _ := newTestHandler()
    body := strings.NewReader(`{"roomName":""}`)
    r := withAuth(httptest.NewRequest("POST", "/api/v1/calls/token", body), "caller-1")
    w := httptest.NewRecorder()
    h.HandleCreateToken(w, r)
    if w.Code != 400 {
        t.Errorf("expected 400, got %d", w.Code)
    }
}
```

**Go JSON Response Parsing:**
```go
var resp map[string]interface{}
json.NewDecoder(w.Body).Decode(&resp)
if resp["token"] == nil {
    t.Error("expected token in response")
}
```

**Crypto Round-Trip (Mobile):**
```typescript
it('round-trips encrypt/decrypt', () => {
  const key = generateRandomBytes(32);
  const plaintext = utf8Encode('Hello, Mizanly!');
  const nonce = generateRandomBytes(24);
  const ciphertext = aeadEncrypt(key, nonce, plaintext);
  const decrypted = aeadDecrypt(key, nonce, ciphertext);
  expect(utf8Decode(decrypted)).toBe('Hello, Mizanly!');
});
```

## Test Rules (from CLAUDE.md)

- Tests cover the ENTIRE scope, not just fixes. Cover untested parts too.
- Every code change MUST have tests written and verified passing.
- Test files MAY use `as any` for mocks (only exception to no-any rule).
- NEVER use Sonnet or Haiku as subagent models for test generation. Opus only.
- After every code change: run affected tests. If any fail, fix before reporting.
- Report format: "Changes: [list]. Tests: [pass/fail]. Remaining: [list or none]."

## Known Test Gaps

**Mobile screens:** Zero test coverage on 213+ React Native screens. Only utility functions and hooks are tested. React component testing would require React Native Testing Library.

**WebSocket gateway:** `apps/api/src/gateways/chat.gateway.spec.ts` exists with mocked Socket.IO, but real WebSocket integration is untested.

**Go SQL queries:** Go tests use mock stores. Actual SQL (column names, JOINs, transactions) is only verified when deployed against real PostgreSQL (CI integration tests for API only, not Go services).

**LiveKit hook:** `useLiveKitCall` hook requires native modules (`@livekit/react-native`) and cannot be tested in Jest. Only extracted utility functions (base64, emoji derivation) are tested. State machine extraction planned but not done.

---

*Testing analysis: 2026-03-30*
