import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { StoriesService } from './stories.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('StoriesService — authorization matrix', () => {
  let service: StoriesService;
  let prisma: any;
  const userA = 'user-a';
  const userB = 'user-b';
  const mockStoryByA = { id: 'story-1', userId: userA, isArchived: false };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
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
            follow: { findMany: jest.fn() },
            block: { findFirst: jest.fn() },
            user: { findMany: jest.fn().mockResolvedValue([]) },
            conversation: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
            message: { create: jest.fn() },
            $transaction: jest.fn(),
            $queryRaw: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<StoriesService>(StoriesService);
    prisma = module.get(PrismaService);
  });

  it('should allow owner to delete their story', async () => {
    prisma.story.findUnique.mockResolvedValue(mockStoryByA);
    prisma.story.update.mockResolvedValue({});
    const result = await service.delete('story-1', userA);
    expect(result.archived).toBe(true);
  });

  it('should throw ForbiddenException when non-owner deletes story', async () => {
    prisma.story.findUnique.mockResolvedValue(mockStoryByA);
    await expect(service.delete('story-1', userB)).rejects.toThrow(ForbiddenException);
  });

  it('should allow owner to view story viewers', async () => {
    prisma.story.findUnique.mockResolvedValue(mockStoryByA);
    prisma.storyView.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    const result = await service.getViewers('story-1', userA);
    expect(result.data).toEqual([]);
  });

  it('should throw ForbiddenException when non-owner views story viewers', async () => {
    prisma.story.findUnique.mockResolvedValue(mockStoryByA);
    await expect(service.getViewers('story-1', userB))
      .rejects.toThrow(ForbiddenException);
  });

  it('should allow owner to add story to highlight', async () => {
    prisma.story.findUnique.mockResolvedValue(mockStoryByA);
    prisma.storyHighlightAlbum.findUnique.mockResolvedValue({ id: 'album-1', userId: userA });
    prisma.story.update.mockResolvedValue({});
    const result = await service.addStoryToHighlight('story-1', 'album-1', userA);
    expect(result).toBeDefined();
    expect(prisma.story.update).toHaveBeenCalled();
  });

  it('should throw ForbiddenException when non-owner adds to highlight', async () => {
    prisma.story.findUnique.mockResolvedValue(mockStoryByA);
    prisma.storyHighlightAlbum.findUnique.mockResolvedValue({ id: 'album-1', userId: userA });
    await expect(service.addStoryToHighlight('story-1', 'album-1', userB))
      .rejects.toThrow(ForbiddenException);
  });

  it('should allow owner to delete highlight album', async () => {
    prisma.storyHighlightAlbum.findUnique.mockResolvedValue({ id: 'album-1', userId: userA });
    prisma.storyHighlightAlbum.delete.mockResolvedValue({});
    const result = await service.deleteHighlight('album-1', userA);
    expect(result.deleted).toBe(true);
  });

  it('should throw ForbiddenException when non-owner deletes highlight', async () => {
    prisma.storyHighlightAlbum.findUnique.mockResolvedValue({ id: 'album-1', userId: userA });
    await expect(service.deleteHighlight('album-1', userB))
      .rejects.toThrow(ForbiddenException);
  });
});
