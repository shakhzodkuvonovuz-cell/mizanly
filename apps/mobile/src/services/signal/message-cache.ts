/**
 * Decrypted message cache in encrypted MMKV.
 *
 * After decrypting a message via Double Ratchet, the plaintext is cached
 * locally so conversations open instantly from cache. Only NEW messages
 * need decryption — cached messages are displayed immediately.
 *
 * Features:
 * - Instant conversation open (0ms vs 5s for 1000 messages)
 * - Disappearing message timer enforcement (delete from cache at expiresAt)
 * - Size cap with LRU eviction (prevents MMKV bloat on low-end phones)
 * - Per-conversation pagination
 */

import { MMKV } from 'react-native-mmkv';
import type { CachedMessage } from './types';

// ============================================================
// CONSTANTS
// ============================================================

/** Maximum total cached messages across all conversations */
const MAX_CACHED_MESSAGES = 50_000;

/** Maximum cached messages per conversation */
const MAX_PER_CONVERSATION = 500;

/** MMKV key prefixes */
const CACHE_PREFIX = 'msgcache:';
const CACHE_INDEX_PREFIX = 'msgcacheidx:';
const CACHE_GLOBAL_COUNT_KEY = 'msgcache:__count';

// We use the same MMKV instance as storage.ts (encrypted)
// The import is deferred to avoid circular dependency
let mmkvInstance: MMKV | null = null;
let mmkvInitPromise: Promise<MMKV> | null = null;

async function getMMKV(): Promise<MMKV> {
  if (mmkvInstance) return mmkvInstance;
  // Serialize initialization — prevent race condition
  if (!mmkvInitPromise) {
    mmkvInitPromise = (async () => {
      const SecureStore = await import('expo-secure-store');
      const encKey = await SecureStore.getItemAsync('e2e_mmkv_key');
      // CRITICAL: NEVER create unencrypted MMKV for message cache.
      // Without encryption, all decrypted message plaintext is stored on disk in cleartext.
      // If the encryption key is not available, the E2E system hasn't been initialized yet.
      if (!encKey) {
        throw new Error(
          'E2E encryption key not available. Call SignalService.initialize() before using message cache.',
        );
      }
      mmkvInstance = new MMKV({ id: 'mizanly-signal-cache', encryptionKey: encKey });
      return mmkvInstance;
    })();
  }
  return mmkvInitPromise;
}

// ============================================================
// CACHE OPERATIONS
// ============================================================

/**
 * Cache a decrypted message.
 * Called after every successful decrypt in the Double Ratchet.
 */
export async function cacheDecryptedMessage(msg: CachedMessage): Promise<void> {
  const mmkv = await getMMKV();

  // Store the message
  const key = `${CACHE_PREFIX}${msg.conversationId}:${msg.messageId}`;
  mmkv.set(key, JSON.stringify(msg));

  // Update conversation index
  const indexKey = `${CACHE_INDEX_PREFIX}${msg.conversationId}`;
  const indexStr = mmkv.getString(indexKey);
  const index: string[] = indexStr ? JSON.parse(indexStr) : [];

  if (!index.includes(msg.messageId)) {
    index.push(msg.messageId);

    // Per-conversation cap
    let evictedCount = 0;
    if (index.length > MAX_PER_CONVERSATION) {
      const evicted = index.shift()!;
      mmkv.delete(`${CACHE_PREFIX}${msg.conversationId}:${evicted}`);
      evictedCount = 1;
    }

    mmkv.set(indexKey, JSON.stringify(index));

    // Global count tracking — only increment for genuinely NEW messages
    const globalCount = mmkv.getNumber(CACHE_GLOBAL_COUNT_KEY) ?? 0;
    mmkv.set(CACHE_GLOBAL_COUNT_KEY, globalCount + 1 - evictedCount);

    // Global LRU eviction if over cap
    if (globalCount + 1 > MAX_CACHED_MESSAGES) {
      await evictOldestMessages(100);
    }
  }
}

/**
 * Get cached messages for a conversation.
 * Returns messages sorted by creation time (newest first).
 * Also enforces disappearing message expiry.
 *
 * @param conversationId - Conversation ID
 * @param limit - Max messages to return (default 50)
 * @param beforeTimestamp - Pagination: only messages before this timestamp
 */
export async function getCachedMessages(
  conversationId: string,
  limit: number = 50,
  beforeTimestamp?: number,
): Promise<CachedMessage[]> {
  const mmkv = await getMMKV();
  const indexKey = `${CACHE_INDEX_PREFIX}${conversationId}`;
  const indexStr = mmkv.getString(indexKey);
  if (!indexStr) return [];

  const index: string[] = JSON.parse(indexStr);
  const messages: CachedMessage[] = [];
  const now = Date.now();
  const expiredIds: string[] = [];

  // Read all messages, then sort by timestamp (newest first)
  // We can't rely on index order because messages may arrive out of order
  for (let i = index.length - 1; i >= 0; i--) {
    const msgId = index[i];
    const key = `${CACHE_PREFIX}${conversationId}:${msgId}`;
    const str = mmkv.getString(key);
    if (!str) continue;

    const msg: CachedMessage = JSON.parse(str);

    // Enforce disappearing message expiry
    if (msg.expiresAt && msg.expiresAt <= now) {
      expiredIds.push(msgId);
      mmkv.delete(key);
      continue;
    }

    // Pagination
    if (beforeTimestamp && msg.createdAt >= beforeTimestamp) continue;

    messages.push(msg);
  }

  // Sort by timestamp newest first, then apply limit
  messages.sort((a, b) => b.createdAt - a.createdAt);
  const limited = messages.slice(0, limit);

  // Clean up expired messages from index
  if (expiredIds.length > 0) {
    const cleaned = index.filter((id) => !expiredIds.includes(id));
    mmkv.set(indexKey, JSON.stringify(cleaned));
    const count = mmkv.getNumber(CACHE_GLOBAL_COUNT_KEY) ?? 0;
    mmkv.set(CACHE_GLOBAL_COUNT_KEY, Math.max(0, count - expiredIds.length));
  }

  return limited;
}

/**
 * Check if a message is already cached (avoid re-decrypting).
 */
export async function isMessageCached(
  conversationId: string,
  messageId: string,
): Promise<boolean> {
  const mmkv = await getMMKV();
  return mmkv.contains(`${CACHE_PREFIX}${conversationId}:${messageId}`);
}

/**
 * Delete a specific message from cache.
 * Called when a message is deleted by the sender.
 */
export async function deleteCachedMessage(
  conversationId: string,
  messageId: string,
): Promise<void> {
  const mmkv = await getMMKV();
  mmkv.delete(`${CACHE_PREFIX}${conversationId}:${messageId}`);

  // Update index
  const indexKey = `${CACHE_INDEX_PREFIX}${conversationId}`;
  const indexStr = mmkv.getString(indexKey);
  if (indexStr) {
    const index: string[] = JSON.parse(indexStr);
    const filtered = index.filter((id) => id !== messageId);
    mmkv.set(indexKey, JSON.stringify(filtered));
  }

  const count = mmkv.getNumber(CACHE_GLOBAL_COUNT_KEY) ?? 0;
  mmkv.set(CACHE_GLOBAL_COUNT_KEY, Math.max(0, count - 1));
}

/**
 * Clear entire cache for a conversation.
 * Called when user deletes a conversation.
 */
export async function clearConversationCache(conversationId: string): Promise<void> {
  const mmkv = await getMMKV();
  const indexKey = `${CACHE_INDEX_PREFIX}${conversationId}`;
  const indexStr = mmkv.getString(indexKey);

  if (indexStr) {
    const index: string[] = JSON.parse(indexStr);
    for (const msgId of index) {
      mmkv.delete(`${CACHE_PREFIX}${conversationId}:${msgId}`);
    }
    mmkv.delete(indexKey);

    const count = mmkv.getNumber(CACHE_GLOBAL_COUNT_KEY) ?? 0;
    mmkv.set(CACHE_GLOBAL_COUNT_KEY, Math.max(0, count - index.length));
  }
}

/**
 * Evict oldest messages across all conversations (LRU).
 * Called when global count exceeds MAX_CACHED_MESSAGES.
 */
async function evictOldestMessages(count: number): Promise<void> {
  const mmkv = await getMMKV();
  const allKeys = mmkv.getAllKeys().filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_GLOBAL_COUNT_KEY);

  // Collect all messages with timestamps for LRU sorting
  const entries: Array<{ key: string; conversationId: string; messageId: string; createdAt: number }> = [];
  for (const key of allKeys) {
    if (key.startsWith(CACHE_INDEX_PREFIX)) continue;
    const str = mmkv.getString(key);
    if (!str) continue;
    try {
      const msg: CachedMessage = JSON.parse(str);
      entries.push({
        key,
        conversationId: msg.conversationId,
        messageId: msg.messageId,
        createdAt: msg.createdAt,
      });
    } catch {
      // Corrupt entry — delete
      mmkv.delete(key);
    }
  }

  // Sort by createdAt ascending (oldest first) and evict
  entries.sort((a, b) => a.createdAt - b.createdAt);
  const toEvict = entries.slice(0, count);

  for (const entry of toEvict) {
    mmkv.delete(entry.key);
    // Update conversation index
    const indexKey = `${CACHE_INDEX_PREFIX}${entry.conversationId}`;
    const indexStr = mmkv.getString(indexKey);
    if (indexStr) {
      const index: string[] = JSON.parse(indexStr);
      const filtered = index.filter((id) => id !== entry.messageId);
      mmkv.set(indexKey, JSON.stringify(filtered));
    }
  }

  const globalCount = mmkv.getNumber(CACHE_GLOBAL_COUNT_KEY) ?? 0;
  mmkv.set(CACHE_GLOBAL_COUNT_KEY, Math.max(0, globalCount - toEvict.length));
}

/**
 * Get cache statistics (for debugging / telemetry).
 */
export async function getCacheStats(): Promise<{
  totalMessages: number;
  conversationCount: number;
}> {
  const mmkv = await getMMKV();
  const totalMessages = mmkv.getNumber(CACHE_GLOBAL_COUNT_KEY) ?? 0;
  const allKeys = mmkv.getAllKeys().filter((k) => k.startsWith(CACHE_INDEX_PREFIX));
  return { totalMessages, conversationCount: allKeys.length };
}
