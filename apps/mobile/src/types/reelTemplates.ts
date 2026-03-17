export interface ReelTemplateSegment {
  startMs: number;
  endMs: number;
  text?: string;
}

export interface ReelTemplate {
  id: string;
  name: string;
  sourceReelId: string;
  sourceReel?: {
    id: string;
    thumbnailUrl: string;
    user: { username: string; avatarUrl: string | null };
  };
  segments: ReelTemplateSegment[];
  useCount: number;
  createdAt: string;
}
