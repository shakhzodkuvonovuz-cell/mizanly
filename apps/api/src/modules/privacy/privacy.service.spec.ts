import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { PrivacyService } from './privacy.service';
import { UploadService } from '../upload/upload.service';
import { QueueService } from '../../common/queue/queue.service';
import { globalMockProviders } from '../../common/test/mock-providers';

const mockUploadService = {
  provide: UploadService,
  useValue: {
    deleteFile: jest.fn().mockResolvedValue({ deleted: true, key: 'test' }),
  },
};

const mockQueueService = {
  provide: QueueService,
  useValue: {
    addSearchIndexJob: jest.fn().mockResolvedValue('job-id'),
  },
};

/** Creates a Proxy that returns jest.fn() mocks for any model.method access */
function createTxProxy(): any {
  return new Proxy({}, {
    get(_target, prop) {
      // Return an object whose methods are all jest.fn() returning resolved values
      return new Proxy({}, {
        get(_t, method) {
          return jest.fn().mockResolvedValue(method === 'update' ? {} : { count: 0 });
        },
      });
    },
  });
}

describe('PrivacyService', () => {
  let service: PrivacyService;
  let module: TestingModule;
  let prisma: any;
  let uploadService: any;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        mockUploadService,
        mockQueueService,
        PrivacyService,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: jest.fn(), update: jest.fn() },
            post: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
            thread: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
            story: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
            reel: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
            video: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
            message: { findMany: jest.fn().mockResolvedValue([]) },
            follow: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
            comment: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
            postReaction: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
            profileLink: { deleteMany: jest.fn() },
            twoFactorSecret: { deleteMany: jest.fn() },
            encryptionKey: { deleteMany: jest.fn() },
            device: { deleteMany: jest.fn(), updateMany: jest.fn() },
            block: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
            mute: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
            savedPost: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
            notification: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
            threadReply: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
            userSettings: { findUnique: jest.fn().mockResolvedValue(null), deleteMany: jest.fn() },
            watchHistory: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
            reelComment: { findMany: jest.fn().mockResolvedValue([]) },
            reelReaction: { findMany: jest.fn().mockResolvedValue([]) },
            videoReaction: { findMany: jest.fn().mockResolvedValue([]) },
            videoComment: { findMany: jest.fn().mockResolvedValue([]) },
            circleMember: { findMany: jest.fn().mockResolvedValue([]) },
            report: { findMany: jest.fn().mockResolvedValue([]) },
            tip: { findMany: jest.fn().mockResolvedValue([]) },
            coinTransaction: { findMany: jest.fn().mockResolvedValue([]) },
            dhikrSession: { findMany: jest.fn().mockResolvedValue([]) },
            fastingLog: { findMany: jest.fn().mockResolvedValue([]) },
            searchHistory: { findMany: jest.fn().mockResolvedValue([]) },
            conversationKeyEnvelope: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
            userStreak: { deleteMany: jest.fn() },
            voicePost: { findMany: jest.fn().mockResolvedValue([]) },
            hifzProgress: { findMany: jest.fn().mockResolvedValue([]) },
            hajjProgress: { findMany: jest.fn().mockResolvedValue([]) },
            forumThread: { findMany: jest.fn().mockResolvedValue([]) },
            forumReply: { findMany: jest.fn().mockResolvedValue([]) },
            scholarQuestion: { findMany: jest.fn().mockResolvedValue([]) },
            channelPost: { findMany: jest.fn().mockResolvedValue([]) },
            duaBookmark: { findMany: jest.fn().mockResolvedValue([]) },
            // $transaction uses a Proxy to mock any model access inside the callback
            $transaction: jest.fn().mockImplementation((fn: (tx: any) => Promise<void>) => fn(createTxProxy())),
          },
        },
      ],
    }).compile();
    service = module.get(PrivacyService);
    prisma = module.get(PrismaService) as any;
    uploadService = module.get(UploadService) as any;
  });

  describe('exportUserData', () => {
    it('should return user data export', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', username: 'user1', profileLinks: [] });
      const result = await service.exportUserData('u1');
      expect(result.profile).toBeDefined();
      expect(result.posts).toBeDefined();
      expect(result.threads).toBeDefined();
      expect(result.stories).toBeDefined();
      expect(result.reels).toBeDefined();
      expect(result.messages).toBeDefined();
      expect(result.comments).toBeDefined();
      expect(result.postReactions).toBeDefined();
      expect(result.following).toBeDefined();
      expect(result.exportedAt).toBeDefined();
    });

    it('should throw NotFoundException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.exportUserData('u1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteAllUserData', () => {
    const validUser = { id: 'u1', username: 'testuser', isDeleted: false, avatarUrl: null, coverUrl: null };

    it('should soft-delete user data', async () => {
      prisma.user.findUnique.mockResolvedValue(validUser);
      const result = await service.deleteAllUserData('u1');
      expect(result.deleted).toBe(true);
      expect(result.userId).toBe('u1');
    });

    it('should throw NotFoundException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.deleteAllUserData('u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if already deleted', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', username: 'x', isDeleted: true });
      await expect(service.deleteAllUserData('u1')).rejects.toThrow(NotFoundException);
    });

    it('should call $transaction for soft-delete', async () => {
      prisma.user.findUnique.mockResolvedValue(validUser);
      await service.deleteAllUserData('u1');
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should queue Meilisearch delete jobs for user content', async () => {
      prisma.user.findUnique.mockResolvedValue(validUser);
      prisma.post.findMany.mockResolvedValueOnce([{ id: 'p1', mediaUrls: [] }]);
      prisma.reel.findMany.mockResolvedValueOnce([{ id: 'r1', videoUrl: null, thumbnailUrl: null }]);
      prisma.story.findMany.mockResolvedValueOnce([]);
      prisma.video.findMany.mockResolvedValueOnce([{ id: 'v1', videoUrl: null, thumbnailUrl: null }]);
      prisma.thread.findMany.mockResolvedValueOnce([{ id: 't1' }]);

      const queueService = module.get(QueueService) as any;
      queueService.addSearchIndexJob.mockClear();

      await service.deleteAllUserData('u1');

      // Should queue delete jobs for: 1 post + 1 reel + 1 thread + 1 video + 1 user = 5
      expect(queueService.addSearchIndexJob).toHaveBeenCalledTimes(5);
      expect(queueService.addSearchIndexJob).toHaveBeenCalledWith({ action: 'delete', indexName: 'posts', documentId: 'p1' });
      expect(queueService.addSearchIndexJob).toHaveBeenCalledWith({ action: 'delete', indexName: 'users', documentId: 'u1' });
    });

    it('should delete R2 media files for user content (FIX 2.2)', async () => {
      uploadService.deleteFile.mockClear();
      prisma.user.findUnique.mockResolvedValue({
        ...validUser,
        avatarUrl: 'https://media.mizanly.app/avatars/u1/abc.jpg',
        coverUrl: 'https://media.mizanly.app/covers/u1/def.jpg',
      });
      prisma.post.findMany.mockResolvedValueOnce([{ id: 'p1', mediaUrls: ['https://media.mizanly.app/posts/u1/img1.jpg', 'https://media.mizanly.app/posts/u1/img2.jpg'] }]);
      prisma.reel.findMany.mockResolvedValueOnce([{ id: 'r1', videoUrl: 'https://media.mizanly.app/reels/u1/vid.mp4', thumbnailUrl: 'https://media.mizanly.app/thumbnails/u1/thumb.jpg' }]);
      prisma.story.findMany.mockResolvedValueOnce([{ mediaUrl: 'https://media.mizanly.app/stories/u1/story.jpg', thumbnailUrl: null }]);
      prisma.video.findMany.mockResolvedValueOnce([{ id: 'v1', videoUrl: 'https://media.mizanly.app/videos/u1/vid.mp4', thumbnailUrl: 'https://media.mizanly.app/thumbnails/u1/vthumb.jpg' }]);
      prisma.thread.findMany.mockResolvedValueOnce([]);

      await service.deleteAllUserData('u1');

      // Should have called deleteFile for: avatar, cover, 2 post images, reel video+thumb, story media, video url+thumb = 9
      // Use setTimeout to let fire-and-forget Promise.allSettled resolve
      await new Promise((r) => setTimeout(r, 50));
      expect(uploadService.deleteFile).toHaveBeenCalledTimes(9);
      expect(uploadService.deleteFile).toHaveBeenCalledWith('avatars/u1/abc.jpg');
      expect(uploadService.deleteFile).toHaveBeenCalledWith('covers/u1/def.jpg');
      expect(uploadService.deleteFile).toHaveBeenCalledWith('posts/u1/img1.jpg');
      expect(uploadService.deleteFile).toHaveBeenCalledWith('reels/u1/vid.mp4');
    });

    it('should skip external URLs when deleting R2 media', async () => {
      uploadService.deleteFile.mockClear();
      prisma.user.findUnique.mockResolvedValue({
        ...validUser,
        avatarUrl: 'https://external.cdn.com/avatar.jpg',
        coverUrl: null,
      });
      prisma.post.findMany.mockResolvedValueOnce([]);
      prisma.reel.findMany.mockResolvedValueOnce([]);
      prisma.story.findMany.mockResolvedValueOnce([]);
      prisma.video.findMany.mockResolvedValueOnce([]);
      prisma.thread.findMany.mockResolvedValueOnce([]);

      await service.deleteAllUserData('u1');
      await new Promise((r) => setTimeout(r, 50));
      expect(uploadService.deleteFile).not.toHaveBeenCalled();
    });
  });

  describe('exportUserData — with data', () => {
    it('should include posts, threads, stories in export', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', username: 'user1', profileLinks: [], channel: null });
      prisma.post.findMany.mockResolvedValue([{ id: 'p1', content: 'hello', mediaUrls: [], createdAt: new Date() }]);
      prisma.thread.findMany.mockResolvedValue([{ id: 't1', content: 'thread', createdAt: new Date() }]);
      prisma.story.findMany.mockResolvedValue([{ id: 's1', mediaUrl: 'url', createdAt: new Date() }]);
      prisma.message.findMany.mockResolvedValue([{ id: 'm1', content: 'msg', createdAt: new Date() }]);
      prisma.follow.findMany.mockResolvedValue([{ followingId: 'f1' }, { followingId: 'f2' }]);

      const result = await service.exportUserData('u1');
      expect(result.posts).toHaveLength(1);
      expect(result.threads).toHaveLength(1);
      expect(result.stories).toHaveLength(1);
      expect(result.messages.count).toBe(1);
      expect(result.following).toHaveLength(2);
    });

    it('should return empty arrays when user has no content', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', username: 'empty', profileLinks: [], channel: null });
      const result = await service.exportUserData('u1');
      expect(result.posts).toEqual([]);
      expect(result.threads).toEqual([]);
      expect(result.stories).toEqual([]);
      expect(result.messages.count).toBe(0);
      expect(result.following).toEqual([]);
    });

    it('should include exportedAt timestamp', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', username: 'user1', profileLinks: [], channel: null });
      const result = await service.exportUserData('u1');
      expect(result.exportedAt).toBeDefined();
      expect(typeof result.exportedAt).toBe('string');
    });
  });
});
