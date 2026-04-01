import { IsString, IsOptional } from 'class-validator';

export class IdentityChangeDto {
  @IsString()
  userId: string;

  @IsOptional()
  @IsString()
  oldFingerprint?: string;

  @IsString()
  newFingerprint: string;
}
