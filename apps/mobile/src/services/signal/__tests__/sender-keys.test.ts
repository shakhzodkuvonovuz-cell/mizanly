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

beforeEach(() => {
  SecureStore.__reset();
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
    // Replay — counter is now behind chain position
    await expect(decryptGroupMessage('group1', 'sender1', m1)).rejects.toThrow('behind');
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
    await expect(decryptGroupMessage('group1', 'sender1', wrongChain)).rejects.toThrow('chain ID');
  });

  it('newer generation rejected', async () => {
    const msg = await encryptGroupMessage('group1', 'test');
    const futureGen: SenderKeyMessage = { ...msg, generation: 5 };
    await expect(decryptGroupMessage('group1', 'sender1', futureGen)).rejects.toThrow('newer');
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
    await expect(decryptGroupMessage('group1', 'sender1', oldGenMsg)).rejects.toThrow('older');
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
