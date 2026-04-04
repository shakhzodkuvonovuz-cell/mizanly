import { useRef, useCallback, useState } from 'react';

type VideoLoadState = 'idle' | 'loading' | 'ready' | 'playing' | 'error';

interface PreloadSlot {
  url: string;
  index: number;
  state: VideoLoadState;
  abortController?: AbortController;
}

/**
 * Advanced video preload manager for reel-style feeds.
 *
 * Maintains a pool of 3 video slots: previous, current, next.
 * When current video starts playing, next begins loading.
 * When user swipes to next, previous is evicted, current→previous, next→current, new next loads.
 *
 * Memory management: videos 2+ positions behind are unloaded.
 * Preloads first 256KB of each video (enough for metadata + first frames).
 */
export function useVideoPreloader(poolSize = 3) {
  const slots = useRef<Map<number, PreloadSlot>>(new Map());
  const preloadedUrls = useRef<Set<string>>(new Set());
  const [loadStates, setLoadStates] = useState<Map<string, VideoLoadState>>(new Map());

  const getLoadState = useCallback((url: string): VideoLoadState => {
    return loadStates.get(url) ?? 'idle';
  }, [loadStates]);

  const updateState = useCallback((url: string, state: VideoLoadState) => {
    setLoadStates(prev => {
      const next = new Map(prev);
      next.set(url, state);
      return next;
    });
  }, []);

  /**
   * Preload a single video URL by fetching its first chunk.
   * This primes the CDN and device cache so playback starts instantly.
   */
  const preloadSingle = useCallback(async (url: string, index: number): Promise<void> => {
    if (!url || preloadedUrls.current.has(url)) return;

    const slot: PreloadSlot = {
      url,
      index,
      state: 'loading',
      abortController: new AbortController(),
    };

    slots.current.set(index, slot);
    preloadedUrls.current.add(url);
    updateState(url, 'loading');

    try {
      // Fetch first 256KB — enough for metadata + initial frames
      await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-262143' },
        signal: slot.abortController?.signal,
      });
      slot.state = 'ready';
      updateState(url, 'ready');
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      slot.state = 'error';
      updateState(url, 'error');
      preloadedUrls.current.delete(url);
    }
  }, [updateState]);

  /**
   * Called when the viewable item changes (user swipes to a new reel).
   * Preloads adjacent videos and evicts old ones.
   */
  const onViewableChange = useCallback((currentIndex: number, urls: string[]) => {
    // Preload current + next 2
    for (let offset = 0; offset <= 2; offset++) {
      const idx = currentIndex + offset;
      if (idx < urls.length && urls[idx]) {
        preloadSingle(urls[idx], idx);
      }
    }

    // Evict slots that are 3+ positions behind current
    for (const [slotIndex, slot] of slots.current.entries()) {
      if (slotIndex < currentIndex - 2) {
        // Abort any in-progress fetch
        slot.abortController?.abort();
        preloadedUrls.current.delete(slot.url);
        slots.current.delete(slotIndex);
      }
    }

    // Keep preloaded URLs bounded at 20
    if (preloadedUrls.current.size > 20) {
      const entries = [...preloadedUrls.current];
      entries.slice(0, entries.length - 15).forEach(url => {
        preloadedUrls.current.delete(url);
      });
    }

    // Evict stale loadStates entries (J04-ML09: cap loadStates to match preloadedUrls bound)
    setLoadStates(prev => {
      if (prev.size <= 20) return prev;
      const next = new Map(prev);
      const keys = [...next.keys()];
      keys.slice(0, keys.length - 15).forEach(k => next.delete(k));
      return next;
    });
  }, [preloadSingle]);

  /**
   * Mark a video as currently playing.
   */
  const markPlaying = useCallback((url: string) => {
    updateState(url, 'playing');
  }, [updateState]);

  /**
   * Check if a video URL has been preloaded and is ready.
   */
  const isReady = useCallback((url: string): boolean => {
    return preloadedUrls.current.has(url);
  }, []);

  /**
   * Clear all preloads and reset state.
   */
  const clearAll = useCallback(() => {
    for (const slot of slots.current.values()) {
      slot.abortController?.abort();
    }
    slots.current.clear();
    preloadedUrls.current.clear();
    setLoadStates(new Map());
  }, []);

  return {
    onViewableChange,
    markPlaying,
    isReady,
    getLoadState,
    clearAll,
    // [W12-C03#12] Use loadStates.size for reactivity (loadStates is state, not ref)
    preloadCount: loadStates.size,
  };
}
