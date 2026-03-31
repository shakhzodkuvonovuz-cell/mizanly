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
import { RestrictsService } from './restricts.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Restricts')
@Throttle({ default: { limit: 30, ttl: 60000 } })
@Controller('restricts')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class RestrictsController {
  constructor(private readonly restrictsService: RestrictsService) {}

  @Post(':userId')
  @ApiOperation({ summary: 'Restrict a user' })
  restrict(
    @CurrentUser('id') restricterId: string,
    @Param('userId') restrictedId: string,
  ) {
    return this.restrictsService.restrict(restricterId, restrictedId);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unrestrict a user' })
  unrestrict(
    @CurrentUser('id') restricterId: string,
    @Param('userId') restrictedId: string,
  ) {
    return this.restrictsService.unrestrict(restricterId, restrictedId);
  }

  @Get()
  @ApiOperation({ summary: 'Get restricted users list' })
  getRestrictedList(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.restrictsService.getRestrictedList(userId, cursor);
  }
}
