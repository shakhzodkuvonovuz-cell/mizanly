import { api, qs } from './api';

type StoryChain = {
  id: string;
  creatorId: string;
  prompt: string;
  coverUrl?: string;
  participantCount: number;
  createdAt: string;
  creator?: { id: string; displayName: string; avatarUrl?: string };
};

type StoryChainEntry = {
  id: string;
  chainId: string;
  userId: string;
  storyId: string;
  createdAt: string;
  user?: { id: string; displayName: string; avatarUrl?: string };
};

type StoryChainStats = {
  participantCount: number;
  totalViews: number;
};

type PaginatedResponse<T> = { data: T[]; meta: { cursor?: string; hasMore: boolean } };

export const storyChainsApi = {
  create: (data: { prompt: string; coverUrl?: string }) =>
    api.post<StoryChain>('/story-chains', data),

  getTrending: (cursor?: string) =>
    api.get<PaginatedResponse<StoryChain>>(
      `/story-chains/trending${qs({ cursor })}`,
    ),

  getChain: (chainId: string, cursor?: string) =>
    api.get<{ chain: StoryChain; entries: PaginatedResponse<StoryChainEntry> }>(
      `/story-chains/${chainId}${qs({ cursor })}`,
    ),

  join: (chainId: string, storyId: string) =>
    api.post<StoryChainEntry>(`/story-chains/${chainId}/join`, { storyId }),

  getStats: (chainId: string) =>
    api.get<StoryChainStats>(`/story-chains/${chainId}/stats`),
};
