# Antigravity Prompt — Batch 22: Polish & Robustness

Copy everything below the line and paste it into Antigravity CLI.

---

I need you to complete Batch 22 of our Mizanly mobile app polish. Read `BATCH_22_INSTRUCTIONS.md` in the project root FIRST — it contains all the rules, component references, and exact instructions. Follow it EXACTLY.

Here is a summary of what to do. The instructions file has all the details.

## CRITICAL RULES (read BATCH_22_INSTRUCTIONS.md for the full list)
- NEVER use `as any` anywhere
- NEVER use `@ts-ignore` or `@ts-expect-error`
- NEVER use React Native `Modal` — use `<BottomSheet>` from `@/components/ui/BottomSheet`
- NEVER use bare `<ActivityIndicator>` for loading content — use `<Skeleton.*>` from `@/components/ui/Skeleton`
- NEVER use bare text like "No items" — use `<EmptyState>` from `@/components/ui/EmptyState`
- NEVER hardcode `borderRadius` >= 6 — use `radius.*` from `@/theme`
- NEVER hardcode hex colors — use tokens from `@/theme`
- All routes must use `/(screens)/` prefix, e.g. `router.push('/(screens)/search')` NOT `router.push('/search')`

## Task 1: Fix 3 Navigation Crashes

1. **`apps/mobile/app/(screens)/discover.tsx`** — Change ALL 4 instances of `router.push('/search')` and `router.push('/search?q=...')` to `router.push('/(screens)/search')` and `router.push('/(screens)/search?q=...')`.

2. **`apps/mobile/app/(screens)/profile/[username].tsx`** — Change `router.push('/(screens)/watch-later')` to `router.push('/(screens)/watch-history')`. Also update any "Watch Later" label text near that button to "Watch History".

3. **`apps/mobile/app/(screens)/profile/[username].tsx`** — Find the button/Pressable that navigates to `/(screens)/majlis-lists` and REMOVE IT entirely (the screen doesn't exist). Do NOT create a new screen.

## Task 2: Add Error States to 36 Screens

Every screen that uses `useQuery` or `useInfiniteQuery` but does NOT check `.isError` needs an error state added. The pattern is:

```tsx
if (query.isError) {
  return (
    <View style={styles.container}>
      <GlassHeader
        title="SAME TITLE AS THE SCREEN"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }}
      />
      <View style={styles.headerSpacer} />
      <EmptyState
        icon="flag"
        title="Couldn't load content"
        subtitle="Check your connection and try again"
        actionLabel="Retry"
        onAction={() => query.refetch()}
      />
    </View>
  );
}
```

Add this pattern to these 36 screens (use the SAME container style and GlassHeader title that the screen already has):

archive.tsx, blocked.tsx, blocked-keywords.tsx, bookmark-folders.tsx, circles.tsx, close-friends.tsx, collab-requests.tsx, community-posts.tsx, drafts.tsx, follow-requests.tsx, followers/[userId].tsx, following/[userId].tsx, hashtag/[tag].tsx, mutual-followers.tsx, muted.tsx, notifications.tsx, saved.tsx, search-results.tsx, watch-history.tsx, broadcast-channels.tsx, conversation-info.tsx, conversation-media.tsx, discover.tsx, analytics.tsx, account-settings.tsx, create-post.tsx, create-thread.tsx, create-reel.tsx, create-video.tsx, create-story.tsx, edit-profile.tsx, new-conversation.tsx, search.tsx, share-profile.tsx, story-viewer.tsx, conversation/[id].tsx

IMPORTANT:
- Add `isError` and `refetch` to the query destructuring if not already there
- Add `import { EmptyState } from '@/components/ui/EmptyState'` if not already imported
- Place the error check AFTER loading checks but BEFORE the main return
- Use the same `styles.container` that the screen already defines
- If the screen has `styles.headerSpacer`, include it. If not, skip it
- For composer screens (create-post, create-thread, etc.), only add error handling if there's a useQuery that fetches data on mount (like loading a draft). Skip if queries are only for autocomplete/suggestions.

## Task 3: Fix Hardcoded borderRadius

**`apps/mobile/app/(tabs)/bakra.tsx`** — Change `borderRadius: 7` to `borderRadius: radius.sm`. Make sure `radius` is imported from `@/theme`.

## Task 4: Add removeClippedSubviews to 20 FlatLists

Add `removeClippedSubviews={true}` to the FlatList or FlashList component in these 20 screens (they don't have it yet):

search-results.tsx, search.tsx, notifications.tsx, followers/[userId].tsx, following/[userId].tsx, hashtag/[tag].tsx, saved.tsx, watch-history.tsx, community-posts.tsx, conversation-media.tsx, archive.tsx, bookmark-folders.tsx, blocked.tsx, muted.tsx, circles.tsx, close-friends.tsx, mutual-followers.tsx, broadcast-channels.tsx, collab-requests.tsx, follow-requests.tsx

Just add the prop. No other changes needed per file.

## Task 5: Accessibility Labels

Add `accessibilityLabel` and `accessibilityRole="button"` to interactive elements (`TouchableOpacity`, `Pressable`) that are missing them in these 5 screens: notifications.tsx, saved.tsx, discover.tsx, search.tsx, search-results.tsx. Use descriptive labels like "View notification", "View saved post", etc.

## After You're Done

Do NOT:
- Add any new components or files
- Refactor existing working code
- Change any styles beyond what's specified
- Add any `as any` casts
- Change any API calls or data fetching logic (except adding isError checks)
- Modify theme tokens
- Touch any files not listed in these tasks

Commit message should be: `fix: batch 22 — error states, nav crashes, a11y, perf`
