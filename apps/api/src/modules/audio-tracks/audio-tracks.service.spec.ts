import { Test } from '@nestjs/testing';
import { AudioTracksService } from './audio-tracks.service';
import { PrismaService } from '../../config/prisma.service';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('AudioTracksService', () => {
  let service: AudioTracksService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      audioTrack: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        delete: jest.fn(),
      },
      reel: { findMany: jest.fn().mockResolvedValue([]) },
      $executeRaw: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [...globalMockProviders, AudioTracksService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(AudioTracksService);
  });

  describe('create', () => {
    it('should create a new audio track', async () => {
      prisma.audioTrack.findFirst.mockResolvedValue(null);
      prisma.audioTrack.create.mockResolvedValue({ id: 'at1', title: 'Test', artist: 'Artist' });
      const result = await service.create('user-1', { title: 'Test', artist: 'Artist', duration: 30, audioUrl: 'url' });
      expect(result.id).toBe('at1');
    });

    it('should throw ConflictException for duplicate title+artist', async () => {
      prisma.audioTrack.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(service.create('user-1', { title: 'T', artist: 'A', duration: 30, audioUrl: 'u' }))
        .rejects.toThrow(ConflictException);
    });

    it('should set isOriginal to false by default', async () => {
      prisma.audioTrack.findFirst.mockResolvedValue(null);
      prisma.audioTrack.create.mockResolvedValue({ id: 'at2', isOriginal: false });
      await service.create('user-1', { title: 'T', artist: 'A', duration: 30, audioUrl: 'u' });
      expect(prisma.audioTrack.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ isOriginal: false }),
      });
    });
  });

  describe('getById', () => {
    it('should return track by ID', async () => {
      prisma.audioTrack.findUnique.mockResolvedValue({ id: 'at1', title: 'Test' });
      const result = await service.getById('at1');
      expect(result.title).toBe('Test');
    });

    it('should throw NotFoundException for missing track', async () => {
      prisma.audioTrack.findUnique.mockResolvedValue(null);
      await expect(service.getById('bad')).rejects.toThrow(NotFoundException);
    });
  });

  describe('search', () => {
    it('should search tracks by title or artist', async () => {
      prisma.audioTrack.findMany.mockResolvedValue([{ id: 'at1', title: 'Nasheed' }]);
      const result = await service.search('nasheed');
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should return empty data when no results', async () => {
      prisma.audioTrack.findMany.mockResolvedValue([]);
      const result = await service.search('nonexistent');
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should respect limit parameter', async () => {
      await service.search('test', undefined, 5);
      expect(prisma.audioTrack.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 6 }));
    });

    it('should use cursor for pagination', async () => {
      prisma.audioTrack.findMany.mockResolvedValue([{ id: 'at3', title: 'Track3' }]);
      const result = await service.search('track', 'at2');
      expect(prisma.audioTrack.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: { lt: 'at2' } }) }),
      );
      expect(result.data).toHaveLength(1);
    });
  });

  describe('trending', () => {
    it('should return tracks ordered by reelsCount', async () => {
      prisma.audioTrack.findMany.mockResolvedValue([
        { id: 'at1', reelsCount: 100 },
        { id: 'at2', reelsCount: 50 },
      ]);
      const result = await service.trending();
      expect(result.data).toHaveLength(2);
      expect(result.meta.hasMore).toBe(false);
      expect(result.meta.cursor).toBe('at2');
    });

    it('should support cursor pagination', async () => {
      prisma.audioTrack.findMany.mockResolvedValue([{ id: 'at3', reelsCount: 25 }]);
      const result = await service.trending('at2');
      expect(prisma.audioTrack.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: { lt: 'at2' } }) }),
      );
      expect(result.data).toHaveLength(1);
    });

    it('should detect hasMore when results exceed limit', async () => {
      const tracks = Array.from({ length: 21 }, (_, i) => ({ id: `at${i}`, reelsCount: 100 - i }));
      prisma.audioTrack.findMany.mockResolvedValue(tracks);
      const result = await service.trending();
      expect(result.data).toHaveLength(20);
      expect(result.meta.hasMore).toBe(true);
    });
  });

  describe('getReelsUsingTrack', () => {
    it('should return reels using the track', async () => {
      prisma.audioTrack.findUnique.mockResolvedValue({ id: 'at1' });
      prisma.reel.findMany.mockResolvedValue([{ id: 'r1' }]);
      const result = await service.getReelsUsingTrack('at1');
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should throw NotFoundException for missing track', async () => {
      prisma.audioTrack.findUnique.mockResolvedValue(null);
      await expect(service.getReelsUsingTrack('bad')).rejects.toThrow(NotFoundException);
    });
  });

  describe('incrementUsage', () => {
    it('should call executeRaw to increment reelsCount', async () => {
      await service.incrementUsage('at1');
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });
  });
});
