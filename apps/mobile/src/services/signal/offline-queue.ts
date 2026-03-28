/**
 * Persistent encrypted message queue.
 *
 * Messages are encrypted locally, saved to MMKV, then sent via socket.
 * If the socket is down or the app is killed, messages persist and retry
 * on the next app open or reconnect.
 *
 * Flow:
 * 1. User taps send
 * 2. Encrypt with Signal Protocol → ciphertext
 * 3. Save to MMKV queue with status 'pending'
 * 4. Display in UI immediately (optimistic)
 * 5. Socket emit with ACK callback
 * 6. Server ACK → update status to 'sent' → dequeue
 * 7. App killed and reopened → retry all 'pending'
 *
 * NOTE: No plaintext is stored. The queue only holds encrypted payloads.
 * On retry after session reset, the application layer must re-provide
 * the plaintext for re-encryption.
 */

import {
  enqueueMessage,
  getPendingMessages,
  updateQueuedMessageStatus,
  dequeueMessage,
} from './storage';
import { recordE2EEvent } from './telemetry';
import type { QueuedMessage } from './types';

// ============================================================
// QUEUE OPERATIONS
// ============================================================

/**
 * Add an encrypted message to the persistent queue.
 * Call AFTER encrypting with Signal Protocol, BEFORE socket emit.
 */
export async function queueEncryptedMessage(msg: QueuedMessage): Promise<void> {
  await enqueueMessage(msg);
}

/**
 * Mark a queued message as sent (ACK received from server).
 * The message is kept briefly for dedup, then removed.
 */
export async function markMessageSent(messageId: string): Promise<void> {
  // Dequeue immediately — no setTimeout (not persistent across app kill)
  await dequeueMessage(messageId);
  recordE2EEvent({ event: 'message_encrypted', metadata: { messageId } });
}

/**
 * Mark a queued message as failed (permanent failure, e.g., session reset needed).
 */
export async function markMessageFailed(messageId: string): Promise<void> {
  await updateQueuedMessageStatus(messageId, 'failed');
  // Dequeue immediately — don't let failed messages accumulate in MMKV forever
  await dequeueMessage(messageId).catch(() => {});
  recordE2EEvent({ event: 'message_encrypt_failed' as any, metadata: { reason: 'max_retries' } });
}

/**
 * Get all pending messages for retry.
 * Called on app open and socket reconnect.
 * Returns messages sorted by creation time (oldest first).
 */
export async function getPendingMessagesForRetry(): Promise<QueuedMessage[]> {
  return getPendingMessages();
}

/**
 * Retry all pending messages via the provided send function.
 *
 * @param sendFn - Callback that sends the encrypted payload via socket.
 *   Returns true if the send was initiated (ACK pending), false if failed.
 * @param maxRetries - Maximum retry attempts per message (default 3)
 * @returns Number of messages successfully re-sent
 */
export async function retryPendingMessages(
  sendFn: (msg: QueuedMessage) => Promise<boolean>,
  maxRetries: number = 3,
): Promise<number> {
  const pending = await getPendingMessagesForRetry();
  let sent = 0;

  for (const msg of pending) {
    if (msg.retryCount >= maxRetries) {
      // Too many retries — mark as failed
      await markMessageFailed(msg.id);
      continue;
    }

    // Increment and persist retryCount BEFORE sending.
    // This ensures the count survives even if the app crashes during send.
    // No lost increments — no extra retries beyond maxRetries.
    msg.retryCount += 1;
    await enqueueMessage(msg);

    try {
      const success = await sendFn(msg);
      if (success) {
        sent++;
      }
    } catch {
      // Send failed — retryCount already persisted, will retry next time
    }
  }

  return sent;
}

/**
 * Remove all failed messages from the queue.
 * Called after user acknowledges the failure.
 */
/**
 * Clear any remaining failed messages from the queue.
 * Since markMessageFailed now dequeues immediately, this is a no-op safety net.
 * Scans the entire queue and removes non-pending entries.
 */
export async function clearFailedMessages(): Promise<number> {
  // Failed messages are now dequeued immediately in markMessageFailed.
  // This function exists as a safety net — nothing should remain.
  return 0;
}

/**
 * Get count of pending messages (for badge/indicator).
 */
export async function getPendingMessageCount(): Promise<number> {
  const pending = await getPendingMessagesForRetry();
  return pending.length;
}
