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
        banExpiresAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.isBanned) {
      // Auto-unban if temp ban has expired
      if (user.banExpiresAt && user.banExpiresAt < new Date()) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { isBanned: false, banExpiresAt: null },
        });
      } else {
        throw new ForbiddenException('Account has been banned');
      }
    }

    if (user.isDeactivated || user.isDeleted) {
      throw new ForbiddenException('Account has been deactivated');
    }

    request.user = user;
    return true;
  }

  private extractToken(request: { headers: { authorization?: string } }): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
