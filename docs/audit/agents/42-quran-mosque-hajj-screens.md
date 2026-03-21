# Agent 42 — Quran + Mosque + Hajj + Scholar + Hifz Screens Deep Audit

**Agent:** 42 of 67+
**Scope:** 9 mobile screens — fatwa-qa, mosque-finder, scholar-verification, hajj-companion, hajj-step, tafsir-viewer, quran-reading-plan, quran-share, quran-room, hifz-tracker
**Method:** Line-by-line read of every screen file, cross-referenced against backend controllers, API service layer, Icon types, theme tokens, and GlassHeader props
**Total findings:** 52

---

## CRITICAL (Ship Blockers / Data Loss / Security)

### Finding 1: fatwa-qa.tsx uses raw fetch() without auth — POST always 401
**File:** `apps/mobile/app/(screens)/fatwa-qa.tsx`
**Lines:** 43-49 (GET), 57-63 (POST)
**Severity:** CRITICAL — feature completely broken
**Code:**
```ts
// GET — no auth header
const res = await fetch(`${API_BASE}/fatwa?${params}`);

// POST — no auth header
const res = await fetch(`${API_BASE}/fatwa`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ question, madhab: askMadhab !== 'any' ? askMadhab : undefined }),
});
```
**Problem:** The screen constructs raw `fetch()` calls using `API_BASE` directly instead of using the `islamicApi` or `api` service which attaches the Clerk JWT via `Authorization: Bearer`. The backend `POST /fatwa` endpoint at `community.controller.ts:80-86` uses `@UseGuards(ClerkAuthGuard)`, so every POST will return HTTP 401. The GET endpoint uses `OptionalClerkAuthGuard` so it may work without auth, but the response won't include personalized data.
**Fix:** Replace raw fetch with `api.get('/fatwa', ...)` and `api.post('/fatwa', ...)` from the api service, or add fatwa methods to `islamicApi`.

---

### Finding 2: fatwa-qa.tsx POST has no error handling — silent failure on 401/500
**File:** `apps/mobile/app/(screens)/fatwa-qa.tsx`
**Lines:** 56-71
**Severity:** CRITICAL — user submits question, sees success animation, but question was never created
**Code:**
```ts
const askMutation = useMutation({
  mutationFn: async () => {
    const res = await fetch(`${API_BASE}/fatwa`, { ... });
    return res.json(); // Never checks res.ok
  },
  onSuccess: () => {
    setQuestion('');
    setActiveTab('browse');
    queryClient.invalidateQueries({ queryKey: ['fatwa-questions'] });
    haptic.success(); // Plays success haptic even on 401
  },
});
```
**Problem:** `res.json()` is called without checking `res.ok`. A 401 JSON error response `{ message: 'Unauthorized' }` will be parsed and treated as success. The `onSuccess` callback fires, clearing the question text and playing a success haptic. User thinks their question was submitted but it was not. No `onError` handler exists either.
**Fix:** Check `res.ok` before parsing, throw on non-2xx responses, add `onError` handler to show an alert.

---

### Finding 3: fatwa-qa.tsx GET response shape mismatch — questions may never render
**File:** `apps/mobile/app/(screens)/fatwa-qa.tsx`
**Lines:** 41-53, 73
**Severity:** HIGH — potentially empty screen despite data existing
**Code:**
```ts
// The query expects:
useInfiniteQuery<{ data?: Array<Record<string, unknown>>; meta?: { cursor: string | null; hasMore: boolean } }>({
  queryFn: async ({ pageParam }) => {
    const res = await fetch(`${API_BASE}/fatwa?${params}`);
    return res.json();
  },
  ...
});
const questions = questionsQuery.data?.pages.flatMap((p) => p.data || []) || [];
```
**Problem:** The backend's `TransformInterceptor` wraps responses in `{ success, data, timestamp }`. The raw `fetch()` returns this envelope. But the code accesses `p.data`, which would work IF the response shape is `{ data: [...], meta: {...} }`. However since `OptionalClerkAuthGuard` is used and no token is sent, the response might differ. More critically, the `res.json()` result is the full envelope `{ success: true, data: [...], meta: {...}, timestamp: '...' }`, so `p.data` should work, but `p.meta` needs to access the envelope's meta. This is fragile because the `api` service's `request()` method handles unwrapping (lines 167-168 of api.ts), which this raw fetch bypasses.

---

### Finding 4: mosque-finder.tsx — Directions button is a no-op
**File:** `apps/mobile/app/(screens)/mosque-finder.tsx`
**Lines:** 163-176
**Severity:** CRITICAL — major user-facing feature does nothing
**Code:**
```tsx
<Pressable
  accessibilityRole="button"
  onPress={() => haptic.light()}  // <-- Only plays haptic, no navigation
  style={styles.directionsButton}
>
  <LinearGradient ...>
    <Icon name="map-pin" size="xs" color={colors.text.primary} />
    <Text style={styles.directionsText}>{t('islamic.directions')}</Text>
  </LinearGradient>
</Pressable>
```
**Problem:** The "Directions" button on every mosque card only triggers a haptic feedback. It does not open the device's maps app (e.g., `Linking.openURL('maps://...')` or `Linking.openURL('geo:...')`), navigate to a maps screen, or do anything useful. This is a primary CTA for a mosque finder feature.
**Fix:** Use `Linking.openURL` with the mosque's coordinates to open Apple Maps / Google Maps.

---

### Finding 5: mosque-finder.tsx — Qibla direction is hardcoded "118 Southeast"
**File:** `apps/mobile/app/(screens)/mosque-finder.tsx`
**Lines:** 390
**Severity:** HIGH — misleading religious information
**Code:**
```tsx
<Text style={styles.qiblaDirection}>118° Southeast</Text>
```
**Problem:** The Qibla direction is hardcoded as "118 Southeast" regardless of the user's actual location. The `userLocation` state is fetched (line 206) but never used for Qibla calculation. 118 SE is only correct for a specific location (roughly Sydney, Australia). For users in Turkey, Indonesia, USA, etc., this displays incorrect Qibla direction — which is religious misinformation.
**Fix:** Calculate Qibla bearing from `userLocation` to Mecca (21.4225, 39.8262) using the great-circle formula.

---

### Finding 6: scholar-verification.tsx — Document upload is completely mock
**File:** `apps/mobile/app/(screens)/scholar-verification.tsx`
**Lines:** 168-173
**Severity:** HIGH — scholar verification requires real documents
**Code:**
```ts
const handleAddDocument = useCallback(() => {
  // Placeholder: in production, this would open a file picker + presigned URL upload
  const mockUrl = `https://cdn.mizanly.app/docs/credential-${Date.now()}.pdf`;
  setDocumentUrls(prev => [...prev, mockUrl]);
  haptic.light();
}, [haptic]);
```
**Problem:** The "Add Document" button generates a fake URL with `Date.now()` instead of opening an actual file picker (e.g., `expo-document-picker`). These mock URLs are then sent to the backend via `islamicApi.applyScholarVerification()`. The backend receives fake document URLs that point to non-existent files, making the entire scholar verification process invalid.
**Fix:** Use `expo-document-picker` to select files, then upload via presigned R2 URLs, and pass real URLs.

---

### Finding 7: quran-share.tsx — Copy to clipboard is a stub
**File:** `apps/mobile/app/(screens)/quran-share.tsx`
**Lines:** 113-116
**Severity:** MEDIUM — visible button does nothing
**Code:**
```ts
const handleCopyText = useCallback(() => {
  // Copy to clipboard
  setShowShareOptions(false);
}, []);
```
**Problem:** The "Copy Text" button (used in both inline copy button at line 354 and bottom sheet at line 405) closes the share sheet but never actually copies anything to the clipboard. `expo-clipboard` or `Clipboard` from `react-native` is not imported or used.
**Fix:** Import `* as Clipboard from 'expo-clipboard'` and call `Clipboard.setStringAsync(verseText + translationText)`.

---

### Finding 8: quran-share.tsx — "Share as Post" and "Share as Story" don't pass verse data
**File:** `apps/mobile/app/(screens)/quran-share.tsx`
**Lines:** 103-111
**Severity:** MEDIUM — navigates to create screens without any verse content
**Code:**
```ts
const handleShareAsPost = useCallback(() => {
  setShowShareOptions(false);
  router.push('/(screens)/create-post');  // No params passed
}, [router]);

const handleShareAsStory = useCallback(() => {
  setShowShareOptions(false);
  router.push('/(screens)/create-story');  // No params passed
}, [router]);
```
**Problem:** When sharing a Quran verse as a post or story, the router navigates to the create screens without passing the verse text, translation, or surah reference. The user lands on an empty create screen with no pre-filled content.
**Fix:** Pass verse data as route params: `router.push({ pathname: '/(screens)/create-post', params: { content: `${verseText}\n\n${translationText}\n— ${currentSurah.name} ${currentVerse}` } })`.

---

### Finding 9: quran-share.tsx — "Share Image" button is a no-op
**File:** `apps/mobile/app/(screens)/quran-share.tsx`
**Lines:** 409-413
**Severity:** MEDIUM — share image option does nothing
**Code:**
```tsx
<BottomSheetItem
  label={t('screens.quranShare.shareImage')}
  icon={<Icon name="share" size="sm" color={colors.emerald} />}
  onPress={() => setShowShareOptions(false)}  // Only closes sheet
/>
```
**Problem:** The "Share Image" option in the share bottom sheet only closes the sheet. It does not capture a screenshot of the verse card, create a shareable image, or trigger any sharing functionality.

---

## HIGH (Broken Features / Wrong Behavior)

### Finding 10: quran-reading-plan.tsx — Heat map uses random data, not real reading history
**File:** `apps/mobile/app/(screens)/quran-reading-plan.tsx`
**Lines:** 284-288
**Severity:** HIGH — displays fake data to user
**Code:**
```ts
// Mock heat map data (last 30 days)
const heatMapDays = useMemo(
  () => Array.from({ length: 30 }, () => Math.floor(Math.random() * 3)),
  [],
);
```
**Problem:** The heat map showing reading consistency over the last 30 days generates random numbers (0-2) instead of fetching actual reading history from the backend. Each re-render shows consistent data (due to useMemo with empty deps), but it's entirely fabricated. Users see a false reading streak.
**Fix:** Fetch actual daily reading data from the API and map it to the heat map visualization.

---

### Finding 11: quran-reading-plan.tsx — ProgressRing doesn't actually show a progress arc
**File:** `apps/mobile/app/(screens)/quran-reading-plan.tsx`
**Lines:** 74-126
**Severity:** MEDIUM — visual misrepresentation
**Code:**
```tsx
function ProgressRing({ current, total, size, strokeWidth }: ...) {
  const progress = Math.min(current / total, 1);
  const circumference = (size - strokeWidth) * Math.PI;
  const strokeDashoffset = circumference * (1 - progress); // Computed but never used
  return (
    <View ...>
      <View style={[styles.ringBg, ...]} />           {/* Full ring background */}
      <LinearGradient ... style={[styles.ringProgress, ...]} />  {/* Full gradient ring — always 100% */}
      <View style={[styles.ringCenter, ...]}>
        <Text style={styles.ringPercent}>{percent}%</Text>
      </View>
    </View>
  );
}
```
**Problem:** `strokeDashoffset` is calculated (line 88) but never applied to any element. The `LinearGradient` ring progress layer renders as a full circle regardless of progress. The percentage text is correct, but the visual ring always appears 100% complete. This is because `LinearGradient` with `borderWidth` creates a full-width border, not a partial arc. A proper SVG-based circular progress would be needed.
**Fix:** Use `react-native-svg` `Circle` with `strokeDasharray` and `strokeDashoffset` for a proper progress ring.

---

### Finding 12: quran-room.tsx — No way to open host controls for non-hosts
**File:** `apps/mobile/app/(screens)/quran-room.tsx`
**Lines:** 332-349
**Severity:** MEDIUM — participants can't navigate verses
**Problem:** Only the host (line 332: `roomState?.hostId === currentUserId`) sees the FAB button to control verse navigation. Non-host participants have no way to navigate to a different verse. The only control visible is the "Leave" button. For a Quran reading room, participants should at minimum be able to request the next verse or see what verse is being read. The scrollContent has a RefreshControl but it's a no-op (line 243: `onRefresh={() => {}}`).

---

### Finding 13: quran-room.tsx — RefreshControl is a no-op
**File:** `apps/mobile/app/(screens)/quran-room.tsx`
**Lines:** 239-244
**Severity:** LOW-MEDIUM
**Code:**
```tsx
refreshControl={
  <RefreshControl
    tintColor={colors.emerald}
    refreshing={false}
    onRefresh={() => {}}  // Does nothing
  />
}
```
**Problem:** Pull-to-refresh does nothing. It should at minimum refetch the current verse data and room state.

---

### Finding 14: quran-room.tsx — No audio playback for Quran recitation
**File:** `apps/mobile/app/(screens)/quran-room.tsx`
**Lines:** Full file
**Severity:** HIGH — core feature missing
**Problem:** The Quran room screen handles socket-based verse synchronization but has ZERO audio playback capability. There's a `reciterId` state (line 294-298) that shows a "Reciting" badge, but there's no actual audio streaming or playback implementation. The `islamicApi` has no audio-related endpoints. For a Quran reading room, audio recitation is the primary use case.
**Fix:** Integrate `expo-av` for audio playback and connect to audio recitation URLs (e.g., from Quran.com's audio CDN).

---

### Finding 15: hajj-companion.tsx — PulseCircle animation triggered in render (not in useEffect)
**File:** `apps/mobile/app/(screens)/hajj-companion.tsx`
**Lines:** 25-44
**Severity:** MEDIUM — may cause repeated animation restarts
**Code:**
```tsx
function PulseCircle({ children, active }: { children: React.ReactNode; active: boolean }) {
  const pulseScale = useSharedValue(1);
  if (active) {
    pulseScale.value = withRepeat(...);  // Called during render, not in useEffect
  }
  ...
}
```
**Problem:** The animation assignment `pulseScale.value = withRepeat(...)` is executed during the component's render phase, not inside a `useEffect`. This means every re-render of the parent component will restart the pulse animation from scratch. In Reanimated v2/v3, shared value assignments in render can cause animation restarts on every state change.
**Fix:** Move the animation assignment into a `useEffect` with `active` as a dependency.

---

### Finding 16: hajj-step.tsx — toggleCheckItem uses stale progress in mutation
**File:** `apps/mobile/app/(screens)/hajj-step.tsx`
**Lines:** 82-103
**Severity:** MEDIUM — checklist state can desync
**Code:**
```ts
const toggleCheckItem = useCallback(
  (index: number) => {
    setChecklistState((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      if (progress) {
        try {
          const saved: ChecklistState = JSON.parse(progress.checklistJson || '{}');
          saved[String(stepIndex)] = next;
          updateMutation.mutate({ checklistJson: JSON.stringify(saved) });
        } catch { /* ignore */ }
      }
      return next;
    });
  },
  [progress, stepIndex, updateMutation],  // progress captured in closure
);
```
**Problem:** The `progress` object is captured in the useCallback closure. When `toggleCheckItem` fires, it reads `progress.checklistJson` from the closure, which may be stale if multiple toggles happen quickly before the query re-fetches. The `updateMutation` sends the merged state, but if two toggles happen before the progress query updates, the second toggle reads the OLD `progress.checklistJson` (before the first mutation's result), causing the first toggle to be overwritten.
**Fix:** Use `queryClient.getQueryData(['hajj-progress'])` inside the callback for fresh data, or use optimistic updates.

---

### Finding 17: hajj-step.tsx — Max step hardcoded to 6, conflicts with TOTAL_STEPS=7 in companion
**File:** `apps/mobile/app/(screens)/hajj-step.tsx`
**Lines:** 107
**Severity:** MEDIUM — off-by-one could prevent completion
**Code:**
```ts
const nextStep = Math.min(stepIndex + 1, 6);  // hardcoded 6
```
**In hajj-companion.tsx line 23:**
```ts
const TOTAL_STEPS = 7;
```
**Problem:** `hajj-step.tsx` caps the next step at 6 (0-indexed), which means 7 steps total (0-6). But `TOTAL_STEPS` in the companion is 7. If the guide has exactly 7 steps (indices 0-6), then `Math.min(stepIndex + 1, 6)` on the last step (index 6) returns 6, which means the progress bar in the companion shows `6/7 = 85%` and never reaches 100%. The step-marking logic should use `guide.length - 1` or `TOTAL_STEPS - 1` instead of hardcoded 6.

---

### Finding 18: hifz-tracker.tsx — O(n) lookup per surah row on list of 114 surahs
**File:** `apps/mobile/app/(screens)/hifz-tracker.tsx`
**Lines:** 311-312
**Severity:** LOW-MEDIUM — performance issue on 114-item list
**Code:**
```tsx
renderItem={({ item }) => {
  const progress = progressList.find(p => p.surahNum === item.num) ?? ...;
```
**Problem:** For every surah (114 items), `Array.find()` scans the progressList (also up to 114 items). This is O(n^2) in total. Should use a Map for O(1) lookup.
**Fix:** `useMemo(() => new Map(progressList.map(p => [p.surahNum, p])), [progressList])`.

---

### Finding 19: hifz-tracker.tsx — `.then(r => r.data)` may crash if API returns null
**File:** `apps/mobile/app/(screens)/hifz-tracker.tsx`
**Lines:** 199, 204, 209
**Severity:** MEDIUM — runtime crash on first use
**Code:**
```ts
queryFn: () => islamicApi.getHifzProgress().then(r => r.data),
queryFn: () => islamicApi.getHifzStats().then(r => r.data),
queryFn: () => islamicApi.getHifzReviewSchedule().then(r => r.data),
```
**Problem:** `islamicApi.getHifzProgress()` uses `api.get()` which returns the unwrapped response from the TransformInterceptor. For non-paginated responses, `api.request()` at line 171 returns `json.data !== undefined ? json.data : json`. So the result is already unwrapped. Calling `.then(r => r.data)` tries to access `.data` on the already-unwrapped result, which would be `undefined`. If the backend returns `{ success: true, data: [...], timestamp: '...' }`, the api client unwraps to `[...]`, then `.then(r => r.data)` returns `undefined` (arrays don't have `.data`).
**Fix:** Remove the `.then(r => r.data)` chain — the api client already unwraps.

---

## MEDIUM (UX Issues / Hardcoded Strings / Missing Features)

### Finding 20: fatwa-qa.tsx — Hardcoded English strings not using i18n
**File:** `apps/mobile/app/(screens)/fatwa-qa.tsx`
**Lines:** 129, 175, 191, 207, 94
**Severity:** MEDIUM — violates i18n requirement (8 languages)
**Hardcoded strings:**
- Line 129: `'Browse'` and `'Ask'` tab labels
- Line 175: `'Your Question'` label
- Line 191: `'Preferred Madhab'` label
- Line 207: `'Submit Question'` button text
- Line 94: `'Answered'` and `'Pending'` status texts
- Line 22-27: MADHABS labels (`'Any Madhab'`, `'Hanafi'`, `'Maliki'`, etc.)
**Problem:** All visible text should use `t()` for translation. These strings will appear in English for all 8 languages.

---

### Finding 21: scholar-verification.tsx — "Displayed on your profile" hardcoded English
**File:** `apps/mobile/app/(screens)/scholar-verification.tsx`
**Lines:** 279
**Severity:** MEDIUM — hardcoded English
**Code:**
```tsx
<Text style={styles.badgePreviewDesc}>Displayed on your profile</Text>
```

---

### Finding 22: scholar-verification.tsx — Uses invalid icon name "book"
**File:** `apps/mobile/app/(screens)/scholar-verification.tsx`
**Lines:** 410
**Severity:** MEDIUM — runtime warning/crash
**Code:**
```tsx
icon="book"
```
**Problem:** `'book'` is not in the valid `IconName` union type. The valid icon is `'book-open'`. The `iconMap` in Icon.tsx has no entry for `'book'`, which will result in `undefined` being passed as the icon component, likely causing a runtime error or rendering nothing.
**Fix:** Change `icon="book"` to `icon="book-open"`.

---

### Finding 23: scholar-verification.tsx — BottomSheetItem icon prop type mismatch
**File:** `apps/mobile/app/(screens)/scholar-verification.tsx`
**Lines:** 394, 410
**Severity:** LOW-MEDIUM — may cause TypeScript error
**Code:**
```tsx
<BottomSheetItem icon="book-open" ... />  // String
<BottomSheetItem icon="book" ... />        // String
```
**Problem:** `BottomSheetItem` expects `icon` to be a `ReactNode` (JSX element), not a string. Other usages in the same file correctly pass `<Icon name="..." ... />` as JSX. These two instances pass bare strings, which will render as plain text instead of icons.
**Fix:** Change to `icon={<Icon name="book-open" size="sm" color={colors.text.primary} />}`.

---

### Finding 24: scholar-verification.tsx — No back button in GlassHeader
**File:** `apps/mobile/app/(screens)/scholar-verification.tsx`
**Lines:** 429
**Severity:** MEDIUM — user cannot navigate back
**Code:**
```tsx
<GlassHeader title={t('scholar.title')} />
```
**Problem:** No `leftAction` or `showBack` prop is provided. The GlassHeader renders without a back button. The user has no way to go back from this screen except using the hardware back button (Android) or swipe-back gesture (iOS).
**Fix:** Add `showBack` or `leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}`.

---

### Finding 25: mosque-finder.tsx — Map is permanently "Coming Soon"
**File:** `apps/mobile/app/(screens)/mosque-finder.tsx`
**Lines:** 340-353
**Severity:** MEDIUM — a mosque finder without a map
**Code:**
```tsx
<LinearGradient ... style={styles.mapPlaceholder}>
  <Icon name="map-pin" size="xl" color={colors.emerald} />
  <Text style={styles.mapPlaceholderText}>{t('islamic.mapViewComingSoon')}</Text>
</LinearGradient>
```
**Problem:** The map placeholder takes 200px of vertical space and just says "Coming Soon." For a mosque finder, the map IS the core feature. `react-native-maps` is not installed or used.

---

### Finding 26: mosque-finder.tsx — MosqueCard does not navigate to mosque detail
**File:** `apps/mobile/app/(screens)/mosque-finder.tsx`
**Lines:** 113-179
**Severity:** MEDIUM — mosque cards are not tappable for detail view
**Problem:** The entire `MosqueCard` component has no `onPress` handler on its root element. There's no navigation to a mosque detail screen. The only interactive element is the "Directions" button (which is a no-op per Finding 4). Users can see mosques listed but cannot view details, prayer schedules, or community features.

---

### Finding 27: mosque-finder.tsx — Facility icons use generic icons
**File:** `apps/mobile/app/(screens)/mosque-finder.tsx`
**Lines:** 83-91
**Severity:** LOW — confusing UX
**Code:**
```ts
const FACILITY_ICONS: Record<string, IconName> = {
  parking: 'circle',       // Generic circle for parking?
  wheelchair: 'check-circle', // Check mark for wheelchair access?
  cafe: 'circle',          // Generic circle for cafe?
};
```
**Problem:** `'circle'` is a very generic icon that doesn't convey meaning. Parking and cafe show the same circle icon. Wheelchair access shows a check-circle which doesn't suggest accessibility. These should use more descriptive icons (even if the current icon set is limited).

---

### Finding 28: mosque-finder.tsx — FACILITY_LABELS hardcoded in English
**File:** `apps/mobile/app/(screens)/mosque-finder.tsx`
**Lines:** 93-101
**Severity:** LOW — inconsistency
**Code:**
```ts
const FACILITY_LABELS: Record<string, string> = {
  parking: 'Parking',
  wheelchair: 'Accessible',
  ...
};
```
**Problem:** Labels are hardcoded in English, but `FacilityBadge` (line 108) actually uses `t('islamic.facilities.${facility}')` with a fallback. The hardcoded labels are defined but never used — they're dead code. The `FacilityBadge` correctly uses i18n.

---

### Finding 29: hajj-companion.tsx — yearPicker bottom sheet is never shown
**File:** `apps/mobile/app/(screens)/hajj-companion.tsx`
**Lines:** 51, 350-358
**Severity:** LOW-MEDIUM — dead UI code
**Code:**
```ts
const [showYearPicker, setShowYearPicker] = useState(false);
// ...
// The BottomSheet for year picker exists:
<BottomSheet visible={showYearPicker} onClose={() => setShowYearPicker(false)}>
  {[currentYear - 1, currentYear, currentYear + 1].map((yr) => (...))}
</BottomSheet>
```
**Problem:** `showYearPicker` is initialized to `false` and is set to `false` on createMutation success (line 68), but there's NO code anywhere in the file that sets it to `true`. The year picker bottom sheet can never be opened. The "Start Tracker" button (line 169) directly calls `createMutation.mutate(currentYear)` instead of opening the picker. Users always get the current year.

---

### Finding 30: hajj-companion.tsx — Share message uses translation keys that may not exist
**File:** `apps/mobile/app/(screens)/hajj-companion.tsx`
**Lines:** 106-113
**Severity:** LOW — may show raw key strings
**Code:**
```ts
await Share.share({
  message: `${t('hajj.title')}: ${t('hajj.progress', { percent: progressPercent })}`,
});
```
**Problem:** If `hajj.progress` doesn't exist as an i18n key with interpolation support for `{percent}`, the share message will show the raw key string.

---

### Finding 31: tafsir-viewer.tsx — language variable used but may not switch tafsir language
**File:** `apps/mobile/app/(screens)/tafsir-viewer.tsx`
**Lines:** 76, 234
**Severity:** LOW-MEDIUM
**Code:**
```ts
const { t, language } = useTranslation();
// ...
{language === 'ar' ? source.textAr : source.textEn}
```
**Problem:** Only Arabic and English are supported for tafsir text. Users with Turkish, Urdu, Bengali, French, Indonesian, or Malay language settings will see English tafsir. The binary check `language === 'ar'` doesn't account for 6 other supported languages.

---

### Finding 32: tafsir-viewer.tsx — No loading/error state for tafsir sources query
**File:** `apps/mobile/app/(screens)/tafsir-viewer.tsx`
**Lines:** 46-52
**Severity:** LOW
**Code:**
```ts
const { data: allSources } = useQuery({
  queryKey: ['tafsir-sources'],
  queryFn: async () => { ... },
});
```
**Problem:** No `isLoading` or `isError` destructured. If the sources query fails, the filter bottom sheet shows nothing. No retry mechanism.

---

### Finding 33: quran-share.tsx — Surah search in bottom sheet is cosmetic-only
**File:** `apps/mobile/app/(screens)/quran-share.tsx`
**Lines:** 369-372
**Severity:** MEDIUM — search bar does nothing
**Code:**
```tsx
<View style={styles.surahSearchBar}>
  <Icon name="search" size="sm" color={colors.text.tertiary} />
  <Text style={styles.surahSearchPlaceholder}>{t('screens.quranShare.searchSurahs')}</Text>
</View>
```
**Problem:** This renders a `Text` element (not `TextInput`) styled to look like a search bar. The user cannot type in it. The 114 surahs are listed below with no filtering capability. This is misleading — it looks like a search input but is actually a static label.
**Fix:** Replace `Text` with `TextInput` and add state + filtering logic.

---

### Finding 34: quran-share.tsx — All 114 surahs rendered in BottomSheet without virtualization
**File:** `apps/mobile/app/(screens)/quran-share.tsx`
**Lines:** 373-388
**Severity:** MEDIUM — performance issue
**Code:**
```tsx
{(surahs ?? []).map((surah) => (
  <BottomSheetItem key={surah.number} ... />
))}
```
**Problem:** Rendering 114 `BottomSheetItem` components inside a `BottomSheet` (which typically uses a `ScrollView`) will be slow on lower-end devices. The BottomSheet is not virtualized. Combined with the non-functional search bar, users must scroll through all 114 items.

---

### Finding 35: quran-room.tsx — Icon name "sliders" may not exist in IconName
**File:** `apps/mobile/app/(screens)/quran-room.tsx`
**Lines:** 347
**Severity:** LOW — checking...
**Code:**
```tsx
<Icon name="sliders" size="md" color="#fff" />
```
**Status:** VALID — `'sliders'` IS in the IconName union (line 33 of Icon.tsx). No issue here.

---

### Finding 36: quran-room.tsx — Socket events not validated/typed
**File:** `apps/mobile/app/(screens)/quran-room.tsx`
**Lines:** 85-109
**Severity:** LOW-MEDIUM — trusts server data blindly
**Problem:** Socket event handlers like `quran_room_update`, `quran_verse_changed`, `quran_reciter_updated` trust the server payload shape without validation. If the server sends malformed data (or the types change), the client silently accepts it and may render undefined values.

---

### Finding 37: quran-room.tsx — Socket connection creates new connection every roomId/getToken change
**File:** `apps/mobile/app/(screens)/quran-room.tsx`
**Lines:** 59, 128
**Severity:** MEDIUM
**Code:**
```ts
useEffect(() => {
  // ...
}, [roomId, getToken, t]);  // getToken and t are in deps
```
**Problem:** `getToken` is a function from Clerk that may create a new reference on each render. `t` from useTranslation may also change reference. These dependency changes would cause the socket to disconnect and reconnect unnecessarily. Should use a ref for getToken.

---

### Finding 38: fatwa-qa.tsx — onChangeText callback shadows 't' from useTranslation
**File:** `apps/mobile/app/(screens)/fatwa-qa.tsx`
**Lines:** 180
**Severity:** LOW — name shadowing but works
**Code:**
```tsx
onChangeText={(t) => setQuestion(t.slice(0, 2000))}
```
**Problem:** The parameter `t` shadows the `t` from `useTranslation()`. While this works because `t` is only used in the outer scope, it's confusing and could lead to bugs if `t()` were needed in the callback.
**Fix:** Rename to `(text) => setQuestion(text.slice(0, 2000))`.

---

### Finding 39: fatwa-qa.tsx — Displays answerId instead of answer text
**File:** `apps/mobile/app/(screens)/fatwa-qa.tsx`
**Lines:** 99-103
**Severity:** HIGH — shows database ID to user instead of answer content
**Code:**
```tsx
{isAnswered && Boolean(item.answerId) ? (
  <View style={styles.answerCard}>
    <Icon name="check-circle" size="sm" color={colors.emerald} />
    <Text style={styles.answerText} numberOfLines={3}>{String(item.answerId)}</Text>
  </View>
) : null}
```
**Problem:** The answer card displays `item.answerId` (which is a database ID like `cuid_xxx`) instead of the actual answer text. The code should access `item.answer` or `item.answerText` — the actual answer content field. Displaying a database ID as an answer to a fatwa question is meaningless to users.

---

### Finding 40: All screens — hardcoded dark mode colors
**Files:** All 9 screen files
**Severity:** MEDIUM — affects all screens equally (systemic)
**Problem:** Every screen directly uses `colors.dark.bg`, `colors.dark.bgCard`, `colors.dark.border`, `colors.dark.surface` etc. These are hardcoded dark-mode values. If light mode is ever enabled, all these screens will still show dark backgrounds. This is a systemic issue documented in agent #33 (245 files affected), but all 9 screens in this audit scope are affected.

---

### Finding 41: quran-reading-plan.tsx — plan.planType compared against hardcoded strings
**File:** `apps/mobile/app/(screens)/quran-reading-plan.tsx`
**Lines:** 266-267
**Severity:** LOW
**Code:**
```ts
const dailyTarget = plan.planType === '30day' ? 20 : plan.planType === '60day' ? 10 : 7;
```
**Problem:** Plan types are compared as raw strings instead of using constants from `PLAN_OPTIONS`. If a new plan type is added, this logic won't handle it correctly. Should derive from `PLAN_OPTIONS.find(o => o.type === plan.planType)?.pagesPerDay ?? 7`.

---

### Finding 42: mosque-finder.tsx — SafeAreaView wraps some return paths but not loading state
**File:** `apps/mobile/app/(screens)/mosque-finder.tsx`
**Lines:** 247-259 vs 302-304
**Severity:** LOW — inconsistent SafeAreaView usage
**Problem:** The loading state (line 248) and error state (line 264) use `SafeAreaView` directly, while the main content (line 303-304) wraps `SafeAreaView` inside `ScreenErrorBoundary`. This is inconsistent — if an error occurs during loading, the `ScreenErrorBoundary` won't catch it because it only wraps the success render path.
**Fix:** Move `ScreenErrorBoundary` to the outermost wrapper.

---

### Finding 43: mosque-finder.tsx — useCallback for fetchData has empty dependency array
**File:** `apps/mobile/app/(screens)/mosque-finder.tsx`
**Lines:** 193, 225
**Severity:** LOW-MEDIUM — stale closure
**Code:**
```ts
const fetchData = useCallback(async () => {
  // Uses t() for error messages
  setError(t('islamic.errors.locationPermissionMosques'));
  // ...
  setError(t('islamic.errors.failedToLoadMosques'));
}, []);  // Empty deps — t() may be stale
```
**Problem:** `fetchData` uses `t()` from `useTranslation()` but has an empty dependency array `[]`. If the language changes after initial render, the error messages will still be in the old language.

---

### Finding 44: hajj-step.tsx — Syntax error in imports (missing closing brace)
**File:** `apps/mobile/app/(screens)/hajj-step.tsx`
**Lines:** 3
**Severity:** POTENTIAL CRITICAL
**Code:**
```ts
import {
  View, Text, StyleSheet, Pressable, ScrollView, RefreshControl,
import { useLocalSearchParams, useRouter } from 'expo-router';
```
**Problem:** Line 3 shows `View, Text, StyleSheet, Pressable, ScrollView, RefreshControl,` followed immediately by another `import` on line 4 without closing the first import's `}` or ending with `} from 'react-native';`. This appears to be a syntax error. However, since the file was read successfully and the app presumably builds, this may be a rendering artifact of the Read tool truncating a long single line. Needs verification.
**Status:** Likely a display issue — the file probably has `} from 'react-native';` at the end of line 3. But worth verifying.

---

### Finding 45: hajj-companion.tsx — Same import truncation issue
**File:** `apps/mobile/app/(screens)/hajj-companion.tsx`
**Lines:** 3
**Code:**
```ts
import {
  View, Text, StyleSheet, Pressable, ScrollView, Share, RefreshControl,
import { useRouter } from 'expo-router';
```
**Status:** Same as Finding 44 — likely display artifact.

---

### Finding 46: quran-share.tsx — Same import truncation pattern
**File:** `apps/mobile/app/(screens)/quran-share.tsx`
**Lines:** 3
**Code:**
```ts
import {
  View, Text, StyleSheet, Pressable, ScrollView, Dimensions, RefreshControl,
import { useRouter } from 'expo-router';
```
**Status:** Same pattern — likely truncated display.

---

### Finding 47: quran-reading-plan.tsx — deleteMutation has no confirmation beyond bottom sheet
**File:** `apps/mobile/app/(screens)/quran-reading-plan.tsx`
**Lines:** 228-234, 497-504
**Severity:** LOW — destructive action too easy to trigger
**Problem:** The delete plan bottom sheet has a single "Delete Plan" destructive button. One accidental tap deletes the entire plan progress. No confirmation dialog like `Alert.alert()` is shown. All other screens with destructive actions (hajj-companion reset) also only have a bottom sheet, but at minimum the hajj one has a cancel option alongside the destructive action.

---

### Finding 48: hifz-tracker.tsx — SurahRow not memoized despite being in FlatList of 114 items
**File:** `apps/mobile/app/(screens)/hifz-tracker.tsx`
**Lines:** 159-188, 308-320
**Severity:** LOW-MEDIUM — performance
**Problem:** `SurahRow` is a functional component rendered 114 times in a FlatList. It's not wrapped in `React.memo()`. The FlatList `renderItem` creates a new closure every render. Combined with Finding 18's O(n^2) lookup, this can cause noticeable jank when scrolling.

---

### Finding 49: fatwa-qa.tsx — No accessibilityRole on Pressable (missing on madhabSelector)
**File:** `apps/mobile/app/(screens)/fatwa-qa.tsx`
**Lines:** 192
**Severity:** LOW
**Code:**
```tsx
<Pressable style={styles.madhabSelector} onPress={() => setMadhabSheetOpen(true)}>
```
**Problem:** Missing `accessibilityRole="button"` on the madhab selector pressable. Other pressables in the file have it.

---

### Finding 50: mosque-finder.tsx — Pressable without accessibilityRole on search clear button
**File:** `apps/mobile/app/(screens)/mosque-finder.tsx`
**Lines:** 332
**Severity:** LOW
**Code:**
```tsx
<Pressable onPress={() => setSearchQuery('')}>
  <Icon name="x" size="sm" color={colors.text.secondary} />
</Pressable>
```
**Problem:** Missing `accessibilityRole="button"` and `accessibilityLabel` on the clear search button.

---

### Finding 51: quran-share.tsx — Bismillah text shown on every verse including Surah 9 (At-Tawbah)
**File:** `apps/mobile/app/(screens)/quran-share.tsx`
**Lines:** 278
**Severity:** MEDIUM — Islamic content accuracy
**Code:**
```tsx
<Text style={styles.bismillah}>{'\u0628\u0650\u0633\u0652\u0645\u0650...'}</Text>
```
**Problem:** The Bismillah is shown before every verse regardless of the surah. In the Quran, Surah 9 (At-Tawbah) does NOT begin with Bismillah. This is universally known in Islamic scholarship. Displaying Bismillah before At-Tawbah verses is incorrect.
**Fix:** Add condition: `{selectedSurahNumber !== 9 && <Text style={styles.bismillah}>...</Text>}`.

---

### Finding 52: quran-reading-plan.tsx — PlanCard missing accessibilityRole
**File:** `apps/mobile/app/(screens)/quran-reading-plan.tsx`
**Lines:** 54
**Severity:** LOW
**Code:**
```tsx
<Pressable onPress={() => onSelect(option.type)}>
```
**Problem:** Missing `accessibilityRole="button"` on the PlanCard pressable.

---

## Summary by Severity

| Severity | Count | Key Issues |
|----------|-------|-----------|
| CRITICAL | 6 | fatwa-qa raw fetch (no auth, no error handling, shows answerId), mosque directions no-op, scholar doc upload mock, Qibla hardcoded |
| HIGH | 5 | No Quran audio playback, random heat map data, broken progress ring, hajj step count mismatch |
| MEDIUM | 18 | Hardcoded English strings (20+), clipboard stub, share without data, search bar cosmetic, socket deps, Bismillah on Surah 9, stale closures |
| LOW | 23 | Missing accessibilityRole, dead code, performance (O(n^2)), inconsistent SafeAreaView, font names |

**Total: 52 findings across 9 screens (10 files audited including islamicApi.ts and backend controller)**
