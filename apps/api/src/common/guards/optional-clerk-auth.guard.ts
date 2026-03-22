import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { verifyToken } from '@clerk/backend';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';

/**
 * Like ClerkAuthGuard but never throws — simply attaches `request.user`
 * if a valid Bearer token is present. Useful for public endpoints that
 * return extra data (isFollowing, userReaction, etc.) when the caller
 * happens to be authenticated.
 */
@Injectable()
export class OptionalClerkAuthGuard implements CanActivate {
  private readonly logger = new Logger(OptionalClerkAuthGuard.name);

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    if (!token) return true; // no token → still allowed, just no user

    try {
      const { sub: clerkId } = await verifyToken(token, {
        secretKey: this.config.get('CLERK_SECRET_KEY'),
      });
      const user = await this.prisma.user.findUnique({
        where: { clerkId },
        select: {
          id: true,
          clerkId: true,
          username: true,
          displayName: true,
          isBanned: true,
          isDeactivated: true,
          isDeleted: true,
        },
      });
      // Don't attach banned/deactivated/deleted users
      if (user && !user.isBanned && !user.isDeactivated && !user.isDeleted) {
        request.user = user;
      }
    } catch (err: unknown) {
      // Invalid token → ignore, treat as unauthenticated
      // Log warning for expired tokens — helps debug client-side token refresh issues
      if (err instanceof Error && err.message?.includes('expired')) {
        this.logger.warn('Expired token on optional route — client should refresh JWT');
      }
    }

    return true;
  }

  private extractToken(request: { headers: { authorization?: string } }): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
