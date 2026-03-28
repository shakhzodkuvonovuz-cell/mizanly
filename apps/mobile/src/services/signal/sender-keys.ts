/**
 * Sender Key protocol for group encryption.
 *
 * In group chats, encrypting a message with N pairwise Double Ratchet sessions
 * is O(N) — too slow for large groups. Sender Keys use a symmetric ratchet:
 * each sender generates a single key, distributes it to all members via pairwise
 * sessions, then encrypts group messages with that key. All members decrypt
 * with the same key. O(1) encrypt per message regardless of group size.
 *
 * Trade-off vs Double Ratchet:
 * - No DH ratchet → no post-compromise security within a chain
 * - Past messages: SAFE (HMAC chain is one-directional, can't go backward)
 * - Future messages after compromise: COMPROMISED (attacker can advance chain)
 * - Mitigation: rotate sender key on member removal
 *
 * This is the same approach used by WhatsApp and Signal for groups.
 *
 * Key lifecycle:
 * 1. Sender generates a sender key (random chain key + Ed25519 signing key)
 * 2. Sender encrypts the sender key for each member via their pairwise session
 * 3. Sender uploads encrypted copies to the Go E2E server
 * 4. Members fetch and decrypt the sender key using their pairwise session
 * 5. Sender encrypts group messages with the sender key
 * 6. On member removal: sender generates a NEW key, distributes to remaining members
 */

import {
  generateRandomBytes,
  generateEd25519KeyPair,
  ed25519Sign,
  ed25519Verify,
  hmacSha256,
  aeadEncrypt,
  aeadDecrypt,
  hkdfDeriveSecrets,
  concat,
  uint32BE,
  utf8Encode,
  utf8Decode,
  zeroOut,
  padMessage,
  unpadMessage,
} from './crypto';
import {
  withSessionLock,
  storeSenderKeyState,
  loadSenderKeyState,
  deleteSenderKeyState,
  storeSenderSigningPrivate,
  loadSenderSigningPrivate,
  deleteSenderSigningPrivate,
  checkGroupMessageDedup,
} from './storage';
import type {
  SenderKeyState,
  SenderKeyMessage,
} from './types';

// ============================================================
// CONSTANTS
// ============================================================

/** HMAC input byte for deriving message key from sender chain key */
const SENDER_CHAIN_MSG = new Uint8Array([0x01]);

/** HMAC input byte for advancing sender chain key */
const SENDER_CHAIN_NEXT = new Uint8Array([0x02]);

/** HKDF info string for sender key message encryption */
const SENDER_KEY_MSG_INFO = 'MizanlySenderKey';

// ============================================================
// KEY GENERATION
// ============================================================

/**
 * Generate a new sender key for a group.
 *
 * Called when:
 * - User sends first message to a new group
 * - A member is removed from the group (key rotation)
 *
 * @param groupId - Conversation ID of the group
 * @param generation - Rotation counter (0 for initial, incremented on each rotation)
 */
export async function generateSenderKey(
  groupId: string,
  generation: number = 0,
): Promise<SenderKeyState> {
  const chainKey = generateRandomBytes(32);
  const signingKeyPair = generateEd25519KeyPair();
  // Use CSPRNG for chainId — Math.random() is not cryptographically secure
  const chainIdBytes = generateRandomBytes(4);
  const chainId = ((chainIdBytes[0] << 24) | (chainIdBytes[1] << 16) | (chainIdBytes[2] << 8) | chainIdBytes[3]) >>> 0;

  // Store signing PRIVATE key in SecureStore (hardware-backed, not MMKV).
  // If MMKV is compromised, the attacker cannot forge group messages without
  // also extracting the SecureStore key (requires device passcode/biometric).
  await storeSenderSigningPrivate(groupId, signingKeyPair.privateKey);

  // Store state in MMKV with ONLY the public signing key.
  // The private key is loaded from SecureStore on each encrypt.
  const state: SenderKeyState = {
    chainId,
    generation,
    chainKey,
    counter: 0,
    signingKeyPair: {
      publicKey: signingKeyPair.publicKey,
      privateKey: new Uint8Array(32).fill(0xde), // Sentinel — real key in SecureStore. 0xDE bytes produce invalid Ed25519 signatures if accidentally used.
    },
  };

  await storeSenderKeyState(groupId, 'self', state);

  // Return the FULL state (with real private key) for immediate use
  return { ...state, signingKeyPair };
}

/**
 * Store a received sender key from another group member.
 *
 * Called after decrypting a sender key distribution message
 * received via pairwise Double Ratchet session.
 *
 * @param groupId - Conversation ID
 * @param senderId - User ID of the sender who generated this key
 * @param state - The decrypted sender key state
 */
export async function storeSenderKeyFromDistribution(
  groupId: string,
  senderId: string,
  state: SenderKeyState,
): Promise<void> {
  await storeSenderKeyState(groupId, senderId, state);
}

// ============================================================
// ENCRYPT (GROUP MESSAGE)
// ============================================================

/**
 * Encrypt a group message using our sender key.
 *
 * The sender key's chain advances per message (symmetric ratchet via HMAC).
 * The message is signed with the sender's Ed25519 signing key to authenticate.
 *
 * @param groupId - Conversation ID
 * @param plaintext - Message content as string
 * @returns SenderKeyMessage ready to send
 */
export async function encryptGroupMessage(
  groupId: string,
  plaintext: string,
): Promise<SenderKeyMessage> {
  // Lock per group to prevent concurrent encrypts from desyncing the chain
  const lockId = `senderkey:${groupId}:self`;
  return withSessionLock(lockId, async () => {
  const state = await loadSenderKeyState(groupId, 'self');
  if (!state) {
    throw new Error(
      'No sender key for this group. ' +
        'Generate and distribute a sender key before sending.',
    );
  }

  // Derive keys from current chain WITHOUT mutating state yet.
  // State is only advanced after encryption + persist succeed.
  // This prevents state corruption on crash between advance and persist.
  const counter = state.counter;
  const messageKey = hmacSha256(state.chainKey, SENDER_CHAIN_MSG);
  const nextChainKey = hmacSha256(state.chainKey, SENDER_CHAIN_NEXT);

  // Derive encryption key + nonce from message key
  const derived = hkdfDeriveSecrets(messageKey, new Uint8Array(32), SENDER_KEY_MSG_INFO, 56);
  const encKey = derived.slice(0, 32);
  const nonce = derived.slice(32, 56);

  // AAD: length-prefixed groupId + chainId + generation + counter
  // Length prefix prevents domain separation collisions with variable-length groupId
  const groupIdBytes = utf8Encode(groupId);
  const aad = concat(
    uint32BE(groupIdBytes.length),
    groupIdBytes,
    uint32BE(state.chainId),
    uint32BE(state.generation),
    uint32BE(counter),
  );

  // Pad + encrypt (B4: group messages must also hide plaintext length)
  const plaintextBytes = padMessage(utf8Encode(plaintext));
  const ciphertext = aeadEncrypt(encKey, nonce, plaintextBytes, aad);

  // Load signing private key from SecureStore (not MMKV — hardware-backed)
  const signingPrivate = await loadSenderSigningPrivate(groupId);
  if (!signingPrivate) {
    throw new Error(
      'Sender signing key not found in SecureStore. ' +
        'The key may have been deleted. Regenerate the sender key.',
    );
  }

  // Sign: Ed25519 signature over (counter || ciphertext) for message authentication
  const signData = concat(uint32BE(counter), ciphertext);
  const signature = ed25519Sign(signingPrivate, signData);
  zeroOut(signingPrivate); // Clean up after use

  // Encryption succeeded — NOW advance state and persist atomically
  const oldChainKey = state.chainKey;
  state.chainKey = nextChainKey;
  state.counter += 1;
  await storeSenderKeyState(groupId, 'self', state);
  zeroOut(oldChainKey);

  // Clean up
  zeroOut(messageKey);
  zeroOut(encKey);
  zeroOut(nonce);

  return {
    groupId,
    chainId: state.chainId,
    generation: state.generation,
    counter,
    ciphertext,
    signature,
  };
  }); // end withSessionLock
}

// ============================================================
// DECRYPT (GROUP MESSAGE)
// ============================================================

/**
 * Decrypt a group message using the sender's sender key.
 *
 * Verifies the Ed25519 signature, then derives the message key by
 * advancing the sender's chain to the correct counter position.
 *
 * Handles out-of-order delivery: if the message counter is ahead of
 * our current chain position, we advance the chain (storing intermediate
 * keys is not needed for sender keys — the chain only goes forward).
 *
 * @param groupId - Conversation ID
 * @param senderId - User ID of the message sender
 * @param message - Received SenderKeyMessage
 * @returns Decrypted plaintext as string
 */
export async function decryptGroupMessage(
  groupId: string,
  senderId: string,
  message: SenderKeyMessage,
): Promise<string> {
  // Lock per sender per group to prevent concurrent decrypts from desyncing the chain
  const lockId = `senderkey:${groupId}:${senderId}`;
  return withSessionLock(lockId, async () => {
  const state = await loadSenderKeyState(groupId, senderId);
  if (!state) {
    throw new Error(
      'No sender key from this member for this group. ' +
        'Waiting for sender key distribution. [Waiting for encryption keys...]',
    );
  }

  // Check generation — must match exactly
  if (message.generation > state.generation) {
    throw new Error(
      'Sender key version mismatch — waiting for updated key distribution.',
    );
  }
  if (message.generation < state.generation) {
    throw new Error(
      'Sender key version is outdated — message was sent before a key rotation and cannot be decrypted.',
    );
  }

  // Verify chain ID matches
  if (message.chainId !== state.chainId) {
    throw new Error(
      'Sender key mismatch — the sender may have rotated their key.',
    );
  }

  // Verify Ed25519 signature
  const signData = concat(uint32BE(message.counter), message.ciphertext);
  if (!ed25519Verify(state.signingKeyPair.publicKey, signData, message.signature)) {
    throw new Error('Sender key message signature verification failed. Message may be forged.');
  }

  // Replay protection (Finding 15): check dedup AFTER signature verification
  // but BEFORE chain advancement. A replayed message has valid signature but
  // should not be processed twice.
  const isDuplicate = await checkGroupMessageDedup(groupId, senderId, message.chainId, message.counter);
  if (isDuplicate) {
    throw new Error('Replayed group message detected — this message was already decrypted.');
  }

  const MAX_SENDER_KEY_SKIP = 200;

  // Initialize skipped keys array if not present (backward compat)
  if (!state.skippedKeys) state.skippedKeys = [];

  // Case 1: Message counter is BEHIND our chain — check skipped keys
  if (message.counter < state.counter) {
    const skippedIdx = state.skippedKeys.findIndex((sk) => sk.counter === message.counter);
    if (skippedIdx === -1) {
      throw new Error(
        `Message counter ${message.counter} is behind chain position ${state.counter}. ` +
          'Skipped key not found — message is a duplicate or was already decrypted.',
      );
    }
    // Use the skipped key and remove it (replay protection)
    const skipped = state.skippedKeys.splice(skippedIdx, 1)[0];
    const derived = hkdfDeriveSecrets(skipped.messageKey, new Uint8Array(32), SENDER_KEY_MSG_INFO, 56);
    const encKey = derived.slice(0, 32);
    const nonce = derived.slice(32, 56);
    const groupIdBytes = utf8Encode(groupId);
    const aad = concat(
      uint32BE(groupIdBytes.length),
      groupIdBytes,
      uint32BE(message.chainId),
      uint32BE(message.generation),
      uint32BE(message.counter),
    );
    let paddedPlaintext: Uint8Array;
    try {
      paddedPlaintext = aeadDecrypt(encKey, nonce, message.ciphertext, aad);
    } catch {
      zeroOut(skipped.messageKey);
      zeroOut(encKey);
      zeroOut(nonce);
      throw new Error('Group message decryption with skipped key failed.');
    }
    const plaintext = unpadMessage(paddedPlaintext);
    zeroOut(skipped.messageKey);
    zeroOut(encKey);
    zeroOut(nonce);
    await storeSenderKeyState(groupId, senderId, state);
    return utf8Decode(plaintext);
  }

  // Case 2: Message counter is AHEAD — advance chain, storing intermediate keys
  const gap = message.counter - state.counter;
  if (gap > MAX_SENDER_KEY_SKIP) {
    throw new Error(
      `Message counter gap too large: ${gap} (max ${MAX_SENDER_KEY_SKIP}). ` +
        'This may indicate a malicious sender or severely lost messages.',
    );
  }

  // Clone the chain key so we can advance without corrupting state on AEAD failure
  let currentChainKey: Uint8Array = new Uint8Array(state.chainKey);
  let currentCounter: number = state.counter;

  // Advance to the target counter, storing skipped keys for out-of-order messages
  let messageKey: Uint8Array | null = null;
  const newSkipped: Array<{ counter: number; messageKey: Uint8Array }> = [];

  while (currentCounter <= message.counter) {
    const mk = hmacSha256(currentChainKey, SENDER_CHAIN_MSG);
    const nextKey = hmacSha256(currentChainKey, SENDER_CHAIN_NEXT);
    zeroOut(currentChainKey);
    currentChainKey = nextKey;

    if (currentCounter === message.counter) {
      messageKey = mk;
    } else {
      // Store intermediate key for future out-of-order decryption
      newSkipped.push({ counter: currentCounter, messageKey: mk });
    }
    currentCounter++;
  }

  if (!messageKey) {
    throw new Error('Failed to derive message key');
  }

  // Cap total skipped keys per sender
  const allSkipped = [...state.skippedKeys, ...newSkipped];
  while (allSkipped.length > MAX_SENDER_KEY_SKIP) {
    const evicted = allSkipped.shift()!;
    zeroOut(evicted.messageKey);
  }

  // Derive encryption key + nonce
  const derived = hkdfDeriveSecrets(messageKey, new Uint8Array(32), SENDER_KEY_MSG_INFO, 56);
  const encKey = derived.slice(0, 32);
  const nonce = derived.slice(32, 56);

  // AAD must match what the sender used — length-prefixed groupId for domain separation
  const groupIdBytes = utf8Encode(groupId);
  const aad = concat(
    uint32BE(groupIdBytes.length),
    groupIdBytes,
    uint32BE(message.chainId),
    uint32BE(message.generation),
    uint32BE(message.counter),
  );

  // Decrypt + unpad — AEAD catches tampering
  let paddedPlaintext: Uint8Array;
  try {
    paddedPlaintext = aeadDecrypt(encKey, nonce, message.ciphertext, aad);
  } catch {
    // Don't update state on failure — chain is still at old position
    zeroOut(messageKey);
    zeroOut(encKey);
    zeroOut(nonce);
    zeroOut(currentChainKey);
    throw new Error(
      'Group message decryption failed. The message may be tampered with or the key is wrong.',
    );
  }

  const plaintext = unpadMessage(paddedPlaintext);

  // Decryption succeeded — commit the advanced chain state + skipped keys
  state.chainKey = currentChainKey;
  state.counter = currentCounter;
  state.skippedKeys = allSkipped;
  await storeSenderKeyState(groupId, senderId, state);

  // Clean up
  zeroOut(messageKey);
  zeroOut(encKey);
  zeroOut(nonce);

  return utf8Decode(plaintext);
  }); // end withSessionLock
}

// ============================================================
// KEY ROTATION (on member removal)
// ============================================================

/**
 * Rotate sender key for a group after a member is removed.
 *
 * Generates a new sender key with incremented generation counter.
 * The caller must distribute the new key to all REMAINING members
 * via their pairwise sessions (the removed member does NOT receive it).
 *
 * The removed member still has the OLD key — they can decrypt messages
 * sent BEFORE removal (correct, they were a member then) but NOT
 * messages sent AFTER (new key they don't have).
 *
 * @param groupId - Conversation ID
 * @returns New sender key state (for distribution to remaining members)
 */
export async function rotateSenderKey(groupId: string): Promise<SenderKeyState> {
  const oldState = await loadSenderKeyState(groupId, 'self');
  const newGeneration = oldState ? oldState.generation + 1 : 0;

  // Zero old chain key before discarding (forward secrecy)
  if (oldState) {
    zeroOut(oldState.chainKey);
  }

  // Generate fresh key with incremented generation
  const newState = await generateSenderKey(groupId, newGeneration);

  return newState;
}

/**
 * Delete all sender key state for a group.
 * Called when the user leaves or is removed from a group.
 *
 * @param groupId - Conversation ID
 * @param memberIds - All member user IDs (including 'self')
 */
export async function clearGroupSenderKeys(
  groupId: string,
  memberIds: string[],
): Promise<void> {
  await deleteSenderKeyState(groupId, 'self');
  await deleteSenderSigningPrivate(groupId); // Clean up SecureStore signing key
  for (const memberId of memberIds) {
    if (memberId !== 'self') {
      await deleteSenderKeyState(groupId, memberId);
    }
  }
}

// ============================================================
// DISTRIBUTION (encrypt sender key for each group member via pairwise sessions)
// ============================================================

/**
 * Distribute our sender key to all group members via their pairwise sessions.
 *
 * For each member:
 * 1. Serialize our sender key (chainKey + public signing key)
 * 2. Encrypt it with their pairwise Double Ratchet session
 * 3. Upload the encrypted copy to the Go E2E server
 *
 * @param groupId - Conversation ID
 * @param memberIds - User IDs of all group members (excluding self)
 * @param encryptForMember - Callback that encrypts bytes via pairwise session (provided by session.ts)
 * @param uploadToServer - Callback that uploads encrypted key to Go server (provided by e2eApi.ts)
 * @returns List of memberIds that received the key (failed members are skipped)
 */
export async function distributeSenderKeyToMembers(
  groupId: string,
  memberIds: string[],
  encryptForMember: (recipientId: string, plaintext: Uint8Array) => Promise<Uint8Array>,
  uploadToServer: (groupId: string, recipientId: string, encryptedKey: Uint8Array, chainId: number, generation: number) => Promise<void>,
): Promise<string[]> {
  const state = await loadSenderKeyState(groupId, 'self');
  if (!state) {
    throw new Error('No sender key for this group. Call generateSenderKey() first.');
  }

  const serialized = serializeSenderKeyForDistribution(state);
  const distributed: string[] = [];

  const unacknowledged: string[] = [];

  for (const memberId of memberIds) {
    try {
      const encrypted = await encryptForMember(memberId, serialized);
      await uploadToServer(groupId, memberId, encrypted, state.chainId, state.generation);
      distributed.push(memberId);
    } catch {
      // F29: Don't log member IDs
      console.warn('Failed to distribute sender key to a group member');
      unacknowledged.push(memberId);
    }
  }

  // V4-F12: Zero the serialized key material before the retry closure captures it.
  // The retry re-serializes from persisted state (AEAD-protected in MMKV).
  const retryGroupId = groupId;
  const retryChainId = state.chainId;
  const retryGeneration = state.generation;
  zeroOut(serialized);

  // F21 FIX: Retry distribution for unacknowledged members after 30 seconds.
  // V6-F6 FIX: Key material is re-loaded from MMKV (not captured from the outer scope).
  // try/finally guarantees zeroOut on any error path (previously leaked on throw).
  // NOTE: encryptForMember + uploadToServer callbacks ARE still captured by the closure.
  // This is acceptable — they hold no key material, only session encrypt/upload capability.
  if (unacknowledged.length > 0) {
    const retryMemberIds = [...unacknowledged]; // Copy — original array may be GC'd
    setTimeout(async () => {
      let freshSerialized: Uint8Array | null = null;
      try {
        // Re-load from MMKV (AEAD-protected) — no closure capture of key material
        const freshState = await loadSenderKeyState(retryGroupId, 'self');
        if (!freshState) return;
        freshSerialized = serializeSenderKeyForDistribution(freshState);
        for (const memberId of retryMemberIds) {
          try {
            const encrypted = await encryptForMember(memberId, freshSerialized);
            await uploadToServer(retryGroupId, memberId, encrypted, retryChainId, retryGeneration);
          } catch {
            // Final failure — member will request re-distribution on join
          }
        }
      } finally {
        // V6-F6: Guaranteed cleanup even if the loop throws unexpectedly
        if (freshSerialized) zeroOut(freshSerialized);
      }
    }, 30_000);
  }

  return distributed;
}

/**
 * Handle a new member joining a group.
 * Distributes our sender key to the new member only.
 */
export async function distributeSenderKeyToNewMember(
  groupId: string,
  newMemberId: string,
  encryptForMember: (recipientId: string, plaintext: Uint8Array) => Promise<Uint8Array>,
  uploadToServer: (groupId: string, recipientId: string, encryptedKey: Uint8Array, chainId: number, generation: number) => Promise<void>,
): Promise<boolean> {
  const results = await distributeSenderKeyToMembers(
    groupId,
    [newMemberId],
    encryptForMember,
    uploadToServer,
  );
  return results.length > 0;
}

/**
 * Request re-distribution of a sender's key when we can't decrypt their messages.
 * This happens when we missed the initial distribution (offline, crash, etc.)
 * or when they rotated and we didn't get the new key.
 *
 * @param groupId - Conversation ID
 * @param senderId - User ID of the sender whose key we need
 * @param requestViaServer - Callback that sends a re-distribution request to the Go server
 */
export async function requestSenderKeyRedistribution(
  groupId: string,
  senderId: string,
  requestViaServer: (groupId: string, senderId: string) => Promise<void>,
): Promise<void> {
  await requestViaServer(groupId, senderId);
  // The sender's client will receive this request and re-distribute their key.
  // Until then, messages from this sender show "[Waiting for encryption keys...]"
}

// ============================================================
// SERIALIZATION (for pairwise distribution)
// ============================================================

/**
 * Serialize a sender key state for distribution via pairwise session.
 *
 * The serialized bytes are encrypted with the recipient's Double Ratchet
 * session before being uploaded to the Go E2E server.
 *
 * @param state - Our sender key state to distribute
 * @returns Serialized bytes (to be encrypted via pairwise session)
 */
export function serializeSenderKeyForDistribution(state: SenderKeyState): Uint8Array {
  // Format: chainId(4) + generation(4) + chainKey(32) + counter(4) + signingPubKey(32)
  // NOTE: Only the PUBLIC signing key is distributed. Recipients verify signatures,
  // they don't sign. Including the private key would let any member forge messages.
  return concat(
    uint32BE(state.chainId),
    uint32BE(state.generation),
    state.chainKey,
    uint32BE(state.counter),
    state.signingKeyPair.publicKey,
  );
}

/**
 * Deserialize a sender key state from a distribution message.
 *
 * Recipients only receive the public signing key. The signing private key
 * is null — recipients can verify but not forge messages.
 *
 * @param bytes - Decrypted bytes from a pairwise session
 * @returns Reconstructed SenderKeyState (with signing privateKey as empty placeholder)
 */
export function deserializeSenderKeyFromDistribution(bytes: Uint8Array): SenderKeyState {
  if (bytes.length !== 76) { // 4 + 4 + 32 + 4 + 32
    throw new Error(`Invalid sender key distribution: ${bytes.length} bytes (expected 76)`);
  }

  const chainId = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  const generation = ((bytes[4] << 24) | (bytes[5] << 16) | (bytes[6] << 8) | bytes[7]) >>> 0;
  const chainKey = bytes.slice(8, 40);
  const counter = ((bytes[40] << 24) | (bytes[41] << 16) | (bytes[42] << 8) | bytes[43]) >>> 0;
  const publicKey = bytes.slice(44, 76);

  return {
    chainId,
    generation,
    chainKey,
    counter,
    // Recipients have only the public key — they verify signatures, never sign.
    // Private key is all 0xDE bytes (not zeros) — if accidentally used for signing,
    // it produces a WRONG signature that fails verification (not a valid-looking one).
    signingKeyPair: { publicKey, privateKey: new Uint8Array(32).fill(0xde) },
  };
}
