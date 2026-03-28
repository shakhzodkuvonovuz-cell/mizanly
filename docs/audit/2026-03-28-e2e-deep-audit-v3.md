# E2E Encryption Deep Audit V3 — A+ Findings List

> **Attacker:** $100M state-sponsored (Egyptian GID). Has NTRA CA certs, compromised Railway employee, physical device access.
> **Date:** 2026-03-28
> **Scope:** All 23 signal/ files, Go E2E server, NestJS gateway, conversation screen
> **Current grade:** B+. Target: A+.

---

## TIER 1: CRITICAL (Must fix before claiming "E2E encrypted")

### F1. Key Substitution MITM via Compromised Server — Transparency Root Unsigned
**File:** `e2e-server/internal/store/postgres.go:479` — `RootSig: ""`
**Attack:** Railway employee reads `CLERK_SECRET_KEY` → forges JWT → registers attacker's identity key for target → builds forged Merkle tree including the substituted key → client verifies proof → passes (tree is internally consistent, just fake). All future messages from contacts encrypted to attacker's key.
**Why it works:** `GetTransparencyProof` and `GetTransparencyRoot` return empty `rootSignature`. Client's `verifyKeyTransparency` checks Merkle proof math but never verifies the root is signed by a trusted offline key.
**Fix:** Generate an Ed25519 transparency signing key OFFLINE (never on the server). Store only the public key in the Go server. Sign the Merkle root with the private key (kept air-gapped). Client verifies root signature against the hardcoded public key. Server CANNOT forge a signed root.

### F2. Message Cache Contains Plaintext — Defeats Entire E2E
**File:** `message-cache.ts:53` — `new MMKV({ id: 'mizanly-signal-cache', encryptionKey: encKey })`
**Attack:** Device confiscated → extract SecureStore key (software Keystore on budget Android) → decrypt MMKV AES-CFB → read ALL cached message plaintext (up to 50K messages).
**Why it works:** The message cache MMKV still uses built-in AES-CFB encryption (NOT the AEAD wrapper from storage.ts). The main storage.ts MMKV was switched to AEAD-only (D4), but message-cache.ts and search-index.ts were never updated. They contain: decrypted message content, sender IDs, timestamps, conversation IDs, search tokens.
**Fix:** Either (a) use the shared MMKV instance from storage.ts (which has AEAD) for caching, or (b) add AEAD wrapping to message-cache.ts and search-index.ts, or (c) switch them to unencrypted MMKV + AEAD like storage.ts.

### F3. Search Index Contains Tokenized Plaintext
**File:** `search-index.ts:53` — same pattern as F2
**Attack:** Same device extraction → search index reveals every word the user has sent/received (tokenized and indexed). Even if individual messages are encrypted, the search tokens expose content.
**Fix:** Same as F2 — AEAD-wrap or use shared MMKV instance.

### F4. MMKV Key Names Leak Social Graph
**File:** `storage.ts:113` — MMKV created without encryption
**Attack:** Device forensics → list MMKV keys (unencrypted file, key names in plaintext):
- `session:user_abc:1` → communicates with user_abc
- `senderkey:conv_xyz:self` → member of group conv_xyz
- `identitykey:user_def` → has contacted user_def
- `group_dedup:conv_xyz` → member of group conv_xyz
- `offlinequeue:msg_123` → has pending message

No decryption needed. Key names ARE the social graph.
**Fix:** Hash all MMKV key names with HMAC(aeadKey, keyName). Store: `HMAC("session:user_abc:1")` instead of `"session:user_abc:1"`. Maintain a reverse-lookup for iteration.

### F5. Sealed Sender Not Wired Into Regular Send Path
**File:** Conversation screen `emitEncryptedMessage` uses `send_message` (not `send_sealed_message`)
**Attack:** Compromised Railway employee reads Socket.io connection metadata → sees `client.data.userId` on every message emit → full social graph + timing.
**Fix:** Route ALL 1:1 messages through `send_sealed_message`. The sealed sender module exists, the server handler exists — just wire it into `emitEncryptedMessage`.

### F6. Certificate Pinning Not Active (No EAS Build)
**File:** `plugins/certificate-pinning/app.plugin.js` — generates config at build time
**Attack:** NTRA CA certificate → valid TLS cert for api.mizanly.app → full MITM on all API traffic → substitute pre-key bundles → read all messages.
**Why it works:** Plugin generates `network_security_config.xml` during EAS build. No EAS build has ever been run. Pin hashes are template values. iOS TrustKit not installed.
**Fix:** Run first EAS build. Verify pin hashes match production certs. Install react-native-trustkit for iOS.

---

## TIER 2: HIGH (Must fix within 30 days of launch)

### F7. Consistency Proof Verification is a Stub
**File:** `key-transparency.ts:189` — `// TODO: Full RFC 6962 consistency proof verification` → `return true`
**Attack:** Compromised server retroactively removes a key change entry from the transparency log. Client accepts the inconsistent tree because the consistency check always returns true.
**Fix:** Implement full RFC 6962 consistency proof verification (hash path reconstruction).

### F8. Pre-Warming Leaks Top 10 Contacts to Server
**File:** `index.ts` — `preWarmSessions` calls `fetchPreKeyBundle` for top contacts
**Attack:** Go server logs all bundle fetch requests → builds each user's top 10 contact list without reading any messages.
**Fix:** Batch pre-warming into a single opaque request, or pre-warm using cached bundles from a previous session.

### F9. `e2eFetch` Error Response Leaks Server Path
**File:** `e2eApi.ts:76` — `throw new Error('E2E API error: ${response.status} ${path} — ${body}')`
**Attack:** Error messages include the full API path and server response body. If these reach Sentry breadcrumbs (telemetry.ts catches some but not all), server internals are exposed.
**Fix:** Strip path and body from error messages. Log generic error codes only.

### F10. AEAD Key Cached in Module-Level Variable
**File:** `storage.ts:142-143` — `let aeadKey: Uint8Array | null = null`
**Attack:** Memory dump of the JS heap → find the module-level `aeadKey` variable → decrypt ALL MMKV values. The key persists in memory for the entire app lifetime. Even after `clearAllE2EState` sets `aeadKey = null`, the GC may not immediately collect the old buffer.
**Fix:** Re-derive the AEAD key on each operation (HKDF is fast, ~0.5ms). Don't cache it.

### F11. Notification Handler Creates Separate Unprotected MMKV
**File:** `notification-handler.ts:92` — `new MMKV({ id: 'mizanly-signal', encryptionKey: mmkvKey })`
**Attack:** The notification handler creates its OWN MMKV instance with the old encryption pattern (AES-CFB with encryptionKey). This is a different instance than the one in storage.ts (which is unencrypted + AEAD). If both access the same MMKV id ('mizanly-signal'), they'll corrupt each other's data. If they use different ids, the notification handler's data is under weaker protection.
**Fix:** The notification handler should use the same MMKV access pattern as storage.ts, or access storage.ts functions directly.

### F12. Identity Key Rate Limit Fails Open on Redis Error
**File:** `handler.go:79-91` — identity key change rate limiting
**Attack:** Redis unavailable → `Incr` returns error → `rlErr == nil` is false → rate limit check skipped entirely → unlimited identity key changes → rapid key cycling for MITM.
**Fix:** Change to fail closed: `if rlErr != nil { writeError(w, 429, "rate limiting unavailable"); return }`.

### F13. Sealed Sender Envelope Has No Replay Protection
**File:** `sealed-sender.ts` — no nonce tracking, no timestamp
**Attack:** Network observer records a sealed envelope → replays it later → recipient unseals and processes it again (creates duplicate message or worse, replays a session establishment).
**Fix:** Include a timestamp + monotonic counter inside the sealed envelope. Recipient rejects envelopes older than 5 minutes or with a counter <= last seen.

### F14. Go Transparency Proof Loads ALL Identity Keys Into Memory
**File:** `postgres.go:502` — `SELECT "userId", "publicKey" FROM e2e_identity_keys ORDER BY "createdAt" ASC`
**Attack:** At 1M users, this query returns ~32MB of data and builds a Merkle tree in memory on EVERY proof request. DoS via repeated proof requests.
**Fix:** Pre-compute and cache the Merkle tree. Rebuild incrementally on key changes. Or use a dedicated tree structure in PostgreSQL.

---

## TIER 3: MEDIUM (Fix within 90 days)

### F15. No Device Attestation — Rogue Devices
**Attack:** Attacker creates a fake "device" using a custom client that registers keys but doesn't enforce E2E properly. No way to verify the other party is running the legitimate Mizanly app.
**Fix:** Integrate Play Integrity (Android) and App Attest (iOS) into the identity key registration flow.

### F16. PQXDH Responder Not Implemented
**File:** `x3dh.ts:respondX3DH` — no PQ decapsulation
**Attack:** Not an attack per se, but if the initiator uses PQXDH (sends PQ ciphertext), the responder ignores it and derives a classical-only secret. The two sides compute DIFFERENT shared secrets → session establishment fails silently.
**Fix:** Add PQ decapsulation to `respondX3DH` (mirror the initiator's hybrid derivation).

### F17. Decrypted Media Files Persist in Cache Directory
**File:** `media-crypto.ts:302` — writes to `FileSystem.cacheDirectory`
**Attack:** Device forensics → scan cache directory → find decrypted image/audio/video files with predictable names (`decrypted_${timestamp}_${random}`).
**Fix:** Delete decrypted files immediately after display. Use in-memory URIs where possible. Set file protection level to NSFileProtectionComplete on iOS.

### F18. `encryptSmallMediaFile` Returns `mediaKey` as Plain Uint8Array
**File:** `media-crypto.ts:222` — `mediaKey: ctx.mediaKey` in return object
**Attack:** The media key travels through JavaScript memory from the encrypt function to the conversation screen to the JSON.stringify for the E2E payload. Multiple copies exist in the JS heap.
**Fix:** Zero the mediaKey after encoding to base64 for the payload. Don't return it in the result — return the base64-encoded version directly.

### F19. `toBase64` / `fromBase64` Allocate Intermediate Strings
**File:** `crypto.ts:288-304` — `String.fromCharCode` loop + `btoa`
**Attack:** Every base64 encode/decode creates an intermediate JS string containing key material. Strings are immutable in JS — they can't be zeroed and persist until GC.
**Fix:** Use a Uint8Array-native base64 implementation (e.g., `@noble/ciphers/utils` has `bytesToHex`). Or accept this as an inherent JS limitation.

### F20. Multi-Device `getDeviceIds` Doesn't Validate Response
**File:** `multi-device.ts` — `return data.deviceIds ?? [1]`
**Attack:** Compromised server returns a fabricated device list including attacker's device ID → client encrypts messages for the attacker's device → attacker receives copies of all messages.
**Fix:** Verify that returned device IDs match devices the user has explicitly linked. Cache known device IDs locally and flag new devices.

### F21. Group Sender Key Distribution Lacks Acknowledgment
**Attack:** Sender distributes key to 10 members. 3 members are offline. The sender doesn't know which members received the key. Offline members get "[Waiting for encryption keys...]" indefinitely.
**Fix:** Add distribution acknowledgment — each member sends a "key received" signal. Sender retries distribution for members who haven't acknowledged within 30 seconds.

### F22. `assertNonZeroDH` Uses Non-Constant-Time Check
**File:** `x3dh.ts:77` — `dh.every((b) => b === 0)`
**Attack:** Array.every short-circuits on first non-zero byte. Timing reveals whether the DH output is close to all-zeros (indicating a small-subgroup attack attempt).
**Fix:** Use the `constantTimeEqual` function to compare against an all-zero array.

### F23. Encrypted Temp Files Use Predictable Names
**File:** `media-crypto.ts:201-202` — `encrypted_${Date.now()}_${Math.random()...}`
**Attack:** `Math.random()` is not cryptographically secure. An attacker who knows the approximate timestamp can predict the filename and target it for extraction.
**Fix:** Use `generateRandomBytes(16)` converted to hex for the filename suffix.

### F24. Backup Export Includes MMKV Encryption Key
**File:** `storage.ts` (exportAllState) — includes `mmkvEncryptionKey` in backup
**Attack:** If the backup file is intercepted (cloud storage compromise), the attacker gets both the encrypted MMKV file AND the decryption key. Belt AND suspenders are in the same bag.
**Fix:** The AEAD key is derived from the MMKV key. Including the MMKV key in the backup is necessary for restoration. But the backup itself is Argon2id-encrypted. Ensure the backup password is strong (enforce minimum entropy).

### F25. No Panic/Emergency Wipe
**Attack:** User is detained, phone confiscated while unlocked. No way to quickly destroy all crypto state.
**Fix:** Add a "panic wipe" gesture (e.g., triple-press power button or specific pattern) that calls `clearAllE2EState()` + deletes message cache + deletes MMKV files from disk + overwrite SecureStore.

---

## TIER 4: LOW (Fix within 6 months)

### F26. SPK Metadata Stored in SecureStore as Plaintext JSON
**File:** `prekeys.ts:300` — `SecureStore.getItemAsync(SPK_METADATA_KEY)` → `JSON.parse`
**Info:** SPK metadata (keyId, createdAt, previous key IDs) stored as cleartext JSON in SecureStore. Not a direct vulnerability (SecureStore is hardware-backed) but if SecureStore is extracted, the metadata reveals key rotation history.

### F27. `negotiateProtocolVersion` Still Returns Only [1]
**File:** `e2eApi.ts:282` — `const ourVersions = [1]`
**Info:** Even though PQXDH is implemented, the version negotiation still claims we only support version 1. Should be `[1, 2]` when ML-KEM is available.

### F28. No Message Expiry for Skipped Keys Beyond 7 Days
**File:** `double-ratchet.ts:384` — `SKIPPED_KEY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000`
**Info:** Skipped message keys expire after 7 days. This is a Signal spec default. For high-security users, a shorter expiry (24 hours) reduces the window for key extraction attacks.

### F29. Sender Key Distribution Console.warn Leaks Member IDs
**File:** `sender-keys.ts:523` — `console.warn('Failed to distribute sender key to ${memberId}:', err)`
**Info:** Distribution failures log the recipient's member ID to the console. In debug builds, this appears in logs.

### F30. `require()` Calls Inside Hot Path Functions
**File:** `crypto.ts:140,150,327,349` — `require('./native-crypto-adapter')` on every call
**Info:** `require()` is cached by the module system so it's not re-executing, but the lookup adds ~0.01ms per call. In the Double Ratchet (called per message), this is negligible but not zero.

### F31. No Rate Limiting on `send_sealed_message` Per Target
**File:** `chat.gateway.ts` — `send_sealed_message` only has global rate limit
**Info:** An attacker can flood sealed messages to a target. The per-user rate limit checks `client.data.userId` (the sender), but with sealed sender the server shouldn't know who the sender is. Rate limiting by authenticated user is acceptable since the socket still requires Clerk JWT.

### F32. Formal Verification Not Done
**Info:** The Double Ratchet state machine has not been formally verified (Tamarin/ProVerif). Signal has this. A formal verification would mathematically prove the protocol's security properties.

### F33. No Independent Professional Audit
**Info:** This entire audit was done by the same AI that wrote the code. A professional crypto audit firm (Cure53, NCC Group, Trail of Bits) would bring independent eyes. Budget: $50-100K.

---

## SUMMARY: PATH TO A+

| Tier | Findings | Status |
|------|---------|--------|
| **TIER 1 (Critical)** | F1-F6 | 6 findings — blocks "E2E" claim |
| **TIER 2 (High)** | F7-F14 | 8 findings — fix within 30 days |
| **TIER 3 (Medium)** | F15-F25 | 11 findings — fix within 90 days |
| **TIER 4 (Low)** | F26-F33 | 8 findings — fix within 6 months |

**Total: 33 findings across 4 tiers.**

### Grade Calculation
- Current: **B+** (protocol correct, integration gaps, 6 critical integration issues)
- After TIER 1: **A-** (core security functional, no critical gaps)
- After TIER 1+2: **A** (hardened, production-ready)
- After TIER 1+2+3: **A+** (exceeds WhatsApp in multiple areas)
- After TIER 1+2+3+4 + professional audit: **A+++** (best-in-class)
