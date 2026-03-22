import { Test, TestingModule } from '@nestjs/testing';
import { MutesController } from './mutes.controller';
import { MutesService } from './mutes.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('MutesController', () => {
  let controller: MutesController;
  let service: jest.Mocked<MutesService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MutesController],
      providers: [
        ...globalMockProviders,
        {
          provide: MutesService,
          useValue: {
            mute: jest.fn(),
            unmute: jest.fn(),
            getMutedList: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(MutesController);
    service = module.get(MutesService) as jest.Mocked<MutesService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('mute', () => {
    it('should call mutesService.mute with userId and mutedId', async () => {
      service.mute.mockResolvedValue({ muted: true } as any);

      const result = await controller.mute(userId, 'user-456');

      expect(service.mute).toHaveBeenCalledWith(userId, 'user-456');
      expect(result).toEqual({ muted: true });
    });
  });

  describe('unmute', () => {
    it('should call mutesService.unmute with userId and mutedId', async () => {
      service.unmute.mockResolvedValue({ unmuted: true } as any);

      const result = await controller.unmute(userId, 'user-456');

      expect(service.unmute).toHaveBeenCalledWith(userId, 'user-456');
      expect(result).toEqual({ unmuted: true });
    });
  });

  describe('getMutedList', () => {
    it('should call mutesService.getMutedList with userId and cursor', async () => {
      service.getMutedList.mockResolvedValue({ data: [{ id: 'user-456' }], meta: { hasMore: false } } as any);

      const result = await controller.getMutedList(userId, 'cursor-1');

      expect(service.getMutedList).toHaveBeenCalledWith(userId, 'cursor-1');
      expect(result.data).toHaveLength(1);
    });

    it('should return empty list when no mutes', async () => {
      service.getMutedList.mockResolvedValue({ data: [], meta: { hasMore: false, cursor: null } } as any);

      const result = await controller.getMutedList(userId, undefined);

      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('mute — error cases', () => {
    it('should propagate BadRequestException when muting self', async () => {
      const { BadRequestException } = require('@nestjs/common');
      service.mute.mockRejectedValue(new BadRequestException('Cannot mute yourself'));

      await expect(controller.mute(userId, userId)).rejects.toThrow(BadRequestException);
    });

    it('should propagate NotFoundException when target not found', async () => {
      const { NotFoundException } = require('@nestjs/common');
      service.mute.mockRejectedValue(new NotFoundException('User not found'));

      await expect(controller.mute(userId, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
