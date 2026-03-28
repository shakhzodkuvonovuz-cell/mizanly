# Wave 1: Config Misfire Behavior Audit

## Summary
15 findings. 1 CRITICAL (credentials in git), 4 HIGH, 7 MEDIUM, 3 LOW.

## CRITICAL

### F1: CREDENTIALS COMMITTED TO SOURCE CONTROL (.env tracked by git)
- Live Neon DB password, Clerk keys, Stripe keys, all API keys, TOTP encryption key in plain text
- **Failure:** Full platform compromise if repo is exposed. TOTP key = all 2FA secrets decryptable.

## HIGH

### F5: Empty CORS_ORIGINS + production = complete mobile app failure
### F7: TOTP secrets stored unencrypted without key; no key rotation mechanism
- Losing/changing TOTP_ENCRYPTION_KEY permanently locks out all 2FA users
### F11: Redis connection failure in production — app appears healthy (liveness probe passes) but deeply broken
- Railway healthcheck uses /health/live (always 200), not /health/ready (checks Redis+DB)
### F12: Webhook idempotency depends entirely on Redis — no DB fallback

## MEDIUM

### F2: listPaymentMethods/attachPaymentMethod skip Stripe availability check
### F3: Stripe SDK initialized with empty key (zombie SDK)
### F4: Feature flags all return false when Redis down (silent feature disablement)
### F6: APP_URL defaults diverge (mizanly.app vs mizanly.com) — broken share links
### F10: Email silently drops all messages, no retry
### F13: NODE_ENV unset = development behavior (Swagger exposed, stack traces leaked, CORS open)
### F14: Upload S3 client constructed with empty credentials — opaque errors

## LOW
### F8: Meilisearch silently degrades with no recovery
### F9: Sentry disabled silently without DSN
### F15: Clerk guard with missing key — safe (auth fails closed)
