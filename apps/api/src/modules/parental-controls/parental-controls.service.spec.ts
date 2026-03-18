import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ParentalControlsService } from './parental-controls.service';
import { globalMockProviders } from '../../common/test/mock-providers';

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_pin'),
  compare: jest.fn().mockImplementation((pin: string, hash: string) =>
    Promise.resolve(pin === '1234' && hash === 'hashed_pin'),
  ),
}));

describe('ParentalControlsService', () => {
  let service: ParentalControlsService;
  let prisma: any;

  const mockControl = {
    id: 'pc-1',
    parentUserId: 'parent-1',
    childUserId: 'child-1',
    pin: 'hashed_pin',
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
            user: { update: jest.fn() },
            post: { count: jest.fn() },
            message: { count: jest.fn() },
            screenTimeLog: { findMany: jest.fn() },
          },
        },
        // Mock NotificationsService if needed
        { provide: 'NotificationsService', useValue: {} },
      ],
    }).compile();

    service = module.get<ParentalControlsService>(ParentalControlsService);
    prisma = module.get(PrismaService) as any;
  });

  describe('linkChild', () => {
    it('should link a child account', async () => {
      prisma.parentalControl.findUnique.mockResolvedValue(null);
      prisma.parentalControl.create.mockResolvedValue(mockControl);
      prisma.user.update.mockResolvedValue({});

      const result = await service.linkChild('parent-1', { childUserId: 'child-1', pin: '1234' });
      expect(result).toEqual(mockControl);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isChildAccount: true } }),
      );
    });

    it('should throw BadRequestException when linking self', async () => {
      await expect(service.linkChild('user-1', { childUserId: 'user-1', pin: '1234' }))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when child already linked', async () => {
      prisma.parentalControl.findUnique.mockResolvedValue(mockControl);
      await expect(service.linkChild('parent-1', { childUserId: 'child-1', pin: '1234' }))
        .rejects.toThrow(ConflictException);
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

    it('should throw ForbiddenException with wrong PIN', async () => {
      prisma.parentalControl.findFirst.mockResolvedValue(mockControl);
      await expect(service.verifyPin('parent-1', 'child-1', '9999'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('getRestrictions', () => {
    it('should return restrictions for child account', async () => {
      prisma.parentalControl.findUnique.mockResolvedValue(mockControl);
      const result = await service.getRestrictions('child-1');
      expect(result).toBeTruthy();
      expect(result?.restrictedMode).toBe(true);
      expect(result?.maxAgeRating).toBe('PG');
    });

    it('should return null for non-child account', async () => {
      prisma.parentalControl.findUnique.mockResolvedValue(null);
      const result = await service.getRestrictions('user-1');
      expect(result).toBeNull();
    });
  });

  describe('getActivityDigest', () => {
    it('should return 7-day activity summary', async () => {
      prisma.parentalControl.findFirst.mockResolvedValue(mockControl);
      prisma.post.count.mockResolvedValue(5);
      prisma.screenTimeLog.findMany.mockResolvedValue([
        { totalSeconds: 3600, sessions: 3, date: new Date() },
      ]);
      prisma.message.count.mockResolvedValue(12);

      const result = await service.getActivityDigest('parent-1', 'child-1');
      expect(result.postsCreated).toBe(5);
      expect(result.messagesSent).toBe(12);
      expect(result.dailyBreakdown).toHaveLength(1);
    });
  });
});
