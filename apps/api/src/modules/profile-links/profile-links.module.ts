import { Module } from '@nestjs/common';
import { ProfileLinksController } from './profile-links.controller';
import { ProfileLinksService } from './profile-links.service';

@Module({
  controllers: [ProfileLinksController],
  providers: [ProfileLinksService],
  exports: [ProfileLinksService],
})
export class ProfileLinksModule {}
