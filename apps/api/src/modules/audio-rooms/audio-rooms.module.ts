import { Module } from '@nestjs/common';
import { AudioRoomsController } from './audio-rooms.controller';
import { AudioRoomsService } from './audio-rooms.service';

@Module({
  imports: [],
  controllers: [AudioRoomsController],
  providers: [AudioRoomsService],
  exports: [AudioRoomsService],
})
export class AudioRoomsModule {}