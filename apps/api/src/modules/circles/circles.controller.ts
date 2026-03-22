import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CirclesService } from './circles.service';
import { CreateCircleDto } from './dto/create-circle.dto';
import { UpdateCircleDto } from './dto/update-circle.dto';
import { ManageMembersDto } from './dto/manage-members.dto';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Circles')
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('circles')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class CirclesController {
  constructor(private circlesService: CirclesService) {}

  @Get()
  @ApiOperation({ summary: 'Get my circles' })
  getMyCircles(@CurrentUser('id') userId: string) { return this.circlesService.getMyCircles(userId); }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a circle' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateCircleDto) {
    return this.circlesService.create(userId, dto.name, dto.memberIds);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a circle' })
  update(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: UpdateCircleDto) {
    return this.circlesService.update(id, userId, dto.name);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a circle' })
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.circlesService.delete(id, userId); }

  @Get(':id/members')
  @ApiOperation({ summary: 'Get circle members (cursor paginated)' })
  getMembers(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.circlesService.getMembers(id, userId, cursor);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add members to circle' })
  addMembers(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: ManageMembersDto) {
    return this.circlesService.addMembers(id, userId, dto.memberIds);
  }

  @Delete(':id/members')
  @ApiOperation({ summary: 'Remove members from circle' })
  removeMembers(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: ManageMembersDto) {
    return this.circlesService.removeMembers(id, userId, dto.memberIds);
  }
}
