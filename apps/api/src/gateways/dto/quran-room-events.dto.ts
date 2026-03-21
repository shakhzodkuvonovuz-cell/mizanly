import { IsString, IsInt, Min, Max, MaxLength } from 'class-validator';

export class JoinQuranRoomDto {
  @IsString() @MaxLength(50) roomId: string;
}

export class LeaveQuranRoomDto {
  @IsString() @MaxLength(50) roomId: string;
}

export class QuranRoomVerseSyncDto {
  @IsString() @MaxLength(50) roomId: string;
  @IsInt() @Min(1) @Max(114) surahNumber: number;
  @IsInt() @Min(1) verseNumber: number;
}

export class QuranRoomReciterChangeDto {
  @IsString() @MaxLength(50) roomId: string;
  @IsString() @MaxLength(30) reciterId: string;
}
