import { Injectable, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import { createHash } from 'crypto';
import { TARGET_THROTTLE_KEY } from '../decorators/target-throttle.decorator';

/**
 * Custom throttler guard that uses userId (from Clerk auth) when available,
 * falling back to IP address for unauthenticated requests.
 *
 * This prevents authenticated users on shared IPs from being throttled by
 * each other's requests, and ensures per-user fair limits.
 *
 * #122 FIX: When `@TargetThrottle('paramName')` is present on the handler,
 * the throttle key is composed from both actor AND target — preventing a
 * single user from spam-following a specific user or spam-liking a specific post.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(UserThrottlerGuard.name);

  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Base key: authenticated userId or IP fallback
    const baseKey = this.getBaseKey(req);

    // #122: Per-target throttle — check if request params contain a target ID
    // The @TargetThrottle decorator stores the param name on the route metadata,
    // but getTracker doesn't receive ExecutionContext. Instead, check req.params
    // for common target patterns (userId, postId, etc.) set by the decorator.
    const targetId = (req as { _throttleTargetId?: string })._throttleTargetId;
    if (targetId) {
      return `${baseKey}:target:${targetId}`;
    }

    return baseKey;
  }

  /** Retrieve reflector from DI container via the module ref stored on ThrottlerGuard */
  private getReflector(): Reflector | null {
    // ThrottlerGuard stores reflector as a private field; access via any
    const self = this as Record<string, unknown>;
    if (self['reflector'] instanceof Reflector) {
      return self['reflector'] as Reflector;
    }
    return null;
  }

  private getBaseKey(req: Record<string, unknown>): string {
    // If the request has been authenticated and has a userId, use it
    const user = (req as { user?: { id?: string } }).user;
    if (user?.id) {
      return `user:${user.id}`;
    }
    // Fall back to IP for unauthenticated requests
    // Use forwarded IP header if behind proxy, then direct IP
    const forwarded = (req as { headers?: Record<string, string> }).headers?.['x-forwarded-for'];
    const ip = forwarded?.split(',')[0]?.trim() || (req as { ip?: string }).ip;
    if (ip) {
      return `ip:${ip}`;
    }

    // No IP available — derive a fingerprint from request headers to avoid
    // all unknown-source requests sharing a single throttle bucket
    const headers = (req as { headers?: Record<string, string> }).headers || {};
    const fingerprint = `${headers['user-agent'] || ''}|${headers['accept-language'] || ''}|${headers['accept-encoding'] || ''}`;
    const hash = createHash('md5').update(fingerprint).digest('hex');
    this.logger.warn(`No IP or user for rate limiting — using header fingerprint: ${hash.slice(0, 8)}`);
    return `fingerprint:${hash}`;
  }

  /**
   * Finding #369: Rate limit headers on 429 responses.
   * Note: @nestjs/throttler v5 doesn't expose remaining count in non-throttled requests.
   * Headers are only sent on 429 (throttled) responses. For full per-request headers,
   * would need a custom interceptor reading the throttler storage directly.
   */
  protected throwThrottlingException(context: ExecutionContext): Promise<void> {
    const response = context.switchToHttp().getResponse();
    response.header('X-RateLimit-Remaining', '0');
    response.header('X-RateLimit-Reset', String(Math.ceil(Date.now() / 1000) + 60));
    response.header('Retry-After', '60');
    throw new ThrottlerException('Too many requests — please slow down');
  }
}
