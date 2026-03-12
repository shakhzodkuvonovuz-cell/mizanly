# BATCH 33: P0 Engineering Mega-Batch — 12 Parallel Agents

**Date:** 2026-03-13
**Theme:** Heavy engineering — 5 new backend modules + 7 mobile infrastructure tasks. All create NEW files only. Zero file conflicts. Prisma schema already updated with 8 new models.
**Prerequisite:** Run `cd apps/api && npx prisma generate` before starting agents (schema already updated).

---

## GLOBAL RULES

1. Read `CLAUDE.md` first — mandatory rules
2. No `any` in non-test code. No `@ts-ignore`. No `@ts-expect-error`.
3. ALL new files must be properly typed TypeScript
4. Backend: Follow NestJS module pattern (module.ts, controller.ts, service.ts)
5. Backend: Use `ClerkAuthGuard` for authenticated routes, `OptionalClerkAuthGuard` for public+personalized
6. Backend: Use `@CurrentUser('id')` for userId extraction
7. Backend: Import PrismaService from `../../prisma/prisma.service`
8. Backend: Swagger decorators on all endpoints: `@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiBearerAuth`
9. Backend: Throttle write endpoints: `@Throttle({ default: { limit: 10, ttl: 60000 } })`
10. Mobile: Use existing design system (`@/theme`, `@/components/ui/*`)
11. Mobile: New screens follow glassmorphism pattern (LinearGradient + FadeInUp + GlassHeader)
12. **Do NOT modify any existing file** unless explicitly listed in your task
13. After completing your task: `git add -A && git commit -m "feat: batch 33 agent N — <description>"`

---

## AGENT 1: Events Backend Module

**Creates:** `apps/api/src/modules/events/`
- `events.module.ts`
- `events.controller.ts`
- `events.service.ts`

**Prisma models available:** `Event`, `EventRSVP` (already in schema)

**Endpoints (8):**
```
POST   /events              — Create event (auth required)
GET    /events              — List events (optional auth, cursor pagination)
GET    /events/:id          — Get event detail (optional auth)
PATCH  /events/:id          — Update event (auth, owner only)
DELETE /events/:id          — Delete event (auth, owner only)
POST   /events/:id/rsvp     — RSVP to event (auth required, body: { status: 'going'|'maybe'|'not_going' })
DELETE /events/:id/rsvp     — Remove RSVP (auth required)
GET    /events/:id/attendees — List attendees with pagination (optional auth)
```

**DTOs (inline in controller or separate dto/ folder):**
- CreateEventDto: title, description?, coverUrl?, startDate, endDate?, location?, isOnline, onlineUrl?, eventType, privacy, communityId?
- UpdateEventDto: Partial<CreateEventDto>
- RsvpDto: status (going/maybe/not_going)

**Service patterns:** Use PrismaService for all queries. Include counts (goingCount, maybeCount). Return event with user relation.

**~400-600 lines total**

---

## AGENT 2: Monetization Backend Module (Tips + Memberships)

**Creates:** `apps/api/src/modules/monetization/`
- `monetization.module.ts`
- `monetization.controller.ts`
- `monetization.service.ts`

**Prisma models available:** `Tip`, `MembershipTier`, `MembershipSubscription`

**Endpoints (12):**
```
# Tips
POST   /monetization/tips           — Send tip (auth required, body: { receiverId, amount, message? })
GET    /monetization/tips/sent      — List tips sent by user (auth, cursor pagination)
GET    /monetization/tips/received  — List tips received by user (auth, cursor pagination)
GET    /monetization/tips/stats     — Tip stats: total earned, total sent, top supporters (auth)

# Membership Tiers
POST   /monetization/tiers          — Create tier (auth, body: { name, price, benefits[], level })
GET    /monetization/tiers/:userId  — List user's tiers (optional auth)
PATCH  /monetization/tiers/:id      — Update tier (auth, owner only)
DELETE /monetization/tiers/:id      — Delete tier (auth, owner only)
PATCH  /monetization/tiers/:id/toggle — Toggle tier active/inactive (auth, owner only)

# Subscriptions
POST   /monetization/subscribe/:tierId    — Subscribe to tier (auth)
DELETE /monetization/subscribe/:tierId    — Unsubscribe (auth)
GET    /monetization/subscribers           — List subscribers to my tiers (auth, pagination)
```

**Service patterns:** Calculate platformFee as 10% of tip amount. Revenue stats aggregate by month. Subscription creates with startDate=now.

**~500-700 lines total**

---

## AGENT 3: Two-Factor Auth Backend Module

**Creates:** `apps/api/src/modules/two-factor/`
- `two-factor.module.ts`
- `two-factor.controller.ts`
- `two-factor.service.ts`

**Prisma model available:** `TwoFactorSecret`

**Endpoints (6):**
```
POST   /two-factor/setup     — Generate TOTP secret + QR data URI (auth required)
POST   /two-factor/verify    — Verify TOTP code + enable 2FA (auth, body: { code })
POST   /two-factor/validate  — Validate TOTP code on login (body: { userId, code })
DELETE /two-factor/disable   — Disable 2FA (auth, body: { code } to confirm)
GET    /two-factor/status    — Check if 2FA enabled for user (auth)
POST   /two-factor/backup    — Use backup code (body: { userId, backupCode })
```

**Dependencies:** Use `otplib` for TOTP generation (import { authenticator } from 'otplib'). Use `qrcode` for QR data URI. Use `crypto` for hashing backup codes.

**Service patterns:**
- setup(): Generate 32-char secret, create 8 backup codes, store hashed. Return { secret, qrDataUri, backupCodes }
- verify(): Validate TOTP token against secret. If valid, set isEnabled=true, verifiedAt=now
- validate(): Check token against secret. Return { valid: boolean }
- backup(): Hash input, compare against stored hashed codes. Remove used code.

**Note:** Add `otplib` and `qrcode` to import but they may not be installed. Code should be correct regardless — user will `npm install` later.

**~350-500 lines total**

---

## AGENT 4: Audio Rooms Backend Module

**Creates:** `apps/api/src/modules/audio-rooms/`
- `audio-rooms.module.ts`
- `audio-rooms.controller.ts`
- `audio-rooms.service.ts`

**Prisma models available:** `AudioRoom`, `AudioRoomParticipant`

**Endpoints (10):**
```
POST   /audio-rooms             — Create room (auth, body: { title, description?, scheduledAt? })
GET    /audio-rooms             — List active rooms (optional auth, cursor pagination)
GET    /audio-rooms/:id         — Get room detail with participants (optional auth)
DELETE /audio-rooms/:id         — End room (auth, host only)
POST   /audio-rooms/:id/join    — Join room as listener (auth)
DELETE /audio-rooms/:id/leave   — Leave room (auth)
PATCH  /audio-rooms/:id/role    — Change participant role (auth, host only, body: { userId, role })
PATCH  /audio-rooms/:id/hand    — Toggle hand raised (auth)
PATCH  /audio-rooms/:id/mute    — Toggle mute (auth, self or host for others)
GET    /audio-rooms/:id/participants — List participants by role (optional auth)
```

**Service patterns:**
- Create sets hostId, status='live', startedAt=now. Auto-add host as participant with role='host', isMuted=false
- Join adds participant with role='listener', isMuted=true
- Role changes: host can promote listener→speaker or demote speaker→listener
- End room: set status='ended', endedAt=now. Remove all participants.
- Hand raised: only listeners can raise hand. Host sees raised hands and can promote.

**~400-600 lines total**

---

## AGENT 5: Islamic APIs Backend Module

**Creates:** `apps/api/src/modules/islamic/`
- `islamic.module.ts`
- `islamic.controller.ts`
- `islamic.service.ts`

**No new Prisma models** — this module serves static/computed data (prayer times, hadith, mosques, zakat calculations).

**Endpoints (8):**
```
GET    /islamic/prayer-times     — Get prayer times for location (query: lat, lng, method?, date?)
GET    /islamic/prayer-times/methods — List calculation methods
GET    /islamic/hadith/daily     — Get daily hadith (rotates daily)
GET    /islamic/hadith/:id       — Get specific hadith by ID
GET    /islamic/hadith           — List hadiths (cursor pagination)
GET    /islamic/mosques          — Find nearby mosques (query: lat, lng, radius?)
GET    /islamic/zakat/calculate  — Calculate zakat (query: cash, gold, silver, investments, debts)
GET    /islamic/ramadan          — Get Ramadan info (query: year?, lat?, lng?)
```

**Service patterns:**
- Prayer times: Use Aladhan API formula or hardcoded calculation. Support methods: MWL, ISNA, Egypt, Makkah, Karachi.
- Hadith: Serve from static JSON array of 40 hadiths (Nawawi's 40). Daily rotation by day-of-year % 40.
- Mosques: Return mock data for now (8 mosques with lat/lng/name/address/facilities). Real integration later.
- Zakat: Pure calculation — 2.5% of (cash + gold_value + silver_value + investments - debts) if above nisab (gold: 85g × price, silver: 595g × price). Use hardcoded gold_price=$68/g, silver_price=$0.82/g.
- Ramadan: Return current Ramadan status, day number, iftar/suhoor times based on prayer calculation.

**All endpoints use OptionalClerkAuthGuard** (public data).

**Include static hadith data:** Create a `data/hadiths.json` file inside the module with 40 entries: { id, arabic, english, source, narrator, chapter }.

**~500-700 lines total**

---

## AGENT 6: i18n Framework (Mobile)

**Creates:**
- `apps/mobile/src/i18n/index.ts` — i18n configuration
- `apps/mobile/src/i18n/en.json` — English translations (comprehensive, 200+ keys)
- `apps/mobile/src/i18n/ar.json` — Arabic translations (matching en.json keys)
- `apps/mobile/src/hooks/useTranslation.ts` — Translation hook
- `apps/mobile/src/utils/rtl.ts` — RTL layout utilities

**i18n/index.ts pattern:**
```tsx
// Use react-i18next with expo-localization
// Configure i18next with en + ar resources
// Default: en, fallback: en
// Detect device language via expo-localization
```

**en.json structure (organize by screen/feature):**
```json
{
  "common": { "save": "Save", "cancel": "Cancel", "delete": "Delete", "loading": "Loading...", "error": "Something went wrong", "retry": "Retry", "done": "Done", "next": "Next", "back": "Back", "search": "Search", "share": "Share", "edit": "Edit", "settings": "Settings" },
  "auth": { "signIn": "Sign In", "signUp": "Sign Up", "forgotPassword": "Forgot Password?", ... },
  "tabs": { "saf": "Saf", "bakra": "Bakra", "majlis": "Majlis", "risalah": "Risalah", "minbar": "Minbar" },
  "saf": { "feed": "Feed", "following": "Following", "forYou": "For You", "newPost": "New Post", ... },
  "bakra": { ... },
  "majlis": { ... },
  "risalah": { "messages": "Messages", "newMessage": "New Message", "typeMessage": "Type a message...", ... },
  "minbar": { ... },
  "profile": { "followers": "Followers", "following": "Following", "posts": "Posts", "editProfile": "Edit Profile", ... },
  "islamic": { "prayerTimes": "Prayer Times", "hadith": "Daily Hadith", "dhikr": "Dhikr Counter", "zakat": "Zakat Calculator", "mosque": "Nearby Mosques", "ramadan": "Ramadan", ... },
  "monetization": { "tips": "Tips", "sendTip": "Send Tip", "membership": "Membership", ... },
  "notifications": { ... },
  "settings": { ... }
}
```

**ar.json:** Full Arabic translations for ALL keys in en.json. Use proper Arabic (not transliteration):
- "Save" → "حفظ", "Cancel" → "إلغاء", "Delete" → "حذف", "Search" → "بحث"
- "Prayer Times" → "أوقات الصلاة", "Ramadan" → "رمضان", etc.

**useTranslation.ts:**
```tsx
// Wraps react-i18next useTranslation
// Returns { t, language, changeLanguage, isRTL }
// isRTL computed from language === 'ar'
```

**rtl.ts:**
```tsx
// RTL-aware style helpers:
// rtlFlexRow(isRTL): flexDirection row/row-reverse
// rtlTextAlign(isRTL): textAlign left/right
// rtlMargin(isRTL, start, end): marginLeft/Right swapped
// rtlPadding(isRTL, start, end): paddingLeft/Right swapped
// rtlIcon(isRTL): returns transform scaleX(-1) for directional icons
```

**~600-800 lines total across all files**

---

## AGENT 7: Image Carousel + Gallery Components (Mobile)

**Creates:**
- `apps/mobile/src/components/ui/ImageCarousel.tsx`
- `apps/mobile/src/components/ui/ImageGallery.tsx`

**ImageCarousel.tsx (~300 lines):**
Horizontal swipeable image carousel for multi-image posts.

```tsx
interface ImageCarouselProps {
  images: string[];           // Array of image URIs
  height?: number;            // Default 400
  showIndicators?: boolean;   // Dot indicators, default true
  onImagePress?: (index: number) => void;  // Opens gallery
  borderRadius?: number;      // Default radius.lg
}
```

Features:
- Horizontal FlatList with pagingEnabled + snapToInterval
- Dot indicators below (emerald active, dark.surface inactive)
- Image count badge top-right: "2/5" in glass pill
- Pinch-to-zoom disabled (that's for the gallery)
- Smooth scroll with `decelerationRate="fast"`
- Uses `Image` from react-native with resizeMode="cover"

**ImageGallery.tsx (~400 lines):**
Full-screen lightbox gallery with pinch-to-zoom.

```tsx
interface ImageGalleryProps {
  images: string[];
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
}
```

Features:
- Full-screen modal-style overlay (use Animated.View, NOT RN Modal)
- Black background with status bar hidden
- Horizontal FlatList for swiping between images
- Pinch-to-zoom on each image using `react-native-reanimated` gestures:
  - useSharedValue for scale, translationX, translationY
  - Double-tap to toggle 1x → 2x zoom
  - Pinch gesture for continuous zoom (1x - 4x)
- Close button (top-left, `x` icon in glass circle)
- Image counter (top-center): "2 / 5" in glass pill
- Share button (top-right, `share` icon in glass circle)
- Swipe down to dismiss (with animated opacity)
- FadeInUp entrance animation

**Both components follow glassmorphism for controls/indicators.**

**~700 lines total**

---

## AGENT 8: Video Player Enhancements (Mobile)

**Creates:**
- `apps/mobile/src/components/ui/VideoControls.tsx`
- `apps/mobile/src/components/ui/MiniPlayer.tsx`

**VideoControls.tsx (~350 lines):**
Overlay controls for video playback with quality and speed selectors.

```tsx
interface VideoControlsProps {
  isPlaying: boolean;
  currentTime: number;        // seconds
  duration: number;           // seconds
  quality: VideoQuality;
  speed: PlaybackSpeed;
  volume: number;             // 0-1
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onQualityChange: (q: VideoQuality) => void;
  onSpeedChange: (s: PlaybackSpeed) => void;
  onVolumeChange: (v: number) => void;
  onFullscreen?: () => void;
  onMinimize?: () => void;    // Opens mini player
}

type VideoQuality = '360p' | '480p' | '720p' | '1080p' | '4K';
type PlaybackSpeed = 0.25 | 0.5 | 0.75 | 1 | 1.25 | 1.5 | 1.75 | 2;
```

Features:
- Play/pause center button (large, 64x64 glass circle)
- Seek bar: glass track with emerald fill + gold thumb
- Time display: "01:23 / 05:45" in glass pill
- Bottom bar with icons: quality, speed, volume, fullscreen, minimize
- Quality selector: BottomSheet with quality options (glass cards, selected = emerald check)
- Speed selector: BottomSheet with speed options
- Auto-hide controls after 3 seconds (animated opacity)
- Skip forward/back buttons (±10s): `fast-forward` / `rewind` icons

**MiniPlayer.tsx (~350 lines):**
Floating mini player that persists while browsing.

```tsx
interface MiniPlayerProps {
  videoTitle: string;
  channelName: string;
  thumbnailUri?: string;
  isPlaying: boolean;
  progress: number;           // 0-1
  onPlayPause: () => void;
  onClose: () => void;
  onExpand: () => void;       // Return to full player
}
```

Features:
- Fixed position at bottom of screen (above tab bar, ~64px height)
- Glass card background with blur
- Thumbnail (48x48 rounded) + title + channel name
- Play/pause button + close (x) button
- Thin progress bar at top (emerald fill)
- Swipe up to expand, swipe right to dismiss
- PanGestureHandler for swipe gestures
- Animated entrance from bottom

**~700 lines total**

---

## AGENT 9: Story Stickers System (Mobile)

**Creates:** `apps/mobile/src/components/story/`
- `PollSticker.tsx`
- `QuizSticker.tsx`
- `QuestionSticker.tsx`
- `CountdownSticker.tsx`
- `SliderSticker.tsx`

**Each sticker: ~150-200 lines. All share this pattern:**
```tsx
interface [Sticker]Props {
  data: [StickserData];
  onResponse?: (response: any) => void;  // Properly typed per sticker
  isCreator?: boolean;         // Shows results vs interaction
  style?: ViewStyle;
}
```

**PollSticker.tsx:**
- 2-4 options displayed as glass bars
- Tap to vote → option fills with emerald/gold gradient showing percentage
- After voting: show results with vote counts + percentages
- Creator view: shows results always
- Animated fill on vote

**QuizSticker.tsx:**
- Question text + 4 answer options in glass cards
- One correct answer (marked by creator)
- Tap answer → green check on correct, red X on wrong
- Shows correct answer after response
- Confetti-like animation on correct answer (use emerald particles placeholder)

**QuestionSticker.tsx:**
- "Ask me anything" card with glass TextInput
- Submit button with emerald gradient
- Creator view: scrollable list of submitted questions in glass cards
- "Reply" button per question for creator

**CountdownSticker.tsx:**
- Event name + target datetime
- Live countdown: DD:HH:MM:SS in large text
- Glass card with gold accent border
- Pulsing animation when < 1 hour remaining
- "Remind Me" toggle button
- Shows "Event started!" when countdown reaches 0

**SliderSticker.tsx:**
- Emoji + question text (e.g., "How much do you love this? 🔥")
- Horizontal slider with emoji at current position
- Glass track with gradient fill (emerald → gold)
- After sliding: shows average value from all responses
- Animated fill to show average position

**All stickers use glassmorphism, FadeInUp, theme tokens.**

**~900 lines total across 5 files**

---

## AGENT 10: Link Preview + 2FA Screens (Mobile)

**Creates:**
- `apps/mobile/src/components/ui/LinkPreview.tsx`
- `apps/mobile/app/(screens)/2fa-setup.tsx`
- `apps/mobile/app/(screens)/2fa-verify.tsx`

**LinkPreview.tsx (~200 lines):**
```tsx
interface LinkPreviewProps {
  url: string;
  onPress?: () => void;
}
```

Features:
- Glass card with: favicon placeholder, domain name, page title, description snippet, preview image
- Loading skeleton while "fetching" metadata
- Error state: just shows URL as link
- Tap opens external browser (Linking.openURL)
- Extracts domain from URL for display
- Uses mock data for preview (real fetching = backend integration later)

**2fa-setup.tsx (~400 lines):**
Full glassmorphism screen:
- GlassHeader "Two-Factor Authentication"
- Info card explaining 2FA benefits (lock icon, glass card)
- Step 1: "Install authenticator app" with app suggestions (Google Authenticator, Authy)
- Step 2: QR code display (large glass card with placeholder QR, manual key below)
- Step 3: Verification code input (6-digit, glass cards per digit)
- "Enable 2FA" emerald gradient button
- Backup codes display card after enable (8 codes in 2-column grid, glass cards)
- "Download Backup Codes" button
- Copy-to-clipboard functionality

**2fa-verify.tsx (~300 lines):**
- GlassHeader "Verify Identity"
- Lock icon hero (large, emerald gradient background)
- 6-digit code input (each digit in separate glass TextInput)
- Auto-submit when 6 digits entered
- "Use backup code instead" link → switches to backup code TextInput
- Loading state during verification
- Error state with shake animation
- Success → navigate back
- "Lost access?" help link

**~900 lines total across 3 files**

---

## AGENT 11: New API Clients + Types (Mobile)

**Creates:**
- `apps/mobile/src/services/eventsApi.ts`
- `apps/mobile/src/services/monetizationApi.ts`
- `apps/mobile/src/services/twoFactorApi.ts`
- `apps/mobile/src/services/audioRoomsApi.ts`
- `apps/mobile/src/services/islamicApi.ts`
- `apps/mobile/src/types/events.ts`
- `apps/mobile/src/types/monetization.ts`
- `apps/mobile/src/types/audioRooms.ts`
- `apps/mobile/src/types/islamic.ts`
- `apps/mobile/src/types/twoFactor.ts`

**Pattern (follow existing api.ts):**
```tsx
import { api } from './api';  // Import base ApiClient

export const eventsApi = {
  create: (data: CreateEventDto) => api.post('/events', data),
  list: (cursor?: string) => api.get('/events', { params: { cursor } }),
  // ... etc matching backend endpoints
};
```

**Types pattern:**
```tsx
export interface Event {
  id: string;
  title: string;
  description?: string;
  // ... matching Prisma model
}
```

**Each API client mirrors the corresponding backend agent's endpoints exactly.**
**Each type file exports interfaces matching the Prisma models + DTOs.**

**~600 lines total across 10 files**

---

## AGENT 12: Push Notification Infrastructure (Mobile)

**Creates:**
- `apps/mobile/src/services/pushNotifications.ts`
- `apps/mobile/src/hooks/usePushNotificationHandler.ts`
- `apps/mobile/src/utils/deepLinking.ts`

**pushNotifications.ts (~250 lines):**
```tsx
// Expo Notifications setup
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

// registerForPushNotifications(): Request permissions, get ExpoPushToken, register with backend (devicesApi)
// configurePushChannels(): Set up notification channels (messages, likes, follows, mentions, live, islamic)
// schedulePrayerNotification(prayerName, time): Schedule local notification for prayer times
// scheduleRamadanNotification(type, time): Schedule iftar/suhoor reminders
```

**usePushNotificationHandler.ts (~250 lines):**
```tsx
// Hook that handles incoming notifications
// Sets up listeners for:
//   - Foreground notifications (show in-app banner)
//   - Background notifications (handle silently)
//   - Notification tap response (navigate to relevant screen)
//
// Navigation mapping:
//   type 'like' → post/[id]
//   type 'comment' → post/[id]
//   type 'follow' → profile/[username]
//   type 'message' → conversation/[id]
//   type 'mention' → thread/[id] or post/[id]
//   type 'live' → live/[id]
//   type 'prayer' → prayer-times
//   type 'event' → event-detail (new screen)
```

**deepLinking.ts (~150 lines):**
```tsx
// Deep link URL scheme: mizanly://
// Route mapping:
//   mizanly://post/:id → (screens)/post/[id]
//   mizanly://profile/:username → (screens)/profile/[username]
//   mizanly://conversation/:id → (screens)/conversation/[id]
//   mizanly://live/:id → (screens)/live/[id]
//   mizanly://event/:id → (screens)/event-detail
//   mizanly://prayer-times → (screens)/prayer-times
//
// parseDeepLink(url: string): { screen: string, params: Record<string, string> }
// getDeepLinkUrl(screen, params): string
```

**~650 lines total across 3 files**

---

## FILE → AGENT CONFLICT MAP (zero overlaps)

| Agent | Files Created | Touches Existing? |
|-------|--------------|-------------------|
| 1 | `modules/events/` (3 files) | NO |
| 2 | `modules/monetization/` (3 files) | NO |
| 3 | `modules/two-factor/` (3 files) | NO |
| 4 | `modules/audio-rooms/` (3 files) | NO |
| 5 | `modules/islamic/` (3+ files) | NO |
| 6 | `src/i18n/` (3 files) + `hooks/` + `utils/` | NO |
| 7 | `components/ui/ImageCarousel.tsx`, `ImageGallery.tsx` | NO |
| 8 | `components/ui/VideoControls.tsx`, `MiniPlayer.tsx` | NO |
| 9 | `components/story/` (5 files) | NO |
| 10 | `components/ui/LinkPreview.tsx`, `(screens)/2fa-*.tsx` | NO |
| 11 | `services/*Api.ts`, `types/*.ts` (10 files) | NO |
| 12 | `services/pushNotifications.ts`, `hooks/`, `utils/` | NO |

**ZERO file conflicts. All agents create NEW files only.**

---

## POST-BATCH TASKS (after all 12 agents complete)

1. Register new backend modules in `app.module.ts` (add imports + module references)
2. Run `npx prisma db push` to sync schema
3. Run `npm install otplib qrcode` in api/ (for 2FA)
4. Run `npm install react-i18next i18next expo-localization` in mobile/ (for i18n)
5. Run `npm install expo-notifications expo-device` in mobile/ (for push)
6. Wire new API clients into existing screens (separate integration batch)
7. Add i18n `t()` calls to existing screen text (separate i18n rollout batch)

---

## VERIFICATION CHECKLIST

**Backend (Agents 1-5):**
- [ ] Module file exports class with @Module decorator
- [ ] Controller has @ApiTags, @Controller decorator with route prefix
- [ ] All endpoints have @ApiOperation + @ApiResponse decorators
- [ ] Auth endpoints use @UseGuards(ClerkAuthGuard) + @ApiBearerAuth
- [ ] Public endpoints use @UseGuards(OptionalClerkAuthGuard)
- [ ] Write endpoints have @Throttle
- [ ] Service uses PrismaService injection
- [ ] 0 instances of `as any`
- [ ] Proper error handling (NotFoundException, ForbiddenException, BadRequestException)

**Mobile (Agents 6-12):**
- [ ] All components/screens properly typed
- [ ] New screens follow glassmorphism pattern
- [ ] 0 instances of `as any`
- [ ] API clients match backend endpoint signatures
- [ ] Types match Prisma model fields
