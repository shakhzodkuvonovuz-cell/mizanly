import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { BlocksController } from './blocks.controller';
import { BlocksService } from './blocks.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('BlocksController', () => {
  let controller: BlocksController;
  let service: jest.Mocked<BlocksService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BlocksController],
      providers: [
        ...globalMockProviders,
        {
          provide: BlocksService,
          useValue: {
            block: jest.fn(),
            unblock: jest.fn(),
            getBlockedList: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(BlocksController);
    service = module.get(BlocksService) as jest.Mocked<BlocksService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('block', () => {
    it('should call blocksService.block with blockerId and blockedId', async () => {
      service.block.mockResolvedValue({ blocked: true } as any);

      const result = await controller.block(userId, 'user-456');

      expect(service.block).toHaveBeenCalledWith(userId, 'user-456');
      expect(result).toEqual({ blocked: true });
    });

    it('should propagate BadRequestException when blocking self', async () => {
      service.block.mockRejectedValue(new BadRequestException('Cannot block yourself'));

      await expect(controller.block(userId, userId)).rejects.toThrow(BadRequestException);
    });
  });

  describe('unblock', () => {
    it('should call blocksService.unblock with blockerId and blockedId', async () => {
      service.unblock.mockResolvedValue({ unblocked: true } as any);

      const result = await controller.unblock(userId, 'user-456');

      expect(service.unblock).toHaveBeenCalledWith(userId, 'user-456');
      expect(result).toEqual({ unblocked: true });
    });
  });

  describe('getBlockedList', () => {
    it('should call blocksService.getBlockedList with userId and cursor', async () => {
      const mockList = { data: [{ id: 'user-456', username: 'blocked1' }], meta: { cursor: null, hasMore: false } };
      service.getBlockedList.mockResolvedValue(mockList as any);

      const result = await controller.getBlockedList(userId, 'cursor-1');

      expect(service.getBlockedList).toHaveBeenCalledWith(userId, 'cursor-1');
      expect(result).toEqual(mockList);
    });
  });
});
