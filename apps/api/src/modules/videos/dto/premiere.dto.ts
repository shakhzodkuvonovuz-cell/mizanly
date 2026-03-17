import { IsDateString, IsBoolean, IsOptional, IsIn, IsString } from 'class-validator';

export class CreatePremiereDto {
  @IsDateString() scheduledAt: string;
  @IsOptional() @IsBoolean() chatEnabled?: boolean;
  @IsOptional() @IsIn(['emerald', 'gold', 'cosmic']) countdownTheme?: string;
  @IsOptional() @IsString() trailerUrl?: string;
}
