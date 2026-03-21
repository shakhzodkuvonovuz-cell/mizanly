# Agent 48 — Creator Tools Screens Deep Audit

**Auditor:** Claude Opus 4.6 (Agent #48 of 67)
**Date:** 2026-03-21
**Scope:** All creator tools, analytics, scheduling, storefront, branded content, and post insights screens
**Files Audited (8 screens + 2 service files):**
1. `apps/mobile/app/(screens)/creator-dashboard.tsx` (873 lines)
2. `apps/mobile/app/(screens)/creator-storefront.tsx` (460 lines)
3. `apps/mobile/app/(screens)/analytics.tsx` (406 lines)
4. `apps/mobile/app/(screens)/schedule-post.tsx` (922 lines)
5. `apps/mobile/app/(screens)/schedule-live.tsx` (491 lines)
6. `apps/mobile/app/(screens)/branded-content.tsx` (331 lines)
7. `apps/mobile/app/(screens)/post-insights.tsx` (555 lines)
8. `apps/mobile/src/services/creatorApi.ts` (43 lines)
9. `apps/mobile/src/services/promotionsApi.ts` (22 lines)

**Backend cross-references checked:**
- `apps/api/src/modules/creator/creator.controller.ts`
- `apps/api/src/modules/promotions/promotions.controller.ts`
- `apps/api/src/modules/users/users.controller.ts` (getAnalytics endpoint)
- `apps/api/src/modules/scheduling/scheduling.service.ts`
- `apps/api/src/modules/posts/dto/` (no scheduledAt in create DTO)
- `apps/mobile/src/services/api.ts` (type definitions)
- `apps/mobile/src/theme/index.ts` (color/font tokens)

---

## Total Findings: 34

### Severity Counts
- **P0 (Ship Blocker):** 5
- **P1 (Critical Bug):** 8
- **P2 (Significant):** 10
- **P3 (Minor/Polish):** 11

---

## Finding 1 — P0 — DUPLICATE IMPORT: Pressable imported twice (COMPILE ERROR)

**File:** `apps/mobile/app/(screens)/creator-dashboard.tsx`
**Lines:** 6 and 12

```tsx
import {
  View,
  Text,
  FlatList,
  Pressable,       // line 6
  ScrollView,
  StyleSheet,
  RefreshControl,
  Dimensions,
  Image,
  Pressable,       // line 12 — DUPLICATE
} from 'react-native';
```

**Impact:** This is a duplicate import of `Pressable` from `react-native`. In strict mode or certain bundler configurations this will cause a compile error. In practice, React Native / Metro bundler may silently ignore it, but it's a code quality bug that indicates copy-paste issues.

---

## Finding 2 — P0 — DUPLICATE IMPORT: Pressable imported twice (COMPILE ERROR)

**File:** `apps/mobile/app/(screens)/creator-storefront.tsx`
**Lines:** 7 and 11

```tsx
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,       // line 7
  Image,
  RefreshControl,
  Dimensions,
  Pressable,       // line 11 — DUPLICATE
} from 'react-native';
```

**Impact:** Same duplicate import issue as Finding 1. The storefront screen also has `Pressable` imported twice.

---

## Finding 3 — P0 — STOREFRONT API CALLS NON-EXISTENT ENDPOINT (404)

**File:** `apps/mobile/app/(screens)/creator-storefront.tsx`
**Line:** 69

```tsx
const [productsRes, profileRes] = await Promise.all([
  api.get(`/storefront/${userId}/products`),   // line 69
  api.get(`/users/${userId}`),
]);
```

**Backend verification:** Searched entire `apps/api/src` for `storefront` — zero matches. There is no `/storefront/` controller, module, or route in the backend.

**Impact:** Every visit to a creator's storefront will result in a 404 error. The `productsRes` will always fail, so `products` will always be an empty array. The entire storefront feature is dead — users can never see or buy products.

---

## Finding 4 — P0 — BRANDED CONTENT ENDPOINT MISMATCH (mobile calls PATCH/DELETE on /posts/:id/branded, backend has POST /promotions/branded)

**File:** `apps/mobile/src/services/promotionsApi.ts`
**Lines:** 17-21

```tsx
markBranded: (postId: string, partnerName: string) =>
  api.patch(`/posts/${postId}/branded`, { partnerName }),   // PATCH /posts/:id/branded

removeBranded: (postId: string) =>
  api.delete(`/posts/${postId}/branded`),                    // DELETE /posts/:id/branded
```

**Backend (promotions.controller.ts line 95-104):**
```tsx
@Post('branded')     // POST /promotions/branded  (not PATCH /posts/:id/branded)
markBranded(
  @CurrentUser('id') userId: string,
  @Body() dto: MarkBrandedDto,     // expects { postId, partnerName } in body
)
```

**Three mismatches:**
1. Mobile calls `PATCH /posts/:id/branded` — backend has `POST /promotions/branded`
2. Mobile sends `partnerName` as body to `/posts/:id/branded` — backend expects `{ postId, partnerName }` in body to `/promotions/branded`
3. Mobile calls `DELETE /posts/:id/branded` — no such endpoint exists in the backend at all (`removeBranded` is not implemented server-side)

**Impact:** Both marking and removing branded content will fail with 404. The entire branded content feature is non-functional.

---

## Finding 5 — P0 — PROMOTIONS `getMyPromotions` CALLS WRONG ENDPOINT

**File:** `apps/mobile/src/services/promotionsApi.ts`
**Line:** 7

```tsx
getMyPromotions: () => api.get('/promotions/my'),
```

**Backend (promotions.controller.ts line 54):**
```tsx
@Get('mine')    // GET /promotions/mine  (not /promotions/my)
```

**Impact:** The mobile client calls `/promotions/my` but the backend route is `/promotions/mine`. This will 404.

---

## Finding 6 — P1 — SCHEDULE-POST HARDCODES MARCH (month === 2)

**File:** `apps/mobile/app/(screens)/schedule-post.tsx`
**Lines:** 251, 253

```tsx
const isToday = day === today && currentMonth === 2;     // line 251
const isPast = day < today && currentMonth === 2;        // line 253
```

**Impact:** The "today" highlighting and "past day" disabling only works when `currentMonth === 2` (March, 0-indexed). In every other month of the year:
- No day will be highlighted as "today"
- No days will be disabled as "past"
- Users can schedule posts in the past (the `scheduledAt <= new Date()` check on line 94 will catch this, but the calendar UI won't show any visual feedback)

This is a clear hardcoded-to-development-date bug. The check should be `currentMonth === now.getMonth()` and also needs to compare the year.

---

## Finding 7 — P1 — SCHEDULE-POST YEAR NEVER CHANGES

**File:** `apps/mobile/app/(screens)/schedule-post.tsx`
**Line:** 32

```tsx
const [currentYear] = useState(now.getFullYear());
```

**Impact:** `currentYear` is set once via `useState` with no setter. The `changeMonth` function wraps months 0-11 but never updates the year. If a user navigates forward from December, `currentMonth` wraps to 0 (January) but `currentYear` stays at 2026. The displayed date will be "January 2026" instead of "January 2027", and the scheduled timestamp will be wrong by a full year.

---

## Finding 8 — P1 — SCHEDULE-POST QUICK DATES ARE HARDCODED DAY NUMBERS

**File:** `apps/mobile/app/(screens)/schedule-post.tsx`
**Lines:** 74-78

```tsx
const quickDates = [
  { label: t('common.tomorrow'), day: today + 1 },
  { label: t('screens.schedule-post.thisWeekend'), day: 15 },     // always 15th
  { label: t('screens.schedule-post.nextWeek'), day: 20 },        // always 20th
];
```

**Impact:**
1. "This Weekend" always selects day 15 — not the actual upcoming Saturday/Sunday
2. "Next Week" always selects day 20 — not the actual next Monday
3. "Tomorrow" sets `today + 1`, which breaks on the last day of the month (e.g., day 32 in a 31-day month)

---

## Finding 9 — P1 — SCHEDULE-POST TIMEZONE HARDCODED TO UTC+3

**File:** `apps/mobile/app/(screens)/schedule-post.tsx`
**Line:** 436

```tsx
<Text style={styles.timezoneValue}>UTC+3 (Arabia Standard Time)</Text>
```

**Impact:** Every user, regardless of location, sees "UTC+3 (Arabia Standard Time)". Users in other timezones will misinterpret when their post will be published. The `scheduledAt` Date object IS constructed using the device's local timezone (via `new Date(year, month, day, hour, minute)`), so the actual scheduling is correct — but the displayed timezone label is wrong. Users will think they're scheduling in AST when they're scheduling in their local time.

---

## Finding 10 — P1 — BEST TIME SUGGESTION HARDCODED

**File:** `apps/mobile/app/(screens)/schedule-post.tsx`
**Line:** 418

```tsx
<Text style={styles.bestTimeText}>6:00 PM ({t('screens.schedule-post.highEngagement')})</Text>
```

**Impact:** The "best time to post" suggestion is hardcoded to "6:00 PM" for all users. There is no API call to get actual best engagement times. The creator-dashboard DOES have a `bestTimes` array from the API, but schedule-post doesn't use it.

---

## Finding 11 — P1 — DUPLICATE accessibilityRole PROP (7 instances)

**File:** `apps/mobile/app/(screens)/schedule-post.tsx`
**Lines:** 256, 285, 335, 362, 388

```tsx
<Pressable accessibilityRole="button" accessibilityRole="button"   // DUPLICATE PROP
```

**Impact:** The `accessibilityRole` prop is specified twice on the same element in at least 5 places. React will use the second one (which is the same value), so no functional bug, but it indicates copy-paste issues and will trigger ESLint warnings.

---

## Finding 12 — P1 — ANALYTICS SCREEN HAS TWO COMPETING DATA SOURCES

**Files:**
- `apps/mobile/app/(screens)/analytics.tsx` uses `usersApi.getAnalytics()` which calls `GET /users/me/analytics`
- `apps/mobile/app/(screens)/creator-dashboard.tsx` uses `creatorApi.getOverview()` etc. which calls `GET /creator/analytics/overview`

**Impact:** There are TWO separate analytics systems:
1. `usersApi.getAnalytics()` → `GET /users/me/analytics` → returns `{ stats: CreatorStat[] }` from `creatorStat` table
2. `creatorApi.getOverview()` → `GET /creator/analytics/overview` → returns overview data from `creatorService.getDashboardOverview()`

Both screens show analytics but use different APIs. The analytics.tsx screen aggregates `totalViews`, `totalLikes`, `totalFollowers` from `CreatorStat[]`, while creator-dashboard gets pre-computed overview data. If one data source is populated and the other isn't, users see inconsistent numbers depending on which screen they visit.

---

## Finding 13 — P1 — ANALYTICS SCREEN CHANGE VALUES ARE MEANINGLESS

**File:** `apps/mobile/app/(screens)/analytics.tsx`
**Lines:** 245-259

```tsx
<SummaryCard
  title={t('analytics.views')}
  value={formatNumber(totalViews)}
  change={totalViews > 0 ? '+' + formatNumber(totalViews) : undefined}
  icon="eye"
  index={0}
/>
```

**Impact:** The "change" value for each summary card is just the total value prefixed with "+". If a creator has 1,000 views, the card shows "1.0K" with change "+1.0K" — implying 1K views were gained recently, when in fact it's just displaying the total twice. Real change should compare against a previous period (e.g., last 7 days vs previous 7 days).

---

## Finding 14 — P2 — NO AUTO-PUBLISHER FOR SCHEDULED POSTS

**File:** `apps/api/src/modules/scheduling/scheduling.service.ts`

**Impact:** The scheduling service provides CRUD operations for scheduled content (get, update, cancel, publishNow), but there is NO cron job, queue processor, or polling mechanism that actually publishes scheduled posts when their `scheduledAt` time arrives. Posts with `scheduledAt` set will simply sit in the database forever with `scheduledAt` != null. The feed query filters them out (`scheduledAt: null`), so they're invisible. Users who schedule posts will never see them published.

This was already flagged in the audit index as a known gap: "no scheduled post auto-publisher" (agent 19).

---

## Finding 15 — P2 — STOREFRONT USES `api.get` INSTEAD OF DEDICATED SERVICE

**File:** `apps/mobile/app/(screens)/creator-storefront.tsx`
**Lines:** 68-71

```tsx
const [productsRes, profileRes] = await Promise.all([
  api.get(`/storefront/${userId}/products`),
  api.get(`/users/${userId}`),
]);
```

**Impact:** While the creator-dashboard correctly uses `creatorApi`, the storefront makes raw `api.get()` calls to endpoints that don't exist. There's no `storefrontApi` service. This means:
1. No type safety on the response
2. No centralized endpoint management
3. If the endpoint is ever created, the URL is only in this one screen file

---

## Finding 16 — P2 — CREATOR DASHBOARD `formatNumber` AND `formatChange` DEFINED INSIDE COMPONENT

**File:** `apps/mobile/app/(screens)/creator-dashboard.tsx`
**Lines:** 165-175

```tsx
const formatNumber = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  ...
};

const formatChange = (n: number): string => {
  ...
};
```

**Impact:** These utility functions are defined inside the component, meaning they are recreated on every render. They are also used inside `renderOverviewCard` callback (which depends on an empty deps array `[]`, so it captures stale versions). The `formatNumber` function is also duplicated across `creator-dashboard.tsx`, `creator-storefront.tsx`, `analytics.tsx`, and `post-insights.tsx` — four identical copies.

---

## Finding 17 — P2 — SCHEDULE-POST `mediaUrls` PARAMETER PARSED WITHOUT TRY/CATCH

**File:** `apps/mobile/app/(screens)/schedule-post.tsx`
**Line:** 100

```tsx
const mediaUrls = params.mediaUrls ? JSON.parse(params.mediaUrls) : [];
```

**Impact:** If `params.mediaUrls` is a malformed JSON string (which can happen with URL encoding issues in Expo Router params), `JSON.parse` will throw an unhandled exception, crashing the screen. Should be wrapped in try/catch.

---

## Finding 18 — P2 — SCHEDULE-POST CREATES CONTENT WITH scheduledAt BUT BACKEND DTO DOESN'T VALIDATE IT

**File:** `apps/mobile/app/(screens)/schedule-post.tsx`
**Lines:** 104-123

The screen calls `postsApi.create()`, `threadsApi.create()`, and `reelsApi.create()` with `scheduledAt` in the payload. The mobile type definitions include `scheduledAt?: string` in all three create payloads.

However, checking the backend:
- `apps/api/src/modules/posts/dto/` — no `scheduledAt` field found in create DTO
- `apps/api/src/modules/threads/` — no `scheduledAt` in create DTO validation
- `apps/api/src/modules/reels/` — no `scheduledAt` in create DTO validation

The `scheduledAt` field IS in the Prisma schema (it's used in feed filters), but the create DTOs may silently strip it during validation, meaning the field is sent from mobile but never persisted. The scheduling service expects the field to already be set on the record.

**Impact:** Scheduling a post may silently fail — the post is created immediately (without scheduledAt) instead of being scheduled. The user gets no error but their post appears now instead of at the scheduled time.

---

## Finding 19 — P2 — POST INSIGHTS FALLBACK DISCOVERY DATA IS HARDCODED

**File:** `apps/mobile/app/(screens)/post-insights.tsx`
**Lines:** 91-96, 114-119

```tsx
discovery: (raw.discovery as DiscoverySource[]) ?? [
  { label: t('postInsights.home', 'Home'), percentage: 45, color: colors.emerald },
  { label: t('postInsights.explore', 'Explore'), percentage: 30, color: colors.info },
  { label: t('postInsights.hashtags', 'Hashtags'), percentage: 15, color: colors.gold },
  { label: t('postInsights.otherSource', 'Other'), percentage: 10, color: colors.text.tertiary },
],
```

**Impact:** When the API doesn't return discovery data (which is likely, since the backend `getPostInsights` probably doesn't compute discovery sources), the screen shows hardcoded percentages (45% Home, 30% Explore, 15% Hashtags, 10% Other) that look real. Users will think their post was discovered 45% from Home when it's completely fabricated data. This is misleading and potentially violates consumer trust.

This fallback appears twice — once for when `raw.discovery` is null (line 91) and once for the complete fallback when API returns nothing (line 114).

---

## Finding 20 — P2 — ANALYTICS BAR CHART DATE FORMAT HARDCODED TO en-US

**File:** `apps/mobile/app/(screens)/analytics.tsx`
**Lines:** 106-108

```tsx
<Text style={styles.barLabel}>
  {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
</Text>
```

**Impact:** Date labels are always formatted in English (en-US) regardless of the user's locale. Arabic, Turkish, Urdu, etc. users will see English month abbreviations in their analytics chart. Should use the device locale or pass `undefined` to use the default locale.

---

## Finding 21 — P2 — CREATOR DASHBOARD NESTED FLATLIST (FlatList inside FlatList)

**File:** `apps/mobile/app/(screens)/creator-dashboard.tsx`
**Lines:** 486-531

```tsx
<FlatList
  data={[]}                    // outer FlatList with empty data
  keyExtractor={() => 'dummy'}
  renderItem={null}
  ListHeaderComponent={
    <View>
      <FlatList              // inner FlatList (overview cards)
        data={overviewStats}
        ...
        horizontal
      />
      ...
    </View>
  }
/>
```

**Impact:** A FlatList is used with empty data and `renderItem={null}` solely to get pull-to-refresh behavior. Inside its header, there's another horizontal FlatList. This is an anti-pattern — a ScrollView with RefreshControl would achieve the same result with less overhead. The outer FlatList warns in development about `renderItem` returning null.

---

## Finding 22 — P2 — SCHEDULE-LIVE `dayOptions` REGENERATED EVERY RENDER

**File:** `apps/mobile/app/(screens)/schedule-live.tsx`
**Lines:** 34-46, 71

```tsx
const generateDayOptions = () => { ... };  // module-level function

// Inside component:
const dayOptions = generateDayOptions();   // called every render
```

And in `useEffect`:
```tsx
useEffect(() => {
  const day = dayOptions[selectedDayIndex]?.value;
  ...
}, [selectedDayIndex, selectedHour, selectedMinute, dayOptions]);  // dayOptions in deps
```

**Impact:** `dayOptions` is a new array every render, which causes the `useEffect` to fire on every render (since `dayOptions` is a new reference). This creates an infinite render loop: render -> useEffect -> setTempDate -> re-render -> new dayOptions -> useEffect again. In practice React batches state updates so it may not truly loop, but it causes unnecessary re-renders and the useEffect fires far more than intended.

---

## Finding 23 — P2 — ANALYTICS SCREEN ScreenErrorBoundary WRAPS INCORRECTLY

**File:** `apps/mobile/app/(screens)/analytics.tsx`
**Lines:** 195-274

```tsx
return (
    <ScreenErrorBoundary>
      <SafeAreaView style={styles.container} edges={['top']}>
        ...
      </SafeAreaView>

    </ScreenErrorBoundary>
  );
```

**Impact:** The `ScreenErrorBoundary` wraps the main return but NOT the error return path (lines 176-193). If the error UI itself throws (e.g., if `EmptyState` has a bug), it won't be caught. The error boundary should wrap the entire component, not just one branch. Compare with `creator-dashboard.tsx` which correctly wraps at the export level.

Also note the irregular whitespace on line 272 (blank line between `</SafeAreaView>` and `</ScreenErrorBoundary>`).

---

## Finding 24 — P2 — PROMOTIONS cancelPromotion USES DELETE BUT BACKEND USES POST

**File:** `apps/mobile/src/services/promotionsApi.ts`
**Line:** 9

```tsx
cancelPromotion: (id: string) => api.delete(`/promotions/${id}`),
```

**Backend (promotions.controller.ts lines 61-70):**
```tsx
@Post(':id/cancel')     // POST /promotions/:id/cancel
cancelPromotion(...)
```

**Impact:** Mobile sends `DELETE /promotions/:id` but backend expects `POST /promotions/:id/cancel`. The cancel action will fail with 404 or method-not-allowed.

---

## Finding 25 — P3 — SCHEDULE-POST MONTH NAMES NOT LOCALIZED

**File:** `apps/mobile/app/(screens)/schedule-post.tsx`
**Lines:** 51-52

```tsx
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
```

**Impact:** Month names are hardcoded in English. Arabic, Turkish, Urdu, Bengali, French, Indonesian, and Malay users will see English month names in the calendar. Should use `t()` i18n keys or `Intl.DateTimeFormat` with the user's locale.

---

## Finding 26 — P3 — SCHEDULE-POST WEEKDAY HEADERS NOT LOCALIZED

**File:** `apps/mobile/app/(screens)/schedule-post.tsx`
**Lines:** 236-238

```tsx
{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
  <Text key={i} style={styles.weekdayText}>{day}</Text>
))}
```

**Impact:** Weekday abbreviations are hardcoded to English single letters. Not localized for any of the 8 supported languages.

---

## Finding 27 — P3 — SCHEDULE-POST `fontWeight: '600'` USED INSTEAD OF `fontFamily`

**File:** `apps/mobile/app/(screens)/schedule-post.tsx`
**Lines:** 538, 627, 669, 700, 705, 769, 789, 809, 868, 919

Multiple styles use `fontWeight: '600'` or `fontWeight: '500'` as inline string values instead of using the theme's `fonts.bodySemiBold` or `fonts.bodyMedium` font family names. The project convention (per CLAUDE.md) is to use `fontFamily: fonts.*` from theme.

Example:
```tsx
userName: { fontSize: fontSize.base, fontWeight: '600', color: colors.text.primary },
```

Should be:
```tsx
userName: { fontSize: fontSize.base, fontFamily: fonts.bodySemiBold, color: colors.text.primary },
```

**Count:** At least 10 instances in schedule-post.tsx alone.

---

## Finding 28 — P3 — POST INSIGHTS MISSING RefreshControl

**File:** `apps/mobile/app/(screens)/post-insights.tsx`
**Lines:** 183-189

```tsx
<ScrollView
  contentContainerStyle={...}
  showsVerticalScrollIndicator={false}
>
```

**Impact:** The post-insights screen uses a plain ScrollView with no `RefreshControl`. Per CLAUDE.md rule #7: "ALL FlatLists must have RefreshControl" (and by extension ScrollViews should too for content screens). Users cannot pull-to-refresh to reload insights data. The data is loaded once in `useEffect` with no way to refresh without navigating away and back.

---

## Finding 29 — P3 — BRANDED-CONTENT MISSING RefreshControl

**File:** `apps/mobile/app/(screens)/branded-content.tsx`
**Lines:** 78-85

```tsx
<ScrollView
  style={styles.scroll}
  contentContainerStyle={...}
  showsVerticalScrollIndicator={false}
>
```

**Impact:** Same as Finding 28 — no RefreshControl on ScrollView. Not critical for this particular screen since it's mostly a form, but inconsistent with project standards.

---

## Finding 30 — P3 — ANALYTICS TopContentSection IS A PERMANENT EMPTY STATE

**File:** `apps/mobile/app/(screens)/analytics.tsx`
**Lines:** 117-143

```tsx
function TopContentSection() {
  const { t } = useTranslation();
  // Placeholder for top performing content
  return (
    <Animated.View ...>
      ...
      <EmptyState
        icon="bar-chart-2"
        title={t('analytics.noContentData')}
        subtitle={t('analytics.noContentDataSubtitle')}
      />
    </Animated.View>
  );
}
```

**Impact:** The `TopContentSection` component always renders an `EmptyState`. It never fetches or displays actual top content. It's a stub that appears on every analytics page load, making the section look permanently broken.

---

## Finding 31 — P3 — SCHEDULE-POST USES `Skeleton.Circle` FOR LOADING BUTTON

**File:** `apps/mobile/app/(screens)/schedule-post.tsx`
**Lines:** 488-489

```tsx
{isScheduling ? (
  <Skeleton.Circle size={20} />
```

**Impact:** Per CLAUDE.md rule #9: "ActivityIndicator OK in buttons only — use Skeleton for content loading." This is the opposite — using Skeleton inside a button when ActivityIndicator would be more appropriate. A skeleton in a button looks like a loading placeholder for content rather than an action-in-progress indicator.

---

## Finding 32 — P3 — fonts.mono MAPS TO DMSans_400Regular (NOT A MONO FONT)

**File:** `apps/mobile/app/(screens)/schedule-post.tsx`
**Line:** 765

```tsx
timeOptionText: {
  fontSize: fontSize.base,
  color: colors.text.secondary,
  fontFamily: fonts.mono,         // fonts.mono = 'DMSans_400Regular'
},
```

**File:** `apps/mobile/src/theme/index.ts`
**Line:** 88

```tsx
mono: 'DMSans_400Regular',
```

**Impact:** `fonts.mono` is supposed to be a monospace font for time selectors (hour/minute columns should be evenly spaced), but it's aliased to `DMSans_400Regular` which is a proportional sans-serif font. Numbers in the time picker may have inconsistent widths ("1" narrower than "0"), making the hour/minute selectors look misaligned. This is a cosmetic issue but noticeable in the time picker UI.

---

## Finding 33 — P3 — CREATOR DASHBOARD renderOverviewCard HAS EMPTY DEPENDENCY ARRAY

**File:** `apps/mobile/app/(screens)/creator-dashboard.tsx`
**Line:** 198

```tsx
const renderOverviewCard = useCallback(
  ({ item, index }: { item: OverviewStat; index: number }) => (
    ...
  ),
  [],   // empty deps — captures initial formatNumber/formatChange
);
```

**Impact:** The `renderOverviewCard` callback references `formatNumber` and `formatChange` which are defined inside the component. With `[]` as deps, the callback captures the initial (stale) versions. Since these are pure functions with no closures over state, this works fine in practice. But if the functions were ever refactored to use state/i18n, this would silently break. Low risk but worth noting.

---

## Finding 34 — P3 — CREATOR STOREFRONT `list` STYLE HAS HARDCODED `marginTop: 100`

**File:** `apps/mobile/app/(screens)/creator-storefront.tsx`
**Line:** 296

```tsx
list: {
  flex: 1,
  marginTop: 100,
},
```

**Impact:** The FlatList has a hardcoded `marginTop: 100` to account for the GlassHeader, but GlassHeader height varies based on safe area insets (different devices have different notch sizes). On devices with larger safe areas (iPhone 15 Pro Max), content may overlap or leave excessive gap. Should use `insets.top + headerHeight` dynamically.

Same issue in `branded-content.tsx` line 191:
```tsx
scroll: {
  flex: 1,
  marginTop: 100,
},
```

---

## Summary Table

| # | Severity | File | Line(s) | Description |
|---|----------|------|---------|-------------|
| 1 | P0 | creator-dashboard.tsx | 6, 12 | Duplicate Pressable import |
| 2 | P0 | creator-storefront.tsx | 7, 11 | Duplicate Pressable import |
| 3 | P0 | creator-storefront.tsx | 69 | `/storefront/` endpoint doesn't exist (404) |
| 4 | P0 | promotionsApi.ts | 17-21 | branded content endpoints mismatch (PATCH vs POST, wrong URL) |
| 5 | P0 | promotionsApi.ts | 7 | `/promotions/my` should be `/promotions/mine` |
| 6 | P1 | schedule-post.tsx | 251, 253 | `currentMonth === 2` hardcodes March |
| 7 | P1 | schedule-post.tsx | 32 | Year never changes when month wraps |
| 8 | P1 | schedule-post.tsx | 74-78 | Quick dates hardcoded to day 15, 20 |
| 9 | P1 | schedule-post.tsx | 436 | Timezone hardcoded to UTC+3 |
| 10 | P1 | schedule-post.tsx | 418 | Best time hardcoded to 6:00 PM |
| 11 | P1 | schedule-post.tsx | 256+ | Duplicate accessibilityRole prop (5+ instances) |
| 12 | P1 | analytics.tsx / creator-dashboard.tsx | — | Two competing analytics data sources |
| 13 | P1 | analytics.tsx | 245-259 | Change values show total as delta |
| 14 | P2 | scheduling.service.ts | — | No auto-publisher cron for scheduled posts |
| 15 | P2 | creator-storefront.tsx | 68-71 | Raw api.get instead of service abstraction |
| 16 | P2 | creator-dashboard.tsx | 165-175 | formatNumber duplicated across 4 files |
| 17 | P2 | schedule-post.tsx | 100 | JSON.parse without try/catch |
| 18 | P2 | schedule-post.tsx | 104-123 | scheduledAt not in backend create DTOs |
| 19 | P2 | post-insights.tsx | 91-96, 114-119 | Hardcoded discovery percentages look real |
| 20 | P2 | analytics.tsx | 107 | Date format hardcoded to en-US |
| 21 | P2 | creator-dashboard.tsx | 486-531 | Nested FlatList anti-pattern |
| 22 | P2 | schedule-live.tsx | 71, 79-85 | dayOptions regenerated every render |
| 23 | P2 | analytics.tsx | 195-274 | ScreenErrorBoundary doesn't wrap error path |
| 24 | P2 | promotionsApi.ts | 9 | cancelPromotion DELETE vs POST mismatch |
| 25 | P3 | schedule-post.tsx | 51-52 | Month names not localized |
| 26 | P3 | schedule-post.tsx | 236-238 | Weekday headers not localized |
| 27 | P3 | schedule-post.tsx | multiple | fontWeight string instead of fontFamily |
| 28 | P3 | post-insights.tsx | 183-189 | Missing RefreshControl |
| 29 | P3 | branded-content.tsx | 78-85 | Missing RefreshControl |
| 30 | P3 | analytics.tsx | 117-143 | TopContentSection is permanent empty state |
| 31 | P3 | schedule-post.tsx | 488 | Skeleton.Circle in button (should be ActivityIndicator) |
| 32 | P3 | schedule-post.tsx | 765 | fonts.mono is not monospace |
| 33 | P3 | creator-dashboard.tsx | 198 | Empty useCallback deps with inline functions |
| 34 | P3 | creator-storefront.tsx, branded-content.tsx | 296, 191 | Hardcoded marginTop: 100 |

---

## Key Themes

1. **Endpoint mismatches are rampant** — 4 of the 8 screens/services call endpoints that either don't exist or use the wrong HTTP method/URL. The storefront, branded content, and promotions features are entirely non-functional on the backend.

2. **Schedule-post is hardcoded to March 2026** — Three separate hardcoded values (`currentMonth === 2`, year never updates, quick dates) mean this screen breaks in any month other than March.

3. **Two competing analytics systems** — `analytics.tsx` and `creator-dashboard.tsx` pull from different API endpoints, showing potentially inconsistent data.

4. **Fake data presented as real** — Post insights shows hardcoded discovery percentages (45% Home, 30% Explore, etc.) that look like real analytics data. This is misleading.

5. **No scheduled post auto-publisher** — The entire scheduling feature is a dead end. Posts are created with `scheduledAt` set but nothing ever publishes them.
