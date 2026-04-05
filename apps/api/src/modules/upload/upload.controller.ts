import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsIn, IsOptional, IsNumber, Max, Min, Matches } from 'class-validator';
import { UploadService } from './upload.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class PresignDto {
  @IsString()
  @Matches(/^(image|video|audio)\/[a-z0-9+.-]+$/, { message: 'contentType must be a valid MIME type' })
  contentType: string;

  @IsIn(['avatars', 'covers', 'posts', 'stories', 'messages', 'reels', 'videos', 'thumbnails', 'misc'])
  folder: 'avatars' | 'covers' | 'posts' | 'stories' | 'messages' | 'reels' | 'videos' | 'thumbnails' | 'misc';

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(104857600) // 100 MB
  maxFileSize?: number;
}

class VerifyUploadDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9\/_.-]+$/, { message: 'key must be a valid R2 object key' })
  key: string;
}

@ApiTags('Upload')
@Controller('upload')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class UploadController {
  constructor(private uploadService: UploadService) {}

  @Post('presign')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Get presigned URL for direct R2 upload' })
  getPresignedUrl(
    @CurrentUser('id') userId: string,
    @Body() dto: PresignDto,
  ) {
    return this.uploadService.getPresignedUrl(userId, dto.contentType, dto.folder, 300, dto.maxFileSize);
  }

  @Post('verify')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Verify uploaded file size and type against folder limits',
    description:
      'Call after completing a presigned PUT upload. Checks actual object size via HeadObject. ' +
      'Deletes the object and returns 400 if it exceeds the folder limit or has wrong content type.',
  })
  verifyUpload(
    @CurrentUser('id') userId: string,
    @Body() dto: VerifyUploadDto,
  ) {
    return this.uploadService.verifyUpload(dto.key, userId);
  }

  @Delete(':key(*)')
  @ApiOperation({ summary: 'Delete a file from R2 by key (must own the file)' })
  deleteFile(
    @Param('key') key: string,
    @CurrentUser('id') userId: string,
  ) {
    // Reject path traversal attempts
    if (key.includes('..') || key.includes('//') || !/^[a-zA-Z0-9\/_.-]+$/.test(key)) {
      throw new BadRequestException('Invalid file key');
    }
    // Keys are structured as "{folder}/{userId}/{uuid}.{ext}" — enforce ownership
    const segments = key.split('/');
    const keyOwnerId = segments.length >= 2 ? segments[1] : null;
    if (keyOwnerId !== userId) {
      throw new ForbiddenException('You do not own this file');
    }
    return this.uploadService.deleteFile(key);
  }
}
