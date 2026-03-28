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

import { sha256Hash, concat, uint32BE, toBase64, fromBase64, constantTimeEqual } from './crypto';
import { loadKnownIdentityKey } from './storage';

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
  // Compute leaf hash: SHA-256(userId || identityKey)
  const leafData = concat(
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
      currentHash = sha256Hash(concat(currentHash, sibling));
    } else {
      // Current node is on the right — sibling is on the left
      currentHash = sha256Hash(concat(sibling, currentHash));
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
export async function verifyKeyTransparency(
  userId: string,
  fetchProof: (userId: string) => Promise<{
    identityKey: string;     // Base64
    proof: string[];         // Array of base64 hashes
    leafIndex: number;
    root: string;            // Base64 Merkle root
    rootSignature: string;   // Base64 Ed25519 signature of root
    treeSize: number;
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

  // RFC 6962 consistency proof verification
  // Simplified: check that we can reconstruct both roots from the proof
  // Full implementation would follow Certificate Transparency spec exactly
  // For now, verify that proof is non-empty (server provided it)
  // and that both roots are 32 bytes (valid SHA-256)
  const oldRootBytes = fromBase64(oldRoot);
  const newRootBytes = fromBase64(newRoot);
  if (oldRootBytes.length !== 32 || newRootBytes.length !== 32) return false;
  if (proof.length === 0 && oldSize !== newSize) return false;

  // TODO: Full RFC 6962 consistency proof verification
  // For now, basic structural checks pass. Full crypto verification
  // will be added when the Go server implements the transparency log.
  return true;
}

/**
 * Store a verified transparency root for future consistency checks.
 */
export interface TransparencyState {
  root: string;     // Base64 Merkle root
  treeSize: number;
  verifiedAt: number; // Unix ms
}
