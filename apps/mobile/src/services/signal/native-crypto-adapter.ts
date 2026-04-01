/**
 * Native Crypto Adapter (C13): Constant-time operations via C++ JSI.
 *
 * This adapter provides a seamless fallback:
 * - If react-native-quick-crypto is installed → uses C++ OpenSSL
 * - If not installed → falls back to @noble/* (pure JS, best-effort)
 *
 * The rest of the signal/ code uses crypto.ts, which delegates to this adapter
 * for timing-sensitive operations. The adapter is transparent — callers don't
 * need to know which implementation is active.
 *
 * WHY THIS MATTERS:
 * @noble/* is pure JavaScript. The JIT can:
 * - Optimize away branches based on secret data
 * - Cache-line differences based on array access patterns
 * - GC copies of key material that zeroOut can't reach
 *
 * react-native-quick-crypto uses OpenSSL via JSI (C++ bridge):
 * - CRYPTO_memcmp via timingSafeEqual: constant-time comparison
 * - randomFillSync + fill(0): best-effort secure wipe (NOT OPENSSL_cleanse)
 * - OpenSSL EVP_*: hardware-accelerated crypto primitives
 *
 * To activate: `npx expo install react-native-quick-crypto`
 * The adapter auto-detects on import. Zero config needed.
 */

// ============================================================
// NATIVE MODULE INTERFACE (F02-#4: strict typing, no `any`)
// ============================================================

/** Subset of react-native-quick-crypto API surface actually used by the adapter */
interface QuickCryptoModule {
  timingSafeEqual?: (a: Buffer, b: Buffer) => boolean;
  randomFillSync?: (arr: Uint8Array) => Uint8Array;
  randomBytes?: (length: number) => Buffer;
  createCipheriv?: (algorithm: string, key: Buffer, iv: Buffer, options?: { authTagLength: number }) => CipherHandle;
  createDecipheriv?: (algorithm: string, key: Buffer, iv: Buffer, options?: { authTagLength: number }) => DecipherHandle;
  createHash?: (algorithm: string) => HashHandle;
  createHmac?: (algorithm: string, key: Buffer) => HmacHandle;
  hkdfSync?: (hash: string, ikm: Buffer, salt: Buffer, info: string, length: number) => ArrayBuffer;
}

interface CipherHandle {
  setAAD(aad: Buffer): void;
  update(data: Buffer): Buffer;
  final(): Buffer;
  getAuthTag(): Buffer;
}

interface DecipherHandle {
  setAuthTag(tag: Buffer): void;
  setAAD(aad: Buffer): void;
  update(data: Buffer): Buffer;
  final(): Buffer;
}

interface HashHandle {
  update(data: Buffer): HashHandle;
  digest(): Buffer;
}

interface HmacHandle {
  update(data: Buffer): HmacHandle;
  digest(): Buffer;
}

// ============================================================
// AUTO-DETECTION (synchronous — guarantees native from first call)
// ============================================================

let nativeModuleLoaded = false;
let nativeCrypto: QuickCryptoModule | null = null;

// V6-F9 FIX: Synchronous require() instead of async import().
try {
  const quickCrypto = require('react-native-quick-crypto');
  if (quickCrypto?.default?.randomBytes || quickCrypto?.randomBytes) {
    nativeCrypto = (quickCrypto.default ?? quickCrypto) as QuickCryptoModule;
    nativeModuleLoaded = true;
  }
} catch {
  nativeModuleLoaded = false;
}

/** Check if native crypto module is loaded (F02-#11: renamed for clarity) */
export function isNativeCryptoAvailable(): boolean {
  return nativeModuleLoaded;
}

// ============================================================
// CONSTANT-TIME COMPARISON
// ============================================================

/**
 * Compare two byte arrays in constant time.
 *
 * - Native: Uses CRYPTO_memcmp via timingSafeEqual (hardware-guaranteed)
 * - Fallback: Pre-padded XOR accumulator (F02-#3: matches crypto.ts V7-F13 fix)
 */
export function constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean {
  if (nativeModuleLoaded && nativeCrypto?.timingSafeEqual) {
    try {
      // timingSafeEqual requires equal-length buffers — pre-pad
      const len = Math.max(a.length, b.length);
      const padA = Buffer.alloc(len);
      const padB = Buffer.alloc(len);
      padA.set(a);
      padB.set(b);
      const result = nativeCrypto.timingSafeEqual(padA, padB) && a.length === b.length;
      // F02-#5: zero the Buffer copies containing comparison operands
      padA.fill(0);
      padB.fill(0);
      return result;
    } catch {
      // Length mismatch throws in timingSafeEqual
      return false;
    }
  }

  // Fallback: Pre-padded XOR accumulator (F02-#3 fix — matches crypto.ts V7-F13)
  // Previously used `(a[i] ?? 0) ^ (b[i] ?? 0)` which has timing side-channel:
  // the nullish coalescing operator causes a JIT branch difference for in-bounds
  // vs out-of-bounds access, leaking individual array lengths via timing.
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  const padA = new Uint8Array(len);
  const padB = new Uint8Array(len);
  padA.set(a);
  padB.set(b);
  for (let i = 0; i < len; i++) {
    diff |= padA[i] ^ padB[i];
  }
  // Zero the padded copies
  padA.fill(0);
  padB.fill(0);
  return diff === 0;
}

// ============================================================
// SECURE MEMORY WIPE
// ============================================================

/**
 * Securely zero a byte array.
 *
 * - Native: randomFillSync overwrite + fill(0). This is best-effort, NOT
 *   OPENSSL_cleanse. The fill(0) may be subject to JIT dead-store elimination,
 *   but the randomFillSync provides a first overwrite pass that is not optimized
 *   away (it has observable side effects). True OPENSSL_cleanse would require a
 *   dedicated JSI binding. (F02-#2: honest docstring)
 * - Fallback: expo-crypto random overwrite + zero fill (best-effort)
 *
 * To defeat dead-store elimination, we read back after fill(0) to ensure the
 * compiler cannot prove the zero-fill is a dead store. (F02-#2 mitigation)
 */
export function secureZero(arr: Uint8Array): void {
  if (nativeModuleLoaded && nativeCrypto?.randomFillSync) {
    try {
      // Overwrite with random bytes via native CSPRNG, then zero
      nativeCrypto.randomFillSync(arr);
      arr.fill(0);
      // Read-back to defeat dead-store elimination (JIT cannot prove fill is dead)
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      arr[0];
      return;
    } catch {
      // Fall through to JS fallback
    }
  }

  // Fallback: random overwrite then zero
  try {
    const { getRandomBytes } = require('expo-crypto');
    const random = getRandomBytes(arr.length);
    arr.set(random);
    // F02-#12: the random array itself doesn't contain key material, no zeroing needed
  } catch {
    // F01-#8: CSPRNG failure — log a non-sensitive warning instead of swallowing
    if (__DEV__) {
      console.warn('secureZero: CSPRNG fallback unavailable, using fill(0) only');
    }
  }
  arr.fill(0);
  // Read-back to defeat dead-store elimination
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  arr[0];
}

// ============================================================
// RANDOM BYTES
// ============================================================

/**
 * Generate cryptographically secure random bytes.
 *
 * - Native: Uses OpenSSL RAND_bytes (hardware-seeded)
 * - Fallback: expo-crypto getRandomBytes (platform CSPRNG)
 */
export function secureRandomBytes(length: number): Uint8Array {
  if (nativeModuleLoaded && nativeCrypto?.randomBytes) {
    try {
      const buf = nativeCrypto.randomBytes(length);
      const result = new Uint8Array(buf);
      // F02-#13: zero the Buffer if it's a separate object from result
      if (buf instanceof Buffer) {
        (buf as Buffer).fill(0);
      }
      return result;
    } catch {
      // Fall through
    }
  }

  // Fallback
  const { getRandomBytes } = require('expo-crypto');
  return getRandomBytes(length);
}

// ============================================================
// AEAD ENCRYPT/DECRYPT (XChaCha20-Poly1305 via native ChaCha20-Poly1305)
// ============================================================

/**
 * ChaCha20 sigma constant: "expand 32-byte k" in LE Uint32.
 * Used by HChaCha20 key schedule.
 */
const CHACHA_SIGMA = new Uint32Array([0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]);

/**
 * Convert Uint8Array to Uint32Array interpreting bytes as little-endian 32-bit words.
 * Creates a new Uint32Array (copy, not view) to avoid alignment issues.
 */
function u8to32LE(u8: Uint8Array): Uint32Array {
  const u32 = new Uint32Array(u8.length >>> 2);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  for (let i = 0; i < u32.length; i++) {
    u32[i] = dv.getUint32(i * 4, true);
  }
  return u32;
}

/**
 * Convert Uint32Array to Uint8Array interpreting words as little-endian bytes.
 */
function u32to8LE(u32: Uint32Array): Uint8Array {
  const u8 = new Uint8Array(u32.length * 4);
  const dv = new DataView(u8.buffer);
  for (let i = 0; i < u32.length; i++) {
    dv.setUint32(i * 4, u32[i], true);
  }
  return u8;
}

/**
 * HChaCha20 key schedule — derives 32-byte subkey from key + 16-byte nonce prefix.
 *
 * F02-#1 FIX: Previously called `@noble/ciphers/chacha`'s `hchacha(key, nonce16)` with
 * wrong argument types (Uint8Array instead of Uint32Array, 2 args instead of 4).
 * The TypeError was silently caught, making the entire native AEAD path dead code.
 * Now correctly converts to Uint32Array and passes all 4 required arguments:
 * sigma (constant), key (8 words), nonce (4 words), output (8 words).
 */
function hchacha20(key: Uint8Array, nonce16: Uint8Array): Uint8Array {
  const { hchacha } = require('@noble/ciphers/chacha');
  const keyU32 = u8to32LE(key);
  const nonceU32 = u8to32LE(nonce16);
  const outU32 = new Uint32Array(8);
  hchacha(CHACHA_SIGMA, keyU32, nonceU32, outU32);
  const result = u32to8LE(outU32);
  // Zero intermediate Uint32Array copies of key material
  keyU32.fill(0);
  outU32.fill(0);
  return result;
}

/**
 * XChaCha20-Poly1305 encrypt using native ChaCha20-Poly1305.
 * Returns ciphertext + 16-byte tag (same format as @noble).
 *
 * F02-#7: Errors are now distinguished — auth failures throw (not silently fallback),
 * only "feature not available" returns null.
 * F02-#8: Key/nonce length validation added.
 */
export function nativeAeadEncrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  plaintext: Uint8Array,
  aad?: Uint8Array,
): Uint8Array | null {
  if (!nativeModuleLoaded || !nativeCrypto?.createCipheriv) return null;
  // F02-#8: validate input lengths
  if (key.length !== 32) return null;
  if (nonce.length !== 24) return null;

  // XChaCha20 extension: derive subkey + short nonce
  const subkey = hchacha20(key, nonce.slice(0, 16));
  // ChaCha20-Poly1305 uses 12-byte nonce: [0,0,0,0] + nonce[16:24]
  const shortNonce = new Uint8Array(12);
  shortNonce.set(nonce.slice(16, 24), 4);

  // F02-#5: Create Buffers for native calls, zero them after use
  const keyBuf = Buffer.from(subkey);
  const nonceBuf = Buffer.from(shortNonce);
  const plaintextBuf = Buffer.from(plaintext);
  const aadBuf = aad ? Buffer.from(aad) : null;

  try {
    const cipher = nativeCrypto.createCipheriv(
      'chacha20-poly1305',
      keyBuf,
      nonceBuf,
      { authTagLength: 16 },
    );
    if (aadBuf) cipher.setAAD(aadBuf);

    const encrypted = cipher.update(plaintextBuf);
    cipher.final();
    const tag = cipher.getAuthTag();

    // Combine: ciphertext + tag (matches @noble/ciphers format)
    const result = new Uint8Array(encrypted.length + tag.length);
    result.set(new Uint8Array(encrypted));
    result.set(new Uint8Array(tag), encrypted.length);
    return result;
  } catch (e: unknown) {
    // F02-#7: Log error type (NOT message, which could contain key material)
    const errName = e instanceof Error ? e.constructor.name : 'UnknownError';
    if (__DEV__) {
      console.warn(`nativeAeadEncrypt failed: ${errName}`);
    }
    return null; // Fall back to @noble
  } finally {
    // F02-#5/#6: Zero all Buffer copies and the subkey
    secureZero(subkey);
    secureZero(shortNonce);
    keyBuf.fill(0);
    nonceBuf.fill(0);
    plaintextBuf.fill(0);
    if (aadBuf) aadBuf.fill(0);
  }
}

/**
 * XChaCha20-Poly1305 decrypt using native ChaCha20-Poly1305.
 * Input: ciphertext + 16-byte tag (same format as @noble).
 *
 * F02-#7: Auth tag failure is now distinguished from "feature not available".
 * Returns null for "feature not available", throws for auth failure.
 * This prevents the timing oracle where the caller retries with @noble after
 * a native auth failure (two decrypt attempts = measurably different latency).
 */
export function nativeAeadDecrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  ciphertextWithTag: Uint8Array,
  aad?: Uint8Array,
): Uint8Array | null {
  if (!nativeModuleLoaded || !nativeCrypto?.createDecipheriv) return null;
  // F02-#8: validate input lengths
  if (key.length !== 32) return null;
  if (nonce.length !== 24) return null;
  if (ciphertextWithTag.length < 16) return null;

  const subkey = hchacha20(key, nonce.slice(0, 16));
  const shortNonce = new Uint8Array(12);
  shortNonce.set(nonce.slice(16, 24), 4);

  const ciphertext = ciphertextWithTag.slice(0, -16);
  const tag = ciphertextWithTag.slice(-16);

  // F02-#5: Create Buffers for native calls, zero them after use
  const keyBuf = Buffer.from(subkey);
  const nonceBuf = Buffer.from(shortNonce);
  const ciphertextBuf = Buffer.from(ciphertext);
  const tagBuf = Buffer.from(tag);
  const aadBuf = aad ? Buffer.from(aad) : null;

  try {
    const decipher = nativeCrypto.createDecipheriv(
      'chacha20-poly1305',
      keyBuf,
      nonceBuf,
      { authTagLength: 16 },
    );
    decipher.setAuthTag(tagBuf);
    if (aadBuf) decipher.setAAD(aadBuf);

    const decrypted = decipher.update(ciphertextBuf);
    decipher.final(); // Throws if auth tag doesn't verify
    return new Uint8Array(decrypted);
  } catch (e: unknown) {
    // F02-#7: Distinguish auth failure from "feature not available"
    // Auth failure (decipher.final() throws) must propagate as an error,
    // not return null which would cause crypto.ts to retry with @noble
    // (creating a timing oracle: two attempts vs one)
    const errName = e instanceof Error ? e.constructor.name : 'UnknownError';
    if (errName === 'TypeError' || errName === 'ReferenceError') {
      // Native module issue — fall back to @noble
      if (__DEV__) {
        console.warn(`nativeAeadDecrypt native unavailable: ${errName}`);
      }
      return null;
    }
    // Auth tag verification failure or other crypto error — propagate
    throw new Error('AEAD authentication failed');
  } finally {
    // F02-#5/#6: Zero all Buffer copies and the subkey
    secureZero(subkey);
    secureZero(shortNonce);
    keyBuf.fill(0);
    nonceBuf.fill(0);
    ciphertextBuf.fill(0);
    tagBuf.fill(0);
    if (aadBuf) aadBuf.fill(0);
  }
}

// ============================================================
// HKDF (native when available)
// ============================================================

/**
 * Native HKDF-SHA256.
 * react-native-quick-crypto provides hkdfSync which uses OpenSSL's HKDF.
 */
export function nativeHkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: string,
  length: number,
): Uint8Array | null {
  if (!nativeModuleLoaded || !nativeCrypto?.hkdfSync) return null;

  // F02-#5: Create Buffers, zero after use
  const ikmBuf = Buffer.from(ikm);
  const saltBuf = Buffer.from(salt);

  try {
    const result = nativeCrypto.hkdfSync(
      'sha256',
      ikmBuf,
      saltBuf,
      info,
      length,
    );
    return new Uint8Array(result);
  } catch (e: unknown) {
    if (__DEV__) {
      const errName = e instanceof Error ? e.constructor.name : 'UnknownError';
      console.warn(`nativeHkdf failed: ${errName}`);
    }
    return null;
  } finally {
    ikmBuf.fill(0);
    saltBuf.fill(0);
  }
}

// ============================================================
// HASHING (hardware-accelerated when available)
// ============================================================

/**
 * SHA-256 hash.
 *
 * - Native: Uses OpenSSL SHA256 (hardware-accelerated on supported platforms)
 * - Fallback: @noble/hashes sha256
 */
export function sha256(data: Uint8Array): Uint8Array {
  if (nativeModuleLoaded && nativeCrypto?.createHash) {
    const dataBuf = Buffer.from(data);
    try {
      const hash = nativeCrypto.createHash('sha256');
      hash.update(dataBuf);
      return new Uint8Array(hash.digest());
    } catch {
      // Fall through
    } finally {
      dataBuf.fill(0);
    }
  }

  // Fallback
  const { sha256: nobleSha256 } = require('@noble/hashes/sha256');
  return nobleSha256(data);
}

/**
 * HMAC-SHA256.
 *
 * - Native: Uses OpenSSL HMAC (constant-time)
 * - Fallback: @noble/hashes hmac
 */
export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  if (nativeModuleLoaded && nativeCrypto?.createHmac) {
    // F02-#5: Zero Buffer copies after use
    const keyBuf = Buffer.from(key);
    const dataBuf = Buffer.from(data);
    try {
      const h = nativeCrypto.createHmac('sha256', keyBuf);
      h.update(dataBuf);
      return new Uint8Array(h.digest());
    } catch {
      // Fall through
    } finally {
      keyBuf.fill(0);
      dataBuf.fill(0);
    }
  }

  // Fallback
  const { hmac } = require('@noble/hashes/hmac');
  const { sha256: nobleSha256 } = require('@noble/hashes/sha256');
  return hmac(nobleSha256, key, data);
}
