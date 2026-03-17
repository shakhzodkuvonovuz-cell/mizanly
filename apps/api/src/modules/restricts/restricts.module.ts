import { Module } from '@nestjs/common';
import { RestrictsController } from './restricts.controller';
import { RestrictsService } from './restricts.service';

@Module({
  controllers: [RestrictsController],
  providers: [RestrictsService],
  exports: [RestrictsService],
})
export class RestrictsModule {}
