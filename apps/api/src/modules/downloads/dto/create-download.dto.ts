import { IsString, IsIn, IsOptional } from 'class-validator';

export class CreateDownloadDto {
  @IsString()
  contentId: string;

  @IsIn(['post', 'video', 'reel'])
  contentType: string;

  @IsOptional()
  @IsIn(['auto', '360p', '720p', '1080p'])
  quality?: string;
}

export class UpdateProgressDto {
  @IsIn([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1])
  @IsOptional()
  progress?: number;

  @IsOptional()
  fileSize?: number;
}
