# Master Prompt: Compile 10K+ Line Architecture Blueprint

> **Copy this entire file as your first message in a new Claude Code session.**
> **Do NOT summarize or skip any part. Every word matters.**

---

## YOUR MISSION

You are compiling the **definitive technical architecture document** for Mizanly — a 280K+ LOC Muslim social media platform. This document will be the single source of truth that every future agent, developer, and decision references. **Inaccuracies will cause catastrophic failures.**

The target is **10,000+ lines** of `docs/ARCHITECTURE.md` covering every model, endpoint, service method, hook, component, screen, algorithm weight, decision, pattern, cross-module dependency, and known bug — with file paths and line numbers.

## CRITICAL RULES

1. **READ before you write.** Do not write a single line of the document until you have read the relevant source files. If you haven't read it, you can't document it.
2. **Never guess.** If you're uncertain about a field name, parameter, or behavior — read the file. Mark anything unverified as `[UNVERIFIED]`.
3. **Every claim needs evidence.** Include `file:line` references for non-obvious facts.
4. **Cross-module connections are mandatory.** For every module, document: what it imports, what imports it, what socket events it emits/listens to, what notifications it creates, what queues it uses.
5. **Do not rush.** This will take the entire session. Quality over speed. Read thoroughly, not skim.
6. **Do not compress.** If a module has 29 endpoints, list all 29. If a model has 40 fields, list all 40. The whole point is completeness.

## EXISTING DATA

Previous session spawned **40 parallel agents** that extracted raw architecture data from every corner of the codebase. Their outputs are saved at:

```
docs/architecture-raw-2026-03-25/    (195 files, 856 KB)
```

There is also an existing compiled document at:

```
docs/ARCHITECTURE.md                 (1,189 lines — incomplete, needs 10x expansion)
```

**Your job is to read the raw agent outputs, cross-reference against actual source code, and compile a single 10K+ line document.**

## PHASE 1: ORIENTATION (Do this first, before any writing)

### Step 1.1: Read the project guide
```
Read: CLAUDE.md (entire file — contains rules, architecture overview, absolute rules, schema field names)
Read: docs/ARCHITECTURE.md (existing 1,189-line draft — your starting point)
```

### Step 1.2: Read memory files for context
```
Read all files in: ~/.claude/projects/C--dev-mizanly/memory/
Key files: user_shakhzod.md, feedback_*.md, project_session4_complete.md, project_session5_complete.md (if exists)
```

### Step 1.3: Understand the raw data structure
```
List: docs/architecture-raw-2026-03-25/*.output (195 files)
Read 3-4 representative output files to understand their format and depth level
```

### Step 1.4: Verify codebase metrics
```bash
wc -l apps/api/prisma/schema.prisma                              # Should be ~4704
find apps/api/src/modules -maxdepth 1 -type d | wc -l            # Should be ~80
find apps/mobile/app -name "*.tsx" | wc -l                        # Should be ~213
find apps/mobile/src/hooks -name "*.ts" | wc -l                   # Should be ~24
find apps/mobile/src/components -name "*.tsx" | wc -l              # Should be ~84
find apps/mobile/src/services -name "*.ts" | wc -l                # Should be ~36
find apps/api/src -name "*.spec.ts" | wc -l                       # Should be ~302
```

## PHASE 2: DEEP EXTRACTION (Parallel agent fleet)

Spawn **agents in batches** to read and extract. Each agent should:
- Read EVERY file in its scope (not skim, not summarize)
- Output structured data: tables for catalogs, prose for logic, file:line for evidence
- Note EVERY cross-module import/dependency
- Note EVERY socket event emit/listen
- Note EVERY notification created
- Note EVERY queue job dispatched

### Batch 1: Schema (2 agents)
- Agent A: Read schema.prisma lines 1-2400 (models A-L). Document EVERY field of EVERY model.
- Agent B: Read schema.prisma lines 2400-4704 (models M-Z + all enums). Document EVERY field and EVERY enum value.

### Batch 2: Core Backend Modules (8 agents)
Each reads controller + service + DTOs + module file for assigned modules:
- Agent: posts (29 endpoints, 37 service methods)
- Agent: reels (26 endpoints)
- Agent: stories (18 endpoints)
- Agent: threads (25 endpoints)
- Agent: messages + conversations (58 REST endpoints + socket events)
- Agent: calls + gateway (10 REST + 16 socket events)
- Agent: feed + personalized-feed + embeddings (algorithm pipeline)
- Agent: search + hashtags + recommendations

### Batch 3: Supporting Backend (6 agents)
- Agent: users + follows + blocks (46+ endpoints)
- Agent: auth + webhooks + two-factor + devices (auth pipeline)
- Agent: notifications + email + push (4 delivery channels)
- Agent: upload + media + stream (upload pipeline)
- Agent: moderation + reports + safety (content pipeline)
- Agent: monetization + payments + gifts + commerce (payment pipeline)

### Batch 4: Remaining Backend (4 agents)
- Agent: islamic + halal + mosques + scholar-qa (101 Islamic endpoints)
- Agent: gamification + events + circles + polls + community (community features)
- Agent: settings + privacy + admin + health + remaining modules
- Agent: common infrastructure (guards, interceptors, filters, middleware, queue, email, feature-flags, analytics)

### Batch 5: Mobile (8 agents)
- Agent: Tab screens + navigation tree + _layout files
- Agent: Create screens (8 create flows)
- Agent: Video editor (2,607 lines + FFmpeg engine)
- Agent: Content detail screens (post/reel/thread/video/story-viewer)
- Agent: Profile + settings screens
- Agent: Messaging + call screens
- Agent: Islamic + discovery + remaining screens
- Agent: All hooks (24) + all components (84) + store + types

### Batch 6: Cross-cutting (4 agents)
- Agent: End-to-end auth flow (mobile → Clerk → backend → socket)
- Agent: End-to-end upload flow (picker → resize → presign → R2 → Stream)
- Agent: End-to-end payment flow (all 5 payment types)
- Agent: End-to-end WebRTC flow (REST → socket → PC lifecycle)

### Batch 7: Infrastructure (2 agents)
- Agent: CI/CD + deployment + env vars + config files + EAS
- Agent: Test architecture (302 files, patterns, coverage, mocks)

**Total: ~34 agents.** Each returns structured markdown data.

## PHASE 3: COMPILATION (You do this yourself — do NOT delegate)

After all agents return, YOU compile everything into `docs/ARCHITECTURE.md`. This is where cross-module connections happen. Only one brain (yours) should weave the connections.

### Document Structure (16 sections, target line counts)

```
1. System Overview                           (~200 lines)
2. Data Layer — EVERY model, field, enum     (~1,500 lines)
3. Backend Layer — modules, guards, queues   (~800 lines)
4. Real-time Layer — socket events, rooms    (~400 lines)
5. Mobile Layer — screens, hooks, components (~1,500 lines)
6. End-to-End Flows — auth, upload, pay, RTC (~800 lines)
7. Algorithm & Feed Intelligence             (~500 lines)
8. Content Safety & Moderation               (~400 lines)
9. Notification System                       (~300 lines)
10. Islamic Features                          (~500 lines)
11. Monetization & Coin Economy              (~400 lines)
12. Design System & Theme                    (~500 lines)
13. Infrastructure & Deployment              (~400 lines)
14. Testing Architecture                     (~300 lines)
15. Cross-Module Dependency Map              (~600 lines) ← NEW, CRITICAL
16. Known Bugs, Gaps & Decision Log          (~800 lines)
                                      Total: ~9,200+ lines
```

### Section 15 is CRITICAL: Cross-Module Dependency Map

For EVERY module, document:
```
### Module: posts
**Imports from:** notifications, gamification, ai, moderation, queue, analytics, prisma, redis
**Imported by:** feed, search, hashtags, recommendations, users
**Socket events:** None (REST only)
**Notifications created:** MENTION, COMMENT, REPLY, LIKE, REPOST, QUOTE_POST
**Queue jobs dispatched:** addPushNotificationJob, addGamificationJob (award-xp, update-streak), addModerationJob, addSearchIndexJob
**Prisma models used:** Post, Comment, PostReaction, SavedPost, PostTaggedUser, CollabInvite, Hashtag, User, Block, Mute, FeedDismissal, Notification
**Redis keys:** feed:foryou:{userId}:{cursor} (30s cache)
**scheduledAt filter:** Applied to ALL 7 feed queries
**Comment permission:** Enforced in addComment (EVERYONE/FOLLOWERS/NOBODY)
```

Do this for ALL 80 modules. Yes, all 80.

## PHASE 4: VERIFICATION

Before committing, verify:
1. **Line count:** `wc -l docs/ARCHITECTURE.md` must be >= 10,000
2. **Model count:** Grep for `### ` headers in Data Layer — should be ~193
3. **Endpoint count:** Count HTTP method + path entries — should be 500+
4. **Hook count:** Should list all 24
5. **Component count:** Should list all 84
6. **Screen count:** Should list all 213
7. **Cross-module map:** Should have entries for all 80 modules
8. **Known bugs:** Should list at least the 5 critical + 7 high from session 5 findings
9. **No [UNVERIFIED] tags remaining** — if any exist, go read the file

## WHAT THE USER EXPECTS

- **Brutal accuracy.** No hand-waving. No "and more" or "etc." — list everything.
- **Every decision has a WHY.** Not just "we use Prisma" but "we use Prisma because: type-safe, migration system, schema-as-docs; rejected TypeORM (less safe), Drizzle (newer ecosystem)."
- **Every cross-module link documented.** If posts.service imports from notifications.service, that's documented in BOTH modules.
- **Every known bug listed.** Agent findings from session 5 identified 5 critical + 7 high + 7 medium issues. All must appear.
- **File paths for everything.** Not "in the posts module" but "apps/api/src/modules/posts/posts.service.ts:444-676".

## PACING

This is a marathon, not a sprint. You have a full session. Don't try to write the document in one go. The phases are:
1. Read + orient (15 min)
2. Spawn extraction agents (they run in parallel, ~10-15 min each)
3. Compile section by section as agents return
4. Verify and commit

**Do not skip Phase 1.** Do not skip reading the raw agent outputs. Do not skip cross-module connections. The user WILL check, and inaccuracies WILL be caught.

---

*This prompt was generated 2026-03-25 after session 5 of Mizanly development. The codebase has 280K+ LOC across 80 backend modules, 213 mobile screens, 193 Prisma models, and 5,208 tests.*
