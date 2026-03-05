# ARCHITECT INSTRUCTIONS — Mizanly (Batch 2)
## For Sonnet/Haiku: Read This Entirely Before Doing Anything

**Last updated:** 2026-03-05 by Claude Opus 4.6
**Previous batch:** 46/56 tasks completed. This file contains ONLY remaining + new work.

---

## STATUS: What Was Done

All crash bugs, security vulnerabilities, functional bugs, performance fixes, accessibility/RTL, backend hardening, and most pattern cleanups are DONE. The following items remain incomplete, followed by a large batch of new feature work.

---

## STEP 0: COMMIT EVERYTHING FIRST

There are **58 modified files** and untracked files from the previous batch. Nothing has been committed.

```bash
# Stage everything
git add -A

# Commit with descriptive message
git commit -m "fix: full audit — crash bugs, security, functional bugs, patterns, perf, a11y, types

Phase 0: Fix duplicate state in create-post/thread, Rules of Hooks in story-viewer,
         FollowButton extraction from render
Phase 1: Fix thread IDOR, WebSocket CORS, devices controller, circles module,
         feed blocked/muted filter, visibility checks
Phase 2: Fix double message send, like states, report/block actions, counts,
         hashtags, story limit, poll enforcement, DM block check, debounce leaks
Phase 3: Replace emoji with Icon, CharCountRing, Avatar, RichText for comments
Phase 4: Catch-all filter, TransformInterceptor, 204 handling, push notifications,
         schema indexes, notification logging
Phase 5: Reply like endpoints, story highlights, blocked keywords nav, StoryBubble ring
Phase 6: React.memo, stable list refs, useWindowDimensions, Reanimated progress
Phase 7: Accessibility labels, I18nManager RTL, Icon mirroring
Phase 8: Typed API client, typed payloads, missing interfaces

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## STEP 1: REMAINING CLEANUP (from previous batch)

### 1.1 Actually Load Fonts
**File:** `apps/mobile/app/_layout.tsx`
**Problem:** `useFonts({})` is called with an EMPTY map. The font imports are commented out. All text still uses system fonts.
**Steps:**
1. Run in Windows terminal: `cd apps/mobile && npx expo install @expo-google-fonts/playfair-display @expo-google-fonts/dm-sans @expo-google-fonts/noto-naskh-arabic expo-splash-screen`
2. In `_layout.tsx`, import the actual fonts and pass them to `useFonts()`:
```tsx
import { PlayfairDisplay_700Bold } from '@expo-google-fonts/playfair-display';
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { NotoNaskhArabic_400Regular, NotoNaskhArabic_700Bold } from '@expo-google-fonts/noto-naskh-arabic';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();

// Inside component:
const [fontsLoaded] = useFonts({
  PlayfairDisplay_700Bold,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
  NotoNaskhArabic_400Regular,
  NotoNaskhArabic_700Bold,
});

useEffect(() => {
  if (fontsLoaded) SplashScreen.hideAsync();
}, [fontsLoaded]);

if (!fontsLoaded) return null;
```
3. Update `theme/index.ts` fontFamily values to reference the loaded font names.

### 1.2 Prevent Negative Counts
**Files:** `blocks.service.ts`, `posts.service.ts`, `follows.service.ts`, `threads.service.ts`
**Problem:** All `{ decrement: 1 }` operations can go negative on race conditions.
**Fix:** Use raw SQL for decrements:
```ts
// Instead of:
await this.prisma.user.update({
  where: { id: userId },
  data: { postsCount: { decrement: 1 } },
});

// Use:
await this.prisma.$executeRaw`
  UPDATE "User" SET "postsCount" = GREATEST("postsCount" - 1, 0) WHERE id = ${userId}
`;
```
Apply this pattern to ALL decrement operations across:
- `posts.service.ts` — postsCount, likesCount, savesCount, commentsCount
- `threads.service.ts` — threadsCount, likesCount, repostsCount, bookmarksCount, repliesCount
- `follows.service.ts` — followingCount, followersCount
- `blocks.service.ts` — followingCount, followersCount

### 1.3 Replace Remaining ActivityIndicator in Buttons
**Context:** The CLAUDE.md rule says "NEVER bare ActivityIndicator." However, for inline button loading spinners (e.g., "Posting..." button), a full Skeleton doesn't make sense. The practical fix is to use `<Icon name="loader" size="sm" />` with a spin animation, or keep `ActivityIndicator` but in a themed wrapper.

**Decision:** For button spinners specifically, `ActivityIndicator` is acceptable IF it uses `color={colors.text.primary}` (not bare white). Update these files to at least use themed color:
- `sign-in.tsx`, `sign-up.tsx`, `create-post.tsx`, `create-thread.tsx`, `create-story.tsx`
- `edit-profile.tsx`, `new-conversation.tsx`, `conversation-info.tsx`
- `blocked.tsx`, `muted.tsx`, `follow-requests.tsx`
- `onboarding/username.tsx`, `onboarding/profile.tsx`, `onboarding/suggested.tsx`

For each: ensure `<ActivityIndicator size="small" color="#fff" />` or similar. This is a soft rule exception — don't change these to Skeleton.

### 1.4 Replace Hardcoded borderRadius
**Files and fixes:**

| File | Line(s) | Current | Replace With |
|------|---------|---------|--------------|
| `create-post.tsx` | 501, 521, 527, 532, 536, 565, 582 | 12, 10, 10, 10, 10, 8, 10 | `radius.md` (10), `radius.sm` (6) for small pills |
| `create-thread.tsx` | 578, 587, 593, 612, 640, 654, 661 | 1, 8, 8, 12, 12, 8, 4 | `radius.sm`, `radius.md`, `radius.lg` |
| `create-story.tsx` | 192, 220 | 16, 14 | `radius.lg` (16) |
| `story-viewer.tsx` | 355, 357, 379, 387 | 1, 1, 24, 24 | 1 is fine for thin bars, 24 → `radius.lg` |
| `conversation/[id].tsx` | ~201-211, 684, 776 | 20, 2.5, 2 | 20 → `radius.lg`, small dots fine |

**Rule of thumb:** If value ≤ 2, it's a thin visual element — leave it. If ≥ 6, use the nearest theme token.

### 1.5 Fix Last Two `any` Casts
- **`majlis.tsx` line 109:** `key as any` → `key as 'foryou' | 'following' | 'trending'`
- **`saf.tsx` line 85:** Remove redundant `as StoryGroup[]` cast — the API already returns that type.

---

## STEP 2: NEW FEATURES — Messaging Polish

### 2.1 Message Long-Press Context Menu
**File:** `apps/mobile/app/(screens)/conversation/[id].tsx`
**What:** Long-press a message bubble to show options.
**Steps:**
1. Wrap each message bubble in `<Pressable onLongPress={...}>`
2. Show `<BottomSheet>` with items:
   - **Reply** — set `replyToId` state, show quoted message above input, focus input
   - **Copy** — `Clipboard.setStringAsync(message.content)`, show brief toast/haptic
   - **Forward** — navigate to conversation picker, then send original message
   - **React** — show 6 preset emoji buttons (❤️ 👍 😂 😮 😢 🤲), call `messagesApi.reactToMessage(messageId, emoji)`
   - **Delete for Me** — call `messagesApi.deleteForMe(messageId)`, remove from local cache
   - **Delete for Everyone** (own messages, <15 min old) — call `messagesApi.deleteForEveryone(messageId)`
   - **Edit** (own messages, <15 min old) — enter inline edit mode, call `messagesApi.editMessage(messageId, newContent)`
3. Add haptic feedback on long-press (`useHaptic().medium()`)

**Backend needed:**
- `POST /messages/:id/react` with `{ emoji }` body — check if exists in messages controller
- `DELETE /messages/:id` with `{ forEveryone: boolean }` body
- `PATCH /messages/:id` with `{ content }` body

### 2.2 Swipe-to-Reply on Messages
**File:** `apps/mobile/app/(screens)/conversation/[id].tsx`
**Steps:**
1. Use `react-native-gesture-handler` `Swipeable` or Reanimated `PanGestureHandler`
2. Swipe right reveals reply arrow icon
3. On swipe complete: set `replyToId`, show quoted message preview above input, focus TextInput
4. Reply preview: small card above input showing sender name + truncated message
5. Tap "x" on preview to cancel reply
**Dependency:** Share reply state with long-press menu (Task 2.1)

### 2.3 Voice Messages — Record, Send, Playback
**File:** `apps/mobile/app/(screens)/conversation/[id].tsx`
**Steps:**
1. Check `expo-av` is installed (`npx expo install expo-av` in Windows terminal if not)
2. **Recording UI:**
   - Press and hold mic button → start recording via `Audio.Recording`
   - Show red recording indicator + timer (00:00 counting up)
   - Slide left to cancel (Reanimated gesture)
   - Release to stop and send
3. **Sending:**
   - Stop recording → get URI
   - Upload to R2 via `uploadApi.getPresignUrl({ type: 'audio', folder: 'voice' })`
   - Send via socket: `{ messageType: 'VOICE', mediaUrl: r2Url, duration: seconds }`
4. **Playback (received messages):**
   - Render as waveform bar (can be a simple animated bar, no need for real waveform analysis)
   - Play/pause button using `Audio.Sound`
   - Show duration, progress bar

### 2.4 GIF Picker in Messages
**File:** `apps/mobile/app/(screens)/conversation/[id].tsx`
**Steps:**
1. Add GIF button to attachment row (next to image, camera buttons)
2. Open `<BottomSheet>` with search input + grid of GIFs
3. Use Tenor API (free tier, generous):
   - `GET https://tenor.googleapis.com/v2/featured?key=API_KEY&limit=30`
   - `GET https://tenor.googleapis.com/v2/search?key=API_KEY&q=QUERY&limit=30`
4. Display results in 2-column `FlatList` with `Image` from `expo-image`
5. On select: send message with `messageType: 'GIF'` and `mediaUrl: gif.url`
6. **Env var needed:** `EXPO_PUBLIC_TENOR_API_KEY` — get from Google Cloud Console (free)

---

## STEP 3: NEW FEATURES — Search & Discovery

### 3.1 Content Search (Posts + Threads)
**File:** `apps/mobile/app/(screens)/search.tsx`
**Steps:**
1. Add `<TabSelector>` with tabs: "People", "Hashtags", "Posts", "Threads"
2. For "Posts" tab: call `searchApi.search(query, 'post')`, render results with `<PostCard>`
3. For "Threads" tab: call `searchApi.search(query, 'thread')`, render results with `<ThreadCard>`
4. Each result FlatList should have pagination (infinite scroll with `onEndReached`)

**Backend:** The current search uses `ILIKE '%query%'` which is a full table scan. For MVP this is OK with small data. For production, integrate Meilisearch (already in deps):
- In `search.service.ts`, index posts and threads content to Meilisearch on creation
- Query Meilisearch instead of Prisma for content search

### 3.2 Search History
**File:** `apps/mobile/app/(screens)/search.tsx`
**Steps:**
1. Use `AsyncStorage` to persist recent searches (max 20)
2. Show recent searches when input is focused but empty
3. Each item: search text + "x" button to remove
4. "Clear All" button at top of history list
5. On search submit: add to history. On result tap: add to history.

### 3.3 Explore Grid
**File:** `apps/mobile/app/(screens)/search.tsx`
**Steps:**
1. When search is NOT active, show an explore grid of trending/recommended posts
2. 3-column grid using `FlatList` with `numColumns={3}`
3. Fetch from `postsApi.getDiscover()` or `postsApi.getFeed('foryou')`
4. Each cell: square thumbnail image. Video posts show play icon overlay.
5. On tap: navigate to post detail

---

## STEP 4: NEW FEATURES — Profile Polish

### 4.1 Profile Links Clickable
**File:** `apps/mobile/app/(screens)/profile/[username].tsx`
**Steps:**
1. Find where profile links render (likely in the header section)
2. Wrap each link in `<Pressable onPress={() => Linking.openURL(link.url)}>`
3. Show link icon + truncated URL text
4. Apply emerald color to link text

### 4.2 Bio URL Parsing in RichText
**File:** `apps/mobile/src/components/ui/RichText.tsx`
**Steps:**
1. The regex already includes URL pattern: `https?:\/\/[^\s]+`
2. Verify URL matches render as tappable `<Text>` with `onPress={() => Linking.openURL(url)}`
3. If not rendering: add the URL case to the `renderPart` switch
4. Style URL text with emerald color, underline optional

### 4.3 Share Profile + QR Code
**Steps:**
1. Add a share button to profile header (or wire existing one)
2. On press: show `<BottomSheet>` with:
   - "Share Profile" → `Share.share({ message: 'Check out @username on Mizanly!', url: 'https://mizanly.app/@username' })`
   - "Show QR Code" → navigate to QR screen
3. QR screen: install `react-native-qrcode-svg`, render QR encoding `mizanly://profile/username`
4. "Save QR" button: capture view to image with `react-native-view-shot`, save with `expo-media-library`

### 4.4 Theme Selector UI
**File:** `apps/mobile/app/(screens)/settings.tsx`
**Steps:**
1. Add "Appearance" section with three radio-style options: Dark, Light, System
2. On select: `useStore.getState().setTheme(value)`
3. For now, only Dark and System do anything (light theme colors not fully defined)
4. Show current selection with checkmark icon
5. Persist theme choice (Zustand persist middleware or AsyncStorage)

---

## STEP 5: NEW FEATURES — Social Features

### 5.1 Tab Scroll-to-Top on Active Tab Tap
**Files:** `apps/mobile/app/(tabs)/_layout.tsx`, `saf.tsx`, `majlis.tsx`, `risalah.tsx`
**Steps:**
1. In tab layout, use `listeners` prop on each Tab.Screen:
```tsx
listeners={({ navigation, route }) => ({
  tabPress: (e) => {
    if (navigation.isFocused()) {
      // Tab already active — scroll to top
      // Emit a custom event or use a ref
      navigation.emit({ type: 'scrollToTop' });
    }
  },
})}
```
2. In each tab screen, use `useNavigation().addListener('scrollToTop', ...)` to call `flatListRef.current?.scrollToOffset({ offset: 0, animated: true })`

### 5.2 Pull-to-Refresh on All Missing FlatLists
Check these screens and add `<RefreshControl tintColor={colors.emerald}>` if missing:
- `thread/[id].tsx` — thread detail
- `profile/[username].tsx` — profile posts/threads
- `followers/[userId].tsx`
- `following/[userId].tsx`
- `hashtag/[tag].tsx`
- `blocked.tsx`
- `muted.tsx`
- `follow-requests.tsx`
- `saved.tsx`
- `blocked-keywords.tsx`

### 5.3 Saved.tsx TabSelector Fix
**File:** `apps/mobile/app/(screens)/saved.tsx`
**Problem:** TabSelector is called with wrong prop format. Check current state — if it uses `tabs={['Posts', 'Threads']}` with `activeIndex`/`onChange`, convert to use the correct `tabs={[{key, label}]}` with `activeKey`/`onTabChange` API.

### 5.4 Onboarding Username Actually Saved
**Files:** `apps/mobile/app/onboarding/username.tsx`, `onboarding/profile.tsx`
**Problem:** Username is chosen in step 1 but never sent to the backend. `profile.tsx` calls `usersApi.updateMe` with `displayName` and `bio` but NOT `username`.
**Fix:** In `profile.tsx`, include `username` from route params in the `updateMe` call:
```tsx
await usersApi.updateMe({ displayName, bio, username });
```

---

## STEP 6: BACKEND NEW ENDPOINTS

### 6.1 Message Edit Endpoint
**File:** `apps/api/src/modules/messages/messages.controller.ts`
```ts
@Patch(':id')
@UseGuards(ClerkAuthGuard)
async editMessage(
  @CurrentUser('id') userId: string,
  @Param('id') messageId: string,
  @Body() dto: EditMessageDto,
) {
  return this.messagesService.editMessage(userId, messageId, dto.content);
}
```
Service should verify: sender owns message, message is < 15 min old, set `editedAt: new Date()`.

### 6.2 Message Delete Endpoint
```ts
@Delete(':id')
@UseGuards(ClerkAuthGuard)
async deleteMessage(
  @CurrentUser('id') userId: string,
  @Param('id') messageId: string,
  @Body() dto: DeleteMessageDto, // { forEveryone: boolean }
)
```
- `forEveryone: false` → soft-delete for that user only (add to a `DeletedForUser` join table or mark in ConversationMember)
- `forEveryone: true` → verify sender owns message + < 15 min, set `deletedAt: new Date()` on message

### 6.3 Message React Endpoint
```ts
@Post(':id/react')
@UseGuards(ClerkAuthGuard)
async reactToMessage(
  @CurrentUser('id') userId: string,
  @Param('id') messageId: string,
  @Body() dto: ReactMessageDto, // { emoji: string }
)
```
Upsert on `MessageReaction` table. Toggle: if same emoji exists, remove it.

### 6.4 User Report Endpoint (verify exists)
Check if `POST /users/:id/report` exists in `users.controller.ts`. If not, add it using the `Report` model.

### 6.5 Blocked Keywords Backend
Check if these exist in settings module. If not, create:
- `GET /settings/blocked-keywords` — return user's blocked keywords
- `POST /settings/blocked-keywords` with `{ word: string }` — create
- `DELETE /settings/blocked-keywords/:id` — delete

These may need a `BlockedKeyword` model in Prisma schema if it doesn't exist yet.

---

## STEP 7: ZUSTAND STORE IMPROVEMENTS

### 7.1 Add Persist Middleware
**File:** `apps/mobile/src/store/index.ts`
```tsx
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      // ... existing state and actions
    }),
    {
      name: 'mizanly-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        theme: state.theme,
        safFeedType: state.safFeedType,
        majlisFeedType: state.majlisFeedType,
      }),
    }
  )
);
```
Only persist user preferences, NOT transient state like `user`, `unreadNotifications`, etc.

### 7.2 Add Logout/Reset Action
```tsx
logout: () => set({
  user: null,
  unreadNotifications: 0,
  unreadMessages: 0,
  isCreateSheetOpen: false,
}),
```

### 7.3 Export Granular Selectors
```tsx
export const useUser = () => useStore((s) => s.user);
export const useTheme = () => useStore((s) => s.theme);
export const useUnreadNotifications = () => useStore((s) => s.unreadNotifications);
// etc.
```
This prevents unnecessary re-renders when unrelated state changes.

---

## ABSOLUTE RULES — NEVER VIOLATE

1. **NEVER use RN `Modal`** → Always `<BottomSheet>`
2. **NEVER use text emoji for icons** → Always `<Icon name="..." />`
3. **NEVER hardcode border radius ≥ 6** → Always `radius.*` from theme
4. **NEVER use bare "No items" text** → Always `<EmptyState>`
5. **NEVER create new files unless necessary** → Edit existing first
6. **NEVER change Prisma schema field names** → They are final
7. **NEVER use `@CurrentUser()` without `'id'`** → Always `@CurrentUser('id')`
8. **ALL FlatLists must have `<RefreshControl>`**
9. **NEVER use inline arrow functions for List*Component props** → Use stable refs
10. **NEVER use `any` in new code** → Type everything
11. **ALL Pressable/TouchableOpacity must have `accessibilityLabel` + `accessibilityRole`**
12. **NEVER call both socket.emit AND REST mutation for the same action**
13. **ActivityIndicator OK in buttons only** — use `<Skeleton>` for content loading

---

## PRIORITY QUEUE

Work in this exact order. Commit after each step.

```
STEP 0 — COMMIT (do first)
[ ] 0.1  git add -A && git commit (all 58 modified files from previous batch)

STEP 1 — REMAINING CLEANUP
[ ] 1.1  Actually load fonts (install packages, fill useFonts map)
[ ] 1.2  Prevent negative counts (GREATEST in all decrements)
[ ] 1.3  Theme ActivityIndicator colors in buttons
[ ] 1.4  Replace hardcoded borderRadius with theme tokens
[ ] 1.5  Fix last two `any` casts (majlis.tsx, saf.tsx)

STEP 2 — MESSAGING POLISH
[ ] 2.1  Message long-press context menu
[ ] 2.2  Swipe-to-reply on messages
[ ] 2.3  Voice messages (record → send → playback)
[ ] 2.4  GIF picker in messages

STEP 3 — SEARCH & DISCOVERY
[ ] 3.1  Content search (posts + threads)
[ ] 3.2  Search history (AsyncStorage)
[ ] 3.3  Explore grid (trending content)

STEP 4 — PROFILE POLISH
[ ] 4.1  Profile links clickable
[ ] 4.2  Bio URL parsing in RichText
[ ] 4.3  Share profile + QR code
[ ] 4.4  Theme selector UI in settings

STEP 5 — SOCIAL FEATURES
[ ] 5.1  Tab scroll-to-top on active tab tap
[ ] 5.2  Pull-to-refresh on all remaining FlatLists (10 screens)
[ ] 5.3  Fix Saved.tsx TabSelector props
[ ] 5.4  Fix onboarding username registration

STEP 6 — BACKEND ENDPOINTS
[ ] 6.1  Message edit endpoint
[ ] 6.2  Message delete endpoint
[ ] 6.3  Message react endpoint
[ ] 6.4  Verify user report endpoint
[ ] 6.5  Verify blocked keywords CRUD endpoints

STEP 7 — STORE IMPROVEMENTS
[ ] 7.1  Add Zustand persist middleware
[ ] 7.2  Add logout/reset action
[ ] 7.3  Export granular selectors
```

Each task is 15-60 minutes. Commit after each step number (e.g., after all of Step 1, after all of Step 2, etc.).
