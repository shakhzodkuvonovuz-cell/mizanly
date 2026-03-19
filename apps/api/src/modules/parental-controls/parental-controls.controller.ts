import { Throttle } from '@nestjs/throttler';
import {
  Controller,
  Post,
  Delete,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ParentalControlsService } from './parental-controls.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  LinkChildDto,
  UnlinkChildDto,
  UpdateParentalControlDto,
  VerifyPinDto,
  ChangePinDto,
} from './dto/parental-control.dto';

@ApiTags('Parental Controls')
@Throttle({ default: { limit: 30, ttl: 60000 } })
@Controller('parental-controls')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class ParentalControlsController {
  constructor(private readonly parentalControlsService: ParentalControlsService) {}

  @Post('link')
  @ApiOperation({ summary: 'Link a child account' })
  linkChild(
    @CurrentUser('id') parentUserId: string,
    @Body() dto: LinkChildDto,
  ) {
    return this.parentalControlsService.linkChild(parentUserId, dto);
  }

  @Delete('link/:childId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unlink a child account' })
  unlinkChild(
    @CurrentUser('id') parentUserId: string,
    @Param('childId') childId: string,
    @Body() dto: UnlinkChildDto,
  ) {
    return this.parentalControlsService.unlinkChild(parentUserId, childId, dto.pin);
  }

  @Get('children')
  @ApiOperation({ summary: 'Get linked children' })
  getMyChildren(@CurrentUser('id') parentUserId: string) {
    return this.parentalControlsService.getMyChildren(parentUserId);
  }

  @Get('parent')
  @ApiOperation({ summary: 'Get parent info (child view)' })
  getParentInfo(@CurrentUser('id') childUserId: string) {
    return this.parentalControlsService.getParentInfo(childUserId);
  }

  @Patch(':childId')
  @ApiOperation({ summary: 'Update parental controls for a child' })
  updateControls(
    @CurrentUser('id') parentUserId: string,
    @Param('childId') childId: string,
    @Body() dto: UpdateParentalControlDto,
  ) {
    return this.parentalControlsService.updateControls(parentUserId, childId, dto);
  }

  @Post(':childId/pin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify PIN' })
  verifyPin(
    @CurrentUser('id') parentUserId: string,
    @Param('childId') childId: string,
    @Body() dto: VerifyPinDto,
  ) {
    return this.parentalControlsService.verifyPin(parentUserId, childId, dto.pin);
  }

  @Patch(':childId/pin')
  @ApiOperation({ summary: 'Change PIN' })
  changePin(
    @CurrentUser('id') parentUserId: string,
    @Param('childId') childId: string,
    @Body() dto: ChangePinDto,
  ) {
    return this.parentalControlsService.changePin(
      parentUserId,
      childId,
      dto.currentPin,
      dto.newPin,
    );
  }

  @Get(':childId/restrictions')
  @ApiOperation({ summary: 'Get restrictions for a child' })
  getRestrictions(@Param('childId') childId: string) {
    return this.parentalControlsService.getRestrictions(childId);
  }

  @Get(':childId/digest')
  @ApiOperation({ summary: 'Get 7-day activity digest for a child' })
  getActivityDigest(
    @CurrentUser('id') parentUserId: string,
    @Param('childId') childId: string,
  ) {
    return this.parentalControlsService.getActivityDigest(parentUserId, childId);
  }
}
