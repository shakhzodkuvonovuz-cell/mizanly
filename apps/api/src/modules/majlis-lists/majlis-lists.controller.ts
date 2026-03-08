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
import { MajlisListsService } from './majlis-lists.service';
import { CreateListDto } from './dto/create-list.dto';
import { UpdateListDto } from './dto/update-list.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Majlis Lists')
@Controller('majlis-lists')
export class MajlisListsController {
  constructor(private readonly service: MajlisListsService) {}

  @Get()
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get user's lists (owned + subscribed)" })
  getLists(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.service.getLists(userId, cursor);
  }

  @Post()
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new list' })
  createList(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateListDto,
  ) {
    return this.service.createList(userId, dto);
  }

  @Get(':id')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get list detail with member count' })
  getListById(
    @CurrentUser('id') userId: string | undefined,
    @Param('id') id: string,
  ) {
    return this.service.getListById(userId, id);
  }

  @Patch(':id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update list (name, description, isPublic)' })
  updateList(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateListDto,
  ) {
    return this.service.updateList(userId, id, dto);
  }

  @Delete(':id')
  @UseGuards(ClerkAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete list (owner only)' })
  async deleteList(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    await this.service.deleteList(userId, id);
  }

  @Get(':id/members')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get list members (paginated)' })
  getMembers(
    @CurrentUser('id') userId: string | undefined,
    @Param('id') listId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.service.getMembers(userId, listId, cursor);
  }

  @Post(':id/members')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add member to list (owner only)' })
  addMember(
    @CurrentUser('id') userId: string,
    @Param('id') listId: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.service.addMember(userId, listId, dto);
  }

  @Delete(':id/members/:userId')
  @UseGuards(ClerkAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove member from list (owner only)' })
  async removeMember(
    @CurrentUser('id') userId: string,
    @Param('id') listId: string,
    @Param('userId') memberUserId: string,
  ) {
    await this.service.removeMember(userId, listId, memberUserId);
  }

  @Get(':id/timeline')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get threads from list members (paginated)' })
  getTimeline(
    @CurrentUser('id') userId: string | undefined,
    @Param('id') listId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.service.getTimeline(userId, listId, cursor);
  }
}