import { Global, Module } from '@nestjs/common';
import { AsyncJobService } from './async-jobs.service';

@Global()
@Module({
  providers: [AsyncJobService],
  exports: [AsyncJobService],
})
export class AsyncJobsModule {}
