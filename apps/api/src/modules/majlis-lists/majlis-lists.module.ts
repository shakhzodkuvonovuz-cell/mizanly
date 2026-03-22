import { Module } from '@nestjs/common';
import { MajlisListsController } from './majlis-lists.controller';
import { MajlisListsService } from './majlis-lists.service';

@Module({
  controllers: [MajlisListsController],
  providers: [MajlisListsService],
  exports: [MajlisListsService],
})
export class MajlisListsModule {}