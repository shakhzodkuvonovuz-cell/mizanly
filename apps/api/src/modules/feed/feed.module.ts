import { Module } from '@nestjs/common';
import { FeedService } from './feed.service';
import { FeedTransparencyService } from './feed-transparency.service';
import { PersonalizedFeedService } from './personalized-feed.service';
import { FeedController } from './feed.controller';
import { EmbeddingsModule } from '../embeddings/embeddings.module';

@Module({
  imports: [EmbeddingsModule],
  controllers: [FeedController],
  providers: [FeedService, FeedTransparencyService, PersonalizedFeedService],
  exports: [FeedService, FeedTransparencyService, PersonalizedFeedService],
})
export class FeedModule {}