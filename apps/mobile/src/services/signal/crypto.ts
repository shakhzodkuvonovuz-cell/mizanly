/**
 * Cryptographic primitives wrapper.
 *
 * ONLY THIS FILE imports @noble/* directly.
 * All other signal/ files use these functions.
 * This enables swapping to react-native-quick-crypto (C++ JSI) later
 * without changing any protocol logic.
 *
 * Uses XChaCha20-Poly1305 (AEAD) instead of Signal's AES-256-CBC + HMAC.
 * Same key derivation chain — cipher is the last step only.
 *
 * STRICT NO-LOG POLICY:
 * - NEVER log key material, session state, plaintext, or nonces
 * - NEVER include crypto data in Sentry breadcrumbs
 * - Only log: operation name + success/failure
 */

import { x25519, ed25519 } from '@noble/curves/ed25519';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { hkdf } from '@noble/hashes/hkdf';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { getRandomBytes } from 'expo-crypto';

import type { X25519KeyPair, Ed25519KeyPair } from './types';

// ============================================================
// KEY GENERATION
// ============================================================

/** Generate an X25519 key pair for Diffie-Hellman key exchange. */
export function generateX25519KeyPair(): X25519KeyPair {
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
}

/** Generate an Ed25519 key pair for signing and identity. */
export function generateEd25519KeyPair(): Ed25519KeyPair {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
}

// ============================================================
// DIFFIE-HELLMAN
// ============================================================

/**
 * X25519 Diffie-Hellman shared secret computation.
 * Returns 32-byte shared secret.
 */
export function x25519DH(
  ourPrivateKey: Uint8Array,
  theirPublicKey: Uint8Array,
): Uint8Array {
  return x25519.getSharedSecret(ourPrivateKey, theirPublicKey);
}

// ============================================================
// ED25519 SIGNATURES
// ============================================================

/** Sign a message with an Ed25519 private key. Returns 64-byte signature. */
export function ed25519Sign(
  privateKey: Uint8Array,
  message: Uint8Array,
): Uint8Array {
  return ed25519.sign(message, privateKey);
}

/** Verify an Ed25519 signature. Returns true if valid. */
export function ed25519Verify(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
): boolean {
  try {
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

// ============================================================
// KEY CONVERSION (Ed25519 <-> X25519)
// ============================================================

/**
 * Convert an Ed25519 public key to an X25519 public key.
 * Used in X3DH to perform DH with identity keys.
 */
export function edToMontgomeryPub(ed25519PublicKey: Uint8Array): Uint8Array {
  return ed25519.utils.toMontgomery(ed25519PublicKey);
}

/**
 * Convert an Ed25519 private key to an X25519 private key.
 * Used in X3DH to perform DH with identity keys.
 */
export function edToMontgomeryPriv(ed25519PrivateKey: Uint8Array): Uint8Array {
  return ed25519.utils.toMontgomerySecret(ed25519PrivateKey);
}

// ============================================================
// KEY DERIVATION (HKDF + HMAC)
// ============================================================

/**
 * HKDF-SHA256 key derivation.
 *
 * Used for:
 * - X3DH shared secret derivation (info: "MizanlySignal")
 * - Root key ratchet (info: "MizanlyRatchet")
 * - Message key derivation (info: "MizanlyMsgKeys")
 * - Media chunk key/nonce derivation
 */
export function hkdfDeriveSecrets(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: string,
  length: number,
): Uint8Array {
  return hkdf(sha256, ikm, salt, info, length);
}

/**
 * HMAC-SHA256.
 *
 * Used for:
 * - Chain key advancement: KDF_CK(chainKey) -> messageKey || nextChainKey
 * - Safety number fingerprint computation (5200 iterations)
 */
export function hmacSha256(
  key: Uint8Array,
  data: Uint8Array,
): Uint8Array {
  return hmac(sha256, key, data);
}

/** SHA-256 hash. Used for media file integrity verification. */
export function sha256Hash(data: Uint8Array): Uint8Array {
  return sha256(data);
}

// ============================================================
// AUTHENTICATED ENCRYPTION (XChaCha20-Poly1305 AEAD)
// ============================================================

/**
 * Encrypt with XChaCha20-Poly1305 AEAD.
 *
 * - key: 32 bytes
 * - nonce: 24 bytes (HKDF-derived, guaranteed unique)
 * - plaintext: arbitrary length
 * - aad: additional authenticated data (header bytes, verified but not encrypted)
 *
 * Returns ciphertext + 16-byte auth tag (appended).
 * Tampering with ciphertext OR aad causes decryption to throw.
 */
export function aeadEncrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  plaintext: Uint8Array,
  aad?: Uint8Array,
): Uint8Array {
  if (key.length !== 32) throw new Error(`AEAD key must be 32 bytes, got ${key.length}`);
  if (nonce.length !== 24) throw new Error(`AEAD nonce must be 24 bytes, got ${nonce.length}`);
  const cipher = xchacha20poly1305(key, nonce, aad);
  return cipher.encrypt(plaintext);
}

/**
 * Decrypt with XChaCha20-Poly1305 AEAD.
 *
 * Throws if auth tag verification fails (tampered ciphertext or aad).
 */
export function aeadDecrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  aad?: Uint8Array,
): Uint8Array {
  if (key.length !== 32) throw new Error(`AEAD key must be 32 bytes, got ${key.length}`);
  if (nonce.length !== 24) throw new Error(`AEAD nonce must be 24 bytes, got ${nonce.length}`);
  const cipher = xchacha20poly1305(key, nonce, aad);
  return cipher.decrypt(ciphertext);
}

// ============================================================
// RANDOM BYTES (CSPRNG)
// ============================================================

/**
 * Generate cryptographically secure random bytes.
 * Delegates to platform CSPRNG (SecureRandom on Android, SecRandomCopyBytes on iOS).
 */
export function generateRandomBytes(length: number): Uint8Array {
  return getRandomBytes(length);
}

// ============================================================
// UTILITY
// ============================================================

/** Concatenate multiple Uint8Arrays into one. */
export function concat(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/** Encode a 32-bit unsigned integer as 4 big-endian bytes. */
export function uint32BE(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  buf[0] = (value >>> 24) & 0xff;
  buf[1] = (value >>> 16) & 0xff;
  buf[2] = (value >>> 8) & 0xff;
  buf[3] = value & 0xff;
  return buf;
}

/** Convert Uint8Array to Base64 string (for API communication). */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Convert Base64 string to Uint8Array (from API communication). */
export function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * UTF-8 encode a string to bytes.
 * TextEncoder is native in Hermes (Expo SDK 52).
 */
export function utf8Encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/** UTF-8 decode bytes to string. */
export function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Best-effort constant-time byte comparison.
 * Avoids early-return timing leak. JavaScript can't truly guarantee constant-time
 * (JIT may optimize), but XOR accumulator is better than short-circuit.
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  // XOR accumulator over the longer array — no early return on length mismatch.
  // Length difference still results in false, but timing doesn't reveal WHICH byte differs.
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length; // Non-zero if lengths differ
  for (let i = 0; i < len; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Best-effort secure memory wipe.
 *
 * JavaScript provides NO guarantee this works:
 * - GC may have already copied the data
 * - JIT may optimize away the fill
 * - V8/Hermes may keep copies in optimized code
 *
 * We do it anyway as defense-in-depth. For true secure wiping,
 * migrate to react-native-quick-crypto (C++ OPENSSL_cleanse).
 */
export function zeroOut(arr: Uint8Array): void {
  // Write random bytes first (defeats dead-store elimination by the JIT —
  // the optimizer can't prove these random bytes are unused, so it keeps the write).
  // Then fill with zeros. Two writes > one write for secure wiping in JS.
  try {
    const random = getRandomBytes(arr.length);
    arr.set(random);
  } catch {
    // If getRandomBytes fails (shouldn't in practice), fall back to fill
  }
  arr.fill(0);
}
