# Infrastructure, CI/CD & Deployment Architecture

> Extracted 2026-03-25 from: `.github/workflows/ci.yml`, `railway.json`, `eas.json`, `app.json`, root + app `package.json`, `tsconfig.json`, `metro.config.js`, `babel.config.js`, `jest.config.ts`, `nest-cli.json`, and all `plugins/` config plugins.

---

## 1. Monorepo Structure

### Workspace Layout

```
mizanly/                          # Root — npm workspaces monorepo
├── apps/
│   ├── api/                      # @mizanly/api — NestJS 10 backend
│   └── mobile/                   # @mizanly/mobile — React Native Expo SDK 52
├── packages/                     # Shared packages (workspace target, currently empty)
├── .github/workflows/ci.yml     # GitHub Actions CI pipeline
└── package.json                  # Root workspace config
```

### Root `package.json`

- **Name:** `mizanly`
- **Version:** `0.1.0`
- **Private:** `true`
- **Workspaces:** `["apps/*", "packages/*"]`
- **Node engine:** `>=20.0.0`
- **npm engine:** `>=10.0.0`

**Root scripts (delegating to workspaces):**

| Script | Command | What it does |
|--------|---------|-------------|
| `dev:api` | `npm run start:dev --workspace=apps/api` | Starts NestJS in watch mode |
| `dev:mobile` | `npx expo start --prefix apps/mobile` | Starts Expo dev server |
| `build:api` | `npm run build --workspace=apps/api` | Builds NestJS to dist/ |
| `lint` | `npm run lint --workspaces` | Lints all workspaces |
| `typecheck` | `npm run typecheck --workspace=apps/mobile` | TypeScript check on mobile |
| `prisma:generate` | Delegates to api workspace | Generates Prisma client |
| `prisma:push` | Delegates to api workspace | Dev schema push |
| `prisma:studio` | Delegates to api workspace | Opens Prisma Studio GUI |
| `prisma:seed` | Delegates to api workspace | Seeds dev data |
| `format` | `prettier --write "apps/**/*.{ts,tsx}" "packages/**/*.ts"` | Formats all TS/TSX |
| `format:check` | `prettier --check ...` | CI format check |

**Root dependency overrides (vulnerability fixes):**

| Package | Pinned Version | Reason |
|---------|---------------|--------|
| `react-server-dom-webpack` | `19.1.0` | Compatibility |
| `tar` | `>=6.2.1` | Security vulnerability |
| `fast-xml-parser` | `>=4.4.1` | Security vulnerability |

**Root-level dependencies (hoisted):**

| Package | Version | Why at root |
|---------|---------|-------------|
| `expo-auth-session` | `~6.0.3` | Cross-workspace auth |
| `expo-speech` | `^55.0.9` | TTS for video editor |
| `expo-web-browser` | `~14.0.2` | OAuth browser redirect |
| `resend` | `^6.9.4` | Email service SDK |

---

## 2. API Backend (`apps/api`)

### Package Identity

- **Name:** `@mizanly/api`
- **Version:** `0.1.0`
- **Engine:** Node `>=20.0.0`

### API Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `build` | `nest build` | Compile to `dist/` |
| `start` | `nest start` | Start compiled |
| `start:dev` | `nest start --watch` | Dev mode with hot reload |
| `start:debug` | `nest start --debug --watch` | Debug mode (inspector) |
| `start:prod` | `node dist/main` | Production entry point |
| `lint` | `echo 'TypeScript checked via tsc --noEmit'` | No ESLint TS parser installed — uses tsc |
| `test` | `jest` | Run test suite |
| `test:watch` | `jest --watch` | Watch mode tests |
| `test:e2e` | `jest --config ./test/jest-e2e.json` | E2E tests |
| `prisma:generate` | `prisma generate` | Generate Prisma client |
| `prisma:push:dev` | `prisma db push` | Push schema (dev only) |
| `prisma:migrate` | `prisma migrate dev` | Create migration |
| `prisma:migrate:deploy` | `prisma migrate deploy` | Apply migrations (production) |
| `prisma:migrate:status` | `prisma migrate status` | Check migration status |
| `prisma:studio` | `prisma studio` | Visual DB browser |
| `prisma:seed` | `ts-node prisma/seed.ts` | Seed dev data |

### API Dependencies (34 production, 16 dev)

**Core framework:**

| Package | Version | Role |
|---------|---------|------|
| `@nestjs/common` | `^10.4.0` | NestJS core |
| `@nestjs/core` | `^10.4.0` | NestJS core |
| `@nestjs/platform-express` | `^10.4.0` | Express HTTP adapter |
| `@nestjs/config` | `^3.3.0` | Environment config module |
| `@nestjs/mapped-types` | `^2.0.6` | DTO partial/pick/omit types |
| `@nestjs/swagger` | `^8.1.0` | OpenAPI documentation |
| `@nestjs/schedule` | `^6.1.1` | Cron/interval scheduling |
| `@nestjs/throttler` | `^6.3.0` | Rate limiting |
| `reflect-metadata` | `^0.2.2` | Decorator metadata |
| `rxjs` | `^7.8.1` | Reactive extensions |
| `tsconfig-paths` | `^4.2.0` | Path alias resolution |

**Real-time & messaging:**

| Package | Version | Role |
|---------|---------|------|
| `@nestjs/websockets` | `^10.4.0` | WebSocket support |
| `@nestjs/platform-socket.io` | `^10.4.0` | Socket.io adapter |
| `socket.io` | `^4.8.0` | WebSocket server |
| `bullmq` | `^5.71.0` | Job queue (Redis-backed) |
| `ioredis` | `^5.10.0` | Redis client |

**Auth & security:**

| Package | Version | Role |
|---------|---------|------|
| `@clerk/backend` | `^1.21.0` | Clerk auth SDK |
| `svix` | `^1.45.0` | Webhook verification |
| `helmet` | `^8.1.0` | Security headers |
| `compression` | `^1.7.5` | Response compression |

**Database & ORM:**

| Package | Version | Role |
|---------|---------|------|
| `@prisma/client` | `^6.3.0` | Prisma ORM client |
| `prisma` (dev) | `^6.3.0` | Prisma CLI |

**Storage & media:**

| Package | Version | Role |
|---------|---------|------|
| `@aws-sdk/client-s3` | `^3.700.0` | Cloudflare R2 (S3-compatible) |
| `@aws-sdk/s3-request-presigner` | `^3.700.0` | Presigned upload URLs |
| `sharp` | `^0.33.0` | Image processing |

**Payments:**

| Package | Version | Role |
|---------|---------|------|
| `stripe` | `^20.4.1` | Stripe payments SDK |

**Validation:**

| Package | Version | Role |
|---------|---------|------|
| `class-transformer` | `^0.5.1` | DTO transformation |
| `class-validator` | `^0.14.1` | DTO validation decorators |

**Search & monitoring:**

| Package | Version | Role |
|---------|---------|------|
| `meilisearch` | `^0.46.0` | Full-text search (not yet deployed) |
| `@sentry/nestjs` | `^10.42.0` | Sentry error tracking |
| `@sentry/node` | `^10.42.0` | Sentry Node.js SDK |

**Logging:**

| Package | Version | Role |
|---------|---------|------|
| `nestjs-pino` | `^4.6.0` | Pino logger for NestJS |
| `pino` | `^10.3.1` | Fast JSON logger |
| `pino-http` | `^11.0.0` | HTTP request logging |
| `pino-pretty` (dev) | `^13.1.3` | Pretty-print logs in dev |

**Utilities:**

| Package | Version | Role |
|---------|---------|------|
| `qrcode` | `^1.5.4` | QR code generation (2FA) |
| `uuid` | `^11.0.0` | UUID generation |

**Dev dependencies:**

| Package | Version | Role |
|---------|---------|------|
| `@nestjs/cli` | `^10.4.0` | NestJS CLI (build, generate) |
| `@nestjs/schematics` | `^10.2.0` | NestJS code generators |
| `@nestjs/testing` | `^10.4.0` | Test utilities |
| `jest` | `^29.7.0` | Test runner |
| `ts-jest` | `^29.2.0` | TypeScript Jest transformer |
| `supertest` | `^7.2.2` | HTTP integration testing |
| `typescript` | `^5.7.0` | TypeScript compiler |
| `ts-node` | `^10.9.0` | TypeScript execution |
| `ts-loader` | `^9.5.0` | Webpack TS loader |
| `source-map-support` | `^0.5.21` | Source map support |

### API TypeScript Configuration (`apps/api/tsconfig.json`)

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictBindCallApply": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules", "test", "**/*.spec.ts", "**/*.e2e-spec.ts"]
}
```

**Key settings:**
- **Target:** ES2021 (supports top-level await, Promise.allSettled, etc.)
- **Module:** CommonJS (NestJS standard, not ESM)
- **Decorators:** Both `emitDecoratorMetadata` and `experimentalDecorators` enabled (required by NestJS DI)
- **Strict:** `strictNullChecks`, `noImplicitAny`, `strictBindCallApply` enabled (but not full `strict` mode — `strictPropertyInitialization` is off for DI)
- **Path alias:** `@/*` maps to `src/*`
- **Incremental:** Enabled for faster rebuilds
- **Excludes:** `dist/`, `node_modules/`, `test/`, `*.spec.ts`, `*.e2e-spec.ts`

### NestJS CLI Configuration (`nest-cli.json`)

```json
{
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

- Uses `@nestjs/schematics` for code generation
- Source root: `src/`
- `deleteOutDir: true` — cleans `dist/` before each build (prevents stale artifacts)

### API Jest Configuration (`apps/api/jest.config.ts`)

```ts
{
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': ['ts-jest', { diagnostics: false }] },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
}
```

- **Test pattern:** `*.spec.ts` files
- **Transform:** ts-jest with `diagnostics: false` (faster, skip type-checking in tests)
- **Path alias:** `@/` resolves to `src/`
- **Environment:** Node (not jsdom)
- **Coverage:** Collected from all .ts/.js files in `src/`

---

## 3. Mobile App (`apps/mobile`)

### Package Identity

- **Name:** `@mizanly/mobile`
- **Version:** `0.1.0`
- **Entry:** `expo-router/entry` (file-based routing)

### Mobile Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `start` | `expo start` | Dev server |
| `android` | `expo start --android` | Android dev |
| `ios` | `expo start --ios` | iOS dev |
| `web` | `expo start --web` | Web dev |
| `lint` | `echo '...'` | TypeScript via tsc (no ESLint) |
| `typecheck` | `tsc --noEmit` | Type checking |
| `test` | `jest` | Run tests |
| `test:watch` | `jest --watch` | Watch mode |

### Mobile Dependencies (61 production, 9 dev)

**Expo core:**

| Package | Version | Role |
|---------|---------|------|
| `expo` | `~52.0.0` | Expo SDK 52 |
| `expo-router` | `~4.0.0` | File-based routing |
| `expo-font` | `~13.0.0` | Custom fonts |
| `expo-splash-screen` | `^0.29.24` | Splash screen |
| `expo-status-bar` | `~2.0.0` | Status bar control |
| `expo-linking` | `~7.0.0` | Deep linking |
| `expo-localization` | `^55.0.8` | Device locale |
| `expo-device` | `~7.0.0` | Device info |
| `expo-secure-store` | `~14.0.0` | Encrypted storage |
| `expo-web-browser` | `~14.0.2` | OAuth browser |

**Media & camera:**

| Package | Version | Role |
|---------|---------|------|
| `expo-av` | `~15.0.0` | Audio/video playback + recording |
| `expo-camera` | `~16.0.0` | Camera access |
| `expo-image` | `~2.0.0` | Optimized image display |
| `expo-image-picker` | `~16.0.0` | Photo/video picker |
| `expo-image-manipulator` | `^55.0.11` | Image resize/crop |
| `expo-video-thumbnails` | `~9.0.3` | Video thumbnail extraction |
| `ffmpeg-kit-react-native` | `^6.0.2` | Video editing (full-gpl) |

**UI & animation:**

| Package | Version | Role |
|---------|---------|------|
| `react-native-reanimated` | `~3.16.0` | Layout animations |
| `react-native-gesture-handler` | `~2.20.0` | Touch gestures |
| `expo-blur` | `~14.0.0` | Blur effects |
| `expo-linear-gradient` | `~14.0.0` | Gradient backgrounds |
| `expo-haptics` | `~14.0.0` | Haptic feedback |
| `lucide-react-native` | `^0.468.0` | Icon library |
| `react-native-svg` | `15.8.0` | SVG rendering |
| `react-native-view-shot` | `^4.0.3` | View-to-image capture |
| `react-native-image-viewing` | `^0.2.2` | Full-screen image viewer |
| `react-native-image-colors` | `^2.6.0` | Extract dominant colors |
| `@shopify/flash-list` | `~2.0.0` | High-perf FlatList |

**Navigation:**

| Package | Version | Role |
|---------|---------|------|
| `@react-navigation/native` | `^7.0.0` | Navigation core |
| `@react-navigation/bottom-tabs` | `^7.0.0` | Tab navigator |
| `@react-navigation/native-stack` | `^7.0.0` | Stack navigator |
| `react-native-screens` | `~4.4.0` | Native screen containers |
| `react-native-safe-area-context` | `~4.12.0` | Safe area insets |
| `react-native-shared-element` | `^0.8.9` | Shared element transitions |

**Auth:**

| Package | Version | Role |
|---------|---------|------|
| `@clerk/clerk-expo` | `^2.5.0` | Clerk auth for Expo |

**Data & state:**

| Package | Version | Role |
|---------|---------|------|
| `@tanstack/react-query` | `^5.60.0` | Server state management |
| `zustand` | `^5.0.0` | Client state management |
| `react-native-mmkv` | `^3.2.0` | Fast key-value storage |

**Networking & real-time:**

| Package | Version | Role |
|---------|---------|------|
| `socket.io-client` | `^4.8.0` | WebSocket client |
| `@react-native-community/netinfo` | `11.4.1` | Network status |
| `react-native-webrtc` | `^124.0.7` | WebRTC calls |

**Location & maps:**

| Package | Version | Role |
|---------|---------|------|
| `expo-location` | `^55.1.4` | GPS + geocoding |
| `react-native-maps` | `^1.27.2` | Google/Apple Maps |

**i18n:**

| Package | Version | Role |
|---------|---------|------|
| `i18next` | `^25.8.18` | i18n framework |
| `react-i18next` | `^16.5.8` | React bindings |

**Third-party SDKs:**

| Package | Version | Role |
|---------|---------|------|
| `@giphy/react-native-sdk` | `^5.0.2` | GIF/sticker search |
| `nsfwjs` | `^4.3.0` | Client-side NSFW detection |
| `@tensorflow/tfjs` | `^4.22.0` | TensorFlow.js runtime |
| `@tensorflow/tfjs-react-native` | `^1.0.0` | TF.js RN bridge |

**Fonts:**

| Package | Version | Role |
|---------|---------|------|
| `@expo-google-fonts/dm-sans` | `^0.4.2` | Body font |
| `@expo-google-fonts/playfair-display` | `^0.4.2` | Heading font |
| `@expo-google-fonts/noto-naskh-arabic` | `^0.4.5` | Arabic font |

**Other:**

| Package | Version | Role |
|---------|---------|------|
| `expo-notifications` | `^0.29.14` | Push notifications |
| `expo-clipboard` | `~7.0.0` | Clipboard access |
| `expo-screen-orientation` | `^55.0.9` | Orientation lock |
| `expo-screen-capture` | `^55.0.9` | Screenshot prevention |
| `expo-speech` | `^55.0.9` | Text-to-speech |
| `expo-store-review` | `^55.0.9` | App store rating prompt |
| `react-native-qrcode-svg` | `^6.3.21` | QR code display |
| `date-fns` | `^4.1.0` | Date utilities |
| `react-native-web` | `^0.19.13` | Web platform support |
| `metro` | `^0.83.5` | Bundler (explicit version pin) |
| `@expo/config-plugins` | `^55.0.6` | Config plugin API |
| `@expo/metro-runtime` | `~4.0.0` | Metro runtime for Expo |

**Dev dependencies:**

| Package | Version | Role |
|---------|---------|------|
| `@babel/core` | `^7.26.0` | Babel compiler |
| `@testing-library/react-native` | `^12.4.0` | Component testing |
| `@testing-library/jest-native` | `^5.4.3` | Jest matchers |
| `jest` | `^29.7.0` | Test runner |
| `jest-expo` | `^55.0.10` | Expo Jest preset |
| `react-test-renderer` | `18.3.1` | React test renderer |
| `eslint` | `^9.0.0` | Linter |
| `typescript` | `~5.7.0` | TypeScript compiler |

### Mobile TypeScript Configuration (`apps/mobile/tsconfig.json`)

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "module": "esnext",
    "paths": {
      "@/*": ["./src/*"],
      "@components/*": ["./src/components/*"],
      "@screens/*": ["./src/screens/*"],
      "@hooks/*": ["./src/hooks/*"],
      "@services/*": ["./src/services/*"],
      "@store/*": ["./src/store/*"],
      "@theme/*": ["./src/theme/*"],
      "@utils/*": ["./src/utils/*"],
      "@types/*": ["./src/types/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

**Key settings:**
- **Extends:** `expo/tsconfig.base` (Expo's baseline config)
- **Strict:** Full `strict: true` (stricter than API — includes strictPropertyInitialization)
- **Module:** ESNext (Metro bundles ESM)
- **Path aliases:** 9 aliases covering all major source directories
- **Includes:** All TS/TSX + Expo-generated type definitions

### Babel Configuration (`apps/mobile/babel.config.js`)

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],
  };
};
```

- **Preset:** `babel-preset-expo` (standard Expo transforms)
- **Plugin:** `react-native-reanimated/plugin` (must be last plugin per Reanimated docs — it is the only plugin here)
- **Cache:** `api.cache(true)` — permanent cache (config never changes)

### Metro Configuration (`apps/mobile/metro.config.js`)

```js
const config = getDefaultConfig(projectRoot);

// Watch only specific dirs (NOT entire monorepo root with .worktrees)
config.watchFolders = [
  path.resolve(monorepoRoot, 'packages'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Resolve from both local and root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Block worktrees and API from Metro crawl
config.resolver.blockList = [
  /\.worktrees\/.*/,
  /apps\/api\/.*/,
];

// Add .mjs extension for web ESM packages
config.resolver.sourceExts = [...(config.resolver.sourceExts || []), 'mjs'];

// Resolve browser field first for web platform
config.resolver.resolverMainFields = ['browser', 'main'];
```

**Key decisions:**
- **Monorepo-aware:** Watches `packages/` and root `node_modules/` but NOT all of `../../`
- **Block list:** `.worktrees/` (git worktrees with their own `node_modules`) and `apps/api/` (prevents Metro from crawling backend code)
- **Web support:** `.mjs` extension + `browser` main field resolution
- **Two `node_modules` paths:** Local (mobile-specific) + root (hoisted)

### Mobile Jest Configuration (`apps/mobile/jest.config.ts`)

```ts
{
  preset: 'jest-expo',
  setupFilesAfterEnp: ['./jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@shopify/flash-list|lucide-react-native|zustand)',
  ],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
}
```

- **Preset:** `jest-expo` (configures transforms for RN + Expo modules)
- **Transform ignore:** Complex regex that allows transforming: `react-native`, `@react-native-community/*`, `expo*`, `@expo*`, `@expo-google-fonts/*`, `react-navigation`, `@react-navigation/*`, `@shopify/flash-list`, `lucide-react-native`, `zustand`
- **Path alias:** `@/` resolves to `src/`
- **Coverage:** All `src/**/*.{ts,tsx}`, excluding `.d.ts`

---

## 4. App Configuration (`apps/mobile/app.json`)

### Core Settings

| Field | Value |
|-------|-------|
| **Name** | `Mizanly` |
| **Slug** | `mizanly` |
| **Version** | `0.1.0` |
| **Orientation** | `portrait` |
| **Scheme** | `mizanly` (deep link: `mizanly://`) |
| **UI Style** | `automatic` (follows system dark/light) |
| **JS Engine** | `hermes` |
| **Owner** | `shaxzodbek` |

### Splash Screen

| Field | Value |
|-------|-------|
| **Image** | `./assets/images/splash.png` |
| **Resize Mode** | `contain` |
| **Background** | `#0A7B4F` (brand emerald) |

### iOS Configuration

| Field | Value |
|-------|-------|
| **Supports Tablet** | `true` |
| **Bundle ID** | `app.mizanly.mobile` |
| **Associated Domains** | `applinks:mizanly.com`, `applinks:mizanly.app` |
| **Non-Exempt Encryption** | `false` (no export compliance needed) |

**iOS permissions (Info.plist):**

| Permission | Description |
|------------|-------------|
| `NSCameraUsageDescription` | "Mizanly needs camera access to create posts, stories, and reels" |
| `NSMicrophoneUsageDescription` | "Mizanly needs microphone access for voice notes and video recording" |
| `NSPhotoLibraryUsageDescription` | "Mizanly needs photo library access to share images and videos" |
| `NSLocationWhenInUseUsageDescription` | "Mizanly uses your location for prayer times, qibla direction, and finding nearby mosques." |

### Android Configuration

| Field | Value |
|-------|-------|
| **Package** | `app.mizanly.mobile` |
| **Adaptive Icon Background** | `#0A7B4F` (brand emerald) |
| **Foreground Image** | `./assets/images/adaptive-icon.png` |

**Android permissions:**

| Permission |
|------------|
| `RECORD_AUDIO` |
| `CAMERA` |
| `MODIFY_AUDIO_SETTINGS` |
| `ACCESS_FINE_LOCATION` |
| `ACCESS_COARSE_LOCATION` |

**Android deep link intent filters:**

| Host | Path Prefixes |
|------|--------------|
| `mizanly.com` | `/post`, `/reel`, `/profile`, `/thread` |
| `mizanly.app` | `/post`, `/reel`, `/profile`, `/thread` |

All with `autoVerify: true`, action `VIEW`, categories `BROWSABLE` + `DEFAULT`.

### Web Configuration

| Field | Value |
|-------|-------|
| **Bundler** | `metro` |
| **Output** | `single` (SPA) |
| **Favicon** | `./assets/images/icon.png` |

### Experiments

| Feature | Enabled |
|---------|---------|
| `typedRoutes` | `true` (Expo Router typed routes) |

### EAS Configuration

| Field | Value |
|-------|-------|
| **Project ID** | `d5a4cde9-ecd1-4d17-bfb1-1d84fccd4b89` |
| **Router Origin** | `https://mizanly.app` |

### Registered Plugins (in order)

| # | Plugin | Configuration |
|---|--------|--------------|
| 1 | `expo-router` | `origin: "https://mizanly.app"` |
| 2 | `expo-image-picker` | Default |
| 3 | `expo-camera` | Default |
| 4 | `expo-av` | `microphonePermission: "Allow Mizanly to access your microphone..."` |
| 5 | `expo-notifications` | `icon: icon.png`, `color: #0A7B4F`, no custom sounds |
| 6 | `expo-location` | Custom when-in-use permission string |
| 7 | `expo-splash-screen` | `image: splash.png`, `backgroundColor: #0A7B4F`, `contain` |
| 8 | `expo-font` | Default |
| 9 | `expo-localization` | Default |
| 10 | `expo-secure-store` | Default |
| 11 | `expo-web-browser` | Default |
| 12 | `expo-screen-orientation` | Default |
| 13 | `expo-screen-capture` | Default |
| 14 | `./plugins/ffmpeg-kit/app.plugin` | Custom config plugin (full-gpl variant) |
| 15 | `./plugins/giphy-sdk/app.plugin` | Custom config plugin (Fresco resolution) |

---

## 5. Custom Expo Config Plugins

### 5a. FFmpeg Kit Plugin (`plugins/ffmpeg-kit/app.plugin.js`)

**Purpose:** Configure `ffmpeg-kit-react-native` to use the `full-gpl` variant instead of the default `https` variant. Without this, H.264 encoding via libx264 is unavailable, making video export impossible.

**What `full-gpl` includes:** x264, x265, libass (styled subtitles), fribidi (RTL text), freetype, fontconfig, vidstab (stabilization), zimg (filters).

**Android behavior:**
- Modifies root `build.gradle` via `withProjectBuildGradle`
- Sets `ext.ffmpegKitPackage = "full-gpl"` in the ext block
- The library's own `build.gradle` reads this via `safeExtGet('ffmpegKitPackage', 'https')`
- Skips if `ffmpegKitPackage` already present (idempotent)

**iOS behavior:**
- Uses `withDangerousMod` to modify the Podfile directly
- Injects a `pre_install` hook that monkey-patches `pod.root_spec` for ffmpeg-kit-react-native
- Sets `default_subspec = 'full-gpl'` on the spec
- Inserts before the first `target` declaration in the Podfile
- **Known limitation:** This monkey-patch approach is fragile across CocoaPods versions (documented in CLAUDE.md)

### 5b. GIPHY SDK Plugin (`plugins/giphy-sdk/app.plugin.js`)

**Purpose:** Configure `@giphy/react-native-sdk` native dependencies — resolve Fresco version conflicts on Android, verify iOS deployment target.

**Guard clause:** Checks `require.resolve('@giphy/react-native-sdk')` — if SDK is not installed, the plugin is a no-op. Safe to include in `app.json` before package installation.

**Android behavior:**
- Modifies app-level `build.gradle` via `withAppBuildGradle`
- Forces Fresco 2.5.0 across all configurations (GIPHY needs 2.5.0+, React Native bundles an older version):
  ```groovy
  configurations.all {
    resolutionStrategy.force 'com.facebook.fresco:fresco:2.5.0'
    resolutionStrategy.force 'com.facebook.fresco:animated-gif:2.5.0'
    resolutionStrategy.force 'com.facebook.fresco:animated-webp:2.5.0'
    resolutionStrategy.force 'com.facebook.fresco:webpsupport:2.5.0'
  }
  ```

**iOS behavior:**
- Modifies Podfile via `withPodfile`
- Safety check for iOS 13.0 minimum deployment target
- In practice, Expo SDK 52 already targets iOS 15+ so this is a no-op

### 5c. Share Extension Plugin (`plugins/share-extension/app.plugin.js`)

**Purpose:** Register Mizanly to receive shared content from other apps (text, images, videos) on both platforms.

**Android behavior (`withAndroidManifest`):**
- Adds 4 intent filters to `.MainActivity`:
  1. `SEND` + `text/*` (plain text, URLs)
  2. `SEND` + `image/*` (single image)
  3. `SEND` + `video/*` (single video)
  4. `SEND_MULTIPLE` + `image/*` (multiple photos at once)
- All with `DEFAULT` category

**iOS behavior (`withInfoPlist`):**
- Registers `mizanly://` URL scheme in `CFBundleURLTypes`
- Adds document type handlers for `public.image` and `public.movie` with `LSHandlerRank: 'Alternate'`
- Enables NSAppTransportSecurity (empty dict for defaults)

**Plugin registration:** Uses `createRunOncePlugin` with name `mizanly-share-extension` v1.0.0.

**Note:** This plugin is NOT listed in `app.json` plugins array currently — it must be added manually when share extension is activated.

### 5d. Widgets Plugin (`plugins/widgets/app.plugin.js`)

**Purpose:** Register home-screen widget providers for Prayer Times and Unread Count widgets.

**Two widgets defined:**

| Widget | Android | iOS |
|--------|---------|-----|
| **Prayer Times** | `AppWidgetProvider` receiver `.widgets.PrayerTimesWidget`, resource `@xml/prayer_times_widget_info` | `NSWidgetWantsLocation = true` |
| **Unread Count** | `AppWidgetProvider` receiver `.widgets.UnreadWidget`, resource `@xml/unread_widget_info` | (covered by WidgetKit plist) |

**Android behavior (`withAndroidManifest`):**
- Adds 2 `<receiver>` elements to the manifest `<application>`
- Each has `APPWIDGET_UPDATE` intent filter and `android.appwidget.provider` meta-data
- Both exported (required for widget system)

**iOS behavior (`withInfoPlist`):**
- Sets `NSWidgetWantsLocation = true` (prayer times need GPS)

**Note:** This plugin is NOT listed in `app.json` plugins array currently. Native widget code (XML layouts on Android, SwiftUI WidgetKit on iOS) has not been compiled/tested yet.

---

## 6. EAS Build Profiles (`apps/mobile/eas.json`)

### CLI Requirement

`eas-cli >= 10.0.0`

### Build Profiles

| Profile | Distribution | Client | Platform Notes | API URL |
|---------|-------------|--------|----------------|---------|
| **development** | `internal` | Dev client | iOS simulator only | `http://localhost:3000/api/v1` |
| **preview** | `internal` | Standard | Both platforms | `https://mizanlyapi-production.up.railway.app/api/v1` |
| **production** | App stores | Standard | `autoIncrement: true` | `https://api.mizanly.app/api/v1` |

### Environment Variables per Profile

**development:**
```
EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1
```

**preview:**
```
EXPO_PUBLIC_API_URL=https://mizanlyapi-production.up.railway.app/api/v1
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_YmlnLWRyYWdvbi03LmNsZXJrLmFjY291bnRzLmRldiQ
EXPO_PUBLIC_WS_URL=https://mizanlyapi-production.up.railway.app
```

**production:**
```
EXPO_PUBLIC_API_URL=https://api.mizanly.app/api/v1
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_SET_ME      # NOT YET CONFIGURED
EXPO_PUBLIC_PROJECT_ID=SET_ME                         # NOT YET CONFIGURED
```

### Submit Configuration

**iOS (production):**
- `appleId`: placeholder (`your@apple.id`)
- `ascAppId`: placeholder (`YOUR_APP_STORE_CONNECT_APP_ID`)
- `appleTeamId`: placeholder (`YOUR_APPLE_TEAM_ID`)
- **Status:** Blocked on $99 Apple Developer enrollment

**Android (production):**
- `serviceAccountKeyPath`: `./google-service-account.json`
- `track`: `internal` (Play Store internal testing track)
- **Status:** Service account JSON not yet created

---

## 7. Railway Deployment Configuration

### `apps/api/railway.json`

```json
{
  "build": {
    "builder": "NIXPACKS",
    "installCommand": "npm install --legacy-peer-deps",
    "buildCommand": "npx prisma generate && npx prisma migrate deploy && rm -rf dist && npx nest build && ls dist/main.js"
  },
  "deploy": {
    "startCommand": "node dist/main.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10,
    "healthcheckPath": "/api/v1/health/live"
  }
}
```

### Build Pipeline (Sequential)

| Step | Command | Purpose |
|------|---------|---------|
| 1 | `npm install --legacy-peer-deps` | Install dependencies (legacy-peer-deps for Expo ecosystem compat) |
| 2 | `npx prisma generate` | Generate Prisma client from schema |
| 3 | `npx prisma migrate deploy` | Apply pending migrations to Neon PostgreSQL |
| 4 | `rm -rf dist` | Clean old build artifacts |
| 5 | `npx nest build` | Compile TypeScript to `dist/` |
| 6 | `ls dist/main.js` | Verify build output exists (build verification) |

### Deploy Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| **Start command** | `node dist/main.js` | Direct Node.js execution (no `nest start`) |
| **Restart policy** | `ON_FAILURE` | Auto-restart on crash |
| **Max retries** | `10` | Prevents infinite restart loops |
| **Health check** | `/api/v1/health/live` | Railway pings this to verify deployment |

### Production URL

`https://mizanlyapi-production.up.railway.app`

### Railway Environment Variables (32/34 set)

All configured via Railway dashboard. See CLAUDE.md "Environment Variables" section for full list.

---

## 8. GitHub Actions CI Pipeline

### File: `.github/workflows/ci.yml`

### Triggers

| Event | Branches |
|-------|----------|
| `push` | `main`, `develop` |
| `pull_request` | `main`, `develop` |

### Job Dependency Graph

```
lint-and-typecheck
├── build-mobile (needs lint-and-typecheck)
└── test-api (needs lint-and-typecheck)
    └── build-api (needs test-api)
```

### Job 1: `lint-and-typecheck`

**Runs on:** `ubuntu-latest`
**Services:** None

| Step | Command |
|------|---------|
| Checkout | `actions/checkout@v4` |
| Setup Node | `actions/setup-node@v4` (node 20, npm cache) |
| Install | `npm ci --legacy-peer-deps` |
| Prisma generate | `npx prisma generate --schema=apps/api/prisma/schema.prisma` |
| Lint API | `npm run lint --workspace=apps/api` |
| Lint Mobile | `npm run lint --workspace=apps/mobile` |
| Typecheck API | `npx tsc --noEmit --project apps/api/tsconfig.json` |
| Typecheck Mobile | `npm run typecheck --workspace=apps/mobile` |

**Note:** Both lint scripts are currently `echo` stubs (ESLint TS parser not installed). Real validation comes from `tsc --noEmit`.

### Job 2: `build-mobile`

**Runs on:** `ubuntu-latest`
**Depends on:** `lint-and-typecheck`
**Services:** None

| Step | Command |
|------|---------|
| Checkout | `actions/checkout@v4` |
| Setup Node | `actions/setup-node@v4` (node 20, npm cache) |
| Install | `npm ci --legacy-peer-deps` |
| Export | `npx expo export --platform web` (working-directory: `apps/mobile`) |

**Note:** This builds the web export only (not native iOS/Android). Native builds are done via EAS Build (not in CI).

### Job 3: `test-api`

**Runs on:** `ubuntu-latest`
**Depends on:** `lint-and-typecheck`

**Services:**

| Service | Image | Config |
|---------|-------|--------|
| PostgreSQL | `postgres:16-alpine` | User: `mizanly`, Pass: `mizanly_test`, DB: `mizanly_test`, Port: 5432, Health check: `pg_isready` (10s interval, 5s timeout, 5 retries) |
| Redis | `redis:7-alpine` | Port: 6379, no auth |

**Environment variables:**

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `postgresql://mizanly:mizanly_test@localhost:5432/mizanly_test` |
| `REDIS_URL` | `redis://localhost:6379` |
| `CLERK_SECRET_KEY` | `test_secret` |
| `NODE_ENV` | `test` |

| Step | Command |
|------|---------|
| Checkout | `actions/checkout@v4` |
| Setup Node | `actions/setup-node@v4` (node 20, npm cache) |
| Install | `npm ci --legacy-peer-deps` |
| Prisma generate | `npx prisma generate --schema=apps/api/prisma/schema.prisma` |
| Test | `npm test --workspace=apps/api -- --passWithNoTests` |

**Note:** Tests run against real PostgreSQL 16 and Redis 7 services. `--passWithNoTests` prevents failure if a spec file has no tests. Current suite: 302 test suites, 5,226 tests, 100% pass.

### Job 4: `build-api`

**Runs on:** `ubuntu-latest`
**Depends on:** `test-api`
**Services:** None

| Step | Command |
|------|---------|
| Checkout | `actions/checkout@v4` |
| Setup Node | `actions/setup-node@v4` (node 20, npm cache) |
| Install | `npm ci --legacy-peer-deps` |
| Prisma generate | `npx prisma generate --schema=apps/api/prisma/schema.prisma` |
| Build | `npm run build --workspace=apps/api` |

### CI Status Summary

| Job | Current Status |
|-----|---------------|
| lint-and-typecheck | PASS |
| test-api | PASS (5,226 tests) |
| build-api | PASS |
| build-mobile | Needs `npm install --legacy-peer-deps` (metro version conflict) |

---

## 9. Deployment Architecture Diagram

```
                    ┌─────────────────────┐
                    │   GitHub Actions CI  │
                    │                      │
                    │ lint → test → build  │
                    │    (PostgreSQL 16)   │
                    │    (Redis 7)         │
                    └──────────┬──────────┘
                               │ push to main
                               ▼
                    ┌─────────────────────┐
                    │  Railway (Nixpacks)  │
                    │                      │
                    │ npm install          │
                    │ prisma generate      │
                    │ prisma migrate deploy│
                    │ nest build           │
                    │ node dist/main.js    │
                    │                      │
                    │ Health: /api/v1/     │
                    │   health/live        │
                    │ Restart: ON_FAILURE  │
                    │ Max retries: 10      │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                 ▼
     ┌──────────────┐  ┌────────────┐  ┌──────────────┐
     │ Neon Postgres │  │  Upstash   │  │ Cloudflare   │
     │ (PostgreSQL   │  │  Redis     │  │ R2 + Stream  │
     │  16, pgvector)│  │            │  │              │
     └──────────────┘  └────────────┘  └──────────────┘

     ┌──────────────┐  ┌────────────┐  ┌──────────────┐
     │    Clerk     │  │   Stripe   │  │   Sentry     │
     │  (Auth)      │  │ (Payments) │  │ (Monitoring) │
     └──────────────┘  └────────────┘  └──────────────┘

                    ┌─────────────────────┐
                    │   EAS Build (Expo)   │
                    │                      │
                    │ development (local)  │
                    │ preview (internal)   │
                    │ production (stores)  │
                    └──────────┬──────────┘
                               │
              ┌────────────────┴────────────────┐
              ▼                                  ▼
     ┌──────────────┐                   ┌──────────────┐
     │  App Store   │                   │ Google Play   │
     │  (iOS)       │                   │ (Android)     │
     │  BLOCKED:    │                   │ track:        │
     │  $99 Apple   │                   │ internal      │
     │  Developer   │                   │               │
     └──────────────┘                   └──────────────┘
```

---

## 10. Domain & DNS Architecture

| Layer | Provider | Details |
|-------|----------|---------|
| **Domain** | Namecheap | `mizanly.app` (expires 2027-03-23) |
| **DNS** | Cloudflare (Free) | Nameservers: `macy.ns.cloudflare.com`, `neil.ns.cloudflare.com` |
| **SSL/TLS** | Cloudflare | Full (Strict) |
| **AI Bot Blocking** | Cloudflare | ON (all pages) |
| **Zone ID** | Cloudflare | `a80d909cd5b47fdb4dcba31a66a3283b` |

### Pending DNS Configuration

| Record | Type | Name | Value | Proxy |
|--------|------|------|-------|-------|
| API subdomain | CNAME | `api` | `mizanlyapi-production.up.railway.app` | ON |

Once CNAME is added + Railway custom domain configured:
- `APP_URL` / `API_URL` → `https://api.mizanly.app`
- Mobile `EXPO_PUBLIC_API_URL` → `https://api.mizanly.app/api/v1`
- Mobile `EXPO_PUBLIC_WS_URL` → `https://api.mizanly.app`

---

## 11. Version Matrix Summary

| Technology | Version | Notes |
|------------|---------|-------|
| Node.js | >=20.0.0 | Required by engines field |
| npm | >=10.0.0 | Required by engines field |
| TypeScript | ~5.7.0 | Both apps |
| React | 18.3.1 | Pinned |
| React Native | 0.76.0 | Pinned |
| Expo SDK | 52 | `~52.0.0` |
| NestJS | 10 | `^10.4.0` |
| Prisma | 6.3 | `^6.3.0` |
| PostgreSQL | 16 | CI uses `postgres:16-alpine` |
| Redis | 7 | CI uses `redis:7-alpine` |
| Jest | 29.7.0 | Both apps |
| Socket.io | 4.8.0 | Both client and server |
| Hermes | (bundled) | JS engine for RN |

---

## 12. Known Issues & Gaps

| Issue | Impact | Resolution |
|-------|--------|------------|
| Both lint scripts are `echo` stubs | No ESLint enforcement | Install `@typescript-eslint/parser` + ESLint config |
| `build-mobile` CI job builds web export only | No native build validation in CI | Native builds via EAS Build (separate infrastructure) |
| `metro` pinned at `^0.83.5` in mobile deps | Version conflict with root | Remove explicit metro dep or align versions |
| Production EAS env vars are placeholders | Cannot submit production builds | Set Clerk live key + project ID after Apple enrollment |
| Share extension plugin not in `app.json` | Share sheet won't work | Add when share extension is activated |
| Widgets plugin not in `app.json` | Home widgets won't appear | Add when native widget code is ready |
| No ESLint in either workspace | Only `tsc --noEmit` catches issues | Works but misses style/pattern enforcement |
| `--legacy-peer-deps` everywhere | Masks dependency conflicts | Resolve peer dep conflicts properly post-launch |
| No native build CI (EAS) | Builds only validated manually | Add `eas build` job or use EAS Build's PR preview feature |
| Prisma generate runs 4 times across CI jobs | Wasted time (~15-30s each) | Cache Prisma client in GitHub Actions artifact |
