# BATCH 21: Platform-Level Feature Parity

**Date:** 2026-03-10
**Theme:** Wire ALL unused Prisma models (8 modules), enhance messages/stories/gateway, add 10 new mobile screens, enhance 4 existing screens, full integration.
**Agent Count:** 30
**Previous batches:** 1-20 → See commit history

---

## File → Agent Conflict Map (ZERO CONFLICTS VERIFIED)

| File(s) | Agent |
|---------|-------|
| `modules/broadcast/*` (new) | 1 |
| `modules/live/*` (new) | 2 |
| `modules/calls/*` (new) | 3 |
| `modules/stickers/*` (new) | 4 |
| `modules/collabs/*` (new) | 5 |
| `modules/channel-posts/*` (new) | 6 |
| `modules/audio-tracks/*` (new) | 7 |
| `modules/feed/*` (new) | 8 |
| `modules/posts/posts.service.ts`, `posts.module.ts` | 9 |
| `modules/threads/threads.service.ts`, `threads.module.ts` | 9 |
| `modules/reels/reels.service.ts`, `reels.module.ts` | 9 |
| `modules/messages/messages.service.ts`, `messages.controller.ts` | 10 |
| `modules/stories/stories.service.ts`, `stories.controller.ts` | 11 |
| `gateways/chat.gateway.ts`, `chat.gateway.spec.ts` | 12 |
| `mobile: screens/broadcast-channels.tsx`, `screens/broadcast/[id].tsx` (new) | 13 |
| `mobile: screens/go-live.tsx`, `screens/live/[id].tsx` (new) | 14 |
| `mobile: screens/call/[id].tsx` (new) | 15 |
| `mobile: components/risalah/StickerPicker.tsx` (new) | 16 |
| `mobile: screens/close-friends.tsx` (new) | 17 |
| `mobile: screens/pinned-messages.tsx`, `screens/starred-messages.tsx` (new) | 18 |
| `mobile: components/ui/ImageLightbox.tsx` (new) | 19 |
| `mobile: components/ui/VideoPlayer.tsx` (new) | 20 |
| `mobile: screens/collab-requests.tsx` (new) | 21 |
| `mobile: screens/community-posts.tsx` (new) | 22 |
| `mobile: screens/conversation/[id].tsx` | 23 |
| `mobile: screens/create-story.tsx` | 24 |
| `mobile: (tabs)/bakra.tsx` | 25 |
| `mobile: screens/profile/[username].tsx` | 26 |
| `mobile: services/api.ts`, `types/index.ts` | 27 |
| `mobile: store/index.ts`, `(screens)/_layout.tsx` | 28 |
| `api: app.module.ts` | 29 |
| `api: controller specs for agents 1-8` (new) | 30 |

---

## RULES FOR ALL AGENTS

1. Read `CLAUDE.md` before writing any code
2. **NEVER use RN `Modal`** — always `<BottomSheet>`
3. **NEVER hardcode border radius** — use `radius.*` from theme
4. **NEVER use `any` in new non-test code** — type everything
5. **NEVER use `as any`** — find the correct type
6. **ALL FlatLists must have `<RefreshControl>`**
7. Schema field names are FINAL — `userId` not `authorId`, `content` not `caption`
8. API responses wrap: `{ data, success, timestamp }`
9. Pagination: `?cursor=<id>` → `{ data: [], meta: { cursor, hasMore } }`
10. Backend guards: `ClerkAuthGuard` for protected, `OptionalClerkAuthGuard` for public
11. Backend DTOs: Use class-validator decorators, import from `class-validator`
12. Use `@ApiOperation`, `@ApiTags` on all controller methods
13. Mobile components: import from `@/components/ui/*`, `@/theme`, `@/services/api`
14. Test files (*.spec.ts) MAY use `as any` for mocks — this is the ONLY exception
15. Loading states → `<Skeleton.*>` variants, NEVER bare ActivityIndicator
16. Empty states → `<EmptyState icon title />`, NEVER bare text
17. Pull-to-refresh → `<RefreshControl tintColor={colors.emerald} />`
18. **The `$executeRaw` tagged template literals are SAFE** — do NOT replace them

---

## Agent 1: Broadcast Channels Module (Telegram-style)

**Goal:** Full NestJS module for Telegram-style broadcast channels using existing `BroadcastChannel`, `ChannelMember`, `BroadcastMessage` Prisma models.

**Schema reference:**
```
BroadcastChannel: id, name, slug, description, avatarUrl, channelType(BROADCAST|DISCUSSION), subscribersCount, postsCount
ChannelMember: [channelId,userId] PK, role(OWNER|ADMIN|MEMBER|SUBSCRIBER), isMuted, joinedAt
BroadcastMessage: id, channelId, senderId, content, messageType, mediaUrl, mediaType, viewsCount, reactionsCount, isPinned
```

**Files to CREATE:**

### 1. `apps/api/src/modules/broadcast/dto/create-channel.dto.ts`
```typescript
import { IsString, IsOptional, MaxLength, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBroadcastChannelDto {
  @ApiProperty({ example: 'Islamic Reminders' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'islamic-reminders' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, { message: 'Slug must be lowercase alphanumeric with hyphens' })
  slug: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  avatarUrl?: string;
}
```

### 2. `apps/api/src/modules/broadcast/dto/send-broadcast.dto.ts`
```typescript
import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendBroadcastDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(5000)
  content?: string;

  @ApiProperty({ enum: ['TEXT', 'IMAGE', 'VIDEO', 'VOICE', 'FILE'], default: 'TEXT' })
  @IsEnum(['TEXT', 'IMAGE', 'VIDEO', 'VOICE', 'FILE'])
  @IsOptional()
  messageType?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  mediaUrl?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  mediaType?: string;
}
```

### 3. `apps/api/src/modules/broadcast/broadcast.service.ts`
```typescript
import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ChannelRole, ChannelType } from '@prisma/client';

@Injectable()
export class BroadcastService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, data: { name: string; slug: string; description?: string; avatarUrl?: string }) {
    const existing = await this.prisma.broadcastChannel.findUnique({ where: { slug: data.slug } });
    if (existing) throw new ConflictException('Slug already taken');

    return this.prisma.$transaction(async (tx) => {
      const channel = await tx.broadcastChannel.create({
        data: {
          name: data.name,
          slug: data.slug,
          description: data.description,
          avatarUrl: data.avatarUrl,
          channelType: ChannelType.BROADCAST,
        },
      });
      await tx.channelMember.create({
        data: { channelId: channel.id, userId, role: ChannelRole.OWNER },
      });
      return channel;
    });
  }

  async getBySlug(slug: string) {
    const channel = await this.prisma.broadcastChannel.findUnique({ where: { slug } });
    if (!channel) throw new NotFoundException('Channel not found');
    return channel;
  }

  async getById(channelId: string) {
    const channel = await this.prisma.broadcastChannel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException('Channel not found');
    return channel;
  }

  async update(channelId: string, userId: string, data: { name?: string; description?: string; avatarUrl?: string }) {
    await this.requireRole(channelId, userId, [ChannelRole.OWNER, ChannelRole.ADMIN]);
    return this.prisma.broadcastChannel.update({
      where: { id: channelId },
      data,
    });
  }

  async delete(channelId: string, userId: string) {
    await this.requireRole(channelId, userId, [ChannelRole.OWNER]);
    await this.prisma.broadcastChannel.delete({ where: { id: channelId } });
    return { deleted: true };
  }

  async subscribe(channelId: string, userId: string) {
    await this.getById(channelId);
    const existing = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    if (existing) return existing;

    const member = await this.prisma.channelMember.create({
      data: { channelId, userId, role: ChannelRole.SUBSCRIBER },
    });
    await this.prisma.$executeRaw`UPDATE broadcast_channels SET "subscribersCount" = "subscribersCount" + 1 WHERE id = ${channelId}`;
    return member;
  }

  async unsubscribe(channelId: string, userId: string) {
    const member = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    if (!member) return { unsubscribed: true };
    if (member.role === ChannelRole.OWNER) throw new ForbiddenException('Owner cannot unsubscribe');

    await this.prisma.channelMember.delete({
      where: { channelId_userId: { channelId, userId } },
    });
    await this.prisma.$executeRaw`UPDATE broadcast_channels SET "subscribersCount" = GREATEST("subscribersCount" - 1, 0) WHERE id = ${channelId}`;
    return { unsubscribed: true };
  }

  async getSubscribers(channelId: string, cursor?: string, limit = 20) {
    const members = await this.prisma.channelMember.findMany({
      where: { channelId, ...(cursor ? { userId: { gt: cursor } } : {}) },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } } },
      orderBy: { joinedAt: 'desc' },
      take: limit + 1,
    });
    const hasMore = members.length > limit;
    if (hasMore) members.pop();
    return { data: members, meta: { cursor: members[members.length - 1]?.userId ?? null, hasMore } };
  }

  async sendMessage(channelId: string, userId: string, data: { content?: string; messageType?: string; mediaUrl?: string; mediaType?: string }) {
    await this.requireRole(channelId, userId, [ChannelRole.OWNER, ChannelRole.ADMIN]);
    const msg = await this.prisma.broadcastMessage.create({
      data: {
        channelId,
        senderId: userId,
        content: data.content,
        messageType: (data.messageType as any) ?? 'TEXT',
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
      },
      include: { sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
    });
    await this.prisma.$executeRaw`UPDATE broadcast_channels SET "postsCount" = "postsCount" + 1 WHERE id = ${channelId}`;
    return msg;
  }

  async getMessages(channelId: string, cursor?: string, limit = 30) {
    const messages = await this.prisma.broadcastMessage.findMany({
      where: { channelId, ...(cursor ? { id: { lt: cursor } } : {}) },
      include: { sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();
    return { data: messages, meta: { cursor: messages[messages.length - 1]?.id ?? null, hasMore } };
  }

  async pinMessage(messageId: string, userId: string) {
    const msg = await this.prisma.broadcastMessage.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Message not found');
    await this.requireRole(msg.channelId, userId, [ChannelRole.OWNER, ChannelRole.ADMIN]);
    return this.prisma.broadcastMessage.update({ where: { id: messageId }, data: { isPinned: true } });
  }

  async unpinMessage(messageId: string, userId: string) {
    const msg = await this.prisma.broadcastMessage.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Message not found');
    await this.requireRole(msg.channelId, userId, [ChannelRole.OWNER, ChannelRole.ADMIN]);
    return this.prisma.broadcastMessage.update({ where: { id: messageId }, data: { isPinned: false } });
  }

  async deleteMessage(messageId: string, userId: string) {
    const msg = await this.prisma.broadcastMessage.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Message not found');
    await this.requireRole(msg.channelId, userId, [ChannelRole.OWNER, ChannelRole.ADMIN]);
    await this.prisma.broadcastMessage.delete({ where: { id: messageId } });
    await this.prisma.$executeRaw`UPDATE broadcast_channels SET "postsCount" = GREATEST("postsCount" - 1, 0) WHERE id = ${msg.channelId}`;
    return { deleted: true };
  }

  async getPinnedMessages(channelId: string) {
    return this.prisma.broadcastMessage.findMany({
      where: { channelId, isPinned: true },
      include: { sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async muteChannel(channelId: string, userId: string, muted: boolean) {
    return this.prisma.channelMember.update({
      where: { channelId_userId: { channelId, userId } },
      data: { isMuted: muted },
    });
  }

  async getMyChannels(userId: string) {
    const memberships = await this.prisma.channelMember.findMany({
      where: { userId },
      include: { channel: true },
      orderBy: { joinedAt: 'desc' },
    });
    return memberships.map(m => ({ ...m.channel, role: m.role, isMuted: m.isMuted }));
  }

  async discover(cursor?: string, limit = 20) {
    const channels = await this.prisma.broadcastChannel.findMany({
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { subscribersCount: 'desc' },
      take: limit + 1,
    });
    const hasMore = channels.length > limit;
    if (hasMore) channels.pop();
    return { data: channels, meta: { cursor: channels[channels.length - 1]?.id ?? null, hasMore } };
  }

  async promoteToAdmin(channelId: string, ownerId: string, targetUserId: string) {
    await this.requireRole(channelId, ownerId, [ChannelRole.OWNER]);
    return this.prisma.channelMember.update({
      where: { channelId_userId: { channelId, userId: targetUserId } },
      data: { role: ChannelRole.ADMIN },
    });
  }

  async demoteFromAdmin(channelId: string, ownerId: string, targetUserId: string) {
    await this.requireRole(channelId, ownerId, [ChannelRole.OWNER]);
    return this.prisma.channelMember.update({
      where: { channelId_userId: { channelId, userId: targetUserId } },
      data: { role: ChannelRole.SUBSCRIBER },
    });
  }

  async removeSubscriber(channelId: string, userId: string, targetUserId: string) {
    await this.requireRole(channelId, userId, [ChannelRole.OWNER, ChannelRole.ADMIN]);
    await this.prisma.channelMember.delete({
      where: { channelId_userId: { channelId, userId: targetUserId } },
    });
    await this.prisma.$executeRaw`UPDATE broadcast_channels SET "subscribersCount" = GREATEST("subscribersCount" - 1, 0) WHERE id = ${channelId}`;
    return { removed: true };
  }

  private async requireRole(channelId: string, userId: string, roles: ChannelRole[]) {
    const member = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    if (!member || !roles.includes(member.role)) {
      throw new ForbiddenException('Insufficient channel permissions');
    }
    return member;
  }
}
```

### 4. `apps/api/src/modules/broadcast/broadcast.controller.ts`
```typescript
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BroadcastService } from './broadcast.service';
import { CreateBroadcastChannelDto } from './dto/create-channel.dto';
import { SendBroadcastDto } from './dto/send-broadcast.dto';

@ApiTags('Broadcast Channels')
@Controller('broadcast')
export class BroadcastController {
  constructor(private broadcast: BroadcastService) {}

  @Post()
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Create broadcast channel' })
  async create(@CurrentUser('id') userId: string, @Body() dto: CreateBroadcastChannelDto) {
    return this.broadcast.create(userId, dto);
  }

  @Get('discover')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Discover popular channels' })
  async discover(@Query('cursor') cursor?: string) {
    return this.broadcast.discover(cursor);
  }

  @Get('my')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my subscribed channels' })
  async myChannels(@CurrentUser('id') userId: string) {
    return this.broadcast.getMyChannels(userId);
  }

  @Get(':slug')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get channel by slug' })
  async getBySlug(@Param('slug') slug: string) {
    return this.broadcast.getBySlug(slug);
  }

  @Patch(':id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update channel' })
  async update(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: Partial<CreateBroadcastChannelDto>) {
    return this.broadcast.update(id, userId, dto);
  }

  @Delete(':id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete channel' })
  async delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.broadcast.delete(id, userId);
  }

  @Post(':id/subscribe')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Subscribe to channel' })
  async subscribe(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.broadcast.subscribe(id, userId);
  }

  @Delete(':id/subscribe')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unsubscribe from channel' })
  async unsubscribe(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.broadcast.unsubscribe(id, userId);
  }

  @Get(':id/subscribers')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List subscribers' })
  async subscribers(@Param('id') id: string, @Query('cursor') cursor?: string) {
    return this.broadcast.getSubscribers(id, cursor);
  }

  @Post(':id/messages')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Send message to channel' })
  async sendMessage(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: SendBroadcastDto) {
    return this.broadcast.sendMessage(id, userId, dto);
  }

  @Get(':id/messages')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get channel messages' })
  async getMessages(@Param('id') id: string, @Query('cursor') cursor?: string) {
    return this.broadcast.getMessages(id, cursor);
  }

  @Get(':id/pinned')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get pinned messages' })
  async getPinned(@Param('id') id: string) {
    return this.broadcast.getPinnedMessages(id);
  }

  @Patch('messages/:messageId/pin')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Pin message' })
  async pinMessage(@Param('messageId') messageId: string, @CurrentUser('id') userId: string) {
    return this.broadcast.pinMessage(messageId, userId);
  }

  @Delete('messages/:messageId/pin')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unpin message' })
  async unpinMessage(@Param('messageId') messageId: string, @CurrentUser('id') userId: string) {
    return this.broadcast.unpinMessage(messageId, userId);
  }

  @Delete('messages/:messageId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete message' })
  async deleteMessage(@Param('messageId') messageId: string, @CurrentUser('id') userId: string) {
    return this.broadcast.deleteMessage(messageId, userId);
  }

  @Patch(':id/mute')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mute/unmute channel' })
  async mute(@Param('id') id: string, @CurrentUser('id') userId: string, @Body('muted') muted: boolean) {
    return this.broadcast.muteChannel(id, userId, muted);
  }

  @Post(':id/promote/:targetUserId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Promote subscriber to admin' })
  async promote(@Param('id') id: string, @Param('targetUserId') targetUserId: string, @CurrentUser('id') userId: string) {
    return this.broadcast.promoteToAdmin(id, userId, targetUserId);
  }

  @Post(':id/demote/:targetUserId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Demote admin to subscriber' })
  async demote(@Param('id') id: string, @Param('targetUserId') targetUserId: string, @CurrentUser('id') userId: string) {
    return this.broadcast.demoteFromAdmin(id, userId, targetUserId);
  }

  @Delete(':id/subscribers/:targetUserId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove subscriber' })
  async removeSubscriber(@Param('id') id: string, @Param('targetUserId') targetUserId: string, @CurrentUser('id') userId: string) {
    return this.broadcast.removeSubscriber(id, userId, targetUserId);
  }
}
```

### 5. `apps/api/src/modules/broadcast/broadcast.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { BroadcastService } from './broadcast.service';
import { BroadcastController } from './broadcast.controller';

@Module({
  controllers: [BroadcastController],
  providers: [BroadcastService],
  exports: [BroadcastService],
})
export class BroadcastModule {}
```

### 6. `apps/api/src/modules/broadcast/broadcast.service.spec.ts`
```typescript
import { Test } from '@nestjs/testing';
import { BroadcastService } from './broadcast.service';
import { PrismaService } from '../../config/prisma.service';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';

describe('BroadcastService', () => {
  let service: BroadcastService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      broadcastChannel: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      channelMember: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      broadcastMessage: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
      $executeRaw: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        BroadcastService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(BroadcastService);
  });

  describe('create', () => {
    it('creates channel and adds owner', async () => {
      prisma.broadcastChannel.findUnique.mockResolvedValue(null);
      prisma.broadcastChannel.create.mockResolvedValue({ id: 'ch1', name: 'Test', slug: 'test' });
      prisma.channelMember.create.mockResolvedValue({});
      const result = await service.create('user1', { name: 'Test', slug: 'test' });
      expect(result.id).toBe('ch1');
    });

    it('throws ConflictException for duplicate slug', async () => {
      prisma.broadcastChannel.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.create('user1', { name: 'Test', slug: 'test' })).rejects.toThrow(ConflictException);
    });
  });

  describe('subscribe', () => {
    it('subscribes user and increments count', async () => {
      prisma.broadcastChannel.findUnique.mockResolvedValue({ id: 'ch1' });
      prisma.channelMember.findUnique.mockResolvedValue(null);
      prisma.channelMember.create.mockResolvedValue({ channelId: 'ch1', userId: 'user1' });
      await service.subscribe('ch1', 'user1');
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    it('allows owner to send', async () => {
      prisma.channelMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      prisma.broadcastMessage.create.mockResolvedValue({ id: 'msg1' });
      const result = await service.sendMessage('ch1', 'user1', { content: 'Hello' });
      expect(result.id).toBe('msg1');
    });

    it('rejects subscriber sending', async () => {
      prisma.channelMember.findUnique.mockResolvedValue({ role: 'SUBSCRIBER' });
      await expect(service.sendMessage('ch1', 'user1', { content: 'Hello' })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('pinMessage', () => {
    it('pins message as admin', async () => {
      prisma.broadcastMessage.findUnique.mockResolvedValue({ id: 'msg1', channelId: 'ch1' });
      prisma.channelMember.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.broadcastMessage.update.mockResolvedValue({ id: 'msg1', isPinned: true });
      const result = await service.pinMessage('msg1', 'user1');
      expect(result.isPinned).toBe(true);
    });
  });

  describe('delete', () => {
    it('allows owner to delete channel', async () => {
      prisma.channelMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      prisma.broadcastChannel.delete.mockResolvedValue({});
      const result = await service.delete('ch1', 'user1');
      expect(result.deleted).toBe(true);
    });
  });
});
```

**Verification:** `cd apps/api && npx tsc --noEmit` — no type errors in broadcast module.

---

## Agent 2: Live Sessions Module

**Goal:** Full NestJS module for live streaming (video) and audio spaces using existing `LiveSession`, `LiveParticipant` models.

**Schema reference:**
```
LiveSession: id, hostId, title, description, thumbnailUrl, liveType(VIDEO_STREAM|AUDIO_SPACE), status(SCHEDULED|LIVE|ENDED|CANCELLED), streamKey, playbackUrl, streamId, peakViewers, currentViewers, totalViews, scheduledAt, startedAt, endedAt, recordingUrl, isRecorded
LiveParticipant: [sessionId,userId] PK, role, joinedAt, leftAt
```

**Files to CREATE:**

### 1. `apps/api/src/modules/live/dto/create-live.dto.ts`
```typescript
import { IsString, IsOptional, IsEnum, IsDateString, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateLiveDto {
  @ApiProperty({ example: 'Friday Khutbah' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  thumbnailUrl?: string;

  @ApiProperty({ enum: ['VIDEO_STREAM', 'AUDIO_SPACE'] })
  @IsEnum(['VIDEO_STREAM', 'AUDIO_SPACE'])
  liveType: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  scheduledAt?: string;

  @ApiProperty({ default: true })
  @IsBoolean()
  @IsOptional()
  isRecorded?: boolean;
}
```

### 2. `apps/api/src/modules/live/live.service.ts`
```typescript
import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { LiveStatus, LiveType } from '@prisma/client';
import { randomBytes } from 'crypto';

@Injectable()
export class LiveService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, data: { title: string; description?: string; thumbnailUrl?: string; liveType: string; scheduledAt?: string; isRecorded?: boolean }) {
    const streamKey = randomBytes(16).toString('hex');
    return this.prisma.liveSession.create({
      data: {
        hostId: userId,
        title: data.title,
        description: data.description,
        thumbnailUrl: data.thumbnailUrl,
        liveType: data.liveType as LiveType,
        status: data.scheduledAt ? LiveStatus.SCHEDULED : LiveStatus.LIVE,
        streamKey,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
        startedAt: data.scheduledAt ? undefined : new Date(),
        isRecorded: data.isRecorded ?? true,
      },
      include: { host: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } } },
    });
  }

  async getById(sessionId: string) {
    const session = await this.prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: {
        host: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
        participants: {
          where: { leftAt: null },
          include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
          take: 20,
        },
      },
    });
    if (!session) throw new NotFoundException('Live session not found');
    return session;
  }

  async getActive(liveType?: string, cursor?: string, limit = 20) {
    const where: Record<string, unknown> = { status: LiveStatus.LIVE };
    if (liveType) where.liveType = liveType as LiveType;
    if (cursor) where.id = { lt: cursor };

    const sessions = await this.prisma.liveSession.findMany({
      where,
      include: { host: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } } },
      orderBy: { currentViewers: 'desc' },
      take: limit + 1,
    });
    const hasMore = sessions.length > limit;
    if (hasMore) sessions.pop();
    return { data: sessions, meta: { cursor: sessions[sessions.length - 1]?.id ?? null, hasMore } };
  }

  async getScheduled(cursor?: string, limit = 20) {
    const sessions = await this.prisma.liveSession.findMany({
      where: { status: LiveStatus.SCHEDULED, scheduledAt: { gte: new Date() }, ...(cursor ? { id: { lt: cursor } } : {}) },
      include: { host: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } } },
      orderBy: { scheduledAt: 'asc' },
      take: limit + 1,
    });
    const hasMore = sessions.length > limit;
    if (hasMore) sessions.pop();
    return { data: sessions, meta: { cursor: sessions[sessions.length - 1]?.id ?? null, hasMore } };
  }

  async startLive(sessionId: string, userId: string) {
    const session = await this.requireHost(sessionId, userId);
    if (session.status !== LiveStatus.SCHEDULED) throw new BadRequestException('Can only start a scheduled session');
    return this.prisma.liveSession.update({
      where: { id: sessionId },
      data: { status: LiveStatus.LIVE, startedAt: new Date() },
    });
  }

  async endLive(sessionId: string, userId: string) {
    const session = await this.requireHost(sessionId, userId);
    if (session.status !== LiveStatus.LIVE) throw new BadRequestException('Session is not live');
    await this.prisma.liveParticipant.updateMany({
      where: { sessionId, leftAt: null },
      data: { leftAt: new Date() },
    });
    return this.prisma.liveSession.update({
      where: { id: sessionId },
      data: { status: LiveStatus.ENDED, endedAt: new Date(), currentViewers: 0 },
    });
  }

  async cancelLive(sessionId: string, userId: string) {
    await this.requireHost(sessionId, userId);
    return this.prisma.liveSession.update({
      where: { id: sessionId },
      data: { status: LiveStatus.CANCELLED },
    });
  }

  async join(sessionId: string, userId: string, role = 'viewer') {
    const session = await this.getById(sessionId);
    if (session.status !== LiveStatus.LIVE) throw new BadRequestException('Session is not live');

    const existing = await this.prisma.liveParticipant.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
    if (existing && !existing.leftAt) return existing;

    if (existing) {
      await this.prisma.liveParticipant.update({
        where: { sessionId_userId: { sessionId, userId } },
        data: { leftAt: null, joinedAt: new Date(), role },
      });
    } else {
      await this.prisma.liveParticipant.create({
        data: { sessionId, userId, role },
      });
    }

    const updated = await this.prisma.liveSession.update({
      where: { id: sessionId },
      data: {
        currentViewers: { increment: 1 },
        totalViews: { increment: 1 },
      },
    });
    if (updated.currentViewers > updated.peakViewers) {
      await this.prisma.liveSession.update({
        where: { id: sessionId },
        data: { peakViewers: updated.currentViewers },
      });
    }
    return { joined: true, currentViewers: updated.currentViewers };
  }

  async leave(sessionId: string, userId: string) {
    await this.prisma.liveParticipant.update({
      where: { sessionId_userId: { sessionId, userId } },
      data: { leftAt: new Date() },
    }).catch(() => {});
    await this.prisma.liveSession.update({
      where: { id: sessionId },
      data: { currentViewers: { decrement: 1 } },
    }).catch(() => {});
    return { left: true };
  }

  async raiseHand(sessionId: string, userId: string) {
    return this.prisma.liveParticipant.update({
      where: { sessionId_userId: { sessionId, userId } },
      data: { role: 'raised_hand' },
    });
  }

  async promoteToSpeaker(sessionId: string, hostId: string, targetUserId: string) {
    await this.requireHost(sessionId, hostId);
    return this.prisma.liveParticipant.update({
      where: { sessionId_userId: { sessionId, userId: targetUserId } },
      data: { role: 'speaker' },
    });
  }

  async demoteToViewer(sessionId: string, hostId: string, targetUserId: string) {
    await this.requireHost(sessionId, hostId);
    return this.prisma.liveParticipant.update({
      where: { sessionId_userId: { sessionId, userId: targetUserId } },
      data: { role: 'viewer' },
    });
  }

  async updateRecording(sessionId: string, userId: string, recordingUrl: string) {
    await this.requireHost(sessionId, userId);
    return this.prisma.liveSession.update({
      where: { id: sessionId },
      data: { recordingUrl },
    });
  }

  async getHostSessions(userId: string, cursor?: string, limit = 20) {
    const sessions = await this.prisma.liveSession.findMany({
      where: { hostId: userId, ...(cursor ? { id: { lt: cursor } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
    const hasMore = sessions.length > limit;
    if (hasMore) sessions.pop();
    return { data: sessions, meta: { cursor: sessions[sessions.length - 1]?.id ?? null, hasMore } };
  }

  private async requireHost(sessionId: string, userId: string) {
    const session = await this.prisma.liveSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    if (session.hostId !== userId) throw new ForbiddenException('Only the host can perform this action');
    return session;
  }
}
```

### 3. `apps/api/src/modules/live/live.controller.ts`
```typescript
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { LiveService } from './live.service';
import { CreateLiveDto } from './dto/create-live.dto';

@ApiTags('Live Sessions')
@Controller('live')
export class LiveController {
  constructor(private live: LiveService) {}

  @Post()
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create live session' })
  async create(@CurrentUser('id') userId: string, @Body() dto: CreateLiveDto) {
    return this.live.create(userId, dto);
  }

  @Get('active')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get active live sessions' })
  async getActive(@Query('type') type?: string, @Query('cursor') cursor?: string) {
    return this.live.getActive(type, cursor);
  }

  @Get('scheduled')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get upcoming scheduled sessions' })
  async getScheduled(@Query('cursor') cursor?: string) {
    return this.live.getScheduled(cursor);
  }

  @Get('my')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my live sessions' })
  async mySessions(@CurrentUser('id') userId: string, @Query('cursor') cursor?: string) {
    return this.live.getHostSessions(userId, cursor);
  }

  @Get(':id')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get live session details' })
  async getById(@Param('id') id: string) {
    return this.live.getById(id);
  }

  @Post(':id/start')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start scheduled live session' })
  async start(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.live.startLive(id, userId);
  }

  @Post(':id/end')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End live session' })
  async end(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.live.endLive(id, userId);
  }

  @Post(':id/cancel')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel scheduled session' })
  async cancel(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.live.cancelLive(id, userId);
  }

  @Post(':id/join')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Join live session' })
  async join(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.live.join(id, userId);
  }

  @Post(':id/leave')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave live session' })
  async leave(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.live.leave(id, userId);
  }

  @Post(':id/raise-hand')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Raise hand in audio space' })
  async raiseHand(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.live.raiseHand(id, userId);
  }

  @Post(':id/promote/:targetUserId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Promote participant to speaker' })
  async promote(@Param('id') id: string, @Param('targetUserId') targetUserId: string, @CurrentUser('id') userId: string) {
    return this.live.promoteToSpeaker(id, userId, targetUserId);
  }

  @Post(':id/demote/:targetUserId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Demote speaker to viewer' })
  async demote(@Param('id') id: string, @Param('targetUserId') targetUserId: string, @CurrentUser('id') userId: string) {
    return this.live.demoteToViewer(id, userId, targetUserId);
  }

  @Patch(':id/recording')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set recording URL' })
  async setRecording(@Param('id') id: string, @CurrentUser('id') userId: string, @Body('recordingUrl') url: string) {
    return this.live.updateRecording(id, userId, url);
  }
}
```

### 4. `apps/api/src/modules/live/live.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { LiveService } from './live.service';
import { LiveController } from './live.controller';

@Module({
  controllers: [LiveController],
  providers: [LiveService],
  exports: [LiveService],
})
export class LiveModule {}
```

### 5. `apps/api/src/modules/live/live.service.spec.ts`
```typescript
import { Test } from '@nestjs/testing';
import { LiveService } from './live.service';
import { PrismaService } from '../../config/prisma.service';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';

describe('LiveService', () => {
  let service: LiveService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      liveSession: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      liveParticipant: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [LiveService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(LiveService);
  });

  describe('create', () => {
    it('creates a live session', async () => {
      prisma.liveSession.create.mockResolvedValue({ id: 'live1', status: 'LIVE' });
      const result = await service.create('user1', { title: 'Test', liveType: 'VIDEO_STREAM' });
      expect(result.id).toBe('live1');
    });

    it('creates scheduled session', async () => {
      prisma.liveSession.create.mockResolvedValue({ id: 'live1', status: 'SCHEDULED' });
      const result = await service.create('user1', { title: 'Test', liveType: 'AUDIO_SPACE', scheduledAt: '2026-04-01T10:00:00Z' });
      expect(result.status).toBe('SCHEDULED');
    });
  });

  describe('endLive', () => {
    it('ends a live session', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'user1', status: 'LIVE' });
      prisma.liveParticipant.updateMany.mockResolvedValue({});
      prisma.liveSession.update.mockResolvedValue({ id: 'live1', status: 'ENDED' });
      const result = await service.endLive('live1', 'user1');
      expect(result.status).toBe('ENDED');
    });

    it('rejects non-host', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', hostId: 'other' });
      await expect(service.endLive('live1', 'user1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('join', () => {
    it('increments viewer count', async () => {
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'live1', status: 'LIVE', hostId: 'h', participants: [] });
      prisma.liveParticipant.findUnique.mockResolvedValue(null);
      prisma.liveParticipant.create.mockResolvedValue({});
      prisma.liveSession.update.mockResolvedValue({ id: 'live1', currentViewers: 5, peakViewers: 10 });
      const result = await service.join('live1', 'user1');
      expect(result.joined).toBe(true);
    });
  });
});
```

---

## Agent 3: Calls Module

**Goal:** Full NestJS module for voice/video calls using existing `CallSession`, `CallParticipant` models.

**Schema reference:**
```
CallSession: id, callType(VOICE|VIDEO), status(RINGING|ACTIVE|ENDED|MISSED|DECLINED), startedAt, endedAt, duration
CallParticipant: [sessionId,userId] PK, role, joinedAt, leftAt
```

**Files to CREATE:**

### 1. `apps/api/src/modules/calls/dto/initiate-call.dto.ts`
```typescript
import { IsString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InitiateCallDto {
  @ApiProperty({ description: 'User ID to call' })
  @IsString()
  targetUserId: string;

  @ApiProperty({ enum: ['VOICE', 'VIDEO'] })
  @IsEnum(['VOICE', 'VIDEO'])
  callType: string;
}
```

### 2. `apps/api/src/modules/calls/calls.service.ts`
```typescript
import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CallStatus, CallType } from '@prisma/client';

@Injectable()
export class CallsService {
  constructor(private prisma: PrismaService) {}

  async initiate(userId: string, targetUserId: string, callType: string) {
    // Check no active call for either user
    const activeCall = await this.prisma.callParticipant.findFirst({
      where: {
        userId: { in: [userId, targetUserId] },
        leftAt: null,
        session: { status: { in: [CallStatus.RINGING, CallStatus.ACTIVE] } },
      },
    });
    if (activeCall) throw new BadRequestException('User is already in a call');

    const session = await this.prisma.callSession.create({
      data: {
        callType: callType as CallType,
        status: CallStatus.RINGING,
        participants: {
          createMany: {
            data: [
              { userId, role: 'caller', joinedAt: new Date() },
              { userId: targetUserId, role: 'callee' },
            ],
          },
        },
      },
      include: {
        participants: {
          include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
        },
      },
    });
    return session;
  }

  async answer(sessionId: string, userId: string) {
    const session = await this.getSession(sessionId);
    if (session.status !== CallStatus.RINGING) throw new BadRequestException('Call is not ringing');
    this.requireParticipant(session.participants, userId);

    return this.prisma.callSession.update({
      where: { id: sessionId },
      data: {
        status: CallStatus.ACTIVE,
        startedAt: new Date(),
        participants: {
          update: {
            where: { sessionId_userId: { sessionId, userId } },
            data: { joinedAt: new Date() },
          },
        },
      },
    });
  }

  async decline(sessionId: string, userId: string) {
    const session = await this.getSession(sessionId);
    if (session.status !== CallStatus.RINGING) throw new BadRequestException('Call is not ringing');
    this.requireParticipant(session.participants, userId);

    return this.prisma.callSession.update({
      where: { id: sessionId },
      data: { status: CallStatus.DECLINED, endedAt: new Date() },
    });
  }

  async end(sessionId: string, userId: string) {
    const session = await this.getSession(sessionId);
    this.requireParticipant(session.participants, userId);
    if (session.status === CallStatus.ENDED) return session;

    const now = new Date();
    const duration = session.startedAt ? Math.floor((now.getTime() - session.startedAt.getTime()) / 1000) : 0;

    await this.prisma.callParticipant.updateMany({
      where: { sessionId, leftAt: null },
      data: { leftAt: now },
    });

    return this.prisma.callSession.update({
      where: { id: sessionId },
      data: { status: CallStatus.ENDED, endedAt: now, duration },
    });
  }

  async missedCall(sessionId: string) {
    return this.prisma.callSession.update({
      where: { id: sessionId },
      data: { status: CallStatus.MISSED, endedAt: new Date() },
    });
  }

  async getHistory(userId: string, cursor?: string, limit = 20) {
    const participations = await this.prisma.callParticipant.findMany({
      where: { userId, ...(cursor ? { session: { id: { lt: cursor } } } : {}) },
      include: {
        session: {
          include: {
            participants: {
              include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
            },
          },
        },
      },
      orderBy: { session: { createdAt: 'desc' } },
      take: limit + 1,
    });
    const hasMore = participations.length > limit;
    if (hasMore) participations.pop();
    const data = participations.map(p => p.session);
    return { data, meta: { cursor: data[data.length - 1]?.id ?? null, hasMore } };
  }

  async getActiveCall(userId: string) {
    const participant = await this.prisma.callParticipant.findFirst({
      where: { userId, leftAt: null, session: { status: { in: [CallStatus.RINGING, CallStatus.ACTIVE] } } },
      include: {
        session: {
          include: {
            participants: {
              include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
            },
          },
        },
      },
    });
    return participant?.session ?? null;
  }

  private async getSession(sessionId: string) {
    const session = await this.prisma.callSession.findUnique({
      where: { id: sessionId },
      include: { participants: true },
    });
    if (!session) throw new NotFoundException('Call not found');
    return session;
  }

  private requireParticipant(participants: { userId: string }[], userId: string) {
    if (!participants.some(p => p.userId === userId)) {
      throw new ForbiddenException('Not a participant in this call');
    }
  }
}
```

### 3. `apps/api/src/modules/calls/calls.controller.ts`
```typescript
import { Controller, Get, Post, Param, Body, UseGuards, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CallsService } from './calls.service';
import { InitiateCallDto } from './dto/initiate-call.dto';

@ApiTags('Calls')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('calls')
export class CallsController {
  constructor(private calls: CallsService) {}

  @Post()
  @ApiOperation({ summary: 'Initiate call' })
  async initiate(@CurrentUser('id') userId: string, @Body() dto: InitiateCallDto) {
    return this.calls.initiate(userId, dto.targetUserId, dto.callType);
  }

  @Post(':id/answer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Answer call' })
  async answer(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.calls.answer(id, userId);
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decline call' })
  async decline(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.calls.decline(id, userId);
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End call' })
  async end(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.calls.end(id, userId);
  }

  @Get('active')
  @ApiOperation({ summary: 'Get active call' })
  async active(@CurrentUser('id') userId: string) {
    return this.calls.getActiveCall(userId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get call history' })
  async history(@CurrentUser('id') userId: string, @Query('cursor') cursor?: string) {
    return this.calls.getHistory(userId, cursor);
  }
}
```

### 4. `apps/api/src/modules/calls/calls.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { CallsService } from './calls.service';
import { CallsController } from './calls.controller';

@Module({
  controllers: [CallsController],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}
```

### 5. `apps/api/src/modules/calls/calls.service.spec.ts`
```typescript
import { Test } from '@nestjs/testing';
import { CallsService } from './calls.service';
import { PrismaService } from '../../config/prisma.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('CallsService', () => {
  let service: CallsService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      callSession: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      callParticipant: { findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [CallsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(CallsService);
  });

  describe('initiate', () => {
    it('creates call session with participants', async () => {
      prisma.callParticipant.findFirst.mockResolvedValue(null);
      prisma.callSession.create.mockResolvedValue({ id: 'call1', status: 'RINGING', participants: [] });
      const result = await service.initiate('user1', 'user2', 'VOICE');
      expect(result.status).toBe('RINGING');
    });

    it('rejects if user already in call', async () => {
      prisma.callParticipant.findFirst.mockResolvedValue({ sessionId: 'existing' });
      await expect(service.initiate('user1', 'user2', 'VOICE')).rejects.toThrow(BadRequestException);
    });
  });

  describe('answer', () => {
    it('sets status to ACTIVE', async () => {
      prisma.callSession.findUnique.mockResolvedValue({ id: 'call1', status: 'RINGING', participants: [{ userId: 'user2' }] });
      prisma.callSession.update.mockResolvedValue({ id: 'call1', status: 'ACTIVE' });
      const result = await service.answer('call1', 'user2');
      expect(result.status).toBe('ACTIVE');
    });
  });

  describe('end', () => {
    it('ends call and calculates duration', async () => {
      const startedAt = new Date(Date.now() - 60000);
      prisma.callSession.findUnique.mockResolvedValue({ id: 'call1', status: 'ACTIVE', startedAt, participants: [{ userId: 'user1' }] });
      prisma.callParticipant.updateMany.mockResolvedValue({});
      prisma.callSession.update.mockResolvedValue({ id: 'call1', status: 'ENDED', duration: 60 });
      const result = await service.end('call1', 'user1');
      expect(result.status).toBe('ENDED');
    });
  });
});
```

---

## Agent 4: Stickers Module

**Goal:** Full NestJS module for sticker packs and stickers using existing `StickerPack`, `Sticker`, `UserStickerPack` models.

**Schema reference:**
```
StickerPack: id, name, coverUrl, stickersCount, isFree
Sticker: id, packId, url, name, position
UserStickerPack: [userId,packId] PK, addedAt
```

**Files to CREATE:**

### 1. `apps/api/src/modules/stickers/dto/create-pack.dto.ts`
```typescript
import { IsString, IsOptional, IsBoolean, IsArray, ValidateNested, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class StickerItemDto {
  @ApiProperty()
  @IsString()
  url: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  name?: string;
}

export class CreateStickerPackDto {
  @ApiProperty({ example: 'Islamic Greetings' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  coverUrl?: string;

  @ApiProperty({ default: true })
  @IsBoolean()
  @IsOptional()
  isFree?: boolean;

  @ApiProperty({ type: [StickerItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StickerItemDto)
  stickers: StickerItemDto[];
}
```

### 2. `apps/api/src/modules/stickers/stickers.service.ts`
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class StickersService {
  constructor(private prisma: PrismaService) {}

  async createPack(data: { name: string; coverUrl?: string; isFree?: boolean; stickers: { url: string; name?: string }[] }) {
    return this.prisma.stickerPack.create({
      data: {
        name: data.name,
        coverUrl: data.coverUrl,
        isFree: data.isFree ?? true,
        stickersCount: data.stickers.length,
        stickers: {
          createMany: {
            data: data.stickers.map((s, i) => ({ url: s.url, name: s.name, position: i })),
          },
        },
      },
      include: { stickers: { orderBy: { position: 'asc' } } },
    });
  }

  async getPack(packId: string) {
    const pack = await this.prisma.stickerPack.findUnique({
      where: { id: packId },
      include: { stickers: { orderBy: { position: 'asc' } } },
    });
    if (!pack) throw new NotFoundException('Sticker pack not found');
    return pack;
  }

  async browsePacks(cursor?: string, limit = 20) {
    const packs = await this.prisma.stickerPack.findMany({
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
    const hasMore = packs.length > limit;
    if (hasMore) packs.pop();
    return { data: packs, meta: { cursor: packs[packs.length - 1]?.id ?? null, hasMore } };
  }

  async searchPacks(query: string) {
    return this.prisma.stickerPack.findMany({
      where: { name: { contains: query, mode: 'insensitive' } },
      take: 20,
    });
  }

  async addToCollection(userId: string, packId: string) {
    await this.getPack(packId);
    return this.prisma.userStickerPack.upsert({
      where: { userId_packId: { userId, packId } },
      update: {},
      create: { userId, packId },
    });
  }

  async removeFromCollection(userId: string, packId: string) {
    await this.prisma.userStickerPack.delete({
      where: { userId_packId: { userId, packId } },
    }).catch(() => {});
    return { removed: true };
  }

  async getMyPacks(userId: string) {
    const owned = await this.prisma.userStickerPack.findMany({
      where: { userId },
      include: { pack: { include: { stickers: { orderBy: { position: 'asc' } } } } },
      orderBy: { addedAt: 'desc' },
    });
    return owned.map(o => o.pack);
  }

  async getRecentStickers(userId: string) {
    const packs = await this.getMyPacks(userId);
    return packs.flatMap(p => p.stickers).slice(0, 30);
  }

  async getFeaturedPacks() {
    return this.prisma.stickerPack.findMany({
      where: { isFree: true },
      orderBy: { stickersCount: 'desc' },
      take: 10,
    });
  }

  async deletePack(packId: string) {
    await this.prisma.stickerPack.delete({ where: { id: packId } });
    return { deleted: true };
  }
}
```

### 3. `apps/api/src/modules/stickers/stickers.controller.ts`
```typescript
import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { StickersService } from './stickers.service';
import { CreateStickerPackDto } from './dto/create-pack.dto';

@ApiTags('Stickers')
@Controller('stickers')
export class StickersController {
  constructor(private stickers: StickersService) {}

  @Post('packs')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create sticker pack' })
  async createPack(@Body() dto: CreateStickerPackDto) {
    return this.stickers.createPack(dto);
  }

  @Get('packs')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Browse sticker packs' })
  async browse(@Query('cursor') cursor?: string) {
    return this.stickers.browsePacks(cursor);
  }

  @Get('packs/featured')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get featured packs' })
  async featured() {
    return this.stickers.getFeaturedPacks();
  }

  @Get('packs/search')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Search sticker packs' })
  async search(@Query('q') query: string) {
    return this.stickers.searchPacks(query);
  }

  @Get('packs/:id')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get pack with stickers' })
  async getPack(@Param('id') id: string) {
    return this.stickers.getPack(id);
  }

  @Delete('packs/:id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete pack (admin)' })
  async deletePack(@Param('id') id: string) {
    return this.stickers.deletePack(id);
  }

  @Get('my')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my sticker packs' })
  async myPacks(@CurrentUser('id') userId: string) {
    return this.stickers.getMyPacks(userId);
  }

  @Get('my/recent')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get recently used stickers' })
  async recent(@CurrentUser('id') userId: string) {
    return this.stickers.getRecentStickers(userId);
  }

  @Post('my/:packId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add pack to collection' })
  async addPack(@CurrentUser('id') userId: string, @Param('packId') packId: string) {
    return this.stickers.addToCollection(userId, packId);
  }

  @Delete('my/:packId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove pack from collection' })
  async removePack(@CurrentUser('id') userId: string, @Param('packId') packId: string) {
    return this.stickers.removeFromCollection(userId, packId);
  }
}
```

### 4. `apps/api/src/modules/stickers/stickers.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { StickersService } from './stickers.service';
import { StickersController } from './stickers.controller';

@Module({
  controllers: [StickersController],
  providers: [StickersService],
  exports: [StickersService],
})
export class StickersModule {}
```

### 5. `apps/api/src/modules/stickers/stickers.service.spec.ts`
```typescript
import { Test } from '@nestjs/testing';
import { StickersService } from './stickers.service';
import { PrismaService } from '../../config/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('StickersService', () => {
  let service: StickersService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      stickerPack: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), delete: jest.fn() },
      sticker: { findMany: jest.fn() },
      userStickerPack: { findMany: jest.fn(), upsert: jest.fn(), delete: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [StickersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(StickersService);
  });

  describe('createPack', () => {
    it('creates pack with stickers', async () => {
      prisma.stickerPack.create.mockResolvedValue({ id: 'pack1', name: 'Test', stickersCount: 2, stickers: [] });
      const result = await service.createPack({ name: 'Test', stickers: [{ url: 'a.png' }, { url: 'b.png' }] });
      expect(result.stickersCount).toBe(2);
    });
  });

  describe('getPack', () => {
    it('throws NotFoundException', async () => {
      prisma.stickerPack.findUnique.mockResolvedValue(null);
      await expect(service.getPack('bad')).rejects.toThrow(NotFoundException);
    });
  });

  describe('addToCollection', () => {
    it('upserts user sticker pack', async () => {
      prisma.stickerPack.findUnique.mockResolvedValue({ id: 'pack1', stickers: [] });
      prisma.userStickerPack.upsert.mockResolvedValue({});
      await service.addToCollection('user1', 'pack1');
      expect(prisma.userStickerPack.upsert).toHaveBeenCalled();
    });
  });
});
```

---

## Agent 5: Post Collabs Module

**Goal:** Full NestJS module for Instagram-style post collaborations using existing `PostCollab` model.

**Schema reference:**
```
PostCollab: id, postId, userId, status(PENDING|ACCEPTED|DECLINED), createdAt
```

**Files to CREATE:**

### 1. `apps/api/src/modules/collabs/dto/invite-collab.dto.ts`
```typescript
import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InviteCollabDto {
  @ApiProperty({ description: 'Post ID to invite collaborator to' })
  @IsString()
  postId: string;

  @ApiProperty({ description: 'User ID to invite' })
  @IsString()
  targetUserId: string;
}
```

### 2. `apps/api/src/modules/collabs/collabs.service.ts`
```typescript
import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CollabStatus } from '@prisma/client';

@Injectable()
export class CollabsService {
  constructor(private prisma: PrismaService) {}

  async invite(userId: string, postId: string, targetUserId: string) {
    if (userId === targetUserId) throw new BadRequestException('Cannot invite yourself');

    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.userId !== userId) throw new ForbiddenException('Only post owner can invite collaborators');

    const existing = await this.prisma.postCollab.findUnique({
      where: { postId_userId: { postId, userId: targetUserId } },
    });
    if (existing) throw new ConflictException('User already invited');

    return this.prisma.postCollab.create({
      data: { postId, userId: targetUserId, status: CollabStatus.PENDING },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        post: { select: { id: true, content: true } },
      },
    });
  }

  async accept(collabId: string, userId: string) {
    const collab = await this.getCollab(collabId);
    if (collab.userId !== userId) throw new ForbiddenException();
    if (collab.status !== CollabStatus.PENDING) throw new BadRequestException('Not pending');

    return this.prisma.postCollab.update({
      where: { id: collabId },
      data: { status: CollabStatus.ACCEPTED },
    });
  }

  async decline(collabId: string, userId: string) {
    const collab = await this.getCollab(collabId);
    if (collab.userId !== userId) throw new ForbiddenException();

    return this.prisma.postCollab.update({
      where: { id: collabId },
      data: { status: CollabStatus.DECLINED },
    });
  }

  async remove(collabId: string, userId: string) {
    const collab = await this.getCollab(collabId);
    const post = await this.prisma.post.findUnique({ where: { id: collab.postId } });
    if (collab.userId !== userId && post?.userId !== userId) throw new ForbiddenException();

    await this.prisma.postCollab.delete({ where: { id: collabId } });
    return { removed: true };
  }

  async getMyPending(userId: string) {
    return this.prisma.postCollab.findMany({
      where: { userId, status: CollabStatus.PENDING },
      include: {
        post: {
          select: { id: true, content: true, mediaUrls: true, user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPostCollabs(postId: string) {
    return this.prisma.postCollab.findMany({
      where: { postId },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getAcceptedCollabs(userId: string, cursor?: string, limit = 20) {
    const collabs = await this.prisma.postCollab.findMany({
      where: { userId, status: CollabStatus.ACCEPTED, ...(cursor ? { id: { lt: cursor } } : {}) },
      include: {
        post: {
          select: { id: true, content: true, mediaUrls: true, createdAt: true, user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
    const hasMore = collabs.length > limit;
    if (hasMore) collabs.pop();
    return { data: collabs, meta: { cursor: collabs[collabs.length - 1]?.id ?? null, hasMore } };
  }

  private async getCollab(collabId: string) {
    const collab = await this.prisma.postCollab.findUnique({ where: { id: collabId } });
    if (!collab) throw new NotFoundException('Collab not found');
    return collab;
  }
}
```

### 3. `apps/api/src/modules/collabs/collabs.controller.ts`
```typescript
import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CollabsService } from './collabs.service';
import { InviteCollabDto } from './dto/invite-collab.dto';

@ApiTags('Post Collaborations')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('collabs')
export class CollabsController {
  constructor(private collabs: CollabsService) {}

  @Post('invite')
  @ApiOperation({ summary: 'Invite collaborator to post' })
  async invite(@CurrentUser('id') userId: string, @Body() dto: InviteCollabDto) {
    return this.collabs.invite(userId, dto.postId, dto.targetUserId);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept collab invite' })
  async accept(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.collabs.accept(id, userId);
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decline collab invite' })
  async decline(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.collabs.decline(id, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove collaboration' })
  async remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.collabs.remove(id, userId);
  }

  @Get('pending')
  @ApiOperation({ summary: 'Get my pending collab invites' })
  async pending(@CurrentUser('id') userId: string) {
    return this.collabs.getMyPending(userId);
  }

  @Get('accepted')
  @ApiOperation({ summary: 'Get my accepted collabs' })
  async accepted(@CurrentUser('id') userId: string, @Query('cursor') cursor?: string) {
    return this.collabs.getAcceptedCollabs(userId, cursor);
  }

  @Get('post/:postId')
  @ApiOperation({ summary: 'Get collaborators on a post' })
  async postCollabs(@Param('postId') postId: string) {
    return this.collabs.getPostCollabs(postId);
  }
}
```

### 4. `apps/api/src/modules/collabs/collabs.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { CollabsService } from './collabs.service';
import { CollabsController } from './collabs.controller';

@Module({
  controllers: [CollabsController],
  providers: [CollabsService],
  exports: [CollabsService],
})
export class CollabsModule {}
```

### 5. `apps/api/src/modules/collabs/collabs.service.spec.ts`
```typescript
import { Test } from '@nestjs/testing';
import { CollabsService } from './collabs.service';
import { PrismaService } from '../../config/prisma.service';
import { NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';

describe('CollabsService', () => {
  let service: CollabsService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      post: { findUnique: jest.fn() },
      postCollab: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [CollabsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(CollabsService);
  });

  describe('invite', () => {
    it('creates collab invite', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'post1', userId: 'user1' });
      prisma.postCollab.findUnique.mockResolvedValue(null);
      prisma.postCollab.create.mockResolvedValue({ id: 'c1', status: 'PENDING' });
      const result = await service.invite('user1', 'post1', 'user2');
      expect(result.status).toBe('PENDING');
    });

    it('rejects self-invite', async () => {
      await expect(service.invite('user1', 'post1', 'user1')).rejects.toThrow(BadRequestException);
    });

    it('rejects non-owner invite', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'post1', userId: 'other' });
      await expect(service.invite('user1', 'post1', 'user2')).rejects.toThrow(ForbiddenException);
    });

    it('rejects duplicate invite', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'post1', userId: 'user1' });
      prisma.postCollab.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.invite('user1', 'post1', 'user2')).rejects.toThrow(ConflictException);
    });
  });

  describe('accept', () => {
    it('accepts pending collab', async () => {
      prisma.postCollab.findUnique.mockResolvedValue({ id: 'c1', userId: 'user2', status: 'PENDING' });
      prisma.postCollab.update.mockResolvedValue({ id: 'c1', status: 'ACCEPTED' });
      const result = await service.accept('c1', 'user2');
      expect(result.status).toBe('ACCEPTED');
    });
  });
});
```

---

## Agent 6: Channel Community Posts Module

**Goal:** Full NestJS module for YouTube-style community posts using existing `ChannelPost` model.

**Schema reference:**
```
ChannelPost: id, channelId, userId, content, mediaUrls[], likesCount, commentsCount, isPinned, createdAt
```

**Files to CREATE:**

### 1. `apps/api/src/modules/channel-posts/dto/create-channel-post.dto.ts`
```typescript
import { IsString, IsOptional, IsArray, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateChannelPostDto {
  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  content: string;

  @ApiProperty({ required: false, type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  mediaUrls?: string[];
}
```

### 2. `apps/api/src/modules/channel-posts/channel-posts.service.ts`
```typescript
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class ChannelPostsService {
  constructor(private prisma: PrismaService) {}

  async create(channelId: string, userId: string, data: { content: string; mediaUrls?: string[] }) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.userId !== userId) throw new ForbiddenException('Only channel owner can post');
    return this.prisma.channelPost.create({
      data: { channelId, userId, content: data.content, mediaUrls: data.mediaUrls ?? [] },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } } },
    });
  }

  async getFeed(channelId: string, cursor?: string, limit = 20) {
    const posts = await this.prisma.channelPost.findMany({
      where: { channelId, ...(cursor ? { id: { lt: cursor } } : {}) },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
    const hasMore = posts.length > limit;
    if (hasMore) posts.pop();
    return { data: posts, meta: { cursor: posts[posts.length - 1]?.id ?? null, hasMore } };
  }

  async getById(postId: string) {
    const post = await this.prisma.channelPost.findUnique({
      where: { id: postId },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } }, channel: { select: { id: true, handle: true, name: true } } },
    });
    if (!post) throw new NotFoundException('Community post not found');
    return post;
  }

  async delete(postId: string, userId: string) {
    const post = await this.getById(postId);
    if (post.userId !== userId) throw new ForbiddenException();
    await this.prisma.channelPost.delete({ where: { id: postId } });
    return { deleted: true };
  }

  async pin(postId: string, userId: string) {
    const post = await this.getById(postId);
    if (post.userId !== userId) throw new ForbiddenException();
    return this.prisma.channelPost.update({ where: { id: postId }, data: { isPinned: true } });
  }

  async unpin(postId: string, userId: string) {
    const post = await this.getById(postId);
    if (post.userId !== userId) throw new ForbiddenException();
    return this.prisma.channelPost.update({ where: { id: postId }, data: { isPinned: false } });
  }

  async like(postId: string) {
    await this.prisma.$executeRaw`UPDATE channel_posts SET "likesCount" = "likesCount" + 1 WHERE id = ${postId}`;
    return { liked: true };
  }

  async unlike(postId: string) {
    await this.prisma.$executeRaw`UPDATE channel_posts SET "likesCount" = GREATEST("likesCount" - 1, 0) WHERE id = ${postId}`;
    return { unliked: true };
  }
}
```

### 3. `apps/api/src/modules/channel-posts/channel-posts.controller.ts`
```typescript
import { Controller, Get, Post, Delete, Patch, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ChannelPostsService } from './channel-posts.service';
import { CreateChannelPostDto } from './dto/create-channel-post.dto';

@ApiTags('Channel Community Posts')
@Controller('channel-posts')
export class ChannelPostsController {
  constructor(private channelPosts: ChannelPostsService) {}

  @Post(':channelId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create community post' })
  async create(@Param('channelId') channelId: string, @CurrentUser('id') userId: string, @Body() dto: CreateChannelPostDto) {
    return this.channelPosts.create(channelId, userId, dto);
  }

  @Get('channel/:channelId')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get channel community feed' })
  async getFeed(@Param('channelId') channelId: string, @Query('cursor') cursor?: string) {
    return this.channelPosts.getFeed(channelId, cursor);
  }

  @Get(':id')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get community post' })
  async getById(@Param('id') id: string) {
    return this.channelPosts.getById(id);
  }

  @Delete(':id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete community post' })
  async delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.channelPosts.delete(id, userId);
  }

  @Patch(':id/pin')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Pin post' })
  async pin(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.channelPosts.pin(id, userId);
  }

  @Delete(':id/pin')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unpin post' })
  async unpin(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.channelPosts.unpin(id, userId);
  }

  @Post(':id/like')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Like post' })
  async like(@Param('id') id: string) {
    return this.channelPosts.like(id);
  }

  @Delete(':id/like')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unlike post' })
  async unlike(@Param('id') id: string) {
    return this.channelPosts.unlike(id);
  }
}
```

### 4. `apps/api/src/modules/channel-posts/channel-posts.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { ChannelPostsService } from './channel-posts.service';
import { ChannelPostsController } from './channel-posts.controller';

@Module({
  controllers: [ChannelPostsController],
  providers: [ChannelPostsService],
  exports: [ChannelPostsService],
})
export class ChannelPostsModule {}
```

### 5. `apps/api/src/modules/channel-posts/channel-posts.service.spec.ts`
```typescript
import { Test } from '@nestjs/testing';
import { ChannelPostsService } from './channel-posts.service';
import { PrismaService } from '../../config/prisma.service';
import { ForbiddenException } from '@nestjs/common';

describe('ChannelPostsService', () => {
  let service: ChannelPostsService;
  let prisma: Record<string, any>;
  beforeEach(async () => {
    prisma = {
      channel: { findUnique: jest.fn() },
      channelPost: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      $executeRaw: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [ChannelPostsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ChannelPostsService);
  });

  it('creates post for channel owner', async () => {
    prisma.channel.findUnique.mockResolvedValue({ id: 'ch1', userId: 'user1' });
    prisma.channelPost.create.mockResolvedValue({ id: 'cp1' });
    const result = await service.create('ch1', 'user1', { content: 'Hello' });
    expect(result.id).toBe('cp1');
  });

  it('rejects non-owner', async () => {
    prisma.channel.findUnique.mockResolvedValue({ id: 'ch1', userId: 'other' });
    await expect(service.create('ch1', 'user1', { content: 'Hello' })).rejects.toThrow(ForbiddenException);
  });
});
```

---

## Agent 7: Audio Tracks Module

**Goal:** Full NestJS module for TikTok-style sound library using `AudioTrack` model.

**Schema:** `AudioTrack: id, title, artist, duration, audioUrl, coverUrl, reelsCount, isOriginal`

**Files to CREATE:**

### 1. `apps/api/src/modules/audio-tracks/dto/create-audio-track.dto.ts`
```typescript
import { IsString, IsOptional, IsNumber, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAudioTrackDto {
  @ApiProperty() @IsString() @MaxLength(200) title: string;
  @ApiProperty() @IsString() @MaxLength(100) artist: string;
  @ApiProperty() @IsNumber() duration: number;
  @ApiProperty() @IsString() audioUrl: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() coverUrl?: string;
  @ApiProperty({ default: false }) @IsBoolean() @IsOptional() isOriginal?: boolean;
}
```

### 2. `apps/api/src/modules/audio-tracks/audio-tracks.service.ts`
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class AudioTracksService {
  constructor(private prisma: PrismaService) {}

  async create(data: { title: string; artist: string; duration: number; audioUrl: string; coverUrl?: string; isOriginal?: boolean }) {
    return this.prisma.audioTrack.create({ data: { ...data, isOriginal: data.isOriginal ?? false } });
  }

  async getById(trackId: string) {
    const track = await this.prisma.audioTrack.findUnique({ where: { id: trackId } });
    if (!track) throw new NotFoundException('Audio track not found');
    return track;
  }

  async search(query: string, limit = 20) {
    return this.prisma.audioTrack.findMany({
      where: { OR: [{ title: { contains: query, mode: 'insensitive' } }, { artist: { contains: query, mode: 'insensitive' } }] },
      orderBy: { reelsCount: 'desc' },
      take: limit,
    });
  }

  async trending(limit = 20) {
    return this.prisma.audioTrack.findMany({ orderBy: { reelsCount: 'desc' }, take: limit });
  }

  async getReelsUsingTrack(trackId: string, cursor?: string, limit = 20) {
    const reels = await this.prisma.reel.findMany({
      where: { audioTrackId: trackId, isRemoved: false, ...(cursor ? { id: { lt: cursor } } : {}) },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
      orderBy: { viewsCount: 'desc' },
      take: limit + 1,
    });
    const hasMore = reels.length > limit;
    if (hasMore) reels.pop();
    return { data: reels, meta: { cursor: reels[reels.length - 1]?.id ?? null, hasMore } };
  }

  async incrementUsage(trackId: string) {
    await this.prisma.$executeRaw`UPDATE audio_tracks SET "reelsCount" = "reelsCount" + 1 WHERE id = ${trackId}`;
  }

  async delete(trackId: string) {
    await this.prisma.audioTrack.delete({ where: { id: trackId } });
    return { deleted: true };
  }
}
```

### 3. `apps/api/src/modules/audio-tracks/audio-tracks.controller.ts`
```typescript
import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { AudioTracksService } from './audio-tracks.service';
import { CreateAudioTrackDto } from './dto/create-audio-track.dto';

@ApiTags('Audio Tracks')
@Controller('audio-tracks')
export class AudioTracksController {
  constructor(private audioTracks: AudioTracksService) {}

  @Post() @UseGuards(ClerkAuthGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Create audio track' })
  async create(@Body() dto: CreateAudioTrackDto) { return this.audioTracks.create(dto); }

  @Get('trending') @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Trending tracks' })
  async trending() { return this.audioTracks.trending(); }

  @Get('search') @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Search tracks' })
  async search(@Query('q') q: string) { return this.audioTracks.search(q); }

  @Get(':id') @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get track' })
  async getById(@Param('id') id: string) { return this.audioTracks.getById(id); }

  @Get(':id/reels') @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Reels using track' })
  async reels(@Param('id') id: string, @Query('cursor') cursor?: string) { return this.audioTracks.getReelsUsingTrack(id, cursor); }

  @Delete(':id') @UseGuards(ClerkAuthGuard) @ApiBearerAuth() @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete track' })
  async delete(@Param('id') id: string) { return this.audioTracks.delete(id); }
}
```

### 4. `apps/api/src/modules/audio-tracks/audio-tracks.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { AudioTracksService } from './audio-tracks.service';
import { AudioTracksController } from './audio-tracks.controller';

@Module({
  controllers: [AudioTracksController],
  providers: [AudioTracksService],
  exports: [AudioTracksService],
})
export class AudioTracksModule {}
```

### 5. `apps/api/src/modules/audio-tracks/audio-tracks.service.spec.ts`
```typescript
import { Test } from '@nestjs/testing';
import { AudioTracksService } from './audio-tracks.service';
import { PrismaService } from '../../config/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('AudioTracksService', () => {
  let service: AudioTracksService;
  let prisma: Record<string, any>;
  beforeEach(async () => {
    prisma = { audioTrack: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), delete: jest.fn() }, reel: { findMany: jest.fn() }, $executeRaw: jest.fn() };
    const module = await Test.createTestingModule({ providers: [AudioTracksService, { provide: PrismaService, useValue: prisma }] }).compile();
    service = module.get(AudioTracksService);
  });
  it('creates track', async () => { prisma.audioTrack.create.mockResolvedValue({ id: 'at1' }); const r = await service.create({ title: 'T', artist: 'A', duration: 30, audioUrl: 'u' }); expect(r.id).toBe('at1'); });
  it('throws NotFoundException', async () => { prisma.audioTrack.findUnique.mockResolvedValue(null); await expect(service.getById('bad')).rejects.toThrow(NotFoundException); });
});
```

---

## Agent 8: Feed Intelligence Module

**Goal:** NestJS module for feed algorithm signals using `FeedDismissal` and `FeedInteraction` models.

**Files to CREATE:**

### 1. `apps/api/src/modules/feed/dto/log-interaction.dto.ts`
```typescript
import { IsString, IsOptional, IsNumber, IsBoolean, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LogInteractionDto {
  @ApiProperty() @IsString() postId: string;
  @ApiProperty({ enum: ['SAF', 'BAKRA', 'MAJLIS', 'MINBAR'] }) @IsEnum(['SAF', 'BAKRA', 'MAJLIS', 'MINBAR']) space: string;
  @IsBoolean() @IsOptional() viewed?: boolean;
  @IsNumber() @IsOptional() viewDurationMs?: number;
  @IsNumber() @IsOptional() completionRate?: number;
  @IsBoolean() @IsOptional() liked?: boolean;
  @IsBoolean() @IsOptional() commented?: boolean;
  @IsBoolean() @IsOptional() shared?: boolean;
  @IsBoolean() @IsOptional() saved?: boolean;
}
```

### 2. `apps/api/src/modules/feed/feed.service.ts`
```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ContentSpace } from '@prisma/client';

@Injectable()
export class FeedService {
  constructor(private prisma: PrismaService) {}

  async logInteraction(userId: string, data: { postId: string; space: string; viewed?: boolean; viewDurationMs?: number; completionRate?: number; liked?: boolean; commented?: boolean; shared?: boolean; saved?: boolean }) {
    return this.prisma.feedInteraction.upsert({
      where: { userId_postId: { userId, postId: data.postId } } as any,
      update: { viewed: data.viewed, viewDurationMs: data.viewDurationMs, completionRate: data.completionRate, liked: data.liked, commented: data.commented, shared: data.shared, saved: data.saved },
      create: { userId, postId: data.postId, space: data.space as ContentSpace, viewed: data.viewed ?? false, viewDurationMs: data.viewDurationMs ?? 0, completionRate: data.completionRate, liked: data.liked ?? false, commented: data.commented ?? false, shared: data.shared ?? false, saved: data.saved ?? false },
    });
  }

  async dismiss(userId: string, contentId: string, contentType: string) {
    return this.prisma.feedDismissal.upsert({
      where: { userId_contentId_contentType: { userId, contentId, contentType } },
      update: {},
      create: { userId, contentId, contentType },
    });
  }

  async getDismissedIds(userId: string, contentType: string): Promise<string[]> {
    const d = await this.prisma.feedDismissal.findMany({ where: { userId, contentType }, select: { contentId: true } });
    return d.map(x => x.contentId);
  }

  async getUserInterests(userId: string): Promise<Record<string, number>> {
    const interactions = await this.prisma.feedInteraction.findMany({ where: { userId, viewed: true }, select: { space: true, viewDurationMs: true, liked: true, commented: true, shared: true, saved: true }, orderBy: { createdAt: 'desc' }, take: 200 });
    const scores: Record<string, number> = {};
    for (const i of interactions) {
      const w = (i.liked ? 2 : 0) + (i.commented ? 3 : 0) + (i.shared ? 4 : 0) + (i.saved ? 3 : 0) + Math.min(i.viewDurationMs / 10000, 5);
      scores[i.space] = (scores[i.space] || 0) + w;
    }
    return scores;
  }

  async undismiss(userId: string, contentId: string, contentType: string) {
    await this.prisma.feedDismissal.delete({ where: { userId_contentId_contentType: { userId, contentId, contentType } } }).catch(() => {});
    return { undismissed: true };
  }
}
```

### 3. `apps/api/src/modules/feed/feed.controller.ts`
```typescript
import { Controller, Post, Delete, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FeedService } from './feed.service';
import { LogInteractionDto } from './dto/log-interaction.dto';

@ApiTags('Feed Intelligence')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('feed')
export class FeedController {
  constructor(private feed: FeedService) {}

  @Post('interaction') @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log interaction' })
  async log(@CurrentUser('id') userId: string, @Body() dto: LogInteractionDto) { return this.feed.logInteraction(userId, dto); }

  @Post('dismiss/:contentType/:contentId') @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dismiss content' })
  async dismiss(@CurrentUser('id') userId: string, @Param('contentType') t: string, @Param('contentId') id: string) { return this.feed.dismiss(userId, id, t); }

  @Delete('dismiss/:contentType/:contentId') @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Undismiss' })
  async undismiss(@CurrentUser('id') userId: string, @Param('contentType') t: string, @Param('contentId') id: string) { return this.feed.undismiss(userId, id, t); }
}
```

### 4. `apps/api/src/modules/feed/feed.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { FeedService } from './feed.service';
import { FeedController } from './feed.controller';

@Module({ controllers: [FeedController], providers: [FeedService], exports: [FeedService] })
export class FeedModule {}
```

### 5. `apps/api/src/modules/feed/feed.service.spec.ts`
```typescript
import { Test } from '@nestjs/testing';
import { FeedService } from './feed.service';
import { PrismaService } from '../../config/prisma.service';

describe('FeedService', () => {
  let service: FeedService;
  let prisma: Record<string, any>;
  beforeEach(async () => {
    prisma = { feedInteraction: { upsert: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() }, feedDismissal: { upsert: jest.fn(), findMany: jest.fn(), delete: jest.fn() }, post: { findMany: jest.fn() } };
    const module = await Test.createTestingModule({ providers: [FeedService, { provide: PrismaService, useValue: prisma }] }).compile();
    service = module.get(FeedService);
  });
  it('logs interaction', async () => { prisma.feedInteraction.upsert.mockResolvedValue({ id: 'fi1' }); await service.logInteraction('u1', { postId: 'p1', space: 'SAF', viewed: true }); expect(prisma.feedInteraction.upsert).toHaveBeenCalled(); });
  it('dismisses content', async () => { prisma.feedDismissal.upsert.mockResolvedValue({}); await service.dismiss('u1', 'p1', 'post'); expect(prisma.feedDismissal.upsert).toHaveBeenCalled(); });
  it('returns dismissed IDs', async () => { prisma.feedDismissal.findMany.mockResolvedValue([{ contentId: 'p1' }]); const ids = await service.getDismissedIds('u1', 'post'); expect(ids).toEqual(['p1']); });
});
```

---

## Agent 9: @Mention Notifications (Batch 20 Carry-over)

**Goal:** Fire MENTION notifications when posts/threads/reels are created with `mentions[]`.

**Files to MODIFY:**

### 1. `apps/api/src/modules/posts/posts.service.ts`
Read full file. Find `create()` method. Check if `NotificationsService` is injected. If not:
- Add `import { NotificationsService } from '../notifications/notifications.service';` at top
- Add `private notifications: NotificationsService` to constructor

After post creation (after transaction, before return), add:
```typescript
if (dto.mentions?.length) {
  const [mentionedUsers, actor] = await Promise.all([
    this.prisma.user.findMany({ where: { username: { in: dto.mentions } }, select: { id: true } }),
    this.prisma.user.findUnique({ where: { id: userId }, select: { username: true } }),
  ]);
  for (const mentioned of mentionedUsers) {
    if (mentioned.id !== userId) {
      this.notifications.create({ userId: mentioned.id, actorId: userId, type: 'MENTION', postId: post.id, title: 'Mentioned you', body: `@${actor?.username ?? 'Someone'} mentioned you in a post` });
    }
  }
}
```

Update `apps/api/src/modules/posts/posts.module.ts`: Add `NotificationsModule` to imports if missing.

### 2. `apps/api/src/modules/threads/threads.service.ts`
Same pattern in `create()`. Use `threadId: thread.id` and `"mentioned you in a thread"`.
Update `threads.module.ts` with `NotificationsModule`.

### 3. `apps/api/src/modules/reels/reels.service.ts`
Same pattern in `create()`. Use `reelId: reel.id` and `"mentioned you in a reel"`.
Update `reels.module.ts` with `NotificationsModule`.

**Verification:** `cd apps/api && npx tsc --noEmit`

---

## Agent 10: Message Enhancements

**Goal:** Add search, forward, delivery tracking, and media gallery to messages.

**Files to MODIFY:** `apps/api/src/modules/messages/messages.service.ts` and `messages.controller.ts`

Read both files. Add to **service** (end of class):

```typescript
async searchMessages(conversationId: string, userId: string, query: string, cursor?: string, limit = 20) {
  await this.requireMembership(conversationId, userId);
  const messages = await this.prisma.message.findMany({
    where: { conversationId, isDeleted: false, content: { contains: query, mode: 'insensitive' }, ...(cursor ? { id: { lt: cursor } } : {}) },
    include: { sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  });
  const hasMore = messages.length > limit;
  if (hasMore) messages.pop();
  return { data: messages, meta: { cursor: messages[messages.length - 1]?.id ?? null, hasMore } };
}

async forwardMessage(messageId: string, userId: string, targetConversationIds: string[]) {
  const original = await this.prisma.message.findUnique({ where: { id: messageId }, select: { content: true, messageType: true, mediaUrl: true, mediaType: true, voiceDuration: true, fileName: true, fileSize: true } });
  if (!original) throw new NotFoundException('Message not found');
  const results = [];
  for (const convId of targetConversationIds) {
    await this.requireMembership(convId, userId);
    const msg = await this.prisma.message.create({
      data: { conversationId: convId, senderId: userId, content: original.content, messageType: original.messageType, mediaUrl: original.mediaUrl, mediaType: original.mediaType, voiceDuration: original.voiceDuration, fileName: original.fileName, fileSize: original.fileSize, isForwarded: true, forwardedFromId: messageId },
    });
    results.push(msg);
    await this.prisma.conversation.update({ where: { id: convId }, data: { lastMessageText: original.content ?? '[Forwarded]', lastMessageAt: new Date(), lastMessageById: userId } });
  }
  return results;
}

async markDelivered(messageId: string, userId: string) {
  return this.prisma.message.update({ where: { id: messageId }, data: { deliveredAt: new Date() } });
}

async getMediaGallery(conversationId: string, userId: string, cursor?: string, limit = 30) {
  await this.requireMembership(conversationId, userId);
  const messages = await this.prisma.message.findMany({
    where: { conversationId, isDeleted: false, messageType: { in: ['IMAGE', 'VIDEO'] }, ...(cursor ? { id: { lt: cursor } } : {}) },
    select: { id: true, mediaUrl: true, mediaType: true, messageType: true, createdAt: true, senderId: true },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  });
  const hasMore = messages.length > limit;
  if (hasMore) messages.pop();
  return { data: messages, meta: { cursor: messages[messages.length - 1]?.id ?? null, hasMore } };
}
```

Add to **controller** (ensure `HttpCode`, `HttpStatus`, `NotFoundException` imported):
```typescript
@Get(':conversationId/search')
@UseGuards(ClerkAuthGuard) @ApiBearerAuth()
@ApiOperation({ summary: 'Search messages' })
async searchMessages(@Param('conversationId') cid: string, @CurrentUser('id') uid: string, @Query('q') q: string, @Query('cursor') cursor?: string) {
  return this.messages.searchMessages(cid, uid, q, cursor);
}

@Post('forward/:messageId')
@UseGuards(ClerkAuthGuard) @ApiBearerAuth() @HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Forward message' })
async forward(@Param('messageId') mid: string, @CurrentUser('id') uid: string, @Body('conversationIds') cids: string[]) {
  return this.messages.forwardMessage(mid, uid, cids);
}

@Post(':messageId/delivered')
@UseGuards(ClerkAuthGuard) @ApiBearerAuth() @HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Mark delivered' })
async delivered(@Param('messageId') mid: string, @CurrentUser('id') uid: string) {
  return this.messages.markDelivered(mid, uid);
}

@Get(':conversationId/media')
@UseGuards(ClerkAuthGuard) @ApiBearerAuth()
@ApiOperation({ summary: 'Media gallery' })
async media(@Param('conversationId') cid: string, @CurrentUser('id') uid: string, @Query('cursor') cursor?: string) {
  return this.messages.getMediaGallery(cid, uid, cursor);
}
```

---

## Agent 11: Story Enhancements

**Goal:** Add interactive sticker responses and summary to stories module.

**Files to MODIFY:** `apps/api/src/modules/stories/stories.service.ts` and `stories.controller.ts`

Add to **service** (end of class):
```typescript
async submitStickerResponse(storyId: string, userId: string, stickerType: string, responseData: Record<string, unknown>) {
  const story = await this.prisma.story.findUnique({ where: { id: storyId } });
  if (!story) throw new NotFoundException('Story not found');
  const existing = await this.prisma.storyStickerResponse.findFirst({ where: { storyId, userId, stickerType } });
  if (existing) {
    return this.prisma.storyStickerResponse.update({ where: { id: existing.id }, data: { responseData: responseData as object } });
  }
  return this.prisma.storyStickerResponse.create({ data: { storyId, userId, stickerType, responseData: responseData as object } });
}

async getStickerResponses(storyId: string, ownerId: string, stickerType?: string) {
  const story = await this.prisma.story.findUnique({ where: { id: storyId } });
  if (!story || story.userId !== ownerId) throw new ForbiddenException('Only story owner can view responses');
  return this.prisma.storyStickerResponse.findMany({
    where: { storyId, ...(stickerType ? { stickerType } : {}) },
    include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

async getStickerSummary(storyId: string, ownerId: string) {
  const story = await this.prisma.story.findUnique({ where: { id: storyId } });
  if (!story || story.userId !== ownerId) throw new ForbiddenException();
  const responses = await this.prisma.storyStickerResponse.findMany({ where: { storyId }, select: { stickerType: true, responseData: true } });
  const summary: Record<string, Record<string, number>> = {};
  for (const r of responses) {
    if (!summary[r.stickerType]) summary[r.stickerType] = {};
    const data = r.responseData as Record<string, string>;
    const answer = data.answer ?? data.option ?? 'unknown';
    summary[r.stickerType][answer] = (summary[r.stickerType][answer] || 0) + 1;
  }
  return summary;
}
```

Add to **controller**:
```typescript
@Post(':id/sticker-response')
@UseGuards(ClerkAuthGuard) @ApiBearerAuth() @HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Submit sticker response' })
async submitStickerResponse(@Param('id') id: string, @CurrentUser('id') uid: string, @Body() body: { stickerType: string; responseData: Record<string, unknown> }) {
  return this.stories.submitStickerResponse(id, uid, body.stickerType, body.responseData);
}

@Get(':id/sticker-responses')
@UseGuards(ClerkAuthGuard) @ApiBearerAuth()
@ApiOperation({ summary: 'Get sticker responses' })
async getStickerResponses(@Param('id') id: string, @CurrentUser('id') uid: string, @Query('type') type?: string) {
  return this.stories.getStickerResponses(id, uid, type);
}

@Get(':id/sticker-summary')
@UseGuards(ClerkAuthGuard) @ApiBearerAuth()
@ApiOperation({ summary: 'Get sticker summary' })
async getStickerSummary(@Param('id') id: string, @CurrentUser('id') uid: string) {
  return this.stories.getStickerSummary(id, uid);
}
```

Ensure `HttpCode`, `HttpStatus`, `ForbiddenException` are imported.

---

## Agent 12: Chat Gateway Enhancements

**Goal:** Add call signaling and delivery receipts to chat gateway.

**File to MODIFY:** `apps/api/src/gateways/chat.gateway.ts`

Read full file. Add these handlers inside the gateway class:

```typescript
@SubscribeMessage('call_initiate')
async handleCallInitiate(@ConnectedSocket() client: Socket, @MessageBody() data: { targetUserId: string; callType: string; sessionId: string }) {
  const targetSockets = this.onlineUsers.get(data.targetUserId);
  if (targetSockets) {
    for (const socketId of targetSockets) {
      this.server.to(socketId).emit('incoming_call', { sessionId: data.sessionId, callType: data.callType, callerId: client.data.userId });
    }
  }
}

@SubscribeMessage('call_answer')
async handleCallAnswer(@ConnectedSocket() client: Socket, @MessageBody() data: { sessionId: string; callerId: string }) {
  const callerSockets = this.onlineUsers.get(data.callerId);
  if (callerSockets) { for (const s of callerSockets) { this.server.to(s).emit('call_answered', { sessionId: data.sessionId, answeredBy: client.data.userId }); } }
}

@SubscribeMessage('call_reject')
async handleCallReject(@ConnectedSocket() client: Socket, @MessageBody() data: { sessionId: string; callerId: string }) {
  const callerSockets = this.onlineUsers.get(data.callerId);
  if (callerSockets) { for (const s of callerSockets) { this.server.to(s).emit('call_rejected', { sessionId: data.sessionId, rejectedBy: client.data.userId }); } }
}

@SubscribeMessage('call_end')
async handleCallEnd(@ConnectedSocket() client: Socket, @MessageBody() data: { sessionId: string; participants: string[] }) {
  for (const pid of data.participants) {
    const sockets = this.onlineUsers.get(pid);
    if (sockets) { for (const s of sockets) { this.server.to(s).emit('call_ended', { sessionId: data.sessionId, endedBy: client.data.userId }); } }
  }
}

@SubscribeMessage('call_signal')
async handleCallSignal(@ConnectedSocket() client: Socket, @MessageBody() data: { targetUserId: string; signal: unknown }) {
  const targetSockets = this.onlineUsers.get(data.targetUserId);
  if (targetSockets) { for (const s of targetSockets) { this.server.to(s).emit('call_signal', { fromUserId: client.data.userId, signal: data.signal }); } }
}

@SubscribeMessage('message_delivered')
async handleMessageDelivered(@ConnectedSocket() client: Socket, @MessageBody() data: { messageId: string; conversationId: string }) {
  this.prisma.message.update({ where: { id: data.messageId }, data: { deliveredAt: new Date() } }).catch(() => {});
  this.server.to(data.conversationId).emit('delivery_receipt', { messageId: data.messageId, deliveredAt: new Date().toISOString(), deliveredTo: client.data.userId });
}
```

Ensure `SubscribeMessage`, `ConnectedSocket`, `MessageBody` are imported from `@nestjs/websockets`.

**Also update** `apps/api/src/gateways/chat.gateway.spec.ts` — add tests for call signaling and delivery receipts (see spec patterns from existing tests in the file).

---

## Agent 13: Broadcast Channels Mobile UI

**Goal:** Create two new screens for Telegram-style broadcast channel browsing and viewing.

**Files to CREATE:**

### 1. `apps/mobile/app/(screens)/broadcast-channels.tsx`

Full screen: discover channels, search, my subscriptions. Use `broadcastApi` from api.ts (Agent 27 adds it).

Until Agent 27 integrates, define inline API calls:
```tsx
import { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { TabSelector } from '@/components/ui/TabSelector';
import { colors, spacing, fontSize, radius } from '@/theme';
import { formatDistanceToNowStrict } from 'date-fns';

type BroadcastChannel = {
  id: string; name: string; slug: string; description?: string; avatarUrl?: string;
  subscribersCount: number; postsCount: number; role?: string; isMuted?: boolean;
};

// Agent 27 will wire these to broadcastApi — for now use inline fetch via api instance
import api from '@/services/api';

const TABS = ['Discover', 'My Channels'];

export default function BroadcastChannelsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { data: discover, isLoading: discoverLoading } = useQuery({
    queryKey: ['broadcast-discover'],
    queryFn: async () => {
      const res = await fetch('/api/v1/broadcast/discover');
      return res.json();
    },
    enabled: activeTab === 0,
  });

  const { data: myChannels, isLoading: myLoading } = useQuery({
    queryKey: ['broadcast-my'],
    queryFn: async () => {
      const res = await fetch('/api/v1/broadcast/my');
      return res.json();
    },
    enabled: activeTab === 1,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: activeTab === 0 ? ['broadcast-discover'] : ['broadcast-my'] });
    setRefreshing(false);
  }, [activeTab, queryClient]);

  const channels = activeTab === 0 ? (discover?.data ?? []) : (myChannels ?? []);
  const loading = activeTab === 0 ? discoverLoading : myLoading;

  const renderChannel = ({ item }: { item: BroadcastChannel }) => (
    <Pressable
      style={styles.channelRow}
      onPress={() => router.push(`/(screens)/broadcast/${item.id}` as any)}
      accessibilityRole="button"
      accessibilityLabel={`Channel: ${item.name}`}
    >
      <Avatar uri={item.avatarUrl ?? null} name={item.name} size="lg" />
      <View style={styles.channelInfo}>
        <Text style={styles.channelName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.channelDesc} numberOfLines={2}>{item.description ?? 'No description'}</Text>
        <Text style={styles.channelMeta}>{item.subscribersCount.toLocaleString()} subscribers · {item.postsCount} posts</Text>
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Icon name="arrow-left" size="md" color={colors.text.primary} /></Pressable>
        <Text style={styles.headerTitle}>Channels</Text>
        <View style={{ width: 24 }} />
      </View>

      <TabSelector tabs={TABS} activeIndex={activeTab} onTabPress={setActiveTab} />

      {loading ? (
        <View style={styles.skeletons}>{Array.from({ length: 6 }).map((_, i) => <Skeleton.Rect key={i} width="100%" height={80} borderRadius={radius.md} style={{ marginBottom: spacing.sm }} />)}</View>
      ) : channels.length === 0 ? (
        <EmptyState icon="hash" title={activeTab === 0 ? 'No channels yet' : 'No subscriptions'} subtitle={activeTab === 0 ? 'Channels will appear here' : 'Subscribe to channels to see them here'} />
      ) : (
        <FlatList
          data={channels}
          keyExtractor={(item: BroadcastChannel) => item.id}
          renderItem={renderChannel}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.sm, borderBottomWidth: 0.5, borderBottomColor: colors.dark.border },
  headerTitle: { color: colors.text.primary, fontSize: fontSize.md, fontWeight: '700' },
  list: { padding: spacing.base },
  skeletons: { padding: spacing.base },
  channelRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.dark.border },
  channelInfo: { flex: 1, marginLeft: spacing.md },
  channelName: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  channelDesc: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 2 },
  channelMeta: { color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: 4 },
});
```

### 2. `apps/mobile/app/(screens)/broadcast/[id].tsx`

Channel detail with message feed, subscribe button, pinned messages:
```tsx
import { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { RichText } from '@/components/ui/RichText';
import { colors, spacing, fontSize, radius } from '@/theme';
import { formatDistanceToNowStrict } from 'date-fns';

type BroadcastMsg = {
  id: string; content?: string; messageType: string; mediaUrl?: string;
  isPinned: boolean; viewsCount: number; createdAt: string;
  sender: { id: string; username: string; displayName: string; avatarUrl?: string };
};

export default function BroadcastChannelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: channel, isLoading: channelLoading } = useQuery({
    queryKey: ['broadcast-channel', id],
    queryFn: async () => { /* broadcastApi.getById(id) */ return null; },
  });

  const { data: messages, isLoading: msgsLoading } = useQuery({
    queryKey: ['broadcast-messages', id],
    queryFn: async () => { /* broadcastApi.getMessages(id) */ return { data: [] }; },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['broadcast-channel', id] }),
      queryClient.invalidateQueries({ queryKey: ['broadcast-messages', id] }),
    ]);
    setRefreshing(false);
  }, [id, queryClient]);

  const renderMessage = ({ item }: { item: BroadcastMsg }) => (
    <View style={[styles.msgCard, item.isPinned && styles.pinnedCard]}>
      {item.isPinned && (
        <View style={styles.pinnedBadge}>
          <Icon name="map-pin" size="xs" color={colors.gold} />
          <Text style={styles.pinnedText}>Pinned</Text>
        </View>
      )}
      <View style={styles.msgHeader}>
        <Avatar uri={item.sender.avatarUrl ?? null} name={item.sender.displayName} size="sm" />
        <Text style={styles.msgSender}>{item.sender.displayName}</Text>
        <Text style={styles.msgTime}>{formatDistanceToNowStrict(new Date(item.createdAt), { addSuffix: true })}</Text>
      </View>
      {item.content && <RichText content={item.content} />}
      <View style={styles.msgFooter}>
        <Icon name="eye" size="xs" color={colors.text.tertiary} />
        <Text style={styles.viewCount}>{item.viewsCount.toLocaleString()}</Text>
      </View>
    </View>
  );

  const loading = channelLoading || msgsLoading;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Icon name="arrow-left" size="md" color={colors.text.primary} /></Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{(channel as any)?.name ?? 'Channel'}</Text>
        <Pressable hitSlop={8}><Icon name="more-horizontal" size="md" color={colors.text.primary} /></Pressable>
      </View>

      {loading ? (
        <View style={styles.skeletons}>{Array.from({ length: 4 }).map((_, i) => <Skeleton.Rect key={i} width="100%" height={120} borderRadius={radius.md} style={{ marginBottom: spacing.sm }} />)}</View>
      ) : (messages?.data ?? []).length === 0 ? (
        <EmptyState icon="message-circle" title="No messages yet" subtitle="Channel messages will appear here" />
      ) : (
        <FlatList
          data={messages?.data ?? []}
          keyExtractor={(item: BroadcastMsg) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.sm, borderBottomWidth: 0.5, borderBottomColor: colors.dark.border },
  headerTitle: { color: colors.text.primary, fontSize: fontSize.md, fontWeight: '700', flex: 1, textAlign: 'center' },
  list: { padding: spacing.base },
  skeletons: { padding: spacing.base },
  msgCard: { backgroundColor: colors.dark.bgCard, borderRadius: radius.md, padding: spacing.base, marginBottom: spacing.sm },
  pinnedCard: { borderWidth: 1, borderColor: colors.gold },
  pinnedBadge: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs, gap: 4 },
  pinnedText: { color: colors.gold, fontSize: fontSize.xs, fontWeight: '600' },
  msgHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  msgSender: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '600', flex: 1 },
  msgTime: { color: colors.text.tertiary, fontSize: fontSize.xs },
  msgFooter: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
  viewCount: { color: colors.text.tertiary, fontSize: fontSize.xs },
});
```

---

## Agent 14: Live Stream Mobile UI

**Goal:** Two screens: go-live creation and live viewer.

**Files to CREATE:**

### 1. `apps/mobile/app/(screens)/go-live.tsx`
Complete screen with title, description, type selection (video/audio space), schedule option, go live button. ~300 lines. Follow exact same patterns as create-post.tsx (SafeAreaView, header with back button, form inputs, mutation for API call). Use `liveApi.create()` (Agent 27). Include `<EmptyState>` for empty states, `<Skeleton>` for loading.

### 2. `apps/mobile/app/(screens)/live/[id].tsx`
Live viewer screen: shows stream info, viewer count, participant avatars, chat overlay, raise hand button for audio spaces. ~400 lines. Use `liveApi.getById()`, `liveApi.join()`, `liveApi.leave()`. Follow same patterns as video/[id].tsx.

**Both screens MUST follow all CLAUDE.md quality rules.** See `create-post.tsx` and `video/[id].tsx` for reference patterns.

---

## Agent 15: Call Screen Mobile UI

**Goal:** Full-screen call UI for voice and video calls.

**File to CREATE:** `apps/mobile/app/(screens)/call/[id].tsx`

~350 lines. Shows:
- Caller/callee avatar (large, centered)
- Call status text (Ringing... / Connected / Call Ended)
- Call duration timer (MM:SS)
- Control buttons: mute, speaker, end call (red), flip camera (video only)
- Incoming call: answer (green) + decline (red) buttons
- Use `callsApi` (Agent 27), socket events from Agent 12

Pattern: SafeAreaView with dark background, centered layout. Use `useEffect` cleanup to leave call on unmount.

---

## Agent 16: Sticker Picker Component

**Goal:** Reusable sticker picker for chat with pack browsing.

**Files to CREATE:**

### 1. `apps/mobile/src/components/risalah/StickerPicker.tsx`
~250 lines. Bottom sheet with:
- Tab bar showing owned sticker pack icons
- Grid of stickers (3 columns) from active pack
- "Add more" button → opens StickerPackBrowser
- `onStickerSelect(url: string)` callback prop
- Recently used section at top

### 2. `apps/mobile/src/components/risalah/StickerPackBrowser.tsx`
~200 lines. Full-screen browser:
- Featured packs section
- Search input
- Pack cards with preview, name, sticker count, add/remove button
- Uses `stickersApi` (Agent 27)

Both components follow BottomSheet pattern from CLAUDE.md.

---

## Agent 17: Close Friends Screen

**Goal:** Manage close friends list for story sharing.

**File to CREATE:** `apps/mobile/app/(screens)/close-friends.tsx`

~250 lines. Shows:
- Current close friends list with remove button
- Search to add new friends
- Toggle switch for each follower
- Header with back button and count badge
- Uses `followsApi.getFollowers()` for follower list
- Stores close friends list locally (AsyncStorage) until backend endpoint exists
- RefreshControl, EmptyState, Skeleton for loading

---

## Agent 18: Pinned & Starred Messages Screens

**Goal:** Two screens to view pinned and starred messages within a conversation.

**Files to CREATE:**

### 1. `apps/mobile/app/(screens)/pinned-messages.tsx`
~180 lines. Receives `conversationId` param. Shows pinned messages list. Uses `messagesApi` (search with pin filter when available). Back button, EmptyState if none, RefreshControl.

### 2. `apps/mobile/app/(screens)/starred-messages.tsx`
~180 lines. Same pattern for starred/saved messages. Shows messages the user has starred (reactions with ⭐ emoji).

---

## Agent 19: Image Lightbox Component

**Goal:** Full-screen image viewer with pinch-to-zoom and swipe-through carousel.

**File to CREATE:** `apps/mobile/src/components/ui/ImageLightbox.tsx`

~300 lines. Props:
```typescript
interface ImageLightboxProps {
  visible: boolean;
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}
```

Features:
- Full-screen modal overlay (dark background, NOT RN Modal — use absolute positioning with Portal pattern or `react-native-gesture-handler`)
- Pinch-to-zoom using `react-native-gesture-handler` PinchGestureHandler + Reanimated
- Horizontal swipe between images (FlatList with pagingEnabled)
- Page indicator dots
- Close button (X icon, top-right)
- Double-tap to zoom in/out
- Share button

---

## Agent 20: Advanced Video Player Component

**Goal:** Full-featured video player with controls overlay.

**File to CREATE:** `apps/mobile/src/components/ui/VideoPlayer.tsx`

~350 lines. Props:
```typescript
interface VideoPlayerProps {
  uri: string;
  thumbnailUrl?: string;
  duration?: number;
  autoPlay?: boolean;
  onProgress?: (progress: number) => void;
  onComplete?: () => void;
}
```

Features:
- Play/pause overlay button
- Seek bar (Slider) with buffered progress
- Current time / total time display
- Fullscreen toggle
- Playback speed selector (0.5x, 1x, 1.25x, 1.5x, 2x) via BottomSheet
- Volume control
- 10s forward/backward skip buttons
- Auto-hide controls after 3 seconds of inactivity
- Uses `expo-av` Video component
- Loading skeleton while buffering

---

## Agent 21: Collab Requests Screen

**Goal:** Screen to manage incoming and accepted post collaboration requests.

**File to CREATE:** `apps/mobile/app/(screens)/collab-requests.tsx`

~280 lines. Shows:
- TabSelector: Pending / Accepted
- Pending tab: list of incoming collab invites with Accept/Decline buttons
- Accepted tab: list of posts user is collaborating on
- Post preview card for each collab (thumbnail + content snippet)
- Uses `collabsApi` (Agent 27)
- EmptyState, Skeleton, RefreshControl, back button

---

## Agent 22: Community Posts Screen

**Goal:** Screen to view and create YouTube-style community posts for a channel.

**File to CREATE:** `apps/mobile/app/(screens)/community-posts.tsx`

~300 lines. Receives `channelId` param. Shows:
- Community post feed (text + optional images)
- Like button with count
- Create post button (only if own channel)
- Inline compose area at top (TextInput + post button)
- Pin indicator for pinned posts
- Uses `channelPostsApi` (Agent 27)
- RefreshControl, EmptyState, Skeleton

---

## Agent 23: Conversation Screen Enhancements

**Goal:** Enhance `conversation/[id].tsx` with platform-level messaging features: read receipts with double-check marks, pinned message banner, disappearing message countdown indicator, and in-conversation media gallery button.

**File to MODIFY:** `apps/mobile/app/(screens)/conversation/[id].tsx` (1732 lines)

**IMPORTANT:** This file is EXCLUSIVELY owned by Agent 23. No other agent touches it.

### Changes Required:

#### 1. Double-Check Read Receipt Icons (replace avatar-based read receipts)
Find the existing read receipt rendering section. Add proper WhatsApp-style check marks:
- Single grey check `✓` = sent
- Double grey check `✓✓` = delivered
- Double emerald check `✓✓` = read

```tsx
// Add this component INSIDE the file, before the main component
const ReadReceiptIcon = ({ status }: { status: 'sent' | 'delivered' | 'read' }) => {
  const color = status === 'read' ? colors.emerald : colors.text.tertiary;
  return (
    <View style={{ flexDirection: 'row', marginLeft: 4 }}>
      <Icon name="check" size={12} color={color} />
      {(status === 'delivered' || status === 'read') && (
        <Icon name="check" size={12} color={color} style={{ marginLeft: -6 }} />
      )}
    </View>
  );
};
```

Add `status` derivation logic in the message rendering:
```tsx
const getMessageStatus = (msg: Message, conversationData: any): 'sent' | 'delivered' | 'read' => {
  if (msg.readBy && msg.readBy.length > 0) return 'read';
  if (msg.deliveredTo && msg.deliveredTo.length > 0) return 'delivered';
  return 'sent';
};
```

Render `<ReadReceiptIcon status={getMessageStatus(msg, data)} />` next to the timestamp on outgoing messages only.

#### 2. Pinned Message Banner
Add a pinned message banner at the top of the message list that shows the latest pinned message. Tapping it scrolls to that message.

```tsx
const [pinnedMessage, setPinnedMessage] = useState<Message | null>(null);

// Fetch pinned messages
const { data: pinnedMessages } = useQuery({
  queryKey: ['pinned-messages', conversationId],
  queryFn: () => api.get(`/messages/${conversationId}/pinned`),
  enabled: !!conversationId,
});

useEffect(() => {
  if (pinnedMessages?.length) setPinnedMessage(pinnedMessages[0]);
}, [pinnedMessages]);
```

Banner UI (render above the FlatList, below the header):
```tsx
{pinnedMessage && (
  <Pressable
    onPress={() => scrollToMessage(pinnedMessage.id)}
    style={{
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.dark.bgElevated,
      paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
      borderBottomWidth: 1, borderBottomColor: colors.dark.border,
    }}
  >
    <Icon name="map-pin" size="xs" color={colors.emerald} />
    <View style={{ flex: 1, marginLeft: spacing.sm }}>
      <Text style={{ color: colors.text.secondary, fontSize: fontSize.xs }}>
        Pinned Message
      </Text>
      <Text numberOfLines={1} style={{ color: colors.text.primary, fontSize: fontSize.sm }}>
        {pinnedMessage.content}
      </Text>
    </View>
    <Pressable onPress={() => setPinnedMessage(null)}>
      <Icon name="x" size="xs" color={colors.text.tertiary} />
    </Pressable>
  </Pressable>
)}
```

#### 3. Pin/Unpin in Message Long-Press Menu
In the existing message long-press BottomSheet, add a pin/unpin option:
```tsx
<BottomSheetItem
  label={msg.isPinned ? 'Unpin Message' : 'Pin Message'}
  icon={<Icon name="map-pin" size="sm" color={msg.isPinned ? colors.error : colors.text.primary} />}
  onPress={() => {
    if (msg.isPinned) {
      unpinMutation.mutate(msg.id);
    } else {
      pinMutation.mutate(msg.id);
    }
    setSelectedMessage(null);
  }}
/>
```

Pin/unpin mutations:
```tsx
const pinMutation = useMutation({
  mutationFn: (messageId: string) => api.post(`/messages/${messageId}/pin`),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['pinned-messages', conversationId] });
    queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
  },
});

const unpinMutation = useMutation({
  mutationFn: (messageId: string) => api.post(`/messages/${messageId}/unpin`),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['pinned-messages', conversationId] });
    queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
  },
});
```

#### 4. Disappearing Messages Indicator
Add a small timer icon on messages that are set to disappear:

```tsx
{msg.expiresAt && (
  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
    <Icon name="clock" size={10} color={colors.text.tertiary} />
    <Text style={{ color: colors.text.tertiary, fontSize: 10, marginLeft: 2 }}>
      {formatDistanceToNowStrict(new Date(msg.expiresAt), { addSuffix: false })}
    </Text>
  </View>
)}
```

#### 5. Media Gallery Button in Header
Add a button in the conversation header that navigates to a media gallery view:

In the header right section, add:
```tsx
<Pressable
  onPress={() => router.push(`/(screens)/conversation-media?id=${conversationId}`)}
  style={{ padding: spacing.sm }}
>
  <Icon name="image" size="sm" color={colors.text.primary} />
</Pressable>
```

#### 6. Star Message Action
In the message long-press BottomSheet, add star/unstar:
```tsx
<BottomSheetItem
  label={msg.isStarred ? 'Unstar' : 'Star Message'}
  icon={<Icon name="bookmark" size="sm" color={msg.isStarred ? colors.gold : colors.text.primary} />}
  onPress={() => {
    starMutation.mutate({ messageId: msg.id, starred: !msg.isStarred });
    setSelectedMessage(null);
  }}
/>
```

```tsx
const starMutation = useMutation({
  mutationFn: ({ messageId, starred }: { messageId: string; starred: boolean }) =>
    starred
      ? api.post(`/messages/${messageId}/star`)
      : api.delete(`/messages/${messageId}/star`),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
  },
});
```

---

## Agent 24: Story Creation Enhancements

**Goal:** Transform `create-story.tsx` from a basic media+text tool into a full Instagram-level story editor with filters, font picker, interactive sticker placement (polls, questions, countdowns, quizzes, location, mention, hashtag).

**File to MODIFY:** `apps/mobile/app/(screens)/create-story.tsx` (244 lines)

**IMPORTANT:** This file is EXCLUSIVELY owned by Agent 24. No other agent touches it.

### Full Rewrite Required

Replace the entire file content with the enhanced version below. The new version is ~600 lines.

```tsx
import { useState, useRef, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, TextInput, ScrollView, Dimensions, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { PanGestureHandler, PinchGestureHandler } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, useAnimatedGestureHandler,
  withSpring, runOnJS,
} from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { colors, spacing, fontSize, radius } from '@/theme';
import { storiesApi, uploadApi } from '@/services/api';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CANVAS_H = SCREEN_H * 0.7;

// ── Filter presets ──
const FILTERS = [
  { id: 'none', label: 'Normal', style: {} },
  { id: 'warm', label: 'Warm', style: { tintColor: 'rgba(255,180,100,0.15)' } },
  { id: 'cool', label: 'Cool', style: { tintColor: 'rgba(100,150,255,0.15)' } },
  { id: 'vintage', label: 'Vintage', style: { tintColor: 'rgba(200,150,80,0.2)' } },
  { id: 'noir', label: 'Noir', style: { tintColor: 'rgba(0,0,0,0.3)' } },
  { id: 'emerald', label: 'Emerald', style: { tintColor: 'rgba(10,123,79,0.15)' } },
];

// ── Font options ──
const FONTS = [
  { id: 'default', label: 'Default', fontFamily: undefined },
  { id: 'serif', label: 'Serif', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  { id: 'mono', label: 'Mono', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  { id: 'bold', label: 'Bold', fontFamily: undefined, fontWeight: '900' as const },
];

// ── Text colors ──
const TEXT_COLORS = [
  '#FFFFFF', '#0A7B4F', '#C8963E', '#000000',
  '#F85149', '#58A6FF', '#D2A8FF', '#FFA657',
];

// ── Background gradient presets (for text-only stories) ──
const BG_GRADIENTS: [string, string][] = [
  ['#0A7B4F', '#065535'],
  ['#1a1a2e', '#16213e'],
  ['#C8963E', '#8B6914'],
  ['#0D1117', '#161B22'],
  ['#6B2FA0', '#3B0764'],
  ['#F85149', '#9B2C2C'],
];

// ── Sticker types ──
type StickerType = 'poll' | 'question' | 'countdown' | 'quiz' | 'location' | 'mention' | 'hashtag';

interface Sticker {
  id: string;
  type: StickerType;
  x: number;
  y: number;
  scale: number;
  data: Record<string, unknown>;
}

export default function CreateStoryScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // ── Media state ──
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');

  // ── Text overlay state ──
  const [text, setText] = useState('');
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [fontIndex, setFontIndex] = useState(0);
  const [textBgEnabled, setTextBgEnabled] = useState(false);

  // ── Filter state ──
  const [filterIndex, setFilterIndex] = useState(0);

  // ── Background gradient (text-only stories) ──
  const [bgGradientIndex, setBgGradientIndex] = useState(0);

  // ── Stickers ──
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [showStickerMenu, setShowStickerMenu] = useState(false);
  const [activeStickerEditor, setActiveStickerEditor] = useState<StickerType | null>(null);

  // ── Sticker editor temp state ──
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [questionPrompt, setQuestionPrompt] = useState('');
  const [countdownTitle, setCountdownTitle] = useState('');
  const [countdownDate, setCountdownDate] = useState('');
  const [quizQuestion, setQuizQuestion] = useState('');
  const [quizOptions, setQuizOptions] = useState(['', '', '', '']);
  const [quizCorrectIndex, setQuizCorrectIndex] = useState(0);
  const [mentionUsername, setMentionUsername] = useState('');
  const [hashtagText, setHashtagText] = useState('');

  // ── Close friends ──
  const [closeFriendsOnly, setCloseFriendsOnly] = useState(false);

  // ── Active tool ──
  const [activeTool, setActiveTool] = useState<'text' | 'filter' | 'sticker' | null>(null);

  // ── Discard check ──
  const hasContent = mediaUri || text.length > 0 || stickers.length > 0;

  const handleClose = () => {
    if (hasContent) {
      Alert.alert('Discard Story?', 'You have unsaved changes.', [
        { text: 'Keep Editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  };

  // ── Media picker ──
  const pickMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      setMediaUri(result.assets[0].uri);
      setMediaType(result.assets[0].type === 'video' ? 'video' : 'image');
    }
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      setMediaUri(result.assets[0].uri);
      setMediaType(result.assets[0].type === 'video' ? 'video' : 'image');
    }
  };

  // ── Add sticker ──
  const addSticker = (type: StickerType, data: Record<string, unknown>) => {
    setStickers(prev => [
      ...prev,
      {
        id: `${type}-${Date.now()}`,
        type,
        x: SCREEN_W / 2 - 80,
        y: CANVAS_H / 2 - 40,
        scale: 1,
        data,
      },
    ]);
    setActiveStickerEditor(null);
    setShowStickerMenu(false);
  };

  const removeSticker = (id: string) => {
    setStickers(prev => prev.filter(s => s.id !== id));
  };

  // ── Submit sticker forms ──
  const submitPoll = () => {
    if (!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2) return;
    addSticker('poll', { question: pollQuestion, options: pollOptions.filter(o => o.trim()) });
    setPollQuestion(''); setPollOptions(['', '']);
  };

  const submitQuestion = () => {
    if (!questionPrompt.trim()) return;
    addSticker('question', { prompt: questionPrompt });
    setQuestionPrompt('');
  };

  const submitCountdown = () => {
    if (!countdownTitle.trim()) return;
    addSticker('countdown', { title: countdownTitle, endsAt: countdownDate || null });
    setCountdownTitle(''); setCountdownDate('');
  };

  const submitQuiz = () => {
    if (!quizQuestion.trim() || quizOptions.filter(o => o.trim()).length < 2) return;
    addSticker('quiz', {
      question: quizQuestion,
      options: quizOptions.filter(o => o.trim()),
      correctIndex: quizCorrectIndex,
    });
    setQuizQuestion(''); setQuizOptions(['', '', '', '']); setQuizCorrectIndex(0);
  };

  const submitMention = () => {
    if (!mentionUsername.trim()) return;
    addSticker('mention', { username: mentionUsername.replace('@', '') });
    setMentionUsername('');
  };

  const submitHashtag = () => {
    if (!hashtagText.trim()) return;
    addSticker('hashtag', { tag: hashtagText.replace('#', '') });
    setHashtagText('');
  };

  // ── Upload mutation ──
  const publishMutation = useMutation({
    mutationFn: async () => {
      let mediaUrl = '';
      if (mediaUri) {
        const upload = await uploadApi.getPresignedUrl(mediaType === 'video' ? 'video/mp4' : 'image/jpeg');
        await uploadApi.uploadToPresignedUrl(upload.url, mediaUri);
        mediaUrl = upload.publicUrl;
      }
      return storiesApi.create({
        mediaUrl,
        mediaType,
        textOverlay: text || undefined,
        textColor,
        fontFamily: FONTS[fontIndex].id,
        filter: FILTERS[filterIndex].id,
        bgGradient: !mediaUri ? JSON.stringify(BG_GRADIENTS[bgGradientIndex]) : undefined,
        stickers: stickers.length > 0 ? JSON.stringify(stickers) : undefined,
        closeFriendsOnly,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stories'] });
      router.back();
    },
    onError: () => Alert.alert('Error', 'Failed to publish story. Try again.'),
  });

  const currentFont = FONTS[fontIndex];
  const currentFilter = FILTERS[filterIndex];

  // ── Render sticker on canvas ──
  const renderSticker = (sticker: Sticker) => {
    const stickerStyles: Record<StickerType, object> = {
      poll: { backgroundColor: colors.dark.bgSheet, borderRadius: radius.md, padding: spacing.md, minWidth: 200 },
      question: { backgroundColor: 'rgba(10,123,79,0.85)', borderRadius: radius.md, padding: spacing.md, minWidth: 200 },
      countdown: { backgroundColor: colors.dark.bgCard, borderRadius: radius.md, padding: spacing.md, minWidth: 160 },
      quiz: { backgroundColor: colors.dark.bgSheet, borderRadius: radius.md, padding: spacing.md, minWidth: 200 },
      location: { backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
      mention: { backgroundColor: 'rgba(10,123,79,0.85)', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
      hashtag: { backgroundColor: 'rgba(200,150,62,0.85)', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    };

    return (
      <Pressable
        key={sticker.id}
        onLongPress={() => {
          Alert.alert('Remove Sticker?', '', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: () => removeSticker(sticker.id) },
          ]);
        }}
        style={[
          { position: 'absolute', left: sticker.x, top: sticker.y, transform: [{ scale: sticker.scale }] },
          stickerStyles[sticker.type],
        ]}
      >
        {sticker.type === 'poll' && (
          <View>
            <Text style={{ color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '700', marginBottom: spacing.sm }}>
              {String(sticker.data.question)}
            </Text>
            {(sticker.data.options as string[]).map((opt, i) => (
              <View key={i} style={{
                backgroundColor: colors.dark.surface, borderRadius: radius.sm,
                paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
                marginBottom: spacing.xs,
              }}>
                <Text style={{ color: colors.text.primary, fontSize: fontSize.sm }}>{opt}</Text>
              </View>
            ))}
          </View>
        )}
        {sticker.type === 'question' && (
          <View>
            <Text style={{ color: '#fff', fontSize: fontSize.sm, fontWeight: '700', textAlign: 'center' }}>
              {String(sticker.data.prompt)}
            </Text>
            <View style={{
              backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: radius.sm,
              paddingVertical: spacing.md, marginTop: spacing.sm,
            }}>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: fontSize.xs, textAlign: 'center' }}>
                Tap to respond
              </Text>
            </View>
          </View>
        )}
        {sticker.type === 'countdown' && (
          <View style={{ alignItems: 'center' }}>
            <Icon name="clock" size="sm" color={colors.emerald} />
            <Text style={{ color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '700', marginTop: 4 }}>
              {String(sticker.data.title)}
            </Text>
            <Text style={{ color: colors.text.secondary, fontSize: fontSize.xs, marginTop: 2 }}>
              {sticker.data.endsAt ? String(sticker.data.endsAt) : 'No end date set'}
            </Text>
          </View>
        )}
        {sticker.type === 'quiz' && (
          <View>
            <Text style={{ color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '700', marginBottom: spacing.sm }}>
              {String(sticker.data.question)}
            </Text>
            {(sticker.data.options as string[]).map((opt, i) => (
              <View key={i} style={{
                backgroundColor: i === sticker.data.correctIndex ? colors.emerald : colors.dark.surface,
                borderRadius: radius.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
                marginBottom: spacing.xs,
              }}>
                <Text style={{ color: colors.text.primary, fontSize: fontSize.sm }}>{opt}</Text>
              </View>
            ))}
          </View>
        )}
        {sticker.type === 'location' && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Icon name="map-pin" size="xs" color="#000" />
            <Text style={{ color: '#000', fontSize: fontSize.sm, fontWeight: '600', marginLeft: 4 }}>
              Location
            </Text>
          </View>
        )}
        {sticker.type === 'mention' && (
          <Text style={{ color: '#fff', fontSize: fontSize.sm, fontWeight: '600' }}>
            @{String(sticker.data.username)}
          </Text>
        )}
        {sticker.type === 'hashtag' && (
          <Text style={{ color: '#fff', fontSize: fontSize.sm, fontWeight: '600' }}>
            #{String(sticker.data.tag)}
          </Text>
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.dark.bg }}>
      {/* ── Header ── */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.base, paddingVertical: spacing.sm }}>
        <Pressable onPress={handleClose} hitSlop={8}>
          <Icon name="x" size="md" color={colors.text.primary} />
        </Pressable>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Pressable
            onPress={() => setActiveTool(activeTool === 'text' ? null : 'text')}
            style={{ padding: spacing.xs, backgroundColor: activeTool === 'text' ? colors.active.emerald10 : 'transparent', borderRadius: radius.sm }}
          >
            <Icon name="edit" size="sm" color={activeTool === 'text' ? colors.emerald : colors.text.primary} />
          </Pressable>
          <Pressable
            onPress={() => setActiveTool(activeTool === 'sticker' ? null : 'sticker')}
            style={{ padding: spacing.xs, backgroundColor: activeTool === 'sticker' ? colors.active.emerald10 : 'transparent', borderRadius: radius.sm }}
          >
            <Icon name="smile" size="sm" color={activeTool === 'sticker' ? colors.emerald : colors.text.primary} />
          </Pressable>
          <Pressable
            onPress={() => setActiveTool(activeTool === 'filter' ? null : 'filter')}
            style={{ padding: spacing.xs, backgroundColor: activeTool === 'filter' ? colors.active.emerald10 : 'transparent', borderRadius: radius.sm }}
          >
            <Icon name="layers" size="sm" color={activeTool === 'filter' ? colors.emerald : colors.text.primary} />
          </Pressable>
        </View>
      </View>

      {/* ── Canvas ── */}
      <View style={{ height: CANVAS_H, marginHorizontal: spacing.sm, borderRadius: radius.lg, overflow: 'hidden' }}>
        {mediaUri ? (
          <View style={{ flex: 1 }}>
            <Image source={{ uri: mediaUri }} style={[{ width: '100%', height: '100%' }, currentFilter.style]} contentFit="cover" />
          </View>
        ) : (
          <LinearGradient colors={BG_GRADIENTS[bgGradientIndex]} style={{ flex: 1 }} />
        )}

        {/* Text overlay */}
        {text.length > 0 && (
          <View style={{
            position: 'absolute', left: 0, right: 0, top: '40%',
            alignItems: 'center', paddingHorizontal: spacing.base,
          }}>
            <View style={textBgEnabled ? {
              backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.sm,
              paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
            } : undefined}>
              <Text style={{
                color: textColor,
                fontSize: fontSize.xl,
                fontWeight: currentFont.fontWeight || '700',
                fontFamily: currentFont.fontFamily,
                textAlign: 'center',
                textShadowColor: 'rgba(0,0,0,0.5)',
                textShadowOffset: { width: 1, height: 1 },
                textShadowRadius: 3,
              }}>
                {text}
              </Text>
            </View>
          </View>
        )}

        {/* Stickers on canvas */}
        {stickers.map(renderSticker)}
      </View>

      {/* ── Tool Panels ── */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.base }}>

        {/* No media: pick or shoot */}
        {!mediaUri && activeTool === null && (
          <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
            <Pressable onPress={pickMedia} style={[toolBtnStyle, { flex: 1 }]}>
              <Icon name="image" size="sm" color={colors.emerald} />
              <Text style={{ color: colors.text.primary, fontSize: fontSize.sm, marginLeft: spacing.sm }}>Gallery</Text>
            </Pressable>
            <Pressable onPress={takePhoto} style={[toolBtnStyle, { flex: 1 }]}>
              <Icon name="camera" size="sm" color={colors.emerald} />
              <Text style={{ color: colors.text.primary, fontSize: fontSize.sm, marginLeft: spacing.sm }}>Camera</Text>
            </Pressable>
          </View>
        )}

        {/* BG gradient picker (text-only stories) */}
        {!mediaUri && (
          <View style={{ marginBottom: spacing.md }}>
            <Text style={{ color: colors.text.secondary, fontSize: fontSize.xs, marginBottom: spacing.sm }}>Background</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {BG_GRADIENTS.map((g, i) => (
                <Pressable key={i} onPress={() => setBgGradientIndex(i)}>
                  <LinearGradient
                    colors={g}
                    style={{
                      width: 40, height: 40, borderRadius: radius.sm, marginRight: spacing.sm,
                      borderWidth: i === bgGradientIndex ? 2 : 0, borderColor: colors.emerald,
                    }}
                  />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {mediaUri && activeTool === null && (
          <Pressable onPress={pickMedia} style={toolBtnStyle}>
            <Icon name="image" size="sm" color={colors.text.secondary} />
            <Text style={{ color: colors.text.secondary, fontSize: fontSize.sm, marginLeft: spacing.sm }}>Change Media</Text>
          </Pressable>
        )}

        {/* ── Text tool ── */}
        {activeTool === 'text' && (
          <View>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Add text..."
              placeholderTextColor={colors.text.tertiary}
              multiline
              maxLength={200}
              style={{
                color: colors.text.primary, fontSize: fontSize.base,
                backgroundColor: colors.dark.bgElevated, borderRadius: radius.sm,
                padding: spacing.md, minHeight: 60, marginBottom: spacing.md,
              }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
              <CharCountRing current={text.length} max={200} size={24} />
              <Pressable onPress={() => setTextBgEnabled(!textBgEnabled)} style={{
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: textBgEnabled ? colors.active.emerald10 : colors.dark.surface,
                paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full,
              }}>
                <Text style={{ color: textBgEnabled ? colors.emerald : colors.text.secondary, fontSize: fontSize.xs }}>
                  BG
                </Text>
              </Pressable>
            </View>
            {/* Color picker */}
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
              {TEXT_COLORS.map(c => (
                <Pressable key={c} onPress={() => setTextColor(c)} style={{
                  width: 28, height: 28, borderRadius: radius.full,
                  backgroundColor: c, borderWidth: c === textColor ? 2 : 1,
                  borderColor: c === textColor ? colors.emerald : colors.dark.border,
                }} />
              ))}
            </View>
            {/* Font picker */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {FONTS.map((f, i) => (
                <Pressable key={f.id} onPress={() => setFontIndex(i)} style={{
                  paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
                  backgroundColor: i === fontIndex ? colors.emerald : colors.dark.surface,
                  borderRadius: radius.full, marginRight: spacing.sm,
                }}>
                  <Text style={{
                    color: i === fontIndex ? '#fff' : colors.text.primary,
                    fontSize: fontSize.sm, fontFamily: f.fontFamily, fontWeight: f.fontWeight,
                  }}>
                    {f.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Filter tool ── */}
        {activeTool === 'filter' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {FILTERS.map((f, i) => (
              <Pressable key={f.id} onPress={() => setFilterIndex(i)} style={{ marginRight: spacing.md, alignItems: 'center' }}>
                <View style={{
                  width: 60, height: 80, borderRadius: radius.sm, overflow: 'hidden',
                  borderWidth: i === filterIndex ? 2 : 0, borderColor: colors.emerald,
                }}>
                  {mediaUri && (
                    <Image source={{ uri: mediaUri }} style={[{ width: 60, height: 80 }, f.style]} contentFit="cover" />
                  )}
                  {!mediaUri && (
                    <LinearGradient colors={BG_GRADIENTS[bgGradientIndex]} style={[{ width: 60, height: 80 }, f.style]} />
                  )}
                </View>
                <Text style={{ color: i === filterIndex ? colors.emerald : colors.text.secondary, fontSize: fontSize.xs, marginTop: 4 }}>
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* ── Sticker tool ── */}
        {activeTool === 'sticker' && !activeStickerEditor && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {[
              { type: 'poll' as StickerType, icon: 'bar-chart-2' as const, label: 'Poll' },
              { type: 'question' as StickerType, icon: 'at-sign' as const, label: 'Question' },
              { type: 'countdown' as StickerType, icon: 'clock' as const, label: 'Countdown' },
              { type: 'quiz' as StickerType, icon: 'check-circle' as const, label: 'Quiz' },
              { type: 'mention' as StickerType, icon: 'at-sign' as const, label: 'Mention' },
              { type: 'hashtag' as StickerType, icon: 'hash' as const, label: 'Hashtag' },
              { type: 'location' as StickerType, icon: 'map-pin' as const, label: 'Location' },
            ].map(item => (
              <Pressable key={item.type} onPress={() => {
                if (item.type === 'location') {
                  addSticker('location', {});
                } else {
                  setActiveStickerEditor(item.type);
                }
              }} style={{
                backgroundColor: colors.dark.bgElevated, borderRadius: radius.md,
                padding: spacing.md, alignItems: 'center', width: (SCREEN_W - spacing.base * 2 - spacing.sm * 2) / 3 - 1,
              }}>
                <Icon name={item.icon} size="md" color={colors.emerald} />
                <Text style={{ color: colors.text.primary, fontSize: fontSize.xs, marginTop: spacing.xs }}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* ── Sticker editors ── */}
        {activeStickerEditor === 'poll' && (
          <View>
            <Text style={editorTitle}>Create Poll</Text>
            <TextInput value={pollQuestion} onChangeText={setPollQuestion} placeholder="Ask a question..."
              placeholderTextColor={colors.text.tertiary} maxLength={100}
              style={editorInput} />
            {pollOptions.map((opt, i) => (
              <TextInput key={i} value={opt} onChangeText={v => {
                const next = [...pollOptions]; next[i] = v; setPollOptions(next);
              }} placeholder={`Option ${i + 1}`} placeholderTextColor={colors.text.tertiary}
                maxLength={50} style={[editorInput, { marginTop: spacing.sm }]} />
            ))}
            {pollOptions.length < 4 && (
              <Pressable onPress={() => setPollOptions([...pollOptions, ''])} style={{ marginTop: spacing.sm }}>
                <Text style={{ color: colors.emerald, fontSize: fontSize.sm }}>+ Add option</Text>
              </Pressable>
            )}
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <Pressable onPress={() => setActiveStickerEditor(null)} style={[editorBtn, { backgroundColor: colors.dark.surface }]}>
                <Text style={{ color: colors.text.primary }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={submitPoll} style={[editorBtn, { backgroundColor: colors.emerald, flex: 1 }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Add Poll</Text>
              </Pressable>
            </View>
          </View>
        )}

        {activeStickerEditor === 'question' && (
          <View>
            <Text style={editorTitle}>Ask a Question</Text>
            <TextInput value={questionPrompt} onChangeText={setQuestionPrompt} placeholder="Your question..."
              placeholderTextColor={colors.text.tertiary} maxLength={100} style={editorInput} />
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <Pressable onPress={() => setActiveStickerEditor(null)} style={[editorBtn, { backgroundColor: colors.dark.surface }]}>
                <Text style={{ color: colors.text.primary }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={submitQuestion} style={[editorBtn, { backgroundColor: colors.emerald, flex: 1 }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Add Question</Text>
              </Pressable>
            </View>
          </View>
        )}

        {activeStickerEditor === 'countdown' && (
          <View>
            <Text style={editorTitle}>Countdown</Text>
            <TextInput value={countdownTitle} onChangeText={setCountdownTitle} placeholder="Countdown name..."
              placeholderTextColor={colors.text.tertiary} maxLength={60} style={editorInput} />
            <TextInput value={countdownDate} onChangeText={setCountdownDate} placeholder="End date (YYYY-MM-DD)"
              placeholderTextColor={colors.text.tertiary} style={[editorInput, { marginTop: spacing.sm }]} />
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <Pressable onPress={() => setActiveStickerEditor(null)} style={[editorBtn, { backgroundColor: colors.dark.surface }]}>
                <Text style={{ color: colors.text.primary }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={submitCountdown} style={[editorBtn, { backgroundColor: colors.emerald, flex: 1 }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Add Countdown</Text>
              </Pressable>
            </View>
          </View>
        )}

        {activeStickerEditor === 'quiz' && (
          <View>
            <Text style={editorTitle}>Create Quiz</Text>
            <TextInput value={quizQuestion} onChangeText={setQuizQuestion} placeholder="Quiz question..."
              placeholderTextColor={colors.text.tertiary} maxLength={100} style={editorInput} />
            {quizOptions.map((opt, i) => (
              <Pressable key={i} onPress={() => setQuizCorrectIndex(i)} style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm }}>
                <View style={{
                  width: 20, height: 20, borderRadius: radius.full,
                  backgroundColor: i === quizCorrectIndex ? colors.emerald : colors.dark.surface,
                  borderWidth: 1, borderColor: colors.dark.border, marginRight: spacing.sm,
                  justifyContent: 'center', alignItems: 'center',
                }}>
                  {i === quizCorrectIndex && <Icon name="check" size={12} color="#fff" />}
                </View>
                <TextInput value={opt} onChangeText={v => {
                  const next = [...quizOptions]; next[i] = v; setQuizOptions(next);
                }} placeholder={`Option ${i + 1}`} placeholderTextColor={colors.text.tertiary}
                  maxLength={50} style={[editorInput, { flex: 1 }]} />
              </Pressable>
            ))}
            <Text style={{ color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: spacing.xs }}>
              Tap the circle to mark the correct answer
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <Pressable onPress={() => setActiveStickerEditor(null)} style={[editorBtn, { backgroundColor: colors.dark.surface }]}>
                <Text style={{ color: colors.text.primary }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={submitQuiz} style={[editorBtn, { backgroundColor: colors.emerald, flex: 1 }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Add Quiz</Text>
              </Pressable>
            </View>
          </View>
        )}

        {activeStickerEditor === 'mention' && (
          <View>
            <Text style={editorTitle}>Mention Someone</Text>
            <TextInput value={mentionUsername} onChangeText={setMentionUsername} placeholder="@username"
              placeholderTextColor={colors.text.tertiary} autoCapitalize="none" style={editorInput} />
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <Pressable onPress={() => setActiveStickerEditor(null)} style={[editorBtn, { backgroundColor: colors.dark.surface }]}>
                <Text style={{ color: colors.text.primary }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={submitMention} style={[editorBtn, { backgroundColor: colors.emerald, flex: 1 }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Add Mention</Text>
              </Pressable>
            </View>
          </View>
        )}

        {activeStickerEditor === 'hashtag' && (
          <View>
            <Text style={editorTitle}>Add Hashtag</Text>
            <TextInput value={hashtagText} onChangeText={setHashtagText} placeholder="#hashtag"
              placeholderTextColor={colors.text.tertiary} autoCapitalize="none" style={editorInput} />
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <Pressable onPress={() => setActiveStickerEditor(null)} style={[editorBtn, { backgroundColor: colors.dark.surface }]}>
                <Text style={{ color: colors.text.primary }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={submitHashtag} style={[editorBtn, { backgroundColor: colors.emerald, flex: 1 }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Add Hashtag</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Bottom actions ── */}
        <View style={{ marginTop: spacing.lg }}>
          {/* Close friends toggle */}
          <Pressable
            onPress={() => setCloseFriendsOnly(!closeFriendsOnly)}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              backgroundColor: closeFriendsOnly ? colors.active.emerald10 : colors.dark.bgElevated,
              borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Icon name="users" size="sm" color={closeFriendsOnly ? colors.emerald : colors.text.secondary} />
              <Text style={{ color: closeFriendsOnly ? colors.emerald : colors.text.primary, marginLeft: spacing.sm, fontSize: fontSize.sm }}>
                Close Friends Only
              </Text>
            </View>
            <View style={{
              width: 20, height: 20, borderRadius: radius.full,
              backgroundColor: closeFriendsOnly ? colors.emerald : colors.dark.surface,
              borderWidth: 1, borderColor: colors.dark.border,
              justifyContent: 'center', alignItems: 'center',
            }}>
              {closeFriendsOnly && <Icon name="check" size={12} color="#fff" />}
            </View>
          </Pressable>

          {/* Publish button */}
          <Pressable
            onPress={() => publishMutation.mutate()}
            disabled={publishMutation.isPending || (!mediaUri && !text.trim())}
            style={{
              backgroundColor: publishMutation.isPending ? colors.dark.surface : colors.emerald,
              borderRadius: radius.md, paddingVertical: spacing.md,
              alignItems: 'center', opacity: (!mediaUri && !text.trim()) ? 0.5 : 1,
            }}
          >
            <Text style={{ color: '#fff', fontSize: fontSize.base, fontWeight: '700' }}>
              {publishMutation.isPending ? 'Publishing...' : 'Share Story'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Shared styles ──
const toolBtnStyle: any = {
  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  backgroundColor: colors.dark.bgElevated, borderRadius: radius.md,
  paddingVertical: spacing.md, paddingHorizontal: spacing.base,
  marginBottom: spacing.md,
};

const editorTitle: any = {
  color: colors.text.primary, fontSize: fontSize.md, fontWeight: '700', marginBottom: spacing.md,
};

const editorInput: any = {
  color: colors.text.primary, fontSize: fontSize.sm,
  backgroundColor: colors.dark.bgElevated, borderRadius: radius.sm,
  paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
};

const editorBtn: any = {
  borderRadius: radius.md, paddingVertical: spacing.sm,
  paddingHorizontal: spacing.base, alignItems: 'center',
};
```

---

## Agent 25: Bakra Tab Enhancements

**Goal:** Enhance `bakra.tsx` (TikTok clone) with audio info bar, duet/stitch action buttons, sound page navigation, trending sounds indicator, and creator follow button overlay.

**File to MODIFY:** `apps/mobile/app/(tabs)/bakra.tsx` (513 lines)

**IMPORTANT:** This file is EXCLUSIVELY owned by Agent 25. No other agent touches it.

### Changes Required:

#### 1. Audio Info Bar (bottom of each reel)
Add a scrolling audio/sound name bar at the bottom of each reel item, similar to TikTok's music ticker.

Find the section where creator info is rendered (avatar + username area). Below it, add:

```tsx
{/* Audio info bar */}
<View style={{
  position: 'absolute', bottom: Platform.OS === 'ios' ? 90 : 70, left: 0, right: 60,
  flexDirection: 'row', alignItems: 'center',
  paddingHorizontal: spacing.base,
}}>
  <Icon name="volume-x" size="xs" color="#fff" />
  <Animated.View style={{ flex: 1, marginLeft: spacing.xs, overflow: 'hidden' }}>
    <Text numberOfLines={1} style={{ color: '#fff', fontSize: fontSize.xs }}>
      {item.audioTrack?.title || 'Original Audio'} — {item.audioTrack?.artist || item.user?.displayName || 'Unknown'}
    </Text>
  </Animated.View>
  <Pressable
    onPress={() => {
      if (item.audioTrackId) {
        router.push(`/(screens)/sound/${item.audioTrackId}`);
      }
    }}
    style={{
      width: 32, height: 32, borderRadius: radius.full,
      borderWidth: 2, borderColor: '#fff',
      overflow: 'hidden', marginLeft: spacing.sm,
    }}
  >
    {item.audioTrack?.coverUrl ? (
      <Image source={{ uri: item.audioTrack.coverUrl }} style={{ width: 32, height: 32 }} />
    ) : (
      <View style={{ width: 32, height: 32, backgroundColor: colors.dark.surface, justifyContent: 'center', alignItems: 'center' }}>
        <Icon name="volume-x" size={14} color="#fff" />
      </View>
    )}
  </Pressable>
</View>
```

#### 2. Duet & Stitch Action Buttons
In the right action column (below share button), add duet and stitch buttons:

```tsx
{/* Duet button */}
<Pressable
  onPress={() => {
    haptic('light');
    router.push(`/(screens)/create-reel?duetWith=${item.id}`);
  }}
  style={{ alignItems: 'center', marginTop: spacing.md }}
>
  <View style={{
    width: 36, height: 36, borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  }}>
    <Icon name="layers" size="sm" color="#fff" />
  </View>
  <Text style={{ color: '#fff', fontSize: 10, marginTop: 2 }}>Duet</Text>
</Pressable>

{/* Stitch button */}
<Pressable
  onPress={() => {
    haptic('light');
    router.push(`/(screens)/create-reel?stitchFrom=${item.id}`);
  }}
  style={{ alignItems: 'center', marginTop: spacing.md }}
>
  <View style={{
    width: 36, height: 36, borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  }}>
    <Icon name="slash" size="sm" color="#fff" />
  </View>
  <Text style={{ color: '#fff', fontSize: 10, marginTop: 2 }}>Stitch</Text>
</Pressable>
```

#### 3. Creator Follow Button
Next to the creator avatar at bottom-left, add a follow button if not already following:

```tsx
{/* Follow button on creator avatar */}
{!item.user?.isFollowing && item.userId !== currentUserId && (
  <Pressable
    onPress={() => {
      followMutation.mutate(item.userId);
      haptic('medium');
    }}
    style={{
      position: 'absolute',
      bottom: -6, alignSelf: 'center',
      width: 20, height: 20, borderRadius: radius.full,
      backgroundColor: colors.emerald,
      justifyContent: 'center', alignItems: 'center',
      borderWidth: 1.5, borderColor: colors.dark.bg,
    }}
  >
    <Icon name="plus" size={12} color="#fff" />
  </Pressable>
)}
```

Add the follow mutation:
```tsx
const followMutation = useMutation({
  mutationFn: (userId: string) => followsApi.follow(userId),
  onSuccess: (_, userId) => {
    queryClient.invalidateQueries({ queryKey: ['reels'] });
  },
});
```

#### 4. Trending Sound Indicator
If the reel uses a trending audio track, show a small "Trending" badge near the audio bar:

```tsx
{item.audioTrack?.isTrending && (
  <View style={{
    position: 'absolute', bottom: Platform.OS === 'ios' ? 110 : 90, left: spacing.base,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(200,150,62,0.85)', borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
  }}>
    <Icon name="trending-up" size={10} color="#fff" />
    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700', marginLeft: 2 }}>Trending</Text>
  </View>
)}
```

#### 5. Import additions
Add these imports at the top (if not already present):
```tsx
import { followsApi } from '@/services/api';
import { Platform } from 'react-native';
```

---

## Agent 26: Profile Screen Enhancements

**Goal:** Enhance `profile/[username].tsx` with collab posts section, mutual followers display, liked posts tab, and archive section for own profile.

**File to MODIFY:** `apps/mobile/app/(screens)/profile/[username].tsx` (1041 lines)

**IMPORTANT:** This file is EXCLUSIVELY owned by Agent 26. No other agent touches it.

### Changes Required:

#### 1. Mutual Followers Row
Below the follower/following counts and above the bio, add a mutual followers indicator for other users' profiles:

```tsx
// Fetch mutual followers
const { data: mutualFollowers } = useQuery({
  queryKey: ['mutual-followers', username],
  queryFn: () => usersApi.getMutualFollowers(username),
  enabled: !!username && !isOwnProfile,
});
```

Render component (after stats row, before bio):
```tsx
{!isOwnProfile && mutualFollowers && mutualFollowers.length > 0 && (
  <Pressable
    onPress={() => router.push(`/(screens)/mutual-followers?username=${username}`)}
    style={{
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: spacing.base, marginTop: spacing.sm,
    }}
  >
    {/* Stacked avatars (up to 3) */}
    <View style={{ flexDirection: 'row' }}>
      {mutualFollowers.slice(0, 3).map((u: any, i: number) => (
        <View key={u.id} style={{ marginLeft: i > 0 ? -10 : 0, zIndex: 3 - i }}>
          <Avatar uri={u.avatarUrl} name={u.displayName} size="xs" />
        </View>
      ))}
    </View>
    <Text style={{ color: colors.text.secondary, fontSize: fontSize.xs, marginLeft: spacing.sm, flex: 1 }}>
      Followed by {mutualFollowers[0]?.displayName}
      {mutualFollowers.length > 1 && ` and ${mutualFollowers.length - 1} others you follow`}
    </Text>
  </Pressable>
)}
```

#### 2. Add "Liked" Tab (4th tab — own profile only)
Modify the TabSelector to include a "Liked" tab for own profile:

```tsx
const tabs = isOwnProfile
  ? [
      { key: 'posts', label: 'Posts' },
      { key: 'threads', label: 'Threads' },
      { key: 'reels', label: 'Reels' },
      { key: 'liked', label: 'Liked' },
    ]
  : [
      { key: 'posts', label: 'Posts' },
      { key: 'threads', label: 'Threads' },
      { key: 'reels', label: 'Reels' },
    ];
```

Fetch liked posts:
```tsx
const { data: likedPosts, fetchNextPage: fetchMoreLiked, hasNextPage: hasMoreLiked, isLoading: isLoadingLiked } = useInfiniteQuery({
  queryKey: ['liked-posts', username],
  queryFn: ({ pageParam }) => postsApi.getLiked({ cursor: pageParam }),
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (lastPage) => lastPage.meta?.hasMore ? lastPage.meta.cursor : undefined,
  enabled: isOwnProfile && activeTab === 'liked',
});
```

Render liked posts in grid (same layout as posts tab):
```tsx
{activeTab === 'liked' && (
  isLoadingLiked ? (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {[1,2,3,4,5,6].map(i => <Skeleton.Rect key={i} width={(SCREEN_W - 4) / 3} height={(SCREEN_W - 4) / 3} />)}
    </View>
  ) : !likedPosts?.pages?.[0]?.data?.length ? (
    <EmptyState icon="heart" title="No liked posts yet" subtitle="Posts you like will appear here" />
  ) : (
    /* Grid identical to posts tab rendering */
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {likedPosts.pages.flatMap(p => p.data).map(post => (
        <Pressable key={post.id} onPress={() => router.push(`/(screens)/post/${post.id}`)}>
          <Image source={{ uri: post.mediaUrls?.[0] }} style={{ width: (SCREEN_W - 4) / 3, height: (SCREEN_W - 4) / 3, margin: 0.67 }} />
        </Pressable>
      ))}
    </View>
  )
)}
```

#### 3. Collab Badge on Posts
In the posts grid, if a post has collaborators, show a small collab icon overlay:

```tsx
{post.collaborators && post.collaborators.length > 0 && (
  <View style={{
    position: 'absolute', top: 4, right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.full,
    padding: 3,
  }}>
    <Icon name="users" size={10} color="#fff" />
  </View>
)}
```

#### 4. Archive Button (own profile only)
In the own-profile action area (where Edit Profile button is), add an archive button:

```tsx
{isOwnProfile && (
  <Pressable
    onPress={() => router.push('/(screens)/archive')}
    style={{
      backgroundColor: colors.dark.bgElevated, borderRadius: radius.md,
      paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
      marginLeft: spacing.sm,
    }}
  >
    <Icon name="clock" size="sm" color={colors.text.primary} />
  </Pressable>
)}
```

---

## Agent 27: API Client & Types Integration

**Goal:** Add all 8 new module API clients to `api.ts` and corresponding TypeScript interfaces to `types/index.ts`.

**Files to MODIFY:**
- `apps/mobile/src/services/api.ts` (606 lines) — ADD new exports at bottom
- `apps/mobile/src/types/index.ts` (543 lines) — ADD new interfaces at bottom

**IMPORTANT:** These files are EXCLUSIVELY owned by Agent 27. No other agent touches them.

### 1. Add to `apps/mobile/src/types/index.ts` (APPEND after line 543):

```typescript
// ── Broadcast Channels ──
export interface BroadcastChannel {
  id: string;
  name: string;
  slug: string;
  description?: string;
  avatarUrl?: string;
  coverUrl?: string;
  subscribersCount: number;
  postsCount: number;
  userId: string;
  user?: User;
  role?: 'owner' | 'admin' | 'subscriber';
  isMuted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BroadcastMessage {
  id: string;
  content: string;
  mediaUrls: string[];
  mediaTypes: string[];
  isPinned: boolean;
  viewsCount: number;
  channelId: string;
  userId: string;
  user?: User;
  createdAt: string;
}

// ── Live Sessions ──
export interface LiveSession {
  id: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  scheduledAt?: string;
  startedAt?: string;
  endedAt?: string;
  viewersCount: number;
  peakViewers: number;
  recordingUrl?: string;
  userId: string;
  user?: User;
  createdAt: string;
}

export interface LiveParticipant {
  id: string;
  userId: string;
  user?: User;
  role: 'host' | 'speaker' | 'viewer';
  joinedAt: string;
  handRaised: boolean;
}

// ── Calls ──
export interface CallSession {
  id: string;
  callType: 'voice' | 'video';
  status: 'ringing' | 'active' | 'ended' | 'missed' | 'declined';
  callerId: string;
  caller?: User;
  receiverId: string;
  receiver?: User;
  startedAt?: string;
  endedAt?: string;
  duration?: number;
  createdAt: string;
}

// ── Stickers ──
export interface StickerPack {
  id: string;
  name: string;
  slug: string;
  description?: string;
  coverUrl?: string;
  stickers: StickerItem[];
  userId: string;
  user?: User;
  isOfficial: boolean;
  downloadCount: number;
  createdAt: string;
}

export interface StickerItem {
  id: string;
  imageUrl: string;
  emoji?: string;
  packId: string;
}

// ── Post Collabs ──
export interface PostCollab {
  id: string;
  postId: string;
  post?: Post;
  userId: string;
  user?: User;
  status: 'pending' | 'accepted' | 'declined';
  invitedBy: string;
  createdAt: string;
}

// ── Channel Posts (Community) ──
export interface ChannelPost {
  id: string;
  content: string;
  mediaUrls: string[];
  mediaTypes: string[];
  postType: 'text' | 'image' | 'poll' | 'quiz';
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
  channelId: string;
  userId: string;
  user?: User;
  createdAt: string;
}

// ── Audio Tracks ──
export interface AudioTrack {
  id: string;
  title: string;
  artist: string;
  coverUrl?: string;
  audioUrl: string;
  duration: number;
  usageCount: number;
  isTrending: boolean;
  genre?: string;
  userId: string;
  user?: User;
  createdAt: string;
}

// ── Feed Dismissal ──
export interface FeedDismissal {
  id: string;
  postId?: string;
  reelId?: string;
  threadId?: string;
  reason: string;
  userId: string;
  createdAt: string;
}
```

### 2. Add to `apps/mobile/src/services/api.ts` (APPEND after line 606):

```typescript
// ── Broadcast Channels ──
export const broadcastApi = {
  discover: (cursor?: string) =>
    api.get<PaginatedResponse<BroadcastChannel>>(`/broadcast-channels/discover${cursor ? `?cursor=${cursor}` : ''}`),
  getMyChannels: () =>
    api.get<BroadcastChannel[]>('/broadcast-channels/mine'),
  getBySlug: (slug: string) =>
    api.get<BroadcastChannel>(`/broadcast-channels/slug/${slug}`),
  getById: (id: string) =>
    api.get<BroadcastChannel>(`/broadcast-channels/${id}`),
  create: (data: { name: string; slug: string; description?: string; avatarUrl?: string }) =>
    api.post<BroadcastChannel>('/broadcast-channels', data),
  subscribe: (id: string) =>
    api.post(`/broadcast-channels/${id}/subscribe`),
  unsubscribe: (id: string) =>
    api.delete(`/broadcast-channels/${id}/subscribe`),
  mute: (id: string) =>
    api.post(`/broadcast-channels/${id}/mute`),
  unmute: (id: string) =>
    api.delete(`/broadcast-channels/${id}/mute`),
  getMessages: (id: string, cursor?: string) =>
    api.get<PaginatedResponse<BroadcastMessage>>(`/broadcast-channels/${id}/messages${cursor ? `?cursor=${cursor}` : ''}`),
  sendMessage: (id: string, data: { content: string; mediaUrls?: string[]; mediaTypes?: string[] }) =>
    api.post<BroadcastMessage>(`/broadcast-channels/${id}/messages`, data),
  pinMessage: (channelId: string, messageId: string) =>
    api.post(`/broadcast-channels/${channelId}/messages/${messageId}/pin`),
  unpinMessage: (channelId: string, messageId: string) =>
    api.delete(`/broadcast-channels/${channelId}/messages/${messageId}/pin`),
  deleteMessage: (channelId: string, messageId: string) =>
    api.delete(`/broadcast-channels/${channelId}/messages/${messageId}`),
  getPinnedMessages: (id: string) =>
    api.get<BroadcastMessage[]>(`/broadcast-channels/${id}/messages/pinned`),
  promoteToAdmin: (channelId: string, userId: string) =>
    api.post(`/broadcast-channels/${channelId}/admins/${userId}`),
  demoteFromAdmin: (channelId: string, userId: string) =>
    api.delete(`/broadcast-channels/${channelId}/admins/${userId}`),
  removeSubscriber: (channelId: string, userId: string) =>
    api.delete(`/broadcast-channels/${channelId}/subscribers/${userId}`),
};

// ── Live Sessions ──
export const liveApi = {
  create: (data: { title: string; description?: string; thumbnailUrl?: string; scheduledAt?: string }) =>
    api.post<LiveSession>('/live', data),
  getById: (id: string) =>
    api.get<LiveSession>(`/live/${id}`),
  getActive: () =>
    api.get<LiveSession[]>('/live/active'),
  getScheduled: () =>
    api.get<LiveSession[]>('/live/scheduled'),
  startLive: (id: string) =>
    api.post(`/live/${id}/start`),
  endLive: (id: string) =>
    api.post(`/live/${id}/end`),
  cancelLive: (id: string) =>
    api.post(`/live/${id}/cancel`),
  join: (id: string) =>
    api.post<LiveParticipant>(`/live/${id}/join`),
  leave: (id: string) =>
    api.post(`/live/${id}/leave`),
  raiseHand: (id: string) =>
    api.post(`/live/${id}/raise-hand`),
  promoteToSpeaker: (id: string, userId: string) =>
    api.post(`/live/${id}/promote/${userId}`),
  demoteToViewer: (id: string, userId: string) =>
    api.post(`/live/${id}/demote/${userId}`),
  getParticipants: (id: string) =>
    api.get<LiveParticipant[]>(`/live/${id}/participants`),
  getHostSessions: (userId: string) =>
    api.get<LiveSession[]>(`/live/host/${userId}`),
};

// ── Calls ──
export const callsApi = {
  initiate: (data: { receiverId: string; callType: 'voice' | 'video' }) =>
    api.post<CallSession>('/calls', data),
  answer: (id: string) =>
    api.post(`/calls/${id}/answer`),
  decline: (id: string) =>
    api.post(`/calls/${id}/decline`),
  end: (id: string) =>
    api.post(`/calls/${id}/end`),
  getHistory: (cursor?: string) =>
    api.get<PaginatedResponse<CallSession>>(`/calls/history${cursor ? `?cursor=${cursor}` : ''}`),
  getActiveCall: () =>
    api.get<CallSession | null>('/calls/active'),
};

// ── Stickers ──
export const stickersApi = {
  browsePacks: (cursor?: string) =>
    api.get<PaginatedResponse<StickerPack>>(`/stickers/browse${cursor ? `?cursor=${cursor}` : ''}`),
  searchPacks: (query: string) =>
    api.get<StickerPack[]>(`/stickers/search?q=${encodeURIComponent(query)}`),
  getPack: (id: string) =>
    api.get<StickerPack>(`/stickers/packs/${id}`),
  getFeaturedPacks: () =>
    api.get<StickerPack[]>('/stickers/featured'),
  getMyPacks: () =>
    api.get<StickerPack[]>('/stickers/mine'),
  getRecentStickers: () =>
    api.get<StickerItem[]>('/stickers/recent'),
  addToCollection: (packId: string) =>
    api.post(`/stickers/packs/${packId}/collect`),
  removeFromCollection: (packId: string) =>
    api.delete(`/stickers/packs/${packId}/collect`),
  createPack: (data: { name: string; slug: string; description?: string; coverUrl?: string; stickers: { imageUrl: string; emoji?: string }[] }) =>
    api.post<StickerPack>('/stickers/packs', data),
  deletePack: (id: string) =>
    api.delete(`/stickers/packs/${id}`),
};

// ── Post Collabs ──
export const collabsApi = {
  invite: (postId: string, userId: string) =>
    api.post<PostCollab>(`/collabs/invite`, { postId, userId }),
  accept: (id: string) =>
    api.post(`/collabs/${id}/accept`),
  decline: (id: string) =>
    api.post(`/collabs/${id}/decline`),
  remove: (id: string) =>
    api.delete(`/collabs/${id}`),
  getMyPending: () =>
    api.get<PostCollab[]>('/collabs/pending'),
  getPostCollabs: (postId: string) =>
    api.get<PostCollab[]>(`/collabs/post/${postId}`),
};

// ── Channel Posts (Community) ──
export const channelPostsApi = {
  list: (channelId: string, cursor?: string) =>
    api.get<PaginatedResponse<ChannelPost>>(`/channels/${channelId}/posts${cursor ? `?cursor=${cursor}` : ''}`),
  create: (channelId: string, data: { content: string; postType?: string; mediaUrls?: string[]; mediaTypes?: string[] }) =>
    api.post<ChannelPost>(`/channels/${channelId}/posts`, data),
  like: (channelId: string, postId: string) =>
    api.post(`/channels/${channelId}/posts/${postId}/like`),
  unlike: (channelId: string, postId: string) =>
    api.delete(`/channels/${channelId}/posts/${postId}/like`),
  delete: (channelId: string, postId: string) =>
    api.delete(`/channels/${channelId}/posts/${postId}`),
  getComments: (channelId: string, postId: string, cursor?: string) =>
    api.get<PaginatedResponse<any>>(`/channels/${channelId}/posts/${postId}/comments${cursor ? `?cursor=${cursor}` : ''}`),
  addComment: (channelId: string, postId: string, content: string) =>
    api.post(`/channels/${channelId}/posts/${postId}/comments`, { content }),
};

// ── Audio Tracks ──
export const audioTracksApi = {
  browse: (cursor?: string) =>
    api.get<PaginatedResponse<AudioTrack>>(`/audio-tracks${cursor ? `?cursor=${cursor}` : ''}`),
  search: (query: string) =>
    api.get<AudioTrack[]>(`/audio-tracks/search?q=${encodeURIComponent(query)}`),
  getById: (id: string) =>
    api.get<AudioTrack>(`/audio-tracks/${id}`),
  getTrending: () =>
    api.get<AudioTrack[]>('/audio-tracks/trending'),
  getByGenre: (genre: string) =>
    api.get<AudioTrack[]>(`/audio-tracks/genre/${genre}`),
  getReelsUsing: (trackId: string, cursor?: string) =>
    api.get<PaginatedResponse<any>>(`/audio-tracks/${trackId}/reels${cursor ? `?cursor=${cursor}` : ''}`),
  upload: (data: { title: string; artist: string; audioUrl: string; coverUrl?: string; duration: number; genre?: string }) =>
    api.post<AudioTrack>('/audio-tracks', data),
  delete: (id: string) =>
    api.delete(`/audio-tracks/${id}`),
};

// ── Feed Intelligence ──
export const feedApi = {
  dismiss: (data: { postId?: string; reelId?: string; threadId?: string; reason: string }) =>
    api.post('/feed/dismiss', data),
  getPersonalized: (cursor?: string) =>
    api.get<PaginatedResponse<any>>(`/feed/personalized${cursor ? `?cursor=${cursor}` : ''}`),
  getExplore: (cursor?: string) =>
    api.get<PaginatedResponse<any>>(`/feed/explore${cursor ? `?cursor=${cursor}` : ''}`),
  reportNotInterested: (contentId: string, contentType: string) =>
    api.post('/feed/not-interested', { contentId, contentType }),
};
```

**IMPORTANT:** Add the import for the new types at the top of api.ts. Find the existing import line from `@/types` and add the new types:

Add after the existing type imports:
```typescript
import type {
  BroadcastChannel, BroadcastMessage, LiveSession, LiveParticipant,
  CallSession, StickerPack, StickerItem, PostCollab,
  ChannelPost, AudioTrack, FeedDismissal,
} from '@/types';
```

Also import `PaginatedResponse` from types if not already imported. Check the existing import and add it.

---

## Agent 28: Zustand Store & Screen Routes

**Goal:** Add new state slices for calls/live/stickers to the Zustand store. The (screens)/_layout.tsx does NOT need changes because Expo Router auto-discovers file-based routes.

**File to MODIFY:** `apps/mobile/src/store/index.ts` (118 lines)

**IMPORTANT:** This file is EXCLUSIVELY owned by Agent 28. No other agent touches it.

### Changes to `apps/mobile/src/store/index.ts`:

#### 1. Add new state to the `AppState` interface (after line 43, before `logout`):

```typescript
  // Active call
  activeCallId: string | null;
  setActiveCallId: (id: string | null) => void;

  // Live session
  activeLiveSessionId: string | null;
  setActiveLiveSessionId: (id: string | null) => void;
  isLiveStreaming: boolean;
  setIsLiveStreaming: (v: boolean) => void;

  // Sticker recent
  recentStickerPackIds: string[];
  addRecentStickerPack: (packId: string) => void;

  // Muted broadcast channels
  mutedChannelIds: string[];
  toggleMutedChannel: (channelId: string) => void;

  // Feed preferences
  feedDismissedIds: string[];
  addFeedDismissed: (contentId: string) => void;
```

#### 2. Add implementations in the `persist((set) => ({...}))` block (after `removeFollowedHashtag` at ~line 87, before `logout`):

```typescript
      // Active call
      activeCallId: null,
      setActiveCallId: (activeCallId) => set({ activeCallId }),

      // Live session
      activeLiveSessionId: null,
      setActiveLiveSessionId: (activeLiveSessionId) => set({ activeLiveSessionId }),
      isLiveStreaming: false,
      setIsLiveStreaming: (isLiveStreaming) => set({ isLiveStreaming }),

      // Sticker recent
      recentStickerPackIds: [],
      addRecentStickerPack: (packId) => set((s) => ({
        recentStickerPackIds: [packId, ...s.recentStickerPackIds.filter(id => id !== packId)].slice(0, 20),
      })),

      // Muted broadcast channels
      mutedChannelIds: [],
      toggleMutedChannel: (channelId) => set((s) => ({
        mutedChannelIds: s.mutedChannelIds.includes(channelId)
          ? s.mutedChannelIds.filter(id => id !== channelId)
          : [...s.mutedChannelIds, channelId],
      })),

      // Feed preferences
      feedDismissedIds: [],
      addFeedDismissed: (contentId) => set((s) => ({
        feedDismissedIds: [...s.feedDismissedIds, contentId].slice(-200),
      })),
```

#### 3. Update the `logout` reset to include new fields (in the `logout` action):

Add to the logout set call:
```typescript
        activeCallId: null,
        activeLiveSessionId: null,
        isLiveStreaming: false,
        recentStickerPackIds: [],
        feedDismissedIds: [],
```

#### 4. Update `partialize` to persist sticker and channel mute state:

```typescript
      partialize: (state) => ({
        theme: state.theme,
        safFeedType: state.safFeedType,
        majlisFeedType: state.majlisFeedType,
        followedHashtags: state.followedHashtags,
        recentStickerPackIds: state.recentStickerPackIds,
        mutedChannelIds: state.mutedChannelIds,
      }),
```

#### 5. Add new selectors at the bottom (after line 118):

```typescript
export const useActiveCallId = () => useStore((s) => s.activeCallId);
export const useActiveLiveSessionId = () => useStore((s) => s.activeLiveSessionId);
export const useIsLiveStreaming = () => useStore((s) => s.isLiveStreaming);
export const useRecentStickerPackIds = () => useStore((s) => s.recentStickerPackIds);
export const useMutedChannelIds = () => useStore((s) => s.mutedChannelIds);
export const useFeedDismissedIds = () => useStore((s) => s.feedDismissedIds);
```

---

## Agent 29: Backend Module Registration

**Goal:** Register all 8 new backend modules in `app.module.ts` and create their NestJS module files.

**File to MODIFY:** `apps/api/src/app.module.ts` (93 lines)

**Files to CREATE:** 8 new `.module.ts` files

**IMPORTANT:** `app.module.ts` is EXCLUSIVELY owned by Agent 29. No other agent touches it.

### 1. Add imports at the top of `app.module.ts` (after line 36, after DraftsModule):

```typescript
import { BroadcastModule } from './modules/broadcast/broadcast.module';
import { LiveModule } from './modules/live/live.module';
import { CallsModule } from './modules/calls/calls.module';
import { StickersModule } from './modules/stickers/stickers.module';
import { CollabsModule } from './modules/collabs/collabs.module';
import { ChannelPostsModule } from './modules/channel-posts/channel-posts.module';
import { AudioTracksModule } from './modules/audio-tracks/audio-tracks.module';
import { FeedModule } from './modules/feed/feed.module';
```

### 2. Add modules to the `imports` array (after `DraftsModule` on line 82):

```typescript
    BroadcastModule,
    LiveModule,
    CallsModule,
    StickersModule,
    CollabsModule,
    ChannelPostsModule,
    AudioTracksModule,
    FeedModule,
```

### 3. Create 8 module files:

Each follows this pattern. Create each file:

#### `apps/api/src/modules/broadcast/broadcast.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { BroadcastService } from './broadcast.service';
import { BroadcastController } from './broadcast.controller';
import { PrismaModule } from '../../config/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BroadcastController],
  providers: [BroadcastService],
  exports: [BroadcastService],
})
export class BroadcastModule {}
```

#### `apps/api/src/modules/live/live.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { LiveService } from './live.service';
import { LiveController } from './live.controller';
import { PrismaModule } from '../../config/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [LiveController],
  providers: [LiveService],
  exports: [LiveService],
})
export class LiveModule {}
```

#### `apps/api/src/modules/calls/calls.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { CallsService } from './calls.service';
import { CallsController } from './calls.controller';
import { PrismaModule } from '../../config/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CallsController],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}
```

#### `apps/api/src/modules/stickers/stickers.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { StickersService } from './stickers.service';
import { StickersController } from './stickers.controller';
import { PrismaModule } from '../../config/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StickersController],
  providers: [StickersService],
  exports: [StickersService],
})
export class StickersModule {}
```

#### `apps/api/src/modules/collabs/collabs.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { CollabsService } from './collabs.service';
import { CollabsController } from './collabs.controller';
import { PrismaModule } from '../../config/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CollabsController],
  providers: [CollabsService],
  exports: [CollabsService],
})
export class CollabsModule {}
```

#### `apps/api/src/modules/channel-posts/channel-posts.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { ChannelPostsService } from './channel-posts.service';
import { ChannelPostsController } from './channel-posts.controller';
import { PrismaModule } from '../../config/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ChannelPostsController],
  providers: [ChannelPostsService],
  exports: [ChannelPostsService],
})
export class ChannelPostsModule {}
```

#### `apps/api/src/modules/audio-tracks/audio-tracks.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { AudioTracksService } from './audio-tracks.service';
import { AudioTracksController } from './audio-tracks.controller';
import { PrismaModule } from '../../config/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AudioTracksController],
  providers: [AudioTracksService],
  exports: [AudioTracksService],
})
export class AudioTracksModule {}
```

#### `apps/api/src/modules/feed/feed.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { FeedService } from './feed.service';
import { FeedController } from './feed.controller';
import { PrismaModule } from '../../config/prisma.module';
import { RedisModule } from '../../config/redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [FeedController],
  providers: [FeedService],
  exports: [FeedService],
})
export class FeedModule {}
```

---

## Agent 30: Controller Spec Files

**Goal:** Create controller spec files for all 8 new backend modules (Agents 1-8). These test that routes are wired correctly to service methods.

**Files to CREATE:**
1. `apps/api/src/modules/broadcast/broadcast.controller.spec.ts`
2. `apps/api/src/modules/live/live.controller.spec.ts`
3. `apps/api/src/modules/calls/calls.controller.spec.ts`
4. `apps/api/src/modules/stickers/stickers.controller.spec.ts`
5. `apps/api/src/modules/collabs/collabs.controller.spec.ts`
6. `apps/api/src/modules/channel-posts/channel-posts.controller.spec.ts`
7. `apps/api/src/modules/audio-tracks/audio-tracks.controller.spec.ts`
8. `apps/api/src/modules/feed/feed.controller.spec.ts`

**IMPORTANT:** These files are EXCLUSIVELY owned by Agent 30. No other agent creates spec files except for service specs (which are owned by Agents 1-8).

### Pattern for ALL controller specs:

Each spec follows this exact NestJS testing pattern. Agent 30 MUST use `as any` for mock services (test files are the ONLY exception where `as any` is allowed per CLAUDE.md rule 13).

#### Template (adapt names for each module):

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { BroadcastController } from './broadcast.controller';
import { BroadcastService } from './broadcast.service';

describe('BroadcastController', () => {
  let controller: BroadcastController;
  let service: BroadcastService;

  const mockService = {
    create: jest.fn(),
    getBySlug: jest.fn(),
    getById: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    sendMessage: jest.fn(),
    getMessages: jest.fn(),
    pinMessage: jest.fn(),
    unpinMessage: jest.fn(),
    deleteMessage: jest.fn(),
    getPinnedMessages: jest.fn(),
    muteChannel: jest.fn(),
    getMyChannels: jest.fn(),
    discover: jest.fn(),
    promoteToAdmin: jest.fn(),
    demoteFromAdmin: jest.fn(),
    removeSubscriber: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BroadcastController],
      providers: [
        { provide: BroadcastService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<BroadcastController>(BroadcastController);
    service = module.get<BroadcastService>(BroadcastService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call service.create', async () => {
      const dto = { name: 'Test', slug: 'test' };
      const userId = 'user-1';
      mockService.create.mockResolvedValue({ id: '1', ...dto });
      const result = await controller.create(userId, dto as any);
      expect(service.create).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual({ id: '1', ...dto });
    });
  });

  describe('discover', () => {
    it('should return paginated channels', async () => {
      const expected = { data: [], meta: { cursor: null, hasMore: false } };
      mockService.discover.mockResolvedValue(expected);
      const result = await controller.discover('user-1', undefined);
      expect(service.discover).toHaveBeenCalled();
      expect(result).toEqual(expected);
    });
  });

  describe('subscribe', () => {
    it('should call service.subscribe', async () => {
      mockService.subscribe.mockResolvedValue({ success: true });
      await controller.subscribe('user-1', 'channel-1');
      expect(service.subscribe).toHaveBeenCalledWith('user-1', 'channel-1');
    });
  });

  describe('sendMessage', () => {
    it('should call service.sendMessage', async () => {
      const dto = { content: 'Hello' };
      mockService.sendMessage.mockResolvedValue({ id: 'msg-1', content: 'Hello' });
      const result = await controller.sendMessage('user-1', 'channel-1', dto as any);
      expect(service.sendMessage).toHaveBeenCalledWith('user-1', 'channel-1', dto);
      expect(result.content).toBe('Hello');
    });
  });
});
```

### Specific spec file contents:

#### 1. `broadcast.controller.spec.ts` — Tests: create, discover, subscribe, unsubscribe, sendMessage, getMessages, pinMessage, unpinMessage, deleteMessage, getPinnedMessages, muteChannel, getMyChannels, promoteToAdmin, demoteFromAdmin, removeSubscriber (15 tests)

#### 2. `live.controller.spec.ts` — Tests: create, getById, getActive, getScheduled, startLive, endLive, cancelLive, join, leave, raiseHand, promoteToSpeaker, demoteToViewer, getHostSessions (13 tests)

Mock service methods: `create, getById, getActive, getScheduled, startLive, endLive, cancelLive, join, leave, raiseHand, promoteToSpeaker, demoteToViewer, updateRecording, getHostSessions`

#### 3. `calls.controller.spec.ts` — Tests: initiate, answer, decline, end, getHistory, getActiveCall (6 tests)

Mock service methods: `initiate, answer, decline, end, missedCall, getHistory, getActiveCall`

#### 4. `stickers.controller.spec.ts` — Tests: createPack, getPack, browsePacks, searchPacks, addToCollection, removeFromCollection, getMyPacks, getRecentStickers, getFeaturedPacks, deletePack (10 tests)

Mock service methods: `createPack, getPack, browsePacks, searchPacks, addToCollection, removeFromCollection, getMyPacks, getRecentStickers, getFeaturedPacks, deletePack`

#### 5. `collabs.controller.spec.ts` — Tests: invite, accept, decline, remove, getMyPending, getPostCollabs (6 tests)

Mock service methods: `invite, accept, decline, remove, getMyPending, getPostCollabs, getAcceptedCollabs`

#### 6. `channel-posts.controller.spec.ts` — Tests: list, create, like, unlike, delete, getComments, addComment (7 tests)

Mock service methods: `list, create, like, unlike, delete, getComments, addComment`

#### 7. `audio-tracks.controller.spec.ts` — Tests: browse, search, getById, getTrending, getByGenre, getReelsUsing, upload, delete (8 tests)

Mock service methods: `browse, search, getById, getTrending, getByGenre, getReelsUsing, upload, delete`

#### 8. `feed.controller.spec.ts` — Tests: dismiss, getPersonalized, getExplore, reportNotInterested (4 tests)

Mock service methods: `dismiss, getPersonalized, getExplore, reportNotInterested, recalculateScores`

Each spec file MUST:
- Import from `@nestjs/testing`
- Use `Test.createTestingModule` with mock providers
- Call `jest.clearAllMocks()` in `beforeEach`
- Test each controller method calls the right service method with correct args
- Use `as any` for DTOs in test mocks (allowed per CLAUDE.md rule 13)
- Follow the template structure above

---

## Post-Batch 21 Verification Checklist

After all 30 agents complete, verify:

### Backend (Agents 1-8, 9-12, 29-30)
- [ ] `npm run build` compiles without errors in `apps/api`
- [ ] All 8 new modules registered in `app.module.ts`
- [ ] All 8 service spec files pass: `npm test -- --testPathPattern="broadcast|live|calls|stickers|collabs|channel-posts|audio-tracks|feed"`
- [ ] All 8 controller spec files pass
- [ ] Swagger docs at `/docs` show all new endpoints
- [ ] No `any` in non-test code
- [ ] All endpoints use `@CurrentUser('id')` (not `@CurrentUser()`)
- [ ] All services use cursor-based pagination with `{ data, meta: { cursor, hasMore } }`

### Mobile (Agents 13-28)
- [ ] `npx expo start` launches without errors
- [ ] All new screens render (broadcast-channels, broadcast/[id], go-live, live/[id], call/[id], close-friends, pinned-messages, starred-messages, collab-requests, community-posts)
- [ ] All new components render (StickerPicker, StickerPackBrowser, ImageLightbox, VideoPlayer)
- [ ] All FlatLists have RefreshControl
- [ ] No RN Modal usage — all use BottomSheet
- [ ] No bare ActivityIndicator — all use Skeleton
- [ ] No bare "No items" text — all use EmptyState
- [ ] No emoji characters for icons — all use Icon component
- [ ] No hardcoded borderRadius >= 6 — all use radius.*
- [ ] store/index.ts has new state + selectors
- [ ] api.ts has all 8 new API groups
- [ ] types/index.ts has all new interfaces

### Integration
- [ ] No TypeScript `any` in non-test files
- [ ] No file conflicts between agents (each file owned by exactly 1 agent)
- [ ] All imports resolve correctly
- [ ] Socket.io gateway handles new call events

---

## Batch 22 Preview (Next Sprint)

After batch 21 completes and passes verification, batch 22 will focus on:

1. **E2E Testing** — Playwright/Detox test suites for critical user flows
2. **i18n / Arabic RTL** — Full Arabic translation + RTL layout support
3. **Push Notifications** — FCM/APNs integration with device token management
4. **Deep Linking** — Universal links for posts, profiles, channels, live sessions
5. **Offline Mode** — SQLite local cache + sync queue for offline-first
6. **Performance** — Image caching, lazy loading, virtualized lists optimization
7. **CI/CD** — GitHub Actions pipeline for build, test, deploy
8. **Analytics** — Event tracking, screen views, engagement metrics dashboard
9. **Content Moderation** — AI-powered content review, auto-flag, admin queue
10. **Accessibility** — Screen reader support, contrast modes, reduced motion

---

## Conflict Map Summary (All 30 Agents)

| Agent | Exclusive Files |
|-------|----------------|
| 1 | `broadcast/broadcast.service.ts`, `broadcast.controller.ts`, `dto/` |
| 2 | `live/live.service.ts`, `live.controller.ts`, `dto/` |
| 3 | `calls/calls.service.ts`, `calls.controller.ts`, `dto/` |
| 4 | `stickers/stickers.service.ts`, `stickers.controller.ts`, `dto/` |
| 5 | `collabs/collabs.service.ts`, `collabs.controller.ts`, `dto/` |
| 6 | `channel-posts/channel-posts.service.ts`, `channel-posts.controller.ts`, `dto/` |
| 7 | `audio-tracks/audio-tracks.service.ts`, `audio-tracks.controller.ts`, `dto/` |
| 8 | `feed/feed.service.ts`, `feed.controller.ts`, `dto/` |
| 9 | `posts/posts.service.ts`, `threads/threads.service.ts`, `reels/reels.service.ts` |
| 10 | `messages/messages.service.ts`, `messages/messages.controller.ts` |
| 11 | `stories/stories.service.ts`, `stories/stories.controller.ts` |
| 12 | `gateways/chat.gateway.ts` |
| 13 | `(screens)/broadcast-channels.tsx`, `(screens)/broadcast/[id].tsx` |
| 14 | `(screens)/go-live.tsx`, `(screens)/live/[id].tsx` |
| 15 | `(screens)/call/[id].tsx` |
| 16 | `components/ui/StickerPicker.tsx`, `components/ui/StickerPackBrowser.tsx` |
| 17 | `(screens)/close-friends.tsx` |
| 18 | `(screens)/pinned-messages.tsx`, `(screens)/starred-messages.tsx` |
| 19 | `components/ui/ImageLightbox.tsx` |
| 20 | `components/ui/VideoPlayer.tsx` |
| 21 | `(screens)/collab-requests.tsx` |
| 22 | `(screens)/community-posts.tsx` |
| 23 | `(screens)/conversation/[id].tsx` |
| 24 | `(screens)/create-story.tsx` |
| 25 | `(tabs)/bakra.tsx` |
| 26 | `(screens)/profile/[username].tsx` |
| 27 | `services/api.ts`, `types/index.ts` |
| 28 | `store/index.ts` |
| 29 | `app.module.ts`, 8 new `.module.ts` files |
| 30 | 8 new `.controller.spec.ts` files |

**Zero file conflicts guaranteed.** Each file has exactly one owner.
