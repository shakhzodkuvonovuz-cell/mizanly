import { Module } from '@nestjs/common';
import { StickersService } from './stickers.service';
import { StickersController } from './stickers.controller';
import { PrismaModule } from '../../config/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StickersController],
  providers: [StickersService],
  exports: [StickersService],
})
export class StickersModule {}