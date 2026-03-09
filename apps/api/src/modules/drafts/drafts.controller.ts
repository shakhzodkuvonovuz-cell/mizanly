import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DraftsService } from './drafts.service';
import { SaveDraftDto } from './dto/save-draft.dto';

@ApiTags('Drafts')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('drafts')
export class DraftsController {
  constructor(private drafts: DraftsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all drafts' })
  async getDrafts(
    @CurrentUser('id') userId: string,
    @Query('space') space?: string,
  ) {
    return this.drafts.getDrafts(userId, space);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a draft' })
  async getDraft(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.drafts.getDraft(id, userId);
  }

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Save a new draft' })
  async saveDraft(@CurrentUser('id') userId: string, @Body() dto: SaveDraftDto) {
    return this.drafts.saveDraft(userId, dto.space, dto.data);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a draft' })
  async updateDraft(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SaveDraftDto,
  ) {
    return this.drafts.updateDraft(id, userId, dto.data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a draft' })
  async deleteDraft(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.drafts.deleteDraft(id, userId);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete all drafts' })
  async deleteAllDrafts(@CurrentUser('id') userId: string) {
    return this.drafts.deleteAllDrafts(userId);
  }
}