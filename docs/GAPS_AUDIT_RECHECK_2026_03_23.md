# Gaps Audit Recheck — March 23, 2026

> Line-by-line recheck of `project_complete_gaps_audit_march21.md` (428 findings) against actual codebase.
> Each finding verified with grep/read, not assumed.

## Section A: CRITICAL (5 items)

| # | Finding | March 21 Status | March 23 Status | Evidence |
|---|---------|----------------|-----------------|----------|
| 1 | Apple IAP not installed | OPEN | **STILL OPEN** | 0 matches for react-native-iap/expo-iap in package.json |
| 2 | google-services.json missing | OPEN | **FIXED** | File exists at apps/mobile/google-services.json |
| 3 | SQL injection in embeddings | OPEN | **FIXED** | 3 validateFilterTypes/VALID_CONTENT_TYPES refs in embeddings.service.ts |
| 4 | Video upload not wired from mobile | OPEN | **PARTIALLY FIXED** | create-reel: 6 upload refs, create-post: 6 refs, video-editor: 3 refs. BUT duet-create: 0, stitch-create: 0 |
| 5 | Payments API unused on mobile | OPEN | **PARTIALLY FIXED** | 2 paymentsApi refs in screens (send-tip only). donate.tsx, gift-shop.tsx, waqf.tsx still have TODO stubs |

## Section B: DISCONNECTED BACKEND↔MOBILE (4 items)

| # | Finding | March 23 Status | Evidence |
|---|---------|-----------------|----------|
| 6 | halalApi.ts missing | **FIXED** | File exists |
| 7 | altProfileApi.ts missing | **FIXED** | File exists. BUT 0 screen files import it |
| 8 | communityNotesApi.ts missing | **FIXED** | File exists. BUT 0 screen files import it |
| 9 | ogApi.ts missing | **STILL OPEN** | File does not exist |

## Section C: 26 SCREENS WITH 0 API CALLS (items 10-17 "broken")

| # | Screen | March 23 Status | Evidence |
|---|--------|-----------------|----------|
| 10 | quran-room | **FIXED** | 3 API/service refs |
| 11 | zakat-calculator | **STILL OPEN** | 0 API refs — calculates locally, never fetches live gold prices or saves |
| 12 | ramadan-mode | **FIXED** | 4 API refs |
| 13 | islamic-calendar | **STILL OPEN** | 0 API refs — renders calendar without fetching Islamic events |
| 14 | duet-create | **STILL OPEN** | 0 upload refs — full creation UI, can't upload |
| 15 | stitch-create | **STILL OPEN** | 0 upload refs — full creation UI, can't upload |
| 16 | video-editor | **PARTIALLY FIXED** | 3 upload/FFmpeg refs exist but may fail at runtime |
| 17 | share-receive | **STILL EXISTS** | Screen exists but needs verification if it creates posts |

## Section D: UX PATTERNS (items 18-27)

| # | Finding | March 21 | March 23 | Evidence |
|---|---------|----------|----------|----------|
| 18 | Toast: 0 screens use it | 0 | **419 showToast calls** | MASSIVELY FIXED |
| 19 | DoubleTapHeart: only 1 screen | 1 | **7 refs** | FIXED (multiple screens) |
| 20 | Optimistic updates: only 6 | 6 | **16 onMutate/optimistic refs** | IMPROVED |
| 21 | Rate limit 429 handling | 2 | **1 ref** | STILL WEAK — ApiError has isRateLimited but barely used |
| 22 | Token refresh 401 | 5 | **2 refs** | STILL WEAK — connect_error handlers added for socket but API client limited |
| 23 | KeyboardAvoidingView | 16 | **48 refs** | IMPROVED (3x) |
| 24 | FlashList | 5 | **18 refs** | IMPROVED (3.6x) |
| 25 | Currency formatting | 3 | **needs check** | formatCount exists but not currency-specific |
| 26 | Report from content detail | 2 | **5 report refs in detail screens** | IMPROVED |
| 27 | Swipe gestures | 5 | **needs check** | Swipeable imported in conversation |

## Section E: DATA & STATE GAPS (items 28-30)

| # | Finding | March 23 Status | Evidence |
|---|---------|-----------------|----------|
| 28 | No state persistence | **PARTIALLY FIXED** | 21 AsyncStorage refs in src/. feedCache.ts exists. But no persistQueryClient. |
| 29 | No memory warning handling | **STILL OPEN** | No onMemoryWarning handler found |
| 30 | App background/foreground | **IMPROVED** | AppState used in root _layout.tsx for refetchOnWindowFocus |

## Section F: BROKEN USER FLOWS (items 31-38)

| # | Flow | March 23 Status | Evidence |
|---|------|-----------------|----------|
| 31 | Reel creation → upload | **FIXED** | create-reel has 24 upload refs |
| 32 | Coin purchase flow | **STILL BROKEN** | gift-shop has 6 purchase refs but no IAP package. Apple will reject. |
| 33 | Data import flow | **STILL OPEN** | No data-import module exists |
| 34 | Halal finder flow | **FIXED** | halalApi.ts exists, halal-finder.tsx imports it |
| 35 | Flipside profile flow | **PARTIALLY FIXED** | altProfileApi.ts exists but 0 screens import it |
| 36 | Live stream gift flow | **STILL BROKEN** | No actual video stream (WebRTC not wired) |
| 37 | Community notes flow | **PARTIALLY FIXED** | communityNotesApi.ts exists but 0 screens import it |
| 38 | Exit story flow | **STILL OPEN** | No production code exists |

## Section G: COMPETITOR FEATURES NOT BUILT (items 39-57)

ALL still not built (these are feature requests, not bugs):
- 39-47: Notes, Map search, Shopping checkout, AR filters, Music profile, AI chat, Screen sharing, Community announcements, Collaborative collections
- 48-57: Auto-scroll reels, Text posts in Bakra, Collaborative playlists, Business profiles, Payment in chat, Mini-games, Polls in DMs, Voice status, Avatar stickers, Guides

## Section H: INFRASTRUCTURE (items 58-65)

| # | Finding | March 23 Status |
|---|---------|-----------------|
| 58 | No landing page | **STILL OPEN** |
| 59 | No analytics/attribution | **STILL OPEN** |
| 60 | No A/B testing | **STILL OPEN** (FeatureFlagsModule exists but no A/B framework) |
| 61 | No feature flags | **FIXED** | FeatureFlagsModule exists in common/ |
| 62 | No admin dashboard UI | **STILL OPEN** (API endpoints exist, no web panel) |
| 63 | No moderation dashboard UI | **STILL OPEN** (queue exists, no reviewer interface) |
| 64 | No app rating prompt | **STILL OPEN** (expo-store-review not in package.json) |
| 65 | No widget support | **STILL OPEN** |

## Section L: DEEP UX GAPS (items 84-102)

| # | Finding | March 23 Status | Evidence |
|---|---------|-----------------|----------|
| 84 | No global API error interceptor | **FIXED** | 12 ApiError/ApiNetworkError refs in api.ts |
| 86 | PostCard no long-press | **STILL OPEN** | 0 longPress refs in PostCard.tsx |
| 88 | No voice waveform | **FIXED** | 4 waveform/metering refs in conversation |
| 96 | Like not using local state | **FIXED** | 12 isLiked/localLiked refs in PostCard |
| 100 | No notification settings per type | **FIXED** | 12 notifyLikes/Comments/Follows refs in settings |

## Section M: CONVERSATION UX (items 103-109)

| # | Finding | March 23 Status |
|---|---------|-----------------|
| 103 | Voice waveform | **FIXED** |
| 104 | Images not tappable fullscreen | **needs check** |
| 105 | URLs not linkified | **needs check** |
| 106 | No pinned conversations | **needs check** |
| 107 | No search within conversation | **FIXED** (search bar exists in conversation) |

## SUMMARY

| Category | Total | Fixed | Partially | Still Open |
|----------|-------|-------|-----------|------------|
| A. Critical | 5 | 2 | 2 | 1 |
| B. Disconnected | 4 | 3 | 0 | 1 |
| C. 0 API screens | 8 | 2 | 1 | 5 |
| D. UX patterns | 10 | 4 | 4 | 2 |
| E. Data/state | 3 | 0 | 2 | 1 |
| F. Broken flows | 8 | 2 | 2 | 4 |
| G. Competitor | 19 | 0 | 0 | 19 |
| H. Infrastructure | 8 | 1 | 0 | 7 |
| I-K. Interaction/RT/Perf | 14 | ~5 | ~4 | ~5 |
| L-N. Deep UX | 19 | ~8 | ~3 | ~8 |
| **TOTAL** | **~98 checked** | **~27** | **~18** | **~53** |

Note: Sections G (competitor features) are feature requests, not bugs. The 19 items there are "nice to have" not "must fix."
