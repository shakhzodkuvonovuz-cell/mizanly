# ARCHITECT INSTRUCTIONS — Mizanly (Batch 12: Minbar V1.3 — Playlists + Watch History)
## For Sonnet/Haiku: Read CLAUDE.md first, then this file top to bottom.

**Last updated:** 2026-03-07 by Claude Opus 4.6
**Previous batches:** 1-9 (features+quality+security+gaps) -> 10 (bugs) -> 11 (polish+tests) -> This file.

---

## CRITICAL CONTEXT

Batches 1-11 delivered all 5 spaces, 240+ tests, 0 compilation errors, full theme compliance, and comprehensive test coverage. This batch adds **Minbar V1.3** — playlists and watch history. The Prisma schema already has `Playlist`, `PlaylistItem`, `WatchHistory`, and `WatchLater` models. The backend already records watch history in the videos `view()` method. We need:

1. A full **playlists** backend module (CRUD + items management)
2. A **watch history** endpoint (query existing data)
3. **Mobile types, API methods, and screens** for both features
4. Integration into existing channel and video screens

**Schema models (already exist, do NOT modify):**

```prisma
model Playlist {
  id           String   @id @default(cuid())
  channelId    String
  channel      Channel  @relation(...)
  title        String   @db.VarChar(200)
  description  String?  @db.VarChar(1000)
  thumbnailUrl String?
  isPublic     Boolean  @default(true)
  videosCount  Int      @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  items        PlaylistItem[]
}

model PlaylistItem {
  id         String   @id @default(cuid())
  playlistId String
  videoId    String
  position   Int
  playlist   Playlist @relation(...)
  video      Video    @relation(...)
  createdAt  DateTime @default(now())
  @@unique([playlistId, videoId])
}

model WatchHistory {
  id        String   @id @default(cuid())
  userId    String
  videoId   String
  watchedAt DateTime @default(now())
  progress  Float    @default(0)
  completed Boolean  @default(false)
  user      User     @relation(...)
  video     Video    @relation(...)
  @@unique([userId, videoId])
}
```

---

## DO NOT TOUCH

- Prisma schema — models are final, do not modify
- `$executeRaw` tagged template literals — safe
- Passing tests — don't rewrite
- Existing working features in all 5 spaces
- Files not listed in your assigned step

---

## STEP 1: CREATE PLAYLISTS BACKEND MODULE

### Context
Create a complete NestJS module for playlist CRUD and item management. Follow the exact patterns used in the existing `channels` and `videos` modules.

### 1.1 Create playlist DTOs

**File to create:** `apps/api/src/modules/playlists/dto/create-playlist.dto.ts`

```ts
import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePlaylistDto {
  @ApiProperty()
  @IsString()
  channelId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
```

**File to create:** `apps/api/src/modules/playlists/dto/update-playlist.dto.ts`

```ts
import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePlaylistDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
```

### 1.2 Create playlists service

**File to create:** `apps/api/src/modules/playlists/playlists.service.ts`

Read `apps/api/src/modules/channels/channels.service.ts` for the pattern. The playlists service needs these methods:

```ts
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreatePlaylistDto } from './dto/create-playlist.dto';
import { UpdatePlaylistDto } from './dto/update-playlist.dto';

const PLAYLIST_SELECT = {
  id: true,
  channelId: true,
  title: true,
  description: true,
  thumbnailUrl: true,
  isPublic: true,
  videosCount: true,
  createdAt: true,
  updatedAt: true,
};

const PLAYLIST_ITEM_SELECT = {
  id: true,
  position: true,
  createdAt: true,
  video: {
    select: {
      id: true,
      title: true,
      thumbnailUrl: true,
      duration: true,
      viewsCount: true,
      createdAt: true,
      channel: { select: { id: true, handle: true, name: true, avatarUrl: true } },
    },
  },
};

@Injectable()
export class PlaylistsService {
  constructor(private prisma: PrismaService) {}

  // Create a playlist — verify channel ownership
  async create(userId: string, dto: CreatePlaylistDto) {
    const channel = await this.prisma.channel.findUnique({ where: { id: dto.channelId } });
    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.userId !== userId) throw new ForbiddenException('Not your channel');

    return this.prisma.playlist.create({
      data: {
        channelId: dto.channelId,
        title: dto.title,
        description: dto.description,
        isPublic: dto.isPublic ?? true,
      },
      select: PLAYLIST_SELECT,
    });
  }

  // Get a single playlist by ID
  async getById(id: string) {
    const playlist = await this.prisma.playlist.findUnique({
      where: { id },
      select: { ...PLAYLIST_SELECT, channel: { select: { id: true, handle: true, name: true, userId: true } } },
    });
    if (!playlist) throw new NotFoundException('Playlist not found');
    return playlist;
  }

  // Get all playlists for a channel (paginated)
  async getByChannel(channelId: string, cursor?: string, limit = 20) {
    const playlists = await this.prisma.playlist.findMany({
      where: { channelId, isPublic: true },
      select: PLAYLIST_SELECT,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = playlists.length > limit;
    const items = hasMore ? playlists.slice(0, limit) : playlists;
    return {
      data: items,
      meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
    };
  }

  // Get playlist items (videos in playlist, ordered by position)
  async getItems(playlistId: string, cursor?: string, limit = 20) {
    const playlist = await this.prisma.playlist.findUnique({ where: { id: playlistId } });
    if (!playlist) throw new NotFoundException('Playlist not found');

    const items = await this.prisma.playlistItem.findMany({
      where: { playlistId },
      select: PLAYLIST_ITEM_SELECT,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { position: 'asc' },
    });

    const hasMore = items.length > limit;
    const result = hasMore ? items.slice(0, limit) : items;
    return {
      data: result,
      meta: { cursor: hasMore ? result[result.length - 1].id : null, hasMore },
    };
  }

  // Update a playlist — verify channel ownership
  async update(id: string, userId: string, dto: UpdatePlaylistDto) {
    const playlist = await this.prisma.playlist.findUnique({
      where: { id },
      include: { channel: { select: { userId: true } } },
    });
    if (!playlist) throw new NotFoundException('Playlist not found');
    if (playlist.channel.userId !== userId) throw new ForbiddenException('Not your playlist');

    return this.prisma.playlist.update({
      where: { id },
      data: dto,
      select: PLAYLIST_SELECT,
    });
  }

  // Delete a playlist — verify channel ownership
  async delete(id: string, userId: string) {
    const playlist = await this.prisma.playlist.findUnique({
      where: { id },
      include: { channel: { select: { userId: true } } },
    });
    if (!playlist) throw new NotFoundException('Playlist not found');
    if (playlist.channel.userId !== userId) throw new ForbiddenException('Not your playlist');

    await this.prisma.playlist.delete({ where: { id } });
    return { deleted: true };
  }

  // Add a video to a playlist — verify ownership, auto-set position
  async addItem(playlistId: string, videoId: string, userId: string) {
    const playlist = await this.prisma.playlist.findUnique({
      where: { id: playlistId },
      include: { channel: { select: { userId: true } } },
    });
    if (!playlist) throw new NotFoundException('Playlist not found');
    if (playlist.channel.userId !== userId) throw new ForbiddenException('Not your playlist');

    const maxPosition = await this.prisma.playlistItem.aggregate({
      where: { playlistId },
      _max: { position: true },
    });

    const [item] = await this.prisma.$transaction([
      this.prisma.playlistItem.create({
        data: {
          playlistId,
          videoId,
          position: (maxPosition._max.position ?? -1) + 1,
        },
        select: PLAYLIST_ITEM_SELECT,
      }),
      this.prisma.playlist.update({
        where: { id: playlistId },
        data: { videosCount: { increment: 1 } },
      }),
    ]);
    return item;
  }

  // Remove a video from a playlist
  async removeItem(playlistId: string, videoId: string, userId: string) {
    const playlist = await this.prisma.playlist.findUnique({
      where: { id: playlistId },
      include: { channel: { select: { userId: true } } },
    });
    if (!playlist) throw new NotFoundException('Playlist not found');
    if (playlist.channel.userId !== userId) throw new ForbiddenException('Not your playlist');

    await this.prisma.$transaction([
      this.prisma.playlistItem.delete({
        where: { playlistId_videoId: { playlistId, videoId } },
      }),
      this.prisma.playlist.update({
        where: { id: playlistId },
        data: { videosCount: { decrement: 1 } },
      }),
    ]);
    return { removed: true };
  }
}
```

### 1.3 Create playlists controller

**File to create:** `apps/api/src/modules/playlists/playlists.controller.ts`

```ts
import { Body, Controller, Get, Post, Patch, Delete, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlaylistsService } from './playlists.service';
import { CreatePlaylistDto } from './dto/create-playlist.dto';
import { UpdatePlaylistDto } from './dto/update-playlist.dto';

@ApiTags('playlists')
@ApiBearerAuth()
@Controller('playlists')
@UseGuards(ClerkAuthGuard)
export class PlaylistsController {
  constructor(private readonly playlistsService: PlaylistsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a playlist' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreatePlaylistDto) {
    return this.playlistsService.create(userId, dto);
  }

  @Get(':id')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get playlist by ID' })
  getById(@Param('id') id: string) {
    return this.playlistsService.getById(id);
  }

  @Get('channel/:channelId')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get playlists for a channel' })
  getByChannel(@Param('channelId') channelId: string, @Query('cursor') cursor?: string) {
    return this.playlistsService.getByChannel(channelId, cursor);
  }

  @Get(':id/items')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get videos in a playlist' })
  getItems(@Param('id') id: string, @Query('cursor') cursor?: string) {
    return this.playlistsService.getItems(id, cursor);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a playlist' })
  update(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: UpdatePlaylistDto) {
    return this.playlistsService.update(id, userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a playlist' })
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.playlistsService.delete(id, userId);
  }

  @Post(':id/items/:videoId')
  @ApiOperation({ summary: 'Add a video to a playlist' })
  addItem(@Param('id') id: string, @Param('videoId') videoId: string, @CurrentUser('id') userId: string) {
    return this.playlistsService.addItem(id, videoId, userId);
  }

  @Delete(':id/items/:videoId')
  @ApiOperation({ summary: 'Remove a video from a playlist' })
  removeItem(@Param('id') id: string, @Param('videoId') videoId: string, @CurrentUser('id') userId: string) {
    return this.playlistsService.removeItem(id, videoId, userId);
  }
}
```

### 1.4 Create playlists module

**File to create:** `apps/api/src/modules/playlists/playlists.module.ts`

```ts
import { Module } from '@nestjs/common';
import { PlaylistsService } from './playlists.service';
import { PlaylistsController } from './playlists.controller';

@Module({
  controllers: [PlaylistsController],
  providers: [PlaylistsService],
  exports: [PlaylistsService],
})
export class PlaylistsModule {}
```

### 1.5 Register in AppModule

**File:** `apps/api/src/app.module.ts`

Add import and register:
```ts
import { PlaylistsModule } from './modules/playlists/playlists.module';

// Add PlaylistsModule to the imports array
```

Read the file first to see where other modules are imported. Follow the same pattern.

**Run after:** `cd apps/api && npx tsc --noEmit`

---

## STEP 2: CREATE PLAYLISTS SERVICE SPEC

### Context
Write comprehensive tests for the playlists service. Follow the exact mock pattern used in existing specs (read `apps/api/src/modules/channels/channels.service.spec.ts` for reference).

**File to create:** `apps/api/src/modules/playlists/playlists.service.spec.ts`

Test all 8 methods:
1. `create` — success, channel not found, not owner
2. `getById` — success, not found
3. `getByChannel` — pagination with cursor, empty results
4. `getItems` — pagination, playlist not found
5. `update` — success, not found, not owner
6. `delete` — success, not found, not owner
7. `addItem` — success, auto-position, not owner
8. `removeItem` — success, not owner

Mock pattern:
```ts
const mockPrisma = {
  playlist: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), delete: jest.fn() },
  playlistItem: { create: jest.fn(), findMany: jest.fn(), delete: jest.fn(), aggregate: jest.fn() },
  channel: { findUnique: jest.fn() },
  $transaction: jest.fn((fns) => Promise.all(fns)),
};
```

Target: 15+ test cases.

**Run after:** `cd apps/api && npx jest playlists.service.spec && npx jest --passWithNoTests`

---

## STEP 3: ADD WATCH HISTORY BACKEND ENDPOINT

### Context
The `videos.service.ts` already upserts `WatchHistory` records when a video is viewed (line ~547). But there's NO endpoint to QUERY watch history. The `users.service.ts` has `getWatchLater()` but NO `getWatchHistory()`. Add the query endpoint.

### 3.1 Add getWatchHistory to users.service.ts

**File:** `apps/api/src/modules/users/users.service.ts`

Read the existing `getWatchLater()` method (around line 360). Add a similar `getWatchHistory()` method right after it:

```ts
async getWatchHistory(userId: string, cursor?: string, limit = 20) {
  const items = await this.prisma.watchHistory.findMany({
    where: { userId },
    include: {
      video: {
        select: {
          id: true,
          title: true,
          thumbnailUrl: true,
          duration: true,
          viewsCount: true,
          createdAt: true,
          channel: { select: { id: true, handle: true, name: true, avatarUrl: true } },
        },
      },
    },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { watchedAt: 'desc' },
  });

  const hasMore = items.length > limit;
  const result = hasMore ? items.slice(0, limit) : items;
  return {
    data: result.map((w: { video: unknown; progress: number; completed: boolean; watchedAt: Date }) => ({
      ...w.video,
      progress: w.progress,
      completed: w.completed,
      watchedAt: w.watchedAt,
    })),
    meta: {
      cursor: hasMore ? result[result.length - 1].id : null,
      hasMore,
    },
  };
}

async clearWatchHistory(userId: string) {
  await this.prisma.watchHistory.deleteMany({ where: { userId } });
  return { cleared: true };
}
```

### 3.2 Add endpoints to users.controller.ts

**File:** `apps/api/src/modules/users/users.controller.ts`

Read the file to find where `getWatchLater` is exposed. Add these endpoints nearby:

```ts
@Get('me/watch-history')
@ApiOperation({ summary: 'Get watch history' })
getWatchHistory(@CurrentUser('id') userId: string, @Query('cursor') cursor?: string) {
  return this.usersService.getWatchHistory(userId, cursor);
}

@Delete('me/watch-history')
@ApiOperation({ summary: 'Clear watch history' })
clearWatchHistory(@CurrentUser('id') userId: string) {
  return this.usersService.clearWatchHistory(userId);
}
```

**Run after:** `cd apps/api && npx tsc --noEmit && npx jest --passWithNoTests`

---

## STEP 4: ADD MOBILE TYPES + API METHODS

### Context
Add TypeScript types for Playlist and PlaylistItem, plus all API methods for playlists and watch history. This agent owns `api.ts` and `types/index.ts` exclusively.

### 4.1 Add types to types/index.ts

**File:** `apps/mobile/src/types/index.ts`

Add these interfaces (read the file first to find the right location — put near Video/Channel types):

```ts
export interface Playlist {
  id: string;
  channelId: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  isPublic: boolean;
  videosCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlaylistItem {
  id: string;
  position: number;
  createdAt: string;
  video: {
    id: string;
    title: string;
    thumbnailUrl?: string;
    duration: number;
    viewsCount: number;
    createdAt: string;
    channel: { id: string; handle: string; name: string; avatarUrl?: string };
  };
}

export interface WatchHistoryItem {
  id: string;
  title: string;
  thumbnailUrl?: string;
  duration: number;
  viewsCount: number;
  createdAt: string;
  channel: { id: string; handle: string; name: string; avatarUrl?: string };
  progress: number;
  completed: boolean;
  watchedAt: string;
}
```

### 4.2 Add playlistsApi to api.ts

**File:** `apps/mobile/src/services/api.ts`

Add the `Playlist`, `PlaylistItem`, `WatchHistoryItem` imports at the top (from `@/types`).

Add after the `videosApi` section:

```ts
// -- Playlists (Minbar) --
export const playlistsApi = {
  create: (data: { channelId: string; title: string; description?: string; isPublic?: boolean }) =>
    api.post<Playlist>('/playlists', data).then(r => r.data),
  getById: (id: string) =>
    api.get<Playlist>(`/playlists/${id}`).then(r => r.data),
  getByChannel: (channelId: string, cursor?: string) =>
    api.get<PaginatedResponse<Playlist>>(`/playlists/channel/${channelId}${qs({ cursor })}`).then(r => r.data),
  getItems: (id: string, cursor?: string) =>
    api.get<PaginatedResponse<PlaylistItem>>(`/playlists/${id}/items${qs({ cursor })}`).then(r => r.data),
  update: (id: string, data: Partial<Playlist>) =>
    api.patch<Playlist>(`/playlists/${id}`, data).then(r => r.data),
  delete: (id: string) =>
    api.delete(`/playlists/${id}`).then(r => r.data),
  addItem: (id: string, videoId: string) =>
    api.post(`/playlists/${id}/items/${videoId}`).then(r => r.data),
  removeItem: (id: string, videoId: string) =>
    api.delete(`/playlists/${id}/items/${videoId}`).then(r => r.data),
};
```

### 4.3 Add watch history methods to usersApi

In the same file, find the `usersApi` object. Add:

```ts
getWatchHistory: (cursor?: string) =>
  api.get<PaginatedResponse<WatchHistoryItem>>(`/users/me/watch-history${qs({ cursor })}`),
clearWatchHistory: () =>
  api.delete('/users/me/watch-history'),
```

---

## STEP 5: CREATE PLAYLIST LIST SCREEN

### Context
Create a screen that shows all playlists for a channel. This screen is navigated to from the channel detail page. Follow the exact same patterns as `channel/[handle].tsx` for the layout, loading, error, and empty states.

**File to create:** `apps/mobile/app/(screens)/playlists/[channelId].tsx`

**Read first:** `apps/mobile/app/(screens)/channel/[handle].tsx` — use the same imports, style patterns, and component structure.

**Screen structure:**
1. Header: back button + "Playlists" title
2. Query: `useInfiniteQuery` calling `playlistsApi.getByChannel(channelId, cursor)`
3. Loading: `<Skeleton.Rect />` placeholders (3-4 rows)
4. Error: `isError` check → EmptyState with "Something went wrong"
5. Empty: `<EmptyState icon="layers" title="No playlists yet" />`
6. List: FlatList with `<RefreshControl>`, pagination via `onEndReached`
7. Each item: Thumbnail (or placeholder icon), title, video count, tap → `/(screens)/playlist/${item.id}`

**Playlist card layout:**
```tsx
<TouchableOpacity style={styles.playlistCard} onPress={() => router.push(`/(screens)/playlist/${item.id}`)}>
  {item.thumbnailUrl ? (
    <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbnail} />
  ) : (
    <View style={[styles.thumbnail, styles.placeholderThumb]}>
      <Icon name="layers" size="lg" color={colors.text.tertiary} />
    </View>
  )}
  <View style={styles.cardInfo}>
    <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
    <Text style={styles.cardMeta}>{item.videosCount} videos</Text>
  </View>
</TouchableOpacity>
```

**Styles:** Use `colors`, `spacing`, `fontSize`, `radius` from `@/theme`. Thumbnail: 120x68 with `radius.sm`, `backgroundColor: colors.dark.bgCard`.

---

## STEP 6: CREATE PLAYLIST DETAIL SCREEN

### Context
Shows videos in a playlist with the playlist title/description header. Navigated from the playlists list screen.

**File to create:** `apps/mobile/app/(screens)/playlist/[id].tsx`

**Read first:** `apps/mobile/app/(screens)/channel/[handle].tsx` — similar structure with header + video list.

**Screen structure:**
1. Header: back button + playlist title
2. Query A: `useQuery` calling `playlistsApi.getById(id)` for playlist metadata
3. Query B: `useInfiniteQuery` calling `playlistsApi.getItems(id, cursor)` for video list
4. Loading: Skeleton
5. Error: EmptyState with back button
6. Playlist header section: title, description (if any), video count, channel name
7. Video list: FlatList with each item showing thumbnail, title, channel, duration — same `VideoCard` pattern as minbar.tsx
8. `<RefreshControl>` on the FlatList
9. Tap a video → `/(screens)/video/${video.id}`

**Video item layout** (same as minbar.tsx VideoCard):
```tsx
<TouchableOpacity style={styles.videoItem} onPress={() => router.push(`/(screens)/video/${item.video.id}`)}>
  <View style={styles.thumbWrap}>
    <Image source={{ uri: item.video.thumbnailUrl }} style={styles.videoThumb} />
    <View style={styles.durationBadge}>
      <Text style={styles.durationText}>{formatDuration(item.video.duration)}</Text>
    </View>
  </View>
  <View style={styles.videoInfo}>
    <Text style={styles.videoTitle} numberOfLines={2}>{item.video.title}</Text>
    <Text style={styles.videoMeta}>{item.video.channel.name} · {formatViews(item.video.viewsCount)} views</Text>
  </View>
</TouchableOpacity>
```

Helper:
```ts
const formatDuration = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const formatViews = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};
```

---

## STEP 7: ADD "SAVE TO PLAYLIST" + WIRE CHANNEL PLAYLISTS TAB

### Context
Two integrations: (A) video detail screen gets a "Save to playlist" option in its more-menu, (B) channel detail screen gets a "Playlists" tab.

### 7.1 Add "Save to playlist" BottomSheet in video/[id].tsx

**File:** `apps/mobile/app/(screens)/video/[id].tsx`

Read the file first. Find the existing BottomSheet/more-menu. Add a new option:

```tsx
<BottomSheetItem
  label="Save to playlist"
  icon={<Icon name="layers" size="sm" color={colors.text.primary} />}
  onPress={() => {
    setShowMenu(false);
    router.push(`/(screens)/save-to-playlist?videoId=${video.id}`);
  }}
/>
```

### 7.2 Create "Save to playlist" screen

**File to create:** `apps/mobile/app/(screens)/save-to-playlist.tsx`

This screen shows the user's playlists with checkmarks for which ones contain the video. The user can tap to add/remove.

**Structure:**
1. Get `videoId` from search params
2. Get user's channels: `useQuery` → `channelsApi.getMyChannels()`
3. For each channel, get playlists: `useQuery` → `playlistsApi.getByChannel(channelId)`
4. Show a simple list of playlists with a toggle/checkbox for each
5. Tap a playlist → call `playlistsApi.addItem(playlistId, videoId)` or `removeItem`
6. Header: back button + "Save to playlist" title
7. Footer: "New playlist" button → navigate to create flow or inline create

**Keep it simple** — a FlatList of playlist names with an add/remove toggle. No need for thumbnails here.

```tsx
// Each row:
<Pressable style={styles.row} onPress={() => togglePlaylist(playlist.id)}>
  <Text style={styles.playlistName}>{playlist.title}</Text>
  <Icon
    name={isInPlaylist ? 'check-circle' : 'circle-plus'}
    size="md"
    color={isInPlaylist ? colors.emerald : colors.text.tertiary}
  />
</Pressable>
```

### 7.3 Add "Playlists" tab to channel/[handle].tsx

**File:** `apps/mobile/app/(screens)/channel/[handle].tsx`

Read the file. Find the `CHANNEL_TABS` array (around line 27):
```ts
const CHANNEL_TABS = [
  { key: 'videos', label: 'Videos' },
  { key: 'about', label: 'About' },
];
```

Add playlists tab:
```ts
type Tab = 'videos' | 'playlists' | 'about';

const CHANNEL_TABS = [
  { key: 'videos', label: 'Videos' },
  { key: 'playlists', label: 'Playlists' },
  { key: 'about', label: 'About' },
];
```

Add a playlists query:
```ts
const playlistsQuery = useInfiniteQuery({
  queryKey: ['channel-playlists', channelData?.id],
  queryFn: ({ pageParam }) => playlistsApi.getByChannel(channelData!.id, pageParam),
  getNextPageParam: (last) => last.meta?.hasMore ? last.meta.cursor : undefined,
  initialPageParam: undefined as string | undefined,
  enabled: !!channelData?.id && activeTab === 'playlists',
});
```

Render the playlists tab content with the same card layout as Step 5. Import `playlistsApi` from `@/services/api` and `Playlist` from `@/types`.

---

## STEP 8: CREATE WATCH HISTORY SCREEN

### Context
A screen showing the user's recently watched videos. Accessible from the profile/settings area.

**File to create:** `apps/mobile/app/(screens)/watch-history.tsx`

**Read first:** `apps/mobile/app/(screens)/saved.tsx` — similar "user's content list" pattern.

**Screen structure:**
1. Header: back button + "Watch History" title + "Clear" button (top-right)
2. Query: `useInfiniteQuery` calling `usersApi.getWatchHistory(cursor)`
3. Loading: Skeleton rows
4. Error: EmptyState
5. Empty: `<EmptyState icon="clock" title="No watch history" subtitle="Videos you watch will appear here" />`
6. List: FlatList with RefreshControl, pagination
7. Each item: same VideoCard layout as playlist detail (thumbnail + title + channel + duration)
8. "Clear" button: `Alert.alert('Clear history?', ...)` → call `usersApi.clearWatchHistory()` → refetch

**Clear button in header:**
```tsx
<Pressable onPress={handleClear} hitSlop={8}>
  <Text style={styles.clearText}>Clear</Text>
</Pressable>
```

**Progress indicator** (optional but nice): If `item.progress > 0 && !item.completed`, show a thin emerald bar under the thumbnail:
```tsx
{item.progress > 0 && !item.completed && (
  <View style={[styles.progressBar, { width: `${item.progress * 100}%` }]} />
)}
```

Styles: `progressBar: { height: 3, backgroundColor: colors.emerald, borderRadius: 1.5 }`

---

## ABSOLUTE RULES — NEVER VIOLATE

1. **NEVER use RN `Modal`** — Always `<BottomSheet>`
2. **NEVER use text emoji for icons** — Always `<Icon name="..." />`
3. **NEVER hardcode border radius >= 6** — Always `radius.*` from theme
4. **NEVER use bare "No items" text** — Always `<EmptyState>`
5. **ALL FlatLists must have `<RefreshControl>`**
6. **NEVER use `any` in new non-test code**
7. **NEVER suppress errors with `@ts-ignore`**
8. **NEVER add `console.log/warn/error` to mobile code**
9. **The `$executeRaw` tagged template literals are SAFE**
10. **New screens MUST have: loading skeleton, error state, empty state, back button**

---

## 8-AGENT PARALLELIZATION (zero file conflicts)

```
Agent 1: Step 1  — playlists.service.ts, playlists.controller.ts, playlists.module.ts, DTOs, app.module.ts
Agent 2: Step 2  — playlists.service.spec.ts (new)
Agent 3: Step 3  — users.service.ts, users.controller.ts (watch history endpoint)
Agent 4: Step 4  — types/index.ts, api.ts (types + API methods)
Agent 5: Step 5  — playlists/[channelId].tsx (new screen)
Agent 6: Step 6  — playlist/[id].tsx (new screen)
Agent 7: Step 7  — video/[id].tsx, save-to-playlist.tsx (new), channel/[handle].tsx
Agent 8: Step 8  — watch-history.tsx (new screen)
```

**File conflict check:**

| File | Agent |
|------|-------|
| playlists.service.ts (new) | 1 |
| playlists.controller.ts (new) | 1 |
| playlists.module.ts (new) | 1 |
| dto/create-playlist.dto.ts (new) | 1 |
| dto/update-playlist.dto.ts (new) | 1 |
| app.module.ts | 1 |
| playlists.service.spec.ts (new) | 2 |
| users.service.ts | 3 |
| users.controller.ts | 3 |
| types/index.ts | 4 |
| api.ts | 4 |
| playlists/[channelId].tsx (new) | 5 |
| playlist/[id].tsx (new) | 6 |
| video/[id].tsx | 7 |
| save-to-playlist.tsx (new) | 7 |
| channel/[handle].tsx | 7 |
| watch-history.tsx (new) | 8 |

All unique per agent. Zero conflicts.

---

## VERIFICATION CHECKLIST

```bash
# 1. All tests pass (including new playlists spec)
cd apps/api && npx jest --passWithNoTests
# Expected: 255+ tests, 0 failures

# 2. Backend compiles
cd apps/api && npx tsc --noEmit
# Expected: 0 errors

# 3. Playlists endpoints exist
grep -c "playlists" apps/api/src/modules/playlists/playlists.controller.ts
# Expected: 8+ (one per endpoint)

# 4. Watch history endpoint exists
grep "getWatchHistory" apps/api/src/modules/users/users.controller.ts
# Expected: found

# 5. Mobile API methods exist
grep -c "playlistsApi" apps/mobile/src/services/api.ts
# Expected: 1+ (the export object)

# 6. Playlist types exist
grep "interface Playlist" apps/mobile/src/types/index.ts
# Expected: found

# 7. New screens exist
ls apps/mobile/app/\(screens\)/playlists/\[channelId\].tsx apps/mobile/app/\(screens\)/playlist/\[id\].tsx apps/mobile/app/\(screens\)/save-to-playlist.tsx apps/mobile/app/\(screens\)/watch-history.tsx
# Expected: all 4 files found

# 8. Channel has playlists tab
grep "playlists" apps/mobile/app/\(screens\)/channel/\[handle\].tsx
# Expected: found in CHANNEL_TABS

# 9. No console statements
grep -rn "console\.\(log\|warn\|error\)" apps/mobile/app/ apps/mobile/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules
# Expected: 0

# 10. No as any in new code
grep -rn "as any" apps/mobile/app/\(screens\)/playlist/ apps/mobile/app/\(screens\)/playlists/ apps/mobile/app/\(screens\)/save-to-playlist.tsx apps/mobile/app/\(screens\)/watch-history.tsx --include="*.tsx"
# Expected: 0
```
