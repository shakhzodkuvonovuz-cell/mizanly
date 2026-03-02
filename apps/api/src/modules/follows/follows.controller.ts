import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FollowsService } from './follows.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Follows')
@Controller('follows')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class FollowsController {
  constructor(private followsService: FollowsService) {}

  @Post(':userId')
  @ApiOperation({ summary: 'Follow a user (or create request if private)' })
  follow(
    @CurrentUser('id') currentUserId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.followsService.follow(currentUserId, targetUserId);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unfollow a user' })
  unfollow(
    @CurrentUser('id') currentUserId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.followsService.unfollow(currentUserId, targetUserId);
  }

  @Get(':userId/followers')
  @ApiOperation({ summary: 'Followers list (cursor paginated)' })
  getFollowers(
    @Param('userId') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.followsService.getFollowers(userId, cursor);
  }

  @Get(':userId/following')
  @ApiOperation({ summary: 'Following list (cursor paginated)' })
  getFollowing(
    @Param('userId') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.followsService.getFollowing(userId, cursor);
  }

  @Get('requests/incoming')
  @ApiOperation({ summary: 'Own incoming follow requests' })
  getOwnRequests(@CurrentUser('id') userId: string) {
    return this.followsService.getOwnRequests(userId);
  }

  @Post('requests/:id/accept')
  @ApiOperation({ summary: 'Accept a follow request' })
  acceptRequest(
    @CurrentUser('id') userId: string,
    @Param('id') requestId: string,
  ) {
    return this.followsService.acceptRequest(userId, requestId);
  }

  @Post('requests/:id/decline')
  @ApiOperation({ summary: 'Decline a follow request' })
  declineRequest(
    @CurrentUser('id') userId: string,
    @Param('id') requestId: string,
  ) {
    return this.followsService.declineRequest(userId, requestId);
  }

  @Delete('requests/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a sent follow request' })
  cancelRequest(
    @CurrentUser('id') userId: string,
    @Param('id') requestId: string,
  ) {
    return this.followsService.cancelRequest(userId, requestId);
  }

  @Get('suggestions')
  @ApiOperation({ summary: 'People you may know (friends-of-friends)' })
  getSuggestions(@CurrentUser('id') userId: string) {
    return this.followsService.getSuggestions(userId);
  }
}
