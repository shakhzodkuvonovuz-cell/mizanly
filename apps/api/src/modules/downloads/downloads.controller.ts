import { Throttle } from '@nestjs/throttler';
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DownloadsService } from './downloads.service';
import { CreateDownloadDto, UpdateProgressDto } from './dto/create-download.dto';

@ApiTags('Downloads')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('api/v1/downloads')
export class DownloadsController {
  constructor(private service: DownloadsService) {}

  // POST /downloads — request a new download
  @Post()
  @ApiOperation({ summary: 'Request offline download' })
  requestDownload(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateDownloadDto,
  ) {
    return this.service.requestDownload(userId, dto);
  }

  // GET /downloads — list downloads
  @Get()
  @ApiOperation({ summary: 'List downloads' })
  getDownloads(
    @CurrentUser('id') userId: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.service.getDownloads(userId, status, cursor, limit ? Number(limit) : undefined);
  }

  // GET /downloads/storage — storage stats
  @Get('storage')
  @ApiOperation({ summary: 'Get download storage usage' })
  getStorage(@CurrentUser('id') userId: string) {
    return this.service.getStorageUsed(userId);
  }

  // GET /downloads/:id/url — get download URL
  @Get(':id/url')
  @ApiOperation({ summary: 'Get download URL for content' })
  getDownloadUrl(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.service.getDownloadUrl(userId, id);
  }

  // PATCH /downloads/:id/progress — update progress
  @Patch(':id/progress')
  @ApiOperation({ summary: 'Update download progress' })
  updateProgress(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProgressDto,
  ) {
    return this.service.updateProgress(userId, id, dto.progress ?? 0, dto.fileSize);
  }

  // DELETE /downloads/:id — delete download
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete download' })
  deleteDownload(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.service.deleteDownload(userId, id);
  }
}
