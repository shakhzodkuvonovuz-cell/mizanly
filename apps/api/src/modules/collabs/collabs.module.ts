import { Module } from '@nestjs/common';
import { CollabsService } from './collabs.service';
import { CollabsController } from './collabs.controller';
import { PrismaModule } from '../../config/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CollabsController],
  providers: [CollabsService],
  exports: [CollabsService],
})
export class CollabsModule {}