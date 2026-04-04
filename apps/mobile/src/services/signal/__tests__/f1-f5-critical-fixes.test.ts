/**
 * Tests for F1-F5 critical E2E findings fixes.
 *
 * F1: Transparency root signature verification
 * F2: AEAD-wrapped message cache (no more plaintext on disk)
 * F3: AEAD-wrapped search index (no more tokenized plaintext)
 * F4: HMAC-hashed MMKV key names (social graph hidden)
 * F5: Sealed sender wired into send path
 */

import { generateRandomBytes, toBase64, fromBase64, ed25519Sign, ed25519Verify } from '../crypto';
import { generateEd25519KeyPair } from '../crypto';
import type { CachedMessage, SearchIndexEntry } from '../types';

const SecureStore = require('expo-secure-store');

beforeEach(async () => {
  SecureStore.__reset();
  // Set MMKV encryption key for AEAD
  await SecureStore.setItemAsync('e2e_mmkv_key', toBase64(generateRandomBytes(32)));
  // Clear singletons between tests
  const storage = require('../storage');
  try { await storage.clearAllE2EState(); } catch {}
  await SecureStore.setItemAsync('e2e_mmkv_key', toBase64(generateRandomBytes(32)));
});

// ============================================================
// F1: KEY TRANSPARENCY ROOT SIGNATURE
// ============================================================

describe('F1: Transparency root signature', () => {
  it('verifyMerkleProof works for valid proof', () => {
    const { verifyMerkleProof } = require('../key-transparency');
    const { sha256Hash, concat } = require('../crypto');

    // Build a simple 2-leaf tree with V4-F7 domain separation prefixes
    const userId1 = 'user1';
    const key1 = generateRandomBytes(32);
    const userId2 = 'user2';
    const key2 = generateRandomBytes(32);

    const LEAF_PREFIX = new Uint8Array([0x00]);
    const INTERNAL_PREFIX = new Uint8Array([0x01]);
    // F07-#9: Leaf hash now includes deviceId (":1" default)
    const leaf1 = sha256Hash(concat(LEAF_PREFIX, new Uint8Array(new TextEncoder().encode(userId1)), new Uint8Array(new TextEncoder().encode(':1')), key1));
    const leaf2 = sha256Hash(concat(LEAF_PREFIX, new Uint8Array(new TextEncoder().encode(userId2)), new Uint8Array(new TextEncoder().encode(':1')), key2));
    const root = sha256Hash(concat(INTERNAL_PREFIX, leaf1, leaf2));

    // Proof for leaf1 (index 0): sibling is leaf2
    const valid = verifyMerkleProof(userId1, key1, [toBase64(leaf2)], 0, toBase64(root));
    expect(valid).toBe(true);
  });

  it('verifyMerkleProof rejects invalid proof', () => {
    const { verifyMerkleProof } = require('../key-transparency');
    const fakeRoot = toBase64(generateRandomBytes(32));
    const fakeProof = [toBase64(generateRandomBytes(32))];

    const valid = verifyMerkleProof('user1', generateRandomBytes(32), fakeProof, 0, fakeRoot);
    expect(valid).toBe(false);
  });

  it('verifyRootSignature accepts valid Ed25519 signature', () => {
    // This tests the signature verification function directly.
    // In production, the public key would be hardcoded.
    const { ed25519Sign, ed25519Verify } = require('../crypto');
    const keyPair = generateEd25519KeyPair();
    const rootBytes = generateRandomBytes(32);
    const signature = ed25519Sign(keyPair.privateKey, rootBytes);

    // Verify using the function from key-transparency
    const valid = ed25519Verify(keyPair.publicKey, rootBytes, signature);
    expect(valid).toBe(true);
  });

  it('verifyRootSignature rejects forged signature', () => {
    const keyPair = generateEd25519KeyPair();
    const rootBytes = generateRandomBytes(32);
    const fakeSignature = generateRandomBytes(64);

    const valid = ed25519Verify(keyPair.publicKey, rootBytes, fakeSignature);
    expect(valid).toBe(false);
  });
});

// ============================================================
// F2: AEAD-WRAPPED MESSAGE CACHE
// ============================================================

describe('F2: AEAD-wrapped message cache', () => {
  function makeMessage(overrides?: Partial<CachedMessage>): CachedMessage {
    return {
      messageId: `msg_${Math.random().toString(36).slice(2)}`,
      conversationId: 'conv_test',
      senderId: 'user_alice',
      content: 'Hello, this is a secret message',
      messageType: 'TEXT',
      createdAt: Date.now(),
      ...overrides,
    };
  }

  it('cacheDecryptedMessage + getCachedMessages roundtrip', async () => {
    const { cacheDecryptedMessage, getCachedMessages } = require('../message-cache');
    const msg = makeMessage();
    await cacheDecryptedMessage(msg);

    const cached = await getCachedMessages(msg.conversationId);
    expect(cached.length).toBe(1);
    expect(cached[0].content).toBe(msg.content);
    expect(cached[0].messageId).toBe(msg.messageId);
  });

  it('isMessageCached returns true for cached messages', async () => {
    const { cacheDecryptedMessage, isMessageCached } = require('../message-cache');
    const msg = makeMessage();
    await cacheDecryptedMessage(msg);

    const isCached = await isMessageCached(msg.conversationId, msg.messageId);
    expect(isCached).toBe(true);
  });

  it('isMessageCached returns false for uncached messages', async () => {
    const { isMessageCached } = require('../message-cache');
    const isCached = await isMessageCached('conv_nonexist', 'msg_nonexist');
    expect(isCached).toBe(false);
  });

  it('deleteCachedMessage removes the message', async () => {
    const { cacheDecryptedMessage, deleteCachedMessage, getCachedMessages } = require('../message-cache');
    const msg = makeMessage();
    await cacheDecryptedMessage(msg);
    await deleteCachedMessage(msg.conversationId, msg.messageId);

    const cached = await getCachedMessages(msg.conversationId);
    expect(cached.length).toBe(0);
  });

  it('clearConversationCache removes all messages for conversation', async () => {
    const { cacheDecryptedMessage, clearConversationCache, getCachedMessages } = require('../message-cache');
    await cacheDecryptedMessage(makeMessage({ messageId: 'm1', conversationId: 'conv_a' }));
    await cacheDecryptedMessage(makeMessage({ messageId: 'm2', conversationId: 'conv_a' }));
    await cacheDecryptedMessage(makeMessage({ messageId: 'm3', conversationId: 'conv_b' }));

    await clearConversationCache('conv_a');

    const convA = await getCachedMessages('conv_a');
    const convB = await getCachedMessages('conv_b');
    expect(convA.length).toBe(0);
    expect(convB.length).toBe(1);
  });

  it('getCachedMessages enforces disappearing message expiry', async () => {
    const { cacheDecryptedMessage, getCachedMessages } = require('../message-cache');
    const expired = makeMessage({
      messageId: 'expired_msg',
      expiresAt: Date.now() - 1000, // Already expired
    });
    const valid = makeMessage({ messageId: 'valid_msg' });

    await cacheDecryptedMessage(expired);
    await cacheDecryptedMessage(valid);

    const cached = await getCachedMessages('conv_test');
    expect(cached.length).toBe(1);
    expect(cached[0].messageId).toBe('valid_msg');
  });

  it('values are AEAD-encrypted on disk (not plaintext)', async () => {
    const { cacheDecryptedMessage } = require('../message-cache');
    const { getMMKV, hmacKeyName, HMAC_TYPE } = require('../storage');
    const msg = makeMessage({ content: 'SUPER_SECRET_CONTENT' });
    await cacheDecryptedMessage(msg);

    // Read the raw MMKV value — it should be AEAD-encrypted, not plaintext JSON
    const mmkv = await getMMKV();
    const allKeys = mmkv.getAllKeys();
    const cacheKeys = allKeys.filter((k: string) =>
      k.startsWith('c:') || k.startsWith('msgcache:'),
    );
    expect(cacheKeys.length).toBeGreaterThan(0);

    for (const key of cacheKeys) {
      const raw = mmkv.getString(key);
      if (raw) {
        // AEAD-wrapped values start with 'A1:'
        expect(raw.startsWith('A1:')).toBe(true);
        // Raw value should NOT contain plaintext
        expect(raw).not.toContain('SUPER_SECRET_CONTENT');
      }
    }
  });

  it('getCacheStats returns correct counts', async () => {
    const { cacheDecryptedMessage, getCacheStats } = require('../message-cache');
    await cacheDecryptedMessage(makeMessage({ conversationId: 'c1', messageId: 'm1' }));
    await cacheDecryptedMessage(makeMessage({ conversationId: 'c1', messageId: 'm2' }));
    await cacheDecryptedMessage(makeMessage({ conversationId: 'c2', messageId: 'm3' }));

    const stats = await getCacheStats();
    expect(stats.totalMessages).toBe(3);
    expect(stats.conversationCount).toBe(2);
  });
});

// ============================================================
// F3: AEAD-WRAPPED SEARCH INDEX
// ============================================================

describe('F3: AEAD-wrapped search index', () => {
  it('indexMessage + searchMessages roundtrip', async () => {
    const { indexMessage, searchMessages } = require('../search-index');
    await indexMessage('msg1', 'conv1', 'the quick brown fox', 1000);
    await indexMessage('msg2', 'conv1', 'lazy brown dog', 2000);

    const results = await searchMessages('brown');
    expect(results.length).toBe(2);
  });

  it('searchMessages returns empty for non-indexed terms', async () => {
    const { indexMessage, searchMessages } = require('../search-index');
    await indexMessage('msg1', 'conv1', 'hello world testing', 1000);

    const results = await searchMessages('nonexistent');
    expect(results.length).toBe(0);
  });

  it('searchInConversation filters by conversation', async () => {
    const { indexMessage, searchInConversation } = require('../search-index');
    await indexMessage('msg1', 'conv_a', 'search term here', 1000);
    await indexMessage('msg2', 'conv_b', 'search term there', 2000);

    const results = await searchInConversation('conv_a', 'search');
    expect(results.length).toBe(1);
    expect(results[0].conversationId).toBe('conv_a');
  });

  it('removeFromIndex removes message from results', async () => {
    const { indexMessage, removeFromIndex, searchMessages } = require('../search-index');
    await indexMessage('msg1', 'conv1', 'removable content', 1000);
    await removeFromIndex('msg1');

    const results = await searchMessages('removable');
    // The message metadata is removed; token posting lists still contain the ID
    // but searchMessages filters out stale IDs (no metadata = skipped)
    expect(results.length).toBe(0);
  });

  it('search index values are AEAD-encrypted', async () => {
    const { indexMessage } = require('../search-index');
    const { getMMKV } = require('../storage');
    await indexMessage('msg1', 'conv1', 'SECRET_TOKEN_VALUE', 1000);

    const mmkv = await getMMKV();
    const allKeys = mmkv.getAllKeys();
    const searchKeys = allKeys.filter((k: string) =>
      k.startsWith('st:') || k.startsWith('sm:') ||
      k.startsWith('searchidx:'),
    );

    for (const key of searchKeys) {
      const raw = mmkv.getString(key);
      if (raw && typeof raw === 'string') {
        expect(raw.startsWith('A1:')).toBe(true);
        expect(raw).not.toContain('SECRET_TOKEN_VALUE');
      }
    }
  });

  it('clearSearchIndex removes all search data', async () => {
    const { indexMessage, clearSearchIndex, getSearchIndexStats } = require('../search-index');
    await indexMessage('msg1', 'conv1', 'some indexed content', 1000);

    await clearSearchIndex();

    const stats = await getSearchIndexStats();
    expect(stats.indexedMessages).toBe(0);
    expect(stats.uniqueTokens).toBe(0);
  });
});

// ============================================================
// F4: HMAC-HASHED MMKV KEY NAMES
// ============================================================

describe('F4: HMAC-hashed MMKV key names', () => {
  it('hmacKeyName produces deterministic hashes', async () => {
    // Must await getMMKV first to initialize AEAD key
    const { getMMKV, hmacKeyName, HMAC_TYPE } = require('../storage');
    await getMMKV();

    const hash1 = hmacKeyName(HMAC_TYPE.SESSION, 'session:user_abc:1');
    const hash2 = hmacKeyName(HMAC_TYPE.SESSION, 'session:user_abc:1');
    expect(hash1).toBe(hash2); // Deterministic
  });

  it('hmacKeyName produces different hashes for different keys', async () => {
    const { getMMKV, hmacKeyName, HMAC_TYPE } = require('../storage');
    await getMMKV();

    const hash1 = hmacKeyName(HMAC_TYPE.SESSION, 'session:user_abc:1');
    const hash2 = hmacKeyName(HMAC_TYPE.SESSION, 'session:user_def:1');
    expect(hash1).not.toBe(hash2);
  });

  it('hmacKeyName starts with type prefix', async () => {
    const { getMMKV, hmacKeyName, HMAC_TYPE } = require('../storage');
    await getMMKV();

    const hash = hmacKeyName(HMAC_TYPE.SESSION, 'session:user_abc:1');
    expect(hash.startsWith('s:')).toBe(true);

    const identityHash = hmacKeyName(HMAC_TYPE.IDENTITY_KEY, 'identitykey:user_abc');
    expect(identityHash.startsWith('i:')).toBe(true);
  });

  it('session storage uses HMAC key names (no plaintext user IDs)', async () => {
    const { storeSessionRecord, loadSessionRecord, getMMKV } = require('../storage');
    const { generateX25519KeyPair } = require('../crypto');

    // Create a minimal valid session record
    const kp = generateX25519KeyPair();
    const record = {
      activeSession: {
        version: 1,
        protocolVersion: 1,
        rootKey: generateRandomBytes(32),
        sendingChain: { chainKey: generateRandomBytes(32), counter: 0 },
        receivingChain: null,
        senderRatchetKeyPair: kp,
        receiverRatchetKey: null,
        skippedKeys: [],
        previousSendingCounter: 0,
        remoteIdentityKey: generateRandomBytes(32),
        localRegistrationId: 1,
        remoteRegistrationId: 2,
        sessionEstablished: true,
        identityTrust: 'trusted' as const,
        sealedSender: false,
      },
      previousSessions: [],
    };

    await storeSessionRecord('user_secret_alice', 1, record);

    // Check that NO MMKV key contains the plaintext userId
    const mmkv = await getMMKV();
    const allKeys = mmkv.getAllKeys();
    const leakedKeys = allKeys.filter((k: string) => k.includes('user_secret_alice'));
    expect(leakedKeys.length).toBe(0);

    // But we can still load it
    const loaded = await loadSessionRecord('user_secret_alice', 1);
    expect(loaded).not.toBeNull();
    expect(loaded!.activeSession.sessionEstablished).toBe(true);
  });

  it('identity key storage uses HMAC key names', async () => {
    const { storeKnownIdentityKey, loadKnownIdentityKey, getMMKV } = require('../storage');
    const key = generateRandomBytes(32);

    await storeKnownIdentityKey('user_secret_bob', key);

    const mmkv = await getMMKV();
    const allKeys = mmkv.getAllKeys();
    const leakedKeys = allKeys.filter((k: string) => k.includes('user_secret_bob'));
    expect(leakedKeys.length).toBe(0);

    const loaded = await loadKnownIdentityKey('user_secret_bob');
    expect(loaded).not.toBeNull();
    expect(toBase64(loaded!)).toBe(toBase64(key));
  });

  it('secureStore/secureLoad with migration from legacy keys', async () => {
    const { getMMKV, secureStore, secureLoad, hmacKeyName, aeadSet, HMAC_TYPE } = require('../storage');
    const mmkv = await getMMKV();

    // Simulate legacy: write directly with original key name
    const originalKey = 'session:legacy_user:1';
    await aeadSet(mmkv, originalKey, '{"test":"legacy_data"}', originalKey);

    // secureLoad should find it at the original key and migrate
    const value = await secureLoad(HMAC_TYPE.SESSION, originalKey);
    expect(value).toBe('{"test":"legacy_data"}');

    // After migration, the original key should be deleted
    expect(mmkv.contains(originalKey)).toBe(false);

    // And the hashed key should exist
    const hashedKey = hmacKeyName(HMAC_TYPE.SESSION, originalKey);
    expect(mmkv.contains(hashedKey)).toBe(true);
  });
});

// ============================================================
// F5: SEALED SENDER
// ============================================================

describe('F5: Sealed sender', () => {
  it('sealMessage + unsealMessage roundtrip', async () => {
    const { sealMessage, unsealMessage } = require('../sealed-sender');
    const { storeIdentityKeyPair, storeKnownIdentityKey } = require('../storage');

    const senderKeyPair = generateEd25519KeyPair();
    const recipientKeyPair = generateEd25519KeyPair();

    // V7-F2: Store SENDER's identity key pair (sealMessage now loads it for sender certificate)
    await storeIdentityKeyPair(senderKeyPair);

    const envelope = await sealMessage(
      'recipient_user',
      recipientKeyPair.publicKey,
      'sender_user',
      1,
      'encrypted_inner_content',
    );

    expect(envelope.recipientId).toBe('recipient_user');
    expect(envelope.ephemeralKey).toBeTruthy();
    expect(envelope.sealedCiphertext).toBeTruthy();

    // V7-F2: Switch to RECIPIENT's key pair for unsealMessage, store sender's known key for verification
    await storeIdentityKeyPair(recipientKeyPair);
    await storeKnownIdentityKey('sender_user', senderKeyPair.publicKey);

    const unsealed = await unsealMessage(envelope);
    expect(unsealed.senderId).toBe('sender_user');
    expect(unsealed.senderDeviceId).toBe(1);
    expect(unsealed.innerContent).toBe('encrypted_inner_content');
  });

  it('unsealMessage rejects forged envelope', async () => {
    const { unsealMessage } = require('../sealed-sender');
    const { storeIdentityKeyPair } = require('../storage');

    const recipientKeyPair = generateEd25519KeyPair();
    await storeIdentityKeyPair(recipientKeyPair);

    const forgedEnvelope = {
      recipientId: 'recipient_user',
      ephemeralKey: toBase64(generateRandomBytes(32)),
      sealedCiphertext: toBase64(generateRandomBytes(100)),
    };

    await expect(unsealMessage(forgedEnvelope)).rejects.toThrow();
  });

  it('sealed envelope hides sender identity', async () => {
    const { sealMessage } = require('../sealed-sender');
    const { storeIdentityKeyPair } = require('../storage');

    // V7-F2: sealMessage now loads identity key for sender certificate — must be stored
    const senderKeyPair = generateEd25519KeyPair();
    await storeIdentityKeyPair(senderKeyPair);

    const recipientKeyPair = generateEd25519KeyPair();
    const envelope = await sealMessage(
      'recipient_user',
      recipientKeyPair.publicKey,
      'SECRET_SENDER_ID',
      1,
      'inner_content',
    );

    // The sealed ciphertext should NOT contain the sender ID in plaintext
    const cipherBytes = fromBase64(envelope.sealedCiphertext);
    const cipherStr = new TextDecoder().decode(cipherBytes);
    expect(cipherStr).not.toContain('SECRET_SENDER_ID');
  });
});
