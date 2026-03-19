import { Throttle } from '@nestjs/throttler';
import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { WebhooksService } from './webhooks.service';

@ApiTags('Webhooks')
@Throttle({ default: { limit: 20, ttl: 60000 } })
@Controller('webhooks')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class WebhooksController {
  constructor(private webhooks: WebhooksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a webhook' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() body: { circleId: string; name: string; url: string; events: string[] },
  ) {
    return this.webhooks.create(userId, body);
  }

  @Get()
  @ApiOperation({ summary: 'List webhooks for a community' })
  async list(@Query('circleId') circleId: string) {
    return this.webhooks.list(circleId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a webhook' })
  async delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.webhooks.delete(id, userId);
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Test a webhook delivery' })
  async test(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.webhooks.test(id, userId);
  }
}
