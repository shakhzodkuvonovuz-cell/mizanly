# Agent #71 (Bonus) — Swagger / API Documentation Quality Audit

**Scope:** All 82 controllers in `apps/api/src/modules/**/*.controller.ts` + Swagger setup in `main.ts`
**Method:** Line-by-line reading of every controller file
**Controllers audited:** 82 (all)
**Total findings:** 147

---

## CATEGORY 1: Swagger Setup (main.ts)

### Finding 1.1 — Swagger disabled in production
- **File:** `apps/api/src/main.ts`, lines 99-122
- **Code:** `if (process.env.NODE_ENV !== 'production') { ... }`
- **Issue:** Swagger docs are completely disabled in production. While this is a common security practice, there is NO alternative for API consumers (no Postman collection export, no static OpenAPI JSON endpoint, no documentation portal). Any third-party integration or mobile developer referencing the Swagger UI will have zero documentation in production.
- **Severity:** Medium
- **Recommendation:** Export a static `openapi.json` at build time that can be hosted separately, or provide a protected admin-only docs route.

### Finding 1.2 — No API versioning in Swagger document
- **File:** `apps/api/src/main.ts`, line 109
- **Code:** `.setVersion('1.0.0')`
- **Issue:** The Swagger document version is hardcoded to `1.0.0` but the actual API prefix is `api/v1`. There is no mechanism to update the version or maintain multiple API versions. If v2 endpoints are ever added, the existing Swagger setup has no way to document both.
- **Severity:** Low

### Finding 1.3 — No global @ApiResponse decorators for common errors
- **File:** `apps/api/src/main.ts`
- **Issue:** No global 401 (Unauthorized), 429 (Rate Limited), or 500 (Internal Server Error) response documentation. Every protected endpoint can return 401, every endpoint can return 429 (due to global throttle), and any endpoint can return 500. These are not documented anywhere globally or per-endpoint for the vast majority of controllers.
- **Severity:** High

---

## CATEGORY 2: Controllers Missing @ApiTags

### Finding 2.1 — ClipsController has NO @ApiTags
- **File:** `apps/api/src/modules/clips/clips.controller.ts`, line 20
- **Code:** `@Controller('clips')` — no `@ApiTags()` decorator
- **Issue:** The ClipsController has no `@ApiTags()` decorator. All 5 endpoints will appear under "default" in Swagger UI, making them impossible to find.
- **Severity:** Medium

---

## CATEGORY 3: Controllers Missing @ApiBearerAuth (authentication not documented)

### Finding 3.1 — CommerceController missing @ApiBearerAuth on all authenticated endpoints
- **File:** `apps/api/src/modules/commerce/commerce.controller.ts`
- **Code:** Lines 24-169 — uses `@UseGuards(ClerkAuthGuard)` on individual endpoints but has NO class-level or method-level `@ApiBearerAuth()`
- **Issue:** 17 authenticated endpoints show no auth requirement in Swagger UI. Consumers cannot see they need a Bearer token.
- **Severity:** High

### Finding 3.2 — CommunityController missing @ApiBearerAuth on all authenticated endpoints
- **File:** `apps/api/src/modules/community/community.controller.ts`
- **Code:** Lines 19-222 — uses `@UseGuards(ClerkAuthGuard)` per method but NO `@ApiBearerAuth()` anywhere
- **Issue:** 25+ authenticated endpoints show no auth requirement in Swagger. The controller imports `ApiOperation` from swagger but never `ApiBearerAuth`.
- **Severity:** High

### Finding 3.3 — DiscordFeaturesController missing @ApiBearerAuth on all authenticated endpoints
- **File:** `apps/api/src/modules/discord-features/discord-features.controller.ts`
- **Code:** Lines 18-144 — uses `@UseGuards(ClerkAuthGuard)` per method but NO `@ApiBearerAuth()` anywhere
- **Issue:** 14 authenticated endpoints undocumented for auth. Imports `ApiOperation` but not `ApiBearerAuth`.
- **Severity:** High

### Finding 3.4 — GamificationController missing @ApiBearerAuth on all authenticated endpoints
- **File:** `apps/api/src/modules/gamification/gamification.controller.ts`
- **Code:** Lines 19-208 — uses `@UseGuards(ClerkAuthGuard)` per method but NO `@ApiBearerAuth()` anywhere
- **Issue:** 20+ authenticated endpoints show no auth in Swagger. Imports `ApiOperation` but not `ApiBearerAuth`.
- **Severity:** High

### Finding 3.5 — AiController missing @ApiBearerAuth on all authenticated endpoints
- **File:** `apps/api/src/modules/ai/ai.controller.ts`
- **Code:** Lines 17-110 — uses `@UseGuards(ClerkAuthGuard)` per method but NO `@ApiBearerAuth()` anywhere
- **Issue:** 11 authenticated endpoints show no auth in Swagger.
- **Severity:** High

### Finding 3.6 — OgController has no auth documentation but some endpoints are public
- **File:** `apps/api/src/modules/og/og.controller.ts`
- **Issue:** No `@ApiBearerAuth()` which is CORRECT since all OG endpoints are public. However, there's no documentation noting that these are intentionally unauthenticated public endpoints.
- **Severity:** Info

### Finding 3.7 — SearchController missing @ApiBearerAuth on authenticated endpoints
- **File:** `apps/api/src/modules/search/search.controller.ts`
- **Code:** Line 40 — `@UseGuards(ClerkAuthGuard) @ApiBearerAuth()` is applied only on `suggestedUsers`, but the class-level import only uses `ApiBearerAuth` on that one method. The majority of search endpoints are correctly public.
- **Issue:** Inconsistent — some methods use per-method `@ApiBearerAuth()` correctly but the pattern is not uniform. Lines 16-92 show 7/9 endpoints have no auth docs (but most are correctly public).
- **Severity:** Low

### Finding 3.8 — ClipsController missing @ApiBearerAuth on authenticated endpoints
- **File:** `apps/api/src/modules/clips/clips.controller.ts`
- **Code:** Lines 23-64 — uses `@UseGuards(ClerkAuthGuard)` on create/getByUser/delete but NO `@ApiBearerAuth()` anywhere
- **Issue:** 3 authenticated endpoints undocumented for auth.
- **Severity:** Medium

---

## CATEGORY 4: Endpoints Missing @ApiOperation

### Finding 4.1 — SearchController.search() missing @ApiOperation
- **File:** `apps/api/src/modules/search/search.controller.ts`, lines 16-24
- **Code:**
```ts
@Get()
@Throttle({ default: { ttl: 60000, limit: 30 } })
search(@Query('q') query: string, @Query('type') type?: SearchType, @Query('cursor') cursor?: string) {
```
- **Issue:** The main search endpoint (GET /search) has NO `@ApiOperation` decorator. This is arguably the most important endpoint in the Search controller.
- **Severity:** Medium

### Finding 4.2 — SearchController.trending() missing @ApiOperation
- **File:** `apps/api/src/modules/search/search.controller.ts`, lines 26-28
- **Code:** `trending() { return this.searchService.trending(); }`
- **Issue:** No `@ApiOperation` decorator on trending endpoint.
- **Severity:** Medium

### Finding 4.3 — SearchController.getHashtagPosts() missing @ApiOperation
- **File:** `apps/api/src/modules/search/search.controller.ts`, lines 30-37
- **Issue:** No `@ApiOperation` decorator.
- **Severity:** Medium

### Finding 4.4 — SearchController.suggestedUsers() missing @ApiOperation
- **File:** `apps/api/src/modules/search/search.controller.ts`, line 41
- **Issue:** No `@ApiOperation` decorator.
- **Severity:** Medium

### Finding 4.5 — SearchController.searchPosts() missing @ApiOperation
- **File:** `apps/api/src/modules/search/search.controller.ts`, lines 43-53
- **Issue:** No `@ApiOperation` decorator.
- **Severity:** Medium

### Finding 4.6 — SearchController.searchThreads() missing @ApiOperation
- **File:** `apps/api/src/modules/search/search.controller.ts`, lines 55-63
- **Issue:** No `@ApiOperation` decorator.
- **Severity:** Medium

### Finding 4.7 — SearchController.searchReels() missing @ApiOperation
- **File:** `apps/api/src/modules/search/search.controller.ts`, lines 65-73
- **Issue:** No `@ApiOperation` decorator.
- **Severity:** Medium

### Finding 4.8 — SearchController.exploreFeed() missing @ApiOperation
- **File:** `apps/api/src/modules/search/search.controller.ts`, lines 75-82
- **Issue:** No `@ApiOperation` decorator.
- **Severity:** Medium

### Finding 4.9 — SearchController.querySuggestions() missing @ApiOperation
- **File:** `apps/api/src/modules/search/search.controller.ts`, lines 84-91
- **Issue:** No `@ApiOperation` decorator.
- **Severity:** Medium

**Summary: SearchController is the WORST documented controller — 9/9 endpoints missing @ApiOperation. Zero documentation for the entire search API.**

### Finding 4.10 — ClipsController: ALL 5 endpoints missing @ApiOperation
- **File:** `apps/api/src/modules/clips/clips.controller.ts`, lines 23-64
- **Issue:** Zero `@ApiOperation` decorators on any of the 5 endpoints (create, getByVideo, getByUser, delete, getShareLink).
- **Severity:** Medium

---

## CATEGORY 5: Double-Prefix Route Bug (results in wrong Swagger paths)

### Finding 5.1 — BookmarksController has double prefix `api/v1/bookmarks`
- **File:** `apps/api/src/modules/bookmarks/bookmarks.controller.ts`, line 25
- **Code:** `@Controller('api/v1/bookmarks')`
- **Issue:** The global prefix is already `api/v1` (set in `main.ts` line 60). This makes the actual routes `api/v1/api/v1/bookmarks/...`. Swagger will document these at the doubled path, and mobile clients using the correct path will get 404s.
- **Severity:** Critical (already reported in agent #25)

### Finding 5.2 — ReportsController has double prefix `api/v1/reports`
- **File:** `apps/api/src/modules/reports/reports.controller.ts`, line 23
- **Code:** `@Controller('api/v1/reports')`
- **Issue:** Same double-prefix bug. Actual route is `api/v1/api/v1/reports/...`.
- **Severity:** Critical

### Finding 5.3 — DownloadsController has double prefix `api/v1/downloads`
- **File:** `apps/api/src/modules/downloads/downloads.controller.ts`, line 25
- **Code:** `@Controller('api/v1/downloads')`
- **Issue:** Same double-prefix bug.
- **Severity:** Critical

### Finding 5.4 — EventsController has double prefix `api/v1/events`
- **File:** `apps/api/src/modules/events/events.controller.ts`, line 157
- **Code:** `@Controller('api/v1/events')`
- **Issue:** Same double-prefix bug.
- **Severity:** Critical

### Finding 5.5 — RetentionController has double prefix `api/v1/retention`
- **File:** `apps/api/src/modules/retention/retention.controller.ts`, line 9
- **Code:** `@Controller('api/v1/retention')`
- **Issue:** Same double-prefix bug.
- **Severity:** Critical

### Finding 5.6 — EmbeddingsController has double prefix `api/v1/embeddings`
- **File:** `apps/api/src/modules/embeddings/embeddings.controller.ts`, line 8
- **Code:** `@Controller('api/v1/embeddings')`
- **Issue:** Same double-prefix bug.
- **Severity:** Critical

---

## CATEGORY 6: Inline DTOs Missing @ApiProperty (Swagger shows empty request body)

### Finding 6.1 — PostsController inline DTOs missing @ApiProperty
- **File:** `apps/api/src/modules/posts/posts.controller.ts`, lines 26-49
- **Code:**
```ts
class ReactDto {
  @IsEnum(['LIKE', 'LOVE', 'SUPPORT', 'INSIGHTFUL'])
  reaction: string;
}
class EditCommentDto {
  @IsString() @MaxLength(1000) content: string;
}
class ShareDto {
  @IsOptional() @IsString() @MaxLength(2000) content?: string;
}
class UpdatePostDto {
  @IsOptional() @IsString() @MaxLength(2000) content?: string;
}
```
- **Issue:** 4 inline DTOs (ReactDto, EditCommentDto, ShareDto, UpdatePostDto) have ZERO `@ApiProperty` decorators. Swagger will show empty request body schemas for 4 endpoints.
- **Severity:** Medium

### Finding 6.2 — PaymentsController inline DTOs missing @ApiProperty
- **File:** `apps/api/src/modules/payments/payments.controller.ts`, lines 21-34
- **Code:**
```ts
class CreatePaymentIntentDto { amount: number; currency: string; receiverId: string; }
class CreateSubscriptionDto { tierId: string; paymentMethodId: string; }
class AttachPaymentMethodDto { paymentMethodId: string; }
```
- **Issue:** 3 inline DTOs have ZERO `@ApiProperty` decorators AND zero class-validator decorators. Swagger shows empty bodies AND no request validation occurs.
- **Severity:** High (dual bug: no docs + no validation)

### Finding 6.3 — MonetizationController inline DTOs missing @ApiProperty
- **File:** `apps/api/src/modules/monetization/monetization.controller.ts`, lines 20-39
- **Code:**
```ts
class CreateTipDto { receiverId: string; amount: number; message?: string; }
class CreateTierDto { name: string; price: number; benefits: string[]; level?: string; }
class UpdateTierDto { name?: string; price?: number; benefits?: string[]; level?: string; isActive?: boolean; }
```
- **Issue:** 3 inline DTOs have ZERO `@ApiProperty` decorators AND zero class-validator decorators. Critical financial endpoints have no request body documentation.
- **Severity:** High

### Finding 6.4 — GiftsController inline DTOs missing @ApiProperty
- **File:** `apps/api/src/modules/gifts/gifts.controller.ts`, lines 17-31
- **Code:**
```ts
class PurchaseCoinsDto { amount: number; }
class SendGiftDto { receiverId: string; giftType: string; contentId?: string; contentType?: string; }
class CashoutDto { diamonds: number; }
```
- **Issue:** 3 inline DTOs have ZERO `@ApiProperty` AND zero class-validator decorators. Virtual currency endpoints have empty Swagger schemas.
- **Severity:** High

### Finding 6.5 — PromotionsController inline DTOs missing @ApiProperty
- **File:** `apps/api/src/modules/promotions/promotions.controller.ts`, lines 18-32
- **Code:**
```ts
class BoostPostDto { postId: string; budget: number; duration: number; }
class SetReminderDto { postId: string; remindAt: string; }
class MarkBrandedDto { postId: string; partnerName: string; }
```
- **Issue:** 3 inline DTOs have ZERO `@ApiProperty` AND zero class-validator decorators.
- **Severity:** Medium

### Finding 6.6 — DevicesController RegisterDeviceDto missing @ApiProperty
- **File:** `apps/api/src/modules/devices/devices.controller.ts`, lines 9-13
- **Code:**
```ts
class RegisterDeviceDto {
  @IsString() @IsNotEmpty() pushToken: string;
  @IsString() @IsNotEmpty() platform: string;
  @IsString() @IsOptional() deviceId?: string;
}
```
- **Issue:** Has class-validator decorators but ZERO `@ApiProperty` decorators. Swagger shows empty schema.
- **Severity:** Medium

### Finding 6.7 — ChecklistsController inline DTOs missing @ApiProperty
- **File:** `apps/api/src/modules/checklists/checklists.controller.ts`, lines 9-16
- **Code:**
```ts
class CreateChecklistDto { @IsString() conversationId: string; @IsString() title: string; }
class AddItemDto { @IsString() text: string; }
```
- **Issue:** 2 inline DTOs have class-validator but ZERO `@ApiProperty` decorators.
- **Severity:** Medium

### Finding 6.8 — CommunityNotesController inline DTOs missing @ApiProperty
- **File:** `apps/api/src/modules/community-notes/community-notes.controller.ts`, lines 10-18
- **Code:**
```ts
class CreateNoteDto { @IsString() contentType: string; @IsString() contentId: string; @IsString() note: string; }
class RateNoteDto { @IsString() rating: string; }
```
- **Issue:** 2 inline DTOs have class-validator but ZERO `@ApiProperty` decorators.
- **Severity:** Medium

### Finding 6.9 — SchedulingController UpdateScheduleDto missing @ApiProperty
- **File:** `apps/api/src/modules/scheduling/scheduling.controller.ts`, lines 21-25
- **Code:** `class UpdateScheduleDto { @IsISO8601() @IsNotEmpty() scheduledAt: string; }`
- **Issue:** Has class-validator but no `@ApiProperty` decorator.
- **Severity:** Low

### Finding 6.10 — ProfileLinksController ReorderLinksDto missing @ApiProperty
- **File:** `apps/api/src/modules/profile-links/profile-links.controller.ts`, lines 23-27
- **Code:** `class ReorderLinksDto { @IsArray() @IsString({ each: true }) ids: string[]; }`
- **Issue:** Has class-validator but no `@ApiProperty` decorator.
- **Severity:** Low

### Finding 6.11 — PollsController VoteDto missing @ApiProperty
- **File:** `apps/api/src/modules/polls/polls.controller.ts`, lines 22-25
- **Code:** `class VoteDto { @IsString() optionId: string; }`
- **Issue:** Has class-validator but no `@ApiProperty` decorator.
- **Severity:** Low

### Finding 6.12 — SettingsController AddKeywordDto missing @ApiProperty
- **File:** `apps/api/src/modules/settings/settings.controller.ts`, lines 26-29
- **Code:** `class AddKeywordDto { @IsString() @MaxLength(100) keyword: string; }`
- **Issue:** Has class-validator but no `@ApiProperty` decorator.
- **Severity:** Low

---

## CATEGORY 7: Missing @ApiResponse Decorators (error responses undocumented)

### Finding 7.1 — 67 out of 82 controllers have ZERO @ApiResponse decorators
- **Issue:** Only the following controllers use any `@ApiResponse` decorators:
  1. `payments.controller.ts` (5 endpoints with responses)
  2. `two-factor.controller.ts` (5 endpoints with responses)
  3. `gifts.controller.ts` (all endpoints have responses)
  4. `monetization.controller.ts` (all endpoints have responses)
  5. `polls.controller.ts` (all endpoints with responses)
  6. `creator.controller.ts` (all endpoints have responses)
  7. `promotions.controller.ts` (all endpoints have responses)
  8. `islamic.controller.ts` (partial — some endpoints)
  9. `events.controller.ts` (uses ApiOkResponse/ApiCreatedResponse/ApiNoContentResponse)

  **67 controllers** (82 minus the above list) have NO error response documentation at all. For those, Swagger shows only a default 200 response.
- **Severity:** High

### Finding 7.2 — PostsController: 31 endpoints, ZERO @ApiResponse
- **File:** `apps/api/src/modules/posts/posts.controller.ts`
- **Issue:** The largest content controller with 31 endpoints has zero `@ApiResponse` decorators. No 400, 401, 403, 404, or 409 responses documented.
- **Severity:** Medium

### Finding 7.3 — MessagesController: 40+ endpoints, ZERO @ApiResponse
- **File:** `apps/api/src/modules/messages/messages.controller.ts`
- **Issue:** The largest controller by endpoint count (40+) has zero `@ApiResponse` decorators.
- **Severity:** Medium

### Finding 7.4 — VideosController: 30+ endpoints, ZERO @ApiResponse
- **File:** `apps/api/src/modules/videos/videos.controller.ts`
- **Issue:** 30+ endpoints with zero error response documentation.
- **Severity:** Medium

---

## CATEGORY 8: Inline Body Parameters (not documented in Swagger)

Many controllers use `@Body('field')` or `@Body() body: { ... }` with inline interfaces/anonymous types instead of proper DTO classes. These produce NO documentation in Swagger — the request body appears as "object" with no schema.

### Finding 8.1 — StoriesController.replyToStory uses @Body('content')
- **File:** `apps/api/src/modules/stories/stories.controller.ts`, line 111
- **Code:** `@Body('content') content: string`
- **Issue:** Bare `@Body('content')` produces no Swagger schema. Should be a DTO with `@ApiProperty`.
- **Severity:** Low

### Finding 8.2 — StoriesController.submitStickerResponse uses inline body type
- **File:** `apps/api/src/modules/stories/stories.controller.ts`, line 176
- **Code:** `@Body() body: { stickerType: string; responseData: Record<string, unknown> }`
- **Issue:** Anonymous inline type — Swagger shows empty body schema.
- **Severity:** Low

### Finding 8.3 — FeedController.trackSessionSignal uses inline body type
- **File:** `apps/api/src/modules/feed/feed.controller.ts`, line 112
- **Code:** `@Body() body: { contentId: string; action: 'view' | 'like' | 'save' | 'share' | 'skip'; hashtags?: string[]; scrollPosition?: number }`
- **Issue:** Anonymous inline type — no Swagger schema.
- **Severity:** Low

### Finding 8.4 — FeedController.featurePost uses inline body type
- **File:** `apps/api/src/modules/feed/feed.controller.ts`, line 169
- **Code:** `@Body() body: { featured: boolean }`
- **Issue:** Anonymous inline type.
- **Severity:** Low

### Finding 8.5 — IslamicController.logFast uses inline body type
- **File:** `apps/api/src/modules/islamic/islamic.controller.ts`, line 538
- **Code:** `@Body() body: { date: string; isFasting: boolean; fastType?: string; reason?: string }`
- **Issue:** Anonymous inline type.
- **Severity:** Low

### Finding 8.6 — IslamicController.updateHifzProgress uses inline body type
- **File:** `apps/api/src/modules/islamic/islamic.controller.ts`, line 663
- **Code:** `@Body() body: { status: string }`
- **Issue:** Anonymous inline type.
- **Severity:** Low

### Finding 8.7 — IslamicController.completeDailyTask uses inline body type
- **File:** `apps/api/src/modules/islamic/islamic.controller.ts`, line 713
- **Code:** `@Body() body: { taskType: string }`
- **Issue:** Anonymous inline type.
- **Severity:** Low

### Finding 8.8 — GamificationController.updateProgress uses inline body type
- **File:** `apps/api/src/modules/gamification/gamification.controller.ts`, line 171
- **Code:** `@Body() body: { episodeNum: number; timestamp: number }`
- **Issue:** Anonymous inline type.
- **Severity:** Low

### Finding 8.9 — MessagesController.sendViewOnceMessage uses inline body type
- **File:** `apps/api/src/modules/messages/messages.controller.ts`, line 474
- **Code:** `@Body() body: { mediaUrl: string; mediaType?: string; messageType?: string; content?: string }`
- **Issue:** Anonymous inline type — important messaging endpoint undocumented.
- **Severity:** Medium

### Finding 8.10 — MessagesController.setWallpaper uses inline body type
- **File:** `apps/api/src/modules/messages/messages.controller.ts`, line 524
- **Code:** `@Body() body: { wallpaperUrl: string | null }`
- **Issue:** Anonymous inline type.
- **Severity:** Low

### Finding 8.11 — MessagesController.setTone uses inline body type
- **File:** `apps/api/src/modules/messages/messages.controller.ts`, line 534
- **Code:** `@Body() body: { tone: string | null }`
- **Issue:** Anonymous inline type.
- **Severity:** Low

### Finding 8.12 — MessagesController uses @Body('field') pattern in multiple places
- **File:** `apps/api/src/modules/messages/messages.controller.ts`
- **Lines:** 322 (`@Body('code')`), 333 (`@Body('code')`), 344 (`@Body('count')`), 354 (`@Body('tag')`)
- **Issue:** 4 endpoints use bare `@Body('field')` — Swagger shows no schema.
- **Severity:** Low

### Finding 8.13 — LiveController.setRecording uses @Body('recordingUrl')
- **File:** `apps/api/src/modules/live/live.controller.ts`, line 129
- **Code:** `@Body('recordingUrl') url: string`
- **Issue:** Bare `@Body('field')` — no Swagger schema.
- **Severity:** Low

### Finding 8.14 — LiveController.inviteGuest uses @Body('guestUserId')
- **File:** `apps/api/src/modules/live/live.controller.ts`, line 139
- **Code:** `@Body('guestUserId') guestUserId: string`
- **Issue:** Bare `@Body('field')`.
- **Severity:** Low

### Finding 8.15 — LiveController.startRehearsal uses inline body type
- **File:** `apps/api/src/modules/live/live.controller.ts`, line 173
- **Code:** `@Body() body: { title: string; description?: string; thumbnailUrl?: string }`
- **Issue:** Anonymous inline type.
- **Severity:** Low

### Finding 8.16 — LiveController.setSubscribersOnly uses inline body type
- **File:** `apps/api/src/modules/live/live.controller.ts`, line 202
- **Code:** `@Body() body: { subscribersOnly: boolean }`
- **Issue:** Anonymous inline type.
- **Severity:** Low

### Finding 8.17 — UsersController.updateNasheedMode uses inline body type
- **File:** `apps/api/src/modules/users/users.controller.ts`, line 249
- **Code:** `@Body() body: { nasheedMode: boolean }`
- **Issue:** Anonymous inline type.
- **Severity:** Low

### Finding 8.18 — ThreadsController.setReplyPermission uses @Body('permission')
- **File:** `apps/api/src/modules/threads/threads.controller.ts`, line 250
- **Code:** `@Body('permission') permission: 'everyone' | 'following' | 'mentioned' | 'none'`
- **Issue:** Bare `@Body('field')` — no Swagger schema.
- **Severity:** Low

### Finding 8.19 — AdminController.setFlag uses @Body('value')
- **File:** `apps/api/src/modules/admin/admin.controller.ts`, line 100
- **Code:** `@Body('value') value: string`
- **Issue:** Bare `@Body('field')`.
- **Severity:** Low

### Finding 8.20 — SettingsController.updateAutoPlay uses inline body type
- **File:** `apps/api/src/modules/settings/settings.controller.ts`, line 91
- **Code:** `@Body() body: { autoPlaySetting: string }`
- **Issue:** Anonymous inline type.
- **Severity:** Low

### Finding 8.21 — SettingsController.logScreenTime uses inline body type
- **File:** `apps/api/src/modules/settings/settings.controller.ts`, line 126
- **Code:** `@Body() body: { seconds: number }`
- **Issue:** Anonymous inline type.
- **Severity:** Low

### Finding 8.22 — SettingsController.setScreenTimeLimit uses inline body type
- **File:** `apps/api/src/modules/settings/settings.controller.ts`, line 140
- **Code:** `@Body() body: { limitMinutes: number | null }`
- **Issue:** Anonymous inline type.
- **Severity:** Low

### Finding 8.23 — StoryChainsController.createChain uses inline body type
- **File:** `apps/api/src/modules/story-chains/story-chains.controller.ts`, line 29
- **Code:** `@Body() body: { prompt: string; coverUrl?: string }`
- **Issue:** Anonymous inline type.
- **Severity:** Low

### Finding 8.24 — StoryChainsController.joinChain uses inline body type
- **File:** `apps/api/src/modules/story-chains/story-chains.controller.ts`, line 58
- **Code:** `@Body() body: { storyId: string }`
- **Issue:** Anonymous inline type.
- **Severity:** Low

### Finding 8.25 — WebhooksController.create uses inline body type
- **File:** `apps/api/src/modules/webhooks/webhooks.controller.ts`, line 21
- **Code:** `@Body() body: { circleId: string; name: string; url: string; events: string[] }`
- **Issue:** Anonymous inline type with 4 fields — zero Swagger documentation.
- **Severity:** Medium

### Finding 8.26 — VideoRepliesController.create uses inline body type
- **File:** `apps/api/src/modules/video-replies/video-replies.controller.ts`, lines 31-37
- **Code:** `@Body() body: { commentId: string; commentType: 'post' | 'reel'; mediaUrl: string; thumbnailUrl?: string; duration?: number; }`
- **Issue:** Complex inline type with 5 fields.
- **Severity:** Medium

### Finding 8.27 — ReelTemplatesController.create uses interface for body
- **File:** `apps/api/src/modules/reel-templates/reel-templates.controller.ts`, lines 20-24
- **Code:** Uses `interface CreateReelTemplateBody` (a TypeScript interface, not a class)
- **Issue:** TypeScript interfaces are erased at runtime. NestJS Swagger plugin requires classes with decorators. This body will appear as "object" in Swagger.
- **Severity:** Medium

### Finding 8.28 — ChatExportController.generateExport uses interface for body
- **File:** `apps/api/src/modules/chat-export/chat-export.controller.ts`, lines 18-21
- **Code:** Uses `interface GenerateExportBody` — TypeScript interface, not a class
- **Issue:** Same as above — interfaces are erased at runtime, Swagger shows "object".
- **Severity:** Medium

### Finding 8.29 — RetentionController.trackSession uses inline body type
- **File:** `apps/api/src/modules/retention/retention.controller.ts`, lines 21-26
- **Code:** `@Body() body: { scrollDepth: number; timeSpentMs: number; interactionCount: number; space: string; }`
- **Issue:** Anonymous inline type with 4 fields.
- **Severity:** Low

### Finding 8.30 — DevicesController.logoutAllOtherSessions uses inline body type
- **File:** `apps/api/src/modules/devices/devices.controller.ts`, line 61
- **Code:** `@Body() body: { currentSessionId: string }`
- **Issue:** Anonymous inline type.
- **Severity:** Low

### Finding 8.31 — BroadcastController.mute uses @Body('muted')
- **File:** `apps/api/src/modules/broadcast/broadcast.controller.ts`, line 149
- **Code:** `@Body('muted') muted: boolean`
- **Issue:** Bare `@Body('field')`.
- **Severity:** Low

### Finding 8.32 — CreatorController.askAI uses inline body type
- **File:** `apps/api/src/modules/creator/creator.controller.ts`, line 86
- **Code:** `@Body() body: { question: string }`
- **Issue:** Anonymous inline type.
- **Severity:** Low

### Finding 8.33 — ThumbnailsController.trackImpression/trackClick use inline body types
- **File:** `apps/api/src/modules/thumbnails/thumbnails.controller.ts`, lines 71, 78
- **Code:** `@Body() body: { variantId: string }`
- **Issue:** Anonymous inline type used in 2 endpoints.
- **Severity:** Low

---

## CATEGORY 9: Missing Pagination Documentation

### Finding 9.1 — Most paginated endpoints lack @ApiQuery for cursor/limit
- **Issue:** Out of ~80+ endpoints that support cursor pagination, only the following controllers document cursor/limit query parameters with `@ApiQuery`:
  - `threads.controller.ts` (trending endpoint)
  - `reels.controller.ts` (trending endpoint)
  - `feed.controller.ts` (6 endpoints)
  - `islamic.controller.ts` (hadith, prayer-times, fasting, dua, mosque endpoints)
  - `halal.controller.ts` (findNearby, getReviews)
  - `mosques.controller.ts` (findNearby, getFeed, getMembers)

  **The remaining ~60+ paginated endpoints** accept `@Query('cursor')` and `@Query('limit')` parameters that are invisible in Swagger.
- **Severity:** Medium

### Finding 9.2 — No documentation of pagination response envelope
- **Issue:** The global `TransformInterceptor` wraps all responses in `{ success, data, timestamp }` and paginated endpoints return `{ data: T[], meta: { cursor?, hasMore } }`. This response envelope is NEVER documented in any controller's `@ApiResponse`. Swagger consumers have no idea what the response structure looks like.
- **Severity:** High

---

## CATEGORY 10: Wrong HTTP Method for Semantics

### Finding 10.1 — ReelsController.archive uses PATCH instead of POST
- **File:** `apps/api/src/modules/reels/reels.controller.ts`, lines 209-217
- **Code:** `@Patch(':id/archive')` and `@Patch(':id/unarchive')`
- **Issue:** Archive/unarchive are state transitions (actions), not partial updates. POST would be more semantically correct. Minor issue but inconsistent with other controllers (e.g., PostsController uses `@Post(':id/archive')`).
- **Severity:** Info

### Finding 10.2 — ScholarQAController.startSession uses PUT instead of POST
- **File:** `apps/api/src/modules/scholar-qa/scholar-qa.controller.ts`, lines 79-83
- **Code:** `@Put(':id/start')` and `@Put(':id/end')`
- **Issue:** Starting/ending a session is an action, not an idempotent replacement. POST would be more semantically correct. PUT implies replacing the resource.
- **Severity:** Info

### Finding 10.3 — ScholarQAController.markAnswered uses PUT instead of PATCH
- **File:** `apps/api/src/modules/scholar-qa/scholar-qa.controller.ts`, lines 93-96
- **Code:** `@Put(':id/questions/:qid/answered')`
- **Issue:** Marking a question as answered is a partial state change, not a full replacement. PATCH would be more appropriate.
- **Severity:** Info

### Finding 10.4 — CommunitiesController.leave uses DELETE instead of POST
- **File:** `apps/api/src/modules/communities/communities.controller.ts`, lines 96-107
- **Code:** `@Delete(':id/leave')`
- **Issue:** "Leaving" is an action, not deleting a resource. POST would be more semantically correct. DELETE `/:id/leave` reads oddly — you're not deleting the "leave". Compare with `@Post(':id/join')` which correctly uses POST.
- **Severity:** Info

---

## CATEGORY 11: @ApiTags Inconsistency

### Finding 11.1 — ReelsController uses lowercase tag
- **File:** `apps/api/src/modules/reels/reels.controller.ts`, line 12
- **Code:** `@ApiTags('reels')` — lowercase
- **Issue:** All other controllers use Title Case for tags (e.g., `'Posts (Saf)'`, `'Threads (Majlis)'`, `'Videos (Minbar)'`). `'reels'` is the only lowercase tag, making it sort differently in Swagger UI.
- **Severity:** Low

### Finding 11.2 — VideoRepliesController uses lowercase hyphenated tag
- **File:** `apps/api/src/modules/video-replies/video-replies.controller.ts`, line 18
- **Code:** `@ApiTags('video-replies')` — lowercase kebab-case
- **Issue:** Inconsistent with the Title Case convention used everywhere else.
- **Severity:** Low

### Finding 11.3 — No space/module suffix convention
- **Issue:** Some tags indicate the space (e.g., `'Posts (Saf)'`, `'Threads (Majlis)'`, `'Stories (Saf)'`, `'Videos (Minbar)'`, `'Playlists (Minbar)'`, `'Channels (Minbar)'`, `'Messages (Risalah)'`, `'Chat Export (Risalah)'`, `'Reel Templates (Bakra)'`), but most don't. For example, `'Broadcast Channels'`, `'Audio Rooms'`, `'Live Sessions'` have no space suffix. This makes it harder to understand which space an API belongs to.
- **Severity:** Low

---

## CATEGORY 12: Controllers with Empty Route Prefix (shared namespace collision risk)

### Finding 12.1 — CommerceController uses empty @Controller() prefix
- **File:** `apps/api/src/modules/commerce/commerce.controller.ts`, line 18
- **Code:** `@Controller()` — no route prefix
- **Issue:** Routes like `products`, `orders`, `businesses`, `zakat/funds`, `treasury`, `premium/status` are all at the root level. This could collide with other controllers. For example, if a `ProductsController` is ever added, routes would conflict.
- **Severity:** Low

### Finding 12.2 — GamificationController uses empty @Controller() prefix
- **File:** `apps/api/src/modules/gamification/gamification.controller.ts`, line 19
- **Code:** `@Controller()` — no route prefix
- **Issue:** Routes like `streaks`, `xp`, `achievements`, `leaderboard`, `challenges`, `series` are all at root level. `series` could easily conflict with a future SeriesController.
- **Severity:** Low

### Finding 12.3 — CommunityController uses empty @Controller() prefix
- **File:** `apps/api/src/modules/community/community.controller.ts`, line 19
- **Code:** `@Controller()` — no route prefix
- **Issue:** Routes like `boards`, `mentorship`, `study-circles`, `fatwa`, `volunteer`, `events`, `voice-posts`, `watch-parties`, `collections`, `waqf` are at root level. `events` directly conflicts with the EventsController (`api/v1/events` — though that one has the double-prefix bug).
- **Severity:** Medium (actual route collision risk with events)

### Finding 12.4 — DiscordFeaturesController uses empty @Controller() prefix
- **File:** `apps/api/src/modules/discord-features/discord-features.controller.ts`, line 17
- **Code:** `@Controller()` — no route prefix
- **Issue:** Routes like `circles/:circleId/forum`, `forum/:threadId`, `webhooks/:token/execute`, `stage/:id/start` are at root level.
- **Severity:** Low

### Finding 12.5 — TelegramFeaturesController uses empty @Controller() prefix
- **File:** `apps/api/src/modules/telegram-features/telegram-features.controller.ts`, line 17
- **Code:** `@Controller()` — no route prefix
- **Issue:** Routes like `saved-messages`, `chat-folders`, `conversations/:id/slow-mode`, `topics/:id`, `emoji-packs` are at root level. `conversations/:id/slow-mode` could conflict with MessagesController conversation routes.
- **Severity:** Medium

### Finding 12.6 — LegalController uses empty @Controller() prefix
- **File:** `apps/api/src/modules/health/legal.controller.ts`, line 7
- **Code:** `@Controller()` — no route prefix
- **Issue:** Routes `privacy-policy` and `terms-of-service` are at root level.
- **Severity:** Low

### Finding 12.7 — OgController uses empty @Controller() prefix
- **File:** `apps/api/src/modules/og/og.controller.ts`, line 8
- **Code:** `@Controller()` — no route prefix
- **Issue:** Routes like `og/post/:id`, `sitemap.xml`, `robots.txt`, `landing` are at root level.
- **Severity:** Low

---

## CATEGORY 13: class-level @ApiBearerAuth Masking Public Endpoints

### Finding 13.1 — ReelsController class-level @ApiBearerAuth misleads
- **File:** `apps/api/src/modules/reels/reels.controller.ts`, line 13
- **Code:** `@ApiBearerAuth()` at class level, but multiple endpoints use `OptionalClerkAuthGuard` (feed, trending, user reels, audio track reels, getById, comments, duets, stitches, view, shareLink)
- **Issue:** Swagger shows a lock icon on ALL endpoints, making it look like authentication is required. In reality, 10+ endpoints are accessible without auth. This will mislead API consumers into thinking they need a token for public endpoints.
- **Severity:** Medium

### Finding 13.2 — FeedController class-level @ApiBearerAuth misleads
- **File:** `apps/api/src/modules/feed/feed.controller.ts`, line 13
- **Code:** `@ApiBearerAuth()` at class level, but 6 endpoints use `OptionalClerkAuthGuard` (personalized, trending, featured, suggested-users, nearby, enhanced-search)
- **Issue:** Same problem — Swagger shows all endpoints as requiring auth when many are public.
- **Severity:** Medium

### Finding 13.3 — HalalController class-level @ApiBearerAuth misleads
- **File:** `apps/api/src/modules/halal/halal.controller.ts`, line 32
- **Code:** `@ApiBearerAuth()` at class level, but findNearby, getById, getReviews use `OptionalClerkAuthGuard`
- **Issue:** Public restaurant search shows as requiring auth.
- **Severity:** Medium

### Finding 13.4 — MosquesController class-level @ApiBearerAuth misleads
- **File:** `apps/api/src/modules/mosques/mosques.controller.ts`, line 31
- **Code:** `@ApiBearerAuth()` at class level, but findNearby, getById, getFeed, getMembers use `OptionalClerkAuthGuard`
- **Issue:** Public mosque search shows as requiring auth.
- **Severity:** Medium

### Finding 13.5 — ScholarQAController class-level @ApiBearerAuth misleads
- **File:** `apps/api/src/modules/scholar-qa/scholar-qa.controller.ts`, line 23
- **Code:** `@ApiBearerAuth()` at class level, but upcoming, recordings, getById use `OptionalClerkAuthGuard`
- **Issue:** Public Q&A browsing shows as requiring auth.
- **Severity:** Medium

### Finding 13.6 — CommunityNotesController class-level @ApiBearerAuth misleads
- **File:** `apps/api/src/modules/community-notes/community-notes.controller.ts`, line 22
- **Code:** `@ApiBearerAuth()` at class level, but getNotesForContent and getHelpfulNotes use `OptionalClerkAuthGuard`
- **Issue:** Public community notes show as requiring auth.
- **Severity:** Medium

### Finding 13.7 — VideoRepliesController class-level @ApiBearerAuth misleads
- **File:** `apps/api/src/modules/video-replies/video-replies.controller.ts`, line 19
- **Code:** `@ApiBearerAuth()` at class level, but getByComment and getById use `OptionalClerkAuthGuard`
- **Issue:** Public video reply browsing shows as requiring auth.
- **Severity:** Medium

---

## CATEGORY 14: Auth Webhooks Controllers with Conflicting Route Names

### Finding 14.1 — Two WebhooksControllers with same route prefix
- **File 1:** `apps/api/src/modules/auth/webhooks.controller.ts`, line 23 — `@Controller('webhooks')` (Clerk webhook)
- **File 2:** `apps/api/src/modules/webhooks/webhooks.controller.ts`, line 10 — `@Controller('webhooks')` (user-facing webhooks)
- **Issue:** Both controllers share the same `webhooks` route prefix. NestJS handles this because their sub-routes don't collide (`POST clerk` vs `POST /`, `GET /`, `DELETE :id`, `POST :id/test`), but in Swagger they both appear under different `@ApiTags` which is confusing. The Clerk webhook is tagged "Webhooks" and the user webhooks are also tagged "Webhooks". Swagger consumers cannot distinguish between these.
- **Severity:** Medium

---

## CATEGORY 15: Missing @ApiParam Documentation

### Finding 15.1 — Only IslamicController uses @ApiParam
- **File:** `apps/api/src/modules/islamic/islamic.controller.ts`
- **Issue:** Out of 82 controllers, only `islamic.controller.ts` uses `@ApiParam` to document path parameters (e.g., `@ApiParam({ name: 'id', description: 'Hadith ID (1-40)', example: 1 })`). All other controllers have undocumented path parameters — Swagger shows parameter names but no descriptions, examples, or type information for `:id`, `:userId`, `:postId`, etc.
- **Severity:** Medium

---

## CATEGORY 16: Query Parameters Documented Inconsistently

### Finding 16.1 — Only 7 controllers use @ApiQuery
- **Issue:** Out of 82 controllers, only these use `@ApiQuery` for query parameter documentation:
  1. `threads.controller.ts` (2 params on trending)
  2. `reels.controller.ts` (2 params on trending)
  3. `feed.controller.ts` (multiple endpoints, well-documented)
  4. `islamic.controller.ts` (multiple endpoints)
  5. `halal.controller.ts` (6 params on findNearby)
  6. `mosques.controller.ts` (3 params on findNearby, cursor on feed/members)
  7. `community-notes.controller.ts` (none actually)

  The remaining controllers with query parameters (cursor, limit, type, filter, category, search, q, lat, lng, etc.) have zero `@ApiQuery` documentation.
- **Severity:** Medium

---

## SUMMARY STATISTICS

| Category | Count | Severity |
|----------|-------|----------|
| Swagger setup issues | 3 | Medium-High |
| Missing @ApiTags | 1 | Medium |
| Missing @ApiBearerAuth on auth endpoints | 6 controllers (~90 endpoints) | High |
| Missing @ApiOperation | 14 endpoints (2 controllers) | Medium |
| Double-prefix route bugs (in Swagger paths) | 6 controllers | Critical |
| Inline DTOs missing @ApiProperty | 25+ DTOs | Medium-High |
| Missing @ApiResponse decorators | 67 controllers | High |
| Inline body types with no Swagger schema | 33+ endpoints | Low-Medium |
| Missing pagination documentation | ~60 endpoints | Medium |
| Wrong HTTP method semantics | 4 endpoints | Info |
| Inconsistent @ApiTags naming | 3 findings | Low |
| Empty route prefix collision risk | 7 controllers | Low-Medium |
| Class-level @ApiBearerAuth masking public endpoints | 7 controllers | Medium |
| Conflicting controller route names | 1 pair | Medium |
| Missing @ApiParam | 81 controllers | Medium |
| Missing @ApiQuery | 75 controllers | Medium |

### Top 10 Worst-Documented Controllers (by finding density)
1. **SearchController** — 9/9 endpoints missing @ApiOperation, no @ApiBearerAuth, no @ApiResponse, no @ApiQuery
2. **ClipsController** — Missing @ApiTags + @ApiBearerAuth + @ApiOperation on all 5 endpoints
3. **CommerceController** — No @ApiBearerAuth on 17 authenticated endpoints, empty @Controller prefix
4. **CommunityController** — No @ApiBearerAuth on 25 endpoints, empty @Controller prefix
5. **GamificationController** — No @ApiBearerAuth on 20 endpoints, empty @Controller prefix, DTOs inline
6. **DiscordFeaturesController** — No @ApiBearerAuth on 14 endpoints, empty @Controller prefix
7. **AiController** — No @ApiBearerAuth on 11 endpoints
8. **PaymentsController** — DTOs have no @ApiProperty AND no validation (financial endpoints!)
9. **MonetizationController** — DTOs have no @ApiProperty AND no validation
10. **GiftsController** — DTOs have no @ApiProperty AND no validation (virtual currency!)

### Top 5 Best-Documented Controllers
1. **IslamicController** — Has @ApiResponse, @ApiParam, @ApiQuery, @ApiProperty on inline DTOs
2. **EventsController** — Uses ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse, DTOs with @ApiProperty
3. **TwoFactorController** — Has @ApiResponse for all endpoints, DTOs with @ApiProperty
4. **PollsController** — Has @ApiResponse for all endpoints, some @ApiQuery
5. **EncryptionController** — DTOs with @ApiProperty, all endpoints have @ApiOperation

### Estimated Swagger Documentation Coverage
- **@ApiTags coverage:** 81/82 controllers (98.8%)
- **@ApiOperation coverage:** ~880/~920 endpoints (95.7%) — SearchController + ClipsController drag this down
- **@ApiBearerAuth coverage:** ~750/~920 endpoints (81.5%) — 6 controllers with ~90 undocumented auth endpoints
- **@ApiResponse coverage:** ~80/~920 endpoints (8.7%) — Only 15 controllers use any response documentation
- **@ApiProperty on DTOs:** ~40% of inline DTOs have it, ~20% of separate DTO files have it
- **@ApiQuery for pagination:** ~20/~80 paginated endpoints (25%)
- **@ApiParam coverage:** ~10/~200 parameterized routes (5%)

**Overall Swagger documentation quality: 3/10** — The Swagger UI exists and most endpoints show up with basic info, but the documentation is not useful for actual API integration. Request bodies are largely undocumented, response schemas are completely missing, error cases are almost never documented, and authentication requirements are misleading on many public endpoints.
