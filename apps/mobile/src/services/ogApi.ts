import { api, qs } from './api';

export interface OgMetadata {
  url: string;
  domain: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
}

export const ogApi = {
  /**
   * Unfurl a URL to extract Open Graph metadata for link previews.
   * Backend performs SSRF-safe fetch and parses OG/meta tags.
   */
  unfurl: (url: string) =>
    api.get<OgMetadata>(`/og/unfurl${qs({ url })}`),

  /**
   * Get OG HTML page for a post (used for sharing / deep links).
   * Returns raw HTML — typically used by web crawlers, not the mobile app directly.
   */
  getPostOg: (postId: string) =>
    api.get<string>(`/og/post/${postId}`),

  /**
   * Get OG HTML page for a reel.
   */
  getReelOg: (reelId: string) =>
    api.get<string>(`/og/reel/${reelId}`),

  /**
   * Get OG HTML page for a user profile.
   */
  getProfileOg: (username: string) =>
    api.get<string>(`/og/profile/${username}`),

  /**
   * Get OG HTML page for a thread.
   */
  getThreadOg: (threadId: string) =>
    api.get<string>(`/og/thread/${threadId}`),
};
