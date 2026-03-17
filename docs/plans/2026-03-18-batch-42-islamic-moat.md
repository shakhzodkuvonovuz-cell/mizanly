# Batch 42: Islamic-First Moat — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build 14 Islamic-first features (Tier 7) that fundamentally differentiate Mizanly from every competitor — prayer-aware notifications, Qibla compass, Quran reading plans, tafsir, communal Quran rooms, sadaqah, Hajj companion, scholar verification, halal filter, Hijri dates, Eid frames, nasheed mode, and dhikr social.

**Architecture:** Extends the existing `islamic` backend module + adds new Prisma models for persistent Islamic features (reading plans, dhikr, charity, Hajj). Mobile adds ~10 new screens + enhances 3 existing ones. Socket.io `/chat` namespace extended for communal Quran rooms.

**Tech Stack:** NestJS 10 + Prisma + Expo SDK 52 + Socket.io + Stripe (charity) + expo-sensors (compass) + expo-notifications (adhan/prayer DND)

---

## NEW PRISMA MODELS (Agent 0 — Schema)

All agents depend on this. Add to `apps/api/prisma/schema.prisma`:

```prisma
model QuranReadingPlan {
  id          String   @id @default(uuid())
  userId      String
  planType    String   // '30day' | '60day' | '90day' | 'custom'
  startDate   DateTime
  endDate     DateTime
  currentJuz  Int      @default(1)
  currentPage Int      @default(1)
  isComplete  Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([userId])
  @@map("quran_reading_plans")
}

model DhikrSession {
  id          String   @id @default(uuid())
  userId      String
  phrase      String   // 'subhanallah' | 'alhamdulillah' | 'allahuakbar' | 'lailahaillallah' | 'astaghfirullah'
  count       Int
  target      Int      @default(33)
  completedAt DateTime?
  createdAt   DateTime @default(now())
  @@index([userId, createdAt(sort: Desc)])
  @@map("dhikr_sessions")
}

model DhikrChallenge {
  id            String   @id @default(uuid())
  userId        String   // creator
  title         String
  phrase        String
  targetTotal   Int      // e.g. 1000000
  currentTotal  Int      @default(0)
  participantCount Int   @default(0)
  expiresAt     DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([createdAt(sort: Desc)])
  @@map("dhikr_challenges")
}

model DhikrChallengeParticipant {
  userId        String
  challengeId   String
  contributed   Int      @default(0)
  joinedAt      DateTime @default(now())
  @@id([userId, challengeId])
  @@index([challengeId])
  @@map("dhikr_challenge_participants")
}

model CharityDonation {
  id              String   @id @default(uuid())
  userId          String
  recipientUserId String?  // if donating to a user's campaign
  campaignId      String?
  amount          Int      // cents
  currency        String   @default("usd")
  stripePaymentId String?
  status          String   @default("pending") // pending | completed | failed
  createdAt       DateTime @default(now())
  @@index([userId, createdAt(sort: Desc)])
  @@index([recipientUserId])
  @@map("charity_donations")
}

model CharityCampaign {
  id          String   @id @default(uuid())
  userId      String
  title       String
  description String?
  goalAmount  Int      // cents
  raisedAmount Int     @default(0)
  donorCount  Int      @default(0)
  imageUrl    String?
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([userId])
  @@index([isActive, createdAt(sort: Desc)])
  @@map("charity_campaigns")
}

model HajjProgress {
  id          String   @id @default(uuid())
  userId      String
  year        Int
  currentStep Int      @default(0) // 0-6: ihram,tawaf,say,mina,arafat,muzdalifah,rami
  checklistJson String @default("{}") // JSON of completed items per step
  notes       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@unique([userId, year])
  @@map("hajj_progress")
}

model PrayerNotificationSetting {
  id             String  @id @default(uuid())
  userId         String  @unique
  dndDuringPrayer Boolean @default(false)
  adhanEnabled   Boolean @default(false)
  adhanStyle     String  @default("makkah") // makkah | madinah | alaqsa
  reminderMinutes Int    @default(15) // minutes before prayer
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@map("prayer_notification_settings")
}

model ContentFilterSetting {
  id              String  @id @default(uuid())
  userId          String  @unique
  strictnessLevel String  @default("moderate") // relaxed | moderate | strict | family
  blurHaram       Boolean @default(true)
  hideMusic       Boolean @default(false)
  hideMixedGender Boolean @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@map("content_filter_settings")
}

model ScholarVerification {
  id              String   @id @default(uuid())
  userId          String   @unique
  institution     String
  specialization  String?  // fiqh | hadith | tafsir | aqeedah | general
  madhab          String?  // hanafi | maliki | shafii | hanbali
  verifiedAt      DateTime?
  status          String   @default("pending") // pending | approved | rejected
  documentUrls    String[] // uploaded credential documents
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@map("scholar_verifications")
}
```

Also add to the existing `User` model:
```prisma
isScholarVerified Boolean @default(false)
nasheedMode       Boolean @default(false)
```

---

## AGENT 1: Prayer-Time-Aware Notifications + Adhan

**Creates:**
- `apps/api/src/modules/islamic/dto/prayer-notification.dto.ts`

**Modifies:**
- `apps/api/prisma/schema.prisma` (PrayerNotificationSetting — from Agent 0)
- `apps/api/src/modules/islamic/islamic.service.ts` (add prayer notification methods)
- `apps/api/src/modules/islamic/islamic.controller.ts` (add settings endpoints)
- `apps/api/src/modules/notifications/notifications.service.ts` (add DND check)
- `apps/mobile/app/(screens)/prayer-times.tsx` (add notification toggle + adhan picker)
- `apps/mobile/src/services/islamicApi.ts` (add settings endpoints)
- `apps/mobile/src/types/islamic.ts` (add PrayerNotificationSetting type)

Read ALL files first.

**Backend — prayer-notification.dto.ts:**
```typescript
import { IsBoolean, IsIn, IsInt, IsOptional, Min, Max } from 'class-validator';

export class UpdatePrayerNotificationDto {
  @IsOptional() @IsBoolean() dndDuringPrayer?: boolean;
  @IsOptional() @IsBoolean() adhanEnabled?: boolean;
  @IsOptional() @IsIn(['makkah', 'madinah', 'alaqsa']) adhanStyle?: string;
  @IsOptional() @IsInt() @Min(0) @Max(60) reminderMinutes?: number;
}
```

**Backend — islamic.service.ts — add methods:**
- `getPrayerNotificationSettings(userId)` — find or create default
- `updatePrayerNotificationSettings(userId, dto)` — upsert

**Backend — islamic.controller.ts — add endpoints:**
```
GET    /islamic/prayer-notifications/settings  — get settings (ClerkAuthGuard)
PATCH  /islamic/prayer-notifications/settings  — update (ClerkAuthGuard)
```

**Backend — notifications.service.ts — add DND check:**
Find the method that sends push notifications. Add at the top:
```typescript
// Check if user has prayer DND enabled
const prayerSettings = await this.prisma.prayerNotificationSetting.findUnique({
  where: { userId: recipientUserId },
});
if (prayerSettings?.dndDuringPrayer) {
  // Check if current time is during prayer window (±15min of any prayer time)
  // If yes, queue notification instead of sending immediately
}
```

**Mobile — prayer-times.tsx — add to existing screen:**
- Add a settings gear icon in GlassHeader right side
- On press → BottomSheet with toggles:
  - "DND during prayer" toggle
  - "Adhan alerts" toggle
  - Adhan style picker (Makkah / Madinah / Al-Aqsa)
  - Reminder minutes slider (0/5/10/15/30)
- Use React Query mutation to save settings
- Show current settings loaded via `islamicApi.getPrayerNotificationSettings()`

**Mobile — islamicApi.ts — add:**
```typescript
getPrayerNotificationSettings: () => api.get<PrayerNotificationSetting>('/islamic/prayer-notifications/settings'),
updatePrayerNotificationSettings: (data: Partial<PrayerNotificationSetting>) =>
  api.patch<PrayerNotificationSetting>('/islamic/prayer-notifications/settings', data),
```

**~500 lines across all files**

---

## AGENT 2: Qibla Compass

**Creates:**
- `apps/mobile/app/(screens)/qibla-compass.tsx`

**Modifies:**
- `apps/mobile/app/(screens)/prayer-times.tsx` (add "Qibla" button linking to new screen)
- `apps/mobile/src/i18n/en.json` (add qibla keys)
- `apps/mobile/src/i18n/ar.json` (add qibla keys)

Read prayer-times.tsx first to see existing Qibla direction card.

**qibla-compass.tsx (~300 lines):**

Full-screen compass using `expo-sensors` Magnetometer:
```typescript
import { Magnetometer } from 'expo-sensors';
import * as Location from 'expo-location';
```

- Get user location via `expo-location`
- Calculate Qibla bearing: `atan2(sin(ΔL) * cos(lat2), cos(lat1)*sin(lat2) - sin(lat1)*cos(lat2)*cos(ΔL))` where lat2/lng2 = Kaaba (21.4225, 39.8262)
- Subscribe to Magnetometer for heading updates
- Show animated compass rose that rotates based on device heading
- Qibla arrow overlay (gold gradient) points to calculated direction
- Display: bearing degrees, cardinal direction, distance to Kaaba in km
- Vibrate (expo-haptics) when phone points within ±5° of Qibla
- GlassHeader with back button
- ScreenErrorBoundary wrapper
- Permission handling for location + magnetometer
- Cleanup magnetometer subscription on unmount

**prayer-times.tsx — add Qibla button:**
Find the existing Qibla direction card. Add `onPress={() => router.push('/qibla-compass')}` to make it tappable. Add a chevron-right icon.

**i18n keys:**
```json
"qibla": {
  "title": "Qibla Direction",
  "bearing": "{{degrees}}° {{direction}}",
  "distanceToKaaba": "{{km}} km to Kaaba",
  "aligned": "You are facing the Qibla",
  "permissionNeeded": "Location permission required",
  "calibrate": "Calibrate by moving your phone in a figure-8"
}
```

---

## AGENT 3: Quran Reading Plans + Khatmah Tracker

**Creates:**
- `apps/api/src/modules/islamic/dto/quran-plan.dto.ts`
- `apps/mobile/app/(screens)/quran-reading-plan.tsx`

**Modifies:**
- `apps/api/prisma/schema.prisma` (QuranReadingPlan — from Agent 0)
- `apps/api/src/modules/islamic/islamic.service.ts` (add plan CRUD)
- `apps/api/src/modules/islamic/islamic.controller.ts` (add plan endpoints)
- `apps/mobile/src/services/islamicApi.ts` (add plan endpoints)
- `apps/mobile/src/types/islamic.ts` (add QuranReadingPlan type)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Backend — quran-plan.dto.ts:**
```typescript
import { IsIn, IsInt, IsOptional, Min, Max } from 'class-validator';

export class CreateQuranPlanDto {
  @IsIn(['30day', '60day', '90day']) planType: string;
}

export class UpdateQuranPlanDto {
  @IsOptional() @IsInt() @Min(1) @Max(30) currentJuz?: number;
  @IsOptional() @IsInt() @Min(1) @Max(604) currentPage?: number;
  @IsOptional() isComplete?: boolean;
}
```

**Backend — islamic.service.ts — add methods:**
- `createReadingPlan(userId, dto)` — calculate endDate from planType, create record
- `getActiveReadingPlan(userId)` — findFirst where isComplete=false
- `getReadingPlanHistory(userId, cursor, limit)` — paginated completed plans
- `updateReadingPlan(userId, planId, dto)` — update progress
- `deleteReadingPlan(userId, planId)` — only own plans

**Backend — islamic.controller.ts — add endpoints:**
```
POST   /islamic/quran-plans          — create plan (ClerkAuthGuard)
GET    /islamic/quran-plans/active   — get active plan (ClerkAuthGuard)
GET    /islamic/quran-plans/history  — completed plans (ClerkAuthGuard)
PATCH  /islamic/quran-plans/:id      — update progress (ClerkAuthGuard)
DELETE /islamic/quran-plans/:id      — delete plan (ClerkAuthGuard)
```

**Mobile — quran-reading-plan.tsx (~350 lines):**
- GlassHeader with "Quran Reading Plan" title
- If no active plan: show plan picker (30/60/90 days) with emerald gradient cards
- If active plan: show progress dashboard:
  - Circular progress ring (juz/30 or page/604)
  - Current juz & page display
  - Daily reading target (pages per day)
  - Streak count (consecutive days with progress)
  - "Mark Today's Reading" button → increment page/juz
  - Calendar heat map (last 30 days, green = read)
- History section: FlatList of completed khatmahs with dates
- ScreenErrorBoundary, RefreshControl, Skeleton loading, EmptyState

---

## AGENT 4: Tafsir Integration

**Creates:**
- `apps/api/src/modules/islamic/data/tafsir.json` (curated tafsir for key verses)
- `apps/mobile/app/(screens)/tafsir-viewer.tsx`

**Modifies:**
- `apps/api/src/modules/islamic/islamic.service.ts` (add tafsir methods)
- `apps/api/src/modules/islamic/islamic.controller.ts` (add tafsir endpoint)
- `apps/mobile/src/services/islamicApi.ts` (add tafsir endpoint)
- `apps/mobile/src/types/islamic.ts` (add Tafsir type)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Backend — tafsir.json (seed data, ~200 lines):**
Array of objects: `{ surahNumber, verseNumber, tafsirSources: [{ name, madhab, text_en, text_ar }] }`
Include at least 20 key verses (Al-Fatiha 1-7, Ayat al-Kursi 2:255, etc.) with 2-3 tafsir sources each (Ibn Kathir, Al-Tabari, Al-Qurtubi).

**Backend — islamic.service.ts — add methods:**
- `getTafsir(surahNumber, verseNumber, source?)` — lookup from JSON data, filter by source if provided
- `getAvailableTafsirSources()` — return list of sources

**Backend — islamic.controller.ts — add endpoints:**
```
GET /islamic/tafsir/:surah/:verse       — get tafsir (OptionalClerkAuthGuard)
GET /islamic/tafsir/sources             — list available sources
```

**Mobile — tafsir-viewer.tsx (~300 lines):**
- Receives `surah` and `verse` as route params
- Displays verse in Arabic (large, centered, gold accent)
- Below: tafsir cards in a ScrollView, one per source
- Each card: source name badge, madhab tag, explanation text
- Source filter BottomSheet (tap filter icon in header)
- Share button in header → share verse + tafsir text
- ScreenErrorBoundary, Skeleton loading

**Mobile — quran-share.tsx — enhance:**
Add a "Tafsir" button below each displayed verse that navigates to `/tafsir-viewer?surah=N&verse=N`

---

## AGENT 5: Communal Quran Reading Rooms

**Creates:**
- `apps/mobile/app/(screens)/quran-room.tsx`
- `apps/api/src/gateways/dto/quran-room-events.dto.ts`

**Modifies:**
- `apps/api/src/gateways/chat.gateway.ts` (add quran room events)
- `apps/mobile/src/services/islamicApi.ts` (add room endpoints)
- `apps/mobile/src/types/islamic.ts` (add QuranRoom types)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Backend — quran-room-events.dto.ts:**
```typescript
export class JoinQuranRoomDto {
  @IsString() roomId: string;
}
export class QuranRoomVerseDto {
  @IsString() roomId: string;
  @IsInt() surahNumber: number;
  @IsInt() verseNumber: number;
}
export class QuranRoomReciterDto {
  @IsString() roomId: string;
  @IsString() userId: string; // who is reciting
}
```

**Backend — chat.gateway.ts — add events:**
```
join_quran_room   → join Socket.io room `quran:${roomId}`, broadcast participant list
leave_quran_room  → leave room, broadcast updated list
quran_verse_sync  → broadcast current verse to all in room (host only)
quran_reciter_change → broadcast who is currently reciting
```

Use in-memory Map `quranRooms: Map<roomId, { hostId, currentSurah, currentVerse, participants: Set<socketId> }>`.

**Mobile — quran-room.tsx (~400 lines):**
- Two modes: Host (create room) and Participant (join via link/code)
- Top section: Current verse display (Arabic text, large)
- Translation toggle below verse
- Participant avatars row (who's in the room)
- Current reciter indicator (gold ring around avatar)
- Host controls BottomSheet: next verse, previous verse, assign reciter
- Participant can tap "Request to recite"
- Auto-scroll text as host advances verses
- Audio indicator when someone is reciting (waveform animation)
- Leave room button
- ScreenErrorBoundary, connection status indicator

**~700 lines total**

---

## AGENT 6: Sadaqah / Charity Integration

**Creates:**
- `apps/api/src/modules/islamic/dto/charity.dto.ts`
- `apps/mobile/app/(screens)/donate.tsx`
- `apps/mobile/app/(screens)/charity-campaign.tsx`

**Modifies:**
- `apps/api/prisma/schema.prisma` (CharityDonation, CharityCampaign — from Agent 0)
- `apps/api/src/modules/islamic/islamic.service.ts` (add charity methods)
- `apps/api/src/modules/islamic/islamic.controller.ts` (add charity endpoints)
- `apps/api/src/modules/payments/payments.service.ts` (add donation payment intent)
- `apps/mobile/src/services/islamicApi.ts`
- `apps/mobile/src/types/islamic.ts`
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Backend — charity.dto.ts:**
```typescript
export class CreateCampaignDto {
  @IsString() @MaxLength(100) title: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsInt() @Min(100) goalAmount: number; // cents, min $1
  @IsOptional() @IsString() imageUrl?: string;
}
export class CreateDonationDto {
  @IsOptional() @IsString() campaignId?: string;
  @IsOptional() @IsString() recipientUserId?: string;
  @IsInt() @Min(100) amount: number; // cents
  @IsIn(['usd', 'gbp', 'eur']) @IsOptional() currency?: string;
}
```

**Backend — islamic.controller.ts — add endpoints:**
```
POST   /islamic/charity/campaigns        — create campaign (ClerkAuthGuard)
GET    /islamic/charity/campaigns         — list active campaigns (OptionalClerkAuthGuard)
GET    /islamic/charity/campaigns/:id     — get campaign details
POST   /islamic/charity/donate            — create donation (ClerkAuthGuard)
GET    /islamic/charity/my-donations      — user's donation history (ClerkAuthGuard)
```

**Backend — payments.service.ts — add method:**
```typescript
async createDonationPaymentIntent(userId: string, amount: number, currency: string) {
  const customer = await this.getOrCreateStripeCustomer(userId);
  return this.stripe.paymentIntents.create({
    amount,
    currency,
    customer: customer.id,
    metadata: { type: 'sadaqah', userId },
  });
}
```

**Mobile — donate.tsx (~300 lines):**
- Amount picker: preset buttons ($5, $10, $25, $50, custom)
- Campaign selector (if navigated from campaign)
- Payment via Stripe (use existing Stripe integration)
- Success animation (emerald checkmark with gold sparkles)
- Recent donations list
- ScreenErrorBoundary, Skeleton loading

**Mobile — charity-campaign.tsx (~250 lines):**
- Campaign details: title, description, image, progress bar
- Donor count + raised amount
- "Donate" CTA button → navigate to donate screen
- Share button
- Creator's other campaigns list
- ScreenErrorBoundary, RefreshControl

**~600 lines total**

---

## AGENT 7: Hajj & Umrah Companion

**Creates:**
- `apps/api/src/modules/islamic/data/hajj-guide.json`
- `apps/api/src/modules/islamic/dto/hajj.dto.ts`
- `apps/mobile/app/(screens)/hajj-companion.tsx`
- `apps/mobile/app/(screens)/hajj-step.tsx`

**Modifies:**
- `apps/api/prisma/schema.prisma` (HajjProgress — from Agent 0)
- `apps/api/src/modules/islamic/islamic.service.ts`
- `apps/api/src/modules/islamic/islamic.controller.ts`
- `apps/mobile/src/services/islamicApi.ts`
- `apps/mobile/src/types/islamic.ts`
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Backend — hajj-guide.json (~150 lines):**
```json
[
  {
    "step": 0, "name": "Ihram", "nameAr": "الإحرام",
    "description": "Enter the sacred state...",
    "duas": [{ "arabic": "...", "transliteration": "...", "english": "..." }],
    "checklist": ["Perform ghusl", "Wear ihram garments", "Make niyyah", "Recite Talbiyah"]
  },
  { "step": 1, "name": "Tawaf", "nameAr": "الطواف", ... },
  { "step": 2, "name": "Sa'i", "nameAr": "السعي", ... },
  { "step": 3, "name": "Mina", "nameAr": "منى", ... },
  { "step": 4, "name": "Arafat", "nameAr": "عرفات", ... },
  { "step": 5, "name": "Muzdalifah", "nameAr": "مزدلفة", ... },
  { "step": 6, "name": "Rami & Final Tawaf", "nameAr": "رمي الجمرات والطواف", ... }
]
```

**Backend — islamic.controller.ts — add endpoints:**
```
GET    /islamic/hajj/guide                — get full guide (public)
GET    /islamic/hajj/progress             — get user's progress (ClerkAuthGuard)
POST   /islamic/hajj/progress             — create progress for year (ClerkAuthGuard)
PATCH  /islamic/hajj/progress/:id         — update step/checklist (ClerkAuthGuard)
```

**Mobile — hajj-companion.tsx (~450 lines):**
- Vertical step timeline (7 steps, emerald line connecting them)
- Each step: circle icon, name (AR+EN), completion status
- Current step highlighted with gold border
- Tap step → navigate to hajj-step screen
- Top card: "Day X of Hajj" with overall progress %
- Bottom: "Share progress" button, "Reset" option
- If no progress: "Start Hajj Tracker" CTA with year picker
- ScreenErrorBoundary, RefreshControl, Skeleton loading

**Mobile — hajj-step.tsx (~350 lines):**
- Step detail: name, description, illustration placeholder
- Duas section: Arabic + transliteration + English, tap to expand
- Checklist: interactive checkboxes, saved to backend
- "Mark Step Complete" button at bottom
- Auto-advance to next step on completion
- ScreenErrorBoundary

**~800 lines total**

---

## AGENT 8: Islamic Scholar Verification Badge

**Creates:**
- `apps/api/src/modules/islamic/dto/scholar-verification.dto.ts`
- `apps/mobile/app/(screens)/scholar-verification.tsx`

**Modifies:**
- `apps/api/prisma/schema.prisma` (ScholarVerification + User fields — from Agent 0)
- `apps/api/src/modules/islamic/islamic.service.ts`
- `apps/api/src/modules/islamic/islamic.controller.ts`
- `apps/mobile/src/components/ui/VerifiedBadge.tsx` (add scholar variant)
- `apps/mobile/src/services/islamicApi.ts`
- `apps/mobile/src/types/islamic.ts`
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Backend — scholar-verification.dto.ts:**
```typescript
export class ApplyScholarVerificationDto {
  @IsString() @MaxLength(200) institution: string;
  @IsOptional() @IsIn(['fiqh', 'hadith', 'tafsir', 'aqeedah', 'general']) specialization?: string;
  @IsOptional() @IsIn(['hanafi', 'maliki', 'shafii', 'hanbali']) madhab?: string;
  @IsArray() @IsString({ each: true }) documentUrls: string[];
}
```

**Backend — islamic.controller.ts — add endpoints:**
```
POST   /islamic/scholar-verification/apply   — submit application (ClerkAuthGuard)
GET    /islamic/scholar-verification/status   — check status (ClerkAuthGuard)
```

**Mobile — VerifiedBadge.tsx — add scholar variant:**
Currently shows blue checkmark. Add a `variant` prop:
```typescript
interface VerifiedBadgeProps {
  size?: number;
  variant?: 'standard' | 'scholar'; // NEW
}
```
Scholar variant: green crescent + star icon instead of checkmark, with gold border.

**Mobile — scholar-verification.tsx (~250 lines):**
- Application form: institution, specialization picker, madhab picker
- Document upload (credential photos) via presigned URL
- Status tracker: Pending → Under Review → Approved/Rejected
- If approved: show badge preview
- ScreenErrorBoundary

**~300 lines total**

---

## AGENT 9: Halal Content Filter

**Creates:**
- `apps/api/src/modules/islamic/dto/content-filter.dto.ts`
- `apps/mobile/app/(screens)/content-filter-settings.tsx`

**Modifies:**
- `apps/api/prisma/schema.prisma` (ContentFilterSetting — from Agent 0)
- `apps/api/src/modules/islamic/islamic.service.ts`
- `apps/api/src/modules/islamic/islamic.controller.ts`
- `apps/api/src/modules/feed/feed.service.ts` (apply filter to feed queries)
- `apps/mobile/src/services/islamicApi.ts`
- `apps/mobile/src/types/islamic.ts`
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Backend — content-filter.dto.ts:**
```typescript
export class UpdateContentFilterDto {
  @IsOptional() @IsIn(['relaxed', 'moderate', 'strict', 'family']) strictnessLevel?: string;
  @IsOptional() @IsBoolean() blurHaram?: boolean;
  @IsOptional() @IsBoolean() hideMusic?: boolean;
  @IsOptional() @IsBoolean() hideMixedGender?: boolean;
}
```

**Backend — islamic.controller.ts — add endpoints:**
```
GET    /islamic/content-filter/settings   — get settings (ClerkAuthGuard)
PATCH  /islamic/content-filter/settings   — update settings (ClerkAuthGuard)
```

**Backend — feed.service.ts — integrate filter:**
In the feed query method, after fetching user's content filter settings:
- `strict` level: exclude posts with `contentWarning` flags, posts with music audio
- `family` level: same as strict + exclude posts from accounts not marked `familySafe`
- `hideMusic`: filter out posts/reels with audioTrackId
- `blurHaram`: add `isBlurred: true` flag to response (client handles blur overlay)

**Mobile — content-filter-settings.tsx (~350 lines):**
- Strictness level selector (4 cards with descriptions):
  - Relaxed: "Standard content filtering"
  - Moderate: "Hides explicitly non-Islamic content" (default)
  - Strict: "Hides music, mixed-gender, questionable content"
  - Family: "Strictest — safe for all ages"
- Individual toggles: blur haram imagery, hide music content, hide mixed-gender
- Preview section showing what each level filters
- ScreenErrorBoundary, Skeleton loading

**~600 lines total**

---

## AGENT 10: Hijri Date Display + Islamic Calendar Enhancement

**Modifies:**
- `apps/mobile/app/(tabs)/_layout.tsx` (add Hijri date to header)
- `apps/mobile/app/(screens)/islamic-calendar.tsx` (enhance with events + month navigation)
- `apps/mobile/src/utils/hijri.ts` (create Hijri date calculation utility)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**utils/hijri.ts (~80 lines):**
```typescript
// Gregorian to Hijri conversion using Kuwaiti algorithm
export function gregorianToHijri(date: Date): { year: number; month: number; day: number } { ... }
export function getHijriMonthName(month: number, locale: 'en' | 'ar'): string { ... }
export function formatHijriDate(date: Date, locale: 'en' | 'ar'): string { ... }
// Returns: "15 Ramadan 1447 AH" or "١٥ رمضان ١٤٤٧ هـ"
```

**tabs/_layout.tsx — add Hijri date:**
Below the tab bar header or in the Saf tab header, add a small Hijri date text:
```tsx
<Text style={{ color: colors.text.tertiary, fontSize: fontSize.xs }}>
  {formatHijriDate(new Date(), isRTL ? 'ar' : 'en')}
</Text>
```

**islamic-calendar.tsx — enhance:**
Replace hardcoded month data with `gregorianToHijri()` utility. Add:
- Month navigation (prev/next arrows)
- Event details on tap (BottomSheet with event description)
- Today auto-highlighted

**~200 lines total**

---

## AGENT 11: Nasheed Mode

**Creates:**
- `apps/mobile/app/(screens)/nasheed-mode.tsx`

**Modifies:**
- `apps/api/src/modules/users/users.service.ts` (add nasheedMode toggle)
- `apps/api/src/modules/users/users.controller.ts` (add endpoint)
- `apps/mobile/src/store/index.ts` (add nasheedMode state)
- `apps/mobile/src/services/api.ts` (add toggle endpoint to usersApi)
- `apps/mobile/app/(screens)/settings.tsx` (add Nasheed Mode row)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Backend — users.controller.ts — add endpoint:**
```
PATCH /users/me/nasheed-mode  — toggle { nasheedMode: boolean } (ClerkAuthGuard)
```

**Mobile — nasheed-mode.tsx (~200 lines):**
- Explanation card: what nasheed mode does (replaces all background music with nasheeds)
- Toggle switch (large, centered)
- Preview: sample nasheed list (3-4 entries with play buttons)
- Info text: "Music in reels and stories will be replaced with nasheeds"
- ScreenErrorBoundary

**Store — add:**
```typescript
nasheedMode: boolean;
setNasheedMode: (enabled: boolean) => void;
```

**settings.tsx — add row:**
Add "Nasheed Mode" row with moon icon + toggle, between existing settings rows.

**~300 lines total**

---

## AGENT 12: Eid / Islamic Holiday Cards & Frames

**Creates:**
- `apps/mobile/app/(screens)/eid-cards.tsx`
- `apps/mobile/src/components/islamic/EidFrame.tsx`

**Modifies:**
- `apps/mobile/app/(screens)/create-story.tsx` (add Eid frame option to story creation)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**EidFrame.tsx (~150 lines):**
```typescript
interface EidFrameProps {
  occasion: 'eid-fitr' | 'eid-adha' | 'ramadan' | 'mawlid' | 'isra-miraj' | 'hijri-new-year';
  children: React.ReactNode; // content inside frame
}
```
- Decorative border with Islamic geometric patterns (using View + transforms, no images)
- Gold + emerald gradient accents
- Occasion-specific greeting text overlay
- Animated sparkle dots

**eid-cards.tsx (~250 lines):**
- Grid of card templates (6 occasions × 2-3 styles each)
- Tap to preview full-screen
- "Share as Story" button → navigate to create-story with frame param
- "Share as Post" button → navigate to create-post with frame overlay
- Seasonal: auto-feature current/upcoming occasion at top
- ScreenErrorBoundary

**create-story.tsx — add frame option:**
Add an "Eid Frame" button in the story decoration toolbar. When active, wrap story content with `<EidFrame occasion={selected} />`.

**~400 lines total**

---

## AGENT 13: Dhikr Social (Extend Existing)

**Creates:**
- `apps/api/src/modules/islamic/dto/dhikr.dto.ts`
- `apps/mobile/app/(screens)/dhikr-challenges.tsx`
- `apps/mobile/app/(screens)/dhikr-challenge-detail.tsx`

**Modifies:**
- `apps/api/prisma/schema.prisma` (DhikrSession, DhikrChallenge, DhikrChallengeParticipant — from Agent 0)
- `apps/api/src/modules/islamic/islamic.service.ts`
- `apps/api/src/modules/islamic/islamic.controller.ts`
- `apps/mobile/app/(screens)/dhikr-counter.tsx` (add social features: share, challenges link)
- `apps/mobile/src/services/islamicApi.ts`
- `apps/mobile/src/types/islamic.ts`
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Backend — dhikr.dto.ts:**
```typescript
export class SaveDhikrSessionDto {
  @IsIn(['subhanallah', 'alhamdulillah', 'allahuakbar', 'lailahaillallah', 'astaghfirullah']) phrase: string;
  @IsInt() @Min(1) count: number;
  @IsOptional() @IsInt() @Min(1) target?: number;
}
export class CreateDhikrChallengeDto {
  @IsString() @MaxLength(100) title: string;
  @IsIn(['subhanallah', 'alhamdulillah', 'allahuakbar', 'lailahaillallah', 'astaghfirullah']) phrase: string;
  @IsInt() @Min(100) targetTotal: number;
  @IsOptional() @IsDateString() expiresAt?: string;
}
export class ContributeDhikrDto {
  @IsInt() @Min(1) count: number;
}
```

**Backend — islamic.controller.ts — add endpoints:**
```
POST   /islamic/dhikr/sessions              — save session (ClerkAuthGuard)
GET    /islamic/dhikr/stats                  — get user stats: total, streak, today (ClerkAuthGuard)
GET    /islamic/dhikr/leaderboard            — top dhikr users this week (OptionalClerkAuthGuard)
POST   /islamic/dhikr/challenges             — create challenge (ClerkAuthGuard)
GET    /islamic/dhikr/challenges             — list active challenges (OptionalClerkAuthGuard)
GET    /islamic/dhikr/challenges/:id         — get challenge detail
POST   /islamic/dhikr/challenges/:id/join    — join challenge (ClerkAuthGuard)
POST   /islamic/dhikr/challenges/:id/contribute — add count (ClerkAuthGuard)
```

**Backend — islamic.service.ts — add methods:**
- `saveDhikrSession(userId, dto)` — create DhikrSession
- `getDhikrStats(userId)` — aggregate: total count, today's count, streak (consecutive days), sets completed
- `getDhikrLeaderboard(period: 'day' | 'week')` — top 20 by total count, include user avatar/name
- `createChallenge(userId, dto)` — create DhikrChallenge
- `listActiveChallenges(cursor, limit)` — where currentTotal < targetTotal AND (expiresAt is null OR > now)
- `joinChallenge(userId, challengeId)` — create participant record
- `contributeToChallenge(userId, challengeId, count)` — increment participant.contributed AND challenge.currentTotal (use $executeRaw for atomic increment)

**Mobile — dhikr-counter.tsx — enhance existing:**
Add below the counter:
- "Share Progress" button → share card with today's count
- "Challenges" button → navigate to dhikr-challenges
- Daily stats bar: streak flame icon + total today

**Mobile — dhikr-challenges.tsx (~250 lines):**
- Active challenges FlatList
- Each card: title, phrase, progress bar (currentTotal/targetTotal), participant count
- "Create Challenge" FAB button → BottomSheet form
- ScreenErrorBoundary, RefreshControl, Skeleton loading, EmptyState

**Mobile — dhikr-challenge-detail.tsx (~200 lines):**
- Challenge header: title, phrase, creator info
- Large progress ring (currentTotal / targetTotal)
- "Contribute" button → opens counter inline (tap to increment, save on done)
- Leaderboard: top contributors list with avatars + counts
- Participant list
- Share button
- ScreenErrorBoundary, RefreshControl

**~500 lines total**

---

## CONFLICT MATRIX

| File | Agents |
|------|--------|
| `prisma/schema.prisma` | Agent 0 only (do first) |
| `islamic.service.ts` | 1, 3, 4, 6, 7, 8, 9, 13 (each adds distinct methods, no overlap) |
| `islamic.controller.ts` | 1, 3, 4, 6, 7, 8, 9, 13 (each adds distinct endpoints, no overlap) |
| `islamicApi.ts` | 1, 3, 4, 5, 6, 7, 8, 9, 13 (each adds distinct API calls) |
| `types/islamic.ts` | 1, 3, 4, 5, 6, 7, 8, 9, 13 (each adds distinct types) |
| `i18n/en.json` + `ar.json` | All agents (each adds own key namespace) |
| `chat.gateway.ts` | 5 only |
| `prayer-times.tsx` | 1, 2 (Agent 1 adds settings, Agent 2 adds Qibla link — different sections) |
| `settings.tsx` | 11 only |
| `store/index.ts` | 11 only |
| `VerifiedBadge.tsx` | 8 only |
| `feed.service.ts` | 9 only |
| `tabs/_layout.tsx` | 10 only |

**Resolution:** Agent 0 (schema) runs first. All other agents can run in parallel — they touch distinct sections of shared files. For `islamic.service.ts` and `islamic.controller.ts`, each agent appends methods/endpoints at the end of the file. For `islamicApi.ts` and `types/islamic.ts`, each agent appends exports.

---

## EXECUTION ORDER

1. **Agent 0** (schema changes) — MUST complete first
2. **Agents 1-13** — all in parallel after Agent 0
3. **Final**: `npx prisma db push` + verify all endpoints in Swagger + smoke test screens

---

## ESTIMATED OUTPUT

| Agent | Feature | Lines |
|-------|---------|-------|
| 0 | Schema | ~120 |
| 1 | Prayer notifications + Adhan | ~500 |
| 2 | Qibla compass | ~300 |
| 3 | Quran reading plans | ~600 |
| 4 | Tafsir | ~500 |
| 5 | Communal Quran rooms | ~700 |
| 6 | Sadaqah / Charity | ~600 |
| 7 | Hajj companion | ~800 |
| 8 | Scholar badge | ~300 |
| 9 | Halal content filter | ~600 |
| 10 | Hijri dates + calendar | ~200 |
| 11 | Nasheed mode | ~300 |
| 12 | Eid cards & frames | ~400 |
| 13 | Dhikr social | ~500 |
| **TOTAL** | | **~6,420** |
