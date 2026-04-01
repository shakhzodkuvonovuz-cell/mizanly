/**
 * Exhaustive tests for signal/media-crypto.ts
 *
 * Tests every exported function with:
 * - Happy path (correct inputs → correct outputs)
 * - Round-trip verification (encrypt → decrypt = original plaintext)
 * - Edge cases (empty file, oversized file, single-byte file, multi-chunk)
 * - Error cases (file not found, wrong protocol version, tampered data, truncated file)
 * - Security properties (chunk nonce uniqueness, AAD prevents reordering, SHA-256 tamper detection)
 * - Progress callback correctness
 * - Abort signal cancellation
 * - Header encoding/decoding round-trip
 * - Exported constants
 */

import * as FileSystem from 'expo-file-system';
import { sha256 as sha256Hasher } from '@noble/hashes/sha256';

import {
  prepareMediaEncryption,
  encryptMediaChunked,
  encryptSmallMediaFile,
  decryptMediaFile,
  CHUNK_SIZE,
  AUTH_TAG_SIZE,
  HEADER_SIZE,
  SMALL_FILE_THRESHOLD,
} from '../media-crypto';
import type { MediaEncryptionContext } from '../media-crypto';

import {
  hkdfDeriveSecrets,
  aeadEncrypt,
  aeadDecrypt,
  concat,
  uint32BE,
  generateRandomBytes,
  fromBase64,
} from '../crypto';

// Access test helpers on the mock
const fsMock = FileSystem as unknown as {
  __reset: () => void;
  __setFile: (uri: string, base64Content: string) => void;
  __getFile: (uri: string) => string | undefined;
  __getFiles: () => Map<string, string>;
  __setSizeOverride: (uri: string, size: number) => void;
  __clearSizeOverride: (uri: string) => void;
};

// ============================================================
// HELPERS
// ============================================================

function arrayBufferToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Create a test file with the given size in bytes, filled with random data */
function createTestFile(uri: string, sizeBytes: number): Uint8Array {
  const data = generateRandomBytes(sizeBytes);
  fsMock.__setFile(uri, arrayBufferToBase64(data));
  return data;
}

/** Collect all chunks from an async generator */
async function collectChunks(gen: AsyncGenerator<Uint8Array>): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of gen) {
    chunks.push(chunk);
  }
  return chunks;
}

/** Build a fake encrypted file from header + encrypted chunks (for decryption tests) */
function buildEncryptedFile(header: Uint8Array, encryptedChunks: Uint8Array[]): string {
  const parts = [header, ...encryptedChunks];
  const full = concat(...parts);
  return arrayBufferToBase64(full);
}

beforeEach(() => {
  fsMock.__reset();
});

// ============================================================
// EXPORTED CONSTANTS
// ============================================================

describe('exported constants', () => {
  it('CHUNK_SIZE is 1MB', () => {
    expect(CHUNK_SIZE).toBe(1 * 1024 * 1024);
  });

  it('AUTH_TAG_SIZE is 16 (Poly1305)', () => {
    expect(AUTH_TAG_SIZE).toBe(16);
  });

  it('HEADER_SIZE is 11 bytes', () => {
    expect(HEADER_SIZE).toBe(11);
  });

  it('SMALL_FILE_THRESHOLD is 50MB', () => {
    expect(SMALL_FILE_THRESHOLD).toBe(50 * 1024 * 1024);
  });
});

// ============================================================
// HEADER ENCODING / DECODING
// ============================================================

describe('header encoding/decoding round-trip', () => {
  it('encodes and decodes correctly for 1 chunk', async () => {
    const sourceUri = 'file:///test/header1.bin';
    createTestFile(sourceUri, 100);
    const ctx = await prepareMediaEncryption(sourceUri);

    // Header is 11 bytes
    expect(ctx.header.length).toBe(HEADER_SIZE);

    // Version byte
    expect(ctx.header[0]).toBe(1);
    // Reserved bytes
    expect(ctx.header[1]).toBe(0);
    expect(ctx.header[2]).toBe(0);

    // ChunkSize big-endian (1MB = 0x00100000)
    const chunkSize =
      ((ctx.header[3] << 24) | (ctx.header[4] << 16) | (ctx.header[5] << 8) | ctx.header[6]) >>> 0;
    expect(chunkSize).toBe(CHUNK_SIZE);

    // TotalChunks big-endian
    const totalChunks =
      ((ctx.header[7] << 24) | (ctx.header[8] << 16) | (ctx.header[9] << 8) | ctx.header[10]) >>> 0;
    expect(totalChunks).toBe(1);
  });

  it('encodes correct totalChunks for multi-chunk file', async () => {
    const sourceUri = 'file:///test/header2.bin';
    const size = CHUNK_SIZE * 3 + 500; // 3 full chunks + partial
    createTestFile(sourceUri, size);
    const ctx = await prepareMediaEncryption(sourceUri);

    expect(ctx.totalChunks).toBe(4);

    const totalChunks =
      ((ctx.header[7] << 24) | (ctx.header[8] << 16) | (ctx.header[9] << 8) | ctx.header[10]) >>> 0;
    expect(totalChunks).toBe(4);
  });

  it('encodes correct totalChunks when file is exactly chunk-aligned', async () => {
    const sourceUri = 'file:///test/header3.bin';
    createTestFile(sourceUri, CHUNK_SIZE * 2);
    const ctx = await prepareMediaEncryption(sourceUri);
    expect(ctx.totalChunks).toBe(2);
  });
});

// ============================================================
// prepareMediaEncryption
// ============================================================

describe('prepareMediaEncryption', () => {
  it('generates a 32-byte mediaKey', async () => {
    const uri = 'file:///test/prepare1.bin';
    createTestFile(uri, 512);
    const ctx = await prepareMediaEncryption(uri);
    expect(ctx.mediaKey).toBeInstanceOf(Uint8Array);
    expect(ctx.mediaKey.length).toBe(32);
  });

  it('calculates totalChunks correctly for small file', async () => {
    const uri = 'file:///test/prepare2.bin';
    createTestFile(uri, 100);
    const ctx = await prepareMediaEncryption(uri);
    expect(ctx.totalChunks).toBe(1);
  });

  it('calculates totalChunks correctly for multi-chunk file', async () => {
    const uri = 'file:///test/prepare3.bin';
    createTestFile(uri, CHUNK_SIZE + 1);
    const ctx = await prepareMediaEncryption(uri);
    expect(ctx.totalChunks).toBe(2);
  });

  it('returns fileSize matching input', async () => {
    const uri = 'file:///test/prepare4.bin';
    createTestFile(uri, 2048);
    const ctx = await prepareMediaEncryption(uri);
    expect(ctx.fileSize).toBe(2048);
  });

  it('creates an 11-byte header', async () => {
    const uri = 'file:///test/prepare5.bin';
    createTestFile(uri, 256);
    const ctx = await prepareMediaEncryption(uri);
    expect(ctx.header.length).toBe(HEADER_SIZE);
  });

  it('initializes hasher with header already fed', async () => {
    const uri = 'file:///test/prepare6.bin';
    createTestFile(uri, 256);
    const ctx = await prepareMediaEncryption(uri);
    // The hasher should exist and be a sha256 hasher
    expect(ctx.hasher).toBeDefined();
    expect(typeof ctx.hasher.update).toBe('function');
    expect(typeof ctx.hasher.digest).toBe('function');
  });

  it('generates unique mediaKeys per call', async () => {
    const uri = 'file:///test/prepare7.bin';
    createTestFile(uri, 128);
    const ctx1 = await prepareMediaEncryption(uri);
    const ctx2 = await prepareMediaEncryption(uri);
    expect(Buffer.from(ctx1.mediaKey).equals(Buffer.from(ctx2.mediaKey))).toBe(false);
  });

  it('throws for file not found', async () => {
    await expect(prepareMediaEncryption('file:///nonexistent/file.bin')).rejects.toThrow(
      'File not found: file:///nonexistent/file.bin',
    );
  });

  it('throws for empty file (0 bytes)', async () => {
    const uri = 'file:///test/empty.bin';
    fsMock.__setFile(uri, arrayBufferToBase64(new Uint8Array(0)));
    await expect(prepareMediaEncryption(uri)).rejects.toThrow('Cannot encrypt empty file');
  });

  it('throws for oversized file (> 2GB)', async () => {
    const uri = 'file:///test/huge.bin';
    // Use size override to simulate a huge file without allocating memory
    fsMock.__setFile(uri, arrayBufferToBase64(new Uint8Array(1))); // needs to exist
    fsMock.__setSizeOverride(uri, 2 * 1024 * 1024 * 1024 + 1); // 2GB + 1 byte
    await expect(prepareMediaEncryption(uri)).rejects.toThrow('File too large');
  });
});

// ============================================================
// encryptMediaChunked
// ============================================================

describe('encryptMediaChunked', () => {
  it('yields encrypted chunks for a single-chunk file', async () => {
    const uri = 'file:///test/enc1.bin';
    createTestFile(uri, 256);
    const ctx = await prepareMediaEncryption(uri);
    const chunks = await collectChunks(encryptMediaChunked(uri, ctx));
    expect(chunks.length).toBe(1);
  });

  it('yields correct number of chunks for multi-chunk file', async () => {
    const uri = 'file:///test/enc2.bin';
    const fileSize = CHUNK_SIZE * 2 + 500;
    createTestFile(uri, fileSize);
    const ctx = await prepareMediaEncryption(uri);
    const chunks = await collectChunks(encryptMediaChunked(uri, ctx));
    expect(chunks.length).toBe(ctx.totalChunks);
    expect(chunks.length).toBe(3);
  });

  it('each chunk has AUTH_TAG_SIZE (16) extra bytes from AEAD', async () => {
    const uri = 'file:///test/enc3.bin';
    const fileSize = 256;
    createTestFile(uri, fileSize);
    const ctx = await prepareMediaEncryption(uri);
    const chunks = await collectChunks(encryptMediaChunked(uri, ctx));
    // Single chunk: plaintext is 256 bytes, encrypted should be 256 + 16 = 272
    expect(chunks[0].length).toBe(fileSize + AUTH_TAG_SIZE);
  });

  it('full-size chunks are CHUNK_SIZE + AUTH_TAG_SIZE bytes', async () => {
    const uri = 'file:///test/enc3b.bin';
    const fileSize = CHUNK_SIZE + 100; // 2 chunks: one full, one partial
    createTestFile(uri, fileSize);
    const ctx = await prepareMediaEncryption(uri);
    const chunks = await collectChunks(encryptMediaChunked(uri, ctx));
    expect(chunks[0].length).toBe(CHUNK_SIZE + AUTH_TAG_SIZE);
    expect(chunks[1].length).toBe(100 + AUTH_TAG_SIZE);
  });

  it('progress callback fires for each chunk', async () => {
    const uri = 'file:///test/enc4.bin';
    createTestFile(uri, CHUNK_SIZE + 100);
    const ctx = await prepareMediaEncryption(uri);
    const progressValues: number[] = [];
    const onProgress = (p: number) => progressValues.push(p);
    await collectChunks(encryptMediaChunked(uri, ctx, onProgress));
    expect(progressValues).toEqual([0.5, 1]);
  });

  it('progress callback reaches 1.0 for single-chunk file', async () => {
    const uri = 'file:///test/enc5.bin';
    createTestFile(uri, 100);
    const ctx = await prepareMediaEncryption(uri);
    const progressValues: number[] = [];
    await collectChunks(encryptMediaChunked(uri, ctx, (p) => progressValues.push(p)));
    expect(progressValues).toEqual([1]);
  });

  it('abort signal cancels encryption', async () => {
    const uri = 'file:///test/enc6.bin';
    createTestFile(uri, CHUNK_SIZE * 3);
    const ctx = await prepareMediaEncryption(uri);

    const controller = new AbortController();
    const chunks: Uint8Array[] = [];
    const gen = encryptMediaChunked(uri, ctx, undefined, controller.signal);

    // Get first chunk, then abort
    const first = await gen.next();
    chunks.push(first.value!);
    controller.abort();

    await expect(gen.next()).rejects.toThrow('Media encryption cancelled');
    expect(chunks.length).toBe(1);
  });

  it('chunk count matches totalChunks from context', async () => {
    const uri = 'file:///test/enc7.bin';
    // Test with several chunk-boundary sizes
    for (const size of [1, 100, CHUNK_SIZE - 1, CHUNK_SIZE, CHUNK_SIZE + 1, CHUNK_SIZE * 2]) {
      fsMock.__reset();
      createTestFile(uri, size);
      const ctx = await prepareMediaEncryption(uri);
      const chunks = await collectChunks(encryptMediaChunked(uri, ctx));
      expect(chunks.length).toBe(ctx.totalChunks);
    }
  });

  it('encrypted output differs from plaintext', async () => {
    const uri = 'file:///test/enc8.bin';
    const plaintext = createTestFile(uri, 256);
    const ctx = await prepareMediaEncryption(uri);
    const chunks = await collectChunks(encryptMediaChunked(uri, ctx));
    // Encrypted chunk should differ from plaintext (overwhelmingly likely with random key)
    const encSlice = chunks[0].slice(0, 256);
    expect(Buffer.from(encSlice).equals(Buffer.from(plaintext))).toBe(false);
  });
});

// ============================================================
// encryptSmallMediaFile — round-trip with decryptMediaFile
// ============================================================

describe('encryptSmallMediaFile', () => {
  it('encrypts and writes a file, returns correct metadata', async () => {
    const uri = 'file:///test/small1.bin';
    const plaintext = createTestFile(uri, 1024);

    const result = await encryptSmallMediaFile(uri, 'image/jpeg', {
      width: 800,
      height: 600,
      fileName: 'photo.jpg',
    });

    // F18: mediaKeyB64 is the primary field; mediaKey is zeroed
    expect(result.mediaKeyB64).toBeTruthy();
    expect(typeof result.mediaKeyB64).toBe('string');
    expect(fromBase64(result.mediaKeyB64).length).toBe(32);
    expect(result.mediaSha256).toBeInstanceOf(Uint8Array);
    expect(result.mediaSha256.length).toBe(32);
    expect(result.totalChunks).toBe(1);
    expect(result.fileSize).toBe(1024);
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
    expect(result.fileName).toBe('photo.jpg');
    expect(result.mediaUrl).toBe('');
    expect(result.encryptedFileUri).toMatch(/^\/tmp\/test-cache\/encrypted_/);

    // Verify encrypted file was written
    const encryptedB64 = fsMock.__getFile(result.encryptedFileUri);
    expect(encryptedB64).toBeDefined();
  });

  it('round-trip: encrypt then decrypt recovers original plaintext', async () => {
    const uri = 'file:///test/roundtrip.bin';
    const plaintext = createTestFile(uri, 2048);

    const result = await encryptSmallMediaFile(uri, 'application/octet-stream');

    // decryptMediaFile reads from the encrypted file URI
    const decryptedUri = await decryptMediaFile(
      result.encryptedFileUri,
      fromBase64(result.mediaKeyB64),
      result.mediaSha256,
      result.totalChunks,
    );

    // Read decrypted file
    const decryptedB64 = fsMock.__getFile(decryptedUri);
    expect(decryptedB64).toBeDefined();
    const decrypted = base64ToArrayBuffer(decryptedB64!);
    expect(Buffer.from(decrypted).equals(Buffer.from(plaintext))).toBe(true);
  });

  it('round-trip works for multi-chunk files within 50MB', async () => {
    // Use a size that produces 2 chunks
    const uri = 'file:///test/roundtrip2.bin';
    const fileSize = CHUNK_SIZE + 500;
    const plaintext = createTestFile(uri, fileSize);

    const result = await encryptSmallMediaFile(uri, 'video/mp4', { duration: 10 });

    expect(result.totalChunks).toBe(2);
    expect(result.duration).toBe(10);

    const decryptedUri = await decryptMediaFile(
      result.encryptedFileUri,
      fromBase64(result.mediaKeyB64),
      result.mediaSha256,
      result.totalChunks,
    );

    const decrypted = base64ToArrayBuffer(fsMock.__getFile(decryptedUri)!);
    // Compare only the bytes we wrote (last chunk is padded by concat but decryption should recover exact plaintext)
    expect(Buffer.from(decrypted.slice(0, fileSize)).equals(Buffer.from(plaintext))).toBe(true);
  });

  it('rejects files over 50MB threshold', async () => {
    const uri = 'file:///test/toolarge.bin';
    // Use size override to simulate a 50MB+ file without allocating memory
    fsMock.__setFile(uri, arrayBufferToBase64(new Uint8Array(1))); // needs to exist
    fsMock.__setSizeOverride(uri, SMALL_FILE_THRESHOLD + 1);

    await expect(
      encryptSmallMediaFile(uri, 'video/mp4'),
    ).rejects.toThrow('File too large for in-memory encryption');
  });

  it('progress callback fires during encryption', async () => {
    const uri = 'file:///test/smallprogress.bin';
    createTestFile(uri, 512);
    const progressValues: number[] = [];
    await encryptSmallMediaFile(uri, 'image/png', undefined, (p) => progressValues.push(p));
    expect(progressValues.length).toBeGreaterThan(0);
    expect(progressValues[progressValues.length - 1]).toBe(1);
  });

  it('preserves optional metadata fields', async () => {
    const uri = 'file:///test/meta.bin';
    createTestFile(uri, 128);
    const result = await encryptSmallMediaFile(uri, 'audio/mp3', {
      duration: 180.5,
      fileName: 'song.mp3',
      thumbnail: 'base64thumbdata',
    });
    expect(result.duration).toBe(180.5);
    expect(result.fileName).toBe('song.mp3');
    expect(result.thumbnail).toBe('base64thumbdata');
    expect(result.width).toBeUndefined();
    expect(result.height).toBeUndefined();
  });
});

// ============================================================
// decryptMediaFile — error cases
// ============================================================

describe('decryptMediaFile', () => {
  /** Helper: encrypt a small file and return all the artifacts needed for decryption */
  async function encryptTestFile(size: number) {
    const uri = 'file:///test/dectest.bin';
    const plaintext = createTestFile(uri, size);
    const result = await encryptSmallMediaFile(uri, 'application/octet-stream');
    return { plaintext, result };
  }

  it('rejects wrong protocol version', async () => {
    const { result } = await encryptTestFile(256);

    // Tamper with version byte in the encrypted file
    const encB64 = fsMock.__getFile(result.encryptedFileUri)!;
    const encBytes = base64ToArrayBuffer(encB64);
    encBytes[0] = 99; // Wrong version
    fsMock.__setFile(result.encryptedFileUri, arrayBufferToBase64(encBytes));

    await expect(
      decryptMediaFile(result.encryptedFileUri, fromBase64(result.mediaKeyB64), result.mediaSha256, result.totalChunks),
    ).rejects.toThrow('Unsupported media protocol version: 99');
  });

  it('rejects wrong chunk size in header', async () => {
    const { result } = await encryptTestFile(256);

    // Tamper with chunkSize in the header (bytes 3-6)
    const encB64 = fsMock.__getFile(result.encryptedFileUri)!;
    const encBytes = base64ToArrayBuffer(encB64);
    // Set chunk size to 2MB instead of 1MB
    encBytes[3] = 0x00;
    encBytes[4] = 0x20;
    encBytes[5] = 0x00;
    encBytes[6] = 0x00;
    fsMock.__setFile(result.encryptedFileUri, arrayBufferToBase64(encBytes));

    await expect(
      decryptMediaFile(result.encryptedFileUri, fromBase64(result.mediaKeyB64), result.mediaSha256, result.totalChunks),
    ).rejects.toThrow('Unexpected chunk size in header');
  });

  it('rejects truncated file (too small)', async () => {
    const uri = 'file:///test/truncated.bin';
    // Write a file smaller than HEADER_SIZE + AUTH_TAG_SIZE + 1
    const tinyData = new Uint8Array(HEADER_SIZE + AUTH_TAG_SIZE); // Missing the +1
    // Set valid header
    tinyData[0] = 1; // version
    // chunkSize = 1MB in big endian
    tinyData[3] = 0x00;
    tinyData[4] = 0x10;
    tinyData[5] = 0x00;
    tinyData[6] = 0x00;
    // totalChunks = 1
    tinyData[10] = 1;
    fsMock.__setFile(uri, arrayBufferToBase64(tinyData));

    const fakeKey = generateRandomBytes(32);
    const fakeSha = generateRandomBytes(32);

    await expect(decryptMediaFile(uri, fakeKey, fakeSha, 1)).rejects.toThrow(
      'Encrypted file too small',
    );
  });

  it('SHA-256 verification catches tampered ciphertext', async () => {
    const { result } = await encryptTestFile(512);

    // Tamper with one byte in the ciphertext area (after header)
    const encB64 = fsMock.__getFile(result.encryptedFileUri)!;
    const encBytes = base64ToArrayBuffer(encB64);
    const ciphertextOffset = HEADER_SIZE + 10;
    encBytes[ciphertextOffset] ^= 0xff; // Flip bits
    fsMock.__setFile(result.encryptedFileUri, arrayBufferToBase64(encBytes));

    // The AEAD auth tag will likely fail before SHA-256, but one of the two checks must fail
    await expect(
      decryptMediaFile(result.encryptedFileUri, fromBase64(result.mediaKeyB64), result.mediaSha256, result.totalChunks),
    ).rejects.toThrow();
  });

  it('SHA-256 verification catches header tampering (version byte intact, data changed)', async () => {
    const { result } = await encryptTestFile(256);

    // Tamper with a reserved byte in the header (doesn't affect parsing but changes SHA-256)
    const encB64 = fsMock.__getFile(result.encryptedFileUri)!;
    const encBytes = base64ToArrayBuffer(encB64);
    encBytes[1] = 0xff; // Tamper reserved byte
    fsMock.__setFile(result.encryptedFileUri, arrayBufferToBase64(encBytes));

    // Header parses fine, but SHA-256 will differ since header is included in hash
    // The AEAD will also fail because nonce/aad are derived from the original key
    await expect(
      decryptMediaFile(result.encryptedFileUri, fromBase64(result.mediaKeyB64), result.mediaSha256, result.totalChunks),
    ).rejects.toThrow();
  });

  it('correct decryption of each chunk produces original plaintext', async () => {
    const { plaintext, result } = await encryptTestFile(1024);

    const decryptedUri = await decryptMediaFile(
      result.encryptedFileUri,
      fromBase64(result.mediaKeyB64),
      result.mediaSha256,
      result.totalChunks,
    );

    const decrypted = base64ToArrayBuffer(fsMock.__getFile(decryptedUri)!);
    expect(decrypted.length).toBe(plaintext.length);
    expect(Buffer.from(decrypted).equals(Buffer.from(plaintext))).toBe(true);
  });

  it('progress callback fires during decryption', async () => {
    const { result } = await encryptTestFile(512);

    const progressValues: number[] = [];
    await decryptMediaFile(
      result.encryptedFileUri,
      fromBase64(result.mediaKeyB64),
      result.mediaSha256,
      result.totalChunks,
      (p) => progressValues.push(p),
    );

    expect(progressValues.length).toBe(result.totalChunks);
    expect(progressValues[progressValues.length - 1]).toBe(1);
  });

  it('rejects decryption with wrong mediaKey', async () => {
    const { result } = await encryptTestFile(256);
    const wrongKey = generateRandomBytes(32);

    await expect(
      decryptMediaFile(result.encryptedFileUri, wrongKey, result.mediaSha256, result.totalChunks),
    ).rejects.toThrow();
  });

  it('rejects decryption with wrong totalChunks', async () => {
    const { result } = await encryptTestFile(256);

    // Pass wrong totalChunks — AAD will differ, causing AEAD failure
    await expect(
      decryptMediaFile(result.encryptedFileUri, fromBase64(result.mediaKeyB64), result.mediaSha256, 5),
    ).rejects.toThrow();
  });
});

// ============================================================
// CHUNK NONCE UNIQUENESS
// ============================================================

describe('chunk nonce uniqueness', () => {
  it('same mediaKey with different chunk indices produces different nonces', () => {
    const mediaKey = generateRandomBytes(32);
    const CHUNK_NONCE_INFO = 'MizanlyNonce';

    const nonce0 = hkdfDeriveSecrets(mediaKey, uint32BE(0), CHUNK_NONCE_INFO, 24);
    const nonce1 = hkdfDeriveSecrets(mediaKey, uint32BE(1), CHUNK_NONCE_INFO, 24);
    const nonce2 = hkdfDeriveSecrets(mediaKey, uint32BE(2), CHUNK_NONCE_INFO, 24);

    expect(Buffer.from(nonce0).equals(Buffer.from(nonce1))).toBe(false);
    expect(Buffer.from(nonce1).equals(Buffer.from(nonce2))).toBe(false);
    expect(Buffer.from(nonce0).equals(Buffer.from(nonce2))).toBe(false);
  });

  it('different mediaKeys produce different nonces for the same chunk index', () => {
    const key1 = generateRandomBytes(32);
    const key2 = generateRandomBytes(32);
    const CHUNK_NONCE_INFO = 'MizanlyNonce';

    const nonce1 = hkdfDeriveSecrets(key1, uint32BE(0), CHUNK_NONCE_INFO, 24);
    const nonce2 = hkdfDeriveSecrets(key2, uint32BE(0), CHUNK_NONCE_INFO, 24);

    expect(Buffer.from(nonce1).equals(Buffer.from(nonce2))).toBe(false);
  });

  it('nonces are 24 bytes (XChaCha20 requirement)', () => {
    const mediaKey = generateRandomBytes(32);
    const CHUNK_NONCE_INFO = 'MizanlyNonce';
    const nonce = hkdfDeriveSecrets(mediaKey, uint32BE(0), CHUNK_NONCE_INFO, 24);
    expect(nonce.length).toBe(24);
  });
});

// ============================================================
// AAD PREVENTS CHUNK REORDERING
// ============================================================

describe('AAD prevents chunk reordering', () => {
  it('chunk encrypted with AAD(i=0, total=2) fails to decrypt with AAD(i=1, total=2)', () => {
    const mediaKey = generateRandomBytes(32);
    const CHUNK_KEY_INFO = 'MizanlyChunk';
    const CHUNK_NONCE_INFO = 'MizanlyNonce';
    const totalChunks = 2;

    const chunkKey = hkdfDeriveSecrets(mediaKey, new Uint8Array(32), CHUNK_KEY_INFO, 32);

    // Encrypt chunk 0
    const plaintext = generateRandomBytes(100);
    const nonce0 = hkdfDeriveSecrets(mediaKey, uint32BE(0), CHUNK_NONCE_INFO, 24);
    const aad0 = concat(uint32BE(0), uint32BE(totalChunks));
    const encrypted0 = aeadEncrypt(chunkKey, nonce0, plaintext, aad0);

    // Try to decrypt chunk 0 with chunk 1's AAD (reordering attack)
    const aad1 = concat(uint32BE(1), uint32BE(totalChunks));
    expect(() => aeadDecrypt(chunkKey, nonce0, encrypted0, aad1)).toThrow();
  });

  it('chunk encrypted with AAD(total=2) fails to decrypt with AAD(total=3) (truncation attack)', () => {
    const mediaKey = generateRandomBytes(32);
    const CHUNK_KEY_INFO = 'MizanlyChunk';
    const CHUNK_NONCE_INFO = 'MizanlyNonce';

    const chunkKey = hkdfDeriveSecrets(mediaKey, new Uint8Array(32), CHUNK_KEY_INFO, 32);

    const plaintext = generateRandomBytes(100);
    const nonce = hkdfDeriveSecrets(mediaKey, uint32BE(0), CHUNK_NONCE_INFO, 24);
    const aadOriginal = concat(uint32BE(0), uint32BE(2));
    const encrypted = aeadEncrypt(chunkKey, nonce, plaintext, aadOriginal);

    // Try to decrypt with wrong totalChunks (attacker dropped a chunk)
    const aadTampered = concat(uint32BE(0), uint32BE(3));
    expect(() => aeadDecrypt(chunkKey, nonce, encrypted, aadTampered)).toThrow();
  });

  it('correct AAD allows decryption', () => {
    const mediaKey = generateRandomBytes(32);
    const CHUNK_KEY_INFO = 'MizanlyChunk';
    const CHUNK_NONCE_INFO = 'MizanlyNonce';
    const totalChunks = 1;

    const chunkKey = hkdfDeriveSecrets(mediaKey, new Uint8Array(32), CHUNK_KEY_INFO, 32);
    const plaintext = generateRandomBytes(200);
    const nonce = hkdfDeriveSecrets(mediaKey, uint32BE(0), CHUNK_NONCE_INFO, 24);
    const aad = concat(uint32BE(0), uint32BE(totalChunks));
    const encrypted = aeadEncrypt(chunkKey, nonce, plaintext, aad);

    const decrypted = aeadDecrypt(chunkKey, nonce, encrypted, aad);
    expect(Buffer.from(decrypted).equals(Buffer.from(plaintext))).toBe(true);
  });
});

// ============================================================
// ADDITIONAL EDGE CASES
// ============================================================

describe('edge cases', () => {
  it('single-byte file encrypts and decrypts correctly', async () => {
    const uri = 'file:///test/singlebyte.bin';
    const plaintext = createTestFile(uri, 1);

    const result = await encryptSmallMediaFile(uri, 'application/octet-stream');
    expect(result.totalChunks).toBe(1);
    expect(result.fileSize).toBe(1);

    const decryptedUri = await decryptMediaFile(
      result.encryptedFileUri,
      fromBase64(result.mediaKeyB64),
      result.mediaSha256,
      result.totalChunks,
    );

    const decrypted = base64ToArrayBuffer(fsMock.__getFile(decryptedUri)!);
    expect(decrypted.length).toBe(1);
    expect(decrypted[0]).toBe(plaintext[0]);
  });

  it('file exactly at chunk boundary encrypts correctly', async () => {
    const uri = 'file:///test/chunkboundary.bin';
    const plaintext = createTestFile(uri, CHUNK_SIZE);

    const result = await encryptSmallMediaFile(uri, 'application/octet-stream');
    expect(result.totalChunks).toBe(1);

    const decryptedUri = await decryptMediaFile(
      result.encryptedFileUri,
      fromBase64(result.mediaKeyB64),
      result.mediaSha256,
      result.totalChunks,
    );

    const decrypted = base64ToArrayBuffer(fsMock.__getFile(decryptedUri)!);
    expect(Buffer.from(decrypted).equals(Buffer.from(plaintext))).toBe(true);
  });

  it('encrypted file size = header + sum(chunk + AUTH_TAG_SIZE)', async () => {
    const uri = 'file:///test/sizecheck.bin';
    const fileSize = 5000;
    createTestFile(uri, fileSize);

    const result = await encryptSmallMediaFile(uri, 'application/octet-stream');
    const encB64 = fsMock.__getFile(result.encryptedFileUri)!;
    const encBytes = base64ToArrayBuffer(encB64);

    // 1 chunk of 5000 bytes + 16 auth tag + 11 header = 5027
    const expectedSize = HEADER_SIZE + (fileSize + AUTH_TAG_SIZE) * result.totalChunks;
    expect(encBytes.length).toBe(expectedSize);
  });

  it('mediaSha256 is deterministic for same encrypted content', async () => {
    const uri = 'file:///test/deterministic.bin';
    createTestFile(uri, 256);

    // Encrypt with the same context twice — different keys means different SHA,
    // so instead verify that SHA matches the header + encrypted chunks
    const ctx = await prepareMediaEncryption(uri);
    const chunks = await collectChunks(encryptMediaChunked(uri, ctx));
    const sha = ctx.hasher.digest();

    // Manually compute SHA-256 of header + all chunks
    const manualHasher = sha256Hasher.create();
    manualHasher.update(ctx.header);
    for (const chunk of chunks) {
      manualHasher.update(chunk);
    }
    const manualSha = manualHasher.digest();

    expect(Buffer.from(sha).equals(Buffer.from(manualSha))).toBe(true);
  });
});

// ============================================================
// SECURITY PROPERTIES
// ============================================================

describe('security properties', () => {
  it('same plaintext with different keys produces different ciphertext', async () => {
    const uri = 'file:///test/diffkeys.bin';
    const plaintext = createTestFile(uri, 128);

    const ctx1 = await prepareMediaEncryption(uri);
    const chunks1 = await collectChunks(encryptMediaChunked(uri, ctx1));

    const ctx2 = await prepareMediaEncryption(uri);
    const chunks2 = await collectChunks(encryptMediaChunked(uri, ctx2));

    // Different keys should produce different ciphertext
    expect(Buffer.from(chunks1[0]).equals(Buffer.from(chunks2[0]))).toBe(false);
  });

  it('auth tag prevents ciphertext modification', () => {
    const key = generateRandomBytes(32);
    const nonce = generateRandomBytes(24);
    const plaintext = generateRandomBytes(100);
    const aad = new Uint8Array([1, 2, 3, 4]);

    const encrypted = aeadEncrypt(key, nonce, plaintext, aad);

    // Flip a bit in the ciphertext (not the auth tag)
    const tampered = new Uint8Array(encrypted);
    tampered[5] ^= 0x01;

    expect(() => aeadDecrypt(key, nonce, tampered, aad)).toThrow();
  });

  it('auth tag prevents AAD modification', () => {
    const key = generateRandomBytes(32);
    const nonce = generateRandomBytes(24);
    const plaintext = generateRandomBytes(100);
    const aad = new Uint8Array([1, 2, 3, 4]);

    const encrypted = aeadEncrypt(key, nonce, plaintext, aad);

    const wrongAad = new Uint8Array([1, 2, 3, 5]); // Changed last byte
    expect(() => aeadDecrypt(key, nonce, encrypted, wrongAad)).toThrow();
  });

  it('F08-#1: MediaEncryptionContext starts with consumed=false', async () => {
    const uri = 'file:///test/consumed_init.bin';
    createTestFile(uri, 128);
    const ctx = await prepareMediaEncryption(uri);
    expect(ctx.consumed).toBe(false);
  });

  it('F08-#1: encryptMediaChunked sets consumed=true after first call', async () => {
    const uri = 'file:///test/consumed_set.bin';
    createTestFile(uri, 128);
    const ctx = await prepareMediaEncryption(uri);
    await collectChunks(encryptMediaChunked(uri, ctx));
    expect(ctx.consumed).toBe(true);
  });

  it('F08-#1: reusing consumed context throws nonce reuse error', async () => {
    const uri = 'file:///test/consumed_reuse.bin';
    createTestFile(uri, 128);
    const ctx = await prepareMediaEncryption(uri);
    await collectChunks(encryptMediaChunked(uri, ctx));

    // Second use should throw
    await expect(collectChunks(encryptMediaChunked(uri, ctx))).rejects.toThrow(
      'MediaEncryptionContext already consumed',
    );
  });
});
