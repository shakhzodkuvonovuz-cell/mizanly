import { IsString, MaxLength, IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDMNoteDto {
  @ApiProperty({ description: 'Note content', maxLength: 60 })
  @IsString()
  @MaxLength(60)
  content: string;

  @ApiProperty({ required: false, description: 'Hours until expiry (1-72, default 24)', minimum: 1, maximum: 72 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(72)
  expiresInHours?: number;
}
