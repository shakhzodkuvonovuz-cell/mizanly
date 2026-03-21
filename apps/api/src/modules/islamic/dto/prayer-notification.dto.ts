import { IsBoolean, IsIn, IsInt, IsOptional, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePrayerNotificationDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() dndDuringPrayer?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() adhanEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsIn(['mishary', 'abdulbasit', 'maher', 'sudais', 'husary', 'minshawi']) adhanStyle?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(60) reminderMinutes?: number;
}
