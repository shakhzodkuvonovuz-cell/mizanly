# Agent #31: Test Quality Deep Audit

**Scope:** 238 test files across `apps/api/src/modules/**/*.spec.ts` + `apps/api/src/gateways/*.spec.ts` + `apps/api/src/integration/*.spec.ts`
**Method:** Line-by-line review of 40+ test files sampled across all categories (service specs, controller specs, edge case specs, auth specs, abuse specs, concurrency specs, integration specs, gateway spec)
**Date:** 2026-03-21

---

## STRUCTURAL FINDINGS

### Finding 1: ALL controller tests are pass-through delegation tests — zero value
**Severity:** HIGH (systemic)
**Files affected:** All 63+ `*.controller.spec.ts` files
**Sample files:**
- `apps/api/src/modules/posts/posts.controller.spec.ts` (lines 60-223)
- `apps/api/src/modules/follows/follows.controller.spec.ts` (lines 43-146)
- `apps/api/src/modules/admin/admin.controller.spec.ts` (lines 53-179)
- `apps/api/src/modules/bookmarks/bookmarks.controller.spec.ts`
- `apps/api/src/modules/gamification/gamification.controller.spec.ts`
- `apps/api/src/modules/gifts/gifts.controller.spec.ts`

**Pattern:** Every single controller test follows this identical pattern:
```typescript
it('should call service.methodName with params', async () => {
  mockService.methodName.mockResolvedValue({ id: 'x' });
  const result = await controller.methodName('user-1', dto);
  expect(mockService.methodName).toHaveBeenCalledWith('user-1', dto);
  expect(result).toEqual({ id: 'x' });
});
```

**Problem:** These tests verify that `controller.method()` calls `service.method()` with the same arguments — which is guaranteed by the TypeScript compiler. They do not test:
- DTO validation (decorators like `@IsString()`, `@MaxLength()` are never exercised)
- Route guards (`ClerkAuthGuard` is mocked to always return `true`)
- HTTP status codes
- Response transformation (TransformInterceptor)
- Error mapping (NestJS exception filters)
- Throttling (rate limit decorators)
- Parameter decorators (`@CurrentUser('id')`, `@Param()`)

**Impact:** 63 files, ~630 tests that will ALWAYS pass regardless of whether the controller is correct, broken, or deleted. These tests provide false confidence.

---

### Finding 2: "Integration" tests are unit tests in disguise — same mock patterns
**Severity:** HIGH
**Files affected:**
- `apps/api/src/integration/post-lifecycle.integration.spec.ts`
- `apps/api/src/integration/follow-feed.integration.spec.ts`
- `apps/api/src/integration/gamification.integration.spec.ts`
- `apps/api/src/integration/islamic-features.integration.spec.ts`
- `apps/api/src/integration/messaging-flow.integration.spec.ts`
- `apps/api/src/integration/thread-lifecycle.integration.spec.ts`

**Evidence:** `post-lifecycle.integration.spec.ts` (lines 1-73):
```typescript
// Uses the exact same pattern as unit tests
const prismaValue: any = {
  post: {
    create: jest.fn().mockResolvedValue(mockPost),
    findUnique: jest.fn().mockResolvedValue(mockPost),
    // ... all mocked
  },
  $transaction: jest.fn().mockImplementation((fnOrArr: any) => {
    if (typeof fnOrArr === 'function') return fnOrArr(prismaValue);
    return Promise.resolve(fnOrArr);
  }),
};
```

**Problem:** These files are named "integration" but use `jest.fn()` mocks for every dependency. A real integration test would use a test database, real Prisma client, and test the actual interaction between service + Prisma + DB. These test the same thing as the service unit tests — how the service calls its mock dependencies.

**Impact:** 6 "integration" tests that contribute zero additional coverage beyond what the service unit tests already provide.

---

### Finding 3: globalMockProviders creates a hidden dependency problem
**Severity:** MEDIUM
**File:** `apps/api/src/common/test/mock-providers.ts` (lines 1-181)

**Problem:** Every test file imports `globalMockProviders` which includes 13 mocked services. When a test file also provides its own `PrismaService` mock, the `globalMockProviders` version is silently overridden. But if a test forgets to provide a specific mock, the global one kicks in with its hardcoded return values (e.g., `moderateContent` always returns `{ safe: true }`). This means:

1. Tests never fail due to moderation — `mockAiService` always returns `safe: true`
2. Tests never fail due to notifications — `mockNotificationsService.create` always resolves
3. Tests never fail due to gamification — `mockGamificationService.awardXP` always resolves
4. Tests never fail due to feature flags — `mockFeatureFlagsService.isEnabled` always returns `false`

**Impact:** Services that depend on AI moderation, notifications, gamification, or feature flags will always have those dependencies return happy-path values, masking integration bugs.

---

## MOCK PATTERN FINDINGS

### Finding 4: $transaction mock doesn't test transactional behavior
**Severity:** HIGH
**Files affected:** Every service test that uses `$transaction`
**Sample files:**
- `apps/api/src/modules/posts/posts.service.spec.ts` (line 141-147)
- `apps/api/src/modules/messages/messages.service.spec.ts` (line 59-66)
- `apps/api/src/modules/blocks/blocks.service.spec.ts` (line 56)
- `apps/api/src/modules/follows/follows.service.spec.ts` (line 88-94)

**Evidence from posts.service.spec.ts:**
```typescript
prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
  return fn({
    post: { create: jest.fn().mockResolvedValue(mockPost) },
    user: { update: jest.fn().mockResolvedValue(undefined) },
    hashtag: { upsert: jest.fn().mockResolvedValue({}) },
  });
});
```

**Problem:** The mock `$transaction` provides a completely separate set of mocks for the transaction callback. These transaction-internal mocks are:
1. Not the same as the outer `prisma.post.create`, so assertions on `prisma.post.create` don't verify what happened inside the transaction
2. Don't actually enforce atomicity — if the real code doesn't use `$transaction`, the test still passes
3. Don't test rollback behavior on failure

The test at line 152 asserts `expect(prisma.$transaction).toHaveBeenCalled()` — this only verifies the function was called, not what happened inside it.

---

### Finding 5: Concurrency tests don't test concurrency
**Severity:** HIGH
**Files affected:**
- `apps/api/src/modules/posts/posts.service.concurrency.spec.ts`
- `apps/api/src/modules/gifts/gifts.service.concurrency.spec.ts`
- `apps/api/src/modules/messages/messages.service.concurrency.spec.ts`
- `apps/api/src/modules/stories/stories.service.concurrency.spec.ts`
- `apps/api/src/modules/threads/threads.service.concurrency.spec.ts`
- `apps/api/src/modules/videos/videos.service.concurrency.spec.ts`
- `apps/api/src/modules/channels/channels.service.concurrency.spec.ts`
- `apps/api/src/modules/gamification/gamification.service.concurrency.spec.ts`
- `apps/api/src/modules/follows/follows.service.concurrency.spec.ts`
- `apps/api/src/modules/reels/reels.service.concurrency.spec.ts`

**Evidence from posts.service.concurrency.spec.ts (lines 51-65):**
```typescript
it('should handle two simultaneous likes from different users', async () => {
  prisma.post.findUnique.mockResolvedValue(mockPost);
  prisma.postReaction.findUnique.mockResolvedValue(null);
  prisma.$transaction
    .mockResolvedValueOnce([{}, {}])
    .mockResolvedValueOnce([{}, {}]);

  const [r1, r2] = await Promise.allSettled([
    service.react('post-1', 'user-1'),
    service.react('post-1', 'user-2'),
  ]);

  const successes = [r1, r2].filter(r => r.status === 'fulfilled');
  expect(successes.length).toBeGreaterThanOrEqual(1);
});
```

**Problem:** `Promise.allSettled` with mocked dependencies doesn't create real concurrency. The mocks resolve immediately and synchronously in JavaScript's event loop. Real concurrency bugs (race conditions, lost updates, deadlocks) require real database operations on shared rows. These tests only verify that `Promise.allSettled` works with two promises.

**Evidence from gifts.service.concurrency.spec.ts (lines 86-94):**
```typescript
it('should handle getBalance called concurrently', async () => {
  prisma.coinBalance.upsert.mockResolvedValue({ userId: 'user-1', coins: 50, diamonds: 10 });
  const promises = Array.from({ length: 5 }, () => service.getBalance('user-1'));
  const results = await Promise.allSettled(promises);
  expect(results.every(r => r.status === 'fulfilled')).toBe(true);
});
```

This tests that calling a mocked function 5 times works. It will always pass.

---

### Finding 6: Weak assertions that pass regardless of implementation
**Severity:** HIGH
**Files and examples:**

**6a.** `apps/api/src/modules/gamification/gamification.service.spec.ts` line 74:
```typescript
it('should increment streak for consecutive days', async () => {
  // ...mock setup...
  const result = await service.updateStreak('user-1', 'posting');
  expect(prisma.userStreak.update).toHaveBeenCalled();
});
```
Only checks that `update` was called, not what data was passed. The streak could be set to 0 or 999 and the test passes.

**6b.** `apps/api/src/modules/gamification/gamification.service.spec.ts` line 109:
```typescript
it('should calculate progress to next level', async () => {
  // ...mock returns totalXP: 200, level: 2
  const result = await service.getXP('user-1') as any;
  expect(result.progressToNext).toBeDefined();
  expect(result.nextLevelXP).toBeGreaterThan(200);
});
```
Uses `toBeDefined()` which passes for any truthy value, and `toBeGreaterThan(200)` doesn't verify the calculation is correct.

**6c.** `apps/api/src/modules/posts/posts.service.edge.spec.ts` line 144:
```typescript
const result = await service.create(userId, {
  postType: 'TEXT',
  content: arabicContent,
  mentions: ['user'],
});
expect(result.content).toBeDefined();
expect(prisma.post.create).toHaveBeenCalled();
```
Only checks that `content` exists and `create` was called. Doesn't verify the Arabic content was preserved correctly.

**6d.** `apps/api/src/modules/gamification/gamification.service.spec.ts` line 325:
```typescript
it('should return series with episodes', async () => {
  prisma.series.findUnique.mockResolvedValue({
    id: 's-1', title: 'Learn Arabic', episodes: [{ id: 'ep-1' }],
  });
  const result = await service.getSeries('s-1');
  expect(result).toBeDefined();
});
```
`expect(result).toBeDefined()` passes for literally any non-undefined value. The function could return `"garbage"` and pass.

**6e.** `apps/api/src/modules/live/live.service.spec.ts` line 76:
```typescript
it('rejects joining ended session', async () => {
  prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', status: 'ENDED', hostId: 'h' });
  await expect(service.join('live1', 'user1')).rejects.toThrow();
});
```
`rejects.toThrow()` without an argument accepts ANY thrown error, including unexpected ones. Should specify the expected exception type.

---

### Finding 7: AI service tests only test fallback behavior — real API paths untested
**Severity:** HIGH
**File:** `apps/api/src/modules/ai/ai.service.spec.ts` (lines 1-215)

**Evidence (lines 12-13):**
```typescript
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;
```

**Problem:** The entire AI service test suite deletes API keys to force fallback paths. Every test then verifies only the fallback behavior:
- `suggestCaptions` returns hardcoded fallbacks
- `suggestHashtags` returns hardcoded fallbacks
- `moderateContent` returns `safe: true` (the dangerous fallback path!)
- `moderateImage` returns `SAFE` classification
- `translateText` returns cached/fallback text
- `transcribeVoiceMessage` returns `null`
- `generateVideoCaptions` returns `''`

**Impact:** The actual Claude API integration, Whisper API integration, and Gemini API integration are never tested. The moderation "always returns safe" fallback is the exact path that allows harmful content through in production.

---

### Finding 8: Tests that test mock behavior, not actual logic
**Severity:** HIGH
**Files and examples:**

**8a.** `apps/api/src/modules/gifts/gifts.service.spec.ts` line 42-47:
```typescript
it('should add coins to balance', async () => {
  prisma.coinBalance.upsert.mockResolvedValue({ coins: 200, diamonds: 0 });
  prisma.coinTransaction.create.mockResolvedValue({});
  const result = await service.purchaseCoins('u1', 200);
  expect(result.coins).toBe(200);
});
```
The mock returns `coins: 200` and the test asserts `coins` is `200`. The test is verifying that the mock returns what it was told to return. If the service returned the mock's value unchanged, this test passes. If the service doubled it, the test would fail only if the mock was set up differently.

**8b.** `apps/api/src/modules/gifts/gifts.service.spec.ts` lines 94-99:
```typescript
it('should return paginated transaction history', async () => {
  prisma.coinTransaction.findMany.mockResolvedValue([{ id: 'tx1', type: 'purchase', amount: 100 }]);
  const result = await service.getHistory('u1');
  expect(result.data).toHaveLength(1);
  expect(result.meta.hasMore).toBe(false);
});
```
Mock returns 1 item, test asserts 1 item in `.data`. The test verifies the service correctly passes mock data through, not that it queries correctly.

**8c.** `apps/api/src/modules/search/search.service.spec.ts` lines 63-93:
```typescript
it('should search people when type=people', async () => {
  prisma.user.findMany.mockResolvedValue(mockUsers);
  const result = await service.search(query, 'people');
  expect(prisma.user.findMany).toHaveBeenCalledWith({
    where: {
      OR: [
        { username: { contains: query, mode: 'insensitive' } },
        { displayName: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: expect.any(Object),
    take: 20,
    orderBy: { followers: { _count: 'desc' } },
  });
  expect(result).toEqual({ people: mockUsers });
});
```
This is a snapshot test of the Prisma query arguments. If the query shape changes slightly (e.g., adding a `bio` field to the OR condition), the test will fail — but if the query returns wrong results from the DB, the test cannot catch it because the DB is mocked.

---

## COVERAGE GAP FINDINGS

### Finding 9: No test for Prisma query failure / database errors
**Severity:** HIGH
**Files affected:** ALL 238 test files

**Problem:** No test in the entire codebase simulates a Prisma/database failure scenario (connection timeout, unique constraint violation P2002 other than the one case in posts.service.abuse.spec.ts, deadlock P2034, or transaction timeout). Every mock resolves successfully.

**What should be tested:**
- `prisma.*.create` throwing `PrismaClientKnownRequestError` with code `P2002` (unique violation)
- `prisma.$transaction` throwing with code `P2034` (write conflict / deadlock)
- `prisma.*.findUnique` throwing connection errors
- Services gracefully handling these failures without data corruption

**Single exception:** `posts.service.abuse.spec.ts` line 97-103 tests `P2002` for double-save, but the mock construction is incorrect:
```typescript
const p2002 = Object.assign(new Error('P2002'), { code: 'P2002' });
Object.setPrototypeOf(p2002, Object.getPrototypeOf(new (require('@prisma/client').Prisma.PrismaClientKnownRequestError)('test', { code: 'P2002', clientVersion: '5.0' })));
```
This constructs the error object manually with `Object.setPrototypeOf` which is fragile.

---

### Finding 10: Missing null/undefined/empty-string input tests for most services
**Severity:** MEDIUM
**Files affected:** Most service test files

**Problem:** While the edge case specs test some boundary values, most services have zero tests for:
- `null` userId
- `undefined` required fields
- Empty string `""` for content/title/name fields
- Very long strings exceeding database column limits
- Unicode edge cases (RTL markers, zero-width joiners, emoji sequences)

**Exceptions:** `posts.service.edge.spec.ts` does test Arabic content, emoji content, zero-width characters, null bytes, and HTML tags. This is good. But this level of coverage exists only for the PostsService. Other services (MessagesService, ThreadsService, ChannelsService, GamificationService, etc.) have no equivalent edge case testing for their input fields.

---

### Finding 11: No test for view-once message re-reading
**Severity:** HIGH (security)
**File:** `apps/api/src/modules/messages/messages.service.spec.ts`

**Problem:** The messages service supports `isViewOnce` messages, but no test verifies that:
- A view-once message can only be read once
- A view-once message cannot be forwarded
- The content is redacted after first view
- Re-fetching the conversation doesn't include view-once content

This was flagged in the previous audit (Agent #6) as a critical security issue.

---

### Finding 12: No test for isSpoiler message behavior
**Severity:** MEDIUM
**File:** `apps/api/src/modules/messages/messages.service.spec.ts`

**Problem:** The `isSpoiler` field on messages is not tested. No test verifies that spoiler messages are properly flagged in API responses.

---

### Finding 13: Two-factor validate/backup endpoints have no auth check tests
**Severity:** CRITICAL (security)
**File:** `apps/api/src/modules/two-factor/two-factor.service.spec.ts` (lines 79-91)

**Evidence:**
```typescript
describe('validate', () => {
  it('should return true if 2FA not enabled (no requirement)', async () => {
    mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(null);
    const result = await service.validate(mockUserId, '123456');
    expect(result).toBe(true);
  });

  it('should return false for wrong code when 2FA enabled', async () => {
    mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue({ secret: 'ABCDEFGHIJK', isEnabled: true });
    const result = await service.validate(mockUserId, '000000');
    expect(result).toBe(false);
  });
});
```

**Problem:** The `validate` method takes a `userId` parameter but no test verifies that user A cannot call `validate` with user B's userId. The previous audit (Agent #3) identified that the 2FA validate and backup-code endpoints are UNAUTHENTICATED, allowing any user to brute-force any userId's 2FA code. The test suite does not catch this because:
1. No controller test verifies the auth guard is applied
2. No service test verifies userId ownership
3. No test checks for rate limiting on 2FA attempts

---

### Finding 14: Missing rate-limit-on-brute-force tests
**Severity:** HIGH (security)
**Files affected:**
- `apps/api/src/modules/two-factor/two-factor.service.spec.ts` — no brute force test
- `apps/api/src/modules/parental-controls/parental-controls.service.spec.ts` — no PIN brute force test
- `apps/api/src/modules/messages/messages.service.spec.ts` — no chat lock brute force test

**Problem:** Services that accept secret codes (2FA TOTP, parental PIN, chat lock code) have no tests for:
- Lockout after N failed attempts
- Rate limiting on verification attempts
- Account lockout notifications

---

### Finding 15: Payments test doesn't verify Stripe is actually called correctly
**Severity:** HIGH
**File:** `apps/api/src/modules/payments/payments.service.spec.ts` (lines 1-197)

**Evidence (lines 8-36):** Stripe is mocked at module level:
```typescript
const mockStripeInstance = {
  customers: { create: jest.fn().mockResolvedValue({ id: 'cus_test' }), ... },
  paymentIntents: { create: jest.fn().mockResolvedValue({ id: 'pi_test', client_secret: 'secret_test' }), ... },
  // ...
};
jest.mock('stripe', () => ({ __esModule: true, default: jest.fn().mockImplementation(() => mockStripeInstance) }));
```

**Problem:** The mock always returns success. No test verifies:
- What happens when Stripe API returns an error (card declined, network failure)
- Whether the correct amount/currency is passed to Stripe
- Whether the Stripe customer ID is correctly reused
- Whether the tip record status is updated ONLY after Stripe confirms payment (the "coins credited before payment" bug from Agent #2)

The test at line 67 checks `expect(result.clientSecret).toBe('secret_test')` — this verifies the mock's return value is passed through, not that the service correctly creates a payment intent with the right amount.

---

### Finding 16: Webhook controller test doesn't verify signature computation
**Severity:** MEDIUM
**File:** `apps/api/src/modules/auth/webhooks.controller.spec.ts` (lines 1-147)

**Evidence (lines 8-12):**
```typescript
jest.mock('svix', () => ({
  Webhook: jest.fn().mockImplementation(() => ({
    verify: jest.fn(),
  })),
}));
```

**Problem:** The svix `verify` method is mocked. The test verifies that the controller calls `verify` and processes the result, but never tests that a real svix signature is validated correctly. The test for "invalid signature" (line 121) just throws from the mock — it doesn't test with an actual bad signature vs a good one.

---

### Finding 17: Moderation service text check uses hardcoded keyword list — only fallback tested
**Severity:** HIGH
**File:** `apps/api/src/modules/moderation/moderation.service.spec.ts` (lines 38-49)

**Evidence:**
```typescript
it('should return safe result for clean text', async () => {
  const result = await service.checkText('u1', { text: 'Assalamu Alaikum brothers and sisters' });
  expect(result.flagged).toBe(false);
});

it('should flag inappropriate text', async () => {
  prisma.report.create.mockResolvedValue({});
  const result = await service.checkText('u1', { text: 'kill yourself you worthless piece of trash' });
  expect(result.flagged).toBe(true);
  expect(result.categories).toEqual(expect.arrayContaining([expect.any(String)]));
});
```

**Problem:** This only tests the keyword-based fallback moderation. Since `globalMockProviders` provides `mockAiService` with `moderateContent` returning `{ safe: true }`, the AI-powered moderation path is never tested. The `checkText` method likely calls `aiService.moderateContent()` first, and falls back to keyword matching when it returns safe. A sophisticated adversary can bypass keyword lists with Unicode tricks, leetspeak, or contextual harm that only AI can detect.

---

### Finding 18: Search service never tests empty query string
**Severity:** MEDIUM
**File:** `apps/api/src/modules/search/search.service.spec.ts`

**Problem:** No test calls `service.search('')` or `service.search(' ')` to verify behavior with empty/whitespace-only queries. In production, this could cause full-table scans with `{ contains: '', mode: 'insensitive' }` matching every record.

---

### Finding 19: Gateway test doesn't test handleConnection with expired token
**Severity:** MEDIUM
**File:** `apps/api/src/gateways/chat.gateway.spec.ts`

**Problem:** Tests cover: no token, bad token, user not found in DB. But missing:
- Expired token (valid signature but past expiration)
- Token for deleted/banned user
- Token refresh during active connection
- Multiple connections from same user (handled correctly per tests, but no test for the presence set growing unbounded)

---

### Finding 20: Encryption service test doesn't verify crypto operations
**Severity:** MEDIUM
**File:** `apps/api/src/modules/encryption/encryption.service.spec.ts`

**Evidence (lines 33-43):**
```typescript
describe('registerKey', () => {
  it('should register public key with fingerprint', async () => {
    const publicKey = 'dGVzdEtleURhdGFGb3JFbmNyeXB0aW9uUHVycG9zZXM='; // base64 >= 32 chars
    prisma.encryptionKey.upsert.mockResolvedValue({ userId: 'u1', publicKey, keyFingerprint: 'abc' });
    const result = await service.registerKey('u1', publicKey);
    expect(result.userId).toBe('u1');
  });
  it('should throw for short key', async () => {
    await expect(service.registerKey('u1', 'short')).rejects.toThrow(BadRequestException);
  });
});
```

**Problem:** The `computeSafetyNumber` test (lines 127-163) is good — it verifies determinism and 60-digit output. But `registerKey` doesn't verify:
- The fingerprint is actually computed from the key (the mock returns hardcoded `'abc'`)
- Key format validation (is it valid base64? Is it a valid public key?)
- Key length requirements beyond "not short"

---

## ANTI-PATTERN FINDINGS

### Finding 21: Duplicate test descriptions across files
**Severity:** LOW
**Files affected:** Multiple edge case and auth spec files

**Examples:**
- `gifts.service.edge.spec.ts` line 46: "should reject self-gift (senderId === receiverId)"
- `gifts.service.spec.ts` line 64: "should throw when sending to self"
Both test the exact same behavior. The edge case spec duplicates tests already in the base spec.

- `posts.service.auth.spec.ts` lines 117-122: "should throw ForbiddenException when non-owner tries to delete"
- `posts.service.spec.ts` lines 188-201: "should throw ForbiddenException if user is not the author"
Same test, different wording.

**Impact:** Maintenance burden. When the behavior changes, multiple tests must be updated. Test count is inflated.

---

### Finding 22: Test files with `as any` type casts hiding type mismatches
**Severity:** LOW (acceptable per project rules, but worth noting scope)
**Files affected:** Nearly every test file

**Pattern:**
```typescript
let prisma: any;
// later:
prisma = module.get(PrismaService) as any;
```

This is acceptable per CLAUDE.md rule 13 ("Test files (*.spec.ts) MAY use `as any` for mocks"). However, it means the type system provides zero protection against mock shape mismatches. If a service method's Prisma calls change (e.g., using a new field), the mocks won't fail to compile — they'll just return the old hardcoded data, making the test silently incorrect.

---

### Finding 23: beforeEach rebuilds entire TestingModule — slow and unnecessary
**Severity:** LOW (performance)
**Files affected:** All 238 test files

**Pattern:** Every `beforeEach` calls `Test.createTestingModule().compile()` which is relatively expensive. For tests that only need to reset mock call counts, `jest.clearAllMocks()` in `beforeEach` with a single `beforeAll` for module creation would be 5-10x faster.

**Impact:** With 238 files and ~2,748 tests, each creating a new TestingModule, the test suite is slower than it needs to be.

---

### Finding 24: Tests without assertions (fire-and-forget pattern)
**Severity:** MEDIUM
**Files and examples:**

**24a.** `apps/api/src/modules/moderation/moderation.service.spec.ts` lines 74-78:
```typescript
it('should approve (dismiss) a report', async () => {
  prisma.report.findUnique.mockResolvedValue({ id: 'r1', status: 'PENDING', reason: 'SPAM' });
  await service.review('admin-1', 'r1', 'approve');
  expect(prisma.$transaction).toHaveBeenCalled();
});
```
Only verifies `$transaction` was called. Doesn't verify the report was marked as resolved, the content was kept, or the moderation log was created.

**24b.** `apps/api/src/modules/moderation/moderation.service.spec.ts` lines 91-98:
```typescript
it('should return moderation statistics', async () => {
  const result = await service.getStats('admin-1');
  expect(result).toHaveProperty('flaggedToday');
  expect(result).toHaveProperty('reviewedToday');
  expect(result).toHaveProperty('totalPending');
});
```
Verifies property names exist but not their values. All three could be `NaN` or negative and the test passes.

**24c.** `apps/api/src/modules/gamification/gamification.service.spec.ts` lines 307-315:
```typescript
it('should create series', async () => {
  prisma.series.create.mockResolvedValue({ id: 's-1', title: 'Learn Arabic', userId: 'user-1' });
  const result = await service.createSeries('user-1', {
    title: 'Learn Arabic', description: 'A beginner series',
  });
  expect(result.title).toBe('Learn Arabic');
});
```
Tests that the mock's return value contains `title: 'Learn Arabic'` — it was set up to return exactly that. Doesn't verify the `create` call arguments.

---

### Finding 25: Missing test for `deleteAccount` / privacy export completeness
**Severity:** HIGH (legal/GDPR)
**Files affected:** `apps/api/src/modules/users/users.service.spec.ts`

**Problem:** The users service has a `deleteAccount` method and a privacy `exportData` method, but:
- No test verifies that `deleteAccount` removes/anonymizes all user data
- No test verifies that `exportData` includes all user content (posts, messages, comments, etc.)
- No test verifies the 50-record cap on privacy export (GDPR violation identified by Agent #56)

---

### Finding 26: Islamic service tests mock fetch globally, hiding real API integration issues
**Severity:** MEDIUM
**File:** `apps/api/src/modules/islamic/islamic.service.spec.ts` (lines 54-55)

**Evidence:**
```typescript
const mockFetch = jest.fn().mockRejectedValue(new Error('Network disabled in tests'));
global.fetch = mockFetch as any;
```

**Problem:** All external API calls (Aladhan prayer times, Quran.com, OSM Overpass for mosques) are blocked. The tests only verify fallback/error behavior when APIs are unavailable. No test verifies:
- Correct API URL construction
- Response parsing for real Aladhan/Quran.com/OSM responses
- Edge cases in prayer time calculation near date boundaries
- Correct Quran verse range validation against real API

---

### Finding 27: Commerce service doesn't test actual price calculations
**Severity:** HIGH
**File:** `apps/api/src/modules/commerce/commerce.service.spec.ts`

**Evidence (lines 79-98):**
```typescript
describe('donateZakat', () => {
  it('should donate to an active fund', async () => {
    prisma.zakatFund.findUnique.mockResolvedValue({
      id: 'fund-1', status: 'active', goalAmount: 1000, raisedAmount: 400,
    });
    prisma.zakatDonation.create.mockResolvedValue({ id: 'don-1', amount: 100 });
    prisma.zakatFund.update.mockResolvedValue({ raisedAmount: 500 });
    (prisma.$transaction as unknown as jest.Mock).mockResolvedValue([
      { id: 'don-1', amount: 100 },
      { raisedAmount: 500 },
    ]);
    const result = await service.donateZakat('user-1', 'fund-1', { amount: 100 });
    expect(result).toBeDefined();
  });
});
```

**Problem:** The transaction is mocked to return `raisedAmount: 500` directly. No test verifies:
- That raisedAmount is incremented by the donation amount (400 + 100 = 500)
- That donations exceeding the goal are handled (raisedAmount > goalAmount)
- That donation amounts use Decimal precision (Batch 4 fix was supposed to add this)
- That zero or negative donation amounts are rejected

---

### Finding 28: No test for blocked user accessing content
**Severity:** HIGH (security)
**Files affected:** All service test files

**Problem:** While `posts.service.spec.ts` tests that blocked users are excluded from feeds (line 274-297), no test verifies:
- A blocked user cannot view a specific post by ID (`getById`)
- A blocked user cannot comment on posts
- A blocked user cannot send messages in existing conversations
- A blocked user cannot view stories
- A blocked user's content is hidden from the blocker

The previous audit (Agent #4) identified that "blocked users can still message in existing conversations" — and no test catches this.

---

### Finding 29: Posts concurrency test has incorrect assertion
**Severity:** MEDIUM
**File:** `apps/api/src/modules/posts/posts.service.concurrency.spec.ts` (lines 67-82)

**Evidence:**
```typescript
it('should handle concurrent like and unlike by same user gracefully', async () => {
  // ...
  const [r1, r2] = await Promise.allSettled([
    service.react('post-1', 'user-1'),
    service.unreact('post-1', 'user-1'),
  ]);

  // Both should complete (not hang)
  expect(r1.status).toBeDefined();
  expect(r2.status).toBeDefined();
});
```

**Problem:** `expect(r1.status).toBeDefined()` will ALWAYS be true because `Promise.allSettled` always sets `.status` to either `'fulfilled'` or `'rejected'`. This assertion tests a JavaScript language feature, not application behavior.

---

### Finding 30: Missing test for notification preference enforcement
**Severity:** MEDIUM
**File:** `apps/api/src/modules/notifications/notifications.service.spec.ts`

**Problem:** The previous audit (Agent #14) identified that "per-type notification settings are ignored (dead)." The notification service test has no tests verifying:
- User preference to disable LIKE notifications actually prevents LIKE notification creation
- User preference to disable COMMENT notifications works
- User preference to disable FOLLOW notifications works
- Muted conversation notifications are suppressed

---

### Finding 31: No test for admin getReports verifying admin role
**Severity:** HIGH (security)
**File:** `apps/api/src/modules/admin/admin.controller.spec.ts` (lines 42, 53-71)

**Evidence:**
```typescript
{ provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
// ...
it('should call adminService.getReports with correct params', async () => {
  adminService.getReports.mockResolvedValue(mockResult as any);
  const result = await controller.getReports(adminId, 'PENDING', 'cursor-1');
  expect(adminService.getReports).toHaveBeenCalledWith(adminId, 'PENDING', 'cursor-1');
});
```

**Problem:** The guard is mocked to always allow. The test says `adminId = 'admin-1'` but nothing verifies this user is actually an admin. A test like `controller.getReports('regular-user', ...)` should fail, but it would pass because the guard is mocked.

The `it('should propagate ForbiddenException from service')` test at line 67 tests that the exception propagates, but this relies on the service doing its own role check, not the controller/guard.

---

### Finding 32: Feature flag endpoints have no admin authorization test
**Severity:** HIGH (security)
**File:** `apps/api/src/modules/admin/admin.controller.spec.ts` (lines 148-178)

**Evidence:**
```typescript
describe('setFlag', () => {
  it('should delegate to featureFlags.setFlag with name and value', async () => {
    featureFlags.setFlag.mockResolvedValue(undefined as any);
    await controller.setFlag('dark_mode', 'true');
    expect(featureFlags.setFlag).toHaveBeenCalledWith('dark_mode', 'true');
  });
});
```

**Problem:** No test verifies that only admins can set/delete feature flags. The previous audit (Agent #13, Agent #29) identified this as a security issue — feature flag endpoints lack admin checks.

---

### Finding 33: Messages service auth tests miss slow mode enforcement
**Severity:** MEDIUM
**File:** `apps/api/src/modules/messages/messages.service.auth.spec.ts`

**Problem:** The auth matrix tests check membership, sender ownership, creator permissions, and block checks. But no test verifies:
- Slow mode enforcement (Telegram feature — messages throttled per user)
- Message editing time window (can only edit within X minutes)
- Group admin permissions for removing members
- Read-only member restrictions

---

### Finding 34: No test for Prisma relation cascade behaviors
**Severity:** HIGH
**Files affected:** All test files

**Problem:** The Prisma schema has 187 models with hundreds of relations and `onDelete` rules. No test verifies that deleting a parent record correctly cascades to children. Since all Prisma calls are mocked, cascade behavior is never exercised.

The previous audit (Agent #15) identified "12 cascade delete dangers" — none of these are tested.

---

### Finding 35: Edge case specs duplicate base spec setup (~80% boilerplate)
**Severity:** LOW (maintainability)
**Files affected:** All `*.service.edge.spec.ts`, `*.service.auth.spec.ts`, `*.service.abuse.spec.ts`, `*.service.concurrency.spec.ts`

**Evidence:** Comparing `posts.service.spec.ts` `beforeEach` (lines 15-108, ~93 lines) with `posts.service.edge.spec.ts` `beforeEach` (lines 44-117, ~73 lines) — they set up nearly identical mock structures. This pattern repeats across every module with multiple spec files.

**Problem:** When a service adds a new dependency, all 4-6 spec files must be updated. Currently there is no shared fixture factory.

---

### Finding 36: No test for SQL injection in embeddings service
**Severity:** CRITICAL (security)
**File:** `apps/api/src/modules/embeddings/embeddings.service.spec.ts`

**Problem:** The previous audit (Agents #7, #10, #29) identified 2 SQL injection vectors in the embeddings service via `$executeRaw` or `$queryRaw`. No test verifies that user input is sanitized before being interpolated into raw SQL queries. The test file likely only tests the happy path with clean inputs.

---

### Finding 37: Gamification service tests don't verify XP farming prevention
**Severity:** HIGH
**File:** `apps/api/src/modules/gamification/gamification.service.spec.ts`

**Evidence (lines 114-133):**
```typescript
describe('awardXP', () => {
  it('should increase XP and update level', async () => {
    prisma.userXP.upsert.mockResolvedValue({ userId: 'user-1', totalXP: 100, level: 1 });
    prisma.userXP.update.mockResolvedValue({ totalXP: 100, level: 2 });
    prisma.xPHistory.create.mockResolvedValue({});
    await service.awardXP('user-1', 'post_created');
    expect(prisma.userXP.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { totalXP: { increment: 10 } },
      }),
    );
  });
});
```

**Problem:** No test verifies:
- Daily XP caps (can a user call `awardXP('post_created')` 1000 times?)
- Duplicate event prevention (creating the same post shouldn't award XP twice)
- XP source validation (can a user award themselves XP for events that didn't happen?)

The previous audit (Agent #8) identified "XP farming unlimited" as a critical issue.

---

### Finding 38: No test for webhook HMAC-SHA256 signature verification
**Severity:** HIGH (security)
**File:** `apps/api/src/modules/webhooks/webhooks.service.spec.ts`

**Problem:** The webhook system uses HMAC-SHA256 signed delivery, but no test verifies:
- That outgoing webhooks include the correct HMAC signature
- That the signature is computed from the correct payload
- That webhook delivery retries on failure
- That webhook endpoints validate received signatures

---

### Finding 39: Stories service doesn't test 24-hour expiry
**Severity:** MEDIUM
**File:** `apps/api/src/modules/stories/stories.service.spec.ts`

**Problem:** Stories expire after 24 hours, but no test verifies:
- Expired stories are not returned in feeds
- Expired stories cannot be viewed
- Story creation sets correct `expiresAt` timestamp
- Archive behavior after expiry

---

### Finding 40: Live service tests don't verify guest limit enforcement
**Severity:** MEDIUM
**File:** `apps/api/src/modules/live/live.service.spec.ts`

**Problem:** Multi-guest live streaming supports up to 4 guests (per Batch 85), but no test verifies:
- 5th guest is rejected
- Guest removal frees a slot
- Host cannot exceed guest limit

---

## SCORING

### Overall Test Quality Score: 4/10

**Breakdown:**
| Dimension | Score | Notes |
|-----------|-------|-------|
| Coverage breadth | 7/10 | 238 files cover most modules |
| Coverage depth | 3/10 | Mostly happy-path only |
| Assertion quality | 3/10 | Heavy use of `toBeDefined()`, mock-value checks |
| Error path coverage | 4/10 | Some error tests, but no DB failure tests |
| Security testing | 2/10 | Auth matrix exists but guards are always mocked |
| Edge case coverage | 4/10 | Edge specs exist for ~15 modules, missing for rest |
| Integration testing | 1/10 | "Integration" tests are unit tests with mocks |
| Concurrency testing | 1/10 | Concurrency specs don't test real concurrency |
| Mock fidelity | 3/10 | Mocks don't match real behavior |
| Maintainability | 5/10 | Consistent patterns, but massive boilerplate duplication |

### Summary of Critical Findings

1. **63 controller test files (~630 tests) provide zero value** — they test that method A calls method B with the same args
2. **6 "integration" test files use full mocking** — identical to unit tests
3. **10 "concurrency" test files test `Promise.allSettled`** — not real concurrency
4. **AI/moderation tests only cover fallback paths** — real moderation never tested
5. **No database error handling tests** — all mocks always succeed
6. **No security-critical auth tests work** — guards always mocked to `true`
7. **SQL injection not tested** — despite being a known P0 vulnerability
8. **Payment flow doesn't verify Stripe integration** — mock always succeeds
9. **2FA brute-force protection not tested** — despite being a known vulnerability
10. **Blocked user content access not tested** — despite known bypass bugs

### Estimated Real Test Effectiveness
Of ~2,748 tests:
- ~630 controller delegation tests: effectively useless
- ~100 concurrency tests: test JavaScript, not the app
- ~60 integration tests: duplicate service tests
- ~200 weak-assertion tests: pass regardless of correctness
- Remaining ~1,758: provide genuine unit test value for service logic happy paths

**Effective unique coverage: ~1,200-1,400 meaningful test assertions** out of 2,748 reported.
