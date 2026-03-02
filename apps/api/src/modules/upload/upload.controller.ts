import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsIn } from 'class-validator';
import { UploadService } from './upload.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class PresignDto {
  @IsString()
  contentType: string;

  @IsIn(['avatars', 'covers', 'posts', 'stories', 'messages', 'reels', 'videos', 'thumbnails', 'misc'])
  folder: 'avatars' | 'covers' | 'posts' | 'stories' | 'messages' | 'reels' | 'videos' | 'thumbnails' | 'misc';
}

@ApiTags('Upload')
@Controller('upload')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class UploadController {
  constructor(private uploadService: UploadService) {}

  @Post('presign')
  @ApiOperation({ summary: 'Get presigned URL for direct R2 upload' })
  getPresignedUrl(
    @CurrentUser('id') userId: string,
    @Body() dto: PresignDto,
  ) {
    return this.uploadService.getPresignedUrl(userId, dto.contentType, dto.folder);
  }

  @Delete(':key(*)')
  @ApiOperation({ summary: 'Delete a file from R2 by key' })
  deleteFile(@Param('key') key: string) {
    return this.uploadService.deleteFile(key);
  }
}
