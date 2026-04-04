import { SetMetadata, applyDecorators } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

/**
 * Metadata key for target-throttle configuration.
 * Stores the route param name that holds the target entity ID.
 */
export const TARGET_THROTTLE_KEY = 'TARGET_THROTTLE_PARAM';

/**
 * Per-target throttle decorator.
 *
 * Throttles requests per (actor, target) pair -- e.g., a single user
 * can only follow the same target 5 times per minute, or like the
 * same post 5 times per minute. This prevents abuse like follow-spam
 * on a specific user or like-bombing a specific post.
 *
 * The actor is the authenticated user (from Clerk JWT).
 * The target is extracted from a route parameter by name.
 *
 * Works with the global UserThrottlerGuard which checks for this metadata
 * and composes the throttle key from both actor + target when present.
 *
 * @param targetParam - Route param name (e.g. 'userId', 'id', 'commentId')
 * @param limit - Max requests per TTL window (default: 5)
 * @param ttl - Time window in milliseconds (default: 60000 = 1 minute)
 *
 * @example
 * ```ts
 * @TargetThrottle('userId', 5, 60000)
 * @Post(':userId')
 * follow(@CurrentUser('id') actorId: string, @Param('userId') targetId: string) {}
 * ```
 */
export function TargetThrottle(targetParam: string, limit = 5, ttl = 60000) {
  return applyDecorators(
    SetMetadata(TARGET_THROTTLE_KEY, targetParam),
    Throttle({ default: { limit, ttl } }),
  );
}
