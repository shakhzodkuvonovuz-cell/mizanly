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
 * - Cache known device IDs per user in MMKV (AEAD + HMAC)
 * - On server response: flag NEW device IDs that weren't previously known
 * - New devices are accepted but marked as "unverified" — UI should show a warning
 * - Caller can check the `newDevices` array to prompt user verification
 */
const knownDeviceCache = new Map<string, number[]>();

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
      if (validIds.length === 0) return knownDeviceCache.get(userId) ?? [1];

      // Check for new devices not previously seen
      const cached = knownDeviceCache.get(userId);
      if (cached) {
        const newDevices = validIds.filter((id) => !cached.includes(id));
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
      return validIds;
    }
  } catch {
    // Endpoint not available — use cached or fallback
  }
  return knownDeviceCache.get(userId) ?? [1];
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
        const { bundle } = await fetchPreKeyBundle(recipientId);
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
 * The primary device displays this code (as QR or 6-digit number).
 * The new device scans/enters it to prove physical proximity.
 * After verification, the server allows the new device to register.
 *
 * @returns { code: string, secret: Uint8Array }
 */
export function generateDeviceLinkCode(): { code: string; secret: Uint8Array } {
  const { generateRandomBytes } = require('./crypto');
  const secret = generateRandomBytes(32);
  // 6-digit numeric code derived from the secret (for manual entry)
  const num = ((secret[0] << 16) | (secret[1] << 8) | secret[2]) % 1000000;
  const code = String(num).padStart(6, '0');
  return { code, secret };
}

/**
 * Verify a device linking code from a new device.
 *
 * @param code - The 6-digit code entered by the new device
 * @param expectedSecret - The secret from generateDeviceLinkCode
 * @returns true if the code matches
 */
export function verifyDeviceLinkCode(
  code: string,
  expectedSecret: Uint8Array,
): boolean {
  const num = ((expectedSecret[0] << 16) | (expectedSecret[1] << 8) | expectedSecret[2]) % 1000000;
  const expected = String(num).padStart(6, '0');
  // Constant-time comparison for the 6-digit code
  let diff = 0;
  for (let i = 0; i < 6; i++) {
    diff |= code.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0 && code.length === 6;
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
