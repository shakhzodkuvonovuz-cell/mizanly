# FIX SESSION — Tab 3: Videos, Stories, Messages

> Paste into a fresh Claude Code session. Fixes 149 findings. Messages module handles E2E encryption — highest sensitivity.

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — every rule, ESPECIALLY E2E Encryption Rules
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read ALL 6 audit finding files IN FULL:
   - `docs/audit/v2/wave1/A05.md` (28 findings — videos, video-editor, subtitles, thumbnails)
   - `docs/audit/v2/wave2/B05.md` (31 findings — Video model data integrity)
   - `docs/audit/v2/wave1/A07.md` (18 findings — stories, story-chains)
   - `docs/audit/v2/wave2/B07.md` (24 findings — Story model data integrity)
   - `docs/audit/v2/wave1/A06.md` (23 findings — messages, chat-export, stickers)
   - `docs/audit/v2/wave2/B06.md` (25 findings — Message model, ConversationParticipant)
4. Create: `docs/audit/v2/fixes/TAB3_PROGRESS.md`
5. Run `mkdir -p docs/audit/v2/fixes` if needed
6. Read this ENTIRE prompt before touching source code

---

## YOUR SCOPE — THESE MODULES ONLY

```
apps/api/src/modules/videos/
apps/api/src/modules/video-editor/
apps/api/src/modules/video-replies/
apps/api/src/modules/subtitles/
apps/api/src/modules/thumbnails/
apps/api/src/modules/stories/
apps/api/src/modules/story-chains/
apps/api/src/modules/messages/
apps/api/src/modules/chat-export/
apps/api/src/modules/stickers/
```

**FORBIDDEN — DO NOT TOUCH:**
- `apps/api/src/gateways/chat.gateway.ts` — cross-module session handles this
- `schema.prisma` — dedicated schema session
- Any module not listed above
- Tab 1 modules (auth, users, follows, blocks, reports, moderation)
- Tab 2 modules (posts, reels, threads)
- Tab 4 modules (payments, notifications, islamic)
- `apps/mobile/`, Go services

---

## ENFORCEMENT RULES

### E1: PROVE every fix
Write to `docs/audit/v2/fixes/TAB3_PROGRESS.md`:
```
### Finding A06-#4 (Severity: C)
**Audit says:** messages.service.ts:1640 — role check uses 'ADMIN' (uppercase) but stored value is 'admin' (lowercase)
**Before:** `if (participant.role !== 'ADMIN')` — always evaluates true, ANY member passes
**After:** `if (participant.role !== 'admin')` — correctly restricts to admin role
**Also fixed:** Same bug at line 1702 (setMessageExpiry) — same 'ADMIN' → 'admin' fix
**Test:** messages.service.spec.ts — added "should reject non-admin from createGroupTopic" + "should reject non-admin from setMessageExpiry"
**Status:** FIXED + TESTED
```

### E2: TEST every fix individually
```bash
cd apps/api && pnpm test -- --testPathPattern=messages  # after each messages fix
cd apps/api && pnpm test -- --testPathPattern=videos    # after each videos fix
cd apps/api && pnpm test -- --testPathPattern=stories   # after each stories fix
```
**Minimum new tests: 35.** Three complex modules, 149 findings = expect 35+ new test cases.

### E3: CHECKPOINT every 10 fixes
After every 10th fix:
```
CHECKPOINT [10/149]

1. Run: cd apps/api && pnpm test -- --testPathPattern="messages|videos|stories|chat-export|stickers|video-editor|video-replies|subtitles|thumbnails|story-chains"
2. Run: cd apps/api && npx tsc --noEmit 2>&1 | tail -20
3. Run: git diff --stat
4. Grep-verify 3 random fixes:
   - Read the source file at the cited line
   - Confirm your fix is present
   - Confirm the old buggy code is gone
5. Write checkpoint to progress file
6. COMMIT
```

Checkpoints at: 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 149 = 15 checkpoints.

### E4: NO SKIPPING
Every finding = FIXED + TESTED, DEFERRED (reason required), or DISPUTED (code proof required).

### E5: READ before fixing
Read tool first. Then Edit. Especially for messages module — read the ENTIRE function, not just the cited line. Message handling functions have complex state that a line-level fix can break.

### E6: PATTERN PROPAGATION
When you fix a pattern in videos, grep stories and messages for the same issue:
```bash
grep -rn "findUnique\|findFirst" apps/api/src/modules/videos/ apps/api/src/modules/stories/ apps/api/src/modules/messages/ --include="*.service.ts" | grep -v spec
```

### E7: NO SHALLOW FIXES
Especially in messages module:
- Adding `await` without understanding what the async call does = dangerous
- Changing a role check string without verifying what the database actually stores = dangerous
- Clearing E2E fields without listing ALL 8 fields = incomplete fix
- Adding moderation to stories without also adding a report endpoint = half fix

### E8: COMMIT every checkpoint

### E9: HOSTILE SELF-REVIEW after completion

### E10: FINAL PROGRESS FILE with all before/after diffs

---

## ⚠️ MESSAGES MODULE — EXTREME CARE REQUIRED

The messages module handles E2E encrypted communication. This is the most sensitive code in the entire app. For EVERY messages finding:

### NEVER DO:
- Log message content, encryption keys, E2E metadata, nonces, session state
- Add `console.log` or `Logger.debug` with any E2E field values
- Include E2E field values in Sentry breadcrumbs or error context
- Return E2E fields in API responses that don't need them
- Weaken any existing security check "to make the fix simpler"

### E2E FIELDS — know these by name:
```
encryptedContent, e2eVersion, e2eSenderDeviceId,
e2eSenderRatchetKey, e2eCounter, e2ePreviousCounter,
e2eSenderKeyId, e2eSenderKeySignature (if exists)
```

### DISAPPEARING MESSAGES — Critical finding expected:
The audit found that `processExpiredMessages` clears message content but retains E2E crypto fields. This is a forward secrecy violation — expired messages should have ALL crypto metadata removed.

Fix: in the `updateMany` data object for expired message cleanup, include ALL 8 E2E fields set to `null`:
```typescript
data: {
  content: '[Message expired]',
  encryptedContent: null,
  e2eVersion: null,
  e2eSenderDeviceId: null,
  e2eSenderRatchetKey: null,
  e2eCounter: null,
  e2ePreviousCounter: null,
  e2eSenderKeyId: null,
}
```

### ROLE CASE MISMATCH — Critical finding:
`createGroupTopic` checks `role !== 'ADMIN'` but roles are stored as lowercase `'admin'`. The condition always passes — ANY group member can create topics and set message expiry.

Fix: change `'ADMIN'` to `'admin'` in ALL role comparisons in the file. Grep the entire file:
```bash
grep -n "'ADMIN'" apps/api/src/modules/messages/messages.service.ts
```
Fix EVERY occurrence, not just the one cited.

---

## STORIES MODULE — MISSING FUNCTIONALITY

The audit found stories have ZERO moderation:
- No report endpoint (unlike posts, reels, threads which all have report)
- No pre-save text moderation (moderateText not called on create)
- No text overlay content check

You need to ADD:
1. `moderateText` call in `stories.service.ts create()` — if story has text overlay content
2. Report endpoint in `stories.controller.ts` — follow the pattern from posts.controller.ts report endpoint
3. If a DTO is needed for the report endpoint, create it in stories dto/ folder

This is not just a "fix" — it's a small feature addition required by the audit. Take the time to do it right. Read how reports work in posts module first, then replicate for stories.

---

## VIDEOS MODULE — LARGEST IN THIS SCOPE

59 findings (A05 + B05). Expect:
- Visibility filters missing on getById, getComments, getUserVideos
- Moderation missing on update/edit
- Missing DTO validation
- Missing @Throttle on mutations
- scheduledAt not filtered on public queries
- Counter consistency issues
- Raw SQL table name mismatches (if any — check for `$executeRaw` usage)

Same patterns as posts/reels — Tab 2 is fixing those. Match their approach for consistency.

---

## FIX ORDER (hardest first)

1. **messages/ + chat-export/ + stickers/** (A06 + B06 = 48 findings) — E2E sensitive, do first while fresh
2. **videos/ + video-editor/ + video-replies/ + subtitles/ + thumbnails/** (A05 + B05 = 59 findings) — large module, systematic
3. **stories/ + story-chains/** (A07 + B07 = 42 findings) — includes new report endpoint

---

## TEST COMMANDS
```bash
cd apps/api && pnpm test -- --testPathPattern=messages
cd apps/api && pnpm test -- --testPathPattern=chat-export
cd apps/api && pnpm test -- --testPathPattern=stickers
cd apps/api && pnpm test -- --testPathPattern=videos
cd apps/api && pnpm test -- --testPathPattern=video-editor
cd apps/api && pnpm test -- --testPathPattern=video-replies
cd apps/api && pnpm test -- --testPathPattern=subtitles
cd apps/api && pnpm test -- --testPathPattern=thumbnails
cd apps/api && pnpm test -- --testPathPattern=stories
cd apps/api && pnpm test -- --testPathPattern=story-chains
cd apps/api && pnpm test  # full at checkpoints
cd apps/api && npx tsc --noEmit
```

---

## THE STANDARD

149 findings. 149 documented outcomes. 35+ new tests. 15 checkpoints. 15 commits. Messages module treated with cryptographic care. Stories get a report endpoint they never had.

**149 findings. Zero shortcuts. Begin.**
