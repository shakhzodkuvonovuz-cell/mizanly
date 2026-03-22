import { IsArray, IsString, ArrayMaxSize, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Contact sync DTO.
 *
 * LEGAL NOTE (Finding 13 — GDPR Article 6):
 * Phone numbers of NON-USERS (third-party contacts who never consented) are
 * transmitted to the server. This is a privacy risk — the same issue led to
 * WhatsApp's EUR 225M fine by the Irish DPC.
 *
 * TODO: [LEGAL/PRIVACY] Implement client-side hashing:
 * 1. Mobile app should SHA-256 hash phone numbers BEFORE transmission
 * 2. Server should store and match only hashed phone numbers
 * 3. Add explicit consent dialog on mobile explaining what data is shared
 * 4. Limit to one sync per hour (rate limiting already at controller level via ArrayMaxSize)
 * 5. Do NOT persist non-user phone numbers — only use for matching, then discard
 */
export class ContactSyncDto {
  @ApiProperty({ description: 'Phone numbers to find matching users. Max 500 numbers.' })
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  phoneNumbers: string[];
}
