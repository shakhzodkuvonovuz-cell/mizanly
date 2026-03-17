import { IsString, IsOptional, IsIn, IsNumber, MaxLength, IsArray, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class EndScreenItemDto {
  @IsIn(['subscribe', 'watch_next', 'playlist', 'link']) type: string;
  @IsOptional() @IsString() targetId?: string;
  @IsString() @MaxLength(60) label: string;
  @IsOptional() @IsString() url?: string;
  @IsIn(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center-left', 'center-right'])
  position: string;
  @IsNumber() @Min(5) @Max(30) showAtSeconds: number;
}

export class SetEndScreensDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => EndScreenItemDto)
  items: EndScreenItemDto[];
}
