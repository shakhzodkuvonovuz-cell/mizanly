import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChecklistsController } from './checklists.controller';
import { ChecklistsService } from './checklists.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ChecklistsController', () => {
  let controller: ChecklistsController;
  let service: jest.Mocked<ChecklistsService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChecklistsController],
      providers: [
        ...globalMockProviders,
        {
          provide: ChecklistsService,
          useValue: {
            create: jest.fn(),
            getByConversation: jest.fn(),
            addItem: jest.fn(),
            toggleItem: jest.fn(),
            deleteItem: jest.fn(),
            deleteChecklist: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(ChecklistsController);
    service = module.get(ChecklistsService) as jest.Mocked<ChecklistsService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('should call checklistsService.create with userId, conversationId, and title', async () => {
      const mockChecklist = { id: 'cl-1', title: 'Shopping', items: [] };
      service.create.mockResolvedValue(mockChecklist as any);

      const result = await controller.create(userId, { conversationId: 'conv-1', title: 'Shopping' } as any);

      expect(service.create).toHaveBeenCalledWith(userId, 'conv-1', 'Shopping');
      expect(result).toEqual(expect.objectContaining({ title: 'Shopping' }));
    });
  });

  describe('getByConversation', () => {
    it('should call checklistsService.getByConversation with conversationId', async () => {
      const mockLists = [{ id: 'cl-1', title: 'List 1' }];
      service.getByConversation.mockResolvedValue(mockLists as any);

      const result = await controller.getByConversation('conv-1');

      expect(service.getByConversation).toHaveBeenCalledWith('conv-1');
      expect(result).toEqual(mockLists);
    });
  });

  describe('addItem', () => {
    it('should call checklistsService.addItem with userId, checklistId, and text', async () => {
      const mockItem = { id: 'item-1', text: 'Buy milk', completed: false };
      service.addItem.mockResolvedValue(mockItem as any);

      const result = await controller.addItem(userId, 'cl-1', { text: 'Buy milk' } as any);

      expect(service.addItem).toHaveBeenCalledWith(userId, 'cl-1', 'Buy milk');
      expect(result).toEqual(expect.objectContaining({ text: 'Buy milk' }));
    });
  });

  describe('toggleItem', () => {
    it('should call checklistsService.toggleItem with userId and itemId', async () => {
      service.toggleItem.mockResolvedValue({ id: 'item-1', completed: true } as any);

      const result = await controller.toggleItem(userId, 'item-1');

      expect(service.toggleItem).toHaveBeenCalledWith(userId, 'item-1');
      expect(result).toEqual(expect.objectContaining({ completed: true }));
    });
  });

  describe('deleteItem', () => {
    it('should call checklistsService.deleteItem with userId and itemId', async () => {
      service.deleteItem.mockResolvedValue({ deleted: true } as any);

      const result = await controller.deleteItem(userId, 'item-1');

      expect(service.deleteItem).toHaveBeenCalledWith(userId, 'item-1');
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('deleteChecklist', () => {
    it('should call checklistsService.deleteChecklist with userId and checklistId', async () => {
      service.deleteChecklist.mockResolvedValue({ deleted: true } as any);

      const result = await controller.deleteChecklist(userId, 'cl-1');

      expect(service.deleteChecklist).toHaveBeenCalledWith(userId, 'cl-1');
      expect(result).toEqual({ deleted: true });
    });

    it('should propagate ForbiddenException for non-creator', async () => {
      service.deleteChecklist.mockRejectedValue(new ForbiddenException('Only creator can delete'));

      await expect(controller.deleteChecklist('other-user', 'cl-1')).rejects.toThrow(ForbiddenException);
    });
  });
});
