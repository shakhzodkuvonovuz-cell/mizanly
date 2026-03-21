import { Controller, Get, Post, Put, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IsString, IsOptional, MaxLength, IsDateString, IsIn } from 'class-validator';
import { ScholarQAService } from './scholar-qa.service';

class ScheduleQADto {
  @IsString() @MaxLength(200) title: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsIn(['fiqh', 'aqeedah', 'tafsir', 'seerah', 'family', 'youth', 'women', 'converts']) category: string;
  @IsOptional() @IsString() @MaxLength(10) language?: string;
  @IsDateString() scheduledAt: string;
}

class SubmitQuestionDto {
  @IsString() @MaxLength(1000) question: string;
}

@ApiTags('Scholar Q&A')
@ApiBearerAuth()
@Controller('scholar-qa')
export class ScholarQAController {
  constructor(private readonly scholarQAService: ScholarQAService) {}

  @UseGuards(ClerkAuthGuard)
  @Post()
  @ApiOperation({ summary: 'Schedule a Q&A session (verified scholars only)' })
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async schedule(@CurrentUser('id') scholarId: string, @Body() dto: ScheduleQADto) {
    return this.scholarQAService.schedule(scholarId, dto);
  }

  @UseGuards(OptionalClerkAuthGuard)
  @Get('upcoming')
  @ApiOperation({ summary: 'Get upcoming Q&A sessions' })
  async getUpcoming() {
    return this.scholarQAService.getUpcoming();
  }

  @UseGuards(OptionalClerkAuthGuard)
  @Get('recordings')
  @ApiOperation({ summary: 'Get past sessions with recordings' })
  async getRecordings() {
    return this.scholarQAService.getRecordings();
  }

  @UseGuards(OptionalClerkAuthGuard)
  @Get(':id')
  @ApiOperation({ summary: 'Get Q&A session detail with questions' })
  async getById(@Param('id') id: string) {
    return this.scholarQAService.getById(id);
  }

  @UseGuards(ClerkAuthGuard)
  @Post(':id/questions')
  @ApiOperation({ summary: 'Submit a question' })
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  async submitQuestion(
    @CurrentUser('id') userId: string,
    @Param('id') qaId: string,
    @Body() dto: SubmitQuestionDto,
  ) {
    return this.scholarQAService.submitQuestion(userId, qaId, dto.question);
  }

  @UseGuards(ClerkAuthGuard)
  @Post(':id/questions/:qid/vote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upvote a question' })
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  async voteQuestion(@CurrentUser('id') userId: string, @Param('qid') questionId: string) {
    return this.scholarQAService.voteQuestion(userId, questionId);
  }

  @UseGuards(ClerkAuthGuard)
  @Put(':id/start')
  @ApiOperation({ summary: 'Start Q&A session (scholar only)' })
  async startSession(@CurrentUser('id') scholarId: string, @Param('id') qaId: string) {
    return this.scholarQAService.startSession(scholarId, qaId);
  }

  @UseGuards(ClerkAuthGuard)
  @Put(':id/end')
  @ApiOperation({ summary: 'End Q&A session (scholar only)' })
  async endSession(@CurrentUser('id') scholarId: string, @Param('id') qaId: string) {
    return this.scholarQAService.endSession(scholarId, qaId);
  }

  @UseGuards(ClerkAuthGuard)
  @Put(':id/questions/:qid/answered')
  @ApiOperation({ summary: 'Mark question as answered (scholar only)' })
  async markAnswered(@CurrentUser('id') scholarId: string, @Param('qid') questionId: string) {
    return this.scholarQAService.markAnswered(scholarId, questionId);
  }
}
