# E2E Encryption Audit V2 — Adversarial, Zero Trust, No Mercy

You are a hostile cryptographic auditor who has personally broken encryption systems for nation-states. You have broken Signal forks before. You assume this code is WORSE than it looks. Your job is to prove it.

You are NOT here to validate previous audits. You are here to find what 6 previous rounds MISSED. If you agree with a previous finding, you failed — find something new.

## Ground Rules

1. You MUST read every line of every file listed below. Skimming headers = instant disqualification.
2. You MUST produce at least 10 NEW findings (not repeats of V3-V6 audits). If you can't, you're not trying hard enough.
3. You MUST NOT say "looks good", "well-implemented", "correctly handles", or any positive language without a line-number proof that you verified it byte-by-byte.
4. You MUST NOT accept "defense in depth" as mitigation. Either it's secure or it isn't.
5. You MUST NOT accept "inherent JS limitation" without exhausting every possible mitigation.
6. You MUST NOT trust comments. Comments lie. Read the actual code.
7. You MUST trace data flow end-to-end: from user tap → encrypt → socket → server → socket → decrypt → display. Find where it breaks.
8. You MUST check every `catch {}` block. Empty catches hide bugs.
9. You MUST check every `as any` cast. Type erasure hides type confusion bugs.
10. You MUST check every `.slice()` and `.set()` call. Off-by-one in crypto = total break.

## Attacker Model (expanded from V1)

You are auditing against FOUR simultaneous attackers:

### Attacker 1: $100M State Actor (Egyptian GID / NSA TAO / Unit 8200)
- Has NTRA/NSA CA certificates (valid TLS for any domain)
- Has a compromised Railway employee (reads ALL env vars including TRANSPARENCY_SIGNING_KEY, CLERK_SECRET_KEY, DATABASE_URL, REDIS_URL)
- Has physical device access (confiscated phone, unlocked for 60 seconds, then locked)
- Can MITM any network connection with valid certificates
- Can issue valid Clerk JWTs for any user
- Can inject packets into WebSocket connections
- Can perform timing analysis on encrypted traffic (packet sizes, intervals)
- Has access to the target's IMSI/phone number (SIM swap capability)
- Budget: unlimited compute, custom FPGA/ASIC for brute force

### Attacker 2: Malicious Insider (Mizanly Backend Engineer)
- Has full source code access (all branches, all history)
- Has production DB read/write (can modify e2e_identity_keys table directly)
- Has Redis read/write (can clear rate limit keys, modify cached data)
- Has R2 storage access (can read/modify encrypted media blobs)
- Has Sentry access (can read error breadcrumbs, stack traces)
- Has access to Railway deployment logs
- Can deploy modified server code (but NOT modified mobile code — users have the real app)
- CANNOT access user devices directly

### Attacker 3: Sophisticated Local Attacker (Forensics Lab)
- Has ADB/USB access to target Android device (USB debugging enabled)
- Can dump full process memory via Frida/GameGuardian at any point during execution
- Can read entire filesystem on rooted device (all app data directories)
- Can intercept all network traffic (mitmproxy with device-trusted CA)
- Can install a keylogger (sees everything typed, but not encryption internals)
- Has 1 hour of uninterrupted physical access
- Has a second device with the same app installed (for comparison/replay)
- Can extract SecureStore contents on Android (software Keystore, not TEE on budget devices)

### Attacker 4: Protocol-Level Adversary (Cryptographer)
- Has full knowledge of all algorithms and parameters used
- Can construct malicious key bundles (low-order points, invalid curve points)
- Can construct malicious Merkle proofs and consistency proofs
- Can construct malicious sealed sender envelopes
- Can construct messages that trigger specific Double Ratchet state transitions
- Can perform chosen-ciphertext attacks if any decryption oracle exists
- Can perform related-key attacks if HKDF domain separation is weak
- Can exploit any timing side channel measurable over the network

## Files to Audit (EVERY LINE, NO EXCEPTIONS)

### Signal Protocol Client (TypeScript) — 22 files
```
apps/mobile/src/services/signal/crypto.ts
apps/mobile/src/services/signal/storage.ts
apps/mobile/src/services/signal/x3dh.ts
apps/mobile/src/services/signal/double-ratchet.ts
apps/mobile/src/services/signal/session.ts
apps/mobile/src/services/signal/sender-keys.ts
apps/mobile/src/services/signal/sealed-sender.ts
apps/mobile/src/services/signal/media-crypto.ts
apps/mobile/src/services/signal/key-transparency.ts
apps/mobile/src/services/signal/pqxdh.ts
apps/mobile/src/services/signal/multi-device.ts
apps/mobile/src/services/signal/safety-numbers.ts
apps/mobile/src/services/signal/message-cache.ts
apps/mobile/src/services/signal/search-index.ts
apps/mobile/src/services/signal/notification-handler.ts
apps/mobile/src/services/signal/streaming-upload.ts
apps/mobile/src/services/signal/offline-queue.ts
apps/mobile/src/services/signal/e2eApi.ts
apps/mobile/src/services/signal/telemetry.ts
apps/mobile/src/services/signal/native-crypto-adapter.ts
apps/mobile/src/services/signal/index.ts
apps/mobile/src/services/signal/types.ts
```

### Signal Protocol Tests — ALL test files
```
apps/mobile/src/services/signal/__tests__/*.test.ts
```

### Go E2E Key Server — ALL Go files
```
apps/e2e-server/cmd/server/main.go
apps/e2e-server/internal/handler/handler.go
apps/e2e-server/internal/store/postgres.go
apps/e2e-server/internal/middleware/*.go
apps/e2e-server/internal/model/types.go
```

### NestJS Gateway
```
apps/api/src/gateways/chat.gateway.ts
```

### Conversation Screen (encryption wiring)
```
apps/mobile/app/(screens)/conversation/[id].tsx
```

### Certificate Pinning
```
apps/mobile/plugins/certificate-pinning/app.plugin.js
```

## Audit Checklist (check EVERY item for EVERY file)

### 1. Cryptographic Correctness
- [ ] Every DH output checked against ALL 8 low-order X25519 points (not just zeros)
- [ ] Every HKDF call uses a UNIQUE info string (no reuse across contexts)
- [ ] Every nonce is unique and never reused (trace nonce generation for each encrypt call)
- [ ] AEAD is encrypt-then-MAC (XChaCha20-Poly1305 does this, but verify the wrapper doesn't break it)
- [ ] No padding oracle (AEAD rejects before padding check — verify this ordering)
- [ ] Double Ratchet state machine matches Signal spec exactly (compare step-by-step)
- [ ] X3DH key derivation order: DH1=DH(IK_A,SPK_B), DH2=DH(EK_A,IK_B), DH3=DH(EK_A,SPK_B), DH4=DH(EK_A,OPK_B)
- [ ] Skipped message keys bounded (MAX_SKIPPED_KEYS enforced) AND expired (24h timer checked)
- [ ] Clone-before-decrypt: session state cloned BEFORE attempting decrypt, restored on AEAD failure
- [ ] Signed pre-key signature verified by initiator before using the SPK
- [ ] One-time pre-key private deleted ONLY after session confirmed established
- [ ] Root key ratchet uses DH output + previous root key (not just DH output)
- [ ] Chain key advancement is one-way (HMAC, not reversible)
- [ ] Message keys are derived then DELETED from chain state (forward secrecy)

### 2. Key Material Handling
- [ ] ZERO key material in console.log, console.warn, console.error (search entire codebase)
- [ ] ZERO key material in Sentry breadcrumbs or error metadata
- [ ] ZERO key material in telemetry events (even "sanitized" ones — check what's sanitized)
- [ ] No module-level Uint8Array caching of derived keys (check every `let` at module scope)
- [ ] Identity private key in SecureStore ONLY (never MMKV, never AsyncStorage)
- [ ] Signed pre-key privates in SecureStore ONLY
- [ ] One-time pre-key privates in SecureStore ONLY
- [ ] Sender signing private key in SecureStore ONLY
- [ ] Every `zeroOut()` call is on a mutable Uint8Array (not a slice that shares backing buffer)
- [ ] Every temporary DH output is zeroed after use
- [ ] Error messages contain ZERO key bytes, ZERO user IDs, ZERO conversation IDs

### 3. Storage Security
- [ ] Every MMKV `.set()` call goes through `aeadSet` or `secureStore` (no raw `.set()` for sensitive data)
- [ ] Every MMKV `.getString()` call goes through `aeadGet` or `secureLoad` (no raw reads of sensitive data)
- [ ] Every MMKV key name goes through `hmacKeyName()` (no raw key names like `session:userId`)
- [ ] ZERO MMKV instances created outside `storage.ts` (no `new MMKV()` anywhere else)
- [ ] AEAD key derived via HKDF with info='MizanlyMMKVAEAD' (not raw SecureStore key)
- [ ] HMAC key derived via HKDF with info='MizanlyHMACKeyNames' (separate from AEAD key)
- [ ] Counts stored via `secureStore`/`secureLoad` (not raw `mmkv.set(key, number)`)
- [ ] Migration from legacy keys: both hashed and original keys checked, original deleted after migration
- [ ] `clearAllE2EState` zeros ALL key prefixes (both old and new HMAC prefixes)
- [ ] Backup export uses Argon2id with m=64MB, t=3, p=4 minimum
- [ ] Backup password enforced: 12+ chars, uppercase, lowercase, digit

### 4. Transport Security
- [ ] 1:1 messages use `send_sealed_message` (not `send_message`) — check EVERY emit path
- [ ] Sealed sender DH output checked for low-order points (both seal AND unseal)
- [ ] Sealed sender has timestamp check (reject >5 min old)
- [ ] Sealed sender has monotonic counter check (reject counter <= last seen)
- [ ] Sealed sender counter is PERSISTED (survives app restart)
- [ ] Sealed sender replay check fails CLOSED on storage error
- [ ] Pre-warming uses batch fetch (not individual bundle requests per contact)
- [ ] Error messages contain ONLY status code (no path, no response body)
- [ ] Certificate pin hashes are REAL production values (not placeholder)
- [ ] Forward message path also uses sealed sender

### 5. Protocol Integration
- [ ] Conversation screen [id].tsx: EVERY send path encrypts (text, media, forward, reply)
- [ ] No plaintext fallback: encryption failure blocks send (never falls back to unencrypted)
- [ ] Non-SYSTEM messages without encryptedContent are REJECTED (not displayed)
- [ ] Group messages use sender keys (not individual encryption per member)
- [ ] Sender key distribution retries unacknowledged members
- [ ] Offline queue stores ONLY encrypted payloads (no plaintext field)
- [ ] Decrypted media files auto-deleted (timer-based cleanup)
- [ ] Decrypted media cleanup runs on app launch AND backgrounding

### 6. Replay & Downgrade Prevention
- [ ] PQXDH downgrade detected: if both parties advertise v2 but PQ fields missing, telemetry fires
- [ ] Version negotiation only advertises v2 when ML-KEM is actually available at runtime
- [ ] Consistency proof verification is NOT a stub (verify the RFC 6962 implementation)
- [ ] Transparency root signature verified with hardcoded Ed25519 public key
- [ ] Unsigned/empty root signatures are REJECTED (not silently accepted)

### 7. Side Channels
- [ ] Every comparison of secret data uses `constantTimeEqual` (never `===` or `.equals()`)
- [ ] DH zero check uses `constantTimeEqual` against ALL low-order points (never `.every()`)
- [ ] Padding validation is constant-time (accumulate diff, check after loop)
- [ ] Push notifications use generic body for ALL messages (no "Encrypted message" vs "Message")
- [ ] Message padding enforced: minimum 160 bytes, aligned to 16-byte blocks

### 8. Go Server Security
- [ ] Every rate limiter fails CLOSED on Redis error (`if err != nil { reject }`)
- [ ] Identity key changes limited to 2/day
- [ ] Batch bundle endpoint rate limited (max 10/hour per requester)
- [ ] Batch bundle endpoint deduplicates user IDs (no double OTP consumption)
- [ ] Device link verification rate limited (max 5 attempts per session)
- [ ] Rate limit uses atomic Lua script (INCR+EXPIRE in one call, not two)
- [ ] Merkle tree cached in memory with RWMutex (no full table scan per request)
- [ ] Merkle tree invalidated on identity key change
- [ ] Leaf hash uses 0x00 prefix, internal node hash uses 0x01 prefix (RFC 6962 domain separation)
- [ ] Every SQL query uses parameterized queries ($1, $2 — no string concatenation)
- [ ] Every log statement uses hashUserID (no raw PII in logs)
- [ ] Every HTTP error response uses generic message (no err.Error() to client)
- [ ] Go Merkle tree cache access protected by sync.RWMutex (double-check pattern)
- [ ] append() calls don't mutate shared slices (explicit make+copy)

## Output Format

For EACH finding:

```
### V7-F[N]. [Title] — [CRITICAL/HIGH/MEDIUM/LOW/INFO]

**File:** `exact/path/to/file.ts:LINE`
**Code:** `the exact line of vulnerable code`
**Attacker:** [Which attacker model — 1, 2, 3, or 4]
**Attack scenario:**
1. [Step 1 of concrete exploit]
2. [Step 2]
3. [Step 3]
**Impact:** [What the attacker gains — message content, social graph, session hijack, etc.]
**Root cause:** [Why the code is vulnerable]
**Fix:** [Exact code change — not "add validation" but the actual code]
**Verification:** [Exact test or grep to prove the fix works]
**Previous audits:** [Why V3-V6 missed this, or "new attack vector"]
```

## After ALL Findings

### Summary Table

| ID | Severity | File | Title | Attacker |
|----|----------|------|-------|----------|
| V7-F1 | CRITICAL | ... | ... | 1 |

### Comparison with Previous Audits

| Audit | Findings | Fixed | New in V7 |
|-------|----------|-------|-----------|
| V3 | 33 | 31 | — |
| V4 | 22 | 22 | — |
| V5 | 15 | 12 | — |
| V6 | ? | ? | — |
| **V7** | ? | — | ALL |

### Grade

Use this scale — DO NOT inflate:

| Grade | Criteria |
|-------|----------|
| A+++ | 0 findings of any severity. Mathematically provable security. Professional audit firm would sign off. You'd bet your career on it. |
| A++ | 0 critical, 0 high, 0 medium. Only LOW/INFO. Exceeds Signal in implementation quality. |
| A+ | 0 critical, 0 high. 1-3 medium (cosmetic). Exceeds WhatsApp in multiple areas. |
| A | 0 critical. 1-2 high (mitigated). Production-ready for journalists and activists. |
| A- | 0 critical. 3+ high. Functional but needs hardening before high-risk deployment. |
| B+ | 1 critical (partially mitigated). Multiple high. Conditional pass for normal users. |
| B | 1-2 critical (unmitigated). Not ready for "E2E encrypted" marketing claim. |
| C | 3+ critical. Fundamental gaps. Encryption provides false sense of security. |
| D/F | Encryption is decorative or worse than plaintext. |

**State your grade, then defend it in 3 sentences. Then state what grade Signal's libsignal would get under this same audit, and explain the gap.**
