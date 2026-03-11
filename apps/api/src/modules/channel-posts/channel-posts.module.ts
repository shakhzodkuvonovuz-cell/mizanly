import { Module } from '@nestjs/common';
import { ChannelPostsService } from './channel-posts.service';
import { ChannelPostsController } from './channel-posts.controller';
import { PrismaModule } from '../../config/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ChannelPostsController],
  providers: [ChannelPostsService],
  exports: [ChannelPostsService],
})
export class ChannelPostsModule {}