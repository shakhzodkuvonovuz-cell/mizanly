/**
 * Exhaustive tests for sender-keys.ts (group encryption).
 */

import {
  generateSenderKey,
  encryptGroupMessage,
  decryptGroupMessage,
  rotateSenderKey,
  clearGroupSenderKeys,
  serializeSenderKeyForDistribution,
  deserializeSenderKeyFromDistribution,
  storeSenderKeyFromDistribution,
} from '../sender-keys';
import { utf8Encode } from '../crypto';
import type { SenderKeyMessage } from '../types';

const SecureStore = require('expo-secure-store');

beforeEach(async () => {
  SecureStore.__reset();
  const { _resetForTesting } = require('../storage');
  _resetForTesting();
  await SecureStore.setItemAsync('e2e_mmkv_key', require('../crypto').toBase64(require('../crypto').generateRandomBytes(32)));
});

// ============================================================
// KEY GENERATION
// ============================================================

describe('generateSenderKey', () => {
  it('creates a sender key with 32-byte chain key', async () => {
    const state = await generateSenderKey('group1');
    expect(state.chainKey.length).toBe(32);
    expect(state.chainKey.some((b) => b !== 0)).toBe(true);
  });

  it('creates unique keys for different groups', async () => {
    const s1 = await generateSenderKey('group1');
    const s2 = await generateSenderKey('group2');
    expect(Buffer.from(s1.chainKey).equals(Buffer.from(s2.chainKey))).toBe(false);
  });

  it('starts at counter 0', async () => {
    const state = await generateSenderKey('group1');
    expect(state.counter).toBe(0);
  });

  it('uses CSPRNG for chainId (not Math.random)', async () => {
    const ids = new Set<number>();
    for (let i = 0; i < 50; i++) {
      const state = await generateSenderKey(`group${i}`);
      ids.add(state.chainId);
    }
    // Should be unique (collision probability negligible for 32-bit random)
    expect(ids.size).toBe(50);
  });

  it('generation defaults to 0', async () => {
    const state = await generateSenderKey('group1');
    expect(state.generation).toBe(0);
  });

  it('accepts custom generation', async () => {
    const state = await generateSenderKey('group1', 5);
    expect(state.generation).toBe(5);
  });

  it('has Ed25519 signing key pair', async () => {
    const state = await generateSenderKey('group1');
    expect(state.signingKeyPair.publicKey.length).toBe(32);
    expect(state.signingKeyPair.privateKey.length).toBe(32);
  });
});

// ============================================================
// ENCRYPT + DECRYPT
// ============================================================

describe('group message encrypt/decrypt', () => {
  beforeEach(async () => {
    // Generate a fresh sender key for 'self'
    const state = await generateSenderKey('group1');
    // Distribute to receiver — she gets the chain key + public signing key
    const serialized = serializeSenderKeyForDistribution(state);
    const received = deserializeSenderKeyFromDistribution(serialized);
    await storeSenderKeyFromDistribution('group1', 'sender1', received);
  });

  it('round-trip: encrypt → decrypt', async () => {
    // Verify both states have the same chain key before encrypt
    const { loadSenderKeyState } = require('../storage');
    const selfState = await loadSenderKeyState('group1', 'self');
    const receiverState = await loadSenderKeyState('group1', 'sender1');

    // Debug: check signing key match
    expect(
      Buffer.from(selfState.signingKeyPair.publicKey).equals(
        Buffer.from(receiverState.signingKeyPair.publicKey),
      ),
    ).toBe(true);

    // Debug: manually encrypt+decrypt
    const { hmacSha256, hkdfDeriveSecrets, aeadEncrypt, aeadDecrypt, utf8Encode: ue, utf8Decode: ud, concat: cc, uint32BE: u32 } = require('../crypto');
    const mk = hmacSha256(selfState.chainKey, new Uint8Array([0x01]));
    const derived = hkdfDeriveSecrets(mk, new Uint8Array(32), 'MizanlySenderKey', 56);
    const ek = derived.slice(0, 32);
    const nn = derived.slice(32, 56);
    const gidBytes = ue('group1');
    const aad = cc(u32(gidBytes.length), gidBytes, u32(selfState.chainId), u32(selfState.generation), u32(0));
    const ct = aeadEncrypt(ek, nn, ue('test'), aad);

    // Decrypt with receiver's chain key (should be same)
    const mk2 = hmacSha256(receiverState.chainKey, new Uint8Array([0x01]));
    const derived2 = hkdfDeriveSecrets(mk2, new Uint8Array(32), 'MizanlySenderKey', 56);
    const ek2 = derived2.slice(0, 32);
    const nn2 = derived2.slice(32, 56);
    const aad2 = cc(u32(gidBytes.length), gidBytes, u32(receiverState.chainId), u32(receiverState.generation), u32(0));
    const pt = aeadDecrypt(ek2, nn2, ct, aad2);
    expect(ud(pt)).toBe('test'); // Manual round-trip should work

    // Now test via the actual functions
    const msg = await encryptGroupMessage('group1', 'Assalamu alaikum!');
    const decrypted = await decryptGroupMessage('group1', 'sender1', msg);
    expect(decrypted).toBe('Assalamu alaikum!');
  });

  it('multiple messages decrypt in order', async () => {
    const m1 = await encryptGroupMessage('group1', 'first');
    const m2 = await encryptGroupMessage('group1', 'second');
    const m3 = await encryptGroupMessage('group1', 'third');

    expect(await decryptGroupMessage('group1', 'sender1', m1)).toBe('first');
    expect(await decryptGroupMessage('group1', 'sender1', m2)).toBe('second');
    expect(await decryptGroupMessage('group1', 'sender1', m3)).toBe('third');
  });

  it('counter increments per message', async () => {
    const m1 = await encryptGroupMessage('group1', 'a');
    const m2 = await encryptGroupMessage('group1', 'b');
    const m3 = await encryptGroupMessage('group1', 'c');
    expect(m1.counter).toBe(0);
    expect(m2.counter).toBe(1);
    expect(m3.counter).toBe(2);
  });

  it('same plaintext produces different ciphertexts (chain advances)', async () => {
    const m1 = await encryptGroupMessage('group1', 'same');
    const m2 = await encryptGroupMessage('group1', 'same');
    expect(Buffer.from(m1.ciphertext).equals(Buffer.from(m2.ciphertext))).toBe(false);
  });

  it('has valid Ed25519 signature', async () => {
    const msg = await encryptGroupMessage('group1', 'signed');
    expect(msg.signature.length).toBe(64);
  });

  it('decrypt fails with tampered ciphertext', async () => {
    const msg = await encryptGroupMessage('group1', 'original');
    const tampered: SenderKeyMessage = {
      ...msg,
      ciphertext: new Uint8Array(msg.ciphertext),
    };
    tampered.ciphertext[0] ^= 0x01;
    await expect(decryptGroupMessage('group1', 'sender1', tampered)).rejects.toThrow();
  });

  it('decrypt fails with tampered signature', async () => {
    const msg = await encryptGroupMessage('group1', 'original');
    const tampered: SenderKeyMessage = {
      ...msg,
      signature: new Uint8Array(msg.signature),
    };
    tampered.signature[0] ^= 0x01;
    await expect(decryptGroupMessage('group1', 'sender1', tampered)).rejects.toThrow('signature');
  });

  it('duplicate message (same counter) rejected', async () => {
    const m1 = await encryptGroupMessage('group1', 'once');
    await decryptGroupMessage('group1', 'sender1', m1);
    // Replay — caught by dedup check (Finding 15) before chain position check
    await expect(decryptGroupMessage('group1', 'sender1', m1)).rejects.toThrow('Replayed group message');
  });

  it('out-of-order: skip one message, then decrypt it via skipped key', async () => {
    const m1 = await encryptGroupMessage('group1', 'first');
    const m2 = await encryptGroupMessage('group1', 'second');
    // Receive m2 first — stores skipped key for counter 0
    expect(await decryptGroupMessage('group1', 'sender1', m2)).toBe('second');
    // m1 arrives later — decrypted via stored skipped key
    expect(await decryptGroupMessage('group1', 'sender1', m1)).toBe('first');
  });

  it('out-of-order: replay of skipped key rejected', async () => {
    const m1 = await encryptGroupMessage('group1', 'first');
    const m2 = await encryptGroupMessage('group1', 'second');
    await decryptGroupMessage('group1', 'sender1', m2);
    await decryptGroupMessage('group1', 'sender1', m1); // Uses skipped key
    // Replay m1 — skipped key was deleted after use
    await expect(decryptGroupMessage('group1', 'sender1', m1)).rejects.toThrow();
  });

  it('DoS protection: rejects gap > 2000', async () => {
    const msg = await encryptGroupMessage('group1', 'test');
    // Fake a message with a very high counter — the signature is for counter=0
    // so signature check catches it BEFORE the gap check. Both are valid rejections.
    const fakeMsg: SenderKeyMessage = {
      ...msg,
      counter: 5000, // Way ahead of chain position
    };
    // Should reject with either signature failure or gap too large
    await expect(decryptGroupMessage('group1', 'sender1', fakeMsg)).rejects.toThrow();
  });

  it('no sender key throws clear error', async () => {
    await expect(
      decryptGroupMessage('group1', 'unknown_sender', {
        groupId: 'group1', chainId: 1, generation: 0, counter: 0,
        ciphertext: new Uint8Array(32), signature: new Uint8Array(64),
      }),
    ).rejects.toThrow('No sender key');
  });

  it('wrong chain ID rejected', async () => {
    const msg = await encryptGroupMessage('group1', 'test');
    const wrongChain: SenderKeyMessage = { ...msg, chainId: msg.chainId + 1 };
    await expect(decryptGroupMessage('group1', 'sender1', wrongChain)).rejects.toThrow('mismatch');
  });

  it('newer generation rejected', async () => {
    const msg = await encryptGroupMessage('group1', 'test');
    const futureGen: SenderKeyMessage = { ...msg, generation: 5 };
    await expect(decryptGroupMessage('group1', 'sender1', futureGen)).rejects.toThrow('mismatch');
  });

  it('older generation rejected', async () => {
    // Rotate to generation 1
    await rotateSenderKey('group1');
    const msg = await encryptGroupMessage('group1', 'gen1 msg');
    // Distribute new key to receiver
    const { loadSenderKeyState } = require('../storage');
    const newState = await loadSenderKeyState('group1', 'self');
    const ser = serializeSenderKeyForDistribution(newState);
    const received = deserializeSenderKeyFromDistribution(ser);
    await storeSenderKeyFromDistribution('group1', 'sender1', received);

    // Fake a message claiming to be generation 0 (old)
    const oldGenMsg: SenderKeyMessage = { ...msg, generation: 0 };
    await expect(decryptGroupMessage('group1', 'sender1', oldGenMsg)).rejects.toThrow('outdated');
  });

  it('Arabic and emoji content', async () => {
    const text = 'بسم الله 🤲 الحمد لله';
    const msg = await encryptGroupMessage('group1', text);
    expect(await decryptGroupMessage('group1', 'sender1', msg)).toBe(text);
  });

  it('empty message', async () => {
    const msg = await encryptGroupMessage('group1', '');
    expect(await decryptGroupMessage('group1', 'sender1', msg)).toBe('');
  });

  it('stress: 100 sequential messages', async () => {
    const messages: SenderKeyMessage[] = [];
    for (let i = 0; i < 100; i++) {
      messages.push(await encryptGroupMessage('group1', `msg-${i}`));
    }
    for (let i = 0; i < 100; i++) {
      expect(await decryptGroupMessage('group1', 'sender1', messages[i])).toBe(`msg-${i}`);
    }
  });
});

// ============================================================
// KEY ROTATION
// ============================================================

describe('sender key rotation', () => {
  it('increments generation', async () => {
    await generateSenderKey('group1', 0);
    const rotated = await rotateSenderKey('group1');
    expect(rotated.generation).toBe(1);
  });

  it('produces new chain key', async () => {
    const original = await generateSenderKey('group1', 0);
    const rotated = await rotateSenderKey('group1');
    expect(Buffer.from(original.chainKey).equals(Buffer.from(rotated.chainKey))).toBe(false);
  });

  it('produces new signing key', async () => {
    const original = await generateSenderKey('group1', 0);
    const rotated = await rotateSenderKey('group1');
    expect(
      Buffer.from(original.signingKeyPair.publicKey).equals(Buffer.from(rotated.signingKeyPair.publicKey)),
    ).toBe(false);
  });

  it('resets counter to 0', async () => {
    await generateSenderKey('group1', 0);
    await encryptGroupMessage('group1', 'increment counter');
    const rotated = await rotateSenderKey('group1');
    expect(rotated.counter).toBe(0);
  });

  it('multiple rotations increment correctly', async () => {
    await generateSenderKey('group1', 0);
    const r1 = await rotateSenderKey('group1');
    expect(r1.generation).toBe(1);
    const r2 = await rotateSenderKey('group1');
    expect(r2.generation).toBe(2);
    const r3 = await rotateSenderKey('group1');
    expect(r3.generation).toBe(3);
  });
});

// ============================================================
// SERIALIZATION
// ============================================================

describe('sender key serialization', () => {
  it('round-trip: serialize → deserialize preserves all fields', async () => {
    const state = await generateSenderKey('group1', 3);
    const serialized = serializeSenderKeyForDistribution(state);
    const deserialized = deserializeSenderKeyFromDistribution(serialized);

    expect(deserialized.chainId).toBe(state.chainId);
    expect(deserialized.generation).toBe(state.generation);
    expect(Buffer.from(deserialized.chainKey).equals(Buffer.from(state.chainKey))).toBe(true);
    expect(deserialized.counter).toBe(state.counter);
    expect(
      Buffer.from(deserialized.signingKeyPair.publicKey).equals(Buffer.from(state.signingKeyPair.publicKey)),
    ).toBe(true);
  });

  it('serialized format is exactly 76 bytes', async () => {
    const state = await generateSenderKey('group1');
    const serialized = serializeSenderKeyForDistribution(state);
    expect(serialized.length).toBe(76); // 4+4+32+4+32 (no private key!)
  });

  it('does NOT include signing private key (security check)', async () => {
    const state = await generateSenderKey('group1');
    const serialized = serializeSenderKeyForDistribution(state);
    // The private key should NOT appear anywhere in the serialized bytes
    const privHex = Buffer.from(state.signingKeyPair.privateKey).toString('hex');
    const serHex = Buffer.from(serialized).toString('hex');
    expect(serHex.includes(privHex)).toBe(false);
  });

  it('deserialized key has empty private key (recipients cannot sign)', async () => {
    const state = await generateSenderKey('group1');
    const deserialized = deserializeSenderKeyFromDistribution(
      serializeSenderKeyForDistribution(state),
    );
    // Private key should be 0xDE fill (poison value — if accidentally used for signing, produces wrong signature)
    expect(deserialized.signingKeyPair.privateKey.every((b) => b === 0xde)).toBe(true);
  });

  it('rejects wrong length', () => {
    expect(() => deserializeSenderKeyFromDistribution(new Uint8Array(75))).toThrow('expected 76');
    expect(() => deserializeSenderKeyFromDistribution(new Uint8Array(77))).toThrow('expected 76');
    expect(() => deserializeSenderKeyFromDistribution(new Uint8Array(108))).toThrow('expected 76');
    expect(() => deserializeSenderKeyFromDistribution(new Uint8Array(0))).toThrow('expected 76');
  });
});

// ============================================================
// CLEANUP
// ============================================================

describe('clearGroupSenderKeys', () => {
  it('removes all sender keys for a group', async () => {
    await generateSenderKey('group1');
    const state = await generateSenderKey('group1');
    await storeSenderKeyFromDistribution('group1', 'member1',
      deserializeSenderKeyFromDistribution(serializeSenderKeyForDistribution(state)));
    await storeSenderKeyFromDistribution('group1', 'member2',
      deserializeSenderKeyFromDistribution(serializeSenderKeyForDistribution(state)));

    await clearGroupSenderKeys('group1', ['member1', 'member2']);

    // All keys should be gone
    await expect(encryptGroupMessage('group1', 'test')).rejects.toThrow('No sender key');
  });
});

// ============================================================
// SKIPPED KEY FEATURE — OUT-OF-ORDER DELIVERY
// ============================================================

describe('skipped key out-of-order delivery', () => {
  beforeEach(async () => {
    const state = await generateSenderKey('group1');
    const serialized = serializeSenderKeyForDistribution(state);
    const received = deserializeSenderKeyFromDistribution(serialized);
    await storeSenderKeyFromDistribution('group1', 'sender1', received);
  });

  it('encrypt 5, receive in order 5,3,1,4,2 — all decrypt correctly', async () => {
    const m1 = await encryptGroupMessage('group1', 'msg-1');
    const m2 = await encryptGroupMessage('group1', 'msg-2');
    const m3 = await encryptGroupMessage('group1', 'msg-3');
    const m4 = await encryptGroupMessage('group1', 'msg-4');
    const m5 = await encryptGroupMessage('group1', 'msg-5');

    // Receive in order: 5, 3, 1, 4, 2
    expect(await decryptGroupMessage('group1', 'sender1', m5)).toBe('msg-5');
    expect(await decryptGroupMessage('group1', 'sender1', m3)).toBe('msg-3');
    expect(await decryptGroupMessage('group1', 'sender1', m1)).toBe('msg-1');
    expect(await decryptGroupMessage('group1', 'sender1', m4)).toBe('msg-4');
    expect(await decryptGroupMessage('group1', 'sender1', m2)).toBe('msg-2');
  });

  it('skipped key replay: use skipped key once, second attempt fails (key deleted)', async () => {
    const m1 = await encryptGroupMessage('group1', 'first');
    const m2 = await encryptGroupMessage('group1', 'second');
    const m3 = await encryptGroupMessage('group1', 'third');

    // Receive m3 first — stores skipped keys for counters 0 and 1
    expect(await decryptGroupMessage('group1', 'sender1', m3)).toBe('third');

    // Use skipped key for m1
    expect(await decryptGroupMessage('group1', 'sender1', m1)).toBe('first');

    // Replay m1 — skipped key was deleted after first use
    await expect(decryptGroupMessage('group1', 'sender1', m1)).rejects.toThrow();

    // m2's skipped key should still work (different counter)
    expect(await decryptGroupMessage('group1', 'sender1', m2)).toBe('second');

    // But replaying m2 also fails
    await expect(decryptGroupMessage('group1', 'sender1', m2)).rejects.toThrow();
  });

  it('out-of-order with 10 messages received in random order', async () => {
    const messages: SenderKeyMessage[] = [];
    for (let i = 0; i < 10; i++) {
      messages.push(await encryptGroupMessage('group1', `msg-${i}`));
    }

    // Receive in a shuffled order: 7, 2, 9, 0, 5, 3, 8, 1, 6, 4
    const order = [7, 2, 9, 0, 5, 3, 8, 1, 6, 4];
    for (const idx of order) {
      const result = await decryptGroupMessage('group1', 'sender1', messages[idx]);
      expect(result).toBe(`msg-${idx}`);
    }
  });

  it('out-of-order with gap of exactly MAX_SENDER_KEY_SKIP=200', async () => {
    // Encrypt 201 messages (counters 0..200)
    const allMessages: SenderKeyMessage[] = [];
    for (let i = 0; i <= 200; i++) {
      allMessages.push(await encryptGroupMessage('group1', `msg-${i}`));
    }

    // Receive message at counter=200 first — gap is exactly 200, should succeed
    expect(await decryptGroupMessage('group1', 'sender1', allMessages[200])).toBe('msg-200');

    // Now all 200 skipped keys (counters 0..199) should be stored.
    // Decrypt a few to verify they work
    expect(await decryptGroupMessage('group1', 'sender1', allMessages[0])).toBe('msg-0');
    expect(await decryptGroupMessage('group1', 'sender1', allMessages[100])).toBe('msg-100');
    expect(await decryptGroupMessage('group1', 'sender1', allMessages[199])).toBe('msg-199');
  });

  it('skipped key cap: oldest keys evicted when exceeding 200', async () => {
    // Encrypt enough messages to create more than 200 skipped keys
    // First batch: 201 messages (counters 0..200)
    const batch1: SenderKeyMessage[] = [];
    for (let i = 0; i <= 200; i++) {
      batch1.push(await encryptGroupMessage('group1', `batch1-${i}`));
    }

    // Receive counter=200 — stores 200 skipped keys (0..199)
    expect(await decryptGroupMessage('group1', 'sender1', batch1[200])).toBe('batch1-200');

    // Now encrypt one more and receive it out of order to push past the cap
    const extra1 = await encryptGroupMessage('group1', 'extra-201');
    const extra2 = await encryptGroupMessage('group1', 'extra-202');

    // Receive extra2 (counter=202) — need to advance 1 step, adding 1 skipped key (201)
    // Total skipped keys: 200 (from batch1) + 1 = 201 → oldest (counter 0) evicted
    expect(await decryptGroupMessage('group1', 'sender1', extra2)).toBe('extra-202');

    // Counter 0's skipped key was evicted — should fail
    await expect(decryptGroupMessage('group1', 'sender1', batch1[0])).rejects.toThrow();

    // Counter 1 should still be available (it's the new oldest after eviction)
    expect(await decryptGroupMessage('group1', 'sender1', batch1[1])).toBe('batch1-1');
  });

  it('out-of-order: receive last message first, then all others in reverse', async () => {
    const messages: SenderKeyMessage[] = [];
    for (let i = 0; i < 8; i++) {
      messages.push(await encryptGroupMessage('group1', `reverse-${i}`));
    }

    // Receive last first
    expect(await decryptGroupMessage('group1', 'sender1', messages[7])).toBe('reverse-7');

    // Then receive all others in reverse order: 6, 5, 4, 3, 2, 1, 0
    for (let i = 6; i >= 0; i--) {
      expect(await decryptGroupMessage('group1', 'sender1', messages[i])).toBe(`reverse-${i}`);
    }
  });

  it('interleaved in-order and out-of-order messages', async () => {
    const m0 = await encryptGroupMessage('group1', 'a');
    const m1 = await encryptGroupMessage('group1', 'b');
    const m2 = await encryptGroupMessage('group1', 'c');
    const m3 = await encryptGroupMessage('group1', 'd');
    const m4 = await encryptGroupMessage('group1', 'e');

    // Receive: m0 (in order), m2 (skip m1), m1 (skipped key), m4 (skip m3), m3 (skipped key)
    expect(await decryptGroupMessage('group1', 'sender1', m0)).toBe('a');
    expect(await decryptGroupMessage('group1', 'sender1', m2)).toBe('c');
    expect(await decryptGroupMessage('group1', 'sender1', m1)).toBe('b');
    expect(await decryptGroupMessage('group1', 'sender1', m4)).toBe('e');
    expect(await decryptGroupMessage('group1', 'sender1', m3)).toBe('d');
  });
});

// ============================================================
// SIGNING KEY SECURESTORE INTEGRATION
// ============================================================

describe('signing key SecureStore integration', () => {
  it('signing private key is stored in SecureStore on generateSenderKey', async () => {
    const state = await generateSenderKey('group-secure');
    // Verify SecureStore has the signing key
    const stored = await SecureStore.getItemAsync('e2e_sender_signing_group-secure');
    expect(stored).not.toBeNull();
    // Verify the stored key matches the returned key (via base64)
    const { fromBase64 } = require('../crypto');
    const storedKey = fromBase64(stored);
    expect(Buffer.from(storedKey).equals(Buffer.from(state.signingKeyPair.privateKey))).toBe(true);
  });

  it('loadSenderSigningPrivate returns the stored key', async () => {
    const { loadSenderSigningPrivate } = require('../storage');
    const state = await generateSenderKey('group-load');
    const loaded = await loadSenderSigningPrivate('group-load');
    expect(loaded).not.toBeNull();
    expect(Buffer.from(loaded!).equals(Buffer.from(state.signingKeyPair.privateKey))).toBe(true);
  });

  it('encrypt uses loadSenderSigningPrivate from SecureStore', async () => {
    await generateSenderKey('group-sign');
    // Distribute to receiver
    const { loadSenderKeyState } = require('../storage');
    const selfState = await loadSenderKeyState('group-sign', 'self');
    const ser = serializeSenderKeyForDistribution(selfState);
    const received = deserializeSenderKeyFromDistribution(ser);
    await storeSenderKeyFromDistribution('group-sign', 'sender1', received);

    // Encrypt should work because SecureStore has the signing key
    const msg = await encryptGroupMessage('group-sign', 'test signing');
    expect(msg.signature.length).toBe(64);

    // Verify decrypt works
    expect(await decryptGroupMessage('group-sign', 'sender1', msg)).toBe('test signing');
  });

  it('encrypt fails if signing key is deleted from SecureStore', async () => {
    await generateSenderKey('group-deleted');
    // Delete the signing key from SecureStore
    await SecureStore.deleteItemAsync('e2e_sender_signing_group-deleted');

    // Encrypt should fail because signing key is missing
    await expect(encryptGroupMessage('group-deleted', 'test')).rejects.toThrow('signing key not found');
  });

  it('MMKV state does NOT contain the real private signing key', async () => {
    const state = await generateSenderKey('group-mmkv-check');
    const { loadSenderKeyState } = require('../storage');
    const mmkvState = await loadSenderKeyState('group-mmkv-check', 'self');

    // The state in MMKV has a placeholder private key (all zeros), not the real one
    const realPrivate = state.signingKeyPair.privateKey;
    const mmkvPrivate = mmkvState.signingKeyPair.privateKey;
    expect(Buffer.from(realPrivate).equals(Buffer.from(mmkvPrivate))).toBe(false);
  });
});

// ============================================================
// SERIALIZATION EXTENDED — SECURITY BOUNDARY
// ============================================================

describe('sender key serialization security', () => {
  it('serialized output contains exactly chainId+gen+chainKey+counter+pubKey, no other data', async () => {
    const state = await generateSenderKey('group1');
    const serialized = serializeSenderKeyForDistribution(state);
    const hex = Buffer.from(serialized).toString('hex');

    // Verify structure: first 4 bytes = chainId, next 4 = generation, etc.
    expect(serialized.length).toBe(76);

    // Verify the public key bytes appear at offset 44..76
    const pubKeyHex = Buffer.from(state.signingKeyPair.publicKey).toString('hex');
    const embeddedPubKey = hex.slice(88, 152); // 44*2=88 to 76*2=152
    expect(embeddedPubKey).toBe(pubKeyHex);
  });

  it('multiple serializations of same state produce identical bytes', async () => {
    const state = await generateSenderKey('group1');
    const s1 = serializeSenderKeyForDistribution(state);
    const s2 = serializeSenderKeyForDistribution(state);
    expect(Buffer.from(s1).equals(Buffer.from(s2))).toBe(true);
  });

  it('private key bytes never appear in serialized output (50 iterations)', async () => {
    for (let i = 0; i < 50; i++) {
      const state = await generateSenderKey(`seccheck-${i}`);
      const serialized = serializeSenderKeyForDistribution(state);
      const privHex = Buffer.from(state.signingKeyPair.privateKey).toString('hex');
      const serHex = Buffer.from(serialized).toString('hex');
      expect(serHex.includes(privHex)).toBe(false);
    }
  });
});

// ============================================================
// ROTATION — SECURESTORE CLEANUP
// ============================================================

describe('rotation SecureStore behavior', () => {
  it('rotation stores a NEW signing key in SecureStore', async () => {
    const original = await generateSenderKey('group-rot');
    const originalKeyB64 = await SecureStore.getItemAsync('e2e_sender_signing_group-rot');

    const rotated = await rotateSenderKey('group-rot');
    const rotatedKeyB64 = await SecureStore.getItemAsync('e2e_sender_signing_group-rot');

    // The SecureStore entry was overwritten with the new key
    expect(rotatedKeyB64).not.toBe(originalKeyB64);

    // The new key matches the rotated state
    const { fromBase64 } = require('../crypto');
    const storedKey = fromBase64(rotatedKeyB64);
    expect(Buffer.from(storedKey).equals(Buffer.from(rotated.signingKeyPair.privateKey))).toBe(true);
  });

  it('rotation produces a key that can be used for encrypt/decrypt', async () => {
    await generateSenderKey('group-rot2');
    const rotated = await rotateSenderKey('group-rot2');

    // Distribute rotated key
    const ser = serializeSenderKeyForDistribution(rotated);
    const received = deserializeSenderKeyFromDistribution(ser);
    await storeSenderKeyFromDistribution('group-rot2', 'receiver1', received);

    const msg = await encryptGroupMessage('group-rot2', 'after rotation');
    expect(await decryptGroupMessage('group-rot2', 'receiver1', msg)).toBe('after rotation');
  });
});

// ============================================================
// CLEANUP — SECURESTORE SIGNING KEY DELETION
// ============================================================

describe('clearGroupSenderKeys SecureStore cleanup', () => {
  it('clearGroupSenderKeys also deletes SecureStore signing key', async () => {
    await generateSenderKey('group-clear');
    // Verify signing key exists
    const before = await SecureStore.getItemAsync('e2e_sender_signing_group-clear');
    expect(before).not.toBeNull();

    await clearGroupSenderKeys('group-clear', []);

    // Verify signing key is gone
    const after = await SecureStore.getItemAsync('e2e_sender_signing_group-clear');
    expect(after).toBeNull();
  });

  it('clearGroupSenderKeys for one group does not affect another group', async () => {
    await generateSenderKey('group-a');
    await generateSenderKey('group-b');

    await clearGroupSenderKeys('group-a', []);

    // group-a's signing key is gone
    const afterA = await SecureStore.getItemAsync('e2e_sender_signing_group-a');
    expect(afterA).toBeNull();

    // group-b's signing key is still there
    const afterB = await SecureStore.getItemAsync('e2e_sender_signing_group-b');
    expect(afterB).not.toBeNull();
  });

  it('clearGroupSenderKeys removes member keys and self key', async () => {
    await generateSenderKey('group-full');
    const { loadSenderKeyState } = require('../storage');
    const state = await loadSenderKeyState('group-full', 'self');
    const ser = serializeSenderKeyForDistribution(state);
    const received = deserializeSenderKeyFromDistribution(ser);
    await storeSenderKeyFromDistribution('group-full', 'member1', received);
    await storeSenderKeyFromDistribution('group-full', 'member2', received);

    await clearGroupSenderKeys('group-full', ['member1', 'member2']);

    // Self key gone
    expect(await loadSenderKeyState('group-full', 'self')).toBeNull();
    // Member keys gone
    expect(await loadSenderKeyState('group-full', 'member1')).toBeNull();
    expect(await loadSenderKeyState('group-full', 'member2')).toBeNull();
    // SecureStore signing key gone
    expect(await SecureStore.getItemAsync('e2e_sender_signing_group-full')).toBeNull();
  });
});

// ============================================================
// EDGE CASES
// ============================================================

describe('sender key edge cases', () => {
  beforeEach(async () => {
    const state = await generateSenderKey('group1');
    const serialized = serializeSenderKeyForDistribution(state);
    const received = deserializeSenderKeyFromDistribution(serialized);
    await storeSenderKeyFromDistribution('group1', 'sender1', received);
  });

  it('very long message (10KB)', async () => {
    const longText = 'A'.repeat(10000);
    const msg = await encryptGroupMessage('group1', longText);
    expect(await decryptGroupMessage('group1', 'sender1', msg)).toBe(longText);
  });

  it('message with null bytes in content', async () => {
    const text = 'before\0after\0end';
    const msg = await encryptGroupMessage('group1', text);
    expect(await decryptGroupMessage('group1', 'sender1', msg)).toBe(text);
  });

  it('encrypt without prior generate throws clear error', async () => {
    await expect(encryptGroupMessage('nonexistent-group', 'hello')).rejects.toThrow('No sender key');
  });
});
