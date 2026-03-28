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
 * Fetch all known device IDs for a user from the Go E2E server.
 * In single-device mode, returns [1]. Multi-device returns [1, 2, ...].
 *
 * TODO: Add GET /keys/devices/:userId endpoint to Go server
 * For now, returns [1] (single device).
 */
export async function getDeviceIds(userId: string): Promise<number[]> {
  // Future: fetch from Go server
  // const response = await e2eFetch(`/api/v1/e2e/keys/devices/${userId}`);
  // return response.json().then(r => r.deviceIds);
  return [1]; // Single-device for now
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
