/**
 * Safety number computation — CLIENT-SIDE.
 *
 * Safety numbers let users verify they're talking to the right person
 * (not a MITM). Each user pair produces a deterministic 60-digit number
 * derived from both identity keys. If the number matches when compared
 * out-of-band (in person, phone call), the session is authentic.
 *
 * MUST be computed client-side using locally stored identity keys
 * (TOFU store in MMKV). Server-side computation defeats the purpose —
 * a compromised server could substitute keys and return matching numbers.
 *
 * Algorithm: Signal's NumericFingerprint v2
 * - 5200 iterations of HMAC-SHA256 per fingerprint
 * - 2-byte version prefix (\x00\x00) — matches Signal spec
 * - Sorted by userId for deterministic ordering
 * - 60 digits output (12 groups of 5)
 *
 * This matches the Go E2E server's computation (handler.go computeSafetyNumber)
 * for cross-validation, but the CLIENT computation is the authoritative one.
 */

import {
  hmacSha256,
  concat,
  utf8Encode,
} from './crypto';
import {
  loadKnownIdentityKey,
  loadIdentityKeyPair,
} from './storage';

// ============================================================
// CACHE (avoid 10400 HMAC iterations on every render)
// ============================================================

const safetyNumberCache = new Map<string, { number: string; ourKeyHash: string; theirKeyHash: string }>();

function cacheKey(id1: string, id2: string): string {
  return id1 < id2 ? `${id1}:${id2}` : `${id2}:${id1}`;
}

function quickHash(key: Uint8Array): string {
  // Fast hash for cache invalidation — NOT for security
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) - h + key[i]) | 0;
  }
  return String(h);
}

/** Invalidate cached safety number when an identity key changes. */
export function invalidateSafetyNumberCache(userId: string): void {
  for (const [key] of safetyNumberCache) {
    if (key.includes(userId)) {
      safetyNumberCache.delete(key);
    }
  }
}

// ============================================================
// CONSTANTS
// ============================================================

/** Version bytes — Signal spec uses uint16 big-endian 0 = \x00\x00 */
const VERSION = new Uint8Array([0x00, 0x00]);

/** Number of HMAC iterations per fingerprint (matches Signal's NumericFingerprint) */
const ITERATIONS = 5200;

// ============================================================
// SAFETY NUMBER COMPUTATION
// ============================================================

/**
 * Compute the safety number for a conversation between two users.
 *
 * Uses locally stored identity keys (TOFU store) — NOT fetched from server.
 * Returns a 60-digit string (12 groups of 5 digits).
 *
 * @param ourUserId - Our user ID
 * @param theirUserId - The other user's ID
 * @returns 60-digit safety number string, or null if keys not available
 */
export async function computeSafetyNumber(
  ourUserId: string,
  theirUserId: string,
): Promise<string | null> {
  // Load OUR identity key from SecureStore
  const ourKeyPair = await loadIdentityKeyPair();
  if (!ourKeyPair) return null;

  // Load THEIR identity key from TOFU store (MMKV)
  const theirKey = await loadKnownIdentityKey(theirUserId);
  if (!theirKey) return null;

  // Check cache — 10400 HMAC iterations is ~100-500ms on slow phones
  const ck = cacheKey(ourUserId, theirUserId);
  const ourHash = quickHash(ourKeyPair.publicKey);
  const theirHash = quickHash(theirKey);
  const cached = safetyNumberCache.get(ck);
  if (cached && cached.ourKeyHash === ourHash && cached.theirKeyHash === theirHash) {
    return cached.number;
  }

  const result = computeSafetyNumberFromKeys(
    ourKeyPair.publicKey,
    ourUserId,
    theirKey,
    theirUserId,
  );

  // Cache the result
  safetyNumberCache.set(ck, { number: result, ourKeyHash: ourHash, theirKeyHash: theirHash });

  return result;
}

/**
 * Compute safety number from raw keys (for testing and cross-validation).
 *
 * Sorted by userId for deterministic ordering:
 * computeSafetyNumberFromKeys(A, "alice", B, "bob") ===
 * computeSafetyNumberFromKeys(B, "bob", A, "alice")
 */
export function computeSafetyNumberFromKeys(
  key1: Uint8Array,
  id1: string,
  key2: Uint8Array,
  id2: string,
): string {
  // Sort by userId — ensures both parties compute the same number.
  // If userIds are equal (edge case), sort by key bytes for determinism.
  let sortedKey1 = key1;
  let sortedId1 = id1;
  let sortedKey2 = key2;
  let sortedId2 = id2;

  let shouldSwap = false;
  if (id1 > id2) {
    shouldSwap = true;
  } else if (id1 === id2) {
    // Same userId — sort by key bytes (compare lexicographically)
    for (let i = 0; i < Math.min(key1.length, key2.length); i++) {
      if (key1[i] > key2[i]) { shouldSwap = true; break; }
      if (key1[i] < key2[i]) { break; }
    }
  }

  if (shouldSwap) {
    sortedKey1 = key2;
    sortedId1 = id2;
    sortedKey2 = key1;
    sortedId2 = id1;
  }

  const fp1 = computeFingerprint(sortedKey1, sortedId1);
  const fp2 = computeFingerprint(sortedKey2, sortedId2);

  // Take 30 bytes from each fingerprint → 30 digits each → 60 total
  return bytesToDigits(fp1.slice(0, 30)) + bytesToDigits(fp2.slice(0, 30));
}

/**
 * Compute a single fingerprint for one (identityKey, userId) pair.
 *
 * HMAC-SHA256 iterated 5200 times:
 * hash_0 = HMAC(identityKey, VERSION || identityKey || userIdBytes)
 * hash_i = HMAC(identityKey, hash_{i-1} || identityKey)  for i = 1..5199
 *
 * The identity key is used as both the HMAC key and part of the data.
 * 5200 iterations makes brute-force enumeration of the 60-digit space expensive.
 */
function computeFingerprint(identityKey: Uint8Array, userId: string): Uint8Array {
  const userIdBytes = utf8Encode(userId);
  const initialData = concat(VERSION, identityKey, userIdBytes);

  let hash = hmacSha256(identityKey, initialData);

  for (let i = 0; i < ITERATIONS - 1; i++) {
    hash = hmacSha256(identityKey, concat(hash, identityKey));
  }

  return hash; // 32 bytes
}

/**
 * Convert 30 bytes to 30 digits (6 groups of 5 digits each).
 *
 * Each 5-byte chunk is interpreted as a big-endian unsigned integer,
 * then reduced mod 100000 to produce a 5-digit group.
 *
 * 6 groups × 5 digits = 30 digits per fingerprint.
 * Two fingerprints = 60 digits total.
 */
function bytesToDigits(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < 30; i += 5) {
    // 5 bytes → 40-bit big-endian number
    const n =
      bytes[i] * 0x100000000 +
      bytes[i + 1] * 0x1000000 +
      bytes[i + 2] * 0x10000 +
      bytes[i + 3] * 0x100 +
      bytes[i + 4];
    // Mod 100000 → 5-digit group (zero-padded)
    result += String(n % 100000).padStart(5, '0');
  }
  return result;
}

/**
 * Format a 60-digit safety number for display.
 * Groups into 12 blocks of 5 digits separated by spaces.
 *
 * Example: "12345 67890 12345 67890 12345 67890 12345 67890 12345 67890 12345 67890"
 */
export function formatSafetyNumber(safetyNumber: string): string {
  const groups: string[] = [];
  for (let i = 0; i < safetyNumber.length; i += 5) {
    groups.push(safetyNumber.slice(i, i + 5));
  }
  return groups.join(' ');
}
