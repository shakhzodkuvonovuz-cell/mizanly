# Batch 22: Mobile App Polish & Robustness

## Overview
This batch focuses on making the Mizanly mobile app feel production-ready by fixing navigation crashes, adding error states, and cleaning up code quality violations. All work is in `apps/mobile/`.

**Total tasks: 5 groups, ~65 file touches**

---

## ABSOLUTE RULES — READ BEFORE TOUCHING ANY CODE

These rules are NON-NEGOTIABLE. Violating any of them will break the app or create technical debt.

### Component Rules
1. **NEVER use React Native `Modal`** — Always use `<BottomSheet>` from `@/components/ui/BottomSheet`
2. **NEVER use bare `<ActivityIndicator>` for content loading** — Use `<Skeleton.Rect>`, `<Skeleton.Circle>`, `<Skeleton.PostCard>`, etc. from `@/components/ui/Skeleton`. ActivityIndicator is ONLY acceptable inside buttons during mutation loading.
3. **NEVER use bare `<Text>No items</Text>` for empty lists** — Use `<EmptyState icon="..." title="..." />` from `@/components/ui/EmptyState`
4. **NEVER use text emoji for icons** (no `←`, `✕`, `✓`) — Use `<Icon name="arrow-left" />`, `<Icon name="x" />`, `<Icon name="check" />` from `@/components/ui/Icon`
5. **NEVER use `<VerifiedBadge>` as text** — Always `<VerifiedBadge size={13} />`
6. **NEVER use plain `{n}/500` for char counts** — Use `<CharCountRing current={n} max={500} />`

### Style Rules
7. **NEVER hardcode `borderRadius` >= 6** — Use `radius.sm` (6), `radius.md` (10), `radius.lg` (16), `radius.xl` (24), `radius.full` (9999) from `@/theme`
8. **NEVER hardcode colors** — Use tokens from `@/theme` (e.g., `colors.text.primary`, `colors.dark.bg`, `colors.emerald`)
9. **NEVER use CSS `linear-gradient(...)` strings** — Use `expo-linear-gradient` component
10. **ALL FlatLists/FlashLists MUST have pull-to-refresh** — Either `<RefreshControl tintColor={colors.emerald} />` or the `onRefresh`+`refreshing` shorthand props

### TypeScript Rules
11. **NEVER use `as any`** — Find the correct type instead
12. **NEVER use `@ts-ignore` or `@ts-expect-error`** — Fix the actual type error
13. **NEVER add `// @ts-nocheck`**

### Import Paths
14. All imports from the project use `@/` prefix (e.g., `@/components/ui/Icon`, `@/theme`, `@/services/api`)
15. Import `colors, spacing, fontSize, radius, shadow, animation` from `@/theme`
16. Import `Icon` from `@/components/ui/Icon`
17. Import `EmptyState` from `@/components/ui/EmptyState`
18. Import `Skeleton` from `@/components/ui/Skeleton`
19. Import `GlassHeader` from `@/components/ui/GlassHeader`
20. Import `GradientButton` from `@/components/ui/GradientButton`

### Navigation
21. All screen routes use `/(screens)/` prefix: `router.push('/(screens)/search')` NOT `router.push('/search')`
22. Tab routes use `/(tabs)/`: `/(tabs)/saf`, `/(tabs)/majlis`, etc.

---

## AVAILABLE COMPONENTS REFERENCE

### Icon — Valid Names (use ONLY these)
```
heart, heart-filled, message-circle, bookmark, bookmark-filled, send, search, home,
play, pause, rewind, fast-forward, more-horizontal, share, check-circle, arrow-left,
plus, camera, image, mic, phone, video, settings, bell, user, users, globe, lock,
flag, trash, edit, x, chevron-right, chevron-left, chevron-down, repeat, eye, eye-off,
volume-x, volume-1, volume-2, mail, hash, trending-up, map-pin, link, clock, check,
check-check, paperclip, smile, at-sign, filter, layers, circle-plus, pencil, slash,
log-out, bar-chart-2, loader, maximize, music
```

### Avatar Sizes
`xs` (24px), `sm` (32px), `md` (40px), `lg` (52px), `xl` (64px), `2xl` (96px), `3xl` (128px)

### Skeleton Variants
```tsx
<Skeleton.Circle size={40} />
<Skeleton.Rect width="100%" height={14} borderRadius={radius.sm} />
<Skeleton.Text width="60%" />
<Skeleton.PostCard />
<Skeleton.ThreadCard />
<Skeleton.ConversationItem />
<Skeleton.ProfileHeader />
```

### EmptyState
```tsx
<EmptyState
  icon="flag"           // any valid Icon name
  title="Something went wrong"
  subtitle="We couldn't load this content"
  actionLabel="Try Again"
  onAction={() => query.refetch()}
/>
```

### GlassHeader
```tsx
<GlassHeader
  title="Screen Title"
  leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }}
  rightActions={[{ icon: 'search', onPress: handleSearch, accessibilityLabel: 'Search' }]}
/>
```

### Spacing Tokens
```
spacing.xs = 4    spacing.sm = 8    spacing.md = 12
spacing.base = 16  spacing.lg = 20   spacing.xl = 24   spacing['2xl'] = 32
```

### Radius Tokens
```
radius.sm = 6    radius.md = 10    radius.lg = 16    radius.xl = 24    radius.full = 9999
```

---

## TASK 1: Fix Navigation Crashes (3 files)

### 1A. Fix `discover.tsx` — Invalid route paths

**File:** `apps/mobile/app/(screens)/discover.tsx`

Find ALL instances of `router.push('/search')` and `router.push('/search?q=...')` and change them to use `/(screens)/search`:

```tsx
// WRONG (will crash):
router.push('/search')
router.push(`/search?q=${encodeURIComponent(item.name)}`)

// CORRECT:
router.push('/(screens)/search')
router.push(`/(screens)/search?q=${encodeURIComponent(item.name)}`)
```

There are 4 instances to fix (approximately lines 65, 203, 221, 245).

### 1B. Fix `profile/[username].tsx` — Dead route: watch-later

**File:** `apps/mobile/app/(screens)/profile/[username].tsx`

Find the `router.push('/(screens)/watch-later')` call (approximately line 598). The screen `watch-later.tsx` does NOT exist. Change it to navigate to `watch-history` instead:

```tsx
// WRONG (will crash — screen doesn't exist):
router.push('/(screens)/watch-later')

// CORRECT:
router.push('/(screens)/watch-history')
```

Also update any label text near this button from "Watch Later" to "Watch History" if applicable.

### 1C. Fix `profile/[username].tsx` — Dead route: majlis-lists

**File:** `apps/mobile/app/(screens)/profile/[username].tsx`

Find the `router.push('/(screens)/majlis-lists')` call (approximately line 653). The screen `majlis-lists.tsx` does NOT exist. **Remove the entire button/pressable that navigates to this route**, since the feature doesn't exist yet. Do NOT create a new screen file — just remove the dead navigation button.

---

## TASK 2: Add Error States to 36 Screens

Every screen that fetches data with `useQuery` or `useInfiniteQuery` needs an error state. Here is the EXACT pattern to follow:

### The Pattern

For screens that have a `GlassHeader`, add the error check AFTER the loading check but BEFORE the main content render:

```tsx
// Step 1: Find the main query. Example:
const { data, isLoading, isError, refetch } = useQuery({ ... });
// OR for infinite queries:
const feedQuery = useInfiniteQuery({ ... });

// Step 2: Add isError to the destructured values if not already there

// Step 3: Add error UI. Place it after loading skeleton check, before main content.
// The error state should show the same shell (GlassHeader + container) but with EmptyState:

if (isError) {    // or feedQuery.isError
  return (
    <View style={styles.container}>
      <GlassHeader
        title="Screen Title"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }}
      />
      <View style={styles.headerSpacer} />
      <EmptyState
        icon="flag"
        title="Couldn't load content"
        subtitle="Check your connection and try again"
        actionLabel="Retry"
        onAction={() => refetch()}    // or feedQuery.refetch()
      />
    </View>
  );
}
```

**IMPORTANT:**
- If the screen already imports `EmptyState`, reuse it. If not, add the import: `import { EmptyState } from '@/components/ui/EmptyState';`
- If the screen already imports `GlassHeader`, reuse it. If not, just wrap in the container View without GlassHeader.
- Use the SAME `styles.container` that the screen already defines.
- If the screen has a `headerSpacer` style, include it. If not, skip it.
- Match the GlassHeader title to whatever the screen's header title already is.
- For screens with MULTIPLE queries, check the PRIMARY data query only (not mutation queries).

### Screens to Add Error States To

**These 36 screens need error states added. Each one uses `useQuery` or `useInfiniteQuery` but has NO `isError` check:**

**Group A — List/Feed screens (have FlatList + GlassHeader):**
1. `archive.tsx` — title: "Archive"
2. `blocked.tsx` — title: "Blocked Users"
3. `blocked-keywords.tsx` — title: "Blocked Keywords"
4. `bookmark-folders.tsx` — title: "Bookmark Folders"
5. `circles.tsx` — title: "Circles"
6. `close-friends.tsx` — title: "Close Friends"
7. `collab-requests.tsx` — title: "Collab Requests"
8. `community-posts.tsx` — title: "Community"
9. `drafts.tsx` — title: "Drafts"
10. `follow-requests.tsx` — title: "Follow Requests"
11. `followers/[userId].tsx` — title: "Followers"
12. `following/[userId].tsx` — title: "Following"
13. `hashtag/[tag].tsx` — title: uses the hashtag name
14. `mutual-followers.tsx` — title: "Mutual Followers"
15. `muted.tsx` — title: "Muted"
16. `notifications.tsx` — title: "Notifications"
17. `saved.tsx` — title: "Saved"
18. `search-results.tsx` — title: "Search Results"
19. `watch-history.tsx` — title: "Watch History"
20. `broadcast-channels.tsx` — title: "Broadcast Channels"

**Group B — Detail screens (have GlassHeader or custom header):**
21. `conversation-info.tsx` — title: "Info"
22. `conversation-media.tsx` — title: "Media"
23. `discover.tsx` — title: "Discover"
24. `analytics.tsx` — title: "Analytics"
25. `account-settings.tsx` — title: "Account"

**Group C — Composer/form screens (have GlassHeader, only need error on initial data fetch):**
26. `create-post.tsx` — only if it fetches initial data (draft loading)
27. `create-thread.tsx` — only if it fetches initial data (draft loading)
28. `create-reel.tsx` — only if it fetches initial data
29. `create-video.tsx` — only if it fetches initial data
30. `create-story.tsx` — only if it fetches initial data
31. `edit-profile.tsx` — title: "Edit Profile"

**Group D — Other screens:**
32. `new-conversation.tsx` — title: "New Message"
33. `search.tsx` — title: "Search"
34. `share-profile.tsx` — title: "Share Profile"
35. `story-viewer.tsx` — no header, show centered EmptyState only
36. `conversation/[id].tsx` — title: uses conversation name

**IMPORTANT for Group C:** These screens use queries to load drafts or existing data for editing. Only add error handling if the screen has a `useQuery` that fetches data on mount. If the query is only for autocomplete/suggestions, skip the error state.

---

## TASK 3: Fix Hardcoded borderRadius (1 file)

### 3A. Fix `bakra.tsx` — Hardcoded borderRadius: 7

**File:** `apps/mobile/app/(tabs)/bakra.tsx`

Find:
```tsx
borderRadius: 7
```

Replace with:
```tsx
borderRadius: radius.sm
```

Make sure `radius` is imported from `@/theme` (it likely already is).

---

## TASK 4: Add `removeClippedSubviews` to FlatLists (Performance)

Add `removeClippedSubviews={true}` to FlatList/FlashList components in these high-traffic screens. Only add it if the component does NOT already have it.

**DO NOT add it to:** screens that already have it (saf.tsx, majlis.tsx, risalah.tsx, bakra.tsx, minbar.tsx — these 5 tabs already have it).

**Add to these screens' FlatList/FlashList:**
1. `search-results.tsx`
2. `search.tsx`
3. `notifications.tsx`
4. `followers/[userId].tsx`
5. `following/[userId].tsx`
6. `hashtag/[tag].tsx`
7. `saved.tsx`
8. `watch-history.tsx`
9. `community-posts.tsx`
10. `conversation-media.tsx`
11. `archive.tsx`
12. `bookmark-folders.tsx`
13. `blocked.tsx`
14. `muted.tsx`
15. `circles.tsx`
16. `close-friends.tsx`
17. `mutual-followers.tsx`
18. `broadcast-channels.tsx`
19. `collab-requests.tsx`
20. `follow-requests.tsx`

Just add `removeClippedSubviews={true}` as a prop on the FlatList/FlashList component. No other changes needed.

---

## TASK 5: Accessibility Labels on Interactive Elements

Add `accessibilityLabel` and `accessibilityRole="button"` to any `<TouchableOpacity>` or `<Pressable>` that acts as a button but is missing these props. Focus on the most user-facing screens:

**Priority screens:**
1. `notifications.tsx` — notification items
2. `saved.tsx` — saved items
3. `discover.tsx` — category chips, trending items
4. `search.tsx` — search results
5. `search-results.tsx` — result items

For each interactive element:
```tsx
// BEFORE:
<TouchableOpacity onPress={handlePress}>

// AFTER:
<TouchableOpacity
  onPress={handlePress}
  accessibilityLabel="Descriptive label"
  accessibilityRole="button"
>
```

Use descriptive labels like:
- "View notification from {username}" for notification items
- "View saved post" for saved items
- "Search for {term}" for trending items
- "View {username}'s profile" for user list items

---

## VERIFICATION CHECKLIST

After completing all tasks, verify:

1. **No `router.push('/search')` exists** — all should be `/(screens)/search`
2. **No `router.push('/(screens)/watch-later')` exists** — should be `watch-history`
3. **No `router.push('/(screens)/majlis-lists')` exists** — button should be removed
4. **Every screen with `useQuery`/`useInfiniteQuery` has an `isError` check**
5. **No `borderRadius: 7` in bakra.tsx**
6. **No new `as any` casts introduced**
7. **No new `@ts-ignore` or `@ts-expect-error` comments**
8. **No bare `<ActivityIndicator>` used for content loading**
9. **No bare `<Text>No items</Text>` for empty states**
10. **All new EmptyState icons use valid Icon names from the list above**
