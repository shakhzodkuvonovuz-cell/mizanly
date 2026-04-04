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
            audioRoom: {
              update: jest.fn().mockResolvedValue(undefined),
            },
            post: {
              findUnique: jest.fn().mockResolvedValue(null),
            },
            reel: {
              findUnique: jest.fn().mockResolvedValue(null),
            },
            thread: {
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
            eval: jest.fn().mockResolvedValue([]), // X07-#8: Lua script returns evicted socket IDs (empty = no eviction)
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
              srem: jest.fn().mockReturnThis(),
              sadd: jest.fn().mockReturnThis(),
              expire: jest.fn().mockReturnThis(),
              hmset: jest.fn().mockReturnThis(),
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
    gateway.server = { to: jest.fn(), emit: jest.fn(), in: jest.fn() } as any;
    (gateway.server.to as jest.Mock).mockReturnValue(gateway.server);
    (gateway.server.in as jest.Mock).mockReturnValue({ fetchSockets: jest.fn().mockResolvedValue([]) });
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
        to: jest.fn().mockReturnValue({ emit: jest.fn() }),
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
        expect.objectContaining({ content: 'Hello' }),
      );
      expect(client.to).toHaveBeenCalledWith(`conversation:${UUID1}`);
      expect(client.to(`conversation:${UUID1}`).emit).toHaveBeenCalledWith('new_message', mockMessage);
      expect(result).toEqual(expect.objectContaining({ success: true, messageId: 'msg-789' }));
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
      // Exceed rate limit — J07-H6: now uses redis.eval (Lua) instead of redis.incr
      redis.eval.mockResolvedValue(31);
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
      // X07-#8: Presence now managed via atomic Lua script (eval) instead of pipeline
      expect(redis.eval).toHaveBeenCalled();
      // Presence is now broadcast via user's own room (O(1) emit, not O(N) per-conversation)
      expect(gateway.server.to).toHaveBeenCalledWith('user:user-123');
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
      // Presence is now broadcast via user's own room (O(1) emit, not O(N) per-conversation)
      expect(gateway.server.to).toHaveBeenCalledWith('user:user-123');
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

    it('should delete empty Quran room on last participant disconnect and mark DB ended (F42)', async () => {
      const client = { ...mockSocket, id: 'socket-q2', data: { userId: 'user-q2', quranRooms: ['room-xyz'] } };
      // First scard call (Quran room) returns 0 (empty), second (presence) returns 0
      redis.srem.mockResolvedValue(1);
      redis.scard.mockResolvedValueOnce(0).mockResolvedValue(0);
      redis.del.mockResolvedValue(1);
      prisma.user.update = jest.fn().mockResolvedValue(undefined);

      await gateway.handleDisconnect(client as any);

      expect(redis.del).toHaveBeenCalledWith('quran:room:room-xyz', 'quran:room:room-xyz:participants');
      expect(prisma.audioRoom.update).toHaveBeenCalledWith({
        where: { id: 'room-xyz' },
        data: { status: 'ended', endedAt: expect.any(Date) },
      });
    });

    it('should transfer host when host disconnects from Quran room (F41)', async () => {
      const client = { ...mockSocket, id: 'socket-host', data: { userId: 'host-user', quranRooms: ['room-host'] } };
      redis.srem.mockResolvedValue(1);
      // First scard (quran room remaining) = 2, second scard (presence) = 0
      redis.scard.mockResolvedValueOnce(2).mockResolvedValue(0);
      redis.hgetall.mockResolvedValue({ hostId: 'host-user', currentSurah: '1', currentVerse: '1', reciterId: '' });
      prisma.user.update = jest.fn().mockResolvedValue(undefined);

      // Mock fetchSockets to return a remaining participant
      (gateway.server.in as jest.Mock).mockReturnValue({
        fetchSockets: jest.fn().mockResolvedValue([
          { id: 'socket-p2', data: { userId: 'participant-2' } },
        ]),
      });

      await gateway.handleDisconnect(client as any);

      // Verify host was updated in Redis
      expect(redis.hset).toHaveBeenCalledWith('quran:room:room-host', 'hostId', 'participant-2');
      // Verify host was updated in DB
      expect(prisma.audioRoom.update).toHaveBeenCalledWith({
        where: { id: 'room-host' },
        data: { hostId: 'participant-2' },
      });
      // Verify host_changed event was emitted
      expect(gateway.server.to).toHaveBeenCalledWith('quran:room-host');
      expect(gateway.server.emit).toHaveBeenCalledWith('host_changed', {
        roomId: 'room-host',
        newHostId: 'participant-2',
      });
    });

    it('should NOT transfer host when non-host disconnects from Quran room', async () => {
      const client = { ...mockSocket, id: 'socket-p1', data: { userId: 'participant-1', quranRooms: ['room-nh'] } };
      redis.srem.mockResolvedValue(1);
      redis.scard.mockResolvedValueOnce(2).mockResolvedValue(0);
      redis.hgetall.mockResolvedValue({ hostId: 'real-host', currentSurah: '1', currentVerse: '1', reciterId: '' });
      prisma.user.update = jest.fn().mockResolvedValue(undefined);

      await gateway.handleDisconnect(client as any);

      // Host should not be changed
      expect(redis.hset).not.toHaveBeenCalledWith('quran:room:room-nh', 'hostId', expect.any(String));
      // host_changed should not be emitted
      expect(gateway.server.emit).not.toHaveBeenCalledWith('host_changed', expect.anything());
    });

    it('should handle DB failure gracefully during room cleanup (F42)', async () => {
      const client = { ...mockSocket, id: 'socket-q3', data: { userId: 'user-q3', quranRooms: ['room-fail'] } };
      redis.srem.mockResolvedValue(1);
      redis.scard.mockResolvedValueOnce(0).mockResolvedValue(0);
      redis.del.mockResolvedValue(1);
      prisma.user.update = jest.fn().mockResolvedValue(undefined);
      prisma.audioRoom.update.mockRejectedValueOnce(new Error('DB unavailable'));

      // Should not throw — error is caught
      await expect(gateway.handleDisconnect(client as any)).resolves.not.toThrow();
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

      // hmset + expire are now pipelined (J07-L4)
      const pipelineCalls = redis.pipeline.mock.results.map((r: { value: Record<string, jest.Mock> }) => r.value);
      const roomPipe = pipelineCalls.find((p: Record<string, jest.Mock>) => p.hmset?.mock?.calls?.length > 0);
      expect(roomPipe).toBeDefined();
      expect(roomPipe.hmset).toHaveBeenCalledWith('quran:room:room-1', {
        hostId: 'host-1', currentSurah: '1', currentVerse: '1', reciterId: '',
      });
      // sadd + expire for participants are also pipelined
      expect(redis.pipeline).toHaveBeenCalled();
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
      // sadd is now pipelined — verify pipeline was used for participant add
      expect(redis.pipeline).toHaveBeenCalled();
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

    it('should delete room and mark DB ended when last participant leaves (F42)', async () => {
      const client = {
        ...mockSocket,
        id: 'socket-ql2',
        data: { userId: 'last-one', quranRooms: ['room-1'] } as any,
        leave: jest.fn(),
      };
      redis.scard.mockResolvedValue(0);

      await gateway.handleLeaveQuranRoom({ roomId: 'room-1' }, client as any);

      expect(redis.del).toHaveBeenCalledWith('quran:room:room-1', 'quran:room:room-1:participants');
      expect(prisma.audioRoom.update).toHaveBeenCalledWith({
        where: { id: 'room-1' },
        data: { status: 'ended', endedAt: expect.any(Date) },
      });
    });

    it('should transfer host when host leaves Quran room (F41)', async () => {
      const client = {
        ...mockSocket,
        id: 'socket-host-leave',
        data: { userId: 'leaving-host', quranRooms: ['room-1'] } as any,
        leave: jest.fn(),
      };
      redis.scard.mockResolvedValue(3); // 3 remaining
      redis.hgetall.mockResolvedValue({ hostId: 'leaving-host', currentSurah: '5', currentVerse: '10', reciterId: 'r2' });

      // Mock fetchSockets to return remaining participants
      (gateway.server.in as jest.Mock).mockReturnValue({
        fetchSockets: jest.fn().mockResolvedValue([
          { id: 'socket-p1', data: { userId: 'next-host' } },
          { id: 'socket-p2', data: { userId: 'other-user' } },
        ]),
      });

      await gateway.handleLeaveQuranRoom({ roomId: 'room-1' }, client as any);

      // Verify host transfer in Redis
      expect(redis.hset).toHaveBeenCalledWith('quran:room:room-1', 'hostId', 'next-host');
      // Verify host transfer in DB
      expect(prisma.audioRoom.update).toHaveBeenCalledWith({
        where: { id: 'room-1' },
        data: { hostId: 'next-host' },
      });
      // Verify host_changed event
      expect(gateway.server.emit).toHaveBeenCalledWith('host_changed', {
        roomId: 'room-1',
        newHostId: 'next-host',
      });
      // Verify quran_room_update uses new host
      expect(gateway.server.emit).toHaveBeenCalledWith('quran_room_update', {
        roomId: 'room-1',
        hostId: 'next-host',
        currentSurah: 5,
        currentVerse: 10,
        reciterId: 'r2',
        participantCount: 3,
      });
    });

    it('should NOT transfer host when non-host leaves', async () => {
      const client = {
        ...mockSocket,
        id: 'socket-nonhost',
        data: { userId: 'regular-user', quranRooms: ['room-1'] } as any,
        leave: jest.fn(),
      };
      redis.scard.mockResolvedValue(2);
      redis.hgetall.mockResolvedValue({ hostId: 'actual-host', currentSurah: '1', currentVerse: '1', reciterId: '' });

      await gateway.handleLeaveQuranRoom({ roomId: 'room-1' }, client as any);

      // No host transfer should happen
      expect(redis.hset).not.toHaveBeenCalledWith('quran:room:room-1', 'hostId', expect.any(String));
      expect(gateway.server.emit).not.toHaveBeenCalledWith('host_changed', expect.anything());
      // But quran_room_update should still be broadcast
      expect(gateway.server.emit).toHaveBeenCalledWith('quran_room_update', expect.objectContaining({
        roomId: 'room-1',
        hostId: 'actual-host',
      }));
    });

    it('should handle DB failure gracefully during empty room cleanup (F42)', async () => {
      const client = {
        ...mockSocket,
        id: 'socket-ql3',
        data: { userId: 'last-user', quranRooms: ['room-1'] } as any,
        leave: jest.fn(),
      };
      redis.scard.mockResolvedValue(0);
      prisma.audioRoom.update.mockRejectedValueOnce(new Error('DB error'));

      // Should not throw
      await expect(
        gateway.handleLeaveQuranRoom({ roomId: 'room-1' }, client as any),
      ).resolves.not.toThrow();
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

  // ══════════════════════════════════════════════════════════════════════════════
  // Sealed Sender — the most security-critical handler, was completely untested
  // ══════════════════════════════════════════════════════════════════════════════

  describe('handleSealedMessage', () => {
    const sealedPayload = {
      recipientId: 'user-recipient',
      ephemeralKey: 'base64ephemeral',
      sealedCiphertext: 'base64ciphertext',
      conversationId: UUID1,
      encryptedContent: 'base64content',
      e2eVersion: 1,
      e2eSenderDeviceId: 1,
      clientMessageId: 'client-msg-1',
    };

    it('should throw WsException when unauthorized', async () => {
      const client = { ...mockSocket, data: {} };
      await expect(
        gateway.handleSealedMessage(client as any, sealedPayload),
      ).rejects.toThrow(WsException);
    });

    it('should emit error when recipientId missing', async () => {
      const client = { ...mockSocket, data: { userId: 'sender-1' }, emit: jest.fn() };
      await gateway.handleSealedMessage(client as any, {
        ...sealedPayload,
        recipientId: '',
      } as any);
      expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.stringContaining('recipientId') }));
    });

    it('should emit error when conversationId missing', async () => {
      const client = { ...mockSocket, data: { userId: 'sender-1' }, emit: jest.fn() };
      await gateway.handleSealedMessage(client as any, {
        ...sealedPayload,
        conversationId: '',
      } as any);
      // X07-#1: Now validates conversationId separately
      expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: 'Invalid conversationId' }));
    });

    it('should emit error when recipient is not a conversation member', async () => {
      const client = { ...mockSocket, data: { userId: 'sender-1' }, emit: jest.fn() };
      // X07-#2: Now checks sender first, then recipient
      prisma.conversationMember.findUnique
        .mockResolvedValueOnce({ userId: 'sender-1' }) // sender IS a member
        .mockResolvedValueOnce(null); // recipient NOT a member

      await gateway.handleSealedMessage(client as any, sealedPayload);

      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Recipient is not a member of this conversation' });
    });

    it('should route sealed envelope to recipient user room (NOT conversation room)', async () => {
      const client = { ...mockSocket, data: { userId: 'sender-1' }, emit: jest.fn() };
      // X07-#2: Now checks sender membership first, then recipient
      prisma.conversationMember.findUnique
        .mockResolvedValueOnce({ userId: 'sender-1' }) // sender membership
        .mockResolvedValueOnce({ userId: 'user-recipient' }); // recipient membership
      const mockMessage = { id: 'msg-sealed', createdAt: new Date() };
      messagesService.sendMessage.mockResolvedValue(mockMessage);

      const result = await gateway.handleSealedMessage(client as any, sealedPayload);

      // CRITICAL: must route to user room, not conversation room
      expect(gateway.server.to).toHaveBeenCalledWith('user:user-recipient');
      expect(gateway.server.emit).toHaveBeenCalledWith('sealed_message', {
        ephemeralKey: 'base64ephemeral',
        sealedCiphertext: 'base64ciphertext',
        conversationId: UUID1,
      });
      // Must NOT include senderId in the emitted event
      const emitCall = (gateway.server.emit as jest.Mock).mock.calls.find(
        (c: unknown[]) => c[0] === 'sealed_message',
      );
      expect(emitCall[1]).not.toHaveProperty('senderId');
    });

    it('should persist message via messagesService with authenticated userId', async () => {
      const client = { ...mockSocket, data: { userId: 'sender-1' }, emit: jest.fn() };
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-recipient' });
      const mockMessage = { id: 'msg-sealed-2', createdAt: new Date() };
      messagesService.sendMessage.mockResolvedValue(mockMessage);

      await gateway.handleSealedMessage(client as any, sealedPayload);

      expect(messagesService.sendMessage).toHaveBeenCalledWith(
        UUID1,
        'sender-1', // authenticated userId, NOT recipientId
        expect.objectContaining({
          _sealedSender: true,
          _skipRedisPublish: true,
        }),
      );
    });

    it('should return success with messageId and clientMessageId', async () => {
      const client = { ...mockSocket, data: { userId: 'sender-1' }, emit: jest.fn() };
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-recipient' });
      const mockMessage = { id: 'msg-ack', createdAt: new Date('2026-03-29') };
      messagesService.sendMessage.mockResolvedValue(mockMessage);

      const result = await gateway.handleSealedMessage(client as any, sealedPayload);

      expect(result).toEqual({
        success: true,
        messageId: 'msg-ack',
        clientMessageId: 'client-msg-1',
        createdAt: mockMessage.createdAt,
      });
    });

    it('should throw WsException when persistence fails', async () => {
      const client = { ...mockSocket, data: { userId: 'sender-1' }, emit: jest.fn() };
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-recipient' });
      messagesService.sendMessage.mockRejectedValue(new Error('DB error'));

      await expect(
        gateway.handleSealedMessage(client as any, sealedPayload),
      ).rejects.toThrow(WsException);
    });

    it('should respect rate limit', async () => {
      const client = { ...mockSocket, data: { userId: 'sender-1' }, emit: jest.fn() };
      redis.incr.mockResolvedValue(31); // exceeds 30/60s
      await gateway.handleSealedMessage(client as any, sealedPayload);
      expect(messagesService.sendMessage).not.toHaveBeenCalled();
    });
  });


  // ══════════════════════════════════════════════════════════════════════════════
  // Activity status privacy — typing/read/presence should respect settings
  // ══════════════════════════════════════════════════════════════════════════════

  describe('activity status privacy', () => {
    it('should NOT emit typing when activityStatus is disabled', async () => {
      const client = {
        ...mockSocket,
        data: { userId: 'private-user' },
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      };
      prisma.userSettings.findUnique.mockResolvedValue({ activityStatus: false });

      await gateway.handleTyping(client as any, { conversationId: UUID1, isTyping: true });

      expect(client.to).not.toHaveBeenCalled();
      expect(client.emit).not.toHaveBeenCalledWith('user_typing', expect.anything());
    });

    it('should NOT emit presence when activityStatus is disabled on connect', async () => {
      const client = {
        ...mockSocket,
        id: 'socket-private',
        data: {} as any,
        handshake: { ...mockSocket.handshake, auth: { token: 'valid' } },
        join: jest.fn(),
      };
      (verifyToken as jest.Mock).mockResolvedValue({ sub: 'clerk-private' });
      prisma.user.findUnique.mockResolvedValue({ id: 'private-user', username: 'private', isBanned: false, isDeactivated: false, isDeleted: false });
      prisma.userSettings.findUnique.mockResolvedValue({ activityStatus: false });

      await gateway.handleConnection(client as any);

      // Should NOT broadcast online presence
      expect(gateway.server.emit).not.toHaveBeenCalledWith('presence', expect.objectContaining({ isOnline: true }));
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Connection eviction — max 3 sockets per user
  // ══════════════════════════════════════════════════════════════════════════════

  describe('connection max-sockets-per-user', () => {
    it('should evict oldest sockets when user exceeds 3 connections', async () => {
      const client = {
        ...mockSocket,
        id: 'socket-new',
        data: {} as any,
        handshake: { ...mockSocket.handshake, auth: { token: 'valid' } },
        join: jest.fn(),
      };
      (verifyToken as jest.Mock).mockResolvedValue({ sub: 'clerk-1' });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'test', isBanned: false, isDeactivated: false, isDeleted: false });
      // X07-#8: Lua script returns evicted socket IDs atomically
      redis.eval.mockResolvedValue(['socket-old-1']);
      redis.publish = jest.fn().mockResolvedValue(1);

      await gateway.handleConnection(client as any);

      // X07-#8: Eviction now uses atomic Lua script via redis.eval
      expect(redis.eval).toHaveBeenCalled();
      // Should publish eviction event via Redis pub/sub for evicted sockets
      expect(redis.publish).toHaveBeenCalledWith('socket:evict', expect.stringContaining('socket-old-1'));
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Typing auto-clear — server-side 10s timeout
  // ══════════════════════════════════════════════════════════════════════════════

  describe('typing auto-clear', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('should auto-clear typing after 10 seconds', async () => {
      const toEmit = jest.fn();
      const client = {
        ...mockSocket,
        data: { userId: 'user-typer' },
        to: jest.fn().mockReturnValue({ emit: toEmit }),
        emit: jest.fn(),
      };

      await gateway.handleTyping(client as any, { conversationId: UUID1, isTyping: true });

      // Typing event should have been sent
      expect(client.to).toHaveBeenCalledWith(`conversation:${UUID1}`);

      // Advance 10 seconds — auto-clear should fire
      jest.advanceTimersByTime(10_000);

      // Should emit isTyping: false automatically
      const lastCall = toEmit.mock.calls[toEmit.mock.calls.length - 1];
      expect(lastCall[0]).toBe('user_typing');
      expect(lastCall[1]).toEqual({ userId: 'user-typer', isTyping: false });
    });

    it('should clear previous typing timer when isTyping sent again', async () => {
      const toEmit = jest.fn();
      const client = {
        ...mockSocket,
        data: { userId: 'user-typer2' },
        to: jest.fn().mockReturnValue({ emit: toEmit }),
        emit: jest.fn(),
      };

      // First typing event
      await gateway.handleTyping(client as any, { conversationId: UUID1, isTyping: true });
      // Second typing event before 10s (resets timer)
      await gateway.handleTyping(client as any, { conversationId: UUID1, isTyping: true });

      // After 9 seconds from second event — should NOT have auto-cleared yet
      jest.advanceTimersByTime(9_000);
      const autoClears = toEmit.mock.calls.filter(
        (c: unknown[]) => c[0] === 'user_typing' && (c[1] as { isTyping: boolean }).isTyping === false,
      );
      expect(autoClears).toHaveLength(0);

      // After 10 seconds total — should auto-clear
      jest.advanceTimersByTime(1_000);
      const autoClears2 = toEmit.mock.calls.filter(
        (c: unknown[]) => c[0] === 'user_typing' && (c[1] as { isTyping: boolean }).isTyping === false,
      );
      expect(autoClears2).toHaveLength(1);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Module lifecycle — onModuleDestroy cleanup
  // ══════════════════════════════════════════════════════════════════════════════

  describe('onModuleDestroy', () => {
    it('should clear all heartbeat and typing timers', async () => {
      // Simulate some timers
      (gateway as any).heartbeatTimers.set('s1', setInterval(() => {}, 1000));
      (gateway as any).heartbeatTimers.set('s2', setInterval(() => {}, 1000));
      (gateway as any).typingTimers.set('u1:c1', setTimeout(() => {}, 1000));

      await gateway.onModuleDestroy();

      expect((gateway as any).heartbeatTimers.size).toBe(0);
      expect((gateway as any).typingTimers.size).toBe(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Token extraction — extractToken private method (tested via handleConnection)
  // ══════════════════════════════════════════════════════════════════════════════

  describe('extractToken', () => {
    it('should extract token from handshake.auth.token', async () => {
      const client = {
        ...mockSocket,
        id: 'socket-auth',
        data: {} as any,
        handshake: { auth: { token: 'direct-token' }, headers: {} },
        join: jest.fn(),
      };
      (verifyToken as jest.Mock).mockResolvedValue({ sub: 'clerk-1' });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'test', isBanned: false, isDeactivated: false, isDeleted: false });

      await gateway.handleConnection(client as any);
      expect(verifyToken).toHaveBeenCalledWith('direct-token', expect.anything());
    });

    it('should extract token from authorization header without Bearer prefix', async () => {
      const client = {
        ...mockSocket,
        id: 'socket-bare',
        data: {} as any,
        handshake: { auth: {}, headers: { authorization: 'raw-token-no-bearer' } },
        join: jest.fn(),
      };
      (verifyToken as jest.Mock).mockResolvedValue({ sub: 'clerk-1' });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'test', isBanned: false, isDeactivated: false, isDeleted: false });

      await gateway.handleConnection(client as any);
      // 'raw-token-no-bearer'.split(' ') = ['raw-token-no-bearer'], type != 'Bearer' → returns auth itself
      expect(verifyToken).toHaveBeenCalledWith('raw-token-no-bearer', expect.anything());
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Delivery receipts — privacy + correct routing
  // ══════════════════════════════════════════════════════════════════════════════

  describe('handleMessageDelivered — sender notification', () => {
    it('should send delivery receipt only to message sender, not entire room', async () => {
      const client = { ...mockSocket, data: { userId: 'recipient-1' } };
      const senderId = 'sender-1';
      prisma.message.findUnique.mockResolvedValue({ senderId });
      redis.smembers.mockResolvedValue(['sender-socket-1', 'sender-socket-2']);

      await gateway.handleMessageDelivered(client as any, { messageId: UUID2, conversationId: UUID1 });

      // Should route to sender's individual sockets, not broadcast to room
      expect(gateway.server.to).toHaveBeenCalledWith('sender-socket-1');
      expect(gateway.server.to).toHaveBeenCalledWith('sender-socket-2');
      expect(gateway.server.emit).toHaveBeenCalledWith('delivery_receipt', expect.objectContaining({
        messageId: UUID2,
        deliveredTo: 'recipient-1',
      }));
    });
  });

  // ═══════════════════════════════════════════════════════
  // T06 Gateway — handleConnection deactivated/deleted (T06 #100)
  // ═══════════════════════════════════════════════════════

  describe('handleConnection — deactivated user (T06 #100)', () => {
    it('should disconnect deactivated user', async () => {
      const client = {
        id: 'socket-deactivated',
        handshake: { ...mockSocket.handshake, auth: { token: 'fake-token' } },
        disconnect: jest.fn(),
        emit: jest.fn(),
        join: jest.fn(),
        data: {} as any,
      };
      (verifyToken as jest.Mock).mockResolvedValue({ sub: 'clerk-deactivated' });
      prisma.user.findUnique.mockResolvedValue({ id: 'u-deact', username: 'deact', isBanned: false, isDeactivated: true, isDeleted: false });

      await gateway.handleConnection(client as any);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should disconnect deleted user', async () => {
      const client = {
        id: 'socket-deleted',
        handshake: { ...mockSocket.handshake, auth: { token: 'fake-token' } },
        disconnect: jest.fn(),
        emit: jest.fn(),
        join: jest.fn(),
        data: {} as any,
      };
      (verifyToken as jest.Mock).mockResolvedValue({ sub: 'clerk-deleted' });
      prisma.user.findUnique.mockResolvedValue({ id: 'u-del', username: 'del', isBanned: false, isDeactivated: false, isDeleted: true });

      await gateway.handleConnection(client as any);
      expect(client.disconnect).toHaveBeenCalled();
    });
  });
});
