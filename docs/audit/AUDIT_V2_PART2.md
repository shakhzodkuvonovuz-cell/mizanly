# PROFESSIONAL CODEBASE AUDIT V2 — Part 2 (7 Waves, 57 Agents)

> **THIS IS A PROMPT.** Paste into a fresh Claude Code Opus session.
> Part 1 covered Waves 1 (Security), 2 (Data), 3 (Cross-Module), 5 (Crypto), 6 (Go), 9 (Performance) = 60 agents, 1,256 findings.
> This session covers the remaining 7 waves.

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md`
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read `docs/audit/v2/PART1_SUMMARY.md` — know what Part 1 found (1,256 findings, 92 criticals)
4. Run these commands to create the output directories:

```bash
mkdir -p docs/audit/v2/wave4
mkdir -p docs/audit/v2/wave7
mkdir -p docs/audit/v2/wave8
mkdir -p docs/audit/v2/wave10
mkdir -p docs/audit/v2/wave11
mkdir -p docs/audit/v2/wave12
mkdir -p docs/audit/v2/wave13
```

5. Read this ENTIRE prompt before spawning a single agent

---

## WHAT PART 1 ALREADY COVERED (DO NOT DUPLICATE)

Part 1 audited backend security, data integrity, cross-module flows, crypto, Go services, and performance. 60 agent files exist in `docs/audit/v2/wave{1,2,3,5,6,9}/`.

**If your agents find something already reported in Part 1, they must SKIP it** with a note: "Already in Part 1 [agent file]". Do NOT pad finding counts with duplicates. Part 2 should produce exclusively NEW findings.

To avoid duplication, agents in this session should:
- NOT re-audit backend `.service.ts` security patterns (Wave 1 covered)
- NOT re-audit Prisma cascade/index issues (Wave 2 covered)
- NOT re-audit cross-module event flows (Wave 3 covered)
- NOT re-audit Signal protocol code (Wave 5 covered)
- NOT re-audit Go handler/store code (Wave 6 covered)
- NOT re-audit N+1/Redis/response-size patterns (Wave 9 covered)

Instead, this session audits what Part 1 NEVER touched: the mobile UI layer, test coverage, i18n/accessibility, infrastructure ops, architectural quality, component/hook internals, and schema field-by-field review.

---

## RULES — SAME AS PART 1, REPRINTED FOR COMPLETENESS

### R1: AGENTS WRITE THEIR OWN FINDINGS TO DISK
Every agent receives a `file_path`. Before returning, the agent MUST use the **Write tool** to write its complete findings to that file. If the agent does not write the file, the findings are LOST.

### R2: ONE AGENT = ONE Agent TOOL CALL. NO CONSOLIDATION.
57 agents in this prompt = 57 Agent tool calls. Not 30. Not 20. Fifty-seven.

**Self-check after each wave:** `ls docs/audit/v2/waveN/ | grep -v VERIFICATION | wc -l` must match the agent count.

### R3: OPUS ONLY
Never set `model: "sonnet"` or `model: "haiku"`. Omit the model parameter.

### R4: PARALLEL WITHIN WAVES, SEQUENTIAL BETWEEN WAVES
All agents in a wave spawn in ONE message. Wait for all to complete. Verify files. Next wave.

Exception: Wave 4 has 20 agents. Split into two batches of 10 if needed for stability. But each batch must be 10 separate Agent tool calls.

### R5: VERIFICATION BETWEEN WAVES
After each wave:
1. `ls docs/audit/v2/waveN/` — count files
2. `wc -l docs/audit/v2/waveN/*.md` — no empty files
3. Read 3 random findings, verify against source
4. Write `docs/audit/v2/waveN/VERIFICATION.md`

### R6: NO FIXES — READ ONLY

### R7: DO NOT RE-REPORT
- Known external blockers (Apple Developer, NCMEC, formal verification)
- Findings already in Part 1 agent files

---

## AGENT PREAMBLE

Every agent prompt MUST start with this. Copy-paste — do not summarize.

```
You are a professional code auditor. Your job is to find problems, not praise code.

## YOUR OUTPUT FILE
You MUST write your complete findings to this file before returning:
**[FILE_PATH]**

Use the Write tool to create this file. If you do not write this file, your findings are LOST FOREVER.
This is not optional. This is the FIRST thing you must do before returning your response.

## FILE FORMAT

---
# [AGENT_ID] — [Scope Description]

**Files audited:**
- `path/to/file.ts` (N lines) — READ IN FULL
- `path/to/other.ts` (N lines) — READ IN FULL

**Files in scope but SKIPPED:** [list with reason, or "None"]

## Findings

| # | Sev | File:Line | Finding | Impact | Fix Effort |
|---|-----|-----------|---------|--------|------------|
| 1 | C | path:line | [specific issue] | [what breaks] | [time] |

**Severity counts:** C:X H:X M:X L:X I:X
**Total findings:** N
---

## RULES
1. Read EVERY file in your scope line by line. List each with line count.
2. Minimum 3 findings, or explain with evidence why the code is clean.
3. Every finding MUST cite exact file:line.
4. DO NOT modify any source files. Write ONLY to your output file.
5. DO NOT report findings already covered in docs/audit/v2/wave{1,2,3,5,6,9}/ — skim those files first if your scope overlaps.
6. Severity: C=crash/security/money/data-loss, H=auth/broken-feature, M=error-handling/perf/incomplete, L=smell/pattern/minor, I=suggestion/dead-code.

## YOUR SCOPE
[SCOPE_SECTION]
```

---

## WAVE 4 — MOBILE SCREENS UX (20 agents)

This is the largest wave. 199 screen files have never been UX-audited. Split into two batches of 10 for stability.

**What EVERY agent checks for EVERY screen in its scope:**

1. **Loading state:** `<Skeleton>` for content loading, NOT `<ActivityIndicator>` (buttons OK)
2. **Error state:** Error handling exists — screen doesn't go blank or crash on API failure
3. **Empty state:** `<EmptyState>` component used, not bare "No items" text or nothing at all
4. **Keyboard:** `KeyboardAvoidingView` wraps screens with `<TextInput>` — especially chat, search, create flows
5. **Theme:** `useThemeColors()` → `tc.*` in JSX. No `colors.dark.*` or hardcoded hex in `StyleSheet.create`. Light mode must work.
6. **Haptic:** `useContextualHaptic()` on interactive elements, never bare `useHaptic()` or no haptics at all
7. **Refresh:** `<BrandedRefreshControl>` on scrollable data screens, never raw `<RefreshControl>`
8. **Images:** `<ProgressiveImage>` for user content, never raw `<Image>` from expo-image
9. **Toast:** `showToast()` for mutation feedback (save, delete, follow), never `Alert.alert` for non-destructive actions
10. **Cleanup:** Every `useEffect` that starts subscriptions, timers, listeners, or intervals MUST return a cleanup function
11. **a11y:** `accessibilityRole` on buttons/links/inputs. `accessibilityLabel` on icons and image-only buttons. No decorative elements announced to screen readers.
12. **i18n:** Zero hardcoded English strings in JSX render. ALL user-facing text through `t('namespace.key')`. Check that the namespace exists in `apps/mobile/src/i18n/en.json`.
13. **Navigation:** Type-safe `navigate()`, no `as never` casts. Deep link params typed.
14. **Radius:** `radius.*` from theme constants, never hardcoded `borderRadius` values >= 6
15. **Data:** Data screens call real API endpoints — no hardcoded arrays, no `Math.random()`, no `setTimeout` fake loading
16. **Offline:** What happens when the API call fails? Does the user see an error, a cached version, or a blank screen?
17. **RTL:** Layout uses `marginStart`/`paddingStart`/`start` instead of `marginLeft`/`paddingLeft`/`left` for RTL language support (Arabic, Urdu)
18. **Functional:** Interactive elements (buttons, toggles, swipes) actually DO something — no dead `onPress`, no `console.log` handlers, no "Coming Soon" facades

All screens are in `apps/mobile/app/(screens)/` and `apps/mobile/app/(tabs)/`.

### Batch 1 (10 agents — spawn all at once)

| Agent | File Path | Screens |
|-------|-----------|---------|
| D01 | `docs/audit/v2/wave4/D01.md` | `2fa-setup`, `2fa-verify`, `account-settings`, `account-switcher`, `achievements`, `ai-assistant`, `ai-avatar`, `analytics`, `appeal-moderation`, `archive` |
| D02 | `docs/audit/v2/wave4/D02.md` | `audio-library`, `audio-room`, `banned`, `biometric-lock`, `blocked-keywords`, `blocked`, `bookmark-collections`, `bookmark-folders`, `boost-post`, `branded-content` |
| D03 | `docs/audit/v2/wave4/D03.md` | `broadcast-channels`, `broadcast/[id]`, `call-history`, `call/[id]`, `camera`, `caption-editor`, `cashout`, `challenges`, `channel/[id]`, `charity-campaign` |
| D04 | `docs/audit/v2/wave4/D04.md` | `chat-export`, `chat-folder-view`, `chat-folders`, `chat-lock`, `chat-theme-picker`, `chat-wallpaper`, `circles`, `close-friends`, `collab-requests`, `communities` |
| D05 | `docs/audit/v2/wave4/D05.md` | `community-guidelines`, `community-posts`, `contact-sync`, `content-filter-settings`, `content-settings`, `conversation/[id]`, `conversation-info`, `conversation-media`, `create-broadcast`, `create-carousel` |
| D06 | `docs/audit/v2/wave4/D06.md` | `create-clip`, `create-event`, `create-group`, `create-playlist`, `create-post`, `create-reel`, `create-story`, `create-thread`, `create-video`, `creator-dashboard` |
| D07 | `docs/audit/v2/wave4/D07.md` | `creator-storefront`, `cross-post`, `dhikr-challenge-detail`, `dhikr-challenges`, `dhikr-counter`, `disappearing-default`, `disappearing-settings`, `discover`, `disposable-camera`, `dm-note-editor` |
| D08 | `docs/audit/v2/wave4/D08.md` | `donate`, `downloads`, `drafts`, `dua-collection`, `duet-create`, `edit-channel`, `edit-profile`, `eid-cards`, `enable-tips`, `end-screen-editor` |
| D09 | `docs/audit/v2/wave4/D09.md` | `event-detail`, `fasting-tracker`, `fatwa-qa`, `flipside`, `follow-requests`, `followers/[id]`, `following/[id]`, `gift-shop`, `go-live`, `green-screen-editor` |
| D10 | `docs/audit/v2/wave4/D10.md` | `hadith`, `hajj-companion`, `hajj-step`, `halal-finder`, `hashtag/[id]`, `hashtag-explore`, `hifz-tracker`, `image-editor`, `invite-friends`, `islamic-calendar` |

### Batch 2 (10 agents — spawn after Batch 1 files are verified)

| Agent | File Path | Screens |
|-------|-----------|---------|
| D11 | `docs/audit/v2/wave4/D11.md` | `leaderboard`, `link-child-account`, `live/[id]`, `local-boards`, `location-picker`, `maintenance`, `majlis-list/[id]`, `majlis-lists`, `manage-broadcast`, `manage-data` |
| D12 | `docs/audit/v2/wave4/D12.md` | `marketplace`, `media-settings`, `membership-tiers`, `mentorship`, `morning-briefing`, `mosque-finder`, `muted`, `mutual-followers`, `my-reports`, `names-of-allah` |
| D13 | `docs/audit/v2/wave4/D13.md` | `nasheed-mode`, `new-conversation`, `notification-tones`, `notifications`, `orders`, `parental-controls`, `photo-music`, `pinned-messages`, `playlist/[id]`, `playlists/[id]` |
| D14 | `docs/audit/v2/wave4/D14.md` | `post/[id]`, `post-insights`, `prayer-times`, `product/[id]`, `product-detail`, `profile/[id]`, `profile-customization`, `qibla-compass`, `qr-code`, `qr-scanner` |
| D15 | `docs/audit/v2/wave4/D15.md` | `quiet-mode`, `quran-reading-plan`, `quran-room`, `quran-share`, `ramadan-mode`, `reel/[id]`, `reel-remix`, `reel-templates`, `report`, `reports/[id]` |
| D16 | `docs/audit/v2/wave4/D16.md` | `restricted`, `revenue`, `safety-center`, `save-to-playlist`, `saved-messages`, `saved`, `schedule-live`, `schedule-post`, `scholar-verification`, `screen-time` |
| D17 | `docs/audit/v2/wave4/D17.md` | `search-results`, `search`, `send-tip`, `series/[id]`, `series-detail`, `series-discover`, `settings`, `share-profile`, `share-receive`, `sound/[id]` |
| D18 | `docs/audit/v2/wave4/D18.md` | `starred-messages`, `status-privacy`, `sticker-browser`, `stitch-create`, `storage-management`, `story-viewer`, `streaks`, `surah-browser`, `tafsir-viewer`, `theme-settings` |
| D19 | `docs/audit/v2/wave4/D19.md` | `thread/[id]`, `trending-audio`, `verify-encryption`, `video/[id]`, `video-editor`, `video-premiere`, `voice-post-create`, `voice-recorder`, `volunteer-board`, `waqf` |
| D20 | `docs/audit/v2/wave4/D20.md` | `watch-history`, `watch-party`, `whats-new`, `why-showing`, `wind-down`, `xp-history`, `zakat-calculator`, Tab: `saf.tsx`, Tab: `bakra.tsx`, Tab: `majlis.tsx`, Tab: `minbar.tsx`, Tab: `risalah.tsx`, Tab: `_layout.tsx`, Tab: `create.tsx` |

---

## WAVE 7 — TESTING GAPS (14 agents)

**This wave finds untested code, not bugs.** Every finding is "this method/endpoint has zero test coverage" or "this test is meaningless."

**What EVERY agent checks:**
- List EVERY public method in each service and EVERY endpoint in each controller
- For each: search `*.spec.ts` files — does at least one test call this method?
- If tested: is the assertion meaningful (`expect(result.id).toBe(...)`) or tautological (`expect(result).toBeDefined()`)?
- Error paths: are failure cases tested? (invalid input, unauthorized access, not-found, race conditions)
- Edge cases: empty arrays, null values, max-length strings, boundary values, concurrent requests
- Mock correctness: does the mock match the actual Prisma schema? (e.g., mock returns `{ id, name }` but real query returns `{ id, name, createdAt, updatedAt }`)
- Test-to-source line ratio: < 0.3 means the module is dangerously undertested
- Find the spec file: `apps/api/src/modules/<module>/<module>.service.spec.ts` or `<module>.controller.spec.ts`

| Agent | File Path | Modules |
|-------|-----------|---------|
| T01 | `docs/audit/v2/wave7/T01.md` | `auth`, `users`, `two-factor`, `devices`, `settings`, `privacy` |
| T02 | `docs/audit/v2/wave7/T02.md` | `posts`, `bookmarks`, `collabs`, `polls` |
| T03 | `docs/audit/v2/wave7/T03.md` | `reels`, `reel-templates`, `clips` |
| T04 | `docs/audit/v2/wave7/T04.md` | `threads`, `majlis-lists`, `communities`, `community`, `community-notes` |
| T05 | `docs/audit/v2/wave7/T05.md` | `videos`, `video-editor`, `video-replies`, `subtitles`, `thumbnails` |
| T06 | `docs/audit/v2/wave7/T06.md` | `messages`, `chat-export`, `stickers`, Gateway: `chat.gateway.ts` |
| T07 | `docs/audit/v2/wave7/T07.md` | `stories`, `story-chains`, `notifications`, `webhooks` |
| T08 | `docs/audit/v2/wave7/T08.md` | `payments`, `monetization`, `gifts`, `commerce` |
| T09 | `docs/audit/v2/wave7/T09.md` | `channels`, `channel-posts`, `follows`, `blocks`, `mutes`, `reports`, `moderation` |
| T10 | `docs/audit/v2/wave7/T10.md` | `search`, `hashtags`, `embeddings`, `recommendations`, `feed`, `promotions` |
| T11 | `docs/audit/v2/wave7/T11.md` | `islamic`, `mosques`, `halal`, `scholar-qa`, `live`, `audio-rooms`, `broadcast` |
| T12 | `docs/audit/v2/wave7/T12.md` | `admin`, `waitlist`. Common services: `circuit-breaker`, `feature-flags`, `payment-reconciliation`, `counter-reconciliation`, `meilisearch-sync`, `ab-testing`, `analytics`, `email`, `publish-workflow`, `query-diagnostics`, `search-reconciliation` |
| T13 | `docs/audit/v2/wave7/T13.md` | Queue processors: `ai-tasks.processor`, `analytics.processor`, `media.processor`, `notification.processor`, `search-indexing.processor`, `webhook.processor`. Also: `queue.service`, `with-correlation` |
| T14 | `docs/audit/v2/wave7/T14.md` | Integration tests: all 11 files in `apps/api/test/`. Do they cover the 8 critical data paths? What real PostgreSQL behaviors are untested? Also: Go test files in `apps/e2e-server/` and `apps/livekit-server/` — coverage gaps in handler tests? |

---

## WAVE 8 — i18n & ACCESSIBILITY (6 agents)

**What EVERY agent checks:**
- **Hardcoded English:** Any string literal visible to users in JSX that doesn't go through `t('key')`. Includes: button labels, placeholder text, error messages, toast text, accessibility labels, Alert.alert messages.
- **Missing i18n keys:** Key used in code (`t('namespace.key')`) but missing from one or more of the 8 language files: `en.json`, `ar.json`, `tr.json`, `ur.json`, `bn.json`, `fr.json`, `id.json`, `ms.json`
- **Key count mismatch:** One language has fewer keys than English. Run quick check per namespace.
- **RTL layout:** `marginLeft`/`paddingLeft`/`left`/`right`/`textAlign: 'left'` — should use `Start`/`End` equivalents for Arabic (ar) and Urdu (ur). `flexDirection: 'row'` is OK (RN auto-flips).
- **a11y roles:** `TouchableOpacity` and `Pressable` without `accessibilityRole="button"`. `TextInput` without `accessibilityLabel`. Image-only buttons without label.
- **a11y labels:** `<Icon>` components without `accessibilityLabel` (screen reader says nothing). Decorative images should have `accessibilityElementsHidden={true}` or `importantForAccessibility="no"`.
- **Screen reader order:** Interactive elements appear in logical tab order. No important content hidden behind gestures (swipe, long-press) without accessible alternative.

| Agent | File Path | Screens (same grouping as Wave 4, combined) |
|-------|-----------|---------------------------------------------|
| I01 | `docs/audit/v2/wave8/I01.md` | D01 + D02 scope (20 screens): `2fa-setup` through `branded-content` |
| I02 | `docs/audit/v2/wave8/I02.md` | D03 + D04 scope (20 screens): `broadcast-channels` through `communities` |
| I03 | `docs/audit/v2/wave8/I03.md` | D05 + D06 scope (20 screens): `community-guidelines` through `creator-dashboard` |
| I04 | `docs/audit/v2/wave8/I04.md` | D07 + D08 + D09 scope (30 screens): `creator-storefront` through `green-screen-editor` |
| I05 | `docs/audit/v2/wave8/I05.md` | D10 + D11 + D12 scope (30 screens): `hadith` through `names-of-allah` |
| I06 | `docs/audit/v2/wave8/I06.md` | D13 through D20 scope (remaining ~80 screens + all tabs): `nasheed-mode` through `zakat-calculator` + all tab files |

---

## WAVE 10 — INFRASTRUCTURE (5 agents)

| Agent | File Path | Focus | Files to Read |
|-------|-----------|-------|---------------|
| K01 | `docs/audit/v2/wave10/K01.md` | **CI Pipeline** | `.github/workflows/ci.yml`, all `package.json` scripts, `tsconfig*.json`. Are ALL test types covered (unit, integration, Go e2e-server, Go livekit-server, mobile typecheck, signal tests)? Lint step? Type-check? Build? Coverage threshold? Caching? Flaky test handling? |
| K02 | `docs/audit/v2/wave10/K02.md` | **Environment & Secrets** | ALL `.env*` files, `apps/api/src/app.module.ts` (ConfigModule), ALL `process.env` and `ConfigService` references. Secrets hardcoded in source? Missing env validation at startup? `.env` committed to git? Production vs test key confusion? Env vars referenced but never validated? |
| K03 | `docs/audit/v2/wave10/K03.md` | **Cron Jobs & Schedulers** | ALL files with `@Cron()`, `@Interval()`, `SchedulerRegistry`. Overlap prevention? Error handling (crash or swallow)? Sentry logging on failure? Idempotency? Distributed locks (Redis NX) for multi-instance? List ALL crons with schedules. |
| K04 | `docs/audit/v2/wave10/K04.md` | **Queue Processing** | `apps/api/src/common/queue/` — ALL files. DLQ for failed jobs? Retry config? Idempotency? Graceful shutdown? Concurrency limits? Job dedup? Timeout on long jobs? Which processors are DEAD (built but never called)? |
| K05 | `docs/audit/v2/wave10/K05.md` | **Docker & Deployment** | ALL Dockerfiles, `railway.toml`, `Procfile`, build configs. Non-root user? Multi-stage build? Health check? SIGTERM handling? `.dockerignore`? Go version correct (1.24 not 1.25/1.26)? `prisma db push --accept-data-loss` in production? |

---

## WAVE 11 — ARCHITECTURE & CODE QUALITY (6 agents)

| Agent | File Path | Focus | What to Find |
|-------|-----------|-------|-------------|
| L01 | `docs/audit/v2/wave11/L01.md` | **Dead Code** | Exported functions never imported elsewhere. Files with 0 external imports. Modules in AppModule providing nothing used. Services injected but never called. Commented-out blocks > 5 lines. TODO/FIXME/HACK comments. Unused npm dependencies. |
| L02 | `docs/audit/v2/wave11/L02.md` | **Circular Dependencies** | Module A imports B AND B imports A (even transitively). `forwardRef()` usage = patched circular dep. Services using direct injection where events/queues would decouple. `import` chains that form cycles. |
| L03 | `docs/audit/v2/wave11/L03.md` | **Pattern Inconsistency** | Same problem solved 3+ ways across modules. Pagination: cursor vs offset vs custom. Error format: 3+ shapes. Date handling: multiple libraries. Naming: `create` vs `add` vs `new` vs `register`. Response wrapping inconsistency. |
| L04 | `docs/audit/v2/wave11/L04.md` | **Error Handling** | Empty `catch {}`. Pointless re-throw `catch(e) { throw e }`. Caught + logged but not re-thrown (swallowed). Inconsistent error types. Missing try-catch around Stripe/Clerk/R2/Meilisearch/LiveKit calls. Unhandled Promise rejections. |
| L05 | `docs/audit/v2/wave11/L05.md` | **Type Safety** | `any` in non-test `.ts`/`.tsx`. `@ts-ignore`/`@ts-expect-error`. `as Type` assertions bypassing checks. `!` non-null assertions where null possible. Untyped function params. `unknown` used lazily. Generic `Record<string, any>`. |
| L06 | `docs/audit/v2/wave11/L06.md` | **Mobile Architecture** | Business logic in screen files (should be hooks/services). State management issues (prop drilling, unnecessary globals). Duplicate API fetching (same endpoint called from multiple screens without cache). Navigation listener cleanup. Store structure. God components (> 1,000 lines). |

---

## WAVE 12 — COMPONENTS & HOOKS (4 agents)

| Agent | File Path | Scope | Checklist |
|-------|-----------|-------|-----------|
| C01 | `docs/audit/v2/wave12/C01.md` | **48 UI Components** (`apps/mobile/src/components/ui/*.tsx`) | Props typed (no `any`). Default values sensible. Cleanup on unmount. Theme-aware (`tc.*` not raw colors). a11y attributes. Edge cases (empty string, null, very long text, RTL). Platform-specific code handles iOS AND Android. `React.memo` where appropriate. |
| C02 | `docs/audit/v2/wave12/C02.md` | **Domain Components** (`apps/mobile/src/components/bakra/`, `saf/`, `majlis/`, `risalah/`, `story/`, `islamic/`, `editor/`, `web/`) + standalone components (`AlgorithmCard`, `ContactMessage`, `ErrorBoundary`, `GiftOverlay`, `LocationMessage`, `PinnedMessageBar`, `ReminderButton`, `VideoReplySheet`, `ViewOnceMedia`) | Same as C01, PLUS: uses correct project UI components (ProgressiveImage not Image, Skeleton not ActivityIndicator). List items wrapped in `React.memo`. Event handlers use `useCallback`. |
| C03 | `docs/audit/v2/wave12/C03.md` | **28 Hooks** (`apps/mobile/src/hooks/*.ts`) | Cleanup in return function. No stale closures. Stable references via useCallback/useMemo. Error handling. No `any`. Deep audit: `useLiveKitCall` (~700 lines), `useScrollLinkedHeader`, `useStaggeredEntrance`, `usePushNotificationHandler`, `usePushNotifications`, `useContextualHaptic`. |
| C04 | `docs/audit/v2/wave12/C04.md` | **38 Services** (`apps/mobile/src/services/*.ts`, excluding `signal/` directory) | Error handling on API calls. TypeScript types (not `any` responses). Retry logic. Cancellation support. Base `api.ts`: interceptors, timeout, auth header, error transform. Dead services (exported but never imported). Service-to-backend endpoint matching (covered partly by X10, but focus here on SERVICE quality not endpoint existence). |

---

## WAVE 13 — PRISMA SCHEMA DEEP AUDIT (2 agents)

The schema is 5,037 lines with ~200 models. Each agent reads half.

| Agent | File Path | Scope | Checklist |
|-------|-----------|-------|-----------|
| S01 | `docs/audit/v2/wave13/S01.md` | `apps/api/prisma/schema.prisma` lines 1-2500 | Every model, every field, every relation. `Decimal` for money (not Int/Float). `DateTime` for timestamps (not String). `@default` values sensible. `@@map` table names follow convention. Enum values complete and used in code. Optional fields that should be required. Missing `@updatedAt`. `String` fields that should be enums. Redundant indexes (covered by composite). Missing indexes on FK columns. `onDelete` correct for each relation. Plaintext credential storage (passwords, PINs, secrets as plain String). |
| S02 | `docs/audit/v2/wave13/S02.md` | `apps/api/prisma/schema.prisma` lines 2501-5037 | Same checklist as S01. ADDITIONALLY: count models that have NO corresponding service file. Cross-reference `@@index` against query patterns found in Part 1 Wave 2. Find orphaned models (defined but never queried). Find models with zero relations (disconnected from the graph). Verify all enums are actually used by at least one model field. |

---

## EXECUTION ORDER

Run waves in this order, optimizing for context and parallelism:

```
Round 1: Wave 4 Batch 1 (D01-D10) — 10 agents
         → verify 10 files →

Round 2: Wave 4 Batch 2 (D11-D20) — 10 agents
         → verify 10 files →

Round 3: Wave 10 (5 agents) + Wave 13 (2 agents) — 7 agents parallel
         → verify 7 files →

Round 4: Wave 11 (6 agents) + Wave 12 (4 agents) — 10 agents parallel
         → verify 10 files →

Round 5: Wave 7 Batch 1 (T01-T07) — 7 agents
         → verify 7 files →

Round 6: Wave 7 Batch 2 (T08-T14) — 7 agents
         → verify 7 files →

Round 7: Wave 8 (I01-I06) — 6 agents
         → verify 6 files →

TOTAL: 7 rounds, 57 agents, 57 files
```

Wave 4 goes first because it's the largest (20 agents, 199 screens) and produces the most findings. Wave 7 (testing gaps) and Wave 8 (i18n) go last because they're lower severity but still mandatory.

---

## COMPLETION CHECKLIST

After all 7 rounds:

```bash
# Verify all 57 files exist
echo "=== Expected: 57 ==="
find docs/audit/v2/wave{4,7,8,10,11,12,13} -name "*.md" -not -name "VERIFICATION*" | wc -l

# Verify no empty files
find docs/audit/v2/wave{4,7,8,10,11,12,13} -name "*.md" -not -name "VERIFICATION*" -empty

# Verify all 7 verification files exist
ls docs/audit/v2/wave{4,7,8,10,11,12,13}/VERIFICATION.md
```

Then write `docs/audit/v2/PART2_SUMMARY.md` with:
- Total agents: 57
- Total findings per wave
- Severity breakdown by wave
- Top 20 critical findings with file:line
- Systemic patterns
- Per-agent file index (same format as PART1_SUMMARY.md)

And write `docs/audit/v2/COMBINED_SUMMARY.md` merging Part 1 + Part 2:
- Grand total: Part 1 (1,256) + Part 2 (N) = N
- Combined severity breakdown
- Top 30 criticals across both parts
- All systemic patterns unified

---

## EXPECTED FINDINGS (from V1 data)

| Wave | V1 Findings | Expected V2 |
|------|-------------|-------------|
| 4 Mobile UX | 732 | 600-800 |
| 7 Testing | never ran | 150-250 |
| 8 i18n | never ran | 80-150 |
| 10 Infrastructure | 94 | 80-120 |
| 11 Architecture | 122 | 100-150 |
| 12 Components | 69 | 60-100 |
| 13 Schema | 68 | 50-80 |
| **Total** | | **1,120-1,650** |

Combined with Part 1 (1,256): expect **2,376-2,906 total findings**.

If Part 2 total is below 800, agents skimmed. If above 2,000, agents may be inflating.

---

## FINAL INSTRUCTION

57 agents. 57 files on disk. 7 verification logs. No consolidation. No summaries-only. Every finding at file:line, persisted to disk, ready for fix sessions.

**Do NOT stop after Wave 4 and say "we've found enough." Complete all 7 waves.**
**Do NOT consolidate agents. Count your Agent tool calls.**
**Do NOT skip verification. Agents lie. Files prove.**
