/**
 * GIPHY Service — Unified interface for GIF/Sticker/Text/Clip operations.
 *
 * Uses @giphy/react-native-sdk for native dialog (GIPHY Text, Stickers, Clips)
 * and falls back to REST API for programmatic search.
 */

const GIPHY_SDK_KEY = process.env.EXPO_PUBLIC_GIPHY_API_KEY || '';
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

// ── Types ──
export interface GiphyMediaItem {
  id: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
  title: string;
  type: 'gif' | 'sticker' | 'text' | 'clip' | 'emoji';
  isDynamic?: boolean;
}

export type GiphyContentType = 'gifs' | 'stickers' | 'text' | 'clips' | 'emoji';
export type GiphyRating = 'g' | 'pg' | 'pg-13' | 'r';

interface SearchOptions {
  query: string;
  type?: GiphyContentType;
  limit?: number;
  offset?: number;
  rating?: GiphyRating;
}

// ── SDK initialization ──
let sdkInitialized = false;
let sdkAvailable = false;

/**
 * Initialize GIPHY SDK — call once at app startup (e.g., in _layout.tsx).
 * Safe to call even if SDK is not installed.
 */
export function initGiphy(): void {
  if (sdkInitialized) return;
  if (!GIPHY_SDK_KEY) return;
  try {
    const { GiphySDK } = require('@giphy/react-native-sdk');
    GiphySDK.configure({ apiKey: GIPHY_SDK_KEY });
    sdkAvailable = true;
    sdkInitialized = true;
  } catch {
    // SDK not available (e.g., running in Expo Go) — API-only mode
    sdkInitialized = true;
    sdkAvailable = false;
  }
}

export function isSDKAvailable(): boolean {
  return sdkAvailable;
}

/**
 * Show the native GIPHY Dialog picker.
 * Returns cleanup function for the onMediaSelect listener.
 * Falls back silently if SDK is not available.
 */
export function showGiphyPicker(options: {
  mediaTypes?: Array<'gif' | 'sticker' | 'text' | 'clip' | 'emoji'>;
  onSelect: (media: GiphyMediaItem) => void;
}): (() => void) | null {
  if (!sdkAvailable) return null;

  try {
    const { GiphyDialog, GiphyMediaType, GiphyRating: SDKRating, GiphyThemePreset } = require('@giphy/react-native-sdk');

    const mediaTypeMap: Record<string, unknown> = {
      gif: GiphyMediaType.Gif,
      sticker: GiphyMediaType.Sticker,
      text: GiphyMediaType.Text,
      emoji: GiphyMediaType.Emoji,
    };

    GiphyDialog.configure({
      mediaTypeConfig: (options.mediaTypes || ['gif', 'sticker', 'text', 'emoji']).map(
        (t: string) => mediaTypeMap[t] || GiphyMediaType.Gif
      ),
      rating: SDKRating.PG13,
      showConfirmationScreen: false,
      theme: GiphyThemePreset.Dark,
    });

    // Listen for selection
    const listener = GiphyDialog.addListener('onMediaSelect', (e: { media: { id: string; url?: string; aspectRatio?: number; isDynamic?: boolean } }) => {
      const media = e.media;
      options.onSelect({
        id: media.id,
        url: media.url || '',
        previewUrl: media.url || '',
        width: media.aspectRatio ? Math.round(media.aspectRatio * 200) : 200,
        height: 200,
        title: '',
        type: media.isDynamic ? 'text' : 'gif',
        isDynamic: media.isDynamic,
      });
    });

    GiphyDialog.show();

    return () => listener.remove();
  } catch {
    return null;
  }
}

// ── REST API fallback (proxied through backend — API key stays server-side) ──

async function apiSearch(options: SearchOptions): Promise<GiphyMediaItem[]> {
  const { query, type = 'gifs', limit = 20, offset = 0, rating = 'pg' } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const isSearch = query && query !== 'trending';
    const endpoint = isSearch
      ? `${API_URL}/giphy/search?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&rating=${rating}`
      : `${API_URL}/giphy/trending?limit=${limit}&offset=${offset}&rating=${rating}`;

    const res = await fetch(endpoint, { signal: controller.signal });
    if (!res.ok) return [];

    const json = await res.json();
    return parseGiphyResponse(json.data || [], type);
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseGiphyResponse(data: Array<Record<string, unknown>>, type: GiphyContentType): GiphyMediaItem[] {
  return data.map(item => {
    const images = item.images as Record<string, Record<string, string>> | undefined;
    const original = images?.original || {};
    const preview = images?.fixed_width || images?.preview_gif || original;

    return {
      id: String(item.id || ''),
      url: original.url || '',
      previewUrl: preview.url || original.url || '',
      width: parseInt(original.width || '200', 10),
      height: parseInt(original.height || '200', 10),
      title: String(item.title || ''),
      type: type === 'clips' ? 'clip' : type === 'text' ? 'text' : type === 'stickers' ? 'sticker' : type === 'emoji' ? 'emoji' : 'gif',
      isDynamic: false,
    };
  });
}

// ── Public API ──

export async function searchGiphy(options: SearchOptions): Promise<GiphyMediaItem[]> {
  return apiSearch(options);
}

export async function getTrending(type: GiphyContentType = 'gifs', limit: number = 20): Promise<GiphyMediaItem[]> {
  return apiSearch({ query: '', type, limit });
}

export async function searchStickers(query: string, limit: number = 20): Promise<GiphyMediaItem[]> {
  return searchGiphy({ query, type: 'stickers', limit });
}

export async function searchText(query: string, limit: number = 20): Promise<GiphyMediaItem[]> {
  if (sdkAvailable) {
    return searchGiphy({ query, type: 'text', limit });
  }
  return searchGiphy({ query: `text ${query}`, type: 'stickers', limit });
}

/**
 * Categories for browsing.
 */
export const GIPHY_CATEGORIES = [
  { id: 'trending', searchTerm: '', labelKey: 'stories.gifCategoryTrending' },
  { id: 'reactions', searchTerm: 'reactions', labelKey: 'stories.gifCategoryReactions' },
  { id: 'love', searchTerm: 'love', labelKey: 'stories.gifCategoryLove' },
  { id: 'happy', searchTerm: 'happy', labelKey: 'stories.gifCategoryHappy' },
  { id: 'sad', searchTerm: 'sad', labelKey: 'stories.gifCategorySad' },
  { id: 'celebrate', searchTerm: 'celebrate eid', labelKey: 'stories.gifCategoryCelebrate' },
  { id: 'islamic', searchTerm: 'muslim islamic ramadan', labelKey: 'stories.gifCategoryIslamic' },
  { id: 'funny', searchTerm: 'funny', labelKey: 'stories.gifCategoryFunny' },
] as const;
