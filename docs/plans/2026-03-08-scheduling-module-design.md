# Scheduling Module Design

**Date:** 2026-03-08
**Author:** Claude Opus 4.6
**Status:** Approved

## Overview
A unified scheduling module for managing scheduled content across all 5 Mizanly spaces. Part of Batch 18 (The Everything Batch), Step 6.

## Purpose
- Provide API endpoints to manage scheduled content (posts, threads, reels, videos)
- Allow users to view, update, cancel, and publish scheduled content
- Wire up existing `scheduledAt` schema fields that currently sit idle

## Schema Fields
Prisma schema already has `scheduledAt` fields on:
- `Post.scheduledAt` (line 408)
- `Thread.scheduledAt` (line 589)
- `Reel.scheduledAt` (line 501)
- `Video.scheduledAt` (line 708)

All fields are `DateTime?` (nullable) → `null` = not scheduled / published.

## Module Architecture

### File Structure
```
apps/api/src/modules/scheduling/
├── scheduling.module.ts          # NestJS module definition
├── scheduling.controller.ts      # REST endpoints with guards
└── scheduling.service.ts         # Business logic + Prisma queries
```

### Module (`scheduling.module.ts`)
- Imports: `PrismaModule`, `CommonModule` (for `ClerkAuthGuard`)
- Providers: `SchedulingService`
- Controllers: `SchedulingController`
- Exports: `SchedulingService` (optional)

### Controller (`scheduling.controller.ts`)
- Decorator: `@Controller('scheduling')`
- Guards: `ClerkAuthGuard` on all endpoints
- Uses `@CurrentUser('id')` to get `userId` from Clerk JWT
- Standard Swagger/API documentation (`@ApiTags`, `@ApiBearerAuth`)

### Service (`scheduling.service.ts`)
- Injects `PrismaService`
- Contains all database queries and validation logic
- Returns typed results (no `any`, follows existing patterns)

## Endpoints

### 1. GET /scheduling/scheduled
**Purpose:** Get all scheduled content for the authenticated user
**Response:** Unified `ScheduledItem[]` sorted by `scheduledAt`
```typescript
interface ScheduledItem {
  id: string;
  type: 'post' | 'thread' | 'reel' | 'video';
  title?: string;      // video.title
  content?: string;    // post.content, thread.content
  caption?: string;    // reel.caption
  scheduledAt: string;
  createdAt: string;
}
```

### 2. PATCH /scheduling/:type/:id
**Purpose:** Update scheduled time for a content item
**Params:** `type` = 'post' | 'thread' | 'reel' | 'video', `id` = content ID
**Body:** `{ scheduledAt: string }` (ISO date string)
**Validation:**
- Must be at least 15 minutes in the future
- User must own the content (`userId` matches)
- Content must exist and have `scheduledAt` not null

### 3. DELETE /scheduling/:type/:id
**Purpose:** Cancel scheduled post (sets `scheduledAt = null`, keeps as draft)
**Params:** Same as PATCH
**Validation:** User must own the content

### 4. POST /scheduling/publish-now/:type/:id
**Purpose:** Publish scheduled content immediately (sets `scheduledAt = null`)
**Params:** Same as PATCH
**Validation:** User must own the content

## Validation Rules
1. **Type validation:** `type` must be one of: 'post', 'thread', 'reel', 'video'
2. **Time validation:** `scheduledAt` must be ≥ now + 15 minutes
3. **Ownership:** User ID must match content's `userId`
4. **Existence:** Content must exist and (for update/cancel/publish) have `scheduledAt` not null

## Service Logic Details

### getScheduled(userId: string)
- Queries all 4 models concurrently with `Promise.all`
- Filters: `userId = userId`, `scheduledAt: { not: null, gt: new Date() }`
- Combines results into unified array, sorts by `scheduledAt`
- Selects minimal fields: `id`, type-specific text field, `scheduledAt`, `createdAt`

### updateSchedule(userId, type, id, scheduledAt)
1. Validate `scheduledAt >= now + 15min`
2. Find content by ID, verify ownership
3. Update `scheduledAt` field on appropriate model
4. Return updated content object

### cancelSchedule(userId, type, id)
1. Find content by ID, verify ownership
2. Set `scheduledAt = null`
3. Return updated content object

### publishNow(userId, type, id)
1. Find content by ID, verify ownership
2. Set `scheduledAt = null` (same as cancel but semantically different)
3. Return updated content object

### Helper: getModel(type: string)
Maps type string to Prisma model name:
- 'post' → 'post'
- 'thread' → 'thread'
- 'reel' → 'reel'
- 'video' → 'video'

Throws `BadRequestException` for invalid types.

## Error Handling
- **404 Not Found:** Content doesn't exist
- **403 Forbidden:** User doesn't own the content
- **400 Bad Request:** Invalid type, past date, validation failed
- **409 Conflict:** Trying to publish already-published content

## Dependencies
1. **Prisma schema:** Already has `scheduledAt` fields (confirmed)
2. **PrismaModule:** For database access
3. **CommonModule:** For `ClerkAuthGuard` and `@CurrentUser` decorator
4. **No external services:** Pure database module

## Quality Requirements
- All CLAUDE.md backend rules apply:
  - No `any` in non-test code
  - Proper typed responses
  - Use existing exception patterns (`BadRequestException`, `ForbiddenException`, etc.)
  - Follow existing controller/service patterns (see `blocks.controller.ts` as reference)
  - Transaction safety where needed

## Verification Criteria
1. `npx tsc --noEmit` passes with 0 errors
2. Module can be imported into `app.module.ts` (Agent 18's responsibility)
3. All 4 endpoints work as described
4. Proper error responses for invalid inputs
5. Ownership validation prevents unauthorized access

## Notes
- Part of Batch 18 parallel execution (Agent 6)
- Must not conflict with other agents' files
- Follows existing code patterns in the codebase
- No automatic publishing job (cron/queue) in this implementation
- Mobile screen for scheduling (Agent 1) will consume this API