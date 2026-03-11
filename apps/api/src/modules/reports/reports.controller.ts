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
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('api/v1/reports')
export class ReportsController {
  constructor(private service: ReportsService) {}

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateReportDto) {
    return this.service.create(userId, dto);
  }

  @Get('mine')
  getMyReports(@CurrentUser('id') userId: string, @Query('cursor') cursor?: string) {
    return this.service.getMyReports(userId, cursor);
  }

  @Get('pending')
  getPending(@Query('cursor') cursor?: string) {
    return this.service.getPending(cursor);
  }

  @Get('stats')
  getStats() {
    return this.service.getStats();
  }

  @Get(':id')
  getById(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.getById(id, userId);
  }

  @Patch(':id/resolve')
  resolve(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body('actionTaken') actionTaken: ModerationAction) {
    return this.service.resolve(id, adminId, actionTaken);
  }

  @Patch(':id/dismiss')
  dismiss(@Param('id') id: string) {
    return this.service.dismiss(id);
  }
}