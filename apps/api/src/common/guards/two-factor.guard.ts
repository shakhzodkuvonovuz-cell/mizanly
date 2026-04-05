import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { TwoFactorService } from '../../modules/two-factor/two-factor.service';

/**
 * Guard that enforces 2FA verification on sensitive/destructive endpoints.
 *
 * Behavior:
 * 1. If user does NOT have 2FA enabled → allows through (no 2FA to verify)
 * 2. If user HAS 2FA enabled AND current session is verified → allows through
 * 3. If user HAS 2FA enabled AND current session is NOT verified → 403
 *
 * Must be used AFTER ClerkAuthGuard (needs request.user to be populated).
 * Usage: @UseGuards(ClerkAuthGuard, TwoFactorGuard)
 */
@Injectable()
export class TwoFactorGuard implements CanActivate {
  constructor(private readonly twoFactorService: TwoFactorService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.id) {
      // No user attached — ClerkAuthGuard should have run first
      throw new ForbiddenException('Authentication required before 2FA check');
    }

    const userId: string = user.id;
    const sessionId: string | undefined = user.sessionId;

    const isEnabled = await this.twoFactorService.getStatus(userId);
    if (!isEnabled) {
      // User hasn't enabled 2FA — no verification needed
      return true;
    }

    const isVerified = await this.twoFactorService.isTwoFactorVerified(userId, sessionId);
    if (!isVerified) {
      throw new ForbiddenException('2FA verification required');
    }

    return true;
  }
}
