import {
  Controller, Post, Get, Patch, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TelegramFeaturesService } from './telegram-features.service';
import {
  SaveMessageDto, ReorderChatFoldersDto, CreateChatFolderDto, UpdateChatFolderDto,
  SetSlowModeDto, CreateTopicDto, UpdateTopicDto,
  CreateEmojiPackDto, AddEmojiDto,
} from './dto/telegram-features.dto';

@ApiTags('Telegram Features')
@Controller()
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class TelegramFeaturesController {
  constructor(private service: TelegramFeaturesService) {}

  // ── Saved Messages ──────────────────────────────────────

  @Get('saved-messages/search')
  @ApiOperation({ summary: 'Search saved messages' })
  searchSavedMessages(@CurrentUser('id') userId: string, @Query('q') query: string) {
    return this.service.searchSavedMessages(userId, query);
  }

  @Get('saved-messages')
  @ApiOperation({ summary: 'Get saved messages (cloud notepad)' })
  getSavedMessages(@CurrentUser('id') userId: string, @Query('cursor') cursor?: string) {
    return this.service.getSavedMessages(userId, cursor);
  }

  @Post('saved-messages')
  @ApiOperation({ summary: 'Save a message' })
  saveMessage(@CurrentUser('id') userId: string, @Body() dto: SaveMessageDto) {
    return this.service.saveMessage(userId, dto);
  }

  @Patch('saved-messages/:id/pin')
  @ApiOperation({ summary: 'Toggle pin on saved message' })
  pinSavedMessage(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.pinSavedMessage(userId, id);
  }

  @Delete('saved-messages/:id')
  @ApiOperation({ summary: 'Delete saved message' })
  deleteSavedMessage(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.deleteSavedMessage(userId, id);
  }

  // ── Chat Folders ────────────────────────────────────────

  @Patch('chat-folders/reorder')
  @ApiOperation({ summary: 'Reorder chat folders' })
  reorderChatFolders(@CurrentUser('id') userId: string, @Body() dto: ReorderChatFoldersDto) {
    return this.service.reorderChatFolders(userId, dto.folderIds);
  }

  @Get('chat-folders')
  @ApiOperation({ summary: 'Get chat folders' })
  getChatFolders(@CurrentUser('id') userId: string) {
    return this.service.getChatFolders(userId);
  }

  @Post('chat-folders')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Create chat folder' })
  createChatFolder(@CurrentUser('id') userId: string, @Body() dto: CreateChatFolderDto) {
    return this.service.createChatFolder(userId, dto);
  }

  @Patch('chat-folders/:id')
  @ApiOperation({ summary: 'Update chat folder' })
  updateChatFolder(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: UpdateChatFolderDto) {
    return this.service.updateChatFolder(userId, id, dto);
  }

  @Delete('chat-folders/:id')
  @ApiOperation({ summary: 'Delete chat folder' })
  deleteChatFolder(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.deleteChatFolder(userId, id);
  }

  // ── Slow Mode ───────────────────────────────────────────

  @Patch('conversations/:id/slow-mode')
  @ApiOperation({ summary: 'Set slow mode on group' })
  setSlowMode(@CurrentUser('id') userId: string, @Param('id') conversationId: string, @Body() dto: SetSlowModeDto) {
    return this.service.setSlowMode(conversationId, userId, dto.seconds);
  }

  // ── Admin Log ───────────────────────────────────────────

  @Get('conversations/:id/admin-log')
  @ApiOperation({ summary: 'Get admin event log' })
  getAdminLog(@CurrentUser('id') userId: string, @Param('id') conversationId: string, @Query('cursor') cursor?: string) {
    return this.service.getAdminLog(conversationId, userId, cursor);
  }

  // ── Group Topics ────────────────────────────────────────

  @Post('conversations/:id/topics')
  @ApiOperation({ summary: 'Create topic in group' })
  createTopic(@CurrentUser('id') userId: string, @Param('id') conversationId: string, @Body() dto: CreateTopicDto) {
    return this.service.createTopic(conversationId, userId, dto);
  }

  @Get('conversations/:id/topics')
  @ApiOperation({ summary: 'Get group topics' })
  getTopics(@Param('id') conversationId: string) {
    return this.service.getTopics(conversationId);
  }

  @Patch('topics/:id')
  @ApiOperation({ summary: 'Update topic' })
  updateTopic(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: UpdateTopicDto) {
    return this.service.updateTopic(id, userId, dto);
  }

  @Delete('topics/:id')
  @ApiOperation({ summary: 'Delete topic' })
  deleteTopic(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.deleteTopic(id, userId);
  }

  // ── Custom Emoji Packs ──────────────────────────────────

  @Get('emoji-packs/me')
  @ApiOperation({ summary: 'Get my emoji packs' })
  getMyEmojiPacks(@CurrentUser('id') userId: string) {
    return this.service.getMyEmojiPacks(userId);
  }

  @Post('emoji-packs')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Create emoji pack' })
  createEmojiPack(@CurrentUser('id') userId: string, @Body() dto: CreateEmojiPackDto) {
    return this.service.createEmojiPack(userId, dto);
  }

  @Post('emoji-packs/:id/emojis')
  @ApiOperation({ summary: 'Add emoji to pack' })
  addEmoji(@CurrentUser('id') userId: string, @Param('id') packId: string, @Body() dto: AddEmojiDto) {
    return this.service.addEmojiToPack(packId, userId, dto);
  }

  @Get('emoji-packs')
  @ApiOperation({ summary: 'Browse emoji packs' })
  getEmojiPacks(@Query('cursor') cursor?: string) {
    return this.service.getEmojiPacks(cursor);
  }
}
