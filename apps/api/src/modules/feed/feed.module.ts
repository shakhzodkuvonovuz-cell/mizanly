import { Module } from '@nestjs/common';
import { FeedService } from './feed.service';
import { FeedTransparencyService } from './feed-transparency.service';
import { PersonalizedFeedService } from './personalized-feed.service';
import { FeedController } from './feed.controller';
import { PrismaModule } from '../../config/prisma.module';
import { RedisModule } from '../../config/redis.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';

@Module({
  imports: [PrismaModule, RedisModule, EmbeddingsModule],
  controllers: [FeedController],
  providers: [FeedService, FeedTransparencyService, PersonalizedFeedService],
  exports: [FeedService, FeedTransparencyService, PersonalizedFeedService],
})
export class FeedModule {}