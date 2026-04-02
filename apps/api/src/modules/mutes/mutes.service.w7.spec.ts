import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { MutesService } from './mutes.service';
import { globalMockProviders } from '../../common/test/mock-providers';

/**
 * W7-T5 / T09 #46: mutes non-P2002 error propagation
 */
describe('MutesService — W7 T09 gaps', () => {
  let service: MutesService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        MutesService,
        {
          provide: PrismaService,
          useValue: {
            mute: { create: jest.fn(), delete: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn() },
            user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-456' }) },
          },
        },
      ],
    }).compile();

    service = module.get<MutesService>(MutesService);
    prisma = module.get(PrismaService) as any;
  });

  // T09 #46: non-P2002 error propagation
  describe('mute — non-P2002 error', () => {
    it('should re-throw non-P2002 Prisma errors', async () => {
      prisma.mute.create.mockRejectedValue(new Error('Connection timeout'));

      await expect(service.mute('user-123', 'user-456')).rejects.toThrow('Connection timeout');
    });

    it('should re-throw PrismaClientKnownRequestError with non-P2002 code', async () => {
      const { PrismaClientKnownRequestError } = require('@prisma/client/runtime/library');
      prisma.mute.create.mockRejectedValue(
        new PrismaClientKnownRequestError('Foreign key constraint', { code: 'P2003', clientVersion: '0' }),
      );

      await expect(service.mute('user-123', 'user-456')).rejects.toThrow();
    });
  });
});
