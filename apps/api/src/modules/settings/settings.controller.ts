import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { SettingsService } from './settings.service';
import { UpdatePrivacyDto } from './dto/update-privacy.dto';
import { UpdateNotificationsDto } from './dto/update-notifications.dto';
import { UpdateAccessibilityDto } from './dto/update-accessibility.dto';
import { UpdateWellbeingDto } from './dto/update-wellbeing.dto';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class AddKeywordDto {
  @IsString()
  @MaxLength(100)
  keyword: string;
}

@ApiTags('Settings')
@Controller('settings')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all settings (auto-creates on first call)' })
  getSettings(@CurrentUser('id') userId: string) {
    return this.settingsService.getSettings(userId);
  }

  @Patch('privacy')
  @ApiOperation({ summary: 'Update privacy settings' })
  updatePrivacy(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdatePrivacyDto,
  ) {
    return this.settingsService.updatePrivacy(userId, dto);
  }

  @Patch('notifications')
  @ApiOperation({ summary: 'Update notification settings' })
  updateNotifications(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateNotificationsDto,
  ) {
    return this.settingsService.updateNotifications(userId, dto);
  }

  @Patch('accessibility')
  @ApiOperation({ summary: 'Update accessibility settings' })
  updateAccessibility(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateAccessibilityDto,
  ) {
    return this.settingsService.updateAccessibility(userId, dto);
  }

  @Patch('wellbeing')
  @ApiOperation({ summary: 'Update wellbeing settings' })
  updateWellbeing(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateWellbeingDto,
  ) {
    return this.settingsService.updateWellbeing(userId, dto);
  }

  @Get('blocked-keywords')
  @ApiOperation({ summary: 'List blocked keyword filters' })
  getBlockedKeywords(@CurrentUser('id') userId: string) {
    return this.settingsService.getBlockedKeywords(userId);
  }

  @Post('blocked-keywords')
  @ApiOperation({ summary: 'Add a blocked keyword filter' })
  addBlockedKeyword(
    @CurrentUser('id') userId: string,
    @Body() dto: AddKeywordDto,
  ) {
    return this.settingsService.addBlockedKeyword(userId, dto.keyword);
  }

  @Delete('blocked-keywords/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a blocked keyword filter' })
  removeBlockedKeyword(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.settingsService.removeBlockedKeyword(userId, id);
  }
}
