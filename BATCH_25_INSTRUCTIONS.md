# Batch 25 — Accessibility, Dead Import Cleanup, Final Stubs

## CRITICAL RULES (follow ALL — violations WILL be caught)

1. **NEVER** use `as any` — use `as never` for router paths
2. **NEVER** use `@ts-ignore` or `@ts-expect-error`
3. **NEVER** use React Native `Modal` — use `<BottomSheet>`
4. **NEVER** hardcode `borderRadius` >= 6 — use `radius.*`
5. **NEVER** hardcode hex colors — use `colors.*`
6. **ALL** imports use `@/` prefix
7. **ALL** routes use `/(screens)/` prefix
8. **DO NOT** change any logic or functionality — this batch is ADDITIVE only (accessibility labels, removing dead imports, and 2 minor feature wires)

## Valid Icon Names (from Icon.tsx)
`arrow-left`, `chevron-right`, `chevron-left`, `chevron-down`, `chevron-up`, `heart`, `heart-filled`, `message-circle`, `bookmark`, `bookmark-filled`, `share`, `repeat`, `image`, `camera`, `video`, `play`, `pause`, `mic`, `phone`, `search`, `hash`, `at-sign`, `filter`, `trending-up`, `user`, `users`, `bell`, `mail`, `check-circle`, `send`, `pencil`, `edit`, `trash`, `x`, `plus`, `circle-plus`, `more-horizontal`, `more-vertical`, `settings`, `lock`, `globe`, `eye`, `eye-off`, `flag`, `volume-x`, `volume-1`, `volume-2`, `link`, `clock`, `map-pin`, `smile`, `paperclip`, `check`, `check-check`, `layers`, `slash`, `log-out`, `bar-chart-2`, `loader`, `star`, `music`, `maximize`, `download`, `upload`, `grid`, `list`, `refresh-cw`, `external-link`, `info`, `alert-triangle`, `zap`, `shield`, `award`, `copy`, `minus`

---

## Task 1: Add Accessibility Labels to 23 Screens

For each screen listed below, add `accessibilityLabel` and `accessibilityRole` props to:
- **GlassHeader** leftAction/rightAction (already has a11y labels if present — add if missing)
- **All Pressable/TouchableOpacity** interactive elements (buttons, cards, list items)
- **All TextInput** fields — add `accessibilityLabel` describing what the input is for
- **All Switch** components — add `accessibilityLabel` and `accessibilityRole="switch"`
- **Key Image** elements — add `accessibilityLabel` describing the image

**Guidelines:**
- Labels should be short, descriptive, screen-reader friendly (e.g., `accessibilityLabel="Go back"`, `accessibilityLabel="Search users"`, `accessibilityLabel="Toggle notifications"`)
- Use `accessibilityRole="button"` for Pressable/TouchableOpacity
- Use `accessibilityRole="image"` for Images
- Use `accessibilityRole="search"` for search TextInputs
- Use `accessibilityRole="switch"` for Switch components
- Do NOT add labels to decorative/non-interactive elements

**Files (23):**

1. `app/(screens)/analytics.tsx`
2. `app/(screens)/blocked-keywords.tsx`
3. `app/(screens)/blocked.tsx`
4. `app/(screens)/content-settings.tsx`
5. `app/(screens)/conversation-media.tsx`
6. `app/(screens)/create-story.tsx`
7. `app/(screens)/followers/[userId].tsx`
8. `app/(screens)/following/[userId].tsx`
9. `app/(screens)/manage-data.tsx`
10. `app/(screens)/muted.tsx`
11. `app/(screens)/new-conversation.tsx`
12. `app/(screens)/pinned-messages.tsx`
13. `app/(screens)/playlist/[id].tsx`
14. `app/(screens)/playlists/[channelId].tsx`
15. `app/(screens)/post/[id].tsx`
16. `app/(screens)/profile/[username].tsx`
17. `app/(screens)/report.tsx`
18. `app/(screens)/share-profile.tsx`
19. `app/(screens)/starred-messages.tsx`
20. `app/(screens)/story-viewer.tsx`
21. `app/(screens)/theme-settings.tsx`
22. `app/(screens)/thread/[id].tsx`
23. `app/(screens)/_layout.tsx`

---

## Task 2: Remove 6 Unused ActivityIndicator Imports

These files import `ActivityIndicator` but never use `<ActivityIndicator` in JSX. Remove it from the import statement.

1. `app/(screens)/collab-requests.tsx` — remove `ActivityIndicator` from line 4 import
2. `app/(screens)/create-group.tsx` — remove `ActivityIndicator` from line 4 import
3. `app/(screens)/create-thread.tsx` — remove `ActivityIndicator` from line 4 import
4. `app/(screens)/create-post.tsx` — remove `ActivityIndicator` from line 4 import
5. `app/(screens)/go-live.tsx` — remove `ActivityIndicator` from line 4 import
6. `app/(screens)/schedule-live.tsx` — remove `ActivityIndicator` from line 4 import

**How:** Open the file, find the `import { ... } from 'react-native';` statement, remove `ActivityIndicator,` from the list. Do NOT change anything else.

---

## Task 3: Wire 2 Final TODOs

### 3A. `content-settings.tsx` — Wire daily reminder setting (line 111)

Currently: `// TODO: send to backend if endpoint exists; currently not in schema`

Replace with an API call. Add to `apps/mobile/src/services/api.ts` in `usersApi` (or create `settingsApi` if more appropriate):
```tsx
updateDailyReminder: (enabled: boolean, time?: string) => api.patch('/users/settings/daily-reminder', { enabled, time }),
```

In `content-settings.tsx`, replace the TODO comment with:
```tsx
try {
  await usersApi.updateDailyReminder(newValue);
} catch {
  // Silently fail — setting is persisted locally regardless
}
```

### 3B. `community-posts.tsx` — Add media preview above compose input

The image/video picker from Batch 24 works, but the selected media isn't shown in the compose area. Add a preview:

Find the compose TextInput area and add above it (where `composeText` TextInput is):
```tsx
{selectedMedia && (
  <View style={{ position: 'relative', marginHorizontal: spacing.base, marginBottom: spacing.sm }}>
    <Image source={{ uri: selectedMedia.uri }} style={{ width: '100%', height: 200, borderRadius: radius.md }} resizeMode="cover" />
    <Pressable
      style={{ position: 'absolute', top: spacing.xs, right: spacing.xs, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.full, padding: spacing.xs }}
      onPress={() => setSelectedMedia(null)}
      accessibilityLabel="Remove selected media"
      accessibilityRole="button"
    >
      <Icon name="x" size="sm" color={colors.text.primary} />
    </Pressable>
  </View>
)}
```

Add `Image` to the react-native import if not already there.

---

## After You're Done

Do NOT:
- Add or modify theme tokens
- Change any existing component APIs
- Add any `as any` casts
- Change API endpoint URLs
- Touch files not listed in these tasks
- Add any new npm packages
- Change any existing logic or functionality (except the 2 stubs in Task 3)

Commit message: `feat: batch 25 — accessibility labels, dead import cleanup, final stubs`
