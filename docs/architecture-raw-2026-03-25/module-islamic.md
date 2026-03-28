# Islamic Mega-Module — Complete Architecture Reference

> **Scope:** `apps/api/src/modules/islamic/` — the largest single module in Mizanly
> **66 endpoints** across 13 functional domains
> **Source files:** 6,410 lines TypeScript + 1,458 lines JSON data
> **16 Prisma models**, 7 enums, 6 static data files

---

## Table of Contents

1. [Module Structure & File Inventory](#1-module-structure--file-inventory)
2. [All 66 Endpoints — Complete Reference](#2-all-66-endpoints--complete-reference)
3. [Prayer Calculation System](#3-prayer-calculation-system)
4. [Quran Text, Verses & Audio](#4-quran-text-verses--audio)
5. [Hadith Collection](#5-hadith-collection)
6. [Dhikr Social System](#6-dhikr-social-system)
7. [Fasting Tracker](#7-fasting-tracker)
8. [Dua Collection](#8-dua-collection)
9. [99 Names of Allah](#9-99-names-of-allah)
10. [Hifz (Memorization) Tracker](#10-hifz-memorization-tracker)
11. [Hajj Guide & Progress](#11-hajj-guide--progress)
12. [Zakat Calculator](#12-zakat-calculator)
13. [Ramadan Info](#13-ramadan-info)
14. [Scholar Verification & Content Filter](#14-scholar-verification--content-filter)
15. [Daily Briefing & Daily Tasks](#15-daily-briefing--daily-tasks)
16. [Tafsir System](#16-tafsir-system)
17. [Charity / Sadaqah](#17-charity--sadaqah)
18. [Islamic Notifications Service](#18-islamic-notifications-service)
19. [Static Data Files](#19-static-data-files)
20. [Prisma Models & Enums](#20-prisma-models--enums)
21. [DTOs — Complete Reference](#21-dtos--complete-reference)
22. [External APIs & Caching Strategy](#22-external-apis--caching-strategy)

---

## 1. Module Structure & File Inventory

### Source Files

| File | Lines | Purpose |
|------|-------|---------|
| `islamic.controller.ts` | 761 | 66 REST endpoints, 7 inline DTOs |
| `islamic.service.ts` | 1,839 | All business logic, 50+ methods |
| `islamic-notifications.service.ts` | 266 | Prayer DND, Jummah reminders, Ramadan mode, content curation |
| `prayer-calculator.ts` | 305 | Solar angle computation, Hijri calendar, Ramadan dates |
| `quran-metadata.ts` | 154 | 114 surah metadata array, ayah offsets, juz mapping |
| `islamic.module.ts` | 10 | NestJS module definition |

### DTO Files

| File | Lines | DTOs Defined |
|------|-------|-------------|
| `dto/prayer-notification.dto.ts` | 9 | `UpdatePrayerNotificationDto` |
| `dto/quran-plan.dto.ts` | 12 | `CreateQuranPlanDto`, `UpdateQuranPlanDto` |
| `dto/charity.dto.ts` | 16 | `CreateCampaignDto`, `CreateDonationDto` |
| `dto/hajj.dto.ts` | 12 | `CreateHajjProgressDto`, `UpdateHajjProgressDto` |
| `dto/scholar-verification.dto.ts` | 24 | `ApplyScholarVerificationDto` |
| `dto/content-filter.dto.ts` | 24 | `UpdateContentFilterDto` |
| `dto/dhikr.dto.ts` | 19 | `SaveDhikrSessionDto`, `CreateDhikrChallengeDto`, `ContributeDhikrDto` |

### Inline DTOs (defined in controller.ts)

| Class | Lines | Fields |
|-------|-------|--------|
| `LogFastDto` | L41-46 | `date`, `isFasting`, `fastType?`, `reason?` |
| `UpdateHifzStatusDto` | L48-50 | `status` (NOT_STARTED/IN_PROGRESS/MEMORIZED/NEEDS_REVIEW) |
| `CompleteDailyTaskDto` | L52-54 | `taskType` (DHIKR/QURAN/REFLECTION) |
| `PrayerTimesQueryDto` | L56-72 | `lat`, `lng`, `method?`, `date?` |
| `MosquesQueryDto` | L74-86 | `lat`, `lng`, `radius?` |
| `ZakatCalculationQueryDto` | L88-108 | `cash`, `gold`, `silver`, `investments`, `debts` |
| `RamadanInfoQueryDto` | L110-122 | `year?`, `lat?`, `lng?` |

### Static Data Files

| File | Lines | Entries | Content |
|------|-------|---------|---------|
| `data/hadiths.json` | 481 | 200 hadiths | Nawawi 40 + extensions; fields: id, arabic, english, source, narrator, chapter |
| `data/duas.json` | 374 | 100 duas | 37 categories; fields: id, category, arabicText, transliteration, translation (8 langs), source, sourceRef |
| `data/asma-ul-husna.json` | 101 | 99 names | fields: number, arabicName, transliteration, englishMeaning, explanation, quranRef? |
| `data/tafsir.json` | 396 | 28 entries | Surah 1 (7 verses), Surah 2:255 (Ayatul Kursi), etc.; sources: Ibn Kathir, Al-Tabari, Al-Qurtubi |
| `data/hajj-guide.json` | 65 | 7 steps | Ihram, Tawaf, Sa'i, Mina, Arafat, Muzdalifah, Rami+Final; each has name, nameAr, description, descriptionAr, duas[], checklist[] |
| `__mocks__/data/hadiths.json` | 41 | (test mock) | Subset of hadiths for unit tests |

### Test Files

| File | Lines | Purpose |
|------|-------|---------|
| `islamic.controller.spec.ts` | 402 | Controller endpoint tests |
| `islamic.service.spec.ts` | 1,968 | Full service method tests |
| `islamic.service.edge.spec.ts` | 159 | Edge case tests |
| `islamic.service.recovery.spec.ts` | 126 | API failure recovery tests |
| `islamic-notifications.service.spec.ts` | 195 | Notification service tests |
| `prayer-calculator.spec.ts` | 109 | Prayer calculation algorithm tests |

### Dependencies

```typescript
// islamic.service.ts constructor
constructor(
  private readonly prisma: PrismaService,       // Database
  @Inject('REDIS') private readonly redis: Redis, // Cache
  private readonly config: ConfigService,         // Env vars (gold/silver prices)
)

// islamic-notifications.service.ts constructor
constructor(
  private prisma: PrismaService,
  @Inject('REDIS') private redis: Redis,
)
```

### Module Definition (islamic.module.ts, L1-10)

```typescript
@Module({
  controllers: [IslamicController],
  providers: [IslamicService, IslamicNotificationsService],
  exports: [IslamicService, IslamicNotificationsService],
})
export class IslamicModule {}
```

---

## 2. All 66 Endpoints — Complete Reference

Controller-level defaults (L124-127):
- **Tag:** `Islamic`
- **Rate limit:** 30 requests / 60 seconds (default)
- **Guard:** `OptionalClerkAuthGuard` (allows unauthenticated access; authenticated users get userId populated)

### Prayer Times (5 endpoints)

| # | Method | Path | Auth | Rate Limit | Controller Line | Service Method | Response |
|---|--------|------|------|-----------|-----------------|----------------|----------|
| 1 | GET | `/islamic/prayer-times` | Optional | 30/min | L131-141 | `getPrayerTimes()` | `PrayerTimesResponse` (date, timings{fajr,sunrise,dhuhr,asr,maghrib,isha}, method, location) |
| 2 | GET | `/islamic/prayer-times/methods` | Optional | 30/min | L143-148 | `getPrayerMethods()` | `CalculationMethod[]` (5 methods) |
| 3 | GET | `/islamic/prayer-times/current-window` | Optional | 30/min | L547-562 | `getCurrentPrayerWindow()` | `{currentPrayer, nextPrayer, minutesUntilNext}` |
| 4 | GET | `/islamic/prayer-notifications/settings` | **Required** | 30/min | L205-211 | `getPrayerNotificationSettings()` | `PrayerNotificationSetting` model |
| 5 | PATCH | `/islamic/prayer-notifications/settings` | **Required** | 30/min | L213-222 | `updatePrayerNotificationSettings()` | Updated `PrayerNotificationSetting` |

### Hadith (3 endpoints)

| # | Method | Path | Auth | Rate Limit | Controller Line | Service Method | Response |
|---|--------|------|------|-----------|-----------------|----------------|----------|
| 6 | GET | `/islamic/hadith/daily` | Optional | 30/min | L150-155 | `getDailyHadith()` | `Hadith` (rotates daily by day-of-year % 200) |
| 7 | GET | `/islamic/hadith/:id` | Optional | 30/min | L157-164 | `getHadithById()` | `Hadith` or 404 |
| 8 | GET | `/islamic/hadith` | Optional | 30/min | L166-172 | `getHadiths()` | `{data: Hadith[], cursor?, hasMore}` paginated (20/page) |

### Mosques (1 endpoint)

| # | Method | Path | Auth | Rate Limit | Controller Line | Service Method | Response |
|---|--------|------|------|-----------|-----------------|----------------|----------|
| 9 | GET | `/islamic/mosques` | Optional | 30/min | L174-179 | `getNearbyMosques()` | `Mosque[]` (up to 50, sorted by distance) |

### Zakat (1 endpoint)

| # | Method | Path | Auth | Rate Limit | Controller Line | Service Method | Response |
|---|--------|------|------|-----------|-----------------|----------------|----------|
| 10 | GET | `/islamic/zakat/calculate` | Optional | 30/min | L181-192 | `calculateZakat()` | `ZakatCalculationResponse` |

### Ramadan (1 endpoint)

| # | Method | Path | Auth | Rate Limit | Controller Line | Service Method | Response |
|---|--------|------|------|-----------|-----------------|----------------|----------|
| 11 | GET | `/islamic/ramadan` | Optional | 30/min | L194-203 | `getRamadanInfo()` | `RamadanInfoResponse` |

### Quran Reading Plans (5 endpoints)

| # | Method | Path | Auth | Rate Limit | Controller Line | Service Method | Response |
|---|--------|------|------|-----------|-----------------|----------------|----------|
| 12 | POST | `/islamic/quran-plans` | **Required** | **5/min** | L226-236 | `createReadingPlan()` | `QuranReadingPlan` |
| 13 | GET | `/islamic/quran-plans/active` | **Required** | 30/min | L238-244 | `getActiveReadingPlan()` | `QuranReadingPlan` or null |
| 14 | GET | `/islamic/quran-plans/history` | **Required** | 30/min | L246-256 | `getReadingPlanHistory()` | `{data: QuranReadingPlan[], meta: {hasMore, cursor}}` |
| 15 | PATCH | `/islamic/quran-plans/:id` | **Required** | 30/min | L258-268 | `updateReadingPlan()` | Updated `QuranReadingPlan` |
| 16 | DELETE | `/islamic/quran-plans/:id` | **Required** | 30/min | L270-279 | `deleteReadingPlan()` | Deleted plan |

### Quran Text (7 endpoints)

| # | Method | Path | Auth | Rate Limit | Controller Line | Service Method | Response |
|---|--------|------|------|-----------|-----------------|----------------|----------|
| 17 | GET | `/islamic/quran/chapters` | Optional | 30/min | L283-287 | `getQuranChapters()` | `SurahMetadata[]` (114 entries) |
| 18 | GET | `/islamic/quran/chapters/:surahNumber` | Optional | 30/min | L289-294 | `getQuranChapter()` | `SurahMetadata` or 404 |
| 19 | GET | `/islamic/quran/chapters/:surahNumber/verses` | Optional | 30/min | L296-305 | `getQuranVerses()` | `{surah, verses[]}` with Arabic + translation |
| 20 | GET | `/islamic/quran/chapters/:surahNumber/verses/:ayahNumber` | Optional | 30/min | L307-318 | `getQuranVerse()` | `{surah, verse, audioUrl}` |
| 21 | GET | `/islamic/quran/juz/:juzNumber` | Optional | 30/min | L320-329 | `getQuranJuz()` | `{juz, verses[]}` (up to 300 verses per juz) |
| 22 | GET | `/islamic/quran/search` | Optional | 30/min | L331-342 | `searchQuran()` | `{results[], total}` |
| 23 | GET | `/islamic/quran/random-ayah` | Optional | 30/min | L344-349 | `getRandomAyah()` | Random verse with Arabic, translation, audioUrl |

### Charity / Sadaqah (5 endpoints)

| # | Method | Path | Auth | Rate Limit | Controller Line | Service Method | Response |
|---|--------|------|------|-----------|-----------------|----------------|----------|
| 24 | POST | `/islamic/charity/campaigns` | **Required** | **5/min** | L352-360 | `createCampaign()` | `CharityCampaign` |
| 25 | GET | `/islamic/charity/campaigns` | Optional | 30/min | L362-366 | `listCampaigns()` | `{data: CharityCampaign[], meta: {hasMore, cursor}}` |
| 26 | GET | `/islamic/charity/campaigns/:id` | Optional | 30/min | L368-372 | `getCampaign()` | `CharityCampaign` or 404 |
| 27 | POST | `/islamic/charity/donate` | **Required** | **5/min** | L374-381 | `createDonation()` | `CharityDonation` (status: 'pending') |
| 28 | GET | `/islamic/charity/my-donations` | **Required** | 30/min | L383-389 | `getMyDonations()` | `{data: CharityDonation[], meta: {hasMore, cursor}}` |

### Hajj & Umrah (4 endpoints)

| # | Method | Path | Auth | Rate Limit | Controller Line | Service Method | Response |
|---|--------|------|------|-----------|-----------------|----------------|----------|
| 29 | GET | `/islamic/hajj/guide` | Optional | 30/min | L392-397 | `getHajjGuide()` | 7-step guide JSON array |
| 30 | GET | `/islamic/hajj/progress` | **Required** | 30/min | L399-405 | `getHajjProgress()` | `HajjProgress` or null |
| 31 | POST | `/islamic/hajj/progress` | **Required** | 30/min | L407-413 | `createHajjProgress()` | `HajjProgress` (unique per user+year) |
| 32 | PATCH | `/islamic/hajj/progress/:id` | **Required** | 30/min | L415-425 | `updateHajjProgress()` | Updated `HajjProgress` |

### Tafsir (2 endpoints)

| # | Method | Path | Auth | Rate Limit | Controller Line | Service Method | Response |
|---|--------|------|------|-----------|-----------------|----------------|----------|
| 33 | GET | `/islamic/tafsir/sources` | Optional | 30/min | L429-433 | `getTafsirSources()` | `[{name}]` — unique tafsir source names |
| 34 | GET | `/islamic/tafsir/:surah/:verse` | Optional | 30/min | L435-443 | `getTafsir()` | `TafsirEntry` or 404 |

### Scholar Verification (2 endpoints)

| # | Method | Path | Auth | Rate Limit | Controller Line | Service Method | Response |
|---|--------|------|------|-----------|-----------------|----------------|----------|
| 35 | POST | `/islamic/scholar-verification/apply` | **Required** | **1/day** (86400s) | L447-454 | `applyScholarVerification()` | `ScholarVerification` |
| 36 | GET | `/islamic/scholar-verification/status` | **Required** | 30/min | L456-462 | `getScholarVerificationStatus()` | `ScholarVerification` or null |

### Content Filter (2 endpoints)

| # | Method | Path | Auth | Rate Limit | Controller Line | Service Method | Response |
|---|--------|------|------|-----------|-----------------|----------------|----------|
| 37 | GET | `/islamic/content-filter/settings` | **Required** | 30/min | L466-472 | `getContentFilterSettings()` | `ContentFilterSetting` (auto-creates with defaults) |
| 38 | PATCH | `/islamic/content-filter/settings` | **Required** | 30/min | L474-480 | `updateContentFilterSettings()` | Updated `ContentFilterSetting` |

### Dhikr Social (7 endpoints)

| # | Method | Path | Auth | Rate Limit | Controller Line | Service Method | Response |
|---|--------|------|------|-----------|-----------------|----------------|----------|
| 39 | POST | `/islamic/dhikr/sessions` | **Required** | 30/min | L484-490 | `saveDhikrSession()` | `DhikrSession` |
| 40 | GET | `/islamic/dhikr/stats` | **Required** | 30/min | L492-498 | `getDhikrStats()` | `{totalCount, todayCount, streak, setsCompleted}` |
| 41 | GET | `/islamic/dhikr/leaderboard` | Optional | 30/min | L500-504 | `getDhikrLeaderboard()` | Top 20 users with counts (period: day/week) |
| 42 | POST | `/islamic/dhikr/challenges` | **Required** | **5/min** | L506-513 | `createDhikrChallenge()` | `DhikrChallenge` |
| 43 | GET | `/islamic/dhikr/challenges` | Optional | 30/min | L515-519 | `listActiveChallenges()` | `{data: DhikrChallenge[], meta: {hasMore, cursor}}` |
| 44 | GET | `/islamic/dhikr/challenges/:id` | Optional | 30/min | L521-525 | `getChallengeDetail()` | Challenge + topContributors[] |
| 45 | POST | `/islamic/dhikr/challenges/:id/join` | **Required** | 30/min | L527-533 | `joinChallenge()` | `{joined: true}` |
| 46 | POST | `/islamic/dhikr/challenges/:id/contribute` | **Required** | 30/min | L535-541 | `contributeToChallenge()` | `{contributed: count}` |

### Fasting Tracker (3 endpoints)

| # | Method | Path | Auth | Rate Limit | Controller Line | Service Method | Response |
|---|--------|------|------|-----------|-----------------|----------------|----------|
| 47 | POST | `/islamic/fasting/log` | **Required** | 30/min | L568-578 | `logFast()` | `FastingLog` (upsert by user+date) |
| 48 | GET | `/islamic/fasting/log` | **Required** | 30/min | L580-590 | `getFastingLog()` | `FastingLog[]` for a month (YYYY-MM) |
| 49 | GET | `/islamic/fasting/stats` | **Required** | 30/min | L592-598 | `getFastingStats()` | `{totalFastsThisYear, currentStreak, makeupNeeded}` |

### Dua Collection (6 endpoints)

| # | Method | Path | Auth | Rate Limit | Controller Line | Service Method | Response |
|---|--------|------|------|-----------|-----------------|----------------|----------|
| 50 | GET | `/islamic/duas` | Optional | 30/min | L604-609 | `getDuasByCategory()` | `DuaEntry[]` (optionally filtered) |
| 51 | GET | `/islamic/duas/daily` | Optional | 30/min | L611-615 | `getDuaOfTheDay()` | `DuaEntry` (deterministic daily rotation) |
| 52 | GET | `/islamic/duas/categories` | Optional | 30/min | L617-621 | `getDuaCategories()` | `string[]` (37 categories) |
| 53 | GET | `/islamic/duas/bookmarked` | **Required** | 30/min | L623-629 | `getBookmarkedDuas()` | `DuaEntry[]` |
| 54 | GET | `/islamic/duas/:id` | Optional | 30/min | L631-637 | `getDuaById()` | `DuaEntry` or 404 |
| 55 | POST | `/islamic/duas/:id/bookmark` | **Required** | 30/min | L639-646 | `bookmarkDua()` | `DuaBookmark` (idempotent) |
| 56 | DELETE | `/islamic/duas/:id/bookmark` | **Required** | 30/min | L648-655 | `unbookmarkDua()` | `{removed: true}` (idempotent) |

### Names of Allah (3 endpoints)

| # | Method | Path | Auth | Rate Limit | Controller Line | Service Method | Response |
|---|--------|------|------|-----------|-----------------|----------------|----------|
| 57 | GET | `/islamic/names-of-allah` | Optional | 30/min | L661-665 | `getAllNamesOfAllah()` | `NameOfAllah[]` (99 entries) |
| 58 | GET | `/islamic/names-of-allah/daily` | Optional | 30/min | L667-671 | `getDailyNameOfAllah()` | `NameOfAllah` (daysSinceEpoch % 99) |
| 59 | GET | `/islamic/names-of-allah/:number` | Optional | 30/min | L673-679 | `getNameOfAllahByNumber()` | `NameOfAllah` or 404 |

### Hifz (Quran Memorization) Tracker (4 endpoints)

| # | Method | Path | Auth | Rate Limit | Controller Line | Service Method | Response |
|---|--------|------|------|-----------|-----------------|----------------|----------|
| 60 | GET | `/islamic/hifz/progress` | **Required** | 30/min | L685-691 | `getHifzProgress()` | Array of 114 surahs with status |
| 61 | PATCH | `/islamic/hifz/progress/:surahNum` | **Required** | 30/min | L693-703 | `updateHifzProgress()` | Updated `HifzProgress` (upsert) |
| 62 | GET | `/islamic/hifz/stats` | **Required** | 30/min | L705-711 | `getHifzStats()` | `{memorized, inProgress, needsReview, notStarted, percentage}` |
| 63 | GET | `/islamic/hifz/review-schedule` | **Required** | 30/min | L713-719 | `getHifzReviewSchedule()` | Up to 10 surahs needing review (7-day threshold) |

### Daily Briefing & Tasks (3 endpoints)

| # | Method | Path | Auth | Rate Limit | Controller Line | Service Method | Response |
|---|--------|------|------|-----------|-----------------|----------------|----------|
| 64 | GET | `/islamic/daily-briefing` | **Required** | 30/min | L725-741 | `getDailyBriefing()` | Composite: hijriDate, prayerTimes, hadith, ayah, dua, dhikr, tasks |
| 65 | POST | `/islamic/daily-tasks/complete` | **Required** | 30/min | L743-753 | `completeDailyTask()` | `{taskType, completed, allTasksComplete, bonusXPAwarded}` |
| 66 | GET | `/islamic/daily-tasks/today` | **Required** | 30/min | L755-761 | `getDailyTasksToday()` | `{tasks: [{type, completed}], totalCompleted, allComplete}` |

### Endpoint Summary by Auth Requirement

| Auth Level | Count | Endpoints |
|-----------|-------|-----------|
| Optional (public) | 30 | Prayer times, hadith, mosques, zakat, ramadan, quran text, quran search, dois, names of allah, dhikr leaderboard, challenges list, charity campaigns, hajj guide, tafsir |
| Required (ClerkAuthGuard) | 36 | All personal data: settings, plans, progress, donations, bookmarks, sessions, tasks, briefing, scholar verification |

### Endpoint Summary by Custom Rate Limit

| Rate Limit | Count | Endpoints |
|-----------|-------|-----------|
| 5/min | 4 | Create reading plan, create campaign, create donation, create dhikr challenge |
| 1/day (86400s) | 1 | Scholar verification apply |
| 30/min (default) | 61 | All other endpoints |

---

## 3. Prayer Calculation System

### Architecture

Three-tier fallback:
1. **Redis cache** (24h TTL for API results, 1h for local calc)
2. **Aladhan API** (free, no key) — `https://api.aladhan.com/v1/timings/{timestamp}`
3. **Local solar angle computation** (`prayer-calculator.ts`)

### Service Method: `getPrayerTimes()` (L196-289)

```
Input: { lat, lng, method?, date? }
Validation: lat [-90,90], lng [-180,180]
Cache key: prayer:{lat.toFixed(2)}:{lng.toFixed(2)}:{date}:{method}

Flow:
1. Check Redis cache
2. Try Aladhan API (8s timeout, AbortController)
   - Map method ID to Aladhan number: MWL->3, ISNA->2, Egypt->5, Makkah->4, Karachi->1, Tehran->7, JAKIM->11, DIYANET->13
   - Clean timezone annotations from response: regex /\s*\(.*\)/
   - Cache for 86400s (24h)
3. Fallback: calculatePrayerTimes() local computation
   - Cache for 3600s (1h) — less reliable
```

### Prayer Calculator (prayer-calculator.ts, 305 lines)

**16 calculation methods** defined in `METHOD_PARAMS` (L25-52):

| Method ID | Fajr Angle | Isha Angle | Isha Minutes | Asr Factor | Description |
|-----------|-----------|-----------|-------------|-----------|-------------|
| 0 | 16 | 14 | — | 1 | Shia Ithna-Ansari |
| 1 / Karachi | 18 | 18 | — | **2** (Hanafi) | University of Karachi |
| 2 / ISNA | 15 | 15 | — | 1 | Islamic Society of North America |
| 3 / MWL | 18 | 17 | — | 1 | Muslim World League (DEFAULT) |
| 4 / Makkah | 18.5 | — | 90 | 1 | Umm al-Qura University |
| 5 / Egypt | 19.5 | 17.5 | — | 1 | Egyptian General Authority |
| 7 / Tehran | 17.7 | 14 | — | 1 | Institute of Geophysics |
| 8 | 19.5 | — | 90 | 1 | Gulf region |
| 9 | 18 | 17.5 | — | 1 | Kuwait |
| 10 | 18 | — | 90 | 1 | Qatar |
| 11 / JAKIM | 20 | 18 | — | 1 | Singapore / Malaysia |
| 12 | 12 | 12 | — | 1 | France |
| 13 / DIYANET | 18 | 17 | — | 1 | Turkey Diyanet |
| 14 | 16 | 15 | — | 1 | Russia |
| 15 | 18 | 18 | — | 1 | Moonsighting Committee |

**Asr Factor:** 1 = Shafi'i (shadow = object + noon shadow), 2 = Hanafi (shadow = 2*object + noon shadow)

**Core Computation** (`calculatePrayerTimes()`, L145-207):

```
1. Julian Day from Gregorian date
2. Solar position (declination, equation of time) — Jean Meeus simplified formulas
3. Solar noon = 12 + (-lng/15) - equationOfTime
4. Sunrise/Sunset = noon -/+ hourAngle(lat, declination, -0.833)  [atmospheric refraction]
5. Fajr = noon - hourAngle(lat, declination, -fajrAngle)
6. Dhuhr = noon + 1/60  [1-minute safety margin]
7. Asr = noon + asrHourAngle(lat, declination, asrFactor)
8. Maghrib = sunset
9. Isha = maghrib + ishaMinutes/60  OR  noon + hourAngle(lat, declination, -ishaAngle)
10. Imsak = fajr - 10/60  [10 minutes before Fajr]
11. Midnight = sunset + (sunrise + 24 - sunset) / 2
```

**Polar handling:** (L111-113)
- `cosHA > 1` → sun doesn't reach angle (polar) → returns 0
- `cosHA < -1` → midnight sun → returns 12

### Hijri Calendar (Kuwaiti Algorithm)

Used in three places:
- `prayer-calculator.ts` → `gregorianToHijriSimple()` (L276-305) — for Ramadan date calculation
- `islamic-notifications.service.ts` → `getHijriDate()` (L244-265) — for Ramadan mode, Islamic periods
- `islamic.service.ts` → `computeHijriDateString()` (L1797-1820) — for daily briefing display

All three implementations are identical: Kuwaiti algorithm converting Julian Day to Hijri year/month/day.

### Ramadan Date Calculation

`getRamadanDatesForYear()` (prayer-calculator.ts L213-263):
- Scans Feb-May of the Gregorian year
- Converts each date to Hijri using `gregorianToHijriSimple()`
- Finds first day of Hijri month 9 (Ramadan) and first day of Hijri month 10 (Shawwal)
- Ramadan ends = day before Shawwal 1
- Fallback: if Feb-May fails, scans entire year
- Final fallback: approximate March 1-30

### Available Calculation Methods (exposed via `getPrayerMethods()`, L162-193)

5 methods exposed to API consumers:
1. **MWL** — Muslim World League (Fajr 18, Isha 17, Standard Asr)
2. **ISNA** — Islamic Society of North America (Fajr 15, Isha 15, Standard Asr)
3. **Egypt** — Egyptian General Authority of Survey (Fajr 19.5, Isha 17.5, Standard Asr)
4. **Makkah** — Umm al-Qura University (Fajr 18.5, Isha 90min, Standard Asr)
5. **Karachi** — University of Islamic Sciences (Fajr 18, Isha 18, **Hanafi** Asr)

### Prayer Window Detection (`getCurrentPrayerWindow()`, L1519-1556)

Takes `{fajr, dhuhr, asr, maghrib, isha}` time strings, converts to minutes since midnight, returns:
- `currentPrayer` — which prayer window we're in (based on current time >= prayer time)
- `nextPrayer` — next upcoming prayer
- `minutesUntilNext` — minutes until next prayer (wraps at midnight via `% 1440`)

---

## 4. Quran Text, Verses & Audio

### External API: Quran.com v4

Base URL: `https://api.quran.com/api/v4/`

### Translation IDs

| Language | Quran.com ID | Translator |
|----------|-------------|-----------|
| en | 131 | Dr. Mustafa Khattab (The Clear Quran) |
| ar | 0 | Arabic only (no translation) |
| tr | 77 | Diyanet |
| ur | 97 | Fateh Muhammad Jalandhry |
| bn | 161 | Muhiuddin Khan |
| fr | 136 | Muhammad Hamidullah |
| id | 33 | Indonesian Ministry of Religious Affairs |
| ms | 39 | Abdullah Muhammad Basmeih |

### Surah Metadata (quran-metadata.ts)

`SURAH_METADATA: SurahMetadata[]` — 114 entries, each with:
- `number` (1-114)
- `nameArabic` (e.g., 'الفاتحة')
- `nameEnglish` (e.g., 'The Opening')
- `nameTransliteration` (e.g., 'Al-Fatihah')
- `ayahCount` (e.g., 7)
- `revelationType` ('Meccan' | 'Medinan')
- `juzStart` (which juz the surah starts in)

`TOTAL_AYAHS = 6236` — canonical total count.

### `getQuranChapters()` (L1044-1046) — Returns full SURAH_METADATA array

### `getQuranChapter()` (L1048-1052) — Single surah lookup; throws 404

### `getQuranVerses()` (L1054-1129) — Full surah with verses

```
Cache key: quran:verses:{surahNumber}:{translation}
Cache TTL: 2,592,000s (30 days)
API timeout: 10s

Arabic-only endpoint: /quran/verses/uthmani?chapter_number={n}
Translation endpoint: /verses/by_chapter/{n}?language={lang}&translations={id}&per_page={ayahCount}&fields=text_uthmani

Response: { surah: SurahMetadata, verses: [{number, arabicText, translation}] }
HTML tags stripped from translations: regex /<[^>]+>/g
```

### `getQuranVerse()` (L1131-1186) — Single verse with audio

```
API: /verses/by_key/{surah}:{ayah}?...
Returns: { surah, verse: {number, arabicText, translation}, audioUrl }
audioUrl computed from getQuranAudioUrl()
Cache TTL: 30 days
```

### `getQuranJuz()` (L1298-1355) — All verses in a juz (1-30)

```
API: /verses/by_juz/{juzNumber}?...&per_page=300
Cache TTL: 30 days
```

### `searchQuran()` (L1188-1247) — Search across Quran text

```
API: /search?q={query}&size={limit}&language={lang}&translations={id}
Min query length: 2 characters
Max results: 50
Cache TTL: 3,600s (1 hour) — search results can change with API updates
Returns: { results: [{surahNumber, ayahNumber, surahName, arabicText, translationText}], total }
```

### `getRandomAyah()` (L1249-1296) — Random verse

```
Uses Math.random() * 6236 to pick cumulative ayah index
Maps to surahNumber + ayahNumber via SURAH_METADATA iteration
Calls getQuranVerse() for actual text
Fallback on API error: returns reference string + audio URL (no text)
```

### Audio System

**4 Quran Reciters** (L1005-1012):
| ID | Name | Arabic Name | CDN Base URL |
|----|------|------------|-------------|
| mishary | Mishary Rashid Alafasy | مشاري راشد العفاسي | cdn.islamic.network/quran/audio/128/ar.alafasy |
| sudais | Abdul Rahman Al-Sudais | عبد الرحمن السديس | cdn.islamic.network/quran/audio/128/ar.abdurrahmaansudais |
| husary | Mahmoud Khalil Al-Husary | محمود خليل الحصري | cdn.islamic.network/quran/audio/128/ar.husary |
| minshawi | Mohamed Siddiq Al-Minshawi | محمد صديق المنشاوي | cdn.islamic.network/quran/audio/128/ar.minshawi |

**Audio URL formula** (L1014-1019):
```
url = {reciter.audioBaseUrl}/{audioNumber}.mp3
audioNumber = surahOffsets[surah-1] + ayah
```

`surahOffsets[]` (L1026-1037): Precomputed cumulative ayah offsets for all 114 surahs.

**6 Adhan Reciters** (L979-988): mishary, abdulbasit, maher, sudais, husary, minshawi

---

## 5. Hadith Collection

### Data Source
`data/hadiths.json` — 200 hadiths, primarily from Nawawi's 40 Hadith plus extensions.

Each entry:
```json
{
  "id": 1,
  "arabic": "إنما الأعمال بالنيات...",
  "english": "Actions are but by intentions...",
  "source": "Sahih al-Bukhari, Sahih Muslim",
  "narrator": "Umar ibn al-Khattab",
  "chapter": "The Book of Revelation"
}
```

### `getDailyHadith()` (L295-299)

```
dayOfYear = floor((Date.now() - Jan1) / 86400000)
index = dayOfYear % 200
```

Rotates through all 200 hadiths deterministically per day-of-year.

### `getHadithById()` (L301-307) — Find by ID, throw 404 if missing

### `getHadiths()` (L309-315) — Cursor-based pagination

```
cursor = hadith ID (start after this ID)
limit = 20 (default)
Returns: { data: Hadith[], cursor?, hasMore }
```

---

## 6. Dhikr Social System

### Models Involved
- `DhikrSession` — individual sessions
- `DhikrChallenge` — group challenges
- `DhikrChallengeParticipant` — join table with composite PK

### Valid Phrases (from DTO)
`subhanallah`, `alhamdulillah`, `allahuakbar`, `lailahaillallah`, `astaghfirullah`

### `saveDhikrSession()` (L779-795)

```
Validation: count [1, 100000], target [1, 100000]
Default target: 33
completedAt: set if count >= target
```

### `getDhikrStats()` (L797-843)

```
Aggregations:
1. Total count (all time)
2. Today's count (since midnight)
3. Last 90 sessions for streak calculation

Streak algorithm:
- Get unique dates from sessions (last 90)
- Walk backwards from today, counting consecutive days present
- Break on first gap

Returns: { totalCount, todayCount, streak, setsCompleted (sessions with count >= 33) }
```

### `getDhikrLeaderboard()` (L845-875)

```
period: 'day' (since midnight) or 'week' (7 days, default)
Groups DhikrSessions by userId, sums count, orders DESC
Returns top 20 users with displayName + avatarUrl
```

### `createDhikrChallenge()` (L877-887)

```
Fields: title, phrase, targetTotal, expiresAt
targetTotal minimum: 100 (from DTO)
```

### `joinChallenge()` (L934-950)

```
Creates DhikrChallengeParticipant record
Increments participantCount via raw SQL: UPDATE dhikr_challenges SET participantCount = participantCount + 1
Handles P2002 (already joined) → ConflictException
```

### `contributeToChallenge()` (L952-975)

```
Validation: count [1, 100000], must be participant, challenge not expired
Uses $transaction with two raw SQL updates:
1. UPDATE dhikr_challenge_participants SET contributed = contributed + {count}
2. UPDATE dhikr_challenges SET currentTotal = currentTotal + {count}
```

### `getChallengeDetail()` (L907-932)

```
Returns challenge + top 20 contributors sorted by contributed DESC
Includes user info (displayName, avatarUrl)
```

---

## 7. Fasting Tracker

### FastingType Enum (12 values)

| Value | Description |
|-------|-------------|
| RAMADAN | Obligatory Ramadan fast |
| MONDAY | Sunnah Monday fast |
| THURSDAY | Sunnah Thursday fast |
| AYYAM_AL_BID | 13th, 14th, 15th of each Hijri month |
| ARAFAT | 9th Dhul Hijjah |
| ASHURA | 10th Muharram |
| QADA | Making up missed fasts |
| NAFL | Voluntary fast |
| OBLIGATORY | General obligatory |
| SUNNAH | General sunnah |
| VOLUNTARY | General voluntary |
| MAKEUP | Makeup fast |

### `logFast()` (L1415-1433)

```
Upsert by userId + date (unique constraint)
Accepts: date (YYYY-MM-DD), isFasting (bool), fastType?, reason?
Default fastType: RAMADAN
```

### `getFastingLog()` (L1435-1449)

```
Input: month in YYYY-MM format
Queries: date >= first of month AND date <= last of month
Max 50 entries, ordered by date ASC
```

### `getFastingStats()` (L1451-1486)

```
Queries all logs from Jan 1 of current year

Returns:
- totalFastsThisYear: count where isFasting=true
- currentStreak: consecutive days of fasting ending today
- makeupNeeded: count where !isFasting AND fastType=RAMADAN

Streak algorithm: sorts fasting-only logs descending by date, checks each against expected date (today - streak count)
```

---

## 8. Dua Collection

### Data Source
`data/duas.json` — 100 duas across 37 categories.

Each dua has translations in all 8 supported languages (en, ar, tr, ur, bn, fr, id, ms).

### Categories (37 total)
morning, evening, sleep, eating, travel, anxiety, illness, gratitude, forgiveness, protection, rain, waking, mosque, parents, general, ramadan, hajj, meals, weather, bathroom, prayer, children, deceased, istikhara, laylatul_qadr, arafat, sickness, distress, spouse, knowledge, newborn, etiquette, debt, home, marketplace, anger, sadness, gathering

### `getDuasByCategory()` (L1366-1369) — Optional filter; returns all if no category

### `getDuaOfTheDay()` (L1375-1381)

```
daysSinceEpoch = floor(Date.now() / 86400000)
index = daysSinceEpoch % 100
```

### `getDuaById()` (L1371-1373) — Direct lookup by string ID

### `bookmarkDua()` (L1389-1397) — Idempotent; returns existing if already bookmarked

### `unbookmarkDua()` (L1399-1409) — Idempotent; catches delete error

### `getBookmarkedDuas()` (L1488-1497)

```
Fetches DuaBookmark records (max 100)
Cross-references with in-memory duas array
Returns full DuaEntry objects
```

---

## 9. 99 Names of Allah

### Data Source
`data/asma-ul-husna.json` — 99 entries.

Each entry:
```json
{
  "number": 1,
  "arabicName": "الرَّحْمَنُ",
  "transliteration": "Ar-Rahman",
  "englishMeaning": "The Most Gracious",
  "explanation": "The One who has plenty of mercy...",
  "quranRef": "1:1"  // optional
}
```

### `getAllNamesOfAllah()` (L1507-1509) — Returns all 99

### `getDailyNameOfAllah()` (L1558-1562)

```
daysSinceEpoch = floor(Date.now() / 86400000)
index = daysSinceEpoch % 99
```

### `getNameOfAllahByNumber()` (L1511-1513) — Lookup by number (1-99)

---

## 10. Hifz (Memorization) Tracker

### HifzStatus Enum
`NOT_STARTED`, `IN_PROGRESS`, `MEMORIZED`, `NEEDS_REVIEW`

### `getHifzProgress()` (L1568-1587)

```
Queries all HifzProgress records for user (max 120)
Builds full 114-surah array:
- If record exists: use actual status + lastReviewedAt
- If no record: default to NOT_STARTED
Returns array of { surahNum, status, lastReviewedAt }
```

### `updateHifzProgress()` (L1589-1612)

```
Validation: surahNum [1, 114], status must be valid enum value
Upsert by userId + surahNum
Sets lastReviewedAt to now() when status is MEMORIZED or NEEDS_REVIEW
```

### `getHifzStats()` (L1614-1631)

```
Returns: {
  memorized: count with MEMORIZED status
  inProgress: count with IN_PROGRESS status
  needsReview: count with NEEDS_REVIEW status
  notStarted: 114 - memorized - inProgress - needsReview
  percentage: round((memorized / 114) * 100)
}
```

### `getHifzReviewSchedule()` (L1822-1839) — Spaced Repetition

```
Returns surahs where:
  - status IN ('MEMORIZED', 'NEEDS_REVIEW')
  - AND (lastReviewedAt IS NULL OR lastReviewedAt < 7 days ago)
Ordered by lastReviewedAt ASC (oldest first)
Max 10 results
```

---

## 11. Hajj Guide & Progress

### Hajj Guide Data (7 Steps)

| Step | Name | Arabic |
|------|------|--------|
| 0 | Ihram | الإحرام |
| 1 | Tawaf | الطواف |
| 2 | Sa'i | السعي |
| 3 | Day of Tarwiyah (Mina) | يوم التروية |
| 4 | Day of Arafat | يوم عرفة |
| 5 | Muzdalifah | المزدلفة |
| 6 | Rami & Final Rites | رمي الجمرات والطواف |

Each step includes: `description`, `descriptionAr`, `duas[]` (with arabic, transliteration, english), `checklist[]` (action items).

### `getHajjGuide()` (L680-682) — Returns full static array

### `getHajjProgress()` (L684-689)

```
Finds most recent HajjProgress for user (ordered by year DESC)
Returns: { id, userId, year, currentStep (0-6), checklistJson, notes }
```

### `createHajjProgress()` (L691-702)

```
Creates record for a specific year
Unique constraint: userId + year
Handles P2002 → ConflictException
```

### `updateHajjProgress()` (L704-713)

```
Verifies ownership (userId match)
Updates: currentStep (0-6), checklistJson (stringified), notes
```

---

## 12. Zakat Calculator

### `calculateZakat()` (L420-456)

**Formula:**

```
goldPricePerGram = env.GOLD_PRICE_PER_GRAM || $92
silverPricePerGram = env.SILVER_PRICE_PER_GRAM || $1.05

goldValue = gold_grams * goldPricePerGram
silverValue = silver_grams * silverPricePerGram
totalAssets = cash + goldValue + silverValue + investments

nisabGold = 87.48g * goldPricePerGram     // Gold nisab: 87.48 grams
nisabSilver = 612.36g * silverPricePerGram // Silver nisab: 612.36 grams
nisab = min(nisabGold, nisabSilver)        // Use lower threshold (more inclusive)

nisabMet = (totalAssets - debts) >= nisab
zakatDue = nisabMet ? (totalAssets - debts) * 0.025 : 0   // 2.5%
```

**Response:**
```json
{
  "totalAssets": 25000,
  "nisab": 642.98,
  "nisabMet": true,
  "zakatDue": 575,
  "breakdown": {
    "cash": 5000,
    "goldValue": 4600,
    "silverValue": 210,
    "investments": 10000,
    "debts": 2000
  },
  "goldPricePerGram": 92,
  "silverPricePerGram": 1.05
}
```

---

## 13. Ramadan Info

### `getRamadanInfo()` (L458-514)

```
Input: { year?, lat?, lng? }
Defaults: year = current year

1. Calculate Ramadan start/end from Hijri calendar via getRamadanDatesForYear()
2. Check if today is within Ramadan → currentDay
3. If lat/lng provided:
   - Get prayer times via getPrayerTimes()
   - iftarTime = Maghrib time
   - suhoorTime = Fajr time - 10 minutes
   - nextPrayer from getCurrentPrayerWindow()

Response: {
  year, startDate, endDate,
  currentDay?,       // null if not Ramadan
  iftarTime?,        // HH:MM (Maghrib)
  suhoorTime?,       // HH:MM (Fajr - 10min)
  nextPrayer?,       // prayer name
  nextPrayerTime?    // HH:MM
}
```

---

## 14. Scholar Verification & Content Filter

### Scholar Verification

**Apply** (`applyScholarVerification()`, L746-752):
```
Rate limit: 1 per day
Checks for existing application → BadRequestException if exists
Creates ScholarVerification record with status VERIFICATION_PENDING
Fields: institution (max 200), specialization (fiqh/hadith/tafsir/aqeedah/general),
        madhab (hanafi/maliki/shafii/hanbali), documentUrls[]
```

**Status** (`getScholarVerificationStatus()`, L754-756): Simple findUnique by userId

**Note:** No approve/decline endpoint exists — status field exists but no admin workflow is built.

### Content Filter

**Get** (`getContentFilterSettings()`, L760-766): Auto-creates with defaults if not found.

**Update** (`updateContentFilterSettings()`, L768-775): Upsert.

**Settings:**

| Field | Type | Default | Values |
|-------|------|---------|--------|
| `strictnessLevel` | ContentStrictnessLevel | MODERATE | RELAXED, MODERATE, STRICT, FAMILY |
| `blurHaram` | boolean | true | Blur potentially haram content |
| `hideMusic` | boolean | false | Hide music-related content |
| `hideMixedGender` | boolean | false | Hide mixed-gender content |

---

## 15. Daily Briefing & Daily Tasks

### `getDailyBriefing()` (L1637-1714)

Composite endpoint returning everything for the morning screen:

```
Input: userId, lat?, lng?

Returns: {
  hijriDate: "12 Ramadan 1447"              // Kuwaiti algorithm
  prayerTimes: { fajr, dhuhr, asr, maghrib, isha } | null
  hadithOfTheDay: { text, arabic, source, narrator }
  ayahOfTheDay: { surah, ayahNumber, arabic, translation }
  duaOfTheDay: { arabic, translation, transliteration, category, source }
  dhikrChallenge: { text: "SubhanAllah", target: 33, completed, streakDays: 0 }
  tasksCompleted: 0-3
  totalTasks: 3
  completedTasks: ["DHIKR", "QURAN"] etc
}
```

**Ayah of the day** — deterministic: `daysSinceEpoch % 6236`, maps to surah via cumulative count array.

### Daily Tasks System

3 task types: `DHIKR`, `QURAN`, `REFLECTION`

**Complete task** (`completeDailyTask()`, L1716-1749):
```
Upsert by userId + date + taskType (unique constraint)
Checks if all 3 tasks complete → bonusXPAwarded: true
```

**Get today's tasks** (`getDailyTasksToday()`, L1751-1769):
```
Returns: {
  tasks: [
    { type: "dhikr", completed: true/false },
    { type: "quran", completed: true/false },
    { type: "reflection", completed: true/false }
  ],
  totalCompleted: 0-3,
  allComplete: true/false
}
```

---

## 16. Tafsir System

### Data Source
`data/tafsir.json` — 28 entries covering select verses.

Covered verses include:
- Surah Al-Fatihah (1:1 through 1:7) — all 7 verses
- Surah Al-Baqarah select verses (e.g., 2:255 Ayatul Kursi)
- Other notable verses

### Sources
- **Ibn Kathir** — general/classical
- **Al-Tabari** — general/historical
- **Al-Qurtubi** — Maliki madhab

Each entry: `{ surahNumber, verseNumber, verse (Arabic), tafsirSources: [{name, madhab, textEn, textAr}] }`

### `getTafsirSources()` (L734-742) — Unique source names extracted from all entries

### `getTafsir()` (L719-732)

```
Lookup by surahNumber + verseNumber
Optional source filter (case-insensitive name match)
Throws 404 if verse not in dataset
```

---

## 17. Charity / Sadaqah

### `createCampaign()` (L612-616)

```
Creates CharityCampaign: title (max 100), description (max 500), goalAmount (1-1M), imageUrl?
```

### `listCampaigns()` (L618-629)

```
Cursor-based pagination, max 50 per page
Filters: isActive = true
Orders: createdAt DESC
```

### `getCampaign()` (L631-637) — Single lookup; 404 if missing

### `createDonation()` (L639-661)

```
Validation: amount [1, 1000000]
If campaignId provided: validates campaign exists
Creates CharityDonation with status: 'pending'
NOTE: Campaign totals NOT updated — should only update via Stripe webhook confirmation
Default currency: 'usd'
```

### `getMyDonations()` (L663-674)

```
Cursor-based pagination, max 50 per page
Filters: userId
Orders: createdAt DESC
```

---

## 18. Islamic Notifications Service

File: `islamic-notifications.service.ts` (266 lines)

### `isInPrayerDND()` (L25-55)

```
1. Check PrayerNotificationSetting.dndDuringPrayer for user
2. Get cached prayer times from Redis key: prayer_times:{userId}
3. Compare current time to each prayer time
4. If within 15 minutes of any prayer → true (DND active)
```

### `queueNotificationForAfterPrayer()` (L61-68)

```
Pushes notification to Redis list: prayer_queue:{userId}
TTL: 3600s (1 hour)
```

### `shouldShowPrayFirstNudge()` (L76-119)

```
Only shows if:
1. User has adhanEnabled = true (cares about prayer)
2. User is currently in prayer DND window (within 15min of prayer)
Returns: { show: true, prayerName: "Dhuhr" }
```

### `getJummahReminder()` (L127-152)

```
1. Check if today is Friday (getDay() === 5)
2. Check if hour is 11-13 (near Jummah time)
3. Look up user's MosqueMembership for nearest mosque name
```

### `getRamadanStatus()` (L160-178)

```
Uses Hijri calendar computation
Ramadan = Hijri month 9
Returns: { isRamadan, dayNumber?, hijriMonth, hijriDay }
```

### `getIslamicPeriod()` (L212-240) — For app theming

| Period | Hijri Month | Days | Accent Color |
|--------|-------------|------|-------------|
| ramadan | 9 | all | #C8963E (gold) |
| eid | 10 | 1-3 | #C8963E (gold) |
| dhul_hijjah | 12 | 1-13 | #A0785A (copper) |
| muharram | 1 | all | #4A6741 (dark green) |
| normal | other | all | (no accent) |

### `categorizeIslamicContent()` (L182-204) — Keyword-based categorization

8 categories with keyword lists:
- **fiqh:** fiqh, fatwa, halal, haram, ruling, madhab, sharia
- **seerah:** seerah, prophet, muhammad, biography, companions, sahaba
- **tafsir:** tafsir, quran, ayah, surah, interpretation, meaning
- **dawah:** dawah, revert, convert, invite, new muslim
- **nasheeds:** nasheed, anasheed, islamic song, spiritual music
- **hadith:** hadith, sunnah, narration, bukhari, muslim, reported
- **aqeedah:** aqeedah, belief, tawheed, iman, creed, theology
- **history:** islamic history, caliphate, ottoman, andalus, ummayad

---

## 19. Static Data Files — Complete Inventory

| File | Path | Entries | Size (lines) | Structure |
|------|------|---------|-------------|-----------|
| Hadiths | `data/hadiths.json` | 200 | 481 | `{id, arabic, english, source, narrator, chapter}` |
| Duas | `data/duas.json` | 100 | 374 | `{id, category, arabicText, transliteration, translation: {en,ar,tr,ur,bn,fr,id,ms}, source, sourceRef}` |
| Asma ul-Husna | `data/asma-ul-husna.json` | 99 | 101 | `{number, arabicName, transliteration, englishMeaning, explanation, quranRef?}` |
| Tafsir | `data/tafsir.json` | 28 | 396 | `{surahNumber, verseNumber, verse, tafsirSources: [{name, madhab, textEn, textAr}]}` |
| Hajj Guide | `data/hajj-guide.json` | 7 | 65 | `{step, name, nameAr, description, descriptionAr, duas: [{arabic, transliteration, english}], checklist: []}` |
| Mock Hadiths | `__mocks__/data/hadiths.json` | ~5 | 41 | Subset for tests |
| Surah Metadata | `quran-metadata.ts` | 114 | 154 | `SurahMetadata[]` — compile-time TypeScript |

---

## 20. Prisma Models & Enums

### Models (16 used by Islamic module)

| Model | Table | PK | Unique Constraints | Key Fields |
|-------|-------|----|--------------------|-----------|
| `QuranReadingPlan` | quran_reading_plans | uuid | — | userId, planType, startDate, endDate, currentJuz, currentPage, isComplete |
| `DhikrSession` | dhikr_sessions | uuid | — | userId, phrase, count, target(def:33), completedAt? |
| `DailyTaskCompletion` | daily_task_completions | cuid | userId+date+taskType | userId, date(Date), taskType(DailyTaskType) |
| `DhikrChallenge` | dhikr_challenges | uuid | — | userId, title, phrase, targetTotal, currentTotal(def:0), participantCount(def:0), expiresAt? |
| `DhikrChallengeParticipant` | dhikr_challenge_participants | composite(userId+challengeId) | userId+challengeId | contributed(def:0), joinedAt |
| `CharityDonation` | charity_donations | uuid | — | userId?, recipientUserId?, campaignId?, amount(Decimal12,2), currency(def:'usd'), stripePaymentId?, status(def:'pending') |
| `CharityCampaign` | charity_campaigns | uuid | — | userId, title, description?, goalAmount(Decimal12,2), raisedAmount(def:0), donorCount(def:0), imageUrl?, isActive(def:true) |
| `HajjProgress` | hajj_progress | uuid | userId+year | userId, year, currentStep(def:0), checklistJson(def:'{}'), notes? |
| `PrayerNotificationSetting` | prayer_notification_settings | uuid | userId (unique) | userId, dndDuringPrayer(def:false), adhanEnabled(def:false), adhanStyle(def:MAKKAH), reminderMinutes(def:15) |
| `ContentFilterSetting` | content_filter_settings | uuid | userId (unique) | userId, strictnessLevel(def:MODERATE), blurHaram(def:true), hideMusic(def:false), hideMixedGender(def:false) |
| `ScholarVerification` | scholar_verifications | uuid | userId (unique) | userId, institution, specialization?, madhab?, verifiedAt?, status(def:VERIFICATION_PENDING), documentUrls[] |
| `HifzProgress` | hifz_progress | cuid | userId+surahNum | userId, surahNum(1-114), status(def:NOT_STARTED), lastReviewedAt? |
| `MosqueCommunity` | mosque_communities | cuid | — | name, address, city, country, latitude, longitude, madhab?, language?, phone?, website?, imageUrl?, memberCount(def:0), createdById, isVerified(def:false) |
| `MosqueMembership` | mosque_memberships | cuid | mosqueId+userId | mosqueId, userId, role(def:'member') |
| `DuaBookmark` | dua_bookmarks | cuid | userId+duaId | userId, duaId |
| `FastingLog` | fasting_logs | cuid | userId+date | userId, date(Date), isFasting, fastType(def:RAMADAN), reason? |

### Enums (7 used)

| Enum | Values |
|------|--------|
| `DailyTaskType` | DHIKR, QURAN, REFLECTION |
| `FastingType` | RAMADAN, MONDAY, THURSDAY, AYYAM_AL_BID, ARAFAT, ASHURA, QADA, NAFL, OBLIGATORY, SUNNAH, VOLUNTARY, MAKEUP |
| `HifzStatus` | NOT_STARTED, IN_PROGRESS, MEMORIZED, NEEDS_REVIEW |
| `ContentStrictnessLevel` | RELAXED, MODERATE, STRICT, FAMILY |
| `AdhanStyle` | MAKKAH, MISHARY, ABDULBASIT, MAHER, SUDAIS, HUSARY, MINSHAWI |
| `MadhhabType` | HANAFI, MALIKI, SHAFII, HANBALI, ANY |
| `ScholarVerificationStatus` | VERIFICATION_PENDING, VERIFICATION_APPROVED, VERIFICATION_REJECTED |

### Database Indexes

| Table | Index |
|-------|-------|
| quran_reading_plans | userId |
| dhikr_sessions | userId + createdAt DESC |
| daily_task_completions | userId + date |
| dhikr_challenges | createdAt DESC |
| dhikr_challenge_participants | challengeId, userId |
| charity_donations | userId + createdAt DESC, recipientUserId, campaignId |
| charity_campaigns | userId, isActive + createdAt DESC |
| hajj_progress | userId |
| hifz_progress | userId |
| mosque_communities | latitude + longitude, city |
| dua_bookmarks | userId |
| fasting_logs | userId + date |

---

## 21. DTOs — Complete Reference

### UpdatePrayerNotificationDto
| Field | Type | Validation | Values |
|-------|------|-----------|--------|
| `dndDuringPrayer` | boolean? | @IsBoolean | — |
| `adhanEnabled` | boolean? | @IsBoolean | — |
| `adhanStyle` | string? | @IsIn | MAKKAH, MISHARY, ABDULBASIT, MAHER, SUDAIS, HUSARY, MINSHAWI |
| `reminderMinutes` | int? | @IsInt @Min(0) @Max(60) | 0-60 |

### CreateQuranPlanDto
| Field | Type | Validation | Values |
|-------|------|-----------|--------|
| `planType` | string | @IsIn | '30day', '60day', '90day' |

### UpdateQuranPlanDto
| Field | Type | Validation |
|-------|------|-----------|
| `currentJuz` | int? | @Min(1) @Max(30) |
| `currentPage` | int? | @Min(1) @Max(604) |
| `isComplete` | boolean? | @IsBoolean |

### CreateCampaignDto
| Field | Type | Validation |
|-------|------|-----------|
| `title` | string | @MaxLength(100) |
| `description` | string? | @MaxLength(500) |
| `goalAmount` | int | @Min(1) @Max(1000000) |
| `imageUrl` | string? | @IsUrl |

### CreateDonationDto
| Field | Type | Validation | Values |
|-------|------|-----------|--------|
| `campaignId` | string? | — | — |
| `recipientUserId` | string? | — | — |
| `amount` | int | @Min(1) @Max(1000000) | — |
| `currency` | string? | @IsIn | 'usd', 'gbp', 'eur' |

### CreateHajjProgressDto
| Field | Type | Validation |
|-------|------|-----------|
| `year` | int | @Min(2024) @Max(2100) |

### UpdateHajjProgressDto
| Field | Type | Validation |
|-------|------|-----------|
| `currentStep` | int? | @Min(0) @Max(6) |
| `checklistJson` | string? | @MaxLength(10000) |
| `notes` | string? | @MaxLength(2000) |

### ApplyScholarVerificationDto
| Field | Type | Validation | Values |
|-------|------|-----------|--------|
| `institution` | string | @MaxLength(200) | — |
| `specialization` | string? | @IsIn | fiqh, hadith, tafsir, aqeedah, general |
| `madhab` | string? | @IsIn | hanafi, maliki, shafii, hanbali |
| `documentUrls` | string[] | @IsArray @IsUrl each | — |

### UpdateContentFilterDto
| Field | Type | Validation | Values |
|-------|------|-----------|--------|
| `strictnessLevel` | string? | @IsIn | RELAXED, MODERATE, STRICT, FAMILY |
| `blurHaram` | boolean? | @IsBoolean | — |
| `hideMusic` | boolean? | @IsBoolean | — |
| `hideMixedGender` | boolean? | @IsBoolean | — |

### SaveDhikrSessionDto
| Field | Type | Validation | Values |
|-------|------|-----------|--------|
| `phrase` | string | @IsIn | subhanallah, alhamdulillah, allahuakbar, lailahaillallah, astaghfirullah |
| `count` | int | @Min(1) | — |
| `target` | int? | @Min(1) | — |

### CreateDhikrChallengeDto
| Field | Type | Validation |
|-------|------|-----------|
| `title` | string | @MaxLength(100) |
| `phrase` | string | @IsIn (same 5 phrases) |
| `targetTotal` | int | @Min(100) |
| `expiresAt` | string? | @IsDateString |

### ContributeDhikrDto
| Field | Type | Validation |
|-------|------|-----------|
| `count` | int | @Min(1) |

### Inline DTOs (controller)

**LogFastDto:** `date` (@IsDateString), `isFasting` (@IsBoolean), `fastType?` (@IsIn — 12 FastingType values), `reason?` (@MaxLength(500))

**UpdateHifzStatusDto:** `status` (@IsIn — NOT_STARTED/IN_PROGRESS/MEMORIZED/NEEDS_REVIEW)

**CompleteDailyTaskDto:** `taskType` (@IsIn — DHIKR/QURAN/REFLECTION)

---

## 22. External APIs & Caching Strategy

### External APIs Used

| API | Purpose | Timeout | Auth | Fallback |
|-----|---------|---------|------|---------|
| **Aladhan** (`api.aladhan.com/v1`) | Prayer times | 8s | None (free) | Local solar calculation |
| **Quran.com** (`api.quran.com/api/v4`) | Quran text, translations, search | 10-15s | None (free) | Exception thrown (no local fallback for text) |
| **OSM Overpass** (`overpass-api.de`) | Nearby mosques | 12s | None (free) | Empty array (no mosques) |
| **islamic.network CDN** | Quran audio | N/A (direct URLs) | None | URL still generated, may 404 |

### Redis Cache Keys & TTLs

| Key Pattern | TTL | Source |
|-------------|-----|--------|
| `prayer:{lat}:{lng}:{date}:{method}` | 86400s (24h) — API; 3600s (1h) — local | getPrayerTimes() |
| `quran:verses:{surah}:{lang}` | 2592000s (30 days) | getQuranVerses() |
| `quran:verse:{surah}:{ayah}:{lang}` | 2592000s (30 days) | getQuranVerse() |
| `quran:juz:{juz}:{lang}` | 2592000s (30 days) | getQuranJuz() |
| `quran:search:{query}:{lang}:{limit}` | 3600s (1 hour) | searchQuran() |
| `mosques:{lat}:{lng}:{radius}` | 604800s (7 days) | getNearbyMosques() |
| `prayer_times:{userId}` | (set externally) | isInPrayerDND() reads |
| `prayer_queue:{userId}` | 3600s (1 hour) | queueNotificationForAfterPrayer() |

### Mosque Finder: Two-tier source

1. **MosqueCommunity table** — Haversine distance query via raw SQL (`$queryRaw` tagged template literal)
2. **OSM Overpass API** — Fallback when database has no results. Queries `amenity=place_of_worship, religion=muslim` within radius.

### Haversine Formula (used in mosque query, L326-351)

```sql
6371 * acos(
  LEAST(1.0, GREATEST(-1.0,
    cos(radians(lat)) * cos(radians(latitude))
    * cos(radians(longitude) - radians(lng))
    + sin(radians(lat)) * sin(radians(latitude))
  ))
) AS distance
```

Uses `LEAST(1.0, GREATEST(-1.0, ...))` to clamp the acos argument and prevent domain errors on edge cases.

---

## Endpoint Count Verification

| Domain | Endpoints |
|--------|-----------|
| Prayer Times | 5 |
| Hadith | 3 |
| Mosques | 1 |
| Zakat | 1 |
| Ramadan | 1 |
| Quran Plans | 5 |
| Quran Text | 7 |
| Charity | 5 |
| Hajj | 4 |
| Tafsir | 2 |
| Scholar Verification | 2 |
| Content Filter | 2 |
| Dhikr | 8 |
| Fasting | 3 |
| Duas | 7 |
| Names of Allah | 3 |
| Hifz | 4 |
| Daily Briefing & Tasks | 3 |
| **TOTAL** | **66** |
