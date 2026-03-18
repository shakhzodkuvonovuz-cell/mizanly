import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Custom throttler guard that uses userId (from Clerk auth) when available,
 * falling back to IP address for unauthenticated requests.
 *
 * This prevents authenticated users on shared IPs from being throttled by
 * each other's requests, and ensures per-user fair limits.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    // If the request has been authenticated and has a userId, use it
    const user = (req as { user?: { id?: string } }).user;
    if (user?.id) {
      return `user:${user.id}`;
    }
    // Fall back to IP for unauthenticated requests
    return (req as { ip?: string }).ip ?? 'unknown';
  }
}
