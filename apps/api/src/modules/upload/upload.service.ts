import { Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { getResponsiveImageUrls } from '../../common/utils/image';

type UploadFolder = 'avatars' | 'covers' | 'posts' | 'stories' | 'messages' | 'reels' | 'videos' | 'thumbnails' | 'misc';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/mp4'];

/** Default max file sizes per folder (in bytes) */
const FOLDER_MAX_SIZE: Record<UploadFolder, number> = {
  avatars: 5 * 1024 * 1024,       // 5 MB
  covers: 10 * 1024 * 1024,       // 10 MB
  posts: 50 * 1024 * 1024,        // 50 MB
  stories: 50 * 1024 * 1024,      // 50 MB
  messages: 50 * 1024 * 1024,     // 50 MB
  reels: 100 * 1024 * 1024,       // 100 MB
  videos: 100 * 1024 * 1024,      // 100 MB
  thumbnails: 5 * 1024 * 1024,    // 5 MB
  misc: 20 * 1024 * 1024,         // 20 MB
};

/** Allowed content types per folder */
const FOLDER_ALLOWED_TYPES: Record<UploadFolder, string[]> = {
  avatars: ALLOWED_IMAGE_TYPES,
  covers: ALLOWED_IMAGE_TYPES,
  thumbnails: ALLOWED_IMAGE_TYPES,
  posts: [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES],
  stories: [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES],
  messages: [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES, ...ALLOWED_AUDIO_TYPES],
  reels: ALLOWED_VIDEO_TYPES,
  videos: ALLOWED_VIDEO_TYPES,
  misc: [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES, ...ALLOWED_AUDIO_TYPES],
};

@Injectable()
export class UploadService {
  private s3: S3Client;
  private bucket: string;
  private publicUrl: string;

  private readonly logger = new Logger(UploadService.name);

  constructor(private config: ConfigService) {
    // Support both env var naming conventions (R2_* and CLOUDFLARE_*)
    const accountId = this.config.get('R2_ACCOUNT_ID') || this.config.get('CLOUDFLARE_ACCOUNT_ID');
    const accessKeyId = this.config.get('R2_ACCESS_KEY_ID') || this.config.get('CLOUDFLARE_R2_ACCESS_KEY');
    const secretAccessKey = this.config.get('R2_SECRET_ACCESS_KEY') || this.config.get('CLOUDFLARE_R2_SECRET_KEY');

    if (!accountId || !accessKeyId || !secretAccessKey) {
      this.logger.warn('R2 credentials not configured — file uploads will fail. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
    }

    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId || ''}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId ?? '',
        secretAccessKey: secretAccessKey ?? '',
      },
    });
    this.bucket = this.config.get('R2_BUCKET_NAME') ?? 'mizanly-media';
    this.publicUrl = this.config.get('R2_PUBLIC_URL') ?? 'https://media.mizanly.app';
  }

  async getPresignedUrl(
    userId: string,
    contentType: string,
    folder: UploadFolder,
    expiresIn = 300,
    maxFileSize?: number,
  ) {
    // Validate content type is allowed globally
    this.validateContentType(contentType);

    // Validate content type is allowed for the specific folder
    const folderAllowed = FOLDER_ALLOWED_TYPES[folder];
    if (!folderAllowed.includes(contentType)) {
      throw new BadRequestException(
        `Content type ${contentType} is not allowed for folder "${folder}". Allowed: ${folderAllowed.join(', ')}`,
      );
    }

    // Enforce folder-specific max size if caller didn't provide one
    const effectiveMaxSize = maxFileSize ?? FOLDER_MAX_SIZE[folder];
    if (maxFileSize && maxFileSize > FOLDER_MAX_SIZE[folder]) {
      throw new BadRequestException(
        `Max file size for "${folder}" is ${FOLDER_MAX_SIZE[folder]} bytes (${Math.round(FOLDER_MAX_SIZE[folder] / 1024 / 1024)} MB)`,
      );
    }

    const ext = this.getExtension(contentType);
    const key = `${folder}/${userId}/${uuidv4()}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    });

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn });

    const publicUrl = `${this.publicUrl}/${key}`;
    const isImage = ALLOWED_IMAGE_TYPES.includes(contentType);

    return {
      uploadUrl,
      key,
      publicUrl,
      expiresIn,
      maxFileSize: effectiveMaxSize,
      // Include optimized variants for images (uses Cloudflare Image Resizing)
      ...(isImage ? { variants: getResponsiveImageUrls(publicUrl) } : {}),
    };
  }

  async deleteFile(key: string) {
    const command = new DeleteObjectCommand({ Bucket: this.bucket, Key: key });
    try {
      await this.s3.send(command);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to delete file ${key}: ${msg}`);
      throw new InternalServerErrorException('Failed to delete file');
    }
    return { deleted: true, key };
  }

  private validateContentType(contentType: string) {
    const allowed = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES, ...ALLOWED_AUDIO_TYPES];
    if (!allowed.includes(contentType)) {
      throw new BadRequestException(
        `Unsupported content type: ${contentType}. Allowed: ${allowed.join(', ')}`,
      );
    }
  }

  private getExtension(contentType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'video/webm': 'webm',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/mp4': 'm4a',
    };
    return map[contentType] ?? 'bin';
  }
}
