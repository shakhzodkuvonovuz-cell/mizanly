# Antigravity Prompt — Batch 23: New Screens & Missing Features

Copy everything below the line and paste it into Antigravity CLI.

---

I need you to build Batch 23 for the Mizanly mobile app. Read `BATCH_23_INSTRUCTIONS.md` in the project root FIRST — it has ALL the rules, component APIs, type definitions, and detailed requirements. Follow it EXACTLY.

## CRITICAL RULES (the instructions file has the full list — READ IT)
- NEVER use `as any` — use `as never` for router paths if you need a cast
- NEVER use `@ts-ignore` or `@ts-expect-error`
- NEVER use React Native `Modal` — use `<BottomSheet>` from `@/components/ui/BottomSheet`
- NEVER use bare `<ActivityIndicator>` for loading — use `<Skeleton.*>` from `@/components/ui/Skeleton`
- NEVER use bare text for empty states — use `<EmptyState>` from `@/components/ui/EmptyState`
- NEVER hardcode `borderRadius` >= 6 — use `radius.*` from `@/theme`
- NEVER hardcode hex colors — use `colors.*` from `@/theme`
- ALL FlatLists MUST have pull-to-refresh with `tintColor={colors.emerald}` AND `removeClippedSubviews={true}`
- ALL routes use `/(screens)/` prefix
- ALL imports use `@/` prefix (e.g. `@/components/ui/Icon`, `@/theme`, `@/services/api`)
- EVERY new screen MUST have: GlassHeader, Skeleton loading state, error state with EmptyState + Retry, empty list state with EmptyState

## Part 1: Create 10 New Screens

Create these files in `apps/mobile/app/(screens)/`. See BATCH_23_INSTRUCTIONS.md for the FULL requirements, types, and API methods for each screen:

1. **`call-history.tsx`** — Call log screen (voice + video). Uses `callsApi.getHistory()`. Show Avatar, name, call type icon, status (missed=red), duration, timestamp.

2. **`sticker-browser.tsx`** — Browse/search sticker packs. Uses `stickersApi.browsePacks()`, `.searchPacks()`, `.getFeaturedPacks()`, `.addToCollection()`. Search bar + featured horizontal section + main pack list with Add/Remove buttons. Show pack details in a BottomSheet (grid of sticker images).

3. **`majlis-lists.tsx`** — Custom Majlis thread lists. Uses `api.get/post/delete` for `/majlis-lists` endpoints. CRUD with BottomSheet for create form (name + description + isPublic switch + GradientButton). Each row shows name, description, member count, lock/globe icon.

4. **`create-playlist.tsx`** — Create Minbar playlist form. TextInputs for title (max 100, with CharCountRing) and description (max 500, multiline, with CharCountRing), Switch for public, GradientButton to submit. Uses `api.post('/playlists', data)` or `playlistsApi.create()`.

5. **`edit-channel.tsx`** — Edit Minbar channel info. Route param `channelId`. Avatar picker + name + description (multiline, max 500) + GradientButton save. Uses `channelsApi.getById()` and `channelsApi.update()`.

6. **`trending-audio.tsx`** — Trending audio tracks for Bakra. Uses `audioTracksApi.getTrending()`, `.browse()`, `.search()`. Search bar + trending horizontal section + main list. Each row: cover image, title, artist, usage count, duration. "Use Sound" button navigates to create-reel.

7. **`my-reports.tsx`** — User's submitted reports. Uses `reportsApi.getMine()`. Each row: reason, color-coded status badge (pending=gold, reviewing=emerald, resolved=secondary, dismissed=error), content type, timestamp. Tapping navigates to `/(screens)/reports/${id}`.

8. **`hashtag-explore.tsx`** — Trending hashtags. Uses `hashtagsApi.getTrending()`, `.search()`. Search bar + list showing #name, total count, breakdown "X posts Y threads Z reels". Tapping navigates to `/(screens)/hashtag/${name}`.

9. **`bookmark-collections.tsx`** — Bookmark collections grid. Uses `bookmarksApi.getCollections()`. 2-column grid, each card: thumbnail, name, count. "All Saved" card at top. Tapping navigates to `/(screens)/saved?collection=${name}`.

10. **`manage-broadcast.tsx`** — Manage broadcast channel. Route param `channelId`. Uses `broadcastApi.getById()`, `.promoteToAdmin()`, `.demoteFromAdmin()`, `.removeSubscriber()`. Shows channel info + subscriber list with role badges + BottomSheet for admin actions.

## Part 2: Wire Up 8 Stubs in Existing Files

See BATCH_23_INSTRUCTIONS.md Task 11 for exact code and line locations:

11A. **`conversation/[id].tsx`** — Replace pin/unpin/star console.log TODOs with real `messagesApi` calls. Check api.ts for exact method names. If methods don't exist, add them to api.ts.

11B. **`broadcast-channels.tsx`** — Replace `handleSearchSubmit` console.log with actual search (client-side filter on discover results).

11C. **`community-posts.tsx`** — Replace empty `handleLongPress` with a BottomSheet showing Delete (with Alert confirm) and Copy Text options. Add state for selectedPost.

11D. **`live/[id].tsx`** — Replace empty share `onPress={() => {}}` with `Share.share({ message: 'Watch live on Mizanly: mizanly.app/live/${id}' })`.

11E. **`save-to-playlist.tsx`** — Replace "Coming soon" Alert in `handleCreateNew` with `router.push('/(screens)/create-playlist' as never)`.

11F. **`qr-code.tsx`** — Replace "Coming soon" Alert in `handleSave` with `Share.share({ message: profileUrl })` (simple approach, no extra packages needed).

11G. **`settings.tsx`** — Add navigation rows: Drafts, Archive, Watch History (in Content section), Broadcast Channels, My Reports (in Creator section). Use the existing `<Row>` component.

11H. **`profile/[username].tsx`** — Re-add the majlis-lists button (layers icon) that was removed: `<Pressable hitSlop={8} onPress={() => router.push('/(screens)/majlis-lists' as never)}><Icon name="layers" size="sm" color={colors.text.primary} /></Pressable>`

## After You're Done

Do NOT:
- Add or modify theme tokens
- Change any existing component APIs
- Add any `as any` casts (use `as never` for router paths)
- Change API endpoint URLs
- Touch files not listed in these tasks
- Add any new npm packages (use what's already installed)

Commit message: `feat: batch 23 — 10 new screens, wire 8 stubs, settings nav`
