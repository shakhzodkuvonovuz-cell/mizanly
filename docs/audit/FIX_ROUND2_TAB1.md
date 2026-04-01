# FIX SESSION — Round 2 Tab 1: Admin, Privacy, Live, Audio, Broadcast, Stream + Cross-Module Auth/Users/Moderation/Sockets

> Paste into a fresh Claude Code session. This session fixes ~130 findings across backend services Group A + cross-module user lifecycle, content moderation, and real-time systems.

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — every rule, especially Integrity Rules and Code Patterns
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read Round 1 progress files to know what was ALREADY FIXED:
   - `docs/audit/v2/fixes/TAB1_PROGRESS.md` (Round 1 fixed auth/users/reports/moderation)
   - `docs/audit/v2/fixes/TAB3_PROGRESS.md` (Round 1 fixed messages/stories/videos)
   - `docs/audit/v2/fixes/TAB4_PROGRESS.md` (Round 1 fixed notifications/payments/islamic)
4. Read ALL of your audit finding files IN FULL before writing a single line of code:
   - `docs/audit/v2/wave1/A15.md` (22 findings — admin, waitlist, privacy, parental-controls, settings)
   - `docs/audit/v2/wave1/A16.md` (22 findings — live, audio-rooms, audio-tracks, broadcast, stream)
   - `docs/audit/v2/wave3/X04.md` (22 findings — User Lifecycle cross-module)
   - `docs/audit/v2/wave3/X07.md` (21 findings — Real-time Sockets + Queues)
   - `docs/audit/v2/wave3/X08.md` (32 findings — Content Moderation — YOUR portion only)
   - `docs/audit/v2/wave3/X02.md` (18 findings — Message & E2E — YOUR portion: chat.gateway.ts findings only)
   - `docs/audit/v2/wave9/J04.md` (13 findings — Memory Leaks — API portions only)
   - `docs/audit/v2/wave9/J07.md` (20 findings — Redis Patterns — YOUR modules only)
   - `docs/audit/v2/wave9/J08.md` (38 findings — API Response Size — YOUR modules only)
5. Create your progress file: `docs/audit/v2/fixes/R2_TAB1_PROGRESS.md`
6. Read this ENTIRE prompt before touching any source code

---

## YOUR SCOPE — THESE FILES ONLY

### Primary modules (all findings)
```
apps/api/src/modules/admin/
apps/api/src/modules/waitlist/
apps/api/src/modules/privacy/
apps/api/src/modules/parental-controls/
apps/api/src/modules/settings/
apps/api/src/modules/live/
apps/api/src/modules/audio-rooms/
apps/api/src/modules/audio-tracks/
apps/api/src/modules/broadcast/
apps/api/src/modules/stream/
apps/api/src/modules/scheduling/
apps/api/src/modules/retention/
apps/api/src/modules/circles/
apps/api/src/modules/drafts/
apps/api/src/modules/downloads/
apps/api/src/modules/profile-links/
```

### Cross-module owned files (only for cross-module findings)
```
apps/api/src/modules/auth/          (X04 user lifecycle fixes)
apps/api/src/modules/users/         (X04 user lifecycle fixes)
apps/api/src/modules/moderation/    (X08 content moderation fixes)
apps/api/src/modules/reports/       (X08 content moderation fixes)
apps/api/src/modules/content-safety/ (X08 content moderation fixes)
apps/api/src/gateways/chat.gateway.ts (X07 sockets + X02 gateway fixes)
apps/api/src/common/queue/          (X07 processor fixes)
apps/api/src/common/services/async-jobs.service.ts (J04 memory leak)
apps/api/src/common/services/analytics.service.ts  (J07 Redis pattern)
apps/api/src/common/services/feature-flags.service.ts (J07 Redis)
apps/api/src/common/services/ab-testing.service.ts (J07 Redis)
apps/api/src/common/utils/excluded-users.ts (J07 Redis)
```

### FORBIDDEN — DO NOT TOUCH
- `schema.prisma` — note as DEFERRED
- Any module NOT listed above (Tab 2 owns posts/reels/threads/feed/search/channels/communities; Tab 3 owns crypto+Go; Tab 4 owns messages/videos/stories/payments/notifications/islamic)
- `apps/mobile/` source (except signal/ owned by Tab 3)
- Do NOT touch `posts.service.ts`, `reels.service.ts`, `threads.service.ts`, `feed.service.ts`, `personalized-feed.service.ts`, `messages.service.ts`, `videos.service.ts`, `stories.service.ts`, `payments.service.ts`, `notifications.service.ts`, `islamic.service.ts` — those belong to other tabs

---

## FINDING ASSIGNMENT — WHAT YOU FIX FROM EACH AUDIT FILE

### A15 — ALL 22 findings (admin, waitlist, privacy, parental-controls, settings)
Fix everything. Key criticals:
- A15-#1 (C): `updateControls` overwrites scrypt hash with plaintext PIN — HIGHEST PRIORITY
- A15-#5 (H): `linkChild` returns full record including scrypt hash
- A15-#6 (H): `changePin` returns full record including hash

### A16 — ALL 22 findings (live, audio-rooms, audio-tracks, broadcast, stream)
Fix everything. Key criticals:
- A16-#1 (C): Raw SQL uses "LiveSession" not "live_sessions" — ALL viewer count updates fail
- A16-#2 (C): audio-tracks.delete() has NO ownership check — any user can delete any track
- A16-#3 (C): Raw SQL uses "Channel" not "channels" — stream error handler broken

### X04 — 20 of 22 findings (User Lifecycle)
Fix all findings EXCEPT:
- X04-#14 (channels.service.ts) → DEFER to Tab 2
- X04-#6 (notifications.service.ts) → DEFER to Tab 4
Key criticals:
- X04-#1 (C): GDPR deletion purge skips Clerk-deleted users
- X04-#2 (C): Deletion cancellation impossible — isDeactivated blocks auth

### X07 — ALL 21 findings (Sockets + Queues)
Fix everything. Key criticals:
- X07-#1 (C): send_sealed_message has NO DTO validation — OOM/DoS
- X07-#2 (C): send_sealed_message does NOT verify sender is conversation member
- X07-#6 (H): subscribe_presence — any user can track any other user (CHECK if already fixed in R1 Tab1)
- X07-#7 (H): Media processing queue has no enqueue method — dead code

### X08 — YOUR PORTION (~22 of 32 findings, Content Moderation)
Fix ONLY findings that touch YOUR files. The file-to-finding mapping:
- admin.service.ts: X08-#1, #11, #17, #18, #19, #20, #30
- reports.service.ts: X08-#2, #9, #23, #24
- content-safety.service.ts: X08-#8, #22, #27, #31
- moderation.service.ts: X08-#10, #12, #21, #26, #28, #32
- ai-tasks.processor.ts (queue/): X08-#15, #16
- users.service.ts: X08-#13

DEFER these to other tabs:
- X08-#3, #4, #29 (posts.service.ts) → Tab 2
- X08-#5 (reels.service.ts) → Tab 2
- X08-#6 (threads.service.ts) → Tab 2
- X08-#7 (messages.service.ts) → Tab 4
- X08-#14 (stories.service.ts) → Tab 4
- X08-#25 (videos.service.ts) → Tab 4

CRITICAL CHECK: X08-#9 (urgent auto-hide) and X08-#3/#4 (post edit moderation) may have been FIXED in Round 1. Read R1 TAB1_PROGRESS.md and TAB2_PROGRESS.md. If already fixed, mark as "ALREADY FIXED IN R1" with proof.

### X02 — YOUR PORTION (~6 of 18 findings, chat.gateway.ts only)
Fix ONLY findings in chat.gateway.ts:
- X02-#1 (C): subscribe_presence any user can intercept sealed sender
- X02-#3 (H): Sealed envelope fields not in Prisma schema
- X02-#5 (H, partial): e2eSenderKeyId falsy check (chat.gateway portion only)
- X02-#7 (M): send_sealed_message no DTO validation
- X02-#13 (L): handleMessage swallows errors
- X02-#16 (L): sealed sender emit includes conversationId

DEFER X02 findings in messages.service.ts and push*.ts to Tab 4.

### J04 — API portions only (~5 of 13 findings, Memory Leaks)
- J04-#2 (H): chat.gateway.ts typingTimers Map grows unbounded
- J04-#3 (H): async-jobs.service.ts cleanup timer leak
- J04-#10 (M): redis.module.ts REDIS_SHUTDOWN never injected
- J04-#11 (I): chat.gateway.ts Redis subscriber connection
- J04-#12 (I): feature-flags.service.ts localCache unbounded

### J07 — YOUR modules only (~10 of 20 findings, Redis Patterns)
- J07-C3 (C): analytics events list NO TTL, no consumer
- J07-H1 (H): ab:conversions keys NO TTL
- J07-H2 (H): DLQ list NO TTL, redundant with DB
- J07-H3 (H): chat.gateway 5-7 sequential Redis round-trips
- J07-H4 (H): excluded_users can be 810KB JSON
- J07-H5 (H): feature_flags hash effectively immortal
- J07-H6 (H): INCR+EXPIRE race condition (chat.gateway, auth.service)
- J07-M1 (M): user:{username} stores 2-5KB JSON
- J07-M5 (M): device_accounts 365-day TTL
- J07-L3 (L): cacheAside lock failure leaves stale lock

DEFER: J07-C1 (islamic), J07-C2 (posts impressions), J07-M2 (scored-feed-cache), J07-M4 (islamic Quran cache), J07-M7 (personalized-feed session) to their owning tabs.

### J08 — YOUR modules only (~8 of 38 findings, API Response Size)
- J08-#17 (H): audio-rooms getRoom include:host PII leak
- J08-#18 (H): audio-rooms createRoom include:host PII leak
- J08-#19 (M): broadcast sendMessage fan-out take:10000
- J08-#22 (M): privacy exportUserData 34 parallel findMany take:10000
- J08-#25 (M): drafts.service 4 methods fetch full draft for ownership
- J08-#26 (M): audio-rooms 3 methods fetch full room for permission
- J08-#27 (M): broadcast 7 methods fetch full row for checks
- J08-#36 (L): circles 5 methods fetch full Circle for permission

---

## CROSS-MODULE OVERLAP CHECK — CRITICAL

Before fixing ANY cross-module finding (X02, X04, X07, X08), CHECK if it was already fixed in Round 1:

```bash
# Quick check: read the Round 1 progress files
grep -i "subscribe_presence\|sealed.sender\|auto-hide\|auto.hide\|weaponiz\|bait.and.switch\|edit.*moderat\|moderateText" docs/audit/v2/fixes/TAB*_PROGRESS.md
```

If a finding is already fixed, write in your progress file:
```
### X07-#6 (H) — subscribe_presence any user can track any user
**Status:** ALREADY FIXED IN R1 — See TAB1_PROGRESS.md A10-#X / X02-#1 overlap
**Verification:** grep for the fix in source file [cite line]
```

---

## ENFORCEMENT RULES (same as Round 1, with additions)

### E1: PROVE every fix with before/after diff in progress file
### E2: TEST every fix individually
### E3: CHECKPOINT every 10 fixes
After every 10th fix:
```
CHECKPOINT [10/~130]
1. cd apps/api && pnpm test -- --testPathPattern="admin|waitlist|privacy|parental|settings|live|audio|broadcast|stream|auth|users|moderation|reports|content-safety"
2. cd apps/api && npx tsc --noEmit 2>&1 | tail -20
3. git diff --stat
4. Grep-verify 3 random fixes
5. COMMIT: git add <files> && git commit -m "fix(scope): R2-Tab1 checkpoint N — [summary]"
```

### E4: Every finding = FIXED, DEFERRED (reason), DISPUTED (proof), or ALREADY FIXED IN R1 (proof)
### E5: Read source before fixing
### E6: Pattern propagation — grep for same bug across your scope
### E7: No shallow fixes
### E8: Commit every checkpoint
### E9: Hostile self-review after completion
### E10: Progress file on disk as proof of work

---

## MODULE-SPECIFIC INSTRUCTIONS

### Parental Controls — PIN SECURITY
A15-#1 is the most dangerous finding in your scope. The plaintext PIN overwrite means ANY parent who updates their controls REPLACES their scrypt hash with "123456" in cleartext. Fix:
1. Read `parental-controls.service.ts` line 180-183
2. Extract `pin` from DTO BEFORE spreading to Prisma
3. If pin present, hash with scrypt THEN set `pinHash`
4. Verify existing `linkChild` and `changePin` also use scrypt consistently
5. For response exposure (#5, #6): add select clause excluding pinHash

### Live/Audio/Stream — RAW SQL TABLE NAMES
A16-#1, #3 are the same pattern: Prisma `@@map` renames models to snake_case. Your raw SQL uses PascalCase. Fix:
```sql
-- WRONG: "LiveSession"  
-- RIGHT: "live_sessions"

-- WRONG: "Channel"
-- RIGHT: "channels"
```
Grep your entire scope for raw SQL table name mismatches:
```bash
grep -rn '\\$executeRaw\|\\$queryRaw' apps/api/src/modules/live/ apps/api/src/modules/audio-rooms/ apps/api/src/modules/audio-tracks/ apps/api/src/modules/broadcast/ apps/api/src/modules/stream/ --include="*.ts" | grep -v spec | grep -v node_modules
```

### Chat Gateway — SEALED SENDER + SOCKET SECURITY
X02-#1 and X07-#1/#2 are critical socket vulnerabilities:
- subscribe_presence: verify the target user is a contact/conversation member before allowing presence subscription
- send_sealed_message: add DTO validation (MaxLength on all string fields, type constraints) AND verify sender is a conversation member

### Content Moderation (X08) — EDIT BYPASS
X08 is about the systemic "edit bypasses moderation" pattern. For YOUR files:
- admin.service.ts resolveReport needs to handle thread/reel/video/story REMOVE_CONTENT actions, not just post
- reports.service.ts resolve() same gap
- content-safety.service.ts autoRemoveContent maps reel/thread to wrong FK
- moderation.service.ts appeal restore needs to handle all content types
- users.service.ts profile update (bio, displayName) needs contentSafety.moderateText

### Memory + Redis Performance
J04 and J07 findings are about resource leaks:
- typingTimers: delete entry after timeout fires, not just on disconnect
- Redis TTLs: add TTL to analytics events, ab conversions, DLQ, feature_flags
- INCR+EXPIRE race: use MULTI/EXEC or Lua script for atomic increment+expire
- excluded_users 810KB: switch from JSON string to Redis Set

---

## FIX ORDER (priority)

1. **A15 criticals**: PIN security (#1, #5, #6)
2. **A16 criticals**: Raw SQL table names (#1, #2, #3)
3. **X04 criticals**: GDPR deletion (#1), deletion cancellation (#2)
4. **X07 criticals**: send_sealed_message (#1, #2)
5. **X02/X07**: subscribe_presence (#1/#6)
6. **X08**: Content moderation gaps (admin, reports, moderation)
7. **A15 remaining**: admin, waitlist, privacy, settings
8. **A16 remaining**: live, audio, broadcast, stream
9. **X04/X07/X08 remaining**: medium/low findings
10. **J04/J07/J08**: Performance + memory fixes

---

## TEST COMMANDS
```bash
cd apps/api && pnpm test -- --testPathPattern=admin
cd apps/api && pnpm test -- --testPathPattern=waitlist
cd apps/api && pnpm test -- --testPathPattern=privacy
cd apps/api && pnpm test -- --testPathPattern=parental
cd apps/api && pnpm test -- --testPathPattern=settings
cd apps/api && pnpm test -- --testPathPattern=live
cd apps/api && pnpm test -- --testPathPattern=audio
cd apps/api && pnpm test -- --testPathPattern=broadcast
cd apps/api && pnpm test -- --testPathPattern=stream
cd apps/api && pnpm test -- --testPathPattern=scheduling
cd apps/api && pnpm test -- --testPathPattern=auth
cd apps/api && pnpm test -- --testPathPattern=users
cd apps/api && pnpm test -- --testPathPattern=moderation
cd apps/api && pnpm test -- --testPathPattern=reports
cd apps/api && pnpm test  # full at checkpoints
cd apps/api && npx tsc --noEmit
```

---

## THE STANDARD

~130 findings. ~130 documented outcomes. 25+ new tests. Checkpoint every 10. Commit every checkpoint. Parental controls PIN is the #1 priority — one parent's PIN stored in plaintext is a child safety crisis. Raw SQL table names are silent runtime failures — viewer counts, subscriptions, stream handlers all broken. Content moderation edit bypass lets any user post CSAM then edit to innocuous content after going viral.

**~130 findings. Zero shortcuts. Begin.**
