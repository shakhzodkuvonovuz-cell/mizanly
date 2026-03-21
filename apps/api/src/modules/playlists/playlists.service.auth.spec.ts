import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { PlaylistsService } from './playlists.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('PlaylistsService — authorization matrix', () => {
  let service: PlaylistsService;
  let prisma: any;
  const userA = 'user-a';
  const userB = 'user-b';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        PlaylistsService,
        {
          provide: PrismaService,
          useValue: {
            playlist: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), delete: jest.fn() },
            playlistItem: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(), count: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue({ _max: { position: 0 } }) },
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

  it('should allow owner to update playlist', async () => {
    prisma.playlist.findUnique.mockResolvedValue({ id: 'pl-1', channelId: 'ch-1', channel: { userId: userA } });
    prisma.playlist.update.mockResolvedValue({ id: 'pl-1', title: 'Updated' });
    const result = await service.update('pl-1', userA, { title: 'Updated' } as any);
    expect(result).toBeDefined();
  });

  it('should throw ForbiddenException when non-owner updates playlist', async () => {
    prisma.playlist.findUnique.mockResolvedValue({ id: 'pl-1', channelId: 'ch-1', channel: { userId: userA } });
    prisma.playlistCollaborator.findUnique.mockResolvedValue(null);
    await expect(service.update('pl-1', userB, { title: 'Hacked' } as any))
      .rejects.toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when non-owner deletes playlist', async () => {
    prisma.playlist.findUnique.mockResolvedValue({ id: 'pl-1', channelId: 'ch-1', channel: { userId: userA } });
    await expect(service.delete('pl-1', userB)).rejects.toThrow(ForbiddenException);
  });

  it('should throw NotFoundException for non-existent playlist', async () => {
    prisma.playlist.findUnique.mockResolvedValue(null);
    await expect(service.getById('nonexistent')).rejects.toThrow(NotFoundException);
  });

  it('should throw ForbiddenException when non-owner adds item', async () => {
    prisma.playlist.findUnique.mockResolvedValue({ id: 'pl-1', channelId: 'ch-1', channel: { userId: userA }, isCollaborative: false });
    prisma.playlistCollaborator.findUnique.mockResolvedValue(null);
    await expect(service.addItem('pl-1', 'vid-1', userB)).rejects.toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when viewer tries to add item', async () => {
    prisma.playlist.findUnique.mockResolvedValue({ id: 'pl-1', channelId: 'ch-1', channel: { userId: userA }, isCollaborative: true });
    prisma.playlistCollaborator.findUnique.mockResolvedValue({ userId: userB, role: 'viewer' });
    await expect(service.addItem('pl-1', 'vid-1', userB)).rejects.toThrow(ForbiddenException);
  });
});
