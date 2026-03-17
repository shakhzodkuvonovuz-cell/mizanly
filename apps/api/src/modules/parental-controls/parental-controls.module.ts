import { Module } from '@nestjs/common';
import { ParentalControlsController } from './parental-controls.controller';
import { ParentalControlsService } from './parental-controls.service';

@Module({
  controllers: [ParentalControlsController],
  providers: [ParentalControlsService],
  exports: [ParentalControlsService],
})
export class ParentalControlsModule {}
