import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PrivacyModule } from '../privacy/privacy.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrivacyModule, NotificationsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
