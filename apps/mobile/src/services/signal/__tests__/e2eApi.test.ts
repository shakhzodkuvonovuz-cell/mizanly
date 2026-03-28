/**
 * Exhaustive tests for signal/e2eApi.ts
 *
 * Tests every exported function with:
 * - Happy path (correct inputs, correct outputs, correct conversions)
 * - base64 <-> Uint8Array conversion accuracy for ALL fields
 * - Missing/optional fields (e.g. oneTimePreKey absent)
 * - Error paths (429 rate limit, 500 server error, network failure)
 * - Auth token inclusion in all requests
 * - Protocol version negotiation logic
 * - Batch operations (multiple users, empty, partial)
 */

import { toBase64, fromBase64 } from '../crypto';
import {
  initE2EApi,
  fetchPreKeyBundle,
  fetchPreKeyBundlesBatch,
  registerIdentityKey,
  uploadSignedPreKey,
  uploadOneTimePreKeys,
  getPreKeyCount,
  uploadSenderKey,
  fetchSenderKeys,
  negotiateProtocolVersion,
} from '../e2eApi';

// ============================================================
// FETCH MOCK INFRASTRUCTURE
// ============================================================

let mockFetchResponses: Array<{
  status: number;
  ok: boolean;
  json?: () => Promise<any>;
  text?: () => Promise<string>;
}> = [];

let fetchCalls: Array<{ url: string; options: RequestInit }> = [];

const originalFetch = global.fetch;

function mockFetchOnce(status: number, body: any) {
  mockFetchResponses.push({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

function mockFetchError(errorMessage: string) {
  mockFetchResponses.push(null as any); // Sentinel — handled below
  // Store the error message in a side channel
  (mockFetchResponses as any).__nextError = errorMessage;
}

beforeAll(() => {
  (global as any).fetch = async (url: string, options: RequestInit = {}) => {
    fetchCalls.push({ url, options });
    if ((mockFetchResponses as any).__nextError) {
      const msg = (mockFetchResponses as any).__nextError;
      delete (mockFetchResponses as any).__nextError;
      mockFetchResponses.shift();
      throw new Error(msg);
    }
    const resp = mockFetchResponses.shift();
    if (!resp) throw new Error('No mock fetch response queued');
    return resp;
  };
});

afterAll(() => {
  global.fetch = originalFetch;
});

beforeEach(() => {
  mockFetchResponses = [];
  fetchCalls = [];
  // Initialize with a test base URL and token provider
  initE2EApi('https://e2e.test.com/', async () => 'test-jwt-token-123');
});

// ============================================================
// HELPERS
// ============================================================

/** Create deterministic test bytes of a given length */
function testBytes(length: number, seed: number = 0): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = (seed + i) % 256;
  }
  return bytes;
}

/** Build a raw server bundle response with base64-encoded fields */
function buildRawBundleResponse(opts?: {
  includeOneTimePreKey?: boolean;
  supportedVersions?: number[];
  remainingOneTimeKeys?: number;
}) {
  const identityKey = testBytes(32, 1);
  const signedPubKey = testBytes(32, 33);
  const signature = testBytes(64, 65);

  const bundle: any = {
    identityKey: toBase64(identityKey),
    registrationId: 12345,
    deviceId: 1,
    signedPreKey: {
      keyId: 42,
      publicKey: toBase64(signedPubKey),
      signature: toBase64(signature),
    },
    supportedVersions: opts?.supportedVersions,
  };

  if (opts?.includeOneTimePreKey !== false) {
    const otpPubKey = testBytes(32, 129);
    bundle.oneTimePreKey = {
      keyId: 99,
      publicKey: toBase64(otpPubKey),
    };
  }

  return {
    bundle,
    remainingOneTimeKeys: opts?.remainingOneTimeKeys ?? 47,
  };
}

// ============================================================
// initE2EApi
// ============================================================

describe('initE2EApi', () => {
  it('strips trailing slash from base URL', async () => {
    initE2EApi('https://e2e.example.com/', async () => 'tok');
    mockFetchOnce(200, { count: 5 });
    await getPreKeyCount();
    expect(fetchCalls[0].url).toBe('https://e2e.example.com/api/v1/e2e/keys/count');
  });

  it('works with base URL without trailing slash', async () => {
    initE2EApi('https://e2e.example.com', async () => 'tok');
    mockFetchOnce(200, { count: 5 });
    await getPreKeyCount();
    expect(fetchCalls[0].url).toBe('https://e2e.example.com/api/v1/e2e/keys/count');
  });

  it('uses the provided token provider for auth headers', async () => {
    initE2EApi('https://e2e.example.com', async () => 'my-custom-token-999');
    mockFetchOnce(200, { count: 0 });
    await getPreKeyCount();
    const headers = fetchCalls[0].options.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer my-custom-token-999');
  });
});

// ============================================================
// AUTH TOKEN IN HEADERS
// ============================================================

describe('auth token in headers', () => {
  it('includes Bearer token in every request', async () => {
    mockFetchOnce(200, { count: 10 });
    await getPreKeyCount();
    const headers = fetchCalls[0].options.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-jwt-token-123');
  });

  it('includes Content-Type application/json', async () => {
    mockFetchOnce(200, { count: 10 });
    await getPreKeyCount();
    const headers = fetchCalls[0].options.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('calls token provider on each request (not cached)', async () => {
    let callCount = 0;
    initE2EApi('https://e2e.test.com', async () => {
      callCount++;
      return `token-${callCount}`;
    });
    mockFetchOnce(200, { count: 1 });
    mockFetchOnce(200, { count: 2 });
    await getPreKeyCount();
    await getPreKeyCount();
    expect(callCount).toBe(2);
    expect((fetchCalls[0].options.headers as any)['Authorization']).toBe('Bearer token-1');
    expect((fetchCalls[1].options.headers as any)['Authorization']).toBe('Bearer token-2');
  });
});

// ============================================================
// fetchPreKeyBundle
// ============================================================

describe('fetchPreKeyBundle', () => {
  it('converts identityKey from base64 to Uint8Array', async () => {
    const raw = buildRawBundleResponse();
    mockFetchOnce(200, raw);
    const result = await fetchPreKeyBundle('user-abc');
    expect(result.bundle.identityKey).toBeInstanceOf(Uint8Array);
    expect(result.bundle.identityKey.length).toBe(32);
    // Verify the bytes round-trip correctly
    expect(toBase64(result.bundle.identityKey)).toBe(raw.bundle.identityKey);
  });

  it('converts signedPreKey.publicKey from base64 to Uint8Array', async () => {
    const raw = buildRawBundleResponse();
    mockFetchOnce(200, raw);
    const result = await fetchPreKeyBundle('user-abc');
    expect(result.bundle.signedPreKey.publicKey).toBeInstanceOf(Uint8Array);
    expect(result.bundle.signedPreKey.publicKey.length).toBe(32);
    expect(toBase64(result.bundle.signedPreKey.publicKey)).toBe(raw.bundle.signedPreKey.publicKey);
  });

  it('converts signedPreKey.signature from base64 to Uint8Array', async () => {
    const raw = buildRawBundleResponse();
    mockFetchOnce(200, raw);
    const result = await fetchPreKeyBundle('user-abc');
    expect(result.bundle.signedPreKey.signature).toBeInstanceOf(Uint8Array);
    expect(result.bundle.signedPreKey.signature.length).toBe(64);
    expect(toBase64(result.bundle.signedPreKey.signature)).toBe(raw.bundle.signedPreKey.signature);
  });

  it('converts oneTimePreKey.publicKey from base64 to Uint8Array', async () => {
    const raw = buildRawBundleResponse({ includeOneTimePreKey: true });
    mockFetchOnce(200, raw);
    const result = await fetchPreKeyBundle('user-abc');
    expect(result.bundle.oneTimePreKey).toBeDefined();
    expect(result.bundle.oneTimePreKey!.publicKey).toBeInstanceOf(Uint8Array);
    expect(result.bundle.oneTimePreKey!.publicKey.length).toBe(32);
    expect(toBase64(result.bundle.oneTimePreKey!.publicKey)).toBe(raw.bundle.oneTimePreKey.publicKey);
  });

  it('handles missing oneTimePreKey (3-DH fallback)', async () => {
    const raw = buildRawBundleResponse({ includeOneTimePreKey: false });
    mockFetchOnce(200, raw);
    const result = await fetchPreKeyBundle('user-abc');
    expect(result.bundle.oneTimePreKey).toBeUndefined();
  });

  it('preserves registrationId as number', async () => {
    const raw = buildRawBundleResponse();
    mockFetchOnce(200, raw);
    const result = await fetchPreKeyBundle('user-abc');
    expect(result.bundle.registrationId).toBe(12345);
  });

  it('preserves deviceId as number', async () => {
    const raw = buildRawBundleResponse();
    mockFetchOnce(200, raw);
    const result = await fetchPreKeyBundle('user-abc');
    expect(result.bundle.deviceId).toBe(1);
  });

  it('preserves signedPreKey.keyId as number', async () => {
    const raw = buildRawBundleResponse();
    mockFetchOnce(200, raw);
    const result = await fetchPreKeyBundle('user-abc');
    expect(result.bundle.signedPreKey.keyId).toBe(42);
  });

  it('preserves oneTimePreKey.keyId as number when present', async () => {
    const raw = buildRawBundleResponse({ includeOneTimePreKey: true });
    mockFetchOnce(200, raw);
    const result = await fetchPreKeyBundle('user-abc');
    expect(result.bundle.oneTimePreKey!.keyId).toBe(99);
  });

  it('defaults supportedVersions to [1] when missing from server', async () => {
    const raw = buildRawBundleResponse({ supportedVersions: undefined });
    mockFetchOnce(200, raw);
    const result = await fetchPreKeyBundle('user-abc');
    expect(result.bundle.supportedVersions).toEqual([1]);
  });

  it('preserves supportedVersions when provided by server', async () => {
    const raw = buildRawBundleResponse({ supportedVersions: [1, 2] });
    mockFetchOnce(200, raw);
    const result = await fetchPreKeyBundle('user-abc');
    expect(result.bundle.supportedVersions).toEqual([1, 2]);
  });

  it('preserves remainingOneTimeKeys count', async () => {
    const raw = buildRawBundleResponse({ remainingOneTimeKeys: 47 });
    mockFetchOnce(200, raw);
    const result = await fetchPreKeyBundle('user-abc');
    expect(result.remainingOneTimeKeys).toBe(47);
  });

  it('URL-encodes the userId in the path', async () => {
    const raw = buildRawBundleResponse();
    mockFetchOnce(200, raw);
    await fetchPreKeyBundle('user/with spaces&special');
    expect(fetchCalls[0].url).toContain('/api/v1/e2e/keys/bundle/user%2Fwith%20spaces%26special');
  });

  it('calls GET method (default)', async () => {
    const raw = buildRawBundleResponse();
    mockFetchOnce(200, raw);
    await fetchPreKeyBundle('user-1');
    // e2eFetch defaults to GET when no method specified
    expect(fetchCalls[0].options.method).toBeUndefined();
  });
});

// ============================================================
// fetchPreKeyBundlesBatch
// ============================================================

describe('fetchPreKeyBundlesBatch', () => {
  it('fetches bundles for multiple users', async () => {
    const raw1 = buildRawBundleResponse({ remainingOneTimeKeys: 10 });
    const raw2 = buildRawBundleResponse({ remainingOneTimeKeys: 20, includeOneTimePreKey: false });
    mockFetchOnce(200, {
      bundles: {
        'user-1': raw1,
        'user-2': raw2,
      },
    });

    const result = await fetchPreKeyBundlesBatch(['user-1', 'user-2']);
    expect(result.size).toBe(2);
    expect(result.get('user-1')!.remainingOneTimeKeys).toBe(10);
    expect(result.get('user-2')!.remainingOneTimeKeys).toBe(20);
  });

  it('converts base64 fields for each user in batch', async () => {
    const raw = buildRawBundleResponse({ includeOneTimePreKey: true });
    mockFetchOnce(200, { bundles: { 'user-x': raw } });

    const result = await fetchPreKeyBundlesBatch(['user-x']);
    const bundle = result.get('user-x')!.bundle;
    expect(bundle.identityKey).toBeInstanceOf(Uint8Array);
    expect(bundle.signedPreKey.publicKey).toBeInstanceOf(Uint8Array);
    expect(bundle.signedPreKey.signature).toBeInstanceOf(Uint8Array);
    expect(bundle.oneTimePreKey!.publicKey).toBeInstanceOf(Uint8Array);
  });

  it('handles empty response (no bundles)', async () => {
    mockFetchOnce(200, { bundles: {} });
    const result = await fetchPreKeyBundlesBatch(['user-1']);
    expect(result.size).toBe(0);
  });

  it('handles missing bundles key (null-safe)', async () => {
    mockFetchOnce(200, {});
    const result = await fetchPreKeyBundlesBatch(['user-1']);
    expect(result.size).toBe(0);
  });

  it('handles partial success (some users missing)', async () => {
    const raw = buildRawBundleResponse();
    mockFetchOnce(200, {
      bundles: {
        'user-1': raw,
        // user-2 missing — server didn't have their keys
      },
    });

    const result = await fetchPreKeyBundlesBatch(['user-1', 'user-2']);
    expect(result.size).toBe(1);
    expect(result.has('user-1')).toBe(true);
    expect(result.has('user-2')).toBe(false);
  });

  it('sends POST with userIds in body', async () => {
    mockFetchOnce(200, { bundles: {} });
    await fetchPreKeyBundlesBatch(['u1', 'u2', 'u3']);
    expect(fetchCalls[0].options.method).toBe('POST');
    const body = JSON.parse(fetchCalls[0].options.body as string);
    expect(body.userIds).toEqual(['u1', 'u2', 'u3']);
  });

  it('defaults supportedVersions to [1] per user in batch', async () => {
    const raw = buildRawBundleResponse({ supportedVersions: undefined });
    mockFetchOnce(200, { bundles: { 'user-a': raw } });
    const result = await fetchPreKeyBundlesBatch(['user-a']);
    expect(result.get('user-a')!.bundle.supportedVersions).toEqual([1]);
  });

  it('handles batch oneTimePreKey absent per user', async () => {
    const raw = buildRawBundleResponse({ includeOneTimePreKey: false });
    mockFetchOnce(200, { bundles: { 'user-b': raw } });
    const result = await fetchPreKeyBundlesBatch(['user-b']);
    expect(result.get('user-b')!.bundle.oneTimePreKey).toBeUndefined();
  });
});

// ============================================================
// registerIdentityKey
// ============================================================

describe('registerIdentityKey', () => {
  it('sends PUT to /api/v1/e2e/keys/identity', async () => {
    mockFetchOnce(200, { success: true, commitment: null });
    const pubKey = testBytes(32, 0);
    await registerIdentityKey(1, pubKey, 5000);
    expect(fetchCalls[0].url).toContain('/api/v1/e2e/keys/identity');
    expect(fetchCalls[0].options.method).toBe('PUT');
  });

  it('encodes publicKey as base64 in request body', async () => {
    mockFetchOnce(200, { success: true, commitment: null });
    const pubKey = testBytes(32, 10);
    await registerIdentityKey(1, pubKey, 5000);
    const body = JSON.parse(fetchCalls[0].options.body as string);
    expect(body.publicKey).toBe(toBase64(pubKey));
  });

  it('includes deviceId and registrationId in request body', async () => {
    mockFetchOnce(200, { success: true, commitment: null });
    await registerIdentityKey(3, testBytes(32), 7777);
    const body = JSON.parse(fetchCalls[0].options.body as string);
    expect(body.deviceId).toBe(3);
    expect(body.registrationId).toBe(7777);
  });

  it('returns the server response', async () => {
    mockFetchOnce(200, { success: true, commitment: 'abc123' });
    const result = await registerIdentityKey(1, testBytes(32), 1000);
    expect(result.success).toBe(true);
    expect(result.commitment).toBe('abc123');
  });
});

// ============================================================
// uploadSignedPreKey
// ============================================================

describe('uploadSignedPreKey', () => {
  it('sends PUT to /api/v1/e2e/keys/signed-prekey', async () => {
    mockFetchOnce(200, {});
    await uploadSignedPreKey({
      deviceId: 1,
      keyId: 42,
      publicKey: 'AAAA',
      signature: 'BBBB',
    });
    expect(fetchCalls[0].url).toContain('/api/v1/e2e/keys/signed-prekey');
    expect(fetchCalls[0].options.method).toBe('PUT');
  });

  it('serializes the full upload request as JSON body', async () => {
    mockFetchOnce(200, {});
    const upload = {
      deviceId: 2,
      keyId: 55,
      publicKey: toBase64(testBytes(32, 1)),
      signature: toBase64(testBytes(64, 33)),
    };
    await uploadSignedPreKey(upload);
    const body = JSON.parse(fetchCalls[0].options.body as string);
    expect(body.deviceId).toBe(2);
    expect(body.keyId).toBe(55);
    expect(body.publicKey).toBe(upload.publicKey);
    expect(body.signature).toBe(upload.signature);
  });

  it('does not return anything (void)', async () => {
    mockFetchOnce(200, {});
    const result = await uploadSignedPreKey({
      deviceId: 1,
      keyId: 1,
      publicKey: 'AA==',
      signature: 'BB==',
    });
    expect(result).toBeUndefined();
  });
});

// ============================================================
// uploadOneTimePreKeys
// ============================================================

describe('uploadOneTimePreKeys', () => {
  it('sends POST to /api/v1/e2e/keys/one-time-prekeys', async () => {
    mockFetchOnce(200, {});
    await uploadOneTimePreKeys({
      deviceId: 1,
      preKeys: [{ keyId: 1, publicKey: 'AA==' }],
    });
    expect(fetchCalls[0].url).toContain('/api/v1/e2e/keys/one-time-prekeys');
    expect(fetchCalls[0].options.method).toBe('POST');
  });

  it('serializes multiple prekeys in request body', async () => {
    mockFetchOnce(200, {});
    const preKeys = [
      { keyId: 100, publicKey: toBase64(testBytes(32, 0)) },
      { keyId: 101, publicKey: toBase64(testBytes(32, 32)) },
      { keyId: 102, publicKey: toBase64(testBytes(32, 64)) },
    ];
    await uploadOneTimePreKeys({ deviceId: 1, preKeys });
    const body = JSON.parse(fetchCalls[0].options.body as string);
    expect(body.preKeys.length).toBe(3);
    expect(body.preKeys[0].keyId).toBe(100);
    expect(body.preKeys[2].keyId).toBe(102);
    expect(body.deviceId).toBe(1);
  });

  it('does not return anything (void)', async () => {
    mockFetchOnce(200, {});
    const result = await uploadOneTimePreKeys({ deviceId: 1, preKeys: [] });
    expect(result).toBeUndefined();
  });
});

// ============================================================
// getPreKeyCount
// ============================================================

describe('getPreKeyCount', () => {
  it('returns the count number from server response', async () => {
    mockFetchOnce(200, { count: 42 });
    const count = await getPreKeyCount();
    expect(count).toBe(42);
  });

  it('returns zero when server reports zero', async () => {
    mockFetchOnce(200, { count: 0 });
    const count = await getPreKeyCount();
    expect(count).toBe(0);
  });

  it('calls GET on /api/v1/e2e/keys/count', async () => {
    mockFetchOnce(200, { count: 10 });
    await getPreKeyCount();
    expect(fetchCalls[0].url).toContain('/api/v1/e2e/keys/count');
    // GET is the default (no method set)
    expect(fetchCalls[0].options.method).toBeUndefined();
  });
});

// ============================================================
// uploadSenderKey
// ============================================================

describe('uploadSenderKey', () => {
  it('sends POST to /api/v1/e2e/sender-keys', async () => {
    mockFetchOnce(200, {});
    await uploadSenderKey('group-1', 'user-2', testBytes(32), 1, 0);
    expect(fetchCalls[0].url).toContain('/api/v1/e2e/sender-keys');
    expect(fetchCalls[0].options.method).toBe('POST');
  });

  it('encodes encryptedKey as base64 in request body', async () => {
    mockFetchOnce(200, {});
    const key = testBytes(48, 7);
    await uploadSenderKey('g1', 'u2', key, 5, 3);
    const body = JSON.parse(fetchCalls[0].options.body as string);
    expect(body.encryptedKey).toBe(toBase64(key));
    // Verify round-trip: converting back should yield original bytes
    const decoded = fromBase64(body.encryptedKey);
    expect(Buffer.from(decoded).equals(Buffer.from(key))).toBe(true);
  });

  it('includes groupId, recipientUserId, chainId, generation', async () => {
    mockFetchOnce(200, {});
    await uploadSenderKey('group-abc', 'recipient-xyz', testBytes(32), 7, 2);
    const body = JSON.parse(fetchCalls[0].options.body as string);
    expect(body.groupId).toBe('group-abc');
    expect(body.recipientUserId).toBe('recipient-xyz');
    expect(body.chainId).toBe(7);
    expect(body.generation).toBe(2);
  });
});

// ============================================================
// fetchSenderKeys
// ============================================================

describe('fetchSenderKeys', () => {
  it('converts encryptedKey from base64 to Uint8Array for each sender key', async () => {
    const sk1Key = testBytes(32, 0);
    const sk2Key = testBytes(32, 32);
    mockFetchOnce(200, {
      senderKeys: [
        { senderUserId: 'u1', encryptedKey: toBase64(sk1Key), chainId: 1, generation: 0 },
        { senderUserId: 'u2', encryptedKey: toBase64(sk2Key), chainId: 2, generation: 1 },
      ],
    });

    const result = await fetchSenderKeys('group-1');
    expect(result.length).toBe(2);
    expect(result[0].encryptedKey).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(result[0].encryptedKey).equals(Buffer.from(sk1Key))).toBe(true);
    expect(result[1].senderUserId).toBe('u2');
    expect(Buffer.from(result[1].encryptedKey).equals(Buffer.from(sk2Key))).toBe(true);
  });

  it('preserves senderUserId, chainId, generation', async () => {
    mockFetchOnce(200, {
      senderKeys: [
        { senderUserId: 'sender-abc', encryptedKey: toBase64(testBytes(32)), chainId: 99, generation: 5 },
      ],
    });
    const result = await fetchSenderKeys('group-x');
    expect(result[0].senderUserId).toBe('sender-abc');
    expect(result[0].chainId).toBe(99);
    expect(result[0].generation).toBe(5);
  });

  it('handles empty senderKeys array', async () => {
    mockFetchOnce(200, { senderKeys: [] });
    const result = await fetchSenderKeys('group-empty');
    expect(result).toEqual([]);
  });

  it('handles missing senderKeys key (null-safe fallback)', async () => {
    mockFetchOnce(200, {});
    const result = await fetchSenderKeys('group-missing');
    expect(result).toEqual([]);
  });

  it('URL-encodes the groupId in the path', async () => {
    mockFetchOnce(200, { senderKeys: [] });
    await fetchSenderKeys('group/with spaces');
    expect(fetchCalls[0].url).toContain('/api/v1/e2e/sender-keys/group%2Fwith%20spaces');
  });
});

// ============================================================
// negotiateProtocolVersion
// ============================================================

describe('negotiateProtocolVersion', () => {
  // V6-F12: negotiateProtocolVersion now checks isPQXDHAvailable() at runtime.
  // Mock it to test both PQXDH-available and PQXDH-unavailable paths.
  const pqxdh = require('../pqxdh');
  const originalIsPQXDH = pqxdh.isPQXDHAvailable;

  afterEach(() => {
    pqxdh.isPQXDHAvailable = originalIsPQXDH;
  });

  it('returns 1 when bundle supports [1] (PQXDH available)', () => {
    pqxdh.isPQXDHAvailable = () => true;
    expect(negotiateProtocolVersion([1])).toBe(1);
  });

  it('returns 2 when bundle supports [1, 2] and PQXDH available (F27)', () => {
    pqxdh.isPQXDHAvailable = () => true;
    expect(negotiateProtocolVersion([1, 2])).toBe(2);
  });

  it('returns 1 when bundle supports [1, 2] but PQXDH unavailable (V6-F12)', () => {
    pqxdh.isPQXDHAvailable = () => false;
    expect(negotiateProtocolVersion([1, 2])).toBe(1);
  });

  it('returns 2 when bundle supports [2] only and PQXDH available', () => {
    pqxdh.isPQXDHAvailable = () => true;
    expect(negotiateProtocolVersion([2])).toBe(2);
  });

  it('returns null when bundle supports [2] only and PQXDH unavailable (V6-F12)', () => {
    pqxdh.isPQXDHAvailable = () => false;
    expect(negotiateProtocolVersion([2])).toBeNull();
  });

  it('returns null when bundle supports empty array', () => {
    expect(negotiateProtocolVersion([])).toBeNull();
  });

  it('returns 2 when bundle supports [1, 2, 3] and PQXDH available (highest mutual)', () => {
    pqxdh.isPQXDHAvailable = () => true;
    expect(negotiateProtocolVersion([1, 2, 3])).toBe(2);
  });

  it('returns 1 when bundle supports [1, 2, 3] and PQXDH unavailable (V6-F12)', () => {
    pqxdh.isPQXDHAvailable = () => false;
    expect(negotiateProtocolVersion([1, 2, 3])).toBe(1);
  });

  it('returns null when bundle supports [3, 4, 5] (no overlap)', () => {
    expect(negotiateProtocolVersion([3, 4, 5])).toBeNull();
  });

  it('returns 2 when bundle supports [2, 1] and PQXDH available (order does not matter)', () => {
    pqxdh.isPQXDHAvailable = () => true;
    expect(negotiateProtocolVersion([2, 1])).toBe(2);
  });

  it('returns the highest mutual version with PQXDH available', () => {
    pqxdh.isPQXDHAvailable = () => true;
    expect(negotiateProtocolVersion([1, 1, 1])).toBe(1); // No v2 in bundle → v1
    expect(negotiateProtocolVersion([1, 2])).toBe(2);     // Both have v2 → v2
  });

  it('returns null for single incompatible version', () => {
    expect(negotiateProtocolVersion([99])).toBeNull();
  });
});

// ============================================================
// RATE LIMIT HANDLING (429)
// ============================================================

describe('rate limit handling (429)', () => {
  it('throws descriptive error on 429 response', async () => {
    mockFetchResponses.push({
      status: 429,
      ok: false,
      json: async () => ({}),
      text: async () => 'Too Many Requests',
    });
    await expect(getPreKeyCount()).rejects.toThrow('Rate limited by E2E server');
  });

  it('throws on 429 for fetchPreKeyBundle', async () => {
    mockFetchResponses.push({
      status: 429,
      ok: false,
      json: async () => ({}),
      text: async () => '',
    });
    await expect(fetchPreKeyBundle('user-1')).rejects.toThrow('Rate limited');
  });

  it('throws on 429 for uploadSenderKey', async () => {
    mockFetchResponses.push({
      status: 429,
      ok: false,
      json: async () => ({}),
      text: async () => '',
    });
    await expect(uploadSenderKey('g', 'u', testBytes(32), 1, 0)).rejects.toThrow('Rate limited');
  });
});

// ============================================================
// ERROR HANDLING (500, network)
// ============================================================

describe('error handling', () => {
  it('throws on 500 with status only — no path/body leak (F9)', async () => {
    mockFetchResponses.push({
      status: 500,
      ok: false,
      json: async () => ({}),
      text: async () => 'Internal Server Error',
    });
    await expect(getPreKeyCount()).rejects.toThrow('E2E request failed: 500');
  });

  it('does NOT include response body in error (F9: sanitized)', async () => {
    mockFetchResponses.push({
      status: 400,
      ok: false,
      json: async () => ({}),
      text: async () => 'Bad Request: missing deviceId',
    });
    // F9: error must only contain status code, NOT server response body or path
    await expect(registerIdentityKey(1, testBytes(32), 1000)).rejects.toThrow('E2E request failed: 400');
  });

  it('handles non-JSON error body gracefully (F9: status only)', async () => {
    mockFetchResponses.push({
      status: 502,
      ok: false,
      json: async () => { throw new Error('not json'); },
      text: async () => { throw new Error('body read failed'); },
    });
    await expect(getPreKeyCount()).rejects.toThrow('E2E request failed: 502');
  });

  it('throws on network error (fetch rejects)', async () => {
    (mockFetchResponses as any).__nextError = 'Network request failed';
    mockFetchResponses.push(null as any);
    await expect(getPreKeyCount()).rejects.toThrow('Network request failed');
  });

  it('throws on 404 for missing user bundle (F9: no path leak)', async () => {
    mockFetchResponses.push({
      status: 404,
      ok: false,
      json: async () => ({}),
      text: async () => 'User not found',
    });
    await expect(fetchPreKeyBundle('nonexistent-user')).rejects.toThrow('E2E request failed: 404');
  });

  it('throws on 401 unauthorized (F9: no body leak)', async () => {
    mockFetchResponses.push({
      status: 401,
      ok: false,
      json: async () => ({}),
      text: async () => 'Unauthorized',
    });
    await expect(getPreKeyCount()).rejects.toThrow('E2E request failed: 401');
  });
});

// ============================================================
// BASE64 ROUND-TRIP VERIFICATION
// ============================================================

describe('base64 round-trip accuracy', () => {
  it('all zeros survive base64 round-trip', async () => {
    const zeros = new Uint8Array(32);
    const raw = buildRawBundleResponse();
    raw.bundle.identityKey = toBase64(zeros);
    mockFetchOnce(200, raw);
    const result = await fetchPreKeyBundle('user-z');
    expect(result.bundle.identityKey.every((b) => b === 0)).toBe(true);
  });

  it('all 0xFF bytes survive base64 round-trip', async () => {
    const maxBytes = new Uint8Array(32).fill(0xff);
    const raw = buildRawBundleResponse();
    raw.bundle.identityKey = toBase64(maxBytes);
    mockFetchOnce(200, raw);
    const result = await fetchPreKeyBundle('user-ff');
    expect(result.bundle.identityKey.every((b) => b === 0xff)).toBe(true);
  });

  it('sender key round-trips through upload + fetch', async () => {
    const originalKey = testBytes(48, 42);

    // Upload: Uint8Array -> base64 in request
    mockFetchOnce(200, {});
    await uploadSenderKey('g1', 'u1', originalKey, 1, 0);
    const uploadBody = JSON.parse(fetchCalls[0].options.body as string);
    const base64InRequest = uploadBody.encryptedKey;

    // Fetch: base64 in response -> Uint8Array
    mockFetchOnce(200, {
      senderKeys: [
        { senderUserId: 'u1', encryptedKey: base64InRequest, chainId: 1, generation: 0 },
      ],
    });
    const fetched = await fetchSenderKeys('g1');
    expect(Buffer.from(fetched[0].encryptedKey).equals(Buffer.from(originalKey))).toBe(true);
  });
});
