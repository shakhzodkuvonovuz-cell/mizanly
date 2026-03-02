import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get own full profile' })
  getMe(@CurrentUser('id') userId: string) {
    return this.usersService.getMe(userId);
  }

  @Patch('me')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update profile fields' })
  updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Delete('me')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate account (soft delete)' })
  deactivate(@CurrentUser('id') userId: string) {
    return this.usersService.deactivate(userId);
  }

  @Get('me/saved-posts')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bookmarked posts' })
  getSavedPosts(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.usersService.getSavedPosts(userId, cursor);
  }

  @Get('me/saved-threads')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bookmarked threads' })
  getSavedThreads(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.usersService.getSavedThreads(userId, cursor);
  }

  @Get('me/follow-requests')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Incoming follow requests' })
  getFollowRequests(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.usersService.getFollowRequests(userId, cursor);
  }

  @Get('me/watch-later')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Watch later list' })
  getWatchLater(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.usersService.getWatchLater(userId, cursor);
  }

  @Get('me/drafts')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Draft posts' })
  getDrafts(@CurrentUser('id') userId: string) {
    return this.usersService.getDrafts(userId);
  }

  @Get('me/qr-code')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Profile QR code data' })
  getQrCode(@CurrentUser('id') userId: string) {
    return this.usersService.getQrCode(userId);
  }

  @Get('me/analytics')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Creator analytics overview' })
  getAnalytics(@CurrentUser('id') userId: string) {
    return this.usersService.getAnalytics(userId);
  }

  @Get(':username')
  @ApiOperation({ summary: 'Public profile (respects blocks)' })
  getProfile(
    @Param('username') username: string,
    @Query('currentUserId') currentUserId?: string,
  ) {
    return this.usersService.getProfile(username, currentUserId);
  }

  @Get(':username/posts')
  @ApiOperation({ summary: "User's posts grid (cursor paginated)" })
  getUserPosts(
    @Param('username') username: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.usersService.getUserPosts(username, cursor);
  }

  @Get(':username/threads')
  @ApiOperation({ summary: "User's threads" })
  getUserThreads(
    @Param('username') username: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.usersService.getUserThreads(username, cursor);
  }

  @Get(':username/followers')
  @ApiOperation({ summary: 'Followers list' })
  getFollowers(
    @Param('username') username: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.usersService.getFollowers(username, cursor);
  }

  @Get(':username/following')
  @ApiOperation({ summary: 'Following list' })
  getFollowing(
    @Param('username') username: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.usersService.getFollowing(username, cursor);
  }
}
