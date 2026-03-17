import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsIn,
  MinLength,
  MaxLength,
  Matches,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LinkChildDto {
  @ApiProperty({ description: 'ID of the child user to link' })
  @IsString()
  childUserId: string;

  @ApiProperty({ description: '4-digit PIN for parental access' })
  @IsString()
  @MinLength(4)
  @MaxLength(4)
  @Matches(/^\d{4}$/, { message: 'PIN must be exactly 4 digits' })
  pin: string;
}

export class UnlinkChildDto {
  @ApiProperty({ description: '4-digit PIN to verify parent identity' })
  @IsString()
  @MinLength(4)
  @MaxLength(4)
  @Matches(/^\d{4}$/, { message: 'PIN must be exactly 4 digits' })
  pin: string;
}

export class UpdateParentalControlDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  restrictedMode?: boolean;

  @ApiProperty({ required: false, enum: ['G', 'PG', 'PG-13', 'R'] })
  @IsOptional()
  @IsString()
  @IsIn(['G', 'PG', 'PG-13', 'R'])
  maxAgeRating?: string;

  @ApiProperty({ required: false, minimum: 15, maximum: 480 })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(480)
  dailyLimitMinutes?: number | null;

  @ApiProperty({ required: false, enum: ['none', 'contacts_only', 'disabled'] })
  @IsOptional()
  @IsString()
  @IsIn(['none', 'contacts_only', 'disabled'])
  dmRestriction?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  canGoLive?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  canPost?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  canComment?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  activityDigest?: boolean;
}

export class VerifyPinDto {
  @ApiProperty({ description: '4-digit PIN' })
  @IsString()
  @MinLength(4)
  @MaxLength(4)
  @Matches(/^\d{4}$/, { message: 'PIN must be exactly 4 digits' })
  pin: string;
}

export class ChangePinDto {
  @ApiProperty({ description: 'Current 4-digit PIN' })
  @IsString()
  @MinLength(4)
  @MaxLength(4)
  @Matches(/^\d{4}$/, { message: 'PIN must be exactly 4 digits' })
  currentPin: string;

  @ApiProperty({ description: 'New 4-digit PIN' })
  @IsString()
  @MinLength(4)
  @MaxLength(4)
  @Matches(/^\d{4}$/, { message: 'PIN must be exactly 4 digits' })
  newPin: string;
}
