# Agent #51 — Bookmarks, Reports, Saved, Archive, Downloads, History Screens

**Scope:** 11 screen files in `apps/mobile/app/(screens)/`
- `bookmark-collections.tsx` (237 lines)
- `bookmark-folders.tsx` (304 lines)
- `report.tsx` (300 lines)
- `my-reports.tsx` (244 lines)
- `saved-messages.tsx` (272 lines)
- `saved.tsx` (554 lines)
- `archive.tsx` (284 lines)
- `downloads.tsx` (572 lines)
- `watch-history.tsx` (327 lines)
- `xp-history.tsx` (422 lines)
- `call-history.tsx` (287 lines)

**Total findings: 38**

---

## FINDING 01 — CRITICAL: `report.tsx` details text never sent to API (DATA LOSS)
- **File:** `apps/mobile/app/(screens)/report.tsx`
- **Lines:** 40–64
- **Severity:** CRITICAL (user input silently discarded)
- **Code:**
```tsx
const [details, setDetails] = useState('');  // line 40

const reportMutation = useMutation({
  mutationFn: async () => {
    const { type, id } = params;
    const reason = selectedReason;
    if (!reason) throw new Error(t('screens.report.selectReason'));

    switch (type) {
      case 'post':
        return postsApi.report(id, reason);   // only sends reason, never details
      case 'thread':
        return threadsApi.report(id, reason);
      case 'reel':
        return reelsApi.report(id, reason);
      case 'video':
        return videosApi.report(id, reason);
      case 'user':
        return usersApi.report(id, reason);
      // ...
    }
  },
```
- **Explanation:** The user enters free-text details (lines 152–173, with 500 char limit), but the `mutationFn` never passes `details` to ANY API call. The API's `ReportDto` only accepts `reason` (a single string). The centralized `reportsApi.create()` in `api.ts` does accept `description`, but report.tsx calls per-resource endpoints (`postsApi.report`, etc.) which only take `(id, reason)`. The user's detailed description is collected, displayed, counted with a char counter — then silently dropped on submit.

---

## FINDING 02 — CRITICAL: `archive.tsx` malformed import (SYNTAX ERROR)
- **File:** `apps/mobile/app/(screens)/archive.tsx`
- **Lines:** 2–4
- **Severity:** CRITICAL (will not compile/parse)
- **Code:**
```tsx
import {
  View, StyleSheet, FlatList, Alert, Pressable, type ViewStyle, type ImageStyle,
import { useRouter } from 'expo-router';
```
- **Explanation:** Line 3 is missing the closing `}` and `from 'react-native';` for the first import statement. The `import {` block on line 2 never closes — it jumps directly to a new `import` statement on line 4. This is a syntax error. The file will not parse. If Metro/Babel handles this, it's only by accident (perhaps auto-fixing). The closing brace + module source is completely missing. The import should be:
```tsx
import {
  View, StyleSheet, FlatList, Alert, Pressable, type ViewStyle, type ImageStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
```

---

## FINDING 03 — CRITICAL: `saved.tsx` uses `t()` outside component scope (RUNTIME CRASH)
- **File:** `apps/mobile/app/(screens)/saved.tsx`
- **Lines:** 35–61, 64–89, 92–119
- **Severity:** CRITICAL (ReferenceError at runtime)
- **Code:**
```tsx
function PostGrid({ post, onPress }: { post: Post; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.gridItem}
      accessibilityRole="button"
      accessibilityLabel={t('accessibility.viewPost')}   // line 42 — t is NOT defined
    >
```
- **Explanation:** The `PostGrid`, `ReelGrid`, and `VideoRow` sub-components at lines 35, 64, and 92 do NOT call `useTranslation()` and do NOT receive `t` as a prop. They reference `t('accessibility.viewPost')`, `t('accessibility.viewReel')` etc. at lines 42, 72 — but `t` is only defined inside the parent `SavedScreen` component (line 123). These sub-components are defined at module scope, not nested inside `SavedScreen`, so `t` is a `ReferenceError`. This will crash the app when any saved post or reel grid item renders.

---

## FINDING 04 — COMPILE ERROR: Duplicate `Pressable` import in 5 files
- **File:** `apps/mobile/app/(screens)/bookmark-folders.tsx`, line 5
- **File:** `apps/mobile/app/(screens)/report.tsx`, line 10
- **File:** `apps/mobile/app/(screens)/saved-messages.tsx`, line 5
- **File:** `apps/mobile/app/(screens)/saved.tsx`, line 5
- **File:** `apps/mobile/app/(screens)/downloads.tsx`, line 5
- **Severity:** MEDIUM (duplicate import, potential compile warning or error)
- **Code (bookmark-folders.tsx):**
```tsx
import {
  View, Text, TextInput, StyleSheet, Pressable, FlatList, RefreshControl,
  Dimensions, Alert,
  Pressable,         // <-- duplicate
} from 'react-native';
```
- **Explanation:** `Pressable` is imported twice in the same destructured import from `react-native`. Same pattern in report.tsx (lines 7+10: `Pressable` appears twice), saved-messages.tsx (lines 3+5), saved.tsx (lines 4+5), and downloads.tsx (lines 4+5). While JavaScript destructuring allows duplicate names (last wins), this is a code smell that may cause linter errors or warnings, and indicates sloppy code generation.

---

## FINDING 05 — CRITICAL: `saved-messages.tsx` uses raw `fetch()` without auth token (ALL REQUESTS FAIL 401)
- **File:** `apps/mobile/app/(screens)/saved-messages.tsx`
- **Lines:** 24–31, 53–58, 70–72, 81–83
- **Severity:** CRITICAL (all API calls fail)
- **Code:**
```tsx
const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

async function fetchSavedMessages(cursor?: string) {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(`${API_BASE}/saved-messages?${params}`);  // NO auth header
  return res.json();
}
```
- **Explanation:** All 4 API calls in this screen (fetchSavedMessages, saveMutation, deleteMutation, pinMutation) use raw `fetch()` instead of the authenticated `api` client. None of them include an `Authorization: Bearer <token>` header. The backend's `/saved-messages` endpoints use `ClerkAuthGuard`, so all requests will return 401 Unauthorized. The screen is completely non-functional. Should use `import { savedMessagesApi } from '@/services/api'` or the authenticated `api` helper.

---

## FINDING 06 — MEDIUM: `saved-messages.tsx` hardcoded English strings (i18n violation)
- **File:** `apps/mobile/app/(screens)/saved-messages.tsx`
- **Lines:** 110, 117, 156, 232
- **Severity:** MEDIUM (i18n violation)
- **Code:**
```tsx
<Text style={styles.pinText}>Pinned</Text>                    // line 110
<Text style={styles.forwardText}>Forwarded from {item.forwardedFromType as string}</Text>  // line 117
<Text style={styles.infoText}>
  Your personal cloud notepad. Save messages, links, and files — accessible on all devices.
</Text>                                                         // line 156
<BottomSheetItem
  label={menuItem?.isPinned ? 'Unpin' : 'Pin'}                // line 232
```
- **Explanation:** 4 hardcoded English strings that bypass i18n. "Pinned", "Forwarded from ...", the info bar text, and "Unpin"/"Pin" labels are not using `t()`. All user-visible text must go through `useTranslation()` per project rules.

---

## FINDING 07 — MEDIUM: `report.tsx` uses per-resource report endpoints instead of centralized `reportsApi.create()`
- **File:** `apps/mobile/app/(screens)/report.tsx`
- **Lines:** 48–64
- **Severity:** MEDIUM (API inconsistency, no tracking)
- **Code:**
```tsx
switch (type) {
  case 'post':
    return postsApi.report(id, reason);   // POST /posts/:id/report
  case 'thread':
    return threadsApi.report(id, reason); // POST /threads/:id/report
  // ...
}
```
- **Explanation:** The screen dispatches reports to individual resource endpoints (`/posts/:id/report`, `/threads/:id/report`, etc.) which only take a `reason` string. But the backend also has a centralized `/reports` endpoint (`reportsApi.create()`) that accepts `reason`, `description`, and individual FK fields (`reportedPostId`, `reportedUserId`, etc.) — this is the endpoint that creates records in the `Report` table that `my-reports.tsx` queries. Using per-resource endpoints means: (a) description is lost (Finding 01), and (b) the report may not appear in "My Reports" if the per-resource endpoint doesn't also create a Report record.

---

## FINDING 08 — LOW: `report.tsx` hardcoded English accessibility label
- **File:** `apps/mobile/app/(screens)/report.tsx`
- **Line:** 87
- **Severity:** LOW (a11y label not i18n'd)
- **Code:**
```tsx
accessibilityLabel: 'Go back'
```
- **Explanation:** Should use `t('accessibility.goBack')` or `t('common.back')` instead of hardcoded English.

---

## FINDING 09 — LOW: `report.tsx` uses raw `{details.length}/500` instead of `<CharCountRing>`
- **File:** `apps/mobile/app/(screens)/report.tsx`
- **Lines:** 169–171
- **Severity:** LOW (violates project code quality rule #7)
- **Code:**
```tsx
<Text style={styles.charCount}>
  {details.length}/500
</Text>
```
- **Explanation:** Per CLAUDE.md rule #7: "Char count -> `<CharCountRing current={n} max={m} />`  — NEVER plain `{n}/500` text". This screen uses a plain text char counter instead of the required `CharCountRing` component.

---

## FINDING 10 — MEDIUM: `my-reports.tsx` hardcoded English strings in `getTargetText()`
- **File:** `apps/mobile/app/(screens)/my-reports.tsx`
- **Lines:** 63–69
- **Severity:** MEDIUM (i18n violation)
- **Code:**
```tsx
const getTargetText = (item: Report) => {
  if (item.reportedUserId && item.reportedUser) return `User: @${item.reportedUser.username}`;
  if (item.reportedPostId) return 'Post';
  if (item.reportedCommentId) return 'Comment';
  if (item.reportedMessageId) return 'Message';
  return 'Content';
};
```
- **Explanation:** Five hardcoded English strings ("User:", "Post", "Comment", "Message", "Content") that should use `t()` for localization.

---

## FINDING 11 — MEDIUM: `my-reports.tsx` hardcoded date format
- **File:** `apps/mobile/app/(screens)/my-reports.tsx`
- **Lines:** 99–100
- **Severity:** MEDIUM (locale-insensitive)
- **Code:**
```tsx
{format(new Date(item.createdAt), 'MMM d, yyyy')} • {formatDistanceToNowStrict(new Date(item.createdAt))} ago
```
- **Explanation:** Date format `'MMM d, yyyy'` is hardcoded English. The word "ago" on line 100 is also hardcoded English. date-fns `formatDistanceToNowStrict` supports locale parameters but none is passed. For Arabic/Turkish/etc. users, dates render in English.

---

## FINDING 12 — LOW: `my-reports.tsx` unused `isRTL` variable
- **File:** `apps/mobile/app/(screens)/my-reports.tsx`
- **Line:** 23
- **Severity:** LOW (dead code)
- **Code:**
```tsx
const { t, isRTL } = useTranslation();
```
- **Explanation:** `isRTL` is destructured but never used in the component. Minor dead code.

---

## FINDING 13 — MEDIUM: `bookmark-folders.tsx` create folder is a no-op (never persists)
- **File:** `apps/mobile/app/(screens)/bookmark-folders.tsx`
- **Lines:** 81–94
- **Severity:** MEDIUM (feature broken)
- **Code:**
```tsx
const handleCreateFolder = useCallback(async () => {
  const trimmed = newFolderName.trim();
  if (!trimmed) {
    Alert.alert(t('common.error'), t('screens.bookmarkFolders.emptyNameError'));
    return;
  }
  // Collections are created implicitly when a bookmark is moved into them.
  // For now, we just store the name locally — it'll be created server-side
  // when the user first saves a bookmark to this collection.
  setNewFolderName('');
  setCreateSheetVisible(false);
  // Refresh the collections list
  collectionsQuery.refetch();
}, [newFolderName, collectionsQuery]);
```
- **Explanation:** The "Create Folder" flow has a bottom sheet with a text input and create button, but it does nothing. The folder name is captured, validated for empty, then discarded. No API call is made, no local storage is updated. The comment says "created implicitly" but there's no mechanism to create implicitly either. The user sees a success-like flow (sheet closes, list refreshes) but the folder doesn't actually exist.

---

## FINDING 14 — MEDIUM: `bookmark-folders.tsx` delete folder is a no-op
- **File:** `apps/mobile/app/(screens)/bookmark-folders.tsx`
- **Lines:** 96–113
- **Severity:** MEDIUM (feature broken)
- **Code:**
```tsx
const handleDeleteFolder = useCallback(async (folderId: string) => {
  Alert.alert(
    // ...
    {
      text: t('screens.bookmarkFolders.deleteButton'),
      style: 'destructive',
      onPress: async () => {
        // Server-side collections are implicit — deleting just refreshes the list
        // In a full implementation, we'd call a delete API endpoint
        collectionsQuery.refetch();
      },
    },
  );
}, [collectionsQuery]);
```
- **Explanation:** Delete confirmation shows a destructive alert, user confirms, but the onPress handler only calls `collectionsQuery.refetch()` — no delete API call. The folder persists after "deletion".

---

## FINDING 15 — MEDIUM: `bookmark-folders.tsx` synthetic folder IDs don't match API data
- **File:** `apps/mobile/app/(screens)/bookmark-folders.tsx`
- **Lines:** 70–74
- **Severity:** MEDIUM (navigation broken)
- **Code:**
```tsx
const foldersArray: Folder[] = collections.map((c, i) => ({
  id: String(i),                    // synthetic index-based ID
  name: c.name,
  itemIds: Array.from({ length: c.count }, (_, j) => String(j)),  // synthetic item IDs
}));
```
- **Explanation:** Collections from the API have a `name` field as identifier. But this code generates synthetic numeric IDs (`"0"`, `"1"`, `"2"`) based on array index. When a folder card is pressed (line 116), it navigates to `/(screens)/saved?folder=${folderId}` — passing `"0"` or `"1"` as the folder ID. In `saved.tsx`, this `folder` param is used to look up items in AsyncStorage (line 172–178), which stores folders by some other key scheme. The navigation parameter semantics are completely mismatched.

---

## FINDING 16 — MEDIUM: `bookmark-collections.tsx` navigates to `saved` with `collection` param, but `saved.tsx` only reads `folder` param
- **File:** `apps/mobile/app/(screens)/bookmark-collections.tsx`, line 49
- **File:** `apps/mobile/app/(screens)/saved.tsx`, line 127–128
- **Severity:** MEDIUM (navigation param ignored)
- **Code (bookmark-collections.tsx):**
```tsx
router.push(`/(screens)/saved?collection=${encodeURIComponent(item.name)}` as never);
```
- **Code (saved.tsx):**
```tsx
const params = useLocalSearchParams<{ folder?: string }>();
const folderId = params.folder;
```
- **Explanation:** `bookmark-collections.tsx` passes `collection=xxx` as a URL param, but `saved.tsx` only reads `folder` (not `collection`). The collection name is silently ignored. The saved screen always shows all saved items regardless of which collection was tapped. The param name mismatch means collection filtering never works.

---

## FINDING 17 — MEDIUM: `saved.tsx` folder loading from AsyncStorage is disconnected from actual bookmarks
- **File:** `apps/mobile/app/(screens)/saved.tsx`
- **Lines:** 164–192
- **Severity:** MEDIUM (feature non-functional)
- **Code:**
```tsx
useEffect(() => {
  const loadFolder = async () => {
    if (!folderId) { setFolderItems([]); return; }
    setFolderLoading(true);
    try {
      const stored = await AsyncStorage.getItem('bookmark-folders');
      if (stored) {
        const data = JSON.parse(stored);
        const folder = data[folderId];
        // ...
      }
    }
  };
  loadFolder();
}, [folderId]);
```
- **Explanation:** Even if a folderId is passed, the code reads from AsyncStorage key `'bookmark-folders'`. But NO screen in the codebase ever WRITES to this AsyncStorage key (bookmark-folders.tsx's create handler is a no-op — Finding 13). So `stored` will always be `null`, and `folderItems` will always be `[]`. Additionally, even if folderItems were populated, the loaded IDs are never used to filter the FlatList data — the `posts`, `threads`, `reels`, `videos` arrays (lines 194–197) are not filtered by `folderItems`.

---

## FINDING 18 — LOW: `saved.tsx` imports `useEffect` from React but it's only imported via `useState`
- **File:** `apps/mobile/app/(screens)/saved.tsx`
- **Line:** 1
- **Severity:** LOW (misleading)
- **Code:**
```tsx
import { useState, useEffect } from 'react';
```
- **Explanation:** `useEffect` IS used at line 164, so this import is correct. No issue here. (Retracted — this is fine.)

---

## FINDING 19 — MEDIUM: `saved.tsx` imports `AsyncStorage` for a feature that never works
- **File:** `apps/mobile/app/(screens)/saved.tsx`
- **Line:** 10
- **Severity:** MEDIUM (dead code, bundle bloat)
- **Code:**
```tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
```
- **Explanation:** AsyncStorage is imported and used in the useEffect (lines 164–192) to load folder items, but as explained in Finding 17, no code ever writes to this key. The entire folder-filtering flow is dead code: import, state variables (`folderItems`, `folderLoading`), and the useEffect are all dead.

---

## FINDING 20 — LOW: `saved.tsx` unused `folderLoading` state
- **File:** `apps/mobile/app/(screens)/saved.tsx`
- **Lines:** 130–131
- **Severity:** LOW (dead code)
- **Code:**
```tsx
const [folderItems, setFolderItems] = useState<string[]>([]);
const [folderLoading, setFolderLoading] = useState(false);
```
- **Explanation:** `folderLoading` is set to true/false in the useEffect but is never read or checked anywhere in the render tree. No loading indicator for folder data.

---

## FINDING 21 — MEDIUM: `saved.tsx` references potentially non-existent theme property
- **File:** `apps/mobile/app/(screens)/saved.tsx`
- **Line:** 527
- **Severity:** LOW (verified — property exists)
- **Code:**
```tsx
borderColor: colors.dark.borderLight,
```
- **Explanation:** `colors.dark.borderLight` does exist in the theme (value `'#484F58'`). No issue. (Verified via grep.)

---

## FINDING 22 — MEDIUM: `archive.tsx` imports `RefreshControl` from `react-native-gesture-handler` instead of `react-native`
- **File:** `apps/mobile/app/(screens)/archive.tsx`
- **Line:** 9
- **Severity:** MEDIUM (inconsistency, potential behavioral difference)
- **Code:**
```tsx
import { RefreshControl } from 'react-native-gesture-handler';
```
- **Explanation:** Every other screen in the audit scope imports `RefreshControl` from `'react-native'`. This screen imports it from `'react-native-gesture-handler'`. While both work, the gesture-handler version has different behavior on Android (different gesture system). This inconsistency may cause subtle UX differences. More critically, if `react-native-gesture-handler` is not properly set up in the Expo config, this could fail silently.

---

## FINDING 23 — LOW: `archive.tsx` inconsistent accessibility label
- **File:** `apps/mobile/app/(screens)/archive.tsx`
- **Line:** 172
- **Severity:** LOW (inconsistency)
- **Code:**
```tsx
<GlassHeader title={t('screens.archive.title')} leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Back' }} />
```
- **Explanation:** This is the main render path GlassHeader. The accessibilityLabel is hardcoded 'Back' instead of `t('common.back')` as used in the error and loading state renders (line 148). Inconsistent i18n for accessibility labels.

---

## FINDING 24 — MEDIUM: `archive.tsx` ITEM_SIZE uses percentage string for width, which won't work with `numColumns` FlatList
- **File:** `apps/mobile/app/(screens)/archive.tsx`
- **Lines:** 23, 235
- **Severity:** MEDIUM (layout issue)
- **Code:**
```tsx
const ITEM_SIZE = `${100 / GRID_COLUMNS}%` as const;  // line 23 = "33.333%"

gridItem: {
  width: ITEM_SIZE,         // line 235 — string percentage
  aspectRatio: 0.75,
```
- **Explanation:** When using `numColumns={3}` on a FlatList, React Native expects items to have a fixed numeric width, not a percentage string. FlatList with numColumns distributes items in rows and expects the items to size themselves. Using `width: '33.333%'` may work but is fragile — it depends on the parent container being exactly the right width. Other screens (like `saved.tsx`) calculate a pixel width using `Dimensions.get('window').width`. This could cause layout issues on some devices.

---

## FINDING 25 — MEDIUM: `downloads.tsx` uses `useInfiniteQuery` for storage stats (unnecessary pagination)
- **File:** `apps/mobile/app/(screens)/downloads.tsx`
- **Lines:** 229–234
- **Severity:** LOW (over-engineering, no functional impact)
- **Code:**
```tsx
const storageQuery = useInfiniteQuery({
  queryKey: ['downloads-storage'],
  queryFn: () => downloadsApi.getStorage() as Promise<{ usedBytes: number; count: number }>,
  initialPageParam: undefined,
  getNextPageParam: () => undefined,
});
```
- **Explanation:** Storage stats is a single object endpoint (not paginated), but it's fetched using `useInfiniteQuery` with `getNextPageParam: () => undefined`. This adds unnecessary complexity. Should use plain `useQuery` instead. The data access pattern `storageQuery.data?.pages[0]` (line 235) is also unnecessarily complex.

---

## FINDING 26 — MEDIUM: `downloads.tsx` pause/resume/retry actions are no-ops
- **File:** `apps/mobile/app/(screens)/downloads.tsx`
- **Lines:** 272–288
- **Severity:** MEDIUM (3 of 4 actions are stubs)
- **Code:**
```tsx
const handleAction = useCallback(
  (item: OfflineDownload, action: 'pause' | 'resume' | 'retry' | 'delete') => {
    haptic.light();
    if (action === 'delete') {
      // ... actual delete logic
    }
    // pause / resume / retry would call the downloadManager service
    // and update progress via the API — left to the download orchestration layer
  },
```
- **Explanation:** Only `delete` actually works. `pause`, `resume`, and `retry` are button press handlers that give haptic feedback but do nothing. The UI shows pause/resume/retry buttons for downloads but they're inert. The comment admits they're "left to the download orchestration layer" which doesn't exist.

---

## FINDING 27 — LOW: `downloads.tsx` "Play Offline" bottom sheet action is a no-op
- **File:** `apps/mobile/app/(screens)/downloads.tsx`
- **Lines:** 391–397
- **Severity:** LOW (stub)
- **Code:**
```tsx
<BottomSheetItem
  label={t('downloads.playOffline')}
  icon={<Icon name="play" size="sm" color={colors.emerald} />}
  onPress={() => {
    handleSheetClose();
    // Navigate to content detail for offline playback
  }}
/>
```
- **Explanation:** The "Play Offline" button closes the sheet and does nothing else. The comment says it should navigate to content detail for offline playback, but no navigation is implemented.

---

## FINDING 28 — MEDIUM: `watch-history.tsx` passes `<Text>` component as icon prop to GlassHeader
- **File:** `apps/mobile/app/(screens)/watch-history.tsx`
- **Lines:** 181–185
- **Severity:** MEDIUM (type mismatch, may crash or render incorrectly)
- **Code:**
```tsx
rightActions={[{
  icon: <Text style={styles.clearText}>{t('screens.watch-history.clear')}</Text>,
  onPress: handleClear,
  accessibilityLabel: t('screens.watch-history.clearConfirmTitle'),
}]}
```
- **Explanation:** GlassHeader's `rightActions[].icon` expects an `IconName` string (e.g., 'trash', 'x'), not a JSX element. Passing a `<Text>` component as the icon will either cause a type error, render incorrectly, or crash depending on how GlassHeader handles the icon prop internally.

---

## FINDING 29 — LOW: `watch-history.tsx` Alert.alert clearHistory doesn't handle errors
- **File:** `apps/mobile/app/(screens)/watch-history.tsx`
- **Lines:** 143–146
- **Severity:** LOW (unhandled promise rejection)
- **Code:**
```tsx
onPress: async () => {
  await usersApi.clearWatchHistory();
  watchHistoryQuery.refetch();
},
```
- **Explanation:** If `clearWatchHistory()` fails (network error, 500, etc.), the promise rejection is unhandled inside the Alert callback. Should have a try/catch.

---

## FINDING 30 — MEDIUM: `xp-history.tsx` references `colors.emeraldLight` which exists but is not a standard token
- **File:** `apps/mobile/app/(screens)/xp-history.tsx`
- **Line:** 90
- **Severity:** LOW (not a problem — verified exists at theme line 7)
- **Code:**
```tsx
colors={[colors.emeraldLight, colors.emerald]}
```
- **Explanation:** `colors.emeraldLight` does exist in the theme (`'#0D9B63'`). No issue. (Verified.)

---

## FINDING 31 — MEDIUM: `xp-history.tsx` references `fonts.bodySemiBold` which maps to `DMSans_500Medium`
- **File:** `apps/mobile/app/(screens)/xp-history.tsx`
- **Lines:** 335, 401
- **Severity:** LOW (semantic mismatch but functional)
- **Code:**
```tsx
fontFamily: fonts.bodySemiBold,  // = 'DMSans_500Medium'
```
- **Explanation:** `fonts.bodySemiBold` is mapped to `'DMSans_500Medium'` in the theme. Semantically, "SemiBold" (600 weight) mapped to "Medium" (500 weight) is a mismatch, but the font family string is what's registered with `useFonts()`, so it works. The naming is misleading but not a bug.

---

## FINDING 32 — LOW: `xp-history.tsx` custom `timeAgo()` function hardcodes English strings
- **File:** `apps/mobile/app/(screens)/xp-history.tsx`
- **Lines:** 59–72
- **Severity:** MEDIUM (i18n violation)
- **Code:**
```tsx
function timeAgo(dateStr: string): string {
  // ...
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}
```
- **Explanation:** Hardcoded English time strings ("just now", "m ago", "h ago", "d ago"). Should use date-fns with locale or i18n keys.

---

## FINDING 33 — LOW: `xp-history.tsx` REASON_ICONS uses `book-open` and `star` which are valid
- **File:** `apps/mobile/app/(screens)/xp-history.tsx`
- **Lines:** 40–52
- **Severity:** NONE (verified valid)
- **Explanation:** All icon names in REASON_ICONS (`edit`, `message-circle`, `heart`, `share`, `users`, `trending-up`, `flag`, `check-circle`, `book-open`, `star`, `gift`) are valid IconName values. No issue.

---

## FINDING 34 — MEDIUM: `bookmark-collections.tsx` uses `item.name` as keyExtractor which may not be unique
- **File:** `apps/mobile/app/(screens)/bookmark-collections.tsx`
- **Line:** 136
- **Severity:** LOW (potential key collision)
- **Code:**
```tsx
keyExtractor={(item) => item.name}
```
- **Explanation:** Collection names are used as React keys. If two collections have the same name (edge case), this causes React key collision warnings and incorrect rendering. Should use a unique ID if available.

---

## FINDING 35 — MEDIUM: `downloads.tsx` download item title shows truncated ID, not actual content title
- **File:** `apps/mobile/app/(screens)/downloads.tsx`
- **Lines:** 161–163
- **Severity:** MEDIUM (poor UX)
- **Code:**
```tsx
<Text style={styles.itemTitle} numberOfLines={1}>
  {item.contentId.slice(0, 8)}...
</Text>
```
- **Explanation:** The download item title displays the first 8 characters of a content ID (likely a cuid or uuid), which is meaningless to users. Shows something like `"cl5x8mn2..."` instead of the actual post/video title. The `OfflineDownload` type likely doesn't include the content title, so this is a data modeling issue — the download record should include the content title.

---

## FINDING 36 — LOW: `bookmark-collections.tsx` inline renderItem with FadeInUp animation on every render
- **File:** `apps/mobile/app/(screens)/bookmark-collections.tsx`
- **Lines:** 42–80
- **Severity:** LOW (performance)
- **Code:**
```tsx
const renderItem = ({ item, index }: { item: BookmarkCollection; index: number }) => (
  <Animated.View entering={FadeInUp.delay(index * 50).duration(400)}>
```
- **Explanation:** `renderItem` is defined inside the component body but is not wrapped in `useCallback`. Every re-render creates a new function reference. While FlatList has `removeClippedSubviews={true}`, the lack of memoization means unnecessary re-renders of the list items on any state change (e.g., refreshing toggle).

---

## FINDING 37 — MEDIUM: `saved-messages.tsx` renderMessage has stale closure (empty dependency array)
- **File:** `apps/mobile/app/(screens)/saved-messages.tsx`
- **Line:** 140
- **Severity:** MEDIUM (stale closures for haptic and setMenuItem)
- **Code:**
```tsx
const renderMessage = useCallback(({ item, index }: { item: Record<string, unknown>; index: number }) => {
  // ... uses haptic.light() and setMenuItem(item)
}, []);  // empty dependency array!
```
- **Explanation:** `renderMessage` is wrapped in `useCallback` with an empty dependency array `[]`, but it closes over `haptic` (line 105) and `setMenuItem` (line 105). While `setMenuItem` from `useState` is stable, `haptic` comes from `useHaptic()` which may return a new object on each render. More importantly, the empty deps means any future additions to the callback that reference changing state will have stale values.

---

## FINDING 38 — MEDIUM: `call-history.tsx` calls endpoint route `/(screens)/call/${item.id}` which may not exist
- **File:** `apps/mobile/app/(screens)/call-history.tsx`
- **Line:** 122
- **Severity:** MEDIUM (potential dead navigation)
- **Code:**
```tsx
onPress={() => router.push(`/(screens)/call/${item.id}` as never)}
```
- **Explanation:** The call-back button navigates to `/(screens)/call/${item.id}`, but there's no evidence this route exists. The calls system is documented as "UI facades (zero WebRTC)" — meaning the call detail/initiation screen may not exist or may be non-functional.

---

## Summary of Critical Findings

| # | Severity | File | Issue |
|---|----------|------|-------|
| 01 | CRITICAL | report.tsx | Details text never sent to API — user input silently dropped |
| 02 | CRITICAL | archive.tsx | Malformed import — missing closing brace + `from 'react-native'` |
| 03 | CRITICAL | saved.tsx | `t()` used in 3 sub-components that don't have `useTranslation()` — ReferenceError crash |
| 04 | MEDIUM | 5 files | Duplicate `Pressable` import in destructured imports |
| 05 | CRITICAL | saved-messages.tsx | All API calls use raw `fetch()` without auth headers — 401 on every request |
| 06 | MEDIUM | saved-messages.tsx | 4 hardcoded English strings bypass i18n |
| 07 | MEDIUM | report.tsx | Uses per-resource report endpoints, not centralized reportsApi — description lost |
| 13 | MEDIUM | bookmark-folders.tsx | Create folder is a complete no-op |
| 14 | MEDIUM | bookmark-folders.tsx | Delete folder is a complete no-op |
| 15 | MEDIUM | bookmark-folders.tsx | Synthetic folder IDs don't match API data |
| 16 | MEDIUM | bookmark-collections.tsx → saved.tsx | Collection param name mismatch (`collection` vs `folder`) |
| 17 | MEDIUM | saved.tsx | AsyncStorage folder loading reads from key that no code ever writes to |
| 26 | MEDIUM | downloads.tsx | Pause/resume/retry actions are no-ops (only delete works) |
| 28 | MEDIUM | watch-history.tsx | `<Text>` JSX passed as GlassHeader icon prop (type mismatch) |
| 32 | MEDIUM | xp-history.tsx | Custom timeAgo() hardcodes English strings |

**Critical count: 4**
**Medium count: 17**
**Low count: 10**
**Non-issue (retracted): 3**
**Total actionable: 34**
