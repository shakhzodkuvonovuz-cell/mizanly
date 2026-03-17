import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { StoryChainsService } from './story-chains.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Story Chains')
@Controller('story-chains')
export class StoryChainsController {
  constructor(private storyChainsService: StoryChainsService) {}

  @Post()
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new story chain (Add Yours)' })
  createChain(
    @CurrentUser('id') userId: string,
    @Body() body: { prompt: string; coverUrl?: string },
  ) {
    return this.storyChainsService.createChain(userId, body);
  }

  @Get('trending')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get trending story chains' })
  getTrending(@Query('cursor') cursor?: string) {
    return this.storyChainsService.getTrending(cursor);
  }

  @Get(':chainId')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get a story chain with entries' })
  getChain(
    @Param('chainId') chainId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.storyChainsService.getChain(chainId, cursor);
  }

  @Post(':chainId/join')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Join a story chain with your story' })
  joinChain(
    @Param('chainId') chainId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { storyId: string },
  ) {
    return this.storyChainsService.joinChain(chainId, userId, body.storyId);
  }

  @Get(':chainId/stats')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get story chain statistics' })
  getStats(@Param('chainId') chainId: string) {
    return this.storyChainsService.getStats(chainId);
  }
}
