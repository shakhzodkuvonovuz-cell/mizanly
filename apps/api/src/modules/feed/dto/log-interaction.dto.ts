import { IsString, IsOptional, IsNumber, IsBoolean, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ContentSpace } from '@prisma/client';

export class LogInteractionDto {
  @ApiProperty() @IsString() postId: string;
  @ApiProperty({ enum: ['SAF', 'BAKRA', 'MAJLIS', 'MINBAR'] }) @IsEnum(['SAF', 'BAKRA', 'MAJLIS', 'MINBAR']) space: string;
  @IsBoolean() @IsOptional() viewed?: boolean;
  @IsNumber() @IsOptional() viewDurationMs?: number;
  @IsNumber() @IsOptional() completionRate?: number;
  @IsBoolean() @IsOptional() liked?: boolean;
  @IsBoolean() @IsOptional() commented?: boolean;
  @IsBoolean() @IsOptional() shared?: boolean;
  @IsBoolean() @IsOptional() saved?: boolean;
}