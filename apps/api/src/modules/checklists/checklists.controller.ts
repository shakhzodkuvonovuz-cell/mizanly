import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IsString } from 'class-validator';
import { ChecklistsService } from './checklists.service';

class CreateChecklistDto {
  @IsString() conversationId: string;
  @IsString() title: string;
}

class AddItemDto {
  @IsString() text: string;
}

@ApiTags('Message Checklists')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('checklists')
export class ChecklistsController {
  constructor(private readonly checklistsService: ChecklistsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a checklist in a conversation' })
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  async create(@CurrentUser('id') userId: string, @Body() dto: CreateChecklistDto) {
    return this.checklistsService.create(userId, dto.conversationId, dto.title);
  }

  @Get('conversation/:conversationId')
  @ApiOperation({ summary: 'Get all checklists for a conversation' })
  async getByConversation(@Param('conversationId') conversationId: string) {
    return this.checklistsService.getByConversation(conversationId);
  }

  @Post(':checklistId/items')
  @ApiOperation({ summary: 'Add an item to a checklist' })
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  async addItem(
    @CurrentUser('id') userId: string,
    @Param('checklistId') checklistId: string,
    @Body() dto: AddItemDto,
  ) {
    return this.checklistsService.addItem(userId, checklistId, dto.text);
  }

  @Patch('items/:itemId/toggle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle checklist item completion' })
  async toggleItem(@CurrentUser('id') userId: string, @Param('itemId') itemId: string) {
    return this.checklistsService.toggleItem(userId, itemId);
  }

  @Delete('items/:itemId')
  @ApiOperation({ summary: 'Delete a checklist item' })
  async deleteItem(@CurrentUser('id') userId: string, @Param('itemId') itemId: string) {
    return this.checklistsService.deleteItem(userId, itemId);
  }

  @Delete(':checklistId')
  @ApiOperation({ summary: 'Delete a checklist (creator only)' })
  async deleteChecklist(@CurrentUser('id') userId: string, @Param('checklistId') checklistId: string) {
    return this.checklistsService.deleteChecklist(userId, checklistId);
  }
}
