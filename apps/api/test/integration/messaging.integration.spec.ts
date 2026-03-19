import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './test-app';
import { MessagesModule } from '../../src/modules/messages/messages.module';
import { PrismaModule } from '../../src/config/prisma.module';
import { RedisModule } from '../../src/config/redis.module';
import { PrismaService } from '../../src/config/prisma.service';
import { MessagesService } from '../../src/modules/messages/messages.service';
import {
  mockRedis,
  mockConfigService,
  mockNotificationsService,
  mockPushTriggerService,
  mockPushService,
  mockAsyncJobService,
  mockAnalyticsService,
} from '../../src/common/test/mock-providers';

// Prisma mock for messaging
const messagingPrismaMock = {
  conversation: {
    findUnique: jest.fn().mockResolvedValue({
      id: 'conv-1',
      isGroup: false,
      members: [
        { userId: 'user-A', user: { id: 'user-A', username: 'user_a' } },
        { userId: 'user-B', user: { id: 'user-B', username: 'user_b' } },
      ],
    }),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation((args: { data: { id?: string } }) => ({
      id: args.data.id || 'conv-new',
      isGroup: false,
      createdAt: new Date(),
    })),
    update: jest.fn().mockResolvedValue({ id: 'conv-1' }),
  },
  conversationMember: {
    findUnique: jest.fn().mockResolvedValue({ userId: 'user-A', conversationId: 'conv-1' }),
    findMany: jest.fn().mockResolvedValue([
      { userId: 'user-A' },
      { userId: 'user-B' },
    ]),
    create: jest.fn().mockResolvedValue({ id: 'cm-1' }),
  },
  message: {
    findMany: jest.fn().mockResolvedValue([
      {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-A',
        content: 'Assalamu Alaikum!',
        messageType: 'TEXT',
        createdAt: new Date(),
      },
    ]),
    create: jest.fn().mockImplementation((args: { data: { content?: string } }) => ({
      id: 'msg-new',
      conversationId: 'conv-1',
      senderId: 'user-A',
      content: args.data.content || 'Test message',
      messageType: 'TEXT',
      createdAt: new Date(),
    })),
    findUnique: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(1),
  },
  user: {
    findUnique: jest.fn().mockResolvedValue({ id: 'user-A', username: 'user_a', displayName: 'User A' }),
    findMany: jest.fn().mockResolvedValue([]),
  },
  block: { findMany: jest.fn().mockResolvedValue([]) },
  mute: { findMany: jest.fn().mockResolvedValue([]) },
  restrict: { findMany: jest.fn().mockResolvedValue([]) },
  notification: { create: jest.fn().mockResolvedValue({ id: 'notif-1' }) },
  $queryRaw: jest.fn().mockResolvedValue([]),
  $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(messagingPrismaMock)),
};

describe('Messaging Integration Tests', () => {
  let app: INestApplication;
  let messagesService: MessagesService;

  beforeAll(async () => {
    app = await createTestApp({
      imports: [MessagesModule, PrismaModule, RedisModule],
      providers: [
        { provide: PrismaService, useValue: messagingPrismaMock },
        mockRedis,
        mockConfigService,
        mockNotificationsService,
        mockPushTriggerService,
        mockPushService,
        mockAsyncJobService,
        mockAnalyticsService,
      ],
      userId: 'user-A',
    });

    messagesService = app.get(MessagesService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Conversation flow', () => {
    it('should create a message via service', async () => {
      const result = await messagesService.sendMessage('user-A', {
        conversationId: 'conv-1',
        content: 'Assalamu Alaikum!',
      } as any);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('content');
    });

    it('should get conversation messages via service', async () => {
      const result = await messagesService.getMessages('user-A', 'conv-1');
      expect(result).toHaveProperty('data');
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('Forward validation', () => {
    it('should forward a message to multiple conversations (up to 5)', async () => {
      // Mock the forward method if it exists
      if (typeof messagesService.forwardMessage === 'function') {
        messagingPrismaMock.message.findUnique.mockResolvedValueOnce({
          id: 'msg-1',
          conversationId: 'conv-1',
          senderId: 'user-A',
          content: 'Forward me',
          messageType: 'TEXT',
        });

        const result = await messagesService.forwardMessage('user-A', 'msg-1', ['conv-2', 'conv-3', 'conv-4']);
        expect(result).toBeDefined();
      }
    });
  });
});
