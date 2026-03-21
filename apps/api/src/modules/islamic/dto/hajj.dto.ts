import { IsInt, IsOptional, IsString, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateHajjProgressDto {
  @ApiProperty() @IsInt() @Min(2024) @Max(2100) year: number;
}

export class UpdateHajjProgressDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(6) currentStep?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10000) checklistJson?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
