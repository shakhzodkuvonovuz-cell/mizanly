import { IsString, IsOptional, IsUrl, MaxLength, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCommunityDto {
  @ApiProperty({ description: 'Community name', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: 'Community description', required: false, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ description: 'Cover image URL', required: false })
  @IsOptional()
  @IsUrl()
  coverUrl?: string;

  @ApiProperty({ description: 'Community rules', required: false, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rules?: string;

  @ApiProperty({ description: 'Whether community is private', required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;
}