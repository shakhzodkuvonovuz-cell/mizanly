/**
 * Pre-key generation, rotation, and replenishment.
 *
 * Pre-keys are the public key material uploaded to the server that enables
 * other users to establish encrypted sessions without the recipient being online.
 *
 * Three types:
 * - Identity key: permanent Ed25519 key pair. Never rotated (change = "Security code changed").
 * - Signed pre-key: X25519 key pair signed by identity key. Rotated weekly, old kept 30 days.
 * - One-time pre-keys: single-use X25519 keys. Uploaded in batches of 100, replenished at < 20.
 *
 * All private keys stored in expo-secure-store (hardware-backed).
 * All public keys uploaded to Go E2E key server.
 */

import {
  generateEd25519KeyPair,
  generateX25519KeyPair,
  ed25519Sign,
  generateRandomBytes,
  toBase64,
  zeroOut,
} from './crypto';
import * as SecureStore from 'expo-secure-store';
import {
  storeIdentityKeyPair,
  loadIdentityKeyPair,
  hasIdentityKey,
  storeRegistrationId,
  loadRegistrationId,
  storeSignedPreKeyPrivate,
  loadSignedPreKeyPrivate,
  deleteSignedPreKeyPrivate,
  storeOneTimePreKeyPrivate,
  getAndIncrementOTPStartId,
} from './storage';
import type {
  Ed25519KeyPair,
  SignedPreKey,
  OneTimePreKey,
} from './types';

// ============================================================
// CONSTANTS
// ============================================================

/** Number of one-time pre-keys to upload per batch */
const OTP_BATCH_SIZE = 100;

/** Replenish when server count drops below this */
const OTP_REPLENISH_THRESHOLD = 20;

/** Signed pre-key rotation interval (7 days in ms) */
const SPK_ROTATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/** Signed pre-key retention period after rotation (30 days in ms) */
const SPK_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// ============================================================
// IDENTITY KEY
// ============================================================

/**
 * Generate and store a new identity key pair.
 * Called ONCE during first app initialization.
 * Changing this key triggers "[Security code changed]" for all contacts.
 */
export async function generateAndStoreIdentityKey(): Promise<Ed25519KeyPair> {
  const keyPair = generateEd25519KeyPair();
  await storeIdentityKeyPair(keyPair);
  return keyPair;
}

/**
 * Get the identity key pair, generating if needed.
 * Returns the existing key or generates a new one on first run.
 */
export async function getOrCreateIdentityKey(): Promise<Ed25519KeyPair> {
  const existing = await loadIdentityKeyPair();
  if (existing) return existing;
  return generateAndStoreIdentityKey();
}

// ============================================================
// REGISTRATION ID
// ============================================================

/**
 * Generate a 14-bit registration ID (0-16383) per Signal spec.
 * Stored locally and sent with pre-key bundles.
 */
export async function getOrCreateRegistrationId(): Promise<number> {
  const existing = await loadRegistrationId();
  if (existing !== null) return existing;

  // Generate 14-bit random unsigned integer (1-16383, non-zero per Signal spec)
  const bytes = generateRandomBytes(2);
  const raw = ((bytes[0] << 8) | bytes[1]) & 0x3fff; // Mask to 14 bits
  const id = raw === 0 ? 1 : raw; // Ensure non-zero
  await storeRegistrationId(id);
  return id;
}

// ============================================================
// SIGNED PRE-KEY
// ============================================================

/**
 * Generate a new signed pre-key.
 *
 * The signed pre-key is an X25519 key pair whose public key is signed
 * by the identity key (Ed25519). This signature proves the pre-key
 * belongs to the identity key owner — prevents bundle substitution.
 *
 * @param identityKeyPair - Ed25519 identity key pair for signing
 * @param keyId - Monotonically increasing ID for this signed pre-key
 */
export async function generateSignedPreKey(
  identityKeyPair: Ed25519KeyPair,
  keyId: number,
): Promise<SignedPreKey> {
  const keyPair = generateX25519KeyPair();

  // Sign the public key with the identity key
  const signature = ed25519Sign(identityKeyPair.privateKey, keyPair.publicKey);

  // Store private key in SecureStore
  await storeSignedPreKeyPrivate(keyId, keyPair.privateKey);

  return {
    keyId,
    keyPair,
    signature,
    createdAt: Date.now(),
  };
}

/**
 * Check if the current signed pre-key should be rotated.
 * Rotation happens weekly. Old keys are kept for 30 days.
 *
 * @param currentKeyCreatedAt - Unix ms when the current SPK was created
 */
export function shouldRotateSignedPreKey(currentKeyCreatedAt: number): boolean {
  return Date.now() - currentKeyCreatedAt > SPK_ROTATION_INTERVAL_MS;
}

/**
 * Clean up old signed pre-key private keys past the retention period.
 *
 * @param oldKeyIds - Array of {keyId, createdAt} for previous signed pre-keys
 */
export async function cleanupOldSignedPreKeys(
  oldKeyIds: Array<{ keyId: number; createdAt: number }>,
): Promise<void> {
  const now = Date.now();
  for (const { keyId, createdAt } of oldKeyIds) {
    if (now - createdAt > SPK_RETENTION_MS) {
      await deleteSignedPreKeyPrivate(keyId);
    }
  }
}

// ============================================================
// ONE-TIME PRE-KEYS
// ============================================================

/**
 * Generate a batch of one-time pre-keys.
 *
 * One-time pre-keys provide forward secrecy for the initial message
 * in a new session (the 4th DH in X3DH). They are single-use:
 * the server deletes the public key on claim, and the client deletes
 * the private key after the session is confirmed established.
 *
 * @param startId - Starting keyId for this batch
 * @param count - Number of keys to generate (default 100)
 */
export async function generateOneTimePreKeys(
  startId: number,
  count: number = OTP_BATCH_SIZE,
): Promise<OneTimePreKey[]> {
  const keys: OneTimePreKey[] = [];

  for (let i = 0; i < count; i++) {
    const keyId = startId + i;
    const keyPair = generateX25519KeyPair();

    // Store private key in SecureStore
    await storeOneTimePreKeyPrivate(keyId, keyPair.privateKey);

    keys.push({ keyId, keyPair });
  }

  return keys;
}

/**
 * Prepare pre-key upload payload for the Go E2E key server.
 *
 * Converts key pairs to the API format (base64 public keys only).
 * Private keys are NOT included — they stay in SecureStore.
 */
export function prepareSignedPreKeyUpload(spk: SignedPreKey): {
  deviceId: number;
  keyId: number;
  publicKey: string;
  signature: string;
} {
  return {
    deviceId: 1, // Single-device for now
    keyId: spk.keyId,
    publicKey: toBase64(spk.keyPair.publicKey),
    signature: toBase64(spk.signature),
  };
}

export function prepareOneTimePreKeysUpload(keys: OneTimePreKey[]): {
  deviceId: number;
  preKeys: Array<{ keyId: number; publicKey: string }>;
} {
  return {
    deviceId: 1,
    preKeys: keys.map((k) => ({
      keyId: k.keyId,
      publicKey: toBase64(k.keyPair.publicKey),
    })),
  };
}

export function prepareIdentityKeyUpload(
  keyPair: Ed25519KeyPair,
  registrationId: number,
): {
  deviceId: number;
  publicKey: string;
  registrationId: number;
} {
  return {
    deviceId: 1,
    publicKey: toBase64(keyPair.publicKey),
    registrationId,
  };
}

// ============================================================
// REPLENISHMENT CHECK
// ============================================================

/**
 * Check if one-time pre-keys need replenishment.
 *
 * @param serverCount - Current OTP count from GET /keys/count
 * @returns true if count is below threshold
 */
/**
 * Generate a batch of OTPs with crash-safe startId.
 * The startId is persisted to MMKV BEFORE generation starts,
 * so a crash mid-generation doesn't produce overlapping keyIds.
 */
export async function generateOneTimePreKeysBatch(
  count: number = OTP_BATCH_SIZE,
): Promise<OneTimePreKey[]> {
  const startId = await getAndIncrementOTPStartId(count);
  return generateOneTimePreKeys(startId, count);
}

// ============================================================
// AUTO ROTATION (called on app open)
// ============================================================

/** Key for tracking current signed pre-key metadata in MMKV */
const SPK_METADATA_KEY = 'spk_current_metadata';

interface SPKMetadata {
  keyId: number;
  createdAt: number;
  previousKeyIds: Array<{ keyId: number; createdAt: number }>;
}

/**
 * Check and rotate signed pre-key if needed.
 * Also cleans up old keys past the 30-day retention period.
 * Call on every app open (inside SignalService.initialize).
 *
 * @param uploadToServer - Callback to upload the new SPK to Go server
 * @returns true if rotation occurred
 */
export async function checkAndRotateSignedPreKey(
  uploadToServer: (upload: { deviceId: number; keyId: number; publicKey: string; signature: string }) => Promise<void>,
): Promise<boolean> {
  const identityKeyPair = await loadIdentityKeyPair();
  if (!identityKeyPair) return false;

  // Load current SPK metadata from SecureStore
  const metadataStr = await SecureStore.getItemAsync(SPK_METADATA_KEY);
  let metadata: SPKMetadata | null = metadataStr ? JSON.parse(metadataStr) : null;

  if (metadata && !shouldRotateSignedPreKey(metadata.createdAt)) {
    // No rotation needed — but still cleanup old keys
    await cleanupOldSignedPreKeys(metadata.previousKeyIds);
    return false;
  }

  // Generate new signed pre-key
  const newKeyId = metadata ? metadata.keyId + 1 : 1;
  const newSPK = await generateSignedPreKey(identityKeyPair, newKeyId);

  // Upload to server
  await uploadToServer(prepareSignedPreKeyUpload(newSPK));

  // Update metadata — move old key to previousKeyIds
  const previousKeyIds = metadata
    ? [...metadata.previousKeyIds, { keyId: metadata.keyId, createdAt: metadata.createdAt }]
    : [];

  const newMetadata: SPKMetadata = {
    keyId: newKeyId,
    createdAt: newSPK.createdAt,
    previousKeyIds,
  };

  await SecureStore.setItemAsync(
    SPK_METADATA_KEY,
    JSON.stringify(newMetadata),
  );

  // Cleanup old keys past 30-day retention
  await cleanupOldSignedPreKeys(newMetadata.previousKeyIds);

  return true;
}

export function needsReplenishment(serverCount: number): boolean {
  return serverCount < OTP_REPLENISH_THRESHOLD;
}

/** Get the replenish threshold (for external callers). */
export const REPLENISH_THRESHOLD = OTP_REPLENISH_THRESHOLD;
export const BATCH_SIZE = OTP_BATCH_SIZE;
