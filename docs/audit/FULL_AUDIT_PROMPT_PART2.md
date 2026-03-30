# PROFESSIONAL CODEBASE AUDIT — Part 2 (Unfinished Waves)

> **THIS IS A PROMPT.** Paste into a fresh Claude Code Opus session. It completes the audit that Part 1 left unfinished.

---

## CONTEXT

Part 1 ran 42 of 117 planned agents. Three waves ran properly (1-Security, 2-Data, 3-CrossModule = 38 agents, 624 findings). Four waves were COLLAPSED into single mega-agents instead of the designed agent count. Six waves were entirely SKIPPED.

**This session completes the audit.** It re-runs the collapsed waves at full agent count AND runs all skipped waves.

### What Part 1 covered (DO NOT re-run):
- Wave 1: Backend Security — 16 agents, 260 findings ✓
- Wave 2: Data Integrity — 12 agents, 168 findings ✓
- Wave 3: Cross-Module — 10 agents, 196 findings ✓

### What Part 1 FAKED (collapsed into 1 agent each — MUST re-run):
- Wave 5: Crypto — designed 8 agents, ran 1, found 27 (real count should be 80+)
- Wave 6: Go Services — designed 6 agents, ran 1, found 28 (real count should be 60+)
- Wave 9: Performance — designed 8 agents, ran 1, found 18 (real count should be 50+)
- Wave 10: Infrastructure — designed 5 agents, ran 1, found 24 (real count should be 40+)

### What Part 1 SKIPPED (never ran — MUST run):
- Wave 4: Mobile UX — 20 agents
- Wave 7: Testing Gaps — 14 agents
- Wave 8: i18n & Accessibility — 6 agents
- Wave 11: Architecture & Code Quality — 6 agents
- Wave 12: Components & Hooks — 4 agents
- Wave 13: Prisma Schema — 2 agents

**Total agents this session: 79**

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md`
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read `docs/audit/2026-03-30-full-audit/MASTER_FINDINGS.md` — know what Part 1 found
4. Read this entire prompt before spawning a single agent

---

## ABSOLUTE RULES

### R1: ONE AGENT PER SCOPE. NO CONSOLIDATION. EVER.

**THIS IS THE RULE THAT PART 1 VIOLATED.**

The prompt said 8 crypto agents. The orchestrator spawned 1 agent called "F01-F08" and pretended it covered everything. This is FRAUD. One agent cannot deeply audit 23 signal protocol files — it skims.

**If you consolidate agents, you are failing the audit.**

Each agent in this prompt has a SPECIFIC, SMALL scope (2-5 files). You MUST spawn SEPARATE Agent tool calls for each. If the prompt says 8 agents, you spawn 8 Agent tool calls. Not 1. Not 4. Eight.

**HOW TO VERIFY YOU'RE NOT CHEATING:** Count your Agent tool calls. If a wave says "8 agents" and you made fewer than 8 Agent tool calls, you are cheating. Stop and fix it.

### R2: Minimum Agent Context
Every agent must receive:
1. The preamble (below)
2. Its SPECIFIC file list (not "audit the Go services")
3. The output format template
4. Explicit instruction: "You are auditing ONLY these files. Read every line."

### R3: Parallel Within Waves, Sequential Between Waves
Spawn ALL agents in a wave simultaneously (parallel Agent tool calls in one message). Wait for ALL to return. Verify. Then next wave.

### R4: Verification Between Waves
After each wave: pick 5 random findings, read the cited file:line yourself, confirm they're real. Log results.

### R5: Output Location
Write to `docs/audit/2026-03-30-full-audit-part2/`. One file per agent.

### R6: No Fixes — Read Only
Agents MUST NOT modify any files.

### R7: Opus Only
Never use Sonnet or Haiku. Omit the model parameter entirely.

### R8: Do Not Re-Report Part 1 Findings
Agents must check `docs/audit/2026-03-30-full-audit/MASTER_FINDINGS.md`. If a finding already appears there, skip it (note as "already reported in Part 1"). Only report NEW findings.

---

## AGENT PREAMBLE (include in every agent prompt)

```
You are a professional security/quality auditor. You are NOT a helpful assistant.
Your job is to find problems, not to praise code.

RULES:
1. Read EVERY file in your scope. Not skim — READ. Count the lines to prove it.
2. Return findings in the EXACT table format below. No prose. No summaries.
3. Minimum 3 findings per scope or explain why the code is genuinely clean with evidence.
4. Every finding MUST cite exact file:line. Wrong line numbers = audit failure.
5. DO NOT modify any files. Read only.
6. Check docs/audit/2026-03-30-full-audit/MASTER_FINDINGS.md — do NOT re-report findings already listed there.
7. Check for CROSS-MODULE issues: does this code depend on something external that might be broken?
8. List all files you read with line counts. List files you SKIPPED and why.

OUTPUT FORMAT:
### [AGENT-ID] — [Scope]
**Files audited:** [path (N lines) — READ IN FULL] for each file
**Files skipped:** [list or "None"]

| # | Sev | File:Line | Finding | Impact | Fix Effort |
|---|-----|-----------|---------|--------|------------|

**Severity counts:** C:X H:X M:X L:X I:X
**Total findings:** X
```

---

## WAVE 5 (RE-RUN) — CRYPTO & E2E (8 agents)

Part 1 ran this as 1 agent and found 27 findings. That is superficial for 23 files / ~10K lines of Signal Protocol code.

**Attacker model: NSA TAO / compromised Mizanly server / nation-state MITM.**

**Every agent must check:**
- Timing side-channels (non-constant-time comparisons on secret material)
- Key material on JS heap (immutable strings that can't be zeroed)
- Missing `zeroOut()` calls after key use
- Nonce reuse potential (counter management, IV generation)
- AEAD tag verified BEFORE processing decrypted content
- DH outputs checked for all-zeros / low-order points (small-subgroup)
- Replay attack vectors (missing dedup, counter validation)
- Downgrade paths (falling back to weaker crypto without user consent)
- `Math.random()` anywhere near crypto operations (must use CSPRNG)
- Error messages leaking key material, nonces, session state
- Race conditions in concurrent encrypt/decrypt (shared ratchet state)
- Fallback code paths that bypass native crypto and use weaker JS alternatives

All files in `apps/mobile/src/services/signal/`.

| Agent | Files | What to Focus On |
|-------|-------|-----------------|
| F01 | `crypto.ts`, `types.ts` | Core primitives. Every function. Constant-time comparisons. CSPRNG usage. zeroOut completeness. AEAD correctness. Any `Math.random`. |
| F02 | `native-crypto-adapter.ts` | Fallback paths. Does the JS fallback weaken security? Are all operations delegated to native when available? Missing native ops that fall back to vulnerable JS? |
| F03 | `x3dh.ts` | X3DH protocol compliance. Ephemeral key generation. Signed prekey verification. DH output validation. Key derivation correctness. One-time prekey consumption. |
| F04 | `pqxdh.ts` | Post-quantum hybrid. ML-KEM-768 encapsulation/decapsulation. Hybrid key derivation (classical + PQ). Version negotiation. Downgrade protection. |
| F05 | `double-ratchet.ts`, `session.ts` | Ratchet state management. Clone-before-decrypt. Chain key advancement. Message key derivation. Counter overflow. Skipped message keys (storage, limits, expiry). Out-of-order message handling. State serialization/deserialization correctness. |
| F06 | `sender-keys.ts`, `sealed-sender.ts` | Group encryption. Sender key distribution. Signature verification. Sealed sender envelope — does it ACTUALLY hide the sender from the server? Replay dedup. Key rotation on member changes. |
| F07 | `storage.ts`, `prekeys.ts`, `key-transparency.ts` | Key storage security. SecureStore vs MMKV decisions. AEAD wrapping of stored values. Prekey generation and upload. Key transparency Merkle proof verification. HMAC key names. |
| F08 | `media-crypto.ts`, `streaming-upload.ts`, `offline-queue.ts`, `message-cache.ts`, `search-index.ts`, `multi-device.ts`, `safety-numbers.ts`, `notification-handler.ts`, `e2eApi.ts`, `telemetry.ts`, `index.ts` | Everything else. Media chunk encryption. Upload stream security. Offline queue persistence (are queued messages encrypted at rest?). Search index (does it leak plaintext?). Multi-device key distribution. Safety number computation. Telemetry (does it leak crypto metadata?). |

---

## WAVE 6 (RE-RUN) — GO SERVICES (6 agents)

Part 1 ran this as 1 agent and found 28 findings. Two Go services with ~7K lines total need proper coverage.

**Every agent must check:**
- SQL injection (string concatenation in queries, unparameterized user input)
- Auth bypass (missing `requireAuth` middleware on endpoints that need it)
- Error swallowing (`if err != nil { }` with empty body, or `_ = err`)
- Missing context timeouts on DB queries, Redis calls, HTTP calls, LiveKit SDK calls
- Resource leaks (unclosed `rows`, `resp.Body`, database connections)
- Missing `defer recover()` in goroutines (panic = server crash)
- Race conditions (shared state modified without mutex, concurrent map access)
- SQL correctness (column names match actual DB schema, JOINs correct)
- Input validation (missing length checks, type validation on HTTP request bodies)
- Error response information leakage (stack traces, internal state in error messages)
- Hardcoded secrets or credentials
- Dockerfile security (running as root, unnecessary packages, wrong Go version)
- Graceful shutdown handling (SIGTERM → drain connections → exit)

| Agent | Files | Scope |
|-------|-------|-------|
| G01 | `apps/e2e-server/internal/handler/` — ALL handler files | Every HTTP handler. Auth checks on each endpoint. Input validation. Error responses. Request body parsing. |
| G02 | `apps/e2e-server/internal/store/` — ALL store files | Every SQL query. Parameterization. Column names vs schema. Transaction usage. Connection management. Row scanning correctness. |
| G03 | `apps/e2e-server/internal/middleware/`, `config/`, `model/`, `cmd/server/main.go` | Middleware chain. Config loading. Graceful shutdown. Model definitions. Main setup. |
| G04 | `apps/livekit-server/internal/handler/handler.go` — first half (CreateRoom through Mute) | Room creation auth. Token generation. Leave/kick authorization. Mute authorization. E2EE key generation and distribution. Request validation. |
| G05 | `apps/livekit-server/internal/handler/handler.go` — second half (Egress through HandleWebhook) + `handler_test.go` | Egress/ingress auth. Webhook HMAC verification. History pagination. Session queries. Active call detection. Test coverage analysis — do tests actually test behavior or just HTTP status codes? |
| G06 | `apps/livekit-server/internal/store/`, `config/`, `middleware/`, `model/`, `cmd/server/main.go`, `Dockerfile` | SQL query correctness. Config validation. Request ID middleware. Dockerfile hardening. Graceful shutdown. Health check endpoint. |

---

## WAVE 9 (RE-RUN) — PERFORMANCE (8 agents)

Part 1 ran this as 1 agent and found 18 findings. That's laughable for a 300K LOC app. Performance issues are the #1 user-visible quality metric.

| Agent | Focus | Files to Read | What to Find |
|-------|-------|--------------|-------------|
| J01 | **N+1 Queries** | ALL `.service.ts` files in `apps/api/src/modules/` | Loops containing `prisma.*.findUnique` or `prisma.*.findFirst` (should be `findMany` + `IN`). Nested `include` that pulls entire relation trees. Multiple sequential queries that could be one `Promise.all`. Count: how many DB round-trips per API request? |
| J02 | **Missing Database Indexes** | `apps/api/prisma/schema.prisma` (5,037 lines) + ALL service files with complex `where` clauses | For every `where` clause in services: does an index exist for that column combination? FK columns without `@@index`. Composite queries without composite indexes. `orderBy` columns without indexes. |
| J03 | **React Re-renders** | ALL screen files in `apps/mobile/app/(screens)/` (pick 50 busiest screens — create, discover, feed tabs, conversation) | Inline object/array creation in JSX props (`style={{...}}` on every render). Missing `React.memo` on list item components (PostCard, ThreadCard, ReelItem, ConversationItem, MessageBubble). Missing `useCallback` on functions passed to FlatList `renderItem`. `extraData` causing full list re-render. |
| J04 | **Memory Leaks** | ALL screen files + ALL hooks in `apps/mobile/src/hooks/` | `setInterval`/`setTimeout` without cleanup in `useEffect` return. Socket/keyboard/AppState event listeners without removal. Subscriptions without unsubscribe. Animation listeners without cleanup. Stale closures capturing old state in long-lived callbacks. |
| J05 | **Bundle Size** | `apps/mobile/package.json`, `apps/api/package.json` + import analysis | Packages in dependencies but never imported. Entire library imported when only submodule needed (`import lodash` vs `import get from 'lodash/get'`). Heavy screens that should use `React.lazy`. SVG/image assets that should be optimized. |
| J06 | **Image & Media** | `apps/mobile/src/services/api.ts` (upload functions), ALL screens displaying images/video | Images uploaded without compression/resize. Missing `expo-image` cache config. Full-res images in thumbnails/lists. Videos loaded eagerly instead of on-demand. Missing blurhash on user-uploaded content. No progressive loading (show blur → load full). |
| J07 | **Redis Patterns** | ALL files importing Redis/ioredis/cache across `apps/api/src/` | Missing TTL on cached values (stale forever). Values > 1MB stored in Redis. Hot keys (single key hit by all users). Missing MULTI/pipeline for batch operations. Connection pool sizing. Serialization overhead (JSON.stringify on large objects). |
| J08 | **API Response Size** | ALL `.controller.ts` + `.service.ts` with `include` or response building | Prisma `include` pulling unnecessary relations (full user object when only name needed). List endpoints without pagination. Endpoints returning fields that the client never uses. Missing `select`/`omit` on queries. Response bodies > 100KB. |

---

## WAVE 10 (RE-RUN) — INFRASTRUCTURE (5 agents)

Part 1 ran this as 1 agent and found 24 findings.

| Agent | Focus | Files |
|-------|-------|-------|
| K01 | **CI Pipeline** | `.github/workflows/ci.yml`, all `package.json` files, `tsconfig*.json` | Test coverage: are ALL test types included (unit, integration, Go, mobile)? Lint step present? Type-check step? Build step? Are integration tests against real PostgreSQL? Is LiveKit Go server tested in CI? Code coverage threshold? Caching strategy? |
| K02 | **Environment & Secrets** | `.env*` files, `apps/api/src/app.module.ts` (ConfigModule), ALL files referencing `process.env` or `ConfigService` | Secrets hardcoded in source code. Missing env validation (app starts with empty required vars). `.env` files in git. Production/test key confusion. Env vars referenced but never validated at startup. Missing vars that cause silent failures (not crash, just broken). |
| K03 | **Cron Jobs & Schedulers** | ALL files with `@Cron`, `@Interval`, `SchedulerRegistry` | Overlap prevention (what if job takes longer than interval?). Error handling (does failure crash the server or get swallowed?). Monitoring (failures logged to Sentry?). Idempotency (safe to run twice?). Distributed locks (Redis NX) for multi-instance. List ALL crons with their schedules. |
| K04 | **Queue Processing** | `apps/api/src/common/queue/` — ALL processors + queue service + `with-correlation.ts` | DLQ for permanently failed jobs. Retry config (count, backoff, max attempts). Idempotency (same job processed twice = same result?). Graceful shutdown (finish current job before exit?). Concurrency limits. Job deduplication. Timeout on long-running jobs. |
| K05 | **Docker & Deployment** | ALL `Dockerfile` files, `railway.toml`, `Procfile`, `apps/landing/` | Running as non-root? Multi-stage build (small final image)? Health check endpoint? SIGTERM handling? Unnecessary packages in final image? Go version correct (1.24, not 1.25/1.26 which don't exist)? `.dockerignore` present and comprehensive? |

---

## WAVE 4 (NEW) — MOBILE SCREENS UX (20 agents)

**This wave has NEVER run.** 199 screen files have never been UX-audited.

**Every agent must check for EVERY screen in its scope:**
1. **Loading:** `<Skeleton>` used, NOT `<ActivityIndicator>` for content (buttons OK)
2. **Error:** Error state exists with meaningful message, not blank screen or crash
3. **Empty:** `<EmptyState>` component used, not bare "No items" text
4. **Keyboard:** `KeyboardAvoidingView` on screens with `<TextInput>`
5. **Theme:** `useThemeColors()` → `tc.*`, no `colors.dark.*` in JSX
6. **Haptic:** `useContextualHaptic()`, never `useHaptic()`
7. **Refresh:** `<BrandedRefreshControl>`, never raw `<RefreshControl>`
8. **Images:** `<ProgressiveImage>`, never raw `<Image>` from expo-image for content
9. **Toast:** `showToast()` for mutation feedback, never `Alert.alert` for non-destructive
10. **Cleanup:** Every `useEffect` with subscriptions/timers returns cleanup
11. **a11y:** `accessibilityRole` + `accessibilityLabel` on interactive elements
12. **i18n:** No hardcoded English strings in JSX (all via `t()`)
13. **Navigation:** Type-safe `navigate()`, no `as never` casts
14. **Radius:** `radius.*` from theme, never hardcode `borderRadius >= 6`
15. **Data:** API calls exist for data screens (not hardcoded/mock data)
16. **Offline:** What happens when API call fails? Blank screen? Error? Cached data?

Screens divided alphabetically:

| Agent | Screens |
|-------|---------|
| D01 | `2fa-setup`, `2fa-verify`, `account-settings`, `account-switcher`, `achievements`, `ai-assistant`, `ai-avatar`, `analytics`, `appeal-moderation`, `archive` |
| D02 | `audio-library`, `audio-room`, `banned`, `biometric-lock`, `blocked-keywords`, `blocked`, `bookmark-collections`, `bookmark-folders`, `boost-post`, `branded-content` |
| D03 | `broadcast-channels`, `broadcast/[id]`, `call-history`, `call/[id]`, `camera`, `caption-editor`, `cashout`, `challenges`, `channel/[id]`, `charity-campaign` |
| D04 | `chat-export`, `chat-folder-view`, `chat-folders`, `chat-lock`, `chat-theme-picker`, `chat-wallpaper`, `circles`, `close-friends`, `collab-requests`, `communities` |
| D05 | `community-guidelines`, `community-posts`, `contact-sync`, `content-filter-settings`, `content-settings`, `conversation/[id]`, `conversation-info`, `conversation-media`, `create-broadcast`, `create-carousel` |
| D06 | `create-clip`, `create-event`, `create-group`, `create-playlist`, `create-post`, `create-reel`, `create-story`, `create-thread`, `create-video`, `creator-dashboard` |
| D07 | `creator-storefront`, `cross-post`, `dhikr-challenge-detail`, `dhikr-challenges`, `dhikr-counter`, `disappearing-default`, `disappearing-settings`, `discover`, `disposable-camera`, `dm-note-editor` |
| D08 | `donate`, `downloads`, `drafts`, `dua-collection`, `duet-create`, `edit-channel`, `edit-profile`, `eid-cards`, `enable-tips`, `end-screen-editor` |
| D09 | `event-detail`, `fasting-tracker`, `fatwa-qa`, `flipside`, `follow-requests`, `followers/[id]`, `following/[id]`, `gift-shop`, `go-live`, `green-screen-editor` |
| D10 | `hadith`, `hajj-companion`, `hajj-step`, `halal-finder`, `hashtag/[id]`, `hashtag-explore`, `hifz-tracker`, `image-editor`, `invite-friends`, `islamic-calendar` |
| D11 | `leaderboard`, `link-child-account`, `live/[id]`, `local-boards`, `location-picker`, `maintenance`, `majlis-list/[id]`, `majlis-lists`, `manage-broadcast`, `manage-data` |
| D12 | `marketplace`, `media-settings`, `membership-tiers`, `mentorship`, `morning-briefing`, `mosque-finder`, `muted`, `mutual-followers`, `my-reports`, `names-of-allah` |
| D13 | `nasheed-mode`, `new-conversation`, `notification-tones`, `notifications`, `orders`, `parental-controls`, `photo-music`, `pinned-messages`, `playlist/[id]`, `playlists/[id]` |
| D14 | `post/[id]`, `post-insights`, `prayer-times`, `product/[id]`, `product-detail`, `profile/[id]`, `profile-customization`, `qibla-compass`, `qr-code`, `qr-scanner` |
| D15 | `quiet-mode`, `quran-reading-plan`, `quran-room`, `quran-share`, `ramadan-mode`, `reel/[id]`, `reel-remix`, `reel-templates`, `report`, `reports/[id]` |
| D16 | `restricted`, `revenue`, `safety-center`, `save-to-playlist`, `saved-messages`, `saved`, `schedule-live`, `schedule-post`, `scholar-verification`, `screen-time` |
| D17 | `search-results`, `search`, `send-tip`, `series/[id]`, `series-detail`, `series-discover`, `settings`, `share-profile`, `share-receive`, `sound/[id]` |
| D18 | `starred-messages`, `status-privacy`, `sticker-browser`, `stitch-create`, `storage-management`, `story-viewer`, `streaks`, `surah-browser`, `tafsir-viewer`, `theme-settings` |
| D19 | `thread/[id]`, `trending-audio`, `verify-encryption`, `video/[id]`, `video-editor`, `video-premiere`, `voice-post-create`, `voice-recorder`, `volunteer-board`, `waqf` |
| D20 | `watch-history`, `watch-party`, `whats-new`, `why-showing`, `wind-down`, `xp-history`, `zakat-calculator`, Tab: `saf`, Tab: `bakra`, Tab: `majlis`, Tab: `minbar`, Tab: `risalah`, Tab: `_layout`, Tab: `create` |

---

## WAVE 7 (NEW) — TESTING GAPS (14 agents)

**This wave has NEVER run.** Find every untested code path.

**Every agent must:**
- List every service method and controller endpoint in scope
- For each: does at least one test exist? (search `*.spec.ts`)
- Test quality: meaningful assertions or just `expect(result).toBeDefined()`?
- Error path testing: are failure cases tested?
- Missing edge cases: empty arrays, null values, max-length strings, boundary values
- Test-to-source line ratio: < 0.3 = red flag
- Mock correctness: do mocks match actual Prisma schema?

| Agent | Modules |
|-------|---------|
| T01 | `auth`, `users`, `two-factor`, `devices`, `settings`, `privacy` |
| T02 | `posts`, `bookmarks`, `collabs`, `polls` |
| T03 | `reels`, `reel-templates`, `clips` |
| T04 | `threads`, `majlis-lists`, `communities`, `community`, `community-notes` |
| T05 | `videos`, `video-editor`, `video-replies`, `subtitles`, `thumbnails` |
| T06 | `messages`, `chat-export`, `stickers`, Gateway: `chat.gateway.ts` |
| T07 | `stories`, `story-chains`, `notifications`, `webhooks` |
| T08 | `payments`, `monetization`, `gifts`, `commerce` |
| T09 | `channels`, `channel-posts`, `follows`, `blocks`, `mutes`, `reports`, `moderation` |
| T10 | `search`, `hashtags`, `embeddings`, `recommendations`, `feed`, `promotions` |
| T11 | `islamic`, `mosques`, `halal`, `scholar-qa`, `live`, `audio-rooms`, `broadcast` |
| T12 | `admin`, `waitlist`, Common: `circuit-breaker`, `feature-flags`, `payment-reconciliation`, `counter-reconciliation`, `meilisearch-sync`, `ab-testing` |
| T13 | Queue processors: `ai-tasks`, `analytics`, `media`, `notification`, `search-indexing`, `webhook` |
| T14 | Integration tests: all 11 files in `apps/api/test/`. Do they cover the 8 critical paths? What gaps exist between integration tests and real PostgreSQL behavior? |

---

## WAVE 8 (NEW) — i18n & ACCESSIBILITY (6 agents)

**This wave has NEVER run.**

**Every agent must check:**
- Hardcoded English strings in JSX (not using `t('key')`)
- Missing i18n keys: used in code but absent from language files
- Key count mismatch across `en.json`, `ar.json`, `tr.json`, `ur.json`, `bn.json`, `fr.json`, `id.json`, `ms.json`
- RTL layout: `marginLeft`/`paddingLeft`/`left` → should use `marginStart`/`paddingStart`/`start`
- `textAlign: 'left'` → should respect RTL
- Missing `accessibilityRole` on `TouchableOpacity`, `Pressable`, buttons
- Missing `accessibilityLabel` on `Icon`, `Image`, icon-only buttons
- Screen reader tab order (interactive elements in logical order)
- Semantic accessibility (decorative images marked `accessibilityElementsHidden`)

| Agent | Screens (use Wave 4 groupings) |
|-------|-------------------------------|
| I01 | D01 + D02 scope (20 screens) |
| I02 | D03 + D04 scope (20 screens) |
| I03 | D05 + D06 scope (20 screens) |
| I04 | D07 + D08 + D09 scope (30 screens) |
| I05 | D10 + D11 + D12 scope (30 screens) |
| I06 | D13 through D20 scope (remaining ~80 screens) |

---

## WAVE 11 (NEW) — ARCHITECTURE & CODE QUALITY (6 agents)

**This wave has NEVER run.**

| Agent | Focus | What to Find |
|-------|-------|-------------|
| L01 | **Dead Code** | Exported functions/classes never imported. Files with 0 imports from outside. Modules in AppModule providing nothing used. Services injected but methods never called. Commented-out blocks. TODO/FIXME/HACK > 30 days old. |
| L02 | **Circular Dependencies** | Module A imports Module B AND B imports A (even transitively). `forwardRef()` usage = patch over circular dep. Services that should use events/queues instead of direct injection. |
| L03 | **Pattern Inconsistency** | Same problem solved 3 ways across modules. Pagination: cursor vs offset vs custom. Error responses: 3 formats. Date handling: multiple libraries. Naming: `create` vs `add` vs `new`. |
| L04 | **Error Handling** | Empty `catch {}`. Pointless re-throw `catch(e) { throw e }`. Caught + logged but not re-thrown (silently swallowed). Inconsistent error types. Missing try-catch around external calls (Stripe, Clerk, R2, Meilisearch, LiveKit). |
| L05 | **Type Safety** | `any` in non-test `.ts`/`.tsx` files. `@ts-ignore`/`@ts-expect-error`. `as Type` assertions that bypass checking. `!` non-null assertions where null is possible. Untyped function parameters. `unknown` used lazily instead of proper types. |
| L06 | **Mobile Architecture** | Business logic in screen files (should be hooks/services). State management issues (prop drilling, unnecessary global state). Duplicate API fetching (same endpoint from multiple screens without cache). Navigation listener cleanup. Store structure (flat vs nested). |

---

## WAVE 12 (NEW) — COMPONENTS & HOOKS (4 agents)

**This wave has NEVER run.**

| Agent | Scope | Checklist |
|-------|-------|-----------|
| C01 | **48 UI Components** (`apps/mobile/src/components/ui/*.tsx`) | Props typed (no `any`). Default values sensible. Cleanup on unmount. Theme-aware (`tc.*`). a11y attributes. Edge cases (empty string, null, long text, RTL). Platform-specific code handles iOS AND Android. |
| C02 | **Domain Components** (`apps/mobile/src/components/bakra/`, `saf/`, `majlis/`, `risalah/`, `story/`, `islamic/`, `editor/`) | Same as C01, PLUS: uses correct UI components (ProgressiveImage not Image, Skeleton not ActivityIndicator). List items use `React.memo`. Event handlers memoized with `useCallback`. |
| C03 | **28 Hooks** (`apps/mobile/src/hooks/*.ts`) | Cleanup in return function. No stale closures. Stable references (useCallback/useMemo). Proper error handling. No `any`. Special deep-dive: `useLiveKitCall` (~700 lines), `useScrollLinkedHeader`, `useStaggeredEntrance`, `usePushNotificationHandler`. |
| C04 | **38 Services** (`apps/mobile/src/services/*.ts`, excluding `signal/`) | Error handling on API calls. Proper TypeScript types (not `any` responses). Retry logic where appropriate. Cancellation support. Base `api.ts`: interceptor config, timeout, auth header injection, error transformation. |

---

## WAVE 13 (NEW) — PRISMA SCHEMA DEEP AUDIT (2 agents)

**This wave has NEVER run.** 5,037 lines, ~200 models.

| Agent | Scope | Checklist |
|-------|-------|-----------|
| S01 | `schema.prisma` lines 1-2500 | Every model, every field, every relation. Field types correct (Decimal for money, DateTime for timestamps, not String for either). `@default` values sensible. `@@map` table names follow convention. Enum values complete and actually used in code. Optional fields that should be required (or vice versa). Missing `@updatedAt`. `String` fields that should be enums. Redundant indexes. Missing indexes on FKs. |
| S02 | `schema.prisma` lines 2501-5037 | Same checklist. ALSO: count total models, verify each has a service + controller (or document why not). Cross-reference `@@index` against actual query patterns from Wave 2 findings. Find models with zero service methods (orphaned schema). |

---

## COMPILATION

After ALL waves complete:

1. Collect all agent outputs from `docs/audit/2026-03-30-full-audit-part2/`
2. Deduplicate (same issue found by multiple agents → keep most detailed)
3. Cross-reference against Part 1 `MASTER_FINDINGS.md` — remove any overlap
4. Write `docs/audit/2026-03-30-full-audit-part2/MASTER_FINDINGS_PART2.md`:

```markdown
# Full Codebase Audit Part 2 — [DATE]

## Summary
- Agents deployed: [N] (target: 79)
- Agents that ACTUALLY ran as separate processes: [N] (MUST equal target)
- Consolidated/merged agents: [N] (MUST be 0)
- Total new findings: [N]
- Overlap with Part 1 (removed): [N]

## By Wave
| Wave | Agents Target | Agents Actual | Findings |
|------|--------------|---------------|----------|

## Combined Totals (Part 1 + Part 2)
| Severity | Part 1 | Part 2 | Total |
|----------|--------|--------|-------|

## New Critical Findings (full detail)
## New High Findings (full detail)
## All Findings (table)
```

5. Write combined `COMBINED_ACTIONABLE_FIXES.md` merging Part 1 and Part 2 findings

---

## ESTIMATED WAVE ORDER (optimize for context)

Run in this order to maximize parallelism within context limits:

1. **Wave 5 (Crypto, 8 agents)** + **Wave 6 (Go, 6 agents)** = 14 agents parallel
2. **Wave 9 (Performance, 8 agents)** + **Wave 10 (Infra, 5 agents)** = 13 agents parallel
3. **Wave 4 batch 1 (D01-D10, 10 agents)** = 10 agents parallel
4. **Wave 4 batch 2 (D11-D20, 10 agents)** = 10 agents parallel
5. **Wave 7 batch 1 (T01-T07, 7 agents)** = 7 agents parallel
6. **Wave 7 batch 2 (T08-T14, 7 agents)** = 7 agents parallel
7. **Wave 8 (i18n, 6 agents)** + **Wave 13 (Schema, 2 agents)** = 8 agents parallel
8. **Wave 11 (Architecture, 6 agents)** + **Wave 12 (Components, 4 agents)** = 10 agents parallel

8 execution rounds. ~79 agents total.

**If context runs low:** Do NOT collapse agents. Instead, defer remaining waves and document: "Wave X not run due to context. Run as Part 3." This is honest. Collapsing is fraud.

---

## FINAL INSTRUCTION

You ran 42 of 117 agents last time and called it done. That was 36% coverage. This session runs the remaining 64%.

Count your Agent tool calls. If the total is less than 79, you cheated. If any single Agent call covers more than one agent ID (e.g., "F01-F08" as one call), you cheated.

**79 agents. 79 Agent tool calls. No consolidation. No excuses.**
