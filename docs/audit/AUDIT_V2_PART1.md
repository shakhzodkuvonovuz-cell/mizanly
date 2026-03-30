# PROFESSIONAL CODEBASE AUDIT V2 — Part 1 (6 Waves, 60 Agents)

> **THIS IS A PROMPT.** Paste into a fresh Claude Code Opus session.
> Part 2 will cover Waves 4 (Mobile UX), 7 (Testing), 8 (i18n), 10 (Infrastructure), 11 (Architecture), 12 (Components), 13 (Schema).

---

## WHY V2 EXISTS

V1 failed in two ways:
1. **Part 1 consolidated agents** — 4 of 7 waves used 1 mega-agent instead of the designed 5-8 agents. Crypto found 27 issues with 1 agent vs 89 with 8. Performance found 18 vs 184. The orchestrator optimized for efficiency over thoroughness.
2. **Findings never persisted** — Agent return values stayed in the orchestrator's context window and were lost when the session ended. Only summaries were written to disk. ~2,320 findings identified, ~200 specific file:line fixes actually saved.

V2 fixes both: strict anti-consolidation rules + agents write findings directly to files.

---

## STEP 0 — BOOTSTRAP

1. Read `CLAUDE.md`
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Run these commands to create the output directory structure:

```bash
mkdir -p docs/audit/v2/wave1
mkdir -p docs/audit/v2/wave2
mkdir -p docs/audit/v2/wave3
mkdir -p docs/audit/v2/wave5
mkdir -p docs/audit/v2/wave6
mkdir -p docs/audit/v2/wave9
```

4. Read this entire prompt before spawning a single agent

---

## THE RULE THAT MATTERS MOST

### AGENTS WRITE THEIR OWN FINDINGS TO DISK

Every agent receives a `file_path` in its prompt. Before returning, the agent MUST use the **Write tool** to write its complete findings table to that file. The findings are NOT in the agent's return message — they are in the file.

**If the agent does not write the file, the findings are lost.** This is the #1 lesson from V1.

The orchestrator's job after each wave:
1. Verify the files exist: `ls docs/audit/v2/waveN/`
2. Verify each file has content (not empty): `wc -l docs/audit/v2/waveN/*.md`
3. If any file is missing or empty, RE-RUN that agent

---

## ABSOLUTE RULES

### R1: ONE AGENT = ONE Agent TOOL CALL. NO CONSOLIDATION.
If this prompt says 16 agents for Wave 1, you make 16 separate Agent tool calls. Not 8. Not 4. Not 1.

**Self-check after each wave:** Count the files in the wave directory. If Wave 1 says 16 agents and `ls docs/audit/v2/wave1/ | wc -l` returns less than 16, you failed.

### R2: OPUS ONLY
Never set `model: "sonnet"` or `model: "haiku"`. Omit the model parameter.

### R3: PARALLEL WITHIN WAVES, SEQUENTIAL BETWEEN WAVES
Spawn all agents in a wave in a single message (parallel Agent tool calls). Wait for all to return. Verify files written. Then next wave.

### R4: VERIFICATION BETWEEN WAVES
After each wave:
1. `ls docs/audit/v2/waveN/` — count files, must match agent count
2. `wc -l docs/audit/v2/waveN/*.md` — no empty files
3. Read 3 random agent files, pick 1 finding from each, read the cited source file:line, confirm the finding is real
4. Log verification in `docs/audit/v2/waveN/VERIFICATION.md`

### R5: NO FIXES — READ ONLY
Agents MUST NOT modify any source code files. They only READ source files and WRITE to their audit output file.

### R6: DO NOT RE-REPORT KNOWN EXTERNAL BLOCKERS
These are known and accepted — agents must not waste findings on them:
- Apple Developer enrollment not done
- Zero real-device testing
- NCMEC/GIFCT/eSafety registration (legal)
- Formal verification / professional audit not done
- react-native-webrtc removed (replaced by LiveKit)

---

## AGENT PROMPT TEMPLATE

Every agent you spawn MUST receive this EXACT preamble, followed by its scope. Copy-paste it — do not summarize or shorten.

```
You are a professional code auditor. Your job is to find problems, not to praise code.

## YOUR OUTPUT FILE
You MUST write your complete findings to this file before returning:
**[FILE_PATH]**

Use the Write tool to create this file. If you do not write this file, your findings are LOST FOREVER.

## FILE FORMAT — USE THIS EXACTLY

Write the file with this structure:

---
# [AGENT_ID] — [Scope Description]

**Files audited:**
- `path/to/file.ts` (N lines) — READ IN FULL
- `path/to/other.ts` (N lines) — READ IN FULL

**Files in scope but SKIPPED:** [list with reason, or "None"]

## Findings

| # | Sev | File:Line | Finding | Impact | Fix Effort |
|---|-----|-----------|---------|--------|------------|
| 1 | C | apps/api/src/modules/posts/posts.service.ts:142 | [specific issue] | [what breaks] | [time estimate] |
| 2 | H | ... | ... | ... | ... |

**Severity counts:** C:X H:X M:X L:X I:X
**Total findings:** N
---

## RULES
1. Read EVERY file in your scope line by line. Not skim — READ.
2. List every file you read with its line count to prove it.
3. Minimum 3 findings, or explain with evidence why the code is clean.
4. Every finding MUST cite exact file:line. If you cite a wrong line number, the audit fails.
5. DO NOT modify any source files. Read only. Write only to your output file.
6. Check for CROSS-MODULE issues — does this code depend on something that might be broken?
7. Severity must be honest. Don't inflate (everything C) or deflate (everything L).

## SEVERITY DEFINITIONS
- **C (Critical):** Security vulnerability, data loss, crash, money bug, religious data error
- **H (High):** Auth bypass, missing validation, broken feature, data inconsistency
- **M (Medium):** Missing error handling, performance issue, UX regression, incomplete feature
- **L (Low):** Code smell, inconsistent pattern, minor UX gap, missing test coverage
- **I (Info):** Suggestion, dead code, documentation gap

## YOUR SCOPE
[SCOPE_SECTION]
```

---

## WAVE 1 — BACKEND SECURITY (16 agents)

**What EVERY agent checks:**
- `@UseGuards(ClerkAuthGuard)` on every non-public endpoint
- `@CurrentUser('id')` with `'id'`, never bare `@CurrentUser()`
- Every `@Body()` uses a DTO class with class-validator decorators, not inline types
- No `$queryRawUnsafe` or `$executeRawUnsafe` with string concatenation
- Rate limiting (`@Throttle()`) on mutation endpoints
- Responses don't leak passwords, tokens, internal IDs, full user objects
- File upload: MIME type validation, size limits, path traversal protection
- Error messages don't expose stack traces or query internals
- Authorization: users can only access/modify their OWN resources
- Visibility: queries filter isBanned/isDeactivated/isDeleted where needed

| Agent | File Path | Modules |
|-------|-----------|---------|
| A01 | `docs/audit/v2/wave1/A01.md` | `auth`, `users`, `two-factor`, `devices` |
| A02 | `docs/audit/v2/wave1/A02.md` | `posts`, `bookmarks`, `collabs` |
| A03 | `docs/audit/v2/wave1/A03.md` | `reels`, `reel-templates`, `clips` |
| A04 | `docs/audit/v2/wave1/A04.md` | `threads`, `majlis-lists` |
| A05 | `docs/audit/v2/wave1/A05.md` | `videos`, `video-editor`, `video-replies`, `subtitles`, `thumbnails` |
| A06 | `docs/audit/v2/wave1/A06.md` | `messages`, `chat-export`, `stickers` |
| A07 | `docs/audit/v2/wave1/A07.md` | `stories`, `story-chains` |
| A08 | `docs/audit/v2/wave1/A08.md` | `notifications`, `webhooks` |
| A09 | `docs/audit/v2/wave1/A09.md` | `payments`, `monetization`, `gifts`, `commerce` |
| A10 | `docs/audit/v2/wave1/A10.md` | `follows`, `blocks`, `mutes`, `restricts`, `reports`, `moderation` |
| A11 | `docs/audit/v2/wave1/A11.md` | `search`, `hashtags`, `embeddings`, `recommendations` |
| A12 | `docs/audit/v2/wave1/A12.md` | `feed`, `promotions`, `polls` |
| A13 | `docs/audit/v2/wave1/A13.md` | `channels`, `channel-posts`, `communities`, `community`, `community-notes` |
| A14 | `docs/audit/v2/wave1/A14.md` | `islamic`, `mosques`, `halal`, `scholar-qa` |
| A15 | `docs/audit/v2/wave1/A15.md` | `admin`, `waitlist`, `privacy`, `parental-controls`, `settings` |
| A16 | `docs/audit/v2/wave1/A16.md` | `live`, `audio-rooms`, `audio-tracks`, `broadcast`, `stream` |

All modules are in `apps/api/src/modules/`. Read every `.controller.ts`, `.service.ts`, `.module.ts`, and files in `dto/` for each module.

---

## WAVE 2 — DATA INTEGRITY (12 agents)

**What EVERY agent checks:**
- Read `apps/api/prisma/schema.prisma` for models in scope (5,037 lines — use offset/limit to read relevant sections)
- Foreign keys have correct `onDelete` (financial = SetNull, content = Cascade or SetNull)
- Financial fields use `Decimal`, not `Int` or `Float`
- `@@unique` constraints where business logic requires uniqueness
- Missing `@@index` on frequently queried foreign keys
- All public queries filter: `isRemoved`, `isBanned`, `isDeactivated`, `isDeleted`
- All public queries handle `scheduledAt` (null OR <= now)
- Counter ops use `GREATEST(0, ...)` to prevent negatives
- Multi-step operations that must be atomic use `$transaction`
- Raw SQL uses `@@map` table names, not Prisma model names

| Agent | File Path | Models + Services |
|-------|-----------|-------------------|
| B01 | `docs/audit/v2/wave2/B01.md` | `User`, `UserSettings`, `UserProfile`, `Follow`, `Block`, `Mute`, `Restrict`, `Device` |
| B02 | `docs/audit/v2/wave2/B02.md` | `Post`, `PostComment`, `PostReaction`, `PostBookmark`, `PostTaggedUser`, `PostView` |
| B03 | `docs/audit/v2/wave2/B03.md` | `Reel`, `ReelComment`, `ReelReaction`, `ReelBookmark`, `ReelView` |
| B04 | `docs/audit/v2/wave2/B04.md` | `Thread`, `ThreadComment`, `ThreadReaction`, `MajlisList` |
| B05 | `docs/audit/v2/wave2/B05.md` | `Video`, `VideoComment`, `VideoReaction`, `VideoBookmark`, `VideoView`, `VideoReply` |
| B06 | `docs/audit/v2/wave2/B06.md` | `Conversation`, `Message`, `MessageReaction`, `MessageMedia`, `ConversationParticipant` |
| B07 | `docs/audit/v2/wave2/B07.md` | `Story`, `StoryReaction`, `StoryHighlight`, `StoryChain` |
| B08 | `docs/audit/v2/wave2/B08.md` | `CoinBalance`, `CoinTransaction`, `Gift`, `Cashout`, `Donation`, `PaymentMapping`, `ProcessedWebhookEvent` |
| B09 | `docs/audit/v2/wave2/B09.md` | `Channel`, `ChannelPost`, `ChannelSubscription`, `Community`, `CommunityNote` |
| B10 | `docs/audit/v2/wave2/B10.md` | `Notification`, `PushToken`, `NotificationSetting`, `FailedJob` |
| B11 | `docs/audit/v2/wave2/B11.md` | `Report`, `ModerationAction`, `BannedHash`, `FlaggedContent`, `Appeal` |
| B12 | `docs/audit/v2/wave2/B12.md` | `CallSession`, `CallParticipant`, `WaitlistEntry`, `FeatureFlag`, `Event`, `Poll` |

For each model: read the schema definition AND the service that queries it. Cross-reference query patterns against indexes.

---

## WAVE 3 — CROSS-MODULE CONNECTIVITY (10 agents)

**The hardest wave. These agents find bugs that single-module agents CANNOT find.**

Each agent traces a COMPLETE data flow end-to-end and finds: broken event chains, orphaned listeners, type mismatches across boundaries, event name mismatches between server and mobile, services calling other services with wrong assumptions, dead pipelines.

| Agent | File Path | Integration Domain | What to Trace |
|-------|-----------|-------------------|---------------|
| X01 | `docs/audit/v2/wave3/X01.md` | **Post Lifecycle** | Create → moderation → publish → feed index → Meilisearch sync → notification → push → socket → mobile refresh. Does tagging trigger notification? Does comment-control propagate? Does edit re-trigger moderation? Does delete clean feed + search + bookmarks + notifications? |
| X02 | `docs/audit/v2/wave3/X02.md` | **Message & E2E** | Send → Signal encrypt → socket emit → gateway → DB persist (8 E2E fields) → push (generic body) → recipient socket → decrypt → display. Do all E2E fields persist? Does forward reject encrypted? Does edit reject encrypted? Does search exclude encrypted? Does sealed sender hide sender in socket metadata? |
| X03 | `docs/audit/v2/wave3/X03.md` | **Payment & Commerce** | Stripe checkout → webhook → dedup → coin credit → transaction record → gift purchase → recipient balance → cashout → transfer. Is every payment atomic? Do webhook retries dedup? Does dual CoinBalance system sync? Do SetNull cascades preserve records? |
| X04 | `docs/audit/v2/wave3/X04.md` | **User Lifecycle** | Register (Clerk webhook) → onboarding → interact → ban (hide content) → unban (restore) → deactivate → delete (GDPR: anonymize, soft-delete, SetNull financials). Does deletion hit ALL models? Does ban propagate to ALL queries? Does Clerk webhook update local DB? |
| X05 | `docs/audit/v2/wave3/X05.md` | **Notification Pipeline** | Event trigger → PushTriggerService → dedup (Redis) → NotificationSetting check → push delivery (Expo) → in-app record → socket broadcast → mobile handler. All event types covered? Dedup works? Settings actually block delivery? Deleted users filtered? |
| X06 | `docs/audit/v2/wave3/X06.md` | **Feed & Algorithm** | Candidate retrieval → scoring → diversity reranking → pagination → display. Feed excludes banned/blocked/muted at EVERY stage? scheduledAt in SQL not post-fetch? Islamic prayer boost fires? Trending decay works? Exploration pulls fresh content? |
| X07 | `docs/audit/v2/wave3/X07.md` | **Real-time (Sockets + Queues)** | Read `chat.gateway.ts` (1,020 lines) + ALL queue processors. Socket events rate-limited? Auth validated? Event names match mobile? Jobs idempotent? Failed jobs go to DLQ? Search indexing handles ALL types? |
| X08 | `docs/audit/v2/wave3/X08.md` | **Content Moderation** | Report → queue → AI check → manual review → action → appeal → restore/confirm. Pre-save moderation blocks publish on fail? Ban cascades to ALL content? Appeal restores visibility? NSFW on images AND videos? Banned hashes checked? |
| X09 | `docs/audit/v2/wave3/X09.md` | **Search & Discovery** | Create/update/delete → Meilisearch sync → search index → search API → mobile. Every content type indexed? Deletion triggers removal? Ban excludes? Update re-indexes? Index schemas correct for queries? |
| X10 | `docs/audit/v2/wave3/X10.md` | **Mobile ↔ Backend Parity** | Read EVERY file in `apps/mobile/src/services/*.ts` (excluding signal/). For each API call: backend endpoint exists? HTTP method correct? DTO shape matches? Response type matches? Dead endpoints? Ghost calls? Type mismatches? |

---

## WAVE 5 — CRYPTO & E2E ENCRYPTION (8 agents)

**Attacker model: NSA TAO / compromised Mizanly server / nation-state MITM.**

All files in `apps/mobile/src/services/signal/`.

**Every agent checks:**
- Timing side-channels (non-constant-time on secrets)
- Key material on JS heap (immutable strings)
- Missing `zeroOut()` after key use
- Nonce reuse potential
- AEAD tag verified before processing decrypted data
- DH outputs checked for low-order points
- Replay vectors (missing dedup, counter validation)
- Downgrade paths (weaker crypto without consent)
- `Math.random()` near crypto (must be CSPRNG)
- Error messages leaking key material or session state
- Race conditions in concurrent encrypt/decrypt
- Fallback paths that bypass native crypto

| Agent | File Path | Signal Protocol Files |
|-------|-----------|----------------------|
| F01 | `docs/audit/v2/wave5/F01.md` | `crypto.ts`, `types.ts` |
| F02 | `docs/audit/v2/wave5/F02.md` | `native-crypto-adapter.ts` |
| F03 | `docs/audit/v2/wave5/F03.md` | `x3dh.ts` |
| F04 | `docs/audit/v2/wave5/F04.md` | `pqxdh.ts` |
| F05 | `docs/audit/v2/wave5/F05.md` | `double-ratchet.ts`, `session.ts` |
| F06 | `docs/audit/v2/wave5/F06.md` | `sender-keys.ts`, `sealed-sender.ts` |
| F07 | `docs/audit/v2/wave5/F07.md` | `storage.ts`, `prekeys.ts`, `key-transparency.ts` |
| F08 | `docs/audit/v2/wave5/F08.md` | `media-crypto.ts`, `streaming-upload.ts`, `offline-queue.ts`, `message-cache.ts`, `search-index.ts`, `multi-device.ts`, `safety-numbers.ts`, `notification-handler.ts`, `e2eApi.ts`, `telemetry.ts`, `index.ts` |

---

## WAVE 6 — GO SERVICES (6 agents)

**Every agent checks:**
- SQL injection (string concatenation)
- Auth bypass (missing middleware)
- Error swallowing (empty `if err != nil`)
- Missing context timeouts on DB/Redis/HTTP/LiveKit calls
- Resource leaks (unclosed rows, connections, resp.Body)
- Missing `defer recover()` in goroutines
- Race conditions (shared state without mutex)
- SQL correctness (column names vs schema, JOINs, transactions)
- Input validation (length, type, bounds)
- Error response info leakage

| Agent | File Path | Go Files |
|-------|-----------|----------|
| G01 | `docs/audit/v2/wave6/G01.md` | `apps/e2e-server/internal/handler/` — all handler files |
| G02 | `docs/audit/v2/wave6/G02.md` | `apps/e2e-server/internal/store/` — all store + SQL |
| G03 | `docs/audit/v2/wave6/G03.md` | `apps/e2e-server/internal/middleware/`, `config/`, `model/`, `cmd/server/main.go` |
| G04 | `docs/audit/v2/wave6/G04.md` | `apps/livekit-server/internal/handler/handler.go` — first half (CreateRoom → Mute) |
| G05 | `docs/audit/v2/wave6/G05.md` | `apps/livekit-server/internal/handler/handler.go` — second half (Egress → Webhook) + test file |
| G06 | `docs/audit/v2/wave6/G06.md` | `apps/livekit-server/internal/store/`, `config/`, `middleware/`, `model/`, `cmd/server/main.go`, `Dockerfile` |

---

## WAVE 9 — PERFORMANCE (8 agents)

| Agent | File Path | Focus | What to Find |
|-------|-----------|-------|-------------|
| J01 | `docs/audit/v2/wave9/J01.md` | **N+1 Queries** | Loops with `prisma.*.findUnique` (should be `findMany` + `IN`). Missing `include`. Multiple sequential queries that could be `Promise.all`. |
| J02 | `docs/audit/v2/wave9/J02.md` | **Missing DB Indexes** | Read `schema.prisma`. For every `where` clause in services: index exists? FK columns without `@@index`? Composite queries without composite indexes? `orderBy` without index? |
| J03 | `docs/audit/v2/wave9/J03.md` | **React Re-renders** | Inline objects in JSX props. Missing `React.memo` on list items. Missing `useCallback` on FlatList `renderItem`. `extraData` causing full re-render. `useMemo` missing on expensive computations. |
| J04 | `docs/audit/v2/wave9/J04.md` | **Memory Leaks** | `setInterval`/`setTimeout` without cleanup. Event listeners without removal. Subscriptions without unsubscribe. Growing Maps/Sets never evicted. Stale closures. |
| J05 | `docs/audit/v2/wave9/J05.md` | **Bundle Size** | Unused packages. Entire library imported when submodule suffices. Missing dynamic imports. Large assets not optimized. |
| J06 | `docs/audit/v2/wave9/J06.md` | **Image & Media** | No compression before upload. Missing cache config. Full-res in thumbnails. No progressive loading. Missing blurhash. Videos loaded eagerly. |
| J07 | `docs/audit/v2/wave9/J07.md` | **Redis Patterns** | Missing TTL. Oversized values. Hot keys. Missing pipeline/MULTI. Connection pool. Serialization overhead. |
| J08 | `docs/audit/v2/wave9/J08.md` | **API Response Size** | Unnecessary `include` relations. List endpoints without pagination. Responses with unused fields. Missing `select`/`omit`. Responses > 100KB. |

---

## ORCHESTRATOR WORKFLOW

### For each wave:

```
STEP 1: Announce "Starting Wave N — [name] ([count] agents)"

STEP 2: Spawn ALL agents in ONE message (parallel Agent tool calls)
         Each agent prompt = PREAMBLE + SCOPE from tables above
         Each agent prompt includes its specific file_path

STEP 3: Wait for all agents to return

STEP 4: Verify files exist and have content:
         ls docs/audit/v2/waveN/
         wc -l docs/audit/v2/waveN/*.md

STEP 5: Spot-check 3 findings (read source file:line, confirm real)
         Write results to docs/audit/v2/waveN/VERIFICATION.md

STEP 6: Report wave summary:
         "Wave N complete. [X] agents. [Y] findings. [Z] critical.
          Verification: [3/3 confirmed | N failed — re-running]."

STEP 7: If any agent file missing or empty → RE-RUN that agent

STEP 8: Move to next wave
```

### After all 6 waves:

Write `docs/audit/v2/PART1_SUMMARY.md`:
- Total agents deployed (must be 60)
- Total findings per wave
- Severity breakdown
- Top 20 critical findings (with file:line from agent files)
- Systemic patterns
- List of all 60 per-agent files for Part 2 and fix sessions to reference

---

## AGENT COUNT VERIFICATION

| Wave | Expected Agents | Expected Files |
|------|----------------|----------------|
| 1 — Security | 16 | `docs/audit/v2/wave1/A01.md` through `A16.md` |
| 2 — Data | 12 | `docs/audit/v2/wave2/B01.md` through `B12.md` |
| 3 — Cross-Module | 10 | `docs/audit/v2/wave3/X01.md` through `X10.md` |
| 5 — Crypto | 8 | `docs/audit/v2/wave5/F01.md` through `F08.md` |
| 6 — Go | 6 | `docs/audit/v2/wave6/G01.md` through `G06.md` |
| 9 — Performance | 8 | `docs/audit/v2/wave9/J01.md` through `J08.md` |
| **Total** | **60** | **60 files** |

After completion: `find docs/audit/v2 -name "*.md" -not -name "VERIFICATION.md" -not -name "PART1_SUMMARY.md" | wc -l` **MUST return 60.**

If it returns less than 60, you consolidated agents. Go back and run the missing ones.

---

## EXPECTED FINDINGS (from V1 data)

Based on V1 with proper agent counts:

| Wave | V1 Findings (proper agents) | Expected V2 |
|------|---------------------------|-------------|
| 1 — Security | 260 | 250-300 |
| 2 — Data | 168 | 150-200 |
| 3 — Cross-Module | 196 | 180-220 |
| 5 — Crypto | 89 | 80-120 |
| 6 — Go | 73 | 60-90 |
| 9 — Performance | 184 | 150-200 |
| **Total** | **970** | **870-1,130** |

If total is below 600, agents skimmed. If above 1,500, agents may be inflating.

---

## WHAT PART 2 WILL COVER (not this session)

- Wave 4: Mobile Screens UX (20 agents, 199 screens)
- Wave 7: Testing Gaps (14 agents, coverage per module)
- Wave 8: i18n & Accessibility (6 agents, 8 languages + RTL + a11y)
- Wave 10: Infrastructure (5 agents, CI + env + crons + queues + Docker)
- Wave 11: Architecture (6 agents, dead code + circular deps + patterns)
- Wave 12: Components & Hooks (4 agents, 48 components + 28 hooks)
- Wave 13: Prisma Schema (2 agents, 5,037 lines field-by-field)
= 57 agents

**Do NOT attempt Part 2 waves in this session.** Complete 6 waves properly. 60 agents. 60 files on disk. Then stop.
