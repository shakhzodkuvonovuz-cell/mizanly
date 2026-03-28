/**
 * HTTP client for the Go E2E Key Server.
 *
 * This is the ADAPTER LAYER (audit finding #6):
 * - Go server returns base64 strings in JSON
 * - TypeScript types expect Uint8Array
 * - This module handles all conversion
 *
 * All requests are authenticated via Clerk JWT.
 */

import { fromBase64, toBase64 } from './crypto';
import { recordE2EEvent } from './telemetry';
import type {
  PreKeyBundle,
  IdentityKeyResponse,
  BundleResponse,
  PreKeyCountResponse,
  UploadOneTimePreKeysRequest,
  UploadSignedPreKeyRequest,
} from './types';

// ============================================================
// CONFIG
// ============================================================

let e2eBaseUrl = '';
let getAuthToken: () => Promise<string> = async () => '';

/**
 * Initialize the E2E API client.
 * Call once on app startup with the Go server URL and auth token provider.
 */
export function initE2EApi(
  baseUrl: string,
  tokenProvider: () => Promise<string>,
): void {
  e2eBaseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
  getAuthToken = tokenProvider;
}

/** Get the configured base URL (for multi-device.ts) */
export function getBaseUrl(): string {
  return e2eBaseUrl;
}

/** Get a fresh auth token (for multi-device.ts) */
export { getAuthToken };

// ============================================================
// HELPERS
// ============================================================

async function e2eFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await getAuthToken();
  const url = `${e2eBaseUrl}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });

  if (response.status === 429) {
    recordE2EEvent({ event: 'bundle_fetch_rate_limited' });
    throw new Error('Rate limited by E2E server. Try again later.');
  }

  if (!response.ok) {
    // F9 FIX: Strip path and response body from error messages.
    // Previously: `E2E API error: 404 /api/v1/e2e/keys/bundle/user_abc — {"error":"not found"}`
    // If this reaches Sentry breadcrumbs, server internals (paths, response bodies) leak.
    // Now: generic status code only. The path and body are NOT logged anywhere.
    throw new Error(`E2E request failed: ${response.status}`);
  }

  return response;
}

// ============================================================
// IDENTITY KEYS
// ============================================================

/**
 * Register our identity key with the Go E2E server.
 */
export async function registerIdentityKey(
  deviceId: number,
  publicKey: Uint8Array,
  registrationId: number,
): Promise<IdentityKeyResponse> {
  const response = await e2eFetch('/api/v1/e2e/keys/identity', {
    method: 'PUT',
    body: JSON.stringify({
      deviceId,
      publicKey: toBase64(publicKey),
      registrationId,
    }),
  });
  return response.json();
}

// ============================================================
// SIGNED PRE-KEYS
// ============================================================

/**
 * Upload a signed pre-key to the Go E2E server.
 */
export async function uploadSignedPreKey(
  upload: UploadSignedPreKeyRequest,
): Promise<void> {
  await e2eFetch('/api/v1/e2e/keys/signed-prekey', {
    method: 'PUT',
    body: JSON.stringify(upload),
  });
}

// ============================================================
// ONE-TIME PRE-KEYS
// ============================================================

/**
 * Upload a batch of one-time pre-keys.
 */
export async function uploadOneTimePreKeys(
  upload: UploadOneTimePreKeysRequest,
): Promise<void> {
  await e2eFetch('/api/v1/e2e/keys/one-time-prekeys', {
    method: 'POST',
    body: JSON.stringify(upload),
  });
}

/**
 * Get remaining one-time pre-key count.
 */
export async function getPreKeyCount(): Promise<number> {
  const response = await e2eFetch('/api/v1/e2e/keys/count');
  const data: PreKeyCountResponse = await response.json();
  return data.count;
}

// ============================================================
// PRE-KEY BUNDLE (with base64 → Uint8Array conversion)
// ============================================================

/**
 * Fetch a user's pre-key bundle from the Go server.
 *
 * THIS IS THE KEY ADAPTER: converts all base64 strings to Uint8Array
 * so the rest of the signal/ code works with native byte arrays.
 */
export async function fetchPreKeyBundle(
  userId: string,
): Promise<BundleResponse> {
  const response = await e2eFetch(`/api/v1/e2e/keys/bundle/${encodeURIComponent(userId)}`);
  const raw = await response.json();

  // Convert all base64 fields to Uint8Array
  const bundle: PreKeyBundle = {
    identityKey: fromBase64(raw.bundle.identityKey),
    registrationId: raw.bundle.registrationId,
    deviceId: raw.bundle.deviceId,
    signedPreKey: {
      keyId: raw.bundle.signedPreKey.keyId,
      publicKey: fromBase64(raw.bundle.signedPreKey.publicKey),
      signature: fromBase64(raw.bundle.signedPreKey.signature),
    },
    oneTimePreKey: raw.bundle.oneTimePreKey
      ? {
          keyId: raw.bundle.oneTimePreKey.keyId,
          publicKey: fromBase64(raw.bundle.oneTimePreKey.publicKey),
        }
      : undefined,
    supportedVersions: raw.bundle.supportedVersions ?? [1],
  };

  return {
    bundle,
    remainingOneTimeKeys: raw.remainingOneTimeKeys,
  };
}

/**
 * Fetch pre-key bundles for multiple users (batch).
 */
export async function fetchPreKeyBundlesBatch(
  userIds: string[],
): Promise<Map<string, BundleResponse>> {
  const response = await e2eFetch('/api/v1/e2e/keys/bundles/batch', {
    method: 'POST',
    body: JSON.stringify({ userIds }),
  });
  const raw = await response.json();

  const result = new Map<string, BundleResponse>();
  for (const [uid, bundleRaw] of Object.entries(raw.bundles ?? {})) {
    const br = bundleRaw as any;
    const bundle: PreKeyBundle = {
      identityKey: fromBase64(br.bundle.identityKey),
      registrationId: br.bundle.registrationId,
      deviceId: br.bundle.deviceId,
      signedPreKey: {
        keyId: br.bundle.signedPreKey.keyId,
        publicKey: fromBase64(br.bundle.signedPreKey.publicKey),
        signature: fromBase64(br.bundle.signedPreKey.signature),
      },
      oneTimePreKey: br.bundle.oneTimePreKey
        ? {
            keyId: br.bundle.oneTimePreKey.keyId,
            publicKey: fromBase64(br.bundle.oneTimePreKey.publicKey),
          }
        : undefined,
      supportedVersions: br.bundle.supportedVersions ?? [1],
    };
    result.set(uid, { bundle, remainingOneTimeKeys: br.remainingOneTimeKeys });
  }

  return result;
}

// ============================================================
// SENDER KEYS
// ============================================================

/**
 * Upload an encrypted sender key to the Go server.
 */
export async function uploadSenderKey(
  groupId: string,
  recipientUserId: string,
  encryptedKey: Uint8Array,
  chainId: number,
  generation: number,
): Promise<void> {
  await e2eFetch('/api/v1/e2e/sender-keys', {
    method: 'POST',
    body: JSON.stringify({
      groupId,
      recipientUserId,
      encryptedKey: toBase64(encryptedKey),
      chainId,
      generation,
    }),
  });
}

/**
 * Fetch sender keys for a group.
 */
export async function fetchSenderKeys(
  groupId: string,
): Promise<Array<{ senderUserId: string; encryptedKey: Uint8Array; chainId: number; generation: number }>> {
  const response = await e2eFetch(`/api/v1/e2e/sender-keys/${encodeURIComponent(groupId)}`);
  const raw = await response.json();

  return (raw.senderKeys ?? []).map((sk: any) => ({
    senderUserId: sk.senderUserId,
    encryptedKey: fromBase64(sk.encryptedKey),
    chainId: sk.chainId,
    generation: sk.generation,
  }));
}

// ============================================================
// PROTOCOL VERSION CHECK
// ============================================================

/**
 * Check if a bundle's supported versions are compatible with our client.
 * Returns the highest mutually supported version.
 *
 * @param bundleVersions - Versions from the server bundle (e.g., [1] or [1, 2])
 * @returns The highest version we both support, or null if incompatible
 */
export function negotiateProtocolVersion(
  bundleVersions: number[],
): number | null {
  // V6-F12 FIX: Only advertise version 2 (PQXDH) when ML-KEM is actually available.
  // Previously always included v2, causing the remote party to waste effort on PQ
  // encapsulation that we can't decapsulate. Now checks runtime availability.
  const { isPQXDHAvailable } = require('./pqxdh');
  const ourVersions = isPQXDHAvailable() ? [1, 2] : [1];
  const mutual = bundleVersions.filter((v: number) => ourVersions.includes(v));
  if (mutual.length === 0) return null;
  return Math.max(...mutual);
}
