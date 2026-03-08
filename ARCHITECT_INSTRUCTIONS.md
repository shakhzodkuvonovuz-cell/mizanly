# ARCHITECT INSTRUCTIONS — Mizanly (Batch 17: Platform Intelligence + Creator Tools)
## For Sonnet/Haiku: Read CLAUDE.md first, then this file top to bottom.

**Last updated:** 2026-03-08 by Claude Opus 4.6
**Previous batches:** 1-16 → See `docs/PROJECT_HISTORY.md`

---

## Context

Batch 16 cleaned the entire codebase — zero stubs, zero violations, zero broken wiring. Now we advance. This batch transforms Mizanly from "working app" to "intelligent platform" by adding:

1. **Engagement-scored feeds** — For You feeds ranked by engagement × recency, not just chronological
2. **Admin moderation** — Review reports, ban users, remove content
3. **Content recommendations** — People you may know, suggested content
4. **Creator analytics screen** — Visualize engagement, growth, reach
5. **Discover screen** — Trending hashtags, hot content across all spaces
6. **Content preferences** — Filter settings, content sensitivity controls
7. **Notification quiet hours** — DND schedule

**13 agents. All parallel except Agent 13 (docs) runs last.**

---

## Step 1 — Admin Moderation Module (Backend)
**Agent 1** | NEW files:
- `apps/api/src/modules/admin/admin.module.ts` (NEW)
- `apps/api/src/modules/admin/admin.controller.ts` (NEW)
- `apps/api/src/modules/admin/admin.service.ts` (NEW)
- `apps/api/src/modules/admin/admin.service.spec.ts` (NEW)

Create a full admin moderation module. Read CLAUDE.md for patterns.

### admin.module.ts
```ts
import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
```

### admin.controller.ts

Create these endpoints (all require ClerkAuthGuard + admin check):

```ts
@ApiTags('Admin')
@Controller('admin')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(private adminService: AdminService) {}

  // GET /admin/reports?status=PENDING&cursor=...
  // Returns paginated reports with reporter + reported content
  @Get('reports')
  getReports(
    @CurrentUser('id') adminId: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.adminService.getReports(adminId, status, cursor);
  }

  // GET /admin/reports/:id — Single report with full context
  @Get('reports/:id')
  getReport(
    @CurrentUser('id') adminId: string,
    @Param('id') reportId: string,
  ) {
    return this.adminService.getReport(adminId, reportId);
  }

  // PATCH /admin/reports/:id — Resolve a report (dismiss / warn / remove content / ban user)
  @Patch('reports/:id')
  resolveReport(
    @CurrentUser('id') adminId: string,
    @Param('id') reportId: string,
    @Body() dto: { action: 'DISMISS' | 'WARN' | 'REMOVE_CONTENT' | 'BAN_USER'; note?: string },
  ) {
    return this.adminService.resolveReport(adminId, reportId, dto.action, dto.note);
  }

  // GET /admin/stats — Platform-wide stats (total users, posts, reports, active today)
  @Get('stats')
  getStats(@CurrentUser('id') adminId: string) {
    return this.adminService.getStats(adminId);
  }

  // POST /admin/users/:id/ban — Ban a user
  @Post('users/:id/ban')
  @HttpCode(HttpStatus.OK)
  banUser(
    @CurrentUser('id') adminId: string,
    @Param('id') targetId: string,
    @Body() dto: { reason: string; duration?: number },
  ) {
    return this.adminService.banUser(adminId, targetId, dto.reason, dto.duration);
  }

  // POST /admin/users/:id/unban — Unban a user
  @Post('users/:id/unban')
  @HttpCode(HttpStatus.OK)
  unbanUser(
    @CurrentUser('id') adminId: string,
    @Param('id') targetId: string,
  ) {
    return this.adminService.unbanUser(adminId, targetId);
  }
}
```

### admin.service.ts

For the admin check, read the Prisma schema to see if there's a `role` or `isAdmin` field on User. If not, use a hardcoded admin user ID list from environment (`ADMIN_USER_IDS` comma-separated) or check `user.role === 'ADMIN'`.

```ts
@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  private async assertAdmin(userId: string) {
    const adminIds = (process.env.ADMIN_USER_IDS || '').split(',').map(s => s.trim());
    if (!adminIds.includes(userId)) {
      throw new ForbiddenException('Admin access required');
    }
  }

  async getReports(adminId: string, status?: string, cursor?: string, limit = 20) {
    await this.assertAdmin(adminId);
    const where: any = {};
    if (status) where.status = status;
    if (cursor) where.createdAt = { lt: new Date(cursor) };

    const reports = await this.prisma.report.findMany({
      where,
      include: {
        reporter: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        reportedUser: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
    // Standard pagination pattern — see CLAUDE.md
    const hasMore = reports.length > limit;
    const result = hasMore ? reports.slice(0, limit) : reports;
    return {
      data: result,
      meta: {
        cursor: hasMore ? result[result.length - 1].createdAt.toISOString() : null,
        hasMore,
      },
    };
  }

  async getReport(adminId: string, reportId: string) {
    await this.assertAdmin(adminId);
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        reporter: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        reportedUser: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });
    if (!report) throw new NotFoundException('Report not found');
    return report;
  }

  async resolveReport(adminId: string, reportId: string, action: string, note?: string) {
    await this.assertAdmin(adminId);
    // Read the Report model to find the status field name and enum
    // Update report status to RESOLVED + save action taken
    return this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: 'RESOLVED',
        // Add resolution fields if they exist in schema, otherwise use a note/metadata approach
      },
    });
  }

  async getStats(adminId: string) {
    await this.assertAdmin(adminId);
    const [users, posts, threads, reels, videos, pendingReports] = await Promise.all([
      this.prisma.user.count({ where: { isDeactivated: false } }),
      this.prisma.post.count(),
      this.prisma.thread.count({ where: { isChainHead: true } }),
      this.prisma.reel.count(),
      this.prisma.video.count(),
      this.prisma.report.count({ where: { status: 'PENDING' } }),
    ]);
    return { users, posts, threads, reels, videos, pendingReports };
  }

  async banUser(adminId: string, targetId: string, reason: string, duration?: number) {
    await this.assertAdmin(adminId);
    // Check if User model has isBanned/bannedAt fields
    // If not, use isDeactivated as a soft-ban mechanism
    return this.prisma.user.update({
      where: { id: targetId },
      data: { isDeactivated: true },
    });
  }

  async unbanUser(adminId: string, targetId: string) {
    await this.assertAdmin(adminId);
    return this.prisma.user.update({
      where: { id: targetId },
      data: { isDeactivated: false },
    });
  }
}
```

**IMPORTANT:** Read the Prisma schema FIRST to understand:
- The `Report` model fields (status enum, FK fields)
- Whether `User` has `role`, `isAdmin`, `isBanned` fields
- Adapt all queries to match actual schema

### admin.service.spec.ts

Write 6-8 tests:
- getReports returns paginated data
- getReports rejects non-admin
- getReport returns single report
- getReport 404 for missing report
- resolveReport updates status
- getStats returns counts
- banUser deactivates user
- unbanUser reactivates user

Follow existing spec patterns (mock PrismaService, use jest.fn()).

**Verification:** All files compile. Tests pass.

---

## Step 2 — Recommendations Module (Backend)
**Agent 2** | NEW files:
- `apps/api/src/modules/recommendations/recommendations.module.ts` (NEW)
- `apps/api/src/modules/recommendations/recommendations.controller.ts` (NEW)
- `apps/api/src/modules/recommendations/recommendations.service.ts` (NEW)

### Endpoints:

```
GET /recommendations/people     — People you may know (mutual follows, similar interests)
GET /recommendations/posts      — Suggested posts (high engagement, not yet seen)
GET /recommendations/reels      — Suggested reels
GET /recommendations/channels   — Suggested channels
```

### recommendations.service.ts

**People you may know** — Friends-of-friends algorithm:
```ts
async suggestedPeople(userId: string, limit = 20) {
  // 1. Get IDs I follow
  const myFollowing = await this.prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });
  const myFollowingIds = myFollowing.map(f => f.followingId);

  // 2. Get people my follows also follow (friends-of-friends)
  const fofFollows = await this.prisma.follow.findMany({
    where: {
      followerId: { in: myFollowingIds },
      followingId: { notIn: [...myFollowingIds, userId] },
    },
    select: { followingId: true },
  });

  // 3. Count mutual connections per suggested user
  const mutualCount = new Map<string, number>();
  for (const f of fofFollows) {
    mutualCount.set(f.followingId, (mutualCount.get(f.followingId) || 0) + 1);
  }

  // 4. Sort by mutual count, take top N
  const sortedIds = [...mutualCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  // 5. Fetch user profiles
  const users = await this.prisma.user.findMany({
    where: { id: { in: sortedIds }, isDeactivated: false, isPrivate: false },
    select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true, bio: true },
  });

  // Re-sort by mutual count and attach count
  return users
    .map(u => ({ ...u, mutualFollowers: mutualCount.get(u.id) || 0 }))
    .sort((a, b) => b.mutualFollowers - a.mutualFollowers);
}
```

**Suggested posts** — High engagement from last 48h that user hasn't interacted with:
```ts
async suggestedPosts(userId: string, limit = 20) {
  const posts = await this.prisma.post.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
      isRemoved: false,
      userId: { not: userId },
      user: { isDeactivated: false, isPrivate: false },
    },
    select: POST_SELECT, // reuse from posts module or define inline
    orderBy: [
      { likesCount: 'desc' },
      { commentsCount: 'desc' },
    ],
    take: limit,
  });
  return posts;
}
```

Apply same pattern for suggestedReels and suggestedChannels.

All endpoints use `OptionalClerkAuthGuard` — work without auth but personalize when authenticated.

**Verification:** All files compile.

---

## Step 3 — Module Registration + Notification Quiet Hours
**Agent 3** | Files:
- `apps/api/src/app.module.ts` (EDIT)
- `apps/api/src/modules/notifications/notifications.service.ts` (EDIT)

### 3A — Register new modules in app.module.ts

Add imports:
```ts
import { AdminModule } from './modules/admin/admin.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
```

Add to `imports` array:
```ts
AdminModule,
RecommendationsModule,
```

### 3B — Notification quiet hours

In `notifications.service.ts`, find the `create` method (~line 96). Before sending push, add quiet hours check:

```ts
// Check quiet hours before sending push
const settings = await this.prisma.userSettings.findUnique({
  where: { userId: params.userId },
  select: { quietHoursStart: true, quietHoursEnd: true },
});

if (settings?.quietHoursStart != null && settings?.quietHoursEnd != null) {
  const now = new Date();
  const currentHour = now.getUTCHours();
  const start = settings.quietHoursStart;
  const end = settings.quietHoursEnd;
  const isQuiet = start <= end
    ? (currentHour >= start && currentHour < end)
    : (currentHour >= start || currentHour < end); // overnight range
  if (isQuiet) {
    // Store notification but skip push
    return notification;
  }
}
```

**IMPORTANT:** Read the Prisma schema first. Check if `UserSettings` has `quietHoursStart` / `quietHoursEnd` fields. If NOT, skip the quiet hours feature — do NOT modify the schema. Just add the module registration (3A).

**Verification:** `npx tsc --noEmit` — 0 errors.

---

## Step 4 — Feed Scoring: Posts
**Agent 4** | File:
- `apps/api/src/modules/posts/posts.service.ts` (EDIT)

Read the full file. Find the `getFeed` method (~lines 64-121).

Currently the "foryou" feed is `orderBy: { createdAt: 'desc' }` — purely chronological.

Replace the For You feed logic with engagement-weighted scoring:

```ts
if (type === 'foryou') {
  // Check cache first (existing Redis cache logic stays)
  // ...

  // Fetch recent posts from last 72 hours
  const recentPosts = await this.prisma.post.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - 72 * 60 * 60 * 1000) },
      isRemoved: false,
      user: { isDeactivated: false },
      ...(cursor ? { createdAt: { lt: new Date(cursor), gte: new Date(Date.now() - 72 * 60 * 60 * 1000) } } : {}),
    },
    select: POST_SELECT,
    take: 200, // fetch more to score and rank
    orderBy: { createdAt: 'desc' },
  });

  // Score each post: engagement weighted by recency
  const scored = recentPosts.map(post => {
    const ageHours = Math.max(1, (Date.now() - new Date(post.createdAt).getTime()) / 3600000);
    const engagement = (post.likesCount * 3) + (post.commentsCount * 5) + (post.sharesCount * 7);
    const score = engagement / Math.pow(ageHours, 1.5);
    return { ...post, _score: score };
  });

  // Sort by score descending, paginate
  scored.sort((a, b) => b._score - a._score);
  const startIdx = cursor ? scored.findIndex(p => new Date(p.createdAt).toISOString() < cursor) : 0;
  const page = scored.slice(Math.max(0, startIdx), Math.max(0, startIdx) + limit + 1);

  const hasMore = page.length > limit;
  const result = hasMore ? page.slice(0, limit) : page;

  // Strip internal score field
  const data = result.map(({ _score, ...post }) => post);

  return {
    data,
    meta: {
      cursor: hasMore ? data[data.length - 1].createdAt : null,
      hasMore,
    },
  };
}
```

**Keep the "following" feed as-is** (chronological from followed users).

**IMPORTANT:** Read the file first. The `POST_SELECT` constant and Redis cache logic must be preserved. Only change the For You branch. Keep the existing `where` filter for blocked/muted users if present.

**Verification:** Compiles. For You feed returns engagement-ranked posts.

---

## Step 5 — Feed Scoring: Threads
**Agent 5** | File:
- `apps/api/src/modules/threads/threads.service.ts` (EDIT)

Same approach as Step 4, but for threads. Find `getFeed` (~lines 96-143).

Currently "foryou" and "following" are both `createdAt: 'desc'`. The "trending" branch already sorts by `likesCount`.

Update the "foryou" branch with engagement scoring:

```ts
if (type === 'foryou') {
  const recentThreads = await this.prisma.thread.findMany({
    where: {
      isChainHead: true,
      isRemoved: false,
      visibility: 'PUBLIC',
      createdAt: { gte: new Date(Date.now() - 72 * 60 * 60 * 1000) },
      ...(cursor ? { createdAt: { lt: new Date(cursor), gte: new Date(Date.now() - 72 * 60 * 60 * 1000) } } : {}),
    },
    select: THREAD_SELECT,
    take: 200,
    orderBy: { createdAt: 'desc' },
  });

  const scored = recentThreads.map(thread => {
    const ageHours = Math.max(1, (Date.now() - new Date(thread.createdAt).getTime()) / 3600000);
    const engagement = (thread.likesCount * 3) + (thread.repliesCount * 5) + (thread.repostsCount * 4);
    const score = engagement / Math.pow(ageHours, 1.5);
    return { ...thread, _score: score };
  });

  scored.sort((a, b) => b._score - a._score);
  // ... same pagination as Step 4
}
```

Read the file first. Check what engagement fields exist on Thread (`likesCount`, `repliesCount`, `repostsCount`, etc.). Adapt the formula to use actual field names.

**Keep "following" and "trending" feeds as-is.**

**Verification:** Compiles. Threads For You is engagement-ranked.

---

## Step 6 — Feed Scoring: Reels
**Agent 6** | File:
- `apps/api/src/modules/reels/reels.service.ts` (EDIT)

Same approach. Find `getFeed` method.

Reel engagement formula:
```ts
const engagement = (reel.likesCount * 2) + (reel.commentsCount * 4) + (reel.sharesCount * 6) + (reel.viewsCount * 0.1);
const score = engagement / Math.pow(ageHours, 1.2); // Slower decay for reels (they stay relevant longer)
```

Reels use viewsCount heavily (TikTok-style), so weight views but lower than active engagement.

**Verification:** Compiles. Reels feed is engagement-ranked.

---

## Step 7 — Better Trending Algorithm
**Agent 7** | File:
- `apps/api/src/modules/search/search.service.ts` (EDIT)

Find the `trending` method (~lines 339-358) and `suggestedUsers` method (~lines 385-402).

### 7A — Time-decayed trending hashtags

Currently just `orderBy: { postsCount: 'desc' }` (all-time). Replace with velocity-based trending:

```ts
async trending() {
  // Trending hashtags: highest growth in last 24h
  const recentHashtagPosts = await this.prisma.post.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      hashtags: { some: {} },
    },
    select: { hashtags: { select: { hashtag: { select: { id: true, name: true, postsCount: true } } } } },
    take: 500,
  });

  // Count hashtag frequency in last 24h
  const freq = new Map<string, { name: string; postsCount: number; recentCount: number }>();
  for (const post of recentHashtagPosts) {
    for (const ph of post.hashtags) {
      const h = ph.hashtag;
      const existing = freq.get(h.id);
      if (existing) {
        existing.recentCount++;
      } else {
        freq.set(h.id, { name: h.name, postsCount: h.postsCount, recentCount: 1 });
      }
    }
  }

  // Sort by recent count (velocity)
  const hashtags = [...freq.values()]
    .sort((a, b) => b.recentCount - a.recentCount)
    .slice(0, 20);

  // Threads stays the same (already engagement-sorted)
  const threads = await this.prisma.thread.findMany({
    where: {
      visibility: 'PUBLIC',
      isChainHead: true,
      isRemoved: false,
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    select: THREAD_SEARCH_SELECT,
    take: 10,
    orderBy: { likesCount: 'desc' },
  });

  return { hashtags, threads };
}
```

**IMPORTANT:** Read the schema first. Check how Post↔Hashtag relation works (through table? Direct relation?). The query above assumes a `PostHashtag` join model — adapt to actual schema.

If the relation query is too complex, fall back to a simpler approach: just add a time filter to the existing hashtag query:
```ts
// Simpler fallback: hashtags with most posts in last 7 days
const hashtags = await this.prisma.hashtag.findMany({
  take: 20,
  orderBy: { postsCount: 'desc' },
  where: { updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
});
```

### 7B — Better suggested users

The existing `suggestedUsers` just sorts by follower count. Add shared-interest logic if possible:

```ts
async suggestedUsers(userId: string) {
  // Get user's interests
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    select: { interests: true },
  });

  const myFollowing = await this.prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });
  const myFollowingIds = myFollowing.map(f => f.followingId);

  // Users with similar interests who I don't follow, sorted by followers
  return this.prisma.user.findMany({
    where: {
      id: { notIn: [...myFollowingIds, userId] },
      isPrivate: false,
      isDeactivated: false,
      ...(user?.interests?.length ? { interests: { hasSome: user.interests } } : {}),
    },
    select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true, bio: true },
    take: 20,
    orderBy: { followers: { _count: 'desc' } },
  });
}
```

**Read the schema** to check if `User.interests` exists and what type it is (String[]? Relation?). Adapt accordingly.

**Verification:** Trending returns velocity-based hashtags. Suggested users considers interests.

---

## Step 8 — Creator Analytics Screen
**Agent 8** | NEW file:
- `apps/mobile/app/(screens)/analytics.tsx` (NEW)

Create a creator analytics dashboard screen. The backend endpoint `GET /users/me/analytics` already exists — it returns `{ stats: CreatorStat[] }` with up to 30 daily stat records.

Read `apps/api/prisma/schema.prisma` to find the `CreatorStat` model fields (likely: `date`, `views`, `likes`, `followers`, `impressions`, etc.).

### Screen design:

```
┌─────────────────────────────┐
│ ← Creator Analytics         │
├─────────────────────────────┤
│                             │
│  ┌─────┐ ┌─────┐ ┌─────┐  │
│  │Views│ │Likes│ │Follows│  │  ← Summary cards (totals from 30d)
│  │12.4K│ │ 892 │ │  +47 │  │
│  └─────┘ └─────┘ └─────┘  │
│                             │
│  ┌─────────────────────────┐│
│  │ ▁▂▃▅▇█▇▅▃▂▁▂▃▅▇█▇▅▃  ││  ← 30-day bar chart (simplified)
│  │ Engagement over time    ││
│  └─────────────────────────┘│
│                             │
│  Top Performing Content     │
│  ┌──────────────────────┐  │
│  │ Post: "..." — 1.2K ♥ │  │
│  │ Reel: "..." — 45K ▶  │  │
│  │ Thread: "..." — 892 ↻│  │
│  └──────────────────────┘  │
│                             │
└─────────────────────────────┘
```

### Implementation:

```tsx
import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, fontSize, radius } from '@/theme';
import { usersApi } from '@/services/api';
```

Key requirements:
1. Fetch from `usersApi.getAnalytics()` (add to api.ts if missing — but Agent 12 handles api.ts, so just use it assuming it exists)
2. Summary cards at top: total views, total likes, follower change (sum of 30 days)
3. Simple bar chart: Use `View` components with dynamic heights (no chart library needed):
```tsx
{stats.map((day, i) => (
  <View key={i} style={[styles.bar, { height: Math.max(4, (day.views / maxViews) * 120) }]} />
))}
```
4. Top performing content: Fetch user's own posts/reels sorted by engagement
5. Loading → `Skeleton` patterns, empty → `EmptyState`
6. ScrollView with `RefreshControl` (it's a dashboard, not a FlatList)
7. All CLAUDE.md rules apply: theme tokens, Icon components, no hardcoded radius

Read the schema to know exact `CreatorStat` fields before writing the screen.

**Verification:** Screen renders with stats or empty state.

---

## Step 9 — Discover Screen
**Agent 9** | NEW file:
- `apps/mobile/app/(screens)/discover.tsx` (NEW)

A dedicated discovery/explore screen showing trending content across all 5 spaces.

### Screen design:

```
┌─────────────────────────────┐
│ ← Discover                  │
├─────────────────────────────┤
│ 🔥 Trending Hashtags        │
│ ┌────┐ ┌────┐ ┌────┐ ←→   │  ← Horizontal scroll chips
│ │#eid│ │#day│ │#dua│       │
│ └────┘ └────┘ └────┘       │
│                             │
│ 📈 Hot Posts                │
│ ┌──┐ ┌──┐ ┌──┐ ←→        │  ← Horizontal card carousel
│ │  │ │  │ │  │             │
│ └──┘ └──┘ └──┘             │
│                             │
│ 🎬 Trending Reels           │
│ ┌──┬──┬──┐                 │  ← 3-column grid
│ │  │  │  │                 │
│ └──┴──┴──┘                 │
│                             │
│ 👥 Suggested People         │
│ ┌────────────────────────┐ │
│ │ @user1  [Follow]       │ │
│ │ @user2  [Follow]       │ │
│ └────────────────────────┘ │
│                             │
│ 📺 Rising Channels          │
│ ┌────┐ ┌────┐ ←→          │
│ │    │ │    │              │
│ └────┘ └────┘              │
└─────────────────────────────┘
```

### Implementation:

Use multiple `useQuery` hooks:
```ts
const trendingQuery = useQuery({ queryKey: ['trending'], queryFn: () => searchApi.trending() });
const suggestedPeopleQuery = useQuery({ queryKey: ['recommended-people'], queryFn: () => recommendationsApi.people() });
const suggestedPostsQuery = useQuery({ queryKey: ['recommended-posts'], queryFn: () => recommendationsApi.posts() });
const suggestedReelsQuery = useQuery({ queryKey: ['recommended-reels'], queryFn: () => recommendationsApi.reels() });
const suggestedChannelsQuery = useQuery({ queryKey: ['recommended-channels'], queryFn: () => recommendationsApi.channels() });
```

Use a ScrollView (not FlatList — mixed content sections) with RefreshControl.

Each section:
- Hashtags → horizontal FlatList of chips, tap → `/(screens)/hashtag/${tag}`
- Hot Posts → horizontal FlatList of PostCard-style mini cards
- Trending Reels → 3-column grid (2 rows), tap → `/(screens)/reel/${id}`
- Suggested People → vertical list, avatar + name + follow button
- Rising Channels → horizontal cards, tap → `/(screens)/channel/${handle}`

All CLAUDE.md rules: Skeleton loaders, EmptyState per section, theme tokens, Icon components.

**Verification:** Screen renders with trending content sections.

---

## Step 10 — Content Settings Screen
**Agent 10** | NEW file:
- `apps/mobile/app/(screens)/content-settings.tsx` (NEW)

The settings.tsx has an empty "Content" section (line 192). This screen provides content preference controls.

### Design:

```
┌─────────────────────────────┐
│ ← Content Preferences       │
├─────────────────────────────┤
│ Feed Preferences            │
│ ┌──────────────────────────┐│
│ │ Saf default: Following ▼ ││  ← Picker: following/foryou
│ │ Majlis default: ForYou ▼ ││  ← Picker: foryou/following/trending
│ └──────────────────────────┘│
│                             │
│ Content Filters             │
│ ┌──────────────────────────┐│
│ │ ☐ Filter sensitive content││  ← Toggle (from settings API)
│ │ ☐ Hide reposted content  ││  ← Toggle (local, store in Zustand)
│ └──────────────────────────┘│
│                             │
│ Blocked Keywords            │
│ [Manage →]                  │  ← Navigate to blocked-keywords
│                             │
│ Digital Wellbeing           │
│ ┌──────────────────────────┐│
│ │ Daily reminder: Off ▼    ││  ← Picker: off/30min/1h/2h
│ └──────────────────────────┘│
└─────────────────────────────┘
```

Implementation:
- Fetch settings via `settingsApi.get()`
- Feed defaults: read from Zustand store (`safFeedType`, `majlisFeedType`), update via setters
- Content filters: call `settingsApi.updateWellbeing()` for server-backed settings
- Local preferences: persist in Zustand (add new fields if needed, but Agent 10 should NOT edit store/index.ts — just use existing fields)
- Navigate to blocked-keywords via `router.push('/(screens)/blocked-keywords')`

All CLAUDE.md rules apply. Use `BottomSheet` for picker dropdowns, not RN `Picker`.

**Verification:** Screen renders and all toggles work.

---

## Step 11 — Settings Screen Wiring
**Agent 11** | File:
- `apps/mobile/app/(screens)/settings.tsx` (EDIT)

Read the full file. Make these changes:

### 11A — Wire the empty Content section

The Content section at ~line 192 is just a header with no items. Add navigation items:

```tsx
{/* Content section */}
<Text style={styles.sectionTitle}>Content</Text>
<SettingsRow
  icon="layers"
  label="Content Preferences"
  onPress={() => router.push('/(screens)/content-settings')}
  showChevron
/>
```

### 11B — Add Analytics navigation

Add a new section above "Account" section:

```tsx
<Text style={styles.sectionTitle}>Creator</Text>
<SettingsRow
  icon="bar-chart-2"
  label="Analytics"
  onPress={() => router.push('/(screens)/analytics')}
  showChevron
/>
```

### 11C — Add Discover navigation (optional)

If there's a good place, add a Discovery link. But the discover screen is more likely accessed from search — so this may not be needed. Use your judgment after reading the file.

**Read the file first** to understand the `SettingsRow` component pattern (it might be inline or a reusable component). Match the existing style exactly.

**Verification:** Content section has items. Analytics row visible.

---

## Step 12 — Mobile API Client + Types
**Agent 12** | Files:
- `apps/mobile/src/services/api.ts` (EDIT)
- `apps/mobile/src/types/index.ts` (EDIT)

### 12A — api.ts: Add new API groups

Read the full file. Add after existing API groups:

```ts
// Admin API
export const adminApi = {
  getReports: (status?: string, cursor?: string) =>
    api.get<PaginatedResponse<Report>>(`/admin/reports${qs({ status, cursor })}`),
  getReport: (id: string) =>
    api.get<Report>(`/admin/reports/${id}`),
  resolveReport: (id: string, action: string, note?: string) =>
    api.patch(`/admin/reports/${id}`, { action, note }),
  getStats: () =>
    api.get<AdminStats>('/admin/stats'),
  banUser: (id: string, reason: string, duration?: number) =>
    api.post(`/admin/users/${id}/ban`, { reason, duration }),
  unbanUser: (id: string) =>
    api.post(`/admin/users/${id}/unban`),
};

// Recommendations API
export const recommendationsApi = {
  people: () => api.get<SuggestedUser[]>('/recommendations/people'),
  posts: () => api.get<Post[]>('/recommendations/posts'),
  reels: () => api.get<Reel[]>('/recommendations/reels'),
  channels: () => api.get<Channel[]>('/recommendations/channels'),
};
```

Also verify `usersApi.getAnalytics` exists. If not, add:
```ts
getAnalytics: () => api.get<{ stats: CreatorStat[] }>('/users/me/analytics'),
```

### 12B — types/index.ts: Add new types

Read the full file. Add missing types:

```ts
export interface Report {
  id: string;
  reason: string;
  status: string;
  createdAt: string;
  reporter: { id: string; username: string; displayName?: string; avatarUrl?: string };
  reportedUser?: { id: string; username: string; displayName?: string; avatarUrl?: string };
  postId?: string;
  threadId?: string;
  reelId?: string;
  videoId?: string;
}

export interface AdminStats {
  users: number;
  posts: number;
  threads: number;
  reels: number;
  videos: number;
  pendingReports: number;
}

export interface SuggestedUser {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  isVerified: boolean;
  bio?: string;
  mutualFollowers?: number;
}

export interface CreatorStat {
  id: string;
  date: string;
  views: number;
  likes: number;
  followers: number;
  // Add other fields after reading schema
}
```

**Read the Prisma schema** to get exact `CreatorStat` fields.

**Verification:** No TypeScript errors. All new API methods properly typed.

---

## Step 13 — Docs Update
**Agent 13** | Files:
- `CLAUDE.md` (EDIT)
- `C:\Users\shakh\.claude\projects\C--Users-shakh\memory\MEMORY.md` (EDIT)

**Runs LAST after all other agents complete.**

### CLAUDE.md:
1. Update endpoint count (+8 admin + 4 recommendations = ~203 total)
2. Update module count (22 → 24: add admin, recommendations)
3. Update screen count (+3: analytics, discover, content-settings)
4. Update "Status" line to ~95% feature complete
5. Under "Still Missing", remove items that are now implemented (admin moderation, content recommendations)

### MEMORY.md:
Add batch 17 entry:
```
- **Batch 17 (2026-03-08):** Platform intelligence batch. Engagement-scored For You feeds (posts/threads/reels). Admin moderation module (6 endpoints). Recommendations module (4 endpoints). Creator analytics screen. Discover screen. Content settings screen. Better trending algorithm. Settings wiring.
```

Update current state metrics.

---

## File-to-Agent Conflict Map

| File | Agent |
|------|-------|
| `apps/api/src/modules/admin/admin.module.ts` (NEW) | 1 |
| `apps/api/src/modules/admin/admin.controller.ts` (NEW) | 1 |
| `apps/api/src/modules/admin/admin.service.ts` (NEW) | 1 |
| `apps/api/src/modules/admin/admin.service.spec.ts` (NEW) | 1 |
| `apps/api/src/modules/recommendations/recommendations.module.ts` (NEW) | 2 |
| `apps/api/src/modules/recommendations/recommendations.controller.ts` (NEW) | 2 |
| `apps/api/src/modules/recommendations/recommendations.service.ts` (NEW) | 2 |
| `apps/api/src/app.module.ts` | 3 |
| `apps/api/src/modules/notifications/notifications.service.ts` | 3 |
| `apps/api/src/modules/posts/posts.service.ts` | 4 |
| `apps/api/src/modules/threads/threads.service.ts` | 5 |
| `apps/api/src/modules/reels/reels.service.ts` | 6 |
| `apps/api/src/modules/search/search.service.ts` | 7 |
| `apps/mobile/app/(screens)/analytics.tsx` (NEW) | 8 |
| `apps/mobile/app/(screens)/discover.tsx` (NEW) | 9 |
| `apps/mobile/app/(screens)/content-settings.tsx` (NEW) | 10 |
| `apps/mobile/app/(screens)/settings.tsx` | 11 |
| `apps/mobile/src/services/api.ts` | 12 |
| `apps/mobile/src/types/index.ts` | 12 |
| `CLAUDE.md` | 13 |
| `MEMORY.md` | 13 |

**Zero conflicts.** Every file touched by exactly one agent.

---

## Dependency Order

```
Parallel wave 1: Agents 1-12 (all independent)
Sequential after: Agent 13 (docs — needs final counts)
```

All 12 agents can run simultaneously. Agent 13 runs last.

---

## Verification Checklist

1. `cd apps/api && npx tsc --noEmit` — 0 errors
2. `cd apps/api && npx jest` — all tests pass (including new admin specs)
3. Admin endpoints respond (GET /admin/reports, etc.)
4. Recommendations endpoints respond (GET /recommendations/people, etc.)
5. Posts/Threads/Reels For You feeds return engagement-ranked content
6. Trending shows velocity-based hashtags (not just all-time)
7. Analytics screen renders with stats
8. Discover screen shows trending + recommendations
9. Content settings screen works
10. Settings → Content Preferences navigates correctly
11. Settings → Analytics navigates correctly
