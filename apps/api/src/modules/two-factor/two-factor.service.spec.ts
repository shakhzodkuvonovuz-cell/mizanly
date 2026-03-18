import { Test, TestingModule } from '@nestjs/testing';
import { TwoFactorService } from './two-factor.service';
import { PrismaService } from '../../config/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { globalMockProviders } from '../../common/test/mock-providers';

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mock'),
}));

describe('TwoFactorService', () => {
  let service: TwoFactorService;

  const mockUserId = 'user-123';
  const mockUser = { id: mockUserId, email: 'test@example.com' };

  const mockPrismaService = {
    user: { findUnique: jest.fn() },
    twoFactorSecret: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        TwoFactorService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<TwoFactorService>(TwoFactorService);
  });

  describe('setup', () => {
    it('should generate secret, QR code, and backup codes', async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(null);
      mockPrismaService.twoFactorSecret.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      const result = await service.setup(mockUserId);

      expect(result.secret).toBeDefined();
      expect(result.secret.length).toBeGreaterThan(10);
      expect(result.qrDataUri).toBe('data:image/png;base64,mock');
      expect(result.backupCodes).toHaveLength(8);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(service.setup(mockUserId)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if already enabled', async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue({ isEnabled: true });
      await expect(service.setup(mockUserId)).rejects.toThrow(BadRequestException);
    });
  });

  describe('verify', () => {
    it('should throw BadRequestException if not set up', async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(null);
      await expect(service.verify(mockUserId, '123456')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if already enabled', async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue({ secret: 'ABC', isEnabled: true });
      await expect(service.verify(mockUserId, '123456')).rejects.toThrow(BadRequestException);
    });

    it('should return false for invalid code', async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue({ secret: 'ABCDEFGHIJK', isEnabled: false });
      const result = await service.verify(mockUserId, '000000');
      expect(result).toBe(false);
    });
  });

  describe('validate', () => {
    it('should return true if 2FA not enabled (no requirement)', async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(null);
      const result = await service.validate(mockUserId, '123456');
      expect(result).toBe(true);
    });

    it('should return false for wrong code when 2FA enabled', async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue({ secret: 'ABCDEFGHIJK', isEnabled: true });
      const result = await service.validate(mockUserId, '000000');
      expect(result).toBe(false);
    });
  });

  describe('disable', () => {
    it('should throw BadRequestException if not set up', async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(null);
      await expect(service.disable(mockUserId, '123456')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if not enabled', async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue({ secret: 'ABC', isEnabled: false });
      await expect(service.disable(mockUserId, '123456')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid code', async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue({ secret: 'ABCDEFGHIJK', isEnabled: true });
      await expect(service.disable(mockUserId, '000000')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getStatus', () => {
    it('should return true when enabled', async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue({ isEnabled: true });
      expect(await service.getStatus(mockUserId)).toBe(true);
    });

    it('should return false when not set up', async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(null);
      expect(await service.getStatus(mockUserId)).toBe(false);
    });
  });

  describe('useBackupCode', () => {
    it('should throw BadRequestException if 2FA not enabled', async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(null);
      await expect(service.useBackupCode(mockUserId, 'BACKUP01')).rejects.toThrow(BadRequestException);
    });

    it('should return false for invalid backup code', async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue({ isEnabled: true, backupCodes: ['hash1', 'hash2'] });
      const result = await service.useBackupCode(mockUserId, 'WRONGCODE');
      expect(result).toBe(false);
    });
  });
});
