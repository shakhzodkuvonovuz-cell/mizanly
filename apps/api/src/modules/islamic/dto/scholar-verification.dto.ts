import { IsString, IsOptional, IsIn, IsArray, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApplyScholarVerificationDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  institution: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['fiqh', 'hadith', 'tafsir', 'aqeedah', 'general'])
  specialization?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['hanafi', 'maliki', 'shafii', 'hanbali'])
  madhab?: string;

  @ApiProperty()
  @IsArray()
  @IsString({ each: true })
  documentUrls: string[];
}
