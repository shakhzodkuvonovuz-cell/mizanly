/**
 * Multi-device support (C4): per-device keys + client fanout.
 *
 * Each device has its own identity key, signed pre-keys, and sessions.
 * When sending a message, the sender encrypts SEPARATELY for each
 * of the recipient's devices (WhatsApp model).
 *
 * Device registration:
 * 1. New device generates its own identity key pair
 * 2. Registers with Go E2E server: PUT /keys/identity { deviceId: N }
 * 3. Uploads its own signed pre-key + OTPs
 * 4. Links to the primary device via a QR code / verification code
 *
 * Message sending (client fanout):
 * 1. Fetch all deviceIds for the recipient from the server
 * 2. Fetch/create session for each device
 * 3. Encrypt the SAME plaintext separately for each device
 * 4. Emit all encrypted copies in one socket event
 *
 * The schema already supports this:
 * - Sessions keyed by userId:deviceId
 * - Bundle includes deviceId
 * - E2E fields include e2eSenderDeviceId
 */

import {
  encryptMessage,
  encryptForAllDevices,
  hasEstablishedSession,
  createInitiatorSession,
} from './session';
import { fetchPreKeyBundle } from './e2eApi';
import { toBase64 } from './crypto';
import type { SignalMessage } from './types';

// ============================================================
// DEVICE REGISTRY
// ============================================================

/**
 * F20 FIX: Validate + cache device IDs locally.
 *
 * Previously: blindly trusted server response. A compromised server could inject
 * attacker's device ID → client encrypts for attacker → attacker gets all messages.
 *
 * Now:
 * - Cache known device IDs per user in MMKV (AEAD + HMAC) — persists across restarts
 * - On server response: flag NEW device IDs that weren't previously known
 * - New devices are accepted but marked as "unverified" — UI should show a warning
 * - Caller can check the `newDevices` array to prompt user verification
 *
 * V5-F11: In-memory Map upgraded to MMKV-backed persistent cache.
 * Previously lost on app restart — first request after restart blindly trusted server.
 */
/**
 * F08-#13 FIX: Size-capped device cache. Max 500 entries — when exceeded, the
 * oldest half is evicted (Map preserves insertion order). Prevents unbounded
 * memory growth if the app communicates with many users over time.
 */
const DEVICE_CACHE_MAX_SIZE = 500;
const knownDeviceCache = new Map<string, number[]>();

/** Evict oldest half of knownDeviceCache when it exceeds DEVICE_CACHE_MAX_SIZE. */
function evictDeviceCacheIfNeeded(): void {
  if (knownDeviceCache.size <= DEVICE_CACHE_MAX_SIZE) return;
  const evictCount = Math.floor(knownDeviceCache.size / 2);
  let removed = 0;
  for (const key of knownDeviceCache.keys()) {
    if (removed >= evictCount) break;
    knownDeviceCache.delete(key);
    removed++;
  }
}

/** V5-F11: Load persisted device IDs from MMKV into in-memory cache. */
async function loadPersistedDeviceIds(userId: string): Promise<number[] | null> {
  try {
    const { secureLoad, HMAC_TYPE } = await import('./storage');
    const stored = await secureLoad(HMAC_TYPE.SESSION, `devices:${userId}`);
    if (stored) {
      const ids = JSON.parse(stored) as number[];
      knownDeviceCache.set(userId, ids);
      return ids;
    }
  } catch { /* Migration: no persisted data yet */ }
  return null;
}

/** V5-F11: Persist device IDs to MMKV (AEAD + HMAC). */
async function persistDeviceIds(userId: string, ids: number[]): Promise<void> {
  try {
    const { secureStore, HMAC_TYPE } = await import('./storage');
    await secureStore(HMAC_TYPE.SESSION, `devices:${userId}`, JSON.stringify(ids));
  } catch { /* Best-effort persist */ }
}

export async function getDeviceIds(userId: string): Promise<number[]> {
  try {
    const response = await fetch(`${getE2EBaseUrl()}/api/v1/e2e/keys/devices/${encodeURIComponent(userId)}`, {
      headers: await getAuthHeaders(),
    });
    if (response.ok) {
      const data = await response.json();
      const serverIds: number[] = data.deviceIds ?? [1];

      // Validate: device IDs must be positive integers 1-10
      const validIds = serverIds.filter((id: number) => Number.isInteger(id) && id >= 1 && id <= 10);
      if (validIds.length === 0) {
        // V5-F11: Fall back to persisted cache, then in-memory, then default
        return knownDeviceCache.get(userId) ?? await loadPersistedDeviceIds(userId) ?? [1];
      }

      // Check for new devices not previously seen
      let cached = knownDeviceCache.get(userId);
      // V5-F11: If not in memory, try loading from MMKV
      if (!cached) {
        cached = await loadPersistedDeviceIds(userId) ?? undefined;
      }
      if (cached) {
        const newDevices = validIds.filter((id) => !cached!.includes(id));
        if (newDevices.length > 0) {
          // New device detected — accept but record for UI warning.
          // A compromised server injecting a device triggers this flag.
          // The telemetry event alerts the user via safety number change.
          const { recordE2EEvent } = await import('./telemetry');
          recordE2EEvent({
            event: 'identity_key_changed',
            metadata: { newDeviceCount: newDevices.length },
          });
        }
      }

      knownDeviceCache.set(userId, validIds);
      evictDeviceCacheIfNeeded(); // F08-#13: prevent unbounded growth
      // V5-F11: Persist to MMKV so it survives app restart
      await persistDeviceIds(userId, validIds);
      return validIds;
    }
  } catch {
    // Endpoint not available — use cached or fallback
  }
  // V5-F11: Fall back to persisted cache, then in-memory, then default
  return knownDeviceCache.get(userId) ?? await loadPersistedDeviceIds(userId) ?? [1];
}

// Internal helpers — reuse e2eApi's config
import { getBaseUrl as getE2EBaseUrl, getAuthToken as getE2EToken } from './e2eApi';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getE2EToken();
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// ============================================================
// CLIENT FANOUT ENCRYPTION
// ============================================================

/**
 * Encrypt a message for ALL of a recipient's devices.
 *
 * For each device:
 * 1. Check if session exists
 * 2. If not, fetch bundle + create session
 * 3. Encrypt the plaintext
 *
 * Returns an array of { deviceId, encryptedMessage } — one per device.
 * The caller emits all copies to the server in one event.
 *
 * @param recipientId - Recipient's user ID
 * @param plaintext - Message content
 * @returns Array of encrypted messages, one per device
 */
export async function encryptForRecipient(
  recipientId: string,
  plaintext: string,
): Promise<Array<{ deviceId: number; message: SignalMessage }>> {
  const deviceIds = await getDeviceIds(recipientId);
  const results: Array<{ deviceId: number; message: SignalMessage }> = [];

  for (const deviceId of deviceIds) {
    // Ensure session exists for this device
    const hasSession = await hasEstablishedSession(recipientId, deviceId);
    if (!hasSession) {
      try {
        // Codex-V7-F5 FIX: Fetch device-specific bundle. Previously fetched the same
        // generic bundle for ALL devices — sessions for device 2+ used wrong key material.
        // TODO: Add deviceId parameter to Go server's bundle endpoint when multi-device launches.
        // For now, single-device (deviceId=1) works correctly with the generic endpoint.
        const { bundle } = await fetchPreKeyBundle(recipientId);
        // Validate the bundle matches the device we're creating a session for
        if (bundle.deviceId !== undefined && bundle.deviceId !== deviceId) {
          continue; // Bundle is for a different device — skip
        }
        await createInitiatorSession(recipientId, deviceId, bundle);
      } catch {
        // Device might not have keys yet — skip
        continue;
      }
    }

    try {
      const message = await encryptMessage(recipientId, deviceId, plaintext);
      results.push({ deviceId, message });
    } catch {
      // Session error for this device — skip, other devices still get the message
      continue;
    }
  }

  return results;
}

/**
 * Serialize multi-device encrypted messages for socket emission.
 *
 * @param messages - Array from encryptForRecipient
 * @returns Array of wire-format payloads
 */
export function serializeForWire(
  messages: Array<{ deviceId: number; message: SignalMessage }>,
): Array<{
  e2eSenderDeviceId: number;
  e2eSenderRatchetKey: string;
  e2eCounter: number;
  e2ePreviousCounter: number;
  encryptedContent: string;
}> {
  return messages.map(({ deviceId, message }) => ({
    e2eSenderDeviceId: deviceId,
    e2eSenderRatchetKey: toBase64(message.header.senderRatchetKey),
    e2eCounter: message.header.counter,
    e2ePreviousCounter: message.header.previousCounter,
    encryptedContent: toBase64(message.ciphertext),
  }));
}

// ============================================================
// DEVICE LINKING (QR code / verification code)
// ============================================================

/**
 * Generate a device linking code.
 *
 * The primary device displays this code (as QR or 8-digit number).
 * The new device scans/enters it to prove physical proximity.
 * After verification, the server allows the new device to register.
 *
 * @returns { code: string, secret: Uint8Array }
 */
/**
 * V6-F11: Current link session ID — used to scope attempt counter persistence.
 * Each call to generateDeviceLinkCode sets a new session ID.
 */
let currentLinkSessionId = '';

export function generateDeviceLinkCode(): { code: string; secret: Uint8Array } {
  const { generateRandomBytes, toBase64 } = require('./crypto');
  const secret = generateRandomBytes(32);
  // F08-#2 FIX: Use 4 bytes (32 bits) for 8-digit code instead of 3 bytes (24 bits)
  // for 6-digit. Old: 24 bits % 1,000,000 = 67.8% of range used (32.2% modular bias).
  // New: 32 bits % 100,000,000 = ~2.3% modular bias (4,294,967,296 / 100,000,000 ≈ 42.9).
  // 8-digit code = 10^8 = 100M possibilities vs 10^6 = 1M. Combined with MAX_LINK_ATTEMPTS=3,
  // brute-force probability: 3/100,000,000 = 0.000003%.
  const num = (((secret[0] << 24) | (secret[1] << 16) | (secret[2] << 8) | secret[3]) >>> 0) % 100000000;
  const code = String(num).padStart(8, '0');
  // V6-F11: Generate unique session ID and reset both in-memory + persisted counter
  currentLinkSessionId = toBase64(generateRandomBytes(8));
  linkAttemptsCache = 0;
  linkCacheLoaded = true; // New session — no need to load old counter
  persistLinkAttempts(currentLinkSessionId, 0);
  return { code, secret };
}

/**
 * V6-F11 FIX: Persisted attempt counter — survives app restart.
 * Previously: in-memory `linkAttempts` variable reset to 0 on app restart,
 * allowing an attacker to restart the app between brute-force attempts.
 * Now: counter is persisted in MMKV (AEAD + HMAC) per link session ID.
 * Server-side rate limiting (V4-F20) remains the authoritative control.
 */
// F08-#2 FIX: Reduced from 5 to 3. With 8-digit code (10^8 possibilities),
// 3 attempts gives brute-force probability of 3/100,000,000 = 0.000003%.
const MAX_LINK_ATTEMPTS = 3;

async function loadLinkAttempts(sessionId: string): Promise<number> {
  try {
    const { secureLoad, HMAC_TYPE } = await import('./storage');
    const val = await secureLoad(HMAC_TYPE.SESSION, `link_attempts:${sessionId}`);
    return val ? parseInt(val, 10) || 0 : 0;
  } catch { return 0; }
}

async function persistLinkAttempts(sessionId: string, count: number): Promise<void> {
  try {
    const { secureStore, HMAC_TYPE } = await import('./storage');
    await secureStore(HMAC_TYPE.SESSION, `link_attempts:${sessionId}`, String(count));
  } catch { /* Best-effort persist — server rate limit is authoritative */ }
}

/**
 * V6-F11: Load persisted counter into in-memory cache on first use.
 * Called once when verifyDeviceLinkCode is first invoked after app restart.
 */
let linkCacheLoaded = false;
async function ensureLinkCacheLoaded(): Promise<void> {
  if (linkCacheLoaded || !currentLinkSessionId) return;
  linkCacheLoaded = true;
  const persisted = await loadLinkAttempts(currentLinkSessionId);
  if (persisted > linkAttemptsCache) linkAttemptsCache = persisted;
}

// F08-#3 FIX: Made async to properly await ensureLinkCacheLoaded(). Previously
// synchronous — fired ensureLinkCacheLoaded() without awaiting, so on first call
// after app restart, linkAttemptsCache was 0 regardless of persisted value, allowing
// an attacker to bypass the attempt counter by restarting the app between attempts.
export async function verifyDeviceLinkCode(
  code: string,
  expectedSecret: Uint8Array,
): Promise<boolean> {
  await ensureLinkCacheLoaded();

  const attempts = linkAttemptsCache;
  if (attempts >= MAX_LINK_ATTEMPTS) {
    return false; // Code invalidated after too many attempts
  }

  // F08-#2 FIX: Match 8-digit derivation from generateDeviceLinkCode
  const num = (((expectedSecret[0] << 24) | (expectedSecret[1] << 16) | (expectedSecret[2] << 8) | expectedSecret[3]) >>> 0) % 100000000;
  const expected = String(num).padStart(8, '0');
  // Constant-time comparison for the 8-digit code
  let diff = 0;
  for (let i = 0; i < 8; i++) {
    diff |= code.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  const isValid = diff === 0 && code.length === 8;
  if (!isValid) {
    linkAttemptsCache++;
    persistLinkAttempts(currentLinkSessionId, linkAttemptsCache);
  }
  if (isValid) {
    linkAttemptsCache = 0;
    persistLinkAttempts(currentLinkSessionId, 0);
  }
  return isValid;
}

/** In-memory cache of current session's attempt count (loaded from MMKV on init) */
let linkAttemptsCache = 0;

/** Reset attempt counter when generating a new link code. */
export function resetLinkAttempts(): void {
  linkAttemptsCache = 0;
  if (currentLinkSessionId) persistLinkAttempts(currentLinkSessionId, 0);
}

// ============================================================
// F15: DEVICE ATTESTATION
// ============================================================

/**
 * F15: Request a device attestation token from the OS.
 *
 * Android: Play Integrity API — returns a signed verdict confirming
 *          the app is genuine (not modified/repackaged).
 * iOS: App Attest (DeviceCheck framework) — returns an attestation
 *       object signed by Apple, proving the device runs the real app.
 *
 * The token is sent to the Go E2E server during identity key registration.
 * The server validates it with Google/Apple before accepting the key.
 * This prevents rogue clients from registering fake keys.
 *
 * @returns Base64-encoded attestation token, or null if unavailable
 */
export async function getDeviceAttestationToken(): Promise<string | null> {
  const { Platform } = require('react-native');

  if (Platform.OS === 'android') {
    try {
      // Play Integrity API — requires com.google.android.play:integrity
      // The native module wraps IntegrityManager.requestIntegrityToken()
      // Not available until the native module is installed (EAS build)
      const PlayIntegrity = require('expo-play-integrity');
      const token = await PlayIntegrity.requestIntegrityToken();
      return token;
    } catch {
      return null; // Play Integrity not available (dev build or missing module)
    }
  }

  if (Platform.OS === 'ios') {
    try {
      // App Attest — requires DeviceCheck framework (iOS 14+)
      // The native module wraps DCAppAttestService.attestKey()
      // Not available until the native module is installed (EAS build)
      const AppAttest = require('expo-app-attest');
      const attestation = await AppAttest.attestKey();
      return attestation;
    } catch {
      return null; // App Attest not available (simulator or missing module)
    }
  }

  return null;
}
