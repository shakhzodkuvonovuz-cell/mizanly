import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { DraftsService } from './drafts.service';

describe('DraftsService — edge cases', () => {
  let service: DraftsService;
  let prisma: any;
  const userId = 'user-edge-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DraftsService,
        {
          provide: PrismaService,
          useValue: {
            draftPost: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              deleteMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<DraftsService>(DraftsService);
    prisma = module.get(PrismaService);
  });

  it('should save draft with Arabic content', async () => {
    prisma.draftPost.create.mockResolvedValue({ id: 'draft-1', userId, data: { content: 'محتوى عربي' } });
    const result = await service.saveDraft(userId, 'SAF', { content: 'محتوى عربي' });
    expect(result).toBeDefined();
  });

  it('should throw NotFoundException for loading non-existent draft', async () => {
    prisma.draftPost.findUnique.mockResolvedValue(null);
    await expect(service.getDraft('nonexistent', userId))
      .rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when deleting non-existent draft', async () => {
    prisma.draftPost.findUnique.mockResolvedValue(null);
    await expect(service.deleteDraft('nonexistent', userId))
      .rejects.toThrow(NotFoundException);
  });
});
