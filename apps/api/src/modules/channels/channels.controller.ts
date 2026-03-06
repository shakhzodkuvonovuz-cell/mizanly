import {
  Controller,
  Post,
  Get,
  Patch,
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

  @Get('me/channels')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user channels' })
  getMyChannels(@CurrentUser('id') userId: string) {
    return this.channelsService.getMyChannels(userId);
  }
}