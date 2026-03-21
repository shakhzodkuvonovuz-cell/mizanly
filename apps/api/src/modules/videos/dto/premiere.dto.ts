import { IsDateString, IsBoolean, IsOptional, IsIn, IsUrl } from 'class-validator';

export class CreatePremiereDto {
  @IsDateString() scheduledAt: string;
  @IsOptional() @IsBoolean() chatEnabled?: boolean;
  @IsOptional() @IsIn(['emerald', 'gold', 'cosmic']) countdownTheme?: string;
  @IsOptional() @IsUrl() trailerUrl?: string;
}
