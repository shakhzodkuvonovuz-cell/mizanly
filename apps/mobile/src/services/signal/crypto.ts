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
// V6-F14: Complete type declaration for all native crypto adapter functions.
// Previously missing nativeHkdf, nativeAeadEncrypt, nativeAeadDecrypt,
// constantTimeCompare, secureZero — accessed via `as any` casts throughout.
interface NativeCryptoAdapter {
  isNativeCryptoAvailable: () => boolean;
  hmacSha256?: (k: Uint8Array, d: Uint8Array) => Uint8Array;
  sha256?: (d: Uint8Array) => Uint8Array;
  nativeHkdf?: (ikm: Uint8Array, salt: Uint8Array, info: string, length: number) => Uint8Array | null;
  nativeAeadEncrypt?: (k: Uint8Array, n: Uint8Array, p: Uint8Array, a?: Uint8Array) => Uint8Array | null;
  nativeAeadDecrypt?: (k: Uint8Array, n: Uint8Array, c: Uint8Array, a?: Uint8Array) => Uint8Array | null;
  constantTimeCompare?: (a: Uint8Array, b: Uint8Array) => boolean;
  secureZero?: (arr: Uint8Array) => void;
}
let nativeCryptoAdapter: NativeCryptoAdapter | null = null;
try {
  nativeCryptoAdapter = require('./native-crypto-adapter');
} catch { nativeCryptoAdapter = null; }

// ============================================================
// KEY GENERATION
// ============================================================

/**
 * Generate an X25519 key pair for Diffie-Hellman key exchange.
 * F01-#5: Private key zeroed on public key derivation failure.
 */
export function generateX25519KeyPair(): X25519KeyPair {
  const privateKey = x25519.utils.randomPrivateKey();
  try {
    const publicKey = x25519.getPublicKey(privateKey);
    return { publicKey, privateKey };
  } catch (e) {
    zeroOut(privateKey);
    throw e;
  }
}

/**
 * Generate an Ed25519 key pair for signing and identity.
 * F01-#5: Private key zeroed on public key derivation failure.
 */
export function generateEd25519KeyPair(): Ed25519KeyPair {
  const privateKey = ed25519.utils.randomPrivateKey();
  try {
    const publicKey = ed25519.getPublicKey(privateKey);
    return { publicKey, privateKey };
  } catch (e) {
    zeroOut(privateKey);
    throw e;
  }
}

// ============================================================
// DIFFIE-HELLMAN
// ============================================================

/**
 * X25519 Diffie-Hellman shared secret computation.
 * Returns 32-byte shared secret.
 *
 * IMPORTANT: Caller MUST zero the returned shared secret after use via zeroOut().
 * The shared secret is 32 bytes of key material equivalent in sensitivity to
 * an encryption key. Always wrap usage in try/finally { zeroOut(secret); }.
 */
export function x25519DH(
  ourPrivateKey: Uint8Array,
  theirPublicKey: Uint8Array,
): Uint8Array {
  return x25519.getSharedSecret(ourPrivateKey, theirPublicKey);
}

// ============================================================
// DH OUTPUT VALIDATION (small-subgroup protection)
// ============================================================

/**
 * V5: All 7 distinct small-order X25519 x-coordinates (Montgomery form, LE).
 *
 * Curve25519 has cofactor h=8, but in x-only Montgomery representation,
 * conjugate points (±y) share the same x-coordinate. This yields exactly
 * 7 distinct x-values, not 8. (V8-F1 audit claimed 8 — mathematically incorrect.)
 *
 * @noble/curves rejects ALL of these at the library level (throws before
 * our check runs). This list is defense-in-depth for non-clamping backends.
 *
 * Previously duplicated in x3dh.ts, double-ratchet.ts, sealed-sender.ts.
 * Now single source of truth here.
 */
export const LOW_ORDER_POINTS: Uint8Array[] = [
  new Uint8Array(32),
  (() => { const p = new Uint8Array(32); p[0] = 1; return p; })(),
  new Uint8Array([0xec, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f]),
  new Uint8Array([0xe0, 0xeb, 0x7a, 0x7c, 0x3b, 0x41, 0xb8, 0xae, 0x16, 0x56, 0xe3, 0xfa, 0xf1, 0x9f, 0xc4, 0x6a, 0xda, 0x09, 0x8d, 0xeb, 0x9c, 0x32, 0xb1, 0xfd, 0x86, 0x62, 0x05, 0x16, 0x5f, 0x49, 0xb8, 0x00]),
  new Uint8Array([0x5f, 0x9c, 0x95, 0xbc, 0xa3, 0x50, 0x8c, 0x24, 0xb1, 0xd0, 0xb1, 0x55, 0x9c, 0x83, 0xef, 0x5b, 0x04, 0x44, 0x5c, 0xc4, 0x58, 0x1c, 0x8e, 0x86, 0xd8, 0x22, 0x4e, 0xdd, 0xd0, 0x9f, 0x11, 0x57]),
  new Uint8Array([0xed, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f]),
  new Uint8Array([0xee, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f]),
];

/**
 * V5: Reject DH outputs that match any low-order point.
 * Must be called after every x25519DH() in the protocol:
 * - x3dh.ts: DH1-DH4 (initiator + responder)
 * - double-ratchet.ts: DH ratchet steps
 * - sealed-sender.ts: seal/unseal envelope DH
 */
export function assertNonZeroDH(dh: Uint8Array, label: string): void {
  for (const lowOrder of LOW_ORDER_POINTS) {
    if (constantTimeEqual(dh, lowOrder)) {
      throw new Error(`DH ${label} produced low-order output. Key may be malicious.`);
    }
  }
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
  // Try native HKDF (OpenSSL, hardware-accelerated)
  if (nativeCryptoAdapter) {
    const native = nativeCryptoAdapter.nativeHkdf;
    if (native) {
      const result = native(ikm, salt, info, length);
      if (result) return result;
    }
  }
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
  // Try native C++ path first (10-50x faster via OpenSSL hardware acceleration)
  if (nativeCryptoAdapter) {
    const native = nativeCryptoAdapter.nativeAeadEncrypt;
    if (native) {
      const result = native(key, nonce, plaintext, aad);
      if (result) return result;
    }
  }
  // Fallback to @noble (pure JS)
  const cipher = xchacha20poly1305(key, nonce, aad);
  return cipher.encrypt(plaintext);
}

/**
 * Decrypt with XChaCha20-Poly1305 AEAD.
 *
 * Throws if auth tag verification fails (tampered ciphertext or aad).
 */
/**
 * F01-#2 FIX: Native AEAD decrypt now throws on auth failure instead of returning
 * null. This prevents the timing oracle where a tampered ciphertext causes two
 * decrypt attempts (native fail + @noble retry) vs one attempt (native unavailable).
 * Only "feature not available" (null return) triggers @noble fallback.
 */
export function aeadDecrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  aad?: Uint8Array,
): Uint8Array {
  if (key.length !== 32) throw new Error(`AEAD key must be 32 bytes, got ${key.length}`);
  if (nonce.length !== 24) throw new Error(`AEAD nonce must be 24 bytes, got ${nonce.length}`);
  // Try native C++ path first
  if (nativeCryptoAdapter) {
    const native = nativeCryptoAdapter.nativeAeadDecrypt;
    if (native) {
      // nativeAeadDecrypt returns null = "feature not available" (fall through)
      // nativeAeadDecrypt throws = auth failure (propagate — do NOT retry with @noble)
      const result = native(key, nonce, ciphertext, aad);
      if (result) return result;
    }
  }
  // Fallback to @noble (pure JS)
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
 *
 * V6-F7 FIX: Constant-time padding validation. Previously threw on first mismatch,
 * leaking the position of the bad byte via timing. Now accumulates XOR diff across
 * ALL padding bytes and throws after the loop. While AEAD prevents ciphertext
 * modification (making this unexploitable in practice), constant-time validation
 * is defense-in-depth against future protocol changes.
 */
export function unpadMessage(padded: Uint8Array): Uint8Array {
  if (padded.length === 0) throw new Error('Empty padded message');
  const padLen = padded[padded.length - 1];
  if (padLen === 0 || padLen > padded.length || padLen > MIN_PADDED_SIZE) {
    throw new Error('Invalid message padding');
  }
  // Constant-time: accumulate XOR diff across all padding bytes, throw after loop
  let diff = 0;
  for (let i = padded.length - padLen; i < padded.length; i++) {
    diff |= padded[i] ^ padLen;
  }
  if (diff !== 0) throw new Error('Invalid message padding');
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

/**
 * Encode a 32-bit unsigned integer as 4 big-endian bytes.
 * F01-#11: Validates input to prevent NaN/Infinity/negative from producing
 * silent zero output (NaN >>> 24 = 0), which could cause nonce reuse.
 */
export function uint32BE(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xFFFFFFFF) {
    throw new Error(`uint32BE: value must be integer 0..2^32-1, got ${value}`);
  }
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
    // F01-#10 FIX: Create an independent copy instead of a view into the source ArrayBuffer.
    // Previously used Buffer.from(bytes.buffer, ...) which shares the underlying ArrayBuffer.
    // If caller zeros `bytes` while toString hasn't completed, the Buffer view would read zeroed data.
    // Consistent with fromBase64 V7-F12 fix which also copies to isolated memory.
    return Buffer.from(new Uint8Array(bytes)).toString('base64');
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
    // V7-F12 FIX: Copy bytes to a standalone ArrayBuffer instead of returning a view.
    // Buffer.from(string) may allocate from the Node/Hermes Buffer pool (8KB slab).
    // The returned Uint8Array would be a VIEW into the shared pool. If zeroOut() is
    // called on this view, it zeros bytes within the pool slab. But if the pool
    // reuses the same slab for another allocation BEFORE zeroOut, the new Buffer
    // shares the same ArrayBuffer and can observe key material at adjacent offsets.
    // Copying to a standalone Uint8Array ensures zeroOut operates on isolated memory.
    const buf = Buffer.from(base64, 'base64');
    const result = new Uint8Array(buf.byteLength);
    result.set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
    return result;
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
  if (nativeCryptoAdapter?.isNativeCryptoAvailable() && nativeCryptoAdapter.constantTimeCompare) {
    return nativeCryptoAdapter.constantTimeCompare(a, b);
  }
  // V7-F13 FIX: Pre-pad arrays to eliminate nullish coalescing timing branch.
  // Previously: `(a[i] ?? 0)` introduced a timing branch — the JS engine takes a
  // different code path for in-bounds access (returns number) vs. out-of-bounds
  // (returns undefined, then ?? evaluates). This leaks the exact boundary where each
  // array ends, allowing an attacker to determine individual array lengths.
  // Now: both arrays are copied into equal-length buffers. All accesses are in-bounds.
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  const padA = new Uint8Array(len); // Zero-initialized
  const padB = new Uint8Array(len);
  padA.set(a);
  padB.set(b);
  for (let i = 0; i < len; i++) {
    diff |= padA[i] ^ padB[i];
  }
  // V8-F2 FIX: Zero the padded copies via zeroOut (not fill(0) which JIT can eliminate).
  // padA/padB contain copies of session keys, HMAC results — must not leak to GC.
  zeroOut(padA);
  zeroOut(padB);
  return diff === 0;
}

/**
 * Secure memory wipe.
 * Uses native OPENSSL_cleanse when react-native-quick-crypto is available (C13),
 * falls back to random overwrite + zero fill otherwise.
 */
export function zeroOut(arr: Uint8Array): void {
  if (nativeCryptoAdapter?.isNativeCryptoAvailable() && nativeCryptoAdapter.secureZero) {
    nativeCryptoAdapter.secureZero(arr);
    return;
  }

  // Fallback: random overwrite then zero (defeats dead-store elimination)
  try {
    const random = getRandomBytes(arr.length);
    arr.set(random);
  } catch {
    // F01-#8: Log non-sensitive warning instead of silently swallowing
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('zeroOut: CSPRNG unavailable, using fill(0) only');
    }
  }
  arr.fill(0);
  // Read-back to defeat JIT dead-store elimination
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  arr[0];
}
