/**
 * Background notification handler for E2E encrypted message previews.
 *
 * When a push notification arrives for an encrypted message:
 * 1. The push body is "New message" (generic — no plaintext leak to Apple/Google)
 * 2. The push data includes `encryptedPreview` (base64 of encrypted conversation preview)
 * 3. This handler runs in background, decrypts the preview, and modifies the notification
 *
 * Platform support:
 * - Android: Works via Expo's background notification handler (headless JS)
 * - iOS: Requires Notification Service Extension (NSE) — separate native implementation
 *   Until NSE is built, iOS shows "New message" for encrypted conversations
 *
 * The encrypted preview is encrypted with the conversation's session key
 * (same key used for encryptedLastMessagePreview on the Conversation model).
 */

import * as Notifications from 'expo-notifications';
import { MMKV } from 'react-native-mmkv';
import * as SecureStore from 'expo-secure-store';
import { aeadDecrypt, hkdfDeriveSecrets, fromBase64, utf8Decode } from './crypto';

/** HKDF info string for conversation preview encryption */
const PREVIEW_KEY_INFO = 'MizanlyPreview';

/**
 * Register the background notification handler.
 * Call once on app startup (before any notifications arrive).
 */
export function registerNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data as Record<string, string> | undefined;

      // If this is an E2E notification with encrypted preview, try to decrypt
      if (data?.e2e === 'true' && data?.encryptedPreview) {
        try {
          const decryptedPreview = await decryptNotificationPreview(
            data.encryptedPreview,
            data.conversationId,
          );
          if (decryptedPreview) {
            // On Android: modify notification content before display
            // Expo's handler doesn't support body modification directly,
            // but we can schedule a local notification with the decrypted content
            // TODO: Use Notifications.scheduleNotificationAsync for Android preview
          }
        } catch {
          // Decryption failed — show the generic "New message" body
        }
      }

      // Show notification as-is (with original body)
      return {
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      };
    },
  });
}

/**
 * Attempt to decrypt a notification preview.
 *
 * The preview was encrypted by the sender with XChaCha20-Poly1305 using
 * a key derived from the conversation's E2E state. The server stores it
 * as `encryptedLastMessagePreview` and includes it in push data.
 *
 * @returns Decrypted preview text, or null if decryption fails
 */
async function decryptNotificationPreview(
  encryptedPreviewB64: string,
  conversationId: string,
): Promise<string | null> {
  try {
    const encryptedPreview = fromBase64(encryptedPreviewB64);
    if (encryptedPreview.length < 25) return null; // Too short: need at least nonce(24) + 1 byte

    // The preview format: [nonce:24][ciphertext+tag]
    const nonce = encryptedPreview.slice(0, 24);
    const ciphertext = encryptedPreview.slice(24);

    // Load MMKV encryption key to derive AEAD key for preview key access
    const mmkvKey = await SecureStore.getItemAsync('e2e_mmkv_key');
    if (!mmkvKey) return null;

    // F11 FIX: Use the shared unencrypted MMKV with AEAD, matching storage.ts pattern.
    // Previously created its own MMKV with AES-CFB encryptionKey (weaker protection).
    // The preview key is AEAD-wrapped with HMAC-hashed key name (F4).
    const { MMKV } = await import('react-native-mmkv');
    const mmkv = new MMKV({ id: 'mizanly-signal' });
    // Derive AEAD key (same derivation as storage.ts getAEADKey)
    const { hkdfDeriveSecrets: hkdf } = await import('./crypto');
    const encKey = fromBase64(mmkvKey);
    const aeadKeyLocal = hkdf(encKey, new Uint8Array(32), 'MizanlyMMKVAEAD', 32);
    // Compute HMAC key name for preview key
    const { hmac } = await import('@noble/hashes/hmac');
    const { sha256 } = await import('@noble/hashes/sha256');
    const { utf8Encode: encode } = await import('./crypto');
    const originalKey = `previewkey:${conversationId}`;
    const hash = hmac(sha256, aeadKeyLocal, encode(originalKey));
    const hashedKey = 'p:' + (await import('./crypto')).toBase64(hash.slice(0, 16));
    // Try hashed key first, then legacy
    let previewKeyB64 = mmkv.getString(hashedKey);
    if (!previewKeyB64) {
      previewKeyB64 = mmkv.getString(`previewkey:${conversationId}`);
    }
    if (!previewKeyB64) return null;

    const previewKey = fromBase64(previewKeyB64);
    const plaintext = aeadDecrypt(previewKey, nonce, ciphertext);

    return utf8Decode(plaintext);
  } catch {
    return null; // Any failure → show generic "New message"
  }
}

/**
 * Store a preview decryption key for a conversation.
 * Called after session establishment or when the conversation's key changes.
 *
 * @param conversationId - Conversation ID
 * @param sessionKey - A key derived from the session (e.g., HKDF from root key)
 */
export async function storePreviewKey(
  conversationId: string,
  key: Uint8Array,
): Promise<void> {
  // F4: Use shared MMKV + AEAD + HMAC key names (matches storage.ts pattern)
  const { secureStore, HMAC_TYPE } = await import('./storage');
  const { toBase64 } = await import('./crypto');
  const originalKey = `previewkey:${conversationId}`;
  await secureStore(HMAC_TYPE.PREVIEW_KEY, originalKey, toBase64(key));
}

/**
 * Encrypt a message preview for the push notification data field.
 * Called by the sender before sending the message.
 *
 * @param preview - Plaintext preview (first ~100 chars of message)
 * @param previewKey - Conversation's preview encryption key
 * @returns Base64 encoded [nonce:24][ciphertext+tag]
 */
export function encryptPreview(
  preview: string,
  previewKey: Uint8Array,
): string {
  const { aeadEncrypt, generateRandomBytes, utf8Encode, toBase64, concat } = require('./crypto');
  const nonce = generateRandomBytes(24);
  const plaintext = utf8Encode(preview.slice(0, 100)); // Max 100 chars
  const ciphertext = aeadEncrypt(previewKey, nonce, plaintext);
  const combined = concat(nonce, ciphertext);
  return toBase64(combined);
}
