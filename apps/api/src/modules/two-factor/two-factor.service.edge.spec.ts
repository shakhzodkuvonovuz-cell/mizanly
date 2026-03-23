import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { TwoFactorService } from './two-factor.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('TwoFactorService — edge cases', () => {
  let service: TwoFactorService;
  let prisma: any;
  const userId = 'user-edge-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        TwoFactorService,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: jest.fn(), update: jest.fn() },
            twoFactorSecret: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
            backupCode: { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get<TwoFactorService>(TwoFactorService);
    prisma = module.get(PrismaService);
  });

  describe('verify — input validation', () => {
    it('should throw BadRequestException for empty verification code', async () => {
      prisma.twoFactorSecret.findUnique.mockResolvedValue({ userId, secret: 'test-secret', isEnabled: true });
      await expect(service.verify(userId, ''))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid code format (non-numeric)', async () => {
      prisma.twoFactorSecret.findUnique.mockResolvedValue({ userId, secret: 'test-secret', isEnabled: true });
      await expect(service.verify(userId, 'abcdef'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw for code shorter than 6 digits', async () => {
      prisma.twoFactorSecret.findUnique.mockResolvedValue({ userId, secret: 'test-secret', isEnabled: true });
      await expect(service.verify(userId, '123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw for code longer than 6 digits', async () => {
      prisma.twoFactorSecret.findUnique.mockResolvedValue({ userId, secret: 'test-secret', isEnabled: true });
      await expect(service.verify(userId, '12345678'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw for code with spaces', async () => {
      prisma.twoFactorSecret.findUnique.mockResolvedValue({ userId, secret: 'test-secret', isEnabled: true });
      await expect(service.verify(userId, '12 34 56'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw for code with special characters', async () => {
      prisma.twoFactorSecret.findUnique.mockResolvedValue({ userId, secret: 'test-secret', isEnabled: true });
      await expect(service.verify(userId, '12-345'))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('verify — 2FA not configured', () => {
    it('should throw when no 2FA secret exists for user', async () => {
      prisma.twoFactorSecret.findUnique.mockResolvedValue(null);
      await expect(service.verify(userId, '123456'))
        .rejects.toThrow();
    });

    it('should return false when 2FA is set up but not yet enabled', async () => {
      prisma.twoFactorSecret.findUnique.mockResolvedValue({
        userId,
        secret: 'test-secret',
        isEnabled: false,
      });
      const result = await service.verify(userId, '123456');
      expect(result).toBe(false);
    });
  });

  describe('setup', () => {
    it('should generate setup data for new 2FA enrollment', async () => {
      prisma.twoFactorSecret.findUnique.mockResolvedValue(null);
      prisma.twoFactorSecret.create.mockResolvedValue({ userId, secret: 'NEWTEST', isEnabled: false });
      prisma.user.findUnique.mockResolvedValue({ id: userId, email: 'test@test.com' });

      const result = await service.setup(userId);
      expect(result).toBeDefined();
      expect(result.secret || result.qrDataUri).toBeDefined();
    });

    it('should throw NotFoundException for non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.setup('nonexistent'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw when 2FA is already enabled', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: userId, email: 'test@test.com' });
      prisma.twoFactorSecret.findUnique.mockResolvedValue({
        userId,
        secret: 'existing-secret',
        isEnabled: true,
      });
      await expect(service.setup(userId))
        .rejects.toThrow(BadRequestException);
    });

    it('should return backup codes on setup', async () => {
      prisma.twoFactorSecret.findUnique.mockResolvedValue(null);
      prisma.twoFactorSecret.create.mockResolvedValue({ userId, secret: 'TEST', isEnabled: false });
      prisma.user.findUnique.mockResolvedValue({ id: userId, email: 'test@test.com' });

      const result = await service.setup(userId);
      expect(result.backupCodes).toBeDefined();
      expect(Array.isArray(result.backupCodes)).toBe(true);
      expect(result.backupCodes.length).toBeGreaterThan(0);
    });

    it('should generate unique backup codes (no duplicates)', async () => {
      prisma.twoFactorSecret.findUnique.mockResolvedValue(null);
      prisma.twoFactorSecret.create.mockResolvedValue({ userId, secret: 'TEST', isEnabled: false });
      prisma.user.findUnique.mockResolvedValue({ id: userId, email: 'test@test.com' });

      const result = await service.setup(userId);
      const uniqueCodes = new Set(result.backupCodes);
      expect(uniqueCodes.size).toBe(result.backupCodes.length);
    });

    it('should re-setup if previous setup was not enabled', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: userId, email: 'test@test.com' });
      prisma.twoFactorSecret.findUnique.mockResolvedValue({
        userId,
        secret: 'old-secret',
        isEnabled: false,
      });
      prisma.twoFactorSecret.update.mockResolvedValue({ userId, secret: 'NEW', isEnabled: false });

      const result = await service.setup(userId);
      expect(result).toBeDefined();
      expect(prisma.twoFactorSecret.update).toHaveBeenCalled();
    });
  });

  describe('useBackupCode', () => {
    it('should throw for invalid backup code', async () => {
      prisma.twoFactorSecret.findUnique.mockResolvedValue({ userId, secret: 'test', isEnabled: true });
      prisma.backupCode.findFirst.mockResolvedValue(null);
      await expect(service.useBackupCode(userId, 'INVALID'))
        .rejects.toThrow();
    });

    it('should throw when 2FA is not enabled', async () => {
      prisma.twoFactorSecret.findUnique.mockResolvedValue(null);
      await expect(service.useBackupCode(userId, 'BACKUP123'))
        .rejects.toThrow();
    });

    it('should throw for empty backup code', async () => {
      prisma.twoFactorSecret.findUnique.mockResolvedValue({ userId, secret: 'test', isEnabled: true });
      await expect(service.useBackupCode(userId, ''))
        .rejects.toThrow();
    });
  });

  describe('disable', () => {
    it('should throw when no 2FA configured', async () => {
      prisma.twoFactorSecret.findUnique.mockResolvedValue(null);
      await expect(service.disable(userId, '123456'))
        .rejects.toThrow();
    });

    it('should throw for invalid TOTP code on disable', async () => {
      prisma.twoFactorSecret.findUnique.mockResolvedValue({
        userId,
        secret: 'encrypted-secret',
        isEnabled: true,
      });
      await expect(service.disable(userId, 'WRONG'))
        .rejects.toThrow(BadRequestException);
    });
  });
});
