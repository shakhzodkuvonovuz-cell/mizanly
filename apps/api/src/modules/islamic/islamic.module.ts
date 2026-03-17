import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma.module';
import { IslamicController } from './islamic.controller';
import { IslamicService } from './islamic.service';

@Module({
  imports: [PrismaModule],
  controllers: [IslamicController],
  providers: [IslamicService],
  exports: [IslamicService],
})
export class IslamicModule {}