import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CommunitiesService } from './communities.service';
import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Communities')
@Controller('communities')
export class CommunitiesController {
  constructor(private communitiesService: CommunitiesService) {}

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post()
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create community' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateCommunityDto) {
    return this.communitiesService.create(userId, dto);
  }

  @Get()
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'List communities' })
  list(
    @CurrentUser('id') viewerId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = 20,
  ) {
    return this.communitiesService.list(viewerId, cursor, limit);
  }

  @Get(':id')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get community detail' })
  getById(
    @Param('id') id: string,
    @CurrentUser('id') viewerId?: string,
  ) {
    return this.communitiesService.getById(id, viewerId);
  }

  @Patch(':id')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update community (owner/admin only)' })
  update(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateCommunityDto,
  ) {
    return this.communitiesService.update(id, userId, dto);
  }

  @Delete(':id')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete community (owner only)' })
  delete(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.communitiesService.delete(id, userId);
  }

  @Post(':id/join')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Join community' })
  join(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.communitiesService.join(id, userId);
  }

  @Delete(':id/leave')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave community' })
  leave(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.communitiesService.leave(id, userId);
  }

  @Get(':id/members')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'List community members' })
  listMembers(
    @Param('id') id: string,
    @CurrentUser('id') viewerId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = 50,
  ) {
    return this.communitiesService.listMembers(id, viewerId, cursor, limit);
  }
}