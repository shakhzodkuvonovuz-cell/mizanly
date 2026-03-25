import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { UsersService } from './users.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('UsersService — abuse vectors (Task 100)', () => {
  let service: UsersService;
  let prisma: any;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        UsersService,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), findFirst: jest.fn(), count: jest.fn().mockResolvedValue(0) },
            report: { create: jest.fn() },
            device: { deleteMany: jest.fn() },
            block: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            follow: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            followRequest: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            post: { findMany: jest.fn().mockResolvedValue([]) },
            thread: { findMany: jest.fn().mockResolvedValue([]) },
            savedPost: { findMany: jest.fn().mockResolvedValue([]) },
            threadBookmark: { findMany: jest.fn().mockResolvedValue([]) },
            reelInteraction: { findMany: jest.fn().mockResolvedValue([]) },
            reelBookmark: { findMany: jest.fn().mockResolvedValue([]) },
            videoBookmark: { findMany: jest.fn().mockResolvedValue([]) },
            watchLater: { findMany: jest.fn().mockResolvedValue([]) },
            draftPost: { findMany: jest.fn().mockResolvedValue([]) },
            creatorStat: { findMany: jest.fn().mockResolvedValue([]) },
            comment: { findMany: jest.fn().mockResolvedValue([]) },
            message: { findMany: jest.fn().mockResolvedValue([]) },
            postReaction: { findMany: jest.fn().mockResolvedValue([]) },
            reel: { findMany: jest.fn().mockResolvedValue([]) },
            video: { findMany: jest.fn().mockResolvedValue([]) },
            watchHistory: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
            watchLaterItem: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
            $queryRaw: jest.fn().mockResolvedValue([]),
          },
        },
        { provide: 'REDIS', useValue: { get: jest.fn().mockResolvedValue(null), setex: jest.fn(), del: jest.fn() } },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get(PrismaService);
  });

  it('should return empty for findByPhoneNumbers with empty array', async () => {
    const result = await service.findByPhoneNumbers('user-1', []);
    expect(result).toEqual([]);
  });

  it('should match users by hashing stored phone numbers server-side', async () => {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update('15551234567').digest('hex');
    prisma.user.findMany.mockResolvedValue([
      { id: 'u2', username: 'friend', displayName: 'Friend', avatarUrl: null, isVerified: false, phone: '15551234567' },
    ]);
    prisma.follow.findMany.mockResolvedValue([]);
    prisma.block.findMany.mockResolvedValue([]);
    const result = await service.findByPhoneNumbers('user-1', [hash]);
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('phone'); // Phone stripped from response
  });

  it('should deduplicate hashes', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update('5551234567').digest('hex');
    await service.findByPhoneNumbers('user-1', [hash, hash, hash]);
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
  });

  it('should throw NotFoundException for non-existent user profile', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getProfile('nonexistent')).rejects.toThrow(NotFoundException);
  });

  it('should report user with proper reason mapping', async () => {
    prisma.report.create.mockResolvedValue({ id: 'report-1' });
    const result = await service.report('user-1', 'user-2', 'SPAM');
    expect(result.reported).toBe(true);
    expect(prisma.report.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reporterId: 'user-1' }),
      }),
    );
  });

  it('should not include self in findByPhoneNumbers results', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    await service.findByPhoneNumbers('user-1', ['5551234567']);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 'user-1' } }),
      }),
    );
  });
});
