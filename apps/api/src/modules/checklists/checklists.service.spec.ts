import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ChecklistsService } from './checklists.service';
import { PrismaService } from '../../config/prisma.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ChecklistsService', () => {
  let service: ChecklistsService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        ChecklistsService,
        {
          provide: PrismaService,
          useValue: {
            messageChecklist: {
              create: jest.fn().mockResolvedValue({ id: 'cl-1', title: 'Test', conversationId: 'conv-1', createdById: 'u1' }),
              findMany: jest.fn().mockResolvedValue([]),
              findUnique: jest.fn().mockResolvedValue({ id: 'cl-1', createdById: 'u1' }),
              delete: jest.fn().mockResolvedValue({}),
            },
            messageChecklistItem: {
              create: jest.fn().mockResolvedValue({ id: 'item-1', text: 'Task 1' }),
              findUnique: jest.fn().mockResolvedValue({ id: 'item-1', isCompleted: false, checklistId: 'cl-1' }),
              update: jest.fn().mockResolvedValue({}),
              delete: jest.fn().mockResolvedValue({}),
            },
          },
        },
      ],
    }).compile();

    service = module.get(ChecklistsService);
    prisma = module.get(PrismaService) as any;
  });

  it('should create a checklist', async () => {
    const result = await service.create('u1', 'conv-1', 'Test');
    expect(result.title).toBe('Test');
    expect(prisma.messageChecklist.create).toHaveBeenCalled();
  });

  it('should reject empty title', async () => {
    await expect(service.create('u1', 'conv-1', '  ')).rejects.toThrow(BadRequestException);
  });

  it('should get checklists by conversation', async () => {
    const result = await service.getByConversation('conv-1');
    expect(Array.isArray(result)).toBe(true);
  });

  it('should add item to checklist', async () => {
    const result = await service.addItem('u1', 'cl-1', 'Task 1');
    expect(result.text).toBe('Task 1');
  });

  it('should throw NotFoundException for missing checklist when adding item', async () => {
    prisma.messageChecklist.findUnique.mockResolvedValueOnce(null);
    await expect(service.addItem('u1', 'invalid', 'Task')).rejects.toThrow(NotFoundException);
  });

  describe('toggleItem', () => {
    it('should toggle item completion status', async () => {
      prisma.messageChecklistItem.findUnique.mockResolvedValue({ id: 'item-1', isCompleted: false });
      prisma.messageChecklistItem.update.mockResolvedValue({ id: 'item-1', isCompleted: true, completedBy: 'u1' });
      const result = await service.toggleItem('u1', 'item-1');
      expect(result.isCompleted).toBe(true);
    });

    it('should throw NotFoundException for missing item', async () => {
      prisma.messageChecklistItem.findUnique.mockResolvedValue(null);
      await expect(service.toggleItem('u1', 'invalid')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteItem', () => {
    it('should delete checklist item', async () => {
      prisma.messageChecklistItem.findUnique.mockResolvedValue({ id: 'item-1', checklist: { id: 'cl-1' } });
      prisma.messageChecklistItem.delete.mockResolvedValue({});
      const result = await service.deleteItem('u1', 'item-1');
      expect(result).toEqual({ deleted: true });
    });

    it('should throw NotFoundException for missing item', async () => {
      prisma.messageChecklistItem.findUnique.mockResolvedValue(null);
      await expect(service.deleteItem('u1', 'invalid')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteChecklist', () => {
    it('should delete checklist for creator', async () => {
      prisma.messageChecklist.findUnique.mockResolvedValue({ id: 'cl-1', createdById: 'u1' });
      prisma.messageChecklist.delete.mockResolvedValue({});
      const result = await service.deleteChecklist('u1', 'cl-1');
      expect(result).toEqual({ deleted: true });
    });

    it('should throw ForbiddenException for non-creator', async () => {
      prisma.messageChecklist.findUnique.mockResolvedValue({ id: 'cl-1', createdById: 'other' });
      await expect(service.deleteChecklist('u1', 'cl-1')).rejects.toThrow();
    });

    it('should throw NotFoundException for missing checklist', async () => {
      prisma.messageChecklist.findUnique.mockResolvedValue(null);
      await expect(service.deleteChecklist('u1', 'invalid')).rejects.toThrow(NotFoundException);
    });
  });
});
