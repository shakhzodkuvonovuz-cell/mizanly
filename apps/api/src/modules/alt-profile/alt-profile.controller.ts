import { Throttle } from '@nestjs/throttler';
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, MaxLength, MinLength } from 'class-validator';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AltProfileService } from './alt-profile.service';

class CreateAltProfileDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  displayName!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}

class UpdateAltProfileDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  displayName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}

class AddAccessDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  userIds!: string[];
}

@ApiTags('Alt Profile (Flipside)')
@ApiBearerAuth()
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('users/me/alt-profile')
@UseGuards(ClerkAuthGuard)
export class AltProfileController {
  constructor(private altProfile: AltProfileService) {}

  @Post()
  @ApiOperation({ summary: 'Create Flipside profile (max 1 per user)' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAltProfileDto,
  ) {
    return this.altProfile.create(userId, dto);
  }

  @Put()
  @ApiOperation({ summary: 'Update Flipside profile' })
  async update(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateAltProfileDto,
  ) {
    return this.altProfile.update(userId, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete Flipside profile' })
  async remove(@CurrentUser('id') userId: string) {
    return this.altProfile.delete(userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get own Flipside profile' })
  async getOwn(@CurrentUser('id') userId: string) {
    return this.altProfile.getOwn(userId);
  }

  @Post('access')
  @ApiOperation({ summary: 'Add users who can see your Flipside' })
  async addAccess(
    @CurrentUser('id') userId: string,
    @Body() dto: AddAccessDto,
  ) {
    return this.altProfile.addAccess(userId, dto.userIds);
  }

  @Delete('access/:targetUserId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove user access to your Flipside' })
  async removeAccess(
    @CurrentUser('id') userId: string,
    @Param('targetUserId') targetUserId: string,
  ) {
    return this.altProfile.removeAccess(userId, targetUserId);
  }

  @Get('access')
  @ApiOperation({ summary: 'Get Flipside access list' })
  async getAccessList(@CurrentUser('id') userId: string) {
    return this.altProfile.getAccessList(userId);
  }

  @Get('posts')
  @ApiOperation({ summary: 'Get own Flipside posts' })
  async getOwnPosts(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.altProfile.getAltPosts(userId, userId, cursor);
  }
}

@ApiTags('Alt Profile (Flipside)')
@ApiBearerAuth()
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('users/:userId/alt-profile')
@UseGuards(ClerkAuthGuard)
export class AltProfileViewerController {
  constructor(private altProfile: AltProfileService) {}

  @Get()
  @ApiOperation({ summary: 'View another user\'s Flipside profile (requires access)' })
  async viewProfile(
    @CurrentUser('id') viewerId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.altProfile.getForUser(targetUserId, viewerId);
  }

  @Get('posts')
  @ApiOperation({ summary: 'View Flipside posts (requires access)' })
  async viewPosts(
    @CurrentUser('id') viewerId: string,
    @Param('userId') targetUserId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.altProfile.getAltPosts(targetUserId, viewerId, cursor);
  }
}
