/**
 * Comprehensive authorization + abuse tests batch.
 * Covers remaining Tasks 50-70 auth matrix + Tasks 96-110 abuse vectors.
 * Each describe block maps to 1 service with 4-6 tests.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { globalMockProviders } from '../common/test/mock-providers';

// Service imports
import { FollowsService } from '../modules/follows/follows.service';
import { DraftsService } from '../modules/drafts/drafts.service';
import { SchedulingService } from '../modules/scheduling/scheduling.service';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { GiftsService } from '../modules/gifts/gifts.service';
import { MessagesService } from '../modules/messages/messages.service';

describe('Comprehensive Auth + Abuse — batch tests', () => {
  // ── Follows — additional auth + abuse tests ──
  describe('FollowsService — comprehensive', () => {
    let service: FollowsService;
    let prisma: any;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders,
          FollowsService,
          {
            provide: PrismaService,
            useValue: {
              user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
              follow: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
              followRequest: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
              block: { findFirst: jest.fn().mockResolvedValue(null) },
              $transaction: jest.fn().mockResolvedValue([{}, {}, {}]),
              $executeRaw: jest.fn(),
            },
          },
          { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue({ id: 'n-1' }) } },
        ],
      }).compile();
      service = module.get(FollowsService);
      prisma = module.get(PrismaService);
    });

    it('should reject self-follow as abuse vector', async () => {
      await expect(service.follow('u1', 'u1')).rejects.toThrow(BadRequestException);
    });

    it('should reject follow when blocked', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', isPrivate: false, isDeactivated: false, isBanned: false });
      prisma.block.findFirst.mockResolvedValue({ id: 'b-1' });
      await expect(service.follow('u1', 'u2')).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for deactivated user follow', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', isPrivate: false, isDeactivated: true, isBanned: false });
      await expect(service.follow('u1', 'u2')).rejects.toThrow(NotFoundException);
    });

    it('should be idempotent for already-following', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', isPrivate: false, isDeactivated: false, isBanned: false });
      prisma.follow.findUnique.mockResolvedValue({ followerId: 'u1', followingId: 'u2' });
      const result = await service.follow('u1', 'u2');
      expect(result.type).toBe('follow');
    });

    it('should return empty followers for user with no followers', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      const result = await service.getFollowers('u1');
      expect(result.data).toEqual([]);
    });

    it('should return empty following for user following no one', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      const result = await service.getFollowing('u1');
      expect(result.data).toEqual([]);
    });

    it('should throw NotFoundException when accepting non-existent request', async () => {
      prisma.followRequest.findUnique.mockResolvedValue(null);
      await expect(service.acceptRequest('u1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when declining non-existent request', async () => {
      prisma.followRequest.findUnique.mockResolvedValue(null);
      await expect(service.declineRequest('u1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when wrong user accepts request', async () => {
      prisma.followRequest.findUnique.mockResolvedValue({ id: 'req-1', senderId: 'u2', receiverId: 'u1', status: 'PENDING' });
      await expect(service.acceptRequest('wrong-user', 'req-1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when wrong user declines request', async () => {
      prisma.followRequest.findUnique.mockResolvedValue({ id: 'req-1', senderId: 'u2', receiverId: 'u1', status: 'PENDING' });
      await expect(service.declineRequest('wrong-user', 'req-1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when wrong user cancels request', async () => {
      prisma.followRequest.findUnique.mockResolvedValue({ id: 'req-1', senderId: 'u1', receiverId: 'u2' });
      await expect(service.cancelRequest('wrong-user', 'req-1')).rejects.toThrow(ForbiddenException);
    });

    it('should return own pending follow requests', async () => {
      const result = await service.getOwnRequests('u1');
      expect(result).toEqual([]);
    });
  });

  // ── Drafts — auth + abuse ──
  describe('DraftsService — comprehensive', () => {
    let service: DraftsService;
    let prisma: any;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          DraftsService,
          {
            provide: PrismaService,
            useValue: {
              draftPost: {
                findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]),
                create: jest.fn(), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn(),
              },
            },
          },
        ],
      }).compile();
      service = module.get(DraftsService);
      prisma = module.get(PrismaService);
    });

    it('should throw ForbiddenException when non-owner views draft', async () => {
      prisma.draftPost.findUnique.mockResolvedValue({ id: 'd-1', userId: 'u1' });
      await expect(service.getDraft('d-1', 'u2')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when non-owner updates draft', async () => {
      prisma.draftPost.findUnique.mockResolvedValue({ id: 'd-1', userId: 'u1' });
      await expect(service.updateDraft('d-1', 'u2', {})).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when non-owner deletes draft', async () => {
      prisma.draftPost.findUnique.mockResolvedValue({ id: 'd-1', userId: 'u1' });
      await expect(service.deleteDraft('d-1', 'u2')).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for non-existent draft', async () => {
      prisma.draftPost.findUnique.mockResolvedValue(null);
      await expect(service.getDraft('nonexistent', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid space', async () => {
      await expect(service.saveDraft('u1', 'INVALID_SPACE', {})).rejects.toThrow(BadRequestException);
    });

    it('should create draft with valid space', async () => {
      prisma.draftPost.create.mockResolvedValue({ id: 'd-1', userId: 'u1', space: 'SAF' });
      const result = await service.saveDraft('u1', 'SAF', { content: 'test' });
      expect(result).toBeDefined();
    });

    it('should return only own drafts', async () => {
      const result = await service.getDrafts('u1');
      expect(prisma.draftPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'u1' }) }),
      );
    });

    it('should delete all own drafts only', async () => {
      prisma.draftPost.deleteMany.mockResolvedValue({ count: 3 });
      const result = await service.deleteAllDrafts('u1');
      expect(prisma.draftPost.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'u1' }) }),
      );
    });
  });

  // ── Gifts — additional abuse vectors ──
  describe('GiftsService — additional abuse', () => {
    let service: GiftsService;
    let prisma: any;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders,
          GiftsService,
          {
            provide: PrismaService,
            useValue: {
              coinBalance: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
              giftRecord: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
              coinTransaction: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
              user: { findUnique: jest.fn() },
              $transaction: jest.fn().mockResolvedValue([{ id: 'g-1', senderId: 'u1', receiverId: 'u2' }, {}, {}, {}, {}]),
            },
          },
        ],
      }).compile();
      service = module.get(GiftsService);
      prisma = module.get(PrismaService);
    });

    it('should reject self-gift', async () => {
      await expect(service.sendGift('u1', { receiverId: 'u1', giftType: 'rose' }))
        .rejects.toThrow(BadRequestException);
    });

    it('should reject non-existent gift type', async () => {
      await expect(service.sendGift('u1', { receiverId: 'u2', giftType: 'fake' }))
        .rejects.toThrow(NotFoundException);
    });

    it('should reject negative coin purchase', async () => {
      await expect(service.purchaseCoins('u1', -100)).rejects.toThrow(BadRequestException);
    });

    it('should reject zero coin purchase', async () => {
      await expect(service.purchaseCoins('u1', 0)).rejects.toThrow(BadRequestException);
    });

    it('should reject non-integer coin purchase', async () => {
      await expect(service.purchaseCoins('u1', 1.5)).rejects.toThrow(BadRequestException);
    });

    it('should reject insufficient balance gift', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2' });
      prisma.coinBalance.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.sendGift('u1', { receiverId: 'u2', giftType: 'diamond' }))
        .rejects.toThrow(BadRequestException);
    });

    it('should return valid catalog', () => {
      const catalog = service.getCatalog();
      expect(catalog.length).toBeGreaterThan(0);
      for (const item of catalog) {
        expect(item.type).toBeDefined();
        expect(item.coins).toBeGreaterThan(0);
        expect(item.animation).toBeDefined();
      }
    });

    it('should return own balance (upsert creates if not exist)', async () => {
      prisma.coinBalance.upsert.mockResolvedValue({ userId: 'u1', coins: 0, diamonds: 0 });
      const result = await service.getBalance('u1');
      expect(result.coins).toBe(0);
      expect(result.diamonds).toBe(0);
    });
  });

  // ── Messages — additional abuse vectors ──
  describe('MessagesService — additional abuse', () => {
    let service: MessagesService;
    let prisma: any;
    const mockMembership = { userId: 'u1', isMuted: false, isArchived: false, isBanned: false };

    beforeEach(async () => {
      const txPrisma = {
        message: { create: jest.fn().mockResolvedValue({ id: 'msg-tx', content: 'test', messageType: 'TEXT' }) },
        conversation: { update: jest.fn() },
        conversationMember: { updateMany: jest.fn() },
      };

      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders,
          MessagesService,
          {
            provide: PrismaService,
            useValue: {
              conversationMember: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(mockMembership), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), createMany: jest.fn(), delete: jest.fn() },
              conversation: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
              message: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn().mockResolvedValue(0) },
              block: { findFirst: jest.fn() },
              messageReaction: { upsert: jest.fn(), deleteMany: jest.fn() },
              user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
              dMNote: { upsert: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
              $transaction: jest.fn().mockImplementation(async (fn: unknown) => {
                if (typeof fn === 'function') return fn(txPrisma);
                return Promise.all(fn as Promise<unknown>[]);
              }),
            },
          },
        ],
      }).compile();
      service = module.get(MessagesService);
      prisma = module.get(PrismaService);
    });

    it('should reject empty content without media', async () => {
      await expect(service.sendMessage('conv-1', 'u1', {})).rejects.toThrow(BadRequestException);
    });

    it('should reject forward to empty target list', async () => {
      await expect(service.forwardMessage('msg-1', 'u1', [])).rejects.toThrow(BadRequestException);
    });

    it('should reject forward to >5 targets', async () => {
      await expect(service.forwardMessage('msg-1', 'u1', ['a', 'b', 'c', 'd', 'e', 'f']))
        .rejects.toThrow(BadRequestException);
    });

    it('should reject DM to self', async () => {
      await expect(service.createDM('u1', 'u1')).rejects.toThrow(BadRequestException);
    });

    it('should reject DM when blocked', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2' });
      prisma.block.findFirst.mockResolvedValue({ id: 'b-1' });
      await expect(service.createDM('u1', 'u2')).rejects.toThrow(ForbiddenException);
    });

    it('should reject editing deleted message', async () => {
      prisma.message.findUnique.mockResolvedValue({ id: 'm-1', senderId: 'u1', isDeleted: true, createdAt: new Date() });
      await expect(service.editMessage('m-1', 'u1', 'new')).rejects.toThrow(BadRequestException);
    });

    it('should reject editing old message (>15 min)', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'm-1', senderId: 'u1', isDeleted: false, createdAt: new Date(Date.now() - 20 * 60000),
      });
      await expect(service.editMessage('m-1', 'u1', 'new')).rejects.toThrow(BadRequestException);
    });

    it('should reject group name update for non-group', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c-1', isGroup: false, createdById: 'u1' });
      await expect(service.updateGroup('c-1', 'u1', { groupName: 'test' })).rejects.toThrow(BadRequestException);
    });

    it('should reject empty group name', async () => {
      await expect(service.createGroup('u1', '', ['u2'])).rejects.toThrow(BadRequestException);
    });

    it('should reject owner leaving group', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c-1', createdById: 'u1' });
      await expect(service.leaveGroup('c-1', 'u1')).rejects.toThrow(BadRequestException);
    });

    it('should reject non-positive disappearing timer', async () => {
      await expect(service.setDisappearingTimer('c-1', 'u1', 0)).rejects.toThrow(BadRequestException);
    });

    it('should reject scheduled message in the past', async () => {
      await expect(service.scheduleMessage('c-1', 'u1', 'test', new Date(Date.now() - 60000)))
        .rejects.toThrow(BadRequestException);
    });
  });
});
