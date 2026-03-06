import {
  IsUrl,
  IsOptional,
  IsNumber,
  IsString,
  IsArray,
  IsBoolean,
  MaxLength,
} from 'class-validator';

export class CreateReelDto {
  // @ts-expect-error TS1240: TypeScript 5.7 decorator compatibility with class-validator 0.14.1
  @IsUrl()
  videoUrl: string;

  // @ts-expect-error TS1240: TypeScript 5.7 decorator compatibility with class-validator 0.14.1
  @IsOptional()
  // @ts-expect-error TS1240: TypeScript 5.7 decorator compatibility with class-validator 0.14.1
  @IsUrl()
  thumbnailUrl?: string;

  // @ts-expect-error TS1240: TypeScript 5.7 decorator compatibility with class-validator 0.14.1
  @IsNumber()
  duration: number;

  // @ts-expect-error TS1240: TypeScript 5.7 decorator compatibility with class-validator 0.14.1
  @IsOptional()
  // @ts-expect-error TS1240: TypeScript 5.7 decorator compatibility with class-validator 0.14.1
  @IsString()
  // @ts-expect-error TS1240: TypeScript 5.7 decorator compatibility with class-validator 0.14.1
  @MaxLength(500)
  caption?: string;

  // @ts-expect-error TS1240: TypeScript 5.7 decorator compatibility with class-validator 0.14.1
  @IsOptional()
  // @ts-expect-error TS1240: TypeScript 5.7 decorator compatibility with class-validator 0.14.1
  @IsArray()
  // @ts-expect-error TS1240: TypeScript 5.7 decorator compatibility with class-validator 0.14.1
  @IsString({ each: true })
  mentions?: string[];

  // @ts-expect-error TS1240: TypeScript 5.7 decorator compatibility with class-validator 0.14.1
  @IsOptional()
  // @ts-expect-error TS1240: TypeScript 5.7 decorator compatibility with class-validator 0.14.1
  @IsArray()
  // @ts-expect-error TS1240: TypeScript 5.7 decorator compatibility with class-validator 0.14.1
  @IsString({ each: true })
  hashtags?: string[];

  // @ts-expect-error TS1240: TypeScript 5.7 decorator compatibility with class-validator 0.14.1
  @IsOptional()
  // @ts-expect-error TS1240: TypeScript 5.7 decorator compatibility with class-validator 0.14.1
  @IsString()
  audioTrackId?: string;

  // @ts-expect-error TS1240: TypeScript 5.7 decorator compatibility with class-validator 0.14.1
  @IsOptional()
  // @ts-expect-error TS1240: TypeScript 5.7 decorator compatibility with class-validator 0.14.1
  @IsBoolean()
  isDuet?: boolean;

  // @ts-expect-error TS1240: TypeScript 5.7 decorator compatibility with class-validator 0.14.1
  @IsOptional()
  // @ts-expect-error TS1240: TypeScript 5.7 decorator compatibility with class-validator 0.14.1
  @IsBoolean()
  isStitch?: boolean;
}