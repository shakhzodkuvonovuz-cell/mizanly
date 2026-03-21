import { IsString, IsOptional, IsNumber, IsBoolean, IsEnum, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class LogInteractionDto {
  @ApiProperty() @IsString() postId: string;

  @ApiProperty({ enum: ['SAF', 'BAKRA', 'MAJLIS', 'MINBAR'] })
  @Transform(({ value }) => typeof value === 'string' ? value.toUpperCase() : value)
  @IsEnum(['SAF', 'BAKRA', 'MAJLIS', 'MINBAR'])
  space: string;

  @IsBoolean() @IsOptional() viewed?: boolean;
  @IsNumber() @IsOptional() @Min(0) @Max(3600000) viewDurationMs?: number;
  @IsNumber() @IsOptional() @Min(0) @Max(1) completionRate?: number;
  @IsBoolean() @IsOptional() liked?: boolean;
  @IsBoolean() @IsOptional() commented?: boolean;
  @IsBoolean() @IsOptional() shared?: boolean;
  @IsBoolean() @IsOptional() saved?: boolean;
}
