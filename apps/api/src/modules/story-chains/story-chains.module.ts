import { Module } from '@nestjs/common';
import { StoryChainsController } from './story-chains.controller';
import { StoryChainsService } from './story-chains.service';

@Module({
  controllers: [StoryChainsController],
  providers: [StoryChainsService],
  exports: [StoryChainsService],
})
export class StoryChainsModule {}
