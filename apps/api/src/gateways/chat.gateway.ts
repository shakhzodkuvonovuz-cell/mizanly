import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayConnection, OnGatewayDisconnect, MessageBody, ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MessagesService } from '../modules/messages/messages.service';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/chat' })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(private messagesService: MessagesService) {}

  handleConnection(client: Socket) {
    const userId = client.handshake.auth?.userId;
    if (userId) client.join(`user:${userId}`);
  }

  handleDisconnect(client: Socket) {}

  @SubscribeMessage('join_conversation')
  handleJoin(@ConnectedSocket() client: Socket, @MessageBody() data: { conversationId: string }) {
    client.join(`conversation:${data.conversationId}`);
  }

  @SubscribeMessage('send_message')
  async handleMessage(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    const message = await this.messagesService.sendMessage(
      data.conversationId, data.senderId, data.content, data.type, data.mediaUrl, data.replyToId,
    );
    this.server.to(`conversation:${data.conversationId}`).emit('new_message', message);
    return message;
  }

  @SubscribeMessage('typing')
  handleTyping(@ConnectedSocket() client: Socket, @MessageBody() data: { conversationId: string; userId: string }) {
    client.to(`conversation:${data.conversationId}`).emit('user_typing', { userId: data.userId });
  }

  @SubscribeMessage('read')
  async handleRead(@ConnectedSocket() client: Socket, @MessageBody() data: { conversationId: string; userId: string }) {
    await this.messagesService.markRead(data.conversationId, data.userId);
    this.server.to(`conversation:${data.conversationId}`).emit('messages_read', { userId: data.userId });
  }
}
