# Module Architecture: Settings, Privacy, Parental Controls, Halal

> Extracted 2026-03-25. Covers 4 NestJS modules with every endpoint, service method, DTO field, and Prisma model.

---

## 1. SETTINGS MODULE

### Files
| File | Path | Lines |
|------|------|-------|
| settings.module.ts | `apps/api/src/modules/settings/settings.module.ts` | 11 |
| settings.controller.ts | `apps/api/src/modules/settings/settings.controller.ts` | 170 |
| settings.service.ts | `apps/api/src/modules/settings/settings.service.ts` | 201 |
| update-privacy.dto.ts | `apps/api/src/modules/settings/dto/update-privacy.dto.ts` | 41 |
| update-notifications.dto.ts | `apps/api/src/modules/settings/dto/update-notifications.dto.ts` | 19 |
| update-wellbeing.dto.ts | `apps/api/src/modules/settings/dto/update-wellbeing.dto.ts` | 17 |
| update-accessibility.dto.ts | `apps/api/src/modules/settings/dto/update-accessibility.dto.ts` | 12 |
| quiet-mode.dto.ts | `apps/api/src/modules/settings/dto/quiet-mode.dto.ts` | 33 |
| settings.controller.spec.ts | `apps/api/src/modules/settings/settings.controller.spec.ts` | 109 |
| settings.service.spec.ts | `apps/api/src/modules/settings/settings.service.spec.ts` | 317 |
| settings.service.auth.spec.ts | `apps/api/src/modules/settings/settings.service.auth.spec.ts` | 65 |

### Module Definition (settings.module.ts, L1-11)
```
controllers: [SettingsController]
providers: [SettingsService]
exports: [SettingsService]   // Exported — used by other modules (e.g., notification delivery checks quiet mode)
```

### Controller: SettingsController (settings.controller.ts)

**Class-level decorators:**
- `@ApiTags('Settings')` (L41)
- `@Throttle({ default: { limit: 60, ttl: 60000 } })` — 60 req/min (L42)
- `@Controller('settings')` — prefix `/api/v1/settings` (L43)
- `@UseGuards(ClerkAuthGuard)` — all endpoints require auth (L44)
- `@ApiBearerAuth()` (L45)

**Inline DTOs (defined in controller file, L25-39):**

| DTO | Fields | Validation |
|-----|--------|------------|
| `AddKeywordDto` (L25-27) | `keyword: string` | `@IsString() @MaxLength(100)` |
| `AutoPlayDto` (L29-31) | `autoPlaySetting: string` | `@IsString() @IsIn(['WIFI', 'ALWAYS', 'NEVER'])` |
| `LogScreenTimeDto` (L33-35) | `seconds: number` | `@IsNumber() @Min(1) @Max(86400)` |
| `SetScreenTimeLimitDto` (L37-39) | `limitMinutes: number \| null` | `@IsOptional() @IsNumber() @Min(1) @Max(1440)` |

#### Endpoints

| # | Method | Route | Handler (Line) | Service Method | Description |
|---|--------|-------|----------------|----------------|-------------|
| 1 | `GET` | `/settings` | `getSettings` (L49-53) | `getSettings(userId)` | Get all settings (auto-creates on first call via upsert) |
| 2 | `PATCH` | `/settings/privacy` | `updatePrivacy` (L55-62) | `updatePrivacy(userId, dto)` | Update privacy settings |
| 3 | `PATCH` | `/settings/notifications` | `updateNotifications` (L64-71) | `updateNotifications(userId, dto)` | Update notification settings |
| 4 | `PATCH` | `/settings/accessibility` | `updateAccessibility` (L73-80) | `updateAccessibility(userId, dto)` | Update accessibility settings |
| 5 | `PATCH` | `/settings/wellbeing` | `updateWellbeing` (L82-89) | `updateWellbeing(userId, dto)` | Update wellbeing settings |
| 6 | `GET` | `/settings/auto-play` | `getAutoPlay` (L91-95) | `getAutoPlaySetting(userId)` | Get auto-play setting |
| 7 | `PATCH` | `/settings/auto-play` | `updateAutoPlay` (L97-104) | `updateAutoPlaySetting(userId, setting)` | Update auto-play (WIFI/ALWAYS/NEVER) |
| 8 | `GET` | `/settings/blocked-keywords` | `getBlockedKeywords` (L106-110) | `getBlockedKeywords(userId)` | List blocked keyword filters |
| 9 | `POST` | `/settings/blocked-keywords` | `addBlockedKeyword` (L112-119) | `addBlockedKeyword(userId, keyword)` | Add a blocked keyword filter |
| 10 | `DELETE` | `/settings/blocked-keywords/:id` | `removeBlockedKeyword` (L121-129) | `removeBlockedKeyword(userId, id)` | Remove a blocked keyword filter. Returns 200 (not 204). |
| 11 | `POST` | `/settings/screen-time/log` | `logScreenTime` (L131-138) | `logScreenTime(userId, seconds)` | Log a screen time session |
| 12 | `GET` | `/settings/screen-time/stats` | `getScreenTimeStats` (L140-144) | `getScreenTimeStats(userId)` | Get weekly screen time stats |
| 13 | `PATCH` | `/settings/screen-time/limit` | `setScreenTimeLimit` (L146-153) | `setScreenTimeLimit(userId, limitMinutes)` | Set daily screen time limit (null to clear) |
| 14 | `GET` | `/settings/quiet-mode` | `getQuietMode` (L155-159) | `getQuietMode(userId)` | Get quiet mode settings |
| 15 | `PATCH` | `/settings/quiet-mode` | `updateQuietMode` (L161-168) | `updateQuietMode(userId, dto)` | Update quiet mode settings |

### Service: SettingsService (settings.service.ts)

**Dependencies:** `PrismaService` (L12)

**Prisma models touched:** `UserSettings`, `User`, `BlockedKeyword`, `QuietModeSetting`, `ScreenTimeLog`

#### Method Details

**`getSettings(userId)` — L14-22**
- Upserts `UserSettings` with default values if not exists
- Returns full `UserSettings` record

**`updatePrivacy(userId, dto: UpdatePrivacyDto)` — L24-43**
- Destructures `isPrivate` from dto, remaining fields go to `UserSettings`
- Upserts `UserSettings` with settings fields
- If `isPrivate !== undefined`, separately updates `User.isPrivate` (L35-40)
- Two separate database calls — not transactional

**`updateNotifications(userId, dto)` — L45-51**
- Simple upsert on `UserSettings` with dto spread

**`updateAccessibility(userId, dto)` — L53-59**
- Simple upsert on `UserSettings` with dto spread

**`updateWellbeing(userId, dto)` — L61-67**
- Simple upsert on `UserSettings` with dto spread

**`getBlockedKeywords(userId)` — L69-75**
- `findMany` on `BlockedKeyword` where userId
- Ordered by `createdAt: 'desc'`
- Capped at `take: 50`

**`addBlockedKeyword(userId, keyword)` — L77-83**
- Lowercases keyword before storing
- Upserts on composite unique `[userId, keyword]`
- Idempotent — re-adding same keyword is a no-op

**`removeBlockedKeyword(userId, id)` — L85-90**
- Finds keyword by id, verifies `kw.userId === userId`
- Throws `NotFoundException` if not found or not owned
- Returns `{ message: 'Keyword removed' }`

**`getQuietMode(userId)` — L92-98**
- Returns `QuietModeSetting` or defaults `{ isActive: false, autoReply: null, startTime: null, endTime: null, isScheduled: false }`

**`updateQuietMode(userId, dto)` — L100-106**
- Upsert on `QuietModeSetting`

**`logScreenTime(userId, seconds)` — L108-120**
- Validates seconds 1-86400
- Creates today's date at midnight (`setHours(0,0,0,0)`)
- Upserts `ScreenTimeLog` on composite `[userId, date]`
- On conflict: increments `totalSeconds` and `sessions`

**`getScreenTimeStats(userId)` — L122-153**
- Fetches last 7 days of `ScreenTimeLog` entries
- Fetches `screenTimeLimitMinutes` from `UserSettings`
- Computes: `totalSeconds`, `totalSessions`, `avgDailySeconds`
- Returns daily breakdown + totals + limit

**`setScreenTimeLimit(userId, limitMinutes)` — L155-164**
- Validates 1-1440 minutes (null allowed to clear)
- Upserts `UserSettings.screenTimeLimitMinutes`

**`isQuietModeActive(userId): Promise<boolean>` — L166-180**
- Internal method (not exposed via controller)
- Returns `true` if:
  - `setting.isActive` is true, OR
  - `setting.isScheduled` AND current time is within `startTime`-`endTime`
- Handles overnight schedules (e.g., 22:00 - 07:00) via L173-178

**`getAutoPlaySetting(userId)` — L182-188**
- Returns `{ autoPlaySetting }` from `UserSettings`, defaults to `'WIFI'`

**`updateAutoPlaySetting(userId, setting)` — L190-200**
- Validates against `['WIFI', 'ALWAYS', 'NEVER']`
- Casts to `AutoPlaySetting` enum
- Upserts `UserSettings`

### DTOs

#### UpdatePrivacyDto (dto/update-privacy.dto.ts, L4-40)

| Field | Type | Validation | Default (schema) | Description |
|-------|------|------------|---------|-------------|
| `messagePermission` | string? | `@IsIn(['everyone', 'followers', 'none'])` | `"everyone"` | Who can message this user |
| `mentionPermission` | string? | `@IsIn(['everyone', 'followers', 'none'])` | `"everyone"` | Who can @mention this user |
| `activityStatus` | boolean? | `@IsBoolean()` | `true` | Show online/active status |
| `readReceipts` | boolean? | `@IsBoolean()` | `true` | Show blue ticks in chats |
| `typingIndicators` | boolean? | `@IsBoolean()` | `true` | Show typing indicators in chats |
| `lastSeenVisibility` | string? | `@IsIn(['everyone', 'contacts', 'nobody'])` | `"everyone"` | Who can see last seen timestamp |
| `isPrivate` | boolean? | `@IsBoolean()` | N/A | Updates `User.isPrivate` (not UserSettings) |

#### UpdateNotificationsDto (dto/update-notifications.dto.ts, L4-19)

| Field | Type | Validation | Default (schema) |
|-------|------|------------|---------|
| `notifyLikes` | boolean? | `@IsBoolean()` | `true` |
| `notifyComments` | boolean? | `@IsBoolean()` | `true` |
| `notifyFollows` | boolean? | `@IsBoolean()` | `true` |
| `notifyMentions` | boolean? | `@IsBoolean()` | `true` |
| `notifyMessages` | boolean? | `@IsBoolean()` | `true` |
| `notifyLiveStreams` | boolean? | `@IsBoolean()` | `true` |
| `emailDigest` | boolean? | `@IsBoolean()` | `false` |

#### UpdateAccessibilityDto (dto/update-accessibility.dto.ts, L4-11)

| Field | Type | Validation | Default (schema) |
|-------|------|------------|---------|
| `reducedMotion` | boolean? | `@IsBoolean()` | `false` |
| `largeText` | boolean? | `@IsBoolean()` | `false` |
| `highContrast` | boolean? | `@IsBoolean()` | `false` |

#### UpdateWellbeingDto (dto/update-wellbeing.dto.ts, L4-16)

| Field | Type | Validation | Default (schema) |
|-------|------|------------|---------|
| `dailyTimeLimit` | number? \| null | `@IsInt() @Min(15) @Max(480)` | `null` |
| `restrictedMode` | boolean? | `@IsBoolean()` | `false` |
| `sensitiveContent` | boolean? | `@IsBoolean()` | `false` |

#### UpdateQuietModeDto (dto/quiet-mode.dto.ts, L4-32)

| Field | Type | Validation | Description |
|-------|------|------------|-------------|
| `isActive` | boolean? | `@IsBoolean()` | Toggle quiet mode on/off |
| `autoReply` | string? | `@IsString() @MaxLength(200)` | Auto-reply message text |
| `startTime` | string? | `@Matches(/^([01]\d\|2[0-3]):[0-5]\d$/)` | Schedule start HH:mm |
| `endTime` | string? | `@Matches(/^([01]\d\|2[0-3]):[0-5]\d$/)` | Schedule end HH:mm |
| `isScheduled` | boolean? | `@IsBoolean()` | Enable scheduled quiet mode |

### Prisma Models

#### UserSettings (schema.prisma L2511-2546)
```prisma
model UserSettings {
  id                     String   @id @default(cuid())
  userId                 String   @unique
  user                   User     @relation(...)
  // Privacy
  messagePermission      String   @default("everyone")
  mentionPermission      String   @default("everyone")
  activityStatus         Boolean  @default(true)
  readReceipts           Boolean  @default(true)
  typingIndicators       Boolean  @default(true)
  lastSeenVisibility     String   @default("everyone")
  // Notifications
  notifyLikes            Boolean  @default(true)
  notifyComments         Boolean  @default(true)
  notifyFollows          Boolean  @default(true)
  notifyMentions         Boolean  @default(true)
  notifyMessages         Boolean  @default(true)
  notifyLiveStreams      Boolean  @default(true)
  emailDigest            Boolean  @default(false)
  // Accessibility
  reducedMotion          Boolean  @default(false)
  largeText              Boolean  @default(false)
  highContrast           Boolean  @default(false)
  // Wellbeing
  dailyTimeLimit         Int?
  restrictedMode         Boolean  @default(false)
  sensitiveContent       Boolean  @default(false)
  // Screen Time & Playback
  screenTimeLimitMinutes Int?
  undoSendSeconds        Int      @default(5)
  autoPlaySetting        AutoPlaySetting @default(WIFI)
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt

  @@map("user_settings")
}
```

#### BlockedKeyword (schema.prisma L2482-2492)
```prisma
model BlockedKeyword {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(...)
  keyword   String   @db.VarChar(100)
  createdAt DateTime @default(now())

  @@unique([userId, keyword])
  @@index([userId])
  @@map("blocked_keywords")
}
```

#### ScreenTimeLog (schema.prisma L3198-3210)
```prisma
model ScreenTimeLog {
  id           String   @id @default(uuid())
  userId       String
  user         User     @relation("screenTimeLogs", ...)
  date         DateTime @db.Date
  totalSeconds Int      @default(0)
  sessions     Int      @default(0)
  createdAt    DateTime @default(now())

  @@unique([userId, date])
  @@index([userId, date(sort: Desc)])
  @@map("screen_time_logs")
}
```

#### QuietModeSetting (schema.prisma L3212-3225)
```prisma
model QuietModeSetting {
  id          String   @id @default(uuid())
  userId      String   @unique
  user        User     @relation("quietMode", ...)
  isActive    Boolean  @default(false)
  autoReply   String?  @db.VarChar(200)
  startTime   String?
  endTime     String?
  isScheduled Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("quiet_mode_settings")
}
```

#### AutoPlaySetting enum (schema.prisma L480-484)
```prisma
enum AutoPlaySetting {
  WIFI
  ALWAYS
  NEVER
}
```

### Tests

| File | Tests | Coverage |
|------|-------|---------|
| `settings.controller.spec.ts` | 6 | Controller delegation: getSettings, updatePrivacy, updateAutoPlay, addBlockedKeyword, logScreenTime, getQuietMode |
| `settings.service.spec.ts` | 14 | getSettings upsert, updatePrivacy (isPrivate split, readReceipts, typingIndicators, lastSeenVisibility, all-at-once), updateNotifications, updateAccessibility, updateWellbeing, getBlockedKeywords, addBlockedKeyword lowercase, removeBlockedKeyword (own/not-found/other-user), getQuietMode, updateQuietMode, logScreenTime, setScreenTimeLimit |
| `settings.service.auth.spec.ts` | 4 | Authorization matrix: own settings only, own keywords only, own quiet mode only, own screen time only |

---

## 2. PRIVACY MODULE (GDPR/CCPA)

### Files
| File | Path | Lines |
|------|------|-------|
| privacy.module.ts | `apps/api/src/modules/privacy/privacy.module.ts` | 9 |
| privacy.controller.ts | `apps/api/src/modules/privacy/privacy.controller.ts` | 30 |
| privacy.service.ts | `apps/api/src/modules/privacy/privacy.service.ts` | 230 |
| privacy.controller.spec.ts | `apps/api/src/modules/privacy/privacy.controller.spec.ts` | 71 |
| privacy.service.spec.ts | `apps/api/src/modules/privacy/privacy.service.spec.ts` | 156 |
| privacy.service.auth.spec.ts | `apps/api/src/modules/privacy/privacy.service.auth.spec.ts` | 76 |

### Module Definition (privacy.module.ts, L1-9)
```
controllers: [PrivacyController]
providers: [PrivacyService]
// NOT exported — privacy operations are self-contained
```

### Controller: PrivacyController (privacy.controller.ts)

**Class-level decorators:**
- `@ApiTags('Privacy (GDPR/CCPA)')` (L8)
- `@Throttle({ default: { limit: 60, ttl: 60000 } })` — 60 req/min baseline (L9)
- `@Controller('privacy')` — prefix `/api/v1/privacy` (L10)
- `@UseGuards(ClerkAuthGuard)` (L11)
- `@ApiBearerAuth()` (L12)

#### Endpoints

| # | Method | Route | Handler (Line) | Throttle | Description |
|---|--------|-------|----------------|----------|-------------|
| 1 | `GET` | `/privacy/export` | `exportData` (L16-21) | **2 req/hour** | GDPR Article 20 — Data Portability. Export all user data. |
| 2 | `DELETE` | `/privacy/delete-all` | `deleteAll` (L23-29) | **1 req/day** | GDPR Article 17 — Right to Erasure. Delete all user data permanently. Returns 200. |

### Service: PrivacyService (privacy.service.ts)

**Dependencies:** `PrismaService` (L8), `Logger` (L6)

#### `exportUserData(userId)` — L21-120

**GDPR Article 20 — Data Portability**

1. Fetches user profile (L23-43) — selects only user-facing fields, explicitly excludes `clerkId` and `pushToken`
   - Fields: id, username, displayName, bio, email, phone, avatarUrl, coverUrl, website, language, location, madhab, isPrivate, isChildAccount, createdAt, profileLinks
2. Parallel fetch of 16 data categories via `Promise.all` (L47-69):
   - `posts` — id, content, mediaUrls, postType, createdAt
   - `threads` — id, content, createdAt
   - `stories` — id, mediaUrl, mediaType, createdAt
   - `reels` — id, caption, videoUrl, createdAt
   - `messages` — id, content, messageType, conversationId, createdAt (where senderId = userId)
   - `follows` — followingId, createdAt (where followerId = userId)
   - `comments` — id, content, postId, createdAt
   - `postReactions` — postId, reaction, createdAt
   - `videos` — id, title, videoUrl, createdAt
   - `bookmarks` (savedPost) — postId, createdAt
   - `blocks` — blockedId, createdAt (where blockerId = userId)
   - `mutes` — mutedId, createdAt
   - `notifications` — id, type, isRead, createdAt (**capped at take: 5000** to prevent OOM)
   - `threadReplies` — id, content, threadId, createdAt
   - `userSettings` — full record
   - `watchHistory` — videoId, watchedAt
3. Checks encrypted conversations (L72-81) — queries `ConversationKeyEnvelope` to mark which messages are in encrypted conversations
4. Returns structured export with `exportedAt` timestamp

**Missing data categories (documented in TODO L110-118):**
- Reel reactions, Video reactions
- Event RSVPs
- DM notes, saved messages, chat folders
- Quran reading plans, HifzProgress, DhikrSession, FastingLog
- ZakatCalculation, CharityDonation records
- Community memberships, circle memberships
- Gamification data (streaks, achievements, XP)

#### `deleteAllUserData(userId)` — L130-229

**GDPR Article 17 — Right to Erasure**

1. Verifies user exists and is not already deleted (L132-138)
2. Runs entire deletion in a single `$transaction` (L143-226):

**Anonymization (L145-165):**
- Sets `isDeleted: true`, `deletedAt: new Date()`
- Sets `isDeactivated: true`, `deactivatedAt: new Date()`
- Sets `displayName: 'Deleted User'`
- Sets `username: 'deleted_${userId}'`
- Clears bio, avatarUrl, coverUrl, website, phone, location, madhab, expoPushToken
- Sets email to `deleted_${userId}@deleted.local`
- Sets `notificationsOn: false`

**Content soft-delete (L167-192):**
- `posts` — `isRemoved: true`, `removedReason: 'Account deleted by user'`, `removedAt: new Date()`
- `threads` — `isRemoved: true`
- `comments` — `isRemoved: true`
- `reels` — `isRemoved: true`
- `videos` — `isRemoved: true`
- `stories` — hard deleted (`deleteMany`)
- `threadReplies` — content replaced with `'[deleted]'`

**Sensitive data hard-delete (L195-199):**
- `profileLink` — deleteMany
- `twoFactorSecret` — deleteMany
- `encryptionKey` — deleteMany
- `conversationKeyEnvelope` — deleteMany
- `device` — deleteMany

**Social graph removal (L201-204):**
- `follow` — deleteMany (both directions: followerId OR followingId)
- `block` — deleteMany (both directions: blockerId OR blockedId)
- `mute` — deleteMany (both directions: userId OR mutedId)

**Interaction data (L207-210):**
- `savedPost` — deleteMany
- `postReaction` — deleteMany
- `notification` — deleteMany
- `watchHistory` — deleteMany

**Settings & gamification (L212-217):**
- `userSettings` — deleteMany
- `userStreak` — deleteMany

**TODO (L218-225):** 30-day scheduled purge job needed:
1. Query `WHERE deletedAt < NOW() - 30 days AND isDeleted = true`
2. Hard-delete remaining anonymized records
3. Purge from Cloudflare R2/Stream
4. Remove from Meilisearch
5. Notify admins

3. Returns `{ deleted: true, userId, deletedAt }` (L228)

### Tests

| File | Tests | Coverage |
|------|-------|---------|
| `privacy.controller.spec.ts` | 4 | exportData delegation, deleteAll delegation, deleteAll error propagation, export error propagation |
| `privacy.service.spec.ts` | 7 | exportUserData (returns data, user not found), deleteAllUserData (soft-delete, user not found, already deleted, uses transaction), exportUserData with data (posts/threads/stories, empty arrays, exportedAt timestamp) |
| `privacy.service.auth.spec.ts` | 4 | Authorization: own data only, own posts only, own messages only (senderId), own follows only (followerId) |

---

## 3. PARENTAL CONTROLS MODULE

### Files
| File | Path | Lines |
|------|------|-------|
| parental-controls.module.ts | `apps/api/src/modules/parental-controls/parental-controls.module.ts` | 11 |
| parental-controls.controller.ts | `apps/api/src/modules/parental-controls/parental-controls.controller.ts` | 121 |
| parental-controls.service.ts | `apps/api/src/modules/parental-controls/parental-controls.service.ts` | 357 |
| parental-control.dto.ts | `apps/api/src/modules/parental-controls/dto/parental-control.dto.ts` | 114 |
| parental-controls.controller.spec.ts | `apps/api/src/modules/parental-controls/parental-controls.controller.spec.ts` | 137 |
| parental-controls.service.spec.ts | `apps/api/src/modules/parental-controls/parental-controls.service.spec.ts` | 299 |
| parental-controls.service.edge.spec.ts | `apps/api/src/modules/parental-controls/parental-controls.service.edge.spec.ts` | 154 |

### Module Definition (parental-controls.module.ts, L1-11)
```
controllers: [ParentalControlsController]
providers: [ParentalControlsService]
exports: [ParentalControlsService]   // Exported — restriction checks used by other modules
```

### Controller: ParentalControlsController (parental-controls.controller.ts)

**Class-level decorators:**
- `@ApiTags('Parental Controls')` (L26)
- `@Throttle({ default: { limit: 30, ttl: 60000 } })` — 30 req/min (L27)
- `@Controller('parental-controls')` — prefix `/api/v1/parental-controls` (L28)
- `@UseGuards(ClerkAuthGuard)` (L29)
- `@ApiBearerAuth()` (L30)

#### Endpoints

| # | Method | Route | Handler (Line) | Throttle | Description |
|---|--------|-------|----------------|----------|-------------|
| 1 | `POST` | `/parental-controls/link` | `linkChild` (L33-41) | 30/min | Link a child account with 6-digit PIN |
| 2 | `DELETE` | `/parental-controls/link/:childId` | `unlinkChild` (L43-52) | 30/min | Unlink a child account (requires PIN in body). Returns 200. |
| 3 | `GET` | `/parental-controls/children` | `getMyChildren` (L54-58) | 30/min | Get all linked children for parent |
| 4 | `GET` | `/parental-controls/parent` | `getParentInfo` (L60-64) | 30/min | Get parent info (child's perspective) |
| 5 | `PATCH` | `/parental-controls/:childId` | `updateControls` (L66-74) | 30/min | Update parental controls (requires PIN) |
| 6 | `POST` | `/parental-controls/:childId/pin` | `verifyPin` (L76-86) | **3 req/5min** | Verify PIN (brute-force protection) |
| 7 | `PATCH` | `/parental-controls/:childId/pin` | `changePin` (L88-101) | 30/min | Change PIN (requires current PIN) |
| 8 | `GET` | `/parental-controls/:childId/restrictions` | `getRestrictions` (L103-110) | 30/min | Get restrictions for a child (parent only) |
| 9 | `GET` | `/parental-controls/:childId/digest` | `getActivityDigest` (L112-119) | 30/min | Get 7-day activity digest for a child |

### Service: ParentalControlsService (parental-controls.service.ts)

**Dependencies:** `PrismaService` (L30)

**Crypto utilities (module-level, L8-26):**
- `hashPin(pin: string): Promise<string>` — scrypt with random 16-byte salt, KEY_LENGTH=64, stores as `salt:hash`
- `verifyPin(pin: string, stored: string): Promise<boolean>` — timing-safe comparison via `timingSafeEqual`

#### Method Details

**`linkChild(parentUserId, dto: { childUserId, pin })` — L32-80**
1. Self-link check: `parentUserId === dto.childUserId` throws `BadRequestException` (L33-35)
2. Parent cannot be a child account: checks `User.isChildAccount` (L38-44)
3. Child must exist (L47-53)
4. Child must not already be linked: checks `ParentalControl.findUnique({ childUserId })` (L56-61)
5. Hashes PIN with scrypt (L63)
6. Transaction creates `ParentalControl` + updates child's `User.isChildAccount = true` (L65-77)

**`unlinkChild(parentUserId, childUserId, pin)` — L82-106**
1. Finds control link by `parentUserId + childUserId` (L83-86)
2. Verifies PIN (L90-93)
3. Transaction deletes `ParentalControl` + sets child `User.isChildAccount = false` (L95-103)

**`getMyChildren(parentUserId)` — L108-127**
- Finds all `ParentalControl` where `parentUserId`
- Includes child: id, username, displayName, avatarUrl, isChildAccount
- Ordered by `createdAt: 'desc'`, capped at 50

**`getParentInfo(childUserId)` — L129-158**
- Finds `ParentalControl` by `childUserId` (unique)
- Includes parent: id, username, displayName, avatarUrl
- Returns null if no parent linked
- Returns restrictions: restrictedMode, maxAgeRating, dailyLimitMinutes, dmRestriction, canGoLive, canPost, canComment

**`updateControls(parentUserId, childUserId, pin, dto)` — L160-184**
1. Finds control link (L166-168)
2. Verifies PIN (L175-178) — **Finding 33: PIN required before control updates**
3. Updates `ParentalControl` with dto fields

**`verifyPin(parentUserId, childUserId, pin)` — L186-196**
- Finds control link, verifies PIN
- Returns `{ valid: boolean }`

**`verifyPinForParent(parentUserId, pin)` — L198-209**
- Finds any control for parent (takes first)
- Verifies against first linked child's PIN
- Used for general parent verification

**`changePin(parentUserId, childUserId, currentPin, newPin)` — L211-235**
1. Finds control link
2. Verifies current PIN
3. Hashes new PIN with scrypt
4. Updates stored PIN

**`getRestrictions(childUserId, parentUserId?)` — L237-292**
- Core method for restriction enforcement
- If no `ParentalControl` exists:
  - If `User.isChildAccount = true`: returns **protective defaults** (L252-262) — COPPA/UK AADC/AU Online Safety Act compliance
    - `restrictedMode: true`
    - `maxAgeRating: 'PG'`
    - `dmRestriction: 'followers'` (prevents adult strangers messaging minors)
    - `canGoLive: false` (live streaming disabled for minors)
    - `canPost: true`, `canComment: true`
  - If regular user: returns unrestricted defaults (L265-275)
- If parent is requesting and `parentUserId !== control.parentUserId`, throws `ForbiddenException` (L278-280)
- Returns full restrictions from `ParentalControl` record (L282-291)

**`getActivityDigest(parentUserId, childUserId)` — L294-355**
1. Verifies control link exists (L295-299)
2. Parallel fetch for last 7 days (L305-326):
   - `postsCount` — posts created by child
   - `messagesCount` — messages sent by child
   - `screenTimeLogs` — daily screen time entries
3. Computes `totalScreenTimeMinutes` (L328-331)
4. Builds `dailyBreakdown` with date, minutes, sessions (L333-337)
5. Updates `lastDigestAt` on the control record (L340-343)
6. Returns period, postsCount, messagesCount, totalScreenTimeMinutes, dailyBreakdown

### DTOs (dto/parental-control.dto.ts)

#### LinkChildDto (L15-26)

| Field | Type | Validation | Description |
|-------|------|------------|-------------|
| `childUserId` | string | `@IsString()` | ID of the child user to link |
| `pin` | string | `@MinLength(6) @MaxLength(6) @Matches(/^\d{6}$/)` | 6-digit numeric PIN |

#### UnlinkChildDto (L28-35)

| Field | Type | Validation |
|-------|------|------------|
| `pin` | string | `@MinLength(6) @MaxLength(6) @Matches(/^\d{6}$/)` |

#### UpdateParentalControlDto (L37-88)

| Field | Type | Validation | Default (schema) | Description |
|-------|------|------------|---------|-------------|
| `pin` | string (required) | `@MinLength(6) @MaxLength(6) @Matches(/^\d{6}$/)` | N/A | Required for authorization |
| `restrictedMode` | boolean? | `@IsBoolean()` | `true` | Enable content filtering |
| `maxAgeRating` | string? | `@IsIn(['G', 'PG', 'PG-13', 'R'])` | `"PG"` | Content age rating limit |
| `dailyLimitMinutes` | number? \| null | `@IsInt() @Min(15) @Max(480)` | `null` | Daily screen time limit |
| `dmRestriction` | string? | `@IsIn(['none', 'contacts_only', 'disabled'])` | `"none"` | DM restriction level |
| `canGoLive` | boolean? | `@IsBoolean()` | `false` | Allow live streaming |
| `canPost` | boolean? | `@IsBoolean()` | `true` | Allow creating posts |
| `canComment` | boolean? | `@IsBoolean()` | `true` | Allow commenting |
| `activityDigest` | boolean? | `@IsBoolean()` | `true` | Send activity digests to parent |

#### VerifyPinDto (L90-97)

| Field | Type | Validation |
|-------|------|------------|
| `pin` | string | `@MinLength(6) @MaxLength(6) @Matches(/^\d{6}$/)` |

#### ChangePinDto (L99-113)

| Field | Type | Validation |
|-------|------|------------|
| `currentPin` | string | `@MinLength(6) @MaxLength(6) @Matches(/^\d{6}$/)` |
| `newPin` | string | `@MinLength(6) @MaxLength(6) @Matches(/^\d{6}$/)` |

### Prisma Model

#### ParentalControl (schema.prisma L3337-3358)
```prisma
model ParentalControl {
  id                String    @id @default(uuid())
  parentUserId      String
  childUserId       String    @unique     // One parent per child
  pin               String                // scrypt-hashed "salt:hash"
  restrictedMode    Boolean   @default(true)
  maxAgeRating      String    @default("PG")
  dailyLimitMinutes Int?
  dmRestriction     String    @default("none")
  canGoLive         Boolean   @default(false)
  canPost           Boolean   @default(true)
  canComment        Boolean   @default(true)
  activityDigest    Boolean   @default(true)
  lastDigestAt      DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  parent            User      @relation("ParentControls", ...)
  child             User      @relation("ChildControls", ...)

  @@unique([parentUserId, childUserId])
  @@map("parental_controls")
}
```

**Key constraint:** `childUserId @unique` means each child can only have ONE parent. The composite `@@unique([parentUserId, childUserId])` is redundant given the column-level unique, but provides clarity.

### Security Design

1. **PIN hashing:** scrypt with random 16-byte salt, 64-byte key length
2. **Timing-safe comparison:** `timingSafeEqual` prevents timing attacks
3. **Brute-force protection:** verifyPin endpoint throttled to 3 req/5min
4. **PIN required for all mutations:** updateControls, unlinkChild, changePin all verify PIN first
5. **Child account protection:** COPPA/UK AADC/AU Online Safety Act defaults for unlinked child accounts
6. **Parent verification:** getRestrictions validates parentUserId matches control record

### Tests

| File | Tests | Coverage |
|------|-------|---------|
| `parental-controls.controller.spec.ts` | 8 | All 9 endpoint delegations (link, unlink, getChildren, getParent, updateControls, verifyPin, changePin, getRestrictions, getDigest) |
| `parental-controls.service.spec.ts` | 18 | linkChild (success, self-link, already-linked, parent-is-child, child-not-found), unlinkChild (correct PIN, wrong PIN, not-found), verifyPin (correct, wrong, not-found), getRestrictions (linked, unlinked), getActivityDigest (with data, unlinked), getMyChildren (with/without children), getParentInfo (linked/unlinked), updateControls (valid PIN, invalid PIN, not-found), changePin (success, wrong PIN, not-found), verifyPinForParent (valid, invalid, no-controls) |
| `parental-controls.service.edge.spec.ts` | 13 | Edge cases: self-link, non-existent child, already-linked, parent-is-child, empty children list, null parent, unlinked update, unlinked verify, unlinked unlink, unlinked changePin, unlinked digest, unlinked restrictions (default unrestricted), non-parent restriction view (ForbiddenException), verifyPinForParent no-controls |

---

## 4. HALAL MODULE

### Files
| File | Path | Lines |
|------|------|-------|
| halal.module.ts | `apps/api/src/modules/halal/halal.module.ts` | 10 |
| halal.controller.ts | `apps/api/src/modules/halal/halal.controller.ts` | 127 |
| halal.service.ts | `apps/api/src/modules/halal/halal.service.ts` | 191 |
| halal.controller.spec.ts | `apps/api/src/modules/halal/halal.controller.spec.ts` | 122 |
| halal.service.spec.ts | `apps/api/src/modules/halal/halal.service.spec.ts` | 190 |

### Module Definition (halal.module.ts, L1-10)
```
controllers: [HalalController]
providers: [HalalService]
// NOT exported
```

### Controller: HalalController (halal.controller.ts)

**Class-level decorators:**
- `@ApiTags('Halal Finder')` (L31)
- `@ApiBearerAuth()` (L32)
- `@Controller('halal/restaurants')` — prefix `/api/v1/halal/restaurants` (L33)

**Note:** No class-level auth guard. Auth is applied per-endpoint (some public, some authenticated).

**Inline DTOs (defined in controller file, L10-29):**

#### CreateRestaurantDto (L10-24)

| Field | Type | Validation |
|-------|------|------------|
| `name` | string | `@IsString() @MaxLength(200)` |
| `address` | string | `@IsString() @MaxLength(500)` |
| `city` | string | `@IsString() @MaxLength(100)` |
| `country` | string | `@IsString() @MaxLength(100)` |
| `latitude` | number | `@IsNumber() @Min(-90) @Max(90)` |
| `longitude` | number | `@IsNumber() @Min(-180) @Max(180)` |
| `cuisineType` | string? | `@IsOptional() @IsString() @MaxLength(50)` |
| `priceRange` | number? | `@IsOptional() @IsNumber() @Min(1) @Max(4)` |
| `halalCertified` | boolean? | `@IsOptional() @IsBoolean()` |
| `certifyingBody` | string? | `@IsOptional() @IsString() @MaxLength(200)` |
| `phone` | string? | `@IsOptional() @IsString() @MaxLength(30)` |
| `website` | string? | `@IsOptional() @IsUrl()` |
| `imageUrl` | string? | `@IsOptional() @IsUrl()` |

#### AddReviewDto (L26-29)

| Field | Type | Validation |
|-------|------|------------|
| `rating` | number | `@IsNumber() @Min(1) @Max(5)` |
| `comment` | string? | `@IsOptional() @IsString() @MaxLength(2000)` |

#### Endpoints

| # | Method | Route | Handler (Line) | Auth | Throttle | Description |
|---|--------|-------|----------------|------|----------|-------------|
| 1 | `GET` | `/halal/restaurants` | `findNearby` (L37-71) | Optional | 30/min | Find nearby halal restaurants. Query params: lat (required), lng (required), radius (1-500km, default 10), cuisine, priceRange, certified, cursor. |
| 2 | `GET` | `/halal/restaurants/:id` | `getById` (L73-78) | Optional | default | Get restaurant detail with 20 most recent reviews |
| 3 | `POST` | `/halal/restaurants` | `create` (L80-89) | Required | 10/min | Community-contributed restaurant creation |
| 4 | `POST` | `/halal/restaurants/:id/reviews` | `addReview` (L91-102) | Required | 10/min | Add review (one per user per restaurant). Returns 201. |
| 5 | `GET` | `/halal/restaurants/:id/reviews` | `getReviews` (L104-113) | Optional | default | Paginated reviews with cursor |
| 6 | `POST` | `/halal/restaurants/:id/verify` | `verifyHalal` (L115-125) | Required | 10/min | Community verification vote. Returns 200. Auto-verifies at 5 votes. |

**Controller query param parsing (findNearby, L48-70):**
- `lat` and `lng` are clamped: `Math.max(-90, Math.min(90, parseFloat(lat) || 0))`
- `radius` is clamped: `Math.max(1, Math.min(500, ...))`  with default 10
- `priceRange` parsed to integer
- `certified` compared as string `=== 'true'`

### Service: HalalService (halal.service.ts)

**Dependencies:** `PrismaService` (L7)

#### Method Details

**`findNearby(lat, lng, radiusKm, filters?, cursor?, limit?)` — L9-54**
1. Haversine approximation for bounding box (L18-19):
   - `latDelta = radiusKm / 111`
   - `lngDelta = radiusKm / (111 * cos(lat * PI / 180))`
2. Builds `where` clause with lat/lng range + optional filters (cuisine, priceRange, certified) (L21-28)
3. Cursor-based pagination using `createdAt < cursor` (L27)
4. Fetches `limit + 1` for hasMore detection (L33)
5. Calculates Haversine distance for each result (L41-43)
6. Sorts by distance ascending (L46)
7. Returns `{ data: [...withDistance], meta: { hasMore, cursor } }`

**`getById(id)` — L56-68**
- Finds restaurant with reviews (last 20, ordered desc)
- Throws `NotFoundException` if not found

**`create(userId, data)` — L70-95**
- Validates priceRange 1-4 (L85-87)
- Creates `HalalRestaurant` with `addedById: userId`

**`addReview(userId, restaurantId, rating, comment?)` — L97-131**
1. Validates rating 1-5 (L98-100)
2. Verifies restaurant exists (L102-103)
3. Checks for existing review via composite unique `[restaurantId, userId]` (L106-109)
4. Throws `ConflictException` if already reviewed (L109)
5. Creates `HalalRestaurantReview` (L111-113)
6. Recomputes average rating via `aggregate` (L116-119)
7. Updates restaurant `averageRating` and `reviewCount` (L122-128)

**`getReviews(restaurantId, cursor?, limit?)` — L133-152**
- Paginated reviews with cursor on `createdAt`
- Default limit 20
- Returns `{ data, meta: { hasMore, cursor } }`

**`verifyHalal(userId, restaurantId)` — L154-173**
1. Verifies restaurant exists (L155-156)
2. Checks if user already voted via review existence (L159-162) — **Note: uses review as proxy for vote tracking, not a dedicated vote table**
3. Throws `ConflictException` if already verified
4. Increments `verifyVotes` on restaurant (L164-169)
5. Auto-sets `isVerified = true` when votes reach 5 (L168)
6. Returns `{ verified, votes }`

**Private utilities:**
- `haversineDistance(lat1, lon1, lat2, lon2): number` — L175-184. Earth radius 6371km. Returns km rounded to 1 decimal.
- `deg2rad(deg): number` — L187-189

### Prisma Models

#### HalalRestaurant (schema.prisma L4590-4618)
```prisma
model HalalRestaurant {
  id             String   @id @default(cuid())
  name           String
  address        String
  city           String
  country        String
  latitude       Float
  longitude      Float
  cuisineType    String?
  priceRange     Int?            // 1-4
  halalCertified Boolean  @default(false)
  certifyingBody String?
  phone          String?
  website        String?
  imageUrl       String?
  averageRating  Decimal  @default(0) @db.Decimal(3, 2)
  reviewCount    Int      @default(0)
  verifyVotes    Int      @default(0)
  addedById      String?
  addedBy        User?    @relation("halalRestaurantsAdded", ...)
  isVerified     Boolean  @default(false)
  createdAt      DateTime @default(now())

  reviews HalalRestaurantReview[]

  @@index([latitude, longitude])
  @@index([city])
  @@map("halal_restaurants")
}
```

#### HalalRestaurantReview (schema.prisma L4620-4632)
```prisma
model HalalRestaurantReview {
  id           String          @id @default(cuid())
  restaurantId String
  restaurant   HalalRestaurant @relation(...)
  userId       String
  user         User            @relation("halalRestaurantReviews", ...)
  rating       Int             // 1-5
  comment      String?
  createdAt    DateTime        @default(now())

  @@unique([restaurantId, userId])   // One review per user per restaurant
  @@map("halal_restaurant_reviews")
}
```

#### HalalVerifyVote (schema.prisma L4673-4685)
```prisma
model HalalVerifyVote {
  id         String        @id @default(cuid())
  userId     String
  user       User          @relation("halalVerifyVotes", ...)
  businessId String
  business   HalalBusiness @relation("halalVerifyVotes", ...)
  isVerified Boolean       @default(true)
  createdAt  DateTime      @default(now())

  @@unique([userId, businessId])
  @@index([businessId])
  @@map("halal_verify_votes")
}
```

**Note:** `HalalVerifyVote` model exists in schema but is NOT used by the halal service. The service uses `HalalRestaurantReview` as a proxy for vote tracking (L159). This is a design gap — votes and reviews are conceptually different (a user might verify halal status without leaving a full review).

### Tests

| File | Tests | Coverage |
|------|-------|---------|
| `halal.controller.spec.ts` | 6 | findNearby (default params, with filters/cursor), getById, create, addReview, getReviews, verifyHalal |
| `halal.service.spec.ts` | 12 | findNearby (empty, lat/lng delta, distance sort, cuisine filter), create (invalid priceRange, valid data), getById (found, not-found), addReview (success with rating update, invalid rating, not-found), getReviews (with data, empty), verifyHalal (increment, auto-verify at 5, not-found) |

---

## 5. CROSS-MODULE RELATIONSHIPS

### Settings <-> Other Modules
- `SettingsService.isQuietModeActive()` — exported, callable by notification delivery to suppress notifications
- `UserSettings.messagePermission` / `mentionPermission` — should be checked by chat and mention modules
- `UserSettings.autoPlaySetting` — consumed by mobile client for video auto-play behavior
- `UserSettings.screenTimeLimitMinutes` — returned in screen time stats, enforced client-side

### Privacy <-> All Modules
- `deleteAllUserData()` touches 16+ models across the entire schema
- Export covers 16 data categories but is missing ~10 more (documented TODO)

### Parental Controls <-> Content Modules
- `getRestrictions()` exported — should be called by content creation endpoints to enforce `canPost`, `canComment`, `canGoLive`
- `restrictedMode` and `maxAgeRating` should filter content in feed algorithms
- `dmRestriction` should be enforced in messaging module
- `dailyLimitMinutes` should be checked against `ScreenTimeLog` (currently client-side only)

### Halal <-> User Module
- `addedById` links restaurant to creator via `User` relation
- `HalalRestaurantReview` links to `User` via `userId`

---

## 6. KNOWN ISSUES & GAPS

1. **Settings: updatePrivacy is not transactional** — `User.isPrivate` update and `UserSettings` upsert are separate calls (service L24-43). If one fails, data is inconsistent.

2. **Privacy: export missing ~10 data categories** — Reel reactions, event RSVPs, DM notes, Quran data, Zakat, community memberships, gamification data all missing from GDPR export (service L110-118).

3. **Privacy: 30-day purge job not implemented** — deletedAt is set but no scheduled job exists to hard-delete data after 30 days (service L218-225).

4. **Halal: verifyHalal uses review as vote proxy** — Users who want to verify halal status without leaving a review cannot do so. The `HalalVerifyVote` model exists in schema but is unused by the service.

5. **Halal: no PostGIS** — Nearby search uses Haversine approximation with bounding box. Works for small radii but less accurate at large distances or near poles.

6. **Parental Controls: server-side enforcement gaps** — `canPost`, `canComment`, `canGoLive`, `dmRestriction` are stored but not checked by the respective content creation/messaging endpoints. Enforcement is client-side only.

7. **Settings: `undoSendSeconds` field exists in schema but has no endpoint** — stored with default 5, but no PATCH endpoint to update it.

8. **Settings: `dailyTimeLimit` (wellbeing) vs `screenTimeLimitMinutes`** — Two separate screen time limit fields exist in `UserSettings`. `dailyTimeLimit` is set via wellbeing DTO (15-480 min), `screenTimeLimitMinutes` via dedicated screen-time/limit endpoint (1-1440 min). Unclear which takes precedence.
