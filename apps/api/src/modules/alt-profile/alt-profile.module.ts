import { Module } from '@nestjs/common';
import { AltProfileController, AltProfileViewerController } from './alt-profile.controller';
import { AltProfileService } from './alt-profile.service';

@Module({
  controllers: [AltProfileController, AltProfileViewerController],
  providers: [AltProfileService],
  exports: [AltProfileService],
})
export class AltProfileModule {}
