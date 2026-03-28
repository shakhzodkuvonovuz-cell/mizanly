# Wave 1: Mobile/Backend Endpoint Contract Drift Audit

## Summary
10 findings. 1 CRITICAL, 3 HIGH, 4 MEDIUM, 1 LOW. 4 guaranteed runtime failures.

## CRITICAL

### F1: Encryption getBulkKeys — POST vs GET method mismatch
- **Mobile:** `api.post('/encryption/keys/bulk', { userIds })` (encryptionApi.ts:12)
- **Backend:** `@Get('keys/bulk') @Query('userIds')` (encryption.controller.ts:85)
- **Failure:** 404/405. E2E encryption key exchange for group chats completely broken.

## HIGH

### F2: Reel archive/unarchive — POST vs PATCH method mismatch
- **Mobile:** `api.post('/reels/:id/archive')` (api.ts:569-572)
- **Backend:** `@Patch(':id/archive')` (reels.controller.ts:270)
- **Failure:** 404. Cannot archive/unarchive reels.

### F3: Pin conversation — extra /conversations/ path segment
- **Mobile:** `/messages/conversations/:id/pin` (api.ts:782)
- **Backend:** `/messages/:conversationId/pin` (messages.controller.ts:615)
- **Failure:** 404. Cannot pin/unpin conversations.

### F4: Auto-play setting — case mismatch (lowercase vs uppercase)
- **Mobile:** sends `'wifi'` (api.ts:983)
- **Backend:** validates `@IsIn(['WIFI', 'ALWAYS', 'NEVER'])` (settings.controller.ts:30)
- **Failure:** 400 Bad Request. Setting never saved.

## MEDIUM

### F5: Follow requests endpoint moved but mobile not updated (dead code, working path exists)
### F6: Hadith bookmark endpoint does not exist (404)
### F7: Video cross-publish endpoint does not exist (404)
### F8: Search suggestions — semantic mismatch (returns autocomplete, not users)
### F10: Cancel subscription — DELETE body may be stripped by CDN/proxy

## LOW
### F9: Duplicate archive endpoints — two functions, one broken

## Root Cause
Rapid development across 7 sessions with mobile and backend modified independently. No shared API contract (no OpenAPI generation or type sharing).
