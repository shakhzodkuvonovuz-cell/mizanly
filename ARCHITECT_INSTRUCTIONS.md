# ARCHITECT INSTRUCTIONS — Mizanly (Batch 3)
## For Sonnet/Haiku: Read CLAUDE.md first, then this file top to bottom.

**Last updated:** 2026-03-06 by Claude Opus 4.6
**Previous batches:** Batch 1 (56 tasks, 46 done) → Batch 2 (27 tasks, 20 done) → This file.

---

## CRITICAL CONTEXT

A 3rd-party audit (`docs/audit/`) rated the project 3.8/10. Some findings are valid, some are wrong:

**FALSE FINDING — "SQL Injection":** The audit claims `$executeRaw` is vulnerable. This is WRONG. All 18 calls use Prisma's tagged template literals (`$executeRaw\`...\``), which auto-parameterize values. There are ZERO `$executeRawUnsafe` calls. Do NOT "fix" this — it's already safe.

**VALID findings to address:** No tests, no monitoring, no CI/CD, no privacy compliance, missing security headers, Redis not implemented, `as any` casts in backend services.

---

## STEP 0: CLEANUP FIRST

### 0.1 Delete junk files
```bash
rm apps/mobile/src/store/index.ts.bak
rm apps/mobile/src/store/index.ts.bak2
rm temp
rm temp_plan.md
```

### 0.2 Remove stale worktrees
```bash
git worktree remove .worktrees/feature-voice-messages --force
git worktree remove .worktrees/feature-search-discovery --force
git worktree remove .worktrees/step3-search-discovery --force
git worktree remove .worktrees/batch2-implementation --force
git worktree remove .worktrees/step4-profile-polish --force
git worktree remove .claude/worktrees/sad-beaver --force
```

### 0.3 Commit cleanup + untracked docs
```bash
git add -A
git commit -m "chore: cleanup stale worktrees, backup files, temp files"
```

---

## STEP 1: REMAINING BATCH 2 ITEMS (7 tasks)

### 1.1 Content Search — Wire Posts + Threads tabs
**File:** `apps/mobile/app/(screens)/search.tsx`
**Problem:** Posts and Threads tabs show `<EmptyState>` placeholder "Full-text search coming soon".
**Fix:** Replace placeholder with actual search:
```tsx
// For Posts tab:
const postsQuery = useInfiniteQuery({
  queryKey: ['search-posts', debouncedQuery],
  queryFn: ({ pageParam }) => searchApi.search(debouncedQuery, 'post', pageParam),
  enabled: !!debouncedQuery && activeTab === 'posts',
  getNextPageParam: (last) => last.meta?.cursor,
  initialPageParam: undefined,
});
// Render with <PostCard> in a FlatList
```
Do the same for Threads tab with `<ThreadCard>`. Both need `onEndReached` for pagination.

**Backend check:** Verify `searchApi.search(query, 'post')` and `searchApi.search(query, 'thread')` exist in `apps/mobile/src/services/api.ts`. If not, add them — the backend's `SearchController` should accept type='post'|'thread'.

### 1.2 Search History
**File:** `apps/mobile/app/(screens)/search.tsx`
**Steps:**
1. `import AsyncStorage from '@react-native-async-storage/async-storage'`
2. State: `const [searchHistory, setSearchHistory] = useState<string[]>([])`
3. On mount: load from `AsyncStorage.getItem('search-history')`, parse JSON
4. On search submit: prepend to history (max 20), save to AsyncStorage
5. When query is empty and input focused: show history list with "x" to remove each + "Clear All"
6. Tap history item → set it as query

### 1.3 Explore Grid
**File:** `apps/mobile/app/(screens)/search.tsx`
**Steps:**
1. When search is NOT active (empty query, not focused), show explore grid
2. Fetch: `postsApi.getFeed('foryou')` or create `postsApi.getExplore()` endpoint
3. Render: `<FlatList numColumns={3}>` with square image thumbnails
4. Each cell: `<Pressable onPress={() => router.push(\`/post/\${post.id}\`)}>`
5. Video posts: overlay `<Icon name="play" />` in corner
6. Style: `aspectRatio: 1`, `gap: 2` between cells

### 1.4 QR Code Screen
**Steps:**
1. Install: `npx expo install react-native-qrcode-svg react-native-svg` (run in Windows terminal)
2. Create `apps/mobile/app/(screens)/qr-code.tsx`:
```tsx
import QRCode from 'react-native-qrcode-svg';
// Accept username via route params
// Render QRCode encoding `mizanly://profile/${username}`
// Share button using Share.share()
// Save button using expo-media-library (optional, can defer)
```
3. In `profile/[username].tsx`, wire share button to show BottomSheet with "Share Profile" + "QR Code" options. "QR Code" navigates to `/qr-code?username=${username}`.

### 1.5 Pull-to-Refresh on profile/[username].tsx
**File:** `apps/mobile/app/(screens)/profile/[username].tsx`
**Steps:**
1. Add `refreshing` state
2. Add `handleRefresh` that invalidates the profile + posts queries
3. Add `<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.emerald} />` to the FlatList

### 1.6 Fix Onboarding Username Registration
**File:** `apps/mobile/app/onboarding/profile.tsx`
**Problem:** Username chosen in step 1 is passed via route params but never sent to backend. Only `displayName` and `bio` are sent.
**Fix:**
```tsx
// In profile.tsx handleFinish/handleContinue:
const username = params.username; // from route params
await usersApi.updateMe({ displayName, bio, username });
```
Also verify the backend's `updateMe` endpoint accepts `username` in `UpdateUserDto`.

### 1.7 Remaining borderRadius
**Minor — fix only if touching these files for other reasons:**
- `create-thread.tsx:661` — `borderRadius: 4` → `radius.sm`
- `create-story.tsx:220` — `borderRadius: 14` → `radius.lg`
- `conversation/[id].tsx:1215` — `borderRadius: 6` → `radius.sm`
- `borderRadius: 1` on thin lines/bars is fine, leave as-is

---

## STEP 2: BACKEND HARDENING

### 2.1 Security Headers Middleware
**File:** Create `apps/api/src/common/middleware/security-headers.middleware.ts`
```ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '0'); // modern browsers don't need it, CSP is better
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    // Don't add CSP — mobile app doesn't load web content from API
    next();
  }
}
```
Register in `app.module.ts`:
```ts
configure(consumer: MiddlewareConsumer) {
  consumer.apply(SecurityHeadersMiddleware).forRoutes('*');
}
```

### 2.2 Environment-Aware Error Filter
**File:** `apps/api/src/common/filters/http-exception.filter.ts`
**Problem:** Stack traces may leak in production.
**Fix:** Check `process.env.NODE_ENV`:
```ts
if (process.env.NODE_ENV === 'production') {
  // Return generic message, log full error server-side
  response.status(status).json({
    statusCode: status,
    message: status >= 500 ? 'Internal server error' : message,
    timestamp: new Date().toISOString(),
  });
} else {
  // Return full error details in development
  response.status(status).json({
    statusCode: status, message, stack: exception.stack,
    timestamp: new Date().toISOString(),
  });
}
```

### 2.3 Health Check Endpoint
**File:** Create `apps/api/src/modules/health/health.controller.ts`
```ts
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async check() {
    const dbOk = await this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    return {
      status: dbOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      database: dbOk ? 'up' : 'down',
    };
  }
}
```
Register `HealthModule` in `app.module.ts`.

### 2.4 WebSocket Rate Limiting
**File:** `apps/api/src/gateways/chat.gateway.ts`
**Steps:**
1. Track message counts per userId with a Map or Redis
2. Allow max 30 messages/minute per user
3. On rate limit exceeded: `socket.emit('error', { message: 'Rate limit exceeded' })`
4. Reset counter every 60 seconds

### 2.5 Fix Remaining `as any` Casts in Backend
**These are the real ones that should be proper enums:**

| File | Line | Current | Fix |
|------|------|---------|-----|
| `posts.service.ts:122` | `dto.postType as any` | Import `PostType` enum from Prisma, cast properly |
| `posts.service.ts:124` | `(dto.visibility as any) ?? 'PUBLIC'` | Import `Visibility` enum from Prisma |
| `posts.service.ts:228,233` | `reaction as any` | Import `Reaction` enum from Prisma |
| `posts.service.ts:495` | `(reasonMap[reason] ?? 'OTHER') as any` | Import `ReportReason` enum |
| `threads.service.ts:162` | `(dto.visibility as any) ?? 'PUBLIC'` | Import `Visibility` enum |
| `threads.service.ts:554` | reason cast | Import `ReportReason` enum |
| `messages.service.ts:145` | `(data.messageType as any) ?? 'TEXT'` | Import `MessageType` enum |
| `notifications.service.ts:113` | `params.type as any` | Import `NotificationType` enum |
| `stories.service.ts:123` | `data.stickerData as any` | Type as `Prisma.InputJsonValue` |
| `search.controller.ts:14` | `type as any` | Define union type for search type param |
| `users.service.ts:453` | reason cast | Import `ReportReason` enum |

**Pattern:** All Prisma enums are auto-generated. Import from `@prisma/client`:
```ts
import { PostType, Visibility, Reaction, ReportReason, MessageType, NotificationType } from '@prisma/client';
```
Then use `dto.postType as PostType` instead of `as any`.

### 2.6 Endpoint-Specific Rate Limiting
**Files:** Controllers with sensitive operations
**Steps:**
1. Import `@Throttle()` from `@nestjs/throttler`
2. Apply to sensitive endpoints:
   - `POST /posts` — `@Throttle({ default: { limit: 10, ttl: 60000 } })`
   - `POST /threads` — same
   - `POST /stories` — same
   - `POST /messages/.../send` — `@Throttle({ default: { limit: 30, ttl: 60000 } })`
   - `POST /auth/check-username` — already has 20/min

---

## STEP 3: REDIS IMPLEMENTATION

### 3.1 Create Redis Module
**File:** Create `apps/api/src/config/redis.module.ts`
```ts
import { Module, Global } from '@nestjs/common';
import Redis from 'ioredis';

const REDIS_PROVIDER = {
  provide: 'REDIS',
  useFactory: () => {
    return new Redis(process.env.UPSTASH_REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });
  },
};

@Global()
@Module({ providers: [REDIS_PROVIDER], exports: [REDIS_PROVIDER] })
export class RedisModule {}
```
Register in `app.module.ts`.

### 3.2 Cache User Profiles
**File:** `apps/api/src/modules/users/users.service.ts`
```ts
// In constructor: @Inject('REDIS') private redis: Redis
// In getProfile:
const cached = await this.redis.get(`user:${username}`);
if (cached) return JSON.parse(cached);
// ... fetch from DB ...
await this.redis.setex(`user:${username}`, 300, JSON.stringify(user)); // 5 min TTL
```
Invalidate on profile update: `await this.redis.del(\`user:\${username}\`)`.

### 3.3 Cache Feed Responses
**File:** `apps/api/src/modules/posts/posts.service.ts`
**Cache the "for you" feed for 30 seconds per user:**
```ts
const cacheKey = `feed:foryou:${userId}:${cursor ?? 'first'}`;
const cached = await this.redis.get(cacheKey);
if (cached) return JSON.parse(cached);
// ... generate feed ...
await this.redis.setex(cacheKey, 30, JSON.stringify(result));
```

---

## STEP 4: TESTING FOUNDATION

### 4.1 Backend Unit Test Setup
```bash
# In Windows terminal:
cd apps/api && npm install --save-dev @nestjs/testing jest @types/jest ts-jest
```
Create `apps/api/jest.config.ts`:
```ts
export default {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
```

### 4.2 Write First Tests — Users Service
**File:** Create `apps/api/src/modules/users/users.service.spec.ts`
Test the most critical paths:
- `getProfile()` returns user data
- `updateMe()` validates input
- `reportUser()` creates a report record
- `getProfile()` returns null for nonexistent user

Mock Prisma with `@prisma/client/testing`.

### 4.3 Write First Tests — Posts Service
**File:** Create `apps/api/src/modules/posts/posts.service.spec.ts`
- `createPost()` creates post and increments count
- `deletePost()` soft-deletes and decrements count
- `likePost()` creates like record
- `unlikePost()` removes like record
- Feed generation excludes blocked users

### 4.4 API Integration Test Example
**File:** Create `apps/api/test/posts.e2e-spec.ts`
Use NestJS testing module to spin up the app and test full request cycle:
- `POST /api/v1/posts` creates a post
- `GET /api/v1/posts/:id` returns the post
- `DELETE /api/v1/posts/:id` removes it

---

## STEP 5: MOBILE POLISH

### 5.1 Double-Tap to Like (Saf)
**File:** `apps/mobile/src/components/saf/PostCard.tsx`
**Steps:**
1. Wrap image area in `<Pressable>` with double-tap detection
2. On double-tap: if not already liked, trigger like mutation
3. Show brief heart animation overlay (Reanimated scale + fade)
4. Add haptic feedback (`useHaptic().medium()`)

### 5.2 Heart Like Animation
**File:** `apps/mobile/src/components/saf/PostCard.tsx`
**Steps:**
1. On like: show `<Icon name="heart-filled" color={colors.error} />` centered on post image
2. Animate: scale from 0 → 1.2 → 1 → 0 over 800ms using `withSequence`
3. After animation: update like state

### 5.3 Message Send Animation
**File:** `apps/mobile/app/(screens)/conversation/[id].tsx`
**Steps:**
1. When a message is sent, animate the new bubble sliding up from bottom
2. Use `Animated.View` with `translateY` from screen height to 0
3. Duration: 200ms with spring animation

### 5.4 Missing Accessibility Labels
Run through ALL interactive elements and add:
- `accessibilityLabel` — describes what it is
- `accessibilityRole` — "button", "link", "image", etc.
- `accessibilityHint` — describes what happens when tapped

Priority screens (most user-facing):
1. `saf.tsx` — feed tab
2. `majlis.tsx` — threads tab
3. `risalah.tsx` — messages tab
4. `PostCard.tsx` — every post
5. `ThreadCard.tsx` — every thread

---

## ABSOLUTE RULES — NEVER VIOLATE

1. **NEVER use RN `Modal`** → Always `<BottomSheet>`
2. **NEVER use text emoji for icons** → Always `<Icon name="..." />`
3. **NEVER hardcode border radius >= 6** → Always `radius.*` from theme
4. **NEVER use bare "No items" text** → Always `<EmptyState>`
5. **NEVER create new files unless necessary** → Edit existing first
6. **NEVER change Prisma schema field names** → They are final
7. **NEVER use `@CurrentUser()` without `'id'`** → Always `@CurrentUser('id')`
8. **ALL FlatLists must have `<RefreshControl>`**
9. **NEVER use `any` in new code** → Type everything properly
10. **ActivityIndicator OK in buttons only** — use `<Skeleton>` for content loading
11. **NEVER call both socket.emit AND REST mutation for the same action**
12. **The `$executeRaw` tagged template literals are SAFE** — do NOT replace them with Prisma increment/decrement (we need GREATEST clamping)

---

## PRIORITY QUEUE

Work in this exact order. Commit after each step.

```
STEP 0 — CLEANUP
[ ] 0.1  Delete junk files (.bak, temp, temp_plan.md)
[ ] 0.2  Remove 6 stale worktrees
[ ] 0.3  Commit cleanup

STEP 1 — REMAINING BATCH 2
[ ] 1.1  Wire content search (posts + threads tabs)
[ ] 1.2  Search history with AsyncStorage
[ ] 1.3  Explore grid (3-column trending)
[ ] 1.4  QR code screen + wire share button
[ ] 1.5  Pull-to-refresh on profile/[username].tsx
[ ] 1.6  Fix onboarding username registration
[ ] 1.7  Fix remaining borderRadius (minor)

STEP 2 — BACKEND HARDENING
[ ] 2.1  Security headers middleware
[ ] 2.2  Environment-aware error filter
[ ] 2.3  Health check endpoint
[ ] 2.4  WebSocket rate limiting
[ ] 2.5  Fix remaining `as any` casts (11 in backend)
[ ] 2.6  Endpoint-specific rate limiting

STEP 3 — REDIS
[ ] 3.1  Create Redis module
[ ] 3.2  Cache user profiles (5 min TTL)
[ ] 3.3  Cache feed responses (30 sec TTL)

STEP 4 — TESTING FOUNDATION
[ ] 4.1  Backend unit test setup (Jest + ts-jest)
[ ] 4.2  Users service tests
[ ] 4.3  Posts service tests
[ ] 4.4  API integration test example

STEP 5 — MOBILE POLISH
[ ] 5.1  Double-tap to like on PostCard
[ ] 5.2  Heart like animation
[ ] 5.3  Message send animation
[ ] 5.4  Accessibility labels on priority screens
```

Each step is 15-60 minutes. Commit after each step number.

---

## WHAT NOT TO TOUCH (deferred / out of scope)

- Bakra (TikTok space) — V1.1, not this batch
- Minbar (YouTube space) — V1.2, not this batch
- E2E encryption — V2.0
- Monetization / payments — separate initiative
- GDPR/CCPA compliance — needs legal review first
- CI/CD pipeline — needs DevOps setup, not a code task
- Multi-region deployment — infrastructure, not code
- The `$executeRaw` calls — they are SAFE, leave them alone
