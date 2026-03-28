/**
 * Session lifecycle management.
 *
 * Manages Double Ratchet sessions per (userId, deviceId) pair.
 * Handles:
 * - Session creation from X3DH (initiator and responder)
 * - Encrypt/decrypt with automatic session routing
 * - Simultaneous session initiation (both sides send first message)
 * - Multi-device message fan-out (encrypt once per device)
 * - OTP private key cleanup after session is established
 * - Session recovery from previous sessions (for in-flight stragglers)
 *
 * All operations are serialized per-session via the chained-promise mutex
 * in storage.ts. Network calls (bundle fetch) happen BEFORE acquiring the lock.
 */

import { ratchetEncrypt, ratchetDecrypt } from './double-ratchet';
import { utf8Encode, utf8Decode, generateX25519KeyPair } from './crypto';
import {
  withSessionLock,
  loadSessionRecord,
  storeSessionRecord,
  deleteSessionRecord,
  hasSession,
  deleteOneTimePreKeyPrivate,
} from './storage';
import type {
  SessionState,
  SessionRecord,
  SignalMessage,
  PreKeySignalMessage,
  PreKeyBundle,
} from './types';
import {
  initiateX3DH,
  respondX3DH,
  createInitiatorSessionState,
  createResponderSessionState,
} from './x3dh';
import { getOrCreateRegistrationId } from './prekeys';

// ============================================================
// SESSION CREATION
// ============================================================

/**
 * Create a new session as the INITIATOR (sending first message to a new contact).
 *
 * Called after fetching the recipient's pre-key bundle from the Go E2E server.
 * The bundle fetch + X3DH computation happen OUTSIDE the session lock
 * (prevents timeout deadlock on network calls).
 *
 * @param recipientId - Recipient's user ID
 * @param deviceId - Recipient's device ID (default 1)
 * @param bundle - Pre-key bundle from Go E2E server
 */
export async function createInitiatorSession(
  recipientId: string,
  deviceId: number,
  bundle: PreKeyBundle,
): Promise<{
  sessionState: SessionState;
  signedPreKeyId: number;
  oneTimePreKeyId?: number;
  identityTrust: 'trusted' | 'new' | 'changed';
}> {
  // X3DH happens outside the lock (network + crypto, no session mutation)
  const x3dhResult = await initiateX3DH(bundle, recipientId);
  const localRegId = await getOrCreateRegistrationId();
  const sessionState = createInitiatorSessionState(x3dhResult, localRegId);

  // Acquire session lock for persisting
  const sessionId = `${recipientId}:${deviceId}`;
  await withSessionLock(sessionId, async () => {
    const existing = await loadSessionRecord(recipientId, deviceId);

    if (existing) {
      // Session already exists — simultaneous initiation scenario.
      // Keep existing as active, store new as previous.
      // First successful decrypt determines which wins.
      existing.previousSessions.push(sessionState);
      // Cap previous sessions to prevent unbounded growth
      if (existing.previousSessions.length > 5) {
        existing.previousSessions.shift();
      }
      await storeSessionRecord(recipientId, deviceId, existing);
    } else {
      // No existing session — this is the active session
      await storeSessionRecord(recipientId, deviceId, {
        activeSession: sessionState,
        previousSessions: [],
      });
    }
  });

  return {
    sessionState,
    signedPreKeyId: x3dhResult.signedPreKeyId,
    oneTimePreKeyId: x3dhResult.oneTimePreKeyId,
    identityTrust: x3dhResult.identityTrust,
  };
}

/**
 * Create a new session as the RESPONDER (receiving a PreKeySignalMessage).
 *
 * Called when we receive a PreKeySignalMessage from someone we don't have
 * a session with (or whose identity key has changed).
 *
 * @param senderId - Sender's user ID
 * @param senderDeviceId - Sender's device ID
 * @param preKeyMsg - The PreKeySignalMessage received
 */
export async function createResponderSession(
  senderId: string,
  senderDeviceId: number,
  preKeyMsg: PreKeySignalMessage,
): Promise<{
  sessionState: SessionState;
  identityTrust: 'trusted' | 'new' | 'changed';
}> {
  // X3DH responder computation (outside lock — loads private keys from SecureStore)
  const x3dhResult = await respondX3DH(
    preKeyMsg.identityKey,
    preKeyMsg.ephemeralKey,
    preKeyMsg.signedPreKeyId,
    preKeyMsg.preKeyId,
    senderId,
  );

  const localRegId = await getOrCreateRegistrationId();
  const sessionState = createResponderSessionState(
    x3dhResult,
    preKeyMsg.ephemeralKey,
    x3dhResult.signedPreKeyPrivate,
    localRegId,
    preKeyMsg.registrationId,
  );

  // Acquire session lock for persisting
  const sessionId = `${senderId}:${senderDeviceId}`;
  await withSessionLock(sessionId, async () => {
    const existing = await loadSessionRecord(senderId, senderDeviceId);

    if (existing) {
      // Simultaneous initiation — store new session alongside existing.
      // Move current active to previous, make this the new active.
      existing.previousSessions.push(existing.activeSession);
      existing.activeSession = sessionState;
      if (existing.previousSessions.length > 5) {
        existing.previousSessions.shift();
      }
      await storeSessionRecord(senderId, senderDeviceId, existing);
    } else {
      await storeSessionRecord(senderId, senderDeviceId, {
        activeSession: sessionState,
        previousSessions: [],
      });
    }
  });

  return {
    sessionState,
    identityTrust: x3dhResult.identityTrust,
  };
}

// ============================================================
// ENCRYPT
// ============================================================

/**
 * Encrypt a message for a specific recipient device.
 *
 * The session must already exist (created via createInitiatorSession or
 * createResponderSession). If no session exists, the caller must fetch
 * the bundle and create one first.
 *
 * @param recipientId - Recipient's user ID
 * @param deviceId - Recipient's device ID
 * @param plaintext - Message content as string
 * @returns Encrypted SignalMessage
 */
export async function encryptMessage(
  recipientId: string,
  deviceId: number,
  plaintext: string,
): Promise<SignalMessage> {
  const sessionId = `${recipientId}:${deviceId}`;
  const plaintextBytes = utf8Encode(plaintext);

  return withSessionLock(sessionId, async () => {
    const record = await loadSessionRecord(recipientId, deviceId);
    if (!record) {
      throw new Error(
        `No session for ${recipientId}:${deviceId}. ` +
        'Fetch their pre-key bundle and create a session first.',
      );
    }

    const message = ratchetEncrypt(record.activeSession, plaintextBytes);
    await storeSessionRecord(recipientId, deviceId, record);
    return message;
  });
}

/**
 * Encrypt a message for ALL known devices of a recipient.
 *
 * For single-device phase, this returns one encrypted message.
 * For multi-device, it returns one per device (all encrypted separately
 * with per-device sessions — WhatsApp model).
 *
 * @param recipientId - Recipient's user ID
 * @param plaintext - Message content as string
 * @param knownDeviceIds - List of known device IDs (default [1] for single-device)
 * @returns Array of {deviceId, message} — one per device
 */
export async function encryptForAllDevices(
  recipientId: string,
  plaintext: string,
  knownDeviceIds: number[] = [1],
): Promise<Array<{ deviceId: number; message: SignalMessage }>> {
  const results: Array<{ deviceId: number; message: SignalMessage }> = [];

  for (const deviceId of knownDeviceIds) {
    const sessionExists = await hasSession(recipientId, deviceId);
    if (!sessionExists) continue; // Skip devices without sessions

    const message = await encryptMessage(recipientId, deviceId, plaintext);
    results.push({ deviceId, message });
  }

  return results;
}

// ============================================================
// DECRYPT
// ============================================================

/**
 * Decrypt a received SignalMessage.
 *
 * Tries the active session first, then falls back to previous sessions
 * (for simultaneous initiation or session reset scenarios).
 *
 * On first successful decrypt after session creation, marks the session
 * as established and cleans up the OTP private key.
 *
 * @param senderId - Sender's user ID
 * @param senderDeviceId - Sender's device ID
 * @param message - Received SignalMessage
 * @param oneTimePreKeyId - OTP key ID used in session establishment (for cleanup)
 * @returns Decrypted plaintext as string
 */
export async function decryptMessage(
  senderId: string,
  senderDeviceId: number,
  message: SignalMessage,
  oneTimePreKeyId?: number,
): Promise<string> {
  const sessionId = `${senderId}:${senderDeviceId}`;

  return withSessionLock(sessionId, async () => {
    const record = await loadSessionRecord(senderId, senderDeviceId);
    if (!record) {
      throw new Error(
        `No session for ${senderId}:${senderDeviceId}. ` +
        'A PreKeySignalMessage is required to establish the session first.',
      );
    }

    // CRITICAL: ratchetDecrypt MUTATES session state before AEAD verification.
    // If AEAD fails, the state is corrupted. We MUST clone before attempting
    // decryption and only commit the clone on success.

    let plaintext: Uint8Array | null = null;
    let winningSession: SessionState | null = null;
    let winningIndex = -1; // -1 = active, >= 0 = previous session index

    // Try active session first (on a CLONE — original stays intact)
    const activeClone = cloneSessionState(record.activeSession);
    try {
      plaintext = ratchetDecrypt(activeClone, message);
      winningSession = activeClone;
      winningIndex = -1;
    } catch {
      // Active session clone failed — original is untouched
    }

    if (!winningSession) {
      // Try previous sessions (each on a clone)
      for (let i = record.previousSessions.length - 1; i >= 0; i--) {
        const prevClone = cloneSessionState(record.previousSessions[i]);
        try {
          plaintext = ratchetDecrypt(prevClone, message);
          winningSession = prevClone;
          winningIndex = i;
          break;
        } catch {
          // This clone failed — original previous session untouched
        }
      }
    }

    if (plaintext === null || !winningSession) {
      throw new Error(
        'Failed to decrypt message with any available session. ' +
        'The session may need to be re-established.',
      );
    }

    // Commit the winning clone to the record
    if (winningIndex === -1) {
      // Active session succeeded — replace with mutated clone
      record.activeSession = winningSession;
    } else {
      // Previous session succeeded — promote it to active
      record.previousSessions.splice(winningIndex, 1);
      record.previousSessions.push(record.activeSession);
      record.activeSession = winningSession;
    }

    // Mark session as established on first successful decrypt
    if (!record.activeSession.sessionEstablished) {
      record.activeSession.sessionEstablished = true;

      // NOW it's safe to delete the OTP private key
      if (oneTimePreKeyId !== undefined) {
        await deleteOneTimePreKeyPrivate(oneTimePreKeyId);
      }
    }

    await storeSessionRecord(senderId, senderDeviceId, record);
    return utf8Decode(plaintext);
  });
}

/**
 * Deep-clone a SessionState so ratchetDecrypt can mutate the clone
 * without corrupting the original on AEAD failure.
 */
function cloneSessionState(state: SessionState): SessionState {
  return {
    version: state.version,
    protocolVersion: state.protocolVersion,
    rootKey: new Uint8Array(state.rootKey),
    sendingChain: {
      chainKey: new Uint8Array(state.sendingChain.chainKey),
      counter: state.sendingChain.counter,
    },
    receivingChain: state.receivingChain
      ? {
          chainKey: new Uint8Array(state.receivingChain.chainKey),
          counter: state.receivingChain.counter,
        }
      : null,
    senderRatchetKeyPair: {
      publicKey: new Uint8Array(state.senderRatchetKeyPair.publicKey),
      privateKey: new Uint8Array(state.senderRatchetKeyPair.privateKey),
    },
    receiverRatchetKey: state.receiverRatchetKey
      ? new Uint8Array(state.receiverRatchetKey)
      : null,
    skippedKeys: state.skippedKeys.map((sk) => ({
      ratchetKey: new Uint8Array(sk.ratchetKey),
      counter: sk.counter,
      messageKey: new Uint8Array(sk.messageKey),
      createdAt: sk.createdAt,
    })),
    previousSendingCounter: state.previousSendingCounter,
    remoteIdentityKey: new Uint8Array(state.remoteIdentityKey),
    localRegistrationId: state.localRegistrationId,
    remoteRegistrationId: state.remoteRegistrationId,
    sessionEstablished: state.sessionEstablished,
    identityTrust: state.identityTrust,
    sealedSender: state.sealedSender,
  };
}

// ============================================================
// SESSION QUERIES
// ============================================================

/**
 * Check if we have an established session with a user.
 *
 * @param userId - User ID to check
 * @param deviceId - Device ID (default 1)
 * @returns true if session exists AND is established (at least one successful decrypt)
 */
export async function hasEstablishedSession(
  userId: string,
  deviceId: number = 1,
): Promise<boolean> {
  const record = await loadSessionRecord(userId, deviceId);
  return record !== null && record.activeSession.sessionEstablished;
}

/**
 * Get the remote identity key for a session.
 * Used for safety number computation.
 */
export async function getRemoteIdentityKey(
  userId: string,
  deviceId: number = 1,
): Promise<Uint8Array | null> {
  const record = await loadSessionRecord(userId, deviceId);
  return record?.activeSession.remoteIdentityKey ?? null;
}

/**
 * Reset a stuck session by deleting all local session state.
 *
 * Called when decryption fails on all sessions (active + previous).
 * After reset, the next message send will fetch a fresh bundle
 * and establish a new session via X3DH.
 *
 * The remote party will see "[Security code changed]" because
 * from their perspective, our session has reset.
 *
 * @param userId - User ID whose session to reset
 * @param deviceId - Device ID (default 1)
 */
export async function resetSession(
  userId: string,
  deviceId: number = 1,
): Promise<void> {
  const sessionId = `${userId}:${deviceId}`;
  await withSessionLock(sessionId, async () => {
    await deleteSessionRecord(userId, deviceId);
  });
}

/**
 * Get the identity trust status stored in the active session.
 * Returns whether the remote identity key was 'new', 'trusted', or 'changed'
 * at the time of session establishment.
 */
/**
 * Clean up all session state for a specific user.
 * Called when a user is blocked, deleted, or removed from contacts.
 * Removes sessions for ALL devices of this user.
 *
 * @param userId - User ID to clean up
 * @param deviceIds - Known device IDs (default [1])
 */
export async function cleanupSessionsForUser(
  userId: string,
  deviceIds: number[] = [1],
): Promise<void> {
  for (const deviceId of deviceIds) {
    await resetSession(userId, deviceId);
  }
}

export async function getSessionEstablished(
  userId: string,
  deviceId: number = 1,
): Promise<boolean> {
  const record = await loadSessionRecord(userId, deviceId);
  return record?.activeSession.sessionEstablished ?? false;
}
