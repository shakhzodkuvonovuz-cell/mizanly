import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ParentalControlsService } from './parental-controls.service';
import { globalMockProviders } from '../../common/test/mock-providers';

// Pre-computed scrypt hash of PIN '1234' with known salt
const HASHED_PIN = '0123456789abcdef0123456789abcdef:d0caf5e9d4e56daa5b37a77f8f8379c934032d6f50cacd5fd8ad8d32f6aff2c87a8ef1f5ae092f3a044ff09853d642e92791797b903e76a6b9e3cd0699b7fbdf';

describe('ParentalControlsService', () => {
  let service: ParentalControlsService;
  let prisma: any;

  const mockControl = {
    id: 'pc-1',
    parentUserId: 'parent-1',
    childUserId: 'child-1',
    pin: HASHED_PIN,
    restrictedMode: true,
    maxAgeRating: 'PG',
    dailyLimitMinutes: null,
    dmRestriction: 'none',
    canGoLive: false,
    canPost: true,
    canComment: true,
    activityDigest: true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        ParentalControlsService,
        {
          provide: PrismaService,
          useValue: {
            parentalControl: {
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            user: {
              findUnique: jest.fn().mockResolvedValue({ isChildAccount: false }),
              update: jest.fn(),
            },
            post: { count: jest.fn() },
            message: { count: jest.fn() },
            screenTimeLog: { findMany: jest.fn() },
            $transaction: jest.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
          },
        },
      ],
    }).compile();

    service = module.get<ParentalControlsService>(ParentalControlsService);
    prisma = module.get(PrismaService) as any;
  });

  describe('linkChild', () => {
    it('should link a child account', async () => {
      // Parent is not a child
      prisma.user.findUnique
        .mockResolvedValueOnce({ isChildAccount: false }) // parent check
        .mockResolvedValueOnce({ id: 'child-1', isChildAccount: false }); // child exists
      prisma.parentalControl.findUnique.mockResolvedValue(null);
      prisma.parentalControl.create.mockResolvedValue(mockControl);
      prisma.user.update.mockResolvedValue({});

      const result = await service.linkChild('parent-1', { childUserId: 'child-1', pin: '1234' });
      expect(result).toEqual(mockControl);
    });

    it('should throw BadRequestException when linking self', async () => {
      await expect(service.linkChild('user-1', { childUserId: 'user-1', pin: '1234' }))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when child already linked', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ isChildAccount: false })
        .mockResolvedValueOnce({ id: 'child-1' });
      prisma.parentalControl.findUnique.mockResolvedValue(mockControl);

      await expect(service.linkChild('parent-1', { childUserId: 'child-1', pin: '1234' }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('unlinkChild', () => {
    it('should unlink with correct PIN', async () => {
      prisma.parentalControl.findFirst.mockResolvedValue(mockControl);
      prisma.parentalControl.delete.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({});

      const result = await service.unlinkChild('parent-1', 'child-1', '1234');
      expect(result.success).toBe(true);
    });

    it('should throw ForbiddenException with wrong PIN', async () => {
      prisma.parentalControl.findFirst.mockResolvedValue(mockControl);
      await expect(service.unlinkChild('parent-1', 'child-1', '0000'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('verifyPin', () => {
    it('should verify correct PIN', async () => {
      prisma.parentalControl.findFirst.mockResolvedValue(mockControl);
      const result = await service.verifyPin('parent-1', 'child-1', '1234');
      expect(result.valid).toBe(true);
    });

    it('should return invalid for wrong PIN', async () => {
      prisma.parentalControl.findFirst.mockResolvedValue(mockControl);
      const result = await service.verifyPin('parent-1', 'child-1', '9999');
      expect(result.valid).toBe(false);
    });
  });

  describe('getRestrictions', () => {
    it('should return restrictions for child account', async () => {
      prisma.parentalControl.findUnique.mockResolvedValue(mockControl);
      const result = await service.getRestrictions('child-1');
      expect(result.isLinked).toBe(true);
      expect(result.restrictedMode).toBe(true);
      expect(result.maxAgeRating).toBe('PG');
    });

    it('should return defaults for non-child account', async () => {
      prisma.parentalControl.findUnique.mockResolvedValue(null);
      const result = await service.getRestrictions('user-1');
      expect(result.isLinked).toBe(false);
      expect(result.restrictedMode).toBe(false);
    });
  });

  describe('getActivityDigest', () => {
    it('should return 7-day activity summary', async () => {
      prisma.parentalControl.findFirst.mockResolvedValue(mockControl);
      prisma.post.count.mockResolvedValue(5);
      prisma.message.count.mockResolvedValue(12);
      prisma.screenTimeLog.findMany.mockResolvedValue([
        { totalSeconds: 3600, sessions: 3, date: new Date() },
      ]);
      prisma.parentalControl.update.mockResolvedValue({});

      const result = await service.getActivityDigest('parent-1', 'child-1');
      expect(result.postsCount).toBe(5);
      expect(result.messagesCount).toBe(12);
      expect(result.dailyBreakdown).toHaveLength(1);
      expect(result.totalScreenTimeMinutes).toBe(60);
    });
  });
});
