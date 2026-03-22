import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ParentalControlsService } from './parental-controls.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ParentalControlsService — edge cases', () => {
  let service: ParentalControlsService;
  let prisma: any;
  const parentId = 'parent-1';
  const childId = 'child-1';

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
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            user: { findUnique: jest.fn(), update: jest.fn() },
            $transaction: jest.fn(),
            post: { count: jest.fn().mockResolvedValue(0) },
            message: { count: jest.fn().mockResolvedValue(0) },
            screenTimeLog: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
      ],
    }).compile();

    service = module.get<ParentalControlsService>(ParentalControlsService);
    prisma = module.get(PrismaService);
  });

  it('should throw BadRequestException when linking self as child', async () => {
    await expect(service.linkChild(parentId, { childUserId: parentId, pin: '1234' } as any))
      .rejects.toThrow(BadRequestException);
  });

  it('should throw NotFoundException for non-existent child user', async () => {
    // First call (parent check) returns a valid non-child user
    prisma.user.findUnique.mockResolvedValueOnce({ isChildAccount: false });
    // Second call (child lookup) returns null
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.linkChild(parentId, { childUserId: 'nonexistent', pin: '1234' } as any))
      .rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException when child is already linked', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ isChildAccount: false });
    prisma.user.findUnique.mockResolvedValueOnce({ id: childId, isChildAccount: false });
    prisma.parentalControl.findUnique.mockResolvedValue({ id: 'existing-control' });
    await expect(service.linkChild(parentId, { childUserId: childId, pin: '1234' }))
      .rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when parent is a child account', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ isChildAccount: true });
    await expect(service.linkChild(parentId, { childUserId: childId, pin: '1234' }))
      .rejects.toThrow(BadRequestException);
  });

  it('should return empty children list for parent with no linked children', async () => {
    const result = await service.getMyChildren(parentId);
    expect(result).toEqual([]);
  });

  it('should handle parent with no children gracefully', async () => {
    prisma.parentalControl.findMany.mockResolvedValue([]);
    const children = await service.getMyChildren(parentId);
    expect(children).toEqual([]);
  });

  it('should return null when child has no parent', async () => {
    prisma.parentalControl.findUnique.mockResolvedValue(null);
    const result = await service.getParentInfo(childId);
    expect(result).toBeNull();
  });

  it('should throw NotFoundException when updating controls for unlinked child', async () => {
    prisma.parentalControl.findFirst.mockResolvedValue(null);
    await expect(service.updateControls(parentId, childId, '1234', { restrictedMode: true }))
      .rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when verifying PIN for unlinked child', async () => {
    prisma.parentalControl.findFirst.mockResolvedValue(null);
    await expect(service.verifyPin(parentId, childId, '1234'))
      .rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when unlinking non-existent control', async () => {
    prisma.parentalControl.findFirst.mockResolvedValue(null);
    await expect(service.unlinkChild(parentId, childId, '1234'))
      .rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when changing PIN for unlinked child', async () => {
    prisma.parentalControl.findFirst.mockResolvedValue(null);
    await expect(service.changePin(parentId, childId, '1234', '5678'))
      .rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when getting digest for unlinked child', async () => {
    prisma.parentalControl.findFirst.mockResolvedValue(null);
    await expect(service.getActivityDigest(parentId, childId))
      .rejects.toThrow(NotFoundException);
  });

  it('should return default unrestricted values when child has no parental control', async () => {
    prisma.parentalControl.findUnique.mockResolvedValue(null);
    const result = await service.getRestrictions(childId);
    expect(result).toEqual({
      isLinked: false,
      restrictedMode: false,
      maxAgeRating: 'R',
      dailyLimitMinutes: null,
      dmRestriction: 'none',
      canGoLive: true,
      canPost: true,
      canComment: true,
    });
  });

  it('should throw ForbiddenException when non-parent tries to view restrictions', async () => {
    prisma.parentalControl.findUnique.mockResolvedValue({
      parentUserId: 'other-parent',
      restrictedMode: true,
      maxAgeRating: 'PG',
      dailyLimitMinutes: 60,
      dmRestriction: 'contacts_only',
      canGoLive: false,
      canPost: false,
      canComment: false,
    });
    await expect(service.getRestrictions(childId, parentId))
      .rejects.toThrow(ForbiddenException);
  });

  it('should throw NotFoundException when verifyPinForParent finds no controls', async () => {
    prisma.parentalControl.findMany.mockResolvedValue([]);
    await expect(service.verifyPinForParent(parentId, '1234'))
      .rejects.toThrow(NotFoundException);
  });
});
