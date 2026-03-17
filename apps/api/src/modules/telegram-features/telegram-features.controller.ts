import {
  Controller, Post, Get, Patch, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TelegramFeaturesService } from './telegram-features.service';

@ApiTags('Telegram Features')
@Controller()
export class TelegramFeaturesController {
  constructor(private service: TelegramFeaturesService) {}

  // ── Saved Messages ──────────────────────────────────────

  @Get('saved-messages')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Get saved messages (cloud notepad)' })
  getSavedMessages(@CurrentUser('id') userId: string, @Query('cursor') cursor?: string) {
    return this.service.getSavedMessages(userId, cursor);
  }

  @Post('saved-messages')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Save a message' })
  saveMessage(@CurrentUser('id') userId: string, @Body() dto: {
    content?: string; mediaUrl?: string; mediaType?: string;
    forwardedFromType?: string; forwardedFromId?: string;
  }) {
    return this.service.saveMesage(userId, dto);
  }

  @Delete('saved-messages/:id')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Delete saved message' })
  deleteSavedMessage(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.deleteSavedMessage(userId, id);
  }

  @Patch('saved-messages/:id/pin')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Toggle pin on saved message' })
  pinSavedMessage(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.pinSavedMessage(userId, id);
  }

  @Get('saved-messages/search')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Search saved messages' })
  searchSavedMessages(@CurrentUser('id') userId: string, @Query('q') query: string) {
    return this.service.searchSavedMessages(userId, query);
  }

  // ── Chat Folders ────────────────────────────────────────

  @Get('chat-folders')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Get chat folders' })
  getChatFolders(@CurrentUser('id') userId: string) {
    return this.service.getChatFolders(userId);
  }

  @Post('chat-folders')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Create chat folder' })
  createChatFolder(@CurrentUser('id') userId: string, @Body() dto: {
    name: string; icon?: string; conversationIds?: string[];
    includeGroups?: boolean; includeChannels?: boolean;
  }) {
    return this.service.createChatFolder(userId, dto);
  }

  @Patch('chat-folders/:id')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Update chat folder' })
  updateChatFolder(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: {
    name?: string; icon?: string; conversationIds?: string[];
    includeGroups?: boolean; includeChannels?: boolean;
  }) {
    return this.service.updateChatFolder(userId, id, dto);
  }

  @Delete('chat-folders/:id')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Delete chat folder' })
  deleteChatFolder(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.deleteChatFolder(userId, id);
  }

  @Patch('chat-folders/reorder')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Reorder chat folders' })
  reorderChatFolders(@CurrentUser('id') userId: string, @Body() dto: { folderIds: string[] }) {
    return this.service.reorderChatFolders(userId, dto.folderIds);
  }

  // ── Slow Mode ───────────────────────────────────────────

  @Patch('conversations/:id/slow-mode')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Set slow mode on group' })
  setSlowMode(
    @CurrentUser('id') userId: string,
    @Param('id') conversationId: string,
    @Body() dto: { seconds: number },
  ) {
    return this.service.setSlowMode(conversationId, userId, dto.seconds);
  }

  // ── Admin Log ───────────────────────────────────────────

  @Get('conversations/:id/admin-log')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Get admin event log' })
  getAdminLog(@Param('id') conversationId: string, @Query('cursor') cursor?: string) {
    return this.service.getAdminLog(conversationId, cursor);
  }

  // ── Group Topics ────────────────────────────────────────

  @Post('conversations/:id/topics')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Create topic in group' })
  createTopic(@CurrentUser('id') userId: string, @Param('id') conversationId: string,
    @Body() dto: { name: string; iconColor?: string }) {
    return this.service.createTopic(conversationId, userId, dto);
  }

  @Get('conversations/:id/topics')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Get group topics' })
  getTopics(@Param('id') conversationId: string) {
    return this.service.getTopics(conversationId);
  }

  @Patch('topics/:id')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Update topic' })
  updateTopic(@CurrentUser('id') userId: string, @Param('id') id: string,
    @Body() dto: { name?: string; iconColor?: string; isPinned?: boolean; isClosed?: boolean }) {
    return this.service.updateTopic(id, userId, dto);
  }

  @Delete('topics/:id')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Delete topic' })
  deleteTopic(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.deleteTopic(id, userId);
  }

  // ── Custom Emoji Packs ──────────────────────────────────

  @Post('emoji-packs')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Create emoji pack' })
  createEmojiPack(@CurrentUser('id') userId: string, @Body() dto: { name: string; description?: string }) {
    return this.service.createEmojiPack(userId, dto);
  }

  @Post('emoji-packs/:id/emojis')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Add emoji to pack' })
  addEmoji(@CurrentUser('id') userId: string, @Param('id') packId: string,
    @Body() dto: { shortcode: string; imageUrl: string; isAnimated?: boolean }) {
    return this.service.addEmojiToPack(packId, userId, dto);
  }

  @Get('emoji-packs')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Browse emoji packs' })
  getEmojiPacks(@Query('cursor') cursor?: string) {
    return this.service.getEmojiPacks(cursor);
  }

  @Get('emoji-packs/me')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Get my emoji packs' })
  getMyEmojiPacks(@CurrentUser('id') userId: string) {
    return this.service.getMyEmojiPacks(userId);
  }
}
