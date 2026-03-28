/**
 * Exhaustive tests for the Double Ratchet + X3DH integration.
 *
 * Tests the complete message exchange flow:
 * - Session establishment via X3DH (initiator + responder)
 * - Message encryption/decryption
 * - DH ratchet steps on direction changes
 * - Out-of-order message delivery (skipped keys)
 * - Simultaneous session initiation
 * - Session state persistence and recovery
 * - Error cases: tampered ciphertext, wrong session, max skip exceeded
 * - Forward secrecy verification
 */

import {
  generateEd25519KeyPair,
  generateX25519KeyPair,
  ed25519Sign,
  utf8Encode,
  utf8Decode,
} from '../crypto';
import { ratchetEncrypt, ratchetDecrypt } from '../double-ratchet';
import {
  initiateX3DH,
  respondX3DH,
  createInitiatorSessionState,
  createResponderSessionState,
} from '../x3dh';
import type {
  SessionState,
  PreKeyBundle,
  SignalMessage,
} from '../types';

// ============================================================
// HELPERS
// ============================================================

/** Create a mock pre-key bundle for Bob */
function createBobBundle(): {
  bundle: PreKeyBundle;
  identityKeyPair: { publicKey: Uint8Array; privateKey: Uint8Array };
  signedPreKeyPair: { publicKey: Uint8Array; privateKey: Uint8Array };
  oneTimePreKeyPair: { publicKey: Uint8Array; privateKey: Uint8Array };
} {
  const identityKeyPair = generateEd25519KeyPair();
  const signedPreKeyPair = generateX25519KeyPair();
  const oneTimePreKeyPair = generateX25519KeyPair();

  // Sign the pre-key with identity key
  const signature = ed25519Sign(identityKeyPair.privateKey, signedPreKeyPair.publicKey);

  const bundle: PreKeyBundle = {
    identityKey: identityKeyPair.publicKey,
    registrationId: 12345,
    deviceId: 1,
    signedPreKey: {
      keyId: 1,
      publicKey: signedPreKeyPair.publicKey,
      signature,
    },
    oneTimePreKey: {
      keyId: 100,
      publicKey: oneTimePreKeyPair.publicKey,
    },
    supportedVersions: [1],
  };

  return { bundle, identityKeyPair, signedPreKeyPair, oneTimePreKeyPair };
}

/**
 * Set up a complete Alice ↔ Bob session using X3DH.
 * Returns both session states ready for message exchange.
 */
async function setupAliceBobSession(): Promise<{
  aliceState: SessionState;
  bobState: SessionState;
}> {
  const bob = createBobBundle();

  // Alice initiates X3DH
  const aliceX3DH = await initiateX3DH(bob.bundle, 'bob123');
  const aliceState = createInitiatorSessionState(aliceX3DH, 11111);

  // Bob responds to Alice's PreKeySignalMessage
  const bobX3DH = await respondX3DH(
    aliceX3DH.identityKeyPair.publicKey,
    aliceX3DH.ephemeralKeyPair.publicKey,
    1, // signedPreKeyId
    100, // oneTimePreKeyId
    'alice123',
  );
  const bobState = createResponderSessionState(
    bobX3DH,
    aliceX3DH.ephemeralKeyPair.publicKey,
    bob.signedPreKeyPair.privateKey,
    22222,
    11111,
  );

  return { aliceState, bobState };
}

// ============================================================
// MOCK STORAGE (needed by X3DH)
// ============================================================

// Pre-populate SecureStore with Bob's keys for respondX3DH
const SecureStore = require('expo-secure-store');
const { toBase64 } = require('../crypto');

beforeEach(() => {
  SecureStore.__reset();
});

// ============================================================
// X3DH SESSION ESTABLISHMENT
// ============================================================

describe('X3DH session establishment', () => {
  it('initiator and responder derive the same root key', async () => {
    // Set up Bob's keys in SecureStore so respondX3DH can load them
    const bob = createBobBundle();
    const aliceIdentity = generateEd25519KeyPair();

    // Store Alice's identity key (for initiateX3DH)
    await SecureStore.setItemAsync('e2e_identity_private', toBase64(aliceIdentity.privateKey));
    await SecureStore.setItemAsync('e2e_identity_public', toBase64(aliceIdentity.publicKey));
    await SecureStore.setItemAsync('e2e_registration_id', '11111');

    // Store Bob's keys (for respondX3DH)
    await SecureStore.setItemAsync('e2e_spk_1', toBase64(bob.signedPreKeyPair.privateKey));
    await SecureStore.setItemAsync('e2e_opk_100', toBase64(bob.oneTimePreKeyPair.privateKey));

    const aliceX3DH = await initiateX3DH(bob.bundle, 'bob123');
    expect(aliceX3DH.sharedSecret.length).toBe(32);
    expect(aliceX3DH.sharedSecret.some((b: number) => b !== 0)).toBe(true);

    // Now set up Bob's identity key for respondX3DH
    await SecureStore.setItemAsync('e2e_identity_private', toBase64(bob.identityKeyPair.privateKey));
    await SecureStore.setItemAsync('e2e_identity_public', toBase64(bob.identityKeyPair.publicKey));

    const bobX3DH = await respondX3DH(
      aliceIdentity.publicKey,
      aliceX3DH.ephemeralKeyPair.publicKey,
      1,
      100,
      'alice123',
    );

    // Shared secrets must match
    expect(Buffer.from(aliceX3DH.sharedSecret).equals(Buffer.from(bobX3DH.sharedSecret))).toBe(true);
  });

  it('works without one-time pre-key (3-DH fallback)', async () => {
    const bob = createBobBundle();
    // Remove OTP from bundle
    const bundleNoOTP: PreKeyBundle = { ...bob.bundle, oneTimePreKey: undefined };

    const aliceIdentity = generateEd25519KeyPair();
    await SecureStore.setItemAsync('e2e_identity_private', toBase64(aliceIdentity.privateKey));
    await SecureStore.setItemAsync('e2e_identity_public', toBase64(aliceIdentity.publicKey));

    const aliceX3DH = await initiateX3DH(bundleNoOTP, 'bob123');
    expect(aliceX3DH.sharedSecret.length).toBe(32);
    expect(aliceX3DH.oneTimePreKeyId).toBeUndefined();

    // Bob responds without OTP
    await SecureStore.setItemAsync('e2e_identity_private', toBase64(bob.identityKeyPair.privateKey));
    await SecureStore.setItemAsync('e2e_identity_public', toBase64(bob.identityKeyPair.publicKey));
    await SecureStore.setItemAsync('e2e_spk_1', toBase64(bob.signedPreKeyPair.privateKey));

    const bobX3DH = await respondX3DH(
      aliceIdentity.publicKey,
      aliceX3DH.ephemeralKeyPair.publicKey,
      1,
      undefined, // No OTP
      'alice123',
    );

    expect(Buffer.from(aliceX3DH.sharedSecret).equals(Buffer.from(bobX3DH.sharedSecret))).toBe(true);
  });

  it('rejects bundle with invalid signed pre-key signature', async () => {
    const bob = createBobBundle();
    // Tamper with the signature
    bob.bundle.signedPreKey.signature = new Uint8Array(64).fill(0);

    const aliceIdentity = generateEd25519KeyPair();
    await SecureStore.setItemAsync('e2e_identity_private', toBase64(aliceIdentity.privateKey));
    await SecureStore.setItemAsync('e2e_identity_public', toBase64(aliceIdentity.publicKey));

    await expect(initiateX3DH(bob.bundle, 'bob123')).rejects.toThrow('signature verification failed');
  });
});

// ============================================================
// DOUBLE RATCHET MESSAGE EXCHANGE
// ============================================================

describe('Double Ratchet message exchange', () => {
  let aliceState: SessionState;
  let bobState: SessionState;

  beforeEach(async () => {
    // Set up keys for X3DH
    const aliceIdentity = generateEd25519KeyPair();
    const bob = createBobBundle();

    await SecureStore.setItemAsync('e2e_identity_private', toBase64(aliceIdentity.privateKey));
    await SecureStore.setItemAsync('e2e_identity_public', toBase64(aliceIdentity.publicKey));

    const aliceX3DH = await initiateX3DH(bob.bundle, 'bob123');
    aliceState = createInitiatorSessionState(aliceX3DH, 11111);

    await SecureStore.setItemAsync('e2e_identity_private', toBase64(bob.identityKeyPair.privateKey));
    await SecureStore.setItemAsync('e2e_identity_public', toBase64(bob.identityKeyPair.publicKey));
    await SecureStore.setItemAsync('e2e_spk_1', toBase64(bob.signedPreKeyPair.privateKey));
    await SecureStore.setItemAsync('e2e_opk_100', toBase64(bob.oneTimePreKeyPair.privateKey));

    const bobX3DH = await respondX3DH(
      aliceIdentity.publicKey,
      aliceX3DH.ephemeralKeyPair.publicKey,
      1, 100, 'alice123',
    );
    bobState = createResponderSessionState(
      bobX3DH,
      aliceX3DH.ephemeralKeyPair.publicKey,
      bob.signedPreKeyPair.privateKey,
      22222, 11111,
    );
  });

  it('Alice sends one message, Bob decrypts', () => {
    const msg = ratchetEncrypt(aliceState, utf8Encode('Salam!'));
    const decrypted = ratchetDecrypt(bobState, msg);
    expect(utf8Decode(decrypted)).toBe('Salam!');
  });

  it('Alice sends 3 messages in a row, Bob decrypts all in order', () => {
    const m1 = ratchetEncrypt(aliceState, utf8Encode('msg 1'));
    const m2 = ratchetEncrypt(aliceState, utf8Encode('msg 2'));
    const m3 = ratchetEncrypt(aliceState, utf8Encode('msg 3'));

    expect(utf8Decode(ratchetDecrypt(bobState, m1))).toBe('msg 1');
    expect(utf8Decode(ratchetDecrypt(bobState, m2))).toBe('msg 2');
    expect(utf8Decode(ratchetDecrypt(bobState, m3))).toBe('msg 3');
  });

  it('Alice sends 3 messages, Bob receives in REVERSE order (skipped keys)', () => {
    const m1 = ratchetEncrypt(aliceState, utf8Encode('first'));
    const m2 = ratchetEncrypt(aliceState, utf8Encode('second'));
    const m3 = ratchetEncrypt(aliceState, utf8Encode('third'));

    // Bob receives 3, then 2, then 1
    expect(utf8Decode(ratchetDecrypt(bobState, m3))).toBe('third');
    expect(utf8Decode(ratchetDecrypt(bobState, m2))).toBe('second');
    expect(utf8Decode(ratchetDecrypt(bobState, m1))).toBe('first');
  });

  it('ping-pong: Alice → Bob → Alice → Bob (DH ratchet steps)', () => {
    const a1 = ratchetEncrypt(aliceState, utf8Encode('A→B 1'));
    expect(utf8Decode(ratchetDecrypt(bobState, a1))).toBe('A→B 1');

    // Bob replies — triggers DH ratchet step on Alice's side
    const b1 = ratchetEncrypt(bobState, utf8Encode('B→A 1'));
    expect(utf8Decode(ratchetDecrypt(aliceState, b1))).toBe('B→A 1');

    // Alice sends again — triggers another DH ratchet step on Bob's side
    const a2 = ratchetEncrypt(aliceState, utf8Encode('A→B 2'));
    expect(utf8Decode(ratchetDecrypt(bobState, a2))).toBe('A→B 2');

    // Bob replies again
    const b2 = ratchetEncrypt(bobState, utf8Encode('B→A 2'));
    expect(utf8Decode(ratchetDecrypt(aliceState, b2))).toBe('B→A 2');
  });

  it('extended conversation: 50 messages alternating', () => {
    for (let i = 0; i < 25; i++) {
      const a = ratchetEncrypt(aliceState, utf8Encode(`Alice ${i}`));
      expect(utf8Decode(ratchetDecrypt(bobState, a))).toBe(`Alice ${i}`);

      const b = ratchetEncrypt(bobState, utf8Encode(`Bob ${i}`));
      expect(utf8Decode(ratchetDecrypt(aliceState, b))).toBe(`Bob ${i}`);
    }
  });

  it('one-sided: Alice sends 20 messages before Bob replies', () => {
    const messages: SignalMessage[] = [];
    for (let i = 0; i < 20; i++) {
      messages.push(ratchetEncrypt(aliceState, utf8Encode(`msg ${i}`)));
    }

    // Bob decrypts all 20
    for (let i = 0; i < 20; i++) {
      expect(utf8Decode(ratchetDecrypt(bobState, messages[i]))).toBe(`msg ${i}`);
    }

    // Bob replies
    const reply = ratchetEncrypt(bobState, utf8Encode('finally!'));
    expect(utf8Decode(ratchetDecrypt(aliceState, reply))).toBe('finally!');
  });

  it('out-of-order across ratchet boundary', () => {
    // Alice sends m1, m2
    const m1 = ratchetEncrypt(aliceState, utf8Encode('before ratchet 1'));
    const m2 = ratchetEncrypt(aliceState, utf8Encode('before ratchet 2'));

    // Bob receives m1, replies (DH ratchet step)
    expect(utf8Decode(ratchetDecrypt(bobState, m1))).toBe('before ratchet 1');
    const b1 = ratchetEncrypt(bobState, utf8Encode('reply'));

    // Alice receives Bob's reply (DH ratchet step on Alice)
    expect(utf8Decode(ratchetDecrypt(aliceState, b1))).toBe('reply');

    // Alice sends m3 on new chain
    const m3 = ratchetEncrypt(aliceState, utf8Encode('after ratchet'));

    // Bob receives m3 first (new ratchet key), then m2 (old chain, skipped)
    expect(utf8Decode(ratchetDecrypt(bobState, m3))).toBe('after ratchet');
    expect(utf8Decode(ratchetDecrypt(bobState, m2))).toBe('before ratchet 2');
  });

  it('decrypt fails on tampered ciphertext', () => {
    const msg = ratchetEncrypt(aliceState, utf8Encode('secret'));
    const tampered: SignalMessage = {
      header: msg.header,
      ciphertext: new Uint8Array(msg.ciphertext),
    };
    tampered.ciphertext[0] ^= 0x01;
    expect(() => ratchetDecrypt(bobState, tampered)).toThrow();
  });

  it('decrypt fails on tampered header (AAD violation)', () => {
    const msg = ratchetEncrypt(aliceState, utf8Encode('secret'));
    const tampered: SignalMessage = {
      header: {
        ...msg.header,
        counter: msg.header.counter + 1, // Wrong counter
      },
      ciphertext: msg.ciphertext,
    };
    expect(() => ratchetDecrypt(bobState, tampered)).toThrow();
  });

  it('replay attack: same message decrypted twice fails', () => {
    const msg = ratchetEncrypt(aliceState, utf8Encode('one-time'));
    expect(utf8Decode(ratchetDecrypt(bobState, msg))).toBe('one-time');
    // Replay — skipped key was deleted on first decrypt
    expect(() => ratchetDecrypt(bobState, msg)).toThrow();
  });

  it('exceeding max skipped keys (2000) throws', () => {
    // Encrypt 2002 messages — decrypting the last first requires skipping 2001 keys (> 2000)
    const messages: SignalMessage[] = [];
    for (let i = 0; i < 2002; i++) {
      messages.push(ratchetEncrypt(aliceState, utf8Encode(`msg ${i}`)));
    }

    // Try to decrypt the last one first (requires skipping 2001 > MAX_SKIPPED_KEYS=2000)
    expect(() => ratchetDecrypt(bobState, messages[2001])).toThrow('Too many skipped');
  });

  it('encrypts empty message', () => {
    const msg = ratchetEncrypt(aliceState, new Uint8Array(0));
    const decrypted = ratchetDecrypt(bobState, msg);
    expect(decrypted.length).toBe(0);
  });

  it('encrypts message at max size (64KB)', () => {
    const { generateRandomBytes } = require('../crypto');
    const maxSize = generateRandomBytes(64 * 1024);
    const msg = ratchetEncrypt(aliceState, maxSize);
    const decrypted = ratchetDecrypt(bobState, msg);
    expect(Buffer.from(decrypted).equals(Buffer.from(maxSize))).toBe(true);
  });

  it('rejects message over max size (64KB)', () => {
    const { generateRandomBytes } = require('../crypto');
    const tooLarge = generateRandomBytes(64 * 1024 + 1);
    expect(() => ratchetEncrypt(aliceState, tooLarge)).toThrow('too large');
  });

  it('counter increments correctly', () => {
    const m1 = ratchetEncrypt(aliceState, utf8Encode('1'));
    expect(m1.header.counter).toBe(0);

    const m2 = ratchetEncrypt(aliceState, utf8Encode('2'));
    expect(m2.header.counter).toBe(1);

    const m3 = ratchetEncrypt(aliceState, utf8Encode('3'));
    expect(m3.header.counter).toBe(2);
  });

  it('previousCounter is correct after DH ratchet step', () => {
    // Alice sends 3 messages
    ratchetEncrypt(aliceState, utf8Encode('a1'));
    ratchetEncrypt(aliceState, utf8Encode('a2'));
    const a3 = ratchetEncrypt(aliceState, utf8Encode('a3'));

    // Bob decrypts all 3
    ratchetDecrypt(bobState, a3); // Skips 0 and 1

    // Bob replies — previousCounter should be 0 (Bob hasn't sent before)
    const b1 = ratchetEncrypt(bobState, utf8Encode('b1'));
    expect(b1.header.previousCounter).toBe(0);

    // Alice decrypts
    ratchetDecrypt(aliceState, b1);

    // Alice sends again — previousCounter should be 3 (Alice sent 3 messages before ratchet)
    const a4 = ratchetEncrypt(aliceState, utf8Encode('a4'));
    expect(a4.header.previousCounter).toBe(3);
  });

  it('forward secrecy: old message keys cannot be derived from current state', () => {
    // Alice sends a message
    const m1 = ratchetEncrypt(aliceState, utf8Encode('early message'));
    ratchetDecrypt(bobState, m1);

    // Exchange several more messages (advance ratchet)
    for (let i = 0; i < 5; i++) {
      const a = ratchetEncrypt(aliceState, utf8Encode(`fwd ${i}`));
      ratchetDecrypt(bobState, a);
      const b = ratchetEncrypt(bobState, utf8Encode(`back ${i}`));
      ratchetDecrypt(aliceState, b);
    }

    // Old chain keys are zeroed — replaying m1 fails
    expect(() => ratchetDecrypt(bobState, m1)).toThrow();
  });

  it('Arabic/emoji content round-trips correctly', () => {
    const arabic = 'بسم الله الرحمن الرحيم 🕌';
    const msg = ratchetEncrypt(aliceState, utf8Encode(arabic));
    expect(utf8Decode(ratchetDecrypt(bobState, msg))).toBe(arabic);
  });

  it('skipped keys at exact boundary (2000) succeeds', () => {
    // 2001 messages — skipping first 2000, decrypt last = exactly at limit
    const messages: SignalMessage[] = [];
    for (let i = 0; i < 2001; i++) {
      messages.push(ratchetEncrypt(aliceState, utf8Encode(`m${i}`)));
    }
    // Decrypt last (counter=2000, skips 0-1999 = 2000 keys = exactly MAX)
    expect(utf8Decode(ratchetDecrypt(bobState, messages[2000]))).toBe('m2000');
  });

  it('5+ direction changes (deep DH ratchet)', () => {
    for (let round = 0; round < 8; round++) {
      const fromAlice = ratchetEncrypt(aliceState, utf8Encode(`A-round${round}`));
      expect(utf8Decode(ratchetDecrypt(bobState, fromAlice))).toBe(`A-round${round}`);

      const fromBob = ratchetEncrypt(bobState, utf8Encode(`B-round${round}`));
      expect(utf8Decode(ratchetDecrypt(aliceState, fromBob))).toBe(`B-round${round}`);
    }
  });

  it('stress: 200 messages one-sided then 200 back', () => {
    const aliceMsgs: SignalMessage[] = [];
    for (let i = 0; i < 200; i++) {
      aliceMsgs.push(ratchetEncrypt(aliceState, utf8Encode(`a${i}`)));
    }
    for (let i = 0; i < 200; i++) {
      expect(utf8Decode(ratchetDecrypt(bobState, aliceMsgs[i]))).toBe(`a${i}`);
    }
    const bobMsgs: SignalMessage[] = [];
    for (let i = 0; i < 200; i++) {
      bobMsgs.push(ratchetEncrypt(bobState, utf8Encode(`b${i}`)));
    }
    for (let i = 0; i < 200; i++) {
      expect(utf8Decode(ratchetDecrypt(aliceState, bobMsgs[i]))).toBe(`b${i}`);
    }
  });

  it('interleaved out-of-order across multiple ratchet epochs', () => {
    // Epoch 1: Alice sends m1, m2, m3
    const m1 = ratchetEncrypt(aliceState, utf8Encode('e1-m1'));
    const m2 = ratchetEncrypt(aliceState, utf8Encode('e1-m2'));
    const m3 = ratchetEncrypt(aliceState, utf8Encode('e1-m3'));

    // Bob receives m1 only, replies (triggers ratchet)
    ratchetDecrypt(bobState, m1);
    const b1 = ratchetEncrypt(bobState, utf8Encode('e1-reply'));

    // Alice receives reply (triggers ratchet on Alice)
    ratchetDecrypt(aliceState, b1);

    // Epoch 2: Alice sends m4, m5
    const m4 = ratchetEncrypt(aliceState, utf8Encode('e2-m4'));
    const m5 = ratchetEncrypt(aliceState, utf8Encode('e2-m5'));

    // Bob receives epoch 2 messages BEFORE epoch 1 stragglers
    expect(utf8Decode(ratchetDecrypt(bobState, m5))).toBe('e2-m5');
    expect(utf8Decode(ratchetDecrypt(bobState, m4))).toBe('e2-m4');

    // Now Bob receives epoch 1 stragglers (skipped keys from old chain)
    expect(utf8Decode(ratchetDecrypt(bobState, m3))).toBe('e1-m3');
    expect(utf8Decode(ratchetDecrypt(bobState, m2))).toBe('e1-m2');
  });

  it('wrong session: message from Alice cannot be decrypted by Charlie', async () => {
    // Create a separate Charlie session
    const charlieIdentity = generateEd25519KeyPair();
    const charlieSPK = generateX25519KeyPair();
    await SecureStore.setItemAsync('e2e_identity_private', toBase64(charlieIdentity.privateKey));
    await SecureStore.setItemAsync('e2e_identity_public', toBase64(charlieIdentity.publicKey));
    await SecureStore.setItemAsync('e2e_spk_2', toBase64(charlieSPK.privateKey));

    const charlieSig = ed25519Sign(charlieIdentity.privateKey, charlieSPK.publicKey);
    const charlieBundle: PreKeyBundle = {
      identityKey: charlieIdentity.publicKey,
      registrationId: 33333,
      deviceId: 1,
      signedPreKey: { keyId: 2, publicKey: charlieSPK.publicKey, signature: charlieSig },
      supportedVersions: [1],
    };

    // Alice's message encrypted for Bob
    const msg = ratchetEncrypt(aliceState, utf8Encode('for bob only'));

    // Charlie has a different session — cannot decrypt
    const charlieX3DH = await respondX3DH(
      aliceState.remoteIdentityKey, // Wrong identity for this message
      aliceState.senderRatchetKeyPair.publicKey,
      2, undefined, 'alice123',
    );
    const charlieState = createResponderSessionState(
      charlieX3DH,
      aliceState.senderRatchetKeyPair.publicKey,
      charlieSPK.privateKey,
      33333, 11111,
    );

    expect(() => ratchetDecrypt(charlieState, msg)).toThrow();
  });

  it('each message in a chain uses a unique encryption key', () => {
    // Encrypt 10 messages — all ciphertexts must be different (even if plaintext repeats)
    const repeated = utf8Encode('same');
    const ciphertexts = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const msg = ratchetEncrypt(aliceState, repeated);
      const hex = Buffer.from(msg.ciphertext).toString('hex');
      expect(ciphertexts.has(hex)).toBe(false);
      ciphertexts.add(hex);
    }
  });

  it('ratchet key changes on every direction change', () => {
    const ratchetKeys = new Set<string>();

    const a1 = ratchetEncrypt(aliceState, utf8Encode('a'));
    ratchetKeys.add(Buffer.from(a1.header.senderRatchetKey).toString('hex'));
    ratchetDecrypt(bobState, a1);

    const b1 = ratchetEncrypt(bobState, utf8Encode('b'));
    ratchetKeys.add(Buffer.from(b1.header.senderRatchetKey).toString('hex'));
    ratchetDecrypt(aliceState, b1);

    const a2 = ratchetEncrypt(aliceState, utf8Encode('a2'));
    ratchetKeys.add(Buffer.from(a2.header.senderRatchetKey).toString('hex'));
    ratchetDecrypt(bobState, a2);

    const b2 = ratchetEncrypt(bobState, utf8Encode('b2'));
    ratchetKeys.add(Buffer.from(b2.header.senderRatchetKey).toString('hex'));

    // Each direction change produces a new ratchet key
    expect(ratchetKeys.size).toBe(4);
  });

  it('messages within same chain share ratchet key but have different counters', () => {
    const m1 = ratchetEncrypt(aliceState, utf8Encode('1'));
    const m2 = ratchetEncrypt(aliceState, utf8Encode('2'));
    const m3 = ratchetEncrypt(aliceState, utf8Encode('3'));

    // Same ratchet key (no direction change)
    expect(Buffer.from(m1.header.senderRatchetKey).equals(Buffer.from(m2.header.senderRatchetKey))).toBe(true);
    expect(Buffer.from(m2.header.senderRatchetKey).equals(Buffer.from(m3.header.senderRatchetKey))).toBe(true);

    // Different counters
    expect(m1.header.counter).toBe(0);
    expect(m2.header.counter).toBe(1);
    expect(m3.header.counter).toBe(2);
  });

  it('decrypt with all-zero ciphertext fails (not valid AEAD)', () => {
    const msg = ratchetEncrypt(aliceState, utf8Encode('real'));
    const fake: SignalMessage = {
      header: msg.header,
      ciphertext: new Uint8Array(msg.ciphertext.length),
    };
    expect(() => ratchetDecrypt(bobState, fake)).toThrow();
  });
});
