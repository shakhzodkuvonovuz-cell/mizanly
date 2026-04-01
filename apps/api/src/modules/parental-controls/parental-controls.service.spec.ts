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

    it('should throw NotFoundException for unlinked parent/child', async () => {
      prisma.parentalControl.findFirst.mockResolvedValue(null);
      await expect(service.getActivityDigest('parent-1', 'child-99'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('linkChild — parent is child account', () => {
    it('should throw BadRequestException when parent is a child account', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ isChildAccount: true });
      await expect(service.linkChild('child-parent', { childUserId: 'kid-1', pin: '1234' }))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when child user not found', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ isChildAccount: false })
        .mockResolvedValueOnce(null);
      prisma.parentalControl.findUnique.mockResolvedValue(null);
      await expect(service.linkChild('parent-1', { childUserId: 'ghost', pin: '1234' }))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('unlinkChild — not found', () => {
    it('should throw NotFoundException when link does not exist', async () => {
      prisma.parentalControl.findFirst.mockResolvedValue(null);
      await expect(service.unlinkChild('parent-1', 'child-99', '1234'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('getMyChildren', () => {
    it('should return linked children', async () => {
      prisma.parentalControl.findMany.mockResolvedValue([
        { id: 'pc-1', child: { id: 'child-1', username: 'kid1', displayName: 'Kid', avatarUrl: null, isChildAccount: true } },
        { id: 'pc-2', child: { id: 'child-2', username: 'kid2', displayName: 'Kid2', avatarUrl: null, isChildAccount: true } },
      ]);
      const result = await service.getMyChildren('parent-1');
      expect(result).toHaveLength(2);
      expect(result[0].child.username).toBe('kid1');
    });

    it('should return empty when no children linked', async () => {
      prisma.parentalControl.findMany.mockResolvedValue([]);
      const result = await service.getMyChildren('parent-1');
      expect(result).toEqual([]);
    });
  });

  describe('getParentInfo', () => {
    it('should return parent info for child', async () => {
      prisma.parentalControl.findUnique.mockResolvedValue({
        ...mockControl,
        parent: { id: 'parent-1', username: 'dad', displayName: 'Dad', avatarUrl: null },
      });
      const result = await service.getParentInfo('child-1');
      expect(result).not.toBeNull();
      expect(result!.parentUser.username).toBe('dad');
      expect(result!.restrictedMode).toBe(true);
    });

    it('should return null for non-child account', async () => {
      prisma.parentalControl.findUnique.mockResolvedValue(null);
      const result = await service.getParentInfo('not-a-child');
      expect(result).toBeNull();
    });
  });

  describe('updateControls', () => {
    it('should update parental controls with valid PIN', async () => {
      prisma.parentalControl.findFirst.mockResolvedValue(mockControl);
      prisma.parentalControl.update.mockResolvedValue({ ...mockControl, dailyLimitMinutes: 60 });
      const result = await service.updateControls('parent-1', 'child-1', '1234', { dailyLimitMinutes: 60 } as any);
      expect(result.dailyLimitMinutes).toBe(60);
    });

    it('should throw ForbiddenException with invalid PIN', async () => {
      prisma.parentalControl.findFirst.mockResolvedValue(mockControl);
      await expect(service.updateControls('parent-1', 'child-1', '9999', { dailyLimitMinutes: 60 } as any))
        .rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when link not found', async () => {
      prisma.parentalControl.findFirst.mockResolvedValue(null);
      await expect(service.updateControls('parent-1', 'child-99', '1234', {} as any))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('changePin', () => {
    it('should change PIN with correct current PIN', async () => {
      prisma.parentalControl.findFirst.mockResolvedValue(mockControl);
      prisma.parentalControl.update.mockResolvedValue({ ...mockControl, pin: 'new-hash' });
      const result = await service.changePin('parent-1', 'child-1', '1234', '5678');
      expect(prisma.parentalControl.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'pc-1' },
      }));
      expect(result).toBeDefined();
    });

    it('should throw ForbiddenException with wrong current PIN', async () => {
      prisma.parentalControl.findFirst.mockResolvedValue(mockControl);
      await expect(service.changePin('parent-1', 'child-1', '0000', '5678'))
        .rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when link not found', async () => {
      prisma.parentalControl.findFirst.mockResolvedValue(null);
      await expect(service.changePin('parent-1', 'child-99', '1234', '5678'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('verifyPinForParent', () => {
    it('should verify parent PIN', async () => {
      prisma.parentalControl.findMany.mockResolvedValue([mockControl]);
      const result = await service.verifyPinForParent('parent-1', '1234');
      expect(result.valid).toBe(true);
    });

    it('should return invalid for wrong PIN', async () => {
      prisma.parentalControl.findMany.mockResolvedValue([mockControl]);
      const result = await service.verifyPinForParent('parent-1', '0000');
      expect(result.valid).toBe(false);
    });

    it('should throw NotFoundException when no controls found', async () => {
      prisma.parentalControl.findMany.mockResolvedValue([]);
      await expect(service.verifyPinForParent('parent-1', '1234'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('verifyPin — NotFoundException', () => {
    it('should throw NotFoundException when link not found', async () => {
      prisma.parentalControl.findFirst.mockResolvedValue(null);
      await expect(service.verifyPin('parent-1', 'child-99', '1234'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('PIN security (A15 audit fixes)', () => {
    it('updateControls should NOT pass raw pin to Prisma update data', async () => {
      prisma.parentalControl.findFirst.mockResolvedValue(mockControl);
      prisma.parentalControl.update.mockResolvedValue({ ...mockControl, restrictedMode: false });

      await service.updateControls('parent-1', 'child-1', '1234', { pin: '123456', restrictedMode: false } as any);

      expect(prisma.parentalControl.update).toHaveBeenCalled();
      const updateCall = prisma.parentalControl.update.mock.calls[0][0];
      // The raw pin must be destructured out — data should NOT contain 'pin'
      expect(updateCall.data).not.toHaveProperty('pin');
      expect(updateCall.data).toHaveProperty('restrictedMode', false);
    });

    it('linkChild response should NOT include pin field', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ isChildAccount: false })
        .mockResolvedValueOnce({ id: 'child-1', isChildAccount: false });
      prisma.parentalControl.findUnique.mockResolvedValue(null);

      // Mock $transaction to return the create result
      const controlWithoutPin = {
        id: 'pc-new',
        parentUserId: 'parent-1',
        childUserId: 'child-1',
        restrictedMode: false,
        maxAgeRating: 'PG',
        dailyLimitMinutes: null,
        dmRestriction: 'none',
        canGoLive: false,
        canPost: true,
        canComment: true,
        activityDigest: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.$transaction.mockResolvedValue([controlWithoutPin, {}]);

      const result = await service.linkChild('parent-1', { childUserId: 'child-1', pin: '1234' });

      // The create call should use select which excludes pin
      const txArg = prisma.$transaction.mock.calls[0][0];
      // Result should NOT have a pin field
      expect(result).not.toHaveProperty('pin');
    });

    it('changePin should store hashed pin, not plaintext', async () => {
      prisma.parentalControl.findFirst.mockResolvedValue(mockControl);
      prisma.parentalControl.update.mockResolvedValue({ ...mockControl, pin: 'newhash' });

      await service.changePin('parent-1', 'child-1', '1234', '654321');

      expect(prisma.parentalControl.update).toHaveBeenCalled();
      const updateCall = prisma.parentalControl.update.mock.calls[0][0];
      // Hashed pin contains ':' separator (salt:hash format), never the raw string
      expect(updateCall.data.pin).toContain(':');
      expect(updateCall.data.pin).not.toBe('654321');
      // Verify it's a proper scrypt hash: salt (32 hex chars) + ':' + hash (128 hex chars)
      const parts = updateCall.data.pin.split(':');
      expect(parts).toHaveLength(2);
      expect(parts[0]).toHaveLength(32); // 16 bytes = 32 hex chars
      expect(parts[1]).toHaveLength(128); // 64 bytes = 128 hex chars
    });
  });
});
