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

  let mockRedis: Record<string, jest.Mock>;

  const mockPrismaService = {
    user: { findUnique: jest.fn() },
    twoFactorSecret: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        TwoFactorService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: 'REDIS', useValue: mockRedis },
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

    it('should consume a valid backup code and remove it (T01 #34)', async () => {
      // First setup to get a real backup code and its hash
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.twoFactorSecret.create.mockImplementation(({ data }: any) => Promise.resolve(data));
      const setup = await service.setup(mockUserId);
      const backupCode = setup.backupCodes[0];

      // Get the hashed backup codes from the create call
      const createCall = mockPrismaService.twoFactorSecret.create.mock.calls[0][0];
      const hashedCodes = createCall.data.backupCodes;

      // Now test useBackupCode with the real code + hashes
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue({
        isEnabled: true,
        backupCodes: hashedCodes,
      });
      mockPrismaService.twoFactorSecret.update.mockResolvedValue({});

      const result = await service.useBackupCode(mockUserId, backupCode);
      expect(result).toBe(true);
      // Verify the update removed one code (7 remaining from 8)
      expect(mockPrismaService.twoFactorSecret.update).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        data: { backupCodes: expect.any(Array) },
      });
      const updatedCodes = mockPrismaService.twoFactorSecret.update.mock.calls[0][0].data.backupCodes;
      expect(updatedCodes).toHaveLength(7);
    });
  });

  // ── T01 Happy Path Tests (previously untested) ──

  describe('verify — success path (T01 #33)', () => {
    it('should enable 2FA when valid TOTP code is provided', async () => {
      // Setup a secret first to get a real TOTP secret
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.twoFactorSecret.create.mockImplementation(({ data }: any) => Promise.resolve(data));
      const setup = await service.setup(mockUserId);
      const totpSecret = setup.secret;

      // Generate a valid TOTP code using the same algorithm
      const crypto = require('crypto');
      const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
      function base32Decode(encoded: string): Buffer {
        const cleaned = encoded.replace(/=+$/, '').toUpperCase();
        const bytes: number[] = [];
        let bits = 0;
        let value = 0;
        for (const char of cleaned) {
          const idx = BASE32_CHARS.indexOf(char);
          if (idx === -1) continue;
          value = (value << 5) | idx;
          bits += 5;
          if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 255);
            bits -= 8;
          }
        }
        return Buffer.from(bytes);
      }
      const time = Math.floor(Date.now() / 1000 / 30);
      const buf = Buffer.alloc(8);
      buf.writeUInt32BE(0, 0);
      buf.writeUInt32BE(time, 4);
      const hmac = crypto.createHmac('sha1', base32Decode(totpSecret)).update(buf).digest();
      const offset = hmac[hmac.length - 1] & 0xf;
      const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % (10 ** 6);
      const validCode = code.toString().padStart(6, '0');

      // Now test verify with the real code
      // The service will look up the stored secret (which was encrypted by setup)
      const createCall = mockPrismaService.twoFactorSecret.create.mock.calls[0][0];
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue({
        secret: createCall.data.secret,
        isEnabled: false,
      });
      mockPrismaService.twoFactorSecret.update.mockResolvedValue({});

      const result = await service.verify(mockUserId, validCode);
      expect(result).toBe(true);
      expect(mockPrismaService.twoFactorSecret.update).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        data: { isEnabled: true, verifiedAt: expect.any(Date) },
      });
    });
  });

  describe('disable — success path (T01 #35)', () => {
    it('should disable 2FA when valid code is provided', async () => {
      // Setup secret first
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.twoFactorSecret.create.mockImplementation(({ data }: any) => Promise.resolve(data));
      const setup = await service.setup(mockUserId);
      const totpSecret = setup.secret;

      // Generate valid code
      const crypto = require('crypto');
      const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
      function base32Decode(encoded: string): Buffer {
        const cleaned = encoded.replace(/=+$/, '').toUpperCase();
        const bytes: number[] = [];
        let bits = 0;
        let value = 0;
        for (const char of cleaned) {
          const idx = BASE32_CHARS.indexOf(char);
          if (idx === -1) continue;
          value = (value << 5) | idx;
          bits += 5;
          if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 255);
            bits -= 8;
          }
        }
        return Buffer.from(bytes);
      }
      const time = Math.floor(Date.now() / 1000 / 30);
      const buf = Buffer.alloc(8);
      buf.writeUInt32BE(0, 0);
      buf.writeUInt32BE(time, 4);
      const hmac = crypto.createHmac('sha1', base32Decode(totpSecret)).update(buf).digest();
      const offset = hmac[hmac.length - 1] & 0xf;
      const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % (10 ** 6);
      const validCode = code.toString().padStart(6, '0');

      const createCall = mockPrismaService.twoFactorSecret.create.mock.calls[0][0];
      // First call: disable checks (needs isEnabled: true)
      // Second call: verifyToken inside disable
      mockPrismaService.twoFactorSecret.findUnique
        .mockResolvedValueOnce({ secret: createCall.data.secret, isEnabled: true })
        .mockResolvedValueOnce({ secret: createCall.data.secret, isEnabled: true });
      mockPrismaService.twoFactorSecret.update.mockResolvedValue({});

      await service.disable(mockUserId, validCode);

      expect(mockPrismaService.twoFactorSecret.update).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        data: { isEnabled: false, verifiedAt: null },
      });
    });
  });

  describe('validateStrict — not enabled (T01 #32)', () => {
    it('should return false when 2FA is not enabled', async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(null);
      const result = await service.validateStrict(mockUserId, '123456');
      expect(result).toBe(false);
    });

    it('should return false when record exists but not enabled', async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue({ secret: 'ABC', isEnabled: false });
      const result = await service.validateStrict(mockUserId, '123456');
      expect(result).toBe(false);
    });
  });

  describe('validate — session flag (#85)', () => {
    it('should set Redis session flag on successful validation', async () => {
      // Setup secret first to get a real TOTP
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.twoFactorSecret.create.mockImplementation(({ data }: any) => Promise.resolve(data));
      const setup = await service.setup(mockUserId);
      const totpSecret = setup.secret;

      // Generate a valid TOTP code
      const crypto = require('crypto');
      const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
      function base32Decode(encoded: string): Buffer {
        const cleaned = encoded.replace(/=+$/, '').toUpperCase();
        const bytes: number[] = [];
        let bits = 0;
        let value = 0;
        for (const char of cleaned) {
          const idx = BASE32_CHARS.indexOf(char);
          if (idx === -1) continue;
          value = (value << 5) | idx;
          bits += 5;
          if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 255);
            bits -= 8;
          }
        }
        return Buffer.from(bytes);
      }
      const time = Math.floor(Date.now() / 1000 / 30);
      const buf = Buffer.alloc(8);
      buf.writeUInt32BE(0, 0);
      buf.writeUInt32BE(time, 4);
      const hmac = crypto.createHmac('sha1', base32Decode(totpSecret)).update(buf).digest();
      const offset = hmac[hmac.length - 1] & 0xf;
      const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % (10 ** 6);
      const validCode = code.toString().padStart(6, '0');

      // Now validate with the real code
      const createCall = mockPrismaService.twoFactorSecret.create.mock.calls[0][0];
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue({
        secret: createCall.data.secret,
        isEnabled: true,
      });

      const result = await service.validate(mockUserId, validCode);
      expect(result).toBe(true);
      // Should have stored session flag in Redis
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `2fa:verified:${mockUserId}`,
        86400, // 24 hours
        '1',
      );
    });

    it('should NOT set Redis session flag on failed validation', async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue({
        secret: 'ABCDEFGHIJK',
        isEnabled: true,
      });
      const result = await service.validate(mockUserId, '000000');
      expect(result).toBe(false);
      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it('should return true without Redis call when 2FA not enabled', async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(null);
      const result = await service.validate(mockUserId, '123456');
      expect(result).toBe(true);
      expect(mockRedis.setex).not.toHaveBeenCalled();
    });
  });

  describe('isTwoFactorVerified (#85)', () => {
    it('should return true when 2FA is not enabled', async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue(null);
      const result = await service.isTwoFactorVerified(mockUserId);
      expect(result).toBe(true);
    });

    it('should return true when 2FA is enabled and session flag exists', async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue({ isEnabled: true });
      mockRedis.get.mockResolvedValue('1');
      const result = await service.isTwoFactorVerified(mockUserId);
      expect(result).toBe(true);
      expect(mockRedis.get).toHaveBeenCalledWith(`2fa:verified:${mockUserId}`);
    });

    it('should return false when 2FA is enabled but session flag missing', async () => {
      mockPrismaService.twoFactorSecret.findUnique.mockResolvedValue({ isEnabled: true });
      mockRedis.get.mockResolvedValue(null);
      const result = await service.isTwoFactorVerified(mockUserId);
      expect(result).toBe(false);
    });
  });

  describe('clearTwoFactorSession (#85)', () => {
    it('should delete the Redis session key', async () => {
      await service.clearTwoFactorSession(mockUserId);
      expect(mockRedis.del).toHaveBeenCalledWith(`2fa:verified:${mockUserId}`);
    });
  });
});
