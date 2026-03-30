# Wave 10 Verification — Infrastructure

**Agents:** 5 (K01-K05) | **Files:** 5 | **Empty:** 0

| Agent | Bytes | Focus |
|-------|-------|-------|
| K01 | 15,176 | CI Pipeline |
| K02 | 16,831 | Environment & Secrets |
| K03 | 21,300 | Cron Jobs |
| K04 | 16,193 | Queue Processing |
| K05 | 13,570 | Docker & Deployment |

## Key Criticals
- K01: LiveKit Go tests (123) and Signal tests (633) missing from CI
- K02: Real credentials in local .env, google-services.json committed to git
- K03: Counter reconciliation SQL uses wrong table names (Prisma model vs @@map)
- K04: Webhook HMAC secret stored plaintext in Redis job data
- K05: `prisma db push --accept-data-loss` in production railway.json
