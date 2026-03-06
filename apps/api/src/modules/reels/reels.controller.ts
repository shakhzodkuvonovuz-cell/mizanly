import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReelsService } from './reels.service';
import { CreateReelDto } from './dto/create-reel.dto';

@ApiTags('reels')
@ApiBearerAuth()
@Controller('reels')
@UseGuards(ClerkAuthGuard)
export class ReelsController {
  constructor(private readonly reelsService: ReelsService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a reel' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateReelDto,
  ) {
    return this.reelsService.create(userId, dto);
  }
}