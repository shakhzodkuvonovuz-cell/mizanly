import type {
  Post, Story, StoryGroup, StoryHighlightAlbum, Thread, Reel, ThreadReply, Message, Conversation,
  Comment, Notification, SearchResults, PaginatedResponse, User,
  Circle, CircleMember, ProfileLink, FollowRequest, TrendingHashtag,
  BlockedKeyword, Settings,
  Channel, Video, VideoComment,
} from '@/types';

// ── Request payload types (API layer only) ──

type UpdateUserPayload = {
  displayName?: string;
  username?: string;
  bio?: string;
  website?: string;
  isPrivate?: boolean;
  avatarUrl?: string;
  coverUrl?: string;
};

type CreatePostPayload = {
  postType: string;
  content?: string;
  mediaUrls?: string[];
  mediaTypes?: string[];
  thumbnailUrl?: string;
  mediaWidth?: number;
  mediaHeight?: number;
  visibility?: string;
  locationName?: string;
  hashtags?: string[];
  hideLikesCount?: boolean;
  commentsDisabled?: boolean;
};

type CreateStoryPayload = {
  mediaUrl: string;
  mediaType: string;
  thumbnailUrl?: string;
  textOverlay?: string;
  textColor?: string;
  bgColor?: string;
  closeFriendsOnly?: boolean;
};

type UpdateHighlightPayload = { title?: string; coverUrl?: string; position?: number };

type CreateThreadPayload = {
  content: string;
  mediaUrls?: string[];
  mediaTypes?: string[];
  visibility?: string;
  isQuotePost?: boolean;
  quoteText?: string;
};

type CreateReelPayload = {
  videoUrl: string;
  thumbnailUrl?: string;
  duration: number;
  caption?: string;
  mentions?: string[];
  hashtags?: string[];
  audioTrackId?: string;
  isDuet?: boolean;
  isStitch?: boolean;
};

type CreateVideoData = {
  channelId: string;
  title: string;
  description?: string;
  videoUrl: string;
  thumbnailUrl?: string;
  duration: number;
  category?: string;
  tags?: string[];
};

type SendMessagePayload = {
  content?: string;
  messageType?: string;
  mediaUrl?: string;
  replyToId?: string;
  voiceDuration?: number;
};

type PrivacySettings = { isPrivate?: boolean };
type NotificationSettings = {
  notifyLikes?: boolean;
  notifyComments?: boolean;
  notifyFollows?: boolean;
  notifyMentions?: boolean;
  notifyMessages?: boolean;
};
type AccessibilitySettings = { reducedMotion?: boolean; fontSize?: string };
type WellbeingSettings = { sensitiveContentFilter?: boolean; dailyTimeLimit?: number };

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

class ApiClient {
  private getToken: (() => Promise<string | null>) | null = null;

  setTokenGetter(getter: () => Promise<string | null>) {
    this.getToken = getter;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken ? await this.getToken() : null;

    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${res.status}`);
    }

    if (res.status === 204) return null as T;
    return res.json();
  }

  get<T>(path: string) { return this.request<T>(path); }
  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
  }
  patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
  }
  put<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined });
  }
  delete<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'DELETE',
      body: body ? JSON.stringify(body) : undefined,
    });
  }
}

export const api = new ApiClient();

// Build query string from params object, skipping undefined/empty values
const qs = (params: Record<string, string | number | undefined>) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join('&');
  return s ? `?${s}` : '';
};

// ── Auth ──
export const authApi = {
  register: (data: { clerkId: string; username: string; displayName: string; avatarUrl?: string }) =>
    api.post<User>('/auth/register', data),
  me: () => api.get<User>('/auth/me'),
  checkUsername: (username: string) =>
    api.get<{ available: boolean }>(`/auth/check-username?username=${encodeURIComponent(username)}`),
  setInterests: (categories: string[]) => api.post('/auth/interests', { categories }),
  suggestedUsers: () => api.get<User[]>('/auth/suggested-users'),
};

// ── Users ──
export const usersApi = {
  getMe: () => api.get<User>('/users/me'),
  updateMe: (data: UpdateUserPayload) => api.patch<User>('/users/me', data),
  deactivate: () => api.delete('/users/me'),
  getProfile: (username: string) => api.get<User>(`/users/${username}`),
  getUserPosts: (username: string, cursor?: string) =>
    api.get<PaginatedResponse<Post>>(`/users/${username}/posts${qs({ cursor })}`),
  getUserThreads: (username: string, cursor?: string) =>
    api.get<PaginatedResponse<Thread>>(`/users/${username}/threads${qs({ cursor })}`),
  getSavedPosts: (cursor?: string) =>
    api.get<PaginatedResponse<Post>>(`/users/me/saved-posts${qs({ cursor })}`),
  getSavedThreads: (cursor?: string) =>
    api.get<PaginatedResponse<Thread>>(`/users/me/saved-threads${qs({ cursor })}`),
  getFollowRequests: () => api.get('/users/me/follow-requests'),
  getAnalytics: () => api.get('/users/me/analytics'),
  report: (userId: string, reason: string) => api.post(`/users/${userId}/report`, { reason }),
};

// ── Follows ──
export const followsApi = {
  follow: (userId: string) => api.post(`/follows/${userId}`),
  unfollow: (userId: string) => api.delete(`/follows/${userId}`),
  getFollowers: (userId: string, cursor?: string) =>
    api.get<PaginatedResponse<User>>(`/follows/${userId}/followers${qs({ cursor })}`),
  getFollowing: (userId: string, cursor?: string) =>
    api.get<PaginatedResponse<User>>(`/follows/${userId}/following${qs({ cursor })}`),
  getRequests: () => api.get<PaginatedResponse<FollowRequest>>('/follows/requests'),
  acceptRequest: (id: string) => api.post(`/follows/requests/${id}/accept`),
  declineRequest: (id: string) => api.post(`/follows/requests/${id}/decline`),
  cancelRequest: (id: string) => api.delete(`/follows/requests/${id}`),
  suggestions: () => api.get<User[]>('/follows/suggestions'),
};

// ── Posts (Saf) ──
export const postsApi = {
  getFeed: (type: 'following' | 'foryou' = 'following', cursor?: string) =>
    api.get<PaginatedResponse<Post>>(`/posts/feed${qs({ type, cursor })}`),
  create: (data: CreatePostPayload) => api.post<Post>('/posts', data),
  getById: (id: string) => api.get<Post>(`/posts/${id}`),
  update: (id: string, data: Partial<CreatePostPayload>) => api.patch<Post>(`/posts/${id}`, data),
  delete: (id: string) => api.delete(`/posts/${id}`),
  react: (id: string, reaction: string) => api.post(`/posts/${id}/react`, { reaction }),
  unreact: (id: string) => api.delete(`/posts/${id}/react`),
  save: (id: string) => api.post(`/posts/${id}/save`),
  unsave: (id: string) => api.delete(`/posts/${id}/save`),
  share: (id: string, content?: string) => api.post(`/posts/${id}/share`, { content }),
  getComments: (id: string, cursor?: string) =>
    api.get<PaginatedResponse<Comment>>(`/posts/${id}/comments${qs({ cursor })}`),
  addComment: (id: string, content: string, parentId?: string) =>
    api.post<Comment>(`/posts/${id}/comments`, { content, parentId }),
  editComment: (postId: string, commentId: string, content: string) =>
    api.patch<Comment>(`/posts/${postId}/comments/${commentId}`, { content }),
  report: (id: string, reason: string) => api.post(`/posts/${id}/report`, { reason }),
  dismiss: (id: string) => api.post(`/posts/${id}/dismiss`),
  deleteComment: (postId: string, commentId: string) =>
    api.delete(`/posts/${postId}/comments/${commentId}`),
  likeComment: (postId: string, commentId: string) =>
    api.post(`/posts/${postId}/comments/${commentId}/like`),
  unlikeComment: (postId: string, commentId: string) =>
    api.delete(`/posts/${postId}/comments/${commentId}/like`),
  getCommentReplies: (postId: string, commentId: string, cursor?: string) =>
    api.get<PaginatedResponse<Comment>>(`/posts/${postId}/comments/${commentId}/replies${qs({ cursor })}`),
};

// ── Stories (Saf) ──
export const storiesApi = {
  getFeed: () => api.get<StoryGroup[]>('/stories/feed'),
  create: (data: CreateStoryPayload) => api.post<Story>('/stories', data),
  getById: (id: string) => api.get<Story>(`/stories/${id}`),
  delete: (id: string) => api.delete(`/stories/${id}`),
  markViewed: (id: string) => api.post<{ viewed: boolean }>(`/stories/${id}/view`),
  getViewers: (id: string, cursor?: string) =>
    api.get<PaginatedResponse<User>>(`/stories/${id}/viewers${qs({ cursor })}`),
  getHighlights: (userId: string) => api.get<StoryHighlightAlbum[]>(`/stories/highlights/${userId}`),
  getHighlightById: (albumId: string) => api.get<StoryHighlightAlbum>(`/stories/highlights/album/${albumId}`),
  createHighlight: (title: string, coverUrl?: string) =>
    api.post<StoryHighlightAlbum>('/stories/highlights', { title, coverUrl }),
  updateHighlight: (albumId: string, data: UpdateHighlightPayload) =>
    api.patch<StoryHighlightAlbum>(`/stories/highlights/${albumId}`, data),
  deleteHighlight: (albumId: string) => api.delete(`/stories/highlights/${albumId}`),
  addToHighlight: (albumId: string, storyId: string) =>
    api.post(`/stories/highlights/${albumId}/stories/${storyId}`),
};

// ── Reels (Bakra) ──
export const reelsApi = {
  getFeed: (cursor?: string) => api.get<PaginatedResponse<Reel>>(`/reels/feed${qs({ cursor })}`),
  getById: (id: string) => api.get<Reel>(`/reels/${id}`),
  create: (data: CreateReelPayload) => api.post<Reel>('/reels', data),
  delete: (id: string) => api.delete(`/reels/${id}`),
  like: (id: string) => api.post(`/reels/${id}/like`),
  unlike: (id: string) => api.delete(`/reels/${id}/like`),
  comment: (id: string, content: string) => api.post(`/reels/${id}/comment`, { content }),
  getComments: (id: string, cursor?: string) => api.get<PaginatedResponse<Comment>>(`/reels/${id}/comments${qs({ cursor })}`),
  share: (id: string) => api.post(`/reels/${id}/share`),
  bookmark: (id: string) => api.post(`/reels/${id}/bookmark`),
  unbookmark: (id: string) => api.delete(`/reels/${id}/bookmark`),
  view: (id: string) => api.post(`/reels/${id}/view`),
  getUserReels: (username: string, cursor?: string) => api.get<PaginatedResponse<Reel>>(`/reels/user/${username}${qs({ cursor })}`),
  report: (id: string, reason: string) => api.post(`/reels/${id}/report`, { reason }),
};

// ── Channels (Minbar) ──
export const channelsApi = {
  create: (data: { handle: string; name: string; description?: string }) =>
    api.post<Channel>('/channels', data).then(r => r.data),
  getByHandle: (handle: string) =>
    api.get<Channel>(`/channels/${handle}`).then(r => r.data),
  update: (handle: string, data: Partial<Channel>) =>
    api.patch<Channel>(`/channels/${handle}`, data).then(r => r.data),
  delete: (handle: string) =>
    api.delete(`/channels/${handle}`).then(r => r.data),
  subscribe: (handle: string) =>
    api.post(`/channels/${handle}/subscribe`).then(r => r.data),
  unsubscribe: (handle: string) =>
    api.delete(`/channels/${handle}/subscribe`).then(r => r.data),
  getVideos: (handle: string, cursor?: string) =>
    api.get<PaginatedResponse<Video>>(`/channels/${handle}/videos${qs({ cursor })}`).then(r => r.data),
  getMyChannels: () =>
    api.get<Channel[]>('/channels/me/channels').then(r => r.data),
};

// ── Videos (Minbar) ──
export const videosApi = {
  getFeed: (category?: string, cursor?: string) =>
    api.get<PaginatedResponse<Video>>(`/videos/feed${qs({ category, cursor })}`).then(r => r.data),
  getById: (id: string) =>
    api.get<Video>(`/videos/${id}`).then(r => r.data),
  create: (data: CreateVideoData) =>
    api.post<Video>('/videos', data).then(r => r.data),
  update: (id: string, data: Partial<Video>) =>
    api.patch<Video>(`/videos/${id}`, data).then(r => r.data),
  delete: (id: string) =>
    api.delete(`/videos/${id}`).then(r => r.data),
  like: (id: string) =>
    api.post(`/videos/${id}/like`).then(r => r.data),
  dislike: (id: string) =>
    api.post(`/videos/${id}/dislike`).then(r => r.data),
  removeReaction: (id: string) =>
    api.delete(`/videos/${id}/reaction`).then(r => r.data),
  comment: (id: string, content: string, parentId?: string) =>
    api.post(`/videos/${id}/comment`, { content, parentId }).then(r => r.data),
  getComments: (id: string, cursor?: string) =>
    api.get<PaginatedResponse<VideoComment>>(`/videos/${id}/comments${qs({ cursor })}`).then(r => r.data),
  bookmark: (id: string) =>
    api.post(`/videos/${id}/bookmark`).then(r => r.data),
  unbookmark: (id: string) =>
    api.delete(`/videos/${id}/bookmark`).then(r => r.data),
  view: (id: string) =>
    api.post(`/videos/${id}/view`).then(r => r.data),
  report: (id: string, reason: string) =>
    api.post(`/videos/${id}/report`, { reason }).then(r => r.data),
};

// ── Threads (Majlis) ──
export const threadsApi = {
  getFeed: (type: 'foryou' | 'following' | 'trending' = 'foryou', cursor?: string) =>
    api.get<PaginatedResponse<Thread>>(`/threads/feed${qs({ type, cursor })}`),
  create: (data: CreateThreadPayload) => api.post<Thread>('/threads', data),
  getById: (id: string) => api.get<Thread>(`/threads/${id}`),
  delete: (id: string) => api.delete(`/threads/${id}`),
  report: (id: string, reason: string) => api.post(`/threads/${id}/report`, { reason }),
  dismiss: (id: string) => api.post(`/threads/${id}/dismiss`),
  like: (id: string) => api.post(`/threads/${id}/like`),
  unlike: (id: string) => api.delete(`/threads/${id}/like`),
  repost: (id: string) => api.post<Thread>(`/threads/${id}/repost`),
  unrepost: (id: string) => api.delete(`/threads/${id}/repost`),
  bookmark: (id: string) => api.post(`/threads/${id}/bookmark`),
  unbookmark: (id: string) => api.delete(`/threads/${id}/bookmark`),
  getReplies: (id: string, cursor?: string) =>
    api.get<PaginatedResponse<ThreadReply>>(`/threads/${id}/replies${qs({ cursor })}`),
  addReply: (id: string, content: string, parentId?: string) =>
    api.post<ThreadReply>(`/threads/${id}/replies`, { content, parentId }),
  deleteReply: (threadId: string, replyId: string) =>
    api.delete(`/threads/${threadId}/replies/${replyId}`),
  likeReply: (threadId: string, replyId: string) =>
    api.post(`/threads/${threadId}/replies/${replyId}/like`),
  unlikeReply: (threadId: string, replyId: string) =>
    api.delete(`/threads/${threadId}/replies/${replyId}/like`),
  votePoll: (optionId: string) => api.post(`/threads/polls/${optionId}/vote`),
  getUserThreads: (username: string, cursor?: string) =>
    api.get<PaginatedResponse<Thread>>(`/threads/user/${username}${qs({ cursor })}`),
};

// ── Messages (Risalah) ──
export const messagesApi = {
  getConversations: () => api.get<Conversation[]>('/messages/conversations'),
  getConversation: (id: string) => api.get<Conversation>(`/messages/conversations/${id}`),
  getMessages: (id: string, cursor?: string) =>
    api.get<PaginatedResponse<Message>>(`/messages/conversations/${id}/messages${qs({ cursor })}`),
  sendMessage: (id: string, data: SendMessagePayload) =>
    api.post<Message>(`/messages/conversations/${id}/messages`, data),
  deleteMessage: (convId: string, messageId: string) =>
    api.delete(`/messages/conversations/${convId}/messages/${messageId}`),
  editMessage: (convId: string, messageId: string, content: string) =>
    api.patch(`/messages/conversations/${convId}/messages/${messageId}`, { content }),
  reactToMessage: (convId: string, messageId: string, emoji: string) =>
    api.post(`/messages/conversations/${convId}/messages/${messageId}/react`, { emoji }),
  removeReaction: (convId: string, messageId: string, emoji: string) =>
    api.delete(`/messages/conversations/${convId}/messages/${messageId}/react`, { emoji }),
  markRead: (id: string) => api.post(`/messages/conversations/${id}/read`),
  mute: (id: string, muted: boolean) =>
    api.post(`/messages/conversations/${id}/mute`, { muted }),
  archive: (id: string, archived: boolean) =>
    api.post(`/messages/conversations/${id}/archive`, { archived }),
  createDM: (targetUserId: string) => api.post<Conversation>('/messages/dm', { targetUserId }),
  createGroup: (groupName: string, memberIds: string[]) =>
    api.post<Conversation>('/messages/groups', { groupName, memberIds }),
  updateGroup: (id: string, data: { groupName?: string; groupAvatarUrl?: string }) =>
    api.patch<Conversation>(`/messages/groups/${id}`, data),
  addMembers: (id: string, memberIds: string[]) =>
    api.post(`/messages/groups/${id}/members`, { memberIds }),
  removeMember: (id: string, userId: string) =>
    api.delete(`/messages/groups/${id}/members/${userId}`),
  leaveGroup: (id: string) => api.delete(`/messages/groups/${id}/members/me`),
};

// ── Notifications ──
export const notificationsApi = {
  get: (filter?: 'all' | 'mentions' | 'verified', cursor?: string) =>
    api.get<PaginatedResponse<Notification>>(`/notifications${qs({ filter, cursor })}`),
  getUnreadCount: () => api.get<{ unread: number }>('/notifications/unread'),
  markRead: (id: string) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
  delete: (id: string) => api.delete(`/notifications/${id}`),
};

// ── Search ──
export const searchApi = {
  search: (query: string, type?: string, cursor?: string) =>
    api.get<SearchResults>(`/search${qs({ q: query, type, cursor })}`),
  trending: () => api.get<TrendingHashtag[]>('/search/trending'),
  suggestions: () => api.get<User[]>('/search/suggestions'),
  hashtagPosts: (tag: string, cursor?: string) =>
    api.get<PaginatedResponse<Post>>(`/search/hashtag/${encodeURIComponent(tag)}${qs({ cursor })}`),
};

// ── Upload ──
export const uploadApi = {
  getPresignUrl: (contentType: string, folder: string) =>
    api.post<{ uploadUrl: string; key: string; publicUrl: string; expiresIn: number }>(
      '/upload/presign',
      { contentType, folder },
    ),
};

// ── Circles ──
export const circlesApi = {
  getMyCircles: () => api.get<Circle[]>('/circles'),
  create: (name: string, emoji?: string) => api.post<Circle>('/circles', { name, emoji }),
  update: (id: string, data: { name?: string; emoji?: string }) =>
    api.patch<Circle>(`/circles/${id}`, data),
  delete: (id: string) => api.delete(`/circles/${id}`),
  getMembers: (id: string) => api.get<CircleMember[]>(`/circles/${id}/members`),
  addMembers: (id: string, memberIds: string[]) =>
    api.post(`/circles/${id}/members`, { memberIds }),
  removeMembers: (id: string, memberIds: string[]) =>
    api.delete(`/circles/${id}/members`, { memberIds }),
};

// ── Devices (push notifications) ──
export const devicesApi = {
  register: (pushToken: string, platform: string, deviceId?: string) =>
    api.post('/devices', { pushToken, platform, deviceId }),
  unregister: (pushToken: string) => api.delete(`/devices/${encodeURIComponent(pushToken)}`),
};

// ── Profile Links ──
export const profileLinksApi = {
  getLinks: () => api.get<ProfileLink[]>('/profile-links'),
  create: (data: { title: string; url: string }) => api.post<ProfileLink>('/profile-links', data),
  update: (id: string, data: { title?: string; url?: string }) =>
    api.patch<ProfileLink>(`/profile-links/${id}`, data),
  delete: (id: string) => api.delete(`/profile-links/${id}`),
  reorder: (ids: string[]) => api.put('/profile-links/reorder', { ids }),
};

// ── Blocks ──
export const blocksApi = {
  getBlocked: (cursor?: string) => api.get<PaginatedResponse<User>>(`/blocks${qs({ cursor })}`),
  block: (userId: string) => api.post(`/blocks/${userId}`),
  unblock: (userId: string) => api.delete(`/blocks/${userId}`),
};

// ── Mutes ──
export const mutesApi = {
  getMuted: (cursor?: string) => api.get<PaginatedResponse<User>>(`/mutes${qs({ cursor })}`),
  mute: (userId: string) => api.post(`/mutes/${userId}`),
  unmute: (userId: string) => api.delete(`/mutes/${userId}`),
};

// ── Settings ──
export const settingsApi = {
  get: () => api.get<Settings>('/settings'),
  updatePrivacy: (data: PrivacySettings) => api.patch<Settings>('/settings/privacy', data),
  updateNotifications: (data: NotificationSettings) => api.patch<Settings>('/settings/notifications', data),
  updateAccessibility: (data: AccessibilitySettings) => api.patch<Settings>('/settings/accessibility', data),
  updateWellbeing: (data: WellbeingSettings) => api.patch<Settings>('/settings/wellbeing', data),
  getBlockedKeywords: () => api.get<BlockedKeyword[]>('/settings/blocked-keywords'),
  addBlockedKeyword: (word: string) => api.post<BlockedKeyword>('/settings/blocked-keywords', { word }),
  deleteBlockedKeyword: (id: string) => api.delete(`/settings/blocked-keywords/${id}`),
};
