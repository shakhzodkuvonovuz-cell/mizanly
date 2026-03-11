# Antigravity Prompt — Batch 24: Final Polish

Copy everything below the line and paste it into Antigravity CLI.

---

I need you to build Batch 24 for the Mizanly mobile app. Read `BATCH_24_INSTRUCTIONS.md` in the project root FIRST — it has ALL the rules, component APIs, type definitions, and detailed requirements. Follow it EXACTLY.

## CRITICAL RULES (the instructions file has the full list — READ IT)
- NEVER use `as any` — use `as never` for router paths if you need a cast
- NEVER use `@ts-ignore` or `@ts-expect-error`
- NEVER use React Native `Modal` — use `<BottomSheet>` from `@/components/ui/BottomSheet`
- NEVER use bare `<ActivityIndicator>` for loading — use `<Skeleton.*>` from `@/components/ui/Skeleton`
- NEVER hardcode `borderRadius` >= 6 — use `radius.*` from `@/theme`
- NEVER hardcode hex colors — use `colors.*` from `@/theme`
- ALL FlatLists MUST have `removeClippedSubviews={true}` AND pull-to-refresh with `tintColor={colors.emerald}`
- ALL imports use `@/` prefix
- ALL routes use `/(screens)/` prefix
- ActivityIndicator INSIDE buttons/submit actions is OK — only replace content/page loading ActivityIndicators

## Part 1: Wire 6 Remaining Stubs

See BATCH_24_INSTRUCTIONS.md Task 1 for exact code:

1A. **`broadcast-channels.tsx`** — Wire the "Create Channel" button (line 226, currently `onPress: () => {}`). Add a BottomSheet form with channel name + description + GradientButton submit. Use `broadcastApi.create()` mutation. Navigate to the new channel on success.

1B. **`community-posts.tsx`** — Wire "Add Image", "Add Video", "Add Poll" buttons (lines 339, 344, 349, currently `{/* TODO */}`). Use `expo-image-picker` for image/video. Poll shows Alert (not yet supported). Show media preview above compose input with X button to remove.

1C. **`reel/[id].tsx`** — Wire reel comment likes (line 51-57, currently optimistic-only). Add `reelsApi.likeComment()` and `unlikeComment()` to api.ts. Keep optimistic UI but add real API call with revert on failure.

1D. **`conversation/[id].tsx`** — Wire pinned messages query (lines 658-664, currently commented out). Add `messagesApi.getPinned()` to api.ts. Uncomment the query. Add a pinned message banner below header showing the latest pinned message.

1E. **`manage-data.tsx`** — Replace "Coming Soon" alert (line 117) with actual `accountApi.requestDataExport()` call. Add the API method if it doesn't exist.

1F. **`PostCard.tsx`** (src/components/saf/) — Fix shareAsStory silent failure. Add `postsApi.shareAsStory()` to api.ts. Replace the hacky type cast mutation with a clean one that shows error Alert on failure.

## Part 2: Replace ActivityIndicator with Skeleton in 13 Files

**IMPORTANT: Only replace ActivityIndicator used for page/section/content loading. Leave ActivityIndicator inside buttons/submit actions alone — those are acceptable.**

Files: `save-to-playlist.tsx`, `follow-requests.tsx`, `collab-requests.tsx`, `circles.tsx`, `new-conversation.tsx`, `conversation-info.tsx`, `edit-profile.tsx`, `call/[id].tsx`, `create-thread.tsx`, `create-post.tsx`, `create-group.tsx`, `schedule-live.tsx`, `go-live.tsx`

For each: read the file, find `<ActivityIndicator>`, determine if it's content loading or button loading. Replace content loading ones with appropriate `<Skeleton.*>` components. Add `import { Skeleton } from '@/components/ui/Skeleton';` if needed.

## Part 3: Add `removeClippedSubviews={true}` to 29 FlatLists

Add `removeClippedSubviews={true}` to EVERY `<FlatList` in these 29 files:

`blocked-keywords.tsx`, `broadcast/[id].tsx`, `channel/[handle].tsx`, `conversation/[id].tsx`, `conversation-info.tsx`, `create-group.tsx`, `discover.tsx`, `live/[id].tsx`, `new-conversation.tsx`, `pinned-messages.tsx`, `playlist/[id].tsx`, `playlists/[channelId].tsx`, `post/[id].tsx`, `profile/[username].tsx`, `reel/[id].tsx`, `save-to-playlist.tsx`, `saved.tsx`, `sound/[id].tsx`, `starred-messages.tsx`, `story-viewer.tsx`, `thread/[id].tsx`, `onboarding/suggested.tsx`, `CommentsSheet.tsx`, `StickerPackBrowser.tsx`, `StickerPicker.tsx`, `StoryRow.tsx`, `Autocomplete.tsx`, `ImageLightbox.tsx`, `LocationPicker.tsx`

## After You're Done

Do NOT:
- Add or modify theme tokens
- Change any existing component APIs
- Add any `as any` casts (use `as never` for router paths)
- Change API endpoint URLs
- Touch files not listed in these tasks
- Add any new npm packages

Commit message: `feat: batch 24 — wire 6 stubs, replace ActivityIndicator, add removeClippedSubviews`
