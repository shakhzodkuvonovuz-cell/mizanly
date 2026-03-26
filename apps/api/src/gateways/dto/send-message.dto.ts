import { IsString, IsOptional, IsEnum, IsUrl, IsUUID, MaxLength, IsBoolean } from 'class-validator';

export class WsSendMessageDto {
  @IsUUID()
  conversationId: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @IsOptional()
  @IsEnum(['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'VOICE', 'FILE', 'GIF', 'STICKER', 'LOCATION'])
  messageType?: string;

  @IsOptional()
  @IsUrl()
  mediaUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  mediaType?: string;

  @IsOptional()
  @IsString()
  replyToId?: string;

  @IsOptional()
  @IsBoolean()
  isSpoiler?: boolean;

  @IsOptional()
  @IsBoolean()
  isViewOnce?: boolean;
}