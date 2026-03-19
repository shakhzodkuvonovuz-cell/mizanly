# COPY-PASTE THIS INTO A NEW CLAUDE CODE SESSION
# Then run: cd C:/dev/mizanly && ralph --monitor

---

You are executing the Mizanly Mega Build — an autonomous development loop that will implement 96 tasks across 12 batches (72-83) to bring Mizanly from 4.6/10 to 8.0/10 competitor parity.

## IMMEDIATE ACTIONS

1. `cd C:/dev/mizanly`
2. Read `CLAUDE.md` — project rules
3. Read `docs/COMPETITOR_DEEP_AUDIT_2026.md` — full audit with scores and plan
4. Read `.ralph/fix_plan.md` — your master TODO list (96 tasks)
5. Read `.ralph/PROMPT.md` — your full instructions
6. Start executing from task 72.1, work through every task sequentially
7. NEVER stop. NEVER ask for permission. NEVER use sub-agents.
8. Commit after each completed task.
9. Mark each task [x] in fix_plan.md as you complete it.

## QUICK CONTEXT

Mizanly = 5-space Islamic social app (IG + TikTok + X + WA + YT)
- 468 commits, 202 screens, 68 backend modules, 160 Prisma models
- Located at C:/dev/mizanly (NOT the OneDrive copy)
- npm NOT in PATH — use cmd /c pattern for npm commands
- All code quality rules in CLAUDE.md are absolute

## THE 12 BATCHES

| Batch | Focus | Tasks |
|-------|-------|-------|
| 72 | Algorithm (pgvector + Gemini embeddings) | 11 |
| 73 | Performance (preload, blur hash, offline) | 10 |
| 74 | Onboarding (anonymous browse, 2-step, cold start) | 9 |
| 75 | Infrastructure (BullMQ, Sentry, clustering) | 9 |
| 76 | Retention (vanity notifs, streaks, digest) | 8 |
| 77 | UX Polish (transitions, gestures, ambient) | 9 |
| 78 | Accessibility (WCAG AA, screen reader, a11y) | 9 |
| 79 | Monetization (Stripe Connect, virtual currency) | 8 |
| 80 | Islamic Moat (prayer DND, adhan, mosque graph) | 9 |
| 81 | Content Creation (video editor, AI captions) | 7 |
| 82 | Moderation (AI mod, forward limits, kindness) | 7 |
| 83 | Branding & i18n (5 langs, app icon, RTL test) | 8 |

**Total: 96 tasks across 12 batches**

## TO START WITH RALPH (AUTONOMOUS LOOP)

Open terminal in C:/dev/mizanly and run:
```bash
ralph --monitor
```

Ralph will loop Claude Code autonomously, checking fix_plan.md progress after each iteration, and continuing until EXIT_SIGNAL: true (all 96 tasks complete).

## TO START WITHOUT RALPH (MANUAL)

Just paste this entire prompt into a new Claude Code session with working directory set to C:/dev/mizanly, and say:

> "Read .ralph/PROMPT.md and .ralph/fix_plan.md, then start executing from the first unchecked task. Do not stop until everything is done."

---

Good luck. Build the future of Islamic social media. 🕌
