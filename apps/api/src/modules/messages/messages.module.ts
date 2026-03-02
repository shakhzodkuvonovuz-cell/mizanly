import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { ChatGateway } from '../../gateways/chat.gateway';
@Module({ controllers: [MessagesController], providers: [MessagesService, ChatGateway], exports: [MessagesService] })
export class MessagesModule {}
