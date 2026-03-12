# BATCH 34: Integration Mega-Batch — Wire Screens to Backends + UI Components

**Date:** 2026-03-13
**Theme:** Replace ALL mock data with real API calls. Wire new UI components into existing screens. Each agent modifies ONLY its listed files — zero conflicts.
**Prerequisite:** Run npm installs from Batch 33 post-tasks first (otplib, qrcode, react-i18next, i18next, expo-localization, expo-notifications, expo-device).

---

## GLOBAL RULES

1. Read `CLAUDE.md` first — mandatory rules
2. No `any` in non-test code. No `@ts-ignore`. No `@ts-expect-error`.
3. **Replace MOCK_ constants with real API calls** using the API clients in `src/services/`
4. Use `useState` + `useEffect` for data fetching (no query library installed)
5. Keep ALL existing glassmorphism, animations, and visual styling intact
6. Add proper loading states (use `<Skeleton>` components, NOT bare ActivityIndicator)
7. Add proper error states with retry
8. Add `<RefreshControl>` on all FlatLists (pull-to-refresh)
9. NEVER change the visual design — only replace data sources
10. NEVER shadow imported variables (e.g., never `const colors = ...` inside a component that imports `colors`)
11. Type icon arrays properly — use `icon: IconName`, NEVER `icon: string`
12. NEVER use duplicate props (e.g., `style={...} style={...}`)
13. After completing your task: `git add -A && git commit -m "feat: batch 34 agent N — <description>"`

---

## INTEGRATION PATTERN (use in ALL agents)

```tsx
// BEFORE (mock):
const MOCK_DATA = [{ id: '1', title: 'Test' }];
// ...
const [data] = useState(MOCK_DATA);

// AFTER (real API):
import { someApi } from '@/services/someApi';

const [data, setData] = useState<SomeType[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
const [refreshing, setRefreshing] = useState(false);

const fetchData = useCallback(async () => {
  try {
    setError(null);
    const response = await someApi.list();
    setData(response.data);
  } catch (err) {
    setError('Failed to load data');
  } finally {
    setLoading(false);
    setRefreshing(false);
  }
}, []);

useEffect(() => { fetchData(); }, [fetchData]);

const handleRefresh = useCallback(() => {
  setRefreshing(true);
  fetchData();
}, [fetchData]);
```

For mutations (create/update/delete):
```tsx
const [submitting, setSubmitting] = useState(false);

const handleSubmit = useCallback(async () => {
  try {
    setSubmitting(true);
    await someApi.create(formData);
    router.back(); // or navigate to result
  } catch (err) {
    Alert.alert('Error', 'Failed to submit');
  } finally {
    setSubmitting(false);
  }
}, [formData]);
```

---

## AGENT 1: Monetization Screens (send-tip + membership-tiers + enable-tips)

**Modifies:**
- `apps/mobile/app/(screens)/send-tip.tsx` (617 lines)
- `apps/mobile/app/(screens)/membership-tiers.tsx` (688 lines)
- `apps/mobile/app/(screens)/enable-tips.tsx` (627 lines)

**API Client:** `import { monetizationApi } from '@/services/monetizationApi';`
**Types:** `import type { Tip, MembershipTier, MembershipSubscription, CreateTierDto } from '@/types/monetization';`

**send-tip.tsx changes:**
- Remove MOCK_RECENT_TIPS, MOCK_TOP_SUPPORTERS, etc.
- Wire `monetizationApi.sendTip({ receiverId, amount, message })` to submit handler
- Wire `monetizationApi.getSentTips()` for recent tips list
- Wire `monetizationApi.getTipStats()` for stats section
- Add loading/error states

**membership-tiers.tsx changes:**
- Remove MOCK_TIERS constant
- Wire `monetizationApi.getUserTiers(userId)` for tier list
- Wire `monetizationApi.createTier(data)` for create flow
- Wire `monetizationApi.subscribe(tierId)` / `monetizationApi.unsubscribe(tierId)` for subscription toggle
- Wire `monetizationApi.getSubscribers()` for subscriber count
- Add loading/error states

**enable-tips.tsx changes:**
- Check if screen has mock data — if so, wire to monetizationApi
- Wire tip settings/preferences to settings API or monetization API as appropriate

**~150-250 lines changed total across 3 files**

---

## AGENT 2: Events Screens (create-event + event-detail)

**Modifies:**
- `apps/mobile/app/(screens)/create-event.tsx` (750 lines)
- `apps/mobile/app/(screens)/event-detail.tsx` (769 lines)

**API Client:** `import { eventsApi } from '@/services/eventsApi';`
**Types:** `import type { Event, CreateEventDto, EventRSVP } from '@/types/events';`

**create-event.tsx changes:**
- Remove MOCK_CATEGORIES, MOCK_COMMUNITIES, etc.
- Wire form submit → `eventsApi.create(data)` with CreateEventDto
- Add form validation before submit
- Navigate to event-detail on success with returned event ID
- Add submitting state to button

**event-detail.tsx changes:**
- Remove MOCK_EVENT, MOCK_ATTENDEES, etc.
- Get event ID from route params: `const { id } = useLocalSearchParams()`
- Wire `eventsApi.getById(id)` for event data
- Wire `eventsApi.rsvp(id, { status })` for RSVP button
- Wire `eventsApi.listAttendees(id)` for attendee list
- Wire `eventsApi.delete(id)` for owner delete action
- Add loading skeleton, error state, pull-to-refresh

**~200-300 lines changed total across 2 files**

---

## AGENT 3: 2FA Screens (2fa-setup + 2fa-verify)

**Modifies:**
- `apps/mobile/app/(screens)/2fa-setup.tsx` (755 lines)
- `apps/mobile/app/(screens)/2fa-verify.tsx` (467 lines)

**API Client:** `import { twoFactorApi } from '@/services/twoFactorApi';`
**Types:** `import type { SetupResponse, TwoFactorStatus } from '@/types/twoFactor';`

**2fa-setup.tsx changes:**
- Remove MOCK_QR_DATA, MOCK_SECRET, MOCK_BACKUP_CODES, etc. (8 mocks)
- Wire step 1 (setup): `twoFactorApi.setup()` → get secret + QR data URI + backup codes
- Wire step 2 (verify): `twoFactorApi.verify({ code })` → enable 2FA
- Wire status check: `twoFactorApi.status()` → show current 2FA state
- Wire disable: `twoFactorApi.disable({ code })` → disable 2FA
- Add loading states per step, error handling with shake animation

**2fa-verify.tsx changes:**
- Wire `twoFactorApi.validate({ userId, code })` for code verification
- Wire `twoFactorApi.backup({ userId, backupCode })` for backup code path
- Add error state with shake animation on invalid code
- Add loading state during validation
- Navigate on success

**~150-250 lines changed total across 2 files**

---

## AGENT 4: Audio Room Screen

**Modifies:**
- `apps/mobile/app/(screens)/audio-room.tsx` (695 lines)

**API Client:** `import { audioRoomsApi } from '@/services/audioRoomsApi';`
**Types:** `import type { AudioRoom, AudioRoomParticipant, CreateAudioRoomDto } from '@/types/audioRooms';`

**audio-room.tsx changes:**
- Remove MOCK_ROOM, MOCK_SPEAKERS, MOCK_LISTENERS, MOCK_RAISED_HANDS, etc. (7 mocks)
- Get room ID from route params
- Wire `audioRoomsApi.getById(id)` for room data + participants
- Wire `audioRoomsApi.join(id)` for join button
- Wire `audioRoomsApi.leave(id)` for leave
- Wire `audioRoomsApi.toggleHand(id)` for raise hand
- Wire `audioRoomsApi.toggleMute(id)` for mute toggle
- Wire `audioRoomsApi.changeRole(id, { userId, role })` for host promoting speakers
- Add loading skeleton, error state
- Poll for participants (useEffect with interval, or re-fetch on action)

**~150-200 lines changed**

---

## AGENT 5: Islamic Screens (hadith + mosque-finder + prayer-times)

**Modifies:**
- `apps/mobile/app/(screens)/hadith.tsx` (482 lines)
- `apps/mobile/app/(screens)/mosque-finder.tsx` (544 lines)
- `apps/mobile/app/(screens)/prayer-times.tsx` (732 lines)

**API Client:** `import { islamicApi } from '@/services/islamicApi';`
**Types:** `import type { Hadith, Mosque, PrayerTimes, PrayerMethod } from '@/types/islamic';`

**hadith.tsx changes:**
- Remove MOCK_HADITHS (3 mocks)
- Wire `islamicApi.getDailyHadith()` for daily featured hadith
- Wire `islamicApi.listHadiths(cursor)` for full list with pagination
- Wire `islamicApi.getHadith(id)` for detail view
- Add loading skeleton, pull-to-refresh

**mosque-finder.tsx changes:**
- Remove MOCK_MOSQUES, MOCK_FACILITIES, etc. (3 mocks)
- Wire `islamicApi.getMosques(lat, lng, radius)` — use expo-location for current position
- Add loading state while fetching location + mosques
- Add error state for location permission denied

**prayer-times.tsx changes:**
- Remove MOCK_PRAYER_TIMES, MOCK_DATES, MOCK_SETTINGS, etc. (9 mocks)
- Wire `islamicApi.getPrayerTimes(lat, lng, method, date)` for prayer times
- Wire `islamicApi.getPrayerMethods()` for method selector
- Use expo-location for current position
- Add loading state, method selection persistence

**~250-350 lines changed total across 3 files**

---

## AGENT 6: Wire ImageCarousel into Post Screens

**Modifies:**
- `apps/mobile/src/components/saf/PostMedia.tsx` (or wherever post media is rendered)
- `apps/mobile/app/(screens)/post/[id].tsx` (if it exists, or the post detail screen)

**First:** Read PostMedia.tsx and post detail screen to understand current media rendering.

**Changes:**
- Import `ImageCarousel` from `@/components/ui/ImageCarousel`
- Import `ImageGallery` from `@/components/ui/ImageGallery`
- When `post.mediaUrls.length > 1`, render `<ImageCarousel images={post.mediaUrls} />`
- When `post.mediaUrls.length === 1`, keep existing single image
- Add gallery state: `const [galleryVisible, setGalleryVisible] = useState(false)` + `const [galleryIndex, setGalleryIndex] = useState(0)`
- On image press → open `<ImageGallery images={post.mediaUrls} initialIndex={index} visible={galleryVisible} onClose={() => setGalleryVisible(false)} />`
- Render `<ImageGallery>` at bottom of component

**Also check:**
- `apps/mobile/src/components/saf/PostCard.tsx` — if it renders media inline, add carousel there too

**~50-100 lines changed**

---

## AGENT 7: Wire VideoControls + MiniPlayer into Video Screen

**Modifies:**
- `apps/mobile/app/(screens)/video/[id].tsx` (or equivalent video detail screen)

**First:** Read the video detail screen to understand current playback implementation.

**Changes:**
- Import `VideoControls` from `@/components/ui/VideoControls`
- Import `MiniPlayer` from `@/components/ui/MiniPlayer`
- Add state for VideoControls props: quality, speed, volume, currentTime, duration
- Replace any existing basic controls with `<VideoControls>` overlay
- Wire quality/speed changes to Video component (expo-av)
- Add auto-hide logic (show on tap, hide after 3s)
- Wire MiniPlayer to appear when navigating away during playback (store video state in Zustand or context)

**Types to use:**
```tsx
import type { VideoQuality, PlaybackSpeed } from '@/components/ui/VideoControls';
```

**~100-150 lines changed**

---

## AGENT 8: Wire LinkPreview into Thread/Post Content

**Modifies:**
- `apps/mobile/src/components/ui/RichText.tsx` (add link preview rendering)
- OR `apps/mobile/src/components/majlis/ThreadCard.tsx` (if RichText doesn't handle links)

**First:** Read RichText.tsx to understand how URLs in content are currently handled.

**Changes:**
- Import `LinkPreview` from `@/components/ui/LinkPreview`
- Detect URLs in content using regex: `/(https?:\/\/[^\s]+)/g`
- For the FIRST URL found in content, render `<LinkPreview url={firstUrl} />` below the text
- Only show one preview per post/thread (like Twitter/X behavior)
- Add `onPress` handler to open URL via `Linking.openURL`

**~30-60 lines changed**

---

## AGENT 9: Wire Story Stickers into Story Viewer

**Modifies:**
- `apps/mobile/app/(screens)/story/[id].tsx` (or the story viewing screen)

**First:** Read the story viewing screen to understand current sticker/overlay rendering.

**Changes:**
- Import all 5 stickers from `@/components/story`:
  ```tsx
  import { PollSticker, QuizSticker, QuestionSticker, CountdownSticker, SliderSticker } from '@/components/story';
  ```
- When story has sticker data (check story model for sticker fields), render the appropriate sticker component on top of story media
- Position stickers using absolute positioning within story container
- Wire `onResponse` handlers to send sticker responses to backend (use stickers API if available, otherwise local state for now)
- For creators: show `isCreator={true}` to display results view

**Also modify story creation if applicable:**
- `apps/mobile/app/(screens)/story-create.tsx` or similar — add sticker picker to toolbar

**~100-200 lines changed**

---

## FILE → AGENT CONFLICT MAP (zero overlaps)

| Agent | Files Modified | Touches Existing? |
|-------|---------------|-------------------|
| 1 | send-tip.tsx, membership-tiers.tsx, enable-tips.tsx | YES (3 files, exclusive) |
| 2 | create-event.tsx, event-detail.tsx | YES (2 files, exclusive) |
| 3 | 2fa-setup.tsx, 2fa-verify.tsx | YES (2 files, exclusive) |
| 4 | audio-room.tsx | YES (1 file, exclusive) |
| 5 | hadith.tsx, mosque-finder.tsx, prayer-times.tsx | YES (3 files, exclusive) |
| 6 | PostMedia.tsx or PostCard.tsx, post/[id].tsx | YES (2 files, exclusive) |
| 7 | video/[id].tsx | YES (1 file, exclusive) |
| 8 | RichText.tsx or ThreadCard.tsx | YES (1-2 files, exclusive) |
| 9 | story/[id].tsx, possibly story-create.tsx | YES (1-2 files, exclusive) |

**ZERO file conflicts. Each agent has exclusive ownership of its files.**

---

## VERIFICATION CHECKLIST

**For ALL agents:**
- [ ] All MOCK_ constants removed (grep for `MOCK_` should return 0 in modified files)
- [ ] Real API calls using imported API clients
- [ ] Loading states with `<Skeleton>` components (not bare ActivityIndicator)
- [ ] Error states with retry button
- [ ] Pull-to-refresh on all FlatLists
- [ ] 0 instances of `as any`
- [ ] No `@ts-ignore` or `@ts-expect-error`
- [ ] All existing visual styling preserved (glassmorphism, animations, colors)
- [ ] No variable shadowing of `colors`, `spacing`, etc.
- [ ] No duplicate props

**For Agents 6-9 (UI component wiring):**
- [ ] Components imported from correct paths
- [ ] Props passed correctly matching component interfaces
- [ ] Gallery/overlay dismissal works (onClose handlers)
- [ ] No RN Modal used for overlays

---

## POST-BATCH TASKS

1. Test all screens with real backend running (`cd apps/api && npm run start:dev`)
2. Verify API response shapes match TypeScript types
3. Check for any 401/403 errors (auth token passing)
4. Verify prayer times / mosque finder work with real geolocation
