import { IsString, IsOptional, IsEnum, IsUrl, IsUUID, MaxLength, IsBoolean, IsInt, Min, Max } from 'class-validator';

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

  // ── E2E Encryption Fields (opaque passthrough) ──

  @IsOptional()
  @IsString()
  @MaxLength(120000) // ~87KB base64 = ~64KB plaintext + overhead. Reject anything larger.
  encryptedContent?: string; // Base64 of ciphertext — converted to Uint8Array by gateway

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3) // 1=X3DH, 2=PQXDH (future), 3=sealed sender (future)
  e2eVersion?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  e2eSenderDeviceId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(44) // 32 bytes = 44 chars base64
  e2eSenderRatchetKey?: string; // Base64 of 32-byte DH public key

  @IsOptional()
  @IsInt()
  @Min(0)
  e2eCounter?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  e2ePreviousCounter?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  e2eSenderKeyId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  clientMessageId?: string; // UUID for idempotent dedup

  @IsOptional()
  @IsString()
  @MaxLength(200) // ~150 bytes encrypted preview = ~200 chars base64
  encryptedLastMessagePreview?: string; // Base64 — client-encrypted preview
}
