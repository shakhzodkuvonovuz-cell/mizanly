import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateContentFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['RELAXED', 'MODERATE', 'STRICT', 'FAMILY'])
  strictnessLevel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  blurHaram?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hideMusic?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hideMixedGender?: boolean;
}
