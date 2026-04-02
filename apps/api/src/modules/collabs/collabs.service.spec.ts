import { Test } from '@nestjs/testing';
import { CollabsService } from './collabs.service';
import { PrismaService } from '../../config/prisma.service';
import { NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('CollabsService', () => {
  let service: CollabsService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      post: { findUnique: jest.fn() },
      postCollab: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      user: { findUnique: jest.fn() },
      block: { findFirst: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,CollabsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(CollabsService);
  });

  describe('invite', () => {
    it('creates collab invite', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'post1', userId: 'user1' });
      prisma.user.findUnique.mockResolvedValue({ id: 'user2', isBanned: false, isDeactivated: false, isDeleted: false });
      prisma.block.findFirst.mockResolvedValue(null);
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

    it('rejects duplicate invite (P2002)', async () => {
      const { PrismaClientKnownRequestError } = require('@prisma/client/runtime/library');
      prisma.post.findUnique.mockResolvedValue({ id: 'post1', userId: 'user1' });
      prisma.user.findUnique.mockResolvedValue({ id: 'user2', isBanned: false, isDeactivated: false, isDeleted: false });
      prisma.block.findFirst.mockResolvedValue(null);
      prisma.postCollab.create.mockRejectedValue(
        new PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: '0' }),
      );
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

    it('rejects accept by wrong user', async () => {
      prisma.postCollab.findUnique.mockResolvedValue({ id: 'c1', userId: 'user2', status: 'PENDING' });
      await expect(service.accept('c1', 'wrong-user')).rejects.toThrow();
    });
  });

  describe('decline', () => {
    it('declines a pending collab', async () => {
      prisma.postCollab.findUnique.mockResolvedValue({ id: 'c1', userId: 'user2', status: 'PENDING' });
      prisma.postCollab.update.mockResolvedValue({ id: 'c1', status: 'DECLINED' });
      const result = await service.decline('c1', 'user2');
      expect(result.status).toBe('DECLINED');
    });
  });

  describe('remove', () => {
    it('removes a collab by the invited user', async () => {
      prisma.postCollab.findUnique.mockResolvedValue({ id: 'c1', userId: 'user2', status: 'PENDING', postId: 'post1' });
      prisma.postCollab.delete.mockResolvedValue({ id: 'c1' });
      await service.remove('c1', 'user2');
      expect(prisma.postCollab.delete).toHaveBeenCalled();
    });
  });

  describe('getPostCollabs', () => {
    it('lists collabs for a post', async () => {
      prisma.postCollab.findMany.mockResolvedValue([{ id: 'c1', status: 'ACCEPTED' }]);
      const result = await service.getPostCollabs('post1');
      expect(result).toHaveLength(1);
    });

    it('returns empty array for post with no collabs', async () => {
      prisma.postCollab.findMany.mockResolvedValue([]);
      const result = await service.getPostCollabs('post1');
      expect(result).toEqual([]);
    });
  });

  describe('getAcceptedCollabs', () => {
    it('lists accepted collabs for a user', async () => {
      prisma.postCollab.findMany.mockResolvedValue([
        { id: 'c1', status: 'ACCEPTED', post: { id: 'p1' } },
      ]);
      const result = await service.getAcceptedCollabs('user2');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('c1');
    });
  });

  // ── T02 gap: accept non-PENDING status ──

  describe('accept (non-PENDING)', () => {
    it('should throw BadRequestException if collab is not PENDING', async () => {
      prisma.postCollab.findUnique.mockResolvedValue({ id: 'c1', userId: 'user2', status: 'ACCEPTED' });
      await expect(service.accept('c1', 'user2')).rejects.toThrow(BadRequestException);
    });
  });

  // ── T02 gap: decline wrong user ──

  describe('decline (wrong user)', () => {
    it('should throw ForbiddenException if user is not the invited user', async () => {
      prisma.postCollab.findUnique.mockResolvedValue({ id: 'c1', userId: 'user2', status: 'PENDING' });
      await expect(service.decline('c1', 'wrong-user')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── T02 gap: remove by post owner ──

  describe('remove (by post owner)', () => {
    it('should allow post owner to remove collab', async () => {
      prisma.postCollab.findUnique.mockResolvedValue({ id: 'c1', userId: 'user2', status: 'PENDING', postId: 'post1' });
      prisma.post.findUnique.mockResolvedValue({ id: 'post1', userId: 'owner1' });
      prisma.postCollab.delete.mockResolvedValue({ id: 'c1' });

      const result = await service.remove('c1', 'owner1');
      expect(result).toEqual({ removed: true });
      expect(prisma.postCollab.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    });
  });

  // ── T02 gap: remove by third party (forbidden) ──

  describe('remove (third party)', () => {
    it('should throw ForbiddenException for non-owner non-invited user', async () => {
      prisma.postCollab.findUnique.mockResolvedValue({ id: 'c1', userId: 'user2', status: 'PENDING', postId: 'post1' });
      prisma.post.findUnique.mockResolvedValue({ id: 'post1', userId: 'owner1' });

      await expect(service.remove('c1', 'stranger')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── T02 gap: remove collab not found ──

  describe('remove (not found)', () => {
    it('should throw NotFoundException when collab does not exist', async () => {
      prisma.postCollab.findUnique.mockResolvedValue(null);
      await expect(service.remove('missing', 'user1')).rejects.toThrow(NotFoundException);
    });
  });

  // ── T02 gap: getMyPending ──

  describe('getMyPending', () => {
    it('should return pending collabs for the user', async () => {
      prisma.postCollab.findMany.mockResolvedValue([
        { id: 'c1', status: 'PENDING', post: { id: 'p1' } },
      ]);
      const result = await service.getMyPending('user2');
      expect(result).toHaveLength(1);
      expect(prisma.postCollab.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: 'user2', status: 'PENDING' },
      }));
    });
  });
});