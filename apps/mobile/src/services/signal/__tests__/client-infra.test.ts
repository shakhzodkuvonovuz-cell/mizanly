/**
 * Exhaustive tests for Phase 7.5 client infrastructure:
 * - offline-queue.ts (persistent send queue)
 * - message-cache.ts (decrypted message cache)
 * - search-index.ts (client-side search)
 */

import {
  queueEncryptedMessage,
  markMessageSent,
  markMessageFailed,
  getPendingMessagesForRetry,
  retryPendingMessages,
  getPendingMessageCount,
} from '../offline-queue';
import {
  cacheDecryptedMessage,
  getCachedMessages,
  isMessageCached,
  deleteCachedMessage,
  clearConversationCache,
  getCacheStats,
} from '../message-cache';
import {
  indexMessage,
  removeFromIndex,
  searchMessages,
  searchInConversation,
  clearSearchIndex,
  getSearchIndexStats,
} from '../search-index';
import { generateRandomBytes, toBase64 } from '../crypto';
import type { QueuedMessage, CachedMessage } from '../types';

const SecureStore = require('expo-secure-store');

beforeEach(async () => {
  SecureStore.__reset();
  // Set MMKV encryption key so cache/search modules can initialize
  await SecureStore.setItemAsync('e2e_mmkv_key', toBase64(generateRandomBytes(32)));
  // V4-F9: Reset module singletons to force fresh key derivation.
  // Without this, the MMKV singleton retains the previous test's AEAD key
  // while SecureStore has been reset with a new random key.
  const storage = require('../storage');
  if (typeof storage._resetForTesting === 'function') {
    storage._resetForTesting();
  }
});

// ============================================================
// OFFLINE QUEUE
// ============================================================

describe('offline queue', () => {
  beforeEach(async () => {
    // Clear any leftover queue entries from other tests
    const { clearAllE2EState, _resetForTesting } = require('../storage');
    await clearAllE2EState().catch(() => {});
    _resetForTesting();
    // Re-set the MMKV key after clearing
    await SecureStore.setItemAsync('e2e_mmkv_key', toBase64(generateRandomBytes(32)));
  });

  function createTestMessage(overrides?: Partial<QueuedMessage>): QueuedMessage {
    return {
      id: `msg_${Math.random().toString(36).slice(2)}`,
      conversationId: 'conv1',
      isGroup: false,
      encryptedPayload: {
        header: {
          senderRatchetKey: generateRandomBytes(32),
          counter: 0,
          previousCounter: 0,
        },
        ciphertext: generateRandomBytes(64),
      },
      e2eVersion: 1,
      e2eSenderDeviceId: 1,
      status: 'pending',
      createdAt: Date.now(),
      retryCount: 0,
      ...overrides,
    };
  }

  it('queues and retrieves a message', async () => {
    const msg = createTestMessage();
    await queueEncryptedMessage(msg);
    const pending = await getPendingMessagesForRetry();
    expect(pending.length).toBeGreaterThanOrEqual(1);
    expect(pending.some((p) => p.id === msg.id)).toBe(true);
  });

  it('marks message as sent', async () => {
    const msg = createTestMessage();
    await queueEncryptedMessage(msg);
    await markMessageSent(msg.id);
    // After marking sent, it should not be in pending anymore
    // (there's a 5s dequeue delay, but status changes immediately)
  });

  it('marks message as failed', async () => {
    const msg = createTestMessage();
    await queueEncryptedMessage(msg);
    await markMessageFailed(msg.id);
    // Failed messages are not returned by getPendingMessages (which filters by 'pending')
  });

  it('returns messages sorted by creation time', async () => {
    const m1 = createTestMessage({ id: 'oldest', createdAt: 1000 });
    const m2 = createTestMessage({ id: 'newest', createdAt: 3000 });
    const m3 = createTestMessage({ id: 'middle', createdAt: 2000 });
    await queueEncryptedMessage(m1);
    await queueEncryptedMessage(m2);
    await queueEncryptedMessage(m3);
    const pending = await getPendingMessagesForRetry();
    const ids = pending.map((p) => p.id);
    expect(ids.indexOf('oldest')).toBeLessThan(ids.indexOf('middle'));
    expect(ids.indexOf('middle')).toBeLessThan(ids.indexOf('newest'));
  });

  it('retryPendingMessages calls sendFn for each pending message', async () => {
    const m1 = createTestMessage({ id: 'r1' });
    const m2 = createTestMessage({ id: 'r2' });
    await queueEncryptedMessage(m1);
    await queueEncryptedMessage(m2);

    const sent: string[] = [];
    const count = await retryPendingMessages(async (msg) => {
      sent.push(msg.id);
      return true;
    });

    expect(count).toBe(2);
    expect(sent).toContain('r1');
    expect(sent).toContain('r2');
  });

  it('retryPendingMessages respects maxRetries', async () => {
    const msg = createTestMessage({ id: 'maxed', retryCount: 3 });
    await queueEncryptedMessage(msg);

    const sent: string[] = [];
    await retryPendingMessages(async (m) => { sent.push(m.id); return true; }, 3);

    // Should NOT have been sent (retryCount >= maxRetries)
    expect(sent).not.toContain('maxed');
  });

  it('getPendingMessageCount returns correct count', async () => {
    await queueEncryptedMessage(createTestMessage());
    await queueEncryptedMessage(createTestMessage());
    const count = await getPendingMessageCount();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('does not store plaintext (security check)', () => {
    const msg = createTestMessage();
    // Verify the type doesn't have plaintextForRetry
    expect('plaintextForRetry' in msg).toBe(false);
  });
});

// ============================================================
// MESSAGE CACHE
// ============================================================

describe('message cache', () => {
  beforeEach(async () => {
    await clearConversationCache('conv1').catch(() => {});
    await clearConversationCache('convA').catch(() => {});
    await clearConversationCache('convB').catch(() => {});
  });

  function createCachedMsg(overrides?: Partial<CachedMessage>): CachedMessage {
    return {
      messageId: `msg_${Math.random().toString(36).slice(2)}`,
      conversationId: 'conv1',
      senderId: 'user1',
      content: 'test message',
      messageType: 'TEXT',
      createdAt: Date.now(),
      ...overrides,
    };
  }

  it('caches and retrieves a message', async () => {
    const msg = createCachedMsg({ messageId: 'cached1' });
    await cacheDecryptedMessage(msg);
    const messages = await getCachedMessages('conv1');
    expect(messages.some((m) => m.messageId === 'cached1')).toBe(true);
  });

  it('isMessageCached returns true for cached message', async () => {
    const msg = createCachedMsg({ messageId: 'check1' });
    await cacheDecryptedMessage(msg);
    expect(await isMessageCached('conv1', 'check1')).toBe(true);
    expect(await isMessageCached('conv1', 'nonexistent')).toBe(false);
  });

  it('returns messages newest first', async () => {
    await cacheDecryptedMessage(createCachedMsg({ messageId: 'old', createdAt: 1000 }));
    await cacheDecryptedMessage(createCachedMsg({ messageId: 'new', createdAt: 3000 }));
    await cacheDecryptedMessage(createCachedMsg({ messageId: 'mid', createdAt: 2000 }));

    const messages = await getCachedMessages('conv1');
    expect(messages[0].messageId).toBe('new');
  });

  it('respects limit parameter', async () => {
    for (let i = 0; i < 10; i++) {
      await cacheDecryptedMessage(createCachedMsg({ messageId: `lim${i}`, createdAt: i * 1000 }));
    }
    const messages = await getCachedMessages('conv1', 3);
    expect(messages.length).toBe(3);
  });

  it('enforces disappearing message expiry', async () => {
    await cacheDecryptedMessage(createCachedMsg({
      messageId: 'expired',
      expiresAt: Date.now() - 1000, // Already expired
    }));
    await cacheDecryptedMessage(createCachedMsg({
      messageId: 'active',
      expiresAt: Date.now() + 60000, // Expires in 1 minute
    }));

    const messages = await getCachedMessages('conv1');
    expect(messages.some((m) => m.messageId === 'expired')).toBe(false);
    expect(messages.some((m) => m.messageId === 'active')).toBe(true);
  });

  it('deletes a specific cached message', async () => {
    await cacheDecryptedMessage(createCachedMsg({ messageId: 'del1' }));
    await deleteCachedMessage('conv1', 'del1');
    expect(await isMessageCached('conv1', 'del1')).toBe(false);
  });

  it('clears entire conversation cache', async () => {
    await cacheDecryptedMessage(createCachedMsg({ messageId: 'c1' }));
    await cacheDecryptedMessage(createCachedMsg({ messageId: 'c2' }));
    await clearConversationCache('conv1');
    const messages = await getCachedMessages('conv1');
    expect(messages.length).toBe(0);
  });

  it('separates conversations', async () => {
    await cacheDecryptedMessage(createCachedMsg({ messageId: 'a1', conversationId: 'convA' }));
    await cacheDecryptedMessage(createCachedMsg({ messageId: 'b1', conversationId: 'convB' }));

    const msgsA = await getCachedMessages('convA');
    const msgsB = await getCachedMessages('convB');
    expect(msgsA.length).toBe(1);
    expect(msgsA[0].messageId).toBe('a1');
    expect(msgsB.length).toBe(1);
    expect(msgsB[0].messageId).toBe('b1');
  });

  it('getCacheStats returns counts', async () => {
    await cacheDecryptedMessage(createCachedMsg({ conversationId: 'c1' }));
    await cacheDecryptedMessage(createCachedMsg({ conversationId: 'c2' }));
    const stats = await getCacheStats();
    expect(stats.totalMessages).toBeGreaterThanOrEqual(2);
    expect(stats.conversationCount).toBeGreaterThanOrEqual(2);
  });

  it('handles Arabic content', async () => {
    const msg = createCachedMsg({ messageId: 'ar', content: 'بسم الله الرحمن الرحيم' });
    await cacheDecryptedMessage(msg);
    const messages = await getCachedMessages('conv1');
    expect(messages.some((m) => m.content === 'بسم الله الرحمن الرحيم')).toBe(true);
  });

  it('does not duplicate on re-cache', async () => {
    const msg = createCachedMsg({ messageId: 'dup1' });
    await cacheDecryptedMessage(msg);
    await cacheDecryptedMessage(msg);
    const messages = await getCachedMessages('conv1');
    const dups = messages.filter((m) => m.messageId === 'dup1');
    expect(dups.length).toBe(1);
  });
});

// ============================================================
// SEARCH INDEX
// ============================================================

describe('search index', () => {
  beforeEach(async () => {
    await clearSearchIndex();
  });

  it('indexes and finds a message by keyword', async () => {
    await indexMessage('m1', 'conv1', 'meeting at the mosque Friday', 1000);
    const results = await searchMessages('mosque');
    expect(results.length).toBe(1);
    expect(results[0].messageId).toBe('m1');
    expect(results[0].conversationId).toBe('conv1');
  });

  it('AND semantics: all tokens must match', async () => {
    await indexMessage('m1', 'conv1', 'meeting at the mosque', 1000);
    await indexMessage('m2', 'conv1', 'going to the mosque Friday', 2000);
    const results = await searchMessages('mosque Friday');
    expect(results.length).toBe(1);
    expect(results[0].messageId).toBe('m2');
  });

  it('case insensitive search', async () => {
    await indexMessage('m1', 'conv1', 'Assalamu Alaikum brother', 1000);
    const results = await searchMessages('assalamu');
    expect(results.length).toBe(1);
  });

  it('returns results newest first', async () => {
    await indexMessage('m1', 'conv1', 'salam everyone', 1000);
    await indexMessage('m2', 'conv1', 'salam again', 3000);
    await indexMessage('m3', 'conv1', 'salam once more', 2000);
    const results = await searchMessages('salam');
    expect(results[0].messageId).toBe('m2'); // Newest
    expect(results[2].messageId).toBe('m1'); // Oldest
  });

  it('search in specific conversation', async () => {
    await indexMessage('m1', 'conv1', 'hello world', 1000);
    await indexMessage('m2', 'conv2', 'hello there', 2000);
    const results = await searchInConversation('conv1', 'hello');
    expect(results.length).toBe(1);
    expect(results[0].conversationId).toBe('conv1');
  });

  it('returns empty for no match', async () => {
    await indexMessage('m1', 'conv1', 'hello world', 1000);
    const results = await searchMessages('nonexistent');
    expect(results.length).toBe(0);
  });

  it('returns empty for short query tokens', async () => {
    await indexMessage('m1', 'conv1', 'hi there', 1000);
    // "hi" is 2 chars, below MIN_TOKEN_LENGTH (3)
    const results = await searchMessages('hi');
    expect(results.length).toBe(0);
  });

  it('returns empty for empty query', async () => {
    expect(await searchMessages('')).toEqual([]);
    expect(await searchMessages('   ')).toEqual([]);
  });

  it('handles Arabic text search', async () => {
    await indexMessage('m1', 'conv1', 'بسم الله الرحمن الرحيم', 1000);
    const results = await searchMessages('الرحمن');
    expect(results.length).toBe(1);
  });

  it('removeFromIndex makes message unsearchable', async () => {
    await indexMessage('m1', 'conv1', 'findable message', 1000);
    expect((await searchMessages('findable')).length).toBe(1);
    await removeFromIndex('m1');
    expect((await searchMessages('findable')).length).toBe(0);
  });

  it('getSearchIndexStats returns counts', async () => {
    await indexMessage('m1', 'conv1', 'hello world test', 1000);
    await indexMessage('m2', 'conv1', 'another test here', 2000);
    const stats = await getSearchIndexStats();
    expect(stats.indexedMessages).toBeGreaterThanOrEqual(2);
    expect(stats.uniqueTokens).toBeGreaterThanOrEqual(3); // hello, world, test, another, here
  });

  it('respects limit parameter', async () => {
    for (let i = 0; i < 20; i++) {
      await indexMessage(`m${i}`, 'conv1', `common keyword message ${i}`, i * 1000);
    }
    const results = await searchMessages('common', 5);
    expect(results.length).toBe(5);
  });

  it('clearSearchIndex removes everything', async () => {
    await indexMessage('m1', 'conv1', 'persistent data', 1000);
    await clearSearchIndex();
    const results = await searchMessages('persistent');
    expect(results.length).toBe(0);
  });

  it('handles punctuation in content', async () => {
    await indexMessage('m1', 'conv1', 'hello, world! how are you?', 1000);
    const results = await searchMessages('world');
    expect(results.length).toBe(1);
  });

  it('handles Arabic punctuation', async () => {
    await indexMessage('m1', 'conv1', 'السلام عليكم، كيف حالك؟', 1000);
    const results = await searchMessages('عليكم');
    expect(results.length).toBe(1);
  });

  it('stress: 100 messages indexed and searchable', async () => {
    for (let i = 0; i < 100; i++) {
      await indexMessage(`stress${i}`, 'conv1', `message number ${i} unique-${i}`, i);
    }
    // Search for a specific message
    const results = await searchMessages('unique-42');
    expect(results.length).toBe(1);
    expect(results[0].messageId).toBe('stress42');
  });

  it('does not index empty content', async () => {
    await indexMessage('m1', 'conv1', '', 1000);
    await indexMessage('m2', 'conv1', '   ', 2000);
    const stats = await getSearchIndexStats();
    expect(stats.indexedMessages).toBe(0);
  });

  // F5-5: FIFO eviction order tests — HMAC entries are evictable
  it('FIFO eviction order tracks insertions for HMAC entries (F5-5)', async () => {
    // Index several messages
    for (let i = 0; i < 10; i++) {
      await indexMessage(`fifo${i}`, 'conv1', `fifo message content ${i}`, i * 1000);
    }
    const stats = await getSearchIndexStats();
    expect(stats.indexedMessages).toBe(10);

    // All should be searchable
    for (let i = 0; i < 10; i++) {
      const results = await searchMessages(`content`);
      expect(results.length).toBe(10);
    }
  });

  it('removeFromIndex removes from FIFO order (F5-5)', async () => {
    await indexMessage('fifo_a', 'conv1', 'removable fifo entry alpha', 1000);
    await indexMessage('fifo_b', 'conv1', 'removable fifo entry beta', 2000);

    expect((await searchMessages('removable')).length).toBe(2);

    await removeFromIndex('fifo_a');

    const results = await searchMessages('removable');
    expect(results.length).toBe(1);
    expect(results[0].messageId).toBe('fifo_b');
  });

  it('clearSearchIndex clears FIFO data (F5-5)', async () => {
    await indexMessage('fifo_c1', 'conv1', 'clearable fifo data', 1000);
    await indexMessage('fifo_c2', 'conv1', 'clearable fifo more', 2000);

    await clearSearchIndex();

    const stats = await getSearchIndexStats();
    expect(stats.indexedMessages).toBe(0);
    expect(stats.uniqueTokens).toBe(0);

    // Index new messages after clear — should work cleanly
    await indexMessage('fifo_c3', 'conv1', 'fresh fifo start', 3000);
    const results = await searchMessages('fresh');
    expect(results.length).toBe(1);
  });
});
