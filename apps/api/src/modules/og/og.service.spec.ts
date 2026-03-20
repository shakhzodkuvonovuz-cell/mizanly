import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { OgService } from './og.service';
import { PrismaService } from '../../config/prisma.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('OgService', () => {
  let service: OgService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        OgService,
        {
          provide: PrismaService,
          useValue: {
            post: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'p1', content: 'Test post content', mediaUrls: ['https://img.test/1.jpg'],
                user: { username: 'testuser', displayName: 'Test User' },
              }),
            },
            reel: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'r1', caption: 'Test reel', thumbnailUrl: 'https://img.test/thumb.jpg',
                user: { username: 'reeluser', displayName: 'Reel User' },
              }),
            },
            thread: {
              findUnique: jest.fn().mockResolvedValue({
                id: 't1', content: 'Test thread content',
                user: { username: 'threaduser', displayName: 'Thread User' },
              }),
            },
            user: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'u1', username: 'testuser', displayName: 'Test User',
                bio: 'My bio', avatarUrl: 'https://img.test/avatar.jpg',
                followersCount: 100,
              }),
            },
          },
        },
      ],
    }).compile();

    service = module.get(OgService);
    prisma = module.get(PrismaService) as any;
  });

  it('should generate post OG meta', async () => {
    const result = await service.getPostOg('p1');
    expect(result).toContain('Test post content');
    expect(result).toContain('<meta');
  });

  it('should throw NotFoundException for missing post', async () => {
    prisma.post.findUnique.mockResolvedValueOnce(null);
    await expect(service.getPostOg('invalid')).rejects.toThrow(NotFoundException);
  });

  it('should generate reel OG meta', async () => {
    const result = await service.getReelOg('r1');
    expect(result).toContain('Test reel');
    expect(result).toContain('<meta');
  });

  it('should generate user profile OG meta', async () => {
    const result = await service.getProfileOg('testuser');
    expect(result).toContain('Test User');
    expect(result).toContain('<meta');
  });

  it('should throw NotFoundException for missing user profile', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.getProfileOg('nobody')).rejects.toThrow(NotFoundException);
  });
});
