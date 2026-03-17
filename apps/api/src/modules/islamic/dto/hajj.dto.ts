import { IsInt, IsOptional, IsString, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateHajjProgressDto {
  @ApiProperty() @IsInt() year: number;
}

export class UpdateHajjProgressDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(6) currentStep?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() checklistJson?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
