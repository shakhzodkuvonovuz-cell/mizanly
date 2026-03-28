/**
 * X3DH (Extended Triple Diffie-Hellman) key agreement.
 *
 * Specification: https://signal.org/docs/specifications/x3dh/
 *
 * X3DH establishes a shared secret between two parties who may not be
 * online simultaneously. The initiator fetches the responder's pre-key
 * bundle from the server and computes 3-4 DH operations to derive a
 * shared secret. This secret becomes the initial root key for the
 * Double Ratchet.
 *
 * Our implementation uses XChaCha20-Poly1305 instead of Signal's AES-CBC.
 * The key derivation (this file) is IDENTICAL to Signal's spec.
 * Only the final encryption step (in double-ratchet.ts) differs.
 *
 * CRITICAL: Ed25519 identity keys are converted to X25519 for DH operations
 * via the birational map (toMontgomery/toMontgomerySecret). This is the
 * same approach used by Signal's libsignal.
 */

import {
  generateX25519KeyPair,
  x25519DH,
  ed25519Verify,
  edToMontgomeryPub,
  edToMontgomeryPriv,
  hkdfDeriveSecrets,
  concat,
  zeroOut,
} from './crypto';
import { isPQXDHAvailable, pqEncapsulate, deriveHybridSecret } from './pqxdh';
import {
  loadIdentityKeyPair,
  loadSignedPreKeyPrivate,
  loadOneTimePreKeyPrivate,
  storeKnownIdentityKey,
  verifyIdentityKey,
} from './storage';
import type {
  Ed25519KeyPair,
  X25519KeyPair,
  PreKeyBundle,
  SessionState,
  ChainState,
} from './types';

// ============================================================
// CONSTANTS
// ============================================================

/**
 * HKDF info string for X3DH shared secret derivation.
 * Must match the Go server if server ever needs to verify (it doesn't).
 * Domain separation: prevents cross-protocol key reuse.
 */
const X3DH_INFO = 'MizanlySignal';

/**
 * 32 bytes of 0xFF prepended to DH output per X3DH spec.
 * Prevents a hypothetical "zero shared secret" from being valid.
 */
const PADDING = new Uint8Array(32).fill(0xff);

/**
 * 32 bytes of zeros used as HKDF salt per X3DH spec.
 * "If using HKDF with SHA-256, the salt should be 32 zero bytes."
 */
const ZERO_SALT = new Uint8Array(32);

/**
 * Verify a DH shared secret is not all-zeros.
 * A malicious party providing the identity point (all zeros) as a public key
 * causes DH to produce a predictable all-zero output, completely breaking secrecy.
 * Both initiator AND responder must check every DH output.
 */
function assertNonZeroDH(dh: Uint8Array, label: string): void {
  if (dh.every((b) => b === 0)) {
    throw new Error(`X3DH ${label} produced all-zero shared secret. Keys may be malicious.`);
  }
}

// ============================================================
// INITIATOR (Alice → Bob)
// ============================================================

/**
 * Result of X3DH initiator computation.
 * Contains everything needed to create a Double Ratchet session
 * and send the first PreKeySignalMessage.
 */
export interface X3DHInitResult {
  /** 32-byte shared secret — becomes the initial root key for Double Ratchet */
  sharedSecret: Uint8Array;
  /** Ephemeral X25519 key pair generated for this handshake */
  ephemeralKeyPair: X25519KeyPair;
  /** Our identity key pair (Ed25519) */
  identityKeyPair: Ed25519KeyPair;
  /** Bob's identity key (for session metadata) */
  remoteIdentityKey: Uint8Array;
  /** Bob's registration ID */
  remoteRegistrationId: number;
  /** Bob's signed pre-key public key — needed for initiator's first KDF_RK step */
  remoteSignedPreKey: Uint8Array;
  /** ID of the signed pre-key we used */
  signedPreKeyId: number;
  /** ID of the one-time pre-key we used (undefined if none available) */
  oneTimePreKeyId?: number;
  /** Whether Bob's identity key was seen for the first time ('new') or changed ('changed') */
  identityTrust: 'trusted' | 'new' | 'changed';
  /** ML-KEM ciphertext (C10: PQXDH only, undefined for classical X3DH) */
  pqCiphertext?: Uint8Array;
}

/**
 * Perform X3DH as the initiator (Alice).
 *
 * Steps:
 * 1. Verify Bob's signed pre-key signature (Ed25519)
 * 2. Generate ephemeral X25519 key pair
 * 3. Convert identity keys: Ed25519 → X25519 via birational map
 * 4. Compute 3 or 4 DH operations:
 *    DH1 = DH(IK_A_x25519, SPK_B)     — proves Alice owns her identity key
 *    DH2 = DH(EK_A, IK_B_x25519)      — proves Bob owns his identity key
 *    DH3 = DH(EK_A, SPK_B)            — freshness from signed pre-key
 *    DH4 = DH(EK_A, OPK_B)            — forward secrecy (optional, if OTP available)
 * 5. Derive shared secret: HKDF(0xFF*32 || DH1 || DH2 || DH3 [|| DH4], zeros, info, 32)
 *
 * @param bundle - Bob's pre-key bundle fetched from the Go E2E server
 * @param remoteUserId - Bob's user ID (for TOFU identity key tracking)
 */
export async function initiateX3DH(
  bundle: PreKeyBundle,
  remoteUserId: string,
): Promise<X3DHInitResult> {
  // Load our identity key pair
  const identityKeyPair = await loadIdentityKeyPair();
  if (!identityKeyPair) {
    throw new Error('Identity key not initialized. Call initialize() first.');
  }

  // --- Step 1: Verify signed pre-key signature ---
  // The server also verifies this, but we must verify independently
  // (defense against malicious server substituting the signed pre-key)
  const spkValid = ed25519Verify(
    bundle.identityKey,
    bundle.signedPreKey.publicKey,
    bundle.signedPreKey.signature,
  );
  if (!spkValid) {
    throw new Error(
      'Signed pre-key signature verification failed. ' +
      'The bundle may have been tampered with.',
    );
  }

  // --- Step 1b: TOFU identity key check ---
  const identityTrust = await verifyIdentityKey(remoteUserId, bundle.identityKey);
  // Store/update the known identity key regardless of trust status
  await storeKnownIdentityKey(remoteUserId, bundle.identityKey);

  // --- Step 2: Generate ephemeral key pair ---
  const ephemeralKeyPair = generateX25519KeyPair();

  // --- Step 3: Convert Ed25519 identity keys to X25519 ---
  const ourIdentityX25519Private = edToMontgomeryPriv(identityKeyPair.privateKey);
  const theirIdentityX25519Public = edToMontgomeryPub(bundle.identityKey);

  // --- Step 4: Compute DH operations ---

  // DH1: our identity (converted) × their signed pre-key
  const dh1 = x25519DH(ourIdentityX25519Private, bundle.signedPreKey.publicKey);
  assertNonZeroDH(dh1, 'DH1');

  // DH2: our ephemeral × their identity (converted)
  const dh2 = x25519DH(ephemeralKeyPair.privateKey, theirIdentityX25519Public);
  assertNonZeroDH(dh2, 'DH2');

  // DH3: our ephemeral × their signed pre-key
  const dh3 = x25519DH(ephemeralKeyPair.privateKey, bundle.signedPreKey.publicKey);
  assertNonZeroDH(dh3, 'DH3');

  // DH4: our ephemeral × their one-time pre-key (optional — 3-DH fallback if no OTP)
  let dhConcat: Uint8Array;
  if (bundle.oneTimePreKey) {
    const dh4 = x25519DH(ephemeralKeyPair.privateKey, bundle.oneTimePreKey.publicKey);
    assertNonZeroDH(dh4, 'DH4');
    dhConcat = concat(PADDING, dh1, dh2, dh3, dh4);
    zeroOut(dh4);
  } else {
    dhConcat = concat(PADDING, dh1, dh2, dh3);
  }

  // --- Step 5: Derive shared secret via HKDF ---
  let sharedSecret = hkdfDeriveSecrets(dhConcat, ZERO_SALT, X3DH_INFO, 32);

  // --- Step 5b (C10): PQXDH hybrid — if ML-KEM available + bundle has PQ pre-key ---
  // Combine classical X3DH secret with ML-KEM shared secret for quantum resistance.
  // If ML-KEM isn't available, the classical secret is used as-is (protocol v1).
  let pqCiphertext: Uint8Array | undefined;
  if (isPQXDHAvailable() && (bundle as any).pqPreKey) {
    try {
      const pqPubKey = typeof (bundle as any).pqPreKey === 'string'
        ? new Uint8Array(Buffer.from((bundle as any).pqPreKey, 'base64'))
        : (bundle as any).pqPreKey;
      const pqResult = pqEncapsulate(pqPubKey);
      if (pqResult) {
        const classicalSecret = sharedSecret;
        sharedSecret = deriveHybridSecret(classicalSecret, pqResult.sharedSecret);
        pqCiphertext = pqResult.ciphertext;
        zeroOut(classicalSecret);
        zeroOut(pqResult.sharedSecret);
      }
    } catch {
      // PQ encapsulation failed — continue with classical secret only
    }
  }

  // Clean up intermediate DH outputs
  zeroOut(dh1);
  zeroOut(dh2);
  zeroOut(dh3);
  zeroOut(dhConcat);
  zeroOut(ourIdentityX25519Private);

  return {
    sharedSecret,
    ephemeralKeyPair,
    identityKeyPair,
    remoteIdentityKey: bundle.identityKey,
    remoteSignedPreKey: bundle.signedPreKey.publicKey,
    remoteRegistrationId: bundle.registrationId,
    signedPreKeyId: bundle.signedPreKey.keyId,
    oneTimePreKeyId: bundle.oneTimePreKey?.keyId,
    identityTrust,
    pqCiphertext, // Included in PreKeySignalMessage when PQXDH is used
  };
}

// ============================================================
// RESPONDER (Bob receives Alice's first message)
// ============================================================

/**
 * Result of X3DH responder computation.
 */
export interface X3DHResponseResult {
  /** 32-byte shared secret — must match initiator's */
  sharedSecret: Uint8Array;
  /** Alice's identity key (for session metadata) */
  remoteIdentityKey: Uint8Array;
  /** Our signed pre-key private — needed for responder's initial KDF_RK step */
  signedPreKeyPrivate: Uint8Array;
  /** Whether Alice's identity key was seen for the first time or changed */
  identityTrust: 'trusted' | 'new' | 'changed';
}

/**
 * Perform X3DH as the responder (Bob).
 *
 * Called when receiving a PreKeySignalMessage from Alice.
 * Mirrors the initiator's computation using Bob's private keys.
 *
 * DH1 = DH(SPK_B_private, IK_A_x25519)
 * DH2 = DH(IK_B_x25519_private, EK_A)
 * DH3 = DH(SPK_B_private, EK_A)
 * DH4 = DH(OPK_B_private, EK_A)  (if OTP was used)
 *
 * @param senderIdentityKey - Alice's Ed25519 public identity key
 * @param senderEphemeralKey - Alice's X25519 ephemeral public key
 * @param signedPreKeyId - ID of our signed pre-key that Alice used
 * @param oneTimePreKeyId - ID of our OTP that Alice used (undefined if none)
 * @param senderUserId - Alice's user ID (for TOFU tracking)
 */
export async function respondX3DH(
  senderIdentityKey: Uint8Array,
  senderEphemeralKey: Uint8Array,
  signedPreKeyId: number,
  oneTimePreKeyId: number | undefined,
  senderUserId: string,
): Promise<X3DHResponseResult> {
  // Load our identity key pair
  const identityKeyPair = await loadIdentityKeyPair();
  if (!identityKeyPair) {
    throw new Error('Identity key not initialized.');
  }

  // TOFU check on sender's identity key
  const identityTrust = await verifyIdentityKey(senderUserId, senderIdentityKey);
  await storeKnownIdentityKey(senderUserId, senderIdentityKey);

  // Load our signed pre-key private
  const spkPrivate = await loadSignedPreKeyPrivate(signedPreKeyId);
  if (!spkPrivate) {
    throw new Error(
      `Signed pre-key ${signedPreKeyId} not found. ` +
      'It may have been rotated and the retention period (30 days) has passed.',
    );
  }

  // Convert identity keys to X25519
  const ourIdentityX25519Private = edToMontgomeryPriv(identityKeyPair.privateKey);
  const theirIdentityX25519Public = edToMontgomeryPub(senderIdentityKey);

  // DH1: our signed pre-key × their identity (converted)
  const dh1 = x25519DH(spkPrivate, theirIdentityX25519Public);
  assertNonZeroDH(dh1, 'responder-DH1');

  // DH2: our identity (converted) × their ephemeral
  const dh2 = x25519DH(ourIdentityX25519Private, senderEphemeralKey);
  assertNonZeroDH(dh2, 'responder-DH2');

  // DH3: our signed pre-key × their ephemeral
  const dh3 = x25519DH(spkPrivate, senderEphemeralKey);
  assertNonZeroDH(dh3, 'responder-DH3');

  // DH4: our one-time pre-key × their ephemeral (if OTP was used)
  let dhConcat: Uint8Array;
  if (oneTimePreKeyId !== undefined) {
    const otpPrivate = await loadOneTimePreKeyPrivate(oneTimePreKeyId);
    if (!otpPrivate) {
      throw new Error(
        `One-time pre-key ${oneTimePreKeyId} not found. ` +
        'Session establishment may have been interrupted.',
      );
    }
    const dh4 = x25519DH(otpPrivate, senderEphemeralKey);
    assertNonZeroDH(dh4, 'responder-DH4');
    dhConcat = concat(PADDING, dh1, dh2, dh3, dh4);
    zeroOut(dh4);
    // NOTE: Do NOT delete OTP private key here.
    // It's deleted only after sessionEstablished = true (in session.ts).
    // This survives crashes between X3DH and session persist.
  } else {
    dhConcat = concat(PADDING, dh1, dh2, dh3);
  }

  // Derive shared secret — must produce the same 32 bytes as the initiator
  const sharedSecret = hkdfDeriveSecrets(dhConcat, ZERO_SALT, X3DH_INFO, 32);

  // Clean up
  zeroOut(dh1);
  zeroOut(dh2);
  zeroOut(dh3);
  zeroOut(dhConcat);
  zeroOut(ourIdentityX25519Private);

  return {
    sharedSecret,
    remoteIdentityKey: senderIdentityKey,
    signedPreKeyPrivate: spkPrivate,
    identityTrust,
  };
}

// ============================================================
// SESSION STATE INITIALIZATION
// ============================================================

/**
 * Create the initial Double Ratchet session state from X3DH output.
 *
 * Called by the INITIATOR after X3DH completes.
 * The initiator performs the first DH ratchet step immediately.
 *
 * @param x3dhResult - Output from initiateX3DH()
 * @param localRegistrationId - Our registration ID
 */
export function createInitiatorSessionState(
  x3dhResult: X3DHInitResult,
  localRegistrationId: number,
): SessionState {
  // Per Signal spec: after X3DH, the initiator MUST perform an initial
  // KDF_RK step using DH(ephemeralKey, signedPreKey) to derive the
  // first sending chain key. WITHOUT this step, the sending chain key
  // would be all zeros — a catastrophic nonce reuse vulnerability.
  //
  // The initiator's ratchet key pair is the ephemeral key from X3DH.
  // The receiver ratchet key is Bob's signed pre-key.

  // Perform initial KDF_RK: derive sending chain key from shared secret + DH
  const dhOutput = x25519DH(
    x3dhResult.ephemeralKeyPair.privateKey,
    x3dhResult.remoteSignedPreKey,
  );
  const derived = hkdfDeriveSecrets(
    dhOutput,
    x3dhResult.sharedSecret, // X3DH shared secret as HKDF salt
    'MizanlyRatchet',
    64, // 32 bytes root key + 32 bytes chain key
  );
  zeroOut(dhOutput);

  const rootKey = derived.slice(0, 32);
  const sendingChainKey = derived.slice(32, 64);

  return {
    version: 1,
    protocolVersion: 1,
    rootKey,
    sendingChain: {
      chainKey: sendingChainKey,
      counter: 0,
    },
    receivingChain: null, // No receiving chain until Bob replies
    senderRatchetKeyPair: x3dhResult.ephemeralKeyPair,
    receiverRatchetKey: x3dhResult.remoteSignedPreKey, // Bob's SPK — needed for DH ratchet
    skippedKeys: [],
    previousSendingCounter: 0,
    remoteIdentityKey: x3dhResult.remoteIdentityKey,
    localRegistrationId,
    remoteRegistrationId: x3dhResult.remoteRegistrationId,
    sessionEstablished: false,
    identityTrust: x3dhResult.identityTrust,
    sealedSender: false,
  };
}

/**
 * Create the initial Double Ratchet session state from X3DH output.
 *
 * Called by the RESPONDER after X3DH completes.
 * The responder needs the initiator's ephemeral key as the first
 * receiver ratchet key to perform the DH ratchet step.
 *
 * @param x3dhResult - Output from respondX3DH()
 * @param senderEphemeralKey - Alice's ephemeral public key (from PreKeySignalMessage)
 * @param localRegistrationId - Our registration ID
 * @param remoteRegistrationId - Alice's registration ID (from PreKeySignalMessage)
 */
export function createResponderSessionState(
  x3dhResult: X3DHResponseResult,
  senderEphemeralKey: Uint8Array,
  signedPreKeyPrivate: Uint8Array,
  localRegistrationId: number,
  remoteRegistrationId: number,
): SessionState {
  // Per Signal spec: the responder mirrors the initiator's initial KDF_RK step,
  // then performs a SECOND KDF_RK step with a new ratchet key pair.
  //
  // Step 1: Derive receiving chain (mirrors initiator's sending chain)
  // KDF_RK(sharedSecret, DH(SPK_B, EK_A)) — same DH as initiator's initial step
  const dhReceive = x25519DH(signedPreKeyPrivate, senderEphemeralKey);
  const derivedReceive = hkdfDeriveSecrets(
    dhReceive,
    x3dhResult.sharedSecret,
    'MizanlyRatchet',
    64,
  );
  zeroOut(dhReceive);

  const rootKeyAfterReceive = derivedReceive.slice(0, 32);
  const receivingChainKey = derivedReceive.slice(32, 64);

  // Step 2: Generate new ratchet key pair and derive sending chain
  // KDF_RK(rootKey1, DH(newKeyPair, EK_A))
  const senderRatchetKeyPair = generateX25519KeyPair();
  const dhSend = x25519DH(senderRatchetKeyPair.privateKey, senderEphemeralKey);
  const derivedSend = hkdfDeriveSecrets(
    dhSend,
    rootKeyAfterReceive,
    'MizanlyRatchet',
    64,
  );
  zeroOut(dhSend);

  const rootKey = derivedSend.slice(0, 32);
  const sendingChainKey = derivedSend.slice(32, 64);

  return {
    version: 1,
    protocolVersion: 1,
    rootKey,
    sendingChain: {
      chainKey: sendingChainKey,
      counter: 0,
    },
    receivingChain: {
      chainKey: receivingChainKey, // Properly derived — matches initiator's sending chain
      counter: 0,
    },
    senderRatchetKeyPair,
    receiverRatchetKey: senderEphemeralKey,
    skippedKeys: [],
    previousSendingCounter: 0,
    remoteIdentityKey: x3dhResult.remoteIdentityKey,
    localRegistrationId,
    remoteRegistrationId,
    sessionEstablished: false,
    identityTrust: x3dhResult.identityTrust,
    sealedSender: false,
  };
}
