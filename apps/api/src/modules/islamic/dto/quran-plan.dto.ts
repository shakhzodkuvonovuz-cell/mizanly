import { IsIn, IsInt, IsOptional, IsBoolean, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateQuranPlanDto {
  @ApiProperty() @IsIn(['30day', '60day', '90day']) planType: string;
}

export class UpdateQuranPlanDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(30) currentJuz?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(604) currentPage?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isComplete?: boolean;
}
