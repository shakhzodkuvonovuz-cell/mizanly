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
import { BlocksService } from './blocks.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Blocks')
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('blocks')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class BlocksController {
  constructor(private blocksService: BlocksService) {}

  @Post(':userId')
  @ApiOperation({ summary: 'Block a user' })
  block(
    @CurrentUser('id') blockerId: string,
    @Param('userId') blockedId: string,
  ) {
    return this.blocksService.block(blockerId, blockedId);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unblock a user' })
  unblock(
    @CurrentUser('id') blockerId: string,
    @Param('userId') blockedId: string,
  ) {
    return this.blocksService.unblock(blockerId, blockedId);
  }

  @Get()
  @ApiOperation({ summary: 'Own blocked list (cursor paginated)' })
  getBlockedList(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.blocksService.getBlockedList(userId, cursor);
  }
}
