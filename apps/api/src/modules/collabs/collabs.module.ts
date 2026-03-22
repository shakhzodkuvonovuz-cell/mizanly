import { Module } from '@nestjs/common';
import { CollabsService } from './collabs.service';
import { CollabsController } from './collabs.controller';

@Module({
  controllers: [CollabsController],
  providers: [CollabsService],
  exports: [CollabsService],
})
export class CollabsModule {}