import { Module } from '@nestjs/common';
import { DownloadsService } from './downloads.service';
import { DownloadsController } from './downloads.controller';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [UploadModule],
  controllers: [DownloadsController],
  providers: [DownloadsService],
  exports: [DownloadsService],
})
export class DownloadsModule {}
