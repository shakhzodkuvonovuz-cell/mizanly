import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { WsException } from '@nestjs/websockets';
import { verifyToken } from '@clerk/backend';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../config/prisma.service';
import { MessagesService } from '../modules/messages/messages.service';
import { ChatGateway } from './chat.gateway';
import { globalMockProviders } from '../common/test/mock-providers';

jest.mock('@clerk/backend');

// Mock class-validator: ts-jest does not emit decorator metadata correctly,
// so we manually validate UUID fields and numeric bounds.
jest.mock('class-validator', () => {
  const actual = jest.requireActual('class-validator');
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const UUID_FIELDS = new Set(['conversationId', 'sessionId', 'targetUserId', 'callerId', 'messageId']);
  return {
    ...actual,
    validate: jest.fn().mockImplementation((dto: any) => {
      const errors: any[] = [];
      for (const [key, val] of Object.entries(dto)) {
        if (UUID_FIELDS.has(key) && typeof val === 'string' && !UUID_RE.test(val)) {
          errors.push({ property: key, constraints: { isUuid: `${key} must be a UUID` } });
        }
        // roomId allows alphanumeric but reject special chars
        if (key === 'roomId' && typeof val === 'string' && /[^a-zA-Z0-9_-]/.test(val)) {
          errors.push({ property: key, constraints: { matches: `${key} contains invalid characters` } });
        }
        if (key === 'surahNumber' && typeof val === 'number' && (val < 1 || val > 114)) {
          errors.push({ property: key, constraints: { max: 'surahNumber must not be greater than 114' } });
        }
        if (key === 'verseNumber' && typeof val === 'number' && (val < 1 || val > 286)) {
          errors.push({ property: key, constraints: { max: 'verseNumber must not be greater than 286' } });
        }
      }
      return Promise.resolve(errors);
    }),
  };
});

const UUID1 = '00000000-0000-0000-0000-000000000001';
const UUID2 = '00000000-0000-0000-0000-000000000002';
const UUID3 = '00000000-0000-0000-0000-000000000003';

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let messagesService: any;
  let prisma: any;
  let config: any;
  let redis: any;

  const mockSocket = {
    join: jest.fn(),
    leave: jest.fn(),
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
              update: jest.fn().mockResolvedValue(undefined),
            },
            conversationMember: {
              findMany: jest.fn().mockResolvedValue([]),
              findUnique: jest.fn(),
            },
            block: {
              findFirst: jest.fn().mockResolvedValue(null),
            },
            message: {
              findUnique: jest.fn().mockResolvedValue(null),
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            userSettings: {
              findUnique: jest.fn().mockResolvedValue(null),
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
            incr: jest.fn().mockResolvedValue(1),
            expire: jest.fn().mockResolvedValue(1),
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue('OK'),
            setex: jest.fn(),
            del: jest.fn().mockResolvedValue(1),
            sadd: jest.fn().mockResolvedValue(1),
            srem: jest.fn().mockResolvedValue(1),
            scard: jest.fn().mockResolvedValue(0),
            smembers: jest.fn().mockResolvedValue([]),
            exists: jest.fn().mockResolvedValue(0),
            hmset: jest.fn().mockResolvedValue('OK'),
            hgetall: jest.fn().mockResolvedValue({}),
            hset: jest.fn().mockResolvedValue(1),
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
      await gateway.handleJoin(client as any, { conversationId: UUID1 });

      expect(messagesService.requireMembership).toHaveBeenCalledWith(UUID1, 'user-123');
      expect(client.join).toHaveBeenCalledWith(`conversation:${UUID1}`);
    });

    it('should throw WsException if not authorized (no userId)', async () => {
      const client = { ...mockSocket, data: {} };
      await expect(
        gateway.handleJoin(client as any, { conversationId: UUID1 })
      ).rejects.toThrow(WsException);
    });

    it('should throw WsException if not a member of conversation', async () => {
      const client = { ...mockSocket, data: { userId: 'user-123' } };
      messagesService.requireMembership.mockRejectedValue(new Error());
      await expect(
        gateway.handleJoin(client as any, { conversationId: UUID1 })
      ).rejects.toThrow(WsException);
    });

    it('should emit error for invalid conversationId', async () => {
      const client = { ...mockSocket, data: { userId: 'user-123' }, emit: jest.fn() };
      await gateway.handleJoin(client as any, { conversationId: 'not-a-uuid' });
      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Invalid join_conversation data' });
    });
  });

  describe('handleLeave', () => {
    it('should leave conversation room', async () => {
      const client = { ...mockSocket, data: { userId: 'user-123' }, leave: jest.fn() };
      await gateway.handleLeave(client as any, { conversationId: UUID1 });
      expect(client.leave).toHaveBeenCalledWith(`conversation:${UUID1}`);
    });

    it('should throw WsException if not authorized', async () => {
      const client = { ...mockSocket, data: {} };
      await expect(
        gateway.handleLeave(client as any, { conversationId: UUID1 })
      ).rejects.toThrow(WsException);
    });

    it('should emit error for invalid conversationId', async () => {
      const client = { ...mockSocket, data: { userId: 'user-123' }, emit: jest.fn() };
      await gateway.handleLeave(client as any, { conversationId: 'bad' });
      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Invalid leave_conversation data' });
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

    it('should send message and emit to conversation room using dto.conversationId', async () => {
      const client = {
        ...mockSocket,
        data: { userId: 'user-123' },
        emit: jest.fn(),
      };
      const mockMessage = { id: 'msg-789', content: 'Hello' };
      messagesService.sendMessage.mockResolvedValue(mockMessage);

      const result = await gateway.handleMessage(client as any, {
        conversationId: UUID1,
        content: 'Hello',
      });

      expect(messagesService.sendMessage).toHaveBeenCalledWith(
        UUID1,
        'user-123',
        { content: 'Hello' }
      );
      expect(gateway.server.to as jest.Mock).toHaveBeenCalledWith(`conversation:${UUID1}`);
      expect(gateway.server.emit).toHaveBeenCalledWith('new_message', mockMessage);
      expect(result).toEqual(mockMessage);
    });

    it('should throw WsException if not authorized', async () => {
      const client = { ...mockSocket, data: {} };
      await expect(
        gateway.handleMessage(client as any, { conversationId: UUID1 })
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
      await gateway.handleMessage(client as any, { conversationId: UUID1, content: 'test' });

      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Rate limit exceeded' });
      expect(messagesService.sendMessage).not.toHaveBeenCalled();
    });

    it('should throw WsException when sendMessage fails (not a member)', async () => {
      const client = {
        ...mockSocket,
        data: { userId: 'user-123' },
        emit: jest.fn(),
      };
      messagesService.sendMessage.mockRejectedValue(new Error('Not a member'));

      await expect(
        gateway.handleMessage(client as any, { conversationId: UUID1, content: 'test' })
      ).rejects.toThrow(WsException);
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
        conversationId: UUID1,
        isTyping: true,
      });

      expect(client.to).toHaveBeenCalledWith(`conversation:${UUID1}`);
      expect(client.emit).toHaveBeenCalledWith('user_typing', {
        userId: 'user-123',
        isTyping: true,
      });
    });

    it('should throw WsException if not authorized', async () => {
      const client = { ...mockSocket, data: {} };
      await expect(
        gateway.handleTyping(client as any, { conversationId: UUID1, isTyping: true })
      ).rejects.toThrow(WsException);
    });

    it('should throw WsException when not a member of conversation', async () => {
      const client = {
        ...mockSocket,
        data: { userId: 'user-123' },
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      };
      messagesService.requireMembership.mockRejectedValue(new Error('Not a member'));

      await expect(
        gateway.handleTyping(client as any, { conversationId: UUID1, isTyping: true })
      ).rejects.toThrow(WsException);
    });
  });

  describe('handleRead', () => {
    it('should mark messages as read and emit read event', async () => {
      const client = { ...mockSocket, data: { userId: 'user-123' } };

      await gateway.handleRead(client as any, { conversationId: UUID1 });

      expect(messagesService.markRead).toHaveBeenCalledWith(UUID1, 'user-123');
      expect(gateway.server.to as jest.Mock).toHaveBeenCalledWith(`conversation:${UUID1}`);
      expect(gateway.server.emit).toHaveBeenCalledWith('messages_read', { userId: 'user-123' });
    });

    it('should throw WsException if not authorized', async () => {
      const client = { ...mockSocket, data: {} };
      await expect(
        gateway.handleRead(client as any, { conversationId: UUID1 })
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
      const user = { id: 'user-123', username: 'test', isBanned: false, isDeactivated: false, isDeleted: false };
      prisma.user.findUnique.mockResolvedValue(user);
      (verifyToken as jest.Mock).mockResolvedValue({ sub: 'clerk-123' });

      await gateway.handleConnection(client as any);

      expect((client.data as any).userId).toBe('user-123');
      expect(redis.sadd).toHaveBeenCalledWith('presence:user-123', 'socket-123');
      expect(redis.expire).toHaveBeenCalledWith('presence:user-123', expect.any(Number));
      // user_online is now broadcast to conversation rooms, not globally
      expect(prisma.conversationMember.findMany).toHaveBeenCalled();
    });

    it('initializes quranRooms array on connection', async () => {
      const client = {
        ...mockSocket,
        id: 'socket-123',
        data: {} as any,
        handshake: { ...mockSocket.handshake, auth: { token: 'fake-token' } },
      };
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'test', isBanned: false, isDeactivated: false, isDeleted: false });
      (verifyToken as jest.Mock).mockResolvedValue({ sub: 'clerk-1' });

      await gateway.handleConnection(client as any);

      expect(client.data.quranRooms).toEqual([]);
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
      // user_offline is now broadcast to conversation rooms, not globally
      expect(prisma.conversationMember.findMany).toHaveBeenCalled();
    });

    it('responds to get_online_status via Redis pipeline', async () => {
      const client = { ...mockSocket, emit: jest.fn(), data: { userId: 'user-123' } };
      const mockPipeline = {
        scard: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 1],
          [null, 1],
          [null, 0],
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

    it('does not emit offline when other sockets remain', async () => {
      const client = { ...mockSocket, id: 'socket-1', data: { userId: 'user-123' } };
      redis.srem.mockResolvedValue(1);
      redis.scard.mockResolvedValue(2); // Other sockets still connected

      await gateway.handleDisconnect(client as any);

      expect(redis.srem).toHaveBeenCalledWith('presence:user-123', 'socket-1');
      expect(redis.del).not.toHaveBeenCalled();
      expect(gateway.server.emit).not.toHaveBeenCalledWith('user_offline', expect.anything());
    });

    it('caps get_online_status at 50 user IDs', async () => {
      const client = { ...mockSocket, emit: jest.fn(), data: { userId: 'user-1' } };
      const manyIds = Array.from({ length: 150 }, (_, i) => `user-${i}`);
      const mockPipeline = {
        scard: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(Array(50).fill([null, 0])),
      };
      redis.pipeline.mockReturnValue(mockPipeline);

      await gateway.handleGetOnlineStatus(client as any, { userIds: manyIds });
      expect(client.emit).toHaveBeenCalledWith('online_status', expect.any(Array));
      const emitted = client.emit.mock.calls[0][1];
      expect(emitted).toHaveLength(50);
    });
  });

  describe('handleConnection — error cases', () => {
    it('should disconnect if no token provided', async () => {
      const client = {
        ...mockSocket,
        data: {},
        handshake: { auth: {}, headers: {} },
        disconnect: jest.fn(),
      };
      await gateway.handleConnection(client as any);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should disconnect if token verification fails', async () => {
      const client = {
        ...mockSocket,
        data: {},
        handshake: { auth: { token: 'bad-token' }, headers: {} },
        disconnect: jest.fn(),
      };
      (verifyToken as jest.Mock).mockRejectedValue(new Error('Invalid token'));
      await gateway.handleConnection(client as any);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should disconnect if user not found in DB', async () => {
      const client = {
        ...mockSocket,
        data: {},
        handshake: { auth: { token: 'valid-token' }, headers: {} },
        disconnect: jest.fn(),
      };
      (verifyToken as jest.Mock).mockResolvedValue({ sub: 'clerk-unknown' });
      prisma.user.findUnique.mockResolvedValue(null);
      await gateway.handleConnection(client as any);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should disconnect banned users', async () => {
      const client = {
        ...mockSocket,
        data: {},
        handshake: { auth: { token: 'valid-token' }, headers: {} },
        disconnect: jest.fn(),
      };
      (verifyToken as jest.Mock).mockResolvedValue({ sub: 'clerk-banned' });
      prisma.user.findUnique.mockResolvedValue({ id: 'u-banned', username: 'banned', isBanned: true, isDeactivated: false, isDeleted: false });
      await gateway.handleConnection(client as any);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should extract Bearer token from authorization header', async () => {
      const client = {
        ...mockSocket,
        id: 'socket-header',
        data: {},
        handshake: { auth: {}, headers: { authorization: 'Bearer header-token' } },
        join: jest.fn(),
      };
      (verifyToken as jest.Mock).mockResolvedValue({ sub: 'clerk-1' });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'test' });

      await gateway.handleConnection(client as any);
      expect(verifyToken).toHaveBeenCalledWith('header-token', expect.anything());
      expect(client.data.userId).toBe('user-1');
    });

    it('should rate limit connections per IP', async () => {
      const client = {
        ...mockSocket,
        id: 'socket-flood',
        data: {},
        handshake: { auth: { token: 'token' }, headers: {}, address: '1.2.3.4' },
        disconnect: jest.fn(),
      };
      redis.incr.mockResolvedValue(11); // exceeds 10/min limit
      await gateway.handleConnection(client as any);
      expect(client.disconnect).toHaveBeenCalled();
    });
  });

  describe('handleDisconnect — no userId', () => {
    it('should return early when no userId on socket', async () => {
      const client = { ...mockSocket, id: 'socket-anon', data: {} };
      await gateway.handleDisconnect(client as any);
      expect(redis.srem).not.toHaveBeenCalled();
    });
  });

  describe('handleDisconnect — Quran room cleanup', () => {
    it('should clean up Quran room memberships on disconnect', async () => {
      const client = { ...mockSocket, id: 'socket-q1', data: { userId: 'user-q1', quranRooms: ['room-abc'] } };
      redis.srem.mockResolvedValue(1);
      redis.scard.mockResolvedValue(2); // Other participants remain
      redis.hgetall.mockResolvedValue({ hostId: 'user-q1', currentSurah: '2', currentVerse: '5', reciterId: 'r1' });

      await gateway.handleDisconnect(client as any);

      expect(redis.srem).toHaveBeenCalledWith('quran:room:room-abc:participants', 'socket-q1');
      expect(gateway.server.to).toHaveBeenCalledWith('quran:room-abc');
    });

    it('should delete empty Quran room on last participant disconnect', async () => {
      const client = { ...mockSocket, id: 'socket-q2', data: { userId: 'user-q2', quranRooms: ['room-xyz'] } };
      // First scard call (Quran room) returns 0 (empty), second (presence) returns 0
      redis.srem.mockResolvedValue(1);
      redis.scard.mockResolvedValueOnce(0).mockResolvedValue(0);
      redis.del.mockResolvedValue(1);
      prisma.user.update = jest.fn().mockResolvedValue(undefined);

      await gateway.handleDisconnect(client as any);

      expect(redis.del).toHaveBeenCalledWith('quran:room:room-xyz', 'quran:room:room-xyz:participants');
    });
  });

  describe('handleCallInitiate', () => {
    it('should throw WsException when unauthorized', async () => {
      const client = { ...mockSocket, data: {} };
      await expect(
        gateway.handleCallInitiate(client as any, { targetUserId: 't1', callType: 'AUDIO', sessionId: 's1' }),
      ).rejects.toThrow(WsException);
    });

    it('should emit error for invalid data', async () => {
      const client = { ...mockSocket, data: { userId: 'caller-1' }, emit: jest.fn() };
      await gateway.handleCallInitiate(client as any, {
        targetUserId: 'not-a-uuid', callType: 'INVALID', sessionId: 'not-a-uuid',
      });
      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Invalid call_initiate data' });
    });

    it('should emit error when target user is blocked', async () => {
      const client = { ...mockSocket, data: { userId: 'caller-1' }, emit: jest.fn() };
      prisma.block.findFirst.mockResolvedValue({ id: 'block-1' });

      await gateway.handleCallInitiate(client as any, {
        targetUserId: UUID1, callType: 'AUDIO', sessionId: UUID2,
      });

      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Cannot call this user' });
    });

    it('should forward incoming_call to target user sockets', async () => {
      const client = { ...mockSocket, data: { userId: 'caller-1' }, emit: jest.fn() };
      prisma.block.findFirst.mockResolvedValue(null);
      redis.smembers.mockResolvedValue(['target-socket-1']);

      await gateway.handleCallInitiate(client as any, {
        targetUserId: UUID1, callType: 'VIDEO', sessionId: UUID2,
      });

      expect(gateway.server.to).toHaveBeenCalledWith('target-socket-1');
      expect(gateway.server.emit).toHaveBeenCalledWith('incoming_call', {
        sessionId: UUID2, callType: 'VIDEO', callerId: 'caller-1',
      });
    });
  });

  describe('handleCallAnswer', () => {
    it('should throw WsException when unauthorized', async () => {
      const client = { ...mockSocket, data: {} };
      await expect(
        gateway.handleCallAnswer(client as any, { sessionId: 's1', callerId: 'c1' }),
      ).rejects.toThrow(WsException);
    });

    it('should emit error for invalid data', async () => {
      const client = { ...mockSocket, data: { userId: 'u1' }, emit: jest.fn() };
      await gateway.handleCallAnswer(client as any, { sessionId: 'bad', callerId: 'bad' });
      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Invalid call_answer data' });
    });

    it('should block call answer when users are blocked', async () => {
      const client = { ...mockSocket, data: { userId: 'u1' }, emit: jest.fn() };
      prisma.block.findFirst.mockResolvedValue({ id: 'block-1' });

      await gateway.handleCallAnswer(client as any, { sessionId: UUID1, callerId: UUID2 });

      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Cannot interact with this user' });
    });

    it('should forward call_answered event to caller sockets', async () => {
      const client = { ...mockSocket, data: { userId: 'answerer-1' }, emit: jest.fn() };
      prisma.block.findFirst.mockResolvedValue(null);
      redis.smembers.mockResolvedValue(['caller-socket-1']);

      await gateway.handleCallAnswer(client as any, { sessionId: UUID1, callerId: UUID2 });

      expect(gateway.server.to).toHaveBeenCalledWith('caller-socket-1');
      expect(gateway.server.emit).toHaveBeenCalledWith('call_answered', {
        sessionId: UUID1, answeredBy: 'answerer-1',
      });
    });
  });

  describe('handleCallReject', () => {
    it('should throw WsException when unauthorized', async () => {
      const client = { ...mockSocket, data: {} };
      await expect(
        gateway.handleCallReject(client as any, { sessionId: 's1', callerId: 'c1' }),
      ).rejects.toThrow(WsException);
    });

    it('should emit error for invalid data', async () => {
      const client = { ...mockSocket, data: { userId: 'u1' }, emit: jest.fn() };
      await gateway.handleCallReject(client as any, { sessionId: 'bad', callerId: 'bad' });
      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Invalid call_reject data' });
    });

    it('should block call reject when users are blocked', async () => {
      const client = { ...mockSocket, data: { userId: 'u1' }, emit: jest.fn() };
      prisma.block.findFirst.mockResolvedValue({ id: 'block-1' });

      await gateway.handleCallReject(client as any, { sessionId: UUID1, callerId: UUID2 });

      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Cannot interact with this user' });
    });

    it('should forward call_rejected event to caller sockets', async () => {
      const client = { ...mockSocket, data: { userId: 'rejecter-1' }, emit: jest.fn() };
      prisma.block.findFirst.mockResolvedValue(null);
      redis.smembers.mockResolvedValue(['caller-socket-1']);

      await gateway.handleCallReject(client as any, { sessionId: UUID1, callerId: UUID2 });

      expect(gateway.server.to).toHaveBeenCalledWith('caller-socket-1');
      expect(gateway.server.emit).toHaveBeenCalledWith('call_rejected', {
        sessionId: UUID1, rejectedBy: 'rejecter-1',
      });
    });
  });

  describe('handleCallEnd', () => {
    it('should throw WsException when unauthorized', async () => {
      const client = { ...mockSocket, data: {} };
      await expect(
        gateway.handleCallEnd(client as any, { sessionId: 's1', participants: ['p1'] }),
      ).rejects.toThrow(WsException);
    });

    it('should emit error for invalid data', async () => {
      const client = { ...mockSocket, data: { userId: 'u1' }, emit: jest.fn() };
      await gateway.handleCallEnd(client as any, { sessionId: 'bad', participants: [] as any });
      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Invalid call_end data' });
    });

    it('should forward call_ended to all participant sockets', async () => {
      const client = { ...mockSocket, data: { userId: 'ender-1' }, emit: jest.fn() };
      redis.smembers.mockResolvedValueOnce(['p1-socket']).mockResolvedValueOnce(['p2-socket']);

      await gateway.handleCallEnd(client as any, {
        sessionId: UUID1,
        participants: [UUID2, UUID3],
      });

      expect(gateway.server.to).toHaveBeenCalledWith('p1-socket');
      expect(gateway.server.to).toHaveBeenCalledWith('p2-socket');
    });
  });

  describe('handleCallSignal', () => {
    it('should throw WsException when unauthorized', async () => {
      const client = { ...mockSocket, data: {} };
      await expect(
        gateway.handleCallSignal(client as any, { targetUserId: UUID1, signal: {} }),
      ).rejects.toThrow(WsException);
    });

    it('should forward signal to target user sockets', async () => {
      const client = { ...mockSocket, data: { userId: 'signaler-1' }, emit: jest.fn() };
      prisma.block.findFirst.mockResolvedValue(null);
      redis.smembers.mockResolvedValue(['target-socket-1']);

      await gateway.handleCallSignal(client as any, {
        targetUserId: UUID1,
        signal: { type: 'offer', sdp: 'v=0...' },
      });

      expect(gateway.server.to).toHaveBeenCalledWith('target-socket-1');
      expect(gateway.server.emit).toHaveBeenCalledWith('call_signal', {
        fromUserId: 'signaler-1',
        signal: { type: 'offer', sdp: 'v=0...' },
      });
    });

    it('should reject signal payloads larger than 64KB', async () => {
      const client = { ...mockSocket, data: { userId: 'signaler-1' }, emit: jest.fn() };
      const largeSignal = 'x'.repeat(70000);

      await gateway.handleCallSignal(client as any, {
        targetUserId: UUID1,
        signal: largeSignal,
      });

      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Signal payload too large (max 64KB)' });
    });

    it('should block signal when users are blocked', async () => {
      const client = { ...mockSocket, data: { userId: 'signaler-1' }, emit: jest.fn() };
      prisma.block.findFirst.mockResolvedValue({ id: 'block-1' });

      await gateway.handleCallSignal(client as any, {
        targetUserId: UUID1,
        signal: { type: 'offer' },
      });

      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Cannot signal this user' });
    });

    it('should not emit when target has no connected sockets', async () => {
      const client = { ...mockSocket, data: { userId: 'signaler-1' }, emit: jest.fn() };
      prisma.block.findFirst.mockResolvedValue(null);
      redis.smembers.mockResolvedValue([]);

      await gateway.handleCallSignal(client as any, {
        targetUserId: UUID1,
        signal: { type: 'offer' },
      });

      expect(gateway.server.to).not.toHaveBeenCalled();
    });
  });

  describe('handleMessageDelivered', () => {
    it('should throw WsException when unauthorized', async () => {
      const client = { ...mockSocket, data: {} };
      await expect(
        gateway.handleMessageDelivered(client as any, { messageId: UUID1, conversationId: UUID2 }),
      ).rejects.toThrow(WsException);
    });

    it('should emit error for invalid messageId (not UUID)', async () => {
      const client = { ...mockSocket, data: { userId: 'user-1' }, emit: jest.fn() };
      await gateway.handleMessageDelivered(client as any, { messageId: 'bad', conversationId: UUID1 });
      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Invalid message_delivered data' });
    });

    it('should emit error for invalid conversationId (not UUID)', async () => {
      const client = { ...mockSocket, data: { userId: 'user-1' }, emit: jest.fn() };
      await gateway.handleMessageDelivered(client as any, { messageId: UUID1, conversationId: 'bad' });
      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Invalid message_delivered data' });
    });

    it('should throw WsException when not a member', async () => {
      const client = { ...mockSocket, data: { userId: 'user-1' }, emit: jest.fn() };
      messagesService.requireMembership.mockRejectedValue(new Error('Forbidden'));

      await expect(
        gateway.handleMessageDelivered(client as any, { messageId: UUID1, conversationId: UUID2 })
      ).rejects.toThrow(WsException);
    });

    it('should update delivery and emit receipt to message sender only', async () => {
      const client = { ...mockSocket, data: { userId: 'user-1' }, emit: jest.fn() };
      messagesService.requireMembership.mockResolvedValue({});
      prisma.message.updateMany.mockReturnValue({
        catch: jest.fn().mockReturnThis(),
      });
      prisma.message.findUnique.mockResolvedValue({ senderId: 'sender-1' });
      redis.smembers.mockResolvedValue(['sender-socket-1']);

      await gateway.handleMessageDelivered(client as any, {
        messageId: UUID1,
        conversationId: UUID2,
      });

      expect(prisma.message.updateMany).toHaveBeenCalled();
      expect(prisma.message.findUnique).toHaveBeenCalledWith({
        where: { id: UUID1 },
        select: { senderId: true },
      });
      expect(gateway.server.to).toHaveBeenCalledWith('sender-socket-1');
      expect(gateway.server.emit).toHaveBeenCalledWith('delivery_receipt', expect.objectContaining({
        messageId: UUID1,
        deliveredTo: 'user-1',
      }));
    });
  });

  describe('handleJoinQuranRoom', () => {
    it('should throw WsException when unauthorized', async () => {
      const client = { ...mockSocket, data: {} };
      await expect(
        gateway.handleJoinQuranRoom({ roomId: 'room-1' }, client as any),
      ).rejects.toThrow(WsException);
    });

    it('should emit error for invalid roomId (special chars)', async () => {
      const client = { ...mockSocket, data: { userId: 'u1' }, emit: jest.fn() };
      await gateway.handleJoinQuranRoom({ roomId: '../malicious:key' }, client as any);
      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Invalid join_quran_room data' });
    });

    it('should create room in Redis if first joiner', async () => {
      const client = {
        ...mockSocket,
        id: 'socket-qr1',
        data: { userId: 'host-1', quranRooms: [] } as any,
        join: jest.fn(),
      };
      redis.exists.mockResolvedValue(0);
      redis.scard.mockResolvedValue(1);
      redis.hgetall.mockResolvedValue({ hostId: 'host-1', currentSurah: '1', currentVerse: '1', reciterId: '' });

      await gateway.handleJoinQuranRoom({ roomId: 'room-1' }, client as any);

      expect(redis.hmset).toHaveBeenCalledWith('quran:room:room-1', {
        hostId: 'host-1', currentSurah: '1', currentVerse: '1', reciterId: '',
      });
      expect(redis.sadd).toHaveBeenCalledWith('quran:room:room-1:participants', 'socket-qr1');
      expect(client.join).toHaveBeenCalledWith('quran:room-1');
      expect(client.data.quranRooms).toContain('room-1');
    });

    it('should not create room if it already exists', async () => {
      const client = {
        ...mockSocket,
        id: 'socket-qr2',
        data: { userId: 'joiner-1', quranRooms: [] } as any,
        join: jest.fn(),
      };
      redis.exists.mockResolvedValue(1); // Room exists
      redis.scard.mockResolvedValue(2);
      redis.hgetall.mockResolvedValue({ hostId: 'host-1', currentSurah: '1', currentVerse: '1', reciterId: '' });

      await gateway.handleJoinQuranRoom({ roomId: 'room-1' }, client as any);

      expect(redis.hmset).not.toHaveBeenCalled();
      expect(redis.sadd).toHaveBeenCalledWith('quran:room:room-1:participants', 'socket-qr2');
    });

    it('should broadcast quran_room_update to all participants', async () => {
      const client = {
        ...mockSocket,
        id: 'socket-qr3',
        data: { userId: 'joiner-2', quranRooms: [] } as any,
        join: jest.fn(),
      };
      redis.exists.mockResolvedValue(1);
      redis.scard.mockResolvedValue(3);
      redis.hgetall.mockResolvedValue({ hostId: 'host-1', currentSurah: '2', currentVerse: '10', reciterId: 'r1' });

      await gateway.handleJoinQuranRoom({ roomId: 'room-1' }, client as any);

      expect(gateway.server.to).toHaveBeenCalledWith('quran:room-1');
      expect(gateway.server.emit).toHaveBeenCalledWith('quran_room_update', {
        roomId: 'room-1',
        hostId: 'host-1',
        currentSurah: 2,
        currentVerse: 10,
        reciterId: 'r1',
        participantCount: 3,
      });
    });
  });

  describe('handleLeaveQuranRoom', () => {
    it('should throw WsException when unauthorized', async () => {
      const client = { ...mockSocket, data: {} };
      await expect(
        gateway.handleLeaveQuranRoom({ roomId: 'room-1' }, client as any),
      ).rejects.toThrow(WsException);
    });

    it('should remove participant and leave socket room', async () => {
      const client = {
        ...mockSocket,
        id: 'socket-ql1',
        data: { userId: 'leaver-1', quranRooms: ['room-1'] } as any,
        leave: jest.fn(),
      };
      redis.scard.mockResolvedValue(2);
      redis.hgetall.mockResolvedValue({ hostId: 'host-1', currentSurah: '1', currentVerse: '1', reciterId: '' });

      await gateway.handleLeaveQuranRoom({ roomId: 'room-1' }, client as any);

      expect(redis.srem).toHaveBeenCalledWith('quran:room:room-1:participants', 'socket-ql1');
      expect(client.leave).toHaveBeenCalledWith('quran:room-1');
      expect(client.data.quranRooms).not.toContain('room-1');
    });

    it('should delete room when last participant leaves', async () => {
      const client = {
        ...mockSocket,
        id: 'socket-ql2',
        data: { userId: 'last-one', quranRooms: ['room-1'] } as any,
        leave: jest.fn(),
      };
      redis.scard.mockResolvedValue(0);

      await gateway.handleLeaveQuranRoom({ roomId: 'room-1' }, client as any);

      expect(redis.del).toHaveBeenCalledWith('quran:room:room-1', 'quran:room:room-1:participants');
    });
  });

  describe('handleQuranVerseSync', () => {
    it('should throw WsException when unauthorized', async () => {
      const client = { ...mockSocket, data: {} };
      await expect(
        gateway.handleQuranVerseSync({ roomId: 'room-1', surahNumber: 1, verseNumber: 1 }, client as any),
      ).rejects.toThrow(WsException);
    });

    it('should only allow host to sync verse', async () => {
      const client = { ...mockSocket, data: { userId: 'non-host' }, emit: jest.fn() };
      redis.hgetall.mockResolvedValue({ hostId: 'actual-host', currentSurah: '1', currentVerse: '1', reciterId: '' });

      await gateway.handleQuranVerseSync({ roomId: 'room-1', surahNumber: 2, verseNumber: 5 }, client as any);

      // Should return silently (host check fails)
      expect(redis.hmset).not.toHaveBeenCalled();
    });

    it('should sync verse and broadcast when host', async () => {
      const client = { ...mockSocket, data: { userId: 'host-1' }, emit: jest.fn() };
      redis.hgetall.mockResolvedValue({ hostId: 'host-1', currentSurah: '1', currentVerse: '1', reciterId: '' });

      await gateway.handleQuranVerseSync({ roomId: 'room-1', surahNumber: 2, verseNumber: 255 }, client as any);

      expect(redis.hmset).toHaveBeenCalledWith('quran:room:room-1', {
        currentSurah: '2',
        currentVerse: '255',
      });
      expect(gateway.server.to).toHaveBeenCalledWith('quran:room-1');
      expect(gateway.server.emit).toHaveBeenCalledWith('quran_verse_changed', {
        surahNumber: 2,
        verseNumber: 255,
      });
    });

    it('should emit error for surahNumber > 114', async () => {
      const client = { ...mockSocket, data: { userId: 'host-1' }, emit: jest.fn() };
      await gateway.handleQuranVerseSync({ roomId: 'room-1', surahNumber: 115, verseNumber: 1 }, client as any);
      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Invalid quran_verse_sync data' });
    });

    it('should emit error for verseNumber > 286', async () => {
      const client = { ...mockSocket, data: { userId: 'host-1' }, emit: jest.fn() };
      await gateway.handleQuranVerseSync({ roomId: 'room-1', surahNumber: 1, verseNumber: 287 }, client as any);
      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Invalid quran_verse_sync data' });
    });
  });

  describe('handleQuranReciterChange', () => {
    it('should throw WsException when unauthorized', async () => {
      const client = { ...mockSocket, data: {} };
      await expect(
        gateway.handleQuranReciterChange({ roomId: 'room-1', reciterId: 'r1' }, client as any),
      ).rejects.toThrow(WsException);
    });

    it('should only allow host to change reciter', async () => {
      const client = { ...mockSocket, data: { userId: 'non-host' }, emit: jest.fn() };
      redis.hgetall.mockResolvedValue({ hostId: 'actual-host', currentSurah: '1', currentVerse: '1', reciterId: '' });

      await gateway.handleQuranReciterChange({ roomId: 'room-1', reciterId: 'new-reciter' }, client as any);

      expect(redis.hset).not.toHaveBeenCalled();
    });

    it('should change reciter and broadcast when host', async () => {
      const client = { ...mockSocket, data: { userId: 'host-1' }, emit: jest.fn() };
      redis.hgetall.mockResolvedValue({ hostId: 'host-1', currentSurah: '1', currentVerse: '1', reciterId: '' });

      await gateway.handleQuranReciterChange({ roomId: 'room-1', reciterId: 'reciter-2' }, client as any);

      expect(redis.hset).toHaveBeenCalledWith('quran:room:room-1', 'reciterId', 'reciter-2');
      expect(gateway.server.to).toHaveBeenCalledWith('quran:room-1');
      expect(gateway.server.emit).toHaveBeenCalledWith('quran_reciter_updated', {
        reciterId: 'reciter-2',
      });
    });

    it('should reject roomId with special characters', async () => {
      const client = { ...mockSocket, data: { userId: 'host-1' }, emit: jest.fn() };
      await gateway.handleQuranReciterChange({ roomId: 'room:malicious', reciterId: 'r1' }, client as any);
      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Invalid quran_reciter_change data' });
    });
  });
});
