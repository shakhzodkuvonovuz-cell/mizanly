import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import * as bcrypt from 'bcrypt';
import { UpdateParentalControlDto } from './dto/parental-control.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class ParentalControlsService {
  constructor(private readonly prisma: PrismaService) {}

  async linkChild(parentUserId: string, dto: { childUserId: string; pin: string }) {
    if (parentUserId === dto.childUserId) {
      throw new BadRequestException('Cannot link yourself as a child');
    }

    // Ensure parent is not a child account
    const parent = await this.prisma.user.findUnique({
      where: { id: parentUserId },
      select: { isChildAccount: true },
    });
    if (parent?.isChildAccount) {
      throw new BadRequestException('A child account cannot be a parent');
    }

    // Ensure child exists
    const child = await this.prisma.user.findUnique({
      where: { id: dto.childUserId },
      select: { id: true, isChildAccount: true },
    });
    if (!child) {
      throw new NotFoundException('Child user not found');
    }

    // Ensure child is not already linked
    const existing = await this.prisma.parentalControl.findUnique({
      where: { childUserId: dto.childUserId },
    });
    if (existing) {
      throw new BadRequestException('This account is already linked as a child');
    }

    const hashedPin = await bcrypt.hash(dto.pin, SALT_ROUNDS);

    const [control] = await this.prisma.$transaction([
      this.prisma.parentalControl.create({
        data: {
          parentUserId,
          childUserId: dto.childUserId,
          pin: hashedPin,
        },
      }),
      this.prisma.user.update({
        where: { id: dto.childUserId },
        data: { isChildAccount: true },
      }),
    ]);

    return control;
  }

  async unlinkChild(parentUserId: string, childUserId: string, pin: string) {
    const control = await this.prisma.parentalControl.findFirst({
      where: { parentUserId, childUserId },
    });
    if (!control) {
      throw new NotFoundException('Parental control link not found');
    }

    const pinValid = await bcrypt.compare(pin, control.pin);
    if (!pinValid) {
      throw new ForbiddenException('Invalid PIN');
    }

    await this.prisma.$transaction([
      this.prisma.parentalControl.delete({
        where: { id: control.id },
      }),
      this.prisma.user.update({
        where: { id: childUserId },
        data: { isChildAccount: false },
      }),
    ]);

    return { success: true };
  }

  async getMyChildren(parentUserId: string) {
    const controls = await this.prisma.parentalControl.findMany({
      where: { parentUserId },
      include: {
        child: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isChildAccount: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return controls;
  }

  async getParentInfo(childUserId: string) {
    const control = await this.prisma.parentalControl.findUnique({
      where: { childUserId },
      include: {
        parent: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!control) {
      return null;
    }

    return {
      parentUser: control.parent,
      restrictedMode: control.restrictedMode,
      maxAgeRating: control.maxAgeRating,
      dailyLimitMinutes: control.dailyLimitMinutes,
      dmRestriction: control.dmRestriction,
      canGoLive: control.canGoLive,
      canPost: control.canPost,
      canComment: control.canComment,
    };
  }

  async updateControls(
    parentUserId: string,
    childUserId: string,
    dto: UpdateParentalControlDto,
  ) {
    const control = await this.prisma.parentalControl.findFirst({
      where: { parentUserId, childUserId },
    });
    if (!control) {
      throw new NotFoundException('Parental control link not found');
    }

    return this.prisma.parentalControl.update({
      where: { id: control.id },
      data: dto,
    });
  }

  async verifyPin(parentUserId: string, childUserId: string, pin: string) {
    const control = await this.prisma.parentalControl.findFirst({
      where: { parentUserId, childUserId },
    });
    if (!control) {
      throw new NotFoundException('Parental control link not found');
    }

    const isValid = await bcrypt.compare(pin, control.pin);
    return { valid: isValid };
  }

  async verifyPinForParent(parentUserId: string, pin: string) {
    const controls = await this.prisma.parentalControl.findMany({
      where: { parentUserId },
      take: 1,
    });
    if (controls.length === 0) {
      throw new NotFoundException('No parental controls found');
    }

    const isValid = await bcrypt.compare(pin, controls[0].pin);
    return { valid: isValid };
  }

  async changePin(
    parentUserId: string,
    childUserId: string,
    currentPin: string,
    newPin: string,
  ) {
    const control = await this.prisma.parentalControl.findFirst({
      where: { parentUserId, childUserId },
    });
    if (!control) {
      throw new NotFoundException('Parental control link not found');
    }

    const pinValid = await bcrypt.compare(currentPin, control.pin);
    if (!pinValid) {
      throw new ForbiddenException('Invalid current PIN');
    }

    const hashedPin = await bcrypt.hash(newPin, SALT_ROUNDS);

    return this.prisma.parentalControl.update({
      where: { id: control.id },
      data: { pin: hashedPin },
    });
  }

  async getRestrictions(childUserId: string) {
    const control = await this.prisma.parentalControl.findUnique({
      where: { childUserId },
    });

    if (!control) {
      return {
        isLinked: false,
        restrictedMode: false,
        maxAgeRating: 'R',
        dailyLimitMinutes: null,
        dmRestriction: 'none',
        canGoLive: true,
        canPost: true,
        canComment: true,
      };
    }

    return {
      isLinked: true,
      restrictedMode: control.restrictedMode,
      maxAgeRating: control.maxAgeRating,
      dailyLimitMinutes: control.dailyLimitMinutes,
      dmRestriction: control.dmRestriction,
      canGoLive: control.canGoLive,
      canPost: control.canPost,
      canComment: control.canComment,
    };
  }

  async getActivityDigest(parentUserId: string, childUserId: string) {
    const control = await this.prisma.parentalControl.findFirst({
      where: { parentUserId, childUserId },
    });
    if (!control) {
      throw new NotFoundException('Parental control link not found');
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [postsCount, messagesCount, screenTimeLogs] = await Promise.all([
      this.prisma.post.count({
        where: {
          userId: childUserId,
          createdAt: { gte: sevenDaysAgo },
        },
      }),
      this.prisma.message.count({
        where: {
          senderId: childUserId,
          createdAt: { gte: sevenDaysAgo },
        },
      }),
      this.prisma.screenTimeLog.findMany({
        where: {
          userId: childUserId,
          date: { gte: sevenDaysAgo },
        },
        orderBy: { date: 'asc' },
      }),
    ]);

    const totalScreenTimeMinutes = screenTimeLogs.reduce(
      (sum, log) => sum + Math.round(log.totalSeconds / 60),
      0,
    );

    const dailyBreakdown = screenTimeLogs.map((log) => ({
      date: log.date.toISOString().split('T')[0],
      minutes: Math.round(log.totalSeconds / 60),
      sessions: log.sessions,
    }));

    // Update lastDigestAt
    await this.prisma.parentalControl.update({
      where: { id: control.id },
      data: { lastDigestAt: new Date() },
    });

    return {
      period: {
        start: sevenDaysAgo.toISOString(),
        end: new Date().toISOString(),
      },
      postsCount,
      messagesCount,
      totalScreenTimeMinutes,
      dailyBreakdown,
    };
  }
}
