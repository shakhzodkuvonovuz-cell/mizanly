import { Module } from '@nestjs/common';
import { ReelTemplatesController } from './reel-templates.controller';
import { ReelTemplatesService } from './reel-templates.service';

@Module({
  controllers: [ReelTemplatesController],
  providers: [ReelTemplatesService],
  exports: [ReelTemplatesService],
})
export class ReelTemplatesModule {}
