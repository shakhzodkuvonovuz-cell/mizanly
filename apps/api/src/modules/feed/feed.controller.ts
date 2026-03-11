import { Controller, Post, Delete, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FeedService } from './feed.service';
import { LogInteractionDto } from './dto/log-interaction.dto';

@ApiTags('Feed Intelligence')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('feed')
export class FeedController {
  constructor(private feed: FeedService) {}

  @Post('interaction') @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log interaction' })
  async log(@CurrentUser('id') userId: string, @Body() dto: LogInteractionDto) { return this.feed.logInteraction(userId, dto); }

  @Post('dismiss/:contentType/:contentId') @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dismiss content' })
  async dismiss(@CurrentUser('id') userId: string, @Param('contentType') t: string, @Param('contentId') id: string) { return this.feed.dismiss(userId, id, t); }

  @Delete('dismiss/:contentType/:contentId') @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Undismiss' })
  async undismiss(@CurrentUser('id') userId: string, @Param('contentType') t: string, @Param('contentId') id: string) { return this.feed.undismiss(userId, id, t); }
}