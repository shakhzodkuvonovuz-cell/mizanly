import { Module } from '@nestjs/common';
import { ChatExportController } from './chat-export.controller';
import { ChatExportService } from './chat-export.service';

@Module({
  controllers: [ChatExportController],
  providers: [ChatExportService],
  exports: [ChatExportService],
})
export class ChatExportModule {}
