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
  Header,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CommunitiesService } from './communities.service';
import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';
import { CreateRoleDto, UpdateRoleDto } from './dto/manage-role.dto';
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
    const safeLim = Math.min(Math.max(Number(limit) || 20, 1), 100);
    return this.communitiesService.list(viewerId, cursor, safeLim);
  }

  @Get(':id')
  @UseGuards(OptionalClerkAuthGuard)
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=120')
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
    const safeLim = Math.min(Math.max(Number(limit) || 50, 1), 100);
    return this.communitiesService.listMembers(id, viewerId, cursor, safeLim);
  }

  // ── Role Management ────────────────────────────────

  @Get(':id/roles')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'List community roles' })
  listRoles(@Param('id') id: string) {
    return this.communitiesService.listRoles(id);
  }

  @Post(':id/roles')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create community role (admin only)' })
  createRole(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateRoleDto,
  ) {
    return this.communitiesService.createRole(id, userId, dto);
  }

  @Patch(':id/roles/:roleId')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update community role (admin only)' })
  updateRole(
    @Param('id') _id: string,
    @Param('roleId') roleId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.communitiesService.updateRole(roleId, userId, dto);
  }

  @Delete(':id/roles/:roleId')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete community role (admin only)' })
  deleteRole(
    @Param('id') _id: string,
    @Param('roleId') roleId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.communitiesService.deleteRole(roleId, userId);
  }
}