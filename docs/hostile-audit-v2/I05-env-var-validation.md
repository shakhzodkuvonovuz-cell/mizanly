# I05 — Env Var Validation Gap Analysis

**Auditor:** Hostile code audit (Opus 4.6)
**Date:** 2026-04-05
**Scope:** Compare Joi validation schema in `app.module.ts` against all `process.env.*` and `configService.get(*)` usages. Check mobile `.env.example` completeness.
**Method:** Grep every env var reference, cross-reference against Joi schema, .env.example files, and main.ts startup checks

---

## Summary

| Category | Count |
|----------|-------|
| Validated by Joi schema in `app.module.ts` | 10 |
| Used in code but NOT in Joi schema | 25 |
| In `.env.example` but not validated by Joi | 21 |
| Used in code but missing from `.env.example` | 2 |
| Mobile env vars missing from `.env.example` | 0 |

---

## Joi Validation Schema (app.module.ts:117-133)

The Joi schema validates exactly these 10 variables:

| Variable | Joi Rule | Notes |
|----------|----------|-------|
| `DATABASE_URL` | `Joi.string().required()` | Correctly required |
| `CLERK_SECRET_KEY` | `Joi.string().required()` | Correctly required |
| `REDIS_URL` | `Joi.string().allow('').default('')` | Optional (falls back to in-memory) |
| `STRIPE_SECRET_KEY` | `Joi.string().allow('').default('')` | Optional |
| `STRIPE_WEBHOOK_SECRET` | `Joi.string().allow('').default('')` | Optional |
| `R2_ACCOUNT_ID` | `Joi.string().allow('').default('')` | Optional |
| `R2_ACCESS_KEY_ID` | `Joi.string().allow('').default('')` | Optional |
| `R2_SECRET_ACCESS_KEY` | `Joi.string().allow('').default('')` | Optional |
| `R2_BUCKET_NAME` | `Joi.string().allow('').default('')` | Optional |
| `TOTP_ENCRYPTION_KEY` | `Joi.string().allow('').default('')` | Optional |
| `NODE_ENV` | `Joi.string().valid('development','production','test').default('development')` | Correct |
| `PORT` | `Joi.number().default(3000)` | Correct |

Note: `validationOptions: { allowUnknown: true }` means unknown env vars are silently ignored. This defeats the purpose of validation -- any typo in a var name (e.g., `STRIP_SECRET_KEY`) passes validation silently.

---

## CRITICAL — Used in Production Code, NOT Validated by Joi

These env vars are read via `process.env.*` or `configService.get(*)` in production code paths but are completely absent from the Joi validation schema. If misspelled or missing, they silently default to empty string / undefined.

### C1. Auth & Inter-service Keys

| Variable | Used In | File | Line | Risk |
|----------|---------|------|------|------|
| `CLERK_WEBHOOK_SECRET` | Webhook signature verification | `auth/webhooks.controller.ts` | 80 | **HIGH** — without this, Clerk webhooks are unverified. Attacker can forge user creation events. |
| `CLERK_PUBLISHABLE_KEY` | Startup warning only | `main.ts` | 40 | LOW — only used in recommended check |
| `INTERNAL_WEBHOOK_SECRET` | E2E server-to-API auth | `messages/internal-e2e.controller.ts` | 27, 44 | **HIGH** — without this, internal E2E endpoints accept any request |
| `INTERNAL_SERVICE_KEY` | Go LiveKit server-to-API auth | `notifications/internal-push.controller.ts` | 49 | **HIGH** — without this, incoming call push notifications are rejected (401) |

### C2. AI Service Keys

| Variable | Used In | File | Line | Risk |
|----------|---------|------|------|------|
| `ANTHROPIC_API_KEY` | AI moderation, captions, smart replies, stickers | `ai/ai.service.ts:62`, `moderation/content-safety.service.ts:41`, `creator/creator.service.ts:310`, `stickers/stickers.service.ts:258` | Multiple | MEDIUM — AI features silently fail. Content moderation degrades. |
| `OPENAI_API_KEY` | Whisper voice transcription | `ai/ai.service.ts:418,485` | Multiple | LOW — voice transcription fails gracefully |
| `GEMINI_API_KEY` | Embeddings for recommendations | `embeddings/embeddings.service.ts:30` | 30 | LOW — recommendations degrade to basic algorithm |

### C3. External Service Keys

| Variable | Used In | File | Line | Risk |
|----------|---------|------|------|------|
| `RESEND_API_KEY` | Email sending (waitlist, verification) | `common/services/email.service.ts` | 29 | MEDIUM — all emails silently fail |
| `GIPHY_API_KEY` | GIPHY proxy for GIF search | `giphy/giphy.service.ts` | 25 | LOW — GIF search returns empty |
| `MEILISEARCH_HOST` | Full-text search | `search/meilisearch.service.ts` | 42 | MEDIUM — falls back to slow Prisma LIKE queries |
| `MEILISEARCH_API_KEY` | Meilisearch auth | `search/meilisearch.service.ts` | 43 | Same as above |
| `EXPO_ACCESS_TOKEN` | Push notification delivery | `notifications/push.service.ts` | 76 | LOW — push still works without token (lower rate limits) |

### C4. Storage & Media

| Variable | Used In | File | Line | Risk |
|----------|---------|------|------|------|
| `R2_PUBLIC_URL` | Public URL for uploaded media | `upload/upload.service.ts:79`, `health/health.controller.ts:31`, `privacy/privacy.service.ts:23`, `stream/stream.service.ts:73`, `upload/upload-cleanup.service.ts:67` | Multiple | MEDIUM — defaults to `https://media.mizanly.app` but wrong in dev |
| `CF_STREAM_ACCOUNT_ID` | Cloudflare Stream video hosting | `stream/stream.service.ts:47`, `health/health.controller.ts:33` | Multiple | LOW — video hosting silently disabled |
| `CF_STREAM_API_TOKEN` | Cloudflare Stream API auth | `stream/stream.service.ts:48`, `health/health.controller.ts:32` | Multiple | Same as above |
| `CF_STREAM_WEBHOOK_SECRET` | Stream webhook verification | `stream/stream.controller.ts:33` | 33 | LOW — stream webhooks unverified |
| `CF_IMAGE_RESIZING_ENABLED` | Cloudflare image resizing toggle | `common/utils/image.ts:90` | 90 | LOW — image resizing disabled by default |
| `CLOUDFLARE_ACCOUNT_ID` | R2 fallback naming | `upload/upload.service.ts:51` | 51 | LOW — fallback for R2_ACCOUNT_ID |
| `CLOUDFLARE_R2_ACCESS_KEY` | R2 fallback naming | `upload/upload.service.ts:52` | 52 | LOW — fallback |
| `CLOUDFLARE_R2_SECRET_KEY` | R2 fallback naming | `upload/upload.service.ts:53` | 53 | LOW — fallback |

### C5. App Config

| Variable | Used In | File | Line | Risk |
|----------|---------|------|------|------|
| `CORS_ORIGINS` | CORS allowed origins | `main.ts:145`, `chat.gateway.ts:38` | Multiple | **HIGH** — in production without this, CORS allows wildcard via `isProduction ? false : true` logic. Actually: the code falls back to empty array, which means NO origins are allowed (safer than expected). |
| `API_URL` | Swagger server URL | `main.ts:212` | 212 | LOW — Swagger shows wrong URL |
| `APP_URL` | OG image URLs, video share URLs | `og/og.service.ts:46`, `videos/videos.service.ts:1055` | Multiple | LOW — defaults to `https://mizanly.app` |
| `SENTRY_DSN` | Error monitoring | `config/sentry.ts:4-6`, `common/filters/http-exception.filter.ts:36,70` | Multiple | MEDIUM — no error monitoring if missing |
| `EMAIL_FROM` | Email sender address | `common/services/email.service.ts:19` | 19 | LOW — defaults to `Mizanly <noreply@mizanly.app>` |
| `FIELD_ENCRYPTION_KEY` | Webhook secret encryption | `webhooks/webhooks.service.ts:18` | 18 | MEDIUM — webhook secrets stored unencrypted |
| `TOTP_ENCRYPTION_KEY_OLD` | 2FA key rotation | `two-factor/two-factor.service.ts:214` | 214 | LOW — only needed during key rotation |
| `STICKER_AI_MODEL` | AI sticker generation model | `stickers/stickers.service.ts:423` | 423 | LOW — defaults to claude-haiku-4-5-20251001 |
| `GOLD_PRICE_PER_GRAM` | Zakat calculator | `islamic/islamic.service.ts:450` | 450 | LOW — defaults to $92 |
| `SILVER_PRICE_PER_GRAM` | Zakat calculator | `islamic/islamic.service.ts:451` | 451 | LOW — defaults to $1.05 |

---

## main.ts Startup Checks (Secondary Defense)

The `main.ts` bootstrap function has a separate env var check system (lines 30-79) that catches missing vars at startup. This is NOT the Joi validation -- it runs after NestJS initialization and only logs warnings (doesn't reject the config).

**Required (process exits if missing):**
- `DATABASE_URL` (also in Joi)
- `CLERK_SECRET_KEY` (also in Joi)

**Required in production only:**
- `REDIS_URL`, `TOTP_ENCRYPTION_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `STRIPE_WEBHOOK_SECRET`

**Recommended (warns but continues):**
- `CLERK_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `ANTHROPIC_API_KEY`, `SENTRY_DSN`, `R2_PUBLIC_URL`, `CF_STREAM_ACCOUNT_ID`, `CF_STREAM_API_TOKEN`, `MEILISEARCH_HOST`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `CORS_ORIGINS`

**Not checked at startup AND not in Joi:**
- `CLERK_WEBHOOK_SECRET`
- `INTERNAL_WEBHOOK_SECRET`
- `INTERNAL_SERVICE_KEY`
- `RESEND_API_KEY`
- `GIPHY_API_KEY`
- `MEILISEARCH_API_KEY`
- `EXPO_ACCESS_TOKEN`
- `CF_STREAM_WEBHOOK_SECRET`
- `CF_IMAGE_RESIZING_ENABLED`
- `FIELD_ENCRYPTION_KEY`
- `TOTP_ENCRYPTION_KEY_OLD`
- `STICKER_AI_MODEL`
- `EMAIL_FROM`
- `GOLD_PRICE_PER_GRAM`
- `SILVER_PRICE_PER_GRAM`
- `APP_URL`
- `API_URL`
- `DIRECT_DATABASE_URL`

---

## .env.example Completeness (API)

**File:** `apps/api/.env.example` (79 lines, 35 variables)

### Variables in `.env.example` but NOT validated by Joi:

| Variable | In .env.example | In Joi | In main.ts check | Used in code |
|----------|:-:|:-:|:-:|:-:|
| `DIRECT_DATABASE_URL` | Yes | No | No | **No** (Prisma uses it internally) |
| `CLERK_PUBLISHABLE_KEY` | Yes | No | Recommended | `main.ts` warning only |
| `CLERK_WEBHOOK_SECRET` | Yes | No | No | `webhooks.controller.ts` |
| `ANTHROPIC_API_KEY` | Yes | No | Recommended | `ai.service.ts`, `content-safety.service.ts` |
| `OPENAI_API_KEY` | Yes | No | Recommended | `ai.service.ts` |
| `GEMINI_API_KEY` | Yes | No | Recommended | `embeddings.service.ts` |
| `R2_PUBLIC_URL` | Yes | No | Recommended | `upload.service.ts`, `health.controller.ts` |
| `CF_IMAGE_RESIZING_ENABLED` | Yes | No | No | `image.ts` |
| `CF_STREAM_ACCOUNT_ID` | Yes | No | Recommended | `stream.service.ts` |
| `CF_STREAM_API_TOKEN` | Yes | No | Recommended | `stream.service.ts` |
| `CF_STREAM_WEBHOOK_SECRET` | Yes | No | No | `stream.controller.ts` |
| `MEILISEARCH_HOST` | Yes | No | Recommended | `meilisearch.service.ts` |
| `MEILISEARCH_API_KEY` | Yes | No | No | `meilisearch.service.ts` |
| `RESEND_API_KEY` | Yes | No | No | `email.service.ts` |
| `SENTRY_DSN` | Yes | No | Recommended | `sentry.ts` |
| `INTERNAL_SERVICE_KEY` | Yes | No | No | `internal-push.controller.ts` |
| `INTERNAL_WEBHOOK_SECRET` | Yes | No | No | `internal-e2e.controller.ts` |
| `NESTJS_INTERNAL_URL` | Yes | No | No | Not used in API (used by Go services) |
| `NESTJS_BASE_URL` | Yes | No | No | Not used in API (used by Go services) |
| `TRANSPARENCY_SIGNING_KEY` | Yes | No | No | Not used in API (mobile app only) |
| `GOLD_PRICE_PER_GRAM` | Yes | No | No | `islamic.service.ts` |
| `SILVER_PRICE_PER_GRAM` | Yes | No | No | `islamic.service.ts` |
| `EXPO_ACCESS_TOKEN` | Yes | No | No | `push.service.ts` |
| `APP_URL` | Yes | No | No | `og.service.ts` |
| `API_URL` | Yes | No | No | `main.ts` (Swagger) |
| `CORS_ORIGINS` | Yes | No | Recommended | `main.ts`, `chat.gateway.ts` |

### Variables used in code but MISSING from `.env.example`:

| Variable | Used In | Missing From |
|----------|---------|-------------|
| `FIELD_ENCRYPTION_KEY` | `webhooks/webhooks.service.ts:18` | `.env.example` |
| `STICKER_AI_MODEL` | `stickers/stickers.service.ts:423` | `.env.example` |
| `TOTP_ENCRYPTION_KEY_OLD` | `two-factor/two-factor.service.ts:214` | `.env.example` (acceptable -- only needed during key rotation) |
| `EMAIL_FROM` | `common/services/email.service.ts:19` | `.env.example` |
| `CLOUDFLARE_ACCOUNT_ID` | `upload/upload.service.ts:51` | `.env.example` (acceptable -- documented as fallback naming) |
| `CLOUDFLARE_R2_ACCESS_KEY` | `upload/upload.service.ts:52` | `.env.example` (acceptable -- documented as fallback naming) |
| `CLOUDFLARE_R2_SECRET_KEY` | `upload/upload.service.ts:53` | `.env.example` (acceptable -- documented as fallback naming) |

---

## Mobile .env.example Completeness

**File:** `apps/mobile/.env.example` (22 lines, 8 variables)

### All mobile env vars used in code:

| Variable | In `.env.example` | Used In |
|----------|:-:|---------|
| `EXPO_PUBLIC_API_URL` | Yes | `services/api.ts:163`, `hooks/useMessageSend.ts:417`, `hooks/useVoiceRecording.ts:123`, `services/giphyService.ts:9` |
| `EXPO_PUBLIC_WS_URL` | Yes | Not directly used in `src/` (SOCKET_URL is derived from API_URL). Present in `eas.json` for build. |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | `app/_layout.tsx:117` |
| `EXPO_PUBLIC_PROJECT_ID` | Yes | `hooks/usePushNotifications.ts:73` |
| `EXPO_PUBLIC_SENTRY_DSN` | Yes | `config/sentry.ts:10`, `utils/sentry.ts:24` |
| `EXPO_PUBLIC_GIPHY_API_KEY` | Yes | `components/risalah/GifPicker.tsx:33`, `services/giphyService.ts:8` |
| `EXPO_PUBLIC_LIVEKIT_URL` | Yes | `services/livekit.ts:3` |
| `EXPO_PUBLIC_LIVEKIT_WS_URL` | Yes | `hooks/useLiveKitCall.ts:382` |
| `EXPO_PUBLIC_IOS_APP_STORE_URL` | Yes | `components/ui/ForceUpdateModal.tsx:11` |

**Result:** Mobile `.env.example` is complete. All 8 mobile env vars that are used in code are documented.

### Mobile finding: `EXPO_PUBLIC_WS_URL` is dead

`EXPO_PUBLIC_WS_URL` is defined in `.env.example` and `eas.json` but is never read by any code in `apps/mobile/src/`. The socket URL is derived from `EXPO_PUBLIC_API_URL` via URL parsing in `services/api.ts:165-172`. This env var is dead and misleading -- developers might think they need to set it separately.

---

## E2E Server .env.example Completeness

**File:** `apps/e2e-server/.env.example` (27 lines, 8 variables)

All variables documented. The Go server reads from `os.Getenv()` which is not grep-able against the Joi schema (different runtime). No missing variables found.

---

## LiveKit Server .env.example Completeness

**File:** `apps/livekit-server/.env.example` (34 lines, 11 variables)

All variables documented. Same Go runtime caveat as above.

---

## Recommendations (Priority Order)

### P0 (Security)

1. **Add `CLERK_WEBHOOK_SECRET` to Joi schema as required in production.** Without it, anyone can forge Clerk webhook events (user creation, deletion). Currently silently ignored.

2. **Add `INTERNAL_WEBHOOK_SECRET` and `INTERNAL_SERVICE_KEY` to Joi schema.** Without these, inter-service auth is silently disabled. An attacker can forge incoming call notifications or inject encrypted messages.

3. **Add `FIELD_ENCRYPTION_KEY` to `.env.example` and Joi schema.** Currently used in `webhooks.service.ts` for encrypting webhook secrets but not documented anywhere. Developers won't know to set it.

### P1 (Correctness)

4. **Add all used env vars to the Joi schema** with appropriate defaults. The current schema validates only 10 of 35+ used variables, making it largely decorative.

5. **Change `validationOptions.allowUnknown` to `false`** (or add all expected vars). Currently, a typo like `STRIP_SECRET_KEY` passes validation and silently breaks Stripe.

6. **Add `EMAIL_FROM` and `STICKER_AI_MODEL` to `.env.example`.** Both are used in production code but undocumented.

7. **Remove or document `EXPO_PUBLIC_WS_URL` from mobile `.env.example`.** It is dead code -- the socket URL is derived from `EXPO_PUBLIC_API_URL`. Keeping it creates confusion about whether it needs separate configuration.

### P2 (Hardening)

8. **Add format validation to secret keys in Joi.** For example:
   - `CLERK_SECRET_KEY: Joi.string().pattern(/^sk_(test|live)_/).required()`
   - `STRIPE_SECRET_KEY: Joi.string().pattern(/^sk_(test|live)_/).allow('').default('')`
   - `TOTP_ENCRYPTION_KEY: Joi.string().hex().length(64).allow('').default('')`

9. **Move `NESTJS_INTERNAL_URL`, `NESTJS_BASE_URL`, and `TRANSPARENCY_SIGNING_KEY` out of API `.env.example`** or mark them clearly as "not used by API" since they are only consumed by Go services and the mobile app respectively.

10. **Add `DIRECT_DATABASE_URL` to Joi schema.** Prisma uses it internally for migrations. If missing, migrations may silently use the pooler connection which can fail.

---

## Cross-Reference Matrix

| Variable | Joi Schema | main.ts Check | .env.example | Actually Used |
|----------|:-:|:-:|:-:|:-:|
| `DATABASE_URL` | Required | Required | Yes | Yes |
| `CLERK_SECRET_KEY` | Required | Required | Yes | Yes |
| `REDIS_URL` | Optional | Prod required | Yes | Yes |
| `STRIPE_SECRET_KEY` | Optional | Recommended | Yes | Yes |
| `STRIPE_WEBHOOK_SECRET` | Optional | Prod required | Yes | Yes |
| `R2_ACCOUNT_ID` | Optional | Prod required | Yes | Yes |
| `R2_ACCESS_KEY_ID` | Optional | Prod required | Yes | Yes |
| `R2_SECRET_ACCESS_KEY` | Optional | Prod required | Yes | Yes |
| `R2_BUCKET_NAME` | Optional | -- | Yes | Yes |
| `TOTP_ENCRYPTION_KEY` | Optional | Prod required | Yes | Yes |
| `NODE_ENV` | Validated | -- | Yes | Yes |
| `PORT` | Validated | -- | Yes | Yes |
| `CLERK_WEBHOOK_SECRET` | **MISSING** | **MISSING** | Yes | **Yes** |
| `CLERK_PUBLISHABLE_KEY` | **MISSING** | Recommended | Yes | Startup only |
| `ANTHROPIC_API_KEY` | **MISSING** | Recommended | Yes | **Yes** |
| `OPENAI_API_KEY` | **MISSING** | Recommended | Yes | **Yes** |
| `GEMINI_API_KEY` | **MISSING** | Recommended | Yes | **Yes** |
| `R2_PUBLIC_URL` | **MISSING** | Recommended | Yes | **Yes** |
| `CF_IMAGE_RESIZING_ENABLED` | **MISSING** | -- | Yes | **Yes** |
| `CF_STREAM_ACCOUNT_ID` | **MISSING** | Recommended | Yes | **Yes** |
| `CF_STREAM_API_TOKEN` | **MISSING** | Recommended | Yes | **Yes** |
| `CF_STREAM_WEBHOOK_SECRET` | **MISSING** | -- | Yes | **Yes** |
| `MEILISEARCH_HOST` | **MISSING** | Recommended | Yes | **Yes** |
| `MEILISEARCH_API_KEY` | **MISSING** | -- | Yes | **Yes** |
| `RESEND_API_KEY` | **MISSING** | -- | Yes | **Yes** |
| `SENTRY_DSN` | **MISSING** | Recommended | Yes | **Yes** |
| `INTERNAL_SERVICE_KEY` | **MISSING** | -- | Yes | **Yes** |
| `INTERNAL_WEBHOOK_SECRET` | **MISSING** | -- | Yes | **Yes** |
| `EXPO_ACCESS_TOKEN` | **MISSING** | -- | Yes | **Yes** |
| `APP_URL` | **MISSING** | -- | Yes | **Yes** |
| `API_URL` | **MISSING** | -- | Yes | **Yes** |
| `CORS_ORIGINS` | **MISSING** | Recommended | Yes | **Yes** |
| `GOLD_PRICE_PER_GRAM` | **MISSING** | -- | Yes | **Yes** |
| `SILVER_PRICE_PER_GRAM` | **MISSING** | -- | Yes | **Yes** |
| `EMAIL_FROM` | **MISSING** | -- | **MISSING** | **Yes** |
| `FIELD_ENCRYPTION_KEY` | **MISSING** | -- | **MISSING** | **Yes** |
| `STICKER_AI_MODEL` | **MISSING** | -- | **MISSING** | **Yes** |
| `TOTP_ENCRYPTION_KEY_OLD` | **MISSING** | -- | **MISSING** | Yes (rotation) |
| `DIRECT_DATABASE_URL` | **MISSING** | -- | Yes | Prisma internal |
| `NESTJS_INTERNAL_URL` | -- | -- | Yes | Not by API |
| `NESTJS_BASE_URL` | -- | -- | Yes | Not by API |
| `TRANSPARENCY_SIGNING_KEY` | -- | -- | Yes | Not by API |
