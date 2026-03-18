/**
 * Lightweight performance monitoring for mobile.
 *
 * Tracks:
 * - Screen render times
 * - API call durations
 * - App startup time
 *
 * Reports via Sentry transactions when available,
 * otherwise logs to console in dev mode.
 */

import { captureException } from '@/config/sentry';

interface PerfMark {
  name: string;
  startTime: number;
}

const activeMarks = new Map<string, PerfMark>();
const metrics: Record<string, number[]> = {};

/**
 * Start timing a named operation.
 */
export function perfStart(name: string): void {
  activeMarks.set(name, { name, startTime: Date.now() });
}

/**
 * End timing and record the duration.
 * Returns duration in ms.
 */
export function perfEnd(name: string): number {
  const mark = activeMarks.get(name);
  if (!mark) return 0;

  const duration = Date.now() - mark.startTime;
  activeMarks.delete(name);

  // Store for aggregation
  if (!metrics[name]) metrics[name] = [];
  metrics[name].push(duration);

  // Keep only last 50 measurements per metric
  if (metrics[name].length > 50) metrics[name].shift();

  // Log slow operations in dev
  if (__DEV__ && duration > 1000) {
    console.warn(`[Perf] Slow operation: ${name} took ${duration}ms`);
  }

  // Report very slow operations to Sentry
  if (duration > 5000) {
    captureException(new Error(`Slow operation: ${name}`), {
      duration,
      name,
    });
  }

  return duration;
}

/**
 * Get average duration for a named metric.
 */
export function perfAverage(name: string): number {
  const values = metrics[name];
  if (!values || values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Get all performance metrics (for debug screens or analytics).
 */
export function perfGetAll(): Record<string, { avg: number; count: number; p95: number }> {
  const result: Record<string, { avg: number; count: number; p95: number }> = {};
  for (const [name, values] of Object.entries(metrics)) {
    if (values.length === 0) continue;
    const sorted = [...values].sort((a, b) => a - b);
    const avg = Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1];
    result[name] = { avg, count: sorted.length, p95 };
  }
  return result;
}

/**
 * Hook-friendly wrapper: call perfStart on mount, perfEnd on data load.
 * Usage: usePerf('screen:feed', isLoading);
 */
export function usePerfTracking(name: string, isLoading: boolean): void {
  // This is a simple state machine:
  // When isLoading becomes true → start timing
  // When isLoading becomes false → end timing
  if (isLoading && !activeMarks.has(name)) {
    perfStart(name);
  } else if (!isLoading && activeMarks.has(name)) {
    perfEnd(name);
  }
}
