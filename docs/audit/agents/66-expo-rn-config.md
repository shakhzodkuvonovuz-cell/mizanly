# Agent 66 — Expo / React Native Configuration + Dependencies Audit

**Auditor:** Claude Opus 4.6 (Agent #66 of 67)
**Date:** 2026-03-21
**Scope:** All config files in `apps/mobile/` and `apps/api/`, dependency analysis, build configuration, provider setup, font loading, environment variable handling
**Files Audited:**
- `apps/mobile/package.json`
- `apps/mobile/app.json`
- `apps/mobile/tsconfig.json`
- `apps/mobile/babel.config.js`
- `apps/mobile/metro.config.js`
- `apps/mobile/eas.json`
- `apps/mobile/jest.config.ts`
- `apps/mobile/jest.setup.ts`
- `apps/mobile/.env` / `.env.example`
- `apps/mobile/expo-env.d.ts`
- `apps/mobile/app/_layout.tsx`
- `apps/mobile/src/config/sentry.ts`
- `apps/mobile/src/services/pushNotifications.ts`
- `apps/mobile/src/hooks/usePushNotifications.ts`
- `apps/mobile/src/services/widgetData.ts`
- `apps/mobile/src/store/index.ts`
- `apps/mobile/src/hooks/useAmbientColor.ts`
- `apps/mobile/src/components/ErrorBoundary.tsx`
- `apps/mobile/src/types/expo-local-authentication.d.ts`
- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/api/nest-cli.json`
- `apps/api/.env.example`
- `package.json` (root monorepo)
- `.eslintrc.json` (root)
- `.prettierrc` (root)

**Total Findings: 52**

---

## CRITICAL (Ship Blockers) — 8 findings

### C-01: `expo-local-authentication` not installed — biometric lock crashes at runtime
- **File:** `apps/mobile/package.json` (entire file — package NOT listed)
- **Evidence:** The package is imported in 3 files but is NOT in package.json AND does NOT exist in node_modules (verified):
  - `apps/mobile/app/_layout.tsx:11-12` — `import type { AuthenticateResult } from 'expo-local-authentication'` and `import * as LocalAuthentication from 'expo-local-authentication'`
  - `apps/mobile/app/(screens)/biometric-lock.tsx:6` — `import * as LocalAuthentication from 'expo-local-authentication'`
  - `apps/mobile/src/hooks/useChatLock.ts:5` — `import * as LocalAuthentication from 'expo-local-authentication'`
- **Impact:** The app will crash on import resolution in the root `_layout.tsx` since `LocalAuthentication` is imported at the top level (not dynamically). The entire app fails to boot. Even though there's a `src/types/expo-local-authentication.d.ts` type stub, it only satisfies TypeScript — at runtime the native module is missing.
- **Fix:** Run `npx expo install expo-local-authentication` and add `"expo-local-authentication"` to the plugins array in `app.json`.

### C-02: `@react-native-async-storage/async-storage` not in package.json — Zustand store persistence broken
- **File:** `apps/mobile/package.json` (entire file — package NOT listed)
- **Evidence:** The package is imported in 18 files (verified by grep) but is NOT in `apps/mobile/package.json`. It does exist in the root `node_modules/` (hoisted by npm workspaces), which means it works by accident during development but will FAIL in EAS builds.
  - `apps/mobile/src/store/index.ts:3` — `import AsyncStorage from '@react-native-async-storage/async-storage'`
  - `apps/mobile/src/services/widgetData.ts:1` — `import AsyncStorage from '@react-native-async-storage/async-storage'`
  - `apps/mobile/src/services/offlineCache.ts:1` — same import
  - `apps/mobile/src/utils/feedCache.ts:1` — same import
  - `apps/mobile/src/utils/offlineQueue.ts:1` — same import
  - Plus 13 more screen files that import it
- **Impact:** The Zustand store uses `persist()` middleware with AsyncStorage. Without the package declared, EAS build may fail or the store won't persist across app restarts. Widget data, offline cache, and feed cache all break.
- **Fix:** Run `npx expo install @react-native-async-storage/async-storage`

### C-03: No Apple In-App Purchase (IAP) library installed — App Store will reject
- **File:** `apps/mobile/package.json` (entire file)
- **Evidence:** No `react-native-iap`, `expo-in-app-purchases`, or `expo-iap` package exists anywhere in the dependency tree. Grep for `expo-in-app-purchases|react-native-iap|expo-iap` returns zero files.
- **Impact:** Apple requires all digital goods purchases to go through IAP. The app has coin/diamond/premium subscription features but they all route through Stripe directly. Apple will reject the app during review. This is a known gap but remains a P0 blocker for App Store launch.
- **Fix:** Install `expo-iap` (Expo SDK 52 compatible) or `react-native-iap` and implement IAP flow for digital goods.

### C-04: `google-services.json` missing — Android push notifications completely broken
- **File:** `apps/mobile/` directory (file does not exist)
- **Evidence:** `apps/mobile/google-services.json` does not exist. Neither does `apps/mobile/android/app/google-services.json`. Expo push notifications on Android require Firebase Cloud Messaging, which requires this config file.
- **Impact:** `expo-notifications` will fail to get a push token on Android devices. The `usePushNotifications` hook will silently fail at `Notifications.getExpoPushTokenAsync()`. No Android user will ever receive push notifications.
- **Fix:** Create a Firebase project, download `google-services.json`, place it in `apps/mobile/`, and add the `expo-notifications` plugin config for Android FCM in `app.json`.

### C-05: `GoogleService-Info.plist` missing — iOS push notifications need APNs configuration
- **File:** `apps/mobile/` directory (file does not exist)
- **Evidence:** No `GoogleService-Info.plist` found. While Expo can use APNs directly (not requiring Firebase for iOS), the `eas.json` submit config has placeholder Apple credentials (`"appleId": "your@apple.id"`, `"ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID"`).
- **Impact:** iOS push notifications via EAS depend on properly configured APNs credentials. Without real Apple Team ID and App Store Connect app ID, `eas submit` will fail.
- **Fix:** Fill in real Apple credentials in `eas.json` submit config. Configure push notification credentials via `eas credentials`.

### C-06: `expo-constants` not in package.json — push token registration could fail
- **File:** `apps/mobile/package.json` (package NOT listed)
- **Evidence:** `apps/mobile/src/services/pushNotifications.ts:3` imports `import Constants from 'expo-constants'`. The package is NOT in `package.json` but IS in `node_modules/` (as an implicit dependency of `expo`).
- **Impact:** While `expo-constants` ships as a transitive dependency of `expo`, relying on implicit deps is fragile. If the hoisting behavior changes or the app is ejected, it will break. The `projectId` used for push tokens comes from `Constants.expoConfig?.extra?.eas?.projectId`.
- **Fix:** Run `npx expo install expo-constants` to make the dependency explicit.

### C-07: Duplicate `Pressable` import in call screen — syntax error / runtime warning
- **File:** `apps/mobile/app/(screens)/call/[id].tsx:3-5`
- **Code:**
  ```tsx
  import {
    View, Text, StyleSheet, Pressable,
    Alert, Dimensions,
    Pressable,
  } from 'react-native';
  ```
- **Impact:** `Pressable` is imported twice. In strict mode this is a SyntaxError. In non-strict mode, the second import shadows the first (no functional difference but it's a code smell that suggests copy-paste errors). Some bundlers may reject this.
- **Fix:** Remove the duplicate `Pressable,` on line 5.

### C-08: `expo-dev-client` not installed — EAS development builds will use Expo Go (limited)
- **File:** `apps/mobile/package.json` (package NOT listed)
- **Evidence:** `eas.json` has a `development` profile with `"developmentClient": true`, but `expo-dev-client` is not in package.json and not installed in node_modules.
- **Impact:** EAS development builds require `expo-dev-client` to create a custom dev client. Without it, EAS build will fail or fall back to Expo Go, which cannot load native modules like `react-native-maps`, `ffmpeg-kit-react-native`, `react-native-mmkv`, or `react-native-image-colors`.
- **Fix:** Run `npx expo install expo-dev-client`

---

## HIGH (Significant Issues) — 14 findings

### H-01: No `react-native-webrtc` installed — all call/live screens are UI facades
- **File:** `apps/mobile/package.json` (package NOT listed)
- **Evidence:** Grep for `react-native-webrtc` returns 0 files in the entire mobile app. The call screen `apps/mobile/app/(screens)/call/[id].tsx` uses socket.io for signaling but has NO WebRTC peer connection code. No `RTCPeerConnection`, `RTCSessionDescription`, or `mediaDevices` usage found.
- **Impact:** Voice calls, video calls, live streaming, and audio rooms are ALL non-functional UI mockups. Users see call UI but no actual audio/video is transmitted.
- **Fix:** Install `react-native-webrtc` or `expo-webrtc` (if available for SDK 52) and implement actual WebRTC peer connections.

### H-02: `ffmpeg-kit-react-native` is not Expo-compatible — video editor will crash in managed workflow
- **File:** `apps/mobile/package.json:51` — `"ffmpeg-kit-react-native": "^6.0.2"`
- **Evidence:** `ffmpeg-kit-react-native` requires native linking and is not compatible with Expo managed workflow. It's not in the Expo config plugins. The video editor at `apps/mobile/app/(screens)/video-editor.tsx:146` uses a dynamic import (`await import('ffmpeg-kit-react-native').catch(() => null)`) which will always return null in Expo Go.
- **Impact:** Video editing (trim, filters, speed, text overlay) silently fails. The export button shows an alert "Export failed" because FFmpegKit is null.
- **Fix:** Either eject to bare workflow and configure native linking, or replace with `expo-video` API or a cloud-based video processing approach.

### H-03: `@sentry/react-native` not installed — crash reporting is a no-op
- **File:** `apps/mobile/package.json` (package NOT listed)
- **Evidence:** `apps/mobile/src/config/sentry.ts` uses `require('@sentry/react-native')` inside try/catch (lines 21, 49, 58). The package is NOT in package.json and NOT in node_modules. The try/catch silently swallows the require failure.
- **Impact:** All crash reporting, exception capture, and user tracking via Sentry is completely non-functional. `initSentry()` in `_layout.tsx:45` is a no-op. `captureException()` calls throughout the app do nothing.
- **Fix:** Run `npx expo install @sentry/react-native` and add the Sentry plugin to `app.json` plugins array.

### H-04: `expo-location` plugin missing from app.json — location permissions not configured
- **File:** `apps/mobile/app.json:64-91` (plugins array)
- **Evidence:** `expo-location` is in package.json (`"expo-location": "^55.1.4"`) and imported in 6 screen files (qibla-compass, morning-briefing, halal-finder, mosque-finder, prayer-times, location-picker). However, `expo-location` is NOT in the `plugins` array in `app.json`, and there are NO `NSLocationWhenInUseUsageDescription` or `NSLocationAlwaysUsageDescription` entries in `infoPlist`.
- **Impact:** On iOS, the app will crash or show a blank permission dialog when requesting location. On Android, `ACCESS_FINE_LOCATION` is not declared. Location-dependent features (prayer times by location, qibla compass, mosque finder, halal restaurant finder) will all fail.
- **Fix:** Add `["expo-location", { "locationWhenInUsePermission": "Mizanly uses your location for prayer times, qibla direction, and finding nearby mosques." }]` to plugins, and add `NSLocationWhenInUseUsageDescription` to `infoPlist`.

### H-05: `EXPO_PUBLIC_WS_URL` defined but never used — WebSocket URL computed from API URL instead
- **File:** `apps/mobile/.env:3` — `EXPO_PUBLIC_WS_URL=https://mizanlyapi-production.up.railway.app`
- **Evidence:** `EXPO_PUBLIC_WS_URL` is set in `.env`, `.env.example`, and `eas.json` preview build. However, it is NEVER referenced in any source code. All socket connections derive the URL from `EXPO_PUBLIC_API_URL`:
  - `apps/mobile/app/(tabs)/risalah.tsx:199` — `const SOCKET_URL = \`${(process.env.EXPO_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:3000')}/chat\``
  - `apps/mobile/app/(screens)/call/[id].tsx:47` — same pattern
  - `apps/mobile/app/(screens)/conversation/[id].tsx:57` — same pattern
  - `apps/mobile/app/(screens)/quran-room.tsx:28` — same pattern
- **Impact:** If the WebSocket server ever moves to a different URL than the API server, the env var won't help because it's ignored. The code computes the WS URL by stripping `/api/v1` from the API URL — this is fragile and will break if the API path structure changes.
- **Fix:** Either use `EXPO_PUBLIC_WS_URL` in the socket connection code, or remove it from env files to avoid confusion.

### H-06: `eas.json` production build has placeholder credentials — cannot actually build/submit
- **File:** `apps/mobile/eas.json:22-43`
- **Code:**
  ```json
  "production": {
    "env": {
      "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY": "pk_live_SET_ME",
      "EXPO_PUBLIC_PROJECT_ID": "SET_ME"
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "your@apple.id",
        "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID",
        "appleTeamId": "YOUR_APPLE_TEAM_ID"
      },
      "android": {
        "serviceAccountKeyPath": "./google-service-account.json"
      }
    }
  }
  ```
- **Impact:** Production builds will use placeholder Clerk key `pk_live_SET_ME` (auth will fail). `eas submit` to both App Store and Play Store will fail because credentials are placeholders. The `google-service-account.json` file also doesn't exist.
- **Fix:** Replace all `SET_ME` / `YOUR_*` placeholders with real credentials before production builds.

### H-07: `expo-updates` not configured — no OTA update capability
- **File:** `apps/mobile/app.json` (no `updates` key), `apps/mobile/package.json` (no `expo-updates`)
- **Evidence:** The `app.json` has no `updates` configuration block and `expo-updates` is not in the dependency list. There's no `runtimeVersion` set.
- **Impact:** The app has no OTA (over-the-air) update capability. Every bug fix requires a full native build + App Store/Play Store review cycle. For a social app with 79 backend modules and 208 screens, this means slow iteration after launch.
- **Fix:** Run `npx expo install expo-updates`, add `"runtimeVersion": { "policy": "appVersion" }` to `app.json`, and configure EAS Update.

### H-08: Clerk publishable key hardcoded in `eas.json` preview build — exposed in git
- **File:** `apps/mobile/eas.json:18`
- **Code:** `"EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY": "pk_test_YmlnLWRyYWdvbi03LmNsZXJrLmFjY291bnRzLmRldiQ"`
- **Evidence:** Same key is in `apps/mobile/.env:2`. Both files are committed to git.
- **Impact:** While Clerk publishable keys are designed to be public (they're embedded in client apps), having them in git history makes it harder to rotate if needed. The `.env` file should be in `.gitignore`.
- **Fix:** Add `apps/mobile/.env` to `.gitignore` (it currently is NOT gitignored — the mobile `.gitignore` only has `expo-env.d.ts`). Use EAS Secrets for build-time env vars instead.

### H-09: ESLint 9 installed with legacy config format — linting is broken
- **File:** `apps/mobile/package.json:78` — `"eslint": "^9.0.0"`; `.eslintrc.json` (root config)
- **Evidence:** ESLint 9 removed support for `.eslintrc.*` config format by default (requires `ESLINT_USE_FLAT_CONFIG=false` env var). The root config at `.eslintrc.json` uses the legacy format with `"extends"`, `"plugins"`, `"rules"`. Furthermore, `@typescript-eslint/parser` and `@typescript-eslint` plugin are referenced in `.eslintrc.json` but are NOT installed anywhere (not in root, mobile, or API package.json, and NOT in node_modules — verified).
- **Impact:** Running `npm run lint` in the mobile app will fail because: (1) ESLint 9 doesn't load `.eslintrc.json` by default, (2) the `--ext` flag used in the lint script is deprecated in ESLint 9, and (3) `@typescript-eslint/parser` is not installed.
- **Fix:** Either downgrade ESLint to `^8.0.0`, or migrate to flat config format (`eslint.config.js`). Install `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin`.

### H-10: `prettier` not installed — format scripts fail
- **File:** `package.json:19-20` (root)
- **Code:**
  ```json
  "format": "prettier --write \"apps/**/*.{ts,tsx}\" \"packages/**/*.ts\"",
  "format:check": "prettier --check \"apps/**/*.{ts,tsx}\" \"packages/**/*.ts\""
  ```
- **Evidence:** `prettier` is NOT in any package.json (root, mobile, or API) as a dependency or devDependency. Verified: `node_modules/prettier/package.json` does not exist.
- **Impact:** Running `npm run format` or `npm run format:check` from the root will fail with "prettier: command not found".
- **Fix:** Add `"prettier": "^3.0.0"` to root devDependencies.

### H-11: `react-server-dom-webpack` override is suspicious and potentially dangerous
- **File:** `package.json:26-28` (root)
- **Code:**
  ```json
  "overrides": {
    "react-server-dom-webpack": "19.1.0"
  }
  ```
- **Evidence:** `react-server-dom-webpack` is a React Server Components package. It's overridden to v19.1.0, but the project uses React 18.3.1 (`apps/mobile/package.json:54`). This is a version mismatch — React 19 server components with React 18 client.
- **Impact:** This override was likely added to fix an npm resolution conflict. But pinning a React 19 package while using React 18 can cause subtle runtime issues if any code path triggers RSC functionality. The override should be removed or aligned with the React version in use.
- **Fix:** Investigate why this override exists. If it's just to suppress npm warnings, consider using `--legacy-peer-deps` instead.

### H-12: Mobile `.env` file is tracked in git — credentials exposed
- **File:** `apps/mobile/.env`
- **Evidence:** The mobile `.gitignore` only contains `expo-env.d.ts` (auto-generated by Expo). The `.env` file containing the Clerk publishable key and production API URL is tracked in git and shows up in `git status` (no gitignore rule excludes it).
- **Impact:** Any `.env` values (including future secrets) will be committed to the repository. The Clerk key and Railway API URL are currently exposed in git history.
- **Fix:** Add `*.env` and `.env.*` (except `.env.example`) to `apps/mobile/.gitignore`.

### H-13: `app.json` uses deprecated `splash` config — Expo SDK 52 recommends `expo-splash-screen` plugin
- **File:** `apps/mobile/app.json:10-14`
- **Code:**
  ```json
  "splash": {
    "image": "./assets/images/splash.png",
    "resizeMode": "contain",
    "backgroundColor": "#0A7B4F"
  }
  ```
- **Evidence:** Expo SDK 52 recommends using the `expo-splash-screen` plugin in the `plugins` array for more control. The `splash` top-level key still works but is considered legacy. The `expo-splash-screen` package IS in package.json (`"expo-splash-screen": "^0.29.24"`) but is NOT in the plugins array.
- **Impact:** The splash screen works but uses the legacy configuration path. New features like animated splash screens or dark mode splash are not available.
- **Fix:** Add `["expo-splash-screen", { "image": "./assets/images/splash.png", "backgroundColor": "#0A7B4F", "resizeMode": "contain" }]` to the plugins array.

### H-14: `EXPO_PUBLIC_PROJECT_ID` missing from `.env` and `.env.example` — push token registration fails
- **File:** `apps/mobile/.env` and `apps/mobile/.env.example`
- **Evidence:** `EXPO_PUBLIC_PROJECT_ID` is referenced in:
  - `apps/mobile/eas.json:27` — production build only (`"EXPO_PUBLIC_PROJECT_ID": "SET_ME"`)
  - `apps/mobile/src/hooks/usePushNotifications.ts:74` — `projectId: process.env.EXPO_PUBLIC_PROJECT_ID`
  - `apps/mobile/src/services/pushNotifications.ts:62` — `projectId: Constants.expoConfig?.extra?.eas?.projectId || process.env.EXPO_PUBLIC_PROJECT_ID`

  But it's NOT in `.env` or `.env.example`. The `usePushNotifications.ts:74` uses ONLY `process.env.EXPO_PUBLIC_PROJECT_ID` (no fallback to `Constants.expoConfig`), so in development it will be `undefined`.
- **Impact:** `Notifications.getExpoPushTokenAsync({ projectId: undefined })` may fail or return an invalid token. Push notifications don't work in dev builds at all.
- **Fix:** Add `EXPO_PUBLIC_PROJECT_ID=d5a4cde9-ecd1-4d17-bfb1-1d84fccd4b89` to `.env` (the project ID is already in `app.json` extra.eas.projectId). Or better: use `Constants.expoConfig?.extra?.eas?.projectId` consistently in both files.

---

## MEDIUM (Quality / Correctness Issues) — 18 findings

### M-01: `@types/qrcode` in production dependencies instead of devDependencies
- **File:** `apps/api/package.json:40`
- **Code:** `"@types/qrcode": "^1.5.6"` (in `dependencies` block, not `devDependencies`)
- **Impact:** Type packages should be in devDependencies. They inflate the production bundle/Docker image unnecessarily.
- **Fix:** Move `@types/qrcode` from `dependencies` to `devDependencies`.

### M-02: `tsconfig-paths` duplicated in both dependencies and devDependencies
- **File:** `apps/api/package.json:58,79`
- **Code:**
  - Line 58 (dependencies): `"tsconfig-paths": "^4.2.0"`
  - Line 79 (devDependencies): `"tsconfig-paths": "^4.2.0"`
- **Impact:** Same version in both dep groups. Wastes space and causes confusion. Should only be in one.
- **Fix:** Remove from `dependencies`, keep only in `devDependencies`.

### M-03: `react-native-maps` installed but never imported
- **File:** `apps/mobile/package.json:61` — `"react-native-maps": "^1.27.2"`
- **Evidence:** Grep for `react-native-maps` and `MapView` across `apps/mobile/app/` and `apps/mobile/src/` returns 0 files. The package exists in root `node_modules/` (hoisted) but is never used.
- **Impact:** Adds ~2MB to the native binary. Requires Google Maps API key configuration on Android that's never been set up. Dead weight.
- **Fix:** Remove from package.json if maps are not planned for current release.

### M-04: `react-native-image-viewing` installed but never imported
- **File:** `apps/mobile/package.json:60` — `"react-native-image-viewing": "^0.2.2"`
- **Evidence:** Grep returns 0 files outside package.json. The `ImageLightbox` component at `apps/mobile/src/components/ui/ImageLightbox.tsx` uses a custom implementation with `react-native-gesture-handler` and `react-native-reanimated` instead.
- **Impact:** Dead dependency adding to bundle size.
- **Fix:** Remove from package.json.

### M-05: `react-native-mmkv` installed but never imported
- **File:** `apps/mobile/package.json:62` — `"react-native-mmkv": "^3.2.0"`
- **Evidence:** Grep returns 0 files outside package.json. The app uses `@react-native-async-storage/async-storage` for persistence instead.
- **Impact:** Dead dependency. MMKV requires native module linking, adding binary size for nothing.
- **Fix:** Remove from package.json, or migrate from AsyncStorage to MMKV (which is significantly faster).

### M-06: `react-dom` and `react-native-web` installed but never imported in source
- **File:** `apps/mobile/package.json:55,68`
- **Code:**
  ```
  "react-dom": "^18.3.1",
  "react-native-web": "^0.19.13"
  ```
- **Evidence:** Grep for both across `apps/mobile/src/` returns 0 files. These are web platform dependencies.
- **Impact:** These are needed if `expo start --web` is used, but the `web` config in `app.json` is minimal and no web-specific code exists. They add to `npm install` time.
- **Fix:** Keep if web support is planned, otherwise remove.

### M-07: `expo-auth-session` in root package.json but never imported
- **File:** `package.json:30` (root) — `"expo-auth-session": "~6.0.3"`
- **Evidence:** Grep for `expo-auth-session` across `apps/mobile/` returns 0 files. The app uses `@clerk/clerk-expo` for auth, not raw OAuth sessions.
- **Impact:** Dead dependency at root level. May cause version conflicts with Expo SDK.
- **Fix:** Remove from root package.json.

### M-08: `resend` in root package.json — should be in API package.json
- **File:** `package.json:32` (root) — `"resend": "^6.9.4"`
- **Evidence:** Resend is used only by the API (`apps/api/src/common/services/email.service.ts:27` — `const { Resend } = await import('resend')`), but it's declared in the root package.json, not in `apps/api/package.json`.
- **Impact:** The API service does a dynamic `import('resend')` which resolves because it's hoisted to root. But this is fragile — if the API is deployed independently (e.g., Docker), resend won't be in its `node_modules/`.
- **Fix:** Move `resend` to `apps/api/package.json` dependencies.

### M-09: `expo-web-browser` duplicated — in both root and mobile package.json
- **File:** `package.json:31` (root) — `"expo-web-browser": "~14.0.2"`; `apps/mobile/package.json:50` — `"expo-web-browser": "~14.0.2"`
- **Impact:** Same version in two package.json files. In a monorepo, the root declaration is unnecessary and could cause resolution conflicts.
- **Fix:** Remove from root package.json.

### M-10: `ErrorBoundary` has hardcoded English strings — no i18n
- **File:** `apps/mobile/src/components/ErrorBoundary.tsx:37-39`
- **Code:**
  ```tsx
  <Text style={styles.title}>Something went wrong</Text>
  <Text style={styles.message} numberOfLines={3}>
    {this.state.error?.message ?? 'An unexpected error occurred.'}
  </Text>
  <Pressable style={styles.btn} onPress={this.handleReset}>
    <Text style={styles.btnText}>Try again</Text>
  </Pressable>
  ```
- **Impact:** Error boundary is a class component and cannot use the `useTranslation()` hook. All error text is hardcoded in English — Arabic, Turkish, Urdu, Bengali, French, Indonesian, and Malay users see English errors.
- **Fix:** Create a functional wrapper component that passes `t()` as a prop, or use `i18next.t()` directly (non-hook import).

### M-11: `app.json` missing `NSLocationWhenInUseUsageDescription` — iOS location permission string absent
- **File:** `apps/mobile/app.json:22-27` (infoPlist)
- **Evidence:** The `infoPlist` section has camera, microphone, and photo library descriptions, but NO location description. Yet `expo-location` is a dependency used in 6 screens.
- **Impact:** iOS requires a usage description for location access. Without it, the app may crash when requesting location or Apple will reject the app during review.
- **Fix:** Add `"NSLocationWhenInUseUsageDescription": "Mizanly uses your location for prayer times, qibla direction, and finding nearby mosques."` to infoPlist.

### M-12: `metro.config.js` watches non-existent `packages/` directory
- **File:** `apps/mobile/metro.config.js:12`
- **Code:** `path.resolve(monorepoRoot, 'packages')`
- **Evidence:** The `packages/shared/` directory exists but contains only a bare TypeScript package (`src/index.ts`). More importantly, `@mizanly/shared` is never imported by any file in `apps/mobile/` (grep returns 0 files).
- **Impact:** Metro watches an unused directory, slightly increasing file watcher overhead.
- **Fix:** Remove the packages watch folder if the shared package isn't used by mobile, or start using it for shared types.

### M-13: `jest.config.ts` has incomplete `transformIgnorePatterns`
- **File:** `apps/mobile/jest.config.ts:6-8`
- **Code:**
  ```ts
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@shopify/flash-list|lucide-react-native|zustand)',
  ],
  ```
- **Evidence:** Missing from the allow-list: `socket.io-client`, `react-native-reanimated`, `react-native-gesture-handler`, `react-native-svg`, `react-native-qrcode-svg`, `react-native-image-colors`, `date-fns`. These packages ship ESM or untranspiled code that Jest can't handle without transformation.
- **Impact:** Tests that import components using these packages will fail with syntax errors like "Cannot use import statement outside a module".
- **Fix:** Add the missing packages to the regex allow-list.

### M-14: `jest.setup.ts` mocks are minimal — missing critical mocks
- **File:** `apps/mobile/jest.setup.ts`
- **Evidence:** Only 3 modules are mocked: `expo-haptics`, `expo-secure-store`, `expo-router`. Missing mocks for: `expo-font`, `expo-splash-screen`, `expo-clipboard`, `expo-image`, `expo-av`, `expo-camera`, `expo-linear-gradient`, `expo-notifications`, `expo-location`, `react-native-reanimated`, `react-native-gesture-handler`, `@clerk/clerk-expo`, `@tanstack/react-query`, `react-native-safe-area-context`, `socket.io-client`.
- **Impact:** Any test that imports a component using these unmocked modules will fail or behave unpredictably.
- **Fix:** Add mock files in `__mocks__/` or extend `jest.setup.ts` with mocks for all native modules.

### M-15: `tsconfig.json` path aliases not matched in `babel.config.js`
- **File:** `apps/mobile/tsconfig.json:6-15` defines 8 path aliases (`@/*`, `@components/*`, etc.)
- **Evidence:** `babel.config.js` has NO path alias resolution plugin (`babel-plugin-module-resolver` is not installed or configured). The aliases only work because Metro's `metro.config.js` resolves them at bundle time.
- **Impact:** TypeScript is happy (compiler knows the paths), and Metro resolves them for the app. But Jest does NOT — `jest.config.ts` only maps `@/*` → `<rootDir>/src/$1`. The other 7 aliases (`@components/*`, `@screens/*`, etc.) are not mapped in Jest config, meaning any test using them will fail.
- **Fix:** Add all path aliases to `jest.config.ts` moduleNameMapper, or install and configure `babel-plugin-module-resolver`.

### M-16: API `tsconfig.json` not strict mode — only partial strictness
- **File:** `apps/api/tsconfig.json:2-20`
- **Evidence:** The config has `strictNullChecks`, `noImplicitAny`, `strictBindCallApply` individually set, but NOT `"strict": true`. Missing strict flags: `strictFunctionTypes`, `strictPropertyInitialization`, `noImplicitThis`, `alwaysStrict`.
- **Impact:** `strictPropertyInitialization` being off means class properties can be used before being assigned without TypeScript complaining. This is a common source of runtime `undefined` errors in NestJS services.
- **Fix:** Set `"strict": true` to enable all strict checks.

### M-17: Multiple screens use raw `process.env.EXPO_PUBLIC_API_URL` instead of centralized API client
- **File:** Multiple screens bypass the centralized API client:
  - `apps/mobile/app/(screens)/chat-folders.tsx:18` — `const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1'`
  - `apps/mobile/app/(screens)/mentorship.tsx:21` — same pattern
  - `apps/mobile/app/(screens)/fatwa-qa.tsx:19` — same pattern
  - `apps/mobile/app/(screens)/local-boards.tsx:18` — same pattern
  - `apps/mobile/app/(screens)/saved-messages.tsx:24` — same pattern
  - `apps/mobile/app/(screens)/watch-party.tsx:19` — same pattern
  - `apps/mobile/app/(screens)/waqf.tsx:17` — same pattern
- **Impact:** These screens likely use raw `fetch()` without the auth token (Clerk JWT) since they bypass `api.ts`'s `setTokenGetter`. API calls from these screens will return 401 Unauthorized for authenticated endpoints.
- **Fix:** Refactor to use the centralized `api` client from `@/services/api`.

### M-18: `source-map-support` in API devDependencies but never imported
- **File:** `apps/api/package.json:76` — `"source-map-support": "^0.5.21"`
- **Evidence:** Grep for `source-map-support` in `apps/api/src/` returns 0 files. It's never imported or required.
- **Impact:** Dead devDependency.
- **Fix:** Remove, or add `import 'source-map-support/register'` to `main.ts` for better stack traces.

---

## LOW (Minor / Informational) — 12 findings

### L-01: `app.json` `assetBundlePatterns` includes everything — potential large bundle
- **File:** `apps/mobile/app.json:15-17`
- **Code:** `"assetBundlePatterns": ["**/*"]`
- **Impact:** Bundles ALL files in the project directory as assets. If there are large files (videos, PDFs, etc.) in the project, they'll be included in the binary.
- **Fix:** Restrict to `"assets/**/*"` or specific patterns.

### L-02: `app.json` web output set to `"single"` — no SSR or static rendering
- **File:** `apps/mobile/app.json:60`
- **Code:** `"output": "single"`
- **Impact:** Low — web is not a primary target. But if web support is ever needed, SPA mode means no SEO.

### L-03: `IslamicThemeBanner` and `EidCelebrationOverlay` hardcode colors
- **File:** `apps/mobile/app/_layout.tsx:62-68, 104-119`
- **Code:** Colors like `'#fff'`, `'rgba(0,0,0,0.7)'` are hardcoded instead of using theme tokens.
- **Impact:** Violates the "never hardcode colors" rule from CLAUDE.md. These components won't adapt to light mode.
- **Fix:** Use `colors.text.primary`, `colors.dark.bg` + opacity, etc.

### L-04: `EidCelebrationOverlay` uses emoji `🎉` instead of Icon component
- **File:** `apps/mobile/app/_layout.tsx:111`
- **Code:** `<Text style={{ fontSize: 48 }}>🎉</Text>`
- **Impact:** Violates rule "NEVER use text emoji for icons — Always `<Icon name="..." />`". Emoji rendering varies across platforms.
- **Fix:** Replace with an appropriate Icon or Lottie animation.

### L-05: QueryClient `staleTime` of 5 minutes may be too long for a social app
- **File:** `apps/mobile/app/_layout.tsx:126`
- **Code:** `staleTime: 5 * 60 * 1000` (5 minutes)
- **Impact:** Users won't see new posts, messages, or notifications for up to 5 minutes. For a real-time social app, 30-60 seconds is more appropriate.
- **Fix:** Reduce to `30 * 1000` for feeds, keep longer for static content. Use per-query staleTime overrides.

### L-06: `BiometricLockOverlay` hardcodes `colors.dark.bg` — breaks light mode
- **File:** `apps/mobile/app/_layout.tsx:274`
- **Code:** `backgroundColor: colors.dark.bg`
- **Impact:** Lock overlay always shows dark background even in light mode. Same pattern in ErrorBoundary.

### L-07: `tokenCache` web implementation uses `localStorage` without checking SSR
- **File:** `apps/mobile/app/_layout.tsx:146`
- **Code:** `return localStorage.getItem(key)` — no check for `typeof window !== 'undefined'`
- **Impact:** If the code ever runs in SSR/Node.js context, it will crash. Low risk since Expo web is SPA.

### L-08: Android `permissions` in app.json may be redundant with plugin config
- **File:** `apps/mobile/app.json:52-56`
- **Code:**
  ```json
  "permissions": [
    "android.permission.RECORD_AUDIO",
    "android.permission.CAMERA",
    "android.permission.MODIFY_AUDIO_SETTINGS"
  ]
  ```
- **Impact:** These permissions are already auto-added by `expo-camera` and `expo-av` plugins. Redundant declarations don't cause issues but add maintenance burden.

### L-09: `nest-cli.json` missing `assets` configuration
- **File:** `apps/api/nest-cli.json`
- **Evidence:** No `assets` array configured. If the API needs to serve static files or templates (e.g., email templates), they won't be copied to the `dist/` output.
- **Impact:** Low for now, but if email templates or static assets are added later, the build won't include them.

### L-10: `pino-pretty` is in devDependencies but `nestjs-pino` is in dependencies — log formatting inconsistency
- **File:** `apps/api/package.json:48,72`
- **Evidence:** `pino-pretty` (devDependencies) is needed for human-readable logs in development. But it's not configured — no `nestjs-pino` config specifying pretty-print transport was found.
- **Impact:** Logs in development may be raw JSON without pretty formatting.

### L-11: `@expo/config-plugins` version mismatch — v55 with SDK 52
- **File:** `apps/mobile/package.json:21` — `"@expo/config-plugins": "^55.0.6"`
- **Evidence:** The installed Expo SDK is 52.0.49. `@expo/config-plugins` v55 is from Expo SDK 55 era. This is a version mismatch that could cause incompatibilities with plugin APIs.
- **Impact:** May cause issues with custom config plugins or EAS build. Currently not imported anywhere in user code (0 files reference it).
- **Fix:** Run `npx expo install @expo/config-plugins` to get the SDK 52-compatible version, or remove if unused.

### L-12: `expo-localization` version mismatch — `^55.0.8` with SDK 52
- **File:** `apps/mobile/package.json:43` — `"expo-localization": "^55.0.8"`
- **Evidence:** Same issue as L-11. Expo packages should match the SDK version to avoid native module incompatibilities.
- **Fix:** Run `npx expo install expo-localization` to get the SDK 52-compatible version.

---

## Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| **CRITICAL** | 8 | Missing native modules (expo-local-authentication, async-storage), no IAP, no Firebase config, duplicate imports |
| **HIGH** | 14 | No WebRTC, broken ESLint/Prettier, no OTA updates, credential placeholders, missing location permissions |
| **MEDIUM** | 18 | Dead dependencies, incomplete Jest mocks, raw fetch bypassing auth, partial TypeScript strictness |
| **LOW** | 12 | Hardcoded colors, emoji usage, version mismatches, redundant configs |

### Top 5 Must-Fix Before Launch
1. **C-01:** Install `expo-local-authentication` — app won't boot without it
2. **C-02:** Add `@react-native-async-storage/async-storage` to mobile package.json — store persistence broken
3. **C-04/C-05:** Add Firebase/APNs configuration — no user gets push notifications
4. **H-04:** Add `expo-location` plugin + iOS permission string — prayer times/mosque finder crash on iOS
5. **H-09:** Fix ESLint configuration — entire lint pipeline is broken
