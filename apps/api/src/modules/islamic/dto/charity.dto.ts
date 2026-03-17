import { IsString, IsInt, IsOptional, IsIn, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCampaignDto {
  @ApiProperty() @IsString() @MaxLength(100) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiProperty() @IsInt() @Min(100) goalAmount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() imageUrl?: string;
}

export class CreateDonationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() campaignId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() recipientUserId?: string;
  @ApiProperty() @IsInt() @Min(100) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsIn(['usd', 'gbp', 'eur']) currency?: string;
}
