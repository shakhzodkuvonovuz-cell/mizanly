# A38 — Scheduling + Drafts Module Hostile Audit

**Auditor:** Opus 4.6 | **Date:** 2026-04-05 | **Scope:** `apps/api/src/modules/scheduling/` + `apps/api/src/modules/drafts/`

---

## Files Audited

| File | Lines | Read |
|------|-------|------|
| `scheduling/scheduling.controller.ts` | 105 | ALL |
| `scheduling/scheduling.service.ts` | 716 | ALL |
| `drafts/drafts.controller.ts` | 59 | ALL |
| `drafts/drafts.service.ts` | 185 | ALL |
| `drafts/dto/save-draft.dto.ts` | 13 | ALL |

---

## CRITICAL Findings

### C1: Scheduling `publishOverdue` endpoint is publicly accessible without auth
**File:** `scheduling.controller.ts` lines 99-104
**Lines:**
```typescript
@Post('publish-overdue')
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Auto-publish all overdue scheduled content (internal/cron)' })
publishOverdue() {
    return this.schedulingService.publishOverdueContent();
}
```
**Issue:** This endpoint has NO `@UseGuards(ClerkAuthGuard)` decorator. The `SchedulingController` does NOT have a class-level guard. This means ANY unauthenticated user can trigger the publish-overdue cron manually. While the cron already runs every minute, an attacker could:
1. Trigger it repeatedly to cause excessive database load
2. Race with the cron to cause duplicate side effects

The comment says "internal/cron" but there is no internal auth guard or API key protection.
**Severity:** CRITICAL — Unauthenticated endpoint that triggers a bulk database operation.

### C2: Scheduling `type` parameter is not validated in controller
**File:** `scheduling.controller.ts` lines 55-71
**Lines:**
```typescript
@Patch(':type/:id')
@UseGuards(ClerkAuthGuard)
updateSchedule(
    @CurrentUser('id') userId: string,
    @Param('type') type: 'post' | 'thread' | 'reel' | 'video',
    @Param('id') id: string,
    @Body() dto: UpdateScheduleDto,
): Promise<ScheduledContent> {
```
**Issue:** The TypeScript type annotation `type: 'post' | 'thread' | 'reel' | 'video'` provides NO runtime validation. NestJS does not enforce TypeScript union types on URL parameters. Any string value (e.g., `PATCH /scheduling/xss_payload/some-id`) will pass through to the service. The service method `getModel()` (line 46-52) does validate with `validModels.includes()`, which catches this. But the controller type annotation creates a false sense of security.
**Severity:** LOW — Service-level validation exists, but controller-level `@IsIn()` pipe is missing.

### C3: Scheduling `cancelSchedule` sets `isRemoved: true` which hides content permanently
**File:** `scheduling.service.ts` lines 184-203
**Lines:**
```typescript
return this.updateContent(model, id, { scheduledAt: null, isRemoved: true });
```
**Issue:** When a user cancels a scheduled post, the content is marked as `isRemoved: true`. The comment explains this prevents accidental publication. However, there is no endpoint to UNREMOVE the content (set `isRemoved: false`). The user effectively loses their content draft. They would need to go through the regular post/thread/reel/video edit endpoint to recover it.
**Severity:** LOW — UX issue, not security. But the user might expect "cancel schedule" to revert to draft, not mark as removed.

### C4: Drafts `saveDraft` has no limit on number of drafts per user
**File:** `drafts.service.ts` lines 48-58
**Issue:** A user can create unlimited drafts. The `getDrafts` method returns `take: 50`, but there's no cap on creation. A malicious user could create millions of drafts (30/min rate limit = 43K/day), filling the database.
**Severity:** MEDIUM — No per-user cap on draft count.

### C5: Drafts `publishDraft` bypasses content moderation and publish workflow
**File:** `drafts.service.ts` lines 94-184
**Issue:** When a draft is published, it creates the content directly via `this.prisma.post.create(...)` without going through the normal create endpoints. This bypasses:
1. Content moderation (profanity/NSFW checks)
2. Publish workflow (search indexing, real-time events)
3. Hashtag count increments
4. Gamification XP/streak
5. Mention/tag notifications
6. Rate limiting on content creation
The scheduling service handles deferred side effects properly, but the drafts service does not.
**Severity:** HIGH — Content moderation bypass via draft→publish path.

### C6: Drafts `publishDraft` does not validate draft data structure
**File:** `drafts.service.ts` lines 99-173
**Lines:**
```typescript
const draftData = draft.data as Record<string, unknown>;
// ...
content: (draftData.content as string) || '',
mediaUrls: (draftData.mediaUrls as string[]) || [],
```
**Issue:** The draft `data` field is a JSON blob (`Prisma.InputJsonValue`) stored without schema validation. When publishing, the code casts fields with `as string`, `as string[]`, `as number`. If the JSON contains unexpected types (e.g., `content: 123` or `mediaUrls: "not-an-array"`), the casts silently succeed in TypeScript but could cause runtime errors or data corruption in Prisma.

More critically, the `channelId` for MINBAR drafts (line 151) is taken directly from the draft data without verifying the user has permission to post to that channel.
**Severity:** MEDIUM — No input validation on publish, and potential channel BOLA.

### C7: Drafts `deleteAllDrafts` has no confirmation
**File:** `drafts.controller.ts` lines 54-58
**Lines:**
```typescript
@Delete()
@ApiOperation({ summary: 'Delete all drafts' })
async deleteAllDrafts(@CurrentUser('id') userId: string) {
    return this.drafts.deleteAllDrafts(userId);
}
```
**Issue:** `DELETE /drafts` (no ID) deletes ALL drafts for the user. No confirmation mechanism. If a client accidentally sends this request, all drafts are gone. Rate limiting doesn't help because 1 request is enough. The route path `DELETE /drafts` could be accidentally triggered by a client that intended to delete a specific draft but forgot to include the ID.
**Severity:** LOW — Destructive bulk operation without confirmation, but drafts are ephemeral.

### C8: Scheduling cron processes up to 100 items per type without pagination
**File:** `scheduling.service.ts` lines 397-431
**Lines:**
```typescript
this.prisma.post.findMany({
    where: overdueWhere,
    // ... large select
    take: 100,
}),
```
**Issue:** The cron finds up to 100 overdue posts, 100 threads, 100 reels, and 100 videos. If a user schedules 200 posts for the same minute, 100 would be published and 100 would wait for the next cron run (1 minute later). This is acceptable behavior but means there's a maximum throughput of 400 items/minute. At scale with many users, this could create a growing backlog.

More concerning: the cron fires deferred side effects (notifications, gamification, search indexing) for ALL 400 items in a single run. Each item triggers multiple async operations. A burst of 400 items could overwhelm the queue/notification services.
**Severity:** LOW — Acceptable at current scale.

### C9: Scheduling `publishNow` does not check if content is actually scheduled
**File:** `scheduling.service.ts` lines 205-225
**Issue:** The `publishNow` method finds the content, verifies ownership, then sets `scheduledAt: null`. It does NOT check whether `scheduledAt` is currently set. If the content was already published (scheduledAt is null), calling publishNow would:
1. Still fire all deferred side effects (duplicate gamification XP, duplicate notifications)
2. The `updateContent` would be a no-op for `scheduledAt: null` (already null)
But the side effects would fire again.
**Severity:** MEDIUM — Duplicate side effects if called on already-published content.

### C10: Drafts `SaveDraftDto` allows arbitrary JSON in `data` field
**File:** `drafts/dto/save-draft.dto.ts` lines 9-12
**Lines:**
```typescript
@ApiProperty({ description: 'Draft payload (content, mediaUrls, etc.)' })
@IsObject()
data: Record<string, unknown>;
```
**Issue:** `@IsObject()` only checks that `data` is an object (not null, not array, not primitive). The object can contain any key-value pairs with any depth. A malicious user could store a 10MB JSON blob as a draft. No size validation exists.
**Severity:** MEDIUM — No payload size limit. Combined with C4 (unlimited drafts), this allows database storage abuse.

### C11: Scheduling service `findContent` returns `userId: null` for some content types
**File:** `scheduling.service.ts` lines 344-357
**Lines:**
```typescript
private async findContent(model: ContentModel, id: string): Promise<{ userId: string | null } | null> {
```
**Issue:** The return type allows `userId: null`. At line 177:
```typescript
if (content.userId !== userId) {
    throw new ForbiddenException('Not authorized');
}
```
If `content.userId` is `null` (e.g., content created by the system or an anonymized deleted user), and `userId` is a non-null string, the comparison `null !== "user_123"` is `true`, which correctly throws Forbidden. This is safe.
**Severity:** PASS

### C12: Scheduling `updateSchedule` minimum time check is 15 minutes
**File:** `scheduling.service.ts` lines 164-169
**Lines:**
```typescript
const minTime = new Date(Date.now() + 15 * 60 * 1000);
if (utcScheduledAt < minTime) {
    throw new BadRequestException('Scheduled time must be at least 15 minutes from now');
}
```
**Issue:** There is no MAXIMUM time limit. A user could schedule a post for the year 9999. This would occupy database space indefinitely and never be published (or be published in 7973 years).
**Severity:** LOW — Should add a max schedule horizon (e.g., 1 year).

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 1 | C1 |
| HIGH | 1 | C5 |
| MEDIUM | 4 | C4, C6, C9, C10 |
| LOW | 5 | C2, C3, C7, C8, C12 |
| INFO | 0 | - |
| PASS | 1 | C11 |

### What's Done Well
- BOLA protection: all scheduling mutations verify `content.userId === userId`
- Type validation via `getModel()` with allowlist
- UTC timezone handling documented and consistent
- Cron lock prevents concurrent execution (`acquireCronLock`)
- `originalScheduledAt` preserved for analytics before clearing `scheduledAt`
- Deferred side effects (hashtag counts, gamification, notifications) properly fired on publish
- Draft ownership verification uses lightweight select (J08-#25 optimization)
- Draft spaces validated against `ContentSpace` enum
- Rate limiting on draft creation (30/min)
