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
      service.getRestrictedList.mockResolvedValue({ data: [], meta: { hasMore: false } } as any);

      const result = await controller.getRestrictedList(userId, 'cursor-1');

      expect(service.getRestrictedList).toHaveBeenCalledWith(userId, 'cursor-1');
      expect(result.data).toEqual([]);
    });

    it('should return paginated data with hasMore', async () => {
      service.getRestrictedList.mockResolvedValue({
        data: [{ id: 'user-456', username: 'restricted1' }],
        meta: { hasMore: true, cursor: 'user-456' },
      } as any);

      const result = await controller.getRestrictedList(userId, undefined);

      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(true);
    });
  });

  describe('restrict — error cases', () => {
    it('should propagate BadRequestException when restricting self', async () => {
      const { BadRequestException } = require('@nestjs/common');
      service.restrict.mockRejectedValue(new BadRequestException('Cannot restrict yourself'));

      await expect(controller.restrict(userId, userId)).rejects.toThrow(BadRequestException);
    });

    it('should propagate NotFoundException when target not found', async () => {
      const { NotFoundException } = require('@nestjs/common');
      service.restrict.mockRejectedValue(new NotFoundException('User not found'));

      await expect(controller.restrict(userId, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('unrestrict — idempotent', () => {
    it('should succeed even if not currently restricted', async () => {
      service.unrestrict.mockResolvedValue({ message: 'User unrestricted' } as any);

      const result = await controller.unrestrict(userId, 'user-456');

      expect(result).toEqual({ message: 'User unrestricted' });
    });
  });
});
