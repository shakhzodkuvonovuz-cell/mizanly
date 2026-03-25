import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class JoinWaitlistDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: 'Shakhzod' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'Referral code from an existing waitlist member' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  referralCode?: string;

  @ApiPropertyOptional({ description: 'UTM source or channel' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  source?: string;
}
