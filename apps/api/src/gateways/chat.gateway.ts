import { Inject, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import Redis from 'ioredis';
import { verifyToken } from '@clerk/backend';
import { ConfigService } from '@nestjs/config';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../config/prisma.service';
import { MessagesService } from '../modules/messages/messages.service';
import { WsSendMessageDto } from './dto/send-message.dto';
import { atomicIncr } from '../common/utils/redis-atomic';
import {
  WsJoinConversationDto,
  WsTypingDto,
  WsReadDto,
  WsMessageDeliveredDto,
  WsLeaveConversationDto,
} from './dto/chat-events.dto';
import {
  JoinQuranRoomDto,
  LeaveQuranRoomDto,
  QuranRoomVerseSyncDto,
  QuranRoomReciterChangeDto,
} from './dto/quran-room-events.dto';

@WebSocketGateway({
  cors: {
    origin: (origin: string, callback: (err: Error | null, allow?: boolean) => void) => {
      const allowed = process.env.CORS_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) || [];
      const isProduction = process.env.NODE_ENV === 'production';
      // In production: reject if no origins configured (secure default)
      // In development: allow all if no origins configured (convenience)
      if (!origin) {
        callback(null, !isProduction);
      } else if (allowed.length === 0) {
        callback(null, !isProduction);
      } else if (allowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
  },
  namespace: '/chat',
  pingInterval: 25000,
  pingTimeout: 60000,
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ChatGateway.name);
  // Presence tracking via Redis (supports horizontal scaling)
  // Key: presence:{userId} → Set of socketIds, TTL 5 minutes (auto-cleanup stale connections)
  private readonly PRESENCE_TTL = 300; // 5 minutes
  private readonly HEARTBEAT_INTERVAL = 120_000; // 2 minutes
  private heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>(); // socketId → timer
  // Quran rooms stored in Redis (supports horizontal scaling)
  // Hash: quran:room:{roomId} → { hostId, currentSurah, currentVerse, reciterId }
  // Set:  quran:room:{roomId}:participants → socket IDs
  private readonly QURAN_ROOM_TTL = 3600; // 1 hour auto-cleanup
  private readonly MAX_QURAN_ROOM_PARTICIPANTS = 50;
  private redisSubscriber: Redis | null = null; // For cleanup on destroy
  // Server-side typing timeout: auto-clear after 10 seconds to handle dropped isTyping:false events
  private typingTimers = new Map<string, ReturnType<typeof setTimeout>>(); // `userId:conversationId` → timer

  constructor(
    private messagesService: MessagesService,
    private prisma: PrismaService,
    private config: ConfigService,
    @Inject('REDIS') private redis: Redis,
  ) {}

  /**
   * Subscribe to Redis pub/sub for real-time notification delivery.
   * When NotificationsService publishes to 'notification:new', emit
   * the notification to the user's Socket.io room.
   */
  async onModuleInit() {
    try {
      // Create a duplicate Redis connection for subscribing (pub/sub requires dedicated connection)
      const subscriber = this.redis.duplicate();
      this.redisSubscriber = subscriber;
      await subscriber.subscribe('notification:new', 'content:update', 'new_message', 'user:banned', 'user:session_revoked', 'socket:evict');
      subscriber.on('message', (channel: string, message: string) => {
        try {
          if (channel === 'notification:new') {
            const { userId, notification } = JSON.parse(message);
            if (userId && notification) {
              this.server.to(`user:${userId}`).emit('new_notification', notification);
            }
          } else if (channel === 'content:update') {
            const { postId, reelId, threadId, event, data } = JSON.parse(message);
            const roomId = postId || reelId || threadId;
            if (roomId && event) {
              this.server.to(`content:${roomId}`).emit(event, data);
            }
          } else if (channel === 'new_message') {
            const { conversationId, message: msg } = JSON.parse(message);
            if (conversationId && msg) {
              this.server.to(`conversation:${conversationId}`).emit('new_message', msg);
            }
          } else if (channel === 'user:banned' || channel === 'user:session_revoked') {
            // Force-disconnect banned users or users whose sessions were revoked
            const { userId } = JSON.parse(message);
            if (userId) {
              this.server.in(`user:${userId}`).fetchSockets().then(sockets => {
                for (const s of sockets) {
                  s.emit('force_disconnect', { reason: channel === 'user:banned' ? 'account_banned' : 'session_revoked' });
                  s.disconnect(true);
                }
                if (sockets.length > 0) {
                  this.logger.log(`Force-disconnected ${sockets.length} socket(s) for ${channel}: ${userId}`);
                }
              }).catch(e => this.logger.error(`Failed to force-disconnect user ${userId}`, e));
            }
          } else if (channel === 'socket:evict') {
            // Evict specific sockets by ID — works across all instances via pub/sub
            const { socketIds, reason } = JSON.parse(message);
            if (Array.isArray(socketIds)) {
              for (const sid of socketIds) {
                this.server.in(sid).fetchSockets().then(sockets => {
                  for (const s of sockets) {
                    s.emit('force_disconnect', { reason });
                    s.disconnect(true);
                  }
                }).catch(() => {}); // Socket may not be on this instance
              }
            }
          }
        } catch (e) {
          this.logger.debug('Failed to parse pub/sub message', e);
          Sentry.captureException(e, { tags: { component: 'chat-gateway', channel } });
        }
      });
      this.logger.log('Subscribed to notification:new + content:update + new_message + user:banned + user:session_revoked + socket:evict Redis channels');
    } catch (e) {
      this.logger.warn('Failed to subscribe to Redis channels — real-time updates disabled', e);
    }
  }

  async onModuleDestroy() {
    // Clean up all heartbeat timers
    for (const [, timer] of this.heartbeatTimers) {
      clearInterval(timer);
    }
    this.heartbeatTimers.clear();

    // Clean up all typing timeout timers
    for (const [, timer] of this.typingTimers) {
      clearTimeout(timer);
    }
    this.typingTimers.clear();

    // Unsubscribe Redis pub/sub
    if (this.redisSubscriber) {
      try {
        await this.redisSubscriber.unsubscribe();
        this.redisSubscriber.disconnect();
      } catch {
        // Already disconnected
      }
      this.redisSubscriber = null;
    }

    this.logger.log('ChatGateway cleaned up: timers cleared, Redis unsubscribed');
  }

  /** Get all socket IDs for a user from Redis presence */
  private async getUserSockets(userId: string): Promise<string[]> {
    return this.redis.smembers(`presence:${userId}`);
  }

  // ── Quran Room Redis Helpers ──

  private quranRoomKey(roomId: string) { return `quran:room:${roomId}`; }
  private quranParticipantsKey(roomId: string) { return `quran:room:${roomId}:participants`; }

  private async getQuranRoom(roomId: string) {
    const data = await this.redis.hgetall(this.quranRoomKey(roomId));
    if (!data || !data.hostId) return null;
    return {
      hostId: data.hostId,
      currentSurah: parseInt(data.currentSurah || '1', 10),
      currentVerse: parseInt(data.currentVerse || '1', 10),
      reciterId: data.reciterId || null,
    };
  }

  private async getQuranParticipantCount(roomId: string): Promise<number> {
    return this.redis.scard(this.quranParticipantsKey(roomId));
  }

  /**
   * F41 — Transfer Quran room host to the next available participant.
   * Picks the first remaining socket in the room, reads its userId,
   * updates Redis + DB, and emits host_changed to all participants.
   * Returns the new hostId or null if no participants remain.
   */
  private async transferQuranRoomHost(roomId: string): Promise<string | null> {
    try {
      const remainingSockets = await this.server.in(`quran:${roomId}`).fetchSockets();
      if (remainingSockets.length === 0) return null;

      const newHostSocket = remainingSockets[0];
      const newHostUserId = newHostSocket.data?.userId;
      if (!newHostUserId) return null;

      // Update host in Redis
      await this.redis.hset(this.quranRoomKey(roomId), 'hostId', newHostUserId);

      // Update host in DB (best-effort — don't crash if record doesn't exist)
      await this.prisma.audioRoom.update({
        where: { id: roomId },
        data: { hostId: newHostUserId },
      }).catch(err => this.logger.warn(`Failed to update Quran room ${roomId} host in DB`, err.message));

      // Notify all participants of host change
      this.server.to(`quran:${roomId}`).emit('host_changed', {
        roomId,
        newHostId: newHostUserId,
      });

      this.logger.log(`Quran room ${roomId}: host transferred to ${newHostUserId}`);
      return newHostUserId;
    } catch (err) {
      this.logger.error(`Failed to transfer Quran room ${roomId} host`, err);
      return null;
    }
  }

  private async checkRateLimit(userId: string, event = 'message', limit = 30, windowSec = 60): Promise<boolean> {
    const key = `ws:ratelimit:${event}:${userId}`;
    const count = await atomicIncr(this.redis, key, windowSec);
    return count <= limit;
  }

  async handleConnection(client: Socket) {
    try {
      // Rate limit connections per IP (max 10/min) to prevent connection floods
      const ip = client.handshake.headers['x-forwarded-for']?.toString().split(',')[0]?.trim()
        || client.handshake.address || 'unknown';
      const connKey = `ws:conn:${ip}`;
      // J07-H6: Atomic INCR + conditional EXPIRE via Lua script to eliminate crash-between race
      const connCount = await atomicIncr(this.redis, connKey, 60);
      if (connCount > 10) {
        this.logger.warn(`WebSocket connection flood from IP ${ip}: ${connCount}/min`);
        client.disconnect();
        return;
      }

      const token = this.extractToken(client);
      if (!token) {
        client.disconnect();
        return;
      }

      const { sub: clerkId } = await verifyToken(token, {
        secretKey: this.config.get('CLERK_SECRET_KEY'),
      });
      const user = await this.prisma.user.findUnique({
        where: { clerkId },
        select: { id: true, username: true, isBanned: true, isDeactivated: true, isDeleted: true },
      });

      if (!user || user.isBanned || user.isDeactivated || user.isDeleted) {
        client.disconnect();
        return;
      }

      // Attach user id and Quran room tracking to socket data
      client.data.userId = user.id;
      client.data.quranRooms = [];

      // Track user as online via Redis (scales across instances)
      const userId = client.data.userId;
      const presenceKey = `presence:${userId}`;

      // J07-H3 FIX: Pipeline sequential Redis commands to reduce round-trips (was 5-7 sequential)
      const MAX_SOCKETS_PER_USER = 3;
      const existingBefore = await this.redis.smembers(presenceKey);
      if (existingBefore.length >= MAX_SOCKETS_PER_USER) {
        const staleIds = existingBefore.slice(0, existingBefore.length - MAX_SOCKETS_PER_USER + 1);
        if (staleIds.length > 0) {
          const pipeline = this.redis.pipeline();
          for (const staleId of staleIds) {
            pipeline.srem(presenceKey, staleId);
          }
          await pipeline.exec();
          this.redis.publish('socket:evict', JSON.stringify({ socketIds: staleIds, reason: 'connection_limit' }))
            .catch(() => {});
        }
      }

      // Pipeline: add socket + set TTL + fetch settings in one round-trip
      const pipeline = this.redis.pipeline();
      pipeline.sadd(presenceKey, client.id);
      pipeline.expire(presenceKey, this.PRESENCE_TTL);
      await pipeline.exec();

      // Start heartbeat to keep presence alive while connected
      const timer = setInterval(async () => {
        try {
          await this.redis.expire(presenceKey, this.PRESENCE_TTL);
        } catch {
          // Redis unavailable — presence will expire naturally
        }
      }, this.HEARTBEAT_INTERVAL);
      this.heartbeatTimers.set(client.id, timer);

      // Check activityStatus setting
      const settings = await this.prisma.userSettings.findUnique({
        where: { userId: user.id },
        select: { activityStatus: true },
      });
      const showActivity = !settings || settings.activityStatus !== false;

      // Broadcast online status via user's own room (O(1) emit instead of O(N) per-conversation)
      // Clients subscribe to `user:{userId}` rooms for users they care about (followed, conversation members)
      if (showActivity) {
        this.server.to(`user:${user.id}`).emit('presence', { userId, isOnline: true });
      }

      client.join(`user:${user.id}`);
      this.logger.log(`Socket connected: userId=${userId}`);
    } catch (err: unknown) {
      // X07-#10: Log connection failures instead of silently swallowing
      this.logger.error(
        `Socket connection failed for client ${client.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Clean up heartbeat timer if connection setup fails partway through
      const existingTimer = this.heartbeatTimers.get(client.id);
      if (existingTimer) {
        clearInterval(existingTimer);
        this.heartbeatTimers.delete(client.id);
      }
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    // Stop heartbeat for this socket
    const timer = this.heartbeatTimers.get(client.id);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(client.id);
    }

    // Clean up Quran room memberships for this socket (F5 — prevent ghost participants)
    const quranRooms: string[] = client.data.quranRooms || [];
    for (const roomId of quranRooms) {
      try {
        const partKey = this.quranParticipantsKey(roomId);
        await this.redis.srem(partKey, client.id);
        const remaining = await this.redis.scard(partKey);
        if (remaining === 0) {
          // Room empty — clean up Redis and mark DB record ended (F42)
          await this.redis.del(this.quranRoomKey(roomId), partKey);
          await this.prisma.audioRoom.update({
            where: { id: roomId },
            data: { status: 'ended', endedAt: new Date() },
          }).catch(err => this.logger.warn(`Failed to mark empty Quran room ${roomId} as ended in DB`, err.message));
        } else {
          // F41 — Host transfer: if disconnecting user was the host, transfer to next participant
          const room = await this.getQuranRoom(roomId);
          let currentHostId = room?.hostId;
          if (currentHostId === client.data.userId) {
            const newHostId = await this.transferQuranRoomHost(roomId);
            if (newHostId) currentHostId = newHostId;
          }
          // Broadcast updated participant count
          this.server.to(`quran:${roomId}`).emit('quran_room_update', {
            roomId,
            hostId: currentHostId,
            currentSurah: room?.currentSurah,
            currentVerse: room?.currentVerse,
            reciterId: room?.reciterId,
            participantCount: remaining,
          });
        }
      } catch (e) {
        this.logger.error(`Failed to clean up Quran room ${roomId} on disconnect`, e);
      }
    }

    const userId = client.data.userId;
    if (!userId) return;

    this.logger.log(`Socket disconnected: userId=${userId}`);
    const presenceKey = `presence:${userId}`;
    await this.redis.srem(presenceKey, client.id);
    const remaining = await this.redis.scard(presenceKey);

    if (remaining === 0) {
      // User fully offline — clean up and update lastSeenAt
      await this.redis.del(presenceKey);
      this.prisma.user.update({
        where: { id: userId },
        data: { lastSeenAt: new Date() },
      }).catch((e) => this.logger.error('Failed to update lastSeenAt', e));
      // Broadcast offline status via user's own room (O(1) emit instead of O(N) per-conversation)
      const settings = await this.prisma.userSettings.findUnique({
        where: { userId },
        select: { activityStatus: true },
      });
      const showActivity = !settings || settings.activityStatus !== false;
      if (showActivity) {
        this.server.to(`user:${userId}`).emit('presence', { userId, isOnline: false });
      }
    }
  }

  @SubscribeMessage('join_conversation')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!client.data.userId) throw new WsException('Unauthorized');
    if (!(await this.checkRateLimit(client.data.userId, 'join', 20, 60))) return;
    const dto = plainToInstance(WsJoinConversationDto, data);
    const errors = await validate(dto);
    if (errors.length > 0) {
      client.emit('error', { message: 'Invalid join_conversation data' });
      return;
    }
    try {
      await this.messagesService.requireMembership(dto.conversationId, client.data.userId);
    } catch {
      throw new WsException('Not a member of this conversation');
    }
    client.join(`conversation:${dto.conversationId}`);
  }

  @SubscribeMessage('leave_conversation')
  async handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!client.data.userId) throw new WsException('Unauthorized');
    if (!(await this.checkRateLimit(client.data.userId, 'leave', 20, 60))) return;
    const dto = plainToInstance(WsLeaveConversationDto, data);
    const errors = await validate(dto);
    if (errors.length > 0) {
      client.emit('error', { message: 'Invalid leave_conversation data' });
      return;
    }
    client.leave(`conversation:${dto.conversationId}`);
  }

  @SubscribeMessage('send_message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: Record<string, unknown>,
  ) {
    if (!client.data.userId) throw new WsException('Unauthorized');

    const dto = plainToInstance(WsSendMessageDto, data);
    const errors = await validate(dto);
    if (errors.length > 0) {
      client.emit('error', { message: 'Invalid message data' });
      return;
    }

    if (!(await this.checkRateLimit(client.data.userId))) {
      client.emit('error', { message: 'Rate limit exceeded' });
      return;
    }

    // V6-F2b: E2E enforcement moved to messagesService.sendMessage (persistent DB flag).
    // The service checks conversation.isE2E and rejects plaintext if true.
    // No Redis TTL — the flag is permanent once set, stored in PostgreSQL.

    let message;
    try {
      message = await this.messagesService.sendMessage(
        dto.conversationId,
        client.data.userId,
        {
          content: dto.content,
          messageType: dto.messageType,
          mediaUrl: dto.mediaUrl,
          mediaType: dto.mediaType,
          replyToId: dto.replyToId,
          isSpoiler: dto.isSpoiler,
          isViewOnce: dto.isViewOnce,
          // E2E fields (opaque passthrough — base64 strings converted to Uint8Array)
          ...(dto.encryptedContent ? { encryptedContent: Uint8Array.from(Buffer.from(dto.encryptedContent, 'base64')) } : {}),
          ...(dto.e2eVersion ? { e2eVersion: dto.e2eVersion } : {}),
          ...(dto.e2eSenderDeviceId !== undefined ? { e2eSenderDeviceId: dto.e2eSenderDeviceId } : {}),
          ...(dto.e2eSenderRatchetKey ? { e2eSenderRatchetKey: Uint8Array.from(Buffer.from(dto.e2eSenderRatchetKey, 'base64')) } : {}),
          ...(dto.e2eCounter !== undefined ? { e2eCounter: dto.e2eCounter } : {}),
          ...(dto.e2ePreviousCounter !== undefined ? { e2ePreviousCounter: dto.e2ePreviousCounter } : {}),
          // X02-#5 FIX: Use !== undefined instead of truthy check (0 is a valid key ID)
          ...(dto.e2eSenderKeyId !== undefined ? { e2eSenderKeyId: dto.e2eSenderKeyId } : {}),
          ...(dto.clientMessageId ? { clientMessageId: dto.clientMessageId } : {}),
          ...(dto.encryptedLastMessagePreview ? { encryptedLastMessagePreview: Uint8Array.from(Buffer.from(dto.encryptedLastMessagePreview, 'base64')) } : {}),
          _skipRedisPublish: true, // Prevent double broadcast — gateway emits directly
        } as any,
      );
    } catch (err) {
      // X02-#13 FIX: Preserve error context — distinguish permission vs validation vs internal errors
      const msg = err instanceof Error ? err.message : 'Failed to send message';
      this.logger.warn(`Message send failed for ${client.data.userId}: ${msg}`);
      throw new WsException(msg);
    }

    // Broadcast to conversation room (sender doesn't receive their own message)
    client
      .to(`conversation:${dto.conversationId}`)
      .emit('new_message', message);

    // Return message as ACK — the client's socket.emit callback receives this
    // for the offline queue to mark as 'sent'
    return { success: true, messageId: message.id, clientMessageId: dto.clientMessageId, createdAt: message.createdAt };
  }

  /**
   * Sealed sender message handler (C11 / V6-F1).
   *
   * The client sends: sealed envelope + E2E fields for persistence.
   * The server:
   * 1. Forwards the sealed envelope to the RECIPIENT'S USER ROOM (not conversation room)
   * 2. Persists the message in the DB (so history/undo/receipts work)
   *
   * V6-F1 FIX: Previously routed to `conversation:${conversationId}` which leaked the
   * sender's identity via room membership — all conversation members could see which
   * socket emitted. Now routes to `user:${recipientId}` so the server forwards the
   * opaque envelope directly to the recipient without broadcasting to the conversation.
   *
   * The forwarded event contains ONLY the sealed envelope (ephemeralKey + sealedCiphertext)
   * plus the conversationId (so the recipient can route to the correct session).
   * No senderId, no socket metadata. The recipient unseals the envelope to discover
   * the sender identity, then decrypts the inner ciphertext via their pairwise session.
   *
   * KNOWN LIMITATION (V6-F4): The authenticated socket still allows timing correlation —
   * a compromised server can correlate sealed message timing with socket auth timestamps.
   * Full mitigation requires a separate unauthenticated transport for sealed delivery.
   *
   * DB LIMITATION: Message.senderId is a required Prisma field. The DB record still
   * contains the senderId for schema integrity. The sealed envelope (stored as
   * encryptedContent) is the authoritative transport — the DB senderId is a server-side
   * implementation detail, not visible to other clients.
   */
  @SubscribeMessage('send_sealed_message')
  async handleSealedMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      recipientId: string;
      ephemeralKey: string;
      sealedCiphertext: string;
      conversationId: string;
      // E2E persistence fields (same as send_message)
      clientMessageId?: string;
      encryptedContent?: string;
      e2eVersion?: number;
      e2eSenderDeviceId?: number;
      e2eSenderRatchetKey?: string;
      e2eCounter?: number;
      e2ePreviousCounter?: number;
      e2eIdentityKey?: string;
      e2eEphemeralKey?: string;
      e2eSignedPreKeyId?: number;
      e2ePreKeyId?: number;
      e2eRegistrationId?: number;
      messageType?: string;
      replyToId?: string;
      mediaUrl?: string;
      isSpoiler?: boolean;
      isViewOnce?: boolean;
    },
  ) {
    if (!client.data.userId) throw new WsException('Unauthorized');
    if (!(await this.checkRateLimit(client.data.userId, 'sealed_message', 30, 60))) return;

    // X07-#1 FIX: Validate field types and sizes (class-validator not available on raw WS)
    if (!data.recipientId || typeof data.recipientId !== 'string' || data.recipientId.length > 50) {
      client.emit('error', { message: 'Invalid recipientId' });
      return;
    }
    if (!data.conversationId || typeof data.conversationId !== 'string' || data.conversationId.length > 50) {
      client.emit('error', { message: 'Invalid conversationId' });
      return;
    }
    if (data.ephemeralKey && (typeof data.ephemeralKey !== 'string' || data.ephemeralKey.length > 10000)) {
      client.emit('error', { message: 'ephemeralKey too large' });
      return;
    }
    if (data.sealedCiphertext && (typeof data.sealedCiphertext !== 'string' || data.sealedCiphertext.length > 120000)) {
      client.emit('error', { message: 'sealedCiphertext too large' });
      return;
    }
    if (data.encryptedContent && (typeof data.encryptedContent !== 'string' || data.encryptedContent.length > 120000)) {
      client.emit('error', { message: 'encryptedContent too large' });
      return;
    }

    // P2-2.2: Validate ALL remaining optional string fields to prevent OOM
    const stringFieldLimits: Record<string, number> = {
      e2eSenderRatchetKey: 500,
      e2eIdentityKey: 500,
      e2eEphemeralKey: 500,
      messageType: 50,
      replyToId: 50,
      mediaUrl: 2000,
      clientMessageId: 100,
    };
    for (const [field, maxLen] of Object.entries(stringFieldLimits)) {
      const val = (data as Record<string, unknown>)[field];
      if (val !== undefined && val !== null && (typeof val !== 'string' || (val as string).length > maxLen)) {
        client.emit('error', { message: `Invalid ${field}` });
        return;
      }
    }

    // X07-#2 FIX: Verify SENDER is a member of the conversation (not just recipient)
    const senderMembership = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: data.conversationId, userId: client.data.userId } },
      select: { userId: true },
    });
    if (!senderMembership) {
      client.emit('error', { message: 'You are not a member of this conversation' });
      return;
    }

    // Verify recipient is also a member
    const recipientMembership = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: data.conversationId, userId: data.recipientId } },
      select: { userId: true },
    });
    if (!recipientMembership) {
      client.emit('error', { message: 'Recipient is not a member of this conversation' });
      return;
    }

    // V6-F1: Route to recipient's USER room — NOT the conversation room.
    // The server sees the recipientId for routing but the forwarded event contains
    // ONLY the opaque sealed envelope. No senderId, no conversation context.
    // The recipient unseals the envelope to discover sender + inner ciphertext.
    this.server.to(`user:${data.recipientId}`).emit('sealed_message', {
      ephemeralKey: data.ephemeralKey,
      sealedCiphertext: data.sealedCiphertext,
      // V6-F1: Include conversationId so the recipient knows which conversation
      // this sealed message belongs to (needed to route to correct session).
      // This is NOT a privacy leak — the recipient already knows their conversations.
      conversationId: data.conversationId,
    });

    // Codex-V7-F2 FIX: Persist with senderId from authenticated socket.
    // Previously: senderId=null → history render can't determine sender after app restart.
    // The sealed envelope hides the sender from TRANSPORT (socket logs, routing).
    // But the persisted DB record NEEDS the senderId for history/undo/receipts.
    // The sender's identity is ALSO inside the sealed envelope (defense-in-depth),
    // so even if the DB is compromised, the inner encryption layer protects content.
    let message;
    try {
      message = await this.messagesService.sendMessage(
        data.conversationId,
        client.data.userId, // Codex-V7-F2: Use authenticated userId for persistence
        {
          _sealedSender: true,
          messageType: data.messageType || 'TEXT',
          ...(data.encryptedContent ? { encryptedContent: Uint8Array.from(Buffer.from(data.encryptedContent, 'base64')) } : {}),
          ...(data.e2eVersion ? { e2eVersion: data.e2eVersion } : {}),
          ...(data.e2eSenderDeviceId !== undefined ? { e2eSenderDeviceId: data.e2eSenderDeviceId } : {}),
          ...(data.e2eSenderRatchetKey ? { e2eSenderRatchetKey: Uint8Array.from(Buffer.from(data.e2eSenderRatchetKey, 'base64')) } : {}),
          ...(data.e2eCounter !== undefined ? { e2eCounter: data.e2eCounter } : {}),
          ...(data.e2ePreviousCounter !== undefined ? { e2ePreviousCounter: data.e2ePreviousCounter } : {}),
          ...(data.clientMessageId ? { clientMessageId: data.clientMessageId } : {}),
          // Codex-V7-F2: Persist sealed envelope fields for later unsealing from history
          ...(data.ephemeralKey ? { e2eSealedEphemeralKey: data.ephemeralKey } : {}),
          ...(data.sealedCiphertext ? { e2eSealedCiphertext: data.sealedCiphertext } : {}),
          _skipRedisPublish: true,
        } as any,
      );
    } catch {
      // Codex-V7-F3 FIX: Persistence failure = message NOT delivered durably.
      // Previously returned { success: true } — sender thought message was stored. It wasn't.
      throw new WsException('Failed to persist sealed message');
    }

    return { success: true, messageId: message?.id, clientMessageId: data.clientMessageId, createdAt: message?.createdAt };
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; isTyping: boolean },
  ) {
    if (!client.data.userId) throw new WsException('Unauthorized');
    if (!(await this.checkRateLimit(client.data.userId, 'typing', 10, 10))) return;
    const dto = plainToInstance(WsTypingDto, data);
    const errors = await validate(dto);
    if (errors.length > 0) {
      client.emit('error', { message: 'Invalid typing data' });
      return;
    }
    try {
      await this.messagesService.requireMembership(dto.conversationId, client.data.userId);
    } catch {
      throw new WsException('Not a member of this conversation');
    }
    // Respect user privacy: only emit typing indicator if activityStatus is enabled
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId: client.data.userId },
      select: { activityStatus: true },
    });
    if (settings && !settings.activityStatus) return; // User has disabled activity visibility

    const typingKey = `${client.data.userId}:${dto.conversationId}`;
    // Clear any existing timeout for this user+conversation
    const existingTimer = this.typingTimers.get(typingKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.typingTimers.delete(typingKey);
    }

    client.to(`conversation:${dto.conversationId}`).emit('user_typing', {
      userId: client.data.userId,
      isTyping: dto.isTyping,
    });

    // Server-side auto-clear: if isTyping:true, set a 10-second timeout to emit isTyping:false
    // This handles dropped connections where the client never sends isTyping:false
    if (dto.isTyping) {
      const timer = setTimeout(() => {
        client.to(`conversation:${dto.conversationId}`).emit('user_typing', {
          userId: client.data.userId,
          isTyping: false,
        });
        this.typingTimers.delete(typingKey);
      }, 10_000);
      this.typingTimers.set(typingKey, timer);
    }
  }

  @SubscribeMessage('read')
  async handleRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!client.data.userId) throw new WsException('Unauthorized');
    if (!(await this.checkRateLimit(client.data.userId, 'read', 30, 60))) return;
    const dto = plainToInstance(WsReadDto, data);
    const errors = await validate(dto);
    if (errors.length > 0) {
      client.emit('error', { message: 'Invalid read data' });
      return;
    }
    await this.messagesService.markRead(dto.conversationId, client.data.userId);
    // Respect user privacy: only broadcast read receipt if activityStatus is enabled
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId: client.data.userId },
      select: { activityStatus: true },
    });
    if (settings && !settings.activityStatus) return; // User has disabled read receipts
    this.server
      .to(`conversation:${dto.conversationId}`)
      .emit('messages_read', { userId: client.data.userId });
  }

  @SubscribeMessage('get_online_status')
  async handleGetOnlineStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userIds: string[] },
  ) {
    if (!client.data.userId) throw new WsException('Unauthorized');
    if (!(await this.checkRateLimit(client.data.userId, 'online', 10, 60))) return;
    // Cap at 50 user IDs to prevent abuse
    const userIds = (data.userIds || []).slice(0, 50);
    const pipeline = this.redis.pipeline();
    for (const id of userIds) {
      pipeline.scard(`presence:${id}`);
    }
    const results = await pipeline.exec();
    const statuses = userIds.map((id, i) => ({
      userId: id,
      isOnline: (results?.[i]?.[1] as number) > 0,
    }));
    client.emit('online_status', statuses);
  }

  @SubscribeMessage('message_delivered')
  async handleMessageDelivered(@ConnectedSocket() client: Socket, @MessageBody() data: { messageId: string; conversationId: string }) {
    if (!client.data.userId) throw new WsException('Unauthorized');
    if (!(await this.checkRateLimit(client.data.userId, 'delivered', 60, 60))) return;

    const dto = plainToInstance(WsMessageDeliveredDto, data);
    const errors = await validate(dto);
    if (errors.length > 0) {
      client.emit('error', { message: 'Invalid message_delivered data' });
      return;
    }

    // Verify membership before updating delivery status
    try {
      await this.messagesService.requireMembership(dto.conversationId, client.data.userId);
    } catch {
      throw new WsException('Not a member of this conversation');
    }

    const now = new Date();
    // X07-#3: Await the delivery update instead of fire-and-forget to ensure data consistency
    await this.prisma.message.updateMany({
      where: { id: dto.messageId, conversationId: dto.conversationId },
      data: { deliveredAt: now },
    }).catch((e) => this.logger.error('Failed to update delivery', e));

    // Emit delivery receipt only to the message sender, not the entire room (F11 — privacy)
    try {
      const msg = await this.prisma.message.findUnique({
        where: { id: dto.messageId },
        select: { senderId: true },
      });
      if (msg?.senderId) {
        const senderSockets = await this.getUserSockets(msg.senderId);
        for (const s of senderSockets) {
          this.server.to(s).emit('delivery_receipt', { messageId: dto.messageId, deliveredAt: now.toISOString(), deliveredTo: client.data.userId });
        }
      }
    } catch (e) {
      this.logger.error(`Failed to emit delivery receipt for message ${dto.messageId}`, e);
    }
  }

  @SubscribeMessage('join_quran_room')
  async handleJoinQuranRoom(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!client.data.userId) throw new WsException('Unauthorized');
    if (!(await this.checkRateLimit(client.data.userId, 'quran_join', 10, 60))) return;
    const dto = plainToInstance(JoinQuranRoomDto, data);
    const errors = await validate(dto);
    if (errors.length > 0) {
      client.emit('error', { message: 'Invalid join_quran_room data' });
      return;
    }

    const userId = client.data.userId;
    const { roomId } = dto;

    // Create room in Redis if doesn't exist (first joiner is host)
    const roomKey = this.quranRoomKey(roomId);
    const exists = await this.redis.exists(roomKey);
    if (!exists) {
      await this.redis.hmset(roomKey, { hostId: userId, currentSurah: '1', currentVerse: '1', reciterId: '' });
      await this.redis.expire(roomKey, this.QURAN_ROOM_TTL);
    }

    // Enforce participant cap
    const partKey = this.quranParticipantsKey(roomId);
    const currentCount = await this.redis.scard(partKey);
    if (currentCount >= this.MAX_QURAN_ROOM_PARTICIPANTS) {
      client.emit('error', { message: `Room is full (max ${this.MAX_QURAN_ROOM_PARTICIPANTS} participants)` });
      return;
    }

    // Add participant and track on socket for disconnect cleanup
    await this.redis.sadd(partKey, client.id);
    await this.redis.expire(partKey, this.QURAN_ROOM_TTL);
    client.join(`quran:${roomId}`);
    if (!client.data.quranRooms) client.data.quranRooms = [];
    if (!client.data.quranRooms.includes(roomId)) client.data.quranRooms.push(roomId);

    // Broadcast updated state
    const room = await this.getQuranRoom(roomId);
    const count = await this.getQuranParticipantCount(roomId);
    this.server.to(`quran:${roomId}`).emit('quran_room_update', {
      roomId,
      hostId: room?.hostId,
      currentSurah: room?.currentSurah,
      currentVerse: room?.currentVerse,
      reciterId: room?.reciterId,
      participantCount: count,
    });
  }

  @SubscribeMessage('leave_quran_room')
  async handleLeaveQuranRoom(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!client.data.userId) throw new WsException('Unauthorized');
    if (!(await this.checkRateLimit(client.data.userId, 'quran_leave', 10, 60))) return;
    const dto = plainToInstance(LeaveQuranRoomDto, data);
    const errors = await validate(dto);
    if (errors.length > 0) {
      client.emit('error', { message: 'Invalid leave_quran_room data' });
      return;
    }

    const { roomId } = dto;
    const partKey = this.quranParticipantsKey(roomId);
    await this.redis.srem(partKey, client.id);
    client.leave(`quran:${roomId}`);
    // Remove from socket tracking
    if (client.data.quranRooms) {
      client.data.quranRooms = client.data.quranRooms.filter((r: string) => r !== roomId);
    }

    // Clean up empty rooms (F42 — mark DB record ended)
    const remaining = await this.redis.scard(partKey);
    if (remaining === 0) {
      await this.redis.del(this.quranRoomKey(roomId), partKey);
      await this.prisma.audioRoom.update({
        where: { id: roomId },
        data: { status: 'ended', endedAt: new Date() },
      }).catch(err => this.logger.warn(`Failed to mark empty Quran room ${roomId} as ended in DB`, err.message));
      return;
    }

    // F41 — Host transfer: if leaving user was the host, transfer to next participant
    const room = await this.getQuranRoom(roomId);
    let currentHostId = room?.hostId;
    if (currentHostId === client.data.userId) {
      const newHostId = await this.transferQuranRoomHost(roomId);
      if (newHostId) currentHostId = newHostId;
    }

    this.server.to(`quran:${roomId}`).emit('quran_room_update', {
      roomId,
      hostId: currentHostId,
      currentSurah: room?.currentSurah,
      currentVerse: room?.currentVerse,
      reciterId: room?.reciterId,
      participantCount: remaining,
    });
  }

  @SubscribeMessage('quran_verse_sync')
  async handleQuranVerseSync(
    @MessageBody() data: { roomId: string; surahNumber: number; verseNumber: number },
    @ConnectedSocket() client: Socket,
  ) {
    if (!client.data.userId) throw new WsException('Unauthorized');
    if (!(await this.checkRateLimit(client.data.userId, 'quran_sync', 30, 60))) return;
    const dto = plainToInstance(QuranRoomVerseSyncDto, data);
    const errors = await validate(dto);
    if (errors.length > 0) {
      client.emit('error', { message: 'Invalid quran_verse_sync data' });
      return;
    }

    const userId = client.data.userId;
    const room = await this.getQuranRoom(dto.roomId);
    if (!room || room.hostId !== userId) return; // Only host can sync

    await this.redis.hmset(this.quranRoomKey(dto.roomId), {
      currentSurah: String(dto.surahNumber),
      currentVerse: String(dto.verseNumber),
    });

    this.server.to(`quran:${dto.roomId}`).emit('quran_verse_changed', {
      surahNumber: dto.surahNumber,
      verseNumber: dto.verseNumber,
    });
  }

  @SubscribeMessage('quran_reciter_change')
  async handleQuranReciterChange(
    @MessageBody() data: { roomId: string; reciterId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!client.data.userId) throw new WsException('Unauthorized');
    if (!(await this.checkRateLimit(client.data.userId, 'quran_reciter', 10, 60))) return;
    const dto = plainToInstance(QuranRoomReciterChangeDto, data);
    const errors = await validate(dto);
    if (errors.length > 0) {
      client.emit('error', { message: 'Invalid quran_reciter_change data' });
      return;
    }

    const userId = client.data.userId;
    const room = await this.getQuranRoom(dto.roomId);
    if (!room || room.hostId !== userId) return; // Only host

    await this.redis.hset(this.quranRoomKey(dto.roomId), 'reciterId', dto.reciterId);

    this.server.to(`quran:${dto.roomId}`).emit('quran_reciter_updated', {
      reciterId: dto.reciterId,
    });
  }

  // Finding #350-351: Join/leave content rooms for real-time updates
  @SubscribeMessage('join_content')
  async handleJoinContent(
    @MessageBody() data: { contentId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!client.data.userId || !data?.contentId) return;
    if (!(await this.checkRateLimit(client.data.userId, 'content_join', 30, 60))) return;

    // Verify the content exists and is accessible (not removed, not from banned user)
    const contentId = data.contentId;
    const [post, reel, thread] = await Promise.all([
      this.prisma.post.findUnique({ where: { id: contentId }, select: { isRemoved: true, visibility: true, user: { select: { isBanned: true, isDeleted: true } } } }).catch(() => null),
      this.prisma.reel.findUnique({ where: { id: contentId }, select: { isRemoved: true, user: { select: { isBanned: true, isDeleted: true } } } }).catch(() => null),
      this.prisma.thread.findUnique({ where: { id: contentId }, select: { isRemoved: true, visibility: true, user: { select: { isBanned: true, isDeleted: true } } } }).catch(() => null),
    ]);
    const content = post || reel || thread;
    if (!content || content.isRemoved || content.user?.isBanned || content.user?.isDeleted) {
      client.emit('error', { message: 'Content not found' });
      return;
    }

    client.join(`content:${contentId}`);
  }

  @SubscribeMessage('leave_content')
  async handleLeaveContent(
    @MessageBody() data: { contentId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!client.data.userId || !data?.contentId) return;
    if (!(await this.checkRateLimit(client.data.userId, 'content_leave', 30, 60))) return;
    client.leave(`content:${data.contentId}`);
  }

  /**
   * Subscribe to presence updates for specific users.
   * Clients join `user:{targetUserId}` rooms to receive presence events.
   * This replaces per-conversation fan-out with targeted subscriptions.
   */
  @SubscribeMessage('subscribe_presence')
  async handleSubscribePresence(
    @MessageBody() data: { userIds: string[] },
    @ConnectedSocket() client: Socket,
  ) {
    if (!client.data.userId) return;
    if (!Array.isArray(data?.userIds)) return;
    if (!(await this.checkRateLimit(client.data.userId, 'sub_presence', 10, 60))) return;

    // Limit to 200 subscriptions per request to prevent abuse
    const ids = data.userIds.slice(0, 200);

    // X07-#6 / X02-#1 FIX: Only allow subscribing to presence of users who share a conversation.
    // Prevents: blocked users tracking victims, arbitrary presence surveillance.
    // Get all conversation partners of the requesting user.
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId: client.data.userId },
      select: { conversationId: true },
      take: 500,
    });
    const conversationIds = memberships.map(m => m.conversationId);

    // Find which of the requested userIds share at least one conversation
    const allowedPartners = conversationIds.length > 0
      ? await this.prisma.conversationMember.findMany({
          where: {
            conversationId: { in: conversationIds },
            userId: { in: ids, not: client.data.userId },
          },
          select: { userId: true },
          distinct: ['userId'],
        })
      : [];
    const allowedSet = new Set(allowedPartners.map(p => p.userId));

    for (const targetId of ids) {
      if (typeof targetId === 'string' && targetId.length > 0 && allowedSet.has(targetId)) {
        client.join(`user:${targetId}`);
      }
    }
  }

  /**
   * Unsubscribe from presence updates for specific users.
   */
  @SubscribeMessage('unsubscribe_presence')
  async handleUnsubscribePresence(
    @MessageBody() data: { userIds: string[] },
    @ConnectedSocket() client: Socket,
  ) {
    if (!client.data.userId) return;
    if (!Array.isArray(data?.userIds)) return;
    if (!(await this.checkRateLimit(client.data.userId, 'unsub_presence', 10, 60))) return;

    for (const targetId of data.userIds) {
      if (typeof targetId === 'string' && targetId.length > 0) {
        client.leave(`user:${targetId}`);
      }
    }
  }

  private extractToken(client: Socket): string | undefined {
    const auth = client.handshake.auth?.token ?? client.handshake.headers?.authorization;
    if (!auth) return undefined;
    const [type, token] = auth.split(' ');
    return type === 'Bearer' ? token : auth;
  }
}
