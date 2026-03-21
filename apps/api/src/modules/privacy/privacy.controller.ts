import { Throttle } from '@nestjs/throttler';
import { Controller, Get, Delete, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrivacyService } from './privacy.service';

@ApiTags('Privacy (GDPR/CCPA)')
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('privacy')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class PrivacyController {
  constructor(private privacyService: PrivacyService) {}

  @Get('export')
  @Throttle({ default: { limit: 2, ttl: 3600000 } })
  @ApiOperation({ summary: 'Export all user data (GDPR Article 20)' })
  exportData(@CurrentUser('id') userId: string) {
    return this.privacyService.exportUserData(userId);
  }

  @Delete('delete-all')
  @Throttle({ default: { limit: 1, ttl: 86400000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete all user data permanently (GDPR Article 17)' })
  deleteAll(@CurrentUser('id') userId: string) {
    return this.privacyService.deleteAllUserData(userId);
  }
}