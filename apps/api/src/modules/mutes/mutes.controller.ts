import { Throttle } from '@nestjs/throttler';
import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MutesService } from './mutes.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Mutes')
@Throttle({ default: { limit: 30, ttl: 60000 } })
@Controller('mutes')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class MutesController {
  constructor(private mutesService: MutesService) {}

  @Post(':userId')
  @ApiOperation({ summary: 'Mute a user' })
  mute(
    @CurrentUser('id') userId: string,
    @Param('userId') mutedId: string,
  ) {
    return this.mutesService.mute(userId, mutedId);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unmute a user' })
  unmute(
    @CurrentUser('id') userId: string,
    @Param('userId') mutedId: string,
  ) {
    return this.mutesService.unmute(userId, mutedId);
  }

  @Get()
  @ApiOperation({ summary: 'Own muted list' })
  getMutedList(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.mutesService.getMutedList(userId, cursor);
  }
}
