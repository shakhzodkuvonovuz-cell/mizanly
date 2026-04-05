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
  Header,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ReportDto } from './dto/report.dto';
import { ContactSyncDto } from './dto/contact-sync.dto';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { TwoFactorGuard } from '../../common/guards/two-factor.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NasheedModeDto } from './dto/nasheed-mode.dto';
import { RequestVerificationDto } from './dto/request-verification.dto';

@ApiTags('Users')
@Throttle({ default: { limit: 60, ttl: 60000 } })
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
  @UseGuards(ClerkAuthGuard, TwoFactorGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate account (soft delete, 2FA required)' })
  deactivate(@CurrentUser('id') userId: string) {
    return this.usersService.deactivate(userId);
  }

  /**
   * Immediate permanent account deletion — anonymizes profile, soft-deletes content,
   * removes social graph, and clears encryption keys in a single transaction.
   * This is the "hard delete" endpoint for users who want instant removal.
   * See also: POST /me/delete-account for the 30-day grace period variant.
   */
  @Delete('me')
  @UseGuards(ClerkAuthGuard, TwoFactorGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 1, ttl: 86400000 } })
  @ApiOperation({ summary: 'Permanently delete account (1/day, 2FA required)' })
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

  // Follow requests moved to FollowsController: GET /follows/requests/incoming

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
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @ApiOperation({ summary: 'Find friends from phone contacts (5/hour)' })
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

  /**
   * Request account deletion with 30-day grace period — sets scheduledDeletionAt
   * so the user can cancel within 30 days via POST /me/cancel-deletion.
   * This is the "soft request" endpoint for users who want time to reconsider.
   * See also: DELETE /me for immediate permanent deletion.
   */
  @Post('me/delete-account')
  @UseGuards(ClerkAuthGuard, TwoFactorGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 1, ttl: 86400000 } })
  @ApiOperation({ summary: 'Request account deletion with 30-day grace (1/day, 2FA required)' })
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

  @Post('me/reactivate')
  @UseGuards(ClerkAuthGuard, TwoFactorGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reactivate deactivated account (2FA required)' })
  reactivateAccount(@CurrentUser('id') userId: string) {
    return this.usersService.reactivateAccount(userId);
  }

  @Patch('me/nasheed-mode')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle nasheed mode' })
  updateNasheedMode(
    @CurrentUser('id') userId: string,
    @Body() body: NasheedModeDto,
  ) {
    return this.usersService.updateNasheedMode(userId, body.nasheedMode);
  }

  // Finding #403: Popular with friends — must be before :username param route
  @Get('popular-with-friends')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Posts popular with people you follow' })
  getPopularWithFriends(@CurrentUser('id') userId: string) {
    return this.usersService.getPopularWithFriends(userId);
  }

  // Finding #326: Get referral code — must be before :username
  @Get('me/referral-code')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get your referral code for sharing' })
  async getReferralCode(@CurrentUser('id') userId: string) {
    const user = await this.usersService.getMe(userId);
    return { referralCode: (user as Record<string, unknown>)?.referralCode, shareUrl: `https://mizanly.app/join?ref=${(user as Record<string, unknown>)?.referralCode}` };
  }

  // Finding #287: Request verification — must be before :username
  @Post('me/request-verification')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 1, ttl: 60000 } })
  @ApiOperation({ summary: 'Request account verification' })
  requestVerification(
    @CurrentUser('id') userId: string,
    @Body() dto: RequestVerificationDto,
  ) {
    return this.usersService.requestVerification(userId, dto);
  }

  // currentUserId extracted from verified auth context — never from query params
  @Get(':username')
  @UseGuards(OptionalClerkAuthGuard)
  @Header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
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
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Followers list' })
  getFollowers(
    @Param('username') username: string,
    @CurrentUser('id') viewerId?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.usersService.getFollowers(username, cursor, viewerId);
  }

  @Get(':username/following')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Following list' })
  getFollowing(
    @Param('username') username: string,
    @CurrentUser('id') viewerId?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.usersService.getFollowing(username, cursor, viewerId);
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

  // NOTE: me/referral-code and me/request-verification moved above :username to avoid route collision

  // Finding #273: Similar accounts based on shared followers
  @Get(':username/similar')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get similar accounts (collaborative filtering)' })
  getSimilarAccounts(
    @Param('username') username: string,
    @CurrentUser('id') viewerId?: string,
  ) {
    return this.usersService.getSimilarAccounts(username, viewerId);
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
