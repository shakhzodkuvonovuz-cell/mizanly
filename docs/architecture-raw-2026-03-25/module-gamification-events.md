# Module Architecture: Gamification + Events

> Extracted 2026-03-25 by architecture agent. Covers every endpoint, service method, DTO field, Prisma model, enum, test case, and integration point.

---

## Table of Contents

1. [Gamification Module Overview](#1-gamification-module-overview)
2. [Prisma Models & Enums (Gamification)](#2-prisma-models--enums-gamification)
3. [DTOs (Gamification)](#3-dtos-gamification)
4. [Controller Endpoints (Gamification)](#4-controller-endpoints-gamification)
5. [Service Methods (Gamification)](#5-service-methods-gamification)
6. [XP Reward System](#6-xp-reward-system)
7. [Level Threshold System](#7-level-threshold-system)
8. [Events Module Overview](#8-events-module-overview)
9. [Prisma Models & Enums (Events)](#9-prisma-models--enums-events)
10. [DTOs (Events)](#10-dtos-events)
11. [Controller Endpoints (Events)](#11-controller-endpoints-events)
12. [Service Methods (Events)](#12-service-methods-events)
13. [Notification Integration](#13-notification-integration)
14. [Test Coverage](#14-test-coverage)
15. [Concurrency & Edge Case Handling](#15-concurrency--edge-case-handling)
16. [Architectural Notes & Observations](#16-architectural-notes--observations)

---

## 1. Gamification Module Overview

**Files:**
| File | Path | Lines |
|------|------|-------|
| Module | `apps/api/src/modules/gamification/gamification.module.ts` | 12 |
| Controller | `apps/api/src/modules/gamification/gamification.controller.ts` | 225 |
| Service | `apps/api/src/modules/gamification/gamification.service.ts` | 698 |
| DTOs | `apps/api/src/modules/gamification/dto/gamification.dto.ts` | 52 |
| Controller Tests | `apps/api/src/modules/gamification/gamification.controller.spec.ts` | 170 |
| Service Tests | `apps/api/src/modules/gamification/gamification.service.spec.ts` | 482 |
| Concurrency Tests | `apps/api/src/modules/gamification/gamification.service.concurrency.spec.ts` | 108 |
| Edge Case Tests | `apps/api/src/modules/gamification/gamification.service.edge.spec.ts` | 132 |

**Module wiring** (line 1-12 of `gamification.module.ts`):
- Imports: `NotificationsModule`
- Controllers: `GamificationController`
- Providers: `GamificationService`
- Exports: `GamificationService` (consumed by other modules for XP awards)

**Dependencies injected into service:**
- `PrismaService` — database access
- `NotificationsService` — sends notifications on challenge join/completion

**Global throttle:** 30 requests per 60 seconds (controller-level, line 21).

---

## 2. Prisma Models & Enums (Gamification)

### 2.1 UserStreak (schema.prisma line 3405-3417)
```prisma
model UserStreak {
  id             String     @id @default(uuid())
  userId         String
  streakType     StreakType  @default(POSTING)
  currentDays    Int        @default(0)
  longestDays    Int        @default(0)
  lastActiveDate DateTime   @db.Date
  startedAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt
  user           User       @relation(...)

  @@unique([userId, streakType])
  @@map("user_streaks")
}
```
- **Table:** `user_streaks`
- **Composite unique:** `[userId, streakType]` — one streak per type per user
- **ID strategy:** UUID

### 2.2 UserXP (schema.prisma line 3447-3457)
```prisma
model UserXP {
  id        String      @id @default(uuid())
  userId    String      @unique
  totalXP   Int         @default(0)
  level     Int         @default(1)
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  user      User        @relation(...)
  history   XPHistory[]

  @@map("user_xp")
}
```
- **Table:** `user_xp`
- **One-to-one with User** via `@unique` on `userId`

### 2.3 XPHistory (schema.prisma line 3460-3469)
```prisma
model XPHistory {
  id        String   @id @default(uuid())
  userXPId  String
  amount    Int
  reason    String   // post_created | comment_helpful | quran_read | challenge_completed | etc.
  createdAt DateTime @default(now())
  userXP    UserXP   @relation(...)

  @@index([userXPId, createdAt(sort: Desc)])
  @@map("xp_history")
}
```
- **Table:** `xp_history`
- **Index:** Composite `[userXPId, createdAt DESC]` for efficient history queries

### 2.4 Achievement (schema.prisma line 3420-3433)
```prisma
model Achievement {
  id          String              @id @default(uuid())
  key         String              @unique  // first_post, 100_days, quran_khatmah, ramadan_warrior, etc.
  name        String              @db.VarChar(100)
  description String              @db.VarChar(300)
  iconUrl     String?
  category    AchievementCategory
  xpReward    Int                 @default(0)
  rarity      AchievementRarity   @default(COMMON)
  criteria    String              @db.Text  // JSON criteria for unlocking
  createdAt   DateTime            @default(now())
  unlocks     UserAchievement[]

  @@map("achievements")
}
```
- **Table:** `achievements`
- **Unique key:** `key` field — used for programmatic unlock lookups

### 2.5 UserAchievement (schema.prisma line 3436-3444)
```prisma
model UserAchievement {
  userId        String
  achievementId String
  unlockedAt    DateTime    @default(now())
  user          User        @relation(...)
  achievement   Achievement @relation(...)

  @@id([userId, achievementId])
  @@map("user_achievements")
}
```
- **Table:** `user_achievements`
- **Composite PK:** `[userId, achievementId]` — prevents duplicate unlocks at DB level

### 2.6 Challenge (schema.prisma line 3472-3492)
```prisma
model Challenge {
  id               String                 @id @default(uuid())
  title            String                 @db.VarChar(200)
  description      String                 @db.VarChar(1000)
  coverUrl         String?
  challengeType    ChallengeType
  category         ChallengeCategory
  targetCount      Int                    @default(1)
  xpReward         Int                    @default(100)
  startDate        DateTime
  endDate          DateTime
  isActive         Boolean                @default(true)
  createdById      String
  participantCount Int                    @default(0)
  createdAt        DateTime               @default(now())
  updatedAt        DateTime               @updatedAt
  creator          User                   @relation("ChallengeCreator", ...)
  participants     ChallengeParticipant[]

  @@index([isActive, endDate])
  @@map("challenges")
}
```
- **Table:** `challenges`
- **Index:** `[isActive, endDate]` — efficient filtering for active challenges
- **Note:** Uses `createdById` (not `userId`) for the creator relation

### 2.7 ChallengeParticipant (schema.prisma line 3495-3506)
```prisma
model ChallengeParticipant {
  challengeId String
  userId      String
  progress    Int       @default(0)
  completed   Boolean   @default(false)
  completedAt DateTime?
  joinedAt    DateTime  @default(now())
  challenge   Challenge @relation(...)
  user        User      @relation(...)

  @@id([challengeId, userId])
  @@map("challenge_participants")
}
```
- **Table:** `challenge_participants`
- **Composite PK:** `[challengeId, userId]` — one participation per user per challenge

### 2.8 Series (schema.prisma line 3509-3527)
```prisma
model Series {
  id             String           @id @default(uuid())
  userId         String
  title          String           @db.VarChar(200)
  description    String?          @db.VarChar(1000)
  coverUrl       String?
  category       SeriesCategory
  episodeCount   Int              @default(0)
  followersCount Int              @default(0)
  isComplete     Boolean          @default(false)
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt
  creator        User             @relation(...)
  episodes       SeriesEpisode[]
  followers      SeriesFollower[]
  progress       SeriesProgress[]

  @@index([userId])
  @@map("series")
}
```
- **Table:** `series`
- **Denormalized counts:** `episodeCount`, `followersCount` — kept in sync via transactions

### 2.9 SeriesEpisode (schema.prisma line 3530-3550)
```prisma
model SeriesEpisode {
  id           String    @id @default(uuid())
  seriesId     String
  number       Int
  title        String    @db.VarChar(200)
  videoUrl     String?
  thumbnailUrl String?
  duration     Int?      // seconds
  postId       String?
  post         Post?     @relation("seriesEpisodePosts", ...)
  reelId       String?
  reel         Reel?     @relation("seriesEpisodeReels", ...)
  videoId      String?
  video        Video?    @relation("seriesEpisodeVideos", ...)
  releasedAt   DateTime?
  createdAt    DateTime  @default(now())
  series       Series    @relation(...)

  @@unique([seriesId, number])
  @@index([seriesId, number])
  @@map("series_episodes")
}
```
- **Table:** `series_episodes`
- **Composite unique:** `[seriesId, number]` — unique episode numbering per series
- **Polymorphic content:** Episode can link to a Post, Reel, or Video (optional FK to each)

### 2.10 SeriesFollower (schema.prisma line 3553-3562)
```prisma
model SeriesFollower {
  seriesId   String
  userId     String
  user       User     @relation("seriesFollows", ...)
  followedAt DateTime @default(now())
  series     Series   @relation(...)

  @@id([seriesId, userId])
  @@index([userId])
  @@map("series_followers")
}
```
- **Table:** `series_followers`
- **Composite PK:** `[seriesId, userId]`

### 2.11 SeriesProgress (schema.prisma line 3579-3591)
```prisma
model SeriesProgress {
  id             String   @id @default(cuid())
  seriesId       String
  series         Series   @relation(...)
  userId         String
  user           User     @relation("seriesProgress", ...)
  lastEpisodeNum Int
  lastTimestamp  Int      @default(0)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([seriesId, userId])
  @@map("series_progress")
}
```
- **Table:** `series_progress`
- **Note:** Uses `cuid()` (unlike other gamification models which use `uuid()`)
- **Composite unique:** `[seriesId, userId]` — one progress record per user per series

### 2.12 ProfileCustomization (schema.prisma line 3594-3609)
```prisma
model ProfileCustomization {
  id              String         @id @default(uuid())
  userId          String         @unique
  accentColor     String?        @db.VarChar(7)  // hex color
  layoutStyle     ProfileLayout  @default(DEFAULT)
  backgroundUrl   String?
  backgroundMusic String?        // audio track URL
  showBadges      Boolean        @default(true)
  showLevel       Boolean        @default(true)
  showStreak      Boolean        @default(true)
  bioFont         ProfileBioFont @default(DEFAULT)
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  user            User           @relation(...)

  @@map("profile_customizations")
}
```
- **Table:** `profile_customizations`
- **One-to-one with User** via `@unique` on `userId`

### 2.13 Enums

**StreakType** (schema.prisma line 288-294):
| Value | Description |
|-------|-------------|
| `POSTING` | Daily posting streak |
| `ENGAGEMENT` | Daily engagement (comments/likes) |
| `QURAN` | Daily Quran reading |
| `DHIKR` | Daily dhikr completion |
| `LEARNING` | Daily learning activities |

**AchievementCategory** (schema.prisma line 546-552):
| Value | Description |
|-------|-------------|
| `CONTENT` | Content creation achievements |
| `SOCIAL_ACH` | Social interaction achievements |
| `ISLAMIC` | Islamic practice achievements |
| `MILESTONE` | Milestone achievements (streaks, levels) |
| `SPECIAL` | Special/limited-time achievements |

**AchievementRarity** (schema.prisma line 554-559):
| Value | Description |
|-------|-------------|
| `COMMON` | Default rarity |
| `RARE` | Moderately difficult to obtain |
| `EPIC` | Very difficult to obtain |
| `LEGENDARY` | Extremely rare |

**ChallengeType** (schema.prisma line 454-459):
| Value | Description |
|-------|-------------|
| `DAILY` | Must complete every day |
| `WEEKLY` | Weekly target |
| `MONTHLY` | Monthly target |
| `CUSTOM` | Custom timeframe |

**ChallengeCategory** (schema.prisma line 334-341):
| Value | Description |
|-------|-------------|
| `QURAN` | Quran-related challenges |
| `DHIKR` | Dhikr challenges |
| `PHOTOGRAPHY` | Photography challenges |
| `FITNESS` | Fitness challenges |
| `COOKING` | Cooking challenges |
| `LEARNING` | Learning challenges |

**Note:** The DTO accepts additional categories not in the enum: `charity`, `community`, `custom`. The service casts `dto.category as ChallengeCategory` (line 319 of service) which would fail at DB level if invalid.

**SeriesCategory** (schema.prisma line 561-567):
| Value | Description |
|-------|-------------|
| `DRAMA` | Dramatic series |
| `DOCUMENTARY` | Documentary series |
| `TUTORIAL` | Tutorial/educational |
| `COMEDY` | Comedy series |
| `ISLAMIC_SERIES` | Islamic content series |

**ProfileLayout** (schema.prisma line 274-279):
| Value | Description |
|-------|-------------|
| `DEFAULT` | Standard layout |
| `GRID` | Grid layout |
| `MAGAZINE` | Magazine-style layout |
| `MINIMAL` | Minimalist layout |

**ProfileBioFont** (schema.prisma line 281-286):
| Value | Description |
|-------|-------------|
| `DEFAULT` | Default platform font |
| `SERIF` | Serif font |
| `MONO` | Monospace font |
| `ARABIC` | Arabic-optimized font |

---

## 3. DTOs (Gamification)

**File:** `apps/api/src/modules/gamification/dto/gamification.dto.ts` (52 lines)

### 3.1 CreateChallengeDto (line 7-17)
| Field | Type | Validation | Required |
|-------|------|-----------|----------|
| `title` | `string` | `@MaxLength(200)` | Yes |
| `description` | `string` | `@MaxLength(1000)` | Yes |
| `coverUrl` | `string?` | `@IsUrl()` | No |
| `challengeType` | `string` | `@IsIn(['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'])` | Yes |
| `category` | `string` | `@IsIn(['quran', 'dhikr', 'photography', 'fitness', 'charity', 'community', 'learning', 'custom'])` | Yes |
| `targetCount` | `number` | `@IsInt() @Min(1) @Max(10000)` | Yes |
| `xpReward` | `number?` | `@IsInt() @Min(1) @Max(500)` | No |
| `startDate` | `string` | `@IsDateString()` | Yes |
| `endDate` | `string` | `@IsDateString()` | Yes |

### 3.2 UpdateProgressDto (line 19-22)
| Field | Type | Validation | Required |
|-------|------|-----------|----------|
| `progress` | `number` | `@IsInt() @Min(0) @Max(1)` — treated as increment, not absolute | Yes |

### 3.3 CreateSeriesDto (line 24-29)
| Field | Type | Validation | Required |
|-------|------|-----------|----------|
| `title` | `string` | `@MaxLength(200)` | Yes |
| `description` | `string?` | `@MaxLength(1000)` | No |
| `coverUrl` | `string?` | `@IsUrl()` | No |
| `category` | `string` | `@MaxLength(50)` | Yes |

### 3.4 AddEpisodeDto (line 31-36)
| Field | Type | Validation | Required |
|-------|------|-----------|----------|
| `title` | `string` | `@MaxLength(200)` | Yes |
| `postId` | `string?` | `@IsString()` | No |
| `reelId` | `string?` | `@IsString()` | No |
| `videoId` | `string?` | `@IsString()` | No |

### 3.5 UpdateSeriesProgressDto (line 38-41)
| Field | Type | Validation | Required |
|-------|------|-----------|----------|
| `episodeNum` | `number` | `@IsInt() @Min(1) @Max(10000)` | Yes |
| `timestamp` | `number` | `@IsNumber() @Min(0) @Max(86400)` — seconds within episode | Yes |

### 3.6 UpdateProfileCustomizationDto (line 43-52)
| Field | Type | Validation | Required |
|-------|------|-----------|----------|
| `accentColor` | `string?` | `@Matches(/^#[0-9a-fA-F]{6}$/)` — hex color | No |
| `layoutStyle` | `string?` | `@IsIn(['default', 'grid', 'magazine', 'minimal'])` | No |
| `backgroundUrl` | `string?` | `@IsUrl()` | No |
| `backgroundMusic` | `string?` | `@IsUrl()` | No |
| `showBadges` | `boolean?` | `@IsBoolean()` | No |
| `showLevel` | `boolean?` | `@IsBoolean()` | No |
| `showStreak` | `boolean?` | `@IsBoolean()` | No |
| `bioFont` | `string?` | `@IsIn(['default', 'serif', 'mono', 'arabic'])` | No |

---

## 4. Controller Endpoints (Gamification)

**File:** `apps/api/src/modules/gamification/gamification.controller.ts` (225 lines)

**Base:** `@Controller()` with no path prefix — routes registered at module level via router prefix.
**Global throttle:** `@Throttle({ default: { limit: 30, ttl: 60000 } })` (line 21)
**Swagger tag:** `Gamification`

### 4.1 Streak Endpoints

| # | Method | Route | Guard | Throttle | Service Method | Line |
|---|--------|-------|-------|----------|---------------|------|
| 1 | `GET` | `streaks` | `ClerkAuthGuard` | Default (30/min) | `getStreaks(userId)` | 27-32 |
| 2 | `POST` | `streaks/:type` | `ClerkAuthGuard` | 10/min | `updateStreak(userId, type)` | 34-43 |

**Streak type validation** (controller-level, line 16, 39-41):
- Valid types: `['posting', 'engagement', 'quran', 'dhikr', 'learning']`
- Throws `BadRequestException` for invalid types before reaching service

### 4.2 XP & Level Endpoints

| # | Method | Route | Guard | Throttle | Service Method | Line |
|---|--------|-------|-------|----------|---------------|------|
| 3 | `GET` | `xp` | `ClerkAuthGuard` | 30/min | `getXP(userId)` | 47-53 |
| 4 | `GET` | `xp/history` | `ClerkAuthGuard` | Default | `getXPHistory(userId, cursor, safeLimit)` | 55-61 |

**XP history pagination:** Limit clamped to `[1, 50]`, default 20 (line 59).

### 4.3 Achievement Endpoints

| # | Method | Route | Guard | Throttle | Service Method | Line |
|---|--------|-------|-------|----------|---------------|------|
| 5 | `GET` | `achievements` | `ClerkAuthGuard` | Default | `getAchievements(userId)` | 64-70 |

### 4.4 Leaderboard Endpoints

| # | Method | Route | Guard | Throttle | Service Method | Line |
|---|--------|-------|-------|----------|---------------|------|
| 6 | `GET` | `leaderboard` | `OptionalClerkAuthGuard` | Default | `getLeaderboard(safeType, safeLimit)` | 74-82 |

**Leaderboard types** (controller-level validation, line 78-79):
- Valid: `['xp', 'streaks', 'helpers']`
- Invalid types default to `'xp'`
- Limit: `[1, 100]`, default 50

### 4.5 Challenge Endpoints

| # | Method | Route | Guard | Throttle | Service Method | Line |
|---|--------|-------|-------|----------|---------------|------|
| 7 | `GET` | `challenges` | `OptionalClerkAuthGuard` | Default | `getChallenges(cursor, safeLimit, category)` | 86-92 |
| 8 | `POST` | `challenges` | `ClerkAuthGuard` | 5/min | `createChallenge(userId, dto)` | 94-100 |
| 9 | `POST` | `challenges/:id/join` | `ClerkAuthGuard` | Default | `joinChallenge(userId, id)` | 102-107 |
| 10 | `PATCH` | `challenges/:id/progress` | `ClerkAuthGuard` | Default | `updateChallengeProgress(userId, id, dto.progress)` | 109-114 |
| 11 | `DELETE` | `challenges/:id/leave` | `ClerkAuthGuard` | Default | `leaveChallenge(userId, id)` | 116-121 |
| 12 | `GET` | `challenges/me` | `ClerkAuthGuard` | Default | `getMyChallenges(userId)` | 123-128 |

### 4.6 Series (Micro-drama) Endpoints

| # | Method | Route | Guard | Throttle | Service Method | Line |
|---|--------|-------|-------|----------|---------------|------|
| 13 | `POST` | `series` | `ClerkAuthGuard` | 5/min | `createSeries(userId, dto)` | 132-138 |
| 14 | `GET` | `series/discover` | `OptionalClerkAuthGuard` | Default | `getDiscoverSeries(cursor, safeLimit, category)` | 140-150 |
| 15 | `GET` | `series/continue-watching` | `ClerkAuthGuard` | Default | `getContinueWatching(userId)` | 152-157 |
| 16 | `GET` | `series/:id` | `OptionalClerkAuthGuard` | Default | `getSeries(id)` | 159-164 |
| 17 | `POST` | `series/:id/episodes` | `ClerkAuthGuard` | Default | `addEpisode(userId, id, dto)` | 166-171 |
| 18 | `POST` | `series/:id/follow` | `ClerkAuthGuard` | Default | `followSeries(userId, id)` | 173-178 |
| 19 | `DELETE` | `series/:id/follow` | `ClerkAuthGuard` | Default | `unfollowSeries(userId, id)` | 180-185 |

### 4.7 Series Progress Endpoints

| # | Method | Route | Guard | Throttle | Service Method | Line |
|---|--------|-------|-------|----------|---------------|------|
| 20 | `PUT` | `series/:id/progress` | `ClerkAuthGuard` | Default | `updateSeriesProgress(userId, seriesId, body.episodeNum, body.timestamp)` | 189-198 |
| 21 | `GET` | `series/:id/progress` | `ClerkAuthGuard` | Default | `getSeriesProgress(userId, seriesId)` | 200-208 |

### 4.8 Profile Customization Endpoints

| # | Method | Route | Guard | Throttle | Service Method | Line |
|---|--------|-------|-------|----------|---------------|------|
| 22 | `GET` | `profile-customization` | `ClerkAuthGuard` | Default | `getProfileCustomization(userId)` | 212-217 |
| 23 | `PATCH` | `profile-customization` | `ClerkAuthGuard` | Default | `updateProfileCustomization(userId, dto)` | 219-224 |

**Total: 23 gamification endpoints.**

---

## 5. Service Methods (Gamification)

**File:** `apps/api/src/modules/gamification/gamification.service.ts` (698 lines)

### 5.1 Streak Methods

#### `getStreaks(userId: string)` — line 54-60
- Returns all `UserStreak` records for user, sorted by `currentDays` DESC, limit 50.

#### `updateStreak(userId: string, streakType: string | StreakType)` — line 62-115
**Algorithm:**
1. Uses UTC date string `toISOString().slice(0, 10)` for timezone-safe day comparison (line 64).
2. If no existing streak: creates new with `currentDays: 1`, `longestDays: 1` (line 72-74).
3. If `lastActiveDate` is today: returns existing (idempotent, line 79).
4. Calculates day difference via `Math.round(diffMs / (86400000))` (line 83).
5. **If diffDays === 1 (consecutive):**
   - Uses `$transaction` with raw SQL for atomic increment (line 88-98):
     ```sql
     UPDATE user_streaks
     SET "currentDays" = "currentDays" + 1,
         "lastActiveDate" = $today,
         "longestDays" = GREATEST("longestDays", "currentDays" + 1)
     WHERE "userId" = $userId AND "streakType" = $streakType
     ```
   - Awards milestone XP asynchronously (non-blocking `.catch()`): 7 days (25 XP), 30 days (100 XP), 100 days (500 XP) — lines 103-105.
6. **If diffDays > 1 (broken):** Resets `currentDays` to 1 (line 111-114).

### 5.2 XP Methods

#### `getXP(userId: string)` — line 119-133
- Returns `UserXP` record with computed fields:
  - `nextLevelXP`: XP threshold for next level
  - `currentLevelXP`: XP threshold for current level
  - `progressToNext`: float 0.0-1.0 representing progress within current level
- Auto-creates record with `totalXP: 0, level: 1` if none exists (line 122-123).

#### `awardXP(userId: string, reason: string, customAmount?: number)` — line 135-162
**Algorithm:**
1. Resolves amount: `customAmount ?? XP_REWARDS[reason] ?? 5` (line 136).
2. Rejects non-positive amounts (returns current XP without awarding, line 137).
3. Atomic upsert with `{ increment: amount }` on `totalXP` (line 140-144).
4. Recalculates level from `totalXP` using `getLevelForXP()` helper (line 149).
5. Conditional level update via raw SQL with guard `WHERE "level" < ${newLevel}` to prevent race conditions (line 151-154).
6. Creates `XPHistory` entry (line 157-159).

#### `getXPHistory(userId: string, cursor?: string, limit = 20)` — line 164-184
- Cursor-based pagination using `createdAt` as cursor (ISO string).
- Uses `take: limit + 1` pattern for `hasMore` detection.
- Returns `{ data: XPHistory[], meta: { cursor: string | null, hasMore: boolean } }`.

### 5.3 Achievement Methods

#### `getAchievements(userId: string)` — line 188-204
- Fetches all achievements (ordered by category, limit 50).
- Fetches user's unlocked achievements (limit 50).
- Merges: adds `unlocked: boolean` and `unlockedAt: Date | null` to each achievement.

#### `unlockAchievement(userId: string, achievementKey: string)` — line 206-227
- Looks up achievement by `key` field.
- Creates `UserAchievement` record.
- Handles P2002 (duplicate) gracefully — returns `null` instead of throwing (line 216).
- Awards XP if `achievement.xpReward > 0` (line 222-224).
- **Note:** This method is NOT exposed via controller endpoint — called internally by other services.

### 5.4 Leaderboard Methods

#### `getLeaderboard(type: string, limit = 50)` — line 231-280
**Three leaderboard types:**

| Type | Query | Ordering | Includes |
|------|-------|----------|----------|
| `xp` | `UserXP.findMany` | `totalXP DESC` | User select (id, username, displayName, avatarUrl, isVerified) |
| `streaks` | `UserStreak.findMany` where `streakType: 'POSTING'` | `currentDays DESC` | User select (same) |
| `helpers` | `Comment.groupBy` by `userId`, `_sum: { likesCount }` | `likesCount DESC` | Separate User fetch + map |

- Limit clamped to `[1, 100]` (line 232).
- Unknown types return empty array (line 279).
- **Helpers leaderboard** performs two queries: groupBy + user lookup (lines 256-276). Filters out deleted users (line 276).

### 5.5 Challenge Methods

#### `getChallenges(cursor?: string, limit = 20, category?: string)` — line 284-305
- Filters: `isActive: true`, `endDate >= now()`, optional `category`.
- Cursor-based pagination on `id` field.
- Ordered by `participantCount DESC`.
- Includes creator user select.

#### `createChallenge(userId: string, dto: {...})` — line 307-326
- Validates `xpReward <= 500` (throws `BadRequestException`, line 312-313).
- Defaults `xpReward` to 100 if not provided (line 322).
- Casts `challengeType` and `category` to Prisma enums.

#### `joinChallenge(userId: string, challengeId: string)` — line 328-364
**Algorithm:**
1. Validates challenge exists and is active with future end date.
2. **Transaction:** Creates `ChallengeParticipant` + increments `Challenge.participantCount`.
3. Handles P2002 (already joined) — throws `ConflictException` (line 347).
4. Sends notification to challenge creator (async, non-blocking, line 354-360).

#### `updateChallengeProgress(userId: string, challengeId: string, progress: number)` — line 366-420
**Server-side validation:**
1. Verifies participation exists.
2. Rejects if already completed (line 373-375).
3. Rejects if challenge ended (line 377-379).
4. **Max increment per request: 1** — prevents arbitrary progress jumps (line 383-389).
5. Rejects negative progress (line 384-386).
6. Caps progress at `targetCount` (line 391).
7. On completion: awards XP and notifies creator (lines 404-416).

#### `getMyChallenges(userId: string)` — line 422-435
- Returns all `ChallengeParticipant` records for user, ordered by `joinedAt DESC`, limit 50.
- Includes nested challenge with creator info.

#### `leaveChallenge(userId: string, challengeId: string)` — line 437-466
1. Verifies participation exists (throws `NotFoundException` if not).
2. Rejects leaving completed challenges (line 442).
3. **Transaction:** Deletes participant + decrements `participantCount`.
4. Post-transaction guard: ensures `participantCount` never goes negative (line 461-464).

### 5.6 Series Methods

#### `createSeries(userId: string, dto: {...})` — line 470-476
- Simple create with `category` cast to `SeriesCategory` enum.

#### `getSeries(seriesId: string)` — line 478-489
- Includes: creator (user select), episodes (ordered by number ASC), `_count.followers`.
- Throws `NotFoundException` if not found.

#### `addEpisode(userId: string, seriesId: string, dto: {...})` — line 491-521
1. Verifies series exists AND belongs to user (ownership check, line 494).
2. Finds last episode number for auto-increment.
3. **Transaction:** Creates episode + increments `Series.episodeCount`.

#### `removeEpisode(userId: string, seriesId: string, episodeId: string)` — line 523-536
1. Ownership check on series.
2. Validates episode belongs to series.
3. **Transaction:** Deletes episode + decrements `episodeCount` via raw SQL `GREATEST("episodeCount" - 1, 0)`.
- **Note:** This method exists in service but has NO controller endpoint.

#### `followSeries(userId: string, seriesId: string)` — line 538-554
- **Transaction:** Creates `SeriesFollower` + increments `followersCount`.
- P2002 → `ConflictException('Already following')`.

#### `unfollowSeries(userId: string, seriesId: string)` — line 556-579
- **Transaction:** Deletes `SeriesFollower` + decrements `followersCount`.
- P2025 (not found) → returns `{ success: true }` (idempotent).
- Post-transaction guard: ensures `followersCount` never goes negative (line 574-577).

#### `getDiscoverSeries(cursor?: string, limit = 20, category?: string)` — line 581-602
- Optional category filter.
- Cursor-based pagination on `id`.
- Ordered by `followersCount DESC`.
- Includes creator user select.

### 5.7 Series Progress Methods

#### `updateSeriesProgress(userId: string, seriesId: string, episodeNum: number, timestamp: number)` — line 606-619
- Upserts `SeriesProgress` record.
- Uses composite unique `[seriesId, userId]` for upsert key.

#### `getSeriesProgress(userId: string, seriesId: string)` — line 622-626
- Simple findUnique by composite key.

#### `getContinueWatching(userId: string)` — line 628-674
**Algorithm:**
1. Fetches up to 10 most recent `SeriesProgress` records (ordered by `updatedAt DESC`).
2. Batch-fetches series data with episodes (number, title, duration, thumbnailUrl).
3. Maps to rich response with:
   - Series info (id, title, coverUrl, creator, episodeCount)
   - Current episode info (number, title, thumbnailUrl)
   - Timestamp position
   - Progress percentage: `Math.round((lastTimestamp / duration) * 100)`
4. Filters out null entries (deleted series).

### 5.8 Profile Customization Methods

#### `getProfileCustomization(userId: string)` — line 678-684
- Returns existing customization or auto-creates default record.

#### `updateProfileCustomization(userId: string, dto: {...})` — line 686-697
- Upserts with type casting for `layoutStyle` and `bioFont` enums.

---

## 6. XP Reward System

**Defined at:** `gamification.service.ts` lines 7-22

| Action | XP Amount |
|--------|-----------|
| `post_created` | 10 |
| `thread_created` | 15 |
| `reel_created` | 20 |
| `video_created` | 25 |
| `comment_posted` | 5 |
| `comment_helpful` | 10 |
| `quran_read` | 20 |
| `dhikr_completed` | 10 |
| `challenge_completed` | 50 |
| `streak_milestone_7` | 25 |
| `streak_milestone_30` | 100 |
| `streak_milestone_100` | 500 |
| `first_follower` | 15 |
| `verified` | 200 |

- Unknown reasons default to **5 XP** (line 136).
- Custom amounts can override the table.
- Non-positive amounts are silently rejected (no award, no error).

---

## 7. Level Threshold System

**Defined at:** `gamification.service.ts` lines 25-31

| Level | XP Required | Level | XP Required | Level | XP Required |
|-------|-------------|-------|-------------|-------|-------------|
| 1 | 0 | 18 | 43,000 | 35 | 890,000 |
| 2 | 100 | 19 | 52,000 | 36 | 1,010,000 |
| 3 | 300 | 20 | 65,000 | 37 | 1,150,000 |
| 4 | 600 | 21 | 80,000 | 38 | 1,300,000 |
| 5 | 1,000 | 22 | 100,000 | 39 | 1,470,000 |
| 6 | 1,500 | 23 | 125,000 | 40 | 1,660,000 |
| 7 | 2,200 | 24 | 155,000 | 41 | 1,870,000 |
| 8 | 3,000 | 25 | 190,000 | 42 | 2,100,000 |
| 9 | 4,000 | 26 | 230,000 | 43 | 2,360,000 |
| 10 | 5,500 | 27 | 275,000 | 44 | 2,650,000 |
| 11 | 7,500 | 28 | 325,000 | 45 | 2,970,000 |
| 12 | 10,000 | 29 | 380,000 | 46 | 3,330,000 |
| 13 | 13,000 | 30 | 440,000 | 47 | 3,730,000 |
| 14 | 17,000 | 31 | 510,000 | 48 | 4,180,000 |
| 15 | 22,000 | 32 | 590,000 | 49 | 4,680,000 |
| 16 | 28,000 | 33 | 680,000 | 50 | 5,240,000 |
| 17 | 35,000 | 34 | 780,000 | | |

**50 levels total.** Beyond level 50, `getXPForNextLevel()` returns `lastThreshold + 10000` (line 41).

**Helper functions** (lines 33-42):
- `getLevelForXP(xp: number): number` — iterates thresholds in reverse to find level.
- `getXPForNextLevel(level: number): number` — returns threshold for next level.

---

## 8. Events Module Overview

**Files:**
| File | Path | Lines |
|------|------|-------|
| Module | `apps/api/src/modules/events/events.module.ts` | 12 |
| Controller | `apps/api/src/modules/events/events.controller.ts` | 267 |
| Service | `apps/api/src/modules/events/events.service.ts` | 429 |
| Controller Tests | `apps/api/src/modules/events/events.controller.spec.ts` | 137 |
| Service Tests | `apps/api/src/modules/events/events.service.spec.ts` | 490 |
| Auth Tests | `apps/api/src/modules/events/events.service.auth.spec.ts` | 72 |
| Edge Case Tests | `apps/api/src/modules/events/events.service.edge.spec.ts` | 98 |

**Module wiring** (line 1-12 of `events.module.ts`):
- Imports: `NotificationsModule`
- Controllers: `EventsController`
- Providers: `EventsService`
- Exports: `EventsService`

**Dependencies injected into service:**
- `PrismaService` — database access
- `NotificationsService` — sends RSVP notifications

**Note:** DTOs are defined inline in the controller file (not a separate file).

---

## 9. Prisma Models & Enums (Events)

### 9.1 Event (schema.prisma line 2623-2648)
```prisma
model Event {
  id          String        @id @default(cuid())
  title       String        @db.VarChar(200)
  description String?       @db.VarChar(5000)
  coverUrl    String?
  startDate   DateTime
  endDate     DateTime?
  location    String?       @db.VarChar(500)
  locationUrl String?
  isOnline    Boolean       @default(false)
  onlineUrl   String?
  eventType   EventTypeEnum @default(IN_PERSON)
  privacy     EventPrivacy  @default(EVENT_PUBLIC)
  userId      String
  user        User          @relation(...)
  communityId String?
  community   Circle?       @relation("communityEvents", ...)
  rsvps       EventRSVP[]
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@index([userId])
  @@index([startDate(sort: Desc)])
  @@index([communityId])
  @@map("events")
}
```
- **Table:** `events`
- **ID strategy:** cuid (unlike gamification models which use uuid)
- **Indexes:** userId, startDate DESC, communityId
- **Community link:** Optional FK to `Circle` model via `communityId`

### 9.2 EventRSVP (schema.prisma line 2650-2662)
```prisma
model EventRSVP {
  id        String   @id @default(cuid())
  eventId   String
  event     Event    @relation(...)
  userId    String
  user      User     @relation(...)
  status    String   @db.VarChar(20)
  createdAt DateTime @default(now())

  @@unique([eventId, userId])
  @@index([eventId])
  @@map("event_rsvps")
}
```
- **Table:** `event_rsvps`
- **Composite unique:** `[eventId, userId]` — one RSVP per user per event
- **Status** stored as `String` (not enum) — values: `'going'`, `'maybe'`, `'not_going'`

### 9.3 Enums

**EventTypeEnum** (schema.prisma line 524-528):
| Value | Description |
|-------|-------------|
| `IN_PERSON` | Physical location event |
| `ONLINE` | Virtual event |
| `HYBRID` | Both in-person and online |

**EventPrivacy** (schema.prisma line 519-522):
| Value | Description |
|-------|-------------|
| `EVENT_PUBLIC` | Visible to all users |
| `EVENT_PRIVATE` | Visible only to organizer (and invited users, if implemented) |

---

## 10. DTOs (Events)

**Defined inline in:** `apps/api/src/modules/events/events.controller.ts`

### 10.1 CreateEventDto (line 22-83)
| Field | Type | Validation | Default | Required |
|-------|------|-----------|---------|----------|
| `title` | `string` | `@MaxLength(200)` | — | Yes |
| `description` | `string?` | `@MaxLength(5000)` | — | No |
| `coverUrl` | `string?` | `@IsUrl()` | — | No |
| `startDate` | `string` | `@IsISO8601()` | — | Yes |
| `endDate` | `string?` | `@IsISO8601()` | — | No |
| `location` | `string?` | `@MaxLength(500)` | — | No |
| `locationUrl` | `string?` | `@IsUrl()` | — | No |
| `isOnline` | `boolean?` | `@IsBoolean()` | `false` | No |
| `onlineUrl` | `string?` | `@IsUrl()` | — | No |
| `eventType` | `string?` | `@IsEnum(['IN_PERSON', 'ONLINE', 'HYBRID'])` | `'IN_PERSON'` | No |
| `privacy` | `string?` | `@IsEnum(['EVENT_PUBLIC', 'EVENT_PRIVATE'])` | `'EVENT_PUBLIC'` | No |
| `communityId` | `string?` | `@IsString()` | — | No |

### 10.2 UpdateEventDto (line 85-148)
Same fields as CreateEventDto but all optional.

**Note:** `eventType` enum values differ between Create and Update DTOs:
- **CreateEventDto:** `['IN_PERSON', 'ONLINE', 'HYBRID']` (line 71)
- **UpdateEventDto:** `['in_person', 'online', 'hybrid']` (line 136) — **LOWERCASE**
- **Privacy similarly differs:** Create uses `['EVENT_PUBLIC', 'EVENT_PRIVATE']`, Update uses `['public', 'private', 'community']`
- **This is a BUG** — the enum values won't match Prisma's `EventTypeEnum` or `EventPrivacy` on update.

### 10.3 RsvpDto (line 150-154)
| Field | Type | Validation | Required |
|-------|------|-----------|----------|
| `status` | `'going' \| 'maybe' \| 'not_going'` | `@IsEnum(['going', 'maybe', 'not_going'])` | Yes |

---

## 11. Controller Endpoints (Events)

**File:** `apps/api/src/modules/events/events.controller.ts` (lines 156-266)

**Base path:** `@Controller('events')` (line 157)
**Swagger tag:** `Events`

| # | Method | Route | Guard | Throttle | Service Method | HTTP Code | Line |
|---|--------|-------|-------|----------|---------------|-----------|------|
| 1 | `POST` | `/events` | `ClerkAuthGuard` | 10/min | `createEvent(userId, dto)` | 201 | 162-170 |
| 2 | `GET` | `/events` | `OptionalClerkAuthGuard` | Default | `listEvents(userId, cursor, limit, privacy, eventType)` | 200 | 173-185 |
| 3 | `POST` | `/events/:id/rsvp` | `ClerkAuthGuard` | 10/min | `rsvpToEvent(userId, eventId, dto.status)` | 201 | 189-201 |
| 4 | `DELETE` | `/events/:id/rsvp` | `ClerkAuthGuard` | 10/min | `removeRsvp(userId, eventId)` | 204 | 204-214 |
| 5 | `GET` | `/events/:id/attendees` | `OptionalClerkAuthGuard` | Default | `listAttendees(eventId, cursor, limit, status)` | 200 | 217-228 |
| 6 | `GET` | `/events/:id` | `OptionalClerkAuthGuard` | Default | `getEvent(id, userId)` | 200 | 231-237 |
| 7 | `PATCH` | `/events/:id` | `ClerkAuthGuard` | 10/min | `updateEvent(userId, id, dto)` | 200 | 240-252 |
| 8 | `DELETE` | `/events/:id` | `ClerkAuthGuard` | 10/min | `deleteEvent(userId, id)` | 204 | 255-265 |

**Total: 8 events endpoints.**

**Route ordering note** (line 187): Compound `:id` routes (`rsvp`, `attendees`) are declared BEFORE simple `:id` route to avoid NestJS route shadowing.

---

## 12. Service Methods (Events)

**File:** `apps/api/src/modules/events/events.service.ts` (429 lines)

### 12.1 `createEvent(userId: string, dto: CreateEventDto)` — line 22-68
- Constructs `Prisma.EventCreateInput` with defaults (`isOnline: false`, `eventType: 'IN_PERSON'`, `privacy: 'EVENT_PUBLIC'`).
- Connects user via `{ connect: { id: userId } }`.
- Optionally connects community if `communityId` provided.
- Includes user select and RSVP count.
- Returns event with `goingCount: 0, maybeCount: 0, notGoingCount: 0` (new event).

### 12.2 `listEvents(userId, cursor?, limit?, privacy?, eventType?)` — line 70-152
**Algorithm:**
1. Default privacy filter: `EVENT_PUBLIC` (line 83).
2. Cursor-based pagination using `{ cursor: { id }, skip: 1 }` pattern (line 110).
3. Ordered by `startDate DESC`.
4. **Batch RSVP count optimization** (lines 117-133):
   - `EventRSVP.groupBy({ by: ['eventId', 'status'] })` for all events in page.
   - Builds `countsMap<eventId, { going, maybe, not_going }>`.
5. Enriches each event with `goingCount`, `maybeCount`, `notGoingCount`.

### 12.3 `getEvent(id: string, userId: string | null)` — line 154-209
1. Fetches event with user select and RSVP count.
2. **Privacy check:** Private events only visible to owner (line 179-181). Non-owners get `ForbiddenException`.
3. Fetches RSVP counts per status via 3 separate `count` queries (lines 183-191).
4. If user authenticated: fetches user's RSVP status.
5. Returns enriched event with `goingCount`, `maybeCount`, `notGoingCount`, `userRsvp`.

### 12.4 `updateEvent(userId: string, id: string, dto: UpdateEventDto)` — line 211-279
1. **Ownership check:** Only organizer (`event.userId === userId`) can update (line 219-221).
2. Builds update data object — only includes fields that are `!== undefined`.
3. Handles community disconnect: `dto.communityId` null/empty → `{ disconnect: true }` (line 236-238).
4. Returns updated event with RSVP counts.

### 12.5 `deleteEvent(userId: string, id: string)` — line 281-295
1. **Ownership check:** Only organizer can delete.
2. Cascades to RSVPs via Prisma `onDelete: Cascade`.

### 12.6 `rsvpToEvent(userId: string, eventId: string, status: 'going' | 'maybe' | 'not_going')` — line 297-370
**Algorithm:**
1. Validates event exists.
2. **Past event check:** Compares `endDate` (or `startDate` if no endDate) against `now()` (lines 307-311).
3. **Privacy check:** Private events only allow owner to RSVP (line 314-316).
4. **Upsert** for idempotency — handles both new and updated RSVPs (line 320-335).
5. **P2002 fallback:** If concurrent duplicate triggers unique constraint, retries as update (lines 350-367).
6. **Notification:** Notifies organizer when someone RSVPs as "going" (line 338-345).

### 12.7 `removeRsvp(userId: string, eventId: string)` — line 372-384
- Deletes RSVP by composite unique `[eventId, userId]`.
- P2025 (not found) → `NotFoundException('RSVP not found')`.

### 12.8 `listAttendees(eventId: string, cursor?: string, limit = 20, status?: string)` — line 386-428
1. Validates event exists.
2. Optional status filter.
3. Cursor-based pagination using `{ cursor: { id }, skip: 1 }` pattern.
4. Ordered by `createdAt DESC`.
5. Includes user select for each attendee.

---

## 13. Notification Integration

Both modules inject `NotificationsService` and send notifications on specific events:

### Gamification Notifications
| Trigger | Recipient | Type | Line |
|---------|-----------|------|------|
| User joins challenge | Challenge creator | `SYSTEM` — "New challenger" | Service line 354-360 |
| User completes challenge | Challenge creator | `SYSTEM` — "Challenge completed" | Service line 409-415 |

### Events Notifications
| Trigger | Recipient | Type | Line |
|---------|-----------|------|------|
| User RSVPs "going" | Event organizer | `SYSTEM` — "New RSVP" | Service line 338-345 |

All notifications are fire-and-forget with `.catch()` error handling (logged as warnings, never blocks main flow).

---

## 14. Test Coverage

### Gamification Tests

**Controller tests** (`gamification.controller.spec.ts` — 170 lines, ~10 test cases):
| Test | What it verifies |
|------|-----------------|
| `getStreaks` | Delegates to service with userId |
| `updateStreak` — valid type | Delegates to service with userId + type |
| `updateStreak` — invalid type | Throws `BadRequestException` before reaching service |
| `getXP` | Delegates to service with userId |
| `getAchievements` | Delegates to service with userId |
| `getLeaderboard` | Parses limit string to int, delegates |
| `joinChallenge` | Delegates to service with userId + id |
| `createSeries` | Delegates to service with userId + dto |
| `followSeries` | Delegates to service with userId + id |
| `getContinueWatching` | Delegates to service with userId |
| `getProfileCustomization` | Delegates to service with userId |

**Service tests** (`gamification.service.spec.ts` — 482 lines, ~28 test cases):

| Describe Block | Tests |
|----------------|-------|
| `getStreaks` | Returns sorted streaks |
| `updateStreak` | Creates new streak; increments consecutive; resets on gap |
| `getXP` | Creates if none exists; calculates progress |
| `awardXP` | Increments XP, creates history |
| `joinChallenge` | Joins active; NotFoundException for missing; BadRequest for ended |
| `getLeaderboard` | Returns XP leaderboard; empty for unknown type |
| `profileCustomization` | Creates default; upserts with values |
| `getXPHistory` | Returns history; empty when no XP record |
| `getAchievements` | Returns all with unlock status |
| `unlockAchievement` | Unlocks and awards XP; returns null for nonexistent |
| `getChallenges` | Returns with pagination |
| `createChallenge` | Creates challenge |
| `getMyChallenges` | Returns user challenges |
| `updateChallengeProgress` | Increments by 1; rejects negative; rejects >1; rejects completed; rejects ended; caps at targetCount; awards XP on completion; NotFoundException if not participating; accepts 0 |
| `createSeries` | Creates series |
| `getSeries` | Returns with episodes; NotFoundException |
| `getContinueWatching` | Returns empty when no progress |
| `getDiscoverSeries` | Returns sorted by followers; empty data |

**Concurrency tests** (`gamification.service.concurrency.spec.ts` — 108 lines, 6 test cases):
| Test | What it verifies |
|------|-----------------|
| Concurrent XP awards | 3 parallel `awardXP` calls all succeed, upsert called 3x |
| Empty streaks | Returns `[]` for new user |
| Concurrent achievement unlock | P2002 handled — second call returns null |
| Concurrent leaderboard reads | 10 parallel reads all succeed |
| Level up from concurrent gains | Level recalculated after threshold crossing |
| First-time XP | Creates record with `totalXP: 0, level: 1` |

**Edge case tests** (`gamification.service.edge.spec.ts` — 132 lines, 6 test cases):
| Test | What it verifies |
|------|-----------------|
| `awardXP` with 0 | Returns current XP without awarding |
| `awardXP` with negative | Returns current XP without awarding |
| `getStreaks` for new user | Returns empty array |
| `getLeaderboard` with no users | Returns empty array |
| `unlockAchievement` P2002 | Returns null (already unlocked) |
| `joinChallenge` ended | BadRequestException |
| `joinChallenge` inactive | BadRequestException |
| `joinChallenge` nonexistent | NotFoundException |

### Events Tests

**Controller tests** (`events.controller.spec.ts` — 137 lines, 8 test cases):
| Test | What it verifies |
|------|-----------------|
| `createEvent` | Delegates to service |
| `listEvents` | Passes all query params |
| `getEvent` | Passes id and userId |
| `getEvent` — not found | Propagates NotFoundException |
| `updateEvent` | Delegates with userId, id, dto |
| `rsvpToEvent` | Extracts status from dto |
| `removeRsvp` | Returns null (204) |
| `listAttendees` | Passes all query params |
| `deleteEvent` | Returns null (204) |

**Service tests** (`events.service.spec.ts` — 490 lines, ~24 test cases):

| Describe Block | Tests |
|----------------|-------|
| `createEvent` | Creates successfully; includes community when communityId provided |
| `listEvents` | Returns paginated with counts; handles cursor; filters by privacy/eventType; public-only when null userId |
| `getEvent` | Returns with counts and userRsvp; NotFoundException; ForbiddenException for private; allows owner for private |
| `updateEvent` | Updates successfully; NotFoundException; ForbiddenException for non-owner |
| `deleteEvent` | Deletes successfully; NotFoundException; ForbiddenException |
| `rsvpToEvent` | Upserts for public event; NotFoundException; ForbiddenException for private; allows owner for private; BadRequestException for past event |
| `removeRsvp` | Removes successfully; P2025 → NotFoundException |
| `listAttendees` | Returns paginated; NotFoundException; filters by status; handles cursor |

**Auth tests** (`events.service.auth.spec.ts` — 72 lines, 6 test cases):
| Test | What it verifies |
|------|-----------------|
| Organizer can update | Allowed |
| Non-organizer update | ForbiddenException |
| Organizer can delete | Allowed |
| Non-organizer delete | ForbiddenException |
| Non-existent event update | NotFoundException |
| Non-existent event delete | NotFoundException |

**Edge case tests** (`events.service.edge.spec.ts` — 98 lines, 6 test cases):
| Test | What it verifies |
|------|-----------------|
| Arabic event title | Accepts unicode |
| Non-existent getEvent | NotFoundException |
| Non-existent rsvpToEvent | NotFoundException |
| Non-existent deleteEvent | NotFoundException |
| Empty listEvents | Returns `{ data: [], ... }` |
| Remove non-existent RSVP | Succeeds (idempotent) |

---

## 15. Concurrency & Edge Case Handling

### Gamification Concurrency Patterns

| Operation | Mechanism | Location |
|-----------|-----------|----------|
| Streak update | `$executeRaw` atomic UPDATE with `GREATEST()` in transaction | Service line 88-98 |
| XP award | `upsert` with `{ increment: amount }` + conditional level update with `WHERE level < newLevel` | Service lines 140-154 |
| Achievement unlock | P2002 catch → return null | Service line 216 |
| Challenge join | Transaction (create participant + increment count) + P2002 → ConflictException | Service lines 336-350 |
| Challenge leave | Transaction (delete participant + decrement count) + post-guard for negative count | Service lines 444-464 |
| Series follow | Transaction + P2002 → ConflictException | Service lines 540-553 |
| Series unfollow | Transaction + P2025 → idempotent success + negative count guard | Service lines 557-578 |
| Progress update | Max increment = 1 per request (prevents jumps) | Service line 383 |

### Events Concurrency Patterns

| Operation | Mechanism | Location |
|-----------|-----------|----------|
| RSVP create/update | `upsert` for idempotency + P2002 fallback retry | Service lines 320-367 |
| RSVP remove | P2025 → NotFoundException | Service lines 373-383 |

### Edge Cases Handled

| Case | Behavior |
|------|----------|
| Streak: same day double-call | Returns existing (idempotent) |
| Streak: >1 day gap | Resets to 1 |
| XP: 0 or negative award | Returns current XP, no mutation |
| XP: unknown reason | Defaults to 5 XP |
| Challenge: XP reward > 500 | BadRequestException |
| Challenge: progress > 1 per request | BadRequestException |
| Challenge: negative progress | BadRequestException |
| Challenge: already completed | BadRequestException |
| Challenge: ended | BadRequestException |
| Challenge: leave after completion | BadRequestException |
| Participant count negative | Post-transaction guard clamps to 0 |
| Followers count negative | Post-transaction guard clamps to 0 |
| Event: RSVP to past event | BadRequestException |
| Event: private event access | ForbiddenException (unless owner) |
| Event: update/delete by non-owner | ForbiddenException |

---

## 16. Architectural Notes & Observations

### Design Patterns
1. **Denormalized counters** — `participantCount`, `episodeCount`, `followersCount` kept in sync via transactions. Post-transaction guards prevent negative values.
2. **Cursor-based pagination** — All list endpoints use `take: limit + 1` pattern with either `id` or `createdAt` cursors.
3. **Fire-and-forget notifications** — All notification calls use `.catch()` to prevent notification failures from blocking main operations.
4. **Controller-level validation** — Streak types and leaderboard types validated in controller before service call. Challenge category validated via DTO `@IsIn()`.
5. **Auto-initialization** — `getXP()` and `getProfileCustomization()` auto-create records on first access.
6. **Exported service** — `GamificationService` is exported for use by other modules (e.g., post/reel creation awarding XP).

### Potential Issues Found

1. **UpdateEventDto enum values mismatch** — `eventType` uses lowercase `['in_person', 'online', 'hybrid']` but Prisma enum expects `IN_PERSON`, `ONLINE`, `HYBRID`. Same issue with `privacy`: `['public', 'private', 'community']` vs `EVENT_PUBLIC`, `EVENT_PRIVATE`. Updates will fail at DB level for these fields.

2. **ChallengeCategory DTO/enum mismatch** — DTO accepts `['quran', 'dhikr', 'photography', 'fitness', 'charity', 'community', 'learning', 'custom']` but Prisma enum only has `QURAN, DHIKR, PHOTOGRAPHY, FITNESS, COOKING, LEARNING`. Missing: `charity`, `community`, `custom`. Has: `COOKING` (not in DTO). The service casts without validation (line 319).

3. **Streak milestone XP awarded async** — `.catch()` swallows errors silently (lines 103-105). If XP award fails, user doesn't get milestone reward and there's no retry.

4. **Event RSVP counts: N+1 on getEvent** — `getEvent()` makes 3 separate count queries (lines 183-191) instead of using `groupBy` like `listEvents` does. Minor performance concern.

5. **No `removeEpisode` endpoint** — Method exists in service (line 523) but no controller route. Dead code unless called by other modules.

6. **SeriesProgress uses cuid() while all other gamification models use uuid()** — Inconsistent ID strategy (schema line 3580 vs 3406, 3421, 3447, etc).

7. **Leaderboard "helpers" type does N+2 queries** — groupBy + findMany users + filter. Could be optimized with a raw query or join.

8. **No `leaveChallenge` endpoint in controller spec** — The `leaveChallenge` controller method exists (line 116-121) but is not tested in controller tests.

### Queue Integration
- **None.** Neither module uses Bull/BullMQ queues. All operations are synchronous within the request cycle. Notifications are the only async operation (fire-and-forget promises).
- **Potential enhancement:** Streak milestone XP awards and challenge completion XP could be offloaded to a queue for reliability.

### Summary Statistics
| Metric | Gamification | Events | Total |
|--------|-------------|--------|-------|
| Endpoints | 23 | 8 | 31 |
| Service methods | 21 (incl. 2 not exposed) | 8 | 29 |
| Prisma models | 10 | 2 | 12 |
| Enums | 8 | 2 | 10 |
| DTOs | 6 | 3 | 9 |
| Test files | 4 | 4 | 8 |
| Test cases (approx) | ~50 | ~44 | ~94 |
| Service lines | 698 | 429 | 1,127 |
| Controller lines | 225 | 267 | 492 |
