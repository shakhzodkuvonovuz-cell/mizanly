import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ClipsService } from './clips.service';
import { CreateClipDto } from './dto/create-clip.dto';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('clips')
export class ClipsController {
  constructor(private clipsService: ClipsService) {}

  @Post('video/:videoId')
  @UseGuards(ClerkAuthGuard)
  create(
    @CurrentUser('id') userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: CreateClipDto,
  ) {
    return this.clipsService.create(userId, videoId, dto);
  }

  @Get('video/:videoId')
  @UseGuards(OptionalClerkAuthGuard)
  getByVideo(
    @Param('videoId') videoId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.clipsService.getByVideo(videoId, cursor, limit ? parseInt(limit) : undefined);
  }

  @Get('me')
  @UseGuards(ClerkAuthGuard)
  getByUser(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.clipsService.getByUser(userId, cursor, limit ? parseInt(limit) : undefined);
  }

  @Delete(':id')
  @UseGuards(ClerkAuthGuard)
  delete(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.clipsService.delete(id, userId);
  }

  @Get(':id/share')
  @UseGuards(OptionalClerkAuthGuard)
  getShareLink(@Param('id') id: string) {
    return this.clipsService.getShareLink(id);
  }
}
