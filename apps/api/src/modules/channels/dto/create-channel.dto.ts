import { IsString, IsOptional, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateChannelDto {
  @ApiProperty({ maxLength: 50 })
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Handle can only contain letters, numbers, and underscores' })
  handle: string;

  @ApiProperty({ maxLength: 50 })
  @IsString()
  @MaxLength(50)
  name: string;

  @ApiProperty({ required: false, maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;
}