/**
 * Batch authorization matrix tests for Tasks 56-70.
 * Tests ownership/access checks across smaller services.
 * Each service gets 4 tests — owner-allowed, non-owner-rejected patterns.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { globalMockProviders } from '../common/test/mock-providers';

// Task 56: Circles
import { CommunitiesService } from '../modules/communities/communities.service';

import { DraftsService } from '../modules/drafts/drafts.service';

describe('Authorization Matrix — batch tests (Tasks 56-70)', () => {
  // ── Task 56: CommunitiesService circle ownership ──
  describe('CommunitiesService — circle auth', () => {
    let service: CommunitiesService;
    let prisma: any;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders,
          CommunitiesService,
          {
            provide: PrismaService,
            useValue: {
              circle: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
              circleMember: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), delete: jest.fn() },
              circleRole: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
              $transaction: jest.fn(),
            },
          },
        ],
      }).compile();
      service = module.get(CommunitiesService);
      prisma = module.get(PrismaService);
    });

    it('should throw ForbiddenException when non-owner updates circle', async () => {
      prisma.circle.findUnique.mockResolvedValue({ id: 'c-1', ownerId: 'user-a' });
      await expect(service.update('c-1', 'user-b', {} as any)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when non-owner deletes circle', async () => {
      prisma.circle.findUnique.mockResolvedValue({ id: 'c-1', ownerId: 'user-a' });
      await expect(service.delete('c-1', 'user-b')).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for non-existent circle join', async () => {
      prisma.circle.findUnique.mockResolvedValue(null);
      await expect(service.join('nonexistent', 'user-a')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for non-existent circle leave', async () => {
      prisma.circle.findUnique.mockResolvedValue(null);
      await expect(service.leave('nonexistent', 'user-a')).rejects.toThrow(NotFoundException);
    });
  });

  // ── Task 69: DraftsService — ownership checks ──
  describe('DraftsService — draft auth', () => {
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
                findUnique: jest.fn(),
                findMany: jest.fn().mockResolvedValue([]),
                create: jest.fn(),
                update: jest.fn(),
                delete: jest.fn(),
                deleteMany: jest.fn(),
              },
            },
          },
        ],
      }).compile();
      service = module.get(DraftsService);
      prisma = module.get(PrismaService);
    });

    it('should throw ForbiddenException when non-owner views draft', async () => {
      prisma.draftPost.findUnique.mockResolvedValue({ id: 'd-1', userId: 'user-a' });
      await expect(service.getDraft('d-1', 'user-b')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when non-owner updates draft', async () => {
      prisma.draftPost.findUnique.mockResolvedValue({ id: 'd-1', userId: 'user-a' });
      await expect(service.updateDraft('d-1', 'user-b', {})).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when non-owner deletes draft', async () => {
      prisma.draftPost.findUnique.mockResolvedValue({ id: 'd-1', userId: 'user-a' });
      await expect(service.deleteDraft('d-1', 'user-b')).rejects.toThrow(ForbiddenException);
    });

    it('should allow owner to view own draft', async () => {
      prisma.draftPost.findUnique.mockResolvedValue({ id: 'd-1', userId: 'user-a', data: {} });
      const result = await service.getDraft('d-1', 'user-a');
      expect(result).toBeDefined();
      expect(result).toHaveProperty('id', 'd-1');
    });
  });
});
