import { Module } from '@nestjs/common';
import { ScholarQAController } from './scholar-qa.controller';
import { ScholarQAService } from './scholar-qa.service';

@Module({
  controllers: [ScholarQAController],
  providers: [ScholarQAService],
})
export class ScholarQAModule {}
