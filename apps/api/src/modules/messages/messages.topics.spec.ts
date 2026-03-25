import { Test } from '@nestjs/testing';
import { MessagesService } from './messages.service';
import { PrismaService } from '../../config/prisma.service';
import { mockRedis, mockConfigService } from '../../common/test/mock-providers';
import { PushTriggerService } from '../notifications/push-trigger.service';
import { AiService } from '../ai/ai.service';

const mockPrisma = {
  provide: PrismaService,
  useValue: {
    conversation: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn() },
    conversationMember: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), updateMany: jest.fn(), count: jest.fn().mockResolvedValue(1) },
    message: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    block: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn().mockImplementation((fn: any) => typeof fn === 'function' ? fn(mockPrisma.useValue) : Promise.all(fn.map((f: any) => f))),
    $executeRaw: jest.fn(),
  },
};

const mockPush = { provide: PushTriggerService, useValue: { triggerPush: jest.fn() } };
const mockAi = { provide: AiService, useValue: { moderateText: jest.fn().mockResolvedValue({ safe: true }), moderateImage: jest.fn().mockResolvedValue({ safe: true }) } };

describe('MessagesService — Group Topics & Message Expiry', () => {
  let service: MessagesService;
  let prisma: any;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [MessagesService, mockPrisma, mockRedis, mockConfigService, mockPush, mockAi],
    }).compile();

    service = module.get(MessagesService);
    prisma = module.get(PrismaService);
  });

  describe('createGroupTopic', () => {
    it('should create a topic in a group', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', isGroup: true, createdById: 'u1' });
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1', role: 'ADMIN' });
      prisma.message.create.mockResolvedValue({
        id: 'm1', content: 'General', metadata: { type: 'topic', iconEmoji: null },
        createdAt: new Date(), sender: { id: 'u1', username: 'admin', displayName: 'Admin' },
      });

      const result = await service.createGroupTopic('c1', 'u1', 'General');
      expect(result.topic.content).toBe('General');
    });

    it('should throw for non-group', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', isGroup: false });
      await expect(service.createGroupTopic('c1', 'u1', 'T')).rejects.toThrow('Group not found');
    });

    it('should throw for non-member', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', isGroup: true, createdById: 'other' });
      prisma.conversationMember.findUnique.mockResolvedValue(null);
      await expect(service.createGroupTopic('c1', 'u1', 'T')).rejects.toThrow('Not a member');
    });

    it('should throw for non-admin', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', isGroup: true, createdById: 'other' });
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1', role: 'MEMBER' });
      await expect(service.createGroupTopic('c1', 'u1', 'T')).rejects.toThrow('Only admins');
    });
  });

  describe('getGroupTopics', () => {
    it('should return topic messages only', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1' });
      prisma.message.findMany.mockResolvedValue([
        { id: 't1', content: 'General', metadata: { type: 'topic' }, createdAt: new Date(), sender: { id: 'u1', username: 'a', displayName: 'A' }, _count: { replies: 5 } },
        { id: 's1', content: 'System', metadata: { type: 'join' }, createdAt: new Date(), sender: null, _count: { replies: 0 } },
      ]);

      const result = await service.getGroupTopics('c1', 'u1');
      expect(result.data.length).toBe(1);
    });
  });

  describe('setMessageExpiry', () => {
    it('should set 7-day expiry', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', isGroup: true, createdById: 'u1' });
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1', role: 'ADMIN' });
      prisma.conversation.update.mockResolvedValue({});

      const result = await service.setMessageExpiry('c1', 'u1', 7);
      expect(result.expiryDays).toBe(7);
    });

    it('should disable with 0', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', isGroup: false });
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1' });
      prisma.conversation.update.mockResolvedValue({});

      const result = await service.setMessageExpiry('c1', 'u1', 0);
      expect(result.message).toContain('disabled');
    });

    it('should reject invalid values', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', isGroup: false });
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1' });
      await expect(service.setMessageExpiry('c1', 'u1', 15)).rejects.toThrow('Invalid');
    });
  });
});
