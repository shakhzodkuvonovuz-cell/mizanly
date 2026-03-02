import { IsOptional, IsBoolean, IsInt, Min, Max } from 'class-validator';

export class UpdateWellbeingDto {
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(480)
  dailyTimeLimit?: number | null;

  @IsOptional() @IsBoolean() restrictedMode?: boolean;
  @IsOptional() @IsBoolean() sensitiveContent?: boolean;
}
