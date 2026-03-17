import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
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
@Controller('chat-export')
export class ChatExportController {
  constructor(private chatExportService: ChatExportService) {}

  @Post(':convId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a chat history export' })
  generateExport(
    @Param('convId') convId: string,
    @CurrentUser('id') userId: string,
    @Body() body: GenerateExportBody,
  ) {
    return this.chatExportService.generateExport(
      convId,
      userId,
      body.format,
      body.includeMedia,
    );
  }

  @Get(':convId/stats')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get conversation statistics for export preview' })
  getConversationStats(
    @Param('convId') convId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.chatExportService.getConversationStats(convId, userId);
  }
}
