# A22: Gifts Module Audit

**Files audited:**
- `apps/api/src/modules/gifts/gifts.controller.ts` (112 lines)
- `apps/api/src/modules/gifts/gifts.service.ts` (370 lines)

**Auditor model:** Claude Opus 4.6 (1M context)
**Date:** 2026-04-05

---

## Findings

### [CRITICAL] F1 — Blocked user bypass: gifts can be sent to/from blocked users

**File:** `gifts.service.ts`, lines 105-201 (entire `sendGift` method)
**Lines missing:** Between line 128 (receiver active check) and line 130 (diamond calc)

The `sendGift` method validates that the receiver exists, is not banned, and is not deactivated (lines 119-128), but **never queries the `Block` table**. A grep of the entire gifts module confirms zero references to `Block`, `isBlocked`, or any block-checking logic.

**Impact:** User A blocks User B. User B can still send gifts to User A. This is a harassment vector -- unwanted gifts from blocked users appear in notifications (line 187-193) and in `getReceivedGifts` aggregations. The notification event at line 187 fires with `actorId: senderId`, meaning the blocked user's gift triggers a push notification to the person who blocked them.

**Fix:** Before line 130, query `prisma.block.findFirst({ where: { OR: [{ blockerId: senderId, blockedId: receiverId }, { blockerId: receiverId, blockedId: senderId }] } })` and throw `BadRequestException` if a block exists in either direction.

---

### [HIGH] F2 — CHECK constraints for non-negative balances are NOT in any migration

**File:** `prisma/check-constraints.sql` (loose file, lines 7-9)
**Absent from:** All files under `prisma/migrations/`

The application-level guard at `gifts.service.ts` lines 143-145 checks `senderBalance.coins < 0` after the decrement. However, the PostgreSQL `CHECK (coins >= 0)` and `CHECK (diamonds >= 0)` constraints defined in `prisma/check-constraints.sql` are **not included in any Prisma migration**. The file header says "Run once after `prisma db push`" -- meaning these constraints depend on a manual step that may or may not have been executed against production.

Without the DB-level CHECK, the application-level guard is the only defense. The conditional `updateMany` at line 133-136 (`where: { coins: { gte: catalogItem.coins } }`) is the primary protection, and the post-decrement check at line 143-145 is a secondary safety net. But if the CHECK was never applied, a bug in future code that bypasses `updateMany` (e.g., a direct `update` call) would allow negative balances with no DB-level backstop.

**Impact:** If the CHECK constraint was never applied to production, the database permits negative balances. The app-level guards work today, but there is no defense-in-depth.

**Fix:** Add the CHECK constraints to a proper Prisma migration (raw SQL in a migration file), or verify they are applied and add a startup health check that asserts the constraints exist.

---

### [HIGH] F3 — No idempotency key on gift sends: network retries can double-send

**File:** `gifts.service.ts`, lines 105-201; `gifts.controller.ts`, lines 61-73

The `sendGift` endpoint accepts no idempotency key. If a mobile client sends a gift, gets a network timeout before receiving the 201 response, and retries the same request, two gift records are created and the sender is charged twice. The `$transaction` at line 132 guarantees each individual send is atomic, but there is no deduplication across retries.

The `SendGiftDto` (controller line 22-27) has no `idempotencyKey` field. The `GiftRecord` model has no unique constraint on `(senderId, receiverId, giftType, <timestamp window>)`.

**Impact:** Double-charging on network retries. Especially problematic on mobile with flaky connections. The sender loses coins they didn't intend to spend.

**Fix:** Add an optional `idempotencyKey` field to `SendGiftDto`. Store it on the `GiftRecord`. Add a unique constraint on `(senderId, idempotencyKey)`. Before creating the gift, check if a record with that key already exists and return the existing result.

---

### [MEDIUM] F4 — `purchaseCoins` creates a PURCHASE transaction record but never credits coins

**File:** `gifts.service.ts`, lines 72-103

The method creates a `CoinTransaction` record with type `PURCHASE` (line 82-89) and then returns `pendingPurchase: amount` (line 100). The comment at line 80-81 says coins should be credited via Stripe webhook. However:

1. The transaction record at line 82 is created with `amount: amount` (positive value), making it look like a completed credit in the transaction history, even though no coins were actually added.
2. There is no `status` field on `CoinTransaction` (schema lines 3439-3451) to distinguish pending from completed transactions.
3. The `getHistory` method at line 234-247 queries transactions with `type: { in: ['PURCHASE', 'CASHOUT'] }` and returns them without any status filtering -- so pending purchases appear identical to completed ones.

**Impact:** The transaction history shows purchases that were never paid for as if they completed. Users see inflated purchase history. If the Stripe webhook eventually credits coins, there's no way to correlate it back to this specific transaction record (no Stripe session ID stored).

**Fix:** Either (a) don't create a transaction record until Stripe confirms payment, or (b) add a `status` field to `CoinTransaction` (pending/completed/failed) and filter in `getHistory`. Also store the Stripe checkout session ID for reconciliation.

---

### [MEDIUM] F5 — `getHistory` pagination is broken: only `transactions` are cursor-paginated, `giftsSent`/`giftsReceived` are not

**File:** `gifts.service.ts`, lines 208-288

The method fires three parallel queries (lines 213-248):
- `giftsSent`: `take: limit`, no cursor, always returns the latest N
- `giftsReceived`: `take: limit`, no cursor, always returns the latest N  
- `transactions`: `take: limit + 1`, with cursor support (lines 240-246)

The returned `meta.cursor` (line 284) is derived from `transactions` only. When the client passes this cursor back, `giftsSent` and `giftsReceived` return the same first page again. There is no way to paginate through sent/received gifts.

**Impact:** Users with many gifts always see the same first page of sent/received items. The history endpoint pretends to support pagination but only paginates one of three data sources.

**Fix:** Either (a) return separate cursors for each section, (b) merge all items into a single chronological list with unified cursor, or (c) split into separate endpoints (`/history/sent`, `/history/received`, `/history/transactions`).

---

### [MEDIUM] F6 — `contentType` cast to `FeedContentType` without validation

**File:** `gifts.service.ts`, line 155

```typescript
contentType: (contentType || null) as FeedContentType | null,
```

The `SendGiftDto` (controller line 26) declares `contentType` as `@IsString() @MaxLength(30)` -- any string up to 30 characters is accepted. The service then casts it to `FeedContentType` with `as`. The Prisma enum `FeedContentType` only allows `post`, `reel`, `thread`, `video` (schema lines 787-792).

If the client sends `contentType: "exploit"`, the `as` cast silently passes TypeScript compilation, but Prisma will throw a runtime error when trying to insert an invalid enum value. The error is unhandled and bubbles as a 500 Internal Server Error rather than a 400 Bad Request.

**Impact:** Invalid `contentType` values cause 500 errors instead of proper validation errors. Information leakage via Prisma error messages in non-production environments.

**Fix:** Add `@IsEnum(FeedContentType)` validation to the `contentType` field in `SendGiftDto`, or validate the value in the service before the transaction. Remove the `as` cast.

---

### [MEDIUM] F7 — `limit` query parameter parsed via raw `parseInt` with no NaN guard

**File:** `gifts.controller.ts`, line 90

```typescript
getHistory(userId, cursor, limit ? parseInt(limit, 10) : 20);
```

If `limit` is a non-numeric string (e.g., `?limit=abc`), `parseInt('abc', 10)` returns `NaN`. This `NaN` is passed to `getHistory`, where line 209 does:

```typescript
limit = Math.min(Math.max(limit, 1), 50);
```

`Math.max(NaN, 1)` returns `NaN`. `Math.min(NaN, 50)` returns `NaN`. The `take: NaN` passed to Prisma will cause a runtime error.

**Impact:** Any request with a non-numeric `limit` parameter crashes with a 500 error instead of a 400 validation error.

**Fix:** Use `@IsInt() @IsOptional() @Min(1) @Max(50)` with `@Type(() => Number)` from `class-transformer` on a proper DTO, or add `|| 20` fallback: `parseInt(limit, 10) || 20`.

---

### [MEDIUM] F8 — `getReceivedGifts` exposes gift activity from deleted senders

**File:** `gifts.service.ts`, lines 346-369

The `GiftRecord` schema has `senderId String?` (nullable, `onDelete: SetNull` at schema line 3456). When a sender deletes their account, `senderId` becomes null. The `getReceivedGifts` method uses `groupBy` on `giftType` (line 347-352), which correctly aggregates regardless of sender. However, the `giftsSent`/`giftsReceived` in `getHistory` (lines 213-233) include sender/receiver user details via `include`. Deleted users will have null relations, and the mapping at lines 268-280 handles this with optional chaining.

The real issue: `getReceivedGifts` has no privacy consideration -- it exposes the total count and value of gifts received, which could be used to estimate a creator's diamond earnings (count * DIAMOND_RATE * coinCost). This is financial information.

**Impact:** Anyone can call `GET /gifts/received` to see their own aggregated gift data (not others'), but the endpoint has no access control beyond auth. If the endpoint were ever expanded to accept a `userId` parameter for viewing others' profiles, it would leak financial data.

**Current severity:** Medium (own-data only). Would be Critical if a `userId` parameter were added.

---

### [LOW] F9 — Notification body reveals gift type and diamond amount

**File:** `gifts.service.ts`, lines 187-193

```typescript
body: `Someone sent you a ${catalogItem.name}! (+${diamondsEarned} diamonds)`,
```

Push notifications are sent in cleartext via the notification system. The body includes the exact gift name and diamond amount earned. For a privacy-focused app (sealed sender E2E encryption on messages), leaking financial transaction details in push notifications is inconsistent with the threat model.

**Impact:** Push notification content is visible on lock screens, in notification centers, and potentially logged by push providers (APNs/FCM). The exact diamond earnings are exposed.

**Fix:** Use a generic notification body: "You received a gift!" and show details only in-app.

---

### [LOW] F10 — `purchaseCoins` upserts CoinBalance but the upsert is unnecessary for reads

**File:** `gifts.service.ts`, lines 91-95

The `purchaseCoins` method calls `coinBalance.upsert` with an empty `update: {}` just to read the current balance. This is a write operation (`upsert` = INSERT ON CONFLICT DO NOTHING) being used where a simple `findUnique` or `findFirst` with a fallback would suffice. In a high-concurrency scenario, unnecessary upserts create lock contention on the `coin_balances` table.

**Impact:** Minor performance issue. Unnecessary write lock acquired for a read operation.

**Fix:** Use `findUnique` with a null check and explicit create only if needed, or accept that `getBalance` (which also upserts) will have already created the record.

---

### [LOW] F11 — `SendGiftDto` `contentId` and `contentType` are independently optional

**File:** `gifts.controller.ts`, lines 25-26

Both `contentId` and `contentType` are `@IsOptional()`. A client can send `contentId: "post-123"` without `contentType`, or `contentType: "post"` without `contentId`. The service at line 155 stores whatever is provided without validating that both or neither are present.

**Impact:** Orphaned data -- a gift record with a `contentId` but no `contentType` (or vice versa) cannot be properly resolved to display "gift on [post/reel/etc]". The UI would not know what type of content to link to.

**Fix:** Add cross-field validation: if either `contentId` or `contentType` is provided, both must be provided. Use a custom class-validator decorator or validate in the service.

---

### [LOW] F12 — `getHistory` returns separate sections instead of unified timeline

**File:** `gifts.service.ts`, lines 208-288

The history response (lines 253-287) returns three separate arrays: `giftsSent`, `giftsReceived`, `transactions`. The client must merge and sort these client-side to display a unified timeline. This pushes sorting/merging logic to every client (mobile, potential web) and risks inconsistent ordering.

**Impact:** UX issue. The mobile client must implement its own merge-sort of three arrays by `createdAt`. Different clients may implement this differently, leading to inconsistent display.

---

### [INFO] F13 — Cashout method throws `NotImplementedException` before any logic executes

**File:** `gifts.service.ts`, line 291

```typescript
async cashout(userId: string, diamonds: number): Promise<CashoutResult> {
    throw new NotImplementedException('Cashout requires Stripe Connect payout integration. Coming soon.');
```

The method immediately throws at line 291. All subsequent code (lines 294-343) is dead code behind `// eslint-disable-next-line no-unreachable`. The dead code itself is well-structured (transaction, conditional updateMany, post-check), but it has never been executed or tested.

**Impact:** No cashout functionality exists. The dead code may bit-rot as the schema evolves. When eventually enabled, it will need fresh testing.

**Note:** The dead cashout code does properly use `$transaction`, conditional `updateMany`, and post-decrement balance checks -- it mirrors the `sendGift` pattern correctly.

---

### [INFO] F14 — Gift catalog is hardcoded in-memory, not in database

**File:** `gifts.service.ts`, lines 33-42

The `GIFT_CATALOG` is a const array in the service file. Adding, removing, or re-pricing gifts requires a code deploy. There is no admin API to manage the catalog.

**Impact:** Operational inflexibility. Cannot A/B test gift pricing, add seasonal gifts, or adjust prices without deploying new code. For an early-stage app this is acceptable, but it should move to the database before monetization launch.

---

## Checklist Verification

| # | Check | Result | Details |
|---|-------|--------|---------|
| 1 | **Self-gift** | PASS | Line 108-109: `senderId === receiverId` check throws `BadRequestException` |
| 2 | **Double-spend (concurrent)** | PASS (app-level) | Lines 133-136: conditional `updateMany` with `coins: { gte: catalogItem.coins }` prevents overdraft atomically. Lines 143-145: post-decrement negative check. However, DB-level CHECK may not be applied (F2). |
| 3 | **Transaction wrapping** | PASS | Line 132: entire send is in `$transaction`. Debit, gift record, diamond credit, and audit trail are atomic. |
| 4 | **Negative balance** | PARTIAL | App-level: conditional `updateMany` + post-check. DB-level: CHECK constraints exist in loose SQL file but not in migrations (F2). No guarantee they are applied. |
| 5 | **Rate limit** | PASS | Controller line 37: global 60/min. Line 49: purchase 10/min. Line 62: send 30/min. Line 94: cashout 5/min. All endpoints covered. |
| 6 | **Catalog validation** | PASS | Line 113: gift type validated against `GIFT_CATALOG`. Client cannot specify arbitrary prices -- `coinCost` is read from catalog (line 135), not from DTO. |
| 7 | **Blocked users** | FAIL | Zero block checks anywhere in the module (F1). Blocked users can send gifts freely. |
| 8 | **Cashout guarding** | PASS (by absence) | Line 291: `NotImplementedException` thrown immediately. No cashout is possible. Dead code below has proper guards (conditional updateMany, min check, transaction). |

### Summary

| Severity | Count | Finding IDs |
|----------|-------|-------------|
| CRITICAL | 1 | F1 |
| HIGH | 2 | F2, F3 |
| MEDIUM | 5 | F4, F5, F6, F7, F8 |
| LOW | 4 | F9, F10, F11, F12 |
| INFO | 2 | F13, F14 |
| **Total** | **14** | |

### What's done well
- Self-gift prevention (line 108-109)
- Catalog validation prevents arbitrary pricing (line 113, cost from catalog not DTO)
- Atomic `$transaction` wrapping with conditional `updateMany` for race-safe debit (lines 132-184)
- Application-level negative balance guard as safety net (lines 143-145)
- Rate limiting on every endpoint with sensible per-action limits
- Receiver existence and active status validation (lines 119-128)
- Proper Prisma `upsert` for receiver balance creation on first gift (lines 159-163)
