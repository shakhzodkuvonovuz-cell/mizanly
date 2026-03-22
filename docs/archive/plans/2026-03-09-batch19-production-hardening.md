# Batch 19: Production Hardening — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close every critical/high security gap, add production infrastructure, and reach billion-dollar platform readiness.

**Architecture:** 25 parallel agents, zero file conflicts. Organized in 4 tiers: Security (1-11), Infrastructure (12-16), Platform (17-22), Quality (23-25).

**Tech Stack:** NestJS 10, Prisma, class-validator, ioredis, Docker, GitHub Actions

---

## File → Agent Conflict Map

| Agent | Creates | Edits | No Conflicts |
|-------|---------|-------|:---:|
| 1 | circles/dto/*.ts | circles/circles.controller.ts | ✓ |
| 2 | admin/dto/*.ts | admin/admin.controller.ts | ✓ |
| 3 | — | stories/stories.controller.ts (extract DTOs to files) | ✓ |
| 4 | messages/dto/*.ts | messages/messages.controller.ts | ✓ |
| 5 | posts/dto/report.dto.ts | posts/posts.controller.ts | ✓ |
| 6 | threads/dto/report.dto.ts | threads/threads.controller.ts | ✓ |
| 7 | reels/dto/report.dto.ts | reels/reels.controller.ts | ✓ |
| 8 | videos/dto/report.dto.ts, videos/dto/video-progress.dto.ts | videos/videos.controller.ts | ✓ |
| 9 | users/dto/report.dto.ts | users/users.controller.ts | ✓ |
| 10 | gateways/dto/send-message.dto.ts | gateways/chat.gateway.ts | ✓ |
| 11 | common/pipes/sanitize.pipe.ts | common/utils/sanitize.ts | ✓ |
| 12 | — | main.ts, apps/api/package.json | ✓ |
| 13 | .github/workflows/ci.yml | — | ✓ |
| 14 | apps/api/Dockerfile, apps/api/.dockerignore | — | ✓ |
| 15 | .prettierrc, .eslintrc.json | root package.json | ✓ |
| 16 | — | prisma/schema.prisma | ✓ |
| 17 | — | packages/shared/src/index.ts, packages/shared/package.json, NEW packages/shared/tsconfig.json | ✓ |
| 18 | modules/privacy/privacy.*.ts | app.module.ts | ✓ |
| 19 | — | posts/posts.service.ts | ✓ |
| 20 | — | users/users.service.ts | ✓ |
| 21 | — | search/search.controller.ts | ✓ |
| 22 | — | modules/recommendations/recommendations.controller.ts | ✓ |
| 23 | modules/recommendations/recommendations.service.spec.ts | — | ✓ |
| 24 | apps/mobile/jest.config.ts, apps/mobile/jest.setup.ts | apps/mobile/package.json | ✓ |
| 25 | docs/DEPLOYMENT.md, docs/ONBOARDING.md | — | ✓ |

**Every file appears in exactly one agent. Zero conflicts.**

---

## TIER 1: SECURITY (Agents 1-11)

---

### Agent 1: Circles DTO Validation

**Files:**
- Create: `apps/api/src/modules/circles/dto/create-circle.dto.ts`
- Create: `apps/api/src/modules/circles/dto/update-circle.dto.ts`
- Create: `apps/api/src/modules/circles/dto/manage-members.dto.ts`
- Edit: `apps/api/src/modules/circles/circles.controller.ts`

**Current problem:** All 4 write endpoints use raw `@Body('name')` and `@Body('memberIds')` — no validation at all.

**Step 1:** Create `dto/create-circle.dto.ts`:
```typescript
import { IsString, IsOptional, IsArray, IsUUID, MaxLength, ArrayMaxSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCircleDto {
  @ApiProperty({ description: 'Circle name', maxLength: 30 })
  @IsString()
  @MaxLength(30)
  name: string;

  @ApiProperty({ required: false, description: 'Initial member IDs', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(100)
  memberIds?: string[];
}
```

**Step 2:** Create `dto/update-circle.dto.ts`:
```typescript
import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCircleDto {
  @ApiProperty({ required: false, description: 'New circle name', maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  name?: string;
}
```

**Step 3:** Create `dto/manage-members.dto.ts`:
```typescript
import { IsArray, IsUUID, ArrayMaxSize, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ManageMembersDto {
  @ApiProperty({ description: 'User IDs to add/remove', type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  memberIds: string[];
}
```

**Step 4:** Update `circles.controller.ts` to use DTOs:
```typescript
import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CirclesService } from './circles.service';
import { CreateCircleDto } from './dto/create-circle.dto';
import { UpdateCircleDto } from './dto/update-circle.dto';
import { ManageMembersDto } from './dto/manage-members.dto';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Circles')
@Controller('circles')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class CirclesController {
  constructor(private circlesService: CirclesService) {}

  @Get()
  @ApiOperation({ summary: 'Get my circles' })
  getMyCircles(@CurrentUser('id') userId: string) { return this.circlesService.getMyCircles(userId); }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a circle' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateCircleDto) {
    return this.circlesService.create(userId, dto.name, dto.memberIds);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a circle' })
  update(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: UpdateCircleDto) {
    return this.circlesService.update(id, userId, dto.name);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a circle' })
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.circlesService.delete(id, userId); }

  @Get(':id/members')
  @ApiOperation({ summary: 'Get circle members' })
  getMembers(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.circlesService.getMembers(id, userId); }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add members to circle' })
  addMembers(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: ManageMembersDto) {
    return this.circlesService.addMembers(id, userId, dto.memberIds);
  }

  @Delete(':id/members')
  @ApiOperation({ summary: 'Remove members from circle' })
  removeMembers(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: ManageMembersDto) {
    return this.circlesService.removeMembers(id, userId, dto.memberIds);
  }
}
```

---

### Agent 2: Admin DTO Validation

**Files:**
- Create: `apps/api/src/modules/admin/dto/resolve-report.dto.ts`
- Create: `apps/api/src/modules/admin/dto/ban-user.dto.ts`
- Edit: `apps/api/src/modules/admin/admin.controller.ts`

**Current problem:** Lines 49 and 66 use inline `@Body() dto: { ... }` — bypasses class-validator.

**Step 1:** Create `dto/resolve-report.dto.ts`:
```typescript
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResolveReportDto {
  @ApiProperty({ description: 'Action to take', enum: ['DISMISS', 'WARN', 'REMOVE_CONTENT', 'BAN_USER'] })
  @IsEnum(['DISMISS', 'WARN', 'REMOVE_CONTENT', 'BAN_USER'])
  action: 'DISMISS' | 'WARN' | 'REMOVE_CONTENT' | 'BAN_USER';

  @ApiProperty({ required: false, description: 'Moderator note', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
```

**Step 2:** Create `dto/ban-user.dto.ts`:
```typescript
import { IsString, IsOptional, IsNumber, MaxLength, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BanUserDto {
  @ApiProperty({ description: 'Reason for ban', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason: string;

  @ApiProperty({ required: false, description: 'Ban duration in hours (omit for permanent)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  duration?: number;
}
```

**Step 3:** Update `admin.controller.ts` — replace inline types with DTO imports:
- Line 49: `@Body() dto: { action: ... }` → `@Body() dto: ResolveReportDto`
- Line 66: `@Body() dto: { reason: ... }` → `@Body() dto: BanUserDto`
- Add imports for both DTOs at top
- Keep all existing `@ApiOperation` decorators

---

### Agent 3: Stories DTO Extraction

**Files:**
- Create: `apps/api/src/modules/stories/dto/create-story.dto.ts`
- Create: `apps/api/src/modules/stories/dto/create-highlight.dto.ts`
- Create: `apps/api/src/modules/stories/dto/update-highlight.dto.ts`
- Edit: `apps/api/src/modules/stories/stories.controller.ts`

**Current state:** DTOs are already fully validated with class-validator decorators — they're just defined inline in the controller file. Extract them to separate DTO files for consistency with other modules. Copy the exact same class definitions (lines 21-93) into their own files, then import them.

---

### Agent 4: Messages Missing DTO Validation

**Files:**
- Create: `apps/api/src/modules/messages/dto/mute-conversation.dto.ts`
- Create: `apps/api/src/modules/messages/dto/archive-conversation.dto.ts`
- Create: `apps/api/src/modules/messages/dto/create-dm.dto.ts`
- Edit: `apps/api/src/modules/messages/messages.controller.ts`

**Current problem:** Lines 192, 202, 211 use raw `@Body('muted')`, `@Body('archived')`, `@Body('targetUserId')`.

**Step 1:** Create `dto/mute-conversation.dto.ts`:
```typescript
import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MuteConversationDto {
  @ApiProperty({ description: 'Whether to mute (true) or unmute (false)' })
  @IsBoolean()
  muted: boolean;
}
```

**Step 2:** Create `dto/archive-conversation.dto.ts`:
```typescript
import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ArchiveConversationDto {
  @ApiProperty({ description: 'Whether to archive (true) or unarchive (false)' })
  @IsBoolean()
  archived: boolean;
}
```

**Step 3:** Create `dto/create-dm.dto.ts`:
```typescript
import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDmDto {
  @ApiProperty({ description: 'Target user ID for the DM' })
  @IsUUID()
  targetUserId: string;
}
```

**Step 4:** Update `messages.controller.ts`:
- Import the 3 new DTOs
- Line 189-194: Replace `@Body('muted') muted: boolean` with `@Body() dto: MuteConversationDto`, call `this.messagesService.muteConversation(id, userId, dto.muted)`
- Line 199-204: Replace `@Body('archived') archived: boolean` with `@Body() dto: ArchiveConversationDto`, call `this.messagesService.archiveConversation(id, userId, dto.archived)`
- Line 209-213: Replace `@Body('targetUserId') targetUserId: string` with `@Body() dto: CreateDmDto`, call `this.messagesService.createDM(userId, dto.targetUserId)`

---

### Agent 5: Posts Report DTO

**Files:**
- Create: `apps/api/src/modules/posts/dto/report.dto.ts`
- Edit: `apps/api/src/modules/posts/posts.controller.ts`

**Current problem:** Line 240: `@Body('reason') reason: string` — no validation.

**Step 1:** Create `dto/report.dto.ts`:
```typescript
import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReportDto {
  @ApiProperty({ description: 'Reason for reporting', minLength: 3, maxLength: 500 })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
```

**Step 2:** Update `posts.controller.ts`:
- Add import: `import { ReportDto } from './dto/report.dto';`
- Line 237-243: Replace `@Body('reason') reason: string` with `@Body() dto: ReportDto`
- Update service call: `this.postsService.report(id, userId, dto.reason)`

---

### Agent 6: Threads Report DTO

**Files:**
- Create: `apps/api/src/modules/threads/dto/report.dto.ts`
- Edit: `apps/api/src/modules/threads/threads.controller.ts`

**Same pattern as Agent 5.** Create identical `ReportDto` in threads/dto/, update line 214 to use it.

Also move the inline `AddReplyDto` (lines 22-30) to `dto/add-reply.dto.ts` for consistency.

---

### Agent 7: Reels Report DTO

**Files:**
- Create: `apps/api/src/modules/reels/dto/report.dto.ts`
- Edit: `apps/api/src/modules/reels/reels.controller.ts`

**Same pattern as Agent 5.** Create `ReportDto` in reels/dto/, update line 143 to use it.

---

### Agent 8: Videos Report + Progress DTOs

**Files:**
- Create: `apps/api/src/modules/videos/dto/report.dto.ts`
- Create: `apps/api/src/modules/videos/dto/video-progress.dto.ts`
- Edit: `apps/api/src/modules/videos/videos.controller.ts`

**Step 1:** Create `dto/report.dto.ts` (same as Agent 5 pattern).

**Step 2:** Create `dto/video-progress.dto.ts`:
```typescript
import { IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VideoProgressDto {
  @ApiProperty({ description: 'Watch progress (0.0 to 1.0)', minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  progress: number;
}
```

**Step 3:** Update `videos.controller.ts`:
- Line 182: Replace `@Body('progress') progress: number` with `@Body() dto: VideoProgressDto`, call `this.videosService.updateProgress(id, userId, dto.progress)`
- Line 195: Replace `@Body('reason') reason: string` with `@Body() dto: ReportDto`, call `this.videosService.report(id, userId, dto.reason)`

---

### Agent 9: Users Report DTO

**Files:**
- Create: `apps/api/src/modules/users/dto/report.dto.ts`
- Edit: `apps/api/src/modules/users/users.controller.ts`

**Same pattern as Agent 5.** Create `ReportDto` in users/dto/, update line 256 to use it.

---

### Agent 10: Chat Gateway — Redis Rate Limiting + DTO Validation

**Files:**
- Create: `apps/api/src/gateways/dto/send-message.dto.ts`
- Edit: `apps/api/src/gateways/chat.gateway.ts`

**Current problems:**
1. In-memory rate limiting (Map + setInterval) resets on restart, per-instance only
2. `send_message` handler accepts raw unvalidated data

**Step 1:** Create `dto/send-message.dto.ts`:
```typescript
import { IsString, IsOptional, IsEnum, IsUrl, IsUUID, MaxLength } from 'class-validator';

export class WsSendMessageDto {
  @IsUUID()
  conversationId: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @IsOptional()
  @IsEnum(['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'VOICE', 'FILE', 'GIF', 'STICKER', 'LOCATION'])
  messageType?: string;

  @IsOptional()
  @IsUrl()
  mediaUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  mediaType?: string;

  @IsOptional()
  @IsUUID()
  replyToId?: string;
}
```

**Step 2:** Rewrite `chat.gateway.ts` rate limiting to use Redis:
```typescript
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { WsSendMessageDto } from './dto/send-message.dto';

// In constructor:
constructor(
  private messagesService: MessagesService,
  private prisma: PrismaService,
  private config: ConfigService,
  @Inject('REDIS') private redis: Redis,
) {}

// Replace in-memory rate limiting with Redis:
private async checkRateLimit(userId: string): Promise<boolean> {
  const key = `ws:ratelimit:${userId}`;
  const count = await this.redis.incr(key);
  if (count === 1) await this.redis.expire(key, 60);
  return count <= 30;
}

// In handleMessage: validate the DTO
async handleMessage(client, data) {
  const dto = plainToInstance(WsSendMessageDto, data);
  const errors = await validate(dto);
  if (errors.length > 0) {
    client.emit('error', { message: 'Invalid message data' });
    return;
  }
  // ... rest of handler using dto properties
}
```

- Remove `private messageCounts = new Map<string, number>();`
- Remove `setInterval(() => this.messageCounts.clear(), 60000);`
- Make `checkRateLimit` async, update callers with `await`
- Add `@Inject('REDIS') private redis: Redis` to constructor

---

### Agent 11: Sanitize Enhancement + Global Pipe

**Files:**
- Create: `apps/api/src/common/pipes/sanitize.pipe.ts`
- Edit: `apps/api/src/common/utils/sanitize.ts`

**Step 1:** Enhance `sanitize.ts` to also strip null bytes and control characters:
```typescript
export function sanitizeText(input: string): string {
  return input
    .replace(/\0/g, '')           // Strip null bytes
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, '') // Strip control chars (keep \n \r \t)
    .replace(/<[^>]*>/g, '')      // Strip HTML
    .replace(/\n{3,}/g, '\n\n')   // Max 2 consecutive newlines
    .trim();
}
```

**Step 2:** Create `pipes/sanitize.pipe.ts` — a transform pipe that auto-sanitizes all string fields in DTOs:
```typescript
import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';
import { sanitizeText } from '../utils/sanitize';

@Injectable()
export class SanitizePipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type !== 'body' || typeof value !== 'object' || value === null) {
      return value;
    }
    return this.sanitizeObject(value);
  }

  private sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === 'string') {
        result[key] = sanitizeText(val);
      } else if (Array.isArray(val)) {
        result[key] = val.map(item => typeof item === 'string' ? sanitizeText(item) : item);
      } else {
        result[key] = val;
      }
    }
    return result;
  }
}
```

**Note:** Do NOT register globally yet — just create the pipe. Teams can adopt it per-controller with `@UsePipes(SanitizePipe)`.

---

## TIER 2: INFRASTRUCTURE (Agents 12-16)

---

### Agent 12: Compression Middleware + CORS Fix

**Files:**
- Edit: `apps/api/src/main.ts`
- Edit: `apps/api/package.json` (add `compression` dependency)

**Step 1:** Add `compression` to dependencies in `apps/api/package.json`:
```json
"compression": "^1.7.5"
```
Also add `@types/compression` to devDependencies:
```json
"@types/compression": "^1.7.5"
```

**Step 2:** Update `main.ts`:
- Add import: `import compression from 'compression';`
- After helmet setup (line 34), add: `app.use(compression());`
- Fix CORS line 24 to filter empty strings:
```typescript
origin: process.env.CORS_ORIGINS?.split(',').filter(Boolean) || ['http://localhost:8081'],
```

---

### Agent 13: CI/CD Pipeline

**Files:**
- Create: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint --workspace=apps/api
      - run: npm run typecheck --workspace=apps/mobile

  test-api:
    runs-on: ubuntu-latest
    needs: lint-and-typecheck
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: mizanly
          POSTGRES_PASSWORD: mizanly_test
          POSTGRES_DB: mizanly_test
        ports: ['5432:5432']
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
    env:
      DATABASE_URL: postgresql://mizanly:mizanly_test@localhost:5432/mizanly_test
      REDIS_URL: redis://localhost:6379
      CLERK_SECRET_KEY: test_secret
      NODE_ENV: test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx prisma generate --schema=apps/api/prisma/schema.prisma
      - run: npm test --workspace=apps/api -- --passWithNoTests

  build-api:
    runs-on: ubuntu-latest
    needs: test-api
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx prisma generate --schema=apps/api/prisma/schema.prisma
      - run: npm run build --workspace=apps/api
```

---

### Agent 14: Dockerfile + .dockerignore

**Files:**
- Create: `apps/api/Dockerfile`
- Create: `apps/api/.dockerignore`

**Step 1:** Create `apps/api/Dockerfile`:
```dockerfile
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace=apps/api --include-workspace-root

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN npm run build --workspace=apps/api

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nestjs
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/prisma ./prisma
USER nestjs
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

**Step 2:** Create `apps/api/.dockerignore`:
```
node_modules
dist
.env
.env.*
coverage
*.spec.ts
test
```

---

### Agent 15: Prettier + ESLint Root Config

**Files:**
- Create: `.prettierrc`
- Create: `.eslintrc.json`
- Edit: `package.json` (root — add format script)

**Step 1:** Create `.prettierrc`:
```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "semi": true,
  "arrowParens": "always"
}
```

**Step 2:** Create `.eslintrc.json`:
```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "no-console": ["warn", { "allow": ["warn", "error"] }]
  },
  "ignorePatterns": ["dist", "node_modules", "coverage"]
}
```

**Step 3:** Add to root `package.json` scripts:
```json
"format": "prettier --write \"apps/**/*.{ts,tsx}\" \"packages/**/*.ts\"",
"format:check": "prettier --check \"apps/**/*.{ts,tsx}\" \"packages/**/*.ts\""
```

**Note:** Do NOT run prettier/format on the codebase. Just create the configs. Formatting will be done in a separate step.

---

### Agent 16: Prisma Schema Fixes

**Files:**
- Edit: `apps/api/prisma/schema.prisma`

**Fix 1:** Add `onDelete: SetNull` to `Post.removedBy` relation. Find:
```prisma
removedBy   User?   @relation("PostRemover", fields: [removedById], references: [id])
```
Change to:
```prisma
removedBy   User?   @relation("PostRemover", fields: [removedById], references: [id], onDelete: SetNull)
```

**Fix 2:** Add missing performance indexes. After the model definitions, add these indexes if they don't already exist. Check before adding — many may already be there:

For `Message` model, ensure:
```prisma
@@index([conversationId, createdAt(sort: Desc)])
```

For `Notification` model, ensure:
```prisma
@@index([userId, isRead])
```

For `FeedInteraction` model, ensure a compound index:
```prisma
@@index([userId, contentId])
```

**Important:** Only add indexes that are genuinely missing. Read the existing schema carefully before editing.

---

## TIER 3: PLATFORM (Agents 17-22)

---

### Agent 17: Shared Package Enhancement

**Files:**
- Edit: `packages/shared/src/index.ts`
- Edit: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`

**Step 1:** Add TypeScript config for shared package (`tsconfig.json`):
```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "commonjs",
    "lib": ["ES2021"],
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

**Step 2:** Update `packages/shared/package.json` to add build script and main entry:
```json
{
  "name": "@mizanly/shared",
  "version": "0.1.0",
  "main": "src/index.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  }
}
```

**Step 3:** Add shared types to `src/index.ts` — pagination response type, API error type, content space enum with descriptions. Keep existing constants. Add:
```typescript
export interface PaginatedResponse<T> {
  data: T[];
  meta: { cursor?: string; hasMore: boolean };
}

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  timestamp: string;
}

export type ContentSpace = 'SAF' | 'BAKRA' | 'MAJLIS' | 'RISALAH' | 'MINBAR';

export const REPORT_REASONS = [
  'SPAM', 'HARASSMENT', 'HATE_SPEECH', 'VIOLENCE', 'NUDITY',
  'FALSE_INFO', 'IMPERSONATION', 'INTELLECTUAL_PROPERTY', 'OTHER',
] as const;
```

---

### Agent 18: Privacy/GDPR Module

**Files:**
- Create: `apps/api/src/modules/privacy/privacy.controller.ts`
- Create: `apps/api/src/modules/privacy/privacy.service.ts`
- Create: `apps/api/src/modules/privacy/privacy.module.ts`
- Edit: `apps/api/src/app.module.ts`

**Step 1:** Create `privacy.service.ts`:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);

  constructor(private prisma: PrismaService) {}

  async exportUserData(userId: string) {
    const [user, posts, threads, stories, messages, follows] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, include: { profileLinks: true, channel: true } }),
      this.prisma.post.findMany({ where: { userId }, select: { id: true, content: true, mediaUrls: true, createdAt: true } }),
      this.prisma.thread.findMany({ where: { userId }, select: { id: true, content: true, createdAt: true } }),
      this.prisma.story.findMany({ where: { userId }, select: { id: true, mediaUrl: true, createdAt: true } }),
      this.prisma.message.findMany({ where: { senderId: userId }, select: { id: true, content: true, createdAt: true }, take: 10000 }),
      this.prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } }),
    ]);

    this.logger.log(`Data export requested for user ${userId}`);

    return {
      profile: user,
      posts,
      threads,
      stories,
      messages: { count: messages.length, data: messages },
      following: follows.map(f => f.followingId),
      exportedAt: new Date().toISOString(),
    };
  }

  async deleteAllUserData(userId: string) {
    // Prisma cascade handles most deletions, but log the action
    this.logger.warn(`Full data deletion requested for user ${userId}`);

    await this.prisma.user.delete({ where: { id: userId } });

    return { deleted: true, userId, deletedAt: new Date().toISOString() };
  }
}
```

**Step 2:** Create `privacy.controller.ts`:
```typescript
import { Controller, Get, Delete, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrivacyService } from './privacy.service';

@ApiTags('Privacy (GDPR/CCPA)')
@Controller('privacy')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class PrivacyController {
  constructor(private privacyService: PrivacyService) {}

  @Get('export')
  @ApiOperation({ summary: 'Export all user data (GDPR Article 20)' })
  exportData(@CurrentUser('id') userId: string) {
    return this.privacyService.exportUserData(userId);
  }

  @Delete('delete-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete all user data permanently (GDPR Article 17)' })
  deleteAll(@CurrentUser('id') userId: string) {
    return this.privacyService.deleteAllUserData(userId);
  }
}
```

**Step 3:** Create `privacy.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';

@Module({
  controllers: [PrivacyController],
  providers: [PrivacyService],
})
export class PrivacyModule {}
```

**Step 4:** Register in `app.module.ts`:
- Add import: `import { PrivacyModule } from './modules/privacy/privacy.module';`
- Add `PrivacyModule` to imports array (after SubtitlesModule)

---

### Agent 19: Posts Service Cache Invalidation

**Files:**
- Edit: `apps/api/src/modules/posts/posts.service.ts`

**Current state:** Redis caches "for you" feed with 30s TTL (good), but cache is never explicitly invalidated on writes.

**Changes:**
- After `create()`: invalidate for-you feed cache for the author → `await this.redis.del(\`posts:foryou:${userId}\`);`
- After `delete()`: invalidate for-you feed cache → `await this.redis.del(\`posts:foryou:${userId}\`);`
- After `react()` / `unreact()`: no invalidation needed (30s TTL is fine for reactions)

Find the `create` method return statement and add cache invalidation before it. Same for `delete`.

---

### Agent 20: Users Service Cache Invalidation

**Files:**
- Edit: `apps/api/src/modules/users/users.service.ts`

**Current state:** Profile cached by username for 5 minutes. Never invalidated on update.

**Changes:**
- After `updateProfile()`: get the user's username and invalidate: `await this.redis.del(\`user:${user.username}\`);`
- After `deactivate()` / `deleteAccount()`: invalidate: `await this.redis.del(\`user:${username}\`);`

Find the `updateProfile` method, after the Prisma update call, add the redis.del call. You'll need to fetch the username from the updated record.

---

### Agent 21: Search Rate Limiting

**Files:**
- Edit: `apps/api/src/modules/search/search.controller.ts`

**Current problem:** Search endpoints have no rate limiting — can be abused to scrape content.

**Changes:**
- Add `import { Throttle } from '@nestjs/throttler';`
- Add `import { UseGuards } from '@nestjs/common';` (already imported)
- Add `@Throttle({ default: { limit: 30, ttl: 60000 } })` to `search()` method
- Add `@Throttle({ default: { limit: 20, ttl: 60000 } })` to `trending()` method
- Add `@Throttle({ default: { limit: 30, ttl: 60000 } })` to `getHashtagPosts()` method

---

### Agent 22: Recommendations Rate Limiting

**Files:**
- Edit: `apps/api/src/modules/recommendations/recommendations.controller.ts`

**Changes:** Read the current controller, then add `@Throttle` decorators to all endpoints. Use `{ default: { limit: 20, ttl: 60000 } }` for recommendation endpoints.

Also add `import { Throttle } from '@nestjs/throttler';` if not already present.

---

## TIER 4: QUALITY (Agents 23-25)

---

### Agent 23: Recommendations Service Spec

**Files:**
- Create: `apps/api/src/modules/recommendations/recommendations.service.spec.ts`

**Pattern:** Follow existing spec files in the project. Look at `apps/api/src/modules/posts/posts.service.spec.ts` for the mocking pattern. Create a spec that:
1. Creates a testing module with mocked PrismaService and Redis
2. Tests `getRecommendedUsers()` — returns array
3. Tests `getRecommendedContent()` — returns array
4. Tests `getSimilarContent()` — returns array
5. Tests edge cases: empty results, user not found

Use `as any` for mocks (allowed in test files per CLAUDE.md rule 13).

---

### Agent 24: Mobile Test Foundation

**Files:**
- Create: `apps/mobile/jest.config.ts`
- Create: `apps/mobile/jest.setup.ts`
- Edit: `apps/mobile/package.json` (add test deps)

**Step 1:** Add to `apps/mobile/package.json` devDependencies:
```json
"jest": "^29.7.0",
"@testing-library/react-native": "^12.4.0",
"@testing-library/jest-native": "^5.4.3",
"@types/jest": "^29.5.0",
"jest-expo": "~52.0.0",
"react-test-renderer": "18.3.1"
```

Add script:
```json
"test": "jest",
"test:watch": "jest --watch"
```

**Step 2:** Create `jest.config.ts`:
```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'jest-expo',
  setupFilesAfterSetup: ['./jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@shopify/flash-list|lucide-react-native|zustand)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
  ],
};

export default config;
```

**Step 3:** Create `jest.setup.ts`:
```typescript
import '@testing-library/jest-native/extend-expect';

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  Link: 'Link',
}));
```

---

### Agent 25: Documentation

**Files:**
- Create: `docs/DEPLOYMENT.md`
- Create: `docs/ONBOARDING.md`

**Step 1:** Create `docs/DEPLOYMENT.md` covering:
- Production stack: Railway (API), Neon (PostgreSQL), Upstash (Redis), Cloudflare R2 (storage), Meilisearch Cloud (search)
- Environment variables checklist (all 20+ vars from .env.example)
- Docker build and deploy steps
- Database migration: `npx prisma db push`
- Monitoring: Sentry DSN setup
- Health check endpoint: `GET /api/v1/health`
- Scaling strategy: Railway auto-scale, Neon serverless, Upstash serverless

**Step 2:** Create `docs/ONBOARDING.md` covering:
- Prerequisites: Node 20+, npm 10+, Docker Desktop
- Clone + install: `npm install` from root
- Local services: `docker compose up -d` (PostgreSQL, Redis, Meilisearch)
- Environment setup: copy `.env.example` files
- Database: `npx prisma generate && npx prisma db push`
- Run API: `npm run dev:api` → Swagger at http://localhost:3000/docs
- Run Mobile: `npm run dev:mobile` → Expo on port 8081
- Testing: `npm test --workspace=apps/api`
- Common issues and solutions

---

## POST-BATCH VERIFICATION

After all 25 agents complete:

1. **Backend compilation:** Run `cd apps/api && npx tsc --noEmit` — must be 0 errors
2. **Tests:** Run `cd apps/api && npm test` — all existing tests must pass
3. **New files:** Verify all DTOs have proper class-validator decorators
4. **Schema:** Run `npx prisma validate --schema=apps/api/prisma/schema.prisma`
5. **No conflicts:** `git diff --stat` — every changed file should appear only once

---

## BATCH SUMMARY

| Tier | Agents | Focus |
|------|--------|-------|
| Security | 1-11 | DTO validation, sanitization, rate limiting |
| Infrastructure | 12-16 | Compression, CI/CD, Docker, linting, schema |
| Platform | 17-22 | Shared package, GDPR, cache invalidation, throttling |
| Quality | 23-25 | Tests, mobile test setup, documentation |
| **Total** | **25** | **Zero file conflicts** |
