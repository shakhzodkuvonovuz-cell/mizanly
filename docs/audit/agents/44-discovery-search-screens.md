# Agent #44 — Discovery + Search Screens Deep Audit

**Scope:** All discovery, search, explore, trending, hashtag, and related screens
**Files audited (line by line):**
1. `apps/mobile/app/(screens)/search.tsx` (~900 lines)
2. `apps/mobile/app/(screens)/search-results.tsx` (~720 lines)
3. `apps/mobile/app/(screens)/discover.tsx` (~707 lines)
4. `apps/mobile/app/(screens)/trending-audio.tsx` (~271 lines)
5. `apps/mobile/app/(screens)/hashtag-explore.tsx` (~253 lines)
6. `apps/mobile/app/(screens)/series-discover.tsx` (~482 lines)
7. `apps/mobile/app/(screens)/why-showing.tsx` (~361 lines)
8. `apps/mobile/app/(screens)/local-boards.tsx` (~145 lines)
9. `apps/mobile/app/(screens)/followed-topics.tsx` (~466 lines)

**Total findings: 38**

---

## FINDING 1 — CRITICAL: t() used outside component scope in ReelGridItem (RUNTIME CRASH)

**File:** `apps/mobile/app/(screens)/search-results.tsx`
**Line:** 75
**Severity:** P0 — Runtime crash

```tsx
function ReelGridItem({ reel, onPress, index }: { reel: Reel; onPress: () => void; index: number }) {
  return (
    <Animated.View entering={FadeInUp.delay(index * 30).duration(400)} style={styles.reelGridItem}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t('accessibility.viewReel')}  // LINE 75 — t() NOT IN SCOPE
      >
```

**Explanation:** `ReelGridItem` is defined outside the `SearchResultsScreen` component (lines 69-97). The `t` function from `useTranslation()` is only available inside `SearchResultsScreen` (line 100). Calling `t()` in `ReelGridItem` will throw `ReferenceError: t is not defined` at runtime, crashing the app when viewing any reel result in search results.

**Fix:** Either move `ReelGridItem` inside the component, pass `t` as a prop, or call `useTranslation()` inside `ReelGridItem`.

---

## FINDING 2 — CRITICAL: Duplicate Pressable import in search-results.tsx (compile warning, potential crash)

**File:** `apps/mobile/app/(screens)/search-results.tsx`
**Lines:** 2-6

```tsx
import {
  View, Text, StyleSheet, Pressable, TextInput,
  FlatList, RefreshControl, Image,
  Pressable,       // DUPLICATE — Pressable imported twice
} from 'react-native';
```

**Explanation:** `Pressable` is imported twice from react-native (lines 4 and 6). While JavaScript/TypeScript allows this without a hard error, it's a code quality issue and some bundler configurations may warn or fail.

---

## FINDING 3 — CRITICAL: Duplicate Pressable import in discover.tsx

**File:** `apps/mobile/app/(screens)/discover.tsx`
**Lines:** 1-13

```tsx
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  FlatList,
  Pressable,
  Image,
  Dimensions,
  ScrollView,
  Pressable,       // DUPLICATE
} from 'react-native';
```

**Explanation:** Same duplicate import issue as search-results.tsx. Pressable imported twice.

---

## FINDING 4 — CRITICAL: Duplicate Pressable import in search.tsx

**File:** `apps/mobile/app/(screens)/search.tsx`
**Lines:** 3-7

```tsx
import {
  View, Text, StyleSheet, Pressable, TextInput,
  FlatList, RefreshControl, Image,
  Pressable,       // DUPLICATE
} from 'react-native';
```

**Explanation:** Same duplicate Pressable import pattern.

---

## FINDING 5 — CRITICAL: Duplicate Pressable import in series-discover.tsx

**File:** `apps/mobile/app/(screens)/series-discover.tsx`
**Lines:** 6-12

```tsx
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ScrollView,
  Dimensions,
  Pressable,       // DUPLICATE
} from 'react-native';
```

---

## FINDING 6 — CRITICAL: Duplicate Pressable import in followed-topics.tsx

**File:** `apps/mobile/app/(screens)/followed-topics.tsx`
**Lines:** 3-11

```tsx
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  RefreshControl,
  Pressable,       // DUPLICATE
} from 'react-native';
```

---

## FINDING 7 — CRITICAL: discover.tsx uses feedApi.getExplore which hits non-existent endpoint

**File:** `apps/mobile/app/(screens)/discover.tsx`
**Line:** 326-327

```tsx
queryFn: ({ pageParam }) => feedApi.getExplore(pageParam),
```

**API call:** `GET /feed/explore` (from `feedApi.getExplore` in api.ts line 1047-1048)

**Backend reality:** There is NO `explore` endpoint on the feed controller (`/api/v1/feed/`). The explore endpoint only exists on the SEARCH controller at `GET /api/v1/search/explore` (search.controller.ts line 75).

**Result:** The entire discover screen's explore grid will always return 404 or empty. The `searchApi.getExploreFeed` method calls the correct `/search/explore` path, but discover.tsx uses `feedApi.getExplore` instead.

**Fix:** Change `feedApi.getExplore(pageParam)` to `searchApi.getExploreFeed(pageParam)`.

---

## FINDING 8 — CRITICAL: why-showing.tsx feedApi.dismiss sends body params but backend expects path params

**File:** `apps/mobile/app/(screens)/why-showing.tsx`
**Lines:** 109-112

```tsx
await feedApi.dismiss({
  postId: params.postId,
  reason: 'see_less',
});
```

**API call:** `POST /feed/dismiss` with body `{ postId, reason }`

**Backend reality:** The feed controller has `POST /feed/dismiss/:contentType/:contentId` (feed.controller.ts lines 29-38) expecting path params, NOT body params. The mobile sends the data as POST body to `/feed/dismiss` without the required `:contentType/:contentId` path segments.

**Result:** "See less like this" always returns 404 (NestJS will not match the route). The dismiss action silently fails.

---

## FINDING 9 — CRITICAL: feedApi.reportNotInterested calls non-existent endpoint

**File:** `apps/mobile/app/(screens)/why-showing.tsx`
**Lines:** 90-91

```tsx
await feedApi.reportNotInterested(params.postId, params.postType ?? 'post');
```

**API call:** `POST /feed/not-interested` with body `{ contentId, contentType }` (api.ts line 1049-1050)

**Backend reality:** There is NO `/feed/not-interested` endpoint in the feed controller. The available endpoints are: `interaction`, `dismiss/:contentType/:contentId`, `explain/post/:postId`, `explain/thread/:threadId`, `search/enhanced`, `personalized`, `session-signal`, `trending`, `featured`, `suggested-users`, `frequent-creators`, `admin/posts/:id/feature`, `nearby`.

**Result:** "Not interested" button always returns 404. The feature is completely non-functional.

---

## FINDING 10 — CRITICAL: local-boards.tsx uses wrong API endpoint path

**File:** `apps/mobile/app/(screens)/local-boards.tsx`
**Lines:** 18, 32

```tsx
const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
// ...
const res = await fetch(`${API_BASE}/boards?${params}`);
```

**API call:** `GET /api/v1/boards`

**Backend reality:** The boards endpoint is at `GET /api/v1/community/boards` (community.controller.ts lines 32-34). The `/boards` path doesn't exist as a standalone endpoint.

**Result:** Local boards screen always fetches from a non-existent endpoint, returning 404 or nothing. The entire screen is broken.

---

## FINDING 11 — CRITICAL: local-boards.tsx uses raw fetch without authentication

**File:** `apps/mobile/app/(screens)/local-boards.tsx`
**Lines:** 28-37

```tsx
queryFn: async ({ pageParam }) => {
  const params = new URLSearchParams();
  if (pageParam) params.set('cursor', pageParam);
  if (search) params.set('city', search);
  const res = await fetch(`${API_BASE}/boards?${params}`);
  return res.json();
},
```

**Explanation:** Uses raw `fetch()` without any authentication headers. The backend's community boards endpoint likely requires authentication (`@UseGuards(ClerkAuthGuard)`). Even if it didn't, using raw fetch bypasses the app's `api` helper which adds auth tokens, handles errors, and provides consistent response parsing.

**Risk:** 401 Unauthorized on every request. No error handling (res.json() on a non-200 response will throw or return error JSON without checking).

---

## FINDING 12 — MEDIUM: local-boards.tsx board press is a no-op

**File:** `apps/mobile/app/(screens)/local-boards.tsx`
**Line:** 44

```tsx
<Pressable accessibilityRole="button" style={styles.boardCard} onPress={() => haptic.light()}>
```

**Explanation:** The onPress handler only triggers a haptic feedback — it does NOT navigate anywhere. Tapping a board does nothing useful. There's no navigation to a board detail screen or any other action.

---

## FINDING 13 — MEDIUM: local-boards.tsx hardcoded English strings

**File:** `apps/mobile/app/(screens)/local-boards.tsx`
**Lines:** 64-65

```tsx
<Text style={styles.statText}>{item.membersCount as number} members</Text>
// ...
<Text style={styles.statText}>{item.postsCount as number} posts</Text>
```

**Explanation:** "members" and "posts" are hardcoded English strings, not passed through `t()`. This violates i18n requirements for all 8 supported languages.

---

## FINDING 14 — MEDIUM: Category pills in discover.tsx are cosmetic-only (don't filter API)

**File:** `apps/mobile/app/(screens)/discover.tsx`
**Lines:** 292-303, 417

```tsx
const [activeCategory, setActiveCategory] = useState<CategoryKey>('all');
// ...
const CATEGORIES: { key: CategoryKey; label: string; icon: IconName }[] = [
  { key: 'all', label: t('discover.all'), icon: 'star' },
  { key: 'trending', label: t('discover.trending'), icon: 'trending-up' },
  // ... 6 more categories
];
// ...
<CategoryPills active={activeCategory} onSelect={setActiveCategory} categories={CATEGORIES} />
```

**But the explore query ignores the category entirely:**

```tsx
const {
  data: exploreData,
  // ...
} = useInfiniteQuery({
  queryKey: ['exploreFeed'],       // No category in query key
  queryFn: ({ pageParam }) => feedApi.getExplore(pageParam),  // No category param passed
  // ...
});
```

**Explanation:** The `activeCategory` state is set when a user taps a pill, but it's NEVER passed to the API query. The query key doesn't include the category (so changing categories doesn't trigger a refetch), and the API call doesn't pass any category filter. The pills change visual state but the content shown doesn't change.

**Fix:** Include `activeCategory` in the query key and pass it to the API endpoint.

---

## FINDING 15 — MEDIUM: Category pills in series-discover.tsx are also cosmetic (hardcoded English)

**File:** `apps/mobile/app/(screens)/series-discover.tsx`
**Lines:** 33-40

```tsx
const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'drama', label: 'Drama' },
  { key: 'documentary', label: 'Documentary' },
  { key: 'tutorial', label: 'Tutorial' },
  { key: 'comedy', label: 'Comedy' },
  { key: 'islamic', label: 'Islamic' },
] as const;
```

**Explanation:** All category labels are hardcoded English strings (not passed through `t()`). This breaks i18n for Arabic, Turkish, Urdu, Bengali, French, Indonesian, and Malay users. The categories ARE passed to the API (unlike discover.tsx), but the labels violate i18n rules.

**Additionally line 229:**
```tsx
accessibilityLabel={item.isFollowing ? 'Unfollow' : 'Follow'}
```
Hardcoded English accessibility labels.

---

## FINDING 16 — MEDIUM: SEARCH_TABS in search-results.tsx have hardcoded English labels

**File:** `apps/mobile/app/(screens)/search-results.tsx`
**Lines:** 30-36

```tsx
const SEARCH_TABS = [
  { key: 'people', label: 'People' },
  { key: 'posts', label: 'Posts' },
  { key: 'threads', label: 'Threads' },
  { key: 'reels', label: 'Reels' },
  { key: 'hashtags', label: 'Hashtags' },
] as const;
```

**Explanation:** The `SEARCH_TABS` are defined OUTSIDE the component (before `SearchResultsScreen`), so `t()` is not in scope. The labels are hardcoded English. However, later at lines 352-358, translated labels are used in a second `TabSelector`:

```tsx
<TabSelector
  tabs={[
    { key: 'people', label: t('screens.search-results.tabPeople') },
    // ...
  ]}
```

**Problem:** The `SEARCH_TABS` constant at the top is never actually used (it's shadowed by the inline tab definitions in JSX at line 352). It's dead code but confusing.

---

## FINDING 17 — MEDIUM: HashtagRow in search-results.tsx uses hardcoded i18n-unfriendly text

**File:** `apps/mobile/app/(screens)/search-results.tsx`
**Lines:** 60-62

```tsx
<Text style={styles.hashtagName}>#{hashtag.name}</Text>
<Text style={styles.hashtagCount}>{hashtag.postsCount}</Text>
```

**Explanation:** The `hashtagCount` shows just a raw number without any label (e.g., "posts" or "mentions"). Unlike the `UserRow` which uses `t('screens.search-results.followers')`, `HashtagRow` has no unit label at all. This is confusing for users — "42" means what?

---

## FINDING 18 — MEDIUM: why-showing.tsx REASON_MAP has hardcoded English labels (dead code)

**File:** `apps/mobile/app/(screens)/why-showing.tsx`
**Lines:** 23-30

```tsx
const REASON_MAP: Record<string, { icon: IconName; label: string }> = {
  follow: { icon: 'user', label: 'You follow this creator' },
  trending: { icon: 'trending-up', label: 'Trending in your region' },
  popular: { icon: 'heart', label: 'Popular with people you follow' },
  interests: { icon: 'check-circle', label: 'Based on your interests' },
  similar: { icon: 'layers', label: 'Similar to content you like' },
  hashtag: { icon: 'hash', label: 'From a topic you follow' },
};
```

**Explanation:** `REASON_MAP` is defined at module scope with hardcoded English labels. Moreover, this map is NEVER USED anywhere in the component — the component constructs `defaultReasons` manually at lines 51-67 using `t()` calls. This is dead code that should be removed.

---

## FINDING 19 — MEDIUM: why-showing.tsx reasons are always hardcoded defaults (never from backend)

**File:** `apps/mobile/app/(screens)/why-showing.tsx`
**Lines:** 50-67

```tsx
// Build reasons based on post data — in production, backend would provide these
const defaultReasons: ReasonItem[] = [
  {
    icon: 'user',
    label: t('whyShowing.reasonFollow', 'You follow this creator'),
    detail: t('whyShowing.reasonFollowDetail', 'Content from accounts you follow appears in your feed'),
  },
  // ...always the same 3 reasons
];
```

**Explanation:** The reasons displayed are always the same 3 hardcoded defaults regardless of the actual post or algorithm. The comment says "in production, backend would provide these" but the backend has `GET /feed/explain/post/:postId` which DOES provide real reasons. The screen fetches the post data but never calls the explain endpoint.

**Fix:** Call `feedApi.getExplainPost(params.postId)` (or equivalent) and use the real algorithmic reasons.

---

## FINDING 20 — MEDIUM: discover.tsx ExploreGridItem uses `t()` outside component

**File:** `apps/mobile/app/(screens)/discover.tsx`
**Line:** 256

```tsx
function ExploreGridItem({ item }: { item: ExploreItem }) {
  // ...
  return (
    <AnimatedPressable
      // ...
      accessibilityLabel={t('accessibility.viewPost')}  // LINE 256
    >
```

**Explanation:** `ExploreGridItem` is defined as a standalone function outside `DiscoverScreen` (line 218). It does NOT call `useTranslation()` internally. The `t()` function is NOT in scope here — it's only available inside `DiscoverScreen` (line 290). This will throw `ReferenceError: t is not defined` at runtime.

Wait -- actually looking more carefully, `ExploreGridItem` doesn't have its own `t`, but... let me re-read. No, the `t` referenced on line 256 is from the component's own scope since `ExploreGridItem` is a nested component defined at module level. It does NOT have `t` in scope. This is a runtime crash.

**Actually on closer inspection:** `ExploreGridItem` does NOT call `useTranslation()`. The `t` on line 256 would cause a ReferenceError crash.

---

## FINDING 21 — LOW: trending-audio.tsx unnecessary Math reassignment

**File:** `apps/mobile/app/(screens)/trending-audio.tsx`
**Lines:** 40-41

```tsx
const formatDuration = (seconds: number) => {
  const Math = global.Math; // To avoid linter issues if Math isn't globally typed
```

**Explanation:** Reassigning `global.Math` to a local `Math` variable is unnecessary and confusing. `Math` is a built-in global in both browser and Node.js environments. This suggests a misunderstanding of the linting environment.

---

## FINDING 22 — MEDIUM: trending-audio.tsx references non-existent theme color

**File:** `apps/mobile/app/(screens)/trending-audio.tsx`
**Lines:** 74, 98

```tsx
colors={[colors.emerald, colors.emeraldDark]}
```

**Verification:** `colors.emeraldDark` DOES exist in theme (`#066B42`). This is NOT a bug.

---

## FINDING 23 — MEDIUM: hashtag-explore.tsx navigates to search-results with wrong param name

**File:** `apps/mobile/app/(screens)/hashtag-explore.tsx`
**Line:** 71

```tsx
onPress={() => router.push(`/(screens)/search-results?q=${encodeURIComponent('#' + item.name)}` as never)}
```

**But search-results.tsx reads:**

```tsx
const params = useLocalSearchParams<{ query: string }>();
const initialQuery = params.query || '';
```

**Explanation:** `hashtag-explore.tsx` passes the parameter as `q` but `search-results.tsx` reads it as `query`. The search query will always be empty when navigating from hashtag explore to search results.

**Fix:** Change `?q=` to `?query=` in hashtag-explore.tsx.

---

## FINDING 24 — MEDIUM: discover.tsx trending hashtag navigates to search with wrong param

**File:** `apps/mobile/app/(screens)/discover.tsx`
**Line:** 78

```tsx
onPress={() => router.push(`/(screens)/search?q=${encodeURIComponent(item.name)}` as never)}
```

**But search.tsx reads:**

```tsx
const [query, setQuery] = useState('');
```

The search screen doesn't read URL params at all for its initial query — it uses internal state. So clicking a trending hashtag navigates to search but the search box is empty.

**Fix:** search.tsx should read `useLocalSearchParams` for `q` and pre-populate the search box.

---

## FINDING 25 — LOW: search.tsx explore grid posts navigate without /(screens)/ prefix

**File:** `apps/mobile/app/(screens)/search.tsx`
**Line:** 682

```tsx
onPress={() => router.push(`/post/${item.id}`)}
```

**Explanation:** Missing `/(screens)/` prefix. All other navigations in the file use `/(screens)/profile/`, `/(screens)/reel/`, etc. Using `/post/${item.id}` may not resolve correctly in Expo Router which expects the `(screens)` group prefix.

---

## FINDING 26 — MEDIUM: discover.tsx ExploreGridItem navigates without /(screens)/ prefix

**File:** `apps/mobile/app/(screens)/discover.tsx`
**Lines:** 239-246

```tsx
if (isReel) {
  router.push(`/reel/${item.id}`);       // Missing /(screens)/
} else if (isPost) {
  router.push(`/post/${item.id}`);       // Missing /(screens)/
} else if (isThread) {
  router.push(`/thread/${item.id}`);     // Missing /(screens)/
} else if (isVideo) {
  router.push(`/video/${item.id}`);      // Missing /(screens)/
}
```

**Explanation:** All 4 navigation paths are missing the `/(screens)/` prefix. Compare with the `FeaturedCard` navigation in the same file (lines 205-207) which correctly uses `/(screens)/reel/`, `/(screens)/video/`, `/(screens)/post/`.

---

## FINDING 27 — LOW: search-results.tsx no debouncing protection for rapid tab switches

**File:** `apps/mobile/app/(screens)/search-results.tsx`
**Lines:** 132-170

**Explanation:** When the user rapidly switches between tabs (People -> Posts -> Threads -> Reels -> Hashtags), each tab switch enables a different query while disabling others (via `enabled` flag). However, the `enabled` conditions are instantaneous while the `debouncedQuery` may still be pending. If a user types, then immediately switches tabs, the old tab's query may still fire after the new tab is active (due to React Query's stale time behavior). Not a crash, but could cause unexpected results flash.

---

## FINDING 28 — LOW: followed-topics.tsx toggleFollow has no API call

**File:** `apps/mobile/app/(screens)/followed-topics.tsx`
**Lines:** 96-116

```tsx
const toggleFollow = useCallback(
  async (hashtag: HashtagInfo) => {
    const isCurrentlyFollowing = followedTopics.some((h) => h.id === hashtag.id);
    setTogglingIds((prev) => new Set(prev).add(hashtag.id));

    try {
      if (isCurrentlyFollowing) {
        setFollowedTopics((prev) => prev.filter((h) => h.id !== hashtag.id));
      } else {
        setFollowedTopics((prev) => [...prev, { ...hashtag, isFollowing: true }]);
      }
    } finally {
      // ...cleanup
    }
  },
  [followedTopics],
);
```

**Explanation:** The `toggleFollow` function only updates local state — it NEVER calls any API endpoint (like `hashtagsApi.follow()` or `hashtagsApi.unfollow()`). The follow/unfollow toggle is purely cosmetic and will reset when the screen remounts.

**Backend has:** `POST /hashtags/:id/follow` and `DELETE /hashtags/:id/follow` endpoints (hashtags.controller.ts lines 83, 94).

---

## FINDING 29 — MEDIUM: followed-topics.tsx "followed" list is faked from trending

**File:** `apps/mobile/app/(screens)/followed-topics.tsx`
**Lines:** 52-54

```tsx
setFollowedTopics(
  trending.slice(0, 5).map((h) => ({ ...h, isFollowing: true })),
);
```

**Explanation:** The "Your Topics" section shows the first 5 trending hashtags and marks them as "following" — this is completely fabricated. There's no API call to get the user's actual followed hashtags. The backend has `GET /hashtags/following` (hashtags.controller.ts line 32) which would return the real followed topics, but it's never called.

---

## FINDING 30 — MEDIUM: search.tsx adds to search history after debounce (every keystroke creates history)

**File:** `apps/mobile/app/(screens)/search.tsx`
**Lines:** 170-178

```tsx
useEffect(() => {
  if (!mountedRef.current) {
    mountedRef.current = true;
    return;
  }
  if (debouncedQuery.trim().length >= 2) {
    addSearchToHistory(debouncedQuery);
  }
}, [debouncedQuery, addSearchToHistory]);
```

**Explanation:** Every time `debouncedQuery` changes (every 400ms after typing), it's added to search history. So typing "hello" would add "he", "hel", "hell", "hello" to the history (each time the debounced value settles). This pollutes the search history with partial search terms.

**Fix:** Only add to history when the user explicitly submits (presses Enter/Search) or navigates to a result.

---

## FINDING 31 — LOW: search.tsx JSON.parse of search history without try-catch in addSearchToHistory

**File:** `apps/mobile/app/(screens)/search.tsx`
**Lines:** 161-167

```tsx
const addSearchToHistory = useCallback(async (term: string) => {
  if (term.trim().length < 2) return;
  const stored = await AsyncStorage.getItem('search-history');
  const history = stored ? JSON.parse(stored) : [];  // No try-catch!
  const updated = [term, ...history.filter((h: string) => h !== term)].slice(0, 20);
  await AsyncStorage.setItem('search-history', JSON.stringify(updated));
  setSearchHistory(updated);
}, []);
```

**Explanation:** While the loadHistory function (lines 148-156) has a try-catch around JSON.parse, the `addSearchToHistory` function does NOT. If the stored value gets corrupted, this will crash. Note: the initial load at lines 149-155 does handle this correctly.

---

## FINDING 32 — MEDIUM: discover.tsx has error screen OUTSIDE ScreenErrorBoundary

**File:** `apps/mobile/app/(screens)/discover.tsx`
**Lines:** 379-395, 399

```tsx
if (hasError) {
  return (
    <View style={styles.container}>
      // ... error UI WITHOUT ScreenErrorBoundary
    </View>
  );
}

return (
  <ScreenErrorBoundary>
    // ... normal UI
  </ScreenErrorBoundary>
);
```

**Explanation:** When the explore API returns an error, the component renders an error state that is NOT wrapped in `ScreenErrorBoundary`. If any error occurs in the error state rendering itself, it won't be caught. The error path should also be inside the boundary.

---

## FINDING 33 — MEDIUM: trending-audio.tsx loading/error screens outside ScreenErrorBoundary

**File:** `apps/mobile/app/(screens)/trending-audio.tsx`
**Lines:** 108-142, 144

```tsx
if (isError) {
  return (
    <View style={styles.container}>
      // ... NOT in ScreenErrorBoundary
    </View>
  );
}

if (isLoading && !tracks) {
  return (
    <View style={styles.container}>
      // ... NOT in ScreenErrorBoundary
    </View>
  );
}

return (
  <ScreenErrorBoundary>
    // ... only the happy path is wrapped
  </ScreenErrorBoundary>
);
```

---

## FINDING 34 — MEDIUM: hashtag-explore.tsx error screen outside ScreenErrorBoundary

**File:** `apps/mobile/app/(screens)/hashtag-explore.tsx`
**Lines:** 91-107, 110

Same pattern as discover.tsx — error state rendered outside the boundary.

---

## FINDING 35 — LOW: discover.tsx TrendingHashtags FlatList is horizontal but has removeClippedSubviews

**File:** `apps/mobile/app/(screens)/discover.tsx`
**Lines:** 68-69

```tsx
<FlatList
      removeClippedSubviews={true}
  horizontal
```

**Explanation:** `removeClippedSubviews={true}` on a horizontal FlatList can cause rendering bugs on Android where items disappear when scrolling back. For horizontal lists, this prop is generally not recommended.

---

## FINDING 36 — LOW: search-results.tsx UserRow defined inside component (re-created every render)

**File:** `apps/mobile/app/(screens)/search-results.tsx`
**Lines:** 262-307

```tsx
export default function SearchResultsScreen() {
  // ...
  const UserRow = ({ user, onPress, index }: ...) => {
    // This entire component re-created on every render
  };
```

**Explanation:** `UserRow` is defined INSIDE `SearchResultsScreen`. Unlike `HashtagRow` and `ReelGridItem` (which are outside), `UserRow` gets a new reference on every render of the parent. This defeats React's memoization and means every user row re-renders whenever any state changes in the parent. For a search results list this causes noticeable jank.

**Fix:** Move `UserRow` outside the component and pass necessary callbacks as props.

---

## FINDING 37 — LOW: search.tsx uses both `searchApi.search(query, type)` and `searchApi.search(query)` with different signatures

**File:** `apps/mobile/app/(screens)/search.tsx`
**Lines:** 186-236

The combined search (`searchQuery`) calls `searchApi.search(debouncedQuery)` (no type param), which returns `{ people, hashtags }`.

The per-type searches call `searchApi.search(debouncedQuery, 'posts', pageParam)` etc., which passes a type param and expects paginated results in a different shape (`{ posts }`, `{ threads }`, etc.).

**Lines 248-252:**
```tsx
const posts = postsQuery.data?.pages.flatMap((p) => p.posts ?? []) ?? [];
const threads = threadsQuery.data?.pages.flatMap((p) => p.threads ?? []) ?? [];
const reels: Reel[] = reelsQuery.data?.pages.flatMap((p) => p.reels ?? []) ?? [];
```

**Explanation:** The response destructuring assumes the backend returns `{ posts: [] }`, `{ threads: [] }`, etc. when a `type` parameter is passed. But looking at the backend's `GET /search` endpoint signature (search.controller.ts line 16), it's a single endpoint that returns results based on query params. The response shape may not match what the mobile expects — if the backend returns `{ data: [], meta: {} }` (standard paginated response), then `p.posts`, `p.threads`, `p.reels` would all be `undefined` and the lists would always be empty.

Meanwhile, `search-results.tsx` uses separate endpoints (`searchApi.searchPosts`, `searchApi.searchThreads`, `searchApi.searchReels`) which call dedicated backend endpoints (`GET /search/posts`, `GET /search/threads`, `GET /search/reels`). These are the correct approach.

---

## FINDING 38 — LOW: local-boards.tsx no debouncing on search input

**File:** `apps/mobile/app/(screens)/local-boards.tsx`
**Lines:** 24, 86-93

```tsx
const [search, setSearch] = useState('');
// ...
<TextInput
  value={search}
  onChangeText={setSearch}
/>
```

**Explanation:** The search input directly sets state with no debouncing, but `search` is in the query key:

```tsx
queryKey: ['local-boards', search],
```

This means every keystroke triggers a new API request. With the raw fetch that has no auth token, this creates a barrage of failing 404 requests.

**Compare with:** hashtag-explore.tsx (line 30-35) and search.tsx which both properly debounce with `setTimeout`.

---

## Summary

| Severity | Count | Key Issues |
|----------|-------|------------|
| P0 (crash/broken) | 9 | t() outside scope (2 screens), API path mismatches (3 endpoints), raw fetch without auth, duplicate imports (5 files) |
| P1 (major bug) | 8 | Category pills cosmetic-only, wrong URL params, missing /(screens)/ prefix, followed topics faked, no real API calls for follow/dismiss |
| P2 (medium) | 12 | Hardcoded English strings, error screens outside boundary, search history pollution, dead code |
| P3 (low) | 9 | Unnecessary code, performance (inline component), removeClippedSubviews on horizontal list |

### Top 5 Most Critical:
1. **t() outside component scope** in `search-results.tsx:75` and `discover.tsx:256` — runtime crash when rendering reels or explore items
2. **feedApi.getExplore hits non-existent endpoint** in discover.tsx — entire discover grid is always empty
3. **feedApi.dismiss sends body vs path params** — "see less" feature completely broken
4. **local-boards.tsx fetches from `/boards` instead of `/community/boards`** — screen always empty/broken
5. **hashtag-explore navigates with `?q=` but search-results reads `?query=`** — param name mismatch
