import { IsString, IsOptional, IsIn, MaxLength, IsUrl } from 'class-validator';

export class RequestVerificationDto {
  @IsString()
  @IsIn(['creator', 'brand', 'public_figure', 'journalist', 'government', 'organization', 'other'])
  category: string;

  @IsString()
  @MaxLength(1000)
  reason: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  proofUrl?: string;
}
