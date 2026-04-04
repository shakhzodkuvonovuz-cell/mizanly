const {
  withProjectBuildGradle,
  withDangerousMod,
  createRunOncePlugin,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin that configures ffmpeg-kit-react-native to use the
 * min-gpl variant on both iOS and Android.
 *
 * min-gpl includes libx264 (H.264 encoding) which is the only GPL codec
 * needed for video export. Saves ~10-20MB vs full-gpl by excluding x265,
 * libass, fribidi, freetype, fontconfig, vidstab, and zimg.
 *
 * Without this plugin, the default 'https' variant is used which lacks
 * H.264 encoding (libx264) — making video export impossible.
 *
 * Usage: add "./plugins/ffmpeg-kit/app.plugin" to the plugins array in app.json.
 */

const PLUGIN_NAME = 'mizanly-ffmpeg-kit';
const VARIANT = 'min-gpl';

// ── Android ─────────────────────────────────────────────────────────
// Sets rootProject.ext.ffmpegKitPackage in the root build.gradle.
// The library's build.gradle reads this via safeExtGet('ffmpegKitPackage', 'https').

function withAndroidFFmpegVariant(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg;

    let contents = cfg.modResults.contents;

    // Skip if already configured
    if (contents.includes('ffmpegKitPackage')) return cfg;

    // Try to insert into existing ext block in allprojects or buildscript
    const extBlockMatch = contents.match(/(ext\s*\{)/);
    if (extBlockMatch) {
      contents = contents.replace(
        /(ext\s*\{)/,
        `$1\n        ffmpegKitPackage = "${VARIANT}"`
      );
    } else {
      // No ext block — add one after the buildscript block
      contents = contents.replace(
        /(buildscript\s*\{[\s\S]*?\n\})/,
        `$1\n\next {\n    ffmpegKitPackage = "${VARIANT}"\n}`
      );
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
}

// ── iOS ─────────────────────────────────────────────────────────────
// Overrides the default 'https' subspec with 'full-gpl' in the Podfile.
// Auto-linking picks up the default subspec; we need to override it.

function withIOSFFmpegVariant(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(podfilePath)) return cfg;

      let podfile = fs.readFileSync(podfilePath, 'utf8');

      // Skip if already configured
      if (podfile.includes(`ffmpeg-kit-react-native/${VARIANT}`)) return cfg;

      // Strategy: Add a pre_install hook that overrides the ffmpeg-kit subspec.
      // This runs before CocoaPods resolves dependencies, ensuring the full-gpl
      // variant is used instead of the default 'https' subspec.
      const preInstallHook = `
# FFmpeg Kit: use ${VARIANT} variant for video editor (x264, libass, fribidi RTL)
pre_install do |installer|
  installer.pod_targets.each do |pod|
    if pod.name.start_with?('ffmpeg-kit-react-native')
      # Override the default subspec
      def pod.root_spec
        spec = super
        spec.default_subspec = '${VARIANT}'
        spec
      end
    end
  end
end
`;

      // Insert before the first 'target' declaration
      const targetMatch = podfile.match(/^(target\s+)/m);
      if (targetMatch) {
        const insertPos = podfile.indexOf(targetMatch[0]);
        podfile = podfile.slice(0, insertPos) + preInstallHook + '\n' + podfile.slice(insertPos);
      } else {
        // Fallback: append at end
        podfile += '\n' + preInstallHook;
      }

      fs.writeFileSync(podfilePath, podfile);
      return cfg;
    },
  ]);
}

// ── Entry point ─────────────────────────────────────────────────────

function withFFmpegKit(config) {
  config = withAndroidFFmpegVariant(config);
  config = withIOSFFmpegVariant(config);
  return config;
}

module.exports = createRunOncePlugin(withFFmpegKit, PLUGIN_NAME, '1.0.0');
