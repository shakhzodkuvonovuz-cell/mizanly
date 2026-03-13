import { IsString, IsOptional, MaxLength, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCommunityDto {
  @ApiProperty({ description: 'Community name', required: false, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiProperty({ description: 'Community description', required: false, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ description: 'Cover image URL', required: false })
  @IsOptional()
  @IsString()
  coverUrl?: string;

  @ApiProperty({ description: 'Community rules', required: false, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rules?: string;

  @ApiProperty({ description: 'Whether community is private', required: false })
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;
}