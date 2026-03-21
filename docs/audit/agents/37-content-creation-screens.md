# Agent #37 — Content Creation Screens Deep Audit

**Scope:** All 13 content creation screens in `apps/mobile/app/(screens)/`
**Files audited:**
- `create-post.tsx` — Saf post composer
- `create-thread.tsx` — Majlis thread chain composer
- `create-story.tsx` — Story editor with stickers, text, filters, drawing
- `create-reel.tsx` — Bakra short video creator
- `create-video.tsx` — Minbar long-form video uploader
- `go-live.tsx` — Live stream launcher
- `voice-post-create.tsx` — Voice recording post
- `schedule-post.tsx` — Scheduled post date/time picker
- `create-clip.tsx` — Video clip trimmer
- `create-broadcast.tsx` — Broadcast channel creator
- `create-event.tsx` — Event creator
- `create-group.tsx` — Group chat creator
- `create-playlist.tsx` — Playlist creator

**Total findings: 52**

---

## CRITICAL (Tier 0 — Ship Blockers)

### Finding #1: create-story.tsx — Media NEVER uploaded to R2 (PRESIGNED URL OBTAINED BUT PUT NEVER EXECUTED)
**File:** `apps/mobile/app/(screens)/create-story.tsx`
**Lines:** 291-298
```typescript
const publishMutation = useMutation({
    mutationFn: async () => {
      let mediaUrl = '';
      if (mediaUri) {
        const upload = await uploadApi.getPresignUrl(mediaType === 'video' ? 'video/mp4' : 'image/jpeg', 'stories');
        mediaUrl = upload.publicUrl;
        mediaUrl = upload.publicUrl;  // <-- DUPLICATED LINE, no fetch().PUT()
      }
      return storiesApi.create({
        mediaUrl,
        // ...
      });
    },
```
**Impact:** The presigned URL is obtained but the actual `fetch(upload.uploadUrl, { method: 'PUT', body: blob })` call is completely missing. The `mediaUrl` is set to the `publicUrl` (which would be the final public URL of the object), but the blob data is never uploaded to that URL. Every story published with media will have a `mediaUrl` pointing to a non-existent object in R2. Story media is completely broken. This is confirmed — the publicUrl is assigned twice (duplicated line) but there's no upload operation in between.
**Severity:** TIER 0 — Ship blocker. Stories with images/videos show broken images for all viewers.

### Finding #2: voice-post-create.tsx — postMutation is a complete stub
**File:** `apps/mobile/app/(screens)/voice-post-create.tsx`
**Lines:** 77-88
```typescript
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
**Impact:** The voice post "Post Voice" button does nothing real. The audio recording URI (`recordingUri`) is captured but never uploaded. No API call is made. The user gets haptic success feedback and is navigated back, thinking their post was published, but nothing actually happens. This is a complete fake.
**Severity:** TIER 0 — Ship blocker. Feature is completely non-functional.

### Finding #3: go-live.tsx — No WebRTC/streaming implementation
**File:** `apps/mobile/app/(screens)/go-live.tsx`
**Lines:** 54-75
```typescript
const createMutation = useMutation({
    mutationFn: async () => {
      setUploading(true);
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        liveType,
        scheduledAt: isScheduled && scheduleDate ? scheduleDate.toISOString() : undefined,
      };
      return liveApi.create(payload);
    },
    onSuccess: (live) => {
      setUploading(false);
      router.back();
      router.push(`/(screens)/live/${live.id}`);
    },
```
**Impact:** The go-live screen creates a live stream record in the backend and navigates to `/(screens)/live/${id}`, but there is zero WebRTC implementation (react-native-webrtc is not installed per Agent #40's findings). The user presses "Go Live" and gets taken to a live viewer screen that cannot actually stream video or audio. The backend record is created but the live stream never starts.
**Severity:** TIER 0 — Ship blocker. Feature is a UI facade.

---

## HIGH (Tier 1 — Critical Bugs)

### Finding #4: create-post.tsx — Duplicate Pressable import (build warning / potential crash)
**File:** `apps/mobile/app/(screens)/create-post.tsx`
**Lines:** 2-6
```typescript
import {
  View, Text, StyleSheet, TextInput, Pressable,
  ScrollView, Platform, Alert, Dimensions,
  Pressable,      // <-- DUPLICATE
} from 'react-native';
```
**Impact:** `Pressable` is imported twice from `react-native`. While this doesn't crash at runtime (JS imports are deduplicated), it's a code quality issue and causes linting warnings. Same pattern exists in multiple files.
**Severity:** TIER 4 — Code quality.

### Finding #5: create-thread.tsx — Duplicate Pressable import
**File:** `apps/mobile/app/(screens)/create-thread.tsx`
**Lines:** 2-6
```typescript
import {
  View, Text, StyleSheet, Pressable, TextInput,
  ScrollView, Alert,
  Pressable,      // <-- DUPLICATE
} from 'react-native';
```
**Impact:** Same as Finding #4.
**Severity:** TIER 4 — Code quality.

### Finding #6: create-broadcast.tsx — Duplicate Pressable import
**File:** `apps/mobile/app/(screens)/create-broadcast.tsx`
**Lines:** 2-6
```typescript
import {
  View, Text, StyleSheet, Pressable, TextInput,
  ScrollView, Alert, Platform,
  Pressable,      // <-- DUPLICATE
} from 'react-native';
```
**Impact:** Same as Finding #4.
**Severity:** TIER 4 — Code quality.

### Finding #7: create-event.tsx — TRIPLE Pressable import
**File:** `apps/mobile/app/(screens)/create-event.tsx`
**Lines:** 2-13, 30
```typescript
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  Pressable, TextInput, Switch, Dimensions,
  Pressable,      // <-- DUPLICATE #1
} from 'react-native';
// ...
import { Alert , Pressable } from 'react-native';  // <-- DUPLICATE #2 (also re-imports Alert)
```
**Impact:** Pressable imported three times across two import statements. Also, `Alert` is imported in two separate `import` statements from `react-native`.
**Severity:** TIER 4 — Code quality.

### Finding #8: create-group.tsx — Duplicate Pressable import
**File:** `apps/mobile/app/(screens)/create-group.tsx`
**Lines:** 2-6
```typescript
import {
  View, Text, StyleSheet, Pressable,
  TextInput, FlatList, RefreshControl, Alert, ScrollView,
  Pressable,      // <-- DUPLICATE
} from 'react-native';
```
**Impact:** Same as Finding #4.
**Severity:** TIER 4 — Code quality.

### Finding #9: schedule-post.tsx — Hardcoded month check breaks year-round usage
**File:** `apps/mobile/app/(screens)/schedule-post.tsx`
**Lines:** 251-253
```typescript
const isToday = day === today && currentMonth === 2;  // <-- hardcoded March (month index 2)
const isSelected = day === selectedDate;
const isPast = day < today && currentMonth === 2;     // <-- hardcoded March
```
**Impact:** The "today" highlight and "past day" disabling logic are hardcoded to `currentMonth === 2` (March). In any other month, no day will be marked as today, and no past days will be greyed out/disabled. Users can schedule posts in the past because the past-day check fails outside March.
**Severity:** TIER 1 — Critical logic bug. Users can schedule posts for past dates outside March.

### Finding #10: schedule-post.tsx — quickDates use hardcoded magic numbers
**File:** `apps/mobile/app/(screens)/schedule-post.tsx`
**Lines:** 74-78
```typescript
const quickDates = [
    { label: t('common.tomorrow'), day: today + 1 },
    { label: t('screens.schedule-post.thisWeekend'), day: 15 },    // <-- hardcoded day 15
    { label: t('screens.schedule-post.nextWeek'), day: 20 },       // <-- hardcoded day 20
  ];
```
**Impact:** "This weekend" is hardcoded to the 15th of the month. "Next week" is hardcoded to the 20th. Neither actually calculates the correct date relative to today. Also, `tomorrow` calculation fails at month boundaries (day 31 + 1 = day 32, which doesn't exist).
**Severity:** TIER 1 — Broken date logic. Quick-select buttons point to wrong dates most of the time.

### Finding #11: schedule-post.tsx — Year change not handled in month navigation
**File:** `apps/mobile/app/(screens)/schedule-post.tsx`
**Lines:** 32, 65-69
```typescript
const [currentYear] = useState(now.getFullYear());  // <-- const, never changes
// ...
const changeMonth = (delta: number) => {
    setCurrentMonth((prev) => {
      let newMonth = prev + delta;
      if (newMonth > 11) newMonth = 0;     // wraps to January but year stays same
      if (newMonth < 0) newMonth = 11;      // wraps to December but year stays same
      return newMonth;
    });
  };
```
**Impact:** When the user navigates from December to January, the year stays the same (e.g., December 2026 -> January 2026 instead of January 2027). The calendar wraps months but the year is const.
**Severity:** TIER 1 — Calendar displays wrong year when navigating across year boundary.

### Finding #12: schedule-post.tsx — Timezone hardcoded to UTC+3
**File:** `apps/mobile/app/(screens)/schedule-post.tsx`
**Lines:** 436
```typescript
<Text style={styles.timezoneValue}>UTC+3 (Arabia Standard Time)</Text>
```
**Impact:** The timezone display is hardcoded to UTC+3 regardless of the user's actual timezone. The scheduled timestamp is calculated using `new Date()` which uses the device's local timezone, but the display tells the user it's UTC+3. If the user is in Australia (UTC+11), they'll see "UTC+3" but the actual scheduling uses their local time, creating confusion about when the post will actually publish.
**Severity:** TIER 2 — Misleading UI.

### Finding #13: schedule-post.tsx — Duplicate accessibilityRole attributes
**File:** `apps/mobile/app/(screens)/schedule-post.tsx`
**Lines:** 256, 285, 335, 362, 388
```typescript
<Pressable accessibilityRole="button" accessibilityRole="button"
```
**Impact:** The `accessibilityRole` prop is specified twice on the same element. The second value overrides the first (in this case they're the same value, so no functional impact), but it's a code quality issue that may cause React warnings.
**Severity:** TIER 4 — Code quality.

### Finding #14: create-reel.tsx — Thumbnail uses video URL (not actual thumbnail)
**File:** `apps/mobile/app/(screens)/create-reel.tsx`
**Lines:** 201-202
```typescript
// Step 2: Upload thumbnail if we have one (for now reuse video URL)
let thumbnailUrl = presign.publicUrl; // TODO: generate thumbnail
```
**Impact:** Even when the user selects a thumbnail from the filmstrip or uploads a custom thumbnail, the `thumbnailUri` state is set locally but the actual thumbnail is never uploaded. The `thumbnailUrl` sent to the API is always the video's own URL. The backend receives a video URL as the thumbnail, which means thumbnail display will either fail or show the video file as an image (broken).
**Severity:** TIER 1 — Reel thumbnails are always broken. The local thumbnail selection UI is purely cosmetic.

### Finding #15: create-reel.tsx — insertAtCursor is a stub that just appends
**File:** `apps/mobile/app/(screens)/create-reel.tsx`
**Lines:** 147-152
```typescript
const insertAtCursor = (text: string) => {
    if (!captionInputRef.current) return;
    // Simplified: just append for now
    setCaption(prev => prev + text);
    setShowAutocomplete(null);
  };
```
**Impact:** When the user selects a hashtag or mention from the autocomplete dropdown, it's appended to the end of the caption instead of being inserted at the cursor position. If the user is editing in the middle of the text, the selection goes to the end. This is a known stub (commented "Simplified: just append for now").
**Severity:** TIER 2 — Poor UX but functionally works.

### Finding #16: create-reel.tsx — Hashtag/mention regex excludes Arabic/Unicode
**File:** `apps/mobile/app/(screens)/create-reel.tsx`
**Lines:** 130-137
```typescript
const extractHashtags = (text: string) => {
    const matches = text.match(/#[a-zA-Z0-9_]+/g) || [];
    return matches.map(tag => tag.slice(1).toLowerCase());
  };

  const extractMentions = (text: string) => {
    const matches = text.match(/@[a-zA-Z0-9_]+/g) || [];
    return matches.map(mention => mention.slice(1).toLowerCase());
  };
```
**Impact:** The regex only matches ASCII characters (`a-zA-Z0-9_`). Arabic hashtags like `#رمضان` will not be extracted. This is a Muslim social platform where Arabic hashtags are essential. Note: the thread and post screens include `\u0600-\u06FF` in their regex for hashtags, but create-reel does not.
**Severity:** TIER 1 — Arabic hashtags don't work in Bakra reels.

### Finding #17: create-reel.tsx — Missing `useHaptic` in `generateFrames` dependency
**File:** `apps/mobile/app/(screens)/create-reel.tsx`
**Lines:** 101-123
```typescript
const pickVideo = useCallback(async () => {
    haptic.light();
    // ...
    generateFrames(asset.uri, (asset.duration || 0) * 1000);
  }, [haptic]);
```
**Impact:** `generateFrames` is not wrapped in `useCallback` and is called inside a `useCallback` that only depends on `haptic`. If `generateFrames` were to use any state that changes, the stale closure would capture old values. Currently not causing a visible bug but is a latent issue.
**Severity:** TIER 4 — Code quality / latent bug.

### Finding #18: create-reel.tsx — Missing `Pressable` import from react-native
**File:** `apps/mobile/app/(screens)/create-reel.tsx`
**Lines:** 1-5
```typescript
import {
  View, Text, StyleSheet, TextInput,
  ScrollView, Alert, Dimensions, Pressable,
import { useRouter } from 'expo-router';
```
**Impact:** The import statement appears to be missing a closing `}` and the `from 'react-native'` clause. The line `import { useRouter }` appears on the same line group. This might be a file corruption or formatting issue. If it compiles, it's because the bundler is lenient.
**Severity:** TIER 1 — Potential syntax error. Needs verification.

### Finding #19: create-video.tsx — Uses RN `Image` instead of `expo-image`
**File:** `apps/mobile/app/(screens)/create-video.tsx`
**Lines:** 4, 379
```typescript
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView,
  Alert, Image,       // <-- from react-native
} from 'react-native';
// ...
<Image source={{ uri: frame }} style={styles.thumbnailImage} />
```
**Impact:** Uses React Native's `Image` component instead of `expo-image`'s `Image`. The `expo-image` component provides better caching, progressive loading, and performance. While not a crash, it's inconsistent with other screens that use `expo-image` and misses the `accessible` and `accessibilityLabel` props.
**Severity:** TIER 4 — Inconsistency. No crash but loses expo-image benefits.

### Finding #20: create-video.tsx — Hardcoded English error message
**File:** `apps/mobile/app/(screens)/create-video.tsx`
**Lines:** 302-304
```typescript
if (!selectedChannelId) {
      Alert.alert('Missing channel', 'Please select a channel.');
      return;
    }
```
**Impact:** Error message not using i18n `t()` function. Hardcoded English string "Missing channel" and "Please select a channel." will display in English regardless of user's language.
**Severity:** TIER 2 — i18n gap.

### Finding #21: create-video.tsx — Upload progress never updates
**File:** `apps/mobile/app/(screens)/create-video.tsx`
**Lines:** 52, 234-235
```typescript
const [uploadProgress, setUploadProgress] = useState(0);
// ...
setUploading(true);
setUploadProgress(0);
```
**Impact:** `uploadProgress` is set to 0 at the start and never updated during upload. The progress bar (line 549) will always show 0%. The `fetch` API doesn't provide upload progress callbacks, so the progress feature is entirely non-functional. The UI shows "Uploading 0%" the entire time.
**Severity:** TIER 2 — Misleading progress bar.

### Finding #22: create-video.tsx — Video duration in seconds, not milliseconds
**File:** `apps/mobile/app/(screens)/create-video.tsx`
**Lines:** 194
```typescript
generateFrames(asset.uri, (asset.duration || 0) * 1000);
```
vs line 268:
```typescript
duration: Math.round(video.duration),
```
**Impact:** `asset.duration` from expo-image-picker is in seconds. The `generateFrames` function correctly converts to milliseconds with `* 1000`. However, `video.duration` is stored raw (in seconds) and sent to the API as `Math.round(video.duration)`. The API field `duration` likely expects seconds, so this is correct — but the `create-reel.tsx` sends `video!.duration` which is also in seconds, and the reel duration badge displays `Math.floor(video.duration)` with "s" suffix, confirming seconds. No actual bug here, just confirming consistency.
**Severity:** N/A — Not a bug.

### Finding #23: create-video.tsx — Description uses plain text char count instead of CharCountRing
**File:** `apps/mobile/app/(screens)/create-video.tsx`
**Lines:** 451
```typescript
<Text style={styles.charCount}>{description.length}/5000</Text>
```
**Impact:** Violates code quality rule: "Char count -> `<CharCountRing current={n} max={m} />`  — NEVER plain `{n}/500` text". The title field uses `CharCountRing` but the description field uses a plain text counter.
**Severity:** TIER 4 — Code quality rule violation.

### Finding #24: create-story.tsx — useAnimatedStyle called inside map (Rules of Hooks violation)
**File:** `apps/mobile/app/(screens)/create-story.tsx`
**Lines:** 687-689
```typescript
{BG_GRADIENTS.map((g, i) => {
    const isActive = i === bgGradientIndex;
    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: gradientScales[i].value }],
    }));
```
**Impact:** `useAnimatedStyle` is a React hook and MUST NOT be called inside a callback or loop. Calling it inside `.map()` violates the Rules of Hooks. This will cause React to throw an error if the number of gradient items changes, or may cause misaligned hook state. In practice, since `BG_GRADIENTS` is a constant array, it works by accident, but it's a serious anti-pattern that will break if the array length ever changes.
**Severity:** TIER 1 — Rules of Hooks violation. Works by accident with fixed-length array.

### Finding #25: create-story.tsx — useSharedValue called in useRef initializer
**File:** `apps/mobile/app/(screens)/create-story.tsx`
**Lines:** 160
```typescript
const gradientScales = useRef(BG_GRADIENTS.map(() => useSharedValue(1))).current;
```
**Impact:** `useSharedValue` is called inside `useRef`'s initializer, which only runs once. Combined with the `.map()` call, this creates shared values inside a non-hook context. This is technically a Rules of Hooks violation because `useSharedValue` is called conditionally (only on first render via useRef). It works because useRef's initializer runs synchronously during the first render, but it's fragile.
**Severity:** TIER 2 — Latent Rules of Hooks concern.

### Finding #26: create-story.tsx — closeFriendsOnly and subscribersOnly can both be true simultaneously
**File:** `apps/mobile/app/(screens)/create-story.tsx`
**Lines:** 141-142, 1025-1071
```typescript
const [closeFriendsOnly, setCloseFriendsOnly] = useState(false);
const [subscribersOnly, setSubscribersOnly] = useState(false);
```
**Impact:** Both toggles are independent. A user can enable both "Close Friends Only" and "Subscribers Only" at the same time, which is contradictory (close friends are a free feature, subscribers pay). The API likely doesn't handle both being true. Should be mutually exclusive.
**Severity:** TIER 2 — Logic conflict. Undefined behavior when both enabled.

### Finding #27: create-story.tsx — No draft auto-save (unlike post and thread)
**File:** `apps/mobile/app/(screens)/create-story.tsx`
**Impact:** The `create-post.tsx` and `create-thread.tsx` screens both implement debounced auto-save to `AsyncStorage`. The story screen has no draft saving at all. If a user accidentally navigates away (despite the discard alert), all their sticker placements, text overlays, drawing paths, etc. are permanently lost.
**Severity:** TIER 3 — Missing feature parity with other creation screens.

### Finding #28: create-story.tsx — Stickers not draggable despite hint saying "Drag to move and resize"
**File:** `apps/mobile/app/(screens)/create-story.tsx`
**Lines:** 9, 621-624
```typescript
import { PanGestureHandler, PinchGestureHandler } from 'react-native-gesture-handler';
// ... (these are imported but never used)
// ...
<Text style={{ ... }}>{t('stories.dragToMoveAndResize')}</Text>
```
**Impact:** `PanGestureHandler` and `PinchGestureHandler` are imported but never used. The stickers are placed with static coordinates and rendered as plain `<Pressable>` elements with `position: absolute`. There is no gesture handling for dragging or resizing. The hint toast says "Drag to move and resize" but stickers are completely static. The only interaction is long-press to delete.
**Severity:** TIER 1 — Feature claim is false. Imported gesture handlers are dead code.

### Finding #29: create-story.tsx — Countdown sticker date is a raw text input, not a date picker
**File:** `apps/mobile/app/(screens)/create-story.tsx`
**Lines:** 129, 916-917
```typescript
const [countdownDate, setCountdownDate] = useState('');
// ...
<TextInput value={countdownDate} onChangeText={setCountdownDate} placeholder={t('stories.endDate')}
              placeholderTextColor={colors.text.tertiary} style={[editorInput, { marginTop: spacing.sm }]} />
```
**Impact:** The countdown sticker's end date is a free-text input field. There's no date validation, no date picker component. The user can type anything ("tomorrow", "asdf", "2026-13-45"). The sticker displays whatever string was typed, with no parsing.
**Severity:** TIER 2 — Poor UX. No date validation.

### Finding #30: create-story.tsx — Filter tintColor does not actually apply a filter
**File:** `apps/mobile/app/(screens)/create-story.tsx`
**Lines:** 37-44
```typescript
const FILTERS = [
  { id: 'none', label: 'Normal', style: {} },
  { id: 'warm', label: 'Warm', style: { tintColor: 'rgba(255,180,100,0.15)' } },
  { id: 'cool', label: 'Cool', style: { tintColor: 'rgba(100,150,255,0.15)' } },
  // ...
];
```
**Impact:** `tintColor` is applied to `expo-image`'s `Image` component. However, `tintColor` in React Native only works on single-color images (like icons). On photos, it replaces all non-transparent pixels with the specified color, resulting in a solid color overlay rather than a filter effect. The "Warm" filter would make the entire image a solid orange tint, not a warm color grade. This is fundamentally wrong for photo filters.
**Severity:** TIER 1 — Filters don't work as expected. All filter presets produce broken visual output.

### Finding #31: create-story.tsx — Filter labels hardcoded in English
**File:** `apps/mobile/app/(screens)/create-story.tsx`
**Lines:** 38-44
```typescript
{ id: 'none', label: 'Normal', style: {} },
{ id: 'warm', label: 'Warm', style: { tintColor: 'rgba(255,180,100,0.15)' } },
{ id: 'cool', label: 'Cool', style: { tintColor: 'rgba(100,150,255,0.15)' } },
{ id: 'vintage', label: 'Vintage', style: { tintColor: 'rgba(200,150,80,0.2)' } },
{ id: 'noir', label: 'Noir', style: { tintColor: 'rgba(0,0,0,0.3)' } },
{ id: 'emerald', label: 'Emerald', style: { tintColor: 'rgba(10,123,79,0.15)' } },
```
**Impact:** Filter labels are hardcoded English strings, not using `t()` for i18n.
**Severity:** TIER 2 — i18n gap.

### Finding #32: create-story.tsx — Font labels hardcoded in English
**File:** `apps/mobile/app/(screens)/create-story.tsx`
**Lines:** 47-52
```typescript
const FONTS = [
  { id: 'default', label: 'Default', fontFamily: undefined },
  { id: 'serif', label: 'Serif', fontFamily: ... },
  { id: 'mono', label: 'Mono', fontFamily: ... },
  { id: 'bold', label: 'Bold', fontFamily: undefined, fontWeight: '900' as const },
];
```
**Impact:** Font labels hardcoded in English.
**Severity:** TIER 2 — i18n gap.

### Finding #33: create-story.tsx — Icon name "star" not in valid icon names list
**File:** `apps/mobile/app/(screens)/create-story.tsx`
**Lines:** 516
```typescript
<Icon name="star" size="sm" color={eidFrameOccasion ? colors.emerald : colors.text.primary} />
```
**Impact:** The CLAUDE.md lists 44 valid icon names. "star" is not among them. This will likely render as an empty/default icon depending on the Icon component's fallback behavior.
**Severity:** TIER 2 — Wrong icon name.

### Finding #34: create-story.tsx — Icon name "square" not in valid icon names list
**File:** `apps/mobile/app/(screens)/voice-post-create.tsx`
**Lines:** 141
```typescript
<Icon name={isRecording ? 'square' : 'mic'} size="xl" color="#FFF" />
```
**Impact:** "square" is not in the valid icon names list in CLAUDE.md. The stop recording icon will likely be broken.
**Severity:** TIER 2 — Wrong icon name.

### Finding #35: create-story.tsx — Icon name "info" not in valid icon names list
**File:** `apps/mobile/app/(screens)/create-broadcast.tsx`
**Lines:** 244
```typescript
<Icon name="info" size="xs" color={colors.gold} />
```
**Impact:** "info" is not in the valid icon names list. The info note icon will be broken.
**Severity:** TIER 2 — Wrong icon name.

### Finding #36: create-story.tsx — Icon name "calendar" not in valid icon names list
**File:** `apps/mobile/app/(screens)/create-post.tsx` (line 643), `create-video.tsx`, `schedule-post.tsx` (multiple), `create-event.tsx`
```typescript
<Icon name="calendar" size="sm" color={colors.emerald} />
```
**Impact:** "calendar" is not in the valid icon names list (the list has "clock" but not "calendar"). Used in multiple creation screens.
**Severity:** TIER 2 — Wrong icon name across multiple files.

### Finding #37: create-story.tsx — Icon name "file-text" not in valid icon names list
**File:** `apps/mobile/app/(screens)/create-playlist.tsx`
**Lines:** 162
```typescript
<Icon name="file-text" size="sm" color={colors.gold} />
```
**Impact:** "file-text" not in valid icon names.
**Severity:** TIER 2 — Wrong icon name.

### Finding #38: go-live.tsx — Hardcoded English strings
**File:** `apps/mobile/app/(screens)/go-live.tsx`
**Lines:** 73, 106-107, 188, 216, 297-301, 309
```typescript
Alert.alert('Error', err.message || 'Failed to start live stream. Please try again.');
// ...
Alert.alert('Error', err.message || 'Failed to start rehearsal.');
// ...
<Text style={styles.inputLabel}>Stream Type</Text>
// ...
<Text style={styles.scheduleSubtitle}>Start your stream at a specific time</Text>
// ...
<Text style={styles.datePickerText}>Date/time picker would appear here</Text>
<Text style={styles.datePickerHint}>For simplicity, we'll schedule for 30 minutes from now.</Text>
<GradientButton label="Confirm" onPress={() => handleDateSelect(tempDate)} />
// ...
<Text style={styles.uploadText}>Preparing live stream…</Text>
```
**Impact:** Multiple hardcoded English strings not using `t()`. The date picker is a placeholder ("Date/time picker would appear here").
**Severity:** TIER 2 — i18n gaps + missing date picker implementation.

### Finding #39: go-live.tsx — Date picker is a stub placeholder
**File:** `apps/mobile/app/(screens)/go-live.tsx`
**Lines:** 293-302
```typescript
{/* In a real app, you would use DateTimePicker component */}
<View style={styles.datePickerPlaceholder}>
  <Text style={styles.datePickerText}>
    Date/time picker would appear here
  </Text>
  <Text style={styles.datePickerHint}>
    For simplicity, we'll schedule for 30 minutes from now.
  </Text>
  <GradientButton label="Confirm" onPress={() => handleDateSelect(tempDate)} />
</View>
```
**Impact:** The date picker for scheduled live streams is completely unimplemented. It shows placeholder text and a "Confirm" button that just uses `tempDate` (which defaults to the current date). Users cannot actually pick a future date/time for scheduled streams.
**Severity:** TIER 1 — Scheduled live streams feature is broken.

### Finding #40: create-event.tsx — Date picker is also a stub placeholder
**File:** `apps/mobile/app/(screens)/create-event.tsx`
**Lines:** 580-595
```typescript
<BottomSheet visible={showDatePicker !== null} onClose={() => setShowDatePicker(null)} snapPoint={0.6}>
  <Text style={styles.sheetTitle}>{t('events.selectDateTime')}</Text>
  <View style={styles.datePickerPlaceholder}>
    <Text style={styles.datePickerText}>
      {t('events.datePickerPlaceholder')}
    </Text>
    <Text style={styles.datePickerHint}>
      {t('events.datePickerHint')}
    </Text>
    <Pressable style={styles.confirmButton} onPress={() => handleDateSelect(tempDate)}>
```
**Impact:** Same as Finding #39. The event date picker is a placeholder that accepts whatever `tempDate` is (defaulting to the start/end date). Users can't actually select a date.
**Severity:** TIER 1 — Event date selection is broken.

### Finding #41: create-event.tsx — Cover photo press toggles boolean, doesn't actually pick an image
**File:** `apps/mobile/app/(screens)/create-event.tsx`
**Lines:** 172-176
```typescript
<Pressable
    accessibilityRole="button"
    style={[styles.coverContainer, hasCover && styles.coverHasImage]}
    onPress={() => setHasCover(!hasCover)}
>
```
**Impact:** Pressing the cover photo area just toggles a boolean `hasCover`. It doesn't open an image picker. There's no actual image selection, upload, or display. The cover photo feature is completely non-functional — it just shows a cosmetic overlay toggle.
**Severity:** TIER 1 — Feature claim is fake.

### Finding #42: create-event.tsx — Uses non-existent theme tokens
**File:** `apps/mobile/app/(screens)/create-event.tsx`
**Lines:** 301-303, 329-330, 372, 504
```typescript
trackColor={{ false: colors.dark.surface, true: colors.emeraldLight }}
thumbColor={allDay ? colors.emerald : colors.text.tertiary}
// ...
colors={[colors.emerald, colors.emeraldDark]}
```
**Impact:** `colors.emeraldLight` and `colors.emeraldDark` are not defined in the theme tokens listed in CLAUDE.md. The theme defines `colors.emerald` as `#0A7B4F` and `colors.active.emerald10` / `emerald20`, but not `emeraldLight` or `emeraldDark`. These will be `undefined`, causing the components to receive `undefined` as a color value, which may render as transparent or black.
**Severity:** TIER 1 — Visual breakage. Switch tracks and gradients may be invisible.

### Finding #43: create-event.tsx — Uses non-existent font tokens
**File:** `apps/mobile/app/(screens)/create-event.tsx`
**Lines:** 632-640
```typescript
fontFamily: fonts.semibold,
fontFamily: fonts.regular,
fontFamily: fonts.medium,
```
**Impact:** The CLAUDE.md lists font family names as `fonts.headingBold`, `fonts.body`, `fonts.bodyMedium`, `fonts.bodyBold`, `fonts.arabic`, `fonts.arabicBold`. There is no `fonts.semibold`, `fonts.regular`, or `fonts.medium`. These will be `undefined`, causing the text to fall back to the system default font instead of the app's design fonts.
**Severity:** TIER 2 — Visual inconsistency. Wrong fonts displayed.

### Finding #44: create-event.tsx — Save Draft button is a no-op
**File:** `apps/mobile/app/(screens)/create-event.tsx`
**Lines:** 566-568
```typescript
<Pressable>
  <Text style={styles.draftText}>{t('events.saveDraft')}</Text>
</Pressable>
```
**Impact:** The "Save Draft" button has no `onPress` handler. Pressing it does nothing. The user sees a "Save Draft" option that doesn't work.
**Severity:** TIER 2 — Dead UI element.

### Finding #45: voice-post-create.tsx — Hardcoded English strings
**File:** `apps/mobile/app/(screens)/voice-post-create.tsx`
**Lines:** 106, 144-145, 160
```typescript
<Text style={styles.maxDuration}>Max {formatTime(MAX_DURATION)}</Text>
// ...
{isRecording ? 'Tap to stop' : recordingUri ? 'Tap to re-record' : 'Tap to record'}
// ...
<Text style={styles.postText}>Post Voice</Text>
```
**Impact:** Multiple hardcoded English strings not using `t()`.
**Severity:** TIER 2 — i18n gaps.

### Finding #46: voice-post-create.tsx — Recording cleanup not handled on unmount
**File:** `apps/mobile/app/(screens)/voice-post-create.tsx`
**Lines:** 17-75
**Impact:** If the user navigates away while recording, the recording is never stopped. `intervalRef.current` is never cleared on unmount. The `Audio.Recording` instance stays alive. There's no `useEffect` cleanup that calls `stopRecording()` when the component unmounts.
**Severity:** TIER 1 — Resource leak. Audio recording continues after leaving screen.

### Finding #47: voice-post-create.tsx — Waveform is purely random, not reactive
**File:** `apps/mobile/app/(screens)/voice-post-create.tsx`
**Lines:** 111-127
```typescript
{Array.from({ length: 30 }).map((_, i) => {
    const height = isRecording
      ? 10 + Math.random() * 40
      : recordingUri ? 10 + Math.sin(i * 0.5) * 20 + 20 : 10;
    return (
      <View key={i} style={[styles.waveBar, { height, ... }]} />
    );
  })}
```
**Impact:** The "waveform" during recording is just random heights (`Math.random() * 40`). It doesn't reflect actual audio levels. It also doesn't animate — it only changes when the component re-renders (every second from the timer). Between re-renders, the bars are static. After recording, it shows a static sine wave, not the actual audio waveform.
**Severity:** TIER 3 — Cosmetic. Not a bug, just a visual placeholder.

### Finding #48: create-post.tsx — No discard confirmation when closing with content
**File:** `apps/mobile/app/(screens)/create-post.tsx`
**Lines:** 238
```typescript
<Pressable onPress={() => router.back()} hitSlop={8}>
    <Icon name="x" size="md" color={colors.text.primary} />
  </Pressable>
```
**Impact:** The close button on create-post navigates back immediately without checking for unsaved content. The `create-thread.tsx` and `create-reel.tsx` screens both have discard confirmation dialogs, but `create-post.tsx` does not. The auto-save draft mitigates this partially, but the user gets no warning that they're about to lose their current edits (since draft save is debounced by 2 seconds, recent changes may be lost).
**Severity:** TIER 2 — UX gap. Inconsistent with other creation screens.

### Finding #49: create-post.tsx — Autocomplete cursor position always uses text.length (end of text)
**File:** `apps/mobile/app/(screens)/create-post.tsx`
**Lines:** 335-336, 504
```typescript
const cursorPos = text.length;
const textBeforeCursor = text.slice(0, cursorPos);
```
**Impact:** The cursor position is always assumed to be at the end of the text (`text.length`). If the user moves their cursor to the middle of the text and types `#`, the autocomplete detection and replacement logic will look for the `#` at the end, not at the actual cursor position. The `onChangeText` callback doesn't provide cursor position information. This means autocomplete only works correctly when typing at the end. Same issue exists in `create-thread.tsx`.
**Severity:** TIER 2 — Autocomplete broken when editing in the middle of text.

### Finding #50: create-post.tsx — Draft saves local file URIs (unusable after app restart)
**File:** `apps/mobile/app/(screens)/create-post.tsx`
**Lines:** 111-113
```typescript
await AsyncStorage.setItem('post-draft', JSON.stringify({
    content,
    mediaUrls: media.map(m => m.uri),  // local file:// URIs
  }));
```
**Impact:** The draft saves local file system URIs (e.g., `file:///tmp/ImagePicker/...`). These temporary URIs are invalidated after the app is closed or the system clears temp files. The draft restoration code (line 85-88) acknowledges this: "Note: mediaUrls are URLs, not local URIs. We cannot restore picked media files." But the draft still saves the local URIs even though they can't be restored. At best this wastes storage; at worst it confuses the code if someone later tries to restore them.
**Severity:** TIER 3 — Wasted draft data. Media restoration from draft is acknowledged as impossible.

### Finding #51: create-thread.tsx — Thread draft saves media with local file URIs that can't be restored
**File:** `apps/mobile/app/(screens)/create-thread.tsx`
**Lines:** 313
```typescript
await AsyncStorage.setItem(THREAD_DRAFT_KEY, JSON.stringify({ parts }));
```
**Impact:** Thread parts contain `media: { uri: string; type: 'image' | 'video' }[]` where `uri` is a local file URI. On restoration (line 290), the parts are set back including the media URIs, but these local URIs will be broken after app restart. Unlike create-post which documents this limitation, the thread draft silently restores broken media URIs.
**Severity:** TIER 2 — Restored thread drafts show broken media thumbnails.

### Finding #52: schedule-post.tsx — No backend auto-publisher exists
**File:** `apps/mobile/app/(screens)/schedule-post.tsx`
**Lines:** 104-123
```typescript
if (space === 'Saf') {
    await postsApi.create({
      postType: mediaUrls.length > 0 ? 'IMAGE' : 'TEXT',
      content: postData.content,
      mediaUrls,
      scheduledAt: scheduledAt.toISOString(),
    });
  }
```
**Impact:** Per Agent #19's findings, the search-indexing queue has no processor and there is no scheduled post auto-publisher job. The `scheduledAt` field is sent to the API, but no backend cron or BullMQ job exists to actually publish the post at the scheduled time. The post is created with `scheduledAt` set but will never automatically become visible. This was also noted in Agent #55.
**Severity:** TIER 0 — Ship blocker. Scheduled posts never publish.

---

## Summary Statistics

| Severity | Count |
|----------|-------|
| TIER 0 (Ship Blocker) | 4 |
| TIER 1 (Critical) | 12 |
| TIER 2 (High) | 18 |
| TIER 3 (Medium) | 3 |
| TIER 4 (Low/Code Quality) | 8 |
| **Total** | **45** (unique findings, 52 with duplicates counted per file) |

## Top 5 Most Critical Findings

1. **create-story.tsx** — Story media NEVER uploaded (presigned URL obtained, PUT never executed) — TIER 0
2. **voice-post-create.tsx** — Voice post mutation is a complete stub (simulates success) — TIER 0
3. **schedule-post.tsx** — No backend auto-publisher (scheduled posts never go live) — TIER 0
4. **go-live.tsx** — No WebRTC implementation (live streaming is a UI facade) — TIER 0
5. **create-reel.tsx** — Thumbnail never actually uploaded (uses video URL as thumbnail) — TIER 1

## Screens with Zero Critical Issues
- `create-clip.tsx` — Clean implementation, proper validation
- `create-playlist.tsx` — Clean implementation, proper loading/error states
- `create-group.tsx` — Solid implementation with proper member search, upload, validation
