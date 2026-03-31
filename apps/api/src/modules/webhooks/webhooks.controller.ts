import { Throttle } from '@nestjs/throttler';
import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsUrl, IsArray, ArrayMaxSize, MaxLength } from 'class-validator';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { WebhooksService } from './webhooks.service';

class ListWebhooksQueryDto {
  @IsString() @IsNotEmpty() @MaxLength(50) circleId: string;
}

class CreateWebhookBodyDto {
  @IsString() @MaxLength(50) circleId: string;
  @IsString() @MaxLength(100) name: string;
  @IsUrl() url: string;
  @IsArray() @IsString({ each: true }) @ArrayMaxSize(20) @MaxLength(50, { each: true }) events: string[];
}

@ApiTags('Community Webhooks')
@Throttle({ default: { limit: 20, ttl: 60000 } })
@Controller('community-webhooks')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class CommunityWebhooksController {
  constructor(private webhooks: WebhooksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a webhook for a community' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() body: CreateWebhookBodyDto,
  ) {
    return this.webhooks.create(userId, body);
  }

  @Get()
  @ApiOperation({ summary: 'List webhooks for a community (requires membership)' })
  async list(@CurrentUser('id') userId: string, @Query() query: ListWebhooksQueryDto) {
    return this.webhooks.list(query.circleId, userId);
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
