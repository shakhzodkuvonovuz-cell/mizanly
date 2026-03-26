import { Throttle } from '@nestjs/throttler';
import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  Patch,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { ResolveReportDto } from './dto/resolve-report.dto';
import { BanUserDto } from './dto/ban-user.dto';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FeatureFlagsService } from '../../common/services/feature-flags.service';
import { CounterReconciliationService } from '../../common/services/counter-reconciliation.service';
import { MeilisearchSyncService } from '../../common/services/meilisearch-sync.service';

@ApiTags('Admin')
@Throttle({ default: { limit: 30, ttl: 60000 } })
@Controller('admin')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(
    private adminService: AdminService,
    private featureFlags: FeatureFlagsService,
    private counterReconciliation: CounterReconciliationService,
    private meilisearchSync: MeilisearchSyncService,
  ) {}

  @Get('reports')
  @ApiOperation({ summary: 'Get paginated reports (filter by status)' })
  getReports(
    @CurrentUser('id') adminId: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.adminService.getReports(adminId, status, cursor);
  }

  @Get('reports/:id')
  @ApiOperation({ summary: 'Get a single report with full context' })
  getReport(
    @CurrentUser('id') adminId: string,
    @Param('id') reportId: string,
  ) {
    return this.adminService.getReport(adminId, reportId);
  }

  @Patch('reports/:id')
  @ApiOperation({ summary: 'Resolve a report (dismiss / warn / remove content / ban user)' })
  resolveReport(
    @CurrentUser('id') adminId: string,
    @Param('id') reportId: string,
    @Body() dto: ResolveReportDto,
  ) {
    return this.adminService.resolveReport(adminId, reportId, dto.action, dto.note);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get platform-wide statistics' })
  getStats(@CurrentUser('id') adminId: string) {
    return this.adminService.getStats(adminId);
  }

  @Post('users/:id/ban')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ban a user' })
  banUser(
    @CurrentUser('id') adminId: string,
    @Param('id') targetId: string,
    @Body() dto: BanUserDto,
  ) {
    return this.adminService.banUser(adminId, targetId, dto.reason, dto.duration);
  }

  @Post('users/:id/unban')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unban a user' })
  unbanUser(
    @CurrentUser('id') adminId: string,
    @Param('id') targetId: string,
  ) {
    return this.adminService.unbanUser(adminId, targetId);
  }

  // ── Feature Flags ───────────────────────────────────────

  @Get('flags')
  @ApiOperation({ summary: 'Get all feature flags (admin only)' })
  async getFlags(@CurrentUser('id') adminId: string) {
    await this.adminService.verifyAdmin(adminId);
    return this.featureFlags.getAllFlags();
  }

  @Patch('flags/:name')
  @ApiOperation({ summary: 'Set a feature flag (admin only)' })
  async setFlag(@CurrentUser('id') adminId: string, @Param('name') name: string, @Body('value') value: string) {
    await this.adminService.verifyAdmin(adminId);
    // Validate flag value format
    if (!value || !/^(true|false|[0-9]{1,3})$/.test(value)) {
      throw new BadRequestException('Flag value must be "true", "false", or a number 0-100');
    }
    return this.featureFlags.setFlag(name, value);
  }

  @Delete('flags/:name')
  @ApiOperation({ summary: 'Delete a feature flag (admin only)' })
  async deleteFlag(@CurrentUser('id') adminId: string, @Param('name') name: string) {
    await this.adminService.verifyAdmin(adminId);
    return this.featureFlags.deleteFlag(name);
  }

  @Post('search/sync')
  @Throttle({ default: { limit: 1, ttl: 300000 } }) // 1 per 5 min
  @ApiOperation({ summary: 'Trigger full Meilisearch index sync (admin only)' })
  async syncSearchIndex(@CurrentUser('id') adminId: string) {
    await this.adminService.verifyAdmin(adminId);
    await this.meilisearchSync.syncAll();
    return { message: 'Full Meilisearch sync completed.' };
  }

  @Post('counters/reconcile')
  @Throttle({ default: { limit: 1, ttl: 300000 } })
  @ApiOperation({ summary: 'Trigger counter reconciliation (admin only)' })
  async reconcileCounters(@CurrentUser('id') adminId: string) {
    await this.adminService.verifyAdmin(adminId);
    const result = await this.counterReconciliation.reconcileAll();
    return { message: 'Counter reconciliation completed.', ...result };
  }
}
