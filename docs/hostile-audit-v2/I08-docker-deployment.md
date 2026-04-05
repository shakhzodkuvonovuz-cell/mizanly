# I08 - Docker & Deployment Configuration Audit

**Scope:** `docker-compose.yml`, all `Dockerfile`s, `.dockerignore`, `railway.json`, env var handling, inter-service auth, health checks, Go version consistency.

**Date:** 2026-04-05

---

## CRITICAL

### I08-C01: API Dockerfile healthcheck hits admin-only endpoint (will always fail)
- **File:** `apps/api/Dockerfile:49`
- **What:** `HEALTHCHECK CMD wget -qO- http://localhost:3000/api/v1/health || exit 1`
- **Problem:** The `GET /api/v1/health` endpoint requires admin auth (`OptionalClerkAuthGuard` + role check). Unauthenticated requests get `403 Forbidden`. The Docker healthcheck has no auth token, so it will ALWAYS fail, causing Docker to mark the container as unhealthy and potentially restart it in a loop.
- **Railway:** Railway uses `/api/v1/health/ready` (from `railway.json`), which is unauthenticated -- so Railway deployment works fine. But anyone running `docker-compose up --profile app` or deploying with Docker Swarm/Kubernetes using the Dockerfile's built-in healthcheck will get perpetual restarts.
- **Fix:** Change to `wget -qO- http://localhost:3000/api/v1/health/ready || exit 1` (the unauthenticated readiness endpoint) or `http://localhost:3000/api/v1/health/live` (the liveness endpoint).

### I08-C02: Docker Compose `depends_on` without health conditions -- race conditions on startup
- **File:** `docker-compose.yml:44-48, 66-69, 83-86`
- **What:** All three app services (`api`, `e2e-server`, `livekit-server`) use bare `depends_on` without `condition: service_healthy`.
- **Problem:** Docker Compose starts dependent services as soon as the dependency *container* starts, not when the dependency is *ready*. PostgreSQL takes 2-5 seconds to accept connections after container start. The API, e2e-server, and livekit-server will crash-loop on first boot because they try to connect before Postgres is listening.
- **Mitigation:** `restart: unless-stopped` will eventually bring them up after Postgres is ready, but this causes noise in logs and unnecessary restarts.
- **Fix:** Add healthchecks to postgres/redis/meilisearch services and use `depends_on: { postgres: { condition: service_healthy } }`.

### I08-C03: Redis has NO password in Docker Compose -- any container on the network can read/write
- **File:** `docker-compose.yml:19-22`
- **What:** Redis runs without `--requirepass`. The connection strings used by all services are `redis://redis:6379` with no auth.
- **Problem:** In local dev this is acceptable. But if anyone deploys this compose file to a server (staging, demo, etc.), every container on the default Docker bridge network can read and write Redis. Redis stores rate-limit state, sessions, and cache -- an attacker on the network could bypass rate limits, inject cache entries, or read session data.
- **Note:** Production uses Upstash (which has auth), so this is a local-dev-only risk. But the compose file is the only local development setup -- it should model production security.
- **Fix:** Add `--requirepass ${REDIS_PASSWORD:-mizanly_dev_redis}` to the Redis command and update all `REDIS_URL` values to include the password.

---

## HIGH

### I08-H01: Docker Compose Go services missing MOST required env vars
- **File:** `docker-compose.yml:71-73, 88-90`
- **What:** The `e2e-server` service only gets `DATABASE_URL` and `REDIS_URL`. It's missing: `CLERK_SECRET_KEY`, `NESTJS_INTERNAL_URL`, `INTERNAL_WEBHOOK_SECRET`, `TRANSPARENCY_SIGNING_KEY`, `SENTRY_DSN`, `PORT`.
- **What:** The `livekit-server` service only gets `DATABASE_URL` and `REDIS_URL`. It's missing: `CLERK_SECRET_KEY`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_HOST`, `NESTJS_BASE_URL`, `INTERNAL_SERVICE_KEY`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET`, `R2_ENDPOINT`, `SENTRY_DSN`, `PORT`.
- **Impact:** Running `docker-compose --profile app up` will start Go services that immediately fail auth (no Clerk key), can't send push notifications (no NestJS URL/key), can't issue LiveKit tokens (no LiveKit credentials), and can't store call recordings (no R2 credentials). The services will appear "running" but almost every endpoint returns 500.
- **Fix:** Add all required env vars with `${VAR:-default}` fallback syntax, or reference an `.env` file.

### I08-H02: API Dockerfile uses `node:20-alpine` without SHA256 pin -- supply chain risk
- **File:** `apps/api/Dockerfile:2, 29`
- **What:** `FROM node:20-alpine AS builder` -- no digest pin.
- **Problem:** Go Dockerfiles pin images with `@sha256:...` digests. The API Dockerfile does not. A compromised Docker Hub mirror or tag push could inject a malicious base image. In a project this security-conscious (Signal Protocol, AEAD everywhere), the base image for the REST API should be equally pinned.
- **Note:** Both `apps/e2e-server/Dockerfile` and `apps/livekit-server/Dockerfile` correctly pin both builder and runtime images with SHA256 digests. Only the API Dockerfile is unpinned.
- **Fix:** Pin to a specific `node:20-alpine@sha256:...` digest for both builder and runner stages.

### I08-H03: No resource limits on any Docker Compose service -- single service can OOM the host
- **File:** `docker-compose.yml` (all services)
- **What:** No `mem_limit`, `cpus`, `deploy.resources`, or equivalent on any service.
- **Problem:** A memory leak in the API or an unbounded query could consume all host memory, killing other services. Redis is partially protected (256MB maxmemory), but PostgreSQL and all app services have no limits.
- **Fix:** Add `deploy.resources.limits` or `mem_limit` + `cpus` to each service.

### I08-H04: Meilisearch master key has weak default value
- **File:** `docker-compose.yml:29`
- **What:** `MEILI_MASTER_KEY: ${MEILI_MASTER_KEY:-mizanly_dev_master_key}`
- **Problem:** The default master key is a predictable string. If someone runs this compose on a network-exposed machine without overriding the env var, Meilisearch is accessible with a known key. This grants full read/write access to the search index (user content, messages, etc.).
- **Fix:** Use a randomly generated default or force the user to set it (remove the `:-` default).

---

## MEDIUM

### I08-M01: Node.js version mismatch -- Dockerfile uses Node 20, CI uses Node 22
- **File:** `apps/api/Dockerfile:2` (node:20), `.github/workflows/ci.yml:24` (node-version: 22)
- **What:** CI tests and typechecks against Node 22, but the Docker image runs Node 20.
- **Problem:** Code that works on Node 22 might use APIs not available in Node 20 (e.g., `Array.fromAsync`, `Symbol.dispose`, `navigator` global). Tests pass in CI but the Docker image crashes at runtime. Production on Railway uses Nixpacks which auto-detects the Node version from `engines` in package.json -- this may be yet another different version.
- **Fix:** Align Dockerfile to use `node:22-alpine` or pin a specific version in all three locations (Dockerfile, CI, package.json `engines`).

### I08-M02: Docker Compose API service missing critical env vars
- **File:** `docker-compose.yml:50-57`
- **What:** The API service gets DATABASE_URL, REDIS_URL, MEILISEARCH_HOST, MEILISEARCH_API_KEY, NODE_ENV. Missing: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `INTERNAL_SERVICE_KEY`, `INTERNAL_WEBHOOK_SECRET`, `R2_*`, `SENTRY_DSN`, `RESEND_API_KEY`, `EXPO_ACCESS_TOKEN`, `TOTP_ENCRYPTION_KEY`, etc.
- **Impact:** The API starts but auth, payments, file storage, email, push notifications, inter-service communication all fail.

### I08-M03: No Docker Compose network isolation -- all services share default bridge
- **File:** `docker-compose.yml` (no `networks:` section)
- **What:** All services run on the default bridge network. Every container can reach every other container on any port.
- **Problem:** The API should talk to Postgres, Redis, Meilisearch. The Go services should talk to Postgres and Redis. But there's no reason for Meilisearch to reach the Go services or vice versa.
- **Fix:** Define separate networks (e.g., `backend`, `data`) and assign services to only the networks they need.

### I08-M04: No security hardening on Docker Compose services
- **File:** `docker-compose.yml` (all services)
- **What:** No `read_only: true`, no `security_opt: [no-new-privileges:true]`, no `tmpfs` mounts, no capabilities dropped.
- **Problem:** If a container is compromised, the attacker has full filesystem write access, can escalate privileges, and potentially escape to the host.
- **Fix:** Add `read_only: true` + `tmpfs: [/tmp]` + `security_opt: [no-new-privileges:true]` to all services.

### I08-M05: Go Dockerfiles copy entire source directory including potential secrets
- **File:** `apps/e2e-server/Dockerfile:5`, `apps/livekit-server/Dockerfile:6`
- **What:** `COPY . .` in the builder stage copies everything not excluded by `.dockerignore`.
- **Problem:** The `.dockerignore` files exclude `.env*` files, but any other secret files (private keys, service account JSONs, etc.) that aren't explicitly listed will be baked into the builder layer. Although the multi-stage build means only the final binary goes to the runtime image, the builder layer is still cached and can be extracted.
- **Note:** The `.dockerignore` for both Go services excludes `.env*`, `*.md`, `*_test.go`, `.git`, `.dockerignore`. This is reasonable but not exhaustive.
- **Fix:** Invert the `.dockerignore` pattern: deny everything by default (`*`), then allow only `go.mod`, `go.sum`, `cmd/`, `internal/`.

### I08-M06: PostgreSQL data directory has no backup strategy in Docker Compose
- **File:** `docker-compose.yml:14`
- **What:** `postgres_data:/var/lib/postgresql/data` is a named volume with no backup configuration.
- **Problem:** `docker-compose down -v` destroys all data permanently. For local dev this is a known limitation, but there's no documentation warning about it.

### I08-M07: Docker Compose e2e-server and livekit-server share the same database
- **File:** `docker-compose.yml:72, 89`
- **What:** Both Go services connect to `postgres:5432/mizanly` -- the same database as the API.
- **Problem:** In production, these services connect to Neon databases (potentially separate). The Docker Compose setup uses a single shared database, which means schema conflicts are possible if the Go services create tables with the same names as Prisma models. There's no migration mechanism for the Go services' tables in the compose setup.

---

## LOW

### I08-L01: PostgreSQL default user "mizanly" with dev password visible in compose file
- **File:** `docker-compose.yml:9`
- **What:** `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-mizanly_dev}` -- the default password is in the committed file.
- **Problem:** Default password in source control. Low severity because ports are bound to `127.0.0.1` and this is dev-only.

### I08-L02: Meilisearch using `development` environment
- **File:** `docker-compose.yml:30`
- **What:** `MEILI_ENV: development` enables detailed error messages and debug info.
- **Problem:** If compose is accidentally used in staging/production, verbose error messages leak internal information.

### I08-L03: Docker Compose has no `version` key -- relies on Docker Compose V2 auto-detection
- **File:** `docker-compose.yml`
- **What:** No `version: "3.x"` at top of file.
- **Problem:** Docker Compose V1 will fail to parse this file. V2 auto-detects. Not a real issue for modern setups, but older CI runners or team members with V1 will see cryptic errors.

### I08-L04: Go service Dockerfiles install `ca-certificates` but don't verify TLS in HEALTHCHECK
- **File:** `apps/e2e-server/Dockerfile:17-18`, `apps/livekit-server/Dockerfile:18-19`
- **What:** Healthcheck uses `wget -qO- http://localhost:8080/health` (HTTP, not HTTPS).
- **Problem:** This is correct for internal healthchecks (no TLS on localhost), but worth noting that the services themselves should enforce TLS for external traffic. The healthcheck is fine as-is.

---

## INFO

### I08-I01: Inter-service authentication uses two different key names
- **What:** Livekit-server uses `INTERNAL_SERVICE_KEY` + `X-Internal-Key` header to call NestJS push endpoint. E2e-server uses `INTERNAL_WEBHOOK_SECRET` + HMAC to call NestJS identity-change webhook.
- **Problem:** Two different secret names and two different auth mechanisms for similar inter-service communication. Not a bug, but confusing for operators. A unified inter-service auth approach would be cleaner.

### I08-I02: Railway healthcheck paths are correct and match endpoints
- **Status:** GOOD. Railway uses `/api/v1/health/ready` (API), `/health` (e2e-server), `/health` (livekit-server). All endpoints exist and are unauthenticated.

### I08-I03: All Dockerfiles run as non-root user
- **Status:** GOOD. All three Dockerfiles create an `app` user and switch to it via `USER app`.

### I08-I04: All Go Dockerfiles use multi-stage builds with stripped binaries
- **Status:** GOOD. `CGO_ENABLED=0`, `-ldflags="-s -w"`, final stage is alpine with only the binary.

### I08-I05: All Docker Compose ports bound to 127.0.0.1
- **Status:** GOOD. All port mappings use `'127.0.0.1:PORT:PORT'` syntax, preventing external access.

### I08-I06: Docker Compose app services use `profiles: [app]`
- **Status:** GOOD. App services won't start with plain `docker-compose up` -- requires `--profile app`. Infrastructure services (postgres, redis, meilisearch) start by default.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 3 |
| HIGH | 4 |
| MEDIUM | 7 |
| LOW | 4 |
| INFO | 6 |
| **Total** | **24** |
