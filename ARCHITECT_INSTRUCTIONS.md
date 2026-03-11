# BATCH 22: Production Hardening + Missing Screens + Platform Parity

**Date:** 2026-03-10
**Theme:** Complete failed batch 21 screens, add missing platform-level features, harden quality, add missing backend modules, deep UX polish across all 5 spaces.
**Agent Count:** 45
**Predecessor:** Batch 21 (24/30 completed — 6 mobile agents failed)

---

## MANDATORY RULES FOR ALL AGENTS

1. Read `CLAUDE.md` in project root FIRST — it contains mandatory code quality rules
2. Find YOUR section below by "## Agent N:" — execute ONLY that section
3. Do NOT touch any file not listed in your section
4. Follow ALL component rules: BottomSheet (never Modal), Skeleton (never ActivityIndicator), EmptyState (never bare text), Icon (never emoji), radius.* (never hardcoded)
5. Use `@CurrentUser('id')` in all backend controllers (never `@CurrentUser()`)
6. No `any` in non-test code. `as any` allowed ONLY in `*.spec.ts` files for mocks
7. All FlatLists MUST have `<RefreshControl tintColor={colors.emerald} />`
8. Cursor-based pagination: `{ data: T[], meta: { cursor: string | null, hasMore: boolean } }`
9. When done, list every file you created or modified

---

## CONFLICT MAP — 45 AGENTS

Each file has exactly ONE owner. Zero conflicts guaranteed.

### Backend New Modules (Agents 1-4)
| Agent | Exclusive Files |
|-------|----------------|
| 1 | `modules/reports/` (all files) |
| 2 | `modules/hashtags/` (all files) |
| 3 | `modules/bookmarks/` (all files) |
| 4 | `modules/watch-history/` (all files) |

### Backend Modifications (Agents 5-10)
| Agent | Exclusive Files |
|-------|----------------|
| 5 | `modules/users/users.service.ts`, `users.controller.ts` |
| 6 | `modules/posts/posts.service.ts`, `posts.controller.ts` |
| 7 | `modules/threads/threads.service.ts`, `threads.controller.ts` |
| 8 | `modules/reels/reels.service.ts`, `reels.controller.ts` |
| 9 | `modules/notifications/notifications.service.ts`, `notifications.controller.ts` |
| 10 | `modules/search/search.service.ts`, `search.controller.ts` |

### Backend Enhancement (Agents 11-14)
| Agent | Exclusive Files |
|-------|----------------|
| 11 | `modules/stories/stories.service.ts`, `stories.controller.ts` |
| 12 | `modules/channels/channels.service.ts`, `channels.controller.ts` |
| 13 | `modules/videos/videos.service.ts`, `videos.controller.ts` |
| 14 | `modules/messages/messages.service.ts`, `messages.controller.ts` |

### New Mobile Screens — Batch 21 Failures (Agents 15-20)
| Agent | Exclusive Files |
|-------|----------------|
| 15 | `(screens)/broadcast-channels.tsx`, `(screens)/broadcast/[id].tsx` |
| 16 | `(screens)/close-friends.tsx` |
| 17 | `(screens)/pinned-messages.tsx`, `(screens)/starred-messages.tsx` |
| 18 | `(screens)/community-posts.tsx` |
| 19 | `components/risalah/StickerPicker.tsx` — REWRITE |
| 20 | `components/risalah/StickerPackBrowser.tsx` — REWRITE |

### New Mobile Screens — New (Agents 21-32)
| Agent | Exclusive Files |
|-------|----------------|
| 21 | `(screens)/sound/[id].tsx` |
| 22 | `(screens)/mutual-followers.tsx` |
| 23 | `(screens)/conversation-media.tsx` |
| 24 | `(screens)/theme-settings.tsx` |
| 25 | `(screens)/account-settings.tsx` |
| 26 | `(screens)/share-profile.tsx`, `(screens)/qr-scanner.tsx` |
| 27 | `(screens)/reports/[id].tsx` |
| 28 | `(screens)/discover.tsx` |
| 29 | `(screens)/search-results.tsx` |
| 30 | `(screens)/voice-recorder.tsx` |
| 31 | `(screens)/create-broadcast.tsx` |
| 32 | `(screens)/schedule-live.tsx` |

### Mobile Screen Enhancements (Agents 33-38)
| Agent | Exclusive Files |
|-------|----------------|
| 33 | `(tabs)/saf.tsx` |
| 34 | `(tabs)/majlis.tsx` |
| 35 | `(tabs)/risalah.tsx` |
| 36 | `(tabs)/minbar.tsx` |
| 37 | `(screens)/settings.tsx` |
| 38 | `(screens)/edit-profile.tsx` |

### Component Enhancements (Agents 39-41)
| Agent | Exclusive Files |
|-------|----------------|
| 39 | `components/saf/PostCard.tsx` |
| 40 | `components/majlis/ThreadCard.tsx` |
| 41 | `components/ui/RichText.tsx` |

### Integration & Infrastructure (Agents 42-45)
| Agent | Exclusive Files |
|-------|----------------|
| 42 | `services/api.ts` |
| 43 | `types/index.ts` |
| 44 | `store/index.ts` |
| 45 | `app.module.ts` + 4 new `.module.ts` files |

---

## Agent 1: Reports Module

**Goal:** Full NestJS module for user content reporting. Schema has `Report` model (line 1124) with `ReportStatus`, `ReportReason`, `ModerationAction` enums. Currently NO dedicated module — reports are unhandled.

**Files to CREATE:**
- `apps/api/src/modules/reports/reports.service.ts`
- `apps/api/src/modules/reports/reports.controller.ts`
- `apps/api/src/modules/reports/reports.module.ts`
- `apps/api/src/modules/reports/dto/create-report.dto.ts`
- `apps/api/src/modules/reports/reports.service.spec.ts`

### Service Methods:

```typescript
import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  // Submit a report — any user can report content
  async create(userId: string, dto: CreateReportDto) {
    // Prevent duplicate reports from same user on same target
    const existing = await this.prisma.report.findFirst({
      where: {
        reporterId: userId,
        ...(dto.reportedPostId && { reportedPostId: dto.reportedPostId }),
        ...(dto.reportedUserId && { reportedUserId: dto.reportedUserId }),
        ...(dto.reportedCommentId && { reportedCommentId: dto.reportedCommentId }),
        ...(dto.reportedMessageId && { reportedMessageId: dto.reportedMessageId }),
        status: { in: ['PENDING', 'REVIEWING'] },
      },
    });
    if (existing) throw new ConflictException('You already reported this');

    return this.prisma.report.create({
      data: {
        reporterId: userId,
        reason: dto.reason,
        description: dto.description,
        reportedPostId: dto.reportedPostId,
        reportedUserId: dto.reportedUserId,
        reportedCommentId: dto.reportedCommentId,
        reportedMessageId: dto.reportedMessageId,
      },
    });
  }

  // Get user's own reports (track status)
  async getMyReports(userId: string, cursor?: string, limit = 20) {
    const reports = await this.prisma.report.findMany({
      where: { reporterId: userId },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      include: {
        reportedUser: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });
    const hasMore = reports.length > limit;
    const data = hasMore ? reports.slice(0, limit) : reports;
    return { data, meta: { cursor: data[data.length - 1]?.id ?? null, hasMore } };
  }

  // Get single report by id (own report only)
  async getById(reportId: string, userId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        reportedUser: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });
    if (!report) throw new NotFoundException('Report not found');
    if (report.reporterId !== userId) throw new ForbiddenException();
    return report;
  }

  // Admin: get all pending reports
  async getPending(cursor?: string, limit = 20) {
    const reports = await this.prisma.report.findMany({
      where: { status: 'PENDING' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'asc' },
      include: {
        reporter: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        reportedUser: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });
    const hasMore = reports.length > limit;
    const data = hasMore ? reports.slice(0, limit) : reports;
    return { data, meta: { cursor: data[data.length - 1]?.id ?? null, hasMore } };
  }

  // Admin: resolve a report
  async resolve(reportId: string, adminId: string, actionTaken: string) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');

    const [updated] = await this.prisma.$transaction([
      this.prisma.report.update({
        where: { id: reportId },
        data: { status: 'RESOLVED', actionTaken, reviewedAt: new Date() },
      }),
      this.prisma.moderationLog.create({
        data: {
          moderatorId: adminId,
          action: actionTaken,
          targetUserId: report.reportedUserId,
          targetPostId: report.reportedPostId,
          reason: `Report ${reportId}: ${report.reason}`,
        },
      }),
    ]);
    return updated;
  }

  // Admin: dismiss a report
  async dismiss(reportId: string) {
    return this.prisma.report.update({
      where: { id: reportId },
      data: { status: 'DISMISSED', reviewedAt: new Date() },
    });
  }

  // Admin: get report stats
  async getStats() {
    const [pending, reviewing, resolved, dismissed] = await Promise.all([
      this.prisma.report.count({ where: { status: 'PENDING' } }),
      this.prisma.report.count({ where: { status: 'REVIEWING' } }),
      this.prisma.report.count({ where: { status: 'RESOLVED' } }),
      this.prisma.report.count({ where: { status: 'DISMISSED' } }),
    ]);
    return { pending, reviewing, resolved, dismissed, total: pending + reviewing + resolved + dismissed };
  }
}
```

### Controller:
```typescript
import { Controller, Post, Get, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('api/v1/reports')
export class ReportsController {
  constructor(private service: ReportsService) {}

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateReportDto) {
    return this.service.create(userId, dto);
  }

  @Get('mine')
  getMyReports(@CurrentUser('id') userId: string, @Query('cursor') cursor?: string) {
    return this.service.getMyReports(userId, cursor);
  }

  @Get('pending')
  getPending(@Query('cursor') cursor?: string) {
    return this.service.getPending(cursor);
  }

  @Get('stats')
  getStats() {
    return this.service.getStats();
  }

  @Get(':id')
  getById(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.getById(id, userId);
  }

  @Patch(':id/resolve')
  resolve(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body('actionTaken') actionTaken: string) {
    return this.service.resolve(id, adminId, actionTaken);
  }

  @Patch(':id/dismiss')
  dismiss(@Param('id') id: string) {
    return this.service.dismiss(id);
  }
}
```

### DTO:
```typescript
import { IsString, IsOptional, IsEnum } from 'class-validator';

enum ReportReason {
  HATE_SPEECH = 'HATE_SPEECH', HARASSMENT = 'HARASSMENT', VIOLENCE = 'VIOLENCE',
  SPAM = 'SPAM', MISINFORMATION = 'MISINFORMATION', NUDITY = 'NUDITY',
  SELF_HARM = 'SELF_HARM', TERRORISM = 'TERRORISM', DOXXING = 'DOXXING',
  COPYRIGHT = 'COPYRIGHT', IMPERSONATION = 'IMPERSONATION', OTHER = 'OTHER',
}

export class CreateReportDto {
  @IsEnum(ReportReason)
  reason: ReportReason;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsString()
  reportedPostId?: string;

  @IsOptional() @IsString()
  reportedUserId?: string;

  @IsOptional() @IsString()
  reportedCommentId?: string;

  @IsOptional() @IsString()
  reportedMessageId?: string;
}
```

### Module:
```typescript
import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { PrismaModule } from '../../config/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
```

### Spec: Standard NestJS test with mocked PrismaService. Test create, getMyReports, getById, getPending, resolve, dismiss, getStats.

---

## Agent 2: Hashtags Module

**Goal:** Full NestJS module for hashtag management. Schema has `Hashtag` model (line 1205) with name, postsCount, reelsCount, threadsCount, videosCount.

**Files to CREATE:**
- `apps/api/src/modules/hashtags/hashtags.service.ts`
- `apps/api/src/modules/hashtags/hashtags.controller.ts`
- `apps/api/src/modules/hashtags/hashtags.module.ts`
- `apps/api/src/modules/hashtags/hashtags.service.spec.ts`

### Service: getTrendingRaw (raw SQL for sum ordering), search (prefix match), getByName, getPostsByHashtag, getReelsByHashtag, getThreadsByHashtag, incrementCount, decrementCount. All with cursor pagination where applicable.

### Controller: 6 endpoints with OptionalClerkAuthGuard for public access: `GET /hashtags/trending`, `GET /hashtags/search?q=`, `GET /hashtags/:name`, `GET /hashtags/:name/posts`, `GET /hashtags/:name/reels`, `GET /hashtags/:name/threads`.

Use `$queryRaw` for trending (sum of all count fields). Use `startsWith` + `mode: 'insensitive'` for search. Include user select in content queries.

---

## Agent 3: Bookmarks Module

**Goal:** Full NestJS module for unified bookmarking across SavedPost (line 852), ThreadBookmark (line 1313), VideoBookmark (line 1324).

**Files to CREATE:**
- `apps/api/src/modules/bookmarks/bookmarks.service.ts`
- `apps/api/src/modules/bookmarks/bookmarks.controller.ts`
- `apps/api/src/modules/bookmarks/bookmarks.module.ts`
- `apps/api/src/modules/bookmarks/dto/bookmark.dto.ts`
- `apps/api/src/modules/bookmarks/bookmarks.service.spec.ts`

### Service: savePost (with collectionName), unsavePost, saveThread, unsaveThread, saveVideo, unsaveVideo, getSavedPosts (with collection filter), getSavedThreads, getSavedVideos, getCollections (groupBy), moveToCollection, isPostSaved, isThreadSaved, isVideoSaved. All with cursor pagination.

### Controller: 12+ endpoints covering save/unsave for all content types, list saved items, collection management.

---

## Agent 4: Watch History Module

**Goal:** Full NestJS module using WatchHistory (line 1335) and WatchLater (line 1349) models.

**Files to CREATE:**
- `apps/api/src/modules/watch-history/watch-history.service.ts`
- `apps/api/src/modules/watch-history/watch-history.controller.ts`
- `apps/api/src/modules/watch-history/watch-history.module.ts`
- `apps/api/src/modules/watch-history/watch-history.service.spec.ts`

### Service: recordWatch (upsert with progress), getHistory, removeFromHistory, clearHistory, addToWatchLater, removeFromWatchLater, getWatchLater, isInWatchLater. Include video + channel info in queries.

### Controller: 8 endpoints.

---

## Agent 5: Users Service Enhancements

**Goal:** Add mutual followers, liked posts, account deletion, data export.

**Files to MODIFY:** `apps/api/src/modules/users/users.service.ts`, `users.controller.ts`

### Add methods:
- `getMutualFollowers(currentUserId, targetUsername, limit)` — raw SQL join on Follow table
- `getLikedPosts(userId, cursor, limit)` — via PostReaction with post include
- `requestAccountDeletion(userId)` — set deletionRequestedAt + isDeactivated
- `cancelAccountDeletion(userId)` — clear deletionRequestedAt + reactivate
- `exportData(userId)` — parallel fetch all user content as JSON

### Add 5 controller endpoints: `GET /users/:username/mutual-followers`, `GET /users/me/liked-posts`, `POST /users/me/delete-account`, `POST /users/me/cancel-deletion`, `GET /users/me/export-data`.

---

## Agent 6: Posts Service Enhancements

**Goal:** Add post archiving, comment pinning, share link.

**Files to MODIFY:** `apps/api/src/modules/posts/posts.service.ts`, `posts.controller.ts`

### Add methods:
- `archivePost(postId, userId)` / `unarchivePost(postId, userId)` — ownership check + isArchived toggle
- `getArchived(userId, cursor, limit)` — user's archived posts
- `pinComment(postId, commentId, userId)` / `unpinComment` — ownership check, unpin existing first
- `getShareLink(postId)` — returns `{ url: 'https://mizanly.app/post/${postId}' }`

### Add 6 endpoints.

---

## Agent 7: Threads Service Enhancements

**Goal:** Add reply permission control, bookmark status, share link.

**Files to MODIFY:** `apps/api/src/modules/threads/threads.service.ts`, `threads.controller.ts`

### Add methods:
- `setReplyPermission(threadId, userId, permission)` — ownership check, update replyPermission field
- `canReply(threadId, userId)` — check permission logic (everyone/following/mentioned/none)
- `getShareLink(threadId)` — returns URL
- `isBookmarked(threadId, userId)` — check ThreadBookmark

### Add 4 endpoints.

---

## Agent 8: Reels Service Enhancements

**Goal:** Add sound page content, duets/stitches listing, reel archiving, share link.

**Files to MODIFY:** `apps/api/src/modules/reels/reels.service.ts`, `reels.controller.ts`

### Add methods:
- `getByAudioTrack(audioTrackId, cursor, limit)` — reels using specific audio
- `getDuets(reelId, cursor, limit)` — reels that are duets of this reel
- `getStitches(reelId, cursor, limit)` — reels that stitch from this reel
- `archive(reelId, userId)` / `unarchive(reelId, userId)`
- `getShareLink(reelId)` — returns URL

### Add 6 endpoints.

---

## Agent 9: Notifications Enhancements

**Goal:** Add mark-all-read, delete notification, unread counts by type.

**Files to MODIFY:** `apps/api/src/modules/notifications/notifications.service.ts`, `notifications.controller.ts`

### Add methods:
- `markAllRead(userId)` — updateMany where userId + isRead false
- `delete(notificationId, userId)` — deleteMany with ownership check
- `getUnreadCounts(userId)` — groupBy type where isRead false
- `notifyLiveStarted(hostId, liveSessionId)` — create notifications for all followers

### Add 3 endpoints: `POST /notifications/mark-all-read`, `DELETE /notifications/:id`, `GET /notifications/unread-counts`.

---

## Agent 10: Search Enhancements

**Goal:** Add content search (posts, threads, reels), explore feed, search suggestions.

**Files to MODIFY:** `apps/api/src/modules/search/search.service.ts`, `search.controller.ts`

### Add methods:
- `searchPosts(query, userId?, cursor, limit)` — content contains (case insensitive)
- `searchThreads(query, cursor, limit)` — content contains
- `searchReels(query, cursor, limit)` — caption contains OR hashtags has
- `getExploreFeed(cursor, limit)` — top posts by likesCount in last 7 days
- `getSuggestions(query, limit)` — parallel user + hashtag prefix search

### Add 5 endpoints: `GET /search/posts?q=`, `GET /search/threads?q=`, `GET /search/reels?q=`, `GET /search/explore`, `GET /search/suggestions?q=`.

---

## Agent 11: Stories Enhancements

**Goal:** Add story viewers list, story reply (creates DM), reaction summary.

**Files to MODIFY:** `apps/api/src/modules/stories/stories.service.ts`, `stories.controller.ts`

### Add methods:
- `getViewers(storyId, userId, cursor, limit)` — ownership check, return StoryView with user data
- `replyToStory(storyId, senderId, content)` — find/create DM conversation, create message with type STORY_REPLY
- `getReactionSummary(storyId, userId)` — raw SQL groupBy emoji with counts

### Add 3 endpoints.

---

## Agent 12: Channels Enhancements

**Goal:** Add channel analytics, subscriber list, recommended channels.

**Files to MODIFY:** `apps/api/src/modules/channels/channels.service.ts`, `channels.controller.ts`

### Add methods:
- `getAnalytics(channelId, userId)` — ownership check, aggregate views/subs/videos/recent subs
- `getSubscribers(channelId, userId, cursor, limit)` — ownership check, paginated subscriber list
- `getRecommended(userId, limit)` — raw SQL: popular channels user isn't subscribed to

### Add 3 endpoints.

---

## Agent 13: Videos Enhancements

**Goal:** Add video recommendations, comment replies, progress tracking, share link.

**Files to MODIFY:** `apps/api/src/modules/videos/videos.service.ts`, `videos.controller.ts`

### Add methods:
- `getRecommended(videoId, limit)` — same channel/category/tags, ordered by views
- `getCommentReplies(commentId, cursor, limit)` — nested VideoComment replies
- `recordProgress(videoId, userId, progress)` — upsert WatchHistory
- `getShareLink(videoId)` — returns URL

### Add 4 endpoints.

---

## Agent 14: Messages Enhancements

**Goal:** Add disappearing messages, conversation archiving, message scheduling, starred messages.

**Files to MODIFY:** `apps/api/src/modules/messages/messages.service.ts`, `messages.controller.ts`

### Add methods:
- `setDisappearingTimer(conversationId, userId, duration)` — membership check, update conversation
- `archiveConversation(conversationId, userId)` / `unarchiveConversation` — update ConversationMember.isArchived
- `getArchivedConversations(userId, cursor, limit)` — paginated archived list
- `scheduleMessage(conversationId, userId, content, scheduledAt, messageType?)` — create with isScheduled flag
- `getStarredMessages(userId, cursor, limit)` — messages where starredBy has userId

### Add 6 endpoints.

---

## Agent 15: Broadcast Channels Mobile (Batch 21 Retry)

**Goal:** Create two screens for Telegram-style broadcast channels.

**Files to CREATE:**
- `apps/mobile/app/(screens)/broadcast-channels.tsx` (~300 lines)
- `apps/mobile/app/(screens)/broadcast/[id].tsx` (~350 lines)

### `broadcast-channels.tsx`
Full discovery + subscription management. Two tabs: "Discover" and "My Channels".
- Header with back button + "Channels" title + "+" create button
- Search bar
- TabSelector for Discover/My Channels
- Discover: infinite scroll channel list with subscribe buttons, uses `broadcastApi.discover(cursor)`
- My Channels: list of subscribed channels, uses `broadcastApi.getMyChannels()`
- Each row: Avatar + channel name + subscriber count + description
- Skeleton loading (5 rows), EmptyState, RefreshControl

### `broadcast/[id].tsx`
Channel detail with message feed.
- Header: channel avatar + name + subscriber count + mute toggle
- Message feed (FlatList, newest at bottom)
- If admin/owner: compose bar at bottom
- Each message: sender avatar + name + content + media + timestamp + pin indicator
- BottomSheet for message options (pin/unpin, delete)
- Uses `broadcastApi.getById(id)`, `broadcastApi.getMessages(id, cursor)`, `broadcastApi.sendMessage()`
- Skeleton loading, RefreshControl

**CRITICAL:** Follow ALL CLAUDE.md rules. Use Icon (not emoji), BottomSheet (not Modal), Skeleton (not ActivityIndicator), EmptyState (not bare text).

---

## Agent 16: Close Friends Screen (Batch 21 Retry)

**File to CREATE:** `apps/mobile/app/(screens)/close-friends.tsx` (~250 lines)

- Header: "Close Friends" + back button
- Search bar to filter contacts
- FlatList of followers with green toggle (in/out of close friends circle)
- Uses `circlesApi` to manage circle named "Close Friends" — auto-create if not exists
- Each row: Avatar + name + username + toggle indicator
- Skeleton loading, EmptyState, RefreshControl

---

## Agent 17: Pinned & Starred Messages (Batch 21 Retry)

**Files to CREATE:**
- `apps/mobile/app/(screens)/pinned-messages.tsx` (~200 lines)
- `apps/mobile/app/(screens)/starred-messages.tsx` (~220 lines)

### `pinned-messages.tsx`
- Route param: `conversationId`
- Header: "Pinned Messages" + back
- FlatList of pinned messages with sender info, content, timestamp, unpin button
- Skeleton, EmptyState "No pinned messages", RefreshControl

### `starred-messages.tsx`
- Fetches all starred messages across conversations
- FlatList with conversation name header sections
- Each: message content + sender + timestamp + unstar button
- Skeleton, EmptyState "No starred messages", RefreshControl

---

## Agent 18: Community Posts (Batch 21 Retry)

**File to CREATE:** `apps/mobile/app/(screens)/community-posts.tsx` (~300 lines)

- Route param: `channelId`
- Header: "Community" + back + compose button (if channel owner)
- FlatList of community posts (text/image/poll)
- Each post: avatar + name + timestamp + content + media + like/comment row
- Compose form (inline at top if owner)
- Like/unlike with optimistic update
- Uses `channelPostsApi`
- Skeleton, EmptyState, RefreshControl

---

## Agent 19: StickerPicker Quality Rewrite

**File to MODIFY:** `apps/mobile/src/components/risalah/StickerPicker.tsx`

Review existing 414-line file. Ensure:
1. `<Skeleton>` for loading (not ActivityIndicator)
2. `<EmptyState>` for empty states
3. `<Icon>` for all icons (no emoji text)
4. `radius.*` from theme (no hardcoded borderRadius)
5. No `any` types
6. Tabs: Recent | My Packs (horizontal pack covers)
7. Grid: 4 columns of stickers, Pressable → onSelect callback
8. Search bar for sticker search
9. Uses `stickersApi` methods

Fix any violations found.

---

## Agent 20: StickerPackBrowser Quality Rewrite

**File to MODIFY:** `apps/mobile/src/components/risalah/StickerPackBrowser.tsx`

Review existing 544-line file. Ensure all CLAUDE.md rules followed:
1. Browse/search packs via `stickersApi`
2. Featured packs at top
3. Pack preview with sticker grid + add/remove button
4. Uses BottomSheet for preview (not Modal)
5. Skeleton loading, EmptyState, no `any` types

Fix any violations found.

---

## Agent 21: Sound Page

**File to CREATE:** `apps/mobile/app/(screens)/sound/[id].tsx` (~300 lines)

- Route param: audio track ID
- Header: cover art + title + artist + usage count
- "Use this sound" button → navigate to create-reel with audioTrackId
- Trending badge if `isTrending`
- FlatList grid (3 columns) of reels using this audio
- Each reel: thumbnail + view count overlay, tap → reel/[id]
- Uses `audioTracksApi.getById()`, `audioTracksApi.getReelsUsing()`
- Skeleton, EmptyState, RefreshControl

---

## Agent 22: Mutual Followers

**File to CREATE:** `apps/mobile/app/(screens)/mutual-followers.tsx` (~200 lines)

- Route param: `username`
- Header: "Followers you know" + back
- FlatList of mutual followers with Avatar + name + follow/unfollow button
- Uses `usersApi.getMutualFollowers()` (Agent 5 adds endpoint)
- Skeleton, EmptyState, RefreshControl

---

## Agent 23: Conversation Media Gallery

**File to CREATE:** `apps/mobile/app/(screens)/conversation-media.tsx` (~280 lines)

- Route param: `conversationId`
- Header: "Media" + back
- TabSelector: "Media" | "Links" | "Docs"
- Media tab: 3-column grid of images/videos
- Links tab: list of URLs from messages
- Docs tab: file attachments list
- Tap image → ImageLightbox, tap video → VideoPlayer
- Skeleton, EmptyState per tab, RefreshControl

---

## Agent 24: Theme Settings

**File to CREATE:** `apps/mobile/app/(screens)/theme-settings.tsx` (~150 lines)

- Header: "Appearance" + back
- Three radio options: Dark (moon icon), Light (sun icon), System (settings icon)
- Active option highlighted with emerald
- Preview swatch showing theme colors
- Uses `useStore` for theme state
- `useColorScheme()` for system option preview

---

## Agent 25: Account Settings

**File to CREATE:** `apps/mobile/app/(screens)/account-settings.tsx` (~250 lines)

Sections:
- Account Info: email, phone, joined date (read-only)
- Data & Privacy: "Download My Data" button, "Manage Data" link
- Account Actions: "Deactivate" (reversible), "Delete Account" (30-day grace, Alert confirmation)
- Uses `usersApi.exportData()`, `usersApi.requestAccountDeletion()`

---

## Agent 26: Share Profile & QR Scanner

**Files to CREATE:**
- `apps/mobile/app/(screens)/share-profile.tsx` (~180 lines)
- `apps/mobile/app/(screens)/qr-scanner.tsx` (~170 lines)

### `share-profile.tsx`
- QR code display (use simple View-based QR or `react-native-qrcode-svg`)
- Profile card preview: avatar + name + username
- "Copy Link" → clipboard `mizanly.app/@username`
- "Share" → native share sheet
- "Scan QR" → navigate to qr-scanner

### `qr-scanner.tsx`
- Camera with QR overlay
- On scan: parse mizanly.app URL → navigate to profile
- Close button

---

## Agent 27: Report Screen

**File to CREATE:** `apps/mobile/app/(screens)/reports/[id].tsx` (~220 lines)

- Route params: contentType, contentId
- Header: "Report" + back
- Radio reason selection (12 reasons from ReportReason enum)
- Optional description TextInput
- Submit → `reportsApi.create(data)`
- Success state: "Thank you" message

---

## Agent 28: Discover Screen

**File to CREATE:** `apps/mobile/app/(screens)/discover.tsx` (~350 lines)

- Header: "Discover" + search icon
- Trending hashtags horizontal scroll
- Content grid (3 columns, mixed posts + reels)
- Type indicator overlay (play icon for video)
- Tap → post/[id] or reel/[id]
- Uses `searchApi.getExploreFeed()`, `hashtagsApi.getTrending()`
- Infinite scroll, Skeleton grid, RefreshControl

---

## Agent 29: Search Results

**File to CREATE:** `apps/mobile/app/(screens)/search-results.tsx` (~400 lines)

- Route param: `query`
- Header: editable search input
- TabSelector: People | Posts | Threads | Reels | Hashtags
- Each tab fetches from search endpoint, renders appropriate list
- People: user rows + follow button
- Posts: PostCard list
- Threads: ThreadCard list
- Reels: 3-column thumbnail grid
- Hashtags: name + post count
- Skeleton per tab, EmptyState per tab, RefreshControl

---

## Agent 30: Voice Recorder

**File to CREATE:** `apps/mobile/app/(screens)/voice-recorder.tsx` (~280 lines)

- Full-screen recording UI
- Large circular record/stop button (red when recording)
- Timer showing elapsed time
- Amplitude visualization bars
- Playback preview after recording
- Send/cancel buttons
- Uses `expo-av` Audio.Recording
- Max 5 minutes, m4a format

---

## Agent 31: Create Broadcast

**File to CREATE:** `apps/mobile/app/(screens)/create-broadcast.tsx` (~250 lines)

- Header: "Create Channel" + back
- Avatar picker
- Name input (required, CharCountRing max 50)
- Slug input (auto from name, editable)
- Description textarea (CharCountRing max 200)
- Create button → `broadcastApi.create()` → navigate to channel
- Validation

---

## Agent 32: Schedule Live

**File to CREATE:** `apps/mobile/app/(screens)/schedule-live.tsx` (~250 lines)

- Header: "Schedule Live" + back
- Title input (required, max 100)
- Description textarea
- Thumbnail picker
- Date/time picker
- Schedule button → `liveApi.create({ scheduledAt })` → navigate to live

---

## Agent 33: Saf Tab Enhancements

**File to MODIFY:** `apps/mobile/app/(tabs)/saf.tsx`

Add:
1. "Your Story" bubble with "+" overlay at start of StoryRow → create-story
2. End-of-feed "You're all caught up" indicator with check-circle icon
3. "Not interested" in post long-press → `feedApi.dismiss()`
4. Camera icon in header → create-story

---

## Agent 34: Majlis Tab Enhancements

**File to MODIFY:** `apps/mobile/app/(tabs)/majlis.tsx`

Add:
1. Trending hashtag chips (horizontal scroll) between tab selector and feed
2. Reply permission lock icon on restricted threads
3. "Share" option in thread long-press
4. End-of-feed indicator

---

## Agent 35: Risalah Tab Enhancements

**File to MODIFY:** `apps/mobile/app/(tabs)/risalah.tsx`

Add:
1. Filter chips: All | Unread | Groups
2. "Archived" row at top → archived conversations
3. "Channels" FAB → broadcast-channels screen
4. Swipe-left to archive conversation
5. Read receipt icons (check/check-check) on last message

---

## Agent 36: Minbar Tab Enhancements

**File to MODIFY:** `apps/mobile/app/(tabs)/minbar.tsx`

Add:
1. Category chips: All, Islamic, Education, Lifestyle, Tech, Entertainment
2. "Watch Later" header button → watch-history screen
3. Subscription feed toggle (Home/Subscriptions tabs)
4. Video duration overlay on thumbnails
5. "Save to Watch Later" in video long-press

---

## Agent 37: Settings Screen Enhancements

**File to MODIFY:** `apps/mobile/app/(screens)/settings.tsx`

Add rows:
1. "Appearance" → theme-settings (Agent 24)
2. "Account" → account-settings (Agent 25)
3. "Share Profile" → share-profile (Agent 26)
4. "About" section: version, terms, privacy, licenses

---

## Agent 38: Edit Profile Enhancements

**File to MODIFY:** `apps/mobile/app/(screens)/edit-profile.tsx`

Add fields:
1. Pronouns dropdown
2. Location TextInput
3. Birthday date picker
4. All optional, save via `usersApi.updateProfile()`

---

## Agent 39: PostCard Enhancements

**File to MODIFY:** `apps/mobile/src/components/saf/PostCard.tsx`

Add:
1. Collab indicator (users icon) when `post.collaborators?.length > 0`
2. In action menu: "Copy Link", "Share as Story", "Not Interested"
3. Copy Link → `Clipboard.setStringAsync()`
4. Not Interested → `feedApi.dismiss()`

---

## Agent 40: ThreadCard Enhancements

**File to MODIFY:** `apps/mobile/src/components/majlis/ThreadCard.tsx`

Add:
1. Lock icon if `thread.replyPermission !== 'everyone'`
2. Bookmark icon (filled state) in action row
3. In long-press menu: "Copy Link", "Bookmark/Unbookmark"

---

## Agent 41: RichText Enhancements

**File to MODIFY:** `apps/mobile/src/components/ui/RichText.tsx`

Add detection for:
1. Phone numbers → `Linking.openURL('tel:...')`
2. Email addresses → `Linking.openURL('mailto:...')`
3. Extend existing regex chain (already handles #hashtags, @mentions, https:// URLs)

---

## Agent 42: API Client Integration

**File to MODIFY:** `apps/mobile/src/services/api.ts`

Add new export groups at bottom: `reportsApi`, `hashtagsApi`, `bookmarksApi`, `watchHistoryApi`.

Also extend existing groups with new methods from Agents 5-14:
- `usersApi`: getMutualFollowers, getLikedPosts, exportData, requestAccountDeletion, cancelAccountDeletion
- `postsApi`: archive, unarchive, getArchived, pinComment, unpinComment, getShareLink
- `threadsApi`: setReplyPermission, canReply, getShareLink, isBookmarked
- `reelsApi`: getByAudioTrack, getDuets, getStitches, archive, unarchive, getShareLink
- `notificationsApi`: markAllRead, delete, getUnreadCounts
- `searchApi`: searchPosts, searchThreads, searchReels, getExploreFeed, getSuggestions
- `storiesApi`: getViewers, replyToStory, getReactionSummary
- `channelsApi`: getAnalytics, getSubscribers, getRecommended
- `videosApi`: getRecommended, getCommentReplies, recordProgress, getShareLink
- `messagesApi`: setDisappearingTimer, archiveConversation, unarchiveConversation, getArchivedConversations, scheduleMessage, getStarredMessages

---

## Agent 43: Types Integration

**File to MODIFY:** `apps/mobile/src/types/index.ts`

Add new interfaces: `Report`, `HashtagInfo`, `BookmarkCollection`, `WatchHistoryItem`, `WatchLaterItem`, `SearchSuggestion`.

Update existing:
- `Thread`: add `replyPermission?: 'everyone' | 'following' | 'mentioned' | 'none'`
- `Post`: add `isArchived?: boolean`, `collaborators?: User[]`
- `Reel`: add `isArchived?: boolean`, `duetOfId?: string`, `stitchOfId?: string`
- `Conversation`: add `disappearingDuration?: number`
- `Message`: add `isScheduled?: boolean`, `scheduledAt?: string`, `starredBy?: string[]`

---

## Agent 44: Store Enhancements

**File to MODIFY:** `apps/mobile/src/store/index.ts`

Add state:
- `searchHistory: string[]` + `addSearchHistory(query)` + `clearSearchHistory()`
- `archivedConversationsCount: number` + setter
- `isRecording: boolean` + setter

Persist `searchHistory` (max 20). Add selectors.

---

## Agent 45: Backend Module Registration

**File to MODIFY:** `apps/api/src/app.module.ts`

**Files to CREATE:** Module files for hashtags, bookmarks, watch-history (reports module created by Agent 1).

Add imports + register in imports array:
```typescript
import { ReportsModule } from './modules/reports/reports.module';
import { HashtagsModule } from './modules/hashtags/hashtags.module';
import { BookmarksModule } from './modules/bookmarks/bookmarks.module';
import { WatchHistoryModule } from './modules/watch-history/watch-history.module';
```

Create `hashtags.module.ts`, `bookmarks.module.ts`, `watch-history.module.ts` with standard NestJS pattern (PrismaModule import, controller + service providers).

---

## Post-Batch 22 Verification Checklist

### Backend
- [ ] `npm run build` compiles clean
- [ ] 4 new modules registered
- [ ] All 10 enhanced services have new methods
- [ ] Swagger shows all new endpoints
- [ ] No `any` in non-test code

### Mobile
- [ ] `npx expo start` launches clean
- [ ] All 18 new screens render
- [ ] All 6 tab/screen enhancements work
- [ ] All 3 component enhancements work
- [ ] StickerPicker + StickerPackBrowser pass quality rules
- [ ] api.ts has all new + extended groups
- [ ] types/index.ts has all new interfaces
- [ ] store has new state
- [ ] All CLAUDE.md rules followed everywhere

---

## Batch 23 Preview

1. E2E Testing — Detox for critical flows
2. i18n / Arabic RTL — Full translation
3. Push Notifications — FCM/APNs via Expo
4. Deep Linking — Universal links
5. Offline Mode — SQLite + sync
6. Performance — Image caching, memo, virtualization
7. CI/CD — GitHub Actions
8. Accessibility — Screen reader, contrast
9. Content Moderation AI
10. Monetization — Tips, subscriptions
