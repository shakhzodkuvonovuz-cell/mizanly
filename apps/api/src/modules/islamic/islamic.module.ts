import { Module } from '@nestjs/common';
import { IslamicController } from './islamic.controller';
import { IslamicService } from './islamic.service';

@Module({
  controllers: [IslamicController],
  providers: [IslamicService],
  exports: [IslamicService],
})
export class IslamicModule {}