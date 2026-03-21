# Agent #22: Mobile Navigation/Routing Audit

**Scope:** Root layout, tab layout, screens layout, deep linking utility, all router.push/replace calls across 188 screen files and all components.

**Files audited:**
- `apps/mobile/app/_layout.tsx` (root layout, 367 lines)
- `apps/mobile/app/(tabs)/_layout.tsx` (tab bar, 307 lines)
- `apps/mobile/app/(tabs)/saf.tsx`, `bakra.tsx`, `majlis.tsx`, `risalah.tsx`, `minbar.tsx`, `create.tsx`
- `apps/mobile/app/(screens)/_layout.tsx` (screens stack, 14 lines)
- `apps/mobile/app/(auth)/_layout.tsx` (auth stack, 11 lines)
- `apps/mobile/app/onboarding/_layout.tsx` (onboarding stack, 12 lines)
- `apps/mobile/app/index.tsx` (root redirect)
- `apps/mobile/src/utils/deepLinking.ts` (deep link parser/navigator, 292 lines)
- `apps/mobile/src/components/web/WebSidebar.tsx` (web navigation)
- All 188 screen files in `(screens)/` for router.push/replace calls
- All component files in `src/components/` for navigation references

**Total findings: 28**

---

## CRITICAL (P0) - Navigation completely broken

### 1. Deep link utility never wired into the app
- **File:** `apps/mobile/src/utils/deepLinking.ts`
- **Severity:** P0
- **Category:** Dead code / Feature broken
- **Description:** The `setupDeepLinkListeners()` function and the entire `deepLinking.ts` module is **never imported anywhere** in the codebase. Zero files import from this utility. The root `_layout.tsx` has its own `ShareIntentHandler` that handles share intents only (line 291-317), but does NOT handle `mizanly://` scheme deep links or `https://mizanly.com` universal links. Deep linking is completely non-functional.
- **Evidence:** `grep -r "deepLink" apps/mobile/ --include="*.tsx"` returns only the utility file itself.

### 2. Deep link routes point to non-existent paths
- **File:** `apps/mobile/src/utils/deepLinking.ts`, lines 201-218
- **Severity:** P0
- **Category:** Broken navigation
- **Description:** Even if the deep link utility were wired, multiple routes would fail:
  - **Line 203:** `/(screens)/event-detail/${params.id}` -- `event-detail.tsx` is a flat file, not `event-detail/[id].tsx`. This path would 404.
  - **Line 205:** `/(screens)/events` -- this screen file does NOT exist.
  - **Line 215:** `/(screens)/audio-room/${params.id}` -- `audio-room.tsx` is a flat file, not `audio-room/[id].tsx`. This path would 404.
  - **Line 181:** `/(screens)/profile` with no username param -- profile screen is `profile/[username].tsx`, requires a username segment.
- **Impact:** 4 of 14 deep link screen types would navigate to blank/error screens.

### 3. Missing `/(screens)/` prefix on 8 navigation calls (broken routes)
- **File:** Multiple files
- **Severity:** P0
- **Category:** Broken navigation
- **Description:** These `router.push()` calls omit the `/(screens)/` group prefix. In Expo Router, these won't resolve to the correct screen because the files live inside `(screens)/`.
  ```
  discover.tsx:239    router.push(`/reel/${item.id}`)
  discover.tsx:241    router.push(`/post/${item.id}`)
  discover.tsx:243    router.push(`/thread/${item.id}`)
  discover.tsx:245    router.push(`/video/${item.id}`)
  duet-create.tsx:465 router.push('/create-reel')
  stitch-create.tsx:453 router.push('/create-reel')
  green-screen-editor.tsx:526 router.push('/camera')
  search.tsx:682      router.push(`/post/${item.id}`)
  ```
- **Impact:** Tapping these items navigates to an unmatched route (blank screen or error).

---

## HIGH (P1) - Navigation works but lands on wrong screen or loses data

### 4. `series-detail.tsx` uses query params instead of path params for dynamic routes
- **File:** `apps/mobile/app/(screens)/series-detail.tsx`, lines 115-119
- **Severity:** P1
- **Category:** Param mismatch
- **Description:** Navigates to `/(screens)/video?id=${episode.videoId}`, `/(screens)/reel?id=...`, `/(screens)/post?id=...`. But these screens use dynamic route files (`video/[id].tsx`, `reel/[id].tsx`, `post/[id].tsx`) that read `id` from the path segment, not query params. The `?id=` query param approach tries to match a flat `video.tsx` file which doesn't exist.
- **Code:**
  ```ts
  router.push(`/(screens)/video?id=${episode.videoId}` as never);  // WRONG
  // Should be: router.push(`/(screens)/video/${episode.videoId}`)  // CORRECT
  ```

### 5. `product-detail.tsx` and `series-detail.tsx` navigate to profile with query params instead of path
- **File:** `apps/mobile/app/(screens)/product-detail.tsx:296`, `series-detail.tsx:247`
- **Severity:** P1
- **Category:** Param mismatch
- **Description:** Navigate to `/(screens)/profile?username=xxx` but the profile screen is at `profile/[username].tsx` which expects the username as a path segment.
- **Code:**
  ```ts
  router.push(`/(screens)/profile?username=${product.seller.username}` as never)  // WRONG
  // Should be: router.push(`/(screens)/profile/${product.seller.username}`)
  ```

### 6. WebSidebar navigates to `/(screens)/profile` with no username
- **File:** `apps/mobile/src/components/web/WebSidebar.tsx`, line 46
- **Severity:** P1
- **Category:** Broken navigation
- **Description:** The web sidebar's "Profile" link routes to `/(screens)/profile` which doesn't match any screen. The profile screen requires a `[username]` param: `profile/[username].tsx`.
- **Code:**
  ```ts
  { key: 'profile', icon: 'user', label: t('common.profile'), route: '/(screens)/profile' },
  ```
  Should navigate to `/(screens)/profile/${currentUser.username}`.

### 7. `conversation-media` param mismatch from `conversation-info.tsx`
- **File:** `apps/mobile/app/(screens)/conversation-info.tsx:423`
- **Severity:** P1
- **Category:** Param mismatch
- **Description:** Navigates with `?conversationId=${convo?.id}` but the `conversation-media.tsx` screen reads `useLocalSearchParams<{ id: string }>()` (expects `id`, not `conversationId`). The screen will get `undefined` for the conversation ID.
- **Code:**
  ```ts
  // conversation-info.tsx sends:
  router.push(`/(screens)/conversation-media?conversationId=${convo?.id}`)
  // conversation-media.tsx expects:
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  ```
  The other caller (`conversation/[id].tsx:1340`) correctly uses `?id=${id}`.

### 8. Profile screen receives userId instead of username (3 files)
- **File:** `leaderboard.tsx:68,108`, `product/[id].tsx:357`, `series/[id].tsx:215`
- **Severity:** P1
- **Category:** Param type mismatch
- **Description:** These screens navigate to `/(screens)/profile/${entry.userId}` or `/(screens)/profile/${data.seller.id}` or `/(screens)/profile/${data.creator.id}`, but the profile screen's dynamic route is `[username].tsx` and queries the API by username. Passing a CUID/UUID as the username segment will result in a "user not found" error.
- **Code:**
  ```ts
  router.push(`/(screens)/profile/${entry.userId}`)      // leaderboard.tsx
  router.push(`/(screens)/profile/${data.seller.id}`)     // product/[id].tsx
  router.push(`/(screens)/profile/${data.creator.id}`)    // series/[id].tsx
  ```

### 9. `analytics.tsx` navigates to `/(tabs)/create` which immediately calls `router.back()`
- **File:** `apps/mobile/app/(screens)/analytics.tsx:237`, `apps/mobile/app/(tabs)/create.tsx:10`
- **Severity:** P1
- **Category:** Broken navigation
- **Description:** The analytics screen's empty state action navigates to `/(tabs)/create`. But `create.tsx` is a dummy screen that immediately calls `router.back()` (line 10). The user will see a flash then return to analytics. Should navigate to a creation screen or trigger the create sheet.
- **Code:**
  ```ts
  // analytics.tsx
  onAction={() => router.push('/(tabs)/create')}
  // create.tsx
  useEffect(() => { router.back(); }, []);
  ```

---

## MEDIUM (P2) - UX issues, dead code, inconsistencies

### 10. 10 orphan screens exist as files but are unreachable via navigation
- **Severity:** P2
- **Category:** Orphan screens
- **Description:** These screen files exist in `(screens)/` but no `router.push` or `router.replace` call anywhere in the codebase navigates to them:
  1. `camera.tsx` -- only referenced from `green-screen-editor.tsx` with broken `/camera` route (no `/(screens)/` prefix)
  2. `dua-collection.tsx` -- Islamic dua screen, never linked from any menu or settings
  3. `fasting-tracker.tsx` -- referenced in `ramadan-mode.tsx` as a comment but never navigated to
  4. `halal-finder.tsx` -- halal restaurant finder, never linked
  5. `hifz-tracker.tsx` -- Quran memorization tracker, never linked
  6. `location-picker.tsx` -- only used as an imported component in `create-post.tsx`, not as a screen route
  7. `morning-briefing.tsx` -- daily Islamic briefing, never linked
  8. `names-of-allah.tsx` -- 99 Names screen, never linked
  9. `voice-recorder.tsx` -- voice recording screen, never linked
  10. `wind-down.tsx` -- meditation/wind-down screen, never linked from settings or wellbeing section

### 11. Duplicate screen files for same entity (product, series)
- **File:** `product/[id].tsx` + `product-detail.tsx`, `series/[id].tsx` + `series-detail.tsx`
- **Severity:** P2
- **Category:** Dead code / confusion
- **Description:** Two screen files exist for the same entity:
  - `product/[id].tsx` (dynamic route) -- **never navigated to** by any code
  - `product-detail.tsx` (flat file with query params) -- used by 4 screens
  - `series/[id].tsx` (dynamic route) -- used only from itself via `pathname` object form
  - `series-detail.tsx` (flat file with query params) -- used by `series-discover.tsx`

  Having both a dynamic route and a flat screen for the same entity is confusing and means one of them is dead code.

### 12. `sticker-browser.tsx` ignores `conversationId` param
- **File:** `apps/mobile/app/(screens)/sticker-browser.tsx`
- **Severity:** P2
- **Category:** Param ignored
- **Description:** `conversation/[id].tsx:1597` navigates with `?conversationId=${id}` but `sticker-browser.tsx` doesn't call `useLocalSearchParams` at all. The `conversationId` is silently lost, meaning selected stickers can't be sent to the correct conversation.

### 13. WebSidebar shows notification badge on Majlis tab instead of just notifications
- **File:** `apps/mobile/src/components/web/WebSidebar.tsx:36`
- **Severity:** P2
- **Category:** UX bug
- **Description:** The `majlis` nav item shows `badge: unreadNotifications` (line 36), which means the thread discussion tab shows the notification count. Notifications are unrelated to Majlis (threads). The badge also correctly appears on the dedicated notifications secondary nav item (line 45), so this is a double-display with the wrong semantic.
- **Code:**
  ```ts
  { key: 'majlis', ..., badge: unreadNotifications || undefined },  // WRONG - should have no badge or separate badge
  ```

### 14. `notificationTarget()` missing many notification type routes
- **File:** `apps/mobile/app/(screens)/notifications.tsx:70-75`
- **Severity:** P2
- **Category:** Incomplete routing
- **Description:** The notification tap handler only routes for 3 types: postId, threadId, actor.username. Missing routes for: reelId, videoId, conversationId, communityId, eventId, liveId, orderId, commentId. Users tapping most notification types will have no navigation (the function returns `null`).
- **Code:**
  ```ts
  function notificationTarget(n: Notification): string | null {
    if (n.postId) return `/(screens)/post/${n.postId}`;
    if (n.threadId) return `/(screens)/thread/${n.threadId}`;
    if (n.actor?.username) return `/(screens)/profile/${n.actor.username}`;
    return null;  // 80%+ of notification types fall through here
  }
  ```

### 15. `sign-in.tsx` navigates from (auth) group to (screens) group for 2FA
- **File:** `apps/mobile/app/(auth)/sign-in.tsx:63`
- **Severity:** P2
- **Category:** Navigation architecture
- **Description:** During sign-in, if 2FA is required, the code pushes to `/(screens)/2fa-verify`. This navigates from the `(auth)` modal group to the `(screens)` stack group. While it works, the 2FA screen will appear with a slide-from-right animation on top of the modal auth flow, and the user could swipe back to the sign-in screen without completing 2FA.
- **Code:**
  ```ts
  router.push('/(screens)/2fa-verify' as never);
  ```

### 16. Root layout missing `Stack.Screen` for `index`
- **File:** `apps/mobile/app/_layout.tsx:353-358`
- **Severity:** P2
- **Category:** Missing screen declaration
- **Description:** The root `_layout.tsx` declares 4 `Stack.Screen` entries: `(tabs)`, `(auth)`, `onboarding`, `(screens)`. But `index.tsx` exists at the root level and is not declared. Expo Router auto-discovers it, but without explicit declaration, screen options cannot be controlled (e.g., preventing it from appearing in the back stack).

---

## LOW (P3) - Minor issues, polish, style

### 17. Hardcoded English strings in navigation-related screens
- **File:** `stitch-create.tsx:451,458`, `duet-create.tsx:471`
- **Severity:** P3
- **Category:** i18n
- **Description:** "Cancel" and "Next" are hardcoded instead of using `t()`:
  ```tsx
  // stitch-create.tsx:451
  <Text style={styles.cancelButtonText}>Cancel</Text>
  // stitch-create.tsx:458
  <Text style={styles.nextButtonText}>Next</Text>
  // duet-create.tsx:471
  <Text style={styles.nextButtonText}>Next</Text>
  ```

### 18. Duplicate `accessibilityRole="button"` prop in duet-create.tsx
- **File:** `apps/mobile/app/(screens)/duet-create.tsx:301,391,429,463`
- **Severity:** P3
- **Category:** Code quality
- **Description:** Four Pressable elements have `accessibilityRole="button"` declared twice on the same element. React Native uses the last one, so it works, but it's a code smell indicating copy-paste errors.

### 19. Duplicate `Pressable` import in 4+ screen files
- **File:** `event-detail.tsx:8,10`, `series-detail.tsx:8,11`, `product-detail.tsx:8,11`, `conversation-media.tsx:4,5`
- **Severity:** P3
- **Category:** Code quality
- **Description:** `Pressable` is imported twice from `react-native`. TypeScript may or may not error on this depending on config, but it indicates sloppy imports.

### 20. `(screens)/_layout.tsx` uses bare `<Stack />` without explicit screen declarations
- **File:** `apps/mobile/app/(screens)/_layout.tsx`
- **Severity:** P3
- **Category:** Architecture
- **Description:** All 188 screens rely on Expo Router auto-discovery. While this works, it means:
  - No per-screen animation overrides (e.g., modals for camera, sheets for pickers)
  - No preloading hints
  - No screen-specific `gestureEnabled: false` for flows that shouldn't allow swipe-back (2FA, payment)
  - All screens get the same `slide_from_right` animation

### 21. `EidCelebrationOverlay` uses emoji text `{"\u{1F389}"}` instead of Icon
- **File:** `apps/mobile/app/_layout.tsx:112`
- **Severity:** P3
- **Category:** Code quality rule violation
- **Description:** Uses text emoji for the celebration icon. Per project rules: "NEVER use text emoji for icons -- Always `<Icon name="..." />`". However, there's no party/celebration icon in the 44-icon set, so this is a practical exception.

### 22. `create.tsx` screen uses `router.back()` in `useEffect` without dependency guard
- **File:** `apps/mobile/app/(tabs)/create.tsx:10`
- **Severity:** P3
- **Category:** Potential crash
- **Description:** `useEffect(() => { router.back(); }, [])` runs on mount and immediately navigates back. If the navigation stack is empty (e.g., direct URL load on web), `router.back()` may throw or navigate to an unexpected state.

### 23. `onboarding/profile.tsx` uses relative path `/onboarding/interests`
- **File:** `apps/mobile/app/onboarding/profile.tsx:87,180`
- **Severity:** P3
- **Category:** Navigation style inconsistency
- **Description:** Uses `/onboarding/interests` instead of a group-relative path. This works because `onboarding` is a top-level group, but it's inconsistent with how other navigation within groups works. Not a bug per se, but fragile if the group structure changes.

### 24. `onboarding/username.tsx` skips the `profile` step entirely
- **File:** `apps/mobile/app/onboarding/username.tsx:118`
- **Severity:** P3
- **Category:** Architecture / Dead code
- **Description:** `username.tsx` pushes directly to `/onboarding/interests` with a comment "Skip profile step -- go directly to interests (2-step onboarding)". This means `onboarding/profile.tsx` is never reached during normal onboarding flow, making it dead code.

### 25. `BiometricLockOverlay` intercepts all navigation including auth flow
- **File:** `apps/mobile/app/_layout.tsx:231-268`
- **Severity:** P3
- **Category:** UX
- **Description:** The biometric lock overlay renders at the root level with `zIndex: 9999`, covering everything including auth screens. If a user enables biometric lock and then gets signed out, they'll see the lock overlay on top of the sign-in screen, which is confusing.

### 26. `IslamicThemeBanner` uses hardcoded colors/styles instead of theme tokens
- **File:** `apps/mobile/app/_layout.tsx:62-74`
- **Severity:** P3
- **Category:** Code quality rule violation
- **Description:** The banner uses hardcoded `paddingVertical: 6`, `paddingHorizontal: 16`, `fontWeight: '700'`, `fontSize: 13`, `color: '#fff'` instead of theme tokens. Per project rules, spacing should use `spacing.*` tokens and font sizes should use `fontSize.*`.

### 27. `lockStyles.overlay` hardcodes `colors.dark.bg` background
- **File:** `apps/mobile/app/_layout.tsx:274`
- **Severity:** P3
- **Category:** Theme hardcoding
- **Description:** The biometric lock overlay uses `backgroundColor: colors.dark.bg` directly. This is technically a dark-mode-only reference that won't adapt if a light theme is ever implemented (documented architectural issue across 244 files).

### 28. `ShareIntentHandler` casts params through `as never`
- **File:** `apps/mobile/app/_layout.tsx:299-302`
- **Severity:** P3
- **Category:** Type safety
- **Description:** The share intent handler pushes to `share-receive` with `params: params as Record<string, string>` and casts the entire navigation object `as never`. This bypasses all type checking for the navigation params.

---

## Summary Table

| Severity | Count | Key Issues |
|----------|-------|------------|
| P0 Critical | 3 | Deep link utility dead (never wired), 8 broken routes missing `/(screens)/` prefix, 4 deep link routes to non-existent paths |
| P1 High | 6 | Query params vs path params mismatch (series-detail, product-detail, WebSidebar profile), conversation-media param name mismatch, profile receives userId instead of username, analytics->create redirect loop |
| P2 Medium | 7 | 10 orphan screens, duplicate screen files, sticker-browser ignores param, notification badge on wrong tab, incomplete notification routing, 2FA cross-group navigation, missing index screen declaration |
| P3 Low | 12 | Hardcoded English, duplicate props/imports, bare Stack without screen declarations, theme token violations, onboarding dead code, type safety bypasses |
| **Total** | **28** | |

---

## Highest Priority Fixes

1. **Wire deep linking** -- Import and call `setupDeepLinkListeners()` in `_layout.tsx` or replace `ShareIntentHandler` with the full deep link handler
2. **Add `/(screens)/` prefix** to the 8 broken routes in `discover.tsx`, `duet-create.tsx`, `stitch-create.tsx`, `green-screen-editor.tsx`, `search.tsx`
3. **Fix deep link routes** -- Change `event-detail/${id}` to `event-detail?id=${id}`, `audio-room/${id}` to `audio-room?id=${id}`, add `events` screen or fallback, fix `profile` route
4. **Fix series-detail.tsx** -- Change `/(screens)/video?id=xxx` to `/(screens)/video/${xxx}` (and reel, post)
5. **Fix profile param mismatches** -- leaderboard, product/[id], series/[id] should pass username not userId
6. **Fix conversation-media param** -- Change `conversationId` to `id` in conversation-info.tsx
7. **Link orphan screens** -- Add navigation paths to the 10 orphan Islamic/utility screens from settings or relevant parent screens
