# Mizanly

NestJS monorepo: `apps/api` + `apps/mobile` (Expo SDK 52) + `apps/e2e-server` (Go)
Prisma ORM, PostgreSQL (Neon), Redis (Upstash), Clerk auth, Cloudflare R2

## Build & Test
```bash
cd apps/api && pnpm test                    # API tests
cd apps/mobile && npx tsc --noEmit          # Mobile typecheck
cd apps/mobile && npx jest --config src/services/signal/__tests__/jest.config.js  # Signal tests
cd apps/e2e-server && go test ./internal/... -v  # Go tests
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

## Technical Debt — DO NOT FORGET

### Media Speed (NOT Telegram-fast yet)
- **Crypto is fast** — react-native-quick-crypto makes encrypt/decrypt ~5-20ms for 5MB (was ~200-500ms)
- **Network is the bottleneck** — R2 upload/download is ~1-3s on 4G, unchanged by crypto speedup
- To match Telegram's perceived speed, need:
  - **Progressive image loading** — show blurry thumbnail instantly, sharpen as data arrives
  - **Pre-upload during compose** — start uploading while user types caption (before tap send)
  - **Cloudflare CDN edge caching** — R2 + Workers for global edge delivery
  - **Streaming decrypt + display** — start showing media before full download completes
- Current total: ~2-3s for 5MB photo (crypto fast, network slow). Telegram: <1s (custom CDN + pre-upload)

### V7 Audit (14 findings, being fixed in separate session)
- V7-F1 (CRITICAL): NaN counter poisoning bypasses sealed sender replay protection
- V7-F2 (HIGH): No sender certificates in sealed sender (Signal has this, we don't)
- V7-F3 (HIGH): Transparency root has no freshness/expiry check
- V7-F4 to V7-F14: 11 medium/low findings (see docs/audit/MASTER_AUDIT_PROMPT_V2.md)

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
