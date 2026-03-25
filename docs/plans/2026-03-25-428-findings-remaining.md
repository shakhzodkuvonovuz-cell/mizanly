# 428-Finding Gap List — Implementation Tracker

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all code-fixable OPEN items from the 428-finding audit. Zero deferrals.

**Status:** Batches 1-3 COMPLETE (32/32 PASS). Batches 4-7 in progress.

---

## ~~BATCH 1: Backend Validation & Safety (8 items) — COMPLETE ✓~~

All 8 items verified PASS via deep audit.

| # | Finding | Status |
|---|---------|--------|
| ~~3~~ | ~~SQL injection — safety docs + positional params + 12 security tests~~ | ✓ PASS |
| ~~122~~ | ~~Hashtag limit — @ArrayMaxSize(20) on all 4 DTOs~~ | ✓ PASS |
| ~~123~~ | ~~Mention limit — @ArrayMaxSize(50) + @MaxLength(50) aligned all DTOs~~ | ✓ PASS |
| ~~124~~ | ~~Duplicate post — content + mediaUrls dedup, 5-min window~~ | ✓ PASS |
| ~~165~~ | ~~Sentry — try/catch require with graceful fallback~~ | ✓ PASS |
| ~~167~~ | ~~Group role — runtime validation controller + service~~ | ✓ PASS |
| ~~168~~ | ~~Group description — schema + DTO + service wired~~ | ✓ PASS |
| ~~169~~ | ~~Group invite — crypto random, Redis TTL, banned check~~ | ✓ PASS |

## ~~BATCH 2: Frontend Wiring & Missing UI (14 items) — COMPLETE ✓~~

All 14 items verified PASS via deep audit.

| # | Finding | Status |
|---|---------|--------|
| ~~9/74~~ | ~~LinkPreview in PostCard — URL regex, text-only guard~~ | ✓ PASS |
| ~~19~~ | ~~DoubleTapHeart — reel + thread detail now have double-tap~~ | ✓ PASS |
| ~~26~~ | ~~Report — flag icon on thread + reel GlassHeader~~ | ✓ PASS |
| ~~90/106~~ | ~~Pinned conversations — schema + service + controller + mobile~~ | ✓ PASS |
| ~~95/109~~ | ~~Mention autocomplete — wired into post comment input~~ | ✓ PASS |
| ~~107~~ | ~~Search in conversation — pre-existing, fully functional~~ | ✓ PASS |
| ~~119~~ | ~~Activity status — lastActiveAt with formatDistanceToNowStrict~~ | ✓ PASS |
| ~~120/132~~ | ~~Follows you — backend isFollowedBy + frontend badge~~ | ✓ PASS |
| ~~121~~ | ~~Thread read — AsyncStorage tracking + emerald unread dot~~ | ✓ PASS |
| ~~130~~ | ~~Reaction picker — wired into PostCard long-press BottomSheet~~ | ✓ PASS |
| ~~87~~ | ~~Image alt text — PostMedia accessibilityLabel from altText~~ | ✓ PASS |
| ~~108~~ | ~~Online in conversation — "Online" for <5min lastActiveAt~~ | ✓ PASS |

## ~~BATCH 3: Content Quality & Safety (10 items) — COMPLETE ✓~~

All 10 items verified PASS via deep audit.

| # | Finding | Status |
|---|---------|--------|
| ~~69~~ | ~~Hashtag boost — +0.15 in personalized feed~~ | ✓ PASS |
| ~~128~~ | ~~Feed prefetch — Image.prefetch max 10 thumbnails~~ | ✓ PASS |
| ~~147~~ | ~~Haptic — tick() in BrandedRefreshControl~~ | ✓ PASS |
| ~~149~~ | ~~Crossfade — FadeIn.duration(300) on content load~~ | ✓ PASS |
| ~~150~~ | ~~Like animation — scale bump 1→1.2→1 withSpring~~ | ✓ PASS |
| ~~192~~ | ~~DM permission — nobody/followers/everyone enforced~~ | ✓ PASS |
| ~~199~~ | ~~Location cleanup — lat/lng/name nullified on deletion~~ | ✓ PASS |
| ~~225~~ | ~~Unfollow confirmation — Alert.alert destructive~~ | ✓ PASS |
| ~~226~~ | ~~Delete confirmation — Alert.alert "cannot be undone"~~ | ✓ PASS |
| ~~228~~ | ~~Double-post — isPending guard + disabled + loading~~ | ✓ PASS |

---

## BATCH 4: Screens & Flows (12 items) — IN PROGRESS

| # | Finding | Fix | Status |
|---|---------|-----|--------|
| 14 | duet-create no upload | Wire presigned upload pipeline like create-reel | PENDING |
| 15 | stitch-create no upload | Wire presigned upload pipeline like create-reel | PENDING |
| 17 | share-receive no post creation | Wire postsApi.create from shared content | PENDING |
| 36 | Live stream no camera/socket | Wire Cloudflare Stream + socket chat | PENDING |
| 134 | No seller analytics | Add seller stats screen from commerce endpoints | PENDING |
| 136 | No tutorial overlays | Add first-launch coach marks | PENDING |
| 137 | No permission rationale | Add explanation before camera/location permission | PENDING |
| 145 | Content calendar | Add calendar view for scheduled posts | PENDING |
| 183 | Surah list browser | Add surah browsing screen | PENDING |
| 210 | Arabic numeral formatting | Add toArabicNumerals utility | PENDING |
| 271 | Long captions not expandable | Add "...more" inline expand in PostCard | PENDING |
| 284 | Content removed notification | Send notification on moderation removal | PENDING |

## BATCH 5: Retention & Social (12 items)

| # | Finding | Fix | Status |
|---|---------|-----|--------|
| 70 | Audio message speed control | Add 1x/1.5x/2x in conversation | PENDING |
| 71 | Contact card sharing | Add CONTACT message type render + send | PENDING |
| 126 | Quote repost | Add quote-post with embedded original | PENDING |
| 135 | First-launch detection | Add hasOnboarded AsyncStorage flag | PENDING |
| 172 | Collaborative filtering | Add "also followed by" suggestions | PENDING |
| 178 | Session timeout | Add idle timeout after 30 days | PENDING |
| 189 | Mass-report abuse (verify) | Already implemented — verify 10/hr limit | PENDING |
| 200 | IP retention (verify) | Already implemented — verify 90-day purge | PENDING |
| 217 | Old username redirect (verify) | Verify previousUsername fallback works | PENDING |
| 289 | "Edited" label on posts | Add editedAt to Post model, show label | PENDING |
| 306 | Post edit window | Add 15-min edit restriction | PENDING |
| 337 | Upload progress (verify) | Verify UploadProgressBar on all screens | PENDING |

## BATCH 6: Islamic & Cultural (11 items)

| # | Finding | Fix | Status |
|---|---------|-----|--------|
| 210 | Arabic numeral formatting | Utility + apply in Arabic locale | PENDING |
| 211 | Gender-appropriate Arabic | Add gender context to i18n | PENDING |
| 212 | Hijri date on posts | Add hijri date for Arabic users | PENDING |
| 213 | Bismillah before surahs | Add bismillah in Quran reading | PENDING |
| 214 | Quran completion celebration | Add khatm celebration | PENDING |
| 215 | Quran verse of the day | Add daily verse push notification | PENDING |
| 216 | Islamic milestone badges | Achievement badges for Islamic activities | PENDING |
| 279 | Islamic event reminders | Push notifications for key dates | PENDING |
| 280 | Community dhikr counter | Real-time community total | PENDING |
| 281 | Mosque prayer time integration | Follow mosque → get their times | PENDING |
| 184 | Time-based Islamic greeting | Sabah al-Khair / Masa al-Khair | PENDING |

## BATCH 7: Remaining UX & Polish (57 items)

Key items:
- Confirmation dialogs (225-228) — DONE in Batch 3
- Empty state edge cases (342-345) — verify 409 EmptyState usages
- Trust signals (287-295) — verification flow, member since
- Wellbeing (209, 311-316) — take a break (done), finite feed, bedtime mode
- Growth (326-329) — referral code, share app
- Behavioral tracking (297-302) — dwell time, DM shares, save signals

## Items NOT in this plan (blocked on external)

| # | Why |
|---|-----|
| 1 | Apple IAP — needs $99 Apple Developer enrollment |
| 2 | google-services.json — needs Firebase project |
| 41-57 | Competitor features — post-launch |
| 419-428 | AR/camera — needs SDK decision |
| 58 | Landing page — separate web project |
| 62-63 | Admin/moderation dashboard — separate web project |
| 142-143 | Cookie consent/DPA — web + legal |
| 229-232 | DSA/DMCA/law enforcement — legal process |
| 233-240 | Scale prep — infrastructure project |
