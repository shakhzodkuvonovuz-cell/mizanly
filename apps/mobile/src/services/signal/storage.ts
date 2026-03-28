/**
 * Signal Protocol storage layer.
 *
 * Storage strategy:
 * - Identity key pair (Ed25519 private) -> expo-secure-store (hardware-backed)
 * - Registration ID -> expo-secure-store
 * - Pre-key private keys -> expo-secure-store (per-key entries)
 * - MMKV encryption key -> expo-secure-store
 * - Session states -> encrypted MMKV (keyed by userId:deviceId)
 * - Known identity keys -> encrypted MMKV (TOFU store for MITM detection)
 * - Sender key states -> encrypted MMKV
 * - Decrypted message cache -> encrypted MMKV
 * - Search index -> encrypted MMKV
 *
 * MMKV uses AES-CFB-128 for encryption (no authentication).
 * This is acceptable: if device is not rooted, the MMKV encryption key
 * (in SecureStore/Keychain) is hardware-protected. If device IS rooted,
 * the attacker can hook app memory directly — storage encryption is moot.
 *
 * All session storage keys include deviceId for multi-device readiness.
 * Single-device phase: deviceId=1 everywhere.
 */

import * as SecureStore from 'expo-secure-store';
import { MMKV } from 'react-native-mmkv';

import { toBase64, fromBase64, generateRandomBytes, constantTimeEqual } from './crypto';
import type {
  Ed25519KeyPair,
  SessionRecord,
  SessionState,
  SenderKeyState,
  QueuedMessage,
} from './types';

// ============================================================
// CONSTANTS
// ============================================================

const SECURE_STORE_KEYS = {
  IDENTITY_PRIVATE: 'e2e_identity_private',
  IDENTITY_PUBLIC: 'e2e_identity_public',
  REGISTRATION_ID: 'e2e_registration_id',
  MMKV_ENCRYPTION_KEY: 'e2e_mmkv_key',
} as const;

/** SecureStore key prefix for signed pre-key private keys */
const SPK_PREFIX = 'e2e_spk_';

/** SecureStore key prefix for one-time pre-key private keys */
const OPK_PREFIX = 'e2e_opk_';

/** MMKV key prefixes */
const MMKV_PREFIX = {
  SESSION: 'session:',
  IDENTITY_KEY: 'identitykey:',
  SENDER_KEY: 'senderkey:',
  MSG_CACHE: 'msgcache:',
  SEARCH_INDEX: 'searchidx:',
  OFFLINE_QUEUE: 'offlinequeue:',
} as const;

/** Current session state serialization version */
const SESSION_STATE_VERSION = 1;

/** Maximum skipped keys per session (Signal spec) */
export const MAX_SKIPPED_KEYS = 2000;

// ============================================================
// MMKV INSTANCE (encrypted, singleton)
// ============================================================

let mmkvInstance: MMKV | null = null;
let mmkvInitPromise: Promise<MMKV> | null = null;

/**
 * Get or create the encrypted MMKV instance.
 * The encryption key is stored in SecureStore (hardware-backed).
 *
 * Uses a shared initialization promise to prevent race conditions:
 * two concurrent calls will share the same init path, not create
 * different encryption keys.
 */
async function getMMKV(): Promise<MMKV> {
  if (mmkvInstance) return mmkvInstance;

  // Serialize initialization — all concurrent callers share the same promise
  if (!mmkvInitPromise) {
    mmkvInitPromise = (async () => {
      let encryptionKey = await SecureStore.getItemAsync(
        SECURE_STORE_KEYS.MMKV_ENCRYPTION_KEY,
      );

      if (!encryptionKey) {
        // First run — generate and store a new MMKV encryption key
        const keyBytes = generateRandomBytes(16); // MMKV uses AES-128
        encryptionKey = toBase64(keyBytes);
        await SecureStore.setItemAsync(
          SECURE_STORE_KEYS.MMKV_ENCRYPTION_KEY,
          encryptionKey,
        );
      }

      mmkvInstance = new MMKV({
        id: 'mizanly-signal',
        encryptionKey,
      });

      return mmkvInstance;
    })();
  }

  return mmkvInitPromise;
}

// ============================================================
// SESSION MUTEX (chained promises — no race condition)
// ============================================================

const sessionLocks = new Map<string, Promise<void>>();

/**
 * Acquire an async mutex for a session.
 * Operations on the same session are serialized.
 * Different sessions can proceed in parallel.
 *
 * Implementation: chained promises. Each waiter links onto the previous.
 * When the previous resolves, the next proceeds. No race condition.
 */
export async function withSessionLock<T>(
  sessionId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const existing = sessionLocks.get(sessionId) ?? Promise.resolve();
  let resolve: () => void;
  const next = new Promise<void>((r) => {
    resolve = r;
  });
  sessionLocks.set(sessionId, next);

  // Wait for the previous operation on this session to complete
  await existing;

  try {
    return await fn();
  } finally {
    resolve!();
    // Clean up if we're the last in the chain
    if (sessionLocks.get(sessionId) === next) {
      sessionLocks.delete(sessionId);
    }
  }
}

// ============================================================
// IDENTITY KEY (in SecureStore — hardware-backed)
// ============================================================

/** Store identity key pair. Called once during initial setup. */
export async function storeIdentityKeyPair(
  keyPair: Ed25519KeyPair,
): Promise<void> {
  await SecureStore.setItemAsync(
    SECURE_STORE_KEYS.IDENTITY_PRIVATE,
    toBase64(keyPair.privateKey),
  );
  await SecureStore.setItemAsync(
    SECURE_STORE_KEYS.IDENTITY_PUBLIC,
    toBase64(keyPair.publicKey),
  );
}

/** Load identity key pair. Returns null if not initialized. */
export async function loadIdentityKeyPair(): Promise<Ed25519KeyPair | null> {
  const privB64 = await SecureStore.getItemAsync(
    SECURE_STORE_KEYS.IDENTITY_PRIVATE,
  );
  const pubB64 = await SecureStore.getItemAsync(
    SECURE_STORE_KEYS.IDENTITY_PUBLIC,
  );

  if (!privB64 || !pubB64) return null;

  return {
    privateKey: fromBase64(privB64),
    publicKey: fromBase64(pubB64),
  };
}

/** Check if identity key pair exists (fast check without loading). */
export async function hasIdentityKey(): Promise<boolean> {
  const key = await SecureStore.getItemAsync(
    SECURE_STORE_KEYS.IDENTITY_PRIVATE,
  );
  return key !== null;
}

// ============================================================
// REGISTRATION ID (in SecureStore)
// ============================================================

/** Store 14-bit registration ID. */
export async function storeRegistrationId(id: number): Promise<void> {
  await SecureStore.setItemAsync(
    SECURE_STORE_KEYS.REGISTRATION_ID,
    String(id),
  );
}

/** Load registration ID. Returns null if not initialized. */
export async function loadRegistrationId(): Promise<number | null> {
  const val = await SecureStore.getItemAsync(
    SECURE_STORE_KEYS.REGISTRATION_ID,
  );
  return val ? parseInt(val, 10) : null;
}

// ============================================================
// PRE-KEY PRIVATE KEYS (in SecureStore)
// ============================================================

/** Store a signed pre-key private key. */
export async function storeSignedPreKeyPrivate(
  keyId: number,
  privateKey: Uint8Array,
): Promise<void> {
  await SecureStore.setItemAsync(
    `${SPK_PREFIX}${keyId}`,
    toBase64(privateKey),
  );
  await trackPreKeyId('spk', keyId);
}

/** Load a signed pre-key private key. */
export async function loadSignedPreKeyPrivate(
  keyId: number,
): Promise<Uint8Array | null> {
  const val = await SecureStore.getItemAsync(`${SPK_PREFIX}${keyId}`);
  return val ? fromBase64(val) : null;
}

/** Delete a signed pre-key private key (after retention period). */
export async function deleteSignedPreKeyPrivate(
  keyId: number,
): Promise<void> {
  await SecureStore.deleteItemAsync(`${SPK_PREFIX}${keyId}`);
  await untrackPreKeyId('spk', keyId);
}

/** Store a one-time pre-key private key. */
export async function storeOneTimePreKeyPrivate(
  keyId: number,
  privateKey: Uint8Array,
): Promise<void> {
  await SecureStore.setItemAsync(
    `${OPK_PREFIX}${keyId}`,
    toBase64(privateKey),
  );
  await trackPreKeyId('opk', keyId);
}

/** Load a one-time pre-key private key. */
export async function loadOneTimePreKeyPrivate(
  keyId: number,
): Promise<Uint8Array | null> {
  const val = await SecureStore.getItemAsync(`${OPK_PREFIX}${keyId}`);
  return val ? fromBase64(val) : null;
}

/**
 * Delete a one-time pre-key private key.
 * Called ONLY after session is confirmed established (sessionEstablished=true).
 * NOT called on OTP consumption — the client retains the private key
 * to survive crashes between X3DH computation and session persist.
 */
export async function deleteOneTimePreKeyPrivate(
  keyId: number,
): Promise<void> {
  await SecureStore.deleteItemAsync(`${OPK_PREFIX}${keyId}`);
  await untrackPreKeyId('opk', keyId);
}

// ============================================================
// SESSION STATE (in encrypted MMKV)
// ============================================================

/** Build MMKV key for a session record. */
function sessionKey(userId: string, deviceId: number): string {
  return `${MMKV_PREFIX.SESSION}${userId}:${deviceId}`;
}

/**
 * Serialize session state with version prefix.
 * Version byte enables future migration without breaking existing sessions.
 */
function serializeSessionRecord(record: SessionRecord): string {
  return JSON.stringify({
    v: SESSION_STATE_VERSION,
    activeSession: serializeSessionState(record.activeSession),
    previousSessions: record.previousSessions.map(serializeSessionState),
  });
}

function serializeSessionState(state: SessionState): Record<string, unknown> {
  return {
    ...state,
    rootKey: toBase64(state.rootKey),
    sendingChain: {
      chainKey: toBase64(state.sendingChain.chainKey),
      counter: state.sendingChain.counter,
    },
    receivingChain: state.receivingChain
      ? {
          chainKey: toBase64(state.receivingChain.chainKey),
          counter: state.receivingChain.counter,
        }
      : null,
    senderRatchetKeyPair: {
      publicKey: toBase64(state.senderRatchetKeyPair.publicKey),
      privateKey: toBase64(state.senderRatchetKeyPair.privateKey),
    },
    receiverRatchetKey: state.receiverRatchetKey
      ? toBase64(state.receiverRatchetKey)
      : null,
    skippedKeys: state.skippedKeys.map((sk) => ({
      ratchetKey: toBase64(sk.ratchetKey),
      counter: sk.counter,
      messageKey: toBase64(sk.messageKey),
      createdAt: sk.createdAt ?? Date.now(),
    })),
    remoteIdentityKey: toBase64(state.remoteIdentityKey),
  };
}

function deserializeSessionRecord(json: string): SessionRecord {
  const raw = JSON.parse(json);
  // Check version for future migration
  if (raw.v > SESSION_STATE_VERSION) {
    throw new Error(
      `Session state version ${raw.v} is newer than supported ${SESSION_STATE_VERSION}. ` +
        'Update the app to decrypt this session.',
    );
  }
  return {
    activeSession: deserializeSessionState(raw.activeSession),
    previousSessions: (raw.previousSessions || []).map(deserializeSessionState),
  };
}

function deserializeSessionState(raw: Record<string, unknown>): SessionState {
  const r = raw as Record<string, any>;
  return {
    version: r.version ?? SESSION_STATE_VERSION,
    protocolVersion: r.protocolVersion ?? 1,
    rootKey: fromBase64(r.rootKey),
    sendingChain: {
      chainKey: fromBase64(r.sendingChain.chainKey),
      counter: r.sendingChain.counter,
    },
    receivingChain: r.receivingChain
      ? {
          chainKey: fromBase64(r.receivingChain.chainKey),
          counter: r.receivingChain.counter,
        }
      : null,
    senderRatchetKeyPair: {
      publicKey: fromBase64(r.senderRatchetKeyPair.publicKey),
      privateKey: fromBase64(r.senderRatchetKeyPair.privateKey),
    },
    receiverRatchetKey: r.receiverRatchetKey
      ? fromBase64(r.receiverRatchetKey)
      : null,
    skippedKeys: (r.skippedKeys || []).map((sk: any) => ({
      ratchetKey: fromBase64(sk.ratchetKey),
      counter: sk.counter,
      messageKey: fromBase64(sk.messageKey),
      createdAt: sk.createdAt ?? Date.now(),
    })),
    remoteIdentityKey: fromBase64(r.remoteIdentityKey),
    previousSendingCounter: r.previousSendingCounter ?? 0,
    localRegistrationId: r.localRegistrationId,
    remoteRegistrationId: r.remoteRegistrationId,
    sessionEstablished: r.sessionEstablished ?? false,
    identityTrust: r.identityTrust ?? 'new',
    sealedSender: r.sealedSender ?? false,
  };
}

/** Store a session record for a specific user + device. */
export async function storeSessionRecord(
  userId: string,
  deviceId: number,
  record: SessionRecord,
): Promise<void> {
  const mmkv = await getMMKV();
  mmkv.set(sessionKey(userId, deviceId), serializeSessionRecord(record));
}

/** Load a session record. Returns null if no session exists. */
export async function loadSessionRecord(
  userId: string,
  deviceId: number,
): Promise<SessionRecord | null> {
  const mmkv = await getMMKV();
  const json = mmkv.getString(sessionKey(userId, deviceId));
  if (!json) return null;
  return deserializeSessionRecord(json);
}

/** Delete a session record (on logout or key reset). */
export async function deleteSessionRecord(
  userId: string,
  deviceId: number,
): Promise<void> {
  const mmkv = await getMMKV();
  mmkv.delete(sessionKey(userId, deviceId));
}

/** Check if a session exists for a user + device. */
export async function hasSession(
  userId: string,
  deviceId: number,
): Promise<boolean> {
  const mmkv = await getMMKV();
  return mmkv.contains(sessionKey(userId, deviceId));
}

// ============================================================
// TOFU IDENTITY KEY STORE (MITM detection)
// ============================================================

/**
 * Store a known identity key for a user (Trust On First Use).
 * On subsequent fetches, compare against stored key.
 * If different -> "[Security code changed]" warning.
 */
export async function storeKnownIdentityKey(
  userId: string,
  identityKey: Uint8Array,
): Promise<void> {
  const mmkv = await getMMKV();
  mmkv.set(
    `${MMKV_PREFIX.IDENTITY_KEY}${userId}`,
    toBase64(identityKey),
  );
}

/** Load a previously stored identity key. Returns null on first encounter. */
export async function loadKnownIdentityKey(
  userId: string,
): Promise<Uint8Array | null> {
  const mmkv = await getMMKV();
  const val = mmkv.getString(`${MMKV_PREFIX.IDENTITY_KEY}${userId}`);
  return val ? fromBase64(val) : null;
}

/**
 * Check if an identity key matches the stored one.
 * Returns 'trusted' (matches), 'new' (first encounter), or 'changed' (MITM or reinstall).
 */
export async function verifyIdentityKey(
  userId: string,
  identityKey: Uint8Array,
): Promise<'trusted' | 'new' | 'changed'> {
  const stored = await loadKnownIdentityKey(userId);
  if (!stored) return 'new';

  return constantTimeEqual(stored, identityKey) ? 'trusted' : 'changed';
}

// ============================================================
// SENDER KEY STATE (in encrypted MMKV)
// ============================================================

/** Store sender key state for a group. */
export async function storeSenderKeyState(
  groupId: string,
  senderId: string,
  state: SenderKeyState,
): Promise<void> {
  const mmkv = await getMMKV();
  const key = `${MMKV_PREFIX.SENDER_KEY}${groupId}:${senderId}`;
  mmkv.set(
    key,
    JSON.stringify({
      chainId: state.chainId,
      generation: state.generation,
      chainKey: toBase64(state.chainKey),
      counter: state.counter,
      signingKeyPair: {
        publicKey: toBase64(state.signingKeyPair.publicKey),
        privateKey: toBase64(state.signingKeyPair.privateKey),
      },
      skippedKeys: (state.skippedKeys ?? []).map((sk) => ({
        counter: sk.counter,
        messageKey: toBase64(sk.messageKey),
      })),
    }),
  );
}

/** Load sender key state. Returns null if not distributed yet. */
export async function loadSenderKeyState(
  groupId: string,
  senderId: string,
): Promise<SenderKeyState | null> {
  const mmkv = await getMMKV();
  const json = mmkv.getString(
    `${MMKV_PREFIX.SENDER_KEY}${groupId}:${senderId}`,
  );
  if (!json) return null;
  const raw = JSON.parse(json);
  return {
    chainId: raw.chainId,
    generation: raw.generation,
    chainKey: fromBase64(raw.chainKey),
    counter: raw.counter,
    signingKeyPair: {
      publicKey: fromBase64(raw.signingKeyPair.publicKey),
      privateKey: fromBase64(raw.signingKeyPair.privateKey),
    },
    skippedKeys: (raw.skippedKeys ?? []).map((sk: any) => ({
      counter: sk.counter,
      messageKey: fromBase64(sk.messageKey),
    })),
  };
}

/** Store sender signing private key in SecureStore (hardware-backed). */
export async function storeSenderSigningPrivate(
  groupId: string,
  privateKey: Uint8Array,
): Promise<void> {
  await SecureStore.setItemAsync(
    `e2e_sender_signing_${groupId}`,
    toBase64(privateKey),
  );
}

/** Load sender signing private key from SecureStore. */
export async function loadSenderSigningPrivate(
  groupId: string,
): Promise<Uint8Array | null> {
  const val = await SecureStore.getItemAsync(`e2e_sender_signing_${groupId}`);
  return val ? fromBase64(val) : null;
}

/** Delete sender signing private key. */
export async function deleteSenderSigningPrivate(
  groupId: string,
): Promise<void> {
  await SecureStore.deleteItemAsync(`e2e_sender_signing_${groupId}`);
}

/** Delete sender key state (on group leave or key rotation). */
export async function deleteSenderKeyState(
  groupId: string,
  senderId: string,
): Promise<void> {
  const mmkv = await getMMKV();
  mmkv.delete(`${MMKV_PREFIX.SENDER_KEY}${groupId}:${senderId}`);
}

// ============================================================
// OFFLINE MESSAGE QUEUE (in encrypted MMKV)
// ============================================================

/** Add a message to the persistent offline queue. */
export async function enqueueMessage(msg: QueuedMessage): Promise<void> {
  const mmkv = await getMMKV();
  mmkv.set(
    `${MMKV_PREFIX.OFFLINE_QUEUE}${msg.id}`,
    JSON.stringify(msg, (_key, value) =>
      value instanceof Uint8Array ? { __uint8: toBase64(value) } : value,
    ),
  );
}

/** Get all pending messages from the offline queue. */
export async function getPendingMessages(): Promise<QueuedMessage[]> {
  const mmkv = await getMMKV();
  const keys = mmkv.getAllKeys().filter((k) =>
    k.startsWith(MMKV_PREFIX.OFFLINE_QUEUE),
  );
  const messages: QueuedMessage[] = [];
  for (const key of keys) {
    const json = mmkv.getString(key);
    if (json) {
      const parsed = JSON.parse(json, (_k, value) => {
        if (value && typeof value === 'object' && '__uint8' in value) {
          return fromBase64(value.__uint8);
        }
        return value;
      });
      if (parsed.status === 'pending') {
        messages.push(parsed);
      }
    }
  }
  return messages.sort((a, b) => a.createdAt - b.createdAt);
}

/** Update a queued message status (e.g., pending -> sent). */
export async function updateQueuedMessageStatus(
  messageId: string,
  status: QueuedMessage['status'],
): Promise<void> {
  const mmkv = await getMMKV();
  const key = `${MMKV_PREFIX.OFFLINE_QUEUE}${messageId}`;
  const json = mmkv.getString(key);
  if (!json) return;
  const msg = JSON.parse(json);
  msg.status = status;
  mmkv.set(key, JSON.stringify(msg));
}

/** Remove a sent message from the queue. */
export async function dequeueMessage(messageId: string): Promise<void> {
  const mmkv = await getMMKV();
  mmkv.delete(`${MMKV_PREFIX.OFFLINE_QUEUE}${messageId}`);
}

// ============================================================
// OTP START ID TRACKING
// ============================================================

/**
 * Persist the next OTP startId so we don't generate overlapping keyIds after a crash.
 * If the app crashes after generating OTPs but before uploading, the next batch
 * must start from where the previous one left off.
 */
export async function getAndIncrementOTPStartId(batchSize: number): Promise<number> {
  const mmkv = await getMMKV();
  const key = 'otp_next_start_id';
  const current = mmkv.getNumber(key) ?? 0;
  mmkv.set(key, current + batchSize);
  return current;
}

/** Get current OTP startId without incrementing (for checking). */
export async function getCurrentOTPStartId(): Promise<number> {
  const mmkv = await getMMKV();
  return mmkv.getNumber('otp_next_start_id') ?? 0;
}

// ============================================================
// OTP ORPHAN CLEANUP (GC for crash recovery)
// ============================================================

/**
 * Clean up orphaned OTP private keys in SecureStore.
 *
 * An OTP private key becomes orphaned if the app crashes between
 * setting sessionEstablished=true and calling deleteOneTimePreKeyPrivate().
 * This function scans all sessions and removes OTP keys for established sessions.
 *
 * Call on app startup after SignalService.initialize().
 */
export async function cleanupOrphanedOTPKeys(): Promise<number> {
  const mmkv = await getMMKV();
  const allKeys = mmkv.getAllKeys();
  const sessionKeys = allKeys.filter((k) => k.startsWith(MMKV_PREFIX.SESSION));

  // Collect all OTP key IDs that are in established sessions
  // (they should have been deleted but weren't due to crash)
  const registryJson = mmkv.getString('prekey_registry:opk');
  if (!registryJson) return 0;

  const registeredOTPIds: number[] = JSON.parse(registryJson);
  if (registeredOTPIds.length === 0) return 0;

  // Check each session — if established, its OTP key is safe to delete
  // We can't easily map OTP key ID to session, so we use a heuristic:
  // if ALL sessions are established, all remaining OTP private keys
  // in SecureStore (for which no unestablished session exists) are orphans.
  let hasUnestablishedSession = false;
  for (const key of sessionKeys) {
    const json = mmkv.getString(key);
    if (!json) continue;
    try {
      const raw = JSON.parse(json);
      if (raw.activeSession && !raw.activeSession.sessionEstablished) {
        hasUnestablishedSession = true;
        break;
      }
    } catch {
      // Corrupted session — skip
    }
  }

  // Only clean up if no unestablished sessions exist (safe to delete all OTP keys)
  if (hasUnestablishedSession) return 0;

  let cleaned = 0;
  for (const keyId of registeredOTPIds) {
    await SecureStore.deleteItemAsync(`${OPK_PREFIX}${keyId}`);
    cleaned++;
  }
  if (cleaned > 0) {
    mmkv.set('prekey_registry:opk', JSON.stringify([]));
  }
  return cleaned;
}

// ============================================================
// EXPORT / IMPORT (stubs for future key backup)
// ============================================================

/**
 * Export all cryptographic state for backup.
 * Returns serialized state that can be encrypted with a backup key.
 * STUB — implementation deferred to key backup phase.
 */
export async function exportAllState(): Promise<Uint8Array> {
  // Future: enumerate all SecureStore keys + all MMKV entries
  // Serialize into a versioned binary format
  // Return for encryption with Argon2id-derived key
  throw new Error('Key backup not yet implemented');
}

/**
 * Import cryptographic state from a backup.
 * STUB — implementation deferred to key backup phase.
 */
export async function importAllState(_data: Uint8Array): Promise<void> {
  throw new Error('Key backup restore not yet implemented');
}

// ============================================================
// CLEAR ALL (logout / account deletion)
// ============================================================

/**
 * Track stored pre-key IDs in MMKV so we can clean them from SecureStore on wipe.
 * SecureStore has no "list all keys" API, so we maintain our own registry.
 */
export async function trackPreKeyId(
  prefix: 'spk' | 'opk',
  keyId: number,
): Promise<void> {
  const mmkv = await getMMKV();
  const registryKey = `prekey_registry:${prefix}`;
  const existing = mmkv.getString(registryKey);
  const ids: number[] = existing ? JSON.parse(existing) : [];
  if (!ids.includes(keyId)) {
    ids.push(keyId);
    mmkv.set(registryKey, JSON.stringify(ids));
  }
}

/** Remove a pre-key ID from the registry (after deletion). */
export async function untrackPreKeyId(
  prefix: 'spk' | 'opk',
  keyId: number,
): Promise<void> {
  const mmkv = await getMMKV();
  const registryKey = `prekey_registry:${prefix}`;
  const existing = mmkv.getString(registryKey);
  if (!existing) return;
  const ids: number[] = JSON.parse(existing);
  const filtered = ids.filter((id) => id !== keyId);
  mmkv.set(registryKey, JSON.stringify(filtered));
}

/** Wipe all E2E encryption state. Called on logout or account deletion. */
export async function clearAllE2EState(): Promise<void> {
  // Clear pre-key private keys from SecureStore using registry
  const mmkv = await getMMKV();
  for (const prefix of ['spk', 'opk'] as const) {
    const registryKey = `prekey_registry:${prefix}`;
    const existing = mmkv.getString(registryKey);
    if (existing) {
      const ids: number[] = JSON.parse(existing);
      const storePrefix = prefix === 'spk' ? SPK_PREFIX : OPK_PREFIX;
      await Promise.all(
        ids.map((id) => SecureStore.deleteItemAsync(`${storePrefix}${id}`)),
      );
    }
  }

  // Clear core SecureStore entries
  await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.IDENTITY_PRIVATE);
  await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.IDENTITY_PUBLIC);
  await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.REGISTRATION_ID);
  // Clear SPK metadata (stored by prekeys.ts checkAndRotateSignedPreKey)
  await SecureStore.deleteItemAsync('spk_current_metadata');
  // MMKV encryption key intentionally kept — MMKV instance is cleared below

  // Clear all MMKV data (sessions, sender keys, cache, queue, registries)
  mmkv.clearAll();

  // Reset singletons so next getMMKV() re-reads the encryption key
  mmkvInstance = null;
  mmkvInitPromise = null;
}
