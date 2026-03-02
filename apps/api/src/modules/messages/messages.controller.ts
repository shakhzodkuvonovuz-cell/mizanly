import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Messages (Risalah)')
@Controller('messages')
export class MessagesController {
  constructor(private messagesService: MessagesService) {}

  @Get('conversations')
  @UseGuards(ClerkAuthGuard) @ApiBearerAuth()
  getConversations(@CurrentUser('id') userId: string) {
    return this.messagesService.getConversations(userId);
  }

  @Get('conversations/:id')
  @UseGuards(ClerkAuthGuard) @ApiBearerAuth()
  getMessages(@Param('id') id: string, @CurrentUser('id') userId: string, @Query('cursor') cursor?: string) {
    return this.messagesService.getMessages(id, userId, cursor);
  }

  @Post('conversations/:id')
  @UseGuards(ClerkAuthGuard) @ApiBearerAuth()
  sendMessage(
    @Param('id') id: string, @CurrentUser('id') userId: string,
    @Body('content') content: string, @Body('type') type?: string,
    @Body('mediaUrl') mediaUrl?: string, @Body('replyToId') replyToId?: string,
  ) {
    return this.messagesService.sendMessage(id, userId, content, type, mediaUrl, replyToId);
  }

  @Post('dm')
  @UseGuards(ClerkAuthGuard) @ApiBearerAuth()
  createDM(@CurrentUser('id') userId: string, @Body('targetUserId') targetUserId: string) {
    return this.messagesService.createDM(userId, targetUserId);
  }

  @Post('groups')
  @UseGuards(ClerkAuthGuard) @ApiBearerAuth()
  createGroup(@CurrentUser('id') userId: string, @Body('name') name: string, @Body('memberIds') memberIds: string[]) {
    return this.messagesService.createGroup(userId, name, memberIds);
  }

  @Post('conversations/:id/read')
  @UseGuards(ClerkAuthGuard) @ApiBearerAuth()
  markRead(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.messagesService.markRead(id, userId);
  }
}
