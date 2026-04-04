import { Controller, Get, Post, Param, Query, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IsString, IsIn, MaxLength } from 'class-validator';
import { CommunityNotesService } from './community-notes.service';
import { EmbeddingContentType, NoteRating } from '@prisma/client';

class CreateNoteDto {
  @IsString() @IsIn(['post', 'thread', 'reel']) contentType: string;
  @IsString() @MaxLength(50) contentId: string;
  @IsString() @MaxLength(2000) note: string;
}

class RateNoteDto {
  @IsString() @IsIn(['NOTE_HELPFUL', 'NOTE_SOMEWHAT_HELPFUL', 'NOTE_NOT_HELPFUL']) rating: string;
}

@ApiTags('Community Notes')
@ApiBearerAuth()
@Controller('community-notes')
export class CommunityNotesController {
  constructor(private readonly communityNotesService: CommunityNotesService) {}

  @UseGuards(ClerkAuthGuard)
  @Post()
  @ApiOperation({ summary: 'Create a community note on content' })
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async createNote(@CurrentUser('id') userId: string, @Body() dto: CreateNoteDto) {
    return this.communityNotesService.createNote(userId, dto.contentType as EmbeddingContentType, dto.contentId, dto.note);
  }

  @UseGuards(OptionalClerkAuthGuard)
  @Get(':contentType/:contentId')
  @ApiOperation({ summary: 'Get community notes for content' })
  async getNotesForContent(
    @Param('contentType') contentType: string,
    @Param('contentId') contentId: string,
  ) {
    return this.communityNotesService.getNotesForContent(contentType, contentId);
  }

  @UseGuards(OptionalClerkAuthGuard)
  @Get(':contentType/:contentId/helpful')
  @ApiOperation({ summary: 'Get helpful community notes (approved)' })
  async getHelpfulNotes(
    @Param('contentType') contentType: string,
    @Param('contentId') contentId: string,
  ) {
    return this.communityNotesService.getHelpfulNotes(contentType, contentId);
  }

  @UseGuards(ClerkAuthGuard)
  @Post(':noteId/rate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rate a community note' })
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  async rateNote(
    @CurrentUser('id') userId: string,
    @Param('noteId') noteId: string,
    @Body() dto: RateNoteDto,
  ) {
    return this.communityNotesService.rateNote(userId, noteId, dto.rating as NoteRating);
  }
}
