import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  IsString, IsOptional, IsArray, MaxLength, IsBoolean, IsEnum, IsUrl, IsUUID, ArrayMaxSize, IsNumber, IsISO8601,
} from 'class-validator';
import { MessagesService } from './messages.service';
import { MuteConversationDto } from './dto/mute-conversation.dto';
import { ArchiveConversationDto } from './dto/archive-conversation.dto';
import { CreateDmDto } from './dto/create-dm.dto';
import { CreateDMNoteDto } from './dto/dm-note.dto';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class SendMessageDto {
  @ApiProperty({ required: false, description: 'Message content (text)', maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @ApiProperty({ required: false, description: 'Message type', enum: ['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'VOICE', 'FILE', 'GIF', 'STICKER', 'LOCATION'] })
  @IsOptional()
  @IsEnum(['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'VOICE', 'FILE', 'GIF', 'STICKER', 'LOCATION'])
  messageType?: string;

  @ApiProperty({ required: false, description: 'Media URL for non-text messages' })
  @IsOptional()
  @IsUrl()
  mediaUrl?: string;

  @ApiProperty({ required: false, description: 'Media MIME type', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  mediaType?: string;

  @ApiProperty({ required: false, description: 'ID of message being replied to' })
  @IsOptional()
  @IsUUID()
  replyToId?: string;

  @ApiProperty({ required: false, description: 'Mark message content as spoiler (tap to reveal)' })
  @IsOptional()
  @IsBoolean()
  isSpoiler?: boolean;

  @ApiProperty({ required: false, description: 'View-once message (auto-deleted after viewing)' })
  @IsOptional()
  @IsBoolean()
  isViewOnce?: boolean;
}

class CreateGroupDto {
  @ApiProperty({ description: 'Group display name', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  groupName: string;

  @ApiProperty({ description: 'Array of user IDs to add to group', type: [String], maxItems: 100 })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(100)
  memberIds: string[];
}

class UpdateGroupDto {
  @ApiProperty({ required: false, description: 'Group display name', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  groupName?: string;

  @ApiProperty({ required: false, description: 'URL of group avatar image' })
  @IsOptional()
  @IsUrl()
  groupAvatarUrl?: string;
}

class AddMembersDto {
  @ApiProperty({ description: 'Array of user IDs to add to group', type: [String], maxItems: 100 })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(100)
  memberIds: string[];
}

class ReactDto {
  @ApiProperty({ description: 'Emoji reaction', maxLength: 10 })
  @IsString()
  @MaxLength(10)
  emoji: string;
}
class EditMessageDto {
  @ApiProperty({ description: 'Updated message content', maxLength: 5000 })
  @IsString()
  @MaxLength(5000)
  content: string;
}

class SetDisappearingTimerDto {
  @ApiProperty({ required: false, description: 'Duration in seconds (null to turn off)', nullable: true })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  duration?: number | null;
}

class ScheduleMessageDto {
  @ApiProperty({ description: 'Conversation ID' })
  @IsString()
  conversationId: string;

  @ApiProperty({ description: 'Message content', maxLength: 5000 })
  @IsString()
  @MaxLength(5000)
  content: string;

  @ApiProperty({ description: 'ISO 8601 scheduled date-time' })
  @IsISO8601()
  scheduledAt: string;

  @ApiProperty({ required: false, description: 'Message type', enum: ['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'VOICE', 'FILE', 'GIF', 'STICKER', 'LOCATION'] })
  @IsOptional()
  @IsEnum(['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'VOICE', 'FILE', 'GIF', 'STICKER', 'LOCATION'])
  messageType?: string;
}

@ApiTags('Messages (Risalah)')
@Controller('messages')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class MessagesController {
  constructor(private messagesService: MessagesService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'Get all conversations for current user' })
  getConversations(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: string,
  ) {
    return this.messagesService.getConversations(userId, limit ? parseInt(limit, 10) : undefined);
  }

  @Get('conversations/archived')
  @ApiOperation({ summary: 'Get archived conversations' })
  async getArchivedConversations(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.messagesService.getArchivedConversations(userId, cursor);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Get conversation details' })
  getConversation(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.messagesService.getConversation(id, userId);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Get messages in a conversation (cursor paginated)' })
  getMessages(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.messagesService.getMessages(id, userId, cursor);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Send a message' })
  sendMessage(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagesService.sendMessage(id, userId, dto);
  }

  @Delete('conversations/:id/messages/:messageId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete (unsend) a message' })
  deleteMessage(
    @Param('messageId') messageId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messagesService.deleteMessage(messageId, userId);
  }

  @Patch('conversations/:id/messages/:messageId')
  @ApiOperation({ summary: 'Edit a message (within 15 minutes)' })
  editMessage(
    @Param('messageId') messageId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: EditMessageDto,
  ) {
    return this.messagesService.editMessage(messageId, userId, dto.content);
  }


  @Post('conversations/:id/messages/:messageId/react')
  @ApiOperation({ summary: 'React to a message with emoji' })
  reactToMessage(
    @Param('messageId') messageId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ReactDto,
  ) {
    return this.messagesService.reactToMessage(messageId, userId, dto.emoji);
  }

  @Delete('conversations/:id/messages/:messageId/react')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove reaction from a message' })
  removeReaction(
    @Param('messageId') messageId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ReactDto,
  ) {
    return this.messagesService.removeReaction(messageId, userId, dto.emoji);
  }

  @Post('conversations/:id/read')
  @ApiOperation({ summary: 'Mark conversation as read' })
  markRead(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.messagesService.markRead(id, userId);
  }

  @Post('conversations/:id/mute')
  @ApiOperation({ summary: 'Mute or unmute a conversation' })
  mute(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: MuteConversationDto,
  ) {
    return this.messagesService.muteConversation(id, userId, dto.muted);
  }

  @Post('conversations/:id/archive')
  @ApiOperation({ summary: 'Archive or unarchive a conversation' })
  archive(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ArchiveConversationDto,
  ) {
    return this.messagesService.archiveConversation(id, userId, dto.archived);
  }

  @Post('dm')
  @ApiOperation({ summary: 'Create or retrieve a DM conversation' })
  createDM(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateDmDto,
  ) {
    return this.messagesService.createDM(userId, dto.targetUserId);
  }

  @Post('groups')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a group conversation' })
  createGroup(@CurrentUser('id') userId: string, @Body() dto: CreateGroupDto) {
    return this.messagesService.createGroup(userId, dto.groupName, dto.memberIds);
  }

  @Patch('groups/:id')
  @ApiOperation({ summary: 'Update group name or avatar' })
  updateGroup(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.messagesService.updateGroup(id, userId, dto);
  }

  @Post('groups/:id/members')
  @ApiOperation({ summary: 'Add members to group' })
  addMembers(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: AddMembersDto,
  ) {
    return this.messagesService.addGroupMembers(id, userId, dto.memberIds);
  }

  @Delete('groups/:id/members/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove member from group (creator only)' })
  removeMember(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.messagesService.removeGroupMember(id, userId, targetUserId);
  }

  @Delete('groups/:id/members/me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave a group' })
  leaveGroup(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.messagesService.leaveGroup(id, userId);
  }

  @Patch('groups/:id/members/me/tag')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set your tag/role label in a group' })
  setMemberTag(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body('tag') tag: string | null,
  ) {
    return this.messagesService.setMemberTag(id, userId, tag);
  }

  @Get(':conversationId/search')
  @ApiOperation({ summary: 'Search messages' })
  async searchMessages(@Param('conversationId') cid: string, @CurrentUser('id') uid: string, @Query('q') q: string, @Query('cursor') cursor?: string) {
    return this.messagesService.searchMessages(cid, uid, q, cursor);
  }

  @Post('forward/:messageId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Forward message' })
  async forward(@Param('messageId') mid: string, @CurrentUser('id') uid: string, @Body('conversationIds') cids: string[]) {
    return this.messagesService.forwardMessage(mid, uid, cids);
  }

  @Post(':messageId/delivered')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark delivered' })
  async delivered(@Param('messageId') mid: string, @CurrentUser('id') uid: string) {
    return this.messagesService.markDelivered(mid, uid);
  }

  @Get(':conversationId/media')
  @ApiOperation({ summary: 'Media gallery' })
  async media(@Param('conversationId') cid: string, @CurrentUser('id') uid: string, @Query('cursor') cursor?: string) {
    return this.messagesService.getMediaGallery(cid, uid, cursor);
  }

  @Put('conversations/:id/disappearing')
  @ApiOperation({ summary: 'Set disappearing message timer for conversation' })
  async setDisappearingTimer(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SetDisappearingTimerDto,
  ) {
    return this.messagesService.setDisappearingTimer(id, userId, dto.duration ?? null);
  }

  @Put('conversations/:id/archive')
  @ApiOperation({ summary: 'Archive conversation' })
  async archiveConversation(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messagesService.archiveConversationForUser(id, userId);
  }

  @Delete('conversations/:id/archive')
  @ApiOperation({ summary: 'Unarchive conversation' })
  async unarchiveConversation(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messagesService.unarchiveConversationForUser(id, userId);
  }

  @Post('messages/scheduled')
  @ApiOperation({ summary: 'Schedule a message' })
  async scheduleMessage(
    @CurrentUser('id') userId: string,
    @Body() dto: ScheduleMessageDto,
  ) {
    return this.messagesService.scheduleMessage(
      dto.conversationId,
      userId,
      dto.content,
      new Date(dto.scheduledAt),
      dto.messageType,
    );
  }

  @Get('messages/starred')
  @ApiOperation({ summary: 'Get starred messages' })
  async getStarredMessages(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.messagesService.getStarredMessages(userId, cursor);
  }

  // ── Pin Messages ──
  @Post(':conversationId/:messageId/pin')
  @ApiOperation({ summary: 'Pin a message (max 3 per conversation)' })
  async pinMessage(
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messagesService.pinMessage(conversationId, messageId, userId);
  }

  @Delete(':conversationId/:messageId/pin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unpin a message' })
  async unpinMessage(
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messagesService.unpinMessage(conversationId, messageId, userId);
  }

  @Get(':conversationId/pinned')
  @ApiOperation({ summary: 'Get pinned messages for a conversation' })
  async getPinnedMessages(
    @Param('conversationId') conversationId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messagesService.getPinnedMessages(conversationId, userId);
  }

  // ── View Once ──
  @Post(':conversationId/view-once')
  @ApiOperation({ summary: 'Send a view-once message' })
  async sendViewOnceMessage(
    @Param('conversationId') conversationId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { mediaUrl: string; mediaType?: string; messageType?: string; content?: string },
  ) {
    return this.messagesService.sendViewOnceMessage(conversationId, userId, body);
  }

  @Post('view-once/:messageId/viewed')
  @ApiOperation({ summary: 'Mark a view-once message as viewed' })
  async markViewOnceViewed(
    @Param('messageId') messageId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messagesService.markViewOnceViewed(messageId, userId);
  }

  // ── Group Admin ──
  @Post(':conversationId/members/:targetUserId/promote')
  @ApiOperation({ summary: 'Promote member to admin' })
  async promoteToAdmin(
    @Param('conversationId') conversationId: string,
    @Param('targetUserId') targetUserId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messagesService.promoteToAdmin(conversationId, userId, targetUserId);
  }

  @Post(':conversationId/members/:targetUserId/demote')
  @ApiOperation({ summary: 'Demote admin to member' })
  async demoteFromAdmin(
    @Param('conversationId') conversationId: string,
    @Param('targetUserId') targetUserId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messagesService.demoteFromAdmin(conversationId, userId, targetUserId);
  }

  @Post(':conversationId/members/:targetUserId/ban')
  @ApiOperation({ summary: 'Ban a member from group' })
  async banMember(
    @Param('conversationId') conversationId: string,
    @Param('targetUserId') targetUserId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messagesService.banMember(conversationId, userId, targetUserId);
  }

  @Patch(':conversationId/wallpaper')
  @ApiOperation({ summary: 'Set conversation wallpaper' })
  async setWallpaper(
    @Param('conversationId') conversationId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { wallpaperUrl: string | null },
  ) {
    return this.messagesService.setConversationWallpaper(conversationId, userId, body.wallpaperUrl);
  }

  @Patch(':conversationId/tone')
  @ApiOperation({ summary: 'Set custom notification tone' })
  async setTone(
    @Param('conversationId') conversationId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { tone: string | null },
  ) {
    return this.messagesService.setCustomTone(conversationId, userId, body.tone);
  }

  // ── DM Notes ──
  @Post('notes')
  @ApiOperation({ summary: 'Create or update your DM note' })
  async createDMNote(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateDMNoteDto,
  ) {
    return this.messagesService.createDMNote(userId, dto.content, dto.expiresInHours);
  }

  @Get('notes/me')
  @ApiOperation({ summary: 'Get your current DM note' })
  async getMyDMNote(@CurrentUser('id') userId: string) {
    return this.messagesService.getDMNote(userId);
  }

  @Delete('notes/me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete your DM note' })
  async deleteDMNote(@CurrentUser('id') userId: string) {
    return this.messagesService.deleteDMNote(userId);
  }

  @Get('notes/contacts')
  @ApiOperation({ summary: 'Get DM notes from your conversation contacts' })
  async getContactDMNotes(@CurrentUser('id') userId: string) {
    return this.messagesService.getDMNotesForContacts(userId);
  }
}
