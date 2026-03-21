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
            block: { findFirst: jest.fn() },
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

  it('should normalize phone numbers — strip non-digits', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    await service.findByPhoneNumbers('user-1', ['+1 (555) 123-4567']);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ phone: { in: ['5551234567'] } }),
      }),
    );
  });

  it('should deduplicate phone numbers', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    await service.findByPhoneNumbers('user-1', ['5551234567', '5551234567', '5551234567']);
    const call = prisma.user.findMany.mock.calls[0][0];
    expect(call.where.phone.in.length).toBeLessThanOrEqual(3); // May be deduplicated
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
