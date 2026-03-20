import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { PlaylistsService } from './playlists.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('PlaylistsService — edge cases', () => {
  let service: PlaylistsService;
  let prisma: any;
  const userId = 'user-edge-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        PlaylistsService,
        {
          provide: PrismaService,
          useValue: {
            playlist: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), delete: jest.fn() },
            playlistItem: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(), count: jest.fn().mockResolvedValue(0) },
            playlistCollaborator: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(), update: jest.fn() },
            video: { findUnique: jest.fn() },
            channel: { findUnique: jest.fn() },
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PlaylistsService>(PlaylistsService);
    prisma = module.get(PrismaService);
  });

  it('should create playlist with Arabic title', async () => {
    prisma.channel.findUnique.mockResolvedValue({ id: 'ch-1', userId });
    prisma.playlist.create.mockResolvedValue({ id: 'pl-1', title: 'قائمة التشغيل', userId, channelId: 'ch-1' });
    const result = await service.create(userId, { title: 'قائمة التشغيل', channelId: 'ch-1' } as any);
    expect(result.title).toBe('قائمة التشغيل');
  });

  it('should throw NotFoundException for non-existent playlist', async () => {
    prisma.playlist.findUnique.mockResolvedValue(null);
    await expect(service.getById('nonexistent'))
      .rejects.toThrow(NotFoundException);
  });

  it('should throw ForbiddenException when non-owner tries to delete', async () => {
    prisma.playlist.findUnique.mockResolvedValue({
      id: 'pl-1',
      channelId: 'ch-1',
      channel: { userId: 'other-user' },
    });
    await expect(service.delete('pl-1', userId))
      .rejects.toThrow(ForbiddenException);
  });
});
