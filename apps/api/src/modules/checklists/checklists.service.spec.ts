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
              update: jest.fn().mockResolvedValue({}),
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
});
