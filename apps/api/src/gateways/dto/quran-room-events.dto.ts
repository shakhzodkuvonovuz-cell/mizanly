import { IsString, IsInt, Min, Max, MaxLength, Matches } from 'class-validator';

// Safe pattern for Redis keys — alphanumeric, hyphens, underscores only
const ROOM_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export class JoinQuranRoomDto {
  @IsString() @MaxLength(50) @Matches(ROOM_ID_PATTERN, { message: 'roomId must be alphanumeric (hyphens/underscores allowed)' }) roomId: string;
}

export class LeaveQuranRoomDto {
  @IsString() @MaxLength(50) @Matches(ROOM_ID_PATTERN, { message: 'roomId must be alphanumeric (hyphens/underscores allowed)' }) roomId: string;
}

export class QuranRoomVerseSyncDto {
  @IsString() @MaxLength(50) @Matches(ROOM_ID_PATTERN, { message: 'roomId must be alphanumeric (hyphens/underscores allowed)' }) roomId: string;
  @IsInt() @Min(1) @Max(114) surahNumber: number;
  @IsInt() @Min(1) @Max(286) verseNumber: number;
}

export class QuranRoomReciterChangeDto {
  @IsString() @MaxLength(50) @Matches(ROOM_ID_PATTERN, { message: 'roomId must be alphanumeric (hyphens/underscores allowed)' }) roomId: string;
  @IsString() @MaxLength(30) reciterId: string;
}
