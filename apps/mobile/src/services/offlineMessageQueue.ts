/**
 * Persistent offline message queue — survives app crash and restart.
 *
 * Uses react-native-mmkv for synchronous, fast key-value persistence.
 * Messages that fail to send (offline, socket disconnect, network error)
 * are enqueued here and retried when connectivity returns.
 *
 * Storage: all queued messages stored as a single JSON array in MMKV.
 * Filtered by conversationId at read time. Simple and fast for typical
 * queue sizes (< 100 messages). MMKV's synchronous API means no async overhead.
 *
 * Max retry: 5 attempts per message. After that, status becomes 'permanently_failed'.
 * Processing order: oldest first (FIFO by createdAt).
 */

import { MMKV } from 'react-native-mmkv';

// ============================================================
// Types
// ============================================================

export interface QueuedMessage {
  /** Client-generated unique ID */
  id: string;
  /** Conversation this message belongs to */
  conversationId: string;
  /** Plaintext content for local display (never sent unencrypted) */
  content: string;
  /** Pre-encrypted E2E payload ready for socket emit */
  e2ePayload?: {
    encryptedContent: string;
    e2eVersion: number;
    e2eSenderDeviceId: number;
    e2eSenderRatchetKey: string;
    e2eCounter: number;
    e2ePreviousCounter: number;
    clientMessageId: string;
    e2eSenderKeyId?: number;
    e2eIdentityKey?: string;
    e2eEphemeralKey?: string;
    e2eSignedPreKeyId?: number;
    e2ePreKeyId?: number;
    e2eRegistrationId?: number;
    messageType?: string;
    mediaUrl?: string;
  };
  /** Sealed sender envelope for 1:1 retries */
  sealedEnvelope?: {
    recipientId: string;
    ephemeralKey: string;
    sealedCiphertext: string;
  };
  /** Reply context */
  replyToId?: string;
  /** Timestamp when enqueued (ms since epoch) */
  createdAt: number;
  /** Number of send attempts so far */
  retryCount: number;
  /** Current status */
  status: 'queued' | 'permanently_failed';
}

// ============================================================
// Constants
// ============================================================

const STORAGE_KEY = 'offline_msg_queue';
const MAX_RETRY_COUNT = 5;

// ============================================================
// MMKV Instance (separate from Signal Protocol storage)
// ============================================================

/** Lazy singleton — created on first access */
let mmkvInstance: MMKV | null = null;

function getMMKV(): MMKV {
  if (!mmkvInstance) {
    mmkvInstance = new MMKV({ id: 'mizanly-offline-queue' });
  }
  return mmkvInstance;
}

// ============================================================
// Internal helpers
// ============================================================

function loadQueue(): QueuedMessage[] {
  const mmkv = getMMKV();
  const raw = mmkv.getString(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as QueuedMessage[];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedMessage[]): void {
  const mmkv = getMMKV();
  if (queue.length === 0) {
    mmkv.delete(STORAGE_KEY);
  } else {
    mmkv.set(STORAGE_KEY, JSON.stringify(queue));
  }
}

function generateId(): string {
  // Crypto-grade not needed for queue IDs — uniqueness is sufficient
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ============================================================
// Public API
// ============================================================

/**
 * Add a message to the persistent offline queue.
 * Returns the generated queue ID.
 */
export function enqueueMessage(
  msg: Omit<QueuedMessage, 'id' | 'createdAt' | 'retryCount' | 'status'>,
): string {
  const id = generateId();
  const queued: QueuedMessage = {
    ...msg,
    id,
    createdAt: Date.now(),
    retryCount: 0,
    status: 'queued',
  };
  const queue = loadQueue();
  queue.push(queued);
  saveQueue(queue);
  return id;
}

/**
 * Remove a message from the queue (e.g., after successful send).
 */
export function dequeueMessage(id: string): void {
  const queue = loadQueue();
  const filtered = queue.filter(m => m.id !== id);
  saveQueue(filtered);
}

/**
 * Get all queued messages, optionally filtered by conversation.
 * Sorted oldest-first (FIFO).
 */
export function getQueuedMessages(conversationId?: string): QueuedMessage[] {
  const queue = loadQueue();
  const filtered = conversationId
    ? queue.filter(m => m.conversationId === conversationId)
    : queue;
  return filtered.sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Get queued messages that are still retryable (not permanently failed).
 */
export function getRetryableMessages(conversationId?: string): QueuedMessage[] {
  return getQueuedMessages(conversationId).filter(m => m.status === 'queued');
}

/**
 * Get total number of queued messages.
 */
export function getQueueSize(): number {
  return loadQueue().length;
}

/**
 * Process the queue: attempt to send each retryable message via sendFn.
 *
 * - On success (sendFn returns true): remove from queue.
 * - On failure: increment retryCount. If retryCount >= MAX_RETRY_COUNT,
 *   mark as permanently_failed (stays in queue for user visibility).
 *
 * Returns counts of sent and failed messages.
 */
export async function processQueue(
  sendFn: (msg: QueuedMessage) => Promise<boolean>,
  conversationId?: string,
): Promise<{ sent: number; failed: number }> {
  const queue = loadQueue();
  const toProcess = conversationId
    ? queue.filter(m => m.conversationId === conversationId && m.status === 'queued')
    : queue.filter(m => m.status === 'queued');

  // Sort oldest first
  toProcess.sort((a, b) => a.createdAt - b.createdAt);

  let sent = 0;
  let failed = 0;

  for (const msg of toProcess) {
    try {
      const success = await sendFn(msg);
      if (success) {
        // Remove from queue
        const idx = queue.findIndex(m => m.id === msg.id);
        if (idx >= 0) queue.splice(idx, 1);
        sent++;
      } else {
        incrementRetry(queue, msg.id);
        failed++;
      }
    } catch {
      incrementRetry(queue, msg.id);
      failed++;
    }
  }

  saveQueue(queue);
  return { sent, failed };
}

/**
 * Clear all messages from the queue.
 */
export function clearQueue(): void {
  saveQueue([]);
}

/**
 * Remove all permanently failed messages from the queue.
 */
export function clearFailedMessages(): void {
  const queue = loadQueue();
  saveQueue(queue.filter(m => m.status !== 'permanently_failed'));
}

/**
 * Maximum retry count before a message is marked permanently failed.
 */
export const MAX_RETRIES = MAX_RETRY_COUNT;

// ============================================================
// Internal
// ============================================================

function incrementRetry(queue: QueuedMessage[], id: string): void {
  const msg = queue.find(m => m.id === id);
  if (!msg) return;
  msg.retryCount++;
  if (msg.retryCount >= MAX_RETRY_COUNT) {
    msg.status = 'permanently_failed';
  }
}

// ============================================================
// Testing support
// ============================================================

/**
 * Reset the MMKV instance (for tests only).
 * In production this is a no-op — the singleton persists for app lifetime.
 */
export function __resetForTesting(): void {
  mmkvInstance = null;
}
