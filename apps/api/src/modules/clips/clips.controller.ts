import { Throttle } from '@nestjs/throttler';
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
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ClipsService } from './clips.service';
import { CreateClipDto } from './dto/create-clip.dto';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Clips (Minbar)')
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('clips')
export class ClipsController {
  constructor(private clipsService: ClipsService) {}

  @Post('video/:videoId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a clip from a video' })
  create(
    @CurrentUser('id') userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: CreateClipDto,
  ) {
    return this.clipsService.create(userId, videoId, dto);
  }

  @Get('video/:videoId')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get clips for a video' })
  getByVideo(
    @Param('videoId') videoId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.clipsService.getByVideo(videoId, cursor, limit ? parseInt(limit, 10) || 20 : undefined);
  }

  @Get('me')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get clips created by the current user' })
  getByUser(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.clipsService.getByUser(userId, cursor, limit ? parseInt(limit, 10) || 20 : undefined);
  }

  @Delete(':id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a clip' })
  delete(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.clipsService.delete(id, userId);
  }

  @Get(':id/share')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get share link for a clip' })
  getShareLink(@Param('id') id: string) {
    return this.clipsService.getShareLink(id);
  }
}
