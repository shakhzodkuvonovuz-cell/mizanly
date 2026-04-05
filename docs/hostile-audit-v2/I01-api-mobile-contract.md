# I01 — API/Mobile Contract Mismatch Audit

**Auditor:** Claude Opus 4.6 (hostile, NO code fixes)
**Date:** 2026-04-05
**Scope:** Every `apps/mobile/src/services/*Api.ts` file + inline `api.get/post/patch/delete` calls in screens/components, cross-checked against actual NestJS controller routes.

---

## Methodology

For each mobile API service file:
1. Read every endpoint path, HTTP method, and request body
2. Find the corresponding `@Controller()` in `apps/api/src/modules/`
3. Verify the route exists with matching HTTP method
4. Verify the request body field names match the backend DTO
5. Verify query param names are accepted by the controller
6. Check response type compatibility where possible

Also searched `apps/mobile/app/` and `apps/mobile/src/components/` for inline `api.*` calls not routed through service files.

---

## CRITICAL Findings (will crash at runtime / 4xx every time)

### C01 — `revenueApi.ts`: ENTIRE FILE has no backend (2 phantom endpoints)

| Mobile endpoint | HTTP | Backend route? |
|---|---|---|
| `/monetization/revenue` | GET | **DOES NOT EXIST** |
| `/monetization/revenue/transactions` | GET | **DOES NOT EXIST** |

**File:** `apps/mobile/src/services/revenueApi.ts`
**Impact:** Both calls will 404. The monetization controller (`apps/api/src/modules/monetization/monetization.controller.ts`) has NO routes containing `revenue`. The closest are the wallet balance and payout history endpoints under `/monetization/wallet/*`. Revenue overview and transaction history were never built on the backend.

---

### C02 — `communityNotesApi.ts` `rate()`: enum value mismatch (400 every time)

| Mobile sends | Backend validates (`@IsIn`) |
|---|---|
| `'helpful'` | `'NOTE_HELPFUL'` |
| `'somewhat_helpful'` | `'NOTE_SOMEWHAT_HELPFUL'` |
| `'not_helpful'` | `'NOTE_NOT_HELPFUL'` |

**File:** `apps/mobile/src/services/communityNotesApi.ts` line 37
**Backend:** `apps/api/src/modules/community-notes/community-notes.controller.ts` `RateNoteDto` line 18
**Impact:** `class-validator` will reject every rating request with a 400 Bad Request. The Prisma enum `NoteRating` uses `NOTE_HELPFUL` prefix convention; the mobile omits it.

---

### C03 — `walletApi.ts` `cashout()`: wrong field name + missing required field

| Mobile sends | Backend `WalletCashoutDto` expects |
|---|---|
| `{ amount, methodId }` | `{ amount, payoutSpeed, paymentMethodId }` |

**File:** `apps/mobile/src/services/walletApi.ts` line 27
**Backend:** `apps/api/src/modules/monetization/monetization.controller.ts` `WalletCashoutDto` line 24-27
**Impact:** Two failures:
1. `paymentMethodId` is `@IsString()` required -- mobile sends `methodId` instead, so the field is `undefined` and validation fails (400).
2. `payoutSpeed` is `@IsIn(['instant', 'standard'])` required -- mobile never sends it, validation fails (400).

The cashout flow is completely broken. Every cashout attempt will fail.

---

## HIGH Findings (silent data loss / wrong behavior)

### H01 — `audioRoomsApi.ts` `list()`: `status` query param silently ignored

**Mobile:** `audioRoomsApi.list(cursor, status)` sends `?status=active` or similar
**Backend:** `AudioRoomsController.list()` only reads `@Query('cursor')` and `@Query('limit')` -- `status` is ignored.

**File:** `apps/mobile/src/services/audioRoomsApi.ts` line 13
**Backend:** `apps/api/src/modules/audio-rooms/audio-rooms.controller.ts` line 46-54
**Impact:** Filtering by status returns ALL rooms regardless of the filter value. The backend has separate endpoints (`GET /audio-rooms/active`, `GET /audio-rooms/upcoming`) but the mobile tries to use a query param on the main list. Users will see rooms in all statuses when they expect only active ones.

---

### H02 — `creator-storefront.tsx`: `/products?sellerId=xxx` -- `sellerId` param not accepted

**Screen:** `apps/mobile/app/(screens)/creator-storefront.tsx` line 79
**Backend:** `CommerceController.getProducts()` reads `cursor`, `limit`, `category`, `search` -- NOT `sellerId`.

**Impact:** The storefront screen fetches `/products?sellerId=<userId>` to show a specific creator's products. The backend ignores the `sellerId` param and returns the global product listing. A creator's storefront page shows ALL products from all sellers.

---

### H03 — `giftsApi.ts` `purchaseCoins()`: `paymentMethodId` silently stripped

**Mobile sends:** `{ amount, paymentMethodId? }`
**Backend `PurchaseCoinsDto`:** Only has `amount: number`

**File:** `apps/mobile/src/services/giftsApi.ts` line 29
**Backend:** `apps/api/src/modules/gifts/gifts.controller.ts` `PurchaseCoinsDto` line 18-19
**Impact:** The `paymentMethodId` field is silently ignored by class-validator's whitelist stripping. If the mobile intends to charge a specific payment method, the backend has no way to know which one. Currently the coin purchase likely creates a generic Stripe intent without a specific payment method.

---

## MEDIUM Findings (functionality gap / dead code)

### M01 — `monetizationApi.ts`: unused `SubscriptionStats` import

**File:** `apps/mobile/src/services/monetizationApi.ts` line 10
`SubscriptionStats` is imported from `@/types/monetization` but never used in any function. There is no `getSubscriptionStats()` endpoint on the mobile or backend. Dead import.

---

### M02 — `twoFactorApi.ts` `status()`: response type mismatch

**Mobile expects:** `TwoFactorStatus` = `{ isEnabled: boolean; verifiedAt?: string; backupCodesRemaining: number }`
**Backend returns:** `{ isEnabled: boolean; sessionVerified: boolean }`

**File:** `apps/mobile/src/services/twoFactorApi.ts` line 22 vs `apps/api/src/modules/two-factor/two-factor.controller.ts` line 130-138
**Impact:** The mobile type expects `verifiedAt` and `backupCodesRemaining` fields that the backend never returns. `sessionVerified` from the backend is not in the mobile type. Runtime reads of `status.verifiedAt` and `status.backupCodesRemaining` will return `undefined`. TypeScript types provide false confidence here.

---

### M03 — `twoFactorApi.ts` `verify()`: response type mismatch

**Mobile expects:** `TwoFactorStatus` = `{ isEnabled: boolean; verifiedAt?: string; backupCodesRemaining: number }`
**Backend returns:** `{ message: 'Two-factor authentication enabled' }`

**File:** `apps/mobile/src/services/twoFactorApi.ts` line 14 vs controller line 82-87
**Impact:** The mobile expects `TwoFactorStatus` but gets `{ message: string }`. Any code checking `result.isEnabled` will get `undefined`.

---

### M04 — `twoFactorApi.ts` `backup()`: response type mismatch

**Mobile expects:** `{ success: boolean }`
**Backend returns:** `{ message: 'Backup code accepted' }`

**File:** `apps/mobile/src/services/twoFactorApi.ts` line 24 vs controller line 148-154
**Impact:** Mobile checking `result.success` gets `undefined`. Should check `result.message` or backend should return `{ success: true }`.

---

### M05 — `twoFactorApi.ts` `disable()`: response type mismatch

**Mobile expects:** implicit void/any from `api.delete`
**Backend returns:** `{ message: 'Two-factor authentication disabled' }`

This one is not a crash, but the mobile sends `DisableTwoFactorDto = { code: string }` while the backend's `DisableDto` also expects `{ code: string }`. The field names match, but:

**NOTE on DELETE with body:** The mobile comment on line 18-19 acknowledges "some proxies may strip DELETE bodies." This is a real risk. Railway/Cloudflare proxies could strip the body, causing the disable to fail silently. The backend should accept POST instead.

---

### M06 — `savedMessagesApi.ts` `create()`: sends only `content`, backend supports richer DTO

**Mobile:** `savedMessagesApi.create(content)` sends `{ content }`
**Backend DTO:** `SaveMessageDto` accepts `content`, `mediaUrl`, `mediaType`, `forwardedFromType`, `forwardedFromId`

Not a break, but the mobile API wrapper limits saved messages to text-only. If the UI ever supports saving media messages, the API service will need updating.

---

## LOW Findings (cosmetic / future risk)

### L01 — No backend for `mentorship.tsx` screen's request endpoint (UNVERIFIED)

**Screen:** `apps/mobile/app/(screens)/mentorship.tsx` line 223 calls `api.post('/mentorship/request', ...)`
**Backend:** Found `@Post('mentorship/request')` in `apps/api/src/modules/community/community.controller.ts` line 43.

The route EXISTS but is under the `community` module's controller, which uses `@Controller()` with no prefix. This means the route should work at `/mentorship/request`. **Verified: not a break.**

---

### L02 — `chatFoldersApi.ts` `update()`: sends `{ name, icon }` but backend also accepts more fields

**Mobile:** `chatFoldersApi.update(id, { name, icon })`
**Backend `UpdateChatFolderDto`:** Also accepts `conversationIds`, `includeGroups`, `includeChannels`, `filterType`, `includeBots`

Not a break. The mobile just doesn't expose the full folder customization. But if the UI adds folder filter settings, the API service will need expansion.

---

### L03 — `islamicApi.ts` `bookmarkHadith()`: path uses `hadiths` (plural) matching backend

**Mobile:** `api.post('/islamic/hadiths/${hadithId}/bookmark', {})`
**Backend:** `@Post('hadiths/:id/bookmark')` at line 184

This matches. Not a finding. Noted because the rest of the hadith endpoints use `hadith` (singular) while the bookmark uses `hadiths` (plural) -- inconsistent but not broken.

---

### L04 — Inline calls in screens bypass service layer abstraction

| File | Endpoint | Service file equivalent |
|---|---|---|
| `chat-folders.tsx:112` | `api.delete('/chat-folders/${id}')` | `chatFoldersApi.remove(id)` exists |
| `saved-messages.tsx:71` | `api.delete('/saved-messages/${id}')` | `savedMessagesApi.remove(id)` exists |
| `saved-messages.tsx:85` | `api.patch('/saved-messages/${id}/pin')` | `savedMessagesApi.pin(id)` exists |
| `creator-storefront.tsx:79` | `api.get('/products?sellerId=...')` | No service file equivalent |
| `mentorship.tsx:223` | `api.post('/mentorship/request', ...)` | No service file equivalent |
| `waqf.tsx:77` | `api.post('/waqf/funds/${id}/contribute', ...)` | No service file equivalent |
| `CommentsSheet.tsx:55` | `api.post('/reels/${reelId}/comments/${id}/like')` | Should use `reelsApi.likeComment()` |
| `CommentsSheet.tsx:153` | `api.post('/reels/${id}/comment', ...)` | Should use `reelsApi.comment()` |

6 of 8 inline calls have a service file equivalent that should be used instead. 3 have no service file at all. This makes contract changes harder to track.

---

## Summary Table

| ID | Severity | File | Issue | Runtime effect |
|---|---|---|---|---|
| **C01** | CRITICAL | `revenueApi.ts` | 2 endpoints don't exist on backend | 404 on every call |
| **C02** | CRITICAL | `communityNotesApi.ts` | Enum prefix mismatch (`helpful` vs `NOTE_HELPFUL`) | 400 on every rate call |
| **C03** | CRITICAL | `walletApi.ts` | Wrong field name (`methodId` vs `paymentMethodId`) + missing `payoutSpeed` | 400 on every cashout |
| **H01** | HIGH | `audioRoomsApi.ts` | `status` query param ignored by backend | Wrong data returned |
| **H02** | HIGH | `creator-storefront.tsx` | `sellerId` query param ignored by backend | Shows all products, not seller's |
| **H03** | HIGH | `giftsApi.ts` | `paymentMethodId` silently stripped | Wrong payment method used |
| **M01** | MEDIUM | `monetizationApi.ts` | Unused `SubscriptionStats` import | Dead code |
| **M02** | MEDIUM | `twoFactorApi.ts` | `status()` response type doesn't match backend | `undefined` field reads |
| **M03** | MEDIUM | `twoFactorApi.ts` | `verify()` response type doesn't match backend | `undefined` field reads |
| **M04** | MEDIUM | `twoFactorApi.ts` | `backup()` response type doesn't match backend | `undefined` field reads |
| **M05** | MEDIUM | `twoFactorApi.ts` | DELETE with body risk on disable | May fail through some proxies |
| **M06** | MEDIUM | `savedMessagesApi.ts` | Only text content supported in wrapper | Media save not possible |
| **L01** | LOW | `mentorship.tsx` | Inline call, route exists | OK |
| **L02** | LOW | `chatFoldersApi.ts` | Partial DTO coverage | Future risk |
| **L03** | LOW | `islamicApi.ts` | Singular/plural inconsistency in hadith paths | Not broken |
| **L04** | LOW | 8 files | Inline API calls bypass service layer | Maintenance risk |

**Totals: 3 CRITICAL, 3 HIGH, 6 MEDIUM, 4 LOW = 16 findings**

---

## Files Audited

### Mobile API service files (19 files)
| File | Endpoints | Backend controller | Status |
|---|---|---|---|
| `revenueApi.ts` | 2 | None | **PHANTOM -- no backend** |
| `walletApi.ts` | 4 | `monetization.controller.ts` | **C03: cashout DTO broken** |
| `twoFactorApi.ts` | 6 | `two-factor.controller.ts` | M02-M05: response mismatches |
| `paymentsApi.ts` | 5 | `payments.controller.ts` | OK |
| `monetizationApi.ts` | 11 | `monetization.controller.ts` | M01: dead import; routes OK |
| `creatorApi.ts` | 8 | `creator.controller.ts` | OK |
| `islamicApi.ts` | 48 | `islamic.controller.ts` | L03: plural inconsistency; routes OK |
| `promotionsApi.ts` | 6 | `promotions.controller.ts` | OK |
| `halalApi.ts` | 6 | `halal.controller.ts` | OK |
| `giftsApi.ts` | 7 | `gifts.controller.ts` | H03: paymentMethodId stripped |
| `audioRoomsApi.ts` | 10 | `audio-rooms.controller.ts` | H01: status param ignored |
| `chatExportApi.ts` | 2 | `chat-export.controller.ts` | OK |
| `communitiesApi.ts` | 7 | `communities.controller.ts` | OK |
| `eventsApi.ts` | 8 | `events.controller.ts` | OK |
| `reelTemplatesApi.ts` | 5 | `reel-templates.controller.ts` | OK |
| `communityNotesApi.ts` | 4 | `community-notes.controller.ts` | **C02: enum mismatch** |
| `altProfileApi.ts` | 8 | `alt-profile.controller.ts` | OK |
| `chatFoldersApi.ts` | 4 | `telegram-features.controller.ts` | L02: partial DTO |
| `savedMessagesApi.ts` | 4 | `telegram-features.controller.ts` | M06: text-only |

### Inline API calls (8 locations in screens/components)
| File | Route | Backend exists? |
|---|---|---|
| `chat-folders.tsx` | `DELETE /chat-folders/:id` | Yes |
| `creator-storefront.tsx` | `GET /products?sellerId=xxx` | **H02: sellerId param ignored** |
| `creator-storefront.tsx` | `GET /users/:id` | Yes |
| `mentorship.tsx` | `POST /mentorship/request` | Yes (community controller) |
| `saved-messages.tsx` | `DELETE /saved-messages/:id` | Yes |
| `saved-messages.tsx` | `PATCH /saved-messages/:id/pin` | Yes |
| `waqf.tsx` | `POST /waqf/funds/:id/contribute` | Yes (commerce controller) |
| `CommentsSheet.tsx` | `POST /reels/:id/comments/:id/like` | Yes |
| `CommentsSheet.tsx` | `POST /reels/:id/comment` | Yes |
