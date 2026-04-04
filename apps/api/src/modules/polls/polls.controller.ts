import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { PollsService } from './polls.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class VoteDto {
  @IsString()
  optionId: string;
}

@ApiTags('Polls')
@Controller('polls')
export class PollsController {
  constructor(private pollsService: PollsService) {}

  @Get(':id')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get poll details with options and vote counts' })
  @ApiResponse({ status: 200, description: 'Poll data' })
  @ApiResponse({ status: 404, description: 'Poll not found' })
  async getPoll(
    @Param('id') pollId: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.pollsService.getPoll(pollId, userId);
  }

  @Post(':id/vote')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vote on a poll option' })
  @ApiResponse({ status: 200, description: 'Vote recorded' })
  @ApiResponse({ status: 400, description: 'Invalid option' })
  @ApiResponse({ status: 404, description: 'Poll not found' })
  @ApiResponse({ status: 409, description: 'Already voted' })
  async vote(
    @Param('id') pollId: string,
    @Body() voteDto: VoteDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.pollsService.vote(pollId, voteDto.optionId, userId);
  }

  @Delete(':id/vote')
  @UseGuards(ClerkAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retract your vote from a poll' })
  @ApiResponse({ status: 204, description: 'Vote retracted' })
  @ApiResponse({ status: 400, description: 'Not voted' })
  async retractVote(
    @Param('id') pollId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.pollsService.retractVote(pollId, userId);
  }

  @Get(':id/voters')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List voters for a poll option (poll creator only)' })
  @ApiResponse({ status: 200, description: 'Paginated list of voters' })
  @ApiResponse({ status: 403, description: 'Only the poll creator can view voters' })
  @ApiResponse({ status: 404, description: 'Poll or option not found' })
  async getVoters(
    @Param('id') pollId: string,
    @Query('optionId') optionId: string,
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    if (!optionId) {
      throw new BadRequestException('optionId query parameter is required');
    }
    return this.pollsService.getVoters(pollId, optionId, userId, cursor);
  }
}