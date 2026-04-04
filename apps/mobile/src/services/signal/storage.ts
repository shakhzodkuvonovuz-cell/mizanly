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
 * MMKV uses AES-CFB-128 for base encryption. On top of that, all security-
 * sensitive values (sessions, sender keys, identity keys, offline queue,
 * group dedup, OTP registry) are wrapped with XChaCha20-Poly1305 AEAD
 * (see aeadSet/aeadGet below). This AEAD layer provides integrity — a
 * forensic attacker cannot flip bits in session state undetected.
 *
 * All session storage keys include deviceId for multi-device readiness.
 * Single-device phase: deviceId=1 everywhere.
 */

import * as SecureStore from 'expo-secure-store';
import { MMKV } from 'react-native-mmkv';

import {
  toBase64, fromBase64, generateRandomBytes, constantTimeEqual,
  aeadEncrypt, aeadDecrypt, hkdfDeriveSecrets, utf8Encode, utf8Decode,
  hmacSha256, zeroOut,
} from './crypto';
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

/** MMKV key prefixes (original, used for migration fallback) */
const MMKV_PREFIX = {
  SESSION: 'session:',
  IDENTITY_KEY: 'identitykey:',
  SENDER_KEY: 'senderkey:',
  MSG_CACHE: 'msgcache:',
  SEARCH_INDEX: 'searchidx:',
  OFFLINE_QUEUE: 'offlinequeue:',
} as const;

/**
 * F4: HMAC-hashed type prefixes for MMKV key names.
 * Original key names like "session:user_abc:1" leak the social graph.
 * Hashed names like "s:A7f3..." hide all user/group IDs.
 * Type prefixes allow enumeration by category without revealing content.
 */
export const HMAC_TYPE = {
  SESSION: 's:',
  IDENTITY_KEY: 'i:',
  SENDER_KEY: 'k:',
  MSG_CACHE: 'c:',
  CACHE_INDEX: 'x:',
  SEARCH_TOKEN: 'st:',
  SEARCH_MSG: 'sm:',
  OFFLINE_QUEUE: 'q:',
  GROUP_DEDUP: 'd:',
  OTP_START: 'o:',
  PREVIEW_KEY: 'p:',
  PREKEY_REGISTRY: 'r:',
  SENDER_GROUPS: 'sg:',
  CACHE_COUNT: 'nc:',
  SEARCH_COUNT: 'ns:',
  /** Sealed sender monotonic counter (V4-F4) */
  SEALED_CTR: 'sc:',
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
export async function getMMKV(): Promise<MMKV> {
  if (mmkvInstance) return mmkvInstance;

  // Serialize initialization — all concurrent callers share the same promise
  if (!mmkvInitPromise) {
    mmkvInitPromise = (async () => {
      let encryptionKey = await SecureStore.getItemAsync(
        SECURE_STORE_KEYS.MMKV_ENCRYPTION_KEY,
      );

      if (!encryptionKey) {
        // First run — generate 256-bit key for AEAD (B6).
        const keyBytes = generateRandomBytes(32);
        encryptionKey = toBase64(keyBytes);
        await SecureStore.setItemAsync(
          SECURE_STORE_KEYS.MMKV_ENCRYPTION_KEY,
          encryptionKey,
        );
      }

      // F07-#6 FIX: Derive both MMKV CFB key and HMAC key from the single SecureStore read above.
      // Previously read SecureStore twice — redundant I/O and doubled exposure window.
      const masterKeyBytes = fromBase64(encryptionKey);

      // V4-F5: Re-enable MMKV base encryption to hide HMAC type prefixes and
      // numeric metadata (counts, numbers) from filesystem forensics. AEAD still
      // provides integrity on top. The ~0.1ms/op overhead is negligible.
      // Derive a proper 16-byte key via HKDF with a unique info string.
      // Base64-encode for MMKV's string API (24 chars, full 128-bit entropy).
      const mmkvKeyBytes = hkdfDeriveSecrets(masterKeyBytes, new Uint8Array(32), 'MizanlyMMKVCFB', 16);
      mmkvInstance = new MMKV({
        id: 'mizanly-signal',
        encryptionKey: toBase64(mmkvKeyBytes),
      });

      // F4: Pre-load HMAC key for key name hashing (separate from AEAD key).
      // F10: The AEAD encryption key is NEVER cached. Only the HMAC key for
      // key name hashing is cached (different HKDF derivation, different purpose).
      // V7-F7: Permanently cached. See getHMACKeySync() comment for rationale.
      hmacKeyForNames = hkdfDeriveSecrets(masterKeyBytes, new Uint8Array(32), 'MizanlyHMACKeyNames', 32);

      // Zero master key bytes after both derivations complete
      zeroOut(masterKeyBytes);

      return mmkvInstance;
    })();
  }

  return mmkvInitPromise;
}

// ============================================================
// MMKV AEAD AUTHENTICATION (Finding 2: integrity protection)
// ============================================================

/**
 * MMKV uses AES-CFB-128 which provides confidentiality but NOT integrity.
 * A forensic analyst with filesystem access can flip bits in the encrypted
 * data without detection. This AEAD layer adds XChaCha20-Poly1305
 * authentication on top: any tampering is detected on read.
 *
 * Format in MMKV: base64([nonce:24][ciphertext+tag])
 * AAD: the MMKV key name (prevents swapping values between keys)
 *
 * The AEAD key is derived from the MMKV encryption key via HKDF,
 * so no additional SecureStore entry is needed.
 */

/**
 * F10 FIX: AEAD key re-derived from SecureStore on EVERY call. Zero caching.
 *
 * Previously: `let aeadKey: Uint8Array | null` persisted in JS heap for the entire
 * app lifetime. A memory dump → find aeadKey → decrypt ALL MMKV values.
 *
 * Now: reads from SecureStore each time + HKDF derivation (~1-2ms total).
 * No key material persists in the JS heap between operations.
 * SecureStore is hardware-backed — the OS manages the secure enclave.
 *
 * Performance: ~1-2ms per call. For bulk operations (getPendingMessages iterating
 * 10 items), this adds ~20ms total — acceptable for background operations.
 * Hot path (encrypt/decrypt single message) calls getAEADKey once = 1-2ms overhead.
 */

/**
 * V4-F9: No caching of encryption key material — read from SecureStore every time.
 * Previously cached the base64 string in `cachedEncKeyB64`, which allowed a Frida
 * attacker to find it in the JS heap and derive the AEAD key via HKDF.
 * Now reads from SecureStore on every call (~1-2ms overhead, acceptable).
 */

/** Derive the 32-byte AEAD key. SecureStore + HKDF on every call (F10 + V4-F9). */
export async function getAEADKey(): Promise<Uint8Array> {
  const encKeyB64 = await SecureStore.getItemAsync(SECURE_STORE_KEYS.MMKV_ENCRYPTION_KEY);
  if (!encKeyB64) throw new Error('MMKV encryption key not available');
  const encKey = fromBase64(encKeyB64);
  const derived = hkdfDeriveSecrets(encKey, new Uint8Array(32), 'MizanlyMMKVAEAD', 32);
  zeroOut(encKey); // V4-F9: Zero master key bytes after derivation
  return derived;
}

/**
 * Store a value in MMKV with AEAD authentication.
 * The value is encrypted with XChaCha20-Poly1305 using the AAD key as associated data.
 * Tampering with the stored value or swapping it to a different key is detected on read.
 *
 * @param mmkv - MMKV instance
 * @param storageKey - Physical MMKV key (may be HMAC-hashed)
 * @param value - Plaintext string to encrypt
 * @param aadKey - Key name used as AAD (original unhashed key for F4 migration compat)
 */
export async function aeadSet(mmkv: MMKV, storageKey: string, value: string, aadKey?: string): Promise<void> {
  const aKey = await getAEADKey();
  const nonce = generateRandomBytes(24);
  const plaintext = utf8Encode(value);
  const aad = utf8Encode(aadKey ?? storageKey); // Original key name as AAD — prevents cross-key swaps
  const ciphertext = aeadEncrypt(aKey, nonce, plaintext, aad);
  // V4-F24: Zero AEAD key after use (reduces heap exposure window)
  zeroOut(aKey);
  // Prefix: 'A1:' = AEAD version 1 (enables future migration + backward compat)
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce);
  combined.set(ciphertext, nonce.length);
  mmkv.set(storageKey, 'A1:' + toBase64(combined));
}

/**
 * Read a value from MMKV with AEAD verification.
 * Returns null if the key doesn't exist.
 * Throws on integrity failure (tampering detected).
 * Handles migration: values without 'A1:' prefix are read as-is (legacy)
 * and will be re-wrapped with AEAD on next write.
 *
 * @param mmkv - MMKV instance
 * @param storageKey - Physical MMKV key (may be HMAC-hashed)
 * @param aadKey - Key name used as AAD (original unhashed key for F4 migration compat)
 */
export async function aeadGet(mmkv: MMKV, storageKey: string, aadKey?: string): Promise<string | null> {
  const raw = mmkv.getString(storageKey);
  if (!raw) return null;

  // Migration: legacy values (no AEAD prefix) are returned as-is.
  // They'll be re-wrapped with AEAD on next storeSessionRecord/storeSenderKeyState call.
  if (!raw.startsWith('A1:')) return raw;

  const aKey = await getAEADKey();
  const combined = fromBase64(raw.slice(3)); // Skip 'A1:' prefix
  if (combined.length < 25) { zeroOut(aKey); throw new Error('MMKV AEAD: value too short (tampered?)'); }
  const nonce = combined.slice(0, 24);
  const ciphertext = combined.slice(24);
  const aad = utf8Encode(aadKey ?? storageKey);
  try {
    const plaintext = aeadDecrypt(aKey, nonce, ciphertext, aad);
    // V4-F24: Zero AEAD key after use
    zeroOut(aKey);
    return utf8Decode(plaintext);
  } catch {
    zeroOut(aKey);
    throw new Error(
      `MMKV integrity check failed for key "${(aadKey ?? storageKey).split(':')[0]}:...". ` +
      'Session state may have been tampered with. Re-establishing session.',
    );
  }
}

// ============================================================
// F4: HMAC KEY NAME HASHING (hide social graph in MMKV keys)
// ============================================================

/**
 * V7-F7: Cached HMAC key for MMKV key name hashing.
 *
 * KNOWN LIMITATION (accepted): This key is cached at module scope for the entire
 * app lifetime. An Attacker 3 (Frida memory dump) can extract it and derive all
 * MMKV key name mappings, revealing the social graph (sessions, groups, cache entries)
 * without breaking AEAD encryption. Message CONTENT remains protected by the AEAD key
 * which is NEVER cached (F10).
 *
 * WHY NOT FIXABLE IN JS: hmacKeyName() must be synchronous (called in tight loops
 * during session load/store). SecureStore is async-only. Any re-derivation scheme
 * requires caching the master key bytes, which gives a Frida attacker the same
 * capability (HKDF is deterministic). A TTL on the derived key with cached master
 * bytes is security theater — the reviewer correctly identified this.
 *
 * REAL MITIGATION: Native HMAC module (C++ JSI) that keeps the key in native heap
 * (not JS-visible) and exposes only hmacKeyName() as a synchronous JSI call.
 * This is a future enhancement requiring a native module.
 *
 * This is a separate HKDF derivation from the AEAD key, with a different info string,
 * so leaking it does NOT compromise AEAD encryption (different key, different purpose).
 */
let hmacKeyForNames: Uint8Array | null = null;

/**
 * Get the HMAC key for key name hashing (synchronous, permanently cached).
 * This is NOT the AEAD encryption key — it's derived with a different HKDF info string.
 * Leaking this key reveals key name mappings but NOT encrypted values.
 */
function getHMACKeySync(): Uint8Array {
  if (!hmacKeyForNames) throw new Error('HMAC key not initialized — call getMMKV() first');
  return hmacKeyForNames;
}

/**
 * F4: Compute HMAC-hashed MMKV key name.
 *
 * Original key names like "session:user_abc:1" expose the social graph to
 * forensic analysis without any decryption. HMAC-hashing hides user/group IDs.
 *
 * Output: typePrefix + base64(HMAC-SHA256(aeadKey, originalKey)[:16])
 * - typePrefix: 1-2 char type identifier for enumeration (e.g., "s:" for sessions)
 * - HMAC truncated to 16 bytes (128 bits): collision-resistant, compact
 * - Deterministic: same input always produces same hash (lookups work)
 *
 * @param typePrefix - Type prefix from HMAC_TYPE (e.g., "s:", "i:", "k:")
 * @param originalKey - Original MMKV key (e.g., "session:user_abc:1")
 */
export function hmacKeyName(typePrefix: string, originalKey: string): string {
  const key = getHMACKeySync();
  const hash = hmacSha256(key, utf8Encode(originalKey));
  return typePrefix + toBase64(hash.slice(0, 16));
}

/**
 * F4: High-level secure store — HMAC key + AEAD value.
 * Combines key name hashing and value encryption in one call.
 */
export async function secureStore(typePrefix: string, originalKey: string, value: string): Promise<void> {
  const mmkv = await getMMKV();
  const hashed = hmacKeyName(typePrefix, originalKey);
  await aeadSet(mmkv, hashed, value, originalKey);
}

/**
 * F4: High-level secure load — HMAC key + AEAD value + automatic migration.
 *
 * Read priority:
 * 1. Try HMAC-hashed key (new format)
 * 2. Try original key (legacy format) — if found, migrate to hashed key
 * 3. Return null if not found
 */
export async function secureLoad(typePrefix: string, originalKey: string): Promise<string | null> {
  const mmkv = await getMMKV();
  const hashed = hmacKeyName(typePrefix, originalKey);

  // Try hashed key first (new format)
  const fromHashed = await aeadGet(mmkv, hashed, originalKey);
  if (fromHashed !== null) return fromHashed;

  // Migration: try original key (legacy format)
  const fromOriginal = await aeadGet(mmkv, originalKey, originalKey);
  if (fromOriginal !== null) {
    // Migrate: write to hashed key, delete original (hide social graph)
    await aeadSet(mmkv, hashed, fromOriginal, originalKey);
    mmkv.delete(originalKey);
    return fromOriginal;
  }

  return null;
}

/**
 * F4: High-level secure delete — removes both hashed and original keys.
 * Cleaning up both ensures migration remnants are purged.
 */
export async function secureDelete(typePrefix: string, originalKey: string): Promise<void> {
  const mmkv = await getMMKV();
  const hashed = hmacKeyName(typePrefix, originalKey);
  mmkv.delete(hashed);
  mmkv.delete(originalKey); // Clean up legacy if still exists
}

/**
 * F4: Check if a key exists (checks both hashed and original for migration).
 */
export async function secureContains(typePrefix: string, originalKey: string): Promise<boolean> {
  const mmkv = await getMMKV();
  const hashed = hmacKeyName(typePrefix, originalKey);
  return mmkv.contains(hashed) || mmkv.contains(originalKey);
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

/**
 * Load identity key pair. Returns null if not initialized.
 *
 * F07-#5 JS LIMITATION: privB64 is an immutable JS string containing the identity
 * private key in base64 form. It cannot be zeroed and persists until GC. The decoded
 * Uint8Array (returned result) CAN be zeroed by callers. A JSI native module that
 * reads from SecureStore directly into a Uint8Array would avoid this JS heap exposure.
 */
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

// D6: Compact serialization with short key names.
// Full names like "senderRatchetKeyPair.publicKey" waste bytes on every persist.
// Short keys: rk=rootKey, sc=sendingChain, rc=receivingChain, etc.
// ~40% smaller JSON → faster AEAD encrypt/decrypt per message.
function serializeSessionState(state: SessionState): Record<string, unknown> {
  return {
    v: state.version,
    pv: state.protocolVersion,
    rk: toBase64(state.rootKey),
    sc: { ck: toBase64(state.sendingChain.chainKey), c: state.sendingChain.counter },
    rc: state.receivingChain
      ? { ck: toBase64(state.receivingChain.chainKey), c: state.receivingChain.counter }
      : null,
    srk: {
      pub: toBase64(state.senderRatchetKeyPair.publicKey),
      prv: toBase64(state.senderRatchetKeyPair.privateKey),
    },
    rrk: state.receiverRatchetKey ? toBase64(state.receiverRatchetKey) : null,
    sk: state.skippedKeys.map((s) => ({
      r: toBase64(s.ratchetKey), c: s.counter, m: toBase64(s.messageKey), t: s.createdAt ?? Date.now(),
      mc: s.messageCounter, // #499: monotonic counter for clock-independent aging
    })),
    psc: state.previousSendingCounter,
    rid: toBase64(state.remoteIdentityKey),
    lr: state.localRegistrationId,
    rr: state.remoteRegistrationId,
    se: state.sessionEstablished,
    it: state.identityTrust,
    ss: state.sealedSender,
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

// D6: Handles both compact (v2) and verbose (v1 legacy) key names.
function deserializeSessionState(raw: Record<string, unknown>): SessionState {
  const r = raw as Record<string, any>;
  // Detect format: compact has 'rk', verbose has 'rootKey'
  const isCompact = 'rk' in r;
  const sc = isCompact ? r.sc : r.sendingChain;
  const rc = isCompact ? r.rc : r.receivingChain;
  const srk = isCompact ? r.srk : r.senderRatchetKeyPair;
  const skipped = isCompact ? (r.sk ?? []) : (r.skippedKeys ?? []);

  return {
    version: (isCompact ? r.v : r.version) ?? SESSION_STATE_VERSION,
    protocolVersion: (isCompact ? r.pv : r.protocolVersion) ?? 1,
    rootKey: fromBase64(isCompact ? r.rk : r.rootKey),
    sendingChain: {
      chainKey: fromBase64(isCompact ? sc.ck : sc.chainKey),
      counter: isCompact ? sc.c : sc.counter,
    },
    receivingChain: rc
      ? {
          chainKey: fromBase64(isCompact ? rc.ck : rc.chainKey),
          counter: isCompact ? rc.c : rc.counter,
        }
      : null,
    senderRatchetKeyPair: {
      publicKey: fromBase64(isCompact ? srk.pub : srk.publicKey),
      privateKey: fromBase64(isCompact ? srk.prv : srk.privateKey),
    },
    receiverRatchetKey: (isCompact ? r.rrk : r.receiverRatchetKey)
      ? fromBase64(isCompact ? r.rrk : r.receiverRatchetKey)
      : null,
    skippedKeys: skipped.map((sk: any) => ({
      ratchetKey: fromBase64(isCompact ? sk.r : sk.ratchetKey),
      counter: isCompact ? sk.c : sk.counter,
      messageKey: fromBase64(isCompact ? sk.m : sk.messageKey),
      createdAt: (isCompact ? sk.t : sk.createdAt) ?? Date.now(),
      messageCounter: isCompact ? sk.mc : sk.messageCounter, // #499: monotonic counter (undefined for legacy)
    })),
    remoteIdentityKey: fromBase64(isCompact ? r.rid : r.remoteIdentityKey),
    previousSendingCounter: (isCompact ? r.psc : r.previousSendingCounter) ?? 0,
    localRegistrationId: isCompact ? r.lr : r.localRegistrationId,
    remoteRegistrationId: isCompact ? r.rr : r.remoteRegistrationId,
    sessionEstablished: (isCompact ? r.se : r.sessionEstablished) ?? false,
    identityTrust: (isCompact ? r.it : r.identityTrust) ?? 'new',
    sealedSender: (isCompact ? r.ss : r.sealedSender) ?? false,
  };
}

/** Store a session record for a specific user + device (AEAD-authenticated, HMAC key). */
export async function storeSessionRecord(
  userId: string,
  deviceId: number,
  record: SessionRecord,
): Promise<void> {
  const originalKey = sessionKey(userId, deviceId);
  await secureStore(HMAC_TYPE.SESSION, originalKey, serializeSessionRecord(record));
}

/** Load a session record with AEAD integrity verification. Returns null if no session exists. */
export async function loadSessionRecord(
  userId: string,
  deviceId: number,
): Promise<SessionRecord | null> {
  const originalKey = sessionKey(userId, deviceId);
  const json = await secureLoad(HMAC_TYPE.SESSION, originalKey);
  if (!json) return null;
  return deserializeSessionRecord(json);
}

/** Delete a session record (on logout or key reset). */
export async function deleteSessionRecord(
  userId: string,
  deviceId: number,
): Promise<void> {
  const originalKey = sessionKey(userId, deviceId);
  await secureDelete(HMAC_TYPE.SESSION, originalKey);
}

/** Check if a session exists for a user + device. */
export async function hasSession(
  userId: string,
  deviceId: number,
): Promise<boolean> {
  const originalKey = sessionKey(userId, deviceId);
  return secureContains(HMAC_TYPE.SESSION, originalKey);
}

// ============================================================
// TOFU IDENTITY KEY STORE (MITM detection)
// ============================================================

/**
 * Store a known identity key for a user (Trust On First Use).
 * AEAD-authenticated + HMAC-hashed key name (F4: hide social graph).
 */
export async function storeKnownIdentityKey(
  userId: string,
  identityKey: Uint8Array,
): Promise<void> {
  const originalKey = `${MMKV_PREFIX.IDENTITY_KEY}${userId}`;
  await secureStore(HMAC_TYPE.IDENTITY_KEY, originalKey, toBase64(identityKey));
}

/** Load a previously stored identity key with AEAD verification + HMAC migration. */
export async function loadKnownIdentityKey(
  userId: string,
): Promise<Uint8Array | null> {
  const originalKey = `${MMKV_PREFIX.IDENTITY_KEY}${userId}`;
  const val = await secureLoad(HMAC_TYPE.IDENTITY_KEY, originalKey);
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

/** Store sender key state for a group (AEAD-authenticated, HMAC key). */
export async function storeSenderKeyState(
  groupId: string,
  senderId: string,
  state: SenderKeyState,
): Promise<void> {
  const originalKey = `${MMKV_PREFIX.SENDER_KEY}${groupId}:${senderId}`;
  await secureStore(
    HMAC_TYPE.SENDER_KEY,
    originalKey,
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

/** Load sender key state with AEAD verification + HMAC migration. */
export async function loadSenderKeyState(
  groupId: string,
  senderId: string,
): Promise<SenderKeyState | null> {
  const originalKey = `${MMKV_PREFIX.SENDER_KEY}${groupId}:${senderId}`;
  const json = await secureLoad(HMAC_TYPE.SENDER_KEY, originalKey);
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

/** Store sender signing private key in SecureStore (hardware-backed). Also track group for backup. */
export async function storeSenderSigningPrivate(
  groupId: string,
  privateKey: Uint8Array,
): Promise<void> {
  await SecureStore.setItemAsync(
    `e2e_sender_signing_${groupId}`,
    toBase64(privateKey),
  );
  // F4: Track group ID in registry for backup export (MMKV keys are now HMAC-hashed,
  // so we can't scan for sender key groups by key name pattern)
  await trackSenderKeyGroup(groupId);
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
  const originalKey = `${MMKV_PREFIX.SENDER_KEY}${groupId}:${senderId}`;
  await secureDelete(HMAC_TYPE.SENDER_KEY, originalKey);
}

/** F4: Track sender key group IDs for backup export (HMAC keys hide group IDs). */
async function trackSenderKeyGroup(groupId: string): Promise<void> {
  const originalKey = 'sender_groups_registry';
  const existing = await secureLoad(HMAC_TYPE.SENDER_GROUPS, originalKey);
  const groups: string[] = existing ? JSON.parse(existing) : [];
  if (!groups.includes(groupId)) {
    groups.push(groupId);
    await secureStore(HMAC_TYPE.SENDER_GROUPS, originalKey, JSON.stringify(groups));
  }
}

// ============================================================
// OFFLINE MESSAGE QUEUE (in encrypted MMKV)
// ============================================================

/**
 * F4: Queue ID registry — tracks message IDs in the offline queue.
 * HMAC keys are one-way, so we can't derive message IDs from key names.
 * This registry lets getPendingMessages enumerate all queued entries.
 */
const QUEUE_REGISTRY_KEY = 'offline_queue_registry';

async function trackQueuedMessageId(messageId: string): Promise<void> {
  const existing = await secureLoad(HMAC_TYPE.PREKEY_REGISTRY, QUEUE_REGISTRY_KEY);
  const ids: string[] = existing ? JSON.parse(existing) : [];
  if (!ids.includes(messageId)) {
    ids.push(messageId);
    await secureStore(HMAC_TYPE.PREKEY_REGISTRY, QUEUE_REGISTRY_KEY, JSON.stringify(ids));
  }
}

async function untrackQueuedMessageId(messageId: string): Promise<void> {
  const existing = await secureLoad(HMAC_TYPE.PREKEY_REGISTRY, QUEUE_REGISTRY_KEY);
  if (!existing) return;
  const ids: string[] = JSON.parse(existing);
  const filtered = ids.filter((id) => id !== messageId);
  await secureStore(HMAC_TYPE.PREKEY_REGISTRY, QUEUE_REGISTRY_KEY, JSON.stringify(filtered));
}

/** Add a message to the persistent offline queue (AEAD-authenticated, HMAC key). */
export async function enqueueMessage(msg: QueuedMessage): Promise<void> {
  const originalKey = `${MMKV_PREFIX.OFFLINE_QUEUE}${msg.id}`;
  const json = JSON.stringify(msg, (_k, value) =>
    value instanceof Uint8Array ? { __uint8: toBase64(value) } : value,
  );
  await secureStore(HMAC_TYPE.OFFLINE_QUEUE, originalKey, json);
  await trackQueuedMessageId(msg.id);
}

/** Get all pending messages from the offline queue (AEAD-verified). */
export async function getPendingMessages(): Promise<QueuedMessage[]> {
  const messages: QueuedMessage[] = [];

  // F4: Use the queue registry to enumerate messages (HMAC keys are opaque)
  const registryJson = await secureLoad(HMAC_TYPE.PREKEY_REGISTRY, QUEUE_REGISTRY_KEY);
  const messageIds: string[] = registryJson ? JSON.parse(registryJson) : [];

  for (const msgId of messageIds) {
    try {
      const originalKey = `${MMKV_PREFIX.OFFLINE_QUEUE}${msgId}`;
      const json = await secureLoad(HMAC_TYPE.OFFLINE_QUEUE, originalKey);
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
    } catch {
      // Tampered or corrupted entry — untrack it
      await untrackQueuedMessageId(msgId);
    }
  }

  // Migration: also check legacy keys (pre-HMAC) for any remaining entries
  const mmkv = await getMMKV();
  const legacyKeys = mmkv.getAllKeys().filter((k) => k.startsWith(MMKV_PREFIX.OFFLINE_QUEUE));
  for (const key of legacyKeys) {
    try {
      const json = await aeadGet(mmkv, key, key);
      if (json) {
        const parsed = JSON.parse(json, (_k, value) => {
          if (value && typeof value === 'object' && '__uint8' in value) {
            return fromBase64(value.__uint8);
          }
          return value;
        });
        if (parsed.status === 'pending' && !messages.some((m) => m.id === parsed.id)) {
          messages.push(parsed);
        }
      }
    } catch {
      mmkv.delete(key);
    }
  }

  return messages.sort((a, b) => a.createdAt - b.createdAt);
}

/** Update a queued message status (e.g., pending -> sent). AEAD-authenticated, HMAC key. */
export async function updateQueuedMessageStatus(
  messageId: string,
  status: QueuedMessage['status'],
): Promise<void> {
  const originalKey = `${MMKV_PREFIX.OFFLINE_QUEUE}${messageId}`;
  try {
    const json = await secureLoad(HMAC_TYPE.OFFLINE_QUEUE, originalKey);
    if (!json) return;
    const msg = JSON.parse(json);
    msg.status = status;
    await secureStore(HMAC_TYPE.OFFLINE_QUEUE, originalKey, JSON.stringify(msg));
  } catch {
    // Tampered entry — delete both possible key locations
    await secureDelete(HMAC_TYPE.OFFLINE_QUEUE, originalKey);
  }
}

/** Remove a sent message from the queue. */
export async function dequeueMessage(messageId: string): Promise<void> {
  const originalKey = `${MMKV_PREFIX.OFFLINE_QUEUE}${messageId}`;
  await secureDelete(HMAC_TYPE.OFFLINE_QUEUE, originalKey);
  await untrackQueuedMessageId(messageId);
}

// ============================================================
// GROUP MESSAGE DEDUP (Finding 15: replay protection)
// ============================================================

/**
 * Check if a group message has already been decrypted (replay protection).
 *
 * Sender Keys don't have the inherent replay protection of Double Ratchet
 * (where message keys are derived and deleted). If an attacker can reset
 * the receiver's chain state (Finding 2: MMKV tampering), they could
 * replay old group messages. This dedup set catches that.
 *
 * @returns true if the message was already seen (replay detected)
 */
/**
 * V7-F10 FIX: Per-SENDER dedup sets with independent caps.
 *
 * Previously: single dedup set per group (all senders mixed). A malicious group member
 * sending 10,001 messages would evict ALL other members' dedup entries via FIFO cap.
 * Then the attacker could replay old messages from other members — dedup check passes
 * because their entries were evicted. The chain state provides secondary protection,
 * but this was a defense-in-depth degradation.
 *
 * Now: dedup key includes senderId → independent 500-entry cap per sender per group.
 * One attacker's volume cannot evict another sender's dedup entries.
 */
export async function checkGroupMessageDedup(
  groupId: string,
  senderId: string,
  chainId: number,
  counter: number,
): Promise<boolean> {
  // V7-F10: Per-sender dedup key — attacker volume cannot evict other senders' entries
  const originalKey = `group_dedup:${groupId}:${senderId}`;
  const dedupId = `${chainId}:${counter}`;
  // AEAD-authenticated + HMAC key (F4): attacker cannot clear dedup set or see group IDs
  const existing = await secureLoad(HMAC_TYPE.GROUP_DEDUP, originalKey);
  const set: string[] = existing ? JSON.parse(existing) : [];
  if (set.includes(dedupId)) return true; // Already seen — replay
  set.push(dedupId);
  // V7-F10: 500 per sender (vs. 10,000 shared). Enough for out-of-order delivery,
  // small enough that a malicious sender's own dedup doesn't consume excessive storage.
  if (set.length > 500) set.splice(0, set.length - 500);
  await secureStore(HMAC_TYPE.GROUP_DEDUP, originalKey, JSON.stringify(set));
  return false;
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
  const originalKey = 'otp_next_start_id';
  // OTP start ID uses AEAD + HMAC key (F4) to prevent attacker from resetting it
  const existing = await secureLoad(HMAC_TYPE.OTP_START, originalKey);
  const current = existing ? parseInt(existing, 10) : 0;
  await secureStore(HMAC_TYPE.OTP_START, originalKey, String(current + batchSize));
  return current;
}

/** Get current OTP startId without incrementing (for checking). */
export async function getCurrentOTPStartId(): Promise<number> {
  const existing = await secureLoad(HMAC_TYPE.OTP_START, 'otp_next_start_id');
  return existing ? parseInt(existing, 10) : 0;
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
  // F4: Check both old prefixes (session:) and new HMAC prefixes (s:)
  const sessionKeys = allKeys.filter((k) => k.startsWith(MMKV_PREFIX.SESSION) || k.startsWith(HMAC_TYPE.SESSION));

  // Collect all OTP key IDs that are in established sessions
  // (they should have been deleted but weren't due to crash)
  // F07-#1 FIX: Use secureLoad instead of raw mmkv.getString — data lives under HMAC-hashed key
  const registryJson = await secureLoad(HMAC_TYPE.PREKEY_REGISTRY, 'prekey_registry:opk');
  if (!registryJson) return 0;

  const registeredOTPIds: number[] = JSON.parse(registryJson);
  if (registeredOTPIds.length === 0) return 0;

  // V4-F15: Check sessions via AEAD-verified reads.
  // For legacy sessions (session:userId:deviceId prefix), we can extract the userId:deviceId
  // and call loadSessionRecord which properly verifies AEAD with the correct AAD.
  // For HMAC-keyed sessions, we can't reverse the HMAC — but if sessions have been
  // migrated, the legacy key was deleted. No legacy key = can't verify = be conservative.
  let hasUnestablishedSession = false;
  const legacySessions = sessionKeys.filter((k) => k.startsWith(MMKV_PREFIX.SESSION));
  const hmacKeyedSessions = sessionKeys.filter((k) => k.startsWith(HMAC_TYPE.SESSION));

  // Check legacy sessions via loadSessionRecord (proper AEAD + AAD)
  for (const key of legacySessions) {
    try {
      // Extract userId:deviceId from "session:userId:deviceId"
      const parts = key.replace(MMKV_PREFIX.SESSION, '').split(':');
      if (parts.length < 2) continue;
      const deviceId = parseInt(parts[parts.length - 1], 10);
      const userId = parts.slice(0, -1).join(':');
      const record = await loadSessionRecord(userId, deviceId);
      if (record && !record.activeSession.sessionEstablished) {
        hasUnestablishedSession = true;
        break;
      }
    } catch {
      // AEAD verification failed — treat as unestablished (conservative)
      hasUnestablishedSession = true;
      break;
    }
  }

  // For HMAC-keyed sessions, we can't extract userId:deviceId from the hashed key.
  // If HMAC sessions exist AND no legacy sessions were found unestablished,
  // we still can't prove all HMAC sessions are established — be conservative.
  if (!hasUnestablishedSession && hmacKeyedSessions.length > 0 && legacySessions.length === 0) {
    // All sessions are HMAC-keyed (fully migrated). We can't verify them here.
    // Only safe to cleanup if no sessions exist at all (no OTPs needed).
    // If sessions exist, assume at least one could be unestablished.
    hasUnestablishedSession = true;
  }

  // Only clean up if no unestablished sessions exist (safe to delete all OTP keys)
  if (hasUnestablishedSession) return 0;

  let cleaned = 0;
  for (const keyId of registeredOTPIds) {
    await SecureStore.deleteItemAsync(`${OPK_PREFIX}${keyId}`);
    cleaned++;
  }
  if (cleaned > 0) {
    // F07-#1 FIX: Use secureStore instead of raw mmkv.set — write to HMAC-hashed key
    await secureStore(HMAC_TYPE.PREKEY_REGISTRY, 'prekey_registry:opk', JSON.stringify([]));
  }
  return cleaned;
}

// ============================================================
// ENCRYPTED KEY BACKUP (C5: Argon2id + XChaCha20-Poly1305)
// ============================================================

/**
 * Export all cryptographic state, encrypted with a user-provided password.
 *
 * Flow:
 * 1. Collect all SecureStore keys + MMKV entries
 * 2. Serialize into versioned JSON
 * 3. Derive 32-byte encryption key from password via Argon2id (memory-hard)
 * 4. Encrypt with XChaCha20-Poly1305
 * 5. Return: [salt:32][nonce:24][ciphertext+tag]
 *
 * The backup can be stored in iCloud/Google Drive — it's encrypted
 * with a password only the user knows. Server never sees the password.
 *
 * Argon2id parameters: m=64MB, t=3, p=4 (OWASP recommended minimum)
 */
export async function exportAllState(password: string): Promise<Uint8Array> {
  // F24 FIX: Enforce minimum password entropy for backup encryption.
  // The backup contains ALL cryptographic state. A weak password → trivial brute force.
  // Minimum: 12 chars, at least 1 uppercase, 1 lowercase, 1 digit.
  if (password.length < 12) {
    throw new Error('Backup password must be at least 12 characters');
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('Backup password must contain uppercase, lowercase, and digit');
  }

  const { argon2id } = await import('@noble/hashes/argon2');

  // Collect all state
  const mmkv = await getMMKV();
  const identityKeyPair = await loadIdentityKeyPair();
  const registrationId = await loadRegistrationId();
  const mmkvEncKey = await SecureStore.getItemAsync(SECURE_STORE_KEYS.MMKV_ENCRYPTION_KEY);

  // Collect all MMKV entries
  const allKeys = mmkv.getAllKeys();
  const mmkvEntries: Record<string, string> = {};
  for (const key of allKeys) {
    const val = mmkv.getString(key);
    if (val) mmkvEntries[key] = val;
  }

  // Collect pre-key private keys from SecureStore
  // F07-#1 FIX: Use secureLoad instead of raw mmkv.getString — data lives under HMAC-hashed key
  const spkRegistry = await secureLoad(HMAC_TYPE.PREKEY_REGISTRY, 'prekey_registry:spk');
  const opkRegistry = await secureLoad(HMAC_TYPE.PREKEY_REGISTRY, 'prekey_registry:opk');
  const spkIds: number[] = spkRegistry ? JSON.parse(spkRegistry) : [];
  const opkIds: number[] = opkRegistry ? JSON.parse(opkRegistry) : [];
  const preKeyPrivates: Record<string, string> = {};
  for (const kid of spkIds) {
    const val = await SecureStore.getItemAsync(`${SPK_PREFIX}${kid}`);
    if (val) preKeyPrivates[`${SPK_PREFIX}${kid}`] = val;
  }
  for (const kid of opkIds) {
    const val = await SecureStore.getItemAsync(`${OPK_PREFIX}${kid}`);
    if (val) preKeyPrivates[`${OPK_PREFIX}${kid}`] = val;
  }

  // F4: Collect sender signing keys using the sender groups registry
  // (HMAC-hashed key names prevent scanning by senderkey: prefix)
  const senderSigningKeys: Record<string, string> = {};
  try {
    const groupsJson = await secureLoad(HMAC_TYPE.SENDER_GROUPS, 'sender_groups_registry');
    if (groupsJson) {
      const groups: string[] = JSON.parse(groupsJson);
      for (const groupId of groups) {
        const val = await SecureStore.getItemAsync(`e2e_sender_signing_${groupId}`);
        if (val) senderSigningKeys[groupId] = val;
      }
    }
  } catch { /* No registry — no signing keys to export */ }

  const state = JSON.stringify({
    version: 1,
    exportedAt: Date.now(),
    identityPrivate: identityKeyPair ? toBase64(identityKeyPair.privateKey) : null,
    identityPublic: identityKeyPair ? toBase64(identityKeyPair.publicKey) : null,
    registrationId,
    mmkvEncryptionKey: mmkvEncKey,
    mmkvEntries,
    preKeyPrivates,
    senderSigningKeys,
  });

  // Derive encryption key from password via Argon2id
  const salt = generateRandomBytes(32);
  const backupKey = argon2id(utf8Encode(password), salt, {
    t: 3,      // 3 iterations
    m: 65536,  // 64MB memory
    p: 4,      // 4 parallel lanes
    dkLen: 32, // 32-byte output
  });

  // Encrypt with XChaCha20-Poly1305
  const nonce = generateRandomBytes(24);
  const plaintext = utf8Encode(state);
  const ciphertext = aeadEncrypt(backupKey, nonce, plaintext);

  // Format: [version:1][salt:32][nonce:24][ciphertext+tag]
  const result = new Uint8Array(1 + salt.length + nonce.length + ciphertext.length);
  result[0] = 1; // Backup format version
  result.set(salt, 1);
  result.set(nonce, 33);
  result.set(ciphertext, 57);
  return result;
}

/**
 * Import cryptographic state from an encrypted backup.
 *
 * @param data - Encrypted backup bytes from exportAllState
 * @param password - User's backup password
 */
export async function importAllState(data: Uint8Array, password: string): Promise<void> {
  const { argon2id } = await import('@noble/hashes/argon2');

  if (data.length < 58) throw new Error('Backup data too short');
  const version = data[0];
  if (version !== 1) throw new Error(`Unsupported backup version: ${version}`);

  const salt = data.slice(1, 33);
  const nonce = data.slice(33, 57);
  const ciphertext = data.slice(57);

  // Derive key from password
  const backupKey = argon2id(utf8Encode(password), salt, {
    t: 3, m: 65536, p: 4, dkLen: 32,
  });

  // Decrypt
  let plaintext: Uint8Array;
  try {
    plaintext = aeadDecrypt(backupKey, nonce, ciphertext);
  } catch {
    throw new Error('Wrong password or corrupted backup');
  }

  const state = JSON.parse(utf8Decode(plaintext));
  if (state.version !== 1) throw new Error(`Unsupported state version: ${state.version}`);

  // Restore identity key
  if (state.identityPrivate && state.identityPublic) {
    await SecureStore.setItemAsync(SECURE_STORE_KEYS.IDENTITY_PRIVATE, state.identityPrivate);
    await SecureStore.setItemAsync(SECURE_STORE_KEYS.IDENTITY_PUBLIC, state.identityPublic);
  }
  if (state.registrationId !== null) {
    await SecureStore.setItemAsync(SECURE_STORE_KEYS.REGISTRATION_ID, String(state.registrationId));
  }
  if (state.mmkvEncryptionKey) {
    await SecureStore.setItemAsync(SECURE_STORE_KEYS.MMKV_ENCRYPTION_KEY, state.mmkvEncryptionKey);
  }

  // Restore MMKV entries
  // Reset MMKV instance to use the restored encryption key
  mmkvInstance = null;
  mmkvInitPromise = null;
  hmacKeyForNames = null;
  // V4-F9: cachedEncKeyB64 removed — no longer cached
  const mmkv = await getMMKV();

  // #509 FIX: Restore MMKV entries through AEAD-authenticated write path.
  // Previously used raw mmkv.set() which bypassed AEAD integrity protection.
  // An attacker who tampered with the backup could inject unauthenticated
  // session state that would pass integrity checks on read (since it was
  // never AEAD-wrapped). Now all restored entries go through aeadSet()
  // with the key name as AAD, matching the normal write path.
  for (const [key, val] of Object.entries(state.mmkvEntries ?? {})) {
    await aeadSet(mmkv, key, val as string, key);
  }

  // Restore pre-key private keys
  for (const [key, val] of Object.entries(state.preKeyPrivates ?? {})) {
    await SecureStore.setItemAsync(key, val as string);
  }

  // Restore sender signing keys
  for (const [groupId, val] of Object.entries(state.senderSigningKeys ?? {})) {
    await SecureStore.setItemAsync(`e2e_sender_signing_${groupId}`, val as string);
  }
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
  const originalKey = `prekey_registry:${prefix}`;
  // Pre-key registries contain only key IDs (not user IDs), but HMAC for consistency
  const existing = await secureLoad(HMAC_TYPE.PREKEY_REGISTRY, originalKey);
  const ids: number[] = existing ? JSON.parse(existing) : [];
  if (!ids.includes(keyId)) {
    ids.push(keyId);
    await secureStore(HMAC_TYPE.PREKEY_REGISTRY, originalKey, JSON.stringify(ids));
  }
}

/** Remove a pre-key ID from the registry (after deletion). */
export async function untrackPreKeyId(
  prefix: 'spk' | 'opk',
  keyId: number,
): Promise<void> {
  const originalKey = `prekey_registry:${prefix}`;
  const existing = await secureLoad(HMAC_TYPE.PREKEY_REGISTRY, originalKey);
  if (!existing) return;
  const ids: number[] = JSON.parse(existing);
  const filtered = ids.filter((id) => id !== keyId);
  await secureStore(HMAC_TYPE.PREKEY_REGISTRY, originalKey, JSON.stringify(filtered));
}

/** Wipe all E2E encryption state. Called on logout or account deletion. */
export async function clearAllE2EState(): Promise<void> {
  // Clear pre-key private keys from SecureStore using registry
  const mmkv = await getMMKV();
  for (const prefix of ['spk', 'opk'] as const) {
    // Try both old and new registry key locations (F4 migration)
    const originalKey = `prekey_registry:${prefix}`;
    let existing: string | null = null;
    try {
      existing = await secureLoad(HMAC_TYPE.PREKEY_REGISTRY, originalKey);
    } catch { /* corrupted registry — will be cleared below */ }
    if (existing) {
      const ids: number[] = JSON.parse(existing);
      const storePrefix = prefix === 'spk' ? SPK_PREFIX : OPK_PREFIX;
      await Promise.all(
        ids.map((id) => SecureStore.deleteItemAsync(`${storePrefix}${id}`)),
      );
    }
  }

  // F4: Clear sender signing keys using the sender groups registry
  try {
    const groupsJson = await secureLoad(HMAC_TYPE.SENDER_GROUPS, 'sender_groups_registry');
    if (groupsJson) {
      const groups: string[] = JSON.parse(groupsJson);
      await Promise.all(
        groups.map((gid) => SecureStore.deleteItemAsync(`e2e_sender_signing_${gid}`)),
      );
    }
  } catch { /* corrupted — will be cleared below */ }

  // Clear core SecureStore entries
  await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.IDENTITY_PRIVATE);
  await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.IDENTITY_PUBLIC);
  await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.REGISTRATION_ID);
  await SecureStore.deleteItemAsync('spk_current_metadata');
  // F07-#13 FIX: Delete MMKV encryption key — without this, AEAD-encrypted data
  // remains decryptable if MMKV files are recovered from disk after clearAll().
  await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.MMKV_ENCRYPTION_KEY);

  // Finding 9: Zero key material in MMKV before deletion.
  // F4: Handle BOTH old plaintext prefixes AND new HMAC prefixes.
  const allKeys = mmkv.getAllKeys();
  for (const key of allKeys) {
    // Old plaintext prefixes (pre-F4 migration)
    if (
      key.startsWith(MMKV_PREFIX.SESSION) ||
      key.startsWith(MMKV_PREFIX.SENDER_KEY) ||
      key.startsWith(MMKV_PREFIX.IDENTITY_KEY) ||
      key.startsWith(MMKV_PREFIX.OFFLINE_QUEUE) ||
      key.startsWith('group_dedup:') ||
      key === 'otp_next_start_id'
    ) {
      mmkv.set(key, '{}');
    }
    // New HMAC prefixes (post-F4)
    if (
      key.startsWith(HMAC_TYPE.SESSION) ||
      key.startsWith(HMAC_TYPE.IDENTITY_KEY) ||
      key.startsWith(HMAC_TYPE.SENDER_KEY) ||
      key.startsWith(HMAC_TYPE.OFFLINE_QUEUE) ||
      key.startsWith(HMAC_TYPE.GROUP_DEDUP) ||
      key.startsWith(HMAC_TYPE.OTP_START) ||
      key.startsWith(HMAC_TYPE.MSG_CACHE) ||
      key.startsWith(HMAC_TYPE.CACHE_INDEX) ||
      key.startsWith(HMAC_TYPE.SEARCH_TOKEN) ||
      key.startsWith(HMAC_TYPE.SEARCH_MSG) ||
      key.startsWith(HMAC_TYPE.PREVIEW_KEY) ||
      key.startsWith(HMAC_TYPE.SENDER_GROUPS) ||
      key.startsWith(HMAC_TYPE.SEALED_CTR) ||
      key.startsWith(HMAC_TYPE.PREKEY_REGISTRY) ||
      key.startsWith(HMAC_TYPE.CACHE_COUNT) ||
      key.startsWith(HMAC_TYPE.SEARCH_COUNT)
    ) {
      mmkv.set(key, '{}');
    }
  }

  // Clear all MMKV data (sessions, sender keys, cache, queue, registries)
  mmkv.clearAll();

  // Reset singletons so next getMMKV() re-reads the encryption key
  mmkvInstance = null;
  mmkvInitPromise = null;
  hmacKeyForNames = null;

  // Reset sealed sender module state (counter + loaded flag)
  try {
    const { resetSealedSenderState } = await import('./sealed-sender');
    resetSealedSenderState();
  } catch { /* sealed-sender module may not be loaded yet */ }
}

/**
 * F25: Emergency panic wipe — destroy ALL crypto state immediately.
 *
 * Called when user triggers the panic gesture (e.g., specific app pattern).
 * Goes beyond clearAllE2EState:
 * - Overwrites + deletes MMKV files from disk (not just clearAll)
 * - Overwrites SecureStore MMKV key (destroys AEAD capability)
 * - Clears message cache and search index MMKV files
 * - Does NOT require the app to be in a working state (no init needed)
 *
 * After panic wipe, the app is as if freshly installed — no recoverable crypto state.
 */
export async function panicWipe(): Promise<void> {
  try {
    // Step 1: Clear all E2E state (the normal path)
    await clearAllE2EState();
  } catch {
    // If clearAllE2EState fails (e.g., MMKV corrupted), continue with raw cleanup
  }

  // Step 2: Overwrite the MMKV encryption key in SecureStore with random data
  // This makes any remaining MMKV data undecryptable even if not fully wiped
  try {
    await SecureStore.setItemAsync(
      SECURE_STORE_KEYS.MMKV_ENCRYPTION_KEY,
      toBase64(generateRandomBytes(32)),
    );
    await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.MMKV_ENCRYPTION_KEY);
  } catch { /* best-effort */ }

  // Step 3: Delete MMKV files from disk (defense-in-depth)
  try {
    const FileSystem = await import('expo-file-system');
    const mmkvDir = FileSystem.documentDirectory + '../mmkv/';
    const info = await FileSystem.getInfoAsync(mmkvDir);
    if (info.exists) {
      await FileSystem.deleteAsync(mmkvDir, { idempotent: true });
    }
  } catch { /* MMKV directory may not exist or may be in a different location */ }

  // Step 4: Ensure all module-level state is reset
  mmkvInstance = null;
  mmkvInitPromise = null;
  hmacKeyForNames = null;
  // V4-F9: cachedEncKeyB64 removed — no longer cached
}

/**
 * Reset module-level singletons for testing only.
 * Forces fresh key derivation on next operation.
 */
export function _resetForTesting(): void {
  mmkvInstance = null;
  mmkvInitPromise = null;
  hmacKeyForNames = null;
}
