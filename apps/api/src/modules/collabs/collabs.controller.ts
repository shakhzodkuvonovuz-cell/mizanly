import { Throttle } from '@nestjs/throttler';
import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CollabsService } from './collabs.service';
import { InviteCollabDto } from './dto/invite-collab.dto';

@ApiTags('Post Collaborations')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Throttle({ default: { limit: 30, ttl: 60000 } })
@Controller('collabs')
export class CollabsController {
  constructor(private collabs: CollabsService) {}

  @Get('pending')
  @ApiOperation({ summary: 'Get my pending collab invites' })
  async pending(@CurrentUser('id') userId: string) {
    return this.collabs.getMyPending(userId);
  }

  @Get('accepted')
  @ApiOperation({ summary: 'Get my accepted collabs' })
  async accepted(@CurrentUser('id') userId: string, @Query('cursor') cursor?: string) {
    return this.collabs.getAcceptedCollabs(userId, cursor);
  }

  @Get('post/:postId')
  @ApiOperation({ summary: 'Get collaborators on a post' })
  async postCollabs(@Param('postId') postId: string) {
    return this.collabs.getPostCollabs(postId);
  }

  @Post('invite')
  @ApiOperation({ summary: 'Invite collaborator to post' })
  async invite(@CurrentUser('id') userId: string, @Body() dto: InviteCollabDto) {
    return this.collabs.invite(userId, dto.postId, dto.targetUserId);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept collab invite' })
  async accept(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.collabs.accept(id, userId);
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decline collab invite' })
  async decline(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.collabs.decline(id, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove collaboration' })
  async remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.collabs.remove(id, userId);
  }
}
