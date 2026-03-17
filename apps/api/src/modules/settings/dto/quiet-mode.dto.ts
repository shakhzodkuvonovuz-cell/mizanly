import { IsOptional, IsBoolean, IsString, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateQuietModeDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  autoReply?: string;

  @ApiProperty({ required: false, description: 'Start time in HH:mm format' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime must be HH:mm format' })
  startTime?: string;

  @ApiProperty({ required: false, description: 'End time in HH:mm format' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'endTime must be HH:mm format' })
  endTime?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isScheduled?: boolean;
}
