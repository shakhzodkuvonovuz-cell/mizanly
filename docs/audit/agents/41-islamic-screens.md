# Agent #41 — Islamic Screens Deep Audit

**Scope:** 15 Islamic screens in `apps/mobile/app/(screens)/`
**Files audited:** prayer-times.tsx, zakat-calculator.tsx, ramadan-mode.tsx, fasting-tracker.tsx, dhikr-counter.tsx, dhikr-challenges.tsx, dhikr-challenge-detail.tsx, dua-collection.tsx, hadith.tsx, islamic-calendar.tsx, names-of-allah.tsx, hifz-tracker.tsx, morning-briefing.tsx, halal-finder.tsx, eid-cards.tsx
**Total findings: 62**

---

## CRITICAL — Ship Blockers (7)

### C01. prayer-times.tsx: SYNTAX ERROR — Missing closing brace in import
**File:** `apps/mobile/app/(screens)/prayer-times.tsx`
**Line:** 3
**Code:**
```tsx
import {
  View, Text, StyleSheet, Pressable, ScrollView, Dimensions, RefreshControl, Switch,
import { useRouter } from 'expo-router';
```
**Issue:** The `react-native` import statement is missing its closing `} from 'react-native';`. The import block on line 3 ends with a comma and immediately starts a new import statement. This is a **syntax error** that would prevent the entire screen from compiling. Likely a copy-paste or merge artifact.
**Severity:** P0 — Screen will not render at all.

### C02. zakat-calculator.tsx: Completely ignores backend Zakat API — hardcoded nisab values
**File:** `apps/mobile/app/(screens)/zakat-calculator.tsx`
**Lines:** 29-31
**Code:**
```tsx
const NISAB_GOLD = 5800;
const NISAB_SILVER = 490;
const ZAKAT_RATE = 0.025;
```
**Issue:** The backend has a full Zakat calculation API (`islamicApi.calculateZakat()`) with configurable gold/silver prices via env vars (`GOLD_PRICE_PER_GRAM`, `SILVER_PRICE_PER_GRAM`), multi-asset support, and proper nisab computation. This screen ignores all of it. The hardcoded $5,800 gold nisab and $490 silver nisab will be wrong whenever gold/silver prices change (they change daily). The nisab should be fetched from the backend or at minimum computed from current metal prices. Users could be told they owe no Zakat when they actually do, or vice versa — a **religious obligation miscalculation**.
**Severity:** P0 — Incorrect Islamic financial guidance.

### C03. ramadan-mode.tsx: 100% hardcoded data — no API calls whatsoever
**File:** `apps/mobile/app/(screens)/ramadan-mode.tsx`
**Lines:** 40-55, 212-220
**Code:**
```tsx
const RAMADAN_SCHEDULE: PrayerTime[] = [
  { name: 'screens.ramadanMode.suhoorEndsFajr', time: '5:23 AM', isHighlighted: true },
  { name: 'screens.ramadanMode.sunrise', time: '6:45 AM' },
  // ... all hardcoded times
];

const [currentDay, setCurrentDay] = useState(15);
const [iftarCountdown, setIftarCountdown] = useState('02:34:15');
const [suhoorCountdown, setSuhoorCountdown] = useState('08:12:44');
```
**Issue:** The entire Ramadan mode screen is a static UI mockup. Prayer times are hardcoded strings, the current Ramadan day is hardcoded to 15, countdowns are hardcoded strings that never count down, goals are local-only state that resets on unmount, and the fasting grid hardcodes 22 days as completed. The backend has `islamicApi.getRamadanInfo()` and `islamicApi.getPrayerTimes()` but neither is called. There is zero API integration. The `onRefresh` callback is a setTimeout fake: `setTimeout(() => setRefreshing(false), 1500)`.
**Severity:** P0 — Entire feature is non-functional.

### C04. ramadan-mode.tsx: Countdowns are static strings that never tick
**File:** `apps/mobile/app/(screens)/ramadan-mode.tsx`
**Lines:** 216-217
**Code:**
```tsx
const [iftarCountdown, setIftarCountdown] = useState('02:34:15');
const [suhoorCountdown, setSuhoorCountdown] = useState('08:12:44');
```
**Issue:** These are useState strings initialized to mock values. There is no `useEffect` with `setInterval` to update them. The CountdownDisplay component renders these static strings. Users see a frozen countdown that never changes.
**Severity:** P0 — Core Ramadan feature (knowing when to break fast) is broken.

### C05. ramadan-mode.tsx: Daily goals not persisted — reset on screen remount
**File:** `apps/mobile/app/(screens)/ramadan-mode.tsx`
**Lines:** 50-55, 213, 227-231
**Code:**
```tsx
const INITIAL_GOALS: DailyGoal[] = [
  { id: 'quran', icon: 'book-open', label: '...', completed: false },
  { id: 'dhikr', icon: 'circle', label: '...', completed: true },
  // ...
];
const [goals, setGoals] = useState<DailyGoal[]>(INITIAL_GOALS);
```
**Issue:** Goal state is local `useState` initialized from a hardcoded array. There's no API call to save/load goal completion. Every time the user leaves and returns to the screen, all goals reset. The `dhikr` goal starts as `completed: true` in the constant — so every session, the user sees dhikr already done.
**Severity:** P1 — User progress lost on every navigation.

### C06. dhikr-counter.tsx: Duplicate Pressable import — compile error
**File:** `apps/mobile/app/(screens)/dhikr-counter.tsx`
**Lines:** 8, 12
**Code:**
```tsx
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, Dimensions, Share,
  Alert,
  Pressable,
} from 'react-native';
```
**Issue:** `Pressable` is imported twice from `react-native`. This is a duplicate import that will cause a compile error or at minimum a linter error. The same pattern appears in dhikr-challenges.tsx (lines 8, 10) and hadith.tsx (lines 9, 11).
**Severity:** P0 — Compile error in 3 files.

### C07. dhikr-challenges.tsx: Duplicate Pressable import
**File:** `apps/mobile/app/(screens)/dhikr-challenges.tsx`
**Lines:** 8, 10
**Code:**
```tsx
import {
  View, Text, StyleSheet, FlatList, RefreshControl, Pressable, TextInput,
  Pressable,
} from 'react-native';
```
**Issue:** Same duplicate Pressable import as C06.
**Severity:** P0 — Compile error.

---

## HIGH — Functional Bugs (16)

### H01. zakat-calculator.tsx: Share button is a no-op
**File:** `apps/mobile/app/(screens)/zakat-calculator.tsx`
**Line:** 485
**Code:**
```tsx
<Pressable accessibilityRole="button" onPress={() => {}} style={styles.actionButtonHalf}>
```
**Issue:** The "Share" button on the Zakat result step has an empty `onPress={() => {}}`. It does nothing when tapped. Should use `Share.share()` with the calculation results.
**Severity:** P2 — Dead button visible to users.

### H02. zakat-calculator.tsx: onRefresh is a fake setTimeout — not connected to any data
**File:** `apps/mobile/app/(screens)/zakat-calculator.tsx`
**Lines:** 175-178
**Code:**
```tsx
const onRefresh = useCallback(() => {
  setRefreshing(true);
  setTimeout(() => setRefreshing(false), 1000);
}, []);
```
**Issue:** Pull-to-refresh spins for 1 second then stops. It doesn't refetch any data because there's nothing to refetch (all calculations are local). This is misleading UX.
**Severity:** P3 — Misleading but not harmful.

### H03. zakat-calculator.tsx: No input validation — NaN propagation
**File:** `apps/mobile/app/(screens)/zakat-calculator.tsx`
**Lines:** 180-187
**Code:**
```tsx
const totalAssets = useMemo(() => {
  return (
    parseFloat(assets.cash || '0') +
    parseFloat(assets.gold || '0') +
    ...
  );
}, [assets]);
```
**Issue:** `parseFloat` on user input can produce `NaN` if the user types non-numeric characters (e.g., "abc", "1.2.3"). `NaN` propagates through the calculation, and `formatCurrency(NaN)` displays `$NaN`. There's no input validation, no `isNaN` check, and the `keyboardType="decimal-pad"` doesn't prevent pasting non-numeric text.
**Severity:** P2 — Visible NaN in results.

### H04. zakat-calculator.tsx: Currency hardcoded to USD ($)
**File:** `apps/mobile/app/(screens)/zakat-calculator.tsx`
**Lines:** 101, 226-228
**Code:**
```tsx
prefix = '$',
const formatCurrency = (value: number) => {
  return `$${value.toLocaleString('en-US', ...)}`;
};
```
**Issue:** All currency display is hardcoded to US dollars. No support for user's local currency. The backend Zakat calculator has a `currency` field. Users in Malaysia (MYR), UAE (AED), UK (GBP), etc. will see their local-currency values prefixed with `$`.
**Severity:** P2 — Incorrect for non-US users (majority of target audience).

### H05. prayer-times.tsx: Qibla direction is hardcoded to 45 degrees
**File:** `apps/mobile/app/(screens)/prayer-times.tsx`
**Line:** 217
**Code:**
```tsx
const [qiblaDirection] = useState(45); // Degrees from North
```
**Issue:** The Qibla direction compass shows a static 45 degrees regardless of user location. The backend can compute actual Qibla bearing from coordinates, but this is never called. The `qiblaDirectionText` (line 473) also shows the hardcoded value: `{qiblaDirection}° from North` as a hardcoded English string (not i18n'd).
**Severity:** P1 — Qibla direction is wrong for every user not located where 45° happens to be correct.

### H06. prayer-times.tsx: "Change Location" button is a no-op
**File:** `apps/mobile/app/(screens)/prayer-times.tsx`
**Line:** 378
**Code:**
```tsx
<Pressable onPress={() => { /* Open location picker */ }}>
  <Text style={styles.changeLocation}>{t('common.change')}</Text>
</Pressable>
```
**Issue:** The "Change" button for location is an empty comment. Users cannot manually set their location, which is needed when location permission is denied or GPS is inaccurate.
**Severity:** P2 — No manual location override.

### H07. prayer-times.tsx: Loading/error states not wrapped in ScreenErrorBoundary
**File:** `apps/mobile/app/(screens)/prayer-times.tsx`
**Lines:** 296-349
**Code:**
```tsx
if (loading) {
  return (
    <SafeAreaView style={styles.container}>
      // No ScreenErrorBoundary wrapper
    </SafeAreaView>
  );
}
if (error) {
  return (
    <SafeAreaView style={styles.container}>
      // No ScreenErrorBoundary wrapper
    </SafeAreaView>
  );
}
```
**Issue:** The early return paths for loading and error states are not wrapped in `<ScreenErrorBoundary>`. If an error occurs during rendering of these states, the app will crash without recovery.
**Severity:** P2 — Crash risk.

### H08. hadith.tsx: Duplicate Pressable import
**File:** `apps/mobile/app/(screens)/hadith.tsx`
**Lines:** 9, 11
**Code:**
```tsx
import {
  View, Text, StyleSheet, FlatList, RefreshControl, Pressable, ScrollView,
  Dimensions,
  Pressable,
} from 'react-native';
```
**Issue:** Same duplicate Pressable import pattern.
**Severity:** P0 — Compile error.

### H09. hadith.tsx: Bookmark is client-only — not persisted to API
**File:** `apps/mobile/app/(screens)/hadith.tsx`
**Lines:** 127, 174-191
**Code:**
```tsx
const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
// ...
const handleBookmark = useCallback(() => {
  // Only updates local state, no API call
  setBookmarkedIds(prev => { ... });
  setCurrentHadith(prev => ({ ...prev!, isBookmarked: !prev!.isBookmarked }));
}, [...]);
```
**Issue:** Bookmarking a hadith only toggles local state. There's no `islamicApi.bookmarkHadith()` call. Bookmarks are lost on screen unmount. Additionally, `bookmarkedIds` is in the `fetchData` dependency array (line 163), so adding a bookmark triggers a full refetch.
**Severity:** P1 — Feature broken (bookmarks not saved).

### H10. hadith.tsx: Share and Copy are no-ops
**File:** `apps/mobile/app/(screens)/hadith.tsx`
**Lines:** 194-202
**Code:**
```tsx
const handleShare = useCallback(() => {
  haptic.light();
  // Mock share functionality
}, [haptic]);

const handleCopy = useCallback(() => {
  haptic.light();
  // Mock copy functionality
}, [haptic]);
```
**Issue:** Both share and copy buttons do nothing beyond haptic feedback. No `Share.share()` or `Clipboard.setString()` call.
**Severity:** P2 — Two dead buttons visible to users.

### H11. islamic-calendar.tsx: No RefreshControl on ScrollView
**File:** `apps/mobile/app/(screens)/islamic-calendar.tsx`
**Lines:** 301-304
**Code:**
```tsx
<ScrollView
  style={styles.scrollView}
  contentContainerStyle={styles.scrollContent}
  showsVerticalScrollIndicator={false}
>
```
**Issue:** Violates project rule: "ALL FlatLists/ScrollViews must have RefreshControl". This ScrollView has no `refreshControl` prop. Pull-to-refresh does nothing.
**Severity:** P2 — Rule violation; no refresh possible.

### H12. islamic-calendar.tsx: Quick link buttons are no-ops
**File:** `apps/mobile/app/(screens)/islamic-calendar.tsx`
**Lines:** 430-448
**Code:**
```tsx
<Pressable accessibilityRole="button" style={styles.quickLink}>
  // no onPress handler
  <Text style={styles.quickLinkText}>{t('screens.islamicCalendar.prayerTimes')}</Text>
</Pressable>

<Pressable accessibilityRole="button" style={styles.quickLink}>
  // no onPress handler
  <Text style={styles.quickLinkText}>{t('screens.islamicCalendar.quran')}</Text>
</Pressable>
```
**Issue:** Both "Prayer Times" and "Quran" quick-link buttons have no `onPress` handler. Tapping them does nothing. Should navigate to `prayer-times` and the Quran screen respectively.
**Severity:** P2 — Dead navigation buttons.

### H13. islamic-calendar.tsx: Eid al-Adha date is wrong (9 Dhul Hijjah instead of 10)
**File:** `apps/mobile/app/(screens)/islamic-calendar.tsx`
**Line:** 48
**Code:**
```tsx
{ day: 9, month: 11, name: 'screens.islamicCalendar.eidAlAdha', type: 'eid', description: '...' },
```
**Issue:** Eid al-Adha falls on **10 Dhul Hijjah**, not 9. Day 9 is the Day of Arafah (correctly listed on line 47). The event data shows Eid al-Adha as day 9, which is incorrect. This means the calendar will mark the wrong day as Eid al-Adha.
**Severity:** P1 — Incorrect Islamic date for a major holiday.

### H14. halal-finder.tsx: Uses `api.get` directly instead of `islamicApi`
**File:** `apps/mobile/app/(screens)/halal-finder.tsx`
**Lines:** 18, 131
**Code:**
```tsx
import { api } from '@/services/api';
// ...
api.get('/halal/restaurants', { params: { ... } })
```
**Issue:** This screen imports the raw `api` client and calls `/halal/restaurants` directly, bypassing `islamicApi` service. The endpoint path `/halal/restaurants` doesn't follow the `/islamic/` prefix pattern. If the backend uses `/islamic/halal/restaurants` (as with all other Islamic endpoints), this will 404.
**Severity:** P1 — Likely 404, restaurants never load.

### H15. halal-finder.tsx: Hardcoded English in EmptyState subtitle
**File:** `apps/mobile/app/(screens)/halal-finder.tsx`
**Lines:** 197-198
**Code:**
```tsx
subtitle={selectedCuisine
  ? `No ${selectedCuisine} restaurants found nearby`
  : 'No halal restaurants found nearby'}
```
**Issue:** Empty state subtitle is a hardcoded English string, not using `t()` i18n function. Will show English to Arabic/Turkish/Urdu users.
**Severity:** P2 — i18n violation.

### H16. eid-cards.tsx: No RefreshControl, no SafeAreaView, no edges
**File:** `apps/mobile/app/(screens)/eid-cards.tsx`
**Lines:** 52-72
**Code:**
```tsx
<View style={styles.container}>
  <GlassHeader title={t('eidCards.title')} showBack />
  <ScrollView contentContainerStyle={styles.scrollContent}>
```
**Issue:** The screen uses a bare `View` instead of `SafeAreaView`, has no `RefreshControl`, and the `GlassHeader` uses `showBack` (which may not be a valid prop — other screens use `leftAction`). Content may render under the status bar/notch.
**Severity:** P2 — Safe area violation; content clips on notched devices.

---

## MEDIUM — Data Integrity & Logic Issues (14)

### M01. zakat-calculator.tsx: Always uses silver nisab threshold
**File:** `apps/mobile/app/(screens)/zakat-calculator.tsx`
**Line:** 198
**Code:**
```tsx
const isAboveNisab = netWealth >= NISAB_SILVER;
```
**Issue:** The Zakat calculation always uses the silver nisab ($490) as the threshold, which is the more conservative interpretation. However, some madhabs (schools of jurisprudence) use gold nisab. There's no user preference for which nisab to use. Additionally, the UI shows both gold and silver nisab but only silver is used in calculation, which is confusing.
**Severity:** P2 — Potentially incorrect for users following gold-nisab madhab.

### M02. zakat-calculator.tsx: No gold weight input — asks for dollar value
**File:** `apps/mobile/app/(screens)/zakat-calculator.tsx`
**Lines:** 280-285
**Code:**
```tsx
<InputCard
  icon="layers"
  label={t('screens.zakatCalculator.goldAndSilver')}
  value={assets.gold}
  onChangeText={(v) => updateAsset('gold', v)}
/>
```
**Issue:** The "Gold & Silver" field takes a dollar value, not grams/ounces. For Zakat on gold, users need to know the current gold price to convert their holdings. The backend has gold price env vars but the mobile screen doesn't help users with this conversion.
**Severity:** P3 — Poor UX for gold/silver asset entry.

### M03. ramadan-mode.tsx: isIftarUrgent is hardcoded to true
**File:** `apps/mobile/app/(screens)/ramadan-mode.tsx`
**Line:** 220
**Code:**
```tsx
const isIftarUrgent = true; // Mock: less than 30 minutes
```
**Issue:** The "urgent" flag (which triggers visual gold glow on the iftar countdown) is permanently set to `true`. The iftar countdown card will always show in urgent mode regardless of actual time.
**Severity:** P3 — Misleading visual state.

### M04. ramadan-mode.tsx: Fasting grid hardcodes 22 completed days
**File:** `apps/mobile/app/(screens)/ramadan-mode.tsx`
**Lines:** 239-244
**Code:**
```tsx
const fastingGrid = useMemo(() => {
  return Array.from({ length: 30 }, (_, i) => ({
    day: i + 1,
    completed: i < 22, // First 22 days always "completed"
    isToday: i + 1 === currentDay,
  }));
}, [currentDay]);
```
**Issue:** The fasting tracker within Ramadan mode always shows the first 22 days as completed, regardless of user's actual fasting log. The summary text (line 362-363) also hardcodes `count: 22` and `count: 8`.
**Severity:** P2 — Displays fake data.

### M05. fasting-tracker.tsx: fontWeight used as string instead of fontFamily
**File:** `apps/mobile/app/(screens)/fasting-tracker.tsx`
**Lines:** 298, 316-317, 322, 337, 364, 375
**Code:**
```tsx
fontWeight: '700', // Should use fontFamily: fonts.bodyBold
fontWeight: '600', // Should use fontFamily: fonts.bodySemiBold
fontWeight: '800', // No corresponding font
```
**Issue:** Multiple styles use `fontWeight` string values instead of the project's `fonts.*` family names. This bypasses the loaded Google Fonts (DMSans) and may render with system font instead. The project convention is to use `fontFamily: fonts.bodyBold` for bold text.
**Severity:** P3 — Inconsistent font rendering.

### M06. dhikr-counter.tsx: Stats data mapping is fragile
**File:** `apps/mobile/app/(screens)/dhikr-counter.tsx`
**Lines:** 132-136
**Code:**
```tsx
const stats = {
  totalCount: statsData?.todayCount ?? 0,
  setsCompleted: statsData?.setsCompleted ?? 0,
  streak: statsData?.streak ?? 0,
};
```
**Issue:** The `stats` object maps `totalCount` from `statsData?.todayCount`, but later (line 409) displays `statsData?.totalCount ?? stats.totalCount`. This means the stat card shows `totalCount` from the API (all-time) while the local `stats.totalCount` tracks today's count. The naming confusion will lead to wrong numbers displayed.
**Severity:** P2 — Wrong stat displayed.

### M07. dhikr-counter.tsx: Session saved on both goal completion AND reset
**File:** `apps/mobile/app/(screens)/dhikr-counter.tsx`
**Lines:** 165-178, 211-231
**Code:**
```tsx
// On reset (line 167-173):
if (count > 0 && !sessionSavedRef.current) {
  saveSessionMutation.mutate({ phrase: selectedPhrase.id, count, target: DAILY_GOAL });
}

// On goal completion (line 216-223):
if (isComplete && !sessionSavedRef.current) {
  saveSessionMutation.mutate({ phrase: selectedPhrase.id, count, target: DAILY_GOAL });
}
```
**Issue:** If a user completes the goal (hits 33), the session is saved via the `useEffect`. Then if they hit reset, the `sessionSavedRef.current` is `true` so it won't double-save. However, the `selectPhrase` callback (line 180-194) has the same save-before-switch logic and doesn't check `sessionSavedRef`. If the user completes goal, then switches phrase, it saves again. This could result in double-counting.
**Severity:** P2 — Potential double session save.

### M08. dua-collection.tsx: Hardcoded English in EmptyState
**File:** `apps/mobile/app/(screens)/dua-collection.tsx`
**Lines:** 234-235
**Code:**
```tsx
subtitle={showBookmarked ? 'No bookmarked duas yet' : 'No duas found for this category'}
```
**Issue:** EmptyState subtitles are hardcoded English strings, not using `t()`.
**Severity:** P2 — i18n violation.

### M09. dua-collection.tsx: Share text always uses English translation
**File:** `apps/mobile/app/(screens)/dua-collection.tsx`
**Lines:** 152-154
**Code:**
```tsx
const handleShare = useCallback((dua: Dua) => {
  const text = `${dua.arabicText}\n\n${dua.transliteration}\n\n${dua.translation.en}\n\n...`;
```
**Issue:** The share handler always uses `dua.translation.en` regardless of user's locale. Should use `dua.translation[locale]` to share in the user's language.
**Severity:** P2 — Share always in English.

### M10. hadith.tsx: fetchData has bookmarkedIds in dependency array — infinite loop risk
**File:** `apps/mobile/app/(screens)/hadith.tsx`
**Line:** 163
**Code:**
```tsx
}, [bookmarkedIds]);
```
**Issue:** `fetchData` depends on `bookmarkedIds`. When user bookmarks a hadith, `bookmarkedIds` changes (new Set), which recreates `fetchData`, which triggers `useEffect` on line 165-167, which calls `fetchData()` again, which resets `hadiths` state. This causes a jarring full reload of the hadith list every time the user bookmarks.
**Severity:** P2 — UX degradation, potential infinite loop if API sets bookmark.

### M11. hadith.tsx: Non-null assertion on currentHadith
**File:** `apps/mobile/app/(screens)/hadith.tsx`
**Line:** 187
**Code:**
```tsx
setCurrentHadith(prev => ({ ...prev!, isBookmarked: !prev!.isBookmarked }));
```
**Issue:** Uses `!` non-null assertion. If `currentHadith` becomes null between the guard check (line 175) and this setState call (race condition), this will throw.
**Severity:** P3 — Unlikely crash risk.

### M12. islamic-calendar.tsx: Hijri month computation is approximate
**File:** `apps/mobile/app/(screens)/islamic-calendar.tsx`
**Lines:** 55-67
**Code:**
```tsx
function getStartDayOfHijriMonth(month: number, year: number): number {
  // Total days from Hijri epoch to start of given month/year
  // Each Hijri year ~ 354.36667 days, months alternate 30/29
  const yearsElapsed = year - 1;
  const leapYears = Math.floor((11 * yearsElapsed + 3) / 30);
  ...
}
```
**Issue:** The Hijri calendar computation uses a tabular/arithmetic approximation. The actual Islamic calendar is based on moon sighting and can differ by 1-2 days from computational methods. The comment acknowledges it's approximate but users may not realize the calendar could be off by a day or two. No disclaimer is shown.
**Severity:** P3 — Expected limitation but should be disclosed.

### M13. names-of-allah.tsx: loadLearned called on every render until loaded
**File:** `apps/mobile/app/(screens)/names-of-allah.tsx`
**Line:** 126
**Code:**
```tsx
if (!learnedLoaded) loadLearned();
```
**Issue:** This is called directly in the component body (not in useEffect). On every render before `learnedLoaded` becomes true, `loadLearned()` will be called. Since `loadLearned` is async and sets state, this could cause multiple concurrent calls and re-renders. Should be in a `useEffect`.
**Severity:** P2 — Multiple concurrent AsyncStorage reads on mount.

### M14. names-of-allah.tsx: Accessibility label is hardcoded English "Go back"
**File:** `apps/mobile/app/(screens)/names-of-allah.tsx`
**Line:** 197
**Code:**
```tsx
accessibilityLabel: 'Go back',
```
**Issue:** Hardcoded English accessibility label. Same issue in fasting-tracker.tsx (line 169), dua-collection.tsx (line 248), halal-finder.tsx (line 211), hifz-tracker.tsx (line 304), morning-briefing.tsx uses t() correctly.
**Severity:** P3 — Accessibility i18n violation.

---

## MEDIUM — Hardcoded Dark Mode Colors (8)

### D01. fasting-tracker.tsx: Hardcodes colors.dark.* throughout styles
**File:** `apps/mobile/app/(screens)/fasting-tracker.tsx`
**Lines:** 285-420 (multiple)
**Code:**
```tsx
backgroundColor: colors.dark.bg,
backgroundColor: colors.dark.bgCard,
backgroundColor: colors.dark.surface,
borderColor: colors.dark.border,
```
**Issue:** All 15 screens hardcode `colors.dark.*` values instead of using theme-responsive tokens. This means light mode will show dark mode colors. Per the theme audit (agent #33), this is an architectural issue across 244 files but is worth noting for each screen.
**Severity:** P3 — Dark mode only; known architectural issue.

### D02-D08. Same pattern in all other screens
All 15 audited screens hardcode `colors.dark.bg`, `colors.dark.bgCard`, `colors.dark.surface`, `colors.dark.border` in their StyleSheet. This affects: zakat-calculator.tsx, ramadan-mode.tsx, dhikr-counter.tsx, dhikr-challenges.tsx, dhikr-challenge-detail.tsx, dua-collection.tsx, hadith.tsx, islamic-calendar.tsx, names-of-allah.tsx, hifz-tracker.tsx, morning-briefing.tsx, halal-finder.tsx, eid-cards.tsx, prayer-times.tsx.
**Severity:** P3 — Systemic.

---

## MEDIUM — Missing Features & Stubs (10)

### F01. No Quran reader screen exists
**Issue:** There is no `quran-reader.tsx` or `quran.tsx` screen for actually reading the Quran. The backend has `islamicApi.listSurahs()`, `islamicApi.getSurahVerses()`, `islamicApi.getVerse()` with full Quran.com API integration (114 surahs, verse search, 4 reciters). But there's no screen to display Quran text. The hifz-tracker references surahs but only for memorization status, not reading. The quran-share and quran-room screens exist but are for sharing/group study, not reading.
**Severity:** P1 — Core Islamic feature entirely missing from mobile.

### F02. ramadan-mode.tsx: "Navigate to dhikr counter" button is a comment
**File:** `apps/mobile/app/(screens)/ramadan-mode.tsx`
**Lines:** 233-236
**Code:**
```tsx
const handleDhikrPress = useCallback(() => {
  haptic.light();
  // Navigate to dhikr counter
}, [haptic]);
```
**Issue:** The dhikr press handler has a comment but no actual navigation. The function is defined but never even used in the JSX — no button calls `handleDhikrPress`.
**Severity:** P3 — Dead code.

### F03. prayer-times.tsx: CALCULATION_METHODS constant is unused
**File:** `apps/mobile/app/(screens)/prayer-times.tsx`
**Lines:** 36-43
**Code:**
```tsx
const CALCULATION_METHODS = [
  'Muslim World League',
  'Islamic Society of North America (ISNA)',
  ...
];
```
**Issue:** This constant is defined but never used. The actual method picker uses `prayerMethods` from the API response (`islamicApi.getPrayerMethods()`). Dead code.
**Severity:** P3 — Dead code.

### F04. prayer-times.tsx: PrayerCard pulseAnim runs outside useEffect
**File:** `apps/mobile/app/(screens)/prayer-times.tsx`
**Lines:** 118-127
**Code:**
```tsx
function PrayerCard({ prayer, isCurrent, isNext, index }) {
  const pulseAnim = useSharedValue(1);

  if (isCurrent) {
    pulseAnim.value = withRepeat(
      withSequence(withTiming(1.02, { duration: 1000 }), withTiming(1, { duration: 1000 })),
      -1, true
    );
  }
```
**Issue:** The animation assignment happens directly in the render body, not inside `useEffect`. This runs on every render, restarting the animation each time. It should be in a `useEffect` with `[isCurrent]` dependency to start only when the prayer becomes current.
**Severity:** P2 — Animation restarts on every re-render.

### F05. prayer-times.tsx: fetchData in useEffect dependency causes infinite loop
**File:** `apps/mobile/app/(screens)/prayer-times.tsx`
**Lines:** 282, 289-291
**Code:**
```tsx
const fetchData = useCallback(async () => { ... }, [calculationMethod, refreshing]);
// ...
useEffect(() => {
  fetchData();
}, [fetchData]);
```
**Issue:** `fetchData` depends on `refreshing`. When `fetchData` runs, it sets `setRefreshing(false)` in `finally`, which changes `refreshing`, which recreates `fetchData`, which triggers the `useEffect` again. This creates an infinite loop of API calls. The `refreshing` should be removed from `fetchData`'s dependency array.
**Severity:** P1 — Infinite API call loop.

### F06. prayer-times.tsx: Qibla direction text is hardcoded English
**File:** `apps/mobile/app/(screens)/prayer-times.tsx`
**Line:** 473
**Code:**
```tsx
{qiblaDirection}° from North
```
**Issue:** Not using `t()` — hardcoded English string.
**Severity:** P2 — i18n violation.

### F07. halal-finder.tsx: iOS maps URL uses address string instead of coordinates
**File:** `apps/mobile/app/(screens)/halal-finder.tsx`
**Lines:** 149-153
**Code:**
```tsx
ios: `maps:0,0?q=${encodeURIComponent(restaurant.name)}&ll=${restaurant.address}`,
```
**Issue:** The `ll` parameter expects latitude,longitude coordinates (e.g., `ll=40.7,-74.0`) but passes the address string (e.g., `ll=123 Main St, Sydney`). This will fail to open the correct location in Apple Maps.
**Severity:** P1 — Directions broken on iOS.

### F08. eid-cards.tsx: GlassHeader uses `showBack` prop
**File:** `apps/mobile/app/(screens)/eid-cards.tsx`
**Line:** 55
**Code:**
```tsx
<GlassHeader title={t('eidCards.title')} showBack />
```
**Issue:** All other screens use `leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}`. The `showBack` prop may or may not exist on GlassHeader (it's not in the component quick reference in CLAUDE.md). If it doesn't exist, the back button won't render.
**Severity:** P2 — Back button may not render.

### F09. morning-briefing.tsx: Reflection text never sent to server
**File:** `apps/mobile/app/(screens)/morning-briefing.tsx`
**Lines:** 348-355
**Code:**
```tsx
onPress={() => {
  if (reflectionText.trim()) {
    handleCompleteTask('reflection');
  }
}}
```
**Issue:** The reflection text the user types is never sent to the API. `handleCompleteTask('reflection')` only sends the task type. The actual reflection content is lost.
**Severity:** P3 — User's written reflection is discarded.

### F10. dhikr-counter.tsx: Alert imported but never used
**File:** `apps/mobile/app/(screens)/dhikr-counter.tsx`
**Line:** 11
**Code:**
```tsx
import { ... Alert, Pressable, } from 'react-native';
```
**Issue:** `Alert` is imported but never used anywhere in the file. Dead import.
**Severity:** P3 — Dead import.

---

## LOW — Style & Quality Issues (7)

### S01. zakat-calculator.tsx: zakatDueValue uses hardcoded fontSize: 32
**File:** `apps/mobile/app/(screens)/zakat-calculator.tsx`
**Line:** 826
**Code:**
```tsx
zakatDueValue: {
  fontFamily: fonts.heading,
  fontSize: 32,
  color: colors.emerald,
},
```
**Issue:** Uses hardcoded `fontSize: 32` instead of `fontSize.xl` (24) or `fontSize['2xl']`. Minor style inconsistency.
**Severity:** P3 — Style inconsistency.

### S02. ramadan-mode.tsx: Hijri date is hardcoded Arabic string
**File:** `apps/mobile/app/(screens)/ramadan-mode.tsx`
**Line:** 288
**Code:**
```tsx
<Text style={styles.hijriDate}>١٥ رمضان ١٤٤٦</Text>
```
**Issue:** The Hijri date is hardcoded as "15 Ramadan 1446" in Arabic numerals. Should use `formatHijriDate()` from `@/utils/hijri` (which exists and is used in prayer-times.tsx and islamic-calendar.tsx).
**Severity:** P2 — Hardcoded date, always shows same date.

### S03. fasting-tracker.tsx: DAYS_OF_WEEK hardcoded English
**File:** `apps/mobile/app/(screens)/fasting-tracker.tsx`
**Line:** 19
**Code:**
```tsx
const DAYS_OF_WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
```
**Issue:** Day labels are hardcoded English abbreviations. Should use i18n keys like islamic-calendar.tsx does.
**Severity:** P2 — Not localized.

### S04. fasting-tracker.tsx: Month label always English
**File:** `apps/mobile/app/(screens)/fasting-tracker.tsx`
**Lines:** 149-153
**Code:**
```tsx
const monthLabel = useMemo(() => {
  const [year, month] = currentMonth.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}, [currentMonth]);
```
**Issue:** Hardcodes `'en-US'` locale for month display. Should use user's locale.
**Severity:** P2 — Not localized.

### S05. dhikr-counter.tsx: Hardcoded English in dhikr phrases
**File:** `apps/mobile/app/(screens)/dhikr-counter.tsx`
**Lines:** 38-44
**Code:**
```tsx
{ id: 'subhanallah', latin: 'SubhanAllah', arabic: 'سبحان الله', meaning: 'Glory be to Allah' },
```
**Issue:** The `meaning` field is hardcoded English. The rendering (line 75) uses `t()` for the meaning, so if the i18n key exists this is fine, but if it doesn't, the fallback would be the key string not the hardcoded English.
**Severity:** P3 — Minor, translations may cover it.

### S06. halal-finder.tsx: Default location is Mecca
**File:** `apps/mobile/app/(screens)/halal-finder.tsx`
**Lines:** 118, 126
**Code:**
```tsx
return { lat: 21.4225, lng: 39.8262 }; // Default: Mecca
const currentLocation = locationQuery.data || location || { lat: 21.4225, lng: 39.8262 };
```
**Issue:** When location permission is denied, the app defaults to Mecca coordinates. While culturally appropriate, users will see Mecca-area restaurants with no indication their location wasn't detected. Should show a message that location access is needed.
**Severity:** P3 — UX confusion when location denied.

### S07. hifz-tracker.tsx: 114 surah entries hardcoded in client
**File:** `apps/mobile/app/(screens)/hifz-tracker.tsx`
**Lines:** 22-137
**Issue:** The complete list of 114 surahs with names, Arabic names, and ayah counts is hardcoded as a ~115-line constant. While this data is static and correct, it adds ~4KB to the bundle. The backend has `islamicApi.listSurahs()` that could provide this data. However, since surah data truly never changes, this is a reasonable trade-off for offline support.
**Severity:** P3 — Acceptable but noted.

---

## Summary by Severity

| Severity | Count | Description |
|----------|-------|-------------|
| P0 | 5 | Compile errors (syntax, duplicate imports), entire Ramadan screen non-functional |
| P1 | 6 | Wrong Eid date, infinite loop, broken iOS directions, broken Qibla, missing Quran reader, bookmark not saved |
| P2 | 18 | Dead buttons, hardcoded English, wrong stats, fake data, NaN inputs, wrong currency |
| P3 | 33 | Style inconsistencies, dark mode hardcoding, dead code, minor UX issues |

## Top 5 Actionable Items

1. **Fix prayer-times.tsx syntax error** (line 3) — add `} from 'react-native';` closing
2. **Fix 3 duplicate Pressable imports** — dhikr-counter.tsx, dhikr-challenges.tsx, hadith.tsx
3. **Wire Ramadan mode to backend APIs** — replace all hardcoded data with `islamicApi.getRamadanInfo()` and `islamicApi.getPrayerTimes()`, add real countdown timers
4. **Wire Zakat calculator to backend API** — use `islamicApi.calculateZakat()` for dynamic nisab based on current gold/silver prices
5. **Fix Eid al-Adha date** — change day 9 to day 10 in islamic-calendar.tsx line 48
