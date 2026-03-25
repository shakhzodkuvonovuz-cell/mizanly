import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { StreamService } from './stream.service';
import { PrismaService } from '../../config/prisma.service';
import { globalMockProviders } from '../../common/test/mock-providers';

// Mock DNS for SSRF validation to resolve hostnames deterministically
jest.mock('dns', () => {
  const original = jest.requireActual('dns');
  return {
    ...original,
    promises: {
      ...original.promises,
      lookup: jest.fn().mockResolvedValue({ address: '93.184.216.34', family: 4 }),
    },
  };
});

describe('StreamService — null guard on upload result', () => {
  let service: StreamService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        StreamService,
        { provide: PrismaService, useValue: { video: { update: jest.fn() } } },
      ],
    }).compile();
    service = module.get(StreamService);
  });

  it('should throw InternalServerErrorException when Cloudflare returns no result', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, result: null }),
    }) as any;

    await expect(
      service.uploadFromUrl('https://media.mizanly.app/video.mp4', { title: 'test', creatorId: 'u1' }),
    ).rejects.toThrow(InternalServerErrorException);

    global.fetch = originalFetch;
  });

  it('should return uid when Cloudflare returns valid result', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, result: { uid: 'cf-stream-123' } }),
    }) as any;

    const uid = await service.uploadFromUrl('https://media.mizanly.app/video.mp4', { title: 'test', creatorId: 'u1' });
    expect(uid).toBe('cf-stream-123');

    global.fetch = originalFetch;
  });

  it('should throw on failed upload response', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ success: false, errors: ['upload failed'] }),
    }) as any;

    await expect(
      service.uploadFromUrl('https://media.mizanly.app/video.mp4', { title: 'test', creatorId: 'u1' }),
    ).rejects.toThrow(InternalServerErrorException);

    global.fetch = originalFetch;
  });
});
