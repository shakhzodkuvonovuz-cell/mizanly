import { IsString, IsOptional, IsNumber, MaxLength, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BanUserDto {
  @ApiProperty({ description: 'Reason for ban', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason: string;

  @ApiProperty({ required: false, description: 'Ban duration in hours (omit for permanent)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  duration?: number;
}
