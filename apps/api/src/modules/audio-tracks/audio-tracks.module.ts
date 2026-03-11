import { Module } from '@nestjs/common';
import { AudioTracksService } from './audio-tracks.service';
import { AudioTracksController } from './audio-tracks.controller';
import { PrismaModule } from '../../config/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AudioTracksController],
  providers: [AudioTracksService],
  exports: [AudioTracksService],
})
export class AudioTracksModule {}