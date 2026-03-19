import { useEffect, useRef, useCallback } from 'react';

/**
 * Dev-only FPS monitor hook.
 * Detects jank (frames below threshold) and logs to console.
 * No-op in production builds.
 */
export function useFpsMonitor(options?: { threshold?: number; logInterval?: number }) {
  const { threshold = 30, logInterval = 5000 } = options || {};
  const frameCount = useRef(0);
  const jankCount = useRef(0);
  const lastTime = useRef(performance.now());
  const lastLogTime = useRef(performance.now());
  const rafId = useRef<number>(0);

  const tick = useCallback(() => {
    const now = performance.now();
    const delta = now - lastTime.current;
    lastTime.current = now;

    frameCount.current++;

    // Detect jank: frame took more than expected (> 1000/threshold ms)
    const maxFrameTime = 1000 / threshold;
    if (delta > maxFrameTime) {
      jankCount.current++;
    }

    // Log every logInterval ms
    if (now - lastLogTime.current > logInterval) {
      const elapsed = now - lastLogTime.current;
      const fps = Math.round((frameCount.current / elapsed) * 1000);
      if (jankCount.current > 0 || fps < 50) {
        console.log(
          `[FPS Monitor] ${fps} fps | ${jankCount.current} janky frames in last ${Math.round(elapsed / 1000)}s`,
        );
      }
      frameCount.current = 0;
      jankCount.current = 0;
      lastLogTime.current = now;
    }

    rafId.current = requestAnimationFrame(tick);
  }, [threshold, logInterval]);

  useEffect(() => {
    if (__DEV__) {
      rafId.current = requestAnimationFrame(tick);
      return () => {
        if (rafId.current) cancelAnimationFrame(rafId.current);
      };
    }
  }, [tick]);
}
