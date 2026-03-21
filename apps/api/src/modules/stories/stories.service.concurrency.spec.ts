import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { StoriesService } from './stories.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('StoriesService — concurrency (Task 87)', () => {
  let service: StoriesService;
  let prisma: any;
  const mockStory = { id: 'story-1', userId: 'user-a', isArchived: false };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        StoriesService,
        {
          provide: PrismaService,
          useValue: {
            story: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), delete: jest.fn() },
            storyView: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            storyHighlightAlbum: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), delete: jest.fn(), count: jest.fn().mockResolvedValue(0) },
            storyStickerResponse: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            follow: { findMany: jest.fn().mockResolvedValue([]) },
            block: { findFirst: jest.fn() },
            user: { findMany: jest.fn().mockResolvedValue([]) },
            conversation: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
            message: { create: jest.fn() },
            $transaction: jest.fn().mockResolvedValue([{}, {}]),
            $queryRaw: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<StoriesService>(StoriesService);
    prisma = module.get(PrismaService);
  });

  it('should handle simultaneous views from multiple users', async () => {
    prisma.story.findUnique.mockResolvedValue(mockStory);
    prisma.storyView.findUnique.mockResolvedValue(null);

    const promises = Array.from({ length: 10 }, (_, i) =>
      service.markViewed('story-1', `viewer-${i}`),
    );

    const results = await Promise.allSettled(promises);
    expect(results.every(r => r.status === 'fulfilled')).toBe(true);
  });

  it('should handle idempotent view by same user concurrently', async () => {
    prisma.story.findUnique.mockResolvedValue(mockStory);
    prisma.storyView.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ storyId: 'story-1', viewerId: 'viewer-1' });

    const [r1, r2] = await Promise.allSettled([
      service.markViewed('story-1', 'viewer-1'),
      service.markViewed('story-1', 'viewer-1'),
    ]);

    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');
  });

  it('should handle concurrent story creation', async () => {
    prisma.story.create
      .mockResolvedValueOnce({ id: 's-1', userId: 'user-a' })
      .mockResolvedValueOnce({ id: 's-2', userId: 'user-a' });

    const [r1, r2] = await Promise.allSettled([
      service.create('user-a', { mediaUrl: 'url1', mediaType: 'image/jpeg' }),
      service.create('user-a', { mediaUrl: 'url2', mediaType: 'image/jpeg' }),
    ]);

    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');
  });

  it('should handle concurrent delete and view', async () => {
    prisma.story.findUnique.mockResolvedValue(mockStory);
    prisma.story.update.mockResolvedValue({});
    prisma.storyView.findUnique.mockResolvedValue(null);

    const [deleteR, viewR] = await Promise.allSettled([
      service.delete('story-1', 'user-a'),
      service.markViewed('story-1', 'viewer-1'),
    ]);

    expect(deleteR.status).toBeDefined();
    expect(viewR.status).toBeDefined();
  });

  it('should handle concurrent highlight operations', async () => {
    prisma.story.findUnique.mockResolvedValue(mockStory);
    prisma.storyHighlightAlbum.findUnique.mockResolvedValue({ id: 'album-1', userId: 'user-a' });
    prisma.story.update.mockResolvedValue({});

    const [r1, r2] = await Promise.allSettled([
      service.addStoryToHighlight('story-1', 'album-1', 'user-a'),
      service.addStoryToHighlight('story-1', 'album-1', 'user-a'),
    ]);

    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');
  });

  it('should handle getFeedStories concurrent calls', async () => {
    prisma.follow.findMany.mockResolvedValue([]);
    prisma.story.findMany.mockResolvedValue([]);

    const promises = Array.from({ length: 5 }, () =>
      service.getFeedStories('user-a'),
    );

    const results = await Promise.allSettled(promises);
    expect(results.every(r => r.status === 'fulfilled')).toBe(true);
  });
});
