import { api, qs } from './api';

type ForumThread = {
  id: string;
  circleId: string;
  authorId: string;
  title: string;
  content: string;
  tags?: string[];
  isPinned: boolean;
  isLocked: boolean;
  replyCount: number;
  createdAt: string;
  author?: { id: string; displayName: string; avatarUrl?: string };
};

type ForumReply = {
  id: string;
  threadId: string;
  authorId: string;
  content: string;
  createdAt: string;
  author?: { id: string; displayName: string; avatarUrl?: string };
};

type Webhook = {
  id: string;
  circleId: string;
  name: string;
  url: string;
  token: string;
  avatarUrl?: string;
  channelId?: string;
  createdAt: string;
};

type StageSession = {
  id: string;
  circleId: string;
  title: string;
  topic?: string;
  status: string;
  hostId: string;
  speakers?: string[];
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
};

type PaginatedResponse<T> = { data: T[]; meta: { cursor?: string; hasMore: boolean } };

export const discordFeaturesApi = {
  // Forum Threads
  createForumThread: (circleId: string, data: {
    title: string;
    content: string;
    tags?: string[];
  }) =>
    api.post<ForumThread>(`/circles/${circleId}/forum`, data),

  getForumThreads: (circleId: string, cursor?: string) =>
    api.get<PaginatedResponse<ForumThread>>(
      `/circles/${circleId}/forum${qs({ cursor })}`,
    ),

  getForumThread: (threadId: string) =>
    api.get<ForumThread>(`/forum/${threadId}`),

  replyToForumThread: (threadId: string, content: string) =>
    api.post<ForumReply>(`/forum/${threadId}/reply`, { content }),

  getForumReplies: (threadId: string, cursor?: string) =>
    api.get<PaginatedResponse<ForumReply>>(
      `/forum/${threadId}/replies${qs({ cursor })}`,
    ),

  lockForumThread: (threadId: string) =>
    api.patch<ForumThread>(`/forum/${threadId}/lock`, {}),

  pinForumThread: (threadId: string) =>
    api.patch<ForumThread>(`/forum/${threadId}/pin`, {}),

  // Webhooks
  createWebhook: (circleId: string, data: {
    name: string;
    url: string;
    avatarUrl?: string;
    channelId?: string;
  }) =>
    api.post<Webhook>(`/circles/${circleId}/webhooks`, data),

  getWebhooks: (circleId: string) =>
    api.get<Webhook[]>(`/circles/${circleId}/webhooks`),

  deleteWebhook: (id: string) =>
    api.delete<void>(`/webhooks/${id}`),

  executeWebhook: (token: string, data: {
    content?: string;
    username?: string;
    avatarUrl?: string;
    embeds?: Record<string, unknown>[];
  }) =>
    api.post<void>(`/webhooks/${token}/execute`, data),

  // Stage Sessions
  createStageSession: (circleId: string, data: {
    title: string;
    topic?: string;
    scheduledAt?: string;
  }) =>
    api.post<StageSession>(`/circles/${circleId}/stage`, data),

  startStage: (id: string) =>
    api.post<StageSession>(`/stage/${id}/start`, {}),

  endStage: (id: string) =>
    api.post<StageSession>(`/stage/${id}/end`, {}),

  inviteSpeaker: (stageId: string, speakerId: string) =>
    api.post<void>(`/stage/${stageId}/speaker`, { speakerId }),

  getActiveStageSessions: (circleId?: string) =>
    api.get<StageSession[]>(`/stage/active${qs({ circleId })}`),
};
