import { Injectable, ExecutionContext, Logger } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'crypto';

/**
 * Custom throttler guard that uses userId (from Clerk auth) when available,
 * falling back to IP address for unauthenticated requests.
 *
 * This prevents authenticated users on shared IPs from being throttled by
 * each other's requests, and ensures per-user fair limits.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(UserThrottlerGuard.name);

  protected async getTracker(req: Record<string, unknown>): Promise<string> {
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
}
