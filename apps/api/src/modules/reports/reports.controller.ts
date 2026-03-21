import { Throttle } from '@nestjs/throttler';
import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ModerationAction } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';

class ResolveReportDto {
  @ApiProperty({ enum: ModerationAction })
  @IsEnum(ModerationAction)
  actionTaken: ModerationAction;
}

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('reports')
export class ReportsController {
  constructor(private service: ReportsService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a report' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateReportDto) {
    return this.service.create(userId, dto);
  }

  // Static routes MUST come before parameterized :id route
  @Get('mine')
  @ApiOperation({ summary: 'Get my submitted reports' })
  getMyReports(@CurrentUser('id') userId: string, @Query('cursor') cursor?: string) {
    return this.service.getMyReports(userId, cursor);
  }

  @Get('pending')
  @ApiOperation({ summary: 'Get pending reports (admin/moderator only)' })
  getPending(@CurrentUser('id') adminId: string, @Query('cursor') cursor?: string) {
    return this.service.getPending(adminId, cursor);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get report stats (admin/moderator only)' })
  getStats(@CurrentUser('id') adminId: string) {
    return this.service.getStats(adminId);
  }

  // Parameterized route MUST come after all static routes
  @Get(':id')
  @ApiOperation({ summary: 'Get report by ID (own report only)' })
  getById(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.getById(id, userId);
  }

  @Patch(':id/resolve')
  @ApiOperation({ summary: 'Resolve a report (admin/moderator only)' })
  resolve(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body() body: ResolveReportDto,
  ) {
    return this.service.resolve(id, adminId, body.actionTaken);
  }

  @Patch(':id/dismiss')
  @ApiOperation({ summary: 'Dismiss a report (admin/moderator only)' })
  dismiss(@CurrentUser('id') adminId: string, @Param('id') id: string) {
    return this.service.dismiss(id, adminId);
  }
}