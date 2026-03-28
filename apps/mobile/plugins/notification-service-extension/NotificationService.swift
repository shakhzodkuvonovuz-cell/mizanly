/**
 * iOS Notification Service Extension for E2E encrypted message previews.
 *
 * This Swift code runs in a separate iOS process when a push notification
 * with `mutable-content: 1` arrives. It has ~30 seconds and ~24MB memory
 * to decrypt the preview and modify the notification before display.
 *
 * Data flow:
 * 1. Push arrives: { body: "New message", data: { encryptedPreview: "base64...", e2e: "true" } }
 * 2. NSE reads encryptedPreview from userInfo
 * 3. NSE loads the preview decryption key from shared Keychain (App Group)
 * 4. NSE decrypts the preview using XChaCha20-Poly1305
 * 5. NSE replaces notification.body with the decrypted preview
 * 6. iOS displays the notification with the real preview
 *
 * Key sharing: The main app stores the preview key in a Keychain item
 * accessible to the App Group (kSecAttrAccessGroup = "group.app.mizanly.shared").
 * The NSE reads this key without needing to access the main app's MMKV.
 *
 * IMPORTANT: This file is the template. Full implementation requires:
 * - CryptoKit (or a vendored XChaCha20-Poly1305 implementation)
 * - Keychain access with App Group
 * - Proper error handling for decryption failures
 */

import UserNotifications

class NotificationService: UNNotificationServiceExtension {
    var contentHandler: ((UNNotificationContent) -> Void)?
    var bestAttemptContent: UNMutableNotificationContent?

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        self.contentHandler = contentHandler
        bestAttemptContent = (request.content.mutableCopy() as? UNMutableNotificationContent)

        guard let content = bestAttemptContent else {
            contentHandler(request.content)
            return
        }

        // Check if this is an E2E encrypted notification
        guard let e2e = content.userInfo["e2e"] as? String, e2e == "true",
              let encryptedPreviewB64 = content.userInfo["encryptedPreview"] as? String,
              let conversationId = content.userInfo["conversationId"] as? String else {
            // Not encrypted — show as-is
            contentHandler(content)
            return
        }

        // Attempt to decrypt the preview
        if let decryptedPreview = decryptPreview(encryptedPreviewB64, conversationId: conversationId) {
            content.body = decryptedPreview
        }
        // If decryption fails, the original "New message" body is shown

        contentHandler(content)
    }

    override func serviceExtensionTimeWillExpire() {
        // Called when the extension is about to be terminated (30 second limit)
        if let contentHandler = contentHandler, let content = bestAttemptContent {
            contentHandler(content) // Show whatever we have
        }
    }

    /// Decrypt the encrypted preview using the shared Keychain key
    private func decryptPreview(_ encryptedB64: String, conversationId: String) -> String? {
        // TODO: Implement when App Groups + Keychain sharing is configured
        // 1. Load preview key from shared Keychain: kSecAttrAccessGroup = "group.app.mizanly.shared"
        //    Key name: "e2e_preview_key_\(conversationId)"
        // 2. Decode base64 → [nonce:24][ciphertext+tag]
        // 3. Decrypt with XChaCha20-Poly1305 (via CryptoKit or vendored implementation)
        // 4. Return UTF-8 decoded string
        return nil // Placeholder — returns nil so "New message" body is used
    }
}
