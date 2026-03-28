# Signal Protocol Deep Audit — Everything That Was Wrong or Missing

> **Date:** 2026-03-27
> **Context:** Third-pass audit after exploring runtime constraints, @noble/* API limits, and network failure modes

---

## Critical Finding #1: Large File Encryption Will Crash The App

**`@noble/ciphers` xchacha20poly1305 does NOT support streaming.** Confirmed in the type definitions — it's atomic encrypt/decrypt only. The entire plaintext must be in memory.

For a 200MB video:
- Load 200MB into Uint8Array → 200MB RAM
- Encrypt → creates new 200MB Uint8Array → 400MB RAM total
- Most phones have 4-6GB total, app gets ~1.5-2GB max
- **App will crash on any file over ~100MB**

### Solution: Manual chunked encryption

Split files into 64KB chunks. Each chunk gets its own XChaCha20-Poly1305 encryption with derived key + chunk index:

```
File: [chunk_0][chunk_1][chunk_2]...[chunk_N]
       64KB    64KB     64KB       ≤64KB

Encrypted: [header][enc_chunk_0][enc_chunk_1]...[enc_chunk_N]
            28B     64KB+16B     64KB+16B       ≤64KB+16B

Header: [version:1B][nonce:24B][chunk_size:2B][total_chunks:4B]
```

Each chunk encrypted with:
- Key: `HKDF(mediaKey, "", "MizanlyChunk", 32)` (same for all chunks)
- Nonce: `HKDF(mediaKey, chunk_index_bytes, "MizanlyChunkNonce", 24)` (unique per chunk)
- AAD: `chunk_index || total_chunks` (prevents reordering/truncation)

Peak memory: ~128KB (one plaintext chunk + one encrypted chunk). Works on $50 phones.

**This changes `media-crypto.ts` from ~200 lines to ~500 lines.** It's the single most important technical change.

---

## Critical Finding #2: Messages Are Lost On App Kill

**Pending messages are stored in `useState` — pure memory.** If the user sends a message and the app is killed before the server confirms receipt, the message is gone forever.

Current flow:
```
User taps send → message added to useState → 5-second undo window → socket.emit()
                                                                         ↓
                                                            app killed here = message lost
```

### Solution: Persistent encrypted message queue

```typescript
// Before encryption:
1. Generate message content
2. Encrypt with Signal Protocol → get ciphertext
3. Save to encrypted MMKV: { id, conversationId, ciphertext, e2eFields, status: 'pending', createdAt }
4. Display in UI from MMKV cache
5. socket.emit() with acknowledgment callback
6. On server ACK → update MMKV status to 'sent'
7. On app reopen → retry all 'pending' messages from MMKV
```

MMKV is synchronous and persists immediately. Even if the app is killed between step 3 and step 5, the encrypted message survives in MMKV and gets retried on next open.

**New file needed:** `signal/offline-queue.ts` (~200 lines)

---

## Critical Finding #3: Socket Emit Has No Error Feedback

Current code (conversation/[id].tsx line 955):
```typescript
socket.emit('send_message', { ... });
// No callback. No error handling. Fire and forget.
```

If the socket is disconnected at the moment of emit, the message vanishes silently.

### Solution: Acknowledgment callbacks

```typescript
socket.emit('send_message', payload, (response: { success: boolean; messageId?: string; error?: string }) => {
  if (response.success) {
    // Update MMKV: status = 'sent', set real messageId
    offlineQueue.markSent(clientId, response.messageId);
  } else {
    // Update MMKV: status = 'failed', increment retryCount
    offlineQueue.markFailed(clientId, response.error);
    // Retry after backoff
  }
});
```

**Server-side change:** `chat.gateway.ts` handleMessage must return acknowledgment:
```typescript
// Currently: return message;
// Change to: callback({ success: true, messageId: message.id });
```

---

## Critical Finding #4: TextEncoder Not Available on Hermes

Hermes (the React Native JS engine) does **NOT** have `TextEncoder`/`TextDecoder` built-in. If `@noble/*` or our Signal code calls `new TextEncoder()`, it crashes at runtime.

### Solution: Use @noble's built-in utilities

`@noble/hashes` accepts `Input = Uint8Array | string` for all functions. When a string is passed, it handles encoding internally. For our own code, use a small utility:

```typescript
// signal/crypto.ts
function utf8ToBytes(str: string): Uint8Array {
  // @noble/hashes/utils exports this
  return utf8ToBytes(str); // from @noble/hashes/utils
}

function bytesToUtf8(bytes: Uint8Array): string {
  // Manual decode (no TextDecoder needed)
  return Array.from(bytes).map(b => String.fromCharCode(b)).join('');
  // OR: use a proper UTF-8 decoder that handles multi-byte
}
```

Better: install `fast-text-encoding` polyfill (~2KB, MIT) that adds global TextEncoder/TextDecoder. Then all standard APIs work.

**Add to deps:** `fast-text-encoding` (polyfill, import once in app entry)

---

## Critical Finding #5: No Multipart Upload For Large Encrypted Files

Current upload: single `fetch(url, { method: 'PUT', body: blob })`. For a 100MB encrypted video, this is:
- One HTTP request with 100MB body
- If connection drops at 99MB, start over
- Presigned URL expires in 5 minutes — might not be enough

### Solution: S3 multipart upload

R2 (Cloudflare) supports S3-compatible multipart upload. Flow:
1. `POST /upload/multipart/initiate` → get uploadId
2. For each 5MB part: `PUT /upload/multipart/part?uploadId=X&partNumber=N` → get ETag
3. `POST /upload/multipart/complete` with all ETags → finalize

**Encrypt + upload in parallel:**
```
Read 64KB → encrypt → buffer until 5MB → upload part → next 5MB
```

Peak memory: ~10MB (one 5MB part being assembled + one being uploaded).
Resumable: if connection drops, retry from last successful part.
Time: max(encrypt, upload) not sum.

**Backend changes needed:** New multipart upload endpoints in `upload.service.ts` (~150 lines)
**Mobile changes needed:** New `streamingUpload.ts` utility (~200 lines)

---

## Critical Finding #6: Presigned URL Expires Too Fast

Current: `expiresIn = 300` (5 minutes). For a 100MB file on a 3G connection:
- Encryption time: ~5-10s (chunked)
- Upload time at 1Mbps: ~800 seconds (13 minutes)
- **Presigned URL expires before upload completes**

### Solution: Extend to 30 minutes for message uploads

```typescript
// upload.service.ts
const expiresIn = folder === 'messages' ? 1800 : 300; // 30 min for messages, 5 min for others
```

With multipart upload, each part gets its own presigned URL (or use a single upload session), so expiry is less of an issue.

---

## Critical Finding #7: @noble/ciphers Needs crypto.getRandomValues Polyfill

@noble/ciphers internally uses `globalThis.crypto.getRandomValues()` for random number generation. React Native (Hermes) doesn't provide this natively.

### Solution: Polyfill before any @noble import

```typescript
// apps/mobile/app/_layout.tsx (top of file, before any imports)
import 'react-native-get-random-values'; // Polyfills globalThis.crypto.getRandomValues
```

OR use `expo-crypto` and manually set:
```typescript
import { getRandomBytes } from 'expo-crypto';
if (!globalThis.crypto) globalThis.crypto = {} as Crypto;
if (!globalThis.crypto.getRandomValues) {
  globalThis.crypto.getRandomValues = <T extends ArrayBufferView>(array: T): T => {
    const bytes = getRandomBytes(array.byteLength);
    new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(bytes);
    return array;
  };
}
```

**Add to deps:** `react-native-get-random-values` (if not using expo-crypto polyfill)

---

## Critical Finding #8: No Local Database For Message Cache

The app uses React Query (in-memory) for message caching. When the app restarts, all messages are re-fetched from the server. With E2E, re-fetching means re-decrypting every message on every app open.

For a conversation with 1,000 messages:
- Fetch 1,000 encrypted messages from server
- Decrypt each one (HMAC + XChaCha20 per message)
- ~5ms per message × 1,000 = **5 seconds to open a conversation**

### Solution: Persist decrypted messages in encrypted MMKV

```typescript
// After decrypting a message, cache it:
mmkv.set(`msg:${conversationId}:${messageId}`, JSON.stringify({
  id: messageId,
  content: decryptedContent, // plaintext
  timestamp: createdAt,
  senderId: senderId,
}));

// On conversation open:
// 1. Load from MMKV cache instantly (0ms)
// 2. Fetch new messages from server in background
// 3. Decrypt only NEW messages
// 4. Merge into cache
```

MMKV is encrypted with a key from SecureStore — so decrypted messages at rest are still encrypted on disk, just with a device-local key rather than the Signal session key.

**This is what makes the app feel "Telegram-fast"** — local cache renders instantly, network fetch happens in the background.

**New file needed:** `signal/message-cache.ts` (~200 lines)

---

## Critical Finding #9: No Client-Side Search Index

Server can't search encrypted messages. Without a local search index, users lose message search entirely.

### Solution: Encrypted local search index

On every message decrypt, index the content:
```typescript
// signal/search-index.ts
function indexMessage(conversationId: string, messageId: string, content: string, timestamp: number) {
  // Tokenize content into words
  const tokens = content.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  for (const token of tokens) {
    const key = `idx:${token}`;
    const existing = mmkv.getString(key);
    const entries = existing ? JSON.parse(existing) : [];
    entries.push({ conversationId, messageId, timestamp });
    // Keep max 100 entries per token to bound storage
    if (entries.length > 100) entries.shift();
    mmkv.set(key, JSON.stringify(entries));
  }
}

function search(query: string): SearchResult[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  // Intersect results across all query tokens
  // Return sorted by timestamp desc
}
```

This is a simple inverted index in MMKV. Not as good as SQLite FTS, but works for basic keyword search without any native dependencies. Stored in the same encrypted MMKV instance.

**New file needed:** `signal/search-index.ts` (~200 lines)

---

## Critical Finding #10: Push Notification Encrypted Preview

iOS APNs and FCM both have 4KB payload limits. Current notification is ~200 bytes. We have room for an encrypted preview.

### Solution: Include encrypted preview in push data

```typescript
// Mobile (sender side):
const preview = plaintext.slice(0, 100); // First 100 chars
const encryptedPreview = signalService.encryptPreview(recipientId, preview);
// ~150 bytes base64

// Server stores in notification job:
{ title: senderName, body: "New message", data: { encryptedPreview, conversationId } }

// Mobile (receiver side, in notification handler):
// For foreground notifications:
const preview = await signalService.decryptPreview(senderId, data.encryptedPreview);
showLocalNotification({ title: senderName, body: preview });

// For iOS background (Notification Service Extension):
// NSE loads session from shared MMKV (App Group required)
// Decrypts preview → modifies notification content → displays
```

**For launch:** Just show "New message from X" (no preview). Add NSE later.
**iOS NSE requires:** App Group entitlement, shared MMKV, custom Expo config plugin. This is a separate 1-week project.

---

## Critical Finding #11: Protocol Versioning

If the crypto audit finds a flaw, we need to upgrade the protocol without breaking existing sessions.

### Solution: Version field + negotiation

```typescript
// e2eVersion values:
// 1 = Initial Signal-inspired protocol (XChaCha20-Poly1305)
// 2 = Future: post-quantum hybrid (if needed)
// 3+ = Reserved

// On session creation, both parties record the protocol version
// Messages include e2eVersion in their header
// Recipient checks version before decrypting

// If we need to upgrade:
// 1. Ship app update with version 2 support
// 2. New sessions use version 2 by default
// 3. Existing sessions continue at version 1
// 4. After transition period, require minimum version 2
```

Already partially in the plan (`e2eVersion` field on Message), but the negotiation logic was missing.

---

## Critical Finding #12: Crypto Operations Must Never Be Logged

Current encryption.ts has `console.warn` in development. Session keys, message keys, and identity keys must NEVER appear in logs, crash reports, or Sentry.

### Solution: Strict no-log policy in signal/ directory

```typescript
// signal/crypto.ts — top of file
const CRYPTO_LOG_PREFIX = '[Signal]';

// Only log: operation name + success/failure
// NEVER log: key material, plaintext, session state, nonces
function cryptoLog(operation: string, success: boolean) {
  if (__DEV__) {
    console.log(`${CRYPTO_LOG_PREFIX} ${operation}: ${success ? 'OK' : 'FAIL'}`);
  }
}

// Sentry breadcrumbs: strip all crypto data
Sentry.addBreadcrumb({
  category: 'signal',
  message: 'Session created',
  data: { recipientId }, // OK: user ID
  // NEVER: { sessionState, rootKey, chainKey }
});
```

---

## Critical Finding #13: Replay Attack Protection

The server could re-deliver an old encrypted message. The Double Ratchet's counter prevents decryption of the same message twice (the key is deleted after use), but we need explicit handling:

```typescript
// On decrypt:
const messageKey = `${senderId}:${ratchetKey}:${counter}`;
if (usedMessageKeys.has(messageKey)) {
  throw new Error('Replay detected: message already decrypted');
}
usedMessageKeys.add(messageKey);
// Persist to MMKV to survive app restart
```

---

## Critical Finding #14: Pre-Key Depletion Attack

An attacker could rapidly fetch a user's pre-key bundles, exhausting all one-time pre-keys. X3DH still works without OTPs (3 DH instead of 4), but forward secrecy is weaker.

### Solution: Per-requester rate limit on bundle fetch

```typescript
// e2e.controller.ts
@Throttle({ default: { limit: 5, ttl: 3600000 } }) // 5 bundle fetches per target per hour
@Get('keys/bundle/:userId')
async getPreKeyBundle(@CurrentUser('id') requesterId, @Param('userId') targetId) {
  // Rate limit key includes BOTH requester and target
  // Prevents one user from depleting another's OTPs
}
```

---

## Critical Finding #15: Batch Pre-Key Bundle Fetch for Groups

For a 100-member group, fetching bundles one-by-one = 100 API calls. Need batch endpoint:

```typescript
// New endpoint
@Post('keys/bundles/batch')
async getBatchBundles(@Body() dto: { userIds: string[] }) {
  // Max 100 users per request
  // Returns array of bundles
  // Atomically claims one OTP per user
  // Serializable transaction across all claims
}
```

---

## Critical Finding #16: Safety Number Computation is Expensive

5,200 HMAC iterations per fingerprint × 2 fingerprints = 10,400 HMAC-SHA256 operations. On Hermes this could take 100-500ms.

### Solution: Cache and compute in background

```typescript
// Compute on first conversation open, cache in MMKV
const cacheKey = `safety:${ourId}:${theirId}`;
const cached = mmkv.getString(cacheKey);
if (cached) return cached;

// Compute in background (don't block UI)
requestIdleCallback(async () => {
  const safetyNumber = computeSafetyNumber(ourKey, ourId, theirKey, theirId);
  mmkv.set(cacheKey, safetyNumber);
});

// Invalidate cache when identity key changes
```

---

## Updated File Inventory (v3)

### New files (was 16, now 21)

| File | ~Lines | Purpose | New? |
|------|--------|---------|------|
| `signal/types.ts` | 150 | All Signal Protocol types | v1 |
| `signal/crypto.ts` | 250 | @noble/* wrapper + TextEncoder polyfill + no-log policy | Updated |
| `signal/storage.ts` | 300 | SecureStore + encrypted MMKV + session mutex | Updated |
| `signal/prekeys.ts` | 300 | Pre-key generation/rotation | v1 |
| `signal/x3dh.ts` | 500 | X3DH key agreement | v1 |
| `signal/double-ratchet.ts` | 800 | Double Ratchet with XChaCha20-Poly1305 + replay protection | Updated |
| `signal/session.ts` | 400 | Session lifecycle + concurrency lock + version negotiation | Updated |
| `signal/sender-keys.ts` | 300 | Group encryption | v1 |
| `signal/media-crypto.ts` | 500 | **Chunked** file encrypt/decrypt (64KB chunks, streaming) | **Rewritten** |
| `signal/safety-numbers.ts` | 120 | HMAC-SHA256 fingerprints + background compute + cache | Updated |
| `signal/index.ts` | 450 | Public API + session pre-warming | Updated |
| `signal/offline-queue.ts` | 200 | **Persistent encrypted message queue in MMKV** | **NEW** |
| `signal/message-cache.ts` | 200 | **Decrypted message cache in encrypted MMKV** | **NEW** |
| `signal/search-index.ts` | 200 | **Client-side inverted index for message search** | **NEW** |
| `signal/streaming-upload.ts` | 200 | **Multipart upload piped from chunked encryption** | **NEW** |
| `api/modules/e2e/e2e.module.ts` | 15 | NestJS module | v1 |
| `api/modules/e2e/e2e.controller.ts` | 250 | Endpoints + batch bundle + per-requester rate limit | Updated |
| `api/modules/e2e/e2e.service.ts` | 350 | Key management + batch operations | Updated |
| `api/modules/e2e/dto/*.ts` | 150 | Validation DTOs | v1 |
| `api/modules/upload/upload.service.ts` | +150 | **Multipart upload endpoints** | **NEW section** |
| Test files | 1800 | Unit + integration + test vectors | Updated |

**Total new code: ~7,585 lines** (was 5,765)

### Additional dependencies needed

| Package | Purpose | License | Size |
|---------|---------|---------|------|
| `@noble/curves` | X25519, Ed25519 | MIT | 140KB |
| `@noble/ciphers` | XChaCha20-Poly1305 | MIT | 50KB |
| `@noble/hashes` | HKDF, HMAC-SHA256, SHA-256 | MIT | 80KB |
| `expo-crypto` | getRandomBytes (CSPRNG) | MIT | Already in types |
| `fast-text-encoding` | TextEncoder/TextDecoder polyfill for Hermes | MIT | 2KB |
| `react-native-get-random-values` | globalThis.crypto.getRandomValues polyfill | MIT | 3KB |

### Modified files (was 15, now 18)

All previous 15 plus:
- `apps/mobile/app/_layout.tsx` — import polyfills at top (before any other imports)
- `apps/mobile/src/utils/offlineQueue.ts` — extend to support 'message' type
- `apps/api/src/modules/upload/upload.service.ts` — add multipart upload endpoints + extend presigned URL TTL

---

## Summary: What Changed From v2 to v3

| Area | v2 Plan | v3 Plan (after deep audit) |
|------|---------|--------------------------|
| Media encryption | Single atomic encrypt (~200 lines) | Chunked 64KB streaming encrypt (~500 lines) |
| Message persistence | Lost on app kill | Encrypted MMKV queue survives app kill |
| Socket reliability | Fire-and-forget | Acknowledgment callbacks + retry |
| Upload strategy | Single PUT | Multipart streaming (encrypt + upload parallel) |
| Presigned URL TTL | 5 minutes (too short) | 30 minutes for messages |
| TextEncoder | Assumed available | Polyfill required (Hermes doesn't have it) |
| crypto.getRandomValues | Assumed available | Polyfill required (Hermes doesn't have it) |
| Local message cache | None (re-decrypt on every open) | Encrypted MMKV cache (instant open) |
| Message search | Disabled (no solution) | Client-side inverted index in MMKV |
| Push previews | Generic "New message" | Encrypted preview in push data (decrypted on device) |
| Safety numbers | Compute on demand | Background compute + MMKV cache |
| Replay protection | Implicit (counter-based) | Explicit used-key tracking |
| Pre-key depletion | No protection | Per-requester rate limit on bundle fetch |
| Group bundle fetch | One-by-one (100 API calls) | Batch endpoint (1 API call for 100 users) |
| Crypto logging | console.warn in dev | Strict no-log policy, Sentry data stripping |
| Protocol versioning | e2eVersion field exists | Full negotiation + upgrade path |
| Total lines | ~5,765 | ~7,585 |

---

## The "Telegram-Fast" Checklist

These 5 things make E2E encryption feel as fast as Telegram's plaintext:

| # | Feature | Status in v3 | Why it matters |
|---|---------|-------------|---------------|
| 1 | **Session pre-warming** | In signal/index.ts | First message <5ms instead of 300-700ms |
| 2 | **Chunked encrypt + parallel upload** | In media-crypto.ts + streaming-upload.ts | 200MB video: 15s total instead of 30s. Won't crash. |
| 3 | **Encrypted thumbnail in message** | In conversation screen | Image previews appear instantly without downloading full image |
| 4 | **Persistent decrypted message cache** | In message-cache.ts | Conversation opens instantly from local cache |
| 5 | **Client-side search index** | In search-index.ts | Search works offline, no server needed |

Without these 5, E2E encryption feels noticeably slower than Telegram. With them, users can't tell the difference.
