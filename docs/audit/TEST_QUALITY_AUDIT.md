# Test Suite Quality Audit

> Audited: March 21, 2026  
> Scope: 36 of 108 spec files (~1/3 of project)  
> Current totals: 108 spec files, 1,495 it() blocks, 24,482 lines of test code

---

## Summary

| Quality Tier | % of Files | Description |
|-------------|-----------|-------------|
| **Tier 1 — Solid** | ~40% | Meaningful assertions, realistic mocks, happy + error paths |
| **Tier 2 — Weak** | ~35% | Tests exist but have shallow assertions, conditional execution, or test mocks instead of services |
| **Tier 3 — Anti-patterns** | ~25% | `toBeDefined()` only, `if typeof` guards, string length checks |

---

## Anti-Patterns Found (Across All 108 Spec Files)

| Anti-Pattern | Count | Impact |
|-------------|-------|--------|
| `if (typeof (service as any).method === 'function')` — conditional tests that silently pass when method doesn't exist | **4 files** | Hides regressions |
| `expect(service).toBeDefined()` as sole assertion | **10 instances** | Tests DI container, not service logic |
| `expect(prisma.something).toBeDefined()` | **5 instances** | Tests the mock framework, not Mizanly code |
| `expect(string.length).toBeGreaterThan(0)` | **8 instances** | Tests that a constant isn't empty (no-op) |

---

## Per-Service Breakdown (36 Files Reviewed)

| Service | Tests | Lines | Error Checks | Shallow | Quality |
|---------|-------|-------|-------------|---------|---------|
| posts | 41 | 842 | 45 | 1 | ★★★★ |
| messages | 51 | 868 | 47 | 1 | ★★★★ |
| events | 27 | 487 | 23 | 2 | ★★★★ |
| videos | 39 | 792 | 33 | 0 | ★★★★ |
| users | 23 | 884 | 10 | 0 | ★★★★ |
| channels | 23 | 448 | 27 | 0 | ★★★★ |
| payments | 13 | 166 | 16 | 0 | ★★★☆ |
| reels | 19 | 642 | 15 | 2 | ★★★☆ |
| follows | 14 | 401 | 11 | 1 | ★★★☆ |
| circles | 16 | 268 | 15 | 0 | ★★★☆ |
| polls | 12 | 303 | 19 | 0 | ★★★☆ |
| bookmarks | 18 | 310 | 11 | 0 | ★★★☆ |
| two-factor | 15 | 134 | 17 | 1 | ★★★☆ |
| communities | 16 | 141 | 17 | 1 | ★★★☆ |
| threads | 10 | 473 | 7 | 1 | ★★☆☆ |
| notifications | 17 | 383 | 11 | 0 | ★★★☆ |
| chat gateway | 14 | 286 | 10 | 2 | ★★★☆ |
| hashtags | 11 | 214 | 6 | 0 | ★★★☆ |
| search | 19 | 806 | 0 | 0 | ★★☆☆ |
| embeddings | 17 | 202 | 0 | 0 | ★★☆☆ |
| gamification | 14 | 197 | 5 | 1 | ★★☆☆ |
| encryption | 12 | 125 | 9 | 1 | ★★☆☆ |
| auth | 9 | 255 | 3 | 0 | ★★☆☆ |
| upload | 10 | 189 | 6 | 1 | ★★☆☆ |
| stories | 10 | 325 | 5 | 0 | ★★☆☆ |
| settings | 11 | 212 | 5 | 0 | ★★☆☆ |
| live | 12 | 134 | 7 | 1 | ★★☆☆ |
| blocks | 10 | 222 | 4 | 0 | ★★☆☆ |
| creator | — | — | — | — | not reviewed |
| recommendations | 12 | 432 | 0 | 0 | ★☆☆☆ |
| personalized-feed | 11 | 134 | 3 | 4 | ★☆☆☆ |
| content-safety | 13 | 128 | 0 | 2 | ★☆☆☆ |
| islamic | 31 | 470 | 5 | 8 | ★☆☆☆ |
| privacy | 5 | 80 | 7 | 7 | ★☆☆☆ |
| broadcast | 7 | 105 | 5 | 0 | ★☆☆☆ |
| stickers | 12 | 113 | 5 | 3 | ★☆☆☆ |
| drafts | 6 | 80 | 5 | 0 | ★☆☆☆ |

---

## Worst Offenders (Need Rewrite)

### 1. `personalized-feed.service.spec.ts` — ★☆☆☆

The most important algorithm in the app has the weakest tests:
- 5 of 11 tests just call `trackSessionSignal` and assert "no throw = success" with no return value verification
- "Islamic content boosting" tests create a LOCAL Set and test THAT instead of calling `getIslamicBoost()`
- "Blocked content filtering" tests just assert `prisma.block.findMany.toBeDefined()` — tests Jest, not Mizanly

**Needs**: Direct unit tests for `getIslamicBoost()`, `getSessionBoost()`, `calculateEngagementScore()` with known inputs → expected outputs.

### 2. `content-safety.service.spec.ts` — ★☆☆☆

- 5 tests wrapped in `if (typeof (service as any).containsBlockedKeyword === 'function')` — silently skip if method is renamed
- "Islamic context awareness" tests just check `expect(content.length).toBeGreaterThan(0)`
- "Report handling" test asserts `prisma.moderationAction.create.toBeDefined()`

**Needs**: Test actual `moderateText()` and `moderateImage()` with mocked API responses. Test `checkForwardLimit()` with Redis counts at boundary (4, 5, 6). Test `autoRemoveContent()` verifies DB update + log creation.

### 3. `recommendations.service.spec.ts` — ★☆☆☆

- Zero error-path assertions
- No tests for null interest vectors, empty candidate pools, or malformed vectors
- No tests for diversity reranking logic

**Needs**: Test `multiStageRank()` with empty embeddings, test author dedup, test blocked user exclusion.

---

## What to Verify in the 1,500 New Tests (Batch 1)

When the test expansion commits land, check:

1. `personalized-feed`, `content-safety`, and `recommendations` specs should be rewritten
2. Zero new instances of `if (typeof (service as any)`
3. `getIslamicBoost`, `getSessionBoost`, `calculateEngagementScore` each have direct unit tests
4. Embeddings service has injection-safe query tests
5. All `findMany` calls test both empty results and populated results
6. Every `ForbiddenException` path is tested (ownership checks)
