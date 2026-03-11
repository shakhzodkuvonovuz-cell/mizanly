import { Test } from '@nestjs/testing';
import { AudioTracksService } from './audio-tracks.service';
import { PrismaService } from '../../config/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('AudioTracksService', () => {
  let service: AudioTracksService;
  let prisma: Record<string, any>;
  beforeEach(async () => {
    prisma = { audioTrack: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), delete: jest.fn() }, reel: { findMany: jest.fn() }, $executeRaw: jest.fn() };
    const module = await Test.createTestingModule({ providers: [AudioTracksService, { provide: PrismaService, useValue: prisma }] }).compile();
    service = module.get(AudioTracksService);
  });
  it('creates track', async () => { prisma.audioTrack.create.mockResolvedValue({ id: 'at1' }); const r = await service.create({ title: 'T', artist: 'A', duration: 30, audioUrl: 'u' }); expect(r.id).toBe('at1'); });
  it('throws NotFoundException', async () => { prisma.audioTrack.findUnique.mockResolvedValue(null); await expect(service.getById('bad')).rejects.toThrow(NotFoundException); });
});