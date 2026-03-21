# Agent 72 — Dead Code, Unused Exports, Orphaned Files

**Scope:** Systematic audit of dead/unused code across entire codebase
**Areas:** Backend services, mobile services, components, hooks, utils, Prisma models, store exports
**Total findings: 198**

---

## CATEGORY 1: Orphaned Backend Module (Not Registered in AppModule)

### Finding 1.1 — `webhooks` module not imported in app.module.ts
- **File:** `apps/api/src/modules/webhooks/webhooks.module.ts` (line 1-11)
- **Also affects:** `webhooks.controller.ts`, `webhooks.service.ts`, `webhooks.service.spec.ts`, `webhooks.controller.spec.ts`
- **Total dead lines:** 422
- **Severity:** HIGH — The entire webhooks module (controller, service, specs) is built but never registered in `app.module.ts`. Its routes are unreachable. Note: there is a SEPARATE `WebhooksController` inside `apps/api/src/modules/auth/` that IS registered (handles Clerk webhooks). The standalone `modules/webhooks/` module provides community webhook CRUD + dispatch + HMAC-SHA256 delivery — all completely dead.
- **Code:** `WebhooksModule` exports `WebhooksService` (with `create`, `list`, `delete`, `test`, `deliver`, `dispatch` methods) but no module imports it.
- **Impact:** Community webhook feature is 100% non-functional. The `dispatch()` method (line 88) that fires events to subscribed webhooks is never called by any service.

### Finding 1.2 — Empty directory with curly-brace name
- **Path:** `apps/api/src/common/{guards,decorators,interceptors,pipes,filters}/`
- **Severity:** LOW — Accidental empty directory, likely from a botched shell glob expansion during scaffolding. Contains only `.` and `..`. Should be deleted.

---

## CATEGORY 2: Dead Backend Service Methods (77 methods)

Methods defined in service files but never called by any controller, other service, or gateway (excluding test files).

### 2.1 — admin.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 13 | `assertAdmin` | private | Helper that checks admin status — but no caller invokes it. Admin checks are done differently. |

### 2.2 — ai.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 49 | `callClaude` | private | Core Claude API call helper — but the public methods that should use it likely call the Anthropic SDK directly. Dead private method = wasted abstraction. |

### 2.3 — audio-rooms.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 421 | `startRecording` | public | Recording feature methods built but never exposed via controller |
| 433 | `stopRecording` | public | Same — no controller endpoint |
| 454 | `listRecordings` | public | Same |
| 465 | `getActiveRooms` | public | Discovery feature — no controller endpoint |
| 480 | `getUpcomingRooms` | public | Same |
| 500 | `createPersistentRoom` | public | Persistent room feature — no controller endpoint |

### 2.4 — audio-tracks.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 56 | `incrementUsage` | public | Track usage counter — never called |
| 60 | `decrementUsage` | public | Same |

### 2.5 — blocks.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 142 | `isBlocked` | public | **CRITICAL** — The check-if-blocked helper is never called by any feed, messaging, or content service. This means block status is never enforced in content filtering. |

### 2.6 — broadcast.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 250 | `requireRole` | private | Authorization helper for broadcast channels — dead |

### 2.7 — calls.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 116 | `missedCall` | public | Missed call tracking — no controller endpoint |
| 199 | `createGroupCall` | public | Group call creation — no controller endpoint |
| 226 | `shareScreen` | public | Screen sharing — no controller endpoint |
| 242 | `stopScreenShare` | public | Same |

### 2.8 — channels.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 432 | `fetchRecommendedChannels` | private | Recommendation logic built but never invoked |

### 2.9 — communities.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 72 | `checkUserPermission` | private | Permission helper — dead |
| 379 | `createRole` | public | Role CRUD — no controller endpoints |
| 392 | `updateRole` | public | Same |
| 399 | `deleteRole` | public | Same |
| 406 | `listRoles` | public | Same |
| 413 | `requireAdmin` | private | Admin check helper — dead |

### 2.10 — community.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 187 | `updateReputation` | public | Reputation system — no controller calls it |

### 2.11 — devices.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 90 | `touchSession` | public | Session heartbeat — never called |
| 109 | `cleanupStaleTokens` | public | Token cleanup (could be scheduled job but isn't) — never called |

### 2.12 — downloads.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 132 | `resolveMediaUrl` | private | URL resolver — dead |

### 2.13 — embeddings.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 40 | `generateEmbedding` | public | **CRITICAL** — Core embedding generation is never called outside this file. The entire embedding pipeline is wired but never triggered. |
| 77 | `generateBatchEmbeddings` | public | Same |
| 131 | `storeEmbedding` | public | Same — stores vectors via raw SQL but nothing invokes it |

### 2.14 — embedding-pipeline.service.ts (ALL methods dead)
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| All | `getEmbeddedIds` | public | Entire pipeline service is dead |
| All | `backfillPosts` | public | Same |
| All | `backfillReels` | public | Same |
| All | `backfillThreads` | public | Same |
| All | `backfillVideos` | public | Same |
| All | `embedNewContent` | public | Same — **213 lines of completely dead code** |

### 2.15 — encryption.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 136 | `notifyKeyChange` | private | Key change notification — dead |

### 2.16 — feed.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 91 | `getDismissedIds` | public | Feed dismissal tracking — built but unused |
| 96 | `getUserInterests` | public | Interest-based personalization — unused |
| 133 | `buildContentFilterWhere` | public | Content filter builder — unused |
| 290 | `getUserFollowingCount` | public | Following count helper — unused |
| 340 | `getFrequentCreatorIds` | public | Frequent creator detection — unused |

### 2.17 — follows.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 409 | `checkFollowing` | public | Follow check helper — never called by any other service |

### 2.18 — gamification.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 197 | `unlockAchievement` | public | Achievement unlock — no service/controller calls it |

### 2.19 — hashtags.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 154 | `fetchTrendingHashtags` | private | Trending logic — dead |
| 303 | `incrementCount` | public | Counter management — never called when posts are created |
| 311 | `decrementCount` | public | Same — never called on post deletion |
| 342 | `enrichReels` | private | Reel enrichment — dead |
| 400 | `enrichThreads` | private | Thread enrichment — dead |

### 2.20 — live.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 331 | `requireHost` | private | Host authorization — dead |

### 2.21 — messages.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 859 | `processExpiredMessages` | public | Expired message cleanup — **should be a scheduled job but nothing invokes it**. View-once / disappearing messages never actually expire. |

### 2.22 — moderation.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 114 | `flagContent` | public | Content flagging — no controller calls it |

### 2.23 — parental-controls.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 190 | `verifyPinForParent` | public | PIN verification — no controller endpoint |

### 2.24 — payments.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 37 | `getOrCreateStripeCustomer` | private | Stripe customer management — dead |
| 75 | `storePaymentIntentMapping` | private | Payment intent mapping — dead |
| 82 | `storeSubscriptionMapping` | private | Subscription mapping — dead |
| 90 | `getInternalSubscriptionId` | private | ID lookup — dead |
| 97 | `getStripeSubscriptionId` | private | ID lookup — dead |

### 2.25 — playlists.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 212 | `requireOwnerOrEditor` | private | Authorization — dead |

### 2.26 — posts.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 225 | `getTrendingFallback` | private | Trending fallback — dead |
| 265 | `getBlendedFeed` | private | Blended feed algorithm — dead |
| 329 | `getChronologicalFeed` | private | Chronological feed — dead |
| 371 | `getFavoritesFeed` | private | Favorites feed — dead |
| 1137 | `moderatePostImage` | private | Image moderation — dead |

### 2.27 — recommendations.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 189 | `multiStageRank` | private | Multi-stage ranking algorithm — dead |
| 265 | `getEngagementScores` | private | Engagement scoring — dead |
| 515 | `suggestedThreads` | public | Thread suggestions — no controller endpoint |

### 2.28 — reels.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 916 | `moderateReelThumbnail` | private | Thumbnail moderation — dead |

### 2.29 — restricts.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 89 | `isRestricted` | public | **CRITICAL** — The restrict-check helper is never called. Restricted users are never actually restricted in any feed or messaging flow. |

### 2.30 — retention.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 24 | `checkReelViewMilestone` | public | Milestone checking — dead |
| 54 | `getUsersWithExpiringStreaks` | public | Streak expiry detection — dead |
| 91 | `getSocialFomoTargets` | public | FOMO targeting — dead |
| 185 | `canSendNotification` | public | Notification throttle — dead |
| 200 | `trackNotificationSent` | public | Notification tracking — dead |
| 211 | `getWeeklySummary` | public | Weekly summary generation — dead |

### 2.31 — scheduling.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 177 | `findContent` | private | Content lookup — dead |

### 2.32 — settings.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 165 | `isQuietModeActive` | public | Quiet mode check — **should be called by notification service but isn't**. Quiet mode is decorative. |

### 2.33 — stickers.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 308 | `generateStickerSVG` | private | AI sticker generation — dead |

### 2.34 — stories.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 153 | `moderateStoryImage` | private | Image moderation — dead |

### 2.35 — stream.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 79 | `getPlaybackUrls` | public | Cloudflare Stream playback — no controller endpoint |

### 2.36 — telegram-features.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 223 | `logAdminAction` | public | Admin action logging — never called by controller |

### 2.37 — threads.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 237 | `getTrendingThreads` | private | Trending thread algorithm — dead |
| 289 | `getBlendedThreadFeed` | private | Blended feed — dead |

### 2.38 — thumbnails.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 121 | `checkForWinner` | private | A/B thumbnail winner detection — dead |

### 2.39 — videos.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 83 | `enhanceVideos` | private | Video enrichment — dead |
| 857 | `getChapters` | public | Chapter retrieval — no controller endpoint |
| 864 | `parseChaptersFromDescription` | public | Chapter parsing — no controller endpoint |

### 2.40 — webhooks.service.ts
| Line | Method | Visibility | Notes |
|------|--------|-----------|-------|
| 88 | `dispatch` | public | Event dispatch to webhooks — **this is the core method that should fire webhooks on events but nothing calls it** |

---

## CATEGORY 3: Dead Methods in Secondary/Common Services (17 methods)

### 3.1 — islamic-notifications.service.ts
| Method | Notes |
|--------|-------|
| `isInPrayerDND` | Prayer DND check — dead |
| `queueNotificationForAfterPrayer` | Delayed notification — dead |
| `shouldShowPrayFirstNudge` | Nudge logic — dead |
| `getJummahReminder` | Friday reminder — dead |
| `getRamadanStatus` | Ramadan status — dead |
| `categorizeIslamicContent` | Content categorization — dead |

### 3.2 — quran-metadata.ts
| Method | Notes |
|--------|-------|
| `getJuzForSurah` | Juz lookup — dead |

### 3.3 — analytics.service.ts
| Method | Notes |
|--------|-------|
| `flush` | Analytics buffer flush — dead |

### 3.4 — async-jobs.service.ts
| Method | Notes |
|--------|-------|
| `executeWithRetry` | Retry execution — dead |

### 3.5 — email.service.ts (4 of 5 send methods dead)
| Method | Notes |
|--------|-------|
| `initResend` | Resend initialization — dead |
| `sendWelcome` | Welcome email — dead |
| `sendSecurityAlert` | Security alert email — dead |
| `sendWeeklyDigest` | Weekly digest — dead |
| `sendCreatorWeeklySummary` | Creator summary — dead |

### 3.6 — feature-flags.service.ts
| Method | Notes |
|--------|-------|
| `getFlagValue` | Flag value retrieval — dead |

### 3.7 — job-queue.service.ts
| Method | Notes |
|--------|-------|
| `addJob` | Job enqueue — dead |
| `promoteDelayedJobs` | Delayed job promotion — dead |

### 3.8 — personalized-feed.service.ts
| Method | Notes |
|--------|-------|
| `getColdStartFeed` | Cold-start algorithm — dead |
| `getIslamicEditorialPicks` | Editorial picks — dead |
| `getContentMetadata` | Metadata builder — dead |

### 3.9 — content-safety.service.ts (ALL methods dead)
| Method | Notes |
|--------|-------|
| `moderateText` | Text moderation — dead |
| `checkForwardLimit` | Forward limit check — dead |
| `incrementForwardCount` | Forward counter — dead |
| `autoRemoveContent` | Auto-removal — dead |
| `checkViralThrottle` | Viral throttle — dead |
| `trackShare` | Share tracking — dead |

### 3.10 — stripe-connect.service.ts (ALL methods dead)
| Method | Notes |
|--------|-------|
| `createConnectedAccount` | Connected account creation — dead |
| `getRevenueDashboard` | Revenue dashboard — dead |

### 3.11 — push.service.ts
| Method | Notes |
|--------|-------|
| `sendBatch` | Batch push send — dead |
| `handlePushResponse` | Push response handler — dead |
| `deactivateTokens` | Token deactivation — dead |
| `getUnreadCountForUser` | Unread count — dead |

### 3.12 — push-trigger.service.ts
| Method | Notes |
|--------|-------|
| `sendSafe` | Safe send wrapper — dead |

### 3.13 — meilisearch.service.ts
| Method | Notes |
|--------|-------|
| `addDocuments` | Document indexing — dead |
| `deleteDocument` | Document deletion — dead |
| `createIndex` | Index creation — dead |
| `updateSettings` | Settings update — dead |

---

## CATEGORY 4: Dead Common Infrastructure Exports (10 items)

### 4.1 — `apps/api/src/common/utils/image.ts`
| Export | Notes |
|--------|-------|
| `ImageTransformOptions` | Type — never used |
| `getImageUrl` | Image URL builder — never called |

### 4.2 — `apps/api/src/common/pipes/sanitize.pipe.ts`
| Export | Notes |
|--------|-------|
| `SanitizePipe` | NestJS pipe — built but never used in any controller |

### 4.3 — `apps/api/src/common/dto/api-responses.dto.ts` (ALL exports dead)
| Export | Notes |
|--------|-------|
| `ApiSuccessResponse` | Standard response DTO — never used |
| `PaginatedMeta` | Pagination meta DTO — never used |
| `ApiPaginatedResponse` | Paginated response DTO — never used |
| `ApiErrorResponse` | Error response DTO — never used |
| `ApiUnauthorizedResponse` | 401 response DTO — never used |
| `ApiNotFoundResponse` | 404 response DTO — never used |
| `ApiConflictResponse` | 409 response DTO — never used |

### 4.4 — `apps/api/src/common/sentry.config.ts`
| Export | Notes |
|--------|-------|
| `captureMessage` | Sentry message capture — never called |

---

## CATEGORY 5: Never-Queried Prisma Models (3 models)

### Finding 5.1 — `CollabInvite`
- **Location:** `apps/api/prisma/schema.prisma`
- **Severity:** MEDIUM — Model defined in schema but never queried via `prisma.collabInvite` or raw SQL anywhere in the codebase. The `collabs` module exists and handles collaborations, but the invitation model is never used.

### Finding 5.2 — `PostProductTag`
- **Location:** `apps/api/prisma/schema.prisma`
- **Severity:** MEDIUM — Model defined for tagging products in posts but never queried. The commerce module exists but product tagging on posts is not implemented.

### Finding 5.3 — `VideoInteraction`
- **Location:** `apps/api/prisma/schema.prisma`
- **Severity:** MEDIUM — Model for tracking video interactions but never queried. Video engagement is tracked through other models (VideoReaction, VideoBookmark, etc.) making this model redundant.

---

## CATEGORY 6: Orphaned Mobile Components (20 files, 4,693 lines)

### 6.1 — Top-level orphaned components (never imported anywhere)

| File | Lines | Description |
|------|-------|-------------|
| `apps/mobile/src/components/AlgorithmCard.tsx` | 131 | Algorithm explanation card for feed transparency — never rendered |
| `apps/mobile/src/components/ContactMessage.tsx` | 212 | Contact sharing message bubble — never rendered |
| `apps/mobile/src/components/GiftOverlay.tsx` | 181 | Gift animation overlay — never rendered |
| `apps/mobile/src/components/LocationMessage.tsx` | 145 | Location sharing message bubble — never rendered |
| `apps/mobile/src/components/PinnedMessageBar.tsx` | 159 | Pinned message indicator bar — never rendered |
| `apps/mobile/src/components/ReminderButton.tsx` | 117 | Post/event reminder button — never rendered |
| `apps/mobile/src/components/VideoReplySheet.tsx` | 450 | Video reply bottom sheet — never rendered |
| `apps/mobile/src/components/ViewOnceMedia.tsx` | 429 | View-once media viewer — never rendered |

### 6.2 — Orphaned UI components (under `components/ui/`)

| File | Lines | Description |
|------|-------|-------------|
| `apps/mobile/src/components/ui/AuthGate.tsx` | 174 | Authentication gate wrapper — built, never used in any screen |
| `apps/mobile/src/components/ui/DoubleTapHeart.tsx` | 157 | Instagram-style double-tap heart animation — never used |
| `apps/mobile/src/components/ui/EndScreenOverlay.tsx` | 193 | YouTube-style end screen overlay — never used |
| `apps/mobile/src/components/ui/PremiereCountdown.tsx` | 223 | Video premiere countdown — never used |
| `apps/mobile/src/components/ui/TabBarIndicator.tsx` | 67 | Tab bar active indicator — never used |
| `apps/mobile/src/components/ui/ToastNotification.tsx` | 155 | Toast notification component — **built but never imported. Previous audit agent #24 flagged this.** |

### 6.3 — Orphaned story components

| File | Lines | Description |
|------|-------|-------------|
| `apps/mobile/src/components/story/AddYoursSticker.tsx` | 197 | "Add Yours" story sticker — not in story/index.ts barrel, never imported |
| `apps/mobile/src/components/story/LinkSticker.tsx` | 157 | Link sticker for stories — not in story/index.ts barrel, never imported |

### 6.4 — Orphaned editor components (entire directory dead)

| File | Lines | Description |
|------|-------|-------------|
| `apps/mobile/src/components/editor/VideoTimeline.tsx` | 274 | Video editing timeline — never imported from any screen |
| `apps/mobile/src/components/editor/VideoTransitions.tsx` | 120 | Video transition effects — never imported from any screen |

### 6.5 — Orphaned risalah components (mutual reference only)

| File | Lines | Description |
|------|-------|-------------|
| `apps/mobile/src/components/risalah/StickerPicker.tsx` | 471 | Sticker picker for messaging — StickerPackBrowser references it internally, but neither is imported from any screen |
| `apps/mobile/src/components/risalah/StickerPackBrowser.tsx` | 681 | Sticker pack browser — never imported. The `sticker-browser.tsx` screen uses `stickersApi` directly, not this component. |

---

## CATEGORY 7: Orphaned Mobile Hooks (6 hooks, 352 lines)

| File | Lines | Description |
|------|-------|-------------|
| `apps/mobile/src/hooks/useBackgroundUpload.ts` | 91 | Background upload queue — built, never imported |
| `apps/mobile/src/hooks/useFpsMonitor.ts` | 54 | FPS monitoring for debug — never imported |
| `apps/mobile/src/hooks/useIsWeb.ts` | 16 | Web platform check — never imported (WebLayout uses Platform.OS directly) |
| `apps/mobile/src/hooks/usePayment.ts` | 121 | Payment flow hook (wraps paymentsApi) — never imported from any screen |
| `apps/mobile/src/hooks/usePulseGlow.ts` | 41 | Animated pulse glow effect — never imported |
| `apps/mobile/src/hooks/useReducedMotion.ts` | 45 | Reduced motion accessibility — never imported. Exports `useReducedMotion` and `useAccessibleAnimation`, both dead. |

---

## CATEGORY 8: Orphaned Mobile Services (3 files, 561 lines)

### Finding 8.1 — `pushNotifications.ts` (292 lines)
- **File:** `apps/mobile/src/services/pushNotifications.ts`
- **Severity:** HIGH — Exports `registerForPushNotifications()` but it is never imported by any file. The actual push notification setup is done in `usePushNotifications` hook which calls `expo-notifications` directly. This file is completely dead.

### Finding 8.2 — `offlineCache.ts` (156 lines)
- **File:** `apps/mobile/src/services/offlineCache.ts`
- **Severity:** MEDIUM — Exports `offlineCache` and `withOfflineCache` — neither is imported anywhere. The entire offline caching layer is built but unwired.

### Finding 8.3 — `downloadManager.ts` (113 lines)
- **File:** `apps/mobile/src/services/downloadManager.ts`
- **Severity:** MEDIUM — Exports `startDownload`, `clearActiveDownload`, `getLocalUri`. The `downloads.tsx` screen has a comment referencing it (`// pause / resume / retry would call the downloadManager service`) but never actually imports it. The download feature is UI-only.

---

## CATEGORY 9: Orphaned Mobile Utils (10 files, 882 lines)

| File | Lines | Description |
|------|-------|-------------|
| `apps/mobile/src/utils/deepLinking.ts` | 291 | Deep link parser + navigator — **ALL exports dead**: `DeepLinkScreen`, `DeepLinkParams`, `ParsedDeepLink`, `parseDeepLink`, `getDeepLinkUrl`, `navigateToDeepLink`, `setupDeepLinkListeners`. Previous audit agent #22 flagged this. |
| `apps/mobile/src/utils/lazily.ts` | 36 | Lazy component loader — `lazily` and `LazyBoundary` both dead |
| `apps/mobile/src/utils/localeFormat.ts` | 96 | Locale-aware number/date formatting — `formatCompactNumber` and `formatRelativeTime` both dead. Previous audit agent #26 flagged this. |
| `apps/mobile/src/utils/navigation.ts` | 45 | Navigation helpers — `navigateReplace` dead |
| `apps/mobile/src/utils/offlineQueue.ts` | 102 | Offline action queue — `offlineQueue` dead |
| `apps/mobile/src/utils/performance.ts` | 101 | Performance monitoring — ALL exports dead: `perfStart`, `perfEnd`, `perfAverage`, `perfGetAll`, `usePerfTracking` |
| `apps/mobile/src/utils/platform.ts` | 102 | Platform detection — ALL exports dead: `isNative`, `isIOS`, `isAndroid` |
| `apps/mobile/src/utils/registerServiceWorker.ts` | 48 | Service worker registration (web) — `registerServiceWorker` dead |
| `apps/mobile/src/utils/sentry.ts` | 61 | Sentry error capture — `captureMessage` dead (mobile-side) |

### Partially-dead utils:
| File | Dead Exports | Live Exports |
|------|-------------|-------------|
| `apps/mobile/src/utils/blurhash.ts` | `getPlaceholder`, `blurhashPlaceholder` | other exports used by Avatar |
| `apps/mobile/src/utils/image.ts` | `optimizedImageUrl` | other exports used by Avatar |
| `apps/mobile/src/utils/rtl.ts` | `rtlPadding`, `rtlIcon`, `rtlWritingDirection`, `forceRTLLayout`, `rtlStyle`, `rtlAlignSelf` | `isRTL` and `rtlFlexDirection` used by AuthGate, TTSMiniPlayer |

---

## CATEGORY 10: Unused Mobile API Service Exports (7 objects from api.ts)

These are entire API namespace objects defined in `apps/mobile/src/services/api.ts` that are exported but never imported by any screen, hook, or component.

| Export | Approx lines | Description |
|--------|-------------|-------------|
| `adminApi` | ~14 | Admin panel API (reports, bans, stats) — no admin screens import it |
| `recommendationsApi` | ~5 | Recommendation endpoints — no screen imports it |
| `schedulingApi` | ~7 | Schedule post endpoints — no screen imports it |
| `pollsApi` | ~7 | Poll CRUD endpoints — no screen imports it |
| `storiesReactionsApi` | ~5 | Story reaction endpoints — no screen imports it |
| `moderationApi` | ~10 | Moderation endpoints — no screen imports it |
| `watchHistoryApi` | ~5 | Watch history endpoints — no screen imports it |

Additional unused exports from specialized service files:
| File | Dead Exports |
|------|-------------|
| `chatExportApi.ts` | `ChatExportResult` (type) |
| `downloadManager.ts` | `DownloadProgress`, `clearActiveDownload`, `getLocalUri` |
| `giftsApi.ts` | `GiftBalance` (type) |
| `offlineCache.ts` | `offlineCache`, `withOfflineCache` |
| `widgetData.ts` | `PrayerTimesWidgetData`, `UnreadWidgetData` (types) |

---

## CATEGORY 11: Unused Zustand Store Exports (29 selectors)

These selector hooks are exported from `apps/mobile/src/store/index.ts` but never imported by any screen or component:

| Selector | Description |
|----------|-------------|
| `useTheme` | Theme selector |
| `useUnreadNotifications` | Unread notification count |
| `useUnreadMessages` | Unread message count |
| `useFollowedHashtags` | Followed hashtag list |
| `useActiveCallId` | Active call ID |
| `useActiveLiveSessionId` | Active live session ID |
| `useIsLiveStreaming` | Live streaming flag |
| `useRecentStickerPackIds` | Recent sticker packs |
| `useMutedChannelIds` | Muted channels |
| `useFeedDismissedIds` | Dismissed feed items |
| `useSearchHistory` | Search history |
| `useArchivedConversationsCount` | Archived conversations |
| `useIsRecording` | Recording flag |
| `useMiniPlayerVideo` | Mini player video ID |
| `useMiniPlayerProgress` | Mini player progress |
| `useMiniPlayerPlaying` | Mini player playing flag |
| `useNasheedMode` | Nasheed mode flag |
| `useBiometricLockEnabled` | Biometric lock flag |
| `useScreenTimeSessionStart` | Screen time session |
| `useScreenTimeLimitMinutes` | Screen time limit |
| `useAutoPlaySetting` | Auto-play setting |
| `useDownloadQueue` | Download queue |
| `useIsPiPActive` | PiP active flag |
| `usePiPVideoId` | PiP video ID |
| `useAmbientModeEnabled` | Ambient mode flag |
| `useIsChildAccount` | Child account flag |
| `useParentalRestrictions` | Parental restrictions |
| `useIslamicThemeEnabled` | Islamic theme flag |
| `useTTSActive` | TTS active flag |
| `useTTSPlaying` | TTS playing flag |

---

## CATEGORY 12: Unused Theme/Style Exports

| File | Dead Exports |
|------|-------------|
| `apps/mobile/src/theme/highContrast.ts` | `highContrastColors`, `getAccessibleColor` — high contrast mode is built but never wired |
| `apps/mobile/src/theme/islamicThemes.ts` | `IslamicThemeName` (type) |

---

## SUMMARY STATISTICS

| Category | Count | Dead Lines (est.) |
|----------|-------|-------------------|
| Orphaned backend module (webhooks) | 1 module (5 files) | 422 |
| Dead backend service methods | 77 methods | ~2,300 |
| Dead secondary/common service methods | 17+ methods | ~600 |
| Dead common infrastructure exports | 10 | ~200 |
| Never-queried Prisma models | 3 | ~60 |
| Orphaned mobile components | 20 files | 4,693 |
| Orphaned mobile hooks | 6 files | 352 |
| Orphaned mobile services | 3 files | 561 |
| Orphaned mobile utils | 10 files | 882 |
| Unused API service exports | 7 objects + 7 types | ~70 |
| Unused Zustand store selectors | 29 selectors | ~145 |
| Unused theme exports | 3 | ~30 |
| Empty accidental directory | 1 | 0 |
| **TOTAL** | **198 findings** | **~10,315 dead lines** |

---

## CRITICAL FINDINGS (Functional Impact)

1. **`blocks.isBlocked()` is dead** (Finding 2.5) — Block enforcement is never checked in feeds, messaging, or content. Blocked users see each other's content.

2. **`restricts.isRestricted()` is dead** (Finding 2.29) — Restrict feature is completely non-functional. Previous audit agent #4 also found this.

3. **Entire embedding pipeline is dead** (Findings 2.13, 2.14) — `generateEmbedding`, `generateBatchEmbeddings`, `storeEmbedding`, and all 6 pipeline methods are never called. The recommendation system has no embeddings.

4. **`messages.processExpiredMessages()` is dead** (Finding 2.21) — Disappearing/view-once messages never actually expire or get cleaned up.

5. **`settings.isQuietModeActive()` is dead** (Finding 2.32) — Quiet mode setting exists but notifications are never suppressed.

6. **All email send methods are dead** (Finding 3.5) — Welcome emails, security alerts, weekly digests — none are ever sent.

7. **Entire `content-safety.service.ts` is dead** (Finding 3.9) — Text moderation, forward limits, viral throttling, auto-removal — all built, all dead.

8. **All Meilisearch management methods are dead** (Finding 3.13) — `addDocuments`, `deleteDocument`, `createIndex`, `updateSettings` — search indexing pipeline is unwired.

9. **`webhooks.dispatch()` is dead** (Finding 2.40) — Community webhook events are never fired to subscribers.

10. **`hashtags.incrementCount`/`decrementCount` are dead** (Finding 2.19) — Hashtag post counts are never updated when posts are created or deleted.
