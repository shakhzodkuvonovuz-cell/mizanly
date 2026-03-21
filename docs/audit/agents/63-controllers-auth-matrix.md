# Agent #63: Backend Controllers — Authorization Matrix Audit

**Scope:** All 82 controller files in `apps/api/src/modules/**/*.controller.ts`
**Focus:** Authentication guards, IDOR vulnerabilities, admin authorization, missing auth on sensitive endpoints

---

## Summary Statistics

- **Total controllers audited:** 82
- **Total endpoints audited:** ~620
- **CRITICAL (P0) findings:** 12
- **HIGH (P1) findings:** 18
- **MEDIUM (P2) findings:** 24
- **LOW (P3) findings:** 15
- **Total findings:** 69

---

## CRITICAL (P0) — Account Takeover / Privilege Escalation

### Finding 1: 2FA `validate` endpoint UNAUTHENTICATED — any user can brute-force any userId
- **File:** `apps/api/src/modules/two-factor/two-factor.controller.ts`
- **Lines:** 108-115
- **Code:**
```ts
@Post('validate')
@Throttle({ default: { limit: 5, ttl: 60000 } })
@ApiOperation({ summary: 'Validate TOTP code during login' })
async validate(@Body() dto: ValidateDto) {
    const valid = await this.twoFactorService.validate(dto.userId, dto.code);
    return { valid };
}
```
- **Issue:** No `@UseGuards(ClerkAuthGuard)`. The `ValidateDto` accepts a `userId` from the request body. Any attacker can supply ANY user's ID and attempt to validate TOTP codes. The throttle of 5 req/min is per-IP, not per-userId, so distributed attacks can brute-force the 6-digit code (1M combinations) at scale.
- **Impact:** Account takeover for any user with 2FA enabled.
- **Fix:** Either: (a) require ClerkAuthGuard and use `@CurrentUser('id')` instead of body userId, or (b) implement per-userId rate limiting.

### Finding 2: 2FA `backup` endpoint UNAUTHENTICATED — any user can brute-force backup codes
- **File:** `apps/api/src/modules/two-factor/two-factor.controller.ts`
- **Lines:** 142-153
- **Code:**
```ts
@Post('backup')
@Throttle({ default: { limit: 5, ttl: 60000 } })
@ApiOperation({ summary: 'Use a backup code for authentication' })
async backup(@Body() dto: BackupDto) {
    const valid = await this.twoFactorService.useBackupCode(dto.userId, dto.backupCode);
```
- **Issue:** No `@UseGuards(ClerkAuthGuard)`. The `BackupDto` accepts arbitrary `userId` from body. An attacker can try backup codes for any user. Backup codes are 10-char alphanumeric = large keyspace, but there are typically 10 codes generated, and the throttle is per-IP not per-userId.
- **Impact:** Account takeover if attacker finds a valid backup code.
- **Fix:** Require auth or use a temporary session token from the initial login step.

### Finding 3: Admin controller has NO admin role check — any authenticated user is "admin"
- **File:** `apps/api/src/modules/admin/admin.controller.ts`
- **Lines:** 23-109
- **Code:**
```ts
@Controller('admin')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class AdminController {
```
- **Issue:** The controller uses `ClerkAuthGuard` (any authenticated user), but there is NO role check. The `adminId` parameter is extracted via `@CurrentUser('id')`, but the service methods that receive it may or may not verify admin status. Any authenticated user can access: report management, platform stats, ban/unban users, feature flags (get/set/delete).
- **Impact:** Any authenticated user can ban other users, modify feature flags, view all reports, see platform statistics.
- **Specific endpoints affected:**
  - `GET /admin/reports` — view all user reports
  - `PATCH /admin/reports/:id` — resolve reports
  - `GET /admin/stats` — platform-wide stats
  - `POST /admin/users/:id/ban` — ban any user
  - `POST /admin/users/:id/unban` — unban any user
  - `GET /admin/flags` — view all feature flags
  - `PATCH /admin/flags/:name` — SET feature flags (can enable/disable features for entire platform)
  - `DELETE /admin/flags/:name` — delete feature flags

### Finding 4: Feed admin feature post endpoint — no admin check
- **File:** `apps/api/src/modules/feed/feed.controller.ts`
- **Lines:** 163-171
- **Code:**
```ts
@UseGuards(ClerkAuthGuard)
@Put('admin/posts/:id/feature')
@ApiOperation({ summary: 'Feature or unfeature a post (admin)' })
async featurePost(
    @Param('id') postId: string,
    @Body() body: { featured: boolean },
) {
    return this.feed.featurePost(postId, body.featured);
}
```
- **Issue:** Despite being under `admin/` path and having "(admin)" in the summary, there is no admin role verification. Any authenticated user can feature/unfeature any post.
- **Impact:** Manipulation of featured content feed by any user.

### Finding 5: Embeddings backfill — no admin check, comment even says it should be restricted
- **File:** `apps/api/src/modules/embeddings/embeddings.controller.ts`
- **Lines:** 15-22
- **Code:**
```ts
@Post('backfill')
@ApiOperation({ summary: 'Trigger embedding backfill for all content (admin)' })
async backfill() {
    // In production, this should be restricted to admin users
    const result = await this.pipeline.backfillAll();
    return { data: result, success: true };
}
```
- **Issue:** The code literally has a comment saying "this should be restricted to admin users" but no admin check exists. Any authenticated user can trigger a full embedding backfill of all content.
- **Impact:** DoS vector — triggering expensive embedding operations for entire database.

### Finding 6: Reports controller — admin endpoints with no admin role check
- **File:** `apps/api/src/modules/reports/reports.controller.ts`
- **Lines:** 40-73
- **Code:**
```ts
@Get('pending')
@ApiOperation({ summary: 'Get pending reports (admin/moderator only)' })
getPending(@CurrentUser('id') adminId: string, @Query('cursor') cursor?: string) {
    return this.service.getPending(adminId, cursor);
}
@Get('stats')
@ApiOperation({ summary: 'Get report stats (admin/moderator only)' })
getStats(@CurrentUser('id') adminId: string) {
    return this.service.getStats(adminId);
}
@Patch(':id/resolve')
@ApiOperation({ summary: 'Resolve a report (admin/moderator only)' })
resolve(...)
@Patch(':id/dismiss')
@ApiOperation({ summary: 'Dismiss a report (admin/moderator only)' })
dismiss(...)
```
- **Issue:** Controller has `@UseGuards(ClerkAuthGuard)` at class level. The descriptions say "(admin/moderator only)" but the controller does NOT enforce this — it relies entirely on the service layer to check admin status. If the service doesn't check, any user can resolve/dismiss reports.
- **Impact:** Any user could dismiss reports against themselves or resolve reports.

### Finding 7: Moderation controller — admin endpoints mixed with user endpoints, no admin guard
- **File:** `apps/api/src/modules/moderation/moderation.controller.ts`
- **Lines:** 45-68
- **Code:**
```ts
@Get('queue')
@ApiOperation({ summary: 'Get pending moderation queue (admin only)' })
getQueue(@CurrentUser('id') adminId: string, ...) { ... }

@Patch('review/:id')
@ApiOperation({ summary: 'Review flagged content (admin only)' })
review(@CurrentUser('id') adminId: string, ...) { ... }

@Get('stats')
@ApiOperation({ summary: 'Moderation stats (admin only)' })
getStats(@CurrentUser('id') adminId: string) { ... }
```
- **Issue:** Controller-level `@UseGuards(ClerkAuthGuard)` applies to ALL endpoints, including admin-only ones. There's no separate admin guard. Any authenticated user can view the moderation queue, review flagged content, and see moderation stats.
- **Impact:** Non-admin users can approve/dismiss flagged content and see all reported items.

### Finding 8: Stickers `deletePack` — no ownership check at controller level
- **File:** `apps/api/src/modules/stickers/stickers.controller.ts`
- **Lines:** 66-73
- **Code:**
```ts
@Delete('packs/:id')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Delete pack (admin)' })
async deletePack(@Param('id') id: string) {
    return this.stickers.deletePack(id);
}
```
- **Issue:** The endpoint is described as "(admin)" but: (a) no admin guard, (b) no `@CurrentUser('id')` parameter extracted at all — the userId is never passed to the service. Any authenticated user can delete any sticker pack.
- **Impact:** Any user can delete any sticker pack.

### Finding 9: Stickers `createPack` — no userId passed to service
- **File:** `apps/api/src/modules/stickers/stickers.controller.ts`
- **Lines:** 31-35
- **Code:**
```ts
@Post('packs')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
@ApiOperation({ summary: 'Create sticker pack' })
async createPack(@Body() dto: CreateStickerPackDto) {
    return this.stickers.createPack(dto);
}
```
- **Issue:** Despite requiring auth, `@CurrentUser('id')` is never extracted, so the created pack won't be associated with a user/owner. This means no ownership can be verified for subsequent operations.

### Finding 10: Parental controls `getRestrictions` — no parent ownership check
- **File:** `apps/api/src/modules/parental-controls/parental-controls.controller.ts`
- **Lines:** 102-106
- **Code:**
```ts
@Get(':childId/restrictions')
@ApiOperation({ summary: 'Get restrictions for a child' })
getRestrictions(@Param('childId') childId: string) {
    return this.parentalControlsService.getRestrictions(childId);
}
```
- **Issue:** While the controller has `@UseGuards(ClerkAuthGuard)` at class level, this endpoint does NOT use `@CurrentUser('id')`. Any authenticated user can query the restrictions of any child account by ID. Compare with `getActivityDigest` which correctly passes `parentUserId`.
- **Impact:** IDOR — any authenticated user can view parental control restrictions of any child.

### Finding 11: Health `metrics` endpoint exposes platform data without authentication
- **File:** `apps/api/src/modules/health/health.controller.ts`
- **Lines:** 83-104
- **Code:**
```ts
@Get('metrics')
@ApiOperation({ summary: 'API metrics (counts, system health, job stats)' })
async metrics() {
    // Returns: user count, post count, thread count, reel count, job stats, queue stats, memory usage
}
```
- **Issue:** No auth guard at all. Exposes exact user counts, post counts, memory usage, job queue stats, and system uptime to anyone.
- **Impact:** Information disclosure — competitors or attackers can track exact platform growth, identify low-traffic periods for attacks.

### Finding 12: Health `check` endpoint exposes service topology without authentication
- **File:** `apps/api/src/modules/health/health.controller.ts`
- **Lines:** 24-57
- **Code:**
```ts
@Get()
@ApiOperation({ summary: 'Health check dashboard — DB, Redis, R2, Stream status' })
async check() {
    // Returns: database status, redis status, storage status, stream status
}
```
- **Issue:** No auth. Exposes which infrastructure services (DB, Redis, R2, Cloudflare Stream) are up or down. Useful for attackers to understand architecture and find weak points.

---

## HIGH (P1) — IDOR / Authorization Bypass

### Finding 13: Users `getFollowers`/`getFollowing` — no auth required, may expose private account data
- **File:** `apps/api/src/modules/users/users.controller.ts`
- **Lines:** 287-303
- **Code:**
```ts
@Get(':username/followers')
@ApiOperation({ summary: 'Followers list' })
getFollowers(@Param('username') username: string, ...) { ... }

@Get(':username/following')
@ApiOperation({ summary: 'Following list' })
getFollowing(@Param('username') username: string, ...) { ... }
```
- **Issue:** No `@UseGuards` at all — completely public. For private accounts, followers/following lists should be restricted. Compare with `:username/posts` and `:username/threads` which use `OptionalClerkAuthGuard`.
- **Impact:** Private account follower/following lists exposed to unauthenticated users.

### Finding 14: Follows `getFollowers`/`getFollowing` — exposes any user's social graph
- **File:** `apps/api/src/modules/follows/follows.controller.ts`
- **Lines:** 89-105
- **Code:**
```ts
@Get(':userId/followers')
@ApiOperation({ summary: 'Followers list (cursor paginated)' })
getFollowers(@Param('userId') userId: string, ...) { ... }

@Get(':userId/following')
@ApiOperation({ summary: 'Following list (cursor paginated)' })
getFollowing(@Param('userId') userId: string, ...) { ... }
```
- **Issue:** While the controller has `@UseGuards(ClerkAuthGuard)` at class level, it doesn't use `@CurrentUser('id')` to check if the requester has permission to view a private user's social graph. Any authenticated user can enumerate any user's followers/following by ID.
- **Impact:** Social graph enumeration for private accounts.

### Finding 15: Payments DTOs use inline classes with NO validation decorators
- **File:** `apps/api/src/modules/payments/payments.controller.ts`
- **Lines:** 21-34
- **Code:**
```ts
class CreatePaymentIntentDto {
    amount: number;
    currency: string;
    receiverId: string;
}
class CreateSubscriptionDto {
    tierId: string;
    paymentMethodId: string;
}
class AttachPaymentMethodDto {
    paymentMethodId: string;
}
```
- **Issue:** No `@IsNumber()`, `@IsString()`, `@Min()`, `@Max()` decorators. These are financial endpoints. Without validation: (a) negative amounts could be submitted, (b) arbitrary strings for currency, (c) no max amount limit. The NestJS validation pipe won't strip or validate these fields.
- **Impact:** Potential for negative-amount payments, invalid currency codes, or extremely large payment intents.

### Finding 16: Gifts DTOs use inline classes with NO validation decorators
- **File:** `apps/api/src/modules/gifts/gifts.controller.ts`
- **Lines:** 17-31
- **Code:**
```ts
class PurchaseCoinsDto { amount: number; }
class SendGiftDto { receiverId: string; giftType: string; ... }
class CashoutDto { diamonds: number; }
```
- **Issue:** No validation decorators on financial DTOs. `amount` and `diamonds` have no `@IsNumber()`, `@Min(1)`, or `@Max()` constraints.
- **Impact:** Could send negative amounts, zero amounts, or extremely large values.

### Finding 17: Monetization DTOs use inline classes with NO validation decorators
- **File:** `apps/api/src/modules/monetization/monetization.controller.ts`
- **Lines:** 20-39
- **Code:**
```ts
class CreateTipDto { receiverId: string; amount: number; message?: string; }
class CreateTierDto { name: string; price: number; benefits: string[]; level?: string; }
```
- **Issue:** No validation decorators. `amount` and `price` have no constraints.
- **Impact:** Negative tip amounts, zero-price tiers, or very large values.

### Finding 18: Promotion DTOs use inline classes with NO validation decorators
- **File:** `apps/api/src/modules/promotions/promotions.controller.ts`
- **Lines:** 18-33
- **Code:**
```ts
class BoostPostDto { postId: string; budget: number; duration: number; }
class SetReminderDto { postId: string; remindAt: string; }
class MarkBrandedDto { postId: string; partnerName: string; }
```
- **Issue:** No validation. Budget and duration have no constraints.

### Finding 19: Webhooks `list` endpoint — no ownership check
- **File:** `apps/api/src/modules/webhooks/webhooks.controller.ts`
- **Lines:** 25-29
- **Code:**
```ts
@Get()
@ApiOperation({ summary: 'List webhooks for a community' })
async list(@Query('circleId') circleId: string) {
    return this.webhooks.list(circleId);
}
```
- **Issue:** While authenticated, there's no `@CurrentUser('id')` check. Any authenticated user can list webhooks for any community by providing a circleId. Webhook entries may contain URLs and secrets.
- **Impact:** Information disclosure — webhook URLs and configuration for any community.

### Finding 20: Discord webhooks `getWebhooks` — no membership/ownership check
- **File:** `apps/api/src/modules/discord-features/discord-features.controller.ts`
- **Lines:** 85-89
- **Code:**
```ts
@Get('circles/:circleId/webhooks')
@UseGuards(ClerkAuthGuard)
@ApiOperation({ summary: 'Get webhooks for community' })
getWebhooks(@Param('circleId') circleId: string) {
    return this.service.getWebhooks(circleId);
}
```
- **Issue:** No `@CurrentUser('id')` passed. Any authenticated user can list webhooks for any community.

### Finding 21: Discord webhook `executeWebhook` — unauthenticated, only token-based
- **File:** `apps/api/src/modules/discord-features/discord-features.controller.ts`
- **Lines:** 99-104
- **Code:**
```ts
@Post('webhooks/:token/execute')
@Throttle({ default: { limit: 30, ttl: 60000 } })
@ApiOperation({ summary: 'Execute webhook (external)' })
executeWebhook(@Param('token') token: string, @Body() dto: ExecuteWebhookDto) {
    return this.service.executeWebhook(token, dto);
}
```
- **Issue:** No auth guard at all. This is intentional for external webhook execution, but the rate limit of 30/min per IP may be insufficient if webhook tokens leak.
- **Note:** This is by design for external integrations, but the token becomes a bearer credential. If tokens are predictable or leaked, anyone can post to any community.

### Finding 22: Telegram features `getTopics` — no membership check
- **File:** `apps/api/src/modules/telegram-features/telegram-features.controller.ts`
- **Lines:** 112-116
- **Code:**
```ts
@Get('conversations/:id/topics')
@ApiOperation({ summary: 'Get group topics' })
getTopics(@Param('id') conversationId: string) {
    return this.service.getTopics(conversationId);
}
```
- **Issue:** No `@CurrentUser('id')` passed. Any authenticated user can list topics for any conversation by ID, even if they're not a member.

### Finding 23: Checklists `getByConversation` — no membership check
- **File:** `apps/api/src/modules/checklists/checklists.controller.ts`
- **Lines:** 32-36
- **Code:**
```ts
@Get('conversation/:conversationId')
@ApiOperation({ summary: 'Get all checklists for a conversation' })
async getByConversation(@Param('conversationId') conversationId: string) {
    return this.checklistsService.getByConversation(conversationId);
}
```
- **Issue:** No `@CurrentUser('id')` passed. Any authenticated user can view checklists in any conversation.

### Finding 24: Broadcast `subscribers` — any authenticated user can list subscribers of any channel
- **File:** `apps/api/src/modules/broadcast/broadcast.controller.ts`
- **Lines:** 114-119
- **Code:**
```ts
@Get(':id/subscribers')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
@ApiOperation({ summary: 'List subscribers' })
async subscribers(@Param('id') id: string, @Query('cursor') cursor?: string) {
    return this.broadcast.getSubscribers(id, cursor);
}
```
- **Issue:** No `@CurrentUser('id')` check. Any authenticated user can enumerate the subscriber list of any broadcast channel.
- **Impact:** Privacy violation — subscriber lists should be restricted to channel owner/admins.

### Finding 25: Search controller — multiple endpoints completely unauthenticated
- **File:** `apps/api/src/modules/search/search.controller.ts`
- **Lines:** 16-92
- **Issue:** The controller has NO class-level guard. Most endpoints have no guard at all:
  - `GET /search` — unauthenticated full search
  - `GET /search/trending` — unauthenticated
  - `GET /search/hashtag/:tag` — unauthenticated
  - `GET /search/threads` — unauthenticated
  - `GET /search/reels` — unauthenticated
  - `GET /search/explore` — unauthenticated
  - `GET /search/suggestions` — unauthenticated
- **Note:** Search being public is arguably fine for a social platform, but `suggestions` (autocomplete) may leak private account usernames to scrapers.

### Finding 26: Thumbnails `createVariants` — no userId passed
- **File:** `apps/api/src/modules/thumbnails/thumbnails.controller.ts`
- **Lines:** 32-43
- **Code:**
```ts
@Post('variants')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
@ApiOperation({ summary: 'Upload thumbnail variants for A/B testing (2-3 variants)' })
async createVariants(@Body() dto: CreateVariantsDto) {
    return this.thumbnails.createVariants(
        dto.contentType as 'post' | 'reel' | 'video',
        dto.contentId,
        dto.thumbnailUrls,
    );
}
```
- **Issue:** `@CurrentUser('id')` not extracted. The service doesn't know who's creating variants. Any authenticated user can set A/B test thumbnails on any content.
- **Impact:** Manipulation of other users' content appearance.

### Finding 27: Thumbnails `getVariants` — no ownership check
- **File:** `apps/api/src/modules/thumbnails/thumbnails.controller.ts`
- **Lines:** 44-53
- **Code:**
```ts
@Get('variants/:contentType/:contentId')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
@ApiOperation({ summary: 'Get variants with stats (creator analytics)' })
async getVariants(...) { ... }
```
- **Issue:** No `@CurrentUser('id')` — any authenticated user can view A/B test analytics for any content.

### Finding 28: Thumbnails `trackImpression`/`trackClick` — OptionalClerkAuthGuard means unauthenticated tracking
- **File:** `apps/api/src/modules/thumbnails/thumbnails.controller.ts`
- **Lines:** 66-80
- **Issue:** These use `OptionalClerkAuthGuard` with no userId check. An attacker can send arbitrary impression/click events to manipulate A/B test results and force a specific thumbnail to "win."

### Finding 29: Live `listGuests` — no auth scoping
- **File:** `apps/api/src/modules/live/live.controller.ts`
- **Lines:** 159-165
- **Code:**
```ts
@Get(':id/guests')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
@ApiOperation({ summary: 'List guests in live session' })
async listGuests(@Param('id') id: string) {
    return this.live.listGuests(id);
}
```
- **Issue:** No `@CurrentUser('id')` — any authenticated user can list guests of any live session. Minor privacy issue.

### Finding 30: Stories `getById` — completely unauthenticated
- **File:** `apps/api/src/modules/stories/stories.controller.ts`
- **Lines:** 59-63
- **Code:**
```ts
@Get(':id')
@ApiOperation({ summary: 'Get story by ID' })
getById(@Param('id') id: string) {
    return this.storiesService.getById(id);
}
```
- **Issue:** No auth guard at all. Any unauthenticated user can access any story by ID, including stories from private accounts or subscriber-only stories.
- **Impact:** Privacy violation — stories from private accounts accessible via direct ID.

---

## MEDIUM (P2) — Missing Auth Scoping / Potential IDOR

### Finding 31: Stories `getHighlights` — no privacy check on userId param
- **File:** `apps/api/src/modules/stories/stories.controller.ts`
- **Lines:** 45-49
- **Code:**
```ts
@Get('highlights/:userId')
@ApiOperation({ summary: "Get user's highlight albums" })
getHighlights(@Param('userId') userId: string) { ... }
```
- **Issue:** No auth guard, no privacy check. Highlights from private accounts accessible by anyone.

### Finding 32: Users `updateNasheedMode` — uses inline type instead of validated DTO
- **File:** `apps/api/src/modules/users/users.controller.ts`
- **Lines:** 243-252
- **Code:**
```ts
@Body() body: { nasheedMode: boolean },
```
- **Issue:** Inline body type bypasses validation pipe. No `@IsBoolean()` decorator.

### Finding 33: Messages `sendViewOnceMessage` — uses inline type instead of validated DTO
- **File:** `apps/api/src/modules/messages/messages.controller.ts`
- **Lines:** 469-477
- **Code:**
```ts
@Body() body: { mediaUrl: string; mediaType?: string; messageType?: string; content?: string },
```
- **Issue:** No validation decorators. `mediaUrl` not validated as URL.

### Finding 34: Feed `featurePost` — no `@CurrentUser('id')` extracted
- **File:** `apps/api/src/modules/feed/feed.controller.ts`
- **Lines:** 163-171
- **Issue:** The `featurePost` method doesn't extract userId at all, so there's no audit trail of who featured a post.

### Finding 35: Multiple messages endpoints use inline body types without validation
- **File:** `apps/api/src/modules/messages/messages.controller.ts`
- **Lines:** Various
- **Instances:**
  - Line 321: `@Body('code') code: string | null` — lock code has no length/format validation
  - Line 332: `@Body('code') code: string` — verify lock code has no validation
  - Line 344: `@Body('count') count: number` — history count has no min/max
  - Line 354: `@Body('tag') tag: string | null` — tag has no max length
  - Line 474: inline body for view-once message
  - Line 524: `@Body() body: { wallpaperUrl: string | null }` — no URL validation
  - Line 534: `@Body() body: { tone: string | null }` — no max length

### Finding 36: Feed `trackSessionSignal` — inline body type without validation
- **File:** `apps/api/src/modules/feed/feed.controller.ts`
- **Lines:** 110-116
- **Code:**
```ts
@Body() body: { contentId: string; action: 'view' | 'like' | 'save' | 'share' | 'skip'; hashtags?: string[]; scrollPosition?: number },
```
- **Issue:** Inline type bypasses DTO validation. No `@IsString()`, `@IsEnum()`, etc.

### Finding 37: Live controller — multiple inline body types without validation
- **File:** `apps/api/src/modules/live/live.controller.ts`
- **Lines:** Various
- **Instances:**
  - Line 129: `@Body('recordingUrl') url: string` — no URL validation
  - Line 139: `@Body('guestUserId') guestUserId: string` — no validation
  - Line 173: `@Body() body: { title: string; description?: string; thumbnailUrl?: string }` — inline, no validation
  - Line 202: `@Body() body: { subscribersOnly: boolean }` — inline

### Finding 38: Reel templates `create` — uses `interface` instead of class DTO
- **File:** `apps/api/src/modules/reel-templates/reel-templates.controller.ts`
- **Lines:** 20-24
- **Code:**
```ts
interface CreateReelTemplateBody {
    sourceReelId: string;
    segments: { startMs: number; endMs: number; text?: string }[];
    name: string;
}
```
- **Issue:** TypeScript interfaces are erased at runtime — NestJS validation pipe cannot validate interfaces. All fields pass through completely unchecked.

### Finding 39: Story chains `createChain` and `joinChain` — inline body types
- **File:** `apps/api/src/modules/story-chains/story-chains.controller.ts`
- **Lines:** 27-29, 55-59
- **Issue:** `@Body() body: { prompt: string; coverUrl?: string }` and `@Body() body: { storyId: string }` — inline types, no validation.

### Finding 40: Gamification controller — `updateProgress` method name collision
- **File:** `apps/api/src/modules/gamification/gamification.controller.ts`
- **Lines:** 100-104 and 166-174
- **Issue:** Two methods named `updateProgress` exist in the same controller — one for challenge progress (line 100) and one for series progress (line 166). This is a TypeScript compilation issue that may cause the second to shadow the first.

### Finding 41: Community controller routes have no prefix — overlap risk
- **File:** `apps/api/src/modules/community/community.controller.ts`
- **Lines:** 18-19
- **Code:**
```ts
@Controller()
export class CommunityController {
```
- **Issue:** Empty `@Controller()` path. Routes like `POST /boards`, `POST /mentorship/request`, `POST /events`, etc. are at the root level. This could conflict with other controllers.

### Finding 42: Commerce controller routes have no prefix — overlap risk
- **File:** `apps/api/src/modules/commerce/commerce.controller.ts`
- **Lines:** 18-19
- **Code:**
```ts
@Controller()
export class CommerceController {
```
- **Issue:** Empty path prefix. Routes like `POST /products`, `GET /orders/me`, `POST /treasury`, etc. at root.

### Finding 43: Discord features controller routes have no prefix — overlap risk
- **File:** `apps/api/src/modules/discord-features/discord-features.controller.ts`
- **Lines:** 17-18
- **Code:**
```ts
@Controller()
export class DiscordFeaturesController {
```
- **Issue:** Empty path prefix. Routes at root level.

### Finding 44: Gamification controller routes have no prefix
- **File:** `apps/api/src/modules/gamification/gamification.controller.ts`
- **Lines:** 19-20
- **Code:**
```ts
@Controller()
export class GamificationController {
```

### Finding 45: Community events overlap — two `events` controllers
- **File:** `apps/api/src/modules/community/community.controller.ts` lines 119-132 AND `apps/api/src/modules/events/events.controller.ts`
- **Issue:** Both register routes under `/events`. The community controller has `POST /events` and `GET /events`, while the events controller has `POST /api/v1/events` and `GET /api/v1/events`. Different prefixes may prevent collision, but confusion is likely.

### Finding 46: Webhook controller path collision with Clerk webhook controller
- **File:** `apps/api/src/modules/webhooks/webhooks.controller.ts` (line 10: `@Controller('webhooks')`) AND `apps/api/src/modules/auth/webhooks.controller.ts` (line 23: `@Controller('webhooks')`)
- **Issue:** Both use `@Controller('webhooks')`. The Clerk webhook handler is at `POST /webhooks/clerk`. The general webhooks controller has `POST /webhooks`, `GET /webhooks`, `DELETE /webhooks/:id`. Potential route conflicts.

### Finding 47: Bookmarks controller has double prefix
- **File:** `apps/api/src/modules/bookmarks/bookmarks.controller.ts`
- **Line:** 25
- **Code:**
```ts
@Controller('api/v1/bookmarks')
```
- **Issue:** If the global prefix is already `api/v1`, this results in `/api/v1/api/v1/bookmarks`. If no global prefix, the explicit `api/v1/` works but is inconsistent with other controllers.

### Finding 48: Reports, Downloads, Events, Embeddings, Retention controllers all have double prefix
- **Files:**
  - `reports/reports.controller.ts` line 23: `@Controller('api/v1/reports')`
  - `downloads/downloads.controller.ts` line 25: `@Controller('api/v1/downloads')`
  - `events/events.controller.ts` line 157: `@Controller('api/v1/events')`
  - `embeddings/embeddings.controller.ts` line 8: `@Controller('api/v1/embeddings')`
  - `retention/retention.controller.ts` line 9: `@Controller('api/v1/retention')`
- **Issue:** Same double-prefix problem as bookmarks. These controllers are unreachable if a global `api/v1` prefix exists, or reach a different path than expected.

### Finding 49: Retention `trackSession` — inline body without validation
- **File:** `apps/api/src/modules/retention/retention.controller.ts`
- **Lines:** 20-27
- **Code:**
```ts
@Body() body: {
    scrollDepth: number;
    timeSpentMs: number;
    interactionCount: number;
    space: string;
},
```
- **Issue:** No validation. `scrollDepth`, `timeSpentMs`, `interactionCount` could be negative or extremely large.

### Finding 50: Creator `askAI` — inline body without validation
- **File:** `apps/api/src/modules/creator/creator.controller.ts`
- **Lines:** 82-88
- **Code:**
```ts
@Body() body: { question: string },
```
- **Issue:** No `@IsString()`, `@MaxLength()`. Unbounded input sent to AI.

### Finding 51: Scholar Q&A `startSession`/`endSession`/`markAnswered` — no scholar verification in controller
- **File:** `apps/api/src/modules/scholar-qa/scholar-qa.controller.ts`
- **Lines:** 78-97
- **Issue:** The controller description says "(scholar only)" but there is no guard or decorator for verified scholars. Any authenticated user can start/end Q&A sessions and mark questions as answered. Relies entirely on service layer checking.

### Finding 52: Community `answerFatwa` — no scholar verification in controller
- **File:** `apps/api/src/modules/community/community.controller.ts`
- **Lines:** 95-100
- **Code:**
```ts
@Post('fatwa/:id/answer')
@UseGuards(ClerkAuthGuard)
@ApiOperation({ summary: 'Answer fatwa (scholar)' })
answerFatwa(@CurrentUser('id') userId: string, ...) { ... }
```
- **Issue:** Says "(scholar)" but no scholar guard. Any authenticated user can answer fatwa questions.

### Finding 53: Encryption `getBulkKeys`/`getPublicKey` — any authenticated user can get any user's public key
- **File:** `apps/api/src/modules/encryption/encryption.controller.ts`
- **Lines:** 83-94
- **Issue:** While public keys are meant to be shared, the bulk endpoint accepts any comma-separated list of user IDs. No check that the requester has a conversation with these users. This enables enumerating which users have encryption enabled.

### Finding 54: Encryption `getConversationStatus` — no membership check
- **File:** `apps/api/src/modules/encryption/encryption.controller.ts`
- **Lines:** 139-145
- **Code:**
```ts
@Get('status/:conversationId')
@ApiOperation({ summary: 'Check encryption status for a conversation' })
async getConversationStatus(@Param('conversationId') conversationId: string) {
    return this.encryptionService.getConversationEncryptionStatus(conversationId);
}
```
- **Issue:** No `@CurrentUser('id')`. Any authenticated user can check encryption status of any conversation.

---

## LOW (P3) — Minor Issues / Informational

### Finding 55: OG controller — entirely unauthenticated (by design, but exposes removed content)
- **File:** `apps/api/src/modules/og/og.controller.ts`
- **Lines:** 1-79
- **Issue:** All OG endpoints are unauthenticated (by design for social sharing). However, `sitemap.xml` and the individual OG endpoints may expose deleted/removed content if the service doesn't filter. Previously flagged by agent #12.

### Finding 56: Legal controller — public by design
- **File:** `apps/api/src/modules/health/legal.controller.ts`
- **Issue:** No auth on privacy policy and ToS endpoints. This is correct behavior.

### Finding 57: Health controller `check`/`ready`/`live` — public by design but should be behind firewall
- **File:** `apps/api/src/modules/health/health.controller.ts`
- **Issue:** `live` and `ready` probes being public is standard. `check` and `metrics` should be restricted.

### Finding 58: Auth `checkUsername` — no auth required (correct, but no rate limit per username)
- **File:** `apps/api/src/modules/auth/auth.controller.ts`
- **Lines:** 43-48
- **Issue:** Rate limit is 10/min per IP, not per username. Allows enumerating valid usernames at scale from multiple IPs.

### Finding 59: Clerk webhook controller — `@SkipThrottle()` at class level but `@Throttle()` on handler
- **File:** `apps/api/src/modules/auth/webhooks.controller.ts`
- **Lines:** 24, 34
- **Issue:** `@SkipThrottle()` at class level and `@Throttle({ default: { limit: 50, ttl: 60000 } })` on handler. The method-level should override class-level, but this is confusing.

### Finding 60: Stream webhook — accepts requests without signature when secret not configured
- **File:** `apps/api/src/modules/stream/stream.controller.ts`
- **Lines:** 42-48
- **Code:**
```ts
if (this.webhookSecret) {
    if (!signature) { throw new UnauthorizedException('Missing webhook signature'); }
    this.verifySignature(JSON.stringify(body), signature);
}
```
- **Issue:** If `CF_STREAM_WEBHOOK_SECRET` is not set (which it currently isn't per env status), ANY request is accepted as a valid webhook. An attacker could forge stream status updates to mark videos as ready or errored.

### Finding 61: Stripe webhook controller — already checked previously
- **File:** `apps/api/src/modules/payments/stripe-webhook.controller.ts`
- **Issue:** Correctly validates webhook signature when `STRIPE_WEBHOOK_SECRET` is set. But env says it's EMPTY, so webhooks would fail (returns 400, not a security issue).

### Finding 62: Multiple controllers pass inline body params as `@Body('field')` without validation
- **Files:** Various
- **Instances:**
  - `messages.controller.ts:321` — `@Body('code') code: string | null`
  - `messages.controller.ts:332` — `@Body('code') code: string`
  - `messages.controller.ts:344` — `@Body('count') count: number`
  - `messages.controller.ts:354` — `@Body('tag') tag: string | null`
  - `broadcast.controller.ts:149` — `@Body('muted') muted: boolean`
  - `feed.controller.ts:168` — `@Body() body: { featured: boolean }`
- **Issue:** `@Body('field')` with primitive types bypasses all DTO validation.

### Finding 63: Islamic controller uses `OptionalClerkAuthGuard` at class level — public Islamic content mixed with authenticated endpoints
- **File:** `apps/api/src/modules/islamic/islamic.controller.ts`
- **Lines:** 95-96
- **Code:**
```ts
@Controller('islamic')
@UseGuards(OptionalClerkAuthGuard)
export class IslamicController {
```
- **Issue:** The class-level `OptionalClerkAuthGuard` means endpoints that explicitly set `@UseGuards(ClerkAuthGuard)` (like prayer notification settings, quran plans, fasting log) correctly override it. However, this means the class-level guard on some methods intended to be fully authenticated could be missed if a developer forgets the method-level override.

### Finding 64: Reels controller has `@ApiBearerAuth()` at class level but not all endpoints require auth
- **File:** `apps/api/src/modules/reels/reels.controller.ts`
- **Lines:** 13-14
- **Code:**
```ts
@ApiBearerAuth()
@Controller('reels')
```
- **Issue:** `@ApiBearerAuth()` is a Swagger decorator, not a security decorator. It makes Swagger docs show the lock icon for all endpoints, even those using `OptionalClerkAuthGuard` that don't actually require auth. Misleading API documentation.

### Finding 65: Multiple GET endpoints return data without checking if content was deleted/archived
- **Impact:** Controllers pass IDs directly to services without filtering. If services don't filter `isArchived`, `isDeleted`, `isRemoved`, etc., soft-deleted content is accessible.
- **Examples:**
  - `stories/:id` — no auth, could return deleted stories
  - `threads/:id/share-link` — no auth at all
  - `posts/:id/share-link` — uses `ClerkAuthGuard` but doesn't check ownership

### Finding 66: Mosques controller — `GET /mosques/my/memberships` route ordering issue
- **File:** `apps/api/src/modules/mosques/mosques.controller.ts`
- **Lines:** 112-117
- **Issue:** `GET /mosques/my/memberships` is defined AFTER `GET /mosques/:id` (line 63). NestJS processes routes in order, so `my` would be treated as an `:id` parameter first. The `@UseGuards(ClerkAuthGuard)` on this route may never be reached because `GET /mosques/:id` with `OptionalClerkAuthGuard` would match first.

### Finding 67: Hashtags controller — no class-level guard consistency
- **File:** `apps/api/src/modules/hashtags/hashtags.controller.ts`
- **Issue:** Some endpoints use `OptionalClerkAuthGuard`, some use `ClerkAuthGuard`, none at class level. This is the correct pattern for mixed public/private endpoints but requires careful per-method attention.

### Finding 68: Posts `getShareLink` — authenticated but doesn't use userId
- **File:** `apps/api/src/modules/posts/posts.controller.ts`
- **Lines:** 352-358
- **Code:**
```ts
@Get(':id/share-link')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
@ApiOperation({ summary: 'Get shareable link for a post' })
getShareLink(@Param('id') id: string) {
    return this.postsService.getShareLink(id);
}
```
- **Issue:** Requires auth but doesn't use the userId. Should probably use `OptionalClerkAuthGuard` since the share link is just a URL, or should check that the post is visible to the requester.

### Finding 69: Threads `getShareLink` — completely unauthenticated
- **File:** `apps/api/src/modules/threads/threads.controller.ts`
- **Lines:** 265-269
- **Code:**
```ts
@Get(':id/share-link')
@ApiOperation({ summary: 'Get shareable URL for this thread' })
getShareLink(@Param('id') id: string) {
    return this.threadsService.getShareLink(id);
}
```
- **Issue:** No auth guard at all. Not necessarily a security issue for public threads, but deleted or private threads could have their share links generated.

---

## Auth Pattern Summary by Controller

| Controller | Class Guard | Methods Checked | Issues |
|---|---|---|---|
| auth | None (per-method) | Yes | Clean |
| webhooks (Clerk) | None (SkipThrottle) | N/A | Webhook-verified |
| two-factor | None | Partial | **P0: validate/backup UNAUTHENTICATED** |
| admin | ClerkAuthGuard | Yes | **P0: NO ADMIN ROLE CHECK** |
| users | None (per-method) | Yes | P1: followers/following no guard |
| posts | None (per-method) | Yes | Clean |
| threads | None (per-method) | Yes | Clean |
| stories | None (per-method) | Partial | P1: getById no guard |
| reels | None (per-method) | Yes | Clean |
| videos | None (per-method) | Yes | Clean |
| messages | ClerkAuthGuard | Yes | P2: many inline body types |
| channels | None (per-method) | Yes | Clean |
| channel-posts | None (per-method) | Yes | Clean |
| follows | ClerkAuthGuard | Yes | P1: social graph IDOR |
| blocks | ClerkAuthGuard | Yes | Clean |
| mutes | ClerkAuthGuard | Yes | Clean |
| restricts | ClerkAuthGuard | Yes | Clean |
| notifications | ClerkAuthGuard | Yes | Clean |
| search | None | Partial | P2: mostly public, autocomplete leak |
| feed | None (per-method) | Partial | **P0: admin endpoint no admin check** |
| bookmarks | ClerkAuthGuard | Yes | P2: double prefix |
| reports | ClerkAuthGuard | Yes | **P0: admin endpoints no admin check** |
| settings | ClerkAuthGuard | Yes | Clean |
| privacy | ClerkAuthGuard | Yes | Clean |
| upload | ClerkAuthGuard | Yes | Clean (ownership check on delete) |
| payments | ClerkAuthGuard | Yes | P1: no DTO validation |
| stripe-webhook | None | N/A | Webhook-verified |
| gifts | ClerkAuthGuard | Yes | P1: no DTO validation |
| monetization | None (per-method) | Yes | P1: no DTO validation |
| commerce | None (per-method) | Yes | Clean |
| communities | None (per-method) | Yes | Clean |
| community | None (per-method) | Yes | P2: no scholar check on fatwa |
| community-notes | None (per-method) | Yes | Clean |
| ai | None (per-method) | Yes | Clean |
| moderation | ClerkAuthGuard | Yes | **P0: admin endpoints no admin check** |
| live | None (per-method) | Yes | P2: listGuests no scoping |
| audio-rooms | None (per-method) | Yes | Clean |
| calls | ClerkAuthGuard | Yes | Clean |
| playlists | None (per-method) | Yes | Clean |
| polls | None (per-method) | Yes | Clean |
| islamic | OptionalClerkAuthGuard | Yes | Clean (method overrides correct) |
| halal | None (per-method) | Yes | Clean |
| mosques | None (per-method) | Yes | P3: route ordering issue |
| scholar-qa | None (per-method) | Yes | P2: no scholar check |
| gamification | None (per-method) | Yes | P2: method name collision |
| discord-features | None (per-method) | Partial | P1: webhook listing IDOR |
| telegram-features | ClerkAuthGuard | Partial | P1: getTopics no membership check |
| broadcast | None (per-method) | Partial | P1: subscribers list IDOR |
| events | None (per-method) | Yes | P2: double prefix |
| circles | ClerkAuthGuard | Yes | Clean |
| promotions | ClerkAuthGuard | Yes | P1: no DTO validation |
| recommendations | None (per-method) | Yes | Clean |
| collabs | ClerkAuthGuard | Yes | Clean |
| embeddings | ClerkAuthGuard | Yes | **P0: no admin check on backfill** |
| retention | ClerkAuthGuard | Yes | P2: inline body |
| webhooks | ClerkAuthGuard | Partial | P1: list no ownership |
| stickers | None (per-method) | Partial | **P0: deletePack no userId, createPack no userId** |
| thumbnails | None (per-method) | Partial | P1: createVariants no userId |
| creator | ClerkAuthGuard | Yes | Clean |
| og | None | N/A | Public by design |
| health | None | N/A | P0: metrics/check exposed |
| legal | None | N/A | Public by design |
| drafts | ClerkAuthGuard | Yes | Clean |
| majlis-lists | None (per-method) | Yes | Clean |
| parental-controls | ClerkAuthGuard | Partial | **P0: getRestrictions no parent check** |
| devices | ClerkAuthGuard | Yes | Clean |
| downloads | ClerkAuthGuard | Yes | P2: double prefix |
| encryption | ClerkAuthGuard | Partial | P2: status no membership check |
| hashtags | None (per-method) | Yes | Clean |
| profile-links | ClerkAuthGuard | Yes | Clean |
| reel-templates | None (per-method) | Yes | P2: interface body |
| scheduling | None (per-method) | Yes | Clean |
| story-chains | None (per-method) | Yes | P2: inline bodies |
| stream | None | N/A | P3: accepts unsigned when no secret |
| subtitles | None (per-method) | Yes | Clean |
| video-replies | None (per-method) | Yes | Clean |
| watch-history | ClerkAuthGuard | Yes | Clean |
| alt-profile | ClerkAuthGuard | Yes | Clean |
| audio-tracks | None (per-method) | Yes | Clean |
| chat-export | ClerkAuthGuard | Yes | Clean |
| clips | None (per-method) | Yes | Clean |
| checklists | ClerkAuthGuard | Partial | P1: getByConversation no membership check |

---

## Top 10 Most Critical Fixes (Prioritized)

1. **Add admin role guard** — Create an `AdminGuard` or `@Roles('admin')` decorator and apply to: AdminController, ModerationController admin endpoints, FeedController featurePost, EmbeddingsController backfill, ReportsController admin endpoints
2. **Secure 2FA validate/backup** — Add auth or per-userId rate limiting to prevent brute-force
3. **Add userId to sticker pack create/delete** — Pass `@CurrentUser('id')` for ownership
4. **Fix parental controls getRestrictions** — Require parent userId check
5. **Add auth to health metrics** — Restrict to admin or internal-only
6. **Add validation decorators to all financial DTOs** — Payments, Gifts, Monetization, Promotions
7. **Fix followers/following privacy** — Check account privacy before returning lists
8. **Add membership checks to conversation-scoped endpoints** — Checklists, Telegram topics, encryption status
9. **Add auth to stories getById** — Use OptionalClerkAuthGuard at minimum, check private account
10. **Fix thumbnail variants** — Pass userId for ownership verification
