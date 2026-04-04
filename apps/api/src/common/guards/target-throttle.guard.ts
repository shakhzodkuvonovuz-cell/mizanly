/**
 * Target throttle functionality is integrated into UserThrottlerGuard.
 *
 * The @TargetThrottle decorator sets metadata via TARGET_THROTTLE_KEY,
 * and UserThrottlerGuard (the global APP_GUARD) reads this metadata
 * to compose per-(actor, target) throttle keys.
 *
 * This file is kept for the export used in tests. No separate guard needed.
 */
export { UserThrottlerGuard as TargetThrottleGuard } from './user-throttler.guard';
