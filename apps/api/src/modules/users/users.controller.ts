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
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ReportDto } from './dto/report.dto';
import { ContactSyncDto } from './dto/contact-sync.dto';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
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
    this.usersService.touchLastSeen(userId);
    return this.usersService.getMe(userId);
  }

  @Patch('me')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Update profile fields' })
  updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Get('me/data-export')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 86400000, limit: 1 } })
  @ApiOperation({ summary: 'GDPR data export — all user data in JSON (rate limited: 1 per 24h)' })
  exportData(@CurrentUser('id') userId: string) {
    return this.usersService.exportData(userId);
  }

  @Delete('me/deactivate')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate account (soft delete)' })
  deactivate(@CurrentUser('id') userId: string) {
    return this.usersService.deactivate(userId);
  }

  @Delete('me')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Permanently delete account (soft delete)' })
  deleteAccount(@CurrentUser('id') userId: string) {
    return this.usersService.deleteAccount(userId);
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

  @Get('me/saved-reels')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bookmarked reels' })
  getSavedReels(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.usersService.getSavedReels(userId, cursor);
  }

  @Get('me/saved-videos')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bookmarked videos' })
  getSavedVideos(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.usersService.getSavedVideos(userId, cursor);
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

  @Post('me/watch-later/:videoId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add video to watch later' })
  addWatchLater(
    @Param('videoId') videoId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.usersService.addWatchLater(userId, videoId);
  }

  @Delete('me/watch-later/:videoId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove video from watch later' })
  removeWatchLater(
    @Param('videoId') videoId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.usersService.removeWatchLater(userId, videoId);
  }

  @Get('me/watch-history')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get watch history' })
  getWatchHistory(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.usersService.getWatchHistory(userId, cursor);
  }

  @Delete('me/watch-history')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Clear watch history' })
  clearWatchHistory(@CurrentUser('id') userId: string) {
    return this.usersService.clearWatchHistory(userId);
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

  @Post('contacts/sync')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Find friends from phone contacts' })
  async syncContacts(@CurrentUser('id') userId: string, @Body() dto: ContactSyncDto) {
    return this.usersService.findByPhoneNumbers(userId, dto.phoneNumbers);
  }

  @Get('me/liked-posts')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Posts liked by current user' })
  getLikedPosts(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.usersService.getLikedPosts(userId, cursor);
  }

  @Post('me/delete-account')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Request account deletion (30-day grace)' })
  requestAccountDeletion(@CurrentUser('id') userId: string) {
    return this.usersService.requestAccountDeletion(userId);
  }

  @Post('me/cancel-deletion')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel pending account deletion' })
  cancelAccountDeletion(@CurrentUser('id') userId: string) {
    return this.usersService.cancelAccountDeletion(userId);
  }

  @Patch('me/nasheed-mode')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle nasheed mode' })
  updateNasheedMode(
    @CurrentUser('id') userId: string,
    @Body() body: { nasheedMode: boolean },
  ) {
    return this.usersService.updateNasheedMode(userId, body.nasheedMode);
  }

  @Get('me/export-data')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export all user data (GDPR)' })
  exportData(@CurrentUser('id') userId: string) {
    return this.usersService.exportData(userId);
  }

  // currentUserId extracted from verified auth context — never from query params
  @Get(':username')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Public profile (respects blocks)' })
  getProfile(
    @Param('username') username: string,
    @CurrentUser('id') currentUserId?: string,
  ) {
    return this.usersService.getProfile(username, currentUserId);
  }

  @Get(':username/posts')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: "User's posts grid (cursor paginated)" })
  getUserPosts(
    @Param('username') username: string,
    @CurrentUser('id') viewerId?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.usersService.getUserPosts(username, cursor, viewerId);
  }

  @Get(':username/threads')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: "User's threads" })
  getUserThreads(
    @Param('username') username: string,
    @CurrentUser('id') viewerId?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.usersService.getUserThreads(username, cursor, viewerId);
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

  @Get(':username/mutual-followers')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mutual followers with target user' })
  getMutualFollowers(
    @Param('username') targetUsername: string,
    @CurrentUser('id') currentUserId: string,
    @Query('limit') limit?: number,
  ) {
    return this.usersService.getMutualFollowers(currentUserId, targetUsername, limit ?? 20);
  }

  @Post(':id/report')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Report a user' })
  report(
    @Param('id') reportedId: string,
    @CurrentUser('id') reporterId: string,
    @Body() dto: ReportDto,
  ) {
    return this.usersService.report(reporterId, reportedId, dto.reason);
  }
}
