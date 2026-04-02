import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { BlocksService } from './blocks.service';
import { globalMockProviders } from '../../common/test/mock-providers';

/**
 * W7-T5 / T09 #40-45: blocks P2002 race, Redis cache invalidation, Sentry capture, cleanup errors
 */
describe('BlocksService — W7 T09 gaps', () => {
  let service: BlocksService;
  let prisma: any;
  let redis: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        BlocksService,
        {
          provide: PrismaService,
          useValue: {
            block: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), delete: jest.fn(), findMany: jest.fn() },
            user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-456', username: 'blocked-user' }) },
            follow: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            followRequest: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            circle: { findMany: jest.fn().mockResolvedValue([]) },
            circleMember: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            conversation: { findMany: jest.fn().mockResolvedValue([]) },
            conversationMember: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
            $transaction: jest.fn().mockImplementation(async (fnOrArray: unknown) => {
              if (typeof fnOrArray === 'function') return (fnOrArray as (tx: any) => Promise<unknown>)(prisma);
              return Promise.all(fnOrArray as Promise<unknown>[]);
            }),
            $executeRaw: jest.fn(),
          },
        },
        { provide: 'REDIS', useValue: { del: jest.fn().mockResolvedValue(1) } },
      ],
    }).compile();

    service = module.get<BlocksService>(BlocksService);
    prisma = module.get(PrismaService) as any;
    redis = module.get('REDIS');
  });

  // T09 #40: P2002 concurrent block race
  describe('block — P2002 race', () => {
    it('should handle P2002 race condition idempotently', async () => {
      const { PrismaClientKnownRequestError } = require('@prisma/client/runtime/library');
      prisma.user.findUnique.mockResolvedValue({ id: 'user-456', username: 'blocked-user' });
      prisma.block.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockRejectedValue(new PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: '0' }));

      const result = await service.block('user-123', 'user-456');

      expect(result).toEqual({ message: 'User blocked' });
    });

    it('should re-throw non-P2002 errors from transaction', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-456', username: 'blocked-user' });
      prisma.block.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockRejectedValue(new Error('Database connection lost'));

      await expect(service.block('user-123', 'user-456')).rejects.toThrow('Database connection lost');
    });
  });

  // T09 #42-43: cleanupAfterBlock error handling
  describe('cleanupAfterBlock — error handling', () => {
    it('should not throw when circle cleanup fails (fire-and-forget with logging)', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-456', username: 'blocked-user' });
      prisma.block.findUnique.mockResolvedValue(null);
      prisma.follow.findMany.mockResolvedValue([]);
      prisma.block.create.mockResolvedValue({});
      prisma.follow.deleteMany.mockResolvedValue({ count: 0 });
      prisma.followRequest.deleteMany.mockResolvedValue({ count: 0 });
      // Circle cleanup throws
      prisma.circle.findMany.mockRejectedValue(new Error('Circle DB error'));
      prisma.conversation.findMany.mockResolvedValue([]);

      const result = await service.block('user-123', 'user-456');

      // Block itself should succeed even if cleanup fails
      expect(result).toEqual({ message: 'User blocked' });

      // Wait for async cleanup to fire
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    it('should not throw when DM archive cleanup fails', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-456', username: 'blocked-user' });
      prisma.block.findUnique.mockResolvedValue(null);
      prisma.follow.findMany.mockResolvedValue([]);
      prisma.block.create.mockResolvedValue({});
      prisma.follow.deleteMany.mockResolvedValue({ count: 0 });
      prisma.followRequest.deleteMany.mockResolvedValue({ count: 0 });
      prisma.circle.findMany.mockResolvedValue([]);
      prisma.conversation.findMany.mockRejectedValue(new Error('DM DB error'));

      const result = await service.block('user-123', 'user-456');

      expect(result).toEqual({ message: 'User blocked' });
      await new Promise(resolve => setTimeout(resolve, 50));
    });
  });
});
