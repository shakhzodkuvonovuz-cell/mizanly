// @ts-nocheck
import { Test, TestingModule } from '@nestjs/testing';
import { TwoFactorService } from './two-factor.service';
import { PrismaService } from '../../config/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { globalMockProviders } from '../../common/test/mock-providers';

// Type declarations for mocked modules
declare module 'otplib' {
  export const authenticator: {
    generateSecret: (length: number) => string;
    keyuri: (accountName: string, issuer: string, secret: string) => string;
    verify: (options: { token: string; secret: string }) => boolean;
  };
}
declare module 'qrcode' {
  export const toDataURL: (text: string) => Promise<string>;
}

// Mock external modules — must match actual named imports
jest.mock('otplib', () => ({
  generateSecret: jest.fn().mockReturnValue('MOCKSECRETBASE32AAAA'),
  generateURI: jest.fn().mockReturnValue('otpauth://totp/Mizanly:user@test.com?secret=MOCK'),
  verifySync: jest.fn().mockReturnValue({ valid: true }),
}));
jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mock'),
}));

describe('TwoFactorService', () => {
  let service: TwoFactorService;
  let prisma: PrismaService;

  // Mock data
  const mockUserId = 'user-123';
  const mockUser = {
    id: mockUserId,
    email: 'test@example.com',
    displayName: 'Test User',
  };
  const mockSecret = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const mockBackupCodesHashed = ['hash1', 'hash2', 'hash3', 'hash4', 'hash5', 'hash6', 'hash7', 'hash8'];
  const mockBackupCodesPlain = Array.from({ length: 8 }, (_, i) => `BACKUP${(i + 1).toString().padStart(2, '0')}`);
  const mockBackupCodeToHash = Object.fromEntries(mockBackupCodesPlain.map((code, i) => [code, mockBackupCodesHashed[i]]));
  const mockQrDataUri = 'data:image/png;base64,QRCODE';

  // Mock PrismaService
  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
    twoFactorSecret: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  // Mocked module instances — match the named exports from otplib
  const mockOtplib = require('otplib');
  const mockQrcode = require('qrcode');

  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();

    // Set up default mock implementations
    mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
    mockOtplib.generateSecret.mockReturnValue(mockSecret);
    mockOtplib.generateURI.mockReturnValue('otpauth://totp/Mizanly:test@example.com?secret=ABCDEFGHIJKLMNOPQRSTUVWXYZ234567&issuer=Mizanly');
    mockOtplib.verifySync.mockReturnValue({ valid: true });
    mockQrcode.toDataURL.mockResolvedValue(mockQrDataUri);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        TwoFactorService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<TwoFactorService>(TwoFactorService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('setup', () => {
    it('should generate secret, QR code, and backup codes for new user', async () => {
      // No existing secret record
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(null);
      mockPrismaService.twoFactorSecret.create.mockResolvedValue({
        userId: mockUserId,
        secret: mockSecret,
        backupCodes: mockBackupCodesHashed,
        isEnabled: false,
        verifiedAt: null,
      });

      // Mock private methods for deterministic backup codes
      const generateSpy = jest.spyOn(service as any, 'generateBackupCodes');
      generateSpy.mockReturnValue(mockBackupCodesPlain);
      const hashSpy = jest.spyOn(service as any, 'hashBackupCode');
      hashSpy.mockImplementation((code) => mockBackupCodeToHash[code] || 'unknown');

      const result = await service.setup(mockUserId);

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockUserId },
      });
      expect(mockPrismaService.twoFactorSecret.findUnique).toHaveBeenCalledWith({
        where: { userId: mockUserId },
      });
      expect(mockOtplib.generateSecret).toHaveBeenCalledWith({ length: 32 });
      expect(mockOtplib.generateURI).toHaveBeenCalledWith({ issuer: 'Mizanly', label: mockUser.email, secret: mockSecret });
      expect(mockQrcode.toDataURL).toHaveBeenCalledWith('otpauth://totp/Mizanly:test@example.com?secret=ABCDEFGHIJKLMNOPQRSTUVWXYZ234567&issuer=Mizanly');
      expect(mockPrismaService.twoFactorSecret.create).toHaveBeenCalledWith({
        data: {
          userId: mockUserId,
          secret: mockSecret,
          backupCodes: mockBackupCodesHashed,
          isEnabled: false,
        },
      });

      expect(result).toEqual({
        secret: mockSecret,
        qrDataUri: mockQrDataUri,
        backupCodes: mockBackupCodesPlain, // plain backup codes returned
      });
      expect(result.backupCodes).toHaveLength(8);

      // Restore spies
      generateSpy.mockRestore();
      hashSpy.mockRestore();
    });

    it('should update existing secret record if not enabled', async () => {
      const existingRecord = {
        userId: mockUserId,
        secret: 'oldsecret',
        backupCodes: ['oldhash'],
        isEnabled: false,
        verifiedAt: null,
      };
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(existingRecord);
      mockPrismaService.twoFactorSecret.update.mockResolvedValue({
        ...existingRecord,
        secret: mockSecret,
        backupCodes: mockBackupCodesHashed,
      });

      // Mock private methods for deterministic backup codes
      const generateSpy = jest.spyOn(service as any, 'generateBackupCodes');
      generateSpy.mockReturnValue(mockBackupCodesPlain);
      const hashSpy = jest.spyOn(service as any, 'hashBackupCode');
      hashSpy.mockImplementation((code) => mockBackupCodeToHash[code] || 'unknown');

      await service.setup(mockUserId);

      expect(mockPrismaService.twoFactorSecret.update).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        data: {
          secret: mockSecret,
          backupCodes: mockBackupCodesHashed,
          isEnabled: false,
          verifiedAt: null,
        },
      });
      expect(mockPrismaService.twoFactorSecret.create).not.toHaveBeenCalled();

      // Restore spies
      generateSpy.mockRestore();
      hashSpy.mockRestore();
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.setup(mockUserId)).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.twoFactorSecret.findUnique).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if 2FA already enabled', async () => {
      const existingRecord = {
        userId: mockUserId,
        secret: 'oldsecret',
        backupCodes: ['oldhash'],
        isEnabled: true,
        verifiedAt: new Date(),
      };
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(existingRecord);

      await expect(service.setup(mockUserId)).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.twoFactorSecret.update).not.toHaveBeenCalled();
      expect(mockPrismaService.twoFactorSecret.create).not.toHaveBeenCalled();
    });
  });

  describe('verify', () => {
    it('should enable 2FA with valid code', async () => {
      const secretRecord = {
        userId: mockUserId,
        secret: mockSecret,
        isEnabled: false,
      };
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(secretRecord);
      mockPrismaService.twoFactorSecret.update.mockResolvedValue({
        ...secretRecord,
        isEnabled: true,
        verifiedAt: new Date(),
      });

      const result = await service.verify(mockUserId, '123456');

      expect(mockPrismaService.twoFactorSecret.findUnique).toHaveBeenCalledWith({
        where: { userId: mockUserId },
      });
      expect(mockOtplib.verifySync).toHaveBeenCalledWith({
        token: '123456',
        secret: mockSecret,
      });
      expect(mockPrismaService.twoFactorSecret.update).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        data: {
          isEnabled: true,
          verifiedAt: expect.any(Date),
        },
      });
      expect(result).toBe(true);
    });

    it('should return false for invalid code', async () => {
      const secretRecord = {
        userId: mockUserId,
        secret: mockSecret,
        isEnabled: false,
      };
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(secretRecord);
      mockOtplib.verifySync.mockReturnValue({ valid: false });

      const result = await service.verify(mockUserId, 'wrongcode');

      expect(result).toBe(false);
      expect(mockPrismaService.twoFactorSecret.update).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if 2FA not set up', async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(null);

      await expect(service.verify(mockUserId, '123456')).rejects.toThrow(BadRequestException);
      expect(mockOtplib.verifySync).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if already enabled', async () => {
      const secretRecord = {
        userId: mockUserId,
        secret: mockSecret,
        isEnabled: true,
      };
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(secretRecord);

      await expect(service.verify(mockUserId, '123456')).rejects.toThrow(BadRequestException);
      expect(mockOtplib.verifySync).not.toHaveBeenCalled();
    });
  });

  describe('validate', () => {
    it('should return true for valid code when 2FA enabled', async () => {
      const secretRecord = {
        userId: mockUserId,
        secret: mockSecret,
        isEnabled: true,
      };
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(secretRecord);
      mockOtplib.verifySync.mockReturnValue({ valid: true });

      const result = await service.validate(mockUserId, '123456');

      expect(mockPrismaService.twoFactorSecret.findUnique).toHaveBeenCalledWith({
        where: { userId: mockUserId },
      });
      expect(mockOtplib.verifySync).toHaveBeenCalledWith({
        token: '123456',
        secret: mockSecret,
      });
      expect(result).toBe(true);
    });

    it('should return false for invalid code when 2FA enabled', async () => {
      const secretRecord = {
        userId: mockUserId,
        secret: mockSecret,
        isEnabled: true,
      };
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(secretRecord);
      mockOtplib.verifySync.mockReturnValue({ valid: false });

      const result = await service.validate(mockUserId, 'wrongcode');

      expect(result).toBe(false);
    });

    it('should return true if 2FA not set up', async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(null);

      const result = await service.validate(mockUserId, 'anycode');

      expect(result).toBe(true);
    });

    it('should return true if 2FA not enabled', async () => {
      const secretRecord = {
        userId: mockUserId,
        secret: mockSecret,
        isEnabled: false,
      };
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(secretRecord);

      const result = await service.validate(mockUserId, 'anycode');

      expect(result).toBe(true);
    });
  });

  describe('disable', () => {
    it('should disable 2FA with valid verification code', async () => {
      const secretRecord = {
        userId: mockUserId,
        secret: mockSecret,
        isEnabled: true,
      };
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(secretRecord);
      mockOtplib.verifySync.mockReturnValue({ valid: true });
      mockPrismaService.twoFactorSecret.update.mockResolvedValue({
        ...secretRecord,
        isEnabled: false,
        verifiedAt: null,
      });

      await service.disable(mockUserId, '123456');

      expect(mockPrismaService.twoFactorSecret.findUnique).toHaveBeenCalledTimes(2); // once in disable, once in verifyToken
      expect(mockOtplib.verifySync).toHaveBeenCalledWith({
        token: '123456',
        secret: mockSecret,
      });
      expect(mockPrismaService.twoFactorSecret.update).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        data: {
          isEnabled: false,
          verifiedAt: null,
        },
      });
    });

    it('should throw BadRequestException if 2FA not set up', async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(null);

      await expect(service.disable(mockUserId, '123456')).rejects.toThrow(BadRequestException);
      expect(mockOtplib.verifySync).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if 2FA not enabled', async () => {
      const secretRecord = {
        userId: mockUserId,
        secret: mockSecret,
        isEnabled: false,
      };
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(secretRecord);

      await expect(service.disable(mockUserId, '123456')).rejects.toThrow(BadRequestException);
      expect(mockOtplib.verifySync).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid verification code', async () => {
      const secretRecord = {
        userId: mockUserId,
        secret: mockSecret,
        isEnabled: true,
      };
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(secretRecord);
      mockOtplib.verifySync.mockReturnValue({ valid: false });

      await expect(service.disable(mockUserId, 'wrongcode')).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.twoFactorSecret.update).not.toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('should return true if 2FA enabled', async () => {
      const secretRecord = {
        userId: mockUserId,
        secret: mockSecret,
        isEnabled: true,
      };
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(secretRecord);

      const result = await service.getStatus(mockUserId);

      expect(mockPrismaService.twoFactorSecret.findUnique).toHaveBeenCalledWith({
        where: { userId: mockUserId },
      });
      expect(result).toBe(true);
    });

    it('should return false if 2FA not enabled', async () => {
      const secretRecord = {
        userId: mockUserId,
        secret: mockSecret,
        isEnabled: false,
      };
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(secretRecord);

      const result = await service.getStatus(mockUserId);

      expect(result).toBe(false);
    });

    it('should return false if no secret record', async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(null);

      const result = await service.getStatus(mockUserId);

      expect(result).toBe(false);
    });
  });

  describe('useBackupCode', () => {
    it('should accept valid backup code and remove it', async () => {
      const secretRecord = {
        userId: mockUserId,
        secret: mockSecret,
        isEnabled: true,
        backupCodes: mockBackupCodesHashed,
      };
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(secretRecord);
      mockPrismaService.twoFactorSecret.update.mockResolvedValue({
        ...secretRecord,
        backupCodes: mockBackupCodesHashed.slice(1),
      });

      // Mock hashBackupCode (private method) by spying on service instance
      const hashSpy = jest.spyOn(service as any, 'hashBackupCode');
      hashSpy.mockReturnValue(mockBackupCodesHashed[0]);

      const result = await service.useBackupCode(mockUserId, 'BACKUP001');

      expect(mockPrismaService.twoFactorSecret.findUnique).toHaveBeenCalledWith({
        where: { userId: mockUserId },
      });
      expect(hashSpy).toHaveBeenCalledWith('BACKUP001');
      expect(mockPrismaService.twoFactorSecret.update).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        data: {
          backupCodes: mockBackupCodesHashed.slice(1),
        },
      });
      expect(result).toBe(true);
      hashSpy.mockRestore();
    });

    it('should return false for invalid backup code', async () => {
      const secretRecord = {
        userId: mockUserId,
        secret: mockSecret,
        isEnabled: true,
        backupCodes: mockBackupCodesHashed,
      };
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(secretRecord);

      const hashSpy = jest.spyOn(service as any, 'hashBackupCode');
      hashSpy.mockReturnValue('wronghash');

      const result = await service.useBackupCode(mockUserId, 'INVALID');

      expect(result).toBe(false);
      expect(mockPrismaService.twoFactorSecret.update).not.toHaveBeenCalled();
      hashSpy.mockRestore();
    });

    it('should throw BadRequestException if 2FA not enabled', async () => {
      const secretRecord = {
        userId: mockUserId,
        secret: mockSecret,
        isEnabled: false,
        backupCodes: mockBackupCodesHashed,
      };
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(secretRecord);

      await expect(service.useBackupCode(mockUserId, 'BACKUP001')).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.twoFactorSecret.update).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if no secret record', async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(null);

      await expect(service.useBackupCode(mockUserId, 'BACKUP001')).rejects.toThrow(BadRequestException);
    });
  });

  // Edge cases and private method tests (optional)
  describe('private methods', () => {
    describe('generateBackupCodes', () => {
      it('should generate correct number of codes', () => {
        const codes = (service as any).generateBackupCodes(5);
        expect(codes).toHaveLength(5);
        codes.forEach((code: any) => {
          expect(code).toMatch(/^[A-Z0-9]{10}$/);
        });
      });
    });

    describe('hashBackupCode', () => {
      it('should produce consistent SHA-256 hash', () => {
        const hash = (service as any).hashBackupCode('BACKUP001');
        expect(hash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex length
      });
    });
  });
});