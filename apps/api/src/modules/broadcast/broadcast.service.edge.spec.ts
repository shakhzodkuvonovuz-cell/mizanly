import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { BroadcastService } from './broadcast.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('BroadcastService — edge cases', () => {
  let service: BroadcastService;
  let prisma: any;
  const userId = 'user-edge-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        BroadcastService,
        {
          provide: PrismaService,
          useValue: {
            broadcastChannel: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), delete: jest.fn() },
            broadcastSubscriber: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(), count: jest.fn().mockResolvedValue(0) },
            broadcastMessage: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), delete: jest.fn() },
            broadcastAdmin: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), delete: jest.fn() },
            channelMember: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), create: jest.fn() },
            user: { findUnique: jest.fn() },
            $executeRaw: jest.fn(),
            $transaction: jest.fn().mockImplementation(async (fn: unknown) => {
              if (typeof fn === 'function') return fn({
                broadcastChannel: { create: jest.fn().mockResolvedValue({ id: 'bc-1', name: 'بث مباشر', slug: 'broadcast-1' }) },
                channelMember: { create: jest.fn() },
              });
              return fn;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<BroadcastService>(BroadcastService);
    prisma = module.get(PrismaService);
  });

  it('should accept Arabic broadcast name', async () => {
    prisma.broadcastChannel.findUnique.mockResolvedValue(null); // slug not taken
    prisma.broadcastChannel.create.mockResolvedValue({ id: 'bc-1', name: 'بث مباشر', slug: 'broadcast-1', userId });
    const result = await service.create(userId, { name: 'بث مباشر', slug: 'broadcast-1' } as any);
    expect(result).toBeDefined();
    expect(result.name).toBe('بث مباشر');
  });

  it('should throw NotFoundException for non-existent broadcast by slug', async () => {
    prisma.broadcastChannel.findUnique.mockResolvedValue(null);
    await expect(service.getBySlug('nonexistent'))
      .rejects.toThrow(NotFoundException);
  });

  it('should return empty subscribers list', async () => {
    prisma.broadcastChannel.findUnique.mockResolvedValue({ id: 'bc-1', userId });
    const result = await service.getSubscribers('bc-1');
    expect(result.data).toEqual([]);
  });

  it('should throw ConflictException for duplicate slug', async () => {
    prisma.broadcastChannel.findUnique.mockResolvedValue({ id: 'existing', slug: 'taken' });
    await expect(service.create(userId, { name: 'Test', slug: 'taken' } as any))
      .rejects.toThrow(ConflictException);
  });

  it('should return empty discover list when no channels exist', async () => {
    const result = await service.discover();
    expect(result.data).toEqual([]);
  });

  it('should return empty my channels list for user with none', async () => {
    prisma.channelMember.findMany.mockResolvedValue([]);
    const result = await service.getMyChannels(userId);
    expect(result).toEqual([]);
  });
});
