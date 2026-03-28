# Mobile Architecture: Islamic Screens & Discovery/Search

## File Inventory

| Screen | File | Lines | Key Dependencies |
|--------|------|-------|-----------------|
| Prayer Times | `prayer-times.tsx` | ~1185 | expo-location, expo-sensors (Magnetometer), islamicApi, AsyncStorage (cache + per-prayer adhan prefs), formatHijriDate |
| Qibla Compass | `qibla-compass.tsx` | ~532 | expo-location, expo-sensors (Magnetometer), Reanimated (spring rotation) |
| Quran Room | `quran-room.tsx` | ~616 | socket.io-client, expo-av (Audio.Sound), islamicApi, Clerk auth |
| Quran Reading Plan | `quran-reading-plan.tsx` | ~722 | @tanstack/react-query (useQuery, useMutation), islamicApi |
| Hadith | `hadith.tsx` | ~559 | expo-clipboard, expo-av (Audio.Sound), islamicApi, Share |
| Dhikr Counter | `dhikr-counter.tsx` | ~751 | expo-av (Audio.Sound, generated WAV), @tanstack/react-query, islamicApi, Reanimated (pulse/shimmer) |
| Dua Collection | `dua-collection.tsx` | ~438 | expo-av (Audio.Sound), @tanstack/react-query, islamicApi, RTL utils |
| Names of Allah | `names-of-allah.tsx` | ~424 | AsyncStorage (learned set), @tanstack/react-query, islamicApi, expo-av (Audio.Sound) |
| Zakat Calculator | `zakat-calculator.tsx` | ~951 | @tanstack/react-query (live metal prices from backend), islamicApi, KeyboardAvoidingView |
| Ramadan Mode | `ramadan-mode.tsx` | ~792 | expo-location, @tanstack/react-query, islamicApi, 1-second countdown interval |
| Islamic Calendar | `islamic-calendar.tsx` | ~991 | eventsApi, gregorianToHijri, Hijri computation functions, BottomSheet (event detail) |
| Fasting Tracker | `fasting-tracker.tsx` | ~425 | @tanstack/react-query, islamicApi, RTL utils |
| Mosque Finder | `mosque-finder.tsx` | ~685 | expo-location, react-native-maps (MapView, Marker, PROVIDER_GOOGLE), islamicApi, Linking (directions) |
| Search | `search.tsx` | ~1020 | @tanstack/react-query (useQuery + 6 useInfiniteQuery), searchApi, feedApi, postsApi, AsyncStorage (search history), TabSelector, PostCard, ThreadCard |
| Discover | `discover.tsx` | ~779 | @tanstack/react-query (useQuery + useInfiniteQuery), searchApi, useScrollLinkedHeader, useAnimatedPress, expo-av (Video autoplay) |
| Hashtag [tag] | `hashtag/[tag].tsx` | ~290 | @tanstack/react-query (useInfiniteQuery), searchApi, AsyncStorage (followed hashtags), GradientButton |
| Notifications | `notifications.tsx` | ~614 | @tanstack/react-query (useInfiniteQuery, useMutation), notificationsApi, followsApi, SectionList, date-fns, Zustand store |

**Total lines: ~10,774 across 17 screens.**

---

## Islamic Screens Architecture

### prayer-times.tsx (~1185 lines)

**Purpose:** Full prayer times dashboard with live countdown, Qibla direction, calculation method picker, and adhan notification settings.

**API Integrations:**
- `islamicApi.getPrayerTimes(lat, lng, calculationMethod)` -- fetches times from backend
- `islamicApi.getPrayerMethods()` -- lists available calculation methods (MWL, ISNA, etc.)
- `islamicApi.getPrayerNotificationSettings()` -- user's DND/adhan preferences (useQuery)
- `islamicApi.updatePrayerNotificationSettings(data)` -- save preferences (useMutation)
- `Location.requestForegroundPermissionsAsync()` + `Location.getCurrentPositionAsync()`
- `Magnetometer.addListener()` -- live device heading for Qibla compass rotation

**Caching:**
- AsyncStorage key `cached-prayer-times` with 6-hour TTL (`CACHE_TTL_MS = 6 * 60 * 60 * 1000`)
- Cached object: `{ data, methods, timestamp, method }` -- allows instant display before network fetch
- Per-prayer adhan notification toggle persisted to `adhan-notify-{prayer.name}`

**UI Components:**
- `CountdownTimer` -- 1-second interval, formats HH:MM:SS to next prayer
- `PrayerCard` -- per-prayer row with gradient, pulse animation for current prayer, "now"/"next" badges, bell toggle
- `getSkyGradient(currentPrayerIndex)` -- 6 time-of-day sky gradients (Fajr=deep blue, Dhuhr=sky blue, Maghrib=sunset gold-purple, Isha=deep night)
- Compact Qibla card with live rotating arrow (`compassRotation = (qiblaDirection - deviceHeading + 360) % 360`)
- 4 BottomSheets: method picker, notification settings, adhan style picker (Makkah/Madinah/Al-Aqsa), reminder picker (0/5/10/15/30 min)

**Calculation Logic:**
- `PRAYER_NAMES = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']`
- `PRAYER_ARABIC = ['الفجر', 'الشروق', 'الظهر', 'العصر', 'المغرب', 'العشاء']`
- `getCurrentPrayerIndex(prayerList)` -- compares current time against prayer times, returns last prayer that has passed
- Qibla bearing computed with great-circle formula using Kaaba coordinates (21.4225, 39.8262)

**Cleanup:**
- Magnetometer subscription removed on unmount
- Countdown interval cleared on unmount
- `mounted` flag prevents state updates after unmount

---

### qibla-compass.tsx (~532 lines)

**Purpose:** Dedicated full-screen Qibla compass with animated rose, directional arrow, and alignment detection.

**Sensors:**
- `Magnetometer` from expo-sensors, update interval 100ms
- `Location.requestForegroundPermissionsAsync()` + `Location.getCurrentPositionAsync()`

**Math Functions:**
- `calculateQiblaBearing(lat, lng)` -- great-circle bearing to Kaaba (atan2-based)
- `calculateDistanceToKaaba(lat, lng)` -- Haversine formula, returns km (integer)
- `getHeadingFromMagnetometer(data)` -- converts x/y to heading degrees, iOS offset of -90 degrees
- `getCardinalDirection(degrees, t)` -- 8-direction compass (N, NE, E, SE, S, SW, W, NW), i18n'd

**Animation:**
- `compassRotation` -- shared value, spring-animated opposite to device heading
- `arrowRotation` -- shared value, spring-animated to `qiblaAngle - currentHeading`
- `alignedOpacity` -- fades in/out when within +/- 5 degrees
- Spring params: `{ damping: 20, stiffness: 90, mass: 1 }`

**Haptic Feedback:**
- `haptic.success()` when aligned, throttled to max once per 1000ms via `lastHapticRef`

**Visual Elements:**
- 72 tick marks (every 5 degrees), major ticks at 90-degree intervals
- Cardinal labels (N/E/S/W), N is emerald colored
- Gold gradient arrow head + shaft overlay
- Center Kaaba icon with emerald-to-gold gradient circle
- Alignment badge with check-circle icon

---

### quran-room.tsx (~616 lines)

**Purpose:** Real-time collaborative Quran reading room with synchronized verse display and audio playback.

**Socket.io Integration:**
- Connects to `SOCKET_URL` with Clerk JWT auth
- Events emitted: `join_quran_room`, `leave_quran_room`, `quran_verse_sync`
- Events listened: `quran_room_update`, `quran_verse_changed`, `quran_reciter_updated`, `connect`, `disconnect`, `connect_error`
- Reconnection: enabled, 10 attempts, 1000ms delay
- Token refresh on `connect_error` via `getTokenRef.current()`

**Audio Playback:**
- CDN: `https://cdn.islamic.network/quran/audio/128/ar.alafasy/{audioNumber}.mp3`
- `SURAH_OFFSETS` array (114 entries) for cumulative ayah index computation
- `getQuranAudioUrl(surah, ayah)` -- maps surah:ayah to CDN audio number
- Toggle behavior: tap play while playing stops audio
- `sound.setOnPlaybackStatusUpdate` to detect `didJustFinish` and auto-unload

**State:**
- `QuranRoomState`: hostId, currentSurah, currentVerse, reciterId, participantCount
- `verseText`: QuranVerse with arabic, translation, audioUrl fields
- Verse fetched via `islamicApi.getVerse(surah, verse)` on change

**Host Controls:**
- FAB button visible only when `roomState.hostId === currentUserId`
- BottomSheet with next/prev verse controls
- `emitVerseSync(surahNumber, verseNumber)` broadcasts to room

**Cleanup:**
- Socket disconnect + `leave_quran_room` emit on unmount
- Audio `soundRef.current?.unloadAsync()` on unmount
- Audio stops when verse changes

---

### quran-reading-plan.tsx (~722 lines)

**Purpose:** Quran reading plan management with progress tracking, heat map, and plan history.

**API Integrations:**
- `islamicApi.getActiveReadingPlan()` -- current active plan (useQuery)
- `islamicApi.getReadingPlanHistory()` -- completed plans (useQuery)
- `islamicApi.createReadingPlan(planType)` -- start new plan (useMutation)
- `islamicApi.updateReadingPlan(planId, data)` -- mark progress (useMutation)
- `islamicApi.deleteReadingPlan(planId)` -- delete plan (useMutation)

**Plan Options:**
- 30-day: 20 pages/day
- 60-day: 10 pages/day
- 90-day: 7 pages/day
- Total Quran: 604 pages, 30 juz

**UI Components:**
- `PlanCard` -- gradient card per plan option with start button
- `ProgressRing` -- circular progress (LinearGradient trick, emerald-to-gold), percentage center text
- `HeatMapRow` -- 30-day dot grid (3 states: empty, partial, on-track)
- `HistoryItem` -- completed plan card with date range
- Stats: Juz count + page count in side-by-side stat cards
- Daily target display

**Heat Map Logic:**
- Estimates reading consistency based on plan start date, current page, and expected pages per day
- 0 = before plan started, 1 = partial (>50% expected), 2 = on track (>= expected)

---

### hadith.tsx (~559 lines)

**Purpose:** Daily Hadith display with Arabic text, English translation, source attribution, bookmark, share, and copy actions.

**API Integrations:**
- `islamicApi.getDailyHadith()` -- today's hadith
- `islamicApi.listHadiths()` -- previous hadiths list
- `islamicApi.bookmarkHadith(hadithId)` -- optimistic bookmark with rollback on failure

**Data Model:**
```typescript
interface Hadith {
  id: string;
  arabic: string;
  english: string;
  source: string;
  narrator: string;
  date: string;
  isBookmarked: boolean;
}
```

**Actions:**
- Bookmark: optimistic UI update with spring scale animation (1 -> 1.1 -> 1), API rollback on failure
- Share: `Share.share()` with formatted Arabic + English + source + narrator + "Shared from Mizanly"
- Copy: `Clipboard.setStringAsync()` with showToast success
- Listen: placeholder toast ("Audio recitation coming soon")

**Audio Cleanup:** `soundRef.current?.unloadAsync()` on unmount (prepared for future audio)

---

### dhikr-counter.tsx (~751 lines)

**Purpose:** Interactive dhikr (remembrance) counter with tap-to-count, audio bead click, progress tracking, and session persistence.

**Preset Phrases (5):**
- SubhanAllah (سبحان الله)
- Alhamdulillah (الحمد لله)
- Allahu Akbar (الله أكبر)
- La ilaha illAllah (لا إله إلا الله)
- Astaghfirullah (أستغفر الله)

**Audio Generation:**
- `generateBeadClickWav(hz=800, durationMs=50, sampleRate=22050)` -- generates WAV in-memory
- Sine wave with 20% fade-in/out envelope for clean click
- Returns base64-encoded data URI, cached in module-level `_beadClickUri`
- Played via `Audio.Sound.createAsync({ uri }, { shouldPlay: true })`, auto-unloaded on finish

**Counter Mechanics:**
- `DAILY_GOAL = 33` per set
- Tap: haptic.tick() + playBeadClick() + increment count
- Pulse animation: `withSequence(withSpring(1.05), withSpring(1))`
- Progress bar: spring-animated width percentage
- Completion: haptic.success() + save session + gold shimmer overlay animation

**Session Persistence:**
- `islamicApi.saveDhikrSession({ phrase, count, target })` on completion or phrase switch
- `islamicApi.getDhikrStats()` returns todayCount, setsCompleted, streak
- `sessionSavedRef` prevents double-save

**Stats Display:** 3 StatCards (total counts, sets done, day streak) with `formatCount()`

---

### dua-collection.tsx (~438 lines)

**Purpose:** Browsable dua (supplication) collection with categories, daily dua, bookmarks, and share.

**API Integrations:**
- `islamicApi.getDuaCategories()` -- category list (useQuery)
- `islamicApi.getDuas(category?)` -- filtered dua list (useQuery, key includes selectedCategory)
- `islamicApi.getDuaOfTheDay()` -- featured dua (useQuery)
- `islamicApi.getBookmarkedDuas()` -- saved duas (useQuery, enabled only when showBookmarked=true)
- `islamicApi.bookmarkDua(duaId)` -- toggle bookmark (useMutation)

**Categories (16 with icons):**
morning, evening, sleep, waking, eating, travel, anxiety, illness, gratitude, forgiveness, protection, rain, mosque, parents, ramadan, general

**Dua Card Layout:**
- Arabic text (right-aligned, arabic font)
- Transliteration (emerald, italic)
- Translation (locale-aware: `dua.translation[language]` with en fallback)
- Source reference
- Action row: Listen, Bookmark, Share (with RTL flex direction)

**RTL Support:** Uses `rtlFlexRow(isRTL)` and `rtlTextAlign(isRTL)` for layout direction

---

### names-of-allah.tsx (~424 lines)

**Purpose:** 99 Names of Allah with learn/track progress, expandable explanations, Quran references, and sharing.

**Data Model:**
```typescript
interface NameOfAllah {
  number: number;
  arabic: string;
  arabicName?: string;
  transliteration: string;
  meaning: string;
  englishMeaning?: string;
  explanation?: string;
  quranRef?: string;
}
```

**Learned Tracking:**
- AsyncStorage key `mizanly_learned_names`, stores JSON array of learned numbers
- Progress bar: `learnedCount / 99 * 100%`
- Cards with emerald border when learned, check-circle badge

**Features:**
- Daily Name of Allah card (gold border, large arabic text, centered)
- Expandable name cards: tap toggles explanation + Quran ref + actions
- Staggered entrance: `FadeInUp.delay(Math.min(index, 15) * 40)` -- capped at 15 items
- Listen action: placeholder toast ("Audio pronunciation coming soon")
- Share: native Share API with formatted text

---

### zakat-calculator.tsx (~951 lines)

**Purpose:** 3-step Zakat calculation wizard with live metal prices, Nisab threshold comparison, and educational notes.

**Calculation Constants:**
- `FALLBACK_GOLD_PRICE_PER_GRAM = 92` (USD)
- `FALLBACK_SILVER_PRICE_PER_GRAM = 1.05` (USD)
- `ZAKAT_RATE = 0.025` (2.5%)
- `NISAB_GOLD_GRAMS = 87.48`
- `NISAB_SILVER_GRAMS = 612.36`

**Live Metal Prices:**
- `islamicApi.calculateZakat({ cash: 0, gold: 0, silver: 0, investments: 0, debts: 0 })` -- fetches current goldPricePerGram, silverPricePerGram from backend
- `staleTime: 1000 * 60 * 60` (1 hour cache)
- Falls back to hardcoded prices if API fails

**3-Step Wizard:**
1. **Assets** (5 inputs): Cash/Bank, Gold/Silver, Investments/Stocks, Business Inventory, Property for Rent/Sale
2. **Deductions** (2 inputs): Outstanding Debts, Immediate Expenses
3. **Result**: Net wealth, Nisab comparison (gold vs silver, uses lower), Zakat due or "below Nisab" message

**UI Components:**
- `StepIndicator` -- 3-dot progress with gradient (emerald active, muted inactive), connector lines
- `InputCard` -- gradient card with icon, label, $ prefix, TextInput, focus glow animation
- Result card with gold left-border accent
- Educational note card with book-open icon
- Action buttons: Recalculate + Share

**Nisab Display:** Shows both gold and silver Nisab values, gold price per gram from API, ActivityIndicator during load

---

### ramadan-mode.tsx (~792 lines)

**Purpose:** Comprehensive Ramadan dashboard with live countdowns, prayer schedule, fasting tracker, and daily goals.

**API Integrations:**
- `islamicApi.getRamadanInfo()` -- currentDay, totalDays, daysFasted
- `islamicApi.getPrayerTimes(lat, lng)` -- for countdown calculation
- `islamicApi.completeDailyTask(id)` -- persist goal completion
- `Location.requestForegroundPermissionsAsync()` + `Location.getCurrentPositionAsync()`

**Live Countdowns:**
- 1-second interval computing time to Maghrib (iftar) and Fajr (suhoor end)
- `isIftarUrgent` flag when < 30 minutes remaining
- Urgent state: gold glow shadow, gold text color, pulse animation

**Schedule (7 items, hardcoded times):**
- Suhoor Ends (Fajr), Sunrise, Dhuhr, Asr, Iftar (Maghrib), Isha, Taraweeh
- Highlighted items: Suhoor, Iftar, Taraweeh
- "Now" badge for current prayer

**Fasting Grid:**
- 30-day (or totalDays) visual grid, 6 columns
- States: completed (emerald gradient), today (gold border), future (muted gradient)
- Summary: days fasted count + days remaining

**Daily Goals (4):**
- Read Quran, Dhikr, Sadaqah, Taraweeh
- Checkbox-style toggle with gradient fill, line-through on complete

**Hijri Date:** `formatHijriDate(new Date(), 'ar')` in hero card

---

### islamic-calendar.tsx (~991 lines)

**Purpose:** Full Islamic (Hijri) calendar with month navigation, event highlighting, community events, and date conversion.

**Hijri Computation (client-side):**
- `gregorianToHijri(date)` from `@/utils/hijri`
- `getStartDayOfHijriMonth(month, year)` -- approximation using Kuwaiti algorithm cycle (total days since epoch, modulo 7)
- `getDaysInHijriMonth(month, year)` -- odd months 30 days, even 29, month 12 leap year 30
- `generateDaysInMonth(month, year, todayHijri)` -- builds calendar grid with empty leading slots
- Disclaimer text: "approximate" computation shown to user

**Islamic Events (9 hardcoded with i18n keys):**
1. Islamic New Year (1 Muharram)
2. Day of Ashura (10 Muharram)
3. Mawlid al-Nabi (12 Rabi al-Awwal)
4. Isra and Mi'raj (27 Rajab)
5. First Day of Ramadan (1 Ramadan)
6. Laylat al-Qadr (27 Ramadan)
7. Eid al-Fitr (1 Shawwal)
8. Day of Arafah (9 Dhul Hijjah)
9. Eid al-Adha (10 Dhul Hijjah)

**Community Events:**
- `eventsApi.list(undefined, 10)` -- fetches from backend (useQuery, 5-min staleTime)
- Each event navigates to `/(screens)/event-detail?id={id}`

**Visual Elements:**
- Hero card: emerald-to-gold gradient, Hijri date, "Today" label, Gregorian date, decorative crescent (CSS circle overlay)
- Calendar grid: 7-column, today=gradient cell, event=bordered cell, eid=gold border
- Event cards: icon (star for eid, flag for important), name, date, badge
- Legend: Today (emerald), Eid (gold), Important (emerald 50% opacity)
- Quick links: Prayer Times, Quran

**Event Detail:** BottomSheet with icon, name, date, description

---

### fasting-tracker.tsx (~425 lines)

**Purpose:** Daily fasting log with calendar view, streak tracking, and Sunnah fast information.

**API Integrations:**
- `islamicApi.getFastingStats()` -- currentStreak, totalDays
- `islamicApi.getFastingLog(currentMonth)` -- per-month log entries
- `islamicApi.logFast({ date, isFasting, fastType })` -- record today's fast (useMutation)

**Calendar Grid:**
- Month navigation (prev/next)
- 7-column grid with color coding: green=fasting, red=missed, transparent=future, gold border=today
- Day labels i18n'd via `fasting.day{Mon,Tue,...}` keys

**Today's Prompt:**
- Shows "Are you fasting?" card with Yes/No buttons when no log exists for today
- Shows status badge when logged

**Fast Types:** ramadan, monday, thursday, ayyam-al-bid, arafat, ashura, qada, nafl

**Stats Row:** Streak, Total This Year, Makeup Needed (3 cards)

**Sunnah Section:** Monday/Thursday fasting + White Days (13/14/15 of each Hijri month)

---

### mosque-finder.tsx (~685 lines)

**Purpose:** Nearby mosque discovery with real map, search, prayer times, facilities, and directions.

**API Integrations:**
- `Location.requestForegroundPermissionsAsync()` + `Location.getCurrentPositionAsync()`
- `islamicApi.getMosques(lat, lng, radius=10)` -- fetches nearby mosques
- Native Maps: `MapView` from react-native-maps with `PROVIDER_GOOGLE` on Android

**Map Integration:**
- 220px height, rounded corners
- Shows user location (`showsUserLocation`)
- Emerald-colored markers for each mosque
- Marker description: `{distance} · {nextPrayer} {nextPrayerTime}`

**Mosque Card:**
- Name + address, distance badge (km or m), next prayer badge (gold)
- Facility badges: parking, wheelchair, womens, wudu, school, library, cafe
- Directions button: opens native maps app via `Linking.openURL()` (iOS Maps, Android Geo intent, web Google Maps)

**Qibla Card (footer):**
- Qibla bearing computed from user location
- Arrow indicator with emerald-to-gold gradient circle

**Computation Functions:**
- `computeQiblaBearing(lat, lng)` -- returns `{ degrees, direction }`
- `computeNextPrayer(prayerTimes)` -- iterates PRAYER_ORDER, finds next by current time
- `computeNextPrayerTime(prayerTimes)` -- returns 12-hour formatted string

**Search:** Local filter on mosque name/address (no API call)

---

## Discovery & Search Screens Architecture

### search.tsx (~1020 lines)

**Purpose:** Universal search across 7 content types with debounced input, search history, trending section, and explore grid.

**7 Search Tabs:** people, hashtags, posts, threads, reels, videos, channels

**Query Architecture (8 separate queries):**
1. `searchApi.search(query)` -- main search (useQuery, enabled when query >= 2 chars)
2. `searchApi.trending()` -- trending hashtags (useQuery, enabled when no query)
3. `searchApi.search(query, 'posts', cursor)` -- posts tab (useInfiniteQuery)
4. `searchApi.search(query, 'threads', cursor)` -- threads tab (useInfiniteQuery)
5. `searchApi.search(query, 'reels', cursor)` -- reels tab (useInfiniteQuery)
6. `searchApi.search(query, 'videos', cursor)` -- videos tab (useInfiniteQuery)
7. `searchApi.search(query, 'channels', cursor)` -- channels tab (useInfiniteQuery)
8. `feedApi.getTrending(cursor)` -- explore grid when no query (useInfiniteQuery)

**Each content-type FlatList has:** `removeClippedSubviews={true}`, `windowSize={7}`, `maxToRenderPerBatch={8}` for performance.

**Debounce:** 400ms timeout via `debounceRef` (useRef), clears on new input or unmount.

**Search History:**
- AsyncStorage key `search-history`, max 20 entries
- Shown when input focused + empty query
- Delete individual items or clear all
- Tap history item populates query

**3 View States:**
1. **Searching** (query >= 2): TabSelector + content-type-specific FlatList
2. **History** (focused + empty query): recent searches list
3. **Explore** (unfocused + empty query): 3-column image grid from `feedApi.getTrending()` OR trending hashtags list

**Memoized Components:** `UserRow`, `VideoRow`, `ChannelRow` wrapped in `memo()` with `useMemo` for styles.

**RTL Support:** Throughout -- `rtlFlexRow(isRTL)`, `rtlTextAlign(isRTL)`, `rtlArrow(isRTL, 'back')` for back button.

---

### discover.tsx (~779 lines)

**Purpose:** Instagram Explore-style discovery feed with categories, featured carousel, trending hashtags, and masonry grid.

**API Integrations:**
- `searchApi.trending()` -- trending hashtags (useQuery)
- `searchApi.getExploreFeed(cursor, category?)` -- explore content (useInfiniteQuery with category filter)

**8 Category Pills:**
all, trending, food, fashion, sports, tech, islamic, art (each with icon)

**Featured Section:**
- Horizontal ScrollView with snap-to-interval (`FEATURED_WIDTH + spacing.md`)
- Featured items extracted from first 5 explore items with media
- Cards: ProgressiveImage, gradient overlay, title, creator avatar/name, view count

**Masonry Grid Pattern:**
- 3-column grid with Instagram-like feature pattern
- `isFeatureIndex(index)` -- every 3rd row has one featured (taller) item
- Featured position rotates: left (col 0), right (col 2), center (col 1)
- `FEATURE_HEIGHT = 270`, `STANDARD_HEIGHT = 180`

**Auto-playing Video:**
- `ExploreGridItem` detects reels/videos, renders `ExpoVideo` with `shouldPlay`, `isLooping`, `isMuted`
- Prefers HLS URL (`hlsUrl`) over direct URL for streaming efficiency

**Quick Links:** Hashtag Explore + Series Discover (row of 2 buttons)

**Scroll-linked Header:** `useScrollLinkedHeader` for elastic collapse + blur effect.

**Performance:** `removeClippedSubviews={true}`, staggered entrance animations capped at 15 items.

---

### hashtag/[tag].tsx (~290 lines)

**Purpose:** Hashtag detail page with post count, follow toggle, and 3-column post grid.

**API:** `searchApi.hashtagPosts(tag, cursor)` via useInfiniteQuery with cursor pagination.

**Header Card:**
- Glassmorphism gradient card with hash icon, tag name (xl font), post count (gold)
- GradientButton follow toggle (primary/secondary variant)
- Follow state persisted to AsyncStorage key `followed-hashtags` (JSON array)

**Grid:**
- 3-column grid, `GRID_ITEM = (SCREEN_W - 2) / 3`
- `GridItem`: ProgressiveImage for media posts, text preview for text-only posts
- Carousel badge (layers icon) for multi-image posts
- Staggered entrance: `FadeInUp.delay(index * 50)`

---

### notifications.tsx (~614 lines)

**Purpose:** Notification center with date grouping, like aggregation, follow-back actions, and content thumbnails.

**API Integrations:**
- `notificationsApi.get(filter?, cursor?)` -- paginated notifications (useInfiniteQuery)
- `notificationsApi.markRead(id)` -- mark single read (useMutation)
- `notificationsApi.markAllRead()` -- mark all read (useMutation)
- `followsApi.follow(userId)` -- follow back (useMutation)
- `followsApi.acceptRequest(requestId)` / `followsApi.declineRequest(requestId)` -- follow request actions

**3 Filter Tabs:** all, mentions, verified

**Like Aggregation:**
- `aggregateLikes(items)` -- groups consecutive LIKE notifications for same postId
- Stacked avatars (up to 3) with "+N others" text
- Example: "Alice, Bob and 5 others liked your post"

**Date Grouping:**
- `groupByDate(items, labels)` -- groups into Today, Yesterday, This Week, Earlier
- Rendered via SectionList with sticky headers

**Notification Routing:**
- `notificationTarget(n)` -- resolves to deep link based on postId/threadId/reelId/videoId/conversationId/actor.username
- Content thumbnail on right side for LIKE/COMMENT/MENTION on posts/reels/videos

**Visual Elements:**
- Unread: emerald-tinted row + 4px emerald accent bar (left/start side)
- Icon overlay on avatar: colored circle with type-specific icon (heart=like, message=comment, user=follow, at-sign=mention)
- Follow-back button (emerald pill) for FOLLOW type
- Accept/Decline buttons for FOLLOW_REQUEST type

**Zustand Integration:** `useStore.setUnreadNotifications(0)` on mark-all-read

---

## Common Islamic API Service Pattern

All Islamic screens use `islamicApi` from `@/services/islamicApi`. Common patterns:

1. **Data fetching:** `useQuery` for read operations, `useMutation` for writes, both from `@tanstack/react-query`
2. **Error handling:** EmptyState with retry action, error state variable
3. **Loading:** Skeleton components (Skeleton.Rect, Skeleton.Circle, Skeleton.PostCard)
4. **Refresh:** BrandedRefreshControl on all scrollable content
5. **Audio cleanup:** All screens with Audio.Sound use `useEffect(() => { return () => { soundRef.current?.unloadAsync(); }; }, [])` pattern
6. **Haptics:** useContextualHaptic() for tick/success/navigate/save/send/delete contextual feedback
7. **i18n:** useTranslation() with `t()` function, RTL layout utilities
8. **Theme:** useThemeColors() returning `tc` object, createStyles(tc) pattern for dynamic theme styles

## Key Shared Dependencies

| Dependency | Used In |
|-----------|---------|
| `expo-location` | prayer-times, qibla-compass, ramadan-mode, mosque-finder |
| `expo-sensors` (Magnetometer) | prayer-times, qibla-compass |
| `expo-av` (Audio.Sound) | quran-room, hadith, dhikr-counter, dua-collection, names-of-allah |
| `socket.io-client` | quran-room |
| `react-native-maps` | mosque-finder |
| `@tanstack/react-query` | all screens except qibla-compass |
| `AsyncStorage` | prayer-times (cache), names-of-allah (learned), search (history), hashtag (followed), dhikr (implicitly via API), fasting-tracker, notifications |
| `expo-linear-gradient` | all screens |
| `react-native-reanimated` | all screens |

## Islamic Calculation Constants

| Constant | Value | Used In |
|----------|-------|---------|
| Kaaba Latitude | 21.4225 | prayer-times, qibla-compass, mosque-finder |
| Kaaba Longitude | 39.8262 | prayer-times, qibla-compass, mosque-finder |
| Nisab Gold (grams) | 87.48 | zakat-calculator |
| Nisab Silver (grams) | 612.36 | zakat-calculator |
| Zakat Rate | 2.5% | zakat-calculator |
| Daily Dhikr Goal | 33 | dhikr-counter |
| Quran Total Pages | 604 | quran-reading-plan |
| Quran Total Juz | 30 | quran-reading-plan |
| Prayer Times Cache TTL | 6 hours | prayer-times |
