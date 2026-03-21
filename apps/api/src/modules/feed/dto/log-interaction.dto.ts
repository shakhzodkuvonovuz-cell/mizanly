import { IsString, IsOptional, IsNumber, IsBoolean, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class LogInteractionDto {
  @ApiProperty() @IsString() postId: string;

  @ApiProperty({ enum: ['SAF', 'BAKRA', 'MAJLIS', 'MINBAR'] })
  @Transform(({ value }) => typeof value === 'string' ? value.toUpperCase() : value)
  @IsEnum(['SAF', 'BAKRA', 'MAJLIS', 'MINBAR'])
  space: string;

  @IsBoolean() @IsOptional() viewed?: boolean;
  @IsNumber() @IsOptional() viewDurationMs?: number;
  @IsNumber() @IsOptional() completionRate?: number;
  @IsBoolean() @IsOptional() liked?: boolean;
  @IsBoolean() @IsOptional() commented?: boolean;
  @IsBoolean() @IsOptional() shared?: boolean;
  @IsBoolean() @IsOptional() saved?: boolean;
}
