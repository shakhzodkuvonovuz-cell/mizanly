# CLAUDE.md — Mizanly Project Guide

## MANDATORY: Read All Memory Files Before Any Task

At the start of every session, read ALL files in `~/.claude/projects/C--dev-mizanly/memory/` (listed in MEMORY.md).

---

## What is Mizanly?
Mizanly (ميزانلي) — a culturally intelligent social platform for the global Muslim community.
Five "spaces" combining Instagram + TikTok + X/Twitter + WhatsApp + YouTube in one app.
Brand: Emerald #0A7B4F + Gold #C8963E | Dark-mode primary | Arabic RTL support

## The Five Spaces
| Space | Arabic | Model | Status |
|-------|--------|-------|--------|
| Saf | الصف | Instagram (feed + stories) | Built |
| Majlis | المجلس | X/Twitter (threads) | Built |
| Risalah | رسالة | WhatsApp (DMs + groups) | Built |
| Bakra | بكرة | TikTok (short video) | Built |
| Minbar | المنبر | YouTube (long video) | Built |

---

## Current State (as of 2026-03-28, session 11)

**Backend:** NestJS 10, ~80 modules, ~950 endpoints, ~200 Prisma models (incl 4 new E2E models). 319 test suites, 5,491 tests + 226 signal/ crypto tests = **5,717 total tests**, 0 TypeScript errors.
**Go E2E Key Server:** `apps/e2e-server/`, 10 endpoints, ~1,000 lines Go. Compiles. Clerk JWT auth, pgx v5 + Neon, Redis rate limiting via Lua scripts.
**Mobile:** React Native Expo SDK 52, 213 screens, 84 components, 28 hooks, 36+ API services. 0 TypeScript errors. Signal Protocol crypto module: 10 files, ~3,500 lines.
**E2E Encryption:** Signal Protocol (X3DH + Double Ratchet + Sender Keys) with XChaCha20-Poly1305. Go key server + TypeScript client crypto. 226 dedicated tests. IN PROGRESS — Phases 1-6 complete, Phases 7-11 remaining.
**Algorithm:** 3-stage ranking (pgvector KNN → weighted scoring → diversity reranking), k-means multi-cluster interest vectors, 15% exploration slots, Islamic boost, cursor-based keyset pagination.
**Payments:** Stripe PaymentIntent wired. Apple IAP not installed.
**Video Editor:** FFmpeg-kit full-gpl, 10 tool tabs, 35 edit state fields, undo/redo.
**CI/CD:** GitHub Actions — 7/7 green (lint-typecheck, build-mobile, test-api, test-api-integration, build-api). E2E server CI pending.

---

## Production Infrastructure

| Service | Provider | Status |
|---------|----------|--------|
| **API** | Railway (Nixpacks) | LIVE at `mizanlyapi-production.up.railway.app` |
| **E2E Key Server** | Railway (Railpack) | Built, not yet deployed |
| **Database** | Neon PostgreSQL 16 | Connected |
| **Cache** | Upstash Redis | Connected |
| **Storage** | Cloudflare R2 | Configured (bucket: mizanly-media) |
| **Video** | Cloudflare Stream | Configured |
| **Auth** | Clerk | Connected (TEST keys) |
| **Payments** | Stripe | Connected (TEST keys) |
| **Email** | Resend | Configured (domain not verified) |
| **Monitoring** | Sentry | Configured |
| **Search** | Meilisearch Cloud (NYC) | Configured, 6 indexes |
| **Domain** | mizanly.app (Namecheap + Cloudflare DNS) | SSL Full (Strict) |

### Environment Variables — ALL 30 SET on Railway
All configured. For launch: switch CLERK + STRIPE keys from test → live.

### Mobile .env
```
EXPO_PUBLIC_API_URL=https://api.mizanly.app/api/v1
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
EXPO_PUBLIC_WS_URL=https://api.mizanly.app
EXPO_PUBLIC_GIPHY_API_KEY=<beta key>
EXPO_PUBLIC_E2E_URL=https://e2e.mizanly.app/api/v1
```

---

## E2E Encryption — Complete Implementation + Audit Roadmap

### What's Built (Session 11 — ALL PHASES COMPLETE)
- **Go E2E Key Server** (`apps/e2e-server/`) — 10 endpoints, ~1,000 lines Go, Clerk JWT, Redis Lua rate limiting, SKIP LOCKED OTP claim, HMAC webhook, security headers
- **Signal Protocol Client** (`apps/mobile/src/services/signal/`) — 17 files, ~6,500 lines TypeScript: X3DH, Double Ratchet, Sender Keys (with skipped keys), chunked media encryption, safety numbers, offline queue, message cache, search index, telemetry, notification handler, e2eApi adapter
- **NestJS Integration** — MESSAGE_SELECT, mutual exclusion validation, edit/forward rejection, delete clears all E2E fields, search excludes encrypted, internal webhook with HMAC, push notification strategy
- **Tests** — 546 signal + 65 NestJS E2E = 611 dedicated E2E tests
- **Security Audit** — 48 findings fixed (5 CRITICAL, 14 HIGH, 18 MEDIUM, 11 LOW)
- **Old Module Deleted** — EncryptionModule removed, encryption.ts is compat stub, encryptionApi.ts deleted, tweetnacl.d.ts deleted

### Architecture Decisions Made
| Decision | Choice | Why |
|----------|--------|-----|
| Protocol | Signal (X3DH + Double Ratchet), NOT custom | Threema invented own → 7 critical vulns |
| Cipher | XChaCha20-Poly1305 (AEAD), NOT AES-CBC+HMAC | Eliminates padding oracle, MAC ordering bugs |
| Primitives | @noble/* (MIT, 6 Cure53 audits) | License-clean, pure JS, battle-tested |
| Key server | Go microservice, NOT NestJS module | Scale-proof: 100K+ req/sec, 10MB RAM, no extraction needed |
| OTP claim | SKIP LOCKED, NOT advisory locks | No contention, no deadlocks at scale |
| Group encryption | Sender Keys with skipped key storage | Out-of-order messages work on unreliable networks |
| Session safety | Clone-before-decrypt | Prevents session corruption on AEAD failure |
| Signing key storage | SecureStore (hardware-backed), NOT MMKV | Device compromise can't forge group messages |
| Push notifications | Generic body for ALL messages | Apple/Google can't identify encryption users |
| Webhook auth | HMAC-SHA256 signature (constant-time verify) | Prevents timing attacks + forgery |

### Current Audit Grade: B+ (Conditional Pass)

### What's Needed for A+++ (Professional Audit Pass)

#### BEFORE claiming "E2E encrypted" publicly:
| # | Item | Why | Effort |
|---|------|-----|--------|
| 1 | **Migrate crypto to react-native-quick-crypto (C++ JSI)** | JS has no constant-time guarantees, no secure memory wiping, GC copies key material. Nation-state attackers can exploit timing side channels. | 1-2 weeks |
| 2 | **Add HMAC authentication to MMKV session state** | AES-CFB-128 has no integrity check. Forensic analyst can tamper with ratchet state undetected. Wrap each value with XChaCha20-Poly1305. | 3-5 days |
| 3 | **Write Go server unit tests** | Zero Go tests. Key server is the trust anchor. | 2-3 days |
| 4 | **Wire conversation screen to signal/ module** | conversation/[id].tsx still uses deprecated encryption.ts stub. Actual E2E isn't active until this is wired. | 3-5 days |
| 5 | **Android push preview: wire scheduleNotificationAsync** | Background handler decrypts but doesn't display. Needs device testing. | 1-2 days |

#### Within 3 months of launch:
| # | Item | Why | Effort |
|---|------|-----|--------|
| 6 | **Implement PQXDH (post-quantum)** | Signal deployed Sept 2023. Harvest-now-decrypt-later is real. Architecture supports it (e2eVersion: 2, supportedVersions). | 2-3 weeks |
| 7 | **Certificate pinning** | Without it, state actor with trusted CA can MITM all API traffic (metadata exposed). | 2-3 days |
| 8 | **iOS Notification Service Extension** | iOS users see "New message" until NSE decrypts previews. Needs Apple Developer ($99) + App Group + native Swift. | 1-2 weeks |
| 9 | **Formal verification (Tamarin/ProVerif)** | Mathematical proof that the Double Ratchet state machine is correct. Signal has this. We don't. | 1-2 months (specialist) |
| 10 | **Cross-platform integration test** | No test that signs with @noble on mobile and verifies with Go crypto/ed25519. | 2-3 days |

#### Within 6 months:
| # | Item | Why | Effort |
|---|------|-----|--------|
| 11 | **Key transparency** | TOFU is weak against first-contact MITM. Append-only Merkle log audited by third party. Signal + WhatsApp have this. | 2-4 weeks |
| 12 | **Sealed sender** | Server sees full metadata (who talks to whom). Sealed sender hides sender identity. | 2-3 weeks |
| 13 | **Streaming media decryption** | 50MB in-memory limit on decrypt path. Need expo-file-system/next FileHandle write for large files. | 1 week |
| 14 | **Multi-device (per-device keys + client fanout)** | Schema ready (deviceId everywhere), sessions keyed by userId:deviceId. Need: device linking UI, per-device bundle fetch, client fanout encryption. | 3-4 weeks |
| 15 | **Key backup (Argon2id)** | Phone loss = all messages lost. Encrypted cloud backup with password-derived key. Stubs exist (exportAllState/importAllState). | 2-3 weeks |
| 16 | **Professional crypto audit ($50-100K)** | Required before claiming "independently audited." Cure53 or smaller firm. | 2-4 weeks (external) |

#### Nice-to-have (post-audit):
| # | Item |
|---|------|
| 17 | Triple Ratchet (SPQR) — Signal's post-quantum ongoing ratchet |
| 18 | Device attestation (Play Integrity / App Attest) — prevent rogue devices |
| 19 | Disappearing message enforcement in NSE |
| 20 | Emergency wipe button (panic delete all crypto keys) |
| 21 | Deniable authentication |
| 22 | Encrypted cloud message backup |

### E2E Documentation
- `docs/plans/2026-03-27-signal-protocol-decision-log.md` — All decisions, research, Telegram truth, risks
- `docs/plans/2026-03-27-multi-device-e2e-plan.md` — Multi-device roadmap (per-device keys)
- `docs/plans/2026-03-27-signal-protocol-deep-audit.md` — 16 critical findings + solutions
- `docs/plans/2026-03-28-scale-extraction-plan.md` — Go/Elixir extraction roadmap
- `~/.claude/plans/tidy-exploring-key.md` — Implementation plan v5 (final)

---

## Session History (details in memory files)

| Session | Date | Key deliverables | Tests |
|---------|------|-----------------|-------|
| 2 | 03-23 | 11 waves, ~220 fixes, 80 agents | 4,706 |
| 3 | 03-24 | Video editor (10 tabs), create-reel, 45 bugs fixed | 4,934 |
| 4 | 03-24 | 10 story stickers, GIPHY SDK, publish fields, 5-tab nav | 5,093 |
| 5 | 03-25 | WebRTC rewrite, carousel, scheduledAt patches, architecture extraction | 5,226 |
| 6 | 03-25 | ARCHITECTURE.md compiled (11K lines, 89 sections) | — |
| 7 | 03-26 | 106 commits, hardening, Meilisearch live, 117 mobile TS errors → 0 | 5,311 |
| 8 | 03-26 | 38-agent deep audit, ~400 findings, integration tests | 5,502 |
| 9 | 03-27 | Integration tests, raw SQL fixes, feed ranking, CI 7/7, Railway deployed | 5,491 |
| 10 | 03-27 | Deep audit ALL categories fixed (A/B/C/D), 35 commits | 5,491 |
| 11 | 03-28 | Signal Protocol E2E encryption: Go key server, 17 TS files, 48 audit findings fixed, old module deleted | 6,059 |

---

## Launch Blockers (External — Cannot Code)

| Item | What's needed | Unblocks |
|------|--------------|---------|
| Apple Developer enrollment | $99/yr | iOS builds |
| App icon + splash screen | Replace 69-byte placeholders | EAS build |
| Clerk production keys | Toggle test → live | Real auth |
| Stripe production keys | Toggle test → live | Real payments |
| Custom domain CNAME | Cloudflare DNS → Railway | api.mizanly.app |
| Resend domain verification | DNS TXT record | Email delivery |
| google-services.json | Firebase project | Android push |
| First EAS build | Needs icon + Apple enrollment | TestFlight |
| 5 language translations | Human translator (ur, bn, fr, id, ms) | Full i18n |

**Priority:** Apple Developer → App icon → Clerk keys → CNAME → EAS build → TestFlight

---

## Scale Extraction Roadmap

Full plan: `docs/plans/2026-03-28-scale-extraction-plan.md`

| Users | What | Language |
|-------|------|---------|
| 0-50K | Ship monolith + Go E2E key server | TypeScript + Go |
| 50K-200K | Extract feed scoring + workers | Go |
| 200K-500K | Extract WebSocket gateway + message routing | Elixir/Phoenix |
| 500K-1M | Deploy LiveKit + Redis Cluster | — |
| 1M+ | Database sharding, read replicas per region | — |

---

## ABSOLUTE RULES — NEVER VIOLATE

1. **NEVER use RN `Modal`** — Always `<BottomSheet>`
2. **NEVER use text emoji for icons** — Always `<Icon name="..." />`
3. **NEVER hardcode border radius >= 6** — Always `radius.*` from theme
4. **NEVER use bare "No items" text** — Always `<EmptyState>`
5. **NEVER change Prisma schema field names** — They are final
6. **NEVER use `@CurrentUser()` without `'id'`** — Always `@CurrentUser('id')`
7. **ALL FlatLists must have `<BrandedRefreshControl>`** — NEVER raw `<RefreshControl>`
8. **NEVER use `any` in new non-test code** — Type everything properly
9. **ActivityIndicator OK in buttons only** — use `<Skeleton>` for content loading
10. **The `$executeRaw` tagged template literals are SAFE** — do NOT replace them
11. **NEVER suppress errors with `@ts-ignore` or `@ts-expect-error`** — fix the actual type
12. **NEVER add `as any` in non-test code** — find the correct type instead
13. **Test files MAY use `as any` for mocks** — this is the only exception
14. **NEVER use Sonnet or Haiku as subagent models** — Opus only
15. **Tests cover the ENTIRE scope, not just fixes**
16. **ALWAYS use `useContextualHaptic`** — NEVER `useHaptic`
17. **ALWAYS use `<BrandedRefreshControl>`** — NEVER raw `<RefreshControl>`
18. **ALWAYS use `<ProgressiveImage>` for content images** — NEVER raw `<Image>` from expo-image
19. **ALWAYS use `formatCount()` for engagement numbers**
20. **ALWAYS use `showToast()` for mutation feedback** — NEVER bare `Alert.alert` for non-destructive feedback
21. **NEVER use `colors.dark.*` in JSX directly** — Always use `tc.*` from `useThemeColors()`
22. **NEVER use `Math.random()` for visual data or crypto** — Use CSPRNG for crypto
23. **NEVER use setTimeout for fake loading**
24. **MANDATORY AUDIT BEFORE EVERY COMMIT** — Grep-verify, line-by-line review, run tests, verify i18n key counts
25. **NEVER use `sed` for i18n key injection** — Use Node JSON parse/write
26. **EVERY new feature needs cleanup on unmount** — useEffect return for Audio, Speech, intervals, sockets
27. **NEVER declare audit findings "acceptable"** — Fix ALL findings regardless of severity
28. **NEVER log key material, session state, or plaintext** — Crypto no-log policy

---

## Architecture
```
mizanly/
├── apps/
│   ├── api/                     # NestJS 10 backend
│   │   ├── src/modules/         # ~80 feature modules
│   │   ├── src/common/          # ClerkAuthGuard, decorators, queue, email
│   │   ├── src/gateways/        # Socket.io /chat namespace
│   │   └── prisma/schema.prisma # ~200 models
│   ├── mobile/                  # React Native Expo SDK 52
│   │   ├── app/
│   │   │   ├── (tabs)/          # saf, majlis, risalah, bakra, minbar
│   │   │   └── (screens)/       # 213 screens
│   │   └── src/
│   │       ├── components/ui/   # 70+ components
│   │       ├── hooks/           # 28 hooks
│   │       ├── services/        # 36+ API services
│   │       ├── services/signal/ # E2E encryption (10 files, 3,500 lines)
│   │       ├── stores/index.ts  # Zustand store
│   │       ├── theme/index.ts   # Design tokens
│   │       └── i18n/            # 8 languages
│   ├── e2e-server/              # Go E2E Key Server (microservice)
│   │   ├── cmd/server/main.go   # HTTP server
│   │   ├── internal/            # handler, store, middleware, model
│   │   └── Dockerfile           # 15MB image
│   └── landing/                 # Landing page (planned)
├── workers/
│   └── exif-stripper/           # Cloudflare Worker (EXIF removal)
└── docs/
    ├── ARCHITECTURE.md           # 11K-line reference
    ├── plans/                    # Signal protocol, extraction, video editor
    └── audit/                    # Deep audit findings
```

## Tech Stack
- **Mobile:** React Native (Expo SDK 52) + TypeScript + Expo Router
- **Backend:** NestJS 10 + Prisma + Neon PostgreSQL
- **E2E Key Server:** Go 1.24 + pgx v5 + Clerk SDK + Redis
- **E2E Crypto:** @noble/curves + @noble/ciphers + @noble/hashes (MIT, Cure53-audited)
- **Auth:** Clerk (email, phone, Apple, Google) + svix webhooks
- **Storage:** Cloudflare R2 (presigned PUT) + Stream (video)
- **Real-time:** Socket.io `/chat` namespace (Clerk JWT auth) → Elixir/Phoenix at 200K users
- **Calls:** LiveKit (Go SFU, open-source) — replaces P2P WebRTC. 1:1 + group + screen share
- **Search:** Meilisearch (fallback: Prisma LIKE) | **Cache:** Upstash Redis
- **Future real-time:** Elixir/Phoenix for WebSocket gateway + message routing + presence (BEAM VM, 2.8M connections/server)
- **Future workers:** Go for feed scoring + background jobs + push fan-out

---

## Design Tokens (`apps/mobile/src/theme/index.ts`)
```ts
colors.emerald = #0A7B4F       colors.gold = #C8963E
colors.dark.bg = #0D1117       colors.dark.bgElevated = #161B22
colors.dark.bgCard = #1C2333   colors.dark.bgSheet = #21283B
colors.dark.surface = #2D3548  colors.dark.border = #30363D
colors.text.primary = #FFF     colors.text.secondary = #8B949E

spacing: xs=4 sm=8 md=12 base=16 lg=20 xl=24 2xl=32
fontSize: xs=11 sm=13 base=15 md=17 lg=20 xl=24
radius: sm=6 md=10 lg=16 full=9999
animation.spring: bouncy(D10 S400) / snappy(D12 S300) / responsive(D15 S150) / gentle(D20 S100)
```

## Component Quick Reference

### Icon — 44 valid names
```tsx
<Icon name={IconName} size={'xs'|'sm'|'md'|'lg'|'xl'|number} color={string} />
// Names: arrow-left, chevron-right/left/down, heart, heart-filled, message-circle,
// bookmark, bookmark-filled, share, repeat, image, camera, video, play, mic, phone,
// search, hash, at-sign, filter, trending-up, user, users, bell, mail, check-circle,
// send, pencil, edit, trash, x, plus, circle-plus, more-horizontal, settings, lock,
// globe, eye, eye-off, flag, volume-x, link, clock, map-pin, smile, paperclip,
// check, check-check, layers, slash, log-out, bar-chart-2, loader
```

### Key Hooks
```tsx
useContextualHaptic()   // 10 semantic haptics
useThemeColors()        // Returns tc.bg, tc.text.primary, tc.emerald, etc.
useStaggeredEntrance(index)  // Stagger fade+slide for list items
useScrollLinkedHeader()      // Elastic header collapse + blur
useAnimatedIcon()            // Icon animations: bounce, shake, pulse, spin
useTranslation()             // Returns { t } for i18n
useNetworkStatus()           // Online/offline detection
useReducedMotion()           // Accessibility: motion preferences
```

### Key Components
```tsx
<Avatar uri={string|null} name={string} size={'xs'|'sm'|'md'|'lg'|'xl'|'2xl'|'3xl'} />
<BottomSheet visible={bool} onClose={fn}><BottomSheetItem label icon onPress /></BottomSheet>
<Skeleton.PostCard /> <Skeleton.Circle size={40} /> <Skeleton.Rect width={120} height={14} />
<EmptyState icon="users" title="..." subtitle="..." actionLabel="..." onAction={fn} />
<ProgressiveImage uri={url} width={w} height={h} borderRadius={r} />
<BrandedRefreshControl refreshing={bool} onRefresh={fn} />
<RichText content={string} />
```

---

## API Patterns
- Base: `/api/v1/` | Auth: `Authorization: Bearer <clerk_jwt>`
- E2E Key Server: separate service at `/api/v1/e2e/` (Go)
- Pagination: `?cursor=<id>` → `{ data: T[], meta: { cursor?, hasMore } }`
- All responses: `{ data: T, success: true, timestamp }` via TransformInterceptor

## Critical Schema Field Names
- ALL models: `userId` (NOT authorId) | `user` relation (NOT `author`)
- Post: `content` (NOT caption) | `postType` | `mediaUrls[]` + `mediaTypes[]`
- Thread: `isChainHead` | replies → `ThreadReply` model
- Conversation: `isGroup: boolean` + `groupName?` — NO `type` or `name`
- Message: `messageType` | `senderId` (optional) | `encryptedContent Bytes?` | `e2eVersion Int?` | `clientMessageId @unique`
- ID strategy: core = `cuid()`, extensions = `uuid()`. New models use `cuid()`.

## Zustand Store
```ts
unreadNotifications / setUnreadNotifications(n)
unreadMessages / setUnreadMessages(n)
safFeedType: 'following'|'foryou'
majlisFeedType: 'foryou'|'following'|'trending'
isCreateSheetOpen / setCreateSheetOpen(bool)
theme: 'dark'|'light'|'system' / setTheme
```

## Development Commands
```bash
cd apps/api && npm run start:dev       # Swagger: http://localhost:3000/docs
cd apps/mobile && npx expo start       # Mobile dev server
cd apps/api && npx prisma db push      # Dev schema sync
cd apps/api && npx prisma studio       # DB browser
cd apps/e2e-server && go run ./cmd/server  # Go E2E key server
cd apps/mobile && npx jest --config src/services/signal/__tests__/jest.config.js  # Signal tests
```

## Font Family Names
```ts
fonts.headingBold = 'PlayfairDisplay_700Bold'
fonts.body = 'DMSans_400Regular'
fonts.bodyMedium = 'DMSans_500Medium'
fonts.bodyBold = 'DMSans_700Bold'
fonts.arabic = 'NotoNaskhArabic_400Regular'
fonts.arabicBold = 'NotoNaskhArabic_700Bold'
```

## i18n
- **Languages:** en, ar, tr, ur, bn, fr, id, ms (8 total)
- **Translation status:** en 100%, tr 89%, ar 77%, ur/bn/fr/id/ms 14-16% (needs human translator)
- **All new screens MUST have i18n keys in ALL 8 language files**

## Create Sheet Options (7 items)
Post | Thread | Story | Reel | Long Video | Go Live | Voice Post

## Settings Sections
Content | Appearance | Privacy | Notifications | Wellbeing | Islamic | Accessibility | Close Friends | AI | Creator | Community | Gamification | Account | About
