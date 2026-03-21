# Audit Agent #40 — Call + Live + Audio Room Screens

**Scope:** All mobile screens related to voice/video calls, live streaming, audio rooms, Quran rooms, watch parties, and voice recording/posting.
**Files Audited (10 screens):**
1. `apps/mobile/app/(screens)/call/[id].tsx` — Active call screen (550 lines)
2. `apps/mobile/app/(screens)/call-history.tsx` — Call history list (288 lines)
3. `apps/mobile/app/(screens)/go-live.tsx` — Go live creation screen (421 lines)
4. `apps/mobile/app/(screens)/live/[id].tsx` — Live stream viewer (1,197 lines)
5. `apps/mobile/app/(screens)/audio-room.tsx` — Audio room (842 lines)
6. `apps/mobile/app/(screens)/quran-room.tsx` — Quran room (481 lines)
7. `apps/mobile/app/(screens)/schedule-live.tsx` — Schedule live stream (491 lines)
8. `apps/mobile/app/(screens)/watch-party.tsx` — Watch party (189 lines)
9. `apps/mobile/app/(screens)/voice-recorder.tsx` — Voice recorder (307 lines)
10. `apps/mobile/app/(screens)/voice-post-create.tsx` — Voice post create (189 lines)

**Audit Date:** 2026-03-21

---

## CRITICAL (P0) — Total: 5

### P0-01: ZERO WebRTC Implementation — Calls Are Complete Facades
**File:** `apps/mobile/app/(screens)/call/[id].tsx`
**Lines:** 1-550 (entire file)
**Severity:** P0 — Feature completely non-functional
**Evidence:**
- `react-native-webrtc` is NOT installed (`package.json` contains no webrtc, livekit, agora, twilio-video, vonage, or stream-io/video dependency)
- No `RTCPeerConnection` created anywhere
- No `RTCSessionDescription` exchange (SDP offer/answer)
- No `RTCIceCandidate` handling
- No `getUserMedia()` or `mediaDevices` calls
- No local/remote `MediaStream` rendering
- The "mute" toggle (line 161: `const toggleMute = () => setIsMuted(!isMuted)`) just flips a boolean — it does NOT actually mute any audio track
- The "speaker" toggle (line 162: `const toggleSpeaker = () => setIsSpeaker(!isSpeaker)`) just flips a boolean — no audio routing occurs
- The "flip camera" toggle (line 163: `const toggleCamera = () => setIsFrontCamera(!isFrontCamera)`) just flips a boolean — no camera hardware interaction
- The "video preview" section (lines 277-287) shows a static gradient with a video icon and text label — NO actual camera preview or remote video stream
- ICE servers are fetched (lines 74-79) but the comment on lines 81-82 says `// new RTCPeerConnection({ iceServers: iceConfig?.iceServers ?? [] })` — this is literally a TODO comment, never executed
- Socket connection (lines 109-136) uses `auth: { callId: id }` — **no JWT token** passed, meaning the socket is unauthenticated (compare with `quran-room.tsx` line 69 which correctly uses `auth: { token }`)
- Bottom line: tapping "Answer" or "End Call" sends an HTTP request to update call status in the database, but no actual audio/video data ever flows between peers

**Impact:** Voice and video calls are 100% non-functional. Users see a beautiful UI with avatar, pulsing rings, and control buttons, but ZERO audio/video is transmitted. This is the #1 most misleading feature in the app.

### P0-02: ZERO WebRTC in Live Streaming — Video Player Shows Pre-Recorded URLs Only
**File:** `apps/mobile/app/(screens)/live/[id].tsx`
**Lines:** 462-473
**Severity:** P0 — Live streaming is a facade
**Code:**
```tsx
{live.liveType === 'VIDEO' && live.videoUrl && (
  <Video
    ref={videoRef}
    source={{ uri: live.videoUrl }}
    style={styles.videoPlayer}
    resizeMode={ResizeMode.CONTAIN}
    useNativeControls
    shouldPlay
    isLooping={false}
  />
)}
```
**Evidence:**
- The "live stream" viewer uses `expo-av` `<Video>` component pointed at a `videoUrl` — this is a pre-recorded video player, NOT a live stream
- No RTMP ingest, no HLS/DASH adaptive streaming, no WebSocket-based live video
- No camera capture for the broadcaster — "Go Live" just creates a database record
- The audio space UI (lines 476-505) shows animated bars but plays no actual audio
- The chat system (lines 628-707) shows hardcoded sample messages ("Sarah: This is amazing!", "Ahmed: Great stream today!") — NOT real-time chat messages from an API or socket
- `liveApi.sendChat()` is called (line 204) but the chat UI never fetches/displays actual messages from the backend
- Floating reactions (lines 122-130) are purely local — they are NOT broadcast to other viewers

**Impact:** "Going live" creates a database entry. Viewers see either a pre-recorded video or animated audio bars. No real audio/video is ever streamed.

### P0-03: Audio Room Has Zero Audio — Pure UI Facade
**File:** `apps/mobile/app/(screens)/audio-room.tsx`
**Lines:** 1-842 (entire file)
**Severity:** P0 — Feature completely non-functional
**Evidence:**
- No WebRTC, no audio streaming SDK, no `expo-av` recording/playback
- The "mic toggle" (lines 172-179) calls `audioRoomsApi.toggleMute(room.id)` — this updates a database field but does NOT mute/unmute any audio track because there is no audio track
- The "hand raise" (lines 182-189) updates a database field only
- The "speaking" indicators (line 150: `isSpeaking: p.isSpeaking ?? false`) come from the server, but the comment says "Server pushes speaking state via socket" — there is no socket connection in this screen at all. Data is fetched via HTTP polling every 10 seconds (lines 108-113)
- The "speakers" section shows avatars with green rings when `isSpeaking` is true, but no audio is ever transmitted or received
- The "leave" action (lines 192-199) sends an HTTP DELETE but there is no audio session to terminate
- The `pulseAnim` (lines 66-77) gives a visual impression of a "live" room but it's purely cosmetic

**Impact:** Users can "join" an audio room, "raise their hand", "toggle mute", and see "speakers" — but zero audio flows. It's a Clubhouse-like UI with no backend audio infrastructure.

### P0-04: Watch Party Bypasses Auth — Raw Fetch Without Authorization Headers
**File:** `apps/mobile/app/(screens)/watch-party.tsx`
**Lines:** 34-56
**Severity:** P0 — Security bypass
**Code:**
```tsx
const partiesQuery = useQuery({
  queryKey: ['watch-parties'],
  queryFn: async () => {
    const res = await fetch(`${API_BASE}/watch-parties`);
    return res.json();
  },
});

const createMutation = useMutation({
  mutationFn: async () => {
    const res = await fetch(`${API_BASE}/watch-parties`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId: newVideoId, title: newTitle }),
    });
    return res.json();
  },
  // ...
});
```
**Evidence:**
- Uses raw `fetch()` instead of the authenticated `api` wrapper used everywhere else in the app
- No `Authorization: Bearer <token>` header is sent
- Both GET and POST requests are completely unauthenticated
- The `api` service (imported in every other screen) automatically attaches Clerk JWT — this screen bypasses it entirely
- This will either fail with 401 if the backend requires auth (most likely), or if the endpoint somehow works without auth, it allows unauthenticated users to create watch parties

**Impact:** Watch party feature is either broken (401 errors) or has a security hole (unauthenticated access).

### P0-05: Voice Post Create Has Fake Upload — Returns Hardcoded Success
**File:** `apps/mobile/app/(screens)/voice-post-create.tsx`
**Lines:** 77-88
**Severity:** P0 — Feature does not actually post anything
**Code:**
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
**Evidence:**
- The mutation function literally returns `{ success: true }` without uploading anything
- Comment explicitly says "For now, simulate success"
- The recorded audio URI (from expo-av) is never uploaded to R2 or any backend
- No API call is made at all
- User records audio, taps "Post Voice", gets success haptic, navigates back — but nothing was ever created on the server

**Impact:** Voice posts appear to succeed but nothing is actually posted. Users lose their recordings.

---

## HIGH (P1) — Total: 7

### P1-01: Duplicate `Pressable` Import — Compilation Error
**File:** `apps/mobile/app/(screens)/call/[id].tsx`
**Lines:** 3-5
**Severity:** P1 — Build error (may cause runtime crash depending on bundler behavior)
**Code:**
```tsx
import {
  View, Text, StyleSheet, Pressable,
  Alert, Dimensions,
  Pressable,
} from 'react-native';
```
**Evidence:**
- `Pressable` is imported twice in the same destructured import statement
- This is a syntax/semantic error — duplicate named import
- Metro bundler may silently ignore this or it may cause a build failure depending on strict mode settings

**Also occurs in:** `apps/mobile/app/(screens)/live/[id].tsx` lines 3-6 (same duplicate `Pressable` import)

### P1-02: Call Screen Socket Missing JWT Authentication
**File:** `apps/mobile/app/(screens)/call/[id].tsx`
**Lines:** 109-113
**Severity:** P1 — Security vulnerability
**Code:**
```tsx
const socket = io(SOCKET_URL, {
  transports: ['websocket'],
  auth: { callId: id },
});
```
**Evidence:**
- Socket connection passes only `callId` — no JWT token
- The chat gateway (`src/gateways/chat.gateway.ts`) expects `auth: { token }` with a Clerk JWT
- Compare with `quran-room.tsx` line 69 which correctly does: `auth: { token }` after calling `getToken()`
- Without a JWT, the socket will either:
  a) Be rejected by the gateway (call events never arrive), or
  b) If gateway doesn't validate, allow anyone to listen to call events for any call ID

**Impact:** Call signaling events (accepted, ended, ringing, missed) will never be received, making the call UI even more broken than it already is.

### P1-03: Go-Live Date Picker Is a Placeholder — Not Functional
**File:** `apps/mobile/app/(screens)/go-live.tsx`
**Lines:** 291-303
**Severity:** P1 — Feature partially broken
**Code:**
```tsx
<BottomSheet visible={showDatePicker} onClose={() => setShowDatePicker(false)} snapPoint={0.6}>
  <Text style={styles.sheetTitle}>{t('live.scheduleTime')}</Text>
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
</BottomSheet>
```
**Evidence:**
- Comment literally says "In a real app, you would use DateTimePicker component"
- User sees placeholder text "Date/time picker would appear here"
- The date always defaults to 30 minutes from now — user cannot actually pick a different time
- `tempDate` is initialized on line 52 but never updated by user interaction
- Contrast with `schedule-live.tsx` which has a proper custom day/hour/minute picker

### P1-04: Go-Live Hardcoded English Strings
**File:** `apps/mobile/app/(screens)/go-live.tsx`
**Lines:** 72-73, 106-107, 188, 216, 296, 299, 301, 309
**Severity:** P1 — i18n violation
**Code snippets:**
```tsx
// Line 72-73
Alert.alert('Error', err.message || 'Failed to start live stream. Please try again.');

// Line 106-107
Alert.alert('Error', err.message || 'Failed to start rehearsal.');

// Line 188
<Text style={styles.inputLabel}>Stream Type</Text>

// Line 216
<Text style={styles.scheduleSubtitle}>Start your stream at a specific time</Text>

// Line 296
<Text style={styles.datePickerText}>Date/time picker would appear here</Text>

// Line 299
<Text style={styles.datePickerHint}>For simplicity, we'll schedule for 30 minutes from now.</Text>

// Line 301
<GradientButton label="Confirm" onPress={() => handleDateSelect(tempDate)} />

// Line 309
<Text style={styles.uploadText}>Preparing live stream…</Text>
```
**Evidence:**
- 8+ hardcoded English strings that should use `t()` translation function
- The file imports `useTranslation` and uses `t()` for some strings but not these
- Would display English to Arabic, Turkish, etc. users

### P1-05: Audio Room Hardcoded English Strings
**File:** `apps/mobile/app/(screens)/audio-room.tsx`
**Lines:** 122, 169, 399, 432, 459, 519
**Severity:** P1 — i18n violation
**Code snippets:**
```tsx
// Line 122 - formatTimeAgo returns hardcoded English
if (!dateString) return 'Just now';
if (minutes < 1) return 'Just now';
if (minutes < 60) return `${minutes}m ago`;
if (hours < 24) return `${hours}h ago`;
return `${days}d ago`;

// Line 169
raisedAgo: 'Just now', // TODO: compute from handRaisedAt if available

// Line 399
<Text style={styles.moreText}>+{moreListenerCount} more</Text>

// Line 432
<Text style={styles.raisedHandTime}>Raised {hand.raisedAgo}</Text>

// Line 459
You are a {isSpeaker ? 'speaker' : 'listener'}

// Line 519
<Text style={styles.endRoomText}>End Room</Text>
```

### P1-06: Voice Post Create Hardcoded English Strings
**File:** `apps/mobile/app/(screens)/voice-post-create.tsx`
**Lines:** 106, 145, 160
**Severity:** P1 — i18n violation
**Code:**
```tsx
// Line 106
<Text style={styles.maxDuration}>Max {formatTime(MAX_DURATION)}</Text>

// Line 145
{isRecording ? 'Tap to stop' : recordingUri ? 'Tap to re-record' : 'Tap to record'}

// Line 160
<Text style={styles.postText}>Post Voice</Text>
```

### P1-07: Watch Party Hardcoded English Strings
**File:** `apps/mobile/app/(screens)/watch-party.tsx`
**Lines:** 72, 81, 93, 132
**Severity:** P1 — i18n violation
**Code:**
```tsx
// Line 72
<Text style={styles.liveText}>LIVE</Text>

// Line 81
<Text style={styles.hostName}>Hosted by {host.displayName as string}</Text>

// Line 93
<Text style={styles.joinBtnText}>Join Party</Text>

// Line 132
<Text style={styles.createTitle}>Start Watch Party</Text>
```

---

## MEDIUM (P2) — Total: 12

### P2-01: Live Viewer Chat Uses Hardcoded Sample Messages Instead of Real Data
**File:** `apps/mobile/app/(screens)/live/[id].tsx`
**Lines:** 628-667
**Severity:** P2 — Feature facade
**Evidence:**
- Chat section shows hardcoded messages from "Sarah" and "Ahmed" with static text
- `sendChatMutation` sends a real API call but the chat UI never renders actual chat messages from the server
- No `useQuery` or socket listener for fetching/receiving chat messages
- All chat is one-directional — user sends, but never sees any messages (only the hardcoded samples)

### P2-02: Live Viewer `Badge` Import Unused
**File:** `apps/mobile/app/(screens)/live/[id].tsx`
**Line:** 29
**Severity:** P2 — Dead import
**Code:**
```tsx
import { Badge } from '@/components/ui/Badge';
```
**Evidence:** `Badge` component is imported but never used in any JSX in the file. All badge-like elements are custom `View` + `LinearGradient` combinations.

### P2-03: Live Viewer Emojis Used as Icons in Participant Roles
**File:** `apps/mobile/app/(screens)/live/[id].tsx`
**Lines:** 325-326, 330
**Severity:** P2 — Violates MANDATORY RULE: "NEVER use text emoji for icons"
**Code:**
```tsx
<Text style={styles.raisedHandEmoji}>✋</Text>

// Line 330
{isHost ? `👑 ${t('screens.live.host')}` : isSpeaker ? `🎤 ${t('screens.live.speaker')}` : `👤 ${t('screens.live.listener')}`}
```
**Evidence:**
- Uses emoji characters (✋, 👑, 🎤, 👤) as icons
- Should use `<Icon>` component per MANDATORY RULE #2: "NEVER use text emoji for icons — Always `<Icon name="..." />`"

### P2-04: Call Screen `Dimensions` Imported But Not Used
**File:** `apps/mobile/app/(screens)/call/[id].tsx`
**Line:** 4
**Severity:** P2 — Dead import
**Code:**
```tsx
import {
  View, Text, StyleSheet, Pressable,
  Alert, Dimensions,
  Pressable,
} from 'react-native';
```
**Evidence:** `Dimensions` is imported but never used in the file.

### P2-05: Voice Recorder Send Function Does Not Actually Upload
**File:** `apps/mobile/app/(screens)/voice-recorder.tsx`
**Lines:** 116-120
**Severity:** P2 — Feature incomplete
**Code:**
```tsx
const send = useCallback(() => {
  if (!uri) return;
  setUploading(true);
  router.back();
}, [uri, router]);
```
**Evidence:**
- Sets `uploading` to true then immediately navigates back
- Never actually uploads the recording to any backend
- No API call, no R2 upload, no presigned URL
- The `uploading` state is set but the upload overlay (lines 306-311) would briefly flash then disappear as the screen navigates away

### P2-06: Watch Party Join Button Does Nothing
**File:** `apps/mobile/app/(screens)/watch-party.tsx`
**Lines:** 90-95
**Severity:** P2 — Feature facade
**Code:**
```tsx
<Pressable style={styles.joinBtn}>
  <LinearGradient colors={[colors.emerald, '#0D9B63']} style={styles.joinBtnGradient}>
    <Icon name="play" size="sm" color="#FFF" />
    <Text style={styles.joinBtnText}>Join Party</Text>
  </LinearGradient>
</Pressable>
```
**Evidence:**
- No `onPress` handler — tapping the "Join Party" button does absolutely nothing
- No navigation to a watch party viewing screen
- The press on the card (line 66) only calls `haptic.light()` — no navigation either

### P2-07: Watch Party Card Missing `accessibilityRole`
**File:** `apps/mobile/app/(screens)/watch-party.tsx`
**Lines:** 66, 90
**Severity:** P2 — Accessibility
**Evidence:**
- The party card `Pressable` (line 66) has no `accessibilityRole="button"`
- The join button `Pressable` (line 90) has no `accessibilityRole="button"`
- Other pressables in the file do have it (line 148)

### P2-08: Audio Room Decline Hand Button Does Nothing
**File:** `apps/mobile/app/(screens)/audio-room.tsx`
**Lines:** 443-445
**Severity:** P2 — Feature facade
**Code:**
```tsx
<Pressable>
  <Text style={styles.declineText}>{t('common.decline')}</Text>
</Pressable>
```
**Evidence:**
- No `onPress` handler on the decline button for raised hands
- Tapping "Decline" does nothing
- No `accessibilityRole="button"` either

### P2-09: Audio Room Reactions Button Does Nothing
**File:** `apps/mobile/app/(screens)/audio-room.tsx`
**Lines:** 497-504
**Severity:** P2 — Feature facade
**Code:**
```tsx
<Pressable style={styles.controlButton}>
  <LinearGradient
    colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
    style={styles.controlButtonInner}
  >
    <Icon name="smile" size="md" color={colors.text.primary} />
  </LinearGradient>
</Pressable>
```
**Evidence:**
- No `onPress` handler — reactions button does nothing
- No `accessibilityRole="button"`

### P2-10: Audio Room End Room Button Does Nothing
**File:** `apps/mobile/app/(screens)/audio-room.tsx`
**Lines:** 518-520
**Severity:** P2 — Feature facade
**Code:**
```tsx
<Pressable style={styles.endRoomButton}>
  <Text style={styles.endRoomText}>End Room</Text>
</Pressable>
```
**Evidence:**
- No `onPress` handler
- No `accessibilityRole="button"`
- No API call to end the room
- Should only be visible to the host but there's no role check

### P2-11: Audio Room "More Listeners" Badge Always Shows (Even When 0)
**File:** `apps/mobile/app/(screens)/audio-room.tsx`
**Lines:** 398-401
**Severity:** P2 — UI bug
**Code:**
```tsx
<View style={styles.moreBadge}>
  <Text style={styles.moreText}>+{moreListenerCount} more</Text>
</View>
```
**Evidence:**
- Always rendered regardless of `moreListenerCount` value
- When `moreListenerCount` is 0 or negative, shows "+0 more" or "+-2 more"
- Should be conditionally rendered: `{moreListenerCount > 0 && ...}`

### P2-12: Quran Room `refreshControl` Is a No-Op
**File:** `apps/mobile/app/(screens)/quran-room.tsx`
**Lines:** 239-244
**Severity:** P2 — Feature facade
**Code:**
```tsx
<RefreshControl
  tintColor={colors.emerald}
  refreshing={false}
  onRefresh={() => {}}
/>
```
**Evidence:**
- `refreshing` is hardcoded to `false`
- `onRefresh` is an empty function — pull-to-refresh does nothing
- Should trigger a re-fetch of room state/verse data

---

## LOW (P3) — Total: 9

### P3-01: Live Viewer Floating Reactions Are Local-Only
**File:** `apps/mobile/app/(screens)/live/[id].tsx`
**Lines:** 122-130
**Severity:** P3 — Feature limitation
**Evidence:**
- `addFloatingReaction()` only adds to local state
- Reactions are not sent to the backend or broadcast via socket
- Other viewers never see reactions from this user
- Reactions disappear after 3 seconds via `setTimeout`

### P3-02: Live Viewer Audio Bars Interval Never Cleaned Up Properly
**File:** `apps/mobile/app/(screens)/live/[id].tsx`
**Lines:** 111-120
**Severity:** P3 — Memory leak potential
**Code:**
```tsx
useEffect(() => {
  if (live?.liveType === 'AUDIO') {
    const interval = setInterval(() => {
      audioBars.forEach((bar) => {
        bar.value = withSpring(0.2 + Math.random() * 0.8, { damping: 10, stiffness: 100 });
      });
    }, 200);
    return () => clearInterval(interval);
  }
}, [live?.liveType]);
```
**Evidence:**
- The `audioBars` shared values are referenced in the dependency-less closure but not in the dependency array
- The 200ms interval fires animation springs continuously, generating a lot of Reanimated work
- On slower devices this could cause frame drops

### P3-03: Live Viewer `leaveMutation` Fires in Cleanup Without Guard
**File:** `apps/mobile/app/(screens)/live/[id].tsx`
**Lines:** 178-184
**Severity:** P3 — Race condition
**Code:**
```tsx
useEffect(() => {
  return () => {
    if (live?.id && user?.id) {
      leaveMutation.mutate();
    }
  };
}, [live?.id, user?.id]);
```
**Evidence:**
- `leaveMutation.mutate()` is called during cleanup (component unmount)
- But React Query mutations during unmount can cause "Can't perform a React state update on an unmounted component" warnings
- The mutation's `onSuccess` callback (lines 166-169) calls `queryClient.invalidateQueries` on an unmounted component
- Should use a plain `fetch` or `liveApi.leave()` directly without mutation wrapper for cleanup

### P3-04: Call Screen Missing `router` in useEffect Dependency Array
**File:** `apps/mobile/app/(screens)/call/[id].tsx`
**Line:** 136
**Severity:** P3 — React hooks lint violation
**Code:**
```tsx
useEffect(() => {
  // ...
  socket.on('call_ended', () => {
    setCallStatus('ended');
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimeout(() => router.back(), 2000);  // uses `router` but not in deps
  });
  // ...
}, [id]);  // missing `router`
```

### P3-05: Quran Room Uses `icon` Prop With JSX Element Instead of String
**File:** `apps/mobile/app/(screens)/quran-room.tsx`
**Lines:** 222-232
**Severity:** P3 — Type mismatch potential
**Code:**
```tsx
rightActions={[
  {
    icon: 'share',
    onPress: () => router.push('/(screens)/quran-share' as never),
    accessibilityLabel: t('tafsir.share'),
  },
  {
    icon: (
      <View
        style={[
          styles.connectionDot,
          { backgroundColor: isConnected ? colors.emerald : colors.error },
        ]}
      />
    ),
    onPress: () => {},
    accessibilityLabel: isConnected ? 'Connected' : 'Disconnected',
  },
]}
```
**Evidence:**
- The second action uses a JSX `<View>` element as the `icon` prop
- GlassHeader `icon` type expects `IconName | React.ReactNode` — if it only expects `IconName` (string), this would fail
- The accessibility labels 'Connected' / 'Disconnected' are hardcoded English

### P3-06: Schedule Live `dayOptions` Recalculated on Every Render
**File:** `apps/mobile/app/(screens)/schedule-live.tsx`
**Line:** 71
**Severity:** P3 — Performance
**Code:**
```tsx
const dayOptions = generateDayOptions();
```
**Evidence:**
- `generateDayOptions()` creates 7 Date objects on every render
- Should be wrapped in `useMemo` to avoid unnecessary re-creation
- Also referenced in `useEffect` dependency array (line 85) which would trigger on every render

### P3-07: Voice Post Create `stopRecording` Referenced Before Declaration
**File:** `apps/mobile/app/(screens)/voice-post-create.tsx`
**Lines:** 48-55, 62-75
**Severity:** P3 — Hoisting issue
**Code:**
```tsx
// Line 48-55 (startRecording calls stopRecording)
intervalRef.current = setInterval(() => {
  setDuration(d => {
    if (d >= MAX_DURATION) {
      stopRecording();  // Called here
      return d;
    }
    return d + 1;
  });
}, 1000);

// Line 62-75 (stopRecording defined after)
const stopRecording = useCallback(async () => { ... }, []);
```
**Evidence:**
- `stopRecording` is called inside `startRecording`'s interval callback
- `startRecording` is defined before `stopRecording` via `useCallback`
- Due to JavaScript hoisting, `stopRecording` will be `undefined` when the interval fires because `useCallback` returns are not hoisted
- However, since the interval captures the closure at time of creation, `stopRecording` in the closure will reference the initial `undefined` value
- This means the auto-stop at `MAX_DURATION` will crash with "stopRecording is not a function"

### P3-08: Voice Recorder `stop` Function Called in `setTime` Callback
**File:** `apps/mobile/app/(screens)/voice-recorder.tsx`
**Lines:** 61-63
**Severity:** P3 — Potential state issues
**Code:**
```tsx
timer.current = setInterval(() => {
  setTime((t) => t >= MAX_TIME ? (stop(), t) : t + 1);
}, 1000);
```
**Evidence:**
- Calls `stop()` inside `setTime` state updater function
- `stop()` itself calls `setState('recorded')` and other state updates
- Calling async operations and state updates inside another state updater is a React anti-pattern
- The comma operator `(stop(), t)` calls `stop` and returns `t`, which is clever but hard to maintain

### P3-09: Audio Room Missing Accessibility Labels on Multiple Buttons
**File:** `apps/mobile/app/(screens)/audio-room.tsx`
**Lines:** 435, 443, 497, 507, 518
**Severity:** P3 — Accessibility
**Evidence:**
- Accept hand button (line 435): no `accessibilityLabel`
- Decline hand button (line 443): no `accessibilityRole` or `accessibilityLabel`
- Reactions button (line 497): no `accessibilityRole` or `accessibilityLabel`
- Leave button (line 507): has `accessibilityRole` but no `accessibilityLabel`
- End room button (line 518): no `accessibilityRole` or `accessibilityLabel`

---

## SUMMARY

| Severity | Count | Key Theme |
|----------|-------|-----------|
| **P0 (Critical)** | 5 | Zero WebRTC = all calls/live/audio are pure UI facades; watch party auth bypass; voice post fake upload |
| **P1 (High)** | 7 | Duplicate imports (build errors), unauthenticated socket, placeholder date picker, 20+ hardcoded English strings |
| **P2 (Medium)** | 12 | Dead imports, no-op buttons (6 buttons do nothing), hardcoded chat messages, always-visible badges |
| **P3 (Low)** | 9 | Local-only reactions, memory leaks, hoisting bugs, accessibility gaps, performance |
| **Total** | **33** | |

### Core Problem Statement

**The entire call/live/audio stack is a UI facade.** There is no `react-native-webrtc`, no Agora, no LiveKit, no Twilio, no Stream — no real-time media SDK of any kind is installed. Every "call", "live stream", and "audio room" screen renders beautiful UI with gradients, animations, and control buttons, but:

1. **Calls:** No audio/video data flows. Mute/speaker/camera toggles change booleans only.
2. **Live streams:** Uses pre-recorded `<Video>` player. No camera capture. Chat is hardcoded samples.
3. **Audio rooms:** No audio at all. Mic toggle updates a database field. No socket connection for real-time updates.
4. **Watch parties:** Unauthenticated HTTP calls. Join button has no handler.
5. **Voice posts:** Recording works (expo-av), but upload returns `{ success: true }` without sending anything.

To make any of these features functional, the project needs to integrate a real-time media SDK (e.g., LiveKit, Agora, or react-native-webrtc with a signaling server).
