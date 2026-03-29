# Mizanly

NestJS monorepo: `apps/api` + `apps/mobile` (Expo SDK 52) + `apps/e2e-server` (Go)
Prisma ORM, PostgreSQL (Neon), Redis (Upstash), Clerk auth, Cloudflare R2

## Build & Test
```bash
cd apps/api && pnpm test                    # API tests
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
- Do not commit unless explicitly asked.
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

## Scale Rewrite Roadmap

### Today (0-50K users): Ship what exists
NestJS monolith + Go E2E server. It works. No rewrites until users hit limits.

### 50-100K users: WebSocket Gateway → Elixir/Phoenix
**First thing that breaks.** Node.js WebSocket connections cost ~10KB each. 100K concurrent = 1GB connection state. Single-threaded event loop can't handle fan-out (1 message in 500-person group = 500 socket writes blocking the loop). Elixir BEAM VM: 2KB per process. WhatsApp handled 2M connections/server on Erlang.
- **Moves to Elixir:** `chat.gateway.ts`, socket auth, typing indicators, presence, read receipts
- **Stays in NestJS:** REST API, CRUD, Prisma queries, Clerk auth middleware
- **LiveKit** (replacing custom WebRTC) is independent — separate service, separate signaling. Can migrate anytime.

### 100-200K users: Feed Scoring + Workers → Go
Feed ranking is CPU-bound (score calc, engagement decay, content boosting). Node does it on one core, Go does it on all cores with goroutines. Also: push notification fan-out, media moderation queue, scheduled post publishing, analytics aggregation, thumbnail generation, video transcoding prep, EXIF stripping at volume.

### 500K+ users (maybe never): Signal Protocol → Rust core
JS strings immutable, GC unpredictable, key material leaks to heap. Rust core (like Signal's libsignal) solves permanently. But: $100K+ project, only matters for forensics attacker model, react-native-quick-crypto already handles 90% in C++. Don't rewrite until professional audit demands it.

### Never rewrite
| Component | Why |
|-----------|-----|
| REST API CRUD | DB is the bottleneck, not the framework |
| Prisma ORM | Fine until 500K. Raw SQL migration is a week when needed |
| Auth (Clerk) | Third-party service |
| Payments (Stripe) | Third-party service |
| Search (Meilisearch) | Already Rust under the hood |
| Mobile UI (React Native) | Only option unless native Swift/Kotlin rewrite |

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
