import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TwoFactorController } from './two-factor.controller';
import { TwoFactorService } from './two-factor.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('TwoFactorController', () => {
  let controller: TwoFactorController;
  let service: jest.Mocked<TwoFactorService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TwoFactorController],
      providers: [
        ...globalMockProviders,
        {
          provide: TwoFactorService,
          useValue: {
            setup: jest.fn(),
            verify: jest.fn(),
            validate: jest.fn(),
            validateStrict: jest.fn(),
            disable: jest.fn(),
            getStatus: jest.fn(),
            useBackupCode: jest.fn(),
            isTwoFactorVerified: jest.fn(),
            clearTwoFactorSession: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(TwoFactorController);
    service = module.get(TwoFactorService) as jest.Mocked<TwoFactorService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('setup', () => {
    it('should call twoFactorService.setup with userId', async () => {
      service.setup.mockResolvedValue({ secret: 'ABC', qrDataUri: 'data:image/png;base64,...', backupCodes: ['code1'] } as any);

      await controller.setup(userId);

      expect(service.setup).toHaveBeenCalledWith(userId);
    });
  });

  describe('verify', () => {
    it('should return success when code is valid', async () => {
      service.verify.mockResolvedValue(true as any);

      const result = await controller.verify(userId, { code: '123456' } as any);

      expect(service.verify).toHaveBeenCalledWith(userId, '123456');
      expect(result).toEqual({ success: true, message: 'Two-factor authentication enabled' });
    });

    it('should throw BadRequestException when code is invalid', async () => {
      service.verify.mockResolvedValue(false as any);

      await expect(controller.verify(userId, { code: '000000' } as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('validate', () => {
    it('should return twoFactorEnabled false when 2FA not enabled', async () => {
      service.getStatus.mockResolvedValue(false as any);

      const result = await controller.validate(userId, { code: '123456' } as any);

      expect(service.getStatus).toHaveBeenCalledWith(userId);
      expect(result).toEqual({ valid: true, twoFactorEnabled: false, sessionVerified: true, message: '2FA not enabled — no code required' });
    });

    it('should call validate and set session flag when 2FA is enabled', async () => {
      service.getStatus.mockResolvedValue(true as any);
      service.validate.mockResolvedValue(true as any);

      const result = await controller.validate(userId, { code: '123456' } as any);

      expect(service.getStatus).toHaveBeenCalledWith(userId);
      expect(service.validate).toHaveBeenCalledWith(userId, '123456');
      expect(result).toEqual({ valid: true, twoFactorEnabled: true, sessionVerified: true });
    });

    it('should return valid false for wrong code when 2FA enabled', async () => {
      service.getStatus.mockResolvedValue(true as any);
      service.validate.mockResolvedValue(false as any);

      const result = await controller.validate(userId, { code: '000000' } as any);

      expect(result).toEqual({ valid: false, twoFactorEnabled: true, sessionVerified: false });
    });
  });

  describe('disable', () => {
    it('should call twoFactorService.disable with userId and code', async () => {
      service.disable.mockResolvedValue(undefined as any);

      const result = await controller.disable(userId, { code: '123456' } as any);

      expect(service.disable).toHaveBeenCalledWith(userId, '123456');
      expect(result).toEqual({ success: true, message: 'Two-factor authentication disabled' });
    });
  });

  describe('status', () => {
    it('should return isEnabled and sessionVerified from service', async () => {
      service.getStatus.mockResolvedValue(true as any);
      service.isTwoFactorVerified.mockResolvedValue(true as any);

      const result = await controller.status(userId);

      expect(service.getStatus).toHaveBeenCalledWith(userId);
      expect(service.isTwoFactorVerified).toHaveBeenCalledWith(userId);
      expect(result).toEqual({ isEnabled: true, sessionVerified: true });
    });

    it('should return sessionVerified false when 2FA not yet verified', async () => {
      service.getStatus.mockResolvedValue(true as any);
      service.isTwoFactorVerified.mockResolvedValue(false as any);

      const result = await controller.status(userId);

      expect(result).toEqual({ isEnabled: true, sessionVerified: false });
    });
  });

  describe('backup', () => {
    it('should return success when backup code is valid', async () => {
      service.useBackupCode.mockResolvedValue(true as any);

      const result = await controller.backup(userId, { backupCode: 'ABCDE12345' } as any);

      expect(service.useBackupCode).toHaveBeenCalledWith(userId, 'ABCDE12345');
      expect(result).toEqual({ success: true, message: 'Backup code accepted' });
    });

    it('should throw BadRequestException when backup code is invalid', async () => {
      service.useBackupCode.mockResolvedValue(false as any);

      await expect(controller.backup(userId, { backupCode: 'INVALID123' } as any)).rejects.toThrow(BadRequestException);
    });
  });
});
