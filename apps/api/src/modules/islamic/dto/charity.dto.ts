import { IsString, IsInt, IsOptional, IsIn, MaxLength, Min, Max, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCampaignDto {
  @ApiProperty() @IsString() @MaxLength(100) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiProperty() @IsInt() @Min(1) @Max(1000000) goalAmount: number;
  @ApiPropertyOptional() @IsOptional() @IsUrl() imageUrl?: string;
}

export class CreateDonationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() campaignId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() recipientUserId?: string;
  @ApiProperty() @IsInt() @Min(1) @Max(1000000) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsIn(['usd', 'gbp', 'eur']) currency?: string;
}
