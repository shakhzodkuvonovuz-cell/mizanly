import {
  Controller,
  Get,
  Param,
  Query,
  Patch,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { ResolveReportDto } from './dto/resolve-report.dto';
import { BanUserDto } from './dto/ban-user.dto';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(private adminService: AdminService) {}

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
}
