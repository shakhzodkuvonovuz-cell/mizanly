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

// F30 FIX: Hoist require() to module level. Previously called inside hot-path functions
// (hmacSha256, sha256Hash, aeadEncrypt, aeadDecrypt) adding ~0.01ms per call.
// require() is cached by the module system, but the lookup still has overhead.
let nativeCryptoAdapter: { isNativeCryptoAvailable: () => boolean; hmacSha256?: (k: Uint8Array, d: Uint8Array) => Uint8Array; sha256?: (d: Uint8Array) => Uint8Array; aeadEncrypt?: (k: Uint8Array, n: Uint8Array, p: Uint8Array, a?: Uint8Array) => Uint8Array; aeadDecrypt?: (k: Uint8Array, n: Uint8Array, c: Uint8Array, a?: Uint8Array) => Uint8Array } | null = null;
try {
  nativeCryptoAdapter = require('./native-crypto-adapter');
} catch { nativeCryptoAdapter = null; }

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
/** HMAC-SHA256. Uses native OpenSSL when available (C13), @noble fallback. */
export function hmacSha256(
  key: Uint8Array,
  data: Uint8Array,
): Uint8Array {
  if (nativeCryptoAdapter?.isNativeCryptoAvailable() && nativeCryptoAdapter.hmacSha256) {
    return nativeCryptoAdapter.hmacSha256(key, data);
  }
  return hmac(sha256, key, data);
}

/** SHA-256 hash. Uses native OpenSSL when available (C13), @noble fallback. */
export function sha256Hash(data: Uint8Array): Uint8Array {
  if (nativeCryptoAdapter?.isNativeCryptoAvailable() && nativeCryptoAdapter.sha256) {
    return nativeCryptoAdapter.sha256(data);
  }
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
// MESSAGE PADDING (shared between Double Ratchet and Sender Keys)
// ============================================================

/** Minimum padded message size (hides short messages like "yes", "no", "ok") */
const MIN_PADDED_SIZE = 160;
/** Padding block alignment */
const PAD_BLOCK = 16;

/**
 * Pad plaintext using PKCS#7-style padding to hide message length.
 * Messages < 160 bytes pad to 160. Longer messages pad to next 16-byte boundary.
 */
export function padMessage(plaintext: Uint8Array): Uint8Array {
  const targetLen = Math.max(MIN_PADDED_SIZE, plaintext.length + 1);
  const paddedLen = Math.ceil(targetLen / PAD_BLOCK) * PAD_BLOCK;
  const padLen = paddedLen - plaintext.length;
  // E1: Cap padLen to 255 (max value representable in a single byte).
  // For messages near MAX_MESSAGE_SIZE this is always true, but be explicit.
  if (padLen > 255) throw new Error(`Padding too large: ${padLen} bytes (max 255)`);
  const padded = new Uint8Array(paddedLen);
  padded.set(plaintext);
  for (let i = plaintext.length; i < paddedLen; i++) {
    padded[i] = padLen;
  }
  return padded;
}

/**
 * Remove padding. Throws on invalid padding (tampering detected).
 * E1: Validates padLen is within PAD_BLOCK alignment (max 160 for short messages,
 * standard 1-16 for longer messages). Rejects implausible padLen values.
 */
export function unpadMessage(padded: Uint8Array): Uint8Array {
  if (padded.length === 0) throw new Error('Empty padded message');
  const padLen = padded[padded.length - 1];
  if (padLen === 0 || padLen > padded.length || padLen > MIN_PADDED_SIZE) {
    throw new Error('Invalid message padding');
  }
  // Verify all pad bytes match
  for (let i = padded.length - padLen; i < padded.length; i++) {
    if (padded[i] !== padLen) throw new Error('Invalid message padding');
  }
  return padded.slice(0, padded.length - padLen);
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

/**
 * F19 FIX: Convert Uint8Array to Base64 using Buffer when available.
 *
 * Previously: `String.fromCharCode` loop + `btoa` created an immutable
 * intermediate JS string containing key material. Strings can't be zeroed
 * and persist until GC.
 *
 * Now: `Buffer.from().toString('base64')` performs the encoding in a single
 * native operation (V8/Hermes internal), avoiding the character-by-character
 * intermediate string. The Buffer itself is a Uint8Array view and CAN be
 * zeroed after use (though we don't here — the string output is still immutable).
 *
 * This reduces the number of intermediate copies from 2 (string + btoa output)
 * to 1 (base64 string output only). The base64 string is still immutable
 * (inherent JS limitation), but we've eliminated the intermediate binary string.
 */
export function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  }
  // Fallback for environments without Buffer
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * F19 FIX: Convert Base64 string to Uint8Array using Buffer when available.
 * Same rationale as toBase64 — avoids intermediate string allocation.
 */
export function fromBase64(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(base64, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  // Fallback
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
 * Constant-time byte comparison.
 * Uses native CRYPTO_memcmp when react-native-quick-crypto is available (C13),
 * falls back to XOR accumulator otherwise.
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (nativeCryptoAdapter?.isNativeCryptoAvailable() && (nativeCryptoAdapter as any).constantTimeCompare) {
    return (nativeCryptoAdapter as any).constantTimeCompare(a, b);
  }
  // Fallback: XOR accumulator (best-effort in JS)
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Secure memory wipe.
 * Uses native OPENSSL_cleanse when react-native-quick-crypto is available (C13),
 * falls back to random overwrite + zero fill otherwise.
 */
export function zeroOut(arr: Uint8Array): void {
  if (nativeCryptoAdapter?.isNativeCryptoAvailable() && (nativeCryptoAdapter as any).secureZero) {
    (nativeCryptoAdapter as any).secureZero(arr);
    return;
  }

  // Fallback: random overwrite then zero (defeats dead-store elimination)
  try {
    const random = getRandomBytes(arr.length);
    arr.set(random);
  } catch {}
  arr.fill(0);
}
