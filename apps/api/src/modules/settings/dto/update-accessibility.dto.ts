import { IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateAccessibilityDto {
  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean() reducedMotion?: boolean;
  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean() largeText?: boolean;
  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean() highContrast?: boolean;
}
