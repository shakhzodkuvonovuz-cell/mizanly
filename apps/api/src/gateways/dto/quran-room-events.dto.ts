import { IsString, IsInt, Min, Max } from 'class-validator';

export class JoinQuranRoomDto {
  @IsString() roomId: string;
}

export class LeaveQuranRoomDto {
  @IsString() roomId: string;
}

export class QuranRoomVerseSyncDto {
  @IsString() roomId: string;
  @IsInt() @Min(1) @Max(114) surahNumber: number;
  @IsInt() @Min(1) verseNumber: number;
}

export class QuranRoomReciterChangeDto {
  @IsString() roomId: string;
  @IsString() reciterId: string;
}
