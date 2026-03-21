/**
 * Image optimization utilities for Cloudflare Image Resizing.
 *
 * Cloudflare transforms images on the CDN edge via URL parameters:
 * https://developers.cloudflare.com/images/image-resizing/url-format/
 *
 * Original: https://media.mizanly.app/posts/user123/abc.jpg
 * Resized:  https://media.mizanly.app/cdn-cgi/image/width=400,quality=80,format=webp/posts/user123/abc.jpg
 */

export interface ImageTransformOptions {
  width?: number;
  height?: number;
  quality?: number; // 1-100, default 80
  format?: 'webp' | 'avif' | 'auto'; // auto = best format for browser
  fit?: 'cover' | 'contain' | 'scale-down' | 'crop';
  gravity?: 'auto' | 'center' | 'top' | 'bottom' | 'left' | 'right';
}

/** Standard image presets used across the app */
export const IMAGE_PRESETS = {
  /** Avatar sizes */
  avatarSm: { width: 64, height: 64, quality: 80, fit: 'cover', format: 'webp' } as ImageTransformOptions,
  avatarMd: { width: 128, height: 128, quality: 80, fit: 'cover', format: 'webp' } as ImageTransformOptions,
  avatarLg: { width: 256, height: 256, quality: 80, fit: 'cover', format: 'webp' } as ImageTransformOptions,

  /** Post/feed images */
  thumbnail: { width: 200, height: 200, quality: 60, fit: 'cover', format: 'webp' } as ImageTransformOptions,
  feedCard: { width: 600, quality: 80, format: 'webp' } as ImageTransformOptions,
  feedFull: { width: 1200, quality: 85, format: 'webp' } as ImageTransformOptions,

  /** Covers/banners */
  coverSm: { width: 640, height: 200, quality: 75, fit: 'cover', format: 'webp' } as ImageTransformOptions,
  coverLg: { width: 1280, height: 400, quality: 80, fit: 'cover', format: 'webp' } as ImageTransformOptions,

  /** Video thumbnails */
  videoThumb: { width: 320, height: 180, quality: 70, fit: 'cover', format: 'webp' } as ImageTransformOptions,
  videoThumbLg: { width: 640, height: 360, quality: 80, fit: 'cover', format: 'webp' } as ImageTransformOptions,

  /** Blur placeholder (tiny for inline base64) */
  blurPlaceholder: { width: 20, quality: 20, format: 'webp' } as ImageTransformOptions,
} as const;

/**
 * Generate a Cloudflare Image Resizing URL.
 *
 * @param originalUrl The original R2 public URL
 * @param options Transform options
 * @returns Transformed URL with CDN parameters
 */
export function getImageUrl(originalUrl: string, options: ImageTransformOptions): string {
  if (!originalUrl) return '';

  // Don't transform non-image URLs or already-transformed URLs
  if (!isImageUrl(originalUrl) || originalUrl.includes('/cdn-cgi/image/')) {
    return originalUrl;
  }

  const params: string[] = [];
  if (options.width) params.push(`width=${options.width}`);
  if (options.height) params.push(`height=${options.height}`);
  if (options.quality) params.push(`quality=${options.quality}`);
  if (options.format) params.push(`format=${options.format}`);
  if (options.fit) params.push(`fit=${options.fit}`);
  if (options.gravity) params.push(`gravity=${options.gravity}`);

  if (params.length === 0) return originalUrl;

  // Insert /cdn-cgi/image/params/ after the domain
  try {
    const url = new URL(originalUrl);
    return `${url.origin}/cdn-cgi/image/${params.join(',')}${url.pathname}`;
  } catch {
    return originalUrl;
  }
}

/**
 * Generate a set of responsive image URLs for srcset-style usage.
 */
export function getResponsiveImageUrls(originalUrl: string): {
  thumbnail: string;
  small: string;
  medium: string;
  large: string;
  original: string;
} {
  // Only generate CDN variants if Cloudflare Image Resizing is available
  // (requires paid plan on the serving domain). Fall back to original URL.
  const cfEnabled = process.env.CF_IMAGE_RESIZING_ENABLED === 'true';
  if (!cfEnabled) {
    return { thumbnail: originalUrl, small: originalUrl, medium: originalUrl, large: originalUrl, original: originalUrl };
  }
  return {
    thumbnail: getImageUrl(originalUrl, IMAGE_PRESETS.thumbnail),
    small: getImageUrl(originalUrl, { width: 400, quality: 80, format: 'webp' }),
    medium: getImageUrl(originalUrl, IMAGE_PRESETS.feedCard),
    large: getImageUrl(originalUrl, IMAGE_PRESETS.feedFull),
    original: originalUrl,
  };
}

function isImageUrl(url: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'];
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return imageExtensions.some(ext => pathname.endsWith(ext));
  } catch {
    const lower = url.toLowerCase();
    return imageExtensions.some(ext => lower.endsWith(ext));
  }
}
