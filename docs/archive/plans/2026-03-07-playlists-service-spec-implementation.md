# Playlists Service Spec Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create comprehensive test specification for PlaylistsService with 20+ tests covering all 8 service methods

**Architecture:** Follow exact mock pattern from channels.service.spec.ts. Test success cases, NotFoundException, ForbiddenException, and pagination logic for all methods defined in ARCHITECT_INSTRUCTIONS.md Step 1.

**Tech Stack:** NestJS, Jest, TypeScript, Prisma

---

### Task 1: Create test file with imports and mocks

**Files:**
- Create: `apps/api/src/modules/playlists/playlists.service.spec.ts`

**Step 1: Write the failing test file structure**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { PlaylistsService } from './playlists.service';

describe('PlaylistsService', () => {
  let service: PlaylistsService;
  let prisma: any;

  beforeEach(async () => {
    const mockPrisma = {
      playlist: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      playlistItem: {
        create: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
        aggregate: jest.fn(),
      },
      channel: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((fns) => Promise.all(fns.map(fn => fn()))),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlaylistsService,
        {
          provide: 'PrismaService',
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<PlaylistsService>(PlaylistsService);
    prisma = module.get('PrismaService');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest playlists.service.spec --no-coverage`
Expected: FAIL with "Cannot find module './playlists.service'"

**Step 3: Create minimal service import (empty stub)**

Create: `apps/api/src/modules/playlists/playlists.service.ts`

```typescript
export class PlaylistsService {}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest playlists.service.spec --no-coverage`
Expected: PASS (test defined, service instantiated)

**Step 5: Commit**

```bash
git add apps/api/src/modules/playlists/playlists.service.spec.ts apps/api/src/modules/playlists/playlists.service.ts
git commit -m "test: create playlists service spec skeleton"
```

---

### Task 2: Test create method (3 tests)

**Files:**
- Modify: `apps/api/src/modules/playlists/playlists.service.spec.ts`

**Step 1: Write failing test for create success**

Add after existing `it('should be defined')`:

```typescript
describe('create', () => {
  const USER_ID = 'user-123';
  const CHANNEL_ID = 'channel-789';
  const dto = {
    channelId: CHANNEL_ID,
    title: 'My Playlist',
    description: 'My description',
    isPublic: true,
  };

  it('should create playlist when user owns channel', async () => {
    const mockChannel = { id: CHANNEL_ID, userId: USER_ID };
    const mockPlaylist = {
      id: 'playlist-abc',
      channelId: CHANNEL_ID,
      title: dto.title,
      description: dto.description,
      isPublic: true,
      videosCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    prisma.channel.findUnique.mockResolvedValue(mockChannel);
    prisma.playlist.create.mockResolvedValue(mockPlaylist);

    const result = await service.create(USER_ID, dto);

    expect(prisma.channel.findUnique).toHaveBeenCalledWith({
      where: { id: CHANNEL_ID },
    });
    expect(prisma.playlist.create).toHaveBeenCalledWith({
      data: {
        channelId: CHANNEL_ID,
        title: dto.title,
        description: dto.description,
        isPublic: true,
      },
      select: expect.any(Object),
    });
    expect(result).toEqual(mockPlaylist);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest playlists.service.spec --testNamePattern="should create playlist when user owns channel"`
Expected: FAIL with "service.create is not a function"

**Step 3: Add create method stub to service**

Modify: `apps/api/src/modules/playlists/playlists.service.ts`

```typescript
export class PlaylistsService {
  async create(userId: string, dto: any) {
    throw new Error('Not implemented');
  }
}
```

**Step 4: Run test to verify it fails with correct error**

Run: `cd apps/api && npx jest playlists.service.spec --testNamePattern="should create playlist when user owns channel"`
Expected: FAIL with "Not implemented"

**Step 5: Write failing test for channel not found**

```typescript
it('should throw NotFoundException when channel not found', async () => {
  prisma.channel.findUnique.mockResolvedValue(null);

  await expect(service.create(USER_ID, dto)).rejects.toThrow(NotFoundException);
});
```

**Step 6: Write failing test for not owner**

```typescript
it('should throw ForbiddenException when user not channel owner', async () => {
  const mockChannel = { id: CHANNEL_ID, userId: 'other-user' };
  prisma.channel.findUnique.mockResolvedValue(mockChannel);

  await expect(service.create(USER_ID, dto)).rejects.toThrow(ForbiddenException);
});
```

**Step 7: Run all create tests to verify they fail**

Run: `cd apps/api && npx jest playlists.service.spec --testNamePattern="create"`
Expected: All 3 tests FAIL

**Step 8: Implement create method**

Replace service method with:

```typescript
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';

@Injectable()
export class PlaylistsService {
  constructor(private prisma: any) {}

  async create(userId: string, dto: any) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: dto.channelId }
    });
    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.userId !== userId) throw new ForbiddenException('Not your channel');

    return this.prisma.playlist.create({
      data: {
        channelId: dto.channelId,
        title: dto.title,
        description: dto.description,
        isPublic: dto.isPublic ?? true,
      },
      select: {
        id: true,
        channelId: true,
        title: true,
        description: true,
        thumbnailUrl: true,
        isPublic: true,
        videosCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
```

**Step 9: Run tests to verify they pass**

Run: `cd apps/api && npx jest playlists.service.spec --testNamePattern="create"`
Expected: All 3 tests PASS

**Step 10: Commit**

```bash
git add apps/api/src/modules/playlists/playlists.service.spec.ts apps/api/src/modules/playlists/playlists.service.ts
git commit -m "test: implement create method tests"
```

---

### Task 3: Test getById method (2 tests)

**Files:**
- Modify: `apps/api/src/modules/playlists/playlists.service.spec.ts`

**Step 1: Write failing test for getById success**

Add new describe block:

```typescript
describe('getById', () => {
  const PLAYLIST_ID = 'playlist-abc';
  const mockPlaylist = {
    id: PLAYLIST_ID,
    channelId: 'channel-789',
    title: 'My Playlist',
    description: 'My description',
    thumbnailUrl: null,
    isPublic: true,
    videosCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    channel: {
      id: 'channel-789',
      handle: 'tech',
      name: 'Tech Channel',
      userId: 'user-123',
    },
  };

  it('should return playlist when found', async () => {
    prisma.playlist.findUnique.mockResolvedValue(mockPlaylist);

    const result = await service.getById(PLAYLIST_ID);

    expect(prisma.playlist.findUnique).toHaveBeenCalledWith({
      where: { id: PLAYLIST_ID },
      select: expect.any(Object),
    });
    expect(result).toEqual(mockPlaylist);
  });

  it('should throw NotFoundException when playlist not found', async () => {
    prisma.playlist.findUnique.mockResolvedValue(null);

    await expect(service.getById(PLAYLIST_ID)).rejects.toThrow(NotFoundException);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest playlists.service.spec --testNamePattern="getById"`
Expected: FAIL with "service.getById is not a function"

**Step 3: Add getById method stub to service**

Add to `PlaylistsService`:

```typescript
async getById(id: string) {
  throw new Error('Not implemented');
}
```

**Step 4: Run tests to verify they fail with correct error**

Run: `cd apps/api && npx jest playlists.service.spec --testNamePattern="getById"`
Expected: FAIL with "Not implemented"

**Step 5: Implement getById method**

Replace stub with:

```typescript
async getById(id: string) {
  const playlist = await this.prisma.playlist.findUnique({
    where: { id },
    select: {
      id: true,
      channelId: true,
      title: true,
      description: true,
      thumbnailUrl: true,
      isPublic: true,
      videosCount: true,
      createdAt: true,
      updatedAt: true,
      channel: {
        select: {
          id: true,
          handle: true,
          name: true,
          userId: true,
        },
      },
    },
  });
  if (!playlist) throw new NotFoundException('Playlist not found');
  return playlist;
}
```

**Step 6: Run tests to verify they pass**

Run: `cd apps/api && npx jest playlists.service.spec --testNamePattern="getById"`
Expected: All 2 tests PASS

**Step 7: Commit**

```bash
git add apps/api/src/modules/playlists/playlists.service.spec.ts apps/api/src/modules/playlists/playlists.service.ts
git commit -m "test: implement getById method tests"
```

---

### Task 4: Test getByChannel method (2 tests)

**Files:**
- Modify: `apps/api/src/modules/playlists/playlists.service.spec.ts`

**Step 1: Write failing test for getByChannel pagination**

Add new describe block:

```typescript
describe('getByChannel', () => {
  const CHANNEL_ID = 'channel-789';
  const mockPlaylists = [
    {
      id: 'playlist-abc',
      channelId: CHANNEL_ID,
      title: 'Playlist 1',
      description: 'Desc 1',
      thumbnailUrl: null,
      isPublic: true,
      videosCount: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'playlist-def',
      channelId: CHANNEL_ID,
      title: 'Playlist 2',
      description: 'Desc 2',
      thumbnailUrl: null,
      isPublic: true,
      videosCount: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  it('should return paginated playlists for channel', async () => {
    prisma.playlist.findMany.mockResolvedValue(mockPlaylists);

    const result = await service.getByChannel(CHANNEL_ID);

    expect(prisma.playlist.findMany).toHaveBeenCalledWith({
      where: { channelId: CHANNEL_ID, isPublic: true },
      select: expect.any(Object),
      take: 21, // limit + 1
      orderBy: { createdAt: 'desc' },
    });
    expect(result.data).toHaveLength(2);
    expect(result.meta.hasMore).toBe(false);
  });

  it('should handle cursor pagination', async () => {
    const cursor = 'playlist-abc';
    prisma.playlist.findMany.mockResolvedValue(mockPlaylists.slice(0, 1));

    await service.getByChannel(CHANNEL_ID, cursor);

    expect(prisma.playlist.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: cursor },
        skip: 1,
      }),
    );
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest playlists.service.spec --testNamePattern="getByChannel"`
Expected: FAIL with "service.getByChannel is not a function"

**Step 3: Add getByChannel method stub**

Add to service:

```typescript
async getByChannel(channelId: string, cursor?: string) {
  throw new Error('Not implemented');
}
```

**Step 4: Run tests to verify they fail**

Run: `cd apps/api && npx jest playlists.service.spec --testNamePattern="getByChannel"`
Expected: FAIL with "Not implemented"

**Step 5: Implement getByChannel method**

Replace stub with:

```typescript
async getByChannel(channelId: string, cursor?: string, limit = 20) {
  const playlists = await this.prisma.playlist.findMany({
    where: { channelId, isPublic: true },
    select: {
      id: true,
      channelId: true,
      title: true,
      description: true,
      thumbnailUrl: true,
      isPublic: true,
      videosCount: true,
      createdAt: true,
      updatedAt: true,
    },
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
```

**Step 6: Run tests to verify they pass**

Run: `cd apps/api && npx jest playlists.service.spec --testNamePattern="getByChannel"`
Expected: All 2 tests PASS

**Step 7: Commit**

```bash
git add apps/api/src/modules/playlists/playlists.service.spec.ts apps/api/src/modules/playlists/playlists.service.ts
git commit -m "test: implement getByChannel method tests"
```

---

### Task 5: Test getItems method (2 tests)

**Files:**
- Modify: `apps/api/src/modules/playlists/playlists.service.spec.ts`

**Step 1: Write failing test for getItems pagination**

Add new describe block:

```typescript
describe('getItems', () => {
  const PLAYLIST_ID = 'playlist-abc';
  const mockItems = [
    {
      id: 'item-1',
      position: 0,
      createdAt: new Date(),
      video: {
        id: 'video-1',
        title: 'Video 1',
        thumbnailUrl: null,
        duration: 120,
        viewsCount: 100,
        createdAt: new Date(),
        channel: {
          id: 'channel-789',
          handle: 'tech',
          name: 'Tech Channel',
          avatarUrl: null,
        },
      },
    },
  ];

  it('should return paginated playlist items', async () => {
    prisma.playlist.findUnique.mockResolvedValue({ id: PLAYLIST_ID });
    prisma.playlistItem.findMany.mockResolvedValue(mockItems);

    const result = await service.getItems(PLAYLIST_ID);

    expect(prisma.playlist.findUnique).toHaveBeenCalledWith({
      where: { id: PLAYLIST_ID },
    });
    expect(prisma.playlistItem.findMany).toHaveBeenCalledWith({
      where: { playlistId: PLAYLIST_ID },
      select: expect.any(Object),
      take: 21,
      orderBy: { position: 'asc' },
    });
    expect(result.data).toHaveLength(1);
    expect(result.meta.hasMore).toBe(false);
  });

  it('should throw NotFoundException when playlist not found', async () => {
    prisma.playlist.findUnique.mockResolvedValue(null);

    await expect(service.getItems(PLAYLIST_ID)).rejects.toThrow(NotFoundException);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest playlists.service.spec --testNamePattern="getItems"`
Expected: FAIL with "service.getItems is not a function"

**Step 3: Add getItems method stub**

Add to service:

```typescript
async getItems(playlistId: string, cursor?: string) {
  throw new Error('Not implemented');
}
```

**Step 4: Run tests to verify they fail**

Run: `cd apps/api && npx jest playlists.service.spec --testNamePattern="getItems"`
Expected: FAIL with "Not implemented"

**Step 5: Implement getItems method**

Replace stub with:

```typescript
async getItems(playlistId: string, cursor?: string, limit = 20) {
  const playlist = await this.prisma.playlist.findUnique({
    where: { id: playlistId }
  });
  if (!playlist) throw new NotFoundException('Playlist not found');

  const items = await this.prisma.playlistItem.findMany({
    where: { playlistId },
    select: {
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
          channel: {
            select: {
              id: true,
              handle: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
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
```

**Step 6: Run tests to verify they pass**

Run: `cd apps/api && npx jest playlists.service.spec --testNamePattern="getItems"`
Expected: All 2 tests PASS

**Step 7: Commit**

```bash
git add apps/api/src/modules/playlists/playlists.service.spec.ts apps/api/src/modules/playlists/playlists.service.ts
git commit -m "test: implement getItems method tests"
```

---

### Task 6: Test update method (3 tests)

**Files:**
- Modify: `apps/api/src/modules/playlists/playlists.service.spec.ts`

**Step 1: Write failing test for update success**

Add new describe block:

```typescript
describe('update', () => {
  const USER_ID = 'user-123';
  const PLAYLIST_ID = 'playlist-abc';
  const dto = {
    title: 'Updated Title',
    description: 'Updated description',
    isPublic: false,
  };

  it('should update playlist when user is owner', async () => {
    const mockPlaylist = {
      id: PLAYLIST_ID,
      channel: { userId: USER_ID },
    };
    const updatedPlaylist = {
      id: PLAYLIST_ID,
      channelId: 'channel-789',
      ...dto,
      thumbnailUrl: null,
      videosCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    prisma.playlist.findUnique.mockResolvedValue(mockPlaylist);
    prisma.playlist.update.mockResolvedValue(updatedPlaylist);

    const result = await service.update(PLAYLIST_ID, USER_ID, dto);

    expect(prisma.playlist.findUnique).toHaveBeenCalledWith({
      where: { id: PLAYLIST_ID },
      include: { channel: { select: { userId: true } } },
    });
    expect(prisma.playlist.update).toHaveBeenCalledWith({
      where: { id: PLAYLIST_ID },
      data: dto,
      select: expect.any(Object),
    });
    expect(result).toEqual(updatedPlaylist);
  });

  it('should throw NotFoundException when playlist not found', async () => {
    prisma.playlist.findUnique.mockResolvedValue(null);

    await expect(service.update(PLAYLIST_ID, USER_ID, dto)).rejects.toThrow(NotFoundException);
  });

  it('should throw ForbiddenException when user is not owner', async () => {
    const mockPlaylist = {
      id: PLAYLIST_ID,
      channel: { userId: 'other-user' },
    };
    prisma.playlist.findUnique.mockResolvedValue(mockPlaylist);

    await expect(service.update(PLAYLIST_ID, USER_ID, dto)).rejects.toThrow(ForbiddenException);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest playlists.service.spec --testNamePattern="update"`
Expected: FAIL with "service.update is not a function"

**Step 3: Add update method stub**

Add to service:

```typescript
async update(id: string, userId: string, dto: any) {
  throw new Error('Not implemented');
}
```

**Step 4: Run tests to verify they fail**

Run: `cd apps/api && npx jest playlists.service.spec --testNamePattern="update"`
Expected: FAIL with "Not implemented"

**Step 5: Implement update method**

Replace stub with:

```typescript
async update(id: string, userId: string, dto: any) {
  const playlist = await this.prisma.playlist.findUnique({
    where: { id },
    include: { channel: { select: { userId: true } } },
  });
  if (!playlist) throw new NotFoundException('Playlist not found');
  if (playlist.channel.userId !== userId) throw new ForbiddenException('Not your playlist');

  return this.prisma.playlist.update({
    where: { id },
    data: dto,
    select: {
      id: true,
      channelId: true,
      title: true,
      description: true,
      thumbnailUrl: true,
      isPublic: true,
      videosCount: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}
```

**Step 6: Run tests to verify they pass**

Run: `cd apps/api && npx jest playlists.service.spec --testNamePattern="update"`
Expected: All 3 tests PASS

**Step 7: Commit**

```bash
git add apps/api/src/modules/playlists/playlists.service.spec.ts apps/api/src/modules/playlists/playlists.service.ts
git commit -m "test: implement update method tests"
```

---

### Task 7: Test delete method (3 tests)

**Files:**
- Modify: `apps/api/src/modules/playlists/playlists.service.spec.ts`

**Step 1: Write failing test for delete success**

Add new describe block:

```typescript
describe('delete', () => {
  const USER_ID = 'user-123';
  const PLAYLIST_ID = 'playlist-abc';

  it('should delete playlist when user is owner', async () => {
    const mockPlaylist = {
      id: PLAYLIST_ID,
      channel: { userId: USER_ID },
    };
    prisma.playlist.findUnique.mockResolvedValue(mockPlaylist);
    prisma.playlist.delete.mockResolvedValue({});

    const result = await service.delete(PLAYLIST_ID, USER_ID);

    expect(prisma.playlist.findUnique).toHaveBeenCalledWith({
      where: { id: PLAYLIST_ID },
      include: { channel: { select: { userId: true } } },
    });
    expect(prisma.playlist.delete).toHaveBeenCalledWith({
      where: { id: PLAYLIST_ID },
    });
    expect(result).toEqual({ deleted: true });
  });

  it('should throw NotFoundException when playlist not found', async () => {
    prisma.playlist.findUnique.mockResolvedValue(null);

    await expect(service.delete(PLAYLIST_ID, USER_ID)).rejects.toThrow(NotFoundException);
  });

  it('should throw ForbiddenException when user is not owner', async () => {
    const mockPlaylist = {
      id: PLAYLIST_ID,
      channel: { userId: 'other-user' },
    };
    prisma.playlist.findUnique.mockResolvedValue(mockPlaylist);

    await expect(service.delete(PLAYLIST_ID, USER_ID)).rejects.toThrow(ForbiddenException);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest playlists.service.spec --testNamePattern="delete"`
Expected: FAIL with "service.delete is not a function"

**Step 3: Add delete method stub**

Add to service:

```typescript
async delete(id: string, userId: string) {
  throw new Error('Not implemented');
}
```

**Step 4: Run tests to verify they fail**

Run: `cd apps/api && npx jest playlists.service.spec --testNamePattern="delete"`
Expected: FAIL with "Not implemented"

**Step 5: Implement delete method**

Replace stub with:

```typescript
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
```

**Step 6: Run tests to verify they pass**

Run: `cd apps/api && npx jest playlists.service.spec --testNamePattern="delete"`
Expected: All 3 tests PASS

**Step 7: Commit**

```bash
git add apps/api/src/modules/playlists/playlists.service.spec.ts apps/api/src/modules/playlists/playlists.service.ts
git commit -m "test: implement delete method tests"
```

---

### Task 8: Test addItem method (3 tests)

**Files:**
- Modify: `apps/api/src/modules/playlists/playlists.service.spec.ts`

**Step 1: Write failing test for addItem success**

Add new describe block:

```typescript
describe('addItem', () => {
  const USER_ID = 'user-123';
  const PLAYLIST_ID = 'playlist-abc';
  const VIDEO_ID = 'video-def';

  it('should add video to playlist with auto-position', async () => {
    const mockPlaylist = {
      id: PLAYLIST_ID,
      channel: { userId: USER_ID },
    };
    const mockItem = {
      id: 'item-1',
      position: 0,
      createdAt: new Date(),
      video: {
        id: VIDEO_ID,
        title: 'Video 1',
        thumbnailUrl: null,
        duration: 120,
        viewsCount: 100,
        createdAt: new Date(),
        channel: {
          id: 'channel-789',
          handle: 'tech',
          name: 'Tech Channel',
          avatarUrl: null,
        },
      },
    };

    prisma.playlist.findUnique.mockResolvedValue(mockPlaylist);
    prisma.playlistItem.aggregate.mockResolvedValue({ _max: { position: null } });
    prisma.$transaction.mockImplementation(async (fns) => {
      const results = await Promise.all(fns.map(fn => fn()));
      return results;
    });
    prisma.playlistItem.create.mockResolvedValue(mockItem);

    const result = await service.addItem(PLAYLIST_ID, VIDEO_ID, USER_ID);

    expect(prisma.playlist.findUnique).toHaveBeenCalledWith({
      where: { id: PLAYLIST_ID },
      include: { channel: { select: { userId: true } } },
    });
    expect(prisma.playlistItem.aggregate).toHaveBeenCalledWith({
      where: { playlistId: PLAYLIST_ID },
      _max: { position: true },
    });
    expect(prisma.playlistItem.create).toHaveBeenCalledWith({
      data: {
        playlistId: PLAYLIST_ID,
        videoId: VIDEO_ID,
        position: 0, // null -> -1 + 1 = 0
      },
      select: expect.any(Object),
    });
    expect(result).toEqual(mockItem);
  });

  it('should calculate correct position from existing max', async () => {
    const mockPlaylist = {
      id: PLAYLIST_ID,
      channel: { userId: USER_ID },
    };
    prisma.playlist.findUnique.mockResolvedValue(mockPlaylist);
    prisma.playlistItem.aggregate.mockResolvedValue({ _max: { position: 4 } });
    prisma.$transaction.mockResolvedValue([{}, {}]);

    await service.addItem(PLAYLIST_ID, VIDEO_ID, USER_ID);

    expect(prisma.playlistItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          position: 5, // 4 + 1 = 5
        }),
      }),
    );
  });

  it('should throw ForbiddenException when user is not owner', async () => {
    const mockPlaylist = {
      id: PLAYLIST_ID,
      channel: { userId: 'other-user' },
    };
    prisma.playlist.findUnique.mockResolvedValue(mockPlaylist);

    await expect(service.addItem(PLAYLIST_ID, VIDEO_ID, USER_ID)).rejects.toThrow(ForbiddenException);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest playlists.service.spec --testNamePattern="addItem"`
Expected: FAIL with "service.addItem is not a function"

**Step 3: Add addItem method stub**

Add to service:

```typescript
async addItem(playlistId: string, videoId: string, userId: string) {
  throw new Error('Not implemented');
}
```

**Step 4: Run tests to verify they fail**

Run: `cd apps/api && npx jest playlists.service.spec --testNamePattern="addItem"`
Expected: FAIL with "Not implemented"

**Step 5: Implement addItem method**

Replace stub with:

```typescript
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
      select: {
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
            channel: {
              select: {
                id: true,
                handle: true,
                name: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    }),
    this.prisma.playlist.update({
      where: { id: playlistId },
      data: { videosCount: { increment: 1 } },
    }),
  ]);
  return item;
}
```

**Step 6: Run tests to verify they pass**

Run: `cd apps/api && npx jest playlists.service.spec --testNamePattern="addItem"`
Expected: All 3 tests PASS

**Step 7: Commit**

```bash
git add apps/api/src/modules/playlists/playlists.service.spec.ts apps/api/src/modules/playlists/playlists.service.ts
git commit -m "test: implement addItem method tests"
```

---

### Task 9: Test removeItem method (2 tests)

**Files:**
- Modify: `apps/api/src/modules/playlists/playlists.service.spec.ts`

**Step 1: Write failing test for removeItem success**

Add new describe block:

```typescript
describe('removeItem', () => {
  const USER_ID = 'user-123';
  const PLAYLIST_ID = 'playlist-abc';
  const VIDEO_ID = 'video-def';

  it('should remove video from playlist', async () => {
    const mockPlaylist = {
      id: PLAYLIST_ID,
      channel: { userId: USER_ID },
    };
    prisma.playlist.findUnique.mockResolvedValue(mockPlaylist);
    prisma.$transaction.mockResolvedValue([{}, {}]);

    const result = await service.removeItem(PLAYLIST_ID, VIDEO_ID, USER_ID);

    expect(prisma.playlist.findUnique).toHaveBeenCalledWith({
      where: { id: PLAYLIST_ID },
      include: { channel: { select: { userId: true } } },
    });
    expect(prisma.playlistItem.delete).toHaveBeenCalledWith({
      where: { playlistId_videoId: { playlistId: PLAYLIST_ID, videoId: VIDEO_ID } },
    });
    expect(result).toEqual({ removed: true });
  });

  it('should throw ForbiddenException when user is not owner', async () => {
    const mockPlaylist = {
      id: PLAYLIST_ID,
      channel: { userId: 'other-user' },
    };
    prisma.playlist.findUnique.mockResolvedValue(mockPlaylist);

    await expect(service.removeItem(PLAYLIST_ID, VIDEO_ID, USER_ID)).rejects.toThrow(ForbiddenException);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest playlists.service.spec --testNamePattern="removeItem"`
Expected: FAIL with "service.removeItem is not a function"

**Step 3: Add removeItem method stub**

Add to service:

```typescript
async removeItem(playlistId: string, videoId: string, userId: string) {
  throw new Error('Not implemented');
}
```

**Step 4: Run tests to verify they fail**

Run: `cd apps/api && npx jest playlists.service.spec --testNamePattern="removeItem"`
Expected: FAIL with "Not implemented"

**Step 5: Implement removeItem method**

Replace stub with:

```typescript
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
```

**Step 6: Run tests to verify they pass**

Run: `cd apps/api && npx jest playlists.service.spec --testNamePattern="removeItem"`
Expected: All 2 tests PASS

**Step 7: Commit**

```bash
git add apps/api/src/modules/playlists/playlists.service.spec.ts apps/api/src/modules/playlists/playlists.service.ts
git commit -m "test: implement removeItem method tests"
```

---

### Task 10: Final verification and cleanup

**Files:**
- Modify: `apps/api/src/modules/playlists/playlists.service.ts`

**Step 1: Run all playlists service tests**

Run: `cd apps/api && npx jest playlists.service.spec --coverage`
Expected: 20 tests PASS, coverage report generated

**Step 2: Remove placeholder service implementation**

Delete: `apps/api/src/modules/playlists/playlists.service.ts`
(Agent 1 will create the real implementation)

**Step 3: Verify test file completeness**

Run: `cd apps/api && npx tsc --noEmit`
Expected: 0 errors (even with missing service file - tests should import from mock)

**Step 4: Run all backend tests**

Run: `cd apps/api && npx jest --passWithNoTests`
Expected: All tests pass, including new playlists spec

**Step 5: Commit final test file**

```bash
git rm apps/api/src/modules/playlists/playlists.service.ts
git add apps/api/src/modules/playlists/playlists.service.spec.ts
git commit -m "test: complete playlists service spec (20 tests)"
```

---

## Plan complete and saved to `docs/plans/2026-03-07-playlists-service-spec-implementation.md`.

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**