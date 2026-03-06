export class CreateReelDto {
  videoUrl: string;
  thumbnailUrl?: string;
  duration: number;
  caption?: string;
  mentions?: string[];
  hashtags?: string[];
  audioTrackId?: string;
  isDuet?: boolean;
  isStitch?: boolean;
}