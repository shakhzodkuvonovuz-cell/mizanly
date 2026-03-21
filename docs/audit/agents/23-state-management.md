# Agent 23 — Mobile State Management Audit

**Scope:** Zustand store, all 19 API service files, React Query usage patterns across 147+ screens
**Files audited:** `apps/mobile/src/store/index.ts`, `apps/mobile/src/services/*.ts` (19 files), `apps/mobile/app/_layout.tsx`, 147 screens using React Query
**Total findings: 38**

---

## CRITICAL (P0) — Ship Blockers

### F01. No HTTP status code differentiation in API client
- **File:** `apps/mobile/src/services/api.ts`, lines 157-161
- **Severity:** P0
- **Category:** Error Handling
- **Description:** The `request()` method throws a generic `Error` for ALL non-OK responses. No distinction between 401 (auth expired), 403 (forbidden), 429 (rate-limited), 500 (server error), or network errors. Every screen that catches errors gets an opaque string like "Unauthorized" or "Too Many Requests" with no ability to react differently (e.g., force re-auth on 401, show retry countdown on 429, show offline fallback on network error).
- **Code:**
  ```ts
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }
  ```
- **Impact:** App cannot auto-refresh expired tokens, cannot show rate-limit UI, cannot differentiate server downtime from auth failure. Users see unhelpful "Request failed" alerts.

### F02. 7 screens use raw `fetch()` without auth headers — always 401 or unauthenticated
- **File:** Multiple screens
- **Severity:** P0
- **Category:** Auth / Security
- **Description:** These screens bypass the `api` client entirely and use raw `fetch()` without `Authorization` headers. All POST/PATCH/DELETE calls will fail with 401 on any protected endpoint. GET calls on protected endpoints will also fail.
- **Affected screens:**
  1. `apps/mobile/app/(screens)/chat-folders.tsx` lines 38, 45, 62 — GET/POST/DELETE to `/chat-folders` with no auth
  2. `apps/mobile/app/(screens)/saved-messages.tsx` lines 29, 55, 72, 83 — GET/POST/DELETE/PATCH to `/saved-messages` with no auth
  3. `apps/mobile/app/(screens)/fatwa-qa.tsx` lines 47, 58 — GET/POST to `/fatwa` with no auth
  4. `apps/mobile/app/(screens)/local-boards.tsx` line 32 — GET to `/boards` with no auth
  5. `apps/mobile/app/(screens)/waqf.tsx` line 29 — GET to `/waqf` with no auth
  6. `apps/mobile/app/(screens)/watch-party.tsx` lines 35, 42 — GET/POST to `/watch-parties` with no auth
  7. `apps/mobile/app/(screens)/mentorship.tsx` line 47 — uses `getToken()` which always returns `''` (empty string, line 206-208)
- **Impact:** 7 entire features are completely non-functional for authenticated users. Chat folders, saved messages, fatwa Q&A, local boards, waqf, watch parties, and mentorship are all dead screens that silently fail or return empty data.

### F03. `offlineCache` module built but never imported anywhere
- **File:** `apps/mobile/src/services/offlineCache.ts` (157 lines)
- **Severity:** P0
- **Category:** Dead Code / Missing Feature
- **Description:** A complete offline caching layer with stale-while-revalidate semantics, TTL management, and an HOF wrapper (`withOfflineCache`) was built but is not imported by any screen or service. Zero files import `offlineCache` or `withOfflineCache`. The app has zero offline support despite claiming to have it.
- **Impact:** 157 lines of dead code. No API responses are cached for offline use. The `isOffline` state in the Zustand store is set but nothing consumes it to serve cached data.

### F04. Zustand `logout()` function exists but is never called
- **File:** `apps/mobile/src/store/index.ts`, lines 151, 320-346
- **Severity:** P0
- **Category:** Auth / Data Leak
- **Description:** The store has a comprehensive `logout()` action that resets user, notifications, messages, call state, live streaming state, stickers, feed dismissals, search history, download queue, parental controls, TTS state, etc. However, no screen or component ever calls this function. The settings screen sign-out (`settings.tsx` line 211) just calls `signOut()` from Clerk without clearing the Zustand store. The account-switcher screen clears the React Query cache but not the Zustand store.
- **Impact:** After sign-out, the next user who signs in sees the previous user's notification counts, feed preferences, search history, download queue, active call state, and potentially parental control settings. This is a data leak between user sessions.

---

## HIGH (P1) — Critical Bugs

### F05. Query key mismatch: story creation doesn't invalidate story feed
- **File:** `apps/mobile/app/(screens)/create-story.tsx` line 313 vs `apps/mobile/app/(tabs)/saf.tsx` line 248
- **Severity:** P1
- **Category:** Query Key Inconsistency
- **Description:** Creating a story invalidates `['stories']` but the Saf tab's stories feed query uses `['stories-feed']`. These are different query key prefixes. TanStack Query's prefix matching means `['stories']` would match `['stories-feed']` only if `['stories']` is a prefix of `['stories-feed']`, which it IS because `invalidateQueries` uses partial matching. However, this relies on implicit behavior and is fragile. More critically, after creating a story, the user navigates back to Saf but the story may take up to 5 minutes (staleTime) to appear since the invalidation key doesn't exactly match.
- **Actual Impact:** Prefix matching saves this from being broken, but the inconsistent naming is a maintenance hazard. Other screens referencing `['stories', 'archive', userId]` work correctly because they include the prefix.

### F06. Follow mutation in Bakra invalidates wrong query key
- **File:** `apps/mobile/app/(tabs)/bakra.tsx` line 132
- **Severity:** P1
- **Category:** Query Key Inconsistency
- **Description:** When a user follows someone from the Bakra (reels) tab, the mutation invalidates `['reels']` but the reels feed query key is `['reels-feed']` (line 482). `['reels']` is NOT a prefix of `['reels-feed']`, so the invalidation is a no-op. The feed is not refreshed after following someone.
- **Code:**
  ```ts
  // Line 132 — invalidates wrong key
  queryClient.invalidateQueries({ queryKey: ['reels'] });
  // Line 482 — actual query key
  queryKey: ['reels-feed'],
  ```
- **Impact:** After following a creator from Bakra, their content doesn't appear until manual refresh or app restart.

### F07. No `refetchOnFocus` configured anywhere in the app
- **File:** `apps/mobile/app/_layout.tsx`, all screens
- **Severity:** P1
- **Category:** Stale Data
- **Description:** Zero usage of `refetchOnFocus`, `refetchOnMount: 'always'`, or `refetchOnWindowFocus` across the entire codebase. The global `staleTime` is 5 minutes. When a user navigates away from a screen and returns, they see stale data for up to 5 minutes. The `AppStateHandler` only invalidates stale queries when the app comes to foreground from background, not when navigating between screens.
- **Impact:** Users see stale notification counts, message lists, feed content, and profile data when navigating between screens.

### F08. `paymentsApi.ts` is completely orphaned — never imported by any screen
- **File:** `apps/mobile/src/services/paymentsApi.ts` (32 lines)
- **Severity:** P1
- **Category:** Dead Code / Missing Integration
- **Description:** The Stripe payments API service (`paymentsApi`) with `createPaymentIntent`, `createSubscription`, `cancelSubscription`, `getPaymentMethods`, and `attachPaymentMethod` is never imported by any screen component. All payment-related screens (gift-shop, send-tip, membership-tiers, etc.) either use other APIs or bypass payment entirely.
- **Impact:** Stripe payment integration exists on backend but is completely disconnected from the mobile app. No screen can process real payments.

### F09. Main tab screens have zero error state handling
- **File:** `apps/mobile/app/(tabs)/saf.tsx`, `bakra.tsx`, `majlis.tsx`, `risalah.tsx`, `minbar.tsx`
- **Severity:** P1
- **Category:** Error Handling
- **Description:** None of the 5 main tab screens check for `isError`, display error states, or offer retry actions when the feed/conversation queries fail. They only handle loading states (with Skeleton) and empty states (with EmptyState). If the API is down, users see perpetual loading or empty content with no indication of what went wrong.
- **Impact:** Server outages, network errors, or auth issues result in blank screens with no user feedback on the most important screens in the app.

### F10. Sign-out doesn't clear React Query cache in most flows
- **File:** `apps/mobile/app/(screens)/settings.tsx` line 211, `account-settings.tsx` line 100
- **Severity:** P1
- **Category:** Data Leak
- **Description:** The main sign-out flow in `settings.tsx` calls `signOut()` from Clerk but does NOT call `queryClient.clear()`. Only `account-switcher.tsx` clears the query cache (line 121, 150). The settings screen sign-out leaves the entire React Query cache intact, meaning the next user session inherits cached API responses (messages, notifications, profile data, feed content) from the previous user.
- **Impact:** After signing out via Settings and signing into a different account, the new user briefly sees the old user's feed, messages, and profile data until queries are refetched.

---

## MEDIUM (P2) — Significant Issues

### F11. API client doesn't handle network errors distinctly
- **File:** `apps/mobile/src/services/api.ts` line 148
- **Severity:** P2
- **Category:** Error Handling
- **Description:** The `fetch()` call at line 148 can throw a `TypeError` for network failures (no internet, DNS failure, timeout). This is not caught separately from HTTP errors. The raw `TypeError: Failed to fetch` or `TypeError: Network request failed` propagates to screens as an unformatted error message. The global mutation error handler in `_layout.tsx` (line 131-133) shows this raw message in an Alert.
- **Impact:** Users see technical error messages like "Network request failed" instead of user-friendly "You appear to be offline" messages.

### F12. `mentorship.tsx` has a hardcoded empty-string auth token
- **File:** `apps/mobile/app/(screens)/mentorship.tsx` lines 206-209
- **Severity:** P2
- **Category:** Auth Bug
- **Description:** The screen defines a local `getToken()` function that always returns an empty string. This is used in the `Authorization` header for the mentorship API call. The comment says "in real app, use the auth context" but this was never wired up.
- **Code:**
  ```ts
  async function getToken() {
    // Clerk token getter — in real app, use the auth context
    return '';
  }
  ```
- **Impact:** Mentorship screen sends `Authorization: Bearer ` (with empty token) which will fail auth on the backend.

### F13. Duplicate `Pressable` import in `saved-messages.tsx`
- **File:** `apps/mobile/app/(screens)/saved-messages.tsx` lines 3-5
- **Severity:** P2
- **Category:** Code Quality / Potential Crash
- **Description:** `Pressable` is imported twice from `react-native` on lines 3 and 5. This doesn't crash in most bundlers but is a code quality issue and could cause warnings or errors in strict mode.
- **Code:**
  ```ts
  import {
    View, Text, StyleSheet, FlatList, RefreshControl, Pressable,
    TextInput, Keyboard,
    Pressable,
  } from 'react-native';
  ```

### F14. No retry or exponential backoff for individual API calls
- **File:** `apps/mobile/src/services/api.ts` line 139
- **Severity:** P2
- **Category:** Resilience
- **Description:** The API client has no built-in retry logic. While React Query has `retry: 3` globally configured (line 127 of `_layout.tsx`), the mutation retry only covers network errors (line 135-138). Direct `api.get/post` calls outside of React Query (e.g., in socket handlers, encryption setup, push notification registration) have zero retry capability.
- **Impact:** Transient failures in non-query API calls (push token registration, encryption key registration, widget data sync) silently fail without retry.

### F15. `isOffline` state is set but never consumed for UX decisions
- **File:** `apps/mobile/src/store/index.ts` lines 17-18, `apps/mobile/src/hooks/useNetworkStatus.ts`
- **Severity:** P2
- **Category:** Missing Feature
- **Description:** The store has `isOffline` state and `useNetworkStatus` hook sets it. An `OfflineBanner` component is rendered in `_layout.tsx`. However, no screen uses `isOffline` to show cached data, disable mutations, or prevent API calls. The offline state is purely cosmetic (shows a banner) but doesn't change app behavior.
- **Impact:** When offline, users can still attempt to post, send messages, like content, etc. All these actions fail with unhelpful error messages instead of being queued or prevented with appropriate messaging.

### F16. Token getter failure silently continues with no auth
- **File:** `apps/mobile/src/services/api.ts` lines 142-146
- **Severity:** P2
- **Category:** Auth
- **Description:** When `getToken()` throws an error (e.g., Clerk SDK fails, SecureStore unavailable), the error is logged but the request proceeds without an auth token. For protected endpoints this results in a 401 response, but the user sees a generic error rather than being prompted to re-authenticate.
- **Code:**
  ```ts
  try {
    token = this.getToken ? await this.getToken() : null;
  } catch (e) {
    console.error('[API] Token getter failed:', e);
    // Request proceeds with no Authorization header
  }
  ```
- **Impact:** Intermittent auth failures cause confusing 401 errors that appear as "Unauthorized" instead of prompting re-login.

### F17. Missing cache invalidation: creating a video doesn't invalidate channel videos
- **File:** `apps/mobile/app/(screens)/create-video.tsx` lines 278-279
- **Severity:** P2
- **Category:** Query Key Inconsistency
- **Description:** Creating a video invalidates `['videos-feed']` and `['channel-videos']`, but the channel detail screen uses `['channel', handle]` and fetches videos separately. The invalidation may miss the specific channel's video list depending on how the channel screen queries videos.
- **Impact:** After uploading a video, it may not appear in the channel's video tab until manual refresh.

### F18. No `gcTime` (cacheTime) configured — stale entries never garbage collected
- **File:** `apps/mobile/app/_layout.tsx` lines 123-142
- **Severity:** P2
- **Category:** Memory
- **Description:** The `QueryClient` configuration sets `staleTime: 5 * 60 * 1000` but does not set `gcTime` (formerly `cacheTime`). TanStack Query v5 defaults `gcTime` to 5 minutes, which is reasonable, but for a social app with potentially thousands of cached queries (each post, each reel, each conversation), this could accumulate significant memory. No explicit cache size limit is configured.
- **Impact:** Memory pressure on devices that browse extensively without closing the app.

### F19. Global mutation error shows raw Alert for ALL mutation failures
- **File:** `apps/mobile/app/_layout.tsx` lines 131-133
- **Severity:** P2
- **Category:** UX
- **Description:** The global mutation `onError` handler shows `Alert.alert('Error', error.message)` for every failed mutation. This fires even when individual mutations have their own `onError` handlers, resulting in potential double error alerts. Additionally, the raw error message (which could be a technical server error) is shown to users.
- **Code:**
  ```ts
  mutations: {
    onError: (error: Error) => {
      Alert.alert('Error', error.message);
    },
  ```
- **Impact:** Users may see double error dialogs. Technical error messages like "Internal Server Error" or "UNIQUE constraint failed" leak to users.

### F20. Raw `fetch()` screens don't check response `res.ok` before `.json()`
- **File:** `apps/mobile/app/(screens)/chat-folders.tsx` line 38-39, `saved-messages.tsx` line 29-30, `fatwa-qa.tsx` line 47-48, `local-boards.tsx` line 32-33, `waqf.tsx` line 29-30, `watch-party.tsx` line 35-36
- **Severity:** P2
- **Category:** Error Handling
- **Description:** All 7 raw `fetch()` screens call `res.json()` without first checking `res.ok`. If the server returns a 401, 404, or 500, the response body may not be valid JSON, causing an unhandled JSON parse error. Even if it is JSON, the error response is returned as "successful" data to the query.
- **Code:**
  ```ts
  const res = await fetch(`${API_BASE}/chat-folders`);
  return res.json(); // No res.ok check
  ```
- **Impact:** Server errors are silently swallowed and treated as valid data. Screens may render garbage data from error responses or crash on unexpected response shapes.

### F21. Store persists `followedHashtags` to disk but hashtag state is client-only
- **File:** `apps/mobile/src/store/index.ts` lines 39-41, 351-365
- **Severity:** P2
- **Category:** State Sync
- **Description:** The `followedHashtags` array is included in the `partialize` config (line 355) so it persists to AsyncStorage. However, there is no API to sync followed hashtags with the backend. This means hashtag follows are device-local only and will be lost when switching devices or reinstalling.
- **Impact:** Users who follow hashtags on one device won't see them on another device. No server-side personalization based on followed hashtags.

### F22. `feedDismissedIds` grows unbounded in memory
- **File:** `apps/mobile/src/store/index.ts` lines 66-68, 226-229
- **Severity:** P2
- **Category:** Memory
- **Description:** `feedDismissedIds` is capped at 200 entries via `.slice(-200)` (line 228), which is good. However, this array is NOT included in `partialize` (lines 351-365), meaning it's lost on app restart but accumulates in memory during a session. For heavy users who dismiss many posts, this is fine. But the `addFeedDismissed` call is fire-and-forget — it's not synced with the `feedApi.dismiss()` API call, creating potential inconsistency.
- **Impact:** Minor — 200 strings in memory is negligible. But dismissed content reappears after app restart since the array isn't persisted, and the feed API dismissal may not actually filter the feed server-side.

---

## LOW (P3) — Minor Issues

### F23. `qs()` helper function duplicated across 7 service files
- **File:** `apps/mobile/src/services/api.ts` line 203, `islamicApi.ts` line 28, `monetizationApi.ts` line 15, `eventsApi.ts` line 14, `communitiesApi.ts` line 10, `audioRoomsApi.ts` line 10, `reelTemplatesApi.ts` line 4
- **Severity:** P3
- **Category:** Code Duplication
- **Description:** The query string builder `qs()` function is copy-pasted identically across 7 service files. Should be extracted to a shared utility.
- **Impact:** Maintenance burden. A bug fix in one copy won't propagate to others.

### F24. `widgetData.ts` JSON.parse without try/catch
- **File:** `apps/mobile/src/services/widgetData.ts` lines 77-80, 84-86
- **Severity:** P3
- **Category:** Error Handling
- **Description:** `getPrayerTimes()` and `getUnreadCounts()` call `JSON.parse(raw)` without try/catch. Corrupted AsyncStorage entries will crash the app.
- **Code:**
  ```ts
  const raw = await AsyncStorage.getItem(PRAYER_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as PrayerTimesWidgetData; // No try/catch
  ```
- **Impact:** Rare — AsyncStorage corruption is uncommon, but defensively wrapping in try/catch costs nothing.

### F25. `downloadManager.ts` `resumeDownload` doesn't actually resume
- **File:** `apps/mobile/src/services/downloadManager.ts` lines 70-77
- **Severity:** P3
- **Category:** Incomplete Implementation
- **Description:** The `resumeDownload` function gets the resumable from the map and returns it, but never calls `resumeAsync()` on it. The caller must call it themselves, but the function signature suggests it handles resume.
- **Code:**
  ```ts
  export async function resumeDownload(downloadId: string, onProgress?: ...) {
    const resumable = activeDownloads.get(downloadId);
    if (!resumable) return null;
    return resumable; // Never calls resumable.resumeAsync()
  }
  ```
- **Impact:** Download resume functionality is misleading. Callers who expect `resumeDownload()` to actually resume will get a paused download object.

### F26. `encryption.ts` `getConversationKey` always returns null for non-cached keys
- **File:** `apps/mobile/src/services/encryption.ts` lines 136-171
- **Severity:** P3
- **Category:** Incomplete Implementation
- **Description:** The `getConversationKey` method has extensive comments about needing the sender's public key to decrypt envelopes, but ultimately returns `null` for any key not in the local cache (line 168). The DH-based envelope decryption is completely unimplemented.
- **Impact:** E2E encryption only works for conversations where the current device initiated encryption. Joining an encrypted conversation from a new device or after cache clear = no decryption.

### F27. `pushNotifications.ts` importance level cast is unsafe
- **File:** `apps/mobile/src/services/pushNotifications.ts` lines 138-140
- **Severity:** P3
- **Category:** Type Safety
- **Description:** The importance level is cast via `channel.importance.toUpperCase() as keyof typeof Notifications.AndroidImportance`. The `NotificationChannel` type allows values like `'default'` but the Android importance enum might not have `'DEFAULT'` (it uses numbers). This cast is fragile.
- **Impact:** Potential runtime error on Android if the enum doesn't match the string values.

### F28. Zustand store doesn't reset `reducedMotion` and `highContrast` on logout
- **File:** `apps/mobile/src/store/index.ts` lines 320-346
- **Severity:** P3
- **Category:** State Management
- **Description:** The `logout()` function resets most state but does NOT reset `reducedMotion` or `highContrast` accessibility settings. While these are user-preference-like, they should arguably be reset per-user since different users may have different accessibility needs. These are also NOT included in `partialize`, so they're already lost on app restart.
- **Impact:** Minor — accessibility settings carry over between sessions but are lost on restart anyway.

### F29. `storyViewerData` stores raw `unknown[]` in Zustand
- **File:** `apps/mobile/src/store/index.ts` line 133
- **Severity:** P3
- **Category:** Type Safety
- **Description:** `storyViewerData` uses `unknown[]` for the groups array. This loses all type safety and requires manual casting in the story viewer screen.
- **Impact:** Type safety loss. Changes to the story data shape won't be caught at compile time.

### F30. No request timeout configured in the API client
- **File:** `apps/mobile/src/services/api.ts` line 148
- **Severity:** P3
- **Category:** Resilience
- **Description:** The `fetch()` call has no `AbortController` timeout. A slow or hanging server response will keep the request pending indefinitely. React Native's default fetch timeout varies by platform and may be very long (30-60 seconds).
- **Impact:** Users may see infinite loading states if the server is slow but not completely down.

### F31. `creatorApi.ts` returns `Record<string, unknown>` for most endpoints
- **File:** `apps/mobile/src/services/creatorApi.ts` lines 30, 40
- **Severity:** P3
- **Category:** Type Safety
- **Description:** `getPostInsights`, `getReelInsights`, and `getGrowth` all return `Record<string, unknown>`, providing no type safety for the response data. The types `OverviewData`, `AudienceData`, `ContentData`, and `RevenueData` are defined locally but only used for 4 of 7 endpoints.
- **Impact:** Screens consuming these API responses have no compile-time type checking.

### F32. `giftsApi.ts` history endpoint returns array instead of paginated response
- **File:** `apps/mobile/src/services/giftsApi.ts` line 41
- **Severity:** P3
- **Category:** API Inconsistency
- **Description:** `getHistory` accepts a `cursor` parameter but returns `GiftHistoryItem[]` (array) instead of `PaginatedResponse<GiftHistoryItem>`. If the backend returns paginated data, the meta (cursor, hasMore) is lost in the type.
- **Code:**
  ```ts
  getHistory: (cursor?: string) => api.get<GiftHistoryItem[]>(`/gifts/history${qs({ cursor })}`),
  ```
- **Impact:** Pagination won't work correctly for gift history since the cursor/hasMore metadata is typed away.

### F33. React Query cache not persisted to disk
- **File:** `apps/mobile/app/_layout.tsx` line 122
- **Severity:** P3
- **Category:** Missing Feature
- **Description:** Line 122 has a comment "Query cache persistence deferred — requires @tanstack/react-query-persist-client package install". The package was never installed. All cached query data is lost when the app is closed.
- **Impact:** Every app cold start requires fresh API calls for all data. Combined with the unused `offlineCache` module, the app has zero persistence of API data.

### F34. Multiple Zustand state values tracked but never used by any screen
- **File:** `apps/mobile/src/store/index.ts`
- **Severity:** P3
- **Category:** Dead State
- **Description:** Several state values are defined and exported as selectors but appear to have minimal or no screen usage:
  - `screenTimeSessionStart` — set/get hooks exported but no screen manages session tracking
  - `pipVideoId` / `isPiPActive` — PiP state tracked but react-native-pip is not installed
  - `downloadQueue` — array tracked but never consumed by a download manager UI
- **Impact:** Unnecessary state in the store. Minor memory and complexity overhead.

### F35. `encryptionApi.getBulkKeys` uses query params for array
- **File:** `apps/mobile/src/services/encryptionApi.ts` line 12
- **Severity:** P3
- **Category:** API Design
- **Description:** `getBulkKeys` passes an array of user IDs via query string: `?userIds=${userIds.join(',')}`. For large groups (100+ members), this could exceed URL length limits (typically 2048-8192 chars depending on server).
- **Impact:** E2E encryption setup may fail for large group conversations due to URL length limits.

### F36. `twoFactorApi.ts` `disable` uses DELETE with body
- **File:** `apps/mobile/src/services/twoFactorApi.ts` line 18
- **Severity:** P3
- **Category:** API Design
- **Description:** `disable` calls `api.delete('/two-factor/disable', data)` which sends a JSON body with a DELETE request. While the `api.delete` method supports bodies, some proxies and CDNs strip bodies from DELETE requests (per HTTP spec, DELETE body semantics are undefined).
- **Impact:** 2FA disable may fail behind certain proxies or CDNs that strip DELETE request bodies.

### F37. `reelTemplatesApi.browse` double-wraps paginated response type
- **File:** `apps/mobile/src/services/reelTemplatesApi.ts` lines 13-16
- **Severity:** P3
- **Category:** Type Safety
- **Description:** The return type is explicitly `{ data: ReelTemplate[]; meta: { cursor: string | null; hasMore: boolean } }`, but the API client's `request()` method already unwraps the `TransformInterceptor` envelope for paginated responses (lines 167-168 of `api.ts`). This means the actual runtime return value is already `{ data, meta }` and the explicit type redundantly matches. However, if the response format changes, this creates a mismatch.
- **Impact:** Type correctness depends on the server always returning paginated format. No runtime issue currently.

### F38. No request deduplication for concurrent identical API calls
- **File:** `apps/mobile/src/services/api.ts`
- **Severity:** P3
- **Category:** Performance
- **Description:** The API client has no request deduplication. If multiple components simultaneously request the same endpoint (e.g., two PostCards calling `postsApi.getById` for the same post), each makes a separate HTTP request. React Query handles deduplication at the query level, but direct API calls (in mutations, socket handlers, etc.) are not deduplicated.
- **Impact:** Unnecessary duplicate network requests in specific edge cases.

---

## Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| P0 (Ship Blocker) | 4 | No error differentiation, 7 dead screens (raw fetch), offlineCache dead code, logout state leak |
| P1 (Critical Bug) | 6 | Query key mismatches, no error states on tabs, sign-out cache leak, orphaned paymentsApi, no refetchOnFocus |
| P2 (Significant) | 12 | Network errors undifferentiated, mentorship empty token, no offline behavior, no request timeout, global error double-alert |
| P3 (Minor) | 16 | Code duplication, type safety gaps, dead state, missing persistence, fragile casts |
| **Total** | **38** | |

### Top 5 Fixes by Impact:
1. **F01 + F11:** Add typed error classes (ApiAuthError, ApiRateLimitError, ApiNetworkError) to the API client with status codes
2. **F02:** Replace all 7 raw `fetch()` screens with the `api` client
3. **F04 + F10:** Wire `store.logout()` and `queryClient.clear()` into all sign-out flows
4. **F09:** Add error states with retry buttons to all 5 main tab screens
5. **F03:** Either wire `offlineCache` into critical queries or delete the dead code
