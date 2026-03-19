import { Module } from '@nestjs/common';
import { CommunityNotesController } from './community-notes.controller';
import { CommunityNotesService } from './community-notes.service';

@Module({
  controllers: [CommunityNotesController],
  providers: [CommunityNotesService],
})
export class CommunityNotesModule {}
