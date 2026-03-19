import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma.module';
import { RedisModule } from '../../config/redis.module';
import { RetentionService } from './retention.service';
import { RetentionController } from './retention.controller';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [RetentionController],
  providers: [RetentionService],
  exports: [RetentionService],
})
export class RetentionModule {}
