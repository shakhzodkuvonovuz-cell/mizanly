import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { PrivacyService } from './privacy.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('PrivacyService — authorization matrix', () => {
  let service: PrivacyService;
  let prisma: any;
  const userA = 'user-a';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        PrivacyService,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: jest.fn().mockResolvedValue({ id: userA }), delete: jest.fn() },
            post: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
            thread: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
            reel: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
            video: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
            story: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
            comment: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
            message: { findMany: jest.fn().mockResolvedValue([]) },
            follow: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
            savedPost: { findMany: jest.fn().mockResolvedValue([]) },
            $queryRaw: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<PrivacyService>(PrivacyService);
    prisma = module.get(PrismaService);
  });

  it('should export only own user data', async () => {
    const result = await service.exportUserData(userA);
    expect(result).toBeDefined();
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: userA } }),
    );
  });

  it('should only export own posts', async () => {
    const result = await service.exportUserData(userA);
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: userA }) }),
    );
  });

  it('should only export own messages', async () => {
    const result = await service.exportUserData(userA);
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ senderId: userA }) }),
    );
  });

  it('should only export own follows', async () => {
    const result = await service.exportUserData(userA);
    expect(prisma.follow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ followerId: userA }) }),
    );
  });
});
