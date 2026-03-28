# Module Architecture: Admin, Health, Infrastructure & Smaller Modules

> Extraction date: 2026-03-25
> Scope: 14 modules — admin, health, og, scheduling, retention, creator, thumbnails, drafts, promotions, watch-history, subtitles, profile-links, majlis-lists, webhooks
> Source: `apps/api/src/modules/`

---

## Table of Contents

1. [Admin Module](#1-admin-module)
2. [Health Module](#2-health-module)
3. [OG (Open Graph & SEO) Module](#3-og-open-graph--seo-module)
4. [Scheduling Module](#4-scheduling-module)
5. [Retention Module](#5-retention-module)
6. [Creator Analytics Module](#6-creator-analytics-module)
7. [Thumbnails (A/B Testing) Module](#7-thumbnails-ab-testing-module)
8. [Drafts Module](#8-drafts-module)
9. [Promotions Module](#9-promotions-module)
10. [Watch History Module](#10-watch-history-module)
11. [Subtitles Module](#11-subtitles-module)
12. [Profile Links Module](#12-profile-links-module)
13. [Majlis Lists Module](#13-majlis-lists-module)
14. [Webhooks Module](#14-webhooks-module)

---

## 1. Admin Module

**Path:** `apps/api/src/modules/admin/`
**Files:**
- `admin.module.ts` (9 lines)
- `admin.controller.ts` (118 lines)
- `admin.service.ts` (312 lines)
- `dto/resolve-report.dto.ts` (15 lines)
- `dto/ban-user.dto.ts` (17 lines)
- `admin.controller.spec.ts` (test)
- `admin.service.spec.ts` (test)

**Module Setup** (`admin.module.ts` L1-9):
- Controllers: `AdminController`
- Providers: `AdminService`
- No exports (admin-only, not consumed by other modules)

### Controller — `AdminController` (L24-117)

**Class-level decorators:**
- `@ApiTags('Admin')` (L24)
- `@Throttle({ default: { limit: 30, ttl: 60000 } })` — 30 req/min (L25)
- `@Controller('admin')` (L26)
- `@UseGuards(ClerkAuthGuard)` — all endpoints require auth (L27)
- `@ApiBearerAuth()` (L28)

**Constructor dependencies** (L30-33):
- `AdminService`
- `FeatureFlagsService` (from `common/services/`)

#### Endpoints

| Method | Route | Auth | Operation | Line |
|--------|-------|------|-----------|------|
| `GET` | `/admin/reports` | ClerkAuth + Admin | Get paginated reports (filter by status) | L35-43 |
| `GET` | `/admin/reports/:id` | ClerkAuth + Admin | Get a single report with full context | L45-52 |
| `PATCH` | `/admin/reports/:id` | ClerkAuth + Admin | Resolve a report (dismiss/warn/remove/ban) | L54-62 |
| `GET` | `/admin/stats` | ClerkAuth + Admin | Get platform-wide statistics | L64-68 |
| `POST` | `/admin/users/:id/ban` | ClerkAuth + Admin | Ban a user (HttpCode 200) | L70-79 |
| `POST` | `/admin/users/:id/unban` | ClerkAuth + Admin | Unban a user (HttpCode 200) | L81-89 |
| `GET` | `/admin/flags` | ClerkAuth + Admin | Get all feature flags | L93-98 |
| `PATCH` | `/admin/flags/:name` | ClerkAuth + Admin | Set a feature flag value | L100-109 |
| `DELETE` | `/admin/flags/:name` | ClerkAuth + Admin | Delete a feature flag | L111-116 |

**Endpoint Details:**

1. **GET /admin/reports** (L35-43)
   - Params: `@CurrentUser('id') adminId`, `@Query('status') status?`, `@Query('cursor') cursor?`
   - Calls: `adminService.getReports(adminId, status, cursor)`

2. **GET /admin/reports/:id** (L45-52)
   - Params: `@CurrentUser('id') adminId`, `@Param('id') reportId`
   - Calls: `adminService.getReport(adminId, reportId)`

3. **PATCH /admin/reports/:id** (L54-62)
   - Params: `@CurrentUser('id') adminId`, `@Param('id') reportId`, `@Body() dto: ResolveReportDto`
   - Calls: `adminService.resolveReport(adminId, reportId, dto.action, dto.note)`

4. **POST /admin/users/:id/ban** (L70-79)
   - Params: `@CurrentUser('id') adminId`, `@Param('id') targetId`, `@Body() dto: BanUserDto`
   - Calls: `adminService.banUser(adminId, targetId, dto.reason, dto.duration)`

5. **PATCH /admin/flags/:name** (L100-109)
   - Validates flag value: must match `^(true|false|[0-9]{1,3})$`
   - Throws `BadRequestException` on invalid format

### DTOs

**ResolveReportDto** (`dto/resolve-report.dto.ts` L4-14):
| Field | Type | Validators | Description |
|-------|------|-----------|-------------|
| `action` | `'DISMISS' \| 'WARN' \| 'REMOVE_CONTENT' \| 'BAN_USER'` | `@IsEnum` | Action to take |
| `note` | `string?` | `@IsOptional`, `@IsString`, `@MaxLength(1000)` | Moderator note |

**BanUserDto** (`dto/ban-user.dto.ts` L4-16):
| Field | Type | Validators | Description |
|-------|------|-----------|-------------|
| `reason` | `string` | `@IsString`, `@MaxLength(500)` | Reason for ban |
| `duration` | `number?` | `@IsOptional`, `@IsNumber`, `@Min(1)`, `@Max(8760)` | Duration in hours (omit = permanent) |

### Service — `AdminService` (L12-312)

**Dependencies** (L17-24):
- `PrismaService`
- `ConfigService`
- Creates Clerk client via `createClerkClient({ secretKey })` for session revocation

**Methods:**

1. **`verifyAdmin(userId: string)`** (L26-34)
   - Queries `user.findUnique` for role
   - Throws `ForbiddenException('Admin access required')` if not ADMIN
   - Public method (also called by controller for feature flags)

2. **`assertAdmin(userId: string)`** (L36-38)
   - Private alias for `verifyAdmin`

3. **`getReports(adminId, status?, cursor?, limit=20)`** (L40-82)
   - Asserts admin
   - Uses Prisma ID-based cursor pagination (`cursor: { id: cursor }, skip: 1`)
   - Includes `reporter` and `reportedUser` selects (id, username, displayName, avatarUrl)
   - Returns `{ data, meta: { cursor, hasMore } }`

4. **`getReport(adminId, reportId)`** (L84-111)
   - Single report with full reporter/reportedUser details
   - Throws `NotFoundException` if not found

5. **`resolveReport(adminId, reportId, action, note?)`** (L113-218)
   - Maps action strings to Prisma enums:
     - `DISMISS` -> status: DISMISSED, action: NONE
     - `WARN` -> status: RESOLVED, action: WARNING
     - `REMOVE_CONTENT` -> status: RESOLVED, action: CONTENT_REMOVED
     - `BAN_USER` -> status: RESOLVED, action: PERMANENT_BAN
     - `TEMP_BAN` -> status: RESOLVED, action: TEMP_BAN
     - `MUTE` -> status: RESOLVED, action: TEMP_MUTE
   - **Content removal** (L148-160): If CONTENT_REMOVED, sets `isRemoved: true` on post/comment, `isDeleted: true` on message
   - **Ban execution** (L163-168): Calls `banUser()` for PERMANENT_BAN or TEMP_BAN (72h default)
   - **Mute** (L171-176): Increments `warningsCount` on user
   - **Warning notification** (L179-189): Creates notification with type 'SYSTEM'
   - **Moderation log** (L192-206): Creates `ModerationLog` entry for audit trail
   - Updates report with status, actionTaken, reviewedById, reviewedAt, moderatorNotes

6. **`getStats(adminId)`** (L220-233)
   - Parallel counts: users (active), posts, threads (chainHead), reels, videos, pendingReports
   - Returns flat object: `{ users, posts, threads, reels, videos, pendingReports }`

7. **`banUser(adminId, targetId, reason, duration?)`** (L235-278)
   - Verifies target exists and is not ADMIN
   - Calculates `banExpiresAt` from duration (hours * 3600000)
   - Updates user: `isBanned: true`, `isDeactivated: true`, `banReason`, `banExpiresAt`
   - **Clerk session revocation** (L266-275): Calls `clerk.users.banUser(clerkId)` to immediately log out banned user
   - Non-fatal Clerk errors: logged but ban still applies in DB

8. **`unbanUser(adminId, targetId)`** (L280-311)
   - Resets `isBanned: false`, `isDeactivated: false`, `banReason: null`, `banExpiresAt: null`
   - **Clerk unban** (L300-308): Calls `clerk.users.unbanUser(clerkId)` to re-enable sign-in
   - Non-fatal Clerk errors: logged

---

## 2. Health Module

**Path:** `apps/api/src/modules/health/`
**Files:**
- `health.module.ts` (8 lines)
- `health.controller.ts` (149 lines)
- `legal.controller.ts` (303 lines)
- `health.controller.spec.ts` (test)
- `legal.controller.spec.ts` (test)

**Module Setup** (`health.module.ts` L1-8):
- Controllers: `HealthController`, `LegalController`
- No providers or exports (controllers use injected global services)

### HealthController (L16-148)

**Class-level decorators:**
- `@ApiTags('Health')` (L13)
- `@Throttle({ default: { limit: 60, ttl: 60000 } })` — 60 req/min (L14)
- `@Controller('health')` (L15)

**Constructor dependencies** (L21-32):
- `PrismaService`
- `@Inject('REDIS') Redis`
- `AsyncJobService`
- `QueueService`
- `FeatureFlagsService`
- `ConfigService`
- Reads `R2_PUBLIC_URL`, `CF_STREAM_API_TOKEN`, `CF_STREAM_ACCOUNT_ID` from config

#### Endpoints

| Method | Route | Auth | Throttle | Operation | Line |
|--------|-------|------|----------|-----------|------|
| `GET` | `/health` | OptionalClerkAuth (Admin only) | 60/min | Health check dashboard — DB, Redis, R2, Stream | L34-75 |
| `GET` | `/health/ready` | None | 60/min | Readiness probe — DB + Redis | L77-92 |
| `GET` | `/health/live` | None | 60/min | Liveness probe — always 200 | L94-99 |
| `GET` | `/health/metrics` | OptionalClerkAuth (Admin only) | 10/min | API metrics — counts, jobs, memory | L101-131 |
| `GET` | `/health/config` | OptionalClerkAuth | 60/min | Client config — resolved feature flags | L133-147 |

**Endpoint Details:**

1. **GET /health** (L34-75)
   - Admin-only (checks user.role === 'ADMIN')
   - Parallel checks: DB (`SELECT 1`), Redis (PING), R2 (HEAD to public URL), Cloudflare Stream (API check)
   - Returns: `{ status: 'healthy'|'degraded'|'unhealthy', timestamp, services: { database, redis, storage, stream }, version, uptime }`
   - Critical: DB + Redis. Stream 'not_configured' if token missing.

2. **GET /health/ready** (L77-92)
   - No auth required (K8s/Railway readiness probe)
   - Checks DB + Redis
   - Returns 200 `{ status: 'ready' }` or 503 `ServiceUnavailableException`
   - Used as Railway health check fallback

3. **GET /health/live** (L94-99)
   - No auth, always 200
   - Returns: `{ status: 'alive', uptime }`
   - **Railway healthcheckPath:** `/api/v1/health/live`

4. **GET /health/metrics** (L101-131)
   - Admin-only, 10 req/min throttle
   - Counts: users, posts, threads, reels (status READY)
   - `inProcessJobs`: from `AsyncJobService.getStats()`
   - `queues`: from `QueueService.getStats()`
   - `memory`: heapUsedMB, heapTotalMB, rssMB

5. **GET /health/config** (L133-147)
   - Open to any authenticated user (or anonymous)
   - Fetches all feature flags from `FeatureFlagsService`
   - Resolves percentage-based flags per user (`isEnabledForUser(key, userId)`)
   - Anonymous users get `false` for percentage rollouts
   - Returns: `{ flags: Record<string, boolean> }`

### LegalController (L8-302)

**Class-level decorators:**
- `@ApiTags('Legal')` (L6)
- `@Throttle({ default: { limit: 60, ttl: 60000 } })` (L7)
- `@Controller()` — routes at root level under `/api/v1/` (L8)

#### Endpoints

| Method | Route | Auth | Operation | Line |
|--------|-------|------|-----------|------|
| `GET` | `/privacy-policy` | None | Privacy Policy (JSON) | L9-168 |
| `GET` | `/terms-of-service` | None | Terms of Service (JSON) | L170-301 |

**Privacy Policy** (L12-168):
- Returns JSON with `title`, `lastUpdated: '2026-03-22'`, `version: '1.1'`
- 14 sections covering:
  - Information collected (account, content, usage, device, location, Islamic preferences)
  - GDPR Article 6 legal basis (contract, consent, legitimate interest, legal obligation)
  - **Special Category Data (Art 9)**: madhab, prayer preferences, Quran progress, fasting, zakat, mosque attendance, halal preferences — processed under explicit consent Art 9(2)(a)
  - Automated decision-making (Art 22): feed personalization, content moderation (Claude AI), spam detection
  - Sub-processors: Railway, Neon, Cloudflare, Clerk, Stripe, Anthropic Claude, Meilisearch, Aladhan, Quran.com, OpenStreetMap, Upstash
  - International transfers: SCCs, Transfer Impact Assessments
  - Data retention: stories 24h, watch history 90d, screen time 30d, moderation logs 2y
  - CCPA compliance
  - Supervisory authorities: OAIC (Australia), EU DPA, UK ICO
  - Contact emails: privacy@, dpo@, safety@, legal@

**Terms of Service** (L173-301):
- Returns JSON with `title`, `lastUpdated: '2026-03-22'`, `version: '1.1'`
- 14 sections covering:
  - Eligibility (13+ age requirement, COPPA/GDPR Art 8)
  - Content policy (CSAM reporting to NCMEC, terrorism 1h removal)
  - DMCA (designated agent: legal@mizanly.app, 3-strike policy)
  - Marketplace consumer protection (14-day cooling-off, Australian Consumer Law)
  - Dispute resolution (30-day appeal, DSA Art 21 for EU)
  - Governing law: NSW, Australia
  - Contact: legal@, dmca@, privacy@, safety@, lawenforcement@

---

## 3. OG (Open Graph & SEO) Module

**Path:** `apps/api/src/modules/og/`
**Files:**
- `og.module.ts` (10 lines)
- `og.controller.ts` (93 lines)
- `og.service.ts` (393 lines)
- `og.controller.spec.ts` (test)
- `og.service.spec.ts` (test)

**Module Setup** (`og.module.ts` L1-9):
- Controllers: `OgController`
- Providers: `OgService`

### Controller — `OgController` (L9-92)

**Class-level:**
- `@ApiTags('Open Graph & SEO')` (L7)
- `@Controller()` — root level (L8)

#### Endpoints

| Method | Route | Auth | Throttle | Operation | Line |
|--------|-------|------|----------|-----------|------|
| `GET` | `/og/post/:id` | None | 60/min | OG meta for a post (HTML) | L12-20 |
| `GET` | `/og/reel/:id` | None | 60/min | OG meta for a reel (HTML) | L22-30 |
| `GET` | `/og/profile/:username` | None | 60/min | OG meta for a user profile (HTML) | L32-40 |
| `GET` | `/og/thread/:id` | None | 60/min | OG meta for a thread (HTML) | L42-50 |
| `GET` | `/og/unfurl` | None | 30/min | Fetch URL metadata for link preview | L52-63 |
| `GET` | `/sitemap.xml` | None | 10/min | XML Sitemap | L65-73 |
| `GET` | `/robots.txt` | None | — | Robots.txt (plain text) | L75-81 |
| `GET` | `/landing` | None | 30/min | Landing page (HTML) | L83-91 |

All OG endpoints set `Content-Type: text/html`, `Cache-Control: public, max-age=3600`.

### Service — `OgService` (L24-392)

**Dependencies:**
- `PrismaService`, `ConfigService`
- Reads `APP_URL` (default: `https://mizanly.com`)

**Helper functions** (module-level, L9-21):
- `escapeHtml(text)`: Escapes `&`, `<`, `>`, `"`, `'`
- `truncate(text, maxLen)`: Truncates with `...`

**Constants** (L5-7):
- `APP_NAME = 'Mizanly'`
- `APP_STORE_URL = 'https://apps.apple.com/app/mizanly'`
- `PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.mizanly.app'`

**Methods:**

1. **`getPostOg(postId)`** (L34-51)
   - Queries post: `isRemoved: false`, `visibility: PUBLIC`
   - Checks user not banned/deactivated
   - OG type: `article`
   - Image: first mediaUrl or user avatar

2. **`getReelOg(reelId)`** (L54-72)
   - Queries reel: `isRemoved: false`, `status: READY`
   - OG type: `video.other`
   - Image: thumbnailUrl or user avatar

3. **`getProfileOg(username)`** (L74-96)
   - Queries user: `isBanned: false`, `isDeactivated: false`, `isDeleted: false`
   - Includes `_count: { followers, posts }`
   - Description: bio or "X posts, Y followers"
   - OG type: `profile`

4. **`getThreadOg(threadId)`** (L98-115)
   - Queries thread: `isRemoved: false`, `visibility: PUBLIC`
   - OG type: `article`

5. **`getSitemapXml()`** (L117-170)
   - Fetches up to 500 each: public users, public posts, public threads
   - Generates XML sitemap with priorities: landing 1.0, profiles 0.8, posts/threads 0.6

6. **`getRobotsTxt()`** (L172-179)
   - Allows all, disallows `/api/` and `/admin/`
   - Includes sitemap URL

7. **`getLandingPage()`** (L182-251)
   - Full HTML landing page with CSS
   - Dark theme (#0D1117), emerald gradient logo, 5 feature cards (Saf, Majlis, Risalah, Bakra, Minbar)
   - App Store + Play Store download buttons

8. **`fetchUrlMetadata(url)`** (L258-330)
   - **SSRF protection** (L267-274): Blocks non-HTTPS, localhost, private IPs (127.0.0.1, 169.254.*, 10.*, 192.168.*, 172.16.*, ::1, 0.0.0.0)
   - User-Agent: `MizanlyBot/1.0 (+https://mizanly.com)`
   - 5s timeout, follows redirects
   - Parses OG tags via regex (4 patterns per property for different attribute orders)
   - Falls back: `og:title` -> `twitter:title` -> `<title>` tag
   - Returns: `{ url, domain, title, description, imageUrl, faviconUrl }`
   - Favicon: Google S2 favicons API

9. **`renderHtml(meta)`** (L332-391)
   - Private method generating HTML with OG + Twitter Card meta tags
   - Includes deep link script: tries `mizanly://` URL scheme first, falls back to App Store/Play Store after 1.5s
   - Theme color: `#0A7B4F`

---

## 4. Scheduling Module

**Path:** `apps/api/src/modules/scheduling/`
**Files:**
- `scheduling.module.ts` (10 lines)
- `scheduling.controller.ts` (105 lines)
- `scheduling.service.ts` (285 lines)
- `scheduling.controller.spec.ts` (test)
- `scheduling.service.spec.ts` (test)
- `scheduling.service.edge.spec.ts` (test)
- `scheduling.service.auth.spec.ts` (test)

**Module Setup** (`scheduling.module.ts` L1-10):
- Controllers: `SchedulingController`
- Providers: `SchedulingService`
- **Exports:** `SchedulingService`

### Inline DTO — `UpdateScheduleDto` (controller L22-39)

| Field | Type | Validators | Description |
|-------|------|-----------|-------------|
| `scheduledAt` | `string` | `@IsISO8601`, `@IsNotEmpty` | ISO 8601 datetime |
| `timezone` | `string?` | `@IsOptional`, `@IsString` | IANA timezone (for future use) |

### Controller — `SchedulingController` (L44-105)

**Class-level:**
- `@ApiTags('Scheduling')` (L41)
- `@Throttle({ default: { limit: 60, ttl: 60000 } })` (L42)
- `@Controller('scheduling')` (L43)

#### Endpoints

| Method | Route | Auth | Operation | Line |
|--------|-------|------|-----------|------|
| `GET` | `/scheduling/scheduled` | ClerkAuth | Get all scheduled content | L47-53 |
| `PATCH` | `/scheduling/:type/:id` | ClerkAuth | Update scheduled time | L55-71 |
| `DELETE` | `/scheduling/:type/:id` | ClerkAuth | Cancel scheduled post | L73-84 |
| `POST` | `/scheduling/publish-now/:type/:id` | ClerkAuth | Publish immediately | L86-97 |
| `POST` | `/scheduling/publish-overdue` | None | Auto-publish overdue (cron/internal) | L99-104 |

**Type param:** `'post' | 'thread' | 'reel' | 'video'`

### Service — `SchedulingService` (L27-285)

**Exported types** (L12-24):
```typescript
interface ScheduledItem {
  id: string;
  type: 'post' | 'thread' | 'reel' | 'video';
  title?: string; content?: string; caption?: string;
  scheduledAt: Date; createdAt: Date;
}
type ScheduledContent = Post | Thread | Reel | Video;
```

**Methods:**

1. **`getScheduled(userId)`** (L40-118)
   - Parallel queries for posts, threads, reels, videos where `scheduledAt > now`
   - Takes 50 per type
   - Merges and sorts by scheduledAt ascending

2. **`updateSchedule(userId, type, id, scheduledAt)`** (L138-168)
   - **Timezone handling** (L120-137 comments): All dates stored as UTC. JS `new Date()` converts timezone-aware ISO strings automatically.
   - Validates date is not NaN
   - **Minimum 15 minutes from now** (L150-155)
   - Verifies ownership via `findContent()` helper
   - Updates `scheduledAt` on the content

3. **`cancelSchedule(userId, type, id)`** (L170-185)
   - Sets `scheduledAt: null` (makes content immediately visible)

4. **`publishNow(userId, type, id)`** (L187-202)
   - Same as cancel: sets `scheduledAt: null`

5. **`findContent(model, id)`** (L205-218)
   - Private switch-based helper returning `{ userId }` for ownership check

6. **`updateContent(model, id, data)`** (L220-237)
   - Private switch-based helper for type-safe Prisma update

7. **`publishOverdueContent()`** (L248-284)
   - **`@Cron(CronExpression.EVERY_MINUTE)`** — runs every minute
   - `updateMany` on all 4 content types where `scheduledAt <= now`
   - Sets `scheduledAt: null` for overdue items
   - Logs total published count if > 0
   - Returns counts per type

---

## 5. Retention Module

**Path:** `apps/api/src/modules/retention/`
**Files:**
- `retention.module.ts` (11 lines)
- `retention.controller.ts` (28 lines)
- `retention.service.ts` (244 lines)
- `dto/track-session-depth.dto.ts` (13 lines)
- `retention.controller.spec.ts` (test)
- `retention.service.spec.ts` (test)

**Module Setup** (`retention.module.ts` L1-10):
- Controllers: `RetentionController`
- Providers: `RetentionService`
- **Exports:** `RetentionService`

### DTO — `TrackSessionDepthDto` (L4-12)

| Field | Type | Validators | Description |
|-------|------|-----------|-------------|
| `scrollDepth` | `number` | `@Min(0)`, `@Max(100000)` | Scroll depth metric |
| `timeSpentMs` | `number` | `@Min(0)`, `@Max(86400000)` | Time spent in milliseconds |
| `interactionCount` | `number` | `@Min(0)`, `@Max(100000)` | Number of interactions |
| `space` | `string` | `@IsIn(['saf','majlis','risalah','bakra','minbar'])` | Which space |

### Controller — `RetentionController` (L14-27)

**Class-level:**
- `@ApiTags('Retention')` (L9)
- `@Controller('retention')` (L10)
- `@UseGuards(ClerkAuthGuard)` (L11)
- `@Throttle({ default: { ttl: 60000, limit: 30 } })` (L13)

| Method | Route | Auth | Operation | Line |
|--------|-------|------|-----------|------|
| `POST` | `/retention/session-depth` | ClerkAuth | Track session depth | L17-26 |

### Service — `RetentionService` (L10-243)

**Dependencies:** `PrismaService`, `@Inject('REDIS') Redis`

**Methods:**

1. **`checkReelViewMilestone(reelId)`** (L24-46)
   - Milestones: 100, 1K, 10K, 100K, 1M
   - Uses Redis key `milestone:reel:{reelId}:{milestone}` with 30-day TTL
   - Returns formatted count string ("1K", "10K", "1M") or null

2. **`getUsersWithExpiringStreaks()`** (L54-84)
   - Finds `UserStreak` records where `currentDays >= 3` and last activity was yesterday (not today)
   - Redis dedup: `streak_warn:{userId}:{date}` with 24h TTL
   - Returns array of `{ userId, currentDays }`

3. **`getSocialFomoTargets()`** (L91-130)
   - Finds users inactive 24h-7d
   - Counts friend posts in last 24h (via Follow relation)
   - Triggers if >= 3 friend posts
   - Redis dedup: `fomo:{userId}:{date}` with 24h TTL
   - Returns `{ userId, friendCount }[]`

4. **`isInJummahGracePeriod()`** (L138-143)
   - Returns `true` if Friday 12:00-14:00 (UTC)
   - Used to prevent streak breaks during Jummah prayer

5. **`trackSessionDepth(userId, data)`** (L151-168)
   - Stores in Redis list `session:{userId}:{date}` as JSON
   - 7-day TTL

6. **`canSendNotification(userId)`** (L184-194)
   - Max 10 notifications/day per user (Redis counter)
   - Quiet hours: 22:00-06:00 (UTC)
   - Returns boolean

7. **`trackNotificationSent(userId)`** (L199-206)
   - Increments Redis counter, sets 24h TTL on first increment only

8. **`getWeeklySummary(userId)`** (L213-242)
   - Aggregates post/reel stats for last 7 days
   - Counts new followers
   - Returns: `{ period, newPosts, newReels, newFollowers, totalLikes, totalComments, totalViews }`

---

## 6. Creator Analytics Module

**Path:** `apps/api/src/modules/creator/`
**Files:**
- `creator.module.ts` (11 lines)
- `creator.controller.ts` (96 lines)
- `creator.service.ts` (403 lines)
- `creator.controller.spec.ts` (test)
- `creator.service.spec.ts` (test)

**Module Setup** (`creator.module.ts` L1-10):
- Controllers: `CreatorController`
- Providers: `CreatorService`
- **Exports:** `CreatorService`

### Inline DTO — `AskAIDto` (controller L16-18)

| Field | Type | Validators |
|-------|------|-----------|
| `question` | `string` | `@IsString`, `@MaxLength(1000)` |

### Controller — `CreatorController` (L24-95)

**Class-level:**
- `@ApiTags('Creator Analytics')` (L20)
- `@Controller('creator')` (L21)
- `@UseGuards(ClerkAuthGuard)` (L22)

#### Endpoints

| Method | Route | Auth | Throttle | Operation | Line |
|--------|-------|------|----------|-----------|------|
| `GET` | `/creator/insights/post/:postId` | ClerkAuth | default | Post engagement insights | L27-37 |
| `GET` | `/creator/insights/reel/:reelId` | ClerkAuth | default | Reel engagement insights | L39-49 |
| `GET` | `/creator/analytics/overview` | ClerkAuth | default | Dashboard overview | L51-56 |
| `GET` | `/creator/analytics/audience` | ClerkAuth | default | Audience demographics | L58-63 |
| `GET` | `/creator/analytics/content` | ClerkAuth | default | Top performing content | L65-70 |
| `GET` | `/creator/analytics/growth` | ClerkAuth | default | Follower growth (30d) | L72-77 |
| `GET` | `/creator/analytics/revenue` | ClerkAuth | default | Revenue summary | L79-84 |
| `POST` | `/creator/ask` | ClerkAuth | 20/hour | AI analytics chat | L86-94 |

### Service — `CreatorService` (L12-402)

**Dependencies:** `PrismaService`, `ConfigService`

**Methods:**

1. **`getPostInsights(postId, userId)`** (L20-51)
   - Ownership check (403 if not owner)
   - Returns: likes, comments, shares, saves, views, createdAt, engagementRate (%)

2. **`getReelInsights(reelId, userId)`** (L53-82)
   - Same pattern as post insights

3. **`getDashboardOverview(userId)`** (L84-128)
   - Parallel: post aggregate, reel aggregate, tip aggregate
   - Returns: followers, totalPosts, totalLikes, totalViews, totalComments, engagementRate, revenue

4. **`getAudienceDemographics(userId)`** (L130-148)
   - **Raw SQL** (L133-139): `$queryRawUnsafe` to aggregate follower locations
   - Groups by `COALESCE(u."location", 'Unknown')`, top 10
   - Returns: `{ topLocations, totalFollowers }`

5. **`getContentPerformance(userId)`** (L150-193)
   - Top 10 posts + top 10 reels by likes
   - Calculates best posting hours from content creation times
   - Returns: `{ topPosts, topReels, bestHours }`

6. **`getGrowthTrends(userId)`** (L196-214)
   - Last 30 days of follow events, grouped by day
   - Returns: `{ daily: Record<string, number>, totalNewFollowers }`

7. **`getRevenueSummary(userId)`** (L216-260)
   - Tips: gross, fees, net, count (status: 'completed')
   - Memberships: tier price * active subscribers
   - Returns: `{ total, tips: { total, gross, fees, count }, memberships: { total, count } }`

8. **`getChannelDemographics(channelId)`** (L264-300)
   - Groups `ViewerDemographic` by country, ageRange, gender, source
   - Last 30 days
   - Not exposed via controller (internal/future use)

9. **`askAI(userId, question)`** (L308-401)
   - Gathers analytics context: user profile, top 10 posts (30d), follower count, post count
   - Builds context string with engagement rates per post
   - **AI call** (L367-383): Anthropic API via `fetch`, model `claude-haiku-4-5-20251001`, max_tokens 500
   - System prompt: "analytics assistant for Mizanly... use ONLY data provided... 2-3 sentences"
   - 30s timeout
   - **Fallback** (L359-363): If no API key, returns static summary
   - **Error fallback** (L395-399): Returns basic stats
   - Returns: `{ answer, dataUsed: ['followers','posts','engagement','hashtags'] }`

---

## 7. Thumbnails (A/B Testing) Module

**Path:** `apps/api/src/modules/thumbnails/`
**Files:**
- `thumbnails.module.ts` (11 lines)
- `thumbnails.controller.ts` (89 lines)
- `thumbnails.service.ts` (200 lines)
- `thumbnails.controller.spec.ts` (test)
- `thumbnails.service.spec.ts` (test)

**Module Setup** (`thumbnails.module.ts` L1-10):
- Controllers: `ThumbnailsController`
- Providers: `ThumbnailsService`
- **Exports:** `ThumbnailsService`

### Inline DTOs (controller L10-30)

**TrackVariantDto** (L10-12):
| Field | Type | Validators |
|-------|------|-----------|
| `variantId` | `string` | `@IsString`, `@MaxLength(100)` |

**CreateVariantsDto** (L14-30):
| Field | Type | Validators |
|-------|------|-----------|
| `contentType` | `string` | `@IsString`, `@IsIn(['post','reel','video'])` |
| `contentId` | `string` | `@IsString` |
| `thumbnailUrls` | `string[]` | `@IsArray`, `@IsString({ each })`, `@ArrayMinSize(2)`, `@ArrayMaxSize(3)` |

### Controller — `ThumbnailsController` (L34-88)

**Class-level:**
- `@ApiTags('Thumbnail A/B Testing')` (L32)
- `@Controller('thumbnails')` (L33)

#### Endpoints

| Method | Route | Auth | Throttle | Operation | Line |
|--------|-------|------|----------|-----------|------|
| `POST` | `/thumbnails/variants` | ClerkAuth | default | Upload 2-3 variants | L37-48 |
| `GET` | `/thumbnails/variants/:contentType/:contentId` | ClerkAuth | default | Get variants with stats (owner) | L50-60 |
| `GET` | `/thumbnails/serve/:contentType/:contentId` | OptionalClerkAuth | default | Get thumbnail to display | L62-71 |
| `POST` | `/thumbnails/impression` | ClerkAuth | 100/min | Track impression | L73-79 |
| `POST` | `/thumbnails/click` | ClerkAuth | 100/min | Track click | L81-87 |

### Service — `ThumbnailsService` (L11-199)

**Constants** (L7-8):
- `MAX_VARIANTS = 3`
- `WINNER_THRESHOLD = 1000` — impressions before declaring winner

**Methods:**

1. **`createVariants(contentType, contentId, thumbnailUrls, userId?)`** (L19-46)
   - Validates 2-3 URLs
   - Verifies content ownership
   - Checks no existing variants
   - Creates `ThumbnailVariant` records

2. **`getVariants(contentType, contentId, userId?)`** (L51-82)
   - Ownership verification
   - Calculates CTR per variant: `(clicks / impressions) * 100`, rounded to 2 decimals
   - Returns: `{ variants[], totalImpressions, testComplete, winner }`

3. **`serveThumbnail(contentType, contentId)`** (L89-118)
   - If winner declared: always serve winner
   - If testing: random variant selection (`Math.random()`)
   - Fire-and-forget impression tracking + winner check
   - Returns: `{ thumbnailUrl, variantId }`

4. **`trackImpression(variantId)`** (L123-133)
   - Increments impressions, checks for winner
   - Returns: `{ tracked: true }`

5. **`trackClick(variantId)`** (L138-144)
   - Increments clicks
   - Returns: `{ tracked: true }`

6. **`checkForWinner(contentType, contentId)`** (L149-179)
   - Private method
   - Skips if winner already exists
   - Requires total impressions >= WINNER_THRESHOLD (1000)
   - Selects variant with highest CTR (clicks/impressions)
   - Marks as `isWinner: true`

7. **`verifyContentOwnership(contentType, contentId, userId)`** (L184-198)
   - Private method
   - Switch on POST/REEL/VIDEO, checks userId match

---

## 8. Drafts Module

**Path:** `apps/api/src/modules/drafts/`
**Files:**
- `drafts.module.ts` (10 lines)
- `drafts.controller.ts` (59 lines)
- `drafts.service.ts` (72 lines)
- `dto/save-draft.dto.ts` (13 lines)
- `drafts.controller.spec.ts` (test)
- `drafts.service.spec.ts` (test)
- `drafts.service.edge.spec.ts` (test)

**Module Setup** (`drafts.module.ts` L1-10):
- Controllers: `DraftsController`
- Providers: `DraftsService`
- **Exports:** `DraftsService`

### DTO — `SaveDraftDto` (L4-13)

| Field | Type | Validators | Description |
|-------|------|-----------|-------------|
| `space` | `string?` | `@IsEnum(['SAF','BAKRA','MAJLIS','MINBAR'])`, `@IsOptional` | Default: SAF |
| `data` | `Record<string, unknown>` | `@IsObject` | Draft payload (content, mediaUrls, etc.) |

### Controller — `DraftsController` (L13-58)

**Class-level:**
- `@ApiTags('Drafts')` (L9)
- `@ApiBearerAuth()` (L10)
- `@UseGuards(ClerkAuthGuard)` (L11)
- `@Controller('drafts')` (L12)

#### Endpoints

| Method | Route | Auth | Throttle | Operation | Line |
|--------|-------|------|----------|-----------|------|
| `GET` | `/drafts` | ClerkAuth | default | Get all drafts (filter by space) | L17-23 |
| `GET` | `/drafts/:id` | ClerkAuth | default | Get a draft | L25-28 |
| `POST` | `/drafts` | ClerkAuth | 30/min | Save a new draft | L30-35 |
| `PATCH` | `/drafts/:id` | ClerkAuth | default | Update a draft | L37-44 |
| `DELETE` | `/drafts/:id` | ClerkAuth | default | Delete a draft | L46-49 |
| `DELETE` | `/drafts` | ClerkAuth | default | Delete all drafts | L51-54 |

### Service — `DraftsService` (L9-72)

Uses `DraftPost` Prisma model and `ContentSpace` enum.

**Methods:**

1. **`getDrafts(userId, space?)`** (L12-26)
   - Validates space against `ContentSpace` enum values
   - Orders by `updatedAt: 'desc'`, takes 50

2. **`getDraft(draftId, userId)`** (L28-33)
   - Ownership check (403)

3. **`saveDraft(userId, space='SAF', data)`** (L35-46)
   - Validates space, creates `DraftPost`
   - Stores `data` as `Prisma.InputJsonValue`

4. **`updateDraft(draftId, userId, data)`** (L48-57)
   - Ownership check, updates data

5. **`deleteDraft(draftId, userId)`** (L59-66)
   - Ownership check, deletes

6. **`deleteAllDrafts(userId)`** (L68-71)
   - `deleteMany` where userId

---

## 9. Promotions Module

**Path:** `apps/api/src/modules/promotions/`
**Files:**
- `promotions.module.ts` (11 lines)
- `promotions.controller.ts` (107 lines)
- `promotions.service.ts` (202 lines)
- `promotions.controller.spec.ts` (test)
- `promotions.service.spec.ts` (test)

**Module Setup** (`promotions.module.ts` L1-10):
- Controllers: `PromotionsController`
- Providers: `PromotionsService`
- **Exports:** `PromotionsService`

### Inline DTOs (controller L19-33)

**BoostPostDto** (L19-23):
| Field | Type | Validators |
|-------|------|-----------|
| `postId` | `string` | `@IsString`, `@MaxLength(50)` |
| `budget` | `number` | `@IsNumber`, `@Min(1)`, `@Max(10000)` |
| `duration` | `number` | `@IsNumber`, `@Min(1)`, `@Max(720)` |

**SetReminderDto** (L25-28):
| Field | Type | Validators |
|-------|------|-----------|
| `postId` | `string` | `@IsString`, `@MaxLength(50)` |
| `remindAt` | `string` | `@IsDateString` |

**MarkBrandedDto** (L30-33):
| Field | Type | Validators |
|-------|------|-----------|
| `postId` | `string` | `@IsString`, `@MaxLength(50)` |
| `partnerName` | `string` | `@IsString`, `@MaxLength(200)` |

### Controller — `PromotionsController` (L39-106)

**Class-level:**
- `@ApiTags('Promotions')` (L35)
- `@Controller('promotions')` (L36)
- `@UseGuards(ClerkAuthGuard)` (L37)

#### Endpoints

| Method | Route | Auth | Throttle | Operation | Line |
|--------|-------|------|----------|-----------|------|
| `POST` | `/promotions/boost` | ClerkAuth | 10/min | Boost a post | L42-53 |
| `GET` | `/promotions/mine` | ClerkAuth | default | Get my promotions | L55-60 |
| `POST` | `/promotions/:id/cancel` | ClerkAuth | default | Cancel promotion | L62-72 |
| `POST` | `/promotions/reminder` | ClerkAuth | default | Set a post reminder | L74-83 |
| `DELETE` | `/promotions/reminder/:postId` | ClerkAuth | default | Remove a reminder | L85-93 |
| `POST` | `/promotions/branded` | ClerkAuth | default | Mark as branded content | L95-105 |

### Service — `PromotionsService` (L25-201)

**Constants** (L20-22):
- `REACH_MULTIPLIER = 100`
- `MAX_BUDGET = 10000`
- `MAX_DURATION_DAYS = 30`

**Methods:**

1. **`boostPost(userId, data)`** (L28-81)
   - Validates budget (0.01 - 10000) and duration (1 - 30 days)
   - Verifies post ownership
   - Checks no existing active promotion on same post
   - Calculates `targetReach = budget * 100`
   - Creates `PostPromotion`: status 'active', startsAt, endsAt

2. **`getMyPromotions(userId)`** (L83-91)
   - All promotions, ordered by createdAt desc, takes 50
   - Returns: `{ data: promotions }`

3. **`cancelPromotion(id, userId)`** (L93-113)
   - Ownership check
   - Must be 'active' status
   - Sets status to 'cancelled'

4. **`setReminder(userId, postId, remindAt)`** (L115-140)
   - Validates date format and must be in the future
   - Verifies post exists
   - Upserts `PostReminder` (composite key: postId_userId)

5. **`removeReminder(userId, postId)`** (L142-155)
   - Deletes PostReminder by composite key

6. **`markBranded(userId, postId, partnerName)`** (L157-200)
   - Ownership check
   - Prepends `[Paid partnership with {name}]` to post content
   - Removes existing branded tag first (regex: `\[Paid partnership with [^\]]*\]\s*`)
   - Returns: `{ postId, partnerName, content }`

---

## 10. Watch History Module

**Path:** `apps/api/src/modules/watch-history/`
**Files:**
- `watch-history.module.ts` (10 lines)
- `watch-history.controller.ts` (105 lines)
- `watch-history.service.ts` (180 lines)
- `dto/record-watch.dto.ts` (19 lines)
- `dto/add-to-watch-later.dto.ts` (8 lines)
- `watch-history.controller.spec.ts` (test)
- `watch-history.service.spec.ts` (test)

**Module Setup** (`watch-history.module.ts` L1-10):
- Controllers: `WatchHistoryController`
- Providers: `WatchHistoryService`
- **Exports:** `WatchHistoryService`

### DTOs

**RecordWatchDto** (`dto/record-watch.dto.ts` L4-19):
| Field | Type | Validators | Description |
|-------|------|-----------|-------------|
| `videoId` | `string` | `@IsString` | Video ID |
| `progress` | `number?` | `@IsOptional`, `@IsNumber`, `@Min(0)` | Progress in seconds |
| `completed` | `boolean?` | `@IsOptional`, `@IsBoolean` | Whether video completed |

**AddToWatchLaterDto** (`dto/add-to-watch-later.dto.ts` L4-8):
| Field | Type | Validators |
|-------|------|-----------|
| `videoId` | `string` | `@IsString` |

### Controller — `WatchHistoryController` (L26-105)

**Class-level:**
- `@ApiTags('Watch History')` (L21)
- `@UseGuards(ClerkAuthGuard)` (L23)
- `@Throttle({ default: { limit: 60, ttl: 60000 } })` (L24)
- `@Controller('watch-history')` (L25)

#### Endpoints

| Method | Route | Auth | Operation | Line |
|--------|-------|------|-----------|------|
| `POST` | `/watch-history/record` | ClerkAuth | Record watch progress | L29-41 |
| `GET` | `/watch-history` | ClerkAuth | Get watch history (paginated) | L43-49 |
| `DELETE` | `/watch-history/:videoId` | ClerkAuth | Remove from history (204) | L51-60 |
| `DELETE` | `/watch-history` | ClerkAuth | Clear all history (204) | L62-67 |
| `POST` | `/watch-history/watch-later` | ClerkAuth | Add to watch later | L69-76 |
| `DELETE` | `/watch-history/watch-later/:videoId` | ClerkAuth | Remove from watch later (204) | L78-86 |
| `GET` | `/watch-history/watch-later` | ClerkAuth | Get watch later list (paginated) | L88-95 |
| `GET` | `/watch-history/watch-later/:videoId/status` | ClerkAuth | Check if in watch later | L97-104 |

### Service — `WatchHistoryService` (L11-179)

**Methods:**

1. **`recordWatch(userId, videoId, progress?, completed?)`** (L16-43)
   - Verifies video exists
   - Upserts `WatchHistory` (composite key: userId_videoId)
   - Creates with defaults (progress: 0, completed: false) or updates

2. **`getHistory(userId, cursor?, limit=20)`** (L46-88)
   - Includes video: title, thumbnailUrl, duration, viewsCount, createdAt, channel (id, handle, name, avatarUrl)
   - ID-based cursor pagination
   - Maps to flat response with progress/completed/watchedAt
   - Returns: `{ data, meta: { cursor, hasMore } }`

3. **`removeFromHistory(userId, videoId)`** (L91-96)
   - `deleteMany` by userId + videoId

4. **`clearHistory(userId)`** (L99-104)
   - `deleteMany` by userId

5. **`addToWatchLater(userId, videoId)`** (L107-121)
   - Verifies video exists
   - Upserts `WatchLater` (no-op on duplicate)

6. **`removeFromWatchLater(userId, videoId)`** (L124-129)
   - `deleteMany` by userId + videoId

7. **`getWatchLater(userId, cursor?, limit=20)`** (L132-171)
   - Includes same video fields as history
   - Composite cursor: `userId_videoId: { userId, videoId: cursor }`
   - Returns video objects directly

8. **`isInWatchLater(userId, videoId)`** (L174-179)
   - Returns: `{ inWatchLater: boolean }`

---

## 11. Subtitles Module

**Path:** `apps/api/src/modules/subtitles/`
**Files:**
- `subtitles.module.ts` (10 lines)
- `subtitles.controller.ts` (74 lines)
- `subtitles.service.ts` (137 lines)
- `subtitles.controller.spec.ts` (test)
- `subtitles.service.spec.ts` (test)

**Module Setup** (`subtitles.module.ts` L1-10):
- Controllers: `SubtitlesController`
- Providers: `SubtitlesService`
- **Exports:** `SubtitlesService`

### DTO — `CreateSubtitleTrackDto` (service file L12-16)

| Field | Type | Validators |
|-------|------|-----------|
| `label` | `string` | `@IsString`, `@MaxLength(100)` |
| `language` | `string` | `@IsString`, `@MaxLength(10)` |
| `srtUrl` | `string` | `@IsUrl` |

### Controller — `SubtitlesController` (L23-73)

**Class-level:**
- `@ApiTags('Subtitles')` (L20)
- `@Throttle({ default: { limit: 60, ttl: 60000 } })` (L21)
- `@Controller('videos/:videoId/subtitles')` — nested under videos (L22)

#### Endpoints

| Method | Route | Auth | Operation | Line |
|--------|-------|------|-----------|------|
| `GET` | `/videos/:videoId/subtitles` | OptionalClerkAuth | List subtitle tracks | L26-34 |
| `POST` | `/videos/:videoId/subtitles` | ClerkAuth | Upload subtitle track | L36-46 |
| `DELETE` | `/videos/:videoId/subtitles/:id` | ClerkAuth | Delete subtitle track | L48-59 |
| `GET` | `/videos/:videoId/subtitles/:id/srt` | OptionalClerkAuth | Get SRT file (redirect) | L61-72 |

**Note:** The SRT endpoint uses `@Redirect()` decorator — returns `{ url }` which NestJS redirects to.

### Service — `SubtitlesService` (L19-137)

**Methods:**

1. **`listTracks(videoId, userId?)`** (L22-51)
   - Verifies video exists
   - If video not PUBLISHED: only owner can view
   - Selects: id, label, language, url, isDefault, createdAt
   - Orders by isDefault desc, takes 50

2. **`createTrack(videoId, userId, dto)`** (L53-95)
   - Verifies video exists and user is owner
   - **Language validation** (L63): Must match `/^[a-z]{2,3}$/i` (ISO 639-1/639-2)
   - **Label validation** (L66-68): Max 50 chars
   - **URL validation** (L70-74): `new URL()` parse
   - Stores language lowercase
   - `isDefault: false`

3. **`deleteTrack(videoId, trackId, userId)`** (L97-115)
   - Verifies track exists, belongs to video, user is video owner

4. **`getSrtRedirect(videoId, trackId, userId?)`** (L117-136)
   - Verifies track exists, belongs to video
   - Access check: unpublished videos owner-only
   - Returns `{ url }` for redirect

---

## 12. Profile Links Module

**Path:** `apps/api/src/modules/profile-links/`
**Files:**
- `profile-links.module.ts` (10 lines)
- `profile-links.controller.ts` (75 lines)
- `profile-links.service.ts` (84 lines)
- `dto/create-profile-link.dto.ts` (15 lines)
- `dto/update-profile-link.dto.ts` (17 lines)
- `profile-links.controller.spec.ts` (test)
- `profile-links.service.spec.ts` (test)

**Module Setup** (`profile-links.module.ts` L1-10):
- Controllers: `ProfileLinksController`
- Providers: `ProfileLinksService`
- **Exports:** `ProfileLinksService`

### DTOs

**CreateProfileLinkDto** (`dto/create-profile-link.dto.ts` L4-14):
| Field | Type | Validators |
|-------|------|-----------|
| `title` | `string` | `@IsString`, `@MaxLength(50)` |
| `url` | `string` | `@IsUrl`, `@MaxLength(500)` |

**UpdateProfileLinkDto** (`dto/update-profile-link.dto.ts` L4-16):
| Field | Type | Validators |
|-------|------|-----------|
| `title` | `string?` | `@IsOptional`, `@IsString`, `@MaxLength(50)` |
| `url` | `string?` | `@IsOptional`, `@IsUrl`, `@MaxLength(500)` |

**ReorderLinksDto** (inline, controller L23-27):
| Field | Type | Validators |
|-------|------|-----------|
| `ids` | `string[]` | `@IsArray`, `@IsString({ each })` |

### Controller — `ProfileLinksController` (L34-74)

**Class-level:**
- `@ApiTags('Profile Links')` (L29)
- `@Throttle({ default: { limit: 60, ttl: 60000 } })` (L30)
- `@Controller('profile-links')` (L31)
- `@UseGuards(ClerkAuthGuard)` (L32)

#### Endpoints

| Method | Route | Auth | Operation | Line |
|--------|-------|------|-----------|------|
| `GET` | `/profile-links` | ClerkAuth | Get own links (ordered by position) | L37-40 |
| `POST` | `/profile-links` | ClerkAuth | Add a link (max 5) | L42-49 |
| `PATCH` | `/profile-links/:id` | ClerkAuth | Update link title/url | L51-59 |
| `DELETE` | `/profile-links/:id` | ClerkAuth | Remove a link | L61-67 |
| `PUT` | `/profile-links/reorder` | ClerkAuth | Reorder links (ordered array of IDs) | L69-72 |

### Service — `ProfileLinksService` (L14-83)

**Constants:** `MAX_LINKS = 5` (L12)

**Methods:**

1. **`getLinks(userId)`** (L17-23)
   - Orders by position ascending, takes 50

2. **`addLink(userId, dto)`** (L25-39)
   - Enforces max 5 links
   - Auto-assigns position (last position + 1)

3. **`updateLink(userId, id, dto)`** (L41-50)
   - Ownership check

4. **`deleteLink(userId, id)`** (L52-59)
   - Ownership check

5. **`reorder(userId, orderedIds)`** (L62-82)
   - Fetches all user links, validates all IDs belong to user
   - Uses `$transaction` to update positions atomically
   - Returns fresh list via `getLinks()`

---

## 13. Majlis Lists Module

**Path:** `apps/api/src/modules/majlis-lists/`
**Files:**
- `majlis-lists.module.ts` (10 lines)
- `majlis-lists.controller.ts` (135 lines)
- `majlis-lists.service.ts` (405 lines)
- `dto/create-list.dto.ts` (20 lines)
- `dto/update-list.dto.ts` (21 lines)
- `dto/add-member.dto.ts` (8 lines)
- `majlis-lists.controller.spec.ts` (test)
- `majlis-lists.service.spec.ts` (test)

**Module Setup** (`majlis-lists.module.ts` L1-10):
- Controllers: `MajlisListsController`
- Providers: `MajlisListsService`
- **Exports:** `MajlisListsService`

### DTOs

**CreateListDto** (`dto/create-list.dto.ts` L4-19):
| Field | Type | Validators | Default |
|-------|------|-----------|---------|
| `name` | `string` | `@IsString`, `@MaxLength(100)` | — |
| `description` | `string?` | `@IsOptional`, `@IsString`, `@MaxLength(500)` | — |
| `isPublic` | `boolean?` | `@IsOptional`, `@IsBoolean` | `true` |

**UpdateListDto** (`dto/update-list.dto.ts` L4-20):
| Field | Type | Validators |
|-------|------|-----------|
| `name` | `string?` | `@IsOptional`, `@IsString`, `@MaxLength(100)` |
| `description` | `string?` | `@IsOptional`, `@IsString`, `@MaxLength(500)` |
| `isPublic` | `boolean?` | `@IsOptional`, `@IsBoolean` |

**AddMemberDto** (`dto/add-member.dto.ts` L4-7):
| Field | Type | Validators |
|-------|------|-----------|
| `userId` | `string` | `@IsString` |

### Controller — `MajlisListsController` (L27-134)

**Class-level:**
- `@ApiTags('Majlis Lists')` (L24)
- `@Controller('majlis-lists')` (L25)
- `@Throttle({ default: { limit: 60, ttl: 60000 } })` (L26)

#### Endpoints

| Method | Route | Auth | Operation | Line |
|--------|-------|------|-----------|------|
| `GET` | `/majlis-lists` | ClerkAuth | Get user's lists (owned + subscribed) | L30-39 |
| `POST` | `/majlis-lists` | ClerkAuth | Create a new list | L41-49 |
| `GET` | `/majlis-lists/:id` | OptionalClerkAuth | Get list detail with members | L51-61 |
| `PATCH` | `/majlis-lists/:id` | ClerkAuth | Update list | L63-73 |
| `DELETE` | `/majlis-lists/:id` | ClerkAuth | Delete list (owner only, 204) | L75-85 |
| `GET` | `/majlis-lists/:id/members` | OptionalClerkAuth | Get list members (paginated) | L87-97 |
| `POST` | `/majlis-lists/:id/members` | ClerkAuth | Add member (owner only) | L99-109 |
| `DELETE` | `/majlis-lists/:id/members/:userId` | ClerkAuth | Remove member (owner only, 204) | L111-122 |
| `GET` | `/majlis-lists/:id/timeline` | OptionalClerkAuth | Get threads from list members | L124-134 |

### Service — `MajlisListsService` (L34-404)

**Shared select** (L14-31): `LIST_SELECT` — includes owner with profile fields

**Note on isPrivate/isPublic:** Database uses `isPrivate`, API exposes `isPublic` (inverted). All methods convert between these.

**Methods:**

1. **`getLists(userId, cursor?, limit=20)`** (L37-66)
   - Finds lists where user is owner OR member
   - ID-based cursor pagination
   - Maps `isPublic: !isPrivate`

2. **`createList(userId, dto)`** (L68-83)
   - Converts `isPublic` to `isPrivate` for storage
   - Sets `ownerId: userId`

3. **`getListById(userId | undefined, id)`** (L85-136)
   - Includes first 10 members
   - **Access control** (L114-126): If private, requires owner or member
   - Maps members to flat user objects with addedAt

4. **`updateList(userId, id, dto)`** (L138-168)
   - Owner-only
   - Converts isPublic to isPrivate

5. **`deleteList(userId, id)`** (L170-188)
   - Owner-only, cascading delete

6. **`getMembers(userId | undefined, listId, cursor?, limit=20)`** (L191-248)
   - Access control for private lists
   - Composite cursor: `listId_userId`
   - Returns user objects with addedAt

7. **`addMember(userId, listId, dto)`** (L250-293)
   - Owner-only
   - Verifies target user exists
   - Checks for duplicate membership (409 Conflict)
   - **Transaction**: creates member + increments `membersCount`

8. **`removeMember(userId, listId, memberUserId)`** (L295-329)
   - Owner-only
   - Checks member exists
   - **Transaction**: deletes member + decrements `membersCount`

9. **`getTimeline(userId | undefined, listId, cursor?, limit=20)`** (L331-404)
   - Access control for private lists
   - Queries threads where `userId IN memberIds`, `isChainHead: true`, `isRemoved: false`
   - Selects: content, hashtags, mentions, all count fields, isSensitive, user profile
   - ID-based cursor pagination

---

## 14. Webhooks Module

**Path:** `apps/api/src/modules/webhooks/`
**Files:**
- `webhooks.module.ts` (10 lines)
- `webhooks.controller.ts` (51 lines)
- `webhooks.service.ts` (194 lines)
- `webhooks.controller.spec.ts` (test)
- `webhooks.service.spec.ts` (test)

**Module Setup** (`webhooks.module.ts` L1-10):
- Controllers: `CommunityWebhooksController`
- Providers: `WebhooksService`
- **Exports:** `WebhooksService`

### Inline DTO (controller L9-14)

**CreateWebhookBodyDto** (L9-14):
| Field | Type | Validators |
|-------|------|-----------|
| `circleId` | `string` | `@IsString`, `@MaxLength(50)` |
| `name` | `string` | `@IsString`, `@MaxLength(100)` |
| `url` | `string` | `@IsUrl` |
| `events` | `string[]` | `@IsArray`, `@IsString({ each })`, `@ArrayMaxSize(20)`, `@MaxLength(50, { each })` |

### Controller — `CommunityWebhooksController` (L21-50)

**Class-level:**
- `@ApiTags('Community Webhooks')` (L16)
- `@Throttle({ default: { limit: 20, ttl: 60000 } })` — 20 req/min (L17)
- `@Controller('community-webhooks')` (L18)
- `@UseGuards(ClerkAuthGuard)` (L19)

#### Endpoints

| Method | Route | Auth | Operation | Line |
|--------|-------|------|-----------|------|
| `POST` | `/community-webhooks` | ClerkAuth | Create webhook for community | L24-31 |
| `GET` | `/community-webhooks?circleId=` | ClerkAuth | List webhooks (requires membership) | L33-37 |
| `DELETE` | `/community-webhooks/:id` | ClerkAuth | Delete a webhook | L39-42 |
| `POST` | `/community-webhooks/:id/test` | ClerkAuth | Test webhook delivery | L44-48 |

### Service — `WebhooksService` (L8-193)

**Exported type** (L5):
```typescript
type WebhookEvent = 'post.created' | 'member.joined' | 'member.left' | 'message.sent' | 'live.started' | 'live.ended';
```

**Valid events** (L31): `['post.created', 'member.joined', 'member.left', 'message.sent', 'live.started', 'live.ended']`

**Private methods:**

1. **`validateWebhookUrl(url)`** (L16-29)
   - HTTPS only
   - Blocks: localhost, 127.0.0.1, 169.254.*, 10.*, 192.168.*, 172.16.*, ::1, 0.0.0.0
   - SSRF protection

2. **`requireCircleAdmin(circleId, userId)`** (L36-44)
   - Checks `CircleMember` role is OWNER or ADMIN

3. **`requireCircleMember(circleId, userId)`** (L49-57)
   - Checks `CircleMember` exists

**Public methods:**

4. **`create(userId, data)`** (L59-80)
   - Requires circle admin
   - Validates URL (SSRF check)
   - Filters events against valid list
   - Generates secret: `randomBytes(32).toString('hex')`
   - Creates `Webhook` record

5. **`list(circleId, userId?)`** (L82-93)
   - Requires circle membership
   - Returns active webhooks: id, name, url, events, isActive, lastUsedAt, createdAt
   - **Note:** Secret is NOT returned in list

6. **`delete(webhookId, userId)`** (L95-100)
   - Creator-only (not circle admin — uses `createdById`)

7. **`test(webhookId, userId)`** (L102-114)
   - Creator-only
   - Sends test payload: `{ event: 'test', data: { message: 'Webhook test from Mizanly' }, timestamp }`
   - Validates secret exists before delivery

8. **`deliver(url, secret, payload)`** (L121-160)
   - **SSRF validation** on every delivery
   - Rejects empty secret (would be forgeable HMAC)
   - **HMAC-SHA256 signature**: `sha256=HMAC(secret, "{timestamp}.{body}")`
   - Headers: `X-Mizanly-Signature`, `X-Mizanly-Timestamp`, `X-Mizanly-Event`
   - 10s timeout per attempt
   - **Retry**: 3 attempts with exponential backoff (1s, 2s, 4s)
   - Returns: `{ success, statusCode? }`

9. **`dispatch(circleId, event, data)`** (L165-192)
   - Finds all active webhooks for circle with non-null URL
   - Filters by subscribed events
   - Filters out webhooks without secrets
   - Delivers in parallel via `Promise.allSettled`
   - Updates `lastUsedAt` on successful delivery
   - Returns: `{ dispatched, results[] }`

---

## Cross-Module Summary

### Total Endpoints: 62

| Module | Endpoints | Auth Required | Admin Only |
|--------|-----------|---------------|------------|
| Admin | 9 | All | All |
| Health | 5 | 2 admin, 1 optional, 2 none | 2 |
| Legal | 2 | None | — |
| OG | 8 | None | — |
| Scheduling | 5 | 4 ClerkAuth, 1 none | — |
| Retention | 1 | ClerkAuth | — |
| Creator | 8 | All ClerkAuth | — |
| Thumbnails | 5 | 4 ClerkAuth, 1 optional | — |
| Drafts | 6 | All ClerkAuth | — |
| Promotions | 6 | All ClerkAuth | — |
| Watch History | 8 | All ClerkAuth | — |
| Subtitles | 4 | 2 ClerkAuth, 2 optional | — |
| Profile Links | 5 | All ClerkAuth | — |
| Majlis Lists | 9 | 5 ClerkAuth, 4 optional | — |
| Webhooks | 4 | All ClerkAuth | — |

### Prisma Models Used

| Module | Models |
|--------|--------|
| Admin | User, Report, Post, Comment, Message, Notification, ModerationLog |
| Health | User, Post, Thread, Reel (counts) |
| OG | Post, Reel, User, Thread |
| Scheduling | Post, Thread, Reel, Video |
| Retention | Reel, UserStreak, User, Post, Follow, MembershipSubscription |
| Creator | User, Post, Reel, Tip, Follow, MembershipTier, MembershipSubscription, ViewerDemographic |
| Thumbnails | ThumbnailVariant, Post, Reel, Video |
| Drafts | DraftPost |
| Promotions | Post, PostPromotion, PostReminder |
| Watch History | Video, WatchHistory, WatchLater, Channel |
| Subtitles | Video, SubtitleTrack |
| Profile Links | ProfileLink |
| Majlis Lists | MajlisList, MajlisListMember, Thread, User |
| Webhooks | Webhook, CircleMember |

### External Dependencies

| Module | External Services |
|--------|-------------------|
| Admin | Clerk Backend SDK (`createClerkClient`) — ban/unban session revocation |
| Health | Redis (PING), Cloudflare R2 (HEAD), Cloudflare Stream (API check) |
| OG | External URL fetch (unfurl with SSRF protection) |
| Creator | Anthropic API (Claude Haiku 4.5 for AI analytics chat) |
| Webhooks | External HTTP delivery (HMAC-signed, 3x retry) |
| Retention | Redis (milestone dedup, session tracking, notification caps) |

### Cron Jobs

| Module | Schedule | Method | Purpose |
|--------|----------|--------|---------|
| Scheduling | Every minute | `publishOverdueContent()` | Auto-publish scheduled content past due |

### Rate Limits (Custom)

| Module | Route | Limit |
|--------|-------|-------|
| Admin | All | 30/min |
| Health | /metrics | 10/min |
| OG | /unfurl | 30/min |
| OG | /sitemap.xml | 10/min |
| Creator | /ask | 20/hour |
| Thumbnails | /impression, /click | 100/min |
| Promotions | /boost | 10/min |
| Webhooks | All | 20/min |
| Drafts | POST /drafts | 30/min |
