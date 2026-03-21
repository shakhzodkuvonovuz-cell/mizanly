# Audit Agent #58 — Discord Feature Parity

**Scope:** All Discord-inspired features — forum threads, webhooks, stage sessions, voice channels, community roles, permission enforcement.

**Files audited (line by line):**
- `apps/api/src/modules/discord-features/discord-features.service.ts` (186 lines)
- `apps/api/src/modules/discord-features/discord-features.controller.ts` (144 lines)
- `apps/api/src/modules/discord-features/dto/discord-features.dto.ts` (34 lines)
- `apps/api/src/modules/discord-features/discord-features.module.ts` (12 lines)
- `apps/api/src/modules/discord-features/discord-features.service.spec.ts` (175 lines)
- `apps/api/src/modules/discord-features/discord-features.controller.spec.ts` (147 lines)
- `apps/api/src/modules/discord-features/discord-features.service.edge.spec.ts` (68 lines)
- `apps/api/src/modules/webhooks/webhooks.service.ts` (109 lines)
- `apps/api/src/modules/webhooks/webhooks.controller.ts` (42 lines)
- `apps/api/src/modules/webhooks/webhooks.module.ts` (11 lines)
- `apps/api/src/modules/webhooks/webhooks.service.spec.ts` (183 lines)
- `apps/api/src/modules/webhooks/webhooks.controller.spec.ts` (77 lines)
- `apps/api/src/modules/communities/communities.service.ts` (role management: lines 377-418)
- `apps/api/src/modules/communities/communities.controller.ts` (120 lines)
- `apps/api/src/modules/audio-rooms/audio-rooms.service.ts` (persistent voice: lines 498-510)
- `apps/api/src/modules/audio-rooms/audio-rooms.controller.ts` (139 lines)
- `apps/api/prisma/schema.prisma` (ForumThread, ForumReply, Webhook, StageSession, CommunityRole, AudioRoom models)

**Total findings: 42**

---

## CRITICAL (P0) — Ship Blockers

### Finding 1: `requireAdmin()` references `prisma.community` — model does not exist (RUNTIME CRASH)
**File:** `apps/api/src/modules/communities/communities.service.ts`
**Line:** 414
**Code:**
```ts
private async requireAdmin(communityId: string, userId: string) {
    const community = await this.prisma.community.findUnique({ where: { id: communityId } });
```
**Problem:** The Prisma model is `Circle`, not `Community`. There is no `model Community` in `schema.prisma`. This means `this.prisma.community` is `undefined`, and calling `.findUnique()` on it throws a runtime TypeError. This crashes ALL role management operations: `createRole()`, `updateRole()`, `deleteRole()`.
**Impact:** The entire granular role permissions system (Discord's core feature) is completely non-functional. Any call to create/update/delete a role will throw an unhandled error.
**Fix:** Change `this.prisma.community` to `this.prisma.circle` and adjust the where/select accordingly.

### Finding 2: WebhooksModule is NOT registered in AppModule — entire webhook delivery system is dead code
**File:** `apps/api/src/app.module.ts`
**Lines:** 96-187
**Problem:** The `WebhooksModule` (from `apps/api/src/modules/webhooks/`) is never imported in `app.module.ts`. The module contains the HMAC-SHA256 signed webhook delivery system (`deliver()`, `dispatch()`, `test()`), the retry logic with exponential backoff, and the proper outbound webhook controller. None of this is registered with NestJS, so:
- `WebhooksController` (`@Controller('webhooks')`) is never mounted
- `WebhooksService.dispatch()` is never callable from anywhere
- The entire HMAC delivery pipeline is dead code
**Impact:** No webhook events are ever dispatched to external endpoints. The webhook delivery feature is 100% non-functional despite having complete implementation code.
**Fix:** Add `WebhooksModule` to the imports in `app.module.ts`. But note: this will create a route conflict with `AuthModule`'s `WebhooksController` (see Finding 3).

### Finding 3: Dual `@Controller('webhooks')` route collision
**File 1:** `apps/api/src/modules/webhooks/webhooks.controller.ts`, line 10
**File 2:** `apps/api/src/modules/auth/webhooks.controller.ts`, line 23
**Code:**
```ts
// webhooks/webhooks.controller.ts
@Controller('webhooks')  // POST /api/v1/webhooks, GET /api/v1/webhooks, DELETE /api/v1/webhooks/:id

// auth/webhooks.controller.ts
@Controller('webhooks')  // POST /api/v1/webhooks/clerk
```
**Problem:** Both controllers use `@Controller('webhooks')` as their route prefix. If `WebhooksModule` is ever registered (fixing Finding 2), NestJS will have two controllers competing for the same route prefix. The `POST /api/v1/webhooks` route would conflict ambiguously.
**Impact:** If both modules are registered, the Clerk webhook receiver and the custom webhook create endpoint would collide. Currently masked because WebhooksModule is not registered.
**Fix:** Rename the webhooks module controller to `@Controller('community-webhooks')` or similar.

### Finding 4: `executeWebhook()` is a stub — does NOT create messages
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`
**Lines:** 117-129
**Code:**
```ts
async executeWebhook(token: string, dto: { content: string; username?: string; avatarUrl?: string }) {
    // ...
    await this.prisma.webhook.update({ where: { id: webhook.id }, data: { lastUsedAt: new Date() } });
    // In production, this would create a message in the target channel/conversation
    return { success: true, webhookId: webhook.id };
}
```
**Problem:** The execute endpoint accepts external webhook calls but does nothing with the content. The comment explicitly says "In production, this would create a message" — it never does. The `targetChannelId` field in the Webhook model is never used. The webhook execution is a no-op that returns `{ success: true }` without actually delivering any content.
**Impact:** External integrations (GitHub, CI/CD, etc.) that post to Mizanly webhooks will get `200 OK` but nothing happens. The entire webhook execution pipeline is fake.

---

## HIGH (P1) — Security & Authorization

### Finding 5: Forum thread creation has NO community membership check
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`
**Lines:** 13-18
**Code:**
```ts
async createForumThread(userId: string, circleId: string, dto: { title: string; content: string; tags?: string[] }) {
    return this.prisma.forumThread.create({
      data: { circleId, authorId: userId, title: dto.title, content: dto.content, tags: dto.tags || [] },
      include: { author: { select: USER_SELECT } },
    });
}
```
**Problem:** No check that `userId` is a member of the circle identified by `circleId`. Any authenticated user can create forum threads in ANY community, including private and invite-only ones.
**Impact:** Complete bypass of community privacy. A non-member can spam forum threads in private communities.
**Fix:** Add a `circleMember.findUnique()` check before creating the thread.

### Finding 6: Forum thread lock/pin has NO authorization — any user can lock/pin any thread
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`
**Lines:** 79-90
**Code:**
```ts
async lockForumThread(threadId: string, userId: string) {
    return this.prisma.forumThread.update({ where: { id: threadId }, data: { isLocked: true } });
}

async pinForumThread(threadId: string, userId: string) {
    const thread = await this.prisma.forumThread.findUnique({ where: { id: threadId } });
    if (!thread) throw new NotFoundException();
    return this.prisma.forumThread.update({
      where: { id: threadId },
      data: { isPinned: !thread.isPinned },
    });
}
```
**Problem:** The `userId` parameter is accepted but NEVER used. There is zero authorization — no check that the user is a moderator, admin, or even a member of the community. Any authenticated user can lock or pin any forum thread in any community.
**Impact:** Griefing attack: any user can lock all forum threads in a community, effectively shutting down discussion. Or pin arbitrary threads.
**Fix:** Add admin/moderator role check using `circleMember.findUnique()` before allowing lock/pin.

### Finding 7: Forum reply has no community membership check
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`
**Lines:** 45-61
**Problem:** `replyToForumThread()` checks if the thread exists and isn't locked, but never checks if the replying user is a member of the community the thread belongs to.
**Impact:** Any authenticated user can reply to forum threads in private communities they're not a member of.

### Finding 8: Webhook creation has no community membership/admin check
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`
**Lines:** 94-101
**Code:**
```ts
async createWebhook(userId: string, circleId: string, dto: { name: string; avatarUrl?: string; targetChannelId?: string }) {
    const count = await this.prisma.webhook.count({ where: { circleId } });
    if (count >= 15) throw new BadRequestException('Maximum 15 webhooks per community');
    return this.prisma.webhook.create({
      data: { circleId, createdById: userId, name: dto.name, avatarUrl: dto.avatarUrl, targetChannelId: dto.targetChannelId },
    });
}
```
**Problem:** No check that the user is a member (let alone admin) of the circle. Any authenticated user can create webhooks in any community.
**Impact:** An attacker can create 15 webhooks in every community, consuming the per-community limit and blocking legitimate webhook creation.

### Finding 9: Webhook deletion only checks creator — not community admin
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`
**Lines:** 111-115
**Code:**
```ts
async deleteWebhook(webhookId: string, userId: string) {
    const webhook = await this.prisma.webhook.findFirst({ where: { id: webhookId, createdById: userId } });
    if (!webhook) throw new NotFoundException();
    return this.prisma.webhook.delete({ where: { id: webhookId } });
}
```
**Problem:** Only the webhook creator can delete it. Community admins/owners cannot delete webhooks created by others. If a member creates a webhook and then leaves, no one can clean it up.
**Impact:** Orphaned webhooks that community admins cannot manage.

### Finding 10: Stage session creation has no community membership check
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`
**Lines:** 133-144
**Problem:** `createStageSession()` accepts a `circleId` but never verifies the user is a member of that circle. Any user can create stage sessions in any community.

### Finding 11: `inviteSpeaker()` has no check that speaker is a real user or community member
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`
**Lines:** 164-173
**Code:**
```ts
async inviteSpeaker(sessionId: string, hostId: string, speakerId: string) {
    const session = await this.prisma.stageSession.findFirst({ where: { id: sessionId, hostId } });
    if (!session) throw new NotFoundException();
    const speakers = [...new Set([...session.speakerIds, speakerId])];
    return this.prisma.stageSession.update({
      where: { id: sessionId },
      data: { speakerIds: speakers },
    });
}
```
**Problem:** The `speakerId` is blindly added to the `speakerIds` array without verifying it's a valid user ID or that the user is a member of the community. The speaker array can grow unbounded (no limit).
**Impact:** Arbitrary strings can be injected into speakerIds. The array can grow infinitely.
**Fix:** Validate speakerId exists as a User, check community membership, and cap speaker count.

### Finding 12: SSRF vulnerability in webhook delivery — no URL validation
**File:** `apps/api/src/modules/webhooks/webhooks.service.ts`
**Lines:** 54-70
**Code:**
```ts
async deliver(url: string, secret: string, payload: Record<string, unknown>) {
    const body = JSON.stringify(payload);
    const signature = createHmac('sha256', secret).update(body).digest('hex');
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(url, { method: 'POST', ... });
```
**Problem:** The `url` parameter is passed directly to `fetch()` with no validation. No checks for:
- Internal/private IP ranges (127.0.0.1, 10.x, 172.16-31.x, 192.168.x, 169.254.x)
- Non-HTTP(S) protocols (file://, ftp://)
- DNS rebinding attacks
**Impact:** Server-Side Request Forgery (SSRF). An attacker who creates a webhook can point it at internal services, cloud metadata endpoints (169.254.169.254), or other infrastructure.
**Fix:** Validate URL protocol (must be https), resolve DNS and reject private/internal IPs.

### Finding 13: Webhooks controller uses inline types — bypasses DTO validation
**File:** `apps/api/src/modules/webhooks/webhooks.controller.ts`
**Lines:** 18-21
**Code:**
```ts
@Post()
async create(
    @CurrentUser('id') userId: string,
    @Body() body: { circleId: string; name: string; url: string; events: string[] },
) {
```
**Problem:** The `body` parameter uses an inline type `{ circleId: string; name: string; url: string; events: string[] }` instead of a proper DTO class with class-validator decorators. NestJS validation pipe only works with class-validator decorated classes. This means:
- No `@IsUrl()` on url
- No `@MaxLength()` on name
- No `@IsArray()` / `@ArrayMaxSize()` on events
- No `@IsString()` validation on any field
- Any arbitrary JSON body is accepted
**Impact:** Unbounded string lengths, invalid URLs, arrays of any size all accepted without validation.

### Finding 14: `updateRole()` accepts `Record<string, unknown>` — arbitrary field injection
**File:** `apps/api/src/modules/communities/communities.service.ts`
**Lines:** 392-397
**Code:**
```ts
async updateRole(roleId: string, userId: string, data: Record<string, unknown>) {
    const role = await this.prisma.communityRole.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');
    await this.requireAdmin(role.communityId, userId);
    return this.prisma.communityRole.update({ where: { id: roleId }, data });
}
```
**Problem:** The `data` parameter is `Record<string, unknown>` which is passed directly to Prisma's `update()`. An attacker can inject any field including `communityId` (reassigning the role to a different community) or `position` (elevating priority). Even apart from the `requireAdmin` crash (Finding 1), this is dangerous.
**Impact:** If `requireAdmin` were fixed, arbitrary field injection into the CommunityRole update.
**Fix:** Use a proper DTO that whitelists only the allowed fields (canSendMessages, canPostMedia, etc.).

---

## MEDIUM (P2) — Functional Bugs & Data Integrity

### Finding 15: Duplicate webhook systems — discord-features vs webhooks module
**File 1:** `apps/api/src/modules/discord-features/discord-features.service.ts` (lines 92-129)
**File 2:** `apps/api/src/modules/webhooks/webhooks.service.ts` (entire file)
**Problem:** Two completely separate webhook implementations exist:
1. **discord-features**: Creates webhooks (token-based, no URL, no HMAC), executes via token (stub), no delivery
2. **webhooks module**: Creates webhooks (URL-based, with HMAC secret), delivers with signatures, has retry logic
Both write to the same `Webhook` Prisma model but with different field expectations. discord-features doesn't set `url` or `secret`; webhooks module requires them. The discord-features module creates webhooks without a `url` field (it's nullable), while the webhooks module assumes `url` exists.
**Impact:** Inconsistent data in the webhooks table. Webhooks created via discord-features have no URL and can't be delivered via the webhooks service, and vice versa.
**Fix:** Consolidate into a single webhook system.

### Finding 16: Unused `crypto` import in discord-features service
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`
**Line:** 3
**Code:**
```ts
import * as crypto from 'crypto';
```
**Problem:** The `crypto` module is imported but never used anywhere in the file. The webhook token is auto-generated by Prisma's `@default(uuid())`, and the HMAC signing is in the separate webhooks module.
**Impact:** Dead code, increases bundle size slightly.

### Finding 17: `lockForumThread()` is one-way — no unlock capability
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`
**Lines:** 79-81
**Code:**
```ts
async lockForumThread(threadId: string, userId: string) {
    return this.prisma.forumThread.update({ where: { id: threadId }, data: { isLocked: true } });
}
```
**Problem:** Lock is hardcoded to `true`. Unlike `pinForumThread()` which toggles, `lockForumThread()` can only lock, never unlock. Once a thread is locked, there's no way to unlock it through the API.
**Impact:** Permanently locked threads with no recovery path.
**Fix:** Toggle `isLocked` like pin does, or add a separate `unlockForumThread()` method.

### Finding 18: No forum thread delete endpoint
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`
**Problem:** There is no `deleteForumThread()` method and no `@Delete` endpoint in the controller. Thread authors and community admins have no way to delete forum threads.
**Impact:** No content moderation for forum threads. Spam or inappropriate threads cannot be removed.

### Finding 19: No forum reply delete/edit endpoints
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`
**Problem:** There is no `deleteForumReply()` or `editForumReply()` method. Users cannot edit or delete their replies, and moderators cannot remove replies.
**Impact:** No reply moderation capability.

### Finding 20: Stage session has no "remove speaker" capability
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`
**Problem:** `inviteSpeaker()` adds speakers but there is no `removeSpeaker()` method. A host cannot remove a speaker from the stage.
**Impact:** Once someone is added as a speaker, they cannot be removed without ending the entire session.

### Finding 21: Stage session `audienceCount` is never updated
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts` / `apps/api/prisma/schema.prisma` line 3644
**Problem:** The `StageSession` model has `audienceCount Int @default(0)` and `getActiveStageSessions()` orders by `audienceCount` desc. But no code ever increments or decrements this counter. There's no "join stage as listener" endpoint at all.
**Impact:** `audienceCount` is always 0 for all stage sessions. The "sort by audience" feature returns arbitrary ordering.

### Finding 22: Stage session status is a freeform String — no enum validation
**File:** `apps/api/prisma/schema.prisma`
**Line:** 3642
**Code:**
```prisma
status        String    @default("scheduled") // scheduled | live | ended
```
**Problem:** Status is a `String` with a comment suggesting three valid values, but no Prisma enum. The service sets `status: 'live'` and `status: 'ended'`, but nothing prevents setting `status: 'foo'` or any arbitrary string via direct DB access.
**Impact:** Data integrity — invalid status values can be stored. Active sessions query (`where: { status: 'live' }`) might miss sessions with typo'd statuses.

### Finding 23: `speakerIds` is stored as `String[]` in schema — no relation integrity
**File:** `apps/api/prisma/schema.prisma`
**Line:** 3643
**Code:**
```prisma
speakerIds    String[]
```
**Problem:** Speaker IDs are stored as a plain string array with no foreign key relation to User. If a user is deleted, their ID remains in the array (dangling reference). There's no way to efficiently query "which stages is this user a speaker in?"
**Impact:** Dangling references after user deletion, no referential integrity, no efficient reverse lookup.

### Finding 24: CommunityRole has no relation to CircleMember — roles can't be assigned to members
**File:** `apps/api/prisma/schema.prisma`
**Lines:** 3741-3760
**Problem:** The `CommunityRole` model exists with granular permissions (canSendMessages, canPostMedia, etc.), but there is no `roleId` field on `CircleMember`. There is no way to assign a `CommunityRole` to a community member. The `CircleMember` model only has a `role` field of enum type `CircleRole` (OWNER/ADMIN/MODERATOR/MEMBER).
**Impact:** The entire CommunityRole system is architecturally disconnected. Roles can be CRUD'd but never assigned. The granular permissions (canKick, canBan, canManageRoles, etc.) are never enforced anywhere because there's no way to link a role to a member.
**Fix:** Add `roleId String?` and `communityRole CommunityRole?` relation to `CircleMember`, or add a join table.

### Finding 25: Role management has no controller endpoints — completely inaccessible via API
**File:** `apps/api/src/modules/communities/communities.controller.ts`
**Problem:** The `CommunitiesService` has `createRole()`, `updateRole()`, `deleteRole()`, and `listRoles()` methods, but the `CommunitiesController` has NO endpoints for any of these. There are no `@Post(':id/roles')`, `@Patch('roles/:roleId')`, `@Delete('roles/:roleId')`, or `@Get(':id/roles')` routes.
**Impact:** Even if the service methods worked (they don't — see Finding 1), they're unreachable via HTTP.
**Fix:** Add role management endpoints to the controller.

### Finding 26: Persistent voice channel has no community link
**File:** `apps/api/src/modules/audio-rooms/audio-rooms.service.ts`
**Lines:** 500-510
**Code:**
```ts
async createPersistentRoom(communityId: string, name: string, userId: string) {
    return this.prisma.audioRoom.create({
      data: {
        title: name,
        hostId: userId,
        status: 'live',
        isPersistent: true,
        startedAt: new Date(),
      },
    });
}
```
**Problem:** The `communityId` parameter is accepted but never used — it's not stored in the AudioRoom record. The AudioRoom model has no `communityId` or `circleId` field. Persistent voice channels are not linked to any community.
**Impact:** There's no way to list persistent voice channels for a specific community. They float as orphaned rooms.

### Finding 27: `createPersistentRoom()` has no controller endpoint
**File:** `apps/api/src/modules/audio-rooms/audio-rooms.controller.ts`
**Problem:** The service method `createPersistentRoom()` exists but is not exposed by any controller endpoint. It is never called from anywhere.
**Impact:** Dead code — persistent voice channels cannot be created via the API.

### Finding 28: Persistent voice channels have no auto-cleanup or persistence behavior
**File:** `apps/api/src/modules/audio-rooms/audio-rooms.service.ts`
**Problem:** Setting `isPersistent: true` on an AudioRoom just stores a boolean. There is no different behavior for persistent rooms:
- `endRoom()` doesn't check `isPersistent` — persistent rooms can be ended permanently
- `leave()` endpoint: when host leaves a persistent room, `endRoom()` is called — destroying the "persistent" channel
- No auto-recreation logic exists
**Impact:** Persistent voice channels behave identically to regular rooms. The `isPersistent` flag is meaningless.

---

## LOW (P3) — Code Quality & Missing Features

### Finding 29: `scheduledAt` in CreateStageSessionDto has no date validation
**File:** `apps/api/src/modules/discord-features/dto/discord-features.dto.ts`
**Lines:** 27-30
**Code:**
```ts
export class CreateStageSessionDto {
  @ApiProperty() @IsString() @MaxLength(200) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() scheduledAt?: string;
}
```
**Problem:** `scheduledAt` is typed as `@IsString()` with no `@IsDateString()` or `@IsISO8601()` validator. Any string is accepted: `"not-a-date"`, `"<script>"`, etc. The service does `new Date(dto.scheduledAt)` which will produce `Invalid Date` for non-date strings.
**Impact:** Invalid dates stored in DB, or `Invalid Date` objects passed to Prisma which may cause unexpected behavior.

### Finding 30: `avatarUrl` in CreateWebhookDto has no URL validation
**File:** `apps/api/src/modules/discord-features/dto/discord-features.dto.ts`
**Lines:** 16-19
**Code:**
```ts
export class CreateWebhookDto {
  @ApiProperty() @IsString() @MaxLength(100) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() avatarUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() targetChannelId?: string;
}
```
**Problem:** `avatarUrl` accepts any string — no `@IsUrl()` validation. Arbitrary strings including scripts or data URIs can be stored.

### Finding 31: No `@Throttle` on most discord-features controller endpoints
**File:** `apps/api/src/modules/discord-features/discord-features.controller.ts`
**Problem:** Only `createWebhook` (line 78, limit: 5) and `executeWebhook` (line 100, limit: 30) have `@Throttle` decorators. The following endpoints rely only on the global 100/min limit:
- `createForumThread` (line 23)
- `replyToForumThread` (line 45)
- `lockForumThread` (line 60)
- `pinForumThread` (line 67)
- `createStageSession` (line 108)
- `startStage` (line 116)
- `endStage` (line 123)
- `inviteSpeaker` (line 130)
**Impact:** Forum thread/reply creation and stage session operations share the generous global rate limit rather than having per-endpoint throttling. A single user can create 100 forum threads per minute.

### Finding 32: `getForumThreads()` cursor uses `id` comparison (`lt`) but orders by `lastReplyAt`
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`
**Lines:** 20-34
**Code:**
```ts
async getForumThreads(circleId: string, cursor?: string, limit = 20) {
    const where: Record<string, unknown> = { circleId };
    if (cursor) where.id = { lt: cursor };

    const threads = await this.prisma.forumThread.findMany({
      where,
      orderBy: [{ isPinned: 'desc' }, { lastReplyAt: 'desc' }],
      take: limit + 1,
      // ...
```
**Problem:** The cursor is based on `id` with a `lt` comparison, but the sort order is by `isPinned` desc then `lastReplyAt` desc. Cursor-based pagination requires the cursor field to match the sort order. Using `id < cursor` with a `lastReplyAt` sort will skip or duplicate results.
**Impact:** Pagination is broken — users will see duplicate threads or miss threads when scrolling through pages.
**Fix:** Use `lastReplyAt` as the cursor value, or switch to offset pagination.

### Finding 33: `getForumReplies()` cursor uses `id` with `gt` but orders by `createdAt`
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`
**Lines:** 63-77
**Code:**
```ts
async getForumReplies(threadId: string, cursor?: string, limit = 50) {
    const where: Record<string, unknown> = { threadId };
    if (cursor) where.id = { gt: cursor }; // Ascending order for replies
```
**Problem:** Same cursor mismatch as Finding 32 — cursor uses `id` with `gt` but ordering is by `createdAt asc`.
**Impact:** Pagination may skip or duplicate replies.

### Finding 34: Forum thread `replyCount` is denormalized but not decremented on reply deletion
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`
**Lines:** 55-58
**Problem:** `replyToForumThread()` increments `replyCount`, but there's no reply delete endpoint. If replies are ever deleted (via DB admin), `replyCount` becomes stale/inflated. No mechanism exists to keep it in sync.

### Finding 35: `webhook.secret` is nullable — HMAC signature with empty string
**File:** `apps/api/src/modules/webhooks/webhooks.service.ts`
**Lines:** 47, 98
**Code:**
```ts
return this.deliver(webhook.url, webhook.secret ?? '', payload);
// ...
const result = await this.deliver(webhook.url!, webhook.secret ?? '', payload);
```
**Problem:** If `webhook.secret` is null (which is possible since the schema has `secret String? @db.VarChar(64)`), the HMAC is computed with an empty string as the key. An HMAC with an empty-string key is predictable — anyone can compute `sha256=<hash>` for any payload.
**Impact:** Webhook signature verification is meaningless for webhooks where secret was not set.
**Fix:** Refuse to deliver if secret is null, or ensure secret is always set at creation time.

### Finding 36: Webhook delivery uses `setTimeout` in a service — blocks event loop on retries
**File:** `apps/api/src/modules/webhooks/webhooks.service.ts`
**Lines:** 78-79
**Code:**
```ts
if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
```
**Problem:** Retry backoff uses inline `setTimeout` in the service method. When `dispatch()` is called with multiple matching webhooks, all retries block the same request context. This should be offloaded to a job queue (BullMQ) for async retry.
**Impact:** If a webhook destination is slow or down, the dispatch call blocks for up to 1+2+4 = 7 seconds per webhook, holding the request open.

### Finding 37: `dispatch()` updates `lastUsedAt` even on failed deliveries
**File:** `apps/api/src/modules/webhooks/webhooks.service.ts`
**Lines:** 96-103
**Code:**
```ts
matching.map(async (webhook) => {
    const result = await this.deliver(webhook.url!, webhook.secret ?? '', payload);
    await this.prisma.webhook.update({
      where: { id: webhook.id },
      data: { lastUsedAt: new Date() },
    });
    return result;
}),
```
**Problem:** `lastUsedAt` is updated unconditionally after delivery, even if `deliver()` returned `{ success: false }`. This makes `lastUsedAt` meaningless as an indicator of successful webhook activity.

### Finding 38: `webhooks.test()` does not verify user owns/has access to the webhook
**File:** `apps/api/src/modules/webhooks/webhooks.service.ts`
**Lines:** 42-48
**Code:**
```ts
async test(webhookId: string, userId: string) {
    const webhook = await this.prisma.webhook.findUnique({ where: { id: webhookId } });
    if (!webhook || !webhook.url) throw new NotFoundException('Webhook not found');
    // userId never checked
    const payload = { event: 'test', data: { message: 'Webhook test from Mizanly' }, timestamp: new Date().toISOString() };
    return this.deliver(webhook.url, webhook.secret ?? '', payload);
}
```
**Problem:** The `userId` parameter is accepted but never used. Any authenticated user can trigger test deliveries for any webhook by ID, which could be used as an SSRF vector or to DoS the webhook endpoint.

### Finding 39: `getWebhooks()` in discord-features does not filter by `isActive`
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`
**Lines:** 103-109
**Code:**
```ts
async getWebhooks(circleId: string) {
    return this.prisma.webhook.findMany({
      where: { circleId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
}
```
**Problem:** Unlike the webhooks module's `list()` which filters `isActive: true`, the discord-features version returns all webhooks including deactivated ones. No membership check either.

### Finding 40: `getActiveStageSessions()` returns all live sessions globally when no circleId
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`
**Lines:** 175-185
**Code:**
```ts
async getActiveStageSessions(circleId?: string) {
    const where: Record<string, unknown> = { status: 'live' };
    if (circleId) where.circleId = circleId;
    return this.prisma.stageSession.findMany({
      where,
      orderBy: { audienceCount: 'desc' },
      take: 50,
      include: { host: { select: USER_SELECT } },
    });
}
```
**Problem:** When called without `circleId`, this returns ALL live stage sessions across all communities, including private communities. No privacy check.
**Impact:** Leaks the existence and details of stage sessions in private communities.

### Finding 41: `createWebhook()` in discord-features doesn't generate a `secret` — differs from webhooks module
**File:** `apps/api/src/modules/discord-features/discord-features.service.ts`
**Lines:** 94-101
**Problem:** The discord-features `createWebhook()` creates a webhook with `name`, `avatarUrl`, and `targetChannelId` but does NOT set `url`, `secret`, or `events`. The webhooks module `create()` sets `url`, `secret` (randomBytes(32).toString('hex')), and `events`. These two creation paths produce incompatible webhook records in the same table.

### Finding 42: `requireAdmin()` only checks owner — not admin or moderator
**File:** `apps/api/src/modules/communities/communities.service.ts`
**Lines:** 413-418
**Code:**
```ts
private async requireAdmin(communityId: string, userId: string) {
    const community = await this.prisma.community.findUnique({ where: { id: communityId } });
    if (!community) throw new NotFoundException('Community not found');
    if (community.ownerId !== userId) throw new ForbiddenException('Only the owner can manage roles');
    return community;
}
```
**Problem:** Even ignoring the crash (Finding 1), this method name is `requireAdmin` but the error message says "Only the owner can manage roles." Only the `ownerId` is checked — admins with `canManageRoles: true` in their CommunityRole are excluded. This defeats the purpose of having granular role permissions.
**Impact:** Only the community owner can manage roles. The `canManageRoles` permission flag is dead/ignored.

---

## Summary

| Severity | Count | Key Issues |
|----------|-------|-----------|
| P0 — Ship Blocker | 4 | `prisma.community` crash kills all role mgmt, WebhooksModule not registered, route collision, executeWebhook is a stub |
| P1 — Security/Auth | 10 | No membership checks on ANY discord-features operation (forum, webhook, stage), SSRF in webhook delivery, inline types bypass validation, arbitrary field injection in updateRole |
| P2 — Functional | 14 | Duplicate webhook systems, broken pagination cursors, persistent voice channels non-functional, CommunityRole disconnected from CircleMember, no role endpoints |
| P3 — Code Quality | 14 | Missing date validation, no URL validation, missing throttle, dead crypto import, no delete/edit for forum content |
| **Total** | **42** | |

### Architecture Assessment

The Discord feature parity implementation has severe structural problems:

1. **Role permissions are 100% non-functional**: The `prisma.community` crash, missing controller endpoints, and disconnected CommunityRole model mean zero granular permissions work.

2. **Webhooks have two competing, incompatible systems**: discord-features (stub) and webhooks module (real but dead). Neither actually delivers content.

3. **Zero authorization on Discord-features**: Every single operation (forum create, reply, lock, pin, webhook create, stage create, speaker invite) is accessible by any authenticated user regardless of community membership.

4. **Persistent voice channels are a single boolean flag** with no behavioral difference from regular rooms, no controller endpoint, and no community association.

5. **Stage sessions** have no listener/audience management, no speaker removal, and the audienceCount metric is always 0.
