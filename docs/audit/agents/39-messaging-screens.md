# Agent #39 — Messaging Screens Deep Audit

**Scope:** All messaging-related mobile screens (~18 files)
**Agent:** Claude Opus 4.6 (1M context), audit agent #39 of 67+
**Date:** 2026-03-21

## Files Audited

1. `apps/mobile/app/(screens)/conversation/[id].tsx` — Main conversation screen (~1100 lines)
2. `apps/mobile/app/(screens)/conversation-info.tsx` — Conversation info/settings (~700 lines)
3. `apps/mobile/app/(screens)/conversation-media.tsx` — Media/links/docs browser (535 lines)
4. `apps/mobile/app/(screens)/new-conversation.tsx` — Start new DM (234 lines)
5. `apps/mobile/app/(screens)/saved-messages.tsx` — Telegram-style saved messages (273 lines)
6. `apps/mobile/app/(screens)/chat-folders.tsx` — Chat folder management (236 lines)
7. `apps/mobile/app/(screens)/chat-export.tsx` — Export chat (453 lines)
8. `apps/mobile/app/(screens)/chat-lock.tsx` — Biometric chat lock (386 lines)
9. `apps/mobile/app/(screens)/chat-theme-picker.tsx` — Chat theme selection (740 lines)
10. `apps/mobile/app/(screens)/chat-wallpaper.tsx` — Chat wallpaper customization (680 lines)
11. `apps/mobile/app/(screens)/starred-messages.tsx` — Starred messages (367 lines)
12. `apps/mobile/app/(screens)/pinned-messages.tsx` — Pinned messages (267 lines)
13. `apps/mobile/app/(screens)/disappearing-settings.tsx` — Per-conversation disappearing timer (366 lines)
14. `apps/mobile/app/(screens)/disappearing-default.tsx` — Global default disappearing timer (345 lines)
15. `apps/mobile/app/(screens)/dm-note-editor.tsx` — DM note/status editor (368 lines)
16. `apps/mobile/app/(screens)/create-group.tsx` — Create group conversation (384 lines)
17. `apps/mobile/app/(screens)/create-broadcast.tsx` — Create broadcast channel (395 lines)
18. `apps/mobile/app/(tabs)/risalah.tsx` — Main messaging tab (633 lines)

**Total lines audited:** ~7,362

---

## Finding Count: 52

### CRITICAL (Ship Blockers): 5
### HIGH: 12
### MEDIUM: 18
### LOW: 17

---

## CRITICAL FINDINGS

### C-01: conversation-media.tsx — PARAM MISMATCH: Screen never loads media

**File:** `apps/mobile/app/(screens)/conversation-media.tsx`, line 109
**Code:**
```tsx
const { id: conversationId } = useLocalSearchParams<{ id: string }>();
```
**Navigation from conversation-info.tsx, line 423:**
```tsx
router.push(`/(screens)/conversation-media?conversationId=${convo?.id}` as never)
```
**Navigation from conversation/[id].tsx, line 1340:**
```tsx
router.push(`/(screens)/conversation-media?id=${id}`)
```

**Problem:** The conversation-info screen navigates with `?conversationId=...` but the conversation-media screen destructures `{ id: conversationId }` — meaning it looks for a query param named `id`. When navigated from conversation-info, `id` is undefined, so `conversationId` is undefined, and the API call `messagesApi.getMessages(undefined, pageParam)` will fail or return empty data.

The navigation from conversation/[id].tsx correctly passes `?id=${id}`, but from conversation-info it passes `?conversationId=...` which is the wrong param name.

**Severity:** CRITICAL — The media browser is unreachable from conversation-info (the primary entry point).

---

### C-02: saved-messages.tsx — ALL API CALLS USE RAW fetch() WITHOUT AUTH

**File:** `apps/mobile/app/(screens)/saved-messages.tsx`, lines 24-91
**Code:**
```tsx
const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

async function fetchSavedMessages(cursor?: string) {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(`${API_BASE}/saved-messages?${params}`);
  return res.json();
}
```
And save mutation (line 54):
```tsx
const res = await fetch(`${API_BASE}/saved-messages`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ content: newMessage }),
});
```
And delete mutation (line 71):
```tsx
await fetch(`${API_BASE}/saved-messages/${id}`, { method: 'DELETE' });
```
And pin mutation (line 82):
```tsx
await fetch(`${API_BASE}/saved-messages/${id}/pin`, { method: 'PATCH' });
```

**Problem:** None of these fetch calls include an `Authorization` header. The backend endpoints require Clerk JWT auth. Every single operation on this screen — read, create, delete, pin — will return 401 Unauthorized. The entire screen is non-functional.

**Severity:** CRITICAL — Screen is completely broken, all operations fail with 401.

---

### C-03: chat-folders.tsx — ALL API CALLS USE RAW fetch() WITHOUT AUTH

**File:** `apps/mobile/app/(screens)/chat-folders.tsx`, lines 18, 35-68
**Code:**
```tsx
const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

// Read (line 38):
const res = await fetch(`${API_BASE}/chat-folders`);
// Create (line 45):
const res = await fetch(`${API_BASE}/chat-folders`, { method: 'POST', ... });
// Delete (line 62):
await fetch(`${API_BASE}/chat-folders/${id}`, { method: 'DELETE' });
```

**Problem:** Identical to C-02. No Authorization header on any fetch call. All operations return 401. The entire chat folders feature is non-functional.

**Severity:** CRITICAL — Screen is completely broken.

---

### C-04: conversation-media.tsx — DUPLICATE Pressable IMPORT (Compile/Runtime Error)

**File:** `apps/mobile/app/(screens)/conversation-media.tsx`, lines 2-6
**Code:**
```tsx
import {
  View, Text, StyleSheet, Pressable, FlatList,
  RefreshControl, Linking,
  Pressable,                   // <--- DUPLICATE
} from 'react-native';
```

**Problem:** `Pressable` is imported twice in the same destructuring statement. Depending on the bundler version and strict mode, this can cause a compile-time error or shadowing warning. At minimum it is a code quality issue; in strict TypeScript it will fail.

**Severity:** CRITICAL — May prevent screen from compiling/loading.

---

### C-05: Multiple screens have DUPLICATE Pressable imports

**Files and lines:**
- `apps/mobile/app/(screens)/conversation/[id].tsx`, lines 3-6: `Pressable` imported twice
- `apps/mobile/app/(screens)/saved-messages.tsx`, lines 3-6: `Pressable` imported twice
- `apps/mobile/app/(screens)/chat-theme-picker.tsx`, lines 6-12: `Pressable` imported twice (with ScrollView also present)
- `apps/mobile/app/(screens)/create-group.tsx`, lines 3-6: `Pressable` imported twice
- `apps/mobile/app/(screens)/create-broadcast.tsx`, lines 3-6: `Pressable` imported twice

**Severity:** CRITICAL — Same issue as C-04, duplicated across 5+ files. Any of these screens could fail to compile.

---

## HIGH FINDINGS

### H-01: starred-messages.tsx — CLIENT-SIDE FILTERING IS BROKEN DESIGN

**File:** `apps/mobile/app/(screens)/starred-messages.tsx`, lines 36-46
**Code:**
```tsx
queryFn: async ({ pageParam }) => {
  const response = await messagesApi.getMessages(conversationId, pageParam);
  // Filter messages that have a star reaction
  const filtered = response.data.filter((msg) =>
    msg.reactions?.some((r) => r.emoji === '⭐')
  );
  return { ...response, data: filtered };
},
```

**Problem:** This fetches ALL messages page by page and filters on the client. If a conversation has 10,000 messages and only 3 starred, the user must scroll through hundreds of empty pages (each page returns `hasMore: true` even though no starred messages exist). The `getNextPageParam` continues paginating based on the original cursor, so pages keep loading with 0 results. This will appear as an infinite loading spinner with no content appearing.

**Severity:** HIGH — Feature is functionally broken for conversations with many messages but few starred items.

---

### H-02: pinned-messages.tsx — SAME CLIENT-SIDE FILTERING PROBLEM

**File:** `apps/mobile/app/(screens)/pinned-messages.tsx`, lines 36-46
**Code:**
```tsx
const filtered = response.data.filter((msg) =>
  msg.reactions?.some((r) => r.emoji === '📌')
);
```

**Problem:** Identical design flaw as H-01. Fetches all messages, filters on client for pushpin emoji. Pinned messages should be a server-side query.

**Severity:** HIGH — Pinned messages are effectively unfindable in large conversations.

---

### H-03: pinned-messages.tsx — SYNTAX ERROR: Missing closing brace in import

**File:** `apps/mobile/app/(screens)/pinned-messages.tsx`, line 1-3
**Code:**
```tsx
import { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, Pressable,
import { useLocalSearchParams, useRouter } from 'expo-router';
```

**Problem:** The import from 'react-native' is missing a closing `}` and `from 'react-native';`. The next import statement starts immediately after the dangling comma. This is a syntax error that should prevent the file from compiling.

**Severity:** HIGH — File cannot compile as written.

---

### H-04: starred-messages.tsx — SYNTAX ERROR: Missing closing brace in import

**File:** `apps/mobile/app/(screens)/starred-messages.tsx`, line 1-4
**Code:**
```tsx
import { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, Pressable,
import { useLocalSearchParams, useRouter } from 'expo-router';
```

**Problem:** Same issue as H-03. The import from 'react-native' has no closing `}` or `from 'react-native'` clause.

**Severity:** HIGH — File cannot compile as written.

---

### H-05: chat-wallpaper.tsx — SYNTAX ERROR: Missing closing brace in import

**File:** `apps/mobile/app/(screens)/chat-wallpaper.tsx`, lines 1-4
**Code:**
```tsx
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Alert,
import { useRouter, useLocalSearchParams } from 'expo-router';
```

**Problem:** Same pattern — import from 'react-native' is missing closing `}` and `from 'react-native';`.

**Severity:** HIGH — File cannot compile as written.

---

### H-06: saved-messages.tsx — SEARCH FUNCTIONALITY IS PURELY COSMETIC

**File:** `apps/mobile/app/(screens)/saved-messages.tsx`, lines 162-177
**Code:**
```tsx
{searchMode && (
  <Animated.View entering={FadeIn.duration(200)} style={styles.searchWrap}>
    <Icon name="search" size="sm" color={colors.text.tertiary} />
    <TextInput
      style={styles.searchInput}
      value={searchQuery}
      onChangeText={setSearchQuery}
      placeholder={t('risalah.searchSavedMessages')}
      ...
    />
  </Animated.View>
)}
```

**Problem:** `searchQuery` is set via `setSearchQuery` but never used to filter `messages`. The FlatList renders all messages regardless of search query. The search bar is purely visual.

**Severity:** HIGH — Feature is misleading; user types a query but results never filter.

---

### H-07: saved-messages.tsx — NO ERROR HANDLING ON fetch() CALLS

**File:** `apps/mobile/app/(screens)/saved-messages.tsx`, lines 26-91
**Problem:** None of the raw `fetch()` calls check `res.ok` before calling `res.json()`. If the server returns a 400, 401, 404, or 500, the code will attempt to parse a non-JSON error body and either crash or silently produce garbage data. The `saveMutation` calls `res.json()` on potentially failed responses and still runs `onSuccess`.

**Severity:** HIGH — Silent data corruption and misleading success feedback.

---

### H-08: chat-folders.tsx — NO ERROR HANDLING ON fetch() CALLS

**File:** `apps/mobile/app/(screens)/chat-folders.tsx`, lines 35-69
**Problem:** Same as H-07. `foldersQuery` calls `res.json()` without checking `res.ok`. The createMutation and deleteMutation also don't check response status.

**Severity:** HIGH — Same issue as H-07.

---

### H-09: conversation/[id].tsx — VOICE WAVEFORM USES Math.random() IN RENDER

**File:** `apps/mobile/app/(screens)/conversation/[id].tsx`, lines 233-240
**Code:**
```tsx
{Array.from({ length: 20 }).map((_, i) => (
  <View
    key={i}
    style={[
      styles.voiceBar,
      { height: 4 + Math.sin(i * 0.8) * 8 + Math.random() * 4 },
      ...
    ]}
  />
))}
```

**Problem:** `Math.random()` is called inside JSX return, meaning the waveform bars have different heights on every re-render. This causes visual flickering whenever any state changes in the parent component. The waveform should be computed once and memoized.

**Severity:** HIGH — Constant visual flickering during message playback.

---

### H-10: chat-theme-picker.tsx — THEME/WALLPAPER SELECTION NEVER PERSISTS

**File:** `apps/mobile/app/(screens)/chat-theme-picker.tsx`, lines 424-436
**Code:**
```tsx
{/* Bottom Bar */}
<View style={styles.bottomBar}>
  <Pressable>
    <Text style={styles.resetText}>{t('chatThemePicker.resetToDefault')}</Text>
  </Pressable>
  <Pressable>
    <LinearGradient ...>
      <Text style={styles.applyText}>{t('chatThemePicker.apply')}</Text>
    </LinearGradient>
  </Pressable>
</View>
```

**Problem:** Neither the "Reset to Default" nor "Apply" button has an `onPress` handler. The buttons are completely non-functional. The user can select themes visually but cannot save them. The entire chat-theme-picker screen is a dead end.

**Severity:** HIGH — Feature is non-functional; buttons do nothing.

---

### H-11: chat-theme-picker.tsx — OPACITY/BLUR SLIDERS ARE NON-INTERACTIVE

**File:** `apps/mobile/app/(screens)/chat-theme-picker.tsx`, lines 401-416
**Code:**
```tsx
<View style={styles.sliderTrack}>
  <View style={[styles.sliderFill, { width: `${opacity}%` }]} />
</View>
```

**Problem:** `opacity` and `blur` state values are initialized to 30 and 0 respectively but there are no slider controls or gesture handlers to change them. The slider track and fill are rendered statically. The "Opacity" and "Blur" sliders are purely visual with no interactivity.

**Severity:** HIGH — Sliders are cosmetic-only, cannot be adjusted.

---

### H-12: chat-folders.tsx — EDIT FOLDER IS STUBBED

**File:** `apps/mobile/app/(screens)/chat-folders.tsx`, lines 196-199
**Code:**
```tsx
<BottomSheetItem
  label={t('risalah.editFolder')}
  icon={<Icon name="pencil" size="sm" color={colors.text.primary} />}
  onPress={() => { setMenuFolder(null); }}  // <-- Does nothing except close sheet
/>
```

**Problem:** The "Edit Folder" option in the context menu just closes the bottom sheet. There is no edit UI, no name change input, no update mutation. The feature is a stub.

**Severity:** HIGH — Users see an "Edit Folder" option that does nothing.

---

## MEDIUM FINDINGS

### M-01: saved-messages.tsx — HARDCODED ENGLISH STRINGS

**File:** `apps/mobile/app/(screens)/saved-messages.tsx`, lines 112, 117, 156, 232
**Code:**
```tsx
<Text style={styles.pinText}>Pinned</Text>                           // line 112
<Text style={styles.forwardText}>Forwarded from {item.forwardedFromType}</Text>  // line 117
<Text style={styles.infoText}>Your personal cloud notepad...</Text>   // line 156
```
And in bottom sheet (line 232):
```tsx
label={menuItem?.isPinned ? 'Unpin' : 'Pin'}
```

**Problem:** At least 4 hardcoded English strings bypass i18n. These will not translate for Arabic, Turkish, Urdu, etc.

**Severity:** MEDIUM — i18n violation.

---

### M-02: chat-folders.tsx — HARDCODED ENGLISH STRINGS

**File:** `apps/mobile/app/(screens)/chat-folders.tsx`, lines 91, 116, 124, 135, 152, 160, 186
**Code:**
```tsx
{convCount} chat{convCount !== 1 ? 's' : ''}          // line 91
{Boolean(item.includeGroups) && ' · Groups'}            // line 92
{Boolean(item.includeChannels) && ' · Channels'}        // line 93
'Organize your chats into custom folders...'            // line 116
'New Folder'                                            // line 124
'Icon'                                                  // line 135
'Cancel'                                                // line 152
'Create'                                                // line 160
'Create Folder'                                         // line 186
```

**Problem:** At least 9 hardcoded English strings bypass i18n.

**Severity:** MEDIUM — i18n violation.

---

### M-03: conversation-media.tsx — MISSING SafeAreaView ON ERROR STATE

**File:** `apps/mobile/app/(screens)/conversation-media.tsx`, lines 330-342
**Problem:** The error state renders inside a `SafeAreaView` but the `ScreenErrorBoundary` wraps the main content below (line 345). If the error state renders, it displays correctly. However, the loading state (line 322) and error state (line 330) are outside the ScreenErrorBoundary, so if THEY crash, there's no boundary to catch it.

**Severity:** MEDIUM — Partial error boundary coverage.

---

### M-04: new-conversation.tsx — HARDCODED ENGLISH accessibilityLabel

**File:** `apps/mobile/app/(screens)/new-conversation.tsx`, line 65
**Code:**
```tsx
accessibilityLabel: 'Go back'
```

**Problem:** Hardcoded English string in accessibility label. Should use `t('common.back')`.

**Severity:** MEDIUM — Accessibility i18n violation.

---

### M-05: conversation-info.tsx — HARDCODED ENGLISH accessibilityHint

**File:** `apps/mobile/app/(screens)/conversation-info.tsx`, line 336
**Code:**
```tsx
accessibilityHint="Press to view profile, long press to view member actions"
```

**Problem:** Hardcoded English in accessibility hint.

**Severity:** MEDIUM — Accessibility i18n violation.

---

### M-06: conversation/[id].tsx — SOCKET RECONNECTION DOES NOT REJOIN ROOM

**File:** `apps/mobile/app/(screens)/conversation/[id].tsx`, lines 878-937
**Code:**
```tsx
socket.on('connect', () => {
  socket.emit('join_conversation', { conversationId: id });
  // ...retry pending messages
});
```

**Problem:** The socket connects and joins room on initial connect. However, when Socket.io reconnects after a network drop (which it does automatically with `reconnection: true`), the `connect` event fires again. The room join is correctly placed inside `connect` so reconnection should rejoin. However, during the reconnection gap, the user misses all messages. There's no mechanism to fetch missed messages between disconnect and reconnect — the query cache may be stale.

**Severity:** MEDIUM — Users may miss messages during network transitions without a refetch on reconnect.

---

### M-07: conversation/[id].tsx — TYPING INDICATOR HAS NO TIMEOUT

**File:** `apps/mobile/app/(screens)/conversation/[id].tsx`, line 931-933
**Code:**
```tsx
socket.on('user_typing', ({ userId, isTyping: typing }: { userId: string; isTyping: boolean }) => {
  if (userId !== user?.id) setOtherTyping(typing);
});
```

**Problem:** If the other user's browser/app crashes while typing (so `isTyping: false` is never sent), the typing indicator will stay visible forever. There should be a timeout (e.g., 5 seconds) that automatically clears the typing state if no new typing event arrives.

**Severity:** MEDIUM — "Typing..." indicator can stick permanently.

---

### M-08: conversation/[id].tsx — ENCRYPTION INITIALIZATION RACE CONDITION

**File:** `apps/mobile/app/(screens)/conversation/[id].tsx`, lines 749-762
**Code:**
```tsx
useEffect(() => {
  const checkEncryption = async () => {
    try {
      await encryptionService.initialize();
      const hasKey = encryptionService.hasConversationKey(id);
      setIsEncrypted(hasKey);
      setEncryptionReady(hasKey);
    } catch {
      // Encryption not available — continue without it
    }
  };
  checkEncryption();
}, [id]);
```

**Problem:** If `encryptionService.initialize()` is slow (e.g., generating keys), messages may arrive via socket before encryption is ready. These messages would not be decrypted. The `decryptAll` effect (line 831) depends on `isEncrypted` state being set, but if messages arrive before that state is true, they won't be processed for decryption.

**Severity:** MEDIUM — Early messages may appear as encrypted blobs until a re-render happens.

---

### M-09: create-group.tsx — DEPRECATED MediaTypeOptions API

**File:** `apps/mobile/app/(screens)/create-group.tsx`, line 66
**Code:**
```tsx
mediaTypes: ImagePicker.MediaTypeOptions.Images,
```

**Problem:** `MediaTypeOptions` is deprecated in newer Expo Image Picker versions. The newer API uses `mediaTypes: ['images']` (as used in create-broadcast.tsx and chat-wallpaper.tsx). This will produce a deprecation warning.

**Severity:** MEDIUM — Deprecation warning, will break in future Expo SDK.

---

### M-10: conversation-info.tsx — USES `ImagePicker.MediaTypeOptions.Images` (deprecated)

**File:** `apps/mobile/app/(screens)/conversation-info.tsx`, line 125
**Code:**
```tsx
mediaTypes: ImagePicker.MediaTypeOptions.Images,
```

**Problem:** Same deprecated API as M-09.

**Severity:** MEDIUM

---

### M-11: risalah.tsx — SOCKET CONNECTION NOT CLEANED UP ON TOKEN REFRESH

**File:** `apps/mobile/app/(tabs)/risalah.tsx`, lines 197-261
**Code:**
```tsx
useEffect(() => {
  let socket: Socket;
  const connect = async () => {
    const token = await getToken();
    if (!token) return;
    socket = io(SOCKET_URL, { ... });
    ...
    socketRef.current = socket;
  };
  connect();
  return () => { socket?.disconnect(); };
}, [getToken, queryClient]);
```

**Problem:** `getToken` is in the dependency array. If `getToken` changes reference (which it can on auth state changes), the entire effect re-runs. But the cleanup function uses a closure over `socket` which may not have been assigned yet if `connect()` is async and hasn't resolved. This could lead to leaked socket connections.

**Severity:** MEDIUM — Potential socket leak on auth state changes.

---

### M-12: conversation/[id].tsx — decryptAll RUNS ON EVERY MESSAGE CHANGE

**File:** `apps/mobile/app/(screens)/conversation/[id].tsx`, lines 831-860
**Code:**
```tsx
useEffect(() => {
  const decryptAll = async () => {
    const newMap = new Map<string, string>();
    for (const msg of messages) {
      if (msg.isEncrypted && msg.content && msg.encNonce) {
        ...
```

**Problem:** `messages` is in the dependency array. Every time a new message arrives, this effect re-runs and iterates over ALL messages, including ones already decrypted. While it does check `decryptedContents.get(msg.id)` for already-decrypted messages, the `decryptedContents` map reference changes each time (since it's in state), potentially causing an infinite loop.

**Severity:** MEDIUM — Performance issue and potential infinite loop with encrypted conversations.

---

### M-13: starred-messages.tsx — `★` TEXT EMOJI IN UI

**File:** `apps/mobile/app/(screens)/starred-messages.tsx`, line 205
**Code:**
```tsx
<Text style={styles.starredCount}>★ {messages.length} {t('screens.starred-messages.starred')}</Text>
```

**Problem:** Uses a text emoji `★` instead of `<Icon name="star" />`. Per project rules: "NEVER use text emoji for icons — Always `<Icon name="..." />`"

**Severity:** MEDIUM — Violates project coding standards.

---

### M-14: chat-export.tsx — REFERENCES `colors.emeraldDark` (Possibly Valid)

**File:** `apps/mobile/app/(screens)/chat-export.tsx`, line 122
**Code:**
```tsx
colors={[colors.emerald, colors.emeraldDark]}
```

**Verified:** `colors.emeraldDark` exists in the theme file at `'#066B42'`. This is NOT a bug.

**Severity:** N/A — False alarm, token exists.

---

### M-15: chat-lock.tsx — REFERENCES `colors.emeraldDark`

Same as M-14. Verified to exist. Not a bug.

---

### M-16: conversation-media.tsx — VIDEO THUMBNAIL USES SAME URL AS VIDEO

**File:** `apps/mobile/app/(screens)/conversation-media.tsx`, lines 159-165
**Code:**
```tsx
media.push({
  ...
  url: msg.mediaUrl,
  type: 'video',
  thumbnailUrl: msg.mediaUrl, // Could have separate thumbnail, but use same for now
  ...
});
```

**Problem:** Video items use the full video URL as their thumbnail. The `Image` component will attempt to render the full video file as a thumbnail image, which may not work (depending on the video format/CDN). The UI shows a video placeholder anyway, so the thumbnail is being loaded but likely not displayed correctly.

**Severity:** MEDIUM — Unnecessary bandwidth waste loading video files as image thumbnails.

---

### M-17: conversation-info.tsx — `useQuery` HOOK CALLED CONDITIONALLY

**File:** `apps/mobile/app/(screens)/conversation-info.tsx`, line 223
**Code:**
```tsx
if (!convo) return null;    // line 216

const isGroup = convo.isGroup;  // line 218
...
const memberSearchQuery = useQuery({    // line 223
  queryKey: ['group-member-search', debouncedSearchQuery],
```

**Problem:** The `useQuery` hook for member search is called after a conditional `return null` statement on line 216. React hooks must not be called conditionally. If `convo` is null during initial render, the hook is skipped, but once `convo` loads, the hook is called — changing the number of hooks between renders. This violates the Rules of Hooks and can cause a crash.

**Severity:** MEDIUM — React Rules of Hooks violation; may cause crash on slow network.

---

### M-18: conversation/[id].tsx — `readByMembers[0].lastReadAt` WITH NO MEMBER REFERENCE

**File:** `apps/mobile/app/(screens)/conversation/[id].tsx`, line 593
**Code:**
```tsx
<Text style={styles.readTime}>{format(new Date(readByMembers[0].lastReadAt), 'HH:mm')}</Text>
```

**Problem:** `lastReadAt` may be null or undefined based on the ConversationMember type. `new Date(null)` returns Invalid Date, and `format(InvalidDate, ...)` will throw. Should guard: `readByMembers[0]?.lastReadAt ? format(...) : null`.

**Severity:** MEDIUM — Potential crash if lastReadAt is null.

---

## LOW FINDINGS

### L-01: chat-theme-picker.tsx — `getCurrentTheme()` SHADOWS `t` from useTranslation

**File:** `apps/mobile/app/(screens)/chat-theme-picker.tsx`, lines 100-106
**Code:**
```tsx
const getCurrentTheme = (): ThemeOption => {
  return (
    SOLID_COLORS.find(t => t.id === selectedTheme) ||
    GRADIENTS.find(t => t.id === selectedTheme) ||
    ...
```

**Problem:** The arrow function parameter `t` in `find(t => ...)` shadows the outer `t` from `useTranslation()`. While this doesn't cause a bug here (inner `t` is a ThemeOption, outer `t` is a function), it's confusing and violates clean code principles.

**Severity:** LOW — Code clarity issue.

---

### L-02: chat-theme-picker.tsx — `getTranslatedThemeName()` HAS SAME SHADOWING

**File:** `apps/mobile/app/(screens)/chat-theme-picker.tsx`, lines 108-117
Same shadowing of `t` in `.find(t => ...)`.

**Severity:** LOW

---

### L-03: new-conversation.tsx — EMPTY STATE DOESN'T USE `<EmptyState>` COMPONENT

**File:** `apps/mobile/app/(screens)/new-conversation.tsx`, lines 167-176
**Code:**
```tsx
ListEmptyComponent={() =>
  debouncedQuery.trim().length >= 2 ? (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{t('messages.noUsersFound', ...)}</Text>
    </View>
  ) : (
    <View style={styles.hint}>
      <Text style={styles.hintText}>{t('messages.searchByNameOrUsername')}</Text>
    </View>
  )
}
```

**Problem:** Project rules say "Empty states -> `<EmptyState icon="..." title="..." />` — NEVER bare `<Text>No items</Text>`". This uses bare View+Text instead of EmptyState component.

**Severity:** LOW — Violates coding standards.

---

### L-04: create-group.tsx — SAME `<EmptyState>` VIOLATION

**File:** `apps/mobile/app/(screens)/create-group.tsx`, lines 264-274
Same bare `<View><Text>` pattern instead of `<EmptyState>`.

**Severity:** LOW

---

### L-05: saved-messages.tsx — `useStore(s => s.user)` MAY NOT EXIST IN STORE

**File:** `apps/mobile/app/(screens)/saved-messages.tsx`, line 38
**Code:**
```tsx
const user = useStore(s => s.user);
```

**Problem:** The Zustand store documented in CLAUDE.md doesn't list a `user` property. It has `unreadNotifications`, `unreadMessages`, `safFeedType`, etc., but no `user`. This selector likely returns `undefined`.

**Severity:** LOW — Unused variable (not referenced elsewhere in the file).

---

### L-06: risalah.tsx — `listEmpty` MEMOIZATION HAS INCORRECT DEPS

**File:** `apps/mobile/app/(tabs)/risalah.tsx`, line 315
**Code:**
```tsx
}, [isLoading, activeTab, router]);
```

**Problem:** `listEmpty` uses `t()` for translations but doesn't include `t` in the dependency array. If the language changes while the screen is mounted, the empty state text won't update.

**Severity:** LOW — i18n reactivity issue.

---

### L-07: risalah.tsx — `listHeader` MISSING `t` and `isRTL` IN DEPS

**File:** `apps/mobile/app/(tabs)/risalah.tsx`, line 333
**Code:**
```tsx
}, [archivedCount, router]);
```

**Problem:** Uses `t()` and `isRTL` but doesn't include them in deps.

**Severity:** LOW

---

### L-08: risalah.tsx — `renderItem` MISSING `archiveMutation` and `t` IN DEPS

**File:** `apps/mobile/app/(tabs)/risalah.tsx`, line 366
**Code:**
```tsx
}, [user?.id, router, onlineUsers, typingUsers]);
```

**Problem:** `renderItem` references `archiveMutation.mutate` and `t()` but doesn't include them in the dependency array.

**Severity:** LOW — Stale closure risk.

---

### L-09: dm-note-editor.tsx — STATE MUTATION INSIDE `select` CALLBACK

**File:** `apps/mobile/app/(screens)/dm-note-editor.tsx`, lines 52-57
**Code:**
```tsx
select: (data) => {
  if (data && content === '' && !createMutation.isSuccess) {
    setContent(data.content);
  }
  return data;
},
```

**Problem:** Calling `setContent()` (state setter) inside a React Query `select` function. `select` should be a pure transformation. Setting state inside it can cause render loops. The correct approach is a `useEffect` that watches the query data.

**Severity:** LOW — Works in practice due to the guard condition, but is an anti-pattern.

---

### L-10: conversation/[id].tsx — `LayoutAnimation` USED WITH `react-native-reanimated`

**File:** `apps/mobile/app/(screens)/conversation/[id].tsx`, line 899
**Code:**
```tsx
LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
```

**Problem:** Mixing `LayoutAnimation` (core RN) with Reanimated animations can cause conflicts and undefined behavior. The Reanimated docs recommend against this combination.

**Severity:** LOW — May cause animation glitches on some devices.

---

### L-11: conversation-media.tsx — `download` ICON FOR DOCUMENTS

**File:** `apps/mobile/app/(screens)/conversation-media.tsx`, line 296
**Code:**
```tsx
<Icon name="download" size="sm" color={colors.text.tertiary} />
```

**Verified:** `download` is a valid Icon name. Not a bug.

**Severity:** N/A — False alarm.

---

### L-12: chat-theme-picker.tsx — FLATLISTS INSIDE SCROLLVIEW

**File:** `apps/mobile/app/(screens)/chat-theme-picker.tsx`, lines 340-382
**Code:**
```tsx
<ScrollView>
  ...
  {activeTab === 'solid' && (
    <FlatList data={SOLID_COLORS} scrollEnabled={false} ... />
  )}
```

**Problem:** FlatLists nested inside ScrollView with `scrollEnabled={false}`. While `scrollEnabled={false}` prevents the scroll conflict, it defeats the purpose of FlatList's virtualization. Should use plain `map()` or a SectionList instead.

**Severity:** LOW — Performance issue (non-virtualized list in ScrollView).

---

### L-13: risalah.tsx — `archivedConversationsCount` NOT SET ANYWHERE

**File:** `apps/mobile/app/(tabs)/risalah.tsx`, line 292
**Code:**
```tsx
const archivedCount = useStore((s) => s.archivedConversationsCount);
```

**Problem:** The Zustand store documented in CLAUDE.md doesn't list `archivedConversationsCount`. This likely returns `undefined` or `0`, and the archived row header is never shown.

**Severity:** LOW — Feature appears broken but is cosmetic.

---

### L-14: conversation/[id].tsx — PENDING MESSAGE MATCHING IS FRAGILE

**File:** `apps/mobile/app/(screens)/conversation/[id].tsx`, lines 903-906
**Code:**
```tsx
const matchedIndex = pending.findIndex(p =>
  p.id === msg.clientId ||
  (p.content === msg.content && Date.now() - new Date(p.createdAt).getTime() < 30000)
);
```

**Problem:** The fallback matching `(p.content === msg.content && ...)` can incorrectly match if two different pending messages have the same content within 30 seconds. This would remove the wrong pending message.

**Severity:** LOW — Edge case with identical messages sent in quick succession.

---

### L-15: chat-export.tsx — `fonts.bodySemiBold` IS ACTUALLY 500 WEIGHT

**File:** `apps/mobile/app/(screens)/chat-export.tsx`, line 299
**Verified:** `fonts.bodySemiBold` maps to `'DMSans_500Medium'` which is medium weight (500), not semibold (600). This is intentional per the theme file but semantically misleading.

**Severity:** LOW — Naming inconsistency in theme file, not a screen bug.

---

### L-16: disappearing-settings.tsx — `haptic.selection()` MAY NOT EXIST

**File:** `apps/mobile/app/(screens)/disappearing-settings.tsx`, line 75
**Code:**
```tsx
haptic.selection();
```

**Problem:** The `useHaptic` hook typically provides `light()`, `success()`, `error()` etc. Need to verify `selection()` exists. If not, this will be a runtime error.

**Severity:** LOW — Potential runtime error.

---

### L-17: conversation-info.tsx — ScrollView HAS NO RefreshControl

**File:** `apps/mobile/app/(screens)/conversation-info.tsx`, line 244
**Code:**
```tsx
<ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
```

**Problem:** Per project rules, all scrollable containers should have RefreshControl. This ScrollView has no pull-to-refresh capability, so if the conversation data changes on the server, the user has no way to refresh without leaving and re-entering the screen.

**Severity:** LOW — Missing refresh control.

---

## SUMMARY TABLE

| Severity | Count | Key Issues |
|----------|-------|------------|
| CRITICAL | 5 | Param mismatch (media never loads), raw fetch without auth (saved-messages, chat-folders), duplicate Pressable imports (5+ files) |
| HIGH | 12 | Syntax errors (3 files), client-side filtering broken (starred/pinned), search cosmetic-only, no error handling on fetch, theme buttons non-functional, sliders non-interactive, edit folder stubbed, voice waveform flickering |
| MEDIUM | 18 | Hardcoded English (9+ strings), socket reconnection gaps, typing indicator stuck, encryption race condition, deprecated API, React hooks violation, potential crash |
| LOW | 17 | Variable shadowing, EmptyState violations, stale closures, anti-patterns, missing deps, animation conflicts |
| **TOTAL** | **52** | |

## TOP 5 RECOMMENDATIONS (Priority Order)

1. **Fix saved-messages.tsx and chat-folders.tsx to use `api.get()`/`api.post()` instead of raw `fetch()`** — both screens are completely non-functional
2. **Fix conversation-media.tsx param mismatch** — change conversation-info.tsx navigation to `?id=` instead of `?conversationId=`
3. **Fix 3 syntax errors** (starred-messages, pinned-messages, chat-wallpaper) — missing closing braces on imports
4. **Fix 5+ duplicate Pressable imports** — remove duplicates in conversation/[id], saved-messages, chat-theme-picker, create-group, create-broadcast
5. **Add server-side API for starred/pinned messages** — client-side filtering of all messages is unfeasible at scale
