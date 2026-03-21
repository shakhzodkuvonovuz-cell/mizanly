# Agent #50 — Community Screens Deep Audit

**Scope:** 10 community-related mobile screens
**Files audited (line-by-line):**
1. `apps/mobile/app/(screens)/broadcast-channels.tsx` (448 lines)
2. `apps/mobile/app/(screens)/community-posts.tsx` (631 lines)
3. `apps/mobile/app/(screens)/mentorship.tsx` (230 lines)
4. `apps/mobile/app/(screens)/waqf.tsx` (155 lines)
5. `apps/mobile/app/(screens)/local-boards.tsx` (145 lines)
6. `apps/mobile/app/(screens)/circles.tsx` (362 lines)
7. `apps/mobile/app/(screens)/fatwa-qa.tsx` (262 lines)
8. `apps/mobile/app/(screens)/volunteer-board.tsx` (499 lines)
9. `apps/mobile/app/(screens)/watch-party.tsx` (188 lines)
10. `apps/mobile/app/(screens)/voice-post-create.tsx` (188 lines)
11. `apps/mobile/app/(screens)/event-detail.tsx` (772 lines)

**Total findings: 52**

---

## CRITICAL (Ship Blockers)

### Finding 1: broadcast-channels.tsx — NO useEffect, screen loads permanently empty
- **File:** `apps/mobile/app/(screens)/broadcast-channels.tsx`
- **Lines:** 39-107 (entire component body)
- **Severity:** CRITICAL / Ship Blocker
- **Code:**
```tsx
// Line 74-91: loadDiscoverChannels is defined...
const loadDiscoverChannels = useCallback(async (refresh = false) => {
  // ...fetch logic...
}, [discoverCursor, discoverLoading]);

// Line 93-107: loadMyChannels is defined...
const loadMyChannels = useCallback(async (refresh = false) => {
  // ...fetch logic...
}, [myChannelsLoading]);
```
- **Problem:** There is NO `useEffect` anywhere in this file. `loadDiscoverChannels()` and `loadMyChannels()` are defined as callbacks but **never called on mount**. The screen renders with `discoverChannels = []` and `myChannels = []` forever. The only way to load data is to pull-to-refresh, but a user would see the EmptyState first with no indication they need to refresh. The entire broadcast channels feature is dead on arrival.
- **Fix:** Add `useEffect(() => { loadDiscoverChannels(true); }, [])` on mount, and trigger `loadMyChannels(true)` when switching to the "my" tab (or also on mount).

### Finding 2: mentorship.tsx — getToken() always returns empty string, API calls always fail
- **File:** `apps/mobile/app/(screens)/mentorship.tsx`
- **Lines:** 206-209
- **Code:**
```tsx
async function getToken() {
  // Clerk token getter — in real app, use the auth context
  return '';
}
```
- **Problem:** The `getToken()` function is a stub that always returns `''`. It is used on line 48:
```tsx
headers: { Authorization: `Bearer ${await getToken()}` },
```
This means the "My Mentorships" tab always sends `Authorization: Bearer ` (empty token), which will always result in a 401 Unauthorized from the backend. The "My Mentorships" tab is completely non-functional.
- **Fix:** Use `useAuth()` from `@clerk/clerk-expo` to get the actual session token, like every other screen does.

### Finding 3: waqf.tsx — Contribute button is a no-op (only fires haptic)
- **File:** `apps/mobile/app/(screens)/waqf.tsx`
- **Lines:** 79-84
- **Code:**
```tsx
<Pressable accessibilityRole="button" style={styles.contributeBtn} onPress={() => haptic.light()}>
  <LinearGradient colors={[colors.gold, '#D4A94F']} style={styles.contributeBtnGradient}>
    <Icon name="heart" size="sm" color="#FFF" />
    <Text style={styles.contributeBtnText}>Contribute</Text>
  </LinearGradient>
</Pressable>
```
- **Problem:** The "Contribute" button's `onPress` handler ONLY calls `haptic.light()`. It does not navigate to a payment screen, call an API, or open a sheet. The entire purpose of the Waqf screen (allowing users to contribute to endowments) is non-functional. Users tap "Contribute" and nothing visible happens.
- **Fix:** Wire the button to a contribution flow: open a BottomSheet with amount input, then call a `waqfApi.contribute(fundId, amount)` endpoint.

### Finding 4: voice-post-create.tsx — Post mutation is a stub (never uploads audio)
- **File:** `apps/mobile/app/(screens)/voice-post-create.tsx`
- **Lines:** 77-88
- **Code:**
```tsx
const postMutation = useMutation({
  mutationFn: async () => {
    // In production: upload audio to R2, then call API
    // For now, simulate success
    return { success: true };
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['voice-posts'] });
    haptic.success();
    router.back();
  },
});
```
- **Problem:** The "Post Voice" button simulates success without doing anything. The recorded audio URI (`recordingUri`) is never uploaded to R2 or sent to the API. The user records audio, taps "Post Voice", sees success feedback, but nothing is actually posted. This is a complete stub disguised with success UX.
- **Fix:** Implement actual audio upload to R2 (presigned URL PUT), then call a backend endpoint to create the voice post with the uploaded URL.

### Finding 5: watch-party.tsx — All API calls lack authentication, join button is a no-op
- **File:** `apps/mobile/app/(screens)/watch-party.tsx`
- **Lines:** 32-56, 66, 90-95
- **Code (fetch without auth):**
```tsx
// Line 35: No auth header
const res = await fetch(`${API_BASE}/watch-parties`);

// Line 42-43: No auth header on POST
const res = await fetch(`${API_BASE}/watch-parties`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ videoId: newVideoId, title: newTitle }),
});
```
- **Code (join button):**
```tsx
// Line 66: Card onPress only fires haptic
<Pressable style={styles.partyCard} onPress={() => haptic.light()}>

// Line 90-95: "Join Party" button has no onPress handler
<Pressable style={styles.joinBtn}>
  <LinearGradient colors={[colors.emerald, '#0D9B63']} style={styles.joinBtnGradient}>
    <Icon name="play" size="sm" color="#FFF" />
    <Text style={styles.joinBtnText}>Join Party</Text>
  </LinearGradient>
</Pressable>
```
- **Problem (3-in-1):**
  1. All fetch calls use raw `fetch()` without any Authorization header. Any authenticated endpoint will 401.
  2. The "Join Party" button has NO `onPress` handler at all. Users tap it and literally nothing happens.
  3. The entire card `onPress` only fires `haptic.light()` -- no navigation to a watch party room.
- **Fix:** Use the authenticated `api` wrapper from `@/services/api`. Add proper join/navigate handlers.

### Finding 6: fatwa-qa.tsx — POST request has no auth header (always 401)
- **File:** `apps/mobile/app/(screens)/fatwa-qa.tsx`
- **Lines:** 57-64
- **Code:**
```tsx
const askMutation = useMutation({
  mutationFn: async () => {
    const res = await fetch(`${API_BASE}/fatwa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, madhab: askMadhab !== 'any' ? askMadhab : undefined }),
    });
    return res.json();
  },
```
- **Problem:** The fatwa question submission uses raw `fetch()` with no `Authorization` header. The backend `/fatwa` POST endpoint requires authentication (ClerkAuthGuard). This will always return 401 Unauthorized. Users write their question, tap "Submit", and it silently fails (the mutation `onSuccess` still fires because `res.json()` resolves even on error responses -- there is no status code check).
- **Fix:** Use the authenticated `api.post()` wrapper, or add proper auth headers. Also add `if (!res.ok) throw new Error(...)` before `res.json()`.

### Finding 7: fatwa-qa.tsx — GET request also has no auth header
- **File:** `apps/mobile/app/(screens)/fatwa-qa.tsx`
- **Lines:** 43-48
- **Code:**
```tsx
queryFn: async ({ pageParam }) => {
  const params = new URLSearchParams();
  if (pageParam) params.set('cursor', pageParam as string);
  if (selectedMadhab !== 'any') params.set('madhab', selectedMadhab);
  const res = await fetch(`${API_BASE}/fatwa?${params}`);
  return res.json();
},
```
- **Problem:** The browse query also uses raw `fetch()` without auth. If the backend requires auth for listing fatwas (likely, since it may show user-specific answered status), this will fail or return incomplete data.
- **Fix:** Use the authenticated API wrapper.

---

## HIGH (Functional Bugs)

### Finding 8: broadcast-channels.tsx — Duplicate Pressable import
- **File:** `apps/mobile/app/(screens)/broadcast-channels.tsx`
- **Lines:** 7 and 13
- **Code:**
```tsx
import {
  // ...
  Pressable,      // Line 7
  // ...
  Pressable,      // Line 13 — DUPLICATE
} from 'react-native';
```
- **Problem:** `Pressable` is imported twice from `react-native`. While this doesn't cause a runtime crash in JavaScript (the second import shadows the first), it's a code quality issue that some bundlers or linters may flag. It indicates copy-paste errors.
- **Fix:** Remove one of the duplicate `Pressable` imports.

### Finding 9: community-posts.tsx — Duplicate Pressable import
- **File:** `apps/mobile/app/(screens)/community-posts.tsx`
- **Lines:** 4 and 5
- **Code:**
```tsx
import {
  View, Text, StyleSheet, Pressable,   // Line 4
  FlatList, TextInput, Alert, KeyboardAvoidingView, Platform, Image as RNImage, ScrollView,
  Pressable,                             // Line 5 — DUPLICATE
} from 'react-native';
```
- **Problem:** Same duplicate Pressable import issue.

### Finding 10: circles.tsx — Duplicate Pressable import
- **File:** `apps/mobile/app/(screens)/circles.tsx`
- **Lines:** 4 and 5
- **Code:**
```tsx
import {
  View, Text, StyleSheet, Pressable,
  FlatList, Alert, TextInput, RefreshControl,
  Pressable,                             // DUPLICATE
} from 'react-native';
```
- **Problem:** Same duplicate Pressable import issue.

### Finding 11: volunteer-board.tsx — Duplicate Pressable import
- **File:** `apps/mobile/app/(screens)/volunteer-board.tsx`
- **Lines:** 8 and 10
- **Code:**
```tsx
import {
  // ...
  Pressable,
  ScrollView,
  Pressable,    // DUPLICATE
} from 'react-native';
```
- **Problem:** Same duplicate Pressable import issue.

### Finding 12: event-detail.tsx — Duplicate Pressable import
- **File:** `apps/mobile/app/(screens)/event-detail.tsx`
- **Lines:** 8 and 10
- **Code:**
```tsx
import {
  // ...
  Pressable,
  Dimensions,
  Pressable,    // DUPLICATE
} from 'react-native';
```
- **Problem:** Same duplicate Pressable import issue.

### Finding 13: community-posts.tsx — RichText receives wrong prop name `text` vs `content`
- **File:** `apps/mobile/app/(screens)/community-posts.tsx`
- **Line:** 99
- **Code:**
```tsx
<RichText text={post.content} style={styles.postContent} />
```
- **Problem:** Actually this is CORRECT. The RichText component accepts a `text` prop (verified in RichText.tsx line 9: `text: string`). This is NOT a bug. However, the CLAUDE.md quick reference says `<RichText content={string} />` which is wrong -- the actual prop is `text`. The documentation is misleading, not the code.
- **Severity:** Info (documentation mismatch, not a code bug)

### Finding 14: waqf.tsx — fetch() call has no auth header
- **File:** `apps/mobile/app/(screens)/waqf.tsx`
- **Lines:** 29
- **Code:**
```tsx
const res = await fetch(`${API_BASE}/waqf?${params}`);
```
- **Problem:** Uses raw `fetch()` without Authorization header. If the Waqf endpoint requires auth, the request will fail silently (no error checking on `res.ok` either).
- **Fix:** Use the authenticated API wrapper from `@/services/api`.

### Finding 15: local-boards.tsx — fetch() call has no auth header
- **File:** `apps/mobile/app/(screens)/local-boards.tsx`
- **Lines:** 32
- **Code:**
```tsx
const res = await fetch(`${API_BASE}/boards?${params}`);
```
- **Problem:** Same raw `fetch()` without auth issue. No `res.ok` check either.

### Finding 16: mentorship.tsx — "Find" tab FlatList has no RefreshControl
- **File:** `apps/mobile/app/(screens)/mentorship.tsx`
- **Lines:** 151-159
- **Code:**
```tsx
<FlatList
  data={people}
  renderItem={renderMentor}
  keyExtractor={(item) => item.id as string}
  contentContainerStyle={styles.list}
  ListEmptyComponent={
    <EmptyState icon="users" title={t('community.findMentor')} subtitle={t('community.findMentorHint')} />
  }
/>
```
- **Problem:** The FlatList on the "Find" tab has no `RefreshControl` and no `refreshControl` prop. Per CLAUDE.md rule #7: "ALL FlatLists must have `<RefreshControl>`". Users cannot pull-to-refresh the search results.
- **Fix:** Add `refreshControl={<RefreshControl refreshing={...} onRefresh={...} tintColor={colors.emerald} />}`.

### Finding 17: broadcast-channels.tsx — loadDiscoverChannels has stale closure over discoverCursor
- **File:** `apps/mobile/app/(screens)/broadcast-channels.tsx`
- **Lines:** 74-91
- **Code:**
```tsx
const loadDiscoverChannels = useCallback(async (refresh = false) => {
  if (discoverLoading && !refresh) return;
  setDiscoverLoading(true);
  setDiscoverError(false);
  try {
    const cursor = refresh ? undefined : discoverCursor ?? undefined;
    const response = await broadcastApi.discover(cursor);
    // ...
  }
}, [discoverCursor, discoverLoading]);  // <-- Stale closure risk
```
- **Problem:** The `useCallback` depends on `discoverCursor` and `discoverLoading`, but these are state values that change. When `handleLoadMore` calls `loadDiscoverChannels()`, the function may have a stale reference to `discoverCursor` from a previous render. This can cause duplicate page fetches or skipped pages during infinite scroll.
- **Fix:** Use `useRef` for cursor tracking, or switch to `useInfiniteQuery` from react-query which handles pagination state properly.

### Finding 18: community-posts.tsx — Media URIs sent as local file paths, never uploaded
- **File:** `apps/mobile/app/(screens)/community-posts.tsx`
- **Lines:** 209-211
- **Code:**
```tsx
createMutation.mutate({
  content: composeText.trim(),
  mediaUrls: selectedMediaList.map(m => m.uri) // In a real app, these would be uploaded URLs
});
```
- **Problem:** The comment says it all: "In a real app, these would be uploaded URLs." The code sends local `file://` URIs directly to the API as `mediaUrls`. The backend expects HTTPS URLs (from R2 upload). The API will either reject these or store broken URIs that other clients can't access.
- **Fix:** Upload media to R2 via presigned URL first, then pass the returned URLs.

### Finding 19: waqf.tsx — No response status checking on fetch
- **File:** `apps/mobile/app/(screens)/waqf.tsx`
- **Lines:** 29-30
- **Code:**
```tsx
const res = await fetch(`${API_BASE}/waqf?${params}`);
return res.json();
```
- **Problem:** No check for `res.ok`. If the server returns a 4xx or 5xx error, `res.json()` will parse the error response body and treat it as valid data. The screen will try to render error JSON as fund cards, likely causing crashes when accessing properties like `goalAmount` on unexpected shapes.
- **Fix:** Add `if (!res.ok) throw new Error('Failed to load waqf funds')` before parsing JSON.

### Finding 20: local-boards.tsx — No response status checking on fetch
- **File:** `apps/mobile/app/(screens)/local-boards.tsx`
- **Lines:** 32-33
- **Code:**
```tsx
const res = await fetch(`${API_BASE}/boards?${params}`);
return res.json();
```
- **Problem:** Same missing `res.ok` check issue as waqf.tsx.

### Finding 21: fatwa-qa.tsx — No response status checking on fetch (both GET and POST)
- **File:** `apps/mobile/app/(screens)/fatwa-qa.tsx`
- **Lines:** 47-48 (GET) and 58-63 (POST)
- **Problem:** Both fetch calls parse JSON without checking `res.ok`. The POST mutation's `onSuccess` will fire even on error responses because the promise resolves regardless of HTTP status.

### Finding 22: watch-party.tsx — No response status checking on fetch (both GET and POST)
- **File:** `apps/mobile/app/(screens)/watch-party.tsx`
- **Lines:** 35-37 (GET) and 42-46 (POST)
- **Problem:** Same missing `res.ok` check. Error responses are treated as data.

### Finding 23: mentorship.tsx — No response status checking on fetch
- **File:** `apps/mobile/app/(screens)/mentorship.tsx`
- **Lines:** 47-50
- **Code:**
```tsx
const res = await fetch(`${API_BASE}/mentorship/me`, {
  headers: { Authorization: `Bearer ${await getToken()}` },
});
return res.json();
```
- **Problem:** No `res.ok` check. Plus the token is always empty (Finding 2), so this always returns a 401 error body parsed as mentorship data.

### Finding 24: broadcast-channels.tsx — handleChannelPress has wrong dependency (navigation instead of router)
- **File:** `apps/mobile/app/(screens)/broadcast-channels.tsx`
- **Lines:** 129-131
- **Code:**
```tsx
const handleChannelPress = useCallback((channel: BroadcastChannelWithSubscription) => {
  router.push(`/(screens)/broadcast/${channel.id}` as never);
}, [navigation]);  // <-- Should be [router], not [navigation]
```
- **Problem:** The dependency array references `navigation` but the function body uses `router`. The function will work due to module-level scope, but the memoization won't update if `router` changes (unlikely in practice, but semantically wrong).

### Finding 25: local-boards.tsx — Board card onPress only fires haptic, no navigation
- **File:** `apps/mobile/app/(screens)/local-boards.tsx`
- **Lines:** 44
- **Code:**
```tsx
<Pressable accessibilityRole="button" style={styles.boardCard} onPress={() => haptic.light()}>
```
- **Problem:** Tapping a local board card only fires a haptic vibration. There is no navigation to a board detail screen, no action to join the board, nothing functional. The board list is display-only with no interactivity beyond haptic feedback.
- **Fix:** Navigate to a board detail screen, e.g., `router.push(\`/(screens)/local-board/${item.id}\`)`.

### Finding 26: mentorship.tsx — Mentor request never actually calls API
- **File:** `apps/mobile/app/(screens)/mentorship.tsx`
- **Lines:** 186-200
- **Code:**
```tsx
<BottomSheet visible={requestSheetOpen} onClose={() => setRequestSheetOpen(false)}>
  {TOPICS.map(topic => (
    <BottomSheetItem
      key={topic.id}
      label={topic.label}
      icon={<Icon name={topic.icon} size="sm" color={colors.emerald} />}
      onPress={() => {
        setSelectedTopic(topic.id);
        setRequestSheetOpen(false);
        haptic.success();
        // Send request — would call API   <-- COMMENT SAYS "WOULD CALL"
      }}
    />
  ))}
</BottomSheet>
```
- **Problem:** The comment says "would call API" but no API call is made. The `selectedTopic` state is set but never used anywhere. Selecting a topic closes the sheet with a success haptic, making the user think a mentorship request was sent, but nothing happened on the backend.
- **Fix:** Actually call a mentorship request API, e.g., `mentorshipApi.requestMentor({ mentorId: selectedMentorId, topic: topic.id })`.

---

## MEDIUM (UX / Quality Issues)

### Finding 27: mentorship.tsx — Hardcoded English strings in tabs
- **File:** `apps/mobile/app/(screens)/mentorship.tsx`
- **Lines:** 133-134
- **Code:**
```tsx
{tab === 'find' ? 'Find a Mentor' : 'My Mentorships'}
```
- **Problem:** Tab labels are hardcoded English strings instead of using `t()` translation function. This breaks i18n for all 7 non-English languages.
- **Fix:** Use `t('community.findMentor')` and `t('community.myMentorships')`.

### Finding 28: mentorship.tsx — Hardcoded English "Mentee" and "Mentor" labels
- **File:** `apps/mobile/app/(screens)/mentorship.tsx`
- **Lines:** 98-99
- **Code:**
```tsx
{isMentor ? 'Mentee' : 'Mentor'}
```
- **Problem:** Badge labels are hardcoded English.
- **Fix:** Use `t('community.mentee')` and `t('community.mentor')`.

### Finding 29: mentorship.tsx — TOPICS array labels are hardcoded English
- **File:** `apps/mobile/app/(screens)/mentorship.tsx`
- **Lines:** 23-29
- **Code:**
```tsx
const TOPICS: { id: string; label: string; icon: IconName }[] = [
  { id: 'new_muslim', label: 'New Muslim Guidance', icon: 'heart' },
  { id: 'quran', label: 'Quran Studies', icon: 'globe' },
  { id: 'arabic', label: 'Arabic Language', icon: 'edit' },
  { id: 'fiqh', label: 'Fiqh & Jurisprudence', icon: 'layers' },
  { id: 'general', label: 'General Mentorship', icon: 'users' },
];
```
- **Problem:** All topic labels are hardcoded English. Must use i18n keys.

### Finding 30: waqf.tsx — Hardcoded English strings throughout
- **File:** `apps/mobile/app/(screens)/waqf.tsx`
- **Lines:** 82, 103-104
- **Code:**
```tsx
// Line 82
<Text style={styles.contributeBtnText}>Contribute</Text>

// Lines 103-104
<Text style={styles.infoText}>
  Waqf is an Islamic endowment — a permanent charitable fund where the principal is preserved and only the returns are used for good causes.
</Text>
```
- **Problem:** "Contribute" button label and the entire Waqf info description are hardcoded English. Breaks i18n.
- **Fix:** Use `t('community.contribute')` and `t('community.waqfDescription')`.

### Finding 31: fatwa-qa.tsx — Hardcoded English strings in tabs and labels
- **File:** `apps/mobile/app/(screens)/fatwa-qa.tsx`
- **Lines:** 94, 129, 175, 191, 194, 207
- **Code:**
```tsx
// Line 94: Status text
{isAnswered ? 'Answered' : 'Pending'}

// Line 129: Tab labels
{tab === 'browse' ? 'Browse' : 'Ask'}

// Line 175: Form label
<Text style={styles.askLabel}>Your Question</Text>

// Line 191: Madhab selector label
<Text style={[styles.askLabel, { marginTop: spacing.xl }]}>Preferred Madhab</Text>

// Line 207: Submit button
<Text style={styles.submitText}>Submit Question</Text>
```
- **Problem:** Multiple hardcoded English strings throughout the screen.

### Finding 32: watch-party.tsx — Hardcoded English strings
- **File:** `apps/mobile/app/(screens)/watch-party.tsx`
- **Lines:** 74, 82, 86, 93, 132, 154
- **Code:**
```tsx
// Line 74
<Text style={styles.partyTitle}>{item.title as string}</Text>

// Line 82 — "Hosted by" is hardcoded
<Text style={styles.hostName}>Hosted by {host.displayName as string}</Text>

// Line 86
<Text style={styles.viewerCount}>{item.viewerCount as number} watching</Text>

// Line 93
<Text style={styles.joinBtnText}>Join Party</Text>

// Line 132
<Text style={styles.createTitle}>Start Watch Party</Text>

// Line 154
<Text style={styles.createBtnText}>Start</Text>
```
- **Problem:** "Hosted by", "watching", "Join Party", "Start Watch Party", "Start" are all hardcoded English.

### Finding 33: voice-post-create.tsx — Hardcoded English strings
- **File:** `apps/mobile/app/(screens)/voice-post-create.tsx`
- **Lines:** 106, 144-145, 160
- **Code:**
```tsx
// Line 106
<Text style={styles.maxDuration}>Max {formatTime(MAX_DURATION)}</Text>

// Line 144-145
<Text style={styles.recordHint}>
  {isRecording ? 'Tap to stop' : recordingUri ? 'Tap to re-record' : 'Tap to record'}
</Text>

// Line 160
<Text style={styles.postText}>Post Voice</Text>
```
- **Problem:** "Max", "Tap to stop", "Tap to re-record", "Tap to record", "Post Voice" are all hardcoded English.

### Finding 34: local-boards.tsx — Hardcoded English "members" and "posts" text
- **File:** `apps/mobile/app/(screens)/local-boards.tsx`
- **Lines:** 64-65
- **Code:**
```tsx
<Text style={styles.statText}>{item.membersCount as number} members</Text>
// ...
<Text style={styles.statText}>{item.postsCount as number} posts</Text>
```
- **Problem:** "members" and "posts" are hardcoded English.

### Finding 35: volunteer-board.tsx — CATEGORIES array labels are hardcoded English
- **File:** `apps/mobile/app/(screens)/volunteer-board.tsx`
- **Lines:** 29-36
- **Code:**
```tsx
const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'disaster_relief', label: 'Disaster Relief' },
  { key: 'mosque', label: 'Mosque' },
  { key: 'education', label: 'Education' },
  { key: 'food_bank', label: 'Food Bank' },
  { key: 'cleanup', label: 'Cleanup' },
] as const;
```
- **Problem:** All category labels are hardcoded English. Must use i18n keys or move inside component and use `t()`.

### Finding 36: fatwa-qa.tsx — MADHABS array labels are hardcoded English
- **File:** `apps/mobile/app/(screens)/fatwa-qa.tsx`
- **Lines:** 21-27
- **Code:**
```tsx
const MADHABS = [
  { id: 'any', label: 'Any Madhab' },
  { id: 'hanafi', label: 'Hanafi' },
  { id: 'maliki', label: 'Maliki' },
  { id: 'shafii', label: "Shafi'i" },
  { id: 'hanbali', label: 'Hanbali' },
];
```
- **Problem:** Labels are hardcoded English. While Madhab names may be transliterated the same in many languages, "Any Madhab" should definitely be translated.

### Finding 37: event-detail.tsx — Uses non-existent font family aliases
- **File:** `apps/mobile/app/(screens)/event-detail.tsx`
- **Lines:** 491, 499-500, 513-514, 517-518, 547, 564, etc.
- **Code:**
```tsx
fontFamily: fonts.semibold,   // Line 491 — exists, maps to DMSans_500Medium
fontFamily: fonts.bold,       // Line 500 — exists, maps to DMSans_700Bold
fontFamily: fonts.regular,    // Line 514 — exists, maps to DMSans_400Regular
fontFamily: fonts.medium,     // Line 518 — exists, maps to DMSans_500Medium
```
- **Problem:** Actually verified -- these aliases DO exist in the theme (lines 90-93 of theme/index.ts). This is NOT a bug. However, `fonts.semibold` maps to `DMSans_500Medium` (500 weight), not 600 weight. This is a design decision, not a bug per se, but `semibold` = 500 may be unexpected.
- **Severity:** Info (naming may be misleading)

### Finding 38: broadcast-channels.tsx — subscribersCount can go negative
- **File:** `apps/mobile/app/(screens)/broadcast-channels.tsx`
- **Lines:** 138
- **Code:**
```tsx
setDiscoverChannels(prev => prev.map(c => c.id === channel.id ? { ...c, isSubscribed: false, subscribersCount: c.subscribersCount - 1 } : c));
```
- **Problem:** When unsubscribing, `subscribersCount` is decremented by 1 without clamping. If the count is already 0 (e.g., due to stale data), it will display as -1.
- **Fix:** Use `Math.max(0, c.subscribersCount - 1)`.

### Finding 39: community-posts.tsx — Like count can go negative
- **File:** `apps/mobile/app/(screens)/community-posts.tsx`
- **Lines:** 50-51
- **Code:**
```tsx
setLikeCount(prev => newLiked ? prev + 1 : prev - 1);
```
- **Problem:** Like count is decremented without clamping. If `likesCount` starts at 0 and the user unlikes (edge case: stale data), it goes to -1.
- **Fix:** Use `Math.max(0, prev - 1)` for the unlike case.

### Finding 40: broadcast-channels.tsx — Initial loading shows EmptyState instead of skeletons
- **File:** `apps/mobile/app/(screens)/broadcast-channels.tsx`
- **Lines:** 311-312
- **Code:**
```tsx
ListEmptyComponent={loading ? null : renderEmptyState}
ListFooterComponent={loading && filteredData.length > 0 ? renderSkeleton : null}
```
- **Problem:** On initial load (if `useEffect` were added), `loading` is true so `ListEmptyComponent` returns `null`. BUT `ListFooterComponent` only shows skeletons when `filteredData.length > 0`. On first load when there's no data yet, the screen shows absolutely nothing -- no skeletons, no empty state, just a blank screen.
- **Fix:** Show skeletons as `ListEmptyComponent` when loading, or use a dedicated loading state outside the FlatList.

### Finding 41: mentorship.tsx — searchResults uses searchApi.search which searches everything, not just mentors
- **File:** `apps/mobile/app/(screens)/mentorship.tsx`
- **Lines:** 55-59
- **Code:**
```tsx
const searchResults = useQuery({
  queryKey: ['mentor-search', searchQuery],
  queryFn: () => searchApi.search(searchQuery),
  enabled: searchQuery.length >= 2 && activeTab === 'find',
});
```
- **Problem:** `searchApi.search()` is a general search endpoint that returns posts, users, etc. The code then extracts `people` from the response on line 61. But there's no filter for mentors specifically -- this returns ALL users matching the search query. There's no concept of mentor registration, expertise verification, or mentor flagging. Any user shows up as a potential "mentor".
- **Fix:** Either add a mentorship-specific search endpoint, or at minimum indicate that these are user search results, not verified mentors.

### Finding 42: mentorship.tsx — selectedMentorId state is set but never read
- **File:** `apps/mobile/app/(screens)/mentorship.tsx`
- **Lines:** 42, 70
- **Code:**
```tsx
const [selectedMentorId, setSelectedMentorId] = useState<string | null>(null);
// ...
setSelectedMentorId(item.id as string);
```
- **Problem:** `selectedMentorId` is set when a mentor is tapped, but it is never read anywhere in the component. The topic selection sheet has no access to which mentor was selected, so even if the API call were implemented, it wouldn't know which mentor to request.
- **Fix:** Include `selectedMentorId` in the API call when submitting a mentor request.

### Finding 43: event-detail.tsx — RSVP status not initialized from server data
- **File:** `apps/mobile/app/(screens)/event-detail.tsx`
- **Lines:** 66
- **Code:**
```tsx
const [rsvpStatus, setRsvpStatus] = useState<RsvpStatus>(null);
```
- **Problem:** The RSVP status always starts as `null`, even if the user has already RSVP'd to this event. The event data likely includes the user's current RSVP status, but it's never used to initialize the state. Users see no indication of their previous RSVP and can re-submit, potentially creating duplicate records.
- **Fix:** Initialize from `event.myRsvpStatus` or similar field once event data loads.

### Finding 44: event-detail.tsx — "Add to Calendar" and "Directions" buttons are no-ops
- **File:** `apps/mobile/app/(screens)/event-detail.tsx`
- **Lines:** 266-269, 289-291
- **Code:**
```tsx
// Line 266-269: "Add to Calendar" — no onPress handler
<Pressable style={styles.addToCalendar}>
  <Icon name="calendar" size="xs" color={colors.emerald} />
  <Text style={styles.addText}>{t('events.add')}</Text>
</Pressable>

// Line 289-291: "Directions" — no onPress handler
<Pressable style={styles.directionsButton}>
  <Icon name="map-pin" size="xs" color={colors.text.primary} />
</Pressable>
```
- **Problem:** Both buttons have no `onPress` handler. "Add to Calendar" should use expo-calendar or deep-link to the device calendar. "Directions" should open maps. Both are completely non-functional.

### Finding 45: event-detail.tsx — "See All Attendees" and "Share Event" buttons are no-ops
- **File:** `apps/mobile/app/(screens)/event-detail.tsx`
- **Lines:** 408-411, 423-431
- **Code:**
```tsx
// Line 408: See all — no onPress handler
<Pressable style={styles.seeAllButton}>

// Line 423: Share event — no onPress handler
<Pressable style={styles.shareEventButton}>
```
- **Problem:** Neither button has an `onPress` handler. They render but do nothing on tap.

### Finding 46: event-detail.tsx — "Read More" button is a no-op
- **File:** `apps/mobile/app/(screens)/event-detail.tsx`
- **Lines:** 304-305
- **Code:**
```tsx
<Pressable>
  <Text style={styles.readMore}>{t('common.readMore')}</Text>
</Pressable>
```
- **Problem:** The "Read More" Pressable has no `onPress`. Should expand the description to show full text.

### Finding 47: event-detail.tsx — Date formatting ignores user's locale
- **File:** `apps/mobile/app/(screens)/event-detail.tsx`
- **Lines:** 42-48, 51-57
- **Code:**
```tsx
function formatEventDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { ... });
}

function formatEventTime(startStr: string, endStr?: string): string {
  const start = new Date(startStr);
  const startTime = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
```
- **Problem:** Both functions hardcode `'en-US'` locale. For Arabic, Turkish, Urdu, etc. users, dates and times should be formatted in their locale. The app supports 8 languages but event dates are always English-formatted.
- **Fix:** Use the current locale from `useTranslation()` or `Intl.DateTimeFormat` with the user's language.

### Finding 48: event-detail.tsx — uses `colors.emeraldDark` and `colors.goldLight` which are top-level theme exports, not under `colors`
- **File:** `apps/mobile/app/(screens)/event-detail.tsx`
- **Lines:** 335, 344
- **Code:**
```tsx
colors={[colors.emerald, colors.emeraldDark]}   // Line 335
colors={[colors.gold, colors.goldLight]}         // Line 344
```
- **Problem:** Verified in theme/index.ts -- `emeraldDark` is on line 8 and `goldLight` is on line 10, which ARE part of the `colors` object export. So these references are valid. NOT a bug.
- **Severity:** Info (false alarm)

### Finding 49: voice-post-create.tsx — stopRecording() called from inside setDuration setState callback
- **File:** `apps/mobile/app/(screens)/voice-post-create.tsx`
- **Lines:** 48-56
- **Code:**
```tsx
intervalRef.current = setInterval(() => {
  setDuration(d => {
    if (d >= MAX_DURATION) {
      stopRecording();  // <-- Called during setState updater
      return d;
    }
    return d + 1;
  });
}, 1000);
```
- **Problem:** `stopRecording()` is called from inside a React `setState` updater function. This is an anti-pattern -- calling async functions and state updates from within a setState callback can cause unpredictable behavior. The `stopRecording()` function itself calls `setIsRecording(false)` and `clearInterval`, which are side effects that should not be triggered from a state updater.
- **Fix:** Move the max-duration check outside the setState callback. Use a ref for duration tracking or check in a separate `useEffect`.

### Finding 50: voice-post-create.tsx — Waveform uses Math.random() during render
- **File:** `apps/mobile/app/(screens)/voice-post-create.tsx`
- **Lines:** 111-114
- **Code:**
```tsx
{Array.from({ length: 30 }).map((_, i) => {
  const height = isRecording
    ? 10 + Math.random() * 40
    : recordingUri ? 10 + Math.sin(i * 0.5) * 20 + 20 : 10;
```
- **Problem:** Using `Math.random()` during render means the waveform bars get new random heights on every re-render, causing flickering. This is not a real waveform visualization -- it's random noise that changes whenever any state updates (like the duration counter updating every second).
- **Fix:** Use actual audio amplitude data from the recording, or at least memoize the random values so they don't flicker.

### Finding 51: circles.tsx — Emojis used as text for circle icons
- **File:** `apps/mobile/app/(screens)/circles.tsx`
- **Lines:** 22
- **Code:**
```tsx
const EMOJIS = ['⭕', '⭐', '🌙', '🤝', '💚', '🕌', '📿', '🏠', '💼', '🎓'];
```
- **Problem:** Per CLAUDE.md rule: "NEVER use text emoji for icons". These emojis are used as visual icons for circles. However, this is arguably a different use case -- they represent user-selected custom emoji for their circle, not UI chrome icons. This is borderline: the circle icon is a user choice, not a UI element. Documenting for awareness but may be acceptable.
- **Severity:** Low (may be intentional UX)

### Finding 52: community-posts.tsx — FadeInUp animation with index-based delay on every item
- **File:** `apps/mobile/app/(screens)/community-posts.tsx`
- **Lines:** 64
- **Code:**
```tsx
<Animated.View entering={FadeInUp.delay(index * 50).duration(400)}>
```
- **Problem:** Every post item gets an entering animation with an index-based delay. For infinite-scroll lists, items loaded on page 2+ will have delays of 500ms+ (index 10+). This is also present in broadcast-channels.tsx (line 151), mentorship.tsx (line 64), waqf.tsx (line 46), local-boards.tsx (line 43), volunteer-board.tsx (line 162), and watch-party.tsx (line 65). The delay accumulates on paginated loads, making later pages appear sluggish.
- **Fix:** Use modular index (e.g., `index % pageSize * 50`) or limit the delay to the first batch only.

---

## Summary by Screen

| Screen | Critical | High | Medium | Total |
|--------|----------|------|--------|-------|
| broadcast-channels.tsx | 1 (no useEffect) | 3 | 2 | 6 |
| community-posts.tsx | 0 | 2 | 2 | 4 |
| mentorship.tsx | 1 (getToken stub) | 2 | 4 | 7 |
| waqf.tsx | 1 (contribute no-op) | 2 | 1 | 4 |
| local-boards.tsx | 0 | 2 | 1 | 3 |
| circles.tsx | 0 | 1 | 1 | 2 |
| fatwa-qa.tsx | 2 (no auth) | 1 | 2 | 5 |
| volunteer-board.tsx | 0 | 1 | 1 | 2 |
| watch-party.tsx | 1 (no auth + no-ops) | 1 | 1 | 3 |
| voice-post-create.tsx | 1 (post stub) | 0 | 2 | 3 |
| event-detail.tsx | 0 | 1 | 5 | 6 |
| **CROSS-CUTTING** | | | 5 | 5 |
| **TOTAL** | **7** | **16** | **27** | **52** |

## Pattern Summary

### Raw fetch() without auth (6 screens)
The following screens bypass the authenticated API wrapper and use raw `fetch()`:
- `mentorship.tsx` (line 47-50) — always 401 due to empty token
- `waqf.tsx` (line 29) — no auth header
- `local-boards.tsx` (line 32) — no auth header
- `fatwa-qa.tsx` (lines 47, 58) — no auth on GET or POST
- `watch-party.tsx` (lines 35, 42) — no auth on GET or POST

These screens should all use the `api` wrapper from `@/services/api.ts` which automatically attaches the Clerk JWT.

### No-op buttons (4 screens)
- `waqf.tsx` — "Contribute" button (haptic only)
- `watch-party.tsx` — "Join Party" button (no handler)
- `local-boards.tsx` — Board card tap (haptic only)
- `event-detail.tsx` — 4 buttons with no handlers (Add to Calendar, Directions, See All, Share)

### Hardcoded English strings (8 screens)
All screens except `circles.tsx`, `broadcast-channels.tsx`, and `community-posts.tsx` have hardcoded English strings that should use `t()`.

### Duplicate Pressable imports (5 screens)
`broadcast-channels.tsx`, `community-posts.tsx`, `circles.tsx`, `volunteer-board.tsx`, `event-detail.tsx`
