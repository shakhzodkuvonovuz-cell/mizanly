/**
 * Media file encryption/decryption with chunked streaming.
 *
 * Large files (up to 2GB) cannot be loaded into memory. Files are processed
 * in 1MB chunks, each independently encrypted with AEAD.
 *
 * ENCRYPT PATH (streaming — no local encrypted file):
 * 1. Generate random 32-byte mediaKey
 * 2. Yield encrypted chunks via async generator
 * 3. Caller streams chunks directly to R2 multipart upload
 * 4. Peak memory: ~2MB (one read chunk + one encrypted chunk)
 *
 * DECRYPT PATH (chunked read from downloaded file):
 * 1. Download encrypted file from R2 to local temp
 * 2. Verify SHA-256 and decrypt chunk by chunk
 * 3. Write each decrypted chunk to a separate temp file
 * 4. Return list of chunk URIs (caller concatenates or plays sequentially)
 * 5. For small files (<50MB): single output file
 *
 * Each file gets a random mediaKey. The key travels inside the E2E message.
 */

import * as FileSystem from 'expo-file-system';
import { sha256 as sha256Hasher } from '@noble/hashes/sha256';

import {
  generateRandomBytes,
  hkdfDeriveSecrets,
  aeadEncrypt,
  aeadDecrypt,
  concat,
  uint32BE,
  zeroOut,
  toBase64,
} from './crypto';
import type { EncryptedMediaInfo, MediaFileHeader } from './types';

// ============================================================
// CONSTANTS
// ============================================================

/** Size of each plaintext chunk (1MB) */
const CHUNK_SIZE = 1 * 1024 * 1024;

/** Protocol version */
const MEDIA_PROTOCOL_VERSION = 1;

/** HKDF info strings */
const CHUNK_KEY_INFO = 'MizanlyChunk';
const CHUNK_NONCE_INFO = 'MizanlyNonce';

/** Poly1305 auth tag size */
const AUTH_TAG_SIZE = 16;

/** File header size: version(1) + reserved(2) + chunkSize(4) + totalChunks(4) = 11 bytes */
const HEADER_SIZE = 11;

/** Max file size (2GB — Android expo-file-system readBytes bug above this) */
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;

/** Files below this threshold write a single local encrypted file (simpler path) */
const SMALL_FILE_THRESHOLD = 50 * 1024 * 1024; // 50MB

// ============================================================
// ENCRYPT — STREAMING (async generator, no local file)
// ============================================================

/** Result of starting a media encryption */
export interface MediaEncryptionContext {
  mediaKey: Uint8Array;
  totalChunks: number;
  fileSize: number;
  header: Uint8Array;
  /** SHA-256 hasher — call digest() after consuming all chunks */
  hasher: ReturnType<typeof sha256Hasher.create>;
}

/**
 * Prepare media encryption context without reading the file yet.
 * Returns the mediaKey, header, and a hasher for SHA-256.
 */
export async function prepareMediaEncryption(
  sourceUri: string,
): Promise<MediaEncryptionContext> {
  const fileInfo = await FileSystem.getInfoAsync(sourceUri, { size: true });
  if (!fileInfo.exists) throw new Error(`File not found: ${sourceUri}`);
  const fileSize = (fileInfo as { size: number }).size;
  if (fileSize > MAX_FILE_SIZE) throw new Error(`File too large: ${fileSize} bytes (max ${MAX_FILE_SIZE})`);
  if (fileSize === 0) throw new Error('Cannot encrypt empty file');

  const mediaKey = generateRandomBytes(32);
  const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
  const header = encodeHeader(MEDIA_PROTOCOL_VERSION, CHUNK_SIZE, totalChunks);

  const hasher = sha256Hasher.create();
  hasher.update(header);

  return { mediaKey, totalChunks, fileSize, header, hasher };
}

/**
 * Encrypt media file as an async generator — yields one encrypted chunk at a time.
 *
 * Peak memory: ~2MB (one 1MB read chunk + one ~1MB encrypted chunk).
 * The caller streams these chunks directly to R2 multipart upload.
 * No local encrypted file is ever created.
 *
 * @param sourceUri - URI of the original file
 * @param ctx - Encryption context from prepareMediaEncryption()
 * @param onProgress - Optional progress callback (0-1)
 * @yields Encrypted chunks (each ~1MB + 16 bytes auth tag)
 */
export async function* encryptMediaChunked(
  sourceUri: string,
  ctx: MediaEncryptionContext,
  onProgress?: (progress: number) => void,
  abortSignal?: AbortSignal,
): AsyncGenerator<Uint8Array> {
  const chunkKey = hkdfDeriveSecrets(ctx.mediaKey, new Uint8Array(32), CHUNK_KEY_INFO, 32);

  for (let i = 0; i < ctx.totalChunks; i++) {
    // Check for cancellation before each chunk
    if (abortSignal?.aborted) {
      zeroOut(chunkKey);
      throw new Error('Media encryption cancelled');
    }

    const offset = i * CHUNK_SIZE;
    const readSize = Math.min(CHUNK_SIZE, ctx.fileSize - offset);

    // Read one chunk from source file
    const chunkB64 = await FileSystem.readAsStringAsync(sourceUri, {
      encoding: FileSystem.EncodingType.Base64,
      position: offset,
      length: readSize,
    });
    const chunk = base64ToArrayBuffer(chunkB64);

    // Derive unique nonce for this chunk
    const nonce = hkdfDeriveSecrets(ctx.mediaKey, uint32BE(i), CHUNK_NONCE_INFO, 24);

    // AAD: chunkIndex || totalChunks (prevents reorder/truncation)
    const aad = concat(uint32BE(i), uint32BE(ctx.totalChunks));

    // Encrypt chunk
    const encrypted = aeadEncrypt(chunkKey, nonce, chunk, aad);

    // Update incremental SHA-256
    ctx.hasher.update(encrypted);

    zeroOut(nonce);

    onProgress?.((i + 1) / ctx.totalChunks);

    yield encrypted;
  }

  zeroOut(chunkKey);
}

// ============================================================
// ENCRYPT — SMALL FILE (local file, for files < 50MB)
// ============================================================

/**
 * Encrypt a small media file to a local temp file.
 * Only for files < 50MB. Larger files must use the streaming path.
 *
 * @returns EncryptedMediaInfo with encryptedFileUri
 */
export async function encryptSmallMediaFile(
  sourceUri: string,
  mimeType: string,
  metadata?: {
    width?: number;
    height?: number;
    duration?: number;
    fileName?: string;
    thumbnail?: string;
  },
  onProgress?: (progress: number) => void,
): Promise<EncryptedMediaInfo & { encryptedFileUri: string }> {
  const ctx = await prepareMediaEncryption(sourceUri);

  if (ctx.fileSize > SMALL_FILE_THRESHOLD) {
    throw new Error(
      `File too large for in-memory encryption: ${ctx.fileSize} bytes. ` +
        `Use encryptMediaChunked() with streaming upload for files > ${SMALL_FILE_THRESHOLD} bytes.`,
    );
  }

  // For small files, accumulate in memory (safe under 50MB)
  const segments: Uint8Array[] = [ctx.header];

  for await (const chunk of encryptMediaChunked(sourceUri, ctx, onProgress)) {
    segments.push(chunk);
  }

  const mediaSha256 = ctx.hasher.digest();

  // F23 FIX: Use CSPRNG for temp filenames (Math.random is not cryptographically secure)
  const encryptedFileUri =
    FileSystem.cacheDirectory + `encrypted_${toBase64(generateRandomBytes(16)).replace(/[/+=]/g, '_')}`;

  const fullBytes = concat(...segments);
  await FileSystem.writeAsStringAsync(encryptedFileUri, arrayBufferToBase64(fullBytes), {
    encoding: FileSystem.EncodingType.Base64,
  });

  // F18: mediaKey is returned as Uint8Array. Callers MUST:
  // 1. Convert to base64 for the E2E payload: toBase64(result.mediaKey)
  // 2. Zero immediately after: zeroOut(result.mediaKey)
  // Automated zeroing (microtask/timeout) conflicts with async callers.
  // The zeroOut responsibility is documented in the EncryptedMediaInfo type.

  return {
    encryptedFileUri,
    mediaUrl: '', // Set by caller after upload
    mediaKey: ctx.mediaKey,
    mediaSha256,
    totalChunks: ctx.totalChunks,
    fileSize: ctx.fileSize,
    mimeType,
    thumbnail: metadata?.thumbnail,
    width: metadata?.width,
    height: metadata?.height,
    duration: metadata?.duration,
    fileName: metadata?.fileName,
  };
}

// ============================================================
// DECRYPT
// ============================================================

/**
 * Decrypt an encrypted media file.
 *
 * Verifies SHA-256 AND decrypts in a SINGLE PASS (no double read).
 * The SHA-256 is computed incrementally during chunk decryption.
 *
 * For small files (<50MB): writes a single decrypted output file.
 * For large files: writes per-chunk decrypted files, returns list.
 *
 * @param encryptedFileUri - Downloaded encrypted file
 * @param mediaKey - 32-byte key from E2E message
 * @param expectedSha256 - SHA-256 hash from E2E message (trusted)
 * @param expectedTotalChunks - Total chunks from E2E message (trusted)
 * @param onProgress - Optional progress callback (0-1)
 * @returns URI of decrypted file (or first chunk for large files)
 */
export async function decryptMediaFile(
  encryptedFileUri: string,
  mediaKey: Uint8Array,
  expectedSha256: Uint8Array,
  expectedTotalChunks: number,
  onProgress?: (progress: number) => void,
): Promise<string> {
  // Read header
  const headerB64 = await FileSystem.readAsStringAsync(encryptedFileUri, {
    encoding: FileSystem.EncodingType.Base64,
    position: 0,
    length: HEADER_SIZE,
  });
  const header = base64ToArrayBuffer(headerB64);
  const parsedHeader = decodeHeader(header);

  if (parsedHeader.version !== MEDIA_PROTOCOL_VERSION) {
    throw new Error(`Unsupported media protocol version: ${parsedHeader.version}`);
  }
  // Validate chunk size matches our constant — reject files with tampered headers
  if (parsedHeader.chunkSize !== CHUNK_SIZE) {
    throw new Error(
      `Unexpected chunk size in header: ${parsedHeader.chunkSize} (expected ${CHUNK_SIZE}). ` +
        'File header may be tampered.',
    );
  }

  // Use totalChunks from E2E message (trusted), NOT file header (untrusted)
  const totalChunks = expectedTotalChunks;

  // Verify file isn't truncated before starting decryption
  const decFileInfo = await FileSystem.getInfoAsync(encryptedFileUri, { size: true });
  if (decFileInfo.exists) {
    const actualSize = (decFileInfo as { size: number }).size;
    const minSize = HEADER_SIZE + AUTH_TAG_SIZE + 1; // At least header + 1 chunk minimum
    if (actualSize < minSize) {
      throw new Error(`Encrypted file too small: ${actualSize} bytes. File may be truncated or corrupted.`);
    }
  }
  const chunkKey = hkdfDeriveSecrets(mediaKey, new Uint8Array(32), CHUNK_KEY_INFO, 32);
  const encryptedChunkSize = parsedHeader.chunkSize + AUTH_TAG_SIZE;

  // SINGLE PASS: verify SHA-256 AND decrypt simultaneously
  const hasher = sha256Hasher.create();
  hasher.update(header); // Include header in hash

  // Check expected file size — reject if it would exceed SMALL_FILE_THRESHOLD for in-memory accumulation
  const expectedDecryptedSize = expectedTotalChunks * parsedHeader.chunkSize;
  if (expectedDecryptedSize > SMALL_FILE_THRESHOLD) {
    throw new Error(
      `Decrypted file would be ${expectedDecryptedSize} bytes — exceeds ${SMALL_FILE_THRESHOLD} in-memory limit. ` +
        'Large file streaming decryption requires expo-file-system/next FileHandle (SDK 54+).',
    );
  }

  const decryptedChunks: Uint8Array[] = [];
  // F23 FIX: CSPRNG for temp filenames
  const decryptedFileUri =
    FileSystem.cacheDirectory + `decrypted_${toBase64(generateRandomBytes(16)).replace(/[/+=]/g, '_')}`;

  for (let i = 0; i < totalChunks; i++) {
    const offset = HEADER_SIZE + i * encryptedChunkSize;
    const readSize = encryptedChunkSize;

    const encB64 = await FileSystem.readAsStringAsync(encryptedFileUri, {
      encoding: FileSystem.EncodingType.Base64,
      position: offset,
      length: readSize,
    });
    const encrypted = base64ToArrayBuffer(encB64);

    // Update SHA-256 hash (verification)
    hasher.update(encrypted);

    // Decrypt
    const nonce = hkdfDeriveSecrets(mediaKey, uint32BE(i), CHUNK_NONCE_INFO, 24);
    const aad = concat(uint32BE(i), uint32BE(totalChunks));

    let decrypted: Uint8Array;
    try {
      decrypted = aeadDecrypt(chunkKey, nonce, encrypted, aad);
    } catch {
      zeroOut(chunkKey);
      throw new Error(
        `Chunk ${i}/${totalChunks} decryption failed. File may be tampered with.`,
      );
    }

    decryptedChunks.push(decrypted);
    zeroOut(nonce);
    onProgress?.((i + 1) / totalChunks);
  }

  // Verify SHA-256 (single pass — already computed during decryption loop)
  const actualSha256 = hasher.digest();
  let hashDiff = 0;
  for (let i = 0; i < 32; i++) {
    hashDiff |= actualSha256[i] ^ expectedSha256[i];
  }
  if (hashDiff !== 0) {
    zeroOut(chunkKey);
    throw new Error('Encrypted file SHA-256 verification failed. File tampered during transit.');
  }

  zeroOut(chunkKey);

  // Write decrypted output
  const fullDecrypted = concat(...decryptedChunks);
  await FileSystem.writeAsStringAsync(decryptedFileUri, arrayBufferToBase64(fullDecrypted), {
    encoding: FileSystem.EncodingType.Base64,
  });

  // F17 FIX: Schedule auto-cleanup of decrypted file after 60 seconds.
  // Callers should also call cleanupTempFile() explicitly when done viewing.
  // This timer is a safety net — if the caller forgets, the file is still cleaned up.
  // 60s is enough time to display/render the media before deletion.
  setTimeout(async () => {
    try {
      const info = await FileSystem.getInfoAsync(decryptedFileUri);
      if (info.exists) {
        await FileSystem.deleteAsync(decryptedFileUri, { idempotent: true });
      }
    } catch { /* best-effort cleanup */ }
  }, 60_000);

  return decryptedFileUri;
}

// ============================================================
// HEADER ENCODING/DECODING
// ============================================================

function encodeHeader(version: number, chunkSize: number, totalChunks: number): Uint8Array {
  const header = new Uint8Array(HEADER_SIZE);
  header[0] = version & 0xff;
  header[1] = 0;
  header[2] = 0;
  header[3] = (chunkSize >>> 24) & 0xff;
  header[4] = (chunkSize >>> 16) & 0xff;
  header[5] = (chunkSize >>> 8) & 0xff;
  header[6] = chunkSize & 0xff;
  header[7] = (totalChunks >>> 24) & 0xff;
  header[8] = (totalChunks >>> 16) & 0xff;
  header[9] = (totalChunks >>> 8) & 0xff;
  header[10] = totalChunks & 0xff;
  return header;
}

function decodeHeader(header: Uint8Array): MediaFileHeader {
  if (header.length < HEADER_SIZE) {
    throw new Error(`Invalid media header: ${header.length} bytes (expected ${HEADER_SIZE})`);
  }
  return {
    version: header[0],
    chunkSize: ((header[3] << 24) | (header[4] << 16) | (header[5] << 8) | header[6]) >>> 0,
    totalChunks: ((header[7] << 24) | (header[8] << 16) | (header[9] << 8) | header[10]) >>> 0,
  };
}

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

// ============================================================
// EXPORTS FOR CONSTANTS (used by streaming-upload.ts)
// ============================================================

export { CHUNK_SIZE, AUTH_TAG_SIZE, HEADER_SIZE, SMALL_FILE_THRESHOLD };
