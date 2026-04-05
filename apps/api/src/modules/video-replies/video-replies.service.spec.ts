import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { VideoRepliesService } from './video-replies.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('VideoRepliesService', () => {
  let service: VideoRepliesService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        VideoRepliesService,
        {
          provide: PrismaService,
          useValue: {
            videoReply: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
            comment: { findUnique: jest.fn().mockResolvedValue({ id: 'c1' }) },
            reelComment: { findUnique: jest.fn().mockResolvedValue({ id: 'rc1' }) },
            user: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
      ],
    }).compile();
    service = module.get(VideoRepliesService);
    prisma = module.get(PrismaService) as any;
  });

  describe('create', () => {
    it('should create video reply for post comment', async () => {
      prisma.videoReply.create.mockResolvedValue({ id: 'vr1', commentId: 'c1', mediaUrl: 'https://media.mizanly.app/videos/u1/v.mp4' });
      const result = await service.create('u1', { commentId: 'c1', commentType: 'POST', mediaUrl: 'https://media.mizanly.app/videos/u1/v.mp4' });
      expect(result.id).toBe('vr1');
    });

    it('should create video reply for reel comment', async () => {
      prisma.videoReply.create.mockResolvedValue({ id: 'vr2' });
      const result = await service.create('u1', { commentId: 'rc1', commentType: 'REEL', mediaUrl: 'https://media.mizanly.app/videos/u1/v.mp4' });
      expect(result).toBeDefined();
      expect(result).toHaveProperty('id', 'vr2');
    });

    it('should throw for invalid commentType', async () => {
      await expect(service.create('u1', { commentId: 'c1', commentType: 'INVALID' as any, mediaUrl: 'https://media.mizanly.app/videos/u1/v.mp4' }))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw for empty mediaUrl', async () => {
      await expect(service.create('u1', { commentId: 'c1', commentType: 'POST', mediaUrl: '' }))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw for invalid URL', async () => {
      await expect(service.create('u1', { commentId: 'c1', commentType: 'POST', mediaUrl: 'not-a-url' }))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw for external URL (non-storage domain)', async () => {
      await expect(service.create('u1', { commentId: 'c1', commentType: 'POST', mediaUrl: 'https://evil.com/payload.mp4' }))
        .rejects.toThrow('mediaUrl must point to application-owned storage');
    });

    it('should throw for HTTP URL (non-HTTPS)', async () => {
      await expect(service.create('u1', { commentId: 'c1', commentType: 'POST', mediaUrl: 'http://media.mizanly.app/v.mp4' }))
        .rejects.toThrow('mediaUrl must point to application-owned storage');
    });

    it('should accept valid storage URL', async () => {
      prisma.videoReply.create.mockResolvedValue({ id: 'vr3', commentId: 'c1', mediaUrl: 'https://media.mizanly.app/videos/u1/v.mp4' });
      const result = await service.create('u1', { commentId: 'c1', commentType: 'POST', mediaUrl: 'https://media.mizanly.app/videos/u1/v.mp4' });
      expect(result.id).toBe('vr3');
    });

    it('should throw if duration out of range', async () => {
      await expect(service.create('u1', { commentId: 'c1', commentType: 'POST', mediaUrl: 'https://media.mizanly.app/videos/u1/v.mp4', duration: 500 }))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw if comment not found', async () => {
      prisma.comment.findUnique.mockResolvedValue(null);
      await expect(service.create('u1', { commentId: 'missing', commentType: 'POST', mediaUrl: 'https://media.mizanly.app/videos/u1/v.mp4' }))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('getByComment', () => {
    it('should return paginated video replies', async () => {
      prisma.videoReply.findMany.mockResolvedValue([{ id: 'vr1', userId: 'u1' }]);
      const result = await service.getByComment('c1');
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('getById', () => {
    it('should return video reply', async () => {
      prisma.videoReply.findUnique.mockResolvedValue({ id: 'vr1', isDeleted: false, viewsCount: 10 });
      const result = await service.getById('vr1');
      expect(result.viewsCount).toBe(10);
    });

    it('should throw for deleted reply', async () => {
      prisma.videoReply.findUnique.mockResolvedValue({ id: 'vr1', isDeleted: true });
      await expect(service.getById('vr1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should soft-delete own reply', async () => {
      prisma.videoReply.findUnique.mockResolvedValue({ id: 'vr1', userId: 'u1', isDeleted: false });
      prisma.videoReply.update.mockResolvedValue({});
      const result = await service.delete('vr1', 'u1');
      expect(result.deleted).toBe(true);
    });

    it('should throw ForbiddenException for non-owner', async () => {
      prisma.videoReply.findUnique.mockResolvedValue({ id: 'vr1', userId: 'other', isDeleted: false });
      await expect(service.delete('vr1', 'u1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── T05 gap: delete already-deleted reply ──

  describe('delete (already deleted)', () => {
    it('should throw NotFoundException when reply already deleted', async () => {
      prisma.videoReply.findUnique.mockResolvedValue({ id: 'vr1', userId: 'u1', isDeleted: true });
      await expect(service.delete('vr1', 'u1')).rejects.toThrow(NotFoundException);
    });
  });

  // ── T05 gap: create REEL comment not found ──

  describe('create (REEL comment not found)', () => {
    it('should throw NotFoundException when reel comment does not exist', async () => {
      prisma.reelComment.findUnique.mockResolvedValue(null);
      await expect(service.create('u1', {
        commentId: 'missing-reel-comment',
        commentType: 'REEL',
        mediaUrl: 'https://media.mizanly.app/videos/u1/v.mp4',
      })).rejects.toThrow(NotFoundException);
    });
  });

  // ── T05 gap: getByComment hasMore=true ──

  describe('getByComment (hasMore=true)', () => {
    it('should return hasMore=true when more items available', async () => {
      const items = Array.from({ length: 21 }, (_, i) => ({ id: `vr${i}`, userId: 'u1' }));
      prisma.videoReply.findMany.mockResolvedValue(items);

      const result = await service.getByComment('c1');
      expect(result.meta.hasMore).toBe(true);
      expect(result.data.length).toBe(20);
      expect(result.meta.cursor).toBe('vr19');
    });
  });

  // ── T05 gap: getByComment user enrichment ──

  describe('getByComment (user enrichment)', () => {
    it('should enrich video replies with user data', async () => {
      prisma.videoReply.findMany.mockResolvedValue([
        { id: 'vr1', userId: 'u1' },
        { id: 'vr2', userId: 'u2' },
      ]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'u1', username: 'alice', displayName: 'Alice', avatarUrl: null },
        { id: 'u2', username: 'bob', displayName: 'Bob', avatarUrl: null },
      ]);

      const result = await service.getByComment('c1');
      expect(result.data[0].user).toEqual(expect.objectContaining({ username: 'alice' }));
      expect(result.data[1].user).toEqual(expect.objectContaining({ username: 'bob' }));
    });
  });
});
