# ARCHITECT INSTRUCTIONS — Mizanly (Batch 7: Production Polish)
## For Sonnet/Haiku: Read CLAUDE.md first, then this file top to bottom.

**Last updated:** 2026-03-07 by Claude Opus 4.6
**Previous batches:** 1 (56) -> 2 (27) -> 3 (25) -> 4 (30) -> 5 (28) -> 6 (19+3) -> This file.

---

## CRITICAL CONTEXT

Batch 6 achieved: 0 compilation errors, 0 dead buttons, 0 `as any` in non-test code, all CLAUDE.md stubs fixed, 16 service spec files. The app is ~75% feature complete.

**This batch focuses on production polish:** make tests pass, optimize performance, add accessibility, harden error handling, and ensure every screen feels like a shipped product. No new features.

---

## DO NOT TOUCH

- Prisma schema field names — final
- `$executeRaw` tagged template literals — they are safe
- Working features (all 5 spaces, messaging, notifications, search, offline, reports)
- Existing test logic (only fix failures, don't rewrite passing tests)

---

## STEP 1: MAKE ALL TESTS PASS (3 tasks)

### 1.1 Run All Backend Tests and Fix Failures

Run: `cd apps/api && npx jest --passWithNoTests 2>&1`

Read every failure. Common causes:
- Mock shape doesn't match updated service signatures (batch 5/6 changed method params)
- Missing mock providers (NotificationsService, DevicesService added as deps)
- `$transaction` mock not set up (services now use `$transaction` arrays)
- Prisma enum imports changed (PostVisibility, ReactionType)

**Rules for fixing:**
- Fix the TEST to match the current SERVICE code, not the other way around
- If a service method signature changed, update the test's mock calls and assertions
- If a new dependency was injected, add it to the test module providers with a mock
- NEVER change service logic to make a test pass
- NEVER use `@ts-ignore` or skip tests

### 1.2 Run E2E Tests and Fix Failures

Run: `cd apps/api && npx jest --config test/jest-e2e.json 2>&1`

E2E test files: `test/health.e2e-spec.ts`, `test/posts.e2e-spec.ts`

Fix any import/setup issues. These tests use the actual NestJS app bootstrap, so module registration changes from batch 5 (ChannelsModule, VideosModule) may cause issues.

### 1.3 Verify All Tests Green

Run: `cd apps/api && npx jest --passWithNoTests --verbose 2>&1`

**Expected:** ALL tests pass. If any test is fundamentally broken due to missing infrastructure (e.g., needs real database), mark it with `it.todo()` and add a comment explaining why — but try to fix it first.

---

## STEP 2: PERFORMANCE OPTIMIZATION (5 tasks)

### 2.1 Memoize Heavy Components

These components re-render on every parent render. Wrap them with `React.memo`:

**File:** `apps/mobile/src/components/saf/PostCard.tsx`
```tsx
export const PostCard = React.memo(function PostCard(props: PostCardProps) {
  // existing component body
});
```

**File:** `apps/mobile/src/components/majlis/ThreadCard.tsx`
Same pattern — wrap with `React.memo`.

**File:** `apps/mobile/app/(tabs)/bakra.tsx`
The `ReelItem` component rendered inside FlatList — wrap with `React.memo`.

**File:** `apps/mobile/app/(tabs)/minbar.tsx`
The `VideoCard` component rendered inside FlatList — wrap with `React.memo`.

**Rule:** Only memo components that receive props and are rendered in lists. Do NOT memo screen-level components or components that always receive new props (callbacks without useCallback).

### 2.2 Add useCallback to FlatList Handlers

In every tab screen that uses FlatList, ensure `renderItem`, `onEndReached`, and `keyExtractor` are wrapped in `useCallback` (or defined outside the component for static functions).

**Files to check and fix:**
- `apps/mobile/app/(tabs)/saf.tsx`
- `apps/mobile/app/(tabs)/majlis.tsx`
- `apps/mobile/app/(tabs)/bakra.tsx`
- `apps/mobile/app/(tabs)/minbar.tsx`
- `apps/mobile/app/(tabs)/risalah.tsx`

For each file:
1. Read the file
2. Check if `renderItem` is an inline arrow function in the FlatList props
3. If so, extract it to a `useCallback`-wrapped function
4. Same for `onEndReached`
5. `keyExtractor` can be a static function defined outside the component

**Example fix:**
```tsx
// BEFORE (re-creates function every render):
<FlatList renderItem={({ item }) => <PostCard post={item} />} />

// AFTER:
const renderItem = useCallback(({ item }) => <PostCard post={item} />, []);
<FlatList renderItem={renderItem} />
```

### 2.3 Add `getItemLayout` to Fixed-Height Lists

For FlatLists where items have a known fixed height, add `getItemLayout` to skip measurement:

**File:** `apps/mobile/app/(tabs)/bakra.tsx` — reels are full-screen height
```tsx
getItemLayout={(_, index) => ({
  length: SCREEN_H,
  offset: SCREEN_H * index,
  index,
})}
```

**File:** `apps/mobile/app/(tabs)/risalah.tsx` — conversation items are fixed height (~72px)
```tsx
getItemLayout={(_, index) => ({
  length: 72,
  offset: 72 * index,
  index,
})}
```

Only add this where item heights are truly fixed. Do NOT add to saf/majlis/minbar feeds (variable height cards).

### 2.4 Add `maxToRenderPerBatch` and `windowSize` to Heavy Lists

For feeds with heavy items (images, videos), add performance props:

**Files:** `saf.tsx`, `majlis.tsx`, `minbar.tsx`, `bakra.tsx`
```tsx
<FlatList
  maxToRenderPerBatch={5}
  windowSize={5}
  removeClippedSubviews={true}
  // ... existing props
/>
```

Only add these if not already present. Read each file first.

### 2.5 Pause Off-Screen Videos in Bakra

**File:** `apps/mobile/app/(tabs)/bakra.tsx`

Check if off-screen reels are paused. The FlatList should track the currently visible item and only play that one. If this isn't implemented:

Use `onViewableItemsChanged` to track the visible item index:
```tsx
const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;
const [activeIndex, setActiveIndex] = useState(0);

const onViewableItemsChanged = useRef(({ viewableItems }) => {
  if (viewableItems.length > 0) {
    setActiveIndex(viewableItems[0].index ?? 0);
  }
}).current;

// Pass to FlatList:
<FlatList
  onViewableItemsChanged={onViewableItemsChanged}
  viewabilityConfig={viewabilityConfig}
/>

// In ReelItem, only play if active:
<Video shouldPlay={index === activeIndex} />
```

Read the file first — this may already be implemented. If so, skip.

---

## STEP 3: ACCESSIBILITY (4 tasks)

### 3.1 Add accessibilityLabel to Tab Bar Icons

**File:** `apps/mobile/app/(tabs)/_layout.tsx`

Each `Tabs.Screen` should have an accessible label. Check if `tabBarAccessibilityLabel` is set:
```tsx
<Tabs.Screen
  name="saf"
  options={{
    tabBarAccessibilityLabel: "Home feed",
    // ... existing options
  }}
/>
```

Add for all 5 tabs: saf ("Home feed"), bakra ("Short videos"), minbar ("Videos"), majlis ("Threads"), risalah ("Messages").

### 3.2 Add accessibilityLabel to Action Buttons

In these files, find interactive elements (TouchableOpacity, Pressable) that have only an Icon child and no text. Add `accessibilityLabel`:

**File:** `apps/mobile/src/components/saf/PostCard.tsx`
- Like button: `accessibilityLabel={post.isLiked ? "Unlike post" : "Like post"}`
- Comment button: `accessibilityLabel="Comment on post"`
- Share button: `accessibilityLabel="Share post"`
- Bookmark button: `accessibilityLabel={post.isBookmarked ? "Remove bookmark" : "Bookmark post"}`
- More button: `accessibilityLabel="More options"`

**File:** `apps/mobile/src/components/majlis/ThreadCard.tsx`
Same pattern for like, reply, repost, share, more buttons.

**File:** `apps/mobile/app/(tabs)/bakra.tsx`
Same pattern for reel action column (like, comment, share, bookmark, report).

Read each file first. Only add labels to buttons that DON'T already have them.

### 3.3 Add accessibilityRole to Interactive Elements

Add `accessibilityRole="button"` to custom Pressable/TouchableOpacity elements that act as buttons but might not be announced as such by screen readers.

Focus on the most used screens:
- `PostCard.tsx` — action buttons
- `ThreadCard.tsx` — action buttons
- Tab bar custom create button in `_layout.tsx`

### 3.4 Add accessibilityLabel to Text Inputs

In compose screens, add labels to TextInput elements:

**File:** `apps/mobile/app/(screens)/create-post.tsx`
```tsx
<TextInput
  accessibilityLabel="Post content"
  // ... existing props
/>
```

**File:** `apps/mobile/app/(screens)/create-thread.tsx`
```tsx
<TextInput
  accessibilityLabel="Thread content"
  // ... existing props
/>
```

**File:** `apps/mobile/app/(screens)/conversation/[id].tsx`
```tsx
<TextInput
  accessibilityLabel="Message input"
  // ... existing props
/>
```

Read each file first. Only add if not present.

---

## STEP 4: ERROR HANDLING HARDENING (4 tasks)

### 4.1 Add Error Boundaries to Detail Screens

If a detail screen crashes (bad data, network error during render), the whole app shouldn't crash. The app already has a root `ErrorBoundary` in `src/components/ErrorBoundary.tsx`.

Check if it's used. If the root ErrorBoundary exists and wraps the app in `_layout.tsx`, that's sufficient for crash protection. Verify this by reading `_layout.tsx`.

If individual screens need their own error boundaries (e.g., for graceful "Something went wrong" UI instead of the global fallback), wrap the most crash-prone screens:

**Screens to wrap (if not already):**
- `video/[id].tsx` — video player can crash on bad URLs
- `reel/[id].tsx` — same
- `story-viewer.tsx` — complex gesture/animation code

Use the existing ErrorBoundary component. Only add if not already wrapped.

### 4.2 Add Error States to Queries

Check detail screens for missing error states. When a query fails, the user should see something — not a blank screen.

**Pattern to add where missing:**
```tsx
if (query.isError) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Icon name="arrow-left" size="md" color={colors.text.primary} />
        </Pressable>
      </View>
      <EmptyState
        icon="slash"
        title="Something went wrong"
        subtitle="Please try again later"
        actionLabel="Go back"
        onAction={() => router.back()}
      />
    </SafeAreaView>
  );
}
```

**Files to check and add error states if missing:**
- `apps/mobile/app/(screens)/post/[id].tsx`
- `apps/mobile/app/(screens)/thread/[id].tsx`
- `apps/mobile/app/(screens)/video/[id].tsx`
- `apps/mobile/app/(screens)/reel/[id].tsx`
- `apps/mobile/app/(screens)/channel/[handle].tsx`
- `apps/mobile/app/(screens)/profile/[username].tsx`

Read each file first. If it already handles `isError`, skip it.

### 4.3 Add Confirmation to Destructive Actions

Check that all destructive actions (delete post, delete comment, leave group, block user, delete conversation) show `Alert.alert` confirmation before executing.

**Files to check:**
- `PostCard.tsx` — delete post
- `ThreadCard.tsx` — delete thread
- `post/[id].tsx` — delete comment
- `conversation-info.tsx` — leave group, remove member
- `profile/[username].tsx` — block user

Read each file. If any destructive mutation fires without an Alert confirmation, add one:
```tsx
Alert.alert(
  'Delete Post',
  'Are you sure? This cannot be undone.',
  [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
  ],
);
```

### 4.4 Replace console.error/warn with Proper Handling

Search for `console.error` and `console.warn` in mobile app code (not node_modules). Replace with either:
- Silent catch (if truly non-critical)
- `Alert.alert` (if user should know)
- Remove entirely (if it's debug logging)

Run: `grep -rn "console\.\(error\|warn\|log\)" apps/mobile/app/ apps/mobile/src/ --include="*.tsx" --include="*.ts"`

Do NOT add `console.log` anywhere. The backend uses Pino structured logging — that's fine.

---

## STEP 5: VISUAL POLISH (4 tasks)

### 5.1 Ensure Consistent Header Heights

All detail screens should have the same header pattern:
```tsx
<View style={styles.header}>
  <Pressable onPress={() => router.back()} hitSlop={8}>
    <Icon name="arrow-left" size="md" color={colors.text.primary} />
  </Pressable>
  <Text style={styles.headerTitle}>Title</Text>
  <View style={{ width: 40 }} />  {/* spacer for centering */}
</View>
```

Header style should be consistent:
```tsx
header: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingHorizontal: spacing.base,
  paddingVertical: spacing.sm,
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: colors.dark.border,
},
```

**Check these screens and fix inconsistencies:**
- `post/[id].tsx`, `thread/[id].tsx`, `video/[id].tsx`, `reel/[id].tsx`
- `channel/[handle].tsx`, `profile/[username].tsx`
- `create-post.tsx`, `create-thread.tsx`, `create-video.tsx`, `create-reel.tsx`
- `report.tsx`, `notifications.tsx`, `settings.tsx`

Read each file. Only fix if the header pattern is visibly different (wrong padding, missing border, wrong icon).

### 5.2 Ensure Loading States Use Skeleton

Check that ALL detail screens show Skeleton loading (not blank screen) while data loads:

**Pattern:**
```tsx
if (query.isLoading) {
  return (
    <SafeAreaView style={styles.container}>
      <Skeleton.Rect width="100%" height={200} />
      <View style={{ padding: spacing.base }}>
        <Skeleton.Rect width="60%" height={20} />
        <Skeleton.Rect width="40%" height={16} style={{ marginTop: spacing.sm }} />
      </View>
    </SafeAreaView>
  );
}
```

**Files to verify:**
- `post/[id].tsx`, `thread/[id].tsx`, `video/[id].tsx`, `reel/[id].tsx`
- `channel/[handle].tsx`, `profile/[username].tsx`
- `conversation/[id].tsx`

Read each. If loading state is missing or uses ActivityIndicator instead of Skeleton, fix it.

### 5.3 Fix Hardcoded Colors

Search for hardcoded color strings in screen files:
```bash
grep -rn "'#[0-9a-fA-F]\{3,6\}'" apps/mobile/app/ apps/mobile/src/components/ --include="*.tsx" | grep -v node_modules | grep -v theme
```

Replace with theme tokens:
- `'#000'` or `'#000000'` -> `colors.dark.bg` or `'#000'` (acceptable for true black overlays)
- `'#fff'` or `'#ffffff'` -> `colors.text.primary` or keep for contrast (loading backgrounds)
- `'#333'` etc. -> find the closest theme token

**Exception:** `'#000'` and `'#fff'` in story-viewer.tsx and video players are acceptable (true black/white for media backgrounds). Do not change those.

### 5.4 Verify EmptyState on All List Screens

Every FlatList should have a `ListEmptyComponent`. Check these screens:

- `saf.tsx`, `majlis.tsx`, `bakra.tsx`, `minbar.tsx`, `risalah.tsx` (tabs)
- `notifications.tsx`, `search.tsx`, `hashtag/[tag].tsx`
- `followers/[userId].tsx`, `following/[userId].tsx`
- `blocked.tsx`, `muted.tsx`, `circles.tsx`

Each should use `<EmptyState>` component (not bare text) when the list is empty AND not loading. If loading, show Skeleton.

Read each file. Only fix if missing.

---

## ABSOLUTE RULES — NEVER VIOLATE

1. **NEVER use RN `Modal`** — Always `<BottomSheet>`
2. **NEVER use text emoji for icons** — Always `<Icon name="..." />`
3. **NEVER hardcode border radius >= 6** — Always `radius.*` from theme
4. **NEVER use bare "No items" text** — Always `<EmptyState>`
5. **NEVER change Prisma schema field names** — They are final
6. **ALL FlatLists must have `<RefreshControl>`** (or `onRefresh`+`refreshing` shorthand)
7. **NEVER use `any` in new non-test code** — Type everything properly
8. **ActivityIndicator OK in buttons only** — use `<Skeleton>` for content loading
9. **The `$executeRaw` tagged template literals are SAFE** — do NOT replace them
10. **NEVER suppress errors with `@ts-ignore`** — fix the actual type
11. **NEVER add `console.log` to mobile code** — use Alert or silent catch
12. **NEVER rewrite passing tests** — only fix failures
13. **NEVER change service logic to make a test pass** — fix the test instead

---

## PRIORITY QUEUE

```
STEP 1 — TESTS (do first, reveals hidden breaks)
[ ] 1.1  Run unit tests, fix all failures
[ ] 1.2  Run e2e tests, fix all failures
[ ] 1.3  Verify all green

STEP 2 — PERFORMANCE
[ ] 2.1  React.memo on PostCard, ThreadCard, ReelItem, VideoCard
[ ] 2.2  useCallback on FlatList handlers in all 5 tabs
[ ] 2.3  getItemLayout on bakra + risalah (fixed-height items)
[ ] 2.4  maxToRenderPerBatch + windowSize + removeClippedSubviews on feed lists
[ ] 2.5  Pause off-screen videos in bakra

STEP 3 — ACCESSIBILITY
[ ] 3.1  Tab bar accessibilityLabels
[ ] 3.2  Action button accessibilityLabels (PostCard, ThreadCard, bakra)
[ ] 3.3  accessibilityRole="button" on custom touchables
[ ] 3.4  TextInput accessibilityLabels on compose screens

STEP 4 — ERROR HANDLING
[ ] 4.1  Verify ErrorBoundary wraps app
[ ] 4.2  Add isError states to 6 detail screens
[ ] 4.3  Confirm Alert on all destructive actions
[ ] 4.4  Remove console.error/warn from mobile code

STEP 5 — VISUAL POLISH
[ ] 5.1  Consistent header heights across all detail screens
[ ] 5.2  Skeleton loading states on all detail screens
[ ] 5.3  Replace hardcoded colors with theme tokens
[ ] 5.4  EmptyState on all list screens
```

---

## PARALLELIZATION GUIDE

```
Wave 1 — MUST RUN FIRST:
  Step 1 (all tests) — reveals broken code that other steps might miss

Wave 2 — After Step 1 (all parallel, no file conflicts):
  Agent A: Step 2.1 + 2.2 (memo + useCallback — touches PostCard, ThreadCard, all 5 tabs)
  Agent B: Step 2.3 + 2.4 + 2.5 (FlatList perf — touches bakra, risalah, saf, majlis, minbar)
  *** CONFLICT: Agents A and B both touch tab files. Merge into ONE agent for all of Step 2.

  Agent C: Step 3 (all accessibility — touches _layout, PostCard, ThreadCard, bakra, compose screens)
  *** CONFLICT: Agent C touches PostCard/ThreadCard too. Run AFTER Agent A/B.

  Agent D: Step 4 (error handling — touches detail screens)
  Agent E: Step 5 (visual polish — touches detail screens)
  *** CONFLICT: D and E both touch detail screens. Merge into ONE agent.

SAFE PARALLEL PLAN:
  Wave 1: Step 1 (tests) — solo
  Wave 2: Step 2 (perf, all 5 tasks) — solo agent
  Wave 3 (parallel):
    - Step 3 (accessibility) — touches tab files + compose screens
    - Steps 4+5 combined (error handling + visual polish) — touches detail screens only
```

**CONFLICT ZONES:**
- `PostCard.tsx` — Steps 2.1, 3.2 both touch it
- `ThreadCard.tsx` — Steps 2.1, 3.2 both touch it
- `bakra.tsx` — Steps 2.1, 2.3, 2.4, 2.5, 3.2 all touch it
- Tab files (saf, majlis, minbar, risalah) — Steps 2.2, 2.4 touch them
- Detail screens — Steps 4.2, 5.1, 5.2 touch them
- `_layout.tsx` — Steps 3.1 touch it

---

## VERIFICATION CHECKLIST

```bash
# 1. All tests pass
cd apps/api && npx jest --passWithNoTests
# Expected: all green

# 2. Backend still compiles
cd apps/api && npx tsc --noEmit
# Expected: 0 errors

# 3. No dead buttons
grep -rn "onPress={() => {}}" apps/mobile/app/ --include="*.tsx"
# Expected: 0 results

# 4. No console.log/warn/error in mobile
grep -rn "console\.\(log\|warn\|error\)" apps/mobile/app/ apps/mobile/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules
# Expected: 0 results (or only in non-critical catch blocks)

# 5. No as any in non-test backend
grep -rn "as any" apps/api/src/ --include="*.ts" | grep -v ".spec.ts" | grep -v "prisma.service.ts" | grep -v "webhooks.controller.ts"
# Expected: 0 results

# 6. No merge conflicts
grep -rn "<<<<<<" apps/ --include="*.ts" --include="*.tsx"
# Expected: 0 results
```
