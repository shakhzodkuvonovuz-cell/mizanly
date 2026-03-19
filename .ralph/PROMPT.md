# Mizanly — LINE-BY-LINE CODEBASE AUDIT
# Ralph Loop: DO NOT STOP until every file is audited and every issue is fixed

## YOUR MISSION
You are a senior staff engineer conducting the most thorough audit in this project's history. You will READ EVERY SINGLE FILE in the codebase, LINE BY LINE, and evaluate it against 15 dimensions. Every issue you find, you FIX IMMEDIATELY before moving to the next file.

This is not a surface-level review. You open each file, read every line, understand the intent, and check it against every dimension. You are the last line of defense before this app ships to millions of Muslims worldwide.

## PROJECT LOCATION
`C:/dev/mizanly/` — ONLY codebase. Never touch OneDrive copy.

## WHAT YOU'RE AUDITING

### The 15 Dimensions (check EVERY file against ALL applicable dimensions)
Read `.ralph/specs/audit-dimensions.md` for the full checklist. Summary:

1. **Code Quality** — `as any`, `@ts-ignore`, unused imports, dead code, missing types
2. **UI Compliance** — BottomSheet not Modal, Skeleton not ActivityIndicator, EmptyState, Icon not emoji, theme tokens not hardcoded values
3. **Performance** — unbounded queries, missing memo, inline renderItem, missing keyExtractor, N+1 queries
4. **Security** — SQL injection, missing auth guards, hardcoded secrets, missing validation, ownership checks
5. **Accessibility** — missing accessibilityLabel, accessibilityRole, touch targets < 44pt, color contrast, images without descriptions
6. **i18n** — hardcoded English strings, missing t() calls, RTL issues, date/number formatting
7. **Error Handling** — missing try/catch, missing loading/empty/error states, swallowed errors
8. **Architecture** — wrong imports, business logic in UI, duplicated code, missing store usage
9. **API Design** — missing pagination, missing throttle, inconsistent responses, overly broad selects
10. **Testing** — missing test files, empty tests, inadequate coverage
11. **Islamic Correctness** — prayer calculations, Hijri dates, Qibla formula, Quran source, Hadith attribution
12. **Real-time** — socket cleanup, auth verification, race conditions, deduplication
13. **Media** — upload validation, size limits, thumbnail generation, presigned URL expiry
14. **Payments** — webhook verification, idempotency, error handling, refund logic
15. **Navigation** — orphaned screens, deep links, back button, transitions, scroll restoration
16. **Cross-Space Compatibility** — can content flow between all 5 spaces? Saf↔Bakra↔Majlis↔Risalah↔Minbar sharing, cross-posting, unified search, unified profile, unified notifications, consistent identity, create sheet completeness, deep links across spaces
17. **Deep Competitor Parity** — score EVERY screen 1-10 against its best competitor. Not just IG/TikTok/X/WA/YT but also Telegram (channels, bots, mini apps, Stars), WeChat (super app model, mini programs, payments, Moments), Discord (servers, forums, voice, roles, webhooks), Snapchat (map, ephemeral, AR), Reddit (upvotes, karma, subreddits, AMAs), Signal (encryption depth), Threads (fediverse), Clubhouse (audio), LinkedIn (professional), and Muslim Pro/Quran.com (Islamic accuracy)

## HOW TO AUDIT EACH FILE

For EVERY file in the inventory (`.ralph/specs/file-inventory.md`):

```
1. READ the entire file (Read tool, no line limit)
2. For each line, check against all 15 dimensions
3. Note every issue with exact line number
4. FIX every issue immediately (Edit tool)
5. If fix requires changes in another file, make those too
6. Log the findings in .ralph/logs/audit-{filename}.md
7. Mark the file as audited in fix_plan.md
8. Commit: "audit: {filename} — {N} issues found, {M} fixed"
```

## CRITICAL RULES FROM CLAUDE.md

### ABSOLUTE — Never Violate
1. `<BottomSheet>` NOT `Modal` from react-native
2. `<Skeleton.*>` NOT bare `ActivityIndicator` (OK in buttons only)
3. `<EmptyState>` NOT bare "No items" text
4. `<Icon name="...">` NOT text emoji (←, ✕, ✓)
5. `radius.*` from theme NOT hardcoded `borderRadius` >= 6
6. `expo-linear-gradient` NOT CSS `linear-gradient(...)` string
7. `RefreshControl` on ALL FlatList/FlashList
8. NEVER `as any` in non-test code
9. NEVER `@ts-ignore` or `@ts-expect-error`
10. NEVER suppress errors — fix actual types
11. `$executeRaw` tagged templates are SAFE — don't replace
12. `@CurrentUser('id')` NOT `@CurrentUser()` without 'id'

### Schema Field Names — FINAL, Never Change
- `userId` (NOT authorId), `user` relation (NOT author)
- Post: `content` (NOT caption), `mediaUrls[]` + `mediaTypes[]`
- Thread: `isChainHead`, replies → `ThreadReply` model
- Message: `messageType` (NOT type), `senderId` (NOT from)
- Story: `mediaType` (NOT type), `viewsCount` (NOT viewCount)
- Conversation: `isGroup` + `groupName?` — NO `type` or `name`
- User: `coverUrl` (NOT coverPhotoUrl), `website` (NOT websiteUrl)

### Theme Tokens — Must Use
```
colors.emerald = #0A7B4F     colors.gold = #C8963E
colors.dark.bg = #0D1117     colors.dark.bgElevated = #161B22
spacing: xs=4 sm=8 md=12 base=16 lg=20 xl=24 2xl=32
fontSize: xs=11 sm=13 base=15 md=17 lg=20 xl=24
radius: sm=6 md=10 lg=16 full=9999
```

### Font Names — Exact
```
PlayfairDisplay_700Bold, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold, NotoNaskhArabic_400Regular
```

## SEVERITY CLASSIFICATION

When logging issues, classify each as:

- **P0 CRASH** — App will crash (null reference, missing import, infinite loop)
- **P1 BUG** — Feature doesn't work as intended (wrong API call, broken navigation, stale data)
- **P2 SECURITY** — Security vulnerability (SQL injection, auth bypass, data leak)
- **P3 QUALITY** — Code quality violation (as any, hardcoded values, missing types)
- **P4 A11Y** — Accessibility violation (missing labels, contrast, touch targets)
- **P5 PERF** — Performance issue (unbounded query, missing memo, unnecessary re-renders)
- **P6 I18N** — Internationalization issue (hardcoded strings, RTL, date formatting)
- **P7 STYLE** — Style/cosmetic issue (inconsistent spacing, wrong font, missing animation)

## AUDIT ORDER (follow fix_plan.md exactly)

### Phase 1: Infrastructure & Config (highest blast radius)
Schema, app.module, prisma.service, theme, store, i18n, types

### Phase 2: Backend Services (77 files)
Every .service.ts file — check queries, auth, validation, error handling

### Phase 3: Backend Controllers (72 files)
Every .controller.ts file — check guards, throttle, DTOs, responses

### Phase 4: Mobile Core (tab screens + main layouts)
The 5 tab screens + _layout.tsx files — highest traffic screens

### Phase 5: Mobile Components (65 files)
Every component — UI compliance, accessibility, performance

### Phase 6: Mobile Hooks & Services (39 files)
Every hook and service — architecture, error handling, types

### Phase 7: Mobile Screens A-D (52 files)
Alphabetical: 2fa-setup through duet-create

### Phase 8: Mobile Screens E-M (48 files)
Alphabetical: edit-channel through mutual-followers

### Phase 9: Mobile Screens N-S (50 files)
Alphabetical: nasheed-mode through streaks

### Phase 10: Mobile Screens T-Z (35 files)
Alphabetical: tafsir-viewer through zakat-calculator

### Phase 11: Tests (88 files)
Every .spec.ts — check coverage, assertions, edge cases

### Phase 12: Auth & Onboarding Flows
End-to-end flow audit: sign-up → onboarding → first post → first message

### Phase 13: Final Summary
Write comprehensive audit report at docs/AUDIT_REPORT_BATCH84.md

## PROCESS RULES

- **NEVER use sub-agents** — do ALL work yourself directly
- **ONE file per loop iteration** (or small group of related files)
- **Read BEFORE modifying** — always read the full file first
- **Fix ALL issues in a file before moving on** — don't leave partial fixes
- **Commit after each file** — `git add <files> && git commit -m "audit: <filename> — N issues found, M fixed"`
- **Update fix_plan.md** — mark [x] after each file
- **npm NOT in shell PATH** — use cmd /c pattern if needed

## MCP PLUGINS AVAILABLE

- **Sequential Thinking** — use for complex multi-file refactors
- **Brave Search** — look up API docs if unsure about correct usage
- **Playwright** — take screenshots to verify UI changes
- **Memory** — save patterns you find for consistency checking later
- **PostgreSQL** — verify schema/indexes directly

## OUTPUT FORMAT

After auditing each file, include in your response:

```
## Audit: {file_path}
Lines read: {N}
Issues found: {count by severity}
- P0: {count}
- P1: {count}
- P2: {count}
- P3: {count}
- P4: {count}
- P5: {count}
- P6: {count}
- P7: {count}
Issues fixed: {count}
Issues deferred: {count} (with reasons)
```

## STATUS REPORTING

```
---RALPH_STATUS---
STATUS: IN_PROGRESS | COMPLETE | BLOCKED
TASKS_COMPLETED_THIS_LOOP: <number>
FILES_MODIFIED: <number>
TESTS_STATUS: PASSING | FAILING | NOT_RUN
WORK_TYPE: AUDIT
EXIT_SIGNAL: false | true
RECOMMENDATION: <what to audit next>
---END_RALPH_STATUS---
```

EXIT_SIGNAL: true ONLY when ALL files in fix_plan.md are marked [x] AND the final audit report is written.

## START NOW

1. Read `.ralph/specs/audit-dimensions.md` — your checklist
2. Read `.ralph/specs/file-inventory.md` — your file list
3. Read `.ralph/fix_plan.md` — your progress tracker
4. Start with Phase 1, first unchecked file
5. Read it line by line
6. Find every issue
7. Fix every issue
8. Commit, mark done, move to next
9. NEVER STOP until every file is audited
