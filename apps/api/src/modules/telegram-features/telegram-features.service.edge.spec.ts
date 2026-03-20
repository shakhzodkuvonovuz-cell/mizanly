import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { TelegramFeaturesService } from './telegram-features.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('TelegramFeaturesService — edge cases', () => {
  let service: TelegramFeaturesService;
  let prisma: any;
  const userId = 'user-edge-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        TelegramFeaturesService,
        {
          provide: PrismaService,
          useValue: {
            savedMessage: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(), update: jest.fn() },
            chatFolder: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), delete: jest.fn(), count: jest.fn().mockResolvedValue(0) },
            groupTopic: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), delete: jest.fn(), count: jest.fn().mockResolvedValue(0) },
            customEmojiPack: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            customEmoji: { create: jest.fn(), count: jest.fn().mockResolvedValue(0) },
            conversation: { findUnique: jest.fn(), update: jest.fn() },
            conversationMember: { findUnique: jest.fn().mockResolvedValue({ userId, role: 'ADMIN' }) },
            adminLog: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
          },
        },
      ],
    }).compile();

    service = module.get<TelegramFeaturesService>(TelegramFeaturesService);
    prisma = module.get(PrismaService);
  });

  it('should accept Arabic saved message content', async () => {
    prisma.savedMessage.create.mockResolvedValue({ id: 'sm-1', userId, content: 'رسالة محفوظة' });
    const result = await service.saveMessage(userId, { content: 'رسالة محفوظة' } as any);
    expect(result).toBeDefined();
  });

  it('should accept Arabic folder name', async () => {
    prisma.chatFolder.create.mockResolvedValue({ id: 'f-1', userId, name: 'مجلد خاص', position: 0 });
    const result = await service.createChatFolder(userId, { name: 'مجلد خاص' } as any);
    expect(result).toBeDefined();
  });

  it('should throw BadRequestException for empty folder name', async () => {
    await expect(service.createChatFolder(userId, { name: '' } as any))
      .rejects.toThrow(BadRequestException);
  });

  it('should return empty saved messages list', async () => {
    const result = await service.getSavedMessages(userId);
    expect(result.data).toEqual([]);
  });

  it('should throw NotFoundException for deleting non-existent saved message', async () => {
    prisma.savedMessage.findFirst.mockResolvedValue(null);
    await expect(service.deleteSavedMessage(userId, 'nonexistent'))
      .rejects.toThrow(NotFoundException);
  });

  it('should return empty chat folders for user with none', async () => {
    const result = await service.getChatFolders(userId);
    expect(result).toEqual([]);
  });
});
