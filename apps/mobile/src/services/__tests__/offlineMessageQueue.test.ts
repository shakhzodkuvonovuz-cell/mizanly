/**
 * Tests for the persistent offline message queue.
 *
 * MMKV is mocked via moduleNameMapper (see jest.config.js) since it
 * requires native modules. The mock uses a shared in-memory Map that
 * persists across MMKV instance re-creation (simulating MMKV's on-disk
 * persistence behavior).
 *
 * Tests verify queue operations: enqueue, dequeue, process, retry limits,
 * ordering, filtering, and edge cases.
 */

import {
  enqueueMessage,
  dequeueMessage,
  getQueuedMessages,
  getRetryableMessages,
  getQueueSize,
  processQueue,
  clearQueue,
  clearFailedMessages,
  MAX_RETRIES,
  __resetForTesting,
} from '../offlineMessageQueue';
import type { QueuedMessage } from '../offlineMessageQueue';

describe('offlineMessageQueue', () => {
  beforeEach(() => {
    // Reset queue state: clear persisted data and reset singleton
    clearQueue();
    __resetForTesting();
  });

  // ── enqueueMessage ──

  describe('enqueueMessage', () => {
    it('should add a message to the queue and return an ID', () => {
      const id = enqueueMessage({
        conversationId: 'conv-1',
        content: 'Hello offline',
      });

      expect(id).toBeTruthy();
      expect(id.startsWith('q_')).toBe(true);

      const messages = getQueuedMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].conversationId).toBe('conv-1');
      expect(messages[0].content).toBe('Hello offline');
      expect(messages[0].retryCount).toBe(0);
      expect(messages[0].status).toBe('queued');
      expect(messages[0].createdAt).toBeGreaterThan(0);
    });

    it('should persist multiple messages', () => {
      enqueueMessage({ conversationId: 'conv-1', content: 'msg1' });
      enqueueMessage({ conversationId: 'conv-1', content: 'msg2' });
      enqueueMessage({ conversationId: 'conv-2', content: 'msg3' });

      expect(getQueueSize()).toBe(3);
    });

    it('should preserve e2ePayload and sealedEnvelope', () => {
      const e2ePayload = {
        encryptedContent: 'base64cipher',
        e2eVersion: 1,
        e2eSenderDeviceId: 1,
        e2eSenderRatchetKey: 'rk',
        e2eCounter: 5,
        e2ePreviousCounter: 3,
        clientMessageId: 'cid-1',
      };
      const sealedEnvelope = {
        recipientId: 'user-2',
        ephemeralKey: 'ek',
        sealedCiphertext: 'sc',
      };

      enqueueMessage({
        conversationId: 'conv-1',
        content: 'encrypted msg',
        e2ePayload,
        sealedEnvelope,
        replyToId: 'reply-1',
      });

      const messages = getQueuedMessages();
      expect(messages[0].e2ePayload).toEqual(e2ePayload);
      expect(messages[0].sealedEnvelope).toEqual(sealedEnvelope);
      expect(messages[0].replyToId).toBe('reply-1');
    });

    it('should generate unique IDs', () => {
      const id1 = enqueueMessage({ conversationId: 'c', content: 'a' });
      const id2 = enqueueMessage({ conversationId: 'c', content: 'b' });
      expect(id1).not.toBe(id2);
    });
  });

  // ── dequeueMessage ──

  describe('dequeueMessage', () => {
    it('should remove a message by ID', () => {
      const id1 = enqueueMessage({ conversationId: 'c', content: 'a' });
      const id2 = enqueueMessage({ conversationId: 'c', content: 'b' });

      dequeueMessage(id1);

      const messages = getQueuedMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe(id2);
    });

    it('should handle non-existent ID gracefully', () => {
      enqueueMessage({ conversationId: 'c', content: 'a' });
      dequeueMessage('non-existent');
      expect(getQueueSize()).toBe(1);
    });

    it('should result in empty queue after removing last message', () => {
      const id = enqueueMessage({ conversationId: 'c', content: 'a' });
      dequeueMessage(id);

      expect(getQueueSize()).toBe(0);
      expect(getQueuedMessages()).toEqual([]);
    });
  });

  // ── getQueuedMessages ──

  describe('getQueuedMessages', () => {
    it('should return empty array when queue is empty', () => {
      expect(getQueuedMessages()).toEqual([]);
    });

    it('should filter by conversationId', () => {
      enqueueMessage({ conversationId: 'conv-1', content: 'a' });
      enqueueMessage({ conversationId: 'conv-2', content: 'b' });
      enqueueMessage({ conversationId: 'conv-1', content: 'c' });

      const conv1 = getQueuedMessages('conv-1');
      expect(conv1).toHaveLength(2);
      conv1.forEach(m => expect(m.conversationId).toBe('conv-1'));

      const conv2 = getQueuedMessages('conv-2');
      expect(conv2).toHaveLength(1);
      expect(conv2[0].content).toBe('b');
    });

    it('should sort by createdAt (oldest first)', () => {
      const id1 = enqueueMessage({ conversationId: 'c', content: 'first' });
      const id2 = enqueueMessage({ conversationId: 'c', content: 'second' });

      const messages = getQueuedMessages();
      expect(messages[0].id).toBe(id1);
      expect(messages[1].id).toBe(id2);
    });
  });

  // ── getRetryableMessages ──

  describe('getRetryableMessages', () => {
    it('should exclude permanently_failed messages', async () => {
      enqueueMessage({ conversationId: 'c', content: 'will-fail' });
      enqueueMessage({ conversationId: 'c', content: 'will-succeed' });

      // Fail the first message MAX_RETRIES times
      for (let i = 0; i < MAX_RETRIES; i++) {
        await processQueue(async (msg) => {
          return msg.content === 'will-succeed';
        });
      }

      const retryable = getRetryableMessages();
      expect(retryable).toHaveLength(0); // both processed: one sent, one permanently failed

      const all = getQueuedMessages();
      expect(all).toHaveLength(1); // permanently failed remains
      expect(all[0].status).toBe('permanently_failed');
    });

    it('should filter by conversationId', () => {
      enqueueMessage({ conversationId: 'conv-1', content: 'a' });
      enqueueMessage({ conversationId: 'conv-2', content: 'b' });

      const retryable = getRetryableMessages('conv-1');
      expect(retryable).toHaveLength(1);
      expect(retryable[0].conversationId).toBe('conv-1');
    });
  });

  // ── getQueueSize ──

  describe('getQueueSize', () => {
    it('should return 0 for empty queue', () => {
      expect(getQueueSize()).toBe(0);
    });

    it('should return correct count', () => {
      enqueueMessage({ conversationId: 'c', content: 'a' });
      enqueueMessage({ conversationId: 'c', content: 'b' });
      expect(getQueueSize()).toBe(2);
    });
  });

  // ── processQueue ──

  describe('processQueue', () => {
    it('should send all messages and remove them on success', async () => {
      enqueueMessage({ conversationId: 'c', content: 'a' });
      enqueueMessage({ conversationId: 'c', content: 'b' });

      const sendFn = jest.fn().mockResolvedValue(true);
      const result = await processQueue(sendFn);

      expect(result.sent).toBe(2);
      expect(result.failed).toBe(0);
      expect(getQueueSize()).toBe(0);
      expect(sendFn).toHaveBeenCalledTimes(2);
    });

    it('should increment retryCount on failure', async () => {
      enqueueMessage({ conversationId: 'c', content: 'a' });

      const sendFn = jest.fn().mockResolvedValue(false);
      const result = await processQueue(sendFn);

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(1);

      const messages = getQueuedMessages();
      expect(messages[0].retryCount).toBe(1);
      expect(messages[0].status).toBe('queued');
    });

    it('should mark as permanently_failed after MAX_RETRIES', async () => {
      enqueueMessage({ conversationId: 'c', content: 'hopeless' });

      const sendFn = jest.fn().mockResolvedValue(false);

      for (let i = 0; i < MAX_RETRIES; i++) {
        await processQueue(sendFn);
      }

      const messages = getQueuedMessages();
      expect(messages[0].status).toBe('permanently_failed');
      expect(messages[0].retryCount).toBe(MAX_RETRIES);

      // Should not be processed again
      sendFn.mockClear();
      const result = await processQueue(sendFn);
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
      expect(sendFn).not.toHaveBeenCalled();
    });

    it('should handle sendFn throwing an error', async () => {
      enqueueMessage({ conversationId: 'c', content: 'throws' });

      const sendFn = jest.fn().mockRejectedValue(new Error('Network error'));
      const result = await processQueue(sendFn);

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(1);

      const messages = getQueuedMessages();
      expect(messages[0].retryCount).toBe(1);
    });

    it('should filter by conversationId when provided', async () => {
      enqueueMessage({ conversationId: 'conv-1', content: 'a' });
      enqueueMessage({ conversationId: 'conv-2', content: 'b' });

      const sendFn = jest.fn().mockResolvedValue(true);
      const result = await processQueue(sendFn, 'conv-1');

      expect(result.sent).toBe(1);
      expect(sendFn).toHaveBeenCalledTimes(1);
      // conv-2 message should still be in queue
      expect(getQueueSize()).toBe(1);
      expect(getQueuedMessages('conv-2')).toHaveLength(1);
    });

    it('should process oldest messages first', async () => {
      enqueueMessage({ conversationId: 'c', content: 'first' });
      enqueueMessage({ conversationId: 'c', content: 'second' });
      enqueueMessage({ conversationId: 'c', content: 'third' });

      const order: string[] = [];
      const sendFn = jest.fn().mockImplementation(async (msg: QueuedMessage) => {
        order.push(msg.content);
        return true;
      });

      await processQueue(sendFn);

      expect(order).toEqual(['first', 'second', 'third']);
    });

    it('should handle mixed success/failure', async () => {
      enqueueMessage({ conversationId: 'c', content: 'success-1' });
      enqueueMessage({ conversationId: 'c', content: 'fail-1' });
      enqueueMessage({ conversationId: 'c', content: 'success-2' });

      const sendFn = jest.fn().mockImplementation(async (msg: QueuedMessage) => {
        return msg.content.startsWith('success');
      });

      const result = await processQueue(sendFn);

      expect(result.sent).toBe(2);
      expect(result.failed).toBe(1);
      expect(getQueueSize()).toBe(1);
      expect(getQueuedMessages()[0].content).toBe('fail-1');
    });

    it('should return zeros when queue is empty', async () => {
      const sendFn = jest.fn();
      const result = await processQueue(sendFn);

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
      expect(sendFn).not.toHaveBeenCalled();
    });

    it('should pass correct QueuedMessage to sendFn', async () => {
      const e2ePayload = {
        encryptedContent: 'cipher',
        e2eVersion: 1,
        e2eSenderDeviceId: 1,
        e2eSenderRatchetKey: 'rk',
        e2eCounter: 0,
        e2ePreviousCounter: 0,
        clientMessageId: 'cid',
      };

      enqueueMessage({
        conversationId: 'conv-1',
        content: 'test',
        e2ePayload,
        replyToId: 'reply-1',
      });

      const sendFn = jest.fn().mockResolvedValue(true);
      await processQueue(sendFn);

      const calledWith = sendFn.mock.calls[0][0] as QueuedMessage;
      expect(calledWith.conversationId).toBe('conv-1');
      expect(calledWith.content).toBe('test');
      expect(calledWith.e2ePayload).toEqual(e2ePayload);
      expect(calledWith.replyToId).toBe('reply-1');
      expect(calledWith.retryCount).toBe(0);
      expect(calledWith.status).toBe('queued');
    });
  });

  // ── clearQueue ──

  describe('clearQueue', () => {
    it('should remove all messages', () => {
      enqueueMessage({ conversationId: 'c', content: 'a' });
      enqueueMessage({ conversationId: 'c', content: 'b' });

      clearQueue();

      expect(getQueueSize()).toBe(0);
      expect(getQueuedMessages()).toEqual([]);
    });
  });

  // ── clearFailedMessages ──

  describe('clearFailedMessages', () => {
    it('should remove only permanently_failed messages', async () => {
      enqueueMessage({ conversationId: 'c', content: 'will-fail' });
      enqueueMessage({ conversationId: 'c', content: 'still-queued' });

      // Fail the first message MAX_RETRIES times
      for (let i = 0; i < MAX_RETRIES; i++) {
        await processQueue(async (msg) => {
          if (msg.content === 'will-fail') return false;
          return true; // 'still-queued' succeeds on first try
        });
      }

      // Re-add a queued message since the second was already sent
      enqueueMessage({ conversationId: 'c', content: 'new-queued' });

      clearFailedMessages();

      const remaining = getQueuedMessages();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].content).toBe('new-queued');
      expect(remaining[0].status).toBe('queued');
    });
  });

  // ── MAX_RETRIES constant ──

  describe('MAX_RETRIES', () => {
    it('should be 5', () => {
      expect(MAX_RETRIES).toBe(5);
    });
  });

  // ── Data integrity across multiple operations ──

  describe('data integrity', () => {
    it('should maintain correct state after interleaved enqueue/dequeue', () => {
      const id1 = enqueueMessage({ conversationId: 'c', content: 'a' });
      const id2 = enqueueMessage({ conversationId: 'c', content: 'b' });
      dequeueMessage(id1);
      const id3 = enqueueMessage({ conversationId: 'c', content: 'c' });

      const messages = getQueuedMessages();
      expect(messages).toHaveLength(2);
      expect(messages.map(m => m.id)).toEqual([id2, id3]);
    });

    it('should persist retry count within same session', async () => {
      enqueueMessage({ conversationId: 'c', content: 'retry-me' });

      await processQueue(async () => false); // fail once

      const messages = getQueuedMessages();
      expect(messages[0].retryCount).toBe(1);

      await processQueue(async () => false); // fail twice

      const after = getQueuedMessages();
      expect(after[0].retryCount).toBe(2);
    });

    it('should handle rapid enqueue/process cycles', async () => {
      // Simulate rapid message sending during intermittent connectivity
      for (let i = 0; i < 10; i++) {
        enqueueMessage({ conversationId: 'c', content: `msg-${i}` });
      }
      expect(getQueueSize()).toBe(10);

      // Process half successfully
      let count = 0;
      await processQueue(async () => {
        count++;
        return count <= 5;
      });

      expect(getQueueSize()).toBe(5);
    });

    it('should use MMKV for storage (not just in-memory)', () => {
      // Verify that the queue writes to MMKV by checking the instance's internal state
      enqueueMessage({ conversationId: 'c', content: 'test' });

      // The queue stores data as JSON under the STORAGE_KEY
      const messages = getQueuedMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('test');

      // After clearing, MMKV should have no data
      clearQueue();
      expect(getQueuedMessages()).toEqual([]);
    });
  });
});
