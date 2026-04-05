# I09 — Expo Configuration Audit: app.json, eas.json, Plugins, Assets

**Scope:** `apps/mobile/app.json`, `apps/mobile/eas.json`, custom plugins in `apps/mobile/plugins/`, image assets, native module configuration, permissions, deep link scheme, bundle ID.
**Methodology:** Read every config file, cross-referenced package.json dependencies against app.json plugins, checked asset file sizes, verified eas.json production readiness.
**Severity scale:** CRITICAL = blocks App Store submission or causes runtime crash, HIGH = broken feature, MEDIUM = degraded experience, LOW = code smell

---

## 1. ICON AND SPLASH ASSETS: 1x1 PIXEL PLACEHOLDERS

| # | Sev | Finding |
|---|-----|---------|
| 1 | CRITICAL | **`icon.png` is a 1x1 pixel PNG (69 bytes).** Apple requires a 1024x1024 PNG with no alpha channel. Android requires at minimum 192x192 (512x512 recommended). This will be rejected by both App Store and Play Store. |
| 2 | CRITICAL | **`adaptive-icon.png` is a 1x1 pixel PNG (69 bytes).** Android adaptive icons require at least 108dp (432px at xxxhdpi). Current icon renders as invisible. |
| 3 | CRITICAL | **`splash.png` is a 1x1 pixel PNG (69 bytes).** Splash screen will show a solid emerald (#0A7B4F) rectangle with a single invisible pixel. First impression for every user. |
| 4 | HIGH | **Notification icon reuses `icon.png`.** `expo-notifications` plugin config: `"icon": "./assets/images/icon.png"`. Android notification icons must be monochrome silhouette. A 1x1 pixel is invisible in the notification tray. |

---

## 2. eas.json: PRODUCTION PROFILE NOT CONFIGURED

| # | Sev | Finding |
|---|-----|---------|
| 5 | CRITICAL | **Production Clerk key is a placeholder.** `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_SET_ME"`. Building production will use this literal string, and auth will fail for every user. |
| 6 | CRITICAL | **Production project ID is a placeholder.** `EXPO_PUBLIC_PROJECT_ID: "SET_ME"`. Push notifications, OTA updates, and other EAS services will fail. |
| 7 | CRITICAL | **Apple submission config has placeholders.** `appleId: "your@apple.id"`, `ascAppId: "YOUR_APP_STORE_CONNECT_APP_ID"`, `appleTeamId: "YOUR_APPLE_TEAM_ID"`. `eas submit` will fail. |
| 8 | HIGH | **Android service account key is missing.** `serviceAccountKeyPath: "./google-service-account.json"`. File does not exist. `eas submit` for Android will fail. |
| 9 | HIGH | **No staging/preview Clerk key for preview builds.** `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in preview profile uses a test key (`pk_test_...`). This is intentional for testing, but confirms no production Clerk instance exists yet. |
| 10 | MEDIUM | **Development profile has localhost API URL.** `EXPO_PUBLIC_API_URL: "http://localhost:3000/api/v1"`. This is correct for dev, but `development` builds on physical devices won't reach localhost unless using `adb reverse` or LAN IP. |
| 11 | MEDIUM | **No `EXPO_PUBLIC_LIVEKIT_URL` in eas.json.** The livekit service (`services/livekit.ts`) falls back to `https://livekit.mizanly.app/api/v1`. This URL is hardcoded, not configurable per environment. Dev/preview builds will hit production LiveKit server. |
| 12 | LOW | **No `EXPO_PUBLIC_WS_URL` in production profile.** Preview profile has it but production doesn't. Socket.io will need to infer the WebSocket URL from the API URL or fail. |

---

## 3. MISSING NATIVE MODULE PLUGINS IN app.json

These packages are in `package.json` dependencies and require native configuration, but have NO corresponding plugin entry in `app.json`.

| # | Sev | Package | What It Needs | Current State |
|---|-----|---------|--------------|--------------|
| 13 | HIGH | `react-native-callkeep` | iOS: VoIP push entitlement, CallKit framework. Android: ConnectionService, PHONE permission. | **No plugin, no Android permission.** CallKit/ConnectionService will crash on first use in EAS build. |
| 14 | HIGH | `react-native-maps` | iOS: no special config. Android: Google Maps API key in `AndroidManifest.xml`. | **No API key configured.** Maps will show blank tiles on Android. Affects `halal-finder.tsx`, `mosque-finder.tsx`, `location-picker.tsx`. |
| 15 | MEDIUM | `expo-local-authentication` (used by `biometric-lock.tsx`) | iOS: `NSFaceIDUsageDescription` in Info.plist. | **Not declared in `infoPlist`.** iOS will crash when calling `LocalAuthentication.authenticateAsync()` with FaceID because the usage description is missing. |
| 16 | MEDIUM | `expo-contacts` (used by `contact-sync.tsx`) | iOS: `NSContactsUsageDescription`. | **Not declared in `infoPlist`.** iOS will crash when calling `Contacts.requestPermissionsAsync()`. |
| 17 | MEDIUM | `expo-crypto` (used by `contact-sync.tsx`) | Usually auto-linked. No special config needed. | OK, but verify with EAS build. |
| 18 | LOW | `expo-speech` | Auto-linked. No config needed. | OK. |
| 19 | LOW | `expo-store-review` | Auto-linked. No config needed but no plugin entry either. | OK. |

---

## 4. CUSTOM PLUGINS: DEFINED BUT NOT IN app.json

Four custom plugins exist in `apps/mobile/plugins/` but are NOT listed in `app.json`'s plugins array:

| # | Sev | Plugin | Purpose | Impact of Omission |
|---|-----|--------|---------|-------------------|
| 20 | HIGH | `notification-service-extension` | iOS NSE for decrypting E2E message previews in push notifications. Adds App Group for key sharing. | Without this plugin, EAS build won't include the NSE target. All push notifications will show the generic encrypted preview, never the decrypted message body. Core E2E notification feature is dead. |
| 21 | HIGH | `share-extension` | Registers app to receive shared content (images, videos, text, URLs) from other apps. Android: SEND intent filters. iOS: share extension registration. | Without this plugin, "Share to Mizanly" will not appear in the OS share sheet on either platform. |
| 22 | MEDIUM | `widgets` | Home screen widget native module. | Without this plugin, `widgetData.ts` data layer has no native widget to send data to. Feature is DOA. |
| 23 | MEDIUM | `kotlin-compat` | Likely resolves Kotlin version conflicts between native modules. | Without this plugin, EAS build may fail due to Kotlin version mismatches between react-native-maps, react-native-callkeep, react-native-quick-crypto, etc. |

---

## 5. DEEP LINK SCHEME AND UNIVERSAL LINKS

| # | Sev | Finding |
|---|-----|---------|
| 24 | HIGH | **`scheme: "mizanly"` is set.** Custom URL scheme (`mizanly://`) is correctly configured. Links like `mizanly://post/123` will open the app. |
| 25 | HIGH | **iOS associated domains list two hosts.** `applinks:mizanly.com` and `applinks:mizanly.app`. Both need `.well-known/apple-app-site-association` (AASA) files hosted on those domains. No evidence either exists. Without AASA, iOS universal links won't work -- links open in Safari instead of the app. |
| 26 | HIGH | **Android App Links `autoVerify: true` requires Digital Asset Links.** `/.well-known/assetlinks.json` must be hosted on both `mizanly.com` and `mizanly.app` with the app's SHA-256 certificate fingerprint. Without it, Android won't auto-verify and will show a disambiguation dialog. |
| 27 | MEDIUM | **Intent filters only cover 4 path prefixes.** `/post`, `/reel`, `/profile`, `/thread` are registered. Missing: `/video`, `/live`, `/event`, `/conversation`, `/hashtag`, `/audio-room`. Android won't intercept these URLs. |
| 28 | MEDIUM | **No deep link for `/channel`, `/product`, `/call`.** These are valid content types with shareable URLs but no intent filter or deep link handler. |

---

## 6. PERMISSIONS AUDIT

### iOS (infoPlist)

| Permission | Declared | Used By | Issue |
|-----------|----------|---------|-------|
| `NSCameraUsageDescription` | Yes | camera, create-reel, create-story, duet-create | OK |
| `NSMicrophoneUsageDescription` | Yes | voice-recorder, video recording, calls | OK |
| `NSPhotoLibraryUsageDescription` | Yes | image-picker for posts/stories | OK |
| `NSLocationWhenInUseUsageDescription` | Yes | prayer-times, qibla, halal-finder, mosque-finder | OK |
| `NSFaceIDUsageDescription` | **NO** | `biometric-lock.tsx` uses `expo-local-authentication` | **CRASH on FaceID prompt (#15)** |
| `NSContactsUsageDescription` | **NO** | `contact-sync.tsx` uses `expo-contacts` | **CRASH on contacts access (#16)** |
| `ITSAppUsesNonExemptEncryption` | `false` | Signal Protocol, XChaCha20 | **INCORRECT. App uses non-exempt encryption (Signal Protocol, XChaCha20-Poly1305). Should be `true` with proper export compliance docs, OR document the exemption under EAR Category 5 Part 2 exception for authentication/digital signatures.** |

### Android (permissions)

| Permission | Declared | Used By | Issue |
|-----------|----------|---------|-------|
| `RECORD_AUDIO` | Yes | voice, video, calls | OK |
| `CAMERA` | Yes | camera screens | OK |
| `MODIFY_AUDIO_SETTINGS` | Yes | calls, audio rooms | OK |
| `ACCESS_FINE_LOCATION` | Yes | prayer times, qibla | OK |
| `ACCESS_COARSE_LOCATION` | Yes | mosque finder | OK |
| `VIBRATE` | **NO** | Notifications, haptic feedback | May fail silently on some Android versions |
| `READ_CONTACTS` | **NO** | `contact-sync.tsx` | Will be requested at runtime but should be declared |
| `FOREGROUND_SERVICE` | **NO** | LiveKit calls (background audio) | Audio may cut when app is backgrounded |
| `WAKE_LOCK` | **NO** | `useKeepAwake` during calls | May not prevent screen sleep during calls |
| `USE_FULL_SCREEN_INTENT` | **NO** | Incoming call full-screen notification | CallKeep incoming call won't show full-screen on Android 10+ |

| # | Sev | Finding |
|---|-----|---------|
| 29 | HIGH | **`ITSAppUsesNonExemptEncryption: false` is likely incorrect.** The app implements Signal Protocol (X3DH, Double Ratchet, XChaCha20-Poly1305). This IS non-exempt encryption under US export law. Apple may flag this during review. Need export compliance documentation or the ECCN 5D002 exemption for personal messaging. |
| 30 | MEDIUM | **Missing `NSFaceIDUsageDescription`.** FaceID biometric lock will crash on first use. |
| 31 | MEDIUM | **Missing `NSContactsUsageDescription`.** Contact sync will crash on first use. |
| 32 | MEDIUM | **Missing Android `FOREGROUND_SERVICE` permission.** LiveKit calls may lose audio when backgrounded. |
| 33 | LOW | **Missing Android `VIBRATE` permission.** Most modern Android doesn't require it, but older devices may silently fail. |

---

## 7. EXPO EXPERIMENTS AND ENGINE

| # | Sev | Finding |
|---|-----|---------|
| 34 | LOW | **`typedRoutes: true` experiment is enabled.** This generates route types from the file system. Good. But the `navigate()` helper in `utils/navigation.ts` casts away all type safety, making this experiment ineffective for 60%+ of navigation calls. |
| 35 | LOW | **`jsEngine: "hermes"` is set.** Correct for production performance. No issue. |
| 36 | LOW | **No `expo-dev-client` in package.json.** This is required for EAS development builds with native modules (LiveKit, CallKit, ffmpeg-kit, quick-crypto). Without it, `eas build --profile development` will produce an Expo Go-compatible build that can't use these native modules. Must add `expo-dev-client` before first EAS build. |

---

## 8. MISSING app.config.ts

| # | Sev | Finding |
|---|-----|---------|
| 37 | LOW | **No `app.config.ts` exists.** All config is in static `app.json`. This means environment variables can't dynamically configure the app at build time (e.g., different bundle IDs for dev/staging/prod, different icon sets, feature flags). For production, a dynamic `app.config.ts` that reads from `process.env` is strongly recommended. |

---

## 9. WEB CONFIG

| # | Sev | Finding |
|---|-----|---------|
| 38 | LOW | **Web bundler is set to `metro` with `output: "single"`.** This means Expo Web will produce a single-page app. Fine for now. `favicon` reuses the 1x1 pixel `icon.png`. |

---

## SUMMARY

| Category | CRITICAL | HIGH | MEDIUM | LOW | Total |
|----------|----------|------|--------|-----|-------|
| Assets (icon/splash) | 3 | 1 | 0 | 0 | 4 |
| eas.json production | 3 | 2 | 2 | 1 | 8 |
| Missing native plugins | 0 | 2 | 2 | 2 | 6 |
| Orphaned custom plugins | 0 | 2 | 2 | 0 | 4 |
| Deep link / universal links | 0 | 3 | 2 | 0 | 5 |
| Permissions | 0 | 1 | 3 | 1 | 5 |
| Experiments / Engine | 0 | 0 | 0 | 3 | 3 |
| Missing app.config.ts | 0 | 0 | 0 | 1 | 1 |
| Web config | 0 | 0 | 0 | 1 | 1 |
| **Total** | **6** | **11** | **11** | **9** | **37** |

### Pre-EAS-Build Blockers (must fix before first build)

1. **Replace all three 1x1 placeholder images** with real 1024x1024 icon, 1024x768+ splash, and 432px+ adaptive icon
2. **Add `expo-dev-client` to package.json** -- required for native module builds
3. **Add 4 orphaned plugins to app.json plugins array** -- notification-service-extension, share-extension, widgets, kotlin-compat
4. **Add missing iOS permission strings** -- `NSFaceIDUsageDescription`, `NSContactsUsageDescription`
5. **Add `react-native-callkeep` plugin or manual config** -- CallKit/ConnectionService native setup
6. **Add Google Maps API key** for react-native-maps on Android
7. **Replace eas.json placeholders** -- Apple ID, team ID, ASC app ID, Clerk live key, project ID
8. **Resolve `ITSAppUsesNonExemptEncryption`** -- likely should be `true` with export compliance docs
9. **Deploy AASA and assetlinks.json** on `mizanly.com` and `mizanly.app` for universal links
