import { Test, TestingModule } from '@nestjs/testing';
import { RestrictsController } from './restricts.controller';
import { RestrictsService } from './restricts.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('RestrictsController', () => {
  let controller: RestrictsController;
  let service: jest.Mocked<RestrictsService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RestrictsController],
      providers: [
        ...globalMockProviders,
        {
          provide: RestrictsService,
          useValue: {
            restrict: jest.fn(),
            unrestrict: jest.fn(),
            getRestrictedList: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(RestrictsController);
    service = module.get(RestrictsService) as jest.Mocked<RestrictsService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('restrict', () => {
    it('should call restrictsService.restrict with restricterId and restrictedId', async () => {
      service.restrict.mockResolvedValue({ restricted: true } as any);

      const result = await controller.restrict(userId, 'user-456');

      expect(service.restrict).toHaveBeenCalledWith(userId, 'user-456');
      expect(result).toEqual({ restricted: true });
    });
  });

  describe('unrestrict', () => {
    it('should call restrictsService.unrestrict with restricterId and restrictedId', async () => {
      service.unrestrict.mockResolvedValue({ unrestricted: true } as any);

      const result = await controller.unrestrict(userId, 'user-456');

      expect(service.unrestrict).toHaveBeenCalledWith(userId, 'user-456');
      expect(result).toEqual({ unrestricted: true });
    });
  });

  describe('getRestrictedList', () => {
    it('should call restrictsService.getRestrictedList with userId and cursor', async () => {
      service.getRestrictedList.mockResolvedValue({ data: [] } as any);

      await controller.getRestrictedList(userId, 'cursor-1');

      expect(service.getRestrictedList).toHaveBeenCalledWith(userId, 'cursor-1');
    });
  });
});
