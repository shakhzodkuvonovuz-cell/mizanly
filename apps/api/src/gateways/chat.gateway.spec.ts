import { Test, TestingModule } from '@nestjs/testing';
import { WsException } from '@nestjs/websockets';
import { verifyToken } from '@clerk/backend';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../config/prisma.service';
import { MessagesService } from '../modules/messages/messages.service';
import { ChatGateway } from './chat.gateway';

jest.mock('@clerk/backend');

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let messagesService: any;
  let prisma: any;
  let config: any;

  const mockSocket = {
    join: jest.fn(),
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    handshake: {
      auth: {},
      headers: {},
    },
    data: {},
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatGateway,
        {
          provide: MessagesService,
          useValue: {
            requireMembership: jest.fn(),
            sendMessage: jest.fn(),
            markRead: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('fake-secret-key'),
          },
        },
      ],
    }).compile();

    gateway = module.get<ChatGateway>(ChatGateway);
    messagesService = module.get<MessagesService>(MessagesService);
    prisma = module.get(PrismaService);
    config = module.get(ConfigService);
    // Attach server mock
    gateway.server = { to: jest.fn(), emit: jest.fn() } as any;
    (gateway.server.to as jest.Mock).mockReturnValue(gateway.server);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
    expect(gateway.server).toBeDefined();
  });

  describe('handleJoin', () => {
    it('should join conversation room if user is a member', async () => {
      const client = { ...mockSocket, data: { userId: 'user-123' } };
      await gateway.handleJoin(client as any, { conversationId: 'conv-456' });

      expect(messagesService.requireMembership).toHaveBeenCalledWith('conv-456', 'user-123');
      expect(client.join).toHaveBeenCalledWith('conversation:conv-456');
    });

    it('should throw WsException if not authorized (no userId)', async () => {
      const client = { ...mockSocket, data: {} };
      await expect(
        gateway.handleJoin(client as any, { conversationId: 'conv-456' })
      ).rejects.toThrow(WsException);
    });

    it('should throw WsException if not a member of conversation', async () => {
      const client = { ...mockSocket, data: { userId: 'user-123' } };
      messagesService.requireMembership.mockRejectedValue(new Error());
      await expect(
        gateway.handleJoin(client as any, { conversationId: 'conv-456' })
      ).rejects.toThrow(WsException);
    });
  });

  describe('handleMessage', () => {
    beforeEach(() => {
      // Reset rate limit map
      (gateway as any).messageCounts.clear();
    });

    it('should send message and emit to conversation room', async () => {
      const client = {
        ...mockSocket,
        data: { userId: 'user-123' },
        emit: jest.fn(),
      };
      const mockMessage = { id: 'msg-789', content: 'Hello' };
      messagesService.sendMessage.mockResolvedValue(mockMessage);

      const result = await gateway.handleMessage(client as any, {
        conversationId: 'conv-456',
        content: 'Hello',
      });

      expect(messagesService.sendMessage).toHaveBeenCalledWith(
        'conv-456',
        'user-123',
        { content: 'Hello' }
      );
      expect(gateway.server.to as jest.Mock).toHaveBeenCalledWith('conversation:conv-456');
      expect(gateway.server.emit).toHaveBeenCalledWith('new_message', mockMessage);
      expect(result).toEqual(mockMessage);
    });

    it('should throw WsException if not authorized', async () => {
      const client = { ...mockSocket, data: {} };
      await expect(
        gateway.handleMessage(client as any, { conversationId: 'conv-456' })
      ).rejects.toThrow(WsException);
    });

    it('should emit error if rate limit exceeded', async () => {
      const client = {
        ...mockSocket,
        data: { userId: 'user-123' },
        emit: jest.fn(),
      };
      // Exceed rate limit
      (gateway as any).messageCounts.set('user-123', 30);
      await gateway.handleMessage(client as any, { conversationId: 'conv-456' });

      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Rate limit exceeded' });
      expect(messagesService.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('handleTyping', () => {
    it('should emit typing event to conversation room', async () => {
      const client = {
        ...mockSocket,
        data: { userId: 'user-123' },
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      };
      await gateway.handleTyping(client as any, {
        conversationId: 'conv-456',
        isTyping: true,
      });

      expect(client.to).toHaveBeenCalledWith('conversation:conv-456');
      expect(client.emit).toHaveBeenCalledWith('user_typing', {
        userId: 'user-123',
        isTyping: true,
      });
    });

    it('should throw WsException if not authorized', () => {
      const client = { ...mockSocket, data: {} };
      expect(() =>
        gateway.handleTyping(client as any, { conversationId: 'conv-456', isTyping: true })
      ).toThrow(WsException);
    });
  });

  describe('handleRead', () => {
    it('should mark messages as read and emit read event', async () => {
      const client = { ...mockSocket, data: { userId: 'user-123' } };

      await gateway.handleRead(client as any, { conversationId: 'conv-456' });

      expect(messagesService.markRead).toHaveBeenCalledWith('conv-456', 'user-123');
      expect(gateway.server.to as jest.Mock).toHaveBeenCalledWith('conversation:conv-456');
      expect(gateway.server.emit).toHaveBeenCalledWith('messages_read', { userId: 'user-123' });
    });

    it('should throw WsException if not authorized', async () => {
      const client = { ...mockSocket, data: {} };
      await expect(
        gateway.handleRead(client as any, { conversationId: 'conv-456' })
      ).rejects.toThrow(WsException);
    });
  });
});