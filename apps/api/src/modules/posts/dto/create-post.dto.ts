import { IsString, IsOptional, IsEnum, IsArray, ValidateNested, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

class MediaDto {
  @IsString() url: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() width?: number;
  @IsOptional() height?: number;
}

export class CreatePostDto {
  @IsEnum(['IMAGE', 'CAROUSEL', 'TEXT', 'SHARED_THREAD', 'SHARED_REEL'])
  type: string;

  @IsOptional() @IsString() @MaxLength(2200) caption?: string;
  @IsOptional() @IsString() circleId?: string;
  @IsOptional() @IsEnum(['PUBLIC', 'FOLLOWERS', 'CIRCLE']) visibility?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaDto)
  media?: MediaDto[];
}
