# ARCHITECT INSTRUCTIONS — Mizanly (Batch 14: Playlists Backend Wiring + Watch-Later CRUD + Fixes)
## For Sonnet/Haiku: Read CLAUDE.md first, then this file top to bottom.

**Last updated:** 2026-03-08 by Claude Opus 4.6
**Previous batches:** 1-13 (features+quality+polish+Minbar V1.3) -> This file.

---

## Context
Batch 13 completed Minbar V1.3 mobile features (Continue Watching, video progress, watch-later screen, profile links). However, the **playlists backend module is NOT wired** — it has a service + DTOs + spec but NO controller, NO module file, and is NOT registered in app.module.ts. Additionally, the watch-later **add/remove endpoints** are missing from the backend (only GET exists). There's also a stray duplicate directory and a missing playlist detail screen.

**This batch fixes all of these critical gaps.**

---

## Pre-Read Requirements
Before starting any step, read `CLAUDE.md` for project rules (especially: NEVER use RN Modal, NEVER hardcode radius, NEVER use `as any`, ALWAYS use `@CurrentUser('id')`, all FlatLists need RefreshControl).

---

## Step 1 — Create `playlists.controller.ts`
**Agent 1** | File: `apps/api/src/modules/playlists/playlists.controller.ts` (NEW)

Create the NestJS controller that wires all 8 service methods to REST endpoints.

```ts
import {
  Controller, Post, Get, Patch, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlaylistsService } from './playlists.service';
import { CreatePlaylistDto } from './dto/create-playlist.dto';
import { UpdatePlaylistDto } from './dto/update-playlist.dto';

@ApiTags('Playlists (Minbar)')
@Controller('playlists')
export class PlaylistsController {
  constructor(private readonly playlistsService: PlaylistsService) {}

  @Post()
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a playlist' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePlaylistDto,
  ) {
    return this.playlistsService.create(userId, dto);
  }

  @Get('channel/:channelId')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get playlists by channel' })
  getByChannel(
    @Param('channelId') channelId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.playlistsService.getByChannel(channelId, cursor);
  }

  @Get(':id')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get playlist by ID' })
  getById(@Param('id') id: string) {
    return this.playlistsService.getById(id);
  }

  @Get(':id/items')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get playlist items (cursor paginated)' })
  getItems(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.playlistsService.getItems(id, cursor);
  }

  @Patch(':id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update playlist details' })
  update(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdatePlaylistDto,
  ) {
    return this.playlistsService.update(id, userId, dto);
  }

  @Delete(':id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a playlist' })
  delete(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.playlistsService.delete(id, userId);
  }

  @Post(':id/items/:videoId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a video to a playlist' })
  addItem(
    @Param('id') id: string,
    @Param('videoId') videoId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.playlistsService.addItem(id, videoId, userId);
  }

  @Delete(':id/items/:videoId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a video from a playlist' })
  removeItem(
    @Param('id') id: string,
    @Param('videoId') videoId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.playlistsService.removeItem(id, videoId, userId);
  }
}
```

**Verification:** File compiles with no errors. All 8 endpoints match service method signatures.

---

## Step 2 — Create `playlists.module.ts` + Register in `app.module.ts`
**Agent 2** | Files:
- `apps/api/src/modules/playlists/playlists.module.ts` (NEW)
- `apps/api/src/app.module.ts` (EDIT — add PlaylistsModule)

### playlists.module.ts — Create this file:
```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma.module';
import { PlaylistsService } from './playlists.service';
import { PlaylistsController } from './playlists.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PlaylistsController],
  providers: [PlaylistsService],
  exports: [PlaylistsService],
})
export class PlaylistsModule {}
```

### app.module.ts — Add PlaylistsModule:
1. Add import at line 16 (after VideosModule import):
```ts
import { PlaylistsModule } from './modules/playlists/playlists.module';
```
2. Add `PlaylistsModule` to the imports array (after `VideosModule,` on line 53):
```ts
    VideosModule,
    PlaylistsModule,
```

**Verification:** `app.module.ts` imports all 21 feature modules. No duplicate imports.

---

## Step 3 — Add Watch-Later Add/Remove Endpoints
**Agent 3** | Files:
- `apps/api/src/modules/users/users.controller.ts` (EDIT)
- `apps/api/src/modules/users/users.service.ts` (EDIT)

### users.controller.ts — Add after the `getWatchLater` method (after line 107):
```ts
  @Post('me/watch-later/:videoId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add video to watch later' })
  addWatchLater(
    @Param('videoId') videoId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.usersService.addWatchLater(userId, videoId);
  }

  @Delete('me/watch-later/:videoId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove video from watch later' })
  removeWatchLater(
    @Param('videoId') videoId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.usersService.removeWatchLater(userId, videoId);
  }
```

### users.service.ts — Add after the `getWatchLater` method (after line 390):
```ts
  async addWatchLater(userId: string, videoId: string) {
    await this.prisma.watchLater.upsert({
      where: { userId_videoId: { userId, videoId } },
      create: { userId, videoId },
      update: {},
    });
    return { added: true };
  }

  async removeWatchLater(userId: string, videoId: string) {
    await this.prisma.watchLater.deleteMany({
      where: { userId, videoId },
    });
    return { removed: true };
  }
```

**IMPORTANT:** The `Post` and `Delete` decorators should already be imported in users.controller.ts. Verify the import line includes them.

**Verification:** Both methods compile. Mobile `usersApi.addWatchLater` / `removeWatchLater` calls will now work.

---

## Step 4 — Create `playlist/[id].tsx` Detail Screen
**Agent 4** | File: `apps/mobile/app/(screens)/playlist/[id].tsx` (NEW)

This screen shows a single playlist's details and its video items. Reference the existing `playlists/[channelId].tsx` screen for patterns.

```tsx
import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, RefreshControl, Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, fontSize, radius } from '@/theme';
import { playlistsApi } from '@/services/api';

const formatDuration = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function PlaylistDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const playlistId = Array.isArray(params.id) ? params.id[0] : params.id;

  const playlistQuery = useQuery({
    queryKey: ['playlist', playlistId],
    queryFn: () => playlistsApi.getById(playlistId!),
    enabled: !!playlistId,
  });

  const itemsQuery = useInfiniteQuery({
    queryKey: ['playlist-items', playlistId],
    queryFn: ({ pageParam }) => playlistsApi.getItems(playlistId!, pageParam),
    getNextPageParam: (lastPage: any) => lastPage?.meta?.cursor ?? undefined,
    enabled: !!playlistId,
  });

  const items = itemsQuery.data?.pages?.flatMap((p: any) => p.data ?? p) ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([playlistQuery.refetch(), itemsQuery.refetch()]);
    setRefreshing(false);
  }, [playlistQuery, itemsQuery]);

  const playlist = playlistQuery.data;

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.videoRow}
      activeOpacity={0.7}
      onPress={() => router.push(`/(screens)/video/${item.video?.id ?? item.id}`)}
    >
      <View style={styles.thumbWrap}>
        <Image
          source={{ uri: item.video?.thumbnailUrl ?? item.thumbnailUrl }}
          style={styles.thumb}
          contentFit="cover"
        />
        {(item.video?.duration ?? item.duration) > 0 && (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>
              {formatDuration(item.video?.duration ?? item.duration)}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.videoInfo}>
        <Text style={styles.videoTitle} numberOfLines={2}>
          {item.video?.title ?? item.title}
        </Text>
        <Text style={styles.channelName} numberOfLines={1}>
          {item.video?.channel?.name ?? ''}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const ListHeader = () => (
    <View style={styles.playlistHeader}>
      {playlist?.thumbnailUrl && (
        <Image source={{ uri: playlist.thumbnailUrl }} style={styles.playlistThumb} contentFit="cover" />
      )}
      <Text style={styles.playlistTitle}>{playlist?.title ?? ''}</Text>
      {playlist?.description ? (
        <Text style={styles.playlistDesc}>{playlist.description}</Text>
      ) : null}
      <Text style={styles.videoCount}>
        {playlist?.videosCount ?? items.length} video{(playlist?.videosCount ?? items.length) !== 1 ? 's' : ''}
      </Text>
    </View>
  );

  if (!playlistId) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <EmptyState icon="layers" title="Playlist not found" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Icon name="arrow-left" size="md" color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {playlist?.title ?? 'Playlist'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {playlistQuery.isLoading ? (
        <View style={styles.skeletonWrap}>
          <Skeleton.Rect width="100%" height={200} borderRadius={radius.md} />
          <Skeleton.Text width="60%" />
          <Skeleton.Text width="40%" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, i) => item.id ?? String(i)}
          renderItem={renderItem}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            itemsQuery.isLoading ? (
              <View style={styles.skeletonWrap}>
                {[1, 2, 3].map((i) => (
                  <Skeleton.Rect key={i} width="100%" height={80} borderRadius={radius.sm} />
                ))}
              </View>
            ) : (
              <EmptyState icon="video" title="No videos yet" subtitle="Videos added to this playlist will appear here" />
            )
          }
          onEndReached={() => {
            if (itemsQuery.hasNextPage) itemsQuery.fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
          }
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md, gap: spacing.md,
  },
  headerTitle: { flex: 1, color: colors.text.primary, fontSize: fontSize.md, fontWeight: '600', textAlign: 'center' },
  list: { paddingBottom: spacing.xl },
  playlistHeader: { padding: spacing.base, gap: spacing.sm },
  playlistThumb: { width: '100%', height: 200, borderRadius: radius.md },
  playlistTitle: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '700' },
  playlistDesc: { color: colors.text.secondary, fontSize: fontSize.sm },
  videoCount: { color: colors.text.tertiary, fontSize: fontSize.xs },
  videoRow: { flexDirection: 'row', padding: spacing.base, gap: spacing.md },
  thumbWrap: { width: 160, height: 90, borderRadius: radius.sm, overflow: 'hidden' },
  thumb: { width: '100%', height: '100%' },
  durationBadge: {
    position: 'absolute', bottom: 4, right: 4,
    backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 4, paddingVertical: 2, borderRadius: radius.sm,
  },
  durationText: { color: '#fff', fontSize: fontSize.xs },
  videoInfo: { flex: 1, justifyContent: 'center', gap: 4 },
  videoTitle: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '500' },
  channelName: { color: colors.text.secondary, fontSize: fontSize.xs },
  skeletonWrap: { padding: spacing.base, gap: spacing.md },
});
```

**Verification:** Screen renders playlist header + video list. Navigates to video on tap. Has RefreshControl, Skeleton loading, EmptyState.

---

## Step 5 — Delete Stray `(screens/)` Directory
**Agent 5** | Task: Remove the typo directory

There is a stray directory at `apps/mobile/app/(screens/)` (note the closing parenthesis is INSIDE the directory name — it's literally named `(screens/)` not `(screens)`). It contains a duplicate `reel/[id].tsx`. This must be deleted.

Run this command:
```bash
rm -rf "apps/mobile/app/(screens/)/"
```

Then verify:
```bash
ls "apps/mobile/app/" | grep screens
```
Should show only `(screens)` — NOT `(screens/)`.

**ALSO** — Read `apps/mobile/app/(screens)/save-to-playlist.tsx` and verify it uses `playlistsApi` methods correctly. If it looks correct, no changes needed. Just verify.

**Verification:** Stray directory is gone. Only `(screens)` exists.

---

## Step 6 — Users Service Spec: Watch-Later Tests
**Agent 6** | File: `apps/api/src/modules/users/users.service.spec.ts` (EDIT)

Read the file first. Add a new `describe('watch-later')` block with these tests:

```ts
describe('addWatchLater', () => {
  it('should add a video to watch later', async () => {
    mockPrisma.watchLater.upsert.mockResolvedValue({ userId: 'u1', videoId: 'v1' });
    const result = await service.addWatchLater('u1', 'v1');
    expect(result).toEqual({ added: true });
    expect(mockPrisma.watchLater.upsert).toHaveBeenCalledWith({
      where: { userId_videoId: { userId: 'u1', videoId: 'v1' } },
      create: { userId: 'u1', videoId: 'v1' },
      update: {},
    });
  });
});

describe('removeWatchLater', () => {
  it('should remove a video from watch later', async () => {
    mockPrisma.watchLater.deleteMany.mockResolvedValue({ count: 1 });
    const result = await service.removeWatchLater('u1', 'v1');
    expect(result).toEqual({ removed: true });
    expect(mockPrisma.watchLater.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', videoId: 'v1' },
    });
  });
});
```

Follow the existing mock pattern in the file. If `mockPrisma.watchLater` doesn't exist in the mock setup, add it:
```ts
watchLater: { upsert: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn() },
```

**Verification:** Tests pass with `npm test -- --testPathPattern=users.service`.

---

## Step 7 — Playlists Controller Spec
**Agent 7** | File: `apps/api/src/modules/playlists/playlists.controller.spec.ts` (NEW)

Create a basic controller unit test that verifies all 8 endpoints delegate to the service correctly.

```ts
import { Test } from '@nestjs/testing';
import { PlaylistsController } from './playlists.controller';
import { PlaylistsService } from './playlists.service';

describe('PlaylistsController', () => {
  let controller: PlaylistsController;
  let service: PlaylistsService;

  const mockService = {
    create: jest.fn(),
    getById: jest.fn(),
    getByChannel: jest.fn(),
    getItems: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    addItem: jest.fn(),
    removeItem: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [PlaylistsController],
      providers: [{ provide: PlaylistsService, useValue: mockService }],
    }).compile();

    controller = module.get(PlaylistsController);
    service = module.get(PlaylistsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call service.create', async () => {
      const dto = { channelId: 'ch1', title: 'Test' } as any;
      mockService.create.mockResolvedValue({ id: 'p1' });
      const result = await controller.create('u1', dto);
      expect(mockService.create).toHaveBeenCalledWith('u1', dto);
      expect(result).toEqual({ id: 'p1' });
    });
  });

  describe('getByChannel', () => {
    it('should call service.getByChannel', async () => {
      mockService.getByChannel.mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } });
      await controller.getByChannel('ch1', undefined);
      expect(mockService.getByChannel).toHaveBeenCalledWith('ch1', undefined);
    });
  });

  describe('getById', () => {
    it('should call service.getById', async () => {
      mockService.getById.mockResolvedValue({ id: 'p1', title: 'Test' });
      const result = await controller.getById('p1');
      expect(mockService.getById).toHaveBeenCalledWith('p1');
      expect(result.title).toBe('Test');
    });
  });

  describe('getItems', () => {
    it('should call service.getItems', async () => {
      mockService.getItems.mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } });
      await controller.getItems('p1');
      expect(mockService.getItems).toHaveBeenCalledWith('p1', undefined);
    });
  });

  describe('update', () => {
    it('should call service.update', async () => {
      const dto = { title: 'Updated' } as any;
      mockService.update.mockResolvedValue({ id: 'p1', title: 'Updated' });
      await controller.update('p1', 'u1', dto);
      expect(mockService.update).toHaveBeenCalledWith('p1', 'u1', dto);
    });
  });

  describe('delete', () => {
    it('should call service.delete', async () => {
      mockService.delete.mockResolvedValue({ deleted: true });
      await controller.delete('p1', 'u1');
      expect(mockService.delete).toHaveBeenCalledWith('p1', 'u1');
    });
  });

  describe('addItem', () => {
    it('should call service.addItem', async () => {
      mockService.addItem.mockResolvedValue({ added: true });
      await controller.addItem('p1', 'v1', 'u1');
      expect(mockService.addItem).toHaveBeenCalledWith('p1', 'v1', 'u1');
    });
  });

  describe('removeItem', () => {
    it('should call service.removeItem', async () => {
      mockService.removeItem.mockResolvedValue({ removed: true });
      await controller.removeItem('p1', 'v1', 'u1');
      expect(mockService.removeItem).toHaveBeenCalledWith('p1', 'v1', 'u1');
    });
  });
});
```

**Verification:** All 8+ tests pass.

---

## Step 8 — Update CLAUDE.md + MEMORY.md
**Agent 8** | Files:
- `CLAUDE.md` (EDIT)
- `C:\Users\shakh\.claude\projects\C--Users-shakh\memory\MEMORY.md` (EDIT)

### CLAUDE.md changes:
1. Update status line (line 19) — change "151 API endpoints" to "163 API endpoints" (added: 8 playlists + 2 watch-later add/remove + 1 updateProgress + 1 getWatchLater = 12 new)
2. Update module count: "20 modules" to "21 modules" (added PlaylistsModule)

### MEMORY.md changes:
Add after the batch 6 entry in audit history:
```
- **Batches 7-13 (2026-03-07->08):** Feature expansion. Bakra V1.1, Minbar V1.2+V1.3, playlists, watch history, watch later, video progress, Continue Watching. 200+ tests.
- **Batch 14 (2026-03-08):** Critical wiring fixes. Playlists controller+module created and registered. Watch-later add/remove endpoints. Playlist detail screen. Stray directory cleanup.
```

Update "Current State" section:
```
## Current State (post-Batch 14)
- Backend compiles with 0 errors
- 21 backend modules (added PlaylistsModule)
- 163+ API endpoints
- 45+ screens
```

**Verification:** Docs reflect reality.

---

## File-to-Agent Conflict Map

| File | Agent |
|------|-------|
| `apps/api/src/modules/playlists/playlists.controller.ts` (NEW) | 1 |
| `apps/api/src/modules/playlists/playlists.module.ts` (NEW) | 2 |
| `apps/api/src/app.module.ts` | 2 |
| `apps/api/src/modules/users/users.controller.ts` | 3 |
| `apps/api/src/modules/users/users.service.ts` | 3 |
| `apps/mobile/app/(screens)/playlist/[id].tsx` (NEW) | 4 |
| `apps/mobile/app/(screens/)/*` (DELETE stray dir) | 5 |
| `apps/mobile/app/(screens)/save-to-playlist.tsx` (READ-ONLY verify) | 5 |
| `apps/api/src/modules/users/users.service.spec.ts` | 6 |
| `apps/api/src/modules/playlists/playlists.controller.spec.ts` (NEW) | 7 |
| `CLAUDE.md` | 8 |
| `MEMORY.md` | 8 |

**Zero conflicts.** Every file touched by exactly one agent.

---

## Verification Checklist (run after all agents complete)
1. `cd apps/api && npx tsc --noEmit` — 0 errors
2. `cd apps/api && npm test` — all tests pass
3. `ls apps/api/src/modules/playlists/` — should have: service, controller, module, spec files, dto/
4. `grep PlaylistsModule apps/api/src/app.module.ts` — should match
5. `ls "apps/mobile/app/"` — no `(screens/)` stray directory
6. `ls apps/mobile/app/(screens)/playlist/` — `[id].tsx` exists
