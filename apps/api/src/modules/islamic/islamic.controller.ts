import { Throttle } from '@nestjs/throttler';
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
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam, ApiBearerAuth, ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsInt, Min, Max, IsIn, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
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
import { IsBoolean, IsDateString } from 'class-validator';

class LogFastDto {
  @IsDateString() date: string;
  @IsBoolean() isFasting: boolean;
  @IsOptional() @IsString() @IsIn(['RAMADAN', 'MONDAY', 'THURSDAY', 'AYYAM_AL_BID', 'ARAFAT', 'ASHURA', 'QADA', 'NAFL', 'OBLIGATORY', 'SUNNAH', 'VOLUNTARY', 'MAKEUP']) fastType?: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

class UpdateHifzStatusDto {
  @IsString() @IsIn(['NOT_STARTED', 'IN_PROGRESS', 'MEMORIZED', 'NEEDS_REVIEW']) status: string;
}

class CompleteDailyTaskDto {
  @IsString() @IsIn(['DHIKR', 'QURAN', 'REFLECTION']) taskType: string;
}

class PrayerTimesQueryDto {
  @ApiProperty({ description: 'Latitude', example: 24.7136 })
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90)
  lat: number;

  @ApiProperty({ description: 'Longitude', example: 46.6753 })
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180)
  lng: number;

  @ApiProperty({ description: 'Calculation method', example: 'MWL', required: false })
  @IsOptional() @IsString()
  method?: string;

  @ApiProperty({ description: 'Date in YYYY-MM-DD format', example: '2026-03-13', required: false })
  @IsOptional() @IsString()
  date?: string;
}

class MosquesQueryDto {
  @ApiProperty({ description: 'Latitude', example: 24.7136 })
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90)
  lat: number;

  @ApiProperty({ description: 'Longitude', example: 46.6753 })
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180)
  lng: number;

  @ApiProperty({ description: 'Search radius in kilometers', example: 10, required: false })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(100)
  radius?: number;
}

class ZakatCalculationQueryDto {
  @ApiProperty({ description: 'Cash amount in base currency', example: 5000 })
  @Type(() => Number) @IsNumber() @Min(0)
  cash: number;

  @ApiProperty({ description: 'Gold amount in grams', example: 50 })
  @Type(() => Number) @IsNumber() @Min(0)
  gold: number;

  @ApiProperty({ description: 'Silver amount in grams', example: 200 })
  @Type(() => Number) @IsNumber() @Min(0)
  silver: number;

  @ApiProperty({ description: 'Investment value', example: 10000 })
  @Type(() => Number) @IsNumber() @Min(0)
  investments: number;

  @ApiProperty({ description: 'Debts owed', example: 2000 })
  @Type(() => Number) @IsNumber() @Min(0)
  debts: number;
}

class RamadanInfoQueryDto {
  @ApiProperty({ description: 'Year (default current year)', example: 2026, required: false })
  @IsOptional() @Type(() => Number) @IsInt() @Min(2020) @Max(2100)
  year?: number;

  @ApiProperty({ description: 'Latitude', example: 24.7136, required: false })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90)
  lat?: number;

  @ApiProperty({ description: 'Longitude', example: 46.6753, required: false })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180)
  lng?: number;
}

class FollowMosqueDto {
  @IsString() @MaxLength(200) mosqueName: string;
  @IsNumber() @Min(-90) @Max(90) lat: number;
  @IsNumber() @Min(-180) @Max(180) lng: number;
}

class ClassifyContentDto {
  @IsString() @MaxLength(10000) content: string;
}

@ApiTags('Islamic')
@Throttle({ default: { limit: 30, ttl: 60000 } })
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
  getHadiths(@Query('cursor') cursor?: string) {
    return this.islamicService.getHadiths(cursor ? parseInt(cursor, 10) : undefined);
  }

  @Post('hadiths/:id/bookmark')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Toggle hadith bookmark' })
  @ApiParam({ name: 'id', description: 'Hadith ID (1-40)' })
  async bookmarkHadith(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: string) {
    return this.islamicService.toggleHadithBookmark(userId, id);
  }

  @Get('mosques')
  @ApiOperation({ summary: 'Find nearby mosques' })
  @ApiResponse({ status: 200, description: 'List of nearby mosques', type: Object })
  async getNearbyMosques(@Query() query: MosquesQueryDto): Promise<Mosque[]> {
    return this.islamicService.getNearbyMosques(query.lat, query.lng, query.radius);
  }

  @Post('mosques/follow')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Follow a mosque to get its specific prayer times' })
  async followMosque(
    @CurrentUser('id') userId: string,
    @Body() body: FollowMosqueDto,
  ) {
    return this.islamicService.followMosque(userId, body.mosqueName, body.lat, body.lng);
  }

  @Get('mosques/my-mosque')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get prayer times for your followed mosque' })
  async getMyMosqueTimes(@CurrentUser('id') userId: string) {
    return this.islamicService.getFollowedMosqueTimes(userId);
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
  async getRamadanInfo(@Query() query: RamadanInfoQueryDto): Promise<RamadanInfoResponse> {
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
  @Throttle({ default: { limit: 5, ttl: 60000 } })
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

  // ── Quran Text ──

  @Get('quran/chapters')
  @ApiOperation({ summary: 'List all 114 surahs with metadata' })
  getQuranChapters() {
    return this.islamicService.getQuranChapters();
  }

  @Get('quran/chapters/:surahNumber')
  @ApiOperation({ summary: 'Get single surah metadata' })
  @ApiParam({ name: 'surahNumber', description: 'Surah number (1-114)', example: 1 })
  getQuranChapter(@Param('surahNumber', ParseIntPipe) surahNumber: number) {
    return this.islamicService.getQuranChapter(surahNumber);
  }

  @Get('quran/chapters/:surahNumber/verses')
  @ApiOperation({ summary: 'Get all verses in a surah (Arabic text + translation)' })
  @ApiParam({ name: 'surahNumber', description: 'Surah number (1-114)', example: 1 })
  @ApiQuery({ name: 'translation', required: false, description: 'Translation language (en, ar, tr, ur, bn, fr, id, ms)', example: 'en' })
  async getQuranVerses(
    @Param('surahNumber', ParseIntPipe) surahNumber: number,
    @Query('translation') translation?: string,
  ) {
    return this.islamicService.getQuranVerses(surahNumber, translation);
  }

  @Get('quran/chapters/:surahNumber/verses/:ayahNumber')
  @ApiOperation({ summary: 'Get a single verse (Arabic text + translation + audio)' })
  @ApiParam({ name: 'surahNumber', description: 'Surah number (1-114)', example: 2 })
  @ApiParam({ name: 'ayahNumber', description: 'Ayah number', example: 255 })
  @ApiQuery({ name: 'translation', required: false, description: 'Translation language', example: 'en' })
  async getQuranVerse(
    @Param('surahNumber', ParseIntPipe) surahNumber: number,
    @Param('ayahNumber', ParseIntPipe) ayahNumber: number,
    @Query('translation') translation?: string,
  ) {
    return this.islamicService.getQuranVerse(surahNumber, ayahNumber, translation);
  }

  @Get('quran/juz/:juzNumber')
  @ApiOperation({ summary: 'Get all verses in a specific juz (part)' })
  @ApiParam({ name: 'juzNumber', description: 'Juz number (1-30)', example: 30 })
  @ApiQuery({ name: 'translation', required: false, description: 'Translation language', example: 'en' })
  async getQuranJuz(
    @Param('juzNumber', ParseIntPipe) juzNumber: number,
    @Query('translation') translation?: string,
  ) {
    return this.islamicService.getQuranJuz(juzNumber, translation);
  }

  @Get('quran/search')
  @ApiOperation({ summary: 'Search Quran text (Arabic or translation)' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query', example: 'patience' })
  @ApiQuery({ name: 'translation', required: false, description: 'Translation language', example: 'en' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max results', example: 20 })
  async searchQuran(
    @Query('q') query: string,
    @Query('translation') translation?: string,
    @Query('limit') limit?: string,
  ) {
    return this.islamicService.searchQuran(query, translation, limit ? parseInt(limit, 10) : undefined);
  }

  @Get('quran/random-ayah')
  @ApiOperation({ summary: 'Get a random ayah (for Ayah of the Day)' })
  @ApiQuery({ name: 'translation', required: false, description: 'Translation language', example: 'en' })
  async getRandomAyah(@Query('translation') translation?: string) {
    return this.islamicService.getRandomAyah(translation);
  }

  // ── Charity / Sadaqah ──

  @Post('charity/campaigns')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
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
  @Throttle({ default: { limit: 5, ttl: 60000 } })
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
  @Throttle({ default: { limit: 1, ttl: 86400000 } })
  @ApiOperation({ summary: 'Apply for scholar verification (1/day)' })
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

  @Get('dhikr/community')
  @ApiOperation({ summary: 'Get global community dhikr counter (all-time + today)' })
  async getCommunityDhikrTotal() {
    return this.islamicService.getCommunityDhikrTotal();
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
  @Throttle({ default: { limit: 5, ttl: 60000 } })
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

  // ============================================================
  // PRAYER TIME AWARENESS
  // ============================================================

  @Get('prayer-times/current-window')
  @ApiOperation({ summary: 'Get current prayer window and minutes until next prayer' })
  @ApiQuery({ name: 'fajr', required: true, type: String })
  @ApiQuery({ name: 'dhuhr', required: true, type: String })
  @ApiQuery({ name: 'asr', required: true, type: String })
  @ApiQuery({ name: 'maghrib', required: true, type: String })
  @ApiQuery({ name: 'isha', required: true, type: String })
  async getCurrentPrayerWindow(
    @Query('fajr') fajr: string,
    @Query('dhuhr') dhuhr: string,
    @Query('asr') asr: string,
    @Query('maghrib') maghrib: string,
    @Query('isha') isha: string,
  ) {
    // Validate HH:MM format for all prayer times
    const timeRegex = /^\d{1,2}:\d{2}$/;
    const times = { fajr, dhuhr, asr, maghrib, isha };
    for (const [name, value] of Object.entries(times)) {
      if (!value || !timeRegex.test(value)) {
        throw new NotFoundException(`Invalid time format for ${name}. Expected HH:MM`);
      }
    }
    return this.islamicService.getCurrentPrayerWindow(times);
  }

  // ============================================================
  // FASTING TRACKER
  // ============================================================

  @Post('fasting/log')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log a fast (or not fasting with reason)' })
  async logFast(
    @CurrentUser('id') userId: string,
    @Body() body: LogFastDto,
  ) {
    return this.islamicService.logFast(userId, body);
  }

  @Get('fasting/log')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get fasting log for a month (YYYY-MM)' })
  @ApiQuery({ name: 'month', required: true, type: String })
  async getFastingLog(
    @CurrentUser('id') userId: string,
    @Query('month') month: string,
  ) {
    return this.islamicService.getFastingLog(userId, month);
  }

  @Get('fasting/stats')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get fasting stats (streak, total, makeup)' })
  async getFastingStats(@CurrentUser('id') userId: string) {
    return this.islamicService.getFastingStats(userId);
  }

  // ============================================================
  // DUA COLLECTION
  // ============================================================

  @Get('duas')
  @ApiOperation({ summary: 'List duas, optionally filtered by category' })
  @ApiQuery({ name: 'category', required: false, type: String })
  async getDuas(@Query('category') category?: string) {
    return this.islamicService.getDuasByCategory(category);
  }

  @Get('duas/daily')
  @ApiOperation({ summary: 'Get dua of the day' })
  async getDuaOfTheDay() {
    return this.islamicService.getDuaOfTheDay();
  }

  @Get('duas/categories')
  @ApiOperation({ summary: 'List all dua categories' })
  async getDuaCategories() {
    return this.islamicService.getDuaCategories();
  }

  @Get('duas/bookmarked')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get bookmarked duas' })
  async getBookmarkedDuas(@CurrentUser('id') userId: string) {
    return this.islamicService.getBookmarkedDuas(userId);
  }

  @Get('duas/:id')
  @ApiOperation({ summary: 'Get single dua by ID' })
  async getDuaById(@Param('id') id: string) {
    const dua = this.islamicService.getDuaById(id);
    if (!dua) throw new NotFoundException('Dua not found');
    return dua;
  }

  @Post('duas/:id/bookmark')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bookmark a dua' })
  async bookmarkDua(@CurrentUser('id') userId: string, @Param('id') duaId: string) {
    return this.islamicService.bookmarkDua(userId, duaId);
  }

  @Delete('duas/:id/bookmark')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove dua bookmark' })
  async unbookmarkDua(@CurrentUser('id') userId: string, @Param('id') duaId: string) {
    return this.islamicService.unbookmarkDua(userId, duaId);
  }

  // ============================================================
  // 99 NAMES OF ALLAH
  // ============================================================

  @Get('names-of-allah')
  @ApiOperation({ summary: 'Get all 99 Names of Allah' })
  async getAllNames() {
    return this.islamicService.getAllNamesOfAllah();
  }

  @Get('names-of-allah/daily')
  @ApiOperation({ summary: 'Get the daily Name of Allah' })
  async getDailyName() {
    return this.islamicService.getDailyNameOfAllah();
  }

  @Get('names-of-allah/:number')
  @ApiOperation({ summary: 'Get a single Name by number (1-99)' })
  async getNameByNumber(@Param('number', ParseIntPipe) num: number) {
    const name = this.islamicService.getNameOfAllahByNumber(num);
    if (!name) throw new NotFoundException('Name not found');
    return name;
  }

  // ============================================================
  // HIFZ (QURAN MEMORIZATION) TRACKER
  // ============================================================

  @Get('hifz/progress')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all 114 surahs with memorization status' })
  async getHifzProgress(@CurrentUser('id') userId: string) {
    return this.islamicService.getHifzProgress(userId);
  }

  @Patch('hifz/progress/:surahNum')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update surah memorization status' })
  async updateHifzProgress(
    @CurrentUser('id') userId: string,
    @Param('surahNum', ParseIntPipe) surahNum: number,
    @Body() body: UpdateHifzStatusDto,
  ) {
    return this.islamicService.updateHifzProgress(userId, surahNum, body.status);
  }

  @Get('hifz/stats')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get hifz stats (memorized, in-progress, percentage)' })
  async getHifzStats(@CurrentUser('id') userId: string) {
    return this.islamicService.getHifzStats(userId);
  }

  @Get('hifz/review-schedule')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get surahs needing review (spaced repetition)' })
  async getHifzReviewSchedule(@CurrentUser('id') userId: string) {
    return this.islamicService.getHifzReviewSchedule(userId);
  }

  // ============================================================
  // DAILY BRIEFING
  // ============================================================

  @Get('daily-briefing')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get morning briefing with prayer times, hadith, dua, daily tasks' })
  @ApiQuery({ name: 'lat', required: false, type: Number })
  @ApiQuery({ name: 'lng', required: false, type: Number })
  async getDailyBriefing(
    @CurrentUser('id') userId: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    return this.islamicService.getDailyBriefing(
      userId,
      lat ? parseFloat(lat) : undefined,
      lng ? parseFloat(lng) : undefined,
    );
  }

  @Post('daily-tasks/complete')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete a daily task (dhikr, quran, or reflection)' })
  async completeDailyTask(
    @CurrentUser('id') userId: string,
    @Body() body: CompleteDailyTaskDto,
  ) {
    return this.islamicService.completeDailyTask(userId, body.taskType);
  }

  @Get('daily-tasks/today')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get today\'s daily task completion status' })
  async getDailyTasksToday(@CurrentUser('id') userId: string) {
    return this.islamicService.getDailyTasksToday(userId);
  }

  // Finding #247: Islamic glossary
  @Get('glossary')
  @ApiOperation({ summary: 'Get Islamic glossary terms with definitions' })
  getGlossary(@Query('q') query?: string) {
    return this.islamicService.getGlossary(query);
  }

  // Finding #319-321: Islamic content classification
  @Post('classify-content')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Classify text into Islamic content categories' })
  classifyContent(@Body() dto: ClassifyContentDto) {
    return this.islamicService.classifyIslamicContent(dto.content);
  }

  // Finding #323: Hadith grade detection
  @Post('detect-hadith-grade')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Detect hadith grade and collection from text' })
  detectHadithGrade(@Body() dto: ClassifyContentDto) {
    return this.islamicService.detectHadithGrade(dto.content);
  }
}