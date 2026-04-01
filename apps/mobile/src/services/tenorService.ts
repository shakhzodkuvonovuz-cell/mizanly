/**
 * Tenor GIF API service.
 * Centralizes API key access and fetch logic (was inline in conversation screen).
 */

export interface TenorGifResult {
  id: string;
  media_formats: { gif: { url: string } };
}

const TENOR_API_KEY = process.env.EXPO_PUBLIC_TENOR_API_KEY || '';

export async function searchTenorGifs(query: string, limit = 30): Promise<TenorGifResult[]> {
  if (!TENOR_API_KEY) return [];
  const url = `https://tenor.googleapis.com/v2/search?key=${TENOR_API_KEY}&q=${encodeURIComponent(query)}&limit=${limit}`;
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    return data.results || [];
  } catch {
    return [];
  }
}

export async function getTenorFeatured(limit = 30): Promise<TenorGifResult[]> {
  if (!TENOR_API_KEY) return [];
  const url = `https://tenor.googleapis.com/v2/featured?key=${TENOR_API_KEY}&limit=${limit}`;
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    return data.results || [];
  } catch {
    return [];
  }
}
