# BATCH 43A: Platform & UX Parity (Core UX) — 13 Agents

**Date:** 2026-03-18
**Theme:** Tier 8, Part 1 — Core interaction mechanics, privacy controls, and digital wellbeing. 13 features that bring Mizanly to full UX parity with Instagram/WhatsApp/YouTube.

---

## GLOBAL RULES

1. Read `CLAUDE.md` first — mandatory rules
2. No `any` in non-test code. No `@ts-ignore`. No `@ts-expect-error`.
3. NEVER modify any file not explicitly listed in your agent task
4. All new screens: `useTranslation` + `t()`, `ScreenErrorBoundary`, `RefreshControl`
5. Use `radius.*` from theme, `<Icon name="..." />`, `<BottomSheet>` not Modal
6. After completing: `git add -A && git commit -m "feat: batch 43a agent N — <description>"`
7. Read the full plan at `docs/plans/2026-03-18-batch-43a-platform-ux.md` for detailed specs

---

## EXECUTION ORDER

**Agent 0 MUST complete first** (Prisma schema). Then Agents 1-12 run in parallel.

---

## WAVE 1 — COMPLETE (committed a55c3b2)

- **AGENT 0: Schema** — 4 new models (Restrict, DMNote, ScreenTimeLog, QuietModeSetting) + Comment.isHidden + UserSettings extensions
- **AGENT 1: Contact Sync** — `POST /users/contacts/sync` + contact-sync.tsx
- **AGENT 2: Biometric App Lock** — biometric-lock.tsx + _layout BiometricLockOverlay
- **AGENT 4: Restrict User** — restricts module (CRUD) + restricted.tsx
- **AGENT 6: Undo Send** — 5-second timer in conversation/[id].tsx
- **AGENT 11: Clear Mode + Comment Swipe-to-Like** — tap-toggle overlays on video/reel + PanGestureHandler on comments

---

## WAVE 2 — PENDING (7 remaining agents)

## AGENT 3: DM Notes — ~400 lines
Backend: CRUD for DMNote model (4 endpoints). Mobile: dm-note-editor.tsx.

## AGENT 5: Hide Reply — ~200 lines
Extend posts.service.ts: hideComment/unhideComment. Filter isHidden in getComments.

## AGENT 7: Muted Conversations — ~200 lines
Wire existing ConversationMember.isMuted: 2 endpoints + conversation-info.tsx toggle.

## AGENT 8: Quiet Mode — ~300 lines
Backend: QuietModeSetting CRUD + notification filter. Mobile: quiet-mode.tsx.

## AGENT 9: Screen Time / Wellbeing — ~500 lines
Backend: ScreenTimeLog + stats. Mobile: screen-time.tsx + _layout session tracker.

## AGENT 10: Auto-play Settings — ~200 lines
Backend: autoPlaySetting in UserSettings. Mobile: media-settings.tsx section.

## AGENT 12: Cross-post Between Spaces — ~400 lines
Backend: `POST /posts/:id/cross-post`. Mobile: cross-post.tsx space selector.

---

## TOTAL: ~3,780 lines across 13 agents (~2,200 done in Wave 1, ~1,580 remaining in Wave 2)
