import { Module } from '@nestjs/common';
import { VideoRepliesController } from './video-replies.controller';
import { VideoRepliesService } from './video-replies.service';

@Module({
  controllers: [VideoRepliesController],
  providers: [VideoRepliesService],
  exports: [VideoRepliesService],
})
export class VideoRepliesModule {}
