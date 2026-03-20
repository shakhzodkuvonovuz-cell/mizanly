import { Throttle } from '@nestjs/throttler';
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ChatExportService } from './chat-export.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

interface GenerateExportBody {
  format: 'json' | 'text';
  includeMedia: boolean;
}

@ApiTags('Chat Export (Risalah)')
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('chat-export')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class ChatExportController {
  constructor(private chatExportService: ChatExportService) {}

  @Post(':convId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a chat history export' })
  generateExport(
    @Param('convId') convId: string,
    @CurrentUser('id') userId: string,
    @Body() body: GenerateExportBody,
  ) {
    if (!body.format || !['json', 'text'].includes(body.format)) {
      throw new BadRequestException('format must be "json" or "text"');
    }

    return this.chatExportService.generateExport(
      convId,
      userId,
      body.format,
      body.includeMedia ?? false,
    );
  }

  @Get(':convId/stats')
  @ApiOperation({ summary: 'Get conversation statistics for export preview' })
  getConversationStats(
    @Param('convId') convId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.chatExportService.getConversationStats(convId, userId);
  }
}
