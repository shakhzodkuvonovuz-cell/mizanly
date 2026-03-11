import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCircleDto {
  @ApiProperty({ required: false, description: 'New circle name', maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  name?: string;
}
