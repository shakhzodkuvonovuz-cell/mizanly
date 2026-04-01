# FIX SESSION — Round 2 Tab 3: Signal Protocol Crypto (F01-F08) + Go Services (G01-G06)

> Paste into a fresh Claude Code session. This session fixes ~228 findings across the Signal Protocol E2E encryption stack and both Go microservices. CRYPTO AND GO — completely isolated from the NestJS API.

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — every rule, especially E2E Encryption Rules, Go section, Standing Rules
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references — pay special attention to:
   - `project_session11_complete.md` (Signal Protocol build)
   - `project_session13_complete.md` (E2E audit Grade A+, react-native-quick-crypto)
   - `project_session14_complete.md` (LiveKit Go service)
   - `project_session15_complete.md` (LiveKit mobile + tests)
3. Read ALL 14 audit finding files IN FULL:
   - **Crypto:** `docs/audit/v2/wave5/F01.md` through `F08.md` (8 files, 115 findings)
   - **Go:** `docs/audit/v2/wave6/G01.md` through `G06.md` (6 files, 109 findings)
   - **Also:** `docs/audit/v2/wave2/B12.md` (4 livekit-server findings: #2, #3, #8, #16)
4. Create your progress file: `docs/audit/v2/fixes/R2_TAB3_PROGRESS.md`
5. Read this ENTIRE prompt before touching any source code

---

## YOUR SCOPE — THESE FILES ONLY

### Signal Protocol Crypto (ALL files in this directory)
```
apps/mobile/src/services/signal/crypto.ts
apps/mobile/src/services/signal/types.ts
apps/mobile/src/services/signal/native-crypto-adapter.ts
apps/mobile/src/services/signal/x3dh.ts
apps/mobile/src/services/signal/pqxdh.ts
apps/mobile/src/services/signal/double-ratchet.ts
apps/mobile/src/services/signal/session.ts
apps/mobile/src/services/signal/sender-keys.ts
apps/mobile/src/services/signal/sealed-sender.ts
apps/mobile/src/services/signal/storage.ts
apps/mobile/src/services/signal/prekeys.ts
apps/mobile/src/services/signal/key-transparency.ts
apps/mobile/src/services/signal/media-crypto.ts
apps/mobile/src/services/signal/streaming-upload.ts
apps/mobile/src/services/signal/offline-queue.ts
apps/mobile/src/services/signal/message-cache.ts
apps/mobile/src/services/signal/search-index.ts
apps/mobile/src/services/signal/multi-device.ts
apps/mobile/src/services/signal/notification-handler.ts
apps/mobile/src/services/signal/safety-numbers.ts
apps/mobile/src/services/signal/telemetry.ts
apps/mobile/src/services/signal/e2eApi.ts
apps/mobile/src/services/signal/index.ts
apps/mobile/src/services/signal/__tests__/
```

### Go E2E Server (ALL files)
```
apps/e2e-server/cmd/server/main.go
apps/e2e-server/internal/handler/handler.go
apps/e2e-server/internal/store/postgres.go
apps/e2e-server/internal/middleware/auth.go
apps/e2e-server/internal/middleware/ratelimit.go
apps/e2e-server/internal/middleware/ratelimit_test.go
apps/e2e-server/internal/middleware/auth_test.go
apps/e2e-server/internal/model/types.go
apps/e2e-server/Dockerfile
apps/e2e-server/go.mod
```

### Go LiveKit Server (ALL files)
```
apps/livekit-server/cmd/server/main.go
apps/livekit-server/internal/handler/handler.go
apps/livekit-server/internal/handler/handler_test.go
apps/livekit-server/internal/store/store.go
apps/livekit-server/internal/config/config.go
apps/livekit-server/internal/middleware/ratelimit.go
apps/livekit-server/internal/middleware/requestid.go
apps/livekit-server/internal/model/types.go
apps/livekit-server/Dockerfile
apps/livekit-server/go.mod
```

### FORBIDDEN — DO NOT TOUCH
- `apps/api/` — ALL NestJS code belongs to Tabs 1, 2, 4
- `schema.prisma`
- `apps/mobile/` files OUTSIDE `services/signal/`
- Any npm/yarn/pnpm package files

---

## SECTION A: SIGNAL PROTOCOL CRYPTO (F01-F08, 115 findings)

### F01 — crypto.ts, types.ts (14 findings)
Fix all. Key patterns:
- F01-#1 (H): constantTimeCompare fallback has timing side-channel — the nullish coalescing `??` leaks array lengths
- F01-#2 (H): AEAD auth failure silently falls back to @noble — creates timing oracle
- F01-#3 through #6 (M): Key material not zeroed (HChaCha20 subkey, DH outputs, key generation failures)

### F02 — native-crypto-adapter.ts (14 findings)
Fix all. THE MOST CRITICAL FILE:
- F02-#1 (C): **hchacha20() called with wrong arg types** — entire native AEAD path is dead code. This means ALL encryption falls back to pure JS, losing 10-50x performance. Fix the type mismatch to enable native crypto.
- F02-#2 (H): secureZero uses randomFillSync+fill(0), NOT OPENSSL_cleanse — JIT can dead-store eliminate
- F02-#3 (H): constantTimeCompare fallback timing side-channel (same as F01-#1)
- F02-#4 (H): `let nativeCrypto: any = null` — type the interface
- F02-#5 (H): 13 instances of Buffer.from(key material) create unzeroed copies
- F02-#7 (M): Bare `catch {}` blocks swallow ALL exceptions — this HIDES the hchacha20 bug

### F03 — x3dh.ts (9 findings)
Fix all. Key patterns:
- F03-#1/#2 (H): Key material not zeroed (theirIdentityX25519Public, HKDF derived buffers)
- F03-#3 (H): x3dhResult.sharedSecret never zeroed by callers
- F03-#4 (M): Missing assertNonZeroDH on 3 DH operations
- F03-#5 (M): SPK age check bypassed when createdAt absent

### F04 — pqxdh.ts (16 findings)
Fix all. Key criticals:
- F04-#1 (C): **PQ prekey signature NEVER VERIFIED** — server/MITM can substitute PQ keys, nullifying post-quantum protection
- F04-#2 (C): deriveHybridSecret() is dead code — never called, uses wrong HKDF info
- F04-#3 (H): PQXDH encapsulation failure silently falls back to classical X3DH — attacker-controlled downgrade
- F04-#7 (H): fetchPreKeyBundle doesn't pass PQ fields from server
- F04-#8 (H): No PQ prekey generation/storage/upload code exists — PQXDH structurally impossible

IMPORTANT: Some PQXDH findings may need to be marked DEFERRED if the entire PQXDH feature is incomplete by design (documented in CLAUDE.md as "ML-KEM-768 post-quantum hybrid — version negotiation [1, 2]"). Read the current code state carefully. If PQXDH is intentionally version-gated and not yet activated, defer the "structurally impossible" findings with clear documentation of what's needed.

### F05 — double-ratchet.ts, session.ts (18 findings)
Fix all. Key patterns:
- F05-#1 (H): dhRatchetStep doesn't zero old rootKey, chainKeys before overwriting
- F05-#2/#3 (H): paddedPlaintext not zeroed after encrypt/decrypt — plaintext on heap
- F05-#4 (H): encryptMessage doesn't clone session state — storage failure = permanent desync
- F05-#6 (M): skipMessageKeys unbounded iteration — malicious counter can force 2000 HMACs

### F06 — sender-keys.ts, sealed-sender.ts (9 findings)
Fix all. Key findings:
- F06-#1 (H): Sealed sender counter is a global singleton with no mutex — concurrent calls race
- F06-#2 (H): Sender key skipped message keys never zeroed from memory

### F07 — storage.ts, prekeys.ts, key-transparency.ts (16 findings)
Fix all. Key critical:
- F07-#1 (C): cleanupOrphanedOTPKeys reads pre-key registry via raw mmkv.getString(), bypassing AEAD — data loss after HMAC migration
- F07-#2 (H): Root signature doesn't cover updatedAt or treeSize — replay attack
- F07-#3 (H): verifyRootSignature returns true when public key is empty — fail-open

### F08 — media-crypto, streaming, offline-queue, cache, search-index, multi-device (19 findings)
Fix all. Key criticals:
- F08-#1 (C): HKDF nonce derived deterministically — MediaEncryptionContext reuse = catastrophic nonce reuse
- F08-#2 (C): Device-link 6-digit code from only 3 bytes — brute-forceable in <1 second

---

## SECTION B: GO SERVICES (G01-G06, 109 findings + B12 4 findings)

### G01 — e2e-server handlers (10 findings)
- G01-#1 (M): `defer rCancel()` inside for-loop leaks contexts
- G01-#2 (M): HandleGetBundle no defense-in-depth auth check

### G02 — e2e-server store + SQL (15 findings)
Key critical:
- G02-#1 (C): ON CONFLICT requires composite unique index that doesn't exist in Prisma schema — DEFER schema change, but document the impact
- G02-#2 (H): GetTransparencyProof returns time.Now() instead of cacheRebuiltAt
- G02-#3 (H): SELECT FOR UPDATE locks ALL OTP rows — contention

### G03 — e2e-server middleware, config, main (21 findings)
Key findings:
- G03-#1 (H): No CORS middleware at all
- G03-#3 (H): Rate limiter bypasses on empty requesterID
- G03-#4 (H): http.DefaultClient for webhooks — follows redirects (SSRF), no timeout

### G04 — livekit-server handler first half (18 findings)
Key findings:
- G04-#1 (H): E2EE key fetch error silently discarded — call proceeds without encryption
- G04-#2 (H): HandleDeleteRoom ignores errors from WipeE2EEKey — key persists in DB
- G04-#3 (H): sendCallPush goroutine uses context.Background() — orphan on shutdown

### G05 — livekit-server handler second half + tests (20 findings)
Key findings:
- G05-#1 (H): HandleStopEgress allows ANY participant to stop recording
- G05-#2 (H): HandleCreateIngress no session status check
- G05-#3 (M): Webhook handler swallows 8+ DB errors without logging

### G06 — livekit-server store, config, middleware, Dockerfile (25 findings)
Key criticals:
- G06-#1 (C): Redis TLS forced on non-TLS URLs — breaks dev/non-TLS setups
- G06-#2 (C): Dockerfile uses `golang:1.26-alpine` — Go 1.26 DOES NOT EXIST. Fix to `golang:1.25-alpine`
- G06-#3 (H): Container runs as root — add USER directive
- G06-#4 (H): UpdateSessionStatus no status string validation
- G06-#5 (H): Goroutine calls os.Exit(1) — bypasses all deferred cleanup

### B12 — LiveKit portions (4 findings)
- B12-#2 (H): UpdateSessionStatus no WHERE status guard — terminal states overwritten
- B12-#3 (M): MarkParticipantLeft no RowsAffected check
- B12-#8 (M): HandleDeleteRoom non-transactional cleanup
- B12-#16 (L): participant_left doesn't check if last participant

---

## CRYPTO-SPECIFIC RULES

### KEY MATERIAL ZEROING PATTERN
The dominant pattern in F01-F08 is: key material not zeroed after use. The fix pattern:

```typescript
// BEFORE — key material lingers on heap
const sharedSecret = x25519DH(myPrivate, theirPublic);
const derived = hkdf(sharedSecret, salt, info, 64);
const rootKey = derived.slice(0, 32);
const chainKey = derived.slice(32, 64);
// sharedSecret and derived still on heap

// AFTER — zeroed immediately after use
const sharedSecret = x25519DH(myPrivate, theirPublic);
try {
  const derived = hkdf(sharedSecret, salt, info, 64);
  try {
    const rootKey = derived.slice(0, 32);
    const chainKey = derived.slice(32, 64);
    // ... use rootKey and chainKey ...
  } finally {
    secureZero(derived);
  }
} finally {
  secureZero(sharedSecret);
}
```

When fixing zeroing issues:
1. Add `secureZero()` call in a `finally` block (not after — exceptions skip it)
2. Make sure the variable is a `Uint8Array` (JS strings are immutable, can't be zeroed)
3. If the variable is a slice/view of another buffer, zero the original too
4. For base64 strings: these are immutable JS strings — note as "JS heap limitation" and add a comment explaining the GC window

### ASSERTNONZERODH PATTERN
For missing small-subgroup checks:
```typescript
const dhResult = x25519DH(myPrivate, theirPublic);
assertNonZeroDH(dhResult); // throws if all-zeros (low-order point)
```
Grep for ALL x25519DH calls and ensure each is followed by assertNonZeroDH.

### NATIVE CRYPTO ADAPTER — THE CRITICAL FIX
F02-#1 is the highest-impact single finding: hchacha20() is called with wrong types, making native AEAD dead code. This means ALL devices use slow pure JS instead of OpenSSL C++ via JSI. Fix:
1. Read native-crypto-adapter.ts line 163-167
2. Read the hchacha20 function signature it calls
3. Fix the argument types to match
4. Remove the bare catch {} (F02-#7) so the real error surfaces if fix is wrong
5. Test: the crypto test suite should still pass with native path active

### PQXDH — REALISTIC ASSESSMENT
F04 has findings about PQXDH being non-functional. Per CLAUDE.md, PQXDH is "version negotiation [1, 2]" — meaning version 1 is classical, version 2 is post-quantum. If the code correctly gates PQ behind version 2 and version 2 isn't activated yet:
- Fix the signature verification (F04-#1) — it should verify when PQ keys ARE present
- Fix the silent downgrade (F04-#3) — if PQ fails, it MUST error, not silently fall back
- Mark "no PQ prekey generation" (F04-#8) as DEFERRED — future feature, not a bug
- Delete dead code (F04-#2 deriveHybridSecret) if truly unused

---

## GO-SPECIFIC RULES

### ERROR HANDLING PATTERN
The dominant Go pattern: silently discarding errors with `_`. Fix:

```go
// BEFORE — error silently discarded
_ = store.WipeE2EEKey(ctx, sessionID)

// AFTER — error logged (not returned — these are cleanup paths)
if err := store.WipeE2EEKey(ctx, sessionID); err != nil {
    slog.Error("failed to wipe E2EE key", "sessionID", sessionID, "error", err)
}
```

For CRITICAL cleanup (E2EE key wipe, participant status):
```go
// AFTER — error logged to Sentry AND returned
if err := store.WipeE2EEKey(ctx, sessionID); err != nil {
    slog.Error("CRITICAL: E2EE key not wiped", "sessionID", sessionID, "error", err)
    sentry.CaptureException(err)
    // Do NOT return error to caller for cleanup paths — log and continue
}
```

### DOCKERFILE FIX
G06-#2: Change `golang:1.26-alpine` to the version matching go.mod. Read go.mod to get the exact version:
```bash
head -3 apps/livekit-server/go.mod
head -3 apps/e2e-server/go.mod
```

G06-#3: Add non-root user:
```dockerfile
RUN addgroup -S app && adduser -S app -G app
USER app
```

### STATUS TRANSITION VALIDATION
G06-#4 and B12-#2: UpdateSessionStatus needs a state machine:
```go
var validTransitions = map[string][]string{
    "RINGING":    {"ACTIVE", "MISSED", "ENDED"},
    "ACTIVE":     {"ENDED"},
    "MISSED":     {},
    "ENDED":      {},
}

func (s *PostgresStore) UpdateSessionStatus(ctx context.Context, sessionID, newStatus string) error {
    result, err := s.db.Exec(ctx,
        `UPDATE call_sessions SET status = $1, "updatedAt" = NOW()
         WHERE id = $2 AND status = ANY($3)`,
        newStatus, sessionID, validTransitions[newStatus]) // only from valid prior states
    // check RowsAffected
}
```

---

## FIX ORDER (priority)

### Crypto (do first — security critical)
1. **F02-#1 (C)**: hchacha20 wrong types — unlock native crypto path
2. **F04-#1 (C)**: PQ prekey signature never verified
3. **F08-#1 (C)**: MediaEncryptionContext nonce reuse
4. **F08-#2 (C)**: Device-link code brute-forceable
5. **F07-#1 (C)**: AEAD bypass in cleanup/export
6. **F02-#2/#3/#4/#5 (H)**: native-crypto-adapter security fixes
7. **F03/#04/#05 (H)**: x3dh, pqxdh, double-ratchet key zeroing
8. **F06/#07 (H)**: sender-keys, storage, key-transparency
9. **F01-F08 remaining M/L**: systematic key zeroing + validation

### Go (do second)
10. **G06-#1/#2 (C)**: Redis TLS + Dockerfile version
11. **G02-#1 (C)**: ON CONFLICT missing index (DEFER schema, document)
12. **G01-G06 H findings**: CORS, rate limiter bypass, SSRF, E2EE key wipe, container root
13. **G01-G06 M/L findings**: error handling, input validation, cleanup
14. **B12 livekit findings**: status transitions, participant tracking

---

## TEST COMMANDS
```bash
# Signal Protocol tests
cd apps/mobile && npx jest --config src/services/signal/__tests__/jest.config.js

# Go E2E server tests
cd apps/e2e-server && go test ./internal/... -v -count=1

# Go LiveKit server tests
cd apps/livekit-server && go test ./internal/... -v -count=1

# Mobile TypeScript check (for crypto changes)
cd apps/mobile && npx tsc --noEmit

# Go compilation
cd apps/e2e-server && go build ./cmd/server/
cd apps/livekit-server && go build ./cmd/server/
```

---

## CHECKPOINT SCHEDULE

Due to two codebases, alternate checkpoints:

| # | After | Tests | Commit |
|---|-------|-------|--------|
| 1 | F02 complete (~14 fixes) | Signal tests | `fix(signal): R2-Tab3 CP1 — native-crypto-adapter` |
| 2 | F03+F04 complete (~25 fixes) | Signal tests | `fix(signal): R2-Tab3 CP2 — x3dh, pqxdh` |
| 3 | F05+F06 complete (~27 fixes) | Signal tests | `fix(signal): R2-Tab3 CP3 — double-ratchet, sender-keys` |
| 4 | F07+F08 complete (~35 fixes) | Signal + tsc | `fix(signal): R2-Tab3 CP4 — storage, media-crypto, peripherals` |
| 5 | F01 + cleanup (~14 fixes) | Signal full | `fix(signal): R2-Tab3 CP5 — crypto.ts, types.ts, final` |
| 6 | G01+G02+G03 (~46 fixes) | e2e-server tests + build | `fix(e2e-server): R2-Tab3 CP6 — handlers, store, middleware` |
| 7 | G04+G05 (~38 fixes) | livekit-server tests + build | `fix(livekit-server): R2-Tab3 CP7 — handlers` |
| 8 | G06+B12 (~29 fixes) | livekit tests + build | `fix(livekit-server): R2-Tab3 CP8 — store, config, Dockerfile` |

---

## THE STANDARD

228 findings across the most security-sensitive code in the entire app. The Signal Protocol implementation protects every private message. The Go services guard key material and call encryption. A single crypto bug can make every conversation readable.

F02-#1 alone means ALL 633 crypto tests pass using slow pure JS instead of native OpenSSL. Fixing one type mismatch unlocks 10-50x performance for every encrypted operation.

The Go services silently discard E2EE key wipe errors — meaning call encryption keys may persist in the database indefinitely after calls end. Fix every error path.

**228 findings. Crypto first, Go second. Zero shortcuts. Begin.**
