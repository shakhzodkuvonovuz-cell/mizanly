import { Injectable, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import { createClerkClient } from '@clerk/backend';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  private clerk;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.clerk = createClerkClient({
      secretKey: this.config.get('CLERK_SECRET_KEY'),
    });
  }

  async register(clerkId: string, dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ clerkId }, { username: dto.username }] },
    });
    if (existing) throw new ConflictException('User already exists');

    return this.prisma.user.create({
      data: {
        clerkId,
        username: dto.username.toLowerCase(),
        displayName: dto.displayName,
        bio: dto.bio,
        avatarUrl: dto.avatarUrl,
        language: dto.language || 'en',
      },
    });
  }

  async checkUsername(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username: username.toLowerCase() },
    });
    return { available: !user };
  }
}
