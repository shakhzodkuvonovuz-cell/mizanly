import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { PrismaModule } from '../../config/prisma.module';
import { QueueModule } from '../../common/queue/queue.module';

@Module({
  imports: [PrismaModule, QueueModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}