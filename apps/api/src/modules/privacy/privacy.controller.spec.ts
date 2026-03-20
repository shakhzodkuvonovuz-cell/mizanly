import { Test, TestingModule } from '@nestjs/testing';
import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('PrivacyController', () => {
  let controller: PrivacyController;
  let service: jest.Mocked<PrivacyService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PrivacyController],
      providers: [
        ...globalMockProviders,
        {
          provide: PrivacyService,
          useValue: {
            exportUserData: jest.fn(),
            deleteAllUserData: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(PrivacyController);
    service = module.get(PrivacyService) as jest.Mocked<PrivacyService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('exportData', () => {
    it('should call privacyService.exportUserData with userId', async () => {
      service.exportUserData.mockResolvedValue({ downloadUrl: 'https://example.com/data.zip' } as any);

      const result = await controller.exportData(userId);

      expect(service.exportUserData).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expect.objectContaining({ downloadUrl: 'https://example.com/data.zip' }));
    });
  });

  describe('deleteAll', () => {
    it('should call privacyService.deleteAllUserData with userId', async () => {
      service.deleteAllUserData.mockResolvedValue({ deleted: true } as any);

      const result = await controller.deleteAll(userId);

      expect(service.deleteAllUserData).toHaveBeenCalledWith(userId);
      expect(result).toEqual({ deleted: true });
    });
  });
});
