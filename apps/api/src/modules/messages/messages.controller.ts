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
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  IsString, IsOptional, IsArray, MaxLength, IsBoolean, IsEnum, IsUrl, IsUUID, ArrayMaxSize, IsNumber, IsISO8601, IsInt, Min, Max, Matches,
} from 'class-validator';
import { MessagesService } from './messages.service';
import { ChatGateway } from '../../gateways/chat.gateway';

class SetLockCodeDto {
  @IsOptional() @IsString() @Matches(/^\d{4,8}$/, { message: 'Lock code must be 4-8 digits' }) code?: string | null;
}

class VerifyLockCodeDto {
  @IsString() @Matches(/^\d{4,8}$/, { message: 'Lock code must be 4-8 digits' }) code: string;
}

class SetHistoryCountDto {
  @IsInt() @Min(0) @Max(100) count: number;
}

class SetMemberTagDto {
  @IsOptional() @IsString() @MaxLength(30) tag?: string | null;
}

class ForwardMessageDto {
  @IsArray() @IsString({ each: true }) @ArrayMaxSize(5) conversationIds: string[];
}

class SendViewOnceDto {
  @IsUrl() mediaUrl: string;
  @IsOptional() @IsString() @MaxLength(50) mediaType?: string;
  @IsOptional() @IsEnum(['IMAGE', 'VIDEO', 'VOICE']) messageType?: string;
  @IsOptional() @IsString() @MaxLength(500) content?: string;
}

class SetWallpaperDto {
  @IsOptional() @IsUrl() wallpaperUrl?: string | null;
}

class SetToneDto {
  @IsOptional() @IsString() @MaxLength(100) tone?: string | null;
}
import { MuteConversationDto } from './dto/mute-conversation.dto';
import { ArchiveConversationDto } from './dto/archive-conversation.dto';
import { CreateDmDto } from './dto/create-dm.dto';
import { CreateDMNoteDto } from './dto/dm-note.dto';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * REST message DTO — plaintext messages ONLY.
 * E2E encrypted messages use the WebSocket WsSendMessageDto which includes
 * encryptedContent, e2eVersion, and other Signal Protocol fields.
 * DO NOT add E2E fields here without also adding base64→Uint8Array conversion.
 */
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

  @ApiProperty({ required: false, description: 'Group description', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  groupDescription?: string;
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
@Throttle({ default: { limit: 60, ttl: 60000 } })
export class MessagesController {
  constructor(
    private messagesService: MessagesService,
    private chatGateway: ChatGateway,
  ) {}

  @Get('unread-count')
  @ApiOperation({ summary: 'Get total unread message count across all conversations (for badge)' })
  async getUnreadCount(@CurrentUser('id') userId: string) {
    return this.messagesService.getTotalUnreadCount(userId);
  }

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
  @Throttle({ default: { limit: 30, ttl: 60000 } })
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
  @Throttle({ default: { limit: 10, ttl: 60000 } })
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

  @Delete('groups/:id/members/me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave a group' })
  leaveGroup(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.messagesService.leaveGroup(id, userId);
  }

  @Delete('groups/:id/members/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove member from group (creator only)' })
  async removeMember(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Param('userId') targetUserId: string,
  ) {
    const result = await this.messagesService.removeGroupMember(id, userId, targetUserId);
    // Emit room_evicted event to the kicked user's socket(s) so the client
    // can leave the socket room and show an appropriate UI notification
    if (this.chatGateway.server) {
      this.chatGateway.server
        .to(`user:${targetUserId}`)
        .emit('room_evicted', { conversationId: id, removedBy: userId });
    }
    return result;
  }

  @Patch('conversations/:id/lock-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set or remove secret lock code for a conversation' })
  setLockCode(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SetLockCodeDto,
  ) {
    return this.messagesService.setLockCode(id, userId, dto.code ?? null);
  }

  @Post('conversations/:id/verify-lock')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 300000 } })
  @ApiOperation({ summary: 'Verify lock code for a conversation (5 attempts per 5 min)' })
  verifyLockCode(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: VerifyLockCodeDto,
  ) {
    return this.messagesService.verifyLockCode(id, userId, dto.code);
  }

  @Patch('groups/:id/history-count')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set number of recent messages shown to new group members' })
  setHistoryCount(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SetHistoryCountDto,
  ) {
    return this.messagesService.setNewMemberHistoryCount(id, userId, dto.count);
  }

  @Patch('groups/:id/members/me/tag')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set your tag/role label in a group' })
  setMemberTag(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SetMemberTagDto,
  ) {
    return this.messagesService.setMemberTag(id, userId, dto.tag ?? null);
  }

  // Finding #310: Global message search
  @Get('search')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Search messages across all conversations' })
  async searchAllMessages(@CurrentUser('id') uid: string, @Query('q') q: string) {
    return this.messagesService.searchAllMessages(uid, q);
  }

  @Get(':conversationId/search')
  @ApiOperation({ summary: 'Search messages in a specific conversation' })
  async searchMessages(@Param('conversationId') cid: string, @CurrentUser('id') uid: string, @Query('q') q: string, @Query('cursor') cursor?: string) {
    return this.messagesService.searchMessages(cid, uid, q, cursor);
  }

  @Post('forward/:messageId')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Forward message' })
  async forward(@Param('messageId') mid: string, @CurrentUser('id') uid: string, @Body() dto: ForwardMessageDto) {
    return this.messagesService.forwardMessage(mid, uid, dto.conversationIds);
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
  @Throttle({ default: { limit: 10, ttl: 60000 } })
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

  @Post(':conversationId/:messageId/star')
  @ApiOperation({ summary: 'Star a message' })
  async starMessage(
    @Param('messageId') messageId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messagesService.starMessage(userId, messageId);
  }

  @Delete(':conversationId/:messageId/star')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unstar a message' })
  async unstarMessage(
    @Param('messageId') messageId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messagesService.unstarMessage(userId, messageId);
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
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Send a view-once message' })
  async sendViewOnceMessage(
    @Param('conversationId') conversationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SendViewOnceDto,
  ) {
    return this.messagesService.sendViewOnceMessage(conversationId, userId, dto);
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
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Ban a member from group' })
  async banMember(
    @Param('conversationId') conversationId: string,
    @Param('targetUserId') targetUserId: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.messagesService.banMember(conversationId, userId, targetUserId);
    // Bug 44: Emit room_evicted to banned user's socket so client leaves the room
    if (this.chatGateway?.server) {
      this.chatGateway.server
        .to(`user:${targetUserId}`)
        .emit('room_evicted', { conversationId, removedBy: userId, reason: 'banned' });
    }
    return result;
  }

  @Patch(':conversationId/pin')
  @ApiOperation({ summary: 'Pin or unpin a conversation for the current user' })
  async pinConversation(
    @Param('conversationId') conversationId: string,
    @CurrentUser('id') userId: string,
    @Body('isPinned') isPinned: boolean,
  ) {
    return this.messagesService.pinConversation(conversationId, userId, !!isPinned);
  }

  @Patch(':conversationId/wallpaper')
  @ApiOperation({ summary: 'Set conversation wallpaper' })
  async setWallpaper(
    @Param('conversationId') conversationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SetWallpaperDto,
  ) {
    return this.messagesService.setConversationWallpaper(conversationId, userId, dto.wallpaperUrl ?? null);
  }

  @Patch(':conversationId/tone')
  @ApiOperation({ summary: 'Set custom notification tone' })
  async setTone(
    @Param('conversationId') conversationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SetToneDto,
  ) {
    return this.messagesService.setCustomTone(conversationId, userId, dto.tone ?? null);
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

  // Finding #167: Promote/demote group member role
  @Patch(':conversationId/members/:targetUserId/role')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Change group member role (admin/member)' })
  async changeGroupRole(
    @Param('conversationId') conversationId: string,
    @Param('targetUserId') targetUserId: string,
    @CurrentUser('id') userId: string,
    @Body('role') role: string,
  ) {
    // Runtime validation — TypeScript types are erased at runtime
    if (role !== 'admin' && role !== 'member') {
      throw new BadRequestException('Role must be "admin" or "member"');
    }
    return this.messagesService.changeGroupRole(conversationId, userId, targetUserId, role);
  }

  // Finding #169: Generate group invite link
  @Post(':conversationId/invite-link')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Generate shareable invite link for a group' })
  async generateInviteLink(
    @Param('conversationId') conversationId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messagesService.generateGroupInviteLink(conversationId, userId);
  }

  // Finding #169: Join group via invite link
  @Post('join/:inviteCode')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Join a group via invite link' })
  async joinViaInviteLink(
    @Param('inviteCode') inviteCode: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messagesService.joinViaInviteLink(inviteCode, userId);
  }

  // Finding #364: Group topics
  @Post(':conversationId/topics')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a discussion topic in a group' })
  async createGroupTopic(
    @Param('conversationId') conversationId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { name: string; iconEmoji?: string },
  ) {
    return this.messagesService.createGroupTopic(conversationId, userId, body.name, body.iconEmoji);
  }

  @Get(':conversationId/topics')
  @ApiOperation({ summary: 'Get discussion topics in a group' })
  async getGroupTopics(
    @Param('conversationId') conversationId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messagesService.getGroupTopics(conversationId, userId);
  }

  // Finding #378: Message expiry settings
  @Patch(':conversationId/expiry')
  @ApiOperation({ summary: 'Set message auto-delete timer (0, 1, 7, 30, 90 days)' })
  async setMessageExpiry(
    @Param('conversationId') conversationId: string,
    @CurrentUser('id') userId: string,
    @Body('expiryDays') expiryDays: number,
  ) {
    return this.messagesService.setMessageExpiry(conversationId, userId, expiryDays);
  }
}
