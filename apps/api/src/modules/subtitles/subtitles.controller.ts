import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Redirect,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SubtitlesService, CreateSubtitleTrackDto } from './subtitles.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Subtitles')
@Controller('videos/:videoId/subtitles')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class SubtitlesController {
  constructor(private subtitlesService: SubtitlesService) {}

  @Get()
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'List subtitle tracks for a video' })
  listTracks(
    @Param('videoId') videoId: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.subtitlesService.listTracks(videoId, userId);
  }

  @Post()
  @ApiOperation({ summary: 'Upload subtitle track' })
  createTrack(
    @Param('videoId') videoId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateSubtitleTrackDto,
  ) {
    return this.subtitlesService.createTrack(videoId, userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete subtitle track' })
  deleteTrack(
    @Param('videoId') videoId: string,
    @Param('id') trackId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.subtitlesService.deleteTrack(videoId, trackId, userId);
  }

  @Get(':id/srt')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get SRT file content (redirect)' })
  @Redirect()
  async getSrtRedirect(
    @Param('videoId') videoId: string,
    @Param('id') trackId: string,
    @CurrentUser('id') userId?: string,
  ) {
    const { url } = await this.subtitlesService.getSrtRedirect(videoId, trackId, userId);
    return { url };
  }
}