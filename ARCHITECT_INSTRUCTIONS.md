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

## AGENT 0: Schema — 4 new models + 2 model extensions

**Modifies:** `apps/api/prisma/schema.prisma`

Add models: Restrict, DMNote, ScreenTimeLog, QuietModeSetting.
Add to Comment: `isHidden Boolean @default(false)`.
Add to UserSettings: `screenTimeLimitMinutes Int?`, `undoSendSeconds Int @default(5)`, `autoPlaySetting String @default("wifi")`.

## AGENT 1: Contact Sync — ~400 lines
Backend: `POST /users/contacts/sync`. Mobile: contact-sync.tsx using expo-contacts.

## AGENT 2: Biometric App Lock — ~300 lines
Mobile: biometric-lock.tsx using expo-local-authentication. Store + settings + _layout lock check.

## AGENT 3: DM Notes — ~400 lines
Backend: CRUD for DMNote model (4 endpoints). Mobile: dm-note-editor.tsx.

## AGENT 4: Restrict User — ~300 lines
New module: restricts (module/service/controller). Mobile: restricted.tsx list screen.

## AGENT 5: Hide Reply — ~200 lines
Extend posts.service.ts: hideComment/unhideComment. Filter isHidden in getComments.

## AGENT 6: Undo Send — ~200 lines
Mobile-only: timer-based undo in conversation/[id].tsx.

## AGENT 7: Muted Conversations — ~200 lines
Wire existing ConversationMember.isMuted: 2 endpoints + conversation-info.tsx toggle.

## AGENT 8: Quiet Mode — ~300 lines
Backend: QuietModeSetting CRUD + notification filter. Mobile: quiet-mode.tsx.

## AGENT 9: Screen Time / Wellbeing — ~500 lines
Backend: ScreenTimeLog + stats. Mobile: screen-time.tsx + _layout session tracker.

## AGENT 10: Auto-play Settings — ~200 lines
Backend: autoPlaySetting in UserSettings. Mobile: media-settings.tsx section.

## AGENT 11: Clear Mode + Comment Swipe-to-Like — ~300 lines
Mobile: tap-toggle overlays on video/reel screens + PanGestureHandler on comments.

## AGENT 12: Cross-post Between Spaces — ~400 lines
Backend: `POST /posts/:id/cross-post`. Mobile: cross-post.tsx space selector.

---

## TOTAL: ~3,780 lines across 13 agents
