/**
 * Exhaustive tests for signal/streaming-upload.ts
 *
 * Tests every exported function with:
 * - Routing logic (small file -> single PUT, large file -> multipart)
 * - Single PUT: presigned URL request, upload call, return value
 * - Multipart: initiate -> presign parts -> upload parts -> complete
 * - Correct part sizes and ETag collection
 * - Progress callback at each stage
 * - Error handling for every failure point (initiate, presign, part upload, complete)
 * - Missing ETag handling
 * - Download: temp file creation, progress callback
 * - Cleanup: delete existing file, handle missing file gracefully
 */

import * as FileSystem from 'expo-file-system';

import {
  uploadEncryptedMedia,
  downloadEncryptedMedia,
  cleanupTempFile,
} from '../streaming-upload';

// Access test helpers on the mock
const fsMock = FileSystem as unknown as {
  __reset: () => void;
  __setFile: (uri: string, base64Content: string) => void;
  __getFile: (uri: string) => string | undefined;
  __getFiles: () => Map<string, string>;
  __setSizeOverride: (uri: string, size: number) => void;
  __setUploadAsync: (fn: ((...args: any[]) => any) | null) => void;
  __setCreateDownloadResumable: (fn: ((...args: any[]) => any) | null) => void;
  __setDeleteAsync: (fn: ((...args: any[]) => any) | null) => void;
};

// ============================================================
// CONSTANTS (matching the source file)
// ============================================================

const MULTIPART_PART_SIZE = 5 * 1024 * 1024; // 5MB
const MULTIPART_THRESHOLD = MULTIPART_PART_SIZE;
const API_BASE = 'https://api.test.com/api/v1';
const AUTH_TOKEN = 'test-jwt-token';

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

/** Create a mock fetch that resolves with the given responses in sequence */
function createSequentialFetch(responses: Array<{
  ok: boolean;
  status: number;
  json?: () => Promise<any>;
  headers?: { get: (name: string) => string | null };
}>) {
  let callIndex = 0;
  return jest.fn().mockImplementation(() => {
    const response = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return Promise.resolve({
      ok: response.ok,
      status: response.status,
      json: response.json ?? (() => Promise.resolve({})),
      headers: response.headers ?? { get: () => null },
    });
  });
}

/** Create a test file of given size (filled with zeros for speed) */
function createTestFile(uri: string, sizeBytes: number): void {
  const data = new Uint8Array(sizeBytes);
  fsMock.__setFile(uri, arrayBufferToBase64(data));
}

// Track uploadAsync calls
let uploadAsyncCalls: Array<{ url: string; fileUri: string; opts: any }> = [];

// Save original fetch
const originalFetch = global.fetch;

beforeEach(() => {
  fsMock.__reset();
  uploadAsyncCalls = [];
  global.fetch = originalFetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

/** Set up the mock uploadAsync to track calls and return a specific result */
function mockUploadAsync(result: { status: number }) {
  fsMock.__setUploadAsync((url: string, fileUri: string, opts: any) => {
    uploadAsyncCalls.push({ url, fileUri, opts });
    return Promise.resolve({ status: result.status, headers: {}, body: '', mimeType: null });
  });
}

// ============================================================
// uploadEncryptedMedia -- ROUTING
// ============================================================

describe('uploadEncryptedMedia routing', () => {
  it('routes to single PUT for files <= 5MB', async () => {
    const uri = 'file:///test/small.enc';
    createTestFile(uri, 1024);

    global.fetch = createSequentialFetch([
      {
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          url: 'https://r2.test.com/presigned-put',
          publicUrl: 'https://cdn.test.com/encrypted/file.enc',
        }),
      },
    ]);

    mockUploadAsync({ status: 200 });

    const result = await uploadEncryptedMedia(uri, 1024, API_BASE, AUTH_TOKEN);

    expect(result).toBe('https://cdn.test.com/encrypted/file.enc');
    expect(uploadAsyncCalls.length).toBe(1);

    // Verify presigned URL was requested with correct parameters
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(fetchCall[0]).toBe(`${API_BASE}/upload/presigned-url`);
    expect(fetchCall[1].method).toBe('POST');
  });

  it('routes to single PUT for files exactly at threshold', async () => {
    const uri = 'file:///test/exact.enc';
    createTestFile(uri, MULTIPART_THRESHOLD);

    global.fetch = createSequentialFetch([
      {
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          url: 'https://r2.test.com/presigned-put',
          publicUrl: 'https://cdn.test.com/encrypted/exact.enc',
        }),
      },
    ]);

    mockUploadAsync({ status: 200 });

    const result = await uploadEncryptedMedia(uri, MULTIPART_THRESHOLD, API_BASE, AUTH_TOKEN);
    expect(result).toBe('https://cdn.test.com/encrypted/exact.enc');
    expect(uploadAsyncCalls.length).toBe(1);
  });

  it('routes to multipart for files > 5MB', async () => {
    const uri = 'file:///test/large.enc';
    const fileSize = MULTIPART_THRESHOLD + 1;
    createTestFile(uri, fileSize);

    // Multipart: initiate -> presign part 1 -> upload part 1 -> presign part 2 -> upload part 2 -> complete
    global.fetch = createSequentialFetch([
      // 1. Initiate multipart
      {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ uploadId: 'upload-123', key: 'encrypted/large.enc' }),
      },
      // 2. Presign part 1
      {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ url: 'https://r2.test.com/part1', partNumber: 1 }),
      },
      // 3. Upload part 1
      {
        ok: true,
        status: 200,
        headers: { get: (name: string) => name === 'ETag' ? '"etag1"' : null },
      },
      // 4. Presign part 2
      {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ url: 'https://r2.test.com/part2', partNumber: 2 }),
      },
      // 5. Upload part 2
      {
        ok: true,
        status: 200,
        headers: { get: (name: string) => name === 'ETag' ? '"etag2"' : null },
      },
      // 6. Complete multipart
      {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ publicUrl: 'https://cdn.test.com/encrypted/large.enc' }),
      },
    ]);

    const result = await uploadEncryptedMedia(uri, fileSize, API_BASE, AUTH_TOKEN);
    expect(result).toBe('https://cdn.test.com/encrypted/large.enc');

    // Verify initiate was called
    const initiateCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(initiateCall[0]).toBe(`${API_BASE}/upload/multipart/initiate`);
    // uploadAsync should NOT have been called (multipart uses fetch)
    expect(uploadAsyncCalls.length).toBe(0);
  });
});

// ============================================================
// SINGLE PUT -- DETAILS
// ============================================================

describe('single PUT upload', () => {
  it('sends correct Content-Type and Authorization headers for presigned URL', async () => {
    const uri = 'file:///test/singleput.enc';
    createTestFile(uri, 512);

    global.fetch = createSequentialFetch([
      {
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          url: 'https://r2.test.com/presigned',
          publicUrl: 'https://cdn.test.com/file.enc',
        }),
      },
    ]);

    mockUploadAsync({ status: 200 });

    await uploadEncryptedMedia(uri, 512, API_BASE, AUTH_TOKEN);

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(fetchCall[1].headers['Content-Type']).toBe('application/json');
    expect(fetchCall[1].headers.Authorization).toBe(`Bearer ${AUTH_TOKEN}`);

    const body = JSON.parse(fetchCall[1].body);
    expect(body.contentType).toBe('application/octet-stream');
    expect(body.folder).toBe('encrypted');
    expect(body.expiresIn).toBe(1800);
  });

  it('calls FileSystem.uploadAsync with correct parameters', async () => {
    const uri = 'file:///test/uploadcall.enc';
    createTestFile(uri, 256);

    const presignedUrl = 'https://r2.test.com/presigned-put-url';
    global.fetch = createSequentialFetch([
      {
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          url: presignedUrl,
          publicUrl: 'https://cdn.test.com/file.enc',
        }),
      },
    ]);

    mockUploadAsync({ status: 200 });

    await uploadEncryptedMedia(uri, 256, API_BASE, AUTH_TOKEN);

    expect(uploadAsyncCalls.length).toBe(1);
    expect(uploadAsyncCalls[0].url).toBe(presignedUrl);
    expect(uploadAsyncCalls[0].fileUri).toBe(uri);
    expect(uploadAsyncCalls[0].opts.httpMethod).toBe('PUT');
    expect(uploadAsyncCalls[0].opts.headers['Content-Type']).toBe('application/octet-stream');
    expect(uploadAsyncCalls[0].opts.uploadType).toBe(FileSystem.FileSystemUploadType.BINARY_CONTENT);
  });

  it('returns publicUrl from presigned URL response', async () => {
    const uri = 'file:///test/returnurl.enc';
    createTestFile(uri, 128);

    const expectedUrl = 'https://cdn.test.com/encrypted/abc123.enc';
    global.fetch = createSequentialFetch([
      {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ url: 'https://r2.test.com/put', publicUrl: expectedUrl }),
      },
    ]);

    mockUploadAsync({ status: 200 });

    const result = await uploadEncryptedMedia(uri, 128, API_BASE, AUTH_TOKEN);
    expect(result).toBe(expectedUrl);
  });

  it('calls progress callback with 1 on completion', async () => {
    const uri = 'file:///test/progress.enc';
    createTestFile(uri, 256);

    global.fetch = createSequentialFetch([
      {
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          url: 'https://r2.test.com/put',
          publicUrl: 'https://cdn.test.com/file.enc',
        }),
      },
    ]);

    mockUploadAsync({ status: 200 });

    const progressValues: number[] = [];
    await uploadEncryptedMedia(uri, 256, API_BASE, AUTH_TOKEN, (p) => progressValues.push(p));

    expect(progressValues).toContain(1);
  });

  it('throws when presigned URL request fails', async () => {
    const uri = 'file:///test/fail1.enc';
    createTestFile(uri, 256);

    global.fetch = createSequentialFetch([
      { ok: false, status: 403 },
    ]);

    await expect(uploadEncryptedMedia(uri, 256, API_BASE, AUTH_TOKEN)).rejects.toThrow(
      'Failed to get presigned URL: 403',
    );
  });

  it('throws when upload fails with non-2xx status', async () => {
    const uri = 'file:///test/fail2.enc';
    createTestFile(uri, 256);

    global.fetch = createSequentialFetch([
      {
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          url: 'https://r2.test.com/put',
          publicUrl: 'https://cdn.test.com/file.enc',
        }),
      },
    ]);

    mockUploadAsync({ status: 500 });

    await expect(uploadEncryptedMedia(uri, 256, API_BASE, AUTH_TOKEN)).rejects.toThrow(
      'Upload failed: 500',
    );
  });
});

// ============================================================
// MULTIPART UPLOAD -- DETAILS
// ============================================================

describe('multipart upload', () => {
  const fileSize = MULTIPART_PART_SIZE * 2 + 1000; // 3 parts

  function setupMultipartMocks(options?: {
    initiateOk?: boolean;
    initiateStatus?: number;
    partUploadOk?: boolean[];
    partUploadStatus?: number[];
    partETags?: (string | null)[];
    completeOk?: boolean;
    completeStatus?: number;
  }) {
    const opts = {
      initiateOk: true,
      initiateStatus: 200,
      partUploadOk: [true, true, true],
      partUploadStatus: [200, 200, 200],
      partETags: ['"etag-1"', '"etag-2"', '"etag-3"'] as (string | null)[],
      completeOk: true,
      completeStatus: 200,
      ...options,
    };

    const responses: any[] = [];

    // Initiate
    responses.push({
      ok: opts.initiateOk,
      status: opts.initiateStatus,
      json: () => Promise.resolve({ uploadId: 'mp-upload-456', key: 'encrypted/multipart.enc' }),
    });

    // For each part: presign + upload
    for (let i = 0; i < 3; i++) {
      // Presign
      responses.push({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ url: `https://r2.test.com/part${i + 1}`, partNumber: i + 1 }),
      });
      // Upload
      responses.push({
        ok: opts.partUploadOk[i] ?? true,
        status: opts.partUploadStatus[i] ?? 200,
        headers: {
          get: (name: string) => name === 'ETag' ? (opts.partETags[i] ?? null) : null,
        },
      });
    }

    // Complete
    responses.push({
      ok: opts.completeOk,
      status: opts.completeStatus,
      json: () => Promise.resolve({ publicUrl: 'https://cdn.test.com/encrypted/multipart.enc' }),
    });

    global.fetch = jest.fn().mockImplementation(() => {
      const response = responses.shift();
      return Promise.resolve(response);
    });
  }

  beforeEach(() => {
    const uri = 'file:///test/multipart.enc';
    createTestFile(uri, fileSize);
  });

  it('initiates multipart upload with correct request', async () => {
    setupMultipartMocks();
    await uploadEncryptedMedia('file:///test/multipart.enc', fileSize, API_BASE, AUTH_TOKEN);

    const initiateCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(initiateCall[0]).toBe(`${API_BASE}/upload/multipart/initiate`);
    expect(initiateCall[1].method).toBe('POST');
    const body = JSON.parse(initiateCall[1].body);
    expect(body.contentType).toBe('application/octet-stream');
    expect(body.folder).toBe('encrypted');
  });

  it('requests presigned URLs for each part with correct query params', async () => {
    setupMultipartMocks();
    await uploadEncryptedMedia('file:///test/multipart.enc', fileSize, API_BASE, AUTH_TOKEN);

    // Calls: initiate, [presign1, upload1, presign2, upload2, presign3, upload3], complete
    const presignCall1 = (global.fetch as jest.Mock).mock.calls[1];
    expect(presignCall1[0]).toContain(`${API_BASE}/upload/multipart/presign`);
    expect(presignCall1[0]).toContain('uploadId=mp-upload-456');
    expect(presignCall1[0]).toContain('partNumber=1');
    expect(presignCall1[0]).toContain('key=encrypted%2Fmultipart.enc');

    const presignCall2 = (global.fetch as jest.Mock).mock.calls[3];
    expect(presignCall2[0]).toContain('partNumber=2');

    const presignCall3 = (global.fetch as jest.Mock).mock.calls[5];
    expect(presignCall3[0]).toContain('partNumber=3');
  });

  it('uploads each part with PUT to presigned URL', async () => {
    setupMultipartMocks();
    await uploadEncryptedMedia('file:///test/multipart.enc', fileSize, API_BASE, AUTH_TOKEN);

    // Part upload calls are at indices 2, 4, 6
    const uploadCall1 = (global.fetch as jest.Mock).mock.calls[2];
    expect(uploadCall1[0]).toBe('https://r2.test.com/part1');
    expect(uploadCall1[1].method).toBe('PUT');
    expect(uploadCall1[1].headers['Content-Type']).toBe('application/octet-stream');

    const uploadCall2 = (global.fetch as jest.Mock).mock.calls[4];
    expect(uploadCall2[0]).toBe('https://r2.test.com/part2');

    const uploadCall3 = (global.fetch as jest.Mock).mock.calls[6];
    expect(uploadCall3[0]).toBe('https://r2.test.com/part3');
  });

  it('sends correct Content-Length for each part', async () => {
    setupMultipartMocks();
    await uploadEncryptedMedia('file:///test/multipart.enc', fileSize, API_BASE, AUTH_TOKEN);

    // Part 1 and 2 are full 5MB, part 3 is 1000 bytes
    const uploadCall1 = (global.fetch as jest.Mock).mock.calls[2];
    expect(uploadCall1[1].headers['Content-Length']).toBe(String(MULTIPART_PART_SIZE));

    const uploadCall2 = (global.fetch as jest.Mock).mock.calls[4];
    expect(uploadCall2[1].headers['Content-Length']).toBe(String(MULTIPART_PART_SIZE));

    const uploadCall3 = (global.fetch as jest.Mock).mock.calls[6];
    expect(uploadCall3[1].headers['Content-Length']).toBe(String(1000));
  });

  it('collects ETags and sends them in complete request', async () => {
    setupMultipartMocks();
    await uploadEncryptedMedia('file:///test/multipart.enc', fileSize, API_BASE, AUTH_TOKEN);

    // Complete call is the last one
    const completeCall = (global.fetch as jest.Mock).mock.calls[7];
    expect(completeCall[0]).toBe(`${API_BASE}/upload/multipart/complete`);
    expect(completeCall[1].method).toBe('POST');

    const body = JSON.parse(completeCall[1].body);
    expect(body.uploadId).toBe('mp-upload-456');
    expect(body.key).toBe('encrypted/multipart.enc');
    expect(body.parts).toEqual([
      { partNumber: 1, etag: '"etag-1"' },
      { partNumber: 2, etag: '"etag-2"' },
      { partNumber: 3, etag: '"etag-3"' },
    ]);
  });

  it('progress callback fires during multipart upload', async () => {
    setupMultipartMocks();
    const progressValues: number[] = [];
    await uploadEncryptedMedia(
      'file:///test/multipart.enc',
      fileSize,
      API_BASE,
      AUTH_TOKEN,
      (p) => progressValues.push(p),
    );

    // Should fire after each part upload
    expect(progressValues.length).toBeGreaterThanOrEqual(3);
    // Last value should be 1 (from onProgress?.(1) after complete)
    expect(progressValues[progressValues.length - 1]).toBe(1);
    // Values should be monotonically increasing
    for (let i = 1; i < progressValues.length; i++) {
      expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
    }
  });

  it('returns publicUrl from complete response', async () => {
    setupMultipartMocks();
    const result = await uploadEncryptedMedia(
      'file:///test/multipart.enc',
      fileSize,
      API_BASE,
      AUTH_TOKEN,
    );
    expect(result).toBe('https://cdn.test.com/encrypted/multipart.enc');
  });
});

// ============================================================
// MULTIPART UPLOAD -- ERROR HANDLING
// ============================================================

describe('multipart upload error handling', () => {
  const fileSize = MULTIPART_PART_SIZE * 2 + 1000;

  beforeEach(() => {
    createTestFile('file:///test/multipart.enc', fileSize);
  });

  it('throws when initiate fails', async () => {
    global.fetch = createSequentialFetch([
      { ok: false, status: 500 },
    ]);

    await expect(
      uploadEncryptedMedia('file:///test/multipart.enc', fileSize, API_BASE, AUTH_TOKEN),
    ).rejects.toThrow('Failed to initiate multipart upload: 500');
  });

  it('throws when presign request fails for a part', async () => {
    const responses: any[] = [
      // Initiate OK
      {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ uploadId: 'mp-fail', key: 'enc/fail.enc' }),
      },
      // Presign part 1 fails
      { ok: false, status: 403 },
    ];

    global.fetch = jest.fn().mockImplementation(() => {
      const r = responses.shift();
      return Promise.resolve(r);
    });

    await expect(
      uploadEncryptedMedia('file:///test/multipart.enc', fileSize, API_BASE, AUTH_TOKEN),
    ).rejects.toThrow('Failed to get presigned URL for part 1: 403');
  });

  it('throws when part upload fails', async () => {
    const responses: any[] = [
      // Initiate OK
      {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ uploadId: 'mp-fail2', key: 'enc/fail2.enc' }),
      },
      // Presign part 1 OK
      {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ url: 'https://r2.test.com/part1', partNumber: 1 }),
      },
      // Upload part 1 fails
      {
        ok: false,
        status: 502,
        headers: { get: () => null },
      },
    ];

    global.fetch = jest.fn().mockImplementation(() => {
      const r = responses.shift();
      return Promise.resolve(r);
    });

    await expect(
      uploadEncryptedMedia('file:///test/multipart.enc', fileSize, API_BASE, AUTH_TOKEN),
    ).rejects.toThrow('Part 1 upload failed: 502');
  });

  it('throws when complete fails', async () => {
    // Build full sequence but with complete failing
    const responses: any[] = [];
    responses.push({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ uploadId: 'mp-fail3', key: 'enc/fail3.enc' }),
    });
    for (let i = 1; i <= 3; i++) {
      responses.push({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ url: `https://r2.test.com/part${i}`, partNumber: i }),
      });
      responses.push({
        ok: true,
        status: 200,
        headers: { get: (name: string) => name === 'ETag' ? `"etag-${i}"` : null },
      });
    }
    responses.push({ ok: false, status: 500 });

    global.fetch = jest.fn().mockImplementation(() => {
      const r = responses.shift();
      return Promise.resolve(r);
    });

    await expect(
      uploadEncryptedMedia('file:///test/multipart.enc', fileSize, API_BASE, AUTH_TOKEN),
    ).rejects.toThrow('Failed to complete multipart upload: 500');
  });

  it('throws when ETag is missing from part upload response', async () => {
    const responses: any[] = [
      {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ uploadId: 'mp-noetag', key: 'enc/noetag.enc' }),
      },
      {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ url: 'https://r2.test.com/part1', partNumber: 1 }),
      },
      {
        ok: true,
        status: 200,
        headers: { get: () => null }, // No ETag!
      },
    ];

    global.fetch = jest.fn().mockImplementation(() => {
      const r = responses.shift();
      return Promise.resolve(r);
    });

    await expect(
      uploadEncryptedMedia('file:///test/multipart.enc', fileSize, API_BASE, AUTH_TOKEN),
    ).rejects.toThrow('no ETag returned');
  });
});

// ============================================================
// downloadEncryptedMedia
// ============================================================

describe('downloadEncryptedMedia', () => {
  it('downloads to a temp file and returns local URI', async () => {
    const mediaUrl = 'https://cdn.test.com/encrypted/media.enc';
    // Set up mock: createDownloadResumable is already mocked in expo-file-system mock
    fsMock.__setFile(mediaUrl, arrayBufferToBase64(new Uint8Array([1, 2, 3])));

    const localUri = await downloadEncryptedMedia(mediaUrl);
    expect(localUri).toMatch(/^\/tmp\/test-cache\/download_/);
  });

  it('fires progress callback during download', async () => {
    const mediaUrl = 'https://cdn.test.com/encrypted/progress.enc';
    fsMock.__setFile(mediaUrl, arrayBufferToBase64(new Uint8Array([1, 2, 3])));

    const progressValues: number[] = [];
    await downloadEncryptedMedia(mediaUrl, (p) => progressValues.push(p));

    // The mock calls the callback with totalBytesWritten=100, totalBytesExpectedToWrite=100
    expect(progressValues.length).toBeGreaterThan(0);
    expect(progressValues[0]).toBe(1); // 100/100 = 1
  });

  it('throws when download fails with non-2xx status', async () => {
    fsMock.__setCreateDownloadResumable(
      (_url: string, _localUri: string, _opts: any, _cb: any) => ({
        downloadAsync: async () => ({ status: 404 }),
      }),
    );

    await expect(
      downloadEncryptedMedia('https://cdn.test.com/notfound.enc'),
    ).rejects.toThrow('Download failed: 404');
  });

  it('throws when download returns null result', async () => {
    fsMock.__setCreateDownloadResumable(
      (_url: string, _localUri: string, _opts: any, _cb: any) => ({
        downloadAsync: async () => null,
      }),
    );

    await expect(
      downloadEncryptedMedia('https://cdn.test.com/null.enc'),
    ).rejects.toThrow('Download failed');
  });

  it('writes downloaded content to the local temp path', async () => {
    const mediaUrl = 'https://cdn.test.com/encrypted/content.enc';
    const content = arrayBufferToBase64(new Uint8Array([10, 20, 30, 40]));
    fsMock.__setFile(mediaUrl, content);

    const localUri = await downloadEncryptedMedia(mediaUrl);

    // The mock copies the file content from url to localUri
    const localContent = fsMock.__getFile(localUri);
    expect(localContent).toBe(content);
  });
});

// ============================================================
// cleanupTempFile
// ============================================================

describe('cleanupTempFile', () => {
  it('deletes an existing file', async () => {
    const uri = '/tmp/test-cache/cleanup_test.enc';
    fsMock.__setFile(uri, arrayBufferToBase64(new Uint8Array([1, 2, 3])));

    expect(fsMock.__getFile(uri)).toBeDefined();
    await cleanupTempFile(uri);
    expect(fsMock.__getFile(uri)).toBeUndefined();
  });

  it('handles missing file gracefully (no throw)', async () => {
    const uri = '/tmp/test-cache/nonexistent.enc';
    // Should not throw even if file doesn't exist
    await expect(cleanupTempFile(uri)).resolves.toBeUndefined();
  });

  it('handles error from deleteAsync gracefully', async () => {
    const uri = '/tmp/test-cache/error.enc';
    fsMock.__setFile(uri, 'data');

    fsMock.__setDeleteAsync(() => {
      throw new Error('Permission denied');
    });

    // Should not throw -- best-effort cleanup
    await expect(cleanupTempFile(uri)).resolves.toBeUndefined();
  });
});

// ============================================================
// MULTIPART -- CORRECT PART SIZES
// ============================================================

describe('multipart correct part sizes', () => {
  it('calculates correct number of parts', async () => {
    const fileSize = MULTIPART_PART_SIZE * 3 + 500; // 4 parts
    createTestFile('file:///test/parts.enc', fileSize);

    const responses: any[] = [];
    responses.push({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ uploadId: 'parts-test', key: 'enc/parts.enc' }),
    });
    for (let i = 1; i <= 4; i++) {
      responses.push({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ url: `https://r2.test.com/part${i}`, partNumber: i }),
      });
      responses.push({
        ok: true,
        status: 200,
        headers: { get: (name: string) => name === 'ETag' ? `"etag${i}"` : null },
      });
    }
    responses.push({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ publicUrl: 'https://cdn.test.com/parts.enc' }),
    });

    global.fetch = jest.fn().mockImplementation(() => {
      const r = responses.shift();
      return Promise.resolve(r);
    });

    const result = await uploadEncryptedMedia('file:///test/parts.enc', fileSize, API_BASE, AUTH_TOKEN);
    expect(result).toBe('https://cdn.test.com/parts.enc');

    // 1 initiate + 4*(presign + upload) + 1 complete = 10 calls
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(10);
  });

  it('last part is smaller than MULTIPART_PART_SIZE when file is not aligned', async () => {
    const remainder = 1234;
    const fileSize = MULTIPART_PART_SIZE + remainder; // 2 parts
    createTestFile('file:///test/lastpart.enc', fileSize);

    const responses: any[] = [];
    responses.push({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ uploadId: 'lastpart-test', key: 'enc/lastpart.enc' }),
    });
    for (let i = 1; i <= 2; i++) {
      responses.push({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ url: `https://r2.test.com/part${i}`, partNumber: i }),
      });
      responses.push({
        ok: true,
        status: 200,
        headers: { get: (name: string) => name === 'ETag' ? `"etag${i}"` : null },
      });
    }
    responses.push({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ publicUrl: 'https://cdn.test.com/lastpart.enc' }),
    });

    global.fetch = jest.fn().mockImplementation(() => {
      const r = responses.shift();
      return Promise.resolve(r);
    });

    await uploadEncryptedMedia('file:///test/lastpart.enc', fileSize, API_BASE, AUTH_TOKEN);

    // Check Content-Length of last part upload (call index 4: init, presign1, upload1, presign2, upload2)
    const lastUploadCall = (global.fetch as jest.Mock).mock.calls[4];
    expect(lastUploadCall[1].headers['Content-Length']).toBe(String(remainder));
  });
});

// ============================================================
// AUTHORIZATION HEADER
// ============================================================

describe('authorization', () => {
  it('single PUT sends auth token in presigned URL request', async () => {
    const uri = 'file:///test/auth1.enc';
    createTestFile(uri, 256);

    global.fetch = createSequentialFetch([
      {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ url: 'https://r2.test.com/put', publicUrl: 'https://cdn.test.com/f.enc' }),
      },
    ]);

    mockUploadAsync({ status: 200 });

    await uploadEncryptedMedia(uri, 256, API_BASE, 'my-secret-token');

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(fetchCall[1].headers.Authorization).toBe('Bearer my-secret-token');
  });

  it('multipart sends auth token in initiate, presign, and complete requests', async () => {
    const fileSize = MULTIPART_PART_SIZE + 100;
    createTestFile('file:///test/auth2.enc', fileSize);

    const responses: any[] = [
      { ok: true, status: 200, json: () => Promise.resolve({ uploadId: 'auth-test', key: 'enc/auth.enc' }) },
      { ok: true, status: 200, json: () => Promise.resolve({ url: 'https://r2.test.com/p1', partNumber: 1 }) },
      { ok: true, status: 200, headers: { get: (n: string) => n === 'ETag' ? '"e1"' : null } },
      { ok: true, status: 200, json: () => Promise.resolve({ url: 'https://r2.test.com/p2', partNumber: 2 }) },
      { ok: true, status: 200, headers: { get: (n: string) => n === 'ETag' ? '"e2"' : null } },
      { ok: true, status: 200, json: () => Promise.resolve({ publicUrl: 'https://cdn.test.com/auth.enc' }) },
    ];

    global.fetch = jest.fn().mockImplementation(() => {
      const r = responses.shift();
      return Promise.resolve(r);
    });

    await uploadEncryptedMedia('file:///test/auth2.enc', fileSize, API_BASE, 'my-token');

    // Initiate (0): has auth
    expect((global.fetch as jest.Mock).mock.calls[0][1].headers.Authorization).toBe('Bearer my-token');
    // Presign (1): has auth
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toContain('/presign');
    expect((global.fetch as jest.Mock).mock.calls[1][1].headers.Authorization).toBe('Bearer my-token');
    // Presign (3): has auth
    expect((global.fetch as jest.Mock).mock.calls[3][1].headers.Authorization).toBe('Bearer my-token');
    // Complete (5): has auth
    expect((global.fetch as jest.Mock).mock.calls[5][1].headers.Authorization).toBe('Bearer my-token');
  });
});

// ============================================================
// EDGE CASES
// ============================================================

describe('edge cases', () => {
  it('uploads a file exactly at MULTIPART_PART_SIZE + 1 (just above threshold)', async () => {
    const fileSize = MULTIPART_PART_SIZE + 1;
    createTestFile('file:///test/justover.enc', fileSize);

    const responses: any[] = [
      { ok: true, status: 200, json: () => Promise.resolve({ uploadId: 'over', key: 'enc/over.enc' }) },
      { ok: true, status: 200, json: () => Promise.resolve({ url: 'https://r2.test.com/p1', partNumber: 1 }) },
      { ok: true, status: 200, headers: { get: (n: string) => n === 'ETag' ? '"e1"' : null } },
      { ok: true, status: 200, json: () => Promise.resolve({ url: 'https://r2.test.com/p2', partNumber: 2 }) },
      { ok: true, status: 200, headers: { get: (n: string) => n === 'ETag' ? '"e2"' : null } },
      { ok: true, status: 200, json: () => Promise.resolve({ publicUrl: 'https://cdn.test.com/over.enc' }) },
    ];

    global.fetch = jest.fn().mockImplementation(() => {
      const r = responses.shift();
      return Promise.resolve(r);
    });

    const result = await uploadEncryptedMedia('file:///test/justover.enc', fileSize, API_BASE, AUTH_TOKEN);
    expect(result).toBe('https://cdn.test.com/over.enc');

    // Last part should be 1 byte
    const lastUploadCall = (global.fetch as jest.Mock).mock.calls[4];
    expect(lastUploadCall[1].headers['Content-Length']).toBe('1');
  });

  it('progress values are between 0 and 1 for multipart', async () => {
    const fileSize = MULTIPART_PART_SIZE * 2 + 500;
    createTestFile('file:///test/progrange.enc', fileSize);

    const responses: any[] = [];
    responses.push({ ok: true, status: 200, json: () => Promise.resolve({ uploadId: 'prog', key: 'enc/prog.enc' }) });
    for (let i = 1; i <= 3; i++) {
      responses.push({ ok: true, status: 200, json: () => Promise.resolve({ url: `https://r2.test.com/p${i}`, partNumber: i }) });
      responses.push({ ok: true, status: 200, headers: { get: (n: string) => n === 'ETag' ? `"e${i}"` : null } });
    }
    responses.push({ ok: true, status: 200, json: () => Promise.resolve({ publicUrl: 'https://cdn.test.com/prog.enc' }) });

    global.fetch = jest.fn().mockImplementation(() => {
      const r = responses.shift();
      return Promise.resolve(r);
    });

    const progressValues: number[] = [];
    await uploadEncryptedMedia(
      'file:///test/progrange.enc',
      fileSize,
      API_BASE,
      AUTH_TOKEN,
      (p) => progressValues.push(p),
    );

    for (const p of progressValues) {
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('multipart complete sends parts sorted by partNumber', async () => {
    const fileSize = MULTIPART_PART_SIZE * 2 + 100; // 3 parts
    createTestFile('file:///test/sorted.enc', fileSize);

    const responses: any[] = [];
    responses.push({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ uploadId: 'sort-test', key: 'enc/sorted.enc' }),
    });
    for (let i = 1; i <= 3; i++) {
      responses.push({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ url: `https://r2.test.com/p${i}`, partNumber: i }),
      });
      responses.push({
        ok: true,
        status: 200,
        headers: { get: (n: string) => n === 'ETag' ? `"etag-${i}"` : null },
      });
    }
    responses.push({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ publicUrl: 'https://cdn.test.com/sorted.enc' }),
    });

    global.fetch = jest.fn().mockImplementation(() => {
      const r = responses.shift();
      return Promise.resolve(r);
    });

    await uploadEncryptedMedia('file:///test/sorted.enc', fileSize, API_BASE, AUTH_TOKEN);

    // Complete call
    const completeCall = (global.fetch as jest.Mock).mock.calls[7];
    const body = JSON.parse(completeCall[1].body);

    // Parts should be sorted by partNumber
    for (let i = 0; i < body.parts.length - 1; i++) {
      expect(body.parts[i].partNumber).toBeLessThan(body.parts[i + 1].partNumber);
    }
  });

  it('single PUT file size 1 byte works', async () => {
    const uri = 'file:///test/tiny.enc';
    createTestFile(uri, 1);

    global.fetch = createSequentialFetch([
      {
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          url: 'https://r2.test.com/put',
          publicUrl: 'https://cdn.test.com/tiny.enc',
        }),
      },
    ]);

    mockUploadAsync({ status: 200 });

    const result = await uploadEncryptedMedia(uri, 1, API_BASE, AUTH_TOKEN);
    expect(result).toBe('https://cdn.test.com/tiny.enc');
  });
});
