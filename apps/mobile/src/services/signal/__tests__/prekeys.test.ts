/**
 * Exhaustive tests for prekeys.ts.
 */

import {
  generateAndStoreIdentityKey,
  getOrCreateIdentityKey,
  getOrCreateRegistrationId,
  generateSignedPreKey,
  shouldRotateSignedPreKey,
  cleanupOldSignedPreKeys,
  generateOneTimePreKeys,
  prepareSignedPreKeyUpload,
  prepareOneTimePreKeysUpload,
  prepareIdentityKeyUpload,
  needsReplenishment,
  REPLENISH_THRESHOLD,
  BATCH_SIZE,
} from '../prekeys';
import { ed25519Verify, generateEd25519KeyPair } from '../crypto';

const SecureStore = require('expo-secure-store');

beforeEach(async () => {
  SecureStore.__reset();
  const { _resetForTesting } = require('../storage');
  _resetForTesting();
  await SecureStore.setItemAsync('e2e_mmkv_key', require('../crypto').toBase64(require('../crypto').generateRandomBytes(32)));
});

describe('identity key generation', () => {
  it('generates and stores 32-byte Ed25519 key pair', async () => {
    const kp = await generateAndStoreIdentityKey();
    expect(kp.publicKey.length).toBe(32);
    expect(kp.privateKey.length).toBe(32);
  });

  it('getOrCreateIdentityKey generates on first call', async () => {
    const kp = await getOrCreateIdentityKey();
    expect(kp.publicKey.length).toBe(32);
  });

  it('getOrCreateIdentityKey returns same key on second call', async () => {
    const kp1 = await getOrCreateIdentityKey();
    const kp2 = await getOrCreateIdentityKey();
    expect(Buffer.from(kp1.publicKey).equals(Buffer.from(kp2.publicKey))).toBe(true);
    expect(Buffer.from(kp1.privateKey).equals(Buffer.from(kp2.privateKey))).toBe(true);
  });

  it('stored in SecureStore (persists across calls)', async () => {
    await generateAndStoreIdentityKey();
    const stored = await SecureStore.getItemAsync('e2e_identity_private');
    expect(stored).not.toBeNull();
    expect(stored.length).toBeGreaterThan(0);
  });
});

describe('registration ID', () => {
  it('generates 14-bit ID (0-16383)', async () => {
    const id = await getOrCreateRegistrationId();
    expect(id).toBeGreaterThanOrEqual(0);
    expect(id).toBeLessThanOrEqual(16383);
  });

  it('returns same ID on subsequent calls', async () => {
    const id1 = await getOrCreateRegistrationId();
    const id2 = await getOrCreateRegistrationId();
    expect(id1).toBe(id2);
  });

  it('100 generated IDs are all in range', async () => {
    for (let i = 0; i < 100; i++) {
      SecureStore.__reset();
      const id = await getOrCreateRegistrationId();
      expect(id).toBeGreaterThanOrEqual(0);
      expect(id).toBeLessThanOrEqual(16383);
    }
  });
});

describe('signed pre-key generation', () => {
  it('generates X25519 key pair with Ed25519 signature', async () => {
    const identity = generateEd25519KeyPair();
    const spk = await generateSignedPreKey(identity, 1);
    expect(spk.keyPair.publicKey.length).toBe(32);
    expect(spk.keyPair.privateKey.length).toBe(32);
    expect(spk.signature.length).toBe(64);
    expect(spk.keyId).toBe(1);
  });

  it('signature verifies against identity public key', async () => {
    const identity = generateEd25519KeyPair();
    const spk = await generateSignedPreKey(identity, 1);
    expect(ed25519Verify(identity.publicKey, spk.keyPair.publicKey, spk.signature)).toBe(true);
  });

  it('signature fails against wrong identity key', async () => {
    const identity1 = generateEd25519KeyPair();
    const identity2 = generateEd25519KeyPair();
    const spk = await generateSignedPreKey(identity1, 1);
    expect(ed25519Verify(identity2.publicKey, spk.keyPair.publicKey, spk.signature)).toBe(false);
  });

  it('stores private key in SecureStore', async () => {
    const identity = generateEd25519KeyPair();
    await generateSignedPreKey(identity, 42);
    const stored = await SecureStore.getItemAsync('e2e_spk_42');
    expect(stored).not.toBeNull();
  });

  it('different keyIds produce different keys', async () => {
    const identity = generateEd25519KeyPair();
    const spk1 = await generateSignedPreKey(identity, 1);
    const spk2 = await generateSignedPreKey(identity, 2);
    expect(Buffer.from(spk1.keyPair.publicKey).equals(Buffer.from(spk2.keyPair.publicKey))).toBe(false);
  });

  it('createdAt is set to current time', async () => {
    const before = Date.now();
    const identity = generateEd25519KeyPair();
    const spk = await generateSignedPreKey(identity, 1);
    const after = Date.now();
    expect(spk.createdAt).toBeGreaterThanOrEqual(before);
    expect(spk.createdAt).toBeLessThanOrEqual(after);
  });
});

describe('signed pre-key rotation', () => {
  it('shouldRotateSignedPreKey returns false for recent key', () => {
    expect(shouldRotateSignedPreKey(Date.now())).toBe(false);
    expect(shouldRotateSignedPreKey(Date.now() - 1000)).toBe(false);
  });

  it('shouldRotateSignedPreKey returns true after 7 days', () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    expect(shouldRotateSignedPreKey(eightDaysAgo)).toBe(true);
  });

  it('shouldRotateSignedPreKey returns false at exactly 7 days (boundary)', () => {
    const exactlySevenDays = Date.now() - 7 * 24 * 60 * 60 * 1000;
    // At exactly 7 days, diff == interval. Code uses > (not >=), so this is false.
    // Rotation triggers the moment AFTER 7 days.
    expect(shouldRotateSignedPreKey(exactlySevenDays)).toBe(false);
  });

  it('shouldRotateSignedPreKey returns true one ms after 7 days', () => {
    const justOver = Date.now() - (7 * 24 * 60 * 60 * 1000 + 1);
    expect(shouldRotateSignedPreKey(justOver)).toBe(true);
  });

  it('cleanupOldSignedPreKeys deletes keys older than 30 days', async () => {
    const identity = generateEd25519KeyPair();
    await generateSignedPreKey(identity, 1); // Stores private key
    await generateSignedPreKey(identity, 2);

    const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;

    await cleanupOldSignedPreKeys([
      { keyId: 1, createdAt: thirtyOneDaysAgo },
      { keyId: 2, createdAt: twoDaysAgo },
    ]);

    expect(await SecureStore.getItemAsync('e2e_spk_1')).toBeNull(); // Deleted (old)
    expect(await SecureStore.getItemAsync('e2e_spk_2')).not.toBeNull(); // Kept (recent)
  });
});

describe('one-time pre-key generation', () => {
  it('generates requested count (default 100)', async () => {
    const keys = await generateOneTimePreKeys(0);
    expect(keys.length).toBe(100);
  });

  it('generates custom count', async () => {
    const keys = await generateOneTimePreKeys(0, 10);
    expect(keys.length).toBe(10);
  });

  it('keyIds start from startId', async () => {
    const keys = await generateOneTimePreKeys(500, 5);
    expect(keys[0].keyId).toBe(500);
    expect(keys[1].keyId).toBe(501);
    expect(keys[4].keyId).toBe(504);
  });

  it('each key has 32-byte public and private key', async () => {
    const keys = await generateOneTimePreKeys(0, 5);
    for (const k of keys) {
      expect(k.keyPair.publicKey.length).toBe(32);
      expect(k.keyPair.privateKey.length).toBe(32);
    }
  });

  it('all keys are unique', async () => {
    const keys = await generateOneTimePreKeys(0, 50);
    const pubs = new Set(keys.map((k) => Buffer.from(k.keyPair.publicKey).toString('hex')));
    expect(pubs.size).toBe(50);
  });

  it('stores each private key in SecureStore', async () => {
    await generateOneTimePreKeys(0, 3);
    expect(await SecureStore.getItemAsync('e2e_opk_0')).not.toBeNull();
    expect(await SecureStore.getItemAsync('e2e_opk_1')).not.toBeNull();
    expect(await SecureStore.getItemAsync('e2e_opk_2')).not.toBeNull();
  });
});

describe('upload preparation', () => {
  it('prepareSignedPreKeyUpload formats correctly', async () => {
    const identity = generateEd25519KeyPair();
    const spk = await generateSignedPreKey(identity, 1);
    const upload = prepareSignedPreKeyUpload(spk);
    expect(upload.deviceId).toBe(1);
    expect(upload.keyId).toBe(1);
    expect(typeof upload.publicKey).toBe('string'); // Base64
    expect(typeof upload.signature).toBe('string'); // Base64
    expect(upload.publicKey.length).toBeGreaterThan(0);
    expect(upload.signature.length).toBeGreaterThan(0);
  });

  it('prepareOneTimePreKeysUpload formats correctly', async () => {
    const keys = await generateOneTimePreKeys(0, 3);
    const upload = prepareOneTimePreKeysUpload(keys);
    expect(upload.deviceId).toBe(1);
    expect(upload.preKeys.length).toBe(3);
    expect(upload.preKeys[0].keyId).toBe(0);
    expect(typeof upload.preKeys[0].publicKey).toBe('string');
  });

  it('prepareIdentityKeyUpload formats correctly', () => {
    const kp = generateEd25519KeyPair();
    const upload = prepareIdentityKeyUpload(kp, 12345);
    expect(upload.deviceId).toBe(1);
    expect(upload.registrationId).toBe(12345);
    expect(typeof upload.publicKey).toBe('string');
  });
});

describe('replenishment', () => {
  it('needsReplenishment returns true below threshold', () => {
    expect(needsReplenishment(0)).toBe(true);
    expect(needsReplenishment(19)).toBe(true);
  });

  it('needsReplenishment returns false at/above threshold', () => {
    expect(needsReplenishment(20)).toBe(false);
    expect(needsReplenishment(100)).toBe(false);
  });

  it('constants are correct', () => {
    expect(REPLENISH_THRESHOLD).toBe(20);
    expect(BATCH_SIZE).toBe(100);
  });
});
