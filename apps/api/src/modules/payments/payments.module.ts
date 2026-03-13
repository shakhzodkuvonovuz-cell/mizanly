import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { PrismaModule } from '../../config/prisma.module';
import { RedisModule } from '../../config/redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [PaymentsController, StripeWebhookController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}