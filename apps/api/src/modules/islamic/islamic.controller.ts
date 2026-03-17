import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Query,
  Param,
  Body,
  UseGuards,
  ParseFloatPipe,
  ParseIntPipe,
  Optional,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsIn, Min, Max } from 'class-validator';
import { IslamicService } from './islamic.service';
import {
  PrayerTimesResponse,
  CalculationMethod,
  Hadith,
  Mosque,
  ZakatCalculationResponse,
  RamadanInfoResponse,
} from './islamic.service';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UpdatePrayerNotificationDto } from './dto/prayer-notification.dto';
import { CreateQuranPlanDto, UpdateQuranPlanDto } from './dto/quran-plan.dto';
import { CreateCampaignDto, CreateDonationDto } from './dto/charity.dto';
import { CreateHajjProgressDto, UpdateHajjProgressDto } from './dto/hajj.dto';
import { ApplyScholarVerificationDto } from './dto/scholar-verification.dto';
import { UpdateContentFilterDto } from './dto/content-filter.dto';
import { SaveDhikrSessionDto, CreateDhikrChallengeDto, ContributeDhikrDto } from './dto/dhikr.dto';

class PrayerTimesQueryDto {
  @ApiQuery({ name: 'lat', required: true, description: 'Latitude', example: 24.7136 })
  lat: number;

  @ApiQuery({ name: 'lng', required: true, description: 'Longitude', example: 46.6753 })
  lng: number;

  @ApiQuery({ name: 'method', required: false, description: 'Calculation method (MWL, ISNA, Egypt, Makkah, Karachi)', example: 'MWL' })
  method?: string;

  @ApiQuery({ name: 'date', required: false, description: 'Date in YYYY-MM-DD format (default today)', example: '2026-03-13' })
  date?: string;
}

class MosquesQueryDto {
  @ApiQuery({ name: 'lat', required: true, description: 'Latitude', example: 24.7136 })
  lat: number;

  @ApiQuery({ name: 'lng', required: true, description: 'Longitude', example: 46.6753 })
  lng: number;

  @ApiQuery({ name: 'radius', required: false, description: 'Search radius in kilometers', example: 10 })
  radius?: number;
}

class ZakatCalculationQueryDto {
  @ApiQuery({ name: 'cash', required: true, description: 'Cash amount in base currency', example: 5000 })
  cash: number;

  @ApiQuery({ name: 'gold', required: true, description: 'Gold amount in grams', example: 50 })
  gold: number;

  @ApiQuery({ name: 'silver', required: true, description: 'Silver amount in grams', example: 200 })
  silver: number;

  @ApiQuery({ name: 'investments', required: true, description: 'Investment value', example: 10000 })
  investments: number;

  @ApiQuery({ name: 'debts', required: true, description: 'Debts owed', example: 2000 })
  debts: number;
}

class RamadanInfoQueryDto {
  @ApiQuery({ name: 'year', required: false, description: 'Year (default current year)', example: 2026 })
  year?: number;

  @ApiQuery({ name: 'lat', required: false, description: 'Latitude for prayer times', example: 24.7136 })
  lat?: number;

  @ApiQuery({ name: 'lng', required: false, description: 'Longitude for prayer times', example: 46.6753 })
  lng?: number;
}

@ApiTags('Islamic')
@Controller('islamic')
@UseGuards(OptionalClerkAuthGuard)
export class IslamicController {
  constructor(private islamicService: IslamicService) {}

  @Get('prayer-times')
  @ApiOperation({ summary: 'Get prayer times for location' })
  @ApiResponse({ status: 200, description: 'Prayer times returned', type: Object })
  async getPrayerTimes(@Query() query: PrayerTimesQueryDto): Promise<PrayerTimesResponse> {
    return this.islamicService.getPrayerTimes({
      lat: query.lat,
      lng: query.lng,
      method: query.method,
      date: query.date,
    });
  }

  @Get('prayer-times/methods')
  @ApiOperation({ summary: 'List prayer time calculation methods' })
  @ApiResponse({ status: 200, description: 'List of methods', type: Object })
  getPrayerMethods(): CalculationMethod[] {
    return this.islamicService.getPrayerMethods();
  }

  @Get('hadith/daily')
  @ApiOperation({ summary: 'Get daily hadith (rotates daily)' })
  @ApiResponse({ status: 200, description: 'Daily hadith', type: Object })
  getDailyHadith(): Hadith {
    return this.islamicService.getDailyHadith();
  }

  @Get('hadith/:id')
  @ApiOperation({ summary: 'Get specific hadith by ID' })
  @ApiParam({ name: 'id', description: 'Hadith ID (1-40)', example: 1 })
  @ApiResponse({ status: 200, description: 'Hadith found', type: Object })
  @ApiResponse({ status: 404, description: 'Hadith not found' })
  getHadithById(@Param('id', ParseIntPipe) id: number): Hadith {
    return this.islamicService.getHadithById(id);
  }

  @Get('hadith')
  @ApiOperation({ summary: 'List hadiths with pagination' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Cursor for pagination (hadith ID)', example: 10 })
  @ApiResponse({ status: 200, description: 'Hadith list with pagination metadata', type: Object })
  getHadiths(@Query('cursor', new Optional(), ParseIntPipe) cursor?: number) {
    return this.islamicService.getHadiths(cursor);
  }

  @Get('mosques')
  @ApiOperation({ summary: 'Find nearby mosques' })
  @ApiResponse({ status: 200, description: 'List of nearby mosques', type: Object })
  getNearbyMosques(@Query() query: MosquesQueryDto): Mosque[] {
    return this.islamicService.getNearbyMosques(query.lat, query.lng, query.radius);
  }

  @Get('zakat/calculate')
  @ApiOperation({ summary: 'Calculate zakat obligation' })
  @ApiResponse({ status: 200, description: 'Zakat calculation result', type: Object })
  calculateZakat(@Query() query: ZakatCalculationQueryDto): ZakatCalculationResponse {
    return this.islamicService.calculateZakat({
      cash: query.cash,
      gold: query.gold,
      silver: query.silver,
      investments: query.investments,
      debts: query.debts,
    });
  }

  @Get('ramadan')
  @ApiOperation({ summary: 'Get Ramadan information' })
  @ApiResponse({ status: 200, description: 'Ramadan details', type: Object })
  getRamadanInfo(@Query() query: RamadanInfoQueryDto): RamadanInfoResponse {
    return this.islamicService.getRamadanInfo({
      year: query.year,
      lat: query.lat,
      lng: query.lng,
    });
  }

  @Get('prayer-notifications/settings')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get prayer notification settings' })
  async getPrayerNotificationSettings(@CurrentUser('id') userId: string) {
    return this.islamicService.getPrayerNotificationSettings(userId);
  }

  @Patch('prayer-notifications/settings')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update prayer notification settings' })
  async updatePrayerNotificationSettings(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdatePrayerNotificationDto,
  ) {
    return this.islamicService.updatePrayerNotificationSettings(userId, dto);
  }

  // ── Quran Reading Plans ──

  @Post('quran-plans')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a Quran reading plan' })
  async createReadingPlan(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateQuranPlanDto,
  ) {
    return this.islamicService.createReadingPlan(userId, dto);
  }

  @Get('quran-plans/active')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get active reading plan' })
  async getActiveReadingPlan(@CurrentUser('id') userId: string) {
    return this.islamicService.getActiveReadingPlan(userId);
  }

  @Get('quran-plans/history')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get completed reading plans' })
  async getReadingPlanHistory(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.islamicService.getReadingPlanHistory(userId, cursor, limit);
  }

  @Patch('quran-plans/:id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update reading plan progress' })
  async updateReadingPlan(
    @CurrentUser('id') userId: string,
    @Param('id') planId: string,
    @Body() dto: UpdateQuranPlanDto,
  ) {
    return this.islamicService.updateReadingPlan(userId, planId, dto);
  }

  @Delete('quran-plans/:id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a reading plan' })
  async deleteReadingPlan(
    @CurrentUser('id') userId: string,
    @Param('id') planId: string,
  ) {
    return this.islamicService.deleteReadingPlan(userId, planId);
  }

  // ── Charity / Sadaqah ──

  @Post('charity/campaigns')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a charity campaign' })
  async createCampaign(@CurrentUser('id') userId: string, @Body() dto: CreateCampaignDto) {
    return this.islamicService.createCampaign(userId, dto);
  }

  @Get('charity/campaigns')
  @ApiOperation({ summary: 'List active charity campaigns' })
  async listCampaigns(@Query('cursor') cursor?: string, @Query('limit') limit?: number) {
    return this.islamicService.listCampaigns(cursor, limit);
  }

  @Get('charity/campaigns/:id')
  @ApiOperation({ summary: 'Get campaign details' })
  async getCampaign(@Param('id') id: string) {
    return this.islamicService.getCampaign(id);
  }

  @Post('charity/donate')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Make a donation' })
  async createDonation(@CurrentUser('id') userId: string, @Body() dto: CreateDonationDto) {
    return this.islamicService.createDonation(userId, dto);
  }

  @Get('charity/my-donations')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my donation history' })
  async getMyDonations(@CurrentUser('id') userId: string, @Query('cursor') cursor?: string) {
    return this.islamicService.getMyDonations(userId, cursor);
  }

  // ── Hajj & Umrah ──

  @Get('hajj/guide')
  @ApiOperation({ summary: 'Get Hajj step-by-step guide' })
  async getHajjGuide() {
    return this.islamicService.getHajjGuide();
  }

  @Get('hajj/progress')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user Hajj progress' })
  async getHajjProgress(@CurrentUser('id') userId: string) {
    return this.islamicService.getHajjProgress(userId);
  }

  @Post('hajj/progress')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start Hajj tracker for a year' })
  async createHajjProgress(@CurrentUser('id') userId: string, @Body() dto: CreateHajjProgressDto) {
    return this.islamicService.createHajjProgress(userId, dto);
  }

  @Patch('hajj/progress/:id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update Hajj progress' })
  async updateHajjProgress(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateHajjProgressDto,
  ) {
    return this.islamicService.updateHajjProgress(userId, id, dto);
  }

  // ── Tafsir ──

  @Get('tafsir/sources')
  @ApiOperation({ summary: 'List available tafsir sources' })
  async getTafsirSources() {
    return this.islamicService.getTafsirSources();
  }

  @Get('tafsir/:surah/:verse')
  @ApiOperation({ summary: 'Get tafsir for a verse' })
  async getTafsir(
    @Param('surah') surah: string,
    @Param('verse') verse: string,
    @Query('source') source?: string,
  ) {
    return this.islamicService.getTafsir(parseInt(surah), parseInt(verse), source);
  }

  // ── Scholar Verification ──

  @Post('scholar-verification/apply')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Apply for scholar verification' })
  async applyScholarVerification(@CurrentUser('id') userId: string, @Body() dto: ApplyScholarVerificationDto) {
    return this.islamicService.applyScholarVerification(userId, dto);
  }

  @Get('scholar-verification/status')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check scholar verification status' })
  async getScholarVerificationStatus(@CurrentUser('id') userId: string) {
    return this.islamicService.getScholarVerificationStatus(userId);
  }

  // ── Content Filter ──

  @Get('content-filter/settings')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get content filter settings' })
  async getContentFilterSettings(@CurrentUser('id') userId: string) {
    return this.islamicService.getContentFilterSettings(userId);
  }

  @Patch('content-filter/settings')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update content filter settings' })
  async updateContentFilterSettings(@CurrentUser('id') userId: string, @Body() dto: UpdateContentFilterDto) {
    return this.islamicService.updateContentFilterSettings(userId, dto);
  }

  // ── Dhikr Social ──

  @Post('dhikr/sessions')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save a dhikr session' })
  async saveDhikrSession(@CurrentUser('id') userId: string, @Body() dto: SaveDhikrSessionDto) {
    return this.islamicService.saveDhikrSession(userId, dto);
  }

  @Get('dhikr/stats')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get dhikr stats' })
  async getDhikrStats(@CurrentUser('id') userId: string) {
    return this.islamicService.getDhikrStats(userId);
  }

  @Get('dhikr/leaderboard')
  @ApiOperation({ summary: 'Get dhikr leaderboard' })
  async getDhikrLeaderboard(@Query('period') period?: string) {
    return this.islamicService.getDhikrLeaderboard(period);
  }

  @Post('dhikr/challenges')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a dhikr challenge' })
  async createDhikrChallenge(@CurrentUser('id') userId: string, @Body() dto: CreateDhikrChallengeDto) {
    return this.islamicService.createDhikrChallenge(userId, dto);
  }

  @Get('dhikr/challenges')
  @ApiOperation({ summary: 'List active challenges' })
  async listActiveChallenges(@Query('cursor') cursor?: string) {
    return this.islamicService.listActiveChallenges(cursor);
  }

  @Get('dhikr/challenges/:id')
  @ApiOperation({ summary: 'Get challenge detail' })
  async getChallengeDetail(@Param('id') id: string) {
    return this.islamicService.getChallengeDetail(id);
  }

  @Post('dhikr/challenges/:id/join')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Join a challenge' })
  async joinChallenge(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.islamicService.joinChallenge(userId, id);
  }

  @Post('dhikr/challenges/:id/contribute')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Contribute to a challenge' })
  async contributeToChallenge(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: ContributeDhikrDto) {
    return this.islamicService.contributeToChallenge(userId, id, dto.count);
  }
}