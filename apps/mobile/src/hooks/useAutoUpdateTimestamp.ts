import { useState, useEffect, useRef } from 'react';

/**
 * Finding #352: Timestamps auto-update in real-time.
 * "just now" → "1m" → "2m" → ... without requiring pull-to-refresh.
 *
 * Returns a formatted relative time string that auto-refreshes.
 * Update interval adjusts based on age:
 * - < 1 min: every 10 seconds
 * - < 1 hour: every 60 seconds
 * - < 24 hours: every 5 minutes
 * - > 24 hours: no updates (static date)
 */
export function useAutoUpdateTimestamp(date: string | Date | null | undefined): string {
  const [, setTick] = useState(0);
  const dateRef = useRef(date);
  dateRef.current = date;

  useEffect(() => {
    if (!date) return;

    const getInterval = () => {
      const ageMs = Date.now() - new Date(dateRef.current as string | Date).getTime();
      if (ageMs < 60_000) return 10_000; // < 1 min: refresh every 10s
      if (ageMs < 3_600_000) return 60_000; // < 1 hour: every minute
      if (ageMs < 86_400_000) return 300_000; // < 24 hours: every 5 min
      return 0; // > 24 hours: no refresh
    };

    const interval = getInterval();
    if (interval === 0) return;

    const timer = setInterval(() => {
      setTick(t => t + 1);
    }, interval);

    return () => clearInterval(timer);
  }, [date]);

  if (!date) return '';
  return formatRelativeTime(new Date(date));
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();

  if (diffMs < 0) return 'just now';
  if (diffMs < 10_000) return 'just now';
  if (diffMs < 60_000) return `${Math.floor(diffMs / 1000)}s`;
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h`;
  if (diffMs < 604_800_000) return `${Math.floor(diffMs / 86_400_000)}d`;
  if (diffMs < 2_592_000_000) return `${Math.floor(diffMs / 604_800_000)}w`;

  // Older than a month — show date
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
