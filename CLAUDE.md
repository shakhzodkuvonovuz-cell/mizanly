# Mizanly

NestJS monorepo: `apps/api` + `apps/mobile` (Expo SDK 52) + `apps/e2e-server` (Go)
Prisma ORM, PostgreSQL (Neon), Redis (Upstash), Clerk auth, Cloudflare R2

## Build & Test
```bash
cd apps/api && npm test                     # API tests
cd apps/mobile && npx tsc --noEmit          # Mobile typecheck
cd apps/mobile && npx jest --config src/services/signal/__tests__/jest.config.js  # Signal tests
cd apps/mobile && npx jest --config src/hooks/__tests__/jest.config.js            # LiveKit call tests (49 tests)
cd apps/e2e-server && go test ./internal/... -v  # Go E2E server tests
cd apps/livekit-server && go test ./internal/... -v  # Go LiveKit server tests (123 tests)
```

## Integrity Rules

- NEVER say "done", "fixed", "complete", "working", or "implemented" without showing test output that proves it.
- If you cannot verify, say: "Changes made but NOT verified."
- If you are guessing, say: "I am not certain — this is my best guess."
- If you want to stop, say: "I've completed X of Y. Remaining: [list]." Stopping honestly is always acceptable.
- NEVER do 3 of 10 items and say "and similar changes for the rest." Do all 10 or list what remains.
- NEVER silently swallow errors. If tests fail after your change, that is your regression — fix it before reporting.
- After every code change: run affected tests. If any fail, fix before reporting. Report format: "Changes: [list]. Tests: [pass/fail]. Remaining: [list or none]."
- Prefer saying "I don't know" over a confident wrong answer.

## Code Patterns
- Follow existing module patterns. Read neighboring files first.
- Strict typing everywhere. No `any` in non-test code.
- All errors explicit, never silently swallowed.
- No `@ts-ignore`, no `@ts-expect-error`. Fix the actual type.

## Language Choice Rule
- **TypeScript was the fast-start choice. At ~300K LOC it's legacy for scale-sensitive paths.**
- For any NEW component that will bottleneck at scale, use the proper language:
  - **Real-time / high-concurrency:** Elixir (BEAM VM)
  - **CPU-bound / background workers:** Go
  - **Crypto / memory-sensitive:** Rust
  - **REST API CRUD / mobile UI:** TypeScript stays (DB is the bottleneck, not the framework)
- Do NOT default to TypeScript for new services. Ask: "Will this be a bottleneck at 10M users?"

## What NOT to Do
- Do not refactor files beyond the scope of the task.
- ALWAYS commit after completing a logical batch of work (every 5-15 fixes, every completed module, every wave). Do NOT wait to be asked — commit proactively with descriptive messages. Push when a natural batch is done.
- Do not use Sonnet or Haiku as subagent models. Opus only.
- Do not add Co-Authored-By or AI references in commits.

## Architecture (brief)
```
apps/api/          — NestJS 10, ~80 modules, ~200 Prisma models
apps/mobile/       — React Native Expo SDK 52, 213 screens
apps/e2e-server/   — Go E2E Key Server (Signal Protocol)
apps/livekit-server/ — Go LiveKit Call Server (16 endpoints, 123 tests)
```

## E2E Encryption — Current State (Session 13, 2026-03-28)

**Grade: A+** (5 audit rounds, 70 findings, 65 fixed in code)

### What's built
- Signal Protocol: X3DH + Double Ratchet + Sender Keys + Sealed Sender + PQXDH
- XChaCha20-Poly1305 AEAD (hardware-accelerated via react-native-quick-crypto C++ JSI)
- HMAC-hashed MMKV key names (social graph invisible at rest)
- Per-value AEAD on ALL MMKV stores (message cache, search index, sessions, queue)
- Ed25519-signed transparency root (client verifies hardcoded public key)
- Sealed sender on all 1:1 messages (server can't see sender from socket metadata)
- ML-KEM-768 post-quantum hybrid (PQXDH) — version negotiation [1, 2]
- 633 tests across 16 suites, 0 failures

### What's NOT done (external blockers)
- **F6:** No EAS build yet — cert pinning configured but never enforced (needs Apple Developer $99)
- **F15:** Device attestation stubs ready but Play Integrity / App Attest need native modules + device
- **F32/F33:** Formal verification (Tamarin/ProVerif) + professional audit (Cure53/NCC) — $50-100K
- **Zero real-device testing.** All E2E code is untested on actual hardware.

### Key files
- `apps/mobile/src/services/signal/` — 22 files, ~10K lines TypeScript
- `apps/e2e-server/` — Go key server, 13 endpoints
- `apps/api/src/gateways/chat.gateway.ts` — sealed sender persistence
- `docs/audit/2026-03-28-e2e-deep-audit-v3.md` — original 33 findings

### Crypto performance (with react-native-quick-crypto installed)
- AEAD, HKDF, HMAC, SHA-256: OpenSSL C++ via JSI (10-50x faster than pure JS)
- constantTimeEqual: CRYPTO_memcmp (hardware-guaranteed, not JIT-vulnerable)
- zeroOut: OPENSSL_cleanse (defeats dead-store elimination)
- Fallback: @noble/* pure JS when native unavailable (Jest, Expo Go)

## LiveKit Calling System — Current State (Sessions 14-15, 2026-03-29)

### Architecture
```
Mobile (useLiveKitCall hook)  ←WebRTC→  LiveKit Cloud (SFU)  ←webhooks→  Go livekit-server
        ↕ CallKit/ConnectionService                                          ↕ pgx (Neon DB)
        ↕ activeRoomRegistry                                                 ↕ HTTP→ NestJS (push)
```

### What's built
- Go server: 16 endpoints (rooms, token, leave, kick, mute, egress, ingress, webhooks, history, active, session), 123 tests
- Mobile hook: `useLiveKitCall` — Room lifecycle, SFrame E2EE, Krisp noise filter, media controls, data channels, speaker toggle, screen share
- CallKit/ConnectionService: `callkit.ts` — native call UI, cold-start event queue, caller/callee role tracking, lock-screen end → Room disconnect
- `activeRoomRegistry.ts` — zero-dependency bridge between CallKit (module scope) and React hook (Room ref)
- Call screen: `VideoTrack` component, adaptive group grid with speaker spotlight, 30s ring timeout, callee-side poll timeout, vibration, quality indicator, E2EE verification overlay, reactions, raise hand, `useKeepAwake`
- `CallActiveBar` — floating green bar when navigating away during active call
- NestJS `InternalPushController` — Go→NestJS server-to-server push for incoming call + missed call notifications
- `leaveRoom` endpoint — callee leaves without destroying the room (group calls survive)
- Per-session E2EE salt (16 bytes, crypto/rand) — domain separation for SFrame ratcheting
- Key material zeroing (`Uint8Array.fill(0)`) after handoff to native KeyProvider
- E2EE failure aborts call entirely — no silent downgrade to unencrypted
- Caller name resolved from DB for push notifications (not just user ID)
- Composite cursor pagination (createdAt + id) for call history

### Key files
- `apps/mobile/src/hooks/useLiveKitCall.ts` — core hook (~700 lines)
- `apps/mobile/app/(screens)/call/[id].tsx` — call UI screen
- `apps/mobile/src/services/callkit.ts` — CallKit/ConnectionService integration
- `apps/mobile/src/services/livekit.ts` — API client for Go server
- `apps/mobile/src/services/activeRoomRegistry.ts` — Room cleanup bridge
- `apps/mobile/src/components/ui/CallActiveBar.tsx` — floating call bar
- `apps/livekit-server/` — Go service (handler, store, middleware, config, model)
- `apps/api/src/modules/notifications/internal-push.controller.ts` — server-to-server push
- `docs/plans/2026-03-29-livekit-calling-design.md` — architecture decisions
- `docs/plans/2026-03-29-livekit-implementation-plan.md` — original task plan

### Test counts
- Go livekit-server: 123 tests (handler 105, config 10, middleware 5, request ID 3)
- Mobile TS: 49 tests (base64 7, SAS emojis 7, emoji derivation 6, key zeroing 2, activeRoomRegistry 5, callkit 22)
- API: 6 tests (internal push controller auth, delivery, cap, failure)

### What's NOT done (blocked on Apple Developer $99)
- **Zero runtime testing.** Everything compiles and passes unit tests. No call has ever been placed on a real device.
- **VoIP Push (PushKit iOS).** Regular push notifications do NOT trigger CallKit's native ringtone. Need VoIP push entitlement for proper incoming call experience with system ringtone.
- **EAS build.** LiveKit, CallKit, Krisp all require `expo-dev-client`. Cannot run in Expo Go.
- **Cert pinning.** Configured but never enforced without a signed build.

### Runtime verification checklist (first EAS build)
| Item | What to verify |
|------|---------------|
| `room.connect()` → media flowing | Audio/video actually works between two devices |
| `RNE2EEManager` + `RNKeyProvider` | SFrame encryption activates, emoji verification matches |
| `AudioSession.selectAudioOutput('force_speaker')` | Speaker toggle works on both iOS and Android |
| `KrispNoiseFilter()` | Noise suppression activates on LiveKit Cloud |
| `VideoTrack` component | Renders video, `iosPIP` works on iOS 15+ |
| `publication.mute()`/`unmute()` on background | Camera pauses/resumes without black-frame flash |
| `RNCallKeep.displayIncomingCall` | Native call UI appears with caller name |
| Cold start answer queue | Kill app → receive call → answer → navigates to call screen |
| `disconnectActiveRoom()` from lock screen | End from lock screen → Room disconnects + mic stops |
| 30s ring timeout (caller) | Auto-cancels, callee gets missed call push |
| 45s poll timeout (callee) | Detects caller hangup, navigates back |
| `HandleLeaveRoom` | Callee leaves group call without killing it for others |
| Group call grid | 3+ people → speaker spotlight layout renders correctly |
| `CallActiveBar` | Navigate away during call → green bar shows, tap returns |

### Deferred code items (not blocked, lower priority)
| Item | Effort | Notes |
|------|--------|-------|
| Bundled ringtone .mp3 | Small | Find/create royalty-free tone, play via expo-av for foreground calls |
| Token refresh for 2h+ calls | Medium | LiveKit `TokenSource` or manual refresh timer before TTL expiry |
| Call waiting (second incoming) | Medium | Handle CallKit transition, disconnect old Room, accept new |
| WebRTC stats collection | Medium | `room.localParticipant.getStats()` → Sentry/analytics dashboard |
| Call recording consent UI | Small | Toast/modal when someone starts recording, notify all participants |
| Screen share iOS broadcast extension | Large | Requires App Group config + native broadcast upload extension |
| Android PiP for video calls | Medium | Native Activity PiP mode via custom expo native module |
| State machine extraction | Medium | Extract `useLiveKitCall` logic into pure `callStateMachine.ts` for Jest testing |
| True E2EE via ECDH | Large | See "Call Encryption" section in Technical Debt below |

## Scale Rewrite Roadmap — Complete (0 → 100M users)

Every component listed in the order it breaks. Don't rewrite ahead of schedule — fix what's about to break, not what might break in 2 years.

### Tier 0: Ship What Exists (0-50K users)
NestJS monolith + Go E2E server + Go LiveKit server. Current stack handles this. No rewrites.

### Tier 1: First Things That Break (50-100K concurrent users)

| # | Component | Current | Rewrite to | Why it breaks | Effort |
|---|-----------|---------|------------|---------------|--------|
| 1 | **WebSocket Gateway** | NestJS Socket.io (TS) | Elixir/Phoenix Channels | Node.js: 10KB/connection, single-threaded fan-out. 100K concurrent = 1GB + event loop blocked. BEAM VM: 2KB/process, preemptive scheduling. WhatsApp ran 2M/server on Erlang. | 1-2 sessions |
| 2 | **Presence System** | Redis Hash (per-user) | Elixir Presence (CRDT) | Redis presence: write on connect, poll for changes. Elixir Presence: built-in CRDT, zero Redis round-trips, auto-tracks joins/leaves across cluster. Bundled with #1. | Bundled with #1 |
| 3 | **API Gateway/Proxy** | NestJS handles everything | Nginx/Caddy reverse proxy in front of NestJS | TLS termination, request routing, static files, DDoS mitigation should be at proxy layer, not in Node.js. | Config only |

**Moves to Elixir:** `chat.gateway.ts`, socket auth, typing indicators, presence, read receipts (~1,000 lines TS → ~500 lines Elixir)
**Stays in NestJS:** ALL REST API endpoints, Prisma queries, business logic, auth, payments, notifications

### Tier 2: Media + CDN (100-500K users)

| # | Component | Current | Rewrite to | Why it breaks | Effort |
|---|-----------|---------|------------|---------------|--------|
| 4 | **Media CDN** | Cloudflare R2 direct URLs | R2 + Cloudflare Workers + Image Resizing + edge cache | Raw R2 URLs: no resizing, no edge caching. Every image served at full resolution from origin. Workers: on-the-fly resize, edge-cached globally. | 1 session |
| 5 | **Counter System** | Prisma increment/decrement (non-atomic) | Redis atomic counters + periodic PostgreSQL sync | Every like/view/share = PostgreSQL UPDATE on hot row. At scale: thousands of conflicting UPDATEs/second. Redis INCR: atomic, millions/second. Sync to PG every minute. | 1 session |
| 6 | **Database Read Replicas** | Single Neon instance | Neon with read replicas | One PG handles reads AND writes. Feed queries (reads) overwhelm write capacity. Split: writes → primary, reads → replica. | Config only |

### Tier 3: CPU-Bound Workers (100K-500K users)

| # | Component | Current | Rewrite to | Why it breaks | Effort |
|---|-----------|---------|------------|---------------|--------|
| 7 | **Feed Scoring** | NestJS (TS, single-core) | Go service | Feed ranking: score calc, engagement decay, content boosting. Node does it on 1 core. Go uses all cores with goroutines. | 1-2 sessions |
| 8 | **Push Notification Fan-out** | NestJS synchronous | Go worker | 1 message in 500-person group = 500 push deliveries. Node blocks event loop. Go handles concurrent I/O natively. | 1 session |
| 9 | **Media Processing** | NestJS queue (currently dead code) | Go worker | EXIF stripping, BlurHash generation, thumbnail creation, resize variants. CPU-bound, needs parallelism. | 1 session |
| 10 | **Content Moderation Pipeline** | Synchronous in request path | Go worker + ML model serving | moderateText() in API request adds 200-500ms. Move to async: create immediately, moderate in background, remove if flagged. | 1-2 sessions |
| 11 | **Video Transcoding** | ffmpeg-kit on client (mobile) | Server-side Go/Rust worker | Client-side: drains battery, inconsistent quality. Server-side: upload raw, transcode to 360p/720p/1080p, adaptive bitrate streaming. | 1-2 sessions |

### Tier 4: Architecture (1-5M users)

| # | Component | Current | Rewrite to | Why it breaks | Effort |
|---|-----------|---------|------------|---------------|--------|
| 12 | **Notification Service** | NestJS synchronous (21 services inject it) | Event bus (NATS/Kafka) + Go consumer | God-dependency: 21 services call NotificationsService synchronously. One slow notification blocks the request. Event-driven: emit events, consume async. | 2 sessions |
| 13 | **Analytics Pipeline** | Redis list (no consumer, no TTL) | ClickHouse + Go ingest worker | Analytics events pile up in Redis with no consumer (audit finding). Need proper time-series DB. ClickHouse handles billions of events. | 1-2 sessions |
| 14 | **Search** | Meilisearch (single instance) | Meilisearch cluster OR Elasticsearch/Typesense | Single instance can't handle 10M+ documents with 100K concurrent searches. Need sharding or distributed engine. | 1 session (config) |
| 15 | **Queue System** | BullMQ (Redis-backed) | RabbitMQ or NATS JetStream | BullMQ fine for small scale. Millions of jobs/day: need persistent queues, dead-letter routing, backpressure. | 1 session |
| 16 | **Auth** | Clerk (third-party) | Self-hosted (Ory Kratos or custom) | Clerk costs ~$2K/month at 500K users, ~$10K/month at 5M. Self-hosted eliminates cost + removes third-party from privacy-critical path. | 2-3 sessions |
| 17 | **Email** | Resend | AWS SES or Postmark | Resend pricing at millions of emails/month. SES: $0.10/1000 emails, 10x cheaper. | Config only |

### Tier 5: Security Hardening (500K-5M users)

| # | Component | Current | Rewrite to | Why it breaks | Effort |
|---|-----------|---------|------------|---------------|--------|
| 18 | **Signal Protocol Core** | TypeScript (@noble/*) | Rust (libsignal FFI) | JS strings immutable, GC unpredictable, key material leaks to heap. Rust: zero-copy, deterministic memory, no GC. What Signal themselves use. react-native-quick-crypto handles 90% of perf already — Rust is for forensics-grade key hygiene. | 2-3 sessions |
| 19 | **Rate Limiting** | Redis Lua scripts (Upstash) | Go service with local state + Redis sync | Every API request hits Redis for rate check. At 100K RPS = 100K Redis round-trips/second just for rate limiting. Local in-memory limiting with periodic Redis sync cuts Redis load 90%. | 1 session |

### Tier 6: Database Scale (10-50M users)

| # | Component | Current | Rewrite to | Why it breaks | Effort |
|---|-----------|---------|------------|---------------|--------|
| 20 | **Database Sharding** | Single PostgreSQL | Citus (distributed PG) or app-level sharding | Single PG maxes at ~10TB / 100K queries/second. Messages table alone: billions of rows. Horizontal sharding by conversation_id or user_id. | 2-3 sessions |

### Never Rewrite
| Component | Why | Holds until |
|-----------|-----|-------------|
| NestJS REST API (CRUD) | DB is the bottleneck, not the framework. Rewriting Express to Go saves 2ms on a 50ms DB query. | 100M+ |
| Prisma ORM | Fine for 90% of queries. Raw SQL only for sharded/complex queries. | 100M+ |
| Payments (Stripe) | Third-party, works, no rewrite possible. | Forever |
| Cloudflare (CDN/DNS/WAF) | Already best-in-class. | Forever |
| Mobile UI (React Native) | Only alternative is native Swift + Kotlin = 2x codebase. Not worth it. | Forever |
| Expo | SDK 52 is mature. EAS builds handle everything. | Forever |

### Rewrite Effort Summary
| Tier | When | Sessions | Languages |
|------|------|----------|-----------|
| Tier 1 | 50-100K concurrent | 2-3 | Elixir, config |
| Tier 2 | 100-500K users | 2-3 | Config, Go |
| Tier 3 | 100K-500K users | 5-8 | Go, Rust |
| Tier 4 | 1-5M users | 8-10 | Go, ClickHouse, config |
| Tier 5 | 500K-5M users | 3-4 | Rust, Go |
| Tier 6 | 10-50M users | 2-3 | PostgreSQL/Citus |
| **Total** | **0 → 100M** | **~22-31 sessions over 2-3 years** | Elixir, Go, Rust, config |

## Known Limitations

### Go microservices: SQL queries untested without real DB
`apps/livekit-server` and `apps/e2e-server` use raw SQL via pgx (no ORM). Unit tests use mock stores that validate handler logic, but the actual SQL (column names, JOINs, transactions) is only verified when deployed against real Neon PostgreSQL. CI integration tests (session 9) catch SQL errors at deploy time, not at build time. If you add new SQL queries, verify them against the real DB before claiming they work.

## Technical Debt — DO NOT FORGET

### Call Encryption: Server-Mediated, Not True E2EE
- Current: Go server generates 32-byte key + 16-byte salt per session, distributes to both parties over HTTPS. SFrame encrypts media client-side. Server briefly holds key material (wiped on call end).
- **What this protects against:** passive network observers, LiveKit Cloud (SFU), CDN/proxy MITM, DB breach of ended calls (keys wiped).
- **What this does NOT protect against:** compromised Mizanly server (generates and knows the key).
- **Path to true E2EE:** ECDH key exchange between clients. Options:
  1. **Quick win (~1 week):** Use LiveKit's built-in key exchange (SFrame keyProvider supports participant-derived keys). Each client generates an ephemeral X25519 keypair, exchanges public keys via LiveKit data channel, derives shared secret. Server never sees the key.
  2. **Full solution (~4 weeks):** Integrate with existing Signal Protocol infrastructure (apps/e2e-server). Use X3DH to establish a session key for calls, same as for messages. Requires call-specific prekey bundles.
  3. **Not needed until:** professional security audit demands it. Current server-mediated approach is standard for LiveKit deployments and matches Zoom/Teams/Meet trust model.

### Call Hook: No Automated State-Machine Tests
- `useLiveKitCall` hook can't be tested in Jest — `@livekit/react-native` requires native modules.
- Utilities (base64, emoji derivation, active room registry) ARE tested (49 tests).
- **Path to testability:**
  1. Extract state machine logic into a pure `callStateMachine.ts` (no native deps). Hook becomes a thin wrapper.
  2. Test the state machine directly: idle→creating→ringing→connecting→connected→ended, plus all error/timeout paths.
  3. Estimated effort: ~1 day refactor + ~1 day tests.
- **Workaround until then:** real-device E2E test via Detox or Maestro covering the outgoing→answer→hangup flow.

### Media Speed (NOT Telegram-fast yet)
- **Crypto is fast** — react-native-quick-crypto makes encrypt/decrypt ~5-20ms for 5MB (was ~200-500ms)
- **Network is the bottleneck** — R2 upload/download is ~1-3s on 4G, unchanged by crypto speedup
- To match Telegram's perceived speed, need:
  - **Progressive image loading** — show blurry thumbnail instantly, sharpen as data arrives
  - **Pre-upload during compose** — start uploading while user types caption (before tap send)
  - **Cloudflare CDN edge caching** — R2 + Workers for global edge delivery
  - **Streaming decrypt + display** — start showing media before full download completes
- Current total: ~2-3s for 5MB photo (crypto fast, network slow). Telegram: <1s (custom CDN + pre-upload)

### Call E2EE: base64 key string on JS heap (~5-30s window)
- `connectToRoom` receives the E2EE key as a base64 string parameter. JS strings are immutable — cannot be zeroed.
- The decoded `Uint8Array` IS zeroed after handoff to native `RNKeyProvider` (F5 fix).
- The base64 string becomes unreachable after `connectToRoom` returns; V8 Scavenger GCs it within 5-30s.
- **Exploitable only by:** root/jailbreak + memory dump during active call. Not remote-exploitable.
- **Fix:** Small JSI C++ module (~2-3 days) that receives base64, decodes, configures SFrame, zeroes — never touches JS heap. Or defer to Rust core rewrite at 500K+ users.

### External Blockers (no code fix possible)
- Apple Developer enrollment ($99) → EAS build → cert pinning activates → TestFlight
- Device attestation (Play Integrity / App Attest) → needs native modules + device
- Formal verification (Tamarin/ProVerif) → $50-100K project
- Professional audit (Cure53/NCC/Trail of Bits) → $50-100K
- Zero real-device testing — all E2E code untested on actual hardware

## Post-Fix Testing Roadmap

### Launch Sequence
1. Fix all audit findings (~2,500 across 13 waves)
2. Re-audit (quick verification pass)
3. Apple Developer ($99) → App icon → EAS build → TestFlight
4. Simulated user testing (below)
5. Beta with real users (50-100 from waitlist)

### AI-Driven Testing Agents (simulate real human behavior)
These tools SEE the screen and decide what to tap — no scripted flows. They explore like real users, finding bugs scripts never would.

| Tool | What It Does | Best For |
|------|-------------|----------|
| **QA Wolf** | AI agents explore app autonomously, see UI, make decisions, find bugs | Managed E2E testing service, discovers edge cases |
| **Momentic** | Natural language test instructions ("sign up, post a photo, delete it") — AI figures out the taps | No-script testing, fast test creation |
| **Octomind** | AI generates and maintains E2E tests by understanding UI visually | Auto-discovers flows, self-healing tests |
| **Carbonate** | Natural language → AI executes as real interactions | Plain English test descriptions |
| **Claude Computer Use** | Claude sees screenshots, reasons about UI, clicks like a human. Anthropic's own tool | Point at TestFlight build: "use this app like a Muslim teenager for 30 minutes" |
| **BrowserBase** | Headless browser infrastructure for AI agents — run hundreds of parallel sessions | Pair with Claude Computer Use for scale |
| **Devin / SWE-Agent** | AI coding agents that can also drive browsers/apps | Code-focused but can do UI exploration |
| **AgentQL** | AI-powered web element detection — understands UI semantically, not by selectors | Resilient to UI changes |
| **Magnitude** | AI test agent that plans, executes, and validates test scenarios autonomously | Full autonomous testing pipeline |
| **Shortest (by Vercel)** | Natural language E2E tests powered by AI — "user logs in and creates a post" | Vercel ecosystem, simple setup |

### Scripted E2E Testing (deterministic user flows)
For repeatable regression tests — same flow, every build, guaranteed.

| Tool | What It Does | Best For |
|------|-------------|----------|
| **Maestro** | YAML-based mobile E2E. Built for React Native/Expo. "Tap login, scroll feed, like post" | **#1 pick for Mizanly** — native RN support, fast, reliable |
| **Detox** | Wix's RN testing framework. Gray-box, synchronizes with RN bridge | Deep native integration, CI-friendly |
| **Appium** | Cross-platform Selenium-style. WebDriver protocol | Legacy support, broad device matrix |
| **Playwright** | Microsoft's browser automation. Handles web + PWA | Expo Web testing when PWA launches |

### API Load Testing (simulate thousands of concurrent users)
Stress-test NestJS + Go services + Socket.io gateway before real users hit it.

| Tool | What It Does | Best For |
|------|-------------|----------|
| **k6** | Grafana's load testing. Write tests in JS. "5,000 users hit /feed for 10 minutes" | **#1 pick** — JS-native, tests NestJS directly |
| **Artillery** | YAML config, HTTP + WebSocket mixed load | **Socket.io gateway stress** — test chat.gateway.ts under 10K connections |
| **Locust** | Python-based distributed load testing | Complex user behavior patterns |
| **Gatling** | JVM-based, realistic traffic ramp-up/down curves | Production-like traffic simulation |
| **Vegeta** | Go CLI, constant-rate HTTP load | Finding exact breaking points |
| **autocannon** | Node.js HTTP benchmarking | Quick endpoint benchmarks |
| **oha** | Rust HTTP load generator, beautiful terminal UI | Fast single-endpoint stress |

### Recommended Testing Stack for Mizanly
```
Phase 1 (Post-fix, pre-TestFlight):
  - Maestro: 50 critical user flows (signup → post → chat → call → delete account)
  - k6: Load test top 20 API endpoints at 1K concurrent users

Phase 2 (TestFlight beta):
  - Claude Computer Use: 10 AI agents exploring the app for 1 hour each
  - QA Wolf or Momentic: Ongoing AI-driven regression testing
  - Artillery: WebSocket gateway stress at 5K concurrent connections

Phase 3 (Pre-launch):
  - k6: Full load test at 10K concurrent users
  - Artillery: Socket.io at 50K connections
  - Maestro: 200 flows covering every screen
  - AI agents: "Use this as a 19-year-old Indonesian Muslim during Ramadan"

Phase 4 (DDoS testing & hardening — before public launch):
  - Build Go seed-bot for synthetic load (10K users, concurrent media, viral scenarios)
  - Run DDoS simulation against own infrastructure (see checklist below)
  - Fix every gap found, then re-test

Phase 5 (User acquisition features — post-stability):
  - One Tap Import: Instagram, TikTok, X/Twitter, YouTube, WhatsApp (spec: docs/features/DATA_IMPORT_ARCHITECTURE.md)
  - Goodbye Story: shareable "I've moved to Mizanly" story for old platforms
  - Contact sync: WhatsApp/phone contacts → "X is on Mizanly" suggestions
  - Anti-bot: Play Integrity + App Attest + behavioral scoring (see Layer 2-3 below)
```

### One Tap Import & Goodbye Story
**Spec:** `docs/features/DATA_IMPORT_ARCHITECTURE.md` (236 lines, complete architecture)
**Status:** Zero code built. Schema, parsers, screens all designed but unimplemented.

| Component | What It Does | Effort |
|-----------|-------------|--------|
| **Tier 1: OAuth Import** | Instagram Graph API, TikTok Display API, YouTube Data API, X API v2 → pull public posts/profile | Medium per platform |
| **Tier 2: ZIP Import** | User uploads platform data export ZIP → parse JSON → reconstruct posts in Mizanly | Medium (primary approach, gives 95% of data) |
| **ImportJob model** | Track import progress, source platform, status, error handling | Small |
| **Content mapping** | Instagram posts→Saf, Reels→Bakra, Stories→Stories, DMs→Risalah, Videos→Minbar | Small |
| **"Imported from" badge** | Visual indicator on imported content, prevents confusion with original posts | Small |
| **Feed protection** | Imported posts don't spam followers' For You feed (use `originalCreatedAt`) | Small |
| **ZIP security** | Zip bomb detection, media type validation, size limits, DM import requires explicit consent | Medium |
| **Goodbye Story** | After import → generate shareable story image with stats ("3 years, 487 posts — I'm moving") | Medium |
| **Contact sync** | WhatsApp contacts / phone contacts → match against Mizanly users → "X is here" suggestions | Medium |

**Legal basis:** GDPR Article 20 (data portability) + EU Digital Markets Act (requires Meta/ByteDance to enable portability).

**Build order:** ZIP import first (no API approval needed) → OAuth import second → Goodbye Story → Contact sync.

### DDoS Testing Plan (attack your own infrastructure)
Build a Go tool that simulates every attack vector. Run against staging, never production.

| Test | What It Simulates | Tool | Target |
|------|-------------------|------|--------|
| Volumetric flood | 100K req/s GET /api/v1/feed | k6 / Vegeta | Cloudflare → Railway |
| Slowloris | 10K connections opened, never closed | custom Go | Socket.io gateway |
| Auth spray | 50K login attempts/min with random creds | k6 | /api/v1/auth |
| Register bomb | 10K account creations/min | k6 | Clerk webhook → DB |
| Large payload | 50MB JSON body on every POST endpoint | k6 | NestJS body parser |
| WebSocket flood | 10K socket connections per user | Artillery | chat.gateway.ts |
| Notification bomb | Post in 500 groups simultaneously → 500K notifications | seed-bot | notification fan-out |
| Search abuse | 1K concurrent full-text searches with wildcards | k6 | Meilisearch |
| Media upload flood | 1K concurrent 100MB file uploads | k6 | R2 upload endpoint |
| Webhook replay | Replay 10K Stripe/Clerk webhooks | custom | webhook processor |
| Rate limit bypass | Rotate IPs/tokens to evade per-user throttle | k6 | all endpoints |
| E2E key exhaustion | Drain one-time prekey pools for all users | k6 | Go E2E server |

### Anti-DDoS Hardening Checklist (fix before public launch)

**Edge Layer (Cloudflare):**
- [ ] Upgrade to Cloudflare Pro ($20/mo) — WAF + advanced DDoS + rate limiting at edge
- [ ] WAF rule: block requests > 1MB body (except media upload endpoints)
- [ ] WAF rule: rate limit /api/v1/auth/* to 10 req/min per IP
- [ ] WAF rule: rate limit /api/v1/waitlist/* to 5 req/min per IP
- [ ] Enable Bot Fight Mode (blocks known bot signatures)
- [ ] Enable Under Attack Mode toggle (5s JS challenge during active attack)
- [ ] Configure Page Rules: cache static assets aggressively

**API Layer (NestJS):**
- [ ] Global body size limit: 1MB default, 100MB for media upload only
- [ ] `@Throttle()` on ALL mutation endpoints (25+ currently missing — audit finding)
- [ ] Per-IP rate limiting on unauthenticated endpoints (register, login, waitlist)
- [ ] Request timeout: 30s for API, 120s for media upload
- [ ] Helmet middleware: security headers on all responses
- [ ] CORS: strict origin whitelist (no wildcard)
- [ ] Abuse detection: flag users with > 1K requests/hour

**WebSocket Layer (Socket.io):**
- [ ] Max 3 connections per user (audit finding — already implemented)
- [ ] Connection rate limit: max 5 new connections/min per IP
- [ ] Message rate limit: already done (13 events rate-limited)
- [ ] Payload size limit on socket messages (max 64KB)
- [ ] Disconnect idle connections after 5 minutes of no activity

**Database Layer:**
- [ ] Connection pool limits (Neon pooler handles this)
- [ ] Query timeout: 10s max
- [ ] Read replica for feed queries (when at 50K+ users)
- [ ] Redis connection limits + maxmemory policy

**Go Services:**
- [ ] Rate limiter fails CLOSED on Redis error (already fixed — audit finding)
- [ ] Request body limit: 1MB
- [ ] Context timeout on all external calls: 10s
- [ ] Graceful shutdown: drain connections on SIGTERM

**Monitoring & Response:**
- [ ] Sentry alerts on error rate > 5%
- [ ] Railway metrics: CPU/memory alerts at 80%
- [ ] Cloudflare analytics: traffic spike alerts
- [ ] Incident runbook: "under DDoS attack" → enable Under Attack Mode → check Sentry → scale Railway

## Feature Status Tracker — What's Built vs What's Not

### Built and Working
| Feature | Code Location | Tests | Notes |
|---------|-------------|-------|-------|
| Signal Protocol E2E | `apps/mobile/src/services/signal/` (23 files, ~10K lines) | 633 | Grade A+, 5 audit rounds |
| LiveKit Calling | `apps/livekit-server/` + `useLiveKitCall.ts` + `callkit.ts` | 123 Go + 49 TS | Go server + mobile hook + CallKit + SFrame E2EE |
| Video Editor | `video-editor.tsx` + `ffmpegEngine.ts` | 89 | 10 tool tabs, 35 edit fields, FFmpeg engine |
| Landing Page | `apps/landing/index.html` | — | Emerald Noir design, not yet deployed to Cloudflare Pages |
| Waitlist + Referral | `apps/api/src/modules/waitlist/` | 13 | Email via Resend, referral codes |
| A/B Testing Service | `apps/api/src/common/services/ab-testing.service.ts` | Yes | Backend ready |
| Feature Flags | `apps/api/src/common/services/feature-flags.service.ts` | Yes | 3-tier fallback: cache→Redis→DB |
| Algorithm (3-stage) | `apps/api/src/modules/feed/`, `personalized-feed/` | Yes | KNN + scoring + diversity + Islamic boost |
| i18n (8 languages) | `apps/mobile/src/i18n/*.json` | — | en, ar, tr, ur, bn, fr, id, ms |
| GIPHY SDK | `apps/mobile/src/services/giphyService.ts` | 45 | Native dialog + fallback search |
| 10 Story Stickers | `apps/mobile/src/components/story/` | 49 | GIF, Music, Location, Poll, Quiz, etc. |
| Widget Data Service | `apps/mobile/src/services/widgetData.ts` | — | Data layer ready, no native widget yet |

### Installed but Not Fully Wired
| Feature | Package | What's Missing |
|---------|---------|---------------|
| nsfwjs client-side | `nsfwjs` + `@tensorflow/tfjs` in package.json | TensorFlow model not bundled in assets, `nsfwCheck.ts` service exists but gracefully degrades |
| Video upload API | `streamApi.ts` exists | Never called from any create screen — videos can't upload from mobile |
| google-services.json | File exists at `apps/mobile/google-services.json` | Unclear if Firebase project properly configured for FCM push |

### NOT Built — Spec Exists, Zero Code
| Feature | Spec | Effort | Priority |
|---------|------|--------|----------|
| **Data Import (One Tap Import)** | `docs/features/DATA_IMPORT_ARCHITECTURE.md` (236 lines) | 2-3 sessions | High — #1 user acquisition |
| **Exit/Goodbye Story** | `docs/features/EXIT_STORY_SPEC.md` (165 lines) | 1 session | High — viral growth loop |
| **Profile Theming + Configurator** | `docs/features/PROFILE_THEMING_SPEC.md` (340 lines) | 1-2 sessions | High — Creator Pro monetization, Porsche configurator model |
| **Monetization (5 revenue streams)** | `docs/features/MONETIZATION_SPEC.md` (380 lines) | 3-4 sessions | **CRITICAL** — coins, subscriptions, tips, ads, commerce. Zero complete money flows currently. |
| **Content Licensing Strategy** | `docs/features/CONTENT_LICENSING_SPEC.md` (300 lines) | Ongoing | Music, GIFs, fonts, UGC, DMCA — what's legal, what needs licensing, tiered approach |
| **Business Gaps Checklist** | `docs/features/BUSINESS_GAPS_CHECKLIST.md` (550 lines) | Ongoing | 12 categories, 150+ items: legal, App Store, launch strategy, marketing, cold start, ops, analytics, financial, branding, partnerships, localization, infrastructure |
| **Product Strategy Gaps** | `docs/features/PRODUCT_STRATEGY_GAPS.md` (750 lines) | Ongoing | 10 sections: Ramadan 2027 plan, gamification system (XP/levels/achievements/streaks), notification strategy (categories/batching/caps/Islamic-aware), cold start playbook (creator recruitment templates/content calendar), verification system (5 badge types), digital wellbeing, competitor response, performance budget, deep linking, Islamic design decisions (prayer methods/Asr/Quran translations/interfaith/gender) |
| **Algorithm Deep Improvements** | Mentioned in `project_algorithm_roadmap.md` memory | 1-2 sessions | Medium — multi-cluster, exploration budget |

### NOT Built — No Spec, Need Design + Build
| Feature | Effort | Priority | Notes |
|---------|--------|----------|-------|
| **Apple IAP** | Medium | **BLOCKER** — App Store rejects without it | Coin purchases via Stripe violate guideline 3.1.1 |
| **AR/Camera Effects** | Large | Medium | Snap Camera Kit recommended (free, RN wrapper) |
| **pHash re-upload detection** | Small | Medium | Add `phash` column, compute via sharp, compare against `BannedHash` |
| **Admin/Moderation web dashboard** | Large | Post-launch | Backend endpoints exist, no web UI |
| **iOS/Android home screen widget** | Large | Post-launch | `widgetData.ts` exists, need native widget module |
| **Contact sync (WhatsApp)** | Medium | Phase 5 | Phone contacts → match Mizanly users |
| **Age gate (16+)** | Small | Pre-launch | Required for UGC apps, currently declared but not enforced |
| **Privacy policy page** | Small | **BLOCKER** — required for App Store submission | Static page at mizanly.app/privacy |
| **Terms of service page** | Small | **BLOCKER** — required for App Store submission | Static page at mizanly.app/terms |
| **App Store screenshots** | Medium | **BLOCKER** — required for submission | 6.5" + 5.5" screenshots, at least 3 |
| **App Store description + keywords** | Small | **BLOCKER** — ASO for discoverability | Title, subtitle, description, keywords |
| **Real app icon** | Small | **BLOCKER** — current is 22KB placeholder | Need 1024x1024 PNG, adaptive icon for Android |
| **GDPR consent flow** | Small | Pre-launch | Cookie/tracking consent for EU users |

### Blocked on External Dependencies
| Feature | Blocked On | Unblocks |
|---------|-----------|---------|
| iOS build (TestFlight) | Apple Developer ($99/yr) | Everything mobile |
| Cert pinning enforcement | EAS build (needs Apple Developer) | TLS security |
| Device attestation | Play Integrity / App Attest native modules + real device | Bot prevention |
| VoIP push (iOS ringtone) | PushKit entitlement (needs Apple Developer) | Proper incoming call UI |
| Formal verification | $50-100K (Tamarin/ProVerif) | Cryptographic proof |
| Professional security audit | $50-100K (Cure53/NCC/Trail of Bits) | Certification |
| CSAM reporting | NCMEC registration (US legal entity) | Legal compliance |
| Real-device testing | Apple Developer + EAS build | Runtime verification |

## Standing Rules — DO NOT FORGET
- **Prisma schema field names are FINAL** — never rename.
- **Islamic data curated by user personally** — never AI-generate Quran, hadith, or prayer content.
- NEVER log key material, session state, plaintext, or nonces.
- NEVER use `Math.random()` for crypto — use CSPRNG (`generateRandomBytes`).
- All DH outputs MUST be checked against low-order points (`assertNonZeroDH`).

## File Pointers
- `.claude/rules/` — file-type-specific rules (auto-loaded by glob)
- `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` — full memory index
- `docs/audit/2026-03-28-e2e-deep-audit-v3.md` — 33 E2E findings (original audit)
