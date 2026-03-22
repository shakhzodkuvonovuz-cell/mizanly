import { Module } from '@nestjs/common';
import { AudioTracksService } from './audio-tracks.service';
import { AudioTracksController } from './audio-tracks.controller';

@Module({
  controllers: [AudioTracksController],
  providers: [AudioTracksService],
  exports: [AudioTracksService],
})
export class AudioTracksModule {}