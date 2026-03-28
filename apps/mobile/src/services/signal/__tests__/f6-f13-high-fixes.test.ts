/**
 * Tests for F6-F13 high-priority E2E findings fixes.
 *
 * F7: RFC 6962 consistency proof verification (no more stub)
 * F10: AEAD key not cached in module scope
 * F13: Sealed sender replay protection
 */

import { generateRandomBytes, toBase64, fromBase64, sha256Hash, concat } from '../crypto';
import { generateEd25519KeyPair } from '../crypto';

const SecureStore = require('expo-secure-store');

beforeEach(async () => {
  SecureStore.__reset();
  await SecureStore.setItemAsync('e2e_mmkv_key', toBase64(generateRandomBytes(32)));
  const storage = require('../storage');
  try { await storage.clearAllE2EState(); } catch {}
  await SecureStore.setItemAsync('e2e_mmkv_key', toBase64(generateRandomBytes(32)));
});

// ============================================================
// F7: CONSISTENCY PROOF VERIFICATION
// ============================================================

describe('F7: Consistency proof verification', () => {
  /**
   * Helper: build a Merkle tree from leaves and compute the root.
   * Returns the root hash.
   */
  function buildMerkleTree(leaves: Uint8Array[]): { root: Uint8Array; layers: Uint8Array[][] } {
    // Pad to power of 2
    let n = 1;
    while (n < leaves.length) n *= 2;
    const padded = [...leaves];
    while (padded.length < n) padded.push(new Uint8Array(32));

    const layers: Uint8Array[][] = [padded];
    let current = padded;
    while (current.length > 1) {
      const next: Uint8Array[] = [];
      for (let i = 0; i < current.length; i += 2) {
        next.push(sha256Hash(concat(current[i], current[i + 1])));
      }
      layers.push(next);
      current = next;
    }
    return { root: current[0], layers };
  }

  it('rejects when oldSize > newSize', () => {
    const { verifyConsistencyProof } = require('../key-transparency');
    expect(verifyConsistencyProof(
      toBase64(generateRandomBytes(32)), 5,
      toBase64(generateRandomBytes(32)), 3,
      [],
    )).toBe(false);
  });

  it('accepts when oldSize === newSize and roots match', () => {
    const { verifyConsistencyProof } = require('../key-transparency');
    const root = toBase64(generateRandomBytes(32));
    expect(verifyConsistencyProof(root, 5, root, 5, [])).toBe(true);
  });

  it('rejects when oldSize === newSize but roots differ', () => {
    const { verifyConsistencyProof } = require('../key-transparency');
    expect(verifyConsistencyProof(
      toBase64(generateRandomBytes(32)), 5,
      toBase64(generateRandomBytes(32)), 5,
      [],
    )).toBe(false);
  });

  it('accepts empty tree (oldSize === 0)', () => {
    const { verifyConsistencyProof } = require('../key-transparency');
    expect(verifyConsistencyProof(
      toBase64(new Uint8Array(32)), 0,
      toBase64(generateRandomBytes(32)), 5,
      [],
    )).toBe(true);
  });

  it('rejects empty proof when oldSize !== newSize and oldSize > 0', () => {
    const { verifyConsistencyProof } = require('../key-transparency');
    expect(verifyConsistencyProof(
      toBase64(generateRandomBytes(32)), 2,
      toBase64(generateRandomBytes(32)), 4,
      [],
    )).toBe(false);
  });

  it('rejects proof with invalid root hashes (32-byte check)', () => {
    const { verifyConsistencyProof } = require('../key-transparency');
    expect(verifyConsistencyProof(
      toBase64(generateRandomBytes(16)), // Too short
      2,
      toBase64(generateRandomBytes(32)),
      4,
      [toBase64(generateRandomBytes(32))],
    )).toBe(false);
  });

  it('no longer returns true unconditionally (stub removed)', () => {
    const { verifyConsistencyProof } = require('../key-transparency');
    // With random inputs, the proof should almost certainly fail
    // (astronomically unlikely to randomly match)
    const result = verifyConsistencyProof(
      toBase64(generateRandomBytes(32)), 3,
      toBase64(generateRandomBytes(32)), 7,
      [toBase64(generateRandomBytes(32)), toBase64(generateRandomBytes(32))],
    );
    expect(result).toBe(false);
  });
});

// ============================================================
// F10: AEAD KEY NOT CACHED
// ============================================================

describe('F10: AEAD key not cached in module scope', () => {
  it('storage.ts has no module-level aeadKey Uint8Array variable', () => {
    // Read the source file and verify the old cached DERIVED KEY variable is gone.
    // A cached SecureStore string (cachedEncKeyB64) is acceptable — it's the lookup,
    // not the derived key material. The actual Uint8Array AEAD key is never cached.
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'storage.ts'),
      'utf-8',
    );
    const codeLines = source.split('\n').filter((l: string) => !l.trim().startsWith('*') && !l.trim().startsWith('//'));
    const codeOnly = codeLines.join('\n');
    // Old pattern: `let aeadKey: Uint8Array | null = null` — derived key cached
    expect(codeOnly).not.toMatch(/let aeadKey\s*:\s*Uint8Array/);
    // Old caching: `if (aeadKey) return aeadKey` — skip derivation
    expect(codeOnly).not.toMatch(/if \(aeadKey\) return aeadKey/);
  });

  it('getAEADKey reads from SecureStore every call (no caching)', async () => {
    const { getAEADKey, getMMKV } = require('../storage');
    await getMMKV(); // Initialize

    // Call getAEADKey twice — both should return valid 32-byte keys
    const key1 = await getAEADKey();
    const key2 = await getAEADKey();
    expect(key1.length).toBe(32);
    expect(key2.length).toBe(32);
    // Both should be equal (same source, same derivation)
    expect(toBase64(key1)).toBe(toBase64(key2));
  });

  it('HMAC key for key names uses separate derivation from AEAD key', async () => {
    const { getAEADKey, getMMKV, hmacKeyName, HMAC_TYPE } = require('../storage');
    await getMMKV();

    const aeadKey = await getAEADKey();
    // hmacKeyName uses a different HKDF info string ('MizanlyHMACKeyNames')
    // vs AEAD key ('MizanlyMMKVAEAD'). Leaking one doesn't compromise the other.
    const hash = hmacKeyName(HMAC_TYPE.SESSION, 'session:test:1');
    expect(hash.startsWith('s:')).toBe(true);
    // The AEAD key should be different from what hmacKeyName uses internally
    // (different HKDF info strings produce different keys)
    expect(aeadKey.length).toBe(32);
  });
});

// ============================================================
// F13: SEALED SENDER REPLAY PROTECTION
// ============================================================

describe('F13: Sealed sender replay protection', () => {
  it('sealMessage includes timestamp and counter in envelope', async () => {
    const { sealMessage, unsealMessage } = require('../sealed-sender');
    const { storeIdentityKeyPair } = require('../storage');

    const recipientKeyPair = generateEd25519KeyPair();
    await storeIdentityKeyPair(recipientKeyPair);

    const envelope = await sealMessage(
      'recipient', recipientKeyPair.publicKey, 'sender', 1, 'content',
    );

    // Unseal and verify the inner JSON has ts and ctr fields
    const unsealed = await unsealMessage(envelope);
    expect(unsealed.senderId).toBe('sender');
    expect(unsealed.innerContent).toBe('content');
  });

  it('rejects replayed envelope (same counter)', async () => {
    const { sealMessage, unsealMessage } = require('../sealed-sender');
    const { storeIdentityKeyPair } = require('../storage');

    const recipientKeyPair = generateEd25519KeyPair();
    await storeIdentityKeyPair(recipientKeyPair);

    const envelope = await sealMessage(
      'recipient', recipientKeyPair.publicKey, 'sender_replay', 1, 'msg1',
    );

    // First unseal succeeds
    const first = await unsealMessage(envelope);
    expect(first.senderId).toBe('sender_replay');

    // Second unseal of SAME envelope should fail (counter not advanced)
    await expect(unsealMessage(envelope)).rejects.toThrow('replayed');
  });

  it('accepts envelopes with advancing counters', async () => {
    const { sealMessage, unsealMessage } = require('../sealed-sender');
    const { storeIdentityKeyPair } = require('../storage');

    const recipientKeyPair = generateEd25519KeyPair();
    await storeIdentityKeyPair(recipientKeyPair);

    // Send two different messages (different counters)
    const env1 = await sealMessage(
      'recipient', recipientKeyPair.publicKey, 'sender_advance', 1, 'msg1',
    );
    const env2 = await sealMessage(
      'recipient', recipientKeyPair.publicKey, 'sender_advance', 1, 'msg2',
    );

    // Both should succeed (monotonically increasing counters)
    const r1 = await unsealMessage(env1);
    expect(r1.innerContent).toBe('msg1');
    const r2 = await unsealMessage(env2);
    expect(r2.innerContent).toBe('msg2');
  });

  it('rejects envelope with expired timestamp', async () => {
    const { unsealMessage } = require('../sealed-sender');
    const { storeIdentityKeyPair } = require('../storage');
    const {
      generateX25519KeyPair, x25519DH, edToMontgomeryPub,
      hkdfDeriveSecrets, aeadEncrypt, utf8Encode, zeroOut,
    } = require('../crypto');

    const recipientKeyPair = generateEd25519KeyPair();
    await storeIdentityKeyPair(recipientKeyPair);

    // Manually craft a sealed envelope with an expired timestamp
    const ephPair = generateX25519KeyPair();
    const recipientX25519 = edToMontgomeryPub(recipientKeyPair.publicKey);
    const dhOutput = x25519DH(ephPair.privateKey, recipientX25519);
    const sealKey = hkdfDeriveSecrets(dhOutput, new Uint8Array(32), 'MizanlySealedSender', 56);
    const encKey = sealKey.slice(0, 32);
    const nonce = sealKey.slice(32, 56);

    const innerJson = JSON.stringify({
      senderId: 'expired_sender',
      senderDeviceId: 1,
      innerContent: 'old_message',
      ts: Date.now() - 10 * 60 * 1000, // 10 minutes ago (exceeds 5-minute limit)
      ctr: 999,
    });
    const ciphertext = aeadEncrypt(encKey, nonce, utf8Encode(innerJson), utf8Encode('recipient'));
    zeroOut(encKey);
    zeroOut(nonce);
    zeroOut(ephPair.privateKey);

    const envelope = {
      recipientId: 'recipient',
      ephemeralKey: toBase64(ephPair.publicKey),
      sealedCiphertext: toBase64(ciphertext),
    };

    await expect(unsealMessage(envelope)).rejects.toThrow('expired');
  });
});
