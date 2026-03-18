import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { WatchHistoryService } from './watch-history.service';
import { RecordWatchDto } from './dto/record-watch.dto';
import { AddToWatchLaterDto } from './dto/add-to-watch-later.dto';

@ApiTags('Watch History')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('watch-history')
export class WatchHistoryController {
  constructor(private service: WatchHistoryService) {}

  @Post('record')
  @ApiOperation({ summary: 'Record watch progress for a video' })
  recordWatch(
    @CurrentUser('id') userId: string,
    @Body() dto: RecordWatchDto,
  ) {
    return this.service.recordWatch(
      userId,
      dto.videoId,
      dto.progress,
      dto.completed,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get user watch history with pagination' })
  getHistory(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.service.getHistory(userId, cursor);
  }

  @Delete(':videoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a video from watch history' })
  removeFromHistory(
    @CurrentUser('id') userId: string,
    @Param('videoId') videoId: string,
  ) {
    return this.service.removeFromHistory(userId, videoId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clear all watch history' })
  clearHistory(@CurrentUser('id') userId: string) {
    return this.service.clearHistory(userId);
  }

  @Post('watch-later')
  @ApiOperation({ summary: 'Add video to watch later' })
  addToWatchLater(
    @CurrentUser('id') userId: string,
    @Body() dto: AddToWatchLaterDto,
  ) {
    return this.service.addToWatchLater(userId, dto.videoId);
  }

  @Delete('watch-later/:videoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove video from watch later' })
  removeFromWatchLater(
    @CurrentUser('id') userId: string,
    @Param('videoId') videoId: string,
  ) {
    return this.service.removeFromWatchLater(userId, videoId);
  }

  @Get('watch-later')
  @ApiOperation({ summary: 'Get watch later list with pagination' })
  getWatchLater(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.service.getWatchLater(userId, cursor);
  }

  @Get('watch-later/:videoId/status')
  @ApiOperation({ summary: 'Check if video is in watch later' })
  isInWatchLater(
    @CurrentUser('id') userId: string,
    @Param('videoId') videoId: string,
  ) {
    return this.service.isInWatchLater(userId, videoId);
  }
}