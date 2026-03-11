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