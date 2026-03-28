/**
 * PQXDH — Post-Quantum Extended Diffie-Hellman (C10).
 *
 * Hybrid key agreement: X25519 (classical) + ML-KEM-768 (post-quantum).
 * If a quantum computer breaks X25519, ML-KEM still protects the shared secret.
 * If ML-KEM is broken by a classical attack, X25519 still protects.
 *
 * Signal deployed PQXDH in September 2023. We follow the same spec:
 * https://signal.org/docs/specifications/pqxdh/
 *
 * ARCHITECTURE:
 * - The PQXDH layer wraps the existing X3DH (x3dh.ts)
 * - ML-KEM-768 primitives are provided via a pluggable interface
 * - When @noble/post-quantum is installed, it auto-detects and uses it
 * - Until then, PQXDH negotiation falls back to classical X3DH (protocol v1)
 *
 * The hybrid shared secret is:
 *   HKDF(X3DH_shared_secret || ML-KEM_shared_secret, salt, "MizanlyPQXDH", 32)
 *
 * This ensures the shared secret is at least as strong as the stronger of the two.
 */

import {
  hkdfDeriveSecrets,
  concat,
  generateRandomBytes,
  toBase64,
  fromBase64,
  zeroOut,
} from './crypto';

// ============================================================
// ML-KEM INTERFACE (pluggable — swapped in when package available)
// ============================================================

/** ML-KEM-768 key pair */
export interface MLKEMKeyPair {
  publicKey: Uint8Array;  // 1184 bytes for ML-KEM-768
  secretKey: Uint8Array;  // 2400 bytes for ML-KEM-768
}

/** ML-KEM encapsulation result */
export interface MLKEMEncapsulation {
  ciphertext: Uint8Array; // 1088 bytes for ML-KEM-768
  sharedSecret: Uint8Array; // 32 bytes
}

/** ML-KEM primitive interface */
export interface MLKEMProvider {
  /** Generate a new ML-KEM-768 key pair */
  keygen(): MLKEMKeyPair;
  /** Encapsulate: produce ciphertext + shared secret from a public key */
  encapsulate(publicKey: Uint8Array): MLKEMEncapsulation;
  /** Decapsulate: recover shared secret from ciphertext using secret key */
  decapsulate(ciphertext: Uint8Array, secretKey: Uint8Array): Uint8Array;
}

// ============================================================
// AUTO-DETECTION: try to load @noble/post-quantum
// ============================================================

let mlkemProvider: MLKEMProvider | null = null;
let mlkemDetected = false;

/**
 * Attempt to auto-detect and load ML-KEM-768 from @noble/post-quantum.
 * Called once on module load. If the package isn't installed, PQXDH
 * gracefully degrades to classical X3DH.
 */
async function detectMLKEM(): Promise<void> {
  if (mlkemDetected) return;
  mlkemDetected = true;
  try {
    // Dynamic import — won't crash if package doesn't exist
    const pq = await import('@noble/post-quantum/ml-kem' as string);
    if (pq?.ml_kem768) {
      mlkemProvider = {
        keygen: () => {
          const { publicKey, secretKey } = pq.ml_kem768.keygen();
          return { publicKey, secretKey };
        },
        encapsulate: (pk: Uint8Array) => {
          const { cipherText, sharedSecret } = pq.ml_kem768.encapsulate(pk);
          return { ciphertext: cipherText, sharedSecret };
        },
        decapsulate: (ct: Uint8Array, sk: Uint8Array) => {
          return pq.ml_kem768.decapsulate(ct, sk);
        },
      };
    }
  } catch {
    // @noble/post-quantum not installed — PQXDH not available
    mlkemProvider = null;
  }
}

// Kick off detection immediately
detectMLKEM();

/** Check if PQXDH is available (ML-KEM package installed) */
export function isPQXDHAvailable(): boolean {
  return mlkemProvider !== null;
}

/** Manually set an ML-KEM provider (for testing or alternative implementations) */
export function setMLKEMProvider(provider: MLKEMProvider | null): void {
  mlkemProvider = provider;
  mlkemDetected = true;
}

// ============================================================
// PQXDH PRE-KEY BUNDLE EXTENSION
// ============================================================

/** Additional fields in a PQXDH pre-key bundle (extends classical bundle) */
export interface PQPreKeyFields {
  /** ML-KEM-768 public key (1184 bytes, base64) */
  pqPreKey: string;
  /** Signature of pqPreKey by the identity key */
  pqPreKeySignature: string;
  /** Key ID for the PQ pre-key */
  pqPreKeyId: number;
}

// ============================================================
// PQXDH KEY GENERATION
// ============================================================

/**
 * Generate a post-quantum pre-key pair for PQXDH.
 * The public key is uploaded to the server alongside the classical bundle.
 * The secret key is stored locally in SecureStore.
 *
 * @returns ML-KEM key pair, or null if ML-KEM is not available
 */
export function generatePQPreKey(): MLKEMKeyPair | null {
  if (!mlkemProvider) return null;
  return mlkemProvider.keygen();
}

// ============================================================
// PQXDH SHARED SECRET DERIVATION
// ============================================================

const PQXDH_INFO = 'MizanlyPQXDH';

/**
 * Combine a classical X3DH shared secret with an ML-KEM shared secret.
 *
 * The hybrid construction ensures:
 * - If X25519 is broken (quantum), ML-KEM still protects
 * - If ML-KEM is broken (classical), X25519 still protects
 * - Both must be broken simultaneously to compromise the shared secret
 *
 * @param classicalSecret - 32-byte X3DH shared secret
 * @param pqSecret - 32-byte ML-KEM shared secret
 * @returns 32-byte hybrid shared secret
 */
export function deriveHybridSecret(
  classicalSecret: Uint8Array,
  pqSecret: Uint8Array,
): Uint8Array {
  const combined = concat(classicalSecret, pqSecret);
  const hybrid = hkdfDeriveSecrets(combined, new Uint8Array(32), PQXDH_INFO, 32);
  zeroOut(combined);
  return hybrid;
}

/**
 * PQXDH initiator: encapsulate with recipient's PQ pre-key.
 *
 * Called during X3DH initiation when the bundle includes PQ fields.
 * Produces: ML-KEM ciphertext (sent to recipient) + shared secret (kept local).
 *
 * @param pqPublicKey - Recipient's ML-KEM-768 public key
 * @returns { ciphertext, sharedSecret } or null if ML-KEM unavailable
 */
export function pqEncapsulate(
  pqPublicKey: Uint8Array,
): MLKEMEncapsulation | null {
  if (!mlkemProvider) return null;
  return mlkemProvider.encapsulate(pqPublicKey);
}

/**
 * PQXDH responder: decapsulate from initiator's ML-KEM ciphertext.
 *
 * Called during X3DH response when the PreKeySignalMessage includes PQ fields.
 * Recovers the same shared secret the initiator derived.
 *
 * @param ciphertext - ML-KEM ciphertext from the initiator
 * @param secretKey - Our ML-KEM secret key
 * @returns 32-byte shared secret, or null if ML-KEM unavailable
 */
export function pqDecapsulate(
  ciphertext: Uint8Array,
  secretKey: Uint8Array,
): Uint8Array | null {
  if (!mlkemProvider) return null;
  return mlkemProvider.decapsulate(ciphertext, secretKey);
}

/**
 * Determine the protocol version to use based on both parties' capabilities.
 *
 * @param localPQAvailable - Whether we have ML-KEM support
 * @param remoteSupportedVersions - Versions the remote party supports
 * @returns 2 if both support PQXDH, 1 if classical only
 */
export function negotiatePQVersion(
  localPQAvailable: boolean,
  remoteSupportedVersions: number[],
): number {
  if (localPQAvailable && remoteSupportedVersions.includes(2)) return 2;
  return 1;
}
