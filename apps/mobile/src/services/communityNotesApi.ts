import { api } from './api';

type CommunityNote = {
  id: string;
  authorId: string;
  contentType: string;
  contentId: string;
  note: string;
  status: string;
  helpfulCount: number;
  notHelpfulCount: number;
  createdAt: string;
  author?: { id: string; displayName: string; avatarUrl?: string };
};

type NoteRating = {
  id: string;
  noteId: string;
  userId: string;
  rating: string;
};

export const communityNotesApi = {
  create: (data: {
    contentType: 'post' | 'thread' | 'reel';
    contentId: string;
    note: string;
  }) =>
    api.post<CommunityNote>('/community-notes', data),

  getForContent: (contentType: string, contentId: string) =>
    api.get<CommunityNote[]>(`/community-notes/${contentType}/${contentId}`),

  getHelpful: (contentType: string, contentId: string) =>
    api.get<CommunityNote[]>(`/community-notes/${contentType}/${contentId}/helpful`),

  rate: (noteId: string, rating: 'helpful' | 'somewhat_helpful' | 'not_helpful') =>
    api.post<NoteRating>(`/community-notes/${noteId}/rate`, { rating }),
};
