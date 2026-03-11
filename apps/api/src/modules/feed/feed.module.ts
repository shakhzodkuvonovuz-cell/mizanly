import { Module } from '@nestjs/common';
import { FeedService } from './feed.service';
import { FeedController } from './feed.controller';
import { PrismaModule } from '../../config/prisma.module';
import { RedisModule } from '../../config/redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [FeedController],
  providers: [FeedService],
  exports: [FeedService],
})
export class FeedModule {}