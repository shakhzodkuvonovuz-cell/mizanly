import { useRef, useCallback } from 'react';
import { Video } from 'expo-av';

/**
 * Hook for preloading next N videos in a reel feed.
 * Manages a cache of loaded video URIs to avoid re-downloads.
 */
export function useVideoPreload(preloadCount = 2) {
  const preloadedUrls = useRef<Set<string>>(new Set());
  const preloadRefs = useRef<Video[]>([]);

  const preloadVideos = useCallback(
    (currentIndex: number, urls: string[]) => {
      // Preload next `preloadCount` videos
      for (let i = 1; i <= preloadCount; i++) {
        const nextIndex = currentIndex + i;
        if (nextIndex >= urls.length) break;
        const url = urls[nextIndex];
        if (!url || preloadedUrls.current.has(url)) continue;

        // Use expo-av's loadAsync pattern — create a temporary Audio/Video object
        // to trigger network fetch and cache the content
        preloadedUrls.current.add(url);

        // Fetch just the first chunk to prime the CDN cache & device network cache
        fetch(url, {
          method: 'GET',
          headers: { Range: 'bytes=0-65535' }, // First 64KB for metadata
        }).catch(() => {
          // Best effort — don't block on failure
          preloadedUrls.current.delete(url);
        });
      }

      // Evict old preloads to keep memory bounded
      if (preloadedUrls.current.size > 20) {
        const entries = [...preloadedUrls.current];
        entries.slice(0, entries.length - 20).forEach(url =>
          preloadedUrls.current.delete(url),
        );
      }
    },
    [preloadCount],
  );

  const clearPreloads = useCallback(() => {
    preloadedUrls.current.clear();
    preloadRefs.current = [];
  }, []);

  return { preloadVideos, clearPreloads };
}
