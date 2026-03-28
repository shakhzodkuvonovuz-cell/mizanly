/**
 * Sealed Sender (C11): Hide sender identity from the server.
 *
 * Normal flow: server sees { senderId, recipientId, ciphertext }
 * Sealed sender: server sees { recipientId, sealedEnvelope }
 *   — the sender's identity is INSIDE the encrypted envelope.
 *
 * Implementation:
 * 1. Sender generates ephemeral X25519 key pair
 * 2. Sender fetches recipient's identity key (from TOFU store or server)
 * 3. DH(ephemeral, recipientIdentityX25519) → sharedSecret
 * 4. Encrypt { senderId, deviceId, innerCiphertext } with sharedSecret
 * 5. Server receives { recipientId, ephemeralKey, sealedCiphertext }
 *    — server CANNOT determine who sent the message from the envelope alone
 *
 * The recipient:
 * 1. Uses their identity private key to compute DH(identityX25519, ephemeralKey)
 * 2. Decrypts the sealed envelope → reveals senderId + innerCiphertext
 * 3. Routes to the correct session for final decryption
 *
 * KNOWN LIMITATIONS (V6 audit):
 *
 * V6-F1: The WebSocket is authenticated via Clerk JWT. The server routes sealed
 * messages to `user:${recipientId}` (not the conversation room), reducing metadata
 * exposure, but the server still knows the sender from the socket authentication.
 * The DB persists senderId due to schema constraints. Full sealed sender privacy
 * against the server requires an unauthenticated delivery transport (future work).
 *
 * V6-F4: Even with an unauthenticated delivery path, the sender's authenticated
 * socket creates a timing correlation vector. A compromised server can correlate
 * sealed message send timestamps with socket authentication timestamps to identify
 * the sender. Full mitigation requires a SEPARATE unauthenticated transport channel
 * for sealed message delivery (e.g., anonymous HTTP PUT with delivery token).
 *
 * Current protection scope: sealed sender protects against PASSIVE network observers
 * (ISP, CDN, co-located tenants) and limits metadata visible to the server's routing
 * layer. It does NOT fully protect against an active adversary with DB + socket access.
 */

import {
  generateX25519KeyPair,
  x25519DH,
  edToMontgomeryPub,
  edToMontgomeryPriv,
  hkdfDeriveSecrets,
  aeadEncrypt,
  aeadDecrypt,
  concat,
  utf8Encode,
  utf8Decode,
  toBase64,
  fromBase64,
  zeroOut,
  assertNonZeroDH,
  ed25519Sign,
  ed25519Verify,
  constantTimeEqual,
} from './crypto';
import { loadIdentityKeyPair, loadKnownIdentityKey, secureStore, secureLoad, HMAC_TYPE } from './storage';

const SEALED_SENDER_INFO = 'MizanlySealedSender';

// V5: assertNonZeroDH + LOW_ORDER_POINTS imported from crypto.ts (single source of truth)

/**
 * F13: Sealed sender replay protection.
 *
 * Each sealed envelope includes a timestamp and monotonic counter.
 * Recipients reject envelopes that are:
 * - Older than 5 minutes (prevents delayed replay)
 * - Have a counter <= the last seen counter for that sender (prevents immediate replay)
 *
 * The counter is tracked per-sender in MMKV (AEAD-wrapped, HMAC-hashed key).
 */
const SEALED_REPLAY_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
/**
 * V4-F4: Persisted monotonic counter for sealed sender.
 * Previously reset to 0 on app restart, allowing replay within the 5-minute timestamp window.
 * Now loaded from MMKV on first use and persisted on every increment.
 */
let sealedSenderCounter = 0;
let sealedCounterLoaded = false;

/** Reset sealed sender state on logout. Called by clearAllE2EState. */
export function resetSealedSenderState(): void {
  sealedSenderCounter = 0;
  sealedCounterLoaded = false;
}

/** Sealed envelope: server sees this, cannot determine sender */
export interface SealedEnvelope {
  recipientId: string;
  ephemeralKey: string;       // Base64 X25519 public key
  sealedCiphertext: string;   // Base64 encrypted { senderId, deviceId, content }
}

/** Inner content revealed after unsealing */
export interface UnsealedContent {
  senderId: string;
  senderDeviceId: number;
  innerContent: string;       // Base64 of the actual Signal/SenderKey message
}

/**
 * Seal a message — hide sender identity from server.
 *
 * @param recipientId - Recipient's user ID
 * @param recipientIdentityKey - Recipient's Ed25519 public identity key
 * @param senderId - Our user ID
 * @param senderDeviceId - Our device ID
 * @param innerContent - Base64 of the encrypted Signal message
 */
export async function sealMessage(
  recipientId: string,
  recipientIdentityKey: Uint8Array,
  senderId: string,
  senderDeviceId: number,
  innerContent: string,
): Promise<SealedEnvelope> {
  // Generate ephemeral key pair for this envelope
  const ephPair = generateX25519KeyPair();

  // Convert recipient's Ed25519 identity key to X25519 for DH
  const recipientX25519 = edToMontgomeryPub(recipientIdentityKey);

  // DH → shared secret
  const dhOutput = x25519DH(ephPair.privateKey, recipientX25519);
  // V5-F2: Check DH output for low-order points (small-subgroup attack protection).
  // A server substituting a low-order identity key produces predictable output.
  assertNonZeroDH(dhOutput, 'seal');
  const sealKey = hkdfDeriveSecrets(dhOutput, new Uint8Array(32), SEALED_SENDER_INFO, 56);
  const encKey = sealKey.slice(0, 32);
  const nonce = sealKey.slice(32, 56);
  zeroOut(dhOutput);

  // V4-F4: Load persisted counter on first use (survives app restart)
  if (!sealedCounterLoaded) {
    try {
      const stored = await secureLoad(HMAC_TYPE.SEALED_CTR, 'sealed_sender_ctr_self');
      if (stored) sealedSenderCounter = parseInt(stored, 10) || 0;
    } catch { /* First run — start at 0 */ }
    sealedCounterLoaded = true;
  }

  // F13: Include timestamp + counter for replay protection
  sealedSenderCounter++;
  // V7-F8 FIX: Fail the seal on counter persist failure instead of swallowing.
  // Previously: counter incremented in memory but persist failure silently ignored.
  // On app restart, counter loaded old value → recipient rejected as replay → permanent DoS.
  // Now: revert in-memory counter and throw, so caller retries or shows error.
  try {
    await secureStore(HMAC_TYPE.SEALED_CTR, 'sealed_sender_ctr_self', String(sealedSenderCounter));
  } catch {
    sealedSenderCounter--; // Revert — don't let memory diverge from persisted state
    throw new Error('Sealed sender counter persist failed — cannot send sealed message');
  }

  // V7-F2 FIX: Load sender's identity key and sign the inner content.
  // Previously: senderId was a self-asserted JSON field with no cryptographic binding.
  // Any party knowing the recipient's public key could forge sealed envelopes claiming
  // any senderId. Now: sender signs (recipientId || innerContent || ts || ctr) with their
  // Ed25519 identity key. Recipient verifies against TOFU-stored key for senderId.
  const senderKeyPair = await loadIdentityKeyPair();
  if (!senderKeyPair) throw new Error('Identity key not available for sealing');

  const ts = Date.now();
  const ctr = sealedSenderCounter;
  const signData = utf8Encode(`${recipientId}|${innerContent}|${ts}|${ctr}`);
  const senderSignature = ed25519Sign(senderKeyPair.privateKey, signData);

  const innerJson = JSON.stringify({
    sv: 2,                   // Sealed sender protocol version — v2 requires certificate fields
    senderId,
    senderDeviceId,
    innerContent,
    ts,                      // F13: Reject envelopes older than 5 minutes
    ctr,                     // F13: Reject envelopes with counter <= last seen
    senderIdentityKey: toBase64(senderKeyPair.publicKey), // V7-F2: Cryptographic sender binding
    senderSignature: toBase64(senderSignature),           // V7-F2: Proves sender owns the identity key
  });
  const plaintext = utf8Encode(innerJson);

  // AAD: recipientId prevents envelope being redirected to wrong recipient
  const aad = utf8Encode(recipientId);
  const ciphertext = aeadEncrypt(encKey, nonce, plaintext, aad);

  zeroOut(encKey);
  zeroOut(nonce);
  zeroOut(ephPair.privateKey);

  return {
    recipientId,
    ephemeralKey: toBase64(ephPair.publicKey),
    sealedCiphertext: toBase64(ciphertext),
  };
}

/**
 * Unseal a message — reveal sender identity using our identity key.
 *
 * @param envelope - The sealed envelope from the server
 * @returns The unsealed content with sender identity + inner message
 */
export async function unsealMessage(
  envelope: SealedEnvelope,
): Promise<UnsealedContent> {
  const identityKeyPair = await loadIdentityKeyPair();
  if (!identityKeyPair) throw new Error('Identity key not available for unsealing');

  const ephPublic = fromBase64(envelope.ephemeralKey);

  // Convert our Ed25519 identity key to X25519 for DH
  const ourX25519 = edToMontgomeryPriv(identityKeyPair.privateKey);

  // DH → shared secret (mirrors the sealer's computation)
  const dhOutput = x25519DH(ourX25519, ephPublic);
  // V5-F2: Check DH output for low-order points (defense against malicious ephemeral key).
  assertNonZeroDH(dhOutput, 'unseal');
  const sealKey = hkdfDeriveSecrets(dhOutput, new Uint8Array(32), SEALED_SENDER_INFO, 56);
  const encKey = sealKey.slice(0, 32);
  const nonce = sealKey.slice(32, 56);
  zeroOut(dhOutput);
  zeroOut(ourX25519);

  // Decrypt
  const ciphertext = fromBase64(envelope.sealedCiphertext);
  const aad = utf8Encode(envelope.recipientId);
  let plaintext: Uint8Array;
  try {
    plaintext = aeadDecrypt(encKey, nonce, ciphertext, aad);
  } catch {
    throw new Error('Sealed sender decryption failed — envelope may be forged');
  }

  zeroOut(encKey);
  zeroOut(nonce);

  const raw = JSON.parse(utf8Decode(plaintext));

  // V7-F1 FIX: Validate all inner fields before processing. Previously, non-numeric
  // ctr values (strings, objects, NaN) poisoned the replay counter permanently:
  // NaN <= anyNumber is always false, so ALL future messages passed replay check.
  // Now: reject envelopes with invalid types before any state mutation.
  if (typeof raw.senderId !== 'string' || raw.senderId.length === 0 || raw.senderId.length > 128) {
    throw new Error('Sealed sender envelope has invalid senderId — rejecting');
  }
  if (typeof raw.senderDeviceId !== 'number' || !Number.isInteger(raw.senderDeviceId) || raw.senderDeviceId < 1 || raw.senderDeviceId > 10) {
    throw new Error('Sealed sender envelope has invalid senderDeviceId — rejecting');
  }
  if (typeof raw.innerContent !== 'string' || raw.innerContent.length === 0) {
    throw new Error('Sealed sender envelope has invalid innerContent — rejecting');
  }

  // V7-F1: Validate ts and ctr types FIRST — before any code uses them.
  // This must precede the V7-F2 signature verification which interpolates ts/ctr.
  const ts: number | undefined = raw.ts;
  const ctr: number | undefined = raw.ctr;

  if (ts !== undefined) {
    if (typeof ts !== 'number' || !Number.isFinite(ts)) {
      throw new Error('Sealed sender envelope has invalid timestamp — rejecting');
    }
  }
  if (ctr !== undefined) {
    if (typeof ctr !== 'number' || !Number.isFinite(ctr) || ctr < 0 || !Number.isInteger(ctr)) {
      throw new Error('Sealed sender envelope has invalid counter — rejecting');
    }
  }

  // V7-F2 FIX: Verify sender certificate — cryptographic binding of senderId to identity key.
  // Previously: senderId was a self-asserted JSON field. Any party knowing the recipient's
  // public key could forge envelopes claiming any senderId, enabling counter poisoning (V7-F1)
  // and DoS attacks attributed to innocent senders.
  // Now: sender signs (recipientId || innerContent || ts || ctr) with their Ed25519 identity key.
  // Recipient verifies against TOFU-stored identity key for the claimed senderId.
  //
  // Envelopes WITHOUT senderIdentityKey are REJECTED — the protocol version field 'sv'
  // distinguishes old clients (sv absent) from attackers stripping fields (sv=2 but no cert).
  // Old clients (no sv field) are accepted without certificate for backward compat.
  // New clients (sv >= 2) MUST include certificate — stripping it triggers rejection.
  const sealedVersion = typeof raw.sv === 'number' ? raw.sv : 0;

  if (raw.senderIdentityKey && raw.senderSignature) {
    const senderIdKey = fromBase64(raw.senderIdentityKey);
    const senderSig = fromBase64(raw.senderSignature);
    if (senderIdKey.length !== 32 || senderSig.length !== 64) {
      throw new Error('Sealed sender certificate has invalid key/signature length — rejecting');
    }

    // Verify signature over the same data the sender signed (ts/ctr already type-validated above)
    const signData = utf8Encode(`${envelope.recipientId}|${raw.innerContent}|${ts}|${ctr}`);
    if (!ed25519Verify(senderIdKey, signData, senderSig)) {
      throw new Error('Sealed sender certificate signature invalid — forged envelope');
    }

    // Verify the sender's identity key matches our TOFU-stored key for this senderId
    const knownKey = await loadKnownIdentityKey(raw.senderId);
    if (knownKey && !constantTimeEqual(knownKey, senderIdKey)) {
      throw new Error('Sealed sender identity key does not match known key — possible impersonation');
    }
  } else if (sealedVersion >= 2) {
    // Sender claims sv=2 (supports certificates) but omitted them — attacker stripping fields
    throw new Error('Sealed sender v2 envelope missing certificate — possible downgrade attack');
  }
  // sealedVersion=0 (legacy client, no sv field): accepted without certificate

  // F13: Replay protection — check timestamp and counter (types already validated above)
  if (ts !== undefined) {
    const age = Date.now() - ts;
    if (age > SEALED_REPLAY_MAX_AGE_MS || age < -60_000) {
      throw new Error('Sealed sender envelope expired — possible replay attack');
    }
  }

  if (ctr !== undefined && raw.senderId) {
    // Check + update the last-seen counter for this sender
    const counterKey = `sealed_ctr:${raw.senderId}`;
    try {
      const lastSeenStr = await secureLoad(HMAC_TYPE.SEALED_CTR, counterKey);
      const lastSeen = lastSeenStr ? parseInt(lastSeenStr, 10) : -1;
      // V7-F1: Additional guard — if persisted value parsed to NaN (from prior poisoning),
      // treat as -1 (no prior counter seen). This self-heals previously poisoned state.
      const safeLast = Number.isFinite(lastSeen) ? lastSeen : -1;
      if (ctr <= safeLast) {
        throw new Error('Sealed sender envelope replayed — counter not advanced');
      }
      await secureStore(HMAC_TYPE.SEALED_CTR, counterKey, String(ctr));
    } catch (err) {
      if (err instanceof Error && err.message.includes('replayed')) throw err;
      // V4-F3: Fail CLOSED on storage error. Previously fail-open allowed replay
      // when MMKV was corrupted. A legitimate sender will retransmit.
      throw new Error('Sealed sender replay check unavailable — rejecting envelope');
    }
  }

  return {
    senderId: raw.senderId,
    senderDeviceId: raw.senderDeviceId,
    innerContent: raw.innerContent,
  };
}
