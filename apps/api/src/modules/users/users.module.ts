import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PrivacyModule } from '../privacy/privacy.module';
import { ModerationModule } from '../moderation/moderation.module';

@Module({
  imports: [PrivacyModule, ModerationModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
