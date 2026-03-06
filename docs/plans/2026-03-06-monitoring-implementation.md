# Monitoring & Observability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add production-ready monitoring (structured logging, correlation IDs, error tracking, metrics) to Mizanly API following ARCHITECT_INSTRUCTIONS.md Step 3.

**Architecture:** Install nestjs-pino for structured logging, create correlation ID middleware, integrate Sentry for error tracking, extend HealthController with metrics endpoint.

**Tech Stack:** NestJS 10, TypeScript, Prisma, Redis, Pino, Sentry

---

## Task 1: Install Dependencies

**Files:**
- Modify: `apps/api/package.json`

**Step 1: Open package.json and check current dependencies**

Run: `cd apps/api && npm list nestjs-pino pino pino-http pino-pretty @sentry/nestjs @sentry/node` to confirm they're not installed.

**Step 2: Install dependencies in Windows terminal**

Run: `cd apps/api && npm install nestjs-pino pino pino-http pino-pretty @sentry/nestjs @sentry/node`

**Step 3: Verify installation**

Run: `cd apps/api && npm list nestjs-pino` should show version installed.

**Step 4: Check lockfile**

Verify `package-lock.json` has been updated with new dependencies.

**Step 5: Commit**

```bash
cd apps/api && git add package.json package-lock.json
git commit -m "feat: add monitoring dependencies (pino, sentry)"
```

---

## Task 2: Configure Pino Logging in AppModule

**Files:**
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/main.ts:50`

**Step 1: Add LoggerModule import to app.module.ts**

```typescript
// Add to imports at top:
import { LoggerModule } from 'nestjs-pino';

// Replace @Module imports array (around line 27):
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
        redact: ['req.headers.authorization', 'req.headers.cookie'],
      },
    }),
    ConfigModule.forRoot({ isGlobal: true }),
    // ... rest of imports
  ],
```

**Step 2: Add Logger initialization in main.ts**

```typescript
// Add after Swagger setup (around line 45):
  // Pino Logger
  app.useLogger(app.get(Logger));
```

**Step 3: Test the application compiles**

Run: `cd apps/api && npm run build` to verify no TypeScript errors.

**Step 4: Start dev server to verify logging**

Run: `cd apps/api && npm run start:dev` and check console output shows structured logs.

**Step 5: Commit**

```bash
cd apps/api && git add src/app.module.ts src/main.ts
git commit -m "feat: configure pino structured logging"
```

---

## Task 3: Create Correlation ID Middleware

**Files:**
- Create: `apps/api/src/common/middleware/correlation-id.middleware.ts`
- Modify: `apps/api/src/app.module.ts:53-57`

**Step 1: Create correlation-id.middleware.ts**

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const correlationId = (req.headers['x-correlation-id'] as string) || randomUUID();
    req.headers['x-correlation-id'] = correlationId;
    res.setHeader('x-correlation-id', correlationId);
    next();
  }
}
```

**Step 2: Update AppModule to apply middleware**

```typescript
// In AppModule class:
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware, SecurityHeadersMiddleware).forRoutes('*');
  }
```

**Step 3: Import middleware in AppModule**

```typescript
// Add to imports section:
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
```

**Step 4: Test middleware works**

Run: `cd apps/api && npm run build` then start dev server and check logs for correlation IDs.

**Step 5: Commit**

```bash
cd apps/api && git add src/common/middleware/correlation-id.middleware.ts src/app.module.ts
git commit -m "feat: add correlation ID middleware"
```

---

## Task 4: Create Sentry Configuration

**Files:**
- Create: `apps/api/src/config/sentry.ts`
- Modify: `apps/api/src/main.ts:9-11`
- Modify: `apps/api/src/common/filters/http-exception.filter.ts:51-73`

**Step 1: Create sentry.ts config file**

```typescript
import * as Sentry from '@sentry/node';

export function initSentry() {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0.1, // 10% of requests
      beforeSend(event) {
        // Scrub sensitive data
        if (event.request?.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['cookie'];
        }
        return event;
      },
    });
  }
}
```

**Step 2: Initialize Sentry in main.ts**

```typescript
// Add to imports:
import { initSentry } from './config/sentry';

// Call before NestFactory.create():
initSentry();
const app = await NestFactory.create(AppModule, {
  rawBody: true,
});
```

**Step 3: Update HttpExceptionFilter to capture 5xx errors**

```typescript
// Add to imports:
import * as Sentry from '@sentry/node';

// Inside catch block, for unhandled exceptions (around line 51):
} else {
  this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : String(exception));

  // Capture 5xx errors in Sentry
  if (process.env.SENTRY_DSN && exception instanceof Error) {
    Sentry.captureException(exception);
  }

  // Rest of existing code...
}

// For HttpExceptions (around line 20):
if (exception instanceof HttpException) {
  const status = exception.getStatus();

  // Capture 5xx errors in Sentry
  if (process.env.SENTRY_DSN && status >= 500 && exception instanceof Error) {
    Sentry.captureException(exception);
  }

  // Rest of existing code...
}
```

**Step 4: Test Sentry integration**

Run: `cd apps/api && npm run build` to verify no TypeScript errors.

**Step 5: Commit**

```bash
cd apps/api && git add src/config/sentry.ts src/main.ts src/common/filters/http-exception.filter.ts
git commit -m "feat: add Sentry error tracking"
```

---

## Task 5: Add Metrics Endpoint to HealthController

**Files:**
- Modify: `apps/api/src/modules/health/health.controller.ts`

**Step 1: Add metrics endpoint method**

```typescript
// Add to HealthController class:
  @Get('metrics')
  @ApiOperation({ summary: 'API metrics (counts, system health)' })
  async metrics() {
    const [userCount, postCount, threadCount, reelCount] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.post.count({ where: { deletedAt: null } }),
      this.prisma.thread.count({ where: { deletedAt: null } }),
      this.prisma.reel.count({ where: { status: 'READY' } }),
    ]);
    return {
      timestamp: new Date().toISOString(),
      counts: { users: userCount, posts: postCount, threads: threadCount, reels: reelCount },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
  }
```

**Step 2: Update imports if needed**

Check that `PrismaService` is already imported.

**Step 3: Test endpoint locally**

Run dev server and curl: `curl http://localhost:3000/api/v1/health/metrics`

**Step 4: Verify response structure**

Should return JSON with counts, uptime, memory usage.

**Step 5: Commit**

```bash
cd apps/api && git add src/modules/health/health.controller.ts
git commit -m "feat: add metrics endpoint to health controller"
```

---

## Task 6: Replace console.log with Logger in main.ts

**Files:**
- Modify: `apps/api/src/main.ts:50`

**Step 1: Import Logger from @nestjs/common**

```typescript
import { Logger } from '@nestjs/common';
```

**Step 2: Replace console.log with logger**

```typescript
// Replace line 50:
console.log(`🟢 Mizanly API running on port ${port}`);
// With:
new Logger('Bootstrap').log(`🟢 Mizanly API running on port ${port}`);
```

**Step 3: Test startup log appears**

Run dev server and verify log appears with structured format.

**Step 4: Verify no other console.log calls exist**

Run: `grep -r "console\.log" apps/api/src/ --include="*.ts"` should only show main.ts (already fixed).

**Step 5: Commit**

```bash
cd apps/api && git add src/main.ts
git commit -m "refactor: replace console.log with structured logger"
```

---

## Task 7: Test Complete Integration

**Files:**
- All modified files

**Step 1: Build the application**

Run: `cd apps/api && npm run build` - should succeed with no errors.

**Step 2: Start dev server**

Run: `cd apps/api && npm run start:dev`

**Step 3: Test correlation IDs**

Make a request: `curl -v http://localhost:3000/api/v1/health` and check response headers for `x-correlation-id`.

**Step 4: Test metrics endpoint**

`curl http://localhost:3000/api/v1/health/metrics` should return counts.

**Step 5: Test structured logging**

Check server console for structured JSON logs with correlation IDs.

**Step 6: Commit final verification**

```bash
cd apps/api && git add .
git commit -m "feat: complete monitoring implementation (structured logging, correlation IDs, Sentry, metrics)"
```

---

Plan complete and saved to `docs/plans/2026-03-06-monitoring-implementation.md`.

Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?