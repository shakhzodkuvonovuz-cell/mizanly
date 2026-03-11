import { IsString, IsOptional, IsArray, IsUUID, MaxLength, ArrayMaxSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCircleDto {
  @ApiProperty({ description: 'Circle name', maxLength: 30 })
  @IsString()
  @MaxLength(30)
  name: string;

  @ApiProperty({ required: false, description: 'Initial member IDs', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(100)
  memberIds?: string[];
}
