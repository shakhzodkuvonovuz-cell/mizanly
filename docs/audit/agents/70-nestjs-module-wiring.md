# Agent #70 — NestJS Module Wiring Audit

**Scope:** All 79 module files (`apps/api/src/modules/**/*.module.ts`), root `app.module.ts`, 6 common/infrastructure modules, 85 service files, 5 queue processors, 1 WebSocket gateway.

**Date:** 2026-03-21

**Total Findings: 29**
- P0 (Ship Blocker): 2
- P1 (Critical): 5
- P2 (Significant): 7
- P3 (Minor/Code Quality): 15

---

## P0 — SHIP BLOCKERS

### P0-1: Six controllers have DOUBLE route prefix — endpoints completely unreachable

**Files affected:**
- `apps/api/src/modules/bookmarks/bookmarks.controller.ts` line 25: `@Controller('api/v1/bookmarks')`
- `apps/api/src/modules/downloads/downloads.controller.ts` line 25: `@Controller('api/v1/downloads')`
- `apps/api/src/modules/events/events.controller.ts` line 157: `@Controller('api/v1/events')`
- `apps/api/src/modules/embeddings/embeddings.controller.ts` line 8: `@Controller('api/v1/embeddings')`
- `apps/api/src/modules/reports/reports.controller.ts` line 23: `@Controller('api/v1/reports')`
- `apps/api/src/modules/retention/retention.controller.ts` line 9: `@Controller('api/v1/retention')`

**Root cause:** `apps/api/src/main.ts` line 60:
```ts
app.setGlobalPrefix('api/v1');
```
This applies `api/v1/` to ALL controllers automatically. The 6 controllers above also hardcode `api/v1/` in their `@Controller()` decorator, resulting in the actual route being `api/v1/api/v1/bookmarks`, `api/v1/api/v1/downloads`, etc.

**Impact:** All endpoints in these 6 controllers are unreachable at their expected URLs. Mobile clients hitting `api/v1/bookmarks` get 404. The actual endpoints exist at `api/v1/api/v1/bookmarks` which nobody knows about.

**Controllers affected:** 6 of 82 registered controllers (7.3%)

**Fix:** Remove the `api/v1/` prefix from these 6 controller decorators:
- `@Controller('api/v1/bookmarks')` -> `@Controller('bookmarks')`
- `@Controller('api/v1/downloads')` -> `@Controller('downloads')`
- `@Controller('api/v1/events')` -> `@Controller('events')`
- `@Controller('api/v1/embeddings')` -> `@Controller('embeddings')`
- `@Controller('api/v1/reports')` -> `@Controller('reports')`
- `@Controller('api/v1/retention')` -> `@Controller('retention')`

---

### P0-2: WebhooksModule NOT imported in AppModule — webhook CRUD endpoints are dead code

**File:** `apps/api/src/modules/webhooks/webhooks.module.ts` (entire module)
**Absent from:** `apps/api/src/app.module.ts`

```ts
// webhooks.module.ts
@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService, PrismaService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
```

The WebhooksModule provides webhook CRUD operations (create, list, delete, test) at `@Controller('webhooks')`. It is a complete module with controller, service, tests, and exports. However, it is NOT in the `imports` array of `AppModule` (line 97-188 of app.module.ts).

**Impact:** The WebhooksController's 4 endpoints (POST /, GET /, DELETE /:id, POST /:id/test) are never registered with NestJS. Any mobile client or API consumer trying to manage webhooks via these endpoints gets 404.

**Note:** There is ALSO a `WebhooksController` in `apps/api/src/modules/auth/webhooks.controller.ts` (for Clerk webhook reception) that IS registered via AuthModule. The discord-features module also has its own webhook management methods. The standalone WebhooksModule appears to be an intended separate webhook management API that was never wired in.

**Fix:** Add `WebhooksModule` to AppModule imports. Before doing so, resolve the route collision with auth's WebhooksController (both use `@Controller('webhooks')`). Either rename the standalone one to `@Controller('webhook-endpoints')` or nest it under a different path.

---

## P1 — CRITICAL

### P1-1: WebhooksModule creates duplicate PrismaService instance — separate DB connection pool

**File:** `apps/api/src/modules/webhooks/webhooks.module.ts` line 8

```ts
providers: [WebhooksService, PrismaService],
```

PrismaModule is `@Global()` (defined at `apps/api/src/config/prisma.module.ts` lines 4-9). Directly listing `PrismaService` in providers creates a NEW instance of PrismaService local to this module, with its own Prisma Client and database connection pool. This bypasses the global singleton.

**Impact:** If this module were ever imported into AppModule, it would create a second database connection pool, potentially causing connection exhaustion and data inconsistency (separate Prisma clients don't share transaction contexts).

**Fix:** Remove `PrismaService` from providers. It's already available globally:
```ts
@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
```

---

### P1-2: IslamicNotificationsService exists but is NOT registered in IslamicModule — completely dead code

**Service file:** `apps/api/src/modules/islamic/islamic-notifications.service.ts` line 11
```ts
@Injectable()
export class IslamicNotificationsService {
```

**Module file:** `apps/api/src/modules/islamic/islamic.module.ts`:
```ts
@Module({
  imports: [PrismaModule],
  controllers: [IslamicController],
  providers: [IslamicService],   // <-- IslamicNotificationsService NOT listed
  exports: [IslamicService],
})
```

The service requires `PrismaService` and `@Inject('REDIS')` Redis in its constructor (lines 14-17). It provides prayer-time-aware notification scheduling, prayer time reminders, and Ramadan notifications. None of this functionality is available at runtime.

**Impact:** Prayer time notifications, Ramadan reminders, and all Islamic notification features are dead code. The service file exists, has tests, but NestJS will never instantiate it.

**Test file:** `apps/api/src/modules/islamic/islamic-notifications.service.spec.ts` — tests pass only because they manually construct the service in the test module, bypassing the real module wiring.

---

### P1-3: ContentSafetyService exists but is NOT registered in ModerationModule — dead code

**Service file:** `apps/api/src/modules/moderation/content-safety.service.ts` line 12
```ts
@Injectable()
export class ContentSafetyService {
```

**Module file:** `apps/api/src/modules/moderation/moderation.module.ts`:
```ts
@Module({
  imports: [AiModule],
  controllers: [ModerationController],
  providers: [ModerationService],   // <-- ContentSafetyService NOT listed
  exports: [ModerationService],
})
```

The service requires `PrismaService`, `ConfigService`, and `@Inject('REDIS')` Redis. It provides content safety scanning, hate speech detection, and automated content flagging separate from the AI-based moderation.

**Impact:** The content safety layer (which provides Redis-cached moderation decisions and multi-signal analysis) is completely unused. Only the basic AI moderation via `ModerationService` works.

---

### P1-4: StripeConnectService exists but is NOT registered in MonetizationModule — dead code

**Service file:** `apps/api/src/modules/monetization/stripe-connect.service.ts` line 14
```ts
export class StripeConnectService {
```

**Module file:** `apps/api/src/modules/monetization/monetization.module.ts`:
```ts
@Module({
  controllers: [MonetizationController],
  providers: [MonetizationService],   // <-- StripeConnectService NOT listed
  exports: [MonetizationService],
})
```

The service handles Stripe Connect onboarding (account creation, onboarding links, payout initiation) for creator monetization. Without it being registered, creators cannot:
- Create Stripe Connect accounts
- Complete onboarding
- Receive payouts

**Impact:** All creator payout functionality is dead. The MonetizationService handles tips and subscriptions at the data level, but the actual Stripe Connect integration for paying out to creators is unreachable.

---

### P1-5: search-indexing queue has no processor — all search index jobs silently lost

**File:** `apps/api/src/common/queue/queue.module.ts` line 34
```ts
{ name: 'search-indexing', token: 'QUEUE_SEARCH_INDEXING' },
```

**Queue service:** `apps/api/src/common/queue/queue.service.ts` line 19
```ts
@Inject('QUEUE_SEARCH_INDEXING') private searchQueue: Queue,
```

A BullMQ Queue named `search-indexing` is created and a `QueueService` method enqueues jobs to it, but there is NO corresponding processor (Worker) class. The 5 processors that exist are:
1. `NotificationProcessor` — handles `notifications` queue
2. `MediaProcessor` — handles `media-processing` queue
3. `WebhookProcessor` — handles `webhooks` queue
4. `AnalyticsProcessor` — handles `analytics` queue
5. `AiTasksProcessor` — handles `ai-tasks` queue

No `SearchIndexingProcessor` exists anywhere in the codebase.

**Impact:** Any code that calls `queueService.addSearchIndexJob(...)` (if it exists) will enqueue a job that sits in Redis forever with no worker to process it. Search indexes are never updated asynchronously.

---

## P2 — SIGNIFICANT

### P2-1: Route collision between auth WebhooksController and standalone WebhooksController

**File 1:** `apps/api/src/modules/auth/webhooks.controller.ts` line 23
```ts
@Controller('webhooks')
```
Registered via `AuthModule` (line 5 of auth.module.ts: `controllers: [AuthController, WebhooksController]`).

**File 2:** `apps/api/src/modules/webhooks/webhooks.controller.ts` line 10
```ts
@Controller('webhooks')
```
Currently NOT registered (module not in AppModule), but would collide if added.

Both use the `webhooks` route prefix. If WebhooksModule were ever added to AppModule, NestJS would register both controllers on the same prefix, causing route ambiguity. The auth controller has `POST webhooks/clerk` and the standalone has `POST webhooks/` (no sub-path), `GET webhooks/`, `DELETE webhooks/:id`, `POST webhooks/:id/test`. NestJS doesn't crash on this, but route matching becomes unpredictable.

---

### P2-2: EmailModule (@Global) NOT imported in AppModule — email sending impossible

**File:** `apps/api/src/common/services/email.module.ts`
```ts
@Global()
@Module({
  imports: [ConfigModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
```

**NOT in:** `apps/api/src/app.module.ts` imports array.

Even though this module is `@Global()`, the decorator only means "don't need to import it in consuming modules" — the module ITSELF still needs to be imported somewhere in the module tree (typically AppModule). Without that, EmailService is never instantiated and cannot be injected.

**Impact:** Email sending (via Resend) is completely dead. No verification emails, no password reset emails, no notification emails. The service at `apps/api/src/common/services/email.service.ts` exists and is fully implemented but never loads.

---

### P2-3: job-queue.service.ts is orphaned dead code — superseded by BullMQ QueueModule

**File:** `apps/api/src/common/services/job-queue.service.ts`

This is a standalone Redis-based job queue implementation with its own worker pattern. It was superseded by the BullMQ-based `QueueModule` (`apps/api/src/common/queue/queue.module.ts`). The file:
- Is `@Injectable()` but not registered in any module's providers
- Not imported by any other file
- Provides identical functionality to the BullMQ QueueService
- Uses raw Redis commands for job management (LPUSH/RPOP pattern)

**Impact:** 120+ lines of dead code. Not harmful but confusing for developers who might try to use it instead of QueueService.

---

### P2-4: Webhook management duplicated across 2 modules — feature fragmentation

**Module 1:** `apps/api/src/modules/webhooks/webhooks.service.ts` (standalone, dead)
- CRUD operations on `prisma.webhook` model
- Create with HMAC-SHA256 secret generation
- List, delete, test delivery

**Module 2:** `apps/api/src/modules/discord-features/discord-features.service.ts` lines 92-128
- Also manages `prisma.webhook` model
- Create webhooks (with token generation, max 15 per community)
- Get webhooks, delete webhooks, execute webhooks

Both operate on the same Prisma `Webhook` model but with different business logic:
- Standalone uses `secret` field for HMAC signing
- Discord-features uses `token` field for webhook execution

**Impact:** Two competing webhook implementations. If both were active, they could create inconsistent webhook records. The Discord-features version is active (module is in AppModule). The standalone version is dead but would conflict if enabled.

---

### P2-5: 22 modules redundantly import PrismaModule despite it being @Global

**Files affected:**
1. `apps/api/src/modules/feed/feed.module.ts` — `imports: [PrismaModule, ...]`
2. `apps/api/src/modules/community/community.module.ts` — `imports: [PrismaModule]`
3. `apps/api/src/modules/channel-posts/channel-posts.module.ts` — `imports: [PrismaModule]`
4. `apps/api/src/modules/clips/clips.module.ts` — `imports: [PrismaModule]`
5. `apps/api/src/modules/discord-features/discord-features.module.ts` — `imports: [PrismaModule]`
6. `apps/api/src/modules/calls/calls.module.ts` — `imports: [PrismaModule]`
7. `apps/api/src/modules/embeddings/embeddings.module.ts` — `imports: [PrismaModule]`
8. `apps/api/src/modules/broadcast/broadcast.module.ts` — `imports: [PrismaModule]`
9. `apps/api/src/modules/collabs/collabs.module.ts` — `imports: [PrismaModule]`
10. `apps/api/src/modules/commerce/commerce.module.ts` — `imports: [PrismaModule]`
11. `apps/api/src/modules/gamification/gamification.module.ts` — `imports: [PrismaModule]`
12. `apps/api/src/modules/audio-tracks/audio-tracks.module.ts` — `imports: [PrismaModule]`
13. `apps/api/src/modules/hashtags/hashtags.module.ts` — `imports: [PrismaModule]`
14. `apps/api/src/modules/islamic/islamic.module.ts` — `imports: [PrismaModule]`
15. `apps/api/src/modules/live/live.module.ts` — `imports: [PrismaModule]`
16. `apps/api/src/modules/retention/retention.module.ts` — `imports: [PrismaModule, ...]`
17. `apps/api/src/modules/ai/ai.module.ts` — `imports: [PrismaModule]`
18. `apps/api/src/modules/playlists/playlists.module.ts` — `imports: [PrismaModule]`
19. `apps/api/src/modules/payments/payments.module.ts` — `imports: [PrismaModule, ...]`
20. `apps/api/src/modules/reports/reports.module.ts` — `imports: [PrismaModule, ...]`
21. `apps/api/src/modules/stickers/stickers.module.ts` — `imports: [PrismaModule]`
22. `apps/api/src/modules/telegram-features/telegram-features.module.ts` — `imports: [PrismaModule]`

**Root cause:** `PrismaModule` is declared `@Global()` at `apps/api/src/config/prisma.module.ts` line 4. Global modules only need to be imported once (in AppModule, which does import it on line 109). Importing them again in child modules is harmless but redundant — NestJS silently ignores the duplicate import.

**Impact:** Not a bug. Just unnecessary code. 22 import statements and 22 import references that serve no purpose. Creates false impression that PrismaModule needs explicit importing.

---

### P2-6: RedisModule also redundantly imported in 3 modules

**Files affected:**
1. `apps/api/src/modules/feed/feed.module.ts` — `imports: [PrismaModule, RedisModule, ...]`
2. `apps/api/src/modules/retention/retention.module.ts` — `imports: [PrismaModule, RedisModule]`
3. `apps/api/src/modules/payments/payments.module.ts` — `imports: [PrismaModule, RedisModule]`

`RedisModule` is `@Global()` at `apps/api/src/config/redis.module.ts` line 32. Same situation as PrismaModule — redundant but harmless.

---

### P2-7: ReportsModule redundantly imports QueueModule despite it being @Global

**File:** `apps/api/src/modules/reports/reports.module.ts` line 8
```ts
imports: [PrismaModule, QueueModule],
```

`QueueModule` is `@Global()` at `apps/api/src/common/queue/queue.module.ts` line 66. This import is unnecessary.

---

## P3 — MINOR / CODE QUALITY

### P3-1: Inconsistent module structure — some modules have empty `imports: []` arrays

**Files:**
- `apps/api/src/modules/majlis-lists/majlis-lists.module.ts` line 6: `imports: []`
- `apps/api/src/modules/polls/polls.module.ts` line 6: `imports: []`
- `apps/api/src/modules/audio-rooms/audio-rooms.module.ts` line 6: `imports: []`
- `apps/api/src/modules/communities/communities.module.ts` line 6: `imports: []`

Empty `imports: []` is functionally identical to omitting the property entirely. Most other modules (e.g., BlocksModule, MutesModule, SettingsModule) simply omit `imports` when there are no dependencies.

---

### P3-2: Inconsistent export patterns — 8 modules don't export their services

**Files without exports:**
1. `apps/api/src/modules/admin/admin.module.ts` — AdminService not exported
2. `apps/api/src/modules/privacy/privacy.module.ts` — PrivacyService not exported
3. `apps/api/src/modules/og/og.module.ts` — OgService not exported
4. `apps/api/src/modules/halal/halal.module.ts` — HalalService not exported
5. `apps/api/src/modules/mosques/mosques.module.ts` — MosquesService not exported
6. `apps/api/src/modules/scholar-qa/scholar-qa.module.ts` — ScholarQAService not exported
7. `apps/api/src/modules/community-notes/community-notes.module.ts` — CommunityNotesService not exported
8. `apps/api/src/modules/checklists/checklists.module.ts` — ChecklistsService not exported

Currently none of these services are consumed by other modules, so the missing exports don't cause runtime errors. However, if another module ever needs to use them (e.g., AdminService in a moderation flow), it would fail with a NestJS injection error.

**Recommendation:** Add `exports: [XxxService]` to all modules as a defensive practice. The 71 modules that DO export are following the correct pattern.

---

### P3-3: HealthModule has no providers — controllers inject no services

**File:** `apps/api/src/modules/health/health.module.ts`
```ts
@Module({
  controllers: [HealthController, LegalController],
})
export class HealthModule {}
```

This module has 2 controllers but zero providers. HealthController likely hardcodes its health check logic. LegalController returns static JSON (privacy policy, ToS). While this works, it means these controllers cannot be extended to use services without modifying the module.

---

### P3-4: StripeWebhookController has unnecessary @Injectable() decorator

**File:** `apps/api/src/modules/payments/stripe-webhook.controller.ts` line 25
```ts
@Controller('payments/webhooks')
@SkipThrottle()
@Injectable()   // <-- unnecessary
export class StripeWebhookController {
```

Controllers are automatically injectable in NestJS. The `@Injectable()` decorator on a controller is harmless but misleading — it suggests the class is a provider, not a controller.

---

### P3-5: Module naming inconsistency — communities vs community

Two separate modules with similar names:
- `apps/api/src/modules/communities/communities.module.ts` -> `CommunitiesModule` — community management (circles, roles, permissions)
- `apps/api/src/modules/community/community.module.ts` -> `CommunityModule` (aliased as `CommunityV2Module` in app.module.ts line 78) — local boards, mentorship, study circles, fatwa Q&A, volunteering, events, voice posts, watch parties

The alias `CommunityV2Module` in app.module.ts suggests this was an intentional v2, but the naming is confusing. Both are active and serve different purposes.

---

### P3-6: QueueModule circular dependency risk — imports 3 feature modules

**File:** `apps/api/src/common/queue/queue.module.ts` lines 68-72
```ts
imports: [
  NotificationsModule,
  GamificationModule,
  AiModule,
],
```

QueueModule is `@Global()` and imports NotificationsModule, GamificationModule, and AiModule to provide their services to queue processor classes. If any of these 3 modules ever imports QueueModule (or QueueService), a circular dependency will occur.

Currently safe: none of these 3 modules reference QueueModule or QueueService. But this architectural pattern (global infrastructure module importing feature modules) is fragile.

**Recommendation:** Use `forwardRef()` or restructure processors into their own modules to avoid the tight coupling.

---

### P3-7: ChatGateway registered only in MessagesModule — not exported

**File:** `apps/api/src/modules/messages/messages.module.ts` line 7
```ts
providers: [MessagesService, ChatGateway], exports: [MessagesService]
```

ChatGateway is a provider but not exported. If any other module needs to access the WebSocket server instance (e.g., to broadcast events from other services), it cannot. Currently no other module needs it, but as the app grows, services like NotificationsService or LiveService might want to push real-time events via the gateway.

---

### P3-8: PostsService injects 9 dependencies — high coupling indicator

**File:** `apps/api/src/modules/posts/posts.service.ts` lines 64-74
```ts
constructor(
  private prisma: PrismaService,
  private notifications: NotificationsService,
  private pushTrigger: PushTriggerService,
  @Inject('REDIS') private redis: Redis,
  private gamification: GamificationService,
  private ai: AiService,
  private jobs: AsyncJobService,
  private queueService: QueueService,
  private analytics: AnalyticsService,
)
```

9 constructor dependencies is a code smell in NestJS. The service is doing too much (CRUD + notifications + push + caching + gamification + AI moderation + job scheduling + queue management + analytics).

**Similarly high-coupling services:**
- `ReelsService` (8 deps): PrismaService, Redis, NotificationsService, StreamService, GamificationService, AiService, AsyncJobService, QueueService
- `FollowsService` (6 deps): PrismaService, NotificationsService, PushTriggerService, AsyncJobService, QueueService, AnalyticsService
- `ThreadsService` (estimated 5-6 deps based on module imports)

---

### P3-9: PostsModule missing PushTriggerService import consideration

**File:** `apps/api/src/modules/posts/posts.module.ts`
```ts
imports: [NotificationsModule, GamificationModule, AiModule],
```

PostsService injects `PushTriggerService` directly. This works because `NotificationsModule` exports `PushTriggerService`. However, this creates an implicit dependency — if NotificationsModule ever removes PushTriggerService from exports, PostsModule breaks silently. No explicit documentation of this dependency chain exists.

**Same applies to:** FollowsModule (injects PushTriggerService via NotificationsModule), MessagesModule (injects PushTriggerService via NotificationsModule).

---

### P3-10: No forwardRef usage anywhere — NestJS circular dependency protection absent

**All 79 module files checked:** Zero instances of `forwardRef()`.

While there are currently no circular dependencies (verified by checking all import chains), the complete absence of `forwardRef()` means any accidental circular import will crash the application at startup with no helpful error message.

---

### P3-11: Mixed PrismaModule import patterns — inconsistent across 79 modules

The 79 modules fall into 3 categories for Prisma access:
1. **22 modules** explicitly import PrismaModule (redundant since it's @Global)
2. **56 modules** correctly rely on the global PrismaModule without importing it
3. **1 module** (WebhooksModule) directly provides PrismaService (incorrect)

This inconsistency makes it unclear to developers which pattern to follow.

---

### P3-12: No shared "core" feature module — cross-cutting services scattered

Services like NotificationsService, GamificationService, and AiService are imported by multiple feature modules (Posts, Threads, Reels, Videos, Stories). Each feature module independently imports these shared modules:

- `PostsModule` imports: NotificationsModule, GamificationModule, AiModule
- `ThreadsModule` imports: NotificationsModule, GamificationModule, AiModule
- `ReelsModule` imports: NotificationsModule, StreamModule, GamificationModule, AiModule
- `VideosModule` imports: NotificationsModule, StreamModule, GamificationModule
- `StoriesModule` imports: AiModule

A shared `ContentCoreModule` that exports all cross-cutting services would reduce duplication.

---

### P3-13: ConfigModule is not @Global but ConfigService is injectable everywhere

**File:** `apps/api/src/app.module.ts` line 107:
```ts
ConfigModule.forRoot({ isGlobal: true }),
```

`ConfigModule.forRoot({ isGlobal: true })` makes ConfigService available globally. This is correct. But some modules (e.g., EmailModule at `apps/api/src/common/services/email.module.ts` line 7) explicitly `imports: [ConfigModule]` — redundant given the global flag. Minor inconsistency.

---

### P3-14: Test files create their own module wiring — can diverge from real wiring

Example from `apps/api/src/modules/islamic/islamic-notifications.service.spec.ts`:
```ts
const module = await Test.createTestingModule({
  providers: [
    IslamicNotificationsService,
    { provide: PrismaService, useValue: mockPrisma },
    { provide: 'REDIS', useValue: mockRedis },
  ],
}).compile();
```

Tests manually create modules with the service as a provider, which passes even though the service is NOT in the real IslamicModule. The same applies to ContentSafetyService and StripeConnectService tests. This creates a false sense of correctness.

**Impact:** Tests pass but the service is dead in production. 3 confirmed cases where tests mask module wiring bugs.

---

### P3-15: AppModule imports 84 modules on a single flat level — no module hierarchy

**File:** `apps/api/src/app.module.ts` lines 97-188

The imports array has 84 entries (6 infrastructure + 78 feature modules) in a flat list. NestJS handles this fine, but it makes the module dependency graph hard to reason about. Grouping related modules (e.g., a `ContentModule` wrapping Posts, Threads, Reels, Stories, Videos) would improve maintainability.

---

## Summary Table

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| P0-1 | Ship Blocker | Double route prefix | 6 controllers use `api/v1/` in @Controller but global prefix also adds `api/v1/` — endpoints at double prefix |
| P0-2 | Ship Blocker | Missing import | WebhooksModule not in AppModule — webhook CRUD endpoints are dead |
| P1-1 | Critical | DI issue | WebhooksModule directly provides PrismaService instead of using global module |
| P1-2 | Critical | Dead service | IslamicNotificationsService not in IslamicModule providers |
| P1-3 | Critical | Dead service | ContentSafetyService not in ModerationModule providers |
| P1-4 | Critical | Dead service | StripeConnectService not in MonetizationModule providers |
| P1-5 | Critical | Missing processor | search-indexing queue has no Worker — jobs lost |
| P2-1 | Significant | Route collision | Two WebhooksControllers on same route prefix |
| P2-2 | Significant | Missing import | EmailModule (@Global) not in AppModule — email dead |
| P2-3 | Significant | Dead code | job-queue.service.ts orphaned, superseded by BullMQ |
| P2-4 | Significant | Duplication | Webhook management in 2 separate modules |
| P2-5 | Significant | Redundancy | 22 modules redundantly import @Global PrismaModule |
| P2-6 | Significant | Redundancy | 3 modules redundantly import @Global RedisModule |
| P2-7 | Significant | Redundancy | ReportsModule redundantly imports @Global QueueModule |
| P3-1 | Minor | Consistency | 4 modules have empty `imports: []` |
| P3-2 | Minor | Defensive | 8 modules don't export their services |
| P3-3 | Minor | Structure | HealthModule has 0 providers (controllers only) |
| P3-4 | Minor | Code quality | StripeWebhookController has unnecessary @Injectable() |
| P3-5 | Minor | Naming | communities vs community module naming confusion |
| P3-6 | Minor | Architecture | QueueModule circular dep risk (imports feature modules) |
| P3-7 | Minor | Exports | ChatGateway not exported from MessagesModule |
| P3-8 | Minor | Coupling | PostsService has 9 constructor dependencies |
| P3-9 | Minor | Implicit deps | PushTriggerService dependency chain not documented |
| P3-10 | Minor | Robustness | Zero forwardRef() usage in entire codebase |
| P3-11 | Minor | Consistency | Mixed PrismaModule import patterns |
| P3-12 | Minor | Architecture | No shared ContentCoreModule for cross-cutting services |
| P3-13 | Minor | Redundancy | ConfigModule imported in EmailModule despite being global |
| P3-14 | Minor | Test quality | 3 test files mask dead service wiring |
| P3-15 | Minor | Maintainability | 84 modules in flat AppModule imports |

---

## Module Wiring Verification Matrix

### All 79 Feature Modules — Import Status in AppModule

| # | Module Directory | Module Class | In AppModule? | Services Registered? | Notes |
|---|-----------------|-------------|---------------|---------------------|-------|
| 1 | admin | AdminModule | YES | AdminService | No exports |
| 2 | ai | AiModule | YES | AiService | Exported, used by 5 modules |
| 3 | alt-profile | AltProfileModule | YES | AltProfileService | 2 controllers |
| 4 | audio-rooms | AudioRoomsModule | YES | AudioRoomsService | Empty imports[] |
| 5 | audio-tracks | AudioTracksModule | YES | AudioTracksService | Redundant PrismaModule import |
| 6 | auth | AuthModule | YES | AuthService | 2 controllers (AuthController, WebhooksController) |
| 7 | blocks | BlocksModule | YES | BlocksService | Clean |
| 8 | bookmarks | BookmarksModule | YES | BookmarksService | **P0: Double prefix bug** |
| 9 | broadcast | BroadcastModule | YES | BroadcastService | Redundant PrismaModule import |
| 10 | calls | CallsModule | YES | CallsService | Redundant PrismaModule import |
| 11 | channel-posts | ChannelPostsModule | YES | ChannelPostsService | Redundant PrismaModule import |
| 12 | channels | ChannelsModule | YES | ChannelsService | Imports NotificationsModule |
| 13 | chat-export | ChatExportModule | YES | ChatExportService | Clean |
| 14 | checklists | ChecklistsModule | YES | ChecklistsService | No exports |
| 15 | circles | CirclesModule | YES | CirclesService | Clean |
| 16 | clips | ClipsModule | YES | ClipsService | Redundant PrismaModule import |
| 17 | collabs | CollabsModule | YES | CollabsService | Redundant PrismaModule import |
| 18 | commerce | CommerceModule | YES | CommerceService | Redundant PrismaModule import |
| 19 | communities | CommunitiesModule | YES | CommunitiesService | Empty imports[] |
| 20 | community | CommunityModule (as CommunityV2Module) | YES | CommunityService | Redundant PrismaModule import |
| 21 | community-notes | CommunityNotesModule | YES | CommunityNotesService | No exports |
| 22 | creator | CreatorModule | YES | CreatorService | Clean |
| 23 | devices | DevicesModule | YES | DevicesService | Imported by NotificationsModule |
| 24 | discord-features | DiscordFeaturesModule | YES | DiscordFeaturesService | Redundant PrismaModule import |
| 25 | downloads | DownloadsModule | YES | DownloadsService | **P0: Double prefix bug** |
| 26 | drafts | DraftsModule | YES | DraftsService | Clean |
| 27 | embeddings | EmbeddingsModule | YES | EmbeddingsService, EmbeddingPipelineService | Imported by Feed, Recommendations |
| 28 | encryption | EncryptionModule | YES | EncryptionService | Clean |
| 29 | events | EventsModule | YES | EventsService | **P0: Double prefix bug** |
| 30 | feed | FeedModule | YES | FeedService, FeedTransparencyService, PersonalizedFeedService | Redundant PrismaModule+RedisModule imports |
| 31 | follows | FollowsModule | YES | FollowsService | Imports NotificationsModule |
| 32 | gamification | GamificationModule | YES | GamificationService | Exported, used by 4+ modules |
| 33 | gifts | GiftsModule | YES | GiftsService | Clean |
| 34 | halal | HalalModule | YES | HalalService | No exports |
| 35 | hashtags | HashtagsModule | YES | HashtagsService | Redundant PrismaModule import |
| 36 | health | HealthModule | YES | (none) | 2 controllers, 0 providers |
| 37 | islamic | IslamicModule | YES | IslamicService | **P1: IslamicNotificationsService NOT registered** |
| 38 | live | LiveModule | YES | LiveService | Redundant PrismaModule import |
| 39 | majlis-lists | MajlisListsModule | YES | MajlisListsService | Empty imports[] |
| 40 | messages | MessagesModule | YES | MessagesService, ChatGateway | Imports NotificationsModule, AiModule |
| 41 | moderation | ModerationModule | YES | ModerationService | **P1: ContentSafetyService NOT registered** |
| 42 | monetization | MonetizationModule | YES | MonetizationService | **P1: StripeConnectService NOT registered** |
| 43 | mosques | MosquesModule | YES | MosquesService | No exports |
| 44 | mutes | MutesModule | YES | MutesService | Clean |
| 45 | notifications | NotificationsModule | YES | NotificationsService, PushService, PushTriggerService | Imports DevicesModule; exported to 5+ modules |
| 46 | og | OgModule | YES | OgService | No exports |
| 47 | parental-controls | ParentalControlsModule | YES | ParentalControlsService | Clean |
| 48 | payments | PaymentsModule | YES | PaymentsService | 2 controllers; redundant PrismaModule+RedisModule imports |
| 49 | playlists | PlaylistsModule | YES | PlaylistsService | Redundant PrismaModule import |
| 50 | polls | PollsModule | YES | PollsService | Empty imports[] |
| 51 | posts | PostsModule | YES | PostsService | Imports Notifications+Gamification+Ai |
| 52 | privacy | PrivacyModule | YES | PrivacyService | No exports |
| 53 | profile-links | ProfileLinksModule | YES | ProfileLinksService | Clean |
| 54 | promotions | PromotionsModule | YES | PromotionsService | Clean |
| 55 | recommendations | RecommendationsModule | YES | RecommendationsService | Imports EmbeddingsModule |
| 56 | reel-templates | ReelTemplatesModule | YES | ReelTemplatesService | Clean |
| 57 | reels | ReelsModule | YES | ReelsService | Imports Notifications+Stream+Gamification+Ai |
| 58 | reports | ReportsModule | YES | ReportsService | Redundant PrismaModule+QueueModule imports |
| 59 | restricts | RestrictsModule | YES | RestrictsService | Clean |
| 60 | retention | RetentionModule | YES | RetentionService | **P0: Double prefix bug**; redundant imports |
| 61 | scheduling | SchedulingModule | YES | SchedulingService | Clean |
| 62 | scholar-qa | ScholarQAModule | YES | ScholarQAService | No exports |
| 63 | search | SearchModule | YES | SearchService, MeilisearchService | Clean |
| 64 | settings | SettingsModule | YES | SettingsService | Clean |
| 65 | stickers | StickersModule | YES | StickersService | Redundant PrismaModule import |
| 66 | stories | StoriesModule | YES | StoriesService | Imports AiModule |
| 67 | story-chains | StoryChainsModule | YES | StoryChainsService | Clean |
| 68 | stream | StreamModule | YES | StreamService | Exported, used by Reels+Videos |
| 69 | subtitles | SubtitlesModule | YES | SubtitlesService | Clean |
| 70 | telegram-features | TelegramFeaturesModule | YES | TelegramFeaturesService | Redundant PrismaModule import |
| 71 | threads | ThreadsModule | YES | ThreadsService | Imports Notifications+Gamification+Ai |
| 72 | thumbnails | ThumbnailsModule | YES | ThumbnailsService | Clean |
| 73 | two-factor | TwoFactorModule | YES | TwoFactorService | Clean |
| 74 | upload | UploadModule | YES | UploadService | Clean |
| 75 | users | UsersModule | YES | UsersService | Clean |
| 76 | video-replies | VideoRepliesModule | YES | VideoRepliesService | Clean |
| 77 | videos | VideosModule | YES | VideosService | Imports Notifications+Stream+Gamification |
| 78 | watch-history | WatchHistoryModule | YES | WatchHistoryService | Clean |
| 79 | **webhooks** | **WebhooksModule** | **NO** | WebhooksService | **P0: Not imported, all endpoints dead** |

### Infrastructure Modules — Import Status

| Module | Location | @Global? | In AppModule? | Status |
|--------|----------|----------|---------------|--------|
| PrismaModule | config/prisma.module.ts | YES | YES | OK |
| RedisModule | config/redis.module.ts | YES | YES | OK |
| AsyncJobsModule | common/services/async-jobs.module.ts | YES | YES | OK |
| QueueModule | common/queue/queue.module.ts | YES | YES | OK — missing search-indexing processor |
| FeatureFlagsModule | common/services/feature-flags.module.ts | YES | YES | OK |
| AnalyticsModule | common/services/analytics.module.ts | YES | YES | OK |
| **EmailModule** | common/services/email.module.ts | YES | **NO** | **P2: Not imported, emails dead** |

### Dead Service Files (exist on disk, NOT in any module providers)

| Service | File | Expected Module | Status |
|---------|------|----------------|--------|
| IslamicNotificationsService | islamic/islamic-notifications.service.ts | IslamicModule | NOT registered |
| ContentSafetyService | moderation/content-safety.service.ts | ModerationModule | NOT registered |
| StripeConnectService | monetization/stripe-connect.service.ts | MonetizationModule | NOT registered |
| JobQueueService | common/services/job-queue.service.ts | (none) | Orphaned file, no module |
| EmailService | common/services/email.service.ts | EmailModule | Module exists but not in AppModule |
| WebhooksService | webhooks/webhooks.service.ts | WebhooksModule | Module exists but not in AppModule |
