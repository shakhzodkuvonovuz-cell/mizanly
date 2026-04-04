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
 * CURRENT STATUS: STUB / PLANNED — NOT OPERATIONAL.
 * F04-#16: The interface definitions and wrappers are structurally correct,
 * but PQXDH cannot function because:
 * 1. @noble/post-quantum is not installed (isPQXDHAvailable() returns false)
 * 2. No PQ prekey generation/upload code exists in prekeys.ts
 * 3. Go server has no PQ support (hardcodes SupportedVersions: [1])
 * 4. API adapter drops PQ fields from server responses
 *
 * The integration points in x3dh.ts are unreachable until the full pipeline
 * (keygen → upload → server support → signature verification) is built.
 *
 * ARCHITECTURE:
 * - The PQXDH layer wraps the existing X3DH (x3dh.ts)
 * - ML-KEM-768 primitives are provided via a pluggable interface
 * - When @noble/post-quantum is installed, it auto-detects and uses it
 * - Until then, PQXDH negotiation falls back to classical X3DH (protocol v1)
 */

import {
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

try {
  const { ml_kem768 } = require('@noble/post-quantum/ml-kem');
  if (ml_kem768) {
    mlkemProvider = {
      keygen: () => {
        const result = ml_kem768.keygen();
        // F04-#14: Copy arrays and zero the originals from Noble
        const publicKey = new Uint8Array(result.publicKey);
        const secretKey = new Uint8Array(result.secretKey);
        if (result.secretKey instanceof Uint8Array) {
          result.secretKey.fill(0);
        }
        return { publicKey, secretKey };
      },
      encapsulate: (pk: Uint8Array) => {
        const result = ml_kem768.encapsulate(pk);
        const ciphertext = new Uint8Array(result.cipherText);
        const sharedSecret = new Uint8Array(result.sharedSecret);
        if (result.sharedSecret instanceof Uint8Array) {
          result.sharedSecret.fill(0);
        }
        return { ciphertext, sharedSecret };
      },
      decapsulate: (ct: Uint8Array, sk: Uint8Array) => {
        const result = ml_kem768.decapsulate(ct, sk);
        // #497 FIX: Copy the shared secret and zero Noble's original buffer.
        // Previously, Noble's internal buffer lingered on the GC heap with the
        // 32-byte shared secret exposed. The copy is returned; caller zeros it.
        const copy = new Uint8Array(result);
        if (result instanceof Uint8Array) {
          result.fill(0);
        }
        return copy;
      },
    };
    // F04-#6: Freeze provider to prevent runtime replacement via supply-chain attack
    Object.freeze(mlkemProvider);
  }
} catch {
  mlkemProvider = null;
}

/** Check if PQXDH is available (ML-KEM package installed) */
export function isPQXDHAvailable(): boolean {
  return mlkemProvider !== null;
}

/**
 * F04-#6: setMLKEMProvider restricted to __DEV__ / test environments only.
 * In production, the provider is set at module load time and frozen.
 * A supply-chain attack that calls setMLKEMProvider with a malicious provider
 * could control KEM shared secrets for all subsequent PQXDH sessions.
 */
export function setMLKEMProvider(provider: MLKEMProvider | null): void {
  if (typeof __DEV__ !== 'undefined' && !__DEV__) {
    throw new Error('setMLKEMProvider is only available in development/test');
  }
  mlkemProvider = provider;
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
// PQXDH ENCAPSULATION / DECAPSULATION
// ============================================================

/**
 * PQXDH initiator: encapsulate with recipient's PQ pre-key.
 *
 * Called during X3DH initiation when the bundle includes PQ fields.
 * Produces: ML-KEM ciphertext (sent to recipient) + shared secret (kept local).
 *
 * F04-#12: Input length validated before passing to ML-KEM.
 *
 * @param pqPublicKey - Recipient's ML-KEM-768 public key (must be 1184 bytes)
 * @returns { ciphertext, sharedSecret } or null if ML-KEM unavailable
 */
export function pqEncapsulate(
  pqPublicKey: Uint8Array,
): MLKEMEncapsulation | null {
  if (!mlkemProvider) return null;
  if (pqPublicKey.length !== 1184) {
    throw new Error(`ML-KEM-768 public key must be 1184 bytes, got ${pqPublicKey.length}`);
  }
  return mlkemProvider.encapsulate(pqPublicKey);
}

/**
 * PQXDH responder: decapsulate from initiator's ML-KEM ciphertext.
 *
 * Called during X3DH response when the PreKeySignalMessage includes PQ fields.
 * Recovers the same shared secret the initiator derived.
 *
 * F04-#3/#4 FIX: When both parties advertise v2 AND PQ ciphertext is present,
 * decapsulation failure MUST abort — not silently fall back to classical.
 * F04-#13: Ciphertext length validated before passing to ML-KEM.
 *
 * @param ciphertext - ML-KEM ciphertext from the initiator (must be 1088 bytes)
 * @param secretKey - Our ML-KEM secret key
 * @returns 32-byte shared secret, or null if ML-KEM unavailable
 */
export function pqDecapsulate(
  ciphertext: Uint8Array,
  secretKey: Uint8Array,
): Uint8Array | null {
  if (!mlkemProvider) return null;
  if (ciphertext.length !== 1088) {
    throw new Error(`ML-KEM-768 ciphertext must be 1088 bytes, got ${ciphertext.length}`);
  }
  const result = mlkemProvider.decapsulate(ciphertext, secretKey);
  // F04-#5: Zero secretKey after decapsulation (caller should also zero)
  zeroOut(secretKey);
  return result;
}

// F04-#2: deriveHybridSecret was dead code — used a different HKDF info
// string ("MizanlyPQXDH") than the actual protocol path ("MizanlySignal").
// x3dh.ts was refactored (V8-F11) to use single-pass HKDF, making this
// function unreachable and misleading. DELETED.

// F04-#10: negotiatePQVersion was dead code — never called. The actual
// version decision in initiateX3DH uses inline logic. DELETED.
