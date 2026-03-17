# BATCH 42: Islamic-First Moat — 14 Agents

**Date:** 2026-03-18
**Theme:** Tier 7 — Islamic differentiator features. 14 features that make Mizanly uniquely valuable to Muslims: prayer-aware notifications, Qibla compass, Quran reading plans, tafsir, communal Quran rooms, sadaqah/charity, Hajj companion, scholar verification, halal content filter, Hijri dates, Eid cards, nasheed mode, dhikr social.

---

## GLOBAL RULES

1. Read `CLAUDE.md` first — mandatory rules
2. No `any` in non-test code. No `@ts-ignore`. No `@ts-expect-error`.
3. NEVER modify any file not explicitly listed in your agent task
4. All new screens: `useTranslation` + `t()`, `ScreenErrorBoundary`, `RefreshControl`
5. Use `radius.*` from theme, `<Icon name="..." />`, `<BottomSheet>` not Modal
6. After completing: `git add -A && git commit -m "feat: batch 42 agent N — <description>"`
7. Read the full plan at `docs/plans/2026-03-18-batch-42-islamic-moat.md` for detailed specs

---

## EXECUTION ORDER

**Agent 0 MUST complete first** (Prisma schema). Then Agents 1-13 run in parallel.

---

## AGENT 0: Prisma Schema — New Islamic Models

**Modifies:**
- `apps/api/prisma/schema.prisma`

Add these models at the end of the schema file:
- `QuranReadingPlan` — tracks 30/60/90 day Quran reading goals
- `DhikrSession` — individual dhikr counting sessions
- `DhikrChallenge` — communal dhikr goal (e.g. 1M salawat)
- `DhikrChallengeParticipant` — junction table [userId, challengeId]
- `CharityDonation` — sadaqah donations via Stripe
- `CharityCampaign` — user-created fundraising campaigns
- `HajjProgress` — Hajj step tracker per user per year
- `PrayerNotificationSetting` — DND, adhan, reminder preferences
- `ContentFilterSetting` — halal filter strictness per user
- `ScholarVerification` — scholar credential applications

Also add to existing `User` model:
- `isScholarVerified Boolean @default(false)`
- `nasheedMode Boolean @default(false)`

See full schema definitions in `docs/plans/2026-03-18-batch-42-islamic-moat.md`.

Run `npx prisma db push` after changes.

**~120 lines added**

---

## AGENT 1: Prayer-Time-Aware Notifications + Adhan Settings

**Creates:**
- `apps/api/src/modules/islamic/dto/prayer-notification.dto.ts`

**Modifies:**
- `apps/api/src/modules/islamic/islamic.service.ts` (add prayer notification settings methods)
- `apps/api/src/modules/islamic/islamic.controller.ts` (add GET/PATCH settings endpoints)
- `apps/api/src/modules/notifications/notifications.service.ts` (add DND check before sending push)
- `apps/mobile/app/(screens)/prayer-times.tsx` (add settings gear → BottomSheet with toggles)
- `apps/mobile/src/services/islamicApi.ts` (add settings API calls)
- `apps/mobile/src/types/islamic.ts` (add PrayerNotificationSetting type)

**Endpoints:**
```
GET    /islamic/prayer-notifications/settings  (ClerkAuthGuard)
PATCH  /islamic/prayer-notifications/settings  (ClerkAuthGuard)
```

**~500 lines**

---

## AGENT 2: Qibla Compass

**Creates:**
- `apps/mobile/app/(screens)/qibla-compass.tsx`

**Modifies:**
- `apps/mobile/app/(screens)/prayer-times.tsx` (make Qibla card tappable → navigate)
- `apps/mobile/src/i18n/en.json` + `ar.json` (add qibla keys)

Uses `expo-sensors` Magnetometer + `expo-location`. Calculate bearing to Kaaba (21.4225, 39.8262). Animated compass rose, gold Qibla arrow, haptic feedback at ±5° alignment.

**~300 lines**

---

## AGENT 3: Quran Reading Plans + Khatmah Tracker

**Creates:**
- `apps/api/src/modules/islamic/dto/quran-plan.dto.ts`
- `apps/mobile/app/(screens)/quran-reading-plan.tsx`

**Modifies:**
- `apps/api/src/modules/islamic/islamic.service.ts` (CRUD for reading plans)
- `apps/api/src/modules/islamic/islamic.controller.ts` (5 endpoints)
- `apps/mobile/src/services/islamicApi.ts`
- `apps/mobile/src/types/islamic.ts`
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Endpoints:**
```
POST   /islamic/quran-plans
GET    /islamic/quran-plans/active
GET    /islamic/quran-plans/history
PATCH  /islamic/quran-plans/:id
DELETE /islamic/quran-plans/:id
```

**~600 lines**

---

## AGENT 4: Tafsir Integration

**Creates:**
- `apps/api/src/modules/islamic/data/tafsir.json` (20+ key verses with 2-3 tafsir sources each)
- `apps/mobile/app/(screens)/tafsir-viewer.tsx`

**Modifies:**
- `apps/api/src/modules/islamic/islamic.service.ts` (tafsir lookup)
- `apps/api/src/modules/islamic/islamic.controller.ts` (2 endpoints)
- `apps/mobile/app/(screens)/quran-share.tsx` (add Tafsir button per verse)
- `apps/mobile/src/services/islamicApi.ts`
- `apps/mobile/src/types/islamic.ts`
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Endpoints:**
```
GET /islamic/tafsir/:surah/:verse  (OptionalClerkAuthGuard)
GET /islamic/tafsir/sources
```

**~500 lines**

---

## AGENT 5: Communal Quran Reading Rooms

**Creates:**
- `apps/mobile/app/(screens)/quran-room.tsx`
- `apps/api/src/gateways/dto/quran-room-events.dto.ts`

**Modifies:**
- `apps/api/src/gateways/chat.gateway.ts` (add quran room Socket.io events)
- `apps/mobile/src/services/islamicApi.ts`
- `apps/mobile/src/types/islamic.ts`
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Socket.io events:** `join_quran_room`, `leave_quran_room`, `quran_verse_sync`, `quran_reciter_change`

**~700 lines**

---

## AGENT 6: Sadaqah / Charity Integration

**Creates:**
- `apps/api/src/modules/islamic/dto/charity.dto.ts`
- `apps/mobile/app/(screens)/donate.tsx`
- `apps/mobile/app/(screens)/charity-campaign.tsx`

**Modifies:**
- `apps/api/src/modules/islamic/islamic.service.ts` (campaign CRUD + donation methods)
- `apps/api/src/modules/islamic/islamic.controller.ts` (5 endpoints)
- `apps/api/src/modules/payments/payments.service.ts` (add donation payment intent)
- `apps/mobile/src/services/islamicApi.ts`
- `apps/mobile/src/types/islamic.ts`
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Endpoints:**
```
POST   /islamic/charity/campaigns
GET    /islamic/charity/campaigns
GET    /islamic/charity/campaigns/:id
POST   /islamic/charity/donate
GET    /islamic/charity/my-donations
```

**~600 lines**

---

## AGENT 7: Hajj & Umrah Companion

**Creates:**
- `apps/api/src/modules/islamic/data/hajj-guide.json` (7 steps with duas + checklists)
- `apps/api/src/modules/islamic/dto/hajj.dto.ts`
- `apps/mobile/app/(screens)/hajj-companion.tsx`
- `apps/mobile/app/(screens)/hajj-step.tsx`

**Modifies:**
- `apps/api/src/modules/islamic/islamic.service.ts` (Hajj guide + progress CRUD)
- `apps/api/src/modules/islamic/islamic.controller.ts` (4 endpoints)
- `apps/mobile/src/services/islamicApi.ts`
- `apps/mobile/src/types/islamic.ts`
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Endpoints:**
```
GET    /islamic/hajj/guide
GET    /islamic/hajj/progress
POST   /islamic/hajj/progress
PATCH  /islamic/hajj/progress/:id
```

**~800 lines**

---

## AGENT 8: Islamic Scholar Verification Badge

**Creates:**
- `apps/api/src/modules/islamic/dto/scholar-verification.dto.ts`
- `apps/mobile/app/(screens)/scholar-verification.tsx`

**Modifies:**
- `apps/api/src/modules/islamic/islamic.service.ts` (apply + status methods)
- `apps/api/src/modules/islamic/islamic.controller.ts` (2 endpoints)
- `apps/mobile/src/components/ui/VerifiedBadge.tsx` (add `variant: 'scholar'` — green crescent)
- `apps/mobile/src/services/islamicApi.ts`
- `apps/mobile/src/types/islamic.ts`
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Endpoints:**
```
POST   /islamic/scholar-verification/apply
GET    /islamic/scholar-verification/status
```

**~300 lines**

---

## AGENT 9: Halal Content Filter

**Creates:**
- `apps/api/src/modules/islamic/dto/content-filter.dto.ts`
- `apps/mobile/app/(screens)/content-filter-settings.tsx`

**Modifies:**
- `apps/api/src/modules/islamic/islamic.service.ts` (filter settings CRUD)
- `apps/api/src/modules/islamic/islamic.controller.ts` (2 endpoints)
- `apps/api/src/modules/feed/feed.service.ts` (apply content filter to feed queries)
- `apps/mobile/src/services/islamicApi.ts`
- `apps/mobile/src/types/islamic.ts`
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Endpoints:**
```
GET    /islamic/content-filter/settings
PATCH  /islamic/content-filter/settings
```

**~600 lines**

---

## AGENT 10: Hijri Date Display + Calendar Enhancement

**Creates:**
- `apps/mobile/src/utils/hijri.ts` (Gregorian→Hijri conversion)

**Modifies:**
- `apps/mobile/app/(tabs)/_layout.tsx` (add Hijri date text in header)
- `apps/mobile/app/(screens)/islamic-calendar.tsx` (use real conversion, month navigation, event details)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**~200 lines**

---

## AGENT 11: Nasheed Mode

**Creates:**
- `apps/mobile/app/(screens)/nasheed-mode.tsx`

**Modifies:**
- `apps/api/src/modules/users/users.service.ts` (add nasheedMode toggle)
- `apps/api/src/modules/users/users.controller.ts` (add PATCH endpoint)
- `apps/mobile/src/store/index.ts` (add nasheedMode state)
- `apps/mobile/src/services/api.ts` (add toggle to usersApi)
- `apps/mobile/app/(screens)/settings.tsx` (add Nasheed Mode row)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**~300 lines**

---

## AGENT 12: Eid / Islamic Holiday Cards & Frames

**Creates:**
- `apps/mobile/app/(screens)/eid-cards.tsx`
- `apps/mobile/src/components/islamic/EidFrame.tsx`

**Modifies:**
- `apps/mobile/app/(screens)/create-story.tsx` (add Eid frame option in toolbar)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**~400 lines**

---

## AGENT 13: Dhikr Social — Challenges + Leaderboard

**Creates:**
- `apps/api/src/modules/islamic/dto/dhikr.dto.ts`
- `apps/mobile/app/(screens)/dhikr-challenges.tsx`
- `apps/mobile/app/(screens)/dhikr-challenge-detail.tsx`

**Modifies:**
- `apps/api/src/modules/islamic/islamic.service.ts` (sessions, stats, challenges, leaderboard)
- `apps/api/src/modules/islamic/islamic.controller.ts` (8 endpoints)
- `apps/mobile/app/(screens)/dhikr-counter.tsx` (add share + challenges link)
- `apps/mobile/src/services/islamicApi.ts`
- `apps/mobile/src/types/islamic.ts`
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Endpoints:**
```
POST   /islamic/dhikr/sessions
GET    /islamic/dhikr/stats
GET    /islamic/dhikr/leaderboard
POST   /islamic/dhikr/challenges
GET    /islamic/dhikr/challenges
GET    /islamic/dhikr/challenges/:id
POST   /islamic/dhikr/challenges/:id/join
POST   /islamic/dhikr/challenges/:id/contribute
```

**~500 lines**

---

## CONFLICT MATRIX

| File | Agents | Resolution |
|------|--------|------------|
| `schema.prisma` | 0 only | Runs first |
| `islamic.service.ts` | 1,3,4,6,7,8,9,13 | Each appends distinct methods |
| `islamic.controller.ts` | 1,3,4,6,7,8,9,13 | Each appends distinct endpoints |
| `islamicApi.ts` | 1,3,4,5,6,7,8,9,13 | Each appends distinct calls |
| `types/islamic.ts` | 1,3,4,5,6,7,8,9,13 | Each appends distinct types |
| `i18n/en.json` + `ar.json` | All | Each adds own namespace |
| `prayer-times.tsx` | 1,2 | Agent 1: settings BottomSheet. Agent 2: Qibla link. Different sections |
| `chat.gateway.ts` | 5 only | — |
| `feed.service.ts` | 9 only | — |
| `store/index.ts` | 11 only | — |
| `VerifiedBadge.tsx` | 8 only | — |
| `tabs/_layout.tsx` | 10 only | — |

---

## TOTAL: ~6,420 lines across 14 agents
