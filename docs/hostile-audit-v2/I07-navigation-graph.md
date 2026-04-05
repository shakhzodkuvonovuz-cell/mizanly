# I07 — Navigation Graph: Deep Link Routes vs Actual Screens

**Scope:** Every `router.push`, `router.replace`, `router.navigate`, and `navigate()` call in `apps/mobile` checked against actual screen files in `apps/mobile/app/`.
**Methodology:** Grepped all navigation calls (~350+), cross-referenced against file-system routes, then inspected `useLocalSearchParams` types for param name mismatches.
**Severity scale:** CRITICAL = runtime crash / blank screen, HIGH = wrong data shown, MEDIUM = silent failure, LOW = code smell

---

## 1. GHOST ROUTES (navigate to screens that do not exist)

These navigation calls target routes with **no corresponding .tsx file**. On Expo Router, navigating to a nonexistent route either shows a 404-style error screen or silently fails.

| # | Sev | Source File | Navigation Call | Missing Screen File | Impact |
|---|-----|------------|-----------------|---------------------|--------|
| 1 | CRITICAL | `usePushNotificationHandler.ts:198` | `navigate('/(screens)/events')` | `app/(screens)/events.tsx` | Push notification for event type with no eventId falls to nonexistent screen. User taps notification, sees error. |
| 2 | CRITICAL | `usePushNotificationHandler.ts:204` | `navigate('/(screens)/monetization')` | `app/(screens)/monetization.tsx` | Push notification for `tip` or `membership` type navigates to nonexistent screen. |
| 3 | CRITICAL | `usePushNotificationHandler.ts:211` | `navigate('/(screens)/audio-rooms')` | `app/(screens)/audio-rooms.tsx` | Push notification for `audio_room` type with no audioRoomId navigates to nonexistent screen. Note: `audio-room.tsx` (singular) exists. |
| 4 | CRITICAL | `deepLinking.ts:207` | `navigate('/(screens)/audio-rooms')` | `app/(screens)/audio-rooms.tsx` | Deep link `mizanly://audio-room` with no ID falls to nonexistent screen. |
| 5 | CRITICAL | `creator-dashboard.tsx:258` | `router.push('/(screens)/scheduled-content' as never)` | `app/(screens)/scheduled-content.tsx` | Creator dashboard "scheduled content" button navigates to nonexistent screen. Uses `as never` to silence type error (which correctly warns about this). |
| 6 | CRITICAL | `event-detail.tsx:497` | `router.push('/(screens)/event-attendees/${id}' as never)` | `app/(screens)/event-attendees/[id].tsx` or `event-attendees.tsx` | "View attendees" button on event detail navigates to nonexistent screen. Uses `as never`. |
| 7 | CRITICAL | `safety-center.tsx:46` | `router.push('/(screens)/blocked-users' as never)` | `app/(screens)/blocked-users.tsx` | Safety center "blocked users" navigates to nonexistent screen. Note: `blocked.tsx` exists (not `blocked-users.tsx`). |
| 8 | CRITICAL | `product-detail.tsx:452` | `navigate('/(screens)/product-reviews', { productId })` | `app/(screens)/product-reviews.tsx` | "View All Reviews" button navigates to nonexistent screen. |
| 9 | CRITICAL | `series-detail.tsx:403,411,419` | `navigate('/(screens)/content-picker', { type, seriesId })` | `app/(screens)/content-picker.tsx` | Series "Add Episode" button (3 types: post, reel, video) navigates to nonexistent screen. |
| 10 | HIGH | `local-boards.tsx:69` | `router.push('/(screens)/local-board/${item.id}' as never)` | `app/(screens)/local-board/[id].tsx` | Local boards item tap navigates to nonexistent dynamic route. Note: `local-boards.tsx` (plural) exists, but not the singular dynamic route. |
| 11 | HIGH | `watch-party.tsx:159,193` | `router.push('/(screens)/watch-party/${item.id}' as never)` | `app/(screens)/watch-party/[id].tsx` | Watch party room tap navigates to nonexistent dynamic route. `watch-party.tsx` exists (the list), but not a `watch-party/[id].tsx` dynamic route for individual rooms. |

**Total ghost routes: 11 (8 CRITICAL, 3 HIGH)**

---

## 2. PARAM NAME MISMATCHES (screen exists but receives wrong param name)

The `navigate()` helper in `utils/navigation.ts` converts params to query string: `navigate('/(screens)/foo', { bar: 'x' })` becomes `router.push('/(screens)/foo?bar=x')`. The target screen calls `useLocalSearchParams<{ ... }>()` to read them. If the param name sent differs from the name expected, the value is `undefined`.

| # | Sev | Sender | Param Sent | Receiver | Param Expected | Impact |
|---|-----|--------|-----------|----------|---------------|--------|
| 12 | CRITICAL | `communities.tsx:280` | `navigate('/(screens)/community-posts', { communityId: community.id })` | `community-posts.tsx:171` | `useLocalSearchParams<{ channelId: string }>()` destructured as `{ channelId: handle }` | Sender passes `communityId`, receiver reads `channelId`. Value is always `undefined`. Screen shows empty state or errors. |
| 13 | CRITICAL | `creator-storefront.tsx:125` | `navigate('/(screens)/product-detail', { productId })` | `product-detail.tsx:105` | `useLocalSearchParams<{ id: string }>()` | Sender passes `productId`, receiver reads `id`. Product detail always gets `undefined` for `params.id`. All queries fail. |
| 14 | HIGH | `profile/[username].tsx:1036` | `navigate('/(screens)/send-tip?userId=${profile?.id}')` | `send-tip.tsx:93` | `useLocalSearchParams<{ username?: string }>()` | Sender passes `userId`, receiver reads `username`. Send-tip screen gets undefined username, can't find creator. |
| 15 | HIGH | `usePushNotificationHandler.ts:154` | `navigate('/(screens)/profile/${data.userId}')` | `profile/[username].tsx:217` | `useLocalSearchParams<{ username: string }>()` | Sender navigates with a userId (UUID) in the username slot. Profile screen queries by username, gets 404. Should resolve userId to username first. |

**Total param mismatches: 4 (2 CRITICAL, 2 HIGH)**

---

## 3. PATH PARAM vs QUERY PARAM CONFUSION

The `event-detail.tsx` screen uses `useLocalSearchParams<{ id: string }>()` to read `id`. It is a static route (not `[id].tsx`), so params come from query string. Some callers use query style, others use path style.

| # | Sev | Caller | Navigation Style | Screen Expects | Issue |
|---|-----|--------|-----------------|---------------|-------|
| 16 | HIGH | `usePushNotificationHandler.ts:196` | `navigate('/(screens)/event-detail/${data.eventId}')` | `event-detail.tsx` (static, reads `?id=`) | Path-style navigation to a static route. Expo Router will try to match `/(screens)/event-detail/abc123` which doesn't exist (no `event-detail/[id].tsx`). Falls to 404. |
| 17 | HIGH | `usePushNotificationHandler.ts:217` | `navigate('/(screens)/event-detail/${data.eventId}')` | same | Same bug, RSVP notification handler. |
| 18 | MEDIUM | `deepLinking.ts:193` | `navigate('/(screens)/event-detail?id=${params.id}')` | same | Correct query-param style. Works. |
| 19 | MEDIUM | `create-event.tsx:167` | `navigate('/(screens)/event-detail', { id: eventId })` | same | Correct (navigate helper adds `?id=`). Works. |
| 20 | HIGH | `usePushNotificationHandler.ts:209` | `navigate('/(screens)/audio-room/${data.audioRoomId}')` | `audio-room.tsx:64` reads `{ id }` via `useLocalSearchParams` | Path-style to static route. `audio-room.tsx` is a static route (not `[id].tsx`), so `/(screens)/audio-room/abc123` will 404. Should be `?id=`. |

**Total path/query confusion: 5 (3 HIGH, 2 MEDIUM confirming correct usage)**

---

## 4. `as never` TYPE SUPPRESSION (masking real type errors)

The `as never` cast silences TypeScript's typed route system. Every `as never` is either navigating to a nonexistent route or passing incompatible params. These are the ones NOT already listed as ghost routes above:

| # | Sev | File | Cast | Why It's Wrong |
|---|-----|------|------|---------------|
| 21 | LOW | `reel/[id].tsx:606` | `router.push('/(screens)/report?type=reel&id=${id}' as never)` | Route exists. Cast hides that query-string style doesn't match typed routes. Works at runtime but bypasses type safety. |
| 22 | LOW | `thread/[id].tsx:462` | `router.push('/(screens)/report?type=thread&id=${id}' as never)` | Same pattern. |
| 23 | LOW | `surah-browser.tsx:94` | `router.push('/(screens)/tafsir-viewer?surah=${item.number}' as never)` | Route exists. Works at runtime. |
| 24 | LOW | `chat-folders.tsx:140,192` | `router.push('/(screens)/chat-folder-view?filter=...' as never)` | Route exists. |
| 25 | LOW | `RichText.tsx:128` | `router.push('/(screens)/tafsir-viewer?surah=...&verse=...' as never)` | Route exists. |
| 26 | LOW | `saved.tsx:155` | `router.push(path as never)` | Dynamic path computed at runtime. Unchecked. |
| 27 | LOW | `profile/[username].tsx:587` | `router.push('/(screens)/flipside' as never)` | Route exists. Cast unnecessary. |

**Total `as never` casts: 18 across codebase (7 hide ghost routes from #1 above, 7 are cosmetic, 4 mask param issues)**

---

## 5. DEEP LINK ROUTE COVERAGE GAPS

The deep link handler (`deepLinking.ts`) supports 14 route types. The Android intent filters (`app.json`) only register 4 path prefixes. The iOS associated domains register the domains but have no AASA file.

| # | Sev | Finding |
|---|-----|---------|
| 28 | HIGH | **Android intent filters only cover 4 of 14 deep link routes.** `app.json` intentFilters register `/post`, `/reel`, `/profile`, `/thread`. Missing: `/conversation`, `/live`, `/event`, `/prayer-times`, `/audio-room`, `/video`, `/hashtag`, `/notifications`, `/settings`, `/search`. Users clicking `mizanly.app/video/123` will open in browser, not in app. |
| 29 | HIGH | **Deep link host mismatch.** `deepLinking.ts:29` only recognizes `mizanly.com` as the universal link host. But `app.json:45-48` also registers intent filters for `mizanly.app`. A deep link from `https://mizanly.app/video/123` will be parsed by the system but `parseDeepLink()` will fail because it checks for `mizanly.com`, not `mizanly.app`. |
| 30 | MEDIUM | **No AASA or assetlinks.json files.** iOS associated domains (`applinks:mizanly.com`, `applinks:mizanly.app`) and Android App Links (`autoVerify: true`) require server-side files (`.well-known/apple-app-site-association` and `.well-known/assetlinks.json`). No evidence these files exist or are deployed. Universal links will silently fail. |
| 31 | MEDIUM | **Deep link `mizanly://` only resolves `mizanly.com` links.** Custom scheme URLs (`mizanly://post/123`) work fine. But universal links from `mizanly.app` (the actual domain used everywhere in the app) won't match the parser. |

---

## 6. NOTIFICATION-TRIGGERED NAVIGATION BUGS

The push notification handler (`usePushNotificationHandler.ts`) has the highest density of bugs because it navigates to 15+ different screens and was likely written without cross-referencing actual routes.

| # | Sev | Type | Bug |
|---|-----|------|-----|
| 32 | HIGH | `follow` notification | If `data.username` is missing but `data.userId` exists, navigates to `/(screens)/profile/${userId}`. Profile screen reads this as a username and queries by username. A UUID like `clk_2abc...` won't match any username. Silent failure: empty profile. |
| 33 | MEDIUM | `event` / `rsvp` notification | Uses path-param style (`/event-detail/${eventId}`) instead of query-param style (`?id=eventId`). Screen expects query param. Will 404. |
| 34 | MEDIUM | `audio_room` notification | Same issue: path-param to static route. |
| 35 | MEDIUM | `tip` / `membership` notification | Navigates to nonexistent `/(screens)/monetization`. |
| 36 | MEDIUM | `event` with no eventId | Navigates to nonexistent `/(screens)/events`. |
| 37 | MEDIUM | `audio_room` with no roomId | Navigates to nonexistent `/(screens)/audio-rooms`. |

---

## 7. MISCELLANEOUS NAVIGATION ISSUES

| # | Sev | Finding |
|---|-----|---------|
| 38 | MEDIUM | **`navigate()` helper bypasses Expo Router type system.** `utils/navigation.ts` casts `router` to `{ push: (href: string) => void }`, erasing all typed route checking. Every call through `navigate()` is effectively untyped. This is why ghost routes aren't caught at build time. |
| 39 | LOW | **`manage-data.tsx:222` uses `router.replace('/')`.** This navigates to the root index, which redirects based on auth state. Works but fragile -- relies on `app/index.tsx` redirect logic. |
| 40 | LOW | **Two screens for same concept:** `bookmark-folders.tsx` and `bookmark-collections.tsx` both exist and are navigated to from different places. Unclear if they serve different purposes or are duplicates. |
| 41 | LOW | **`call-history.tsx:141`** navigates to `/(screens)/call/${item.id}` using `item.id` (which is the call history record ID, not a session ID). The call screen reads this as its `id` param but uses it to fetch session info. If history ID !== session ID, the call screen will fail. |

---

## SUMMARY

| Category | CRITICAL | HIGH | MEDIUM | LOW | Total |
|----------|----------|------|--------|-----|-------|
| Ghost routes | 8 | 3 | 0 | 0 | 11 |
| Param mismatches | 2 | 2 | 0 | 0 | 4 |
| Path/query confusion | 0 | 3 | 2 | 0 | 5 |
| `as never` suppressions | 0 | 0 | 0 | 7 | 7 |
| Deep link gaps | 0 | 2 | 2 | 0 | 4 |
| Notification nav bugs | 0 | 1 | 5 | 0 | 6 |
| Misc | 0 | 0 | 1 | 3 | 4 |
| **Total** | **10** | **11** | **10** | **10** | **41** |

### Most Dangerous Bugs (fix first)

1. **#12** `communities.tsx` sends `communityId`, `community-posts.tsx` reads `channelId` -- screen is completely broken
2. **#13** `creator-storefront.tsx` sends `productId`, `product-detail.tsx` reads `id` -- product detail from storefront is completely broken
3. **#1-#4** Ghost routes in push notification handler -- users tapping notifications hit error screens
4. **#16-#17** Push notification event/RSVP path-param to static route -- 404 on tap
5. **#29** Deep link parser doesn't recognize `mizanly.app` -- all universal links from the primary domain fail
