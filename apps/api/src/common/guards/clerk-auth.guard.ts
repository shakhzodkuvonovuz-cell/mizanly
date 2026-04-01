import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { verifyToken } from '@clerk/backend';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('No authorization token provided');
    }

    let clerkId: string;
    try {
      const payload = await verifyToken(token, {
        secretKey: this.config.get('CLERK_SECRET_KEY'),
      });
      clerkId = payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    // X04-#2: Also fetch scheduledDeletionAt so users with pending deletion can cancel
    let user = await this.prisma.user.findUnique({
      where: { clerkId },
      select: {
        id: true,
        clerkId: true,
        username: true,
        displayName: true,
        isBanned: true,
        isDeactivated: true,
        isDeleted: true,
        banExpiresAt: true,
        deactivatedAt: true,
        scheduledDeletionAt: true,
      },
    });

    // Retry once after 2s if user not found — handles race condition where
    // the Clerk user.created webhook hasn't been processed yet (signup race)
    if (!user) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      user = await this.prisma.user.findUnique({
        where: { clerkId },
        select: {
          id: true, clerkId: true, username: true, displayName: true,
          isBanned: true, isDeactivated: true, isDeleted: true,
          banExpiresAt: true, deactivatedAt: true, scheduledDeletionAt: true,
        },
      });
    }

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.isBanned) {
      // Auto-unban if temp ban has expired
      if (user.banExpiresAt && user.banExpiresAt < new Date()) {
        // Preserve self-deactivation: if the user deactivated BEFORE the ban was applied,
        // do not clear isDeactivated on unban. We detect this by checking if deactivatedAt
        // is earlier than the ban start (estimated as banExpiresAt minus a reasonable window).
        // Since the schema lacks a bannedAt field, we keep isDeactivated true if it was set
        // before the ban expiry window. This is a safe conservative approach.
        const wasDeactivatedBeforeBan = user.deactivatedAt && user.banExpiresAt
          ? user.deactivatedAt < user.banExpiresAt
          : false;

        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            isBanned: false,
            banExpiresAt: null,
            // Only clear deactivation if the user wasn't self-deactivated before the ban
            ...(wasDeactivatedBeforeBan ? {} : { isDeactivated: false }),
          },
        });
        // Reflect unbanned state in request.user so downstream code sees truth
        user.isBanned = false;
        user.banExpiresAt = null;
        if (!wasDeactivatedBeforeBan) {
          user.isDeactivated = false;
        }
      } else {
        throw new ForbiddenException('Account has been banned');
      }
    }

    // X04-#2 FIX: Allow users with pending scheduled deletion to cancel.
    // They are isDeactivated=true but have a scheduledDeletionAt in the future.
    // Without this exception, users cannot cancel their own deletion (broken promise).
    if (user.isDeactivated || user.isDeleted) {
      const hasPendingDeletion = user.scheduledDeletionAt && user.scheduledDeletionAt > new Date() && !user.isDeleted;
      if (!hasPendingDeletion) {
        throw new ForbiddenException('Account has been deactivated');
      }
    }

    request.user = user;
    return true;
  }

  private extractToken(request: { headers: { authorization?: string } }): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
