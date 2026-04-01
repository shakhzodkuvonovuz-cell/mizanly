# R2 TAB4 Part 2 Progress -- Hardening + Tests + Missed Fixes

**Started:** 2026-04-01
**Status:** COMPLETE -- 5 code fixes, 31 new tests, 3 constants replaced

## Commits
1. `3cda5c37` -- Section 1: 4 hardening fixes (invite select, editMessage moderation, story moderation, dispute idempotency)
2. `5f1d17a3` -- Section 2: 29 new tests across 5 test files
3. `adef44d0` -- Section 3: Replace 3 magic numbers with financial constants

## Test Results
**34 suites, 711 tests, ALL passing** (runInBand to avoid Jest cache race)

---

## Section 1: Code Fixes

### 1.1 -- generateGroupInviteLink missing select (J08-#2 incomplete)
**Before:** `prisma.conversation.findUnique({ where: { id } })` -- fetches all Conversation columns
**After:** `prisma.conversation.findUnique({ where: { id }, select: { id: true, isGroup: true, createdById: true } })`
**Test:** generateGroupInviteLink select optimization test verifies select clause

### 1.2 -- editMessage content moderation (X08-#7)
**Before:** `editMessage()` accepted any text with no content moderation -- bait-and-switch attack vector
**After:** 3-step fix:
1. `messages.module.ts` imports `ModerationModule`
2. `MessagesService` constructor injects `ContentSafetyService`
3. `editMessage()` calls `contentSafety.moderateText(content)` and throws BadRequestException if `!safe`
**Test:** 3 tests -- safe edit proceeds, flagged edit rejected, encrypted edit rejected before moderation
**Also fixed:** `follow.findUnique` select used `{ id: true }` but Follow model has no `id` field (composite @@id) -- changed to `{ followerId: true }`

### 1.3 -- Story text content moderation (X08-#14)
**Before:** Stories with `textOverlay` or `stickerData` created without any text moderation
**After:** 3-step fix:
1. `stories.module.ts` imports `ModerationModule`
2. `StoriesService` constructor injects `ContentSafetyService`
3. `create()` moderates `textOverlay` and `stickerData` text before `prisma.story.create`
**Test:** 4 tests -- textOverlay moderated, flagged rejected, stickerData moderated, no-text skips moderation

### 1.4 -- handleDisputeCreated idempotency (X03-#7 hardening)
**Before:** No guard against processing same dispute twice -- diamonds could be reversed twice
**After:** Inside `$transaction`, `tip.findUnique` checks `status === 'disputed'` before updating/reversing
**Test:** Idempotency test verifies `tip.update` NOT called when status is already `disputed`

---

## Section 2: Test Coverage (31 new tests)

### Payments (9 new tests in payments.service.spec.ts)
| Test | What it verifies |
|------|-----------------|
| should find tip via Redis and reverse diamonds | Full dispute flow: lookup + $transaction + diamond reversal |
| should fallback to PaymentMapping when Redis misses | DB fallback path for dispute handler |
| should fallback to Tip.stripePaymentId when both miss | Third fallback path |
| should skip reversal when no tip found | All 3 lookups return null, no $transaction |
| should skip reversal when tip already disputed | Idempotency guard -- no update when already disputed |
| should not go below 0 diamonds | Conditional decrement with gte clause |
| should return early when paymentIntentId is empty | Empty PI string returns immediately |
| should extend premium from current endDate | Future endDate extended, not reset to now |
| should extend expired premium from now | Past endDate uses now as base |

### Messages (7 new tests in messages.service.spec.ts)
| Test | What it verifies |
|------|-----------------|
| should reject scheduling plaintext in E2E conversation | E2E enforcement on schedule path |
| should allow scheduling in non-E2E conversation | Normal scheduling works |
| should allow scheduling with isE2E = null (legacy) | Null treated as non-E2E |
| should run content moderation on message edit | moderateText called with content |
| should reject edit when content is flagged | BadRequestException, update NOT called |
| should NOT moderate encrypted edits | E2E rejection before moderation |
| should use select on generateGroupInviteLink | Select clause verified |

### Stories (4 new tests in stories.service.spec.ts)
| Test | What it verifies |
|------|-----------------|
| should moderate textOverlay on creation | moderateText called with textOverlay |
| should reject when textOverlay flagged | BadRequestException, create NOT called |
| should moderate stickerData content | JSON.stringify'd stickerData moderated |
| should skip moderation with no text | No moderateText call when no text content |

### Counter Reconciliation (11 new tests -- brand new spec file)
| Test | What it verifies |
|------|-----------------|
| reconcilePostCounts: execute both queries | 2 $queryRaw calls for likes + comments |
| reconcilePostCounts: $executeRaw on drift | Drifted rows trigger UPDATE |
| reconcileReelCounts: execute both queries | Smoke test for reel SQL |
| reconcileHashtagCounts: execute query | Smoke test for hashtag SQL |
| reconcileHashtagCounts: update on drift | Drifted hashtag triggers UPDATE |
| reconcileVideoCounts: execute both queries | Smoke test for video SQL |
| reconcileUserFollowCounts: return 0 | Empty result returns 0 |
| reconcileUserFollowCounts: fix both | Both followers + following fixed |
| reconcileCoinBalances: detect negative | Negative balance detected + reset to 0 |
| reconcileCoinBalances: return 0 | No negative = 0 |
| reconcileAll: invoke all methods | All reconciliation methods called |

---

## Section 3: Constants Cleanup

### 3.1 -- Diamond conversion magic number (X03-#32)
**Before:** `Math.floor(netAmount / 0.007)` -- 2 instances in payments.service.ts
**After:** `Math.floor(netAmount / DIAMOND_TO_USD)` -- imported from `common/constants/financial.ts`

### 3.2 -- Platform fee magic number (X03-#33)
**Before:** `amount * 0.10` -- 1 instance in payments.service.ts
**After:** `amount * PLATFORM_FEE_RATE` -- imported from `common/constants/financial.ts`

### 3.3 -- typeToSetting map completeness (X05-#11 verification)
**Verified:** All 24 NotificationType enum values checked against typeToSetting map:
- 21 mapped to user settings (LIKE, COMMENT, FOLLOW, etc.)
- 3 intentionally unmapped (CIRCLE_INVITE, CIRCLE_JOIN, SYSTEM) -- always send, not user-controllable
- 0 missing mappings

---

## Also Fixed
- `messages.topics.spec.ts` -- added `mockContentSafetyService` to providers after ContentSafetyService injection
