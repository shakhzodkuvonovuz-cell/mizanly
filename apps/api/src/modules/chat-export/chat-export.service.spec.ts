import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ChatExportService } from './chat-export.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ChatExportService', () => {
  let service: ChatExportService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        ChatExportService,
        {
          provide: PrismaService,
          useValue: {
            conversationMember: { findUnique: jest.fn().mockResolvedValue({ userId: 'u1' }) },
            conversation: { findUnique: jest.fn() },
            message: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
          },
        },
      ],
    }).compile();
    service = module.get(ChatExportService);
    prisma = module.get(PrismaService) as any;
  });

  describe('generateExport', () => {
    it('should export as JSON', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', isGroup: false, groupName: null, createdAt: new Date() });
      prisma.message.findMany.mockResolvedValue([
        { id: 'm1', content: 'Hello', messageType: 'TEXT', createdAt: new Date(), sender: { username: 'user1', displayName: 'User 1' } },
      ]);
      const result = await service.generateExport('c1', 'u1', 'json', false) as any;
      expect(result.conversation).toBeDefined();
      expect(result.messages).toHaveLength(1);
      expect(result.exportedBy).toBe('u1');
    });

    it('should export as text', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', isGroup: true, groupName: 'My Group', createdAt: new Date() });
      prisma.message.findMany.mockResolvedValue([
        { id: 'm1', content: 'Hi', messageType: 'TEXT', createdAt: new Date(), sender: { username: 'u1', displayName: 'User 1' } },
      ]);
      const result = await service.generateExport('c1', 'u1', 'text', false) as any;
      expect(result.text).toContain('My Group');
      expect(result.messageCount).toBe(1);
    });

    it('should throw ForbiddenException if not member', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue(null);
      await expect(service.generateExport('c1', 'u1', 'json', false)).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if conversation not found', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(service.generateExport('c1', 'u1', 'json', false)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getConversationStats', () => {
    it('should return conversation statistics', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        groupName: 'Group', isGroup: true, createdAt: new Date(),
        _count: { members: 5 },
      });
      prisma.message.count.mockResolvedValueOnce(100).mockResolvedValueOnce(20);
      const result = await service.getConversationStats('c1', 'u1');
      expect(result.name).toBe('Group');
      expect(result.messageCount).toBe(100);
      expect(result.mediaCount).toBe(20);
      expect(result.memberCount).toBe(5);
    });

    it('should throw ForbiddenException if not member', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue(null);
      await expect(service.getConversationStats('c1', 'u1')).rejects.toThrow(ForbiddenException);
    });

    it('should return "Direct Message" for DMs without groupName', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        groupName: null, isGroup: false, createdAt: new Date(),
        _count: { members: 2 },
      });
      prisma.message.count.mockResolvedValueOnce(50).mockResolvedValueOnce(5);
      const result = await service.getConversationStats('c1', 'u1');
      expect(result.name).toBe('Direct Message');
      expect(result.isGroup).toBe(false);
    });
  });

  describe('generateExport — includeMedia', () => {
    it('should include mediaUrl in JSON export when includeMedia is true', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', isGroup: false, groupName: null, createdAt: new Date() });
      prisma.message.findMany.mockResolvedValue([
        { id: 'm1', content: 'Photo', messageType: 'IMAGE', mediaUrl: 'https://cdn.example.com/pic.jpg', createdAt: new Date(), sender: { username: 'u1', displayName: 'User 1' } },
      ]);
      const result = await service.generateExport('c1', 'u1', 'json', true) as any;
      expect(result.messages[0].mediaUrl).toBe('https://cdn.example.com/pic.jpg');
    });

    it('should include mediaUrl in text export when includeMedia is true', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', isGroup: true, groupName: 'Photos', createdAt: new Date() });
      prisma.message.findMany.mockResolvedValue([
        { id: 'm1', content: 'Check this', messageType: 'IMAGE', mediaUrl: 'https://cdn.example.com/pic.jpg', createdAt: new Date(), sender: { username: 'u1', displayName: 'User 1' } },
      ]);
      const result = await service.generateExport('c1', 'u1', 'text', true) as any;
      expect(result.text).toContain('https://cdn.example.com/pic.jpg');
    });
  });

  describe('generateExport — edge cases', () => {
    it('should handle empty conversation', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', isGroup: false, groupName: null, createdAt: new Date() });
      prisma.message.findMany.mockResolvedValue([]);
      const result = await service.generateExport('c1', 'u1', 'json', false) as any;
      expect(result.messages).toHaveLength(0);
      expect(result.conversation.messageCount).toBe(0);
    });

    it('should use "Direct Message" as name for DMs in text format', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', isGroup: false, groupName: null, createdAt: new Date() });
      prisma.message.findMany.mockResolvedValue([]);
      const result = await service.generateExport('c1', 'u1', 'text', false) as any;
      expect(result.text).toContain('Direct Message');
    });
  });
});
