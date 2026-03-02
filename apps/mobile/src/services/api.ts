import type {
  Post, Story, StoryGroup, Thread, ThreadReply, Message, Conversation,
  Comment, Notification, SearchResults, PaginatedResponse, User,
} from '@/types';

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

    return res.json();
  }

  get<T>(path: string) { return this.request<T>(path); }
  post<T>(path: string, body?: any) {
    return this.request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
  }
  patch<T>(path: string, body?: any) {
    return this.request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
  }
  put<T>(path: string, body?: any) {
    return this.request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined });
  }
  delete<T>(path: string, body?: any) {
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
  updateMe: (data: any) => api.patch<User>('/users/me', data),
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
};

// ── Follows ──
export const followsApi = {
  follow: (userId: string) => api.post(`/follows/${userId}`),
  unfollow: (userId: string) => api.delete(`/follows/${userId}`),
  getFollowers: (userId: string, cursor?: string) =>
    api.get<PaginatedResponse<User>>(`/follows/${userId}/followers${qs({ cursor })}`),
  getFollowing: (userId: string, cursor?: string) =>
    api.get<PaginatedResponse<User>>(`/follows/${userId}/following${qs({ cursor })}`),
  acceptRequest: (id: string) => api.post(`/follows/requests/${id}/accept`),
  declineRequest: (id: string) => api.post(`/follows/requests/${id}/decline`),
  cancelRequest: (id: string) => api.delete(`/follows/requests/${id}`),
  suggestions: () => api.get<User[]>('/follows/suggestions'),
};

// ── Posts (Saf) ──
export const postsApi = {
  getFeed: (type: 'following' | 'foryou' = 'following', cursor?: string) =>
    api.get<PaginatedResponse<Post>>(`/posts/feed${qs({ type, cursor })}`),
  create: (data: any) => api.post<Post>('/posts', data),
  getById: (id: string, viewerId?: string) =>
    api.get<Post>(`/posts/${id}${qs({ viewerId })}`),
  update: (id: string, data: any) => api.patch<Post>(`/posts/${id}`, data),
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
  create: (data: any) => api.post<Story>('/stories', data),
  getById: (id: string) => api.get<Story>(`/stories/${id}`),
  delete: (id: string) => api.delete(`/stories/${id}`),
  markViewed: (id: string) => api.post<{ viewed: boolean }>(`/stories/${id}/view`),
  getViewers: (id: string, cursor?: string) =>
    api.get(`/stories/${id}/viewers${qs({ cursor })}`),
  getHighlights: (userId: string) => api.get(`/stories/highlights/${userId}`),
  createHighlight: (title: string, coverUrl?: string) =>
    api.post('/stories/highlights', { title, coverUrl }),
  updateHighlight: (albumId: string, data: any) =>
    api.patch(`/stories/highlights/${albumId}`, data),
  deleteHighlight: (albumId: string) => api.delete(`/stories/highlights/${albumId}`),
  addToHighlight: (albumId: string, storyId: string) =>
    api.post(`/stories/highlights/${albumId}/stories/${storyId}`),
};

// ── Threads (Majlis) ──
export const threadsApi = {
  getFeed: (type: 'foryou' | 'following' | 'trending' = 'foryou', cursor?: string) =>
    api.get<PaginatedResponse<Thread>>(`/threads/feed${qs({ type, cursor })}`),
  create: (data: any) => api.post<Thread>('/threads', data),
  getById: (id: string, viewerId?: string) =>
    api.get<Thread>(`/threads/${id}${qs({ viewerId })}`),
  delete: (id: string) => api.delete(`/threads/${id}`),
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
  sendMessage: (id: string, data: any) =>
    api.post<Message>(`/messages/conversations/${id}/messages`, data),
  deleteMessage: (convId: string, messageId: string) =>
    api.delete(`/messages/conversations/${convId}/messages/${messageId}`),
  reactToMessage: (convId: string, messageId: string, emoji: string) =>
    api.post(`/messages/conversations/${convId}/messages/${messageId}/react`, { emoji }),
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
  trending: () => api.get('/search/trending'),
  suggestions: () => api.get<User[]>('/search/suggestions'),
};

// ── Upload ──
export const uploadApi = {
  getPresignUrl: (contentType: string, folder: string) =>
    api.post<{ uploadUrl: string; key: string; publicUrl: string; expiresIn: number }>(
      '/upload/presign',
      { contentType, folder },
    ),
};

// ── Settings ──
export const settingsApi = {
  get: () => api.get('/settings'),
  updatePrivacy: (data: any) => api.patch('/settings/privacy', data),
  updateNotifications: (data: any) => api.patch('/settings/notifications', data),
  updateAccessibility: (data: any) => api.patch('/settings/accessibility', data),
  updateWellbeing: (data: any) => api.patch('/settings/wellbeing', data),
  getBlockedKeywords: () => api.get('/settings/blocked-keywords'),
  addBlockedKeyword: (word: string) => api.post('/settings/blocked-keywords', { word }),
  deleteBlockedKeyword: (id: string) => api.delete(`/settings/blocked-keywords/${id}`),
};
