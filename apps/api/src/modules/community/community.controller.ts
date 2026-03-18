import {
  Controller, Post, Get, Patch, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CommunityService } from './community.service';
import {
  CreateBoardDto, RequestMentorshipDto, RespondMentorshipDto,
  CreateStudyCircleDto, AskFatwaDto, AnswerFatwaDto,
  CreateOpportunityDto, CreateEventDto, CreateVoicePostDto,
  CreateWatchPartyDto, CreateCollectionDto, CreateWaqfDto, KindnessCheckDto,
} from './dto/community.dto';

@ApiTags('Community')
@Controller()
export class CommunityController {
  constructor(private communityService: CommunityService) {}

  // ── Local Boards ────────────────────────────────────────

  @Post('boards')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Create local board' })
  createBoard(@CurrentUser('id') userId: string, @Body() dto: CreateBoardDto) {
    return this.communityService.createBoard(userId, dto);
  }

  @Get('boards')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get local boards' })
  getBoards(@Query('city') city?: string, @Query('country') country?: string, @Query('cursor') cursor?: string) {
    return this.communityService.getBoards(city, country, cursor);
  }

  // ── Mentorship ──────────────────────────────────────────

  @Post('mentorship/request')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Request mentorship' })
  requestMentorship(@CurrentUser('id') userId: string, @Body() dto: RequestMentorshipDto) {
    return this.communityService.requestMentorship(userId, dto);
  }

  @Patch('mentorship/:menteeId/respond')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Accept/decline mentorship' })
  respondMentorship(@CurrentUser('id') userId: string, @Param('menteeId') menteeId: string, @Body() dto: RespondMentorshipDto) {
    return this.communityService.respondMentorship(userId, menteeId, dto.accept);
  }

  @Get('mentorship/me')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Get my mentorships' })
  getMyMentorships(@CurrentUser('id') userId: string) {
    return this.communityService.getMyMentorships(userId);
  }

  // ── Study Circles ───────────────────────────────────────

  @Post('study-circles')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Create study circle' })
  createStudyCircle(@CurrentUser('id') userId: string, @Body() dto: CreateStudyCircleDto) {
    return this.communityService.createStudyCircle(userId, dto);
  }

  @Get('study-circles')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Browse study circles' })
  getStudyCircles(@Query('topic') topic?: string, @Query('cursor') cursor?: string) {
    return this.communityService.getStudyCircles(topic, cursor);
  }

  // ── Fatwa Q&A ───────────────────────────────────────────

  @Post('fatwa')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Ask fatwa question' })
  askFatwa(@CurrentUser('id') userId: string, @Body() dto: AskFatwaDto) {
    return this.communityService.askFatwa(userId, dto);
  }

  @Get('fatwa')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Browse fatwa questions' })
  getFatwaQuestions(@Query('status') status?: string, @Query('madhab') madhab?: string, @Query('cursor') cursor?: string) {
    return this.communityService.getFatwaQuestions(status, madhab, cursor);
  }

  @Post('fatwa/:id/answer')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Answer fatwa (scholar)' })
  answerFatwa(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: AnswerFatwaDto) {
    return this.communityService.answerFatwa(userId, id, dto.answer);
  }

  // ── Volunteer ───────────────────────────────────────────

  @Post('volunteer')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Create volunteer opportunity' })
  createOpportunity(@CurrentUser('id') userId: string, @Body() dto: CreateOpportunityDto) {
    return this.communityService.createOpportunity(userId, dto);
  }

  @Get('volunteer')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Browse volunteer opportunities' })
  getOpportunities(@Query('category') category?: string, @Query('cursor') cursor?: string) {
    return this.communityService.getOpportunities(category, cursor);
  }

  // ── Islamic Events ──────────────────────────────────────

  @Post('events')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Create Islamic event' })
  createEvent(@CurrentUser('id') userId: string, @Body() dto: CreateEventDto) {
    return this.communityService.createEvent(userId, dto);
  }

  @Get('events')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Discover Islamic events' })
  getEvents(@Query('eventType') eventType?: string, @Query('cursor') cursor?: string) {
    return this.communityService.getEvents(eventType, cursor);
  }

  // ── Reputation ──────────────────────────────────────────

  @Get('reputation')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Get my reputation' })
  getReputation(@CurrentUser('id') userId: string) {
    return this.communityService.getReputation(userId);
  }

  // ── Voice Posts ─────────────────────────────────────────

  @Post('voice-posts')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Create voice post' })
  createVoicePost(@CurrentUser('id') userId: string, @Body() dto: CreateVoicePostDto) {
    return this.communityService.createVoicePost(userId, dto);
  }

  @Get('voice-posts')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get voice posts feed' })
  getVoicePosts(@Query('cursor') cursor?: string) {
    return this.communityService.getVoicePosts(cursor);
  }

  // ── Watch Parties ───────────────────────────────────────

  @Post('watch-parties')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Create watch party' })
  createWatchParty(@CurrentUser('id') userId: string, @Body() dto: CreateWatchPartyDto) {
    return this.communityService.createWatchParty(userId, dto);
  }

  @Get('watch-parties')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get active watch parties' })
  getActiveWatchParties() {
    return this.communityService.getActiveWatchParties();
  }

  // ── Collections ─────────────────────────────────────────

  @Post('collections')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Create shared collection' })
  createCollection(@CurrentUser('id') userId: string, @Body() dto: CreateCollectionDto) {
    return this.communityService.createCollection(userId, dto);
  }

  @Get('collections/me')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Get my collections' })
  getMyCollections(@CurrentUser('id') userId: string) {
    return this.communityService.getMyCollections(userId);
  }

  // ── Waqf ────────────────────────────────────────────────

  @Post('waqf')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Create waqf fund' })
  createWaqf(@CurrentUser('id') userId: string, @Body() dto: CreateWaqfDto) {
    return this.communityService.createWaqf(userId, dto);
  }

  @Get('waqf')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Browse waqf funds' })
  getWaqfFunds(@Query('cursor') cursor?: string) {
    return this.communityService.getWaqfFunds(cursor);
  }

  // ── Safety ──────────────────────────────────────────────

  @Post('kindness-check')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Check if comment needs kindness rephrase' })
  checkKindness(@Body() dto: KindnessCheckDto) {
    return this.communityService.checkKindness(dto.text);
  }

  @Get('data-export')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Export all user data' })
  getDataExport(@CurrentUser('id') userId: string) {
    return this.communityService.getDataExport(userId);
  }
}
