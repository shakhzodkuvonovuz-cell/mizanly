/**
 * ImageLightbox — re-export of ImageGallery.
 *
 * These were historically two separate components with 85% duplicate code.
 * ImageGallery is the canonical implementation (pinch-to-zoom, swipe-to-dismiss,
 * image counter, share). ImageLightbox is kept as an alias so existing imports
 * (e.g. conversation-media.tsx) continue to work without a codebase-wide rename.
 */
export { ImageGallery as ImageLightbox } from './ImageGallery';
export type { ImageGalleryProps as ImageLightboxProps } from './ImageGallery';
