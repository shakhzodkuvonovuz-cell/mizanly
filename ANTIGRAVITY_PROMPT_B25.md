# Antigravity Prompt — Batch 25: Accessibility, Cleanup, Final Stubs

Copy everything below the line and paste it into Antigravity CLI.

---

I need you to build Batch 25 for the Mizanly mobile app. Read `BATCH_25_INSTRUCTIONS.md` in the project root FIRST — it has ALL the rules and detailed requirements. Follow it EXACTLY.

## CRITICAL RULES
- NEVER use `as any` — use `as never` for router paths
- NEVER use `@ts-ignore` or `@ts-expect-error`
- NEVER hardcode `borderRadius` >= 6 — use `radius.*` from `@/theme`
- NEVER hardcode hex colors — use `colors.*` from `@/theme`
- This batch is mostly ADDITIVE — do NOT change any existing logic/functionality except Task 3

## Part 1: Add Accessibility Labels to 23 Screens

Add `accessibilityLabel` and `accessibilityRole` props to ALL interactive elements (Pressable, TouchableOpacity, TextInput, Switch, Image) in these 23 screens that currently lack them:

`analytics.tsx`, `blocked-keywords.tsx`, `blocked.tsx`, `content-settings.tsx`, `conversation-media.tsx`, `create-story.tsx`, `followers/[userId].tsx`, `following/[userId].tsx`, `manage-data.tsx`, `muted.tsx`, `new-conversation.tsx`, `pinned-messages.tsx`, `playlist/[id].tsx`, `playlists/[channelId].tsx`, `post/[id].tsx`, `profile/[username].tsx`, `report.tsx`, `share-profile.tsx`, `starred-messages.tsx`, `story-viewer.tsx`, `theme-settings.tsx`, `thread/[id].tsx`, `_layout.tsx`

Guidelines:
- `accessibilityRole="button"` for Pressable/TouchableOpacity
- `accessibilityRole="search"` for search inputs
- `accessibilityRole="switch"` for Switch components
- `accessibilityRole="image"` for key images
- Labels: short, descriptive (e.g., "Go back", "Like post", "Search users")
- Do NOT label decorative elements

## Part 2: Remove 6 Unused ActivityIndicator Imports

These files import `ActivityIndicator` but never use `<ActivityIndicator` in JSX. Remove it from the import:

1. `collab-requests.tsx`
2. `create-group.tsx`
3. `create-thread.tsx`
4. `create-post.tsx`
5. `go-live.tsx`
6. `schedule-live.tsx`

## Part 3: Wire 2 Final TODOs

3A. **`content-settings.tsx`** — Wire daily reminder API call (line 111 TODO). Add `usersApi.updateDailyReminder()` to api.ts and call it.

3B. **`community-posts.tsx`** — Add media preview above compose TextInput. Show selected image/video with X button to remove. Import `Image` from react-native if needed.

## After You're Done

Do NOT: add/modify theme tokens, change component APIs, add `as any`, change API URLs, touch unlisted files, add npm packages.

Commit message: `feat: batch 25 — accessibility labels, dead import cleanup, final stubs`
