# Wave 1: Auth Webhook / Account Sync Audit

## Summary
11 findings. 1 CRITICAL, 3 HIGH, 4 MEDIUM, 1 LOW, 1 positive, 1 N/A.

## CRITICAL

### F1: Race condition — register requires DB user that webhook must create first
- **Evidence:** /auth/register uses ClerkAuthGuard which queries DB for user by clerkId. User only created by user.created webhook. Webhook can be delayed seconds to minutes.
- **Failure:** Every new user signup may get 401 "User not found" if webhook hasn't arrived yet.

## HIGH

### F2: user.deleted webhook only deactivates — does NOT cascade delete (GDPR violation)
- **File:** auth.service.ts:349-364 — only sets isDeactivated: true
- **Contrast:** users.service.ts:238-313 does full GDPR soft-delete with PII anonymization
- **Failure:** Account deletion via Clerk leaves all PII intact

### F6: Auto-unban NOT enforced in OptionalClerkAuthGuard
- **File:** optional-clerk-auth.guard.ts:42-45 — doesn't select banExpiresAt, doesn't auto-unban
- **Failure:** Users with expired temp bans treated as unauthenticated on public endpoints

### F9: syncClerkUser creates user WITHOUT required fields (COPPA/GDPR)
- **Missing:** isChildAccount, tosAcceptedAt, tosVersion, referralCode, UserSettings, language
- **Failure:** Minors bypass child protections. No ToS consent record.

## MEDIUM

### F3: Phone number never synced from Clerk (phone field always null)
### F5: session.revoked/removed/ended have no action (active sockets persist)
### F8: user.updated does not sync username changes from Clerk
### F4: session.created uses untyped data.user_id cast

## LOW
### F10: lastSeenAt tracking fragmented but functional

## POSITIVE
### F7: Webhook signature verification correct (svix, rawBody, idempotency dedup)
