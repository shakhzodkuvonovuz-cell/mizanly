import { Inject } from '@nestjs/common';
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

@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGINS?.split(',') ?? [] },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private onlineUsers = new Map<string, Set<string>>(); // userId → Set<socketId>


  constructor(
    private messagesService: MessagesService,
    private prisma: PrismaService,
    private config: ConfigService,
    @Inject('REDIS') private redis: Redis,
  ) {}

  private async checkRateLimit(userId: string): Promise<boolean> {
    const key = `ws:ratelimit:${userId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 60);
    return count <= 30;
  }

  async handleConnection(client: Socket) {
    try {
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
        select: { id: true, username: true },
      });

      if (!user) {
        client.disconnect();
        return;
      }

      // Attach user id to socket data for later handlers
      client.data.userId = user.id;

      // Track user as online
      const userId = client.data.userId;
      if (!this.onlineUsers.has(userId)) {
        this.onlineUsers.set(userId, new Set());
      }
      this.onlineUsers.get(userId)!.add(client.id);

      // Broadcast to all connected clients that this user is online
      this.server.emit('user_online', { userId, isOnline: true });

      client.join(`user:${user.id}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (userId && this.onlineUsers.has(userId)) {
      this.onlineUsers.get(userId)!.delete(client.id);
      if (this.onlineUsers.get(userId)!.size === 0) {
        this.onlineUsers.delete(userId);
        // User fully offline — update lastSeenAt
        this.prisma.user.update({
          where: { id: userId },
          data: { lastSeenAt: new Date() },
        }).catch(() => {}); // Non-critical, fire-and-forget
        this.server.emit('user_offline', { userId, isOnline: false, lastSeenAt: new Date().toISOString() });
      }
    }
  }

  @SubscribeMessage('join_conversation')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!client.data.userId) throw new WsException('Unauthorized');
    try {
      await this.messagesService.requireMembership(data.conversationId, client.data.userId);
    } catch {
      throw new WsException('Not a member of this conversation');
    }
    client.join(`conversation:${data.conversationId}`);
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

    const message = await this.messagesService.sendMessage(
      dto.conversationId,
      client.data.userId,
      {
        content: dto.content,
        messageType: dto.messageType,
        mediaUrl: dto.mediaUrl,
        mediaType: dto.mediaType,
        replyToId: dto.replyToId,
      },
    );

    this.server
      .to(`conversation:${data.conversationId}`)
      .emit('new_message', message);

    return message;
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; isTyping: boolean },
  ) {
    if (!client.data.userId) throw new WsException('Unauthorized');
    client.to(`conversation:${data.conversationId}`).emit('user_typing', {
      userId: client.data.userId,
      isTyping: data.isTyping,
    });
  }

  @SubscribeMessage('read')
  async handleRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!client.data.userId) throw new WsException('Unauthorized');
    await this.messagesService.markRead(data.conversationId, client.data.userId);
    this.server
      .to(`conversation:${data.conversationId}`)
      .emit('messages_read', { userId: client.data.userId });
  }

  @SubscribeMessage('get_online_status')
  async handleGetOnlineStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userIds: string[] },
  ) {
    const statuses = data.userIds.map(id => ({
      userId: id,
      isOnline: this.onlineUsers.has(id),
    }));
    client.emit('online_status', statuses);
  }

  @SubscribeMessage('call_initiate')
  async handleCallInitiate(@ConnectedSocket() client: Socket, @MessageBody() data: { targetUserId: string; callType: string; sessionId: string }) {
    if (!client.data.userId) throw new WsException('Unauthorized');
    const targetSockets = this.onlineUsers.get(data.targetUserId);
    if (targetSockets) {
      for (const socketId of targetSockets) {
        this.server.to(socketId).emit('incoming_call', { sessionId: data.sessionId, callType: data.callType, callerId: client.data.userId });
      }
    }
  }

  @SubscribeMessage('call_answer')
  async handleCallAnswer(@ConnectedSocket() client: Socket, @MessageBody() data: { sessionId: string; callerId: string }) {
    if (!client.data.userId) throw new WsException('Unauthorized');
    const callerSockets = this.onlineUsers.get(data.callerId);
    if (callerSockets) { for (const s of callerSockets) { this.server.to(s).emit('call_answered', { sessionId: data.sessionId, answeredBy: client.data.userId }); } }
  }

  @SubscribeMessage('call_reject')
  async handleCallReject(@ConnectedSocket() client: Socket, @MessageBody() data: { sessionId: string; callerId: string }) {
    if (!client.data.userId) throw new WsException('Unauthorized');
    const callerSockets = this.onlineUsers.get(data.callerId);
    if (callerSockets) { for (const s of callerSockets) { this.server.to(s).emit('call_rejected', { sessionId: data.sessionId, rejectedBy: client.data.userId }); } }
  }

  @SubscribeMessage('call_end')
  async handleCallEnd(@ConnectedSocket() client: Socket, @MessageBody() data: { sessionId: string; participants: string[] }) {
    if (!client.data.userId) throw new WsException('Unauthorized');
    for (const pid of data.participants) {
      const sockets = this.onlineUsers.get(pid);
      if (sockets) { for (const s of sockets) { this.server.to(s).emit('call_ended', { sessionId: data.sessionId, endedBy: client.data.userId }); } }
    }
  }

  @SubscribeMessage('call_signal')
  async handleCallSignal(@ConnectedSocket() client: Socket, @MessageBody() data: { targetUserId: string; signal: unknown }) {
    if (!client.data.userId) throw new WsException('Unauthorized');
    const targetSockets = this.onlineUsers.get(data.targetUserId);
    if (targetSockets) { for (const s of targetSockets) { this.server.to(s).emit('call_signal', { fromUserId: client.data.userId, signal: data.signal }); } }
  }

  @SubscribeMessage('message_delivered')
  async handleMessageDelivered(@ConnectedSocket() client: Socket, @MessageBody() data: { messageId: string; conversationId: string }) {
    if (!client.data.userId) throw new WsException('Unauthorized');
    this.prisma.message.update({ where: { id: data.messageId }, data: { deliveredAt: new Date() } }).catch(() => {});
    this.server.to(`conversation:${data.conversationId}`).emit('delivery_receipt', { messageId: data.messageId, deliveredAt: new Date().toISOString(), deliveredTo: client.data.userId });
  }

  private extractToken(client: Socket): string | undefined {
    const auth = client.handshake.auth?.token ?? client.handshake.headers?.authorization;
    if (!auth) return undefined;
    const [type, token] = auth.split(' ');
    return type === 'Bearer' ? token : auth;
  }
}
