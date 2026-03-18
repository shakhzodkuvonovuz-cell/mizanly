import { Test, TestingModule } from '@nestjs/testing';
import { WsException } from '@nestjs/websockets';
import { verifyToken } from '@clerk/backend';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../config/prisma.service';
import { MessagesService } from '../modules/messages/messages.service';
import { ChatGateway } from './chat.gateway';
import { globalMockProviders } from '../common/test/mock-providers';

jest.mock('@clerk/backend');

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let messagesService: any;
  let prisma: any;
  let config: any;
  let redis: any;

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
        ...globalMockProviders,
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
        {
          provide: 'REDIS',
          useValue: {
            incr: jest.fn(),
            expire: jest.fn().mockResolvedValue(1),
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue('OK'),
            setex: jest.fn(),
            del: jest.fn().mockResolvedValue(1),
            sadd: jest.fn().mockResolvedValue(1),
            srem: jest.fn().mockResolvedValue(1),
            scard: jest.fn().mockResolvedValue(0),
            smembers: jest.fn().mockResolvedValue([]),
            pipeline: jest.fn().mockReturnValue({
              scard: jest.fn().mockReturnThis(),
              exec: jest.fn().mockResolvedValue([]),
            }),
          },
        },
      ],
    }).compile();

    gateway = module.get<ChatGateway>(ChatGateway);
    messagesService = module.get<MessagesService>(MessagesService);
    prisma = module.get(PrismaService);
    config = module.get(ConfigService);
    redis = module.get('REDIS');
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
      await gateway.handleJoin(client as any, { conversationId: '00000000-0000-0000-0000-000000000000' });

      expect(messagesService.requireMembership).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000000', 'user-123');
      expect(client.join).toHaveBeenCalledWith('conversation:00000000-0000-0000-0000-000000000000');
    });

    it('should throw WsException if not authorized (no userId)', async () => {
      const client = { ...mockSocket, data: {} };
      await expect(
        gateway.handleJoin(client as any, { conversationId: '00000000-0000-0000-0000-000000000000' })
      ).rejects.toThrow(WsException);
    });

    it('should throw WsException if not a member of conversation', async () => {
      const client = { ...mockSocket, data: { userId: 'user-123' } };
      messagesService.requireMembership.mockRejectedValue(new Error());
      await expect(
        gateway.handleJoin(client as any, { conversationId: '00000000-0000-0000-0000-000000000000' })
      ).rejects.toThrow(WsException);
    });
  });

  describe('handleMessage', () => {
    beforeEach(() => {
      // Reset Redis rate limit mocks
      redis.incr.mockClear();
      redis.expire.mockClear();
      // Default mock: rate limit not exceeded
      redis.incr.mockResolvedValue(1);
      redis.expire.mockResolvedValue(1);
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
        conversationId: '00000000-0000-0000-0000-000000000000',
        content: 'Hello',
      });

      expect(messagesService.sendMessage).toHaveBeenCalledWith(
        '00000000-0000-0000-0000-000000000000',
        'user-123',
        { content: 'Hello' }
      );
      expect(gateway.server.to as jest.Mock).toHaveBeenCalledWith('conversation:00000000-0000-0000-0000-000000000000');
      expect(gateway.server.emit).toHaveBeenCalledWith('new_message', mockMessage);
      expect(result).toEqual(mockMessage);
    });

    it('should throw WsException if not authorized', async () => {
      const client = { ...mockSocket, data: {} };
      await expect(
        gateway.handleMessage(client as any, { conversationId: '00000000-0000-0000-0000-000000000000' })
      ).rejects.toThrow(WsException);
    });

    it('should emit error if rate limit exceeded', async () => {
      const client = {
        ...mockSocket,
        data: { userId: 'user-123' },
        emit: jest.fn(),
      };
      // Exceed rate limit
      redis.incr.mockResolvedValue(31);
      await gateway.handleMessage(client as any, { conversationId: '00000000-0000-0000-0000-000000000000', content: 'test' });

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
        conversationId: '00000000-0000-0000-0000-000000000000',
        isTyping: true,
      });

      expect(client.to).toHaveBeenCalledWith('conversation:00000000-0000-0000-0000-000000000000');
      expect(client.emit).toHaveBeenCalledWith('user_typing', {
        userId: 'user-123',
        isTyping: true,
      });
    });

    it('should throw WsException if not authorized', async () => {
      const client = { ...mockSocket, data: {} };
      await expect(
        gateway.handleTyping(client as any, { conversationId: '00000000-0000-0000-0000-000000000000', isTyping: true })
      ).rejects.toThrow(WsException);
    });
  });

  describe('handleRead', () => {
    it('should mark messages as read and emit read event', async () => {
      const client = { ...mockSocket, data: { userId: 'user-123' } };

      await gateway.handleRead(client as any, { conversationId: '00000000-0000-0000-0000-000000000000' });

      expect(messagesService.markRead).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000000', 'user-123');
      expect(gateway.server.to as jest.Mock).toHaveBeenCalledWith('conversation:00000000-0000-0000-0000-000000000000');
      expect(gateway.server.emit).toHaveBeenCalledWith('messages_read', { userId: 'user-123' });
    });

    it('should throw WsException if not authorized', async () => {
      const client = { ...mockSocket, data: {} };
      await expect(
        gateway.handleRead(client as any, { conversationId: '00000000-0000-0000-0000-000000000000' })
      ).rejects.toThrow(WsException);
    });
  });

  describe('online presence', () => {
    it('tracks user on connection via Redis presence', async () => {
      const client = {
        ...mockSocket,
        id: 'socket-123',
        data: {},
        handshake: {
          ...mockSocket.handshake,
          auth: { token: 'fake-token' },
        },
      };
      const user = { id: 'user-123', username: 'test' };
      prisma.user.findUnique.mockResolvedValue(user);
      (verifyToken as jest.Mock).mockResolvedValue({ sub: 'clerk-123' });

      await gateway.handleConnection(client as any);

      expect((client.data as any).userId).toBe('user-123');
      expect(redis.sadd).toHaveBeenCalledWith('presence:user-123', 'socket-123');
      expect(redis.expire).toHaveBeenCalledWith('presence:user-123', expect.any(Number));
      expect(gateway.server.emit).toHaveBeenCalledWith('user_online', { userId: 'user-123', isOnline: true });
    });

    it('removes user on disconnect and emits user_offline when last socket', async () => {
      const client = { ...mockSocket, id: 'socket-123', data: { userId: 'user-123' } };
      redis.srem.mockResolvedValue(1);
      redis.scard.mockResolvedValue(0); // No remaining sockets → fully offline
      redis.del.mockResolvedValue(1);
      prisma.user.update = jest.fn().mockResolvedValue(undefined);

      await gateway.handleDisconnect(client as any);

      expect(redis.srem).toHaveBeenCalledWith('presence:user-123', 'socket-123');
      expect(redis.scard).toHaveBeenCalledWith('presence:user-123');
      expect(redis.del).toHaveBeenCalledWith('presence:user-123');
      expect(gateway.server.emit).toHaveBeenCalledWith('user_offline', expect.objectContaining({
        userId: 'user-123',
        isOnline: false,
        lastSeenAt: expect.any(String),
      }));
    });

    it('responds to get_online_status via Redis pipeline', async () => {
      const client = { ...mockSocket, emit: jest.fn(), data: { userId: 'user-123' } };
      // Pipeline returns: [error, result] pairs — scard returns count
      const mockPipeline = {
        scard: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 1], // user-123 online
          [null, 1], // user-456 online
          [null, 0], // user-789 offline
        ]),
      };
      redis.pipeline.mockReturnValue(mockPipeline);

      await gateway.handleGetOnlineStatus(client as any, { userIds: ['user-123', 'user-456', 'user-789'] });

      expect(client.emit).toHaveBeenCalledWith('online_status', [
        { userId: 'user-123', isOnline: true },
        { userId: 'user-456', isOnline: true },
        { userId: 'user-789', isOnline: false },
      ]);
    });
  });
});