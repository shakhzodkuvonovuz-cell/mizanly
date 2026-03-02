import { IsOptional, IsBoolean } from 'class-validator';

export class UpdateAccessibilityDto {
  @IsOptional() @IsBoolean() reducedMotion?: boolean;
  @IsOptional() @IsBoolean() largeText?: boolean;
  @IsOptional() @IsBoolean() highContrast?: boolean;
}
