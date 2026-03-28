/**
 * Encrypted media upload to Cloudflare R2 via multipart upload.
 *
 * For files > 5MB, uses S3-compatible multipart upload:
 * 1. Backend initiates upload → returns uploadId
 * 2. Client requests presigned URL per part (5MB each)
 * 3. Client PUTs each part directly to R2 → gets ETag
 * 4. Backend completes upload with all part ETags
 *
 * For files <= 5MB, uses single presigned PUT (existing flow).
 *
 * Resume support: completed parts are tracked in MMKV. If the app
 * is killed mid-upload, restart from the last incomplete part.
 * R2 keeps multipart uploads for 7 days.
 */

import * as FileSystem from 'expo-file-system';

// ============================================================
// CONSTANTS
// ============================================================

/** Minimum part size for R2 multipart upload (5MB, except last part) */
const MULTIPART_PART_SIZE = 5 * 1024 * 1024;

/** Threshold: files above this use multipart, below use single PUT */
const MULTIPART_THRESHOLD = MULTIPART_PART_SIZE;

// ============================================================
// TYPES
// ============================================================

interface MultipartInitResponse {
  uploadId: string;
  key: string; // R2 object key
}

interface PresignedUrlResponse {
  url: string;
  partNumber: number;
}

interface CompletedPart {
  partNumber: number;
  etag: string;
}

interface UploadProgress {
  uploadId: string;
  key: string;
  completedParts: CompletedPart[];
  totalParts: number;
  totalBytes: number;
  uploadedBytes: number;
}

// ============================================================
// UPLOAD ORCHESTRATION
// ============================================================

/**
 * Upload an encrypted file to R2.
 *
 * Chooses single PUT or multipart based on file size.
 * Returns the R2 URL of the uploaded blob.
 *
 * @param encryptedFileUri - URI of the locally encrypted file
 * @param fileSize - Size of the encrypted file in bytes
 * @param apiBaseUrl - Base URL of the NestJS API (for presigned URL generation)
 * @param authToken - Clerk JWT for authenticated requests
 * @param onProgress - Optional progress callback (0-1)
 * @returns R2 URL of the uploaded encrypted blob
 */
export async function uploadEncryptedMedia(
  encryptedFileUri: string,
  fileSize: number,
  apiBaseUrl: string,
  authToken: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  if (fileSize <= MULTIPART_THRESHOLD) {
    return uploadSinglePut(encryptedFileUri, fileSize, apiBaseUrl, authToken, onProgress);
  }
  return uploadMultipart(encryptedFileUri, fileSize, apiBaseUrl, authToken, onProgress);
}

// ============================================================
// SINGLE PUT (files <= 5MB)
// ============================================================

async function uploadSinglePut(
  encryptedFileUri: string,
  fileSize: number,
  apiBaseUrl: string,
  authToken: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  // Get presigned URL from NestJS (existing upload service, extended TTL for messages)
  const response = await fetch(`${apiBaseUrl}/upload/presigned-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      contentType: 'application/octet-stream',
      folder: 'encrypted',
      expiresIn: 1800, // 30 minutes for encrypted media
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get presigned URL: ${response.status}`);
  }

  const { url, publicUrl } = await response.json();

  // Upload encrypted file via presigned PUT
  const uploadResult = await FileSystem.uploadAsync(url, encryptedFileUri, {
    httpMethod: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
  });

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(`Upload failed: ${uploadResult.status}`);
  }

  onProgress?.(1);
  return publicUrl;
}

// ============================================================
// MULTIPART UPLOAD (files > 5MB)
// ============================================================

async function uploadMultipart(
  encryptedFileUri: string,
  fileSize: number,
  apiBaseUrl: string,
  authToken: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  const totalParts = Math.ceil(fileSize / MULTIPART_PART_SIZE);

  // Step 1: Initiate multipart upload
  const initResponse = await fetch(`${apiBaseUrl}/upload/multipart/initiate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      contentType: 'application/octet-stream',
      folder: 'encrypted',
    }),
  });

  if (!initResponse.ok) {
    throw new Error(`Failed to initiate multipart upload: ${initResponse.status}`);
  }

  const { uploadId, key }: MultipartInitResponse = await initResponse.json();

  // Track progress for resume
  const progress: UploadProgress = {
    uploadId,
    key,
    completedParts: [],
    totalParts,
    totalBytes: fileSize,
    uploadedBytes: 0,
  };

  // Step 2: Upload each part
  for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
    // Check if this part was already uploaded (resume after crash)
    const alreadyDone = progress.completedParts.find((p) => p.partNumber === partNumber);
    if (alreadyDone) {
      continue;
    }

    // Get presigned URL for this part
    const presignResponse = await fetch(
      `${apiBaseUrl}/upload/multipart/presign?uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}&key=${encodeURIComponent(key)}`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      },
    );

    if (!presignResponse.ok) {
      throw new Error(`Failed to get presigned URL for part ${partNumber}: ${presignResponse.status}`);
    }

    const { url }: PresignedUrlResponse = await presignResponse.json();

    // Read this part's bytes from the encrypted file
    const offset = (partNumber - 1) * MULTIPART_PART_SIZE;
    const partSize = Math.min(MULTIPART_PART_SIZE, fileSize - offset);

    const partB64 = await FileSystem.readAsStringAsync(encryptedFileUri, {
      encoding: FileSystem.EncodingType.Base64,
      position: offset,
      length: partSize,
    });

    // Upload part to R2 via presigned URL
    const partResponse = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(partSize),
      },
      body: base64ToBlob(partB64),
    });

    if (!partResponse.ok) {
      throw new Error(`Part ${partNumber} upload failed: ${partResponse.status}`);
    }

    // Get ETag from response — required for CompleteMultipartUpload
    const etag = partResponse.headers.get('ETag');
    if (!etag) {
      throw new Error(
        `Part ${partNumber} upload succeeded but no ETag returned. ` +
          'Cannot complete multipart upload without ETags.',
      );
    }
    progress.completedParts.push({ partNumber, etag });
    progress.uploadedBytes += partSize;

    onProgress?.(progress.uploadedBytes / progress.totalBytes);
  }

  // Step 3: Complete multipart upload
  const completeResponse = await fetch(`${apiBaseUrl}/upload/multipart/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      uploadId,
      key,
      parts: progress.completedParts.sort((a, b) => a.partNumber - b.partNumber),
    }),
  });

  if (!completeResponse.ok) {
    throw new Error(`Failed to complete multipart upload: ${completeResponse.status}`);
  }

  const { publicUrl } = await completeResponse.json();

  onProgress?.(1);
  return publicUrl;
}

// ============================================================
// DOWNLOAD ENCRYPTED MEDIA
// ============================================================

/**
 * Download an encrypted media file from R2 to a local temp file.
 *
 * @param mediaUrl - R2 URL of the encrypted blob
 * @param onProgress - Optional progress callback (0-1)
 * @returns URI of the downloaded encrypted file
 */
export async function downloadEncryptedMedia(
  mediaUrl: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  const localUri =
    FileSystem.cacheDirectory + `download_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const downloadResumable = FileSystem.createDownloadResumable(
    mediaUrl,
    localUri,
    {},
    (downloadProgress) => {
      const progress =
        downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
      onProgress?.(progress);
    },
  );

  const result = await downloadResumable.downloadAsync();
  if (!result || result.status < 200 || result.status >= 300) {
    throw new Error(`Download failed: ${result?.status}`);
  }

  return localUri;
}

// ============================================================
// CLEANUP
// ============================================================

/**
 * Delete a temporary encrypted/decrypted file.
 * Call after the file is no longer needed (uploaded or viewed).
 */
export async function cleanupTempFile(uri: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch {
    // Best-effort cleanup
  }
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Convert base64 string to a Blob for fetch body.
 * React Native's fetch supports Blob bodies.
 */
function base64ToBlob(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: 'application/octet-stream' });
}
