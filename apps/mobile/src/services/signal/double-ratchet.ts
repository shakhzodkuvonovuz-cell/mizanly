/**
 * Double Ratchet Algorithm.
 *
 * Specification: https://signal.org/docs/specifications/doubleratchet/
 *
 * The Double Ratchet combines two ratchets:
 * 1. DH Ratchet: asymmetric key exchange (X25519) on each message direction change.
 *    Provides post-compromise security — if a key is compromised, future messages
 *    are secure again after one round-trip.
 * 2. Symmetric Ratchet: HMAC-SHA256 chain key advancement per message.
 *    Provides forward secrecy — past messages can't be decrypted if current key is compromised.
 *
 * Deviation from Signal spec: Uses XChaCha20-Poly1305 (AEAD) instead of AES-256-CBC + HMAC.
 * Key derivation chain (this file) is IDENTICAL to Signal's spec.
 *
 * Max skipped messages: 2000 (matches Signal).
 * Replay protection: built into the ratchet — used message keys are deleted.
 * No separate replay tracking needed.
 */

import {
  generateX25519KeyPair,
  x25519DH,
  hkdfDeriveSecrets,
  hmacSha256,
  aeadEncrypt,
  aeadDecrypt,
  concat,
  uint32BE,
  zeroOut,
  constantTimeEqual,
  padMessage,
  unpadMessage,
  assertNonZeroDH,
} from './crypto';
import { MAX_SKIPPED_KEYS } from './storage';
import type {
  X25519KeyPair,
  SessionState,
  ChainState,
  SkippedKey,
  MessageHeader,
  SignalMessage,
} from './types';

// ============================================================
// CONSTANTS
// ============================================================

/** HKDF info string for root key ratchet step */
const RATCHET_INFO = 'MizanlyRatchet';

/** HKDF info string for message key derivation */
const MESSAGE_KEY_INFO = 'MizanlyMsgKeys';

/** HMAC input byte for deriving message key from chain key */
const CHAIN_KEY_MSG = new Uint8Array([0x01]);

/** HMAC input byte for advancing chain key */
const CHAIN_KEY_NEXT = new Uint8Array([0x02]);

// V5: assertNonZeroDH + LOW_ORDER_POINTS imported from crypto.ts (single source of truth)

// ============================================================
// KEY DERIVATION FUNCTIONS
// ============================================================

/**
 * KDF_RK: Root key ratchet step.
 *
 * Takes the current root key and a DH output, produces a new root key
 * and a new chain key for the next sending/receiving chain.
 *
 * rootKey (32) + dhOutput (32) → HKDF → newRootKey (32) + chainKey (32)
 */
function kdfRK(
  rootKey: Uint8Array,
  dhOutput: Uint8Array,
): { rootKey: Uint8Array; chainKey: Uint8Array } {
  const derived = hkdfDeriveSecrets(dhOutput, rootKey, RATCHET_INFO, 64);
  const newRootKey = derived.slice(0, 32);
  const newChainKey = derived.slice(32, 64);
  zeroOut(derived); // F05-#1: zero contiguous 64-byte HKDF output after slicing
  return { rootKey: newRootKey, chainKey: newChainKey };
}

/**
 * KDF_CK: Chain key advancement.
 *
 * Derives a message key from the current chain key, then advances
 * the chain key. The old chain key is overwritten (forward secrecy).
 *
 * chainKey → HMAC(chainKey, 0x01) = messageKey
 * chainKey → HMAC(chainKey, 0x02) = nextChainKey
 */
function kdfCK(chainKey: Uint8Array): { messageKey: Uint8Array; nextChainKey: Uint8Array } {
  const messageKey = hmacSha256(chainKey, CHAIN_KEY_MSG);
  const nextChainKey = hmacSha256(chainKey, CHAIN_KEY_NEXT);
  return { messageKey, nextChainKey };
}

/**
 * Derive the final encryption key (32 bytes) and nonce (24 bytes) from a message key.
 *
 * messageKey → HKDF → encKey (32) + nonce (24)
 *
 * The nonce is HKDF-derived (deterministic per message key), not random.
 * This is safe because each message key is used exactly once.
 */
function deriveMessageEncKeys(messageKey: Uint8Array): { encKey: Uint8Array; nonce: Uint8Array } {
  const derived = hkdfDeriveSecrets(messageKey, new Uint8Array(32), MESSAGE_KEY_INFO, 56);
  return {
    encKey: derived.slice(0, 32),
    nonce: derived.slice(32, 56),
  };
}

// ============================================================
// HEADER SERIALIZATION
// ============================================================

/**
 * Serialize a message header to bytes for use as AAD (Additional Authenticated Data).
 *
 * Format: [ratchetKey:32][counter:4BE][previousCounter:4BE] = 40 bytes
 *
 * The header is authenticated but NOT encrypted. The recipient needs the
 * ratchet key and counter to decrypt, so they must be in plaintext.
 * AAD ensures tampering with the header is detected by AEAD.
 */
function serializeHeader(header: MessageHeader): Uint8Array {
  return concat(header.senderRatchetKey, uint32BE(header.counter), uint32BE(header.previousCounter));
}

/**
 * Deserialize header bytes back to a MessageHeader.
 */
function deserializeHeader(bytes: Uint8Array): MessageHeader {
  if (bytes.length !== 40) {
    throw new Error(`Invalid header length: ${bytes.length} (expected 40)`);
  }
  return {
    senderRatchetKey: bytes.slice(0, 32),
    counter: ((bytes[32] << 24) | (bytes[33] << 16) | (bytes[34] << 8) | bytes[35]) >>> 0,
    previousCounter: ((bytes[36] << 24) | (bytes[37] << 16) | (bytes[38] << 8) | bytes[39]) >>> 0,
  };
}

// padMessage/unpadMessage imported from crypto.ts (shared with sender-keys.ts)

// ============================================================
// ENCRYPT
// ============================================================

/**
 * Encrypt a plaintext message using the Double Ratchet.
 *
 * Mutates the session state (advances sending chain, updates counter).
 * The caller MUST persist the session state after this call.
 *
 * @param state - Mutable session state
 * @param plaintext - Message content as bytes
 * @returns SignalMessage with header + ciphertext
 */
/** Maximum text message size (64KB). Media uses chunked encryption separately. */
const MAX_MESSAGE_SIZE = 64 * 1024;

export function ratchetEncrypt(
  state: SessionState,
  plaintext: Uint8Array,
): SignalMessage {
  if (plaintext.length > MAX_MESSAGE_SIZE) {
    throw new Error(
      `Message too large: ${plaintext.length} bytes (max ${MAX_MESSAGE_SIZE}). ` +
        'Use media encryption (media-crypto.ts) for large content.',
    );
  }

  // E4: Counter overflow guard. The counter is serialized as uint32BE in the header
  // (max 2^32 - 1 = 4,294,967,295). At this limit, the session must be reset and
  // re-established via X3DH to prevent counter wrap-around.
  if (state.sendingChain.counter >= 0xFFFFFFFF) {
    throw new Error(
      'Sending chain counter exhausted (2^32 messages). ' +
      'Session must be reset and re-established.',
    );
  }

  // Pad plaintext to hide message length (Finding 8)
  const paddedPlaintext = padMessage(plaintext);

  try {
    // Advance the symmetric ratchet (sending chain)
    const { messageKey, nextChainKey } = kdfCK(state.sendingChain.chainKey);

    // Update chain state
    const oldChainKey = state.sendingChain.chainKey;
    state.sendingChain.chainKey = nextChainKey;
    const counter = state.sendingChain.counter;
    state.sendingChain.counter += 1;

    // Clean up old chain key
    zeroOut(oldChainKey);

    // Build header — previousCounter is the count of messages sent in the PREVIOUS
    // sending chain, NOT the receiving chain counter (Signal spec: PN field)
    const header: MessageHeader = {
      senderRatchetKey: state.senderRatchetKeyPair.publicKey,
      counter,
      previousCounter: state.previousSendingCounter,
    };

    // Derive encryption key + nonce from message key
    const { encKey, nonce } = deriveMessageEncKeys(messageKey);

    // Encrypt with XChaCha20-Poly1305 AEAD
    // Header is AAD — authenticated but not encrypted
    const headerBytes = serializeHeader(header);
    const ciphertext = aeadEncrypt(encKey, nonce, paddedPlaintext, headerBytes);

    // Clean up message key (forward secrecy)
    zeroOut(messageKey);
    zeroOut(encKey);
    zeroOut(nonce);

    return { header, ciphertext };
  } finally {
    zeroOut(paddedPlaintext); // F05-#2: try/finally ensures zeroing on exception
  }
}

// ============================================================
// DECRYPT
// ============================================================

/**
 * Decrypt a received SignalMessage using the Double Ratchet.
 *
 * Handles three cases:
 * 1. Message is from current receiving chain (advance chain)
 * 2. Message is from a previous chain (use skipped key)
 * 3. Message triggers a DH ratchet step (new sender ratchet key)
 *
 * Mutates the session state. Caller MUST persist after this call.
 *
 * @param state - Mutable session state
 * @param message - Received SignalMessage
 * @returns Decrypted plaintext
 */
export function ratchetDecrypt(
  state: SessionState,
  message: SignalMessage,
): Uint8Array {
  // Input validation — prevent OOM, negative counters, oversized data
  if (message.header.senderRatchetKey.length !== 32) {
    throw new Error(`Invalid ratchet key length: ${message.header.senderRatchetKey.length} (expected 32)`);
  }
  if (message.ciphertext.length > MAX_MESSAGE_SIZE + 16 + 256) {
    throw new Error(`Ciphertext too large: ${message.ciphertext.length} bytes`);
  }
  if (message.header.counter < 0 || !Number.isInteger(message.header.counter) || message.header.counter > 0xFFFFFFFF) {
    throw new Error('Invalid counter value');
  }
  if (message.header.previousCounter < 0 || !Number.isInteger(message.header.previousCounter) || message.header.previousCounter > 0xFFFFFFFF) {
    throw new Error('Invalid previousCounter value');
  }

  const headerBytes = serializeHeader(message.header);

  // --- Case 1: Try skipped message keys ---
  const skippedResult = trySkippedKeys(state, message, headerBytes);
  if (skippedResult !== null) {
    return skippedResult;
  }

  // --- Case 2: New ratchet key → DH ratchet step ---
  const isNewRatchetKey =
    state.receiverRatchetKey === null ||
    !constantTimeEqual(message.header.senderRatchetKey, state.receiverRatchetKey);

  if (isNewRatchetKey) {
    // Skip any remaining messages in the current receiving chain
    if (state.receivingChain !== null && state.receiverRatchetKey !== null) {
      skipMessageKeys(state, state.receivingChain, message.header.previousCounter);
    }

    // Perform DH ratchet step
    dhRatchetStep(state, message.header.senderRatchetKey);
  }

  // --- Case 3: Advance current receiving chain ---
  // Skip any messages before this counter
  if (state.receivingChain === null) {
    throw new Error('Receiving chain not initialized after DH ratchet step');
  }
  skipMessageKeys(state, state.receivingChain, message.header.counter);

  // Derive message key for this counter
  const { messageKey, nextChainKey } = kdfCK(state.receivingChain.chainKey);

  // Update chain state
  const oldChainKey = state.receivingChain.chainKey;
  state.receivingChain.chainKey = nextChainKey;
  state.receivingChain.counter += 1;
  zeroOut(oldChainKey);

  // Decrypt
  const { encKey, nonce } = deriveMessageEncKeys(messageKey);
  let paddedPlaintext: Uint8Array;
  try {
    paddedPlaintext = aeadDecrypt(encKey, nonce, message.ciphertext, headerBytes);
  } catch {
    throw new Error(
      'Message decryption failed. The message may have been tampered with, ' +
      'or the session state is corrupted.',
    );
  }

  // Remove padding + zero in try/finally (F05-#3: ensures zeroing on unpad failure)
  let plaintext: Uint8Array;
  try {
    plaintext = unpadMessage(paddedPlaintext);
  } finally {
    zeroOut(paddedPlaintext);
  }

  // Clean up (forward secrecy)
  zeroOut(messageKey);
  zeroOut(encKey);
  zeroOut(nonce);

  return plaintext;
}

// ============================================================
// DH RATCHET STEP
// ============================================================

/**
 * Perform a DH ratchet step.
 *
 * Called when we receive a message with a new sender ratchet key.
 * This means the remote party has advanced their DH ratchet, and we must
 * update our receiving and sending chains.
 *
 * Steps:
 * 1. Set receiver ratchet key to the new key from the message
 * 2. Derive new receiving chain: KDF_RK(rootKey, DH(ourKey, theirNewKey))
 * 3. Generate new sender ratchet key pair
 * 4. Derive new sending chain: KDF_RK(rootKey, DH(newKey, theirNewKey))
 */
function dhRatchetStep(state: SessionState, theirNewRatchetKey: Uint8Array): void {
  // Save the old sending chain counter as previousSendingCounter (PN in Signal spec)
  // This tells the remote party how many messages we sent in our previous sending chain
  state.previousSendingCounter = state.sendingChain.counter;

  // Store their new ratchet key
  state.receiverRatchetKey = theirNewRatchetKey;

  // Derive new receiving chain
  const dhReceive = x25519DH(state.senderRatchetKeyPair.privateKey, theirNewRatchetKey);
  assertNonZeroDH(dhReceive, 'ratchet-receive');
  // F05-#1: Zero old rootKey before overwriting
  const oldRootKey = state.rootKey;
  const { rootKey: rootKey1, chainKey: receivingChainKey } = kdfRK(state.rootKey, dhReceive);
  zeroOut(dhReceive);
  zeroOut(oldRootKey); // F05-#1: old root key zeroed

  // F05-#1: Zero old receiving chain key before overwriting
  if (state.receivingChain) {
    zeroOut(state.receivingChain.chainKey);
  }
  state.rootKey = rootKey1;
  state.receivingChain = { chainKey: receivingChainKey, counter: 0 };

  // Generate new sender ratchet key pair
  const oldKeyPair = state.senderRatchetKeyPair;
  // F05-#1: Zero old sending chain key before overwriting
  zeroOut(state.sendingChain.chainKey);
  state.senderRatchetKeyPair = generateX25519KeyPair();
  zeroOut(oldKeyPair.privateKey);

  // Derive new sending chain
  const dhSend = x25519DH(state.senderRatchetKeyPair.privateKey, theirNewRatchetKey);
  assertNonZeroDH(dhSend, 'ratchet-send');
  // F05-#1: Zero intermediate rootKey1 before overwriting
  const oldRootKey1 = state.rootKey;
  const { rootKey: rootKey2, chainKey: sendingChainKey } = kdfRK(state.rootKey, dhSend);
  zeroOut(dhSend);
  zeroOut(oldRootKey1); // F05-#1: intermediate root key zeroed

  state.rootKey = rootKey2;
  state.sendingChain = { chainKey: sendingChainKey, counter: 0 };
}

// ============================================================
// SKIPPED MESSAGE KEYS
// ============================================================

/**
 * Try to decrypt using a previously stored skipped message key.
 *
 * This handles out-of-order message delivery. When we advance the chain
 * past a counter (because a later message arrived first), we store the
 * skipped keys. When the earlier message finally arrives, we use the
 * stored key and then DELETE it (replay protection).
 *
 * @returns Decrypted plaintext, or null if no matching skipped key found
 */
// F28 FIX: Reduced from 7 days to 24 hours for high-security posture.
// Shorter expiry reduces the window for extracted skipped key attacks.
// 24 hours is enough for delayed message delivery on unreliable networks.
const SKIPPED_KEY_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * V7-F9: Hard cap on total skipped keys per session, independent of time-based expiry.
 * Clock manipulation (setting system time backwards) defeats the Date.now()-based expiry,
 * allowing up to MAX_SKIPPED_KEYS (2000) to accumulate. This cap ensures at most 200
 * skipped keys exist regardless of clock state. 200 is generous for real out-of-order
 * delivery (typical: 0-5 skipped per session). Excess keys are evicted oldest-first.
 */
const HARD_SKIPPED_KEY_CAP = 200;

function trySkippedKeys(
  state: SessionState,
  message: SignalMessage,
  headerBytes: Uint8Array,
): Uint8Array | null {
  // Expire old skipped keys (older than 24 hours)
  const now = Date.now();
  state.skippedKeys = state.skippedKeys.filter((sk) => {
    if (sk.createdAt && now - sk.createdAt > SKIPPED_KEY_MAX_AGE_MS) {
      zeroOut(sk.messageKey);
      return false;
    }
    return true;
  });

  // V7-F9: Hard cap eviction — even if clock manipulation defeats time-based expiry,
  // at most HARD_SKIPPED_KEY_CAP keys exist. Evict oldest (lowest createdAt) first.
  if (state.skippedKeys.length > HARD_SKIPPED_KEY_CAP) {
    // Sort by createdAt ascending, evict the excess oldest entries
    state.skippedKeys.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    const evicted = state.skippedKeys.splice(0, state.skippedKeys.length - HARD_SKIPPED_KEY_CAP);
    for (const sk of evicted) zeroOut(sk.messageKey);
  }

  const idx = state.skippedKeys.findIndex(
    (sk) =>
      constantTimeEqual(sk.ratchetKey, message.header.senderRatchetKey) &&
      sk.counter === message.header.counter,
  );

  if (idx === -1) return null;

  // Found a matching skipped key
  const skipped = state.skippedKeys[idx];

  // Remove the key BEFORE decrypting (replay protection)
  // Even if decryption fails, the key is gone — prevents replay attempts
  state.skippedKeys.splice(idx, 1);

  const { encKey, nonce } = deriveMessageEncKeys(skipped.messageKey);
  let paddedPlaintext: Uint8Array;
  try {
    paddedPlaintext = aeadDecrypt(encKey, nonce, message.ciphertext, headerBytes);
  } catch {
    throw new Error('Decryption with skipped key failed. Message may be corrupted.');
  }

  // Remove padding (Finding 8)
  const plaintext = unpadMessage(paddedPlaintext);
  zeroOut(paddedPlaintext); // F05-#3: zero padded plaintext in skipped-key path

  zeroOut(skipped.messageKey);
  zeroOut(encKey);
  zeroOut(nonce);

  return plaintext;
}

/**
 * Skip message keys up to a target counter, storing them for later decryption.
 *
 * Called when we receive a message with a counter higher than our current
 * receiving chain counter. The messages in between may arrive later
 * (out-of-order delivery).
 *
 * Max 2000 skipped keys per session (Signal spec). Exceeding this throws,
 * which prevents a DoS attack where a malicious sender claims to have sent
 * millions of messages.
 */
function skipMessageKeys(
  state: SessionState,
  chain: ChainState,
  targetCounter: number,
): void {
  if (targetCounter < chain.counter) {
    // Target is behind current counter — nothing to skip
    return;
  }

  const skipCount = targetCounter - chain.counter;
  if (state.skippedKeys.length + skipCount > MAX_SKIPPED_KEYS) {
    throw new Error(
      `Too many skipped messages (${state.skippedKeys.length + skipCount} > ${MAX_SKIPPED_KEYS}). ` +
      'This may indicate a malicious sender or severe message loss.',
    );
  }

  // Derive and store each skipped message key
  while (chain.counter < targetCounter) {
    const { messageKey, nextChainKey } = kdfCK(chain.chainKey);
    const ratchetKey = state.receiverRatchetKey!;

    state.skippedKeys.push({
      ratchetKey: new Uint8Array(ratchetKey), // Copy — the ratchet key may change
      counter: chain.counter,
      messageKey,
      createdAt: Date.now(),
    });

    const oldChainKey = chain.chainKey;
    chain.chainKey = nextChainKey;
    chain.counter += 1;
    zeroOut(oldChainKey);
  }
}

// ============================================================
// HELPERS
// ============================================================

// bytesEqual is imported as constantTimeEqual from crypto.ts (shared, no duplication)
