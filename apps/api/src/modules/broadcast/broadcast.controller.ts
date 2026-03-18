import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BroadcastService } from './broadcast.service';
import { CreateBroadcastChannelDto } from './dto/create-channel.dto';
import { SendBroadcastDto } from './dto/send-broadcast.dto';

@ApiTags('Broadcast Channels')
@Controller('broadcast')
export class BroadcastController {
  constructor(private broadcast: BroadcastService) {}

  // ── Static routes first (before any :id / :slug wildcard) ──

  @Post()
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Create broadcast channel' })
  async create(@CurrentUser('id') userId: string, @Body() dto: CreateBroadcastChannelDto) {
    return this.broadcast.create(userId, dto);
  }

  @Get('discover')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Discover popular channels' })
  async discover(@Query('cursor') cursor?: string) {
    return this.broadcast.discover(cursor);
  }

  @Get('my')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my subscribed channels' })
  async myChannels(@CurrentUser('id') userId: string) {
    return this.broadcast.getMyChannels(userId);
  }

  // ── Static "messages/" routes before :id wildcard ──

  @Patch('messages/:messageId/pin')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Pin message' })
  async pinMessage(@Param('messageId') messageId: string, @CurrentUser('id') userId: string) {
    return this.broadcast.pinMessage(messageId, userId);
  }

  @Delete('messages/:messageId/pin')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unpin message' })
  async unpinMessage(@Param('messageId') messageId: string, @CurrentUser('id') userId: string) {
    return this.broadcast.unpinMessage(messageId, userId);
  }

  @Delete('messages/:messageId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete message' })
  async deleteMessage(@Param('messageId') messageId: string, @CurrentUser('id') userId: string) {
    return this.broadcast.deleteMessage(messageId, userId);
  }

  // ── Wildcard :slug / :id routes ──

  @Get(':slug')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get channel by slug' })
  async getBySlug(@Param('slug') slug: string) {
    return this.broadcast.getBySlug(slug);
  }

  @Patch(':id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update channel' })
  async update(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: Partial<CreateBroadcastChannelDto>) {
    return this.broadcast.update(id, userId, dto);
  }

  @Delete(':id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete channel' })
  async delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.broadcast.delete(id, userId);
  }

  @Post(':id/subscribe')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Subscribe to channel' })
  async subscribe(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.broadcast.subscribe(id, userId);
  }

  @Delete(':id/subscribe')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unsubscribe from channel' })
  async unsubscribe(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.broadcast.unsubscribe(id, userId);
  }

  @Get(':id/subscribers')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List subscribers' })
  async subscribers(@Param('id') id: string, @Query('cursor') cursor?: string) {
    return this.broadcast.getSubscribers(id, cursor);
  }

  @Post(':id/messages')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Send message to channel' })
  async sendMessage(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: SendBroadcastDto) {
    return this.broadcast.sendMessage(id, userId, dto);
  }

  @Get(':id/messages')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get channel messages' })
  async getMessages(@Param('id') id: string, @Query('cursor') cursor?: string) {
    return this.broadcast.getMessages(id, cursor);
  }

  @Get(':id/pinned')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get pinned messages' })
  async getPinned(@Param('id') id: string) {
    return this.broadcast.getPinnedMessages(id);
  }

  @Patch(':id/mute')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mute/unmute channel' })
  async mute(@Param('id') id: string, @CurrentUser('id') userId: string, @Body('muted') muted: boolean) {
    return this.broadcast.muteChannel(id, userId, muted);
  }

  @Post(':id/promote/:targetUserId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Promote subscriber to admin' })
  async promote(@Param('id') id: string, @Param('targetUserId') targetUserId: string, @CurrentUser('id') userId: string) {
    return this.broadcast.promoteToAdmin(id, userId, targetUserId);
  }

  @Post(':id/demote/:targetUserId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Demote admin to subscriber' })
  async demote(@Param('id') id: string, @Param('targetUserId') targetUserId: string, @CurrentUser('id') userId: string) {
    return this.broadcast.demoteFromAdmin(id, userId, targetUserId);
  }

  @Delete(':id/subscribers/:targetUserId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove subscriber' })
  async removeSubscriber(@Param('id') id: string, @Param('targetUserId') targetUserId: string, @CurrentUser('id') userId: string) {
    return this.broadcast.removeSubscriber(id, userId, targetUserId);
  }
}
