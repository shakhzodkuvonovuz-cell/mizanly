/**
 * GIPHY Service — Unified interface for GIF/Sticker/Text/Clip operations.
 *
 * Two modes:
 * 1. API mode (current) — uses GIPHY REST API directly via fetch
 * 2. SDK mode (when installed) — uses @giphy/react-native-sdk for native performance,
 *    GIPHY Text, Clips, Stickers, and optimized caching
 *
 * The service auto-detects which mode to use based on SDK availability.
 */

const GIPHY_API_KEY = process.env.EXPO_PUBLIC_GIPHY_API_KEY || '';
const GIPHY_BASE = 'https://api.giphy.com/v1';

// ── SDK integration (@giphy/react-native-sdk is now installed) ──
import { GiphySDK, GiphyDialog, GiphyDialogMediaSelectEventHandler, GiphyMedia, GiphyMediaType, GiphyContentType as SDKContentType, GiphyRating as SDKRating, GiphyThemePreset } from '@giphy/react-native-sdk';

let sdkInitialized = false;

/**
 * Initialize GIPHY SDK — call once at app startup (e.g., in _layout.tsx).
 */
export function initGiphy(): void {
  if (sdkInitialized || !GIPHY_API_KEY) return;
  GiphySDK.configure({ apiKey: GIPHY_API_KEY });
  sdkInitialized = true;
}

export function isSDKAvailable(): boolean {
  return true; // SDK is installed
}

/**
 * Show the native GIPHY Dialog picker.
 * Provides search, trending, GIPHY Text, Stickers, Clips, Emoji.
 * Themed to dark mode.
 */
export function showGiphyPicker(options?: {
  mediaTypes?: Array<'gif' | 'sticker' | 'text' | 'clip' | 'emoji'>;
  onSelect?: (media: GiphyMediaItem) => void;
}): void {
  if (!sdkInitialized) initGiphy();

  // Configure dialog
  GiphyDialog.configure({
    mediaTypeConfig: (options?.mediaTypes || ['gif', 'sticker', 'text', 'emoji']).map(t => {
      switch (t) {
        case 'gif': return GiphyMediaType.Gif;
        case 'sticker': return GiphyMediaType.Sticker;
        case 'text': return GiphyMediaType.Text;
        case 'emoji': return GiphyMediaType.Emoji;
        default: return GiphyMediaType.Gif;
      }
    }),
    rating: SDKRating.PG13,
    showConfirmationScreen: false,
    theme: GiphyThemePreset.Dark,
  });

  GiphyDialog.show();
}

/**
 * Listen for media selection from GiphyDialog.
 * Returns cleanup function.
 */
export function onGiphyMediaSelect(callback: (item: GiphyMediaItem) => void): () => void {
  const handler: GiphyDialogMediaSelectEventHandler = (e) => {
    const media = e.media;
    callback({
      id: media.id,
      url: media.url || '',
      previewUrl: media.url || '',
      width: media.aspectRatio ? Math.round(media.aspectRatio * 200) : 200,
      height: 200,
      title: '',
      type: media.isDynamic ? 'text' : 'gif',
      isDynamic: media.isDynamic,
    });
  };
  const listener = GiphyDialog.addListener('onMediaSelect', handler);
  return () => listener.remove();
}

export function isSDKAvailable(): boolean {
  return giphySdkAvailable;
}

// ── Types ──
export interface GiphyMediaItem {
  id: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
  title: string;
  type: 'gif' | 'sticker' | 'text' | 'clip' | 'emoji';
  isDynamic?: boolean; // GIPHY Text items
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

// ── API mode: Search ──
async function apiSearch(options: SearchOptions): Promise<GiphyMediaItem[]> {
  if (!GIPHY_API_KEY) return [];

  const { query, type = 'gifs', limit = 20, offset = 0, rating = 'pg' } = options;
  const contentPath = type === 'text' ? 'stickers' : type === 'emoji' ? 'emoji' : type;

  try {
    const isSearch = query && query !== 'trending';
    const endpoint = isSearch
      ? `${GIPHY_BASE}/${contentPath}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&rating=${rating}`
      : `${GIPHY_BASE}/${contentPath}/trending?api_key=${GIPHY_API_KEY}&limit=${limit}&offset=${offset}&rating=${rating}`;

    const res = await fetch(endpoint);
    if (!res.ok) return [];

    const json = await res.json();
    return parseGiphyResponse(json.data || [], type);
  } catch {
    return [];
  }
}

// ── API mode: Trending ──
async function apiTrending(type: GiphyContentType = 'gifs', limit: number = 20): Promise<GiphyMediaItem[]> {
  return apiSearch({ query: '', type, limit });
}

// ── Parse GIPHY API response into our unified type ──
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

/**
 * Search GIPHY for content.
 * Uses SDK when available (native caching, GIPHY Text support).
 * Falls back to REST API.
 */
export async function searchGiphy(options: SearchOptions): Promise<GiphyMediaItem[]> {
  // SDK mode would use GiphyContent.search() here
  // For now, always use API mode
  return apiSearch(options);
}

/**
 * Get trending content from GIPHY.
 */
export async function getTrending(type: GiphyContentType = 'gifs', limit: number = 20): Promise<GiphyMediaItem[]> {
  return apiTrending(type, limit);
}

/**
 * Search specifically for stickers (transparent animated overlays).
 */
export async function searchStickers(query: string, limit: number = 20): Promise<GiphyMediaItem[]> {
  return searchGiphy({ query, type: 'stickers', limit });
}

/**
 * Search specifically for GIPHY Text (animated text stickers).
 * SDK-exclusive in full form. API mode returns sticker results as fallback.
 */
export async function searchText(query: string, limit: number = 20): Promise<GiphyMediaItem[]> {
  if (giphySdkAvailable) {
    // SDK: Use GiphyContent.animate() for true animated text
    // This generates server-rendered animated text from user input
    return searchGiphy({ query, type: 'text', limit });
  }
  // Fallback: search stickers with text-related terms
  return searchGiphy({ query: `text ${query}`, type: 'stickers', limit });
}

/**
 * Get categories for browsing.
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
