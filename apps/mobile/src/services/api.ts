import { useAuth } from '@clerk/clerk-expo';

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

  put<T>(path: string, body?: any) {
    return this.request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined });
  }

  delete<T>(path: string, body?: any) {
    return this.request<T>(path, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined });
  }
}

export const api = new ApiClient();

// ── Auth ──
export const authApi = {
  register: (data: any) => api.post('/auth/register', data),
  checkUsername: (username: string) => api.get<{ available: boolean }>(`/auth/check-username?username=${username}`),
  me: () => api.get('/auth/me'),
};

// ── Users ──
export const usersApi = {
  getProfile: (username: string) => api.get(`/users/${username}`),
  updateProfile: (data: any) => api.put('/users/profile', data),
  follow: (userId: string) => api.post(`/users/${userId}/follow`),
  unfollow: (userId: string) => api.delete(`/users/${userId}/follow`),
  getFollowers: (userId: string, cursor?: string) => api.get(`/users/${userId}/followers${cursor ? `?cursor=${cursor}` : ''}`),
  getFollowing: (userId: string, cursor?: string) => api.get(`/users/${userId}/following${cursor ? `?cursor=${cursor}` : ''}`),
};

// ── Posts (Saf) ──
export const postsApi = {
  getFeed: (type = 'following', cursor?: string) => api.get(`/posts/feed?type=${type}${cursor ? `&cursor=${cursor}` : ''}`),
  create: (data: any) => api.post('/posts', data),
  getById: (id: string) => api.get(`/posts/${id}`),
  delete: (id: string) => api.delete(`/posts/${id}`),
  like: (id: string) => api.post(`/posts/${id}/like`),
  unlike: (id: string) => api.delete(`/posts/${id}/like`),
  bookmark: (id: string) => api.post(`/posts/${id}/bookmark`),
  unbookmark: (id: string) => api.delete(`/posts/${id}/bookmark`),
  getComments: (id: string, cursor?: string) => api.get(`/posts/${id}/comments${cursor ? `?cursor=${cursor}` : ''}`),
  addComment: (id: string, content: string, parentId?: string) => api.post(`/posts/${id}/comments`, { content, parentId }),
};

// ── Stories (Saf) ──
export const storiesApi = {
  getFeed: () => api.get('/stories/feed'),
  create: (data: any) => api.post('/stories', data),
  markViewed: (id: string) => api.post(`/stories/${id}/view`),
};

// ── Threads (Majlis) ──
export const threadsApi = {
  getFeed: (type = 'foryou', cursor?: string) => api.get(`/threads/feed?type=${type}${cursor ? `&cursor=${cursor}` : ''}`),
  create: (data: any) => api.post('/threads', data),
  getById: (id: string) => api.get(`/threads/${id}`),
  getReplies: (id: string, cursor?: string) => api.get(`/threads/${id}/replies${cursor ? `?cursor=${cursor}` : ''}`),
  delete: (id: string) => api.delete(`/threads/${id}`),
  like: (id: string) => api.post(`/threads/${id}/like`),
  unlike: (id: string) => api.delete(`/threads/${id}/like`),
  repost: (id: string) => api.post(`/threads/${id}/repost`),
  votePoll: (optionId: string) => api.post(`/threads/polls/${optionId}/vote`),
};

// ── Messages (Risalah) ──
export const messagesApi = {
  getConversations: () => api.get('/messages/conversations'),
  getMessages: (id: string, cursor?: string) => api.get(`/messages/conversations/${id}${cursor ? `?cursor=${cursor}` : ''}`),
  sendMessage: (id: string, data: any) => api.post(`/messages/conversations/${id}`, data),
  createDM: (targetUserId: string) => api.post('/messages/dm', { targetUserId }),
  createGroup: (name: string, memberIds: string[]) => api.post('/messages/groups', { name, memberIds }),
  markRead: (id: string) => api.post(`/messages/conversations/${id}/read`),
};

// ── Circles ──
export const circlesApi = {
  getMyCircles: () => api.get('/circles'),
  create: (data: any) => api.post('/circles', data),
  update: (id: string, data: any) => api.put(`/circles/${id}`, data),
  delete: (id: string) => api.delete(`/circles/${id}`),
  getMembers: (id: string) => api.get(`/circles/${id}/members`),
  addMembers: (id: string, memberIds: string[]) => api.post(`/circles/${id}/members`, { memberIds }),
  removeMembers: (id: string, memberIds: string[]) => api.delete(`/circles/${id}/members`, { memberIds }),
};

// ── Notifications ──
export const notificationsApi = {
  get: (filter?: string, cursor?: string) => api.get(`/notifications${filter ? `?filter=${filter}` : ''}${cursor ? `${filter ? '&' : '?'}cursor=${cursor}` : ''}`),
  getUnread: () => api.get<{ unread: number }>('/notifications/unread'),
  markRead: (id: string) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
};

// ── Search ──
export const searchApi = {
  search: (q: string, type?: string) => api.get(`/search?q=${encodeURIComponent(q)}${type ? `&type=${type}` : ''}`),
  trending: () => api.get('/search/trending'),
  suggestions: () => api.get('/search/suggestions'),
};
