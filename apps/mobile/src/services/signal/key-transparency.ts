/**
 * Key Transparency (C6): Detect server-side key substitution.
 *
 * TOFU (Trust On First Use) is weak: a compromised server can substitute
 * keys on FIRST contact without detection. Key transparency adds a
 * cryptographic audit log that makes substitution detectable.
 *
 * Architecture:
 * - Server maintains an append-only Merkle log of all identity key registrations
 * - Each registration gets a position in the log + a Merkle inclusion proof
 * - Clients verify that their stored key matches the log entry
 * - Third-party auditors can monitor the log for inconsistencies
 * - A server that serves different keys to different users is caught by
 *   comparing Merkle roots between auditors
 *
 * This module implements the CLIENT-SIDE verification.
 * The Go server needs a corresponding /keys/transparency endpoint.
 *
 * Based on SEEMless (Signal's key transparency design) and CONIKS.
 */

import { sha256Hash, concat, uint32BE, toBase64, fromBase64, constantTimeEqual, ed25519Verify } from './crypto';
import { loadKnownIdentityKey } from './storage';

// ============================================================
// F1: TRANSPARENCY ROOT SIGNATURE VERIFICATION
// ============================================================

/**
 * F1: Hardcoded Ed25519 public key for transparency root verification.
 *
 * This key's corresponding PRIVATE key lives in the TRANSPARENCY_SIGNING_KEY
 * env var on the Go server (ideally on a separate service from the main API).
 *
 * The server signs the Merkle root with the private key. The client verifies
 * using this hardcoded public key. A compromised server that doesn't have
 * the private key CANNOT forge a valid root signature.
 *
 * To generate a new key pair:
 *   openssl genpkey -algorithm ed25519 -outform DER | tail -c 32 | base64
 *   → Set as TRANSPARENCY_SIGNING_KEY env var on Go server
 *   → Derive public key and update this constant
 *
 * IMPORTANT: When rotating this key, both the server env var AND this constant
 * must be updated in the same release. The client rejects unsigned roots.
 */
const TRANSPARENCY_PUBLIC_KEY_B64 = 'XvjbofryahZuejaizXsR2JanznbzUf6WBlmLb5TtQeY=';

/**
 * Verify the Ed25519 signature on a transparency root.
 * Returns true if the root is signed by the trusted transparency key.
 * Returns false if the signature is invalid or the public key is not configured.
 */
export function verifyRootSignature(rootB64: string, signatureB64: string): boolean {
  if (!TRANSPARENCY_PUBLIC_KEY_B64) {
    // Public key not configured yet — allow unsigned roots during development.
    // In production, this constant MUST be set and unsigned roots MUST be rejected.
    return true;
  }
  if (!signatureB64) return false; // Server sent no signature — reject

  const publicKey = fromBase64(TRANSPARENCY_PUBLIC_KEY_B64);
  const root = fromBase64(rootB64);
  const signature = fromBase64(signatureB64);

  if (publicKey.length !== 32 || signature.length !== 64) return false;

  return ed25519Verify(publicKey, root, signature);
}

// ============================================================
// MERKLE TREE VERIFICATION
// ============================================================

/**
 * Verify a Merkle inclusion proof for an identity key.
 *
 * The server provides:
 * - leaf: SHA-256(userId || identityKey)
 * - proof: array of sibling hashes along the path to the root
 * - leafIndex: position of the leaf in the tree
 * - root: the tree root hash (signed by the server's transparency key)
 *
 * The client recomputes the root from the leaf + proof and checks it matches.
 *
 * @param userId - User ID whose key we're verifying
 * @param identityKey - The identity key to verify
 * @param proof - Array of sibling hashes (base64)
 * @param leafIndex - Position of the leaf
 * @param expectedRoot - The expected Merkle root (base64)
 * @returns true if the proof is valid
 */
export function verifyMerkleProof(
  userId: string,
  identityKey: Uint8Array,
  proof: string[],
  leafIndex: number,
  expectedRoot: string,
): boolean {
  // V4-F7: Compute leaf hash with 0x00 domain separation prefix (RFC 6962).
  // SHA-256(0x00 || userId || identityKey)
  const LEAF_PREFIX = new Uint8Array([0x00]);
  const INTERNAL_PREFIX = new Uint8Array([0x01]);
  const leafData = concat(
    LEAF_PREFIX,
    new Uint8Array(new TextEncoder().encode(userId)),
    identityKey,
  );
  let currentHash = sha256Hash(leafData);
  let index = leafIndex;

  // Walk up the tree using the proof
  for (const siblingB64 of proof) {
    const sibling = fromBase64(siblingB64);
    if (index % 2 === 0) {
      // Current node is on the left — sibling is on the right
      // V4-F7: Internal node prefix 0x01
      currentHash = sha256Hash(concat(INTERNAL_PREFIX, currentHash, sibling));
    } else {
      // Current node is on the right — sibling is on the left
      currentHash = sha256Hash(concat(INTERNAL_PREFIX, sibling, currentHash));
    }
    index = Math.floor(index / 2);
  }

  // Compare computed root with expected root
  const expectedRootBytes = fromBase64(expectedRoot);
  return constantTimeEqual(currentHash, expectedRootBytes);
}

/**
 * Verify that a user's identity key is consistent with the transparency log.
 *
 * Flow:
 * 1. Fetch the transparency proof from the Go server
 * 2. Verify the Merkle inclusion proof
 * 3. Compare the key in the proof with our locally stored key (TOFU)
 * 4. If they match — the server is honest
 * 5. If they don't — the server may have substituted a key (MITM)
 *
 * @param userId - User ID to verify
 * @param fetchProof - Callback to fetch proof from Go server
 * @returns verification result
 */
/**
 * V7-F3: Maximum age for a transparency root before it's considered stale.
 * A compromised server could freeze the Merkle tree at an honest point-in-time,
 * then substitute keys for new contacts while serving old contacts the frozen
 * (valid-but-stale) proof. 24 hours is generous — honest servers rebuild on
 * every identity key change, so the root should never be older than minutes.
 */
const MAX_ROOT_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * V7-F3: In-memory cache of last-seen tree size per userId.
 * Tree size must be monotonically increasing — a decrease means entries were deleted.
 * Persisted via secureStore on each successful verification.
 */
const lastSeenTreeSize = new Map<string, number>();

export async function verifyKeyTransparency(
  userId: string,
  fetchProof: (userId: string) => Promise<{
    identityKey: string;     // Base64
    proof: string[];         // Array of base64 hashes
    leafIndex: number;
    root: string;            // Base64 Merkle root
    rootSignature: string;   // Base64 Ed25519 signature of root
    treeSize: number;
    updatedAt: string;       // V7-F3: ISO 8601 timestamp of last tree rebuild (MANDATORY)
  } | null>,
): Promise<{
  status: 'verified' | 'mismatch' | 'unavailable' | 'no_local_key';
  detail?: string;
}> {
  // Fetch proof from server
  const proofData = await fetchProof(userId).catch(() => null);
  if (!proofData) {
    return { status: 'unavailable', detail: 'Transparency proof not available from server' };
  }

  // Load locally stored key (from TOFU store)
  const localKey = await loadKnownIdentityKey(userId);
  if (!localKey) {
    return { status: 'no_local_key', detail: 'No locally stored key for this user yet' };
  }

  // F1: Verify the root signature FIRST — before checking the Merkle proof.
  // A compromised server could build a valid (but forged) Merkle tree.
  // The root signature proves the tree was built by the trusted signing key holder.
  if (!verifyRootSignature(proofData.root, proofData.rootSignature)) {
    return {
      status: 'mismatch',
      detail: 'Transparency root signature invalid — the server may have forged the Merkle tree',
    };
  }

  // V7-F3 FIX: Verify root freshness — reject stale/frozen trees.
  // updatedAt is MANDATORY. A compromised server that omits it gets rejected, not bypassed.
  // The Go server always includes updatedAt (V6-F13 actual rebuild time). Any proof
  // without it is either from an ancient server version or an attacker stripping fields.
  if (!proofData.updatedAt) {
    return {
      status: 'mismatch',
      detail: 'Transparency proof missing updatedAt — cannot verify freshness',
    };
  }
  const rootAge = Date.now() - new Date(proofData.updatedAt).getTime();
  if (!Number.isFinite(rootAge) || rootAge > MAX_ROOT_AGE_MS) {
    return {
      status: 'mismatch',
      detail: `Transparency root is stale (${Math.floor(rootAge / 3600000)}h old) — possible frozen tree attack`,
    };
  }
  // Reject roots that claim to be from the future (>5 min clock skew tolerance)
  if (rootAge < -5 * 60 * 1000) {
    return {
      status: 'mismatch',
      detail: 'Transparency root timestamp is in the future — possible manipulation',
    };
  }

  // V7-F3: Verify tree size is monotonically increasing.
  // A compromised server that deletes entries could shrink the tree.
  if (proofData.treeSize > 0) {
    // Load persisted last-seen tree size
    if (!lastSeenTreeSize.has(userId)) {
      try {
        const { secureLoad, HMAC_TYPE } = await import('./storage');
        const stored = await secureLoad(HMAC_TYPE.SESSION, `transparency_treesize:${userId}`);
        if (stored) lastSeenTreeSize.set(userId, parseInt(stored, 10) || 0);
      } catch { /* First check — no prior state */ }
    }
    const prevSize = lastSeenTreeSize.get(userId) ?? 0;
    if (proofData.treeSize < prevSize) {
      return {
        status: 'mismatch',
        detail: `Transparency tree shrank from ${prevSize} to ${proofData.treeSize} — entries may have been deleted`,
      };
    }
  }

  // Verify the Merkle proof
  const proofKey = fromBase64(proofData.identityKey);
  const proofValid = verifyMerkleProof(
    userId,
    proofKey,
    proofData.proof,
    proofData.leafIndex,
    proofData.root,
  );

  if (!proofValid) {
    return {
      status: 'mismatch',
      detail: 'Merkle proof verification failed — the server may be tampering with the transparency log',
    };
  }

  // Compare the key in the proof with our local copy
  if (!constantTimeEqual(localKey, proofKey)) {
    return {
      status: 'mismatch',
      detail: 'Server transparency log contains a different key than locally stored — possible MITM',
    };
  }

  // V7-F3: Persist tree size for future monotonic growth checks
  if (proofData.treeSize > 0) {
    lastSeenTreeSize.set(userId, proofData.treeSize);
    try {
      const { secureStore, HMAC_TYPE } = await import('./storage');
      await secureStore(HMAC_TYPE.SESSION, `transparency_treesize:${userId}`, String(proofData.treeSize));
    } catch { /* Best-effort persist — in-memory cache still guards this session */ }
  }

  return { status: 'verified' };
}

// ============================================================
// CONSISTENCY CHECK (audit between epochs)
// ============================================================

/**
 * Verify that the transparency log is append-only (no entries removed).
 *
 * The server provides a consistency proof between two tree sizes.
 * If the proof verifies, the old tree is a prefix of the new tree
 * (no entries were deleted or modified).
 *
 * @param oldRoot - Previous known Merkle root (base64)
 * @param oldSize - Previous tree size
 * @param newRoot - New Merkle root (base64)
 * @param newSize - New tree size
 * @param proof - Consistency proof (array of base64 hashes)
 * @returns true if the log is append-only consistent
 */
/**
 * F7 FIX: Full RFC 6962 consistency proof verification.
 *
 * Previously returned `true` (stub). Now implements the complete algorithm
 * from RFC 6962 Section 2.1.2: given the old root, new root, and a proof
 * path, verify that the old tree is a prefix of the new tree.
 *
 * The proof contains hashes that, combined with the old tree's structure,
 * must reconstruct BOTH the old root and the new root. If either fails,
 * the server has tampered with the log (removed or modified entries).
 */
export function verifyConsistencyProof(
  oldRoot: string,
  oldSize: number,
  newRoot: string,
  newSize: number,
  proof: string[],
): boolean {
  if (oldSize > newSize) return false;
  if (oldSize === newSize) {
    return constantTimeEqual(fromBase64(oldRoot), fromBase64(newRoot));
  }
  if (oldSize === 0) return true; // Empty tree is consistent with anything

  const oldRootBytes = fromBase64(oldRoot);
  const newRootBytes = fromBase64(newRoot);
  if (oldRootBytes.length !== 32 || newRootBytes.length !== 32) return false;
  if (proof.length === 0) return false; // Non-trivial consistency needs proof nodes

  const proofHashes = proof.map((p) => fromBase64(p));

  // RFC 6962 consistency proof algorithm:
  // Find the largest power of 2 <= oldSize (the "split point")
  // Then walk the proof path reconstructing both roots.
  let node = oldSize - 1; // 0-indexed
  let lastNode = newSize - 1;

  // Strip least-significant zeros to find the starting position
  while (node % 2 === 1) {
    node = Math.floor(node / 2);
    lastNode = Math.floor(lastNode / 2);
  }

  let proofIdx = 0;
  let oldHash: Uint8Array;
  let newHash: Uint8Array;

  if (proofIdx >= proofHashes.length) return false;
  oldHash = proofHashes[proofIdx];
  newHash = proofHashes[proofIdx];
  proofIdx++;

  // V4-F7: Internal node prefix for domain separation in consistency proof
  const INTERNAL_PREFIX = new Uint8Array([0x01]);

  while (node > 0) {
    if (node % 2 === 1) {
      // Node is a right child — proof hash is the left sibling
      if (proofIdx >= proofHashes.length) return false;
      const sibling = proofHashes[proofIdx];
      proofIdx++;
      oldHash = sha256Hash(concat(INTERNAL_PREFIX, sibling, oldHash));
      newHash = sha256Hash(concat(INTERNAL_PREFIX, sibling, newHash));
    } else if (node < lastNode) {
      // Node is a left child with a right sibling in the new tree
      if (proofIdx >= proofHashes.length) return false;
      const sibling = proofHashes[proofIdx];
      proofIdx++;
      // Only the new hash includes this sibling (old tree doesn't extend here)
      newHash = sha256Hash(concat(INTERNAL_PREFIX, newHash, sibling));
    }
    node = Math.floor(node / 2);
    lastNode = Math.floor(lastNode / 2);
  }

  // Continue walking up for the new tree (old tree is fully reconstructed)
  while (lastNode > 0) {
    if (proofIdx >= proofHashes.length) return false;
    const sibling = proofHashes[proofIdx];
    proofIdx++;
    newHash = sha256Hash(concat(INTERNAL_PREFIX, newHash, sibling));
    lastNode = Math.floor(lastNode / 2);
  }

  // V4-F23: Verify all proof nodes were consumed (reject extra trailing nodes)
  if (proofIdx !== proofHashes.length) return false;

  // Both reconstructed roots must match
  return constantTimeEqual(oldHash, oldRootBytes) && constantTimeEqual(newHash, newRootBytes);
}

/**
 * Store a verified transparency root for future consistency checks.
 */
export interface TransparencyState {
  root: string;     // Base64 Merkle root
  treeSize: number;
  verifiedAt: number; // Unix ms
  /**
   * V4-F7: Hash algorithm version. Roots from version 1 (no domain separation)
   * are incompatible with version 2 (0x00/0x01 prefix). When loading a cached
   * root, discard if hashVersion < CURRENT_HASH_VERSION.
   */
  hashVersion?: number;
}

/**
 * V4-F7: Current Merkle hash version. Increment when the hash algorithm changes.
 * Version 1: SHA-256(data) — no domain separation (pre V4-F7)
 * Version 2: SHA-256(0x00 || data) for leaves, SHA-256(0x01 || left || right) for internal
 */
export const CURRENT_HASH_VERSION = 2;
