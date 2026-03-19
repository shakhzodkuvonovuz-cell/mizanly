# Mizanly — Batch 85: ZERO GAPS, FULL COVERAGE, 10/10 PARITY
# Ralph Loop: DO NOT STOP. DO NOT SHORTCUT. DO NOT BATCH-GREP.

## YOUR MISSION
You will bring Mizanly to absolute perfection: every bug fixed, every gap filled, every test written, every competitor feature matched or exceeded. When you're done, there will be ZERO remaining issues and ZERO features below 10/10.

## ANTI-SHORTCUT RULES (READ THIS CAREFULLY)

**The previous audit session took shortcuts. This one will NOT.**

1. **NEVER say "batch audit via grep"** — you must READ each file with the Read tool and make changes with Edit
2. **NEVER mark a task [x] without showing the actual code change** — every fix must include the exact Edit/Write tool call
3. **NEVER skip a task because "it's probably fine"** — read the file, verify, then mark done
4. **NEVER write placeholder/stub implementations** — every feature must be REAL, FUNCTIONAL code
5. **NEVER use sub-agents** — do ALL work yourself directly
6. **ONE task at a time** — read the file, make the change, commit, mark [x], next task
7. **Show your work** — for every task, show: what you read, what you found, what you changed
8. **Test your changes** — if modifying a service, run its test file. If creating a test, run it.
9. **If a task requires 500+ lines of new code, WRITE ALL 500+ LINES** — no summaries, no "etc.", no "similar pattern for remaining"

## PROJECT
- Location: `C:/dev/mizanly/`
- 202 screens, 68 backend modules, 160 Prisma models, 88 test files (1,218 test cases)
- All code quality rules in CLAUDE.md are absolute
- npm NOT in shell PATH — use `cmd /c` pattern

## WHAT'S WRONG (from Batch 84 audit)

### Deferred Issues (must fix now)
1. **294 Arabic translation keys missing** — ar.json has 2,243 vs en.json's 2,415
2. **122 orphan Arabic keys** — keys in ar.json that don't exist in en.json
3. **7 screens missing ScreenErrorBoundary** — 189/196 have it, find and fix the 7
4. **~8 dead-code `take: 50` patterns** — in stories, stickers, posts, collabs, messages, live, reels, story-chains services
5. **~50 Prisma relations missing onDelete** — need cascade/set-null rules
6. **10 services missing test files** — embedding-pipeline, embeddings, feed-transparency, personalized-feed, islamic-notifications, content-safety, stripe-connect, push-trigger, push, retention
7. **20+ test files with < 5 test cases** — audio-tracks (2), channel-posts (2), drafts.controller (3), stickers (3), calls (4), etc.

### Parity Gaps (must reach 10/10)
8. **Bakra Live: 7/10** — needs multi-guest live streaming
9. **Majlis Audio Rooms: 7/10** — needs recording, better discovery
10. **Risalah Calls: 7/10** — needs group video calls (up to 8), screen sharing quality
11. **Minbar Analytics: 7/10** — needs demographic data (age, country, gender)
12. **Minbar Player: needs chapters UI** — timestamp-based chapters in video
13. **Islamic Prayer: 8/10** — needs multiple reciters for adhan, more calculation methods
14. **Islamic Quran: 8/10** — needs audio recitation with multiple reciters, word-by-word translation, tajweed color coding
15. **Islamic Zakat: 8/10** — needs gold/silver/stock/crypto asset types
16. **WeChat parity: 6/10** — needs extensibility concept (webhooks at minimum)
17. **Discord parity: 7/10** — needs always-on voice channels, better role permissions

## STATUS REPORTING

At end of EVERY response:
```
---RALPH_STATUS---
STATUS: IN_PROGRESS | COMPLETE | BLOCKED
TASKS_COMPLETED_THIS_LOOP: <number>
FILES_MODIFIED: <number>
TESTS_STATUS: PASSING | FAILING | NOT_RUN
WORK_TYPE: IMPLEMENTATION | TESTING | FIX
EXIT_SIGNAL: false | true
RECOMMENDATION: <what to do next>
---END_RALPH_STATUS---
```

EXIT_SIGNAL: true ONLY when ALL items in fix_plan.md are [x].

## START
1. Read `.ralph/fix_plan.md`
2. Find first unchecked [ ] item
3. Read the file(s) involved
4. Make the exact changes specified
5. Commit with descriptive message
6. Mark [x] in fix_plan.md
7. Move to next. NEVER STOP.
