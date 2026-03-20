import {
  Controller, Post, Get, Put, Patch, Delete,
  Body, Param, Query, UseGuards, BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GamificationService } from './gamification.service';
import {
  CreateChallengeDto, UpdateProgressDto, CreateSeriesDto,
  AddEpisodeDto, UpdateProfileCustomizationDto,
} from './dto/gamification.dto';

const VALID_STREAK_TYPES = ['posting', 'engagement', 'quran', 'dhikr', 'learning'];

@ApiTags('Gamification')
@Controller()
export class GamificationController {
  constructor(private gamificationService: GamificationService) {}

  // ── Streaks ───────────────────────────────────────────

  @Get('streaks')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Get all streaks' })
  getStreaks(@CurrentUser('id') userId: string) {
    return this.gamificationService.getStreaks(userId);
  }

  @Post('streaks/:type')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Update streak for today' })
  updateStreak(@CurrentUser('id') userId: string, @Param('type') type: string) {
    if (!VALID_STREAK_TYPES.includes(type)) {
      throw new BadRequestException(`Invalid streak type. Must be one of: ${VALID_STREAK_TYPES.join(', ')}`);
    }
    return this.gamificationService.updateStreak(userId, type);
  }

  // ── XP & Levels ───────────────────────────────────────

  @Get('xp')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Get XP and level info' })
  getXP(@CurrentUser('id') userId: string) {
    return this.gamificationService.getXP(userId);
  }

  @Get('xp/history')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Get XP history' })
  getXPHistory(@CurrentUser('id') userId: string, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.gamificationService.getXPHistory(userId, cursor, limit ? parseInt(limit) : undefined);
  }

  // ── Achievements ──────────────────────────────────────

  @Get('achievements')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Get achievements' })
  getAchievements(@CurrentUser('id') userId: string) {
    return this.gamificationService.getAchievements(userId);
  }

  // ── Leaderboard ───────────────────────────────────────

  @Get('leaderboard')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get leaderboard' })
  getLeaderboard(@Query('type') type = 'xp', @Query('limit') limit?: string) {
    return this.gamificationService.getLeaderboard(type, limit ? parseInt(limit) : undefined);
  }

  // ── Challenges ────────────────────────────────────────

  @Get('challenges')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Browse challenges' })
  getChallenges(@Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.gamificationService.getChallenges(cursor, limit ? parseInt(limit) : undefined);
  }

  @Post('challenges')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Create challenge' })
  createChallenge(@CurrentUser('id') userId: string, @Body() dto: CreateChallengeDto) {
    return this.gamificationService.createChallenge(userId, dto);
  }

  @Post('challenges/:id/join')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Join challenge' })
  joinChallenge(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.gamificationService.joinChallenge(userId, id);
  }

  @Patch('challenges/:id/progress')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Update challenge progress' })
  updateProgress(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: UpdateProgressDto) {
    return this.gamificationService.updateChallengeProgress(userId, id, dto.progress);
  }

  @Get('challenges/me')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Get my challenges' })
  getMyChallenges(@CurrentUser('id') userId: string) {
    return this.gamificationService.getMyChallenges(userId);
  }

  // ── Series (Micro-drama) ────────────────────────────────

  @Post('series')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Create series' })
  createSeries(@CurrentUser('id') userId: string, @Body() dto: CreateSeriesDto) {
    return this.gamificationService.createSeries(userId, dto);
  }

  @Get('series/discover')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Discover series' })
  discoverSeries(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
  ) {
    return this.gamificationService.getDiscoverSeries(cursor, limit ? parseInt(limit) : undefined, category);
  }

  @Get('series/:id')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get series detail' })
  getSeries(@Param('id') id: string) {
    return this.gamificationService.getSeries(id);
  }

  @Post('series/:id/episodes')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Add episode to series' })
  addEpisode(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: AddEpisodeDto) {
    return this.gamificationService.addEpisode(userId, id, dto);
  }

  @Post('series/:id/follow')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Follow series' })
  followSeries(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.gamificationService.followSeries(userId, id);
  }

  @Delete('series/:id/follow')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Unfollow series' })
  unfollowSeries(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.gamificationService.unfollowSeries(userId, id);
  }

  // ── Series Progress ────────────────────────────────────

  @Put('series/:id/progress')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Update series watch progress' })
  updateProgress(
    @CurrentUser('id') userId: string,
    @Param('id') seriesId: string,
    @Body() body: { episodeNum: number; timestamp: number },
  ) {
    return this.gamificationService.updateSeriesProgress(userId, seriesId, body.episodeNum, body.timestamp);
  }

  @Get('series/:id/progress')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Get series watch progress' })
  getProgress(
    @CurrentUser('id') userId: string,
    @Param('id') seriesId: string,
  ) {
    return this.gamificationService.getSeriesProgress(userId, seriesId);
  }

  @Get('series/continue-watching')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Get continue watching list' })
  continueWatching(@CurrentUser('id') userId: string) {
    return this.gamificationService.getContinueWatching(userId);
  }

  // ── Profile Customization ───────────────────────────────

  @Get('profile-customization')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Get profile customization' })
  getProfileCustomization(@CurrentUser('id') userId: string) {
    return this.gamificationService.getProfileCustomization(userId);
  }

  @Patch('profile-customization')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Update profile customization' })
  updateProfileCustomization(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileCustomizationDto) {
    return this.gamificationService.updateProfileCustomization(userId, dto);
  }
}
