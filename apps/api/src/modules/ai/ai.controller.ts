import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AiService } from './ai.service';

@ApiTags('AI')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  // ── Caption Suggestions ─────────────────────────────────

  @Post('suggest-captions')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Get AI-suggested captions' })
  suggestCaptions(@Body() dto: { content?: string; mediaDescription?: string }) {
    return this.aiService.suggestCaptions(dto.content || '', dto.mediaDescription);
  }

  // ── Hashtag Suggestions ─────────────────────────────────

  @Post('suggest-hashtags')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Get AI-suggested hashtags' })
  suggestHashtags(@Body() dto: { content: string }) {
    return this.aiService.suggestHashtags(dto.content);
  }

  // ── Best Posting Time ───────────────────────────────────

  @Get('suggest-posting-time')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Get suggested best posting time' })
  suggestPostingTime(@CurrentUser('id') userId: string) {
    return this.aiService.suggestPostingTime(userId);
  }

  // ── Translation ─────────────────────────────────────────

  @Post('translate')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Translate text' })
  translate(@Body() dto: { text: string; targetLanguage: string; contentId?: string; contentType?: string }) {
    return this.aiService.translateText(dto.text, dto.targetLanguage, dto.contentId, dto.contentType);
  }

  // ── Content Moderation ──────────────────────────────────

  @Post('moderate')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Moderate content' })
  moderate(@Body() dto: { text: string; contentType: string }) {
    return this.aiService.moderateContent(dto.text, dto.contentType);
  }

  // ── Smart Replies ───────────────────────────────────────

  @Post('smart-replies')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Get smart reply suggestions' })
  smartReplies(@Body() dto: { conversationContext: string; lastMessages: string[] }) {
    return this.aiService.suggestSmartReplies(dto.conversationContext, dto.lastMessages);
  }

  // ── Summarization ───────────────────────────────────────

  @Post('summarize')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Summarize content' })
  summarize(@Body() dto: { text: string; maxLength?: number }) {
    return this.aiService.summarizeContent(dto.text, dto.maxLength);
  }

  // ── Smart Space Routing ─────────────────────────────────

  @Post('route-space')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Get recommended space for content' })
  routeSpace(@Body() dto: { content: string; mediaTypes: string[] }) {
    return this.aiService.routeToSpace(dto.content, dto.mediaTypes);
  }

  // ── Video Captions ──────────────────────────────────────

  @Post('videos/:videoId/captions')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Generate AI captions for video' })
  generateCaptions(
    @Param('videoId') videoId: string,
    @Body() dto: { audioUrl: string; language?: string },
  ) {
    return this.aiService.generateVideoCaptions(videoId, dto.audioUrl, dto.language);
  }

  @Get('videos/:videoId/captions')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get video captions' })
  getCaptions(
    @Param('videoId') videoId: string,
    @Query('language') language?: string,
  ) {
    return this.aiService.getVideoCaptions(videoId, language || 'en');
  }

  // ── AI Avatar ───────────────────────────────────────────

  @Post('avatar')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Generate AI avatar' })
  generateAvatar(
    @CurrentUser('id') userId: string,
    @Body() dto: { sourceUrl: string; style?: string },
  ) {
    return this.aiService.generateAvatar(userId, dto.sourceUrl, dto.style || 'default');
  }

  @Get('avatars')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Get user AI avatars' })
  getUserAvatars(@CurrentUser('id') userId: string) {
    return this.aiService.getUserAvatars(userId);
  }
}
