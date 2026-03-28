# Signal Protocol — Complete Decision Log & Plan (v3 Final)

> **Date:** 2026-03-27
> **Context:** Session conversation between Shakhzod and Claude Opus 4.6
> **Plan version:** v3 (3 rounds of deep audit)
> **Related files:**
> - Implementation plan: `~/.claude/plans/hazy-singing-perlis.md`
> - Multi-device plan: `docs/plans/2026-03-27-multi-device-e2e-plan.md`
> - Deep audit findings: `docs/plans/2026-03-27-signal-protocol-deep-audit.md`

---

## Part 1: Architecture Decisions (Before Encryption)

### Starting Question: "Is TypeScript even a good choice?"

**Research: What real platforms use**

| Platform | Started With | Now | Rewrote? |
|----------|-------------|-----|----------|
| Instagram | Python/Django | Python/Django (still) | Never — 2B+ users on Django |
| YouTube | Python | Python + C++ + Go | Gradual (Google infra) |
| WhatsApp | Erlang/FreeBSD | Erlang/FreeBSD (still) | Never — 32 engineers → 450M users |
| Telegram | C++ | C++ (closed source) | Never — ~30 engineers → 800M users |
| TikTok | Go + Python | Go + Python + Rust | Started modern |
| Twitter | Ruby on Rails | Scala + Java | Yes, at ~200M users ("Fail Whale") |
| Discord | Elixir + Python | Elixir + Rust | Surgical per-service |
| Facebook | PHP | Hack (invented a new language) | At 1.2B users |

**Conclusion:** TypeScript/NestJS is fine to ~50K heavy users. After that, surgical extraction — not a full rewrite.

### Decision: Future extraction roadmap

| Order | What | Language | Why |
|-------|------|----------|-----|
| 1 | Ship the app | TypeScript | Nothing matters until users exist |
| 2 | Feed scoring + workers | Go | CPU-bound. TikTok's backend is Go. |
| 3 | Notifications | Go | High throughput push delivery |
| 4 | Real-time messaging | Elixir/Phoenix | BEAM VM — WhatsApp hit 2.8M connections/server |
| 5 | Group calls | LiveKit (deploy) | Open-source Go SFU. Don't build a media server. |

### Decision: Replace P2P WebRTC with LiveKit entirely

Previous sessions rewrote `useWebRTC.ts` with 13 fixes — tunnel vision. P2P WebRTC is the wrong architecture for the product vision (group calls, broadcasting, screen sharing).

- Current P2P code still broken (3 missing socket emits, CallType mismatch)
- LiveKit handles 1:1 AND group in one code path
- 1:1 latency penalty: +10-50ms (imperceptible)
- ~1,500 lines broken code → ~150 lines that handle everything
- LiveKit Cloud free tier: 1,000 participant-min/month. Self-host on Hetzner when bill > $50/month.
- NOT on Railway (WebRTC needs UDP ports, fixed IP)

---

## Part 2: Telegram's Encryption Is NOT What People Think

**Telegram is NOT encrypted end-to-end by default.** Their own FAQ confirms this.

| Mode | Multi-device? | Search? | Server reads messages? |
|------|-------------|---------|----------------------|
| **Cloud Chats** (default, 99% of usage) | Yes, instant | Yes | **YES** |
| **Secret Chats** (opt-in, buried in UI) | **NO — single device** | No | No |

Telegram's "speed" comes from the server doing everything (search, previews, sync) because it has full plaintext access. Their Secret Chats (actual E2E) are single-device only, no search, no backup — worse than what we're building.

**What we're building:** WhatsApp-style (E2E by default) with Telegram-fast UX (local caching, pre-warming, background decryption).

---

## Part 3: Why Build Our Own Signal Protocol

### The encryption audit revealed

- TweetNaCl imported but NOT installed — encryption service is dead code
- Messages flow as plaintext (server sees everything)
- `isEncrypted` field exists but never set to true
- Safety numbers use trivial djb2 hash — cryptographically meaningless

### Options considered

| Option | License | Works in RN? | Verdict |
|--------|---------|-------------|---------|
| `@signalapp/libsignal-client` (official) | AGPL-3.0 | NO (desktop N-API only) | Eliminated |
| `@privacyresearch/libsignal-protocol-typescript` | GPL-3.0 | YES | Eliminated — must open-source app |
| `@wireapp/proteus` | GPL-3.0 | Untested | Eliminated — GPL + incomplete |
| Build from `@noble/*` | MIT | YES | **CHOSEN** |
| Commercial SDK (Seald, Virgil) | Proprietary | YES | Eliminated — vendor dependency |

**Why build our own:** MIT license (closed-source OK), Cure53-audited primitives, Signal specs have pseudocode, full control.

**Non-negotiable:** Professional crypto audit ($10-20K) before claiming E2E publicly.

### Decision: XChaCha20-Poly1305 over AES-256-CBC + HMAC

External feedback correctly pointed out: use AEAD, not CBC+HMAC.

| | AES-256-CBC + HMAC (Signal spec) | XChaCha20-Poly1305 (our choice) |
|---|---|---|
| Operations | Three: encrypt + pad + MAC | One: AEAD (auth built-in) |
| Composition bugs | Padding oracle, MAC ordering | Eliminated |
| Padding | PKCS#7 required | None (stream cipher) |
| Nonce | 16-byte IV | 24-byte (safe with HKDF-derived) |
| ARM performance | Slower without AES-NI | Faster on mobile |

**Trade-off:** We deviate from Signal spec on the cipher. Protocol logic identical. We call it "Signal-inspired protocol with modern ciphers."

---

## Part 4: What Breaks With E2E (9 Server Dependencies)

| Feature | Server reads content? | Mitigation |
|---------|----------------------|------------|
| **lastMessageText** | `content.slice(0,100)` on Conversation | `encryptedLastMessagePreview` field, client decrypts |
| **Push notifications** | Message preview in body | Generic "New message from X". Future: iOS NSE |
| **Message search** | `content: { contains: query }` | Disable server search. Client-side inverted index in MMKV |
| **Voice transcription** | Server fetches audio → Whisper | Skip for encrypted. Future: client-side Whisper |
| **Message forwarding** | Reads original, copies to new | Server returns 400. Client-side decrypt → re-encrypt |
| **Chat export** | Reads all content | Client-side export with decryption |
| **Message editing** | Validates new content | Accept encrypted bytes as-is |
| **Notification body** | Truncated plaintext | "[Encrypted message]" |
| **Media files** | Uploaded unencrypted to R2 | Client-side chunked encryption before upload |

**Safe as-is:** Read receipts, reactions, deletion, disappearing messages, unread count, view-once, starred/pinned flags, typing, delivery receipts.

---

## Part 5: Deep Audit Findings (v3 — 16 Critical Issues)

### 1. Large file encryption crashes the app

`@noble/ciphers` xchacha20poly1305 is **atomic — not streaming.** 200MB video = 400MB RAM = crash.

**Solution:** 64KB chunked encryption. Each chunk gets its own XChaCha20-Poly1305 with HKDF-derived key + chunk index in AAD. Peak memory: 128KB. Works on $50 phones.

### 2. Messages lost on app kill

Pending messages in `useState` — pure memory. App killed mid-send = message gone.

**Solution:** Persistent encrypted MMKV queue. Encrypt → save to MMKV → send → ACK → mark sent. Retry all 'pending' on app reopen.

### 3. Socket emit has no error feedback

`socket.emit('send_message', {...})` — fire and forget. No callback, no error handling.

**Solution:** Acknowledgment callbacks. Server returns `{ success, messageId }`. Client updates MMKV queue status.

### 4. TextEncoder not available on Hermes

Hermes doesn't have `TextEncoder`/`TextDecoder`. @noble/* and our code will crash.

**Solution:** Import `fast-text-encoding` polyfill FIRST in `_layout.tsx`.

### 5. crypto.getRandomValues not available on Hermes

@noble/* needs `globalThis.crypto.getRandomValues()`. Hermes doesn't provide it.

**Solution:** Import `react-native-get-random-values` FIRST in `_layout.tsx`.

### 6. No multipart upload for large encrypted files

Single `fetch(url, { method: 'PUT', body: blob })`. 100MB fails on slow connection. No resume.

**Solution:** S3-compatible multipart upload. Encrypt in 64KB chunks → buffer to 5MB parts → upload parts. Resumable on connection drop.

### 7. Presigned URL expires too fast

Current: 5 minutes. 100MB on 3G at 1Mbps = 13 minutes. URL expires mid-upload.

**Solution:** 30 minutes for message uploads.

### 8. No local message cache

React Query (memory only). App restart = re-fetch + re-decrypt every message. 1000 messages × 5ms = 5 seconds to open a conversation.

**Solution:** Encrypted MMKV message cache. Decrypt once, cache forever. Conversation opens instantly from local cache. Only decrypt NEW messages.

### 9. No client-side search

Server can't search encrypted. Users lose search entirely.

**Solution:** Inverted index in encrypted MMKV. Tokenize on every decrypt. Keyword search returns conversationId + messageId.

### 10. Session pre-warming missing

First message to new contact = 300-700ms (bundle fetch + DH ops).

**Solution:** Pre-fetch bundles for top 20 conversations on app open. Create sessions in background before user types.

### 11. Thumbnail not in message

Image sent → conversation list shows blank until full image downloads + decrypts.

**Solution:** Client generates 64×64 blurhash (~2KB), embeds in encrypted message body. Recipient sees thumbnail instantly.

### 12. Encrypt + upload should be parallel

Sequential: encrypt file (5s) + upload file (10s) = 15s.

**Solution:** Pipe encrypted chunks directly to multipart upload. Total = max(5s, 10s) = 10s.

### 13. Replay attack protection

Server could re-deliver old encrypted messages. Double Ratchet deletes used keys, but need explicit tracking.

**Solution:** Track used `(senderId, ratchetKey, counter)` tuples in MMKV. Reject duplicates.

### 14. Pre-key depletion attack

Attacker rapidly fetches victim's pre-key bundles, exhausting one-time pre-keys.

**Solution:** Per-requester rate limit on bundle fetch (5 per target per hour).

### 15. Batch bundle fetch for groups

100-member group = 100 API calls for bundles. Too slow.

**Solution:** `POST /e2e/keys/bundles/batch` — fetch up to 100 bundles in one request.

### 16. Crypto operations must never be logged

Session keys, message keys, plaintext in logs = security disaster.

**Solution:** Strict no-log policy. Only log operation name + success/failure. Strip all crypto data from Sentry breadcrumbs.

---

## Part 6: Verified Runtime Environment

| Component | Status | Notes |
|-----------|--------|-------|
| Hermes engine | 0.25+ on Expo 52 | BigInt supported since 0.11 |
| TextEncoder | NOT native | Need `fast-text-encoding` polyfill |
| crypto.getRandomValues | NOT native | Need `react-native-get-random-values` polyfill |
| expo-secure-store | v15 installed | ~4KB per item. Good for identity key. |
| react-native-mmkv | v3.2.0 installed | Native encryption. Good for sessions + cache. |
| expo-crypto | Types exist | getRandomBytes() available |
| @noble/ciphers | NOT installed | Pure JS, Hermes-compatible with polyfills |
| @noble/curves | NOT installed | Pure JS, needs BigInt (Hermes has it) |
| Local database | NONE | No SQLite/Realm/Watermelon. Using React Query + MMKV |
| iOS App Groups | NOT configured | Needed for NSE (future) |

### Verified @noble/* API

| Function | Confirmed | Import |
|----------|-----------|--------|
| `xchacha20poly1305(key, nonce, aad?).encrypt(pt)` | Yes | `@noble/ciphers/chacha` |
| `xchacha20poly1305` streaming | **NO — atomic only** | Must chunk manually |
| `ed25519.utils.toMontgomery(pubkey)` | Yes | `@noble/curves/ed25519` |
| `ed25519.utils.toMontgomerySecret(privkey)` | Yes | `@noble/curves/ed25519` |
| `x25519.utils.randomSecretKey()` | Yes | `@noble/curves/ed25519` |
| `hkdf(hash, ikm, salt, info, length)` | Yes | `@noble/hashes/hkdf` |
| Node.js crypto required? | No — optional polyfill | Uses globalThis.crypto first |

---

## Part 7: The Complete Plan (v3)

### Phase summary

| Phase | What | Files | Lines |
|-------|------|-------|-------|
| 1 | Dependencies + Prisma schema | 0 new | schema changes |
| 1.5 | Hermes polyfills (MUST be first import) | 0 new | 2 import lines |
| 2 | Crypto primitives (`types.ts`, `crypto.ts`, `storage.ts`) | 3 | ~700 |
| 3 | X3DH (`prekeys.ts`, `x3dh.ts`) | 2 | ~800 |
| 4 | Double Ratchet (`double-ratchet.ts`, `session.ts`) | 2 | ~1,200 |
| 5 | Media encryption (`media-crypto.ts`, `streaming-upload.ts`) | 2 | ~700 |
| 6 | Group encryption (`sender-keys.ts`) | 1 | ~300 |
| 7 | Safety numbers (`safety-numbers.ts`) | 1 | ~120 |
| 7.5 | Telegram-fast infra (`offline-queue`, `message-cache`, `search-index`) | 3 | ~600 |
| 8 | Server endpoints (`e2e/` module + multipart upload) | 5 | ~915 |
| 9 | Mobile integration (`index.ts` + screens + socket ACK) | 1 | ~450 |
| 10 | Migration + cleanup | 0 | delete 2 files |
| 11 | Tests | 8+ | ~1,800 |
| **Total** | | **21 new files** | **~7,585 lines** |

### Dependencies (6 new packages, all MIT)

| Package | Purpose |
|---------|---------|
| `@noble/curves` | X25519, Ed25519 |
| `@noble/ciphers` | XChaCha20-Poly1305 |
| `@noble/hashes` | HKDF, HMAC-SHA256 |
| `expo-crypto` | getRandomBytes (CSPRNG) |
| `fast-text-encoding` | TextEncoder polyfill for Hermes |
| `react-native-get-random-values` | crypto.getRandomValues polyfill for Hermes |

### Modified files (18)

- `apps/api/prisma/schema.prisma` — 4 new models, Message/Conversation/User fields
- `apps/api/src/app.module.ts` — register E2EModule
- `apps/api/src/modules/messages/messages.service.ts` — e2e fields, forward guard, search skip, ACK
- `apps/api/src/modules/messages/messages.controller.ts` — e2e DTO fields
- `apps/api/src/gateways/dto/send-message.dto.ts` — e2e fields
- `apps/api/src/gateways/chat.gateway.ts` — e2e passthrough + ACK callback
- `apps/api/src/modules/notifications/push.service.ts` — generic body + encrypted preview data
- `apps/api/src/modules/ai/ai.service.ts` — skip transcription for encrypted
- `apps/api/src/modules/upload/upload.service.ts` — multipart endpoints + 30min TTL
- `apps/mobile/package.json` — 6 new deps
- `apps/api/package.json` — @noble/curves, @noble/hashes
- `apps/mobile/app/_layout.tsx` — polyfill imports (FIRST)
- `apps/mobile/src/services/encryptionApi.ts` — replace with /e2e/* client
- `apps/mobile/src/types/encryption.ts` — Signal Protocol types
- `apps/mobile/src/utils/offlineQueue.ts` — extend for messages
- `apps/mobile/app/(screens)/conversation/[id].tsx` — 7 touch points + socket ACK
- `apps/mobile/app/(screens)/verify-encryption.tsx` — real safety numbers
- `apps/mobile/app/(tabs)/risalah.tsx` — decrypt preview from cache

### Deleted files (2)
- `apps/mobile/src/services/encryption.ts`
- `apps/mobile/src/types/tweetnacl.d.ts`

---

## Part 8: What Makes It "Telegram-Fast"

| # | Feature | What it does | Without it |
|---|---------|-------------|-----------|
| 1 | Session pre-warming | Pre-fetch bundles + create sessions on app open | First message: 300-700ms delay |
| 2 | Chunked encrypt + parallel upload | 64KB chunks piped to multipart upload | 200MB video: 30s sequential, crashes on RAM |
| 3 | Encrypted thumbnail in message | 64×64 blurhash embedded in Signal message | Blank placeholder until full download |
| 4 | Persistent decrypted cache (MMKV) | Conversation opens from local cache | 5 seconds to open 1000-message conversation |
| 5 | Client-side search index | Inverted index in encrypted MMKV | No search at all |

---

## Part 9: Deferred (Separate Projects)

| Feature | Why deferred | Plan file |
|---------|-------------|-----------|
| Multi-device | Signal did single-device for 7 years | `2026-03-27-multi-device-e2e-plan.md` |
| Key backup | Encrypted cloud backup needs Argon2 + UI | Same file |
| iOS NSE | Needs App Group + custom Expo plugin | Separate 1-week project |
| Client-side voice transcription | On-device Whisper | Post-launch |
| Certificate pinning | MITM protection | `react-native-ssl-pinning` |
| Key transparency | Append-only public key log | Major project |
| Sealed sender | Hide sender identity from server | Major project |

---

## Part 10: Risks

1. **Protocol composition (HIGHEST)** — Audit ($10-20K) mandatory before claiming E2E
2. **Hermes polyfills** — TextEncoder + crypto.getRandomValues. Import FIRST or everything crashes
3. **Large file crash** — xchacha20poly1305 is atomic. MUST use 64KB chunks. Without: 200MB = 400MB RAM = crash
4. **Hermes BigInt** — DH ops infrequent. Profile on $50 Android
5. **Session concurrency** — Async mutex per session
6. **Large groups (100+)** — Batch bundle fetch + lazy sessions
7. **Presigned URL expiry** — Extended to 30min
8. **Message persistence** — MMKV offline queue (not useState)
9. **Socket reliability** — ACK callbacks (not fire-and-forget)
10. **Replay attacks** — Track used counters in MMKV
11. **Pre-key depletion** — Per-requester rate limit
12. **Crypto logging** — NEVER log keys/plaintext. Strip from Sentry
13. **No multi-device** — Phone switch = reset. Separate project
14. **No key backup** — Phone loss = can't decrypt old. Separate project

---

## Part 11: Timeline

| When | What |
|------|------|
| **Now** | Ship the app WITHOUT E2E claims. HTTPS + encrypted at rest. |
| **Post-launch** | Build Signal Protocol (~2-3 weeks with Opus) |
| **After build** | Internal testing: two emulators, all message types (~3-4 days) |
| **After testing** | Professional crypto audit ($10-20K, Cure53/Trail of Bits/NCC Group, 2-4 weeks) |
| **After audit** | Enable E2E, announce as feature |
| **+1 month** | Multi-device (per-device keys + client fanout) |
| **+2 months** | Encrypted cloud backup |
| **+3 months** | Second audit for multi-device additions |

**DO NOT claim E2E before the audit.** A broken implementation is worse than no implementation — it gives users false confidence that their messages are private when they're not. For your audience, that's not a bug — it's a betrayal of trust.
