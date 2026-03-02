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
import { createClerkClient } from '@clerk/backend';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../config/prisma.service';
import { MessagesService } from '../modules/messages/messages.service';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/chat' })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private clerk: ReturnType<typeof createClerkClient>;

  constructor(
    private messagesService: MessagesService,
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.clerk = createClerkClient({
      secretKey: this.config.get('CLERK_SECRET_KEY'),
    });
  }

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.disconnect();
        return;
      }

      const { sub: clerkId } = await this.clerk.verifyToken(token);
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
      client.join(`user:${user.id}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(_client: Socket) {}

  @SubscribeMessage('join_conversation')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!client.data.userId) throw new WsException('Unauthorized');
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

    const message = await this.messagesService.sendMessage(
      data.conversationId,
      client.data.userId,
      {
        content: data.content,
        messageType: data.messageType,
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
        replyToId: data.replyToId,
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

  private extractToken(client: Socket): string | undefined {
    const auth = client.handshake.auth?.token ?? client.handshake.headers?.authorization;
    if (!auth) return undefined;
    const [type, token] = auth.split(' ');
    return type === 'Bearer' ? token : auth;
  }
}
