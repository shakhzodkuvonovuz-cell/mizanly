/**
 * Image optimization utilities for the mobile app.
 * Uses Cloudflare Image Resizing via URL parameters.
 */

interface ImageOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'avif' | 'auto';
  fit?: 'cover' | 'contain' | 'scale-down' | 'crop';
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp'];

function isImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return IMAGE_EXTENSIONS.some(ext => lower.includes(ext));
}

/**
 * Get an optimized image URL via Cloudflare Image Resizing.
 * Falls back to original URL if not an image or already transformed.
 */
function optimizedImageUrl(url: string | null | undefined, options: ImageOptions = {}): string {
  if (!url) return '';
  if (!isImageUrl(url) || url.includes('/cdn-cgi/image/')) return url;

  const { width, height, quality = 80, format = 'webp', fit = 'cover' } = options;
  const params: string[] = [`quality=${quality}`, `format=${format}`, `fit=${fit}`];
  if (width) params.push(`width=${width}`);
  if (height) params.push(`height=${height}`);

  try {
    const parsed = new URL(url);
    return `${parsed.origin}/cdn-cgi/image/${params.join(',')}${parsed.pathname}`;
  } catch {
    return url;
  }
}

/** Standard presets for common use cases */
export const imagePresets = {
  avatar: (url: string | null | undefined, size: 'sm' | 'md' | 'lg' = 'md') => {
    const dims = { sm: 64, md: 128, lg: 256 };
    const d = dims[size];
    return optimizedImageUrl(url, { width: d, height: d });
  },

  thumbnail: (url: string | null | undefined) =>
    optimizedImageUrl(url, { width: 200, height: 200, quality: 60 }),

  feedImage: (url: string | null | undefined) =>
    optimizedImageUrl(url, { width: 600, quality: 80 }),

  fullImage: (url: string | null | undefined) =>
    optimizedImageUrl(url, { width: 1200, quality: 85 }),

  cover: (url: string | null | undefined) =>
    optimizedImageUrl(url, { width: 1280, height: 400 }),

  videoThumb: (url: string | null | undefined) =>
    optimizedImageUrl(url, { width: 640, height: 360, quality: 75 }),
};
