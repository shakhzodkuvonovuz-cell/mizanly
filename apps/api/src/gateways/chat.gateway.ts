import { Inject, Logger } from '@nestjs/common';
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
import {
  WsJoinConversationDto,
  WsTypingDto,
  WsReadDto,
  WsCallInitiateDto,
  WsCallAnswerDto,
  WsCallRejectDto,
  WsCallEndDto,
  WsCallSignalDto,
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
      // Dynamic CORS check — reads env at request time, not decorator evaluation time
      const allowed = process.env.CORS_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) || [];
      if (!origin || allowed.length === 0 || allowed.includes(origin)) {
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
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
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

  constructor(
    private messagesService: MessagesService,
    private prisma: PrismaService,
    private config: ConfigService,
    @Inject('REDIS') private redis: Redis,
  ) {}

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

  private async checkRateLimit(userId: string, event = 'message', limit = 30, windowSec = 60): Promise<boolean> {
    const key = `ws:ratelimit:${event}:${userId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, windowSec);
    return count <= limit;
  }

  async handleConnection(client: Socket) {
    try {
      // Rate limit connections per IP (max 10/min) to prevent connection floods
      const ip = client.handshake.headers['x-forwarded-for']?.toString().split(',')[0]?.trim()
        || client.handshake.address || 'unknown';
      const connKey = `ws:conn:${ip}`;
      const connCount = await this.redis.incr(connKey);
      if (connCount === 1) await this.redis.expire(connKey, 60);
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
      await this.redis.sadd(presenceKey, client.id);
      await this.redis.expire(presenceKey, this.PRESENCE_TTL);

      // Start heartbeat to keep presence alive while connected
      const timer = setInterval(async () => {
        try {
          await this.redis.expire(presenceKey, this.PRESENCE_TTL);
        } catch {
          // Redis unavailable — presence will expire naturally
        }
      }, this.HEARTBEAT_INTERVAL);
      this.heartbeatTimers.set(client.id, timer);

      // Broadcast online status only to user's conversations, not globally
      const memberships = await this.prisma.conversationMember.findMany({
        where: { userId: user.id },
        select: { conversationId: true },
        take: 100,
      });
      for (const m of memberships) {
        client.to(`conversation:${m.conversationId}`).emit('user_online', { userId, isOnline: true });
      }

      client.join(`user:${user.id}`);
    } catch {
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
          // Room empty — clean up
          await this.redis.del(this.quranRoomKey(roomId), partKey);
        } else {
          // Broadcast updated participant count
          const room = await this.getQuranRoom(roomId);
          this.server.to(`quran:${roomId}`).emit('quran_room_update', {
            roomId,
            hostId: room?.hostId,
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
      // Broadcast offline only to user's conversations, not globally
      const memberships = await this.prisma.conversationMember.findMany({
        where: { userId },
        select: { conversationId: true },
        take: 100,
      });
      for (const m of memberships) {
        this.server.to(`conversation:${m.conversationId}`).emit('user_offline', { userId, isOnline: false });
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
    @MessageBody() data: {
      conversationId: string;
      content?: string;
      messageType?: string;
      mediaUrl?: string;
      mediaType?: string;
      replyToId?: string;
      isSpoiler?: boolean;
      isViewOnce?: boolean;
    },
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
        },
      );
    } catch {
      throw new WsException('Failed to send message');
    }

    this.server
      .to(`conversation:${dto.conversationId}`)
      .emit('new_message', message);

    return message;
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
    client.to(`conversation:${dto.conversationId}`).emit('user_typing', {
      userId: client.data.userId,
      isTyping: dto.isTyping,
    });
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

  @SubscribeMessage('call_initiate')
  async handleCallInitiate(@ConnectedSocket() client: Socket, @MessageBody() data: { targetUserId: string; callType: string; sessionId: string }) {
    if (!client.data.userId) throw new WsException('Unauthorized');
    if (!(await this.checkRateLimit(client.data.userId, 'call', 3, 60))) return;
    const dto = plainToInstance(WsCallInitiateDto, data);
    const errors = await validate(dto);
    if (errors.length > 0) {
      client.emit('error', { message: 'Invalid call_initiate data' });
      return;
    }
    // Block check
    const blocked = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: client.data.userId, blockedId: dto.targetUserId },
          { blockerId: dto.targetUserId, blockedId: client.data.userId },
        ],
      },
    });
    if (blocked) {
      client.emit('error', { message: 'Cannot call this user' });
      return;
    }
    const targetSockets = await this.getUserSockets(dto.targetUserId);
    if (targetSockets.length > 0) {
      for (const socketId of targetSockets) {
        this.server.to(socketId).emit('incoming_call', { sessionId: dto.sessionId, callType: dto.callType, callerId: client.data.userId });
      }
    }
  }

  @SubscribeMessage('call_answer')
  async handleCallAnswer(@ConnectedSocket() client: Socket, @MessageBody() data: { sessionId: string; callerId: string }) {
    if (!client.data.userId) throw new WsException('Unauthorized');
    if (!(await this.checkRateLimit(client.data.userId, 'call', 10, 60))) return;
    const dto = plainToInstance(WsCallAnswerDto, data);
    const errors = await validate(dto);
    if (errors.length > 0) {
      client.emit('error', { message: 'Invalid call_answer data' });
      return;
    }
    // Block check — prevent answering calls from/to blocked users
    const blocked = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: client.data.userId, blockedId: dto.callerId },
          { blockerId: dto.callerId, blockedId: client.data.userId },
        ],
      },
    });
    if (blocked) {
      client.emit('error', { message: 'Cannot interact with this user' });
      return;
    }
    const callerSockets = await this.getUserSockets(dto.callerId);
    if (callerSockets.length > 0) { for (const s of callerSockets) { this.server.to(s).emit('call_answered', { sessionId: dto.sessionId, answeredBy: client.data.userId }); } }
  }

  @SubscribeMessage('call_reject')
  async handleCallReject(@ConnectedSocket() client: Socket, @MessageBody() data: { sessionId: string; callerId: string }) {
    if (!client.data.userId) throw new WsException('Unauthorized');
    if (!(await this.checkRateLimit(client.data.userId, 'call', 10, 60))) return;
    const dto = plainToInstance(WsCallRejectDto, data);
    const errors = await validate(dto);
    if (errors.length > 0) {
      client.emit('error', { message: 'Invalid call_reject data' });
      return;
    }
    // Block check — prevent rejecting calls to reveal blocked status info
    const blocked = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: client.data.userId, blockedId: dto.callerId },
          { blockerId: dto.callerId, blockedId: client.data.userId },
        ],
      },
    });
    if (blocked) {
      client.emit('error', { message: 'Cannot interact with this user' });
      return;
    }
    const callerSockets = await this.getUserSockets(dto.callerId);
    if (callerSockets.length > 0) { for (const s of callerSockets) { this.server.to(s).emit('call_rejected', { sessionId: dto.sessionId, rejectedBy: client.data.userId }); } }
  }

  @SubscribeMessage('call_end')
  async handleCallEnd(@ConnectedSocket() client: Socket, @MessageBody() data: { sessionId: string; participants: string[] }) {
    if (!client.data.userId) throw new WsException('Unauthorized');
    if (!(await this.checkRateLimit(client.data.userId, 'call', 10, 60))) return;
    const dto = plainToInstance(WsCallEndDto, data);
    const errors = await validate(dto);
    if (errors.length > 0) {
      client.emit('error', { message: 'Invalid call_end data' });
      return;
    }
    for (const pid of dto.participants) {
      const sockets = await this.getUserSockets(pid);
      for (const s of sockets) { this.server.to(s).emit('call_ended', { sessionId: dto.sessionId, endedBy: client.data.userId }); }
    }
  }

  @SubscribeMessage('call_signal')
  async handleCallSignal(@ConnectedSocket() client: Socket, @MessageBody() data: { targetUserId: string; signal: unknown }) {
    if (!client.data.userId) throw new WsException('Unauthorized');
    if (!(await this.checkRateLimit(client.data.userId, 'signal', 60, 10))) return;
    // Reject signal payloads larger than 64 KB
    const signalSize = JSON.stringify(data.signal ?? '').length;
    if (signalSize > 65536) {
      client.emit('error', { message: 'Signal payload too large (max 64KB)' });
      return;
    }
    const dto = plainToInstance(WsCallSignalDto, data);
    const errors = await validate(dto);
    if (errors.length > 0) {
      client.emit('error', { message: 'Invalid call_signal data' });
      return;
    }
    // Block check — prevent WebRTC signaling to/from blocked users (IP leak prevention)
    const blocked = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: client.data.userId, blockedId: dto.targetUserId },
          { blockerId: dto.targetUserId, blockedId: client.data.userId },
        ],
      },
    });
    if (blocked) {
      client.emit('error', { message: 'Cannot signal this user' });
      return;
    }
    const targetSockets = await this.getUserSockets(dto.targetUserId);
    if (targetSockets.length > 0) { for (const s of targetSockets) { this.server.to(s).emit('call_signal', { fromUserId: client.data.userId, signal: dto.signal }); } }
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
    this.prisma.message.updateMany({
      where: { id: dto.messageId, conversationId: dto.conversationId },
      data: { deliveredAt: now },
    }).catch((e) => this.logger.error('Failed to update delivery', e));

    // Emit delivery receipt only to the message sender, not the entire room (F11 — privacy)
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

    // Add participant and track on socket for disconnect cleanup
    const partKey = this.quranParticipantsKey(roomId);
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

    // Clean up empty rooms
    const remaining = await this.redis.scard(partKey);
    if (remaining === 0) {
      await this.redis.del(this.quranRoomKey(roomId), partKey);
      return;
    }

    const room = await this.getQuranRoom(roomId);
    this.server.to(`quran:${roomId}`).emit('quran_room_update', {
      roomId,
      hostId: room?.hostId,
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

  private extractToken(client: Socket): string | undefined {
    const auth = client.handshake.auth?.token ?? client.handshake.headers?.authorization;
    if (!auth) return undefined;
    const [type, token] = auth.split(' ');
    return type === 'Bearer' ? token : auth;
  }
}
