import { IsString, IsInt, IsOptional, IsIn, IsDateString, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SaveDhikrSessionDto {
  @ApiProperty() @IsIn(['subhanallah', 'alhamdulillah', 'allahuakbar', 'lailahaillallah', 'astaghfirullah']) phrase: string;
  @ApiProperty() @IsInt() @Min(1) count: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) target?: number;
}

export class CreateDhikrChallengeDto {
  @ApiProperty() @IsString() @MaxLength(100) title: string;
  @ApiProperty() @IsIn(['subhanallah', 'alhamdulillah', 'allahuakbar', 'lailahaillallah', 'astaghfirullah']) phrase: string;
  @ApiProperty() @IsInt() @Min(100) targetTotal: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiresAt?: string;
}

export class ContributeDhikrDto {
  @ApiProperty() @IsInt() @Min(1) count: number;
}
