import { Module } from '@nestjs/common';
import { ThreadsController } from './threads.controller';
import { ThreadsService } from './threads.service';
import { NotificationsModule } from '../notifications/notifications.module';
@Module({ imports: [NotificationsModule], controllers: [ThreadsController], providers: [ThreadsService], exports: [ThreadsService] })
export class ThreadsModule {}
