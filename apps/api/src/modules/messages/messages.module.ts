import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { ChatGateway } from '../../gateways/chat.gateway';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiModule } from '../ai/ai.module';
@Module({ imports: [NotificationsModule, AiModule], controllers: [MessagesController], providers: [MessagesService, ChatGateway], exports: [MessagesService] })
export class MessagesModule {}
