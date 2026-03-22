import { IsString, IsOptional, MinLength, MaxLength, Matches, IsUrl, IsIn, IsDateString, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ minLength: 3, maxLength: 30 })
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9_.]+$/, { message: 'Username: letters, numbers, dots, underscores only' })
  username: string;

  @ApiProperty({ minLength: 1, maxLength: 50 })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  displayName: string;

  @ApiProperty({ required: false, maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  bio?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsIn(['en', 'ar', 'tr', 'ur', 'bn', 'fr', 'id', 'ms'])
  language?: string;

  @ApiProperty({ description: 'Date of birth (ISO 8601). Required for COPPA/GDPR age verification. Must be 13+.' })
  @IsDateString()
  dateOfBirth: string;

  @ApiProperty({ description: 'User must actively accept Terms of Service and Privacy Policy (GDPR Art 7)' })
  @IsBoolean()
  acceptedTerms: boolean;
}
