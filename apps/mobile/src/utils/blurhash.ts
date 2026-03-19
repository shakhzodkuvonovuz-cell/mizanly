/**
 * Default blurhash placeholders for content types.
 * In a full implementation, blurhash strings would be computed on upload
 * and stored alongside media URLs. These defaults provide a pleasant
 * loading experience until content-specific hashes are available.
 */

// Neutral dark placeholder (matches dark theme bg)
export const DEFAULT_BLURHASH = 'L02rs+j[fQj[j[fQfQfQfQfQfQfQ';

// Content-type specific defaults
export const BLURHASH_AVATAR = 'L5PZfSi_.AyE_3t7t7R**0o#DgR4';
export const BLURHASH_POST = 'L6PZfS-;fQ-;j[fQfQfQfQfQfQfQ';
export const BLURHASH_STORY = 'L5H2EC=PM+yV0g-mq.wG9c010J}[';
export const BLURHASH_REEL = 'L02rs+j[fQj[j[fQfQfQfQfQfQfQ';

/**
 * Get appropriate placeholder for an image based on context
 */
export function getPlaceholder(type: 'avatar' | 'post' | 'story' | 'reel' | 'default' = 'default'): string {
  switch (type) {
    case 'avatar': return BLURHASH_AVATAR;
    case 'post': return BLURHASH_POST;
    case 'story': return BLURHASH_STORY;
    case 'reel': return BLURHASH_REEL;
    default: return DEFAULT_BLURHASH;
  }
}

/**
 * expo-image placeholder config for blurhash
 */
export function blurhashPlaceholder(type: 'avatar' | 'post' | 'story' | 'reel' | 'default' = 'default') {
  return {
    blurhash: getPlaceholder(type),
    transition: 300,
  };
}
