import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
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

  it('should generate setup data for new 2FA enrollment', async () => {
    prisma.twoFactorSecret.findUnique.mockResolvedValue(null);
    prisma.twoFactorSecret.create.mockResolvedValue({ userId, secret: 'NEWTEST', isEnabled: false });
    prisma.user.findUnique.mockResolvedValue({ id: userId, email: 'test@test.com' });

    const result = await service.setup(userId);
    expect(result).toBeDefined();
    // Should return QR code / secret data
    expect(result.secret || result.qrCodeUrl).toBeDefined();
    expect(typeof (result.secret || result.qrCodeUrl)).toBe('string');
  });

  it('should validate backup code format', async () => {
    prisma.twoFactorSecret.findUnique.mockResolvedValue({ userId, secret: 'test', isEnabled: true });
    prisma.backupCode.findFirst.mockResolvedValue(null);
    // Non-matching backup code should fail
    await expect(service.useBackupCode(userId, 'INVALID'))
      .rejects.toThrow();
  });
});
