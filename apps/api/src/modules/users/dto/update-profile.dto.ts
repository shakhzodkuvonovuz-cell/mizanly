import { IsString, IsOptional, MaxLength, IsUrl, IsBoolean, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiProperty({ required: false, maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  displayName?: string;

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
  @IsUrl()
  coverUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsIn(['en', 'ar', 'tr', 'ur', 'bn', 'fr', 'id', 'ms'])
  language?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsIn(['dark', 'light', 'system'])
  theme?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;

  @ApiProperty({ required: false, maxLength: 20 })
  @IsOptional()
  @IsString()
  @IsIn(['hanafi', 'maliki', 'shafii', 'hanbali'])
  madhab?: string;
}
