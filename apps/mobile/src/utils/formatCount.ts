/**
 * Format large numbers for social media display.
 * Instagram/TikTok style: 999 → "999", 1200 → "1.2K", 15000 → "15K", 1500000 → "1.5M"
 *
 * Rules:
 * - Under 1000: show raw number
 * - 1000-999999: divide by 1000, one decimal, "K" suffix (drop .0)
 * - 1000000+: divide by 1000000, one decimal, "M" suffix (drop .0)
 * - Negative numbers: return "0"
 * - NaN/undefined: return "0"
 */
export function formatCount(n: number | undefined | null): string {
  if (n == null || isNaN(n) || n < 0) return '0';
  if (n < 1_000) return n.toString();
  if (n < 1_000_000) {
    const val = (n / 1_000).toFixed(1);
    return val.endsWith('.0') ? val.slice(0, -2) + 'K' : val + 'K';
  }
  const val = (n / 1_000_000).toFixed(1);
  return val.endsWith('.0') ? val.slice(0, -2) + 'M' : val + 'M';
}
