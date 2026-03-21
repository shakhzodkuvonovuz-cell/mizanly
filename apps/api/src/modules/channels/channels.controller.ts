import {
  Controller,
  Post,
  Get,
  Patch,
  Put,
  Delete,
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
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { SetTrailerDto } from './dto/set-trailer.dto';

@ApiTags('Channels (Minbar)')
@Controller('channels')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Post()
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a channel' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateChannelDto,
  ) {
    return this.channelsService.create(userId, dto);
  }

  // Static routes MUST be above :handle wildcard
  @Get('me/channels')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user channels' })
  getMyChannels(@CurrentUser('id') userId: string) {
    return this.channelsService.getMyChannels(userId);
  }

  @Get('recommended')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get recommended channels (excludes subscribed)' })
  getRecommended(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.channelsService.getRecommended(userId, limitNum);
  }

  @Get(':handle')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get channel by handle' })
  getByHandle(
    @Param('handle') handle: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.channelsService.getByHandle(handle, userId);
  }

  @Patch(':handle')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update channel details' })
  update(
    @Param('handle') handle: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateChannelDto,
  ) {
    return this.channelsService.update(handle, userId, dto);
  }

  @Delete(':handle')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a channel' })
  delete(
    @Param('handle') handle: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.channelsService.delete(handle, userId);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post(':handle/subscribe')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Subscribe to a channel' })
  subscribe(
    @Param('handle') handle: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.channelsService.subscribe(handle, userId);
  }

  @Delete(':handle/subscribe')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unsubscribe from a channel' })
  unsubscribe(
    @Param('handle') handle: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.channelsService.unsubscribe(handle, userId);
  }

  @Get(':handle/videos')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get channel videos (paginated)' })
  getVideos(
    @Param('handle') handle: string,
    @CurrentUser('id') userId?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.channelsService.getVideos(handle, userId, cursor);
  }

  @Get(':handle/analytics')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get channel analytics (owner only)' })
  getAnalytics(
    @Param('handle') handle: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.channelsService.getAnalytics(handle, userId);
  }

  @Get(':handle/subscribers')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get channel subscribers (owner only, paginated)' })
  getSubscribers(
    @Param('handle') handle: string,
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.channelsService.getSubscribers(handle, userId, cursor);
  }

  @Put(':handle/trailer')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set channel trailer video (owner only)' })
  setTrailer(
    @Param('handle') handle: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SetTrailerDto,
  ) {
    return this.channelsService.setTrailer(handle, userId, dto.videoId);
  }

  @Delete(':handle/trailer')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove channel trailer video (owner only)' })
  removeTrailer(
    @Param('handle') handle: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.channelsService.removeTrailer(handle, userId);
  }

}