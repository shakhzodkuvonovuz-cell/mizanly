import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { CirclesController } from './circles.controller';
import { CirclesService } from './circles.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('CirclesController', () => {
  let controller: CirclesController;
  let service: jest.Mocked<CirclesService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CirclesController],
      providers: [
        ...globalMockProviders,
        {
          provide: CirclesService,
          useValue: {
            getMyCircles: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            getMembers: jest.fn(),
            addMembers: jest.fn(),
            removeMembers: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(CirclesController);
    service = module.get(CirclesService) as jest.Mocked<CirclesService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('getMyCircles', () => {
    it('should call circlesService.getMyCircles with userId', async () => {
      const mockCircles = [{ id: 'c-1', name: 'Close Friends', memberCount: 5 }];
      service.getMyCircles.mockResolvedValue(mockCircles as any);

      const result = await controller.getMyCircles(userId);

      expect(service.getMyCircles).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockCircles);
    });
  });

  describe('create', () => {
    it('should call circlesService.create with userId, name, and memberIds', async () => {
      const dto = { name: 'Family', memberIds: ['user-2', 'user-3'] };
      service.create.mockResolvedValue({ id: 'c-1', name: 'Family' } as any);

      const result = await controller.create(userId, dto as any);

      expect(service.create).toHaveBeenCalledWith(userId, 'Family', ['user-2', 'user-3']);
      expect(result).toEqual(expect.objectContaining({ name: 'Family' }));
    });
  });

  describe('update', () => {
    it('should call circlesService.update with id, userId, and name', async () => {
      service.update.mockResolvedValue({ id: 'c-1', name: 'Best Friends' } as any);

      const result = await controller.update('c-1', userId, { name: 'Best Friends' } as any);

      expect(service.update).toHaveBeenCalledWith('c-1', userId, 'Best Friends');
      expect(result).toEqual(expect.objectContaining({ name: 'Best Friends' }));
    });
  });

  describe('delete', () => {
    it('should call circlesService.delete with id and userId', async () => {
      service.delete.mockResolvedValue({ deleted: true } as any);

      const result = await controller.delete('c-1', userId);

      expect(service.delete).toHaveBeenCalledWith('c-1', userId);
      expect(result).toEqual({ deleted: true });
    });

    it('should propagate ForbiddenException for non-owner', async () => {
      service.delete.mockRejectedValue(new ForbiddenException('Only owner can delete'));

      await expect(controller.delete('c-1', 'other-user')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getMembers', () => {
    it('should call circlesService.getMembers with id and userId', async () => {
      const mockMembers = [{ id: 'user-2', username: 'friend1' }];
      service.getMembers.mockResolvedValue(mockMembers as any);

      const result = await controller.getMembers('c-1', userId);

      expect(service.getMembers).toHaveBeenCalledWith('c-1', userId, undefined);
      expect(result).toEqual(mockMembers);
    });
  });

  describe('addMembers', () => {
    it('should call circlesService.addMembers with id, userId, and memberIds', async () => {
      service.addMembers.mockResolvedValue({ added: 2 } as any);

      const result = await controller.addMembers('c-1', userId, { memberIds: ['user-4', 'user-5'] } as any);

      expect(service.addMembers).toHaveBeenCalledWith('c-1', userId, ['user-4', 'user-5']);
      expect(result).toEqual({ added: 2 });
    });
  });

  describe('removeMembers', () => {
    it('should call circlesService.removeMembers with id, userId, and memberIds', async () => {
      service.removeMembers.mockResolvedValue({ removed: 1 } as any);

      const result = await controller.removeMembers('c-1', userId, { memberIds: ['user-4'] } as any);

      expect(service.removeMembers).toHaveBeenCalledWith('c-1', userId, ['user-4']);
      expect(result).toEqual({ removed: 1 });
    });
  });
});
