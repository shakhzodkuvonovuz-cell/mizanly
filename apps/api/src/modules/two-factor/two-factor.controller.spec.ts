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
            disable: jest.fn(),
            getStatus: jest.fn(),
            useBackupCode: jest.fn(),
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
    it('should call twoFactorService.validate with userId and code', async () => {
      service.validate.mockResolvedValue(true as any);

      const result = await controller.validate({ userId: 'user-456', code: '123456' } as any);

      expect(service.validate).toHaveBeenCalledWith('user-456', '123456');
      expect(result).toEqual({ valid: true });
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
    it('should return isEnabled from service', async () => {
      service.getStatus.mockResolvedValue(true as any);

      const result = await controller.status(userId);

      expect(service.getStatus).toHaveBeenCalledWith(userId);
      expect(result).toEqual({ isEnabled: true });
    });
  });

  describe('backup', () => {
    it('should return success when backup code is valid', async () => {
      service.useBackupCode.mockResolvedValue(true as any);

      const result = await controller.backup({ userId: 'user-456', backupCode: 'ABCDE12345' } as any);

      expect(service.useBackupCode).toHaveBeenCalledWith('user-456', 'ABCDE12345');
      expect(result).toEqual({ success: true, message: 'Backup code accepted' });
    });

    it('should throw BadRequestException when backup code is invalid', async () => {
      service.useBackupCode.mockResolvedValue(false as any);

      await expect(controller.backup({ userId: 'user-456', backupCode: 'INVALID123' } as any)).rejects.toThrow(BadRequestException);
    });
  });
});
