import { IsOptional, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateWellbeingDto {
  @ApiProperty({ required: false, minimum: 15, maximum: 480 })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(480)
  dailyTimeLimit?: number | null;

  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean() restrictedMode?: boolean;
  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean() sensitiveContent?: boolean;
}
