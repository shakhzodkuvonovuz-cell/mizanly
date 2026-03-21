import {
  Controller, Post, Get,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AiService } from './ai.service';
import {
  SuggestCaptionsDto, SuggestHashtagsDto, TranslateDto, ModerateDto,
  SmartRepliesDto, SummarizeDto, RouteSpaceDto, GenerateCaptionsDto, GenerateAvatarDto,
} from './dto/ai.dto';

@ApiTags('AI')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('suggest-captions')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Get AI-suggested captions' })
  suggestCaptions(@Body() dto: SuggestCaptionsDto) {
    return this.aiService.suggestCaptions(dto.content || '', dto.mediaDescription);
  }

  @Post('suggest-hashtags')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Get AI-suggested hashtags' })
  suggestHashtags(@Body() dto: SuggestHashtagsDto) {
    return this.aiService.suggestHashtags(dto.content);
  }

  @Get('suggest-posting-time')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Get suggested best posting time' })
  suggestPostingTime(@CurrentUser('id') userId: string) {
    return this.aiService.suggestPostingTime(userId);
  }

  @Post('translate')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Translate text' })
  translate(@Body() dto: TranslateDto) {
    return this.aiService.translateText(dto.text, dto.targetLanguage, dto.contentId, dto.contentType);
  }

  @Post('moderate')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Moderate content' })
  moderate(@Body() dto: ModerateDto) {
    return this.aiService.moderateContent(dto.text, dto.contentType);
  }

  @Post('smart-replies')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Get smart reply suggestions' })
  smartReplies(@Body() dto: SmartRepliesDto) {
    return this.aiService.suggestSmartReplies(dto.conversationContext, dto.lastMessages);
  }

  @Post('summarize')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Summarize content' })
  summarize(@Body() dto: SummarizeDto) {
    return this.aiService.summarizeContent(dto.text, dto.maxLength);
  }

  @Post('route-space')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Get recommended space for content' })
  routeSpace(@Body() dto: RouteSpaceDto) {
    return this.aiService.routeToSpace(dto.content, dto.mediaTypes);
  }

  @Post('videos/:videoId/captions')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Generate AI captions for video' })
  generateCaptions(@Param('videoId') videoId: string, @Body() dto: GenerateCaptionsDto) {
    return this.aiService.generateVideoCaptions(videoId, dto.audioUrl, dto.language);
  }

  @Get('videos/:videoId/captions')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get video captions' })
  getCaptions(@Param('videoId') videoId: string, @Query('language') language?: string) {
    return this.aiService.getVideoCaptions(videoId, language || 'en');
  }

  @Post('avatar')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Generate AI avatar' })
  generateAvatar(@CurrentUser('id') userId: string, @Body() dto: GenerateAvatarDto) {
    return this.aiService.generateAvatar(userId, dto.sourceUrl, dto.style || 'default');
  }

  @Get('avatars')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Get user AI avatars' })
  getUserAvatars(@CurrentUser('id') userId: string) {
    return this.aiService.getUserAvatars(userId);
  }
}
