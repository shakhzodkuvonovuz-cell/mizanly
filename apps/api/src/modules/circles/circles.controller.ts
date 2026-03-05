import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CirclesService } from './circles.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Circles')
@Controller('circles')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class CirclesController {
  constructor(private circlesService: CirclesService) {}

  @Get()
  getMyCircles(@CurrentUser('id') userId: string) { return this.circlesService.getMyCircles(userId); }

  @Post()
  create(@CurrentUser('id') userId: string, @Body('name') name: string, @Body('memberIds') memberIds?: string[]) {
    return this.circlesService.create(userId, name, memberIds);
  }

  @Put(':id')
  update(@Param('id') id: string, @CurrentUser('id') userId: string, @Body('name') name?: string) {
    return this.circlesService.update(id, userId, name);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.circlesService.delete(id, userId); }

  @Get(':id/members')
  getMembers(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.circlesService.getMembers(id, userId); }

  @Post(':id/members')
  addMembers(@Param('id') id: string, @CurrentUser('id') userId: string, @Body('memberIds') memberIds: string[]) {
    return this.circlesService.addMembers(id, userId, memberIds);
  }

  @Delete(':id/members')
  removeMembers(@Param('id') id: string, @CurrentUser('id') userId: string, @Body('memberIds') memberIds: string[]) {
    return this.circlesService.removeMembers(id, userId, memberIds);
  }
}
