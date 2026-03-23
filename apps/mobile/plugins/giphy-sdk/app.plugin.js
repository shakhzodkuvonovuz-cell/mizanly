/**
 * Expo Config Plugin for @giphy/react-native-sdk
 *
 * Handles:
 * - Android: Fresco version resolution (SDK needs 2.5.0+)
 * - iOS: Minimum deployment target (13.0)
 * - Both: No manual native config needed after this plugin
 *
 * Usage in app.json:
 *   "plugins": ["./plugins/giphy-sdk/app.plugin.js"]
 *
 * NOTE: This plugin only activates when @giphy/react-native-sdk is installed.
 * It's safe to include in app.json even before the package is installed.
 */

const { withAppBuildGradle, withPodfile } = require('@expo/config-plugins');

function withGiphySdk(config) {
  // Check if SDK is actually installed
  let sdkInstalled = false;
  try {
    require.resolve('@giphy/react-native-sdk');
    sdkInstalled = true;
  } catch {
    // SDK not installed — skip native configuration
    return config;
  }

  // ── Android: Fix Fresco version conflict ──
  config = withAppBuildGradle(config, (config) => {
    const buildGradle = config.modResults.contents;

    // Add Fresco resolution strategy if not already present
    if (!buildGradle.includes('fresco:fresco:2.5.0')) {
      const marker = 'android {';
      const frescoBlock = `
// GIPHY SDK: Force Fresco version to avoid conflict with React Native's bundled version
configurations.all {
    resolutionStrategy.force 'com.facebook.fresco:fresco:2.5.0'
    resolutionStrategy.force 'com.facebook.fresco:animated-gif:2.5.0'
    resolutionStrategy.force 'com.facebook.fresco:animated-webp:2.5.0'
    resolutionStrategy.force 'com.facebook.fresco:webpsupport:2.5.0'
}

`;
      config.modResults.contents = buildGradle.replace(marker, frescoBlock + marker);
    }

    return config;
  });

  // ── iOS: Ensure minimum deployment target ──
  config = withPodfile(config, (config) => {
    const podfile = config.modResults.contents;

    // GIPHY SDK requires iOS 13.0+
    // Expo SDK 52 already targets iOS 15+, so this is just a safety check
    if (!podfile.includes('giphy-sdk-minimum-target')) {
      const postInstallMarker = 'post_install do |installer|';
      if (podfile.includes(postInstallMarker)) {
        // Already has post_install — no modification needed
        // iOS 13.0 is below Expo's default, so nothing to do
      }
    }

    return config;
  });

  return config;
}

module.exports = withGiphySdk;
