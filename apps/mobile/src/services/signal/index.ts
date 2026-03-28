/**
 * SignalService — public API for Mizanly's E2E encryption.
 *
 * This is the ONLY module the rest of the app imports.
 * It orchestrates: key generation, session management, encrypt/decrypt,
 * media encryption, group encryption, safety numbers, and pre-key replenishment.
 *
 * Usage:
 *   import { signalService } from '@/services/signal';
 *   await signalService.initialize();
 *   const encrypted = await signalService.encryptMessage(recipientId, "Hello");
 *   const decrypted = await signalService.decryptMessage(senderId, 1, messageData);
 */

import {
  getOrCreateIdentityKey,
  getOrCreateRegistrationId,
  generateOneTimePreKeysBatch,
  prepareIdentityKeyUpload,
  prepareOneTimePreKeysUpload,
  checkAndRotateSignedPreKey,
  needsReplenishment,
  generateSignedPreKey,
  prepareSignedPreKeyUpload,
} from './prekeys';
import {
  createInitiatorSession,
  createResponderSession,
  encryptMessage,
  encryptForAllDevices,
  decryptMessage,
  hasEstablishedSession,
  getRemoteIdentityKey,
  resetSession,
  cleanupSessionsForUser,
} from './session';
import {
  generateSenderKey,
  encryptGroupMessage,
  decryptGroupMessage,
  rotateSenderKey,
  distributeSenderKeyToMembers,
  distributeSenderKeyToNewMember,
} from './sender-keys';
import {
  computeSafetyNumber,
  computeSafetyNumberFromKeys,
  formatSafetyNumber,
  invalidateSafetyNumberCache,
} from './safety-numbers';
import {
  prepareMediaEncryption,
  encryptMediaChunked,
  encryptSmallMediaFile,
  decryptMediaFile,
  SMALL_FILE_THRESHOLD,
} from './media-crypto';
import {
  uploadEncryptedMedia,
  downloadEncryptedMedia,
  cleanupTempFile,
} from './streaming-upload';
import {
  queueEncryptedMessage,
  markMessageSent,
  markMessageFailed,
  retryPendingMessages,
  getPendingMessageCount,
} from './offline-queue';
import {
  cacheDecryptedMessage,
  getCachedMessages,
  isMessageCached,
} from './message-cache';
import {
  indexMessage,
  searchMessages,
  searchInConversation,
} from './search-index';
import {
  loadIdentityKeyPair,
  hasIdentityKey,
  clearAllE2EState,
  cleanupOrphanedOTPKeys,
  exportAllState,
  importAllState,
} from './storage';
import {
  initE2EApi,
  registerIdentityKey,
  uploadSignedPreKey,
  uploadOneTimePreKeys,
  getPreKeyCount,
  fetchPreKeyBundle,
  fetchPreKeyBundlesBatch,
  uploadSenderKey,
  negotiateProtocolVersion,
} from './e2eApi';
import { recordE2EEvent, withTelemetry, getE2ETelemetrySnapshot } from './telemetry';
import { toBase64, utf8Encode } from './crypto';
import { registerNotificationHandler, storePreviewKey, encryptPreview } from './notification-handler';
import type { SignalMessage, PreKeySignalMessage, SenderKeyMessage } from './types';

// ============================================================
// INITIALIZATION
// ============================================================

let initialized = false;

/**
 * Initialize the Signal Protocol service.
 * Call once on app startup after Clerk auth is ready.
 *
 * - Generates or loads identity key pair
 * - Registers with Go E2E server
 * - Checks and rotates signed pre-key if needed
 * - Replenishes one-time pre-keys if below threshold
 * - Cleans up orphaned OTP private keys
 * - Pre-warms sessions for top conversations
 *
 * @param e2eServerUrl - Base URL of the Go E2E server
 * @param authTokenProvider - Function that returns a fresh Clerk JWT
 * @param topConversationUserIds - User IDs of top conversations (for session pre-warming)
 */
export async function initialize(
  e2eServerUrl: string,
  authTokenProvider: () => Promise<string>,
  topConversationUserIds: string[] = [],
): Promise<void> {
  if (initialized) return;

  // Initialize the API client
  initE2EApi(e2eServerUrl, authTokenProvider);

  // Get or create identity key
  const identityKeyPair = await getOrCreateIdentityKey();
  const registrationId = await getOrCreateRegistrationId();

  // D7: Parallel initialization — run independent network calls concurrently.
  // Old: 4 sequential round trips (~800ms total on 4G).
  // New: 2 parallel batches (~200ms total on 4G).

  // Batch 1: register identity + check/rotate SPK + get OTP count (all independent)
  const [, rotated, otpCount] = await Promise.all([
    withTelemetry('session_established', () =>
      registerIdentityKey(1, identityKeyPair.publicKey, registrationId),
    ),
    checkAndRotateSignedPreKey(uploadSignedPreKey).catch((err) => {
      recordE2EEvent({ event: 'signed_prekey_rotated', errorType: err?.message });
      return false as const;
    }),
    getPreKeyCount().catch(() => 0),
  ]);

  // Ensure we have a signed pre-key (first run)
  if (!rotated) {
    try {
      if (otpCount === 0) {
        // First run — generate and upload initial signed pre-key
        const spk = await generateSignedPreKey(identityKeyPair, 1);
        await uploadSignedPreKey(prepareSignedPreKeyUpload(spk));
      }
    } catch {}
  }

  // Batch 2: replenish OTPs + cleanup orphans (independent, can be parallel)
  const [, cleaned] = await Promise.all([
    needsReplenishment(otpCount)
      ? generateOneTimePreKeysBatch().then(async (otps) => {
          await uploadOneTimePreKeys(prepareOneTimePreKeysUpload(otps));
          recordE2EEvent({ event: 'prekey_replenished', metadata: { count: otps.length } });
        })
      : Promise.resolve(),
    cleanupOrphanedOTPKeys(),
  ]);
  if (cleaned > 0) {
    recordE2EEvent({ event: 'prekey_replenished', metadata: { orphansCleaned: cleaned } });
  }

  // Pre-warm sessions for top conversations (background, non-blocking)
  if (topConversationUserIds.length > 0) {
    preWarmSessions(topConversationUserIds).catch(() => {});
  }

  // Register the background notification handler for encrypted preview decryption
  registerNotificationHandler();

  // C6: Key transparency — verify our own key is consistent with the server's Merkle log.
  // Runs in background after initialization. If the server returns a proof that doesn't
  // match our locally stored key, it means the server substituted a different key (MITM).
  import('./key-transparency').then(({ verifyKeyTransparency }) => {
    if (!identityKeyPair) return;
    verifyKeyTransparency('self', async (userId: string) => {
      try {
        const response = await fetch(
          `${e2eServerUrl}/api/v1/e2e/transparency/${encodeURIComponent(userId)}`,
          { headers: { Authorization: `Bearer ${await authTokenProvider()}` } },
        );
        if (!response.ok) return null;
        return response.json();
      } catch {
        return null;
      }
    }).then(result => {
      if (result.status === 'mismatch') {
        // CRITICAL: server may be substituting keys
        recordE2EEvent({ event: 'identity_key_changed', metadata: { transparency: 'mismatch' } });
      }
    }).catch(() => {});
  }).catch(() => {});

  initialized = true;
}

// ============================================================
// SESSION PRE-WARMING
// ============================================================

/**
 * Pre-fetch bundles and create sessions for frequently contacted users.
 * Runs in background — failures are silently ignored.
 */
/**
 * Pre-warm sessions by fetching bundles and establishing X3DH sessions
 * for the user's most frequent contacts.
 *
 * This consumes one OTP per contact — acceptable for top 10 contacts
 * (100 OTPs uploaded per batch, replenished at < 20). The speed gain
 * is massive: first message goes from 300-700ms (X3DH + network) to
 * ~3ms (Double Ratchet encrypt only).
 *
 * Runs in background on app open. Failures are silently ignored —
 * sessions will be lazily established on first message send.
 */
async function preWarmSessions(userIds: string[]): Promise<string[]> {
  const toWarm = userIds.slice(0, 10); // Top 10 contacts — budget: 10 OTPs
  const established: string[] = [];

  for (const userId of toWarm) {
    try {
      const has = await hasEstablishedSession(userId);
      if (has) continue;

      // Fetch bundle + establish session (consumes 1 OTP per contact)
      const { bundle } = await fetchPreKeyBundle(userId);
      await createInitiatorSession(userId, 1, bundle);
      established.push(userId);
      recordE2EEvent({ event: 'session_established', metadata: { preWarmed: true } });
    } catch {
      // Non-fatal — will establish lazily on first message
    }
  }

  return established;
}

// ============================================================
// RE-EXPORTS (the public API surface)
// ============================================================

// Session management
export {
  createInitiatorSession,
  createResponderSession,
  hasEstablishedSession,
  getRemoteIdentityKey,
  resetSession,
  cleanupSessionsForUser,
};

// 1:1 encryption
export { encryptMessage, encryptForAllDevices, decryptMessage };

// Group encryption
export {
  generateSenderKey,
  encryptGroupMessage,
  decryptGroupMessage,
  rotateSenderKey,
  distributeSenderKeyToMembers,
  distributeSenderKeyToNewMember,
};

/**
 * D3: Pre-generate sender key when joining/creating a group.
 * Called from the group creation or join flow — NOT on first message send.
 * This eliminates the 500ms+ delay on the first group message.
 *
 * @param groupId - Conversation ID of the group
 */
export async function preGenerateGroupSenderKey(groupId: string): Promise<void> {
  try {
    // Only generate if we don't already have one for this group
    const { loadSenderKeyState } = await import('./storage');
    const existing = await loadSenderKeyState(groupId, 'self');
    if (existing) return; // Already have a key

    await generateSenderKey(groupId);
    recordE2EEvent({ event: 'sender_key_distributed', metadata: { preGenerated: true } });
  } catch {
    // Non-fatal — will generate on first message send
  }
}

// Safety numbers
export { computeSafetyNumber, formatSafetyNumber, invalidateSafetyNumberCache };

// Media encryption
export {
  prepareMediaEncryption,
  encryptMediaChunked,
  encryptSmallMediaFile,
  decryptMediaFile,
  uploadEncryptedMedia,
  downloadEncryptedMedia,
  cleanupTempFile,
  SMALL_FILE_THRESHOLD,
};

// Offline queue
export {
  queueEncryptedMessage,
  markMessageSent,
  markMessageFailed,
  retryPendingMessages,
  getPendingMessageCount,
};

// Message cache
export { cacheDecryptedMessage, getCachedMessages, isMessageCached };

// Search
export { searchMessages, searchInConversation, indexMessage };

// E2E API
export { fetchPreKeyBundle, fetchPreKeyBundlesBatch, negotiateProtocolVersion };

// Notification preview encryption
export { storePreviewKey, encryptPreview };

// Telemetry
export { getE2ETelemetrySnapshot };

// Lifecycle
export { clearAllE2EState };

// Key backup (C5)
export { exportAllState, importAllState };

// Sealed sender (C11)
export { sealMessage, unsealMessage } from './sealed-sender';

// PQXDH (C10)
export { isPQXDHAvailable, deriveHybridSecret, negotiatePQVersion } from './pqxdh';

// Multi-device (C4)
export { encryptForRecipient, getDeviceIds, generateDeviceLinkCode, verifyDeviceLinkCode } from './multi-device';

// Key transparency (C6)
export { verifyKeyTransparency, verifyMerkleProof } from './key-transparency';

// Native crypto adapter (C13)
export { isNativeCryptoAvailable } from './native-crypto-adapter';
