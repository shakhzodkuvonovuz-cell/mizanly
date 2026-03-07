import {
  Controller,
  Get,
  Post,
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
  IsString, IsOptional, IsArray, MaxLength, IsBoolean, IsEnum, IsUrl, IsUUID, ArrayMaxSize,
} from 'class-validator';
import { MessagesService } from './messages.service';
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

@ApiTags('Messages (Risalah)')
@Controller('messages')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class MessagesController {
  constructor(private messagesService: MessagesService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'Get all conversations for current user' })
  getConversations(@CurrentUser('id') userId: string) {
    return this.messagesService.getConversations(userId);
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
    @Body('muted') muted: boolean,
  ) {
    return this.messagesService.muteConversation(id, userId, muted ?? true);
  }

  @Post('conversations/:id/archive')
  @ApiOperation({ summary: 'Archive or unarchive a conversation' })
  archive(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body('archived') archived: boolean,
  ) {
    return this.messagesService.archiveConversation(id, userId, archived ?? true);
  }

  @Post('dm')
  @ApiOperation({ summary: 'Create or retrieve a DM conversation' })
  createDM(
    @CurrentUser('id') userId: string,
    @Body('targetUserId') targetUserId: string,
  ) {
    return this.messagesService.createDM(userId, targetUserId);
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
}
