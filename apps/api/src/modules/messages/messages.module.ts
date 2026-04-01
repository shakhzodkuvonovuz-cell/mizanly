import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { InternalE2EController } from './internal-e2e.controller';
import { MessagesService } from './messages.service';
import { ChatGateway } from '../../gateways/chat.gateway';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiModule } from '../ai/ai.module';
import { ModerationModule } from '../moderation/moderation.module';
@Module({ imports: [NotificationsModule, AiModule, ModerationModule], controllers: [MessagesController, InternalE2EController], providers: [MessagesService, ChatGateway], exports: [MessagesService] })
export class MessagesModule {}
