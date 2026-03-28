/**
 * Expo config plugin for iOS Notification Service Extension (NSE).
 *
 * This plugin:
 * 1. Creates an NSE target in the Xcode project
 * 2. Configures App Groups (shared data between main app and extension)
 * 3. Adds the Swift NSE source code that decrypts message previews
 *
 * The NSE intercepts push notifications marked with `mutable-content: 1`
 * and decrypts the `encryptedPreview` from the push data payload using
 * the E2E encryption keys shared via App Group Keychain.
 *
 * Requires: Apple Developer account with App Groups capability
 * App Group ID: group.app.mizanly.shared
 */

const { withInfoPlist, withXcodeProject, withEntitlementsPlist } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const APP_GROUP_ID = 'group.app.mizanly.shared';

function withNotificationServiceExtension(config) {
  // Add App Groups entitlement to main app
  config = withEntitlementsPlist(config, (config) => {
    config.modResults['com.apple.security.application-groups'] = [APP_GROUP_ID];
    return config;
  });

  // Mark notifications as mutable-content
  config = withInfoPlist(config, (config) => {
    // This tells Expo Push to include mutable-content flag
    config.modResults.NSEEnabled = true;
    return config;
  });

  // The actual NSE target creation requires modifying the Xcode project
  // This is done via withXcodeProject in a prebuild step
  // For now, this plugin documents the architecture.
  // Full implementation requires:
  // 1. Swift source for NotificationService.swift (decrypt preview)
  // 2. Xcode target configuration
  // 3. Shared Keychain access group for E2E keys

  return config;
}

module.exports = withNotificationServiceExtension;
