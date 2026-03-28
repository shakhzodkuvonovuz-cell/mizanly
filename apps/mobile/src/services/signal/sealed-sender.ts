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
 *    — server CANNOT determine who sent the message
 *
 * The recipient:
 * 1. Uses their identity private key to compute DH(identityX25519, ephemeralKey)
 * 2. Decrypts the sealed envelope → reveals senderId + innerCiphertext
 * 3. Routes to the correct session for final decryption
 *
 * This is the same approach Signal uses (deployed 2018).
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
} from './crypto';
import { loadIdentityKeyPair, loadKnownIdentityKey, secureStore, secureLoad, HMAC_TYPE } from './storage';

const SEALED_SENDER_INFO = 'MizanlySealedSender';

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
let sealedSenderCounter = 0; // Monotonic counter, reset on app restart (OK — timestamp is primary)

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
  const sealKey = hkdfDeriveSecrets(dhOutput, new Uint8Array(32), SEALED_SENDER_INFO, 56);
  const encKey = sealKey.slice(0, 32);
  const nonce = sealKey.slice(32, 56);
  zeroOut(dhOutput);

  // F13: Include timestamp + counter for replay protection
  sealedSenderCounter++;
  const innerJson = JSON.stringify({
    senderId,
    senderDeviceId,
    innerContent,
    ts: Date.now(),         // F13: Reject envelopes older than 5 minutes
    ctr: sealedSenderCounter, // F13: Reject envelopes with counter <= last seen
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

  // F13: Replay protection — check timestamp and counter
  const ts = raw.ts as number | undefined;
  const ctr = raw.ctr as number | undefined;

  if (ts !== undefined) {
    const age = Date.now() - ts;
    if (age > SEALED_REPLAY_MAX_AGE_MS || age < -60_000) {
      // Too old (>5min) or too far in the future (>1min clock skew tolerance)
      throw new Error('Sealed sender envelope expired — possible replay attack');
    }
  }

  if (ctr !== undefined && raw.senderId) {
    // Check + update the last-seen counter for this sender
    const counterKey = `sealed_ctr:${raw.senderId}`;
    try {
      const lastSeenStr = await secureLoad(HMAC_TYPE.PREVIEW_KEY, counterKey);
      const lastSeen = lastSeenStr ? parseInt(lastSeenStr, 10) : -1;
      if (ctr <= lastSeen) {
        throw new Error('Sealed sender envelope replayed — counter not advanced');
      }
      await secureStore(HMAC_TYPE.PREVIEW_KEY, counterKey, String(ctr));
    } catch (err) {
      if (err instanceof Error && err.message.includes('replayed')) throw err;
      // Storage error — allow the message (fail-open for replay, fail-closed for crypto)
    }
  }

  return {
    senderId: raw.senderId,
    senderDeviceId: raw.senderDeviceId,
    innerContent: raw.innerContent,
  };
}
